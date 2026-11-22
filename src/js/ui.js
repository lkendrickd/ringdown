/* ================= UI ================= */
const $ = id => document.getElementById(id);
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';
const TOGGLES = ['slow','lens','bloom','waves','jets','trails','labels','follow','fps'];
function syncPlay() { $('play').innerHTML = paused ? ICON_PLAY : ICON_PAUSE; $('play').setAttribute('aria-label', paused ? 'Play' : 'Pause'); }
function syncToggles() { for (const k of TOGGLES) $('t-' + k).checked = opt[k]; }

const presetSel = $('preset');
for (const [id, p] of Object.entries(PRESETS)) { const o = document.createElement('option'); o.value = id; o.textContent = p.name; presetSel.appendChild(o); }
presetSel.addEventListener('change', () => loadPreset(presetSel.value));
$('play').addEventListener('click', () => { paused = !paused; syncPlay(); });
$('speed').addEventListener('click', () => { speedIdx = (speedIdx + 1) % SPEEDS.length; $('speed').textContent = SPEEDS[speedIdx] + '×'; });
$('gear').addEventListener('click', () => {
  const p = $('panel'); p.hidden = !p.hidden;
  $('gear').setAttribute('aria-expanded', String(!p.hidden)); $('gear').setAttribute('aria-pressed', String(!p.hidden));
});
// clean view: one tap hides every overlay, one more brings them back
function setClean(on) {
  document.documentElement.classList.toggle('clean', on);
  $('clean').setAttribute('aria-pressed', String(on));
  $('clean').setAttribute('aria-label', on ? 'Show the controls' : 'Hide the controls');
  if (on) { $('panel').hidden = true; $('gear').setAttribute('aria-expanded', 'false'); $('gear').setAttribute('aria-pressed', 'false'); }
  requestAnimationFrame(() => { resize(); if (typeof toolsEdges === 'function') toolsEdges(); });
}
$('clean').addEventListener('click', () => setClean(!document.documentElement.classList.contains('clean')));
// phone: tap the strain strip to open the full scope
$('scope').closest('.scope').addEventListener('click', e => {
  if (!document.documentElement.classList.contains('phone') || e.target.closest('.listen,.vol')) return;
  e.currentTarget.classList.toggle('open'); requestAnimationFrame(resize);
});
$('gw').addEventListener('input', e => { gwBoost = +e.target.value; $('gwOut').textContent = gwBoost === 0 ? 'off' : gwBoost === 1 ? '1× real' : gwBoost + '×'; });
$('tilt').addEventListener('input', e => setTilt(+e.target.value));
for (const k of TOGGLES) $('t-' + k).addEventListener('change', e => { opt[k] = e.target.checked; renderMoveCtx(true); if (k === 'trails' && !opt.trails) bodies.forEach(b => b.trail.length = 0); });
$('fit').addEventListener('click', () => { fitBodies(); renderMoveCtx(true); });
$('clear').addEventListener('click', () => { bodies = []; gN = 0; gwSrc = null; totalFed = 0; totalWind = 0; xrBuf.fill(0); flashes.length = 0; scopeBuf.fill(0); scopeMark.fill(0); freqBuf.fill(0); });
$('sound').addEventListener('click', () => {
  if (!au && !initAudio()) { toast('No audio', ['This browser does not support Web Audio'], '', { ui: true }); return; }
  soundOn = !soundOn; $('sound').setAttribute('aria-pressed', String(soundOn)); $('vol').hidden = !soundOn;
  sndPower();
});
$('vol').addEventListener('input', e => { vol = +e.target.value; sndPower(); });
// soft clicks for buttons, toggles and the scenario menu (the dispatch path, since a handler may have replaced the target)
addEventListener('click', e => { if (e.composedPath().some(n => n.matches && n.matches('button,input[type=checkbox]'))) sfx('click'); });
presetSel.addEventListener('change', () => sfx('click'));

const TOOLS = [
  { id:'move', label:'Move', icon:'<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>' },
  { id:'bh', label:'Black hole' },
  { id:'matter', label:'Matter', icon:'<svg viewBox="0 0 24 24"><circle cx="7" cy="8" r="1.6"/><circle cx="14" cy="6" r="1.1"/><circle cx="17" cy="12" r="1.8"/><circle cx="9" cy="15" r="1.3"/><circle cx="14" cy="18" r="1"/></svg>' },
  ...STAR_TYPES.filter(t => !t.hidden).flatMap((t, i, a) => (i === 0 || a[i - 1].g !== t.g ? [{ sep: true }] : []).concat([{ id:t.id, label:t.short, col:t.col }])),
];
const toolsEl = $('tools');
const CHIPS = TOOLS.filter(t => !t.sep);
for (const t of TOOLS) {
  if (t.sep) { const d = document.createElement('span'); d.className = 'tsep'; d.setAttribute('aria-hidden', 'true'); toolsEl.appendChild(d); continue; }
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button'; b.dataset.tool = t.id; b.setAttribute('role', 'radio');
  const sw = t.icon ? t.icon : t.id === 'bh' ? '<span class="sw bh"></span>' : t.id === 'NS' ? '<span class="sw ns"></span>'
    : `<span class="sw" style="background:rgb(${t.col});color:rgba(${t.col},.55)"></span>`;
  b.innerHTML = `${sw}<span>${t.label}</span>`;
  b.addEventListener('click', () => setTool(t.id));
  toolsEl.appendChild(b);
}
function spinText() { return Math.abs(bhSpin) < 0.005 ? 'χ 0 · none' : `χ ${fmtChi(bhSpin)} ${bhSpin > 0 ? '↺' : '↻'}`; }
function setTool(id) {
  tool = id;
  for (const b of toolsEl.querySelectorAll('.chip')) { const on = b.dataset.tool === id; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  const ctx = $('ctx');
  if (id === 'bh') {
    ctx.innerHTML = `<span class="grp"><label for="bhMass"><b>Mass</b></label><input id="bhMass" type="range" min="3" max="80" step="1" value="${bhMass}"><output id="bhMassOut" class="mono">${bhMass} M☉</output></span>`
      + `<span class="grp"><label for="bhSpin"><b>Spin</b></label><input id="bhSpin" type="range" min="-0.99" max="0.99" step="0.01" value="${bhSpin}"><output id="bhSpinOut" class="mono">${spinText()}</output></span>`
      + `<span class="hint">Tap: orbit · Drag: throw</span>`;
    $('bhMass').addEventListener('input', e => { bhMass = +e.target.value; $('bhMassOut').textContent = bhMass + ' M☉'; });
    $('bhSpin').addEventListener('input', e => { bhSpin = +e.target.value; if (Math.abs(bhSpin) < 0.03) bhSpin = 0; $('bhSpinOut').textContent = spinText(); });
  } else if (id === 'matter') {
    const txt = () => `${massStr(Math.pow(10, matterRate))} a second`;
    ctx.innerHTML = `<b>Raw matter</b><span class="grp"><label for="mRate"><b>Flow</b></label><input id="mRate" type="range" min="-10" max="1.5" step="0.1" value="${matterRate}"><output id="mRateOut" class="mono">${txt()}</output></span>`
      + `<span class="hint">Hold and drag to pour it out. Near a body it goes into orbit. Enough of it falls together into moons, planets or stars</span>`;
    $('mRate').addEventListener('input', e => { matterRate = +e.target.value; $('mRateOut').textContent = txt(); });
  } else if (id === 'move') {
    renderMoveCtx(true);
  } else if (id === 'NS') {
    ctx.innerHTML = `<span class="sw ns"></span><b>Neutron star</b><span class="mono dim">1.4 M☉ · 12 km · true size</span><span class="hint">Pair two up to hear them merge</span>`;
  } else {
    const t = TYPE[id];
    ctx.innerHTML = `<span class="sw" style="background:rgb(${t.col});color:rgba(${t.col},.55)"></span><b>${t.name}</b>${t.eg ? `<span class="dim">${t.eg}</span>` : ''}<span class="mono dim">${t.kind === 'planet' ? massStr(t.m) : t.m + ' M☉'} · ${t.T.toLocaleString('en-US')} K</span><span class="hint">${t.kind === 'planet' ? 'Tap: orbit · Drag: throw · Inside the dashed Roche limit it is torn into a ring' : 'Tap: orbit · Drag: throw'}</span>`;
  }
  if (id !== 'move' && id !== 'matter') {
    const u = document.createElement('button'); u.className = 'follow-x'; u.type = 'button'; u.textContent = 'Undo';
    u.title = 'Remove the last object you placed (Ctrl+Z)'; u.addEventListener('click', undoPlace); ctx.appendChild(u);
  }
  ui.style.cursor = id === 'move' ? 'grab' : 'crosshair';
  requestAnimationFrame(() => document.documentElement.style.setProperty('--dock-h', $('dock').offsetHeight + 'px'));
}
// toolbar: the mouse wheel scrolls it sideways, and the edges fade where more stars are hidden
const tsc = $('tscroll'), tth = tsc.querySelector('.thumb');
function toolsEdges() {
  const max = toolsEl.scrollWidth - toolsEl.clientWidth;
  toolsEl.classList.toggle('more-l', toolsEl.scrollLeft > 2);
  toolsEl.classList.toggle('more-r', toolsEl.scrollLeft < max - 2);
  // always-visible scrollbar under the toolbar (native ones hide on macOS and phones)
  tsc.hidden = max <= 2;
  if (max > 2) {
    const w = toolsEl.offsetWidth; tsc.style.width = w + 'px';
    const tw = Math.max(36, w * toolsEl.clientWidth / toolsEl.scrollWidth);
    tth.style.width = tw + 'px'; tth.style.left = ((w - tw) * toolsEl.scrollLeft / max) + 'px';
  }
}
let tDrag = null;
tsc.addEventListener('pointerdown', e => {
  const max = toolsEl.scrollWidth - toolsEl.clientWidth, w = tsc.offsetWidth, tw = tth.offsetWidth;
  const r = tsc.getBoundingClientRect(), x = e.clientX - r.left, thumbL = parseFloat(tth.style.left) || 0;
  if (e.target !== tth) toolsEl.scrollLeft = clamp((x - tw / 2) / Math.max(w - tw, 1), 0, 1) * max; // click the track: jump there
  tDrag = { x: e.clientX, s: toolsEl.scrollLeft, k: max / Math.max(w - tw, 1) };
  tsc.setPointerCapture(e.pointerId); tth.classList.add('drag'); e.preventDefault();
});
tsc.addEventListener('pointermove', e => { if (tDrag) toolsEl.scrollLeft = tDrag.s + (e.clientX - tDrag.x) * tDrag.k; });
const tEnd = () => { tDrag = null; tth.classList.remove('drag'); };
tsc.addEventListener('pointerup', tEnd); tsc.addEventListener('pointercancel', tEnd);
toolsEl.addEventListener('wheel', e => {
  if (toolsEl.scrollWidth <= toolsEl.clientWidth) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!d) return;
  toolsEl.scrollLeft += d; e.preventDefault();
}, { passive: false });
toolsEl.addEventListener('scroll', toolsEdges, { passive: true });
addEventListener('resize', toolsEdges);
const coarse = matchMedia('(pointer: coarse)').matches;
let moveKey = '';
function renderMoveCtx(force) {
  if (tool !== 'move') return;
  const label = focusLabel();
  const key = `${opt.follow}|${followId}|${focusGroup().map(b => b.id).join(',')}`;
  if (!force && key === moveKey) { // same focus: just refresh the text (masses change as things feed)
    const t = $('ctx').querySelector('.tgt'); if (t && t.textContent !== label) t.textContent = label;
    return;
  }
  moveKey = key;
  const ctx = $('ctx');
  const help = coarse ? 'Drag: pan · Pinch: zoom & twist · Tap an object: inspect' : 'Drag: pan · Right-drag: tilt & rotate · Scroll: zoom · Click an object: inspect';
  let head, btn = '';
  if (!opt.follow) { head = '<b>Free camera</b>'; btn = '<button class="follow-x" type="button" data-act="recenter">Recenter</button>'; }
  else if (followId != null) { head = `<b>Following</b><span class="tgt">${label}</span>`; btn = '<button class="follow-x" type="button" data-act="auto">Auto</button>'; }
  else head = `<b>Auto focus</b><span class="tgt">${label}</span>`;
  ctx.innerHTML = `${head}${btn}<span class="hint">${help}</span>`;
  const b = ctx.querySelector('[data-act]');
  if (b) b.addEventListener('click', () => { if (b.dataset.act === 'auto') followId = null; opt.follow = true; syncToggles(); renderMoveCtx(true); });
  requestAnimationFrame(() => document.documentElement.style.setProperty('--dock-h', $('dock').offsetHeight + 'px'));
}
const insEl = $('inspect');
// phone: the inspector sheet starts compact; tap its title for the full readout and the edit controls
insEl.addEventListener('click', e => { if (e.target.closest('.ins-head h2')) insEl.classList.toggle('full'); });
let insKey = '', insRefs = null;
function kindName(b) { return (b.label ? b.label + ' · ' : '') + (b.kind === 'bh' ? 'Black hole' : b.type.name); }
function swatchHTML(b) {
  if (b.kind === 'bh') return '<span class="sw bh"></span>';
  if (isNS(b)) return '<span class="sw ns"></span>';
  const col = b.col || b.type.col;
  return `<span class="sw" style="background:rgb(${col});color:rgba(${col},.55)"></span>`;
}
function fmtSec(t) {
  if (t < 1) return `${(t * 1000).toFixed(t < 0.01 ? 2 : 0)} ms`;
  if (t < 120) return `${t.toFixed(t < 10 ? 2 : 1)} s`;
  if (t < 7200) return `${(t / 60).toFixed(1)} min`;
  if (t < 172800) return `${(t / 3600).toFixed(1)} h`;
  if (t < 3.156e7 * 1.5) return `${(t / 86400).toFixed(t < 864000 ? 1 : 0)} days`;
  return `${(t / 3.156e7).toFixed(t < 3.156e8 ? 1 : 0)} years`;
}
function fmtMass(m) { return m >= 1e5 ? m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : m >= 10 ? m.toFixed(4) : m.toFixed(5); }
function partnerOf(b) {
  let best = null, ba = 0;
  for (const o of bodies) { if (o === b) continue; const a = o.m / ((o.x - b.x) ** 2 + (o.y - b.y) ** 2 + (o.z - b.z) ** 2 + 1e-6); if (a > ba) { ba = a; best = o; } }
  return best;
}
function orbitText(b) {
  const o = partnerOf(b); if (!o) return 'alone';
  const r = sepOf(b, o), GM = G * (o.m + b.m);
  const E = 0.5 * ((o.vx - b.vx) ** 2 + (o.vy - b.vy) ** 2 + (o.vz - b.vz) ** 2) - GM / r;
  const who = o.kind === 'bh' ? `${fmtM(o.m)} M☉ hole` : o.label || o.type.lc;
  if (E >= 0) return `passing a ${who} · ${fmtDist(r * KM_PER_UNIT)}`;
  const a = -GM / (2 * E), P = 2 * Math.PI * Math.sqrt(a * a * a / GM) * SIM2REAL;
  return `${who} · ${fmtDist(r * KM_PER_UNIT)} · ${fmtSec(P)}`;
}
// rows: [label, value function] for each kind of body
function inspectRows(b) {
  if (b.kind === 'bh') return [
    ['Spin χ', () => `${fmtChi(b.chi)} ${b.chi > 0 ? '↺' : b.chi < 0 ? '↻' : ''}`],
    ['Horizon radius', () => `${fmtDist(b.kPlus * rsOf(b.m) * KM_PER_UNIT)}`],
    ['Innermost stable orbit', () => `${fmtDist(3 * b.kP * rsOf(b.m) * KM_PER_UNIT)}`],
    ['Eaten so far', () => `${(b.fedTotal || 0).toFixed(4)} M☉`],
    ['Blown out by its disk', () => `${(b.windM || 0).toFixed(4)} M☉`],
    ['Jet', () => { const j = jetPower(b); if (j < 0.03) return 'off'; const v = apparentJetSpeed(); return sinI < 0.05 ? `${Math.round(j * 100)}% · pointed at you` : `${Math.round(j * 100)}% · knots appear ${v.toFixed(1)}c${v > 1 ? ' (illusion)' : ''}`; }],
    ['Nearest partner', () => orbitText(b)],
  ];
  if (isNS(b)) return [
    ['Spin', () => b.spinHz >= 100 ? `${Math.round(b.spinHz)}/s · ${(1000 / b.spinHz).toFixed(2)} ms` : b.spinHz < 1 ? `one turn every ${(1 / b.spinHz).toFixed(1)} s` : `${b.spinHz.toFixed(1)}/s`],
    ['Radius', () => '12 km'],
    ...(isMag(b) ? [['Magnetic field', () => 'about 10¹¹ tesla · 1,000× a pulsar'], ['Giant flares', () => String(b.flares || 0)]] : []),
    ['Collapse limit', () => `${fmtM(b.m)} of ~2.3 M☉ (${Math.round(b.m / 2.3 * 100)}%)`],
    ['Eaten so far', () => `${(b.fedTotal || 0).toFixed(4)} M☉`],
    ['Blown out by its disk', () => `${(b.windM || 0).toFixed(4)} M☉`],
    ['Nearest partner', () => orbitText(b)],
  ];
  if (isPlanet(b)) {
    const re = () => planetRsun(b.m) / REARTH_SUN, rk = () => b.real ? b.R * KM_PER_UNIT : planetRsun(b.m) * 696000;
    return [
      ...(b.type.eg && !b.label ? [['Real example', () => b.type.eg.replace(/^like /, '')]] : []),
      ['Radius', () => `${fmtKm(rk())} km${b.real ? '' : ' (drawn larger here)'}`],
      ['Surface gravity', () => { const g = (b.m / MEARTH) / Math.pow(rk() / 6371, 2); return `${g >= 0.1 ? g.toFixed(2) : g.toPrecision(2)} g`; }],
      ['Escape speed', () => `${(11.186 * Math.sqrt((b.m / MEARTH) / (rk() / 6371))).toFixed(2)} km/s`],
      ['Roche limit', () => b.roche ? `${fmtDist(b.roche * KM_PER_UNIT)} (it orbits ${(1 / Math.max(b.f, 1e-9)).toFixed(1)}× farther out)` : '—'],
      ['Gathered so far', () => b.fedTotal ? massStr(b.fedTotal) : '—'],
      ['Nearest partner', () => orbitText(b)],
    ];
  }
  const tr = lifeTrack(b);
  const rows = [
    ...(tr && tr.stages.length > 1 ? [['Life ahead', () => tr.stages.slice(1).map(s => STAGE_NAME[s]).join(' → ')]] : []),
    ...(b.type.eg ? [['Real example', () => b.type.eg.replace(/^like /, '')]] : []),
    ['Surface temperature', () => `${b.type.T.toLocaleString('en-US')} K`],
    ['Roche lobe filled', () => b.f > 0 ? `${Math.round(b.f * 100)}%` : '—'],
    ['Lost so far', () => { const l = Math.max(0, b.mBirth - b.m); return `${l.toFixed(4)} M☉ (${(l / b.mBirth * 100).toFixed(1)}%)`; }],
  ];
  if (b.type.kind === 'giant') rows.push(['Envelope left', () => `${Math.max(0, b.m - b.core).toFixed(4)} M☉ over a ${fmtM(b.core)} M☉ core`]);
  if (b.passes) rows.push(['Close passes survived', () => String(b.passes)]);
  if (b.type.kind === 'wd') rows.push(['Chandrasekhar limit', () => `${fmtM(b.m)} of 1.44 M☉`],
    ['Fed so far', () => `${(b.fedTotal || 0).toFixed(4)} M☉`], ['Novae', () => String(b.novae || 0)]);
  rows.push(['Nearest partner', () => orbitText(b)]);
  return rows;
}
function statusOf(b) {
  if (b.sn) return [b.sn.mode === 'ia' ? 'Type Ia supernova under way' : b.sn.mode === 'pi' ? 'Pair-instability supernova under way' : b.sn.mode === 'dc' ? 'Collapsing straight into a black hole' : 'Core collapse under way', 'hot'];
  if (b.kind === 'bh' || isNS(b)) {
    if (b.ring && b.kind === 'bh') return ['Ringing down after a merger', 'feed'];
    return (b.feedRate || 0) > 1e-4 ? ['Feeding on infalling gas', 'feed'] : ['Quiet', ''];
  }
  if (isPlanet(b)) return b.hot && wallNow - b.hot < 30000 ? ['Molten from an impact', 'hot'] : b.f > 0.75 ? [`Close to being pulled apart (${Math.round(b.f * 100)}% of the way to the Roche limit)`, 'hot'] : ['Stable', ''];
  if (b.f > 1) return [b.passes ? `Close pass: overflowing its Roche lobe (${Math.round(b.f * 100)}%)` : `Losing mass: overflowing its Roche lobe (${Math.round(b.f * 100)}%)`, 'hot'];
  if (b.f > WIND_F && windyKind(b.type.kind)) return [`Leaking a thin wind to its companion (Roche lobe ${Math.round(b.f * 100)}% full)`, ''];
  if (b.f > 0.85) return [`Close to overflowing (Roche lobe ${Math.round(b.f * 100)}% full)`, ''];
  if (b.m < b.mBirth * 0.999) return ['Stripped, now stable', ''];
  return ['Stable', ''];
}
function actionsHTML(b) {
  if (b.kind !== 'star' || isNS(b) || isPlanet(b)) return '';
  const tr = lifeTrack(b), hasHole = bodies.some(o => o.kind === 'bh');
  const next = tr && tr.stages.length > 1 ? tr.stages[1] : null;
  const btns = [];
  if (next && next !== 'SN') btns.push(`<button class="ins-act age" type="button"${b.grow ? ' disabled' : ''} title="Skips about ${fmtYears(tr.wait || 0)}">${b.grow ? 'Changing…' : 'Age it · ' + STAGE_NAME[next]}</button>`);
  if (canSupernova(b) || b.sn) btns.push(`<button class="ins-act sn" type="button"${b.sn ? ' disabled' : ''}>${b.sn ? 'Collapsing…' : 'Go supernova'}</button>`);
  if (hasHole && !b.sn) btns.push(`<button class="ins-act cu" type="button" aria-pressed="${closeUpId === b.id}">${closeUpId === b.id ? 'Exit close-up' : 'Close-up'}</button>`);
  let note = '';
  if (tr && tr.note) note = tr.note;
  else if (!canSupernova(b) && !b.sn && next !== 'SN' && !(tr && tr.stages.includes('SN'))) note = snBlocker(b).replace(/ Try the O star or the blue supergiant\.$/, '');
  return (btns.length ? `<div class="ins-acts">${btns.join('')}</div>` : '') + (note ? `<p class="ins-note">${note}</p>` : '');
}
function updateInspect() {
  const b = followId != null ? bodies.find(o => o.id === followId) : null;
  if (!b) { if (!insEl.hidden) { insEl.hidden = true; insKey = ''; } return; }
  const key = `${b.id}|${b.kind === 'bh' ? 'bh' : b.type.id}|${b.passes || 0}|${b.sn ? 1 : 0}|${b.grow ? 1 : 0}|${closeUpId === b.id ? 1 : 0}|${bodies.some(o => o.kind === 'bh') ? 1 : 0}`;
  if (key !== insKey) {
    insKey = key;
    const rows = inspectRows(b);
    insEl.innerHTML = `<div class="ins-head">${swatchHTML(b)}<h2></h2><button class="ins-x" type="button" aria-label="Close and go back to auto focus"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="ins-mass"><span class="lbl">Mass</span><span class="big"><span class="mv"></span><small class="mu">M☉</small></span><span class="ins-rate"></span></div>
      <div class="ins-status"></div>
      ${actionsHTML(b)}
      <dl class="ins-rows">${rows.map(r => `<dt>${r[0]}</dt><dd></dd>`).join('')}</dl>
      <details class="ins-edit"><summary>Edit</summary>
        <div class="ins-form">
          <label for="insMass">Mass (${massUnit(b).u})<input id="insMass" type="number" step="any" min="${massBounds(b)[0] / massUnit(b).k}" max="${massBounds(b)[1] / massUnit(b).k}" value="${+(b.m / massUnit(b).k).toPrecision(4)}"></label>
          ${b.kind === 'bh' ? `<label for="insSpin">Spin χ<input id="insSpin" type="number" step="0.01" min="-0.99" max="0.99" value="${b.chi.toFixed(2)}"></label>` : ''}
          <button class="follow-x" type="button" data-act="set">Set</button>
        </div>
        <button class="ins-del" type="button">Delete</button>
      </details>`;
    insEl.querySelector('h2').textContent = kindName(b);
    const on = (sel, fn) => { const el = insEl.querySelector(sel); if (el && !el.disabled) el.addEventListener('click', fn); };
    on('.ins-act.sn', () => { startSupernova(b); updateInspect(); });
    on('.ins-act.age', () => { ageStar(b); updateInspect(); });
    on('.ins-act.cu', () => { toggleCloseUp(b); updateInspect(); });
    on('[data-act=set]', () => {
      const m = parseFloat($('insMass').value) * insRefs.k, sp = $('insSpin') ? parseFloat($('insSpin').value) : NaN;
      applyEdit(b, m, sp); insKey = ''; updateInspect();
    });
    const del = insEl.querySelector('.ins-del'); let armed = 0;
    del.addEventListener('click', () => {
      if (wallNow - armed < 3000) { deleteBody(b); updateInspect(); return; }
      armed = wallNow; del.classList.add('arm'); del.textContent = 'Click again to delete';
      setTimeout(() => { if (del.isConnected) { del.classList.remove('arm'); del.textContent = 'Delete'; } }, 3000);
    });
    insEl.querySelector('.ins-x').addEventListener('click', () => { followId = null; opt.follow = true; syncToggles(); renderMoveCtx(true); updateInspect(); });
    const mu0 = massUnit(b); insEl.querySelector('.mu').textContent = mu0.u;
    insRefs = { k: mu0.k, mv: insEl.querySelector('.mv'), rate: insEl.querySelector('.ins-rate'), st: insEl.querySelector('.ins-status'), dd: [...insEl.querySelectorAll('dd')], rows };
    insEl.hidden = false;
  }
  insRefs.mv.textContent = insRefs.k === 1 ? fmtMass(b.m) : (b.m / insRefs.k).toPrecision(5);
  const r = b.mRate || 0, mag = Math.abs(r);
  if (mag < (insRefs.k === 1 ? 2e-6 : 1e-4 * b.m)) { insRefs.rate.textContent = 'steady'; insRefs.rate.className = 'ins-rate'; }
  else {
    const digits = mag >= 0.01 ? 4 : mag >= 0.001 ? 5 : 6;
    insRefs.rate.textContent = `${r < 0 ? '▼ −' : '▲ +'}${insRefs.k === 1 ? mag.toFixed(digits) + ' M☉' : massStr(mag)} per ${warp > 1 ? 'screen' : 'sim'} second`;
    insRefs.rate.className = 'ins-rate ' + (r < 0 ? 'down' : 'up');
  }
  const [txt, cls] = statusOf(b);
  if (insRefs.st.textContent !== txt) insRefs.st.textContent = txt;
  insRefs.st.className = 'ins-status' + (cls ? ' ' + cls : '');
  insRefs.rows.forEach((row, i) => { const v = row[1](); if (insRefs.dd[i].textContent !== v) insRefs.dd[i].textContent = v; });
}
function undoPlace() {
  while (placed.length) {
    const id = placed.pop(), b = bodies.find(o => o.id === id);
    if (b) { bodies = bodies.filter(o => o !== b); if (followId === id) followId = null; computeAccel(); toast('Removed', [`${describe(b)} taken back out`], '', { ui: true }); return; }
  }
  toast('Nothing to undo', ['Objects you place can be removed here, newest first'], '', { ui: true });
}
toolsEl.addEventListener('keydown', e => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = CHIPS.findIndex(t => t.id === tool), n = (i + (e.key === 'ArrowRight' ? 1 : -1) + CHIPS.length) % CHIPS.length;
  setTool(CHIPS[n].id); toolsEl.querySelectorAll('.chip')[n].focus(); e.preventDefault();
});

const toastsEl = $('toasts');
toastsEl.addEventListener('click', e => { const t = e.target.closest('.toast'); if (t) t.remove(); });
// data goes to the event log with it. Notices about the interface rather than the simulation (a screenshot saved, a link
// loaded, an error) pass { ui: true }, so the timeline leaves them off its markers; notices something checks for carry a
// stable id and the numbers, e.g. { id: 'typeia', ... }, so nothing has to match on their wording
function toast(title, lines, kind, data) {
  logEvent(title, kind, data);
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `<h3${kind === 'w' ? ' class="w"' : ''}></h3><ul class="mono"></ul>`;
  el.querySelector('h3').textContent = title;
  const ul = el.querySelector('ul'); for (const l of lines) { const li = document.createElement('li'); li.textContent = l; ul.appendChild(li); }
  toastsEl.appendChild(el); say(`${title}. ${lines.join('. ')}`);
  while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 520); }, kind === 'w' ? 11000 : 6500);
}
// Errors outside the frame loop (event handlers, timers, promises) get a short notice instead of failing silently.
// One notice every 10 seconds at most, so an error that keeps repeating doesn't bury the screen.
let errNoticeAt = -1e9;
function errorNotice(err) {
  const t = performance.now(); if (t - errNoticeAt < 10000) return; errNoticeAt = t;
  toast('Something glitched', [String((err && err.message) || err || 'Unknown error').slice(0, 160), 'The simulation keeps running; reloading the page clears it'], '', { ui: true });
}
addEventListener('error', e => errorNotice(e.error || e.message));
addEventListener('unhandledrejection', e => errorNotice(e.reason));

