import type { ChangeInfo, WorktreeSource } from "@spek/core";

// 一筆 change 所屬的 worktree membership：收合的同 slug change 會有多個；
// 未聚合時退回單一 source（無則空陣列）。供 badge / 篩選 / pulse 共用。
export function changeMembers(c: ChangeInfo): WorktreeSource[] {
  return c.worktrees ?? (c.source ? [c.source] : []);
}

// 聚合時用「來源 worktree key + slug」組唯一 React key，避免同名 slug 衝突
export function changeKey(c: ChangeInfo): string {
  return c.source ? `${c.source.key}:${c.slug}` : c.slug;
}

// 聚合時連結帶 ?wt=，讓詳細頁能從正確的 worktree 讀取（同名 slug 也能辨識）
export function changeTo(c: ChangeInfo): string {
  return c.source ? `/changes/${c.slug}?wt=${c.source.key}` : `/changes/${c.slug}`;
}
