import type { CalendarTransport } from '../adapters/calendar';
import type { AutonomousSchedulingResult } from './emp002-autonomous-scheduling';

export interface ConfirmSlotContact {
  id: string;
  displayName?: string;
  email?: string;
}

export interface ConfirmSlotExecutionInput {
  tenantId: string;
  correlationId: string;
  result: AutonomousSchedulingResult;
  contacts: Record<string, ConfirmSlotContact>;
  calendar: CalendarTransport;
  timezone: string;
  appointmentTitle?: (contact: ConfirmSlotContact) => string;
}

export interface ConfirmSlotExecution {
  commandType: 'CONFIRM_SLOT';
  idempotencyKey: string;
  ok: boolean;
  eventId?: string;
  upstreamStatus?: number;
  error?: string;
}

export async function executeConfirmSlotCommands(
  input: ConfirmSlotExecutionInput,
): Promise<ConfirmSlotExecution[]> {
  const executions: ConfirmSlotExecution[] = [];

  for (const command of input.result.commands) {
    if (command.type !== 'CONFIRM_SLOT') continue;
    const contact = input.contacts[command.contactId];
    if (!contact) {
      executions.push({ commandType: 'CONFIRM_SLOT', idempotencyKey: command.idempotencyKey, ok: false, error: 'CONTACT_NOT_FOUND' });
      continue;
    }

    const response = await input.calendar.execute({
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      idempotencyKey: command.idempotencyKey,
      request: {
        operation: 'create',
        title: input.appointmentTitle?.(contact) ?? `Turno · ${contact.displayName ?? contact.id}`,
        startTime: command.slot.startsAt,
        endTime: command.slot.endsAt,
        timezone: input.timezone,
        attendees: contact.email ? [contact.email] : undefined,
        description: `EMP-002 waitlist recovery · request ${command.requestId}`,
      },
    });

    if (!response.ok) {
      executions.push({
        commandType: 'CONFIRM_SLOT', idempotencyKey: command.idempotencyKey, ok: false,
        upstreamStatus: Number(response.evidence?.upstreamStatus ?? 0) || undefined,
        error: response.error?.code ?? 'CALENDAR_CONFIRMATION_FAILED',
      });
      continue;
    }

    const output = response.output as any;
    executions.push({
      commandType: 'CONFIRM_SLOT', idempotencyKey: command.idempotencyKey, ok: true,
      eventId: output?.eventId ?? output?.id ?? output?.calendarEventId,
      upstreamStatus: Number(response.evidence?.upstreamStatus ?? 0) || undefined,
    });
  }

  return executions;
}
