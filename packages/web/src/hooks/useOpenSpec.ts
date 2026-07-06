import { useState, useEffect, useCallback, useRef } from "react";
import { useRepo } from "../contexts/RepoContext";
import { useApiAdapter } from "../api/ApiAdapterContext";
import { useRefreshKey } from "../contexts/RefreshContext";
import { getAggregatePref } from "../utils/aggregatePref";
import { getCached, setCached, initialFetchState } from "./fetchCache";
import type {
  OverviewData,
  SpecInfo,
  SpecDetail,
  SpecVersionContent,
  HistoryEntry as SpecHistoryEntry,
  ChangeInfo,
  ChangesData,
  ChangeDetail,
  ParsedTasks,
  TaskSection,
  TaskItem,
  BrowseEntry,
  BrowseData,
  DetectData,
  GraphData,
} from "@spek/core";

// Re-export types for existing consumers
export type {
  OverviewData,
  SpecInfo,
  SpecDetail,
  SpecVersionContent,
  ChangeInfo,
  ChangesData,
  ChangeDetail,
  ParsedTasks,
  TaskSection,
  TaskItem,
  BrowseEntry,
  BrowseData,
  DetectData,
};
export type { HistoryEntry as SpecHistoryEntry } from "@spek/core";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useAsyncData<T>(
  fetcher: (() => Promise<T>) | null,
  deps: unknown[],
  cacheKey?: string,
): FetchState<T> {
  const refreshKey = useRefreshKey();
  const [state, setState] = useState<FetchState<T>>(() =>
    initialFetchState<T>(getCached<T>(cacheKey), !!fetcher),
  );
  const isRefresh = useRef(false);
  const prevRefreshKey = useRef(refreshKey);

  useEffect(() => {
    // 判斷是否為 refreshKey 觸發的 re-fetch
    const refreshTriggered = prevRefreshKey.current !== refreshKey;
    prevRefreshKey.current = refreshKey;

    if (!fetcher) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    // 有快取（SWR）→ 直接帶入既有資料、背景重新驗證，不 flash（涵蓋 deps 變動時的重新掛載）
    const cached = getCached<T>(cacheKey);

    const doFetch = () => {
      // refreshKey 觸發或已有快取時保留既有 data，不顯示 loading flash
      if (!refreshTriggered && cached === undefined) {
        setState({ data: null, loading: true, error: null });
      } else if (cached !== undefined) {
        setState((prev) => (prev.data === cached ? prev : { data: cached, loading: false, error: null }));
      }

      fetcher()
        .then((data) => {
          setCached(cacheKey, data);
          if (!cancelled) setState({ data, loading: false, error: null });
        })
        .catch((err) => {
          if (!cancelled)
            setState((prev) => ({
              data: prev.data ?? null,
              loading: false,
              error: prev.data ? null : err.message,
            }));
        });
    };

    // refreshKey 觸發時加 debounce 300ms
    if (refreshTriggered) {
      const timer = setTimeout(doFetch, 300);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    doFetch();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshKey]);

  return state;
}

// --- OpenSpec API hooks ---

export function useOverview(aggregate?: boolean): FetchState<OverviewData> {
  const { repoPath } = useRepo();
  const adapter = useApiAdapter();
  const agg = aggregate ?? getAggregatePref();
  return useAsyncData(
    repoPath ? () => adapter.getOverview(agg) : null,
    [repoPath, agg],
    `overview:${repoPath}:${agg}`,
  );
}

export function useSpecs(): FetchState<SpecInfo[]> {
  const { repoPath } = useRepo();
  const adapter = useApiAdapter();
  return useAsyncData(
    repoPath ? () => adapter.getSpecs() : null,
    [repoPath],
    `specs:${repoPath}`,
  );
}

export function useSpec(topic: string): FetchState<SpecDetail> {
  const { repoPath } = useRepo();
  const adapter = useApiAdapter();
  return useAsyncData(
    repoPath && topic ? () => adapter.getSpec(topic) : null,
    [repoPath, topic],
    `spec:${repoPath}:${topic}`,
  );
}

export function useSpecAtChange(topic: string, slug: string): FetchState<SpecVersionContent> {
  const { repoPath } = useRepo();
  const adapter = useApiAdapter();
  return useAsyncData(
    repoPath && topic && slug ? () => adapter.getSpecAtChange(topic, slug) : null,
    [repoPath, topic, slug],
  );
}

export function useChanges(aggregate?: boolean): FetchState<ChangesData> {
  const { repoPath } = useRepo();
  const adapter = useApiAdapter();
  const agg = aggregate ?? getAggregatePref();
  return useAsyncData(
    repoPath ? () => adapter.getChanges(agg) : null,
    [repoPath, agg],
    `changes:${repoPath}:${agg}`,
  );
}

export function useChange(slug: string, wt?: string): FetchState<ChangeDetail> {
  const { repoPath } = useRepo();
  const adapter = useApiAdapter();
  return useAsyncData(
    repoPath && slug ? () => adapter.getChange(slug, wt) : null,
    [repoPath, slug, wt],
    `change:${repoPath}:${slug}:${wt ?? ""}`,
  );
}

// --- Resync hook ---

export function useResync(): { resync: () => Promise<void>; loading: boolean } {
  const { repoPath } = useRepo();
  const adapter = useApiAdapter();
  const [loading, setLoading] = useState(false);

  const resync = useCallback(async () => {
    if (!repoPath || loading) return;
    setLoading(true);
    try {
      await adapter.resync();
    } finally {
      setLoading(false);
    }
  }, [repoPath, loading, adapter]);

  return { resync, loading };
}

// --- Graph data hook ---

export function useGraphData(aggregate?: boolean): FetchState<GraphData> {
  const { repoPath } = useRepo();
  const adapter = useApiAdapter();
  const agg = aggregate ?? getAggregatePref();
  return useAsyncData(
    repoPath ? () => adapter.getGraphData(agg) : null,
    [repoPath, agg],
    `graph:${repoPath}:${agg}`,
  );
}

// --- Filesystem API hooks ---

export function useBrowse(dirPath: string): FetchState<BrowseData> {
  const adapter = useApiAdapter();
  return useAsyncData(
    dirPath ? () => adapter.browse(dirPath) : null,
    [dirPath],
  );
}

export function useDetect(dirPath: string): FetchState<DetectData> {
  const adapter = useApiAdapter();
  return useAsyncData(
    dirPath ? () => adapter.detect(dirPath) : null,
    [dirPath],
  );
}
