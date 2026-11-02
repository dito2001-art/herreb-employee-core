import type { WorkforceAdminMutation } from "../core/workforce-admin-mutations";

/** Evidence is issued only by a separately authenticated server-side approver.
 * Caller-supplied JSON is never an ApprovalGrant. */
export interface ApprovalGrant {
  requestId: string;
  requesterActorId: string;
  approverActorId: string;
  mutationSha256: string;
  expiresAt: number;
}

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" + Object.keys(object).sort().map((key) =>
    JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
}

export async function workforceMutationDigest(mutation: WorkforceAdminMutation): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(mutation));
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

/** Pure validation only. Persistence must atomically consume requestId in the
 * existing admin Durable Object before a YELLOW mutation can be committed. */
export async function validateIndependentApproval(input: {
  grant: ApprovalGrant;
  mutation: WorkforceAdminMutation;
  requesterActorId: string;
  now: number;
}): Promise<boolean> {
  const { grant, mutation, requesterActorId, now } = input;
  if (mutation.type !== "tenant.create" && mutation.type !== "identity.delete") return false;
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(grant.requestId)) return false;
  if (!grant.requesterActorId || !grant.approverActorId ||
      grant.requesterActorId === grant.approverActorId ||
      grant.requesterActorId !== requesterActorId) return false;
  if (!Number.isSafeInteger(grant.expiresAt) || !Number.isSafeInteger(now) ||
      grant.expiresAt <= now || grant.expiresAt > now + 300_000) return false;
  return grant.mutationSha256 === await workforceMutationDigest(mutation);
}
