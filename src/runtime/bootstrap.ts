import type { CapabilityAdapter } from "../core";
import {
  createAg002GatewayReadOnlyTransport,
  createCalendarAdapter,
  createCalendarReadOnlyTransport,
  createCrmAdapter,
  createEmailAdapter,
  createEmailReadOnlyTransport,
  createSalesOpsAdapter,
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
  CALENDAR_READ?: ServiceFetcher;
  CALENDAR_READ_TOKEN?: string;
  EMAIL_READ?: ServiceFetcher;
  EMAIL_READ_TOKEN?: string;
}

type ConnectionState = "CONNECTED" | "MISSING_BINDING" | "MISSING_TOKEN";

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

function readOnlyService(
  service: ServiceFetcher,
  token: string
): ReadOnlyServiceOptions {
  return { service, token };
}

export function buildReadOnlyRuntime(
  env: ReadOnlyRuntimeEnv
): ReadOnlyRuntimeBootstrap {
  const adapters: CapabilityAdapter[] = [];
  const salesToken = nonBlank(env.SALES_OPS_TOKEN);
  const runtimeToken = nonBlank(env.HERREB_RUNTIME_TOKEN);
  const calendarToken = nonBlank(env.CALENDAR_READ_TOKEN);
  const emailToken = nonBlank(env.EMAIL_READ_TOKEN);

  const diagnostics: ReadOnlyRuntimeBootstrap["diagnostics"] = {
    salesOps: connectionState(env.SALES_OPS, salesToken),
    crm: connectionState(env.AG002_GATEWAY, runtimeToken),
    calendar: connectionState(env.CALENDAR_READ, calendarToken),
    email: connectionState(env.EMAIL_READ, emailToken)
  };

  if (env.SALES_OPS && salesToken) {
    adapters.push(
      projectReadOnlyAdapter(
        createSalesOpsAdapter({ service: env.SALES_OPS, token: salesToken }),
        ["offering.read", "offering.recommend"]
      )
    );
  }

  if (env.AG002_GATEWAY && runtimeToken) {
    const crmTransport = createAg002GatewayReadOnlyTransport({
      service: env.AG002_GATEWAY,
      runtimeToken
    });
    adapters.push(
      projectReadOnlyAdapter(createCrmAdapter(crmTransport), ["crm.read"])
    );
  }

  if (env.CALENDAR_READ && calendarToken) {
    adapters.push(
      projectReadOnlyAdapter(
        createCalendarAdapter(
          createCalendarReadOnlyTransport(
            readOnlyService(env.CALENDAR_READ, calendarToken)
          )
        ),
        ["calendar.read"]
      )
    );
  }

  if (env.EMAIL_READ && emailToken) {
    adapters.push(
      projectReadOnlyAdapter(
        createEmailAdapter(
          createEmailReadOnlyTransport(
            readOnlyService(env.EMAIL_READ, emailToken)
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
