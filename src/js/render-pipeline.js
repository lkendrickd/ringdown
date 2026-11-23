/* ================= rendering setup ================= */
let view = document.getElementById('view');
const ui = document.getElementById('ui'), octx = ui.getContext('2d');
const scopeCv = document.getElementById('scope'), scx = scopeCv.getContext('2d');
const scene = document.createElement('canvas'), sctx = scene.getContext('2d');
let gl = null, vctx = null, HDR = false, glLost = false;
let vw = innerWidth, vh = innerHeight, RS = 1, OD = 1;
const GLR = { tg: {}, bloom: [] };   // programs, vertex arrays and render targets of the GPU pipeline

/* ---- GPU pipeline --------------------------------------------------------------------------------------------
   sky + 2D effects canvas + explosions (HDR) + stars  ->  base    (what the sky lens bends and the shadows cover)
   gas, as instanced sprites        ->  gas     (kept apart so the disk can be ray traced around each hole)
   base + gas, lensed               ->  lens    (float target when the device allows: brightness above 1 survives)
   lens -> bloom pyramid -> tone map -> screen
   ------------------------------------------------------------------------------------------------------------ */
const VS_TRI = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FS_BASE = `#version 300 es
precision highp float;
uniform sampler2D uSky, uScene;
uniform vec2 uRes;
uniform vec4 uSkyT;      // cos yaw, sin yaw, tile offset
uniform float uHasScene, uSkyK;
out vec4 o;
void main(){
  vec2 q = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) - 0.5 * uRes;
  vec2 t = vec2(uSkyT.x * q.x + uSkyT.y * q.y, -uSkyT.y * q.x + uSkyT.x * q.y) - uSkyT.zw;
  vec3 col = texture(uSky, t / 1024.0).rgb * uSkyK;
  if (uHasScene > 0.5) { vec4 s = texture(uScene, gl_FragCoord.xy / uRes); col = col * (1.0 - s.a) + s.rgb; }
  o = vec4(col, 1.0);
}`;

const VS_STAR = `#version 300 es
in vec2 q;
in vec4 iA;   // x, y, radius, glow radius (px)
in vec4 iB;   // r, g, b, angle toward the hole that is stretching it
in vec4 iC;   // tidal shape: near, far, width, pinch
in vec4 iD;   // convection cells across the disc, contrast, seed, brightness
uniform vec2 uRes;
out vec2 vL; flat out vec4 vA; flat out vec4 vB; flat out vec4 vC; flat out vec4 vD;
void main(){
  float ext = max(iA.w, iA.z * max(iC.x, iC.y) + 2.0);
  vL = q * ext; vA = iA; vB = iB; vC = iC; vD = iD;
  gl_Position = vec4((iA.xy + vL) / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_STAR = `#version 300 es
precision highp float;
in vec2 vL; flat in vec4 vA; flat in vec4 vB; flat in vec4 vC; flat in vec4 vD;
uniform float uT, uDetail;
out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ return vnoise(p) * 0.55 + vnoise(p * 2.1 + 3.7) * 0.3 + vnoise(p * 4.3 - 1.3) * 0.15; }
// cellular noise: distances to the nearest and second-nearest of a set of points that wander with time t
vec3 cells(vec2 p, float t){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), h = vec2(hash(i + g), hash(i + g + 17.31));
    vec2 c = g + 0.5 + 0.36 * sin(t * (0.5 + h.yx) + 6.2831 * h) - f;
    float d = dot(c, c);
    if (d < d1) { d2 = d1; d1 = d; id = h.x; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
// value noise in three dimensions: sampled at a point on the sphere itself, so a world has no seam and no pinched poles
float hash3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise3(p); p = p * 2.03 + vec3(11.7, 3.1, 7.3); a *= 0.5; }
  return s / 0.96875;
}
// one layer of craters: a bowl below the plain with a raised rim. keep: the share of the ground's cells that hold one
float craters(vec2 sp, float keep){
  vec3 w = cells(sp, 0.0); float rad = 0.1 + 0.34 * w.z * w.z, x = w.x / rad;
  return step(fract(w.z * 13.7), keep) * (-0.11 * (1.0 - smoothstep(0.0, 0.85, x)) + 0.07 * smoothstep(0.7, 1.0, x) * (1.0 - smoothstep(1.0, 1.35, x))) * (0.5 + rad * 2.0);
}
// the height of the ground on an airless moon and on a dry rocky world. f fades the craters out toward the poles,
// where the map they are laid out on is pinched
float moonGround(vec3 p, vec2 sp, float f){ return 0.16 * (fbm3(p * 2.0) - 0.5) + f * (craters(sp, 0.55) + 0.6 * craters(sp * 2.7 + 5.0, 0.5) + 0.3 * craters(sp * 6.1 + 11.0, 0.45)); }
float rockGround(vec3 p, vec2 sp, float f){ float h = fbm3(p); return h + 0.22 * (1.0 - abs(2.0 * fbm3(p * 2.3 + 5.0) - 1.0)) * h + f * (0.5 * craters(sp * 1.3 + 2.0, 0.22) + 0.25 * craters(sp * 3.7 + 8.0, 0.25)); }
void main(){
  float R = vA.z, d = length(vL);
  float ca = cos(vB.w), sa = sin(vB.w);
  vec2 l = vec2(ca * vL.x + sa * vL.y, -sa * vL.x + ca * vL.y) / R;   // +x points at the hole, units of the radius
  float cx = l.x / (l.x > 0.0 ? vC.x : vC.y);
  float cc = clamp(cx, -1.0, 1.0);
  float pf = l.x > 0.0 ? 1.0 - vC.w * cc * cc * cc * cc : 1.0;
  float rho = length(vec2(cx, l.y / (vC.z * pf)));
  float aw = 1.2 / R;
  float disc = 1.0 - smoothstep(1.0 - aw, 1.0 + aw, rho);
  float mu = sqrt(max(1.0 - rho * rho, 0.0));
  vec3 col = vB.rgb;
  if (vD.y < 0.0) { // a planet: no light of its own. Shaded as a sphere lit from the direction of its star.
    vec2 n2 = vL / R; float r2 = dot(n2, n2);
    float dp = 1.0 - smoothstep(1.0 - aw, 1.0 + aw, sqrt(r2));
    vec3 nrm = vec3(n2, sqrt(max(1.0 - r2, 0.0)));
    // with no star in the scene the light comes from the upper left, so a world still shows its roundness
    vec3 Ld = vD.w > 0.5 ? normalize(vec3(ca * 0.92, sa * 0.92, 0.4)) : normalize(vec3(-0.5, 0.42, 0.76));
    // the surface, wrapped on the sphere and turning slowly; only drawn once the world is big enough to show it
    float detail = smoothstep(4.0, 16.0, R) * uDetail, typ = -vD.y;
    float rot = uT * 0.05 + vD.z, cr = cos(rot), sr = sin(rot);
    vec3 P = vec3(nrm.x * cr + nrm.z * sr, nrm.y, nrm.z * cr - nrm.x * sr), sd = vec3(vD.z * 1.7, vD.z * 0.9, vD.z * 2.3);
    float lat = asin(clamp(nrm.y, -1.0, 1.0)), lon = atan(nrm.x, nrm.z) + rot;
    vec3 alb = col, nb = nrm; float spec = 0.0, air = 0.0, cloud = 0.0;
    if (detail > 0.0 && dp > 0.0) {
      // two directions along the surface, to feel the slope of the ground and tilt the light with it
      vec3 t1 = normalize(cross(vec3(0.0, 1.0, 0.0), nrm) + vec3(1e-4, 0.0, 0.0)), t2 = cross(nrm, t1);
      vec3 T1 = vec3(t1.x * cr + t1.z * sr, t1.y, t1.z * cr - t1.x * sr), T2 = vec3(t2.x * cr + t2.z * sr, t2.y, t2.z * cr - t2.x * sr);
      float e = 0.03, sc = vD.x * 0.55;
      if (typ > 3.5) {          // airless moons and asteroids: dusty highlands, dark lava plains, craters with raised rims
        vec2 sp = vec2(lon, lat) * vD.x;
        float pf = 1.0 - smoothstep(0.95, 1.3, abs(lat));
        float h0 = moonGround(P * sc + sd, sp, pf), h1 = moonGround((P + T1 * e) * sc + sd, sp + vec2(e, 0.0) * vD.x, pf), h2 = moonGround((P + T2 * e) * sc + sd, sp + vec2(0.0, e) * vD.x, pf);
        nb = normalize(nrm - (t1 * (h1 - h0) + t2 * (h2 - h0)) * (0.45 / e));
        float mare = smoothstep(0.5, 0.62, fbm3(P * 1.25 + sd + 4.0));
        alb = col * (0.8 + 0.34 * fbm3(P * 3.0 + sd)) * mix(1.0, 0.56, mare) * (1.0 + 1.6 * h0);
        alb *= 0.92 + 0.16 * vnoise3(P * 22.0 + sd);
      } else if (typ > 2.5) {   // ice giants: a deep haze, faint bands and the odd bright streak of methane cloud
        float tw = fbm3(vec3(P.x * 1.2, lat * 5.0, P.z * 1.2) + sd);
        alb = col * (0.93 + 0.07 * sin(lat * vD.x + 2.0 * tw));
        alb = mix(alb, vec3(0.95, 0.98, 1.0), smoothstep(0.66, 0.8, fbm3(vec3(P.x * 2.0, lat * 14.0, P.z * 2.0) + sd)) * 0.22);
        air = 0.5;
      } else if (typ > 1.5) {   // gas giants: light zones and dark belts sheared by turbulence, fine streaks, storms
        float tw = fbm3(vec3(P.x * 1.4, lat * 8.0, P.z * 1.4) + sd);
        float fine = fbm3(vec3(P.x * 3.2, lat * 30.0, P.z * 3.2) + sd * 0.5);
        float bands = sin(lat * vD.x + 2.6 * tw + 0.5 * sin(lat * 31.0 + vD.z));
        alb = col * (0.8 + 0.17 * bands + 0.2 * (fine - 0.5)) * mix(vec3(1.0), vec3(1.0, 0.84, 0.68), smoothstep(0.1, 1.0, -bands) * 0.6);
        alb *= 1.0 + 0.1 * (fbm3(P * 9.0 + sd) - 0.5) * smoothstep(-0.3, 0.6, -bands);   // curdled belts
        float wl = mod(lon + 3.14159, 6.28318) - 3.14159;
        vec2 so = vec2(wl * 1.4, (lat + 0.38) * 5.0); float sw = length(so);
        alb = mix(alb, col * vec3(1.16, 0.7, 0.55) * (0.85 + 0.3 * sin(sw * 9.0 - atan(so.y, so.x) * 2.0)), (1.0 - smoothstep(0.55, 1.0, sw)) * 0.8);
        vec2 s2 = vec2((mod(lon * 1.0 + 5.2, 6.28318) - 3.14159) * 3.2, (lat - 0.52) * 11.0);
        alb = mix(alb, vec3(1.0, 0.97, 0.9) * (0.7 + 0.3 * col), (1.0 - smoothstep(0.5, 1.0, length(s2))) * 0.6);
        alb *= 1.0 - 0.3 * smoothstep(1.0, 1.45, abs(lat));   // darker, bluer poles
        air = 0.35;
      } else if (col.b > col.r) { // an ocean world: deep and shallow seas, bare land with mountains, weather, ice at the poles
        float h0 = fbm3(P * sc + sd), h1 = fbm3((P + T1 * e) * sc + sd), h2 = fbm3((P + T2 * e) * sc + sd);
        float land = smoothstep(0.515, 0.535, h0), up = smoothstep(0.535, 0.72, h0);
        vec3 sea = mix(col * 0.34, col * 0.9, smoothstep(0.3, 0.52, h0));
        float dry = fbm3(P * 3.1 + sd + 7.0);
        vec3 ground = mix(vec3(0.46, 0.4, 0.27), vec3(0.62, 0.5, 0.33), dry);
        ground = mix(ground, vec3(0.34, 0.3, 0.26), up);
        ground *= 0.86 + 0.28 * vnoise3(P * 17.0 + sd);
        alb = mix(sea, ground, land);
        nb = normalize(nrm - (t1 * (h1 - h0) + t2 * (h2 - h0)) * (land * 0.9 / e));
        float cap = smoothstep(1.02, 1.16, abs(lat) + 0.22 * (dry - 0.5));
        alb = mix(alb, vec3(0.9, 0.94, 0.97), cap);
        // weather: one layer of cloud drifting a little faster than the ground, swirled, with its shadow on the surface
        vec3 Pc = vec3(P.x * cos(uT * 0.012) + P.z * sin(uT * 0.012), P.y, P.z * cos(uT * 0.012) - P.x * sin(uT * 0.012));
        vec3 wq = Pc * vec3(2.2, 3.6, 2.2) + sd * 1.3; wq += 0.9 * vec3(fbm3(wq + 3.1), 0.0, fbm3(wq - 5.2));
        cloud = smoothstep(0.5, 0.74, fbm3(wq)) * 0.92;
        vec3 Ls = vec3(Ld.x * cr + Ld.z * sr, Ld.y, Ld.z * cr - Ld.x * sr), ws = (Pc + Ls * 0.05) * vec3(2.2, 3.6, 2.2) + sd * 1.3;
        float shadow = smoothstep(0.5, 0.74, fbm3(ws + 0.9 * vec3(fbm3(ws + 3.1), 0.0, fbm3(ws - 5.2))));
        alb *= 1.0 - 0.32 * shadow * (1.0 - cloud);
        spec = (1.0 - land) * (1.0 - cap) * (1.0 - cloud);
        air = 1.0;
      } else {                  // rocky and dry: ochre plains, dark provinces, old craters, a little frost at the poles
        vec2 sp = vec2(lon, lat) * vD.x;
        float pf = 1.0 - smoothstep(0.95, 1.3, abs(lat));
        float h0 = rockGround(P * sc + sd, sp, pf), h1 = rockGround((P + T1 * e) * sc + sd, sp + vec2(e, 0.0) * vD.x, pf), h2 = rockGround((P + T2 * e) * sc + sd, sp + vec2(0.0, e) * vD.x, pf);
        nb = normalize(nrm - (t1 * (h1 - h0) + t2 * (h2 - h0)) * (0.4 / e));
        float dark = smoothstep(0.5, 0.64, fbm3(P * 1.5 + sd + 9.0));
        alb = col * (0.62 + 0.75 * h0) * mix(vec3(1.0), vec3(0.7, 0.67, 0.7), dark);
        alb *= 0.9 + 0.2 * vnoise3(P * 19.0 + sd);
        alb = mix(alb, vec3(0.9, 0.9, 0.92), smoothstep(1.12, 1.24, abs(lat) + 0.2 * (h0 - 0.5)) * 0.8);
        air = 0.18;
      }
      alb = mix(col, alb, detail); nb = normalize(mix(nrm, nb, detail));
    }
    float lit = smoothstep(2.5, 7.0, R);   // a world only a few pixels across is drawn as a plain bright dot
    float day = dot(nrm, Ld), lam = max(dot(nb, Ld), 0.0) * smoothstep(-0.08, 0.22, day);
    vec3 shade = alb * mix(1.0, 0.03 + 1.12 * lam, lit);
    // cloud tops catch the light on the smooth sphere, not on the ground's relief; the sea glints toward the star
    float lamS = max(day, 0.0);
    shade = mix(shade, vec3(0.97, 0.98, 1.0) * mix(1.0, 0.04 + 1.1 * lamS, lit), cloud * detail);
    shade += vec3(1.0, 0.95, 0.85) * pow(max(dot(nrm, normalize(Ld + vec3(0.0, 0.0, 1.0))), 1e-6), 70.0) * 0.75 * spec * detail * lit;
    // an atmosphere: the limb brightens on the day side and reddens where the sun is setting
    float rz = 1.0 - nrm.z, rim = rz * rz * rz, haze = air * lit * detail;
    vec3 sky = typ < 1.5 ? mix(vec3(0.42, 0.62, 1.0), col, 0.25) : col;
    shade += sky * rim * smoothstep(-0.15, 0.5, day) * 0.5 * haze;
    shade = mix(shade, shade * vec3(1.25, 0.8, 0.6), air * detail * (1.0 - smoothstep(0.0, 0.3, abs(day))) * 0.5);
    // molten after a giant impact: a glowing magma ocean that skins over with dark crust, bright along the cracks
    if (vC.w > 0.0) {
      float hot = vC.w, big = smoothstep(4.0, 12.0, R);
      float flow = fbm3(P * 2.4 + sd + vec3(0.0, uT * 0.02, 0.0));
      // no pow() on these: some drivers (AMD on Linux, seen on a Radeon 780M) let the clamped temperature come out a
      // hair below zero, pow() of that is NaN, and the bloom smears each NaN pixel into a flashing black square
      float cb = 1.0 - abs(2.0 * fbm3(P * 3.6 + sd * 0.7) - 1.0), cb2 = cb * cb, crack = cb2 * cb2 * cb2 * cb;
      float temp = clamp(hot * (0.3 + 0.62 * flow) + crack * (0.2 + 0.5 * hot) - (1.0 - hot) * 0.4, 0.0, 1.0);
      temp = mix(hot * 0.7, temp, big);
      float t2 = temp * temp, glowT = exp2(1.4 * log2(max(temp, 1e-6)));   // temp^1.4 with the base kept positive
      vec3 lava = vec3(1.0, 0.07 + 0.5 * t2, 0.01 + 0.1 * t2 * t2) * (0.04 + 0.95 * glowT) * (0.5 + 0.5 * nrm.z);
      float crust = smoothstep(0.0, 0.35, hot);   // the old surface is gone: dark fresh rock wherever the glow has faded
      shade = mix(shade, vec3(0.075, 0.06, 0.058) * (0.5 + 0.9 * fbm3(P * 6.0 + sd)) * (0.25 + lam), crust) + lava * crust;
    }
    float t0 = d / vA.w;
    float halo = (1.0 - smoothstep(0.55, 1.0, t0)) * (0.10 + 0.5 * vC.w) + (1.0 - smoothstep(1.0, 1.0 + 0.09 * air + 1e-4, sqrt(r2))) * 0.45 * air * detail;
    o = vec4(shade * dp + mix(mix(col, sky, air), vec3(1.0, 0.5, 0.2), min(vC.w, 1.0)) * halo * (1.0 - dp) * max(max(day, 0.0) + 0.25, 0.3), dp);
    return;
  }
  // A star. Its temperature, from its colour: 0 hot and blue, 1 cool and red.
  float cool = clamp((col.r - col.b) * 1.5, 0.0, 1.0), m1 = 1.0 - mu;
  // limb darkening, quadratic law; stronger and redder at the limb for cooler stars (about the Sun's at 5,800 K)
  vec3 surf = col * (1.0 - (0.28 + 0.38 * cool) * m1 - (0.08 + 0.12 * cool) * m1 * m1) * mix(vec3(1.0), vec3(1.0, 0.88, 0.76), m1 * m1 * cool);
  surf = mix(surf, vec3(1.0, 0.98, 0.93), pow(mu, 5.0) * 0.42);   // a hot white centre
  // granulation: convection cells, bright centres and dark lanes, foreshortened toward the limb, slowly boiling. How
  // many cross the disc depends on the star (a dwarf has thousands, a supergiant a handful). Drawn only where a cell
  // spans a few pixels, so a star a few pixels across never shimmers.
  float cpx = 2.0 * R / max(vD.x, 1.0);
  float gz = vD.y * smoothstep(2.0, 5.0, cpx) * uDetail;
  if (gz > 0.001 && disc > 0.0) {
    vec2 g = l / (0.3 + 0.7 * mu) * vD.x * 0.5 + vD.z;
    vec3 w = cells(g, uT * 0.35);
    float n = (1.0 - smoothstep(0.05, 0.9, w.x)) * 0.5 + smoothstep(0.0, 0.6, w.y - w.x) * 0.25 + vnoise(g * 2.7 + uT * 0.1) * 0.25;
    surf *= 1.0 + gz * (n - 0.5) * 1.2 * (0.4 + 0.6 * mu);
  }
  // starspots, sparingly, on stars with deep convection (cool dwarfs): in belts either side of the equator, turning
  float sp = smoothstep(0.25, 0.45, cool) * step(12.0, vD.x) * smoothstep(5.0, 12.0, R) * uDetail;
  if (sp > 0.0 && disc > 0.0) {
    float lat = asin(clamp(l.y, -1.0, 1.0)), lon = atan(l.x, mu) + uT * 0.03;
    float belt = smoothstep(0.1, 0.22, abs(lat)) * (1.0 - smoothstep(0.45, 0.6, abs(lat)));
    float s = vnoise(vec2(lon, lat) * 9.0 + vD.z * 3.1) * vnoise(vec2(lon, lat) * 2.0 - vD.z) * belt;
    surf *= 1.0 - sp * (0.3 * smoothstep(0.5, 0.56, s) + 0.45 * smoothstep(0.58, 0.64, s));
  }
  // corona and glow: whiter and stronger round hot stars, dimmer and redder round cool ones
  float t = d / vA.w;
  float ga = t < 0.15 ? mix(0.6, 0.28, t / 0.15) : t < 0.45 ? mix(0.28, 0.07, (t - 0.15) / 0.30) : mix(0.07, 0.0, clamp((t - 0.45) / 0.55, 0.0, 1.0));
  vec3 cor = mix(col, vec3(0.95, 0.97, 1.0), 0.3 * (1.0 - cool)) * (1.1 - 0.25 * cool);
  o = vec4(surf * vD.w * disc + cor * ga * (1.0 - disc), disc);
}`;

const VS_GAS = `#version 300 es
in vec2 q;
in vec4 iP;   // x, y, length along its motion, width (px)
in vec4 iC;   // colour already scaled by brightness, direction of motion on screen
uniform vec2 uRes;
out vec2 vQ; flat out vec3 vC;
void main(){
  vQ = q; vC = iC.rgb;
  float ca = cos(iC.w), sa = sin(iC.w);
  vec2 l = q * iP.zw * 0.5;
  gl_Position = vec4((iP.xy + vec2(ca * l.x - sa * l.y, sa * l.x + ca * l.y)) / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_GAS = `#version 300 es
precision highp float;
in vec2 vQ; flat in vec3 vC;
out vec4 o;
void main(){
  float t = length(vQ);
  float a = t < 0.3 ? mix(0.95, 0.45, t / 0.3) : 0.45 * (1.0 - smoothstep(0.3, 1.0, t));
  o = vec4(vC * a, 1.0);
}`;

const FS_LENS = `#version 300 es
precision highp float;
uniform sampler2D uTex;  // base
uniform sampler2D uGas;
uniform vec2 uRes;
uniform int uN;
uniform vec4 uBH[16];   // x, y, r_s (px), ringdown amplitude
uniform vec4 uBH2[16];  // ringdown phase, feeding glow, spin (+ = counter-clockwise on screen), sense of the disk's orbit (same)
uniform vec4 uBH3[16];  // exact Kerr shadow (Bardeen) as a Fourier series about its centre, units of M: c0..c3
uniform vec4 uBH4[16];  // c4, centre shift toward the approaching side (M), ISCO for the disk's sense (M), horizon (M)
uniform float uLens;
uniform float uTrace;   // 1 = ray trace the disk plane around each hole
uniform vec2 uIncl;     // sin i, cos i
uniform vec4 uGWa;      // cx, cy, c (px/s), on
uniform vec4 uGWb;      // t since ref, phiRef, omega orbit, merged
uniform vec4 uGWc;      // omega ring, tau, amp inspiral px, amp ring px
uniform float uGWr0;
out vec4 o;
const float TR = 16.0;  // ray trace out to this many Schwarzschild radii on screen
const float BC = 2.5980762;   // critical impact parameter, 3√3 M, in r_s: rays passing closer fall in
const float DS = 5.445;       // the sky's lens distance in r_s (gives the old 3.3 r_s Einstein radius in the weak field)
// Schwarzschild deflection of a ray passing at impact parameter BC / x (0 < x < 1): the exact elliptic integral,
// fitted to within 0.1%. 4M/b far out, growing without limit (logarithmically) as b closes in on the photon sphere.
float defl(float x){
  float L = log(max(1.0 - x, 1e-6));
  return -L * (1.0 + 0.22698 * x * (1.0 - x)) + x * (-0.23084 + x * (-0.2804 + x * (0.04627 + 0.06519 * x)));
}
vec3 gasAt(vec2 q){
  vec2 uv = q / uRes;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  return texture(uGas, uv).rgb;
}
// Gas in the disk at radius r (M), seen in light with angular momentum xi (M) about the spin axis. Circular Kerr orbit
// (Bardeen, Press & Teukolsky 1972; a > 0 prograde): Ω = 1 / (r^1.5 + a), and the light reaches a distant viewer
// shifted by g = 1 / (u^t (1 − Ω xi)): Doppler, time dilation and gravitational redshift together. Gas inside the ISCO
// is plunging; it keeps the ISCO's values. Brightness goes as g³, and the colour tilts with it (bluer when g > 1).
// Emission fades across the ISCO, the disk's inner edge.
vec3 diskLight(float r, float a, float rI, float xi){
  float rr = max(r, rI), sr = sqrt(rr), r32 = rr * sr;
  float ut = (r32 + a) / (sqrt(r32) * sqrt(max(r32 - 3.0 * sr + 2.0 * a, 1e-3)));
  float g = 1.0 / (ut * max(1.0 - xi / (r32 + a), 0.05));
  g = min(g, 1.6);
  return g * g * g * max(vec3(1.0) + (g - 1.0) * vec3(-0.6, 0.0, 0.8), 0.1) * smoothstep(0.85, 1.15, r / rI);
}
void main(){
  vec2 p = gl_FragCoord.xy;
  vec2 src = p;
  vec3 add = vec3(0.0);
  if (uGWa.w > 0.5) {
    vec2 d0 = p - uGWa.xy;
    vec2 d = vec2(d0.x, d0.y / max(uIncl.y, 0.2));
    float r = length(d) + 0.001;
    float th = atan(-d.y, d.x);
    float tr = uGWb.x - r / uGWa.z;
    float h; float A;
    if (uGWb.w > 0.5 && tr > 0.0) { h = exp(-tr / uGWc.y) * cos(2.0*th - 2.0*uGWb.y - uGWc.x*tr); A = uGWc.w; }
    else { h = cos(2.0*th - 2.0*(uGWb.y + uGWb.z*tr)); A = uGWc.z; }
    float fall = uGWr0 / (r + uGWr0) * smoothstep(0.0, uGWr0 * 0.8, r);
    src += (d0 / (length(d0) + 0.001)) * h * A * fall;
    add += vec3(0.16, 0.42, 0.52) * max(h, 0.0) * fall * min(A / 5.0, 1.0) * 0.16;
  }
  vec2 gsrc = src;            // where this pixel's first view of the orbital plane lands, before lensing
  float shadow = 0.0, gshadow = 0.0, gvis = 1.0;
  vec3 ring = vec3(0.0), gas2 = vec3(0.0), gtint = vec3(1.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uN) break;
    vec4 b = uBH[i]; vec4 b2 = uBH2[i];
    vec2 d = p - b.xy; float r2 = max(dot(d, d), 1e-3); float r = sqrt(r2);
    float th = atan(-d.y, d.x);
    float rs = b.z;
    float chi = b2.z; float a = abs(chi); float s = chi >= 0.0 ? 1.0 : -1.0;
    float deform = 1.0 + b.w * cos(2.0*th - b2.x);
    // exact Kerr shadow outline for this spin and viewing angle, rebuilt from its Fourier coefficients
    vec4 c = uBH3[i]; vec4 c4 = uBH4[i];
    float Mpx = 0.5 * rs;
    float xs = -s * d.x;                       // + toward the side moving toward the viewer
    vec2 q = vec2(xs - c4.y * Mpx, d.y);
    float tq = atan(abs(q.y), q.x);
    float R = (c.x + c.y*cos(tq) + c.z*cos(2.0*tq) + c.w*cos(3.0*tq) + c4.x*cos(4.0*tq)) * Mpx * deform;
    float sd = length(q) - R;
    // Spin, to leading order (frame dragging): a spinning hole bends light like a non-spinning one moved sideways,
    // away from the side turning toward the viewer, by a sin i far out (Asada & Kasai 2000) and by the exact shadow's
    // own shift at the photon sphere; and impact parameters are scaled so rays are captured exactly on the Kerr
    // outline. The two limits blend as (R / distance from the shadow's centre)², 1 on the outline. Rays are then
    // traced as Schwarzschild geodesics about that stand-in hole. (No spin: the hole itself, unchanged.)
    float w = min(1.0, R * R / max(dot(q, q), 1e-6));
    float sx = mix(-a * uIncl.x, c4.y, w) * Mpx, ks = mix(1.0, BC * rs / R, w);
    vec2 qe = vec2(xs - sx, d.y); float re = max(length(qe), 1e-3);
    vec2 ev = vec2(-s * qe.x, qe.y) / re, ce = b.xy + vec2(-s * sx, 0.0);   // direction from, and position of, the stand-in
    // the sky, far behind: the lens equation with the exact deflection. A real Einstein ring, the second, inverted
    // image of everything inside it, and ever thinner copies of the whole sky crowding up to the shadow's edge.
    vec2 bend = ev * (DS * rs * defl(min(BC * rs / (re * ks), 0.999999)) / ks) * uLens;
    src -= bend;
    float aa = max(0.8, rs * 0.06);
    float sh = 1.0 - smoothstep(-aa, aa, sd);
    shadow = max(shadow, sh);
    float beam = max(0.12, 1.0 + 0.85 * uIncl.x * min(1.0, a * 3.0 + b2.y * 0.6) * (xs / max(r, 1.0)));
    float e = sd / max(0.20 * rs, 1.0);
    ring += mix(vec3(1.0, 0.80, 0.58), vec3(1.0, 0.93, 0.82), b2.y) * exp(-e * e) * (0.16 + 0.95 * b2.y) * beam;
    float halo = sd / max(1.6 * rs, 2.0);
    ring += vec3(1.0, 0.6, 0.3) * exp(-halo * halo) * 0.10 * b2.y * beam;

    // The disk. Follow this pixel's light ray back through the hole's gravity (Schwarzschild null geodesic,
    // u = r_s / r as a function of the angle swept: u'' = -u + 1.5 u^2) and find where it crosses the orbital
    // plane. The first crossing is the direct view of the disk; a ray bent right round the hole crosses again
    // on the far side, which is what lifts the back of the disk into an arc over and under the shadow.
    // Radii from the trace are scaled back by ks; the ray dies at the Kerr horizon. The disk's light is then shifted
    // for the spin- and sense-dependent orbit it comes from (diskLight).
    float bb = re * ks / rs;
    float wt = uTrace * uLens * smoothstep(1.2, 2.5, rs) * (1.0 - smoothstep(0.6 * TR, TR, bb));
    if (wt > 0.001) {
      float phi1 = atan(uIncl.y, -ev.y * uIncl.x);     // angle swept when the ray first meets the plane
      float u = 0.0, du = 1.0 / bb, u1 = -1.0, u2 = -1.0, uH = 2.0 / (ks * c4.w);
      float h1 = phi1 / 20.0;
      bool dead = false;
      for (int k = 0; k < 20; k++) {
        float acc = -u + 1.5 * u * u;
        float um = u + du * h1 + 0.5 * acc * h1 * h1;
        float acc2 = -um + 1.5 * um * um;
        du += 0.5 * (acc + acc2) * h1; u = um;
        if (u >= uH) { dead = true; break; }
      }
      if (!dead) {
        u1 = u;
        float h2 = 3.14159265 / 24.0;
        for (int k = 0; k < 24; k++) {
          float acc = -u + 1.5 * u * u;
          float um = u + du * h2 + 0.5 * acc * h2 * h2;
          float acc2 = -um + 1.5 * um * um;
          du += 0.5 * (acc + acc2) * h2; u = um;
          if (u >= uH || u <= 0.0) { dead = true; break; }
        }
        if (!dead) u2 = u;
      }
      float sp = sin(phi1), sg = b2.w, ad = chi * sg;
      float xi = -sg * d.x / Mpx * uIncl.x;             // the light's angular momentum: + from the disk's approaching side
      if (u1 > 0.0) {
        // direct image: move the sample from the flat projection to where the bent ray really lands
        gsrc += mix(-bend, ce + ev * (sp / (u1 * ks)) * rs - p, wt);
        gvis *= mix(1.0 - sh, 1.0, wt);
        gtint *= mix(vec3(1.0), diskLight(2.0 / (u1 * ks), ad, c4.z, xi), wt);
      } else {
        gsrc -= bend * (1.0 - wt);
        gvis *= mix(1.0 - sh, 0.0, wt);
      }
      if (u2 > 0.0) {
        float rr = sp / (u2 * ks);                         // radius of the second crossing, in r_s
        gas2 += gasAt(ce - ev * rr * rs) * diskLight(2.0 / (u2 * ks), ad, c4.z, xi) * wt * 0.85 * (1.0 - smoothstep(0.6 * TR, TR, rr));
      }
    } else {
      gsrc -= bend;
      gshadow = max(gshadow, sh);
    }
  }
  // near a shadow the lens squeezes many pixels of sky into one: average along the squeeze there, so it doesn't sparkle
  vec2 fx = dFdx(src), fy = dFdy(src), ax = dot(fx, fx) > dot(fy, fy) ? fx : fy;
  vec3 col = vec3(0.0);
  if (dot(ax, ax) > 2.25) { for (int k = 0; k < 6; k++) col += textureLod(uTex, (src + ax * ((float(k) + 0.5) / 6.0 - 0.5)) / uRes, 0.0).rgb; col /= 6.0; }
  else col = texture(uTex, src / uRes).rgb;
  col += add + ring;
  col *= (1.0 - shadow);
  col += gasAt(gsrc) * gtint * gvis * (1.0 - gshadow) + gas2;
  o = vec4(col, 1.0);
}`;

const FS_DOWN = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uPre;
out vec4 o;
vec3 pre(vec3 c){
  if (uPre < 0.5) return c;
  float l = max(c.r, max(c.g, c.b));
  return c * (smoothstep(0.7, 1.8, l) * 0.55 + 0.02);   // mostly the highlights, plus a breath of everything
}
void main(){
  vec2 uv = gl_FragCoord.xy * uTexel * 2.0;
  vec3 c = pre(texture(uTex, uv + uTexel * vec2(-1.0, -1.0)).rgb) + pre(texture(uTex, uv + uTexel * vec2(1.0, -1.0)).rgb)
         + pre(texture(uTex, uv + uTexel * vec2(-1.0, 1.0)).rgb) + pre(texture(uTex, uv + uTexel * vec2(1.0, 1.0)).rgb);
  o = vec4(c * 0.25, 1.0);
}`;
const FS_UP = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uTexel; uniform vec2 uOut;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uOut;
  vec3 c = texture(uTex, uv).rgb * 4.0;
  c += (texture(uTex, uv + uTexel * vec2(1.0, 0.0)).rgb + texture(uTex, uv - uTexel * vec2(1.0, 0.0)).rgb
      + texture(uTex, uv + uTexel * vec2(0.0, 1.0)).rgb + texture(uTex, uv - uTexel * vec2(0.0, 1.0)).rgb) * 2.0;
  c += texture(uTex, uv + uTexel).rgb + texture(uTex, uv - uTexel).rgb
     + texture(uTex, uv + uTexel * vec2(1.0, -1.0)).rgb + texture(uTex, uv + uTexel * vec2(-1.0, 1.0)).rgb;
  o = vec4(c / 16.0, 1.0);
}`;
const FS_FINAL = `#version 300 es
precision highp float;
uniform sampler2D uTex, uBloom; uniform vec2 uRes; uniform float uBloomK, uDither;
out vec4 o;
// Filmic curve: untouched up to the knee, so shadows and mid-tones keep their look (no crushed blacks), then the
// shoulder of the ACES fit (Narkowicz 2015) joined on with the same value and slope. Its long tail keeps gradation in
// highlights far above 1 instead of clipping them, and per channel it rolls saturated highlights toward white.
const float KN = 0.7;
float aces(float x){ return x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14); }
float filmic(float x){ return x <= KN ? x : KN + (1.0 - KN) * (aces(0.3559 + 0.53335 * (x - KN) / (1.0 - KN)) - 0.49957) / 0.53335; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = max(texture(uTex, uv).rgb + texture(uBloom, uv).rgb * uBloomK, 0.0);
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(c, vec3(l), smoothstep(1.2, 5.0, l) * 0.7);       // the very brightest things burn out toward white
  c = vec3(filmic(c.r), filmic(c.g), filmic(c.b));
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(c + (n - 0.5) / 255.0 * uDither, 1.0);           // a little dither so soft glows don't band
}`;
// Edge anti-aliasing after tone mapping (FXAA 3.11, Lottes): where the local contrast says there is an edge, decide
// whether it runs across or down, walk along it to both ends, and resample a fraction of a pixel across it according
// to where this pixel sits along the step. Flat areas are left alone; the sub-pixel blend is kept light so single-pixel
// stars stay crisp. Dither is added last.
const FS_FXAA = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes;
out vec4 o;
float L(vec2 uv){ return dot(texture(uTex, uv).rgb, vec3(0.299, 0.587, 0.114)); }
const float QS[5] = float[5](1.5, 2.0, 2.0, 4.0, 12.0);
void main(){
  vec2 px = 1.0 / uRes, uv = gl_FragCoord.xy * px;
  vec3 c = texture(uTex, uv).rgb;
  float lM = dot(c, vec3(0.299, 0.587, 0.114));
  float lN = L(uv + vec2(0.0, px.y)), lS = L(uv - vec2(0.0, px.y)), lE = L(uv + vec2(px.x, 0.0)), lW = L(uv - vec2(px.x, 0.0));
  float lMax = max(lM, max(max(lN, lS), max(lE, lW))), lMin = min(lM, min(min(lN, lS), min(lE, lW))), rng = lMax - lMin;
  if (rng > max(0.0312, lMax * 0.125)) {
    float lNW = L(uv + vec2(-px.x, px.y)), lNE = L(uv + px), lSW = L(uv - px), lSE = L(uv + vec2(px.x, -px.y));
    float lNS = lN + lS, lWE = lW + lE, lWs = lNW + lSW, lEs = lNE + lSE;
    float eH = abs(lWs - 2.0 * lW) + 2.0 * abs(lNS - 2.0 * lM) + abs(lEs - 2.0 * lE);
    float eV = abs(lSW + lSE - 2.0 * lS) + 2.0 * abs(lWE - 2.0 * lM) + abs(lNW + lNE - 2.0 * lN);
    bool hz = eH >= eV;                                  // the edge runs across the screen
    float l1 = hz ? lS : lW, l2 = hz ? lN : lE, g1 = l1 - lM, g2 = l2 - lM;
    bool s1 = abs(g1) >= abs(g2);
    float gs = 0.25 * max(abs(g1), abs(g2)), st = hz ? px.y : px.x, lLoc = 0.5 * ((s1 ? l1 : l2) + lM);
    if (s1) st = -st;
    vec2 e = uv + (hz ? vec2(0.0, 0.5 * st) : vec2(0.5 * st, 0.0)), off = hz ? vec2(px.x, 0.0) : vec2(0.0, px.y);
    vec2 u1 = e - off, u2 = e + off;
    float d1 = L(u1) - lLoc, d2 = L(u2) - lLoc;
    bool r1 = abs(d1) >= gs, r2 = abs(d2) >= gs;
    for (int i = 0; i < 5; i++) {
      if (r1 && r2) break;
      if (!r1) { u1 -= off * QS[i]; d1 = L(u1) - lLoc; r1 = abs(d1) >= gs; }
      if (!r2) { u2 += off * QS[i]; d2 = L(u2) - lLoc; r2 = abs(d2) >= gs; }
    }
    float a1 = hz ? uv.x - u1.x : uv.y - u1.y, a2 = hz ? u2.x - uv.x : u2.y - uv.y;
    bool near1 = a1 < a2;
    float f = ((near1 ? d1 : d2) < 0.0) != (lM < lLoc) ? 0.5 - min(a1, a2) / (a1 + a2) : 0.0;
    float sb = clamp(abs((2.0 * (lNS + lWE) + lWs + lEs) / 12.0 - lM) / rng, 0.0, 1.0);
    sb = (3.0 - 2.0 * sb) * sb * sb;
    f = max(f, sb * sb * 0.35);                          // sub-pixel blend (0.75 in the reference: softer stars)
    c = texture(uTex, uv + (hz ? vec2(0.0, f * st) : vec2(f * st, 0.0))).rgb;
  }
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(c + (n - 0.5) / 255.0, 1.0);
}`;
// Explosions (supernovae, novae, flares, kilonovae) as light on the GPU: drawn into the base layer before the lens,
// so a hole in front bends and hides them like everything else, and in HDR, so their cores stay far brighter than
// white and bloom instead of clipping as the 8-bit canvas did. Each is a few instanced quads: a soft radial glow
// whose colour stops are the canvas gradient's (kind 0) or a thin ring, the light front (kind 1). The hot core is
// boosted above what the canvas could hold; the fireball carries turbulent filaments when fine detail is on.
const VS_FX = `#version 300 es
in vec2 q;
in vec4 iA;   // x, y, radius across and up the screen (px)
in vec4 iB;   // light at the centre (colour × opacity), offset of the next stop; a ring: its colour, its width (px)
in vec4 iC;   // light at that stop, offset of the next
in vec4 iD;   // light at that stop (fading to none at the edge), kind: 0 glow, 1 ring
in vec4 iE;   // HDR core: gain, its radius (fraction of the glow's), turbulence, seed
uniform vec2 uRes;
out vec2 vL; flat out vec4 vA; flat out vec4 vB; flat out vec4 vC; flat out vec4 vD; flat out vec4 vE;
void main(){
  vec2 ext = iA.zw + (iD.w > 0.5 ? 2.0 * iB.w + 2.0 : 0.0);
  vL = q * ext; vA = iA; vB = iB; vC = iC; vD = iD; vE = iE;
  gl_Position = vec4((iA.xy + vL) / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_FX = `#version 300 es
precision highp float;
in vec2 vL; flat in vec4 vA; flat in vec4 vB; flat in vec4 vC; flat in vec4 vD; flat in vec4 vE;
uniform float uT, uDetail, uHDR;
out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ return vnoise(p) * 0.55 + vnoise(p * 2.1 + 3.7) * 0.3 + vnoise(p * 4.3 - 1.3) * 0.15; }
void main(){
  vec3 c;
  if (vD.w > 0.5) {   // the ring: distance to the ellipse in px (elliptical radius over its gradient), a soft line of that width
    vec2 e = vL / vA.zw; float d = length(e), g = length(e / vA.zw) / max(d, 1e-4), dist = (d - 1.0) / max(g, 1e-6);
    c = vB.rgb * exp(-2.77 * dist * dist / (vB.w * vB.w)) * (1.0 + vE.x * uHDR);
  } else {
    float t = length(vL) / vA.z;
    if (t >= 1.0) discard;
    c = t < vB.w ? mix(vB.rgb, vC.rgb, t / vB.w) : t < vC.w ? mix(vC.rgb, vD.rgb, (t - vB.w) / (vC.w - vB.w)) : vD.rgb * (1.0 - t) / max(1.0 - vC.w, 1e-4);
    c *= 1.0 + vE.x * uHDR * exp(-t * t / (vE.y * vE.y));   // the hot core
    if (vE.z > 0.0 && uDetail > 0.5) {   // clumps and filaments that expand with the fireball and slowly boil (the same light on average)
      float n = fbm(vL / vA.z * 6.0 + vE.w + uT * vec2(0.05, -0.04)) * 0.7 + fbm(vL / vA.z * 13.0 - vE.w - uT * vec2(0.03, 0.06)) * 0.3;
      c *= mix(1.0, 0.45 + 1.1 * n, vE.z * smoothstep(0.1, 0.55, t));
    }
  }
  o = vec4(c, 0.0);
}`;
// Jets as light on the GPU, added after the lens and before the bloom, so they glow in HDR like the disk they come from.
// One instanced quad per jet: a beam that narrows the way real jets do (width growing as distance^0.6, like M87's), with a
// thin hot spine inside a wider, edge-brightened sheath, filaments that stream outward, evenly spaced shock knots that
// pinch and brighten it as they ride out at the jet's apparent speed, a slow sideways sway that grows with distance, and a
// ragged end that spreads into a faint plume. A second kind is the beamed core of a jet seen nearly head-on.
const VS_JET = `#version 300 es
in vec2 q;
in vec4 iA;   // x, y of the hole (px), length (px), direction up (+1) or down (-1) the screen; 0: a head-on core of that radius
in vec4 iB;   // half-width at the base and at the end (px), radius hidden behind the hole (px, 0: in front), seed
in vec4 iC;   // spine and sheath brightness, how far the knots have moved (px), their spacing (px)
uniform vec2 uRes;
out vec2 vP; flat out vec4 vA; flat out vec4 vB; flat out vec4 vC;
void main(){
  vA = iA; vB = iB; vC = iC;
  if (iA.w == 0.0) { vP = q * iA.z; gl_Position = vec4((iA.xy + vP) / uRes * 2.0 - 1.0, 0.0, 1.0); return; }
  float hw = iB.y * 3.4 + 8.0, len = iA.z * 1.22 + 8.0;
  vP = vec2(q.x * hw, (q.y * 0.5 + 0.5) * len - 6.0);   // across, and along from the hole
  gl_Position = vec4((iA.xy + vec2(vP.x, iA.w * vP.y)) / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_JET = `#version 300 es
precision highp float;
in vec2 vP; flat in vec4 vA; flat in vec4 vB; flat in vec4 vC;
uniform float uFlow, uDetail, uHDR;
out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ return vnoise(p) * 0.55 + vnoise(p * 2.1 + 3.7) * 0.3 + vnoise(p * 4.3 - 1.3) * 0.15; }
const vec3 SPINE = vec3(0.86, 0.92, 1.0), SHEATH = vec3(0.42, 0.58, 1.0), HALO = vec3(0.34, 0.36, 0.95);
void main(){
  if (vA.w == 0.0) {   // seen nearly head-on: a beamed core in front of the shadow, like a blazar
    float r = length(vP) / vA.z;
    if (r >= 1.0) discard;
    float g = exp(-r * r * 7.0) * (1.0 - r) * (1.0 + 0.8 * uHDR * exp(-r * r * 60.0));
    o = vec4(mix(SHEATH, SPINE, exp(-r * r * 14.0)) * g * vC.x, 0.0); return;
  }
  float L = vA.z, s = vP.y / L, sc = clamp(s, 0.0, 1.0), w0 = vB.x, seed = vB.w;
  float detail = step(0.5, uDetail);
  // the stream: stretched along the jet, moving outward
  float yN = (vP.y - uFlow) / (w0 * 5.0 + 14.0);
  // shock knots: evenly spaced, riding outward; each pinches the beam and brightens its spine
  float kf = fract((vP.y - vC.z) / vC.w) - 0.5;
  float wk = vB.x + (vB.y - vB.x) * pow(sc, 0.62);
  float knot = exp(-kf * kf * vC.w * vC.w / (2.2 * wk * wk + 30.0)) * smoothstep(0.03, 0.12, s) * (1.0 - sc);
  float w = wk * (1.0 - 0.16 * knot) * (1.0 + 0.9 * smoothstep(0.72, 1.15, s));   // narrowing parabola, spreading into the plume
  float sway = detail * 0.5 * sc * sc * sin(sc * 7.0 - uFlow / (L * 0.9 + 40.0) * 6.2832 + seed * 6.2832)
             + detail * 0.22 * sc * (vnoise(vec2(seed * 9.0, yN * 0.35)) - 0.5);
  float x = vP.x / w - sway, ax = abs(x);
  float spine = exp(-x * x * 16.0);
  float sheath = exp(-x * x * 1.25) * (0.5 + 0.5 * smoothstep(0.2, 0.95, ax));   // brighter toward its edges, as radio maps show
  float halo = exp(-ax * 1.1) * 0.16;
  float fil = 1.0, wisp = 0.0, rag = 0.5;
  if (detail > 0.5) {
    float n = fbm(vec2(x * 2.6 + seed * 17.0, yN)) * 0.65 + fbm(vec2(x * 6.0 - seed * 5.0, yN * 2.3 + 4.0)) * 0.35;
    fil = mix(1.0, 0.3 + 1.45 * n, 0.8 * smoothstep(0.02, 0.25, sc));
    wisp = pow(vnoise(vec2(x * 5.0 + seed * 31.0 + sin(yN * 0.7) * 0.8, yN * 0.45)), 4.0) * 1.6 * smoothstep(0.05, 0.3, sc);
    rag = fbm(vec2(x * 1.4 + seed * 3.0, yN * 0.5));
  }
  float along = 1.0 / (1.0 + 4.5 * sc);                                   // fades with distance as it spreads
  float tip = 1.0 - smoothstep(0.5, 1.12, s + 0.34 * (rag - 0.5));        // a ragged end, not a cut
  float nozzle = exp(-vP.y * vP.y / (10.0 * w0 * w0 + 20.0)) * exp(-x * x * 2.5);
  float fadeIn = smoothstep(-6.0, 2.0, vP.y);
  float hid = vB.z > 0.0 ? smoothstep(vB.z * 0.92, vB.z * 1.5, length(vP)) : 1.0;   // the far jet starts behind the hole
  vec3 c = SHEATH * vC.y * 0.8 * (sheath * fil + wisp * sheath) * along
         + HALO * vC.y * halo * along
         + SPINE * (0.3 * vC.y + 0.6 * vC.x) * spine * (0.55 + 0.45 * fil) * (along + 0.45 * knot) * (1.0 + 0.7 * uHDR)
         + SPINE * (0.4 * vC.y + 0.5 * vC.x) * nozzle * 0.55 * (1.0 + 0.7 * uHDR);
  o = vec4(c * tip * fadeIn * hid, 0.0);
}`;
// Quality switches, one per costly stage, for a quality setting to turn off: edge anti-aliasing, surface detail (star
// and planet surfaces, explosion filaments). fx: explosions on the GPU; off draws them on the 2D canvas as the
// fallback does (kept to compare against).
const GFX = { aa: true, surface: true, fx: true };

function initGL() {
  try { gl = view.getContext('webgl2', { antialias:false, alpha:false, premultipliedAlpha:false, powerPreference:'high-performance' }); } catch (e) { gl = null; }
  return !!gl && buildGL();
}
// programs, vertex arrays and textures: everything the GPU holds. Built again when a lost context comes back.
function buildGL() {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const program = (vs, fs, attribs) => {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    attribs.forEach((n, i) => gl.bindAttribLocation(p, i, n));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, nm); }
    return { p, u };
  };
  try {
    GLR.base = program(VS_TRI, FS_BASE, ['p']);
    GLR.star = program(VS_STAR, FS_STAR, ['q', 'iA', 'iB', 'iC', 'iD']);
    GLR.gasP = program(VS_GAS, FS_GAS, ['q', 'iP', 'iC']);
    GLR.lensP = program(VS_TRI, FS_LENS, ['p']);
    GLR.down = program(VS_TRI, FS_DOWN, ['p']);
    GLR.up = program(VS_TRI, FS_UP, ['p']);
    GLR.fin = program(VS_TRI, FS_FINAL, ['p']);
    GLR.fxaa = program(VS_TRI, FS_FXAA, ['p']);
    GLR.fx = program(VS_FX, FS_FX, ['q', 'iA', 'iB', 'iC', 'iD', 'iE']);
    GLR.jet = program(VS_JET, FS_JET, ['q', 'iA', 'iB', 'iC']);
  } catch (e) { console.warn('WebGL2 shaders failed, using 2D fallback', e); return false; }
  HDR = !!gl.getExtension('EXT_color_buffer_float');
  // full-screen triangle
  GLR.triVAO = gl.createVertexArray(); gl.bindVertexArray(GLR.triVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  // instanced quads: one vertex array for stars (16 floats each), one for gas (8 floats each), one for explosions (20)
  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const instanced = (stride, sizes) => {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    let off = 0;
    sizes.forEach((n, i) => { gl.enableVertexAttribArray(i + 1); gl.vertexAttribPointer(i + 1, n, gl.FLOAT, false, stride * 4, off * 4); gl.vertexAttribDivisor(i + 1, 1); off += n; });
    return { vao, buf, cap: 0 };
  };
  GLR.starI = instanced(16, [4, 4, 4, 4]);
  GLR.gasI = instanced(8, [4, 4]);
  GLR.fxI = instanced(20, [4, 4, 4, 4, 4]);
  GLR.jetI = instanced(12, [4, 4, 4]);
  gl.bindVertexArray(null);
  // textures: the tiled sky (uploaded once) and the 2D effects canvas (uploaded only on frames that draw to it)
  const texture = (wrap) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  };
  GLR.texture = texture;
  GLR.skyTex = texture(gl.REPEAT);
  GLR.sceneTex = texture(gl.CLAMP_TO_EDGE);
  gl.disable(gl.DEPTH_TEST);
  return true;
}
// (re)build a render target; float when the device can render to it, so brightness above 1 is kept for the bloom
function glTarget(t, w, h, wrap, ldr) {
  w = Math.max(1, w); h = Math.max(1, h);
  if (t && t.w === w && t.h === h) return t;
  if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
  const tex = GLR.texture(wrap || gl.CLAMP_TO_EDGE);
  if (HDR && !ldr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (HDR && !ldr && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { // claimed float support but can't use it
    HDR = false; gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); return glTarget(null, w, h, wrap);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h };
}
function glTargets() {
  const W = view.width, H = view.height;
  GLR.tg.base = glTarget(GLR.tg.base, W, H, gl.MIRRORED_REPEAT);
  GLR.tg.gas = glTarget(GLR.tg.gas, W, H);
  GLR.tg.lens = glTarget(GLR.tg.lens, W, H);
  GLR.tg.ldr = glTarget(GLR.tg.ldr, W, H, null, true);   // the tone-mapped picture, for the anti-aliasing pass
  let w = W, h = H;
  for (let i = 0; i < 5; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); GLR.bloom[i] = glTarget(GLR.bloom[i], w, h); }
}
if (!initGL()) {
  if (gl) { const nv = view.cloneNode(); view.replaceWith(nv); view = nv; }
  gl = null; vctx = view.getContext('2d');
}

