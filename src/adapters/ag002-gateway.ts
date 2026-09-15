import type { CapabilityResult } from "../core";
import type { CrmTransport } from "./crm";
import type { ServiceFetcher } from "./sales-ops";

export interface Ag002GatewayTransportOptions {
  service: ServiceFetcher;
  runtimeToken: string;
  /**
   * AG-002/CRM v110 is a single-tenant service. Pin each binding to the
   * tenant it owns so a caller cannot cross tenant boundaries merely by
   * changing X-Tenant-ID.
   */
  tenantId: string;
  baseUrl?: string;
}

function asQueryValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return undefined;
}

export function createAg002GatewayReadOnlyTransport(
  options: Ag002GatewayTransportOptions
): CrmTransport {
  const baseUrl = options.baseUrl ?? "https://internal";
  const scopedTenantId = options.tenantId.trim();

  return {
    async execute(input): Promise<CapabilityResult> {
      if (!scopedTenantId || input.tenantId !== scopedTenantId) {
        return {
          ok: false,
          error: {
            code: "AG002_TENANT_SCOPE_MISMATCH",
            message: "AG-002 binding is not authorized for this tenant"
          },
          evidence: { executed: false }
        };
      }

      if (input.operation !== "read") {
        return {
          ok: false,
          error: {
            code: "AG002_READ_ONLY",
            message: "AG-002 transport is READ_ONLY in Employee Core"
          },
          evidence: { executed: false }
        };
      }

      const url = new URL("/api/agent", baseUrl);
      url.searchParams.set("entity", input.entity);
      for (const [key, value] of Object.entries(input.payload ?? {})) {
        const queryValue = asQueryValue(value);
        if (queryValue !== undefined) url.searchParams.set(key, queryValue);
      }

      try {
        const response = await options.service.fetch(url.toString(), {
          method: "GET",
          headers: {
            "X-HerreB-Runtime-Token": options.runtimeToken,
            "X-Tenant-ID": input.tenantId,
            "X-Correlation-ID": input.correlationId,
            accept: "application/json"
          }
        });
        const text = await response.text();
        let body: unknown = text;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          // Preserve non-JSON upstream evidence without inventing a shape.
        }

        if (!response.ok) {
          return {
            ok: false,
            error: {
              code: "AG002_UPSTREAM_ERROR",
              message: `AG-002 gateway returned HTTP ${response.status}`,
              retryable: response.status >= 500
            },
            evidence: {
              executed: true,
              upstreamStatus: response.status,
              upstream: body
            }
          };
        }

        return {
          ok: true,
          output: body,
          evidence: {
            executed: true,
            upstreamStatus: response.status,
            transport: "AG002_GATEWAY"
          }
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "AG002_TRANSPORT_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "AG-002 transport failed",
            retryable: true
          },
          evidence: { executed: false }
        };
      }
    }
  };
}
