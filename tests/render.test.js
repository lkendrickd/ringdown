// The GPU picture: every program builds, post-processing does what it claims, and the lensing matches the physics
// it is drawn from. Pixel checks read the WebGL canvas (or the float lensing target) straight back after a frame.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser, p;
before(async () => { server = await serve(); browser = await launch(); p = await openPage(browser, server); });
after(async () => { await p.close(); await browser.close(); server.close(); });

const PROGRAMS = ['base', 'star', 'gasP', 'lensP', 'down', 'up', 'fin', 'fxaa', 'fx'];

test('every GPU program compiles and links', async () => {
  const r = await p.page.evaluate(names => {
    const gl = __rd.gl, G = __rd.glr;
    return names.map(n => [n, !!(G[n] && gl.isProgram(G[n].p) && gl.getProgramParameter(G[n].p, gl.LINK_STATUS))]);
  }, PROGRAMS);
  assert.deepEqual(r.filter(([, ok]) => !ok).map(([n]) => n), []);
});

// Draw one frame with the lensing target replaced by test content right after the lensing pass, then read the screen.
// fill: [[x, y, w, h, value], ...] in pixels, drawn as grey rectangles on black; bloom off.
const postOf = (page, fill, aa = true) => page.evaluate(([fill, aa]) => {
  const gl = __rd.gl, G = __rd.glr, draw = gl.drawArrays;
  __rd.opt.bloom = false; __rd.gfx.aa = aa;
  gl.drawArrays = function (...a) {
    const r = draw.apply(this, a);
    if (gl.getParameter(gl.CURRENT_PROGRAM) === G.lensP.p) {
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.SCISSOR_TEST);
      for (const [x, y, w, h, v] of fill) { gl.scissor(x, y, w, h); gl.clearColor(v, v, v, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.disable(gl.SCISSOR_TEST);
    }
    return r;
  };
  try { __rd.render(); } finally { delete gl.drawArrays; __rd.opt.bloom = true; __rd.gfx.aa = true; }
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { w, h, px: Array.from(px.filter((_, i) => i % 4 === 1)) };   // green channel is enough for grey
}, [fill, aa]);

test('tone curve: shadows and mid-tones pass through unchanged, highlights roll off without clipping', async () => {
  await p.page.evaluate(() => { __rd.load('empty', 1); __rd.view({ x: 0, y: 0, zoom: 1, tilt: 0 }); });
  const vals = [0.02, 0.05, 0.3, 0.6, 1, 1.5, 3, 6, 12];
  const { w, px } = await postOf(p.page, vals.map((v, i) => [i * 60, 100, 60, 100, v]));
  const out = vals.map((v, i) => px[150 * w + i * 60 + 30]);
  vals.slice(0, 4).forEach((v, i) => assert.ok(Math.abs(out[i] - v * 255) <= 1.01, `${v} should pass through: got ${out[i]}, want ${v * 255}`));
  for (let i = 4; i < vals.length; i++) assert.ok(out[i] > out[i - 1], `brighter input ${vals[i]} should come out brighter than ${vals[i - 1]}: ${out}`);
  assert.ok(out[vals.length - 1] < 255, `12× white should still not clip: ${out}`);
  assert.ok(Math.abs(out[4] - 0.84 * 255) < 0.04 * 255, `1.0 maps to ${out[4]}: overall brightness should stay close to before (~0.86)`);
});

test('anti-aliasing smooths a jagged edge and leaves flat areas alone', async () => {
  // a shallow staircase: 0.5 below the edge y = 120 + x / 4, black above it
  const fill = []; for (let x = 0; x < 640; x += 4) fill.push([x, 0, 4, 120 + x / 4, 0.5]);
  const mid = r => { let n = 0; for (let x = 8; x < 632; x++) for (let y = 110; y < 290; y++) { const v = r.px[y * r.w + x]; if (v > 20 && v < 108) n++; } return n; };
  const flat = r => { let bad = 0; for (let x = 0; x < 640; x++) { const a = r.px[20 * r.w + x], b = r.px[380 * r.w + x]; if (Math.abs(a - 128) > 1 || b > 1) bad++; } return bad; };
  const on = await postOf(p.page, fill, true), off = await postOf(p.page, fill, false);
  assert.ok(mid(off) < 20, `without anti-aliasing the staircase should be hard: ${mid(off)} in-between pixels`);
  assert.ok(mid(on) > 300, `anti-aliasing should leave in-between pixels along the edge: ${mid(on)}`);
  assert.equal(flat(on), 0, 'flat areas should be untouched');
});

test('the picture is not black, with and without anti-aliasing, for several scenes', async () => {
  for (const id of ['kerr', 'gw150914', 'solar', 'zoo', 'magnetar']) {
    const r = await p.page.evaluate(id => {
      __rd.load(id, 2); __rd.step(20);
      const mean = () => { const gl = __rd.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return s / (w * h * 3); };
      __rd.render(); const a = mean(); __rd.gfx.aa = false; __rd.render(); const b = mean(); __rd.gfx.aa = true;
      return [a, b];
    }, id);
    assert.ok(r[0] > 2 && r[1] > 2, `${id}: picture too dark ${r}`);
    assert.ok(Math.abs(r[0] / r[1] - 1) < 0.05, `${id}: anti-aliasing should not change overall brightness ${r}`);
  }
});

test('after a lost WebGL context, every program and render target is rebuilt on the new one', async () => {
  const q = await openPage(browser, server);
  try {
    await q.page.evaluate(() => { __rd.load('kerr', 1); __rd.step(5); window.lc = __rd.gl.getExtension('WEBGL_lose_context'); lc.loseContext(); });
    await q.page.waitForFunction(() => __rd.gl.isContextLost());
    await q.page.evaluate(() => lc.restoreContext());
    await q.page.waitForFunction(() => !__rd.gl.isContextLost(), null, { timeout: 5000 });
    const r = await q.page.evaluate(names => {
      __rd.step(3);
      const gl = __rd.gl, G = __rd.glr;
      const progs = names.filter(n => !(G[n] && gl.isProgram(G[n].p) && gl.getProgramParameter(G[n].p, gl.LINK_STATUS)));
      const tg = Object.entries(G.tg).filter(([, t]) => !(gl.isTexture(t.tex) && gl.isFramebuffer(t.fbo) && t.w === gl.drawingBufferWidth && t.h === gl.drawingBufferHeight)).map(([k]) => k);
      const bloom = G.bloom.filter(t => !(gl.isTexture(t.tex) && gl.isFramebuffer(t.fbo))).length;
      return { progs, tg, bloom, keys: Object.keys(G.tg) };
    }, PROGRAMS);
    assert.deepEqual(r.progs, [], 'programs not rebuilt');
    assert.deepEqual(r.tg, [], 'render targets not rebuilt');
    assert.ok(r.keys.includes('ldr'), 'the anti-aliasing target should be among the rebuilt targets');
    assert.equal(r.bloom, 0);
    assert.deepEqual(q.errors, []);
  } finally { await q.close(); }
});

/* ---- lensing physics ---- */
// Exact Schwarzschild deflection angle (G = c = M = 1) for impact parameter b > 3√3, by direct quadrature of
// alpha = 2 ∫ du / sqrt(1/b² − u² + 2u³) − π from u = 0 to the turning point (substituting u = u0 − w²).
function deflection(b) {
  let r0 = b; for (let k = 0; k < 100; k++) r0 -= (r0 ** 3 - b * b * r0 + 2 * b * b) / (3 * r0 * r0 - b * b);
  const u0 = 1 / r0, W = Math.sqrt(u0), N = 4000, f = u => 1 / (b * b) - u * u + 2 * u ** 3;
  const gx = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526], gw = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538];
  let s = 0;
  for (let i = 0; i < N; i++) { const h = W / N / 2, m = W * (i + 0.5) / N; for (let k = 0; k < 4; k++) { const w = m + h * gx[k]; s += gw[k] * h * 2 * w / Math.sqrt(Math.max(f(u0 - w * w), 1e-300)); } }
  return 2 * s - Math.PI;
}
const DS = 5.445;   // the page's sky lens distance in r_s: the weak-field Einstein radius stays 3.3 r_s as before

// One hole, face-on, nothing but a sky whose every texel holds its own offset from the point behind the hole. The lensed
// picture then reads out, pixel by pixel, where on the sky each pixel's light came from. Returns that per pixel.
const skyMap = (page, m, chi, tilt) => page.evaluate(([m, chi, tilt]) => {
  __rd.load('empty', 1); __rd.add(__rd.makeBH(0, 0, 0, 0, m, chi)); __rd.view({ x: 0, y: 0, zoom: 2, tilt, yaw: 0 });
  __rd.opt.waves = false; __rd.render();
  const gl = __rd.gl, G = __rd.glr, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const bh = gl.getUniform(G.lensP.p, G.lensP.u.uBH), [hx, hy, rs] = bh;
  const [cY, sY, zx, zy] = G.skyT, qx = hx - W / 2, qy = (H - hy) - H / 2;
  const tx = cY * qx + sY * qy - zx, ty = -sY * qx + cY * qy - zy;     // the sky texel behind the hole (FS_BASE)
  const S = 1024, d = new Float32Array(S * S * 4), wrap = v => ((v % S) + S + S / 2) % S - S / 2;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const o = (j * S + i) * 4; d[o] = wrap(i + 0.5 - tx) / 64; d[o + 1] = wrap(j + 0.5 - ty) / 64; d[o + 3] = 1; }
  gl.bindTexture(gl.TEXTURE_2D, G.skyTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, S, S, 0, gl.RGBA, gl.FLOAT, d);
  __rd.render();
  const px = new Float32Array(W * H * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.tg.lens.fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { W, H, hx, hy, rs, src: Array.from(px.filter((_, i) => i % 4 < 2)).map(v => v * 64) };   // sky offset (x right, y down)
}, [m, chi, tilt]);

// where the pixel at radius b (r_s) along direction th shows the sky, measured along that direction, in r_s
function radialSource(map, b, th) {
  const x = Math.round(map.hx + b * map.rs * Math.cos(th) - 0.5), y = Math.round(map.hy + b * map.rs * Math.sin(th) - 0.5);
  const ex = x + 0.5 - map.hx, ey = y + 0.5 - map.hy, r = Math.hypot(ex, ey), o = (y * map.W + x) * 2;
  return { b: r / map.rs, s: (map.src[o] * ex - map.src[o + 1] * ey) / r / map.rs };
}

test('the sky is lensed by the exact Schwarzschild deflection: Einstein ring and the inverted second image', async t => {
  if (!await p.page.evaluate(() => !!__rd.gl.getExtension('EXT_color_buffer_float'))) return t.skip('no float render targets');
  const map = await skyMap(p.page, 40, 0, 0);
  assert.ok(map.rs > 15, `hole too small on screen to measure: r_s = ${map.rs} px`);
  let worst = 0;
  for (let k = 0; k < 8; k++) for (const b0 of [3.0, 3.4, 3.8, 4.2, 4.6, 5.5, 7, 9]) {
    const { b, s } = radialSource(map, b0, k * Math.PI / 4 + 0.3);
    const want = b - DS * deflection(2 * b) ;   // lens equation, radii in r_s (M = r_s / 2)
    worst = Math.max(worst, Math.abs(s - want));
    assert.ok(Math.abs(s - want) < 0.03 + 0.01 * Math.abs(want), `pixel at ${b.toFixed(3)} r_s shows the sky at ${s.toFixed(3)} r_s, lens equation says ${want.toFixed(3)}`);
  }
  // the Einstein ring: the radius that shows the point straight behind the hole
  let lo = 2.7, hi = 8; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (m - DS * deflection(2 * m) < 0) lo = m; else hi = m; }
  const ring = [];
  for (let k = 0; k < 16; k++) {
    const th = k * Math.PI / 8 + 0.1; let prev = null;
    for (let b = 3.0; b < 6; b += 0.02) { const q = radialSource(map, b, th); if (prev && prev.s < 0 && q.s >= 0) { ring.push(prev.b + (q.b - prev.b) * (-prev.s) / (q.s - prev.s)); break; } prev = q; }
  }
  assert.equal(ring.length, 16, 'no Einstein ring found in some directions');
  const mean = ring.reduce((a, v) => a + v, 0) / ring.length;
  assert.ok(Math.abs(mean / lo - 1) < 0.01, `Einstein ring at ${mean.toFixed(3)} r_s, exact ${lo.toFixed(3)} r_s (the old point lens put it at 3.3)`);
  // just outside the shadow, inside the ring, each pixel shows the sky on the far side of the hole: the inverted image
  for (let k = 0; k < 8; k++) assert.ok(radialSource(map, 3.2, k * Math.PI / 4).s < -0.3, 'inside the Einstein ring the sky should come from the opposite side');
  t.diagnostic(`Einstein ring ${mean.toFixed(4)} r_s (exact ${lo.toFixed(4)}); worst mapping error ${worst.toFixed(4)} r_s`);
});

const kerr = (page, chi, inc) => page.evaluate(([chi, inc]) => __rd.kerrShadow(chi, inc), [chi, inc]);
const R0 = c => c[0] + c[1] + c[2] + c[3] + c[4], RPI = c => c[0] - c[1] + c[2] - c[3] + c[4];   // shadow radius toward ±xs (M)

test('spin skews the lens: the side turning toward the viewer bends light less (frame dragging)', async t => {
  if (!await p.page.evaluate(() => !!__rd.gl.getExtension('EXT_color_buffer_float'))) return t.skip('no float render targets');
  const chi = 0.9, inc = 60, si = Math.sin(inc * Math.PI / 180), map = await skyMap(p.page, 100, chi, inc);
  const sh = await kerr(p.page, chi, inc), b = 5;   // r_s; the hole turns counter-clockwise, so its left side approaches
  const app = radialSource(map, b, Math.PI), rec = radialSource(map, b, 0);
  const dApp = app.b - app.s, dRec = rec.b - rec.s;   // how far each side's sky was bent, r_s
  // limits, in M: a non-spinning lens moved toward the receding side by a sin i (weak field, Asada & Kasai 2000), or by
  // the exact shadow's shift with impact parameters scaled to its outline (photon sphere); the page blends the two
  const DM = DS * 2, bc = 3 * Math.sqrt(3), al = x => deflection(Math.max(x, bc * 1.0001));
  const weak = DM * (al(2 * rec.b - chi * si) - al(2 * app.b + chi * si)) / 2;
  const ka = bc / R0(sh.c), kr = bc / RPI(sh.c), full = DM * (al((2 * rec.b + sh.shift) * kr) / kr - al((2 * app.b - sh.shift) * ka) / ka) / 2;
  t.diagnostic(`bent ${dApp.toFixed(3)} r_s on the approaching side, ${dRec.toFixed(3)} on the receding side; difference ${(dRec - dApp).toFixed(3)}, limits ${weak.toFixed(3)}..${full.toFixed(3)}`);
  assert.ok(dRec - dApp > 0.95 * weak, `receding side should be bent more by at least the weak-field amount ${weak.toFixed(3)} r_s: got ${(dRec - dApp).toFixed(3)}`);
  assert.ok(dRec - dApp < 1.05 * full, `but not more than the photon-sphere limit ${full.toFixed(3)} r_s: got ${(dRec - dApp).toFixed(3)}`);
});

// One hole with a black sky; the gas layer replaced by test content just before the lensing pass. kinds: 'none',
// 'uniform', or a number r (r_s): a thin ring of gas at that radius in the orbital plane. Returns, for each kind, the
// lensed brightness (green) along 16 directions from the hole, sampled every 0.25 px out to 7 r_s.
const diskProfiles = (page, o) => page.evaluate(o => {
  __rd.load('empty', 1); __rd.add(__rd.makeBH(0, 0, 0, 0, o.m, o.chi));
  if (o.cw) __rd.addGas(30 * 0.25 * o.m, 0, 0, 100, 1e-6);   // a little gas orbiting clockwise far out sets the disk's sense
  __rd.view({ x: 0, y: 0, zoom: 2, tilt: o.tilt || 0, yaw: 0 }); __rd.opt.waves = false;
  const gl = __rd.gl, G = __rd.glr, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  gl.bindTexture(gl.TEXTURE_2D, G.skyTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  __rd.render();
  const [hx, hy, rs] = gl.getUniform(G.lensP.p, G.lensP.u.uBH), ci = Math.cos((o.tilt || 0) * Math.PI / 180), out = {};
  for (const kind of o.kinds) {
    const data = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, dx = x + 0.5 - hx, dy = (y + 0.5 - hy) / ci;
      data[i] = data[i + 1] = data[i + 2] = kind === 'uniform' ? 1 : kind === 'none' ? 0 : Math.exp(-(((Math.hypot(dx, dy) - kind * rs) / 0.7) ** 2));
      data[i + 3] = 1;
    }
    const draw = gl.drawArrays;
    gl.drawArrays = function (...a) {
      if (gl.getParameter(gl.CURRENT_PROGRAM) === G.lensP.p) {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.tg.gas.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.FLOAT, data);
      }
      return draw.apply(this, a);
    };
    try { __rd.render(); } finally { delete gl.drawArrays; }
    const px = new Float32Array(W * H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.tg.lens.fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const at = (x, y) => {   // bilinear, pixel centres at +0.5
      const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, g = (i, j) => px[((y0 + j) * W + x0 + i) * 4 + 1];
      return (g(0, 0) * (1 - tx) + g(1, 0) * tx) * (1 - ty) + (g(0, 1) * (1 - tx) + g(1, 1) * tx) * ty;
    };
    out[kind] = [];
    for (let k = 0; k < 16; k++) {
      const th = k * Math.PI / 8 + (o.th0 == null ? 0.05 : o.th0), row = [];
      for (let b = 0.5 * rs; b < 7 * rs; b += 0.25) row.push(at(hx + b * Math.cos(th), hy + b * Math.sin(th)));
      out[kind].push(row);
    }
  }
  return { rs, out };
}, o);
// radius (r_s) of the outermost clear peak of a profile: the direct image of a ring (its far-side image lies inside)
function ringRadius(row, rs) {
  const top = Math.max(...row); let i = row.length - 2;
  while (i > 0 && !(row[i] > 0.4 * top && row[i] >= row[i - 1] && row[i] >= row[i + 1])) i--;
  const a = row[i - 1], b = row[i], c = row[i + 1], d = (a - c) / (2 * (a - 2 * b + c) || 1);
  return (0.5 * rs + (i + d) * 0.25) / rs;
}
const valueAt = (row, rs, b) => { const f = (b * rs - 0.5 * rs) / 0.25, i = Math.floor(f), t = f - i; return row[i] * (1 - t) + row[i + 1] * t; };
// the brightest point of a profile within ±0.12 r_s of b (r_s)
const peakNear = (row, rs, b) => { let m = 0; for (let x = b - 0.12; x <= b + 0.12; x += 0.01) m = Math.max(m, valueAt(row, rs, x)); return m; };
// Face-on, where the direct image of a ring at radius r (r_s) appears: the Schwarzschild ray that has swept 90° when
// it reaches r (escaping rays only, so r > 2.15 r_s). Independent of the page: a fine Verlet integration of u'' = −u + 1.5u².
function faceOnImage(r) {
  const land = bb => { let u = 0, du = 1 / bb; const n = 4000, h = Math.PI / 2 / n; for (let k = 0; k < n; k++) { const a = -u + 1.5 * u * u, um = u + du * h + 0.5 * a * h * h; du += 0.5 * (a - um + 1.5 * um * um) * h; u = um; } return u; };
  let lo = 2.5981, hi = 20; for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (land(m) > 1 / r) lo = m; else hi = m; } return lo;
}

test("the lensed disk's inner edge is the ISCO for the hole's spin and the disk's sense", async t => {
  if (!await p.page.evaluate(() => !!__rd.gl.getExtension('EXT_color_buffer_float'))) return t.skip('no float render targets');
  // face-on; thin rings of gas at 0.85, 1 and 1.2 × the ISCO. (Prograde ISCOs much below 6 M only show through rays
  // that dive inside the photon sphere, overlapping the disk's far-side image; a = 0.1 is the largest kept clean here.)
  const cases = [{ name: 'prograde a = 0.1', chi: 0.1, a: 0.1 }, { name: 'no spin', chi: 0, a: 0 },
    { name: 'retrograde: χ = 0.6, disk clockwise', chi: 0.6, cw: true, a: -0.6 }, { name: 'retrograde a = 0.9', chi: -0.9, a: -0.9 }];
  const seen = {};
  for (const c of cases) {
    const rI = await p.page.evaluate(a => __rd.riscoM(a), c.a) / 2;   // r_s
    const f = [0.85, 1, 1.2], r = await diskProfiles(p.page, { m: 40, chi: c.chi, cw: c.cw, kinds: ['none', ...f.map(x => x * rI)] });
    const P = f.map(x => { const b = faceOnImage(x * rI); return r.out[x * rI].map((row, k) => peakNear(row.map((v, j) => v - r.out.none[k][j]), r.rs, b)); });
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length, lo = P[0].map((v, k) => v / P[2][k]), mid = P[1].map((v, k) => v / P[2][k]);
    t.diagnostic(`${c.name}: ISCO ${rI.toFixed(3)} r_s; gas there shines ${mean(mid).toFixed(3)}, at 0.85 × ISCO ${mean(lo).toFixed(3)} of its brightness at 1.2 × ISCO`);
    assert.ok(Math.min(...P[2]) > 0.2, `${c.name}: gas at 1.2 × ISCO should shine: ${P[2].map(v => v.toFixed(2))}`);
    assert.ok(Math.max(...lo) < 0.06, `${c.name}: gas at 0.85 × ISCO should be dark: ${lo.map(v => v.toFixed(2))}`);
    mid.forEach(v => assert.ok(v > 0.2 && v < 0.65, `${c.name}: gas at the ISCO should sit on the edge: ${v.toFixed(3)}`));
    seen[c.name] = { rI, P };
  }
  // the same ring of gas, at 0.85 × the retrograde ISCO (3.7 r_s): dark round the retrograde hole, bright round a still one
  const r = await diskProfiles(p.page, { m: 40, chi: 0, kinds: ['none', 0.85 * seen['retrograde a = 0.9'].rI] });
  const b = faceOnImage(0.85 * seen['retrograde a = 0.9'].rI), still = r.out[0.85 * seen['retrograde a = 0.9'].rI].map((row, k) => peakNear(row.map((v, j) => v - r.out.none[k][j]), r.rs, b));
  assert.ok(Math.min(...still) > 10 * Math.max(...seen['retrograde a = 0.9'].P[0]), `a ring at 3.7 r_s: ${still[0].toFixed(3)} round a still hole, ${seen['retrograde a = 0.9'].P[0][0].toFixed(3)} round a retrograde one`);
});

test('the side of the disk coming toward the viewer is brighter, by the Kerr redshift of a circular orbit', async t => {
  if (!await p.page.evaluate(() => !!__rd.gl.getExtension('EXT_color_buffer_float'))) return t.skip('no float render targets');
  const inc = 60, si = Math.sin(inc * Math.PI / 180), r0 = 5;   // r_s: a ring of gas at 10 M
  const r = await diskProfiles(p.page, { m: 40, chi: 0, tilt: inc, th0: 0, kinds: ['none', 'uniform', r0] });
  // directions 0 and 8 run right and left along the screen's horizontal through the hole; a counter-clockwise disk
  // comes toward the viewer on the left. Where the ring's image crosses them, the light left the disk at r0.
  const sub = (kind, k) => r.out[kind][k].map((v, j) => v - r.out.none[k][j]);
  const out = [];
  for (const [k, sgn] of [[0, -1], [8, 1]]) {
    const b = ringRadius(sub(r0, k), r.rs), I = valueAt(sub('uniform', k), r.rs, b);
    const xi = sgn * b * 2 * si, M = 2 * r0, g = Math.sqrt(1 - 3 / M) / (1 - xi / M ** 1.5);   // M units
    out.push({ b, I, g });
  }
  const want = (out[1].g / out[0].g) ** 3, got = out[1].I / out[0].I;
  t.diagnostic(`image of the ring at ${out[0].b.toFixed(3)} / ${out[1].b.toFixed(3)} r_s; approaching / receding brightness ${got.toFixed(3)}, Kerr g³ ratio ${want.toFixed(3)}`);
  assert.ok(Math.abs(out[0].b / out[1].b - 1) < 0.01, 'a non-spinning hole should lens both sides alike');
  assert.ok(got > 2, `approaching side should be much brighter: ${got}`);
  assert.ok(Math.abs(got / want - 1) < 0.06, `brightness ratio ${got.toFixed(3)} should match (g+/g−)³ = ${want.toFixed(3)}`);
});

test('the shadow is still the exact Kerr outline (Bardeen 1973)', async t => {
  for (const [chi, inc] of [[0, 0], [0.9, 60], [-0.6, 80]]) {
    const r = await p.page.evaluate(([chi, inc]) => {
      __rd.load('empty', 1); __rd.add(__rd.makeBH(0, 0, 0, 0, 40, chi)); __rd.view({ x: 0, y: 0, zoom: 2, tilt: inc, yaw: 0 }); __rd.opt.waves = false;
      const gl = __rd.gl, G = __rd.glr, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      gl.bindTexture(gl.TEXTURE_2D, G.skyTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      __rd.render();
      const px = new Float32Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, G.tg.lens.fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const [hx, hy, rs] = gl.getUniform(G.lensP.p, G.lensP.u.uBH), row = Math.floor(hy), col = Math.floor(hx);
      const v = (x, y) => px[(y * W + x) * 4 + 1];
      // half-darkness crossings along the row and the column through the hole
      const cross = (x0, y0, dx, dy) => { let x = x0, y = y0; while (v(x, y) < 0.5) { x += dx; y += dy; } const a = v(x - dx, y - dy), b = v(x, y); return (dx ? x - dx : y - dy) + 0.5 + (0.5 - a) / (b - a) * (dx || dy); };
      return { rs, hx, hy, left: cross(col, row, -1, 0), right: cross(col, row, 1, 0), down: cross(col, row, 0, -1), up: cross(col, row, 0, 1) };
    }, [chi, inc]);
    const sh = await kerr(p.page, chi, inc), M = r.rs / 2, s = chi >= 0 ? 1 : -1;
    // xs runs toward the approaching side, which is screen left for counter-clockwise spin
    const wantW = (R0(sh.c) + RPI(sh.c)) * M, gotW = r.right - r.left;
    const cx = r.hx - s * sh.shift * M, gotC = (r.left + r.right) / 2;
    const Rv = sh.c[0] - sh.c[2] + sh.c[4];   // radius straight up from the centre
    t.diagnostic(`χ ${chi}, i ${inc}°: width ${gotW.toFixed(2)} px (exact ${wantW.toFixed(2)}), centre ${gotC.toFixed(2)} (exact ${cx.toFixed(2)})`);
    assert.ok(Math.abs(gotW - wantW) < 1.2, `χ ${chi}, i ${inc}°: shadow width ${gotW.toFixed(2)} px, exact ${wantW.toFixed(2)}`);
    assert.ok(Math.abs(gotC - cx) < 0.8, `χ ${chi}, i ${inc}°: shadow centre ${gotC.toFixed(2)}, exact ${cx.toFixed(2)}`);
    if (Math.abs(sh.shift) < 0.05) assert.ok(Math.abs(r.up - r.down - 2 * Rv * M) < 1.2, `χ ${chi}, i ${inc}°: height ${(r.up - r.down).toFixed(2)}, exact ${(2 * Rv * M).toFixed(2)}`);
  }
});

/* ---- star and planet surfaces ---- */
// The Sun (real size) centred on screen R px across; the star shader's clock forced to t; the lensing target read back.
// Returns the texture of its disc: mean |difference| between neighbouring pixels inside 0.8 R, and the raw pixels there.
const sunSurface = (page, R, t, surface = true) => page.evaluate(([R, t, surface]) => {
  __rd.load('solar', 1); const sun = __rd.bodies.find(b => b.label === 'Sun');
  __rd.view({ x: sun.x, y: sun.y, zoom: R / sun.R, tilt: 0 }); __rd.opt.bloom = false; __rd.gfx.surface = surface;
  const gl = __rd.gl, G = __rd.glr, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, draw = gl.drawArraysInstanced;
  gl.drawArraysInstanced = function (...a) { if (gl.getParameter(gl.CURRENT_PROGRAM) === G.star.p) gl.uniform1f(G.star.u.uT, t); return draw.apply(this, a); };
  try { __rd.render(); } finally { delete gl.drawArraysInstanced; __rd.opt.bloom = true; __rd.gfx.surface = true; }
  const px = new Float32Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, G.tg.lens.fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const cx = W / 2, cy = H / 2, vals = []; let tex = 0, n = 0;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > 0.8 * R) continue;
    const i = (y * W + x) * 4; vals.push(px[i + 1]); tex += Math.abs(px[i + 1] - px[i + 5]); n++;
  }
  return { tex: tex / n, vals };
}, [R, t, surface]);

test('a star seen up close shows its surface; the quality switch turns that detail off', async t => {
  if (!await p.page.evaluate(() => !!__rd.gl.getExtension('EXT_color_buffer_float'))) return t.skip('no float render targets');
  const on = await sunSurface(p.page, 120, 3), off = await sunSurface(p.page, 120, 3, false);
  t.diagnostic(`pixel-to-pixel texture across the Sun's disc: ${on.tex.toFixed(4)} with surface detail, ${off.tex.toFixed(4)} without`);
  assert.ok(on.tex > 2 * off.tex, `granulation should show on a Sun 240 px across: ${on.tex} vs ${off.tex} without detail`);
});

test('a star a few pixels across does not shimmer: its pixels hold still from frame to frame', async t => {
  if (!await p.page.evaluate(() => !!__rd.gl.getExtension('EXT_color_buffer_float'))) return t.skip('no float render targets');
  const a = await sunSurface(p.page, 4, 3), b = await sunSurface(p.page, 4, 4.5), big = [await sunSurface(p.page, 120, 3), await sunSurface(p.page, 120, 4.5)];
  const change = (u, v) => Math.max(...u.vals.map((x, i) => Math.abs(x - v.vals[i]) / Math.max(x, 1e-3)));
  t.diagnostic(`largest change 1.5 s apart: ${change(a, b).toFixed(4)} at 4 px, ${change(big[0], big[1]).toFixed(4)} at 120 px`);
  assert.ok(change(big[0], big[1]) > 0.05, 'up close the surface should boil');
  assert.ok(change(a, b) < 0.01, `at 4 px across it should hold still: ${change(a, b)}`);
});

test('no page or console errors', () => assert.deepEqual(p.errors, []));
