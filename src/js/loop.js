/* ================= loop ================= */
let last = performance.now(), frameN = 0, workMs = 8, frameSim = 0;
let loopErr = false, manual = false, simOnly = false;   // manual: the test hook is stepping frames itself (simOnly: without drawing them)
// Frame-time governor: shrink the gas and matter budgets on slow devices, grow them back when there is headroom.
// Between 10 and 20 ms of work a frame both hold still, so they settle instead of hunting.
function govern(ms) {
  workMs += (ms - workMs) * 0.1;
  if (workMs > 20) { gasCap = Math.max(900, gasCap * 0.985); matCap = Math.max(MAT0, matCap * 0.985); }
  else if (workMs < 10) { gasCap += 8; matCap += 16; }
  gasCap = Math.min(gasCap, Q.gas); matCap = Math.min(matCap, Q.mat);   // the quality setting's ceilings
}
function frame(now) {
  if (!manual) try { frameBody(now); }
  catch (err) { if (!loopErr) { loopErr = true; console.error('Ringdown frame error', err); toast('Something glitched', ['A frame hit an error and was skipped; the simulation keeps running']); } }
  requestAnimationFrame(frame);
}
function frameBody(now) {
  const wallDt = Math.min(0.05, (now - last) / 1000); last = now; frameN++; wallNow = now;
  let target = 1;
  updateGrowth();
  if (wallNow < tdeSlowUntil) target = Math.min(target, tdeSlow);
  if (closeUpId != null) { // slow down as the star nears the point of no return, so the stretching is watchable
    const b = bodies.find(o => o.id === closeUpId);
    if (!b) closeUpId = null;
    else if (b.f > 0.85) target = Math.min(target, 0.12);
  }
  if (opt.slow) {
    const pair = closestPair();
    if (pair && pair[2] < 1.35 * mergeDist(pair[0], pair[1])) target = 0.07;
    if (simTime < slowHoldUntil) target = 0.07;
  }
  slow += (target - slow) * Math.min(1, (target < slow ? 4 : 0.9) * wallDt);
  $('slow').hidden = slow > 0.85;
  if (!$('slow').hidden) $('slow').textContent = `slow-mo ${slow < 0.1 ? '1/' + Math.round(1 / slow) : slow.toFixed(2)}×`;

  const tWork = performance.now();
  navStep(now);
  if (drag && drag.mode === 'spray') sprayMatter(drag.x, drag.y, wallDt);
  if (paused) frameSim = 0;
  if (!paused) {
    for (const b of bodies) { b.fedFrame = 0; if (b.kind === 'bh') updateKerr(b); }
    for (const b of bodies) if (isMag(b) && wallNow > (b.flareAt || 0) && !b.sn) magnetarFlare(b);
    for (const b of bodies) if (isNS(b)) b.beamPh += (1.5 + 3.2 * Math.log10(1 + b.spinHz)) * wallDt;
    // advance bodies and gas together in short chunks so fast-moving accretors (neutron stars) never outrun their own gas
    const want = wallDt * SPEEDS[speedIdx] * slow * warp;
    // (a scene of only stars, planets and loose matter needs far fewer: its integrator takes its own substeps)
    const plain = gN === 0 && bodies.length > 3 && bodies.every(b => b.kind === 'star' && !isCompact(b));
    const chunk = (plain ? 0.25 : gN > 0 && bodies.some(b => isNS(b) || isWD(b)) ? 0.004 : 0.02) * warp;
    plainBudget = zOn ? 1200 : 1600;   // a 3D step costs about a third more: the same time budget
    const K = clamp(Math.ceil(want / chunk), 1, 40);
    let simDt = 0;
    frameSim = 0;
    for (let k = 0; k < K; k++) {
      const d = stepBodies(want / K);
      stepGas(d); stepMatter(d); stellarProcesses(d); simDt += d;
      if (breakFrame) { breakFrame = false; break; }
    }
    frameSim = simDt;
    // the matter's own gravity and sticking are slow processes: every third frame is plenty
    mcDt += simDt; mcWall += wallDt;
    if (frameN % (mcHeavy ? 3 : 12) === 0) { matterCollective(mcDt, mcWall); mcDt = 0; mcWall = 0; }   // light belts: less often still
    planetTides(simDt); planetPairs(); if (frameN % 30 === 0) nameTheMoon();
    // smoothed rate of mass change for the inspector (per second of sim time)
    for (const b of bodies) {
      if (b.mPrev == null || simDt <= 0) { b.mPrev = b.m; b.mRate = b.mRate || 0; continue; }
      const inst = (b.m - b.mPrev) / (simDt / warp); b.mPrev = b.m;
      b.mRate = (b.mRate || 0) + (inst - (b.mRate || 0)) * Math.min(1, wallDt * 2.5);
    }
    for (const b of bodies.slice()) if (b.sn && snP(b) >= SN_BREAK) explode(b);
    while (windQueue.length) { const h = windQueue.shift(); toast('Disk wind', [`Gas near the ${h.kind === 'bh' ? fmtM(h.m) + ' M☉ hole' : 'neutron star'} glows so hard its own light blows part of it away`, 'The faint spray heading outward is stolen gas that will never be eaten'], 'w'); }
    while (novaQueue.length) nova(novaQueue.shift());
    while (mspQueue.length) { const ns = mspQueue.shift(); toast('Millisecond pulsar', [`Accretion spun the neutron star up to ${Math.round(ns.spinHz)} turns per second (period ${(1000 / ns.spinHz).toFixed(1)} ms)`, 'This is how most millisecond pulsars are thought to form: “recycled” by a companion'], 'w'); }
    for (const ns of bodies.filter(isNS)) if (ns.m > 2.3) { // accretion-induced collapse
      const bhn = makeBH(ns.x, ns.y, ns.vx, ns.vy, ns.m, Math.min(0.7, ns.spinHz / 1000)); bhn.z = ns.z; bhn.vz = ns.vz;
      bodies = bodies.filter(o => o !== ns); bodies.push(bhn);
      toast('Collapse to a black hole', [`The neutron star grew to ${fmtM(ns.m)} M☉, past the ~2.3 M☉ limit, and collapsed`]);
    }
    for (const b of bodies) {
      if (isAccretor(b) && simDt > 0) { const ts = simDt / warp; b.feedRate = (b.feedRate || 0) + ((b.fedFrame || 0) / ts - (b.feedRate || 0)) * Math.min(1, ts * 1.5); }
      if (b.kind === 'bh') {
        updateKerr(b);
        if (b.ring && simTime - b.ring.t0 > 12 * b.ring.tau) b.ring = null;
      }
      if (opt.trails && frameN % trailEvery === 0 && !(landmarks && b.label)) { b.trail.push(zOn ? [b.x, b.y, b.z] : [b.x, b.y]); if (b.trail.length > 260) b.trail.shift(); }
    }
  }
  updateGW();
  updateAudio();
  if (followId != null) { // the followed object merged, was swallowed or was shredded: follow whatever took its place
    const b = bodies.find(o => o.id === followId);
    if (b) followPos = [b.x, b.y, b.z];
    else {
      let best = null, bd = Infinity;
      if (followPos) for (const o of bodies) { const d = (zOn ? Math.hypot(o.x - followPos[0], o.y - followPos[1], o.z - followPos[2]) : Math.hypot(o.x - followPos[0], o.y - followPos[1])) / Math.sqrt(o.m); if (d < bd) { bd = d; best = o; } }
      followId = best ? best.id : null; followPos = best ? [best.x, best.y, best.z] : null;
    }
  }
  if (closeUpId != null) { // ease the zoom in until the star fills a good part of the screen
    const b = bodies.find(o => o.id === closeUpId);
    if (b) { const zt = Math.min(vw, vh) * 0.11 / Math.max(b.R, 1e-9); zoom *= Math.pow(zt / zoom, Math.min(1, 2 * wallDt)); }
  } else if (closeUpDrift) { // after it's torn apart, drift with the debris and pull back out
    const t = (wallNow - closeUpDrift.t0) / 1000;
    if (t > 4) closeUpDrift = null;
    else { opt.follow = false; camX += closeUpDrift.vx * frameSim; camY += closeUpDrift.vy * frameSim; zoom *= Math.pow(0.35, Math.min(1, wallDt / 2)); }
  }
  if (opt.follow && bodies.length) {
    // carry the camera along with the target's own motion, then ease out any remaining offset
    const c = com(); const k = Math.min(1, 2.5 * wallDt);
    camX += c.vx * frameSim; camY += c.vy * frameSim;
    camX += (c.x - camX) * k; camY += (c.y - camY) * k;
    if (zOn) { camZ += c.vz * frameSim; camZ += (c.z - camZ) * k; }
  }
  { const t = wallNow - shake; const amp = reduceMotion || t > 700 ? 0 : 7 * (1 - t / 700) ** 2; shX = (Math.random() - 0.5) * 2 * amp; shY = (Math.random() - 0.5) * 2 * amp; }
  for (const f of frameHooks) f(frameSim, wallDt);
  if (!simOnly) { drawScene(); composite(); drawOverlay(); drawScope(); }
  if (shotWant || rec) capFrame();   // same task as the draw: the view's buffer is still there to read
  renderMoveCtx(false);
  updateInspect();
  govern(performance.now() - tWork);
  perfTick(now);   // frame-rate readout, and Auto quality's render-scale steps
  if (frameN % 8 === 0) {
    let nb = 0, ns = 0, mb = 0;
    for (const b of bodies) { if (b.kind === 'bh') { nb++; mb += b.m; } else ns++; }
    $('fgw').textContent = fgwText;
    $('readouts').innerHTML = `<span><b>${nb}</b> holes · <b>${ns}</b> stars · <b>${gN}</b> gas${qN ? ` · <b>${qN}</b> matter` : ''}</span><span>M<sub>BH</sub> <b>${fmtM(mb)}</b> M☉</span><span>fed <b>${totalFed.toFixed(3)}</b> · blown out <b>${totalWind.toFixed(3)}</b> M☉</span><span>view <b>${fmtDist(vw / zoom * KM_PER_UNIT)}</b></span><span>1 s = <b>${fmtSec(SPEEDS[speedIdx] * slow * warp * SIM2REAL)}</b> real</span>`;
  }
}

resize();
setTool('move');
toolsEdges();
drawGizmo();
syncPlay(); syncToggles();
