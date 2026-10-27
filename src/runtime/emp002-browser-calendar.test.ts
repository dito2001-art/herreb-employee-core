import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import { EMP002Operations } from "./emp002-operations";
import { handleEMP002BrowserCalendar } from "./emp002-browser-calendar";
const encode = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
async function fixture() {
  const pair = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const databases = new Map<string, DatabaseSync>();
  const env = {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: "calendar",
    ACCESS_IDENTITY_MAP_JSON: JSON.stringify([
      {
        email: "a@test.invalid",
        actorId: "a",
        tenantId: "tenant-a",
        role: "owner"
      },
      {
        email: "b@test.invalid",
        actorId: "b",
        tenantId: "tenant-b",
        role: "owner"
      }
    ]),
    EMP002_OPERATIONS: {
      idFromName: (name: string) => name,
      get: (id: unknown) => ({
        fetch: async (request: Request) => {
          const key = String(id);
          let db = databases.get(key);
          if (!db) {
            db = new DatabaseSync(":memory:");
            databases.set(key, db);
          }
          const sql = {
            exec(query: string, ...args: unknown[]) {
              const statement = db!.prepare(query);
              return statement.columns().length
                ? statement.all(...(args as never[]))
                : (statement.run(...(args as never[])), []);
            }
          };
          const state = {
            storage: {
              sql,
              transactionSync: <T>(fn: () => T) => {
                db!.exec("BEGIN");
                try {
                  const result = fn();
                  db!.exec("COMMIT");
                  return result;
                } catch (e) {
                  db!.exec("ROLLBACK");
                  throw e;
                }
              }
            }
          };
          // Recreate the object per request to verify persistence beyond one JS instance.
          return new EMP002Operations(state as never, {}).fetch(request);
        }
      })
    }
  };
  const fetcher = (async () =>
    Response.json({
      keys: [{ ...jwk, kid: "k", alg: "RS256", use: "sig" }]
    })) as typeof fetch;
  const token = async (email: string) => {
    const now = Math.floor(Date.now() / 1000);
    const data =
      encode({ alg: "RS256", kid: "k" }) +
      "." +
      encode({
        iss: "https://test.cloudflareaccess.com",
        aud: "calendar",
        email,
        iat: now - 10,
        exp: now + 600
      });
    return (
      data +
      "." +
      Buffer.from(
        await webcrypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          pair.privateKey,
          new TextEncoder().encode(data)
        )
      ).toString("base64url")
    );
  };
  const a = await token("a@test.invalid"),
    b = await token("b@test.invalid");
  const call = (body: unknown, jwt = a) =>
    handleEMP002BrowserCalendar(
      new Request("https://portal.test/api/emp002/calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-access-jwt-assertion": jwt
        },
        body: JSON.stringify(body)
      }),
      env,
      fetcher
    );
  return { call, a, b };
}
const entry = {
  id: "meeting",
  kind: "MEETING",
  title: "Reunión",
  startsAt: "2026-11-01T12:00:00.000Z",
  endsAt: "2026-11-01T13:00:00.000Z",
  status: "ACTIVE"
};
test("Access browser native calendar persists across object recreation; get, update, cancel and tenant isolation", async () => {
  const f = await fixture();
  let r = await f.call({ operation: "save", entry, expectedVersion: 0 });
  assert.equal(r.status, 200);
  assert.equal(
    ((await r.json()) as { readBackConfirmed: boolean }).readBackConfirmed,
    true
  );
  r = await f.call({ operation: "get", id: "meeting" });
  assert.equal(
    ((await r.json()) as { entry: { version: number } }).entry.version,
    1
  );
  assert.equal(
    (await f.call({ operation: "get", id: "meeting" }, f.b)).status,
    404
  );
  assert.equal(
    (
      await f.call({
        operation: "save",
        entry: { ...entry, title: "Cambio" },
        expectedVersion: 1
      })
    ).status,
    200
  );
  assert.equal(
    (await f.call({ operation: "save", entry, expectedVersion: 1 })).status,
    409
  );
  assert.equal(
    (
      await f.call({
        operation: "save",
        entry: { ...entry, status: "CANCELLED" },
        expectedVersion: 2
      })
    ).status,
    200
  );
  r = await f.call({
    operation: "list",
    from: "2026-11-01T00:00:00Z",
    to: "2026-11-02T00:00:00Z"
  });
  assert.deepEqual(((await r.json()) as { entries: unknown[] }).entries, []);
});
test("native tasks and conflict detection do not require external CRM", async () => {
  const f = await fixture();
  assert.equal(
    (await f.call({ operation: "save", entry, expectedVersion: 0 })).status,
    200
  );
  assert.equal(
    (
      await f.call({
        operation: "save",
        entry: { ...entry, id: "overlap" },
        expectedVersion: 0
      })
    ).status,
    409
  );
  const { endsAt: _end, ...task } = entry;
  assert.equal(
    (
      await f.call({
        operation: "save",
        entry: { ...task, id: "task", kind: "TASK" },
        expectedVersion: 0
      })
    ).status,
    200
  );
});
test("browser cannot supply tenant or bypass authentication", async () => {
  const f = await fixture();
  assert.equal(
    (await f.call({ operation: "get", id: "meeting", tenantId: "tenant-b" }))
      .status,
    400
  );
  assert.equal(
    (await f.call({ operation: "get", id: "meeting" }, "forged")).status,
    401
  );
});
