## ADDED Requirements

### Requirement: Aggregated change nodes from worktrees

When the graph is built from aggregated worktree data, change nodes SHALL include every worktree's active changes without deduplication and the slug-deduplicated archived changes. Change node ids SHALL be namespaced by worktree (`change:<worktreeKey>:<slug>`) so that same-slug changes from different worktrees do not collide. Spec nodes SHALL come only from the main worktree.

#### Scenario: Same-slug change nodes do not collide

- **WHEN** two worktrees each have an active change with slug `add-foo`
- **THEN** the graph contains two distinct change nodes with different ids
- **AND** each connects to the spec nodes its own delta specs reference

#### Scenario: Spec nodes from main worktree

- **WHEN** the graph is built from aggregated worktree data
- **THEN** spec nodes are taken only from the main worktree

### Requirement: Worktree source on change nodes

When the graph shows aggregated data from more than one worktree, each change node SHALL convey its source worktree, for example through its label or a tooltip. When the graph shows a single worktree, no source information SHALL be added.

#### Scenario: Change node conveys source under aggregation

- **WHEN** the graph shows aggregated data from multiple worktrees
- **THEN** each change node conveys which worktree or branch it belongs to

#### Scenario: No source on single-worktree graph

- **WHEN** the graph shows data from a single worktree
- **THEN** change nodes carry no worktree source information

## MODIFIED Requirements

### Requirement: Click navigation

The system SHALL navigate to the detail page when a node is clicked (without dragging). Clicking a spec node SHALL navigate to `/specs/:topic`. Clicking a change node SHALL navigate to `/changes/:slug`; when the graph is showing aggregated worktree data, the navigation SHALL include the change's source worktree as a `wt` query parameter (`/changes/:slug?wt=<key>`).

#### Scenario: Click spec node

- **WHEN** user clicks (without dragging) on spec node "api-adapter"
- **THEN** the app navigates to `/specs/api-adapter`

#### Scenario: Click change node

- **WHEN** user clicks (without dragging) on change node "2026-02-13-initial-implementation"
- **THEN** the app navigates to `/changes/2026-02-13-initial-implementation`

#### Scenario: Click aggregated change node

- **WHEN** the graph shows aggregated worktree data and the user clicks a change node
- **THEN** the app navigates to `/changes/<slug>?wt=<key>` for that change's source worktree
