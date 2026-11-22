/* ================= input ================= */
const pointers = new Map();
function commitPlace(sx, sy, ex, ey) {
  if (bodies.length >= 48) { toast('Too crowded', ['48 objects is the limit; clear some space first']); return; }
  const [wx, wy] = toW(sx, sy), isBH = tool === 'bh';
  const body = isBH ? makeBH(wx, wy, 0, 0, bhMass, bhSpin) : makeStar(tool, wx, wy, 0, 0);
  for (const b of bhList()) if (sepOf(body, b) < 2.8 * rsOf(b.m) + (isBH ? rsOf(body.m) * 2.6 : body.R)) { toast('Too close', ['Drop it outside the horizon']); return; }
  const pv = placementVelocity(wx, wy, ex - sx, ey - sy);
  if (pv.circular) { if (pv.host) setCircular(pv.host, body); }
  else { body.vx = pv.vx; body.vy = pv.vy; }
  bodies.push(body); placed.push(body.id);
  sfx('place', wx, wy);
  if (!isBH) reached('place');
  computeAccel();
}
ui.addEventListener('contextmenu', e => e.preventDefault());
const ORBIT_K = 0.006; // radians of view per pixel dragged
function orbitBy(dx, dy) { setYaw(yaw - dx * ORBIT_K); setTilt(tiltDeg + dy * ORBIT_K * 57.3 * 0.9); reached('tilt'); }
function pickAt(sx, sy) {
  let best = null, bd = 1;
  for (const b of byDepth()) {   // nearest last, so where two overlap exactly the one in front wins
    const X = toSX(b.x, b.y), Y = toSY(b.x, b.y, b.z);
    const R = b.kind === 'bh' ? 2.598 * rsOf(b.m) * zoom : Math.max(b.R * zoom, 1.6);
    const d = Math.hypot(X - sx, Y - sy) / Math.max(16, R + 8);
    if (d <= bd && (d < bd || zOn)) { bd = d; best = b; }
  }
  return best;
}
ui.addEventListener('pointerdown', e => {
  ui.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    drag = { mode:'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), a0: Math.atan2(b.y - a.y, b.x - a.x), z0: zoom, yaw0: yaw, w: toW(cx, cy) };
    return;
  }
  if (pointers.size > 2) return;
  const p = { lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
  if (e.button === 2 || e.shiftKey || e.ctrlKey) { drag = { mode:'orbit', ...p }; ui.style.cursor = 'move'; }
  else if (tool === 'move' || photo || e.button === 1) { drag = { mode:'pan', ...p }; ui.style.cursor = 'grabbing'; }
  else if (tool === 'matter') drag = { mode:'spray', x: e.clientX, y: e.clientY };
  else drag = { mode:'place', sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY };
});
ui.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') hover = { x: e.clientX, y: e.clientY };
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!drag) return;
  if (drag.mode === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    zoom = clamp(drag.z0 * Math.hypot(a.x - b.x, a.y - b.y) / drag.d0, 1e-12, 30);
    setYaw(drag.yaw0 + Math.atan2(b.y - a.y, b.x - a.x) - drag.a0);  // two-finger twist turns the view
    if (!opt.follow) { const o = scrOff(cx - vw / 2, cy - vh / 2 - camZ * sinI * zoom); camX = drag.w[0] - o[0]; camY = drag.w[1] - o[1]; }
    return;
  }
  if (drag.mode === 'place') { drag.ex = e.clientX; drag.ey = e.clientY; return; }
  if (drag.mode === 'spray') { drag.x = e.clientX; drag.y = e.clientY; return; }
  const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly; drag.lx = e.clientX; drag.ly = e.clientY;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) {
    drag.moved = true;
    if (drag.mode === 'pan') { opt.follow = false; syncToggles(); }
  }
  if (!drag.moved) return;
  if (drag.mode === 'orbit') orbitBy(dx, dy);
  else if (drag.mode === 'pan') { const o = scrOff(dx, dy); camX -= o[0]; camY -= o[1]; }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return;
  if (drag.mode === 'place' && e.type === 'pointerup' && pointers.size === 0) commitPlace(drag.sx, drag.sy, drag.ex, drag.ey);
  if (drag.mode === 'pan' && !drag.moved && e.type === 'pointerup' && pointers.size === 0) { // a click, not a drag: follow what was clicked
    const b = pickAt(drag.sx, drag.sy);
    if (b) { followId = b.id; opt.follow = true; syncToggles(); renderMoveCtx(true); }
  }
  if (drag.mode === 'pinch' && pointers.size === 1) { const p = [...pointers.values()][0]; drag = { mode:'pan', lx: p.x, ly: p.y, sx: p.x, sy: p.y, moved: false }; return; }
  if (pointers.size === 0) { drag = null; ui.style.cursor = tool === 'move' ? 'grab' : 'crosshair'; }
}
ui.addEventListener('pointerup', endPointer);
ui.addEventListener('pointercancel', endPointer);
ui.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover = null; });
ui.addEventListener('wheel', e => {
  e.preventDefault();
  const w = toW(e.clientX, e.clientY);
  zoom = clamp(zoom * Math.exp(-e.deltaY * 0.0015), 1e-12, 30);
  // while following, zoom about the focus; with a free camera, zoom about the cursor
  if (!opt.follow) { const o = scrOff(e.clientX - vw / 2, e.clientY - vh / 2 - camZ * sinI * zoom); camX = w[0] - o[0]; camY = w[1] - o[1]; }
}, { passive:false });
addEventListener('keydown', e => {
  if (e.key === 'Escape' && photo) { setPhoto(false); return; }
  if (e.key === 'Escape' && document.documentElement.classList.contains('clean')) { setClean(false); return; }
  if (e.key === 'Escape') { if (tool === 'move' && followId != null) { followId = null; opt.follow = true; syncToggles(); renderMoveCtx(true); } else setTool('move'); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target.closest && e.target.closest('input,select'))) { e.preventDefault(); undoPlace(); return; }
  if (navKey(e)) return;
  if (e.target.closest && e.target.closest('input,select,button,.gizmo')) return;
  if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) { if (photo) setPhoto(false); else setClean(!document.documentElement.classList.contains('clean')); return; }
  if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) { shot(); return; }
  if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && fsOK) { toggleFS(); return; }
  if (e.code === 'Space') { e.preventDefault(); paused = !paused; syncPlay(); }
});

/* view dial: drag to rotate (sideways) and tilt (up/down); arrow keys too; double-click resets to face-on */
const gz = $('gizmo'), gzCv = $('gizmoCv'), gzx = gzCv.getContext('2d');
function drawGizmo() {
  const D = Math.min(window.devicePixelRatio || 1, 2), S = 72;
  if (gzCv.width !== S * D) { gzCv.width = gzCv.height = S * D; }
  const c = gzx; c.setTransform(D, 0, 0, D, 0, 0); c.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2, r = 25;
  // the orbital plane as seen now, with its two axes
  c.strokeStyle = 'rgba(196,202,232,0.18)'; c.lineWidth = 1;
  for (const [ux, uy] of [[1, 0], [0, 1]]) {
    const px = (ux * cY - uy * sY) * r, py = (ux * sY + uy * cY) * r * cosI;
    c.beginPath(); c.moveTo(cx - px, cy - py); c.lineTo(cx + px, cy + py); c.stroke();
  }
  c.strokeStyle = 'rgba(255,179,106,0.85)'; c.lineWidth = 1.5;
  c.beginPath(); c.ellipse(cx, cy, r, Math.max(r * cosI, 0.6), 0, 0, Math.PI * 2); c.stroke();
  // marker on the plane's rim shows rotation
  const mx = cx + cY * r, my = cy + sY * r * cosI;
  c.fillStyle = '#7fd3e6'; c.beginPath(); c.arc(mx, my, 3.2, 0, Math.PI * 2); c.fill();
  // spin axis
  if (sinI > 0.02) { c.strokeStyle = 'rgba(205,225,255,0.5)'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - r * sinI * 0.9); c.stroke(); }
  c.fillStyle = 'rgba(236,230,218,0.9)'; c.font = `500 10px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(`${Math.round(tiltDeg)}°`, cx, cy + (sinI > 0.3 ? 14 : 0));
  gz.setAttribute('aria-label', `View dial: tilted ${Math.round(tiltDeg)}°, rotated ${Math.round(yaw * 180 / Math.PI)}°. Drag or use arrow keys; double-click resets.`);
  gz.title = 'Drag to tilt and rotate · double-click to reset';
}
let gzDrag = null;
gz.addEventListener('pointerdown', e => { gz.setPointerCapture(e.pointerId); gzDrag = { x: e.clientX, y: e.clientY }; e.preventDefault(); });
gz.addEventListener('pointermove', e => {
  if (!gzDrag) return;
  orbitBy((e.clientX - gzDrag.x) * 1.4, (e.clientY - gzDrag.y) * 1.4); gzDrag = { x: e.clientX, y: e.clientY };
});
const gzEnd = () => { gzDrag = null; };
gz.addEventListener('pointerup', gzEnd); gz.addEventListener('pointercancel', gzEnd);
gz.addEventListener('dblclick', () => { setTilt(0); setYaw(0); });
gz.addEventListener('keydown', e => {
  const step = 5 * Math.PI / 180;
  if (e.key === 'ArrowLeft') setYaw(yaw + step); else if (e.key === 'ArrowRight') setYaw(yaw - step);
  else if (e.key === 'ArrowUp') setTilt(tiltDeg - 5); else if (e.key === 'ArrowDown') setTilt(tiltDeg + 5);
  else if (e.key === 'Home') { setTilt(0); setYaw(0); }
  else return;
  e.preventDefault();
});
addEventListener('resize', () => requestAnimationFrame(resize));

