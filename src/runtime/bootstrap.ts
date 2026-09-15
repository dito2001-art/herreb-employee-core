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
import type { CapabilityAdapter } from "../core";
import { assertReadOnlyAdapters } from "./read-only";

export interface EmployeeRuntimeBindings {
  salesOps?: ServiceFetcher;
  salesOpsToken?: string;
  crmRead?: ServiceFetcher;
  crmReadToken?: string;
  calendarRead?: ServiceFetcher;
  calendarReadToken?: string;
  emailRead?: ServiceFetcher;
  emailReadToken?: string;
}

function token(value?: string): string | undefined {
  const clean = value?.trim();
  return clean || undefined;
}

function readOnlyService(service: ServiceFetcher, authToken: string): ReadOnlyServiceOptions {
  return { service, token: authToken };
}

export function buildReadOnlyRuntimeAdapters(
  bindings: EmployeeRuntimeBindings
): CapabilityAdapter[] {
  const adapters: CapabilityAdapter[] = [];
  const salesOpsToken = token(bindings.salesOpsToken);
  const crmToken = token(bindings.crmReadToken);
  const calendarToken = token(bindings.calendarReadToken);
  const emailToken = token(bindings.emailReadToken);

  if (bindings.salesOps && salesOpsToken) {
    adapters.push(
      projectReadOnlyAdapter(
        createSalesOpsAdapter({ service: bindings.salesOps, token: salesOpsToken }),
        ["offering.read", "offering.recommend"]
      )
    );
  }

  if (bindings.crmRead && crmToken) {
    adapters.push(
      projectReadOnlyAdapter(
        createCrmAdapter(
          createAg002GatewayReadOnlyTransport({ service: bindings.crmRead, runtimeToken: crmToken })
        ),
        ["crm.read"]
      )
    );
  }

  if (bindings.calendarRead && calendarToken) {
    adapters.push(
      projectReadOnlyAdapter(
        createCalendarAdapter(
          createCalendarReadOnlyTransport(readOnlyService(bindings.calendarRead, calendarToken))
        ),
        ["calendar.read"]
      )
    );
  }

  if (bindings.emailRead && emailToken) {
    adapters.push(
      projectReadOnlyAdapter(
        createEmailAdapter(
          createEmailReadOnlyTransport(readOnlyService(bindings.emailRead, emailToken))
        ),
        ["email.read"]
      )
    );
  }

  assertReadOnlyAdapters(adapters);
  return adapters;
}
