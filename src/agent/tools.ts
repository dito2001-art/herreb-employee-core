import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getCapability, type EmployeeManifest } from "../core";
import type { EmployeeRuntimeSession } from "../runtime";

const genericInputSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(1).optional()
});

const TOOL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

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

  for (const capabilityId of session.manifest.capabilities) {
    const definition = getCapability(capabilityId);
    if (!definition) continue;

    const toolName = capabilityIdToToolName(capabilityId);
    if (names.has(toolName)) throw new Error(`TOOL_NAME_COLLISION:${toolName}`);
    names.add(toolName);

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

        const result = await session.execute(capabilityId, input, {
          idempotencyKey
        });
        return {
          ok: result.ok,
          output: result.output,
          error: result.error,
          audit: result.audit,
          evidence: {
            capabilityId,
            toolName,
            correlationId: session.context.correlationId
          }
        };
      }
    });
  }

  return tools;
}

export function listManifestToolIds(manifest: EmployeeManifest): string[] {
  return manifest.capabilities.map(capabilityIdToToolName);
}
