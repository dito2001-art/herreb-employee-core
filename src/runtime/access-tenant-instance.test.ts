import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("same email in different tenant yields different agent instance", async () => {
  const a = await accessAgentInstanceSuffix({ email: "owner@test.local", tenantId: "a", actorId: "owner", role: "owner" });
  const b = await accessAgentInstanceSuffix({ email: "owner@test.local", tenantId: "b", actorId: "owner", role: "owner" });
  assert.notEqual(a, b);
});
