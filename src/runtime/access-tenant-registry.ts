import type { TenantManifest } from "../core/tenant-manifest";
import type { TenantRegistryManifest } from "../core/tenant-registry";

export function tenantRegistryManifestsFromRuntime(
  manifests: readonly TenantManifest[]
): TenantRegistryManifest[] {
  return manifests.map((manifest) => ({
    tenantId: manifest.tenantId,
    name: manifest.tenantId,
    enabledEmployees: [...manifest.enabledEmployees],
    knowledgeNamespace: manifest.knowledgeNamespace,
    offeringNamespace: manifest.offeringNamespace
  }));
}

export function parseRuntimeTenantRegistryManifests(
  raw: string | undefined
): TenantRegistryManifest[] {
  if (!raw?.trim()) throw new Error("TENANT_MANIFEST_STORE_NOT_CONFIGURED");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("TENANT_MANIFEST_STORE_INVALID");
  return tenantRegistryManifestsFromRuntime(parsed as TenantManifest[]);
}
