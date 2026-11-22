/* ================= keyboard, gamepad, screen reader, offline =================
   Keys and pads steer the camera through one per-frame step, so speeds don't depend on the frame rate.
   Enter (or A) drops the selected object at the centre of the view, as a click there would; the placement
   ghost is drawn there while steering this way. Every notice is also copied to a hidden live region. */
const NAV = { ArrowLeft:'l', ArrowRight:'r', ArrowUp:'u', ArrowDown:'d', '+':'in', '=':'in', '-':'out', '_':'out', '[':'ccw', ']':'cw', ',':'flat', '<':'flat', '.':'tilt', '>':'tilt' };
const held = new Map();     // physical key -> action, so releasing Shift before '+' can't leave it stuck
let padOn = false, padPrev = [];
function say(text) {
  const el = document.getElementById('live'); if (!el) return;
  const p = document.createElement('p'); p.textContent = text; el.appendChild(p);
  while (el.children.length > 4) el.firstChild.remove();
}
function aimCentre() { if (tool !== 'move') hover = { x: vw / 2, y: vh / 2 }; }
function placeCentre() {
  if (tool === 'move' || tool === 'matter') return;
  const n = bodies.length; aimCentre(); commitPlace(vw / 2, vh / 2, vw / 2, vh / 2);
  if (bodies.length > n) say(`Placed at the centre of the view: ${describe(bodies[bodies.length - 1])}`);
}
function pour(on) { // Matter: hold Enter or A to pour at the centre
  if (on && !drag && tool === 'matter') { drag = { mode:'spray', x: vw / 2, y: vh / 2, key: true }; aimCentre(); }
  else if (!on && drag && drag.key) drag = null;
}
function cycleTool(d) { // bumpers step through the objects; Move is on B
  const ids = CHIPS.map(t => t.id).filter(id => id !== 'move'), i = ids.indexOf(tool);
  setTool(ids[i < 0 ? (d > 0 ? 0 : ids.length - 1) : (i + d + ids.length) % ids.length]); aimCentre();
}
function navKey(e) { // from the main keydown handler: true when the key was handled here
  const t = e.target, el = t && t.closest ? t : null;
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || (el && el.closest('input,select,textarea,[contenteditable]'))) return false;
  if (e.key === 'Enter') { // on the scene, on nothing, or on the chosen chip (a button anywhere else keeps its own Enter)
    if (tool === 'move' || (el && el !== ui && el !== document.body && el !== document.documentElement && !el.matches('.chip[aria-checked="true"]'))) return false;
    e.preventDefault(); if (!e.repeat) { if (tool === 'matter') pour(true); else placeCentre(); }
    return true;
  }
  const a = NAV[e.key];
  if (!a || (e.key.startsWith('Arrow') && el && el.closest('.gizmo,.tools,.panel,.inspect,.sharepop'))) return false;
  held.set(e.code || e.key, a); aimCentre(); e.preventDefault();
  return true;
}
addEventListener('keyup', e => { held.delete(e.code || e.key); if (e.key === 'Enter') pour(false); });
addEventListener('blur', () => { held.clear(); pour(false); });
// Escape closes the share box and the settings panel from inside them, and hands focus back to their button
for (const [box, btn] of [['sharepop', 'share'], ['panel', 'gear']]) $(box).addEventListener('keydown', e => {
  if (e.key !== 'Escape' || $(box).hidden) return;
  e.stopPropagation(); $(btn).click(); $(btn).focus();
});

const PAD_DZ = 0.18;
function stick(x, y) { const m = Math.hypot(x, y); if (m < PAD_DZ) return [0, 0]; const k = Math.min(1, (m - PAD_DZ) / (1 - PAD_DZ)) / m; return [x * k, y * k]; }
addEventListener('gamepadconnected', e => {
  padOn = true; padPrev = e.gamepad ? e.gamepad.buttons.map(b => b.pressed) : [];  // the press that woke the pad isn't an action
  toast('Gamepad connected', ['Left stick pans · right stick turns and tilts · triggers zoom', 'A places · B Move · X pause · bumpers change object · Start hides the controls'], '', { ui: true });
});
addEventListener('gamepaddisconnected', () => { padPrev = []; pour(false); });
let navT = 0;
function navStep(now) { // once a frame: held keys and the gamepad (polled only while one is connected)
  const dt = Math.min(0.25, Math.max(0, now - navT) / 1000); navT = now;   // own clock: the sim's step is capped, the camera's isn't
  let px = 0, py = 0, zm = 0, rot = 0, tl = 0;
  for (const a of held.values()) {
    if (a === 'l') px--; else if (a === 'r') px++; else if (a === 'u') py--; else if (a === 'd') py++;
    else if (a === 'in') zm++; else if (a === 'out') zm--; else if (a === 'ccw') rot++; else if (a === 'cw') rot--;
    else if (a === 'flat') tl--; else if (a === 'tilt') tl++;
  }
  if (padOn) {
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(p => p && p.connected);
    if (!gp) { padOn = false; padPrev = []; pour(false); }
    else {
      const [lx, ly] = stick(gp.axes[0] || 0, gp.axes[1] || 0), [rx, ry] = stick(gp.axes[2] || 0, gp.axes[3] || 0);
      const trig = i => { const b = gp.buttons[i], v = b ? b.value || (b.pressed ? 1 : 0) : 0; return v > 0.06 ? v : 0; };
      px += lx; py += ly; rot -= rx; tl += ry; zm += trig(7) - trig(6);
      const down = gp.buttons.map(b => b.pressed), edge = i => down[i] && !padPrev[i];
      if (edge(0)) { if (tool === 'matter') pour(true); else placeCentre(); }
      if (!down[0] && padPrev[0]) pour(false);
      if (edge(1)) setTool('move');
      if (edge(2)) { paused = !paused; syncPlay(); }
      if (edge(4)) cycleTool(-1);
      if (edge(5)) cycleTool(1);
      if (edge(9)) { if (photo) setPhoto(false); else setClean(!document.documentElement.classList.contains('clean')); }   // like H
      padPrev = down;
      if (lx || ly || rx || ry || zm) aimCentre();
    }
  }
  if (px || py) { // pan at most 0.8 screens a second, like dragging: it frees the camera
    const v = 0.8 * Math.min(vw, vh) * dt, o = scrOff(clamp(px, -1, 1) * v, clamp(py, -1, 1) * v);
    camX += o[0]; camY += o[1];
    if (opt.follow) { opt.follow = false; syncToggles(); }
  }
  if (zm) zoom = clamp(zoom * Math.exp(1.5 * clamp(zm, -1, 1) * dt), 1e-12, 30);
  if (rot) setYaw(yaw + 1.6 * clamp(rot, -1, 1) * dt);
  if (tl) setTilt(tiltDeg + 55 * clamp(tl, -1, 1) * dt);
  if (rot || tl) reached('tilt');   // the tour and the Things to try list count this like a drag of the dial
}

// offline: the service worker only exists on http(s); opened as a file, the page simply runs without it
// (and not under ?rdtest, so the automated tests stay hermetic)
try {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/[?&]rdtest(=|&|$)/.test(location.search)) {
    const reg = () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('Ringdown: no offline copy', err));
    if (document.readyState === 'complete') reg(); else addEventListener('load', reg);
  }
} catch (err) {}

