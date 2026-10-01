import type { CapabilityResult } from "../core";
import type { CrmTransport } from "./crm";
import type { ServiceFetcher } from "./sales-ops";

export interface Ag002GatewayTransportOptions {
  service: ServiceFetcher;
  runtimeToken: string;
  /** Pin each binding to the tenant it owns. */
  tenantId: string;
  baseUrl?: string;
}

function asQueryValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function tenantMismatch(options: Ag002GatewayTransportOptions, tenantId: string) {
  const scopedTenantId = options.tenantId.trim();
  return !scopedTenantId || tenantId !== scopedTenantId;
}

function safeGatewayDiagnostic(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }));
}

export function createAg002GatewayReadOnlyTransport(options: Ag002GatewayTransportOptions): CrmTransport {
  const baseUrl = options.baseUrl ?? "https://internal";
  return {
    async execute(input): Promise<CapabilityResult> {
      const baseEvidence = { tenantId: input.tenantId, correlationId: input.correlationId, operation: input.operation, entity: input.entity, transport: "AG002_GATEWAY" };
      if (tenantMismatch(options, input.tenantId)) return { ok: false, error: { code: "AG002_TENANT_SCOPE_MISMATCH", message: "AG-002 binding is not authorized for this tenant" }, evidence: { ...baseEvidence, executed: false } };
      if (input.operation !== "read") return { ok: false, error: { code: "AG002_READ_ONLY", message: "AG-002 read transport accepts reads only" }, evidence: { ...baseEvidence, executed: false } };

      const url = new URL("/api/agent", baseUrl);
      url.searchParams.set("entity", input.entity);
      for (const [key, value] of Object.entries(input.payload ?? {})) {
        const queryValue = asQueryValue(value);
        if (queryValue !== undefined) url.searchParams.set(key, queryValue);
      }
      try {
        safeGatewayDiagnostic("AG002_READ_REQUEST", {
          ...baseEvidence,
          runtimeTokenConfigured: Boolean(options.runtimeToken?.trim()),
          runtimeTokenLength: options.runtimeToken?.trim().length ?? 0,
          scopedTenantId: options.tenantId,
          queryKeys: [...url.searchParams.keys()]
        });
        const response = await options.service.fetch(url.toString(), { method: "GET", headers: { "X-HerreB-Runtime-Token": options.runtimeToken, "X-Tenant-ID": input.tenantId, "X-Correlation-ID": input.correlationId, accept: "application/json" } });
        const text = await response.text(); let body: unknown = text; try { body = text ? JSON.parse(text) : null; } catch {}
        safeGatewayDiagnostic("AG002_READ_RESPONSE", {
          ...baseEvidence,
          upstreamStatus: response.status,
          upstreamOk: response.ok,
          responseContentType: response.headers.get("content-type") ?? undefined,
          upstreamErrorCode: body && typeof body === "object" && "error" in body
            ? typeof (body as Record<string, unknown>).error === "string"
              ? (body as Record<string, unknown>).error
              : ((body as Record<string, unknown>).error as Record<string, unknown> | undefined)?.code
            : undefined
        });
        if (!response.ok) return { ok: false, error: { code: "AG002_UPSTREAM_ERROR", message: `AG-002 gateway returned HTTP ${response.status}`, retryable: response.status >= 500 }, evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status } };
        return { ok: true, output: body, evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status } };
      } catch (error) {
        safeGatewayDiagnostic("AG002_READ_TRANSPORT_ERROR", { ...baseEvidence, message: error instanceof Error ? error.message : "AG-002 transport failed" });
        return { ok: false, error: { code: "AG002_TRANSPORT_ERROR", message: error instanceof Error ? error.message : "AG-002 transport failed", retryable: true }, evidence: { ...baseEvidence, executed: false } };
      }
    }
  };
}

/** Controlled CRM mutations through the same tenant-scoped AG-002 gateway. */
export function createAg002GatewayControlledWriteTransport(options: Ag002GatewayTransportOptions): CrmTransport {
  const baseUrl = options.baseUrl ?? "https://internal";
  return {
    async execute(input): Promise<CapabilityResult> {
      const baseEvidence = { tenantId: input.tenantId, correlationId: input.correlationId, operation: input.operation, entity: input.entity, transport: "AG002_GATEWAY_CONTROLLED_WRITE" };
      if (tenantMismatch(options, input.tenantId)) return { ok: false, error: { code: "AG002_TENANT_SCOPE_MISMATCH", message: "AG-002 binding is not authorized for this tenant" }, evidence: { ...baseEvidence, executed: false } };
      if (input.operation === "read") return { ok: false, error: { code: "AG002_WRITE_ONLY", message: "AG-002 controlled-write transport accepts mutations only" }, evidence: { ...baseEvidence, executed: false } };
      if (!input.idempotencyKey?.trim()) return { ok: false, error: { code: "CONTROLLED_WRITE_IDEMPOTENCY_REQUIRED", message: "Controlled write requires an idempotency key" }, evidence: { ...baseEvidence, executed: false } };

      const url = new URL("/api/agent", baseUrl);
      try {
        const response = await options.service.fetch(url.toString(), {
          method: "POST",
          headers: {
            "X-HerreB-Runtime-Token": options.runtimeToken,
            "X-Tenant-ID": input.tenantId,
            "X-Correlation-ID": input.correlationId,
            "Idempotency-Key": input.idempotencyKey,
            "content-type": "application/json",
            accept: "application/json"
          },
          body: JSON.stringify({ operation: input.operation, entity: input.entity, payload: input.payload ?? {} })
        });
        const text = await response.text(); let body: unknown = text; try { body = text ? JSON.parse(text) : null; } catch {}
        if (!response.ok) return { ok: false, error: { code: "AG002_CONTROLLED_WRITE_UPSTREAM_ERROR", message: `AG-002 gateway returned HTTP ${response.status}`, retryable: response.status >= 500 }, evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status } };
        return { ok: true, output: body, evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status } };
      } catch (error) {
        return { ok: false, error: { code: "AG002_CONTROLLED_WRITE_TRANSPORT_ERROR", message: error instanceof Error ? error.message : "AG-002 controlled write failed", retryable: true }, evidence: { ...baseEvidence, executed: false } };
      }
    }
  };
}
