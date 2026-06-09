import * as vscode from "vscode";
import { PreviewController } from "./preview/PreviewController";

export function activate(context: vscode.ExtensionContext): void {
  const openPreviewCommand = vscode.commands.registerCommand(
    "wgslPreview.openPreview",
    () => {
      PreviewController.createOrShow(context);
    },
  );

  context.subscriptions.push(openPreviewCommand);
}

export function deactivate(): void {
  // no-op for now
}
