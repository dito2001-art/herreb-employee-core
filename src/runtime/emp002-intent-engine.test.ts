import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEMP002SchedulingIntent } from './emp002-intent-engine';

const cases = [
  ['¿Qué horarios tenés mañana?', 'CHECK_AVAILABILITY'],
  ['Agendame una reunión mañana a las 15', 'CREATE_APPOINTMENT'],
  ['Pasá mi reunión con Lucas para mañana a las 15', 'RESCHEDULE_APPOINTMENT'],
  ['Cancelá mi reunión con Lucas', 'CANCEL_APPOINTMENT'],
  ['Confirmá el turno de mañana', 'CONFIRM_APPOINTMENT'],
] as const;

for (const [text, expected] of cases) {
  test(`EMP-002 classifies ${expected}`, () => {
    const result = classifyEMP002SchedulingIntent(text);
    assert.equal(result.intent, expected);
    assert.equal(result.confidence, 'HIGH');
  });
}

test('EMP-002 does not invent an operational intent', () => {
  const result = classifyEMP002SchedulingIntent('Hola, ¿cómo estás?');
  assert.equal(result.intent, 'UNKNOWN');
  assert.equal(result.confidence, 'LOW');
});
