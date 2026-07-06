// 跨導覽的 stale-while-revalidate 小快取：讓重新掛載的頁面（例如回到 Changes）立即顯示上次
// 的資料、背景再重新驗證，避免每次導覽都清空成 loading 而「閃一下像全新載入」。
// 只快取有明確 key 的請求（key 內含 repoPath / aggregate / slug 等，故切 repo / 參數不會誤中）。

const store = new Map<string, unknown>();

export function getCached<T>(key: string | undefined): T | undefined {
  return key === undefined ? undefined : (store.get(key) as T | undefined);
}

export function setCached(key: string | undefined, value: unknown): void {
  if (key !== undefined) store.set(key, value);
}

/** 測試用：清空快取。 */
export function clearCache(): void {
  store.clear();
}

export interface FetchStateShape<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * 掛載 / 依賴變動時的初始狀態：有快取則直接帶入資料且不 loading（背景重新驗證），
 * 無快取但有 fetcher 才顯示 loading（首訪才閃一次），無 fetcher 則 idle。
 */
export function initialFetchState<T>(cached: T | undefined, hasFetcher: boolean): FetchStateShape<T> {
  if (cached !== undefined) return { data: cached, loading: false, error: null };
  return { data: null, loading: hasFetcher, error: null };
}
