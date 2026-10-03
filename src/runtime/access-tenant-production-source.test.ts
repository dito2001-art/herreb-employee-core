import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("production identity provenance is never marked unverified", () => {
  const provenance = accessIdentityProvenance({ email: "user@test", tenantId: "t", actorId: "user", role: "user" });
  assert.notEqual(provenance.assurance, "UNVERIFIED");
  assert.equal(provenance.source, "cloudflare-access-google");
});
