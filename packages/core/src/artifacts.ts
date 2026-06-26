import fs from "node:fs";
import path from "node:path";
import { parseTasks } from "./tasks.js";
import { cliSchemaOrderProvider, type SchemaOrderProvider } from "./schema-order.js";
import type { ChangeArtifact } from "./types.js";

// 無權威順序時的預設 tab 順序；其餘 artifact 接在後面依檔名排序
const DEFAULT_ORDER = ["proposal", "design", "specs", "tasks"];

/** 由檔名（去副檔名）產生顯示標題：dash/underscore → 空格、字首大寫 */
function humanize(stem: string): string {
  return stem
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** 讀取 specs/ delta tree，回傳依 topic 排序的 { topic, content } 清單（空則為空陣列） */
function readSpecsTree(changePath: string): { topic: string; content: string }[] {
  const specsDir = path.join(changePath, "specs");
  if (!fs.existsSync(specsDir) || !fs.statSync(specsDir).isDirectory()) return [];
  const out: { topic: string; content: string }[] = [];
  for (const topic of fs.readdirSync(specsDir).filter((n) => !n.startsWith("."))) {
    const specPath = path.join(specsDir, topic, "spec.md");
    if (fs.existsSync(specPath)) out.push({ topic, content: fs.readFileSync(specPath, "utf-8") });
  }
  return out.sort((a, b) => a.topic.localeCompare(b.topic));
}

/** 計算 artifact 數量（root *.md + specs/ 非空各算一個），供 ChangeInfo 列表使用，不讀取內容 */
export function countArtifacts(changePath: string): number {
  if (!fs.existsSync(changePath)) return 0;
  const entries = fs.readdirSync(changePath, { withFileTypes: true });
  let count = entries.filter(
    (e) => e.isFile() && !e.name.startsWith(".") && e.name.toLowerCase().endsWith(".md"),
  ).length;
  if (readSpecsTree(changePath).length > 0) count += 1;
  return count;
}

/** 將 openspec artifact 的 outputPath 對應到已探索的 artifact key；對不到回 null */
function keyForOutputPath(outputPath: string, built: Map<string, ChangeArtifact>): string | null {
  const g = outputPath.trim();
  // glob：目前僅支援 specs tree 作為 glob 目標
  if (g.includes("*")) {
    if (/(^|\/)specs(\/|$)/.test(g) && built.has("specs")) return "specs";
    return null;
  }
  const base = g.split(/[\\/]/).pop() || g;
  const stem = base.replace(/\.md$/i, "");
  if (built.has(stem)) return stem;
  // 指向 specs/<topic>/spec.md 之類的字面路徑也對應到 specs artifact
  if (/^spec\.md$/i.test(base) && /specs/i.test(g) && built.has("specs")) return "specs";
  return null;
}

/**
 * 動態探索一個 change 目錄的 artifacts：
 * - root 每個 *.md（忽略 dotfile / 非 .md）→ markdown（tasks.md → tasks kind）
 * - 非空 specs/ → 單一 specs artifact
 * 排序：當 openspec CLI 可提供權威順序（schema 套用於該 change 的結果）時依其排序，
 * 對不到的 artifact 接在後面（DEFAULT_ORDER 優先，其餘字母序）；CLI 不可用時純用預設排序。
 * orderProvider 預設為 openspec CLI，可注入以利測試 / 其他來源。
 */
export function discoverArtifacts(
  repoRoot: string,
  changePath: string,
  slug?: string | null,
  orderProvider: SchemaOrderProvider = cliSchemaOrderProvider,
): ChangeArtifact[] {
  if (!fs.existsSync(changePath)) return [];

  const built = new Map<string, ChangeArtifact>();

  // root *.md
  const mdFiles = fs
    .readdirSync(changePath, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith(".") && e.name.toLowerCase().endsWith(".md"))
    .map((e) => e.name)
    .sort();
  for (const file of mdFiles) {
    const stem = file.replace(/\.md$/i, "");
    const content = fs.readFileSync(path.join(changePath, file), "utf-8");
    if (file.toLowerCase() === "tasks.md") {
      built.set(stem, { id: stem, title: humanize(stem), kind: "tasks", tasks: parseTasks(content) });
    } else {
      built.set(stem, { id: stem, title: humanize(stem), kind: "markdown", content });
    }
  }

  // specs tree
  const specs = readSpecsTree(changePath);
  if (specs.length > 0) {
    built.set("specs", { id: "specs", title: "Specs", kind: "specs", specs });
  }

  // 權威順序（openspec CLI）
  const refs = slug ? orderProvider(repoRoot, slug) : null;

  const ordered: ChangeArtifact[] = [];
  const usedIds = new Set<string>();

  if (refs) {
    for (const ref of refs) {
      const key = keyForOutputPath(ref.outputPath, built);
      if (key && !usedIds.has(key)) {
        ordered.push(built.get(key)!);
        usedIds.add(key);
      }
    }
  }

  // 剩餘 artifact：DEFAULT_ORDER 優先，其餘字母序
  const remaining = [...built.keys()].filter((id) => !usedIds.has(id));
  remaining.sort((a, b) => {
    const ia = DEFAULT_ORDER.indexOf(a);
    const ib = DEFAULT_ORDER.indexOf(b);
    const ra = ia === -1 ? Number.POSITIVE_INFINITY : ia;
    const rb = ib === -1 ? Number.POSITIVE_INFINITY : ib;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  for (const id of remaining) ordered.push(built.get(id)!);

  return ordered;
}
