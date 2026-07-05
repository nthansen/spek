## Context

spek 已支援跨 worktree 聚合（`scanOpenSpecAggregated`）：探索同 repo 全部 worktree，把各自的 active change 聯集顯示、archived 依 slug 去重、specs 取主 worktree。前端三種形態（Web、VS Code webview、IntelliJ）共用同一份 React SPA，Changes 頁目前提供一個二元「Aggregate N worktrees」checkbox。

在 integration branch 上用 VS Code 實測時發現兩個現象，並在隔離環境重現（見下方 repro），確認根因：

**Repro（`@spek/core` 直接呼叫 `scanOpenSpecAggregated`，主 worktree 有 `shared-change`，linked worktree `feat` 另有已 commit 的 `wt-only` 與未 commit 的 `wt-uncommitted`）：**

```
Active changes (returned order):
  wt-only         ts=2026-07-05T12:35:09  src=feat      ← committed，依 timestamp 排
  shared-change   ts=2026-07-05T12:35:08  src=master    ← 重複
  shared-change   ts=2026-07-05T12:35:08  src=feat      ← 重複（union 不去重）
  wt-uncommitted  ts=null                 src=feat      ← 沉到最底（空排序鍵）
```

1. **排序**：`compareChangesByTimestamp` 以 `timestamp || date || ""` 為鍵、descending。未 commit 的 worktree-local change 沒有 git timestamp、slug 又非日期前綴 → 鍵為 `""` → 全部沉到列表最底，形成一個和主分支分離的區塊（使用者描述的「另一個 aggregate」）。
2. **重複列**：active change 聯集不去重（既有需求刻意如此，理由是不同 worktree 可能有分歧的進行中版本）；但 branch point 共享、內容相同的同 slug change 會在每個 worktree 各出現一次。
3. **即時更新**：後端（Web `/watch` 與 VS Code panel）其實都已監看所有 worktree 的 `openspec/`；缺口在客端與生命週期——Web `useFileWatcher` 的 EventSource 依賴 aggregate 偏好但不隨其重連（且沿用陳舊偏好）；VS Code worktree watcher 只在 panel 建立當下非同步掛一次，之後新增的 worktree 不會被監看。另外 `wt.path !== main` 是區分大小寫的字串比較，在 Windows 上 `path.resolve`/git 回傳的磁碟機代號大小寫可能與呼叫端不同。

使用者的產品訴求超越單純除錯：把 worktree 這個維度變成 Changes 檢視中可操作的一等公民——預設聚合、可逐一 toggle worktree、即時看到哪個 worktree 正在被更新，且隨 worktree 合併消失時能平順退回聚合，直到只剩單一 change。

## Goals / Non-Goals

**Goals:**
- Changes 頁提供 worktree 篩選列：`All`（預設）＋每個 worktree 一顆多選 toggle，client-side 依 change 既有 `source`／membership 篩選。
- Live activity：檔案變更事件帶上「哪個 worktree」，UI 讓對應 worktree chip 與變動 row 短暫 pulse（尊重 reduced-motion）。
- 排序修正：無 git timestamp 時以檔案 mtime 作 fallback 排序鍵，讓最近編輯／未 commit 的 worktree change 浮到最前。
- 相同 slug 內容相同則收合成單列並附 worktree membership badge；分歧才分列。
- 監看穩健化：後端一律聚合監看所有 worktree、事件帶 worktree key、前端連線不隨篩選重連；VS Code 於重掃時重新評估 worktree watcher 集合；路徑比較正規化＋不分大小寫；主 worktree 結構化辨識。
- 隨 worktree 合併消失平順退化：篩選選取集對照現存 worktree 調解（移除不存在者、空則退回 All）；`?wt=` 指向已消失 worktree 時退回聚合副本（主 worktree 優先）；收斂到單一 worktree 時篩選列隱藏、行為等同今日單一 worktree。
- 三前端（Web + VS Code webview + IntelliJ）一次到位，因共用 React SPA。

**Non-Goals:**
- **不把 worktree 子系統移植到 IntelliJ 的 Kotlin port**——它在本 base 完全沒有 worktree 聚合，對齊等同從零實作整個子系統，屬獨立且較大的 follow-up change。IntelliJ 嵌入共用 React SPA，收到單一 worktree 資料時平順退化（篩選列不顯示、行為同今日、不 regression）。
- 不改 VS Code 原生 sidebar TreeView 的 worktree 分組（可日後另議）。
- 不引入伺服器端 change 內容 diff／合併；收合僅依內容簽章判定「相同 vs 分歧」，不做三方合併。
- 不做 line-level 的 live-activity 定位（沿用既有 change-detail focus 機制的粒度）。
- 不改 archived 去重規則（維持依 slug、主 worktree 優先）。

## Decisions

### D1. 篩選在客端、伺服器一律聚合監看
Changes 資料已帶每筆 change 的 `source`（與本次新增的 membership），前端依選取集過濾即可，不需為篩選重新 fetch。伺服器（Web `/watch`、VS Code panel）改為「永遠聚合、監看所有 worktree」，把「顯示哪些 worktree」完全交給客端。

- **為何**：一次解決兩件事——(a) 移除「切 aggregate 不重連 watcher」的 Web bug（連線生命週期不再綁 aggregate 偏好）；(b) live-activity 需要「任一 worktree 變動都收得到事件」，本就該監看全部。
- **替代**：伺服器端依 `aggregate`/選取集切換監看集合——被否決，因為那正是造成重連缺口與漏監看的來源，且無法支援「篩選掉的 worktree 仍要 pulse 提示」。

### D2. 排序 fallback 用檔案 mtime
`scanOpenSpecAggregated`（及底層 `scanOpenSpec` 的 active 排序）在 `timestamp` 缺席時，改以 change 目錄的 mtime（取其內最新檔案）為鍵，而非空字串。與既有 artifact mtime 排序哲學一致。

- **為何**：未 commit／剛編輯的 worktree change 是「最新動作」，理應浮上而非沉底。
- **注意**：mtime 讀取只在聚合掃描時進行，屬既有掃描熱路徑內的檔案 stat，不呼叫 CLI；維持「掃描永遠不呼叫 CLI」的鐵律。
- **替代**：用 `mtime` 一律取代 git timestamp——否決，會讓已 commit 的歷史序失真；只在沒有 git timestamp 時 fallback。

### D3. 相同 slug 以內容簽章收合，分歧分列
對同 slug 的多份 active change 算一個穩定內容簽章（對 change 目錄的檔案路徑＋內容做 hash）：簽章相同 → 收合成單列，primary source 取主 worktree（否則首見者），並帶 membership 清單；簽章不同 → 各自分列（保留 owner 原意）。

- **為何**：branch point 共享而未編輯的 change 內容位元相同 → 收合去除雜訊；任一 worktree 一有本地編輯即分歧 → 自動分列，仍看得到差異。
- **換行正規化**：簽章前把 CRLF/CR 正規化為 LF 再雜湊。`git worktree add` 依 `autocrlf` 重新 checkout，同一 commit 的 change 在不同 worktree 可能一邊 LF、一邊 CRLF（E2E 於 autocrlf repo 實測重現，未正規化會誤判為分歧而不收合）；內容實質相同應收合。
- **替代**：以 git head/tree oid 判定——對已 commit 者夠用，但無法涵蓋未 commit 的本地編輯；改用檔案內容簽章一致涵蓋 committed 與 working-tree 狀態。
- **成本**：需讀 change 目錄檔案內容算 hash。以 change 為單位、僅對「同 slug 出現在 ≥2 worktree」者才需比對，量小；可快取。

### D8. worktree 篩選：從 All 點 chip 為「聚焦」
篩選列 chip 的 toggle 語意：`All` 為預設（selection=null）；從 All 點某個 worktree chip 視為**聚焦到它**（selection=[該 key]，只顯示它），再點其他 chip 累加；全部選齊或全部取消皆回到 All。E2E 實測發現若把 All 當「全選基底、點 chip = 關掉該 worktree」會非常反直覺（點 feat 反而看到 main），故改為空集合基底的聚焦語意。

### D4. 型別擴充：change 帶 worktree membership
`ChangeInfo`（或聚合輸出型別）新增 membership 欄位（例如 `worktrees: WorktreeSource[]`），與既有單一 `source` 並存：`source` 為代表（主 worktree 優先），`worktrees` 為它所屬的全部 worktree。前端 badge、篩選、fallback 皆以此為準。跨 core / API / adapters / 三前端維持單一合約。

### D5. Live-activity 事件協定
Web SSE payload 由 `{"type":"changed"}` 擴為 `{"type":"changed","worktree":"<key>"}`；VS Code postMessage 由 `{type:"fileChanged"}` 擴為 `{type:"fileChanged",worktree:"<key>"}`。`useFileWatcher` 把 worktree key 透過 refresh 協調層帶給 UI，Changes 頁據以 pulse 對應 chip／row。舊 payload 無 `worktree` 欄位時視為「未知來源」，僅觸發刷新不 pulse，向後相容。

- worktree key 由伺服器／extension 依「變動檔案落在哪個被監看的 worktree openspec 根」反查（已知每個 watcher 對應的 worktree path）。

### D6. 平順退化
- **篩選調解**：選取集存 worktree key 陣列於 `localStorage`（per repo）。載入與每次重掃後對照 `worktrees` 現存 key：移除不存在者；若清空則退回 `All`。單一 worktree 時整個篩選列不渲染。
- **`?wt=` fallback**：detail 讀取時若 `wt` key 不存在或該 worktree 無此 slug，退回「任一仍含此 slug 的 worktree，主 worktree 優先」；單一 worktree 免 `wt`。
- **為何**：worktree 會隨分支合併被 prune，檢視不該因此壞掉或空掉；一路退到只剩一份 change 為止。

### D7. 三前端一致與正規化 util
在 `@spek/core` 新增路徑正規化比較 util（resolve + 分隔線一致 + 大小寫不敏感於 Windows/macOS），供 core 聚合、Web watch、VS Code panel 共用；IntelliJ（Kotlin）以對齊版實作。主 worktree 一律以 `isMain`（porcelain 首段）辨識，不看分支名。

### D9. Changes 依 change 分組 + worktree 選擇掛在 change 上（E2E 回饋後定案）
E2E 實測後與使用者對齊出更好的呈現：**依 change title 分組**——同 slug 的各變體（收合的相同副本 + 分歧副本）收在一個群組卡，表頭顯示「最進度」（完成任務最多的變體）摘要條，變體以最進度在最上排序（平手維持 recency），每個變體列帶 worktree membership chips 與**精簡進度條**（3/4 vs 2/4 一眼可辨）；單一變體維持精簡單列。**worktree 選擇也直接掛在 change 上**：清單列的 membership chips 可點、直接跳到該 worktree 副本；change detail 於存在多 worktree 時提供 worktree 切換器（由 `readChangeAggregated` 回傳的 membership 驅動）。全部依實際 worktree 數量渲染，不假設固定數量。

- **為何分組而非扁平分列**：change 一旦在某 worktree 分歧（如某 worktree 勾了一個 task）就會分裂成獨立列，扁平呈現會讓同一 change 散落多列且跳動；分組讓它們收在一起、最進度浮上，兼顧「一眼看出哪個 worktree 領先」與「不散亂」。
- **furthest-along 摘要語意**：表頭數字取完成數最多的變體（「任一 worktree 的最佳進度」），比 union 計數直觀（union 可能超過任一 worktree 的實際完成度而誤導）。
- **簽章換行正規化**：見 D3（autocrlf 導致同一 commit 在不同 worktree 換行不同，E2E 重現，正規化後才正確收合）。

## Risks / Trade-offs

- **內容簽章成本／正確性** → 只對同 slug 多 worktree 者比對、以 change 為單位快取；簽章涵蓋檔案路徑＋內容，避免僅比 mtime 造成誤判。
- **收合改變既有「同 slug 都顯示」需求（spec-breaking）** → 明確標為 MODIFIED 需求並保留分歧分列；membership badge 讓「它在幾個 worktree」仍可見，資訊不流失。
- **mtime 在剛 clone/checkout 時可能全部相近** → 有 git timestamp 者仍以 timestamp 為主鍵，mtime 僅為無 timestamp 時的 fallback；影響面限於未 commit 的 change。
- **Windows 路徑大小寫** → 以正規化 util 統一比較，並在 repro 已見 `C--git-spek` vs `c--git-spek` 差異，為此設計測試案例。
- **live-activity pulse 可能干擾** → 短暫、尊重 `prefers-reduced-motion`；篩選掉的 worktree 只 pulse chip 不動列表。
- **IntelliJ 對齊落後風險** → watch 來源標記與正規化需在 Kotlin 側同步；以既有 `WatchPolling.kt`／`ArtifactDiscovery.kt` 對齊模式為範本，並補 Kotlin 單元測試。

## Migration Plan

1. Core：型別擴充（membership）、排序 fallback、內容簽章收合、路徑正規化 util，附 `@spek/core` 單元測試（含 Windows 大小寫案例）。
2. Web server：`/watch` 一律聚合監看全 worktree、事件帶 worktree key。
3. 共用前端：`useFileWatcher` 帶來源＋連線去耦；Changes 頁 worktree 篩選列、membership badge、live pulse、篩選調解；detail `?wt=` fallback。
4. VS Code：panel worktree watcher 重評估、事件帶來源、路徑正規化。
5. IntelliJ：Kotlin 對齊 watch 來源標記與正規化，嵌入 SPA 自動獲得 UI。
6. 文件：CLAUDE.md 與三份 CHANGELOG 同步。
- **Rollback**：純新增行為，預設 `All` 等同今日聚合；如需退回，移除篩選列並還原 `/watch` 監看即可，資料合約向後相容（無 `worktree` 欄位時僅退化為不 pulse）。

## Open Questions

- membership badge 的精確視覺（`main +1` vs 顯示全部 chip）留待 frontend-design 決定，spec 只約束語意。
- 陳舊 `localStorage` aggregate 偏好是否主動遷移為單一 worktree 選取，或直接忽略退回 All（傾向後者，較單純）。
- VS Code 原生 sidebar TreeView 是否也要 worktree 分組（本次 Non-Goal，視回饋再議）。
