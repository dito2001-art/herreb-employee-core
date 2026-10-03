import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("verified user provenance remains service verified", () => {
  const provenance = accessIdentityProvenance({ email: "user@test", tenantId: "t", actorId: "user", role: "user" });
  assert.equal(provenance.tenantId, "t");
  assert.equal(provenance.assurance, "SERVICE_VERIFIED");
});
