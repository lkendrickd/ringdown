// A star dropped next to a black hole: where it starts to lose gas, how much, and what the placement guide shows.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser, p;
before(async () => { server = await serve(); browser = await launch(); p = await openPage(browser, server); });
after(async () => { await p.close(); await browser.close(); server.close(); });

/* One star of type `tid` on a circular orbit round a 12 M☉ hole in empty space, at `k` times the separation where it
   exactly fills its Roche lobe (k < 1 overflows, k > 1 sits inside its lobe). Runs `frames` frames, sim only. */
const orbit = (tid, k, frames = 300) => p.page.evaluate(([tid, k, frames]) => {
  const rd = window.__rd; rd.load('empty', 1);
  const bh = rd.makeBH(0, 0, 0, 0, 12), st = rd.makeStar(tid, 0, 0, 0, 0);
  const fill = st.R / rd.rocheFrac(st.m / bh.m);
  st.x = k * fill; rd.setCircular(bh, st); rd.add(bh, st);
  const m0 = st.m, id = st.id;
  rd.step(frames, 1000 / 60, false);
  return { lost: m0 - st.m, gas: rd.gN, alive: rd.bodies.some(b => b.id === id), f: st.f, fed: bh.m - 12, fill, type: st.type.id };
}, [tid, k, frames]);

test('a Sun-like star overflowing its Roche lobe pours a stream onto the hole', async () => {
  const r = await orbit('G', 0.92);
  assert.ok(r.alive && r.f > 1, `still there and overflowing (f = ${r.f})`);
  assert.ok(r.lost > 0.02 && r.gas > 20, `lost ${r.lost} M☉ into ${r.gas} gas particles`);
});

test('a star a little outside that distance still leaks a thin wind to the hole', async () => {
  for (const tid of ['G', 'M', 'RG']) {
    const r = await orbit(tid, 1.4), full = await orbit(tid, 0.92);
    assert.ok(r.alive && r.f < 1, `${tid}: inside its lobe (f = ${r.f})`);
    assert.ok(r.lost > 0 && r.gas > 0, `${tid}: lost ${r.lost} M☉ into ${r.gas} gas particles`);
    assert.ok(r.lost < 0.5 * full.lost, `${tid}: a trickle (${r.lost}) next to the full stream (${full.lost})`);
  }
});

test('the wind from a star inside its lobe reaches the hole', async () => {
  const r = await orbit('G', 1.4, 1500);
  assert.ok(r.fed > 0, `the hole gained ${r.fed} M☉`);
});

test('a star well clear of the hole loses nothing', async () => {
  for (const tid of ['G', 'RG']) {
    const r = await orbit(tid, 2.5);
    assert.equal(r.lost, 0, `${tid}: mass lost`); assert.equal(r.gas, 0, `${tid}: gas particles`);
  }
});

test('a planet has no wind to lose: inside its lobe it keeps its mass', async () => {
  const r = await orbit('GAS', 1.4);
  assert.ok(r.f > 0.5 && r.f < 1, `inside its lobe, past half-full (f = ${r.f})`);
  assert.equal(r.lost, 0, 'mass lost'); assert.equal(r.gas, 0, 'gas particles');
});

test('the placement guide: leak, stream and tear distances follow the Roche lobe', async () => {
  const [g, fill, wd, ns] = await p.page.evaluate(() => {
    const rd = window.__rd; rd.load('empty', 1);
    const st = rd.makeStar('G', 0, 0, 0, 0);
    return [rd.feedRings('G', 12), st.R / rd.rocheFrac(st.m / 12), rd.feedRings('WD', 12), rd.feedRings('NS', 12)];
  });
  assert.ok(g, 'a guide exists for a Sun-like star');
  assert.ok(Math.abs(g.stream - fill) < 1e-9, `stream starts where the star fills its lobe (${g.stream} vs ${fill})`);
  assert.ok(Math.abs(g.tear - fill / 1.6) < 1e-9, 'torn apart at 1.6× overflow');
  assert.ok(Math.abs(g.leak - 2 * fill) < 1e-9, 'the wind starts at half-full');
  assert.equal(wd.leak, null, 'a white dwarf has no wind ring'); assert.ok(wd.stream > 0, 'but it still overflows');
  assert.equal(ns, null, 'no guide for a neutron star');
});

test('no page or console errors', () => assert.deepEqual(p.errors, []));
