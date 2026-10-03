import assert from "node:assert/strict";
import test from "node:test";
import type { TenantRegistryManifest } from "../core/tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests: TenantRegistryManifest[] = [
  {
    tenantId: "herreb-client-0",
    name: "HerreB Client 0",
    enabledEmployees: ["EMP-001", "EMP-002"],
    knowledgeNamespace: "herreb-client-0:knowledge",
    offeringNamespace: "herreb-client-0:offerings"
  },
  {
    tenantId: "tenant-b-test",
    name: "Tenant B Synthetic",
    enabledEmployees: ["EMP-002"],
    knowledgeNamespace: "tenant-b-test:knowledge",
    offeringNamespace: "tenant-b-test:offerings"
  }
];

test("Access identity resolves through the shared tenant registry", () => {
  const raw = JSON.stringify([
    { email: "owner@herreb.test", tenantId: "herreb-client-0", actorId: "owner-a", role: "owner" },
    { email: "team@tenant-b.test", tenantId: "tenant-b-test", actorId: "team-b", role: "user" }
  ]);
  const identity = resolveAccessIdentityWithRegistry("TEAM@TENANT-B.TEST", raw, manifests);
  assert.equal(identity?.tenantId, "tenant-b-test");
  assert.equal(identity?.actorId, "team-b");
});

test("Access identity rejects a binding to an unknown tenant", () => {
  const raw = JSON.stringify([
    { email: "unknown@tenant.test", tenantId: "missing-tenant", actorId: "actor-x", role: "user" }
  ]);
  assert.throws(() => resolveAccessIdentityWithRegistry("unknown@tenant.test", raw, manifests), /TENANT_NOT_FOUND/);
});

test("Access identity rejects the same email across tenants", () => {
  const raw = JSON.stringify([
    { email: "shared@herreb.test", tenantId: "herreb-client-0", actorId: "owner-a", role: "owner" },
    { email: "shared@herreb.test", tenantId: "tenant-b-test", actorId: "owner-b", role: "owner" }
  ]);
  assert.throws(() => resolveAccessIdentityWithRegistry("shared@herreb.test", raw, manifests), /IDENTITY_TENANT_CONFLICT/);
});
