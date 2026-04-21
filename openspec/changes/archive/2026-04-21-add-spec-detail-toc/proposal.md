## Why

長 spec 頁面（例如 `openspec-scanner`、`live-reload` 等）在瀏覽時需要不斷捲動尋找章節，缺少快速定位能力。為長頁面提供 Table of Contents（TOC）可讓使用者快速跳轉到 Requirements、Scenarios 或其他 heading，大幅提升閱讀效率。此項目已列於 2026-02-16 UI 設計審查的 P3 改善清單中。同時，VS Code sidebar 的 Specs TreeView 目前只能點擊開啟整份 spec，若能在 TreeView 項目上展開顯示 heading 清單，讓使用者直接從 sidebar 跳至特定章節，IDE 內的導覽體驗會更接近原生 Outline 面板。

## What Changes

### Webview / SPA 端（Web、VS Code Webview、IntelliJ Webview、Demo 共用）
- Spec detail 頁面（`/specs/:topic`）的 markdown 內容旁加入一個 sticky TOC 側邊欄，列出所有 `h2`、`h3` heading
- TOC 項目點擊後平滑捲動到對應章節，並在捲動時自動 highlight 目前所在章節（scrollspy）
- TOC 僅在有足夠 heading（例如 ≥ 3 個）時才顯示，短頁面保持現狀
- 響應式處理：在窄螢幕（< 1280px）收合 TOC，避免排版壓縮主內容
- `MarkdownRenderer` 為 `h2`、`h3` 自動生成穩定 id（slugify），讓 TOC 與 URL hash 可錨點跳轉
- 進入頁面時若 URL 帶有 hash（例如 `/specs/foo#requirement-bar`），自動捲動至該章節

### VS Code Sidebar（TreeView）
- Specs TreeView 的每個 spec 項目從不可展開（`None`）改為可展開（`Collapsed`）
- 展開後顯示該 spec 的 `h2`、`h3` heading 清單作為子節點
- 點擊 heading 節點時呼叫 `spek.navigateTo` 並帶上 hash（例如 `/specs/foo#requirement-bar`），webview 開啟後自動捲動至對應章節
- `@spek/core` 新增一個 heading 解析 utility（產出 `{ level, text, slug }[]`），供 webview 與 VS Code extension host 共用
- `TreeView refresh on file changes` 的既有機制 SHALL 同步更新 heading 子節點

## Capabilities

### New Capabilities
- 無

### Modified Capabilities
- `spec-browsing`: 新增 spec detail TOC 導覽需求（側邊目錄、scrollspy、heading 錨點）
- `markdown-renderer`: heading 需自動產生 slug id，以支援 TOC 錨點跳轉
- `core-module`: 新增 heading 解析 utility（level、text、slug）
- `vscode-sidebar`: Specs TreeView 項目可展開顯示 heading 子節點，點擊後 webview 跳至對應章節
- `webview-integration`: `spek.navigateTo` 命令與 webview routing 需支援帶 hash 的路徑
- `repo-selection`: Web 版重整或直接貼 URL 時，RepoContext 自動使用 localStorage 最近一次 repo，避免被踢回選擇頁（讓 hash 直連 URL 能運作）

## Impact

- **Shared core**:
  - `packages/core/src/headings.ts`（新增）：解析 markdown heading，輸出 `{ level, text, slug }[]`
- **Webview / SPA**:
  - `packages/web/src/pages/SpecDetail.tsx`：加入 TOC 側邊欄 layout
  - `packages/web/src/components/MarkdownRenderer.tsx`：為 h2/h3 產生 id
  - 新增元件：`packages/web/src/components/SpecToc.tsx`（TOC 顯示 + scrollspy）
  - 新增 hook：`useScrollspy`（用 IntersectionObserver）
  - Router hash 處理：進入頁面 + hash 變更時捲動到對應錨點
- **VS Code Extension**:
  - `packages/vscode/src/tree-provider.ts`：`SpecTreeItem` 改 `Collapsed`，新增 `SpecHeadingItem`；`getChildren(element)` 根據 element 回傳 headings
  - `packages/vscode/src/extension.ts` / `panel.ts`：`spek.navigateTo` 支援 hash（或把整段 route path + hash 透傳）
- **IntelliJ**：本 change 暫不改 IntelliJ tree view（TOC 仍會自動在 IntelliJ webview 中生效）；若後續要做可另開 change
- **Dependencies**: 不需新增 npm 套件（IntersectionObserver 為瀏覽器內建，slugify 自行實作）
- **API / Backend**: 無變更（heading 解析在 client / extension host 完成）
- **Demo**: 靜態版自動套用 TOC（純前端邏輯）
