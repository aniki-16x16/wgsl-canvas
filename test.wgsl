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
