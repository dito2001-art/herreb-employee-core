import type { AppointmentLifecycleRecord } from './emp002-appointment-lifecycle';
import type { AppointmentLifecycleAction, SqliteAppointmentLifecycleStore } from './emp002-appointment-lifecycle-store';

export interface PreparedAppointmentAction {
  action: AppointmentLifecycleAction;
  appointment: AppointmentLifecycleRecord;
  status: 'PREPARED';
}

function compatible(record: AppointmentLifecycleRecord, action: AppointmentLifecycleAction): boolean {
  if (action.kind === 'CONFIRMATION') return record.state === 'CONFIRMATION_PENDING';
  if (action.kind === 'REMINDER') return record.state === 'BOOKED' || record.state === 'CONFIRMED';
  if (action.kind === 'WAITLIST_OFFER') return record.state === 'SLOT_RELEASED';
  return false;
}

export function prepareDueAppointmentActions(
  store: SqliteAppointmentLifecycleStore,
  tenantId: string,
  now = new Date().toISOString(),
  limit = 50,
  actionKey?: string,
): PreparedAppointmentAction[] {
  const prepared: PreparedAppointmentAction[] = [];
  for (const action of store.dueActions(tenantId, now, limit, actionKey)) {
    const appointment = store.load(tenantId, action.appointmentId);
    if (!appointment || !compatible(appointment, action)) continue;
    if (!store.claimActionOnce(tenantId, action.actionKey, now)) continue;
    const { version: _version, ...record } = appointment;
    prepared.push({ action, appointment: record, status: 'PREPARED' });
  }
  return prepared;
}
