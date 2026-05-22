import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import type { WorktreeInfo, WorktreeSource } from "./types.js";

/**
 * 由絕對路徑算出穩定、URL-safe 的 worktree key（sha1 前 8 碼）。
 * 同一路徑每次結果相同，不同路徑結果相異。
 */
export function worktreeKey(absPath: string): string {
  return createHash("sha1").update(path.resolve(absPath)).digest("hex").slice(0, 8);
}

/** 從完整的 WorktreeInfo 取出附加在 change 上的精簡來源資訊。 */
export function toWorktreeSource(wt: WorktreeInfo): WorktreeSource {
  return { key: wt.key, path: wt.path, branch: wt.branch, isMain: wt.isMain };
}

/**
 * 解析 `git worktree list --porcelain` 的輸出。
 * 第一個區塊為主 worktree（含 `.git` 目錄者）。標記 prunable 的 worktree（目錄已不存在）會被略過。
 */
export function parseWorktreePorcelain(stdout: string): WorktreeInfo[] {
  const result: WorktreeInfo[] = [];
  let current:
    | { path: string; branch: string | null; head: string | null; isBare: boolean; prunable: boolean }
    | null = null;

  const flush = () => {
    if (current && !current.prunable) {
      const absPath = path.resolve(current.path);
      result.push({
        path: absPath,
        branch: current.branch,
        head: current.head,
        isMain: result.length === 0,
        isBare: current.isBare,
        key: worktreeKey(absPath),
      });
    }
    current = null;
  };

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("worktree ")) {
      flush();
      current = {
        path: line.slice("worktree ".length),
        branch: null,
        head: null,
        isBare: false,
        prunable: false,
      };
    } else if (!current) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      current.branch = null;
    } else if (line === "bare") {
      current.isBare = true;
    } else if (line === "prunable" || line.startsWith("prunable ")) {
      current.prunable = true;
    }
    // 其他（locked 等）未知行忽略
  }
  flush();
  return result;
}

/**
 * 列出 dir 所屬 git repo 的所有 worktree（主 worktree + linked worktrees）。
 * 從任一 worktree 呼叫都會回傳整個 repo 的全部 worktree，主 worktree 排第一。
 * 非 git repo、無 `git`、或指令失敗時回傳空陣列。
 */
export function listWorktrees(dir: string): Promise<WorktreeInfo[]> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd: dir, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        resolve(parseWorktreePorcelain(stdout));
      },
    );
  });
}
