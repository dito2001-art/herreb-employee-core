export type AppointmentStatus =
  | "PENDING"
  | "INVITED"
  | "CONFIRMED"
  | "DECLINED"
  | "CANCELLED"
  | "RESCHEDULE_REQUESTED"
  | "RESCHEDULED"
  | "NO_RESPONSE"
  | "COMPLETED"
  | "NO_SHOW";

export type WaitlistStatus =
  | "WAITING"
  | "OFFERED"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "FULFILLED"
  | "CANCELLED";

export interface TimeWindow {
  from: string;
  to: string;
}

export interface Appointment {
  id: string;
  tenantId: string;
  contactId: string;
  resourceId: string;
  serviceId?: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  channel?: "WHATSAPP" | "EMAIL" | "SMS" | "VOICE" | "IN_APP";
  externalCalendarEventId?: string;
  correlationId: string;
}

export interface WaitlistRequest {
  id: string;
  tenantId: string;
  contactId: string;
  resourceId?: string;
  serviceId?: string;
  dateFrom: string;
  dateTo: string;
  timeWindows?: TimeWindow[];
  durationMinutes: number;
  priority: number;
  status: WaitlistStatus;
  expiresAt: string;
  createdAt: string;
  correlationId: string;
}

export interface AvailableSlot {
  tenantId: string;
  resourceId: string;
  serviceId?: string;
  startsAt: string;
  endsAt: string;
}

export interface WaitlistMatch {
  request: WaitlistRequest;
  slot: AvailableSlot;
}

function instant(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validWindow(window: TimeWindow): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(window.from) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(window.to) &&
    window.from <= window.to;
}

function overlapsRequestedDate(
  request: WaitlistRequest,
  slot: AvailableSlot
): boolean {
  const start = instant(slot.startsAt);
  const from = instant(request.dateFrom);
  const to = instant(request.dateTo);
  return start !== undefined && from !== undefined && to !== undefined && start >= from && start <= to;
}

function hasRequiredDuration(
  request: WaitlistRequest,
  slot: AvailableSlot
): boolean {
  const start = instant(slot.startsAt);
  const end = instant(slot.endsAt);
  return (
    start !== undefined &&
    end !== undefined &&
    end > start &&
    Number.isFinite(request.durationMinutes) &&
    request.durationMinutes > 0 &&
    end - start >= request.durationMinutes * 60_000
  );
}

function matchesResource(
  request: WaitlistRequest,
  slot: AvailableSlot
): boolean {
  return !request.resourceId || request.resourceId === slot.resourceId;
}

function matchesService(
  request: WaitlistRequest,
  slot: AvailableSlot
): boolean {
  return !request.serviceId || request.serviceId === slot.serviceId;
}

function matchesTimeWindow(
  request: WaitlistRequest,
  slot: AvailableSlot
): boolean {
  if (!request.timeWindows?.length) return true;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(slot.startsAt)) return false;
  const hhmm = slot.startsAt.slice(11, 16);
  return request.timeWindows.some(
    (window) => validWindow(window) && hhmm >= window.from && hhmm <= window.to
  );
}

export function isWaitlistRequestEligible(
  request: WaitlistRequest,
  slot: AvailableSlot,
  now: string
): boolean {
  const expiresAt = instant(request.expiresAt);
  const nowAt = instant(now);
  return (
    request.tenantId === slot.tenantId &&
    request.status === "WAITING" &&
    expiresAt !== undefined &&
    nowAt !== undefined &&
    expiresAt > nowAt &&
    overlapsRequestedDate(request, slot) &&
    hasRequiredDuration(request, slot) &&
    matchesResource(request, slot) &&
    matchesService(request, slot) &&
    matchesTimeWindow(request, slot)
  );
}

export function matchWaitlist(
  requests: WaitlistRequest[],
  slot: AvailableSlot,
  now: string
): WaitlistMatch[] {
  return requests
    .filter((request) => isWaitlistRequestEligible(request, slot, now))
    .sort(
      (a, b) =>
        b.priority - a.priority || a.createdAt.localeCompare(b.createdAt)
    )
    .map((request) => ({ request, slot }));
}
