import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix } from "./access-identity";

test("production tenant identity instances remain isolated", async () => {
  assert.notEqual(
    await accessAgentInstanceSuffix({ email: "o@test", tenantId: "a", actorId: "o", role: "owner" }),
    await accessAgentInstanceSuffix({ email: "o@test", tenantId: "b", actorId: "o", role: "owner" })
  );
});
