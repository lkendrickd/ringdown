/* ---------- spaghettification close-up ---------- */
let closeUpId = null, closeUpDrift = null;
function toggleCloseUp(b) {
  if (closeUpId === b.id) { closeUpId = null; return; }
  closeUpId = b.id; followId = b.id; opt.follow = true; syncToggles();
  toast('Close-up', ['The hole pulls harder on the side of the star facing it than on the far side', 'That difference stretches the star along the line to the hole and squeezes it from the sides'], 'w');
}
// The shape tides give a star, in units of its radius, along the line to the hole (f = radius / Roche lobe).
// Weak tides raise two equal bulges (a mild football, deformation ~ f³). As the star fills its lobe the near side
// is drawn to a point at L1 (a Roche lobe is a teardrop, about 1.3 times longer than wide), and overflowing
// pulls it out further. An intact star stays under about 2×; the long noodle only forms after it's torn apart.
function tideShape(b) {
  const f = b.f || 0, sym = 0.22 * Math.pow(Math.min(f, 1), 3);
  const p = Math.pow(clamp((f - 0.8) / 0.4, 0, 1), 1.5), o = clamp((f - 1) / 0.6, 0, 1);
  const near = 1 + sym + 0.25 * p + 0.6 * o, far = 1 + sym + 0.2 * o, str = (near + far) / 2;
  return { near, far, w: 1 / Math.sqrt(str), pinch: clamp(0.6 * p + 0.3 * o, 0, 0.9), str };
}
function stretchOf(b) { return tideShape(b).str; }
// teardrop outline in a frame where +x points at the hole
function tidePath(ctx, t, R) {
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const th = i / 48 * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
    const x = c * (c > 0 ? t.near : t.far) * R, y = sn * t.w * R * (c > 0 ? 1 - t.pinch * c ** 4 : 1);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
function retype(st, t, keepMass) {
  st.type = t; st.m0 = st.m; st.R = st.R0 = st.real ? t.Rsun * RSUN_U : t.R; st.core = 0;
  st.noted = false; st.windNoted = false; st.emitAcc = 0; st.ep = null; st.f = 0;
}
function exposeCore(st) {
  const from = st.type.lc, wr = st.type.id === 'BSG';
  retype(st, wr ? TYPE.WR : TYPE.HeWD);
  toast('Stripped to the core', wr
    ? [`The ${from}'s envelope is gone`, `Its ${fmtM(st.m)} M☉ helium core is left as a Wolf–Rayet star, still orbiting`]
    : [`The ${from}'s envelope is gone`, `Its ${fmtM(st.m)} M☉ helium core is left as a white dwarf, still orbiting`], 'w');
}
function becomeBrownDwarf(st) {
  const from = st.type.name;
  retype(st, TYPE.BD);
  toast('Whittled down', [`The ${from} has been stripped to ${st.m.toFixed(3)} M☉, too light to fuse hydrogen`, 'What is left is a brown dwarf']);
}
function emitL1(st, host, rL, pm) {
  const dx = host.x - st.x, dy = host.y - st.y, r = Math.hypot(dx, dy) || 1, nx = dx / r, ny = dy / r;
  const l = Math.min(rL, st.R) * 0.95 + (rand() - 0.5) * 0.12 * st.R;
  const j = (rand() - 0.5) * 0.22 * st.R;
  const x = st.x + nx * l - ny * j, y = st.y + ny * l + nx * j;
  const rx = st.x - host.x, ry = st.y - host.y, rvx = st.vx - host.vx, rvy = st.vy - host.vy;
  const om = (rx * rvy - ry * rvx) / (r * r);
  const px = x - host.x, py = y - host.y;
  let vx = host.vx - om * py, vy = host.vy + om * px;
  const sp = Math.hypot(vx - host.vx, vy - host.vy);
  vx += (rand() - 0.5) * 0.03 * sp + nx * 0.03 * sp; vy += (rand() - 0.5) * 0.03 * sp + ny * 0.03 * sp;
  if (gN >= gasCap) return false;
  return addGas(x, y, vx, vy, pm, st.id);
}
function shred(st, host, r, kind) {
  const N = Math.min(kind === 'tde' ? 900 : 600, MAXG - gN);
  const rx = st.x - host.x, ry = st.y - host.y;
  const om = (rx * (st.vy - host.vy) - ry * (st.vx - host.vx)) / (r * r || 1);
  // spaghettified: the debris starts as a long thin noodle pointing at the hole. Its near end sits deeper in
  // the hole's gravity than its far end, so about half ends up bound (falls back) and half escapes.
  const nx = -rx / (r || 1), ny = -ry / (r || 1), str = Math.max(stretchOf(st), 3), sq = 1 / Math.sqrt(str);
  for (let k = 0; k < N; k++) {
    const u = (rand() * 2 - 1), w = (rand() * 2 - 1) * Math.sqrt(1 - u * u);
    const ox = (nx * u * str - ny * w * sq) * st.R, oy = (ny * u * str + nx * w * sq) * st.R;
    addGas(st.x + ox, st.y + oy, st.vx - om * oy, st.vy + om * ox, st.m / Math.max(N, 1));
  }
  if (closeUpId === st.id) { closeUpId = null; closeUpDrift = { t0: wallNow, vx: st.vx, vy: st.vy, z0: zoom }; }
  if (host.kind === 'bh' && host.m > 1e4) {
    // a galactic-center disruption happens where orbits take hours, inside a scene that skips weeks per frame:
    // drop time at once to resolve orbits at this radius (~100 sub-steps per frame) and end this frame here
    const tdyn = Math.sqrt(r * r * r / (G * host.m));
    tdeSlow = clamp(60 * tdyn / (warp * SPEEDS[speedIdx]), 1e-6, 0.5); // sized for the longest frame the loop allows (0.05 s)
    tdeSlowUntil = wallNow + 30000; slow = tdeSlow; breakFrame = true;
  }
  if (host.kind === 'bh') reached(host.m > 1e4 ? 'sgra' : 'tde');
  bodies = bodies.filter(o => o !== st);
  sfx(kind === 'nsbh' ? 'kn' : 'tde', st.x, st.y, kind === 'ns' ? 0.6 : 1);
  if (kind === 'ns') {
    toast(`${st.type.name} shredded by a neutron star`, [`Torn apart ${fmtDist(r * KM_PER_UNIT)} from the ${fmtM(host.m)} M☉ neutron star`, 'Its debris forms a disk; the neutron star feeds on it and spins up'], 'w');
  } else if (kind === 'nsbh') {
    flashes.push({ x: st.x, y: st.y, t0: wallNow, dur: 9000, scale: 0.3 });
    host.grbT = wallNow;
    toast('Neutron star torn apart', [`Disrupted ${fmtDist(r * KM_PER_UNIT)} from a ${fmtM(host.m)} M☉ hole spinning at ${fmtChi(host.chi)}`, 'Its debris feeds the hole, launches a jet and lights a kilonova'], 'w');
  } else {
    toast('Tidal disruption', [`${st.type.name} torn apart ${fmtDist(r * KM_PER_UNIT)} from a ${fmtM(host.m)} M☉ hole`, 'Half the debris is bound and falls back; the rest escapes']);
  }
}

const mspQueue = [], windQueue = [], novaQueue = [];
// Novae: real ones blow off ~1e-5 Msun; here the layer is scaled up (0.01 Msun) so eruptions come every few seconds.
// Each one throws off most of the layer and the white dwarf keeps a little, creeping toward 1.44 Msun.
const NOVA_LAYER = 0.01, NOVA_KEEP = 0.2;
function nova(wd) {
  wd.novaPending = false;
  const layer = wd.layer || 0; if (layer <= 0 || !bodies.includes(wd)) return;
  const out = layer * (1 - NOVA_KEEP), N = Math.min(160, MAXG - gN);
  wd.m -= out; wd.layer = 0; wd.novae = (wd.novae || 0) + 1;
  reached('nova');
  for (let k = 0; k < N; k++) {
    const a = rand() * Math.PI * 2, rr = wd.R * (1.2 + 0.4 * rand());
    const x = wd.x + Math.cos(a) * rr, y = wd.y + Math.sin(a) * rr;
    const vInf = (0.003 + 0.008 * rand()) * C, ve = escapeSpeed(x, y, null), sp = Math.min(Math.sqrt(vInf * vInf + ve * ve), 0.85 * C);
    if (addGas(x, y, wd.vx + Math.cos(a) * sp, wd.vy + Math.sin(a) * sp, out / Math.max(N, 1))) gf[gN - 1] = 3;
  }
  flashes.push({ x: wd.x, y: wd.y, t0: wallNow, dur: 4500, kind: 'sn', R: 6, power: 0.35, st: simTime });
  sfx('nova', wd.x, wd.y);
  if (wd.novae <= 3 || wd.novae % 5 === 0)
    toast(`Nova${wd.novae > 1 ? ' #' + wd.novae : ''}`, [`Hydrogen piled up on the white dwarf's surface and ignited in a thermonuclear flash`,
      `Most of it blew off; the white dwarf kept a little and is now ${fmtM(wd.m)} of 1.44 M☉`]);
  if (wd.m >= M_CH && !wd.sn) { wd.sn = { t0: wallNow, mode: 'ia' }; toast('Over the Chandrasekhar limit', ['Feeding pushed the white dwarf past 1.44 M☉', 'Carbon is about to ignite']); }
}
// gas mass m landing on accretor b; (px, py, rvx, rvy) = position and velocity relative to b
function accrete(b, m, px, py, rvx, rvy) {
  if (b.kind === 'bh') { // accreted angular momentum spins the hole up (or down, for retrograde gas)
    const sg = (px * rvy - py * rvx) < 0 ? 1 : -1;
    let cp = b.chi * sg;
    cp = Math.min(0.998, cp + m / b.m * 3.67 * Math.sqrt(Math.max(0, 1 - cp)));
    b.chi = cp * sg;
    b.fedFrame += m;
  } else if (isWD(b)) { // hydrogen piles up on the surface until it ignites as a nova
    b.layer = (b.layer || 0) + m; b.fedFrame = (b.fedFrame || 0) + m;
    if (b.layer >= NOVA_LAYER && !b.novaPending) { b.novaPending = true; novaQueue.push(b); }
  } else { // recycling: ~0.1 Msun of accreted gas spins a neutron star up to millisecond periods
    b.spinHz = Math.min(716, b.spinHz + m / b.m * 4000);
    if (!b.msp && b.spinHz >= 100) { b.msp = true; mspQueue.push(b); reached('msp'); }
    b.fedFrame = (b.fedFrame || 0) + m;
  }
  b.m += m; totalFed += m; b.fedTotal = (b.fedTotal || 0) + m;
}
const VISC = 0.12, INFLOW = 0.02, TORQUE = 0.007, LOG80 = Math.log(80), VMAX = 0.9 * C;
function stepGas(simDt) {
  if (!gN || simDt <= 0) return;
  const bh = bodies.filter(isAccretor);
  if (!bh.length) {
    for (let i = 0; i < gN; i++) { gx[i] += gvx[i] * simDt; gy[i] += gvy[i] * simDt; gage[i] += simDt / warp; if (gage[i] > 300) { removeGas(i); i--; } }
    return;
  }
  const GG = G * G, C3 = C * C * C;
  for (let i = 0; i < gN; i++) {
    let x = gx[i], y = gy[i], vx = gvx[i], vy = gvy[i];
    // each particle takes only the substeps its own orbit needs: inner disk fine-grained, outer stream coarse
    let t2 = Infinity, near = null;
    for (const b of bh) { const dx = b.x - x, dy = b.y - y, r2 = dx * dx + dy * dy; const t = r2 * Math.sqrt(r2) / (G * b.m); if (t < t2) { t2 = t; near = b; } }
    const need = Math.ceil(simDt / (0.03 * Math.sqrt(t2)));
    if (need > 240 && near.id !== gsrc[i]) { // so deep in that its orbit is shorter than this frame can resolve: it is going in, so let it land now
      accrete(near, gm[i], x - near.x, y - near.y, vx - near.vx, vy - near.vy);
      removeGas(i); i--; continue;
    }
    const n = clamp(need, 1, 240), dt = simDt / n;
    let dead = false, hb = null, hrp = 1, rh = 1;
    for (let s = 0; s < n && !dead; s++) {
      let ax = 0, ay = 0, bestA = -1, far = true;
      for (const b of bh) {
        const dx = b.x - x, dy = b.y - y, r = Math.sqrt(dx * dx + dy * dy) + 1e-9, rs = KR * b.m;
        const rvx = vx - b.vx, rvy = vy - b.vy;
        const isHole = b.kind === 'bh';
        const rp = isHole ? rpFor(b, -dx, -dy, rvx, rvy) : rs;
        if (b.id !== gsrc[i] && (isHole ? r < Math.max(1.05 * b.kPlus * rs, 2.2 * rp) : r < 1.2 * b.R)) {
          accrete(b, gm[i], -dx, -dy, rvx, rvy); dead = true; break;
        }
        if (r < Math.max(30000, 3000 * rs)) far = false;
        const d = Math.max(r - rp, 0.3 * rp), a = G * b.m / (d * d);
        ax += a * dx / r; ay += a * dy / r;
        if (isHole && b.chi !== 0) { // frame dragging: gravitomagnetic push toward co-rotation
          const rr = Math.max(r, 2 * rp), wfd = 2 * b.chi * GG * b.m * b.m / (C3 * rr * rr * rr);
          ax -= wfd * rvy; ay += wfd * rvx;
        }
        if (a > bestA) { bestA = a; hb = b; hrp = rp; }
      }
      if (dead || far) { dead = true; break; }
      if (gf[i] === 0) { // first time this gas reaches the inner disk: some of it is blown back out
        const ex = x - hb.x, ey = y - hb.y, er = Math.sqrt(ex * ex + ey * ey);
        if (er < 15 * hrp) {
          const fOut = hb.kind === 'bh' ? 0.15 + 0.5 * clamp(hb.feedRate * 160, 0, 1) : isWD(hb) ? 0.1 : 0.4;
          if (rand() < fOut) {
            const sp = (0.3 + 0.15 * rand()) * C;
            vx += ex / er * sp; vy += ey / er * sp; gf[i] = 2;
            totalWind += gm[i]; hb.windM = (hb.windM || 0) + gm[i];
            if (!hb.windNoted) { hb.windNoted = true; windQueue.push(hb); }
          } else gf[i] = 1;
        }
      }
      vx += ax * dt; vy += ay * dt;
      const px = x - hb.x, py = y - hb.y, r = Math.sqrt(px * px + py * py), d = Math.max(r - hrp, 0.3 * hrp);   // (Math.hypot is several times slower)
      let rvx = vx - hb.vx, rvy = vy - hb.vy;
      const eps = 0.5 * (rvx * rvx + rvy * rvy) - G * hb.m / d;
      if (eps < 0 && gf[i] < 2) {
        // disk viscosity: damp radial sloshing (circularizes the stream) and shed angular momentum so orbits shrink
        const vc = Math.sqrt(G * hb.m * r) / d, om = vc / r, rx = px / r, ry = py / r;
        const vr = rvx * rx + rvy * ry, tvx = rvx - vr * rx, tvy = rvy - vr * ry;
        const kd = 1 - Math.exp(-VISC * om * dt), kt = TORQUE * om * dt;
        const nvr = vr + (-INFLOW * vc - vr) * kd;
        rvx = tvx * (1 - kt) + nvr * rx; rvy = tvy * (1 - kt) + nvr * ry;
        vx = rvx + hb.vx; vy = rvy + hb.vy;
      }
      { // nothing outruns light: cap speed relative to the hole at 0.9 c
        const ux = vx - hb.vx, uy = vy - hb.vy, sp = Math.sqrt(ux * ux + uy * uy);
        if (sp > VMAX) { const k = VMAX / sp; vx = hb.vx + ux * k; vy = hb.vy + uy * k; }
      }
      x += vx * dt; y += vy * dt; rh = r;
    }
    gage[i] += simDt / warp;
    if (dead || gage[i] > 400) { removeGas(i); i--; continue; }
    gx[i] = x; gy[i] = y; gvx[i] = vx; gvy[i] = vy;
    grh[i] = rh; grvx[i] = vx - hb.vx; grvy[i] = vy - hb.vy;
    gb[i] = clamp(Math.round((1 - Math.log(Math.max(rh / (2.6 * hrp), 1)) / LOG80) * 23), 0, 23);
  }
}

