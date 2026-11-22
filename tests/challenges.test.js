// Challenges: every one is played through by a script that only does what a person can do with the interface (place
// from the bar by click or drag, press an inspector button, use Edit, hold the Matter tool down, change the speed), and
// passes; and every starting scene, left alone, does not pass. Then the list, the goal card, storage, rewinds and cost.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser, pg;
test.before(async () => { server = await serve(); browser = await launch(); pg = await openPage(browser, server); });
test.after(async () => { await pg.close(); await browser.close(); server.close(); });

// a page at a real size, with the first-visit tour already seen (it would sit over the controls) and `store` in localStorage
async function openSized(vp, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  await ctx.route(url => !url.href.startsWith('http://127.0.0.1'), route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.addInitScript(([blocked]) => {
    if (blocked) { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); return; }
    if (!sessionStorage.getItem('rd-seeded')) { sessionStorage.setItem('rd-seeded', '1'); localStorage.setItem('ringdown.onboarding.v1', JSON.stringify({ tour: 'skipped', done: {} })); }
  }, [!!opts.blocked]);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  const url = `http://127.0.0.1:${server.address().port}/index.html?rdtest`;
  const go = async () => { await page.goto(url, { timeout: 120000 }); await page.waitForFunction(() => window.__rd, null, { timeout: 120000 }); };
  await go();
  return { page, errors, reload: go, close: () => ctx.close() };
}

/* Each scripted solution runs in the page with rd = window.__rd, right after the challenge has started.
   `max` is the most simulated wall-clock seconds (at the speed the solution sets) it may take to pass. */
const SOLVE = {
  star: { max: 60, how: rd => { rd.pour(0, 0, -0.5, 240); } },   // Flow at 0.3 M☉/s, held down for 4 s in the middle (over 12 seeds × 3 spots the lightest star made is 0.18 M☉)
  bhsn: { max: 20, how: rd => { const o = rd.place('BSG', 150, 0); rd.act(o, 'sn'); } },   // a blue supergiant (25 M☉, well past the 20 M☉ line) from the bar, Go supernova
  ring: { max: 20, how: rd => { const s = rd.bodies.find(b => b.label === 'Saturn'); rd.place('AST', s.x + 1.2 * s.R, s.y); } },   // an asteroid inside the red circle
  ratio: { max: 90, how: rd => { rd.place('bh', 100, 0, { mass: 8, spin: 0 }); } },   // Mass slider at 8 (10 to 1, not right on 8), click just outside the shadow
  nova: { max: 60, how: rd => { rd.place('K', 6, 0); } },   // a K dwarf right beside the white dwarf
  sun: { max: 30, how: rd => { const s = rd.bodies.find(b => b.label === 'Sun'); rd.act(s, 'age'); rd.step(240, 1000 / 60, false); rd.act(s, 'age'); } },   // Age it, wait for it to swell, Age it again
  msp: { max: 60, how: rd => { rd.place('WD', 6, 0); } },   // a white dwarf right next to the neutron star
  strip: { max: 40, how: rd => { const f = rd.feedRings('RG', 12); rd.place('RG', 0.9 * f.stream, 0); rd.speed = 6; } },   // a red giant between the stream and tear rings, at 64×
  typeia: { max: 90, how: rd => { rd.place('WD', 4.5, 0); } },   // a second white dwarf clicked very close
  spin: { max: 60, how: rd => { rd.place('bh', 0, 0, { mass: 30, spin: 0.9 }); rd.place('bh', 70, 0, { mass: 30, spin: 0.9 }); } },   // Spin slider at +0.9 for both
  nsleft: { max: 60, how: rd => { for (const ns of rd.bodies) rd.edit(ns, 1.15); rd.speed = 4; } },   // Edit → 1.15 M☉ for each, then 4×
  moon: { max: 60, how: rd => { const e = rd.bodies[0]; rd.pour(e.x + 6 * e.R, e.y, -7.4, 120); rd.speed = 6; } },   // Flow 0.013 Earth masses/s, 2 s at 6 Earth radii, then 64× (over 8 seeds × 2 spots it passes within 330 frames of 3600)
};
/* The wrong way: it does something, but not the thing the challenge asks for. Each must visibly have happened (`saw`,
   matched against the readout and the latest notices), so a control can't pass for want of anything happening. */
const WRONG = {
  star: { saw: /Biggest clump: [\d.]+ Jupiter masses/, how: rd => { rd.pour(0, 0, -2.5, 120); } },   // a thirtieth of the flow: a gas giant, not a star
  bhsn: { saw: /That one left a neutron star/, how: rd => { rd.act(rd.bodies[0], 'sn'); } },   // Betelgeuse itself (18 M☉)
  ring: { saw: /Closest: 1\.\d+× its Roche limit/, how: rd => { const s = rd.bodies.find(b => b.label === 'Saturn'); rd.place('AST', s.x + 2.2 * s.R, s.y); } },   // outside the limit
  ratio: { saw: /That merger was 2\.7 to 1/, how: rd => { rd.place('bh', 100, 0, { mass: 30, spin: 0 }); } },   // 80 + 30
  nova: { saw: /Novae: 0 of 3 · the star fills \d+% of its Roche lobe/, how: rd => { rd.place('K', 13, 0); } },   // too far to fill its Roche lobe
  sun: { saw: /Earth’s orbit: 1\.0\d AU · needs 1\.5 · the Sun: 1\.00 M☉ \| .*Now a red giant/, how: rd => { rd.act(rd.bodies.find(b => b.label === 'Sun'), 'age'); } },   // swelling alone loses no mass
  msp: { saw: /Spin: \d\.\d turns a second/, how: rd => { rd.place('K', 16, 0); } },   // too far to feed it
  strip: { saw: /Tidal disruption/, how: rd => { const f = rd.feedRings('RG', 12); rd.place('RG', 0.5 * f.stream, 0); rd.speed = 6; } },   // inside the tear ring: shredded, not stripped
  typeia: { saw: /by hand doesn’t count/, how: rd => { rd.edit(rd.bodies[0], 1.5); } },   // the Edit box is not physics
  spin: { saw: /That merger left spin 0\.6\d/, how: rd => { rd.place('bh', 0, 0, { mass: 30, spin: 0.9 }); rd.place('bh', 70, 0, { mass: 30, spin: -0.9 }); } },   // one spin against the orbit
  nsleft: { saw: /That one collapsed into a black hole/, how: () => {} },   // untouched: they merge, into a black hole
  moon: { saw: /Biggest moon: 0\.[0-6]\d/, how: rd => { const e = rd.bodies[0]; rd.pour(e.x + 6 * e.R, e.y, -8.4, 120); rd.speed = 6; } },   // a tenth as much: only small moonlets
};

// start a challenge, run `src` (a function of rd) if given, then step until it passes or the time is up
function play(id, src, max, speed) {
  return pg.page.evaluate(([id, src, max, speed]) => {
    const rd = window.__rd;
    if (!rd.chal.start(id, 7)) return { error: 'no such challenge' };
    // count every frame from the start, the scripted moves' own (a pour, a wait) included, and note the one it passes on
    let n = 0, wonAt = -1; const count = () => { n++; if (wonAt < 0 && rd.chal.state.won) wonAt = n; }; rd.frameHooks.push(count);
    if (speed != null) rd.speed = speed;
    if (src) (0, eval)('(' + src + ')')(rd);
    const t0 = rd.simTime, texts = [rd.chal.state.text];
    let frames = 0;   // one frame at a time, so the frame it passes on is exact
    while (frames < max * 60 && !rd.chal.state.won) { rd.step(1, 1000 / 60, false); frames++; if (frames % 600 === 0) texts.push(rd.chal.state.text); }
    rd.frameHooks.splice(rd.frameHooks.indexOf(count), 1);
    // the whole state where the run stopped (on passing, or at the end of the scripted moves if it passed during them),
    // to show a run plays out the same every time
    const fp = [rd.bodies.length, rd.gN, rd.qN, rd.bodies.reduce((s, b) => s + b.m, 0).toPrecision(12), rd.seed, rd.simTime.toFixed(9)].join('|');
    const st = rd.chal.state, out = { won: st.won, text: st.text, frames, wonAt, fp, sim: rd.simTime - t0, texts, titles: rd.events.map(e => e.title).slice(-8) };
    rd.chal.stop();
    return out;
  }, [id, src, max, speed]);
}

test('the list: about a dozen challenges, easy to hard, each with a goal and a level', async () => {
  const list = await pg.page.evaluate(() => window.__rd.chal.list);
  assert.ok(list.length >= 10 && list.length <= 12, `${list.length} challenges`);
  const rank = { Easy: 0, Medium: 1, Hard: 2 };
  for (let i = 1; i < list.length; i++) assert.ok(rank[list[i].lvl] >= rank[list[i - 1].lvl], `${list[i].id} is not out of order`);
  for (const c of list) { assert.ok(c.goal.length > 20 && c.goal.length < 120, c.id); assert.ok(SOLVE[c.id], `${c.id} has a scripted solution in this file`); }
  assert.deepEqual(pg.errors, []);
});

for (const id of Object.keys(SOLVE)) {
  test(`${id}: the scripted solution passes; the untouched start${WRONG[id] ? ' and the wrong way do' : ' does'} not`, async () => {
    const s = SOLVE[id];
    const yes = await play(id, s.how.toString(), s.max);
    assert.ok(yes.won, `${id} should pass: ${JSON.stringify(yes)}`);
    console.log(`${id}: passed on frame ${yes.wonAt} from the start (${(yes.wonAt / 60).toFixed(2)} s screen time) · state ${yes.fp}`);
    // left alone: as long as the solution was given, at 1×, and as long again at 64× (16× in the Solar System, a century)
    const idle = await play(id, null, s.max);
    assert.equal(idle.won, false, `${id} passed by itself at 1×: ${JSON.stringify(idle)}`);
    const fast = await play(id, null, Math.min(s.max, 30), id === 'sun' ? 5 : 6);
    assert.equal(fast.won, false, `${id} passed by itself at speed: ${JSON.stringify(fast)}`);
    if (WRONG[id]) {
      const no = await play(id, WRONG[id].how.toString(), s.max);
      assert.equal(no.won, false, `${id} passed the wrong way: ${JSON.stringify(no)}`);
      assert.match(`${no.text} | ${no.titles.join(' | ')}`, WRONG[id].saw, `${id}: the wrong way didn't do what it should have: ${JSON.stringify(no)}`);
    }
    assert.deepEqual(pg.errors, []);
  });
}

// Empty space is framed on wherever the camera already was, and a pour is a fixed point on the screen: if a run started
// from the camera the last scene left behind, the same moves would land matter somewhere slightly different every time.
test('the same moves play out the same, whatever camera the scene before left behind', async () => {
  const r = await pg.page.evaluate(() => {
    const rd = window.__rd, runs = [];
    for (const [x, y] of [[0, 0], [40, -25], [-1500, 900], [0.05, 0.67]]) {
      rd.load('empty', 1); rd.view({ x, y }); rd.step(1, 1000 / 60, false);   // leave the camera somewhere
      rd.chal.start('star', 7); rd.pour(0, 0, -1, 120);
      let won = -1; for (let f = 1; f <= 1200; f++) { rd.step(1, 1000 / 60, false); if (won < 0 && rd.chal.state.won) won = f; }
      runs.push(`${won} ${rd.bodies.length}|${rd.qN}|${rd.bodies.reduce((s, b) => s + b.m, 0).toPrecision(12)}|${rd.seed}`);
      rd.chal.stop();
    }
    return runs;
  });
  assert.equal(new Set(r).size, 1, `runs differ by the camera they started from: ${r.join(' / ')}`);
  assert.deepEqual(pg.errors, []);
});

test('the card: starts from the list, reveals a hint, starts over, and leaving goes back to free play with nothing left running', async () => {
  const { page, errors, close } = await openSized({ width: 1280, height: 800 });
  const before = await page.evaluate(() => ({ frame: window.__rd.frameHooks.length, event: window.__rd.eventHooks.length, hooked: window.__rd.chal.hooked }));
  assert.deepEqual(before.hooked, { frame: false, event: false });
  await page.evaluate(() => window.__rd.prep());
  await page.click('#help');
  await page.click('#gtab-chal');
  assert.equal(await page.locator('#gpane-chal').isVisible(), true);
  assert.equal(await page.locator('#cList li').count(), await page.evaluate(() => window.__rd.chal.list.length));
  await page.click('#cList li:nth-child(4) button');   // the lopsided merger
  const on = await page.evaluate(() => ({ card: !document.getElementById('chal').hidden, guide: document.getElementById('guide').hidden, t: document.getElementById('chalT').textContent,
    prog: document.getElementById('chalProg').textContent, st: window.__rd.chal.state, hooked: window.__rd.chal.hooked,
    holes: window.__rd.bodies.filter(b => b.kind === 'bh').map(b => b.m), live: document.getElementById('live').textContent,
    current: document.querySelector('#cList li:nth-child(4) button').getAttribute('aria-current') }));
  assert.equal(on.card, true); assert.equal(on.guide, true, 'the help panel closes');
  assert.equal(on.st.id, 'ratio'); assert.equal(on.t, 'A lopsided merger');
  assert.match(on.prog, /Place a second/);
  assert.deepEqual(on.hooked, { frame: true, event: true });
  assert.deepEqual(on.holes, [80]);
  assert.match(on.live, /Challenge: A lopsided merger/);
  assert.equal(on.current, 'true');
  assert.equal(await page.locator('#chalHint').isVisible(), false);
  await page.click('#chalHintB');
  assert.equal(await page.locator('#chalHint').isVisible(), true);
  assert.equal(await page.getAttribute('#chalHintB', 'aria-expanded'), 'true');
  // the readout follows what is placed
  const prog = await page.evaluate(() => { const rd = window.__rd; rd.place('bh', 100, 0, { mass: 30 }); rd.step(2, 1000 / 60, false); return document.getElementById('chalProg').textContent; });
  assert.match(prog, /Mass ratio: 2\.7 to 1/);
  await page.click('#chalAgain');
  assert.deepEqual(await page.evaluate(() => window.__rd.bodies.map(b => b.m)), [80], 'Start over puts the scene back');
  await page.click('#chalX');
  const off = await page.evaluate(() => ({ card: document.getElementById('chal').hidden, st: window.__rd.chal.state, frame: window.__rd.frameHooks.length, event: window.__rd.eventHooks.length,
    on: document.documentElement.classList.contains('chal-on'), focus: document.activeElement.id }));
  assert.equal(off.card, true); assert.equal(off.st, null); assert.equal(off.on, false);
  assert.equal(off.frame, before.frame); assert.equal(off.event, before.event);
  assert.equal(off.focus, 'help', 'focus goes back to the help button, not lost');
  assert.deepEqual(errors, []);
  await close();
});

test('loading another scene from the picker, or restoring one (share links and saved scenes), ends the challenge cleanly', async () => {
  const r = await pg.page.evaluate(() => {
    const rd = window.__rd, out = {}, sel = document.getElementById('preset');
    rd.chal.start('nova', 1); sel.value = 'kerr'; sel.dispatchEvent(new Event('change'));
    out.picker = [rd.chal.state, document.getElementById('chal').hidden, rd.chal.hooked];
    rd.chal.start('nova', 1); rd.open(rd.snapshot());
    out.restore = [rd.chal.state, document.getElementById('chal').hidden, rd.chal.hooked];
    return out;
  });
  assert.deepEqual(r.picker, [null, true, { frame: false, event: false }]);
  assert.deepEqual(r.restore, [null, true, { frame: false, event: false }]);
  assert.deepEqual(pg.errors, []);
});

test('passing: a notice that stays up, a screen-reader announcement, the card turns, and the list remembers it next visit', async () => {
  const { page, errors, reload, close } = await openSized({ width: 1280, height: 800 });
  const r = await page.evaluate(() => {
    const rd = window.__rd, mo = new MutationObserver(() => {});   // every notice added, read back below (callbacks can't run inside this script)
    rd.chal.start('star', 7); mo.observe(document.getElementById('toasts'), { childList: true }); rd.pour(0, 0, -1, 120);
    for (let f = 0; f < 3600 && !rd.chal.state.won; f++) rd.step(1, 1000 / 60, false);
    const seen = mo.takeRecords().flatMap(m => [...m.addedNodes]).map(n => n.querySelector('h3').textContent);
    const pass = [...document.querySelectorAll('.toast')].find(t => t.querySelector('h3').textContent === 'Challenge passed');
    return { won: rd.chal.state.won, cls: document.getElementById('chal').className, tag: document.getElementById('chalTag').textContent, goal: document.getElementById('chalGoal').textContent,
      seen, shown: !!pass && getComputedStyle(pass).display !== 'none', live: document.getElementById('live').textContent,
      ev: rd.events.filter(e => e.data && e.data.id === 'challenge').map(e => e.data.chal), next: !document.getElementById('chalNext').hidden,
      stored: JSON.parse(localStorage.getItem('ringdown.challenges')) };
  });
  assert.equal(r.won, true);
  assert.match(r.cls, /won/); assert.equal(r.tag, 'Passed'); assert.match(r.goal, /0\.075 M☉/);
  assert.ok(r.seen.includes('Challenge passed'), JSON.stringify(r.seen));
  assert.equal(r.shown, true);
  assert.match(r.live, /Challenge passed\. Light a star/);
  assert.match(r.live, /hot and dense enough to fuse hydrogen/, 'the lesson is read out too');
  assert.deepEqual(r.ev, ['star']);
  assert.equal(r.next, true);
  assert.ok(r.stored && r.stored.v === 1 && r.stored.done.star > 0, JSON.stringify(r.stored));
  // a newer notice does not push it out of sight
  const both = await page.evaluate(() => { const rd = window.__rd, s = rd.makeStar('O', 900, 900, 0, 0, 20); rd.add(s); rd.explode(s);
    return [...document.querySelectorAll('.toast')].filter(t => getComputedStyle(t).display !== 'none').map(t => t.querySelector('h3').textContent); });
  assert.deepEqual(both, ['Challenge passed', 'Supernova']);
  await reload();
  const again = await page.evaluate(() => ({ done: document.getElementById('cDone').textContent, first: document.querySelector('#cList li button').className,
    sr: document.querySelector('#cList li button .sr').textContent, st: window.__rd.chal.state }));
  assert.equal(again.done, '1'); assert.match(again.first, /done/); assert.equal(again.sr, ' (passed)'); assert.equal(again.st, null);
  assert.deepEqual(errors, []);
  await close();
});

test('with storage blocked a challenge still runs and passes; nothing is remembered and nothing breaks', async () => {
  const { page, errors, close } = await openSized({ width: 1280, height: 800 }, { blocked: true });
  const r = await page.evaluate(() => {
    const rd = window.__rd; rd.chal.start('bhsn', 7); const o = rd.place('O', 150, 0); rd.act(o, 'sn');
    for (let f = 0; f < 1200 && !rd.chal.state.won; f += 30) rd.step(30, 1000 / 60, false);
    return { won: rd.chal.state.won, done: document.getElementById('cDone').textContent };
  });
  assert.deepEqual(r, { won: true, done: '1' });   // counted for this visit, just not kept
  assert.deepEqual(errors, []);
  await close();
});

test('a rewind keeps a pass that was earned, and the readout follows the state it was put back to', async () => {
  const r = await pg.page.evaluate(() => {
    const rd = window.__rd, out = {};
    // passed, then put back to before it: still passed, readout from the restored state
    rd.chal.start('msp', 7); const ns = rd.bodies[0]; const tMid = rd.simTime; rd.place('WD', 6, 0);
    for (let f = 0; f < 3600 && !rd.chal.state.won; f += 30) rd.step(30, 1000 / 60, false);
    out.wonBefore = rd.chal.state.won;
    ns.spinHz = 2.5; rd.rewound(tMid);
    out.after = rd.chal.state;
    // not passed yet: a merger that didn't count is dropped from the readout by a rewind to before it
    rd.chal.start('spin', 7); rd.place('bh', 0, 0, { mass: 30, spin: 0 }); rd.place('bh', 70, 0, { mass: 30, spin: 0 });
    const t0 = rd.simTime;
    for (let f = 0; f < 3600 && !rd.events.some(e => e.data && e.data.id === 'bh-merge'); f += 30) rd.step(30, 1000 / 60, false);
    rd.step(2, 1000 / 60, false);
    out.lost = rd.chal.state.text;
    rd.bodies.length = 0; rd.rewound(t0);
    out.back = rd.chal.state;
    rd.chal.stop();
    return out;
  });
  assert.equal(r.wonBefore, true);
  assert.equal(r.after.won, true, 'the pass stays');
  assert.match(r.after.text, /Spin: 2\.5 turns a second/);
  assert.match(r.lost, /That merger left spin 0\.6\d/);
  assert.equal(r.back.won, false);
  assert.equal(r.back.text, 'Place two black holes');
  assert.deepEqual(pg.errors, []);
});


test('clean view and photo mode hide the card; it comes back with the controls', async () => {
  const { page, errors, close } = await openSized({ width: 1280, height: 800 });
  await page.evaluate(() => window.__rd.chal.start('ring', 3));
  assert.equal(await page.locator('#chal').isVisible(), true);
  await page.click('#clean');
  assert.equal(await page.locator('#chal').isVisible(), false);
  await page.click('#clean');
  assert.equal(await page.locator('#chal').isVisible(), true);
  await page.click('#photo');
  assert.equal(await page.locator('#chal').isVisible(), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#chal').isVisible(), true);
  assert.deepEqual(errors, []);
  await close();
});

test('keyboard: the Challenges tab, the list and the card are reachable by Tab and arrows; Esc closes the list', async () => {
  const { page, errors, close } = await openSized({ width: 1280, height: 800 });
  await page.focus('#help'); await page.keyboard.press('Enter');
  await page.focus('#gtab-try'); await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'gtab-chal');
  assert.equal(await page.locator('#gpane-chal').isVisible(), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'gtab-keys');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'gtab-chal');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('#cList')), true, 'Tab reaches the list');
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(ring, 'none', 'a focus ring shows');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#guide').isVisible(), false);
  await page.evaluate(() => window.__rd.chal.start('nova', 1));
  await page.focus('#clean'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'chalX', 'the card follows the bar in Tab order');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'chalHintB');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#chalHint').isVisible(), true);
  assert.deepEqual(errors, []);
  await close();
});

test('layout: the card stays clear of the scope, the bar, the inspector, the object bar and the notices, on desktop and phone', async () => {
  for (const vp of [{ width: 1280, height: 800 }, { width: 1366, height: 650 }, { width: 390, height: 844, mobile: true }, { width: 844, height: 390, mobile: true }]) {
    const at = `${vp.width}x${vp.height}`;
    const { page, errors, close } = await openSized(vp);
    await page.evaluate(() => {
      const rd = window.__rd; rd.chal.start('strip', 3);
      document.getElementById('chalHintB').click();   // the card at its tallest
      rd.view({ follow: rd.bodies[0].id });           // the inspector open on the hole
      for (const x of [600, -600]) { const s = rd.makeStar('O', x, 600, 0, 0, 20); rd.add(s); rd.explode(s); }   // two notices, raised the usual way
      rd.step(3, 1000 / 60, true);
    });
    await page.waitForTimeout(600);
    const box = await page.evaluate(() => {
      const r = el => { if (!el || el.hidden || !el.getClientRects().length || getComputedStyle(el).display === 'none') return null; const b = el.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      return { chal: r(document.getElementById('chal')), scope: r(document.querySelector('.scope')), bar: r(document.querySelector('.bar .ctrls')), inspect: r(document.getElementById('inspect')),
        tools: r(document.getElementById('tools')), ctx: r(document.getElementById('ctx')), toasts: [...document.querySelectorAll('.toast')].map(r).filter(Boolean), W: innerWidth, H: innerHeight };
    });
    const hit = (a, b) => a && b && a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1;
    assert.ok(box.chal, `card shown at ${at}`);
    assert.ok(box.chal[0] >= 0 && box.chal[2] <= box.W && box.chal[3] <= box.H, `card on screen at ${at}: ${box.chal}`);
    for (const k of ['scope', 'bar', 'inspect', 'tools', 'ctx']) assert.ok(!hit(box.chal, box[k]), `card overlaps the ${k} at ${at}: ${box.chal} / ${box[k]}`);
    assert.ok(box.toasts.length >= 1, `a notice shows at ${at}`);
    for (const t of box.toasts) assert.ok(!hit(box.chal, t), `card overlaps a notice at ${at}: ${box.chal} / ${t}`);
    assert.deepEqual(errors, []);
    await close();
  }
});

test('cost: nothing at all runs in free play; an active check takes a few microseconds a frame', async () => {
  const r = await pg.page.evaluate(() => {
    const rd = window.__rd, out = {};
    rd.load('solar', 1); out.free = rd.chal.hooked;
    const time = (id, setup) => {
      rd.chal.start(id, 1); if (setup) setup(rd); rd.step(5, 1000 / 60, false);
      const f = rd.chal.check(), n = 20000, t0 = performance.now(); for (let i = 0; i < n; i++) f(); const us = (performance.now() - t0) / n * 1000;
      rd.chal.stop(); return us;
    };
    out.sun = time('sun');   // the busiest scene: every body of the Solar System
    out.nova = time('nova', rd => rd.place('K', 6, 0));
    out.spin = time('spin', rd => { rd.place('bh', 0, 0, { mass: 30 }); rd.place('bh', 70, 0, { mass: 30 }); });
    // and the whole frame, with and without a challenge, in the same scene
    const frame = on => { if (on) rd.chal.start('sun', 1); else rd.load('solar', 1); rd.step(20, 1000 / 60, false); const t0 = performance.now(); rd.step(200, 1000 / 60, false); const ms = (performance.now() - t0) / 200; rd.chal.stop(); return ms; };
    out.frameOff = frame(false); out.frameOn = frame(true);
    return out;
  });
  console.log(`challenge check per frame: Solar System ${r.sun.toFixed(2)} µs, novae ${r.nova.toFixed(2)} µs, merger ${r.spin.toFixed(2)} µs; whole sim frame ${r.frameOff.toFixed(2)} ms off / ${r.frameOn.toFixed(2)} ms on`);
  assert.deepEqual(r.free, { frame: false, event: false });
  for (const k of ['sun', 'nova', 'spin']) assert.ok(r[k] < 50, `${k} check took ${r[k]} µs`);
  assert.deepEqual(pg.errors, []);
});
