import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("production roles retain distinct assurance", () => {
  assert.notEqual(
    accessIdentityProvenance({ email: "o@test", tenantId: "t", actorId: "o", role: "owner" }).assurance,
    accessIdentityProvenance({ email: "u@test", tenantId: "t", actorId: "u", role: "user" }).assurance
  );
});
