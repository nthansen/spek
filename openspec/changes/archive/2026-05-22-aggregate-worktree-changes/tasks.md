## 1. Core — worktree 探索與型別

- [x] 1.1 新增 `packages/core/src/worktrees.ts`：`listWorktrees(dir)` 以 `execFile` 跑 `git worktree list --porcelain`、解析為 `WorktreeInfo[]`，非 git / 無 `git` / 出錯時回 `[]`
- [x] 1.2 實作 worktree `key`（絕對路徑 sha1 前 8 碼）與 `WorktreeSource` 建構
- [x] 1.3 在 `types.ts` 新增 `WorktreeInfo`、`WorktreeSource`；`ChangeInfo` / `ChangeDetail` 加選用 `source`；`ChangesData` 加選用 `worktrees` / `aggregated`
- [x] 1.4 為 `worktrees.ts` 寫 unit test（多 worktree、從 linked worktree 呼叫、非 git、detached HEAD）

## 2. Core — 聚合掃描與圖資料

- [x] 2.1 實作 `scanOpenSpecAggregated(dir, options)`：`listWorktrees` 後平行 `scanOpenSpec` 各 worktree
- [x] 2.2 合併規則：active changes 聯集不去重並附 `source`；archived changes 依 slug 去重（主 worktree 優先，否則首見者）
- [x] 2.3 specs 取主 worktree（第一個非 bare）；單一 worktree / 非 git 時結果等同 `scanOpenSpec(dir)`
- [x] 2.4 實作 `buildGraphDataAggregated(dir)`：change 節點 ID 命名為 `change:<key>:<slug>`，spec 節點取主 worktree
- [x] 2.5 從 `@spek/core` index 匯出 `listWorktrees`、`scanOpenSpecAggregated`、`buildGraphDataAggregated` 與新型別
- [x] 2.6 為 `scanOpenSpecAggregated`、`buildGraphDataAggregated` 寫 unit test（聚合、去重、單一 worktree fallback）

## 3. Web server — API

- [x] 3.1 `/changes` 接受 `aggregate` query param，聚合時走 `scanOpenSpecAggregated`，回傳含 `worktrees` / `aggregated`
- [x] 3.2 `/changes/:slug` 接受 `wt` param，由 `listWorktrees` 解析對應 worktree 路徑後 `readChange`
- [x] 3.3 `/overview` 接受 `aggregate` param，計數涵蓋聚合結果
- [x] 3.4 `/graph` 接受 `aggregate` param，聚合時走 `buildGraphDataAggregated`
- [x] 3.5 `/watch` 聚合時對每個 worktree 的 `openspec/` 建立 chokidar 監看，client 斷線時一併清理

## 4. Web 前端

- [x] 4.1 `ApiAdapter` 介面與型別：changes / overview / graph 加 `aggregate`，`getChange` 加 `wt`
- [x] 4.2 `FetchAdapter` 轉成 `aggregate` / `wt` query param；`StaticAdapter` 接受並忽略（Demo 行為不變）
- [x] 4.3 change 列表卡片在多 worktree 時顯示來源 worktree / branch 標記
- [x] 4.4 change 列表聚合開關（多 worktree 時顯示），狀態存 `localStorage`、預設開
- [x] 4.5 change 卡片連結帶 `?wt=`；change 詳細頁讀 `wt` query param 並傳給 adapter
- [x] 4.6 graph 點擊 change 節點導覽帶 `?wt=`；change 節點顯示來源 worktree

## 5. VS Code extension

- [x] 5.1 `MessageHandler` 的 `getChanges` / `getChange` / `getOverview` / `getGraphData` 接受 `aggregate` / `wt`，改呼叫 core 聚合函式
- [x] 5.2 `MessageAdapter` 的 `postMessage` payload 帶上 `aggregate` / `wt`
- [x] 5.3 extension host 檔案監控：聚合時為其他 worktree 的 `openspec/` 建立 `FileSystemWatcher`，panel dispose 時一併清理

## 6. 驗證與文件

- [x] 6.1 `npm run type-check` 與 `npm run test -w @spek/core` 通過
- [x] 6.2 用 `/tmp/spek-worktrees/` 三個 worktree 實測 Web 版：active 聚合、archived 去重、graph、來源標記、聚合開關
- [x] 6.3 打包並實測 VS Code extension 的聚合與跨 worktree 檔案監控
- [x] 6.4 更新 `CLAUDE.md` 中 core 模組、API endpoints 等與 worktree 聚合相關的說明
