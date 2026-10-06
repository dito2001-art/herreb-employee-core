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
  if (body.record && typeof body.record === "object" && !Array.isArray(body.record)) return body.record as Record<string, unknown>;
  if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) return body.data as Record<string, unknown>;
  if (Array.isArray(body.data) && body.data[0] && typeof body.data[0] === "object") return body.data[0] as Record<string, unknown>;
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
      title: "[TEMP] EMP-002 CRM agenda certification",
      startTime: input.startsAt,
      endTime: input.endsAt,
      timezone: "America/Asuncion",
      attendees: [],
      description: "Temporary automated CRM certification record. Safe to delete."
    }
  });
  if (!created.ok) return { ok: false, stage: "create", created };

  const createdBody = created.output as Record<string, unknown> | undefined;
  const createdRecord = recordFrom(created.output);
  const id = String(createdBody?.id ?? createdRecord?.id ?? "");
  if (!id) return { ok: false, stage: "create-id", created };

  const readBack = await readCrm.execute({
    tenantId: input.tenantId, operation: "read", entity: "tasks", payload: { id },
    correlationId: input.correlationId + ":readback"
  });

  const record = recordFrom(readBack.output);
  const persistenceConfirmed = createdBody?.persistenceConfirmed === true || record?.persistenceConfirmed === true || createdRecord?.persistenceConfirmed === true;
  const verified = Boolean(readBack.ok && record && persistenceConfirmed);

  const cleanup = await calendar.execute({
    tenantId: input.tenantId,
    correlationId: input.correlationId + ":cleanup",
    idempotencyKey: input.idempotencyKey + ":cleanup",
    request: { operation: "delete", eventId: id }
  });

  return {
    ok: verified && cleanup.ok, verified, id,
    createStatus: created.evidence?.upstreamStatus,
    readBackStatus: readBack.evidence?.upstreamStatus,
    persistenceConfirmed,
    externalCalendarRequired: false,
    cleanupOk: cleanup.ok,
    cleanupStatus: cleanup.evidence?.upstreamStatus
  };
}
