## 1. package 骨架

- [x] 1.1 建立 `packages/ui`：`package.json`（name `@spekjs/ui`、ESM、`exports` 含 `.` 與
      `./styles.css`、`publishConfig.access: public`），`tsconfig.json`（`jsx: react-jsx`，
      `tsc` 建置，與 core 同模式）。
- [x] 1.2 依賴分類（design D5）：`react` / `react-dom` / `@spekjs/core` 為 **peerDependencies**
      （React 兩份實例會讓 hooks 爆炸）；d3-force / d3-selection / d3-zoom / d3-drag / d3-transition
      為 dependencies。
- [x] 1.3 root `package.json` 的 `workspaces` 加入 `packages/ui`；`packages/web` 以 `"*"` 依賴它。

## 2. 顏色契約與樣式

- [x] 2.1 定義 8 個 CSS 變數（`--spek-bg-primary` / `-secondary` / `-tertiary` / `--spek-border` /
      `--spek-text-primary` / `-secondary` / `-muted` / `--spek-accent`），於套件的 CSS 以 `:root`
      宣告深色預設值（design D3）。
- [x] 2.2 元件的 Tailwind 語意 token class 改寫為套件自有的樣式（不依賴宿主的 Tailwind）；
      `getComputedStyle` 讀的變數名改為套件自己的。
- [x] 2.3 手寫 `src/styles.css`（建置時原樣複製到 `dist/`）出貨；宿主 `import '@spekjs/ui/styles.css'`。
      **改為手寫而非 Tailwind 編譯**：樣式量很小，為它引入建置期的框架依賴划不來 —— 手寫讓套件對
      CSS 框架**零依賴**（design D5 已回寫）。

## 3. `SpecGraph`（力導向圖）

- [x] 3.1 自 `packages/web/src/pages/GraphView.tsx` 移出力導向圖的實作（d3-force / zoom / drag /
      neighbour 高亮 / fit-to-viewport）。**原封搬移，不趁機重構**（回歸底線）。
- [x] 3.2 斷開宿主依賴：`useNavigate` → `onSelectChange` / `onSelectSpec` 回呼（design D2）；
      `useTheme` → `themeKey?` prop（design D4）；`useGraphData` → `data: GraphData` prop。

## 4. `ChangeTimeline`（Gantt）

- [x] 4.1 移入 `components/timeline/*`（`TimelineChart` / `TimelineAxis` / `TimelineBar` /
      `TimelineTooltip` / `scale.ts` / `grouping.ts`）。
- [x] 4.2 斷開宿主依賴：`useNavigate` + `changeTo()` → `onSelectChange` 回呼；`useChanges` /
      `useGraphData` → `changes: ChangeInfo[]` + `graph?: GraphData` props；`WorktreeBadge` →
      `renderBadge?` prop（`ChangeInfo.source` 只有聚合掃描才有，下游恆為 undefined，design D2）。
- [x] 4.3 尺寸常數收進 `metrics?: Partial<TimelineMetrics>` prop，**預設值完全等同現況**
      （design D7）。
- [x] 4.4 `components/timeline/__tests__` 隨程式碼移入套件；`packages/ui` 加 `npm test`
      （`node --import tsx --test`，與 core 同模式）（design D6）。

## 5. `@spekjs/web` 改為消費套件

- [x] 5.1 `pages/GraphView.tsx` 退為薄殼：取數（既有 hooks）+ `useNavigate` + `useTheme` +
      loading／error 殼，把資料交給 `<SpecGraph>`。
- [x] 5.2 `pages/TimelinePage.tsx` 退為薄殼：取數 + filter chips + `WorktreeBadge` 的注入 +
      「Unknown created」清單，把資料交給 `<ChangeTimeline>`。
- [x] 5.3 web 的 `styles/global.css` 把 8 個顏色變數對應到既有的 `--color-*`（含 light 主題）。
- [x] 5.4 web 的 `package.json` 移除已移交套件的 d3 依賴與其 `@types`。

## 6. 回歸

- [x] 6.1 `packages/ui` 的單元測試（移入的 `grouping` / `scale`）全綠。
- [x] 6.2 web 的四種 build 全部通過（web / webview / intellij / demo）。
- [x] 6.3 typecheck 全綠（root 與各 package）。
- [x] 6.4 **逐一比對 `/graph` 與 `/timeline` 的實際畫面**與抽出前一致 —— 樣式漏抽不會讓 build 失敗，
      只會讓某個元素沒有樣式（design 的 Risks）。

## 7. 發佈與文件

- [x] 7.1 `packages/ui/README.md`：元件 API、顏色契約的 8 個變數、宿主要做的三件事
      （餵資料、接回呼、覆寫顏色）。
- [x] 7.2 `packages/ui/CHANGELOG.md` + 首發版本號（`1.0.0`，與 core 同理由：讓下游的 additive
      擴充走 minor、`^1.0.0` 自動受惠）。
- [x] 7.3 手動發佈至 npm public registry（與 core 同，不建 CI 發佈流程）。
- [x] 7.4 更新 root `CLAUDE.md` 的 Project Structure 與 Tech Stack（新增 `packages/ui`）。
