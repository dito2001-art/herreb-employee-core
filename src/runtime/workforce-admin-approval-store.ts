import type { ApprovalGrant } from "./workforce-admin-independent-approval";
import { validateIndependentApproval } from "./workforce-admin-independent-approval";
import type { WorkforceAdminMutation } from "../core/workforce-admin-mutations";

interface ApprovalStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}
const prefix = "workforce-admin:approval:v1:";

/** Only call issue() after authenticating an independent approver.
 * This store does not authenticate external requests. */
export class DurableIndependentApprovalStore {
  constructor(private readonly storage: ApprovalStorage) {}

  async issue(grant: ApprovalGrant): Promise<void> {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(grant.requestId))
      throw new Error("WORKFORCE_APPROVAL_ID_INVALID");
    const key = prefix + grant.requestId;
    if (await this.storage.get(key) !== undefined)
      throw new Error("WORKFORCE_APPROVAL_ID_CONFLICT");
    await this.storage.put(key, { ...grant, consumed: false });
  }

  /** Must execute within the same DO serialized mutation/transaction boundary as
   * the approved registry write. Never expose this method as a public route. */
  async consume(input: {
    requestId: string;
    requesterActorId: string;
    mutation: WorkforceAdminMutation;
    now: number;
  }): Promise<boolean> {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(input.requestId)) return false;
    const key = prefix + input.requestId;
    const record = await this.storage.get<ApprovalGrant & { consumed: boolean }>(key);
    if (!record || record.consumed) return false;
    if (!await validateIndependentApproval({
      grant: record, requesterActorId: input.requesterActorId,
      mutation: input.mutation, now: input.now
    })) return false;
    await this.storage.put(key, { ...record, consumed: true });
    return true;
  }
}
