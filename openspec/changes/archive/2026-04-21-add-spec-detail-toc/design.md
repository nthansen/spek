## Context

spek 的 spec detail 頁面（`/specs/:topic`）目前用 `MarkdownRenderer` 把 markdown 內容直接 render 成 HTML，沒有為 heading 加 `id`，也沒有目錄導覽。長 spec（如 `openspec-scanner`、`live-reload`）章節數多，使用者必須持續捲動才能找到所需區塊，閱讀效率低。

VS Code 端的 Specs TreeView 目前每個 spec 項目都是 `TreeItemCollapsibleState.None`（不可展開），點擊只能直接開啟整份 spec webview。如果能展開列出 heading 子節點，並支援帶 hash 跳轉，IDE 體驗會更接近原生 Outline 面板。

三個 host（Web、VS Code Webview、IntelliJ Webview）共用同一份 React app（`packages/web/src/`），因此 webview 端 TOC 元件實作一次三邊都能用；VS Code 的 sidebar 是 extension host 端 TreeView，需另在 `packages/vscode/src/tree-provider.ts` 擴充。

`@spek/core` 是純 Node.js 共用 package，可放入 markdown heading 解析 utility，讓 webview 與 extension host 共用同一份 slug 邏輯，避免兩邊不同步而導致 hash 對不上。

## Goals / Non-Goals

**Goals:**
- 長 spec 頁面有清楚的 sticky TOC 側邊欄，可快速跳轉章節
- 捲動時 TOC 自動高亮目前章節（scrollspy）
- URL hash 錨點支援：直接連結 `/specs/foo#requirement-bar` 可正確捲動
- VS Code Specs TreeView 項目可展開，子節點為該 spec 的 h2/h3 heading
- 點擊 TreeView heading 子節點可開啟 webview 並跳到對應章節
- Webview / TreeView 兩邊產生的 slug 完全一致

**Non-Goals:**
- IntelliJ tree view 不在本次範圍（webview TOC 仍會自動生效）
- TOC 不處理 h4 以下層級，避免清單過深
- 不為 change detail 頁加 TOC（後續若有需求可獨立 change）
- 不做客製化 heading 樣式或編輯功能
- 不引入 markdown TOC plugin（如 `remark-toc`）；自行解析以保證 slug 與後端一致

## Decisions

### Decision 1: Heading 解析放在 `@spek/core`
- **選擇**：在 `@spek/core` 新增 `extractHeadings(content)` 與 `slugifyHeading(text)` utility，輸出 `{ level, text, slug }[]`
- **替代方案**：
  - (A) 只在 webview 用 `react-markdown` 的 AST hook 取 heading：簡單但 VS Code TreeView 拿不到資料
  - (B) Webview 與 VS Code 各寫一份解析：邏輯重複，slug 容易不同步
- **理由**：core 已是兩邊共用 layer，集中放可保證 slug 一致；解析只需簡單 regex（`^(#{2,3})\s+(.+)$`），無需引入 AST 套件

### Decision 2: Slug 規則
- **選擇**：lowercase + 非英數字元換成 `-` + 去頭尾 `-` + 折疊連續 `-`；同份文件中遇到重複 slug 加 `-2`、`-3` 後綴
- **理由**：與 GitHub Anchors 行為相近，可預期；重複 slug 加後綴避免 hash 衝突
- **範例**：`### Requirement: Spec list with filtering` → `requirement-spec-list-with-filtering`

### Decision 3: TOC 用 `position: sticky` 而非 fixed
- **選擇**：TOC 容器 `sticky top-X`，包在 SpecDetail 的 grid layout 右側欄
- **替代方案**：`position: fixed` 直接定位於 viewport 右側
- **理由**：sticky 可隨主內容捲動到尾端時自然停止，且不會壓到 sidebar；fixed 在 webview 不同寬度下容易重疊主內容

### Decision 4: Scrollspy 用 IntersectionObserver
- **選擇**：建立 `useScrollspy(ids: string[])` hook，使用 IntersectionObserver 監看所有 heading 元素，回傳目前最接近 viewport 頂端的 id
- **替代方案**：scroll event + offsetTop 計算
- **理由**：IntersectionObserver 效能好、瀏覽器 / Webview / JCEF 皆支援；scroll event 需 throttle 且計算量大

### Decision 5: Hash 錨點導覽用 React Router + 自訂 effect
- **選擇**：`SpecDetail` 在 mount + `location.hash` 變更時，用 `requestAnimationFrame` + `element.scrollIntoView({ behavior: 'smooth' })` 捲動到錨點；等待 markdown 完成 render 後才觸發（透過 `useEffect` 依賴 `data.content` + `location.hash`）
- **替代方案**：依靠瀏覽器原生 hash 行為
- **理由**：React Router 不會自動處理 hash scroll；MarkdownRenderer 是非同步 render，需要顯式等內容就緒；webview 環境也不會自動 scroll

### Decision 6: TOC 顯示門檻
- **選擇**：heading 數量 ≥ 3 才顯示 TOC 側欄，否則維持單欄主內容
- **理由**：短 spec 不需 TOC；3 是經驗值，可避免單一 Requirement 的 spec 出現空蕩 TOC

### Decision 7: 響應式斷點
- **選擇**：≥ 1280px (`xl`) 顯示側欄 TOC；< 1280px 收合（不顯示）
- **替代方案**：< 1280px 改顯示為頁首可展開的 dropdown
- **理由**：本次先做單純收合，dropdown UX 在窄視窗（含 webview）需額外設計，可列入後續迭代
- **VS Code Webview**：使用者可拉寬 panel；IntelliJ tool window 通常較窄，可能多數時間不顯示，但這合理

### Decision 8: VS Code TreeView heading 子節點同步機制
- **選擇**：`SpecsTreeProvider.getChildren(element)` 當 element 是 `SpecTreeItem` 時，呼叫 `readSpec(workspacePath, topic)` 取得 content 後用 `extractHeadings()` 解析，回傳 `SpecHeadingItem[]`
- **替代方案**：在 spec scan 時就一次預載所有 heading
- **理由**：lazy load 只在使用者展開節點時才讀檔；scan 階段預載會拖慢開啟時間；既有 file watcher 機制 `refresh()` 會清空整棵樹，下次展開時自動重讀

### Decision 9: 帶 hash 的 navigateTo
- **選擇**：`spek.navigateTo` 接受完整 `routePath`（含 `#hash`），透過 webview `postMessage` 傳給 React Router 處理
- **理由**：所有 navigation 邏輯收斂在前端 router；extension host 不需理解 hash 語意

## Risks / Trade-offs

- **[Risk] Webview / JCEF 中 `scrollIntoView({ behavior: 'smooth' })` 行為差異** → Mitigation：實機測試 VS Code Webview、IntelliJ JCEF；若 smooth 不支援，自動 fallback 為 instant
- **[Risk] heading 文字含 emoji 或特殊符號 slug 不穩** → Mitigation：slug 規則保守處理 Unicode（保留中文字）；測試含 BDD 關鍵字的 heading
- **[Risk] TOC 覆蓋過多 heading 變得冗長** → Mitigation：限制 h2/h3，並提供 max-height + overflow scroll
- **[Risk] TreeView 動態 children 在 file watcher 觸發 refresh 時重新讀檔，I/O 增加** → Mitigation：refresh 不會立即讀檔，只在使用者展開時才讀；展開狀態由 VS Code 自行記憶
- **[Risk] hash 變更時若 heading 元素還沒 render 會 scroll 失敗** → Mitigation：`useEffect` 依賴 markdown content；用 `requestAnimationFrame` 延後到下一個 frame
- **[Trade-off] 不為短頁顯示 TOC** → 一致性略差但畫面更乾淨；可接受

## Open Questions

- 是否要在 TOC 項目顯示 heading level 縮排層級（h3 比 h2 縮排）？預設要做，留意視覺權重不要搶過主內容
- VS Code TreeView heading 是否要顯示 level icon（h2 vs h3 不同 icon）？傾向用單一 `symbol-string` 或 `bookmark` icon，靠縮排區別 level
