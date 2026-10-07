import type { CapabilityAdapter } from "../core";
import {
  createCrmCapabilityControlledWriteTransport,
  createCrmCapabilityReadOnlyTransport,
  createCalendarAdapter,
  createCalendarReadOnlyTransport,
  createCrmAdapter,
  createMarketingCrmAdapter,
  createCrmCalendarReadTransport,
  createEmailAdapter,
  createEmailReadOnlyTransport,
  createSalesOpsAdapter,
  createSharedOfferingReadAdapter,
  projectReadOnlyAdapter,
  type ReadOnlyServiceOptions,
  type ServiceFetcher
} from "../adapters";

export interface ReadOnlyRuntimeEnv {
  SALES_OPS?: ServiceFetcher;
  SALES_OPS_TOKEN?: string;
  CRM_CAPABILITY?: ServiceFetcher;
  /** @deprecated Temporary compatibility alias during CRM capability cutover. */
  AG002_GATEWAY?: ServiceFetcher;
  RUNTIME_GATEWAY_TOKEN?: string;
  /** @deprecated Use RUNTIME_GATEWAY_TOKEN. Kept temporarily for deployment compatibility. */
  HERREB_RUNTIME_TOKEN?: string;
  CRM_TENANT_ID?: string;
  /** @deprecated Temporary compatibility alias during CRM capability cutover. */
  AG002_TENANT_ID?: string;
  /** @deprecated Calendar is CRM-backed; retained for scoped migration compatibility. */
  CALENDAR_READ?: ServiceFetcher;
  CALENDAR_READ_TOKEN?: string;
  CALENDAR_TENANT_ID?: string;
  EMAIL_READ?: ServiceFetcher;
  EMAIL_READ_TOKEN?: string;
  EMAIL_TENANT_ID?: string;
}

type ConnectionState = "CONNECTED" | "MISSING_BINDING" | "MISSING_TOKEN" | "MISSING_TENANT_SCOPE";
export interface ReadOnlyRuntimeBootstrap {
  adapters: CapabilityAdapter[];
  connectedCapabilities: ReadonlySet<string>;
  diagnostics: { salesOps: ConnectionState; crm: ConnectionState; calendar: ConnectionState; email: ConnectionState };
}

function nonBlank(value: string | undefined): string | undefined { const clean = value?.trim(); return clean ? clean : undefined; }
function connectionState(binding: ServiceFetcher | undefined, token: string | undefined): ConnectionState { if (!binding) return "MISSING_BINDING"; if (!token) return "MISSING_TOKEN"; return "CONNECTED"; }
function scopedConnectionState(binding: ServiceFetcher | undefined, token: string | undefined, tenantId: string | undefined): ConnectionState { const state = connectionState(binding, token); if (state !== "CONNECTED") return state; return tenantId ? "CONNECTED" : "MISSING_TENANT_SCOPE"; }
function readOnlyService(service: ServiceFetcher, token: string, tenantId: string): ReadOnlyServiceOptions { return { service, token, tenantId }; }

/**
 * Builds the connected runtime. The historical name is retained to avoid a
 * breaking migration for callers, but CRM now supports controlled writes via
 * the same tenant-scoped CRM capability binding used for reads.
 */
export function buildReadOnlyRuntime(env: ReadOnlyRuntimeEnv): ReadOnlyRuntimeBootstrap {
  const adapters: CapabilityAdapter[] = [];
  const salesToken = nonBlank(env.SALES_OPS_TOKEN);
  const runtimeToken = nonBlank(env.RUNTIME_GATEWAY_TOKEN) ?? nonBlank(env.HERREB_RUNTIME_TOKEN);
  const crmTenantId = nonBlank(env.CRM_TENANT_ID) ?? nonBlank(env.AG002_TENANT_ID);
  const crmCapability = env.CRM_CAPABILITY ?? env.AG002_GATEWAY;
  const calendarToken = nonBlank(env.CALENDAR_READ_TOKEN);
  const calendarTenantId = nonBlank(env.CALENDAR_TENANT_ID);
  const emailToken = nonBlank(env.EMAIL_READ_TOKEN);
  const emailTenantId = nonBlank(env.EMAIL_TENANT_ID);
  const crmState = scopedConnectionState(crmCapability, runtimeToken, crmTenantId);
  const legacyCalendarConfigured = Boolean(env.CALENDAR_READ);
  const calendarState = legacyCalendarConfigured ? scopedConnectionState(env.CALENDAR_READ, calendarToken, calendarTenantId) : crmState;

  const diagnostics: ReadOnlyRuntimeBootstrap["diagnostics"] = {
    salesOps: connectionState(env.SALES_OPS, salesToken),
    crm: crmState,
    calendar: calendarState,
    email: scopedConnectionState(env.EMAIL_READ, emailToken, emailTenantId)
  };

  if (env.SALES_OPS && salesToken) {
    adapters.push(createSharedOfferingReadAdapter({ service: env.SALES_OPS, token: salesToken }));
    adapters.push(projectReadOnlyAdapter(createSalesOpsAdapter({ service: env.SALES_OPS, token: salesToken }), ["offering.recommend"]));
  }

  let crmReadTransport: ReturnType<typeof createCrmCapabilityReadOnlyTransport> | undefined;
  if (crmCapability && runtimeToken && crmTenantId) {
    const gatewayOptions = { service: crmCapability, runtimeToken, tenantId: crmTenantId };
    crmReadTransport = createCrmCapabilityReadOnlyTransport(gatewayOptions);
    const crmWriteTransport = createCrmCapabilityControlledWriteTransport(gatewayOptions);
    adapters.push(projectReadOnlyAdapter(createCrmAdapter(crmReadTransport), ["crm.read"]));
    // Deliberately do not project this adapter through read-only guards: it is
    // the explicit controlled-write path and enforces tenant + idempotency.
    adapters.push(createCrmAdapter(crmWriteTransport));
    // EMP-003 shares the tenant-scoped CRM transport but gets a separate
    // adapter whose write allowlist is limited to marketing-owned entities.
    // One marketing adapter owns both marketing.read and marketing.write;
    // route each operation through the appropriate tenant-scoped transport.
    adapters.push(createMarketingCrmAdapter({
      execute(input) {
        return (input.operation === "read" ? crmReadTransport! : crmWriteTransport).execute(input);
      }
    }));
  }

  if (env.CALENDAR_READ && calendarToken && calendarTenantId) {
    adapters.push(projectReadOnlyAdapter(createCalendarAdapter(createCalendarReadOnlyTransport(readOnlyService(env.CALENDAR_READ, calendarToken, calendarTenantId))), ["calendar.read"]));
  } else if (!legacyCalendarConfigured && crmReadTransport) {
    adapters.push(projectReadOnlyAdapter(createCalendarAdapter(createCrmCalendarReadTransport(crmReadTransport)), ["calendar.read"]));
  }

  if (env.EMAIL_READ && emailToken && emailTenantId) {
    adapters.push(projectReadOnlyAdapter(createEmailAdapter(createEmailReadOnlyTransport(readOnlyService(env.EMAIL_READ, emailToken, emailTenantId))), ["email.read"]));
  }

  return { adapters, connectedCapabilities: new Set(adapters.flatMap((adapter) => [...adapter.capabilities])), diagnostics };
}
