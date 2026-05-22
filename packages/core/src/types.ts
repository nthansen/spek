import type { ParsedTasks, TaskStats } from "./tasks.js";

export interface SpecInfo {
  topic: string;
  path: string;
  historyCount: number;
}

export interface HistoryEntry {
  slug: string;
  date: string | null;
  timestamp: string | null;
  description: string;
  status: "active" | "archived";
}

export interface SpecDetail {
  topic: string;
  content: string;
  relatedChanges: string[];
  history: HistoryEntry[];
}

/** 一個 git worktree 的完整資訊，由 `git worktree list --porcelain` 解析而來。 */
export interface WorktreeInfo {
  /** worktree 絕對路徑 */
  path: string;
  /** branch 名稱；detached HEAD 為 null */
  branch: string | null;
  /** HEAD commit hash；無 commit 時為 null */
  head: string | null;
  /** 是否為主 worktree（git worktree list 第一項，含 .git 目錄者） */
  isMain: boolean;
  /** 是否為 bare repo */
  isBare: boolean;
  /** 穩定的 worktree 識別碼（絕對路徑雜湊前 8 碼） */
  key: string;
}

/** 附加在聚合後 change 上的來源 worktree 資訊（WorktreeInfo 的精簡子集）。 */
export interface WorktreeSource {
  key: string;
  path: string;
  branch: string | null;
  isMain: boolean;
}

export interface ChangeInfo {
  slug: string;
  date: string | null;
  timestamp: string | null;
  createdDate: string | null;
  archivedDate: string | null;
  description: string;
  status: "active" | "archived";
  hasProposal: boolean;
  hasDesign: boolean;
  hasTasks: boolean;
  hasSpecs: boolean;
  taskStats: TaskStats | null;
  /** 來源 worktree；僅聚合掃描會填入，單一目錄掃描為 undefined */
  source?: WorktreeSource;
}

export interface ChangeDetail {
  slug: string;
  status: "active" | "archived";
  createdDate: string | null;
  archivedDate: string | null;
  proposal: string | null;
  design: string | null;
  tasks: ParsedTasks | null;
  specs: { topic: string; content: string }[];
  metadata: Record<string, unknown> | null;
  /** 來源 worktree；僅聚合讀取會填入 */
  source?: WorktreeSource;
}

export interface ChangesData {
  active: ChangeInfo[];
  archived: ChangeInfo[];
  /** 偵測到的 worktree 清單；僅聚合時填入 */
  worktrees?: WorktreeInfo[];
  /** 本次回應是否為跨 worktree 聚合結果 */
  aggregated?: boolean;
}

export interface OverviewData {
  specsCount: number;
  changesCount: { active: number; archived: number };
  taskStats: TaskStats;
}

export interface ScanResult {
  specs: SpecInfo[];
  activeChanges: ChangeInfo[];
  archivedChanges: ChangeInfo[];
}

/** scanOpenSpecAggregated 的回傳：ScanResult 外加 worktree 清單與是否聚合。 */
export interface AggregatedScanResult extends ScanResult {
  worktrees: WorktreeInfo[];
  aggregated: boolean;
}

export interface SearchResult {
  type: "spec" | "change";
  title: string;
  slug?: string;
  topic?: string;
  context: string;
  file?: string;
}

export interface BrowseEntry {
  name: string;
  type: "directory" | "file";
  path: string;
}

export interface BrowseData {
  path: string;
  entries: BrowseEntry[];
}

export interface DetectData {
  hasOpenSpec: boolean;
  schema?: string;
}

export interface SpecVersionContent {
  content: string;
}

export interface GraphNode {
  id: string;
  type: "spec" | "change";
  label: string;
  date?: string | null;
  status?: "active" | "archived";
  historyCount?: number;
  specCount?: number;
  /** change 節點的來源 worktree；僅聚合圖會填入 */
  source?: WorktreeSource;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type { TaskItem, TaskSection, TaskStats, ParsedTasks } from "./tasks.js";
