export const WORKFORCE_TIMEZONE = "America/Asuncion";

/** datetime-local fields always represent the business timezone, not the device. */
export function workforceLocalTime(value: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WORKFORCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function workforceInstant(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw Error("Indicá una fecha y hora válidas de Asunción.");
  const wall = Date.parse(local + ":00Z");
  if (
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, 16) !== local
  )
    throw Error("Indicá una fecha y hora válidas de Asunción.");
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const rendered = Date.parse(workforceLocalTime(new Date(instant)) + ":00Z");
    instant += wall - rendered;
  }
  if (workforceLocalTime(new Date(instant)) !== local)
    throw Error("Esa hora no existe en la zona de Asunción.");
  return new Date(instant).toISOString();
}

export function workforceCalendarWindow(date: string) {
  const from = workforceInstant(date + "T00:00");
  const next = new Date(date + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 31);
  return {
    from,
    to: workforceInstant(next.toISOString().slice(0, 10) + "T00:00")
  };
}

/** Owner command wall times have no offset; explicit instants retain theirs. */
export function workforceCommandInstant(value: string): string {
  const local = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::([0-5]\d))?$/);
  if (local)
    return new Date(
      Date.parse(workforceInstant(local[1])) + Number(local[2] ?? 0) * 1000
    ).toISOString();
  if (
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw Error("Indicá una fecha y hora válidas de Asunción.");
  return new Date(value).toISOString();
}
