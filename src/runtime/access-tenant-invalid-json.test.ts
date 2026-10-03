import assert from "node:assert/strict";
import test from "node:test";
import { parseAccessIdentityBindings } from "./access-identity";

test("invalid access identity JSON is rejected", () => {
  assert.throws(() => parseAccessIdentityBindings("["), /ACCESS_IDENTITY_MAP_INVALID_JSON/);
});
