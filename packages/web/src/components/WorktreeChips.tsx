import { useNavigate } from "react-router-dom";
import type { WorktreeSource } from "@spek/core";
import { useWorktreePulse } from "../hooks/useWorktreePulse";
import { worktreeChipsToShow } from "../utils/worktreeChips";

function labelOf(w: WorktreeSource): string {
  return w.branch ?? "detached";
}

// 單顆 worktree chip：導向該 worktree 的 change 副本（?wt=）。以 button + stopPropagation 實作，
// 才能安全放在整列是 <Link> 的清單列內（避免巢狀 <a>）。自身 worktree 變動時 pulse。
function Chip({ slug, wt, active }: { slug: string; wt: WorktreeSource; active: boolean }) {
  const navigate = useNavigate();
  const pulsing = useWorktreePulse([wt.key]);
  return (
    <button
      type="button"
      title={wt.path}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(`/changes/${slug}?wt=${wt.key}`);
      }}
      className={`shrink-0 text-[11px] rounded px-1.5 py-0.5 border transition-colors${
        active
          ? " border-accent text-text-primary"
          : " border-border text-text-muted hover:text-text-secondary"
      }${pulsing ? " animate-worktree-pulse" : ""}`}
    >
      {labelOf(wt)}
    </button>
  );
}

/**
 * 一組可點的 worktree chip，直接掛在「有多個 worktree 的 change」上：
 * 每顆導向該 worktree 的 change 副本，`activeKey` 標示目前檢視中的來源。
 * `hideLoneMain`（預設 true，standalone 單一變體列用）沿用 badge 低雜訊行為：
 * 只屬主 worktree 的單一 change 不顯示。群組變體列傳 `hideLoneMain={false}`，
 * 讓只屬主 worktree 的分歧變體仍被標示（否則該列會沒有任何 worktree 標籤）。
 */
export function WorktreeChips({
  slug,
  worktrees,
  activeKey,
  hideLoneMain = true,
}: {
  slug: string;
  worktrees: WorktreeSource[];
  activeKey?: string;
  hideLoneMain?: boolean;
}) {
  const chips = worktreeChipsToShow(worktrees, { hideLoneMain });
  if (!chips) return null;
  return (
    <span className="flex items-center gap-1 flex-wrap">
      {chips.map((wt) => (
        <Chip key={wt.key} slug={slug} wt={wt} active={wt.key === activeKey} />
      ))}
    </span>
  );
}
