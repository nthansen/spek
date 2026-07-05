import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChangeInfo } from "@spek/core";
import { groupChangesBySlug, furthestTaskStats } from "./changeGroups.js";

function mk(slug: string, completed: number | null, branch: string): ChangeInfo {
  return {
    slug,
    date: null,
    timestamp: null,
    createdDate: null,
    archivedDate: null,
    description: slug.replace(/-/g, " "),
    status: "active",
    hasProposal: true,
    hasDesign: false,
    hasTasks: completed !== null,
    hasSpecs: false,
    artifactCount: 1,
    schema: "spec-driven",
    taskStats: completed === null ? null : { total: 4, completed },
    source: { key: branch, path: `/wt/${branch}`, branch, isMain: branch === "main" },
    worktrees: [{ key: branch, path: `/wt/${branch}`, branch, isMain: branch === "main" }],
  };
}

test("groupChangesBySlug: groups variants by slug; furthest-along variant on top", () => {
  const groups = groupChangesBySlug([
    mk("add-login", 2, "main"), // less progressed, listed first in input
    mk("add-login", 3, "feat"), // furthest
    mk("add-logout", 1, "feat"),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.slug), ["add-login", "add-logout"]);
  assert.equal(groups[0].variants.length, 2, "add-login has two variants");
  assert.equal(groups[0].variants[0].source?.branch, "feat", "furthest (feat 3/4) is on top");
  assert.equal(groups[0].variants[1].source?.branch, "main");
  assert.equal(groups[1].variants.length, 1, "add-logout has one variant");
});

test("groupChangesBySlug: equal-progress variants keep input (recency) order", () => {
  const groups = groupChangesBySlug([mk("x", 2, "main"), mk("x", 2, "feat")]);
  assert.deepEqual(
    groups[0].variants.map((v) => v.source?.branch),
    ["main", "feat"],
    "stable order on ties",
  );
});

test("groupChangesBySlug: furthest header reflects the most-progressed variant", () => {
  const groups = groupChangesBySlug([mk("x", 2, "main"), mk("x", 3, "feat")]);
  assert.equal(groups[0].furthest?.completed, 3, "furthest = feat's 3");
});

test("furthestTaskStats: ignores variants without tasks, null when none have tasks", () => {
  assert.equal(furthestTaskStats([mk("x", null, "main"), mk("x", 1, "feat")])?.completed, 1);
  assert.equal(furthestTaskStats([mk("x", null, "main")]), null);
});

test("groupChangesBySlug: single variant stays a one-entry group", () => {
  const groups = groupChangesBySlug([mk("solo", 0, "feat")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].variants.length, 1);
});
