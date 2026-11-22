/* ---------- remembered settings, saved scenes, graphics quality ----------
   Kept in localStorage under three fixed keys, each a JSON object stamped with a version. Every access is wrapped: a private
   window, storage turned off or a full quota only means nothing is kept, and anything unreadable or from another version is
   ignored. A scene is the share-link snapshot (bodies, camera, scene scale; no gas or loose matter). Sound isn't remembered:
   browsers only let audio start from a tap or click. */
const KEYS = { prefs: 'ringdown.prefs', scenes: 'ringdown.scenes', last: 'ringdown.last' }, STORE_V = 1;
let storeErr = '';   // why the last write failed: 'full' or 'off'
function storeGet(k) {
  try { const o = JSON.parse(localStorage.getItem(k)); return o && typeof o === 'object' && o.v === STORE_V ? o : null; } catch (e) { return null; }
}
function storeSet(k, o) {
  try { localStorage.setItem(k, JSON.stringify(Object.assign({ v: STORE_V }, o))); return true; }
  catch (e) { storeErr = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) ? 'full' : 'off'; return false; }
}
const storeOff = (() => { try { localStorage.getItem(KEYS.prefs); return false; } catch (e) { return true; } })();

// Quality levels. High is the renderer as it always was; Auto starts there and steps the resolution down while frames run slow.
const QUALITY = {
  low:    { rs: 0.5,  bloom: 3, gas: 1800, mat: 3000, aa: false, surface: false, note: 'Half resolution, a tighter glow, less gas and loose matter, no anti-aliasing or surface detail' },
  medium: { rs: 0.75, bloom: 4, gas: 3000, mat: 5000, aa: true, surface: false, note: 'Three-quarter resolution, a little less glow, gas and matter, no surface detail' },
  high:   { rs: 1, bloom: 5, gas: MAXG - 800, mat: MAXM, aa: true, surface: true, note: 'Full resolution, glow, detail and budgets, always' },
  auto:   { rs: 1, bloom: 5, gas: MAXG - 800, mat: MAXM, aa: true, surface: true, note: 'Full quality; the resolution steps down while frames run slow and back up when they recover' },
};
const AUTO_RS = [1, 0.85, 0.7, 0.55];
let autoK = 0;
/* Frame timing, in windows of a third of a second, drives the readout and Auto. Auto steps down after 1.5 s under ~36 fps and keeps
   the step only if frames got at least 10% faster (otherwise resolution isn't what's slow: it steps back and leaves it alone for a
   while). It steps up after 6 s of frames over ~50 fps, and waits twice as long (up to 5 minutes) each time a step up had to be taken back. */
const pf = { prev: 0, t0: 0, n: 0, sum: 0, slow: 0, slowMs: 0, fast: 0, hold: 0, chk: null, lock: 0, lockMs: 30000, upWait: 6, upAt: -1e9 };
const fpsEl = document.body.appendChild(document.createElement('div'));
fpsEl.className = 'fps mono'; fpsEl.hidden = true;
// the readout sits under the strain scope, which grows once its readouts fill in: keep its bottom edge current
if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--scope-b', Math.round(document.querySelector('.scope').getBoundingClientRect().bottom) + 'px')).observe(document.querySelector('.scope'));
function perfTick(now) {
  const dt = now - pf.prev; pf.prev = now;
  if (!(dt > 0) || dt > 1000) { pf.n = pf.sum = 0; pf.t0 = now; return; }   // first frame, or back from a hidden tab
  pf.n++; pf.sum += dt;
  const span = now - pf.t0; if (span < 333) return;
  const ms = pf.sum / pf.n; pf.n = pf.sum = 0; pf.t0 = now;
  fpsEl.hidden = !opt.fps;
  if (opt.fps) fpsEl.innerHTML = `<b>${Math.round(1000 / ms)}</b> fps · <b>${ms.toFixed(1)}</b> ms${Q.rs < 1 ? ` · <b>${Math.round(Q.rs * 100)}%</b> res` : ''}`;
  if (Q.mode === 'auto') autoStep(ms, span / 1000, now);
  if (!$('panel').hidden) syncQuality();
}
function autoStep(ms, w, now) {
  if (now < pf.hold) return;   // settling after a change
  if (pf.chk) {   // just stepped down: did it help?
    pf.chk.sum += ms; if (++pf.chk.n < 3) return;
    const after = pf.chk.sum / pf.chk.n, before = pf.chk.before; pf.chk = null;
    if (after > before * 0.9) { setAutoRS(autoK - 1, now); pf.lock = now + pf.lockMs; pf.lockMs = Math.min(pf.lockMs * 2, 300000); }
    return;
  }
  if (ms > 28) { pf.slow += w; pf.slowMs += ms * w; pf.fast = 0; } else if (ms < 20) { pf.fast += w; pf.slow = pf.slowMs = 0; } else pf.slow = pf.slowMs = pf.fast = 0;
  if (pf.slow >= 1.5 && autoK < AUTO_RS.length - 1 && now >= pf.lock) {
    if (now - pf.upAt < 10000) pf.upWait = Math.min(pf.upWait * 2, 300);   // the last step up didn't hold
    pf.chk = { before: pf.slowMs / pf.slow, sum: 0, n: 0 }; setAutoRS(autoK + 1, now);
  } else if (pf.fast >= pf.upWait && autoK > 0) { pf.upAt = now; setAutoRS(autoK - 1, now); }
}
function setAutoRS(k, now) { autoK = k; Q.rs = AUTO_RS[k]; pf.slow = pf.slowMs = pf.fast = 0; pf.hold = now + 1000; resize(); syncQuality(); }
function setQuality(mode, save) {
  Q.mode = QUALITY[mode] ? mode : 'auto';
  const L = QUALITY[Q.mode]; Q.rs = L.rs; Q.bloom = L.bloom; Q.gas = L.gas; Q.mat = L.mat; GFX.aa = L.aa; GFX.surface = L.surface;
  autoK = 0; Object.assign(pf, { slow: 0, slowMs: 0, fast: 0, chk: null, lock: 0, lockMs: 30000, upWait: 6, hold: performance.now() - wallBack + 1000 });
  gasCap = Math.min(Q.gas, Math.max(gasCap, 3200));
  resize(); syncQuality();
  if (save) savePrefs();
}
function syncQuality() {
  for (const r of document.querySelectorAll('input[name=quality]')) r.checked = r.value === Q.mode;
  const glow = (!gl ? 'no glow without WebGL2' : opt.bloom ? `glow ${Q.bloom} levels` : 'glow off') + (gl ? ` · anti-aliasing ${GFX.aa ? 'on' : 'off'} · surface detail ${GFX.surface ? 'on' : 'off'}` : '');
  const out = `${view.width}×${view.height}`, note = `${QUALITY[Q.mode].note}. Now: ${Math.round(Q.rs * 100)}% resolution · ${glow} · up to ${Q.gas.toLocaleString('en-US')} gas and ${Q.mat.toLocaleString('en-US')} matter particles.`;
  if ($('qOut').textContent !== out) $('qOut').textContent = out;
  if ($('qNote').textContent !== note) $('qNote').textContent = note;
}

// settings: every toggle but follow (camera state that each scene load resets), the speed and the quality
const PREF_OPTS = TOGGLES.filter(k => k !== 'follow');
function savePrefs() { storeSet(KEYS.prefs, { opt: Object.fromEntries(PREF_OPTS.map(k => [k, opt[k]])), speed: SPEEDS[speedIdx], quality: Q.mode }); }
function loadPrefs() {
  const p = storeGet(KEYS.prefs); if (!p) return 'auto';
  if (p.opt && typeof p.opt === 'object') for (const k of PREF_OPTS) if (typeof p.opt[k] === 'boolean') opt[k] = p.opt[k];
  const i = SPEEDS.indexOf(p.speed); if (i >= 0) { speedIdx = i; $('speed').textContent = SPEEDS[i] + '×'; }
  return QUALITY[p.quality] ? p.quality : 'auto';
}

// saved scenes, and the last session (saved every 15 s and when the page is hidden, once the viewer has done something in it)
const SCENE_MAX = 24, SCENE_BYTES = 100000;
let scenes = [], lastSess = null, touched = false, resumeEl = null;
const okSnap = s => !!s && typeof s === 'object' && Array.isArray(s.b) && s.b.length <= 200
  && s.b.every(a => Array.isArray(a) && (a[0] === 'h' ? a.slice(1, 7) : a[0] === 's' ? a.slice(2, 10) : [NaN]).every(Number.isFinite) && a.length >= (a[0] === 'h' ? 7 : 10));
const okScene = x => !!x && typeof x.name === 'string' && /^[a-z0-9]{1,20}$/.test(x.id) && Number.isFinite(x.t) && okSnap(x.s);
const when = t => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : when(t); };
const objs = n => `${n} object${n === 1 ? '' : 's'}`;
const sceneTag = s => PRESETS[s.p] ? PRESETS[s.p].name.split(' · ')[0] : 'Scene';
function sceneNote(t, warn) { const el = $('scnNote'); el.textContent = t; el.classList.toggle('warn', !!warn); }
function putScenes(prev) {   // write the list; if that fails, put the old one back and say why
  if (storeSet(KEYS.scenes, { list: scenes })) return true;
  scenes = prev;
  sceneNote(storeErr === 'full' ? 'Browser storage is full, so that wasn’t saved. Delete a scene and try again.'
    : 'This browser window isn’t keeping site data (a private window, or storage turned off), so scenes can’t be saved here.', true);
  return false;
}
function renderScenes() {
  const ul = $('scnList'); ul.replaceChildren();
  for (const sc of scenes) {
    const li = document.createElement('li'); li.dataset.id = sc.id;
    li.innerHTML = '<div class="scn-head"><b></b><span></span></div><div class="scn-acts"><button class="follow-x" type="button" data-a="load">Load</button>'
      + '<button class="follow-x" type="button" data-a="ren">Rename</button><button class="ins-del" type="button" data-a="del">Delete</button></div>';
    li.querySelector('b').textContent = li.querySelector('b').title = sc.name;
    li.querySelector('.scn-head span').textContent = `${objs(sc.n)} · ${when(sc.t)}`;
    for (const b of li.querySelectorAll('button')) b.setAttribute('aria-label', `${b.textContent} scene “${sc.name}”`);
    ul.appendChild(li);
  }
  const r = $('scnResume'); r.hidden = !lastSess;
  if (lastSess) { r.innerHTML = '<span>Resume last session</span><small></small>'; r.querySelector('small').textContent = `${sceneTag(lastSess.s)} · ${objs(lastSess.n)} · ${ago(lastSess.t)}`; }
}
const focusRow = (id, a) => { const b = $('scnList').querySelector(`li[data-id="${id}"] [data-a="${a}"]`); if (b) b.focus(); };
function saveScene() {
  const inp = $('scnName');
  if (!bodies.length) return sceneNote('There is nothing in the scene to save yet.', true);
  if (scenes.length >= SCENE_MAX) return sceneNote(`${SCENE_MAX} saved scenes is the limit. Delete one to make room.`, true);
  const s = snapshot();
  if (JSON.stringify(s).length > SCENE_BYTES) return sceneNote('This scene is too big to keep.', true);
  const base = inp.value.trim().slice(0, 40) || `${sceneTag(s)} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  let name = base; for (let k = 2; scenes.some(x => x.name === name); k++) name = `${base} (${k})`;
  const prev = scenes.slice();
  scenes.unshift({ id: Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), name, n: bodies.length, t: Date.now(), s });
  if (!putScenes(prev)) return;
  inp.value = ''; renderScenes(); sceneNote(`Saved “${name}”.`);
}
function loadScene(st) {
  try { restore(st); } catch (e) { loadPreset(currentPreset); sceneNote('That scene couldn’t be read, so the default scene is shown instead.', true); return false; }
  touched = true; return true;
}
function resumeLast() {
  if (!lastSess || !loadScene(lastSess.s)) return;
  toast('Session resumed', [`${objs(bodies.length)}, where you left them`, 'Gas and loose matter aren’t kept between visits'], '', { ui: true });
  lastSess = null; hideResume(); renderScenes();
}
function hideResume() { if (resumeEl) { resumeEl.remove(); resumeEl = null; } }
function offerResume() {   // a small notice, never a silent swap; a shared link in the address always wins
  if (!lastSess || /^s1[zr]-/.test(location.hash.slice(1))) return;
  resumeEl = document.body.appendChild(document.createElement('div'));
  resumeEl.className = 'resume'; resumeEl.setAttribute('role', 'status');
  resumeEl.innerHTML = '<div><h3>Last session</h3><p></p></div><button class="follow-x" type="button" data-a="go" aria-label="Resume last session">Resume</button>'
    + '<button class="ins-x" type="button" data-a="x" aria-label="Dismiss"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  resumeEl.querySelector('p').textContent = `${sceneTag(lastSess.s)} · ${objs(lastSess.n)} · ${ago(lastSess.t)}`;
  resumeEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.dataset.a === 'go' ? resumeLast() : hideResume(); });
  setTimeout(hideResume, 30000);
}
function saveLast() {
  if (!touched) return;
  if (bodies.length) storeSet(KEYS.last, { t: Date.now(), s: snapshot() });
  else try { localStorage.removeItem(KEYS.last); } catch (e) {}
}
setInterval(() => { if (!document.hidden) saveLast(); }, 15000);
addEventListener('visibilitychange', () => { if (document.hidden) saveLast(); });
addEventListener('pagehide', saveLast);
for (const ev of ['pointerdown', 'click', 'change']) addEventListener(ev, e => { if (e.target.closest && e.target.closest('#ui,#inspect,#clear,#preset')) touched = true; }, true);
addEventListener('hashchange', hideResume);
$('gear').addEventListener('click', () => { if (!$('panel').hidden) { renderScenes(); syncQuality(); } });   // fresh "how long ago" times

$('panel').addEventListener('change', e => {
  if (e.target.name === 'quality') setQuality(e.target.value, true);
  else if (e.target.closest('.tog')) { fpsEl.hidden = !opt.fps; if (opt.fps && !fpsEl.textContent) fpsEl.textContent = '– fps'; syncQuality(); savePrefs(); }
});
$('speed').addEventListener('click', savePrefs);
$('scnSave').addEventListener('click', saveScene);
$('scnName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveScene(); } else if (e.key === 'Escape') e.stopPropagation(); });
$('scnResume').addEventListener('click', resumeLast);
$('scnList').addEventListener('click', e => {
  const b = e.target.closest('button'), li = b && b.closest('li'); if (!li) return;
  const sc = scenes.find(x => x.id === li.dataset.id); if (!sc) return;
  const acts = li.querySelector('.scn-acts'), a = b.dataset.a;
  if (a === 'load') { if (loadScene(sc.s)) toast('Scene loaded', [`“${sc.name}”: ${objs(bodies.length)}, as saved`, 'Gas and loose matter aren’t kept with a scene'], '', { ui: true }); }
  else if (a === 'ren') {
    li.querySelector('.scn-head').innerHTML = '<input class="scn-in" maxlength="40" autocomplete="off" enterkeyhint="done">';
    const inp = li.querySelector('input'); inp.value = sc.name; inp.setAttribute('aria-label', `New name for scene “${sc.name}”`);
    acts.innerHTML = '<button class="follow-x" type="button" data-a="ren-ok">Save name</button><button class="follow-x" type="button" data-a="back">Cancel</button>';
    acts.dataset.back = 'ren'; inp.focus(); inp.select();
  } else if (a === 'ren-ok') {
    const v = li.querySelector('input').value.trim().slice(0, 40);
    if (!v) return li.querySelector('input').focus();
    if (scenes.some(x => x !== sc && x.name === v)) { sceneNote(`There is already a scene called “${v}”.`, true); return li.querySelector('input').focus(); }
    const prev = scenes.map(x => Object.assign({}, x)); sc.name = v;
    if (putScenes(prev)) sceneNote(`Renamed to “${v}”.`);
    renderScenes(); focusRow(sc.id, 'ren');
  } else if (a === 'del') {
    acts.innerHTML = '<span class="q"></span><button class="ins-del arm" type="button" data-a="del-ok">Delete</button><button class="follow-x" type="button" data-a="back">Keep</button>';
    acts.querySelector('.q').textContent = `Delete “${sc.name}”? This can’t be undone.`;
    acts.dataset.back = 'del'; acts.querySelector('[data-a="back"]').focus();
  } else if (a === 'del-ok') {
    const prev = scenes.slice(); scenes = scenes.filter(x => x !== sc);
    if (putScenes(prev)) { sceneNote(`Deleted “${sc.name}”.`); renderScenes(); $('scnName').focus(); } else { renderScenes(); focusRow(sc.id, 'del'); }
  } else if (a === 'back') { const k = acts.dataset.back; renderScenes(); focusRow(sc.id, k); }
});
$('scnList').addEventListener('keydown', e => {
  const li = e.target.closest('li'); if (!li) return;
  if (e.key === 'Escape') { const back = li.querySelector('[data-a="back"]'); if (back) { e.stopPropagation(); back.click(); } }
  else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); li.querySelector('[data-a="ren-ok"]').click(); }
});

setQuality(loadPrefs()); syncToggles(); fpsEl.hidden = !opt.fps;
loadScenes();
{ const o = storeGet(KEYS.last); lastSess = o && Number.isFinite(o.t) && okSnap(o.s) && o.s.b.length ? { t: o.t, n: o.s.b.length, s: o.s } : null; }
renderScenes();
sceneNote(storeOff ? 'This browser window isn’t keeping site data, so settings and scenes won’t be remembered.' : 'A scene keeps its bodies, camera and view. Gas and loose matter aren’t kept.', storeOff);
offerResume();
function loadScenes() { const o = storeGet(KEYS.scenes); scenes = o && Array.isArray(o.list) ? o.list.filter(okScene).slice(0, SCENE_MAX) : []; }

presetSel.value = currentPreset;
loadPreset(currentPreset);
loadFromHash();
