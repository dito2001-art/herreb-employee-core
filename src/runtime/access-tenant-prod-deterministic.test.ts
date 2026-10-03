import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("production agent instance is deterministic", async () => {
  const identity = { email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" as const };
  assert.equal(await accessAgentInstanceSuffix(identity), await accessAgentInstanceSuffix(identity));
});
