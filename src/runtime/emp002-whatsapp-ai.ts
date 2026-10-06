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
      content: [
        'You are EMP-002 AI Assistant answering the verified tenant owner about the HerreB CRM agenda.',
        'Use ONLY the CRM tool result supplied below. Never invent records, systems, access limitations, dates, times, statuses, or facts.',
        'The CRM tasks collection can contain different activity types. Preserve each record activityType exactly for classification: Reunión is a meeting; Tarea is a task. Do not call meetings pendientes or tasks reuniones.',
        'For a general agenda question, include all returned relevant records and group them under Reuniones and Tareas when both types exist. If only one type exists, use that type as the label.',
        'If the user explicitly asks only for reuniones/citas/eventos, answer only with meeting-like records. If the user explicitly asks for tareas/pendientes, answer only with task-like records.',
        'Preserve titles and times from the CRM. Order timed records chronologically. Do not infer a time when none is supplied.',
        'If the tool result contains no matching records, say clearly that there are none in the requested period.',
        'Keep the WhatsApp answer concise, natural, and in the same language as the user.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Question: ${question}\nCRM agenda result: ${JSON.stringify(calendarOutput)}`,
    },
  ];
  return responseText(await ai.run(MODEL, { messages }));
}


export type EMP002OwnerCalendarCommand =
  | { operation: 'none' }
  | { operation: 'create'; title: string; startTime: string; endTime: string; timezone: string; description?: string }
  | { operation: 'update'; query: string; changes: { startDate?: string; endDate?: string; startTime?: string; endTime?: string; title?: string } }
  | { operation: 'delete'; query: string };

function jsonObjectFromText(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('EMP002_OWNER_COMMAND_JSON_MISSING');
  const parsed = JSON.parse(fenced.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('EMP002_OWNER_COMMAND_INVALID');
  return parsed as Record<string, unknown>;
}

export async function parseEMP002OwnerCalendarCommand(
  ai: EMP002WorkersAI | undefined,
  text: string,
  nowIso: string,
  timezone = 'America/Asuncion',
): Promise<EMP002OwnerCalendarCommand> {
  if (!ai) throw new Error('EMP002_WORKERS_AI_MISSING');
  const messages = [
    {
      role: 'system',
      content: [
        'Classify a verified business owner WhatsApp message for calendar mutation.',
        'Return JSON only. Allowed operation values: none, create, update, delete.',
        'Never invent missing title, target, date or time.',
        'For create require title and an explicit or relative date/time resolvable from NOW; return ISO startTime and endTime. Default duration is 60 minutes only when start is clear and end/duration is omitted.',
        'For update/delete return query containing the user target description. For update return only explicit requested changes using CRM fields startDate,endDate,startTime,endTime,title.',
        'If the message is only asking/reading agenda, operation is none.',
        'If required mutation information is ambiguous or missing, operation is none.',
      ].join(' '),
    },
    { role: 'user', content: `NOW=${nowIso}\nTIMEZONE=${timezone}\nMESSAGE=${text}` },
  ];
  const raw = responseText(await ai.run(MODEL, { messages }));
  const value = jsonObjectFromText(raw);
  const operation = value.operation;
  if (operation === 'none') return { operation: 'none' };
  if (operation === 'create') {
    const title = nonEmptyText(value.title); const startTime = nonEmptyText(value.startTime); const endTime = nonEmptyText(value.endTime);
    if (!title || !startTime || !endTime) return { operation: 'none' };
    return { operation, title, startTime, endTime, timezone: nonEmptyText(value.timezone) ?? timezone, description: nonEmptyText(value.description) };
  }
  if (operation === 'update') {
    const query = nonEmptyText(value.query); const changes = value.changes;
    if (!query || !changes || typeof changes !== 'object' || Array.isArray(changes)) return { operation: 'none' };
    const allowed = Object.fromEntries(Object.entries(changes as Record<string, unknown>).filter(([key, item]) => ['startDate','endDate','startTime','endTime','title'].includes(key) && typeof item === 'string' && item.trim()));
    if (!Object.keys(allowed).length) return { operation: 'none' };
    return { operation, query, changes: allowed };
  }
  if (operation === 'delete') {
    const query = nonEmptyText(value.query);
    return query ? { operation, query } : { operation: 'none' };
  }
  return { operation: 'none' };
}
