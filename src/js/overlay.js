/* ================= overlay ================= */
let hover = null, drag = null;
function jetPower(b) {
  const feed = clamp(b.feedRate * 160, 0, 1) * (0.1 + 0.9 * b.chi * b.chi);
  const grb = Math.max(0, 1 - (wallNow - b.grbT) / 2600);
  return Math.max(feed, grb);
}
// Jets: a fast spine (0.92c, strongly beamed) inside a slower sheath (0.3c) that glows in every direction,
// so jets stay visible side-on while the one aimed at you is brighter. Knots ride along at the jet's apparent speed.
const JET_B = 0.92, JET_G = 1 / Math.sqrt(1 - JET_B * JET_B), SH_B = 0.3, SH_G = 1 / Math.sqrt(1 - SH_B * SH_B);
const doppler = (b, g, cs) => 1 / (g * (1 - b * cs));
// apparent speed (in units of c) of knots on the jet aimed toward the viewer at the current tilt
function apparentJetSpeed() { return JET_B * sinI / (1 - JET_B * cosI); }
function drawJets(c) {
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (const b of bodies) {
    if (b.kind !== 'bh') continue;
    const J = jetPower(b); if (J < 0.03) continue;
    const X = toSX(b.x, b.y), Y = toSY(b.x, b.y, b.z), rsPx = rsOf(b.m) * zoom;
    const Lfull = Math.min(Math.max(70 + 260 * J, (40 + 110 * J) * rsPx), 1.2 * Math.max(vw, vh));
    const L = Lfull * sinI, w0 = Math.max(1.5, rsPx * 0.45);
    for (const [dir, cs] of [[-1, cosI], [1, -cosI]]) { // the jet aimed toward you points up the screen
      const spine = Math.min(1, J * doppler(JET_B, JET_G, cs) ** 3 / 6);
      const sheath = Math.min(0.85, J * 0.9 * doppler(SH_B, SH_G, cs) ** 3);
      const br = Math.min(1, sheath + spine);
      if (br < 0.02 || L < 4) continue;
      const y2 = Y + dir * L, w1 = w0 + L * 0.1;
      // sheath: a widening cone of glow
      let g = c.createLinearGradient(X, Y, X, y2);
      g.addColorStop(0, `rgba(160,190,255,${0.55 * br})`); g.addColorStop(0.55, `rgba(135,165,255,${0.25 * br})`); g.addColorStop(1, 'rgba(120,150,255,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(X - w0, Y); c.lineTo(X - w1, y2); c.lineTo(X + w1, y2); c.lineTo(X + w0, Y); c.closePath(); c.fill();
      // spine: a bright thin core line
      g = c.createLinearGradient(X, Y, X, y2);
      g.addColorStop(0, `rgba(235,242,255,${Math.min(1, 0.4 * br + spine)})`); g.addColorStop(0.7, `rgba(190,210,255,${0.3 * br + 0.4 * spine})`); g.addColorStop(1, 'rgba(170,195,255,0)');
      c.strokeStyle = g; c.lineWidth = Math.max(1.2, w0 * 0.7); c.beginPath(); c.moveTo(X, Y); c.lineTo(X, y2); c.stroke();
      // knots moving out at the apparent speed for this side (faster than light on the near side at some angles)
      const bapp = JET_B * sinI / (1 - JET_B * cs), pxs = bapp * C * zoom;
      const spacing = Math.max(22, L / 5), off = ((simTime * pxs) % spacing + spacing) % spacing;
      for (let d = off; d < L; d += spacing) {
        const fade = 1 - d / L, kr = (w0 + d * 0.1) * 0.75 + 1.5, ky = Y + dir * d;
        const kg = c.createRadialGradient(X, ky, 0, X, ky, kr);
        kg.addColorStop(0, `rgba(240,245,255,${0.75 * br * fade})`); kg.addColorStop(1, 'rgba(170,195,255,0)');
        c.fillStyle = kg; c.fillRect(X - kr, ky - kr, 2 * kr, 2 * kr);
      }
    }
    const coreB = Math.min(1, J * doppler(JET_B, JET_G, cosI) ** 3 / 6) * Math.max(0, cosI - 0.25) * 0.9;
    if (coreB > 0.02) { // jet seen nearly head-on: a beamed core in front of the shadow, like a blazar
      const R = rsPx * (0.8 + 1.2 * J) + 4;
      const g = c.createRadialGradient(X, Y, 0, X, Y, R);
      g.addColorStop(0, `rgba(225,235,255,${coreB})`); g.addColorStop(0.4, `rgba(160,190,255,${coreB * 0.4})`); g.addColorStop(1, 'rgba(140,170,255,0)');
      c.fillStyle = g; c.fillRect(X - R, Y - R, 2 * R, 2 * R);
    }
  }
  c.globalCompositeOperation = 'source-over'; c.lineCap = 'butt';
}
function predictPath(x, y, vx, vy, isBH) {
  const bh = bhList();
  const pts = [[x, y]];
  if (!bh.length) { pts.push([x + vx * 4, y + vy * 4]); return pts; }
  let t = 0, px = x, py = y, lx = x, ly = y;
  const acc = (X, Y) => {
    let ax = 0, ay = 0, dyn = Infinity;
    for (const b of bh) {
      const dx = b.x - X, dy = b.y - Y, r = Math.hypot(dx, dy) || 1e-6, rs = rsOf(b.m);
      if (r < 2.6 * rs * b.kPlus) return null;
      const d = isBH ? r : Math.max(r - rs, 0.3 * rs), a = G * b.m / (d * d);
      ax += a * dx / r; ay += a * dy / r;
      dyn = Math.min(dyn, Math.sqrt(r * r * r / (G * b.m)));
    }
    return [ax, ay, dyn];
  };
  let a = acc(px, py); if (!a) return pts;
  const lim = 3 * Math.max(vw, vh) / zoom;
  for (let k = 0; k < 2000 && t < 10 * warp; k++) {
    const dt = clamp(0.015 * a[2], 0.0002 * warp, 0.04 * warp);
    vx += 0.5 * dt * a[0]; vy += 0.5 * dt * a[1]; px += dt * vx; py += dt * vy;
    a = acc(px, py); if (!a) { pts.push([px, py]); break; }
    vx += 0.5 * dt * a[0]; vy += 0.5 * dt * a[1]; t += dt;
    if (Math.hypot(px - lx, (py - ly) * cosI) * zoom > 3) { pts.push([px, py]); lx = px; ly = py; }
    if (Math.hypot(px - camX, py - camY) > lim / Math.max(cosI, 0.2)) break;
  }
  return pts;
}
// The orbit a selected body is on: its path around the barycenter it shares with its strongest partner, run
// forward one lap with the same pairwise gravity the simulation uses (near-hole term included, so close orbits
// precess, and orbits inside the innermost stable one plunge). Stops early where it would fall in or be torn apart.
function orbitPath(b) {
  const p = partnerOf(b); if (!p) return null;
  const M = b.m + p.m, kb = p.m / M, GM = G * M;
  let x = b.x - p.x, y = b.y - p.y, vx = b.vx - p.vx, vy = b.vy - p.vy, z = b.z - p.z, vz = b.vz - p.vz;
  const bhb = b.kind === 'bh', bhp = p.kind === 'bh';
  let acc, pot, capR;
  if (bhb && bhp) { acc = r => GM / (r * r + 0.25); pot = r => -GM / r; capR = 0.9 * (rsOf(b.m) + rsOf(p.m)); }
  else if (bhb || bhp) {
    const bh = bhb ? b : p, st = bhb ? p : b, rp = rpFor(bh, x, y, vx, vy);
    acc = r => { const d = Math.max(r - rp, 0.25 * rp); return G * bh.m / (d * d) + G * st.m / (r * r + st.R * st.R * 0.25); };
    pot = r => -G * bh.m / Math.max(r - rp, 0.25 * rp) - G * st.m / r; capR = 1.05 * rp;
  } else { const e = (b.R + p.R) * 0.5; acc = r => GM / (r * r + e * e); pot = r => -GM / Math.sqrt(r * r + e * e); capR = 0.6 * (b.R + p.R); }
  // a star around a hole, neutron star or white dwarf is torn apart where it overfills its Roche lobe by enough
  const tidal = b.kind === 'star' && !isNS(b) && isAccretor(p), tf = isWD(b) && isNS(p) ? 1 : 1.6, rf = tidal ? rocheFrac(b.m / p.m) : 0;
  const len = (x, y, z) => zOn ? Math.hypot(x, y, z) : Math.hypot(x, y);
  let r = len(x, y, z) || 1e-6;
  const bound = 0.5 * (vx * vx + vy * vy + vz * vz) + pot(r) < 0;
  const lim = 1.5 * Math.max(vw, vh) / zoom / Math.max(kb, 1e-3) / Math.max(cosI, 0.2);
  const rel = [[x, y, z]], peri = { r, x, y, z }, apo = { r, x, y, z };
  // 3D: angles are measured in the orbit's own plane, from where it starts (U) and a quarter turn on along it (V)
  const U = [x / r, y / r, z / r], nx = y * vz - z * vy, ny = z * vx - x * vz, nz = x * vy - y * vx, nl = Math.hypot(nx, ny, nz) || 1e-30;
  const V = [(ny * U[2] - nz * U[1]) / nl, (nz * U[0] - nx * U[2]) / nl, (nx * U[1] - ny * U[0]) / nl];
  const angOf = (x, y, z) => zOn ? Math.atan2(x * V[0] + y * V[1] + z * V[2], x * U[0] + y * U[1] + z * U[2]) : Math.atan2(y, x);
  let swept = 0, ang = angOf(x, y, z), end = null, lx = x, ly = y, lz = z, closed = false;
  let a = acc(r);
  for (let k = 0; k < 9000; k++) {
    const dt = 0.006 * Math.sqrt(r * r * r / GM);
    vx -= 0.5 * dt * a * x / r; vy -= 0.5 * dt * a * y / r; vz -= 0.5 * dt * a * z / r; x += dt * vx; y += dt * vy; z += dt * vz;
    r = len(x, y, z) || 1e-6; a = acc(r);
    vx -= 0.5 * dt * a * x / r; vy -= 0.5 * dt * a * y / r; vz -= 0.5 * dt * a * z / r;
    if (r < capR) { end = 'plunge'; break; }
    if (tidal && b.R / (r * rf) > tf) { end = 'torn'; break; }
    const na = angOf(x, y, z); let d = na - ang; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    swept += d; ang = na;
    if (r < peri.r) Object.assign(peri, { r, x, y, z });
    if (r > apo.r) Object.assign(apo, { r, x, y, z });
    if ((zOn ? Math.hypot(x - lx, (y - ly) * cosI, (z - lz) * sinI) : Math.hypot(x - lx, (y - ly) * cosI)) * zoom * kb > 2.5) { rel.push([x, y, z]); lx = x; ly = y; lz = z; }
    if (Math.abs(swept) >= 2 * Math.PI) { closed = true; break; }
    if (!bound && r > lim) break;
  }
  rel.push([x, y, z]);
  return { p, kb, rel, peri, apo, end, closed, bound };
}
function drawOrbit(c, b) {
  const o = orbitPath(b); if (!o) return;
  // around a much heavier partner, draw relative to it (it barely moves, and plunges then end on it);
  // otherwise around the shared barycenter, where both members of a binary trace their own rings
  const { p } = o, M = b.m + p.m, rel = p.m >= 4 * b.m, kb = rel ? 1 : o.kb;
  const cx = rel ? p.x : (b.m * b.x + p.m * p.x) / M, cy = rel ? p.y : (b.m * b.y + p.m * p.y) / M, cz = rel ? p.z : (b.m * b.z + p.m * p.z) / M;
  const W = (q) => [cx + kb * q[0], cy + kb * q[1], cz + kb * q[2]];
  const BX = toSX(b.x, b.y), BY = toSY(b.x, b.y, b.z);
  const pts = o.rel.map(q => { const w = W(q); return [toSX(w[0], w[1]), toSY(w[0], w[1], w[2])]; });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [X, Y] of pts) { x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
  if (Math.max(x1 - x0, y1 - y0) < 14) return; // e.g. a heavy hole barely wobbling around its light companion
  const col = b.kind === 'bh' ? '200,190,255' : b.type.col.join(',');
  c.save(); c.lineWidth = 1.3; c.setLineDash([5, 6]); c.lineDashOffset = -wallNow * 0.012; // dashes drift the way it moves
  c.strokeStyle = `rgba(${col},0.6)`; c.beginPath();
  pts.forEach(([X, Y], i) => i ? c.lineTo(X, Y) : c.moveTo(X, Y)); c.stroke(); c.setLineDash([]);
  c.font = `400 10px ${MONO}`; c.textAlign = 'center';
  const PX = toSX(p.x, p.y), PY = toSY(p.x, p.y, p.z), pR = p.kind === 'bh' ? 2.598 * rsOf(p.m) * zoom : Math.max(p.R * zoom, 1.6);
  const mark = (q, txt, colr, force) => {
    const [wx, wy, wz] = W(q), X = toSX(wx, wy), Y = toSY(wx, wy, wz);
    c.fillStyle = colr; c.beginPath(); c.arc(X, Y, 2.6, 0, Math.PI * 2); c.fill();
    // label just outside the orbit, unless it would land on the partner and its own label
    let dx = X - toSX(cx, cy), dy = Y - toSY(cx, cy, cz); const L = Math.hypot(dx, dy);
    if (L < 1) { dx = 0; dy = -1; } else { dx /= L; dy /= L; }
    let lx = X + dx * 9, ly = Y + dy * 13;
    if (Math.hypot(X - BX, Y - BY) < 30) { dx = 0; lx = X; ly = Y + 18; } // the body's own label sits up and to the right
    if (!force && Math.abs(lx - PX) < pR + 50 && ly > PY - pR - 10 && ly < PY + pR + 34) return;
    const tw = c.measureText(txt).width, al = Math.abs(dx) > 0.5 ? (dx > 0 ? 0 : 1) : 0.5; // keep it on screen
    const tx = clamp(lx - al * tw, 6, vw - tw - 6), moved = Math.abs(tx - (lx - al * tw)) > 1; // pushed over: drop below the dot
    c.textAlign = 'left'; c.fillText(txt, tx, ly + 3.5 + (moved ? 14 : 0));
  };
  if (o.end === 'plunge') mark(o.rel[o.rel.length - 1], p.kind === 'bh' || b.kind === 'bh' ? 'falls in' : 'collides', 'rgba(255,154,114,0.95)', true);
  else if (o.end === 'torn') mark(o.rel[o.rel.length - 1], 'torn apart here', 'rgba(255,154,114,0.95)', true);
  if (o.closed && o.apo.r > 1.12 * o.peri.r) {
    mark([o.peri.x, o.peri.y, o.peri.z], `closest ${fmtDist(o.peri.r * KM_PER_UNIT)}`, 'rgba(236,230,218,0.8)');
    mark([o.apo.x, o.apo.y, o.apo.z], `farthest ${fmtDist(o.apo.r * KM_PER_UNIT)}`, 'rgba(236,230,218,0.8)');
  } else if (!o.bound && !o.end) {
    const k = pts.findIndex(([X, Y]) => X < 30 || Y < 30 || X > vw - 30 || Y > vh - 30), q = pts[k > 4 ? k : pts.length - 1];
    c.fillStyle = 'rgba(236,230,218,0.8)'; c.textAlign = 'center'; c.fillText('escapes', q[0], q[1] - 8);
  }
  c.restore();
}
function placementVelocity(wx, wy, dxs, dys) {
  const dist = Math.hypot(dxs, dys);
  const host = dominantBH(wx, wy) || dominantAny(wx, wy);
  if (dist < 12) return { circular: true, host };
  const k = warp > 1 ? 1 / (2 * warp) : 2.2 * Math.sqrt(zoom), o = scrOff(dxs, dys);
  return { circular:false, host, vx: (host ? host.vx : 0) + o[0] * k, vy: (host ? host.vy : 0) + o[1] * k };
}
function ghost(c, sx, sy) {
  const [wx, wy] = toW(sx, sy), isBH = tool === 'bh';
  const host = dominantBH(wx, wy) || (isBH ? null : dominantAny(wx, wy));
  if (host) {
    const r = Math.hypot(wx - host.x, wy - host.y) * zoom;
    c.setLineDash([3, 5]); c.strokeStyle = 'rgba(255,179,106,0.38)'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(toSX(host.x, host.y), toSY(host.x, host.y, host.z), r, r * cosI, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  }
  if (isBH) {
    const R = Math.max(2.598 * rsOf(bhMass) * zoom, 3);
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.strokeStyle = 'rgba(255,179,106,0.75)'; c.lineWidth = 1.2;
    c.beginPath(); c.arc(sx, sy, R, 0, Math.PI * 2); c.fill(); c.stroke();
    if (Math.abs(bhSpin) > 0.02) { // spin arrow
      const sg = bhSpin > 0 ? 1 : -1, a0 = -Math.PI * 0.85, a1 = -Math.PI * 0.15, R2 = R + 6;
      c.beginPath(); c.arc(sx, sy, R2, a0, a1); c.stroke();
      const ae = sg > 0 ? a0 : a1, ex = sx + R2 * Math.cos(ae), ey = sy + R2 * Math.sin(ae), tdir = sg > 0 ? -1 : 1;
      const tx = -Math.sin(ae) * tdir, ty = Math.cos(ae) * tdir;
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - tx * 6 - ty * 4, ey - ty * 6 + tx * 4); c.moveTo(ex, ey); c.lineTo(ex - tx * 6 + ty * 4, ey - ty * 6 - tx * 4); c.stroke();
    }
  } else if (tool === 'matter') {
    c.setLineDash([2, 4]); c.strokeStyle = 'rgba(236,230,218,0.5)'; c.lineWidth = 1; c.beginPath(); c.arc(sx, sy, 26, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  } else if (TYPE[tool]) {
    if (TYPE[tool].kind === 'planet' && host && !isAccretor(host) && host.m > 3 * TYPE[tool].m) { // where tides would pull this world apart
      const tm = TYPE[tool].m, dR = (tm < 1e-10 ? 1.5 : 2.0) * planetRsun(tm) * sizeScale(host) * Math.cbrt(host.m / tm) * zoom;
      if (dR > 8) {
        const HX = toSX(host.x, host.y), HY = toSY(host.x, host.y, host.z);
        c.setLineDash([5, 4]); c.strokeStyle = 'rgba(255,120,90,0.6)'; c.lineWidth = 1; c.beginPath(); c.ellipse(HX, HY, dR, dR * cosI, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(255,150,120,0.85)'; c.font = `400 10px ${MONO}`; c.textAlign = 'center'; c.fillText('Roche limit', HX, HY - dR * cosI - 5);
      }
    }
    const acc = dominantAccretor(wx, wy), fr = acc && feedRings(TYPE[tool], acc.m);
    if (fr) { // where this star would start to feed the compact object, and where it would be torn apart
      const AX = toSX(acc.x, acc.y), AY = toSY(acc.x, acc.y, acc.z); let lastR = 1e9;
      c.font = `400 10px ${MONO}`; c.textAlign = 'center'; c.lineWidth = 1;
      for (const [rw, label, col, dash] of [[fr.leak, 'leaks gas inside here', '255,200,150', [2, 6]], [fr.stream, 'steady stream', '255,170,100', [5, 4]], [fr.tear, 'torn apart', '255,110,90', [5, 4]]]) {
        const rp = rw * zoom; if (!(rp > 8) || rp > 4 * Math.max(vw, vh)) continue;
        c.setLineDash(dash); c.strokeStyle = `rgba(${col},0.55)`; c.beginPath(); c.ellipse(AX, AY, rp, rp * cosI, 0, 0, Math.PI * 2); c.stroke();
        if (lastR - rp * cosI > 13) { c.fillStyle = `rgba(${col},0.9)`; c.fillText(label, AX, AY - rp * cosI - 4); lastR = rp * cosI; }
      }
      c.setLineDash([]);
    }
    const t = TYPE[tool], R = Math.max((t.kind === 'planet' ? planetR(t.m, realSizes) : t.R) * zoom, 3);
    c.fillStyle = `rgba(${t.col},0.55)`; c.beginPath(); c.arc(sx, sy, R, 0, Math.PI * 2); c.fill();
  }
}
function drawOverlay() {
  const c = octx;
  c.setTransform(OD, 0, 0, OD, 0, 0); c.clearRect(0, 0, vw, vh);
  if (opt.jets) drawJets(c);
  if (opt.trails && PRESETS[currentPreset] && PRESETS[currentPreset].orbits) drawOrbits(c);
  if (opt.labels) drawLandmarks(c);
  const taken = [];
  if (opt.labels) {
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    for (const b of bodies.length > 12 ? bodies.slice().sort((p, q) => q.m - p.m) : bodies) {
      const X = toSX(b.x, b.y), Y = toSY(b.x, b.y, b.z);
      if (X < -60 || Y < -60 || X > vw + 60 || Y > vh + 60) continue;
      if (b.kind === 'bh') {
        const R = 2.598 * rsOf(b.m) * zoom;
        c.font = `500 11px ${MONO}`; c.fillStyle = 'rgba(236,230,218,0.78)';
        c.fillText(`${b.label ? b.label + ' · ' : ''}${fmtM(b.m)} M☉`, X, Y + R + 15);
        if (Math.abs(b.chi) > 0.005) { c.font = `400 10px ${MONO}`; c.fillStyle = 'rgba(143,147,168,0.9)'; c.fillText(`χ ${fmtChi(b.chi)} ${b.chi > 0 ? '↺' : '↻'}`, X, Y + R + 28); }
      } else if (isNS(b) || zoom * b.R > 1.2 || bodies.length < 14 || b.label) {
        const R = Math.max(b.R * zoom, 1.6);
        if (b.moonOf) { const h = bodies.find(o => o.id === b.moonOf); if (h && Math.hypot(toSX(h.x, h.y) - X, toSY(h.x, h.y, h.z) - Y) < 22) continue; }
        c.font = `400 10px ${MONO}`; c.fillStyle = `rgba(${b.col || b.type.col},0.8)`;
        if (bodies.length > 12) { // crowded scene: heavier bodies get their label first, and a label that would sit on another is skipped
          if (taken.some(q => Math.abs(q[0] - X) < 64 && Math.abs(q[1] - Y) < 12)) continue;
          taken.push([X, Y]);
        }
        c.textAlign = 'left'; c.fillText(isNS(b) ? `${isMag(b) ? 'Magnetar' : 'NS'} ${fmtM(b.m)} · ${b.spinHz >= 100 ? (1000 / b.spinHz).toFixed(1) + ' ms' : b.spinHz < 1 ? (1 / b.spinHz).toFixed(1) + ' s' : Math.round(b.spinHz) + '/s'}` : b.label || b.type.id, X + R + 6, Y - R - 2); c.textAlign = 'center';
      }
    }
  }
  if (closeUpId != null) {
    const b = bodies.find(o => o.id === closeUpId);
    if (b && b.f > 0.5) {
      const X = toSX(b.x, b.y), Y = toSY(b.x, b.y, b.z), str = stretchOf(b), R = Math.max(b.R * zoom, 6);
      const ang = Math.atan2(toSY(b.hx, b.hy, b.hz) - Y, toSX(b.hx, b.hy) - X), ca = Math.cos(ang), sa = Math.sin(ang);
      const arrow = (x1, y1, x2, y2, col) => {
        c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        const a = Math.atan2(y2 - y1, x2 - x1); c.beginPath(); c.moveTo(x2, y2);
        c.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4)); c.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4)); c.closePath(); c.fill();
      };
      const td = tideShape(b), W = R * td.w + 30, k = clamp((b.f - 0.5) * 2, 0, 1);
      const out = `rgba(255,179,106,${0.9 * k})`, inn = `rgba(127,211,230,${0.9 * k})`;
      for (const sg of [1, -1]) {
        const L = R * (sg > 0 ? td.near : td.far) + 14;
        arrow(X + ca * L * sg, Y + sa * L * sg, X + ca * (L + 34) * sg, Y + sa * (L + 34) * sg, out);
        arrow(X - sa * (W + 30) * sg, Y + ca * (W + 30) * sg, X - sa * W * sg, Y + ca * W * sg, inn);
      }
      c.font = `600 12px "Saira Condensed", sans-serif`; c.textAlign = 'center';
      const Ln = R * td.near + 14;
      c.fillStyle = out; c.fillText('STRETCHED', X + ca * (Ln + 52), Y + sa * (Ln + 52) + 4);
      c.fillStyle = inn; c.fillText('SQUEEZED', X - sa * (W + 44), Y + ca * (W + 44) + 4);
      c.fillStyle = 'rgba(236,230,218,0.85)'; c.font = `500 11px ${MONO}`;
      c.fillText(`tidal stretch ${str.toFixed(1)}× · Roche lobe ${Math.round(b.f * 100)}% full`, X, Y + Math.max(R, W) + 62);
    }
  }
  for (const b of bodies) {
    if (!b.sn) continue;
    const p = snP(b), X = toSX(b.x, b.y), Y = toSY(b.x, b.y, b.z), R = Math.max(b.R * zoom, 1.6);
    const mode = b.sn.mode;
    const cap = mode === 'ia' ? (p < 0.35 ? 'Merger heats the core' : p < 0.55 ? 'Carbon ignites' : 'Thermonuclear runaway')
      : mode === 'dc' ? (p < 0.35 ? 'Core collapsing' : 'No bounce · falling into its own black hole')
      : mode === 'pi' ? (p < 0.2 ? 'Light turning into electron–positron pairs' : p < 0.4 ? 'Core loses pressure and contracts' : 'Oxygen ignites all at once')
      : p < 0.35 ? 'Iron core collapsing' : p < 0.40 ? 'Core bounces' : p < 0.55 ? 'Shock stalls · neutrinos reheat it' : 'Shock heading for the surface';
    c.font = `600 12px "Saira Condensed", sans-serif`; c.textAlign = 'center'; c.fillStyle = 'rgba(255,214,190,0.95)';
    c.fillText(cap.toUpperCase(), X, Y - R - 12);
  }
  if (followId != null) {
    const b = bodies.find(o => o.id === followId);
    if (b) {
      if (!insEl.hidden && !b.sn) drawOrbit(c, b);
      const X = toSX(b.x, b.y), Y = toSY(b.x, b.y, b.z);
      const R = (b.kind === 'bh' ? 2.598 * rsOf(b.m) * zoom : Math.max(b.R * zoom, 1.6)) + 9;
      c.setLineDash([4, 5]); c.lineDashOffset = -wallNow * 0.01; c.strokeStyle = 'rgba(255,179,106,0.6)'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(X, Y, R, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
  }
  if (drag && drag.mode === 'place') {
    const dx = drag.ex - drag.sx, dy = drag.ey - drag.sy;
    if (Math.hypot(dx, dy) < 12) ghost(c, drag.sx, drag.sy);
    else {
      const [wx, wy] = toW(drag.sx, drag.sy), isBH = tool === 'bh';
      const pv = placementVelocity(wx, wy, dx, dy);
      const pts = predictPath(wx, wy, pv.vx, pv.vy, isBH);
      c.setLineDash([5, 6]); c.strokeStyle = 'rgba(255,179,106,0.7)'; c.lineWidth = 1.3; c.beginPath();
      pts.forEach((p, i) => { const X = toSX(p[0], p[1]), Y = toSY(p[0], p[1]); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
      c.stroke(); c.setLineDash([]);
      c.strokeStyle = 'rgba(127,211,230,0.85)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(drag.sx, drag.sy); c.lineTo(drag.ex, drag.ey); c.stroke();
      const ang = Math.atan2(dy, dx); c.beginPath();
      c.moveTo(drag.ex, drag.ey); c.lineTo(drag.ex - 9 * Math.cos(ang - 0.45), drag.ey - 9 * Math.sin(ang - 0.45));
      c.moveTo(drag.ex, drag.ey); c.lineTo(drag.ex - 9 * Math.cos(ang + 0.45), drag.ey - 9 * Math.sin(ang + 0.45)); c.stroke();
      ghost(c, drag.sx, drag.sy);
    }
  } else if (hover && !drag && tool !== 'move' && !photo && !shotWant) ghost(c, hover.x, hover.y);
}

function drawScope() {
  const c = scx, W = scopeCv.width, H = scopeCv.height, d = OD;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
  c.strokeStyle = 'rgba(196,202,232,0.10)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2);
  for (let k = 60; k < SCOPE_N; k += 60) { const x = Math.round(k / (SCOPE_N - 1) * W) + 0.5; c.moveTo(x, 4 * d); c.lineTo(x, H - 4 * d); }
  c.stroke();
  let mx = 0; for (let i = 0; i < SCOPE_N; i++) mx = Math.max(mx, Math.abs(scopeBuf[i]));
  scopeMax = Math.max(0.02, scopeMax + (mx - scopeMax) * (mx > scopeMax ? 0.3 : 0.02));
  // accretion glow: how fast gas is falling in, as a soft filled band along the bottom
  let xm = 0; for (let i = 0; i < SCOPE_N; i++) xm = Math.max(xm, xrBuf[i]);
  xrMax = Math.max(1e-6, xrMax + (xm - xrMax) * (xm > xrMax ? 0.3 : 0.01));
  if (xm > 1e-5) {
    c.beginPath(); c.moveTo(0, H);
    for (let k = 0; k < SCOPE_N; k++) { const i = (scopeHead + k) % SCOPE_N; c.lineTo(k / (SCOPE_N - 1) * W, H - xrBuf[i] / xrMax * H * 0.42); }
    c.lineTo(W, H); c.closePath();
    c.fillStyle = 'rgba(185,163,255,0.22)'; c.fill();
    c.strokeStyle = 'rgba(185,163,255,0.7)'; c.lineWidth = 1 * d; c.stroke();
  }
  // frequency track, log scale 10 Hz – 5 kHz
  const fy = f => H - 3 * d - (Math.log10(clamp(f, 10, 5000)) - 1) / 2.7 * (H - 6 * d);
  c.strokeStyle = 'rgba(255,179,106,0.75)'; c.lineWidth = 1.3 * d; c.beginPath();
  let pen = false;
  for (let k = 0; k < SCOPE_N; k++) {
    const i = (scopeHead + k) % SCOPE_N, f = freqBuf[i];
    if (f <= 0) { pen = false; continue; }
    const x = k / (SCOPE_N - 1) * W, y = fy(f);
    pen ? c.lineTo(x, y) : c.moveTo(x, y); pen = true;
  }
  c.stroke();
  for (let k = 0; k < SCOPE_N; k++) {
    const i = (scopeHead + k) % SCOPE_N;
    if (scopeMark[i]) { const x = k / (SCOPE_N - 1) * W; c.fillStyle = 'rgba(255,179,106,0.8)'; c.fillRect(x, 2 * d, 1.5 * d, H - 4 * d);
      c.font = `600 ${9 * d}px "Saira Condensed", sans-serif`; c.fillText('MERGER', Math.min(x + 4 * d, W - 40 * d), 10 * d); }
  }
  const yOf = v => H / 2 - v / scopeMax * H * 0.44;
  for (const [w, a] of [[4 * d, 0.16], [1.4 * d, 0.95]]) {
    c.strokeStyle = `rgba(127,211,230,${a})`; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath();
    for (let k = 0; k < SCOPE_N; k++) { const i = (scopeHead + k) % SCOPE_N, x = k / (SCOPE_N - 1) * W, y = yOf(scopeBuf[i]); k ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  }
}

