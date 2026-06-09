import * as vscode from "vscode";

export class EditorTracker implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    on_active_editor_change: (editor: vscode.TextEditor | undefined) => void,
    on_text_document_change: (document: vscode.TextDocument) => void,
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        on_active_editor_change(editor);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        on_text_document_change(event.document);
      }),
    );
  }

  public get_active_editor(): vscode.TextEditor | undefined {
    return vscode.window.activeTextEditor;
  }

  public dispose(): void {
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
