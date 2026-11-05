import {WorkforceCalendarStore, type WorkforceCalendarEntry} from './workforce-calendar-store';
import type {SchedulingSqlStorage} from './emp002-scheduling-store';

export interface MeetingPolicy {
  revisionHash: string;
  destination: 'WORKFORCE' | 'HERREB_CRM';
  closingMode: 'MEETING' | 'MEETING_OR_ORDER';
  title: string;
  durationMinutes: number;
  timezone: string;
  noticeMinutes: number;
  bufferMinutes: number;
  hours: Array<{day:number;from:string;to:string}>;
}
interface Offer {
  tenantId:string; customerId:string; id:string; policyHash:string;
  startsAt:string; endsAt:string; expiresAt:string; title:string;
  confirmed:boolean;
}
interface TransactionalStorage {sql:SchedulingSqlStorage;transactionSync<T>(callback:()=>T):T}
const validId=(value:string)=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
const instant=(value:string)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));

/**
 * Server-only native booking coordinator, to be called inside the verified DO
 * boundary. Tenant/customer and policy must come from the authenticated channel
 * resolver and authoritative published configuration, never model arguments.
 * No HTTP route, RPC method, Meta send or deployment is enabled by this class.
 */
export class EMP001MeetingBooking {
  private readonly calendar:WorkforceCalendarStore;
  constructor(private readonly storage:TransactionalStorage,private readonly tenantId:string) {
    if(!validId(tenantId))throw Error('BOOKING_SCOPE_REQUIRED');
    this.calendar=new WorkforceCalendarStore(storage.sql);
    storage.sql.exec('CREATE TABLE IF NOT EXISTS emp001_meeting_offers (tenant_id TEXT NOT NULL, id TEXT NOT NULL, customer_id TEXT NOT NULL, expires_at TEXT NOT NULL, confirmed INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(tenant_id,id))');
    storage.sql.exec('CREATE INDEX IF NOT EXISTS emp001_meeting_offers_expiry ON emp001_meeting_offers(tenant_id,confirmed,expires_at)');
  }
  private policy(policy:MeetingPolicy):void {
    if(!policy || !['MEETING','MEETING_OR_ORDER'].includes(policy.closingMode)|| !/^[a-f0-9]{64}$/.test(policy.revisionHash)||typeof policy.title!=='string'||!policy.title.trim()||policy.title.length>120||
      ![15,30,45,60,90,120].includes(policy.durationMinutes)||![0,30,60,120,1440].includes(policy.noticeMinutes)||![0,15,30,60].includes(policy.bufferMinutes)||!Array.isArray(policy.hours)||!policy.hours.length||policy.hours.length>21)throw Error('BOOKING_POLICY_INVALID');
    if(policy.destination!=='WORKFORCE')throw Error('BOOKING_CRM_CONNECTION_REQUIRED'); // Never silently book into another system.
    try { new Intl.DateTimeFormat('en',{timeZone:policy.timezone}).format(); }catch{throw Error('BOOKING_POLICY_INVALID')}
    if(!policy.timezone)throw Error('BOOKING_POLICY_INVALID');
    for(const h of policy.hours)if(!h||!Number.isInteger(h.day)||h.day<0||h.day>6||!/^([01]\d|2[0-3]):[0-5]\d$/.test(h.from)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(h.to)||h.from>=h.to)throw Error('BOOKING_POLICY_INVALID');
  }
  private available(policy:MeetingPolicy,start:string,end:string,now:string):void {
    if(Date.parse(start)<Date.parse(now)+policy.noticeMinutes*60000)throw Error('BOOKING_NOTICE_REQUIRED');
    const local=(value:string)=>{
      const p=new Intl.DateTimeFormat('en-US',{timeZone:policy.timezone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
      const get=(key:string)=>p.find(x=>x.type===key)?.value??'';
      return{day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday')),date:get('year')+get('month')+get('day'),time:get('hour')+':'+get('minute')};
    };
    const from=local(start),to=local(end);
    if(from.date!==to.date||!policy.hours.some(h=>h.day===from.day&&from.time>=h.from&&to.time<=h.to&&from.time<to.time))throw Error('BOOKING_OUTSIDE_WORKING_HOURS');
    const lower=new Date(Date.parse(start)-policy.bufferMinutes*60000).toISOString(),upper=new Date(Date.parse(end)+policy.bufferMinutes*60000).toISOString();
    if(this.calendar.busy(this.tenantId,lower,upper).length)throw Error('BOOKING_TIME_CONFLICT');
  }
  offer(input:{customerId:string;startsAt:string;now:string},policy:MeetingPolicy):Offer {
    this.policy(policy);
    if(!validId(input.customerId)||!instant(input.startsAt)||!instant(input.now))throw Error('BOOKING_INPUT_INVALID');
    const start=new Date(input.startsAt).toISOString(),end=new Date(Date.parse(start)+policy.durationMinutes*60000).toISOString();
    return this.storage.transactionSync(()=>{
      this.storage.sql.exec('DELETE FROM emp001_meeting_offers WHERE tenant_id=? AND confirmed=0 AND expires_at<=?',this.tenantId,new Date(input.now).toISOString());
      const count=Array.from(this.storage.sql.exec('SELECT COUNT(*) AS count FROM emp001_meeting_offers WHERE tenant_id=? AND confirmed=0',this.tenantId))[0];
      if(Number(count?.count)>=128)throw Error('BOOKING_OFFER_CAPACITY');
      this.available(policy,start,end,input.now);
      const offer:Offer={tenantId:this.tenantId,customerId:input.customerId,id:crypto.randomUUID(),policyHash:policy.revisionHash,startsAt:start,endsAt:end,expiresAt:new Date(Date.parse(input.now)+15*60000).toISOString(),title:policy.title,confirmed:false};
      this.storage.sql.exec('INSERT INTO emp001_meeting_offers(tenant_id,id,customer_id,expires_at,confirmed,payload)VALUES(?,?,?,?,0,?)',this.tenantId,offer.id,offer.customerId,offer.expiresAt,JSON.stringify(offer));
      return offer;
    });
  }
  confirm(input:{customerId:string;offerId:string;explicitConsent:boolean;now:string},policy:MeetingPolicy):{entry:WorkforceCalendarEntry;readBackConfirmed:true;replayed:boolean} {
    if(!validId(input.customerId)||!validId(input.offerId)||input.explicitConsent!==true||!instant(input.now))throw Error('BOOKING_EXPLICIT_CONFIRMATION_REQUIRED');
    return this.storage.transactionSync(()=>{
      const row=Array.from(this.storage.sql.exec('SELECT payload FROM emp001_meeting_offers WHERE tenant_id=? AND id=? AND customer_id=?',this.tenantId,input.offerId,input.customerId))[0];
      if(!row)throw Error('BOOKING_OFFER_NOT_FOUND');
      const offer=JSON.parse(String(row.payload)) as Offer;
      if(offer.tenantId!==this.tenantId||offer.customerId!==input.customerId||offer.id!==input.offerId)throw Error('BOOKING_SCOPE_MISMATCH');
      const id='emp001-'+offer.id;
      if(offer.confirmed){
        const entry=this.calendar.get(this.tenantId,id);
        if(!entry||entry.status!=='ACTIVE'||entry.startsAt!==offer.startsAt||entry.endsAt!==offer.endsAt||entry.title!==offer.title)throw Error('BOOKING_READBACK_MISMATCH');
        return{entry,readBackConfirmed:true,replayed:true};
      }
      this.policy(policy);
      if(offer.policyHash!==policy.revisionHash)throw Error('BOOKING_POLICY_CHANGED');
      if(Date.parse(offer.expiresAt)<=Date.parse(input.now))throw Error('BOOKING_OFFER_EXPIRED');
      this.available(policy,offer.startsAt,offer.endsAt,input.now);
      const entry=this.calendar.save({tenantId:this.tenantId,id,kind:'MEETING',title:offer.title,startsAt:offer.startsAt,endsAt:offer.endsAt,status:'ACTIVE',updatedAt:new Date(input.now).toISOString()},0);
      this.storage.sql.exec('UPDATE emp001_meeting_offers SET confirmed=1,payload=? WHERE tenant_id=? AND id=?',JSON.stringify({...offer,confirmed:true}),this.tenantId,offer.id);
      const read=this.calendar.get(this.tenantId,id);
      if(JSON.stringify(read)!==JSON.stringify(entry))throw Error('BOOKING_READBACK_MISMATCH');
      return{entry:read!,readBackConfirmed:true,replayed:false};
    });
  }
}
