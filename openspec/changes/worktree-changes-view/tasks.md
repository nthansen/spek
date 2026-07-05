## 1. Core: types, path normalization, ordering

- [x] 1.1 在 `@spek/core` types 擴充 change 的 worktree membership 欄位（`worktrees: WorktreeSource[]`）與 `mtime`，與既有 `source` 並存；更新跨 core/API/adapters 的合約型別
- [x] 1.2 新增路徑正規化比較 util（`normalizeWorktreePath` / `sameWorktreePath`：resolve + 分隔線一致 + Windows/macOS 大小寫不敏感）於 `worktrees.ts`，`worktreeKey` 改用正規化路徑；主 worktree 一律以 `isMain` 結構化辨識，不看分支名
- [x] 1.3 排序改為數值 epoch（`compareChangesByRecency`）：無 git timestamp 時以 change 目錄 mtime（取內部最新檔案）為 fallback 鍵，維持「掃描不呼叫 CLI」
- [x] 1.4 單元測試：mtime fallback 讓未 commit 的 worktree change 浮上；有 timestamp 者維持既有序；Windows 大小寫路徑比較

## 2. Core: identical-change collapse + membership

- [x] 2.1 實作 change 目錄內容簽章（`changeSignature`，對檔案相對路徑＋內容 hash），只對「同 slug 出現在 ≥2 worktree」者計算
- [x] 2.2 修改 `scanOpenSpecAggregated` active 聚合（`mergeActiveChanges`）：同 slug 內容相同 → 收合成單列（primary source 主 worktree 優先、附 membership），內容分歧 → 分列；unique change membership 只含自身
- [x] 2.3 單元測試：identical 收合＋membership 正確；diverging 分列；未 commit change 浮上；`changeSignature` 相同/相異

## 3. Web server: watch always-aggregate + event source identity

- [x] 3.1 `/watch` 改為一律 `listWorktrees` 聚合監看所有 worktree 的 `openspec/`，不再依 `aggregate` query 切換監看集合；共用 watcher 以 repository 為單位
- [x] 3.2 事件 payload 擴為 `{"type":"changed","worktree":"<key>"}`：由變動檔案路徑反查所屬 worktree（比對各 watcher 對應的 worktree 根，用正規化比較）
- [x] 3.3 確認 client disconnect 清理與 debounce（500ms）維持；補測試或手動驗證多 worktree 事件歸屬

## 4. Shared frontend: watcher decoupling + activity plumbing

- [x] 4.1 `useFileWatcher`：維持單一穩定連線，生命週期不綁 worktree 篩選／aggregate 偏好；解析事件的 `worktree` key 並透過 refresh 協調層帶出（無欄位時僅刷新不標活動）
- [x] 4.2 VS Code 分支：處理 `{type:"fileChanged",worktree}` postMessage，surface worktree key
- [x] 4.3 提供讓 Changes 頁取用「最近變動的 worktree key（短暫）」的機制（context/state），供 pulse 使用

## 5. Shared frontend: worktree filter UI

- [x] 5.1 新增 worktree 篩選列元件：`All`（預設）＋每 worktree 多選 toggle，僅在 >1 worktree 顯示；單一 worktree 時不渲染、列表等同今日
- [x] 5.2 選取狀態持久化於 `localStorage`（per repo），載入／重掃後對照現存 worktree 調解：移除不存在 key、清空則退回 `All`
- [x] 5.3 `ChangeList` 依選取集 client-side 過濾（membership 交集）；移除舊的二元 aggregate checkbox 與其 re-fetch 路徑（遷移為 All＝former on）
- [x] 5.4 擴充 `WorktreeBadge`：collapsed change 顯示 membership（如 `main +1`），tooltip 列出所屬 worktree

## 6. Shared frontend: live-activity pulse

- [x] 6.1 依「最近變動 worktree key」讓對應 filter toggle pulse；可見的該 worktree change rows 一併 pulse
- [x] 6.2 篩選掉的 worktree 只 pulse 其 toggle（off-screen 提示），不干擾列表
- [x] 6.3 尊重 `prefers-reduced-motion`：無動畫替代呈現；pulse 短暫且快速連續變動不 strobe

## 7. Change detail: wt fallback

- [x] 7.1 detail 讀取：`wt` key 不存在或該 worktree 無此 slug 時，退回「任一仍含此 slug 的 worktree、主 worktree 優先」，不報錯
- [x] 7.2 單一 worktree 時免 `wt` 解析；補 Web（route）與 VS Code（handler）兩側對齊
- [x] 7.3 測試／手動驗證：檢視中 worktree 被 prune 後 detail 平順退回聚合副本

## 8. VS Code: worktree watcher robustness

- [x] 8.1 panel worktree watcher 集合於重掃時重新評估：新增 worktree 開始監看、移除者關閉；用正規化比較避免主 worktree 漏監看或重複監看
- [x] 8.2 `watchOpenspecDir`／通知帶上 worktree key，`notifyFileChange` 傳遞來源
- [ ] 8.3 驗證：panel 開啟後新增 worktree 內編輯會即時刷新並標活動

## 9. IntelliJ: descoped to follow-up

IntelliJ 的 Kotlin port 在本 base 完全沒有 worktree 聚合（無 `listWorktrees` / 聚合 / 收合 / watch 多 worktree），故對齊等同「從零把整個 worktree 子系統移植到 Kotlin」——屬另一個獨立且較大的變更，不在本 change 範圍。IntelliJ 會平順退化：嵌入的 React SPA 收到單一 worktree 資料時篩選列不顯示、行為同今日，不會壞。

- [x] 9.1 確認 IntelliJ 在單一 worktree 資料下平順退化（filter 列隱藏、無 regression）——設為 Non-Goal，Kotlin worktree parity 另立 follow-up change
- [ ] 9.2 （follow-up）將 worktree 子系統移植至 Kotlin：`listWorktrees`、聚合、收合、簽章、`readChangeAggregated`、watch 全 worktree、membership、mtime 排序＋單元測試

## 10. Verification, docs, changelog

- [x] 10.1 端到端驗證（web + VS Code）：以 repro 場景確認排序、收合＋membership、篩選 toggle、跨 worktree live pulse、prune 後退化
- [x] 10.2 基準 gate：`npm run type-check` 與各 package 測試（`npm run test -w @spek/core` 等）通過；重建 web/webview/intellij bundles
- [x] 10.3 個人品質 gate（不 commit 工具至 feature branch）：對變更檔跑 LSP 診斷；unused-export／smell 檢查（`knip`/`ts-prune` via npx，consumer 都接好後才跑）；對變更的 core 邏輯跑 mutation testing（Stryker，`mutate` 限縮到變更檔），存活 mutant 就補強測試
- [x] 10.4 更新 CLAUDE.md 相關段落（worktree-aggregation／live-reload／change-browsing 行為）
- [x] 10.5 同步更新三份 CHANGELOG（root、vscode、intellij）
