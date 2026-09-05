import assert from "node:assert/strict";
import test from "node:test";
import {
  SchulmanagerApi,
  extractBundleVersion,
  extractImportedScriptUrls
} from "../src/schulmanager-api.mjs";

function fakeFetch(user) {
  return async () =>
    new Response(JSON.stringify({ isAuthenticated: true, user }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
}

test("extractBundleVersion resolves the referenced build identifier", () => {
  const source = 'const buildId="abcDEF_123"; const config={bundleVersion:buildId};';
  assert.equal(extractBundleVersion(source), "abcDEF_123");
});

test("extractImportedScriptUrls resolves relative static and dynamic imports", () => {
  const urls = extractImportedScriptUrls(
    'import value from "./chunk-a.js"; import("/assets/chunk-b.js");',
    "https://example.test/assets/main.js"
  );
  assert.deepEqual(urls, [
    "https://example.test/assets/chunk-a.js",
    "https://example.test/assets/chunk-b.js"
  ]);
});

test("getCurrentStudent returns the directly associated student", async () => {
  const api = new SchulmanagerApi({
    token: "test-token",
    fetchImpl: fakeFetch({ associatedStudent: { id: 42 } })
  });
  assert.deepEqual(await api.getCurrentStudent(), { id: 42 });
});

test("getCurrentStudent falls back to the first child of a parent account", async () => {
  const api = new SchulmanagerApi({
    token: "test-token",
    fetchImpl: fakeFetch({
      associatedStudent: null,
      associatedParents: [{ id: 1, student: { id: 7 } }, { id: 2, student: { id: 8 } }]
    })
  });
  assert.deepEqual(await api.getCurrentStudent(), { id: 7 });
});

test("getCurrentStudent lets SCHULMANAGER_STUDENT_ID select a specific child", async () => {
  const api = new SchulmanagerApi({
    token: "test-token",
    fetchImpl: fakeFetch({
      associatedStudent: null,
      associatedParents: [{ id: 1, student: { id: 7 } }, { id: 2, student: { id: 8 } }]
    })
  });
  process.env.SCHULMANAGER_STUDENT_ID = "8";
  try {
    assert.deepEqual(await api.getCurrentStudent(), { id: 8 });
  } finally {
    delete process.env.SCHULMANAGER_STUDENT_ID;
  }
});

test("getCurrentStudent falls back to SCHULMANAGER_STUDENT_ID when discovery fails", async () => {
  const api = new SchulmanagerApi({
    token: "test-token",
    fetchImpl: fakeFetch({ associatedStudent: null })
  });
  process.env.SCHULMANAGER_STUDENT_ID = "99";
  try {
    assert.deepEqual(await api.getCurrentStudent(), { id: 99 });
  } finally {
    delete process.env.SCHULMANAGER_STUDENT_ID;
  }
});
