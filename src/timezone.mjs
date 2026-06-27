export function zonedDateTimeToUtcDate(date, time, timeZone = "Europe/Berlin") {
  const target = parseLocalDateTime(date, time);
  const targetUtcMs = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second
  );

  let utcMs = targetUtcMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(utcMs), timeZone);
    const actualUtcMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const delta = targetUtcMs - actualUtcMs;
    if (delta === 0) {
      break;
    }
    utcMs += delta;
  }

  return new Date(utcMs);
}

export function utcIcsDateTime(date, time, timeZone = "Europe/Berlin") {
  return zonedDateTimeToUtcDate(date, time, timeZone)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function rfc3339WithOffset(date, time, timeZone = "Europe/Berlin") {
  const normalizedTime = normalizeTime(time);
  const utcDate = zonedDateTimeToUtcDate(date, normalizedTime, timeZone);
  const offsetMinutes = timeZoneOffsetMinutes(utcDate, timeZone);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${date}T${normalizedTime}${sign}${hours}:${minutes}`;
}

function timeZoneOffsetMinutes(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  const localUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return Math.round((localUtcMs - date.getTime()) / 60000);
}

function parseLocalDateTime(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = normalizeTime(time).split(":").map(Number);
  return { year, month, day, hour, minute, second };
}

function normalizeTime(time) {
  const [hour = "00", minute = "00", second = "00"] = String(time).split(":");
  return [hour, minute, second].map((part) => part.padStart(2, "0")).join(":");
}

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}
