import { StaticModelRouter, parseTenantManifest, type EmployeeId } from "../core";
import type { MarketingContentProvider } from "../adapters";
import { buildTenantReadOnlyRuntime, type TenantCapabilityBinding, type TenantCapabilityEnv } from "./tenant-capabilities";
import { HerreBEmployeeRuntime } from "./runtime";

export interface EMP003ProductionCertificationEnv extends TenantCapabilityEnv {
  TENANT_MANIFESTS_JSON?: string;
}

export async function runEMP003ProductionCertification(
  env: EMP003ProductionCertificationEnv,
  input: { tenantId: string; actorId: string; correlationId: string; brief: Record<string, unknown> },
  provider: MarketingContentProvider,
  bindings: readonly TenantCapabilityBinding[] = []
) {
  const manifests = JSON.parse(env.TENANT_MANIFESTS_JSON ?? "[]") as Array<{ tenantId?: string; enabledEmployees?: EmployeeId[]; knowledgeNamespace?: string; offeringNamespace?: string }>;
  const manifest = manifests.find((candidate) => candidate.tenantId === input.tenantId);
  if (!manifest) throw new Error("EMP003_CERT_TENANT_NOT_CONFIGURED");

  const bootstrap = buildTenantReadOnlyRuntime({ ...env, MARKETING_CONTENT_PROVIDER: provider }, input.tenantId, bindings);
  const runtime = new HerreBEmployeeRuntime({
    modelRouter: new StaticModelRouter({ provider: "workers-ai", model: "emp003-production-certification", reason: "EMP-003 production certification" }),
    adapters: bootstrap.adapters,
    resolveTenantManifest: () => parseTenantManifest({
      tenantId: input.tenantId,
      enabledEmployees: manifest.enabledEmployees ?? [],
      knowledgeNamespace: manifest.knowledgeNamespace ?? `${input.tenantId}:knowledge`,
      offeringNamespace: manifest.offeringNamespace ?? `${input.tenantId}:offerings`
    })
  });
  const session = await runtime.start({ tenantId: input.tenantId, employeeId: "EMP-003", workspaceId: "emp003-production-certification", actorId: input.actorId, channel: "production-certification", correlationId: input.correlationId });
  const created = await session.execute("content.create", { brief: input.brief });
  const output = created.output as { status?: string; draft?: unknown } | undefined;
  const evidence = created.evidence as { publishExecuted?: boolean } | undefined;

  return {
    ok: created.ok && output?.status === "DRAFT" && evidence?.publishExecuted === false,
    tenantId: session.context.tenantId,
    employeeId: session.manifest.id,
    contentCreateConnected: bootstrap.connectedCapabilities.has("content.create"),
    researchWebConnected: bootstrap.connectedCapabilities.has("research.web"),
    contentPublishConnected: bootstrap.connectedCapabilities.has("content.publish"),
    status: output?.status ?? null,
    publishExecuted: evidence?.publishExecuted ?? null,
    draft: output?.draft ?? null,
    audit: created.audit
  };
}
