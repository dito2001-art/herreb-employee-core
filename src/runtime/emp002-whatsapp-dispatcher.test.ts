import { describe, expect, it } from 'vitest';
import { InMemoryWhatsAppSchedulingDispatchStore } from './emp002-whatsapp-dispatch-store';

describe('EMP-002 WhatsApp scheduling dispatch store', () => {
  it('isolates active conversations by tenant and number', async () => {
    const store = new InMemoryWhatsAppSchedulingDispatchStore();
    const base: any = { contactId: 'c1', whatsapp: '+595981000000', timezone: 'America/Asuncion', requests: [], state: { recovery: { status: 'OFFER_PENDING' } } };
    await store.save({ ...base, tenantId: 'tenant-a' });
    expect(await store.findActiveByWhatsapp('tenant-a', '595981000000')).toBeTruthy();
    expect(await store.findActiveByWhatsapp('tenant-b', '595981000000')).toBeUndefined();
  });

  it('does not expose completed/non-pending conversations', async () => {
    const store = new InMemoryWhatsAppSchedulingDispatchStore();
    await store.save({ tenantId: 'tenant-a', contactId: 'c1', whatsapp: '+595981000000', timezone: 'America/Asuncion', requests: [], state: { recovery: { status: 'COMPLETED' } } as any });
    expect(await store.findActiveByWhatsapp('tenant-a', '+595981000000')).toBeUndefined();
  });
});
