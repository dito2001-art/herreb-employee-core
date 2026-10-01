import { describe, expect, it } from 'vitest';
import { handleMetaWhatsAppWebhook } from './emp002-whatsapp-endpoint';

describe('EMP-002 Meta webhook endpoint', () => {
  it('routes inbound text to the correct tenant dispatcher', async () => {
    const dispatched: any[] = [];
    const request = new Request('https://employee.herreb.com/webhooks/meta/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-a' }, messages: [{ id: 'wamid.1', from: '595981000000', timestamp: '1790884800', type: 'text', text: { body: 'acepto' } }] } }] }] }) });
    const response = await handleMetaWhatsAppWebhook(request, { WHATSAPP_TENANT_ROUTES_JSON: JSON.stringify([{ tenantId: 'tenant-a', phoneNumberId: 'phone-a' }]) }, async (message) => { dispatched.push(message); });
    expect(response.status).toBe(200);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].tenantId).toBe('tenant-a');
    expect(dispatched[0].body).toBe('acepto');
  });

  it('acknowledges but ignores an unassigned receiving number', async () => {
    let count = 0;
    const request = new Request('https://employee.herreb.com/webhooks/meta/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'unknown' }, messages: [{ id: 'wamid.2', from: '595981000000', type: 'text', text: { body: 'acepto' } }] } }] }] }) });
    const response = await handleMetaWhatsAppWebhook(request, { WHATSAPP_TENANT_ROUTES_JSON: '[]' }, async () => { count += 1; });
    expect(response.status).toBe(200);
    expect(count).toBe(0);
  });
});
