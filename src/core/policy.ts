import { getCapability } from "./capabilities";
import { getEmployeeManifest } from "./manifests";
import type { RiskLevel, TenantContext } from "./contracts";

export type PolicyDecision = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";

export interface PolicyResult {
  decision: PolicyDecision;
  risk: RiskLevel;
  reason: string;
}

export function authorizeCapability(
  context: TenantContext,
  capabilityId: string
): PolicyResult {
  const manifest = getEmployeeManifest(context.employeeId);
  const capability = getCapability(capabilityId);

  if (!capability) {
    return { decision: "DENY", risk: "RED", reason: "Unknown capability" };
  }

  if (!manifest.capabilities.includes(capabilityId)) {
    return { decision: "DENY", risk: "RED", reason: "Capability not declared by employee manifest" };
  }

  if (!capability.allowedEmployees.includes(context.employeeId)) {
    return { decision: "DENY", risk: "RED", reason: "Employee is not allowed to use capability" };
  }

  if (capability.risk === "RED") {
    return { decision: "DENY", risk: "RED", reason: "Red actions are blocked by default" };
  }

  if (capability.risk === "YELLOW") {
    return { decision: "REQUIRE_APPROVAL", risk: "YELLOW", reason: "Controlled side effect requires authorization" };
  }

  return { decision: "ALLOW", risk: "GREEN", reason: "Read-only or low-risk capability" };
}
