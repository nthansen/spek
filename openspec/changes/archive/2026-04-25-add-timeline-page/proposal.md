## Why

Phase 1 已把 `createdDate` / `archivedDate` 流到 `ChangeInfo`，並在 ChangeList、ChangeDetail、Dashboard、VS Code sidebar 加上每筆 change 的生命週期顯示。但這些都是「單筆」視角，使用者無法一眼看出**整個專案**的 change 節奏：哪段時間活躍、哪些 change 並行、哪些卡很久。

`docs/change-lifecycle-roadmap.md` Phase 3 / P1 #7 規劃 `/timeline` 新頁面，把所有 changes 攤成水平 Gantt 風時間軸，是 lifecycle 系列的「最大視覺亮點」。Phase 1 資料已備齊，現在補 UI。

## What Changes

- 新增 `/timeline` 路由與 `TimelinePage.tsx`，左側為 change label、右側為時間軸
- 每筆 change 渲染為一條水平區段：
  - **archived**：固定區段 `[createdDate, archivedDate]`
  - **active**：區段 `[createdDate, today]`，視覺上以實線 + 端點箭頭表示「仍在進行」
  - 缺 `createdDate` 的 change 退化顯示（例如灰色標記在底部，標註 `Unknown created`）
- 時間軸 X 軸自動縮放到 `[min(createdDate), max(archivedDate ?? today)]`，含日期刻度（依跨度自動切換 day / week / month grid）
- 提供 toggle：**Group by spec topic**（依 change 影響的 spec topic 分群顯示，預設關）
- 提供 toggle：**Hide archived** / **Hide active** filter chip
- Bar hover 顯示 tooltip（slug、status、created、archived、duration），點擊跳轉 `/changes/:slug`
- Shared layout 的左側導覽列加 `Timeline` 入口
- 空狀態（無任何 change 有 `createdDate`）顯示提示訊息

## Capabilities

### New Capabilities

- `timeline-view`: `/timeline` 頁面，水平 Gantt 風時間軸視覺化所有 changes 的生命週期；包含分群 / 篩選 toggle、tooltip、跳轉到 change detail 的互動

### Modified Capabilities

（無。Phase 1 已備齊資料層；本 change 純前端新增頁面，不改既有 spec 行為）

## Impact

- **Code**：
  - 新增 `packages/web/src/pages/TimelinePage.tsx`
  - 新增 `packages/web/src/components/timeline/`（Gantt bar、axis、grouping 等子組件）
  - 修改 `packages/web/src/App.tsx`（新增 `/timeline` route）
  - 修改 `packages/web/src/components/SharedLayout.tsx`（左側 nav 加 Timeline 入口）
  - 沿用 `packages/web/src/utils/lifecycle.ts`（Phase 1 已建）
- **API / Server**：無改動（用既有 `/api/openspec/changes`，已含 `createdDate` / `archivedDate`）
- **Core**：無改動
- **不在本 change 範圍**（保持 Phase 3 獨立 ship）：
  - VS Code Webview Timeline（route 用 MemoryRouter 仍可達，但 sidebar 入口、UX 調整另議）
  - IntelliJ Plugin Timeline
  - Demo 靜態版（demo build 含 web 全頁面，預期 demo 自動帶到，但不刻意調整）
- **依賴**：不引入 d3 / vis-timeline 等大 lib，自行用 SVG / div + Tailwind 實作（保持 bundle 輕量、與既有風格一致）
