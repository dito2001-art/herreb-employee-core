import type { ReadOnlyRuntimeBootstrap } from "./bootstrap";

export const EMP002_REQUIRED_READ_CAPABILITIES = [
  "crm.read",
  "calendar.read",
  "email.read"
] as const;

export const EMP002_FORBIDDEN_WRITE_CAPABILITIES = [
  "crm.write",
  "calendar.write",
  "email.send",
  "task.schedule"
] as const;

export interface Emp002ReadOnlyReadiness {
  ready: boolean;
  missingReadCapabilities: string[];
  exposedWriteCapabilities: string[];
  diagnostics: ReadOnlyRuntimeBootstrap["diagnostics"];
}

export function evaluateEmp002ReadOnlyReadiness(
  bootstrap: ReadOnlyRuntimeBootstrap
): Emp002ReadOnlyReadiness {
  const missingReadCapabilities = EMP002_REQUIRED_READ_CAPABILITIES.filter(
    (capability) => !bootstrap.connectedCapabilities.has(capability)
  );
  const exposedWriteCapabilities = EMP002_FORBIDDEN_WRITE_CAPABILITIES.filter(
    (capability) => bootstrap.connectedCapabilities.has(capability)
  );

  return {
    ready:
      missingReadCapabilities.length === 0 &&
      exposedWriteCapabilities.length === 0,
    missingReadCapabilities: [...missingReadCapabilities],
    exposedWriteCapabilities: [...exposedWriteCapabilities],
    diagnostics: { ...bootstrap.diagnostics }
  };
}

export function assertEmp002ReadOnlyReady(
  bootstrap: ReadOnlyRuntimeBootstrap
): void {
  const readiness = evaluateEmp002ReadOnlyReadiness(bootstrap);
  if (!readiness.ready) {
    throw new Error(
      `EMP002_READ_ONLY_NOT_READY:${JSON.stringify({
        missingReadCapabilities: readiness.missingReadCapabilities,
        exposedWriteCapabilities: readiness.exposedWriteCapabilities,
        diagnostics: readiness.diagnostics
      })}`
    );
  }
}
