import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import {
  MAX_BOUNDARY_NONCES,
  scopeBoundaryNamespace,
  authorizeBoundary,
  type BoundaryEnv,
  type BoundaryActor
} from "./workforce-do-boundary";
import {
  copyFixture,
  copyBlueprint
} from "../runtime/emp003-copy-fixture.test-support";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";
import { createEMP003DurableStorageAdapter } from "../runtime/emp003-durable-storage";
const hook = registerHooks({
  resolve(s, c, next) {
    if (s === "cloudflare:workers")
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            "export class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }"
          ),
        shortCircuit: true
      };
    return next(s, c);
  }
});
const { EMP002Operations, EMP003CampaignState } =
  await import("./workforce-durable-objects");
hook.deregister();
const secret = "fixture-only-boundary-secret-32-bytes-minimum";
const actor: BoundaryActor = {
  tenantId: "tenant-a",
  actorId: "a",
  role: "owner"
};
const id = (name: string) => ({ toString: () => name }) as DurableObjectId;
const env: BoundaryEnv = { STAGING_DO_BOUNDARY_KEY: secret };
let captured: Request[] = [];
const ns = {
  idFromName: id,
  get: () => ({
    fetch: async (r: Request) => {
      captured.push(r.clone() as Request);
      return Response.json({ ok: true });
    }
  })
} as unknown as DurableObjectNamespace;
env.EMP003_CAMPAIGN_STATE = ns;
env.EMP002_OPERATIONS = ns;
const internal = (
  path = "/draft?tenantId=tenant-a&campaignId=campaign",
  init?: RequestInit
) => new Request("https://do.internal" + path, init);
async function ticket(
  request: Request,
  a = actor,
  kind: "calendar" | "marketing" = "marketing"
) {
  let signed: Request | undefined;
  const localNs = {
    idFromName: id,
    get: () => ({
      fetch: async (r: Request) => {
        signed = r.clone() as Request as Request;
        return Response.json({ ok: true });
      }
    })
  } as unknown as DurableObjectNamespace;
  const scoped = scopeBoundaryNamespace(localNs, env, a, kind);
  const response = await scoped
    .get(
      scoped.idFromName(
        kind === "calendar" ? "tenant:" + a.tenantId : a.tenantId
      )
    )
    .fetch(request);
  assert.equal(response.status, 200);
  assert.ok(signed);
  return signed as Request;
}
function state(f = copyFixture(), name = "tenant-a") {
  const storage = {
    ...f.storage,
    async list<T = unknown>(options: { prefix: string; limit?: number }) {
      const rows = await f.storage.list<T>(options);
      return new Map(
        [...rows].sort(([a], [b]) => a.localeCompare(b)).slice(0, options.limit)
      );
    },
    async delete(k: string) {
      f.db.prepare("DELETE FROM records WHERE key=?").run(k);
      return true;
    }
  };
  // The transaction fixture serializes the actual SQLite operations.
  storage.transaction = async (work) =>
    f.storage.transaction(() => work(storage));
  return { f, ctx: { id: id(name), storage } as unknown as DurableObjectState };
}
test("request capability binds signature, body, headers, tenant/object and expiry; concurrent replay consumes once", async () => {
  const { f, ctx } = state();
  try {
    const signed = await ticket(internal());
    assert.equal(
      await authorizeBoundary(internal(), ctx, env, "marketing"),
      false
    );
    assert.equal(
      await authorizeBoundary(
        new Request(signed, {
          headers: { ...Object.fromEntries(signed.headers), "x-forged": "x" }
        }),
        ctx,
        env,
        "marketing"
      ),
      false
    );
    assert.equal(
      await authorizeBoundary(
        new Request(signed.url.replace("campaign=", "other="), signed),
        ctx,
        env,
        "calendar"
      ),
      false
    );
    assert.equal(
      await authorizeBoundary(
        signed,
        ctx,
        {
          ...env,
          STAGING_DO_BOUNDARY_KEY: "different-key-long-enough-for-fixture-123"
        },
        "marketing"
      ),
      false
    );
    assert.equal(
      await authorizeBoundary(
        signed,
        { ...ctx, id: id("tenant-b") } as DurableObjectState,
        env,
        "marketing"
      ),
      false
    );
    const results = await Promise.all([
      authorizeBoundary(signed.clone() as Request, ctx, env, "marketing"),
      authorizeBoundary(signed.clone() as Request, ctx, env, "marketing")
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(
      await authorizeBoundary(signed.clone() as Request, ctx, env, "marketing"),
      false
    );
    const fresh = await ticket(internal());
    assert.equal(await authorizeBoundary(fresh, ctx, env, "marketing"), true);
    const timed = await ticket(internal());
    const now = Date.now;
    Date.now = () => now() + 31000;
    try {
      assert.equal(
        await authorizeBoundary(timed, ctx, env, "marketing"),
        false
      );
    } finally {
      Date.now = now;
    }
    const write = await ticket(
      internal("/draft?tenantId=tenant-a&campaignId=campaign&createOnly=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(copyBlueprint)
      })
    );
    assert.equal(
      await authorizeBoundary(
        new Request(write, {
          body: JSON.stringify({ ...copyBlueprint, objective: "changed" })
        }),
        ctx,
        env,
        "marketing"
      ),
      false
    );
  } finally {
    f.db.close();
  }
});
test("fetch-only facades deny foreign IDs, reader writes, privileged routes and actor spoofing before dispatch", async () => {
  const facade = scopeBoundaryNamespace(ns, env, actor, "marketing");
  assert.throws(() => facade.idFromName("tenant-b"));
  assert.throws(() => facade.get(id("tenant-b")));
  const stub = facade.get(id("tenant-a"));
  assert.deepEqual(Object.keys(stub), ["fetch"]);
  for (const request of [
    internal("/internal/execute?tenantId=tenant-a"),
    internal("/draft?tenantId=tenant-b"),
    internal("/draft?tenantId=tenant-a&tenantId=tenant-b"),
    internal("/copy-assets/edit?tenantId=tenant-a", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-emp003-copy-actor": "b"
      },
      body: "{}"
    })
  ])
    assert.equal((await stub.fetch(request)).status, 403);
  const reader = scopeBoundaryNamespace(
    ns,
    env,
    { ...actor, role: "user" },
    "marketing"
  );
  assert.equal(
    (
      await reader.get(id("tenant-a")).fetch(
        internal("/draft?tenantId=tenant-a", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        })
      )
    ).status,
    403
  );
});
test("composed marketing DO A/B protects existing records, CAS and internal routes without inherited RPC methods", async () => {
  const a = state(),
    b = state(copyFixture(), "tenant-b");
  try {
    for (const [f, t] of [
      [a.f, "tenant-a"],
      [b.f, "tenant-b"]
    ] as const) {
      await createPersistentBlueprintRepository(
        createEMP003DurableStorageAdapter(f.storage)
      ).put(t, "campaign", { ...copyBlueprint, tenantId: t });
      await f.storage.put(`emp003:draft-revision:${t}:campaign`, 1);
    }
    const da = new EMP003CampaignState(a.ctx, env as never),
      db = new EMP003CampaignState(b.ctx, env as never);
    assert.deepEqual(
      Object.getOwnPropertyNames(EMP003CampaignState.prototype),
      ["constructor", "fetch"]
    );
    assert.equal((await da.fetch(internal())).status, 403);
    const signed = await ticket(internal());
    assert.equal((await db.fetch(signed.clone() as Request)).status, 403);
    const good = await da.fetch(signed.clone() as Request);
    assert.equal(((await good.json()) as { revision: number }).revision, 1);
    assert.equal((await da.fetch(signed.clone() as Request)).status, 403);
    const write = internal(
      "/draft?tenantId=tenant-a&campaignId=campaign&expectedRevision=1",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...copyBlueprint, objective: "Updated" })
      }
    );
    const requests = await Promise.all([
      ticket(write.clone() as Request),
      ticket(write.clone() as Request)
    ]);
    const responses = await Promise.all(requests.map((r) => da.fetch(r)));
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const back = await da.fetch(await ticket(internal()));
    assert.equal(((await back.json()) as { revision: number }).revision, 2);
    const other = await db.fetch(
      await ticket(internal("/draft?tenantId=tenant-b&campaignId=campaign"), {
        ...actor,
        tenantId: "tenant-b",
        actorId: "b"
      })
    );
    assert.equal(((await other.json()) as { revision: number }).revision, 1);
  } finally {
    a.f.db.close();
    b.f.db.close();
  }
});
test("calendar DO permits native CAS/readback only, rejects direct RPC-shaped calls and failure replays", async () => {
  const { f, ctx } = state(copyFixture(), "tenant:tenant-a");
  const sql = new DatabaseSync(":memory:");
  Object.assign(ctx.storage, {
    sql: {
      exec(query: string, ...args: unknown[]) {
        const stmt = sql.prepare(query);
        const rows = stmt.all(...(args as never[]));
        return rows;
      }
    },
    transactionSync<T>(fn: () => T) {
      sql.exec("BEGIN");
      try {
        const r = fn();
        sql.exec("COMMIT");
        return r;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    }
  });
  try {
    const d = new EMP002Operations(ctx, env as never);
    assert.deepEqual(Object.getOwnPropertyNames(EMP002Operations.prototype), [
      "constructor",
      "fetch"
    ]);
    const entry = {
      id: "task",
      tenantId: "tenant-a",
      kind: "TASK",
      title: "Private A",
      startsAt: "2026-11-01T12:00:00Z",
      status: "ACTIVE",
      updatedAt: "2026-10-30T12:00:00Z"
    };
    const request = (body: unknown) =>
      internal("/native-calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-herreb-internal-tenant-id": "tenant-a"
        },
        body: JSON.stringify(body)
      });
    assert.equal(
      (await d.fetch(request({ operation: "save", entry, expectedVersion: 0 })))
        .status,
      403
    );
    const create = await d.fetch(
      await ticket(
        request({ operation: "save", entry, expectedVersion: 0 }),
        actor,
        "calendar"
      )
    );
    assert.equal(create.status, 200, await create.clone().text());
    const read = await d.fetch(
      await ticket(request({ operation: "get", id: "task" }), actor, "calendar")
    );
    assert.equal(
      ((await read.json()) as { entry: { title: string } }).entry.title,
      "Private A"
    );
    const reader = scopeBoundaryNamespace(
      ns,
      env,
      { ...actor, role: "user" },
      "calendar"
    ).get(id("tenant:tenant-a"));
    assert.equal(
      (
        await reader.fetch(
          request({ operation: "save", entry, expectedVersion: 1 })
        )
      ).status,
      403
    );
    const scoped = scopeBoundaryNamespace(ns, env, actor, "calendar").get(
      id("tenant:tenant-a")
    );
    for (const path of [
      "/internal/native-reminders/execute",
      "/inbound/whatsapp",
      "/internal/meta-reconcile",
      "/rpc/sendNativeReplyOnce"
    ])
      assert.equal(
        (
          await scoped.fetch(
            internal(path, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-herreb-internal-tenant-id": "tenant-a"
              },
              body: "{}"
            })
          )
        ).status,
        403
      );
    const valid = await ticket(
      request({ operation: "get", id: "task" }),
      actor,
      "calendar"
    );
    const broken = {
      ...ctx,
      storage: {
        transaction: async () => {
          throw Error("storage failed");
        }
      }
    } as unknown as DurableObjectState;
    assert.equal(
      await authorizeBoundary(valid, broken, env, "calendar"),
      false
    );
  } finally {
    sql.close();
    f.db.close();
  }
});

test("failed calendar construction returns sanitized503 and consumed capability cannot replay", async () => {
  const { f, ctx } = state(copyFixture(), "tenant:tenant-a");
  Object.assign(ctx.storage, {
    sql: {
      exec() {
        throw Error("PRIVATE_SQL_FAILURE");
      }
    }
  });
  try {
    const request = await ticket(
      internal("/native-calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-herreb-internal-tenant-id": "tenant-a"
        },
        body: JSON.stringify({ operation: "get", id: "task" })
      }),
      actor,
      "calendar"
    );
    const d = new EMP002Operations(ctx, env as never);
    const failed = await d.fetch(request.clone() as Request);
    assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), /PRIVATE_SQL_FAILURE/);
    assert.equal((await d.fetch(request.clone() as Request)).status, 403);
  } finally {
    f.db.close();
  }
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function nonceCount(ctx: DurableObjectState) {
  return (await ctx.storage.list({ prefix: "i2:nonce:" })).size;
}
test("expiry after transaction contention is rejected without consuming a nonce", async () => {
  const { f, ctx } = state();
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  const entered = gate(),
    resume = gate();
  try {
    const signed = await ticket(internal());
    const waiting = {
      ...ctx,
      storage: {
        ...ctx.storage,
        transaction: async (
          work: (txn: DurableObjectTransaction) => Promise<boolean>
        ) => {
          entered.release();
          await resume.promise;
          return ctx.storage.transaction(work);
        }
      }
    } as DurableObjectState;
    const pending = authorizeBoundary(signed, waiting, env, "marketing");
    await entered.promise;
    clock += 30000;
    resume.release();
    assert.equal(await pending, false);
    assert.equal(await nonceCount(ctx), 0);
  } finally {
    resume.release();
    Date.now = realNow;
    f.db.close();
  }
});
test("expiry during nonce write and while commit is awaited never admits domain dispatch", async () => {
  for (const phase of ["write", "commit"]) {
    const { f, ctx } = state();
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock;
    try {
      const signed = await ticket(internal());
      const delayed = {
        ...ctx,
        storage: {
          ...ctx.storage,
          transaction: async (
            work: (txn: DurableObjectTransaction) => Promise<boolean>
          ) => {
            const result = await ctx.storage.transaction(async (txn) =>
              work({
                ...txn,
                get: txn.get.bind(txn),
                list: txn.list.bind(txn),
                delete: txn.delete.bind(txn),
                put: async (k: string, v: unknown) => {
                  await txn.put(k, v);
                  if (phase === "write") clock += 30000;
                }
              } as unknown as DurableObjectTransaction)
            );
            if (phase === "commit") clock += 30000;
            return result;
          }
        }
      } as DurableObjectState;
      assert.equal(
        await authorizeBoundary(signed, delayed, env, "marketing"),
        false
      );
      assert.equal(await nonceCount(ctx), phase === "write" ? 0 : 1);
      assert.equal(
        await authorizeBoundary(signed, ctx, env, "marketing"),
        false
      );
    } finally {
      Date.now = realNow;
      f.db.close();
    }
  }
});
test("nonce capacity is atomic under contention; live entries are never evicted and expired entries reclaim capacity", async () => {
  const { f, ctx } = state();
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const first = await ticket(internal());
    assert.equal(await authorizeBoundary(first, ctx, env, "marketing"), true);
    for (let i = 1; i < MAX_BOUNDARY_NONCES - 1; i++)
      await ctx.storage.put(`i2:nonce:${clock + 30000}:seed-${i}`, true);
    const tickets = await Promise.all([ticket(internal()), ticket(internal())]);
    const admitted = await Promise.all(
      tickets.map((t) => authorizeBoundary(t, ctx, env, "marketing"))
    );
    assert.deepEqual(admitted.sort(), [false, true]);
    assert.equal(await nonceCount(ctx), MAX_BOUNDARY_NONCES);
    assert.equal(await authorizeBoundary(first, ctx, env, "marketing"), false);
    assert.equal(
      await authorizeBoundary(await ticket(internal()), ctx, env, "marketing"),
      false
    );
    assert.equal(await nonceCount(ctx), MAX_BOUNDARY_NONCES);
    clock += 30001;
    assert.equal(await authorizeBoundary(first, ctx, env, "marketing"), false);
    assert.equal(
      await authorizeBoundary(await ticket(internal()), ctx, env, "marketing"),
      true
    );
    assert.equal(await nonceCount(ctx), 1);
  } finally {
    Date.now = realNow;
    f.db.close();
  }
});
test("cleanup rolls back on failure, never evicts live markers, and drains oversized legacy prefixes before admission", async () => {
  const { f, ctx } = state();
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const expired = `i2:nonce:${clock - 1}:expired`;
    await ctx.storage.put(expired, true);
    const signed = await ticket(internal());
    const failing = {
      ...ctx,
      storage: {
        ...ctx.storage,
        transaction: async (
          work: (txn: DurableObjectTransaction) => Promise<boolean>
        ) =>
          ctx.storage.transaction(async (txn) =>
            work({
              get: txn.get.bind(txn),
              list: txn.list.bind(txn),
              put: txn.put.bind(txn),
              delete: async (k: string) => {
                await txn.delete(k);
                throw Error("CLEANUP_FAILURE");
              }
            } as unknown as DurableObjectTransaction)
          )
      }
    } as DurableObjectState;
    assert.equal(
      await authorizeBoundary(signed, failing, env, "marketing"),
      false
    );
    assert.equal(await ctx.storage.get(expired), true);
    assert.equal(await authorizeBoundary(signed, ctx, env, "marketing"), true);
    assert.equal(await ctx.storage.get(expired), undefined);
    for (let i = 0; i < MAX_BOUNDARY_NONCES + 2; i++)
      await ctx.storage.put(`i2:nonce:${clock - 1}:old-${i}`, true);
    assert.equal(
      await authorizeBoundary(await ticket(internal()), ctx, env, "marketing"),
      false
    );
    assert.equal(await authorizeBoundary(signed, ctx, env, "marketing"), false);
    assert.equal(
      await authorizeBoundary(await ticket(internal()), ctx, env, "marketing"),
      true
    );
    assert.equal(await nonceCount(ctx), 2);
  } finally {
    Date.now = realNow;
    f.db.close();
  }
});
