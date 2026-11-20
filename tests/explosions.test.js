// Explosions on the GPU: supernovae, novae, flares and kilonovae are drawn by their own shader into the float base layer,
// before the lens and the bloom, so their cores keep brightness far above 1. GFX.fx = false draws them on the 2D canvas
// as before (and as the fallback without WebGL2 does): every check here compares the two.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser, p;
before(async () => { server = await serve(); browser = await launch(); p = await openPage(browser, server); });
after(async () => { await p.close(); await browser.close(); server.close(); });

// Set the red supergiant of the Betelgeuse scene off as a supernova, centred on screen, and run ms of wall time (drawing
// only the last frame). Runs in the page; returns nothing.
const BOOM = (ms, seed = 1) => {
  __rd.load('betelgeuse', seed); __rd.gfx.fx = true;
  const st = __rd.bodies.find(b => b.kind === 'star' && b.m >= 8);
  __rd.view({ x: st.x, y: st.y, zoom: 2, tilt: 0 });
  __rd.explode(st);
  const n = Math.round(ms / (1000 / 60)); __rd.step(n - 1, 1000 / 60, false); __rd.step(1);
};
// Draw the frame again with the explosion pass on or off and measure it, around the screen centre: the brightest value in
// the float base layer 25-80 px out (clear of the remnant left at the centre), the share of the screen that came out
// white, and the mean brightness (0-255) within 160 px.
const MEASURE = fx => {
  __rd.gfx.fx = fx; __rd.render();
  const gl = __rd.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, cx = W / 2, cy = H / 2;
  const scr = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, scr);
  let white = 0, sum = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = scr[(y * W + x) * 4 + 1]; if (g >= 250) white++;
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 160) { sum += g; n++; }
  }
  let peak = -1;
  if (gl.getExtension('EXT_color_buffer_float')) {
    const px = new Float32Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, __rd.glr.tg.base.fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    peak = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d > 25 && d < 80) peak = Math.max(peak, px[(y * W + x) * 4 + 1]); }
  }
  __rd.gfx.fx = true;
  return { peak, white: white / (W * H), mean: sum / n, fxN: __rd.fxN };
};
const hasFloat = page => page.evaluate(() => !!__rd.gl.getExtension('EXT_color_buffer_float'));

test('a supernova puts light far above 1 into the float layer; drawn on the canvas, as before, it clips at 1', async t => {
  if (!await hasFloat(p.page)) return t.skip('no float render targets');
  const r = await p.page.evaluate(([B, M]) => { new Function(B)(); const on = new Function('return ' + M)()(true), off = new Function('return ' + M)()(false); return { on, off }; },
    [`(${BOOM})(150)`, `${MEASURE}`]);
  t.diagnostic(`150 ms in, 25-80 px from the centre: brightest ${r.on.peak.toFixed(2)} with the explosion pass, ${r.off.peak.toFixed(2)} on the canvas`);
  assert.ok(r.on.fxN >= 2, `the pass should draw the explosion: ${r.on.fxN} instances`);
  assert.ok(r.on.peak > 3, `the hot core should go far above 1: ${r.on.peak}`);
  assert.ok(r.off.peak <= 1.01, `drawn on the 8-bit canvas it cannot pass 1: ${r.off.peak}`);
});

test('the final picture of a supernova is brighter and its glow wider than the canvas version', async t => {
  const r = await p.page.evaluate(([B, M]) => { new Function(B)(); const m = new Function('return ' + M)(); return { on: m(true), off: m(false) }; },
    [`(${BOOM})(150)`, `${MEASURE}`]);
  t.diagnostic(`white ${(100 * r.on.white).toFixed(1)}% of the screen vs ${(100 * r.off.white).toFixed(1)}%; mean within 160 px ${r.on.mean.toFixed(1)} vs ${r.off.mean.toFixed(1)}`);
  assert.ok(r.on.white > 1.3 * r.off.white, `more of the screen should burn out white: ${r.on.white} vs ${r.off.white}`);
  assert.ok(r.on.mean > r.off.mean + 3, `brighter around the explosion: ${r.on.mean} vs ${r.off.mean}`);
});

test('with WebGL2 the explosion is drawn once: not also on the 2D canvas', async () => {
  // the 2D effects canvas, 60-120 px from the explosion (clear of the remnant's pulsar beams), all the way round
  const r = await p.page.evaluate(B => {
    new Function(B)();
    const canvasAt = () => { const c = __rd.scene, x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let a = 0;
      for (let k = 0; k < 16; k++) for (const rr of [60, 90, 120]) { const px = Math.round(c.width / 2 + rr * Math.cos(k * 0.3927)), py = Math.round(c.height / 2 + rr * Math.sin(k * 0.3927)); a = Math.max(a, d[(py * c.width + px) * 4 + 3]); } return a; };
    __rd.gfx.fx = true; __rd.render(); const on = { canvas: canvasAt(), fxN: __rd.fxN };
    __rd.gfx.fx = false; __rd.render(); const off = { canvas: canvasAt(), fxN: __rd.fxN }; __rd.gfx.fx = true;
    return { on, off };
  }, `(${BOOM})(500)`);
  assert.ok(r.on.fxN > 0, 'the GPU pass should draw it');
  assert.equal(r.on.canvas, 0, 'and the canvas should hold nothing of it');
  assert.equal(r.off.fxN, 0, 'with the pass off the GPU draws nothing');
  assert.ok(r.off.canvas > 20, `and the canvas draws it (the check can see it there): alpha ${r.off.canvas}`);
});

test('novae, magnetar flares and kilonovae go through the same pass', async () => {
  const r = await p.page.evaluate(() => {
    const out = {};
    const run = (name, setup) => {
      __rd.load(name, 1); __rd.step(5); const where = setup();
      __rd.view({ x: where[0], y: where[1], zoom: where[2], tilt: 0 }); __rd.step(10);
      // gradients drawn on the 2D effects canvas during one frame (the canvas version draws each explosion with them)
      const grads = fx => { __rd.gfx.fx = fx; const C = CanvasRenderingContext2D.prototype, g = C.createRadialGradient; let n = 0;
        C.createRadialGradient = function (...a) { n++; return g.apply(this, a); }; try { __rd.render(); } finally { C.createRadialGradient = g; __rd.gfx.fx = true; } return n; };
      const on = grads(true), fxN = __rd.fxN, off = grads(false);
      out[name] = { fxN, flashes: __rd.flashes.length, on, off };
    };
    run('nova', () => { const wd = __rd.bodies.find(b => b.kind === 'star' && b.type.kind === 'wd'); wd.layer = 1e-5; __rd.nova(wd); return [wd.x, wd.y, 14]; });
    run('magnetar', () => { const ns = __rd.bodies.find(b => b.kind === 'star' && b.type.kind === 'ns'); __rd.magnetarFlare(ns); return [ns.x, ns.y, 3]; });
    run('bns', () => { const a = __rd.bodies.filter(b => b.kind === 'star'), x = (a[0].x + a[1].x) / 2, y = (a[0].y + a[1].y) / 2; __rd.addKilonova(x, y, 0.28, 0.01, 0, 0); return [x, y, 12]; });
    return out;
  });
  for (const [k, v] of Object.entries(r)) {
    assert.ok(v.flashes > 0 && v.fxN > 0, `${k}: drawn by the explosion pass: ${JSON.stringify(v)}`);
    assert.equal(v.on, 0, `${k}: not on the canvas as well`);
    assert.ok(v.off > 0, `${k}: with the pass off the canvas draws it (the check can see it there): ${JSON.stringify(v)}`);
  }
});

test('several explosions at once each get their light; past the cap the oldest are left out', async t => {
  if (!await hasFloat(p.page)) return t.skip('no float render targets');
  const r = await p.page.evaluate(() => {
    __rd.load('empty', 1);
    const xs = [-60, 0, 60], stars = xs.map(x => __rd.makeStar('O', x, 0, 0, 0)); __rd.add(...stars);
    __rd.view({ x: 0, y: 0, zoom: 2.5, tilt: 0 });
    stars.forEach(s => __rd.explode(s)); __rd.step(4);
    const gl = __rd.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = new Float32Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, __rd.glr.tg.base.fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const each = xs.map(x => px[((H >> 1) * W + Math.round(W / 2 + x * 2.5)) * 4 + 1]);
    // 20 more, newer, each two instances (glow and starting flash): only the newest 12 are drawn, the supernovae not at all
    for (let i = 0; i < 20; i++) __rd.flashes.push({ x: 0, y: 0, t0: __rd.wallNow, dur: 5000, scale: 0.5 });
    __rd.render();
    return { each, fxN: __rd.fxN, all: __rd.flashes.length };
  });
  t.diagnostic(`centres ${r.each.map(v => v.toFixed(2))}; with ${r.all} in flight, ${r.fxN} instances drawn`);
  r.each.forEach((v, i) => assert.ok(v > 1.5, `explosion ${i}: its centre should be far above 1: ${v}`));
  assert.equal(r.fxN, 24, `capped at the newest 12 explosions: ${r.fxN} instances`);
  assert.deepEqual(p.errors, []);
});

test('without WebGL2 the canvas still draws the supernova', async () => {
  const q = await openPage(browser, server, { noWebGL: true });
  try {
    const r = await q.page.evaluate(() => {
      const mean = () => { const c = document.getElementById('view'), x = c.getContext('2d'), W = c.width, H = c.height, d = x.getImageData(W / 2 - 100, H / 2 - 100, 200, 200).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i + 1]; return s / (d.length / 4); };
      __rd.load('betelgeuse', 1);
      const st = __rd.bodies.find(b => b.kind === 'star' && b.m >= 8);
      __rd.view({ x: st.x, y: st.y, zoom: 2, tilt: 0 });
      __rd.explode(st); __rd.step(30); const during = mean(), flashes = __rd.flashes.length;
      __rd.flashes.length = 0; __rd.render(); const without = mean();   // the same frame without the explosion's light
      return { gl: !!__rd.gl, during, without, flashes };
    });
    assert.equal(r.gl, false, 'the fallback should be running');
    assert.ok(r.flashes > 0, 'the explosion should be in flight');
    assert.ok(r.during > r.without + 40, `the explosion should light up the canvas: mean ${r.during}, ${r.without} without it`);
    assert.deepEqual(q.errors, []);
  } finally { await q.close(); }
});

test('after a lost WebGL context the explosion pass is rebuilt and draws again', async t => {
  if (!await hasFloat(p.page)) return t.skip('no float render targets');
  const q = await openPage(browser, server);
  try {
    await q.page.evaluate(() => { __rd.load('kerr', 1); __rd.step(5); window.lc = __rd.gl.getExtension('WEBGL_lose_context'); lc.loseContext(); });
    await q.page.waitForFunction(() => __rd.gl.isContextLost());
    await q.page.evaluate(() => lc.restoreContext());
    await q.page.waitForFunction(() => !__rd.gl.isContextLost(), null, { timeout: 5000 });
    const r = await q.page.evaluate(([B, M]) => {
      new Function(B)();
      const gl = __rd.gl, G = __rd.glr;
      return { prog: gl.isProgram(G.fx.p) && gl.getProgramParameter(G.fx.p, gl.LINK_STATUS), vao: gl.isVertexArray(G.fxI.vao), on: new Function('return ' + M)()(true) };
    }, [`(${BOOM})(150)`, `${MEASURE}`]);
    assert.ok(r.prog && r.vao, 'the program and its vertex array should belong to the new context');
    assert.ok(r.on.peak > 3, `the explosion should blaze again: ${r.on.peak}`);
    assert.deepEqual(q.errors, []);
  } finally { await q.close(); }
});

test('quality presets: Low turns anti-aliasing and surface detail off, Medium only detail, High and Auto keep both', async () => {
  const want = { low: [false, false], medium: [true, false], high: [true, true], auto: [true, true] };
  for (const [mode, [aa, surface]] of Object.entries(want)) {
    const r = await p.page.evaluate(([mode, B]) => {
      document.querySelector(`input[name=quality][value=${mode}]`).click();   // the settings panel's control
      new Function(B)();
      const gl = __rd.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
      __rd.render(); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i + 1];
      return { aa: __rd.gfx.aa, surface: __rd.gfx.surface, mean: s / (W * H), note: document.getElementById('qNote').textContent };
    }, [mode, `(${BOOM})(400)`]);
    assert.equal(r.aa, aa, `${mode}: anti-aliasing`);
    assert.equal(r.surface, surface, `${mode}: surface detail`);
    assert.ok(r.mean > 20, `${mode}: the frame should render: mean ${r.mean}`);
    assert.match(r.note, new RegExp(`anti-aliasing ${aa ? 'on' : 'off'} · surface detail ${surface ? 'on' : 'off'}`), `${mode}: the note should say so`);
  }
  await p.page.evaluate(() => document.querySelector('input[name=quality][value=auto]').click());
});

test('no page or console errors', () => assert.deepEqual(p.errors, []));
