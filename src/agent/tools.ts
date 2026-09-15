import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getCapability, type EmployeeManifest } from "../core";
import type { EmployeeRuntimeSession } from "../runtime";

const genericInputSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(1).optional()
});

export function capabilityIdToToolName(capabilityId: string): string {
  const normalized = capabilityId
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) throw new Error(`INVALID_TOOL_NAME:${capabilityId}`);
  return normalized;
}

export function buildEmployeeTools(
  session: EmployeeRuntimeSession,
  executableCapabilities: ReadonlySet<string> = new Set()
): ToolSet {
  const tools: ToolSet = {};
  const seenToolNames = new Map<string, string>();

  for (const capabilityId of session.manifest.capabilities) {
    const definition = getCapability(capabilityId);
    if (!definition) continue;

    const toolName = capabilityIdToToolName(capabilityId);
    const collision = seenToolNames.get(toolName);
    if (collision && collision !== capabilityId) {
      throw new Error(`TOOL_NAME_COLLISION:${collision}:${capabilityId}:${toolName}`);
    }
    seenToolNames.set(toolName, capabilityId);

    tools[toolName] = tool({
      description: `${definition.description}. Capability: ${capabilityId}. Risk: ${definition.risk}.`,
      inputSchema: genericInputSchema,
      execute: async ({ input, idempotencyKey }) => {
        if (!executableCapabilities.has(capabilityId)) {
          return {
            ok: false,
            error: {
              code: "CAPABILITY_NOT_CONNECTED",
              message: `${capabilityId} is declared for ${session.manifest.id} but is not connected in this runtime.`
            },
            evidence: {
              tenantId: session.context.tenantId,
              employeeId: session.manifest.id,
              capabilityId,
              toolName,
              executed: false
            }
          };
        }

        const result = await session.execute(capabilityId, input, { idempotencyKey });
        return {
          ok: result.ok,
          output: result.output,
          error: result.error,
          audit: result.audit,
          evidence: {
            capabilityId,
            toolName
          }
        };
      }
    });
  }

  return tools;
}

export function listManifestToolIds(manifest: EmployeeManifest): string[] {
  return [...manifest.capabilities];
}

export function listManifestToolNames(manifest: EmployeeManifest): string[] {
  return manifest.capabilities.map(capabilityIdToToolName);
}
