## MODIFIED Requirements

### Requirement: Specs TreeView
The sidebar SHALL display a TreeView listing all specs from the OpenSpec repository. Each spec item SHALL display the spec topic name and SHALL be expandable to reveal that spec's `h2` and `h3` headings as child nodes. Spec items SHALL be sorted alphabetically. Each heading child node SHALL display the heading text (without the leading `## ` / `### ` markers) and SHALL be visually distinguishable between `h2` and `h3` levels (for example by indentation, icon, or `description`).

#### Scenario: Display specs list
- **WHEN** the user opens the spek sidebar
- **THEN** a "SPECS" section displays all spec topics sorted alphabetically, each rendered as an expandable (collapsed by default) tree item

#### Scenario: Expand spec to view headings
- **WHEN** the user expands a spec item
- **THEN** the spec's `h2` and `h3` headings are loaded and displayed as child tree items in document order

#### Scenario: Spec with no headings
- **WHEN** the user expands a spec item whose content has no `h2` or `h3` headings
- **THEN** the tree item shows no children (or an empty children list) and remains expandable without error

#### Scenario: h2 vs h3 visually distinguished
- **WHEN** a spec contains both `h2` and `h3` headings
- **THEN** the rendered child items make the level difference visually apparent (e.g., `h3` items are indented or marked differently from `h2` items)

#### Scenario: Empty specs
- **WHEN** the workspace has an openspec directory with no specs
- **THEN** the SPECS section displays a welcome message indicating no specs found

### Requirement: TreeView item navigation
When the user clicks a TreeView item, the extension SHALL open the spek Webview Panel and navigate to the corresponding page. Clicking a spec heading child item SHALL navigate to the spec page with a URL hash matching the heading's slug, and the webview SHALL scroll to the corresponding heading. If the Webview Panel is not yet open, the extension SHALL queue the navigation request and deliver it after the webview completes its ready handshake.

#### Scenario: Click spec item
- **WHEN** the user clicks a spec item with topic "user-auth"
- **THEN** the extension opens the spek webview panel and navigates to `/specs/user-auth`

#### Scenario: Click heading child item
- **WHEN** the user clicks a heading child item under spec "user-auth" whose slug is "requirement-login"
- **THEN** the extension opens the spek webview panel and navigates to `/specs/user-auth#requirement-login`, and the webview scrolls to that heading

#### Scenario: Click change item
- **WHEN** the user clicks a change item with slug "add-login"
- **THEN** the extension opens the spek webview panel and navigates to `/changes/add-login`

#### Scenario: Panel already open
- **WHEN** the webview panel is already open and the user clicks a TreeView item
- **THEN** the panel is revealed and navigated to the corresponding page (with hash if applicable) without creating a new panel

#### Scenario: Panel not yet open - first click navigates correctly
- **WHEN** the webview panel is not open and the user clicks a TreeView item
- **THEN** the extension creates the panel, waits for the webview ready handshake, and navigates to the corresponding page (preserving any hash) in a single click

### Requirement: TreeView refresh on file changes
The TreeView SHALL automatically refresh when files under the `openspec/` directory are created, modified, or deleted. The refresh SHALL also invalidate any cached spec content used to populate heading child nodes, so that subsequent expansions reflect the latest content.

#### Scenario: New spec added
- **WHEN** a new spec file is created under `openspec/specs/`
- **THEN** the Specs TreeView refreshes to include the new spec item

#### Scenario: Change deleted
- **WHEN** a change directory is deleted under `openspec/changes/`
- **THEN** the Changes TreeView refreshes to remove the deleted change item

#### Scenario: Spec content modified
- **WHEN** a `spec.md` file is modified under `openspec/specs/`
- **THEN** the Specs TreeView refreshes such that the next expansion of that spec re-reads the file and shows the updated heading list
