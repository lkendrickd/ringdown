// Rewind: a scene put back to an earlier moment plays on exactly as it did the first time; the history stays within its
// memory budget; the strip shows simulation events only, and its controls (drag, markers, back button, keys) work.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser, p;
before(async () => { server = await serve(); browser = await launch(); p = await openPage(browser, server); });
after(async () => { await p.close(); await browser.close(); server.close(); });

/* Run a scene A frames (a snapshot is taken every 30), note everything, run on to B and note everything again. Then put
   the scene back to the snapshot at A and run to B once more. The state must match what the first run had, to the bit:
   rd.state() (bodies, gas, matter) and the timeline's fingerprint (every body field and trail, every array, the explosions
   in flight, the scope, every loose variable a restore covers). Compared in the page, which reports the first difference. */
function replay(id, seed, A, B, opts = {}) {
  return p.page.evaluate(([id, seed, A, B, draw, setup]) => {
    const rd = __rd, T = rd.timeline, ms = 1000 / 60;
    const diff = (a, b) => { if (a === b) return null; let k = 0; while (k < a.length && a[k] === b[k]) k++; return `…${a.slice(Math.max(0, k - 60), k + 60)}… vs …${b.slice(Math.max(0, k - 60), k + 60)}…`; };
    const titles = () => rd.events.map(e => e.title), sizes = () => ({ bodies: rd.bodies.length, gN: rd.gN, qN: rd.qN, flashes: rd.flashes.length });
    rd.load(id, seed); if (setup) new Function('rd', setup)(rd);
    rd.step(A, ms, draw);
    const i = T.info().snaps.findIndex(s => s.frame === A);
    const stA = JSON.stringify(rd.state()), fpA = T.fingerprint(), atA = sizes();
    rd.step(B - A, ms, draw);
    const stB = JSON.stringify(rd.state()), fpB = T.fingerprint(), evB = titles(), atB = sizes();
    const went = T.go(i);
    const backA = { st: diff(stA, JSON.stringify(rd.state())), fp: diff(fpA, T.fingerprint()) };
    rd.step(B - A, ms, draw);
    return { i, went, backA, again: { st: diff(stB, JSON.stringify(rd.state())), fp: diff(fpB, T.fingerprint()) }, evB, evAgain: titles(), atA, atB };
  }, [id, seed, A, B, !!opts.draw, opts.setup || '']);
}
function assertReplay(r, what) {
  assert.ok(r.i >= 0, 'no snapshot at frame A');
  assert.equal(r.went, true, 'the restore did not happen');
  assert.equal(r.backA.st, null, `${what}: state right after the restore differs from frame A: ${r.backA.st}`);
  assert.equal(r.backA.fp, null, `${what}: fingerprint right after the restore differs from frame A: ${r.backA.fp}`);
  assert.equal(r.again.st, null, `${what}: replayed state at frame B differs: ${r.again.st}`);
  assert.equal(r.again.fp, null, `${what}: replayed fingerprint at frame B differs: ${r.again.fp}`);
  assert.deepEqual(r.evAgain, r.evB, `${what}: the replay raised different events`);
}

test('black-hole merger: rewound to before the merger, it merges again exactly the same way', async () => {
  const r = await replay('gw150914', 42, 780, 900);   // they merge at frame 819
  assert.ok(r.evB.includes('Black holes merged'), `expected a merger between A and B, got ${r.evB}`);
  assert.equal(r.atA.bodies, 2); assert.equal(r.atB.bodies, 1);
  assertReplay(r, 'gw150914');
});

test('a star feeding a hole: rewound into the gas stream, it replays exactly', async () => {
  const r = await replay('feeding', 42, 120, 300);
  assert.ok(r.atA.gN > 200, `expected a gas stream at the restored moment, got ${r.atA.gN} particles`);
  assertReplay(r, 'feeding');
});

test('Moon-forming impact: rewound to before the impact, it strikes again the same way', async () => {
  const r = await replay('theia', 42, 420, 540);   // they collide at frame 442
  assert.ok(r.evB.includes('Giant impact'), `expected the impact between A and B, got ${r.evB}`);
  assert.ok(r.atB.qN > 100, `expected loose debris, got ${r.atB.qN}`);
  assertReplay(r, 'theia before the impact');
});

test('Moon-forming impact: rewound into the debris cloud, the loose matter replays exactly', async () => {
  const r = await replay('theia', 42, 480, 600);
  assert.ok(r.atA.qN > 100, `expected loose debris at the restored moment, got ${r.atA.qN}`);
  assertReplay(r, 'theia debris');
});

test('magnetar: a flare due on a wall-clock timer goes off at the same moment in the replay', async () => {
  const r = await replay('magnetar', 42, 210, 300);   // its first flare is timed 4 s of wall time after the scene loads (frame 240)
  assert.ok(r.evB.includes('Giant flare'), `expected the flare between A and B, got ${r.evB}`);
  assertReplay(r, 'magnetar');
});

// a supernova set off at the first frame, as the inspector's button does: the core collapses for about 4 s of wall time (to frame ~250)
const SN = "const st = rd.bodies.find(b => b.kind === 'star'); st.sn = { t0: rd.wallNow, mode: 'cc' };";
test('supernova: rewound into the collapse, it explodes at the same moment and the same way', async () => {
  const r = await replay('betelgeuse', 42, 150, 330, { setup: SN });
  assert.ok(r.evB.some(t => /supernova/i.test(t)), `expected the explosion between A and B, got ${r.evB}`);
  assertReplay(r, 'supernova collapse');
});

test('supernova: rewound to just after the blast, the explosion in flight and its ejecta replay exactly', async () => {
  const r = await replay('betelgeuse', 42, 300, 420, { setup: SN });
  assert.ok(r.atA.flashes > 0 && r.atA.gN > 100, `expected the blast in flight at the restored moment, got ${JSON.stringify(r.atA)}`);
  assertReplay(r, 'supernova blast');
});

test('every scene replays exactly from a restored moment', async t => {
  const ids = await p.page.evaluate(() => __rd.presets);
  for (const id of ids) await t.test(id, async () => assertReplay(await replay(id, 3, 90, 210), id));
});

test('the replay also matches when every frame is drawn', async () => {
  assertReplay(await replay('gw150914', 7, 780, 840, { draw: true }), 'gw150914 drawn');
});

/* ---------- the strip ---------- */
const MS = 1000 / 60;
const merged = () => p.page.evaluate(ms => { const rd = __rd; rd.load('gw150914', 42); rd.step(905, ms, false); rd.timeline.draw(); }, MS);   // 15.08 s (off the half-second snapshot grid); the holes merge 13.65 s in
const info = () => p.page.evaluate(() => { const rd = __rd, i = rd.timeline.info();
  return { at: i.at, n: i.snaps.length, clock: i.at < 0 ? i.clock : i.snaps[i.at].clock, head: i.snaps[i.snaps.length - 1].clock, snaps: i.snaps, marks: i.marks.map(m => m.title),
    t: rd.simTime, bodies: rd.bodies.length, events: rd.events.map(e => e.title), follow: rd.opt.follow,
    valuetext: document.getElementById('tlTrack').getAttribute('aria-valuetext'), time: document.getElementById('tlTime').textContent }; });
const isPaused = () => p.page.evaluate(() => document.getElementById('play').getAttribute('aria-label') === 'Play');
async function setPaused(on) { if (await isPaused() !== on) await p.page.click('#play'); assert.equal(await isPaused(), on); }

test('only simulation events become markers: an interface notice is logged, flagged, and left off', async () => {
  await setPaused(false); await merged();
  await p.page.focus('#ui');
  await p.page.keyboard.press('Control+z');   // nothing was placed: "Nothing to undo", a notice about the interface
  const r = await p.page.evaluate(() => { __rd.timeline.draw();
    return { events: __rd.events.map(e => [e.title, !!(e.data && e.data.ui)]), dots: document.querySelectorAll('#tlMarks i').length }; });
  assert.deepEqual(r.events, [['Black holes merged', false], ['Nothing to undo', true]]);
  assert.deepEqual((await info()).marks, ['Black holes merged']);
  assert.equal(r.dots, 1);
});

test('clicking a marker puts the scene a moment before that event, tells the rewind hooks, and time runs on from there', async () => {
  await setPaused(false); await merged();
  const before = await info(), tMerge = await p.page.evaluate(() => __rd.events[0].t);
  await p.page.evaluate(() => { window.__told = []; if (!window.__toldHook) { window.__toldHook = true; __rd.rewindHooks.push(t => __told.push(t)); } });
  const box = await p.page.locator('#tlMarks i').first().boundingBox();
  await p.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const r = await info(), told = await p.page.evaluate(() => __told.slice()), tip = await p.page.evaluate(() => [document.getElementById('tlTip').hidden, document.getElementById('tlTip').textContent]);
  assert.ok(r.at >= 0, 'not rewound');
  assert.equal(r.bodies, 2, 'the two holes should be back');
  assert.ok(r.t < tMerge, `restored to ${r.t}, after the merger at ${tMerge}`);
  // the merger came 819 frames (13.65 s) in; snapshots are 0.5 s apart, so 1.5 s before it is the one at 12.0 s
  assert.ok(r.clock > 11.4 && r.clock <= 12.16, `landed at ${r.clock} s, the merger was at 13.65 s`);
  assert.equal(r.n, before.n + 1, 'the moment left should have been kept');
  assert.deepEqual(r.events, [], 'the merger has not happened yet');
  assert.deepEqual(told, [r.t]);
  assert.equal(tip[0], false); assert.match(tip[1], /^Black holes merged/);
  assert.match(r.valuetext, /seconds back, just before Black holes merged/);
  assert.equal(await isPaused(), false, 'the click held time still only while pressed');
  await p.page.evaluate(ms => __rd.step(150, ms, false), MS);
  const a = await info();
  assert.equal(a.at, -1, 'still rewound after time ran');
  assert.deepEqual(a.events, ['Black holes merged']);
  assert.deepEqual(a.marks, ['Black holes merged'], 'one merger, not the old one and the replay');
  assert.ok(a.snaps.every((s, i) => i === 0 || s.clock > a.snaps[i - 1].clock), 'history out of order');
  assert.ok(Math.abs(a.clock - (r.clock + 2.5)) < 0.01, `clock ${a.clock}: it should have run on from ${r.clock}`);
});

test('the back button and B go back 10 seconds; on the strip, arrows, Page Down, Home and End move through the history', async () => {
  await setPaused(false); await merged();
  await p.page.click('#tlBack');
  let r = await info();
  assert.ok(r.at >= 0 && Math.abs(r.clock - 5) < 0.3, `back button: at ${r.clock} s, expected 5`);
  await p.page.focus('#ui'); await p.page.keyboard.press('b');
  r = await info();
  assert.equal(r.at, 0, 'B from 5 s should reach the start');
  await p.page.focus('#tlTrack');
  await p.page.keyboard.press('End'); r = await info();
  assert.equal(r.at, r.n - 1, 'End: the newest moment');
  await p.page.keyboard.press('ArrowLeft'); assert.equal((await info()).at, r.n - 2, 'ArrowLeft: one step back');
  await p.page.keyboard.press('Home'); assert.equal((await info()).at, 0, 'Home: the oldest');
  await p.page.keyboard.press('PageDown'); r = await info();
  assert.ok(r.clock > 11 && r.clock < 13, `Page Down: just before the merger, got ${r.clock} s`);
  assert.match(r.valuetext, /just before Black holes merged/);
  // the arrow keys on the strip are the strip's, not the camera's
  await p.page.keyboard.down('ArrowLeft'); await p.page.evaluate(ms => __rd.step(2, ms, false), MS); await p.page.keyboard.up('ArrowLeft');
  assert.equal((await info()).follow, true, 'an arrow key on the strip panned the camera');
});

test('ArrowLeft from live steps back even when the live moment has just been saved', async () => {
  await setPaused(false);
  await p.page.evaluate(ms => { const rd = __rd; rd.load('gw150914', 42); rd.step(600, ms, false); rd.timeline.draw(); }, MS);   // 600: a snapshot frame
  const n = (await info()).n;
  await p.page.focus('#tlTrack'); await p.page.keyboard.press('ArrowLeft');
  const r = await info();
  assert.equal(r.at, n - 2, 'expected the snapshot before the newest one');
  assert.equal(r.n, n, 'the live moment was already saved: no copy of it should be added');
});

test('while paused you can scrub back and forth and return to where you were; the old future goes once time runs', async () => {
  await setPaused(false);
  await p.page.evaluate(ms => { const rd = __rd; rd.load('feeding', 42); rd.step(310, ms, false); rd.timeline.draw(); }, MS);
  const live = await p.page.evaluate(() => JSON.stringify(__rd.state())), n0 = (await info()).n;
  await setPaused(true);
  const tb = await p.page.locator('#tlTrack').boundingBox(), y = tb.y + tb.height / 2;
  await p.page.mouse.move(tb.x + tb.width - 3, y); await p.page.mouse.down();
  await p.page.mouse.move(tb.x + tb.width * 0.6, y, { steps: 6 }); await p.page.mouse.move(tb.x + tb.width * 0.8, y, { steps: 3 });
  await p.page.mouse.up();
  let r = await info();
  assert.ok(r.at >= 0 && r.clock < 4.5, `expected a moment back in time, at ${r.clock} s`);
  assert.equal(r.n, n0 + 1, 'the live moment should have been kept as the newest snapshot');
  assert.ok(await isPaused(), 'still paused after the drag');
  // drag all the way right: back to exactly where it was
  await p.page.mouse.move(tb.x + tb.width * 0.8, y); await p.page.mouse.down(); await p.page.mouse.move(tb.x + tb.width + 20, y, { steps: 4 }); await p.page.mouse.up();
  r = await info();
  assert.equal(r.at, r.n - 1);
  assert.equal(await p.page.evaluate(() => JSON.stringify(__rd.state())), live, 'the newest moment is not the state we left');
  // back again, then let time run: the moments after it are gone
  await p.page.focus('#tlTrack'); await p.page.keyboard.press('Home'); await p.page.keyboard.press('ArrowRight');
  assert.equal((await info()).at, 1);
  await setPaused(false); await p.page.evaluate(ms => __rd.step(1, ms, false), MS);
  r = await info();
  assert.equal(r.at, -1); assert.equal(r.n, 2, 'the old future should be gone');
});

test('going forward again while paused puts the events of that stretch back in the log', async () => {
  await setPaused(false); await merged(); await setPaused(true);
  await p.page.focus('#tlTrack');
  await p.page.keyboard.press('Home');
  assert.deepEqual((await info()).events, []);
  await p.page.keyboard.press('End');
  assert.deepEqual((await info()).events, ['Black holes merged']);
  await setPaused(false);
});

test('a body placed by hand, then time run: an event soon after leads back to after the placement, not before it', async () => {
  await setPaused(false);
  const r = await p.page.evaluate(ms => {
    const rd = __rd, T = rd.timeline; rd.load('kerr', 3); rd.step(95, ms, false);   // 95: 5 frames after a snapshot, so it is not the cut itself
    document.getElementById('play').click(); rd.step(1, ms, false);   // pause (a frame passes, as it always does before a hand can place anything)
    const h = rd.bodies[0]; rd.add(rd.makeStar('G', h.x + 60, h.y, h.vx, h.vy));   // drop a star right next to the hole
    rd.step(2, ms, false); document.getElementById('play').click();   // and play
    const k = rd.events.length, early = rd.events.map(e => e.title);
    let f = 0; while (rd.events.length === k && f < 300) { rd.step(1, ms, false); f++; }
    const ev = rd.events[k], i = ev ? T.before(ev) : -1, s = T.info().snaps;
    return { title: ev && ev.title, early, frames: f, cutAt: s.findIndex(x => x.cut && x.frame > 0), target: i, snaps: s.map(x => [x.frame, x.cut]) };
  }, MS);
  assert.ok(r.title, 'the star should have met the hole');
  assert.ok(r.frames < 90, `expected the event within 1.5 s, it took ${r.frames} frames`);
  assert.ok(r.cutAt > 0, `the first running frame after the edit should be marked: ${JSON.stringify(r.snaps)}`);
  assert.equal(r.target, r.cutAt, `the marker should lead to the moment after the placement: ${JSON.stringify(r)}`);
});

test('the history stays within its memory budget at the maximum load and still reaches back more than a minute', async t => {
  const r = await p.page.evaluate(() => {
    const rd = __rd, T = rd.timeline, c = rd.caps;
    rd.load('empty', 1);
    for (let i = 0; rd.gN < c.MAXG; i++) rd.addGas(1e6 + i, 1e6, 0, 0, 1e-9);
    for (let i = 0; rd.qN < c.MAXM; i++) rd.addMatter(-1e6 - i, 1e6, 0, 0, 1e-12);
    const cost = T.cost(9);
    for (let k = 0; k < 400; k++) T.tick(0.5);   // 200 s of running time, a snapshot every half second
    const i = T.info(), S = i.snaps;
    return { cost, gN: rd.gN, qN: rd.qN, bytes: i.bytes, budget: i.budget, n: S.length, reach: i.clock - S[0].clock, recent: S[S.length - 1].clock - S[S.length - 2].clock,
      gaps: S.slice(1).map((s, k) => +(s.clock - S[k].clock).toFixed(1)) };
  });
  t.diagnostic(`max load (${r.gN} gas, ${r.qN} matter): snapshot ${r.cost.snap.toFixed(2)} ms (worst ${r.cost.snapMax.toFixed(2)}), restore ${r.cost.restore.toFixed(2)} ms (worst ${r.cost.restoreMax.toFixed(2)}), ${(r.cost.bytes / 1048576).toFixed(2)} MB each`);
  t.diagnostic(`history: ${r.n} snapshots, ${(r.bytes / 1048576).toFixed(1)} of ${(r.budget / 1048576).toFixed(0)} MB, reaching ${r.reach.toFixed(1)} s back; gaps ${r.gaps.join(' ')}`);
  assert.equal(r.gN, 20000); assert.equal(r.qN, 28000);
  assert.ok(r.bytes <= r.budget, `${r.bytes} bytes is over the ${r.budget} budget`);
  assert.ok(r.reach >= 60, `reaches only ${r.reach} s back`);
  assert.ok(r.recent <= 1, `the newest moments should stay close together, got ${r.recent} s apart`);
  assert.ok(r.cost.snap < 60 && r.cost.restore < 60, `copying took ${r.cost.snap} / ${r.cost.restore} ms`);
});

test('at default settings two full minutes stay at half-second steps, inside the budget', async t => {
  const r = await p.page.evaluate(() => {
    const rd = __rd, T = rd.timeline; rd.load('feeding', 5);
    rd.step(2600, 50, false);   // 50 ms frames (the loop's longest): 130 s of running time
    const i = T.info(), S = i.snaps, gaps = S.slice(1).map((s, k) => s.clock - S[k].clock);
    return { n: S.length, reach: i.clock - S[0].clock, maxGap: Math.max(...gaps), bytes: i.bytes, budget: i.budget, gN: rd.gN, cost: T.cost(9) };
  });
  t.diagnostic(`feeding (${r.gN} gas): ${r.n} snapshots, ${(r.bytes / 1048576).toFixed(1)} MB, reaching ${r.reach.toFixed(1)} s back, widest gap ${r.maxGap.toFixed(2)} s; snapshot ${r.cost.snap.toFixed(3)} ms, restore ${r.cost.restore.toFixed(3)} ms`);
  assert.ok(r.reach >= 119 && r.reach <= 120.5, `reaches ${r.reach} s back`);
  assert.ok(r.maxGap <= 0.51, `a gap of ${r.maxGap} s`);
  assert.ok(r.bytes <= r.budget, `${r.bytes} bytes`);
});

test('the strip sits in the object bar, clear of the scope and the view dial, and hides with the controls', async () => {
  const frames = () => p.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const shown = () => p.page.evaluate(() => document.getElementById('tl').getClientRects().length > 0);
  try {
    for (const [w, h] of [[1280, 800], [390, 844]]) {
      await p.page.setViewportSize({ width: w, height: h }); await frames();
      // and again after clean view (H) hides everything and brings it back
      for (const when of ['', ' after clean view']) {
        if (when) {
          await p.page.focus('#ui'); await p.page.keyboard.press('h'); await frames();
          assert.equal(await shown(), false, `${w}: still shown in clean view`);
          await p.page.keyboard.press('h'); await frames();
          assert.equal(await shown(), true, `${w}: not back after clean view`);
        }
        const r = await p.page.evaluate(() => { const R = s => document.querySelector(s).getBoundingClientRect().toJSON();
          return { tl: R('#tl'), ctx: R('#ctx'), dock: R('#dock'), scope: R('.scope'), gizmo: R('#gizmo'), vw: innerWidth, phone: document.documentElement.classList.contains('phone') }; });
        const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, at = `${w}${when}`;
        assert.equal(r.phone, w < 560, `phone layout at ${w}`);
        assert.ok(r.tl.left >= 0 && r.tl.right <= r.vw && r.tl.height >= 20, `${at}: off screen ${JSON.stringify(r.tl)}`);
        assert.ok(r.tl.top >= r.dock.top && r.tl.bottom <= r.ctx.top, `${at}: not at the top of the object bar ${JSON.stringify(r)}`);
        assert.ok(apart(r.tl, r.scope), `${at}: overlaps the scope ${JSON.stringify(r)}`);
        assert.ok(apart(r.tl, r.gizmo), `${at}: overlaps the view dial ${JSON.stringify(r)}`);
      }
    }
  } finally { await p.page.setViewportSize({ width: 640, height: 400 }); }
});

test("on the page's own animation loop, a rewind winds the frame clock back and time runs on at its normal pace", async () => {
  const q = await openPage(browser, server);   // never load()ed through the hook: the real requestAnimationFrame loop drives it
  try {
    await q.page.selectOption('#preset', 'gw150914');
    await q.page.waitForFunction(() => __rd.timeline.info().clock > 3, null, { timeout: 90000 });
    const before = await q.page.evaluate(() => { window.__dts = []; __rd.frameHooks.push((s, w) => __dts.push([s, w])); return { wall: __rd.wallNow, clock: __rd.timeline.info().clock }; });
    await q.page.focus('#ui'); await q.page.keyboard.press('b');   // back to the start of the scene
    const at = await q.page.evaluate(() => ({ wall: __rd.wallNow, dts: __dts.length }));
    await q.page.waitForFunction(n => __dts.length > n + 30, at.dts, { timeout: 90000 });
    const after = await q.page.evaluate(() => { const i = __rd.timeline.info(); return { wall: __rd.wallNow, perf: performance.now(), wallBack: i.wallBack, at: i.at, clock: i.clock, dts: __dts.slice() }; });
    assert.ok(at.wall < before.wall - 1000, `the frame clock should have gone back about ${before.clock.toFixed(1)} s: ${before.wall} -> ${at.wall}`);
    assert.equal(after.at, -1, 'time ran on, so the rewound moment should now be the present');
    assert.ok(after.wallBack > 1000, `wallBack ${after.wallBack}`);
    assert.ok(Math.abs(after.perf - after.wallBack - after.wall) < 1000, 'the frame clock is not performance.now() less wallBack');
    const running = after.dts.slice(at.dts).filter(([s]) => s > 0).map(([, w]) => w);
    assert.ok(running.length > 20 && running.every(w => w > 0 && w <= 0.05), `frame times after the rewind: ${running.map(w => w.toFixed(3))}`);
    assert.deepEqual(q.errors, []);
  } finally { await q.close(); }
});

test('no page or console errors', () => assert.deepEqual(p.errors, []));
