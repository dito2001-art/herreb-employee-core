import assert from 'node:assert/strict';
import test from 'node:test';
import { orchestrateEMP002 } from './emp002-orchestrator';
import type { EMP002SchedulingConfig } from './emp002-scheduling-engine';

const scheduling: EMP002SchedulingConfig = {
  tenantId: 'tenant-a',
  timezone: 'America/Asuncion',
  slotIntervalMinutes: 30,
  services: [{ serviceId: 'meeting', durationMinutes: 60 }],
  workingWindows: [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 }],
};

test('external contact can ask availability without seeing owner agenda', () => {
  const result = orchestrateEMP002({
    tenantId: 'tenant-a',
    actor: { role: 'EXTERNAL_CONTACT', contactId: 'c-1' },
    text: '¿Qué horarios tenés mañana?',
    serviceId: 'meeting',
    dayStart: '2026-10-05T00:00:00.000Z',
    scheduling,
    busy: [{ start: '2026-10-05T09:00:00.000Z', end: '2026-10-05T10:00:00.000Z' }],
  });
  assert.equal(result.status, 'AVAILABILITY');
  if (result.status === 'AVAILABILITY') assert.deepEqual(result.slots.map((slot) => slot.start), ['2026-10-05T10:00:00.000Z', '2026-10-05T10:30:00.000Z', '2026-10-05T11:00:00.000Z']);
});

test('orchestrator asks only for missing scheduling context', () => {
  const result = orchestrateEMP002({ tenantId: 'tenant-a', actor: { role: 'EXTERNAL_CONTACT' }, text: '¿Qué horarios tenés mañana?' });
  assert.deepEqual(result, { status: 'NEEDS_CONTEXT', intent: 'CHECK_AVAILABILITY', missing: ['serviceId', 'dayStart', 'scheduling'] });
});

test('operational writes become ready only after authorization', () => {
  const result = orchestrateEMP002({ tenantId: 'tenant-a', actor: { role: 'OWNER' }, text: 'Pasá mi reunión con Lucas para mañana a las 15' });
  assert.deepEqual(result, { status: 'READY_TO_EXECUTE', intent: 'RESCHEDULE_APPOINTMENT', operation: 'RESCHEDULE_APPOINTMENT' });
});

test('unknown actor is denied before execution', () => {
  const result = orchestrateEMP002({ tenantId: 'tenant-a', actor: { role: 'UNKNOWN' }, text: 'Cancelá mi reunión con Lucas' });
  assert.equal(result.status, 'DENIED');
});

test('tenant scheduling configuration cannot cross tenants', () => {
  assert.throws(() => orchestrateEMP002({ tenantId: 'tenant-b', actor: { role: 'EXTERNAL_CONTACT' }, text: '¿Qué horarios tenés?', serviceId: 'meeting', dayStart: '2026-10-05T00:00:00.000Z', scheduling }), /EMP002_SCHEDULING_TENANT_SCOPE_MISMATCH/);
});
