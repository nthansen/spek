import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ChangeInfo } from "@spek/core";
import { useChanges } from "../hooks/useOpenSpec";
import { useRepo } from "../contexts/RepoContext";
import { TaskProgress } from "../components/TaskProgress";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { formatLifecycleListRow, todayIso } from "../utils/lifecycle";
import { WorktreeChips } from "../components/WorktreeChips";
import { WorktreeFilter } from "../components/WorktreeFilter";
import { useWorktreePulse } from "../hooks/useWorktreePulse";
import {
  getWorktreeSelection,
  setWorktreeSelection,
  reconcileSelection,
  changeMatchesSelection,
  toggleWorktree,
} from "../utils/worktreeFilter";
import { changeKey, changeTo, changeMembers } from "../utils/changeLink";
import { groupChangesBySlug, type ChangeGroup } from "../utils/changeGroups";

function changeMetaDisplay(c: ChangeInfo, today: string): { text: string; tooltip: string } | null {
  const lifecycle = formatLifecycleListRow(c, today);
  const tooltipParts: string[] = [];
  if (c.createdDate) tooltipParts.push(`Created: ${c.createdDate}`);
  if (c.archivedDate) tooltipParts.push(`Archived: ${c.archivedDate}`);
  if (c.timestamp) tooltipParts.push(`First commit: ${c.timestamp}`);
  if (lifecycle) {
    return { text: lifecycle, tooltip: tooltipParts.join("\n") };
  }
  if (c.timestamp) {
    return { text: formatRelativeTime(c.timestamp), tooltip: tooltipParts.join("\n") || c.timestamp };
  }
  if (c.date) {
    return { text: c.date, tooltip: c.date };
  }
  return null;
}

function ChangeRow({ c, today, accent, showSource }: {
  c: ChangeInfo;
  today: string;
  accent: boolean;
  showSource: boolean;
}) {
  const meta = changeMetaDisplay(c, today);
  const members = changeMembers(c);
  const pulsing = useWorktreePulse(members.map((w) => w.key));
  return (
    <Link
      to={changeTo(c)}
      className={`block bg-bg-secondary border border-border rounded p-4 hover:border-accent transition-colors${
        accent ? " border-l-4 border-l-accent" : ""
      }${pulsing ? " animate-worktree-pulse" : ""}`}
    >
      <div className={`flex items-center justify-between gap-4${accent ? " mb-2" : ""}`}>
        <span className="flex items-center gap-2 min-w-0">
          <span className={`truncate ${accent ? "text-text-primary font-medium" : "text-text-primary"}`}>
            {c.description}
          </span>
          {showSource && <WorktreeChips slug={c.slug} worktrees={members} activeKey={c.source?.key} />}
        </span>
        {meta && (
          <span
            className="text-text-muted text-xs whitespace-nowrap shrink-0 tracking-wide [word-spacing:0.15em]"
            title={meta.tooltip}
          >
            {meta.text}
          </span>
        )}
      </div>
      {accent && c.taskStats && (
        <TaskProgress completed={c.taskStats.completed} total={c.taskStats.total} />
      )}
    </Link>
  );
}

// 群組內的單一 worktree 變體列（比 ChangeRow 精簡：worktree chips + 進度 + 時間）
function VariantRow({ v, today }: { v: ChangeInfo; today: string }) {
  const meta = changeMetaDisplay(v, today);
  const members = changeMembers(v);
  const pulsing = useWorktreePulse(members.map((w) => w.key));
  return (
    <Link
      to={changeTo(v)}
      className={`flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-bg-tertiary transition-colors${
        pulsing ? " animate-worktree-pulse" : ""
      }`}
    >
      <span className="min-w-0">
        <WorktreeChips slug={v.slug} worktrees={members} activeKey={v.source?.key} />
      </span>
      <span className="flex items-center gap-3 shrink-0">
        {v.taskStats && v.taskStats.total > 0 && (
          <TaskProgress completed={v.taskStats.completed} total={v.taskStats.total} compact />
        )}
        {meta && (
          <span
            className="text-text-muted text-xs whitespace-nowrap tracking-wide [word-spacing:0.15em]"
            title={meta.tooltip}
          >
            {meta.text}
          </span>
        )}
      </span>
    </Link>
  );
}

// 依 change title 分組：表頭顯示「最進度」摘要，下方列出跨 worktree 的各變體（最新在前）
function ChangeGroupCard({ group, today }: { group: ChangeGroup; today: string }) {
  const anyPulse = useWorktreePulse(
    group.variants.flatMap((v) => changeMembers(v).map((w) => w.key)),
  );
  return (
    <div
      className={`bg-bg-secondary border border-border rounded border-l-4 border-l-accent${
        anyPulse ? " animate-worktree-pulse" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-4 px-4 pt-4 pb-2">
        <span className="text-text-primary font-medium truncate">{group.description}</span>
        {group.furthest && (
          <span
            className="text-text-muted text-xs whitespace-nowrap shrink-0"
            title="Furthest-along worktree"
          >
            {group.furthest.completed} / {group.furthest.total} · furthest
          </span>
        )}
      </div>
      {group.furthest && (
        <div className="px-4 pb-2">
          <TaskProgress completed={group.furthest.completed} total={group.furthest.total} />
        </div>
      )}
      <div className="border-t border-border divide-y divide-border">
        {group.variants.map((v) => (
          <VariantRow key={changeKey(v)} v={v} today={today} />
        ))}
      </div>
    </div>
  );
}

export function ChangeList() {
  const { repoPath } = useRepo();
  // 一律聚合取得所有 worktree 的 change（含 membership）；顯示哪些由前端 client-side 篩選。
  const { data, loading, error } = useChanges(true);
  const [selection, setSelection] = useState<string[] | null>(null);

  const worktrees = data?.worktrees ?? [];
  const availableKeys = worktrees.map((w) => w.key);
  const showFilter = !!data?.aggregated && worktrees.length > 1;

  // 載入 / worktree 集合變動時，對照現存 worktree 調解選取集（移除已消失者、空則退回 All）
  const availableKeysSig = availableKeys.join(",");
  useEffect(() => {
    if (!repoPath) return;
    const reconciled = reconcileSelection(getWorktreeSelection(repoPath), availableKeys);
    setSelection(reconciled);
    setWorktreeSelection(repoPath, reconciled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, availableKeysSig]);

  if (loading) return <p className="text-text-muted">Loading...</p>;
  if (error) return <p className="text-red-400">Error: {error}</p>;

  const active = data?.active ?? [];
  const archived = data?.archived ?? [];
  const today = todayIso();

  const update = (next: string[] | null) => {
    setSelection(next);
    if (repoPath) setWorktreeSelection(repoPath, next);
  };

  // 篩選只作用於 active（archived 已依 slug 去重、屬歷史全域，維持顯示全部）
  const visibleActive = showFilter
    ? active.filter((c) => changeMatchesSelection(changeMembers(c).map((w) => w.key), selection))
    : active;
  // 依 change title 分組：多變體（跨 worktree / 分歧）者以群組卡呈現，單一變體維持精簡列
  const activeGroups = groupChangesBySlug(visibleActive);

  const header = (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">Changes</h1>
      {showFilter && (
        <WorktreeFilter
          worktrees={worktrees}
          selection={selection}
          onToggle={(key) => update(toggleWorktree(selection, key, availableKeys))}
          onSelectAll={() => update(null)}
        />
      )}
    </div>
  );

  if (active.length === 0 && archived.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-text-muted">No changes found</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {header}

      {activeGroups.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Active</h2>
          <div className="space-y-2">
            {activeGroups.map((g) =>
              g.variants.length === 1 ? (
                <ChangeRow
                  key={changeKey(g.variants[0])}
                  c={g.variants[0]}
                  today={today}
                  accent
                  showSource={showFilter}
                />
              ) : (
                <ChangeGroupCard key={g.slug} group={g} today={today} />
              ),
            )}
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Archived</h2>
          <div className="space-y-2">
            {archived.map((c) => (
              <ChangeRow key={changeKey(c)} c={c} today={today} accent={false} showSource={showFilter} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
