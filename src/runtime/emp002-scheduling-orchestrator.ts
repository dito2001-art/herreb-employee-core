import type { CalendarTransport } from '../adapters/calendar';
import type { WhatsAppTransport } from '../adapters/whatsapp';
import type { AutonomousSchedulingState } from './emp002-autonomous-scheduling';
import type { WaitlistRequest } from './emp002-scheduling';
import { resolveInboundSchedulingReply, type InboundWhatsAppMessage } from './emp002-whatsapp-inbound';
import { executeConfirmSlotCommands } from './emp002-confirm-slot-executor';
import { finalizeSlotConfirmation } from './emp002-confirmation-finalizer';

export interface SchedulingOrchestratorContact {
  id: string;
  whatsapp: string;
  displayName?: string;
  email?: string;
}

export interface HandleSchedulingReplyInput {
  message: InboundWhatsAppMessage;
  state: AutonomousSchedulingState;
  requests: WaitlistRequest[];
  contact: SchedulingOrchestratorContact;
  ownerWhatsapp?: string;
  calendar: CalendarTransport;
  whatsapp: WhatsAppTransport;
  timezone: string;
}

export async function handleSchedulingWhatsAppReply(input: HandleSchedulingReplyInput) {
  const resolution = resolveInboundSchedulingReply(input.message, [{
    tenantId: input.message.tenantId,
    contactId: input.contact.id,
    whatsapp: input.contact.whatsapp,
    state: input.state,
    requests: input.requests,
  }]);

  if (!resolution.handled) return { handled: false as const, reason: resolution.reason };
  if (resolution.response === 'DECLINE') {
    return { handled: true as const, response: 'DECLINE' as const, state: resolution.result.state, commands: resolution.result.commands };
  }

  const executions = await executeConfirmSlotCommands({
    tenantId: input.message.tenantId,
    correlationId: input.state.correlationId,
    result: resolution.result,
    contacts: { [input.contact.id]: input.contact },
    calendar: input.calendar,
    timezone: input.timezone,
  });

  const finalized = await finalizeSlotConfirmation({
    tenantId: input.message.tenantId,
    correlationId: input.state.correlationId,
    now: input.message.receivedAt,
    state: resolution.result.state,
    executions,
    contact: input.contact,
    ownerWhatsapp: input.ownerWhatsapp,
    whatsapp: input.whatsapp,
  });

  return { handled: true as const, response: 'ACCEPT' as const, executions, ...finalized };
}
