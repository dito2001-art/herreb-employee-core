import test from "node:test";
import assert from "node:assert/strict";
import { initializeIsolatedWorkforceStateOnce } from "./workforce-isolated-bootstrap";

const bootstrap = {
  manifests: [{ tenantId: "tenant-a", name: "A", enabledEmployees: ["EMP-001" as const],
    knowledgeNamespace: "a-k", offeringNamespace: "a-o" }],
  identities: [{ email: "a@example.test", actorId: "actor-a", tenantId: "tenant-a", role: "owner" as const }]
};

function memoryStorage() {
  const values = new Map<string, unknown>();
  return {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined; },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)); },
    values
  };
}

test("initializes once and verifies persisted state", async () => {
  const storage = memoryStorage();
  assert.equal(await initializeIsolatedWorkforceStateOnce(storage, bootstrap), "initialized");
  assert.deepEqual(storage.values.get("workforce-admin:state:v1"), bootstrap);
  assert.equal(await initializeIsolatedWorkforceStateOnce(storage, bootstrap), "existing");
});

test("revoked identity is never restored by stale bootstrap", async () => {
  const storage = memoryStorage();
  await initializeIsolatedWorkforceStateOnce(storage, bootstrap);
  const revoked = { ...bootstrap, identities: [] };
  await storage.put("workforce-admin:state:v1", revoked);
  assert.equal(await initializeIsolatedWorkforceStateOnce(storage, bootstrap), "existing");
  assert.deepEqual(await storage.get("workforce-admin:state:v1"), revoked);
});

test("rejects empty or invalid initial bootstrap without persisting", async () => {
  const storage = memoryStorage();
  await assert.rejects(initializeIsolatedWorkforceStateOnce(storage, { manifests: [], identities: [] }));
  await assert.rejects(initializeIsolatedWorkforceStateOnce(storage, {
    ...bootstrap, identities: [{ ...bootstrap.identities[0], tenantId: "missing" }]
  }));
  assert.equal(storage.values.size, 0);
});

test("rejects duplicate emails across tenants", async () => {
  const storage = memoryStorage();
  await assert.rejects(initializeIsolatedWorkforceStateOnce(storage, {
    ...bootstrap, identities: [bootstrap.identities[0], { ...bootstrap.identities[0], actorId: "other", email: "A@example.test" }]
  }), /WORKFORCE_ISOLATED_IDENTITY_DUPLICATE/);
  assert.equal(storage.values.size, 0);
});

test("write failure cannot be reported as successful initialization", async () => {
  const storage = { get: async <T>(_key: string): Promise<T | undefined> => undefined,
    put: async <T>(_key: string, _value: T): Promise<void> => {} };
  await assert.rejects(initializeIsolatedWorkforceStateOnce(storage, bootstrap), /READBACK_FAILED/);
});
