import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileSelection,
  changeMatchesSelection,
  toggleWorktree,
  getWorktreeSelection,
  setWorktreeSelection,
} from "./worktreeFilter.js";

// --- reconcileSelection ---

test("reconcileSelection: null stays All", () => {
  assert.equal(reconcileSelection(null, ["a", "b"]), null);
});

test("reconcileSelection: drops keys that no longer exist", () => {
  assert.deepEqual(reconcileSelection(["a", "gone"], ["a", "b"]), ["a"]);
});

test("reconcileSelection: empty after dropping falls back to All", () => {
  assert.equal(reconcileSelection(["gone"], ["a", "b"]), null);
});

test("reconcileSelection: selecting every worktree normalizes to All", () => {
  assert.equal(reconcileSelection(["a", "b"], ["a", "b"]), null);
});

// --- changeMatchesSelection ---

test("changeMatchesSelection: All matches everything", () => {
  assert.equal(changeMatchesSelection(["a"], null), true);
});

test("changeMatchesSelection: membership intersecting selection matches", () => {
  assert.equal(changeMatchesSelection(["a", "b"], ["b"]), true);
});

test("changeMatchesSelection: no intersection does not match", () => {
  assert.equal(changeMatchesSelection(["a"], ["b"]), false);
});

// --- toggleWorktree ---

test("toggleWorktree: from All, clicking one focuses just it", () => {
  assert.deepEqual(toggleWorktree(null, "a", ["a", "b", "c"]), ["a"]);
});

test("toggleWorktree: adding the rest of a subset returns to All", () => {
  assert.equal(toggleWorktree(["a"], "b", ["a", "b"]), null);
});

test("toggleWorktree: clicking the focused worktree again clears to All", () => {
  assert.equal(toggleWorktree(["a"], "a", ["a", "b"]), null);
});

test("toggleWorktree: turning one off from a subset removes it", () => {
  assert.deepEqual(toggleWorktree(["a", "b"], "b", ["a", "b", "c"]), ["a"]);
});

// --- get/set persistence (localStorage stub) ---

test("getWorktreeSelection/setWorktreeSelection: round-trips per repo", () => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  try {
    assert.equal(getWorktreeSelection("/repo"), null);
    setWorktreeSelection("/repo", ["a", "b"]);
    assert.deepEqual(getWorktreeSelection("/repo"), ["a", "b"]);
    setWorktreeSelection("/repo", null); // All → removed
    assert.equal(getWorktreeSelection("/repo"), null);
    // 儲存的空陣列視為 All（null），而非回傳空陣列
    store.set("spek:worktree-filter:/repo", "[]");
    assert.equal(getWorktreeSelection("/repo"), null);
    // 非陣列 JSON 也視為 All
    store.set("spek:worktree-filter:/repo", "\"x\"");
    assert.equal(getWorktreeSelection("/repo"), null);
  } finally {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  }
});
