import { execSync } from "node:child_process";

/** schema 中單一 artifact 的權威參照（由 openspec CLI 提供） */
export interface SchemaArtifactRef {
  /** openspec artifact id（如 brainstorm / proposal / specs） */
  id: string;
  /** 該 artifact 的產出路徑：字面檔名（proposal.md）或 glob（specs/**\/*.md） */
  outputPath: string;
}

/**
 * 提供某個 change 的權威 artifact 順序。回 null 代表無法取得（CLI 不存在、change 為
 * archived、或任何錯誤），此時呼叫端會退回檔案系統預設排序。
 */
export type SchemaOrderProvider = (repoRoot: string, slug: string) => SchemaArtifactRef[] | null;

/**
 * 由 `openspec status --change <slug> --json` 的輸出萃取權威 artifact 順序：
 * actionContext.planningArtifacts 提供順序，artifactPaths[id].outputPath 提供產出路徑。
 * 純函式，方便單元測試；解析不出任何 artifact 時回 null。
 */
export function parseOrderFromStatus(json: unknown): SchemaArtifactRef[] | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const actionContext = obj.actionContext as Record<string, unknown> | undefined;
  const order = actionContext?.planningArtifacts;
  const paths = obj.artifactPaths as Record<string, { outputPath?: unknown }> | undefined;
  if (!Array.isArray(order) || !paths) return null;

  const refs: SchemaArtifactRef[] = [];
  for (const id of order) {
    if (typeof id !== "string") continue;
    const outputPath = paths[id]?.outputPath;
    if (typeof outputPath === "string") refs.push({ id, outputPath });
  }
  return refs.length > 0 ? refs : null;
}

// 同一次掃描內以 (repoRoot, slug) 記憶結果，避免對同一 change 重複 spawn CLI
const cache = new Map<string, SchemaArtifactRef[] | null>();

// Stryker disable all: 對 openspec CLI 的薄整合層（spawn 子行程）；以整合而非單元測試覆蓋。
// 萃取邏輯在 parseOrderFromStatus（已單元測試）；此處只負責呼叫與容錯。
/**
 * 預設 SchemaOrderProvider：呼叫 openspec CLI 取得權威順序。
 * openspec 未安裝 / 非 0 結束 / archived change / 解析失敗時一律回 null（退回預設排序）。
 */
export const cliSchemaOrderProvider: SchemaOrderProvider = (repoRoot, slug) => {
  const cacheKey = `${repoRoot}::${slug}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  let result: SchemaArtifactRef[] | null = null;
  // slug 來自資料夾名稱；限定安全字元（不含 shell metacharacter）後才以 shell 帶入，
  // 讓 Windows 能解析 openspec.cmd。用 execSync(string) 避免 execFile+shell 的 DEP0190 警告。
  if (/^[\w.-]+$/.test(slug)) {
    try {
      const out = execSync(`openspec status --change ${slug} --json`, {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 10000,
        windowsHide: true,
      });
      result = parseOrderFromStatus(JSON.parse(out));
    } catch {
      result = null;
    }
  }

  cache.set(cacheKey, result);
  return result;
};
// Stryker restore all

/** 測試用：清掉 CLI 順序快取 */
export function clearSchemaOrderCache(): void {
  cache.clear();
}
