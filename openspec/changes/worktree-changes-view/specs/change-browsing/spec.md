## ADDED Requirements

### Requirement: Grouped change presentation across worktrees

The active change list SHALL group changes by change (slug). When a change has more than one variant across worktrees (its identical copies collapsed, its diverging copies kept separate), it SHALL render as a group: a header showing the change title and a **furthest-along** progress summary (the task progress of the variant with the most completed tasks), above one sub-row per variant. Variant sub-rows SHALL be ordered furthest-along first (most completed tasks on top), with equal-progress variants keeping recency order. Each variant sub-row SHALL show its worktree membership chips and a compact progress meter (so different progress across worktrees reads at a glance). A change with only a single variant (all worktrees identical, or a single-worktree change) SHALL render as a plain row, not a group.

#### Scenario: Diverging change renders as a group with furthest-along header

- **WHEN** a change is `2/4` in the `main` and `hotfix` worktrees and `3/4` in `feat`
- **THEN** it renders as a group titled with the change, headed by a `3 / 4` furthest-along summary
- **AND** the `feat` variant (`3/4`) sub-row appears above the `main, hotfix` variant (`2/4`) sub-row
- **AND** each sub-row shows a compact progress meter

#### Scenario: Fully-identical change renders as a plain row

- **WHEN** a change is identical across every worktree that has it
- **THEN** it renders as a single plain row (one variant), not a group

#### Scenario: Single-worktree change renders as a plain row

- **WHEN** a change exists in only one worktree
- **THEN** it renders as a plain row

### Requirement: Worktree filter control

When the change list is showing a repository with more than one worktree, it SHALL display a worktree filter row consisting of an "All" option plus one toggle per worktree (labelled by branch name, or a short worktree label for a detached HEAD). "All" SHALL be the default and SHALL show the aggregated union across every worktree. The per-worktree toggles SHALL be multi-select: enabling a subset SHALL filter the list to changes whose worktree membership intersects the selected set; enabling every worktree SHALL be equivalent to "All". Filtering SHALL be performed client-side using the `source` and membership each change already carries, without re-fetching from the server. When the repository has only one worktree, the filter row SHALL NOT be shown and the list SHALL render as a plain single-worktree list.

The selected set SHALL persist across sessions (per repository) via `localStorage`, and SHALL be reconciled against the currently available worktrees on load and on rescan: any selected worktree key that no longer exists SHALL be dropped from the selection, and if the selection becomes empty the view SHALL fall back to "All".

#### Scenario: Filter row shown with multiple worktrees

- **WHEN** the repository has more than one worktree
- **THEN** a worktree filter row is shown with an "All" option (default, selected) and a toggle per worktree

#### Scenario: Focus a single worktree

- **WHEN** the user selects only the `feat` worktree in the filter
- **THEN** the change list shows only changes whose membership includes the `feat` worktree

#### Scenario: Select a subset of worktrees

- **WHEN** the user enables `main` and `feat` but not `hotfix`
- **THEN** the list shows changes belonging to `main` or `feat` and hides changes that belong only to `hotfix`

#### Scenario: All worktrees equals aggregate

- **WHEN** every worktree toggle is enabled
- **THEN** the list is identical to the "All" aggregated view

#### Scenario: Filter row hidden for single worktree

- **WHEN** the repository has only one worktree
- **THEN** no worktree filter row is shown and the list renders as a plain single-worktree list

#### Scenario: Selection reconciled when a worktree disappears

- **WHEN** the user has filtered to the `feat` worktree and that worktree is later removed (pruned after its branch merged) and the content is rescanned
- **THEN** the now-absent `feat` key is dropped from the selection
- **AND** because the selection is empty the view falls back to "All"

### Requirement: Worktree live-activity indication

When a live-reload event identifies the worktree whose file changed, the change list SHALL briefly indicate activity on that worktree: the worktree's filter toggle SHALL pulse, and any currently visible change rows belonging to that worktree SHALL pulse. Activity on a worktree that is currently filtered out SHALL still pulse that worktree's toggle, signalling off-screen change so the user knows to look there. The indication SHALL be brief and SHALL honor `prefers-reduced-motion` (no motion-based animation when reduced motion is requested; a non-animated affordance MAY be used instead).

#### Scenario: Visible worktree pulses on change

- **WHEN** a live-reload event reports a change in the `feat` worktree and `feat` is currently shown
- **THEN** the `feat` filter toggle and the affected visible change rows briefly pulse

#### Scenario: Filtered-out worktree signals off-screen activity

- **WHEN** a live-reload event reports a change in the `hotfix` worktree while the filter is limited to `main`
- **THEN** the `hotfix` filter toggle pulses to signal off-screen activity
- **AND** the visible list is not disrupted

#### Scenario: Reduced motion honored

- **WHEN** the user's system requests reduced motion
- **THEN** the activity indication is applied without motion-based animation

## MODIFIED Requirements

### Requirement: Worktree membership chips on change rows

When the change list is showing aggregated results from more than one worktree, each change row SHALL display, directly on the change, one clickable chip per worktree the change belongs to (labelled by branch name, or a short worktree label for a detached HEAD). Clicking a worktree chip SHALL navigate to that worktree's copy of the change (`/changes/<slug>?wt=<key>`) without triggering the row's default navigation. A chip whose worktree is currently being updated SHALL pulse (honoring `prefers-reduced-motion`). When a change belongs only to the single main worktree, no chip SHALL be shown (to avoid noise); when results come from a single worktree overall, no chips SHALL be shown.

#### Scenario: Membership chips under aggregation

- **WHEN** a change is shared across the `main`, `feat`, and `hotfix` worktrees
- **THEN** its row shows three clickable chips `main`, `feat`, `hotfix`

#### Scenario: Chip navigates to that worktree's copy

- **WHEN** the user clicks the `feat` chip on a change row
- **THEN** the app navigates to `/changes/<slug>?wt=<feat-key>` (that worktree's copy)
- **AND** the row's own default navigation is not also triggered

#### Scenario: No chips for single worktree

- **WHEN** the change list shows changes from a single worktree
- **THEN** no worktree chips are rendered

### Requirement: Worktree switcher on change detail

When a change being viewed exists in more than one worktree, the change-detail page SHALL display a worktree switcher listing every worktree that holds the change (main worktree first), with the currently-viewed worktree indicated. Selecting a worktree SHALL load that worktree's copy of the change (`?wt=<key>`). The change-detail read SHALL report the full set of worktrees holding the slug so the switcher can be rendered. When the change exists in only one worktree, no switcher SHALL be shown.

#### Scenario: Switcher lists all worktrees holding the change

- **WHEN** the user opens a change that exists in the `main`, `feat`, and `hotfix` worktrees
- **THEN** a worktree switcher shows `main`, `feat`, and `hotfix`, with the currently-viewed one indicated

#### Scenario: Switching worktree loads that copy

- **WHEN** the user selects the `feat` worktree in the switcher while viewing the `main` copy
- **THEN** the page reloads the change from the `feat` worktree (`?wt=<feat-key>`)

#### Scenario: No switcher for a single-worktree change

- **WHEN** the viewed change exists in only one worktree
- **THEN** no worktree switcher is shown

### Requirement: Worktree-qualified change links

Under aggregation, a change row SHALL link to its detail page with a `wt` query parameter identifying its source worktree, so that same-slug changes from different worktrees resolve to the correct change. The change detail page SHALL read the `wt` query parameter and request the change from the matching worktree; when `wt` is absent it SHALL request the change from the currently selected directory, as before.

When the `wt` parameter refers to a worktree that no longer exists (for example it was pruned after a merge) or that no longer contains the slug, the detail page SHALL gracefully fall back to reading the change from the aggregate — any worktree that still contains that slug, preferring the main worktree — rather than showing an error. When the repository has collapsed to a single worktree, the change SHALL resolve from that worktree without requiring a `wt` parameter.

#### Scenario: Aggregated row links with wt parameter

- **WHEN** the user clicks an aggregated change row
- **THEN** the app navigates to `/changes/<slug>?wt=<key>` for that change's worktree

#### Scenario: Same-slug changes resolve independently

- **WHEN** two worktrees both have a diverging active change `add-foo` and the user opens each from the list
- **THEN** each detail page shows the change content from its own worktree

#### Scenario: Detail page without wt parameter

- **WHEN** the user opens `/changes/<slug>` with no `wt` parameter
- **THEN** the change is read from the currently selected directory, as before this change

#### Scenario: Stale wt falls back to aggregate

- **WHEN** the user is viewing `/changes/<slug>?wt=<key>` and that worktree is removed (pruned after merge) so `<key>` no longer resolves
- **THEN** the detail page falls back to reading `<slug>` from a worktree that still contains it, preferring the main worktree
- **AND** no error is shown

#### Scenario: Collapse to single worktree resolves without wt

- **WHEN** all other worktrees have merged away so the repository has a single worktree
- **THEN** the change resolves from that one worktree without requiring a `wt` parameter

## REMOVED Requirements

### Requirement: Aggregation toggle control

**Reason**: Replaced by the more capable "Worktree filter control", which generalizes the binary on/off aggregation checkbox into an "All" default plus per-worktree multi-select toggles. Filtering is now performed client-side on already-fetched data rather than by re-fetching with an `aggregate` value, which also removes the watcher-reconnection gap that the on/off toggle caused.

**Migration**: The former "aggregation on" state corresponds to selecting "All" (the default). Restricting to a single worktree corresponds to selecting only that worktree in the new filter. The persisted `localStorage` aggregate preference is superseded by the persisted worktree selection; a stored aggregate-off value MAY be migrated to a single-worktree selection or simply ignored (defaulting to "All").
