## 1. Selection helper (pure, tested)

- [ ] 1.1 Add a pure `resolveActiveArtifactId({ follow, tabParam, rawArtifacts, sortedArtifacts })` helper in `packages/web/src/utils/` — returns `rawArtifacts[0].id` when `follow`, else `sortedArtifacts.find(id===tabParam)?.id ?? sortedArtifacts[0]?.id ?? ""`
- [ ] 1.2 Unit tests (`*.test.ts`): follow-on returns newest even when `tabParam`/sort order differ; follow-off returns `tabParam` when present else first; reload changing `rawArtifacts[0]` moves result only while follow-on; empty artifacts → `""`
- [ ] 1.3 Mutation-test the helper to the repo's ~91% bar (as with `artifact-sort`); strengthen tests to kill survivors

## 2. Follow control in ChangeDetail

- [ ] 2.1 Add `const [follow, setFollow] = useState(false)` (ephemeral); reset implicitly on unmount / `slug` change
- [ ] 2.2 Replace the inline `activeArtifact = artifacts.find(...) ?? artifacts[0]` with `activeTab = resolveActiveArtifactId({ follow, tabParam, rawArtifacts, sortedArtifacts })`
- [ ] 2.3 Render a "Follow latest" toggle (tail/pin icon + label, `aria-pressed`, accent when armed) next to the sort control, gated on `data.status === "active" && artifacts.length >= 2`
- [ ] 2.4 In `handleTabChange`, call `setFollow(false)` before setting `?tab=` (manual click disarms)
- [ ] 2.5 Enabling Follow selects the newest immediately (verify via the derived value — no effect needed)

## 3. Verify across surfaces

- [ ] 3.1 `npm run test -w @spek/web`, `npm run type-check`, `npm run build:web` — all green
- [ ] 3.2 Rebuild bundled artifacts so all surfaces carry the toggle: `npm run build:webview` (VS Code) and `npm run build:demo` (demo) — confirm the built `index.webview.js` / `docs/demo.html` contain the Follow control
- [ ] 3.3 Manual check (ideally in a devcontainer where polling live-reload is active): enable Follow, create/modify an artifact file, confirm selection jumps to it; click a tab and confirm Follow disarms; confirm the control is absent on archived / single-artifact changes

## 4. Archive

- [ ] 4.1 `/opsx:verify` then `/opsx:archive` (sync the `change-browsing` delta into the main spec via the skill path, not `openspec archive` CLI), and update CLAUDE.md if the change-detail behaviour description needs it
