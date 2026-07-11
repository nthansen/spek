# Design — 抽出 `@spekjs/ui`

## Context

`@spekjs/core` 已經走過一次「monorepo 內的 package → 發佈至 npm → 下游直接依賴」的路徑
（`publish-core-to-npm`）。本 change 是同一條路徑的第二步，但對象不同：core 是**純邏輯、零框架**，
而 ui 是 **React 元件 + d3 + CSS**，多了三個 core 沒碰過的問題 —— 框架的 peer 依賴、樣式的分發、
以及「元件對宿主的隱性依賴」。

要抽出的兩個元件目前**深深綁在 web 這個宿主上**：

| 依賴 | 位置 | 性質 |
| --- | --- | --- |
| `useNavigate()`（react-router） | `GraphView.tsx:2`、`TimelineChart.tsx:2` | 宿主的路由 |
| `useTheme()`（ThemeContext） | `GraphView.tsx:3` | 宿主的主題狀態 |
| `useGraphData()` / `useChanges()`（hooks → ApiAdapter） | `GraphView.tsx:4`、`TimelinePage.tsx:3` | 宿主的取數方式 |
| `changeTo()`（路由路徑組裝） | `TimelineChart.tsx` | 宿主的 URL 結構 |
| Tailwind 的語意 token class（`bg-bg-primary` 等 8 個） | 兩者的 `className` | 宿主的主題 token |
| `getComputedStyle` 讀 `--color-*` | `GraphView.tsx:59-62` | 宿主的 CSS 變數 |

**這六條全部都要斷乾淨**，否則套件在 Electron 裡不是白屏就是沒顏色。

## Goals / Non-Goals

**Goals**

- `spek-workspace` 能以一行 `npm install @spekjs/ui` 取得與 spek web **同一份**力導向圖與 Gantt。
- web 的行為**完全不變**（這是回歸底線）。
- 套件對宿主零認知：不假設有 router、有 adapter、有 theme context、有 Tailwind。

**Non-Goals**

- **不抽 `ApiAdapter`**（見 D1）。
- **不抽整頁視圖**（Dashboard / SpecDetail / ChangeDetail）—— 它們自帶 `Layout` + `Sidebar`，
  下游的 320–620px 側欄用不上。
- **不建 CI 自動發佈**。與 core 同樣手動發佈（`publish-core-to-npm` 的 design D 亦如此決定）。
- **不動 VS Code / IntelliJ 的宿主程式**。它們消費的是 web 的 build 產物，套件的抽出對它們透明。

## Decisions

### D1 — 套件是**純呈現層**，不含 `ApiAdapter`

**原本的構想是「`ApiAdapter` 介面 + 共用型別 + 兩個元件」。實地比對後否決了前半。**

下游 `spek-workspace` 的 `IpcAdapter` 每個 method 的第一個參數都是 **`folderId`**（它同時開著多個
repo，而 spek web 一次只看一個）：

```ts
// spek web
getChanges(aggregate?: boolean): Promise<ChangesData>
// spek-workspace
getChanges(folderId: string): Promise<ChangesData>
```

**簽名不相容，下游實作不了這個介面。** 把它搬進套件，換來的是「web 的十幾個檔案改 import 路徑」
這個純粹的回歸風險，而下游一行都用不到。

**決策**：套件**只收兩個視覺化元件**，且它們是**純呈現層** —— 資料由 props 餵入，宿主用自己的方式
取數。這也讓套件可以完全不知道 `ApiAdapter` 的存在。

**代價**：宿主各自寫取數與 loading／error 的殼。那本來就是宿主的事（web 有 `useAsyncData`，
Electron 有自己的 hooks），不是重複。

### D2 — 導航以回呼表達，不以路由

元件內的 `useNavigate()` + `changeTo(slug)` 換成 props：

```ts
onSelectChange?(slug: string): void
onSelectSpec?(topic: string): void
```

web 的薄殼把它接回 `navigate(changeTo(slug))`；Electron 的殼把它接到「錨定這個 change 並關閉
overlay」。**元件不再知道 URL 是什麼形狀**，也不再需要 `react-router` 這個 peer 依賴。

`WorktreeBadge`（Timeline 的 label 欄用）依賴 `ChangeInfo.source`，而那只有**聚合掃描**才會填。
Electron 是非聚合的，`source` 恆為 `undefined`。**決策**：badge 的渲染以 `renderBadge?` prop 注入，
預設不渲染 —— 套件不內建一個只有 web 用得到的元件。

### D3 — 主題是一份**明確的顏色契約**，以 CSS 變數表達

兩個元件目前混用兩種取色方式：Tailwind 的語意 token class（`bg-bg-primary`、`text-text-secondary`…）
與 `getComputedStyle` 讀 `--color-border` / `--color-text-primary` / `--color-text-secondary`。
兩者都假設**宿主的 Tailwind `@theme` 裡有這些名字**。`spek-workspace` 的 token 叫 `--color-ink` /
`--color-accent` —— 名字對不上，圖會沒有顏色。

**決策**：套件定義並出貨一份**顏色契約** —— 8 個 CSS 變數，各有預設值（深色）：

```
--spek-bg-primary --spek-bg-secondary --spek-bg-tertiary --spek-border
--spek-text-primary --spek-text-secondary --spek-text-muted --spek-accent
```

- 套件的 CSS（`@spekjs/ui/styles.css`）以 `:root` 宣告預設值，並以自有的 class 前綴（`spekui-`）
  提供版面樣式。**套件不依賴宿主的 Tailwind。**
- 元件內的取色一律讀 `var(--spek-*)`；`getComputedStyle` 仍然保留（d3 要把顏色寫進 SVG 屬性，
  那是命令式的），但讀的是**套件自己的變數名**。
- 宿主換膚＝在自己的 `:root` 覆寫這 8 個變數。web 把它們對應到既有的 `--color-*`；
  workspace 對應到 `--color-ink` / `--color-accent` 等。

**為什麼不直接讓宿主提供 Tailwind token**：那等於要求每個宿主都用 Tailwind、且用同一套命名。
Electron 那邊的命名是既定的（`--color-ink` 那套來自它的 UI 雛型），不會為了套件改名。

### D4 — 主題切換以 `themeKey` prop 觸發重繪

`GraphView` 目前把 `useTheme()` 的 `theme` 放進 d3 effect 的依賴陣列 —— 它**不讀主題的值**，
只是用它當「該重新上色了」的訊號（顏色仍從 CSS 變數讀）。

**決策**：以 `themeKey?: string | number` prop 取代。宿主主題變動時換一個值即可。
web 傳 `useTheme().theme`；Electron 只有深色，不傳（元件不重繪，正確）。

**替代方案（已否決）**：套件內用 `MutationObserver` 監看 `document.documentElement` 的
`data-theme`。那是在猜宿主的實作 —— 宿主換膚不見得改那個屬性。

### D5 — 以 `tsc` 建置，React 為 peer 依賴，d3 為 runtime 依賴

- **建置**：`tsc`（`jsx: react-jsx`），與 core 同一個模式。不引入 vite lib mode —— 這是一個
  ESM-only 的元件庫，不需要打包（下游自己有 bundler）。
- **`react` / `react-dom`**：`peerDependencies`（`>=19`）。**絕不可**列為 dependencies ——
  兩份 React 實例會讓 hooks 直接爆炸。
- **d3-force / d3-selection / d3-zoom / d3-drag / d3-transition**：`dependencies`（它們是實作細節，
  宿主不該知道）。這五個模組化的 d3 套件都很小。
- **`@spekjs/core`**：`peerDependencies` + `devDependencies`。元件只用它的**型別**
  （`GraphData` / `ChangeInfo` / `GraphNode`），型別會被 TS 擦除 —— 但宣告為 peer 可確保宿主與
  套件用的是**同一份型別定義**（版本歧異會在型別層立刻爆出來，而不是在 runtime 靜靜地錯）。
- **CSS**：**手寫一份純 CSS**（`src/styles.css`，建置時原樣複製到 `dist/`）。宿主
  `import '@spekjs/ui/styles.css'` 即可。

  > 原本打算用 `@tailwindcss/cli` 把 Tailwind 編譯成 `dist/styles.css`。實作時改為手寫 ——
  > 這兩個元件的樣式量很小（版面 + 8 個顏色變數，SVG 的部分本來就走屬性），為它引入一個建置期的
  > 框架依賴划不來。手寫的版本讓套件**對 CSS 框架零依賴**，而不只是「不要求宿主裝 Tailwind」。

### D6 — timeline 的單元測試隨程式碼移入套件

`components/timeline/__tests__` 測的是 `grouping.ts` 與 `scale.ts` —— 純函式、無 DOM。
它們**必須跟著程式碼走**，否則抽出之後這兩個檔案在 web 沒有測試、在 ui 也沒有。

`packages/ui` 因此有自己的 `npm test`（`node --import tsx --test`），與 core 同一個模式。

### D7 — 尺寸常數改為可設定，但**預設值不變**

Timeline 的寬高常數目前寫死（`LABEL_COL_WIDTH = 200`、`MIN_CHART_AREA_WIDTH = 720`…），
兩者相加即為 920px 的最小可用寬度。

**決策**：把它們收進一個可選的 `metrics?: Partial<TimelineMetrics>` prop，**預設值完全等同現況** ——
web 不傳，行為 100% 不變（回歸底線）。下游若要在較窄的容器裡用，可以自行調小。

**注意**：這**不代表** Timeline 適合塞進窄欄。下游的決定是把它放進**全視窗 overlay**，
`metrics` 只是留一道門，不是鼓勵。

## Risks / Trade-offs

- **[web 的行為改變（回歸）]** 這是最大的風險：兩個頁面被掏空重接。→ **Mitigation**：頁面退為
  薄殼，**元件的內部實作原封搬移**（不趁機重構）。四種 build 全跑；timeline 的既有單元測試隨程式碼
  移入後必須全綠。

- **[樣式漏抽]** 元件的 Tailwind class 改寫成 `spekui-` 前綴時漏掉幾個，會在 web 上表現為「某個
  元素沒有樣式」—— 而那不會讓 build 失敗。→ **Mitigation**：抽出後**逐一比對兩個頁面的螢幕輸出**；
  且 8 個 token 的對應表寫進 spec，可據以檢查。

- **[React 版本歧異]** 宿主與套件各自解析出一份 React。→ **Mitigation**：peer 依賴（D5）。
  下游的 `spek-workspace` 已是 React 19。

- **[d3 讓下游的 bundle 變大]** 五個 d3 模組。→ 它們都是模組化的小套件（非 `d3` 全家桶）。
  下游有 `measure:bundle` 會量到，屆時可判斷。

- **[`@spekjs/ui` 的版本線與 core 脫鉤]** 兩個套件各自發版，下游可能裝到不相容的組合。
  → **Mitigation**：core 宣告為 peer（D5），版本不合會在安裝時被 npm 警告、在型別層被 TS 擋下。

## Open Questions

- **套件要不要一併出貨 `MarkdownRenderer` 與 BDD 高亮？** 下游已經有自己的一份（且它的 markdown
  樣式是為窄欄調過的）。目前**不抽** —— 等第二個宿主真的需要時再說，不要為了「看起來可重用」而抽。
