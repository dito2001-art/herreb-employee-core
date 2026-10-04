import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareDueAppointmentActions } from './emp002-appointment-action-processor';
import type { AppointmentLifecycleAction } from './emp002-appointment-lifecycle-store';
import type { AppointmentLifecycleRecord } from './emp002-appointment-lifecycle';

type Stored = AppointmentLifecycleRecord & { version: number };

function fakeStore(records: Stored[], actions: AppointmentLifecycleAction[]) {
  const claimed = new Set<string>();
  return {
    dueActions(tenantId: string) { return actions.filter((a) => a.tenantId === tenantId); },
    load(tenantId: string, appointmentId: string) { return records.find((r) => r.tenantId === tenantId && r.appointmentId === appointmentId); },
    claimActionOnce(tenantId: string, actionKey: string) { const key = `${tenantId}:${actionKey}`; if (claimed.has(key)) return false; claimed.add(key); return true; },
  };
}

const base = { tenantId: 'tenant-a', startsAt: '2026-10-10T15:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z', version: 1 };

test('processor prepares only state-compatible actions and claims them once', () => {
  const store = fakeStore([
    { ...base, appointmentId: 'a1', state: 'CONFIRMATION_PENDING' },
    { ...base, appointmentId: 'a2', state: 'CONFIRMED' },
    { ...base, appointmentId: 'a3', state: 'SLOT_RELEASED' },
  ], [
    { tenantId: 'tenant-a', appointmentId: 'a1', actionKey: 'confirm:a1', kind: 'CONFIRMATION', dueAt: '2026-10-04T10:00:00.000Z' },
    { tenantId: 'tenant-a', appointmentId: 'a2', actionKey: 'remind:a2', kind: 'REMINDER', dueAt: '2026-10-04T10:00:00.000Z' },
    { tenantId: 'tenant-a', appointmentId: 'a3', actionKey: 'wait:a3', kind: 'WAITLIST_OFFER', dueAt: '2026-10-04T10:00:00.000Z' },
  ]);
  const first = prepareDueAppointmentActions(store as never, 'tenant-a', '2026-10-04T12:00:00.000Z');
  assert.deepEqual(first.map((x) => x.action.kind), ['CONFIRMATION', 'REMINDER', 'WAITLIST_OFFER']);
  assert.ok(first.every((x) => x.status === 'PREPARED'));
  assert.equal(prepareDueAppointmentActions(store as never, 'tenant-a', '2026-10-04T12:01:00.000Z').length, 0);
});

test('processor skips stale actions whose appointment state changed', () => {
  const store = fakeStore([{ ...base, appointmentId: 'a1', state: 'CANCELLED' }], [
    { tenantId: 'tenant-a', appointmentId: 'a1', actionKey: 'remind:a1', kind: 'REMINDER', dueAt: '2026-10-04T10:00:00.000Z' },
  ]);
  assert.equal(prepareDueAppointmentActions(store as never, 'tenant-a').length, 0);
});

test('processor never crosses tenant boundary', () => {
  const store = fakeStore([{ ...base, tenantId: 'tenant-b', appointmentId: 'a1', state: 'CONFIRMED' }], [
    { tenantId: 'tenant-b', appointmentId: 'a1', actionKey: 'remind:a1', kind: 'REMINDER', dueAt: '2026-10-04T10:00:00.000Z' },
  ]);
  assert.equal(prepareDueAppointmentActions(store as never, 'tenant-a').length, 0);
});
