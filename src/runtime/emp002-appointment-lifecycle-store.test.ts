import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteAppointmentLifecycleStore } from './emp002-appointment-lifecycle-store';
import type { SchedulingSqlStorage } from './emp002-scheduling-store';

type Row = Record<string, unknown>;

function memorySql(): SchedulingSqlStorage {
  const lifecycle = new Map<string, { version: number; payload: string }>();
  const actions = new Set<string>();
  return {
    exec(query, ...bindings): Iterable<Row> {
      if (query.includes('CREATE TABLE')) return [];
      if (query.includes('SELECT version, payload')) {
        const key = `${bindings[0]}:${bindings[1]}`;
        const row = lifecycle.get(key);
        return row ? [row] : [];
      }
      if (query.includes('INSERT INTO emp002_appointment_lifecycle')) {
        lifecycle.set(`${bindings[0]}:${bindings[1]}`, { version: bindings[2] as number, payload: bindings[4] as string });
        return [];
      }
      if (query.includes('SELECT action_key')) return actions.has(`${bindings[0]}:${bindings[1]}`) ? [{ action_key: bindings[1] }] : [];
      if (query.includes('INSERT INTO emp002_appointment_action_seen')) { actions.add(`${bindings[0]}:${bindings[1]}`); return []; }
      throw new Error(`UNEXPECTED_SQL:${query}`);
    },
  };
}

const record = {
  appointmentId: 'appt-1', tenantId: 'tenant-a', state: 'CONFIRMATION_PENDING' as const,
  startsAt: '2026-10-10T15:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z',
};

test('appointment lifecycle persists with optimistic versioning', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql());
  const first = store.save(record, 0);
  assert.equal(first.version, 1);
  const loaded = store.load('tenant-a', 'appt-1');
  assert.equal(loaded?.state, 'CONFIRMATION_PENDING');
  assert.equal(loaded?.version, 1);
  const second = store.save({ ...record, state: 'CONFIRMED', updatedAt: '2026-10-05T00:00:00.000Z' }, 1);
  assert.equal(second.version, 2);
  assert.equal(store.load('tenant-a', 'appt-1')?.state, 'CONFIRMED');
});

test('stale lifecycle writes are rejected', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql());
  store.save(record, 0);
  assert.throws(() => store.save({ ...record, state: 'CONFIRMED' }, 0), /EMP002_APPOINTMENT_CONCURRENT_MODIFICATION/);
});

test('tenant scoped appointment ids cannot read each other', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql());
  store.save(record);
  assert.equal(store.load('tenant-b', 'appt-1'), undefined);
});

test('appointment side effects can be claimed only once per tenant', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql());
  assert.equal(store.claimActionOnce('tenant-a', 'reminder:appt-1:120'), true);
  assert.equal(store.claimActionOnce('tenant-a', 'reminder:appt-1:120'), false);
  assert.equal(store.claimActionOnce('tenant-b', 'reminder:appt-1:120'), true);
});
