## 1. Core heading utility

- [x] 1.1 Create `packages/core/src/headings.ts` with `slugifyHeading(text)` (lowercase, collapse non-alphanumeric runs to `-`, preserve Unicode letters, trim edges)
- [x] 1.2 Add `extractHeadings(content)` returning `{ level: 2 | 3, text, slug }[]` (h2/h3 only, skip fenced code blocks, dedupe slugs with `-2`/`-3` suffix)
- [x] 1.3 Export `extractHeadings`, `slugifyHeading`, and `Heading` type from `packages/core/src/index.ts`
- [x] 1.4 Add unit tests covering scenarios in `specs/core-module/spec.md` (basic h2/h3, skip h1/h4, code-block ignore, duplicate suffix, Unicode, empty)
- [x] 1.5 Run `npm run build -w @spek/core` and `npm run type-check` to verify

## 2. Webview TOC sidebar

- [x] 2.1 Update `packages/web/src/components/MarkdownRenderer.tsx` to assign `id` on h2/h3 via a rehype plugin (`rehypeSpekHeadingIds`) that walks the hast tree and applies `slugifyHeading` with duplicate numeric suffixing. rehype plugin form avoids React Strict Mode double-render inflating the counter.
- [x] 2.2 Create `packages/web/src/hooks/useScrollspy.ts` — scroll listener + `getBoundingClientRect()` that picks the last heading whose top has crossed the header threshold; returns the active id (IntersectionObserver proved unreliable across spek's layout).
- [x] 2.3 Create `packages/web/src/components/SpecToc.tsx` rendering a sticky `<nav>` with `h2`/`h3` entries (h3 indented), highlighting the active id from `useScrollspy`; clicking an entry calls `navigate` with the hash and scrolls via `window.scrollTo` with an 80px header offset
- [x] 2.4 Update `packages/web/src/pages/SpecDetail.tsx` layout to a responsive grid: main content + TOC right column; TOC only renders when `headings.length >= 3` and viewport ≥ 1280px (use Tailwind `xl:` breakpoint)
- [x] 2.5 In `SpecDetail.tsx`, add a `useEffect` depending on `data?.content` + `location.hash` that scrolls the element with the hash id into view via `window.scrollTo` with header offset, retrying for up to ~300ms if the element has not been rendered yet
- [x] 2.6 Verify TOC does not appear in DiffView mode (only in normal markdown view)
- [x] 2.7 Run `npm run dev` and manually test: long spec shows TOC, short spec hides it, click entry scrolls + updates hash, scrollspy highlights active, direct URL with hash scrolls correctly, narrow viewport hides TOC

## 3. VS Code sidebar TreeView headings

- [x] 3.1 Update `packages/vscode/src/tree-provider.ts` `SpecTreeItem` constructor to use `TreeItemCollapsibleState.Collapsed` and remove the `command` (clicking title still triggers default navigate via `getTreeItem` flow or keep command — confirm VS Code behavior: collapsible items with commands still fire command on click)
- [x] 3.2 Add `SpecHeadingItem extends vscode.TreeItem` class: label = heading text, icon = `symbol-string` (or similar), `description` shows level marker for h3, command = `spek.navigateTo` with `/specs/<topic>#<slug>`
- [x] 3.3 Implement `SpecsTreeProvider.getChildren(element?)`: when `element` is `SpecTreeItem`, call `readSpec(workspacePath, topic)`, run `extractHeadings(content)`, return `SpecHeadingItem[]`; preserve existing root behavior when element is undefined
- [x] 3.4 Ensure h3 items are visually distinguished from h2 (e.g., label prefix `  ` or different icon); document choice in code comment if non-obvious
- [x] 3.5 Verify existing `refresh()` on file changes correctly invalidates children — since `getChildren` reads fresh content each call, no extra cache invalidation required; add comment noting this

## 4. VS Code navigateTo with hash

- [x] 4.1 Inspect `packages/vscode/src/panel.ts` `navigateTo(routePath)` — confirm routePath is passed through `postMessage` as-is; if it strips hash, update to preserve full path + hash
- [x] 4.2 Confirm `packages/web/src/WebviewApp.tsx` MessageAdapter navigate handler uses React Router `navigate(path)` that accepts `path#hash` (MemoryRouter supports hash via location object) — may need to split path/hash and pass `{ pathname, hash }`
- [x] 4.3 Manually test in VS Code Extension Development Host: expand spec in sidebar → click heading child → webview opens to spec with hash → scrolls to heading

## 5. Cross-platform verification

- [x] 5.1 Web: `npm run dev` — test TOC, scrollspy, hash linking in Chrome
- [x] 5.2 VS Code: build extension (`npm run build -w @spek/core && npm run build:webview -w @spek/web && npm run build -w spek-vscode`), launch Extension Development Host, test TOC in webview + sidebar expand + heading click navigation

## 6. Polish and release

- [x] 6.1 Run `npm run type-check` across all packages
- [x] 6.2 Run `openspec validate add-spec-detail-toc --strict` and fix any issues
- [x] 6.3 Update root `CHANGELOG.md`, `packages/vscode/CHANGELOG.md`, `packages/intellij/CHANGELOG.md` with the new feature under next version's Unreleased section (keep three files synchronized)
- [x] 6.4 Visual polish: check TOC max-height + overflow scroll, indent amount for h3, active-entry colour contrast in both light/dark themes, hover state

## 7. Side fix: RepoContext reload persistence

- [x] 7.1 `packages/web/src/contexts/RepoContext.tsx` — initialise `repoPath` with `loadRecentPaths()[0] ?? ""` so that reloads and direct URL visits do not bounce users back to SelectRepo (required for the hash-anchor direct-link scenario)
