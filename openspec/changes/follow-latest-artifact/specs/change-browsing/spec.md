## ADDED Requirements

### Requirement: Follow-latest artifact selection

The change-detail view SHALL provide an opt-in "Follow latest" control, shown only for active changes that have at least two artifacts, and off by default. When enabled, the active tab SHALL track the most-recently-modified artifact — the newest by filesystem modification time, i.e. the first entry of the recency-ordered `artifacts` payload — and SHALL move to the new newest each time the change's data is refreshed by live-reload, independent of the user's selected tab sort order (Last modified / Schema order / A–Z). Enabling the control SHALL immediately select the current newest artifact. A manual tab selection SHALL disable the control ("disarm"). The control's state SHALL be ephemeral: it SHALL be off whenever a change detail is opened and SHALL NOT persist across changes or navigation.

#### Scenario: Enabling Follow selects the newest artifact
- **WHEN** the user enables "Follow latest" on an active change with two or more artifacts
- **THEN** the active tab immediately switches to the artifact with the newest modification time

#### Scenario: A new edit moves the selection while Follow is on
- **WHEN** "Follow latest" is on and a live-reload delivers updated data in which a different artifact is now the newest-modified
- **THEN** the active tab switches to that artifact
- **AND** this happens regardless of the current tab sort order

#### Scenario: Manual selection disarms Follow
- **WHEN** "Follow latest" is on and the user clicks a tab
- **THEN** the clicked tab becomes active
- **AND** "Follow latest" turns off, so subsequent live-reloads do not move the selection

#### Scenario: Not offered when it cannot apply
- **WHEN** a change is archived, or has fewer than two artifacts
- **THEN** the "Follow latest" control is not shown

#### Scenario: Ephemeral — off on open
- **WHEN** the user enables Follow on one change and then opens a different change
- **THEN** the newly opened change has "Follow latest" off by default
