import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync, sign} from "node:crypto";
import runner from "./private-runner.mjs";

const pair=generateKeyPairSync("rsa",{modulusLength:2048});
const publicKey={...pair.publicKey.export({format:"jwk"}),kid:"test-key",alg:"RS256",use:"sig"};
const now=Math.floor(Date.now()/1000);
const encode=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
function jwt(overrides={}){
 const header=encode({alg:"RS256",kid:"test-key"});
 const payload=encode({iss:"https://access.example.test",aud:["audience"],sub:"subject-a",email:"a@example.test",iat:now-5,exp:now+600,...overrides});
 return header+"."+payload+"."+sign("RSA-SHA256",Buffer.from(header+"."+payload),pair.privateKey).toString("base64url");
}
const requests=[];
const runtime={fetch:async(url,init)=>{requests.push({url,init});return Response.json({ok:true})}};
const env={
 PRIVATE_RUNNER_ENABLED:"true",ACCESS_ISSUER:"https://access.example.test",ACCESS_AUDIENCE:"audience",
 ACCESS_JWKS_JSON:JSON.stringify({keys:[publicKey]}),
 PRINCIPALS_JSON:JSON.stringify([
 {sub:"subject-a",email:"a@example.test",role:"emp001_test_operator",slot:"A",tenantId:"tenant-a"},
 {sub:"subject-b",email:"b@example.test",role:"emp001_test_operator",slot:"B",tenantId:"tenant-b"}]),
 EMP001_RUNTIME_A:{fetch:runtime.fetch},EMP001_RUNTIME_B:{fetch:runtime.fetch},RUNTIME_TOKEN_A:"token-a",RUNTIME_TOKEN_B:"token-b"
};
function request(body,token=jwt(),path="/internal/emp001/chat"){
 return new Request("https://private.example.test"+path,{method:"POST",headers:{"cf-access-jwt-assertion":token},body:JSON.stringify(body)});
}
function preflightRequest(token=jwt()){
 return new Request("https://private.example.test/internal/emp001/preflight",{method:"GET",headers:{"cf-access-jwt-assertion":token}});
}
test("A verified JWT maps to tenant A and token A",async()=>{
 requests.length=0;
 assert.equal((await runner.fetch(request({message:"hola"}),env)).status,200);
 assert.equal(JSON.parse(requests[0].init.body).tenant_id,"tenant-a");
 assert.equal(requests[0].init.headers.authorization,"Bearer token-a");
});
test("B verified JWT maps to tenant B and token B",async()=>{
 requests.length=0;
 assert.equal((await runner.fetch(request({message:"hola"},jwt({sub:"subject-b",email:"b@example.test"})),env)).status,200);
 assert.equal(JSON.parse(requests[0].init.body).tenant_id,"tenant-b");
 assert.equal(requests[0].init.headers.authorization,"Bearer token-b");
});
test("reject cross-tenant and privileged fields",async()=>{
 for(const field of ["tenant_id","channel","operation_id","customer_id","authorization"]){
  assert.equal((await runner.fetch(request({message:"hola",[field]:"tenant-b"}),env)).status,400);
 }
});
test("reject expired, wrong issuer, wrong audience and unknown principal",async()=>{
 for(const token of [jwt({exp:now-1}),jwt({iss:"wrong"}),jwt({aud:["wrong"]}),jwt({sub:"unknown"})]){
  assert.equal((await runner.fetch(request({message:"hola"},token),env)).status,403);
 }
});
test("reject tampered signature",async()=>{
 const token=jwt();const parts=token.split(".");
 const altered=parts[0]+"."+parts[1]+"."+parts[2].slice(0,-4)+"AAAA";
 assert.equal((await runner.fetch(request({message:"hola"},altered),env)).status,403);
});
test("deny disabled, missing identity and unexpected routes",async()=>{
 assert.equal((await runner.fetch(request({message:"hola"}),{...env,PRIVATE_RUNNER_ENABLED:"false"})).status,503);
 assert.equal((await runner.fetch(request({message:"hola"},"invalid"),env)).status,403);
 assert.equal((await runner.fetch(request({message:"hola"},jwt(),"/admin/reset-session"),env)).status,404);
});

test("reject shared bearer across A/B",async()=>{
 assert.equal((await runner.fetch(request({message:"hola"}),{...env,RUNTIME_TOKEN_B:"token-a"})).status,503);
});
test("reject shared Runtime Service Binding across A/B",async()=>{
 assert.equal((await runner.fetch(request({message:"hola"}),{...env,EMP001_RUNTIME_B:env.EMP001_RUNTIME_A})).status,503);
});

test("B private preflight uses B binding/token and verifies the runtime tenant",async()=>{
 const calls=[];
 const runtimeA={fetch:async()=>{throw Error("A binding must not be called")}};
 const runtimeB={fetch:async(url,init)=>{calls.push({url,init});return Response.json({ok:true,preflight:"PASS",ai_inference_used:false,openai_used:false,service_binding:"PASS",sales_ops_auth:"PASS",tenant:"tenant-b",products:0,recommendations:0})}};
 const scoped={...env,EMP001_RUNTIME_A:runtimeA,EMP001_RUNTIME_B:runtimeB};
 const response=await runner.fetch(preflightRequest(jwt({sub:"subject-b",email:"b@example.test"})),scoped);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.tenant,"tenant-b");
 assert.equal(body.ai_inference_used,false);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,"https://runtime.internal/preflight");
 assert.equal(calls[0].init.headers.authorization,"Bearer token-b");
});
test("private preflight rejects tenant mismatch and does not report PASS",async()=>{
 const runtimeA={fetch:async()=>Response.json({ok:true,tenant:"tenant-a"})};
 const runtimeB={fetch:async()=>Response.json({ok:true,preflight:"PASS",tenant:"tenant-a"})};
 const response=await runner.fetch(preflightRequest(jwt({sub:"subject-b",email:"b@example.test"})),{...env,EMP001_RUNTIME_A:runtimeA,EMP001_RUNTIME_B:runtimeB});
 assert.equal(response.status,502);
 const body=await response.json();
 assert.equal(body.error,"tenant_mismatch");
 assert.equal(body.expected_tenant,"tenant-b");
 assert.equal(body.actual_tenant,"tenant-a");
});
test("private preflight fails closed when disabled or Access JWT is missing",async()=>{
 assert.equal((await runner.fetch(preflightRequest(jwt({sub:"subject-b",email:"b@example.test"})),{...env,PRIVATE_RUNNER_ENABLED:"false"})).status,503);
 const noJwt=preflightRequest("");
 assert.equal((await runner.fetch(noJwt,env)).status,403);
});
