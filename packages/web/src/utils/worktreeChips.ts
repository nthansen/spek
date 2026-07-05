import type { WorktreeSource } from "@spek/core";

/**
 * 決定一列 change 要顯示哪些 worktree chip。
 * - 空 membership → null（無可顯示）。
 * - `hideLoneMain`（standalone 單一變體列 `ChangeRow` 用）：唯一 member 且為主 worktree 時回 null，
 *   維持低雜訊——只屬主 worktree 的孤立 change 不標。
 * - 群組變體列（`hideLoneMain: false`）一律回傳全部 member，讓每個變體都被標示，
 *   包含只屬主 worktree 的分歧變體（否則該列會完全沒有 worktree 標籤）。
 */
export function worktreeChipsToShow(
  worktrees: WorktreeSource[],
  opts: { hideLoneMain: boolean },
): WorktreeSource[] | null {
  if (worktrees.length === 0) return null;
  if (opts.hideLoneMain && worktrees.length === 1 && worktrees[0].isMain) return null;
  return worktrees;
}
