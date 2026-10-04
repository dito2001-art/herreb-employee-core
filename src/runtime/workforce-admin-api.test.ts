import assert from "node:assert/strict";
import test from "node:test";
import { handleWorkforceAdminApi } from "./workforce-admin-api";

const env = {
  TENANT_MANIFESTS_JSON: JSON.stringify([
    { tenantId: "client-0", enabledEmployees: ["EMP-001", "EMP-002", "EMP-003"], knowledgeNamespace: "client-0:k", offeringNamespace: "client-0:o" },
  ]),
  ACCESS_IDENTITY_MAP: JSON.stringify([
    { email: "owner@test", tenantId: "client-0", actorId: "owner", role: "owner" },
  ]),
};

test("admin GET returns validated workforce snapshot", async () => {
  const response = handleWorkforceAdminApi(new Request("https://test/api/admin/workforce"), env);
  assert.ok(response);
  assert.equal(response.status, 200);
  const body = await response.json() as { ok: boolean; snapshot: { totals: { tenants: number; identities: number } } };
  assert.equal(body.ok, true);
  assert.equal(body.snapshot.totals.tenants, 1);
  assert.equal(body.snapshot.totals.identities, 1);
});

test("admin API is read only", async () => {
  const response = handleWorkforceAdminApi(new Request("https://test/api/admin/workforce", { method: "POST" }), env);
  assert.ok(response);
  assert.equal(response.status, 405);
});

test("admin API fails closed when tenant configuration is absent", async () => {
  const response = handleWorkforceAdminApi(new Request("https://test/api/admin/workforce"), { ACCESS_IDENTITY_MAP: "[]" });
  assert.ok(response);
  assert.equal(response.status, 503);
  const body = await response.json() as { ok: boolean };
  assert.equal(body.ok, false);
});

test("unrelated routes are ignored", () => {
  assert.equal(handleWorkforceAdminApi(new Request("https://test/api/other"), env), undefined);
});
