import type { CapabilityResult } from "../core";
import type { CalendarInput, CalendarTransport } from "./calendar";
import type { CrmTransport } from "./crm";

function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new Error("CRM_CALENDAR_IDEMPOTENCY_REQUIRED");
  return key;
}

function crmDateTime(value: string): { date: string; time: string } {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) throw new Error("CRM_CALENDAR_DATETIME_INVALID");
  return { date: match[1], time: match[2] };
}

function mutationFor(request: CalendarInput): {
  operation: "create" | "update" | "delete";
  payload: Record<string, unknown>;
} | undefined {
  if (request.operation === "create") {
    const start = crmDateTime(request.startTime);
    const end = crmDateTime(request.endTime);
    return {
      operation: "create",
      payload: {
        title: request.title,
        startDate: start.date,
        endDate: end.date,
        startTime: start.time,
        endTime: end.time,
        activityType: "Reunión",
        priority: "Media",
        reminderMinutes: 30,
        completed: false,
        notes: request.description ?? ""
      }
    };
  }
  if (request.operation === "update") {
    return {
      operation: "update",
      payload: { id: request.eventId, ...request.changes }
    };
  }
  if (request.operation === "delete") {
    return {
      operation: "delete",
      payload: { id: request.eventId }
    };
  }
  return undefined;
}

/**
 * Calendar write facade backed exclusively by HerreB CRM/AG-002.
 * Employee Core never writes Google Calendar directly; CRM remains the system
 * of record and owns any downstream Calendar synchronization/invitations.
 */
export function createCrmCalendarControlledWriteTransport(
  crm: CrmTransport
): CalendarTransport {
  return {
    async execute(input): Promise<CapabilityResult> {
      const mutation = mutationFor(input.request);
      if (!mutation) {
        return {
          ok: false,
          error: {
            code: "CRM_CALENDAR_WRITE_ONLY",
            message: "CRM calendar controlled-write facade accepts create, update, and delete only"
          },
          evidence: { executed: false, source: "HERREB_CRM" }
        };
      }

      let idempotencyKey: string;
      try {
        idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
      } catch {
        return {
          ok: false,
          error: {
            code: "CRM_CALENDAR_IDEMPOTENCY_REQUIRED",
            message: "Calendar controlled write requires an idempotency key"
          },
          evidence: { executed: false, source: "HERREB_CRM" }
        };
      }

      const result = await crm.execute({
        tenantId: input.tenantId,
        operation: mutation.operation,
        entity: "tasks",
        payload: mutation.payload,
        idempotencyKey,
        correlationId: input.correlationId
      });

      return {
        ...result,
        evidence: {
          ...(result.evidence ?? {}),
          source: "HERREB_CRM",
          googleAccessedByEmployeeCore: false,
          requestedOperation: input.request.operation,
          idempotencyKeyPresent: true
        }
      };
    }
  };
}
