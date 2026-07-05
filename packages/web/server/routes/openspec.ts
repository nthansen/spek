import { Router, Request, Response, NextFunction } from "express";
import Fuse from "fuse.js";
import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import {
  scanOpenSpec,
  scanOpenSpecAggregated,
  readSpec,
  readChangeAggregated,
  readSpecAtChange,
  resyncTimestamps,
  buildGraphDataAggregated,
  listWorktrees,
  normalizeWorktreePath,
} from "@spek/core";

// --- File watcher 共享管理 ---

/** 被監看的一個 worktree 的 openspec 根（正規化）與其 worktree key（非 git 時為 null）。 */
interface WatchRoot {
  openspecRoot: string;
  key: string | null;
}

interface WatcherEntry {
  watcher: FSWatcher;
  clients: Set<Response>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  roots: WatchRoot[];
  /** 本 debounce 視窗內最後一個變動的 worktree key，附在推送事件上供前端標活動 */
  lastWorktree: string | null;
}

const watchers = new Map<string, WatcherEntry>();

// 由變動檔案路徑反查所屬 worktree key（正規化前綴比對）。
function worktreeKeyForPath(roots: WatchRoot[], filePath: string): string | null {
  const norm = normalizeWorktreePath(filePath);
  for (const r of roots) {
    if (norm === r.openspecRoot || norm.startsWith(r.openspecRoot + "/")) return r.key;
  }
  return null;
}

// 一律監看給定 worktree 集合的每個 openspec/。key 以主 worktree 正規化路徑辨識，
// 讓同 repo（不論指向哪個 worktree）的多個 client 共用同一 watcher。
function getOrCreateWatcher(key: string, worktreeDirs: { path: string; key: string | null }[]): WatcherEntry {
  const existing = watchers.get(key);
  if (existing) return existing;

  const roots: WatchRoot[] = worktreeDirs.map((w) => ({
    openspecRoot: normalizeWorktreePath(path.join(w.path, "openspec")),
    key: w.key,
  }));
  const watchPaths = worktreeDirs.map((w) => path.join(w.path, "openspec"));
  const watcher = chokidar.watch(watchPaths, {
    ignored: (filePath: string) => {
      // 只監聽 .md 和 .yaml 檔案（以及目錄）
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return !filePath.endsWith(".md") && !filePath.endsWith(".yaml");
      }
      return false;
    },
    ignoreInitial: true,
    persistent: true,
  });

  const entry: WatcherEntry = {
    watcher,
    clients: new Set(),
    debounceTimer: null,
    roots,
    lastWorktree: null,
  };

  const onEvent = (filePath: string) => {
    const wtKey = worktreeKeyForPath(entry.roots, filePath);
    if (wtKey) entry.lastWorktree = wtKey;
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(() => {
      entry.debounceTimer = null;
      const payload = JSON.stringify({ type: "changed", worktree: entry.lastWorktree ?? undefined });
      entry.lastWorktree = null;
      for (const client of entry.clients) {
        client.write(`data: ${payload}\n\n`);
      }
    }, 500);
  };

  watcher.on("add", onEvent);
  watcher.on("change", onEvent);
  watcher.on("unlink", onEvent);

  watchers.set(key, entry);
  return entry;
}

function removeClient(key: string, client: Response) {
  const entry = watchers.get(key);
  if (!entry) return;
  entry.clients.delete(client);
  if (entry.clients.size === 0) {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.watcher.close();
    watchers.delete(key);
  }
}

export const openspecRouter = Router();

// 所有 openspec routes 需要 dir 參數
openspecRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.query.dir) {
    res.status(400).json({ error: "dir parameter is required" });
    return;
  }
  next();
});

openspecRouter.get("/overview", async (req, res) => {
  const dir = req.query.dir as string;
  const aggregate = req.query.aggregate !== "false";
  const scan = await scanOpenSpecAggregated(dir, { aggregate });

  let totalTasks = 0;
  let completedTasks = 0;
  for (const change of [...scan.activeChanges, ...scan.archivedChanges]) {
    if (change.taskStats) {
      totalTasks += change.taskStats.total;
      completedTasks += change.taskStats.completed;
    }
  }

  res.json({
    specsCount: scan.specs.length,
    changesCount: {
      active: scan.activeChanges.length,
      archived: scan.archivedChanges.length,
    },
    taskStats: { total: totalTasks, completed: completedTasks },
  });
});

openspecRouter.get("/specs", async (req, res) => {
  const dir = req.query.dir as string;
  const scan = await scanOpenSpec(dir);
  res.json(scan.specs);
});

openspecRouter.get("/specs/:topic", async (req, res) => {
  const dir = req.query.dir as string;
  const result = await readSpec(dir, req.params.topic);
  if (!result) {
    res.status(404).json({ error: "Spec not found" });
    return;
  }
  res.json(result);
});

openspecRouter.get("/specs/:topic/at/:slug", (req, res) => {
  const dir = req.query.dir as string;
  const result = readSpecAtChange(dir, req.params.topic, req.params.slug);
  if (!result) {
    res.status(404).json({ error: "Spec version not found" });
    return;
  }
  res.json(result);
});

openspecRouter.get("/changes", async (req, res) => {
  const dir = req.query.dir as string;
  const aggregate = req.query.aggregate !== "false";
  const scan = await scanOpenSpecAggregated(dir, { aggregate });
  res.json({
    active: scan.activeChanges,
    archived: scan.archivedChanges,
    worktrees: scan.worktrees,
    aggregated: scan.aggregated,
  });
});

openspecRouter.get("/changes/:slug", async (req, res) => {
  const dir = req.query.dir as string;
  const wt = req.query.wt as string | undefined;
  const aggregate = req.query.aggregate !== "false";

  // 聚合感知讀取：解析 wt→worktree；來源 worktree 已消失時退回仍含此 slug 的 worktree（主優先）
  const result = await readChangeAggregated(dir, req.params.slug, { wtKey: wt, aggregate });
  if (!result) {
    res.status(404).json({ error: "Change not found" });
    return;
  }
  res.json(result);
});

interface SearchDocument {
  type: "spec" | "change";
  name: string;
  content: string;
}

openspecRouter.get("/search", (req, res) => {
  const dir = req.query.dir as string;
  const q = req.query.q as string;

  if (!q) {
    res.status(400).json({ error: "q parameter is required" });
    return;
  }

  const documents: SearchDocument[] = [];
  const openspecBase = path.join(dir, "openspec");

  // 收集 specs 內容
  const specsDir = path.join(openspecBase, "specs");
  if (fs.existsSync(specsDir)) {
    for (const topic of fs.readdirSync(specsDir)) {
      const specPath = path.join(specsDir, topic, "spec.md");
      if (fs.existsSync(specPath)) {
        documents.push({
          type: "spec",
          name: topic,
          content: fs.readFileSync(specPath, "utf-8"),
        });
      }
    }
  }

  // 收集 changes 內容（active + archived）：索引每個 change 內所有 root *.md artifact，
  // 不再限定 proposal/design/tasks，使自訂 schema 的 brainstorm/plan/verify 等也可被搜尋
  const changesDir = path.join(openspecBase, "changes");
  const collectChanges = (baseDir: string) => {
    if (!fs.existsSync(baseDir)) return;
    for (const slug of fs.readdirSync(baseDir)) {
      if (slug === "archive") continue;
      const changePath = path.join(baseDir, slug);
      if (!fs.statSync(changePath).isDirectory()) continue;

      for (const entry of fs.readdirSync(changePath, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.startsWith(".")) continue;
        if (!entry.name.toLowerCase().endsWith(".md")) continue;
        documents.push({
          type: "change",
          name: slug,
          content: fs.readFileSync(path.join(changePath, entry.name), "utf-8"),
        });
      }
    }
  };

  collectChanges(changesDir);
  collectChanges(path.join(changesDir, "archive"));

  const fuse = new Fuse(documents, {
    keys: ["content"],
    includeScore: true,
    includeMatches: true,
    threshold: 0.4,
  });

  const results = fuse.search(q);

  const response = results.map((r) => {
    const matches =
      r.matches?.map((m) => {
        const value = m.value || "";
        const indices = m.indices || [];
        return indices.slice(0, 3).map(([start, end]) => {
          const contextStart = Math.max(0, start - 100);
          const contextEnd = Math.min(value.length, end + 101);
          return value.slice(contextStart, contextEnd);
        });
      }).flat() || [];

    const name = r.item.name;
    const title = r.item.type === "change"
      ? name.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ")
      : name;

    return {
      type: r.item.type,
      title,
      topic: r.item.type === "spec" ? name : undefined,
      slug: r.item.type === "change" ? name : undefined,
      context: matches[0] || "",
    };
  });

  res.json(response);
});

openspecRouter.get("/graph", async (req, res) => {
  const dir = req.query.dir as string;
  const aggregate = req.query.aggregate !== "false";
  const graphData = await buildGraphDataAggregated(dir, { aggregate });
  res.json(graphData);
});

// --- SSE file watching endpoint ---

openspecRouter.get("/watch", async (req, res) => {
  const dir = req.query.dir as string;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // 送一個初始 comment 確認連線
  res.write(": connected\n\n");

  // 一律監看 repo 的所有 worktree openspec/（前端負責篩選）；任一 worktree 變動都推送、
  // 並附上變動來源的 worktree key。以主 worktree 正規化路徑為 key，讓同 repo 的 client 共用 watcher。
  const worktrees = (await listWorktrees(dir)).filter((w) => !w.isBare);
  let key: string;
  let watchDirs: { path: string; key: string | null }[];
  if (worktrees.length > 0) {
    const main = worktrees.find((w) => w.isMain) ?? worktrees[0];
    key = normalizeWorktreePath(main.path);
    watchDirs = worktrees.map((w) => ({ path: w.path, key: w.key }));
  } else {
    // 非 git：只監看指定目錄，無 worktree 歸屬
    key = normalizeWorktreePath(dir);
    watchDirs = [{ path: dir, key: null }];
  }
  const entry = getOrCreateWatcher(key, watchDirs);
  entry.clients.add(res);

  req.on("close", () => {
    removeClient(key, res);
  });
});

openspecRouter.post("/resync", async (req, res) => {
  const dir = req.query.dir as string;
  await resyncTimestamps(dir);
  res.json({ ok: true });
});
