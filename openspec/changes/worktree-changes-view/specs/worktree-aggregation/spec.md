## MODIFIED Requirements

### Requirement: Aggregate active changes across worktrees

When aggregation runs over multiple worktrees, the aggregated active changes SHALL be the union of every worktree's active changes, with same-slug changes reconciled by content:

- When an active change with the same slug exists in more than one worktree and its content is **identical** across those worktrees (the branch-point / shared-commit case), it SHALL be collapsed into a **single** aggregated entry. That entry SHALL carry a primary `source` (`WorktreeSource`) — the main worktree's copy when it is among them, otherwise the first worktree in which it appears — and a membership list of every `WorktreeSource` in which the identical change appears.
- When an active change with the same slug exists in more than one worktree but its content **differs** between them, each differing copy SHALL appear as a **separate** aggregated entry carrying its own `source` (preserving visibility of genuinely diverging in-progress versions).
- An active change unique to a single worktree SHALL appear once, carrying that worktree's `source` and a membership list containing only that worktree.

Content identity SHALL be determined by a stable signature of the change directory's files (for example a hash over file paths and contents), so that two worktrees pointing at the same committed change with no local edits collapse, while any local edit in one worktree makes it diverge.

#### Scenario: Active changes union with source

- **WHEN** worktree A has active change `add-foo` and worktree B has active change `add-bar`
- **THEN** the aggregated active list contains both, `add-foo` with `source` pointing to A and `add-bar` with `source` pointing to B

#### Scenario: Identical same-slug change collapses with membership

- **WHEN** worktree A (main) and worktree B both have an active change `shared-change` with identical content (B inherited it from the branch point without editing)
- **THEN** the aggregated active list contains exactly one `shared-change` entry
- **AND** its primary `source` points to the main worktree A
- **AND** its membership list contains both A and B

#### Scenario: Diverging same-slug change stays separate

- **WHEN** worktree A and worktree B each have an active change `add-foo` whose content differs between them
- **THEN** the aggregated active list contains two separate `add-foo` entries, each distinguished by its `source`

## ADDED Requirements

### Requirement: Aggregated active change ordering with modification-time fallback

The aggregated active change list SHALL be ordered by recency: primarily by git first-commit timestamp descending, and when a change has no git timestamp (for example a change newly created inside a worktree and not yet committed), it SHALL fall back to the change directory's filesystem modification time (newest first) rather than sorting as an empty key. This ensures that a recently edited or not-yet-committed worktree-local change floats toward the top with its peers instead of sinking to the bottom of the list as a detached cluster. This ordering aligns with the artifact modification-time ordering used within a change.

#### Scenario: Un-timestamped worktree change floats up by mtime

- **WHEN** the aggregated active list contains a committed change from two days ago and a not-yet-committed worktree-local change edited one minute ago
- **THEN** the not-yet-committed change (having no git timestamp) is ordered by its filesystem modification time
- **AND** it appears above the two-day-old committed change

#### Scenario: Committed changes still order by git timestamp

- **WHEN** all aggregated active changes have git timestamps
- **THEN** they are ordered by git first-commit timestamp descending, unchanged from prior behavior

### Requirement: Normalized worktree path identity

All comparisons of worktree paths — identifying the main worktree, excluding the current worktree when attaching additional watchers, and resolving a `wt` key to a worktree — SHALL use normalized paths (resolved absolute path with consistent separators) and SHALL be case-insensitive on case-insensitive platforms (Windows, macOS). The main worktree SHALL be identified structurally (the first entry of `git worktree list --porcelain`, exposed as `isMain`) and SHALL NEVER be inferred from a branch name such as `main` or `master`.

#### Scenario: Drive-letter case difference does not misidentify the main worktree

- **WHEN** `git worktree list --porcelain` reports the main worktree path with a different drive-letter or separator case than the path supplied by the caller (for example `c:/repo` versus `C:\repo`)
- **THEN** the two paths SHALL compare as equal and the worktree SHALL be recognized as the main worktree

#### Scenario: Main worktree identified regardless of branch name

- **WHEN** the repository's main worktree is checked out on a branch named `develop` (not `main` or `master`)
- **THEN** that worktree SHALL still be flagged `isMain: true` and treated as the main worktree
