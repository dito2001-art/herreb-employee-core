import {
  createAdapterRegistry,
  executeCapability,
  getEmployeeManifest,
  type AdapterRegistry,
  type CapabilityAdapter,
  type CapabilityRequest,
  type CapabilityResult,
  type EmployeeManifest,
  type ExecutionResult,
  type ModelRoute,
  type ModelRouter,
  type TenantContext
} from "../core";
import { resolveRuntimeIdentity, type RuntimeIdentityInput } from "./identity";

export interface EmployeeRuntimeDependencies {
  modelRouter: ModelRouter;
  adapters?: readonly CapabilityAdapter[];
}

export interface EmployeeRuntimeSession {
  context: TenantContext;
  manifest: EmployeeManifest;
  modelRoute: ModelRoute;
  execute<TInput = unknown, TOutput = unknown>(
    capabilityId: string,
    input: TInput,
    options?: { approvalGranted?: boolean; idempotencyKey?: string }
  ): Promise<ExecutionResult<TOutput>>;
}

function assertManifestCapability(manifest: EmployeeManifest, capabilityId: string): void {
  if (!manifest.capabilities.includes(capabilityId)) {
    throw new Error(`EMPLOYEE_CAPABILITY_NOT_DECLARED:${manifest.id}:${capabilityId}`);
  }
}

export class HerreBEmployeeRuntime {
  private readonly registry: AdapterRegistry;

  constructor(private readonly dependencies: EmployeeRuntimeDependencies) {
    this.registry = createAdapterRegistry();
    for (const adapter of dependencies.adapters ?? []) this.registry.register(adapter);
  }

  async start(input: RuntimeIdentityInput): Promise<EmployeeRuntimeSession> {
    const { context, employeeId } = resolveRuntimeIdentity(input);
    const manifest = getEmployeeManifest(employeeId);
    const modelRoute = await this.dependencies.modelRouter.resolve({
      tenantId: context.tenantId,
      employeeId,
      requiresTools: manifest.capabilities.length > 0
    });

    return {
      context,
      manifest,
      modelRoute,
      execute: async <TInput, TOutput>(
        capabilityId: string,
        capabilityInput: TInput,
        options: { approvalGranted?: boolean; idempotencyKey?: string } = {}
      ): Promise<ExecutionResult<TOutput>> => {
        assertManifestCapability(manifest, capabilityId);
        const request: CapabilityRequest<TInput> = {
          context,
          capabilityId,
          input: capabilityInput,
          idempotencyKey: options.idempotencyKey
        };
        return executeCapability<TInput, TOutput>(this.registry, request, {
          approvalGranted: options.approvalGranted
        });
      }
    };
  }
}

export function successfulCapability<T>(output: T, evidence?: Record<string, unknown>): CapabilityResult<T> {
  return { ok: true, output, evidence };
}
