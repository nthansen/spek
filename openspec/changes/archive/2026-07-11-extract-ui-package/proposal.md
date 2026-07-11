# 抽出 `@spekjs/ui` — 可重用的視覺化元件

## Why

`spek-workspace`（私有的 Electron agent 工作台，`@spekjs/core` 的下游）在 Phase 5 建了一塊懂 OpenSpec
的側欄。它需要 spek 既有的兩個視覺化：

- **Graph** —— spec ↔ change 的力導向關聯圖（`pages/GraphView.tsx`）
- **Timeline** —— change 生命週期的 Gantt 時間軸（`pages/TimelinePage.tsx` + `components/timeline/*`）

下游一度嘗試自刻，結果是「四不像」（使用者原話）。這兩個東西是**幾百行的 d3 模擬與時間軸刻度規則**
（tick 密度隨 domain 跨度切換、lane 佈局、today 延伸與箭頭…），重刻一次只會得到一個更差的版本，
而且從此兩邊分叉。

**它們正是「真正可重用的那種元件」**：吃 `GraphData` / `ChangeInfo[]`，吐一塊 SVG，對宿主零認知。
與 `Dashboard` / `SpecDetail` / `ChangeDetail` 那種「自帶 `Layout` + `Sidebar` 的整頁」不同 ——
後者綁死了版面，下游用不上。

`@spekjs/core` 已經證明了這條路徑可行（發佈至 npm、下游直接依賴）。這是同一件事的第二步。

## What Changes

### 新增 `packages/ui`（`@spekjs/ui`）

一個**純呈現層**的 React 元件套件：

- **`<SpecGraph>`** —— 自 `pages/GraphView.tsx` 抽出的力導向圖（d3-force / zoom / pan / drag）。
- **`<ChangeTimeline>`** —— 自 `components/timeline/*` 抽出的 Gantt 時間軸（含 `scale` 的刻度規則與
  `grouping` 的 lane 佈局）。

**元件不碰任何宿主設施**：

- **不用 `react-router`** —— 導航改為 `onSelectChange` / `onSelectSpec` 回呼，由宿主決定要做什麼。
- **不用 `ApiAdapter` / hooks** —— 資料由 props 餵入（`data: GraphData`、`changes: ChangeInfo[]`）。
  宿主用自己的方式取數（web 走 HTTP，Electron 走 IPC）。
- **不用 `ThemeContext`** —— 主題以一份明確的**顏色契約**表達（見下）。

### **不**放進套件的東西

- **`ApiAdapter` 介面**。下游 `spek-workspace` 的 `IpcAdapter` 每個 method 的第一個參數都是
  `folderId`（它同時開著多個 repo），**簽名與 spek 的 `ApiAdapter` 不相容，實作不了它**。
  把它搬進套件對下游零價值，卻要讓 web 的十幾個檔案改 import 路徑 —— 純粹的回歸風險。
- **整頁視圖**（Dashboard / SpecList / SpecDetail / ChangeList / ChangeDetail）。它們為全寬瀏覽器
  頁面設計、自帶 `Layout` + `Sidebar`，下游的側欄用不上。

### 主題契約

兩個元件目前以 `getComputedStyle(document.documentElement)` 讀 CSS 變數取色
（`--color-border` / `--color-text-primary` / `--color-text-secondary`），並以 Tailwind 的語意
token class 上色（`bg-bg-primary`、`text-text-secondary` 等，共 8 個 token）。

套件 SHALL 把這 8 個 token 定義為**明確的契約**並連同 CSS 一起出貨，宿主以覆寫 CSS 變數換膚。
少了這道，圖在 `spek-workspace` 裡會沒有顏色（它的 token 叫 `--color-ink` / `--color-accent`，
名字對不上）。

### `@spekjs/web` 改為消費套件

`pages/GraphView.tsx` 與 `pages/TimelinePage.tsx` 退化為**薄殼**：取數（既有 hooks）、接上
`react-router` 的導航、把資料交給套件元件。**web 的行為不變** —— 這是本 change 的回歸底線。

### 發佈

`@spekjs/ui` 發佈至 npm public registry（與 core 同 scope）。repo 內 `packages/web` 以 `"*"` 由
npm workspaces 解析到本地，開發不受發版節奏影響（與 core 同一個模式）。

## Capabilities

### New Capabilities

- `ui-package`: `@spekjs/ui` 的存在、邊界與契約 —— 匯出哪些元件、元件不得依賴什麼（router /
  adapter / theme context）、顏色契約、以 npm 套件分發，以及 `@spekjs/web` 消費它而行為不變。

### Modified Capabilities

（無。）

`graph-view` 與 `timeline-view` 的 requirement 描述的是**使用者可見的行為** —— 力導向圖怎麼互動、
Gantt 怎麼呈現生命週期。本 change **不改變其中任何一條**，只把實作搬到共用套件。依 OpenSpec 的
規矩，那不是 requirement 變更。

「web 消費套件之後行為不變」這件事本身，寫成 `ui-package` 的一條 requirement（連同它的回歸範圍）。

## Impact

**新增**
- `packages/ui/` — `package.json`、`tsconfig.json`、`src/`（`SpecGraph`、`ChangeTimeline`、
  `timeline/{scale,grouping,axis,bar,tooltip}`）、`src/styles.css`（顏色契約）
- root `package.json` 的 `workspaces` 加入 `packages/ui`

**搬移／改寫**
- `packages/web/src/pages/GraphView.tsx` — 力導向圖的實作移出，頁面退為薄殼
- `packages/web/src/pages/TimelinePage.tsx` — 同上
- `packages/web/src/components/timeline/*` — 移入套件（`__tests__` 一併移入）
- `packages/web/package.json` — 新增 `@spekjs/ui` 依賴；d3 與 timeline 相關依賴移交套件

**回歸範圍**
- web 的四種 build（web / webview / intellij / demo）皆須通過
- timeline 的既有單元測試（`grouping` / `scale`）隨程式碼移入套件後仍須通過

**不動**
- `@spekjs/core`、Express server、VS Code / IntelliJ 的宿主程式
- `ApiAdapter` 及其三個實作（留在 web）
