/* ---------- test hook ----------
   Only with ?rdtest in the address: the automated tests (tests/) reach the physics through window.__rd. load() and
   step() run a scene on a fixed clock with a fixed frame time, so the same calls play out the same scene. */
const rdPin = [3200, MAT0];
if (/[?&]rdtest(=|&|$)/.test(location.search)) window.__rd = {
  riscoM, eIsco, rocheFrac, ringFor, remnantFit, wdRadius, M_CH, KR, KM_PER_UNIT, SIM2REAL,
  presets: Object.keys(PRESETS), makeBH, makeStar, mergeWhiteDwarfs, snapshot, restore, encodeState, decodeState, rand, reseed,
  get seed() { return rngS; },
  get bodies() { return bodies; }, get gN() { return gN; }, get qN() { return qN; }, get simTime() { return simTime; }, get gl() { return gl; }, get glLost() { return glLost; },
  get opt() { return opt; }, get glr() { return GLR; }, get gfx() { return GFX; }, get wallNow() { return wallNow; }, kerrShadow, addGas,
  events, eventHooks, frameHooks, sceneHooks, rewindHooks, logEvent, rewound,
  graphs: graphsApi, ageStar,   // the light curve, mass and HR series, and the panel (graphs.js); aging a star
  timeline: tlHook,   // rewind: capture, go back, inspect the history, fingerprint the whole simulation
  jetPower, jetShape, packJets, jetInst,   // jets: their power and shape, and the instances the GPU draws
  explode, nova, magnetarFlare, addKilonova, flashes, scene, get fxN() { return fxN; },   // explosions: set one off, those in flight, the 2D effects canvas
  add(...bs) { bodies.push(...bs); computeAccel(); },
  // camera for the rendering tests: { x, y, zoom, tilt, yaw, follow: body id }; without follow the camera stays put
  view(o) {
    if (o.tilt != null) setTilt(o.tilt); if (o.yaw != null) setYaw(o.yaw); if (o.zoom != null) zoom = o.zoom;
    if (o.x != null) { camX = o.x; camY = o.y; }
    followId = o.follow == null ? null : o.follow; opt.follow = o.follow != null; syncToggles();
    return { zoom, W: view.width, H: view.height, RS };
  },
  render() { drawScene(); composite(); },   // draw the current state again without advancing the simulation
  prep() { manual = true; speedIdx = 2; frameN = 0; mcDt = 0; mcWall = 0; mcHeavy = true; last = wallNow = 1e5; gasCap = rdPin[0]; matCap = rdPin[1]; },
  load(id, seed) { this.prep(); loadPreset(id, seed); },
  // challenges: start one on the same fixed clock as load(); state is null in free play
  chal: {
    get list() { return CHAL.map(d => ({ id: d.id, t: d.t, lvl: d.lvl, goal: d.goal })); },
    start(id, seed) { window.__rd.prep(); return chalStart(id, seed); },
    stop() { chalStop(); },
    get state() { return chal ? { id: chal.def.id, won: chal.won, text: chal.text, p: chal.p } : null; },
    get hooked() { return { frame: frameHooks.includes(chalFrame), event: eventHooks.includes(chalEvent) }; },
    get done() { return Object.assign({}, chalDone); },
    check: () => chalFrame,   // the per-frame check itself, for timing it
  },
  open(st) { this.load('empty', 0); restore(st); },   // like a fresh page opening a share link
  step(n, ms = 1000 / 60, draw = true) {   // frame-time governor held still
    manual = true; simOnly = !draw; try { for (let i = 0; i < n; i++) { gasCap = rdPin[0]; matCap = rdPin[1]; frameBody(last + ms); } } finally { simOnly = false; }
    // wait for the GPU to finish drawing them: otherwise a page opened next queues behind seconds of software rendering
    if (draw && gl && !gl.isContextLost()) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  },
  budget(g, m) { if (g != null) rdPin[0] = g; if (m != null) rdPin[1] = m; return rdPin.slice(); },   // the budgets load() and step() hold the governor at
  get caps() { return { MAXG, MAXM, BODY_CAP, MAT0, gasMax: Q.gas, matMax: Q.mat, gasCap, matCap, qScale }; },
  set speed(i) { speedIdx = i; },
  govern(ms, n = 1) { for (let i = 0; i < n; i++) govern(ms); return [gasCap, matCap]; },   // feed the governor made-up frame times
  addMatter, stepGas, stepMatter, matterCollective, ringFrom, planetImpact, setCircular,
  feedRings: (tid, hostM) => feedRings(TYPE[tid], hostM),
  // n cells clumped like a disk: the tree's pull on each against the every-pair sum, and the time each took
  treeCheck(n) {
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    while (clCap < n) growCells();
    for (let c = 0; c < n; c++) { const d = 50 * Math.pow(r(), 2), a = 6.2832 * r(); clX[c] = d * Math.cos(a); clY[c] = d * Math.sin(a); clM[c] = 1e-6 * (0.1 + r()); clH[c] = 0.05 * (1 + d); clAX[c] = clAY[c] = 0; }
    const t0 = performance.now();
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { const dx = clX[b] - clX[a], dy = clY[b] - clY[a], e = 0.5 * (clH[a] + clH[b]), r2 = dx * dx + dy * dy + e * e, k = G / (r2 * Math.sqrt(r2)); clAX[a] += k * clM[b] * dx; clAY[a] += k * clM[b] * dy; clAX[b] -= k * clM[a] * dx; clAY[b] -= k * clM[a] * dy; }
    const t1 = performance.now(), ex = clAX.slice(0, n), ey = clAY.slice(0, n);
    cellTree(n);
    const t2 = performance.now();
    let e2 = 0, a2 = 0, dmax = 0; const rel = [];
    for (let c = 0; c < n; c++) { const d = Math.hypot(clAX[c] - ex[c], clAY[c] - ey[c]), a = Math.hypot(ex[c], ey[c]); e2 += d * d; a2 += a * a; dmax = Math.max(dmax, d); rel.push(d / a); }
    rel.sort((a, b) => a - b);
    return { rms: Math.sqrt(e2 / a2), p99: rel[Math.floor(0.99 * n)], worst: dmax / Math.sqrt(a2 / n), direct: t1 - t0, tree: t2 - t1 };   // worst: largest error over the rms pull
  },
  // what a person does with the interface, through the same code the interface runs (for the challenge proofs):
  // place() is a click (or a drag of dx, dy screen pixels) with an object picked in the bar; act() presses an inspector
  // button; edit() is the inspector's Edit → Set; pour() holds the Matter tool down at a world point for n frames
  place(id, wx, wy, o = {}) {
    if (o.mass != null) bhMass = o.mass; if (o.spin != null) bhSpin = o.spin;
    setTool(id); const sx = toSX(wx, wy) - shX, sy = toSY(wx, wy, 0) - shY, n = bodies.length;   // the spot under the pointer (no camera shake)
    commitPlace(sx, sy, sx + (o.dx || 0), sy + (o.dy || 0)); setTool('move');
    return bodies.length > n ? bodies[bodies.length - 1] : null;
  },
  act(b, what) { if (what === 'sn') startSupernova(b); else if (what === 'age') ageStar(b); },
  edit(b, m, chi) { applyEdit(b, m, chi); },
  pour(wx, wy, rate, n, ms = 1000 / 60) { matterRate = rate; setTool('matter'); drag = { mode: 'spray', x: toSX(wx, wy) - shX, y: toSY(wx, wy, 0) - shY }; try { this.step(n, ms, false); } finally { drag = null; setTool('move'); } },
  set gw(v) { gwBoost = v; },
  get speedIdx() { return speedIdx; },
  state() {
    const f = (a, n) => Array.from(a.subarray(0, n));
    return { t: simTime, b: bodies.map(b => [b.kind, b.type ? b.type.id : '', b.m, b.x, b.y, b.vx, b.vy, b.chi || 0, b.R || 0, b.spinHz || 0]),
      g: [f(gx, gN), f(gy, gN), f(gvx, gN), f(gvy, gN), f(gm, gN)], q: [f(qx, qN), f(qy, qN), f(qvx, qN), f(qvy, qN), f(qm, qN)] };
  },
};
requestAnimationFrame(t => { last = t; wallNow = t; frame(t); });
