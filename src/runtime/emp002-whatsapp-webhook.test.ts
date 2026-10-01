import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractMetaTextMessages, resolveWebhookTenant, verifyMetaWebhook } from './emp002-whatsapp-webhook';

describe('EMP-002 Meta WhatsApp webhook', () => {
  it('extracts text messages and resolves tenant by receiving phone id', () => {
    const messages = extractMetaTextMessages({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-a' }, messages: [{ id: 'wamid.1', from: '595981000000', type: 'text', text: { body: 'acepto' } }] } }] }] });
    assert.equal(messages.length, 1);
    assert.equal(resolveWebhookTenant(messages[0]?.phoneNumberId, [{ tenantId: 'tenant-a', phoneNumberId: 'phone-a' }, { tenantId: 'tenant-b', phoneNumberId: 'phone-b' }]), 'tenant-a');
  });

  it('does not resolve unknown phone ids across tenants', () => {
    assert.equal(resolveWebhookTenant('unknown', [{ tenantId: 'tenant-a', phoneNumberId: 'phone-a' }]), undefined);
  });

  it('validates Meta verification token', async () => {
    const ok = verifyMetaWebhook('https://employee.herreb.com/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=123', 'secret');
    assert.equal(ok?.status, 200);
    assert.equal(await ok?.text(), '123');
    assert.equal(verifyMetaWebhook('https://employee.herreb.com/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123', 'secret')?.status, 403);
  });
});
