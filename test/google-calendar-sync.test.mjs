import assert from "node:assert/strict";
import test from "node:test";
import { renderEventTitle, strikethroughTitle } from "../src/google-calendar-sync.mjs";

const baseEvent = {
  summary: "Changed: Math",
  location: "Room 204",
  subjectLabel: "Math",
  subjectName: "Mathematics",
  teacherNames: ["JD (Jane Doe)", "AB (Alan Brown)"],
  classHourNumber: "3"
};

test("renderEventTitle applies the default title format", () => {
  const title = renderEventTitle("({location}) {summary}", baseEvent);
  assert.equal(title, "(Room 204) Changed: Math");
});

test("renderEventTitle drops an empty location's parentheses", () => {
  const title = renderEventTitle("({location}) {summary}", { ...baseEvent, location: "" });
  assert.equal(title, "Changed: Math");
});

test("renderEventTitle supports custom placeholder combinations", () => {
  const title = renderEventTitle("{subject} - {location} ({teachers})", baseEvent);
  assert.equal(title, "Math - Room 204 (Jane Doe, Alan Brown)");
});

test("renderEventTitle falls back to the raw teacher entry without a full name", () => {
  const title = renderEventTitle("{teachers}", { ...baseEvent, teacherNames: ["JD"] });
  assert.equal(title, "JD");
});

test("renderEventTitle leaves unknown placeholders untouched", () => {
  const title = renderEventTitle("{unknown}-{subject}", baseEvent);
  assert.equal(title, "{unknown}-Math");
});

test("renderEventTitle resolves {icon} from the subject name", () => {
  const title = renderEventTitle("{icon} {subject}", baseEvent);
  assert.equal(title, "➗ Math");
});

test("renderEventTitle drops the {icon} placeholder when no icon matches", () => {
  const title = renderEventTitle("{icon} {subject}", {
    ...baseEvent,
    subjectName: "Unknown Course",
    subjectLabel: "XYZ"
  });
  assert.equal(title, "XYZ");
});

test("strikethroughTitle overlays every character with a combining stroke", () => {
  assert.equal(strikethroughTitle("NW"), "N̶W̶");
});

test("strikethroughTitle keeps a multi-codepoint flag emoji intact as one grapheme", () => {
  assert.equal(strikethroughTitle("🇬🇧 Englisch"), "🇬🇧̶ ̶E̶n̶g̶l̶i̶s̶c̶h̶");
});
