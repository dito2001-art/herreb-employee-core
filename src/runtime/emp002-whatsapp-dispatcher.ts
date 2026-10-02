import type { CalendarTransport } from '../adapters/calendar';
import type { WhatsAppTransport } from '../adapters/whatsapp';
import type { RoutedWhatsAppInbound } from './emp002-whatsapp-endpoint';
import type { WhatsAppSchedulingDispatchStore } from './emp002-whatsapp-dispatch-store';
import { handleSchedulingWhatsAppReply } from './emp002-scheduling-orchestrator';

export interface DispatchSchedulingInboundInput {
  message: RoutedWhatsAppInbound;
  store: WhatsAppSchedulingDispatchStore;
  calendar: CalendarTransport;
  whatsapp: WhatsAppTransport;
}

export async function dispatchSchedulingWhatsAppInbound(input: DispatchSchedulingInboundInput) {
  const record = await input.store.findActiveByWhatsapp(input.message.tenantId, input.message.from);
  if (!record) return { handled: false as const, reason: 'NO_ACTIVE_SCHEDULING_CONVERSATION' };

  const result = await handleSchedulingWhatsAppReply({
    message: {
      tenantId: input.message.tenantId,
      from: input.message.from,
      body: input.message.body,
      receivedAt: input.message.receivedAt,
      messageId: input.message.messageId,
    },
    state: record.state,
    requests: record.requests,
    contact: { id: record.contactId, whatsapp: record.whatsapp, displayName: record.displayName, email: record.email },
    ownerWhatsapp: record.ownerWhatsapp,
    calendar: input.calendar,
    whatsapp: input.whatsapp,
    timezone: record.timezone,
  });

  if (result.handled && 'state' in result) await input.store.save({ ...record, state: result.state });
  return result;
}
