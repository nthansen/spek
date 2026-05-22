## Why

在 agent 平行開發的工作模式下，同一個 repo 常會同時開多個 git worktree，每個 worktree 在不同分支上各自進行中的 OpenSpec change。目前 spek 只讀取所指目錄的 working tree，使用者把 spek 指向主 repo 時，看不到散落在其他 worktree 的進行中 change，必須逐一手動把 spek 指向每個 worktree 才能掌握全貌。

## What Changes

- spek 掃描某個目錄時，自動以 `git worktree list --porcelain`（cwd 為該目錄）找出同一 repo 的所有 worktree（主 worktree + linked worktrees）
- 偵測到多個 worktree 時**預設聚合**：把各 worktree 的 active changes、archived changes 與 graph 關聯圖都合併呈現；只有單一 worktree 或非 git repo 時行為與現況完全相同
- 每張 change 卡片標示來源 branch / worktree；UI 提供開關，可關閉聚合回到只看當前目錄
- active changes 各 worktree 各自獨立並存（不去重）；archived changes 因封存後會隨分支合併傳播到各 worktree，**依 slug 去重**後聚合，只有某 worktree 獨有的 archived change 才標來源
- 不同 worktree 出現同名 active slug 時**兩條都顯示**，以「來源 worktree + slug」組出唯一識別，避免 route 與 graph 節點衝突
- specs 列表仍以**主 worktree**（`git worktree list` 第一項，預設分支）為準
- worktree 探索與聚合邏輯放在 `@spek/core`，由 Web 後端與 VS Code extension host 共用
- 範圍：Web 版 + VS Code extension。IntelliJ（Kotlin 另行重新實作）與 Demo（靜態、無 git）不在本次範圍

## Capabilities

### New Capabilities

- `worktree-aggregation`: 探索同一 repo 的所有 git worktree、跨 worktree 聚合 active changes、來源標記、同名 slug 並存處理、聚合開關（自動偵測、預設開啟）

### Modified Capabilities

- `openspec-scanner`: 掃描流程新增 worktree-aware 聚合模式 —— 探索 worktree、跨目錄掃描 active / archived changes、archived 依 slug 去重、合併結果並附來源資訊
- `openspec-api`: changes / overview / graph 相關 API 回應的項目新增來源 worktree / branch 欄位，並接受是否聚合的參數
- `change-browsing`: changes 列表呈現來源 worktree 標記、同名 slug 多筆並存、提供聚合開關
- `graph-view`: spec-change 關聯圖跨 worktree 聚合 change 節點，節點 ID 以 worktree 區分避免碰撞
- `live-reload`: 聚合啟用時 file watcher 監看所有 worktree 的 `openspec/` 目錄

## Impact

- `@spek/core`：新增 worktree 探索（解析 `git worktree list --porcelain`）與跨 worktree 聚合；`scanOpenSpec`、`buildGraphData` 相關流程與 `ChangeInfo` / `GraphNode` 型別擴充
- `@spek/web` server：`/changes`、`/overview`、`/graph` route 支援聚合，`/watch` 監看多個 worktree
- `@spek/web` 前端：change 卡片與 graph 節點新增來源標記、聚合開關；`FetchAdapter` / `MessageAdapter` 隨型別調整
- VS Code extension：extension host 呼叫 core 聚合邏輯，`MessageAdapter` 對應調整
- 不影響 IntelliJ plugin 與 Demo
- 執行環境需有 `git`；非 git repo 或單一 worktree 時自動退回現有行為
