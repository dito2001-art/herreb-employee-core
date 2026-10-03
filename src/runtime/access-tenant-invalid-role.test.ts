import assert from "node:assert/strict";
import test from "node:test";
import { parseAccessIdentityBindings } from "./access-identity";

test("unsupported access role is rejected", () => {
  assert.throws(() => parseAccessIdentityBindings(JSON.stringify([{ email: "a@test", tenantId: "t", actorId: "a", role: "invalid-role" }])), /ACCESS_IDENTITY_MAP_INVALID_ENTRY/);
});
