import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEMP002CalendarQueryWindow } from './emp002-calendar-query';

describe('EMP-002 calendar week boundaries in America/Asuncion', () => {
  const thursday = new Date('2026-10-15T15:00:00.000Z');

  it('resolves esta semana to the current Monday through next Monday', () => {
    const window = resolveEMP002CalendarQueryWindow('¿Qué tengo esta semana?', thursday);
    assert.equal(window.timeMin.slice(0, 10), '2026-10-12');
    assert.equal(window.timeMax.slice(0, 10), '2026-10-19');
  });

  it('resolves próxima semana to the following Monday through Monday', () => {
    const window = resolveEMP002CalendarQueryWindow('¿Qué tengo próxima semana?', thursday);
    assert.equal(window.timeMin.slice(0, 10), '2026-10-19');
    assert.equal(window.timeMax.slice(0, 10), '2026-10-26');
  });

  it('uses the local date instead of UTC near midnight', () => {
    const window = resolveEMP002CalendarQueryWindow('agenda hoy', new Date('2026-10-16T01:00:00.000Z'));
    assert.equal(window.timeMin.slice(0, 10), '2026-10-15');
    assert.equal(window.timeMax.slice(0, 10), '2026-10-16');
  });
});
