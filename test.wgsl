struct vs_out {
  @builtin(position) clip_pos: vec4f,
  @location(0) position: vec2f,
}

@group(0) @binding(0) var<uniform> u_time: f32;
@group(0) @binding(1) var<uniform> u_resolution: vec2f;
@group(0) @binding(2) var<uniform> u_mouse: vec4f;

@vertex
fn vs_main(@location(0) in_pos: vec2f) -> vs_out {
  var out_data: vs_out;
  out_data.clip_pos = vec4f(in_pos, 0.0, 1.0);
  out_data.position = in_pos;
  return out_data;
}

@fragment
fn fs_main(in_data: vs_out) -> @location(0) vec4f {
  let pos = in_data.position;
  let aspect = u_resolution.x / u_resolution.y;
  let uv = (pos + vec2f(1.0, 1.0)) * 0.5 * vec2f(aspect, 1.0);
  let uv_mouse = u_mouse.xy / u_resolution;

  let radius = select(0.2, 0.3, u_mouse.z > 0.0);
  let dist = sdf_circle(uv - uv_mouse, radius);
  let aa = fwidth(dist);
  let color = vec3f(smoothstep(aa, -aa, dist));
  return vec4f(color, 1.0);
}

fn sdf_circle(p: vec2f, radius: f32) -> f32 {
  return length(p) - radius;
}
