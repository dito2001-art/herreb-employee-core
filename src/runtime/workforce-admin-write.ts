import type { WorkforceAdminMutation, WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";
import { planWorkforceAdminMutation } from "../core/workforce-admin-mutations";

export type AdminWriteDecision = "GREEN" | "YELLOW" | "RED";

export interface WorkforceAdminWriteActor {
  actorId: string;
  tenantId: string;
  role: "owner" | "admin" | "user";
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
    if (actor.role !== "owner") return "RED";
    if (mutation.type === "tenant.create") return "YELLOW";
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
  approveYellow?: boolean;
  now?: () => Date;
  randomId?: () => string;
}): Promise<{ ok: boolean; decision: AdminWriteDecision; persisted: boolean; auditId: string }> {
  const policy = input.policy ?? new OwnerScopedAdminPolicy();
  const decision = policy.evaluate(input.actor, input.mutation);
  const auditId = (input.randomId ?? (() => crypto.randomUUID()))();
  const timestamp = (input.now ?? (() => new Date()))().toISOString();
  const permitted = decision === "GREEN" || (decision === "YELLOW" && input.approveYellow === true);
  let persisted = false;

  if (permitted) {
    const current = await input.store.read();
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
