import type { WhatsAppTransport } from '../adapters/whatsapp';
import type { PreparedAppointmentAction } from './emp002-appointment-action-processor';

export interface ExecutedAppointmentAction {
  actionKey: string;
  appointmentId: string;
  status: 'EXECUTED';
  provider: 'meta-cloud-api';
  providerMessageId: string;
  providerStatus: number;
  correlationId: string;
}

export interface FailedAppointmentAction {
  actionKey: string;
  appointmentId: string;
  status: 'FAILED_RETRYABLE';
  error: string;
}

export type AppointmentActionExecution = ExecutedAppointmentAction | FailedAppointmentAction;

function bodyFor(item: PreparedAppointmentAction): string {
  const custom = item.action.payload?.message;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  if (item.action.kind === 'CONFIRMATION') return `¿Confirmás tu cita del ${item.appointment.startsAt}?`;
  if (item.action.kind === 'REMINDER') return `Recordatorio: tenés una cita el ${item.appointment.startsAt}.`;
  return `Se liberó un horario para el ${item.appointment.startsAt}. ¿Querés tomarlo?`;
}

function recipientFor(item: PreparedAppointmentAction): string {
  const recipient = item.action.payload?.whatsapp;
  if (typeof recipient !== 'string' || !recipient.trim()) throw new Error('EMP002_APPOINTMENT_ACTION_WHATSAPP_REQUIRED');
  return recipient;
}

export async function executePreparedAppointmentAction(
  item: PreparedAppointmentAction,
  whatsapp: WhatsAppTransport,
): Promise<AppointmentActionExecution> {
  try {
    const correlationId = `appointment:${item.appointment.appointmentId}:${item.action.actionKey}`;
    const result = await whatsapp.sendText({
      tenantId: item.appointment.tenantId,
      to: recipientFor(item),
      body: bodyFor(item),
      audience: 'EXTERNAL_CONTACT',
      correlationId,
      idempotencyKey: item.action.actionKey,
    });
    if (!result.ok || !result.messageId?.trim()) throw new Error('EMP002_APPOINTMENT_PROVIDER_EVIDENCE_MISSING');
    return {
      actionKey: item.action.actionKey,
      appointmentId: item.appointment.appointmentId,
      status: 'EXECUTED',
      provider: result.provider,
      providerMessageId: result.messageId,
      providerStatus: result.status,
      correlationId: result.correlationId,
    };
  } catch (error) {
    return {
      actionKey: item.action.actionKey,
      appointmentId: item.appointment.appointmentId,
      status: 'FAILED_RETRYABLE',
      error: error instanceof Error ? error.message : 'EMP002_APPOINTMENT_ACTION_EXECUTION_FAILED',
    };
  }
}
