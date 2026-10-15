import type { EMP002WorkersAI } from './emp002-operations-transports';
import type { EMP002WhatsAppConversation } from './emp002-whatsapp-conversation-store';
import { resolveEMP002CalendarQueryWindow } from './emp002-calendar-query';

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
  _ai: EMP002WorkersAI | undefined,
  question: string,
  calendarOutput: unknown,
): Promise<string> {
  // Calendar reads are factual operations. Never ask a language model to
  // reinterpret dates, invent meetings, or delay an otherwise completed read.
  const period = question.match(/Resolved calendar period:\s*(\d{4}-\d{2}-\d{2})T[^\s]+\s+to\s+(\d{4}-\d{2}-\d{2})T/i);
  if (!period) throw new Error('EMP002_CALENDAR_PERIOD_MISSING');
  const payload = calendarOutput && typeof calendarOutput === 'object' && !Array.isArray(calendarOutput)
    ? calendarOutput as Record<string, unknown> : null;
  if (!payload || !Array.isArray(payload.data)) throw new Error('EMP002_CALENDAR_DATA_INVALID');
  const onlyMeetings = /\b(reuni[oó]n(?:es)?|cita(?:s)?|eventos?)\b/i.test(question) && !/\b(agenda|tareas|pendientes)\b/i.test(question);
  const onlyTasks = /\b(tareas|pendientes)\b/i.test(question) && !/\b(agenda|reuni[oó]n(?:es)?)\b/i.test(question);
  const records = payload.data.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
  const selected = records.filter((record) => {
    const type = String(record.activityType ?? '').toLocaleLowerCase('es');
    const meeting = /reuni[oó]n|cita|evento/.test(type);
    return onlyMeetings ? meeting : onlyTasks ? !meeting : true;
  });
  const date = period[1];
  const endDate = period[2];
  const nextDay = new Date(`${date}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const dateLabel = endDate === nextDay.toISOString().slice(0, 10) ? `el ${date}` : `del ${date} al ${endDate} (fin exclusivo)`;
  const label = onlyMeetings ? 'reuniones' : onlyTasks ? 'tareas' : 'actividades';
  if (!selected.length) return `No encontré ${label} para ${dateLabel} en el CRM HerreB.`;
  const ordered = selected.sort((a, b) => String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')));
  const lines = ordered.map((record) => {
    const title = String(record.title ?? record.name ?? 'Sin título').trim();
    const type = String(record.activityType ?? 'Actividad');
    const rawTime = String(record.startTime ?? '');
    const time = rawTime.match(/(?:T|^)(\d{2}:\d{2})/)?.[1];
    return `• ${title} (${type})${time ? ` — ${time}` : ''}`;
  });
  return `Para ${dateLabel}, encontré ${selected.length} ${label} en el CRM HerreB:\n${lines.join('\n')}`;
}

export type EMP002OwnerCalendarCommand =
  | { operation: 'none' }
  | { operation: 'create'; title: string; startTime: string; endTime: string; timezone: string; description?: string }
  | { operation: 'update'; query: string; changes: { startDate?: string; endDate?: string; startTime?: string; endTime?: string; title?: string } }
  | { operation: 'delete'; query: string };

function normalizeCalendarDateTime(value: string): string | undefined {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (iso) return `${iso[1]}T${iso[2]}:${iso[3]}:00`;
  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  return dateOnly ? undefined : undefined;
}

function parseDeterministicOwnerCreate(text: string, nowIso: string, timezone: string): EMP002OwnerCalendarCommand | undefined {
  const value = text.trim();
  if (!/\b(agend|cre|program|reserv)[a-záéíóúñ]*/i.test(value)) return undefined;
  const time = value.match(/\b(?:a\s+las?|a\s+la|las?)\s+(\d{1,2})(?::(\d{2}))?/i);
  if (!time) return undefined;
  const hour = Number(time[1]); const minute = Number(time[2] ?? '0');
  if (hour > 23 || minute > 59) return undefined;
  const title = value.match(/["“”']([^"“”']+)["“”']/)?.[1]?.trim();
  if (!title) return undefined;
  const date = resolveEMP002CalendarQueryWindow(value, new Date(nowIso)).timeMin.slice(0, 10);
  const duration = Number(value.match(/\bduraci[oó]n\s+(\d+)\s*min/i)?.[1] ?? '60');
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) return undefined;
  const start = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);
  const end = new Date(start.getTime() + duration * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(end);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { operation: 'create', title, startTime: `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`, endTime: `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00`, timezone };
}

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
  const deterministic = parseDeterministicOwnerCreate(text, nowIso, timezone);
  if (deterministic) return deterministic;
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
    const title = nonEmptyText(value.title); const rawStartTime = nonEmptyText(value.startTime); const rawEndTime = nonEmptyText(value.endTime);
    const startTime = rawStartTime ? normalizeCalendarDateTime(rawStartTime) : undefined;
    const endTime = rawEndTime ? normalizeCalendarDateTime(rawEndTime) : undefined;
    if (!title || !startTime || !endTime) return { operation: 'none' };
    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) return { operation: 'none' };
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
