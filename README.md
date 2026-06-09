# WGSL Canvas Preview

一个用于 VS Code 的 WGSL 实时预览插件。

当前版本聚焦于单 pass 全屏四边形预览，并提供基础交互输入与编译错误回显。

## 功能概览

- 通过命令面板执行 WGSL: Open Preview 打开预览面板
- 在编辑器旁边分栏显示预览
- 仅在活动编辑器是 WGSL 文件时进行预览
- 文本变更后 500ms 防抖刷新
- WebGPU 单 pass 渲染全屏四边形
- 固定入口函数：vs_main / fs_main
- 支持基础 uniform：u_time / u_resolution / u_mouse
- WebGPU 编译错误显示在预览遮罩层
- 编译错误回写到编辑器红色波浪线（Diagnostics）
- 编译失败时保留上一帧有效画面
- 点击预览面板不会导致预览失效
- 只有激活非 WGSL 编辑器时才会清空预览状态

## 环境要求

- VS Code 1.90+
- 支持 WebGPU 的运行环境

如果当前环境不支持 WebGPU，预览面板会显示不可用提示。

## 快速开始（开发态）

1. 安装依赖

```bash
npm install
```

2. 编译

```bash
npm run compile
```

3. 启动调试

- 打开 Run and Debug
- 选择 Run Extension
- 启动后在新窗口里使用命令 WGSL: Open Preview

## 使用方式

1. 打开任意 .wgsl 文件
2. 按 F1，执行 WGSL: Open Preview
3. 在 WGSL 文件中编辑代码，预览会自动刷新
4. 切换到非 WGSL 编辑器时，预览显示空态提示

## Shader 契约

当前版本使用固定入口：

- 顶点入口：vs_main
- 片元入口：fs_main

几何输入为全屏四边形，顶点输入使用 @location(0) vec2f。

## 内置 Uniform 约定

### u_time

- 声明建议：@group(0) @binding(0) var<uniform> u_time: f32;
- 单位：秒
- 用途：动画时间

### u_resolution

- 声明建议：@group(0) @binding(1) var<uniform> u_resolution: vec2f;
- 含义：预览画布像素尺寸 (width, height)

### u_mouse

- 声明建议：@group(0) @binding(2) var<uniform> u_mouse: vec4f;
- 语义：
  - u_mouse.x: 鼠标像素 x
  - u_mouse.y: 鼠标像素 y（以画布左下为原点）
  - u_mouse.z: 左键状态（0 未按下，1 按下）
  - u_mouse.w: 预留（当前为 0）
- 鼠标离开画布时：x=0, y=0, z=0

## 最小示例

```wgsl
struct vs_out {
  @builtin(position) clip_pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var<uniform> u_time: f32;
@group(0) @binding(1) var<uniform> u_resolution: vec2f;
@group(0) @binding(2) var<uniform> u_mouse: vec4f;

@vertex
fn vs_main(@location(0) in_pos: vec2f) -> vs_out {
  var out_data: vs_out;
  out_data.clip_pos = vec4f(in_pos, 0.0, 1.0);
  out_data.uv = in_pos * 0.5 + vec2f(0.5, 0.5);
  return out_data;
}

@fragment
fn fs_main(in_data: vs_out) -> @location(0) vec4f {
  return vec4f(1.0);
}
```

## 错误回显

- 编译错误会显示在预览遮罩层
- 同时回写到对应 WGSL 文件的编辑器 Diagnostics
- 对应错误位置会出现红色波浪线

## 已知限制（当前版本）

- 仅支持单 pass
- 仅支持固定入口 vs_main / fs_main
- 暂未支持纹理读取
- 暂未支持多文件 include/import
- 暂未支持将运行时错误映射为精确编辑器范围（当前主要覆盖编译错误）

## 后续方向

- 本地贴图读取与采样
- 多 pass 支持
- 更完整的错误分类与诊断映射
- 更多交互输入（如滚轮、键盘等）
