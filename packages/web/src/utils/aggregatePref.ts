// 使用者的 worktree 聚合偏好，存於 localStorage，預設開啟。
const KEY = "spek:aggregate-worktrees";

/** 讀取 worktree 聚合偏好。localStorage 不可用或未設定時回傳 true。 */
export function getAggregatePref(): boolean {
  try {
    return localStorage.getItem(KEY) !== "false";
  } catch {
    return true;
  }
}

/** 寫入 worktree 聚合偏好。 */
export function setAggregatePref(value: boolean): void {
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // localStorage 不可用時忽略
  }
}
