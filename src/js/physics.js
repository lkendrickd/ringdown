/* ================= physics ================= */
function gwDrag(a, b, r) {
  if (gwBoost <= 0) return;
  const rr = Math.max(r, 0.5);
  const P = gwBoost * 6.4 * G4C5 * a.m * a.m * b.m * b.m * (a.m + b.m) / (rr ** 5);
  const rvx = a.vx - b.vx, rvy = a.vy - b.vy, rv = Math.hypot(rvx, rvy);
  if (rv > 1e-3) {
    const F = P / rv, ex = rvx / rv, ey = rvy / rv;
    a.ax -= F / a.m * ex; a.ay -= F / a.m * ey; b.ax += F / b.m * ex; b.ay += F / b.m * ey;
  }
}
function computeAccel() {
  const n = bodies.length;
  for (const b of bodies) { b.ax = 0; b.ay = 0; b.az = 0; }
  for (let i = 0; i < n; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j];
      const dx = b.x - a.x, dy = b.y - a.y, dz = zOn ? b.z - a.z : 0, r2 = zOn ? dx * dx + dy * dy + dz * dz : dx * dx + dy * dy;
      const r = Math.sqrt(r2) || 1e-6, ux = dx / r, uy = dy / r;
      if (a.kind === 'bh' && b.kind === 'bh') {
        const f = G / (r2 + 0.25);
        a.ax += f * b.m * ux; a.ay += f * b.m * uy; b.ax -= f * a.m * ux; b.ay -= f * a.m * uy;
        if (zOn) { a.az += f * b.m * dz / r; b.az -= f * a.m * dz / r; }
        gwDrag(a, b, r);
      } else if (a.kind === 'bh' || b.kind === 'bh') {
        const bh = a.kind === 'bh' ? a : b, st = a.kind === 'bh' ? b : a, sg = a.kind === 'bh' ? 1 : -1;
        const rp = rpFor(bh, st.x - bh.x, st.y - bh.y, st.vx - bh.vx, st.vy - bh.vy);
        const d = Math.max(r - rp, 0.25 * rp);
        const fs = G * bh.m / (d * d);
        st.ax -= sg * fs * ux; st.ay -= sg * fs * uy;
        const fb = G * st.m / (r2 + st.R * st.R * 0.25);
        bh.ax += sg * fb * ux; bh.ay += sg * fb * uy;
        if (zOn) { st.az -= sg * fs * dz / r; bh.az += sg * fb * dz / r; }
        if (isCompact(st)) gwDrag(a, b, r);
      } else {
        const e = (a.R + b.R) * 0.5, f = G / (r2 + e * e);
        a.ax += f * b.m * ux; a.ay += f * b.m * uy; b.ax -= f * a.m * ux; b.ay -= f * a.m * uy;
        if (zOn) { a.az += f * b.m * dz / r; b.az -= f * a.m * dz / r; }
        if (isCompact(a) && isCompact(b)) gwDrag(a, b, r);
      }
    }
  }
}

function orbitSign(a, b) { // +1 when the pair circles counter-clockwise on screen (same sense as positive spin)
  const dx = b.x - a.x, dy = b.y - a.y, rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  return (dx * rvy - dy * rvx) < 0 ? 1 : -1;
}
function mergeDist(a, b) {
  if (a.kind === 'bh' && b.kind === 'bh') {
    const sL = orbitSign(a, b), M = a.m + b.m, chiEff = (a.m * a.chi + b.m * b.chi) * sL / M;
    return 1.7 * (rsOf(a.m) + rsOf(b.m)) * (1 - 0.25 * chiEff);
  }
  if (a.kind === 'bh' || b.kind === 'bh') {
    const bh = a.kind === 'bh' ? a : b, st = a.kind === 'bh' ? b : a;
    return Math.max(1.3 * bh.kPlus * rsOf(bh.m), isNS(st) ? st.R / rocheFrac(st.m / bh.m) : 0);
  }
  return 1.3 * (a.R + b.R);
}

// shortest dynamical time among close pairs: the step size has to resolve it
function dynTime() {
  const n = bodies.length; let tmin = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = bodies[i], b = bodies[j];
    const r = sepOf(a, b);
    if (a.kind !== 'bh' && b.kind !== 'bh' && !(isNS(a) && isNS(b)) && r > (a.R + b.R) * 8) {
      // far apart: no close-encounter physics to resolve, just the orbit itself (planets round a star, moons round a planet)
      const t = 2.5 * Math.sqrt(r * r * r / (G * (a.m + b.m))); if (t < tmin) tmin = t;
      continue;
    }
    let rr = r;
    if ((a.kind === 'bh') !== (b.kind === 'bh')) { const bh = a.kind === 'bh' ? a : b, rs = rsOf(bh.m) * bh.kP; rr = Math.max(r - 0.8 * rs, 0.4 * rs); }
    const t1 = Math.sqrt(rr * rr * rr / (G * (a.m + b.m)));
    const rv = zOn ? Math.hypot(b.vx - a.vx, b.vy - a.vy, b.vz - a.vz) : Math.hypot(b.vx - a.vx, b.vy - a.vy);
    const t2 = rv > 0 ? 2 * rr / rv : Infinity;
    tmin = Math.min(tmin, t1, t2);
  }
  return tmin;
}
// Kick-drift-kick leapfrog with the step re-chosen every step, so a plunge through pericenter in the middle of a
// long (time-warped) frame is still resolved. Past 240 steps it stops early: time dilates instead of losing accuracy.
function stepBodies(simDt) {
  if (!bodies.length) { simTime += simDt; return simDt; }
  if (bodies.length > 3 && bodies.every(b => b.kind === 'star' && !isCompact(b))) return stepBodiesPlain(simDt);
  const CAP = 240;
  let left = simDt, steps = 0;
  computeAccel();
  while (left > simDt * 1e-9 && steps < CAP) {
    const tmin = dynTime();
    const dt = Math.min(left, isFinite(tmin) ? 0.02 * tmin : left);
    for (const b of bodies) { b.vx += 0.5 * dt * b.ax; b.vy += 0.5 * dt * b.ay; b.x += dt * b.vx; b.y += dt * b.vy; if (zOn) { b.vz += 0.5 * dt * b.az; b.z += dt * b.vz; } }
    computeAccel();
    for (const b of bodies) { b.vx += 0.5 * dt * b.ax; b.vy += 0.5 * dt * b.ay; if (zOn) b.vz += 0.5 * dt * b.az; }
    simTime += dt; left -= dt; steps++;
    let guard = 0;
    while (collisions() && guard++ < 6) computeAccel();
    if (!bodies.length) { simTime += left; left = 0; }
  }
  return simDt - left;
}

/* The same integrator for scenes with nothing relativistic in them (only ordinary stars, planets and moons), where
   every pair feels plain softened Newtonian gravity. One tight pass finds the forces, the step size and any
   collision together, which is what lets a whole planetary system with moons run at speed. */
let pbN = 0, pbX = new Float64Array(64), pbY = new Float64Array(64), pbVX = new Float64Array(64), pbVY = new Float64Array(64);
let pbAX = new Float64Array(64), pbAY = new Float64Array(64), pbGM = new Float64Array(64), pbR = new Float64Array(64), pbInf = new Float64Array(64);
let pbZ = new Float64Array(64), pbVZ = new Float64Array(64), pbAZ = new Float64Array(64);   // heights (3D scenes)
let ppE2 = new Float64Array(4096), ppIG = new Float64Array(4096), ppRR = new Float64Array(4096);   // 3D: each pair's softening², 1 / (GM + GM) and touching distance
let plainBudget = 1600;   // steps a frame may spend here; past that, time runs slower instead of the picture stuttering
function stepBodiesPlain(simDt) {
  let n = 0, tmin2 = Infinity, hit = false;
  const load = () => {
    n = bodies.length;
    if (n > pbX.length) { const g = () => new Float64Array(n * 2); pbX = g(); pbY = g(); pbVX = g(); pbVY = g(); pbAX = g(); pbAY = g(); pbGM = g(); pbR = g(); pbInf = g(); pbZ = g(); pbVZ = g(); pbAZ = g(); }
    for (let i = 0; i < n; i++) { const b = bodies[i]; pbX[i] = b.x; pbY[i] = b.y; pbVX[i] = b.vx; pbVY[i] = b.vy; pbGM[i] = G * b.m; pbR[i] = b.R; pbZ[i] = b.z; pbVZ[i] = b.vz; }
    if (zOn) {
      if (n * n > ppE2.length) { ppE2 = new Float64Array(n * n * 2); ppIG = new Float64Array(n * n * 2); ppRR = new Float64Array(n * n * 2); }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const rr = pbR[i] + pbR[j], e = rr * 0.5; ppRR[i * n + j] = rr; ppE2[i * n + j] = e * e; ppIG[i * n + j] = 1 / (pbGM[i] + pbGM[j]); }
    }
    // Light bodies (under a millionth of the heaviest) only matter to each other from close by. pbInf is how close,
    // squared: a few Hill radii. Zero marks a heavy body, which every pair still counts.
    let gmMax = 0; for (let i = 0; i < n; i++) if (pbGM[i] > gmMax) gmMax = pbGM[i];
    for (let i = 0; i < n; i++) {
      pbInf[i] = 0;
      if (pbGM[i] >= 1e-6 * gmMax) continue;
      let tide = 0;
      for (let k = 0; k < n; k++) { if (k === i || pbGM[k] <= pbGM[i]) continue; const dx = pbX[k] - pbX[i], dy = pbY[k] - pbY[i], r2 = zOn ? dx * dx + dy * dy + (pbZ[k] - pbZ[i]) ** 2 : dx * dx + dy * dy, t = pbGM[k] / (r2 * Math.sqrt(r2)); if (t > tide) tide = t; }
      const reach = Math.max(4 * Math.cbrt(pbGM[i] / (3 * tide)), 6 * pbR[i]);
      pbInf[i] = reach * reach;
    }
  };
  const store = () => { for (let i = 0; i < n; i++) { const b = bodies[i]; b.x = pbX[i]; b.y = pbY[i]; b.vx = pbVX[i]; b.vy = pbVY[i]; b.ax = pbAX[i]; b.ay = pbAY[i]; if (zOn) { b.z = pbZ[i]; b.vz = pbVZ[i]; b.az = pbAZ[i]; } } };
  const accel = () => {
    tmin2 = Infinity; hit = false;
    for (let i = 0; i < n; i++) { pbAX[i] = 0; pbAY[i] = 0; }
    for (let i = 0; i < n; i++) {
      const xi = pbX[i], yi = pbY[i], gi = pbGM[i], ri = pbR[i], fi = pbInf[i];
      let ax = 0, ay = 0;
      for (let j = i + 1; j < n; j++) {
        const dx = pbX[j] - xi, dy = pbY[j] - yi, r2 = dx * dx + dy * dy;
        if (fi > 0 && pbInf[j] > 0 && r2 > fi + pbInf[j]) continue;   // two light bodies far apart
        const r = Math.sqrt(r2) || 1e-6, rr = ri + pbR[j];
        const e = rr * 0.5, k = 1 / (r * (r2 + e * e)), gj = pbGM[j];
        ax += k * gj * dx; ay += k * gj * dy; pbAX[j] -= k * gi * dx; pbAY[j] -= k * gi * dy;
        // time for this pair to move appreciably: a sixth of that when they are about to touch, so impacts are resolved
        let t2 = r2 * r / (gi + gj);
        if (r < 3 * rr) { t2 /= 36; if (r < 0.95 * rr) hit = true; }
        if (t2 < tmin2) tmin2 = t2;
      }
      pbAX[i] += ax; pbAY[i] += ay;
    }
  };
  // The same in 3D (the Solar System). Each pair's constants come from load(), which pays for the extra height terms.
  const accel3 = () => {
    tmin2 = Infinity; hit = false;
    for (let i = 0; i < n; i++) { pbAX[i] = 0; pbAY[i] = 0; pbAZ[i] = 0; }
    for (let i = 0; i < n; i++) {
      const xi = pbX[i], yi = pbY[i], zi = pbZ[i], gi = pbGM[i], fi = pbInf[i], o = i * n;
      let ax = 0, ay = 0, az = 0;
      for (let j = i + 1; j < n; j++) {
        const dx = pbX[j] - xi, dy = pbY[j] - yi, fj = pbInf[j];
        let r2 = dx * dx + dy * dy;
        if (fi > 0 && fj > 0 && r2 > fi + fj) continue;   // two light bodies far apart (already on the plane, before their heights)
        const dz = pbZ[j] - zi; r2 += dz * dz;
        if (fi > 0 && fj > 0 && r2 > fi + fj) continue;
        const r = Math.sqrt(r2) || 1e-6, rr = ppRR[o + j], k = 1 / (r * (r2 + ppE2[o + j])), kj = k * pbGM[j], ki = k * gi;
        ax += kj * dx; ay += kj * dy; az += kj * dz; pbAX[j] -= ki * dx; pbAY[j] -= ki * dy; pbAZ[j] -= ki * dz;
        let t2 = r2 * r * ppIG[o + j];
        if (r < 3 * rr) { t2 /= 36; if (r < 0.95 * rr) hit = true; }
        if (t2 < tmin2) tmin2 = t2;
      }
      pbAX[i] += ax; pbAY[i] += ay; pbAZ[i] += az;
    }
  };
  const force = zOn ? accel3 : accel;
  load(); force();
  let left = simDt, steps = 0;
  while (left > simDt * 1e-9 && steps < 900 && plainBudget > 0) {
    plainBudget--;
    const dt = Math.min(left, 0.12 * Math.sqrt(tmin2));
    for (let i = 0; i < n; i++) { pbVX[i] += 0.5 * dt * pbAX[i]; pbVY[i] += 0.5 * dt * pbAY[i]; pbX[i] += dt * pbVX[i]; pbY[i] += dt * pbVY[i]; }
    if (zOn) for (let i = 0; i < n; i++) { pbVZ[i] += 0.5 * dt * pbAZ[i]; pbZ[i] += dt * pbVZ[i]; }
    force();
    for (let i = 0; i < n; i++) { pbVX[i] += 0.5 * dt * pbAX[i]; pbVY[i] += 0.5 * dt * pbAY[i]; }
    if (zOn) for (let i = 0; i < n; i++) pbVZ[i] += 0.5 * dt * pbAZ[i];
    simTime += dt; left -= dt; steps++;
    if (hit) {
      store();
      let guard = 0, any = false; while (collisions() && guard++ < 6) any = true;
      if (!bodies.length) { simTime += left; return simDt; }
      if (any && !bodies.every(b => b.kind === 'star' && !isCompact(b))) { computeAccel(); return simDt - left; }
      load(); force(); hit = false;
    }
  }
  store();
  return simDt - left;
}

function collisions() {
  const n = bodies.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = bodies[i], b = bodies[j];
    const r = sepOf(a, b);
    if (a.kind === 'bh' && b.kind === 'bh') {
      if (r < mergeDist(a, b)) { mergeBH(a, b); return true; }
    } else if (a.kind === 'bh' || b.kind === 'bh') {
      const bh = a.kind === 'bh' ? a : b, st = a.kind === 'bh' ? b : a, rs = rsOf(bh.m);
      const rp = rpFor(bh, st.x - bh.x, st.y - bh.y, st.vx - bh.vx, st.vy - bh.vy);
      if (isNS(st)) {
        const rT = st.R / rocheFrac(st.m / bh.m);
        if (r < rT && rT > 2.2 * rp) { shred(st, bh, r, 'nsbh'); return true; }
      }
      if (r < Math.max(1.3 * bh.kPlus * rs, 1.5 * rp) + st.R * 0.2) { swallow(bh, st); return true; }
    } else if (isNS(a) && isNS(b)) {
      if (r < 1.3 * (a.R + b.R)) { mergeNS(a, b); return true; }
    } else if (r < (isPlanet(a) && isPlanet(b) ? 0.95 : 0.6) * (a.R + b.R) && !(a.sn && a.sn.mode === 'ia') && !(b.sn && b.sn.mode === 'ia')) { if (isPlanet(a) && isPlanet(b)) planetImpact(a, b); else mergeStars(a, b); return true; }
  }
  return false;
}

function ringFor(mf, chiAbs) {
  // Berti, Cardoso & Will fits for the l = m = 2, n = 0 quasi-normal mode
  const c = Math.min(chiAbs, 0.998);
  const omg = 1.5251 - 1.1568 * Math.pow(1 - c, 0.1292);
  const Q = 0.7 + 1.4187 * Math.pow(1 - c, -0.4990);
  const tauG = 2 * Q / omg;
  return { wSim: omg / (TSUN_SIM * mf), tauSim: tauG * TSUN_SIM * mf, fReal: omg / (2 * Math.PI * TSUN_REAL * mf), tauReal: tauG * TSUN_REAL * mf };
}
function pairWave(a, b) {
  const M = a.m + b.m, dx = b.x - a.x, dy = b.y - a.y, r2 = dx * dx + dy * dy || 1;
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy, mu = a.m * b.m / M;
  const v2 = (rvx * rvx + rvy * rvy) / (C * C);
  return { phi: Math.atan2(dy, dx), om: (dx * rvy - dy * rvx) / r2, A: mu * v2, vis: clamp(v2 / 0.12, 0, 1.6) };
}
function startRing(rem, w, chiAbs) {
  const q = ringFor(rem.m, chiAbs), sgn = w.om >= 0 ? 1 : -1;
  rem.ring = { t0: simTime, A0: 0.24, w: sgn * q.wSim, tau: q.tauSim, phi0: 2 * w.phi };
  gwSrc = { mode:'ring', tm: simTime, phi: w.phi, om: w.om, A: w.A, Ar: 1.35 * w.A, vis: w.vis, visR: 1.35 * w.vis,
    wq: sgn * q.wSim, tau: q.tauSim, remId: rem.id, cx: rem.x, cy: rem.y, fReal: q.fReal, tauReal: q.tauReal };
  slowHoldUntil = simTime + 7 * q.tauSim;
  markScope = true;
  return q;
}

// Remnant of two holes, m1 the heavier, with spins c1 and c2 along the orbit's axis. Returns its spin (relative to the
// orbit), the fraction of the mass radiated (from the remnant's ISCO binding energy) and the remnant mass.
function remnantFit(m1, m2, c1, c2) {
  const M = m1 + m2, eta = m1 * m2 / (M * M), q = m2 / m1;
  const ct = (c1 + c2 * q * q) / (1 + q * q);
  // Rezzolla et al. (2008) remnant spin for aligned spins, relative to the orbit
  let chi = ct - 0.129 * ct * ct * eta - 0.384 * ct * eta * eta - 2.686 * ct * eta + 2 * Math.sqrt(3) * eta - 3.454 * eta * eta + 2.353 * eta ** 3;
  chi = clamp(chi, -0.998, 0.998);
  const frac = 0.46 * (4 * eta) ** 2 * (1 - eIsco(chi));
  return { chi, frac, mf: M * (1 - frac) };
}
function mergeBH(a, b) {
  const M = a.m + b.m, eta = a.m * b.m / (M * M);
  const sL = orbitSign(a, b);
  const big = a.m >= b.m ? a : b, sml = big === a ? b : a;
  const c1 = big.chi * sL, c2 = sml.chi * sL;
  const { chi: chiA, frac, mf } = remnantFit(big.m, sml.m, c1, c2);
  const w = pairWave(a, b);
  const kickKms = 1.2e4 * eta * eta * Math.sqrt(Math.max(0, 1 - 4 * eta)) * (1 - 0.93 * eta);
  const kick = kickKms / 299792.458 * C;
  const ls = Math.hypot(sml.vx, sml.vy) || 1;
  const x = (a.x * a.m + b.x * b.m) / M, y = (a.y * a.m + b.y * b.m) / M;
  const vx = (a.vx * a.m + b.vx * b.m) / M - kick * sml.vx / ls, vy = (a.vy * a.m + b.vy * b.m) / M - kick * sml.vy / ls;
  const rem = makeBH(x, y, vx, vy, mf, chiA * sL); zmix(rem, a, b);
  rem.feedRate = Math.max(a.feedRate, b.feedRate);
  bodies = bodies.filter(o => o !== a && o !== b);
  bodies.push(rem);
  const qn = startRing(rem, w, Math.abs(chiA));
  sfx('bh', x, y, clamp(0.5 + M / 100, 0.5, 1.4), qn.fReal);
  reached('merge');
  const spinNote = (Math.abs(a.chi) > 0.02 || Math.abs(b.chi) > 0.02) ? ` (from ${fmtChi(c1)} and ${fmtChi(c2)} relative to the orbit)` : '';
  toast('Black holes merged', [
    `${fmtM(a.m)} + ${fmtM(b.m)} → ${fmtM(mf)} M☉, spin ${chiA.toFixed(2)}${spinNote}`,
    `${fmtM(M - mf)} M☉ (${(frac * 100).toFixed(1)}%) radiated as gravitational waves`,
    `Ringdown ${fmtHz(qn.fReal)}, e-folds in ${(qn.tauReal * 1000).toFixed(1)} ms of real time`,
  ], 'w', { id: 'bh-merge', m1: big.m, m2: sml.m, mf, chi: chiA });
}
function addKilonova(x, y, scale, ej, vx, vy) {
  flashes.push({ x, y, t0: wallNow, dur: 9000, scale });
  const N = Math.min(240, MAXG - gN);
  for (let k = 0; k < N; k++) {
    // launched from ~70 km out at 0.25-0.45 c, fast enough to escape
    const a = rand() * Math.PI * 2, s = (0.25 + 0.2 * rand()) * C, r0 = 6;
    addGas(x + Math.cos(a) * r0, y + Math.sin(a) * r0, vx + Math.cos(a) * s, vy + Math.sin(a) * s, ej / Math.max(N, 1));
  }
}
function mergeNS(a, b) {
  const M = a.m + b.m, sL = orbitSign(a, b);
  const ej = 0.03 + 0.03 * rand(), erad = 0.015 * M, mf = M - ej - erad;
  const w = pairWave(a, b);
  const x = (a.x * a.m + b.x * b.m) / M, y = (a.y * a.m + b.y * b.m) / M;
  const vx = (a.vx * a.m + b.vx * b.m) / M, vy = (a.vy * a.m + b.vy * b.m) / M;
  bodies = bodies.filter(o => o !== a && o !== b);
  addKilonova(x, y, 0.28, ej, vx, vy);
  sfx('kn', x, y);
  reached('kilonova');
  if (mf > 2.3) {
    const rem = makeBH(x, y, vx, vy, mf, 0.68 * sL); zmix(rem, a, b);
    rem.grbT = wallNow;
    bodies.push(rem);
    const qn = startRing(rem, w, 0.68);
    toast('Neutron stars merged · kilonova', [
      `${fmtM(a.m)} + ${fmtM(b.m)} M☉ → ${fmtM(mf)} M☉ black hole`,
      `About ${ej.toFixed(2)} M☉ of r-process ejecta (gold, platinum, uranium)`,
      `Short gamma-ray burst jet; ringdown ${fmtHz(qn.fReal)}, above LIGO's sweet spot`,
    ], 'w', { id: 'ns-merge', m1: a.m, m2: b.m, mf, rem: 'bh' });
  } else {
    const rem = makeStar('NS', x, y, vx, vy, mf); rem.R = 1.1; rem.R0 = 1.1; zmix(rem, a, b);
    bodies.push(rem);
    gwSrc = null; markScope = true;
    toast('Neutron stars merged · kilonova', [`${fmtM(a.m)} + ${fmtM(b.m)} M☉ → ${fmtM(mf)} M☉ neutron star (light enough to survive)`, `About ${ej.toFixed(2)} M☉ of r-process ejecta`], 'w', { id: 'ns-merge', m1: a.m, m2: b.m, mf, rem: 'ns' });
  }
}
function swallow(bh, st) {
  bh.m += st.m; totalFed += st.m; bh.fedFrame += st.m; bh.fedTotal = (bh.fedTotal || 0) + st.m;
  if (bh.m > 1e4) reached('sgra');
  bodies = bodies.filter(o => o !== st);
  toast('Swallowed whole', [`${st.type.name} crossed the horizon of the ${fmtM(bh.m - st.m)} M☉ hole intact`]);
}
function mergeStars(a, b) {
  if (isNS(a) || isNS(b)) {
    const ns = isNS(a) ? a : b, st = ns === a ? b : a, M = a.m + b.m;
    if (st.type.kind === 'giant') { // the real Thorne–Żytkow case: a neutron star sinks into a giant's envelope
      const z = st.z; zmix(st, a, b); st.z = z;
      st.vx = (a.vx * a.m + b.vx * b.m) / M; st.vy = (a.vy * a.m + b.vy * b.m) / M; st.m = M; st.m0 = M;
      bodies = bodies.filter(o => o !== ns);
      toast('Thorne–Żytkow object', [`The neutron star sank into the ${st.type.name}'s core`, 'A giant with a neutron star where its core should be (Thorne & Żytkow, 1977)']);
    } else shred(st, ns, sepOf(ns, st), 'ns');
    return;
  }
  sfx('impact', (a.x + b.x) / 2, (a.y + b.y) / 2, 0.6);
  const wdA = a.type.kind === 'wd', wdB = b.type.kind === 'wd';
  if (wdA && wdB) { mergeWhiteDwarfs(a, b); return; }
  if (wdA !== wdB) { // a white dwarf hitting an ordinary star sinks into it and becomes part of its core
    const wd = wdA ? a : b, st = wdA ? b : a;
    if (st.type.kind === 'ms' || st.type.kind === 'giant') {
      const M = a.m + b.m;
      zmix(st, a, b);
      st.vx = (a.vx * a.m + b.vx * b.m) / M; st.vy = (a.vy * a.m + b.vy * b.m) / M;
      st.x = (a.x * a.m + b.x * b.m) / M; st.y = (a.y * a.m + b.y * b.m) / M;
      st.m = M; st.m0 = M; st.mBirth = Math.max(st.mBirth || 0, M); if (st.core) st.core += wd.m;
      bodies = bodies.filter(o => o !== wd);
      toast('White dwarf swallowed', [`The white dwarf sank into the ${st.type.lc} and became part of its core`, `${st.type.name} now ${fmtM(M)} M☉`]);
      return;
    }
  }
  const big = a.m >= b.m ? a : b, small = big === a ? b : a, M = a.m + b.m;
  zmix(big, a, b);
  big.vx = (a.vx * a.m + b.vx * b.m) / M; big.vy = (a.vy * a.m + b.vy * b.m) / M;
  big.x = (a.x * a.m + b.x * b.m) / M; big.y = (a.y * a.m + b.y * b.m) / M;
  big.R = big.R * Math.pow(M / big.m, 0.5); big.R0 = big.R; big.m = M; big.m0 = M;
  big.mBirth = Math.max(big.mBirth || 0, M); if (big.core) big.core = Math.max(big.core, 0.36 * M);
  bodies = bodies.filter(o => o !== small);
  if (followId === small.id) followId = big.id;
  regrade(big);
  if (big.sn && big.sn.mode !== 'ia') big.sn.mode = snMode(big); // still gaining mass while it collapses
  if (M >= 140 && !big.sn && (big.type.kind === 'ms' || big.type.kind === 'giant')) {
    startSupernova(big);
    toast('Too massive to survive', [`Collisions built a ${fmtM(M)} M☉ star, far past the ~150 M☉ that stars can hold together`,
      big.sn.mode === 'pi' ? 'It is heading for a pair-instability supernova' : 'It is heading for direct collapse into a black hole'], 'w');
  } else if (isPlanet(small)) toast(isPlanet(big) ? 'Worlds merge' : 'Planet swallowed', [`${cap(bodyName(small))} fell into ${bodyName(big)}`]);
  else toast('Stellar collision', [`${small.type.name} merged into the ${big.type.name} · now ${fmtM(M)} M☉`]);
}

// White dwarfs are held up by electron pressure, which fails at the Chandrasekhar limit (1.44 Msun).
// Below it a merger leaves one smaller, heavier white dwarf (they shrink as they gain mass);
// above it carbon ignites in a runaway and the whole star explodes as a Type Ia supernova.
const M_CH = 1.44;
function sized(b, Rsim, t) { return b.real ? Rsim / t.R * t.Rsun * RSUN_U : Rsim; }
function wdRadius(m) { return clamp(TYPE.WD.R * Math.pow(m / 0.8, -1 / 3) * Math.sqrt(Math.max(0.05, 1 - Math.pow(m / M_CH, 4 / 3))) / 0.737, 0.6, 2.6); }
function mergeWhiteDwarfs(a, b) {
  const big = a.m >= b.m ? a : b, small = big === a ? b : a, M = a.m + b.m;
  zmix(big, a, b);
  big.vx = (a.vx * a.m + b.vx * b.m) / M; big.vy = (a.vy * a.m + b.vy * b.m) / M;
  big.x = (a.x * a.m + b.x * b.m) / M; big.y = (a.y * a.m + b.y * b.m) / M;
  big.m = M; big.m0 = M; big.mBirth = M;
  if (big.type.id === 'HeWD' && M > 0.5 && !(a.type.id === 'HeWD' && b.type.id === 'HeWD')) big.type = TYPE.WD;
  big.R = big.R0 = sized(big, wdRadius(Math.min(M, M_CH * 0.99)), TYPE.WD);
  bodies = bodies.filter(o => o !== small);
  if (followId === small.id) followId = big.id;
  const heA = a.type.id === 'HeWD', heB = b.type.id === 'HeWD';
  if (M < M_CH && heA && heB && M >= 0.4) { // helium ignites: a new, helium-burning star
    retype(big, TYPE.sdB); big.mBirth = M;
    toast('A new star', [`Two helium white dwarfs merged into ${fmtM(M)} M☉ and the helium ignited`, 'It is a hot subdwarf now, burning helium in its core for about 100 million years'], 'w');
    return;
  }
  if (M < M_CH && heA !== heB) { // helium burning on the surface puffs it up into a hydrogen-poor giant
    retype(big, TYPE.RCB); big.mBirth = M; big.core = 0.9 * M; big.R = big.R0 = TYPE.RCB.R;
    toast('A new star', [`A helium and a carbon–oxygen white dwarf merged into ${fmtM(M)} M☉; helium burning around the core puffed it into a giant`, 'This is how R Coronae Borealis stars are thought to form: hydrogen-poor giants that dim without warning behind clouds of their own soot'], 'w');
    return;
  }
  if (M >= M_CH) {
    if (big.sn) return; // already exploding; the extra mass just goes with it
    big.sn = { t0: wallNow, mode: 'ia', via: 'merge' };
    toast('Over the Chandrasekhar limit', [`Two white dwarfs merged into ${fmtM(M)} M☉, past the 1.44 M☉ that a white dwarf can hold up`, 'Carbon is about to ignite']);
  } else toast('White dwarfs merged', [`Now ${fmtM(M)} M☉, and smaller than before: white dwarfs shrink as they gain mass`, `${fmtM(M_CH - M)} M☉ short of the Chandrasekhar limit`]);
}
function updateRadius(s) {
  const x = s.m / s.m0;
  if (s.type.kind === 'ms') s.R = s.R0 * Math.pow(x, 0.8);
  else if (s.type.kind === 'giant') { // a giant's size is set by its core, so it stays big while the envelope drains
    const env = s.m0 > s.core ? clamp((s.m - s.core) / (s.m0 - s.core), 0, 1) : 1;
    s.R = s.R0 * (0.9 + 0.1 * env);
  }
  else if (s.type.kind === 'bd') s.R = s.R0;
  else s.R = s.R0 * Math.min(1.8, Math.pow(x, -1 / 3));
  s.R = Math.max(s.R, 0.5);
}

/* A star doesn't wait until its Roche lobe is full to lose gas. Its loose outer layers and its wind already feel the
   companion: from about half-full some of that gas slips through the inner Lagrange point (wind Roche-lobe overflow,
   and Tout & Eggleton's tidally enhanced wind). Here that is a thin trickle growing as (fullness)², a few percent of
   the stream a full lobe pours. White dwarfs and planets hold on to what they have until they overflow. */
const WIND_F = 0.5, WIND_RATE = 0.004;
const windyKind = k => k === 'ms' || k === 'giant' || k === 'bd';
// where a star of type t dropped next to a compact object of mass hostM starts to leak, pours a stream, and is torn apart
function feedRings(t, hostM) {
  if (!t || t.kind === 'ns' || t.kind === 'planet' || !(hostM > 0)) return null;
  const fill = (realSizes ? t.Rsun * RSUN_U : t.R) / rocheFrac(t.m / hostM);
  return { leak: windyKind(t.kind) ? fill / WIND_F : null, stream: fill, tear: fill / 1.6 };
}
function stellarProcesses(simDt) {
  for (const st of bodies.slice()) {
    if (st.kind !== 'star' || isNS(st)) continue;
    const host = dominantAccretor(st.x, st.y, st, st.z); // never itself: a white dwarf can be a donor and an accretor
    if (!host) { st.f = 0; continue; }
    const r = sepOf(st, host);
    st.hx = host.x; st.hy = host.y; st.hz = host.z;
    const rL = rocheFrac(st.m / host.m) * r;
    const f = st.R / rL; st.f = f;
    // track how far in and out the orbit swings (slowly forgetting), to tell a stretched orbit from a round one
    st.rMax = Math.max(r, (st.rMax || r) * (1 - simDt * 0.02)); st.rMin = Math.min(r, (st.rMin || r) * (1 + simDt * 0.02));
    // white dwarf mass transfer onto a neutron star is unstable above ~0.2 Msun: it gets torn apart
    if (isWD(st) && isNS(host) && f > 1) { shred(st, host, r, 'ns'); continue; }
    if (f > 1.6 || (st.type.kind === 'wd' && st.m < 0.12 * st.m0)) { shred(st, host, r, isNS(host) ? 'ns' : 'tde'); continue; }
    // track each overflow episode so close passes on a stretched orbit report what they took
    if (!st.ep) st.fMin = Math.min(st.fMin == null ? f : st.fMin, f);
    if (f > 1 && !st.ep) { st.ep = { m: st.m, t: simTime, detached: st.fMin < 0.85 }; st.fMin = null; }
    else if (f < 0.97 && st.ep) {
      const lost = st.ep.m - st.m; st.ep0detached = st.ep.detached; st.ep = null;
      // only a stretched orbit makes discrete passes; a near-circular one just flickers in and out of overflow
      const rvx = st.vx - host.vx, rvy = st.vy - host.vy, GM = G * (host.m + st.m);
      const En = 0.5 * (rvx * rvx + rvy * rvy) - GM / r, hz = (st.x - host.x) * rvy - (st.y - host.y) * rvx;
      const ecc = (st.rMax - st.rMin) / Math.max(st.rMax + st.rMin, 1e-9);
      if (lost > 0.0005 && ecc > 0.2 && st.ep0detached) { st.passes++; toast(`Partial disruption · pass ${st.passes}`, [`The ${st.type.lc} lost ${lost.toFixed(3)} M☉ at its closest approach and survived`, `${fmtM(st.m)} M☉ left · the hole flares as that gas falls in`]); }
    }
    // a donor much heavier than its accretor can't transfer stably: the orbit shrinks, overflow grows, and it runs away
    if (f > 1.02 && st.m > 1.5 * host.m && (st.type.kind === 'ms' || st.type.kind === 'giant') && !st.sn) { commonEnvelope(st, host, r); continue; }
    const wx = windyKind(st.type.kind) && !st.sn ? clamp((f - WIND_F) / (1 - WIND_F), 0, 1) : 0;
    if ((f > 1 || wx > 0) && simDt > 0) {
      const rate = Math.max(WIND_RATE * st.m * wx * wx, Math.min(Math.max(0.04, 0.03 * st.m), 0.12 * st.m * (f - 1)));
      // fewer, heavier particles as the disk fills up: same mass flow, bounded particle count
      const target = 160 * clamp(1 - gN / gasCap, 0.04, 1);
      const pm = Math.max(0.00004, rate / target);
      st.emitAcc += rate * simDt / pm;
      while (st.emitAcc >= 1 && st.m > pm * 2) { if (!emitL1(st, host, rL, pm)) { st.emitAcc = 0; break; } st.m -= pm; st.emitAcc -= 1; }
      updateRadius(st);
      if (st.type.kind === 'giant' && st.m <= st.core * 1.01) { exposeCore(st); continue; }
      if (st.type.kind === 'ms' && st.m < 0.075 && st.type.id !== 'BD') { becomeBrownDwarf(st); continue; }
      if (f <= 1) { if (!st.windNoted && !st.noted) { st.windNoted = true; toast('A thin wind', [`The ${fmtM(host.m)} M☉ ${isNS(host) ? 'neutron star' : isWD(host) ? 'white dwarf' : 'hole'} is drawing gas off the ${st.type.lc}'s outer layers`, 'Closer in, where the star fills its Roche lobe, the trickle becomes a steady stream']); } }
      else if (!st.noted) { st.noted = true; toast('Mass transfer', [`${st.type.name} is overflowing its Roche lobe onto the ${fmtM(host.m)} M☉ ${isNS(host) ? 'neutron star' : isWD(host) ? 'white dwarf' : 'hole'}`]); }
    }
  }
}
/* Common envelope. The accretor ends up inside the donor's envelope and spirals in, its lost orbital energy
   unbinding the envelope (Webbink's energy formalism, alpha = 1, lambda = 0.5). If the donor has a dense core and
   the orbit stays wider than the core, the envelope is thrown off and the core is left in a much tighter orbit;
   otherwise the two merge. Real post-envelope binaries are millions of km wide; binaries here are compressed,
   so the new orbit is drawn with a floor that keeps the pair from touching. */
function commonEnvelope(st, host, r) {
  const md = st.m, ma = host.m, core = st.core || 0, menv = md - core, hostName = host.kind === 'bh' ? 'black hole' : isNS(host) ? 'neutron star' : 'white dwarf';
  const from = st.type.lc;
  const ratio = core > 0 ? core * ma / (md * (ma + 2 * menv * (r / Math.max(st.R, 1)) / 0.5)) : 0;
  const M = md + ma, cx = (st.x * md + host.x * ma) / M, cy = (st.y * md + host.y * ma) / M;
  const cvx = (st.vx * md + host.vx * ma) / M, cvy = (st.vy * md + host.vy * ma) / M;
  const cz = (st.z * md + host.z * ma) / M, cvz = (st.vz * md + host.vz * ma) / M;
  const shell = (mass, x0, y0, R0) => { // the envelope leaves slowly, a few hundred km/s once it's clear
    if (host.kind === 'bh' && bodies.includes(host)) R0 = Math.max(R0, 8 * rsOf(host.m));
    const vHost = bodies.includes(host) ? Math.hypot(host.vx - cvx, host.vy - cvy) : 0;
    const N = Math.min(900, MAXG - gN);
    for (let k = 0; k < N; k++) {
      const a = rand() * Math.PI * 2, rr = R0 * (0.7 + 0.5 * rand()), x = x0 + Math.cos(a) * rr, y = y0 + Math.sin(a) * rr;
      const vInf = (0.002 + 0.006 * rand()) * C, ve = escapeSpeed(x, y, st), sp = Math.min(Math.sqrt(vInf * vInf + ve * ve) + vHost, 0.85 * C);
      if (addGas(x, y, cvx + Math.cos(a) * sp, cvy + Math.sin(a) * sp, mass / Math.max(N, 1))) gf[gN - 1] = 3;
    }
  };
  flashes.push({ x: cx, y: cy, t0: wallNow, dur: 7000, kind: 'sn', R: st.R, power: 0.45, st: simTime });
  sfx('sn', cx, cy, 0.45);
  if (ratio < 0.01) { // no core to stop the spiral, or too little orbital energy: they merge
    if (host.kind === 'bh') {
      const eaten = 0.5 * md; host.m += eaten; host.fedTotal = (host.fedTotal || 0) + eaten; totalFed += eaten;
      host.x = cx; host.y = cy; host.vx = cvx; host.vy = cvy; host.z = cz; host.vz = cvz;
      bodies = bodies.filter(o => o !== st); if (followId === st.id) followId = host.id;
      shell(md - eaten, cx, cy, st.R);
      toast('Swallowed from the inside', [`The ${fmtM(ma)} M☉ black hole was engulfed by the ${fmtM(md)} M☉ ${from} it was feeding on, and sank to its center`,
        `It ate ${fmtM(eaten)} M☉ from the inside; the rest of the star was blown away`], 'w');
    } else if (isNS(host)) {
      st.m = M; st.m0 = M; st.x = cx; st.y = cy; st.vx = cvx; st.vy = cvy; st.z = cz; st.vz = cvz;
      bodies = bodies.filter(o => o !== host); if (followId === host.id) followId = st.id;
      toast('Thorne–Żytkow object', [`The neutron star was engulfed by the ${from} it was feeding on and sank to its center`, 'A star with a neutron star where its core should be (Thorne & Żytkow, 1977)'], 'w');
    } else {
      st.m = M; st.m0 = M; st.x = cx; st.y = cy; st.vx = cvx; st.vy = cvy; st.z = cz; st.vz = cvz; if (st.core) st.core += ma;
      bodies = bodies.filter(o => o !== host); if (followId === host.id) followId = st.id;
      toast('Merged', [`The white dwarf was engulfed by the ${from} it was feeding on and sank into its core`]);
    }
    return;
  }
  // envelope ejected: the bare core is left in a tight orbit
  const t = core < 0.5 ? TYPE.HeWD : core < 2.5 ? TYPE.sdB : TYPE.WR;
  const oldR = st.R;
  retype(st, t); st.m = core; st.m0 = core; st.mBirth = Math.max(st.mBirth, core);
  if (t === TYPE.WR) st.R = st.R0 = sized(st, 2.4, TYPE.WR); // a stripped core is compact
  const touch = host.kind === 'bh' ? 1.5 * host.kP * rsOf(host.m) : host.R;
  const aTrue = ratio * r, aDraw = Math.max(aTrue, 3.5 * (st.R + touch));
  const Mn = core + ma, ang = Math.atan2(st.y - host.y, st.x - host.x);
  host.x = cx; host.y = cy; host.vx = cvx; host.vy = cvy; host.z = st.z = cz; host.vz = st.vz = cvz;
  orbitAround(host, st, aDraw, ang);
  const sx = (st.x - host.x) * core / Mn, sy = (st.y - host.y) * core / Mn; // put the pair's center of mass back where it was
  host.x -= sx; host.y -= sy; st.x -= sx; st.y -= sy;
  shell(menv, cx, cy, oldR);
  toast('Common envelope', [`The ${hostName} was engulfed by the ${fmtM(md)} M☉ ${from} and spiralled in, throwing off ${fmtM(menv)} M☉ of envelope`,
    `Left behind: its ${fmtM(core)} M☉ core, now a ${t.lc}, in an orbit about ${Math.round(1 / ratio)}× tighter`,
    host.kind === 'bh' ? 'Pairs like this (Cygnus X-3) may later become black-hole binaries that merge' : isNS(host) ? 'This is how double neutron stars are thought to start' : 'This is how double white dwarfs are thought to form'], 'w');
}
/* Core-collapse supernova. The sequence is stylized in time (about 5 s on screen):
   the iron core falls in, bounces at nuclear density, the shock stalls, neutrinos revive it,
   it reaches the surface and the envelope is blown off. What's left is a neutron star, or a black hole
   for the heaviest stars. Only stars above ~8 Msun can do this. */
const SN_DUR = 5200, SN_BREAK = 0.8;
function snP(b) { return (wallNow - b.sn.t0) / (b.sn.mode === 'ia' ? 1800 : SN_DUR); }
function canSupernova(b) {
  if (b.kind !== 'star' || b.sn) return false;
  if (b.type.id === 'WR') return true;
  return (b.type.kind === 'ms' || b.type.kind === 'giant') && b.m >= 8;
}
function snBlocker(b) {
  if (b.kind !== 'star') return '';
  if (b.type.kind === 'wd') return `A white dwarf can only explode by passing 1.44 M☉ (this one is ${fmtM(b.m)} M☉). Crash another white dwarf into it to see a Type Ia supernova.`;
  if (b.type.kind === 'bd') return 'A brown dwarf never fused hydrogen, so it never builds an iron core.';
  if (isNS(b)) return '';
  return `Too light to collapse: it needs at least 8 M☉ and this one is ${fmtM(b.m)} M☉. A star this size sheds its outer layers gently and ends as a white dwarf. Try the O star or the blue supergiant.`;
}
// How a star ends depends on its mass: core collapse (8–140 Msun), pair-instability (140–260 Msun:
// the star blows itself apart and leaves nothing), or direct collapse to a black hole (above ~260 Msun).
function snMode(b) { return b.m >= 260 ? 'dc' : b.m >= 140 ? 'pi' : 'cc'; }
function startSupernova(b) { if (canSupernova(b)) b.sn = { t0: wallNow, mode: snMode(b) }; }
// speed needed to climb out of everything's gravity from (x, y), with `extra` added as a point mass at (ex, ey)
function escapeSpeed(x, y, skip, extra, ex, ey, extraHole) {
  let phi = 0;
  for (const o of bodies) {
    if (o === skip) continue;
    const r = Math.hypot(o.x - x, o.y - y) || 1e-6;
    phi += G * o.m / (o.kind === 'bh' ? Math.max(r - rsOf(o.m), 0.3 * rsOf(o.m)) : Math.max(r, o.R || 1));
  }
  if (extra) { const d = Math.hypot(ex - x, ey - y), rs = rsOf(extra); phi += G * extra / (extraHole ? Math.max(d - rs, 0.3 * rs) : Math.max(d, 1)); }
  return Math.sqrt(2 * phi);
}
function explode(st) {
  const name = st.type.lc, mode = st.sn ? st.sn.mode : 'cc';
  sfx('sn', st.x, st.y, mode === 'pi' ? 1.4 : mode === 'ia' ? 1.1 : mode === 'dc' ? 0.3 : 1);
  if (mode !== 'dc') reached(mode === 'ia' ? 'typeia' : 'supernova');
  const toBH = mode === 'dc' || (mode === 'cc' && (st.type.id === 'WR' ? st.m >= 15 : st.mBirth >= 20));
  const mRem = mode === 'pi' || mode === 'ia' ? 0 : mode === 'dc' ? 0.9 * st.m : toBH ? clamp(0.3 * st.m, 5, 15) : 1.25 + 0.2 * rand();
  const ej = Math.max(0, st.m - mRem);
  // ejecta. Stars here are drawn far smaller than real ones, so gravity at their surface is far too strong;
  // launch fast enough to escape and still coast away at a realistic speed (about 5,000-20,000 km/s).
  const N = Math.min(mode === 'pi' ? 1600 : mode === 'dc' ? 300 : mode === 'ia' ? 900 : 1300, MAXG - gN);
  // In a real binary the ejecta move ~50x faster than the orbit. Binaries here are compressed to ~1,000 km, so
  // orbits run near 0.2c; keep the ejecta several times faster than the orbit or the partner sweeps most of it up.
  const pt = partnerOf(st), vOrb = pt ? Math.sqrt(G * (st.m + pt.m) / Math.max(sepOf(st, pt), 1)) : 0;
  let vmean = 0;
  for (let k = 0; k < N; k++) {
    const a = rand() * Math.PI * 2, rr = Math.max(st.R * (0.5 + 0.5 * Math.sqrt(rand())), toBH ? 4 * rsOf(mRem) : 0);
    const x = st.x + Math.cos(a) * rr, y = st.y + Math.sin(a) * rr;
    const vReal = (mode === 'dc' ? 0.005 + 0.01 * rand() : 0.017 + 0.05 * rand()) * C;
    const vInf = Math.min(Math.max(vReal, (mode === 'dc' ? 1.2 : 2.5 + 1.5 * rand()) * vOrb), 0.7 * C);
    const ve = escapeSpeed(x, y, st, mRem, st.x, st.y, toBH), sp = Math.min(Math.sqrt(vInf * vInf + ve * ve), 0.85 * C);
    if (addGas(x, y, st.vx + Math.cos(a) * sp, st.vy + Math.sin(a) * sp, ej / Math.max(N, 1))) gf[gN - 1] = 3;
    vmean += vReal;
  }
  vmean = N ? vmean / N : 0;
  if (mode === 'ia') { // nothing survives
    bodies = bodies.filter(o => o !== st);
    if (followId === st.id) followId = null;
    flashes.push({ x: st.x, y: st.y, t0: wallNow, dur: 12000, kind: 'sn', R: Math.max(st.R, 6), power: 1.1, st: simTime }); shake = wallNow;
    toast('Type Ia supernova', [
      `The ${fmtM(st.m)} M☉ white dwarf exploded completely. Nothing is left behind`,
      'Carbon and oxygen burned to nickel in about a second; the glow that follows is that nickel decaying to iron',
      'These all peak at nearly the same brightness, which is how they revealed that the universe is speeding up',
    ], 'w', { id: 'typeia', m: st.m, via: st.sn.via || 'edit' });
    return;
  }
  if (mode === 'pi') { // nothing survives
    bodies = bodies.filter(o => o !== st);
    if (followId === st.id) followId = null;
    flashes.push({ x: st.x, y: st.y, t0: wallNow, dur: 14000, kind: 'sn', R: st.R, power: 1.4, st: simTime }); shake = wallNow;
    toast('Pair-instability supernova', [
      `The ${fmtM(st.m)} M☉ star blew itself completely apart. No neutron star, no black hole: nothing is left`,
      `Its core got so hot that light turned into electron–positron pairs, the core lost pressure and collapsed, and the oxygen in it ignited all at once`,
      `${fmtM(ej)} M☉ thrown out at about ${Math.round(vmean / C * 299792.458).toLocaleString('en-US')} km/s`,
    ], 'w');
    return;
  }
  // natal kick: neutron stars are born moving at a few hundred km/s
  const kick = (toBH ? 50 : 300 + 200 * rand()) / 299792.458 * C, ka = rand() * Math.PI * 2;
  const vx = st.vx + Math.cos(ka) * kick, vy = st.vy + Math.sin(ka) * kick;
  const rem = toBH ? makeBH(st.x, st.y, vx, vy, mRem, (rand() < 0.5 ? -1 : 1) * 0.2) : makeStar('NS', st.x, st.y, vx, vy, mRem);
  if (!toBH) rem.spinHz = 20 + 30 * rand();
  rem.z = st.z; rem.vz = st.vz;
  bodies = bodies.filter(o => o !== st); bodies.push(rem);
  if (followId === st.id) { followId = rem.id; followPos = [rem.x, rem.y, rem.z]; }
  if (mode === 'dc') {
    flashes.push({ x: st.x, y: st.y, t0: wallNow, dur: 6000, kind: 'sn', R: st.R, power: 0.25, st: simTime });
    toast('Direct collapse', [
      `The ${fmtM(st.m)} M☉ star fell straight into a ${fmtM(mRem)} M☉ black hole without exploding`,
      `Too massive for the shock to win, so there is only a faint outburst as it vanishes. Astronomers have watched a star do roughly this (N6946-BH1)`,
      `A hole this size is an intermediate-mass black hole, a missing link between stellar and supermassive holes`,
    ], 'w');
    return;
  }
  flashes.push({ x: st.x, y: st.y, t0: wallNow, dur: 11000, kind: 'sn', R: st.R, power: 1, st: simTime }); shake = wallNow;
  const lines = [
    `The ${name}'s core collapsed into a ${toBH ? fmtM(mRem) + ' M☉ black hole' : fmtM(mRem) + ' M☉ neutron star'}`,
    snClass(st),
    `${fmtM(ej)} M☉ of outer layers blown off at about ${Math.round(vmean / C * 299792.458).toLocaleString('en-US')} km/s`,
  ];
  const o = partnerOf(rem);
  if (o) {
    const r = sepOf(rem, o), E = 0.5 * ((o.vx - rem.vx) ** 2 + (o.vy - rem.vy) ** 2 + (o.vz - rem.vz) ** 2) - G * (o.m + rem.m) / r;
    lines.push(E > 0 ? `It lost so much mass that its partner, the ${o.kind === 'bh' ? 'black hole' : o.type.lc}, is no longer bound to it` : `Its partner, the ${o.kind === 'bh' ? 'black hole' : o.type.lc}, is still bound to it`);
  } else lines.push(toBH ? 'Most of the core fell back, so it collapsed past the neutron-star limit' : `Born with a kick of ${Math.round(kick / C * 299792.458)} km/s`);
  toast('Supernova', lines, 'w', { id: 'supernova', rem: toBH ? 'bh' : 'ns', m: st.m, mBirth: st.mBirth, mRem });
}
// the observed class of a core-collapse supernova follows from what the star still had on the outside
function snClass(st) {
  const id = st.type.id;
  if (id === 'WR') return 'Type Ib/c: the star had already lost its hydrogen, so none shows in its light';
  if (id === 'RSG') return 'Type II-P, the most common kind: a long plateau of light from the huge hydrogen envelope';
  if (id === 'BSG') return 'Type II from a compact blue star, like SN 1987A';
  if (id === 'LBV') return 'Type IIn: the blast slams into gas the star threw off in earlier eruptions';
  if (id === 'YSG') return 'Type IIb: only a thin layer of hydrogen was left';
  return 'Type II: hydrogen lines in its light';
}
