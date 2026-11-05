import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { handleEMP001Profile, sanitizeProfile } from "../src/emp001-profile.ts";
const owner = { email: "owner@example.invalid", actorId: "owner", tenantMemberships: [{ tenantId: "herreb-client-b", role: "tenant_owner" }] };
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_tenant_registry.sql", import.meta.url), "utf8"));
  for (const t of ["herreb-client-b", "tenant-a"]) {
    db.prepare("INSERT INTO tenants(id,name,status)VALUES(?,?,'active')").run(t, t);
    db.prepare("INSERT INTO tenant_employees(tenant_id,employee_id,status,configuration_json)VALUES(?,'EMP-001','active',?)").run(t, JSON.stringify({ knowledgeNamespace: "preserved" }));
  }
  let failBatch = false, failRead = false, reads = 0;
  const prepare = (sql) => {
    let values = [];
    const s = { bind(...args) {
      values = args;
      return s;
    }, async first() {
      reads++;
      if (failRead && reads > 1) {
        failRead = false;
        throw Error("read failure");
      }
      return db.prepare(sql).get(...values) || null;
    }, async all() {
      return { results: db.prepare(sql).all(...values) };
    }, async run() {
      return db.prepare(sql).run(...values);
    }, sql, get values() {
      return values;
    } };
    return s;
  };
  const env = { REGISTRY_DB: { prepare, async batch(statements) {
    db.exec("BEGIN");
    try {
      const result = statements.map((s) => db.prepare(s.sql).run(...s.values));
      if (failBatch) {
        failBatch = false;
        throw Error("failure");
      }
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  } } };
  const req = (method = "GET", body, action = "profile") => new Request("https://test/api/tenants/herreb-client-b/emp001/configuration/" + action, { method, headers: { "content-type": "application/json" }, ...body === void 0 ? {} : { body: JSON.stringify(body) } });
  const call = (method = "GET", body, action = "profile", tenant = "herreb-client-b") => handleEMP001Profile(req(method, body, action), env, tenant, owner, action);
  return { db, call, fail() {
    failBatch = true;
  }, failRead() {
    failRead = true;
    reads = 0;
  } };
}
const data = { sellerName: "Sof\xEDa", personality: "Resolutiva", instructions: "No inventar precios", ownerName: "Demo", ownerContact: "owner@example.invalid", tone: "Profesional y cercano", upsell: true };
const f = fixture();
let r = await f.call();
assert.equal(r.status, 200);
assert.equal((await r.json()).revision, 0);
r = await f.call("PUT", { data, expectedRevision: 0, operationId: "save-1" });
assert.equal(r.status, 200);
const first = await r.json();
assert.equal(first.readBack, true);
assert.equal(first.published, false);
assert.equal(first.hash.length, 64);
assert.deepEqual((await (await f.call()).json()).draft, data);
assert.equal(JSON.parse(f.db.prepare("SELECT configuration_json FROM tenant_employees WHERE tenant_id='herreb-client-b'").get().configuration_json).knowledgeNamespace, "preserved");
assert.equal((await f.call("PUT", { data, expectedRevision: 0, operationId: "save-1" })).status, 200);
assert.equal(f.db.prepare("SELECT count(*) n FROM audit_log").get().n, 1);
assert.equal((await f.call("PUT", { data: { ...data, sellerName: "Other" }, expectedRevision: 0, operationId: "save-1" })).status, 409);
assert.equal((await f.call("PUT", { data, expectedRevision: 0, operationId: "save-2" })).status, 409);
assert.equal((await f.call("POST", { data, expectedRevision: 1, hash: first.hash }, "validate")).status, 200);
assert.equal((await f.call("POST", { data: { ...data, sellerName: "Changed" }, expectedRevision: 1, hash: first.hash }, "validate")).status, 409);
assert.equal((await (await f.call("GET", void 0, "profile", "tenant-a")).json()).revision, 0);
for (const bad of [{ ...data, token: "secret" }, { ...data, paymentMode: "REAL" }, { ...data, instagramEnabled: true }, { sellerName: 42 }, { sellerName: "a".repeat(81) }]) assert.throws(() => sanitizeProfile(bad));
const c = fixture();
const concurrent = await Promise.all([c.call("PUT", { data, expectedRevision: 0, operationId: "a" }), c.call("PUT", { data: { ...data, sellerName: "Second" }, expectedRevision: 0, operationId: "b" })]);
assert.deepEqual(concurrent.map((r2) => r2.status).sort(), [200, 409]);
assert.equal(c.db.prepare("SELECT count(*) n FROM audit_log").get().n, 1);
const failure = fixture();
failure.fail();
assert.equal((await failure.call("PUT", { data, expectedRevision: 0, operationId: "fail" })).status, 503);
assert.equal((await (await failure.call()).json()).revision, 0);
assert.equal(failure.db.prepare("SELECT count(*) n FROM audit_log").get().n, 0);
failure.failRead();
assert.equal((await failure.call("PUT", { data, expectedRevision: 0, operationId: "recover" })).status, 503);
assert.equal((await failure.call("PUT", { data, expectedRevision: 0, operationId: "recover" })).status, 200);
assert.equal(failure.db.prepare("SELECT count(*) n FROM audit_log").get().n, 1);
console.log("PASS profile lifecycle: SQLite persistence, hash, exact validation, CAS contention, idempotence, audit once, tenant separation, rollback and post-commit recovery");
