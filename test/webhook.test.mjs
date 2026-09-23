import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChangesReport,
  diffSchedules,
  getWebhookUrl,
  hasChanges,
  sendWebhook
} from "../src/webhook.mjs";

function event(uid, date, overrides = {}) {
  return {
    uid,
    date,
    startTime: "08:00",
    endTime: "08:45",
    summary: "M",
    location: "R1",
    status: "CONFIRMED",
    ...overrides
  };
}

test("getWebhookUrl returns null when unset and rejects non-http URLs", () => {
  assert.equal(getWebhookUrl(""), null);
  assert.equal(getWebhookUrl("  "), null);
  assert.equal(getWebhookUrl("https://hooks.example.test/x"), "https://hooks.example.test/x");
  assert.throws(() => getWebhookUrl("ftp://example.test"), /http or https/);
  assert.throws(() => getWebhookUrl("not a url"), /valid URL/);
});

test("diffSchedules returns null without a previous snapshot", () => {
  const current = { range: { start: "2026-01-05", end: "2026-01-11" }, events: [] };
  assert.equal(diffSchedules(null, current), null);
  assert.equal(diffSchedules({ generatedAt: "x" }, current), null);
});

test("diffSchedules reports added, removed and changed events", () => {
  const range = { start: "2026-01-05", end: "2026-01-11" };
  const previous = {
    range,
    events: [event("a", "2026-01-05"), event("b", "2026-01-06"), event("c", "2026-01-07")]
  };
  const current = {
    range,
    events: [
      event("a", "2026-01-05"),
      event("b", "2026-01-06", { location: "R2", summary: "Changed: M" }),
      event("d", "2026-01-08")
    ]
  };

  const changes = diffSchedules(previous, current);

  assert.deepEqual(changes.added.map((e) => e.uid), ["d"]);
  assert.deepEqual(changes.removed.map((e) => e.uid), ["c"]);
  assert.equal(changes.changed.length, 1);
  assert.equal(changes.changed[0].uid, "b");
  assert.deepEqual(changes.changed[0].fields, ["location", "summary"]);
  assert.equal(changes.changed[0].before.location, "R1");
  assert.equal(changes.changed[0].after.location, "R2");
});

test("diffSchedules ignores days that only moved in or out of the sync window", () => {
  const previous = {
    range: { start: "2026-01-05", end: "2026-01-18" },
    events: [event("old", "2026-01-05"), event("same", "2026-01-12")]
  };
  const current = {
    range: { start: "2026-01-12", end: "2026-01-25" },
    events: [event("same", "2026-01-12"), event("new", "2026-01-19")]
  };

  const changes = diffSchedules(previous, current);

  assert.deepEqual(changes.comparedRange, { start: "2026-01-12", end: "2026-01-18" });
  assert.deepEqual([changes.added, changes.removed, changes.changed], [[], [], []]);
});

test("buildChangesReport bundles counts and metadata", () => {
  const changes = {
    comparedRange: { start: "2026-01-05", end: "2026-01-11" },
    added: [event("a", "2026-01-05")],
    removed: [],
    changed: []
  };
  const report = buildChangesReport({
    changes,
    previousGeneratedAt: "2026-01-05T07:00:00.000Z",
    generatedAt: "2026-01-05T07:30:00.000Z",
    timezone: "Europe/Berlin"
  });

  assert.equal(report.type, "schulmanager.schedule.changed");
  assert.equal(report.baseline, true);
  assert.deepEqual(report.counts, { added: 1, removed: 0, changed: 0 });
  assert.equal(report.added[0].uid, "a");
  assert.ok(hasChanges(report));
});

test("buildChangesReport without a baseline has no changes", () => {
  const report = buildChangesReport({
    changes: null,
    previousGeneratedAt: null,
    generatedAt: "2026-01-05T07:30:00.000Z",
    timezone: "Europe/Berlin"
  });

  assert.equal(report.baseline, false);
  assert.equal(report.comparedRange, null);
  assert.deepEqual(report.counts, { added: 0, removed: 0, changed: 0 });
  assert.equal(hasChanges(report), false);
});

test("sendWebhook posts JSON and hides URL and body on failure", async () => {
  const calls = [];
  const okFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 204 };
  };

  const result = await sendWebhook({
    url: "https://hooks.example.test/secret-token",
    payload: { hello: "world" },
    fetchImpl: okFetch
  });

  assert.deepEqual(result, { status: 204 });
  assert.equal(calls[0].options.method, "POST");
  assert.match(calls[0].options.headers["content-type"], /application\/json/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { hello: "world" });

  const failingFetch = async () => ({ ok: false, status: 500, text: async () => "secret body" });
  await assert.rejects(
    sendWebhook({ url: "https://hooks.example.test/secret-token", payload: {}, fetchImpl: failingFetch }),
    (error) => {
      assert.equal(error.status, 500);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    }
  );
});

test("documented changes.json example matches the generated report", async () => {
  const { readFile } = await import("node:fs/promises");
  const example = JSON.parse(
    await readFile(new URL("../docs/examples/changes.example.json", import.meta.url), "utf8")
  );
  const range = example.comparedRange;
  const previous = {
    generatedAt: example.previousGeneratedAt,
    range,
    events: [...example.removed, ...example.changed.map((c) => c.before)]
  };
  const current = {
    range,
    events: [...example.added, ...example.changed.map((c) => c.after)]
  };

  const report = buildChangesReport({
    changes: diffSchedules(previous, current),
    previousGeneratedAt: example.previousGeneratedAt,
    generatedAt: example.generatedAt,
    timezone: example.timezone
  });

  assert.deepEqual(report, example);
});
