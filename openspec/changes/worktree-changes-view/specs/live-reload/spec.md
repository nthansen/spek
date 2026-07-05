## MODIFIED Requirements

### Requirement: File change detection for Web version

The Web server SHALL monitor OpenSpec content for file changes using `chokidar` and push notifications to connected clients via Server-Sent Events (SSE). The server SHALL monitor the `openspec/` directory of **every** worktree of the repository (discovered via `listWorktrees`), independent of any client-side filtering or aggregation preference, so that changes made in any worktree (for example by a parallel agent) refresh the view. Each change notification SHALL identify **which** worktree the changed file belongs to, by including that worktree's `key`, so the client can attribute activity to a specific worktree.

#### Scenario: SSE endpoint connection

- **WHEN** a client connects to `GET /api/openspec/watch?dir=<repoPath>`
- **THEN** the server opens an SSE stream and begins monitoring the `openspec/` directory of every worktree of that repository for `.md` and `.yaml` file changes

#### Scenario: File change notification carries worktree identity

- **WHEN** a `.md` or `.yaml` file inside a monitored worktree's `openspec/` directory is created, modified, or deleted
- **THEN** the server sends an SSE event `data: {"type":"changed","worktree":"<key>"}` to all connected clients, debounced at 500ms, where `<key>` is the `WorktreeSource.key` of the worktree whose file changed

#### Scenario: Change in any worktree refreshes

- **WHEN** the repository has multiple worktrees and a `.md` or `.yaml` file changes in any of them
- **THEN** the server sends a `changed` event identifying that worktree, regardless of which worktrees the client is currently showing

#### Scenario: Client disconnect cleanup

- **WHEN** a client disconnects from the SSE endpoint
- **THEN** the server removes the client from the notification list and cleans up the watcher(s) if no other clients are connected for that repository

#### Scenario: Shared watcher per repository

- **WHEN** multiple clients connect for the same repository
- **THEN** the server SHALL reuse the same chokidar watcher instance(s) covering that repository's worktrees

### Requirement: File change detection for VS Code version

The VS Code extension SHALL monitor OpenSpec content for file changes and notify the webview. Monitoring SHALL reliably detect files that are created or modified inside directories which were themselves newly created (for example a change's `specs/<topic>/` delta-spec directory), even when the directory and its contents are created in the same rapid write burst. The extension SHALL monitor the `openspec/` directory of every worktree of the same repository, not only the workspace folder, using normalized case-insensitive path comparison so the main worktree is neither missed nor double-watched. The set of watched worktrees SHALL be re-evaluated when the content is rescanned, so that a worktree created after the panel opened becomes watched and a worktree removed (for example pruned after a merge) is dropped. Each notification to the webview SHALL identify which worktree changed.

#### Scenario: Watcher setup

- **WHEN** the spek Webview Panel is created
- **THEN** the extension host starts a recursive `chokidar` watcher on the workspace folder's `openspec/` directory and on each other worktree's `openspec/` directory

#### Scenario: Detect files in newly created nested directories

- **WHEN** a delta-spec file is created at `openspec/changes/<slug>/specs/<topic>/spec.md` and its parent directories `specs/` and `specs/<topic>/` did not previously exist
- **THEN** the watcher detects the new `spec.md` and triggers a webview notification
- **AND** subsequent modifications to that `spec.md` are also detected and trigger a notification

#### Scenario: Newly created worktree becomes watched

- **WHEN** a new linked worktree is created after the panel is already open, and the content is rescanned
- **THEN** the extension SHALL start watching that new worktree's `openspec/` directory
- **AND** a change in it triggers a webview notification

#### Scenario: Pruned worktree stops being watched

- **WHEN** a linked worktree is removed (for example pruned after its branch merged) and the content is rescanned
- **THEN** the extension SHALL close and drop the watcher for that worktree

#### Scenario: Main worktree not double-watched due to path case

- **WHEN** `git worktree list --porcelain` reports the main worktree path with a different case or separator than the workspace folder path
- **THEN** normalized comparison recognizes it as the workspace folder and does not attach a duplicate watcher

#### Scenario: File change notification to webview carries worktree identity

- **WHEN** a `.md` or `.yaml` file, or a directory, inside a monitored `openspec/` directory is created, modified, or deleted
- **THEN** the extension host sends `{ type: "fileChanged", worktree: "<key>" }` to the webview via `postMessage`, debounced at 500ms

#### Scenario: Watcher cleanup

- **WHEN** the spek Webview Panel is disposed
- **THEN** all file watchers SHALL be closed along with other panel resources

### Requirement: useFileWatcher hook

The frontend SHALL provide a `useFileWatcher` hook that connects to the appropriate file change event source based on the runtime environment. The hook SHALL maintain a single stable connection whose lifecycle does NOT depend on the worktree filter or aggregation preference (worktree selection is applied client-side after data is fetched, not by reconnecting the watcher). When an event carries a worktree identity, the hook SHALL surface that identity alongside the refresh signal so the UI can attribute live activity to a specific worktree.

#### Scenario: Web environment with SSE

- **WHEN** `useFileWatcher` is active in the Web environment
- **THEN** it opens an `EventSource` connection to `/api/openspec/watch?dir=<repoPath>` and, on each received event, calls `refresh()` and surfaces the event's `worktree` key when present

#### Scenario: VS Code environment with postMessage

- **WHEN** `useFileWatcher` is active in the VS Code webview environment
- **THEN** it listens for `message` events with `type === "fileChanged"` and, on each received event, calls `refresh()` and surfaces the event's `worktree` key when present

#### Scenario: Connection stable across filter changes

- **WHEN** the user changes which worktrees are shown (the worktree filter) or the aggregation preference
- **THEN** the existing watcher connection SHALL NOT be torn down or reconnected, and live updates from every worktree SHALL continue to arrive

#### Scenario: Demo environment no-op

- **WHEN** `useFileWatcher` is active in the Demo environment
- **THEN** it does nothing (no event source to connect to)

#### Scenario: Cleanup on unmount

- **WHEN** the component using `useFileWatcher` unmounts
- **THEN** the EventSource connection or message listener SHALL be cleaned up
