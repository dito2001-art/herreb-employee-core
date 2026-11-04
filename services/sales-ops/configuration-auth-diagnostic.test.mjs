import {fixture} from './simulated-payment.fixture.mjs';
import sales from './staging-b-simulated-payment.mjs';
import assert from 'node:assert/strict';
const log=console.info;let records=[];console.info=(...args)=>records.push(args);
const f=fixture();f.env.EMP001_CONFIG_B_TOKEN=' diagnostic-private-key ';
const r=await sales.fetch(new Request('https://sales.test/api/v1/tenant-operations',{headers:{authorization:'Bearer diagnostic-private-key','x-tenant-id':'herreb-client-b'}}),f.env);
assert.equal(r.status,200);assert.equal(records[0][1].exactMatch,true);assert.ok(!JSON.stringify(records).includes('diagnostic-private-key'));console.info=log;console.log('PASS: pasted outer whitespace normalized; diagnostics contain no credential');

const bad=await sales.fetch(new Request('https://sales.test/api/v1/tenant-operations',{headers:{authorization:'Bearer wrong-key','x-tenant-id':'herreb-client-b'}}),f.env);assert.equal(bad.status,401);
