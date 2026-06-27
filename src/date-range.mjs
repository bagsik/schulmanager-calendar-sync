export function resolveSyncRange({
  timezone = "Europe/Berlin",
  pastWeeks = 2,
  futureWeeks = 2,
  today = new Date()
} = {}) {
  const currentDate = isoDateInTimeZone(today, timezone);
  const currentWeekStart = startOfWeek(currentDate);
  const start = addDays(currentWeekStart, -7 * Number(pastWeeks));
  const end = addDays(currentWeekStart, 7 * (Number(futureWeeks) + 1) - 1);

  return { start, end };
}

export function isoDateInTimeZone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function startOfWeek(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const mondayBased = (day + 6) % 7;
  return addDays(date, -mondayBased);
}

export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
