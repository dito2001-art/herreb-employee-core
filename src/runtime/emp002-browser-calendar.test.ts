import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import { EMP002Operations } from "./emp002-operations";
import { handleEMP002BrowserCalendar } from "./emp002-browser-calendar";
import { createNativeCalendarReadTransport } from "./emp002-native-calendar-read";
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
    TENANT_MANIFESTS_JSON: JSON.stringify([
      { tenantId: "tenant-a", whatsappOwners: ["595981111111"], reminderOwnerWhatsapp: "595981111111" },
      { tenantId: "tenant-b", whatsappOwners: ["595982222222"], reminderOwnerWhatsapp: "595982222222" }
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
          return new EMP002Operations(state as never, { TENANT_MANIFESTS_JSON: env.TENANT_MANIFESTS_JSON }).fetch(request);
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
  return { call, a, b, namespace: env.EMP002_OPERATIONS };
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
test("native portal reminders persist independently, isolate tenants and clear using CAS", async () => {
  const f = await fixture();
  const reminderAt = new Date(Date.now() - 60000).toISOString();
  const task = { ...entry, id: "reminder-task", kind: "TASK", reminderAt };
  assert.equal(
    (await f.call({ operation: "save", entry: task, expectedVersion: 0 }))
      .status,
    200
  );
  const read = await f.call({ operation: "get", id: task.id });
  assert.equal(
    ((await read.json()) as { entry: { reminderAt: string } }).entry.reminderAt,
    reminderAt
  );
  let due = await f.call({ operation: "reminders" });
  assert.equal(
    ((await due.json()) as { entries: unknown[] }).entries.length,
    1
  );
  due = await f.call({ operation: "reminders" }, f.b);
  assert.deepEqual(((await due.json()) as { entries: unknown[] }).entries, []);
  assert.equal(
    (
      await f.call({
        operation: "save",
        entry: { ...task, reminderAt: "invalid" },
        expectedVersion: 1
      })
    ).status,
    400
  );
  const { reminderAt: _at, ...cleared } = task;
  assert.equal(
    (await f.call({ operation: "save", entry: cleared, expectedVersion: 0 }))
      .status,
    409
  );
  assert.equal(
    (await f.call({ operation: "save", entry: cleared, expectedVersion: 1 }))
      .status,
    200
  );
  due = await f.call({ operation: "reminders" });
  assert.deepEqual(((await due.json()) as { entries: unknown[] }).entries, []);
  const future = {
    ...task,
    id: "future-reminder",
    reminderAt: new Date(Date.now() + 86400000).toISOString()
  };
  assert.equal(
    (await f.call({ operation: "save", entry: future, expectedVersion: 0 }))
      .status,
    200
  );
  due = await f.call({ operation: "reminders" });
  assert.deepEqual(((await due.json()) as { entries: unknown[] }).entries, []);
  assert.equal(
    (
      await f.call({
        operation: "save",
        entry: { ...task, id: "cancelled-reminder", status: "CANCELLED" },
        expectedVersion: 0
      })
    ).status,
    200
  );
  due = await f.call({ operation: "reminders" });
  assert.deepEqual(((await due.json()) as { entries: unknown[] }).entries, []);
});

test("portal chat reads the same persisted native agenda and long-running availability", async () => {
  const f = await fixture();
  assert.equal(
    (
      await f.call({
        operation: "save",
        entry: {
          ...entry,
          id: "long",
          startsAt: "2026-10-26T12:00:00Z",
          endsAt: "2026-11-02T12:00:00Z"
        },
        expectedVersion: 0
      })
    ).status,
    200
  );
  const transport = createNativeCalendarReadTransport(f.namespace, "tenant-a");
  const availability = {
    tenantId: "tenant-a",
    correlationId: "chat-read",
    request: {
      operation: "availability" as const,
      timeMin: "2026-11-01T12:00:00Z",
      timeMax: "2026-11-01T13:00:00Z",
      calendarIds: [],
      timezone: "America/Asuncion"
    }
  };
  let result = await transport.execute(availability);
  assert.equal(result.ok, true);
  assert.equal((result.output as { available: boolean }).available, false);
  assert.equal((result.output as { busy: unknown[] }).busy.length, 1);
  result = await transport.execute({ ...availability, tenantId: "tenant-b" });
  assert.equal(result.ok, false);
  result = await transport.execute({
    tenantId: "tenant-a",
    correlationId: "write-denied",
    request: { operation: "delete", eventId: "long" }
  });
  assert.equal(result.ok, false);
  result = await transport.execute({
    tenantId: "tenant-a",
    correlationId: "chat-list",
    request: {
      operation: "search",
      timeMin: "2026-10-26T00:00:00Z",
      timeMax: "2026-10-27T00:00:00Z"
    }
  });
  assert.equal(result.ok, true);
  assert.equal((result.output as { entries: unknown[] }).entries.length, 1);
  const corrupt = createNativeCalendarReadTransport(
    {
      idFromName: (n) => n,
      get: () => ({
        fetch: async () =>
          Response.json({ ok: true, entries: [{ tenantId: "tenant-b" }] })
      })
    },
    "tenant-a"
  );
  assert.equal((await corrupt.execute(availability)).ok, false);
});
