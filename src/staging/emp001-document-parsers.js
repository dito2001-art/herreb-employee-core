import {getDocument,GlobalWorkerOptions} from '../../tools/document-parsers/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from '../../tools/document-parsers/node_modules/mammoth/mammoth.browser.js';
import readXlsxFile from '../../tools/document-parsers/node_modules/read-excel-file/browser/index.js';
GlobalWorkerOptions.workerSrc='/emp001-pdf.worker.mjs';
function zipLimit(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}if(end<0)throw Error('El archivo comprimido no es válido.');const count=v.getUint16(end+10,true);if(count>1500)throw Error('El archivo contiene demasiados elementos.');let p=v.getUint32(end+16,true),total=0;for(let n=0;n<count;n++){if(p+46>bytes.length||v.getUint32(p,true)!==0x02014b50)throw Error('Archivo comprimido no compatible.');const size=v.getUint32(p+24,true);total+=size;if(size===0xffffffff||total>20000000||v.getUint16(p+8,true)&1)throw Error('Archivo cifrado o demasiado grande al descomprimir.');p+=46+v.getUint16(p+28,true)+v.getUint16(p+30,true)+v.getUint16(p+32,true);}}
export function csvRows(text){
 const first=text.split(/\r?\n/)[0],counts={',':0,';':0,'\t':0};let quoted=false;
 for(let i=0;i<first.length;i++){if(first[i]==='"'){if(first[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted&&Object.hasOwn(counts,first[i]))counts[first[i]]++;}
 const delimiter=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];const rows=[];let row=[],cell='';quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===delimiter||c==='\n'||c==='\r')){if(c===delimiter){row.push(cell);cell='';}else{if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';if(rows.length>500)throw Error('Dividí el catálogo en archivos de hasta 500 filas.');}}else cell+=c;}
 if(quoted)throw Error('El CSV tiene comillas sin cerrar.');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return{columnas:rows[0]??[],filas:rows.slice(1)};
}
export async function extractKnowledgeFile(file){
 if(!file||!file.size||file.size>5000000)throw Error('Elegí un archivo de hasta 5 MB.');
 const format=file.name.split('.').at(-1).toUpperCase();if(!['TXT','MD','CSV','JSON','PDF','DOCX','XLSX'].includes(format))throw Error('Formato no compatible. Usá PDF con texto, DOCX, XLSX, CSV, JSON, TXT o MD.');
 const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer),sourceHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(b=>b.toString(16).padStart(2,'0')).join('');let text='';
 if(format==='PDF'){
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('El contenido no corresponde a un PDF.');
  const task=getDocument({data:bytes,isEvalSupported:false,useWasm:false,disableFontFace:true,enableXfa:false}),timeout=setTimeout(()=>task.destroy(),20000);let pdf;
  try{pdf=await task.promise;}catch(e){clearTimeout(timeout);await task.destroy();throw e;}
  try{if(pdf.numPages>40)throw Error('Dividí el PDF en archivos de hasta 40 páginas.');for(let page=1;page<=pdf.numPages;page++){const content=await(await pdf.getPage(page)).getTextContent();text+=`\nPágina ${page}\n`+content.items.map(i=>i.str??'').join(' ');if(text.length>40000)throw Error('El texto supera el límite de esta primera versión. Dividí el documento.');}}finally{clearTimeout(timeout);await task.destroy()}
  if(text.replace(/Página \d+/g,'').trim().length<20)throw Error('Este PDF no contiene texto suficiente. Parece escaneado: requiere OCR, todavía no conectado.');
 }else if(format==='DOCX'){zipLimit(bytes);text=(await mammoth.extractRawText({arrayBuffer:buffer},{externalFileAccess:false})).value;}
 else if(format==='XLSX'){zipLimit(bytes);const sheets=await readXlsxFile(buffer);text=JSON.stringify(sheets.map(s=>({hoja:s.sheet,filas:s.data})),null,2);}
 else{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');if(format==='JSON')text=JSON.stringify(JSON.parse(text),null,2);if(format==='CSV')text=JSON.stringify(csvRows(text),null,2);}
 if(!text.trim())throw Error('No se encontró texto para interpretar.');if(text.length>40000)throw Error('El texto supera 40.000 caracteres. Dividí el documento antes de cargarlo.');
 return{name:file.name,format,text,sourceHash};
}
window.HerrebExtractKnowledgeFile=extractKnowledgeFile;
