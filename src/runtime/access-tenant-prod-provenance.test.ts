import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("production provenance remains tenant scoped", () => {
  const provenance = accessIdentityProvenance({ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" });
  assert.equal(provenance.tenantId, "t");
  assert.equal(provenance.subjectId, "owner");
});
