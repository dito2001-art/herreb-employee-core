import { parseTenantManifest, type TenantManifest } from "../core/tenant-manifest";
import type { TenantRegistryManifest } from "../core/tenant-registry";

export function tenantRegistryManifestsFromRuntime(
  manifests: readonly TenantManifest[]
): TenantRegistryManifest[] {
  const seen = new Set<string>();
  return manifests.map((input) => {
    const manifest = parseTenantManifest(input);
    if (seen.has(manifest.tenantId)) throw new Error(`DUPLICATE_TENANT_MANIFEST:${manifest.tenantId}`);
    seen.add(manifest.tenantId);
    return {
      tenantId: manifest.tenantId,
      name: manifest.tenantId,
      enabledEmployees: [...manifest.enabledEmployees],
      knowledgeNamespace: manifest.knowledgeNamespace,
      offeringNamespace: manifest.offeringNamespace
    };
  });
}

export function parseRuntimeTenantRegistryManifests(
  raw: string | undefined
): TenantRegistryManifest[] {
  if (!raw?.trim()) throw new Error("TENANT_MANIFEST_STORE_NOT_CONFIGURED");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("TENANT_MANIFEST_STORE_INVALID_JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("TENANT_MANIFEST_STORE_INVALID");
  return tenantRegistryManifestsFromRuntime(parsed.map(parseTenantManifest));
}
