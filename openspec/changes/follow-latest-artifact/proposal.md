## Why

The change-detail view can order artifact tabs (Last modified / Schema order / A–Z), and in "Last modified" mode a live-reload naturally surfaces the newest edit. But there is no *intentional* way to watch a change evolve. Today the behaviour is implicit and un-toggleable: on a change you have not clicked into, the newest edit silently steals tab focus; once you click a tab you are anchored and never see later edits surface. Neither is a deliberate choice by the user.

A "Follow latest" toggle turns that implicit focus-steal into an explicit, opt-in live-tail — genuinely useful when watching an agent (or yourself) write artifacts during a run, without hijacking focus for anyone who did not ask for it. Because the shared React app renders on all three surfaces, one toggle serves web, VS Code, and IntelliJ.

## What Changes

- Add an opt-in **"Follow latest" toggle** to the change-detail header, beside the sort control. Shown only for **active changes with ≥2 artifacts**, and **off by default**.
- When on, the active tab tracks the **newest-modified artifact** (the first entry of the recency-ordered `artifacts` payload) and moves to the new newest after each live-reload — **independent of the tab sort order** (tabs may be A–Z while Follow still jumps to the newest edit).
- Enabling Follow **immediately** selects the current newest; a **manual tab click disarms** it (the user has taken control).
- **Ephemeral**: plain component state, off on every open, reset on navigation — no persistence, so it never silently steals focus on a change the user did not opt into watching.
- The active-tab selection logic is extracted into a **pure helper** (`resolveActiveArtifactId`) so it can carry unit + mutation tests, keeping `ChangeDetail.tsx` thin.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `change-browsing`: Add a requirement for **follow-latest artifact selection** — an opt-in live-tail of the newest-modified artifact in the open change, decoupled from tab order, that arms on enable, moves selection on each refresh, and disarms on manual tab selection; ephemeral and offered only where it can apply (active change, ≥2 artifacts).

## Impact

- `packages/web/src/pages/ChangeDetail.tsx` — the Follow toggle + wiring; active selection derived from the new pure helper instead of the inline `find(tab) ?? artifacts[0]` expression.
- `packages/web/src/utils/` — new pure `resolveActiveArtifactId(...)` helper + unit test (mutation-tested to the repo's ~91% bar, like the sort helpers).
- **No** core / server / API-adapter changes (uses the existing `artifacts[]` contract and the existing live-reload refresh path). **No** IntelliJ/Kotlin change (shared React component). **No** new dependency.

## Dependencies

- Builds on the `custom-schema-artifacts` work (the generic `ChangeDetail.artifacts[]` array and its recency/mtime ordering). This change should land after, or on top of, that one.
