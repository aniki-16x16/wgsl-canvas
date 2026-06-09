import * as fs from "fs";
import * as vscode from "vscode";
import {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "../common/protocol";
import { EditorTracker } from "./EditorTracker";
import { UpdateScheduler } from "./UpdateScheduler";

const WGSL_DEBOUNCE_MS = 500;

export class PreviewController {
  public static readonly viewType = "wgslPreview.panel";

  private static currentPanel: PreviewController | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly editorTracker: EditorTracker;
  private readonly updateScheduler: UpdateScheduler;
  private isWebviewReady = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.updateScheduler = new UpdateScheduler(WGSL_DEBOUNCE_MS);
    this.editorTracker = new EditorTracker(
      (editor) => this.onActiveEditorChange(editor),
      (document) => this.onTextDocumentChange(document),
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => this.onWebviewMessage(message),
      null,
      this.disposables,
    );
    this.disposables.push(this.editorTracker, this.updateScheduler);

    this.render();
  }

  public static createOrShow(context: vscode.ExtensionContext): void {
    if (PreviewController.currentPanel) {
      PreviewController.currentPanel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PreviewController.viewType,
      "WGSL Preview",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
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

  public reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Beside);
    this.pushActiveDocumentState();
  }

  private render(): void {
    this.panel.webview.html = this.getHtml(this.panel.webview);
  }

  private getHtml(webview: vscode.Webview): string {
    const htmlFile = vscode.Uri.joinPath(
      this.extensionUri,
      "media",
      "preview",
      "index.html",
    );
    const scriptUri = webview
      .asWebviewUri(
        vscode.Uri.joinPath(this.extensionUri, "media", "preview", "main.js"),
      )
      .toString();

    return fs
      .readFileSync(htmlFile.fsPath, "utf8")
      .replace(/__CSP_SOURCE__/g, webview.cspSource)
      .replace(/__SCRIPT_URI__/g, scriptUri);
  }

  private onWebviewMessage(message: WebviewToExtensionMessage): void {
    if (message.type !== "ready") {
      return;
    }

    this.isWebviewReady = true;
    this.pushActiveDocumentState();
  }

  private onActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      this.postMessage({
        type: "preview:clear",
        reason: "no_active_editor",
      });
      return;
    }

    if (!this.isWgslDocument(editor.document)) {
      this.postMessage({
        type: "preview:clear",
        reason: "active_editor_not_wgsl",
      });
      return;
    }

    this.postShaderUpdate(editor.document);
  }

  private onTextDocumentChange(document: vscode.TextDocument): void {
    const activeEditor = this.editorTracker.get_active_editor();
    if (!activeEditor) {
      return;
    }

    if (activeEditor.document.uri.toString() !== document.uri.toString()) {
      return;
    }

    if (!this.isWgslDocument(document)) {
      return;
    }

    this.updateScheduler.schedule(() => {
      this.postShaderUpdate(document);
    });
  }

  private pushActiveDocumentState(): void {
    this.onActiveEditorChange(this.editorTracker.get_active_editor());
  }

  private postShaderUpdate(document: vscode.TextDocument): void {
    this.postMessage({
      type: "shader:update",
      uri: document.uri.toString(),
      language_id: document.languageId,
      version: document.version,
      source: document.getText(),
    });
  }

  private postMessage(message: ExtensionToWebviewMessage): void {
    if (!this.isWebviewReady) {
      return;
    }

    void this.panel.webview.postMessage(message);
  }

  private isWgslDocument(document: vscode.TextDocument): boolean {
    const languageId = document.languageId.toLowerCase();
    const fileName = document.fileName.toLowerCase();
    return languageId === "wgsl" || fileName.endsWith(".wgsl");
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
