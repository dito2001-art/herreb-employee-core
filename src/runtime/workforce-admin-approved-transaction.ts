import type { WorkforceAdminMutation, WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";
import { planWorkforceAdminMutation } from "../core/workforce-admin-mutations";
import type { ApprovalGrant } from "./workforce-admin-independent-approval";
import { validateIndependentApproval } from "./workforce-admin-independent-approval";

const stateKey = "workforce-admin:state:v1";
const approvalPrefix = "workforce-admin:approval:v1:";

interface Transaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}
export interface TransactionalAdminStorage {
  transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
}

/** Commit the registry update and approval consumption in one storage transaction. */
export async function commitApprovedAdminMutation(input: {
  storage: TransactionalAdminStorage;
  bootstrap: WorkforceAdminMutationPlan;
  mutation: WorkforceAdminMutation;
  requesterActorId: string;
  requestId: string;
  now: number;
  auditId?: string;
}): Promise<boolean> {
  if (input.mutation.type !== "tenant.create" && input.mutation.type !== "identity.delete") return false;
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(input.requestId) || !Number.isFinite(input.now)) return false;
  return input.storage.transaction(async (tx) => {
    const key = approvalPrefix + input.requestId;
    const approval = await tx.get<ApprovalGrant & { consumed: boolean }>(key);
    if (!approval || approval.consumed) return false;
    if (!await validateIndependentApproval({
      grant: approval, mutation: input.mutation,
      requesterActorId: input.requesterActorId, now: input.now
    })) return false;
    const current = (await tx.get<WorkforceAdminMutationPlan>(stateKey)) ?? input.bootstrap;
    const next = planWorkforceAdminMutation(current, input.mutation);
    await tx.put(stateKey, next);
    await tx.put(key, { ...approval, consumed: true });
    if (input.auditId) {
      await tx.put(`workforce-admin:audit:v1:${new Date(input.now).toISOString()}:${input.auditId}`, {
        auditId: input.auditId,
        actorId: input.requesterActorId,
        tenantId: "platform",
        mutationType: input.mutation.type,
        decision: "YELLOW",
        persisted: true,
        timestamp: new Date(input.now).toISOString(),
        approvalRequestId: input.requestId,
        approverActorId: approval.approverActorId
      });
    }
    const readBack = await tx.get<WorkforceAdminMutationPlan>(stateKey);
    if (!readBack || JSON.stringify(readBack) !== JSON.stringify(next))
      throw new Error("WORKFORCE_ADMIN_PERSISTENCE_READBACK_FAILED");
    return true;
  });
}
