import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance } from "./access-identity";

test("production provenance binds subject to tenant", () => {
  const p = accessIdentityProvenance({ email: "o@test", tenantId: "t", actorId: "o", role: "owner" });
  assert.deepEqual([p.tenantId, p.subjectId], ["t", "o"]);
});
