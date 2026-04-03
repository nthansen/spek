## Why

Release skill (`/release`) 的 step 6 會在本地 rebuild `docs/demo.html` 並 commit，而 `build-demo.yml` GitHub Action 在 push 到 master 且 `openspec/**` 有變動時也會自動 rebuild demo 並 commit。兩者重複執行，且因本地與 CI 環境差異（Node 版本、OS），產出的 HTML 不完全一致，導致每次 release 後 Action 都會多產生一個不必要的 commit，git log 也因此散落多個 `Rebuild demo for latest openspec changes` commit。

## What Changes

- 刪除 `.github/workflows/build-demo.yml`，完全移除 CI 端的 demo 自動 rebuild
- Demo rebuild 統一由 `/release` skill 在本地執行，確保 demo 版本與 release tag 精確對齊
- 不再有 GitHub Action bot 自動 push demo rebuild commit

## Capabilities

### New Capabilities

（無新增 capability）

### Modified Capabilities

- `github-action`：移除 demo 自動 rebuild workflow，demo rebuild 改由 release skill 統一處理

## Impact

- `.github/workflows/build-demo.yml`：刪除整個檔案
- `action.yml`（composite action 供外部使用）不受影響
- Release 流程不受影響（skill step 6 維持不變）
- 外部使用者的 workflow 不受影響
