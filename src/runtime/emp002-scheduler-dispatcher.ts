export interface EMP002SchedulerManifest {
  tenantId?: string;
  enabledEmployees?: string[];
}

export interface EMP002SchedulerNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface EMP002SchedulerEnv {
  TENANT_MANIFESTS_JSON?: string;
  EMP002_OPERATIONS?: EMP002SchedulerNamespace;
}

export interface EMP002SchedulerTenantResult {
  tenantId: string;
  ok: boolean;
  status: number;
  result?: unknown;
  error?: string;
}

export function resolveEMP002SchedulerTenants(raw?: string): string[] {
  let manifests: EMP002SchedulerManifest[];
  try {
    manifests = JSON.parse(raw ?? '[]') as EMP002SchedulerManifest[];
  } catch {
    throw new Error('EMP002_SCHEDULER_INVALID_TENANT_MANIFESTS');
  }
  if (!Array.isArray(manifests)) throw new Error('EMP002_SCHEDULER_INVALID_TENANT_MANIFESTS');
  return [...new Set(manifests
    .filter((manifest) => Array.isArray(manifest.enabledEmployees) && manifest.enabledEmployees.includes('EMP-002'))
    .map((manifest) => manifest.tenantId?.trim())
    .filter((tenantId): tenantId is string => Boolean(tenantId)))];
}

export async function dispatchEMP002ScheduledActions(
  env: EMP002SchedulerEnv,
  now = new Date().toISOString(),
): Promise<EMP002SchedulerTenantResult[]> {
  if (!env.EMP002_OPERATIONS) throw new Error('EMP002_OPERATIONS_BINDING_MISSING');
  const tenants = resolveEMP002SchedulerTenants(env.TENANT_MANIFESTS_JSON);
  const results: EMP002SchedulerTenantResult[] = [];
  for (const tenantId of tenants) {
    try {
      const id = env.EMP002_OPERATIONS.idFromName(`tenant:${tenantId}`);
      const stub = env.EMP002_OPERATIONS.get(id);
      const response = await stub.fetch('https://emp002.operations/appointment/actions/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, now, limit: 50 }),
      });
      const text = await response.text();
      let result: unknown = text;
      try { result = text ? JSON.parse(text) : undefined; } catch { /* preserve text */ }
      results.push({ tenantId, ok: response.ok, status: response.status, result });
    } catch (error) {
      results.push({ tenantId, ok: false, status: 503, error: error instanceof Error ? error.message : 'EMP002_SCHEDULER_DISPATCH_FAILED' });
    }
  }
  return results;
}
