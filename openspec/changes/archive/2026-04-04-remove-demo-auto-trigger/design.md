## Context

目前 `build-demo.yml` 有兩個 trigger：
1. `push` 到 master 且 `openspec/**` 有變動 → 自動 rebuild demo 並 commit
2. `workflow_dispatch` → 手動觸發

Release skill 的 step 6 也會在本地 rebuild demo 並 commit。兩者重複且環境不同，造成每次 release 後 GitHub Action 都多產生一個不必要的 commit。

既然 demo rebuild 統一由 release skill 處理，`build-demo.yml` 已無存在必要（手動觸發的場景也不存在），直接刪除最乾淨。

## Goals / Non-Goals

**Goals:**
- 消除 release 流程中 demo rebuild 的重複問題
- 確保 demo 版本與 release tag 精確對齊
- 簡化 CI workflow 數量

**Non-Goals:**
- 不修改 `action.yml`（composite action 供外部使用，不受影響）
- 不修改 release skill 的 step 6（本地 rebuild 保持不變）
- 不修改 build-demo.ts 腳本

## Decisions

### 刪除 build-demo.yml 而非僅移除 push trigger

直接刪除整個 workflow 檔案，而非保留只剩 `workflow_dispatch` 的空殼。

**理由：** 移除 push trigger 後，唯一剩下的 `workflow_dispatch` 沒有實際使用場景 — demo rebuild 已由 release skill 統一處理，不需要額外的手動觸發管道。保留一個永遠不會用到的 workflow 只會增加維護負擔和混淆。

## Risks / Trade-offs

- [Trade-off] openspec 內容變動但未 release 時，demo 不會自動更新 → 影響低，demo 主要用途是展示，綁定 release 版本更合理
- [Trade-off] 失去 CI 端手動 rebuild demo 的能力 → 需要時可在本地跑 `npm run build:demo`，或未來有需求再加回 workflow
