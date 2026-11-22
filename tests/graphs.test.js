// The graphs panel: the light curve, mass over time and the HR diagram, sampled from the simulation (src/js/graphs.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser;
test.before(async () => { server = await serve(); browser = await launch(); });
test.after(async () => { await browser.close(); server.close(); });
const FRAME = 1000 / 60;

test('a supernova lights the curve up at the moment it explodes, and it fades', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(FRAME => {
    const rd = window.__rd; rd.load('betelgeuse', 1); rd.step(60, FRAME, false);
    const star = rd.bodies.find(b => b.kind === 'star'), before = rd.graphs.light();
    const tEx = rd.simTime; rd.explode(star);
    rd.step(720, FRAME, false);   // the flash lasts 11 s of wall time
    const L = rd.graphs.light(), ev = rd.events.find(e => e.title === 'Supernova');
    let pk = 0; for (let i = 0; i < L.t.length; i++) if (L.hi[i] > L.hi[pk]) pk = i;
    const oneSecond = 60 * FRAME / 1000;   // sim seconds in one second of frames (warp 1, 1x, no slow-motion)
    return { tEx, evT: ev && ev.t, tPeak: L.t[pk], peak: L.hi[pk], flashAtPeak: L.flash[pk], baseline: before.v[before.v.length - 1],
      last: L.v[L.v.length - 1], lastFlash: L.flash[L.flash.length - 1], oneSecond,
      decaying: L.v.slice(pk + 30).every((v, i, a) => i === 0 || v <= a[i - 1] * 1.0001) };
  }, FRAME);
  assert.equal(r.evT, r.tEx, 'the supernova notice is logged when it exploded');
  assert.ok(r.tPeak > r.tEx && r.tPeak - r.tEx < r.oneSecond, `peak ${r.tPeak - r.tEx} s after the explosion`);
  assert.ok(r.peak > 1e8 && r.peak / r.baseline > 1e3, `peak ${r.peak} L☉ over a ${r.baseline} L☉ red supergiant`);
  assert.ok(r.flashAtPeak > 0.9 * r.peak, 'the peak is the explosion');
  assert.ok(r.decaying, 'after the peak the light only fades');
  assert.ok(r.last < r.peak / 1e3, `faded to ${r.last} L☉`);
  assert.deepEqual(errors, []);
  await close();
});

test('novae make a repeating light curve: one flare per nova', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(FRAME => {
    const rd = window.__rd; rd.load('nova', 1); rd.step(1500, FRAME, false);
    const L = rd.graphs.light(), wd = rd.bodies.find(b => b.type && b.type.id === 'WD');
    let flares = 0; for (let i = 1; i < L.flash.length; i++) if (L.flash[i] > 1e3 && L.flash[i] > 3 * L.flash[i - 1]) flares++;
    return { flares, novae: wd.novae, quiet: Math.min(...L.v.slice(L.v.length >> 1)), peak: Math.max(...L.hi) };
  }, FRAME);
  assert.ok(r.novae >= 4, `${r.novae} novae`);
  assert.equal(r.flares, r.novae);
  assert.ok(r.peak / r.quiet > 100, `flares ${r.peak} over a quiet ${r.quiet} L☉`);
  assert.deepEqual(errors, []);
  await close();
});

test('a feeding hole\'s mass series rises and matches its real mass, from before anyone inspected it', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(FRAME => {
    const rd = window.__rd; rd.load('feeding', 1);
    const bh = rd.bodies.find(b => b.kind === 'bh'), m0 = bh.m;
    rd.step(900, FRAME, false);
    const M = rd.graphs.mass(bh.id) || { t: [NaN], v: [NaN] }; let falls = 0;
    for (let i = 1; i < M.v.length; i++) if (M.v[i] < M.v[i - 1]) falls++;
    // a merger's remnant carries on the history of the heavier hole it came from
    rd.load('gw150914', 1); const big = rd.bodies.reduce((a, b) => (b.m > a.m ? b : a)), mBig = big.m;
    let k = 0; while (rd.bodies.length > 1 && k++ < 200) rd.step(30, FRAME, false);
    const rem = rd.bodies[0], R = rd.graphs.mass(rem.id);
    return { m0, mNow: bh.m, first: M.v[0], firstT: M.t[0], last: M.v[M.v.length - 1], n: M.v.length, falls,
      merged: rd.bodies.length === 1, remFirst: R && R.v[0], remLast: R && R.v[R.v.length - 1], remM: rem.m, mBig };
  }, FRAME);
  assert.ok(r.n > 100, `${r.n} samples`);
  assert.ok(r.firstT < 0.05, 'the series starts with the scene, not when the hole was clicked');
  assert.ok(Math.abs(r.first - r.m0) < 1e-9);
  assert.equal(r.last, r.mNow, 'the newest sample is the hole\'s mass now');
  assert.ok(r.last - r.first > 0.01, `grew ${r.last - r.first} M☉`);
  assert.equal(r.falls, 0, 'a hole only gains mass');
  assert.ok(r.merged);
  assert.ok(Math.abs(r.remFirst - r.mBig) < 1e-9, `remnant history starts at ${r.remFirst}, the heavier hole was ${r.mBig}`);
  assert.equal(r.remLast, r.remM);
  assert.deepEqual(errors, []);
  await close();
});

test('aging a Sun-like star moves it on the HR diagram: up to the giants, then down to the white dwarfs', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(FRAME => {
    const rd = window.__rd; rd.load('zoo', 1); rd.step(5, FRAME, false);
    const g = rd.bodies.find(b => b.type && b.type.id === 'G'), at = () => rd.graphs.hr().find(p => p.id === g.id);
    const ms = at(), ref = rd.graphs.msLT(g.m);
    rd.ageStar(g); rd.step(90, FRAME, false); const mid = at();   // swelling takes 3.2 s
    rd.step(150, FRAME, false); const giant = at(), giantType = g.type.id;
    rd.ageStar(g); rd.step(5, FRAME, false); const wd = at(), wdType = g.type.id;
    return { ms, ref, mid, giant, giantType, wd, wdType, trail: rd.graphs.trail(g.id).length };
  }, FRAME);
  assert.ok(Math.abs(r.ms.T - r.ref[0]) < 1 && Math.abs(r.ms.L - r.ref[1]) < 1e-6, 'starts on the main sequence');
  assert.ok(r.ms.T > 5000 && r.ms.T < 6500 && r.ms.L > 0.5 && r.ms.L < 2, `Sun-like: ${r.ms.T} K, ${r.ms.L} L☉`);
  assert.equal(r.giantType, 'RG');
  assert.ok(r.giant.T < r.ms.T - 1000 && r.giant.L > 30 * r.ms.L, `giant: ${r.giant.T} K, ${r.giant.L} L☉`);
  assert.ok(r.mid.L > r.ms.L && r.mid.L < r.giant.L, 'it moves there while it swells, not in one jump');
  assert.equal(r.wdType, 'WD');
  assert.ok(r.wd.T > 2 * r.ms.T && r.wd.L < 0.1 * r.ms.L, `white dwarf: ${r.wd.T} K, ${r.wd.L} L☉`);
  assert.ok(r.trail >= 3, 'its track is kept');
  assert.deepEqual(errors, []);
  await close();
});

test('rewinding drops every sample after that moment; loading a scene clears the series', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(FRAME => {
    const rd = window.__rd; rd.load('feeding', 1); rd.step(300, FRAME, false);
    const mid = rd.simTime; rd.step(300, FRAME, false);
    const end = rd.simTime, bh = rd.bodies.find(b => b.kind === 'bh'), st = rd.bodies.find(b => b.kind === 'star');
    const before = { light: rd.graphs.light().t.length, mass: rd.graphs.mass(bh.id).t.length };
    rd.rewound(mid);
    const L = rd.graphs.light(), M = rd.graphs.mass(bh.id), tr = rd.graphs.trail(st.id);
    const after = { light: L.t.length, mass: M.t.length, maxT: Math.max(...L.t, ...M.t, ...tr.map(p => p[2])) };
    rd.step(60, FRAME, false); const resumed = rd.graphs.light().t.length;   // sampling carries on from there
    const oldIds = rd.bodies.map(b => b.id);
    rd.load('zoo', 1);
    const cleared = { light: rd.graphs.light().t.length, mass: oldIds.map(id => rd.graphs.mass(id)), hr: rd.graphs.hr().length };
    return { mid, end, before, after, resumed, cleared, zooStars: rd.bodies.filter(b => b.kind === 'star').length };
  }, FRAME);
  assert.ok(r.end > r.mid);
  assert.ok(r.after.maxT <= r.mid, `latest sample ${r.after.maxT} after rewinding to ${r.mid}`);
  assert.ok(r.after.light > 0 && r.after.light < r.before.light, `${r.after.light} of ${r.before.light} light samples kept`);
  assert.ok(r.after.mass > 0 && r.after.mass < r.before.mass);
  assert.ok(r.resumed > r.after.light);
  assert.equal(r.cleared.light, 0);
  assert.deepEqual(r.cleared.mass, r.cleared.mass.map(() => null), 'no mass history survives a new scene');
  assert.equal(r.cleared.hr, r.zooStars, 'the HR diagram shows only the new scene\'s stars');
  assert.deepEqual(errors, []);
  await close();
});

test('a series keeps the whole run in bounded memory without losing a brief spike', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(() => {
    const s = new window.__rd.graphs.Series(16, 2, true);
    for (let i = 0; i < 1000; i++) s.add(i, [i === 437 ? 1e6 : 1, i], 1);
    let peak = 0, at = -1; for (let i = 0; i < s.len; i++) if (s.Hi(i) > peak) { peak = s.Hi(i); at = s.V(1, i); }
    return { len: s.len, first: s.T(0), last: s.T(s.len - 1), peak, at };
  });
  assert.ok(r.len <= 17, `${r.len} samples kept`);
  assert.equal(r.first, 0); assert.equal(r.last, 999);
  assert.equal(r.peak, 1e6, 'the spike survives every merge');
  assert.equal(r.at, 437, 'with the other channels from the same moment');
  assert.deepEqual(errors, []);
  await close();
});

test('the panel opens with G or its button, draws only while open, reads out values, and hides in clean view', async () => {
  const { page, errors, close } = await openPage(browser, server);
  await page.evaluate(FRAME => { const rd = window.__rd; rd.load('nova', 1); rd.step(120, FRAME, false); }, FRAME);
  const closed = await page.evaluate(FRAME => { const rd = window.__rd, d0 = rd.graphs.draws; rd.step(20, FRAME, true); return { drew: rd.graphs.draws - d0, open: rd.graphs.isOpen }; }, FRAME);
  assert.equal(closed.open, false);
  assert.equal(closed.drew, 0, 'nothing is drawn while the panel is closed');
  await page.locator('#ui').focus();
  await page.keyboard.press('g');
  const opened = await page.evaluate(FRAME => {
    const rd = window.__rd, d0 = rd.graphs.draws; rd.step(20, FRAME, true);
    const cv = document.getElementById('grCv'), px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
    return { open: rd.graphs.isOpen, drew: rd.graphs.draws - d0, lit, expanded: document.getElementById('grHead').getAttribute('aria-expanded'),
      body: !document.getElementById('grBody').hidden, read: rd.graphs.read(), sum: rd.graphs.summary() };
  }, FRAME);
  assert.equal(opened.open, true); assert.equal(opened.expanded, 'true'); assert.ok(opened.body);
  assert.ok(opened.drew >= 20, `drew ${opened.drew} times in 20 frames`);
  assert.ok(opened.lit > 500, 'the curve is on the canvas');
  assert.match(opened.read, /L☉/);
  assert.match(opened.sum, /^Light curve over .* Now .* Suns/);
  // the keyboard walks the samples; the slider's value text follows
  await page.locator('#grCv').focus();
  await page.keyboard.press('Home');
  const first = await page.evaluate(() => document.getElementById('grCv').getAttribute('aria-valuetext'));
  await page.keyboard.press('ArrowRight');
  const second = await page.evaluate(() => document.getElementById('grCv').getAttribute('aria-valuetext'));
  assert.match(first, /^\d.* · .*L☉/); assert.notEqual(first, second);
  // tabs: the HR diagram, by click; then the mass graph by arrow key (clicked in the page: the first-visit tour may cover them)
  await page.evaluate(() => document.getElementById('grtab-hr').click());
  await page.locator('#grtab-hr').focus();
  const hr = await page.evaluate(() => ({ tab: window.__rd.graphs.tabNow, label: document.getElementById('grCv').getAttribute('aria-label'), sum: window.__rd.graphs.summary() }));
  assert.equal(hr.tab, 'hr'); assert.match(hr.label, /Hertzsprung/); assert.match(hr.sum, /2 stars/);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => window.__rd.graphs.tabNow), 'mass');
  // clean view hides it, and nothing is drawn meanwhile
  await page.locator('#ui').focus();
  await page.keyboard.press('h');
  const clean = await page.evaluate(FRAME => { const rd = window.__rd, d0 = rd.graphs.draws; rd.step(10, FRAME, true); return { shown: getComputedStyle(document.getElementById('graphs')).display !== 'none', drew: rd.graphs.draws - d0 }; }, FRAME);
  assert.deepEqual(clean, { shown: false, drew: 0 });
  await page.keyboard.press('h');
  await page.evaluate(() => document.getElementById('grHead').click());
  assert.equal(await page.evaluate(() => window.__rd.graphs.isOpen), false);
  assert.deepEqual(errors, []);
  await close();
});
