/* ================= helpers ================= */
function rocheFrac(q) { const q13 = Math.cbrt(q), q23 = q13 * q13; return 0.49 * q23 / (0.6 * q23 + Math.log(1 + q13)); }
function fmtM(m) { return m >= 1e5 ? `${(m / 1e6).toFixed(2)} million` : m >= 10 ? m.toFixed(1) : m.toFixed(2); }
function fmtDist(km) { return km >= 9.46e11 ? `${(km / 9.461e12).toFixed(km < 9.46e13 ? 2 : 1)} light-years` : km >= 1.5e7 ? `${(km / 1.496e8).toFixed(km < 1.5e9 ? 2 : km < 1.5e10 ? 1 : 0)} AU` : `${fmtKm(km)} km`; }
function fmtKm(km) { return km >= 1000 ? Math.round(km).toLocaleString('en-US') : Math.round(km).toString(); }
function fmtHz(f) { return f >= 1000 ? (f / 1000).toFixed(1) + ' kHz' : (f < 10 ? f.toFixed(1) : Math.round(f)) + ' Hz'; }
function fmtChi(c) { return (c >= 0 ? '+' : '−') + Math.abs(c).toFixed(2); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function dominantBH(x, y, exclude, z = 0) {
  let best = null, bestA = 0;
  for (const b of bodies) {
    if (b.kind !== 'bh' || b === exclude) continue;
    const dx = b.x - x, dy = b.y - y, dz = b.z - z, rs = rsOf(b.m);
    const a = b.m / (dx * dx + dy * dy + dz * dz + rs * rs);
    if (a > bestA) { bestA = a; best = b; }
  }
  return best;
}
function dominantAccretor(x, y, exclude, z = 0) {
  let best = null, bestA = 0;
  for (const b of bodies) {
    if (!isAccretor(b) || b === exclude) continue;
    const dx = b.x - x, dy = b.y - y, dz = b.z - z, e = b.kind === 'bh' ? rsOf(b.m) : b.R;
    const a = b.m / (dx * dx + dy * dy + dz * dz + e * e);
    if (a > bestA) { bestA = a; best = b; }
  }
  return best;
}
function dominantAny(x, y, z = 0) {
  let best = null, bestA = 0;
  for (const b of bodies) {
    const dx = b.x - x, dy = b.y - y, dz = b.z - z;
    const a = b.m / (dx * dx + dy * dy + dz * dz + 1);
    if (a > bestA) { bestA = a; best = b; }
  }
  return best;
}
// Pseudo-Newtonian radius for a body orbiting a hole: ISCO = 3 * rp, prograde or retrograde depending on its orbit sense.
function rpFor(bh, px, py, rvx, rvy) {
  const Lz = px * rvy - py * rvx;            // Lz < 0 is counter-clockwise on screen
  const pro = bh.chi === 0 || ((Lz < 0) === (bh.chi > 0));
  return (pro ? bh.kP : bh.kR) * rsOf(bh.m);
}
function setCircular(host, body) {
  const dx = body.x - host.x, dy = body.y - host.y, rh = Math.hypot(dx, dy) || 1, r = zOn ? Math.hypot(dx, dy, body.z - host.z) || 1 : rh;
  const M = host.m + body.m;
  // relative acceleration exactly as computeAccel applies it, so the orbit really is circular
  let arel;
  if ((host.kind === 'bh') !== (body.kind === 'bh')) {
    const bh = host.kind === 'bh' ? host : body, st = bh === host ? body : host;
    const rp = (bh.chi >= 0 ? bh.kP : bh.kR) * rsOf(bh.m), d = Math.max(r - rp, 0.25 * rp);
    arel = G * bh.m / (d * d) + G * st.m / (r * r + st.R * st.R * 0.25);
  } else if (host.kind === 'bh') arel = G * M / (r * r + 0.25);
  else { const e = ((host.R || 0) + (body.R || 0)) * 0.5; arel = G * M / (r * r + e * e); }
  const v = Math.sqrt(arel * r);
  const tx = dy / rh, ty = -dx / rh; // counter-clockwise on screen (level with the plane, so square to the line between them in 3D too)
  const hvx = host.vx, hvy = host.vy;
  body.vx = hvx + tx * v * host.m / M; body.vy = hvy + ty * v * host.m / M;
  host.vx = hvx - tx * v * body.m / M; host.vy = hvy - ty * v * body.m / M;
  if (zOn) body.vz = host.vz;
}
function orbitAround(host, body, r, ang) {
  body.x = host.x + r * Math.cos(ang); body.y = host.y + r * Math.sin(ang);
  setCircular(host, body);
}
function addPair(b1, b2, a, ang = 0) {
  const M = b1.m + b2.m, v = Math.sqrt(G * M / a);
  const ux = Math.cos(ang), uy = Math.sin(ang), tx = uy, ty = -ux;
  b1.x = -ux * a * b2.m / M; b1.y = -uy * a * b2.m / M; b1.vx = -tx * v * b2.m / M; b1.vy = -ty * v * b2.m / M;
  b2.x = ux * a * b1.m / M; b2.y = uy * a * b1.m / M; b2.vx = tx * v * b1.m / M; b2.vy = ty * v * b1.m / M;
  bodies.push(b1, b2);
}

