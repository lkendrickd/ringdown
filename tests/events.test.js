// The event log and the hooks the timeline, graphs and challenges are built on.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser;
test.before(async () => { server = await serve(); browser = await launch(); });
test.after(async () => { await browser.close(); server.close(); });

test('a notice is logged as an event with the simulation time, and loading a scene empties the log', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(() => {
    const rd = window.__rd, out = {};
    rd.load('gw150914', 1); rd.step(30, 1000 / 60, false);
    const seen = []; rd.eventHooks.push(ev => seen.push(ev.title));
    const star = rd.makeStar('O', 400, 0, 0, 0, 30); rd.add(star); rd.explode(star);   // raises a supernova notice
    out.logged = rd.events.map(ev => [ev.title, ev.t]); out.simTime = rd.simTime; out.seen = seen.slice();
    out.direct = rd.logEvent('custom', '', { a: 1 }).data.a;
    rd.load('empty', 1); out.afterLoad = rd.events.length;
    return out;
  });
  assert.ok(r.logged.length >= 1, 'the supernova notice was logged');
  assert.equal(r.logged[r.logged.length - 1][1], r.simTime);
  assert.deepEqual(r.seen, r.logged.map(e => e[0]));
  assert.equal(r.direct, 1);
  assert.equal(r.afterLoad, 0);
  assert.deepEqual(errors, []);
  await close();
});

test('frame hooks run once per frame with the time that frame covered; scene hooks run on load and on restore', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(() => {
    const rd = window.__rd; let frames = 0, sim = 0, scenes = 0;
    rd.load('gw150914', 1);
    rd.frameHooks.push((simDt) => { frames++; sim += simDt; }); rd.sceneHooks.push(() => scenes++);
    const t0 = rd.simTime; rd.step(25, 1000 / 60, false); const dt = rd.simTime - t0;
    rd.load('kerr', 1); const st = rd.snapshot(); rd.restore(st);
    return { frames, sim, dt, scenes };
  });
  assert.equal(r.frames, 25);
  assert.ok(r.dt > 0 && Math.abs(r.sim - r.dt) < 1e-9 * Math.max(1, r.dt), `hooks saw ${r.sim} of ${r.dt}`);
  assert.equal(r.scenes, 2);
  assert.deepEqual(errors, []);
  await close();
});

test('rewound() drops the events after that moment and tells the rewind hooks the new time', async () => {
  const { page, errors, close } = await openPage(browser, server);
  const r = await page.evaluate(() => {
    const rd = window.__rd; rd.load('gw150914', 1);
    rd.logEvent('early'); rd.step(20, 1000 / 60, false); const mid = rd.simTime; rd.step(20, 1000 / 60, false); rd.logEvent('late');
    let told = null; rd.rewindHooks.push(t => { told = t; });
    rd.rewound(mid);
    return { titles: rd.events.map(ev => ev.title), told, mid };
  });
  assert.deepEqual(r.titles, ['early']);
  assert.equal(r.told, r.mid);
  assert.deepEqual(errors, []);
  await close();
});
