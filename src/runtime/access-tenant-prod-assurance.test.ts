import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("production owner and user assurance remain distinct", () => {
  assert.equal(accessIdentityProvenance({ email: "o@test", tenantId: "t", actorId: "o", role: "owner" }).assurance, "OWNER_VERIFIED");
  assert.equal(accessIdentityProvenance({ email: "u@test", tenantId: "t", actorId: "u", role: "user" }).assurance, "SERVICE_VERIFIED");
});
