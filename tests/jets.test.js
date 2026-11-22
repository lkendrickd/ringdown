// Jets drawn as light on the GPU (FS_JET): they add light on both sides of the hole, more on the side aimed at the viewer,
// with soft edges; the Jets switch turns them off; and without WebGL2 the flat fallback still draws without errors.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser;
test.before(async () => { server = await serve(); browser = await launch(); });
test.after(async () => { await browser.close(); server.close(); });

// A spinning hole with its jet on full, seen at the given tilt; returns the light (r+g+b, linear, before bloom) in the
// picture as rows of numbers: a column up the jet's axis and one row across it, with the jets on and off.
const probe = (tilt) => `(() => {
  const rd = window.__rd, gl = rd.gl, G = rd.glr;
  rd.load('empty', 3); const b = rd.makeBH(0, 0, 0, 0, 24, 0.95); rd.add(b);
  const v = rd.view({ x: 0, y: 0, zoom: 1.2, tilt: ${tilt}, yaw: 0 });
  rd.step(2, 1000 / 60, false); b.grbT = rd.wallNow;   // a gamma-ray-burst jet: full power for the next 2.6 s
  const W = v.W, H = v.H, cx = Math.round(W / 2), cy = Math.round(H / 2);
  const grab = () => { rd.render(); const px = new Float32Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, G.tg.lens.fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const at = (x, y) => { const i = 4 * (y * W + x); return px[i] + px[i + 1] + px[i + 2]; };
    const col = []; for (let y = 0; y < H; y++) col.push(at(cx, y));
    const off = Math.round(Math.min(0.5 * rd.jetShape(b).L * v.RS, 0.3 * H)), row = []; for (let x = cx - 60; x <= cx + 60; x++) row.push(at(x, cy + off));
    return { col, row, off }; };
  const out = { W, H, cy, power: rd.jetPower(b), n: rd.packJets(v.RS, H) };
  rd.opt.jets = true; out.on = grab(); out.again = grab();
  rd.opt.jets = false; out.offp = grab(); rd.opt.jets = true;
  return out;
})()`;
const sum = (a, i, j) => { let s = 0; for (let k = Math.max(0, i); k < Math.min(a.length, j); k++) s += a[k]; return s; };

test('a jet adds light on both sides of the hole, more on the side aimed at the viewer; the Jets switch removes it', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(probe(60));
  assert.ok(r.power > 0.9 && r.n >= 2, `jet power ${r.power}, ${r.n} instances`);
  const d = r.on.col.map((v, i) => v - r.offp.col[i]);            // the light the jets add, up the axis (GL rows: up the screen is higher y)
  const near = sum(d, r.cy + 30, r.cy + 110), far = sum(d, r.cy - 110, r.cy - 30);
  assert.ok(near > 20, `light added toward the viewer: ${near}`);
  assert.ok(far > 2, `light added on the far side: ${far}`);
  assert.ok(near > 1.5 * far, `the side aimed at the viewer is brighter (${near} against ${far})`);
  assert.ok(Math.max(...d.map(Math.abs)) > 0.5, 'bright enough to see');
  assert.deepEqual(errors, []);
  await close();
});

test('a jet has soft edges and stands still while the simulation does', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(probe(75));
  const d = r.on.row.map((v, i) => v - r.offp.row[i]), peak = Math.max(...d);
  assert.ok(peak > 0.2, `light across the jet halfway out: peak ${peak}`);
  let step = 0; for (let i = 1; i < d.length; i++) step = Math.max(step, Math.abs(d[i] - d[i - 1]));
  assert.ok(step < 0.4 * peak, `no hard edge: the biggest jump between neighbouring pixels is ${(step / peak).toFixed(2)} of the peak`);
  assert.ok(d[0] < 0.06 * peak && d[d.length - 1] < 0.06 * peak, 'it fades to nothing at the sides');
  assert.deepEqual(r.on.col, r.again.col, 'drawn twice without the simulation advancing: the same picture');
  assert.deepEqual(errors, []);
  await close();
});

test('without WebGL2 the flat jets still draw without errors', async () => {
  const { page, errors, close } = await openPage(browser, server, { noWebGL: true });
  const r = await page.evaluate(() => {
    const rd = window.__rd; rd.load('empty', 3); const b = rd.makeBH(0, 0, 0, 0, 24, 0.95); rd.add(b);
    rd.view({ x: 0, y: 0, zoom: 1.2, tilt: 60, yaw: 0 }); rd.step(2); b.grbT = rd.wallNow; rd.step(3);
    const c = document.getElementById('ui'), x = c.getContext('2d'), X = Math.round(c.width / 2), Y = Math.round(c.height / 2 - 60 * (c.width / innerWidth));
    return { gl: !!rd.gl, alpha: x.getImageData(X, Y, 1, 1).data[3] };
  });
  assert.equal(r.gl, false);
  assert.ok(r.alpha > 20, `the overlay has the jet drawn on it (alpha ${r.alpha})`);
  assert.deepEqual(errors, []);
  await close();
});
