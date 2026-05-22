## ADDED Requirements

### Requirement: Aggregated scan entry point

The `@spek/core` package SHALL provide an async function `scanOpenSpecAggregated(dir, options)` that returns a `ScanResult` aggregated across all worktrees of the repository containing `dir`, following the worktree-aggregation rules. Active changes SHALL be the source-tagged union of all worktrees; archived changes SHALL be the slug-deduplicated union; `specs` SHALL be taken only from the main worktree (the first non-bare worktree). Each aggregated `ChangeInfo` SHALL carry an optional `source` field of type `WorktreeSource`. The existing `scanOpenSpec` function SHALL remain unchanged and continue to scan a single directory with no `source` attached.

#### Scenario: Aggregated scan over multiple worktrees

- **WHEN** `scanOpenSpecAggregated(dir)` is called and the repo has multiple worktrees
- **THEN** `activeChanges` contains every worktree's active changes, each with a `source`
- **AND** `archivedChanges` is the slug-deduplicated union across worktrees
- **AND** `specs` contains only the main worktree's spec topics

#### Scenario: Aggregated scan falls back for single worktree

- **WHEN** `scanOpenSpecAggregated(dir)` is called and the repo has a single worktree or is not a git repository
- **THEN** the result equals `scanOpenSpec(dir)` and no `source` is attached to changes

#### Scenario: scanOpenSpec remains unchanged

- **WHEN** `scanOpenSpec(dir)` is called
- **THEN** it scans only `dir` and its `ChangeInfo` entries carry no `source`, exactly as before this change
