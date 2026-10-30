import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { NativeReminderStore, reminderOwnerForTenant } from './emp002-native-reminder-store';
const tenant='tenant-a';
const manifest=JSON.stringify([{tenantId:tenant,whatsappOwners:['+595981123456'],reminderOwnerWhatsapp:'+595981123456'}]);
const entry=(version:number,reminderAt='2026-10-29T13:00:00.000Z')=>({tenantId:tenant,id:'event-1',kind:'TASK' as const,title:'Revisar',startsAt:'2026-10-29T15:00:00.000Z',reminderAt,status:'ACTIVE' as const,updatedAt:'2026-10-29T12:00:00.000Z',version});
test('owner must be a uniquely configured WhatsApp tenant owner',()=>{
  assert.ok(reminderOwnerForTenant(manifest,tenant));
  assert.throws(()=>reminderOwnerForTenant(JSON.stringify([{tenantId:tenant,whatsappOwners:['+595981000000'],reminderOwnerWhatsapp:'+595981123456'}]),tenant),/UNAUTHORIZED/);
  assert.throws(()=>reminderOwnerForTenant('[]',tenant),/NOT_UNIQUE/);
});
test('version replacement invalidates pending actions; stale and ambiguous claims never resend',()=>{
  const db=new DatabaseSync(':memory:');
  const store=new NativeReminderStore(db as never);
  const recipient=reminderOwnerForTenant(manifest,tenant);
  store.replace(entry(1),recipient);
  store.replace(entry(2),recipient);
  assert.deepEqual(store.due(tenant,'2026-10-29T14:00:00.000Z').map(x=>x.calendar_version),[2]);
  assert.throws(()=>store.claim(tenant,'event-1',1,entry(1),'2026-10-29T14:00:00.000Z'),/CLAIMED/);
  assert.throws(()=>store.claim(tenant,'event-1',2,entry(3),'2026-10-29T14:00:00.000Z'),/STALE/);
  const claim=store.claim(tenant,'event-1',2,entry(2),'2026-10-29T14:00:00.000Z');
  assert.equal(claim.recipient,recipient);
  assert.equal(store.due(tenant,'2026-10-29T14:00:00.000Z').length,0);
  assert.throws(()=>store.claim(tenant,'event-1',2,entry(2),'2026-10-29T14:00:00.000Z'),/CLAIMED/);
  store.reconcile(tenant,'event-1',2,'wamid.test-1234','provider-receipt-001','operator');
  assert.throws(()=>store.reconcile(tenant,'event-1',2,'wamid.test-1234','provider-receipt-001','operator'),/CONFLICT/);
});
test('cancel invalidates unsent action',()=>{
  const db=new DatabaseSync(':memory:');
  const store=new NativeReminderStore(db as never);
  store.replace(entry(1),'595981123456');
  store.replace({...entry(2),status:'CANCELLED'},undefined);
  assert.equal(store.due(tenant,'2026-10-29T14:00:00.000Z').length,0);
});

test('provider-confirmed delivery transitions UNKNOWN to SENT once',()=>{
  const db=new DatabaseSync(':memory:');
  const store=new NativeReminderStore(db as never);
  store.replace(entry(1),'595981123456');
  store.claim(tenant,'event-1',1,entry(1),'2026-10-29T14:00:00.000Z');
  assert.throws(()=>store.markSent(tenant,'event-1',1,'invalid'),/EVIDENCE_MISSING/);
  store.markSent(tenant,'event-1',1,'wamid.provider-1234');
  assert.throws(()=>store.markSent(tenant,'event-1',1,'wamid.provider-1234'),/STATE_CONFLICT/);
  assert.equal(store.due(tenant,'2026-10-29T14:00:00.000Z').length,0);
});
