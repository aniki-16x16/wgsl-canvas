const vscode = acquireVsCodeApi();

const gpuCanvasElement = document.getElementById("gpu-canvas");
const overlayElement = document.getElementById("overlay");
const statusTextElement = document.getElementById("status-text");
const detailTextElement = document.getElementById("detail-text");

const QUAD_VERTICES = new Float32Array([
  -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0,
]);

const UNIFORM_BINDING_SIZE = 16;

const setStatus = (statusText, detailText) => {
  statusTextElement.textContent = statusText;
  detailTextElement.textContent = detailText;
};

const showOverlay = (statusText, detailText) => {
  setStatus(statusText, detailText);
  overlayElement.classList.remove("hidden");
};

const hideOverlay = () => {
  overlayElement.classList.add("hidden");
};

const normalizeCompilationErrors = (messages) => {
  return messages.slice(0, 20).map((item) => {
    const line = Number.isFinite(item.lineNum) ? item.lineNum : 1;
    const column = Number.isFinite(item.linePos) ? item.linePos : 1;
    const length =
      Number.isFinite(item.length) && item.length > 0 ? item.length : 1;

    return {
      line,
      column,
      length,
      message: item.message,
    };
  });
};

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.adapter = undefined;
    this.device = undefined;
    this.context = undefined;
    this.format = undefined;
    this.vertexBuffer = undefined;
    this.timeBuffer = undefined;
    this.resolutionBuffer = undefined;
    this.mouseBuffer = undefined;
    this.bindGroupLayout = undefined;
    this.pipelineLayout = undefined;
    this.pipeline = undefined;
    this.bindGroup = undefined;
    this.startTimeMs = performance.now();
    this.frameHandle = 0;
    this.isRenderingActive = false;
    this.isReady = false;
    this.currentShaderSource = "";
    this.runtimeErrorHandler = undefined;
    this.compileGeneration = 0;
    this.mousePosition = { x: 0, y: 0 };
    this.isLeftMouseDown = 0;

    this.renderFrame = this.renderFrame.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  setRuntimeErrorHandler(handler) {
    this.runtimeErrorHandler = handler;
  }

  resetTimeBaseline() {
    this.startTimeMs = performance.now();

    if (!this.device || !this.timeBuffer) {
      return;
    }

    this.device.queue.writeBuffer(
      this.timeBuffer,
      0,
      new Float32Array([0, 0, 0, 0]),
    );
  }

  async initialize() {
    if (!navigator.gpu) {
      return false;
    }

    this.adapter = await navigator.gpu.requestAdapter();
    if (!this.adapter) {
      return false;
    }

    this.device = await this.adapter.requestDevice();
    this.device.addEventListener("uncapturederror", (event) => {
      const message = event?.error?.message || "未知 WebGPU 运行时错误";
      if (this.runtimeErrorHandler) {
        this.runtimeErrorHandler(message);
      }
    });

    this.context = this.canvas.getContext("webgpu");
    if (!this.context) {
      return false;
    }

    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
    });

    this.vertexBuffer = this.device.createBuffer({
      size: QUAD_VERTICES.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, QUAD_VERTICES);

    this.timeBuffer = this.device.createBuffer({
      size: UNIFORM_BINDING_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.resolutionBuffer = this.device.createBuffer({
      size: UNIFORM_BINDING_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.mouseBuffer = this.device.createBuffer({
      size: UNIFORM_BINDING_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {
            type: "uniform",
            minBindingSize: UNIFORM_BINDING_SIZE,
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {
            type: "uniform",
            minBindingSize: UNIFORM_BINDING_SIZE,
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {
            type: "uniform",
            minBindingSize: UNIFORM_BINDING_SIZE,
          },
        },
      ],
    });

    this.pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.timeBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this.resolutionBuffer },
        },
        {
          binding: 2,
          resource: { buffer: this.mouseBuffer },
        },
      ],
    });

    this.isReady = true;
    this.resetTimeBaseline();
    this.resizeCanvas();
    this.writeMouseUniform();
    this.startRendering();
    window.addEventListener("resize", () => {
      this.resizeCanvas();
    });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointerup", this.handlePointerUp);

    return true;
  }

  handlePointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    this.mousePosition.x = (event.clientX - rect.left) * pixelRatio;
    this.mousePosition.y = (event.clientY - rect.top) * pixelRatio;
    this.isLeftMouseDown = (event.buttons & 1) === 1 ? 1 : 0;
    this.writeMouseUniform();
  }

  handlePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    this.isLeftMouseDown = 1;
    this.writeMouseUniform();
  }

  handlePointerUp(event) {
    if (event.button !== 0) {
      return;
    }

    this.isLeftMouseDown = 0;
    this.writeMouseUniform();
  }

  handlePointerLeave() {
    this.mousePosition.x = 0;
    this.mousePosition.y = 0;
    this.isLeftMouseDown = 0;
    this.writeMouseUniform();
  }

  writeMouseUniform() {
    if (!this.device || !this.mouseBuffer) {
      return;
    }

    this.device.queue.writeBuffer(
      this.mouseBuffer,
      0,
      new Float32Array([
        this.mousePosition.x,
        this.canvas.height - this.mousePosition.y,
        this.isLeftMouseDown,
        0,
      ]),
    );
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.stopRendering();
      return;
    }

    this.startRendering();
  }

  startRendering() {
    if (this.isRenderingActive) {
      return;
    }

    this.isRenderingActive = true;
    this.frameHandle = requestAnimationFrame(this.renderFrame);
  }

  stopRendering() {
    if (!this.isRenderingActive) {
      return;
    }

    this.isRenderingActive = false;
    if (this.frameHandle) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
    }
  }

  async setShaderSource(shaderSource) {
    if (!this.isReady || !this.device || !this.format || !this.pipelineLayout) {
      return { ok: false, error: "WebGPU 设备未就绪" };
    }

    const generation = ++this.compileGeneration;
    this.currentShaderSource = shaderSource;

    try {
      const shaderModule = this.device.createShaderModule({
        code: shaderSource,
      });

      const compilationInfo = await shaderModule.getCompilationInfo();
      const errorMessages = compilationInfo.messages.filter(
        (item) => item.type === "error",
      );

      if (errorMessages.length > 0) {
        const diagnostics = normalizeCompilationErrors(errorMessages);
        const detailText = errorMessages
          .slice(0, 8)
          .map((item) => {
            const line = item.lineNum > 0 ? `L${item.lineNum}` : "L?";
            const col = item.linePos > 0 ? `C${item.linePos}` : "C?";
            return `${line}:${col} ${item.message}`;
          })
          .join("\n");

        return {
          ok: false,
          error: detailText,
          stale: false,
          diagnostics,
        };
      }

      const pipeline = await this.device.createRenderPipelineAsync({
        layout: this.pipelineLayout,
        vertex: {
          module: shaderModule,
          entryPoint: "vs_main",
          buffers: [
            {
              arrayStride: 8,
              attributes: [
                {
                  shaderLocation: 0,
                  offset: 0,
                  format: "float32x2",
                },
              ],
            },
          ],
        },
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [{ format: this.format }],
        },
        primitive: {
          topology: "triangle-strip",
          stripIndexFormat: undefined,
        },
      });

      if (generation !== this.compileGeneration) {
        return {
          ok: false,
          error: "stale_result",
          stale: true,
          diagnostics: [],
        };
      }

      this.pipeline = pipeline;
      this.resetTimeBaseline();

      return { ok: true, stale: false, diagnostics: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (generation !== this.compileGeneration) {
        return {
          ok: false,
          error: "stale_result",
          stale: true,
          diagnostics: [],
        };
      }

      return { ok: false, error: message, stale: false, diagnostics: [] };
    }
  }

  clearShader() {
    this.pipeline = undefined;
    this.currentShaderSource = "";
  }

  resizeCanvas() {
    if (!this.device) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(
      1,
      Math.floor(this.canvas.clientHeight * pixelRatio),
    );

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.device.queue.writeBuffer(
      this.resolutionBuffer,
      0,
      new Float32Array([width, height, 0, 0]),
    );
  }

  renderFrame(nowMs) {
    if (!this.isRenderingActive || !this.device || !this.context) {
      return;
    }

    this.resizeCanvas();

    const elapsed = (nowMs - this.startTimeMs) / 1000;
    this.device.queue.writeBuffer(
      this.timeBuffer,
      0,
      new Float32Array([elapsed, 0, 0, 0]),
    );

    const commandEncoder = this.device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.05, g: 0.07, b: 0.1, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    if (this.pipeline && this.bindGroup) {
      renderPass.setPipeline(this.pipeline);
      renderPass.setBindGroup(0, this.bindGroup);
      renderPass.setVertexBuffer(0, this.vertexBuffer);
      renderPass.draw(4, 1, 0, 0);
    }

    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);
    if (this.isRenderingActive) {
      this.frameHandle = requestAnimationFrame(this.renderFrame);
    }
  }
}

const renderer = new Renderer(gpuCanvasElement);
renderer.setRuntimeErrorHandler((message) => {
  showOverlay("WGSL 运行时错误", message);
});

const initialize = async () => {
  const isAvailable = await renderer.initialize();

  if (!isAvailable) {
    showOverlay("WebGPU 不可用", "当前环境不支持 WebGPU，无法预览。");
    vscode.postMessage({ type: "ready" });
    return;
  }

  showOverlay("WGSL Preview 已就绪", "等待活动 WGSL 文件...");
  vscode.postMessage({ type: "ready" });
};

window.addEventListener("message", (event) => {
  const message = event.data;

  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "preview:clear") {
    showOverlay(
      "当前未预览 WGSL",
      "请切换到 .wgsl 文件，预览会自动刷新（500ms 防抖）。",
    );
    renderer.clearShader();
    return;
  }

  if (message.type === "shader:update") {
    const targetUri = message.uri;
    const targetVersion = message.version;

    renderer.setShaderSource(message.source).then((result) => {
      if (result.stale) {
        return;
      }

      if (!result.ok) {
        showOverlay("WGSL 编译失败", result.error);
        vscode.postMessage({
          type: "compile:error",
          uri: targetUri,
          version: targetVersion,
          error: result.error,
          diagnostics: result.diagnostics,
        });
        return;
      }

      hideOverlay();
      vscode.postMessage({
        type: "compile:ok",
        uri: targetUri,
        version: targetVersion,
      });
    });
  }
});

void initialize();
