const TIMEZONE = 'America/Asuncion';

export interface EMP002CalendarQueryWindow {
  timeMin: string;
  timeMax: string;
}

export function normalizeWhatsApp(value: string | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function isVerifiedEMP002Owner(from: string, configuredOwner: string | undefined): boolean {
  const owner = normalizeWhatsApp(configuredOwner);
  return owner.length >= 8 && normalizeWhatsApp(from) === owner;
}

export function isEMP002CalendarReadIntent(text: string): boolean {
  const value = text.toLocaleLowerCase('es');
  const calendarTerms = /\b(agenda|calendario|reuni[oó]n(?:es)?|cita(?:s)?|evento(?:s)?|compromiso(?:s)?|programad[oa]s?|agendad[oa]s?)\b/i;
  const possession = /\b(tengo|tendr[eé]|mi|mis|qu[eé]\s+tengo|qu[eé]\s+hay)\b/i;
  const timeTerms = /\b(hoy|ma[ñn]ana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|semana|fin\s+de\s+semana)\b/i;
  // Mutation verbs must be handled by the owner command parser, even when the\n  // message also contains calendar nouns/time terms (for example: \"Agendá una reunión mañana\").\n  const mutationTerms = /\\b(agend[aá]|cre[aá]|program[aá]|reserv[aá]|mov[eé]|reprogram[aá]|cambi[aá]|modific[aá]|actualiz[aá]|cancel[aá]|elimin[aá]|borr[aá])\\b/i;\n  if (mutationTerms.test(value)) return false;\n  return calendarTerms.test(value) || (possession.test(value) && timeTerms.test(value));
}

function asuncionToday(now: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), weekday: weekdays[get('weekday')] ?? 0 };
}

function addDays(date: { year: number; month: number; day: number }, days: number) {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function isoDate(date: { year: number; month: number; day: number }): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function offsetFor(date: { year: number; month: number; day: number }): string {
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, timeZoneName: 'longOffset' })
    .formatToParts(probe)
    .find((item) => item.type === 'timeZoneName')?.value;
  const match = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return match?.[1] ?? '-03:00';
}

function dayWindow(date: { year: number; month: number; day: number }): EMP002CalendarQueryWindow {
  const next = addDays(date, 1);
  return {
    timeMin: `${isoDate(date)}T00:00:00${offsetFor(date)}`,
    timeMax: `${isoDate(next)}T00:00:00${offsetFor(next)}`,
  };
}

export function resolveEMP002CalendarQueryWindow(text: string, now = new Date()): EMP002CalendarQueryWindow {
  const value = text.toLocaleLowerCase('es');
  const today = asuncionToday(now);
  const base = { year: today.year, month: today.month, day: today.day };

  if (/\bma[ñn]ana\b/i.test(value)) return dayWindow(addDays(base, 1));
  if (/\bhoy\b/i.test(value)) return dayWindow(base);

  const weekdays: Array<[RegExp, number]> = [
    [/\bdomingo\b/i, 0], [/\blunes\b/i, 1], [/\bmartes\b/i, 2], [/\bmi[eé]rcoles\b/i, 3],
    [/\bjueves\b/i, 4], [/\bviernes\b/i, 5], [/\bs[aá]bado\b/i, 6],
  ];
  for (const [pattern, target] of weekdays) {
    if (!pattern.test(value)) continue;
    let delta = (target - today.weekday + 7) % 7;
    if (delta === 0 && !/\bhoy\b/i.test(value)) delta = 7;
    return dayWindow(addDays(base, delta));
  }

  if (/\bsemana\b/i.test(value)) {
    const mondayDelta = (1 - today.weekday + 7) % 7;
    const start = addDays(base, mondayDelta);
    const end = addDays(start, 7);
    return {
      timeMin: `${isoDate(start)}T00:00:00${offsetFor(start)}`,
      timeMax: `${isoDate(end)}T00:00:00${offsetFor(end)}`,
    };
  }

  return dayWindow(base);
}
