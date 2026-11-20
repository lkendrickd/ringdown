/* Ringdown service worker.
   The page is fetched network-first, revalidating past the HTTP cache, so a new deploy shows up on the next load
   whenever the network answers; the last good copy opens the app offline (or after 4 s on a network that hangs).
   Google Fonts are stale-while-revalidate, and the icons and manifest are precached. Only GET requests with an ok
   response are ever stored. The origin is shared with other sites, so only caches named ringdown-* are touched.
   Bump V when CORE changes. */
const V = 'ringdown-v1', FONTS = 'ringdown-fonts-v1';
const CORE = ['./', 'manifest.webmanifest', 'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png', 'assets/apple-touch-icon.png'];
const PAGE = new URL('./', self.location).href;
const ASSETS = new Set(CORE.map(u => new URL(u, self.location).href));
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// cache the font stylesheet the page links to, and every file it names, so even the first offline visit has the fonts
async function warmFonts(html) {
  const m = /href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(html); if (!m) return;
  const url = m[1].replace(/&amp;/g, '&'), c = await caches.open(FONTS), res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) return;
  const css = await res.clone().text();
  await c.put(url, res);
  await Promise.all([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(async ([, f]) => {
    const r = await fetch(f, { mode: 'cors', credentials: 'omit' }); if (r.ok) await c.put(f, r);
  }));
}

self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(V);
  await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
  try { await Promise.race([warmFonts(await (await c.match(PAGE)).text()), new Promise(ok => setTimeout(ok, 8000))]); }
  catch (err) { /* fonts are optional: the font stacks fall back */ }
  await self.skipWaiting();
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('ringdown-') && k !== V && k !== FONTS) await caches.delete(k);
  await self.clients.claim();
})()));

function page(e, app) {
  const net = fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' });
  e.waitUntil(net.then(res => { if (app && res.ok) { const copy = res.clone(); return caches.open(V).then(c => c.put(PAGE, copy)); } }).catch(() => {}));
  const old = () => caches.match(PAGE, { cacheName: V });
  const slow = new Promise(ok => setTimeout(ok, 4000)).then(old).then(hit => hit || net);
  return Promise.race([net, slow]).catch(() => old().then(hit => hit || Response.error()));
}

function swr(e, name) {
  const r = e.request, open = caches.open(name), net = fetch(r);
  e.waitUntil(net.then(res => { if (res.ok) { const copy = res.clone(); return open.then(c => c.put(r, copy)); } }).catch(() => {}));
  return open.then(c => c.match(r, { ignoreVary: true })).then(hit => hit || net)
    .catch(() => r.destination === 'style' ? new Response('', { headers: { 'Content-Type': 'text/css' } }) : Response.error());
}

self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url), href = u.origin + u.pathname;
  if (FONT_HOSTS.includes(u.hostname)) e.respondWith(swr(e, FONTS));
  else if (u.origin !== self.location.origin) return;
  else if (r.mode === 'navigate' || href === PAGE || href === PAGE + 'index.html') e.respondWith(page(e, href === PAGE || href === PAGE + 'index.html'));
  else if (ASSETS.has(href)) e.respondWith(swr(e, V));
});
