#!/usr/bin/env node
// Builds the site into dist/. No dependencies: node build.mjs [--watch]
//
// The page ships as one self-contained index.html, but it is written as the files under src/.
// src/index.html is the shell; every line of the form
//
//     /*@include js/physics.js*/
//
// is replaced by that file's contents, as they are. The styles all land in one <style> and the scripts in one
// <script>, in the order the shell lists them, so the script files share a single scope: nothing is imported or
// exported, and a file can use anything declared in another.
//
// Every file under src/css and src/js must be included exactly once, so a new file can't be left out by mistake.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');
const STATIC = ['sw.js', 'manifest.webmanifest', '.nojekyll', 'assets'];   // copied next to the page as they are
const INCLUDE = /^\/\*@include (\S+?)\*\/\n/gm;

function page() {
  const seen = new Map();
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8').replace(INCLUDE, (line, rel) => {
    seen.set(rel, (seen.get(rel) || 0) + 1);
    const file = path.join(SRC, rel);
    if (!fs.existsSync(file)) throw new Error(`src/index.html includes ${rel}, which does not exist`);
    const text = fs.readFileSync(file, 'utf8');
    if (!text.endsWith('\n')) throw new Error(`src/${rel} must end with a newline`);
    return text;
  });
  const twice = [...seen].filter(([, n]) => n > 1).map(([rel]) => rel);
  if (twice.length) throw new Error(`included more than once in src/index.html: ${twice.join(', ')}`);
  const missing = ['css', 'js'].flatMap(dir => fs.readdirSync(path.join(SRC, dir), { recursive: true })
    .map(f => `${dir}/${String(f).split(path.sep).join('/')}`)
    .filter(rel => fs.statSync(path.join(SRC, rel)).isFile() && !seen.has(rel)));
  if (missing.length) throw new Error(`not included in src/index.html: ${missing.join(', ')}`);
  if (html.includes('/*@include')) throw new Error('an /*@include ...*/ in src/index.html is not on a line of its own');
  return html;
}

function build() {
  const html = page();   // before touching dist/, so a failed build leaves the last good one
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  for (const name of STATIC) fs.cpSync(path.join(ROOT, name), path.join(OUT, name), { recursive: true });
  console.log(`dist/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} kB  ${new Date().toLocaleTimeString()}`);
}

if (process.argv.includes('--watch')) {
  const attempt = () => { try { build(); } catch (err) { console.error(`build failed: ${err.message}`); } };
  let timer;
  attempt();
  fs.watch(SRC, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(attempt, 80); });
  console.log('watching src/ (Ctrl+C to stop)');
} else {
  try { build(); } catch (err) { console.error(`build failed: ${err.message}`); process.exit(1); }
}
