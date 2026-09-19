import {
  advanceWaitlistGoal,
  type SchedulingGoal
} from "./emp002-cognitive-scheduling";
import {
  resolveCurrentOffer,
  startSlotRecovery,
  type SlotRecovery
} from "./emp002-slot-recovery";
import type { AvailableSlot, WaitlistRequest } from "./emp002-scheduling";

export interface AutonomousSchedulingState {
  tenantId: string;
  correlationId: string;
  goal: SchedulingGoal;
  recovery?: SlotRecovery;
  version?: number;
}

export type AutonomousSchedulingAction =
  | {
      type: "SLOT_RELEASED";
      slot: AvailableSlot;
      requests: WaitlistRequest[];
      now: string;
    }
  | { type: "OFFER_SENT"; now: string }
  | { type: "CONTACT_ACCEPTED"; requests: WaitlistRequest[]; now: string }
  | { type: "CONTACT_DECLINED"; requests: WaitlistRequest[]; now: string }
  | { type: "OFFER_TIMEOUT"; requests: WaitlistRequest[]; now: string }
  | { type: "CONFIRMATION_VERIFIED"; now: string }
  | { type: "CONFIRMATION_FAILED"; now: string };

export interface AutonomousSchedulingResult {
  state: AutonomousSchedulingState;
  commands: Array<
    | {
        type: "SEND_SLOT_OFFER";
        idempotencyKey: string;
        contactId: string;
        requestId: string;
        expiresAt: string;
      }
    | {
        type: "CONFIRM_SLOT";
        idempotencyKey: string;
        requestId: string;
        slot: AvailableSlot;
      }
  >;
}

export function reduceAutonomousScheduling(
  state: AutonomousSchedulingState,
  action: AutonomousSchedulingAction
): AutonomousSchedulingResult {
  if (state.goal.tenantId !== state.tenantId)
    throw new Error("EMP002_SCHEDULING_TENANT_MISMATCH");

  if (action.type === "SLOT_RELEASED") {
    const recovery = startSlotRecovery({
      tenantId: state.tenantId,
      correlationId: state.correlationId,
      slot: action.slot,
      requests: action.requests,
      now: action.now
    });
    if (!recovery.nextOffer)
      return { state: { ...state, recovery: recovery.recovery }, commands: [] };
    const goal = advanceWaitlistGoal(state.goal, "SLOT_MATCHED", action.now);
    return {
      state: { ...state, goal, recovery: recovery.recovery },
      commands: [
        {
          type: "SEND_SLOT_OFFER",
          idempotencyKey: `${recovery.recovery.id}:offer:${recovery.nextOffer.requestId}`,
          contactId: recovery.nextOffer.contactId,
          requestId: recovery.nextOffer.requestId,
          expiresAt: recovery.nextOffer.expiresAt
        }
      ]
    };
  }

  if (action.type === "CONFIRMATION_VERIFIED") {
    return {
      state: {
        ...state,
        goal: advanceWaitlistGoal(state.goal, "EXECUTION_VERIFIED", action.now)
      },
      commands: []
    };
  }

  if (action.type === "CONFIRMATION_FAILED") {
    return {
      state: {
        ...state,
        goal: advanceWaitlistGoal(state.goal, "EXECUTION_FAILED", action.now)
      },
      commands: []
    };
  }

  if (action.type === "OFFER_SENT") {
    return {
      state: {
        ...state,
        goal: advanceWaitlistGoal(state.goal, "OFFER_SENT", action.now)
      },
      commands: []
    };
  }

  if (!state.recovery) return { state, commands: [] };
  const response =
    action.type === "CONTACT_ACCEPTED"
      ? "ACCEPT"
      : action.type === "CONTACT_DECLINED"
        ? "DECLINE"
        : "TIMEOUT";
  const resolved = resolveCurrentOffer({
    tenantId: state.tenantId,
    recovery: state.recovery,
    requests: action.requests,
    now: action.now,
    response
  });

  if (
    response === "ACCEPT" &&
    resolved.recovery.status === "FILLED" &&
    resolved.recovery.filledByRequestId
  ) {
    return {
      state: {
        ...state,
        recovery: resolved.recovery,
        goal: advanceWaitlistGoal(state.goal, "OFFER_ACCEPTED", action.now)
      },
      commands: [
        {
          type: "CONFIRM_SLOT",
          idempotencyKey: `${resolved.recovery.id}:confirm:${resolved.recovery.filledByRequestId}`,
          requestId: resolved.recovery.filledByRequestId,
          slot: resolved.recovery.slot
        }
      ]
    };
  }

  const goal = advanceWaitlistGoal(state.goal, "OFFER_DECLINED", action.now);
  return {
    state: { ...state, recovery: resolved.recovery, goal },
    commands: resolved.nextOffer
      ? [
          {
            type: "SEND_SLOT_OFFER",
            idempotencyKey: `${resolved.recovery.id}:offer:${resolved.nextOffer.requestId}`,
            contactId: resolved.nextOffer.contactId,
            requestId: resolved.nextOffer.requestId,
            expiresAt: resolved.nextOffer.expiresAt
          }
        ]
      : []
  };
}
