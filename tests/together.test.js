// The features working together: a real rewind (timeline.js) seen from the things that keep a history of their own.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser;
test.before(async () => { server = await serve(); browser = await launch(); });
test.after(async () => { await browser.close(); server.close(); });

test('rewinding past a merger takes the graphs back with it: the two holes get their own mass histories again, and nothing is left from the future', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(() => {
    const rd = window.__rd, out = {};
    rd.load('gw150914', 1);
    const big = rd.bodies.reduce((a, b) => (b.m > a.m ? b : a)), bigId = big.id; out.m0 = big.m;
    let n = 0; while (rd.bodies.length > 1 && n < 6000) { rd.step(10, 1000 / 60, false); n += 10; }
    out.merged = rd.bodies.length === 1; rd.step(90, 1000 / 60, false);
    out.remnant = rd.bodies[0].m; const tMerged = rd.simTime;
    const rem = rd.graphs.mass(rd.bodies[0].id); out.remLast = rem.v[rem.v.length - 1]; out.remFirst = rem.v[0];
    // the newest saved moment that still has both holes
    const snaps = rd.timeline.info().snaps, ev = rd.events.find(e => /merg/i.test(e.title)); out.event = ev && ev.title;
    let i = snaps.length - 1; while (i >= 0 && snaps[i].t >= ev.t) i--;
    out.went = rd.timeline.go(i); out.tBack = rd.simTime; out.tMerged = tMerged; out.tEvent = ev.t;
    out.holes = rd.bodies.length;
    const light = rd.graphs.light(); out.lightLast = light.t[light.t.length - 1];
    const m = rd.graphs.mass(bigId); out.hist = m && { last: m.v[m.v.length - 1], tLast: m.t[m.t.length - 1], n: m.t.length };
    out.eventsAfter = rd.events.filter(e => e.t > rd.simTime).length;
    // let it run to the merger again: one unbroken history, time only ever going forward
    n = 0; while (rd.bodies.length > 1 && n < 6000) { rd.step(10, 1000 / 60, false); n += 10; }
    rd.step(30, 1000 / 60, false);
    const again = rd.graphs.mass(rd.bodies[0].id); out.againLast = again.v[again.v.length - 1];
    out.monotonic = again.t.every((t, k) => k === 0 || t > again.t[k - 1]);
    const l2 = rd.graphs.light(); out.lightMonotonic = l2.t.every((t, k) => k === 0 || t > l2.t[k - 1]);
    return out;
  });
  assert.ok(r.merged && r.event, 'the holes merged and the merger was logged');
  assert.ok(Math.abs(r.remFirst - r.m0) < 0.5 && r.remLast > r.m0 + 10, `before the rewind the remnant's history ran from ${r.remFirst} to ${r.remLast}`);
  assert.equal(r.went, true);
  assert.ok(r.tBack < r.tEvent && r.tBack < r.tMerged);
  assert.equal(r.holes, 2);
  assert.ok(r.lightLast <= r.tBack, `light curve ends at ${r.lightLast}, the scene is at ${r.tBack}`);
  assert.ok(r.hist, 'the heavier hole has its mass history back');
  assert.ok(Math.abs(r.hist.last - r.m0) < 0.5, `its history ends at ${r.hist.last} M☉, not the remnant's ${r.remnant}`);
  assert.ok(r.hist.tLast <= r.tBack && r.hist.n > 3);
  assert.equal(r.eventsAfter, 0);
  assert.ok(r.againLast > r.m0 + 10, `after replaying, the remnant's history reaches ${r.againLast}`);
  assert.ok(r.monotonic && r.lightMonotonic, 'time in the histories only goes forward');
  assert.deepEqual(errors, []);
  await close();
});

test('the light curve ticks simulation notices, not notices about the interface', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(() => {
    const rd = window.__rd; rd.load('nova', 1); rd.graphs.open(true); rd.graphs.tab('light');
    rd.step(60, 1000 / 60, false); const t = rd.simTime;
    rd.logEvent('Screenshot saved', '', { ui: true }); rd.step(60, 1000 / 60, false);
    rd.graphs.cursor(t); const ui = rd.graphs.read();
    rd.logEvent('Made-up flare'); rd.step(60, 1000 / 60, false);
    rd.graphs.cursor(rd.events[rd.events.length - 1].t); const sim = rd.graphs.read();
    return { ui, sim };
  });
  assert.ok(!/Screenshot saved/.test(r.ui), `readout at an interface notice: ${r.ui}`);
  assert.ok(/Made-up flare/.test(r.sim), `readout at a simulation notice: ${r.sim}`);
  assert.deepEqual(errors, []);
  await close();
});
