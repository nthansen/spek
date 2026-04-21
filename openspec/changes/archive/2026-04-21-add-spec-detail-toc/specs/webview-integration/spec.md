## ADDED Requirements

### Requirement: Navigation with hash fragment
The webview navigation channel SHALL support route paths that include a URL hash fragment. When the extension host sends a navigate message whose path contains a hash (e.g., `/specs/foo#requirement-bar`), the React application SHALL update its router location to that full path, and the webview SHALL scroll to the target heading once the destination page finishes rendering.

#### Scenario: Navigate with hash from TreeView
- **WHEN** the extension host sends a navigate message with path `/specs/foo#requirement-bar`
- **THEN** the React app routes to `/specs/foo`, applies the hash `requirement-bar`, and scrolls to the heading whose id equals `requirement-bar` after the markdown content renders

#### Scenario: Navigate without hash
- **WHEN** the extension host sends a navigate message with path `/specs/foo` (no hash)
- **THEN** the React app routes to `/specs/foo` with no hash and the page renders at its default scroll position

#### Scenario: Hash with no matching heading in webview
- **WHEN** a navigate message includes a hash that does not match any heading id on the destination page
- **THEN** the page renders at its default scroll position and no error is raised
