import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateEMP002WhatsAppReply } from './emp002-whatsapp-ai';

describe('EMP-002 general WhatsApp AI', () => {
  it('passes persisted conversation history to Workers AI and returns legacy response text', async () => {
    let received: unknown;
    const ai = {
      async run(_model: string, input: unknown) {
        received = input;
        return { response: 'Hola, ¿en qué te puedo ayudar?' };
      },
    };
    const reply = await generateEMP002WhatsAppReply(ai, {
      tenantId: 'tenant-a',
      whatsapp: '595981000000',
      updatedAt: '2026-10-02T12:00:00.000Z',
      messages: [{ role: 'user', content: 'Hola', at: '2026-10-02T12:00:00.000Z', messageId: 'wamid.1' }],
    });
    assert.equal(reply, 'Hola, ¿en qué te puedo ayudar?');
    assert.ok(received && typeof received === 'object');
    const messages = (received as { messages: Array<{ role: string; content: string }> }).messages;
    assert.equal(messages.at(-1)?.role, 'user');
    assert.equal(messages.at(-1)?.content, 'Hola');
    assert.match(messages[0]?.content ?? '', /external contact/i);
  });

  it('parses the GLM OpenAI-compatible chat completion shape returned by Workers AI', async () => {
    const ai = {
      async run() {
        return {
          id: 'chatcmpl-1',
          object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Soy EMP-002. ¿En qué te ayudo?' }, finish_reason: 'stop' }],
        };
      },
    };
    const reply = await generateEMP002WhatsAppReply(ai, {
      tenantId: 'tenant-a',
      whatsapp: '595981000000',
      updatedAt: '2026-10-02T12:00:00.000Z',
      messages: [{ role: 'user', content: 'Hola', at: '2026-10-02T12:00:00.000Z', messageId: 'wamid.2' }],
    });
    assert.equal(reply, 'Soy EMP-002. ¿En qué te ayudo?');
  });

  it('parses multipart chat content defensively', async () => {
    const ai = {
      async run() {
        return { choices: [{ message: { content: [{ type: 'text', text: 'Hola ' }, { type: 'text', text: 'Dito' }] } }] };
      },
    };
    const reply = await generateEMP002WhatsAppReply(ai, {
      tenantId: 'tenant-a', whatsapp: '595981000000', updatedAt: '', messages: [],
    });
    assert.equal(reply, 'Hola Dito');
  });

  it('fails closed when Workers AI is unavailable', async () => {
    await assert.rejects(
      () => generateEMP002WhatsAppReply(undefined, { tenantId: 'tenant-a', whatsapp: '595981000000', updatedAt: '', messages: [] }),
      /EMP002_WORKERS_AI_MISSING/,
    );
  });

  it('rejects an AI result without usable text', async () => {
    await assert.rejects(
      () => generateEMP002WhatsAppReply({ async run() { return {}; } }, { tenantId: 'tenant-a', whatsapp: '595981000000', updatedAt: '', messages: [] }),
      /EMP002_AI_TEXT_MISSING/,
    );
  });
});
