# WGSL Shader 预览 VS Code 插件计划

## 1. 目标

开发一个 VS Code 插件，用于在分栏视图中预览当前 WGSL 文件。

第一阶段核心行为：

- 支持通过命令面板（F1）触发。
- 在当前编辑器旁边打开预览（分屏布局）。
- 渲染一个全屏四边形（单 pass）。
- 当活动页是 WGSL 时，自动编译并预览。
- 监听文件变化并自动刷新预览。
- 提供基础 shader 输入变量：`position`、`u_time` 与 `u_resolution`（在固定入口中直接使用）。
- 架构需保持可扩展，便于后续加入诊断、纹理和更高级流水线能力。

## 2. 范围

### 第一阶段包含

- 一个用于打开/唤起预览面板的命令。
- 一个可复用的常驻预览面板（单例生命周期）。
- 活动编辑器跟踪与文档变更跟踪。
- WGSL 变更时进行防抖热更新。
- 基于 Webview + WebGPU 的渲染循环。
- 单渲染 pass，全屏四边形。
- 固定入口为 `vs_main` 与 `fs_main`，不额外注入入口函数。
- 预览面板内基础错误展示（仅文本覆盖层）。

### 第一阶段不包含

- 将编译错误回写为 VS Code 诊断（红线/问题面板）。
- 读取本地图片并作为纹理。
- 多 pass 渲染图（render graph）。
- 自定义 uniform / 控制面板 UI。
- 多文件 include/import 机制。

## 3. 用户故事

1. 作为用户，我可以在 F1 中执行“WGSL: Open Preview”，并看到分屏预览面板。
2. 作为用户，当当前活动文件是 `.wgsl` 时，预览会立即编译并渲染。
3. 作为用户，在 `.wgsl` 中输入时，预览会自动刷新，无需手动操作。
4. 作为用户，切换到非 WGSL 标签时，预览会显示空闲/占位提示。
5. 作为用户，shader 编译失败时，我可以在预览面板中看到可读错误信息。

## 4. 技术架构提案

## 4.1 Extension Host 层

职责：

- 命令注册（`wgslPreview.openPreview`）。
- 管理预览面板生命周期（create/reveal/dispose）。
- 跟踪活动编辑器和文档变化。
- 依据文件类型做门禁（`languageId === "wgsl"`，或以 `.wgsl` 扩展名兜底）。
- 通过消息通道向 webview 发送 shader 源码更新。

关键组件：

- `PreviewController`：高层编排与状态控制。
- `EditorTracker`：活动编辑器与文档监听。
- `UpdateScheduler`：防抖与更新合并。
- `MessageBridge`：extension 与 webview 之间的类型化消息桥。

## 4.2 Webview Runtime 层

职责：

- 初始化 WebGPU 上下文。
- 构建固定的全屏四边形流水线。
- WGSL 更新时重新编译并重建片元流水线。
- 驱动动画循环并更新 `u_time`，同时在尺寸变化时更新 `u_resolution`。
- 编译失败时展示错误覆盖层。

关键组件：

- `Renderer`：GPU device/context/pipeline 生命周期。
- `ShaderRuntime`：源码契约校验与 module 创建。
- `FrameLoop`：RAF 时钟、u_time 更新与 u_resolution 同步。
- `Overlay`：编译/运行时状态展示。

## 4.3 消息协议（可扩展）

从一开始就定义类型化消息包。

从 extension 到 webview：

- `init`：初始化配置（主题、面板信息、功能开关）。
- `shader:update`：当前 WGSL 源码与文档元数据。
- `preview:clear`：当前无 WGSL 活动文档。

从 webview 到 extension：

- `ready`：webview 初始化完成。
- `compile:ok`：编译成功元数据。
- `compile:error`：结构化编译错误。
- `runtime:error`：运行时错误。

该协议应在后续扩展功能时保持稳定。

## 5. Shader 契约（第一阶段）

第一阶段约定用户直接实现固定入口，不再引入额外入口函数，保证编码灵活性。

用户 WGSL 文件必须提供：

- `@vertex fn vs_main(...)`
- `@fragment fn fs_main(...) -> @location(0) vec4<f32>`

运行时职责：

- 提供全屏四边形顶点输入布局。
- 提供 `u_time: f32` 的固定 uniform 绑定约定。
- 提供 `u_resolution: vec2<f32>` 的固定 uniform 绑定约定（预览区域像素尺寸）。
- 约定 `position` 在顶点到片元阶段可用（由用户在 `vs_main`/`fs_main` 中自行组织与传递）。
- 对变量命名采用小写下划线风格（snake_case），例如 `u_time`、`u_resolution`、`in_pos`、`clip_pos`。

优势：

- 入口稳定且可预测，便于后续扩展。
- 不限制用户在入口内部的实现方式，保留更高编码自由度。
- 未来可继续扩展更多参数（mouse、textures）并保持兼容。

## 6. 预览刷新与事件流

命令流：

1. 用户执行命令。
2. 插件在 `ViewColumn.Beside` 创建/唤起预览面板。
3. 插件绑定监听器并推送当前活动文档初始状态。

更新流：

1. 活动编辑器变化：若为 WGSL，发送新源码；否则发送 `preview:clear`。
2. WGSL 文档文本变化：固定防抖 500ms。
3. 防抖触发后：发送 `shader:update`。
4. Webview 重新编译流水线，成功后热切换。
5. 若编译失败：保留上一次成功流水线，同时显示错误覆盖层。

设计决策：

- 编译失败时保留上一次可用画面，避免只有黑屏的体验。

## 7. 建议项目结构

```text
src/
  extension.ts                    # 激活入口 + 命令绑定
  preview/
    PreviewController.ts          # 面板生命周期 + 编排
    EditorTracker.ts              # 编辑器/文档监听
    UpdateScheduler.ts            # 防抖与更新合并
    MessageBridge.ts              # 类型化消息定义与传输
  common/
    protocol.ts                   # 共享消息类型
media/
  preview/
    index.html                    # webview 宿主页
    main.ts                       # webview 应用启动
    renderer/
      Renderer.ts                 # WebGPU 初始化与渲染循环
      ShaderRuntime.ts            # shader 编译与契约校验
      FullscreenQuad.ts           # 全屏几何体设置
      Uniforms.ts                 # u_time/u_resolution/uniform buffer 布局
      Overlay.ts                  # 编译/运行状态 UI
```

说明：

- `common/protocol.ts` 需保持可复用，便于后续扩展诊断与资源加载通道。

## 8. 配置与兼容性计划

- 最低 VS Code 版本：选择一个 webview 行为稳定的版本。
- 在 webview 中检查 WebGPU 可用性：
  - 若不可用，仅显示明确的不可用提示。
- 第一阶段不提供刷新相关配置项；自动刷新开启，且防抖固定为 500ms。

## 9. 面向诊断能力的设计预留（未来）

虽然第一阶段不实现，但预留 extension 侧接口：

- `CompileReportParser` 接口。
- `DiagnosticsPublisher` 接口（将错误映射为 `vscode.Diagnostic`）。
- 消息体中的源码映射元数据字段。

这样后续加入编辑器错误标注时可避免大规模重构。

## 10. 面向纹理能力的设计预留（未来）

提前预留抽象：

- `ResourceResolver`：解析相对/绝对路径。
- `TextureManager`：纹理上传、缓存、失效处理。
- 协议事件：
  - `resource:request`
  - `resource:response`
  - `resource:error`

第二阶段可先落接口骨架，第三阶段再实现实际加载。

## 11. 里程碑

M1：命令与面板骨架

- 注册命令。
- 打开/唤起分屏预览面板。
- 在 webview 渲染静态占位内容。

M2：WGSL 跟踪与热更新

- 跟踪活动编辑器/文档变化。
- WGSL 门禁与防抖更新分发。
- 显示“当前无 WGSL 活动文档”空态。

M3：WebGPU 单 pass 运行时

- 全屏四边形渲染。
- u_time 与 u_resolution uniform 更新。
- 固定入口 `vs_main` + `fs_main` 契约（不注入额外入口函数）。

M4：基础错误体验

- 在 webview 中捕获编译失败。
- 显示错误覆盖层并保留上一次有效帧。

M5：稳定性收尾

- 释放与清理 disposable 资源。
- 处理边界场景（面板重开、文档关闭、切换到非 wgsl）。
- 完成基础冒烟测试/手工检查清单。

## 12. 第一阶段验收标准

- F1 命令存在，且可在编辑器旁打开预览。
- 活动 WGSL 文档可被渲染。
- WGSL 文件必须使用固定入口 `vs_main` 与 `fs_main`。
- 在 WGSL 中输入时，预览可防抖自动刷新。
- 切换到非 WGSL 标签时，显示占位状态且不崩溃。
- shader 中 `u_time`（`f32`）能驱动动画变化。
- shader 中 `u_resolution`（`vec2<f32>`）可用并随预览尺寸变化更新。
- shader 中 `position` 坐标可用。
- 编译失败时，预览覆盖层可见错误信息。
- 预览面板销毁后不泄漏监听器。

## 13. 测试清单

手工测试：

- 干净会话下命令可正常拉起预览。
- 在多个标签切换时状态更新正确。
- 快速输入不会导致 UI 卡死。
- 非法 WGSL 能显示可读错误覆盖层。
- 修复非法 WGSL 后渲染可自动恢复。
- 调整预览面板尺寸后，`u_resolution` 值可同步更新。
- 关闭预览面板会释放监听器与定时器。

用于验证第一阶段契约的基础 shader 示例（固定 `vs_main` / `fs_main`，变量命名为 snake_case）：

```wgsl
struct vs_out {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) position: vec2<f32>,
}

@group(0) @binding(0) var<uniform> u_time: f32;
@group(0) @binding(1) var<uniform> u_resolution: vec2<f32>;

@vertex
fn vs_main(@location(0) in_pos: vec2<f32>) -> vs_out {
  var out_data: vs_out;
  out_data.clip_pos = vec4<f32>(in_pos, 0.0, 1.0);
  out_data.position = in_pos;
  return out_data;
}

@fragment
fn fs_main(in_data: vs_out) -> @location(0) vec4<f32> {
  let position = in_data.position;
  let aspect = u_resolution.x / max(u_resolution.y, 1.0);
  let uv = position * 0.5 + vec2<f32>(0.5, 0.5);
  let wave = 0.5 + 0.5 * sin(u_time + uv.x * 10.0 * aspect);
  return vec4<f32>(uv.x, uv.y, wave, 1.0);
}
```

## 14. 风险与缓解

- 某些环境下 WebGPU 不可用：
  - 缓解：仅显示明确不可用提示。
- 高频重编译导致卡顿：
  - 缓解：固定 500ms 防抖 + 保留上一次成功流水线。
- 消息竞态（快速切换文件）：
  - 缓解：更新消息携带 `documentVersion`，忽略过期更新。
- 生命周期资源泄漏（监听器未释放）：
  - 缓解：在 controller 里集中管理 disposable 注册表。

## 15. 实施顺序建议

1. 先完成 M1 骨架。
2. 加入编辑器跟踪与协议（M2）。
3. 接入渲染器与固定入口契约（M3）。
4. 加入错误覆盖与恢复逻辑（M4）。
5. 做清理与验证（M5）。

该顺序可以尽早收敛不确定性，并保证每个里程碑都可独立验证。
