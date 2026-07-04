## Context

`ChangeDetail.tsx` renders a change as artifact tabs. Two independent axes already exist:

- **Order** — the sort control (`Last modified` default / `Schema order` / `A–Z`) decides the order of the tab strip via `sortArtifacts(rawArtifacts, sortMode, schemaOrder)`.
- **Selection** — the active tab is `artifacts.find(a => a.id === tabParam) ?? artifacts[0]`, where `tabParam` is the `?tab=<id>` query param.

Live-reload (the `useFileWatcher` → refresh path) re-fetches the change on any `openspec/` change, so `data.artifacts` updates in place. Because the payload is delivered newest-mtime-first, `rawArtifacts[0]` is always the most-recently-modified artifact.

This change adds a **third axis — follow** — that overrides *selection* (not order) to track `rawArtifacts[0]`, opt-in and ephemeral.

## Goals / Non-goals

- **Goal:** an explicit, opt-in "watch this change" mode that keeps the newest edit selected as a change evolves, without touching tab order.
- **Non-goal:** following edits *across* changes (scope is the open change only). No persistence. No new server/CLI/adapter work. No cross-surface state contract.

## Decisions

1. **Separate toggle, off by default.** A `Follow` control sits next to the sort control, decoupled from sort mode (you can follow while tabs are A–Z). Off by default so nobody's focus is stolen unless they asked. *(Rejected: coupling to "Last modified" mode — re-entangles the two axes; persisting the toggle — re-creates silent focus-steal on changes you didn't opt into.)*
2. **Scope = open change only.** *(Rejected: repo-wide live tail — yanks the user between changes/specs unpredictably; much larger build.)*
3. **Manual click disarms.** Clicking a tab both selects it and turns Follow off — mirrors "scroll up stops the tail" in log viewers. *(Rejected: keep-armed / re-arm-next-change — both re-introduce the focus-steal we are making consensual.)*
4. **Ephemeral component state.** Off on every open, resets on navigation. *(Rejected: global `localStorage` persistence like the sort preference.)*
5. **"Latest" = `rawArtifacts[0]`.** Live-reload only signals "something changed" and the view re-fetches, so the newest is read from the already-mtime-ordered payload — no need to know which file fired, and no new data.
6. **Availability gate:** shown only for **active changes** (archived changes never live-update) with **≥2 artifacts** (nothing to follow between with one).

## Design

### UI
A small toggle button (tail/pin icon + `Follow` label) in the change-detail header, adjacent to the sort control. `role`/`aria-pressed` for accessibility; accent-filled when armed. Rendered only when `status === "active" && artifacts.length >= 2`.

### Selection logic (the testable core)
Extract a pure helper so `ChangeDetail.tsx` stays declarative and the behaviour is unit/mutation-testable:

```ts
// returns the id of the artifact that should be active
resolveActiveArtifactId(params: {
  follow: boolean;
  tabParam: string | null;
  rawArtifacts: ChangeArtifact[];   // recency (mtime) order from core — [0] is newest
  sortedArtifacts: ChangeArtifact[]; // current tab order (post sortArtifacts)
}): string
```

- `follow === true` → return `rawArtifacts[0]?.id` (the newest-modified), regardless of sort order.
- `follow === false` → return the existing behaviour: `sortedArtifacts.find(a => a.id === tabParam)?.id ?? sortedArtifacts[0]?.id ?? ""`.

`ChangeDetail.tsx` holds `const [follow, setFollow] = useState(false)` and computes `activeTab = resolveActiveArtifactId({ follow, tabParam, rawArtifacts, sortedArtifacts })`. Because it's derived, enabling Follow re-selects the newest immediately, and each live-reload (new `rawArtifacts`) re-derives to the new newest — no effect needed.

### Interactions
- **Enable:** `setFollow(true)` → derived `activeTab` recomputes to `rawArtifacts[0]`.
- **Live-reload while armed:** `data` updates → `rawArtifacts` changes → `activeTab` re-derives to the new newest → `TabView` switches.
- **Manual click:** the existing `handleTabChange(id)` additionally calls `setFollow(false)`, then sets `?tab=id`. With Follow off, the `find(tab)` branch takes over and anchors on the click.
- **Navigate away / open another change:** component unmounts (or `slug` changes) → `follow` resets to `false`.

### Edge cases
- **Equal mtimes:** `rawArtifacts[0]` uses the existing stable tiebreak (`proposal, design, specs, tasks`, then alpha) — deterministic; no thrash.
- **Newest artifact is brand-new (first appearance):** it is `rawArtifacts[0]`; with Follow on the view selects it. With Follow off it appears in the strip per sort order but does not grab focus.
- **`?tab=` staleness:** irrelevant while Follow is on (selection is derived from newest, not `tabParam`); a manual click writes a fresh `?tab=` and disarms in the same handler, so the two never conflict.

## Testing

Unit-test `resolveActiveArtifactId` (and mutation-test it to the repo's ~91% bar, matching `artifact-sort`):
- follow on → returns newest (`rawArtifacts[0]`) even when `tabParam` points elsewhere and sort order differs.
- follow off, `tabParam` set + present → returns it; `tabParam` absent/unknown → returns `sortedArtifacts[0]`.
- a reload that changes which artifact is `rawArtifacts[0]` moves the result while follow on; does not move it while follow off.
- empty artifacts → returns `""` (no crash).

The availability gate (`status`/length) and the disarm-on-click wiring are exercised by the component; the mtime source is already covered by the `artifacts` tests.
