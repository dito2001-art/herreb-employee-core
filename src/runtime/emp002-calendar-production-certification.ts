import { createCrmCapabilityControlledWriteTransport, createCrmCapabilityReadOnlyTransport } from "../adapters/crm-capability";
import { createCrmCalendarControlledWriteTransport } from "../adapters/crm-calendar-write";
import type { ServiceFetcher } from "../adapters/sales-ops";

export interface CalendarCertificationEnv {
  CRM_CAPABILITY?: ServiceFetcher;
  AG002_GATEWAY?: ServiceFetcher;
  RUNTIME_GATEWAY_TOKEN?: string;
  HERREB_RUNTIME_TOKEN?: string;
  CRM_TENANT_ID?: string;
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
  const crmCapability = env.CRM_CAPABILITY ?? env.AG002_GATEWAY;
  const crmTenantId = env.CRM_TENANT_ID?.trim() || env.AG002_TENANT_ID?.trim();
  if (!crmCapability || !token || !crmTenantId) throw new Error("EMP002_CALENDAR_CERT_BINDING_MISSING");
  if (input.tenantId !== crmTenantId) throw new Error("EMP002_CALENDAR_CERT_TENANT_REJECTED");

  const options = { service: crmCapability, runtimeToken: token, tenantId: input.tenantId };
  const writeCrm = createCrmCapabilityControlledWriteTransport(options);
  const readCrm = createCrmCapabilityReadOnlyTransport(options);
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

  const readBody = readBack.output as Record<string, unknown> | undefined;
  const readRows = Array.isArray(readBody?.data) ? readBody.data : Array.isArray(readBody?.tasks) ? readBody.tasks : [];
  const persistedRecord = readRows.find((item) => item && typeof item === "object" && String((item as Record<string, unknown>).id ?? "") === id) as Record<string, unknown> | undefined;
  const record = persistedRecord ?? recordFrom(readBack.output);
  const persistenceConfirmed = Boolean(readBack.ok && persistedRecord);
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
