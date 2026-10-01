import type { CapabilityResult } from "../core";
import type { CalendarInput, CalendarTransport } from "./calendar";
import type { CrmTransport } from "./crm";

function dateOnly(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) throw new Error(`Invalid calendar boundary: ${value}`);
  return match[1];
}

/**
 * Calendar facade backed exclusively by HerreB CRM data.
 * Google Calendar remains an implementation detail of the CRM and is never
 * contacted by Employee Core.
 */
export function createCrmCalendarReadTransport(
  crm: CrmTransport
): CalendarTransport {
  return {
    async execute(input): Promise<CapabilityResult> {
      const request: CalendarInput = input.request;
      if (request.operation !== "search" && request.operation !== "availability") {
        return {
          ok: false,
          error: {
            code: "CRM_CALENDAR_READ_ONLY",
            message: "CRM calendar facade is read-only"
          },
          evidence: { executed: false, source: "CRM" }
        };
      }

      try {
        const from = dateOnly(request.timeMin);
        const to = dateOnly(request.timeMax);
        const result = await crm.execute({
          tenantId: input.tenantId,
          operation: "read",
          entity: "tasks",
          payload: {
            from,
            to,
            limit: 100,
            offset: 0
          },
          correlationId: input.correlationId
        });

        return {
          ...result,
          evidence: {
            ...(result.evidence ?? {}),
            source: "HERREB_CRM",
            googleAccessedByEmployeeCore: false,
            requestedOperation: request.operation,
            from,
            to
          }
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "CRM_CALENDAR_QUERY_INVALID",
            message: error instanceof Error ? error.message : "Invalid CRM calendar query",
            retryable: false
          },
          evidence: {
            executed: false,
            source: "HERREB_CRM",
            googleAccessedByEmployeeCore: false
          }
        };
      }
    }
  };
}
