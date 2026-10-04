export type AppointmentLifecycleState =
  | 'BOOKED'
  | 'CONFIRMATION_PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'SLOT_RELEASED'
  | 'WAITLIST_OFFERED'
  | 'REBOOKED';

export type AppointmentLifecycleEvent =
  | 'REQUEST_CONFIRMATION'
  | 'CONFIRM'
  | 'CANCEL'
  | 'RELEASE_SLOT'
  | 'OFFER_WAITLIST'
  | 'ACCEPT_WAITLIST';

export interface AppointmentLifecyclePolicy {
  confirmationRequired: boolean;
  reminderOffsetsMinutes: number[];
  waitlistEnabled: boolean;
}

export interface AppointmentLifecycleRecord {
  appointmentId: string;
  tenantId: string;
  state: AppointmentLifecycleState;
  startsAt: string;
  contactId?: string;
  updatedAt: string;
}

const transitions: Record<AppointmentLifecycleState, Partial<Record<AppointmentLifecycleEvent, AppointmentLifecycleState>>> = {
  BOOKED: { REQUEST_CONFIRMATION: 'CONFIRMATION_PENDING', CANCEL: 'CANCELLED' },
  CONFIRMATION_PENDING: { CONFIRM: 'CONFIRMED', CANCEL: 'CANCELLED' },
  CONFIRMED: { CANCEL: 'CANCELLED' },
  CANCELLED: { RELEASE_SLOT: 'SLOT_RELEASED' },
  SLOT_RELEASED: { OFFER_WAITLIST: 'WAITLIST_OFFERED' },
  WAITLIST_OFFERED: { ACCEPT_WAITLIST: 'REBOOKED' },
  REBOOKED: { CANCEL: 'CANCELLED' },
};

export function transitionAppointment(
  record: AppointmentLifecycleRecord,
  event: AppointmentLifecycleEvent,
  at = new Date().toISOString(),
): AppointmentLifecycleRecord {
  const next = transitions[record.state][event];
  if (!next) throw new Error(`EMP002_INVALID_APPOINTMENT_TRANSITION:${record.state}:${event}`);
  return { ...record, state: next, updatedAt: at };
}

export function initialAppointmentState(policy: AppointmentLifecyclePolicy): AppointmentLifecycleState {
  return policy.confirmationRequired ? 'CONFIRMATION_PENDING' : 'BOOKED';
}

export function reminderSchedule(
  startsAt: string,
  policy: AppointmentLifecyclePolicy,
): string[] {
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(start)) throw new Error('EMP002_INVALID_APPOINTMENT_START');
  return [...new Set(policy.reminderOffsetsMinutes)]
    .filter((minutes) => Number.isFinite(minutes) && minutes > 0)
    .sort((a, b) => b - a)
    .map((minutes) => new Date(start - minutes * 60_000).toISOString());
}

export function nextCancellationEvent(
  policy: AppointmentLifecyclePolicy,
): AppointmentLifecycleEvent {
  return policy.waitlistEnabled ? 'RELEASE_SLOT' : 'RELEASE_SLOT';
}
