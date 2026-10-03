import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("verified access provenance carries tenant and actor", () => {
  const provenance = accessIdentityProvenance({ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" });
  assert.equal(provenance.tenantId, "t");
  assert.equal(provenance.subjectId, "owner");
  assert.equal(provenance.assurance, "OWNER_VERIFIED");
});
