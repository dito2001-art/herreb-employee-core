import type { WaitlistRequest } from "./emp002-scheduling";

export type SchedulingGoalKind =
  | "WAITLIST_SLOT"
  | "CONFIRM_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "REMIND_APPOINTMENT"
  | "EVENT_RSVP";

export type SchedulingGoalStatus =
  | "ACTIVE"
  | "WAITING_FOR_TRIGGER"
  | "WAITING_FOR_CONTACT"
  | "WAITING_FOR_EXECUTION"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export interface SchedulingGoal {
  id: string;
  tenantId: string;
  contactId: string;
  kind: SchedulingGoalKind;
  status: SchedulingGoalStatus;
  objective: string;
  confirmedFacts: Record<string, string | number | boolean>;
  waitlist?: WaitlistRequest;
  nextBestAction: string;
  createdAt: string;
  updatedAt: string;
  correlationId: string;
}

export interface WaitlistGoalInput {
  id: string;
  tenantId: string;
  contactId: string;
  objective: string;
  resourceId?: string;
  serviceId?: string;
  dateFrom: string;
  dateTo: string;
  timeWindows?: Array<{ from: string; to: string }>;
  durationMinutes: number;
  priority?: number;
  expiresAt: string;
  now: string;
  correlationId: string;
}

export function createWaitlistGoal(input: WaitlistGoalInput): SchedulingGoal {
  const waitlist: WaitlistRequest = {
    id: `${input.id}:waitlist`,
    tenantId: input.tenantId,
    contactId: input.contactId,
    resourceId: input.resourceId,
    serviceId: input.serviceId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    timeWindows: input.timeWindows,
    durationMinutes: input.durationMinutes,
    priority: input.priority ?? 0,
    status: "WAITING",
    expiresAt: input.expiresAt,
    createdAt: input.now,
    correlationId: input.correlationId
  };
  return {
    id: input.id,
    tenantId: input.tenantId,
    contactId: input.contactId,
    kind: "WAITLIST_SLOT",
    status: "WAITING_FOR_TRIGGER",
    objective: input.objective,
    confirmedFacts: {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      durationMinutes: input.durationMinutes,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      ...(input.serviceId ? { serviceId: input.serviceId } : {})
    },
    waitlist,
    nextBestAction: "WAIT_FOR_COMPATIBLE_SLOT",
    createdAt: input.now,
    updatedAt: input.now,
    correlationId: input.correlationId
  };
}

export function advanceWaitlistGoal(
  goal: SchedulingGoal,
  event:
    | "SLOT_MATCHED"
    | "OFFER_SENT"
    | "OFFER_ACCEPTED"
    | "EXECUTION_VERIFIED"
    | "EXECUTION_FAILED"
    | "OFFER_DECLINED"
    | "EXPIRED",
  now: string
): SchedulingGoal {
  if (goal.kind !== "WAITLIST_SLOT" || goal.status === "COMPLETED" || goal.status === "CANCELLED") return goal;
  const transitions = {
    SLOT_MATCHED: ["ACTIVE", "OFFER_COMPATIBLE_SLOT"],
    OFFER_SENT: ["WAITING_FOR_CONTACT", "WAIT_FOR_CONTACT_RESPONSE"],
    OFFER_ACCEPTED: ["WAITING_FOR_EXECUTION", "CONFIRM_APPOINTMENT_AND_CLOSE_WAITLIST"],
    EXECUTION_VERIFIED: ["COMPLETED", "NONE"],
    EXECUTION_FAILED: ["ACTIVE", "RETRY_OR_ESCALATE_CONFIRMATION"],
    OFFER_DECLINED: ["WAITING_FOR_TRIGGER", "WAIT_FOR_COMPATIBLE_SLOT"],
    EXPIRED: ["EXPIRED", "NONE"]
  } as const;
  const [status, nextBestAction] = transitions[event];
  return { ...goal, status, nextBestAction, updatedAt: now };
}
