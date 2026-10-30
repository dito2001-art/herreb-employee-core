import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config=JSON.parse(readFileSync('staging/emp002.wrangler.preflight.jsonc','utf8'));
const entry=readFileSync('staging/emp002-entry.ts','utf8');

test('staging never uses shared worker or public routes',()=>{
 assert.equal(config.main,'./emp002-entry.ts');
 assert.equal(config.workers_dev,false);
 assert.deepEqual(config.routes,[]);
 assert.deepEqual(config.triggers.crons,[]);
 assert.equal(config.name.includes('NOT-DEPLOYABLE'),true);
});
test('only EMP002 DO is bound, with SQLite migration',()=>{
 assert.deepEqual(config.durable_objects.bindings,[{name:'EMP002_OPERATIONS',class_name:'EMP002Operations'}]);
 assert.deepEqual(config.migrations[0].new_sqlite_classes,['EMP002Operations']);
 assert.equal(config.services,undefined);
});
test('gateway requires verified Access JWT and tenant derived from identity',()=>{
 assert.match(entry,/verifyWorkforceAccessJwt\(/);
 assert.match(entry,/resolveAccessIdentity\(principal.email/);
 assert.match(entry,/idFromName\('tenant:'\+identity.tenantId\)/);
 assert.match(entry,/CLIENT_SCOPE_HEADERS_FORBIDDEN/);
 assert.match(entry,/ACCESS_DENIED/);
});
test('gateway excludes outbound Meta and privileged DO operations',()=>{
 assert.match(entry,/new Map\(\[/);
 assert.match(entry,/\/staging\/emp002\/calendar/);
 assert.match(entry,/\/staging\/emp002\/reminder-status/);
 assert.doesNotMatch(entry,/sendText\(/);
 assert.doesNotMatch(entry,/\/internal\/native-reminders\/execute['"]/);
 assert.doesNotMatch(entry,/\/internal\/native-reminders\/reconcile['"]/);
 assert.doesNotMatch(entry,/\/inbound\/whatsapp['"]/);
});

test('DO subclass blocks direct execution, reconcile and Meta credentials',()=>{
 assert.match(entry,/class EMP002Operations extends BaseEMP002Operations/);
 assert.match(entry,/META_ACCESS_TOKEN: undefined/);
 assert.match(entry,/META_PHONE_NUMBER_ID: undefined/);
 assert.match(entry,/STAGING_DO_OPERATION_FORBIDDEN/);
 assert.match(entry,/path !== '\/native-calendar'/);
 assert.match(entry,/path !== '\/internal\/native-reminders\/status'/);
});
