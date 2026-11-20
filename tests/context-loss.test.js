// A GPU reset takes the WebGL context away. The page has to stop drawing with it, ask for it back, rebuild everything
// it kept on the GPU and carry on drawing. WEBGL_lose_context simulates the reset.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser;
before(async () => { server = await serve(); browser = await launch(); });
after(async () => { await browser.close(); server.close(); });

// draw one frame and read it straight back (same task, before the browser clears the drawing buffer): mean RGB, 0-255
const brightness = page => page.evaluate(() => {
  __rd.step(1);
  const gl = __rd.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2];
  return s / (w * h * 3);
});

// count draw calls made on the context while `fn` runs
const countDraws = (page, frames) => page.evaluate(n => {
  const gl = __rd.gl, names = ['drawArrays', 'drawArraysInstanced', 'clear'], saved = {};
  let calls = 0;
  for (const k of names) { saved[k] = gl[k]; gl[k] = function (...a) { calls++; return saved[k].apply(this, a); }; }
  try { __rd.step(n); } finally { for (const k of names) delete gl[k]; }
  return calls;
}, frames);

for (const id of ['kerr', 'gw150914', 'solar']) {
  test(`${id}: after the WebGL context is lost and restored, the picture comes back with no errors`, async () => {
    const p = await openPage(browser, server);
    try {
      await p.page.evaluate(id => { __rd.load(id, 1); __rd.step(20); }, id);
      const before = await brightness(p.page);
      assert.ok(before > 2, `scene too dark to compare (${before})`);
      assert.ok(await countDraws(p.page, 1) > 0, 'a normal frame should draw');

      await p.page.evaluate(() => { window.lc = __rd.gl.getExtension('WEBGL_lose_context'); lc.loseContext(); });
      await p.page.waitForFunction(() => __rd.gl.isContextLost());
      const t0 = await p.page.evaluate(() => __rd.simTime);
      assert.equal(await countDraws(p.page, 30), 0, 'drew with a lost context');
      assert.ok(await p.page.evaluate(() => __rd.simTime) > t0, 'the simulation should keep running without the GPU');

      await p.page.evaluate(() => lc.restoreContext());
      await p.page.waitForFunction(() => !__rd.gl.isContextLost(), null, { timeout: 5000 });
      await p.page.evaluate(() => __rd.step(20));
      const after = await brightness(p.page);
      assert.ok(after > 0.5 * before, `picture did not come back: mean brightness ${after}, was ${before}`);
      assert.deepEqual(p.errors, []);
    } finally { await p.close(); }
  });
}

test('a resize while the context is lost does not break the restore', async () => {
  const p = await openPage(browser, server);
  try {
    await p.page.evaluate(() => { __rd.load('kerr', 1); __rd.step(10); });
    const before = await brightness(p.page);
    await p.page.evaluate(() => { window.lc = __rd.gl.getExtension('WEBGL_lose_context'); lc.loseContext(); });
    await p.page.waitForFunction(() => __rd.gl.isContextLost());
    await p.page.setViewportSize({ width: 700, height: 440 });
    await p.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));   // resize runs on the next frame
    await p.page.evaluate(() => lc.restoreContext());
    await p.page.waitForFunction(() => !__rd.gl.isContextLost(), null, { timeout: 5000 });
    await p.page.evaluate(() => __rd.step(10));
    const r = await p.page.evaluate(() => [__rd.gl.drawingBufferWidth, __rd.gl.drawingBufferHeight]);
    assert.deepEqual(r, [700, 440]);
    const after = await brightness(p.page);
    assert.ok(after > 0.5 * before, `picture did not come back: mean brightness ${after}, was ${before}`);
    assert.deepEqual(p.errors, []);
  } finally { await p.close(); }
});
