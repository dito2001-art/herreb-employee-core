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
  resourceId: string;
  serviceId?: string;
  startsAt: string;
  endsAt: string;
}

export interface WaitlistMatch {
  request: WaitlistRequest;
  slot: AvailableSlot;
}

function overlapsRequestedDate(request: WaitlistRequest, slot: AvailableSlot): boolean {
  return slot.startsAt >= request.dateFrom && slot.startsAt <= request.dateTo;
}

function hasRequiredDuration(request: WaitlistRequest, slot: AvailableSlot): boolean {
  const start = Date.parse(slot.startsAt);
  const end = Date.parse(slot.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && end - start >= request.durationMinutes * 60_000;
}

function matchesResource(request: WaitlistRequest, slot: AvailableSlot): boolean {
  return !request.resourceId || request.resourceId === slot.resourceId;
}

function matchesService(request: WaitlistRequest, slot: AvailableSlot): boolean {
  return !request.serviceId || request.serviceId === slot.serviceId;
}

function matchesTimeWindow(request: WaitlistRequest, slot: AvailableSlot): boolean {
  if (!request.timeWindows?.length) return true;
  const hhmm = slot.startsAt.slice(11, 16);
  return request.timeWindows.some((window) => hhmm >= window.from && hhmm <= window.to);
}

export function isWaitlistRequestEligible(
  request: WaitlistRequest,
  slot: AvailableSlot,
  now: string
): boolean {
  return (
    request.status === "WAITING" &&
    request.expiresAt > now &&
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
    .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))
    .map((request) => ({ request, slot }));
}
