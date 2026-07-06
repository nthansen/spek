import { test } from "node:test";
import assert from "node:assert/strict";
import { getCached, setCached, clearCache, initialFetchState } from "./fetchCache.js";

test("getCached/setCached: round-trips by key, undefined key is a no-op", () => {
  clearCache();
  setCached("changes:repoA:true", [1, 2, 3]);
  assert.deepEqual(getCached("changes:repoA:true"), [1, 2, 3]);
  assert.equal(getCached("changes:repoB:true"), undefined);
  setCached(undefined, [9]); // no-op
  assert.equal(getCached(undefined), undefined);
});

test("initialFetchState: cached → data present, not loading (SWR, no flash)", () => {
  assert.deepEqual(initialFetchState([1], true), { data: [1], loading: false, error: null });
});

test("initialFetchState: no cache but has fetcher → loading (first visit flashes once)", () => {
  assert.deepEqual(initialFetchState(undefined, true), { data: null, loading: true, error: null });
});

test("initialFetchState: no fetcher → idle", () => {
  assert.deepEqual(initialFetchState(undefined, false), { data: null, loading: false, error: null });
});

test("initialFetchState: cached falsy value (empty array) still counts as cached", () => {
  assert.deepEqual(initialFetchState([], true), { data: [], loading: false, error: null });
});
