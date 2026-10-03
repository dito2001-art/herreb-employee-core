import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("verified Access identity provenance source remains explicit", () => {
  const provenance = accessIdentityProvenance({ email: "owner@test", tenantId: "t", actorId: "a", role: "owner" });
  assert.equal(provenance.source, "cloudflare-access-google");
  assert.equal(provenance.subjectId, "a");
  assert.equal(provenance.tenantId, "t");
});
