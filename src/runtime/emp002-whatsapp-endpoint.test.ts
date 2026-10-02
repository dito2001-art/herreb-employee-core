import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleMetaWhatsAppWebhook, type RoutedWhatsAppInbound } from './emp002-whatsapp-endpoint';

describe('EMP-002 Meta webhook endpoint', () => {
  it('routes inbound text to the correct tenant dispatcher', async () => {
    const dispatched: RoutedWhatsAppInbound[] = [];
    const request = new Request('https://employee.herreb.com/webhooks/meta/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-a' }, messages: [{ id: 'wamid.1', from: '595981000000', timestamp: '1790884800', type: 'text', text: { body: 'acepto' } }] } }] }] }) });
    const response = await handleMetaWhatsAppWebhook(request, { WHATSAPP_TENANT_ROUTES_JSON: JSON.stringify([{ tenantId: 'tenant-a', phoneNumberId: 'phone-a' }]) }, async (message) => { dispatched.push(message); });
    assert.equal(response.status, 200);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0]?.tenantId, 'tenant-a');
    assert.equal(dispatched[0]?.body, 'acepto');
  });

  it('acknowledges but ignores an unassigned receiving number', async () => {
    let count = 0;
    const request = new Request('https://employee.herreb.com/webhooks/meta/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'unknown' }, messages: [{ id: 'wamid.2', from: '595981000000', type: 'text', text: { body: 'acepto' } }] } }] }] }) });
    const response = await handleMetaWhatsAppWebhook(request, { WHATSAPP_TENANT_ROUTES_JSON: '[]' }, async () => { count += 1; });
    assert.equal(response.status, 200);
    assert.equal(count, 0);
  });
});
