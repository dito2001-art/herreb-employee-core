import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialAppointmentState,
  reminderSchedule,
  transitionAppointment,
  type AppointmentLifecyclePolicy,
  type AppointmentLifecycleRecord,
} from './emp002-appointment-lifecycle';

const policy: AppointmentLifecyclePolicy = {
  confirmationRequired: true,
  reminderOffsetsMinutes: [1440, 120, 120],
  waitlistEnabled: true,
};

function record(state: AppointmentLifecycleRecord['state']): AppointmentLifecycleRecord {
  return {
    appointmentId: 'appt-1',
    tenantId: 'tenant-a',
    state,
    startsAt: '2026-10-10T15:00:00.000Z',
    contactId: 'contact-1',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

test('confirmation policy starts appointments pending confirmation', () => {
  assert.equal(initialAppointmentState(policy), 'CONFIRMATION_PENDING');
  assert.equal(initialAppointmentState({ ...policy, confirmationRequired: false }), 'BOOKED');
});

test('appointment can be confirmed and later cancelled', () => {
  const confirmed = transitionAppointment(record('CONFIRMATION_PENDING'), 'CONFIRM', '2026-10-02T00:00:00.000Z');
  assert.equal(confirmed.state, 'CONFIRMED');
  const cancelled = transitionAppointment(confirmed, 'CANCEL', '2026-10-03T00:00:00.000Z');
  assert.equal(cancelled.state, 'CANCELLED');
});

test('cancelled slot can flow through waitlist and rebooking', () => {
  const released = transitionAppointment(record('CANCELLED'), 'RELEASE_SLOT');
  assert.equal(released.state, 'SLOT_RELEASED');
  const offered = transitionAppointment(released, 'OFFER_WAITLIST');
  assert.equal(offered.state, 'WAITLIST_OFFERED');
  const rebooked = transitionAppointment(offered, 'ACCEPT_WAITLIST');
  assert.equal(rebooked.state, 'REBOOKED');
});

test('invalid lifecycle transition is rejected', () => {
  assert.throws(
    () => transitionAppointment(record('CONFIRMED'), 'ACCEPT_WAITLIST'),
    /EMP002_INVALID_APPOINTMENT_TRANSITION/,
  );
});

test('reminders are deterministic, de-duplicated and ordered', () => {
  assert.deepEqual(reminderSchedule('2026-10-10T15:00:00.000Z', policy), [
    '2026-10-09T15:00:00.000Z',
    '2026-10-10T13:00:00.000Z',
  ]);
});
