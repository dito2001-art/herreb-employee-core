import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteAppointmentLifecycleStore } from './emp002-appointment-lifecycle-store';
import type { SchedulingSqlStorage } from './emp002-scheduling-store';

type Row = Record<string, unknown>;

function memorySql(): SchedulingSqlStorage {
  const lifecycle = new Map<string, { version: number; payload: string }>();
  const actions = new Set<string>();
  const leases = new Map<string, string>();
  const queue = new Map<string, { tenant_id: string; appointment_id: string; action_key: string; kind: string; due_at: string; payload: string | null }>();
  return {
    exec(query, ...bindings): Iterable<Row> {
      if (query.includes('CREATE TABLE') || query.includes('CREATE INDEX')) return [];
      if (query.includes('SELECT version, payload')) {
        const row = lifecycle.get(`${bindings[0]}:${bindings[1]}`);
        return row ? [row] : [];
      }
      if (query.includes('INSERT INTO emp002_appointment_lifecycle')) {
        lifecycle.set(`${bindings[0]}:${bindings[1]}`, { version: bindings[2] as number, payload: bindings[4] as string });
        return [];
      }
      if (query.includes('INSERT INTO emp002_appointment_action_queue')) {
        queue.set(`${bindings[0]}:${bindings[2]}`, { tenant_id: String(bindings[0]), appointment_id: String(bindings[1]), action_key: String(bindings[2]), kind: String(bindings[3]), due_at: String(bindings[4]), payload: bindings[5] == null ? null : String(bindings[5]) });
        return [];
      }
      if (query.includes('FROM emp002_appointment_action_queue')) {
        const tenant = String(bindings[0]); const now = String(bindings[1]); const limit = Number(bindings[2]);
        return [...queue.values()].filter((row) => row.tenant_id === tenant && row.due_at <= now).sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, limit);
      }
      if (query.includes('SELECT action_key FROM emp002_appointment_action_seen')) return actions.has(`${bindings[0]}:${bindings[1]}`) ? [{ action_key: bindings[1] }] : [];
      if (query.includes('SELECT expires_at FROM emp002_appointment_action_lease')) { const value = leases.get(`${bindings[0]}:${bindings[1]}`); return value ? [{ expires_at: value }] : []; }
      if (query.includes('INSERT INTO emp002_appointment_action_lease')) { leases.set(`${bindings[0]}:${bindings[1]}`, String(bindings[2])); return []; }
      if (query.includes('DELETE FROM emp002_appointment_action_lease')) { leases.delete(`${bindings[0]}:${bindings[1]}`); return []; }
      if (query.includes('INSERT INTO emp002_appointment_action_seen')) { actions.add(`${bindings[0]}:${bindings[1]}`); return []; }
      throw new Error(`UNEXPECTED_SQL:${query}`);
    },
  };
}

const record = { appointmentId: 'appt-1', tenantId: 'tenant-a', state: 'CONFIRMATION_PENDING' as const, startsAt: '2026-10-10T15:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' };

test('appointment lifecycle persists with optimistic versioning', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql());
  const first = store.save(record, 0); assert.equal(first.version, 1);
  const loaded = store.load('tenant-a', 'appt-1'); assert.equal(loaded?.state, 'CONFIRMATION_PENDING'); assert.equal(loaded?.version, 1);
  const second = store.save({ ...record, state: 'CONFIRMED', updatedAt: '2026-10-05T00:00:00.000Z' }, 1); assert.equal(second.version, 2); assert.equal(store.load('tenant-a', 'appt-1')?.state, 'CONFIRMED');
});

test('stale lifecycle writes are rejected', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql()); store.save(record, 0);
  assert.throws(() => store.save({ ...record, state: 'CONFIRMED' }, 0), /EMP002_APPOINTMENT_CONCURRENT_MODIFICATION/);
});

test('tenant scoped appointment ids cannot read each other', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql()); store.save(record); assert.equal(store.load('tenant-b', 'appt-1'), undefined);
});

test('appointment action lease blocks concurrent execution but expires after crash window', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql());
  assert.equal(store.claimActionOnce('tenant-a', 'reminder:appt-1:120', '2026-10-04T12:00:00.000Z'), true);
  assert.equal(store.claimActionOnce('tenant-a', 'reminder:appt-1:120', '2026-10-04T12:04:59.000Z'), false);
  assert.equal(store.claimActionOnce('tenant-a', 'reminder:appt-1:120', '2026-10-04T12:05:00.000Z'), true);
});

test('completed appointment action remains permanently deduplicated', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql());
  assert.equal(store.claimActionOnce('tenant-a', 'reminder:appt-1:120', '2026-10-04T12:00:00.000Z'), true);
  store.completeActionClaim('tenant-a', 'reminder:appt-1:120', '2026-10-04T12:00:01.000Z');
  assert.equal(store.claimActionOnce('tenant-a', 'reminder:appt-1:120', '2026-10-05T12:00:00.000Z'), false);
});

test('due action queue returns only due actions for requested tenant in chronological order', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql());
  store.scheduleAction({ tenantId: 'tenant-a', appointmentId: 'appt-1', actionKey: 'reminder:120', kind: 'REMINDER', dueAt: '2026-10-10T13:00:00.000Z', payload: { offset: 120 } });
  store.scheduleAction({ tenantId: 'tenant-a', appointmentId: 'appt-1', actionKey: 'confirmation', kind: 'CONFIRMATION', dueAt: '2026-10-09T15:00:00.000Z' });
  store.scheduleAction({ tenantId: 'tenant-a', appointmentId: 'appt-1', actionKey: 'future', kind: 'REMINDER', dueAt: '2026-10-11T13:00:00.000Z' });
  store.scheduleAction({ tenantId: 'tenant-b', appointmentId: 'appt-x', actionKey: 'other', kind: 'REMINDER', dueAt: '2026-10-09T10:00:00.000Z' });
  const due = store.dueActions('tenant-a', '2026-10-10T14:00:00.000Z');
  assert.deepEqual(due.map((action) => action.actionKey), ['confirmation', 'reminder:120']);
  assert.deepEqual(due[1].payload, { offset: 120 });
});

test('claimDueActions suppresses an action while its lease is active', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql());
  store.scheduleAction({ tenantId: 'tenant-a', appointmentId: 'appt-1', actionKey: 'reminder:120', kind: 'REMINDER', dueAt: '2026-10-10T13:00:00.000Z' });
  assert.equal(store.claimDueActions('tenant-a', '2026-10-10T14:00:00.000Z').length, 1);
  assert.equal(store.claimDueActions('tenant-a', '2026-10-10T14:01:00.000Z').length, 0);
  assert.equal(store.claimDueActions('tenant-a', '2026-10-10T14:05:00.000Z').length, 1);
});

test('invalid due timestamp is rejected before persistence', () => {
  const store = new SqliteAppointmentLifecycleStore(memorySql());
  assert.throws(() => store.scheduleAction({ tenantId: 'tenant-a', appointmentId: 'appt-1', actionKey: 'bad', kind: 'REMINDER', dueAt: 'not-a-date' }), /EMP002_APPOINTMENT_ACTION_INVALID_DUE_AT/);
});
