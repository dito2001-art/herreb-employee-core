import { describe, expect, it } from 'vitest';
import { extractMetaTextMessages, resolveWebhookTenant, verifyMetaWebhook } from './emp002-whatsapp-webhook';

describe('EMP-002 Meta WhatsApp webhook', () => {
  it('extracts text messages and resolves tenant by receiving phone id', () => {
    const messages = extractMetaTextMessages({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-a' }, messages: [{ id: 'wamid.1', from: '595981000000', type: 'text', text: { body: 'acepto' } }] } }] }] });
    expect(messages).toHaveLength(1);
    expect(resolveWebhookTenant(messages[0]?.phoneNumberId, [{ tenantId: 'tenant-a', phoneNumberId: 'phone-a' }, { tenantId: 'tenant-b', phoneNumberId: 'phone-b' }])).toBe('tenant-a');
  });

  it('does not resolve unknown phone ids across tenants', () => {
    expect(resolveWebhookTenant('unknown', [{ tenantId: 'tenant-a', phoneNumberId: 'phone-a' }])).toBeUndefined();
  });

  it('validates Meta verification token', async () => {
    const ok = verifyMetaWebhook('https://employee.herreb.com/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=123', 'secret');
    expect(ok?.status).toBe(200);
    expect(await ok?.text()).toBe('123');
    expect(verifyMetaWebhook('https://employee.herreb.com/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123', 'secret')?.status).toBe(403);
  });
});
