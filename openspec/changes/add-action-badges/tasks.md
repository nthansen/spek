## 1. Badge 產生腳本

- [ ] 1.1 建立 `scripts/generate-badges.ts`，接受 `--repo-dir` 和 `--output-dir` 參數
- [ ] 1.2 使用 `@spek/core` 的 `scanOpenSpec` 取得 specs 數量、active changes 數量、task 統計
- [ ] 1.3 實作 SVG badge 模板（flat style），產生 `specs.svg`、`open_changes.svg`、`tasks.svg`

## 2. Action 整合

- [ ] 2.1 在 `action.yml` 新增 `generate-badges` input（boolean，預設 false）
- [ ] 2.2 在 `action.yml` 新增 `badges-path` output
- [ ] 2.3 在 `action.yml` 新增 badge 產生步驟（條件執行：`generate-badges == 'true'` 時）

## 3. 文件更新

- [ ] 3.1 在 `README.md` 和 `README.zh-TW.md` 的 GitHub Action 段落新增 badge 使用範例
