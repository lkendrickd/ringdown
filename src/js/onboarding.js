/* ================= onboarding: first-visit tour, things to try, help =================
   A five-step tour on the first visit (never when the page opens from a share link). Each coach mark points at the
   real control and moves on when the real thing happens in the sim; the physics reports those moments through
   reached(event). The same events tick off the Things to try list. What has been seen is kept under one versioned
   localStorage key, and every access is guarded: in private mode or with storage blocked nothing is remembered. */
const obStore = {
  key: 'ringdown.onboarding.v1',
  load() { try { const v = JSON.parse(localStorage.getItem(this.key)); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } },
  save(v) { try { localStorage.setItem(this.key, JSON.stringify(v)); } catch (e) {} },
};
const ob = obStore.load();
if (!ob.done || typeof ob.done !== 'object') ob.done = {};
function obScene(id, toolId) {
  presetSel.value = id; loadPreset(id); setTool(toolId || 'move');
  if (paused) { paused = false; syncPlay(); }
}
// one-click experiments; each is ticked off by the sim event of the same id
const TRY = [
  { id:'merge', t:'Merge two black holes', d:'36 + 29 M☉, like GW150914, with Listen on', hint:'Listen is on: the chirp climbs as they spiral in, then rings down. Time slows for the plunge.',
    go() { obScene('gw150914'); if (!soundOn) $('sound').click(); } },
  { id:'kilonova', t:'Smash two neutron stars', d:'A kilonova, like GW170817', hint:'They take about half a minute to spiral in. The flash is r-process ejecta: gold, platinum, uranium.', go() { obScene('bns'); } },
  { id:'typeia', t:'Type Ia supernova', d:'Feed a white dwarf past 1.44 M☉', hint:'Each nova leaves the white dwarf a little heavier. Past 1.44 M☉ carbon ignites and the whole star explodes.',
    go() { // the nova scene, with the white dwarf a few novae short of the Chandrasekhar limit
      obScene('nova'); bodies = [];
      const wd = makeStar('WD', 0, 0, 0, 0, 1.435), st = makeStar('K', 0, 0, 0, 0);
      bodies.push(wd, st); orbitAround(wd, st, 2.8 / (1.03 * rocheFrac(0.7 / wd.m)), 0); computeAccel(); } },
  { id:'tde', t:'Tear a star apart', d:'A red giant dives past a hole', hint:'Inside the tidal radius the hole pulls its near side harder than its far side, and it is spaghettified.', go() { obScene('tde'); } },
  { id:'msp', t:'Make a millisecond pulsar', d:'A neutron star eats a white dwarf', hint:'The white dwarf is shredded into a disk; feeding on it spins the neutron star up to hundreds of turns a second.', go() { obScene('wdns'); } },
  { id:'nova', t:'Set off a nova', d:'A K dwarf feeding a white dwarf', hint:'Hydrogen piles up on the white dwarf until it ignites in a thermonuclear flash, every few seconds here.', go() { obScene('nova'); } },
  { id:'supernova', t:'Make a star go supernova', d:'A Betelgeuse-like red supergiant', hint:'Press Go supernova in the inspector: the iron core collapses, bounces, and blows the envelope off.',
    go() { obScene('betelgeuse'); if (bodies[0]) { followId = bodies[0].id; renderMoveCtx(true); } } },
  { id:'rings', t:'Give a planet rings', d:'A moon strays inside Saturn’s Roche limit', hint:'Inside the Roche limit tides beat the moon’s own gravity, and its pieces spread into a ring.', go() { obScene('saturn'); } },
  { id:'impact', t:'Replay the Moon-forming impact', d:'Theia strikes the young Earth', hint:'After the hit, try 16× or 64×: the debris can gather into one Moon in a few minutes.', go() { obScene('theia'); } },
  { id:'star', t:'Build a star from raw matter', d:'Pour out gas and let it fall together', hint:'Hold and drag in the middle of the view. Past 0.075 M☉ a clump ignites as a star.',
    go() { matterRate = 0; obScene('empty', 'matter'); } },
  { id:'sgra', t:'Feed a star to Sgr A*', d:'The Milky Way’s 4.3 million M☉ hole', hint:'A Sun-like star is picked: drag from out past the S-stars toward the hole to throw it in, whole or torn apart.', go() { obScene('sgra', 'G'); } },
  { id:'stars', t:'Fly out to the nearest stars', d:'From the Sun past the Oort cloud', hint:'Zoom out (scroll or pinch) past the heliopause and the Oort cloud until Alpha Centauri comes into view.', go() { obScene('solar'); } },
];
// the tour: `at` gets the ring, the card sits beside `near` (default `at`); `act` is an optional shortcut, shown while need() holds
const TOUR = [
  { ev:'merge', at:'.sel', t:'Merge two black holes', b:'Two holes of 36 and 29 Suns, like GW150914, the first merger ever detected. Gravitational waves carry off their orbital energy, so they spiral together. Watch the strain scope.',
    act:'Load the pair', go: () => obScene('gw150914'), need: () => bhList().length < 2 },
  { ev:'sound', at:'#sound', near:'.scope', t:'Listen', b:'Turn on Listen to hear the waves, one octave up: a chirp that climbs as the holes close in, then the ringdown.',
    act:'Play it again', go: () => obScene('gw150914'), need: () => !closestPair(), already: () => soundOn,
    then: () => { if (!closestPair()) obScene('gw150914'); } },   // nothing left to hear: start a fresh pair
  { ev:'place', at:'#tools', near:'#dock', t:'Feed a star', b:'Pick a star in this bar, then click near a hole to put it in orbit, or drag to throw it. Close in, the hole strips it and feeds.',
    act:'Pick a red giant', go: () => setTool('RG'), need: () => !TYPE[tool] },
  { ev:'tilt', at:'#gizmo', t:'Tilt the view', b:(coarse ? 'Drag the view dial' : 'Drag the view dial, or right-drag or Shift-drag the scene,') + ' to see the orbit from the side: the disk brightens where it comes toward you, and jets show up.' },
  { ev:'guide', at:'#help', t:'Things to try', b:'Kilonovae, supernovae, rings, the impact that made the Moon: open Things to try for one-click experiments, or Challenges for goals that tell you when you get there. The controls are in there too.' },
];
const coach = $('coach'), ring = $('coachRing'), guide = $('guide');
let tourStep = -1, tourTilt = 0, tourYaw = 0, coachRaf = 0, coachKey = '', gTab = 'try';
function reached(ev) {
  const s = tourStep >= 0 ? TOUR[tourStep] : null;
  if (s && s.ev === ev && (ev !== 'tilt' || Math.abs(tiltDeg - tourTilt) >= 8 || Math.abs(Math.atan2(Math.sin(yaw - tourYaw), Math.cos(yaw - tourYaw))) >= 0.4)) {
    tourGo(tourStep + 1, coach.contains(document.activeElement)); if (s.then) s.then();
  }
  if (!ob.done[ev] && TRY.some(it => it.id === ev)) { ob.done[ev] = 1; obStore.save(ob); renderTry(); }
}
function tourGo(i, focus) {
  if (i >= TOUR.length) { tourEnd('done'); return; }
  const s = TOUR[i]; tourStep = i;
  if (s.already && s.already()) { tourGo(i + 1, focus); return; }
  tourTilt = tiltDeg; tourYaw = yaw;
  $('coachT').textContent = s.t; $('coachB').textContent = s.b; $('coachN').textContent = `${i + 1} / ${TOUR.length}`;
  const d = $('coachDo'); d.hidden = !s.act || !s.need(); d.textContent = s.act || '';
  $('coachNext').textContent = i === TOUR.length - 1 ? 'Finish' : 'Next';
  coach.hidden = false; coachKey = ''; coachPlace();
  if (focus) (d.hidden ? $('coachNext') : d).focus();
  if (!coachRaf) coachRaf = requestAnimationFrame(coachTick);
}
function tourEnd(how) {
  const had = coach.contains(document.activeElement);
  tourStep = -1; coach.hidden = true; ring.hidden = true;
  ob.tour = how; obStore.save(ob);
  if (had) $('help').focus();
}
function coachTick() { coachRaf = 0; if (tourStep < 0) return; coachPlace(); coachRaf = requestAnimationFrame(coachTick); }
// keep the card beside its control as the layout moves (phone sheets, the dock growing, rotation)
function coachPlace() {
  const away = !guide.hidden || !$('panel').hidden;   // out of the way while a sheet is open; back when it closes
  coach.classList.toggle('away', away); ring.classList.toggle('away', away);
  if (away) { coachKey = ''; return; }
  const s = TOUR[tourStep], a = document.querySelector(s.at), n = s.near ? document.querySelector(s.near) : a, sc = document.querySelector('.scope').getBoundingClientRect();
  const ok = a && n && a.getClientRects().length && n.getClientRects().length, W = innerWidth, H = innerHeight, cw = coach.offsetWidth, ch = coach.offsetHeight, m = 12;
  const r = ok ? a.getBoundingClientRect() : null, q = ok ? n.getBoundingClientRect() : null;
  const key = r ? [r.left, r.top, r.width, r.height, q.top, q.bottom, sc.bottom, W, H, ch].map(Math.round).join() : `-${W},${H},${ch}`;
  if (key === coachKey) return; coachKey = key;
  ring.hidden = !r;
  if (!r) { delete coach.dataset.side; coach.style.left = Math.max(m, (W - cw) / 2) + 'px'; coach.style.top = Math.max(m, (H - ch) / 3) + 'px'; return; }
  Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
  const below = q.top + q.height / 2 < H / 2, cx = r.left + r.width / 2, left = clamp(cx - cw / 2, m, Math.max(m, W - cw - m));
  let top = below ? q.bottom + 12 : q.top - 12 - ch;
  if (below && sc.height && sc.left < left + cw && sc.right > left && top < sc.bottom + 12) top = sc.bottom + 12;   // never over the strain scope (a phone's top strip)
  top = clamp(top, m, Math.max(m, H - ch - m));
  coach.style.left = left + 'px'; coach.style.top = top + 'px'; coach.style.setProperty('--ax', clamp(cx - left, 18, cw - 18) + 'px');
  const gap = below ? top - q.bottom : q.top - top - ch;
  if (gap > 0 && gap < 26 && cx > left && cx < left + cw) coach.dataset.side = below ? 'below' : 'above'; else delete coach.dataset.side;
}
$('coachDo').addEventListener('click', () => { const s = TOUR[tourStep]; if (s && s.go) s.go(); $('coachDo').hidden = true; $('coachNext').focus(); });
$('coachNext').addEventListener('click', () => tourGo(tourStep + 1, true));
$('coachSkip').addEventListener('click', () => tourEnd('skipped'));
// Things to try and the controls, in one panel
const gList = $('gList');
for (const it of TRY) {
  const li = document.createElement('li'), b = document.createElement('button');
  b.type = 'button'; b.className = 'g-item';
  b.innerHTML = '<span class="g-tick" aria-hidden="true"></span><span><b></b><small></small><span class="sr"></span></span>';
  b.querySelector('b').textContent = it.t; b.querySelector('small').textContent = it.d;
  b.addEventListener('click', () => { guideShow(false); $('help').focus(); it.go(); toast(it.t, [it.hint], 'w', { ui: true }); });
  it.el = b; li.appendChild(b); gList.appendChild(li);
}
function renderTry() {
  let n = 0;
  for (const it of TRY) { const on = !!ob.done[it.id]; n += on; it.el.classList.toggle('done', on); it.el.querySelector('.sr').textContent = on ? ' (done)' : ''; }
  $('gDone').textContent = n; $('gAll').textContent = TRY.length; $('gMeter').style.width = (100 * n / TRY.length) + '%';
}
const G_TABS = ['try', 'chal', 'keys'];
function guideTab(t) {
  gTab = t;
  for (const k of G_TABS) { const tab = $('gtab-' + k), on = k === t; tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; $('gpane-' + k).hidden = !on; }
}
function guideShow(on, t) {
  if (t) guideTab(t);
  if (on && !$('panel').hidden) $('gear').click();   // one sheet at a time
  guide.hidden = !on; $('help').setAttribute('aria-expanded', String(on)); $('help').setAttribute('aria-pressed', String(on));
  if (on) { guide.scrollTop = 0; reached('guide'); }
}
$('help').addEventListener('click', () => guideShow(guide.hidden));
$('guideX').addEventListener('click', () => { guideShow(false); $('help').focus(); });
for (const k of G_TABS) $('gtab-' + k).addEventListener('click', () => guideTab(k));
guide.querySelector('.g-tabs').addEventListener('keydown', e => {
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !e.target.matches('[role=tab]')) return;
  const t = G_TABS[(G_TABS.indexOf(gTab) + (e.key === 'ArrowRight' ? 1 : G_TABS.length - 1)) % G_TABS.length]; guideTab(t); $('gtab-' + t).focus(); e.preventDefault();
});
$('gTour').addEventListener('click', () => { guideShow(false); tourGo(0, true); });
$('gear').addEventListener('click', () => { if (!$('panel').hidden) guideShow(false); });
// events the tour waits for that come from the controls rather than the sim
$('sound').addEventListener('click', () => { if (soundOn) reached('sound'); });
$('tilt').addEventListener('input', () => reached('tilt'));
gz.addEventListener('keydown', () => reached('tilt'));
setInterval(() => { if (!ob.done.stars && landmarks && vw / zoom * KM_PER_UNIT > 8.8 * 9.461e12) reached('stars'); }, 1000);   // Alpha Centauri (4.4 ly) on screen
// Esc closes the help or skips the tour before it does anything else; ? opens the controls
addEventListener('keydown', e => {
  if (document.documentElement.classList.contains('clean') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape' && (!guide.hidden || (tourStep >= 0 && !coach.classList.contains('away')))) {
    if (!guide.hidden) { const had = guide.contains(document.activeElement); guideShow(false); if (had) $('help').focus(); } else tourEnd('skipped');
    e.preventDefault(); e.stopPropagation(); return;
  }
  if (e.key === '?' && !(e.target.closest && e.target.closest('input,select,textarea'))) { e.preventDefault(); guideShow(guide.hidden || gTab !== 'keys', 'keys'); }
}, true);
renderTry();
if (!ob.tour && !/^s1[zr]-/.test(location.hash.slice(1))) setTimeout(() => { if (tourStep < 0 && !ob.tour) tourGo(0, false); }, 900);
