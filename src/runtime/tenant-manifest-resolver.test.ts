import assert from "node:assert/strict";
import test from "node:test";

import {
  createTenantManifestResolver,
  createTenantManifestResolverFromJson
} from "./tenant-manifest-resolver";

const herreb = {
  tenantId: "herreb",
  enabledEmployees: ["EMP-001", "EMP-002", "EMP-003"] as const,
  knowledgeNamespace: "herreb:knowledge",
  offeringNamespace: "herreb:offerings"
};

test("tenant manifest resolver returns only the requested tenant", async () => {
  const resolve = createTenantManifestResolver([herreb]);
  const manifest = await resolve("herreb");
  assert.equal(manifest.tenantId, "herreb");
  assert.deepEqual(manifest.enabledEmployees, ["EMP-001", "EMP-002", "EMP-003"]);
  await assert.rejects(async () => resolve("other"), /TENANT_MANIFEST_NOT_FOUND/);
});

test("tenant manifest resolver rejects duplicate tenants", () => {
  assert.throws(
    () => createTenantManifestResolver([herreb, herreb]),
    /DUPLICATE_TENANT_MANIFEST/
  );
});

test("JSON resolver fails closed when store is missing or malformed", async () => {
  const missing = createTenantManifestResolverFromJson(undefined);
  await assert.rejects(
    async () => missing("herreb"),
    /TENANT_MANIFEST_STORE_NOT_CONFIGURED/
  );
  assert.throws(
    () => createTenantManifestResolverFromJson("{}"),
    /TENANT_MANIFEST_STORE_INVALID/
  );
});

test("JSON resolver supports Client 0 without hardcoding it into runtime", async () => {
  const resolve = createTenantManifestResolverFromJson(JSON.stringify([herreb]));
  const manifest = await resolve("herreb");
  assert.equal(manifest.offeringNamespace, "herreb:offerings");
});
