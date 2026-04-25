## 1. Pure helpers + tests

- [x] 1.1 Create `packages/web/src/components/timeline/scale.ts` with `scaleTime(domainStart, domainEnd, rangeStart, rangeEnd)` and `generateTicks(domainStart, domainEnd)` (major/minor by span buckets per design D3)
- [x] 1.2 Create `packages/web/src/components/timeline/grouping.ts` with `buildLanes(changes, graphData?, groupByTopic)` returning `{ lanes: Lane[], unknownCreated: ChangeInfo[] }`; deterministic ordering by `createdDate` ascending
- [x] 1.3 Add unit tests under `packages/web/src/components/timeline/__tests__/` using node:test + tsx; cover empty, single change, missing dates, multi-topic, span buckets (<14d, 14-60d, 60-365d, >365d)
- [x] 1.4 Wire test runner: ensure `npm run test -w @spek/web` (or equivalent) executes new tests; if no test script exists, add one mirroring `@spek/core` setup

## 2. Visual components

- [x] 2.1 Create `TimelineAxis.tsx` rendering SVG `<g>` with major tick lines + labels, minor grid lines, and the today vertical dashed line
- [x] 2.2 Create `TimelineBar.tsx` rendering one `<rect>` per change; archived = muted fill, active = accent fill + right-edge open arrow; emits hover/click callbacks
- [x] 2.3 Create `TimelineTooltip.tsx` as absolutely positioned HTML div showing slug, status, created/archived dates, duration, and topics list when in group mode
- [x] 2.4 Create `TimelineChart.tsx` composing axis + bars + tooltip; takes `lanes` + scale config; handles min-width horizontal scroll with sticky lane label column

## 3. Page + routing

- [x] 3.1 Create `packages/web/src/pages/TimelinePage.tsx`: fetch changes via `useChanges`, fetch graph via `useGraphData` only when group toggle is on; manage toggle state (group / hide active / hide archived)
- [x] 3.2 Render filter chips, group-by-topic toggle, the chart, and the `Unknown created` section; show empty state when all changes lack `createdDate`
- [x] 3.3 Add `/timeline` route to `packages/web/src/App.tsx` after `/graph`
- [x] 3.4 Add `Timeline` nav entry to `packages/web/src/components/Sidebar.tsx` `links` array after `Graph`, with stroke-style SVG icon matching existing nav icons

## 4. Verification

- [x] 4.1 `npm run type-check` passes
- [x] 4.2 `npm run build` passes (web + core)
- [x] 4.3 `npm run dev` manual checks: empty repo, all-active, all-archived, mixed, single change, missing-created edge cases; verify theme toggle, narrow viewport scroll, click-through navigation
- [x] 4.4 `npm run build:demo` passes; demo HTML opens and `/timeline` works (URL hash routing or BrowserRouter equivalent in demo bundle)
- [x] 4.5 Update `docs/change-lifecycle-roadmap.md` Phase 3 status entry (mark Phase 3 complete with change slug reference) — done during archive
