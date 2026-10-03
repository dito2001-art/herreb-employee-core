import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("same tenant and email yields deterministic agent instance", async () => {
  const identity = { email: "owner@test.local", tenantId: "a", actorId: "owner", role: "owner" as const };
  assert.equal(await accessAgentInstanceSuffix(identity), await accessAgentInstanceSuffix(identity));
});
