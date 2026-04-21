## ADDED Requirements

### Requirement: Auto-restore most recent repo on reload
On page load in the web application, if no repo has been selected yet in the current session, the system SHALL initialize the active repo path to the most recent entry from localStorage so that reloads and direct URL visits (e.g., `/specs/foo#bar`) stay on the requested page instead of redirecting back to the repo-selection screen.

#### Scenario: Reload on a spec detail page
- **WHEN** the user reloads the browser while on a spec detail URL and at least one recent path exists in localStorage
- **THEN** RepoContext initialises with the most recent path and the page continues to render without redirecting to `/`

#### Scenario: Direct visit to a URL with hash anchor
- **WHEN** the user opens a URL such as `/specs/foo#requirement-bar` directly in a new tab and at least one recent path exists in localStorage
- **THEN** RepoContext initialises with the most recent path, the spec detail page loads, and the hash anchor scrolls to the target heading

#### Scenario: No recent paths available
- **WHEN** the user opens any in-app URL and localStorage contains no recent paths
- **THEN** RepoContext remains empty and the user is redirected to the repo-selection page as before
