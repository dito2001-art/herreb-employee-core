import { getCapability } from "./capabilities";
import type { EmployeeId, TenantContext } from "./contracts";

export interface CapabilityRequest<TInput = unknown> {
  context: TenantContext;
  capabilityId: string;
  input: TInput;
  idempotencyKey?: string;
}

export interface CapabilityResult<TOutput = unknown> {
  ok: boolean;
  output?: TOutput;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
  evidence?: Record<string, unknown>;
}

export interface CapabilityAdapter<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly capabilities: readonly string[];
  readonly employees: readonly EmployeeId[];
  execute(request: CapabilityRequest<TInput>): Promise<CapabilityResult<TOutput>>;
}

export interface AdapterRegistry {
  register(adapter: CapabilityAdapter): void;
  resolve(capabilityId: string, employeeId: EmployeeId): CapabilityAdapter | undefined;
}

export function createAdapterRegistry(): AdapterRegistry {
  const adapters: CapabilityAdapter[] = [];

  return {
    register(adapter) {
      if (adapters.some((existing) => existing.id === adapter.id)) {
        throw new Error(`ADAPTER_ALREADY_REGISTERED:${adapter.id}`);
      }
      if (adapter.capabilities.length === 0 || adapter.employees.length === 0) {
        throw new Error(`INVALID_ADAPTER_SCOPE:${adapter.id}`);
      }
      for (const capabilityId of adapter.capabilities) {
        const capability = getCapability(capabilityId);
        if (!capability) throw new Error(`UNKNOWN_CAPABILITY:${capabilityId}`);
        for (const employeeId of adapter.employees) {
          if (!capability.allowedEmployees.includes(employeeId)) {
            throw new Error(`INVALID_ADAPTER_EMPLOYEE_SCOPE:${adapter.id}:${employeeId}:${capabilityId}`);
          }
        }
      }
      adapters.push(adapter);
    },
    resolve(capabilityId, employeeId) {
      return adapters.find(
        (adapter) =>
          adapter.capabilities.includes(capabilityId) &&
          adapter.employees.includes(employeeId)
      );
    }
  };
}
