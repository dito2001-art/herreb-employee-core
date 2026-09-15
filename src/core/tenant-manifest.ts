import { z } from "zod";
import { EmployeeIdSchema, type EmployeeId } from "./contracts";

export const TenantManifestSchema = z.object({
  tenantId: z.string().min(1),
  enabledEmployees: z.array(EmployeeIdSchema).min(1),
  knowledgeNamespace: z.string().min(1),
  offeringNamespace: z.string().min(1)
});

export type TenantManifest = z.infer<typeof TenantManifestSchema>;

export function parseTenantManifest(input: unknown): TenantManifest {
  const manifest = TenantManifestSchema.parse(input);
  return {
    ...manifest,
    enabledEmployees: [...new Set(manifest.enabledEmployees)]
  };
}

export function assertEmployeeEntitled(
  manifest: TenantManifest,
  employeeId: EmployeeId
): void {
  if (!manifest.enabledEmployees.includes(employeeId)) {
    throw new Error("EMPLOYEE_NOT_ENTITLED");
  }
}
