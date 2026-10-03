import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("same actor and email remain isolated by tenant", async () => {
  const a = { email: "same@test", tenantId: "a", actorId: "same", role: "user" as const };
  const b = { email: "same@test", tenantId: "b", actorId: "same", role: "user" as const };
  assert.notEqual(await accessAgentInstanceSuffix(a), await accessAgentInstanceSuffix(b));
});
