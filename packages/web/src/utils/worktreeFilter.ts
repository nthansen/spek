// Changes 頁的 worktree 篩選選取集，per repo 存於 localStorage。
// null（或不存在）代表「All」——顯示全部 worktree 的 change。
const PREFIX = "spek:worktree-filter:";

/** 讀取某 repo 的 worktree 選取集；未設定 / 不可用時回 null（All）。 */
export function getWorktreeSelection(repoPath: string): string[] | null {
  try {
    const raw = localStorage.getItem(PREFIX + repoPath);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const keys = parsed.filter((x): x is string => typeof x === "string");
    return keys.length > 0 ? keys : null;
  } catch {
    return null;
  }
}

/** 寫入 worktree 選取集；null 代表 All（移除紀錄）。 */
export function setWorktreeSelection(repoPath: string, keys: string[] | null): void {
  try {
    if (keys === null || keys.length === 0) {
      localStorage.removeItem(PREFIX + repoPath);
    } else {
      localStorage.setItem(PREFIX + repoPath, JSON.stringify(keys));
    }
  } catch {
    // localStorage 不可用時忽略
  }
}

/**
 * 對照目前存在的 worktree keys 調解選取集：移除已不存在者；
 * 若全部選取（等於全部可用）或清空，皆歸為 null（All），讓新出現的 worktree 自動納入。
 */
export function reconcileSelection(
  selection: string[] | null,
  availableKeys: string[],
): string[] | null {
  if (selection === null) return null;
  const available = new Set(availableKeys);
  const kept = selection.filter((k) => available.has(k));
  if (kept.length === 0) return null;
  if (kept.length === availableKeys.length) return null; // 全選等同 All
  return kept;
}

/**
 * 一筆 change（其 membership 的 worktree keys）是否符合目前選取集。
 * 選取集為 null（All）時一律符合；否則只要 membership 與選取集有交集即符合。
 */
export function changeMatchesSelection(
  memberKeys: string[],
  selection: string[] | null,
): boolean {
  if (selection === null) return true;
  const sel = new Set(selection);
  return memberKeys.some((k) => sel.has(k));
}

/**
 * 切換某個 worktree key 的選取狀態，回傳新的選取集（已對照可用集合正規化為 null=All）。
 * 從 All 起手時，點某個 worktree 視為「聚焦到它」——即以空集合為基底加入該 key（只留它），
 * 而非把它關掉。再點其他 worktree 會累加；全部選到齊或全部取消皆回到 All。
 */
export function toggleWorktree(
  selection: string[] | null,
  key: string,
  availableKeys: string[],
): string[] | null {
  const current = selection === null ? new Set<string>() : new Set(selection);
  if (current.has(key)) current.delete(key);
  else current.add(key);
  return reconcileSelection([...current], availableKeys);
}
