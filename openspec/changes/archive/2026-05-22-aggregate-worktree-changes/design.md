## Context

spek 目前的掃描入口 `scanOpenSpec(dir)` 只讀取單一目錄的 working tree。`@spek/core` 是 Web 後端與 VS Code extension host 共用的純邏輯層；`git-cache.ts` 已示範如何以 `execFile("git", ..., { cwd })` 取得 git 資訊，並在非 git 環境優雅降級。

git worktree 的事實：同一 repo 的所有 worktree 共用一份物件庫，`git worktree list` 從任一 worktree 執行都會列出全部，且**主 worktree（含 `.git` 目錄者）固定排第一**。本變更要在此基礎上，讓 spek 指向任一 worktree 時都能聚合呈現整個 repo 各 worktree 的進行中 change。

相關既有 API：`GET /api/openspec/changes` 回傳 `{ active, archived }`；`GET /api/openspec/changes/:slug` 以 `readChange(dir, slug)` 解析；VS Code 端 `MessageHandler.getChanges/getChange/getOverview` 為對應實作。

## Goals / Non-Goals

**Goals:**

- spek 指向任一 worktree 時，自動探索同 repo 全部 worktree 並聚合 active changes、archived changes 與 graph 關聯圖
- 每筆 change 帶來源 worktree / branch 資訊，UI 可標示
- 不同 worktree 的同名 active slug 兩筆並存且各自可開啟；archived changes 依 slug 去重
- 聚合為自動偵測、預設開啟；單一 worktree 或非 git repo 行為與現況完全相同
- 聚合邏輯收斂在 `@spek/core`，Web 與 VS Code 共用
- `overview` 統計、`changes` 列表、`graph` 視圖的聚合行為一致

**Non-Goals:**

- Search 跨 worktree 聚合
- specs 列表跨 worktree 聚合 — 一律以主 worktree 為準
- 跨「不同 repo」聚合 — 只聚合同一 repo 的 worktree
- IntelliJ plugin、Demo

## Decisions

### D1 — Worktree 探索：`git worktree list --porcelain`

新增 `@spek/core` 模組 `worktrees.ts`，匯出 `listWorktrees(dir): Promise<WorktreeInfo[]>`，以 `execFile("git", ["worktree", "list", "--porcelain"], { cwd: dir })` 取得並解析。任何錯誤（非 git repo、無 `git`）回傳 `[]`，由呼叫端降級為單一目錄行為 —— 與 `git-cache.ts` 既有的降級策略一致。

*替代方案*：手動解析 `.git/worktrees/` —— 否決，重造 git 內部結構、易碎。

### D2 — 新增 `scanOpenSpecAggregated(dir)`，不改 `scanOpenSpec`

聚合邏輯放在新函式 `scanOpenSpecAggregated(dir, options)`，內部呼叫既有 `scanOpenSpec` 逐一掃描各 worktree 再合併。`scanOpenSpec` 維持單一目錄語意不動，既有呼叫端（specs、graph）不受影響。

*替代方案*：在 `scanOpenSpec` 加參數 —— 否決，會擴散語意到所有呼叫端。

### D3 — 合併規則

- **active changes**：所有 worktree 的聯集，**不去重**，每筆標來源 —— 各 worktree 的 active change 綁在各自分支上、彼此獨立，同名 slug 視為兩筆
- **archived changes**：所有 worktree 的聯集，**依 slug 去重** —— archived change 一旦封存通常隨分支合併傳播到所有 worktree，naive 聯集會造成 N 倍重複；同一 slug 出現在多個 worktree 時視為同一筆，取主 worktree 的版本為準（主 worktree 沒有則取第一個出現者），只在某 worktree 獨有時才標來源
- **specs 列表**：只取**主 worktree**（`listWorktrees` 第一個非 bare 項目）

active 不去重、archived 去重，是因為兩者本質不同：active change 是各分支獨立的進行中工作，archived change 是已合併的共同歷史。specs 跨 branch 聚合會互相衝突且雜訊大，故維持主 worktree。

### D4 — 來源標記：`ChangeInfo.source`

`ChangeInfo` 新增選用欄位：

```ts
interface WorktreeSource {
  key: string;        // worktree 絕對路徑的短雜湊（sha1 前 8 碼），URL-safe、穩定
  path: string;       // worktree 絕對路徑
  branch: string | null;  // branch 名稱；detached HEAD 為 null
  isMain: boolean;
}
// ChangeInfo 新增： source?: WorktreeSource
```

選用欄位 → 型別向後相容。聚合掃描一律填入；非聚合路徑留空。UI 在偵測到多個來源時才顯示來源標記。

### D5 — 同名 slug：以 `?wt=<key>` query param 辨識

change 詳細頁路由維持 `/changes/:slug`，新增選用 query param `wt=<worktree key>`：

- API：`GET /api/openspec/changes/:slug?dir=...&wt=<key>` —— server 以 `listWorktrees(dir)` 找出 `key` 對應的 worktree 路徑，再 `readChange(worktreePath, slug)`
- `wt` 省略 → 沿用 `readChange(dir, slug)`，舊有 URL / 書籤不受影響
- 聚合列表的每張卡片連結帶上自己的 `wt`

*替代方案*：路徑改 `/changes/:wt~:slug` —— 否決，破壞既有 URL 且較醜。合併同名 change —— proposal 已否決。

### D6 — 聚合開關：`aggregate` query param + localStorage

- API 各聚合端點接受 `aggregate=true|false`，server 預設 `true`（偵測到多 worktree 才實際聚合）
- `aggregate=false` → 直接走 `scanOpenSpec(dir)`
- 前端把使用者偏好存 `localStorage`，預設開；UI 顯示「聚合自 N 個 worktree」與開關

### D7 — API 回應採加欄位（additive）

- `GET /changes` 回傳 `{ active, archived, worktrees?, aggregated? }`，`worktrees` 為 `WorktreeInfo[]`、`aggregated` 為 boolean
- `GET /overview` 的計數在聚合時涵蓋全部 worktree（active 不去重、archived 依 slug 去重）
- `GET /graph` 回傳的 `GraphData` 在聚合時涵蓋全部 worktree 的 change 節點
- `ChangesData` 型別新增選用欄位 `worktrees?`、`aggregated?`；`GraphNode` 的 change 節點新增來源欄位

皆為加欄位，舊 client 不受影響。

### D8 — File watcher 跟隨聚合

聚合啟用時，`GET /watch` 對**每個 worktree** 的 `openspec/` 都建立監看，任一 worktree 變動都推送更新。否則聚合視圖會在其他 worktree（agent 正在編輯）變動時失效 —— 那正是本功能的核心價值。

### D9 — VS Code 對等

`MessageHandler` 的 `getChanges`/`getChange`/`getOverview` 接受 `aggregate`/`wt` 參數，呼叫與 Web 相同的 core 函式；`MessageAdapter` 訊息參數對應擴充。VS Code 端不放任何聚合專屬邏輯。

### D10 — 平行化

各 worktree 的掃描以 `Promise.all` 平行執行；重複呼叫由既有的 per-dir `git-timestamp-cache` 吸收。一般 worktree 數量不多（個位數），成本可接受。

### D11 — Graph view 跨 worktree 聚合

`buildGraphData` 旁新增 `buildGraphDataAggregated(dir)`（async，因需 `listWorktrees`），不改既有同步版本。change 節點涵蓋所有 worktree 的 active（不去重）與 archived（依 slug 去重，依 D3 規則）。為避免同名 slug 的節點 ID 碰撞，change 節點 ID 一律加 worktree 命名空間：`change:<worktreeKey>:<slug>`；archived 去重後以代表 worktree 的 key。spec 節點仍只來自主 worktree（與 D3 specs 規則一致），edge 由各 change 的 delta `specs/` 子目錄連到主 worktree 的 spec 節點。

## Risks / Trade-offs

- **git 版本造成 `--porcelain` 輸出差異** → porcelain parser 防禦性解析，逐段以 `worktree`/`HEAD`/`branch`/`bare`/`detached` 等已知 key 比對，未知行忽略。
- **主 worktree 為 bare（無 working tree、無 `openspec/`）** → specs 來源退而取「第一個非 bare worktree」。
- **prunable / 目錄已被刪除的 worktree** → `listWorktrees` 跳過標記 `prunable` 者；scanner 既有的 `fs.existsSync` 防護也會略過不存在的目錄。
- **指向 feature worktree 時 specs 仍顯示主 worktree 版本** → 與 D3 一致的取捨；該 branch 對 spec 的修改仍可透過 change 的 delta spec 看到。屬已知行為，文件需說明。
- **多 worktree 時 watcher 資源** → chokidar 多路徑監看 + 共用 debounce，個位數 worktree 可接受。
- **`worktreeKey` 雜湊碰撞** → sha1 前 8 碼，碰撞機率可忽略；必要時加長。
- **執行環境無 `git`** → `listWorktrees` 回 `[]`，自動降級為單一目錄，與現況一致。
- **同名 archived change 在不同 worktree 內容不一致**（某 worktree 改過已封存檔案）→ 去重時以主 worktree 版本為準，視為極少見邊界情況，不另做合併。
- **graph change 節點 ID 碰撞** → change 節點一律以 `change:<worktreeKey>:<slug>` 命名，對應 edge 的 `source` 一併更新。

## Migration Plan

本變更為唯讀檢視器功能，無資料遷移。功能為加法且預設開啟，對單一 worktree / 非 git repo 自動退回現有行為。回退途徑：前端開關切 `aggregate=false`，或還原本變更；無需遷移任何持久化狀態。

## Open Questions

- 無重大未決項目。watcher 多路徑監看在大量 worktree 下的資源用量，待實作時量測，必要時加上 worktree 數上限或共用單一 chokidar 實例。
