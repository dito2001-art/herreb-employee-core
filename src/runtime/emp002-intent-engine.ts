export type EMP002SchedulingIntent =
  | 'CHECK_AVAILABILITY'
  | 'CREATE_APPOINTMENT'
  | 'RESCHEDULE_APPOINTMENT'
  | 'CANCEL_APPOINTMENT'
  | 'CONFIRM_APPOINTMENT'
  | 'UNKNOWN';

export interface EMP002SchedulingIntentResult {
  intent: EMP002SchedulingIntent;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  originalText: string;
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export function classifyEMP002SchedulingIntent(text: string): EMP002SchedulingIntentResult {
  const value = normalize(text);

  const rules: Array<[EMP002SchedulingIntent, RegExp]> = [
    ['CANCEL_APPOINTMENT', /\b(cancel|cancela|cancelar|anula|anular|suspende|suspender)\w*\b/],
    ['RESCHEDULE_APPOINTMENT', /\b(reprogram|reagenda|reagend|mover|move|pasar|pasa|cambia|cambiar)\w*\b/],
    ['CONFIRM_APPOINTMENT', /\b(confirm|confirma|confirmar)\w*\b/],
    ['CHECK_AVAILABILITY', /\b(disponib|horario|hora libre|turno libre|cuando podes|cuando puede|que horas)\w*\b/],
    ['CREATE_APPOINTMENT', /\b(agenda|agendar|reserva|reservar|programa|programar|crea|crear)\w*\b/],
  ];

  for (const [intent, pattern] of rules) {
    if (pattern.test(value)) return { intent, confidence: 'HIGH', originalText: text };
  }

  return { intent: 'UNKNOWN', confidence: 'LOW', originalText: text };
}
