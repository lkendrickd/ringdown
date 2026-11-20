// The physics helpers against published values and the README's own claims.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser, p;
before(async () => { server = await serve(); browser = await launch(); p = await openPage(browser, server); });
after(async () => { await p.close(); await browser.close(); server.close(); });

const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, want ${want} ± ${tol}`);
const TSUN = 4.925491e-6;   // G M☉ / c³ in seconds

test('Kerr innermost stable circular orbit (Bardeen, Press & Teukolsky 1972)', async () => {
  const [r0, rPro, rRetro, r1, rm1, e0] = await p.page.evaluate(() =>
    [__rd.riscoM(0), __rd.riscoM(0.998), __rd.riscoM(-0.998), __rd.riscoM(1), __rd.riscoM(-1), __rd.eIsco(0)]);
  assert.equal(r0, 6, 'Schwarzschild ISCO is 6 M');
  near(rPro, 1.237, 0.001, 'prograde ISCO at the Thorne limit a = 0.998 (M)');
  near(rRetro, 8.994, 0.001, 'retrograde ISCO at a = 0.998 (M)');
  near(r1, 1, 1e-9, 'prograde ISCO for an extremal hole (M)');
  near(rm1, 9, 1e-9, 'retrograde ISCO for an extremal hole (M)');
  near(1 - e0, 1 - Math.sqrt(8 / 9), 1e-12, 'binding energy at the Schwarzschild ISCO (5.7%)');
});

test('36 + 29 M☉ non-spinning merger: about 62 M☉, spin 0.68, 3 M☉ radiated (README; GW150914)', async () => {
  const r = await p.page.evaluate(() => __rd.remnantFit(36, 29, 0, 0));
  near(r.mf, 62, 0.5, 'remnant mass (M☉)');            // GW150914 source frame: 62 ± 4
  near(65 - r.mf, 3, 0.25, 'mass radiated (M☉)');      // GW150914: 3.0 ± 0.5
  near(r.chi, 0.68, 0.01, 'remnant spin');             // GW150914: 0.67 +0.05 −0.07
});

test('equal-mass non-spinning merger leaves spin 0.686 (numerical relativity)', async () => {
  const r = await p.page.evaluate(() => __rd.remnantFit(30, 30, 0, 0));
  near(r.chi, 0.6864, 0.002, 'remnant spin');
  near(r.frac, 0.048, 0.003, 'fraction of the mass radiated');
});

test('the 36 + 29 preset, run frame by frame, merges into that remnant', async () => {
  const r = await p.page.evaluate(() => {
    __rd.load('gw150914', 1);
    let n = 0; while (__rd.bodies.length > 1 && n < 3000) { __rd.step(10); n += 10; }
    const b = __rd.bodies[0];
    return { n, count: __rd.bodies.length, kind: b.kind, m: b.m, chi: b.chi, fit: __rd.remnantFit(36, 29, 0, 0) };
  });
  assert.equal(r.count, 1, `still ${r.count} bodies after ${r.n} frames`);
  assert.equal(r.kind, 'bh');
  assert.equal(r.m, r.fit.mf, 'remnant mass is the fit');
  assert.equal(Math.abs(r.chi), r.fit.chi, 'remnant spin is the fit');
});

test('l = m = 2 ringdown (Berti, Cardoso & Will 2006 fits)', async () => {
  const [q0, q] = await p.page.evaluate(() => { const r = __rd.remnantFit(36, 29, 0, 0); return [__rd.ringFor(1, 0), __rd.ringFor(r.mf, r.chi)]; });
  // Schwarzschild, exact (Leaver 1985): M ω = 0.37367 − 0.08896 i. The fit is good to a couple of percent.
  const w0 = q0.fReal * 2 * Math.PI * TSUN, Q0 = Math.PI * q0.fReal * q0.tauReal;
  near(w0, 0.37367, 0.02 * 0.37367, 'Schwarzschild M ω');
  near(Q0, 0.37367 / (2 * 0.08896), 0.05, 'Schwarzschild quality factor');
  // The GW150914 remnant rings at about 274 Hz in its own frame. LIGO saw about 250 Hz because the signal reached
  // Earth redshifted by 1 + z ≈ 1.09; the damping time measured was about 4 ms.
  assert.ok(q.fReal > 250 && q.fReal < 300, `ringdown frequency ${q.fReal} Hz`);
  near(q.fReal / 1.09, 251, 10, 'ringdown frequency redshifted to Earth (Hz)');
  near(q.tauReal * 1000, 3.7, 0.4, 'damping time (ms)');
});

test("Eggleton's Roche lobe: 0.379 of the separation for equal masses", async () => {
  near(await p.page.evaluate(() => __rd.rocheFrac(1)), 0.49 / (0.6 + Math.log(2)), 1e-12, 'Roche lobe radius / separation, q = 1');
  near(await p.page.evaluate(() => __rd.rocheFrac(1)), 0.379, 0.0005, 'Roche lobe radius / separation, q = 1');
});

test('white dwarfs: 1.44 M☉ Chandrasekhar limit, shrink as they gain mass', async () => {
  const r = await p.page.evaluate(() => ({ mch: __rd.M_CH, R: [0.4, 0.6, 0.8, 1.0, 1.2, 1.3].map(__rd.wdRadius) }));
  assert.equal(r.mch, 1.44);
  for (let i = 1; i < r.R.length; i++) assert.ok(r.R[i] < r.R[i - 1], `radius should fall with mass: ${r.R}`);
});

// two white dwarfs thrown at each other in empty space, from far enough apart that neither overflows its Roche lobe first
const collideWDs = (m1, m2, frames) => p.page.evaluate(([m1, m2, frames]) => {
  __rd.load('empty', 1);
  __rd.add(__rd.makeStar('WD', -15, 0, 300, 0, m1), __rd.makeStar('WD', 15, 0, -300, 0, m2));
  let n = 0; while (__rd.bodies.length > 1 && n < 600) { __rd.step(1); n++; }
  const merged = __rd.bodies.map(b => ({ type: b.type.id, m: b.m, R: b.R, sn: b.sn ? b.sn.mode : null }));
  __rd.step(frames);
  return { n, merged, after: __rd.bodies.length, gas: __rd.gN };
}, [m1, m2, frames]);

test('two 0.6 M☉ white dwarfs merge into one smaller 1.2 M☉ white dwarf', async () => {
  const r = await collideWDs(0.6, 0.6, 200);
  assert.equal(r.merged.length, 1, `did not merge in ${r.n} frames`);
  const [wd] = r.merged;
  assert.equal(wd.type, 'WD'); assert.equal(wd.sn, null);
  near(wd.m, 1.2, 1e-9, 'merged mass');
  assert.equal(r.after, 1, 'still there 200 frames later');
});

test('two 0.8 M☉ white dwarfs pass 1.44 M☉ and explode as a Type Ia, leaving nothing', async () => {
  const r = await collideWDs(0.8, 0.8, 200);
  assert.equal(r.merged.length, 1, `did not merge in ${r.n} frames`);
  assert.equal(r.merged[0].sn, 'ia');
  assert.equal(r.after, 0, 'nothing left after the explosion');
  assert.ok(r.gas > 0, 'ejecta thrown out');
});

test("README's scales: 1 grid unit is 11.8 km, time runs about 23× slower than real", async () => {
  const [km, slow] = await p.page.evaluate(() => [__rd.KM_PER_UNIT, 1 / __rd.SIM2REAL]);
  near(km, 11.8, 0.05, 'km per grid unit');
  near(slow, 23, 0.5, 'slow-down factor');
});

// The checks above allow for the scatter between published values. These pin what the code computes today, so a change
// to any formula shows up even when it stays inside that scatter. Changing the physics on purpose means updating them.
test('pinned outputs of the physics helpers', async () => {
  const r = await p.page.evaluate(() => {
    const f = __rd.remnantFit, q = __rd.ringFor(62, 0.68);
    return { isco: [__rd.riscoM(0.5), __rd.riscoM(-0.5)], gw: f(36, 29, 0, 0), eq: f(30, 30, 0, 0), aligned: f(30, 30, 0.9, 0.9),
      lopsided: f(40, 8, -0.5, 0.3), ring: [q.fReal, q.tauReal], roche: __rd.rocheFrac(0.3), wd: __rd.wdRadius(1.0) };
  });
  const pin = (got, want, what) => assert.ok(Math.abs(got / want - 1) < 1e-12, `${what}: got ${got}, pinned ${want}`);
  pin(r.isco[0], 4.233002529530826, 'riscoM(0.5)'); pin(r.isco[1], 7.554584714512358, 'riscoM(-0.5)');
  pin(r.gw.mf, 62.05428099490057, '36 + 29 mass'); pin(r.gw.chi, 0.6805860211311479, '36 + 29 spin');
  pin(r.eq.mf, 57.192466062120346, '30 + 30 mass'); pin(r.eq.chi, 0.6869160287844386, '30 + 30 spin');
  pin(r.aligned.mf, 55.11384646426289, '30 + 30, χ 0.9 mass'); pin(r.aligned.chi, 0.9348435287844387, '30 + 30, χ 0.9 spin');
  pin(r.lopsided.mf, 47.580064281684294, '40 + 8 mass'); pin(r.lopsided.chi, 0.12615056982208672, '40 + 8 spin');
  pin(r.ring[0], 274.4770589948843, 'ringdown frequency'); pin(r.ring[1], 0.0037169119203145718, 'ringdown damping time');
  pin(r.roche, 0.2810311498674334, 'rocheFrac(0.3)'); pin(r.wd, 1.2505457136106182, 'wdRadius(1.0)');
});

test('no page or console errors while computing', () => assert.deepEqual(p.errors, []));
