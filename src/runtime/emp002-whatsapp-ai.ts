import type { EMP002WorkersAI } from './emp002-operations-transports';
import type { EMP002WhatsAppConversation } from './emp002-whatsapp-conversation-store';

const MODEL = '@cf/zai-org/glm-4.7-flash';

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function responseText(value: unknown): string {
  if (!value || typeof value !== 'object') throw new Error('EMP002_AI_EMPTY_RESPONSE');
  const result = value as Record<string, unknown>;

  const legacy = nonEmptyText(result.response) ?? nonEmptyText(result.text);
  if (legacy) return legacy;

  const choices = Array.isArray(result.choices) ? result.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue;
    const item = choice as Record<string, unknown>;
    const direct = nonEmptyText(item.text);
    if (direct) return direct;
    const message = item.message;
    if (!message || typeof message !== 'object') continue;
    const content = (message as Record<string, unknown>).content;
    const messageText = nonEmptyText(content);
    if (messageText) return messageText;
    if (Array.isArray(content)) {
      const parts = content
        .map((part) => {
          if (typeof part === 'string') return part.trim();
          if (!part || typeof part !== 'object') return '';
          return nonEmptyText((part as Record<string, unknown>).text) ?? '';
        })
        .filter(Boolean);
      if (parts.length) return parts.join(' ').trim();
    }
  }

  throw new Error('EMP002_AI_TEXT_MISSING');
}

export async function generateEMP002WhatsAppReply(
  ai: EMP002WorkersAI | undefined,
  conversation: EMP002WhatsAppConversation,
): Promise<string> {
  if (!ai) throw new Error('EMP002_WORKERS_AI_MISSING');
  const messages = [
    {
      role: 'system',
      content: 'You are EMP-002 AI Assistant. Reply naturally and concisely for WhatsApp. This is an external contact, not a verified tenant owner. Never claim privileged actions were executed. Never expose internal implementation details.',
    },
    ...conversation.messages.map(({ role, content }) => ({ role, content })),
  ];
  return responseText(await ai.run(MODEL, { messages }));
}

export async function generateEMP002CalendarReply(
  ai: EMP002WorkersAI | undefined,
  question: string,
  calendarOutput: unknown,
): Promise<string> {
  if (!ai) throw new Error('EMP002_WORKERS_AI_MISSING');
  const messages = [
    {
      role: 'system',
      content: 'You are EMP-002 AI Assistant answering the verified tenant owner about their calendar. Use ONLY the calendar tool result supplied below. Never invent events, systems, access limitations, or facts. If the result contains no events, say clearly that there are no events in the requested period. Keep the WhatsApp answer concise and in the same language as the user.',
    },
    {
      role: 'user',
      content: `Question: ${question}\nCalendar tool result: ${JSON.stringify(calendarOutput)}`,
    },
  ];
  return responseText(await ai.run(MODEL, { messages }));
}
