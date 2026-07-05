import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { MessageHandler } from "./handler";
import { watchOpenspecDir } from "./watcher";
import { listWorktrees, normalizeWorktreePath } from "@spek/core";

export class SpekPanel {
  private static instance: SpekPanel | undefined;
  private panel: vscode.WebviewPanel;
  private handler: MessageHandler;
  private disposables: vscode.Disposable[] = [];
  private webviewReady = false;
  private pendingMessages: unknown[] = [];
  private disposed = false;
  private fileChangeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly workspacePath: string;
  // 每個被監看的 worktree openspec 根（正規化路徑）→ watcher 與其 worktree key
  private watchedRoots = new Map<string, { key: string | null; disposable: vscode.Disposable }>();
  // 本 debounce 視窗內最後一個變動的 worktree key，附在通知上供前端標活動
  private lastWorktree: string | null = null;

  private constructor(
    private readonly context: vscode.ExtensionContext,
  ) {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    this.workspacePath = workspacePath;

    this.panel = vscode.window.createWebviewPanel(
      "spek",
      "spek",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "webview"),
        ],
      },
    );

    // Tab icon
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "webview", "favicon.svg");

    this.handler = new MessageHandler(workspacePath);

    // 設定 Webview HTML
    this.panel.webview.html = this.getHtml();

    // 處理來自 Webview 的訊息
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.type === "ready") {
          // Webview ready，發送 init 訊息
          this.panel.webview.postMessage({
            type: "init",
            workspacePath,
            theme: this.getCurrentTheme(),
          });
          // 標記 ready，flush 等待中的訊息
          this.webviewReady = true;
          for (const pending of this.pendingMessages) {
            this.panel.webview.postMessage(pending);
          }
          this.pendingMessages = [];
          return;
        }

        if (message.type === "request") {
          try {
            const data = await this.handler.handle(message.method, message.params);
            this.panel.webview.postMessage({
              type: "response",
              id: message.id,
              data,
            });
          } catch (err) {
            this.panel.webview.postMessage({
              type: "response",
              id: message.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      },
      null,
      this.disposables,
    );

    // 監聯 theme 變更
    vscode.window.onDidChangeActiveColorTheme(
      (theme) => {
        this.panel.webview.postMessage({
          type: "themeChange",
          theme: theme.kind === vscode.ColorThemeKind.Light ? "light" : "dark",
        });
      },
      null,
      this.disposables,
    );

    // 監聽 openspec 檔案變更，通知 webview 刷新。一律監看 repo 的所有 worktree openspec/，
    // 任一 worktree 變更都會刷新並附上來源 worktree key。
    void this.syncWorktreeWatchers();

    // panel 重新可見時重新評估 worktree 集合，涵蓋開啟後才新增 / 移除的 worktree
    this.panel.onDidChangeViewState(
      () => {
        if (this.panel.visible) void this.syncWorktreeWatchers();
      },
      null,
      this.disposables,
    );

    // Panel 關閉時清理
    this.panel.onDidDispose(
      () => {
        SpekPanel.instance = undefined;
        this.disposed = true;
        this.webviewReady = false;
        this.pendingMessages = [];
        for (const { disposable } of this.watchedRoots.values()) disposable.dispose();
        this.watchedRoots.clear();
        this.disposables.forEach((d) => d.dispose());
        this.disposables = [];
      },
      null,
      this.disposables,
    );
  }

  /**
   * 重新評估要監看的 worktree 集合：為每個現存 worktree 的 openspec/ 建立監看（若尚未有），
   * 並關閉已消失（例如合併後被 prune）worktree 的監看。用正規化路徑比對，避免主 worktree
   * 因大小寫 / 分隔線差異而漏監看或重複監看。非 git repo 時退回只監看 workspace 資料夾。
   */
  private async syncWorktreeWatchers(): Promise<void> {
    if (this.disposed) return;
    const worktrees = (await listWorktrees(this.workspacePath)).filter((w) => !w.isBare);
    if (this.disposed) return;

    const desired = worktrees.length
      ? worktrees.map((w) => ({ path: w.path, key: w.key }))
      : [{ path: this.workspacePath, key: null }];
    const desiredByNorm = new Map(desired.map((d) => [normalizeWorktreePath(d.path), d]));

    // 新增缺少的
    for (const [norm, d] of desiredByNorm) {
      if (this.watchedRoots.has(norm)) continue;
      const disposable = watchOpenspecDir(d.path, () => this.notifyFileChange(d.key));
      this.watchedRoots.set(norm, { key: d.key, disposable });
    }
    // 移除已消失的
    for (const [norm, entry] of this.watchedRoots) {
      if (!desiredByNorm.has(norm)) {
        entry.disposable.dispose();
        this.watchedRoots.delete(norm);
      }
    }
  }

  private notifyFileChange(worktreeKey?: string | null): void {
    if (worktreeKey) this.lastWorktree = worktreeKey;
    if (this.fileChangeTimer) clearTimeout(this.fileChangeTimer);
    this.fileChangeTimer = setTimeout(() => {
      const worktree = this.lastWorktree ?? undefined;
      this.lastWorktree = null;
      this.panel.webview.postMessage({ type: "fileChanged", worktree });
      // 借變動時機重新評估 worktree 集合，涵蓋新建 / 移除的 worktree
      void this.syncWorktreeWatchers();
    }, 500);
  }

  static createOrShow(context: vscode.ExtensionContext): SpekPanel {
    if (SpekPanel.instance) {
      SpekPanel.instance.panel.reveal();
      return SpekPanel.instance;
    }
    SpekPanel.instance = new SpekPanel(context);
    return SpekPanel.instance;
  }

  static dispose() {
    SpekPanel.instance?.panel.dispose();
    SpekPanel.instance = undefined;
  }

  postMessage(message: unknown) {
    if (this.webviewReady) {
      this.panel.webview.postMessage(message);
    } else {
      this.pendingMessages.push(message);
    }
  }

  navigateTo(routePath: string) {
    this.panel.reveal();
    const msg = { type: "navigate", path: routePath };
    if (this.webviewReady) {
      this.panel.webview.postMessage(msg);
    } else {
      this.pendingMessages.push(msg);
    }
  }

  private getCurrentTheme(): "dark" | "light" {
    return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light
      ? "light"
      : "dark";
  }

  private getHtml(): string {
    const webviewDir = vscode.Uri.joinPath(this.context.extensionUri, "webview");
    const indexPath = path.join(webviewDir.fsPath, "index.webview.html");

    if (!fs.existsSync(indexPath)) {
      return `<!DOCTYPE html><html><body><h1>spek webview assets not found</h1><p>Run build first.</p></body></html>`;
    }

    const html = fs.readFileSync(indexPath, "utf-8");
    const nonce = getNonce();
    const webview = this.panel.webview;
    const cspSource = webview.cspSource;

    // 將 /assets/... 路徑轉為 webview URI
    const assetsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewDir, "assets"),
    );

    // CSP：允許 nonce script + 外部 style + unsafe-inline style（Tailwind 需要）
    const csp = [
      `default-src 'none'`,
      `style-src ${cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${cspSource}`,
      `img-src ${cspSource} data:`,
    ].join("; ");

    // 組裝最終 HTML（CSS 由 Vite IIFE build inline 到 JS 中，以 <style> 注入）
    const finalHtml = `<!DOCTYPE html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>spek</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${assetsUri}/index.webview.js"></script>
  </body>
</html>`;

    return finalHtml;
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
