import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix, accessIdentityProvenance } from "./access-identity";

test("agent instance is deterministic and tenant scoped", async () => {
  const a = { email: "owner@test.local", tenantId: "tenant-a", actorId: "owner", role: "owner" as const };
  const b = { ...a, tenantId: "tenant-b" };
  assert.equal(await accessAgentInstanceSuffix(a), await accessAgentInstanceSuffix(a));
  assert.notEqual(await accessAgentInstanceSuffix(a), await accessAgentInstanceSuffix(b));
});

test("verified identity provenance remains tenant scoped", () => {
  const owner = accessIdentityProvenance({ email: "owner@test.local", tenantId: "tenant-a", actorId: "owner", role: "owner" });
  const user = accessIdentityProvenance({ email: "user@test.local", tenantId: "tenant-a", actorId: "user", role: "user" });
  assert.equal(owner.assurance, "OWNER_VERIFIED");
  assert.equal(user.assurance, "SERVICE_VERIFIED");
  assert.equal(owner.tenantId, "tenant-a");
  assert.equal(owner.source, "cloudflare-access-google");
});
