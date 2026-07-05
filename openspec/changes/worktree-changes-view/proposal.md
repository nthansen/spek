## Why

跨 worktree 聚合目前把所有 worktree 的 active change 直接聯集顯示，實測（見 design.md 的 repro）暴露兩個問題：(1) 尚未 commit 的 worktree-local change 因為沒有 git timestamp，排序 fallback 到空字串而沉到列表最底，看起來像「另一個和主分支分開的區塊」；同一 slug 若在 branch point 已 commit，還會在 main 與 worktree 各出現一次造成重複列。(2) Web 端切換 aggregate 後 SSE 連線不會重連、VS Code 端 worktree watcher 只在 panel 建立當下掛一次，導致 worktree 內檔案的即時更新不會反映。

更根本地，使用者要掌握「哪個 change 在哪個 worktree、哪個 worktree 正在被更新」時，只能在各 worktree 的 Changes 之間跳。與其猜測性地去重，不如把 worktree 這個維度變成 Changes 檢視裡可操作的一等公民：預設聚合全部，並可逐一 toggle 每個 worktree、即時看到哪個 worktree 正在變動。

## What Changes

- **Changes 檢視新增 worktree 篩選列**：頂端一排 chip——「All」（預設，等同今日聚合）＋每個 worktree 一顆可多選 toggle。純前端依 change 既有的 `source` 篩選，不需後端往返。單選聚焦單一 worktree、多選顯示子集、全選等於 All。
- **Live activity 標示**：檔案變更事件帶上「是哪個 worktree 觸發」的識別，UI 讓對應 worktree 的 chip 與變動的 change row 短暫 pulse，使用者不必跳 worktree 就能看到哪個正在被更新。尊重 `prefers-reduced-motion`。
- **相同 slug 去重＋歸屬 badge**：All 檢視下，內容完全相同（branch point 共享）的同 slug active change 收合成單列，worktree badge 標示它存在於哪些 worktree（如 `main +1`）；內容確實分歧的同 slug change 仍分列顯示（保留 owner 原本「diverging 版本都要看得到」的意圖）。**BREAKING**（spec 層）：修改 worktree-aggregation 現有的「同 slug 一律都顯示」需求為「相同則收合、分歧才分列」。
- **排序修正**：`scanOpenSpecAggregated` 對沒有 git timestamp 的 active change 改以檔案 mtime 作 fallback 排序鍵（對齊既有 artifact mtime 排序哲學），讓最近編輯／未 commit 的 worktree change 浮到最前而非沉底。
- **監看穩健化**：後端一律聚合並監看所有 worktree（前端負責篩選），移除 Web「切 aggregate 不重連 SSE」與 VS Code「開 panel 後新增的 worktree 不被監看」的缺口；worktree 路徑比對改為正規化＋不分大小寫（Windows 上 `path.resolve` / git 回傳的磁碟機代號大小寫可能與呼叫端不同）。主 worktree 一律以結構（porcelain 第一段 / `isMain`）辨識，絕不依賴分支名為 `main`/`master`。
- 涵蓋共用 React SPA，故 **web + VS Code webview** 一次到位。**IntelliJ 的 Kotlin port 在本 base 沒有任何 worktree 聚合**，本 change 不含把 worktree 子系統移植到 Kotlin（屬獨立 follow-up）；IntelliJ 平順退化為單一 worktree（篩選列不顯示、行為同今日）。

## Capabilities

### New Capabilities
<!-- 無新 capability；本變更是既有 capability 的行為修訂與擴充 -->

### Modified Capabilities
- `worktree-aggregation`: 修改「aggregate active changes」需求——相同 slug 內容相同則收合並附歸屬、分歧才分列；新增聚合排序需求——無 git timestamp 時以檔案 mtime 為 fallback 排序鍵；worktree 路徑辨識正規化（不分大小寫、結構化辨識主 worktree）。
- `live-reload`: 檔案變更事件（Web SSE 與 VS Code postMessage）附帶觸發來源的 worktree 識別；後端一律聚合監看所有 worktree、前端不再以 aggregate 開關切換伺服器監看集合；VS Code worktree watcher 於重掃時重新評估以涵蓋新增的 worktree。
- `change-browsing`: Changes 檢視新增 worktree 篩選列（All 預設＋每 worktree 多選 toggle，client-side 依 `source` 篩選）與 live-activity pulse 標示。

## Impact

- **Core**：`packages/core/src/scanner.ts`（`scanOpenSpecAggregated` 排序 fallback、相同 slug 收合＋歸屬）、`worktrees.ts`（路徑正規化比較 util）、`types.ts`（change 的 worktree 歸屬欄位，如 `sources`/membership）。
- **Web server**：`packages/web/server/routes/openspec.ts`（`/watch` 一律聚合、事件帶 worktree key）。
- **Web/共用前端**：`packages/web/src/pages/ChangeList.tsx`（worktree 篩選列、pulse）、`hooks/useFileWatcher.ts`（事件帶來源、移除 aggregate 相依重連問題）、新的 worktree 篩選狀態與偏好、`WorktreeBadge` 擴充成員資訊。
- **VS Code**：`packages/vscode/src/panel.ts`（worktree watcher 重評估）、`watcher.ts`（事件帶來源）、路徑比對正規化。
- **IntelliJ**：本 change 不改動 Kotlin（無 worktree 聚合可對齊）；嵌入的 React SPA 在單一 worktree 資料下平順退化。Kotlin worktree parity 另立 follow-up change。
- **文件**：CLAUDE.md、三份 CHANGELOG 同步。
- 相容性：預設 All 檢視行為與今日聚合一致；篩選與 pulse 為附加、預設不改變既有敘事，符合「additive、尊重 owner 設計」原則。
