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

test('authorized tenant DO rejects missing reminder-owner configuration without sending',async()=>{
 const {operations,db}=createOperations('tenant:tenant-a');
 try {
  const response=await operations.fetch(new Request('https://emp002.operations/internal/native-reminders/execute',{
   method:'POST',headers:{'x-herreb-internal-tenant-id':'tenant-a','x-emp002-reconciliation-token':'test-only-secret'},
  }));
  assert.equal(response.status,503);
  assert.match(JSON.stringify(await response.json()),/EMP002_REMINDER_TENANT_NOT_UNIQUE/);
 } finally {db.close();}
});

test('independent status read-back requires matching named DO and internal token', async () => {
 const {operations,db}=createOperations('tenant:tenant-a');
 try {
  const url='https://emp002.operations/internal/native-reminders/status';
  const body=JSON.stringify({id:'event-1',version:1});
  const headers={'x-herreb-internal-tenant-id':'tenant-a','x-emp002-reconciliation-token':'test-only-secret','content-type':'application/json'};
  const absent=await operations.fetch(new Request(url,{method:'POST',headers,body}));
  assert.equal(absent.status,404);
  const forbidden=await operations.fetch(new Request(url,{method:'POST',headers:{...headers,'x-emp002-reconciliation-token':'wrong'},body}));
  assert.equal(forbidden.status,403);
  const mismatched=await operations.fetch(new Request(url,{method:'POST',headers:{...headers,'x-herreb-internal-tenant-id':'tenant-b'},body}));
  assert.equal(mismatched.status,403);
 } finally {db.close();}
});
