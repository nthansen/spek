## Context

spek 的 GitHub Action 目前只產出靜態 HTML 網站。OpenSpec 社群（issue #1 @mipmip）希望能產生 SVG badge 放在 README 中展示 OpenSpec 專案狀態。`@spek/core` 已有 `scanOpenSpec` 可取得所有需要的數據（specs 數、changes 數、task 統計）。

## Goals / Non-Goals

**Goals:**
- 產生 3 種 SVG badge：Specs 數量、Open Changes 數量、Tasks 完成率
- 整合進現有 GitHub Action，透過 `generate-badges` input 啟用
- Badge 檔案輸出到可配置的目錄，方便搭配 GitHub Pages 部署

**Non-Goals:**
- 不做即時動態 badge 服務（如 shields.io endpoint）
- 不修改 `@spek/core`，直接使用既有 API
- 不把 badge 產生做成獨立 action

## Decisions

### Badge 產生方式
使用純 TypeScript 腳本產生靜態 SVG 檔案，不依賴外部服務或套件。SVG badge 模板直接用字串模板產生，格式參考 shields.io flat style。

**替代方案**：使用 shields.io 的 endpoint badge → 需要額外部署服務，增加複雜度。使用 `badge-maker` npm 套件 → 增加依賴，SVG 模板很簡單不需要。

### Badge 檔案結構
輸出到 `badges/` 子目錄（在 action output path 旁邊）：
```
spek-output/
├── spek.html
└── badges/
    ├── specs.svg
    ├── open_changes.svg
    └── tasks.svg
```

### Action 整合方式
在 `action.yml` 新增一個 optional step，只在 `generate-badges` 為 `true` 時執行。使用同一個已建置的 `@spek/core` 來掃描資料。

## Risks / Trade-offs

- **SVG 樣式有限** → 自製模板只支援 flat style，但足夠使用。未來有需要可改用 `badge-maker`。
- **Badge 數據是靜態的** → 只在 CI 跑的時候更新，不是即時的。這是 GitHub Pages badge 的標準做法。
