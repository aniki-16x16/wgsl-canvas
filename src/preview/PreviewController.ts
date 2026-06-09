import * as fs from "fs";
import * as vscode from "vscode";

export class PreviewController {
  public static readonly viewType = "wgslPreview.panel";

  private static currentPanel: PreviewController | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.render();
  }

  public static createOrShow(context: vscode.ExtensionContext): void {
    if (PreviewController.currentPanel) {
      PreviewController.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PreviewController.viewType,
      "WGSL Preview",
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "media"),
        ],
      },
    );

    PreviewController.currentPanel = new PreviewController(
      panel,
      context.extensionUri,
    );
  }

  private render(): void {
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const htmlFile = vscode.Uri.joinPath(
      this.extensionUri,
      "media",
      "preview",
      "index.html",
    );
    return fs.readFileSync(htmlFile.fsPath, "utf8");
  }

  public dispose(): void {
    PreviewController.currentPanel = undefined;

    while (this.disposables.length > 0) {
      const item = this.disposables.pop();
      if (item) {
        item.dispose();
      }
    }
  }
}
