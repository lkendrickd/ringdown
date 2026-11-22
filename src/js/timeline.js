/* ================= timeline: rewind and replay =================
   A strip above the object bar shows the last two minutes of the running scene, with a marker for every simulation
   event. Dragging it, clicking a marker, the back button or B puts the whole scene back to an earlier moment.

   History is a list of snapshots, taken every half second of running time (the clock stands still while paused) and
   right after the scene was changed by hand. Each snapshot is a complete copy of the simulation: every body (trails
   included), the gas and loose-matter arrays, the explosions in flight, the scope's buffers, the random generator, the
   frame counter and every timer, so a restored scene plays on as it did the first time: bit for bit, given the same frame
   times (tests/timeline.test.js replays every scene that way). Older snapshots are thinned out (recent ones stay dense)
   to keep the whole history under a fixed memory budget.

   Wall-clock timers (flare times, a supernova's collapse, a star swelling, slow-motion after a disruption, flashes...)
   are stored as times on the frame clock, wallNow. Rather than shift each of them, a restore winds the frame clock
   itself back to the snapshot's wallNow; wallBack is how far it now runs behind performance.now(), and the animation
   loop subtracts it. Every timer inside a snapshot then means what it meant when it was taken, including any added later.

   After a jump back the old future is kept while the scene stands still, so you can scrub back and forth or hop between
   markers; the moment time runs again it is thrown away and history is written afresh from there. */
const TL = { EVERY: 0.5, SPAN: 120, MIN_AXIS: 30, MAXN: 320, NEAR: 5, LEAD: 1.5, BACK: 10,
  BUDGET: (navigator.deviceMemory && navigator.deviceMemory <= 4 ? 32 : 64) * 1048576 };
const tl = {
  snaps: [],        // oldest first
  bytes: 0,         // their estimated size
  clock: 0,         // seconds of running time in this scene: the strip's axis
  lastCap: 0,       // clock of the newest periodic snapshot
  at: -1,           // index of the snapshot the scene was put back to, until time runs again; -1 = live
  liveN: 0,         // newest event number when the scene left live: events after it belong to edits made back in time
  marks: [],        // simulation events (from the shared log) still within reach
  hold: null,       // { was } while the strip is dragged: the simulation is held still
  pauseSig: null, edited: false, placedN: 0,   // to spot hand edits (a placement, or anything changed while paused)
  dirty: true, drawnAt: -1e9, tipUntil: 0,
};
const TL_GAS = [gx, gy, gvx, gvy, gm, gage, gb, gf, gsrc, grh, grvx, grvy];
const TL_MAT = [qx, qy, qvx, qvy, qm, qT, qc, qk, qp, qr, qz, qvz];
const TL_SCOPE = [scopeBuf, scopeMark, freqBuf, xrBuf];

/* ---------- copying the simulation ---------- */
// plain data (numbers, strings, arrays, plain objects) copied all the way down
function tlCopy(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(tlCopy);
  if (ArrayBuffer.isView(v)) return v.slice();
  const o = {}; for (const k in v) o[k] = tlCopy(v[k]); return o;
}
// a body: its star type is a shared constant (kept as is), its trail is packed into one typed array
function tlPackBody(b) {
  const o = {};
  for (const k in b) {
    const v = b[k];
    if (k === 'type') o[k] = v;
    else if (k === 'trail' && Array.isArray(v)) { const d = v.length ? v[0].length : 2, a = new Float64Array(v.length * d); for (let i = 0; i < v.length; i++) for (let j = 0; j < d; j++) a[i * d + j] = v[i][j]; o[k] = { d, a }; }
    else o[k] = tlCopy(v);
  }
  return o;
}
function tlUnpackBody(p) {
  const b = {};
  for (const k in p) {
    const v = p[k];
    if (k === 'type') b[k] = v;
    else if (k === 'trail' && v && v.a) { const t = []; for (let i = 0; i < v.a.length; i += v.d) t.push(Array.from(v.a.subarray(i, i + v.d))); b[k] = t; }
    else b[k] = tlCopy(v);
  }
  return b;
}
// every loose variable the simulation reads or the picture depends on. Not: the camera's framing (zoom, viewing angle) and
// the viewer's settings, which stay as they are, nor the gas and matter budgets, which follow how fast this device is drawing right now
// (the frame-time governor moves them within the frame, after a snapshot is taken)
function tlVars() {
  return { simTime, nextId, rngS, frameN, wall: wallNow, slow, slowHoldUntil, zOn, warp, realSizes, tdeSlowUntil, tdeSlow, trailEvery, shake,
    placed: placed.slice(), totalFed, totalWind, gwSrc: tlCopy(gwSrc), followId, followPos: tlCopy(followPos), follow: opt.follow, camX, camY, camZ, qScale,
    matterFull, mcDt, mcWall, mcHeavy, births: tlCopy(births), xrMax, scopeHead, scopeMax, markScope, fgwText, audioF, audioEnv,
    closeUpId, closeUpDrift: tlCopy(closeUpDrift) };
}
function tlSetVars(v) {
  simTime = v.simTime; nextId = v.nextId; rngS = v.rngS; frameN = v.frameN; slow = v.slow; slowHoldUntil = v.slowHoldUntil;
  zOn = v.zOn; warp = v.warp; realSizes = v.realSizes; tdeSlowUntil = v.tdeSlowUntil; tdeSlow = v.tdeSlow; trailEvery = v.trailEvery; shake = v.shake;
  placed.length = 0; placed.push(...v.placed); totalFed = v.totalFed; totalWind = v.totalWind; gwSrc = tlCopy(v.gwSrc);
  qScale = v.qScale; matterFull = v.matterFull; mcDt = v.mcDt; mcWall = v.mcWall; mcHeavy = v.mcHeavy;
  births = tlCopy(v.births); xrMax = v.xrMax; scopeHead = v.scopeHead; scopeMax = v.scopeMax; markScope = v.markScope; fgwText = v.fgwText;
  audioF = v.audioF; audioEnv = v.audioEnv; closeUpId = v.closeUpId; closeUpDrift = tlCopy(v.closeUpDrift);
  // what the camera tracks goes back too: the scene moves it (a close-up, the drift after a disruption, following whatever a
  // followed body merged into). The viewer's framing, zoom and viewing angle, stays as it is.
  followId = v.followId; followPos = tlCopy(v.followPos); camX = v.camX; camY = v.camY; camZ = v.camZ;
  if (opt.follow !== v.follow) { opt.follow = v.follow; syncToggles(); }
}
function tlSnap(cut) {
  const s = { clock: tl.clock, t: simTime, frame: frameN, cut: !!cut, sig: tlSig(),
    bodies: bodies.map(tlPackBody), gN, g: TL_GAS.map(a => a.slice(0, gN)), qN, q: TL_MAT.map(a => a.slice(0, qN)),
    flashes: flashes.map(tlCopy), scope: TL_SCOPE.map(a => a.slice()), v: tlVars(), zoom, bytes: 4096 };
  for (const a of s.g) s.bytes += a.byteLength;
  for (const a of s.q) s.bytes += a.byteLength;
  for (const a of s.scope) s.bytes += a.byteLength;
  for (const b of s.bodies) s.bytes += 640 + (b.trail && b.trail.a ? b.trail.a.byteLength : 0);
  s.bytes += 160 * s.flashes.length;
  return s;
}
// put the simulation back exactly as snapshot s found it
function tlLoad(s) {
  bodies = s.bodies.map(tlUnpackBody);
  TL_GAS.forEach((a, i) => a.set(s.g[i])); gN = s.gN;
  TL_MAT.forEach((a, i) => a.set(s.q[i])); qN = s.qN;
  flashes.length = 0; for (const f of s.flashes) flashes.push(tlCopy(f));
  TL_SCOPE.forEach((a, i) => a.set(s.scope[i]));
  tlSetVars(s.v);
  if (s.v.closeUpId != null || s.v.closeUpDrift) zoom = s.zoom;   // in a close-up the scene sets the zoom, not the viewer
  wallBack += wallNow - s.v.wall; last = wallNow = s.v.wall;   // wind the frame clock back (see the top of this file)
  mspQueue.length = 0; windQueue.length = 0; novaQueue.length = 0; breakFrame = false;   // drained within every frame, so empty in every snapshot
  // the inspector and the context row hold on to the old body objects: rebuild them
  insKey = ''; renderMoveCtx(true);
}

/* ---------- history ---------- */
function tlPush(s) { tl.snaps.push(s); tl.bytes += s.bytes; tl.dirty = true; }
function tlDrop(i) {
  const s = tl.snaps[i]; tl.bytes -= s.bytes; tl.snaps.splice(i, 1);
  if (s.cut && tl.snaps[i]) tl.snaps[i].cut = true;   // what follows is still after the hand edit
}
// keep the last TL.SPAN seconds, within the memory budget: thin the history where it matters least (recent moments stay dense)
function tlThin() {
  const S = tl.snaps, now = tl.clock;
  while (S.length > 2 && now - S[0].clock > TL.SPAN) tlDrop(0);
  while (S.length > 2 && (tl.bytes > TL.BUDGET || S.length > TL.MAXN)) {
    let best = 1, bs = Infinity;
    for (let i = 1; i < S.length - 1; i++) { const sc = (S[i + 1].clock - S[i - 1].clock) / (now - S[i].clock + TL.NEAR); if (sc < bs) { bs = sc; best = i; } }
    tlDrop(best);
  }
  const t0 = S.length ? S[0].t : simTime;
  if (tl.marks.length && tl.marks[0].t < t0) tl.marks = tl.marks.filter(ev => ev.t >= t0);
}
function tlCapture(cut) { tlPush(tlSnap(cut)); tl.lastCap = tl.clock; tlThin(); }
const tlSig = () => { let s = 0; for (const b of bodies) s += b.m + (b.R || 0) + (b.chi || 0); return `${bodies.length}|${nextId}|${gN}|${qN}|${s}`; };
// time runs again from a restored moment: the old future is gone
function tlCommit() {
  const s = tl.snaps[tl.at];
  while (tl.snaps.length > tl.at + 1) tlDrop(tl.snaps.length - 1);
  tl.marks = tl.marks.filter(ev => ev.t <= s.t || ev.n > tl.liveN);
  tl.at = -1; tl.clock = tl.lastCap = s.clock; tl.dirty = true;
}
// live, and nothing has happened since the newest snapshot was taken
const tlLiveIsHead = () => { const h = tl.snaps[tl.snaps.length - 1]; return tl.at < 0 && !!h && h.t === simTime && h.v.wall === wallNow && h.sig === tlSig() && !tl.edited; };
// Put the scene at snapshot s (back, or forward again while the old future is still kept).
function tlGo(s) {
  if (!s) return false;
  const prev = simTime;
  if (tl.at < 0) {   // leaving live: keep where we were, so it can be returned to (unless the newest snapshot already is that)
    const head = tl.snaps[tl.snaps.length - 1], same = tlLiveIsHead();
    if (same && s === head) return false;
    tl.liveN = eventN;
    if (!same) tlPush(tlSnap(tl.edited));
  } else {
    if (tl.snaps[tl.at] === s) return false;
    // changes made by hand back in time are replaced by the moment being restored, and so are their events
    if (eventN > tl.liveN) { tl.marks = tl.marks.filter(ev => ev.n <= tl.liveN); for (let i = events.length - 1; i >= 0; i--) if (events[i].n > tl.liveN) events.splice(i, 1); }
  }
  tlLoad(s);
  tl.at = tl.snaps.indexOf(s); tl.clock = s.clock;
  // forward again: the events between the two moments happened, so they go back into the log
  if (s.t > prev) for (const ev of tl.marks) if (ev.t > prev && ev.t <= s.t && ev.n <= tl.liveN) { events.push(ev); if (events.length > 500) events.shift(); }
  toastsEl.replaceChildren();   // notices from the moment being left
  rewound(s.t);
  tl.pauseSig = tlSig(); tl.edited = false; tl.placedN = placed.length; tl.dirty = true;
  return true;
}

/* ---------- finding moments ---------- */
const tlHeadClock = () => tl.at < 0 ? tl.clock : tl.snaps[tl.snaps.length - 1].clock;
// the strip's clock at simulation time t (snapshots pin the two together; the live moment ends the list)
function tlClockAt(t) {
  const S = tl.snaps, m = S.length; if (!m) return tl.clock;
  const pts = tl.at < 0 ? i => i < m ? S[i] : { t: simTime, clock: tl.clock } : i => S[i], n = tl.at < 0 ? m + 1 : m;
  if (t <= pts(0).t) return pts(0).clock;
  let lo = 0, hi = n - 1;
  if (t >= pts(hi).t) return pts(hi).clock;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts(mid).t <= t) lo = mid; else hi = mid; }
  const a = pts(lo), b = pts(hi);
  return b.t > a.t ? a.clock + (b.clock - a.clock) * (t - a.t) / (b.t - a.t) : b.clock;
}
// newest snapshot at or before clock c (the oldest if none)
function tlAtOrBefore(c) { const S = tl.snaps; for (let i = S.length - 1; i >= 0; i--) if (S[i].clock <= c + 1e-9) return S[i]; return S[0]; }
function tlNearest(c) {
  const S = tl.snaps; let best = S[0], bd = Infinity;
  for (const s of S) { const d = Math.abs(s.clock - c); if (d <= bd) { bd = d; best = s; } }
  return best;
}
// where a marker sends you: a moment TL.LEAD seconds before the event, but never back across a hand edit (a placed body would vanish)
function tlBefore(ev) {
  const S = tl.snaps, c = tlClockAt(ev.t) - TL.LEAD;
  let i = S.length - 1; while (i > 0 && S[i].t >= ev.t) i--;
  for (; i > 0; i--) if (S[i].clock <= c + 1e-9 || S[i].cut) break;
  return S[Math.max(0, i)];
}
const tlCur = () => tl.at < 0 ? null : tl.snaps[tl.at];
function tlBack(sec, speak) {
  if (!tl.snaps.length) return false;
  const s = tlAtOrBefore(tl.clock - sec);
  const moved = tlGo(s);
  if (speak) say(moved ? `Back to ${tlAgo(s.clock)}` : 'That is as far back as this scene goes');
  return moved;
}
const tlAgo = c => { const d = Math.round(tlHeadClock() - c); return d <= 0 ? 'the newest moment' : `${d} second${d === 1 ? '' : 's'} before the newest moment`; };

/* ---------- the strip ---------- */
const tlEl = $('tl'), tlTrack = $('tlTrack'), tlFill = $('tlFill'), tlAhead = $('tlAhead'), tlMarksEl = $('tlMarks'), tlHeadEl = $('tlHead'),
  tlTime = $('tlTime'), tlTip = $('tlTip'), tlBackBtn = $('tlBack');
function tlAxis() { const head = tlHeadClock(), span = tl.snaps.length ? head - tl.snaps[0].clock : 0; return { head, len: Math.max(TL.MIN_AXIS, span) }; }
const tlX = (c, ax) => clamp(1 - (ax.head - c) / ax.len, 0, 1);
const tlSec = d => d < 0.05 ? '0 s' : `−${d < 10 ? d.toFixed(1) : Math.round(d)} s`;
function tlDraw() {
  tl.dirty = false; tl.drawnAt = performance.now();
  const ax = tlAxis(), S = tl.snaps, cur = tlCur(), curC = cur ? cur.clock : ax.head;
  const x0 = S.length ? tlX(S[0].clock, ax) : 1, xc = tlX(curC, ax);
  tlFill.style.left = (x0 * 100).toFixed(2) + '%'; tlFill.style.width = ((xc - x0) * 100).toFixed(2) + '%';
  tlAhead.style.left = (xc * 100).toFixed(2) + '%'; tlAhead.style.width = ((1 - xc) * 100).toFixed(2) + '%';
  tlHeadEl.style.left = (xc * 100).toFixed(2) + '%';
  tlEl.classList.toggle('back', !!cur);
  tlTime.textContent = cur ? tlSec(ax.head - curC) : 'live';
  tlBackBtn.setAttribute('aria-disabled', String(!S.length || (cur ? tl.at === 0 : S.length < 2 && S[0].t === simTime)));
  // markers: one element each, reused
  const t0 = S.length ? S[0].t : Infinity, ms = tl.marks.filter(ev => ev.t >= t0);
  while (tlMarksEl.children.length < ms.length) tlMarksEl.appendChild(document.createElement('i'));
  while (tlMarksEl.children.length > ms.length) tlMarksEl.lastChild.remove();
  ms.forEach((ev, k) => {
    const el = tlMarksEl.children[k], c = tlClockAt(ev.t);
    el.style.left = (tlX(c, ax) * 100).toFixed(2) + '%';
    el.className = (ev.kind === 'w' ? 'w' : '') + (cur && ev.t > cur.t ? ' ahead' : '');
    el._ev = ev;
  });
  // the slider's value: seconds back from the newest moment
  const back = ax.head - curC, near = tlMarkNear(curC, 0.6);
  tlTrack.setAttribute('aria-valuemin', String(-Math.round(ax.len)));
  tlTrack.setAttribute('aria-valuenow', String(-Math.round(back * 10) / 10));
  tlTrack.setAttribute('aria-valuetext', !cur ? 'Live' : `${Math.round(back)} seconds back${near ? ', just before ' + near.title : ''}${tl.at === S.length - 1 ? ', the newest moment' : ''}`);
  if (tl.tipUntil && performance.now() > tl.tipUntil) { tl.tipUntil = 0; tlTip.hidden = true; }
}
// the event a moment at clock c is parked just before (for the slider's spoken value)
function tlMarkNear(c, within) {
  for (const ev of tl.marks) { const ec = tlClockAt(ev.t); if (ec > c && ec - c <= TL.LEAD + within) return ev; }
  return null;
}
function tlShowTip(text, xFrac, ms) {
  tlTip.textContent = text; tlTip.hidden = false;
  const tr = tlTrack.getBoundingClientRect(), er = tlEl.getBoundingClientRect(), w = tlTip.offsetWidth;
  const x = tr.left - er.left + xFrac * tr.width;
  // on a phone the view dial sits over the right end, where the newest events are: keep the name at the left there
  tlTip.style.left = (document.documentElement.classList.contains('phone') ? 0 : clamp(x - w / 2, 0, er.width - w)) + 'px';
  tl.tipUntil = ms ? performance.now() + ms : 0;
}
function tlHideTip() { if (!tl.tipUntil) tlTip.hidden = true; }
// the marker drawn nearest to a point on the track, within reach of a finger or the mouse
function tlMarkAt(px, reach) {
  let best = null, bd = reach;
  for (const el of tlMarksEl.children) { const r = el.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - px); if (d < bd) { bd = d; best = el; } }
  return best;
}
const tlClockOfX = px => { const r = tlTrack.getBoundingClientRect(), ax = tlAxis(); return ax.head - (1 - clamp((px - r.left) / r.width, 0, 1)) * ax.len; };
function tlMarkTip(el) { const ax = tlAxis(), ev = el._ev, c = tlClockAt(ev.t); return [`${ev.title} · ${tlSec(ax.head - c)}`, tlX(c, ax)]; }
// scrub to the moment under the pointer: while live, the far right end stays live
function tlScrub(px) {
  const c = tlClockOfX(px), S = tl.snaps;
  if (tl.at < 0 && S.length && c > (S[S.length - 1].clock + tl.clock) / 2) return;
  tlGo(tlNearest(c));
}
let tlPtr = null;
tlTrack.addEventListener('pointerdown', e => {
  if (e.button > 0 || !tl.snaps.length) return;
  e.preventDefault(); tlTrack.focus({ preventScroll: true });
  try { tlTrack.setPointerCapture(e.pointerId); } catch (err) {}
  tlPtr = { id: e.pointerId, x0: e.clientX, moved: false, touch: e.pointerType !== 'mouse' };
  if (!tl.hold) { tl.hold = { was: paused }; paused = true; }   // hold time still while scrubbing
});
tlTrack.addEventListener('pointermove', e => {
  if (tlPtr && e.pointerId === tlPtr.id) {
    if (!tlPtr.moved && Math.abs(e.clientX - tlPtr.x0) > 4) tlPtr.moved = true;
    if (tlPtr.moved) { tlScrub(e.clientX); tlDraw(); const ax = tlAxis(), c = tlCur() ? tlCur().clock : ax.head; tlShowTip(tlSec(ax.head - c), tlX(c, ax)); }
    return;
  }
  if (e.pointerType !== 'mouse') return;
  const el = tlMarkAt(e.clientX, 8);
  if (el) { const [txt, x] = tlMarkTip(el); tlShowTip(txt, x); } else tlHideTip();
});
function tlRelease() {
  if (tl.hold) { paused = tl.hold.was; tl.hold = null; }
  tlPtr = null;
}
tlTrack.addEventListener('pointerup', e => {
  if (!tlPtr || e.pointerId !== tlPtr.id) return;
  if (!tlPtr.moved) {   // a tap or click: on a marker, jump to just before that event; anywhere else, to that moment
    const el = tlMarkAt(e.clientX, tlPtr.touch ? 14 : 8);
    if (el) { tlGo(tlBefore(el._ev)); tlDraw(); const [txt, x] = tlMarkTip(el); tlShowTip(txt, x, 2600); }
    else { tlScrub(e.clientX); tlDraw(); }
  } else tlTip.hidden = true;
  tlRelease();
});
tlTrack.addEventListener('pointercancel', tlRelease);
tlTrack.addEventListener('lostpointercapture', () => { if (tlPtr) tlRelease(); });
tlTrack.addEventListener('pointerleave', e => { if (!tlPtr && e.pointerType === 'mouse') tlHideTip(); });
// keys on the strip: arrows step through the saved moments, Page Up / Page Down hop between events, Home / End go to the ends
tlTrack.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || !tl.snaps.length) return;
  const S = tl.snaps, i = tl.at >= 0 ? tl.at : tlLiveIsHead() ? S.length - 1 : S.length, cur = tl.at < 0 ? tl.clock : S[i].clock;
  let s = null;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') s = S[Math.max(0, i - 1)];
  else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') s = tl.at < 0 ? null : S[Math.min(S.length - 1, i + 1)];
  else if (e.key === 'Home') s = S[0];
  else if (e.key === 'End') s = tl.at < 0 ? null : S[S.length - 1];
  else if (e.key === 'PageUp' || e.key === 'PageDown') {
    const up = e.key === 'PageUp', ts = tl.marks.map(tlBefore);
    for (let k = 0; k < ts.length; k++) {
      const c = ts[up ? ts.length - 1 - k : k].clock;
      if (up ? c < cur - 1e-6 : c > cur + 1e-6) { s = ts[up ? ts.length - 1 - k : k]; break; }
    }
    if (!s) say(up ? 'No earlier event' : 'No later event');
  } else return;
  e.preventDefault(); e.stopPropagation();   // not the camera's arrow keys
  if (s) { tlGo(s); tlDraw(); }
});
tlTrack.addEventListener('blur', () => { tl.tipUntil = 0; tlTip.hidden = true; });
tlBackBtn.addEventListener('click', () => { tlBack(TL.BACK, false); tlDraw(); });
// B goes back 10 seconds, from the scene or from nothing focused (not while typing, and not on a button, like the other letter keys)
addEventListener('keydown', e => {
  if ((e.key !== 'b' && e.key !== 'B') || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
  if (e.target.closest && e.target.closest('input,select,textarea,button,.gizmo,[contenteditable]')) return;
  e.preventDefault(); tlBack(TL.BACK, true); tlDraw();
});

// The strip makes the dock taller, and what floats above the dock (the view dial, notices, the phone sheets) clears it by
// --dock-h. That is set on resizes and tool changes; this keeps it right whenever the dock's own height changes too
// (coming back from clean view, the scroll indicator under the objects appears a moment after it was measured).
if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', $('dock').offsetHeight + 'px')).observe($('dock'));

/* ---------- hooks ---------- */
eventHooks.push(ev => { if (!(ev.data && ev.data.ui)) { tl.marks.push(ev); tl.dirty = true; } });
sceneHooks.push(() => {
  tl.snaps.length = 0; tl.bytes = 0; tl.marks = []; tl.at = -1; tl.clock = tl.lastCap = 0;
  tl.pauseSig = null; tl.edited = false; tl.placedN = placed.length; tlTip.hidden = true;
  tlCapture(true);   // the scene as it was built
});
frameHooks.push((simDt, wallDt) => {
  let cut = false;
  if (simDt > 0) {
    if (tl.at >= 0) tlCommit();
    if (tl.pauseSig != null) { cut = tl.edited; tl.pauseSig = null; tl.edited = false; }   // running again after a pause: did anything change by hand?
    tl.clock += wallDt;
  } else if (!tl.hold) {
    const sig = tlSig();
    if (tl.pauseSig == null) tl.pauseSig = sig; else if (sig !== tl.pauseSig) tl.edited = true;
  }
  if (placed.length !== tl.placedN) { tl.placedN = placed.length; if (simDt > 0) cut = true; else tl.edited = true; }
  if (!tl.snaps.length || cut || (simDt > 0 && tl.clock - tl.lastCap >= TL.EVERY - 1e-6)) tlCapture(cut);
  if (tl.dirty || performance.now() - tl.drawnAt > 120) tlDraw();
});

/* the automated tests' handle on all this (see test-hook.js) */
const tlHook = {
  capture(cut) { tlCapture(cut); return tl.snaps.length - 1; },
  tick(sec) { tl.clock += sec; tlCapture(false); },   // the frame hook's periodic capture, without stepping the simulation (memory tests)
  go(i) { return tlGo(tl.snaps[i]); },
  back: sec => tlBack(sec == null ? TL.BACK : sec, false),
  before: ev => tl.snaps.indexOf(tlBefore(ev)),
  info: () => ({ at: tl.at, clock: tl.clock, bytes: tl.bytes, wallBack, budget: TL.BUDGET, every: TL.EVERY, span: TL.SPAN,
    snaps: tl.snaps.map(s => ({ clock: s.clock, t: s.t, frame: s.frame, cut: s.cut, bytes: s.bytes })), marks: tl.marks.map(ev => ({ title: ev.title, t: ev.t, n: ev.n })) }),
  draw: tlDraw,
  // the whole simulation as plain data: equal fingerprints mean nothing a restore covers was missed. Left out: the scope's
  // display scale (scopeMax, xrMax), which drawing eases toward the trace later in the same frame than a snapshot is taken,
  // so a restore can only bring back its value from the start of that frame's drawing
  fingerprint() {
    const s = tlSnap(false), arr = a => Array.from(a);
    const v = { ...s.v }; delete v.scopeMax; delete v.xrMax;
    return JSON.stringify({ v, bodies: s.bodies.map(b => ({ ...b, type: b.type ? b.type.id : null, trail: arr(b.trail.a) })),
      g: s.g.map(arr), q: s.q.map(arr), flashes: s.flashes, scope: s.scope.map(arr) });
  },
  // time the copy at the current load: [snapshot ms, restore ms] medians over n runs
  cost(n = 15) {
    const tc = [], tr = [];
    for (let k = 0; k < n; k++) {
      let t = performance.now(); const s = tlSnap(false); tc.push(performance.now() - t);
      const wb = wallBack; t = performance.now(); tlLoad(s); tr.push(performance.now() - t); wallBack = wb;
    }
    const med = a => a.sort((x, y) => x - y)[a.length >> 1];
    return { snap: med(tc), restore: med(tr), snapMax: Math.max(...tc), restoreMax: Math.max(...tr), bytes: tlSnap(false).bytes };
  },
};
