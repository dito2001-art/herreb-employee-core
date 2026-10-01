import { describe, expect, it } from 'vitest';
import { finalizeSlotConfirmation } from './emp002-confirmation-finalizer';
import type { WhatsAppTransport } from '../adapters/whatsapp';

const sent: any[] = [];
const whatsapp: WhatsAppTransport = {
  async sendText(message) {
    sent.push(message);
    return { ok: true, provider: 'meta-cloud-api', messageId: `wamid.${sent.length}`, status: 200, tenantId: message.tenantId, correlationId: message.correlationId };
  },
};

describe('EMP-002 confirmation finalizer', () => {
  it('completes recovery and notifies customer and owner only after verified execution', async () => {
    sent.length = 0;
    const state: any = {
      tenantId: 'tenant-a', correlationId: 'corr-1',
      goal: { id: 'goal-1', tenantId: 'tenant-a', contactId: 'contact-1', kind: 'WAITLIST_SLOT', status: 'WAITING_FOR_EXECUTION', objective: 'fill slot', confirmedFacts: {}, nextBestAction: 'CONFIRM_APPOINTMENT_AND_CLOSE_WAITLIST', createdAt: '2026-10-01T12:00:00-03:00', updatedAt: '2026-10-01T12:10:00-03:00', correlationId: 'corr-1' },
      recovery: { id: 'recovery-1', version: 2, tenantId: 'tenant-a', correlationId: 'corr-1', slot: { tenantId: 'tenant-a', resourceId: 'r1', startsAt: '2026-10-02T10:00:00-03:00', endsAt: '2026-10-02T10:30:00-03:00' }, status: 'FILLED', candidateRequestIds: ['req-1'], offers: [], filledByRequestId: 'req-1' },
    };
    const finalized = await finalizeSlotConfirmation({
      tenantId: 'tenant-a', correlationId: 'corr-1', now: '2026-10-01T12:11:00-03:00', state,
      executions: [{ commandType: 'CONFIRM_SLOT', idempotencyKey: 'confirm-1', ok: true, eventId: 'event-1', upstreamStatus: 200 }],
      contact: { id: 'contact-1', whatsapp: '+595981000000', displayName: 'Ana' }, ownerWhatsapp: '+595981111111', whatsapp,
    });
    expect(finalized.verified).toBe(true);
    expect(finalized.state.goal.status).toBe('COMPLETED');
    expect(finalized.notifications.map((item) => item.audience)).toEqual(['EXTERNAL_CONTACT', 'OWNER']);
    expect(sent).toHaveLength(2);
  });

  it('does not notify when Calendar execution failed', async () => {
    sent.length = 0;
    const state: any = { tenantId: 'tenant-a', correlationId: 'corr-1', goal: { id: 'g', tenantId: 'tenant-a', contactId: 'c', kind: 'WAITLIST_SLOT', status: 'WAITING_FOR_EXECUTION', objective: '', confirmedFacts: {}, nextBestAction: '', createdAt: '', updatedAt: '', correlationId: 'corr-1' } };
    const finalized = await finalizeSlotConfirmation({ tenantId: 'tenant-a', correlationId: 'corr-1', now: '2026-10-01T12:11:00-03:00', state, executions: [{ commandType: 'CONFIRM_SLOT', idempotencyKey: 'confirm-1', ok: false, error: 'CALENDAR_CONFIRMATION_FAILED' }], contact: { id: 'c', whatsapp: '+595981000000' }, whatsapp });
    expect(finalized.verified).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
