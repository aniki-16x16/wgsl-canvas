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

export type CompileErrorItem = {
  line: number;
  column: number;
  length: number;
  message: string;
};

export type WebviewToExtensionMessage =
  | {
      type: "ready";
    }
  | {
      type: "compile:ok";
      uri: string;
      version: number;
    }
  | {
      type: "compile:error";
      uri: string;
      version: number;
      error: string;
      diagnostics: CompileErrorItem[];
    };
