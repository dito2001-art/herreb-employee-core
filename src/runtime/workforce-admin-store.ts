import type { WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";
import type { WorkforceAdminIdentity } from "../core/workforce-admin";
import type { TenantRegistryManifest } from "../core/tenant-registry";
import type { WorkforceAdminAuditSink, WorkforceAdminStateStore } from "./workforce-admin-write";

interface DurableStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

const STATE_KEY = "workforce-admin:state:v1";
const AUDIT_PREFIX = "workforce-admin:audit:v1:";

function parseArray<T>(value?: string): T[] {
  if (!value?.trim()) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("WORKFORCE_ADMIN_BOOTSTRAP_INVALID");
  return parsed as T[];
}

export function bootstrapWorkforceAdminState(input: {
  tenantManifestsJson?: string;
  accessIdentityMapJson?: string;
}): WorkforceAdminMutationPlan {
  return {
    manifests: parseArray<TenantRegistryManifest>(input.tenantManifestsJson),
    identities: parseArray<WorkforceAdminIdentity>(input.accessIdentityMapJson)
  };
}

export class DurableWorkforceAdminStore implements WorkforceAdminStateStore {
  constructor(
    private readonly storage: DurableStorage,
    private readonly bootstrap: WorkforceAdminMutationPlan
  ) {}

  async read(): Promise<WorkforceAdminMutationPlan> {
    const persisted = await this.storage.get<WorkforceAdminMutationPlan>(STATE_KEY);
    return persisted ?? this.bootstrap;
  }

  async write(next: WorkforceAdminMutationPlan): Promise<void> {
    await this.storage.put(STATE_KEY, next);
    const readBack = await this.storage.get<WorkforceAdminMutationPlan>(STATE_KEY);
    if (!readBack || JSON.stringify(readBack) !== JSON.stringify(next)) {
      throw new Error("WORKFORCE_ADMIN_PERSISTENCE_READBACK_FAILED");
    }
  }
}

export class DurableWorkforceAdminAuditSink implements WorkforceAdminAuditSink {
  constructor(private readonly storage: DurableStorage) {}

  async append(entry: Parameters<WorkforceAdminAuditSink["append"]>[0]): Promise<void> {
    await this.storage.put(`${AUDIT_PREFIX}${entry.timestamp}:${entry.auditId}`, entry);
  }
}
