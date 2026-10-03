import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("production agent instance suffix is compact hex", async () => {
  const suffix = await accessAgentInstanceSuffix({ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" });
  assert.match(suffix, /^[0-9a-f]{24}$/);
});
