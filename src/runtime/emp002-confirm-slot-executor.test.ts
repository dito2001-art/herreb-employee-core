import { describe, expect, it } from 'vitest';
import { executeConfirmSlotCommands } from './emp002-confirm-slot-executor';
import type { CalendarTransport } from '../adapters/calendar';

const calendar: CalendarTransport = {
  async execute(input) {
    expect(input.idempotencyKey).toBe('confirm:recovery-1:req-1');
    expect(input.request.operation).toBe('create');
    return { ok: true, output: { eventId: 'gcal-event-1' }, evidence: { upstreamStatus: 200 } };
  },
};

describe('EMP-002 confirm slot executor', () => {
  it('creates the accepted slot through controlled Calendar write', async () => {
    const executions = await executeConfirmSlotCommands({
      tenantId: 'tenant-a', correlationId: 'corr-1', timezone: 'America/Asuncion', calendar,
      contacts: { 'contact-1': { id: 'contact-1', displayName: 'Ana', email: 'ana@example.com' } },
      result: {
        state: {} as any,
        commands: [{
          type: 'CONFIRM_SLOT', idempotencyKey: 'confirm:recovery-1:req-1', requestId: 'req-1', contactId: 'contact-1',
          slot: { tenantId: 'tenant-a', resourceId: 'resource-1', startsAt: '2026-10-02T10:00:00-03:00', endsAt: '2026-10-02T10:30:00-03:00' },
        }],
      },
    });
    expect(executions).toEqual([{ commandType: 'CONFIRM_SLOT', idempotencyKey: 'confirm:recovery-1:req-1', ok: true, eventId: 'gcal-event-1', upstreamStatus: 200 }]);
  });
});
