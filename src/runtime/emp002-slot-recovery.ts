import {
  matchWaitlist,
  type AvailableSlot,
  type WaitlistRequest
} from "./emp002-scheduling";

export type SlotRecoveryStatus =
  | "OPEN"
  | "OFFER_PENDING"
  | "FILLED"
  | "EXHAUSTED";

export interface SlotOffer {
  requestId: string;
  contactId: string;
  offeredAt: string;
  expiresAt: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
}

export interface SlotRecovery {
  tenantId: string;
  correlationId: string;
  slot: AvailableSlot;
  status: SlotRecoveryStatus;
  candidateRequestIds: string[];
  offers: SlotOffer[];
  filledByRequestId?: string;
}

export interface RecoveryDecision {
  recovery: SlotRecovery;
  nextOffer?: SlotOffer;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

export function startSlotRecovery(input: {
  tenantId: string;
  correlationId: string;
  slot: AvailableSlot;
  requests: WaitlistRequest[];
  now: string;
  offerTtlMinutes?: number;
}): RecoveryDecision {
  const candidates = matchWaitlist(
    input.requests,
    input.slot,
    input.now
  ).filter((match) => match.request.tenantId === input.tenantId);
  const recovery: SlotRecovery = {
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    slot: input.slot,
    status: candidates.length ? "OPEN" : "EXHAUSTED",
    candidateRequestIds: candidates.map((candidate) => candidate.request.id),
    offers: []
  };
  if (!candidates.length) return { recovery };
  return offerNext(
    recovery,
    input.requests,
    input.now,
    input.offerTtlMinutes ?? 15
  );
}

export function offerNext(
  recovery: SlotRecovery,
  requests: WaitlistRequest[],
  now: string,
  offerTtlMinutes = 15
): RecoveryDecision {
  if (recovery.status === "FILLED") return { recovery };
  const alreadyOffered = new Set(
    recovery.offers.map((offer) => offer.requestId)
  );
  const nextId = recovery.candidateRequestIds.find(
    (id) => !alreadyOffered.has(id)
  );
  if (!nextId) return { recovery: { ...recovery, status: "EXHAUSTED" } };
  const request = requests.find(
    (candidate) =>
      candidate.id === nextId && candidate.tenantId === recovery.tenantId
  );
  if (!request) {
    return offerNext(
      {
        ...recovery,
        candidateRequestIds: recovery.candidateRequestIds.filter(
          (id) => id !== nextId
        )
      },
      requests,
      now,
      offerTtlMinutes
    );
  }
  const nextOffer: SlotOffer = {
    requestId: request.id,
    contactId: request.contactId,
    offeredAt: now,
    expiresAt: addMinutes(now, offerTtlMinutes),
    status: "PENDING"
  };
  return {
    recovery: {
      ...recovery,
      status: "OFFER_PENDING",
      offers: [...recovery.offers, nextOffer]
    },
    nextOffer
  };
}

export function resolveCurrentOffer(input: {
  recovery: SlotRecovery;
  requests: WaitlistRequest[];
  now: string;
  response: "ACCEPT" | "DECLINE" | "TIMEOUT";
  offerTtlMinutes?: number;
}): RecoveryDecision {
  const offers = [...input.recovery.offers];
  let index = -1;
  for (let candidate = offers.length - 1; candidate >= 0; candidate -= 1) {
    if (offers[candidate].status === "PENDING") {
      index = candidate;
      break;
    }
  }
  if (index < 0) return { recovery: input.recovery };
  const current = offers[index];
  const expired =
    input.response === "TIMEOUT" || current.expiresAt <= input.now;
  if (input.response === "ACCEPT" && !expired) {
    offers[index] = { ...current, status: "ACCEPTED" };
    return {
      recovery: {
        ...input.recovery,
        offers,
        status: "FILLED",
        filledByRequestId: current.requestId
      }
    };
  }
  offers[index] = { ...current, status: expired ? "EXPIRED" : "DECLINED" };
  return offerNext(
    { ...input.recovery, offers, status: "OPEN" },
    input.requests,
    input.now,
    input.offerTtlMinutes ?? 15
  );
}
