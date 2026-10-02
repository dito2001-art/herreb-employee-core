import type { AutonomousSchedulingResult } from './emp002-autonomous-scheduling';
import type { WhatsAppTransport } from '../adapters/whatsapp';

export interface SchedulingContact {
  id: string;
  whatsapp: string;
  displayName?: string;
}

export interface ExecuteSchedulingCommandsInput {
  tenantId: string;
  correlationId: string;
  result: AutonomousSchedulingResult;
  contacts: Record<string, SchedulingContact>;
  whatsapp: WhatsAppTransport;
}

export interface SchedulingCommandExecution {
  commandType: 'SEND_SLOT_OFFER' | 'CONFIRM_SLOT';
  idempotencyKey: string;
  ok: boolean;
  messageId?: string | null;
  skipped?: string;
}

export async function executeSchedulingCommunicationCommands(
  input: ExecuteSchedulingCommandsInput,
): Promise<SchedulingCommandExecution[]> {
  const executions: SchedulingCommandExecution[] = [];

  for (const command of input.result.commands) {
    if (command.type !== 'SEND_SLOT_OFFER') {
      executions.push({
        commandType: command.type,
        idempotencyKey: command.idempotencyKey,
        ok: false,
        skipped: 'CONFIRM_SLOT_REQUIRES_CALENDAR_CRM_EXECUTOR',
      });
      continue;
    }

    const contact = input.contacts[command.contactId];
    if (!contact?.whatsapp) {
      executions.push({
        commandType: command.type,
        idempotencyKey: command.idempotencyKey,
        ok: false,
        skipped: 'CONTACT_WHATSAPP_NOT_FOUND',
      });
      continue;
    }

    const response = await input.whatsapp.sendText({
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      to: contact.whatsapp,
      audience: 'EXTERNAL_CONTACT',
      idempotencyKey: command.idempotencyKey,
      body: buildSlotOfferMessage(command.expiresAt),
    });

    executions.push({
      commandType: command.type,
      idempotencyKey: command.idempotencyKey,
      ok: response.ok,
      messageId: response.messageId,
    });
  }

  return executions;
}

function buildSlotOfferMessage(expiresAt: string): string {
  return `Se liberó un turno que puede servirte. Respondé ACEPTAR para reservarlo o NO si no te sirve. La oferta vence ${expiresAt}.`;
}

export type ExternalSchedulingReply = 'ACCEPT' | 'DECLINE' | 'UNKNOWN';

export function classifyExternalSchedulingReply(text: string): ExternalSchedulingReply {
  const normalized = String(text || '').trim().toLowerCase();
  if (/^(aceptar|acepto|sí|si|confirmo|me sirve|quiero)$/.test(normalized)) return 'ACCEPT';
  if (/^(no|rechazo|no puedo|no me sirve|paso)$/.test(normalized)) return 'DECLINE';
  return 'UNKNOWN';
}
