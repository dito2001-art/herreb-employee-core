import assert from 'node:assert/strict';
import test from 'node:test';
import { executePreparedAppointmentAction } from './emp002-appointment-action-executor';
import type { PreparedAppointmentAction } from './emp002-appointment-action-processor';
import type { WhatsAppTransport } from '../adapters/whatsapp';

const prepared: PreparedAppointmentAction = {
  status: 'PREPARED',
  appointment: { appointmentId: 'appt-1', tenantId: 'tenant-a', state: 'CONFIRMED', startsAt: '2026-10-10T15:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' },
  action: { tenantId: 'tenant-a', appointmentId: 'appt-1', actionKey: 'reminder:appt-1:120', kind: 'REMINDER', dueAt: '2026-10-10T13:00:00.000Z', payload: { whatsapp: '+595981000000' } },
};

test('action becomes EXECUTED only with provider message id', async () => {
  const transport: WhatsAppTransport = { async sendText(message) { return { ok: true, provider: 'meta-cloud-api', messageId: 'wamid.123', status: 200, tenantId: message.tenantId, correlationId: message.correlationId }; } };
  const result = await executePreparedAppointmentAction(prepared, transport);
  assert.equal(result.status, 'EXECUTED');
  if (result.status === 'EXECUTED') { assert.equal(result.providerMessageId, 'wamid.123'); assert.equal(result.actionKey, prepared.action.actionKey); }
});

test('2xx-shaped transport result without message id is retryable, never EXECUTED', async () => {
  const transport: WhatsAppTransport = { async sendText(message) { return { ok: true, provider: 'meta-cloud-api', messageId: null, status: 200, tenantId: message.tenantId, correlationId: message.correlationId }; } };
  const result = await executePreparedAppointmentAction(prepared, transport);
  assert.equal(result.status, 'FAILED_RETRYABLE');
});

test('provider exception remains retryable', async () => {
  const transport: WhatsAppTransport = { async sendText() { throw new Error('META_WHATSAPP_HTTP_ERROR:503'); } };
  const result = await executePreparedAppointmentAction(prepared, transport);
  assert.deepEqual(result, { actionKey: prepared.action.actionKey, appointmentId: 'appt-1', status: 'FAILED_RETRYABLE', error: 'META_WHATSAPP_HTTP_ERROR:503' });
});

test('missing recipient never calls provider and remains retryable', async () => {
  let calls = 0;
  const transport: WhatsAppTransport = { async sendText(message) { calls += 1; return { ok: true, provider: 'meta-cloud-api', messageId: 'wamid.x', status: 200, tenantId: message.tenantId, correlationId: message.correlationId }; } };
  const item = { ...prepared, action: { ...prepared.action, payload: {} } };
  const result = await executePreparedAppointmentAction(item, transport);
  assert.equal(result.status, 'FAILED_RETRYABLE'); assert.equal(calls, 0);
});
