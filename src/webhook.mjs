const REQUEST_TIMEOUT_MS = 10000;

export function getWebhookUrl(value = process.env.SYNC_WEBHOOK_URL) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("SYNC_WEBHOOK_URL must be a valid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("SYNC_WEBHOOK_URL must use http or https.");
  }
  return url.toString();
}

// Compares two schedule snapshots. Only the date range covered by both runs is
// compared, so days that merely enter or leave the rolling sync window are not
// reported as added or removed.
export function diffSchedules(previous, current) {
  if (!previous?.range || !Array.isArray(previous.events)) {
    return null;
  }

  const range = {
    start: maxDate(previous.range.start, current.range.start),
    end: minDate(previous.range.end, current.range.end)
  };
  const inRange = (event) => event.date >= range.start && event.date <= range.end;

  const before = new Map(previous.events.filter(inRange).map((e) => [e.uid, e]));
  const after = new Map(current.events.filter(inRange).map((e) => [e.uid, e]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [uid, event] of after) {
    const old = before.get(uid);
    if (!old) {
      added.push(event);
      continue;
    }
    const fields = changedFields(old, event);
    if (fields.length) {
      changed.push({ uid, fields, before: old, after: event });
    }
  }
  for (const [uid, event] of before) {
    if (!after.has(uid)) {
      removed.push(event);
    }
  }

  return { comparedRange: range, ...dropReissuedEvents(added, removed), changed };
}

// Schulmanager sometimes re-creates an entry with a new source ID but identical
// content, which changes its uid. Such removed/added pairs are not reported.
function dropReissuedEvents(added, removed) {
  const unmatched = new Map();
  for (const event of removed) {
    const key = contentKey(event);
    unmatched.set(key, [...(unmatched.get(key) ?? []), event]);
  }

  const remainingAdded = [];
  const reissued = new Set();
  for (const event of added) {
    const candidates = unmatched.get(contentKey(event));
    if (candidates?.length) {
      reissued.add(candidates.shift());
    } else {
      remainingAdded.push(event);
    }
  }

  return {
    added: remainingAdded,
    removed: removed.filter((event) => !reissued.has(event))
  };
}

function contentKey(event) {
  return JSON.stringify(
    Object.keys(event)
      .filter((key) => key !== "uid")
      .sort()
      .map((key) => [key, event[key]])
  );
}

export function hasChanges(report) {
  return Boolean(
    report && (report.counts.added || report.counts.removed || report.counts.changed)
  );
}

// Bundles all changes of one sync run. Written to changes.json on every run and
// sent unchanged to the webhook. Without a previous snapshot `baseline` is
// false and all lists are empty.
export function buildChangesReport({ changes, previousGeneratedAt, generatedAt, timezone }) {
  const added = changes?.added ?? [];
  const removed = changes?.removed ?? [];
  const changed = changes?.changed ?? [];
  return {
    type: "schulmanager.schedule.changed",
    generatedAt,
    previousGeneratedAt,
    timezone,
    baseline: Boolean(changes),
    comparedRange: changes?.comparedRange ?? null,
    counts: {
      added: added.length,
      removed: removed.length,
      changed: changed.length
    },
    added,
    removed,
    changed
  };
}

export async function sendWebhook({ url, payload, fetchImpl = fetch }) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "user-agent": "schulmanager-calendar-sync"
    },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    // Never include the URL or response body: both may contain secrets.
    const error = new Error("Webhook delivery failed.");
    error.status = response.status;
    throw error;
  }
  return { status: response.status };
}

function changedFields(left, right) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys]
    .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort();
}

function maxDate(left, right) {
  return left > right ? left : right;
}

function minDate(left, right) {
  return left < right ? left : right;
}
