import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { writePrivateJson, persistSyncSnapshot } from "../src/sync.mjs";

test("writePrivateJson creates and tightens private runtime files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "private-json-"));
  const filePath = path.join(dir, "status.json");
  try {
    await writeFile(filePath, "{}", { mode: 0o644 });
    if (process.platform !== "win32") {
      await chmod(filePath, 0o644);
    }

    await writePrivateJson(filePath, { ok: true });

    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), { ok: true });
    if (process.platform !== "win32") {
      assert.equal((await stat(filePath)).mode & 0o777, 0o600);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a schedule-write failure keeps the previous schedule and status", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "schedule-persistence-"));
  const schedulePath = path.join(dir, "schedule.json");
  const previous = { generatedAt: "before", events: [{ uid: "old" }] };
  const statusPath = path.join(dir, "status.json");
  const changesPath = path.join(dir, "changes.json");
  const previousChanges = { generatedAt: "before", counts: { added: 0 } };
  try {
    await writePrivateJson(schedulePath, previous);
    await writePrivateJson(statusPath, { generatedAt: "before", ok: true });
    await writePrivateJson(changesPath, previousChanges);
    const writeJson = async (filePath, value) => {
      if (path.basename(filePath) === "schedule.json" && value.generatedAt === "after") {
        throw new Error("disk write failed");
      }
      await writePrivateJson(filePath, value);
    };
    await assert.rejects(
      persistSyncSnapshot({
        dataDir: dir,
        payload: { generatedAt: "after", range: { start: "2026-09-21", end: "2026-10-11" }, events: [] },
        changes: { counts: { added: 1, removed: 0, changed: 0 } },
        writeJson
      }),
      /disk write failed/
    );
    assert.deepEqual(JSON.parse(await readFile(schedulePath, "utf8")), previous);
    assert.deepEqual(JSON.parse(await readFile(statusPath, "utf8")), { generatedAt: "before", ok: true });
    assert.deepEqual(JSON.parse(await readFile(changesPath, "utf8")), previousChanges);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("status-write failure after the snapshot does not suppress a webhook report", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "status-failure-"));
  const payload = {
    generatedAt: "after",
    range: { start: "2026-09-21", end: "2026-10-11" },
    events: [{ uid: "new" }]
  };
  try {
    await persistSyncSnapshot({
      dataDir: dir,
      payload,
      changes: { counts: { added: 1, removed: 0, changed: 0 } },
      writeJson: async (filePath, value) => {
        if (path.basename(filePath) === "status.json") {
          throw new Error("status unavailable");
        }
        await writePrivateJson(filePath, value);
      },
      logger: { warn() {} }
    });
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, "schedule.json"), "utf8")), payload);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a failed private JSON write never replaces a valid schedule", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "atomic-schedule-"));
  const schedulePath = path.join(dir, "schedule.json");
  try {
    await writePrivateJson(schedulePath, { events: [{ uid: "old" }] });
    await assert.rejects(
      writePrivateJson(schedulePath, { events: [{ uid: "new" }] }, {
        writeFileImpl: async (filePath) => {
          await writeFile(filePath, '{"events":', { mode: 0o600 });
          throw new Error("disk write interrupted");
        }
      }),
      /disk write interrupted/
    );
    assert.deepEqual(JSON.parse(await readFile(schedulePath, "utf8")), { events: [{ uid: "old" }] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
