import test from 'node:test';
import assert from 'node:assert/strict';
import { MetaWhatsAppTransport } from './whatsapp-meta';

const message = {
  tenantId: 'herreb-client-0', to: '595981538641', body: 'Confirmación de prueba',
  audience: 'EXTERNAL_CONTACT' as const, correlationId: 'wa:fixture-1',
  idempotencyKey: 'emp002-native-create:fixture-1',
};

test('confirmed Meta rejection is surfaced without a successful delivery receipt', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response('{"error":"rejected"}', { status: 400 }); }) as typeof fetch;
  try {
    const transport = new MetaWhatsAppTransport({ META_ACCESS_TOKEN: 'fixture', META_PHONE_NUMBER_ID: 'fixture' });
    await assert.rejects(transport.sendText(message), /META_WHATSAPP_HTTP_ERROR:400/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('ambiguous Meta network failure is surfaced and never reported as sent', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new TypeError('connection closed after request'); }) as typeof fetch;
  try {
    const transport = new MetaWhatsAppTransport({ META_ACCESS_TOKEN: 'fixture', META_PHONE_NUMBER_ID: 'fixture' });
    await assert.rejects(transport.sendText(message), /connection closed after request/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('successful Meta response requires authoritative provider message id', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{"messages":[]}', { status: 200 })) as typeof fetch;
  try {
    const transport = new MetaWhatsAppTransport({ META_ACCESS_TOKEN: 'fixture', META_PHONE_NUMBER_ID: 'fixture' });
    await assert.rejects(transport.sendText(message), /META_WHATSAPP_PROVIDER_EVIDENCE_MISSING/);
  } finally { globalThis.fetch = original; }
});
