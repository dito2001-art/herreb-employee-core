import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("access provenance identifies Cloudflare Access source", () => {
  const provenance = accessIdentityProvenance({ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" });
  assert.equal(provenance.source, "cloudflare-access-google");
});
