import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("production identity provenance source is explicit", () => {
  assert.equal(accessIdentityProvenance({ email: "o@test", tenantId: "t", actorId: "o", role: "owner" }).source, "cloudflare-access-google");
});
