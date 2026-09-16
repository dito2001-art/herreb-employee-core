import type { ServiceFetcher } from "../adapters";
import {
  buildReadOnlyRuntime,
  type ReadOnlyRuntimeBootstrap
} from "./bootstrap";
import {
  createTenantCrmRegistry,
  resolveTenantCrm,
  type TenantCrmBinding
} from "./tenant-crm";

export interface TenantCapabilityBinding extends TenantCrmBinding {
  calendarService?: ServiceFetcher;
  calendarToken?: string;
  emailService?: ServiceFetcher;
  emailToken?: string;
}

export interface TenantCapabilityEnv {
  SALES_OPS?: ServiceFetcher;
  SALES_OPS_TOKEN?: string;
  AG002_GATEWAY?: ServiceFetcher;
  HERREB_RUNTIME_TOKEN?: string;
  AG002_TENANT_ID?: string;
  TENANT_CRM_CONNECTORS_JSON?: string;
  CALENDAR_READ?: ServiceFetcher;
  CALENDAR_READ_TOKEN?: string;
  CALENDAR_TENANT_ID?: string;
  EMAIL_READ?: ServiceFetcher;
  EMAIL_READ_TOKEN?: string;
  EMAIL_TENANT_ID?: string;
}

export function buildTenantReadOnlyRuntime(
  env: TenantCapabilityEnv,
  tenantId: string,
  bindings: readonly TenantCapabilityBinding[]
): ReadOnlyRuntimeBootstrap {
  const registry = createTenantCrmRegistry(env.TENANT_CRM_CONNECTORS_JSON);
  const resolved = resolveTenantCrm(tenantId, registry, bindings);
  const scoped = resolved
    ? bindings.find(
        (binding) => binding.connectorId === resolved.connector.connectorId
      )
    : undefined;

  const calendarService = scoped?.calendarService ?? env.CALENDAR_READ;
  const calendarToken = scoped?.calendarToken ?? env.CALENDAR_READ_TOKEN;
  const calendarTenantId = scoped?.calendarService
    ? tenantId
    : env.CALENDAR_TENANT_ID;
  const emailService = scoped?.emailService ?? env.EMAIL_READ;
  const emailToken = scoped?.emailToken ?? env.EMAIL_READ_TOKEN;
  const emailTenantId = scoped?.emailService ? tenantId : env.EMAIL_TENANT_ID;

  return buildReadOnlyRuntime({
    SALES_OPS: env.SALES_OPS,
    SALES_OPS_TOKEN: env.SALES_OPS_TOKEN,
    AG002_GATEWAY: resolved?.binding.service ?? env.AG002_GATEWAY,
    HERREB_RUNTIME_TOKEN:
      resolved?.binding.runtimeToken ?? env.HERREB_RUNTIME_TOKEN,
    AG002_TENANT_ID: resolved ? tenantId : env.AG002_TENANT_ID,
    CALENDAR_READ: calendarService,
    CALENDAR_READ_TOKEN: calendarToken,
    CALENDAR_TENANT_ID: calendarTenantId,
    EMAIL_READ: emailService,
    EMAIL_READ_TOKEN: emailToken,
    EMAIL_TENANT_ID: emailTenantId
  });
}
