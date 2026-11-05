import worker from './worker';
import {verifyWorkforceAccessJwt} from './access-jwt';
import type {ConfigurationEnv} from './emp001-configuration';
interface Env extends ConfigurationEnv { ASSETS:{fetch(request:Request):Promise<Response>} }
const reject=(status:number,error:string)=>Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
export default {async fetch(request:Request,env:Env):Promise<Response>{
 if(env.DEPLOYMENT_ENV!=='staging-b')return reject(404,'ISOLATED_STAGING_REQUIRED');
 const p=new URL(request.url).pathname;
 if(p.startsWith('/internal/'))return reject(403,'INTERNAL_ROUTES_DISABLED');
 if(p.startsWith('/api/')){
   const configuration=/^\/api\/tenants\/[a-z0-9-]{2,64}\/emp001\/configuration(?:\/(?:profile|validate))?$/.test(p);
   const registryRead=request.method==='GET' && (/^\/api\/tenants(?:\/[a-z0-9-]{2,64})?$/.test(p)||p==='/api/me');
   if(!configuration&&!registryRead)return reject(403,'STAGING_ROUTE_DISABLED');
   if(!configuration){try{
     const issuer=env.ACCESS_ISSUER||'',team=new URL(issuer);
     if(team.protocol!=='https:'||!team.hostname.endsWith('.cloudflareaccess.com')||team.pathname!=='/'||team.search||team.username||team.password||team.port)throw Error('config');
     const keys=await fetch(issuer.replace(/\/$/,'')+'/cdn-cgi/access/certs',{redirect:'manual',signal:AbortSignal.timeout(5000)});
     if(!keys.ok)throw Error('keys');
     const principal=await verifyWorkforceAccessJwt({jwt:request.headers.get('cf-access-jwt-assertion')||'',issuer,audience:env.ACCESS_AUDIENCE||'',jwks:await keys.json() as {keys:JsonWebKey[]},nowSeconds:Date.now()/1000});
     const headers=new Headers(request.headers);headers.set('cf-access-authenticated-user-email',principal.email);
     request=new Request(request,{headers});
   }catch{return reject(401,'VERIFIED_ACCESS_REQUIRED');}}
 }
 return worker.fetch(request,env);
}};
