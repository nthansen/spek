## Context

Phase 1 已把 `createdDate` / `archivedDate` 加到 `ChangeInfo`（`packages/core/src/types.ts:25-26`），並提供 `formatLifecycleListRow` / `formatLifecycleBanner` 等格式化工具（`packages/web/src/utils/lifecycle.ts`）。資料層完備，本 change 純前端新增 `/timeline` 頁面。

現況：
- `App.tsx` 用 `createBrowserRouter` 集中宣告 routes（`packages/web/src/App.tsx:17-33`）。
- `Sidebar.tsx` 的 nav 來自硬編碼 `links` 陣列（`packages/web/src/components/Sidebar.tsx:5-42`）。
- `useChanges()` hook 經 ApiAdapter 取 `ChangesData = { active, archived }`；每筆 `ChangeInfo` 含 `slug` / `createdDate` / `archivedDate` / `description` / `status` / `taskStats`，**但不含影響的 spec topics**。
- `useGraphData()` 取 `GraphData = { nodes, edges }`，edges 是 change → spec 的關聯，可推導每個 change 影響的 topics。
- 既有重 lib：`d3-force` / `d3-selection` / `d3-zoom` / `d3-drag`（GraphView 已用）。

## Goals / Non-Goals

**Goals:**
- 一頁綜覽所有 changes 的時間分布，看出活躍期、並行情形、卡關 active change。
- Active 與 archived 視覺差異一眼可辨；active 一定延伸到「今天」。
- 點擊區段跳到 `/changes/:slug`，與 ChangeList 動線一致。
- 可選 group by spec topic；同一 change 影響多個 topic 時在每個 topic 群組各畫一條。
- 暗 / 亮主題、行動裝置可用（橫向 scroll 容忍）。
- 不引入新外部 lib（d3-time-axis / vis-timeline 等）；用 SVG + Tailwind 自繪。

**Non-Goals:**
- 不做拖曳編輯 / 改 created date 之類的編輯功能（spek 是唯讀 viewer）。
- 不做 zoom / pan 互動（MVP 用自動 fit + 必要時 horizontal scroll；複雜縮放等回饋再說）。
- 不在本 change 動 VS Code Webview / IntelliJ / Demo 的 Timeline 入口（route 在 web build 中可被 demo 自動帶到，但 sidebar entry 與 UX 微調不在範圍）。
- 不改 server / core / API。
- 不做 stale change 提醒、velocity 統計（屬 P1 #5 / P2，獨立 Phase）。

## Decisions

### D1. 渲染：SVG 為主、HTML overlay 輔助

**決定**：時間軸 area 用單一 `<svg>` 元素內含 `<line>`（grid）與 `<rect>`（bar），bar 上的 hover tooltip 用 React state + 絕對定位的 HTML `<div>` 渲染（CSS hover 處理 SVG element 對 a11y 與動態內容不友善）。

**理由**：
- SVG 對「軸 + 區段」這類資料圖元素天然合適，可精準控制座標。
- 純 CSS positioned div 也能做到，但時間刻度線、跨群組對齊需大量計算式 width/left percentage，可讀性差。
- 不引第三方圖表 lib：bundle size + 風格客製成本不對等。
- Tooltip 用 HTML 可重用既有 Tailwind tokens、a11y role 處理較直接。

**替代方案**：
- Pure HTML/CSS：拒，理由如上。
- Canvas：拒，change 量級小（spek 預期 50-200 量級），互動 / 主題切換用 SVG 維護成本更低。

### D2. 時間 scale：自定 linear scale，不引 d3-scale

**決定**：自寫小函式 `scaleTime(domainStart, domainEnd, rangeStart, rangeEnd)` → `(date: string) => number`。Domain 為 `[min(createdDate), max(archivedDate ?? today)]`，並向左右各 padding 3 天避免 bar 切齊邊界。

**理由**：
- 線性日期 → 像素的需求極簡，引整套 d3-scale 不划算（GraphView 已引 d3-force 等共 4 個 sub-pkg 是因 force layout，這裡無此需求）。
- 自寫後測試容易（pure function、好下 unit test）。

**替代方案**：
- d3-scale + d3-time：拒，過度配置。

### D3. Tick 密度：依 domain 跨度自動切換

**決定**：

| Domain 跨度 | 主刻度 | 次刻度 |
|---|---|---|
| < 14 天 | 每天 | — |
| 14–60 天 | 每週（週一） | — |
| 60–365 天 | 每月（1 號） | 每週 |
| > 365 天 | 每季 | 每月 |

主刻度繪 label，次刻度只繪淡 grid line。實作為 `generateTicks(domainStart, domainEnd)` 回 `{ major: string[], minor: string[] }`。

**理由**：純資訊密度考量，避免短 timeline 出現一兩個刻度、長 timeline 變成密密麻麻線。

### D4. Grouping 資料來源：複用 `useGraphData`

**決定**：「Group by spec topic」開啟時，額外 fetch `/api/openspec/graph`，從 `edges` 推導 `Map<changeSlug, topics[]>`；多 topic change 在每個 topic lane 都畫一次（同 slug 多次出現）。**不改 core / API**。

**理由**：
- 避免在 ChangeInfo 加 `affectedTopics` 欄位（要動 core scanner + IntelliJ Kotlin 同步，違反本 change「web only」原則）。
- 多算一次 graph 的成本可忽略（已在 dashboard / graph 頁 cache）。
- 若日後常用，再升級為 core 欄位（成本可控）。

**替代方案**：
- 加 `affectedTopics: string[]` 到 ChangeInfo：拒，跨層改動，留待之後集中重構。

### D5. 群組未開啟的預設 lane 排序

**決定**：依 `createdDate` 由舊到新由上往下；無 `createdDate` 的 change 集中放最下方獨立 section（標 `Unknown created`）。Active 與 archived 不分群（用 bar 樣式區分）。

**理由**：時間順序最直覺；status 分群會破壞時間流動視覺。樣式（fill 強度 / 端點箭頭）足以區分狀態。

### D6. Active 視覺：實心 bar + 右端開放箭頭

**決定**：
- Archived bar：填色 `bg-text-muted/40`，圓角矩形 `[created, archived]`。
- Active bar：填色 `bg-accent/70`（琥珀），右端 4px 三角形箭頭超出 `today` 線以暗示「持續中」。
- Hover：bar 提升 opacity 至 100%，左右 1px outline。
- `today` 垂直虛線：跨整個圖、`text-accent` 50% 不透明，常駐。

**理由**：active 用 accent 色強化「現在進行式」的注意力；archived 用中性 muted 退到背景。今天虛線是 timeline 的錨。

### D7. 缺資料 change 的處理

**決定**：
- `createdDate === null` 的 change：不出現在主時間軸；獨立 section 列出（`Unknown created (N)`），點擊仍可進 detail。
- 全部 changes 都缺 `createdDate`：顯示空狀態，提示 `No timeline data — add 'created:' to change frontmatter`。

**理由**：避免亂猜，誠實呈現資料缺口；同時提供修復方向。

### D8. 路由與導覽

**決定**：
- 在 `App.tsx` 路由表加 `{ path: "/timeline", element: <TimelinePage /> }`，置於 `/graph` 之後。
- `Sidebar.tsx` `links` 陣列加 Timeline 項，置於 Graph 之後，icon 用「水平條 + 刻度」風格 SVG（自繪，跟其他 nav icon 一致 stroke 風格）。

### D9. 元件拆分

```
pages/TimelinePage.tsx        // 整頁框架、fetch changes & graph、控制 toggles
components/timeline/
  TimelineChart.tsx           // SVG 主圖，吃 lanes data + scale 配置
  TimelineAxis.tsx            // 上方時間刻度
  TimelineBar.tsx             // 單一 bar（含 hover state hooks）
  TimelineTooltip.tsx         // 絕對定位 HTML tooltip
  scale.ts                    // scaleTime / generateTicks pure functions
  grouping.ts                 // 由 changes + graph 推導 lanes（pure）
```

**理由**：scale / grouping 為 pure，方便寫 unit test（沿用 `@spek/core` test 設備：`node:test` + `tsx`）；視覺元件薄、易 review。

### D10. 測試策略

**決定**：
- `scale.ts` 與 `grouping.ts`：node:test 寫 unit test 涵蓋 edge case（單一 change、跨年、缺資料、多 topic）。
- 視覺元件：不寫單元測試（spek 既有規範也未對 UI 寫 RTL 測試）；改靠 dev server 手動驗收 + demo build smoke。
- `npm run type-check` 必過、`npm run build` 必過。

## Risks / Trade-offs

- **[多 topic change 重複出現可能造成困惑]** → 在 group toggle 開啟時，bar 上加細小 badge 顯示 `(1/3)` 表示「3 topic 中的第 1 條」；tooltip 列出全部 topics。
- **[極長時間跨度 (>2 年) 會擠壓近期 bar 不易閱讀]** → MVP 接受；未來可加 zoom，回饋導向再做。
- **[行動裝置橫向視覺受限]** → 圖區塊允許 horizontal scroll（min-width 720px），左側 label column sticky。Mobile 手機橫螢幕仍可用。
- **[Group by topic 多打一支 graph API]** → 接受；已 cache 且資料量小。
- **[未來核心改加 affectedTopics 後本 change 邏輯成廢碼]** → 接受；migration 時 grouping.ts 改吃新欄位即可，介面不變。
- **[Bundle size]** → 不引新 lib，預估純 SVG 元件 < 5KB gzip 增量。

## Migration Plan

純新增頁面，無 migration / rollback 議題：
1. Phase 內順序：`scale.ts` & `grouping.ts` 先 + 單元測試 → `TimelineChart` 等視覺元件 → `TimelinePage` 組裝 → route + sidebar entry。
2. 完成後 `npm run dev` 在本地驗證；建 stale active change（手改 yaml `created` 為 60 天前）做視覺檢查。
3. `npm run build:demo` 驗證 demo 仍正常 build；demo 內 timeline 可瀏覽即達標（不刻意 polish demo）。

## Open Questions

- 多 topic change 在 group view 下是否要用顏色區分「同 slug 多 lane」？暫定不用（過度視覺噪音），實作後視回饋。
- 無 active 時 today 虛線是否仍顯示？暫定顯示（保持 timeline 錨點一致性）。
