export type ExtensionToWebviewMessage =
  | {
      type: "shader:update";
      uri: string;
      language_id: string;
      version: number;
      source: string;
    }
  | {
      type: "preview:clear";
      reason: "no_active_editor" | "active_editor_not_wgsl";
    };

export type WebviewToExtensionMessage = {
  type: "ready";
};
