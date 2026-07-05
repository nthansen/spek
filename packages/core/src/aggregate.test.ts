import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  scanOpenSpecAggregated,
  buildGraphDataAggregated,
  changeSignature,
  readChangeAggregated,
} from "./scanner.js";
import { listWorktrees } from "./worktrees.js";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  });
}

function writeFile(p: string, content: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function commitAll(dir: string, msg: string): void {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", msg);
}

// 以指定的作者 / 提交日期 commit，供排序測試控制 git timestamp。
function commitAllDated(dir: string, msg: string, isoDate: string): void {
  git(dir, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", msg], {
    cwd: dir,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_AUTHOR_DATE: isoDate,
      GIT_COMMITTER_DATE: isoDate,
    },
  });
}

function initRepo(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  return dir;
}

function addActiveChange(repoDir: string, slug: string, specTopic?: string, body = "demo"): void {
  const base = path.join(repoDir, "openspec", "changes", slug);
  writeFile(path.join(base, "proposal.md"), `## Why\n${body}\n`);
  if (specTopic) {
    writeFile(path.join(base, "specs", specTopic, "spec.md"), "## ADDED Requirements\n");
  }
}

// 主 repo（branch main）含 1 spec + 1 archived change；worktree A 帶 add-a（含 delta spec）；
// worktree B 帶 add-b（無 spec）。A、B 皆繼承主 repo 的 archived change。
function makeAggRepo(): string {
  const repo = initRepo("spek-agg-");
  writeFile(path.join(repo, "openspec", "specs", "alpha", "spec.md"), "## Requirements\n");
  writeFile(
    path.join(repo, "openspec", "changes", "archive", "2026-01-01-old", "proposal.md"),
    "## Why\n",
  );
  commitAll(repo, "init");
  const wtA = repo + "-a";
  git(repo, "worktree", "add", "-q", "-b", "wa", wtA);
  addActiveChange(wtA, "add-a", "alpha");
  commitAll(wtA, "change a");
  const wtB = repo + "-b";
  git(repo, "worktree", "add", "-q", "-b", "wb", wtB);
  addActiveChange(wtB, "add-b");
  commitAll(wtB, "change b");
  return repo;
}

test("scanOpenSpecAggregated: aggregates active changes across worktrees with source", async () => {
  const repo = makeAggRepo();
  const r = await scanOpenSpecAggregated(repo);
  assert.equal(r.aggregated, true);
  assert.equal(r.worktrees.length, 3);
  assert.deepEqual(r.activeChanges.map((c) => c.slug).sort(), ["add-a", "add-b"]);
  for (const c of r.activeChanges) {
    assert.ok(c.source, "every aggregated active change carries a source");
  }
  // specs 取主 worktree
  assert.deepEqual(r.specs.map((s) => s.topic), ["alpha"]);
});

test("scanOpenSpecAggregated: deduplicates archived changes by slug", async () => {
  const repo = makeAggRepo();
  const r = await scanOpenSpecAggregated(repo);
  // 2026-01-01-old 存在於主 repo 與兩個 worktree（繼承），去重後只剩一筆
  assert.equal(r.archivedChanges.filter((c) => c.slug === "2026-01-01-old").length, 1);
});

test("scanOpenSpecAggregated: identical same-slug change collapses with membership", async () => {
  const repo = initRepo("spek-agg-same-");
  writeFile(path.join(repo, "openspec", "config.yaml"), "schema: spec-driven\n");
  commitAll(repo, "init");
  const wtA = repo + "-a";
  git(repo, "worktree", "add", "-q", "-b", "wa", wtA);
  addActiveChange(wtA, "shared"); // 相同內容
  commitAll(wtA, "a");
  const wtB = repo + "-b";
  git(repo, "worktree", "add", "-q", "-b", "wb", wtB);
  addActiveChange(wtB, "shared"); // 相同內容
  commitAll(wtB, "b");

  const r = await scanOpenSpecAggregated(repo);
  const shared = r.activeChanges.filter((c) => c.slug === "shared");
  assert.equal(shared.length, 1, "identical shared change collapses to a single entry");
  assert.equal(shared[0].worktrees?.length, 2, "membership lists both worktrees");
  const memberKeys = shared[0].worktrees?.map((w) => w.key).sort();
  assert.equal(new Set(memberKeys).size, 2, "membership keys are distinct");
});

test("scanOpenSpecAggregated: diverging same-slug change kept separately", async () => {
  const repo = initRepo("spek-agg-dup-");
  writeFile(path.join(repo, "openspec", "config.yaml"), "schema: spec-driven\n");
  commitAll(repo, "init");
  const wtA = repo + "-a";
  git(repo, "worktree", "add", "-q", "-b", "wa", wtA);
  addActiveChange(wtA, "shared", undefined, "version A"); // 內容分歧
  commitAll(wtA, "a");
  const wtB = repo + "-b";
  git(repo, "worktree", "add", "-q", "-b", "wb", wtB);
  addActiveChange(wtB, "shared", undefined, "version B"); // 內容分歧
  commitAll(wtB, "b");

  const r = await scanOpenSpecAggregated(repo);
  const shared = r.activeChanges.filter((c) => c.slug === "shared");
  assert.equal(shared.length, 2, "diverging shared change stays as separate entries");
  assert.notEqual(shared[0].source?.key, shared[1].source?.key);
});

test("scanOpenSpecAggregated: un-timestamped worktree change floats up via mtime", async () => {
  const repo = initRepo("spek-agg-order-");
  writeFile(path.join(repo, "openspec", "config.yaml"), "schema: spec-driven\n");
  // 一個很舊的已 commit change
  addActiveChange(repo, "old-committed");
  commitAllDated(repo, "old", "2020-01-01T00:00:00");
  // 一個未 commit 的 change（無 git timestamp，mtime = 現在）
  addActiveChange(repo, "fresh-uncommitted");

  const r = await scanOpenSpecAggregated(repo); // 單一 worktree → scanOpenSpec 排序路徑
  assert.deepEqual(
    r.activeChanges.map((c) => c.slug),
    ["fresh-uncommitted", "old-committed"],
    "recently-edited un-committed change sorts above the old committed one",
  );
});

test("changeSignature: identical dirs match, differing dirs differ", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spek-sig-"));
  const a = path.join(root, "a");
  const b = path.join(root, "b");
  const c = path.join(root, "c");
  writeFile(path.join(a, "proposal.md"), "same\n");
  writeFile(path.join(a, "specs", "x", "spec.md"), "delta\n");
  writeFile(path.join(b, "proposal.md"), "same\n");
  writeFile(path.join(b, "specs", "x", "spec.md"), "delta\n");
  writeFile(path.join(c, "proposal.md"), "different\n");
  writeFile(path.join(c, "specs", "x", "spec.md"), "delta\n");
  assert.equal(changeSignature(a), changeSignature(b), "identical trees share a signature");
  assert.notEqual(changeSignature(a), changeSignature(c), "differing content differs");
});

test("changeSignature: line-ending differences (CRLF vs LF) do not affect the signature", () => {
  // git worktree add 依 autocrlf 重新 checkout，同一 commit 的 change 在不同 worktree
  // 可能一邊 LF、一邊 CRLF；內容實質相同應得到相同簽章，才能正確收合。
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spek-sig-eol-"));
  const lf = path.join(root, "lf");
  const crlf = path.join(root, "crlf");
  writeFile(path.join(lf, "proposal.md"), "# T\n\n## Why\ndemo\n");
  writeFile(path.join(crlf, "proposal.md"), "# T\r\n\r\n## Why\r\ndemo\r\n");
  assert.equal(changeSignature(lf), changeSignature(crlf), "CRLF and LF variants collapse");
});

test("scanOpenSpecAggregated: single worktree falls back without source", async () => {
  const repo = initRepo("spek-agg-single-");
  addActiveChange(repo, "only-one");
  commitAll(repo, "init");
  const r = await scanOpenSpecAggregated(repo);
  assert.equal(r.aggregated, false);
  assert.equal(r.activeChanges.length, 1);
  assert.equal(r.activeChanges[0].source, undefined);
});

test("scanOpenSpecAggregated: aggregate=false scans only the given directory", async () => {
  const repo = makeAggRepo();
  const r = await scanOpenSpecAggregated(repo, { aggregate: false });
  assert.equal(r.aggregated, false);
  // 主 worktree 在 branch main，active changes 都在其他 worktree 的分支上
  assert.equal(r.activeChanges.length, 0);
});

test("readChangeAggregated: resolves the requested worktree by key", async () => {
  const repo = initRepo("spek-read-wt-");
  writeFile(path.join(repo, "openspec", "config.yaml"), "schema: spec-driven\n");
  commitAll(repo, "init");
  const wtA = repo + "-a";
  git(repo, "worktree", "add", "-q", "-b", "wa", wtA);
  addActiveChange(wtA, "only-a", undefined, "from A");
  commitAll(wtA, "a");

  const wts = await listWorktrees(repo);
  const aKey = wts.find((w) => w.branch === "wa")!.key;
  const detail = await readChangeAggregated(repo, "only-a", { wtKey: aKey });
  assert.ok(detail, "reads the change from the requested worktree");
  assert.equal(detail!.source?.key, aKey);
  const proposalA = detail!.artifacts.find((a) => a.id === "proposal");
  assert.match(proposalA?.content ?? "", /from A/);
});

test("readChangeAggregated: stale wtKey falls back to a worktree that still has the slug", async () => {
  const repo = initRepo("spek-read-stale-");
  writeFile(path.join(repo, "openspec", "config.yaml"), "schema: spec-driven\n");
  // main worktree 也有這個 slug
  addActiveChange(repo, "shared", undefined, "from main");
  commitAll(repo, "init");
  const wtA = repo + "-a";
  git(repo, "worktree", "add", "-q", "-b", "wa", wtA); // wtA 繼承 shared（branch point）

  // 指定一個不存在的 worktree key → 應退回仍含 slug 的 worktree（main 優先），不報錯
  const detail = await readChangeAggregated(repo, "shared", { wtKey: "deadbeef" });
  assert.ok(detail, "falls back instead of returning null");
  const proposalMain = detail!.artifacts.find((a) => a.id === "proposal");
  assert.match(proposalMain?.content ?? "", /from main/);
  assert.equal(detail!.source?.isMain, true, "prefers the main worktree on fallback");
});

test("readChangeAggregated: detail carries membership of all worktrees holding the slug", async () => {
  const repo = initRepo("spek-read-mem-");
  writeFile(path.join(repo, "openspec", "config.yaml"), "schema: spec-driven\n");
  addActiveChange(repo, "shared");
  commitAll(repo, "init");
  git(repo, "worktree", "add", "-q", "-b", "wa", repo + "-a"); // inherits shared

  const detail = await readChangeAggregated(repo, "shared");
  const keys = (detail!.worktrees ?? []).map((w) => w.branch).sort();
  assert.deepEqual(keys, ["main", "wa"], "membership lists both worktrees that have the slug");
  assert.equal(detail!.worktrees?.[0].isMain, true, "main worktree listed first");
});

test("readChangeAggregated: single worktree reads without wt", async () => {
  const repo = initRepo("spek-read-single-");
  addActiveChange(repo, "solo");
  commitAll(repo, "init");
  const detail = await readChangeAggregated(repo, "solo");
  assert.ok(detail);
  assert.equal(detail!.slug, "solo");
});

test("buildGraphDataAggregated: namespaces change node ids by worktree", async () => {
  const repo = makeAggRepo();
  const g = await buildGraphDataAggregated(repo);
  const changeNodes = g.nodes.filter((n) => n.type === "change");
  // add-a 有 delta spec → 成為節點；add-b 無 spec → 不列入
  assert.equal(changeNodes.length, 1);
  assert.match(changeNodes[0].id, /^change:[0-9a-f]{8}:add-a$/);
  assert.ok(changeNodes[0].source);
  assert.ok(g.nodes.some((n) => n.id === "spec:alpha"));
});
