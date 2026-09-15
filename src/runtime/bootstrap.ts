import type { CapabilityAdapter } from "../core";
import {
  createAg002GatewayReadOnlyTransport,
  createCrmAdapter,
  createSalesOpsAdapter,
  projectReadOnlyAdapter,
  type ServiceFetcher
} from "../adapters";
import { assertReadOnlyAdapters } from "./read-only";

export interface ReadOnlyRuntimeEnv {
  SALES_OPS?: ServiceFetcher;
  SALES_OPS_TOKEN?: string;
  AG002_GATEWAY?: ServiceFetcher;
  HERREB_RUNTIME_TOKEN?: string;
}

export interface ReadOnlyRuntimeBootstrap {
  adapters: CapabilityAdapter[];
  connectedCapabilities: ReadonlySet<string>;
  diagnostics: {
    salesOps: "CONNECTED" | "MISSING_BINDING" | "MISSING_TOKEN";
    crm: "CONNECTED" | "MISSING_BINDING" | "MISSING_TOKEN";
  };
}

function nonBlank(value: string | undefined): string | undefined {
  const clean = value?.trim();
  return clean ? clean : undefined;
}

export function buildReadOnlyRuntime(
  env: ReadOnlyRuntimeEnv
): ReadOnlyRuntimeBootstrap {
  const adapters: CapabilityAdapter[] = [];
  const salesToken = nonBlank(env.SALES_OPS_TOKEN);
  const runtimeToken = nonBlank(env.HERREB_RUNTIME_TOKEN);

  const diagnostics: ReadOnlyRuntimeBootstrap["diagnostics"] = {
    salesOps: !env.SALES_OPS
      ? "MISSING_BINDING"
      : !salesToken
        ? "MISSING_TOKEN"
        : "CONNECTED",
    crm: !env.AG002_GATEWAY
      ? "MISSING_BINDING"
      : !runtimeToken
        ? "MISSING_TOKEN"
        : "CONNECTED"
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

  assertReadOnlyAdapters(adapters);
  return {
    adapters,
    connectedCapabilities: new Set(
      adapters.flatMap((adapter) => [...adapter.capabilities])
    ),
    diagnostics
  };
}
