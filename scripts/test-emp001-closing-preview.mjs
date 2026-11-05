import {JSDOM} from 'jsdom';import {readFileSync}from'node:fs';import assert from'node:assert/strict';
const tenant='company-services',dom=new JSDOM(readFileSync('dist/emp001-preview/emp001-v1.html','utf8'),{url:`https://config.test/emp001-v1.html?tenant=${tenant}`,runScripts:'outside-only',pretendToBeVisual:true});
let writes=0,stored={ok:true,tenantId:tenant,revision:1,hash:'initial',draft:{sellerName:'Asesor',ownerName:'Responsable',ownerContact:'owner@example.invalid',personality:'Consultivo',instructions:'No inventar'},canEdit:true};
dom.window.crypto.randomUUID=()=> 'closing-save';dom.window.fetch=async(url,init={})=>{
 if(url.endsWith('/profile')){if(init.method==='PUT'){const b=JSON.parse(init.body);assert.equal(b.expectedRevision,1);writes++;stored={...stored,draft:b.data,revision:2,hash:'saved-closing'};}return{ok:true,json:async()=>structuredClone(stored)}}
 if(url.endsWith('/simulate'))return{ok:true,json:async()=>({ok:true,available:false})};
 if(url===`/api/tenants/${tenant}`)return{ok:true,json:async()=>({ok:true,tenant:{tenantId:tenant,name:'Empresa de servicios'}})};
 return{ok:false,json:async()=>({ok:false})};};
dom.window.eval(readFileSync('dist/emp001-preview/emp001-v1.js','utf8'));const tick=()=>new Promise(r=>setTimeout(r,30));await tick();await tick();
const doc=dom.window.document;[...doc.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('Ventas')).click();await tick();
const select=async(label,value)=>{const input=[...doc.querySelectorAll('label')].find(x=>x.querySelector('span')?.textContent===label)?.querySelector('select');assert.ok(input,label);input.value=value;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick();};
await select('Qué ofrece tu empresa','SERVICES');await select('Objetivo de cierre','MEETING');assert.ok(doc.body.textContent.includes('Sin CRM, usá la agenda de Workforce'));assert.ok(!doc.body.textContent.includes('Esta prueba utiliza pago simulado'));
await select('Dónde guardar las citas','WORKFORCE');await select('Duración','30');await select('Anticipación mínima','60');await select('Separación entre citas','15');await select('Zona horaria','America/Asuncion');
const monday=[...doc.querySelectorAll('label.check')].find(x=>x.textContent==='Lunes');assert.ok(monday);monday.querySelector('input').click();await tick();
assert.equal(doc.querySelector('input[type=time]').value,'09:00');
[...doc.querySelectorAll('button')].find(b=>b.textContent==='Guardar borrador').click();await tick();await tick();assert.equal(writes,1);assert.equal(stored.draft.offeringType,'SERVICES');assert.equal(stored.draft.closingMode,'MEETING');assert.equal(stored.draft.calendarDestination,'WORKFORCE');assert.deepEqual(JSON.parse(stored.draft.appointmentHours),[{day:1,from:'09:00',to:'17:00'}]);assert.equal(stored.draft.sellerName,'Asesor');assert.ok(doc.body.textContent.includes('Borrador guardado y verificado'));
await select('Dónde guardar las citas','HERREB_CRM');assert.ok(doc.body.textContent.includes('Conexión de agenda pendiente de verificación'));assert.equal([...doc.querySelectorAll('button')].find(b=>b.textContent==='Publicar configuración').disabled,true);
await select('Objetivo de cierre','ORDER');assert.equal([...doc.querySelectorAll('select')].some(x=>x.parentElement.textContent.startsWith('Dónde guardar')),false);assert.equal(doc.querySelectorAll('[role=tab]').length,5);
console.log('PASS closing UI: services/products choices, native/CRM selection, working hours, persistent draft request + independent read-back, retained seller profile, order-only mode, publication disabled');dom.window.close();
