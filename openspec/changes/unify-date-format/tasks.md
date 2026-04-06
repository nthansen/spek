## 1. 統一時間格式

- [x] 1.1 修改 `formatRelativeTime.ts`，將 `formatRelativeTime` 函數改為回傳 YYYY-MM-DD 格式
- [x] 1.2 修改 `SpecDetail.tsx`，將 `toLocaleString()` 改為使用 `formatRelativeTime`

## 2. 修正 Demo SpecList 缺少 historyCount

- [x] 2.1 修正 `build-demo.ts`，保留 `scan.specs` 的 `historyCount` 欄位
