// Disabled-by-default private EMP001 test ingress. No public routes.
const error=(status,code)=>Response.json({ok:false,error:code},{status});
const unpack=s=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0))));
export async function verifyJWT(token,env,now=Math.floor(Date.now()/1000)){
 if(!token||!env.ACCESS_ISSUER||!env.ACCESS_AUDIENCE||!env.ACCESS_JWKS_JSON)throw Error("config");
 const parts=token.split(".");if(parts.length!==3)throw Error("token");
 const header=unpack(parts[0]),claims=unpack(parts[1]);
 if(header.alg!=="RS256"||!header.kid)throw Error("alg");
 const jwk=JSON.parse(env.ACCESS_JWKS_JSON).keys.find(k=>k.kid===header.kid&&k.kty==="RSA"&&k.alg==="RS256"&&k.use==="sig");
 if(!jwk)throw Error("key");
 const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
 const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
 if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,bytes(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1])))throw Error("signature");
 if(claims.iss!==env.ACCESS_ISSUER||!(Array.isArray(claims.aud)?claims.aud.includes(env.ACCESS_AUDIENCE):claims.aud===env.ACCESS_AUDIENCE))throw Error("issuer");
 if(!Number.isInteger(claims.exp)||claims.exp<=now||!Number.isInteger(claims.iat)||claims.iat>now+60||claims.nbf!==undefined&&(!Number.isInteger(claims.nbf)||claims.nbf>now))throw Error("time");
 if(!claims.sub||!claims.email)throw Error("identity");
 return claims;
}
export default {async fetch(req,env){
 if(req.method!=="POST"||new URL(req.url).pathname!=="/internal/emp001/chat")return error(404,"route_disabled");
 if(env.PRIVATE_RUNNER_ENABLED!=="true")return error(503,"disabled");
 let claims;try{claims=await verifyJWT(req.headers.get("cf-access-jwt-assertion"),env)}catch{return error(403,"access_denied")}
 let principals;try{principals=JSON.parse(env.PRINCIPALS_JSON);if(!Array.isArray(principals))throw Error()}catch{return error(503,"principal_config")}
 const found=principals.filter(p=>p.sub===claims.sub&&p.email===claims.email&&p.role==="emp001_test_operator"&&["A","B"].includes(p.slot)&&typeof p.tenantId==="string"&&p.tenantId);
 if(found.length!==1)return error(403,"principal_denied");
 let body;try{body=await req.json()}catch{return error(400,"invalid_json")}
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["message","session_id"].includes(k)))return error(400,"forbidden_field");
 if(typeof body.message!=="string"||!body.message.trim()||body.message.length>2000||body.session_id!==undefined&&(typeof body.session_id!=="string"||!body.session_id||body.session_id.length>128))return error(400,"invalid_input");
 const p=found[0],runtime=p.slot==="A"?env.EMP001_RUNTIME_A:env.EMP001_RUNTIME_B,token=p.slot==="A"?env.RUNTIME_TOKEN_A:env.RUNTIME_TOKEN_B;
 if(!runtime?.fetch||!token)return error(503,"runtime_config");
 try{
 const r=await runtime.fetch("https://runtime.internal/chat",{method:"POST",headers:{"authorization":"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({tenant_id:p.tenantId,channel:"api",message:body.message,session_id:body.session_id})});
 const output=await r.text();if(output.length>65536)return error(502,"upstream_oversize");
 return new Response(output,{status:r.status,headers:{"content-type":"application/json","cache-control":"no-store"}});
 }catch{return error(502,"upstream_unavailable")}
}};