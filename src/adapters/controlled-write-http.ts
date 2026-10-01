import type { CapabilityResult } from "../core";
import type { CalendarInput, CalendarTransport } from "./calendar";
import type { EmailInput, EmailTransport } from "./email";
import type { ServiceFetcher } from "./sales-ops";

export interface ControlledWriteServiceOptions {
  service: ServiceFetcher;
  token: string;
  tenantId: string;
  baseUrl?: string;
}

async function callControlledWrite(
  options: ControlledWriteServiceOptions,
  path: string,
  operation: string,
  tenantId: string,
  correlationId: string,
  idempotencyKey: string | undefined,
  payload: unknown
): Promise<CapabilityResult> {
  const baseEvidence = { tenantId, correlationId, operation, path };
  if (!tenantId || tenantId !== options.tenantId) {
    return {
      ok: false,
      error: {
        code: "CONTROLLED_WRITE_TENANT_SCOPE_MISMATCH",
        message: "Controlled-write service tenant does not match authorized tenant scope"
      },
      evidence: { ...baseEvidence, executed: false }
    };
  }
  if (!correlationId.trim()) {
    return {
      ok: false,
      error: {
        code: "CONTROLLED_WRITE_CORRELATION_ID_REQUIRED",
        message: "Controlled write requires correlation provenance"
      },
      evidence: { ...baseEvidence, executed: false }
    };
  }
  if (!idempotencyKey?.trim()) {
    return {
      ok: false,
      error: {
        code: "CONTROLLED_WRITE_IDEMPOTENCY_REQUIRED",
        message: "Controlled write requires an idempotency key"
      },
      evidence: { ...baseEvidence, executed: false }
    };
  }

  const response = await options.service.fetch(
    new URL(path, options.baseUrl ?? "https://internal").toString(),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json",
        "X-Tenant-ID": tenantId,
        "X-Correlation-ID": correlationId,
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify({ operation, payload })
    }
  );
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Preserve exact upstream output for the caller, never for audit evidence.
  }
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: "CONTROLLED_WRITE_UPSTREAM_ERROR",
        message: `Controlled-write service returned HTTP ${response.status}`,
        retryable: response.status >= 500
      },
      evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status }
    };
  }
  return {
    ok: true,
    output: body,
    evidence: { ...baseEvidence, executed: true, upstreamStatus: response.status }
  };
}

export function createCalendarControlledWriteTransport(
  options: ControlledWriteServiceOptions
): CalendarTransport {
  return {
    async execute(input) {
      const request: CalendarInput = input.request;
      if (request.operation === "search" || request.operation === "availability") {
        return {
          ok: false,
          error: { code: "CALENDAR_WRITE_ONLY", message: "Controlled calendar transport accepts mutations only" },
          evidence: { executed: false, tenantId: input.tenantId, correlationId: input.correlationId }
        };
      }
      return callControlledWrite(
        options,
        "/calendar/write",
        request.operation,
        input.tenantId,
        input.correlationId,
        input.idempotencyKey,
        request
      );
    }
  };
}

export function createEmailControlledSendTransport(
  options: ControlledWriteServiceOptions
): EmailTransport {
  return {
    async execute(input) {
      const request: EmailInput = input.request;
      if (request.operation !== "send") {
        return {
          ok: false,
          error: { code: "EMAIL_SEND_ONLY", message: "Controlled email transport accepts send only" },
          evidence: { executed: false, tenantId: input.tenantId, correlationId: input.correlationId }
        };
      }
      return callControlledWrite(
        options,
        "/email/send",
        request.operation,
        input.tenantId,
        input.correlationId,
        input.idempotencyKey,
        request
      );
    }
  };
}
