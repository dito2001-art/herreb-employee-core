import { SqliteWhatsAppSchedulingDispatchStore } from './emp002-whatsapp-sqlite-dispatch-store';
import type { WhatsAppSchedulingDispatchRecord } from './emp002-whatsapp-dispatch-store';
import type { RoutedWhatsAppInbound } from './emp002-whatsapp-endpoint';
import { dispatchSchedulingWhatsAppInbound } from './emp002-whatsapp-dispatcher';
import { SqliteEMP002WhatsAppConversationStore } from './emp002-whatsapp-conversation-store';
import { generateEMP002CalendarReply, generateEMP002WhatsAppReply } from './emp002-whatsapp-ai';
import { buildEMP002CalendarReadTransport, buildEMP002OperationsTransports, buildEMP002WhatsAppTransport, type EMP002OperationsTransportEnv } from './emp002-operations-transports';
import { isEMP002CalendarReadIntent, isVerifiedEMP002Owner, resolveEMP002CalendarQueryWindow } from './emp002-calendar-query';

export class EMP002Operations implements DurableObject {
  private readonly dispatchStore: SqliteWhatsAppSchedulingDispatchStore;
  private readonly conversationStore: SqliteEMP002WhatsAppConversationStore;

  constructor(private readonly state: DurableObjectState, private readonly env: EMP002OperationsTransportEnv) {
    this.dispatchStore = new SqliteWhatsAppSchedulingDispatchStore(this.state.storage.sql);
    this.conversationStore = new SqliteEMP002WhatsAppConversationStore(this.state.storage.sql);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, service: 'EMP002Operations' });
    }

    if (request.method === 'POST' && url.pathname === '/dispatch/register') {
      const record = await request.json<WhatsAppSchedulingDispatchRecord>();
      if (!record?.tenantId || !record?.contactId || !record?.whatsapp) return Response.json({ ok: false, error: 'INVALID_DISPATCH_RECORD' }, { status: 400 });
      await this.dispatchStore.save(record);
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/dispatch/lookup') {
      const body = await request.json<{ tenantId?: string; whatsapp?: string }>();
      if (!body?.tenantId || !body?.whatsapp) return Response.json({ ok: false, error: 'TENANT_AND_WHATSAPP_REQUIRED' }, { status: 400 });
      const record = await this.dispatchStore.findActiveByWhatsapp(body.tenantId, body.whatsapp);
      return Response.json({ ok: true, record: record ?? null });
    }

    if (request.method === 'POST' && url.pathname === '/inbound/whatsapp') {
      const message = await request.json<RoutedWhatsAppInbound>();
      if (!message?.tenantId || !message?.from || !message?.messageId || typeof message.body !== 'string') {
        return Response.json({ ok: false, error: 'INVALID_WHATSAPP_INBOUND' }, { status: 400 });
      }

      const record = await this.dispatchStore.findActiveByWhatsapp(message.tenantId, message.from);
      if (!record) {
        try {
          const isNew = await this.conversationStore.markInboundOnce(message.tenantId, message.messageId, message.receivedAt);
          if (!isNew) return Response.json({ ok: true, handled: true, duplicate: true, mode: 'general-conversation' });
          const conversation = await this.conversationStore.append(message.tenantId, message.from, {
            role: 'user',
            content: message.body,
            at: message.receivedAt,
            messageId: message.messageId,
          });
          const correlationId = `wa:${message.messageId}`;
          const whatsapp = buildEMP002WhatsAppTransport(this.env, message.tenantId);

          const calendarIntent = isEMP002CalendarReadIntent(message.body);
          const ownerConfigured = Boolean(this.env.EMP002_OWNER_WHATSAPP?.trim());
          const ownerVerified = isVerifiedEMP002Owner(message.from, this.env.EMP002_OWNER_WHATSAPP);
          console.log(JSON.stringify({ event: 'EMP002_ROUTING_DECISION', correlationId, tenantId: message.tenantId, calendarIntent, ownerConfigured, ownerVerified, route: calendarIntent ? (ownerVerified ? 'calendar-read' : 'owner-verification-failed') : 'general-conversation' }));

          if (calendarIntent && !ownerVerified) {
            return Response.json({ ok: false, handled: false, mode: 'owner-verification-failed', error: 'EMP002_OWNER_VERIFICATION_FAILED', correlationId, routing: { calendarIntent, ownerConfigured, ownerVerified } }, { status: 403 });
          }

          let reply: string;
          let mode = 'general-conversation';
          if (calendarIntent && ownerVerified) {
            const calendar = buildEMP002CalendarReadTransport(this.env, message.tenantId);
            const window = resolveEMP002CalendarQueryWindow(message.body, new Date(message.receivedAt));
            const calendarResult = await calendar.execute({
              tenantId: message.tenantId,
              request: { operation: 'search', timeMin: window.timeMin, timeMax: window.timeMax },
              correlationId,
            });
            if (!calendarResult.ok) {
              const errorCode = calendarResult.error?.code ?? 'EMP002_CALENDAR_READ_FAILED';
              throw new Error(`EMP002_CALENDAR_READ_FAILED:${errorCode}`);
            }
            reply = await generateEMP002CalendarReply(this.env.AI, message.body, calendarResult.output);
            mode = 'calendar-read';
          } else {
            reply = await generateEMP002WhatsAppReply(this.env.AI, conversation);
          }

          const outbound = await whatsapp.sendText({
            tenantId: message.tenantId,
            to: message.from,
            body: reply,
            audience: 'EXTERNAL_CONTACT',
            correlationId,
            idempotencyKey: `emp002-${mode}:${message.messageId}`,
          });
          const saved = await this.conversationStore.append(message.tenantId, message.from, {
            role: 'assistant',
            content: reply,
            at: new Date().toISOString(),
            messageId: outbound.messageId ?? undefined,
          });
          return Response.json({
            ok: true,
            handled: true,
            mode,
            provider: outbound.provider,
            outboundMessageId: outbound.messageId,
            correlationId,
            historyLength: saved.messages.length,
          });
        } catch (error) {
          const code = error instanceof Error ? error.message : 'EMP002_GENERAL_CONVERSATION_FAILED';
          const status = code === 'EMP002_OPERATIONS_TENANT_SCOPE_MISMATCH' ? 403 : 503;
          return Response.json({ ok: false, handled: false, mode: 'general-conversation', error: code }, { status });
        }
      }

      try {
        const transports = buildEMP002OperationsTransports(this.env, message.tenantId);
        const result = await dispatchSchedulingWhatsAppInbound({
          message,
          store: this.dispatchStore,
          calendar: transports.calendar,
          whatsapp: transports.whatsapp,
        });
        return Response.json({ ok: true, ...result });
      } catch (error) {
        const code = error instanceof Error ? error.message : 'EMP002_OPERATIONS_EXECUTION_FAILED';
        const status = code === 'EMP002_OPERATIONS_TENANT_SCOPE_MISMATCH' ? 403 : 503;
        return Response.json({ ok: false, error: code }, { status });
      }
    }

    return new Response('Not found', { status: 404 });
  }
}
