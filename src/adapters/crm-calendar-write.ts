import type { CapabilityResult } from "../core";
import type { CalendarInput, CalendarTransport } from "./calendar";
import type { CrmTransport } from "./crm";

function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new Error("CRM_CALENDAR_IDEMPOTENCY_REQUIRED");
  return key;
}

function mutationFor(request: CalendarInput): {
  operation: "create" | "update" | "delete";
  payload: Record<string, unknown>;
} | undefined {
  if (request.operation === "create") {
    return {
      operation: "create",
      payload: {
        type: "meeting",
        title: request.title,
        startTime: request.startTime,
        endTime: request.endTime,
        timezone: request.timezone,
        attendees: request.attendees ?? [],
        description: request.description,
        location: request.location
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
