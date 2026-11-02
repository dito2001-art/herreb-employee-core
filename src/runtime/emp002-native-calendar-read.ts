import {
  createCalendarAdapter,
  type CalendarTransport
} from "../adapters/calendar";
type Namespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};
/** A chat tool reads the same native DO as the portal; never a CRM/calendar fallback. */
export function createNativeCalendarReadTransport(
  namespace: Namespace,
  tenantId: string
): CalendarTransport {
  return {
    async execute(input) {
      if (!tenantId || input.tenantId !== tenantId)
        return {
          ok: false,
          error: {
            code: "NATIVE_CALENDAR_SCOPE_REJECTED",
            message: "Tenant scope rejected"
          }
        };
      const query = input.request;
      if (query.operation !== "search" && query.operation !== "availability")
        return {
          ok: false,
          error: {
            code: "NATIVE_CALENDAR_READ_ONLY",
            message: "Use the calendar portal to modify entries"
          }
        };
      if (
        !Number.isFinite(Date.parse(query.timeMin)) ||
        !Number.isFinite(Date.parse(query.timeMax)) ||
        Date.parse(query.timeMin) >= Date.parse(query.timeMax)
      )
        return {
          ok: false,
          error: {
            code: "NATIVE_CALENDAR_INVALID_WINDOW",
            message: "A valid time window is required"
          }
        };
      try {
        const stub = namespace.get(namespace.idFromName(`tenant:${tenantId}`));
        const response = await stub.fetch(
          new Request("https://emp002.operations/native-calendar", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-herreb-internal-tenant-id": tenantId
            },
            body: JSON.stringify({
              operation:
                query.operation === "availability" ? "availability" : "list",
              from: query.timeMin,
              to: query.timeMax
            })
          })
        );
        const body = (await response.json()) as {
          ok?: boolean;
          entries?: unknown[];
        };
        if (!response.ok || body.ok !== true || !Array.isArray(body.entries))
          throw new Error("INVALID_NATIVE_RESPONSE");
        const entries = body.entries.map((raw) => {
          const e = raw as Record<string, unknown>;
          if (
            !e ||
            typeof e !== "object" ||
            e.tenantId !== tenantId ||
            typeof e.id !== "string" ||
            typeof e.title !== "string" ||
            typeof e.startsAt !== "string" ||
            !Number.isFinite(Date.parse(e.startsAt)) ||
            e.status !== "ACTIVE" ||
            !["TASK", "MEETING", "EVENT"].includes(String(e.kind)) ||
            !Number.isSafeInteger(e.version) ||
            Number(e.version) < 1
          )
            throw new Error("INVALID_NATIVE_SCOPE");
          return {
            id: e.id,
            title: e.title,
            kind: e.kind,
            startsAt: e.startsAt,
            endsAt: e.endsAt,
            status: e.status,
            version: e.version
          };
        });
        const selected =
          query.operation === "search" && query.query
            ? entries.filter((e) =>
                e.title
                  .toLocaleLowerCase("es")
                  .includes(query.query!.toLocaleLowerCase("es"))
              )
            : entries;
        return {
          ok: true,
          output:
            query.operation === "availability"
              ? { available: entries.length === 0, busy: entries }
              : { entries: selected },
          evidence: {
            executed: true,
            tenantId,
            correlationId: input.correlationId,
            calendarSource: "WORKFORCE_NATIVE"
          }
        };
      } catch {
        return {
          ok: false,
          error: {
            code: "NATIVE_CALENDAR_READ_FAILED",
            message: "Native calendar could not be verified"
          }
        };
      }
    }
  };
}
export function createNativeCalendarReadAdapter(
  namespace: Namespace,
  tenantId: string
) {
  return {
    ...createCalendarAdapter(
      createNativeCalendarReadTransport(namespace, tenantId)
    ),
    id: "workforce-native-calendar-read-v1",
    capabilities: ["calendar.read" as const]
  };
}
