import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { compareEvents, normalizeScheduleEvents } from "./schedule-events.mjs";
import { normalizeExamEvents } from "./exam-events.mjs";
import { SchulmanagerApi } from "./schulmanager-api.mjs";
import { resolveSyncRange } from "./date-range.mjs";
import { TokenStore } from "./token-store.mjs";
import { buildChangesReport, diffSchedules } from "./webhook.mjs";

export async function syncSchedule({
  dataDir = process.env.DATA_DIR || "/data",
  timezone = process.env.SCHULMANAGER_TIMEZONE || "Europe/Berlin",
  pastWeeks = Number(process.env.SYNC_PAST_WEEKS || 2),
  futureWeeks = Number(process.env.SYNC_FUTURE_WEEKS || 2),
  includeCancelled = envFlag("SYNC_INCLUDE_CANCELLED"),
  mergeAdjacent = !envFlag("SYNC_NO_MERGE_ADJACENT"),
  includeExams = envFlag("SYNC_EXAMS_ENABLED")
} = {}) {
  await mkdir(dataDir, { recursive: true });

  const tokenStore = new TokenStore(path.join(dataDir, "token-store.json"));
  const token = (await tokenStore.readToken()) || process.env.SCHULMANAGER_TOKEN;
  const api = new SchulmanagerApi({
    token,
    onNewToken: (newToken) => tokenStore.writeToken(newToken)
  });

  const student = await api.getCurrentStudent();
  const range = resolveSyncRange({ timezone, pastWeeks, futureWeeks });
  const { lessons, classHours } = await api.getSchedule({
    ...range,
    student
  });

  const scheduleEvents = normalizeScheduleEvents({
    lessons,
    classHours,
    timezone,
    includeCancelled,
    mergeAdjacent
  });

  let events = scheduleEvents;
  if (includeExams) {
    const exams = await api.getExams({ ...range, student });
    const examEvents = normalizeExamEvents({ exams, timezone });
    events = [...scheduleEvents, ...examEvents].sort(compareEvents);
  }

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    timezone,
    range,
    eventCount: events.length,
    events
  };

  const schedulePath = path.join(dataDir, "schedule.json");
  const previous = await readPreviousSchedule(schedulePath);
  const changes = buildChangesReport({
    changes: diffSchedules(previous, payload),
    previousGeneratedAt: previous?.generatedAt ?? null,
    generatedAt,
    timezone
  });

  await writePrivateJson(schedulePath, payload);
  await writePrivateJson(path.join(dataDir, "changes.json"), changes);
  await writePrivateJson(
    path.join(dataDir, "status.json"),
    { ok: true, generatedAt, range, eventCount: events.length }
  );

  return { ...payload, changes };
}

async function readPreviousSchedule(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    // A missing or unreadable snapshot means there is no baseline to diff.
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

export async function writePrivateJson(filePath, value) {
  try {
    await chmod(filePath, 0o600);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  await writeFile(filePath, JSON.stringify(value, null, 2), {
    encoding: "utf8",
    mode: 0o600
  });
  await chmod(filePath, 0o600);
}

function envFlag(name) {
  return ["1", "true", "yes", "on"].includes(
    String(process.env[name] || "").toLowerCase()
  );
}
