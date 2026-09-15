import { parseTenantManifest, type TenantManifest } from "../core";

export type TenantManifestResolver = (
  tenantId: string
) => TenantManifest | Promise<TenantManifest>;

export function createTenantManifestResolver(
  manifests: readonly TenantManifest[]
): TenantManifestResolver {
  const byTenant = new Map<string, TenantManifest>();

  for (const input of manifests) {
    const manifest = parseTenantManifest(input);
    if (byTenant.has(manifest.tenantId)) {
      throw new Error(`DUPLICATE_TENANT_MANIFEST:${manifest.tenantId}`);
    }
    byTenant.set(manifest.tenantId, manifest);
  }

  return (tenantId: string) => {
    const manifest = byTenant.get(tenantId);
    if (!manifest) {
      throw new Error("TENANT_MANIFEST_NOT_FOUND");
    }
    return manifest;
  };
}

export function createTenantManifestResolverFromJson(
  raw: string | undefined
): TenantManifestResolver {
  if (!raw?.trim()) {
    return () => {
      throw new Error("TENANT_MANIFEST_STORE_NOT_CONFIGURED");
    };
  }

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("TENANT_MANIFEST_STORE_INVALID");
  }

  return createTenantManifestResolver(parsed.map(parseTenantManifest));
}
