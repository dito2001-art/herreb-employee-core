import { reduceAutonomousScheduling, type AutonomousSchedulingState } from './emp002-autonomous-scheduling';
import type { WhatsAppTransport } from '../adapters/whatsapp';
import type { ConfirmSlotExecution } from './emp002-confirm-slot-executor';

export interface FinalizationContact {
  id: string;
  whatsapp: string;
  displayName?: string;
}

export interface FinalizeConfirmationInput {
  tenantId: string;
  correlationId: string;
  now: string;
  state: AutonomousSchedulingState;
  executions: ConfirmSlotExecution[];
  contact: FinalizationContact;
  ownerWhatsapp?: string;
  whatsapp: WhatsAppTransport;
}

export interface ConfirmationFinalization {
  state: AutonomousSchedulingState;
  verified: boolean;
  notifications: Array<{ audience: 'EXTERNAL_CONTACT' | 'OWNER'; ok: boolean; messageId: string | null }>;
}

export async function finalizeSlotConfirmation(input: FinalizeConfirmationInput): Promise<ConfirmationFinalization> {
  const successful = input.executions.find((execution) => execution.commandType === 'CONFIRM_SLOT' && execution.ok);
  const event = successful ? { type: 'CONFIRMATION_VERIFIED' as const, now: input.now } : { type: 'CONFIRMATION_FAILED' as const, now: input.now };
  const reduced = reduceAutonomousScheduling(input.state, event);
  const notifications: ConfirmationFinalization['notifications'] = [];

  if (!successful) return { state: reduced.state, verified: false, notifications };

  const slot = reduced.state.recovery?.slot;
  if (!slot) return { state: reduced.state, verified: true, notifications };
  const customer = await input.whatsapp.sendText({
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    to: input.contact.whatsapp,
    audience: 'EXTERNAL_CONTACT',
    idempotencyKey: `confirmed:contact:${successful.idempotencyKey}`,
    body: `Tu turno quedó confirmado para ${slot.startsAt}.`,
  });
  notifications.push({ audience: 'EXTERNAL_CONTACT', ok: customer.ok, messageId: customer.messageId });

  if (input.ownerWhatsapp) {
    const owner = await input.whatsapp.sendText({
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      to: input.ownerWhatsapp,
      audience: 'OWNER',
      idempotencyKey: `confirmed:owner:${successful.idempotencyKey}`,
      body: `EMP-002 cubrió el turno ${slot.startsAt} con ${input.contact.displayName ?? input.contact.id}.`,
    });
    notifications.push({ audience: 'OWNER', ok: owner.ok, messageId: owner.messageId });
  }

  return { state: reduced.state, verified: true, notifications };
}
