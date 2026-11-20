// Errors outside the frame loop (event handlers, timers, promises) show a short notice instead of failing silently,
// and a repeating error shows it once, not over and over.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, openPage } = require('./helpers');

let server, browser;
before(async () => { server = await serve(); browser = await launch(); });
after(async () => { await browser.close(); server.close(); });

const notices = (page, re) => page.evaluate(src => [...document.querySelectorAll('#toasts .toast')].filter(t => new RegExp(src).test(t.textContent)).length, re.source);

test('an uncaught error shows one notice, even when it repeats', async () => {
  const p = await openPage(browser, server);
  try {
    await p.page.evaluate(() => { for (let i = 0; i < 6; i++) setTimeout(() => { throw new Error('rdtest boom'); }, 20 * i); });
    await p.page.waitForFunction(() => /rdtest boom/.test(document.getElementById('toasts').textContent), null, { timeout: 5000 });
    await p.page.waitForTimeout(400);
    assert.equal(await notices(p.page, /rdtest boom/), 1);
    assert.equal(p.errors.filter(e => /rdtest boom/.test(e)).length, 6, 'the errors should still reach the console');
  } finally { await p.close(); }
});

test('an unhandled promise rejection shows a notice', async () => {
  const p = await openPage(browser, server);
  try {
    await p.page.evaluate(() => { setTimeout(() => Promise.reject(new Error('rdtest rejected')), 0); });
    await p.page.waitForFunction(() => /rdtest rejected/.test(document.getElementById('toasts').textContent), null, { timeout: 5000 });
    assert.equal(await notices(p.page, /rdtest rejected/), 1);
  } finally { await p.close(); }
});
