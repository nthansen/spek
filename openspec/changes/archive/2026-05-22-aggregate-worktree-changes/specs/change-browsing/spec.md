## ADDED Requirements

### Requirement: Worktree source indicator on change rows

When the change list is showing aggregated results from more than one worktree, each change row SHALL display a compact indicator of its source worktree (the branch name, or a short worktree label when the worktree has a detached HEAD). When results come from a single worktree, no source indicator SHALL be shown.

#### Scenario: Source indicator under aggregation

- **WHEN** the change list shows changes aggregated from multiple worktrees
- **THEN** each change row displays its source worktree or branch

#### Scenario: No source indicator for single worktree

- **WHEN** the change list shows changes from a single worktree
- **THEN** no source indicator is rendered

### Requirement: Aggregation toggle control

The change list SHALL provide a control to turn worktree aggregation on or off, shown only when more than one worktree is detected. The chosen state SHALL persist across sessions via `localStorage`, defaulting to on. Toggling SHALL re-fetch the change list with the corresponding `aggregate` value.

#### Scenario: Toggle visible with multiple worktrees

- **WHEN** the repository has multiple worktrees
- **THEN** an aggregation toggle is shown, defaulting to on

#### Scenario: Toggle hidden with single worktree

- **WHEN** the repository has only one worktree
- **THEN** no aggregation toggle is shown

#### Scenario: Toggle state persists

- **WHEN** the user turns aggregation off and reloads the app
- **THEN** aggregation remains off

### Requirement: Worktree-qualified change links

Under aggregation, a change row SHALL link to its detail page with a `wt` query parameter identifying its source worktree, so that same-slug changes from different worktrees resolve to the correct change. The change detail page SHALL read the `wt` query parameter and request the change from the matching worktree; when `wt` is absent it SHALL request the change from the currently selected directory, as before.

#### Scenario: Aggregated row links with wt parameter

- **WHEN** the user clicks an aggregated change row
- **THEN** the app navigates to `/changes/<slug>?wt=<key>` for that change's worktree

#### Scenario: Same-slug changes resolve independently

- **WHEN** two worktrees both have an active change `add-foo` and the user opens each from the list
- **THEN** each detail page shows the change content from its own worktree

#### Scenario: Detail page without wt parameter

- **WHEN** the user opens `/changes/<slug>` with no `wt` parameter
- **THEN** the change is read from the currently selected directory, as before this change
