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

function scopedFallback<T>(
  value: T | undefined,
  authorizedTenantId: string | undefined,
  requestedTenantId: string
): T | undefined {
  return authorizedTenantId?.trim() === requestedTenantId ? value : undefined;
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

  const sharedCrm = scopedFallback(
    env.AG002_GATEWAY,
    env.AG002_TENANT_ID,
    tenantId
  );
  const sharedCrmToken = sharedCrm ? env.HERREB_RUNTIME_TOKEN : undefined;
  const sharedCalendar = scopedFallback(
    env.CALENDAR_READ,
    env.CALENDAR_TENANT_ID,
    tenantId
  );
  const sharedCalendarToken = sharedCalendar
    ? env.CALENDAR_READ_TOKEN
    : undefined;
  const sharedEmail = scopedFallback(
    env.EMAIL_READ,
    env.EMAIL_TENANT_ID,
    tenantId
  );
  const sharedEmailToken = sharedEmail ? env.EMAIL_READ_TOKEN : undefined;

  const calendarService = scoped?.calendarService ?? sharedCalendar;
  const calendarToken = scoped?.calendarToken ?? sharedCalendarToken;
  const calendarTenantId = scoped?.calendarService
    ? tenantId
    : sharedCalendar
      ? tenantId
      : undefined;
  const emailService = scoped?.emailService ?? sharedEmail;
  const emailToken = scoped?.emailToken ?? sharedEmailToken;
  const emailTenantId = scoped?.emailService
    ? tenantId
    : sharedEmail
      ? tenantId
      : undefined;

  return buildReadOnlyRuntime({
    SALES_OPS: env.SALES_OPS,
    SALES_OPS_TOKEN: env.SALES_OPS_TOKEN,
    AG002_GATEWAY: resolved?.binding.service ?? sharedCrm,
    HERREB_RUNTIME_TOKEN: resolved?.binding.runtimeToken ?? sharedCrmToken,
    AG002_TENANT_ID: resolved || sharedCrm ? tenantId : undefined,
    CALENDAR_READ: calendarService,
    CALENDAR_READ_TOKEN: calendarToken,
    CALENDAR_TENANT_ID: calendarTenantId,
    EMAIL_READ: emailService,
    EMAIL_READ_TOKEN: emailToken,
    EMAIL_TENANT_ID: emailTenantId
  });
}
