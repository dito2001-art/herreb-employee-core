import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { EMP002Operations } from './emp002-operations';

function createOperations(name: string | undefined) {
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec(query: string, ...args: unknown[]) {
      const statement = db.prepare(query);
      return statement.columns().length
        ? statement.all(...(args as never[]))
        : (statement.run(...(args as never[])), []);
    },
  };
  const state = { id: { name }, storage: { sql, transactionSync<T>(fn: () => T) { return fn(); } } };
  const env = { EMP002_RECONCILIATION_TOKEN: 'test-only-secret' };
  return { operations: new EMP002Operations(state as never, env), db };
}

test('internal reminder endpoint denies cross-tenant Durable Object access before dispatch', async () => {
  for (const name of ['tenant:tenant-b', undefined]) {
    const { operations, db } = createOperations(name);
    try {
      const response = await operations.fetch(new Request('https://emp002.operations/internal/native-reminders/execute', {
        method: 'POST',
        headers: {
          'x-herreb-internal-tenant-id': 'tenant-a',
          'x-emp002-reconciliation-token': 'test-only-secret',
        },
      }));
      assert.equal(response.status, 403);
      assert.equal((await response.json() as { error: string }).error, 'EMP002_REMINDER_DO_TENANT_MISMATCH');
    } finally { db.close(); }
  }
});

test('matching DO identity still requires internal authorization token', async () => {
  const { operations, db } = createOperations('tenant:tenant-a');
  try {
    const response = await operations.fetch(new Request('https://emp002.operations/internal/native-reminders/execute', {
      method: 'POST',
      headers: { 'x-herreb-internal-tenant-id': 'tenant-a' },
    }));
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { error: string }).error, 'REMINDER_FORBIDDEN');
  } finally { db.close(); }
});
