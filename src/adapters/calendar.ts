import type {
  CapabilityAdapter,
  CapabilityRequest,
  CapabilityResult
} from "../core";

export type CalendarInput =
  | {
      operation: "search";
      timeMin: string;
      timeMax: string;
      query?: string;
      calendarId?: string;
    }
  | {
      operation: "availability";
      timeMin: string;
      timeMax: string;
      calendarIds: string[];
      timezone: string;
    }
  | {
      operation: "create";
      title: string;
      startTime: string;
      endTime: string;
      timezone: string;
      attendees?: string[];
      description?: string;
      location?: string;
    }
  | {
      operation: "update";
      eventId: string;
      changes: Record<string, unknown>;
    }
  | {
      operation: "delete";
      eventId: string;
    };

export interface CalendarTransport {
  execute(input: {
    tenantId: string;
    request: CalendarInput;
    idempotencyKey?: string;
    correlationId: string;
  }): Promise<CapabilityResult>;
}

export function createCalendarAdapter(
  transport: CalendarTransport
): CapabilityAdapter<CalendarInput, unknown> {
  return {
    id: "google-calendar-capability-v1",
    employees: ["EMP-002"],
    capabilities: ["calendar.read", "calendar.write"],
    async execute(request: CapabilityRequest<CalendarInput>) {
      const isRead =
        request.input.operation === "search" ||
        request.input.operation === "availability";

      if (request.capabilityId === "calendar.read" && !isRead) {
        return {
          ok: false,
          error: {
            code: "CALENDAR_OPERATION_MISMATCH",
            message: "calendar.read cannot mutate calendar data"
          }
        };
      }

      if (request.capabilityId === "calendar.write" && isRead) {
        return {
          ok: false,
          error: {
            code: "CALENDAR_OPERATION_MISMATCH",
            message: "calendar.write is reserved for mutations"
          }
        };
      }

      return transport.execute({
        tenantId: request.context.tenantId,
        request: request.input,
        idempotencyKey: request.idempotencyKey,
        correlationId: request.context.correlationId
      });
    }
  };
}
