import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlatformAdminCredential } from "./workforce-platform-admin-auth";

const secret = "test-only-credential-with-more-than-32-characters";
test("valid independent credential resolves platform role", () => {
  assert.deepEqual(resolvePlatformAdminCredential({ expectedToken: secret, suppliedToken: secret, actorId: "fernando" }), {
    actorId: "fernando", tenantId: "platform", role: "platform_admin"
  });
});
test("missing, wrong and short credentials never resolve platform role", () => {
  for (const suppliedToken of [undefined, "", "wrong", "owner"]) {
    assert.equal(resolvePlatformAdminCredential({ expectedToken: secret, suppliedToken, actorId: "fernando" }), undefined);
  }
  assert.equal(resolvePlatformAdminCredential({ expectedToken: "short", suppliedToken: "short", actorId: "fernando" }), undefined);
  assert.equal(resolvePlatformAdminCredential({ expectedToken: secret, suppliedToken: secret }), undefined);
});
