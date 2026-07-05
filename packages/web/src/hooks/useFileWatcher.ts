import { useEffect } from "react";
import { useRepo } from "../contexts/RepoContext";
import { useRefresh } from "../contexts/RefreshContext";

/**
 * 監聽 openspec 檔案變更，自動觸發 refresh。
 * 依據執行環境自動選擇實作：
 * - Web：SSE EventSource 連接 /api/openspec/watch
 * - VS Code：監聽 postMessage fileChanged 事件
 * - Demo：no-op
 *
 * 連線生命週期只綁 repoPath，不隨 worktree 篩選 / aggregate 偏好變動——後端一律監看
 * 所有 worktree，前端在資料層做篩選，故不需為了篩選重連。事件帶 `worktree` key 時
 * 透過 refresh 傳出，供 UI 標示是哪個 worktree 正在變動；沒有欄位時僅刷新不標活動。
 */
export function useFileWatcher() {
  const { repoPath } = useRepo();
  const refresh = useRefresh();

  useEffect(() => {
    // Demo 環境：沒有 watcher
    if ((window as unknown as Record<string, unknown>).__DEMO_DATA__) {
      return;
    }

    // VS Code 環境：監聽 fileChanged message（可能帶 worktree key）
    if ((window as unknown as Record<string, unknown>).__vscodeApi) {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "fileChanged") {
          refresh(typeof event.data.worktree === "string" ? event.data.worktree : undefined);
        }
      };
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    }

    // Web 環境：SSE EventSource。後端一律監看所有 worktree，事件帶變動來源 worktree key。
    if (!repoPath) return;

    const url = `/api/openspec/watch?dir=${encodeURIComponent(repoPath)}`;
    const source = new EventSource(url);

    source.onmessage = (event) => {
      let worktree: string | undefined;
      try {
        const data = JSON.parse(event.data);
        if (typeof data?.worktree === "string") worktree = data.worktree;
      } catch {
        // 非 JSON（或初始 comment）：僅刷新
      }
      refresh(worktree);
    };

    return () => {
      source.close();
    };
  }, [repoPath, refresh]);
}
