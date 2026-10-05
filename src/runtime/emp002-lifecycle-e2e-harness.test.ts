import assert from 'node:assert/strict';
import test from 'node:test';
import { runEMP002LifecycleE2EHarness } from './emp002-lifecycle-e2e-harness';

test('harness requires provider evidence and verifies second execution is deduplicated', async () => {
  const calls: string[] = [];
  let executeCount = 0;
  const stub = {
    async fetch(url: string) {
      const path = new URL(url).pathname;
      calls.push(path);
      if (path === '/appointment/register') return Response.json({ ok: true, record: { version: 1 } });
      if (path === '/appointment/actions/schedule') return Response.json({ ok: true, status: 'SCHEDULED' });
      executeCount += 1;
      return executeCount === 1
        ? Response.json({ ok: true, status: 'EXECUTED', prepared: 1, executed: 1, retryable: 0, results: [{ status: 'EXECUTED', providerMessageId: 'wamid.e2e' }] })
        : Response.json({ ok: true, status: 'EXECUTED', prepared: 0, executed: 0, retryable: 0, results: [] });
    },
  } as unknown as DurableObjectStub;
  const namespace = { idFromName: () => ({}) as DurableObjectId, get: () => stub };
  const result = await runEMP002LifecycleE2EHarness(namespace, { tenantId: 'herreb-client-0', appointmentId: 'appt-e2e-1', whatsapp: '+595981000000', now: '2026-10-05T18:00:00.000Z', startsAt: '2026-10-06T18:00:00.000Z' });
  assert.equal(result.providerMessageId, 'wamid.e2e');
  assert.deepEqual(calls, ['/appointment/register', '/appointment/actions/schedule', '/appointment/actions/execute', '/appointment/actions/execute']);
});

test('harness fails closed when provider evidence is absent', async () => {
  const stub = { async fetch(url: string) { const path = new URL(url).pathname; if (path.includes('register') || path.includes('schedule')) return Response.json({ ok: true }); return Response.json({ ok: true, prepared: 1, executed: 1, results: [{ status: 'EXECUTED' }] }); } } as unknown as DurableObjectStub;
  const namespace = { idFromName: () => ({}) as DurableObjectId, get: () => stub };
  await assert.rejects(() => runEMP002LifecycleE2EHarness(namespace, { tenantId: 'herreb-client-0', appointmentId: 'appt-e2e-2', whatsapp: '+595981000000', now: '2026-10-05T18:00:00.000Z', startsAt: '2026-10-06T18:00:00.000Z' }), /EMP002_E2E_EXECUTION_EVIDENCE_FAILED/);
});
