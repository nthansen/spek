## ADDED Requirements

### Requirement: Badge generation input
The GitHub Action SHALL accept a `generate-badges` boolean input to enable badge generation.

#### Scenario: Badges enabled
- **WHEN** a workflow specifies `generate-badges: true`
- **THEN** the action generates SVG badge files in addition to the static HTML site

#### Scenario: Badges disabled by default
- **WHEN** a workflow uses the action without specifying `generate-badges`
- **THEN** no badge files are generated

### Requirement: Badges path output
The GitHub Action SHALL expose a `badges-path` output containing the path to the generated badge directory.

#### Scenario: Badges path available after build
- **WHEN** `generate-badges` is `true` and the build completes successfully
- **THEN** subsequent workflow steps can reference the badges directory via `steps.<id>.outputs.badges-path`
