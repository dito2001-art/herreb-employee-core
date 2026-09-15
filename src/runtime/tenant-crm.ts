export type TenantCrmMode = "EXTERNAL_CRM" | "HERREB_MANAGED_CRM";

export interface TenantCrmConnector {
  tenantId: string;
  mode: TenantCrmMode;
  connectorId: string;
}

export interface TenantCrmRegistry {
  resolve(tenantId: string): TenantCrmConnector | undefined;
}

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseTenantCrmConnectors(raw: unknown): TenantCrmConnector[] {
  if (!Array.isArray(raw)) throw new Error("TENANT_CRM_CONNECTORS_INVALID");
  const seen = new Set<string>();
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("TENANT_CRM_CONNECTOR_INVALID");
    }
    const record = entry as Record<string, unknown>;
    const tenantId = clean(record.tenantId);
    const connectorId = clean(record.connectorId);
    const mode = record.mode;
    if (!tenantId || !connectorId || (mode !== "EXTERNAL_CRM" && mode !== "HERREB_MANAGED_CRM")) {
      throw new Error("TENANT_CRM_CONNECTOR_INVALID");
    }
    if (seen.has(tenantId)) throw new Error("TENANT_CRM_CONNECTOR_DUPLICATE");
    seen.add(tenantId);
    return { tenantId, mode, connectorId };
  });
}

export function createTenantCrmRegistry(rawJson: string | undefined): TenantCrmRegistry {
  let connectors: TenantCrmConnector[] = [];
  if (rawJson?.trim()) {
    try {
      connectors = parseTenantCrmConnectors(JSON.parse(rawJson));
    } catch (error) {
      const code = error instanceof Error && error.message.startsWith("TENANT_CRM_")
        ? error.message
        : "TENANT_CRM_CONNECTORS_INVALID";
      return { resolve() { throw new Error(code); } };
    }
  }
  const byTenant = new Map(connectors.map((connector) => [connector.tenantId, connector]));
  return { resolve(tenantId) { return byTenant.get(tenantId); } };
}
