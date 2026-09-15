import {
  assertEmployeeEntitled,
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
  type TenantContext,
  type TenantManifest
} from "../core";
import { resolveRuntimeIdentity, type RuntimeIdentityInput } from "./identity";
import {
  canAuthorizeControlledWrite,
  unverifiedProvenance,
  type RuntimeProvenance
} from "./provenance";

export interface EmployeeRuntimeDependencies {
  modelRouter: ModelRouter;
  adapters?: readonly CapabilityAdapter[];
  resolveTenantManifest?: (
    tenantId: string
  ) => TenantManifest | Promise<TenantManifest>;
  resolveProvenance?: (
    input: RuntimeIdentityInput,
    context: TenantContext
  ) => RuntimeProvenance | Promise<RuntimeProvenance>;
}

export interface EmployeeRuntimeSession {
  context: TenantContext;
  manifest: EmployeeManifest;
  tenantManifest?: TenantManifest;
  provenance: RuntimeProvenance;
  modelRoute: ModelRoute;
  execute<TInput = unknown, TOutput = unknown>(
    capabilityId: string,
    input: TInput,
    options?: { approvalGranted?: boolean; idempotencyKey?: string }
  ): Promise<ExecutionResult<TOutput>>;
}

function assertManifestCapability(
  manifest: EmployeeManifest,
  capabilityId: string
): void {
  if (!manifest.capabilities.includes(capabilityId)) {
    throw new Error(
      `EMPLOYEE_CAPABILITY_NOT_DECLARED:${manifest.id}:${capabilityId}`
    );
  }
}

export class HerreBEmployeeRuntime {
  private readonly registry: AdapterRegistry;

  constructor(private readonly dependencies: EmployeeRuntimeDependencies) {
    this.registry = createAdapterRegistry();
    for (const adapter of dependencies.adapters ?? [])
      this.registry.register(adapter);
  }

  async start(input: RuntimeIdentityInput): Promise<EmployeeRuntimeSession> {
    const { context, employeeId } = resolveRuntimeIdentity(input);
    const tenantManifest = this.dependencies.resolveTenantManifest
      ? await this.dependencies.resolveTenantManifest(context.tenantId)
      : undefined;
    if (tenantManifest) {
      if (tenantManifest.tenantId !== context.tenantId)
        throw new Error("TENANT_MANIFEST_MISMATCH");
      assertEmployeeEntitled(tenantManifest, employeeId);
    }

    const provenance = this.dependencies.resolveProvenance
      ? await this.dependencies.resolveProvenance(input, context)
      : unverifiedProvenance();
    const manifest = getEmployeeManifest(employeeId);
    const modelRoute = await this.dependencies.modelRouter.resolve({
      tenantId: context.tenantId,
      employeeId,
      requiresTools: manifest.capabilities.length > 0
    });

    return {
      context,
      manifest,
      tenantManifest,
      provenance,
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
        const ownerAuthorized = canAuthorizeControlledWrite(
          provenance,
          context.tenantId,
          context.actorId
        );
        return executeCapability<TInput, TOutput>(this.registry, request, {
          approvalGranted: options.approvalGranted,
          controlledWriteAuthorization: {
            authorized: ownerAuthorized,
            assurance: provenance.assurance,
            subjectId: provenance.subjectId,
            tenantId: provenance.tenantId,
            source: provenance.source
          }
        });
      }
    };
  }
}

export function successfulCapability<T>(
  output: T,
  evidence?: Record<string, unknown>
): CapabilityResult<T> {
  return { ok: true, output, evidence };
}
