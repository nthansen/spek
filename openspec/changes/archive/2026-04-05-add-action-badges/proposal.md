## Why

GitHub issue #1 的 @mipmip 提到希望搭配 badges 使用，OpenSpec 官方 README 也有引用 badge SVG（specs 數量、open changes、tasks 完成狀態），但尚未實作。將 badge 產生功能整合進 spek 的 GitHub Action，讓使用者在 CI 中建置靜態網站時可以一併產生 badge SVG，放在 README 中展示 OpenSpec 狀態。

## What Changes

- 新增 `scripts/generate-badges.ts` 腳本，使用 `@spek/core` 的 `scanOpenSpec` 掃描資料，產生 SVG badge 檔案（specs 數量、open changes 數量、tasks 完成率）
- 在 `action.yml` 新增 `generate-badges` input（boolean，預設 false），啟用時在 build 完成後產生 badge SVG 到 output 目錄
- 在 `action.yml` 新增 `badges-path` output，指向 badge 檔案所在目錄

## Capabilities

### New Capabilities

- `badge-generator`: 從 OpenSpec 目錄掃描資料並產生 SVG badge 檔案

### Modified Capabilities

- `github-action`: 新增 badge 產生相關的 inputs/outputs

## Impact

- 新增 `scripts/generate-badges.ts`
- 修改 `action.yml`：新增 `generate-badges` input 和 `badges-path` output，新增 badge 產生步驟
- `@spek/core` 不需修改，直接使用既有的 `scanOpenSpec` 和 overview 計算邏輯
- README 新增 badge 使用範例
