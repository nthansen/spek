## ADDED Requirements

### Requirement: Spec detail TOC sidebar
The spec detail page (`/specs/:topic`) SHALL display a sticky table-of-contents (TOC) sidebar listing all `h2` and `h3` headings of the spec content when the heading count is at least 3 and the viewport width is at least 1280px. Each TOC entry SHALL be a clickable link that smooth-scrolls the main content to the corresponding heading. `h3` entries SHALL be visually indented relative to `h2` entries.

#### Scenario: TOC visible for long spec
- **WHEN** user views a spec whose content contains 3 or more `h2`/`h3` headings on a viewport at least 1280px wide
- **THEN** a sticky TOC sidebar appears alongside the main content listing every `h2` and `h3` heading in document order

#### Scenario: TOC hidden for short spec
- **WHEN** user views a spec whose content contains fewer than 3 `h2`/`h3` headings
- **THEN** no TOC sidebar is rendered and the main content occupies the full available width

#### Scenario: TOC hidden on narrow viewport
- **WHEN** user views any spec on a viewport narrower than 1280px
- **THEN** the TOC sidebar is not rendered and the main content occupies the full available width

#### Scenario: Click TOC entry
- **WHEN** user clicks a TOC entry
- **THEN** the main content smooth-scrolls to the corresponding heading and the URL hash updates to that heading's slug

#### Scenario: Indented h3 entries
- **WHEN** the TOC contains both `h2` and `h3` entries
- **THEN** each `h3` entry is visually indented relative to its preceding `h2` entry

### Requirement: Spec detail scrollspy
The spec detail page SHALL highlight the TOC entry corresponding to the heading currently closest to the top of the viewport while the user scrolls (scrollspy behavior).

#### Scenario: Active entry on scroll
- **WHEN** the user scrolls the spec detail content and a heading enters the top region of the viewport
- **THEN** the TOC entry matching that heading is visually highlighted as active

#### Scenario: Only one active entry
- **WHEN** multiple headings are simultaneously visible in the viewport
- **THEN** exactly one TOC entry is highlighted as active (the heading closest to the top)

### Requirement: Spec detail hash anchor navigation
The spec detail page SHALL scroll to the heading matching the URL hash when the page mounts or when the hash changes, after the markdown content finishes rendering.

#### Scenario: Direct link with hash
- **WHEN** user opens a URL such as `/specs/foo#requirement-bar` directly
- **THEN** after the page loads and content renders, the page scrolls so the heading whose slug is `requirement-bar` is at the top of the visible area

#### Scenario: Hash change while on page
- **WHEN** the URL hash changes (e.g., user clicks a TOC entry or another in-page hash link) while already on the spec detail page
- **THEN** the page scrolls to the new target heading

#### Scenario: Hash with no matching heading
- **WHEN** the URL hash does not match any heading slug on the current spec
- **THEN** no scrolling occurs and the page renders at its default scroll position
