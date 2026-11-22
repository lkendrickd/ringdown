/* ================= graphs: light curve, mass over time, HR diagram =================
   A second instrument under the strain scope. Everything is sampled once a frame (frameHooks) into bounded
   "accordion" series: each keeps the whole run since the scene began, and whenever one fills up, neighbouring
   samples are merged in pairs and the sampling interval doubles. Memory stays fixed, and nothing brief is lost:
   every merged sample keeps the range it covered (and the light curve keeps its brightest moment).
   Drawing happens only while the panel is open and on screen.

   Brightness, temperature and luminosity are derived here from what the simulation already tracks:
   - a star's temperature and luminosity come from its type (each carries a real temperature and radius, and
     L = R² T⁴ in solar units); main-sequence stars follow a curve through the sim's own types, so feeding or
     stripping one slides it along; giants follow their radius (so they brighten as they swell); white dwarfs
     follow the mass-radius relation; a giant whose envelope is nearly gone heats up at the same luminosity.
   - gas falling onto a hole, neutron star or white dwarf shines with the accretor's efficiency, measured against
     the rate at which the sim itself treats a hole as feeding flat out (its disk glow and winds saturate there),
     called the Eddington limit here; above it the light only grows logarithmically, as in real disks.
   - explosions take their peak from the strength the renderer gives each flash, calibrated to real peaks, and
     a real light curve's shape squeezed into the seconds that flash lasts. */

const T_SUN = 5772, L_EDD = 3.3e4;   // L☉ per M☉ of the accretor: the Eddington luminosity for hydrogen-rich gas
const typeL = t => t.Rsun * t.Rsun * Math.pow(t.T / T_SUN, 4);
// the main sequence through the sim's own main-sequence types: [log mass, log T, log L]
const MS_PTS = ['M', 'K', 'G', 'F', 'A', 'B', 'O'].map(id => [Math.log10(TYPE[id].m), Math.log10(TYPE[id].T), Math.log10(typeL(TYPE[id]))]);
function msLT(m) {   // [T in K, L in L☉] of a main-sequence star of mass m (beyond the end types: textbook slopes)
  const P = MS_PTS, n = P.length, lm = Math.log10(Math.max(m, 1e-3));
  let lt, ll;
  if (lm <= P[0][0]) { lt = P[0][1] + 0.2 * (lm - P[0][0]); ll = P[0][2] + 2.3 * (lm - P[0][0]); }
  else if (lm >= P[n - 1][0]) { lt = P[n - 1][1] + 0.25 * (lm - P[n - 1][0]); ll = P[n - 1][2] + 1.5 * (lm - P[n - 1][0]); }
  else {
    let i = 1; while (P[i][0] < lm) i++;
    const f = (lm - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
    lt = P[i - 1][1] + f * (P[i][1] - P[i - 1][1]); ll = P[i - 1][2] + f * (P[i][2] - P[i - 1][2]);
  }
  return [Math.pow(10, lt), Math.pow(10, ll)];
}
// a white dwarf's true radius in solar radii: heavier ones are smaller (Nauenberg 1972)
const wdRsun = m => 0.0126 * Math.pow(Math.max(m, 0.05), -1 / 3) * Math.sqrt(Math.max(0.02, 1 - Math.pow(Math.min(m, M_CH) / M_CH, 4 / 3)));
// [T in K, L in L☉] for a star at drawn radius R, or null for holes and planets
function starLT(b, R) {
  if (b.kind !== 'star') return null;
  const t = b.type, k = t.kind;
  if (k === 'planet') return null;
  if (k === 'ms' && t.id !== 'WR' && t.id !== 'sdB') return msLT(b.m);
  if (k === 'wd') { const r = wdRsun(b.m); return [t.T, r * r * Math.pow(t.T / T_SUN, 4)]; }
  if (k === 'giant') {
    const rs = b.real ? R / RSUN_U : t.Rsun * R / t.R;   // true radius: the drawn one scaled to the type's real size
    const env = Math.max(b.m - (b.core || 0), 0) / Math.max(b.core || 0, 1e-3);
    // envelope under 5% of the core: it shrinks and heats at the same luminosity, as real stripped giants do
    return [t.T * clamp(Math.pow(0.05 / Math.max(env, 1e-6), 0.25), 1, 4), rs * rs * Math.pow(t.T / T_SUN, 4)];
  }
  return [t.T, typeL(t)];   // neutron stars, brown dwarfs, Wolf–Rayet stars, hot subdwarfs: the type's own values
}
function accEff(b) {   // fraction of the rest-mass energy of infalling gas that comes out as light
  if (b.kind === 'bh') return 1 - eIsco(Math.min(Math.abs(b.chi), 0.998));   // from the innermost stable orbit
  if (isNS(b)) return 1.477 * b.m / 12;                                       // GM/Rc², 12 km
  return 1.477 * b.m / (wdRsun(b.m) * 696000);                                // white dwarf, GM/Rc²
}
function accretionL(b) {
  const lam = 160 * (b.feedRate || 0) * accEff(b) / 0.1;   // Eddington ratio: 1/160 M☉ per second at 10% efficiency is flat out
  if (!(lam > 0)) return 0;
  return L_EDD * b.m * (lam <= 1 ? lam : 1 + Math.log(lam));
}
const FX_RISE = 0.04;
function flashL(f) {   // light of one explosion now: a fast rise, then a fade of about 5 magnitudes per half its life
  const a = (wallNow - f.t0) / f.dur;
  if (!(a >= 0 && a < 1)) return 0;
  // supernova-style flashes carry a strength; the 9-second glows without one are kilonovae; other glows (impacts,
  // a magnetar's halo) add nothing here
  const peak = f.kind === 'sn' ? Math.pow(10, 3 + 6 * f.power) : f.dur >= 8000 ? 1e8 : 0;
  if (!peak) return 0;
  if (a < FX_RISE) return peak * (0.15 + 0.85 * a / FX_RISE);
  const u = (a - FX_RISE) / (1 - FX_RISE);
  return peak * Math.pow(10, -2.4 * u) * (1 - u) * (1 - u);
}

/* A series that keeps the whole run in at most N samples. Channel 0 is the value drawn; any others ride along with
   it. In peak mode a merged sample keeps the brightest reading's channels, otherwise the latest. */
class Series {
  constructor(N, K, peak) {
    this.N = N; this.K = K; this.peak = peak;
    this.t = new Float64Array(N); this.lo = new Float64Array(N); this.hi = new Float64Array(N);
    this.v = Array.from({ length: K }, () => new Float64Array(N)); this.pv = new Float64Array(K);
    this.clear();
  }
  clear() { this.n = 0; this.pn = 0; this.dt = 0; this.tc = -Infinity; this.pt = 0; this.plo = 0; this.phi = 0; }
  add(t, x, dt0) {   // one reading x (channels) at time t; dt0 is the starting interval between kept samples
    const v0 = x[0];
    if (!this.pn) { this.plo = this.phi = v0; this.pv.set(x); }
    else {
      if (v0 < this.plo) this.plo = v0;
      if (!this.peak || v0 >= this.phi) this.pv.set(x);
      if (v0 > this.phi) this.phi = v0;
    }
    this.pt = t; this.pn++;
    if (!this.n) this.dt = dt0;
    if (!this.n || t - this.tc >= this.dt) this.commit();
  }
  commit() {
    if (this.n === this.N) this.compact();
    const i = this.n++;
    this.t[i] = this.pt; this.lo[i] = this.plo; this.hi[i] = this.phi;
    for (let k = 0; k < this.K; k++) this.v[k][i] = this.pv[k];
    this.tc = this.pt; this.pn = 0;
  }
  compact() {   // keep the first sample, merge the rest in pairs, and sample half as often from now on
    const { t, lo, hi, v } = this; let w = 1, j = 1;
    for (; j + 1 < this.n; j += 2, w++) {
      const r = this.peak && hi[j] > hi[j + 1] ? j : j + 1, l = Math.min(lo[j], lo[j + 1]), h = Math.max(hi[j], hi[j + 1]);
      for (let k = 0; k < this.K; k++) v[k][w] = v[k][r];
      t[w] = t[j + 1]; lo[w] = l; hi[w] = h;
    }
    if (j < this.n) { t[w] = t[j]; lo[w] = lo[j]; hi[w] = hi[j]; for (let k = 0; k < this.K; k++) v[k][w] = v[k][j]; w++; }
    this.n = w; this.dt *= 2;
  }
  trim(T) {   // forget everything after time T
    while (this.n && this.t[this.n - 1] > T) this.n--;
    if (this.pn && this.pt > T) this.pn = 0;
    this.tc = this.n ? this.t[this.n - 1] : -Infinity;
  }
  get len() { return this.n + (this.pn ? 1 : 0); }   // the last one may be the reading still being gathered
  T(i) { return i < this.n ? this.t[i] : this.pt; }
  Lo(i) { return i < this.n ? this.lo[i] : this.plo; }
  Hi(i) { return i < this.n ? this.hi[i] : this.phi; }
  V(k, i) { return i < this.n ? this.v[k][i] : this.pv[k]; }
  near(t) {   // index of the sample closest in time to t
    let a = 0, b = this.len - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (this.T(m) < t) a = m; else b = m; }
    return b > a && Math.abs(this.T(b) - t) < Math.abs(this.T(a) - t) ? b : a;
  }
}

/* ---------- state ---------- */
const grEl = $('graphs'), grBody = $('grBody'), grCv = $('grCv'), grCx = grCv.getContext('2d'), grRead = $('grRead'), grSum = $('grSum');
let grOpen = false, grTab = 'light', grTick = 0, grW = 0, grH = 0, grDraws = 0;
let grCur = null;      // the hovered or keyed reading: a simulation time (light, mass) or a star's id (HR)
let grLastX0 = 0;      // where the last plot's area began, for turning a pointer position into a time

/* ---------- sampling ---------- */
const grLight = new Series(1024, 4, true);   // total, stars, feeding, explosions (L☉)
const grMass = new Map(), grGhost = new Map();   // body id -> mass series; ghosts: bodies that vanished, kept for a rewind
const grCache = new Map();   // star id -> { T, L, g, from, tr }: where its dot is now, how it is swelling, its recent track
let grPrev = new Map();      // body id -> where it was last frame, to hand a vanished body's history to what replaced it
const grX = new Float64Array(4), grM = new Float64Array(1);
const grSize = b => b.kind === 'bh' ? 3 * rsOf(b.m) : b.R || 0;
const grDt = () => warp / 30;   // first sampling interval: a thirtieth of a screen second at 1×

function grStars() {   // every frame, paused or not: a star swelling into its next stage moves on wall time
  for (const b of bodies) {
    if (b.kind !== 'star' || isPlanet(b)) continue;
    const lt = starLT(b, b.grow ? b.grow.R1 : b.R);
    let c = grCache.get(b.id);
    if (!c) { c = { T: lt[0], L: lt[1], g: null, from: null, tr: [] }; grCache.set(b.id, c); }
    if (b.grow) {   // glide from where the dot was before the star changed to where the swelling leaves it
      if (c.g !== b.grow) { c.g = b.grow; c.from = [c.T, c.L]; }
      const p = clamp((wallNow - b.grow.t0) / b.grow.dur, 0, 1), e = p * p * (3 - 2 * p);
      c.T = c.from[0] * Math.pow(lt[0] / c.from[0], e); c.L = c.from[1] * Math.pow(lt[1] / c.from[1], e);
    } else { c.g = null; c.T = lt[0]; c.L = lt[1]; }
    const tr = c.tr, lT = Math.log10(c.T), lL = Math.log10(Math.max(c.L, 1e-9)), q = tr[tr.length - 1];
    if (!q || Math.abs(q[0] - lT) + Math.abs(q[1] - lL) > 0.01) { tr.push([lT, lL, simTime]); if (tr.length > 64) tr.shift(); }
  }
}
function grLineage() {
  let changed = bodies.length !== grPrev.size;
  if (!changed) for (const b of bodies) if (!grPrev.has(b.id)) { changed = true; break; }
  if (changed) {
    const ids = new Set(bodies.map(b => b.id)), gone = [...grPrev.values()].filter(p => !ids.has(p.id));
    // a body that appears where one vanished (a supernova's remnant, a merger's product) carries on its history;
    // the heaviest one that vanished within reach wins
    for (const b of bodies) {
      if (grPrev.has(b.id) || grMass.has(b.id)) continue;
      let best = null;
      for (const p of gone) {
        if (!grMass.has(p.id)) continue;
        const d = Math.hypot(p.x - b.x, p.y - b.y, p.z - (b.z || 0));
        if (d <= 3 * (p.s + grSize(b)) && (!best || p.m > best.m)) best = p;
      }
      if (best) { grMass.set(b.id, grMass.get(best.id)); grMass.delete(best.id); }
    }
    for (const p of gone) { const s = grMass.get(p.id); if (s) { grMass.delete(p.id); grGhost.set(p.id, s); } grCache.delete(p.id); }
    while (grGhost.size > 48) grGhost.delete(grGhost.keys().next().value);
    const next = new Map(); for (const b of bodies) next.set(b.id, grPrev.get(b.id) || { id: b.id, x: 0, y: 0, z: 0, m: 0, s: 0 });
    grPrev = next;
  }
  for (const b of bodies) { const p = grPrev.get(b.id); p.x = b.x; p.y = b.y; p.z = b.z || 0; p.m = b.m; p.s = grSize(b); }
}
function grSample() {
  let ls = 0, la = 0, lf = 0;
  for (const b of bodies) {
    if (b.kind === 'star') { const c = grCache.get(b.id); if (c) ls += c.L; }
    if (isAccretor(b)) la += accretionL(b);
  }
  for (const f of flashes) lf += flashL(f);
  grX[0] = ls + la + lf; grX[1] = ls; grX[2] = la; grX[3] = lf;
  const dt0 = grDt();
  grLight.add(simTime, grX, dt0);
  for (const b of bodies) {
    let s = grMass.get(b.id);
    if (!s) grMass.set(b.id, s = new Series(512, 1, false));
    grM[0] = b.m; s.add(simTime, grM, dt0);
  }
}
function grFrame(simDt) {
  grLineage();
  grStars();
  if (simDt > 0) grSample();
  if (grOpen && !simOnly && !document.documentElement.classList.contains('clean')) grDraw();
  if (++grTick % 8 === 0) grHeadNow();
}
function grScene() {
  grLight.clear(); grMass.clear(); grGhost.clear(); grCache.clear();
  grPrev = new Map(); grLineage(); grStars(); grCur = null;
  if (grOpen) grDraw();
}
function grRewind(t) {
  grLight.trim(t);
  for (const s of grMass.values()) s.trim(t);
  for (const s of grGhost.values()) s.trim(t);
  for (const c of grCache.values()) { while (c.tr.length > 1 && c.tr[c.tr.length - 1][2] > t) c.tr.pop(); }
  // bodies put back: the same ids take their history back; if the rewind made new bodies, each takes the history whose
  // mass at that moment matches its own
  const ids = new Set(bodies.map(b => b.id));
  for (const [id, s] of [...grGhost]) if (ids.has(id)) { grGhost.delete(id); if (!grMass.has(id)) grMass.set(id, s); }
  const orphans = [...grMass].filter(([id]) => !ids.has(id)).concat([...grGhost]);
  for (const b of bodies) {
    if (grMass.has(b.id)) continue;
    let best = -1, bd = 0.02;
    orphans.forEach(([, s], i) => { if (s && s.len) { const d = Math.abs(s.V(0, s.len - 1) - b.m) / Math.max(b.m, 1e-30); if (d < bd) { bd = d; best = i; } } });
    if (best >= 0) { const [id, s] = orphans[best]; orphans[best] = [id, null]; grMass.delete(id); grGhost.delete(id); grMass.set(b.id, s); }
  }
  for (const [id, s] of [...grMass]) if (!ids.has(id)) { grMass.delete(id); grGhost.set(id, s); }
  grPrev = new Map(); grLineage();
  if (grCur != null && grTab !== 'hr' && grCur > t) grCur = null;
  if (grOpen) grDraw();
}
frameHooks.push(grFrame); sceneHooks.push(grScene); rewindHooks.push(grRewind);

/* ---------- the panel ---------- */
const GR_TABS = ['light', 'mass', 'hr'], GR_NAMES = { light: 'Light curve', mass: 'Mass over time', hr: 'Hertzsprung–Russell diagram' };
const GR_KEY = 'ringdown.graphs';
const SUPS = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = n => String(n).split('').map(c => SUPS[c]).join('');
function fmtL(L) {   // a luminosity for the eye: 130, 0.85, 2.1×10⁵
  if (!(L > 0)) return '0';
  if (L >= 1e4 || L < 0.01) {
    let e = Math.floor(Math.log10(L)), m = L / Math.pow(10, e);
    if (m >= 9.95) { m = 1; e++; }
    return `${m.toFixed(1)}×10${sup(e)}`;
  }
  return String(+L.toPrecision(L < 1 ? 2 : 3));
}
function wordsL(L) {   // the same for a screen reader: "2.1 million Suns"
  if (!(L > 0)) return 'no light';
  const big = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']].find(([k]) => L >= k);
  const n = big ? `${+(L / big[0]).toPrecision(2)} ${big[1]}` : L >= 0.01 ? (+L.toPrecision(2)).toLocaleString('en-US') : L.toExponential(1);
  return `${n} Suns`;
}
const decade = e => e === 0 ? '1' : e === 1 ? '10' : e === 2 ? '100' : e === -1 ? '0.1' : e === -2 ? '0.01' : `10${sup(e)}`;
function niceStep(raw) { const m = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / m; return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * m; }
const decimals = step => step >= 1 ? 0 : Math.min(8, Math.ceil(-Math.log10(step) - 1e-9));
const TUNITS = [[1e-6, 'µs'], [1e-3, 'ms'], [1, 's'], [60, 'min'], [3600, 'h'], [86400, 'days'], [3.156e7, 'years'], [3.156e10, 'thousand years'], [3.156e13, 'million years']];
// ticks for a span of real time, in the largest unit the span holds at least once
function timeTicks(t0, t1, n) {
  const span = Math.max(t1 - t0, 1e-9);
  let u = TUNITS[0]; for (const c of TUNITS) if (span >= c[0]) u = c;
  const step = niceStep(span / u[0] / n) * u[0], ticks = [];
  for (let k = Math.ceil(t0 / step - 1e-9); k * step <= t1 + 1e-9 * span; k++) ticks.push(k * step);
  const dec = decimals(step / u[0]);
  return { ticks, unit: u[1], label: t => (t / u[0]).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) };
}
const realT = t => t * SIM2REAL;
const inspected = () => followId != null ? bodies.find(o => o.id === followId) || null : null;
function massTarget() {   // the inspected body, or the heaviest when nothing is inspected
  const b = inspected(); if (b) return { b, auto: false };
  let h = null; for (const o of bodies) if (!h || o.m > h.m) h = o;
  return h ? { b: h, auto: true } : null;
}
function grName(b) { return b.label || (b.kind === 'bh' ? 'Black hole' : b.type.name); }
function grLc(b) { return b.label || (b.kind === 'bh' ? 'black hole' : b.type.lc); }   // for mid-sentence

function grSize2() {   // canvas backing store at the overlay's pixel ratio
  const w = Math.round(grCv.clientWidth * OD), h = Math.round(grCv.clientHeight * OD);
  if (w && h && (w !== grW || h !== grH)) { grW = grCv.width = w; grH = grCv.height = h; }
}
function grDraw() {
  grDraws++;
  if (!grW) grSize2();
  if (!grW) return;
  const c = grCx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, grW, grH);
  const r = grTab === 'light' ? drawLight() : grTab === 'mass' ? drawMass() : drawHR();
  if (grRead.textContent !== r.read) grRead.textContent = r.read;
  grCv.setAttribute('aria-valuemax', String(Math.max(0, r.n - 1)));
  grCv.setAttribute('aria-valuenow', String(r.i));
  if (grCv.getAttribute('aria-valuetext') !== r.read) grCv.setAttribute('aria-valuetext', r.read);
  if (grTick % 30 === 0 || !grSum.textContent) { const s = grSummary(); if (grSum.textContent !== s) grSum.textContent = s; }
}
// the plot area, with room on the left for the widest y label
function frameOf(labels) {
  const d = OD, c = grCx; c.font = `400 ${10 * d}px ${MONO}`;
  let w = 0; for (const l of labels) w = Math.max(w, c.measureText(l).width);
  grLastX0 = Math.ceil(w + 7 * d);
  return { x0: grLastX0, y0: 16 * d, x1: grW - 5 * d, y1: grH - 15 * d, d };   // a band at the top for the y unit
}
function gridY(F, ys, labels) {
  const c = grCx, d = F.d;
  c.strokeStyle = 'rgba(196,202,232,0.10)'; c.lineWidth = 1; c.beginPath();
  for (const y of ys) { const yy = Math.round(y) + 0.5; c.moveTo(F.x0, yy); c.lineTo(F.x1, yy); }
  c.stroke();
  c.fillStyle = 'rgba(143,147,168,0.95)'; c.textAlign = 'right'; c.textBaseline = 'middle';
  ys.forEach((y, i) => c.fillText(labels[i], F.x0 - 4 * d, clamp(y, F.y0 + 4 * d, F.y1 - 2 * d)));
}
function gridX(F, xs, labels, unit) {   // the unit always shows, at the bottom right; tick labels that would touch it or each other are left out
  const c = grCx, d = F.d;
  c.strokeStyle = 'rgba(196,202,232,0.10)'; c.lineWidth = 1; c.beginPath();
  for (const x of xs) { const xx = Math.round(x) + 0.5; c.moveTo(xx, F.y0); c.lineTo(xx, F.y1); }
  c.stroke();
  c.textBaseline = 'alphabetic';
  c.fillStyle = 'rgba(143,147,168,0.75)'; c.textAlign = 'right'; c.fillText(unit, F.x1, grH - 3 * d);
  const stop = F.x1 - c.measureText(unit).width - 8 * d;
  c.fillStyle = 'rgba(143,147,168,0.95)'; c.textAlign = 'center';
  let right = -Infinity;
  xs.forEach((x, i) => {
    const w = c.measureText(labels[i]).width, cx = Math.max(x, F.x0 + w / 2);
    if (cx - w / 2 < right + 6 * d || cx + w / 2 > stop) return;
    c.fillText(labels[i], cx, grH - 3 * d); right = cx + w / 2;
  });
}
function caption(F, text) {   // the y unit, small, in the band above the plot
  const c = grCx; c.fillStyle = 'rgba(143,147,168,0.75)'; c.textBaseline = 'top'; c.textAlign = 'left';
  c.fillText(text, 0, 2 * F.d);
}
function emptyNote(text) {
  const c = grCx, d = OD; c.font = `400 ${11 * d}px ${MONO}`; c.fillStyle = 'rgba(143,147,168,0.9)'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, grW / 2, grH / 2);
}
// a time axis and a line through a series; returns the plot frame and its mappings
function timePlot(s, labels, yOf, col, band) {
  const F = frameOf(labels), n = s.len, t0 = s.T(0), t1 = Math.max(s.T(n - 1), t0 + 1e-9);
  const X = t => F.x0 + (t - t0) / (t1 - t0) * (F.x1 - F.x0);
  const tk = timeTicks(realT(t0), realT(t1), Math.max(2, Math.floor((F.x1 - F.x0) / (70 * F.d))));
  gridX(F, tk.ticks.map(t => X(t / SIM2REAL)), tk.ticks.map(tk.label), `${tk.unit} real`);
  const c = grCx;
  if (band) {   // the range each kept sample spans, faint
    c.beginPath();
    for (let i = 0; i < n; i++) { const x = X(s.T(i)), y = yOf(s.Hi(i)); i ? c.lineTo(x, y) : c.moveTo(x, y); }
    for (let i = n - 1; i >= 0; i--) c.lineTo(X(s.T(i)), yOf(s.Lo(i)));
    c.closePath(); c.fillStyle = `rgba(${col},0.16)`; c.fill();
  }
  for (const [w, a] of [[4 * F.d, 0.16], [1.4 * F.d, 0.95]]) {
    c.strokeStyle = `rgba(${col},${a})`; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath();
    for (let i = 0; i < n; i++) { const x = X(s.T(i)), y = yOf(s.V(0, i)); i ? c.lineTo(x, y) : c.moveTo(x, y); }
    if (n === 1) c.lineTo(F.x1, yOf(s.V(0, 0)));
    c.stroke();
  }
  return { F, X, t0, t1 };
}
function cursorAt(P, s, yOf, col) {   // the hovered sample: a hairline and a dot
  const i = s.near(grCur), x = P.X(s.T(i)), y = yOf(s.V(0, i)), c = grCx, d = P.F.d;
  c.strokeStyle = 'rgba(236,230,218,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(x) + 0.5, P.F.y0); c.lineTo(Math.round(x) + 0.5, P.F.y1); c.stroke();
  c.fillStyle = `rgb(${col})`; c.beginPath(); c.arc(x, y, 3 * d, 0, Math.PI * 2); c.fill();
  return i;
}
function drawLight() {
  const s = grLight, n = s.len, col = '255,179,106';
  if (!n) { emptyNote('Waiting for the simulation to run'); return { read: 'No samples yet', n: 0, i: 0 }; }
  let top = 0, bot = Infinity;
  for (let i = 0; i < n; i++) { top = Math.max(top, s.Hi(i)); if (s.Lo(i) > 0) bot = Math.min(bot, s.Lo(i)); }
  if (!(top > 1e-6)) { emptyNote('Nothing here gives off light'); return { read: 'No light: nothing in this scene shines', n, i: n - 1 }; }
  const eMax = Math.ceil(Math.log10(top) + 0.1);
  let eMin = Math.floor(Math.log10(Math.max(bot, top * 1e-9, 1e-6)));
  if (eMax - eMin < 2) eMin = eMax - 2;
  const st = Math.ceil((eMax - eMin) / 4), es = []; for (let e = eMax; e >= eMin; e -= st) es.push(e);
  const labels = es.map(decade), F0 = frameOf(labels);
  const yOf = v => F0.y1 - (Math.log10(Math.max(v, Math.pow(10, eMin))) - eMin) / (eMax - eMin) * (F0.y1 - F0.y0);
  gridY(F0, es.map(e => yOf(Math.pow(10, e))), labels);
  const P = timePlot(s, labels, yOf, col, true), c = grCx, d = P.F.d;
  caption(P.F, 'L☉  (Suns)');
  // notices (a supernova, a nova, a disruption) as small ticks along the top
  c.fillStyle = 'rgba(255,179,106,0.55)';
  let evNear = null;
  for (const ev of events) {
    if (ev.t < P.t0 || ev.t > P.t1) continue;
    const x = P.X(ev.t); c.fillRect(Math.round(x), P.F.y0, Math.max(1, d), 5 * d);
    if (grCur != null && Math.abs(x - P.X(grCur)) < 5 * d) evNear = ev;
  }
  const i = grCur != null ? cursorAt(P, s, yOf, col) : n - 1, tot = s.V(0, i);
  // where the light comes from, leaving out anything under 1% of it
  const parts = [['stars', s.V(1, i)], ['feeding', s.V(2, i)], ['explosions', s.V(3, i)]].filter(p => p[1] >= 0.01 * tot);
  const from = parts.length === 1 ? ` · from ${parts[0][0]}` : parts.length ? ' · ' + parts.map(p => `${p[0]} ${fmtL(p[1])}`).join(' · ') : '';
  const head = grCur != null ? `${fmtSec(realT(s.T(i)))} · ` : 'now ';
  return { read: evNear ? `${head}${fmtL(tot)} L☉ · ${evNear.title}` : `${head}${fmtL(tot)} L☉${from}`, n, i };
}
function drawMass() {
  const tg = massTarget();
  if (!tg) { emptyNote('Nothing in the scene'); return { read: 'Nothing to weigh', n: 0, i: 0 }; }
  const b = tg.b, s = grMass.get(b.id), mu = massUnit(b), col = '127,211,230';
  const who = `${grName(b)}${tg.auto ? ' (heaviest)' : ''}`;
  if (!s || !s.len) { emptyNote('Waiting for the simulation to run'); return { read: who, n: 0, i: 0 }; }
  const n = s.len;
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, s.Lo(i)); hi = Math.max(hi, s.Hi(i)); }
  lo /= mu.k; hi /= mu.k;
  const flat = hi - lo <= 1e-7 * Math.abs(hi);
  if (flat) { const pad = Math.max(Math.abs(hi) * 1e-4, 1e-12); lo -= pad; hi += pad; }
  const step = niceStep((hi - lo) / 3), dec = decimals(step), ys = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9 * step; k++) ys.push(k * step);
  let fmt = v => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }), unit = mu.u;
  if (ys.length && fmt(ys[ys.length - 1]).length > 9) {   // huge numbers with small steps: label the offset from a round base
    const base = Math.floor(lo / (step * 10)) * step * 10;
    fmt = v => '+' + (v - base).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    unit = `${mu.u} above ${base.toLocaleString('en-US', { maximumFractionDigits: dec })}`;
  }
  if (flat) { const mid = (lo + hi) / 2; ys.length = 0; ys.push(mid); fmt = v => mu.k === 1 ? fmtM(v) : v.toPrecision(4); unit = mu.u; }   // one level, labelled
  const labels = ys.map(fmt), F0 = frameOf(labels.length ? labels : ['']);
  const yOf = v => F0.y1 - (v / mu.k - lo) / (hi - lo) * (F0.y1 - F0.y0);
  gridY(F0, ys.map(v => yOf(v * mu.k)), labels);
  const P = timePlot(s, labels.length ? labels : [''], yOf, col, true);
  caption(P.F, unit);
  const i = grCur != null ? cursorAt(P, s, yOf, col) : n - 1;
  const mv = s.V(0, i) / mu.k, m0 = s.V(0, 0) / mu.k, dm = mv - m0;
  const mtxt = mu.k !== 1 ? mv.toPrecision(5) : mv >= 1e5 ? fmtM(mv) : fmtMass(mv);
  const tail = flat ? 'steady' : `${dm >= 0 ? '+' : '−'}${+Math.abs(dm).toPrecision(3)} over ${fmtSec(realT(s.T(i) - s.T(0)))}`;
  return { read: `${who} · ${grCur != null ? fmtSec(realT(s.T(i))) + ' · ' : ''}${mtxt} ${mu.u} · ${tail}`, n, i };
}
// HR diagram: temperature runs right to left, as astronomers draw it
const HR_T = [5, Math.log10(1500)], HR_L = [-5, 7];
function hrStars() {   // the stars on the diagram, hottest first
  const out = [];
  for (const b of bodies) { const c = grCache.get(b.id); if (c) out.push({ b, c }); }
  return out.sort((p, q) => q.c.T - p.c.T);
}
function drawHR() {
  const es = [6, 4, 2, 0, -2, -4], labels = es.map(decade), F = frameOf(labels), c = grCx, d = F.d;
  const X = lT => F.x0 + (HR_T[0] - lT) / (HR_T[0] - HR_T[1]) * (F.x1 - F.x0);
  const Y = lL => F.y1 - (lL - HR_L[0]) / (HR_L[1] - HR_L[0]) * (F.y1 - F.y0);
  gridY(F, es.map(Y), labels);
  const Ts = [40000, 20000, 10000, 5000, 2000];
  gridX(F, Ts.map(t => X(Math.log10(t))), Ts.map(t => t.toLocaleString('en-US')), 'K');
  caption(F, 'L☉  (Suns)');
  // the main sequence, faint, and where the other kinds of star live
  const ms = m => { const [T, L] = msLT(m); return [X(Math.log10(T)), Y(Math.log10(L))]; };
  c.strokeStyle = 'rgba(196,202,232,0.16)'; c.lineWidth = 7 * d; c.lineCap = 'round'; c.beginPath();
  for (let k = 0; k <= 40; k++) { const [x, y] = ms(0.08 * Math.pow(150 / 0.08, k / 40)); k ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke(); c.lineCap = 'butt';
  c.font = `italic 400 ${10 * d}px ${MONO}`; c.fillStyle = 'rgba(143,147,168,0.55)'; c.textBaseline = 'middle'; c.textAlign = 'center';
  { // along the band, just under it
    const [ax, ay] = ms(9), [bx, by] = ms(2.2), ang = Math.atan2(by - ay, bx - ax), [mx, my] = ms(4);   // hot to cool: reads left to right
    c.save(); c.translate(mx - Math.sin(ang) * 10 * d, my + Math.cos(ang) * 10 * d); c.rotate(ang); c.fillText('main sequence', 0, 0); c.restore();
  }
  const tag = (txt, T, lL) => c.fillText(txt, clamp(X(Math.log10(T)), F.x0 + 30 * d, F.x1 - 30 * d), Y(lL));
  tag('giants', 4700, 3.1); tag('supergiants', 9000, 5.7); tag('white dwarfs', 22000, -3.3);
  c.font = `400 ${10 * d}px ${MONO}`;
  const stars = hrStars(), pick = inspected();
  const pos = ({ c: q }) => { const lT = Math.log10(q.T); return [lT > HR_T[0] ? F.x0 + 3 * d : X(lT), Y(clamp(Math.log10(Math.max(q.L, 1e-9)), HR_L[0], HR_L[1]))]; };
  // each star's recent track, so a star that has changed shows where it came from
  for (const { b, c: q } of stars) {
    if (q.tr.length < 2) continue;
    c.strokeStyle = `rgba(${b.col || b.type.col},0.35)`; c.lineWidth = 1.2 * d; c.beginPath();
    q.tr.forEach((p, k) => { const x = p[0] > HR_T[0] ? F.x0 + 3 * d : X(p[0]), y = Y(clamp(p[1], HR_L[0], HR_L[1])); k ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
  }
  let curIdx = -1;
  stars.forEach((st, k) => {
    const [x, y] = pos(st), col = st.b.col || st.b.type.col;
    if (Math.log10(st.c.T) > HR_T[0]) {   // hotter than the axis (neutron stars): an arrow at the edge
      c.fillStyle = `rgb(${col})`; c.beginPath(); c.moveTo(x - 2 * d, y); c.lineTo(x + 3 * d, y - 3 * d); c.lineTo(x + 3 * d, y + 3 * d); c.closePath(); c.fill();
    } else { c.fillStyle = `rgb(${col})`; c.beginPath(); c.arc(x, y, 2.6 * d, 0, Math.PI * 2); c.fill(); }
    if (grCur === st.b.id) curIdx = k;
  });
  const ring = (st, colr) => {
    const [x, y] = pos(st); c.strokeStyle = colr; c.lineWidth = 1.4 * d; c.beginPath(); c.arc(x, y, 6 * d, 0, Math.PI * 2); c.stroke();
    const txt = grName(st.b), w = c.measureText(txt).width, left = x + 9 * d + w > F.x1;
    c.fillStyle = colr; c.textAlign = left ? 'right' : 'left'; c.textBaseline = 'middle';
    c.fillText(txt, left ? x - 9 * d : x + 9 * d, clamp(y, F.y0 + 6 * d, F.y1 - 6 * d));
  };
  const sel = pick && stars.find(st => st.b === pick);
  if (sel) ring(sel, 'rgba(255,179,106,0.95)');
  if (curIdx >= 0 && stars[curIdx] !== sel) ring(stars[curIdx], 'rgba(236,230,218,0.85)');
  if (!stars.length) { emptyNote('No stars in this scene'); return { read: 'No stars: holes and planets are not on this diagram', n: 0, i: 0 }; }
  const show = curIdx >= 0 ? stars[curIdx] : sel || null;
  const read = show ? hrLine(show) : `${stars.length} star${stars.length > 1 ? 's' : ''} · hover or tap a dot`;
  return { read, n: stars.length, i: Math.max(curIdx, 0) };
}
function hrLine({ b, c: q }) {
  const hot = Math.log10(q.T) > HR_T[0] ? ' (off the scale)' : '';
  return `${grName(b)} · ${Math.round(q.T).toLocaleString('en-US')} K${hot} · ${fmtL(q.L)} L☉`;
}
function grSummary() {
  if (grTab === 'light') {
    const s = grLight, n = s.len; if (!n) return 'Light curve: no samples yet.';
    let pk = 0; for (let i = 1; i < n; i++) if (s.Hi(i) > s.Hi(pk)) pk = i;
    return `Light curve over ${fmtSec(realT(s.T(n - 1) - s.T(0)))} of real time. Now ${wordsL(s.V(0, n - 1))}; brightest ${wordsL(s.Hi(pk))}, at ${fmtSec(realT(s.T(pk)))}.`;
  }
  if (grTab === 'mass') {
    const tg = massTarget(); if (!tg) return 'Mass graph: nothing in the scene.';
    const s = grMass.get(tg.b.id), mu = massUnit(tg.b); if (!s || !s.len) return `Mass of the ${grLc(tg.b)}: no samples yet.`;
    const a = s.V(0, 0) / mu.k, z = s.V(0, s.len - 1) / mu.k, p = v => mu.k === 1 ? fmtMass(v) : v.toPrecision(5);
    return `Mass of the ${grLc(tg.b)} over ${fmtSec(realT(s.T(s.len - 1) - s.T(0)))}: ${a === z ? 'steady at ' + p(z) : 'from ' + p(a) + ' to ' + p(z)} ${mu.u}.${tg.auto ? ' It is the heaviest body; inspect another to graph that one instead.' : ''}`;
  }
  const stars = hrStars(), b = inspected(), st = b && stars.find(x => x.b === b);
  const where = st ? ` The ${grLc(b)} is ${st.b.type.kind === 'giant' ? 'among the giants' : st.b.type.kind === 'wd' ? 'among the white dwarfs' : st.b.type.kind === 'ms' && !['WR', 'sdB'].includes(st.b.type.id) ? 'on the main sequence' : 'off the main sequence'}, at ${Math.round(st.c.T).toLocaleString('en-US')} K and ${wordsL(st.c.L)}.` : '';
  return `Hertzsprung–Russell diagram of ${stars.length} star${stars.length === 1 ? '' : 's'}: temperature against luminosity.${where}`;
}
function grHeadNow() {
  const n = grLight.len, txt = n ? `light ${fmtL(grLight.V(0, n - 1))} L☉` : '';
  const el = $('grNow'); if (el.textContent !== txt) el.textContent = txt;
}

/* ---------- controls ---------- */
function grSetOpen(on) {
  grOpen = on; grBody.hidden = !on; grEl.classList.toggle('open', on);
  $('grHead').setAttribute('aria-expanded', String(on));
  grSave(); grLayout();
  if (on) { grW = 0; requestAnimationFrame(() => { grSize2(); grDraw(); }); }
}
function grSetTab(t) {
  grTab = t; grCur = null;
  for (const k of GR_TABS) { const el = $('grtab-' + k), on = k === t; el.setAttribute('aria-selected', String(on)); el.tabIndex = on ? 0 : -1; }
  $('grPanel').setAttribute('aria-labelledby', 'grtab-' + t); grCv.setAttribute('aria-label', GR_NAMES[t]);
  grSum.textContent = ''; grSave();
  if (grOpen) grDraw();
}
function grSave() { try { localStorage.setItem(GR_KEY, JSON.stringify({ open: grOpen, tab: grTab })); } catch (e) {} }
function grLayout() {   // what sits just under the scope (notices on a phone, the frame rate) moves down below the graphs
  requestAnimationFrame(() => document.documentElement.style.setProperty('--graphs-b', Math.round(grEl.getBoundingClientRect().bottom) + 'px'));
}
$('grHead').addEventListener('click', () => grSetOpen(!grOpen));
for (const k of GR_TABS) $('grtab-' + k).addEventListener('click', () => grSetTab(k));
grEl.querySelector('.gr-tabs').addEventListener('keydown', e => {
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !e.target.matches('[role=tab]')) return;
  const t = GR_TABS[(GR_TABS.indexOf(grTab) + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
  grSetTab(t); $('grtab-' + t).focus(); e.preventDefault();
});
// pointer: hover (or touch and drag) to read a value off the graph
function grPointer(e) {
  const r = grCv.getBoundingClientRect(), x = (e.clientX - r.left) * OD, y = (e.clientY - r.top) * OD;
  if (grTab === 'hr') {
    const F = frameOf(['10⁻⁴']), stars = hrStars();
    let best = null, bd = 14 * OD;
    for (const st of stars) {
      const lT = Math.log10(st.c.T), sx = lT > HR_T[0] ? F.x0 + 3 * OD : F.x0 + (HR_T[0] - lT) / (HR_T[0] - HR_T[1]) * (F.x1 - F.x0);
      const sy = F.y1 - (clamp(Math.log10(Math.max(st.c.L, 1e-9)), HR_L[0], HR_L[1]) - HR_L[0]) / (HR_L[1] - HR_L[0]) * (F.y1 - F.y0);
      const dd = Math.hypot(sx - x, sy - y); if (dd < bd) { bd = dd; best = st; }
    }
    grCur = best ? best.b.id : null;
  } else {
    const tg = grTab === 'mass' ? massTarget() : null, s = grTab === 'light' ? grLight : tg && grMass.get(tg.b.id);
    if (!s || !s.len) { grCur = null; return; }
    // the plot's left edge depends on its labels: the last draw's is the one on screen
    const t0 = s.T(0), t1 = Math.max(s.T(s.len - 1), t0 + 1e-9), x1 = grW - 5 * OD;
    grCur = t0 + clamp((x - grLastX0) / (x1 - grLastX0), 0, 1) * (t1 - t0);
  }
  grDraw();
}
grCv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) grPointer(e); });
grCv.addEventListener('pointerdown', e => { grCv.setPointerCapture(e.pointerId); grPointer(e); });
grCv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { grCur = null; grDraw(); } });
// keyboard: the graph is a slider over its samples (or its stars, hottest first)
grCv.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'Escape' && grCur != null) { grCur = null; grDraw(); e.preventDefault(); e.stopPropagation(); return; }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(k)) return;
  e.preventDefault();
  const dir = k === 'ArrowLeft' || k === 'ArrowDown' || k === 'PageDown' ? -1 : 1, by = k.startsWith('Page') || e.shiftKey ? 10 : 1;
  if (grTab === 'hr') {
    const stars = hrStars(); if (!stars.length) return;
    let i = stars.findIndex(st => st.b.id === grCur);
    const sel = inspected(); if (i < 0 && sel) i = stars.findIndex(st => st.b === sel);
    i = k === 'Home' ? 0 : k === 'End' ? stars.length - 1 : i < 0 ? 0 : clamp(i + dir * by, 0, stars.length - 1);
    grCur = stars[i].b.id;
  } else {
    const tg = grTab === 'mass' ? massTarget() : null, s = grTab === 'light' ? grLight : tg && grMass.get(tg.b.id);
    if (!s || !s.len) return;
    let i = grCur == null ? s.len - 1 : s.near(grCur);
    i = k === 'Home' ? 0 : k === 'End' ? s.len - 1 : grCur == null ? i : clamp(i + dir * by, 0, s.len - 1);
    grCur = s.T(i);
  }
  grDraw();
});
// focused from the keyboard, the reading holds still on the newest sample (or the inspected star) instead of changing
// every frame under a screen reader
grCv.addEventListener('focus', () => {
  if (grCur != null) return;
  if (grTab === 'hr') { const sel = inspected(), stars = hrStars(), st = stars.find(x => x.b === sel) || stars[0]; grCur = st ? st.b.id : null; }
  else { const tg = grTab === 'mass' ? massTarget() : null, s = grTab === 'light' ? grLight : tg && grMass.get(tg.b.id); grCur = s && s.len ? s.T(s.len - 1) : null; }
  if (grOpen) grDraw();
});
grCv.addEventListener('blur', () => { if (grCur != null) { grCur = null; if (grOpen) grDraw(); } });
// G opens and closes the graphs (not while typing, or on a focused button, like the other single-letter keys)
addEventListener('keydown', e => {
  if (e.key.toLowerCase() !== 'g' || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
  if (e.target.closest && e.target.closest('input,select,textarea,button,[contenteditable]')) return;
  grSetOpen(!grOpen);
});
if (window.ResizeObserver) {   // the scope too: when it opens or closes, the panel moves without changing size
  const ro = new ResizeObserver(() => { grSize2(); grLayout(); if (grOpen) grDraw(); });
  ro.observe(grEl); ro.observe(document.querySelector('.scope'));
}
addEventListener('resize', grLayout);
(() => { let st = null; try { st = JSON.parse(localStorage.getItem(GR_KEY)); } catch (e) {}
  if (st && GR_TABS.includes(st.tab)) grSetTab(st.tab);
  if (st && st.open) grSetOpen(true); else grLayout(); })();

// for the tests (test-hook.js)
const graphsApi = {
  light() { const s = grLight, o = { t: [], v: [], lo: [], hi: [], stars: [], feed: [], flash: [] }; for (let i = 0; i < s.len; i++) { o.t.push(s.T(i)); o.v.push(s.V(0, i)); o.lo.push(s.Lo(i)); o.hi.push(s.Hi(i)); o.stars.push(s.V(1, i)); o.feed.push(s.V(2, i)); o.flash.push(s.V(3, i)); } return o; },
  mass(id) { const s = grMass.get(id); if (!s) return null; const o = { t: [], v: [], lo: [], hi: [] }; for (let i = 0; i < s.len; i++) { o.t.push(s.T(i)); o.v.push(s.V(0, i)); o.lo.push(s.Lo(i)); o.hi.push(s.Hi(i)); } return o; },
  hr() { return hrStars().map(({ b, c }) => ({ id: b.id, type: b.type.id, T: c.T, L: c.L })); },
  trail(id) { const c = grCache.get(id); return c ? c.tr.map(p => [Math.pow(10, p[0]), Math.pow(10, p[1]), p[2]]) : null; },
  open(on) { grSetOpen(!!on); }, tab(t) { grSetTab(t); }, get isOpen() { return grOpen; }, get tabNow() { return grTab; }, get draws() { return grDraws; },
  cursor(v) { grCur = v; grDraw(); }, draw: () => grDraw(), frame: grFrame, read: () => grRead.textContent, summary: () => grSum.textContent,
  msLT, starLT: b => starLT(b, b.R), accretionL, flashL, Series,
};
