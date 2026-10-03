import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("production instance suffix is tenant and email scoped", async () => {
  const a = await accessAgentInstanceSuffix({ email: "owner@test", tenantId: "a", actorId: "owner", role: "owner" });
  const b = await accessAgentInstanceSuffix({ email: "owner@test", tenantId: "b", actorId: "owner", role: "owner" });
  assert.notEqual(a, b);
});
