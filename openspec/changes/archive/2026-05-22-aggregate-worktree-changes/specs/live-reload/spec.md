## MODIFIED Requirements

### Requirement: File change detection for Web version

The Web server SHALL monitor OpenSpec content for file changes using `chokidar` and push notifications to connected clients via Server-Sent Events (SSE). When worktree aggregation is active for a connection, the server SHALL monitor the `openspec/` directory of every aggregated worktree, so that changes made in any worktree (for example by a parallel agent) refresh the aggregated view.

#### Scenario: SSE endpoint connection

- **WHEN** a client connects to `GET /api/openspec/watch?dir=<repoPath>`
- **THEN** the server opens an SSE stream and begins monitoring `<repoPath>/openspec/` for `.md` and `.yaml` file changes

#### Scenario: File change notification

- **WHEN** a `.md` or `.yaml` file inside a monitored `openspec/` directory is created, modified, or deleted
- **THEN** the server sends an SSE event `data: {"type":"changed"}` to all connected clients for that directory, debounced at 500ms

#### Scenario: Watch all worktrees under aggregation

- **WHEN** a client connects with aggregation active and the repository has multiple worktrees
- **THEN** the server monitors the `openspec/` directory of every worktree
- **AND** a `.md` or `.yaml` change in any of those worktrees triggers a `data: {"type":"changed"}` event

#### Scenario: Client disconnect cleanup

- **WHEN** a client disconnects from the SSE endpoint
- **THEN** the server removes the client from the notification list and cleans up the watcher(s) if no other clients are connected for that directory

#### Scenario: Shared watcher per directory

- **WHEN** multiple clients connect to the same `dir` parameter
- **THEN** the server SHALL reuse the same chokidar watcher instance(s) for that directory

### Requirement: File change detection for VS Code version

The VS Code extension SHALL monitor OpenSpec content for file changes and notify the webview. When worktree aggregation is active, the extension SHALL also monitor the `openspec/` directory of every other worktree of the same repository, not only the workspace folder.

#### Scenario: FileSystemWatcher setup

- **WHEN** the spek Webview Panel is created
- **THEN** the extension host creates a `vscode.workspace.createFileSystemWatcher` for `openspec/**` to detect all changes including directory moves

#### Scenario: Watch other worktrees under aggregation

- **WHEN** worktree aggregation is active and the repository has worktrees outside the current workspace folder
- **THEN** the extension host creates a file system watcher for the `openspec/` directory of each such worktree

#### Scenario: File change notification to webview

- **WHEN** a file or directory matching any active watcher pattern is created, modified, deleted, or moved
- **THEN** the extension host sends `{ type: "fileChanged" }` to the webview via `postMessage`, debounced at 500ms

#### Scenario: Watcher cleanup

- **WHEN** the spek Webview Panel is disposed
- **THEN** all file system watchers SHALL be disposed along with other panel resources
