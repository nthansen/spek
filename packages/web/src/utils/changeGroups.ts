import type { ChangeInfo, TaskStats } from "@spek/core";

/** 一個 change（依 slug）的分組：跨 worktree 的各變體，加上「最進度」摘要。 */
export interface ChangeGroup {
  slug: string;
  description: string;
  /** 各變體（同 slug 的不同 worktree 副本）；沿用輸入順序（後端已依 recency 由新到舊）。 */
  variants: ChangeInfo[];
  /** 所有變體中「最進度」的 taskStats（完成數最多者），供群組表頭摘要用；無 tasks 時 null。 */
  furthest: TaskStats | null;
}

/** 所有變體中完成任務數最多者的 taskStats（「最進度」）；皆無 tasks 時回 null。 */
export function furthestTaskStats(variants: ChangeInfo[]): TaskStats | null {
  let best: TaskStats | null = null;
  for (const v of variants) {
    const ts = v.taskStats;
    if (!ts) continue;
    if (best === null || ts.completed > best.completed) best = ts;
  }
  return best;
}

/** 群組內變體排序鍵：完成任務數（無 tasks 視為 -1）。 */
function completedOf(c: ChangeInfo): number {
  return c.taskStats?.completed ?? -1;
}

/**
 * 群組標題點擊的目標變體：最進度者（`variants[0]`，已於分組時依完成數排序）。
 * 對應表頭顯示的「furthest」摘要；導向其 change detail 後可用 worktree 切換器切到其他副本。
 */
export function groupPrimaryVariant(group: ChangeGroup): ChangeInfo {
  return group.variants[0];
}

/**
 * 依 slug 將 change 分組。群組順序 = 各 slug 首次出現的順序（後端已依 recency 排）；
 * 群組內變體以「最進度」排序（完成任務數由多到少），故最進度的 worktree 排最上，
 * 平手時維持輸入（recency）順序（V8 stable sort）。同 slug 的多個分歧副本落在同一組。
 */
export function groupChangesBySlug(changes: ChangeInfo[]): ChangeGroup[] {
  const order: string[] = [];
  const bySlug = new Map<string, ChangeInfo[]>();
  for (const c of changes) {
    const list = bySlug.get(c.slug);
    if (list) {
      list.push(c);
    } else {
      bySlug.set(c.slug, [c]);
      order.push(c.slug);
    }
  }
  return order.map((slug) => {
    const variants = bySlug.get(slug)!.slice().sort((a, b) => completedOf(b) - completedOf(a));
    return {
      slug,
      description: variants[0].description,
      variants,
      furthest: furthestTaskStats(variants),
    };
  });
}
