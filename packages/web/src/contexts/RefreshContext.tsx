import { createContext, useContext, useState, useCallback } from "react";

/** 最近一次 live-reload 帶來的變動來源：worktree key + 遞增 nonce（同 worktree 連續變動也能重新觸發 pulse）。 */
export interface WorktreeActivity {
  worktree: string;
  nonce: number;
}

interface RefreshContextValue {
  refreshKey: number;
  /** 觸發刷新；帶 worktree key 時同時記錄一次 live-activity（供 UI pulse）。 */
  refresh: (worktree?: string | null) => void;
  activity: WorktreeActivity | null;
}

const RefreshContext = createContext<RefreshContextValue>({
  refreshKey: 0,
  refresh: () => {},
  activity: null,
});

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activity, setActivity] = useState<WorktreeActivity | null>(null);

  const refresh = useCallback((worktree?: string | null) => {
    setRefreshKey((k) => {
      const next = k + 1;
      // nonce 用遞增的 refreshKey，確保即使同一 worktree 連續變動也會產生新的 activity
      if (worktree) setActivity({ worktree, nonce: next });
      return next;
    });
  }, []);

  return (
    <RefreshContext.Provider value={{ refreshKey, refresh, activity }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefreshKey(): number {
  return useContext(RefreshContext).refreshKey;
}

export function useRefresh(): (worktree?: string | null) => void {
  return useContext(RefreshContext).refresh;
}

/** 最近一次帶 worktree 來源的 live-activity（供 Changes 頁 pulse 對應的 worktree chip / rows）。 */
export function useActivity(): WorktreeActivity | null {
  return useContext(RefreshContext).activity;
}
