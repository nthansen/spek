import type { WorktreeInfo } from "@spek/core";
import { useWorktreePulse } from "../hooks/useWorktreePulse";

function labelOf(w: WorktreeInfo): string {
  return w.branch ?? "detached";
}

// 單顆 worktree toggle chip（自身 worktree 剛變動時 pulse，即使目前被篩選掉也提示）。
function WorktreeChip({
  worktree,
  active,
  onClick,
}: {
  worktree: WorktreeInfo;
  active: boolean;
  onClick: () => void;
}) {
  const pulsing = useWorktreePulse([worktree.key]);
  return (
    <button
      type="button"
      onClick={onClick}
      title={worktree.path}
      className={`text-xs rounded px-2 py-0.5 border transition-colors${
        active
          ? " border-accent text-text-primary"
          : " border-border text-text-muted hover:text-text-secondary"
      }${pulsing ? " animate-worktree-pulse" : ""}`}
    >
      {labelOf(worktree)}
      {worktree.isMain ? " ·" : ""}
    </button>
  );
}

/**
 * Changes 頁的 worktree 篩選列：`All`（預設）＋每個 worktree 一顆多選 toggle。
 * `selection === null` 代表 All。純由呼叫端控制狀態；本元件只呈現與回報 toggle。
 */
export function WorktreeFilter({
  worktrees,
  selection,
  onToggle,
  onSelectAll,
}: {
  worktrees: WorktreeInfo[];
  selection: string[] | null;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
}) {
  const isAll = selection === null;
  const selected = new Set(selection ?? []);
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <span className="text-text-muted">Worktrees:</span>
      <button
        type="button"
        onClick={onSelectAll}
        className={`rounded px-2 py-0.5 border transition-colors${
          isAll
            ? " border-accent text-text-primary"
            : " border-border text-text-muted hover:text-text-secondary"
        }`}
      >
        All
      </button>
      {worktrees.map((w) => (
        <WorktreeChip
          key={w.key}
          worktree={w}
          active={isAll || selected.has(w.key)}
          onClick={() => onToggle(w.key)}
        />
      ))}
    </div>
  );
}
