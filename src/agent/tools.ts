import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getCapability, type EmployeeManifest } from "../core";
import type { EmployeeRuntimeSession } from "../runtime";

const genericInputSchema = z
  .object({
    input: z.record(z.string(), z.unknown()).optional(),
    idempotencyKey: z.string().min(1).optional()
  })
  .catchall(z.unknown());

const TOOL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

function logCapability(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }));
}

const CRM_ENTITY_ALIASES: Record<string, string> = {
  task: "tasks", tarea: "tasks", tareas: "tasks",
  company: "companies", empresa: "companies", empresas: "companies",
  contact: "contacts", contacto: "contacts", contactos: "contacts",
  opportunity: "opportunities", oportunidad: "opportunities", oportunidades: "opportunities",
  project: "projects", proyecto: "projects", proyectos: "projects",
  clientinteraction: "clientInteractions", clientinteractions: "clientInteractions",
  marketingcampaign: "marketingCampaigns", marketingcampaigns: "marketingCampaigns",
  invoice: "invoices", invoices: "invoices", factura: "invoices", facturas: "invoices",
  billingmilestone: "billingMilestones", billingmilestones: "billingMilestones"
};

function normalizeCrmEntity(normalized: Record<string, unknown>) {
  if (typeof normalized.entity !== "string") return;
  const key = normalized.entity.trim().toLowerCase().replace(/[\s_-]/g, "");
  normalized.entity = CRM_ENTITY_ALIASES[key] ?? normalized.entity.trim();
}

function normalizeCapabilityInput(capabilityId: string, args: Record<string, unknown>) {
  const { input, idempotencyKey: _idempotencyKey, ...directInput } = args;
  const normalized = input && typeof input === "object" && !Array.isArray(input)
    ? { ...(input as Record<string, unknown>) }
    : { ...directInput };

  if (capabilityId === "calendar.read") {
    if (normalized.operation === "read") normalized.operation = "search";
    if (typeof normalized.timeMin !== "string" && typeof normalized.startsAfter === "string") normalized.timeMin = normalized.startsAfter;
    if (typeof normalized.timeMax !== "string" && typeof normalized.startsBefore === "string") normalized.timeMax = normalized.startsBefore;
    delete normalized.startsAfter;
    delete normalized.startsBefore;
  }

  if (capabilityId === "crm.read" || capabilityId === "crm.write") {
    normalizeCrmEntity(normalized);
  }

  if (capabilityId === "crm.read") {
    // crm.read has exactly one legal adapter operation. Do not let model wording
    // (search/list/filter/get/etc.) leak into the stable CRM adapter contract.
    normalized.operation = "read";

    // The CRM adapter expects filters/query controls in payload. Models may emit
    // them beside operation/entity, so canonicalize them here before execution.
    const reserved = new Set(["operation", "entity", "payload"]);
    const payload = normalized.payload && typeof normalized.payload === "object" && !Array.isArray(normalized.payload)
      ? { ...(normalized.payload as Record<string, unknown>) }
      : {};
    for (const [key, value] of Object.entries(normalized)) {
      if (!reserved.has(key)) {
        payload[key] = value;
        delete normalized[key];
      }
    }
    normalized.payload = payload;
  }

  if (capabilityId === "crm.write") {
    // Models sometimes put business fields beside operation/entity. Move those
    // fields into payload, which is the stable CrmCapabilityInput contract.
    const reserved = new Set(["operation", "entity", "payload"]);
    const payload = normalized.payload && typeof normalized.payload === "object" && !Array.isArray(normalized.payload)
      ? { ...(normalized.payload as Record<string, unknown>) }
      : {};
    for (const [key, value] of Object.entries(normalized)) {
      if (!reserved.has(key)) {
        payload[key] = value;
        delete normalized[key];
      }
    }
    normalized.payload = payload;
  }

  return normalized;
}

function generatedIdempotencyKey(capabilityId: string, correlationId: string): string | undefined {
  if (!capabilityId.endsWith(".write") && capabilityId !== "email.send") return undefined;
  return `${capabilityId}:${correlationId}`;
}

export function capabilityIdToToolName(capabilityId: string): string {
  const normalized = capabilityId.replace(/[^A-Za-z0-9_-]/g, "_");
  const prefixed = /^[A-Za-z_]/.test(normalized) ? normalized : `cap_${normalized}`;
  const name = prefixed.slice(0, 64);
  if (!TOOL_NAME_PATTERN.test(name)) throw new Error(`INVALID_TOOL_NAME:${capabilityId}`);
  return name;
}

export function toolNameToCapabilityId(manifest: EmployeeManifest, toolName: string): string | undefined {
  return manifest.capabilities.find((capabilityId) => capabilityIdToToolName(capabilityId) === toolName);
}

export function buildEmployeeTools(session: EmployeeRuntimeSession, executableCapabilities: ReadonlySet<string> = new Set()): ToolSet {
  const tools: ToolSet = {};
  const names = new Set<string>();
  const failedCapabilities = new Map<string, unknown>();

  for (const capabilityId of session.manifest.capabilities) {
    const definition = getCapability(capabilityId);
    if (!definition) continue;
    const toolName = capabilityIdToToolName(capabilityId);
    if (names.has(toolName)) throw new Error(`TOOL_NAME_COLLISION:${toolName}`);
    names.add(toolName);

    const guidance = capabilityId === "calendar.read"
      ? " For calendar.read use operation=search with timeMin and timeMax. Never use startsAfter/startsBefore or a mutation operation."
      : capabilityId === "crm.read"
        ? " For crm.read ALWAYS provide entity. The runtime canonicalizes the adapter operation to read. Entity must be one of tasks, companies, contacts, opportunities, projects, clientInteractions, marketingCampaigns, invoices, billingMilestones. For task requests use entity=tasks. For pending-task requests use entity=tasks with completed=false; filters and pagination are canonicalized into the CRM payload. Never call crm.write to compensate for a failed crm.read."
        : capabilityId === "crm.write"
          ? " For crm.write use operation=create|update|delete, entity must be one of tasks, companies, contacts, opportunities, projects, clientInteractions, marketingCampaigns, invoices, billingMilestones, and put ALL business fields inside payload. For a CRM task use entity=tasks (never task/tarea), e.g. {operation:'create',entity:'tasks',payload:{title:'Prueba',dueDate:'2026-10-02'}}. Resolve relative dates such as hoy/manana to an absolute YYYY-MM-DD date in the tenant timezone before calling the tool. Do not use calendar.write to create a CRM task."
          : "";

    tools[toolName] = tool({
      description: `${definition.description}. Capability: ${capabilityId}. Risk: ${definition.risk}. Pass capability fields directly; the legacy {input:{...}} envelope is also accepted.${guidance} IMPORTANT: if this tool returns ok=false, do not retry it in the same turn and do not switch to a write capability as a workaround.`,
      inputSchema: genericInputSchema,
      execute: async (args) => {
        const startedAt = Date.now();
        const rawArgs = args as Record<string, unknown>;
        const input = normalizeCapabilityInput(capabilityId, rawArgs);
        const idempotencyKey = typeof rawArgs.idempotencyKey === "string"
          ? rawArgs.idempotencyKey
          : generatedIdempotencyKey(capabilityId, session.context.correlationId);
        const baseDiagnostic = { tenantId: session.context.tenantId, employeeId: session.manifest.id, capabilityId, toolName, correlationId: session.context.correlationId, inputKeys: Object.keys(input) };
        logCapability("CAPABILITY_START", baseDiagnostic);

        if (failedCapabilities.has(capabilityId)) {
          const cause = failedCapabilities.get(capabilityId);
          return { ok: false, error: { code: "CAPABILITY_CIRCUIT_OPEN", message: `${capabilityId} already failed in this turn. Do not retry it.`, cause }, evidence: { ...baseDiagnostic, executed: false, circuitOpen: true, durationMs: Date.now() - startedAt } };
        }
        if (!executableCapabilities.has(capabilityId)) {
          const error = { code: "CAPABILITY_NOT_CONNECTED", message: `${capabilityId} is declared for ${session.manifest.id} but is not connected in this runtime.` };
          failedCapabilities.set(capabilityId, error);
          return { ok: false, error, evidence: { ...baseDiagnostic, executed: false, durationMs: Date.now() - startedAt } };
        }
        try {
          const result = await session.execute(capabilityId, input, { idempotencyKey });
          if (!result.ok) failedCapabilities.set(capabilityId, result.error);
          const evidence = { ...baseDiagnostic, ...(result.evidence ?? {}), durationMs: Date.now() - startedAt };
          logCapability(result.ok ? "CAPABILITY_SUCCESS" : "CAPABILITY_ERROR", { ...evidence, ok: result.ok, error: result.error, audit: result.audit });
          return { ok: result.ok, output: result.output, error: result.error, audit: result.audit, evidence };
        } catch (error) {
          const normalized = { code: "CAPABILITY_EXECUTION_FAILED", message: error instanceof Error ? error.message : "Capability execution failed" };
          failedCapabilities.set(capabilityId, normalized);
          return { ok: false, error: normalized, evidence: { ...baseDiagnostic, executed: true, durationMs: Date.now() - startedAt } };
        }
      }
    });
  }
  return tools;
}

export function listManifestToolIds(manifest: EmployeeManifest): string[] {
  return manifest.capabilities.map(capabilityIdToToolName);
}
