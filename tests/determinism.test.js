// Same seed, same preset, same fixed-length frames: the same scene, to the last bit. A different seed: a different one.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser, p;
before(async () => { server = await serve(); browser = await launch(); p = await openPage(browser, server); });
after(async () => { await p.close(); await browser.close(); server.close(); });

const run = (id, seed, frames) => p.page.evaluate(([id, seed, frames]) => { __rd.load(id, seed); __rd.step(frames); return __rd.state(); }, [id, seed, frames]);

// chaos: random masses, spins and speeds when it is built; feeding: random jitter on every bit of gas the star sheds;
// magnetar: a random rubble ring, random spin and flare times
for (const id of ['chaos', 'feeding', 'magnetar']) {
  test(`${id}: same seed replays exactly, another seed does not`, async () => {
    const a = await run(id, 42, 150), b = await run(id, 42, 150), c = await run(id, 43, 150);
    assert.ok(a.b.length > 0);
    assert.deepEqual(b, a, 'same seed, different result');
    assert.notDeepEqual(c, a, 'different seed, same result');
  });
}

test('a fresh page replays the same seed exactly (nothing carries over from start-up)', async () => {
  const a = await run('feeding', 42, 150);
  const q = await openPage(browser, server);
  try {
    const b = await q.page.evaluate(() => { __rd.load('feeding', 42); __rd.step(150); return __rd.state(); });
    assert.ok(a.g[0].length > 0, 'expected some gas to compare');
    assert.deepEqual(b, a);
    assert.deepEqual(q.errors, []);
  } finally { await q.close(); }
});

test('a share link carries the seed: the same link replays exactly, a different seed does not', async () => {
  const r = await p.page.evaluate(() => {
    __rd.load('feeding', 7); __rd.step(60);
    const st = JSON.parse(JSON.stringify(__rd.snapshot()));
    const play = s => { __rd.open(s); __rd.step(150); return __rd.state(); };
    const other = { ...st, r: ((st.r >>> 0) ^ 0x5bd1e995) >>> 0 };
    return { hasSeed: Number.isInteger(st.r), a: play(st), b: play(st), c: play(other) };
  });
  assert.ok(r.hasSeed, 'snapshot has no seed field');
  assert.deepEqual(r.b, r.a, 'same link, different result');
  assert.notDeepEqual(r.c, r.a, 'different seed, same result');
});

test('no page or console errors', () => assert.deepEqual(p.errors, []));
