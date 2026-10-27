import { SqliteWhatsAppSchedulingDispatchStore } from './emp002-whatsapp-sqlite-dispatch-store';
import { normalizeEMP002WhatsAppNumber } from './emp002-whatsapp-normalize';
import type { WhatsAppSchedulingDispatchRecord } from './emp002-whatsapp-dispatch-store';
import type { RoutedWhatsAppInbound } from './emp002-whatsapp-endpoint';
import { dispatchSchedulingWhatsAppInbound } from './emp002-whatsapp-dispatcher';
import { SqliteEMP002WhatsAppConversationStore } from './emp002-whatsapp-conversation-store';
import { SqliteAppointmentLifecycleStore, type AppointmentLifecycleAction } from './emp002-appointment-lifecycle-store';
import { prepareDueAppointmentActions } from './emp002-appointment-action-processor';
import { executePreparedAppointmentAction } from './emp002-appointment-action-executor';
import { transitionAppointment, type AppointmentLifecycleEvent, type AppointmentLifecycleRecord } from './emp002-appointment-lifecycle';
import { generateEMP002CalendarReply, generateEMP002WhatsAppReply, parseEMP002OwnerCalendarCommand } from './emp002-whatsapp-ai';
import { buildEMP002CalendarReadTransport, buildEMP002CalendarTransport, buildEMP002OperationsTransports, buildEMP002WhatsAppTransport, type EMP002OperationsTransportEnv } from './emp002-operations-transports';
import { isEMP002CalendarReadIntent, resolveEMP002CalendarQueryWindow } from './emp002-calendar-query';
import { WorkforceCalendarStore, type WorkforceCalendarEntry } from './workforce-calendar-store';

export class EMP002Operations implements DurableObject {
  private readonly dispatchStore: SqliteWhatsAppSchedulingDispatchStore;
  private readonly conversationStore: SqliteEMP002WhatsAppConversationStore;
  private readonly appointmentStore: SqliteAppointmentLifecycleStore;
  private readonly nativeCalendar: WorkforceCalendarStore;
  // Durable per-tenant/message receipt: mutation is committed once, delivery can retry.
  private getNativeReceipt(tenantId: string, messageId: string): { reply: string; mode: string; recordId: string; version?: number } | undefined {
    const row = Array.from(this.state.storage.sql.exec('SELECT payload FROM emp002_native_receipts WHERE tenant_id = ? AND message_id = ?', tenantId, messageId))[0];
    return row ? JSON.parse(String(row.payload)) as { reply: string; mode: string; recordId: string; version?: number } : undefined;
  }
  private saveNativeReceipt(tenantId: string, messageId: string, receipt: { reply: string; mode: string; recordId: string; version?: number }): void {
    this.state.storage.sql.exec('INSERT OR IGNORE INTO emp002_native_receipts (tenant_id, message_id, payload) VALUES (?, ?, ?)', tenantId, messageId, JSON.stringify(receipt));
  }


  // Once a provider send starts, a lost response is ambiguous. Never resend blindly.
  private async sendNativeReplyOnce(tenantId: string, messageId: string, send: () => Promise<{ messageId: string | null }>): Promise<{ messageId: string }> {
    const rows = Array.from(this.state.storage.sql.exec('SELECT status, provider_message_id FROM emp002_native_outbound WHERE tenant_id = ? AND message_id = ?', tenantId, messageId));
    if (rows.length) {
      const prior = rows[0];
      if (prior.status === 'SENT' && typeof prior.provider_message_id === 'string' && prior.provider_message_id) return { messageId: prior.provider_message_id };
      throw new Error('EMP002_NATIVE_META_RECONCILIATION_REQUIRED');
    }
    this.state.storage.sql.exec('INSERT INTO emp002_native_outbound (tenant_id, message_id, status) VALUES (?, ?, ?)', tenantId, messageId, 'UNKNOWN');
    try {
      const result = await send();
      if (!result.messageId) throw new Error('EMP002_NATIVE_META_PROVIDER_EVIDENCE_MISSING');
      this.state.storage.sql.exec('UPDATE emp002_native_outbound SET status = ?, provider_message_id = ? WHERE tenant_id = ? AND message_id = ?', 'SENT', result.messageId, tenantId, messageId);
      return { messageId: result.messageId };
    } catch (error) {
      // Even a definite rejection is conservatively fenced pending operator review.
      throw new Error('EMP002_NATIVE_META_RECONCILIATION_REQUIRED', { cause: error });
    }
  }

  constructor(private readonly state: DurableObjectState, private readonly env: EMP002OperationsTransportEnv) {
    this.dispatchStore = new SqliteWhatsAppSchedulingDispatchStore(this.state.storage.sql);
    this.conversationStore = new SqliteEMP002WhatsAppConversationStore(this.state.storage.sql);
    this.appointmentStore = new SqliteAppointmentLifecycleStore(this.state.storage.sql);
    this.nativeCalendar = new WorkforceCalendarStore(this.state.storage.sql);
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS emp002_native_outbound (tenant_id TEXT NOT NULL, message_id TEXT NOT NULL, status TEXT NOT NULL, provider_message_id TEXT, PRIMARY KEY (tenant_id, message_id))');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS emp002_native_outbound_audit (tenant_id TEXT NOT NULL, message_id TEXT NOT NULL, provider_message_id TEXT NOT NULL, evidence_reference TEXT NOT NULL, actor TEXT NOT NULL, reconciled_at TEXT NOT NULL, PRIMARY KEY (tenant_id, message_id))');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS emp002_native_receipts (tenant_id TEXT NOT NULL, message_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, message_id))');
  }

  // Administrative recovery is internal-only, deny-by-default and evidence-gated.
  private reconcileOutbound(tenantId: string, messageId: string, providerMessageId: string, evidenceReference: string, actor: string): { ok: boolean; status: string } {
    return this.state.storage.transactionSync(() => {
      const rows = Array.from(this.state.storage.sql.exec('SELECT status, provider_message_id FROM emp002_native_outbound WHERE tenant_id = ? AND message_id = ?', tenantId, messageId));
      if (rows.length !== 1 || rows[0].status !== 'UNKNOWN') throw new Error('EMP002_RECONCILIATION_NOT_UNKNOWN');
      this.state.storage.sql.exec('UPDATE emp002_native_outbound SET status = ?, provider_message_id = ? WHERE tenant_id = ? AND message_id = ?', 'SENT', providerMessageId, tenantId, messageId);
      this.state.storage.sql.exec('INSERT INTO emp002_native_outbound_audit (tenant_id, message_id, provider_message_id, evidence_reference, actor, reconciled_at) VALUES (?, ?, ?, ?, ?, ?)', tenantId, messageId, providerMessageId, evidenceReference, actor, new Date().toISOString());
      return { ok: true, status: 'SENT' };
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return Response.json({ ok: true, service: 'EMP002Operations' });

    if (request.method === 'POST' && url.pathname === '/internal/meta-reconcile') {
      // A distinct secret, never the tenant header, authenticates the operator gateway.
      const expected = this.env.EMP002_RECONCILIATION_TOKEN?.trim();
      const supplied = request.headers.get('x-emp002-reconciliation-token');
      if (!expected || !supplied || supplied !== expected) return Response.json({ ok: false, error: 'RECONCILIATION_FORBIDDEN' }, { status: 403 });
      const tenantId = request.headers.get('x-herreb-internal-tenant-id')?.trim() ?? '';
      const actor = request.headers.get('x-herreb-reconciliation-actor')?.trim() ?? '';
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId) || !/^[a-zA-Z0-9@._-]{3,150}$/.test(actor)) return Response.json({ ok: false, error: 'INVALID_RECONCILIATION_SCOPE' }, { status: 403 });
      const body = await request.json<{ messageId?: string; providerMessageId?: string; evidenceReference?: string }>().catch((): { messageId?: string; providerMessageId?: string; evidenceReference?: string } => ({}));
      const messageId = body.messageId?.trim() ?? '';
      const providerMessageId = body.providerMessageId?.trim() ?? '';
      const evidenceReference = body.evidenceReference?.trim() ?? '';
      if (!/^wamid[.\w-]{4,255}$/.test(providerMessageId) || !/^[\w.:-]{4,255}$/.test(messageId) || evidenceReference.length < 12 || evidenceReference.length > 1024) return Response.json({ ok: false, error: 'RECONCILIATION_EVIDENCE_REQUIRED' }, { status: 422 });
      try { return Response.json(this.reconcileOutbound(tenantId, messageId, providerMessageId, evidenceReference, actor)); }
      catch { return Response.json({ ok: false, error: 'RECONCILIATION_CONFLICT' }, { status: 409 }); }
    }

    // Internal-only endpoint: public worker must authenticate and resolve the tenant
    // before forwarding. Never accept an arbitrary tenant from this payload.
    if (request.method === 'POST' && url.pathname === '/native-calendar') {
      const tenantId = request.headers.get('x-herreb-internal-tenant-id')?.trim();
      if (!tenantId || !/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId)) return Response.json({ ok: false, error: 'TENANT_SCOPE_REQUIRED' }, { status: 403 });
      const body = await request.json<{ operation?: string; id?: string; from?: string; to?: string; entry?: Omit<WorkforceCalendarEntry, 'version'>; expectedVersion?: number }>().catch((): { operation?: string; id?: string; from?: string; to?: string; entry?: Omit<WorkforceCalendarEntry, 'version'>; expectedVersion?: number } => ({}));
      if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ ok: false, error: 'INVALID_NATIVE_CALENDAR_BODY' }, { status: 400 });
      if (body.entry !== undefined && (!body.entry || typeof body.entry !== 'object' || Array.isArray(body.entry))) return Response.json({ ok: false, error: 'INVALID_NATIVE_CALENDAR_ENTRY' }, { status: 400 });
      if (body.entry?.tenantId && body.entry.tenantId !== tenantId) return Response.json({ ok: false, error: 'TENANT_MISMATCH' }, { status: 403 });
      try {
        if (body.operation === 'get' && body.id) return Response.json({ ok: true, entry: this.nativeCalendar.get(tenantId, body.id) ?? null });
        if (body.operation === 'reminders') return Response.json({ ok: true, entries: this.nativeCalendar.reminders(tenantId, new Date().toISOString()) });
        if (body.operation === 'list' && body.from && body.to) return Response.json({ ok: true, entries: this.nativeCalendar.list(tenantId, body.from, body.to) });
        if (body.operation === 'save' && body.entry && Number.isInteger(body.expectedVersion) && body.expectedVersion! >= 0) {
          const entry = this.nativeCalendar.save({ ...body.entry, tenantId }, body.expectedVersion);
          return Response.json({ ok: true, entry, readBackConfirmed: true });
        }
        return Response.json({ ok: false, error: 'INVALID_NATIVE_CALENDAR_OPERATION' }, { status: 400 });
      } catch (error) {
        const code = error instanceof Error ? error.message : 'NATIVE_CALENDAR_FAILED';
        return Response.json({ ok: false, error: code }, { status: code === 'CALENDAR_VERSION_CONFLICT' || code === 'CALENDAR_TIME_CONFLICT' ? 409 : 400 });
      }
    }


    if (request.method === 'POST' && url.pathname === '/appointment/register') {
      const record = await request.json<AppointmentLifecycleRecord>();
      if (!record?.tenantId || !record?.appointmentId || !record?.startsAt || !record?.state) return Response.json({ ok: false, error: 'INVALID_APPOINTMENT_RECORD' }, { status: 400 });
      try { return Response.json({ ok: true, record: this.appointmentStore.save(record, 0) }); }
      catch (error) { const code = error instanceof Error ? error.message : 'EMP002_APPOINTMENT_REGISTER_FAILED'; return Response.json({ ok: false, error: code }, { status: code === 'EMP002_APPOINTMENT_CONCURRENT_MODIFICATION' ? 409 : 400 }); }
    }

    if (request.method === 'POST' && url.pathname === '/appointment/transition') {
      const body = await request.json<{ tenantId?: string; appointmentId?: string; event?: AppointmentLifecycleEvent; expectedVersion?: number; at?: string }>();
      if (!body?.tenantId || !body?.appointmentId || !body?.event) return Response.json({ ok: false, error: 'INVALID_APPOINTMENT_TRANSITION_REQUEST' }, { status: 400 });
      try {
        const current = this.appointmentStore.load(body.tenantId, body.appointmentId);
        if (!current) return Response.json({ ok: false, error: 'APPOINTMENT_NOT_FOUND' }, { status: 404 });
        const next = transitionAppointment(current, body.event, body.at);
        return Response.json({ ok: true, record: this.appointmentStore.save(next, body.expectedVersion ?? current.version) });
      } catch (error) { const code = error instanceof Error ? error.message : 'EMP002_APPOINTMENT_TRANSITION_FAILED'; return Response.json({ ok: false, error: code }, { status: code === 'EMP002_APPOINTMENT_CONCURRENT_MODIFICATION' ? 409 : 400 }); }
    }

    if (request.method === 'POST' && url.pathname === '/appointment/actions/schedule') {
      const action = await request.json<AppointmentLifecycleAction>();
      if (!action?.tenantId || !action?.appointmentId || !action?.actionKey || !action?.kind || !action?.dueAt) return Response.json({ ok: false, error: 'INVALID_APPOINTMENT_ACTION' }, { status: 400 });
      const appointment = this.appointmentStore.load(action.tenantId, action.appointmentId);
      if (!appointment) return Response.json({ ok: false, error: 'APPOINTMENT_NOT_FOUND' }, { status: 404 });
      try {
        this.appointmentStore.scheduleAction(action);
        return Response.json({ ok: true, status: 'SCHEDULED', action });
      } catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : 'EMP002_APPOINTMENT_ACTION_SCHEDULE_FAILED' }, { status: 400 }); }
    }

    if (request.method === 'POST' && url.pathname === '/appointment/actions/prepare') {
      const body = await request.json<{ tenantId?: string; now?: string; limit?: number; actionKey?: string }>();
      if (!body?.tenantId) return Response.json({ ok: false, error: 'TENANT_REQUIRED' }, { status: 400 });
      try {
        const actions = prepareDueAppointmentActions(this.appointmentStore, body.tenantId, body.now, body.limit, body.actionKey);
        return Response.json({ ok: true, status: 'PREPARED', count: actions.length, actions });
      } catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : 'EMP002_APPOINTMENT_ACTION_PREPARE_FAILED' }, { status: 400 }); }
    }

    if (request.method === 'POST' && url.pathname === '/appointment/actions/execute') {
      const body = await request.json<{ tenantId?: string; now?: string; limit?: number; actionKey?: string }>();
      if (!body?.tenantId) return Response.json({ ok: false, error: 'TENANT_REQUIRED' }, { status: 400 });
      try {
        const prepared = prepareDueAppointmentActions(this.appointmentStore, body.tenantId, body.now, body.limit, body.actionKey);
        const whatsapp = buildEMP002WhatsAppTransport(this.env, body.tenantId);
        const results = [];
        for (const item of prepared) {
          const result = await executePreparedAppointmentAction(item, whatsapp);
          if (result.status === 'EXECUTED') this.appointmentStore.completeActionClaim(body.tenantId, item.action.actionKey);
          else this.appointmentStore.releaseActionClaim(body.tenantId, item.action.actionKey);
          results.push(result);
        }
        const executed = results.filter((result) => result.status === 'EXECUTED').length;
        const retryable = results.length - executed;
        return Response.json({ ok: retryable === 0, status: retryable === 0 ? 'EXECUTED' : 'PARTIAL', prepared: prepared.length, executed, retryable, results }, { status: retryable === 0 ? 200 : 503 });
      } catch (error) {
        return Response.json({ ok: false, status: 'FAILED_RETRYABLE', error: error instanceof Error ? error.message : 'EMP002_APPOINTMENT_ACTION_EXECUTION_FAILED' }, { status: 503 });
      }
    }

    if (request.method === 'POST' && url.pathname === '/dispatch/register') {
      const record = await request.json<WhatsAppSchedulingDispatchRecord>();
      if (!record?.tenantId || !record?.contactId || !record?.whatsapp) return Response.json({ ok: false, error: 'INVALID_DISPATCH_RECORD' }, { status: 400 });
      await this.dispatchStore.save(record); return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/dispatch/read') {
      const body = await request.json<{ tenantId?: string; whatsapp?: string }>();
      if (!body?.tenantId || !body?.whatsapp) return Response.json({ ok: false, error: 'TENANT_AND_WHATSAPP_REQUIRED' }, { status: 400 });
      const record = await this.dispatchStore.findByWhatsapp(body.tenantId, body.whatsapp);
      return Response.json({ ok: true, record: record ?? null });
    }

    if (request.method === 'POST' && url.pathname === '/dispatch/lookup') {
      const body = await request.json<{ tenantId?: string; whatsapp?: string }>();
      if (!body?.tenantId || !body?.whatsapp) return Response.json({ ok: false, error: 'TENANT_AND_WHATSAPP_REQUIRED' }, { status: 400 });
      const record = await this.dispatchStore.findActiveByWhatsapp(body.tenantId, body.whatsapp); return Response.json({ ok: true, record: record ?? null });
    }

    if (request.method === 'POST' && url.pathname === '/inbound/whatsapp') {
      // Until native tenant-owned conversational calendar is wired, do not allow
      // the legacy CRM calendar transport to process WhatsApp requests.
      // General conversation stays available only outside calendar-capable paths.
      const message = await request.json<RoutedWhatsAppInbound>().catch(() => null);
      if (!message || typeof message.body !== 'string') return Response.json({ ok: false, error: 'INVALID_WHATSAPP_INBOUND' }, { status: 400 });
      if (!message?.tenantId || !message?.from || !message?.messageId || typeof message.body !== 'string') return Response.json({ ok: false, error: 'INVALID_WHATSAPP_INBOUND' }, { status: 400 });
      const calendarRequested = isEMP002CalendarReadIntent(message.body) || /agenda|agendar|agend[aá]|reuni[oó]n|reuniones|citas?|calendario|recordatorios?|reservar|reprogramar|cancelar turno|turnos?/i.test(message.body);
      if (calendarRequested) {
        const manifests = (() => { try { return JSON.parse(this.env.TENANT_MANIFESTS_JSON ?? '[]') as Array<{ tenantId?: string; whatsappOwners?: string[] }>; } catch { return []; } })();
        const owners = (manifests.find(m => m.tenantId?.trim() === message.tenantId)?.whatsappOwners ?? []).map(normalizeEMP002WhatsAppNumber);
        if (!owners.includes(normalizeEMP002WhatsAppNumber(message.from))) return Response.json({ ok: false, handled: false, error: 'EMP002_OWNER_VERIFICATION_FAILED' }, { status: 403 });
        // Owner-only native calendar path. Never fall through to legacy CRM transports.
        const receipt = this.getNativeReceipt(message.tenantId, message.messageId);
        if (receipt) {
          try {
            if (receipt.recordId) {
              const persisted = this.nativeCalendar.get(message.tenantId, receipt.recordId);
              if (!persisted || (receipt.version !== undefined && persisted.version !== receipt.version) || (receipt.mode === 'native-calendar-cancel' && persisted.status !== 'CANCELLED') || (receipt.mode === 'native-calendar-create' && persisted.status !== 'ACTIVE')) {
                return Response.json({ ok: false, handled: false, error: 'EMP002_NATIVE_RECEIPT_READBACK_MISMATCH' }, { status: 409 });
              }
            }
            const whatsapp = buildEMP002WhatsAppTransport(this.env, message.tenantId);
            const outbound = await this.sendNativeReplyOnce(message.tenantId, message.messageId, () => whatsapp.sendText({ tenantId: message.tenantId, to: message.from, body: receipt.reply, audience: 'EXTERNAL_CONTACT', correlationId: `wa:${message.messageId}`, idempotencyKey: `emp002-${receipt.mode === 'native-calendar-update' ? 'native-update' : receipt.mode === 'native-calendar-cancel' ? 'native-cancel' : receipt.mode}:${message.messageId}` }));
            return Response.json({ ok: true, handled: true, mode: receipt.mode, recovered: true, readBackConfirmed: true, outboundMessageId: outbound.messageId });
          } catch (error) {
            return Response.json({ ok: false, handled: false, error: error instanceof Error ? error.message : 'EMP002_NATIVE_DELIVERY_RETRY_FAILED' }, { status: 503 });
          }
        }
        const command = await parseEMP002OwnerCalendarCommand(this.env.AI, message.body, new Date().toISOString()).catch(() => ({ operation: 'none' as const }));
        if (command.operation === 'update' || command.operation === 'delete') {
          const window = resolveEMP002CalendarQueryWindow(message.body, new Date());
          const tokens = command.query.toLocaleLowerCase('es').split(/\s+/).filter(token => token.length > 2);
          const matches = this.nativeCalendar.list(message.tenantId, window.timeMin, window.timeMax)
            .filter(entry => entry.status === 'ACTIVE' && tokens.length > 0 && tokens.some(token => entry.title.toLocaleLowerCase('es').includes(token)));
          if (matches.length !== 1) return Response.json({ ok: false, handled: false, error: matches.length ? 'EMP002_NATIVE_CALENDAR_AMBIGUOUS_TARGET' : 'EMP002_NATIVE_CALENDAR_TARGET_NOT_FOUND' }, { status: 422 });
          const target = matches[0];
          if (command.operation === 'update') {
            const changes = command.changes as Record<string, string>;
            // Reject CRM-only date fragments: native calendar needs complete instants.
            if (changes.startDate || changes.endDate || (changes.startTime && !Number.isFinite(Date.parse(changes.startTime))) || (changes.endTime && !Number.isFinite(Date.parse(changes.endTime)))) return Response.json({ ok: false, handled: false, error: 'EMP002_NATIVE_CALENDAR_UPDATE_REQUIRES_ISO_INSTANTS' }, { status: 422 });
            const start = changes.startTime ? new Date(changes.startTime).toISOString() : target.startsAt;
            const end = changes.endTime ? new Date(changes.endTime).toISOString() : target.endsAt;
            if (!end || Date.parse(end) <= Date.parse(start)) return Response.json({ ok: false, handled: false, error: 'INVALID_CALENDAR_TIME_RANGE' }, { status: 422 });
            const first = await this.conversationStore.markInboundOnce(message.tenantId, message.messageId, message.receivedAt);
            if (!first) return Response.json({ ok: true, handled: true, duplicate: true, mode: 'native-calendar-update' });
            try {
              const updated = this.state.storage.transactionSync(() => {
                const saved = this.nativeCalendar.save({ ...target, title: changes.title ?? target.title, startsAt: start, endsAt: end, updatedAt: new Date().toISOString() }, target.version);
                this.saveNativeReceipt(message.tenantId, message.messageId, { reply: `Actualicé "${saved.title}" y confirmé el cambio en el calendario de Workforce.`, mode: 'native-calendar-update', recordId: saved.id, version: saved.version });
                return saved;
              });
              const readBack = this.nativeCalendar.get(message.tenantId, target.id);
              if (!readBack || readBack.version !== updated.version || readBack.title !== updated.title || readBack.startsAt !== updated.startsAt || readBack.endsAt !== updated.endsAt) throw new Error('EMP002_NATIVE_CALENDAR_UPDATE_READBACK_FAILED');
              const whatsapp = buildEMP002WhatsAppTransport(this.env, message.tenantId);
              const outbound = await this.sendNativeReplyOnce(message.tenantId, message.messageId, () => whatsapp.sendText({ tenantId: message.tenantId, to: message.from, body: `Actualicé "${updated.title}" y confirmé el cambio en el calendario de Workforce.`, audience: 'EXTERNAL_CONTACT', correlationId: `wa:${message.messageId}`, idempotencyKey: `emp002-native-update:${message.messageId}` }));
              return Response.json({ ok: true, handled: true, mode: 'native-calendar-update', readBackConfirmed: true, outboundMessageId: outbound.messageId });
            } catch (error) {
              await this.conversationStore.releaseInboundForRetry(message.tenantId, message.messageId);
              return Response.json({ ok: false, handled: false, error: error instanceof Error ? error.message : 'EMP002_NATIVE_CALENDAR_UPDATE_FAILED' }, { status: 503 });
            }
          }
          const first = await this.conversationStore.markInboundOnce(message.tenantId, message.messageId, message.receivedAt);
          if (!first) return Response.json({ ok: true, handled: true, duplicate: true, mode: 'native-calendar-cancel' });
          try {
            const cancelled = this.state.storage.transactionSync(() => {
              const saved = this.nativeCalendar.save({ ...target, status: 'CANCELLED', updatedAt: new Date().toISOString() }, target.version);
              this.saveNativeReceipt(message.tenantId, message.messageId, { reply: `Cancelé "${target.title}" y confirmé el cambio en el calendario de Workforce.`, mode: 'native-calendar-cancel', recordId: target.id, version: saved.version });
              return saved;
            });
            const readBack = this.nativeCalendar.get(message.tenantId, target.id);
            if (!readBack || readBack.version !== cancelled.version || readBack.status !== 'CANCELLED') throw new Error('EMP002_NATIVE_CALENDAR_CANCEL_READBACK_FAILED');
            const whatsapp = buildEMP002WhatsAppTransport(this.env, message.tenantId);
            const outbound = await this.sendNativeReplyOnce(message.tenantId, message.messageId, () => whatsapp.sendText({ tenantId: message.tenantId, to: message.from, body: `Cancelé "${target.title}" y confirmé el cambio en el calendario de Workforce.`, audience: 'EXTERNAL_CONTACT', correlationId: `wa:${message.messageId}`, idempotencyKey: `emp002-native-cancel:${message.messageId}` }));
            return Response.json({ ok: true, handled: true, mode: 'native-calendar-cancel', readBackConfirmed: true, outboundMessageId: outbound.messageId });
          } catch (error) {
            await this.conversationStore.releaseInboundForRetry(message.tenantId, message.messageId);
            return Response.json({ ok: false, handled: false, error: error instanceof Error ? error.message : 'EMP002_NATIVE_CALENDAR_CANCEL_FAILED' }, { status: 503 });
          }
        }
        if (command.operation === 'none' && !isEMP002CalendarReadIntent(message.body)) return Response.json({ ok: false, handled: false, error: 'EMP002_NATIVE_CALENDAR_COMMAND_AMBIGUOUS' }, { status: 422 });
        const first = await this.conversationStore.markInboundOnce(message.tenantId, message.messageId, message.receivedAt);
        if (!first) return Response.json({ ok: true, handled: true, duplicate: true, mode: 'native-calendar' });
        try {
          let reply: string;
          let mode: string;
          if (command.operation === 'create') {
            const id = `wa-${message.messageId}`;
            const start = new Date(command.startTime).toISOString();
            const end = new Date(command.endTime).toISOString();
            const existing = this.nativeCalendar.get(message.tenantId, id);
            if (existing && (existing.title !== command.title || existing.startsAt !== start || existing.endsAt !== end || existing.status !== 'ACTIVE')) throw new Error('EMP002_NATIVE_CALENDAR_IDEMPOTENCY_MISMATCH');
            const entry = this.state.storage.transactionSync(() => {
              const saved = existing ?? this.nativeCalendar.save({ tenantId: message.tenantId, id, kind: 'MEETING', title: command.title, startsAt: start, endsAt: end, status: 'ACTIVE', updatedAt: new Date().toISOString() }, 0);
              this.saveNativeReceipt(message.tenantId, message.messageId, { reply: `Agendé "${saved.title}" para ${saved.startsAt} y confirmé que quedó guardada en el calendario de Workforce.`, mode: 'native-calendar-create', recordId: id, version: saved.version });
              return saved;
            });
            const readBack = this.nativeCalendar.get(message.tenantId, id);
            if (!readBack || JSON.stringify(entry) !== JSON.stringify(readBack)) throw new Error('EMP002_NATIVE_CALENDAR_READBACK_FAILED');
            reply = `Agendé "${entry.title}" para ${entry.startsAt} y confirmé que quedó guardada en el calendario de Workforce.`;
            mode = 'native-calendar-create';
          } else {
            const window = resolveEMP002CalendarQueryWindow(message.body, new Date());
            const entries = this.nativeCalendar.list(message.tenantId, window.timeMin, window.timeMax);
            reply = entries.length ? `Tu agenda de Workforce: ${entries.map(entry => `${entry.title} (${entry.startsAt})`).join('; ')}` : 'No tenés reuniones registradas en Workforce para ese período.';
            mode = 'native-calendar-read';
          }
          if (command.operation !== 'create') this.saveNativeReceipt(message.tenantId, message.messageId, { reply, mode, recordId: '' });
          const whatsapp = buildEMP002WhatsAppTransport(this.env, message.tenantId);
          const outbound = await this.sendNativeReplyOnce(message.tenantId, message.messageId, () => whatsapp.sendText({ tenantId: message.tenantId, to: message.from, body: reply, audience: 'EXTERNAL_CONTACT', correlationId: `wa:${message.messageId}`, idempotencyKey: `emp002-${mode}:${message.messageId}` }));
          await this.conversationStore.append(message.tenantId, message.from, { role: 'assistant', content: reply, at: new Date().toISOString(), messageId: outbound.messageId ?? undefined });
          return Response.json({ ok: true, handled: true, mode, readBackConfirmed: true, outboundMessageId: outbound.messageId });
        } catch (error) {
          await this.conversationStore.releaseInboundForRetry(message.tenantId, message.messageId);
          const code = error instanceof Error ? error.message : 'EMP002_NATIVE_CALENDAR_FAILED';
          return Response.json({ ok: false, handled: false, error: code }, { status: code === 'CALENDAR_TIME_CONFLICT' || code === 'CALENDAR_VERSION_CONFLICT' ? 409 : 503 });
        }
      }
      const record = await this.dispatchStore.findActiveByWhatsapp(message.tenantId, message.from);
      if (!record) {
        try {
          const isNew = await this.conversationStore.markInboundOnce(message.tenantId, message.messageId, message.receivedAt);
          if (!isNew) return Response.json({ ok: true, handled: true, duplicate: true, mode: 'general-conversation' });
          const conversation = await this.conversationStore.append(message.tenantId, message.from, { role: 'user', content: message.body, at: message.receivedAt, messageId: message.messageId });
          const correlationId = `wa:${message.messageId}`;
          const whatsapp = buildEMP002WhatsAppTransport(this.env, message.tenantId);
          const calendarIntent = isEMP002CalendarReadIntent(message.body);
          const normalizeWhatsApp = normalizeEMP002WhatsAppNumber;
          const manifests = (() => {
            try {
              return JSON.parse(this.env.TENANT_MANIFESTS_JSON ?? '[]') as Array<{ tenantId?: string; whatsappOwners?: string[] }>;
            } catch {
              return [];
            }
          })();
          const tenantManifest = manifests.find((manifest) => manifest.tenantId?.trim() === message.tenantId);
          const owners = (tenantManifest?.whatsappOwners ?? []).map(normalizeWhatsApp).filter(Boolean);
          const ownerConfigured = owners.length > 0;
          const ownerVerified = owners.includes(normalizeWhatsApp(message.from));
          console.log(JSON.stringify({ event: 'EMP002_ROUTING_DECISION', correlationId, tenantId: message.tenantId, calendarIntent, ownerConfigured, ownerVerified, route: calendarIntent ? (ownerVerified ? 'calendar-read' : 'owner-verification-failed') : 'general-conversation' }));
          if (calendarIntent && !ownerVerified) { await this.conversationStore.releaseInboundForRetry(message.tenantId, message.messageId); return Response.json({ ok: false, handled: false, mode: 'owner-verification-failed', error: 'EMP002_OWNER_VERIFICATION_FAILED', correlationId, routing: { calendarIntent, ownerConfigured, ownerVerified } }, { status: 403 }); }
          let reply: string; let mode = 'general-conversation';
          // Calendar reads are deterministic and must not wait for the AI mutation
          // parser. Route verified owner READ intents directly to CRM first.
          if (calendarIntent && ownerVerified) {
            const calendar = buildEMP002CalendarReadTransport(this.env, message.tenantId);
            const window = resolveEMP002CalendarQueryWindow(message.body, new Date());
            const calendarResult = await calendar.execute({ tenantId: message.tenantId, request: { operation: 'search', timeMin: window.timeMin, timeMax: window.timeMax }, correlationId });
            if (!calendarResult.ok) throw new Error(`EMP002_CALENDAR_READ_FAILED:${calendarResult.error?.code ?? 'EMP002_CALENDAR_READ_FAILED'}`);
            // Ground the natural-language reply with the exact resolved window.
            // The model must not infer "today/tomorrow" from its own clock.
            const groundedQuestion = `${message.body}\nResolved calendar period: ${window.timeMin} to ${window.timeMax} (exclusive).`;
            reply = await generateEMP002CalendarReply(this.env.AI, groundedQuestion, calendarResult.output);
            mode = 'calendar-read';
          } else {
          const ownerCommand = ownerVerified ? await parseEMP002OwnerCalendarCommand(this.env.AI, message.body, new Date().toISOString()) : { operation: 'none' as const };
          if (ownerCommand.operation !== 'none') {
            const readCalendar = buildEMP002CalendarReadTransport(this.env, message.tenantId);
            const writeCalendar = buildEMP002CalendarTransport(this.env, message.tenantId);
            if (ownerCommand.operation === 'create') {
              const write = await writeCalendar.execute({ tenantId: message.tenantId, request: ownerCommand, correlationId, idempotencyKey: `emp002-owner:create:${message.messageId}` });
              if (!write.ok) throw new Error(`EMP002_OWNER_CALENDAR_WRITE_FAILED:${write.error?.code ?? 'CREATE_FAILED'}:HTTP_${String(write.evidence?.upstreamStatus ?? 'UNKNOWN')}:UPSTREAM_${String(write.evidence?.upstreamErrorCode ?? 'UNKNOWN')}`);
              const output = write.output as { data?: { id?: string | number }; record?: { id?: string | number }; persistenceConfirmed?: boolean; saved?: boolean };
              const id = output.data?.id ?? output.record?.id;
              if (!id) throw new Error('EMP002_OWNER_CALENDAR_CREATE_ID_MISSING');
              const readBack = await readCalendar.execute({ tenantId: message.tenantId, request: { operation: 'search', timeMin: ownerCommand.startTime, timeMax: ownerCommand.endTime }, correlationId: `${correlationId}:readback` });
              if (!readBack.ok) throw new Error('EMP002_OWNER_CALENDAR_READBACK_FAILED');
              const readBackRecords = (readBack.output as { data?: Array<Record<string, unknown>> })?.data ?? [];
              if (!readBackRecords.some((item) => String(item.id ?? '') === String(id))) {
                const date = ownerCommand.startTime.slice(0, 10);
                const exactReadBack = await readCalendar.execute({ tenantId: message.tenantId, request: { operation: 'search', timeMin: `${date}T00:00:00-03:00`, timeMax: `${date}T23:59:59-03:00` }, correlationId: `${correlationId}:readback-date` });
                if (!exactReadBack.ok) throw new Error('EMP002_OWNER_CALENDAR_READBACK_FAILED');
                const exactRecords = (exactReadBack.output as { data?: Array<Record<string, unknown>> })?.data ?? [];
                if (!exactRecords.some((item) => String(item.id ?? '') === String(id))) throw new Error('EMP002_OWNER_CALENDAR_CREATE_READBACK_NOT_CONFIRMED');
              }
              reply = `Hecho. Creé "${ownerCommand.title}" y confirmé su persistencia en el CRM.`;
              mode = 'calendar-create';
            } else {
              const window = resolveEMP002CalendarQueryWindow(message.body, new Date());
              const lookup = await readCalendar.execute({ tenantId: message.tenantId, request: { operation: 'search', timeMin: window.timeMin, timeMax: window.timeMax, query: ownerCommand.query }, correlationId: `${correlationId}:lookup` });
              if (!lookup.ok) throw new Error('EMP002_OWNER_CALENDAR_LOOKUP_FAILED');
              const records = ((lookup.output as { data?: Array<Record<string, unknown>> })?.data ?? []).filter((item) => {
                const haystack = [item.title, item.notes].filter((v) => typeof v === 'string').join(' ').toLocaleLowerCase('es');
                return ownerCommand.query.toLocaleLowerCase('es').split(/\s+/).filter((token) => token.length > 2).some((token) => haystack.includes(token));
              });
              if (records.length !== 1) {
                reply = records.length === 0 ? 'No encontré una única reunión que coincida. Decime el título y la fecha.' : 'Encontré más de una reunión posible. Decime cuál querés modificar.';
                mode = 'calendar-ambiguous';
              } else {
                const id = String(records[0].id ?? '');
                if (!id) throw new Error('EMP002_OWNER_CALENDAR_TARGET_ID_MISSING');
                const request = ownerCommand.operation === 'delete' ? { operation: 'delete' as const, eventId: id } : { operation: 'update' as const, eventId: id, changes: ownerCommand.changes };
                const write = await writeCalendar.execute({ tenantId: message.tenantId, request, correlationId, idempotencyKey: `emp002-owner:${ownerCommand.operation}:${message.messageId}` });
                if (!write.ok) throw new Error(`EMP002_OWNER_CALENDAR_WRITE_FAILED:${write.error?.code ?? ownerCommand.operation.toUpperCase() + '_FAILED'}`);
                const verify = await readCalendar.execute({ tenantId: message.tenantId, request: { operation: 'search', timeMin: window.timeMin, timeMax: window.timeMax }, correlationId: `${correlationId}:readback` });
                if (!verify.ok) throw new Error('EMP002_OWNER_CALENDAR_READBACK_FAILED');
                const after = (verify.output as { data?: Array<Record<string, unknown>> })?.data ?? [];
                const persisted = after.find((item) => String(item.id ?? '') === id);
                if (ownerCommand.operation === 'delete' ? Boolean(persisted) : !persisted) throw new Error('EMP002_OWNER_CALENDAR_PERSISTENCE_NOT_CONFIRMED');
                if (ownerCommand.operation === 'update' && persisted) {
                  const changes = ownerCommand.changes as Record<string, unknown>;
                  // A matching ID does not certify an update: verify each requested field.
                  if (!Object.entries(changes).every(([field, value]) => JSON.stringify(persisted[field]) === JSON.stringify(value))) {
                    throw new Error('EMP002_OWNER_CALENDAR_UPDATE_READBACK_MISMATCH');
                  }
                }
                reply = ownerCommand.operation === 'delete' ? 'Hecho. Cancelé la reunión y confirmé el cambio en el CRM.' : 'Hecho. Reprogramé la reunión y confirmé el cambio en el CRM.';
                mode = ownerCommand.operation === 'delete' ? 'calendar-delete' : 'calendar-update';
              }
            }
          } else reply = await generateEMP002WhatsAppReply(this.env.AI, conversation);
          }
          const outbound = await this.sendNativeReplyOnce(message.tenantId, message.messageId, () => whatsapp.sendText({ tenantId: message.tenantId, to: message.from, body: reply, audience: 'EXTERNAL_CONTACT', correlationId, idempotencyKey: `emp002-${mode}:${message.messageId}` }));
          const saved = await this.conversationStore.append(message.tenantId, message.from, { role: 'assistant', content: reply, at: new Date().toISOString(), messageId: outbound.messageId ?? undefined });
          return Response.json({ ok: true, handled: true, mode, provider: 'meta-cloud-api', outboundMessageId: outbound.messageId, correlationId, historyLength: saved.messages.length });
        } catch (error) { const code = error instanceof Error ? error.message : 'EMP002_GENERAL_CONVERSATION_FAILED'; return Response.json({ ok: false, handled: false, mode: 'general-conversation', error: code }, { status: code === 'EMP002_OPERATIONS_TENANT_SCOPE_MISMATCH' ? 403 : 503 }); }
      }
      try {
        const transports = buildEMP002OperationsTransports(this.env, message.tenantId);
        const result = await dispatchSchedulingWhatsAppInbound({ message, store: this.dispatchStore, calendar: transports.calendar, whatsapp: transports.whatsapp });
        return Response.json({ ok: true, ...result });
      } catch (error) { const code = error instanceof Error ? error.message : 'EMP002_OPERATIONS_EXECUTION_FAILED'; return Response.json({ ok: false, error: code }, { status: code === 'EMP002_OPERATIONS_TENANT_SCOPE_MISMATCH' ? 403 : 503 }); }
    }
    return new Response('Not found', { status: 404 });
  }
}
