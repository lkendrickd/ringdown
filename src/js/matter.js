/* ================= planets and cold matter =================
   Planets, moons and asteroids are bodies like stars (same orbits, same collisions) with a type of kind 'planet'.
   Cold matter is a second set of particles: rock, ice and gas that feels every body's gravity and its own.
   It clumps where its own gravity beats the tide of whatever it orbits (outside the Roche limit) and stays a
   ring where it can't (inside it). What a clump becomes is decided by its mass alone. */
const MEARTH = 3.003e-6, MJUP = 9.546e-4, REARTH_SUN = 6371 / 696000;
const isPlanet = b => b.kind === 'star' && b.type.kind === 'planet';
// mass in the unit a person would use for it
function massStr(m) {
  if (m >= 0.0124) return `${fmtM(m)} M☉`;
  if (m >= 0.1 * MJUP) { const v = m / MJUP; return `${v.toFixed(v < 10 ? 2 : 1)} Jupiter masses`; }
  if (m >= 1e-4 * MEARTH) { const v = m / MEARTH; return `${v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toPrecision(2)} Earth masses`; }
  return `${(m * 1.989e30).toExponential(1).replace('e+', '×10^')} kg`;
}
function massUnit(b) {
  if (!isPlanet(b)) return { u: 'M☉', k: 1 };
  return b.m >= 0.1 * MJUP ? { u: 'Jupiter masses', k: MJUP } : { u: 'Earth masses', k: MEARTH };
}
// Mass–radius relation for cold bodies (log10, Earth units), through Ceres, the Moon, Earth, a 10-Earth super-Earth,
// Neptune, Saturn, Jupiter, and flat from there to the brown-dwarf boundary (degenerate matter: more mass, same size).
const MR_PTS = [[-3.80, -1.13], [-1.91, -0.564], [0, 0], [1, 0.28], [1.233, 0.589], [1.979, 0.961], [2.502, 1.049], [3.62, 1.03]];
function planetRsun(m) {
  const lm = Math.log10(Math.max(m, 1e-18) / MEARTH), P = MR_PTS, n = P.length;
  let lr;
  if (lm <= P[0][0]) lr = P[0][1] + (lm - P[0][0]) / 3;   // constant density below Ceres
  else if (lm >= P[n - 1][0]) lr = P[n - 1][1];
  else { let i = 1; while (P[i][0] < lm) i++; lr = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * (lm - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); }
  return Math.pow(10, lr) * REARTH_SUN;
}
// drawn radius: true size in true-scale scenes; in the compressed scenes, small next to the (also shrunken) stars
function planetR(m, real) { return real ? planetRsun(m) * RSUN_U : clamp(0.5 + 0.1 * Math.log10(Math.max(m, 1e-18) / MEARTH), 0.16, 0.95); }
function typeForMass(m) {
  if (m < 2e-9) return TYPE.AST;
  if (m < 1.5e-7) return TYPE.MOON;
  if (m < 3e-5) return TYPE.ROCK;
  if (m < 1.5e-4) return TYPE.ICE;
  if (m < 0.0124) return TYPE.GAS;
  if (m < 0.075) return TYPE.BD;
  return TYPE[m < 0.45 ? 'M' : m < 0.8 ? 'K' : m < 1.04 ? 'G' : m < 1.6 ? 'F' : m < 3 ? 'A' : m < 16 ? 'B' : 'O'];
}
/* True sizes, for tidal physics. In the compressed scenes bodies are drawn at made-up sizes, so anything that depends
   on density (the Roche limit, whether a clump can hold together) is worked out from real radii and then expressed
   in units of the host's drawn radius. In true-scale scenes the two are the same thing. */
function realRsun(b) {
  if (b.kind !== 'star') return 1;
  if (b.type.kind === 'planet') return planetRsun(b.m) * (b.puff || 1);
  return b.real ? b.R / RSUN_U : b.type.Rsun * (b.type.kind === 'ms' ? Math.pow(b.m / b.type.m, 0.8) : 1);
}
function sizeScale(host) { return host && host.kind === 'star' ? host.R / realRsun(host) : realSizes ? RSUN_U : 3.4; }   // sim units per solar radius
function bodyName(b) { return b.label || (b.kind === 'bh' ? 'the black hole' : 'the ' + b.type.lc); }
// A cold body's mass decides what it is. Past 13 Jupiters it fuses deuterium (a brown dwarf); past 0.075 Suns, hydrogen.
function regrade(b) {
  if (b.kind !== 'star' || (b.type.kind !== 'planet' && b.type.id !== 'BD')) return;
  const t = typeForMass(b.m), was = b.type;
  if (t !== was && (t.kind !== 'planet' || !b.label)) {   // a named world keeps its name and look until it stops being a planet
    b.type = t;
    if (t.kind === 'ms') {
      b.col = null; b.label = ''; b.hot = 0;
      reached('star');
      toast('A star ignites', [`At ${fmtM(b.m)} M☉ the core is hot and dense enough to fuse hydrogen`, `What was a brown dwarf is now ${/^[AO]/.test(t.name) ? 'an' : 'a'} ${t.lc}`], 'w');
    } else if (t.id === 'BD') {
      b.col = null; b.label = '';
      toast('Brown dwarf', ['Past about 13 Jupiter masses the core fuses deuterium', 'It glows on its own now, but it is still too light to burn hydrogen like a star'], 'w');
    }
  }
  if (b.type.kind === 'planet') b.R = b.R0 = planetR(b.m, b.real) * (b.puff || 1);
  else if (b.type.id === 'BD') b.R = b.R0 = b.real ? TYPE.BD.Rsun * RSUN_U : TYPE.BD.R;
  else b.R = b.R0 = b.real ? b.type.Rsun * RSUN_U * Math.pow(b.m / b.type.m, 0.8) : b.type.R;
  b.m0 = b.m; b.mBirth = Math.max(b.mBirth || 0, b.m);
}

const MAXM = 28000, BODY_CAP = 96, MAT0 = 7000;
const Q = { mode:'auto', rs:1, bloom:5, gas:MAXG - 800, mat:MAXM };   // graphics quality: render-scale factor, bloom levels, gas and matter budgets (settings panel)
let matCap = MAT0;       // loose matter a scene may hold: the frame-time governor moves it between MAT0 and Q.mat
let qScale = 1;          // grains per grain of a scene built on a budget of MAT0: scenes built on a bigger one use more, lighter grains
const grainScale = () => clamp(Math.floor(Math.min(matCap, Q.mat) / MAT0), 1, 4);   // fixed when a scene is built
const qx = new Float64Array(MAXM), qy = new Float64Array(MAXM), qvx = new Float64Array(MAXM), qvy = new Float64Array(MAXM);
const qm = new Float64Array(MAXM), qT = new Float32Array(MAXM), qc = new Int32Array(MAXM), qk = new Uint16Array(MAXM), qp = new Float32Array(MAXM), qr = new Uint8Array(MAXM); // qr: 1 = ring debris; qk: how many grains have stuck together; qp: size for its mass, relative to rock (ice is puffier)
const qz = new Float64Array(MAXM), qvz = new Float64Array(MAXM);   // height above the plane (3D scenes only)
let qN = 0, matterFull = false, mcDt = 0, mcWall = 0, mcHeavy = true;
function addMatter(x, y, vx, vy, m, heat, puff, z, vz) {
  if (qN >= Q.mat) return false;
  qx[qN] = x; qy[qN] = y; qvx[qN] = vx; qvy[qN] = vy; qm[qN] = m; qT[qN] = heat || 0; qk[qN] = 1; qp[qN] = puff || 1; qr[qN] = 0; qz[qN] = z || 0; qvz[qN] = vz || 0; qN++;
  return true;
}
function removeMatter(i) {
  qN--;
  qx[i] = qx[qN]; qy[i] = qy[qN]; qvx[i] = qvx[qN]; qvy[i] = qvy[qN]; qm[i] = qm[qN]; qT[i] = qT[qN]; qc[i] = qc[qN]; qk[i] = qk[qN]; qp[i] = qp[qN]; qr[i] = qr[qN]; qz[i] = qz[qN]; qvz[i] = qvz[qN];
}
// a piece of matter lands on a body
function matterLands(b, m, vx, vy, vz) {
  const M = b.m + m;
  b.vx += (vx - b.vx) * m / M; b.vy += (vy - b.vy) * m / M; if (zOn) b.vz += (vz - b.vz) * m / M;
  b.m = M;
  if (b.kind === 'bh') { b.fedTotal = (b.fedTotal || 0) + m; totalFed += m; return; }
  b.fedTotal = (b.fedTotal || 0) + m;
  if (b.type.kind === 'planet' || b.type.id === 'BD') regrade(b);
  else {
    b.m0 = M; b.mBirth = Math.max(b.mBirth || 0, M);
    if (isWD(b)) b.R = b.R0 = sized(b, wdRadius(Math.min(M, M_CH * 0.99)), TYPE.WD);
    else if ('MKGFABO'.includes(b.type.id)) { // a growing star moves up the main sequence: hotter, bluer, bigger
      const t = typeForMass(M);
      if (t !== b.type && t.m > b.type.m) b.type = t;
      b.R = b.R0 = b.real ? b.type.Rsun * RSUN_U * Math.pow(M / b.type.m, 0.8) : b.type.R * Math.pow(M / b.type.m, 0.5);
      if (M >= 140 && !b.sn) startSupernova(b);
    }
  }
}
// Move the matter under the gravity of every body. Each particle takes as many substeps as its tightest orbit needs.
const _bx = new Float64Array(BODY_CAP + 64), _by = new Float64Array(BODY_CAP + 64), _bvx = new Float64Array(BODY_CAP + 64), _bvy = new Float64Array(BODY_CAP + 64);
const _bm = new Float64Array(BODY_CAP + 64), _br = new Float64Array(BODY_CAP + 64), _bhot = new Float64Array(BODY_CAP + 64);
const _maj = new Int32Array(BODY_CAP + 64), _min = new Int32Array(BODY_CAP + 64), _act = new Int32Array(BODY_CAP + 64), _inf2 = new Float64Array(BODY_CAP + 64);
const _bz = new Float64Array(BODY_CAP + 64), _bvz = new Float64Array(BODY_CAP + 64);
function stepMatter(simDt) {
  if (!qN || simDt <= 0) return;
  const nb = Math.min(bodies.length, _bx.length);
  if (!nb) { for (let i = 0; i < qN; i++) { qx[i] += qvx[i] * simDt; qy[i] += qvy[i] * simDt; if (zOn) qz[i] += qvz[i] * simDt; } return; }
  for (let j = 0; j < nb; j++) {
    const b = bodies[j];
    _bx[j] = b.x; _by[j] = b.y; _bvx[j] = b.vx; _bvy[j] = b.vy; _bm[j] = G * b.m; _bz[j] = b.z; _bvz[j] = b.vz;
    // what counts as landing: the surface of a star or planet; for a compact object, the edge of where gas would
    // already be a hot disk (there the matter is handed over to the gas, which knows how to accrete)
    if (b.kind === 'bh') { _br[j] = 0; _bhot[j] = 30 * rsOf(b.m); }
    else if (isNS(b)) { _br[j] = 0; _bhot[j] = 30 * b.R; }
    else if (isWD(b)) { _br[j] = 0; _bhot[j] = 5 * b.R; }
    else {
      _br[j] = b.R; _bhot[j] = 0;
      if (b.type.kind === 'planet') { // In a thin, cold disk a body sweeps up what passes through a good part of its Hill sphere, not just what hits it
        let tide = 0;
        for (let k = 0; k < nb; k++) { const o = bodies[k]; if (o === b || o.m < 3 * b.m) continue; const r = sepOf(b, o), t = o.m / (r * r * r); if (t > tide) tide = t; }
        if (tide > 0) { const rH = Math.cbrt(b.m / (3 * tide)); _br[j] = Math.max(b.R, Math.min(1.2 * Math.sqrt(b.R * rH), 0.3 * rH)); }
      }
    }
  }
  /* Which bodies each particle has to feel. The heavy ones (within a millionth of the heaviest), always. The light
     ones (moons, dwarf planets) only from close by, a few Hill radii: farther out their pull is lost in the heavy
     bodies' and not worth the arithmetic. In the Solar System that is 7 bodies per particle instead of 24. */
  let gmMax = 0; for (let j = 0; j < nb; j++) if (_bm[j] > gmMax) gmMax = _bm[j];
  let nMaj = 0, nMin = 0;
  for (let j = 0; j < nb; j++) {
    if (_bm[j] >= 1e-6 * gmMax) { _maj[nMaj++] = j; continue; }
    let tide = 0;
    for (let k = 0; k < nb; k++) { if (k === j || _bm[k] <= _bm[j]) continue; const dx = _bx[k] - _bx[j], dy = _by[k] - _by[j], r2 = zOn ? dx * dx + dy * dy + (_bz[k] - _bz[j]) ** 2 : dx * dx + dy * dy, t = _bm[k] / (r2 * Math.sqrt(r2)); if (t > tide) tide = t; }
    const reach = Math.max(3 * Math.cbrt(_bm[j] / (3 * tide)), 4 * _br[j], 4 * _bhot[j]);
    _min[nMin] = j; _inf2[nMin++] = reach * reach;
  }
  if (zOn) { stepMatter3(simDt, nMaj, nMin); return; }
  for (let i = 0; i < qN; i++) {
    let x = qx[i], y = qy[i], vx = qvx[i], vy = qvy[i];
    let na = nMaj;
    for (let q = 0; q < nMaj; q++) _act[q] = _maj[q];
    for (let q = 0; q < nMin; q++) { const j = _min[q], dx = _bx[j] - x, dy = _by[j] - y; if (dx * dx + dy * dy < _inf2[q]) _act[na++] = j; }
    let t2 = Infinity;
    for (let q = 0; q < na; q++) { const j = _act[q], dx = _bx[j] - x, dy = _by[j] - y, r2 = dx * dx + dy * dy; const t = r2 * Math.sqrt(r2) / _bm[j]; if (t < t2) t2 = t; }
    const n = clamp(Math.ceil(simDt / (0.07 * Math.sqrt(t2))), 1, 60), dt = simDt / n;
    let hit = -1, hot = false;
    for (let s = 0; s < n && hit < 0; s++) {
      const back = simDt - (s + 0.5) * dt;   // the bodies have already been moved to the end of this step: wind them back
      let ax = 0, ay = 0;
      for (let q = 0; q < na; q++) {
        const j = _act[q], dx = _bx[j] - _bvx[j] * back - x, dy = _by[j] - _bvy[j] * back - y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
        if (r < _br[j]) { hit = j; break; }
        if (r < _bhot[j]) { hit = j; hot = true; break; }
        const k = _bm[j] / (r2 * r);
        ax += k * dx; ay += k * dy;
      }
      if (hit >= 0) break;
      vx += ax * dt; vy += ay * dt; x += vx * dt; y += vy * dt;
    }
    if (hit >= 0) {
      if (hot) addGas(x, y, vx, vy, qm[i], 0); else matterLands(bodies[hit], qm[i], vx, vy);
      removeMatter(i); i--; continue;
    }
    qx[i] = x; qy[i] = y; qvx[i] = vx; qvy[i] = vy;
  }
}
// The same particle step in 3D (the Solar System's belts): heights and vertical speeds too.
function stepMatter3(simDt, nMaj, nMin) {
  for (let i = 0; i < qN; i++) {
    let x = qx[i], y = qy[i], vx = qvx[i], vy = qvy[i], z = qz[i], vz = qvz[i];
    let na = nMaj;
    for (let q = 0; q < nMaj; q++) _act[q] = _maj[q];
    for (let q = 0; q < nMin; q++) { const j = _min[q], dx = _bx[j] - x, dy = _by[j] - y, d2 = dx * dx + dy * dy; if (d2 < _inf2[q]) { const dz = _bz[j] - z; if (d2 + dz * dz < _inf2[q]) _act[na++] = j; } }
    let t2 = Infinity;
    for (let q = 0; q < na; q++) { const j = _act[q], dx = _bx[j] - x, dy = _by[j] - y, dz = _bz[j] - z, r2 = dx * dx + dy * dy + dz * dz; const t = r2 * Math.sqrt(r2) / _bm[j]; if (t < t2) t2 = t; }
    const n = clamp(Math.ceil(simDt / (0.07 * Math.sqrt(t2))), 1, 60), dt = simDt / n;
    let hit = -1, hot = false;
    for (let s = 0; s < n && hit < 0; s++) {
      const back = simDt - (s + 0.5) * dt;
      let ax = 0, ay = 0, az = 0;
      for (let q = 0; q < na; q++) {
        const j = _act[q], dx = _bx[j] - _bvx[j] * back - x, dy = _by[j] - _bvy[j] * back - y, dz = _bz[j] - _bvz[j] * back - z, r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
        if (r < _br[j]) { hit = j; break; }
        if (r < _bhot[j]) { hit = j; hot = true; break; }
        const k = _bm[j] / (r2 * r);
        ax += k * dx; ay += k * dy; az += k * dz;
      }
      if (hit >= 0) break;
      vx += ax * dt; vy += ay * dt; vz += az * dt; x += vx * dt; y += vy * dt; z += vz * dt;
    }
    if (hit >= 0) {
      if (hot) addGas(x, y, vx, vy, qm[i], 0); else matterLands(bodies[hit], qm[i], vx, vy, vz);
      removeMatter(i); i--; continue;
    }
    qx[i] = x; qy[i] = y; qvx[i] = vx; qvy[i] = vy; qz[i] = z; qvz[i] = vz;
  }
}
/* The matter's own gravity, its collisions with itself, and collapse into bodies. Once a frame.
   Particles are binned into cells about a tenth as wide as their distance from whatever they orbit. Cells pull on
   each other, and each cell's particles are drawn toward its centre and share momentum (collisions lose energy,
   which is what lets a clump settle). A cell collapses into a body when its matter is bound, packed well inside
   its Hill sphere, and the body it would make fits inside that sphere too. That last test is the Roche limit:
   close to a planet nothing passes it, so matter there stays a ring. */
let clCap = 1024;
let clM = new Float64Array(clCap), clX = new Float64Array(clCap), clY = new Float64Array(clCap), clVX = new Float64Array(clCap), clVY = new Float64Array(clCap);
let clAX = new Float64Array(clCap), clAY = new Float64Array(clCap), clH = new Float64Array(clCap), clHM = new Float64Array(clCap), clHR = new Float64Array(clCap);
let clS2 = new Float64Array(clCap), clSV = new Float64Array(clCap), clT = new Float64Array(clCap), clN = new Int32Array(clCap), clForm = new Int32Array(clCap);
let clA = new Int32Array(clCap), clB = new Int32Array(clCap), clHI = new Int32Array(clCap), clW = new Float64Array(clCap), clNx = new Int32Array(clCap);
let clZ = new Float64Array(clCap), clVZ = new Float64Array(clCap);   // 3D scenes: the cell's mean height and vertical speed
function growCells() {
  clCap *= 2;
  const g = a => { const b = new a.constructor(clCap); b.set(a); return b; };
  clM = g(clM); clX = g(clX); clY = g(clY); clVX = g(clVX); clVY = g(clVY); clAX = g(clAX); clAY = g(clAY); clH = g(clH); clHM = g(clHM); clHR = g(clHR);
  clS2 = g(clS2); clSV = g(clSV); clT = g(clT); clN = g(clN); clForm = g(clForm); clA = g(clA); clB = g(clB); clHI = g(clHI); clW = g(clW); clNx = g(clNx); clZ = g(clZ); clVZ = g(clVZ);
}
// cell lookup: an open-addressing hash table on the cell key, stamped per pass so it never needs clearing
const CH = 1 << Math.ceil(Math.log2(2 * MAXM + 2)), chKey = new Float64Array(CH), chVal = new Int32Array(CH), chGen = new Uint32Array(CH);
let chNow = 0, mbCap = 0, mbX = null, mbY = null, mbM = null, mbZ = null;
/* Cell-on-cell gravity for clouds with many cells: a Barnes–Hut quadtree over the cell centres. A tree node far enough
   away (its size under 0.6 of its distance) pulls as one mass at its centre of mass, softened by its mass-weighted cell
   size. Up to NC_DIRECT cells every pair is still summed exactly. */
const NC_DIRECT = 1100, BH_TH2 = 0.36;
let tnCap = 0, tnM, tnX, tnY, tnH, tnX0, tnY0, tnS, tnLeaf, tnKid, tnStack = new Int32Array(256);
function treeNode(n, x0, y0, s) {
  if (n >= tnCap) {
    tnCap = Math.max(1024, tnCap * 2);
    const g = (a, T, k = 1) => { const b = new T(tnCap * k); if (a) b.set(a); return b; };
    tnM = g(tnM, Float64Array); tnX = g(tnX, Float64Array); tnY = g(tnY, Float64Array); tnH = g(tnH, Float64Array);
    tnX0 = g(tnX0, Float64Array); tnY0 = g(tnY0, Float64Array); tnS = g(tnS, Float64Array); tnLeaf = g(tnLeaf, Int32Array); tnKid = g(tnKid, Int32Array, 4);
  }
  tnM[n] = 0; tnX[n] = 0; tnY[n] = 0; tnH[n] = 0; tnX0[n] = x0; tnY0[n] = y0; tnS[n] = s; tnLeaf[n] = -1;
}
function cellTree(nc) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let c = 0; c < nc; c++) { const x = clX[c], y = clY[c]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  let nn = 1; treeNode(0, x0, y0, Math.max(x1 - x0, y1 - y0) * 1.000001 + 1e-30);
  for (let c = 0; c < nc; c++) {
    const x = clX[c], y = clY[c], m = clM[c];
    let nd = 0, depth = 0;
    for (;;) {
      tnM[nd] += m; tnX[nd] += m * x; tnY[nd] += m * y; tnH[nd] += m * clH[c];
      const lf = tnLeaf[nd];
      if (lf === -1) { tnLeaf[nd] = c; clNx[c] = -1; break; }
      if (lf >= 0 && depth > 40) { clNx[c] = lf; tnLeaf[nd] = c; break; }   // coincident centres share a leaf
      const h = tnS[nd] / 2, X0 = tnX0[nd], Y0 = tnY0[nd];
      if (lf >= 0) { // split: the cell living here moves down a level
        tnLeaf[nd] = -2;
        for (let k = 0; k < 4; k++) { treeNode(nn, X0 + (k & 1) * h, Y0 + (k >> 1) * h, h); tnKid[nd * 4 + k] = nn++; }
        const p = lf, pk = tnKid[nd * 4 + (clX[p] >= X0 + h ? 1 : 0) + (clY[p] >= Y0 + h ? 2 : 0)], pm = clM[p];
        tnM[pk] = pm; tnX[pk] = pm * clX[p]; tnY[pk] = pm * clY[p]; tnH[pk] = pm * clH[p]; tnLeaf[pk] = p;
      }
      nd = tnKid[nd * 4 + (x >= X0 + h ? 1 : 0) + (y >= Y0 + h ? 2 : 0)]; depth++;
    }
  }
  for (let n = 0; n < nn; n++) if (tnM[n] > 0) { tnX[n] /= tnM[n]; tnY[n] /= tnM[n]; tnH[n] /= tnM[n]; }
  for (let a = 0; a < nc; a++) {
    const xa = clX[a], ya = clY[a], ha = clH[a];
    let ax = 0, ay = 0, sp = 0; tnStack[sp++] = 0;
    while (sp) {
      const nd = tnStack[--sp], lf = tnLeaf[nd];
      if (tnM[nd] === 0) continue;
      if (lf >= 0) {
        for (let b = lf; b >= 0; b = clNx[b]) {
          if (b === a) continue;
          const dx = clX[b] - xa, dy = clY[b] - ya, e = 0.5 * (ha + clH[b]), r2 = dx * dx + dy * dy + e * e, k = G * clM[b] / (r2 * Math.sqrt(r2));
          ax += k * dx; ay += k * dy;
        }
        continue;
      }
      const dx = tnX[nd] - xa, dy = tnY[nd] - ya, d2 = dx * dx + dy * dy;
      if (tnS[nd] * tnS[nd] < BH_TH2 * d2) {
        const e = 0.5 * (ha + tnH[nd]), r2 = d2 + e * e, k = G * tnM[nd] / (r2 * Math.sqrt(r2));
        ax += k * dx; ay += k * dy;
      } else {
        if (sp + 4 > tnStack.length) { const s = new Int32Array(tnStack.length * 2); s.set(tnStack); tnStack = s; }
        for (let k = 0; k < 4; k++) tnStack[sp++] = tnKid[nd * 4 + k];
      }
    }
    clAX[a] = ax; clAY[a] = ay;
  }
}
function matterCollective(dt, wallDt) {
  if (!qN) return;
  for (let i = 0; i < qN; i++) if (qT[i] > 0) qT[i] = Math.max(0, qT[i] - wallDt * 0.045);   // debris cools
  if (qN < 2 || dt <= 0) return;
  const nb = bodies.length;
  let free = 0, ox = 0, oy = 0;
  if (!nb) { // nothing to orbit: the cloud's own size sets the scale
    let M = 0; for (let i = 0; i < qN; i++) { M += qm[i]; ox += qm[i] * qx[i]; oy += qm[i] * qy[i]; }
    ox /= M; oy /= M;
    let s = 0; for (let i = 0; i < qN; i++) s += qm[i] * ((qx[i] - ox) ** 2 + (qy[i] - oy) ** 2);
    free = Math.max(Math.sqrt(s / M) / 8, 1e-9);
  }
  if (nb > mbCap) { mbCap = nb * 2; mbX = new Float64Array(mbCap); mbY = new Float64Array(mbCap); mbM = new Float64Array(mbCap); mbZ = new Float64Array(mbCap); }
  for (let j = 0; j < nb; j++) { const b = bodies[j]; mbX[j] = b.x; mbY[j] = b.y; mbM[j] = b.m; mbZ[j] = b.z; }
  if (++chNow > 4e9) { chGen.fill(0); chNow = 1; }
  let nc = 0;
  for (let i = 0; i < qN; i++) {
    const x = qx[i], y = qy[i], z = qz[i];
    let hM = 0, hR = 0, hx = ox, hy = oy, hid = 0, h = free;
    if (nb) {
      let best = -1, r2b = 0;
      for (let j = 0; j < nb; j++) { const dx = mbX[j] - x, dy = mbY[j] - y, r2 = zOn ? dx * dx + dy * dy + (mbZ[j] - z) ** 2 : dx * dx + dy * dy, t = mbM[j] / (r2 * Math.sqrt(r2) + 1e-30); if (t > best) { best = t; r2b = r2; hid = j + 1; } }
      if (hid) { hM = mbM[hid - 1]; hR = Math.sqrt(r2b); hx = mbX[hid - 1]; hy = mbY[hid - 1]; }
      h = 0.12 * hR;
    }
    const L = Math.round(Math.log2(h)), hs = Math.pow(2, L), kh = hid * 4096 + (L + 2048);
    const kx = clamp(Math.floor((x - hx) / hs), -32768, 32767) + 32768, ky = clamp(Math.floor((y - hy) / hs), -32768, 32767) + 32768;
    const key = (kh * 65536 + kx) * 65536 + ky;
    let s = Math.imul(kx ^ Math.imul(ky, 0x27d4eb2d) ^ Math.imul(kh, 0x165667b1), 0x9e3779b1); s = (s ^ s >>> 15) & (CH - 1);
    let c = -1;
    while (chGen[s] === chNow) { if (chKey[s] === key) { c = chVal[s]; break; } s = (s + 1) & (CH - 1); }
    if (c < 0) {
      if (nc >= clCap) growCells();
      c = nc++; chGen[s] = chNow; chKey[s] = key; chVal[s] = c;
      clM[c] = 0; clX[c] = 0; clY[c] = 0; clVX[c] = 0; clVY[c] = 0; clAX[c] = 0; clAY[c] = 0; clN[c] = 0; clS2[c] = 0; clSV[c] = 0; clT[c] = 0; clForm[c] = 0; clA[c] = -1; clB[c] = -1;
      clH[c] = hs; clHM[c] = hM; clHR[c] = 0; clHI[c] = hid - 1; clZ[c] = 0; clVZ[c] = 0;
    }
    const m = qm[i];
    clM[c] += m; clX[c] += m * x; clY[c] += m * y; clVX[c] += m * qvx[i]; clVY[c] += m * qvy[i]; clHR[c] += m * hR; clT[c] += m * qT[i]; clN[c]++; if (zOn) { clZ[c] += m * z; clVZ[c] += m * qvz[i]; }
    qc[i] = c;
    // remember the heaviest grain in the cell, and one other picked at random
    if (clA[c] < 0) clA[c] = i;
    else if (m > qm[clA[c]]) { clB[c] = clA[c]; clA[c] = i; }
    else if (clB[c] < 0 || rand() * clN[c] < 1) clB[c] = i;
  }
  for (let c = 0; c < nc; c++) { const m = clM[c]; clX[c] /= m; clY[c] /= m; clVX[c] /= m; clVY[c] /= m; clHR[c] /= m; clT[c] /= m; clW[c] = clHM[c] > 0 ? Math.sqrt(G * clHM[c] / Math.pow(clHR[c], 3)) : 0; if (zOn) { clZ[c] /= m; clVZ[c] /= m; } }
  // cell-on-cell gravity: every pair up to NC_DIRECT cells; past that (where it used to be skipped) the tree
  let Mq = 0, Mb = 0; for (let c = 0; c < nc; c++) Mq += clM[c]; for (const b of bodies) if (b.m > Mb) Mb = b.m;
  const heavy = Mq > 1e-5 * Mb; mcHeavy = heavy || !nb;   // light belts and rings: their own gravity is nothing next to what they orbit
  if (heavy && nc > NC_DIRECT) cellTree(nc);
  else if (heavy) for (let a = 0; a < nc; a++) {
    const xa = clX[a], ya = clY[a], ha = clH[a], ma = clM[a];
    let ax = clAX[a], ay = clAY[a];
    for (let b = a + 1; b < nc; b++) {
      const dx = clX[b] - xa, dy = clY[b] - ya, e = 0.5 * (ha + clH[b]), r2 = dx * dx + dy * dy + e * e, k = G / (r2 * Math.sqrt(r2));
      ax += k * clM[b] * dx; ay += k * clM[b] * dy; clAX[b] -= k * ma * dx; clAY[b] -= k * ma * dy;
    }
    clAX[a] = ax; clAY[a] = ay;
  }
  for (let i = 0; i < qN; i++) {
    const c = qc[i], m = qm[i];
    let ax = clAX[c], ay = clAY[c], tdt = dt;
    if (heavy && clN[c] > 1) {
      const dx = clX[c] - qx[i], dy = clY[c] - qy[i], dvx = clVX[c] - qvx[i], dvy = clVY[c] - qvy[i], dz = zOn ? clZ[c] - qz[i] : 0, dvz = zOn ? clVZ[c] - qvz[i] : 0;
      const d2 = zOn ? dx * dx + dy * dy + dz * dz : dx * dx + dy * dy, e = 0.2 * clH[c], Min = G * (clM[c] - m);
      clS2[c] += m * d2; clSV[c] += m * (zOn ? dvx * dvx + dvy * dvy + dvz * dvz : dvx * dvx + dvy * dvy);
      const r2 = d2 + e * e, k = Min / (r2 * Math.sqrt(r2));
      const wSelf = Math.sqrt(Min / (e * e * e)), wHost = clW[c];
      tdt = Math.min(dt, 0.35 / Math.max(wSelf, 1e-30));         // never kick harder than the clump's own free-fall allows
      qvx[i] += k * dx * tdt; qvy[i] += k * dy * tdt;
      const kd = 1 - Math.exp(-dt * 0.35 * Math.max(wSelf, wHost));   // inelastic collisions within the cell
      qvx[i] += dvx * kd; qvy[i] += dvy * kd;
      if (zOn) { qvz[i] += k * dz * tdt + dvz * kd; }
    }
    qvx[i] += ax * dt; qvy[i] += ay * dt;
  }
  /* Grains stick. Each particle stands for a swarm of small ones, so how often they collide depends on how much
     matter is spread over how much area (the optical depth, taking grains a few metres across), about 3 x optical depth
     collisions per orbit. A collision only builds something where the result could hold itself together against
     the tide: outside the Roche limit. Inside it, a ring stays a ring. */
  let room = BODY_CAP - bodies.length;
  const M2 = Math.pow(KM_PER_UNIT * 1000, 2);
  for (let c = 0; c < nc; c++) {
    const A = clA[c], B = clB[c];
    if (A < 0 || B < 0 || A === B || clForm[c]) continue;
    const hM = clHM[c], hR = clHR[c], w = hM > 0 ? Math.sqrt(G * hM / (hR * hR * hR)) : Math.sqrt(G * clM[c] / Math.pow(clH[c], 3));
    const tau = clM[c] * 1.989e30 / (clH[c] * clH[c] * M2) / 6000;
    if (rand() > 0.45 * clN[c] * w * tau * dt) continue;
    if (zOn && Math.abs(qz[A] - qz[B]) > clH[c]) continue;   // 3D: cells are columns, and two grains far apart in height never meet
    const m = qm[A] + qm[B];
    const hill = hM > 0 ? hR * Math.cbrt(m / (3 * hM)) : Infinity;
    if (planetRsun(m) * Math.max(qp[A], qp[B]) * sizeScale(clHI[c] >= 0 ? bodies[clHI[c]] : null) > 0.55 * hill) continue;
    qx[A] = (qx[A] * qm[A] + qx[B] * qm[B]) / m; qy[A] = (qy[A] * qm[A] + qy[B] * qm[B]) / m;
    qvx[A] = (qvx[A] * qm[A] + qvx[B] * qm[B]) / m; qvy[A] = (qvy[A] * qm[A] + qvy[B] * qm[B]) / m;
    qz[A] = (qz[A] * qm[A] + qz[B] * qm[B]) / m; qvz[A] = (qvz[A] * qm[A] + qvz[B] * qm[B]) / m;
    qT[A] = Math.max(qT[A], qT[B]); qp[A] = Math.max(qp[A], qp[B]); qk[A] = Math.min(60000, qk[A] + qk[B]); qm[A] = m; qm[B] = 0;
  }
  for (let i = qN - 1; i >= 0; i--) {
    if (qm[i] === 0) { removeMatter(i); continue; }
    if (qk[i] >= 24 * qScale && room > 0) { // enough has stuck together to count as a body of its own, if it has a zone to itself
      const c = qc[i], rH = clHM[c] > 0 ? clHR[c] * Math.cbrt(qm[i] / (3 * clHM[c])) : 0;
      let crowded = false;
      const host = clHI[c] >= 0 ? bodies[clHI[c]] : null;
      for (const o of bodies) { // an orbit already owned by another small body (anywhere round it) is taken: that body will sweep this up
        if (o.kind !== 'star' || o === host || o.m > 1e3 * qm[i]) continue;
        const sep = host ? Math.abs(sepOf(host, o) - clHR[c]) : zOn ? Math.hypot(o.x - qx[i], o.y - qy[i], o.z - qz[i]) : Math.hypot(o.x - qx[i], o.y - qy[i]);
        if (sep < 3.5 * Math.max(rH, host ? clHR[c] * Math.cbrt(o.m / (3 * host.m)) : 0)) { crowded = true; break; }
      }
      if (crowded) continue;
      const b = makeStar(typeForMass(qm[i]).id, qx[i], qy[i], qvx[i], qvy[i], qm[i]);
      b.z = qz[i]; b.vz = qvz[i];
      if (qp[i] > 1.02) { b.puff = qp[i]; b.R = b.R0 = b.R * qp[i]; }
      b.hot = qT[i] > 0.15 ? wallNow : 0; bodies.push(b); announceBirth(b); room--; removeMatter(i);
    }
  }
  // collapse
  let formed = 0;
  for (let c = 0; heavy && c < nc && room > 0; c++) {
    if (clN[c] < 8) continue;
    const m = clM[c], s = Math.sqrt(clS2[c] / m), sig2 = clSV[c] / m;
    const t = typeForMass(m);
    const Rb = (t.kind === 'planet' ? planetRsun(m) : t.Rsun) * sizeScale(clHI[c] >= 0 ? bodies[clHI[c]] : null);
    const hill = clHM[c] > 0 ? clHR[c] * Math.cbrt(m / (3 * clHM[c])) : Infinity;
    if (s < 0.3 * clH[c] && s < 0.5 * hill && Rb < 0.55 * hill && sig2 < 2 * G * m / Math.max(s, Rb)) { clForm[c] = 1; formed++; room--; }
  }
  if (!formed) { if (room !== BODY_CAP - bodies.length) computeAccel(); return; }
  for (let c = 0; c < nc; c++) {
    if (!clForm[c]) continue;
    const m = clM[c], t = typeForMass(m);
    const b = makeStar(t.id, clX[c], clY[c], clVX[c], clVY[c], m);
    b.z = clZ[c]; b.vz = clVZ[c]; b.hot = clT[c] > 0.15 ? wallNow : 0; b.born = simTime;
    bodies.push(b);
    announceBirth(b);
  }
  for (let i = qN - 1; i >= 0; i--) if (clForm[qc[i]]) removeMatter(i);
  computeAccel();
}
let births = { n: 0, last: -1e9 };
function announceBirth(b) {
  const t = b.type;
  if (t.kind === 'ms') { reached('star'); toast('A star is born', [`${massStr(b.m)} of matter fell together and its core lit up`, `It is ${/^[AO]/.test(t.name) ? 'an' : 'a'} ${t.lc}`], 'w'); return; }
  if (t.id === 'BD') { toast('A brown dwarf forms', [`${massStr(b.m)} fell together: too light to burn hydrogen, heavy enough to glow`], 'w'); return; }
  births.n++;
  if (wallNow - births.last < 2500) return;   // moonlets come in swarms: say it once in a while
  births.last = wallNow;
  toast(t.id === 'GAS' || t.id === 'ICE' ? 'A giant planet forms' : t.id === 'ROCK' ? 'A planet forms' : t.id === 'MOON' ? 'A moon forms' : 'Rubble gathers', [`Matter clumped under its own gravity into ${massStr(b.m)}`, 'Outside the Roche limit a clump holds together. Inside it, tides would pull it back apart.']);
}
/* Tides on planets and moons. A body held together only by its own gravity is pulled apart once it orbits
   closer than the Roche limit, about 2.4 (R of the big body) x (its density / the small body's density)^(1/3).
   Small solid bodies have some strength and survive a little deeper. The pieces keep the orbit: a ring. */
function planetTides(dt) {
  for (const p of bodies.slice()) {
    if (!isPlanet(p) || p.sn) continue;
    let host = null, best = 0;
    for (const o of bodies) {
      if (o === p || o.m < 3 * p.m) continue;
      const r = sepOf(p, o), t = o.m / (r * r * r);
      if (t > best) { best = t; host = o; }
    }
    if (!host) { p.f = 0; continue; }
    if (isAccretor(host)) continue;   // compact objects shred things their own way (stellarProcesses)
    const r = sepOf(p, host);
    const dR = (p.m < 1e-10 ? 1.5 : 2.0) * realRsun(p) * sizeScale(host) * Math.cbrt(host.m / p.m);
    p.f = dR / r; p.hx = host.x; p.hy = host.y; p.hz = host.z; p.roche = dR;
    // Coming apart takes time: about one of the body's own free-fall times spent well inside the limit.
    // So a moon orbiting inside it is doomed, while something plunging straight through to an impact arrives whole.
    const Rp = realRsun(p) * sizeScale(host), wp = Math.sqrt(G * p.m / (Rp * Rp * Rp));
    if (r < dR) p.tidal = (p.tidal || 0) + Math.min(dt * wp * (Math.pow(dR / r, 3) - 1), 0.4);
    else if (p.tidal) p.tidal *= Math.exp(-dt * wp * 0.05);
    if (p.tidal > 1 && r > host.R + p.R) ringFrom(p, host, r);
  }
}
/* Two small worlds that have captured each other (bound, and within three combined radii) do not stay a pair:
   that close, each is inside the other's Roche zone, and tides and debris bring them together within a few orbits.
   This is how a swarm of moonlets ends up as one moon. Wide, stable pairs like Earth and its Moon are left alone. */
function planetPairs() {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]; if (!isPlanet(a)) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]; if (!isPlanet(b) || Math.min(a.m, b.m) < 0.02 * Math.max(a.m, b.m)) continue;   // peers only: a moon close to its planet is the Roche limit's business
      const d = sepOf(a, b);
      if (d > 3 * (a.R + b.R)) continue;
      const vx = b.vx - a.vx, vy = b.vy - a.vy, vz = b.vz - a.vz;
      if (0.5 * (vx * vx + vy * vy + vz * vz) - G * (a.m + b.m) / d >= 0) continue;
      const big = a.m >= b.m ? a : b, small = big === a ? b : a, M = a.m + b.m;
      zmix(big, a, b);
      big.x = (a.x * a.m + b.x * b.m) / M; big.y = (a.y * a.m + b.y * b.m) / M;
      big.vx = (a.vx * a.m + b.vx * b.m) / M; big.vy = (a.vy * a.m + b.vy * b.m) / M;
      big.m = M; big.hot = Math.max(big.hot || 0, small.hot || 0); big.tidal = 0;
      bodies = bodies.filter(o => o !== small);
      if (followId === small.id) followId = big.id;
      regrade(big); computeAccel();
      return planetPairs();
    }
  }
}
// in the giant-impact scene, say so when the debris has gathered into something like the real Moon
function nameTheMoon() {
  if (currentPreset !== 'theia' || bodies.some(b => b.label === 'Moon')) return;
  const earth = bodies.find(b => b.label === 'Proto-Earth'); if (!earth) return;
  const moons = bodies.filter(b => isPlanet(b) && b !== earth && !b.label).sort((p, q) => q.m - p.m);
  if (!moons.length || moons[0].m < 0.5 * 3.694e-8 || (moons[1] && moons[1].m > 0.25 * moons[0].m)) return;
  const m = moons[0]; m.label = 'Moon'; m.moonOf = earth.id; m.col = [200, 196, 188];
  toast('A Moon', [`${(m.m / 3.694e-8).toFixed(2)} times the mass of the real Moon, ${(Math.hypot(m.x - earth.x, m.y - earth.y) * KM_PER_UNIT / 6371).toFixed(1)} Earth radii out`,
    'The real one is thought to have gathered at 3 to 5 Earth radii within months to years, and has been drifting outward ever since, 3.8 cm a year today.'], 'w');
}
function ringFrom(p, host, r) {
  const N = Math.min(Math.round(clamp(500 + 160 * Math.log10(p.m / 1e-12), 300, 1500)) * qScale, Q.mat - qN);
  bodies = bodies.filter(o => o !== p);
  if (followId === p.id) followId = host.id;
  if (N < 8) { matterLands(host, p.m, p.vx, p.vy, p.vz); return; }
  reached('rings');
  const vesc = Math.sqrt(2 * G * p.m / p.R), puff = p.R / planetR(p.m, p.real);
  for (let k = 0; k < N; k++) {
    const a = rand() * Math.PI * 2, d = p.R * Math.sqrt(rand()) * 1.1, sp = vesc * 0.5 * rand(), va = rand() * Math.PI * 2;
    addMatter(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, p.vx + Math.cos(va) * sp, p.vy + Math.sin(va) * sp, p.m / N, 0, puff, p.z, p.vz); qr[qN - 1] = 1;
  }
  toast('Torn into a ring', [`${cap(bodyName(p))} came within ${fmtDist(r * KM_PER_UNIT)} of ${bodyName(host)}, inside its Roche limit`,
    'There the pull on its near side beats its own gravity, so it came apart. The pieces spread along the orbit into a ring and cannot gather back into a moon this close in.'], 'w');
  computeAccel();
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
/* Two planets collide. Slow or head-on, they simply merge. Fast or glancing, part of the smaller one is thrown
   off as molten debris, some of it into orbit: this is how the Moon is thought to have formed. */
function planetImpact(a, b) {
  const big = a.m >= b.m ? a : b, small = big === a ? b : a, M = a.m + b.m;
  const dx = small.x - big.x, dy = small.y - big.y, dz = small.z - big.z, r = (zOn ? Math.hypot(dx, dy, dz) : Math.hypot(dx, dy)) || 1e-9;
  const rvx = small.vx - big.vx, rvy = small.vy - big.vy, rvz = small.vz - big.vz, v = zOn ? Math.hypot(rvx, rvy, rvz) : Math.hypot(rvx, rvy);
  const vesc = Math.sqrt(2 * G * M / (big.R + small.R)), Lz = dx * rvy - dy * rvx, L = zOn ? Math.hypot(dy * rvz - dz * rvy, dz * rvx - dx * rvz, Lz) : Math.abs(Lz);
  // speed and angle as they were at first contact (the bodies overlap a little before this is called)
  const Rc = big.R + small.R, vc = Math.sqrt(Math.max(v * v - 2 * G * M * (1 / r - 1 / Math.max(Rc, r)), 0.25 * v * v));
  const sinT = vc > 0 ? Math.min(1, L / (Rc * vc)) : 0, x = Math.max(0, vc / vesc - 1);
  const kms = vc * KM_PER_UNIT / SIM2REAL;
  let f = clamp(sinT * (0.3 + 0.5 * x) + 0.1 * x * x, 0, 0.9);
  f *= big.real ? clamp((kms - 3) / 4, 0, 1) : 0.5;   // gentle bumps between small bodies just stick
  let N = Math.min(Math.round(80 + 900 * f), Q.mat - qN);   // never more grains on a bigger budget: four times as many gather into a smaller Moon
  const md = f * small.m;
  if (md < 2e-4 * M || N < 12) { N = 0; }
  const keep = small.m - (N ? md : 0), Mn = big.m + keep;
  const cx = (big.x * big.m + small.x * keep) / Mn, cy = (big.y * big.m + small.y * keep) / Mn;
  const cvx = (big.vx * big.m + small.vx * keep) / Mn, cvy = (big.vy * big.m + small.vy * keep) / Mn;
  const cz = (big.z * big.m + small.z * keep) / Mn, cvz = (big.vz * big.m + small.vz * keep) / Mn;   // debris spreads level with the impact, parallel to the plane
  const names = [cap(bodyName(small)), bodyName(big)];
  big.x = cx; big.y = cy; big.vx = cvx; big.vy = cvy; big.z = cz; big.vz = cvz; big.m = Mn;
  bodies = bodies.filter(o => o !== small);
  if (followId === small.id) followId = big.id;
  regrade(big);
  sfx('impact', cx, cy, N ? 1 : 0.4);
  if (N) {
    reached('impact');
    big.hot = wallNow;
    const sg = Lz >= 0 ? 1 : -1, phi = Math.atan2(dy, dx), Rm = big.R, GM = G * Mn;
    for (let k = 0; k < N; k++) {
      const rho = Rm * (1.25 + 2.3 * Math.pow(rand(), 1.3));
      const ang = phi + sg * (-0.3 + 2.6 * rand());
      const ux = Math.cos(ang), uy = Math.sin(ang), vc = Math.sqrt(GM / rho);
      const vt = vc * (0.82 + 0.36 * rand()) * sg, vr = vc * 0.2 * (rand() - 0.3);
      if (addMatter(cx + ux * rho, cy + uy * rho, cvx - uy * vt + ux * vr, cvy + ux * vt + uy * vr, md / N, 1, 0, cz, cvz)) qk[qN - 1] = qScale;   // each counts as qScale grains
    }
    flashes.push({ x: cx, y: cy, z: cz, t0: wallNow, dur: 2600, scale: big.R / 30 });
    shake = wallNow;
    toast('Giant impact', [`${names[0]} struck ${names[1]} at ${kms >= 1 && big.real ? kms.toFixed(1) + ' km/s' : (vc / vesc).toFixed(1) + '× escape speed'}, ${Math.round(Math.asin(sinT) * 57.3)}° off head-on`,
      `${Math.round(f * 100)}% of it was thrown off as molten debris. What falls back rejoins the planet; what stays in orbit beyond the Roche limit can gather into a moon.`], 'w');
  } else toast('Worlds merge', [`${names[0]} merged into ${names[1]} · now ${massStr(Mn)}`]);
}
/* Magnetars. A neutron star with a field near 10^11 tesla, a thousand times a pulsar's. The field strains the crust
   until it cracks (a starquake) and the field snaps into a new shape: a giant flare. The 2004 flare of SGR 1806-20
   put out more energy in a fifth of a second than the Sun does in about 100,000 years, and it was 50,000 light-years away. */
function magnetarFlare(b) {
  b.flares = (b.flares || 0) + 1; b.flareAt = wallNow + 14000 + 16000 * rand(); b.flashT = wallNow;
  flashes.push({ x: b.x, y: b.y, t0: wallNow, dur: 2200, scale: 0.9 });
  flashes.push({ x: b.x, y: b.y, t0: wallNow, dur: 5000, kind: 'sn', R: 3, power: 0.55, st: simTime });
  sfx('flare', b.x, b.y);
  if (!reduceMotion) shake = wallNow;
  // the burst of gamma rays shoves nearby gas and dust outward and scorches any world close by
  const reach = 160, push = (x, y) => { const dx = x - b.x, dy = y - b.y, r = Math.hypot(dx, dy); return r < reach && r > 1e-6 ? [dx / r, dy / r, 0.08 * C / (1 + r / 12)] : null; };
  if (!b.real) {
    for (let i = 0; i < gN; i++) { const k = push(gx[i], gy[i]); if (k) { gvx[i] += k[0] * k[2]; gvy[i] += k[1] * k[2]; } }
    for (let i = 0; i < qN; i++) { const k = push(qx[i], qy[i]); if (k) { qvx[i] += k[0] * k[2]; qvy[i] += k[1] * k[2]; qT[i] = 1; } }
  }
  let hitWorld = null;
  for (const o of bodies) if (isPlanet(o) && sepOf(b, o) < (b.real ? 2e9 : reach * 2)) { o.hot = wallNow; hitWorld = o; }
  if (b.flares === 1 || hitWorld) toast('Giant flare', [b.flares === 1 ? 'The magnetar’s crust cracked and its magnetic field snapped into a new shape' : `Flare ${b.flares} from the magnetar`,
    hitWorld ? `${cap(bodyName(hitWorld))} was close enough to have its surface scorched and its atmosphere stripped` : 'In a fraction of a second it released more energy than the Sun does in 100,000 years. Nearby gas is blown outward.'], 'w');
}
// the matter brush
let matterRate = -5.5;   // log10 of solar masses sprayed per second
function sprayMatter(sx, sy, wallDt) {
  if (matterFull && qN > matCap - 16) return;
  matterFull = false;
  const n = 8 * qScale, m = Math.pow(10, matterRate) * Math.min(wallDt, 0.05) / n;
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2, d = 26 * Math.sqrt(rand());
    const [wx, wy] = toW(sx + Math.cos(a) * d, sy + Math.sin(a) * d * Math.max(cosI, 0.2));
    let vx = 0, vy = 0;
    const host = dominantAny(wx, wy);
    if (host) { // near something: put it on a circular orbit, with a little scatter
      const dx = wx - host.x, dy = wy - host.y, r = Math.hypot(dx, dy) || 1, v = Math.sqrt(G * host.m / r) * (1 + 0.04 * (rand() - 0.5));
      vx = host.vx + dy / r * v; vy = host.vy - dx / r * v;
    }
    if (qN >= matCap || !addMatter(wx, wy, vx, vy, m, 0)) { matterFull = true; toast('That is all the loose matter the sandbox can track', ['Let some of it settle into bodies, then spray more']); return; }
  }
}

