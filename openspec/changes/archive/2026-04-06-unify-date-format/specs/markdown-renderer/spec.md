## MODIFIED Requirements

### Requirement: Timestamp display format
All timestamps displayed in the UI SHALL use YYYY-MM-DD absolute date format consistently across all pages.

#### Scenario: Dashboard active changes
- **WHEN** the Dashboard displays an active change with a git timestamp
- **THEN** the timestamp is shown in YYYY-MM-DD format

#### Scenario: Dashboard archived changes
- **WHEN** the Dashboard displays an archived change with a git timestamp
- **THEN** the timestamp is shown in YYYY-MM-DD format

#### Scenario: ChangeList timestamps
- **WHEN** the ChangeList displays changes with git timestamps
- **THEN** all timestamps are shown in YYYY-MM-DD format

#### Scenario: SpecDetail history timestamps
- **WHEN** the SpecDetail page displays revision history entries
- **THEN** all timestamps are shown in YYYY-MM-DD format

#### Scenario: Fallback when no git timestamp
- **WHEN** a change or spec has no git timestamp but has a date field
- **THEN** the date field (already YYYY-MM-DD) is displayed as-is
