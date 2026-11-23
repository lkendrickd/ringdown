// The Moon-forming scene: Theia grazes the young Earth at 45 degrees and escape speed, its remnant falls back, and the
// chunk it slings out settles as a Moon beyond the Roche limit (after Kegerreis et al. 2022). Any other hit gives no chunk.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser, p;
before(async () => { server = await serve(); browser = await launch(); p = await openPage(browser, server); });
after(async () => { await p.close(); await browser.close(); server.close(); });
const ev = (fn, arg) => p.page.evaluate(fn, arg);
const LM = 3.694e-8;

test('the scene is the paper’s base run: 0.133 on 0.887 Earth masses, meeting 45° off head-on at escape speed', async () => {
  const r = await ev(() => {
    __rd.load('theia', 3);
    const [e, th] = __rd.bodies, ME = 5.972e24 / 1.989e30, Rc = e.R + th.R, GM = __rd.G * (e.m + th.m);
    let n = 0; while (Math.hypot(th.x - e.x, th.y - e.y) > Rc && n < 3000) { __rd.step(1, 1000 / 60, false); n++; }
    const dx = th.x - e.x, dy = th.y - e.y, vx = th.vx - e.vx, vy = th.vy - e.vy, d = Math.hypot(dx, dy), v = Math.hypot(vx, vy);
    return { e: e.m / ME, th: th.m / ME, deg: Math.asin(Math.abs(dx * vy - dy * vx) / (d * v)) * 180 / Math.PI, vesc: v / Math.sqrt(2 * GM / d), drift: Math.hypot(e.m * e.vx + th.m * th.vx, e.m * e.vy + th.m * th.vy) / (th.m * v) };
  });
  assert.ok(Math.abs(r.e - 0.887) < 1e-3 && Math.abs(r.th - 0.133) < 1e-3, `masses ${r.e} and ${r.th}`);
  assert.ok(Math.abs(r.deg - 45) < 1.5, `they met ${r.deg.toFixed(1)}° off head-on`);
  assert.ok(Math.abs(r.vesc - 1) < 0.03, `they met at ${r.vesc.toFixed(3)} of escape speed`);
  assert.ok(r.drift < 1e-6, `the pair as a whole is moving: ${r.drift}`);
});

test('the grazing hit leaves a remnant and a flung chunk of about 0.69 lunar masses, drawn out in an arm of debris', async () => {
  const r = await ev(() => {
    __rd.load('theia', 3);
    let n = 0; while (__rd.bodies.length === 2 && n < 3000) { __rd.step(1, 1000 / 60, false); n++; }
    const e = __rd.bodies.find(b => b.label === 'Proto-Earth'), rem = __rd.bodies.find(b => b.remnant), sat = __rd.bodies.find(b => b.flung);
    return { n: __rd.bodies.length, ev: __rd.events.map(x => [x.title, x.data && x.data.id]), rem: rem && { label: rem.label, m: rem.m, r: Math.hypot(rem.x - e.x, rem.y - e.y) / e.R },
      sat: sat && { m: sat.m, r: Math.hypot(sat.x - e.x, sat.y - e.y) / e.R, sling: !!sat.sling }, q: __rd.qN, total: __rd.bodies.reduce((s, b) => s + b.m, 0) + __rd.state().q[4].reduce((s, v) => s + v, 0) };
  });
  assert.deepEqual(r.ev, [['Giant impact', 'graze']]);
  assert.equal(r.n, 3);
  assert.equal(r.rem.label, 'Theia remnant');
  assert.ok(Math.abs(r.sat.m / LM - 0.69) < 0.05 && r.sat.sling, `chunk of ${(r.sat.m / LM).toFixed(2)} lunar masses`);
  assert.ok(r.rem.m > 2 * r.sat.m && r.rem.r < r.sat.r, 'the remnant should be the heavier, inner piece');
  assert.ok(r.q > 100, `only ${r.q} grains of debris`);
  assert.ok(Math.abs(r.total / ((0.887 + 0.133) * 5.972e24 / 1.989e30) - 1) < 1e-9, `mass was not conserved: ${r.total}`);
});

// 64x for 900 frames is about 4 days of the scene's time.
test('the remnant falls back onto the Earth and the chunk settles as the Moon, near-circular, about 7 Earth radii out', async t => {
  const rows = [];
  for (const seed of [1, 2, 3]) rows.push(await ev(seed => {
    __rd.load("theia", seed); __rd.speed = 6;
    let back = -1; for (let n = 0; n < 900; n++) { __rd.step(1, 1000 / 60, false); if (back < 0 && __rd.bodies.some(b => b.flung) && !__rd.bodies.some(b => b.remnant)) back = __rd.simTime; }
    const e = __rd.bodies.find(b => b.label === 'Proto-Earth'), m = __rd.bodies.find(b => b.label === 'Moon') || {}, RE = 6371 / __rd.KM_PER_UNIT;
    const dx = m.x - e.x, dy = m.y - e.y, vx = m.vx - e.vx, vy = m.vy - e.vy, r = Math.hypot(dx, dy), GM = __rd.G * (e.m + m.m), E = (vx * vx + vy * vy) / 2 - GM / r, a = -GM / (2 * E), h = dx * vy - dy * vx, ec = Math.sqrt(Math.max(0, 1 - h * h / (GM * a)));
    return { seed, flung: !!m.flung, sling: !!m.sling, lm: m.m / 3.694e-8, peri: a * (1 - ec) / RE, apo: a * (1 + ec) / RE, ecc: ec, backHours: back * __rd.SIM2REAL / 3600, earth: e.m / (5.972e24 / 1.989e30),
      titles: __rd.events.map(x => x.title).join('|') };
  }, seed));
  t.diagnostic(JSON.stringify(rows.map(r => ({ ...r, titles: undefined }))));
  for (const r of rows) {
    assert.ok(r.flung && !r.sling, `seed ${r.seed}: the Moon should be the flung chunk, at rest on its orbit ${JSON.stringify(r)}`);
    assert.ok(r.lm > 0.6 && r.lm < 0.95, `seed ${r.seed}: ${r.lm.toFixed(2)} lunar masses`);
    assert.ok(r.peri > 6.2 && r.apo < 8.6 && r.ecc < 0.1, `seed ${r.seed}: orbit ${r.peri.toFixed(1)} to ${r.apo.toFixed(1)} Earth radii, e ${r.ecc.toFixed(2)}`);
    assert.ok(r.backHours > 1 && r.backHours < 12, `seed ${r.seed}: the remnant fell back after ${r.backHours.toFixed(1)} h`);
    assert.ok(r.earth > 0.98, `seed ${r.seed}: the Earth ended at ${r.earth.toFixed(3)} Earth masses`);
    assert.match(r.titles, /^Giant impact\|.*A Moon/, `seed ${r.seed}: ${r.titles}`);
  }
});

test('a steeper hit (about 20° off head-on) at the same speed throws out no chunk and no remnant', async () => {
  const r = await ev(() => {
    __rd.load('theia', 3);
    const [e, th] = __rd.bodies; th.vy *= 0.45; e.vy *= 0.45; th.vx *= 1.04; e.vx *= 1.04;
    let n = 0; while (__rd.bodies.length === 2 && n < 3000) { __rd.step(1, 1000 / 60, false); n++; }
    return { n: __rd.bodies.length, odd: __rd.bodies.filter(b => b.flung || b.remnant || b.sling).length, ev: __rd.events.map(x => [x.title, (x.data && x.data.id) || '']) };
  });
  assert.equal(r.odd, 0);
  assert.ok(r.ev.length === 1 && r.ev[0][1] !== 'graze', `events ${JSON.stringify(r.ev)}`);
});
