import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverArtifacts, countArtifacts } from "./artifacts.js";
import type { SchemaArtifactRef, SchemaOrderProvider } from "./schema-order.js";

function mkRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spek-artifacts-test-"));
}

function writeChange(repo: string, slug: string, files: Record<string, string>): string {
  const changePath = path.join(repo, "openspec", "changes", slug);
  fs.mkdirSync(changePath, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(changePath, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return changePath;
}

// 永遠回 null 的 provider（模擬 openspec CLI 不可用）
const noOrder: SchemaOrderProvider = () => null;

// 回固定順序的 provider（模擬 openspec CLI 權威順序）
function orderOf(refs: SchemaArtifactRef[]): SchemaOrderProvider {
  return () => refs;
}

test("discoverArtifacts: without an order provider, uses default order", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "add-foo", {
    "proposal.md": "## Why\n",
    "design.md": "## Context\n",
    "tasks.md": "## 1. Group\n\n- [x] 1.1 done\n- [ ] 1.2 todo\n",
    "specs/foo/spec.md": "## ADDED Requirements\n",
  });
  const arts = discoverArtifacts(repo, changePath, "add-foo", noOrder);
  assert.deepEqual(arts.map((a) => a.id), ["proposal", "design", "specs", "tasks"]);
  assert.equal(arts[0].kind, "markdown");
  assert.equal(arts[0].content, "## Why\n"); // markdown content is the raw file (correct encoding)
  assert.equal(arts[2].kind, "specs");
  assert.equal(arts[3].kind, "tasks");
  assert.equal(arts[3].tasks?.total, 2);
  assert.equal(arts[3].tasks?.completed, 1);
  assert.deepEqual(arts[2].specs?.map((s) => s.topic), ["foo"]);
  assert.equal(arts[2].specs?.[0].content, "## ADDED Requirements\n"); // spec content read as utf-8 string
});

test("discoverArtifacts: humanize trims leading separator before title-casing", () => {
  const repo = mkRepo();
  // leading '_' -> ' foo' -> trim -> 'foo' -> 'Foo' (the trim is load-bearing here)
  const changePath = writeChange(repo, "c", { "_foo.md": "x\n" });
  const arts = discoverArtifacts(repo, changePath, "c", noOrder);
  assert.equal(arts[0].title, "Foo");
});

test("discoverArtifacts: a specs topic dir without spec.md is skipped (not read)", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "specs/foo/spec.md": "a\n" });
  fs.mkdirSync(path.join(changePath, "specs", "bar"), { recursive: true }); // no spec.md
  const arts = discoverArtifacts(repo, changePath, "c", noOrder);
  const specs = arts.find((a) => a.id === "specs")!;
  assert.deepEqual(specs.specs?.map((s) => s.topic), ["foo"]);
});

test("discoverArtifacts: custom-schema files all surface even without an order", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "bridge-change", {
    "brainstorm.md": "raw\n",
    "proposal.md": "## Why\n",
    "plan.md": "plan\n",
    "verify.md": "verify\n",
    "retrospective.md": "retro\n",
  });
  const arts = discoverArtifacts(repo, changePath, "bridge-change", noOrder);
  const ids = arts.map((a) => a.id);
  for (const id of ["brainstorm", "proposal", "plan", "verify", "retrospective"]) {
    assert.ok(ids.includes(id), `expected ${id} to be discovered`);
  }
  const retro = arts.find((a) => a.id === "retrospective")!;
  assert.equal(retro.title, "Retrospective");
  assert.equal(retro.kind, "markdown");
});

test("discoverArtifacts: authoritative order reorders to match the provider", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "bridge-change", {
    "brainstorm.md": "raw\n",
    "proposal.md": "## Why\n",
    "plan.md": "plan\n",
    "specs/foo/spec.md": "## ADDED Requirements\n",
    "scratch.md": "unmatched\n",
  });
  const provider = orderOf([
    { id: "brainstorm", outputPath: "brainstorm.md" },
    { id: "proposal", outputPath: "proposal.md" },
    { id: "specs", outputPath: "specs/**/*.md" },
    { id: "plan", outputPath: "plan.md" },
  ]);
  const arts = discoverArtifacts(repo, changePath, "bridge-change", provider);
  // provider order first, then unmatched (scratch) appended
  assert.deepEqual(arts.map((a) => a.id), ["brainstorm", "proposal", "specs", "plan", "scratch"]);
  assert.equal(arts[2].kind, "specs");
});

test("discoverArtifacts: provider glob 'specs/**/*.md' maps to the specs tree", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "proposal.md": "x\n", "specs/foo/spec.md": "x\n" });
  const provider = orderOf([
    { id: "specs", outputPath: "specs/**/*.md" },
    { id: "proposal", outputPath: "proposal.md" },
  ]);
  const arts = discoverArtifacts(repo, changePath, "c", provider);
  assert.deepEqual(arts.map((a) => a.id), ["specs", "proposal"]);
  assert.equal(arts[0].kind, "specs");
});

test("discoverArtifacts: a non-specs glob does not map to the specs tree", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "proposal.md": "x\n", "specs/foo/spec.md": "x\n" });
  const provider = orderOf([{ id: "anything", outputPath: "*.md" }]);
  const arts = discoverArtifacts(repo, changePath, "c", provider);
  // '*.md' matches nothing; only the discovered artifacts appear (default-ordered)
  assert.deepEqual(arts.map((a) => a.id), ["proposal", "specs"]);
});

test("discoverArtifacts: literal specs/<topic>/spec.md outputPath maps to the specs tree (and orders it)", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "specs/foo/spec.md": "x\n", "proposal.md": "y\n" });
  // specs listed FIRST via the spec.md-literal branch; if it failed to match, default order
  // would put proposal first — so the order distinguishes a real match from the fallback
  const provider = orderOf([
    { id: "specs", outputPath: "specs/foo/spec.md" },
    { id: "proposal", outputPath: "proposal.md" },
  ]);
  const arts = discoverArtifacts(repo, changePath, "c", provider);
  assert.deepEqual(arts.map((a) => a.id), ["specs", "proposal"]);
  assert.equal(arts[0].kind, "specs");
});

test("discoverArtifacts: outputPath is trimmed before matching", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "proposal.md": "x\n", "design.md": "y\n" });
  // surrounding whitespace must be trimmed so the basename still matches design.md
  const provider = orderOf([
    { id: "design", outputPath: "  design.md  " },
    { id: "proposal", outputPath: "proposal.md" },
  ]);
  const arts = discoverArtifacts(repo, changePath, "c", provider);
  assert.deepEqual(arts.map((a) => a.id), ["design", "proposal"]);
});

test("discoverArtifacts: a 'spec.md' literal NOT under a specs path does not map to specs", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "specs/foo/spec.md": "x\n", "proposal.md": "y\n" });
  // 'docs/spec.md' has basename spec.md but no 'specs' segment -> must match nothing.
  // If it wrongly mapped to the specs artifact, specs would be ordered FIRST (before the
  // default-ordered proposal); asserting the order catches that.
  const provider = orderOf([{ id: "weird", outputPath: "docs/spec.md" }]);
  const arts = discoverArtifacts(repo, changePath, "c", provider);
  assert.deepEqual(arts.map((a) => a.id), ["proposal", "specs"]);
});

test("discoverArtifacts: two refs mapping to the same artifact do not duplicate it", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "specs/foo/spec.md": "x\n" });
  const provider = orderOf([
    { id: "specs", outputPath: "specs/**/*.md" },
    { id: "specs-again", outputPath: "specs/foo/spec.md" },
  ]);
  const arts = discoverArtifacts(repo, changePath, "c", provider);
  assert.equal(arts.filter((a) => a.kind === "specs").length, 1);
});

test("discoverArtifacts: provider refs whose outputPath has no file are skipped", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "proposal.md": "x\n" });
  const provider = orderOf([
    { id: "ghost", outputPath: "ghost.md" }, // no such file
    { id: "proposal", outputPath: "proposal.md" },
  ]);
  const arts = discoverArtifacts(repo, changePath, "c", provider);
  assert.deepEqual(arts.map((a) => a.id), ["proposal"]);
});

test("discoverArtifacts: provider is not consulted when slug is absent", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "proposal.md": "x\n", "brainstorm.md": "y\n" });
  let called = 0;
  const provider: SchemaOrderProvider = () => {
    called += 1;
    return [{ id: "brainstorm", outputPath: "brainstorm.md" }];
  };
  const arts = discoverArtifacts(repo, changePath, undefined, provider);
  assert.equal(called, 0);
  // default order: 'proposal' (DEFAULT_ORDER) before 'brainstorm' (alphabetical remainder)
  assert.deepEqual(arts.map((a) => a.id), ["proposal", "brainstorm"]);
});

test("discoverArtifacts: ignores dotfiles and non-markdown files", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", {
    "proposal.md": "## Why\n",
    ".openspec.yaml": "schema: spec-driven\n",
    "notes.txt": "ignore me\n",
    ".secret.md": "hidden\n",
  });
  const arts = discoverArtifacts(repo, changePath, "c", noOrder);
  assert.deepEqual(arts.map((a) => a.id), ["proposal"]);
});

test("discoverArtifacts: missing change dir returns empty array", () => {
  const repo = mkRepo();
  assert.deepEqual(discoverArtifacts(repo, path.join(repo, "nope"), "nope", noOrder), []);
});

test("discoverArtifacts: empty specs dir yields no specs artifact", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "proposal.md": "## Why\n" });
  fs.mkdirSync(path.join(changePath, "specs"), { recursive: true });
  const arts = discoverArtifacts(repo, changePath, "c", noOrder);
  assert.deepEqual(arts.map((a) => a.id), ["proposal"]);
});

test("discoverArtifacts: specs delta files are sorted by topic", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", {
    "specs/zeta/spec.md": "z\n",
    "specs/alpha/spec.md": "a\n",
    "specs/mid/spec.md": "m\n",
  });
  const arts = discoverArtifacts(repo, changePath, "c", noOrder);
  const specs = arts.find((a) => a.id === "specs")!;
  assert.deepEqual(specs.specs?.map((s) => s.topic), ["alpha", "mid", "zeta"]);
});

test("discoverArtifacts: default order puts proposal/design/specs/tasks first, rest alphabetical", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", {
    "zebra.md": "x\n",
    "tasks.md": "## 1. G\n\n- [ ] 1.1 a\n",
    "apple.md": "x\n",
    "proposal.md": "x\n",
    "specs/foo/spec.md": "x\n",
  });
  const arts = discoverArtifacts(repo, changePath, "c", noOrder);
  assert.deepEqual(arts.map((a) => a.id), ["proposal", "specs", "tasks", "apple", "zebra"]);
});

test("discoverArtifacts: humanizes dashes and underscores into Title Case", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "my_cool-artifact.md": "x\n" });
  const arts = discoverArtifacts(repo, changePath, "c", noOrder);
  assert.equal(arts[0].id, "my_cool-artifact");
  assert.equal(arts[0].title, "My Cool Artifact");
});

test("discoverArtifacts: collapses runs of separators in titles", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "a__b--c.md": "x\n" });
  const arts = discoverArtifacts(repo, changePath, "c", noOrder);
  assert.equal(arts[0].title, "A B C");
});

test("countArtifacts: counts root md + specs tree", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", {
    "proposal.md": "x\n",
    "design.md": "x\n",
    "tasks.md": "x\n",
    "specs/foo/spec.md": "x\n",
    ".openspec.yaml": "schema: spec-driven\n",
    "notes.txt": "x\n",
  });
  assert.equal(countArtifacts(changePath), 4); // 3 md + 1 specs
});

test("countArtifacts: markdown only (no specs) does not add a specs count", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "proposal.md": "x\n", "design.md": "x\n" });
  assert.equal(countArtifacts(changePath), 2);
});

test("countArtifacts: empty specs dir is not counted", () => {
  const repo = mkRepo();
  const changePath = writeChange(repo, "c", { "proposal.md": "x\n" });
  fs.mkdirSync(path.join(changePath, "specs"), { recursive: true });
  assert.equal(countArtifacts(changePath), 1);
});

test("countArtifacts: missing change dir is 0", () => {
  const repo = mkRepo();
  assert.equal(countArtifacts(path.join(repo, "nope")), 0);
});
