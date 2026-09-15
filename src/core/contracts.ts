import { z } from "zod";

export const EmployeeIdSchema = z.enum(["EMP-001", "EMP-002", "EMP-003"]);
export type EmployeeId = z.infer<typeof EmployeeIdSchema>;

export const OfferingTypeSchema = z.enum([
  "PHYSICAL_PRODUCT",
  "SERVICE",
  "SUBSCRIPTION",
  "HYBRID"
]);
export type OfferingType = z.infer<typeof OfferingTypeSchema>;

export const RiskLevelSchema = z.enum(["GREEN", "YELLOW", "RED"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const TenantContextSchema = z.object({
  tenantId: z.string().min(1),
  employeeId: EmployeeIdSchema,
  workspaceId: z.string().min(1),
  actorId: z.string().min(1),
  channel: z.string().min(1),
  correlationId: z.string().min(1)
});
export type TenantContext = z.infer<typeof TenantContextSchema>;

export const OfferingSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  type: OfferingTypeSchema,
  name: z.string().min(1),
  active: z.boolean().default(true),
  description: z.string().optional(),
  currency: z.string().optional(),
  price: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});
export type Offering = z.infer<typeof OfferingSchema>;

export interface CapabilityDefinition {
  id: string;
  description: string;
  risk: RiskLevel;
  allowedEmployees: readonly EmployeeId[];
}

export interface EmployeeManifest {
  id: EmployeeId;
  name: string;
  productName: string;
  purpose: string;
  capabilities: readonly string[];
}

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  tenantId: string;
  employeeId: EmployeeId;
  actorId: string;
  correlationId: string;
  capabilityId: string;
  risk: RiskLevel;
  decision: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  outcome?: "SUCCESS" | "FAILURE";
  evidence?: Record<string, unknown>;
}
