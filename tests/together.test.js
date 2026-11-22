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

test('a real rewind during a challenge: the challenge stays on, a pass stays earned, and the readout follows the scene back', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(() => {
    const rd = window.__rd, out = {}, merged = () => rd.events.find(e => e.data && e.data.id === 'bh-merge');
    const before = t => { const s = rd.timeline.info().snaps; let i = s.length - 1; while (i >= 0 && s[i].t >= t) i--; return i; };
    // a merger that doesn't count, then back to before it
    rd.chal.start('spin', 7); rd.place('bh', 0, 0, { mass: 30, spin: 0 }); rd.place('bh', 70, 0, { mass: 30, spin: 0 });
    for (let f = 0; f < 3600 && !merged(); f += 30) rd.step(30, 1000 / 60, false);
    rd.step(4, 1000 / 60, false);
    out.lostText = rd.chal.state.text; out.holesAfter = rd.bodies.length;
    out.went = rd.timeline.go(before(merged().t));   // no frame runs after it: the readout must follow at once, as when scrubbing while paused
    out.back = rd.chal.state; out.holesBack = rd.bodies.length; out.hooked = rd.chal.hooked;
    // a pass, then back to before it
    rd.chal.start('msp', 7); rd.place('WD', 6, 0);
    for (let f = 0; f < 3600 && !rd.chal.state.won; f += 30) rd.step(30, 1000 / 60, false);
    out.won = rd.chal.state.won; const pass = rd.events.find(e => e.data && e.data.id === 'challenge');
    out.went2 = rd.timeline.go(before(pass.t) - 2);
    out.spinBack = rd.bodies.find(b => b.type && b.type.kind === 'ns').spinHz;
    out.afterPass = rd.chal.state;
    rd.chal.stop();
    return out;
  });
  assert.match(r.lostText, /That merger left spin/);
  assert.equal(r.holesAfter, 1);
  assert.equal(r.went, true);
  assert.equal(r.holesBack, 2);
  assert.ok(r.back && r.back.id === 'spin' && !r.back.won, 'still in the challenge, not passed');
  assert.doesNotMatch(r.back.text, /That merger left spin/);
  assert.deepEqual(r.hooked, { frame: true, event: true });
  assert.equal(r.won, true);
  assert.equal(r.went2, true);
  assert.ok(r.spinBack < 300, `the neutron star is back at ${r.spinBack} turns a second`);
  assert.ok(r.afterPass && r.afterPass.id === 'msp' && r.afterPass.won, 'the pass is kept');
  assert.deepEqual(errors, []);
  await close();
});

test('the challenge card, the graphs and the timeline never sit on top of each other', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const hit = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const [w, h] of [[1280, 800], [1366, 650], [390, 844]]) for (const open of [false, true]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(open => { const rd = window.__rd; rd.chal.start('nova', 7); rd.graphs.open(open); rd.step(3); }, open);
    await page.waitForTimeout(250);   // the panels publish their edges on the next animation frame
    const b = await page.evaluate(() => { const q = s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? [r.left, r.top, r.right, r.bottom] : null; };
      return { scope: q('.scope'), graphs: q('#graphs'), card: q('.chal'), timeline: q('#tl') }; });
    const at = `${w}×${h}, graphs ${open ? 'open' : 'closed'}`;
    assert.ok(b.graphs && b.card && b.timeline && b.scope, `${at}: all four are on screen`);
    for (const [x, y] of [['card', 'graphs'], ['card', 'scope'], ['card', 'timeline'], ['graphs', 'scope'], ['graphs', 'timeline']])
      assert.ok(!hit(b[x], b[y]), `${at}: the ${x} overlaps the ${y} (${b[x].map(Math.round)} and ${b[y].map(Math.round)})`);
  }
  await page.evaluate(() => { window.__rd.chal.stop(); window.__rd.graphs.open(false); });
  assert.deepEqual(errors, []);
  await close();
});
