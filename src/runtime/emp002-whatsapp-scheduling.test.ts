import { describe, expect, it } from 'vitest';
import {
  classifyExternalSchedulingReply,
  executeSchedulingCommunicationCommands,
} from './emp002-whatsapp-scheduling';
import type { WhatsAppTransport } from '../adapters/whatsapp';

const whatsapp: WhatsAppTransport = {
  async sendText(message) {
    return {
      ok: true,
      provider: 'meta-cloud-api',
      messageId: 'wamid.test',
      status: 200,
      tenantId: message.tenantId,
      correlationId: message.correlationId,
    };
  },
};

describe('EMP-002 WhatsApp scheduling bridge', () => {
  it('sends SEND_SLOT_OFFER to the external contact', async () => {
    const result = await executeSchedulingCommunicationCommands({
      tenantId: 'tenant-a',
      correlationId: 'corr-1',
      whatsapp,
      contacts: {
        'contact-1': { id: 'contact-1', whatsapp: '+595981000000' },
      },
      result: {
        state: {} as any,
        commands: [{
          type: 'SEND_SLOT_OFFER',
          idempotencyKey: 'offer-1',
          contactId: 'contact-1',
          requestId: 'request-1',
          expiresAt: '2026-10-02T15:00:00-03:00',
        }],
      },
    });

    expect(result).toEqual([{
      commandType: 'SEND_SLOT_OFFER',
      idempotencyKey: 'offer-1',
      ok: true,
      messageId: 'wamid.test',
    }]);
  });

  it('classifies common customer replies', () => {
    expect(classifyExternalSchedulingReply('ACEPTO')).toBe('ACCEPT');
    expect(classifyExternalSchedulingReply('sí')).toBe('ACCEPT');
    expect(classifyExternalSchedulingReply('no me sirve')).toBe('DECLINE');
    expect(classifyExternalSchedulingReply('qué horario?')).toBe('UNKNOWN');
  });
});
