import type { EMP002WorkersAI } from './emp002-operations-transports';
import type { EMP002WhatsAppConversation } from './emp002-whatsapp-conversation-store';

const MODEL = '@cf/zai-org/glm-4.7-flash';

function responseText(value: unknown): string {
  if (!value || typeof value !== 'object') throw new Error('EMP002_AI_EMPTY_RESPONSE');
  const result = value as Record<string, unknown>;
  const text = result.response ?? result.text;
  if (typeof text !== 'string' || !text.trim()) throw new Error('EMP002_AI_TEXT_MISSING');
  return text.trim();
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
