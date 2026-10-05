import { createAg002GatewayControlledWriteTransport, createAg002GatewayReadOnlyTransport } from "../adapters/ag002-gateway";
import { createCrmCalendarControlledWriteTransport } from "../adapters/crm-calendar-write";
import type { ServiceFetcher } from "../adapters/sales-ops";

export interface CalendarCertificationEnv {
  AG002_GATEWAY?: ServiceFetcher;
  RUNTIME_GATEWAY_TOKEN?: string;
  HERREB_RUNTIME_TOKEN?: string;
  AG002_TENANT_ID?: string;
}

function recordFrom(output: unknown): Record<string, unknown> | undefined {
  if (!output || typeof output !== "object") return undefined;
  const body = output as Record<string, unknown>;
  if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) return body.data as Record<string, unknown>;
  return body;
}

export async function runEMP002CalendarProductionCertification(
  env: CalendarCertificationEnv,
  input: { tenantId: string; correlationId: string; idempotencyKey: string; startsAt: string; endsAt: string }
) {
  const token = env.RUNTIME_GATEWAY_TOKEN?.trim() || env.HERREB_RUNTIME_TOKEN?.trim();
  if (!env.AG002_GATEWAY || !token || !env.AG002_TENANT_ID) throw new Error("EMP002_CALENDAR_CERT_BINDING_MISSING");
  if (input.tenantId !== env.AG002_TENANT_ID) throw new Error("EMP002_CALENDAR_CERT_TENANT_REJECTED");

  const options = { service: env.AG002_GATEWAY, runtimeToken: token, tenantId: input.tenantId };
  const writeCrm = createAg002GatewayControlledWriteTransport(options);
  const readCrm = createAg002GatewayReadOnlyTransport(options);
  const calendar = createCrmCalendarControlledWriteTransport(writeCrm);

  const created = await calendar.execute({
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    request: {
      operation: "create",
      title: "[TEMP] EMP-002 production certification",
      startTime: input.startsAt,
      endTime: input.endsAt,
      timezone: "America/Asuncion",
      attendees: [],
      description: "Temporary automated certification record. Safe to delete."
    }
  });
  if (!created.ok) return { ok: false, stage: "create", created };

  const createdRecord = recordFrom(created.output);
  const id = String(createdRecord?.id ?? "");
  if (!id) return { ok: false, stage: "create-id", created };

  const readBack = await readCrm.execute({
    tenantId: input.tenantId,
    operation: "read",
    entity: "tasks",
    payload: { id },
    correlationId: input.correlationId + ":readback"
  });

  const readBody = readBack.output as { data?: Array<Record<string, unknown>> } | undefined;
  const record = readBody?.data?.[0];
  const persistenceConfirmed = record?.persistenceConfirmed === true || createdRecord?.persistenceConfirmed === true;
  const calendarEventId = String(record?.calendarEventId ?? createdRecord?.calendarEventId ?? "");
  const calendarSyncStatus = String(record?.calendarSyncStatus ?? createdRecord?.calendarSyncStatus ?? "");
  const verified = Boolean(readBack.ok && record && persistenceConfirmed && calendarEventId && calendarSyncStatus === "SYNCED");

  const cleanup = await calendar.execute({
    tenantId: input.tenantId,
    correlationId: input.correlationId + ":cleanup",
    idempotencyKey: input.idempotencyKey + ":cleanup",
    request: { operation: "delete", eventId: id }
  });

  return {
    ok: verified && cleanup.ok,
    verified,
    id,
    createStatus: created.evidence?.upstreamStatus,
    readBackStatus: readBack.evidence?.upstreamStatus,
    persistenceConfirmed,
    calendarEventId,
    calendarSyncStatus,
    cleanupOk: cleanup.ok,
    cleanupStatus: cleanup.evidence?.upstreamStatus
  };
}
