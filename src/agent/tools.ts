import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getCapability, type EmployeeManifest } from "../core";
import type { EmployeeRuntimeSession } from "../runtime";

const genericInputSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(1).optional()
});

const TOOL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

function logCapability(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }));
}

export function capabilityIdToToolName(capabilityId: string): string {
  const normalized = capabilityId.replace(/[^A-Za-z0-9_-]/g, "_");
  const prefixed = /^[A-Za-z_]/.test(normalized)
    ? normalized
    : `cap_${normalized}`;
  const name = prefixed.slice(0, 64);
  if (!TOOL_NAME_PATTERN.test(name))
    throw new Error(`INVALID_TOOL_NAME:${capabilityId}`);
  return name;
}

export function toolNameToCapabilityId(
  manifest: EmployeeManifest,
  toolName: string
): string | undefined {
  return manifest.capabilities.find(
    (capabilityId) => capabilityIdToToolName(capabilityId) === toolName
  );
}

export function buildEmployeeTools(
  session: EmployeeRuntimeSession,
  executableCapabilities: ReadonlySet<string> = new Set()
): ToolSet {
  const tools: ToolSet = {};
  const names = new Set<string>();
  const failedCapabilities = new Map<string, unknown>();

  for (const capabilityId of session.manifest.capabilities) {
    const definition = getCapability(capabilityId);
    if (!definition) continue;

    const toolName = capabilityIdToToolName(capabilityId);
    if (names.has(toolName)) throw new Error(`TOOL_NAME_COLLISION:${toolName}`);
    names.add(toolName);

    tools[toolName] = tool({
      description: `${definition.description}. Capability: ${capabilityId}. Risk: ${definition.risk}. IMPORTANT: if this tool returns ok=false, do not retry it in the same turn. Explain the failure to the user instead.`,
      inputSchema: genericInputSchema,
      execute: async ({ input, idempotencyKey }) => {
        const startedAt = Date.now();
        const baseDiagnostic = {
          tenantId: session.context.tenantId,
          employeeId: session.manifest.id,
          capabilityId,
          toolName,
          correlationId: session.context.correlationId
        };

        logCapability("CAPABILITY_START", baseDiagnostic);

        if (failedCapabilities.has(capabilityId)) {
          const cause = failedCapabilities.get(capabilityId);
          const response = {
            ok: false,
            error: {
              code: "CAPABILITY_CIRCUIT_OPEN",
              message: `${capabilityId} already failed in this turn. Do not retry it; explain that the connected service is temporarily unavailable.`,
              cause
            },
            evidence: {
              ...baseDiagnostic,
              executed: false,
              circuitOpen: true,
              durationMs: Date.now() - startedAt
            }
          };
          logCapability("CAPABILITY_ERROR", { ...response.evidence, error: response.error });
          return response;
        }

        if (!executableCapabilities.has(capabilityId)) {
          const error = {
            code: "CAPABILITY_NOT_CONNECTED",
            message: `${capabilityId} is declared for ${session.manifest.id} but is not connected in this runtime.`
          };
          failedCapabilities.set(capabilityId, error);
          const evidence = {
            ...baseDiagnostic,
            executed: false,
            durationMs: Date.now() - startedAt
          };
          logCapability("CAPABILITY_ERROR", { ...evidence, error });
          return { ok: false, error, evidence };
        }

        try {
          const result = await session.execute(capabilityId, input, {
            idempotencyKey
          });
          if (!result.ok) failedCapabilities.set(capabilityId, result.error);
          const evidence = {
            ...baseDiagnostic,
            ...(result.evidence ?? {}),
            durationMs: Date.now() - startedAt
          };
          logCapability(result.ok ? "CAPABILITY_SUCCESS" : "CAPABILITY_ERROR", {
            ...evidence,
            ok: result.ok,
            error: result.error,
            audit: result.audit
          });
          return {
            ok: result.ok,
            output: result.output,
            error: result.error,
            audit: result.audit,
            evidence
          };
        } catch (error) {
          const normalized = {
            code: "CAPABILITY_EXECUTION_FAILED",
            message: error instanceof Error ? error.message : "Capability execution failed"
          };
          failedCapabilities.set(capabilityId, normalized);
          const evidence = {
            ...baseDiagnostic,
            executed: true,
            durationMs: Date.now() - startedAt
          };
          logCapability("CAPABILITY_EXCEPTION", {
            ...evidence,
            error: normalized,
            stack: error instanceof Error ? error.stack : undefined
          });
          return {
            ok: false,
            error: normalized,
            evidence
          };
        }
      }
    });
  }

  return tools;
}

export function listManifestToolIds(manifest: EmployeeManifest): string[] {
  return manifest.capabilities.map(capabilityIdToToolName);
}
