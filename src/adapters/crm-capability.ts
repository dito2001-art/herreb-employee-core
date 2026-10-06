import type { CapabilityResult } from "../core";
import type { CrmTransport } from "./crm";
import type { ServiceFetcher } from "./sales-ops";

export interface CrmCapabilityTransportOptions {
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

function tenantMismatch(options: CrmCapabilityTransportOptions, tenantId: string) {
  const scopedTenantId = options.tenantId.trim();
  return !scopedTenantId || tenantId !== scopedTenantId;
}

function safeGatewayDiagnostic(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shouldAutoPaginatePendingTasks(entity: string, payload: Record<string, unknown> | undefined): boolean {
  if (entity !== "tasks" || payload?.completed !== false) return false;
  const offset = Number(payload?.offset ?? 0);
  return Number.isFinite(offset) && offset === 0;
}

export function createCrmCapabilityReadOnlyTransport(options: CrmCapabilityTransportOptions): CrmTransport {
  const baseUrl = options.baseUrl ?? "https://internal";
  return {
    async execute(input): Promise<CapabilityResult> {
      const baseEvidence = { tenantId: input.tenantId, correlationId: input.correlationId, operation: input.operation, entity: input.entity, transport: "CRM_CAPABILITY_GATEWAY" };
      if (tenantMismatch(options, input.tenantId)) return { ok: false, error: { code: "CRM_CAPABILITY_TENANT_SCOPE_MISMATCH", message: "CRM capability binding is not authorized for this tenant" }, evidence: { ...baseEvidence, executed: false } };
      if (input.operation !== "read") return { ok: false, error: { code: "CRM_CAPABILITY_READ_ONLY", message: "CRM capability read transport accepts reads only" }, evidence: { ...baseEvidence, executed: false } };

      const autoPaginate = shouldAutoPaginatePendingTasks(input.entity, input.payload);
      const pageSize = autoPaginate ? 100 : undefined;
      const maxPages = 100;
      let offset = autoPaginate ? 0 : undefined;
      let pageCount = 0;
      const accumulated: unknown[] = [];
      let finalBody: unknown;
      let finalStatus = 200;

      try {
        while (true) {
          const url = new URL("/api/agent", baseUrl);
          url.searchParams.set("entity", input.entity);
          for (const [key, value] of Object.entries(input.payload ?? {})) {
            if (autoPaginate && (key === "limit" || key === "offset")) continue;
            const queryValue = asQueryValue(value);
            if (queryValue !== undefined) url.searchParams.set(key, queryValue);
          }
          if (autoPaginate) {
            url.searchParams.set("limit", String(pageSize));
            url.searchParams.set("offset", String(offset));
          }

          safeGatewayDiagnostic("CRM_CAPABILITY_READ_REQUEST", {
            ...baseEvidence,
            runtimeTokenConfigured: Boolean(options.runtimeToken?.trim()),
            runtimeTokenLength: options.runtimeToken?.trim().length ?? 0,
            scopedTenantId: options.tenantId,
            queryKeys: [...url.searchParams.keys()],
            autoPaginate,
            page: pageCount + 1,
            offset
          });

          const response = await options.service.fetch(url.toString(), { method: "GET", headers: { "X-HerreB-Agent-Key": options.runtimeToken, "X-HerreB-Agent-Name": "EMP-002", "X-Tenant-ID": input.tenantId, "X-Correlation-ID": input.correlationId, accept: "application/json" } });
          finalStatus = response.status;
          const text = await response.text();
          let body: unknown = text;
          try { body = text ? JSON.parse(text) : null; } catch {}
          pageCount += 1;

          safeGatewayDiagnostic("CRM_CAPABILITY_READ_RESPONSE", {
            ...baseEvidence,
            upstreamStatus: response.status,
            upstreamOk: response.ok,
            responseContentType: response.headers.get("content-type") ?? undefined,
            upstreamErrorCode: body && typeof body === "object" && "error" in body
              ? typeof (body as Record<string, unknown>).error === "string"
                ? (body as Record<string, unknown>).error
                : ((body as Record<string, unknown>).error as Record<string, unknown> | undefined)?.code
              : undefined,
            autoPaginate,
            page: pageCount,
            offset
          });

          if (!response.ok) return { ok: false, error: { code: "CRM_CAPABILITY_UPSTREAM_ERROR", message: `CRM capability gateway returned HTTP ${response.status}`, retryable: response.status >= 500 }, evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status, pageCount } };
          // The direct multi-tenant CRM read route currently returns entity
          // collections by name (for example { tasks: [...] }) rather than the
          // legacy gateway shape { data: [...] }. Normalize at the capability
          // boundary so EMP-002 remains independent of the CRM wire shape.
          if (isRecord(body) && !Array.isArray(body.data) && Array.isArray(body[input.entity])) {
            body = { ...body, data: body[input.entity] };
          }
          finalBody = body;
          if (!autoPaginate) break;
          if (!isRecord(body) || !Array.isArray(body.data)) break;

          accumulated.push(...body.data);
          const pagination = isRecord(body.pagination) ? body.pagination : undefined;
          const hasMore = pagination?.hasMore === true;
          if (!hasMore) break;
          if (pageCount >= maxPages) return { ok: false, error: { code: "CRM_CAPABILITY_PAGINATION_LIMIT", message: `CRM capability stopped after ${maxPages} CRM pages`, retryable: false }, evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status, pageCount, recordsRead: accumulated.length } };

          const nextOffset = Number(pagination?.nextOffset);
          if (!Number.isFinite(nextOffset) || nextOffset <= (offset ?? -1)) return { ok: false, error: { code: "CRM_CAPABILITY_INVALID_PAGINATION", message: "CRM pagination did not provide a valid forward nextOffset", retryable: false }, evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status, pageCount, recordsRead: accumulated.length } };
          offset = nextOffset;
        }

        if (autoPaginate && isRecord(finalBody)) {
          const originalPagination = isRecord(finalBody.pagination) ? finalBody.pagination : {};
          finalBody = {
            ...finalBody,
            data: accumulated,
            pagination: {
              ...originalPagination,
              limit: accumulated.length,
              offset: 0,
              returned: accumulated.length,
              total: accumulated.length,
              hasMore: false,
              nextOffset: null
            },
            aggregation: { autoPaginated: true, pageCount, recordsRead: accumulated.length }
          };
        }

        return { ok: true, output: finalBody, evidence: { ...baseEvidence, executed: true, upstreamStatus: finalStatus, autoPaginated: autoPaginate, pageCount, recordsRead: autoPaginate ? accumulated.length : undefined } };
      } catch (error) {
        safeGatewayDiagnostic("CRM_CAPABILITY_READ_TRANSPORT_ERROR", { ...baseEvidence, message: error instanceof Error ? error.message : "CRM capability transport failed" });
        return { ok: false, error: { code: "CRM_CAPABILITY_TRANSPORT_ERROR", message: error instanceof Error ? error.message : "CRM capability transport failed", retryable: true }, evidence: { ...baseEvidence, executed: false, pageCount } };
      }
    }
  };
}

/** Controlled CRM mutations through the same tenant-scoped CRM capability gateway. */
export function createCrmCapabilityControlledWriteTransport(options: CrmCapabilityTransportOptions): CrmTransport {
  const baseUrl = options.baseUrl ?? "https://internal";
  return {
    async execute(input): Promise<CapabilityResult> {
      const baseEvidence = { tenantId: input.tenantId, correlationId: input.correlationId, operation: input.operation, entity: input.entity, transport: "CRM_CAPABILITY_GATEWAY_CONTROLLED_WRITE" };
      if (tenantMismatch(options, input.tenantId)) return { ok: false, error: { code: "CRM_CAPABILITY_TENANT_SCOPE_MISMATCH", message: "CRM capability binding is not authorized for this tenant" }, evidence: { ...baseEvidence, executed: false } };
      if (input.operation === "read") return { ok: false, error: { code: "CRM_CAPABILITY_WRITE_ONLY", message: "CRM capability controlled-write transport accepts mutations only" }, evidence: { ...baseEvidence, executed: false } };
      if (!input.idempotencyKey?.trim()) return { ok: false, error: { code: "CONTROLLED_WRITE_IDEMPOTENCY_REQUIRED", message: "Controlled write requires an idempotency key" }, evidence: { ...baseEvidence, executed: false } };

      const url = new URL("/api/agent", baseUrl);
      try {
        const response = await options.service.fetch(url.toString(), {
          method: "POST",
          headers: {
            "X-HerreB-Agent-Key": options.runtimeToken,
            "X-HerreB-Agent-Name": "EMP-002",
            "X-Tenant-ID": input.tenantId,
            "X-Correlation-ID": input.correlationId,
            "Idempotency-Key": input.idempotencyKey,
            "content-type": "application/json",
            accept: "application/json"
          },
          body: JSON.stringify({
            operation: input.operation,
            entity: input.entity,
            ...(input.operation === "create"
              ? { data: input.payload ?? {} }
              : {
                  id: Number((input.payload as Record<string, unknown> | undefined)?.id),
                  ...(input.operation === "update"
                    ? { data: Object.fromEntries(Object.entries(input.payload ?? {}).filter(([key]) => key !== "id")) }
                    : {})
                }),
            audit: {
              authorizationMode: "AUTHORIZED",
              authorizedBy: `EMP-002:${input.tenantId}:owner`,
              reason: "Authorized EMP-002 controlled write via Workforce Runtime"
            },
            idempotencyKey: input.idempotencyKey
          })
        });
        const text = await response.text(); let body: unknown = text; try { body = text ? JSON.parse(text) : null; } catch {}
        const upstreamErrorCode = isRecord(body)
          ? typeof body.error === "string"
            ? body.error
            : isRecord(body.error) && typeof body.error.code === "string"
              ? body.error.code
              : undefined
          : undefined;
        safeGatewayDiagnostic("CRM_CAPABILITY_CONTROLLED_WRITE_RESPONSE", {
          ...baseEvidence,
          upstreamStatus: response.status,
          upstreamOk: response.ok,
          responseContentType: response.headers.get("content-type") ?? undefined,
          upstreamErrorCode,
          persistenceConfirmed: isRecord(body) && body.persistenceConfirmed === true,
          auditLogPresent: isRecord(body) && (typeof body.auditLogId === "string" || typeof body.auditLogId === "number")
        });
        if (!response.ok) return { ok: false, error: { code: "CRM_CAPABILITY_CONTROLLED_WRITE_UPSTREAM_ERROR", message: `CRM capability gateway returned HTTP ${response.status}`, retryable: response.status >= 500 }, evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status, upstreamErrorCode } };
        return { ok: true, output: body, evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status } };
      } catch (error) {
        return { ok: false, error: { code: "CRM_CAPABILITY_CONTROLLED_WRITE_TRANSPORT_ERROR", message: error instanceof Error ? error.message : "CRM capability controlled write failed", retryable: true }, evidence: { ...baseEvidence, executed: false } };
      }
    }
  };
}
