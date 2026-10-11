import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateEMP002WhatsAppReply, generateEMP002CalendarReply, parseEMP002OwnerCalendarCommand } from './emp002-whatsapp-ai';

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

  it('parses an explicit owner CREATE deterministically without Workers AI', async () => {
    const command = await parseEMP002OwnerCalendarCommand(
      undefined,
      'Agendá una reunión temporal llamada "[TEMP] EMP-002 Owner Operations Certification" para mañana a las 16:00, duración 30 minutos.',
      '2026-10-07T17:20:00.000Z',
    );
    assert.deepEqual(command, {
      operation: 'create',
      title: '[TEMP] EMP-002 Owner Operations Certification',
      startTime: '2026-10-08T16:00:00',
      endTime: '2026-10-08T16:30:00',
      timezone: 'America/Asuncion',
    });
  });
});

describe('EMP-002 calendar reply grounded in CRM', () => {
  const question = 'Reuniones de mañana\nResolved calendar period: 2026-10-12T00:00:00-03:00 to 2026-10-13T00:00:00-03:00 (exclusive).';
  it('uses the CRM record and exact date without calling AI', async () => {
    const ai = { async run(): Promise<never> { throw new Error('AI called'); } };
    const reply = await generateEMP002CalendarReply(ai, question, { data: [{ title: 'Reunión comercial', activityType: 'Reunión', startTime: '10:30' }] });
    assert.match(reply, /2026-10-12/);
    assert.match(reply, /Reunión comercial/);
  });
  it('reports no meetings for the resolved date when CRM returns none', async () => {
    const reply = await generateEMP002CalendarReply(undefined, question, { data: [] });
    assert.equal(reply, 'No encontré reuniones para el 2026-10-12 en el CRM HerreB.');
  });
  it('does not mislabel CRM tasks as meetings', async () => {
    const reply = await generateEMP002CalendarReply(undefined, question, { data: [
      { title: 'Llamar a cliente', activityType: 'Tarea', startTime: '09:00' },
      { title: 'Reunión comercial', activityType: 'Reunión', startTime: '10:00' },
    ] });
    assert.match(reply, /Reunión comercial/);
    assert.doesNotMatch(reply, /Llamar a cliente/);
  });
  it('labels a multi-day window without claiming all meetings are on day one', async () => {
    const rangeQuestion = 'Mi agenda semanal\\nResolved calendar period: 2026-10-12T00:00:00-03:00 to 2026-10-19T00:00:00-03:00 (exclusive).'.replace('\\n', '\n');
    const reply = await generateEMP002CalendarReply(undefined, rangeQuestion, { data: [{ title: 'Reunión de equipo', activityType: 'Reunión' }] });
    assert.match(reply, /2026-10-12 al 2026-10-19/);
  });
  it('rejects malformed CRM data', async () => {
    await assert.rejects(() => generateEMP002CalendarReply(undefined, question, {}), /EMP002_CALENDAR_DATA_INVALID/);
  });
});
