import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorktreeSource } from "@spek/core";
import { worktreeChipsToShow } from "./worktreeChips.js";

const main: WorktreeSource = { key: "aaa", path: "/repo", branch: "main", isMain: true };
const wtA: WorktreeSource = { key: "bbb", path: "/repo-a", branch: "feature-a", isMain: false };

test("empty membership → null", () => {
  assert.equal(worktreeChipsToShow([], { hideLoneMain: true }), null);
  assert.equal(worktreeChipsToShow([], { hideLoneMain: false }), null);
});

test("standalone lone-main change is suppressed (low noise)", () => {
  assert.equal(worktreeChipsToShow([main], { hideLoneMain: true }), null);
});

test("variant-row lone-main change is still labeled", () => {
  // 群組變體列：只屬主 worktree 的分歧變體仍要標示，否則整列無 worktree 標籤
  assert.deepEqual(worktreeChipsToShow([main], { hideLoneMain: false }), [main]);
});

test("lone non-main change always shows its chip", () => {
  assert.deepEqual(worktreeChipsToShow([wtA], { hideLoneMain: true }), [wtA]);
  assert.deepEqual(worktreeChipsToShow([wtA], { hideLoneMain: false }), [wtA]);
});

test("multi-member membership shows all chips (incl. main)", () => {
  assert.deepEqual(worktreeChipsToShow([main, wtA], { hideLoneMain: true }), [main, wtA]);
});
