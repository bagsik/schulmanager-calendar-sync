import assert from "node:assert/strict";
import test from "node:test";
import { buildDesiredGoogleEvents } from "../src/google-calendar-sync.mjs";

test("keeps cancelled events that were explicitly included upstream", () => {
  const previousTemplate = process.env.GOOGLE_CALENDAR_TITLE_TEMPLATE;
  process.env.GOOGLE_CALENDAR_TITLE_TEMPLATE = "({location}) {summary}";
  let desiredEvents;
  try {
    desiredEvents = buildDesiredGoogleEvents([
      {
        uid: "2026-07-13:1:cancelled-lesson",
        date: "2026-07-13",
        startTime: "08:00",
        endTime: "08:45",
        timezone: "Europe/Berlin",
        summary: "Cancelled: Mathematics",
        location: "R101",
        cancelled: true
      }
    ]);
  } finally {
    if (previousTemplate === undefined) {
      delete process.env.GOOGLE_CALENDAR_TITLE_TEMPLATE;
    } else {
      process.env.GOOGLE_CALENDAR_TITLE_TEMPLATE = previousTemplate;
    }
  }

  assert.equal(desiredEvents.size, 1);
  assert.equal([...desiredEvents.values()][0].summary, "(R101) Cancelled: Mathematics");
});
