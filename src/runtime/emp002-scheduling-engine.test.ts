import assert from 'node:assert/strict';
import test from 'node:test';
import { findEMP002AvailableSlots, type EMP002SchedulingConfig } from './emp002-scheduling-engine';

const config: EMP002SchedulingConfig = {
  tenantId: 'tenant-demo',
  timezone: 'America/Asuncion',
  slotIntervalMinutes: 30,
  services: [{ serviceId: 'consultation', durationMinutes: 60, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 }],
  workingWindows: [{ weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60 }],
};

test('EMP-002 generates availability from tenant configuration', () => {
  const slots = findEMP002AvailableSlots(config, 'consultation', '2026-10-05T00:00:00.000Z', []);
  assert.equal(slots.length, 7);
  assert.equal(slots[0]?.start, '2026-10-05T09:00:00.000Z');
  assert.equal(slots.at(-1)?.end, '2026-10-05T13:00:00.000Z');
});

test('EMP-002 respects busy periods plus service buffers', () => {
  const slots = findEMP002AvailableSlots(config, 'consultation', '2026-10-05T00:00:00.000Z', [
    { start: '2026-10-05T10:00:00.000Z', end: '2026-10-05T11:00:00.000Z' },
  ]);
  assert.deepEqual(slots.map((slot) => slot.start), ['2026-10-05T11:30:00.000Z', '2026-10-05T12:00:00.000Z']);
});

test('EMP-002 returns no slots outside configured working days', () => {
  const slots = findEMP002AvailableSlots(config, 'consultation', '2026-10-06T00:00:00.000Z', []);
  assert.deepEqual(slots, []);
});

test('EMP-002 rejects services not configured for the tenant', () => {
  assert.throws(() => findEMP002AvailableSlots(config, 'unknown', '2026-10-05T00:00:00.000Z', []), /EMP002_SERVICE_NOT_CONFIGURED/);
});
