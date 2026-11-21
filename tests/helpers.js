// Shared test setup: serve the built site (dist/, from `node build.mjs`) statically, open index.html?rdtest in headless
// Chromium and collect every error.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// Software WebGL (SwiftShader), the same on a laptop and on a CI runner with no GPU.
const launch = () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

/* Open the page and record every page error, console error and WebGL error message.
   opts.noWebGL: hide WebGL2 so the page takes its 2D-canvas fallback. opts.hash: a share-link code. */
async function openPage(browser, server, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 640, height: 400 } });   // desktop layout (phone mode starts at 560 px)
  const page = await context.newPage();
  const errors = [], webgl = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    const t = m.text();
    if (/WebGL: /.test(t)) webgl.push(t);   // e.g. "WebGL: CONTEXT_LOST_WEBGL: useProgram: context lost"
    if (m.type() === 'error' || /WebGL: INVALID|GL_INVALID/.test(t)) errors.push(`console.${m.type()}: ${t}`);
  });
  // keep the run hermetic: the page's only outside request is Google Fonts, answered here with an empty stylesheet
  await page.route(url => !url.href.startsWith('http://127.0.0.1'), route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  if (opts.noWebGL) await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(type) ? null : get.call(this, type, ...rest); };
  });
  const { port } = server.address();
  // generous: on a slow CI runner or a busy machine the page (and its software WebGL) can take far longer than 30 s to come up
  await page.goto(`http://127.0.0.1:${port}/index.html?rdtest${opts.hash ? '#' + opts.hash : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__rd, null, { timeout: 120000 });
  return { page, errors, webgl, close: () => context.close() };
}

module.exports = { serve, launch, openPage };
