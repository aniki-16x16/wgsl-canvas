import * as fs from "fs";
import * as vscode from "vscode";
import {
  CompileErrorItem,
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
  private readonly diagnosticsCollection: vscode.DiagnosticCollection;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly editorTracker: EditorTracker;
  private readonly updateScheduler: UpdateScheduler;
  private isWebviewReady = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    diagnosticsCollection: vscode.DiagnosticCollection,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.diagnosticsCollection = diagnosticsCollection;
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

  public static createOrShow(
    context: vscode.ExtensionContext,
    diagnosticsCollection: vscode.DiagnosticCollection,
  ): void {
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
      diagnosticsCollection,
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
    if (message.type === "ready") {
      this.isWebviewReady = true;
      this.pushActiveDocumentState();
      return;
    }

    if (message.type === "compile:ok") {
      this.clearDiagnosticsForUri(message.uri, message.version);
      return;
    }

    if (message.type === "compile:error") {
      this.publishDiagnosticsForUri(
        message.uri,
        message.version,
        message.diagnostics,
      );
    }
  }

  private publishDiagnosticsForUri(
    uriRaw: string,
    version: number,
    compileErrors: CompileErrorItem[],
  ): void {
    const uri = vscode.Uri.parse(uriRaw);
    const openDocument = vscode.workspace.textDocuments.find(
      (item) => item.uri.toString() === uri.toString(),
    );

    if (openDocument && openDocument.version !== version) {
      return;
    }

    const diagnostics = compileErrors.map((item) => {
      const startLine = Math.max(0, item.line - 1);
      const startColumn = Math.max(0, item.column - 1);
      const endColumn = startColumn + Math.max(1, item.length);
      const range = new vscode.Range(
        startLine,
        startColumn,
        startLine,
        endColumn,
      );

      return new vscode.Diagnostic(
        range,
        item.message,
        vscode.DiagnosticSeverity.Error,
      );
    });

    this.diagnosticsCollection.set(uri, diagnostics);
  }

  private clearDiagnosticsForUri(uriRaw: string, version: number): void {
    const uri = vscode.Uri.parse(uriRaw);
    const openDocument = vscode.workspace.textDocuments.find(
      (item) => item.uri.toString() === uri.toString(),
    );

    if (openDocument && openDocument.version !== version) {
      return;
    }

    this.diagnosticsCollection.delete(uri);
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
    this.diagnosticsCollection.clear();

    while (this.disposables.length > 0) {
      const item = this.disposables.pop();
      if (item) {
        item.dispose();
      }
    }
  }
}
