import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchEMP002ScheduledActions, resolveEMP002SchedulerTenants } from './emp002-scheduler-dispatcher';

test('scheduler selects only unique tenants with EMP-002 enabled', () => {
  const raw = JSON.stringify([
    { tenantId: 'tenant-a', enabledEmployees: ['EMP-001', 'EMP-002'] },
    { tenantId: 'tenant-b', enabledEmployees: ['EMP-001'] },
    { tenantId: ' tenant-c ', enabledEmployees: ['EMP-002'] },
    { tenantId: 'tenant-a', enabledEmployees: ['EMP-002'] },
    { enabledEmployees: ['EMP-002'] },
  ]);
  assert.deepEqual(resolveEMP002SchedulerTenants(raw), ['tenant-a', 'tenant-c']);
});

test('invalid tenant manifest fails closed', () => {
  assert.throws(() => resolveEMP002SchedulerTenants('{bad-json'), /EMP002_SCHEDULER_INVALID_TENANT_MANIFESTS/);
  assert.throws(() => resolveEMP002SchedulerTenants('{}'), /EMP002_SCHEDULER_INVALID_TENANT_MANIFESTS/);
});

test('scheduler dispatches each enabled tenant to its own durable object', async () => {
  const calls: Array<{ name: string; body: unknown }> = [];
  let currentName = '';
  const namespace = {
    idFromName(name: string) { currentName = name; return { toString: () => name } as DurableObjectId; },
    get() {
      const name = currentName;
      return { async fetch(_url: string, init?: RequestInit) { calls.push({ name, body: JSON.parse(String(init?.body)) }); return Response.json({ ok: true, status: 'EXECUTED' }); } } as unknown as DurableObjectStub;
    },
  };
  const results = await dispatchEMP002ScheduledActions({
    TENANT_MANIFESTS_JSON: JSON.stringify([{ tenantId: 'tenant-a', enabledEmployees: ['EMP-002'] }, { tenantId: 'tenant-b', enabledEmployees: ['EMP-002'] }]),
    EMP002_OPERATIONS: namespace,
  }, '2026-10-04T15:00:00.000Z');
  assert.deepEqual(calls, [
    { name: 'tenant:tenant-a', body: { tenantId: 'tenant-a', now: '2026-10-04T15:00:00.000Z', limit: 50 } },
    { name: 'tenant:tenant-b', body: { tenantId: 'tenant-b', now: '2026-10-04T15:00:00.000Z', limit: 50 } },
  ]);
  assert.equal(results.every((result) => result.ok), true);
});

test('one tenant failure does not prevent remaining tenants from running', async () => {
  let currentName = '';
  const namespace = {
    idFromName(name: string) { currentName = name; return { toString: () => name } as DurableObjectId; },
    get() {
      const name = currentName;
      return { async fetch() { if (name === 'tenant:tenant-a') throw new Error('boom'); return Response.json({ ok: true }); } } as unknown as DurableObjectStub;
    },
  };
  const results = await dispatchEMP002ScheduledActions({ TENANT_MANIFESTS_JSON: JSON.stringify([{ tenantId: 'tenant-a', enabledEmployees: ['EMP-002'] }, { tenantId: 'tenant-b', enabledEmployees: ['EMP-002'] }]), EMP002_OPERATIONS: namespace });
  assert.equal(results.length, 2);
  assert.equal(results[0].ok, false);
  assert.equal(results[1].ok, true);
});
