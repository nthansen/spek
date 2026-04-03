## REMOVED Requirements

### Requirement: Automated demo rebuild workflow
**Reason**: Demo rebuild 由 release skill 統一在本地執行，CI 端的自動 rebuild 造成重複 commit 且因環境差異產出不一致的結果。`build-demo.yml` 已無存在必要。
**Migration**: Demo rebuild 透過 `/release` skill step 6 處理。如需在非 release 時更新 demo，在本地執行 `npm run build:demo`。
