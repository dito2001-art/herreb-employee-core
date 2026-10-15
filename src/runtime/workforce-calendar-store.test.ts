import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkforceCalendarStore } from './workforce-calendar-store';
import type { SchedulingSqlStorage } from './emp002-scheduling-store';

function memorySql(): SchedulingSqlStorage {
  const rows = new Map<string, { payload: string; startsAt: string; tenantId: string }>();
  return { exec(query, ...args) {
    if (query.startsWith('CREATE')) return [];
    if (query.startsWith('SELECT payload FROM workforce_calendar_entries WHERE tenant_id = ? AND id')) {
      const row = rows.get(JSON.stringify([args[0], args[1]]));
      return row ? [{ payload: row.payload }] : [];
    }
    if (query.startsWith('SELECT payload FROM workforce_calendar_entries WHERE tenant_id = ? AND starts_at')) {
      return [...rows.values()].filter(row => row.tenantId === args[0] && row.startsAt >= String(args[1]) && row.startsAt < String(args[2])).map(row => ({ payload: row.payload }));
    }
    if (query.startsWith('INSERT INTO workforce_calendar_entries')) {
      rows.set(JSON.stringify([args[0], args[1]]), { tenantId: String(args[0]), startsAt: String(args[3]), payload: String(args[4]) });
      return [];
    }
    throw new Error('UNEXPECTED_SQL:' + query);
  } };
}
const base = { tenantId: 'tenant-a', id: 'meeting-1', kind: 'MEETING' as const, title: 'Reunión comercial', startsAt: '2026-10-16T12:00:00.000Z', endsAt: '2026-10-16T13:00:00.000Z', status: 'ACTIVE' as const, updatedAt: '2026-10-15T15:00:00.000Z' };

test('native calendar creates, updates and cancels with read-back', () => {
  const store = new WorkforceCalendarStore(memorySql());
  const created = store.save(base);
  assert.equal(created.version, 1);
  assert.equal(store.get('tenant-a', 'meeting-1')?.title, base.title);
  const changed = store.save({ ...base, title: 'Reunión modificada' }, 1);
  assert.equal(changed.version, 2);
  assert.equal(store.get('tenant-a', 'meeting-1')?.title, 'Reunión modificada');
  assert.throws(() => store.save(base, 1), /CALENDAR_VERSION_CONFLICT/);
  store.save({ ...base, status: 'CANCELLED' }, 2);
  assert.equal(store.list('tenant-a', '2026-10-16T00:00:00.000Z', '2026-10-17T00:00:00.000Z').length, 0);
});

test('native calendar never exposes another tenant records', () => {
  const store = new WorkforceCalendarStore(memorySql());
  store.save(base);
  assert.equal(store.get('tenant-b', 'meeting-1'), undefined);
  assert.deepEqual(store.list('tenant-b', '2026-10-16T00:00:00.000Z', '2026-10-17T00:00:00.000Z'), []);
  store.save({ ...base, tenantId: 'tenant-b', title: 'Private B' });
  assert.equal(store.get('tenant-a', 'meeting-1')?.title, base.title);
  assert.equal(store.get('tenant-b', 'meeting-1')?.title, 'Private B');
});

test('native calendar rejects malformed fields without mutating tenant records', () => {
  const store = new WorkforceCalendarStore(memorySql());
  const invalid = [
    { ...base, title: null },
    { ...base, tenantId: 17 },
    { ...base, startsAt: 42 },
    { ...base, updatedAt: 'not-a-date' },
    { ...base, endsAt: {} },
  ];
  for (const input of invalid) {
    assert.throws(() => store.save(input as never), /INVALID_CALENDAR_ENTRY/);
  }
  assert.equal(store.get('tenant-a', base.id), undefined);
});

test('native calendar compares offset query windows against UTC storage', () => {
  const store = new WorkforceCalendarStore(memorySql());
  store.save(base);
  const entries = store.list('tenant-a', '2026-10-16T08:00:00-03:00', '2026-10-16T10:00:00-03:00');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, base.id);
});

test('native calendar rejects overlapping meetings but isolates tenants', () => {
  const store = new WorkforceCalendarStore(memorySql());
  store.save(base);
  assert.throws(() => store.save({ ...base, id: 'meeting-2', startsAt: '2026-10-16T12:30:00.000Z', endsAt: '2026-10-16T13:30:00.000Z' }), /CALENDAR_TIME_CONFLICT/);
  assert.equal(store.get('tenant-a', 'meeting-2'), undefined);
  assert.equal(store.save({ ...base, tenantId: 'tenant-b', id: 'meeting-2' }).version, 1);
  assert.equal(store.save({ ...base, id: 'meeting-3', startsAt: '2026-10-16T13:00:00.000Z', endsAt: '2026-10-16T14:00:00.000Z' }).version, 1);
});

test('native meetings and events require an end time', () => {
  const store = new WorkforceCalendarStore(memorySql());
  assert.throws(() => store.save({ ...base, endsAt: undefined }), /CALENDAR_END_REQUIRED/);
  assert.throws(() => store.save({ ...base, kind: 'EVENT', endsAt: undefined }), /CALENDAR_END_REQUIRED/);
  assert.equal(store.save({ ...base, kind: 'TASK', endsAt: undefined }).version, 1);
});
