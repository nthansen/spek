import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseTasks } from "./tasks.js";
import { getTimestamps } from "./git-cache.js";
import { listWorktrees, toWorktreeSource } from "./worktrees.js";
import { discoverArtifacts, countArtifacts } from "./artifacts.js";
import { cliSchemaOrderProvider, resolveSchemaOrder, type SchemaOrderProvider } from "./schema-order.js";
import type {
  SpecInfo,
  ChangeInfo,
  ChangeDetail,
  HistoryEntry,
  ScanResult,
  AggregatedScanResult,
  TaskStats,
  GraphData,
  GraphNode,
  GraphEdge,
  WorktreeInfo,
} from "./types.js";

function openspecDir(repoDir: string): string {
  return path.join(repoDir, "openspec");
}

function readFileOrNull(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

export function parseSlug(slug: string): { date: string | null; description: string } {
  const match = slug.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (match) {
    return { date: match[1], description: match[2].replace(/-/g, " ") };
  }
  return { date: null, description: slug.replace(/-/g, " ") };
}

function safeReadDir(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).filter((name) => !name.startsWith("."));
}

/** 遞迴收集目錄下所有檔案的絕對路徑（dotfile 一併納入，用於簽章 / mtime）。 */
function walkFiles(dir: string, acc: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
  return acc;
}

/**
 * change 目錄內最新檔案的修改時間（epoch ms）；空目錄 / 讀取失敗回 null。
 * 供排序在沒有 git timestamp 時 fallback，使剛編輯 / 未 commit 的 change 浮到最前。
 */
function newestMtimeMs(changePath: string): number | null {
  let newest: number | null = null;
  for (const file of walkFiles(changePath)) {
    try {
      const m = fs.statSync(file).mtimeMs;
      if (newest === null || m > newest) newest = m;
    } catch {
      // 忽略單一檔案 stat 失敗
    }
  }
  return newest;
}

/**
 * change 目錄的穩定內容簽章：對其下所有檔案的相對路徑＋內容雜湊。
 * 兩個 worktree 指向位元完全相同的 change（如 branch point 共享且未編輯）得到相同簽章；
 * 任一 worktree 有本地編輯即簽章相異。供聚合時判定同 slug 是「相同可收合」或「分歧須分列」。
 */
/**
 * 判定某檔名是否計入 change 內容簽章。只認 OpenSpec change 的內容檔
 * （`.md` / `.yaml` / `.yml`，涵蓋 proposal/design/tasks/specs 與 `.openspec.yaml`），
 * 藉此忽略作業系統與編輯器留下的雜物（`Thumbs.db`、`.DS_Store`、`*.swp`、`*~` 等）：
 * 同一 change 在不同 worktree 若只差這些未追蹤檔案，仍應得到相同簽章而收合，不因雜物分歧。
 */
export function isSignatureFile(name: string): boolean {
  return /\.(md|ya?ml)$/i.test(name);
}

export function changeSignature(changePath: string): string {
  const files = walkFiles(changePath)
    .filter((f) => isSignatureFile(path.basename(f)))
    .map((f) => ({ rel: path.relative(changePath, f).replace(/\\/g, "/"), abs: f }))
    .sort((a, b) => a.rel.localeCompare(b.rel));
  const hash = createHash("sha1");
  for (const { rel, abs } of files) {
    hash.update(rel);
    hash.update("\0");
    try {
      // 正規化換行（CRLF/CR → LF）再雜湊：同一 commit 的 change 在不同 worktree 可能因
      // autocrlf 而有不同換行（`git worktree add` 會依 autocrlf 重新 checkout），
      // 但內容實質相同，應收合而非因換行差異被視為分歧。
      const text = fs.readFileSync(abs, "utf-8").replace(/\r\n?/g, "\n");
      hash.update(text);
    } catch {
      hash.update("\0missing");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * change 的排序鍵（epoch ms，越大越新）：優先 git timestamp，其次 slug 日期，最後檔案 mtime。
 * 讓沒有 git timestamp 的（剛建立 / 未 commit 的 worktree-local）change 以 mtime 浮到最前，
 * 而非以空字串沉底。數值比較避免不同時區 offset 的 ISO 字串字典序誤判。
 */
function changeSortEpoch(c: ChangeInfo): number {
  if (c.timestamp) {
    const t = Date.parse(c.timestamp);
    if (!Number.isNaN(t)) return t;
  }
  if (c.date) {
    const t = Date.parse(`${c.date}T00:00:00Z`);
    if (!Number.isNaN(t)) return t;
  }
  if (c.mtime != null) return c.mtime;
  return 0;
}

/** 依排序鍵降序（最新在前）；同鍵維持穩定順序。 */
function compareChangesByRecency(a: ChangeInfo, b: ChangeInfo): number {
  return changeSortEpoch(b) - changeSortEpoch(a);
}

// 讀取 .openspec.yaml 的頂層 key:value 欄位（不支援 nested 結構，目前需求內僅有 schema/created）
export function parseChangeYaml(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) parsed[m[1]] = m[2].trim();
  }
  return parsed;
}

// 從 .openspec.yaml 解出 createdDate；格式不符（非 YYYY-MM-DD）視為 null
function readCreatedDate(changePath: string): string | null {
  const yamlPath = path.join(changePath, ".openspec.yaml");
  if (!fs.existsSync(yamlPath)) return null;
  const meta = parseChangeYaml(fs.readFileSync(yamlPath, "utf-8"));
  const value = meta["created"];
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

// 讀取 repo openspec/config.yaml 的 schema（change 未宣告 schema 時的 fallback）
function readRepoSchema(repoDir: string): string | null {
  const configPath = path.join(openspecDir(repoDir), "config.yaml");
  if (!fs.existsSync(configPath)) return null;
  const m = fs.readFileSync(configPath, "utf-8").match(/^schema:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// change 的 schema：優先取 change .openspec.yaml 的 schema，否則 fallback 回 repo config.yaml
function readChangeSchema(repoDir: string, changePath: string): string | null {
  const yamlPath = path.join(changePath, ".openspec.yaml");
  if (fs.existsSync(yamlPath)) {
    const meta = parseChangeYaml(fs.readFileSync(yamlPath, "utf-8"));
    if (meta["schema"]) return meta["schema"];
  }
  return readRepoSchema(repoDir);
}

function scanChangeDir(
  repoDir: string,
  changePath: string,
  slug: string,
  status: "active" | "archived",
): ChangeInfo {
  const { date, description } = parseSlug(slug);
  const hasProposal = fs.existsSync(path.join(changePath, "proposal.md"));
  const hasDesign = fs.existsSync(path.join(changePath, "design.md"));
  const hasTasks = fs.existsSync(path.join(changePath, "tasks.md"));
  const hasSpecs = fs.existsSync(path.join(changePath, "specs"));

  let taskStats: TaskStats | null = null;
  if (hasTasks) {
    const content = fs.readFileSync(path.join(changePath, "tasks.md"), "utf-8");
    const parsed = parseTasks(content);
    taskStats = { total: parsed.total, completed: parsed.completed };
  }

  const createdDate = readCreatedDate(changePath);
  // archive folder 強制 YYYY-MM-DD-slug 命名（parseSlug 已處理），active 一律 null
  const archivedDate = status === "archived" ? date : null;

  return {
    slug,
    date,
    timestamp: null,
    createdDate,
    archivedDate,
    description,
    status,
    hasProposal,
    hasDesign,
    hasTasks,
    hasSpecs,
    artifactCount: countArtifacts(changePath),
    schema: readChangeSchema(repoDir, changePath),
    taskStats,
    mtime: newestMtimeMs(changePath),
  };
}

export async function scanOpenSpec(repoDir: string): Promise<ScanResult> {
  const base = openspecDir(repoDir);
  const specsDir = path.join(base, "specs");
  const changesDir = path.join(base, "changes");
  const archiveDir = path.join(changesDir, "archive");

  const specs: SpecInfo[] = safeReadDir(specsDir)
    .filter((name) => fs.statSync(path.join(specsDir, name)).isDirectory())
    .map((topic) => ({ topic, path: path.join(specsDir, topic, "spec.md"), historyCount: 0 }))
    .filter((s) => fs.existsSync(s.path))
    .sort((a, b) => a.topic.localeCompare(b.topic));

  // 取得 git timestamps
  const timestamps = await getTimestamps(repoDir);

  const activeChanges: ChangeInfo[] = safeReadDir(changesDir)
    .filter((name) => name !== "archive")
    .filter((name) => fs.statSync(path.join(changesDir, name)).isDirectory())
    .map((slug) => {
      const info = scanChangeDir(repoDir, path.join(changesDir, slug), slug, "active");
      info.timestamp = timestamps.get(slug) || null;
      return info;
    })
    .sort(compareChangesByRecency);

  const archivedChanges: ChangeInfo[] = safeReadDir(archiveDir)
    .filter((name) => fs.statSync(path.join(archiveDir, name)).isDirectory())
    .map((slug) => {
      const info = scanChangeDir(repoDir, path.join(archiveDir, slug), slug, "archived");
      info.timestamp = timestamps.get(slug) || null;
      return info;
    })
    .sort(compareChangesByRecency);

  // 計算每個 spec 被多少 changes 引用
  const allChangeDirs = [
    ...safeReadDir(changesDir).filter((n) => n !== "archive").map((n) => path.join(changesDir, n)),
    ...safeReadDir(archiveDir).map((n) => path.join(archiveDir, n)),
  ];
  for (const spec of specs) {
    spec.historyCount = allChangeDirs.filter((dir) =>
      fs.existsSync(path.join(dir, "specs", spec.topic, "spec.md"))
    ).length;
  }

  return { specs, activeChanges, archivedChanges };
}

export async function readSpec(
  repoDir: string,
  topic: string,
): Promise<{ topic: string; content: string; relatedChanges: string[]; history: HistoryEntry[] } | null> {
  const specPath = path.join(openspecDir(repoDir), "specs", topic, "spec.md");
  const content = readFileOrNull(specPath);
  if (content === null) return null;

  const relatedChanges = findRelatedChanges(repoDir, topic);

  // 取得 git timestamp cache
  const timestamps = await getTimestamps(repoDir);

  // 建立歷史紀錄，含日期、git timestamp 與描述
  const base = openspecDir(repoDir);
  const changesDir = path.join(base, "changes");
  const archiveDir = path.join(changesDir, "archive");

  const history: HistoryEntry[] = relatedChanges.map((slug) => {
    const { date, description } = parseSlug(slug);
    const isArchived = fs.existsSync(path.join(archiveDir, slug));
    const timestamp = timestamps.get(slug) || null;
    return { slug, date, timestamp, description, status: isArchived ? "archived" : "active" };
  });

  // 按 git timestamp 降序排列，無 timestamp 時 fallback 回 slug 日期
  history.sort((a, b) => {
    const ta = a.timestamp || a.date || "";
    const tb = b.timestamp || b.date || "";
    return tb.localeCompare(ta);
  });

  return { topic, content, relatedChanges, history };
}

export async function readChange(
  repoDir: string,
  slug: string,
  orderProvider: SchemaOrderProvider = cliSchemaOrderProvider,
): Promise<ChangeDetail | null> {
  const base = openspecDir(repoDir);
  const changesDir = path.join(base, "changes");

  // 在 active 和 archive 中尋找
  let changePath = path.join(changesDir, slug);
  let status: "active" | "archived" = "active";
  if (!fs.existsSync(changePath)) {
    changePath = path.join(changesDir, "archive", slug);
    status = "archived";
  }
  if (!fs.existsSync(changePath)) return null;

  // 讀取 .openspec.yaml metadata（保留所有 key 供未來擴充）
  const metaPath = path.join(changePath, ".openspec.yaml");
  let metadata: Record<string, unknown> | null = null;
  if (fs.existsSync(metaPath)) {
    metadata = parseChangeYaml(fs.readFileSync(metaPath, "utf-8"));
  }

  const schema = readChangeSchema(repoDir, changePath);
  // artifact 依 mtime 由新到舊排序（見 discoverArtifacts）
  const artifacts = discoverArtifacts(changePath);

  // schema 權威順序（供前端 schema-order 排序用）：只對 active change 查詢 CLI，
  // archived change 無 planningArtifacts，直接為 null（前端顯示 archived 退回訊息）
  const refs = status === "active" ? await orderProvider(repoDir, slug) : null;
  const schemaOrder = resolveSchemaOrder(refs, artifacts.map((a) => a.id)) ?? undefined;

  const createdDate = readCreatedDate(changePath);
  const archivedDate = status === "archived" ? parseSlug(slug).date : null;

  return {
    slug,
    status,
    createdDate,
    archivedDate,
    schema,
    artifacts,
    schemaOrder,
    metadata,
  };
}

/**
 * 聚合感知地讀取單一 change，並在來源 worktree 已消失時平順退化。
 * - `aggregate === false` 或單一 / 非 git worktree：等同 `readChange(repoDir, slug)`。
 * - 指定 `wtKey` 且該 worktree 仍存在且含此 slug：從該 worktree 讀取並附 `source`。
 * - `wtKey` 不存在、或該 worktree 已無此 slug（例如合併後被 prune）：退回任一仍含此 slug
 *   的 worktree，主 worktree 優先，不報錯。
 * 找不到任何含此 slug 的 worktree 時回 null。
 */
export async function readChangeAggregated(
  repoDir: string,
  slug: string,
  opts: { wtKey?: string; aggregate?: boolean } = {},
): Promise<ChangeDetail | null> {
  const aggregate = opts.aggregate !== false;
  const worktrees = aggregate ? await listWorktrees(repoDir) : [];

  if (worktrees.length <= 1) {
    return readChange(repoDir, slug);
  }

  // 解析順序：先指定的 wtKey，再主 worktree，最後其餘 worktree。主 worktree = 第一個非 bare。
  const mainWt = worktrees.find((w) => !w.isBare) ?? worktrees[0];
  const requested = opts.wtKey ? worktrees.find((w) => w.key === opts.wtKey) : undefined;
  const ordered: WorktreeInfo[] = [];
  const pushUnique = (wt: WorktreeInfo | undefined) => {
    if (wt && !wt.isBare && !ordered.some((o) => o.key === wt.key)) ordered.push(wt);
  };
  pushUnique(requested);
  pushUnique(mainWt);
  for (const wt of worktrees) pushUnique(wt);

  // membership：所有仍含此 slug 的 worktree（主 worktree 排第一），供 detail 的 worktree 切換器用
  const changeExistsIn = (wtPath: string) => {
    const changesDir = path.join(openspecDir(wtPath), "changes");
    return (
      fs.existsSync(path.join(changesDir, slug)) ||
      fs.existsSync(path.join(changesDir, "archive", slug))
    );
  };
  const membership = ordered
    .filter((wt) => changeExistsIn(wt.path))
    .sort((a, b) => (a.key === mainWt.key ? -1 : b.key === mainWt.key ? 1 : 0))
    .map(toWorktreeSource);

  for (const wt of ordered) {
    const detail = await readChange(wt.path, slug);
    if (detail) return { ...detail, source: toWorktreeSource(wt), worktrees: membership };
  }
  return null;
}

export function readSpecAtChange(
  repoDir: string,
  topic: string,
  slug: string,
): { content: string } | null {
  const base = openspecDir(repoDir);
  const changesDir = path.join(base, "changes");

  // 先檢查 active changes
  let specPath = path.join(changesDir, slug, "specs", topic, "spec.md");
  let content = readFileOrNull(specPath);
  if (content !== null) return { content };

  // 再檢查 archive
  specPath = path.join(changesDir, "archive", slug, "specs", topic, "spec.md");
  content = readFileOrNull(specPath);
  if (content !== null) return { content };

  return null;
}

export function buildGraphData(repoDir: string): GraphData {
  const base = openspecDir(repoDir);
  const specsDir = path.join(base, "specs");
  const changesDir = path.join(base, "changes");
  const archiveDir = path.join(changesDir, "archive");

  // 收集所有 spec topics
  const specTopics = safeReadDir(specsDir)
    .filter((name) => fs.statSync(path.join(specsDir, name)).isDirectory())
    .filter((topic) => fs.existsSync(path.join(specsDir, topic, "spec.md")));

  // 收集所有 change dirs（active + archived）
  const changeDirs: { slug: string; dirPath: string; status: "active" | "archived" }[] = [];
  for (const slug of safeReadDir(changesDir)) {
    if (slug === "archive") continue;
    const dirPath = path.join(changesDir, slug);
    if (fs.statSync(dirPath).isDirectory()) {
      changeDirs.push({ slug, dirPath, status: "active" });
    }
  }
  for (const slug of safeReadDir(archiveDir)) {
    const dirPath = path.join(archiveDir, slug);
    if (fs.statSync(dirPath).isDirectory()) {
      changeDirs.push({ slug, dirPath, status: "archived" });
    }
  }

  // 建立邊：掃描每個 change 的 specs/ 子目錄
  const edges: GraphEdge[] = [];
  const changeSpecCounts = new Map<string, number>();
  const specHistoryCounts = new Map<string, number>();

  for (const { slug, dirPath, status: _status } of changeDirs) {
    const changeSpecsDir = path.join(dirPath, "specs");
    if (!fs.existsSync(changeSpecsDir)) continue;

    let specCount = 0;
    for (const topic of safeReadDir(changeSpecsDir)) {
      if (fs.existsSync(path.join(changeSpecsDir, topic, "spec.md"))) {
        edges.push({
          source: `change:${slug}`,
          target: `spec:${topic}`,
        });
        specCount++;
        specHistoryCounts.set(topic, (specHistoryCounts.get(topic) || 0) + 1);
      }
    }
    if (specCount > 0) {
      changeSpecCounts.set(slug, specCount);
    }
  }

  // 建立節點
  const nodes: GraphNode[] = [];

  // Spec 節點
  for (const topic of specTopics) {
    nodes.push({
      id: `spec:${topic}`,
      type: "spec",
      label: topic,
      historyCount: specHistoryCounts.get(topic) || 0,
    });
  }

  // Change 節點（只包含有 specs 的 changes）
  for (const { slug, status } of changeDirs) {
    const specCount = changeSpecCounts.get(slug);
    if (!specCount) continue;
    const { date, description } = parseSlug(slug);
    nodes.push({
      id: `change:${slug}`,
      type: "change",
      label: description,
      date,
      status,
      specCount,
    });
  }

  return { nodes, edges };
}

export function findRelatedChanges(repoDir: string, topic: string): string[] {
  const base = openspecDir(repoDir);
  const changesDir = path.join(base, "changes");
  const archiveDir = path.join(changesDir, "archive");
  const related: string[] = [];

  // 搜尋 active changes
  for (const slug of safeReadDir(changesDir)) {
    if (slug === "archive") continue;
    const deltaSpec = path.join(changesDir, slug, "specs", topic, "spec.md");
    if (fs.existsSync(deltaSpec)) related.push(slug);
  }

  // 搜尋 archived changes
  for (const slug of safeReadDir(archiveDir)) {
    const deltaSpec = path.join(archiveDir, slug, "specs", topic, "spec.md");
    if (fs.existsSync(deltaSpec)) related.push(slug);
  }

  return related;
}

/**
 * 跨 worktree 聚合掃描。探索 repoDir 所屬 repo 的所有 worktree，
 * active changes 聯集不去重並附 source、archived changes 依 slug 去重（主 worktree 優先）、
 * specs 取主 worktree。關閉聚合、非 git、或單一 worktree 時等同 scanOpenSpec(repoDir)。
 */
export async function scanOpenSpecAggregated(
  repoDir: string,
  options: { aggregate?: boolean } = {},
): Promise<AggregatedScanResult> {
  const aggregate = options.aggregate !== false;
  // 一律探索 worktree，讓 UI 即使在關閉聚合時仍知道有多個 worktree（可重新開啟聚合）
  const worktrees = await listWorktrees(repoDir);

  if (!aggregate || worktrees.length <= 1) {
    const single = await scanOpenSpec(repoDir);
    return { ...single, worktrees, aggregated: false };
  }

  // 各 worktree 平行掃描
  const scans = await Promise.all(
    worktrees.map(async (wt) => ({ wt, scan: await scanOpenSpec(wt.path) })),
  );

  // 主 worktree = 第一個非 bare（通常即 worktrees[0]）
  const main = scans.find((s) => !s.wt.isBare) ?? scans[0];

  // active changes：所有 worktree 聯集，同 slug 依內容簽章調解——
  // 內容相同則收合成單列並附 membership，內容分歧則分列。
  const activeChanges = mergeActiveChanges(scans, main.wt);

  // archived changes：依 slug 去重，主 worktree 優先，其餘只在獨有時加入
  const archivedBySlug = new Map<string, ChangeInfo>();
  for (const c of main.scan.archivedChanges) {
    archivedBySlug.set(c.slug, { ...c, source: toWorktreeSource(main.wt) });
  }
  for (const { wt, scan } of scans) {
    if (wt === main.wt) continue;
    const source = toWorktreeSource(wt);
    for (const c of scan.archivedChanges) {
      if (!archivedBySlug.has(c.slug)) {
        archivedBySlug.set(c.slug, { ...c, source });
      }
    }
  }
  const archivedChanges = [...archivedBySlug.values()];

  activeChanges.sort(compareChangesByRecency);
  archivedChanges.sort(compareChangesByRecency);

  return {
    specs: main.scan.specs,
    activeChanges,
    archivedChanges,
    worktrees,
    aggregated: true,
  };
}

/**
 * 聚合各 worktree 的 active changes：以 slug 分組，同 slug 依內容簽章調解。
 * - unique slug：單列，source 與 membership 皆指向該 worktree。
 * - 同 slug 內容相同：收合成單列，primary source 主 worktree 優先（否則首見者），
 *   membership 列出全部出現的 worktree（主 worktree 排第一）。
 * - 同 slug 內容分歧：每個相異簽章各自分列，各帶自身 source 與 membership。
 */
function mergeActiveChanges(
  scans: { wt: WorktreeInfo; scan: ScanResult }[],
  mainWt: WorktreeInfo,
): ChangeInfo[] {
  // slug -> 各 worktree 的該 change
  const bySlug = new Map<string, { wt: WorktreeInfo; change: ChangeInfo }[]>();
  for (const { wt, scan } of scans) {
    for (const change of scan.activeChanges) {
      const list = bySlug.get(change.slug) ?? [];
      list.push({ wt, change });
      bySlug.set(change.slug, list);
    }
  }

  const changePath = (wt: WorktreeInfo, slug: string) =>
    path.join(openspecDir(wt.path), "changes", slug);
  // membership 主 worktree 排第一，其餘依 branch / key 穩定排序
  const orderMembers = (members: WorktreeInfo[]) =>
    [...members]
      .sort((a, b) => {
        if (a.key === mainWt.key) return -1;
        if (b.key === mainWt.key) return 1;
        return (a.branch ?? a.key).localeCompare(b.branch ?? b.key);
      })
      .map(toWorktreeSource);

  const result: ChangeInfo[] = [];
  for (const [slug, entries] of bySlug) {
    if (entries.length === 1) {
      const { wt, change } = entries[0];
      result.push({ ...change, source: toWorktreeSource(wt), worktrees: orderMembers([wt]) });
      continue;
    }
    // 同 slug 出現在多個 worktree：只在此時才算內容簽章
    const bySig = new Map<string, { wt: WorktreeInfo; change: ChangeInfo }[]>();
    for (const entry of entries) {
      const sig = changeSignature(changePath(entry.wt, slug));
      const group = bySig.get(sig) ?? [];
      group.push(entry);
      bySig.set(sig, group);
    }
    for (const group of bySig.values()) {
      const primary = group.find((e) => e.wt.key === mainWt.key) ?? group[0];
      result.push({
        ...primary.change,
        source: toWorktreeSource(primary.wt),
        worktrees: orderMembers(group.map((e) => e.wt)),
      });
    }
  }
  return result;
}

/**
 * 跨 worktree 聚合的關聯圖。change 節點涵蓋所有 worktree（active 不去重、archived 依 slug 去重），
 * 節點 id 命名為 `change:<worktreeKey>:<slug>` 避免碰撞；spec 節點只取主 worktree。
 * 關閉聚合、非 git、或單一 worktree 時等同 buildGraphData(repoDir)。
 */
export async function buildGraphDataAggregated(
  repoDir: string,
  options: { aggregate?: boolean } = {},
): Promise<GraphData> {
  const aggregate = options.aggregate !== false;
  const worktrees = aggregate ? await listWorktrees(repoDir) : [];

  if (!aggregate || worktrees.length <= 1) {
    return buildGraphData(repoDir);
  }

  const main = worktrees.find((w) => !w.isBare) ?? worktrees[0];

  // spec 節點：只取主 worktree
  const nodes: GraphNode[] = buildGraphData(main.path).nodes
    .filter((n) => n.type === "spec")
    .map((n) => ({ ...n }));
  const edges: GraphEdge[] = [];
  const seenArchivedSlugs = new Set<string>();
  const historyCounts = new Map<string, number>();

  // 主 worktree 先處理，確保 archived 去重以主 worktree 為準
  const ordered = [main, ...worktrees.filter((w) => w !== main)];
  for (const wt of ordered) {
    if (wt.isBare) continue;
    const g = buildGraphData(wt.path);
    const source = toWorktreeSource(wt);
    const idMap = new Map<string, string>();
    for (const node of g.nodes) {
      if (node.type !== "change") continue;
      const slug = node.id.slice("change:".length);
      if (node.status === "archived") {
        if (seenArchivedSlugs.has(slug)) continue;
        seenArchivedSlugs.add(slug);
      }
      const newId = `change:${wt.key}:${slug}`;
      idMap.set(node.id, newId);
      nodes.push({ ...node, id: newId, source });
    }
    for (const edge of g.edges) {
      const newSource = idMap.get(edge.source);
      if (!newSource) continue;
      edges.push({ source: newSource, target: edge.target });
      historyCounts.set(edge.target, (historyCounts.get(edge.target) || 0) + 1);
    }
  }

  // 依聚合後的 edge 重算 spec 節點 historyCount
  for (const node of nodes) {
    if (node.type === "spec") {
      node.historyCount = historyCounts.get(node.id) || 0;
    }
  }

  return { nodes, edges };
}
