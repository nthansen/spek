// 使用者的 worktree 聚合偏好，存於 localStorage，預設開啟。
const KEY = "spek:aggregate-worktrees";

/**
 * 讀取 worktree 聚合偏好。localStorage 不可用或未設定時回傳 true。
 * 註：Changes 頁的二元 aggregate 開關已由 worktree 篩選列取代（見 worktreeFilter），
 * 此偏好僅供 overview / graph 沿用（實務上恆為預設 true，即一律聚合）。
 */
export function getAggregatePref(): boolean {
  try {
    return localStorage.getItem(KEY) !== "false";
  } catch {
    return true;
  }
}
