import type { WorkforceAdminMutation, WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";
import { planWorkforceAdminMutation } from "../core/workforce-admin-mutations";

export type AdminWriteDecision = "GREEN" | "YELLOW" | "RED";

export interface WorkforceAdminWriteActor {
  actorId: string;
  tenantId: string;
  role: "platform_admin" | "owner" | "admin" | "user";
}

export interface WorkforceAdminStateStore {
  read(): Promise<WorkforceAdminMutationPlan>;
  write(next: WorkforceAdminMutationPlan): Promise<void>;
}

export interface WorkforceAdminAuditSink {
  append(entry: {
    auditId: string;
    actorId: string;
    tenantId: string;
    mutationType: WorkforceAdminMutation["type"];
    decision: AdminWriteDecision;
    persisted: boolean;
    timestamp: string;
  }): Promise<void>;
}

export interface WorkforceAdminPolicy {
  evaluate(actor: WorkforceAdminWriteActor, mutation: WorkforceAdminMutation): AdminWriteDecision;
}

export class OwnerScopedAdminPolicy implements WorkforceAdminPolicy {
  evaluate(actor: WorkforceAdminWriteActor, mutation: WorkforceAdminMutation): AdminWriteDecision {
    // Platform administrators are separately authenticated upstream; tenant owners remain scoped.
    if (actor.role === "platform_admin") {
      if (mutation.type === "tenant.create" || mutation.type === "identity.delete") return "YELLOW";
      return "GREEN";
    }
    if (actor.role !== "owner") return "RED";
    // Tenant owners cannot provision other tenants or delete identities by email without a tenant-bound lookup.
    if (mutation.type === "tenant.create" || mutation.type === "identity.delete") return "RED";
    if (mutation.type === "tenant.employees.set" && mutation.tenantId !== actor.tenantId) return "RED";
    if (mutation.type === "identity.upsert" && mutation.identity.tenantId !== actor.tenantId) return "RED";
    return "GREEN";
  }
}

export async function executeWorkforceAdminMutation(input: {
  actor: WorkforceAdminWriteActor;
  mutation: WorkforceAdminMutation;
  store: WorkforceAdminStateStore;
  audit: WorkforceAdminAuditSink;
  policy?: WorkforceAdminPolicy;
  /** Reserved for server-verified approval evidence; browser booleans are not approval evidence. */
  approvalEvidence?: { approvedBy: string; approvalId: string };
  now?: () => Date;
  randomId?: () => string;
}): Promise<{ ok: boolean; decision: AdminWriteDecision; persisted: boolean; auditId: string }> {
  const policy = input.policy ?? new OwnerScopedAdminPolicy();
  const decision = policy.evaluate(input.actor, input.mutation);
  const auditId = (input.randomId ?? (() => crypto.randomUUID()))();
  const timestamp = (input.now ?? (() => new Date()))().toISOString();
  const validApproval = decision === "YELLOW" && Boolean(input.approvalEvidence?.approvedBy.trim() && input.approvalEvidence?.approvalId.trim());
  // YELLOW must carry server-verified approval evidence; a caller-controlled boolean is insufficient.
  const permitted = decision === "GREEN" || validApproval;
  let persisted = false;

  if (permitted) {
    const current = await input.store.read();
    // A tenant owner must not take over an existing identity assigned to another tenant.
    // Check persisted state, not only caller-provided tenantId.
    if (input.actor.role === "owner" && input.mutation.type === "identity.upsert") {
      const email = input.mutation.identity.email.trim().toLowerCase();
      const existing = current.identities.find((identity) => identity.email.trim().toLowerCase() === email);
      if (existing && existing.tenantId !== input.actor.tenantId) {
        await input.audit.append({ auditId, actorId: input.actor.actorId, tenantId: input.actor.tenantId, mutationType: input.mutation.type, decision: "RED", persisted: false, timestamp });
        return { ok: false, decision: "RED", persisted: false, auditId };
      }
    }
    const next = planWorkforceAdminMutation(current, input.mutation);
    await input.store.write(next);
    persisted = true;
  }

  await input.audit.append({
    auditId,
    actorId: input.actor.actorId,
    tenantId: input.actor.tenantId,
    mutationType: input.mutation.type,
    decision,
    persisted,
    timestamp
  });

  return { ok: permitted, decision, persisted, auditId };
}
