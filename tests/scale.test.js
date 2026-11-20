// Simulation scale: the particle caps, the budgets the frame-time governor moves, scenes built on a bigger budget
// (more, lighter grains, same mass), the Barnes–Hut cell gravity, and how step cost grows with particle count.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser, p;
before(async () => { server = await serve(); browser = await launch(); p = await openPage(browser, server); });
after(async () => { await p.close(); await browser.close(); server.close(); });
const ev = (fn, arg) => p.page.evaluate(fn, arg);

test('caps: 20,000 gas, 28,000 loose matter, 96 bodies; the governor works under gasMax and matMax', async () => {
  const c = await ev(() => __rd.caps);
  assert.equal(c.MAXG, 20000); assert.equal(c.MAXM, 28000); assert.equal(c.BODY_CAP, 96);
  assert.equal(c.gasMax, 19200); assert.equal(c.matMax, 28000); assert.equal(c.MAT0, 7000);
});

test('governor: budgets climb to their ceilings with headroom, hold between 10 and 20 ms, fall back when frames are slow', async () => {
  const r = await ev(() => {
    __rd.load('empty', 1);
    const up = __rd.govern(4, 4000), hold = __rd.govern(15, 400), down = __rd.govern(40, 4000);
    return { up, hold, down, low: __rd.govern(4, 0) };
  });
  assert.deepEqual(r.up, [19200, 28000], 'cheap frames should raise both budgets to gasMax and matMax');
  assert.deepEqual(r.hold, r.up, 'a frame cost inside the 10-20 ms band should leave the budgets alone');
  assert.deepEqual(r.down, [900, 7000], 'slow frames should drop gas to 900 and matter back to the old 7000 cap');
});

test('gas: a disk of 15,000 particles (three times the old cap) runs without errors or non-finite values', async () => {
  const seen = p.errors.length;
  const r = await ev(() => {
    __rd.load('empty', 1);
    __rd.add(__rd.makeBH(0, 0, 0, 0, 10, 0.5));
    const G = 1.5e5;
    for (let k = 0; k < 15000; k++) { const rr = 40 + 130 * __rd.rand(), a = 6.2832 * __rd.rand(), v = Math.sqrt(G * 10 / rr); __rd.addGas(rr * Math.cos(a), rr * Math.sin(a), Math.sin(a) * v, -Math.cos(a) * v, 1e-6, 0); }
    const n0 = __rd.gN; __rd.step(3); __rd.step(20, undefined, false);   // drawn, then sim only
    const g = __rd.state().g;
    return { n0, n: __rd.gN, bad: g.flat().filter(v => !Number.isFinite(v)).length };
  });
  assert.equal(r.n0, 15000, `only ${r.n0} gas particles fit`);
  assert.ok(r.n > 12000, `the disk fell to ${r.n} particles`);
  assert.equal(r.bad, 0);
  assert.deepEqual(p.errors.slice(seen), []);
});

test('matter: 24,000 grains round a star (over three times the old cap) run without errors or non-finite values', async () => {
  const seen = p.errors.length;
  const r = await ev(() => {
    __rd.budget(undefined, 28000); __rd.load('empty', 1);
    const st = __rd.makeStar('G', 0, 0, 0, 0); __rd.add(st);
    const G = 1.5e5;
    for (let k = 0; k < 24000; k++) { const rr = 30 + 150 * __rd.rand(), a = 6.2832 * __rd.rand(), v = Math.sqrt(G * st.m / rr); __rd.addMatter(rr * Math.cos(a), rr * Math.sin(a), Math.sin(a) * v, -Math.cos(a) * v, 1e-11, 0); }
    const n0 = __rd.qN; __rd.step(3); __rd.step(40, undefined, false);
    const q = __rd.state().q;
    __rd.budget(undefined, 7000);
    return { n0, n: __rd.qN, bad: q.flat().filter(v => !Number.isFinite(v)).length };
  });
  assert.equal(r.n0, 24000, `only ${r.n0} grains fit`);
  assert.ok(r.n > 14000, `the belt fell to ${r.n} grains`);   // some stick together or fall on the star; still twice the old cap
  assert.equal(r.bad, 0);
  assert.deepEqual(p.errors.slice(seen), []);
});

// total loose-matter mass and grain count of a scene, built on the old budget and on the new ceiling
const build = (id, frames) => ev(([id, frames]) => {
  const out = [];
  for (const m of [7000, 28000]) {
    __rd.budget(undefined, m); __rd.load(id, 5); __rd.speed = 6;
    let n = 0; if (frames) while (__rd.qN === 0 && n < frames) { __rd.step(1, 50, false); n++; }
    const q = __rd.state().q[4];
    out.push({ n: q.length, mass: q.reduce((s, v) => s + v, 0), scale: __rd.caps.qScale, frame: n });
  }
  __rd.budget(undefined, 7000);
  return out;
}, [id, frames]);

for (const id of ['nursery', 'solar', 'magnetar']) {
  test(`${id}: on four times the budget, four times the grains and the same total mass`, async () => {
    const [a, b] = await build(id, 0);
    assert.equal(a.scale, 1); assert.equal(b.scale, 4);
    assert.equal(b.n, 4 * a.n, `${a.n} grains, then ${b.n}`);
    assert.ok(Math.abs(b.mass / a.mass - 1) < 1e-9, `mass ${a.mass} became ${b.mass}`);
  });
}

test('saturn: a moon torn apart makes four times the ring grains, with the moon’s whole mass', async () => {
  const r = await ev(() => [7000, 28000].map(m => {
    __rd.budget(undefined, m); __rd.load('saturn', 5);
    const sat = __rd.bodies.find(b => b.label === 'Saturn'), moon = __rd.bodies.find(b => b.label === 'Icy moon'), mm = moon.m;
    __rd.ringFrom(moon, sat, Math.hypot(moon.x - sat.x, moon.y - sat.y));
    const q = __rd.state().q[4];
    __rd.budget(undefined, 7000);
    return { n: q.length, mass: q.reduce((s, v) => s + v, 0), moon: mm, gone: !__rd.bodies.includes(moon) };
  }));
  const [a, b] = r;
  assert.ok(a.gone && b.gone && a.n > 0, 'no ring formed');
  assert.equal(b.n, 4 * a.n);
  for (const x of r) assert.ok(Math.abs(x.mass / x.moon - 1) < 1e-9, `ring mass ${x.mass}, moon ${x.moon}`);
});

// (the impact itself, called just before contact: inside a frame some debris falls straight back)
// The giant impact keeps its grain count on every budget: with four times as many lighter grains the debris gathered
// into a smaller Moon (median 0.70 lunar masses over 12 seeds, against 0.85), so it is left as it was.
test('theia: the impact throws off the same debris on any budget', async () => {
  const [a, b] = await ev(() => [7000, 28000].map(m => {
    __rd.budget(undefined, m); __rd.load('theia', 5);
    const [e, th] = __rd.bodies;
    let n = 0; while (Math.hypot(th.x - e.x, th.y - e.y) > 1.5 * (e.R + th.R) && n < 2000) { __rd.step(1, 50, false); n++; }
    __rd.planetImpact(e, th);
    const q = __rd.state().q[4];
    __rd.budget(undefined, 7000);
    return { n: q.length, mass: q.reduce((s, v) => s + v, 0), frame: n, th: th.m };
  }));
  assert.ok(a.n > 100, `only ${a.n} debris grains`);
  assert.equal(a.frame, b.frame, 'the bodies met on a different frame');
  assert.equal(b.n, a.n);
  assert.ok(b.mass === a.mass && a.mass < a.th, `debris mass ${a.mass} became ${b.mass}`);
});

test('a scene built on the bigger budget still replays exactly from its seed', async () => {
  const r = await ev(() => {
    __rd.budget(undefined, 28000);
    const run = draw => { __rd.load('nursery', 42); __rd.step(30, undefined, draw); return JSON.stringify(__rd.state()); };
    const a = run(true), b = run(true), c = run(false);
    __rd.budget(undefined, 7000);
    return [a === b, a === c];
  });
  assert.ok(r[0], 'same seed, different result');
  assert.ok(r[1], 'stepping without drawing changed the result');
});

// The README: given a few minutes at 16x or 64x, the impact usually ends as one Moon of roughly 0.7 to 1.5 lunar masses,
// 3 to 4 Earth radii out. On the bigger budget (where the other scenes use four times the grains) it still should, and
// exactly as on the old one (1200 frames at 64x is about 6 minutes at 16x).
test('theia: on the bigger budget the debris still gathers into one Moon like the real one, exactly as before', async t => {
  const rows = [];
  for (const seed of [1, 2, 3]) rows.push(await ev(seed => {
    __rd.budget(undefined, 28000); __rd.load('theia', seed); __rd.speed = 6; __rd.step(1200, 50, false);
    const e = __rd.bodies.find(b => b.label === 'Proto-Earth'), moon = __rd.bodies.find(b => b.label === 'Moon');
    const others = __rd.bodies.filter(b => b !== e && b !== moon && b.type && b.type.kind === 'planet').reduce((s, b) => s + b.m, 0);
    __rd.budget(undefined, 7000);
    return { seed, scale: __rd.caps.qScale, m: moon ? +(moon.m / 3.694e-8).toFixed(2) : 0, rE: moon ? +(Math.hypot(moon.x - e.x, moon.y - e.y) * __rd.KM_PER_UNIT / 6371).toFixed(2) : 0, others: +(others / 3.694e-8).toFixed(3) };
  }, seed));
  t.diagnostic(JSON.stringify(rows));
  const same = await ev(() => [7000, 28000].map(m => { __rd.budget(undefined, m); __rd.load('theia', 2); __rd.speed = 6; __rd.step(1200, 50, false); __rd.budget(undefined, 7000); return JSON.stringify(__rd.state()); }));
  assert.ok(same[0] === same[1], 'seed 2 played out differently on the bigger budget');
  const ok = rows.filter(r => r.m >= 0.5 && r.m <= 1.6 && r.rE >= 2.5 && r.rE <= 4.5);
  assert.ok(rows.every(r => r.scale === 4), 'not built on the bigger budget');
  assert.ok(ok.length >= 2, `seeds with a Moon of 0.5-1.6 lunar masses at 2.5-4.5 Earth radii: ${ok.length} of 3 ${JSON.stringify(rows)}`);
});

test('Barnes–Hut cell gravity: within 1% (rms) of the every-pair sum on 3,000 cells, and faster', async t => {
  const runs = [];
  await ev(() => __rd.treeCheck(3000));   // warm-up: the first call also compiles both loops
  for (let k = 0; k < 5; k++) runs.push(await ev(() => __rd.treeCheck(3000)));
  const med = f => runs.map(f).sort((a, b) => a - b)[2];
  t.diagnostic(JSON.stringify(runs));
  assert.ok(med(r => r.rms) < 0.01, `rms force error ${med(r => r.rms)}`);
  assert.ok(med(r => r.p99) < 0.05, `99th-percentile force error ${med(r => r.p99)}`);
  assert.ok(med(r => r.worst) < 0.1, `worst force error, over the rms force: ${med(r => r.worst)}`);
  assert.ok(med(r => r.tree / r.direct) < 0.6, `tree took ${med(r => r.tree / r.direct)} of the every-pair time`);
});

// Cost per particle of the sim steps alone (no drawing), at the old cap and at four times it, timed in the same run.
// Linear work keeps the ratio near 1; anything that grows with the square of the count shows up as about 4.
const perParticle = kind => ev(kind => {
  const G = 1.5e5, cost = [];
  for (const N of kind === 'gas' ? [5000, 20000] : [7000, 28000]) {
    __rd.budget(19200, 28000); __rd.load('empty', 1);
    if (kind === 'gas') {
      __rd.add(__rd.makeBH(0, 0, 0, 0, 10, 0.5));
      for (let k = 0; k < N; k++) { const r = 60 + 110 * __rd.rand(), a = 6.2832 * __rd.rand(), v = Math.sqrt(G * 10 / r); __rd.addGas(r * Math.cos(a), r * Math.sin(a), Math.sin(a) * v, -Math.cos(a) * v, 1e-6, 0); }
    } else {
      const st = __rd.makeStar('G', 0, 0, 0, 0); __rd.add(st);
      for (let k = 0; k < N; k++) { const r = 30 + 150 * __rd.rand(), a = 6.2832 * __rd.rand(), v = Math.sqrt(G * st.m / r); __rd.addMatter(r * Math.cos(a), r * Math.sin(a), Math.sin(a) * v, -Math.cos(a) * v, 1e-5, 0); }
    }
    const t = [];
    for (let k = 0; k < 9; k++) {
      const t0 = performance.now();
      if (kind === 'gas') __rd.stepGas(0.002); else { __rd.stepMatter(0.002); __rd.matterCollective(0.006, 0.05); }
      t.push((performance.now() - t0) / N);
    }
    cost.push(t.sort((a, b) => a - b)[4]);
  }
  __rd.budget(3200, 7000);
  return cost;
}, kind);

for (const kind of ['gas', 'matter']) {
  test(`${kind}: cost per particle at four times the old cap stays within twice the cost at the old cap`, async t => {
    const ratios = [];
    for (let k = 0; k < 3; k++) { const [a, b] = await perParticle(kind); ratios.push(b / a); }
    const med = ratios.sort((a, b) => a - b)[1];
    t.diagnostic(`per-particle cost ratios ${ratios.map(r => r.toFixed(2))}`);
    assert.ok(med < 2, `per-particle cost ratio ${med.toFixed(2)} (runs: ${ratios.map(r => r.toFixed(2))})`);
  });
}

test('no page or console errors', () => assert.deepEqual(p.errors, []));
