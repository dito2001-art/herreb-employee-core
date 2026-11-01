import test from "node:test";
import assert from "node:assert/strict";
import runner from "./private-runner.mjs";
const request=(body,path="/internal/emp001/chat")=>new Request("https://example.invalid"+path,{method:"POST",body:JSON.stringify(body)});
test("disabled by default",async()=>assert.equal((await runner.fetch(request({message:"hola"}),{})).status,503));
test("reject arbitrary routes",async()=>assert.equal((await runner.fetch(request({message:"hola"},"/admin/reset-session"),{})).status,404));
test("missing signed Access identity fails closed",async()=>assert.equal((await runner.fetch(request({message:"hola"}),{PRIVATE_RUNNER_ENABLED:"true"})).status,403));
