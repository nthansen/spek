## Context

目前前端有三種時間顯示方式：
1. `formatRelativeTime()` → "4 days ago"（Dashboard、ChangeList，有 git timestamp 時）
2. 直接顯示 `c.date` → "2026-02-13"（無 git timestamp 時的 fallback）
3. `new Date(timestamp).toLocaleString()` → "2026/4/5 下午9:14:42"（SpecDetail History）

## Goals / Non-Goals

**Goals:**
- 全部統一為 YYYY-MM-DD 格式
- 改動範圍最小化

**Non-Goals:**
- 不改變資料層（core 的 timestamp/date 欄位不動）
- 不加 hover tooltip

## Decisions

### 修改策略
直接修改 `formatRelativeTime` 函數內容，讓它回傳 YYYY-MM-DD。因為 Dashboard 和 ChangeList 都呼叫這個函數，改一處就全部生效。SpecDetail 單獨改掉 `toLocaleString()` 呼叫。

保留 `formatRelativeTime` 函數名稱（不重新命名），避免不必要的 import 變更。

## Risks / Trade-offs

- 失去相對時間的「一眼看出新舊」優勢，但絕對日期更精確且一致。
