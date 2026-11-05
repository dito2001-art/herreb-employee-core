import {useState} from 'react';
type Draft=Record<string,string|boolean>;
const choices:Record<string,[string,string][]>= {
 offeringType:[['PRODUCTS','Productos'],['SERVICES','Servicios'],['BOTH','Productos y servicios']],
 closingMode:[['MEETING','Agendar reunión o visita'],['QUOTE','Preparar cotización'],['ORDER','Crear pedido'],['MEETING_OR_ORDER','Agendar o crear pedido'],['HUMAN','Coordinar con una persona']],
 calendarDestination:[['WORKFORCE','Agenda de HerreB Workforce'],['HERREB_CRM','Calendario de HerreB CRM']],
 appointmentDuration:[['15','15 minutos'],['30','30 minutos'],['45','45 minutos'],['60','1 hora'],['90','1 hora y media'],['120','2 horas']],
 appointmentNotice:[['0','Sin anticipación mínima'],['30','30 minutos'],['60','1 hora'],['120','2 horas'],['1440','1 día']],
 appointmentBuffer:[['0','Sin separación'],['15','15 minutos'],['30','30 minutos'],['60','1 hora']],
};
const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
type Hours={day:number;from:string;to:string};
export function Emp001ClosingSettings({data,change,locked}:{data:Draft;change:(key:string,value:string|boolean)=>void;locked:boolean}) {
 const [scheduleError,setScheduleError]=useState('');
 const select=(key:string,label:string)=><label className="field"><span>{label}</span><select disabled={locked} value={String(data[key]??'')} onChange={e=>change(key,e.target.value)}><option value="" disabled>Elegir…</option>{choices[key].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>;
 let hours:Hours[]=[];
 try {const parsed=JSON.parse(String(data.appointmentHours??'[]'));if(Array.isArray(parsed))hours=parsed;}catch{}
 const updateHours=(next:Hours[])=>{setScheduleError('');change('appointmentHours',next.length?JSON.stringify(next.sort((a,b)=>a.day-b.day||a.from.localeCompare(b.from))):'');};
 const meeting=['MEETING','MEETING_OR_ORDER'].includes(String(data.closingMode));
 return <article className="card"><h3>Cómo termina una buena conversación</h3><p className="detail">Elegí el próximo paso según tu negocio. Los cambios se guardan con el borrador de esta empresa.</p><div className="formgrid">{select('offeringType','Qué ofrece tu empresa')}{select('closingMode','Objetivo de cierre')}</div>{meeting&&<>
 {select('calendarDestination','Dónde guardar las citas')}
 <p className="caption">Sin CRM, usá la agenda de Workforce. Si elegís HerreB CRM, las citas deben guardarse allí; no se cambia de agenda automáticamente.</p>
 <label className="field"><span>Tipo de reunión o visita</span><input disabled={locked} maxLength={120} value={String(data.appointmentTitle??'')} onChange={e=>change('appointmentTitle',e.target.value)} placeholder="Ej. Diagnóstico inicial"/></label>
 <div className="formgrid">{select('appointmentDuration','Duración')}{select('appointmentNotice','Anticipación mínima')}{select('appointmentBuffer','Separación entre citas')}<label className="field"><span>Zona horaria</span><select disabled={locked} value={String(data.appointmentTimezone??'')} onChange={e=>change('appointmentTimezone',e.target.value)}><option value="" disabled>Elegir…</option>{[...new Set(['America/Asuncion','America/Argentina/Buenos_Aires','America/Sao_Paulo','America/Montevideo','America/Santiago','America/Bogota','America/Lima','America/Mexico_City','Europe/Madrid','UTC',String(data.appointmentTimezone||'')])].filter(Boolean).map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</select></label></div>
 <fieldset disabled={locked}><legend>Horarios de atención</legend>{days.map((day,i)=>{const entries=hours.filter(h=>h.day===i);return <div key={day}><label className="check"><input type="checkbox" checked={entries.length>0} onChange={e=>updateHours(e.target.checked?[...hours,{day:i,from:'09:00',to:'17:00'}]:hours.filter(h=>h.day!==i))}/>{day}</label>{entries.map((h,index)=><div className="formgrid" key={index}>{(['from','to'] as const).map((key)=><label className="field" key={key}><span>{key==='from'?'Desde':'Hasta'} · {day}{entries.length>1?` ${index+1}`:''}</span><input type="time" value={h[key]} onChange={e=>{const next=hours.map(row=>row===h?{...row,[key]:e.target.value}:row);if(next.some(row=>row.from>=row.to))setScheduleError('La hora de fin debe ser posterior al inicio.');else setScheduleError('');change('appointmentHours',JSON.stringify(next));}}/></label>)}</div>)}</div>})}</fieldset>
 {scheduleError&&<p role="alert">{scheduleError}</p>}<p className="caption">El responsable es la persona principal definida en Equipo. Los horarios son reglas de atención; la disponibilidad se consulta en la agenda antes de reservar.</p>
 <p role="status" className="safenote">Conexión de agenda pendiente de verificación. Guardar este borrador no habilita reservas ni cambia el WhatsApp activo.</p>
 </>}</article>;
}
