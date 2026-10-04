import assert from 'node:assert/strict';
import test from 'node:test';
import { MetaWhatsAppTransport } from './whatsapp-meta';

const originalFetch = globalThis.fetch;
const message = {
  tenantId: 'tenant-a',
  to: '+595981000000',
  body: 'Recordatorio de tu cita',
  audience: 'EXTERNAL_CONTACT' as const,
  correlationId: 'corr-1',
  idempotencyKey: 'reminder:appt-1:120',
};

function transport() {
  return new MetaWhatsAppTransport({ META_ACCESS_TOKEN: 'secret', META_PHONE_NUMBER_ID: '123', META_GRAPH_VERSION: 'v26.0' });
}

test.afterEach(() => { globalThis.fetch = originalFetch; });

test('Meta send succeeds only with provider message id', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.abc' }] }), { status: 200 });
  const result = await transport().sendText(message);
  assert.equal(result.ok, true);
  assert.equal(result.messageId, 'wamid.abc');
  assert.equal(result.provider, 'meta-cloud-api');
});

test('Meta 2xx without message id is not execution evidence', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ messages: [{}] }), { status: 200 });
  await assert.rejects(() => transport().sendText(message), /META_WHATSAPP_PROVIDER_EVIDENCE_MISSING/);
});

test('Meta invalid 2xx response is not execution evidence', async () => {
  globalThis.fetch = async () => new Response('not-json', { status: 200 });
  await assert.rejects(() => transport().sendText(message), /META_WHATSAPP_PROVIDER_EVIDENCE_MISSING/);
});

test('Meta HTTP failure exposes status but never response payload', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ access_token: 'do-not-leak', error: { message: 'private upstream detail' } }), { status: 500 });
  await assert.rejects(
    () => transport().sendText(message),
    (error: Error) => error.message === 'META_WHATSAPP_HTTP_ERROR:500' && !error.message.includes('do-not-leak') && !error.message.includes('private upstream detail'),
  );
});
