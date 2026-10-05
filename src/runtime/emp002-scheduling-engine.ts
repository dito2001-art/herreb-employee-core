export interface EMP002ServiceConfig {
  serviceId: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
}

export interface EMP002WorkingWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface EMP002SchedulingConfig {
  tenantId: string;
  timezone: string;
  slotIntervalMinutes: number;
  services: EMP002ServiceConfig[];
  workingWindows: EMP002WorkingWindow[];
}

export interface EMP002BusyPeriod {
  start: string;
  end: string;
}

export interface EMP002AvailableSlot {
  start: string;
  end: string;
}

function overlaps(start: number, end: number, busy: EMP002BusyPeriod): boolean {
  return start < Date.parse(busy.end) && end > Date.parse(busy.start);
}

export function findEMP002AvailableSlots(
  config: EMP002SchedulingConfig,
  serviceId: string,
  dayStart: string,
  busy: EMP002BusyPeriod[],
): EMP002AvailableSlot[] {
  const service = config.services.find((item) => item.serviceId === serviceId);
  if (!service) throw new Error('EMP002_SERVICE_NOT_CONFIGURED');
  const base = new Date(dayStart);
  if (!Number.isFinite(base.getTime())) throw new Error('EMP002_INVALID_DAY_START');
  const window = config.workingWindows.find((item) => item.weekday === base.getUTCDay());
  if (!window) return [];

  const before = service.bufferBeforeMinutes ?? 0;
  const after = service.bufferAfterMinutes ?? 0;
  const interval = Math.max(1, config.slotIntervalMinutes);
  const results: EMP002AvailableSlot[] = [];
  const dayMs = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());

  for (let minute = window.startMinute; minute + service.durationMinutes <= window.endMinute; minute += interval) {
    const start = dayMs + minute * 60_000;
    const end = start + service.durationMinutes * 60_000;
    const occupiedStart = start - before * 60_000;
    const occupiedEnd = end + after * 60_000;
    if (busy.some((period) => overlaps(occupiedStart, occupiedEnd, period))) continue;
    results.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
  }
  return results;
}
