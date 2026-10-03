import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("production provenance source remains Cloudflare Access", () => {
  assert.equal(accessIdentityProvenance({ email: "o@test", tenantId: "t", actorId: "o", role: "owner" }).source, "cloudflare-access-google");
});
