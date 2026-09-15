import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getCapability, type EmployeeManifest } from "../core";
import type { EmployeeRuntimeSession } from "../runtime";

const genericInputSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(1).optional()
});

export function buildEmployeeTools(
  session: EmployeeRuntimeSession,
  executableCapabilities: ReadonlySet<string> = new Set()
): ToolSet {
  const tools: ToolSet = {};

  for (const capabilityId of session.manifest.capabilities) {
    const definition = getCapability(capabilityId);
    if (!definition) continue;

    tools[capabilityId] = tool({
      description: `${definition.description}. Risk: ${definition.risk}.`,
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
              executed: false
            }
          };
        }

        const result = await session.execute(capabilityId, input, { idempotencyKey });
        return {
          ok: result.ok,
          output: result.output,
          error: result.error,
          audit: result.audit
        };
      }
    });
  }

  return tools;
}

export function listManifestToolIds(manifest: EmployeeManifest): string[] {
  return [...manifest.capabilities];
}
