/** Draft business choices only. Never grants a channel, credential or calendar permission. */
export const closingChoices: Record<string, readonly string[]> = {
  offeringType: ['PRODUCTS', 'SERVICES', 'BOTH'],
  closingMode: ['MEETING', 'QUOTE', 'ORDER', 'MEETING_OR_ORDER', 'HUMAN'],
  calendarDestination: ['WORKFORCE', 'HERREB_CRM'],
  appointmentDuration: ['15', '30', '45', '60', '90', '120'],
  appointmentNotice: ['0', '30', '60', '120', '1440'],
  appointmentBuffer: ['0', '15', '30', '60'],
};
export const bookingFields: Record<string, number> = {
  offeringType: 20, closingMode: 30, calendarDestination: 20,
  appointmentTitle: 120, appointmentDuration: 3, appointmentTimezone: 80,
  appointmentNotice: 4, appointmentBuffer: 2, appointmentHours: 2000,
};
export type WorkingHours = {day: number; from: string; to: string};
export function parseWorkingHours(value: string): WorkingHours[] {
  const rows: unknown = JSON.parse(value);
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 21) throw Error('INVALID_APPOINTMENT_HOURS');
  const valid = (v: unknown): v is string => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(k => !['day','from','to'].includes(k)) ||
      !Number.isInteger(row.day) || row.day < 0 || row.day > 6 || !valid(row.from) || !valid(row.to) || row.from >= row.to)
      throw Error('INVALID_APPOINTMENT_HOURS');
  }
  const sorted = (rows as WorkingHours[]).slice().sort((a,b) => a.day-b.day || a.from.localeCompare(b.from));
  if (sorted.some((row,i) => i > 0 && row.day === sorted[i-1].day && row.from < sorted[i-1].to)) throw Error('INVALID_APPOINTMENT_HOURS');
  return sorted;
}
export function validateClosingField(key: string, value: string): void {
  if (Object.hasOwn(bookingFields,key) && value === "") return; // Incomplete drafts are saveable; exact validation reports missing fields.
  if (Object.hasOwn(closingChoices,key) && !closingChoices[key].includes(value)) throw Error('INVALID_CLOSING_CONFIGURATION');
  if (key === 'appointmentTimezone') {
    try { new Intl.DateTimeFormat('en',{timeZone:value}).format(); } catch { throw Error('INVALID_APPOINTMENT_TIMEZONE'); }
    if (!value.trim()) throw Error('INVALID_APPOINTMENT_TIMEZONE');
  }
  if (key === 'appointmentHours') { try { parseWorkingHours(value); } catch { throw Error('INVALID_APPOINTMENT_HOURS'); } }
}
export function closingIssues(profile: Record<string,string|boolean>): string[] {
  if (!['MEETING','MEETING_OR_ORDER'].includes(String(profile.closingMode))) return [];
  return ['calendarDestination','appointmentTitle','appointmentDuration','appointmentTimezone','appointmentNotice','appointmentBuffer','appointmentHours']
    .filter(key => typeof profile[key] !== 'string' || !String(profile[key]).trim());
}
