## Why

前端顯示時間格式不一致：Dashboard 和 ChangeList 在有 git timestamp 時顯示相對時間（"4 days ago"），沒有時顯示 YYYY-MM-DD；SpecDetail 的 History 則用 `toLocaleString()` 顯示完整本地時間。使用者體驗不統一，應全部改為 YYYY-MM-DD 絕對日期格式。

## What Changes

- 將 `formatRelativeTime` 改為回傳 YYYY-MM-DD 格式
- 統一 SpecDetail History 的時間顯示，從 `toLocaleString()` 改為相同的 YYYY-MM-DD 格式

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `markdown-renderer`: 統一時間顯示格式為 YYYY-MM-DD（影響 Dashboard、ChangeList、SpecDetail）

## Impact

- `packages/web/src/utils/formatRelativeTime.ts`：改為回傳 YYYY-MM-DD
- `packages/web/src/pages/SpecDetail.tsx`：改用統一的格式化函數
- Dashboard.tsx、ChangeList.tsx 不需改動（它們呼叫 `formatRelativeTime`，改了函數內容就會生效）
