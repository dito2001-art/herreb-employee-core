import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("tenant scoped agent suffix is stable 24 character hex", async () => {
  const suffix = await accessAgentInstanceSuffix({ email: "owner@test", tenantId: "t", actorId: "a", role: "owner" });
  assert.match(suffix, /^[0-9a-f]{24}$/);
});
