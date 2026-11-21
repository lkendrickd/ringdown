/* sprites */
function rampColor(t) {
  const st = [[0,[255,60,22]],[0.25,[255,118,40]],[0.5,[255,196,110]],[0.7,[255,238,212]],[0.85,[214,226,255]],[1,[156,186,255]]];
  for (let i = 1; i < st.length; i++) if (t <= st[i][0]) {
    const [t0, c0] = st[i - 1], [t1, c1] = st[i], k = (t - t0) / (t1 - t0);
    return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
  }
  return st[st.length - 1][1];
}
const gasSprites = [];
for (let i = 0; i < 24; i++) {
  const t = i / 23, c = rampColor(t), b = 0.32 + 0.68 * t;
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const x = cv.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, `rgba(${c},${0.95 * b})`); g.addColorStop(0.3, `rgba(${c},${0.45 * b})`); g.addColorStop(1, `rgba(${c},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 32, 32); gasSprites.push(cv);
}
const starGlow = {}, starCore = {};
for (const t of STAR_TYPES) {
  const c = t.col.join(',');
  let cv = document.createElement('canvas'); cv.width = cv.height = 128;
  let x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${c},0.6)`); g.addColorStop(0.15, `rgba(${c},0.28)`); g.addColorStop(0.45, `rgba(${c},0.07)`); g.addColorStop(1, `rgba(${c},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); starGlow[t.id] = cv;
  cv = document.createElement('canvas'); cv.width = cv.height = 64; x = cv.getContext('2d');
  g = x.createRadialGradient(28, 28, 0, 32, 32, 32);
  const dark = t.col.map(v => Math.round(v * 0.72)).join(',');
  g.addColorStop(0, 'rgba(255,255,250,1)'); g.addColorStop(0.45, `rgba(${c},1)`); g.addColorStop(1, `rgba(${dark},1)`);
  x.fillStyle = g; x.beginPath(); x.arc(32, 32, 31.5, 0, Math.PI * 2); x.fill(); starCore[t.id] = cv;
}
function makeSkyTile() {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  x.fillStyle = '#04050b'; x.fillRect(0, 0, S, S);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dust = [[70,50,120],[40,70,110],[110,60,70],[50,40,90]];
  for (let k = 0; k < 7; k++) {
    const cx = rnd() * S, cy = rnd() * S, r = 180 + rnd() * 340, c = dust[k % dust.length];
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
      g.addColorStop(0, `rgba(${c},0.075)`); g.addColorStop(1, `rgba(${c},0)`);
      x.fillStyle = g; x.fillRect(cx + ox - r, cy + oy - r, 2 * r, 2 * r);
    }
  }
  const pal = [[255,255,255],[214,226,255],[176,200,255],[255,238,214],[255,206,150],[255,170,120]];
  for (let k = 0; k < 1700; k++) {
    const px = rnd() * S, py = rnd() * S, mag = Math.pow(rnd(), 3.2);
    const c = pal[Math.floor(rnd() * rnd() * pal.length)];
    const a = 0.18 + 0.82 * mag, rr = 0.45 + mag * 1.3;
    if (mag > 0.55) {
      const g = x.createRadialGradient(px, py, 0, px, py, rr * 5);
      g.addColorStop(0, `rgba(${c},${0.35 * a})`); g.addColorStop(1, `rgba(${c},0)`);
      x.fillStyle = g; x.fillRect(px - rr * 5, py - rr * 5, rr * 10, rr * 10);
    }
    x.fillStyle = `rgba(${c},${a})`; x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.fill();
  }
  return cv;
}
const skyTile = makeSkyTile();
const skyPattern = sctx.createPattern(skyTile, 'repeat');
function uploadSky() {
  gl.bindTexture(gl.TEXTURE_2D, GLR.skyTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skyTile);
}
if (gl) uploadSky();
/* A GPU reset (a driver crash or update, too many pages using the GPU) takes the context away and blanks the canvas.
   Cancelling the event asks the browser to give it back; until it does nothing is drawn with it, and when it does,
   everything the GPU held is rebuilt. The simulation runs on meanwhile. */
if (gl) {
  view.addEventListener('webglcontextlost', e => {
    e.preventDefault(); glLost = true;
    toast('Graphics reset', ['The browser took the graphics card away from this page for a moment; the picture returns as soon as it is given back']);
  });
  view.addEventListener('webglcontextrestored', () => {
    if (!buildGL()) { toast('Graphics lost', ['The picture could not be rebuilt after a graphics reset. Reload the page to get it back']); return; }
    GLR.tg = {}; GLR.bloom = []; glTargets(); uploadSky(); glLost = false;   // the old targets belonged to the lost context: drop, don't delete
  });
}
// gas colours for the GPU path: the same ramp as the sprites, as floats
const gasRGB = new Float32Array(24 * 3);
for (let i = 0; i < 24; i++) { const t = i / 23, c = rampColor(t), b = (0.32 + 0.68 * t) / 255; gasRGB[i * 3] = c[0] * b; gasRGB[i * 3 + 1] = c[1] * b; gasRGB[i * 3 + 2] = c[2] * b; }
let gasInst = new Float32Array((MAXG + MAXM) * 8), gasInstN = 0;
let starInst = new Float32Array(64 * 16), starInstN = 0;
let sceneUsed = false, sceneWasUsed = true;
// how each kind of star's surface looks up close: [convection cells across the disc, contrast]
function starSurface(t) {
  if (t.kind === 'ns' || t.kind === 'wd') return [0, 0];
  if (t.kind === 'planet') return t.id === 'GAS' ? [11, -2] : t.id === 'ICE' ? [9, -3] : t.id === 'ROCK' ? [3.2, -1] : [3, -4];   // negative: a planet, lit from outside (-1 rocky, -2 gas giant, -3 ice giant, -4 airless)
  if (t.kind === 'bd') return [5, 0.22];
  if (t.kind === 'giant') return t.T < 5000 ? [4.5, 0.3] : t.T < 8000 ? [9, 0.16] : [14, 0.08];
  return t.T < 7000 ? [20, 0.14] : [28, 0.05];
}
for (const t of STAR_TYPES) { t.surf = starSurface(t); t.glBright = 1 + 0.3 * clamp(Math.log10(t.T / 3000), 0, 1.4); }

function resize() {
  vw = innerWidth; vh = innerHeight;
  const dpr = window.devicePixelRatio || 1;
  RS = Math.min(dpr, 1.5); if (vw * vh * RS * RS > 2.4e6) RS = Math.sqrt(2.4e6 / (vw * vh));
  RS *= Q.rs;
  OD = Math.min(dpr, 2);
  scene.width = view.width = Math.round(vw * RS); scene.height = view.height = Math.round(vh * RS);
  ui.width = Math.round(vw * OD); ui.height = Math.round(vh * OD);
  scopeCv.width = Math.round(scopeCv.clientWidth * OD); scopeCv.height = Math.round((scopeCv.clientHeight || 62) * OD);
  if (gl && !glLost) glTargets();
  const dk = document.getElementById('dock');
  document.documentElement.style.setProperty('--dock-h', dk.offsetHeight + 'px');
  const sc = document.querySelector('.scope');
  document.documentElement.style.setProperty('--scope-b', Math.round(sc.getBoundingClientRect().bottom) + 'px');
}

// Orbital plane seen by a camera that is first turned by `yaw` about the plane's axis, then tilted by i
// (far side toward the top of the screen). Both coordinates are needed for either screen axis.
// A height z above the plane (3D scenes) moves a point up the screen by z sin i: nothing face-on, its full height edge-on.
// The camera looks at (camX, camY, camZ); camZ is only ever non-zero while following something off the plane.
const toSX = (x, y) => ((x - camX) * cY - (y - camY) * sY) * zoom + vw / 2 + shX;
const toSY = (x, y, z = 0) => ((x - camX) * sY + (y - camY) * cY) * zoom * cosI - (z - camZ) * sinI * zoom + vh / 2 + shY;
// how near the viewer a point is (larger is nearer), for drawing what is in front last
const depthOf = (x, y, z) => ((x - camX) * sY + (y - camY) * cY) * sinI + (z - camZ) * cosI;
// bodies in drawing order: in a tilted 3D scene the farthest first, so nearer ones cover them
const byDepth = () => zOn && sinI > 0.01 ? bodies.slice().sort((p, q) => depthOf(p.x, p.y, p.z) - depthOf(q.x, q.y, q.z)) : bodies;
function scrOff(du, dv) { const u = du / zoom, w = dv / (zoom * cosI); return [u * cY + w * sY, -u * sY + w * cY]; }
// screen to world, on the plane itself (z = 0): where a click places things
function toW(sx, sy) { const o = scrOff(sx - vw / 2, sy - vh / 2 - camZ * sinI * zoom); return [camX + o[0], camY + o[1]]; }

function drawScene() {
  const W = scene.width, H = scene.height, s = RS;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = 'source-over'; sctx.globalAlpha = 1;
  const par = 0.12;
  const ox = ((-camX * zoom * par * s) % 1024 + 1024) % 1024, oy = ((-camY * zoom * cosI * par * s) % 1024 + 1024) % 1024;
  if (gl) { // the GPU draws the sky, gas and stars; this canvas keeps only the hand-drawn effects, over a clear background
    if (sceneUsed || sceneWasUsed) sctx.clearRect(0, 0, W, H);
    sceneWasUsed = sceneUsed; sceneUsed = false;
    GLR.skyT = [cY, sY, ox - W / 2, oy - H / 2];
  } else {
    if (skyPattern.setTransform) skyPattern.setTransform(new DOMMatrix().translate(W / 2, H / 2).rotate(yaw * 180 / Math.PI).translate(ox - W / 2, oy - H / 2));
    sctx.fillStyle = skyPattern; sctx.fillRect(0, 0, W, H);
  }

  if (opt.trails) {
    sctx.lineWidth = Math.max(1, 1.1 * s); sctx.lineJoin = 'round';
    for (const b of bodies) {
      const tr = b.trail; if (tr.length < 2) continue;
      sceneUsed = true;
      const col = b.kind === 'bh' ? '200,190,255' : b.type.col.join(',');
      const cut = Math.floor(tr.length * 0.55);
      for (const [from, to, al] of [[0, cut + 1, 0.12], [cut, tr.length, 0.3]]) {
        if (to - from < 2) continue;
        sctx.strokeStyle = `rgba(${col},${al})`; sctx.beginPath();
        for (let i = from; i < to; i++) { const X = toSX(tr[i][0], tr[i][1]) * s, Y = toSY(tr[i][0], tr[i][1], tr[i][2]) * s; i === from ? sctx.moveTo(X, Y) : sctx.lineTo(X, Y); }
        sctx.stroke();
      }
    }
  }

  // explosions: supernovae, novae and flares (kind 'sn'), kilonovae, impacts and flare glows. With WebGL2 they go to
  // the GPU's explosion pass instead (packFlash), newest first, so past FX_MAX the oldest are the ones left out.
  sctx.globalCompositeOperation = 'lighter';
  const fxGL = gl && GFX.fx;
  if (flashes.length && !fxGL) sceneUsed = true;
  fxN = fxF = 0;
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i], a = Math.max(0, (wallNow - f.t0) / f.dur);
    if (a > 1) { flashes.splice(i, 1); continue; }
    const X = toSX(f.x, f.y) * s, Y = toSY(f.x, f.y, f.z) * s;
    if (fxGL) { packFlash(f, a, X, Y, W, H); continue; }
    if (f.kind === 'sn') { drawSupernovaFlash(f, a, X, Y, W, H); continue; }
    const R = Math.max((4 + 90 * Math.pow(a, 0.55)) * f.scale * zoom, 6) * s;
    const k = clamp((a - 0.12) / 0.55, 0, 1);
    const col = (f.kind === 'sn' ? [255, 250 - 70 * k, 240 - 170 * k] : [180 + 75 * k, 205 - 110 * k, 255 - 210 * k]).map(Math.round).join(',');
    const al = Math.pow(1 - a, 1.6) * 0.9;
    const g = sctx.createRadialGradient(X, Y, 0, X, Y, R);
    g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(0.45, `rgba(${col},${al * 0.45})`); g.addColorStop(1, `rgba(${col},0)`);
    sctx.fillStyle = g; sctx.fillRect(X - R, Y - R, 2 * R, 2 * R);
    if (a < 0.06) {
      const w = (1 - a / 0.06), R2 = R * 0.6;
      const g2 = sctx.createRadialGradient(X, Y, 0, X, Y, R2);
      g2.addColorStop(0, `rgba(255,255,255,${w})`); g2.addColorStop(1, 'rgba(255,255,255,0)');
      sctx.fillStyle = g2; sctx.fillRect(X - R2, Y - R2, 2 * R2, 2 * R2);
    }
  }

  // gas (Doppler-beamed when the view is tilted)
  const gsz = clamp(2.8 * zoom, 2.2, 15) * s, mg = 20 * s, tilted = sinI > 0.01;
  if (gl) { drawSceneGL(W, H, gsz, mg, tilted); return; }
  for (let i = 0; i < gN; i++) {
    const X = toSX(gx[i], gy[i]) * s, Y = toSY(gx[i], gy[i]) * s;
    if (X < -mg || Y < -mg || X > W + mg || Y > H + mg) continue;
    let bucket = gb[i], sz = gsz;
    let fade3 = 1;
    if (gf[i] === 3) { const age = gage[i]; bucket = clamp(Math.round(23 - age * 2.2), 1, 23); sz = gsz * (1.8 + Math.min(age, 8) * 0.45); fade3 = Math.max(0, 1 - age / 16); }
    if (tilted) {
      const bl = Math.min((gvx[i] * sY + gvy[i] * cY) * sinI / C, 0.95), b2 = Math.min((gvx[i] * gvx[i] + gvy[i] * gvy[i]) / (C * C), 0.95);
      const del = Math.sqrt(1 - b2) / (1 - bl);
      const boost = del * del * del;
      const sh = Math.round(7 * Math.log(del));
      bucket = clamp(bucket + (Number.isFinite(sh) ? sh : 0), 0, 23);
      sctx.globalAlpha = Math.min(1, boost);
      if (boost > 1) sz = gsz * Math.sqrt(Math.min(boost, 4));
    }
    const h = sz / 2;
    if (gf[i] === 2) sctx.globalAlpha *= 0.45;
    if (gf[i] === 3) sctx.globalAlpha = (tilted ? sctx.globalAlpha : 1) * fade3;
    if (h > 0 && h < 400) sctx.drawImage(gasSprites[bucket], X - h, Y - h, sz, sz);
    if (gf[i] === 2) sctx.globalAlpha = tilted ? sctx.globalAlpha / 0.45 : 1;
    if (gf[i] === 3) sctx.globalAlpha = 1;
  }
  sctx.globalAlpha = 1;
  for (let i = 0; i < qN; i++) {
    const X = toSX(qx[i], qy[i]) * s, Y = toSY(qx[i], qy[i], qz[i]) * s;
    if (X < 0 || Y < 0 || X > W || Y > H) continue;
    sctx.fillStyle = qT[i] > 0.1 ? 'rgba(255,150,70,0.8)' : 'rgba(150,140,128,0.7)'; sctx.fillRect(X - s, Y - s, 2 * s, 2 * s);
  }
  const order = byDepth();
  // stars: glow
  for (const b of order) {
    if (b.kind !== 'star') continue;
    const X = toSX(b.x, b.y) * s, Y = toSY(b.x, b.y, b.z) * s, R = Math.max(b.R * zoom, 1.6) * s;
    const g = R * 5 + (isNS(b) ? 7 : 12) * s;
    sctx.drawImage(starGlow[b.type.id], X - g, Y - g, 2 * g, 2 * g);
    if (isNS(b)) { // pulsar beams
      if (isMag(b)) drawMagField(X, Y, R, b);
      const ang = b.beamPh, L = Math.max(R * 9, 22 * s);
      sctx.lineWidth = Math.max(1, 1.2 * s);
      for (const sg of [1, -1]) {
        const ex = X + Math.cos(ang) * L * sg, ey = Y + Math.sin(ang) * L * sg * cosI;
        const lg = sctx.createLinearGradient(X, Y, ex, ey);
        lg.addColorStop(0, 'rgba(170,215,255,0.55)'); lg.addColorStop(1, 'rgba(170,215,255,0)');
        sctx.strokeStyle = lg; sctx.beginPath(); sctx.moveTo(X, Y); sctx.lineTo(ex, ey); sctx.stroke();
      }
    }
  }
  sctx.globalCompositeOperation = 'source-over';
  for (const b of order) {
    if (b.kind !== 'star') continue;
    const X = toSX(b.x, b.y) * s, Y = toSY(b.x, b.y, b.z) * s, R = Math.max(b.R * zoom, 1.6) * s;
    if (b.sn) { drawCollapse(b, X, Y, R, snP(b)); continue; }
    const td = tideShape(b);
    if (td.str > 1.01 && b.hx != null) { // tidally stretched toward the hole, pointed at L1, squeezed from the sides
      const ang = Math.atan2(toSY(b.hx, b.hy, b.hz) * s - Y, toSX(b.hx, b.hy) * s - X);
      sctx.save(); sctx.translate(X, Y); sctx.rotate(ang); tidePath(sctx, td, R); sctx.clip();
      sctx.drawImage(starCore[b.type.id], -td.far * R, -td.w * R, (td.far + td.near) * R, 2 * td.w * R); sctx.restore();
    } else sctx.drawImage(starCore[b.type.id], X - R, Y - R, 2 * R, 2 * R);
  }
}

// a magnetar's dipole field: loops r = L sin^2(theta) about the magnetic axis, flaring bright after a starquake
function drawMagField(X, Y, R, b) {
  const s = RS, ax = b.beamPh, ca = Math.cos(ax), sa = Math.sin(ax), fl = b.flashT ? Math.max(0, 1 - (wallNow - b.flashT) / 2500) : 0;
  sctx.lineWidth = Math.max(1, s);
  for (let k = 1; k <= 4; k++) {
    const L = Math.max(R * 4, 12 * s) * k * (1 + 0.5 * fl);
    sctx.strokeStyle = `rgba(214,150,255,${(0.34 - 0.06 * k) * (1 + 2 * fl)})`;
    for (const sg of [1, -1]) {
      sctx.beginPath();
      for (let i = 0; i <= 28; i++) {
        const th = i / 28 * Math.PI, r = L * Math.sin(th) ** 2, u = r * Math.cos(th), v = r * Math.sin(th) * sg;
        const px = X + u * ca - v * sa, py = Y + (u * sa + v * ca) * cosI;
        i ? sctx.lineTo(px, py) : sctx.moveTo(px, py);
      }
      sctx.stroke();
    }
  }
}
// GPU path: instead of drawing gas and stars here, pack them into instance buffers for composite() to draw.
function drawSceneGL(W, H, gsz, mg, tilted) {
  const s = RS, C2 = C * C, top = HDR ? 2.2 : 1, gain = 0.5;
  let n = 0;
  const gi = gasInst, base = gsz * 1.3, maxSz = 44 * s;
  // Near a hole the lensing pass ray traces the disk and shifts its light for the orbit it comes from (FS_LENS,
  // diskLight). Gas there is handed over to it, fading in as the shader's trace does; elsewhere it is beamed here.
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }, trh = [];
  if (opt.lens && tilted) for (const b of bhList().slice(0, 16)) { const r = rsOf(b.m) * zoom * s, f = ss(1.2, 2.5, r); if (f > 0) trh.push(toSX(b.x, b.y) * s, toSY(b.x, b.y, b.z) * s, r, f); }
  for (let i = 0; i < gN; i++) {
    const X = toSX(gx[i], gy[i]) * s, Y = toSY(gx[i], gy[i]) * s;
    if (X < -mg || Y < -mg || X > W + mg || Y > H + mg) continue;
    let bucket = gb[i], sz = base, k = gain, len = 1, ang = 0;
    const f = gf[i];
    if (f === 3) { const age = gage[i]; bucket = clamp(Math.round(23 - age * 2.2), 1, 23); sz = base * (1.8 + Math.min(age, 8) * 0.45); k *= Math.max(0, 1 - age / 16); }
    else {
      if (f === 2) k *= 0.45;
      const rh = grh[i];
      if (rh > 0) {
        // Gas in orbit is smeared out along its path by the disk's shear, and spreads wider the farther out it is.
        // Drawing it that way (same light, larger softer streak) turns separate dots into a continuous disk.
        const vx = grvx[i], vy = grvy[i], sx = vx * cY - vy * sY, sy = (vx * sY + vy * cY) * cosI;
        ang = Math.atan2(-sy, sx);
        const want = clamp(0.2 * rh * zoom * s, base, maxSz);
        k *= Math.pow(base / want, 1.05); sz = want; len = f === 1 ? 2.6 : 1.7;
      }
    }
    let own = 1;
    for (let q = 0; q < trh.length; q += 4) own = Math.min(own, 1 - trh[q + 3] * (1 - ss(9.6, 16, Math.hypot(X - trh[q], Y - trh[q + 1]) / trh[q + 2])));
    if (tilted && own > 0) { // relativistic beaming: gas coming toward the viewer is brighter and bluer
      const bl = Math.min((gvx[i] * sY + gvy[i] * cY) * sinI / C, 0.95), b2 = Math.min((gvx[i] * gvx[i] + gvy[i] * gvy[i]) / C2, 0.95);
      const del = Math.sqrt(1 - b2) / (1 - bl), boost = del * del * del;
      const sh = Math.round(7 * Math.log(del) * own);
      bucket = clamp(bucket + (sh === sh ? sh : 0), 0, 23);
      k *= Math.pow(Math.min(boost, top), own);
    }
    if (k <= 0) continue;
    const o = n * 8, c = bucket * 3;
    gi[o] = X; gi[o + 1] = H - Y; gi[o + 2] = sz * len; gi[o + 3] = sz;
    gi[o + 4] = gasRGB[c] * k; gi[o + 5] = gasRGB[c + 1] * k; gi[o + 6] = gasRGB[c + 2] * k; gi[o + 7] = ang;
    n++;
  }
  // loose matter: small cold grains, or glowing ones fresh from an impact
  const msz = clamp(1.2 * zoom, 2.6, 5) * s;
  const occ = [];   // bodies big enough on screen to hide what is behind them when the view is tilted
  if (tilted && qN) for (const b of bodies) { if (b.kind !== 'star') continue; const R = b.R * zoom * s; if (R > 4) occ.push(toSX(b.x, b.y) * s, toSY(b.x, b.y, b.z) * s, R * R, depthOf(b.x, b.y, b.z)); }
  for (let i = 0; i < qN; i++) {
    const X = toSX(qx[i], qy[i]) * s, Y = toSY(qx[i], qy[i], qz[i]) * s;
    if (X < -mg || Y < -mg || X > W + mg || Y > H + mg) continue;
    let hidden = false;
    const dq = zOn && occ.length ? depthOf(qx[i], qy[i], qz[i]) : 0;
    for (let q = 0; q < occ.length; q += 4) { const dx = X - occ[q], dy = Y - occ[q + 1]; if ((zOn ? dq < occ[q + 3] : dy < 0) && dx * dx + dy * dy < occ[q + 2]) { hidden = true; break; } }   // flat: the far side of the plane is toward the top of the screen; 3D: farther than the body
    if (hidden) continue;
    const T = qT[i], o = n * 8, sz = msz * (1 + 0.8 * T) * (qk[i] > qScale ? 1 + 0.28 * Math.log2(qk[i] / qScale) : 1);
    let len = 1, ang = 0, k = 1;
    if (qr[i]) { // ring debris: each grain stands for a streak of them strung along the orbit
      const h = bodies[clHI[qc[i]]];
      if (h) { const vx = qvx[i] - h.vx, vy = qvy[i] - h.vy; ang = Math.atan2(-(vx * sY + vy * cY) * cosI, vx * cY - vy * sY); len = 5; k = 0.3; }
    }
    const ice = qp[i] > 1.1 ? 1 : 0;
    gi[o] = X; gi[o + 1] = H - Y; gi[o + 2] = sz * len; gi[o + 3] = sz;
    gi[o + 4] = (0.42 + 0.14 * ice + 1.2 * T) * k; gi[o + 5] = (0.38 + 0.2 * ice + 0.4 * T) * k; gi[o + 6] = (0.34 + 0.28 * ice - 0.1 * T) * k; gi[o + 7] = ang;
    n++;
  }
  gasInstN = n;
  // stars: pulsar beams and collapsing stars stay hand-drawn; every other star goes to the star shader
  let m = 0;
  if (bodies.length * 16 > starInst.length) starInst = new Float32Array(bodies.length * 32);
  const si = starInst;
  for (const b of byDepth()) {
    if (b.kind !== 'star') continue;
    const X = toSX(b.x, b.y) * s, Y = toSY(b.x, b.y, b.z) * s, pl = b.type.kind === 'planet';
    let R = Math.max(b.R * zoom, pl && b.label ? 3 : 1.6) * s;
    let g = R * 5 + (isNS(b) ? 7 : 12) * s, far = false;
    if (b.real && !pl && !isNS(b) && R < 3.5 * s) { R = Math.max(R, 2.4 * s); g = 34 * s; far = true; }   // a star seen from across its own planetary system: a point, but by far the brightest thing
    if (isNS(b)) {
      sceneUsed = true;
      if (isMag(b)) drawMagField(X, Y, R, b);
      const ang = b.beamPh, L = Math.max(R * 9, 22 * s);
      sctx.lineWidth = Math.max(1, 1.2 * s);
      for (const sg of [1, -1]) {
        const ex = X + Math.cos(ang) * L * sg, ey = Y + Math.sin(ang) * L * sg * cosI;
        const lg = sctx.createLinearGradient(X, Y, ex, ey);
        lg.addColorStop(0, 'rgba(170,215,255,0.55)'); lg.addColorStop(1, 'rgba(170,215,255,0)');
        sctx.strokeStyle = lg; sctx.beginPath(); sctx.moveTo(X, Y); sctx.lineTo(ex, ey); sctx.stroke();
      }
    }
    if (X < -g || Y < -g || X > W + g || Y > H + g) continue;
    const t = b.type, o = m * 16;
    let col = b.col || t.col;
    let near = 1, far2 = 1, w = 1, pinch = 0, ang = 0, glow = g, disc = R, lit = (HDR ? t.glBright : 1) * (far ? (HDR ? 2.6 : 1) : 1);
    if (t.kind === 'planet') { // lit by the nearest star (face-on if there is none); freshly struck worlds glow
      let sun = null, bs = 0;
      for (const o2 of bodies) { if (o2.kind !== 'star' || o2.type.kind === 'planet' || o2 === b) continue; const q = Math.pow(o2.m, 3) / ((o2.x - b.x) ** 2 + (o2.y - b.y) ** 2 + (o2.z - b.z) ** 2 + 1e-9); if (q > bs) { bs = q; sun = o2; } }
      lit = sun ? 1 : 0;
      if (sun) ang = Math.atan2(-(toSY(sun.x, sun.y, sun.z) * s - Y), toSX(sun.x, sun.y) * s - X);
      pinch = b.hot ? Math.max(0, 1 - (wallNow - b.hot) / 30000) : 0;
      glow = R * 1.7 + 4 * s;
    } else if (b.sn) { disc = 0.001; }                 // drawn as a cutaway below; keep only its glow here
    else {
      const td = tideShape(b);
      if (td.str > 1.01 && b.hx != null) { near = td.near; far2 = td.far; w = td.w; pinch = td.pinch; ang = Math.atan2(-(toSY(b.hx, b.hy, b.hz) * s - Y), toSX(b.hx, b.hy) * s - X); }
    }
    si[o] = X; si[o + 1] = H - Y; si[o + 2] = disc; si[o + 3] = glow;
    si[o + 4] = col[0] / 255; si[o + 5] = col[1] / 255; si[o + 6] = col[2] / 255; si[o + 7] = ang;
    si[o + 8] = near; si[o + 9] = far2; si[o + 10] = w; si[o + 11] = pinch;
    si[o + 12] = t.surf[0]; si[o + 13] = t.surf[1]; si[o + 14] = (b.id * 7.31) % 97; si[o + 15] = lit;
    m++;
  }
  starInstN = m;
  sctx.globalCompositeOperation = 'source-over';
  for (const b of bodies) {
    if (b.kind !== 'star' || !b.sn) continue;
    sceneUsed = true;
    const X = toSX(b.x, b.y) * s, Y = toSY(b.x, b.y, b.z) * s, R = Math.max(b.R * zoom, 1.6) * s;
    drawCollapse(b, X, Y, R, snP(b));
  }
}

// A supernova: a blinding bloom, a fireball that grows and cools from white to deep red, and the light front
// racing outward at c (it is lensed like everything else on this canvas).
function drawSupernovaFlash(f, a, X, Y, W, H) {
  const s = RS, P = f.power, tw = (wallNow - f.t0) / 1000;
  const radial = (r, stops) => { const g = sctx.createRadialGradient(X, Y, 0, X, Y, r); for (const [o, c] of stops) g.addColorStop(o, c); sctx.fillStyle = g; sctx.fillRect(X - r, Y - r, 2 * r, 2 * r); };
  // bloom: the first half second washes out much of the screen
  if (tw < 0.6) {
    const k = (1 - tw / 0.6) ** 2 * Math.min(1, P), r = Math.max(W, H) * (0.35 + 0.45 * P);
    radial(r, [[0, `rgba(255,255,255,${0.95 * k})`], [0.25, `rgba(235,240,255,${0.45 * k})`], [1, 'rgba(220,230,255,0)']]);
  }
  // fireball: at least a good fraction of the screen, growing and cooling as it fades
  const base = Math.max(f.R * zoom * s * 3, Math.min(W, H) * 0.09 * P);
  const r = base * (1 + 3 * Math.pow(a, 0.6)), k = Math.pow(1 - a, 1.1) * Math.min(1, 0.5 + P);
  const cool = clamp(a * 1.8, 0, 1);
  const c0 = [255, 255 - 30 * cool, 245 - 170 * cool].map(Math.round).join(','), c1 = [255, 200 - 120 * cool, 120 - 90 * cool].map(Math.round).join(',');
  radial(r, [[0, `rgba(${c0},${0.95 * k})`], [0.3, `rgba(${c1},${0.55 * k})`], [0.7, `rgba(${c1},${0.18 * k})`], [1, `rgba(${c1},0)`]]);
  // the light front: a thin ring moving outward at the speed of light
  const rl = (simTime - f.st) * C * zoom * s;
  if (rl > 2 && rl < Math.hypot(W, H) * 1.2 && P > 0.5) {
    const al = 0.5 * Math.max(0, 1 - rl / (Math.hypot(W, H) * 1.2));
    sctx.strokeStyle = `rgba(255,248,230,${al})`; sctx.lineWidth = Math.max(1.5, 3 * s);
    sctx.beginPath(); sctx.ellipse(X, Y, rl, rl * Math.max(cosI, 0.15), 0, 0, Math.PI * 2); sctx.stroke();
  }
}
// GPU path: the same explosions as instances of the explosion shader (FS_FX), with the canvas version's timing, sizes and
// colours. The light is not clipped at 1 any more, so the hot cores get a gain (HDR only) the canvas could not show.
const FX_MAX = 12;   // explosions drawn at once
const fxInst = new Float32Array(FX_MAX * 3 * 20);
let fxN = 0, fxF = 0;
// stops: [offset, r, g, b, opacity] as on the canvas (colour 0-255), up to three, fading to nothing at 1. A ring (kind 1)
// takes one stop whose offset is its width in px.
function fxPut(X, Y, rx, ry, kind, stops, hot, hr, turb, seed) {
  const f = fxInst, o = fxN++ * 20;
  f.fill(0, o, o + 20);
  f[o] = X; f[o + 1] = scene.height - Y; f[o + 2] = rx; f[o + 3] = ry;
  stops.forEach((s, j) => { const k = s[4] / 255; f[o + 4 + 4 * j] = s[1] * k; f[o + 5 + 4 * j] = s[2] * k; f[o + 6 + 4 * j] = s[3] * k; });
  f[o + 7] = kind ? stops[0][0] : stops.length > 1 ? stops[1][0] : 1; f[o + 11] = stops.length > 2 ? stops[2][0] : 1;
  f[o + 15] = kind; f[o + 16] = hot; f[o + 17] = hr; f[o + 18] = turb; f[o + 19] = seed;
}
function packFlash(f, a, X, Y, W, H) {
  if (fxF >= FX_MAX) return;
  fxF++;
  const s = RS, seed = (f.t0 * 0.0137) % 61, tw = (wallNow - f.t0) / 1000, hot = Math.exp(-tw / 0.8);   // the cores blaze for the first second
  if (f.kind === 'sn') {   // drawSupernovaFlash: the bloom, the fireball, the light front
    const P = f.power;
    if (tw < 0.6) {
      const k = (1 - tw / 0.6) ** 2 * Math.min(1, P), r = Math.max(W, H) * (0.35 + 0.45 * P);
      fxPut(X, Y, r, r, 0, [[0, 255, 255, 255, 0.95 * k], [0.25, 235, 240, 255, 0.45 * k]], 12 * k, 0.06, 0, seed);
    }
    const base = Math.max(f.R * zoom * s * 3, Math.min(W, H) * 0.09 * P);
    const r = base * (1 + 3 * Math.pow(a, 0.6)), k = Math.pow(1 - a, 1.1) * Math.min(1, 0.5 + P), cool = clamp(a * 1.8, 0, 1);
    const c1 = [255, 200 - 120 * cool, 120 - 90 * cool];
    fxPut(X, Y, r, r, 0, [[0, 255, 255 - 30 * cool, 245 - 170 * cool, 0.95 * k], [0.3, ...c1, 0.55 * k], [0.7, ...c1, 0.18 * k]], 4 * k * hot * Math.min(1, P), 0.18, 0.5, seed);
    const rl = (simTime - f.st) * C * zoom * s, D = Math.hypot(W, H) * 1.2;
    if (rl > 2 && rl < D && P > 0.5) fxPut(X, Y, rl, rl * Math.max(cosI, 0.15), 1, [[Math.max(1.5, 3 * s), 255, 248, 230, 0.5 * (1 - rl / D)]], 2, 0, 0, 0);
    return;
  }
  // kilonovae, giant impacts, a magnetar flare's glow: blue-white cooling to orange, and a white flash at the start
  const R = Math.max((4 + 90 * Math.pow(a, 0.55)) * f.scale * zoom, 6) * s, k = clamp((a - 0.12) / 0.55, 0, 1);
  const col = [180 + 75 * k, 205 - 110 * k, 255 - 210 * k], al = Math.pow(1 - a, 1.6) * 0.9;
  fxPut(X, Y, R, R, 0, [[0, ...col, al], [0.45, ...col, al * 0.45]], 3 * hot, 0.25, 0, seed);
  if (a < 0.06) { const w = 1 - a / 0.06, R2 = R * 0.6; fxPut(X, Y, R2, R2, 0, [[0, 255, 255, 255, w]], 8 * w, 0.3, 0, seed); }
}
// cutaway of a collapsing star: the envelope turns translucent so the core is visible
function drawCollapse(b, X, Y, R, p) {
  const s = RS, coreMax = Math.max(R * 0.32, 5 * s), mode = b.sn.mode;
  if (mode === 'ia') { // the merged white dwarf heats up until carbon ignites, then a runaway burn
    const glowAt = (r, a, col) => {
      const g = sctx.createRadialGradient(X, Y, 0, X, Y, r);
      g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.5, `rgba(${col},${a * 0.4})`); g.addColorStop(1, `rgba(${col},0)`);
      sctx.fillStyle = g; sctx.fillRect(X - r, Y - r, 2 * r, 2 * r);
    };
    sctx.drawImage(starCore[b.type.id], X - R, Y - R, 2 * R, 2 * R);
    sctx.globalCompositeOperation = 'lighter';
    const q = clamp(p / SN_BREAK, 0, 1);
    glowAt(Math.max(R * (1.5 + 4 * q * q), 8 * s), 0.4 + 0.6 * q, q < 0.55 ? '220,232,255' : '255,246,215');
    sctx.globalCompositeOperation = 'source-over';
    return;
  }
  if (mode === 'pi' || mode === 'dc') {
    const glowAt = (r, a, col) => {
      const g = sctx.createRadialGradient(X, Y, 0, X, Y, r);
      g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.5, `rgba(${col},${a * 0.4})`); g.addColorStop(1, `rgba(${col},0)`);
      sctx.fillStyle = g; sctx.fillRect(X - r, Y - r, 2 * r, 2 * r);
    };
    if (mode === 'dc') { // the star darkens and shrinks as it falls into its own hole
      const q = clamp(p / SN_BREAK, 0, 1), Rn = R * (1 - 0.85 * q * q);
      sctx.globalAlpha = 1 - 0.8 * q; sctx.drawImage(starCore[b.type.id], X - Rn, Y - Rn, 2 * Rn, 2 * Rn); sctx.globalAlpha = 1;
      sctx.fillStyle = `rgba(0,0,0,${0.3 + 0.7 * q})`; sctx.beginPath(); sctx.arc(X, Y, Math.max(coreMax * 0.2, Rn * q * 0.9), 0, Math.PI * 2); sctx.fill();
      return;
    }
    // pair instability: the core softens and contracts, then the oxygen ignites all at once
    sctx.globalAlpha = 0.6; sctx.drawImage(starCore[b.type.id], X - R, Y - R, 2 * R, 2 * R); sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = 'lighter';
    if (p < 0.4) { const q = p / 0.4; glowAt(coreMax * (1 - 0.5 * q), 0.6 + 0.3 * q, '255,170,210'); }
    else { const q = clamp((p - 0.4) / (SN_BREAK - 0.4), 0, 1); glowAt(coreMax * 0.5 + (R * 1.1 - coreMax * 0.5) * Math.pow(q, 0.8), 0.7 + 0.3 * q, '255,246,225'); }
    sctx.globalCompositeOperation = 'source-over';
    return;
  }
  sctx.globalAlpha = p < 0.35 ? 1 - 0.45 * (p / 0.35) : 0.55;
  sctx.drawImage(starCore[b.type.id], X - R, Y - R, 2 * R, 2 * R);
  sctx.globalAlpha = 1;
  sctx.globalCompositeOperation = 'lighter';
  const glow = (r, a, col) => {
    const g = sctx.createRadialGradient(X, Y, 0, X, Y, r);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.5, `rgba(${col},${a * 0.4})`); g.addColorStop(1, `rgba(${col},0)`);
    sctx.fillStyle = g; sctx.fillRect(X - r, Y - r, 2 * r, 2 * r);
  };
  const ring = (r, w, a, col) => { sctx.strokeStyle = `rgba(${col},${a})`; sctx.lineWidth = Math.max(1, w); sctx.beginPath(); sctx.arc(X, Y, r, 0, Math.PI * 2); sctx.stroke(); };
  if (p < 0.35) { // the iron core falls in; the layers just above it chase it down
    const q = p / 0.35, cr = coreMax * (1 - 0.9 * q * q);
    glow(cr * 1.6, 0.9, '255,214,150');
    sctx.fillStyle = 'rgba(255,240,210,0.9)'; sctx.beginPath(); sctx.arc(X, Y, Math.max(cr * 0.55, 1.5 * s), 0, Math.PI * 2); sctx.fill();
    for (let k = 0; k < 28; k++) {
      const u = ((p * 9 + k / 28) % 1), ang = k * 2.39996, rr = cr + (R * 0.62 - cr) * (1 - u) ;
      sctx.fillStyle = `rgba(255,190,130,${0.25 + 0.6 * u})`;
      sctx.beginPath(); sctx.arc(X + Math.cos(ang) * rr, Y + Math.sin(ang) * rr, Math.max(1, 1.4 * s), 0, Math.PI * 2); sctx.fill();
    }
  } else if (p < 0.40) { // bounce: the core hits nuclear density and rebounds
    const q = (p - 0.35) / 0.05;
    glow(coreMax * (0.4 + 1.6 * q), 1 - 0.5 * q, '255,255,255');
    ring(coreMax * (0.08 + 0.6 * q), 3 * s, 0.95, '255,250,235');
  } else if (p < 0.55) { // the shock stalls; neutrinos from the newborn neutron star heat the gas behind it
    const jit = Math.sin(wallNow * 0.05) * 0.04 + Math.sin(wallNow * 0.031) * 0.03;
    glow(coreMax * 0.66, 0.35, '170,200,255');
    sctx.fillStyle = 'rgba(225,240,255,1)'; sctx.beginPath(); sctx.arc(X, Y, Math.max(2 * s, coreMax * 0.07), 0, Math.PI * 2); sctx.fill();
    ring(coreMax * (0.68 + jit), 2.5 * s, 0.85, '255,236,200');
  } else { // revived, the shock races out to the surface
    const q = (p - 0.55) / (SN_BREAK - 0.55), r = coreMax * 0.68 + (R - coreMax * 0.68) * Math.pow(q, 1.4);
    glow(r, 0.25 + 0.35 * q, '255,226,170');
    sctx.fillStyle = 'rgba(225,240,255,1)'; sctx.beginPath(); sctx.arc(X, Y, Math.max(2 * s, coreMax * 0.07), 0, Math.PI * 2); sctx.fill();
    ring(r, (2.5 + 3 * q) * s, 0.9, '255,244,220');
  }
  sctx.globalCompositeOperation = 'source-over';
}
const bhU = new Float32Array(64), bhU2 = new Float32Array(64), bhU3 = new Float32Array(64), bhU4 = new Float32Array(64);
// Exact Kerr shadow (Bardeen 1973): trace the rim of spherical photon orbits as seen from inclination i,
// then store it as a short Fourier series r(θ) about its centre. Cached per (spin, angle).
const shadowCache = new Map();
function kerrShadow(chi, incDeg) {
  const a = Math.min(0.995, Math.round(Math.abs(chi) * 200) / 200);
  const inc = Math.max(2, Math.round(incDeg));
  if (a < 0.01) return { shift: 0, c: [Math.sqrt(27), 0, 0, 0, 0] };
  const key = a + '|' + inc;
  const hit = shadowCache.get(key); if (hit) return hit;
  const i = inc * Math.PI / 180, si = Math.sin(i), ci = Math.cos(i), cot2 = (ci / si) ** 2;
  const r1 = 2 * (1 + Math.cos(2 / 3 * Math.acos(-a))), r2 = 2 * (1 + Math.cos(2 / 3 * Math.acos(a)));
  const pts = []; let xmin = Infinity, xmax = -Infinity;
  for (let k = 0; k < 900; k++) {
    const r = r1 + (r2 - r1) * k / 899;
    const xi = (r * r * (3 - r) - a * a * (r + 1)) / (a * (r - 1));
    const eta = r ** 3 * (4 * a * a - r * (r - 3) ** 2) / (a * a * (r - 1) ** 2);
    const b2 = eta + a * a * ci * ci - xi * xi * cot2;
    if (b2 < 0) continue;
    const x = xi / si; pts.push([x, Math.sqrt(b2)]); xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
  }
  let res;
  if (pts.length < 8) res = { shift: 0, c: [Math.sqrt(27), 0, 0, 0, 0] };
  else {
    const cx = (xmin + xmax) / 2;
    const pol = pts.map(([x, y]) => [Math.atan2(y, x - cx), Math.hypot(x - cx, y)]).sort((p, q) => p[0] - q[0]);
    pol.unshift([0, pol[0][1]]); pol.push([Math.PI, pol[pol.length - 1][1]]);
    const NG = 181, c = [0, 0, 0, 0, 0]; let j = 0;
    for (let g = 0; g < NG; g++) {
      const th = Math.PI * g / (NG - 1);
      while (j < pol.length - 2 && pol[j + 1][0] < th) j++;
      const [t0, v0] = pol[j], [t1, v1] = pol[j + 1];
      const rv = t1 > t0 ? v0 + (v1 - v0) * (th - t0) / (t1 - t0) : v0;
      const w = (g === 0 || g === NG - 1) ? 0.5 : 1;
      for (let n = 0; n < 5; n++) c[n] += w * rv * Math.cos(n * th);
    }
    const dth = Math.PI / (NG - 1);
    c[0] *= dth / Math.PI; for (let n = 1; n < 5; n++) c[n] *= 2 * dth / Math.PI;
    res = { shift: cx, c };
  }
  shadowCache.set(key, res);
  return res;
}
// which way the gas round a hole orbits: +1 counter-clockwise on screen (also with no gas), -1 clockwise
function diskSense(h) {
  const R2 = (40 * rsOf(h.m)) ** 2; let L = 0;
  for (let i = 0; i < gN; i++) { const dx = gx[i] - h.x, dy = gy[i] - h.y; if (dx * dx + dy * dy < R2) L += gm[i] * (dx * (gvy[i] - h.vy) - dy * (gvx[i] - h.vx)); }
  return L > 0 ? -1 : 1;
}
function composite() {
  if (glLost) return;   // nothing to draw with until the browser restores the context
  const W = view.width, H = view.height, s = RS;
  const bh = bhList().slice(0, 16);
  if (gl) {
    const tri = () => { gl.bindVertexArray(GLR.triVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    const target = (t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null); gl.viewport(0, 0, t ? t.w : W, t ? t.h : H); };
    const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
    const T = GLR.tg;
    // 1. base: sky, then the 2D effects canvas (only uploaded on frames that drew something), then explosions and stars
    if (sceneUsed) {
      bind(1, GLR.sceneTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    target(T.base); gl.disable(gl.BLEND);
    let P = GLR.base; gl.useProgram(P.p);
    bind(0, GLR.skyTex); bind(1, GLR.sceneTex);
    gl.uniform1i(P.u.uSky, 0); gl.uniform1i(P.u.uScene, 1);
    gl.uniform2f(P.u.uRes, W, H); gl.uniform4fv(P.u.uSkyT, GLR.skyT); gl.uniform1f(P.u.uHasScene, sceneUsed ? 1 : 0);
    gl.uniform1f(P.u.uSkyK, realSizes && PRESETS[currentPreset] && PRESETS[currentPreset].orbits ? 0.5 : 1);   // planetary scenes: let the worlds outshine the backdrop
    tri();
    const instances = (I, data, n, stride) => {
      gl.bindVertexArray(I.vao); gl.bindBuffer(gl.ARRAY_BUFFER, I.buf);
      if (I.cap < data.length) { gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); I.cap = data.length; }
      else gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * stride);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    };
    gl.enable(gl.BLEND);
    if (fxN) {   // explosions, added as light under the stars (as the canvas was): in HDR their cores go far above 1, before the lens and bloom
      P = GLR.fx; gl.useProgram(P.p); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform2f(P.u.uRes, W, H); gl.uniform1f(P.u.uT, wallNow / 1000); gl.uniform1f(P.u.uDetail, GFX.surface ? 1 : 0); gl.uniform1f(P.u.uHDR, HDR ? 1 : 0);
      instances(GLR.fxI, fxInst, fxN, 20);
    }
    if (starInstN) {
      P = GLR.star; gl.useProgram(P.p); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(P.u.uRes, W, H); gl.uniform1f(P.u.uT, wallNow / 1000); gl.uniform1f(P.u.uDetail, GFX.surface ? 1 : 0);
      instances(GLR.starI, starInst, starInstN, 16);
    }
    // 2. gas, additive, in its own layer
    target(T.gas); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (gasInstN) {
      P = GLR.gasP; gl.useProgram(P.p); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform2f(P.u.uRes, W, H);
      instances(GLR.gasI, gasInst, gasInstN, 8);
    }
    gl.disable(gl.BLEND);
    // 3. lensing
    target(T.lens);
    P = GLR.lensP; gl.useProgram(P.p); const U = P.u;
    bind(0, T.base.tex); bind(1, T.gas.tex);
    gl.uniform1i(U.uTex, 0); gl.uniform1i(U.uGas, 1);
    gl.uniform1f(U.uTrace, 1);
    bhU.fill(0); bhU2.fill(0); bhU3.fill(0); bhU4.fill(0);
    bh.forEach((b, i) => {
      bhU[i * 4] = toSX(b.x, b.y) * s; bhU[i * 4 + 1] = H - toSY(b.x, b.y, b.z) * s; bhU[i * 4 + 2] = rsOf(b.m) * zoom * s;
      let amp = 0, ph = 0;
      if (b.ring) { const t = simTime - b.ring.t0; amp = b.ring.A0 * Math.exp(-t / b.ring.tau); ph = b.ring.phi0 + b.ring.w * t; }
      bhU[i * 4 + 3] = amp; bhU2[i * 4] = ph + 2 * yaw; bhU2[i * 4 + 1] = clamp(b.feedRate * 160, 0, 1); bhU2[i * 4 + 2] = b.chi;
      const sh = kerrShadow(b.chi, tiltDeg), sg = diskSense(b), a = Math.min(Math.abs(b.chi), 0.998);
      bhU3.set(sh.c.slice(0, 4), i * 4); bhU4[i * 4] = sh.c[4]; bhU4[i * 4 + 1] = sh.shift;
      bhU2[i * 4 + 3] = sg; bhU4[i * 4 + 2] = riscoM(clamp(b.chi * sg, -0.998, 0.998)); bhU4[i * 4 + 3] = 1 + Math.sqrt(1 - a * a);
    });
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1i(U.uN, bh.length);
    gl.uniform4fv(U.uBH, bhU); gl.uniform4fv(U.uBH2, bhU2); gl.uniform4fv(U.uBH3, bhU3); gl.uniform4fv(U.uBH4, bhU4);
    gl.uniform1f(U.uLens, opt.lens ? 1 : 0);
    gl.uniform2f(U.uIncl, sinI, cosI);
    if (opt.waves && gwSrc) {
      const cpx = C * zoom * s, gain = 5 * s;
      const cx = toSX(gwSrc.cx, gwSrc.cy) * s, cy = H - toSY(gwSrc.cx, gwSrc.cy) * s;
      if (gwSrc.mode === 'binary') {
        gl.uniform4f(U.uGWa, cx, cy, cpx, 1);
        gl.uniform4f(U.uGWb, 0, gwSrc.phi + yaw, gwSrc.om, 0);
        gl.uniform4f(U.uGWc, 0, 1, gwSrc.vis * gain, 0);
        gl.uniform1f(U.uGWr0, Math.max(gwSrc.sep * zoom * s, 40 * s));
      } else {
        const rem = bodies.find(b => b.id === gwSrc.remId);
        gl.uniform4f(U.uGWa, cx, cy, cpx, 1);
        gl.uniform4f(U.uGWb, simTime - gwSrc.tm, gwSrc.phi + yaw, gwSrc.om, 1);
        gl.uniform4f(U.uGWc, gwSrc.wq, gwSrc.tau, gwSrc.vis * gain, gwSrc.visR * gain);
        gl.uniform1f(U.uGWr0, Math.max((rem ? rsOf(rem.m) * 6 : 30) * zoom * s, 40 * s));
      }
    } else gl.uniform4f(U.uGWa, 0, 0, 1, 0);
    tri();
    // 4. bloom: shrink the bright parts down a pyramid, then add the levels back up
    const B = GLR.bloom, bloomOn = opt.bloom;
    if (bloomOn) {
      P = GLR.down; gl.useProgram(P.p); gl.uniform1i(P.u.uTex, 0);
      let srcT = T.lens;
      for (let i = 0; i < Q.bloom; i++) {
        target(B[i]); bind(0, srcT.tex);
        gl.uniform2f(P.u.uTexel, 1 / srcT.w, 1 / srcT.h); gl.uniform1f(P.u.uPre, i === 0 ? 1 : 0);
        tri(); srcT = B[i];
      }
      P = GLR.up; gl.useProgram(P.p); gl.uniform1i(P.u.uTex, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = Q.bloom - 1; i > 0; i--) {
        target(B[i - 1]); bind(0, B[i].tex);
        gl.uniform2f(P.u.uTexel, 1 / B[i].w, 1 / B[i].h); gl.uniform2f(P.u.uOut, B[i - 1].w, B[i - 1].h);
        tri();
      }
      gl.disable(gl.BLEND);
    }
    // 5. tone map, to the screen or (with anti-aliasing) to an 8-bit picture that 6. smooths onto the screen
    const aa = GFX.aa && T.ldr;
    target(aa ? T.ldr : null);
    P = GLR.fin; gl.useProgram(P.p);
    bind(0, T.lens.tex); bind(1, B[0].tex);
    gl.uniform1i(P.u.uTex, 0); gl.uniform1i(P.u.uBloom, 1);
    gl.uniform2f(P.u.uRes, W, H); gl.uniform1f(P.u.uBloomK, bloomOn ? 1 : 0); gl.uniform1f(P.u.uDither, aa ? 0 : 1);
    tri();
    if (aa) {
      target(null);
      P = GLR.fxaa; gl.useProgram(P.p);
      bind(0, T.ldr.tex); gl.uniform1i(P.u.uTex, 0); gl.uniform2f(P.u.uRes, W, H);
      tri();
    }
  } else {
    vctx.setTransform(1, 0, 0, 1, 0, 0); vctx.drawImage(scene, 0, 0);
    for (const b of bh) {
      const X = toSX(b.x, b.y) * s, Y = toSY(b.x, b.y, b.z) * s, R = 2.598 * rsOf(b.m) * zoom * s;
      vctx.fillStyle = '#000'; vctx.beginPath(); vctx.arc(X, Y, R, 0, Math.PI * 2); vctx.fill();
      vctx.strokeStyle = 'rgba(255,205,150,0.55)'; vctx.lineWidth = Math.max(1, R * 0.08); vctx.stroke();
    }
  }
}

