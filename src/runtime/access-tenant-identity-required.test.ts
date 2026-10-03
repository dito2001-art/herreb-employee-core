import assert from "node:assert/strict";
import test from "node:test";
import { parseAccessIdentityBindings } from "./access-identity";

test("tenant actor and email are all required in configured identity", () => {
  assert.throws(() => parseAccessIdentityBindings(JSON.stringify([{ email: "a@test", tenantId: "", actorId: "a", role: "owner" }])), /ACCESS_IDENTITY_MAP_INVALID_ENTRY/);
  assert.throws(() => parseAccessIdentityBindings(JSON.stringify([{ email: "a@test", tenantId: "t", actorId: "", role: "owner" }])), /ACCESS_IDENTITY_MAP_INVALID_ENTRY/);
});
