import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
const result = await build({
  stdin: {
    contents: `
import {EMP002Operations,EMP003CampaignState} from './src/staging/workforce-durable-objects';
import {scopeBoundaryNamespace} from './src/staging/workforce-do-boundary';
export {EMP002Operations,EMP003CampaignState};
export default {async fetch(request,env) {
 const url=new URL(request.url),tenant=url.searchParams.get('tenant')||'tenant-a';
 const ns=env.EMP002_OPERATIONS, id=ns.idFromName('tenant:'+tenant),stub=ns.get(id);
 if(url.pathname==='/rpc-env') {try {await stub.env;return new Response('RPC env accepted',{status:500});}catch{return new Response('RPC env unavailable',{status:403});}}
 if(url.pathname==='/rpc') {try {await stub.reconcileOutbound('tenant-a','msg','provider','evidence','actor');return new Response('RPC accepted',{status:500});}catch{return new Response('RPC unavailable',{status:403});}}
 if(url.pathname==='/direct') return stub.fetch(new Request('https://do.internal/native-calendar',{method:'POST',headers:{'content-type':'application/json','x-herreb-internal-tenant-id':tenant},body:'{"operation":"get","id":"task"}'}));
 const scoped=scopeBoundaryNamespace(ns,env,{tenantId:tenant,actorId:'fixture-owner',role:'owner'},'calendar');
 return scoped.get(scoped.idFromName('tenant:'+tenant)).fetch(new Request('https://do.internal/native-calendar',{method:'POST',headers:{'content-type':'application/json','x-herreb-internal-tenant-id':tenant},body:await request.text()}));
}};`,
    resolveDir: process.cwd(),
    loader: "ts"
  },
  bundle: true,
  format: "esm",
  platform: "neutral",
  conditions: ["workerd", "worker", "browser"],
  external: ["cloudflare:workers"],
  write: false
});
let attempts = 0;
const mf = new Miniflare({
  modules: true,
  script: result.outputFiles[0].text,
  compatibilityDate: "2026-06-11",
  compatibilityFlags: ["nodejs_compat"],
  bindings: {
    STAGING_DO_BOUNDARY_KEY: "local-workerd-fixture-boundary-key-only-12345"
  },
  durableObjects: {
    EMP002_OPERATIONS: { className: "EMP002Operations", useSQLite: true },
    EMP003_CAMPAIGN_STATE: { className: "EMP003CampaignState", useSQLite: true }
  },
  outboundService: () => {
    attempts++;
    return new Response("forbidden", { status: 503 });
  }
});
try {
  const call = (path, body) =>
    mf.dispatchFetch("http://local.test" + path, {
      method: "POST",
      body: JSON.stringify(body ?? {})
    });
  assert.equal((await call("/direct")).status, 403);
  assert.equal((await call("/rpc")).status, 403);
  assert.equal((await call("/rpc-env")).status, 403);
  const entry = {
    id: "task",
    tenantId: "tenant-a",
    kind: "TASK",
    title: "A private",
    startsAt: "2026-11-01T12:00:00Z",
    status: "ACTIVE",
    updatedAt: "2026-10-30T12:00:00Z"
  };
  assert.equal(
    (await call("/signed", { operation: "save", entry, expectedVersion: 0 }))
      .status,
    200
  );
  const read = await call("/signed", { operation: "get", id: "task" });
  assert.equal((await read.json()).entry.title, "A private");
  const foreign = await call("/signed?tenant=tenant-b", {
    operation: "get",
    id: "task"
  });
  assert.equal((await foreign.json()).entry, null);
  const bEntry = {
    ...entry,
    id: "b-task",
    tenantId: "tenant-b",
    title: "B private"
  };
  assert.equal(
    (
      await call("/signed?tenant=tenant-b", {
        operation: "save",
        entry: bEntry,
        expectedVersion: 0
      })
    ).status,
    200
  );
  assert.equal(
    (
      await call("/signed?tenant=tenant-b", {
        operation: "save",
        entry,
        expectedVersion: 0
      })
    ).status,
    403
  );
  assert.equal(
    (await (await call("/signed", { operation: "get", id: "b-task" })).json())
      .entry,
    null
  );
  assert.equal(
    (
      await (
        await call("/signed?tenant=tenant-b", {
          operation: "get",
          id: "b-task"
        })
      ).json()
    ).entry.title,
    "B private"
  );
  const replies = await Promise.all([
    call("/signed", {
      operation: "save",
      entry: { ...entry, title: "updated" },
      expectedVersion: 1
    }),
    call("/signed", {
      operation: "save",
      entry: { ...entry, title: "updated" },
      expectedVersion: 1
    })
  ]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
  assert.equal(attempts, 0);
  console.log(
    "local workerd: direct fetch/RPC denied; calendar persistence, A/B and concurrent CAS PASS; zero outbound attempts"
  );
} finally {
  await mf.dispose();
}
