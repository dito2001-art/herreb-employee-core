import type { WorkforceAdminMutation } from "../core/workforce-admin-mutations";
import { workforceMutationDigest } from "./workforce-admin-independent-approval";
import type { ApprovalGrant } from "./workforce-admin-independent-approval";

interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  transaction?<T>(callback: (tx: Storage) => Promise<T>): Promise<T>;
}
const pendingPrefix = "workforce-admin:approval-request:v1:";
const grantPrefix = "workforce-admin:approval:v1:";
const idPattern = /^[a-zA-Z0-9_-]{16,128}$/;
export interface PendingIndependentApproval {
  requestId: string;
  requesterActorId: string;
  mutationSha256: string;
  createdAt: number;
  expiresAt: number;
  approved: boolean;
}

/** Internal storage protocol. Caller must independently authenticate the
 * requester and reviewer. Never accept actor IDs from public request JSON. */
export class DurableApprovalRequests {
  constructor(private readonly storage: Storage) {}

  async request(input: {
    requestId: string; requesterActorId: string;
    mutation: WorkforceAdminMutation; now: number;
  }): Promise<PendingIndependentApproval> {
    if (!idPattern.test(input.requestId) || !input.requesterActorId.trim() || !Number.isFinite(input.now))
      throw new Error("WORKFORCE_APPROVAL_REQUEST_INVALID");
    if (input.mutation.type !== "tenant.create" && input.mutation.type !== "identity.delete")
      throw new Error("WORKFORCE_APPROVAL_MUTATION_NOT_YELLOW");
    const key = pendingPrefix + input.requestId;
    if (await this.storage.get(key) !== undefined)
      throw new Error("WORKFORCE_APPROVAL_REQUEST_CONFLICT");
    const record: PendingIndependentApproval = {
      requestId: input.requestId,
      requesterActorId: input.requesterActorId,
      mutationSha256: await workforceMutationDigest(input.mutation),
      createdAt: input.now,
      expiresAt: input.now + 300_000,
      approved: false
    };
    await this.storage.put(key, record);
    return record;
  }

  async approve(input: {
    requestId: string; approverActorId: string; now: number;
  }): Promise<boolean> {
    if (!idPattern.test(input.requestId) || !input.approverActorId.trim() || !Number.isFinite(input.now)) return false;
    if (!this.storage.transaction) return false;
    return this.storage.transaction(async (tx) => {
    const key = pendingPrefix + input.requestId;
    const pending = await tx.get<PendingIndependentApproval>(key);
    if (!pending || pending.approved || input.now < pending.createdAt ||
        input.now >= pending.expiresAt ||
        pending.requesterActorId === input.approverActorId) return false;
    const grantKey = grantPrefix + input.requestId;
    if (await tx.get(grantKey) !== undefined) return false;
    const grant: ApprovalGrant & { consumed: boolean } = {
      requestId: input.requestId,
      requesterActorId: pending.requesterActorId,
      approverActorId: input.approverActorId,
      mutationSha256: pending.mutationSha256,
      expiresAt: pending.expiresAt,
      consumed: false
    };
    await tx.put(grantKey, grant);
    await tx.put(key, { ...pending, approved: true });
    return true;
    });
  }
}
