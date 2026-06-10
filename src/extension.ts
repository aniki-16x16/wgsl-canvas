import * as vscode from "vscode";
import { PreviewController } from "./preview/PreviewController";

export function activate(context: vscode.ExtensionContext): void {
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("wgsl-canvas");

  const openPreviewCommand = vscode.commands.registerCommand(
    "wgslCanvas.openPreview",
    () => {
      PreviewController.createOrShow(context, diagnosticCollection);
    },
  );

  context.subscriptions.push(diagnosticCollection, openPreviewCommand);
}

export function deactivate(): void {
  // no-op for now
}
