const vscode = acquireVsCodeApi();

const statusTextElement = document.getElementById("status-text");
const detailTextElement = document.getElementById("detail-text");
const sourcePreviewElement = document.getElementById("source-preview");

const setStatus = (statusText, detailText) => {
  statusTextElement.textContent = statusText;
  detailTextElement.textContent = detailText;
};

const setSourcePreview = (source) => {
  const preview = source.length > 400 ? `${source.slice(0, 400)}\n...` : source;
  sourcePreviewElement.textContent = preview;
};

window.addEventListener("message", (event) => {
  const message = event.data;

  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "preview:clear") {
    setStatus(
      "当前未预览 WGSL",
      "请切换到 .wgsl 文件，预览会自动刷新（500ms 防抖）。",
    );
    setSourcePreview("// waiting for active WGSL document...");
    return;
  }

  if (message.type === "shader:update") {
    setStatus(
      "WGSL 文档已跟踪",
      `语言: ${message.language_id} | version: ${message.version}`,
    );
    setSourcePreview(message.source);
  }
});

vscode.postMessage({ type: "ready" });
