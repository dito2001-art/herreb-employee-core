import assert from 'node:assert/strict';
import test from 'node:test';
import type { CalendarTransport } from '../adapters/calendar';
import type { CrmTransport } from '../adapters/crm';
import { executeEMP002PersistedMutation } from './emp002-execution-coordinator';

const request = {
  tenantId: 'tenant-a',
  correlationId: 'corr-1',
  idempotencyKey: 'emp002:create:1',
  request: { operation: 'create' as const, title: 'Meeting', startTime: '2026-10-06T15:00:00-03:00', endTime: '2026-10-06T16:00:00-03:00', timezone: 'America/Asuncion' },
};

test('EMP-002 confirms success only after persisted CRM read-back', async () => {
  const calendar: CalendarTransport = { async execute() { return { ok: true, output: { persistenceConfirmed: true, data: { id: '42' } }, evidence: { upstreamStatus: 200 } }; } };
  const crm = { async execute() { return { ok: true, output: { data: [{ id: '42', persistenceConfirmed: true, calendarEventId: 'gcal-42', calendarSyncStatus: 'SYNCED' }] }, evidence: { upstreamStatus: 200 } }; } } as CrmTransport;
  const result = await executeEMP002PersistedMutation(calendar, crm, request);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 'PERSISTED');
    assert.equal(result.recordId, '42');
    assert.equal(result.record.calendarEventId, 'gcal-42');
  }
});

test('EMP-002 refuses to say done when write lacks persistence confirmation', async () => {
  const calendar: CalendarTransport = { async execute() { return { ok: true, output: { persistenceConfirmed: false, data: { id: '42' } } }; } };
  const crm = { async execute() { throw new Error('must not read'); } } as CrmTransport;
  const result = await executeEMP002PersistedMutation(calendar, crm, request);
  assert.deepEqual(result, { ok: false, status: 'PERSISTENCE_NOT_CONFIRMED', error: 'EMP002_PERSISTENCE_NOT_CONFIRMED' });
});

test('EMP-002 refuses success when read-back cannot verify the written record', async () => {
  const calendar: CalendarTransport = { async execute() { return { ok: true, output: { persistenceConfirmed: true, data: { id: '42' } } }; } };
  const crm = { async execute() { return { ok: true, output: { data: [] } }; } } as CrmTransport;
  const result = await executeEMP002PersistedMutation(calendar, crm, request);
  assert.deepEqual(result, { ok: false, status: 'READBACK_MISMATCH', error: 'EMP002_READBACK_NOT_PERSISTED' });
});
