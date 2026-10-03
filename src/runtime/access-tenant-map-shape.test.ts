import assert from "node:assert/strict";
import test from "node:test";
import { parseAccessIdentityBindings } from "./access-identity";

test("invalid access identity map shape is rejected", () => {
  assert.throws(() => parseAccessIdentityBindings("{}"), /ACCESS_IDENTITY_MAP_INVALID/);
  assert.throws(() => parseAccessIdentityBindings(JSON.stringify([{ email: "", tenantId: "t", actorId: "a", role: "owner" }])), /ACCESS_IDENTITY_MAP_INVALID_ENTRY/);
});
