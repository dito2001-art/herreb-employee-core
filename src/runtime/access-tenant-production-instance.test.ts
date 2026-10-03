import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("same authenticated email cannot share an agent instance across tenants", async () => {
  const email = "owner@test";
  const a = await accessAgentInstanceSuffix({ email, tenantId: "a", actorId: "owner", role: "owner" });
  const b = await accessAgentInstanceSuffix({ email, tenantId: "b", actorId: "owner", role: "owner" });
  assert.notEqual(a, b);
});
