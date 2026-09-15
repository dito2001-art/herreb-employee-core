import type { CapabilityResult } from "../core";
import type { CalendarInput, CalendarTransport } from "./calendar";
import type { EmailInput, EmailTransport } from "./email";
import type { ServiceFetcher } from "./sales-ops";

export interface ReadOnlyServiceOptions {
  service: ServiceFetcher;
  token: string;
  baseUrl?: string;
}

async function callReadOnlyService(
  options: ReadOnlyServiceOptions,
  path: string,
  tenantId: string,
  correlationId: string,
  params: Record<string, string | number | boolean | string[] | undefined>
): Promise<CapabilityResult> {
  const url = new URL(path, options.baseUrl ?? "https://internal");
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const response = await options.service.fetch(url.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${options.token}`,
        "X-Tenant-ID": tenantId,
        "X-Correlation-ID": correlationId,
        accept: "application/json"
      }
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Preserve exact upstream response when it is not JSON.
    }

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: "READ_ONLY_SERVICE_UPSTREAM_ERROR",
          message: `Read-only service returned HTTP ${response.status}`,
          retryable: response.status >= 500
        },
        evidence: { executed: true, upstreamStatus: response.status, upstream: body }
      };
    }

    return {
      ok: true,
      output: body,
      evidence: { executed: true, upstreamStatus: response.status }
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "READ_ONLY_SERVICE_TRANSPORT_ERROR",
        message: error instanceof Error ? error.message : "Read-only service failed",
        retryable: true
      },
      evidence: { executed: false }
    };
  }
}

export function createCalendarReadOnlyTransport(options: ReadOnlyServiceOptions): CalendarTransport {
  return {
    async execute(input) {
      const request: CalendarInput = input.request;
      if (request.operation !== "search" && request.operation !== "availability") {
        return {
          ok: false,
          error: { code: "CALENDAR_READ_ONLY", message: "Calendar transport is READ_ONLY" },
          evidence: { executed: false }
        };
      }
      return callReadOnlyService(options, "/calendar/read", input.tenantId, input.correlationId, {
        operation: request.operation,
        timeMin: request.timeMin,
        timeMax: request.timeMax,
        query: request.operation === "search" ? request.query : undefined,
        calendarId: request.operation === "search" ? request.calendarId : undefined,
        calendarIds: request.operation === "availability" ? request.calendarIds : undefined,
        timezone: request.operation === "availability" ? request.timezone : undefined
      });
    }
  };
}

export function createEmailReadOnlyTransport(options: ReadOnlyServiceOptions): EmailTransport {
  return {
    async execute(input) {
      const request: EmailInput = input.request;
      if (request.operation === "send") {
        return {
          ok: false,
          error: { code: "EMAIL_READ_ONLY", message: "Email transport is READ_ONLY" },
          evidence: { executed: false }
        };
      }
      return callReadOnlyService(options, "/email/read", input.tenantId, input.correlationId,
        request.operation === "search"
          ? { operation: "search", query: request.query, maxResults: request.maxResults }
          : { operation: "read", messageId: request.messageId }
      );
    }
  };
}
