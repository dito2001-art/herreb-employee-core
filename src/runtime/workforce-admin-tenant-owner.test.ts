import assert from "node:assert/strict";
import test from "node:test";
import { resolveScopedM2MOwner } from "./workforce-admin-tenant-owner";

test("M2M owner is confined to the token-configured tenant", () => {
  const authenticated = { authenticated: true, actorId: "owner-a", tenantId: "tenant-a" };
  assert.deepEqual(resolveScopedM2MOwner({ ...authenticated, requestedTenantId: "tenant-a" }), { actorId: "owner-a", tenantId: "tenant-a", role: "owner" });
  assert.equal(resolveScopedM2MOwner({ ...authenticated, requestedTenantId: "tenant-b" }), undefined);
  assert.equal(resolveScopedM2MOwner({ ...authenticated, requestedTenantId: "tenant-b", actorId: "owner-b" }), undefined);
});

test("forged Access email, missing credential or missing tenant never selects a fallback owner", () => {
  const requestHeaders = new Headers({ "cf-access-authenticated-user-email": "owner-b@example.test" });
  assert.equal(requestHeaders.get("cf-access-authenticated-user-email"), "owner-b@example.test");
  assert.equal(resolveScopedM2MOwner({ authenticated: false, actorId: "owner-a", tenantId: "tenant-a", requestedTenantId: "tenant-a" }), undefined);
  assert.equal(resolveScopedM2MOwner({ authenticated: true, actorId: "owner-a", tenantId: "tenant-a", requestedTenantId: undefined }), undefined);
  assert.equal(resolveScopedM2MOwner({ authenticated: true, actorId: "", tenantId: "tenant-a", requestedTenantId: "tenant-a" }), undefined);
});
