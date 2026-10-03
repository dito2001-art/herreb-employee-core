import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("agent instance key is based on tenant and authenticated email", async () => {
  const a = await accessAgentInstanceSuffix({ email: "person@test", tenantId: "t", actorId: "actor-a", role: "owner" });
  const b = await accessAgentInstanceSuffix({ email: "person@test", tenantId: "t", actorId: "actor-b", role: "user" });
  assert.equal(a, b);
});
