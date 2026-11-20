// Every preset loads and runs without an error, on WebGL2 and on the 2D-canvas fallback; share links round-trip.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { serve, launch, openPage } = require('./helpers');

let server, browser;
before(async () => { server = await serve(); browser = await launch(); });
after(async () => { await browser.close(); server.close(); });

const FRAMES = 120;
// run one preset through the hook and report anything that is not a finite number afterwards
const runPreset = (page, id) => page.evaluate(([id, n]) => {
  __rd.load(id, 1); __rd.step(n);
  const bad = __rd.bodies.filter(b => ![b.m, b.x, b.y, b.vx, b.vy].every(Number.isFinite));
  return { simTime: __rd.simTime, bodies: __rd.bodies.length, bad: bad.length };
}, [id, FRAMES]);

async function everyPreset(t, opts) {
  const p = await openPage(browser, server, opts);
  try {
    const { presets, gl } = await p.page.evaluate(() => ({ presets: __rd.presets, gl: !!__rd.gl }));
    assert.equal(gl, !opts.noWebGL, opts.noWebGL ? 'expected the 2D fallback' : 'expected WebGL2');
    assert.ok(presets.length >= 20, `only ${presets.length} presets`);
    for (const id of presets) await t.test(id, async () => {
      const seen = p.errors.length;
      const r = await runPreset(p.page, id);
      assert.deepEqual(p.errors.slice(seen), [], `errors while running ${id}`);
      assert.equal(r.bad, 0, `${r.bad} bodies with non-finite state`);
      assert.ok(r.simTime > 0, 'time did not advance');
    });
  } finally { await p.close(); }
}

test(`every preset runs ${FRAMES} frames with no errors (WebGL2)`, t => everyPreset(t, {}));
test(`every preset runs ${FRAMES} frames with no errors (2D-canvas fallback)`, t => everyPreset(t, { noWebGL: true }));

test('the page starts and runs on its own animation loop without errors', async () => {
  const p = await openPage(browser, server);
  try {
    const t0 = await p.page.evaluate(() => __rd.simTime);
    await p.page.waitForFunction(t => __rd.simTime > t + 0.2, t0, { timeout: 15000 });
    assert.deepEqual(p.errors, []);
  } finally { await p.close(); }
});

const masses = st => st.b.map(a => a[0] === 'h' ? a[1] : a[2]);

test('share link: encode, decode and restore keep every body and its mass', async () => {
  const p = await openPage(browser, server);
  try {
    const r = await p.page.evaluate(async () => {
      __rd.load('solar', 3); __rd.step(30);
      const before = __rd.bodies.map(b => b.m);
      const code = await __rd.encodeState(), st = await __rd.decodeState(code);
      __rd.restore(st);
      return { code, before, decoded: st, after: __rd.bodies.map(b => b.m) };
    });
    assert.match(r.code, /^s1[zr]-[a-z2-7]+$/);
    assert.equal(r.decoded.b.length, r.before.length);
    assert.equal(r.after.length, r.before.length);
    r.before.forEach((m, i) => {
      assert.ok(Math.abs(masses(r.decoded)[i] / m - 1) < 1e-8, `decoded mass ${i}`);
      assert.ok(Math.abs(r.after[i] / m - 1) < 1e-8, `restored mass ${i}`);
    });
    assert.deepEqual(p.errors, []);

    // the same link opened as a fresh page
    const q = await openPage(browser, server, { hash: r.code });
    try {
      await q.page.waitForFunction(n => __rd.bodies.length === n && /Shared setup loaded/.test(document.getElementById('toasts').textContent), r.before.length, { timeout: 10000 });
      const m2 = await q.page.evaluate(() => __rd.bodies.map(b => b.m));
      r.before.forEach((m, i) => assert.ok(Math.abs(m2[i] / m - 1) < 1e-8, `mass ${i} after opening the link`));
      assert.deepEqual(q.errors, []);
    } finally { await q.close(); }
  } finally { await p.close(); }
});

// a link in the original format, made before links carried a random seed
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
function oldLink(state) {
  const bytes = zlib.deflateRawSync(Buffer.from(JSON.stringify(state)));
  let out = '', bits = 0, val = 0;
  for (const by of bytes) { val = (val << 8) | by; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return 's1z-' + out;
}

test('an old share link (version 1, no seed) still loads', async () => {
  const old = { v: 1, p: 'gw150914', w: 1, rs: 0, te: 2, t: 0, y: 0, z: 2.1, c: [0, 0], f: -1,
    b: [['h', 36, -44.6, 0, 0, -137.4, 0, ''], ['h', 29, 55.4, 0, 0, 170.6, 0, '']] };
  const p = await openPage(browser, server, { hash: oldLink(old) });
  try {
    await p.page.waitForFunction(() => /Shared setup loaded/.test(document.getElementById('toasts').textContent), null, { timeout: 10000 });
    const r = await p.page.evaluate(() => __rd.bodies.map(b => [b.kind, b.m]));
    assert.deepEqual(r, [['bh', 36], ['bh', 29]]);
    assert.deepEqual(p.errors, []);
  } finally { await p.close(); }
});
