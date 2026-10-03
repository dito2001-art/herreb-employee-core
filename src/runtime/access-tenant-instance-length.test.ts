import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("tenant scoped agent suffix remains fixed length", async () => {
  const suffix = await accessAgentInstanceSuffix({ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" });
  assert.equal(suffix.length, 24);
});
