import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {EMP001MeetingBooking,type MeetingPolicy} from './emp001-meeting-booking';
import {WorkforceCalendarStore} from './workforce-calendar-store';
const policy:MeetingPolicy={revisionHash:'a'.repeat(64),destination:'WORKFORCE',closingMode:'MEETING',title:'Diagnóstico',durationMinutes:30,timezone:'America/Asuncion',noticeMinutes:30,bufferMinutes:15,hours:[{day:5,from:'09:00',to:'17:00'}]};
const now='2026-11-06T11:00:00.000Z',start='2026-11-06T13:00:00.000Z'; // Friday, 10:00 Paraguay.
function fixture(){
 const db=new DatabaseSync(':memory:');let fail=false;
 const sql={exec(query:string,...args:unknown[]){if(fail&&query.startsWith('UPDATE emp001_meeting_offers')){fail=false;throw Error('INJECTED_COMMIT_FAILURE')}return db.prepare(query).all(...args as (string|number|null)[]) as Record<string,unknown>[]}};
 const storage={sql,transactionSync<T>(fn:()=>T):T{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}}};
 return{db,a:new EMP001MeetingBooking(storage,'tenant-a'),b:new EMP001MeetingBooking(storage,'tenant-b'),calendar:new WorkforceCalendarStore(sql),fail(){fail=true}};
}
test('actual SQLite: offer is not a booking, explicit consent creates one, independent GET and replay',()=>{
 const f=fixture(),o=f.a.offer({customerId:'prospect',startsAt:start,now},policy);
 assert.equal(f.calendar.list('tenant-a','2026-11-06T00:00:00Z','2026-11-07T00:00:00Z').length,0);
 assert.throws(()=>f.a.confirm({customerId:'prospect',offerId:o.id,explicitConsent:false,now},policy),/EXPLICIT_CONFIRMATION/);
 const result=f.a.confirm({customerId:'prospect',offerId:o.id,explicitConsent:true,now},policy);
 assert.equal(result.readBackConfirmed,true);assert.equal(result.replayed,false);
 assert.deepEqual(f.calendar.get('tenant-a',result.entry.id),result.entry);
 const replay=f.a.confirm({customerId:'prospect',offerId:o.id,explicitConsent:true,now:'2026-11-06T11:30:00Z'},policy);
 assert.equal(replay.replayed,true);assert.equal(replay.entry.id,result.entry.id);assert.equal(replay.entry.version,1);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM workforce_calendar_entries').get()!.n,1);
});
test('tenant and contact isolation; same slot allowed in a separate company',()=>{
 const f=fixture(),o=f.a.offer({customerId:'prospect',startsAt:start,now},policy);
 assert.throws(()=>f.b.confirm({customerId:'prospect',offerId:o.id,explicitConsent:true,now},policy),/OFFER_NOT_FOUND/);
 assert.throws(()=>f.a.confirm({customerId:'other',offerId:o.id,explicitConsent:true,now},policy),/OFFER_NOT_FOUND/);
 f.a.confirm({customerId:'prospect',offerId:o.id,explicitConsent:true,now},policy);
 const b=f.b.offer({customerId:'prospect',startsAt:start,now},policy);
 const result=f.b.confirm({customerId:'prospect',offerId:b.id,explicitConsent:true,now},policy);
 assert.equal(result.entry.tenantId,'tenant-b');
});
test('competing offers: one confirmation wins, no duplicate; buffer checked atomically',async()=>{
 const f=fixture(),o1=f.a.offer({customerId:'one',startsAt:start,now},policy),o2=f.a.offer({customerId:'two',startsAt:start,now},policy);
 const results=await Promise.allSettled([Promise.resolve().then(()=>f.a.confirm({customerId:'one',offerId:o1.id,explicitConsent:true,now},policy)),Promise.resolve().then(()=>f.a.confirm({customerId:'two',offerId:o2.id,explicitConsent:true,now},policy))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.throws(()=>f.a.offer({customerId:'three',startsAt:'2026-11-06T13:30:00Z',now},policy),/TIME_CONFLICT/);
 assert.equal(f.a.offer({customerId:'three',startsAt:'2026-11-06T13:45:00Z',now},policy).startsAt,'2026-11-06T13:45:00.000Z');
});
test('expiry and changed policy reject without writing; CRM never falls back to native',()=>{
 const f=fixture(),o=f.a.offer({customerId:'one',startsAt:start,now},policy),input={customerId:'one',offerId:o.id,explicitConsent:true,now};
 assert.throws(()=>f.a.confirm({...input,now:'2026-11-06T11:15:00Z'},policy),/OFFER_EXPIRED/);
 assert.throws(()=>f.a.confirm(input,{...policy,revisionHash:'b'.repeat(64)}),/POLICY_CHANGED/);
 assert.throws(()=>f.a.confirm(input,{...policy,destination:'HERREB_CRM'}),/CRM_CONNECTION_REQUIRED/);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM workforce_calendar_entries').get()!.n,0);
});
test('failure between calendar and receipt rolls back both; retry recovers',()=>{
 const f=fixture(),o=f.a.offer({customerId:'one',startsAt:start,now},policy),input={customerId:'one',offerId:o.id,explicitConsent:true,now};
 f.fail();assert.throws(()=>f.a.confirm(input,policy),/INJECTED_COMMIT_FAILURE/);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM workforce_calendar_entries').get()!.n,0);
 assert.equal(f.a.confirm(input,policy).entry.version,1);
});
test('bounded pending offers; cleanup does not remove confirmed replay receipts',()=>{
 const f=fixture(),o=f.a.offer({customerId:'one',startsAt:start,now},policy);
 f.a.confirm({customerId:'one',offerId:o.id,explicitConsent:true,now},policy);
 for(let i=0;i<128;i++)f.a.offer({customerId:'pending'+i,startsAt:'2026-11-06T14:00:00Z',now},policy);
 assert.throws(()=>f.a.offer({customerId:'overflow',startsAt:'2026-11-06T14:00:00Z',now},policy),/OFFER_CAPACITY/);
 f.a.offer({customerId:'next',startsAt:'2026-11-06T14:00:00Z',now:'2026-11-06T11:16:00Z'},policy);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM emp001_meeting_offers WHERE confirmed=0').get()!.n,1);
 assert.equal(f.a.confirm({customerId:'one',offerId:o.id,explicitConsent:true,now:'2026-11-06T11:16:00Z'},policy).replayed,true);
});
test('working hours, notice, timezone and caller inputs fail closed',()=>{
 const f=fixture();
 for(const startsAt of ['2026-11-06T11:15:00Z','2026-11-06T20:00:00Z','2026-11-07T13:00:00Z','2026-11-06T13:00:00'])assert.throws(()=>f.a.offer({customerId:'one',startsAt,now},policy));
 assert.throws(()=>f.a.offer({customerId:'one',startsAt:start,now},{...policy,timezone:'wrong'}),/POLICY_INVALID/);
 assert.throws(()=>f.a.offer({customerId:'../escape',startsAt:start,now},policy),/INPUT_INVALID/);
});
test('independent read-back does not reconfirm a subsequently cancelled meeting',()=>{
 const f=fixture(),o=f.a.offer({customerId:'one',startsAt:start,now},policy),input={customerId:'one',offerId:o.id,explicitConsent:true,now};
 const r=f.a.confirm(input,policy);f.calendar.save({...r.entry,status:'CANCELLED'},1);
 assert.throws(()=>f.a.confirm(input,policy),/READBACK_MISMATCH/);
});
