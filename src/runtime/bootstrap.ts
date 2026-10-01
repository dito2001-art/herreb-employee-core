import type { CapabilityAdapter } from "../core";
import {
  createAg002GatewayReadOnlyTransport,
  createCalendarAdapter,
  createCrmAdapter,
  createCrmCalendarReadTransport,
  createEmailAdapter,
  createEmailReadOnlyTransport,
  createSalesOpsAdapter,
  createSharedOfferingReadAdapter,
  projectReadOnlyAdapter,
  type ReadOnlyServiceOptions,
  type ServiceFetcher
} from "../adapters";
import { assertReadOnlyAdapters } from "./read-only";

export interface ReadOnlyRuntimeEnv {
  SALES_OPS?: ServiceFetcher;
  SALES_OPS_TOKEN?: string;
  AG002_GATEWAY?: ServiceFetcher;
  HERREB_RUNTIME_TOKEN?: string;
  AG002_TENANT_ID?: string;
  // Legacy calendar binding retained in the env contract for deployment compatibility.
  // EMP-002 no longer uses it: agenda reads come exclusively from HerreB CRM.
  CALENDAR_READ?: ServiceFetcher;
  CALENDAR_READ_TOKEN?: string;
  CALENDAR_TENANT_ID?: string;
  EMAIL_READ?: ServiceFetcher;
  EMAIL_READ_TOKEN?: string;
  EMAIL_TENANT_ID?: string;
}

type ConnectionState =
  | "CONNECTED"
  | "MISSING_BINDING"
  | "MISSING_TOKEN"
  | "MISSING_TENANT_SCOPE";

export interface ReadOnlyRuntimeBootstrap {
  adapters: CapabilityAdapter[];
  connectedCapabilities: ReadonlySet<string>;
  diagnostics: {
    salesOps: ConnectionState;
    crm: ConnectionState;
    calendar: ConnectionState;
    email: ConnectionState;
  };
}

function nonBlank(value: string | undefined): string | undefined {
  const clean = value?.trim();
  return clean ? clean : undefined;
}

function connectionState(
  binding: ServiceFetcher | undefined,
  token: string | undefined
): ConnectionState {
  if (!binding) return "MISSING_BINDING";
  if (!token) return "MISSING_TOKEN";
  return "CONNECTED";
}

function scopedConnectionState(
  binding: ServiceFetcher | undefined,
  token: string | undefined,
  tenantId: string | undefined
): ConnectionState {
  const state = connectionState(binding, token);
  if (state !== "CONNECTED") return state;
  return tenantId ? "CONNECTED" : "MISSING_TENANT_SCOPE";
}

function readOnlyService(
  service: ServiceFetcher,
  token: string,
  tenantId: string
): ReadOnlyServiceOptions {
  return { service, token, tenantId };
}

export function buildReadOnlyRuntime(
  env: ReadOnlyRuntimeEnv
): ReadOnlyRuntimeBootstrap {
  const adapters: CapabilityAdapter[] = [];
  const salesToken = nonBlank(env.SALES_OPS_TOKEN);
  const runtimeToken = nonBlank(env.HERREB_RUNTIME_TOKEN);
  const ag002TenantId = nonBlank(env.AG002_TENANT_ID);
  const emailToken = nonBlank(env.EMAIL_READ_TOKEN);
  const emailTenantId = nonBlank(env.EMAIL_TENANT_ID);

  const crmState = scopedConnectionState(
    env.AG002_GATEWAY,
    runtimeToken,
    ag002TenantId
  );

  const diagnostics: ReadOnlyRuntimeBootstrap["diagnostics"] = {
    salesOps: connectionState(env.SALES_OPS, salesToken),
    crm: crmState,
    // Calendar is a CRM-backed facade. Google connectivity is owned by CRM.
    calendar: crmState,
    email: scopedConnectionState(env.EMAIL_READ, emailToken, emailTenantId)
  };

  if (env.SALES_OPS && salesToken) {
    adapters.push(
      createSharedOfferingReadAdapter({
        service: env.SALES_OPS,
        token: salesToken
      })
    );
    adapters.push(
      projectReadOnlyAdapter(
        createSalesOpsAdapter({ service: env.SALES_OPS, token: salesToken }),
        ["offering.recommend"]
      )
    );
  }

  if (env.AG002_GATEWAY && runtimeToken && ag002TenantId) {
    const crmTransport = createAg002GatewayReadOnlyTransport({
      service: env.AG002_GATEWAY,
      runtimeToken,
      tenantId: ag002TenantId
    });

    adapters.push(
      projectReadOnlyAdapter(createCrmAdapter(crmTransport), ["crm.read"])
    );

    adapters.push(
      projectReadOnlyAdapter(
        createCalendarAdapter(createCrmCalendarReadTransport(crmTransport)),
        ["calendar.read"]
      )
    );
  }

  if (env.EMAIL_READ && emailToken && emailTenantId) {
    adapters.push(
      projectReadOnlyAdapter(
        createEmailAdapter(
          createEmailReadOnlyTransport(
            readOnlyService(env.EMAIL_READ, emailToken, emailTenantId)
          )
        ),
        ["email.read"]
      )
    );
  }

  assertReadOnlyAdapters(adapters);
  return {
    adapters,
    connectedCapabilities: new Set(
      adapters.flatMap((adapter) => [...adapter.capabilities])
    ),
    diagnostics
  };
}
