/* ================= sound ================= */
/* All synthesized, no sound files. Each one-shot voice gets its own stereo panner (placed by where the event is on
   screen) and feeds the simulation bus plus a shared reverb whose impulse is made from decaying noise. The sim bus
   is muted while paused; UI clicks bypass it. Only the chirp is data: the GW frequency, one octave up.
   voices → panner → sim bus (+ reverb) → master (volume) → compressor → speakers */
let au = null, soundOn = false, vol = 0.7;
const SND_MAX = 10;   // one-shots playing at once; past that the oldest, least important one is cut
let ars = 0x2545f491; // the sound's own random numbers, so audio never draws on the simulation's
const arnd = () => { ars ^= ars << 13; ars ^= ars >>> 17; ars ^= ars << 5; return (ars >>> 0) / 4294967296; };
function noiseBuf(c, sec, brown) {
  const n = Math.round(c.sampleRate * sec), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < n; i++) { const w = arnd() * 2 - 1; d[i] = brown ? (b = (b + 0.02 * w) / 1.02) * 3.5 : w; }
  return buf;
}
function impulse(c, sec) { // a stereo reverb tail that darkens as it dies away
  const n = Math.round(c.sampleRate * sec), buf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) { const t = i / n; lp += (arnd() * 2 - 1 - lp) * (0.7 - 0.6 * t); d[i] = lp * (1 - t) ** 3; }
  }
  return buf;
}
const panNode = (c, v) => { if (!c.createStereoPanner) return Object.assign(c.createGain(), { pan: { value: 0, setTargetAtTime() {} } }); const p = c.createStereoPanner(); p.pan.value = v; return p; };
// the fixed graph: buses, reverb, noise, and the continuous sounds (built once; works on an OfflineAudioContext too)
function audioGraph(c) {
  const a = { ctx: c, voices: [], last: {}, n: {}, drop: 0 };
  const G = v => { const g = c.createGain(); g.gain.value = v; return g; }, link = (...ns) => { for (let i = 1; i < ns.length; i++) ns[i - 1].connect(ns[i]); };
  const lfo = (f, depth, param) => { const o = c.createOscillator(), g = G(depth); o.frequency.value = f; link(o, g, param); o.start(); };
  const loop = buf => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
  a.master = G(0); a.comp = c.createDynamicsCompressor();
  a.comp.threshold.value = -12; a.comp.knee.value = 6; a.comp.ratio.value = 10; a.comp.attack.value = 0.003; a.comp.release.value = 0.3;
  link(a.master, a.comp, c.destination);
  a.sim = G(0); a.sim.connect(a.master);
  a.rvbIn = G(1); const cv = c.createConvolver(); cv.buffer = impulse(c, 2.8); link(a.rvbIn, cv, G(0.55), a.sim);
  a.noise = noiseBuf(c, 2, false); a.brown = noiseBuf(c, 4, true);
  const send = (from, v) => link(from, G(v), a.rvbIn);
  // gravitational-wave chirp: sine, triangle an octave above, a faint third harmonic
  a.o1 = c.createOscillator(); a.o2 = c.createOscillator(); a.o3 = c.createOscillator(); a.o2.type = 'triangle';
  a.g = G(0); a.gp = panNode(c, 0);
  a.o1.connect(a.g); link(a.o2, G(0.18), a.g); link(a.o3, G(0.05), a.g); link(a.g, a.gp, a.sim); send(a.gp, 0.25);
  a.o1.start(); a.o2.start(); a.o3.start();
  // accretion rumble: brown noise through a low-pass that opens as the feeding rate climbs
  a.rf = c.createBiquadFilter(); a.rf.type = 'lowpass'; a.rf.frequency.value = 70; a.rf.Q.value = 0.8;
  a.rg = G(0); a.rp = panNode(c, 0); link(loop(a.brown), a.rf, a.rg, a.rp, a.sim); send(a.rp, 0.3);
  // ambient bed: a low open fifth and a breath of filtered noise, swelling slowly
  const bed = c.createBiquadFilter(); bed.type = 'lowpass'; bed.frequency.value = 320;
  const br = G(0.7); a.amb = G(0); link(bed, br, a.amb, a.sim); send(a.amb, 0.7); lfo(0.05, 0.3, br.gain);
  for (const [f, ty] of [[55, 'sine'], [55.35, 'sine'], [82.4, 'triangle'], [110.2, 'sine']]) { const o = c.createOscillator(); o.type = ty; o.frequency.value = f; link(o, G(0.22), bed); o.start(); }
  const air = c.createBiquadFilter(); air.type = 'bandpass'; air.frequency.value = 700; air.Q.value = 0.9;
  link(loop(a.noise), air, G(0.25), br); lfo(0.031, 350, air.frequency);
  return a;
}
function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  au = audioGraph(new AC()); return true;
}
// a one-shot voice: gain and panner into the sim bus with a reverb send. UI clicks go straight to master and,
// being tiny and rate-limited, don't count against the cap (so a sky full of explosions never swallows them)
function voice(kind, p, lvl, send, dur) {
  const a = au, c = a.ctx, t = c.currentTime + 0.01, pri = SFX[kind].p, ui = !pri;
  a.voices = a.voices.filter(v => v.end > t);
  if (!ui && a.voices.length >= SND_MAX) {
    let w = null; for (const v of a.voices) if (v.pri <= pri && (!w || v.pri < w.pri || (v.pri === w.pri && v.t0 < w.t0))) w = v;
    if (!w) { a.drop++; return null; }
    w.g.gain.cancelScheduledValues(t); w.g.gain.setTargetAtTime(0, t, 0.015); for (const s of w.src) try { s.stop(t + 0.08); } catch (e) {}
    a.voices = a.voices.filter(v => v !== w);
  }
  const g = c.createGain(), pn = panNode(c, p); g.gain.value = lvl / Math.sqrt(1 + 0.25 * a.voices.length);
  g.connect(pn); pn.connect(ui ? a.master : a.sim);
  let s = null; if (send && !ui) { s = c.createGain(); s.gain.value = send; pn.connect(s); s.connect(a.rvbIn); }
  const v = { t0: t, end: t + dur, pri, g, src: [], done() { g.disconnect(); pn.disconnect(); if (s) s.disconnect(); } };
  if (!ui) a.voices.push(v);
  a.n[kind] = (a.n[kind] || 0) + 1;
  return v;
}
// building blocks. env: silent until `at`, up to `pk` in `atk` s, then falling ~30 dB over `dec` s
function env(v, pk, atk, dec, at = 0) {
  const g = au.ctx.createGain(), t = v.t0 + at;
  g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + atk); g.gain.setTargetAtTime(0, t + atk, dec / 3.5);
  g.connect(v.g); return g;
}
function sched(v, s, out, at = 0) { s.connect(out); s.start(v.t0 + at, s.buffer ? arnd() * 1.5 : undefined); s.stop(v.end); if (!v.src.length) s.onended = v.done; v.src.push(s); return s; }
function osc(v, type, f0, f1, glide, out, at = 0) {
  const o = au.ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, v.t0 + at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, v.t0 + at + glide);
  return sched(v, o, out, at);
}
function noise(v, out, brown) { const s = au.ctx.createBufferSource(); s.buffer = brown ? au.brown : au.noise; s.loop = true; return sched(v, s, out); }
function filt(v, type, f0, f1, glide, q, out) {
  const f = au.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, v.t0); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, v.t0 + glide);
  f.connect(out); return f;
}
function crackle(v, pk, dec, at, r0, r1) { // a band of noise chopped by a square wave: sparks, grit
  const c = au.ctx, cr = c.createGain(), lg = c.createGain(); cr.gain.value = 0.5; lg.gain.value = 0.5;
  cr.connect(env(v, pk, 0.02, dec, at)); lg.connect(cr.gain);
  noise(v, filt(v, 'bandpass', 3200, 3200, 0, 0.9, cr)); osc(v, 'square', r0, r1, dec, lg, at);
}
/* The one-shots. g: shortest gap between two of a kind (s), p: priority, l: level, d: length (s), s: reverb send.
   f(voice, intensity, hz) builds the sound. */
const SFX = {
  // supernova: a falling boom, a blast of noise that darkens as it spreads, and a long low rumble
  sn: { g: 0.15, p: 3, l: 0.55, d: 9, s: 0.6, f(v) {
    osc(v, 'sine', 120, 28, 1.1, env(v, 0.9, 0.005, 2.6));
    noise(v, filt(v, 'lowpass', 5000, 160, 3.5, 0.6, env(v, 0.5, 0.01, 3.8)));
    noise(v, filt(v, 'lowpass', 180, 70, 6, 0.7, env(v, 0.8, 0.5, 6, 0.1)), true);
  } },
  // kilonova: a sharp crack and a thud, then a glittering inharmonic shimmer and a slow glow
  kn: { g: 0.3, p: 3, l: 0.5, d: 7.5, s: 0.7, f(v) {
    noise(v, filt(v, 'bandpass', 4000, 1500, 0.25, 0.7, env(v, 0.4, 0.002, 0.3)));
    osc(v, 'sine', 95, 38, 0.6, env(v, 0.6, 0.004, 1));
    [523, 791, 1109, 1480, 1973, 2642].forEach((f, i) => osc(v, 'sine', f * 1.015, f, 2, env(v, 0.12, 0.01, 1.8 + 0.6 * i + arnd(), 0.02 * i), 0.02 * i));
    osc(v, 'triangle', 330, 330, 0, filt(v, 'lowpass', 400, 2400, 1.5, 1, env(v, 0.12, 1.2, 3.5)));
  } },
  // black holes merging: a deep thump, then the remnant rings at its ringdown pitch (one octave up, like the chirp)
  bh: { g: 0.3, p: 3, l: 0.6, d: 3.6, s: 0.5, f(v, k, hz) {
    osc(v, 'sine', 80, 24, 0.8, env(v, 1, 0.004, 1.8));
    noise(v, filt(v, 'lowpass', 700, 90, 0.5, 1, env(v, 0.4, 0.003, 0.6)));
    const f = hz > 0 ? clamp(hz * 2, 55, 2400) : 220;
    osc(v, 'sine', f * 1.08, f, 0.12, env(v, 0.32, 0.01, 2.4, 0.04), 0.04);
    osc(v, 'sine', f * 1.09, f * 1.006, 0.12, env(v, 0.16, 0.01, 2, 0.04), 0.04);
    osc(v, 'triangle', f * 2.2, f * 2, 0.12, env(v, 0.06, 0.01, 1.2, 0.04), 0.04);
  } },
  // tidal disruption: noise through a resonant band that rises as the star stretches, then tears, with a groan and grit
  tde: { g: 0.25, p: 2, l: 0.6, d: 4.5, s: 0.5, f(v) {
    const bp = filt(v, 'bandpass', 220, 2400, 0.9, 4, env(v, 0.9, 0.35, 2.8)); bp.frequency.exponentialRampToValueAtTime(380, v.t0 + 3.2);
    noise(v, bp);
    osc(v, 'sawtooth', 120, 42, 3, filt(v, 'lowpass', 800, 160, 3, 1.5, env(v, 0.22, 0.25, 2.6)));
    crackle(v, 0.3, 2.2, 0.3, 17, 31);
  } },
  // nova: a bright pop and a short rising ping
  nova: { g: 0.2, p: 1, l: 0.5, d: 2.6, s: 0.65, f(v) {
    noise(v, filt(v, 'bandpass', 2400, 800, 0.5, 1.2, env(v, 0.45, 0.003, 0.45)));
    osc(v, 'sine', 600, 720, 0.25, env(v, 0.28, 0.004, 1.8));
    osc(v, 'sine', 1203, 1446, 0.25, env(v, 0.09, 0.004, 1.1));
  } },
  // magnetar flare: an electric zap sweeping down, a jolt, and crackling sparks
  flare: { g: 0.3, p: 2, l: 0.55, d: 3.4, s: 0.55, f(v) {
    osc(v, 'sawtooth', 2800, 80, 0.4, filt(v, 'lowpass', 7000, 500, 0.45, 3, env(v, 0.3, 0.002, 0.5)));
    osc(v, 'square', 1400, 60, 0.6, filt(v, 'bandpass', 2000, 300, 0.6, 2, env(v, 0.12, 0.002, 0.7)));
    osc(v, 'sine', 85, 34, 0.5, env(v, 0.7, 0.004, 0.9));
    crackle(v, 0.35, 2, 0.05, 40, 9);
  } },
  // impact: a dull thud and crunch; a giant impact (k near 1) rumbles on
  impact: { g: 0.12, p: 1, l: 0.6, d: 3.2, s: 0.35, f(v, k) {
    osc(v, 'sine', 100, 36, 0.35, env(v, 0.9, 0.003, 0.7));
    noise(v, filt(v, 'lowpass', 1600, 180, 0.6, 0.8, env(v, 0.6, 0.002, 0.5 + 0.7 * Math.min(k, 1.5))));
    if (k > 0.7) noise(v, filt(v, 'lowpass', 140, 70, 2, 0.7, env(v, 0.6, 0.15, 2, 0.05)), true);
  } },
  click: { g: 0.035, p: 0, l: 1, d: 0.1, s: 0, f(v) { osc(v, 'sine', 1700, 1000, 0.03, env(v, 0.06, 0.001, 0.045)); } },
  place: { g: 0.06, p: 0, l: 1, d: 0.3, s: 0, f(v) { osc(v, 'sine', 540, 320, 0.09, env(v, 0.13, 0.002, 0.18)); osc(v, 'triangle', 1080, 640, 0.05, env(v, 0.03, 0.001, 0.08)); } },
};
let sPan = 0, sLvl = 1;
// where a point in the world sounds: panned by its screen x, quieter the further off screen it is
function sndAt(x, y) {
  const sx = toSX(x, y), sy = toSY(x, y), ox = Math.max(0, Math.abs(sx / vw - 0.5) - 0.5), oy = Math.max(0, Math.abs(sy / vh - 0.5) - 0.5);
  sPan = clamp(sx / vw * 2 - 1, -1, 1) * 0.8 || 0; sLvl = 1 / (1 + 3 * Math.hypot(ox, oy)) || 1;
}
// play a one-shot for an event at world (x, y); k scales it (0.3 faint … 1.4 huge), hz tunes the merger ring
function sfx(kind, x, y, k = 1, hz = 0) {
  const a = au, r = SFX[kind]; if (!a || !soundOn || a.ctx.state !== 'running' || !r) return;
  const t = a.ctx.currentTime;
  if (kind in a.last && t - a.last[kind] < r.g) { a.drop++; return; }
  a.last[kind] = t;
  if (x != null) sndAt(x, y); else { sPan = 0; sLvl = 1; }
  const v = voice(kind, sPan, sLvl * Math.min(k, 1.5) * r.l, r.s, r.d); if (v) r.f(v, k, hz);
}
// move an audio parameter toward v, skipping the call when it is already headed there
function ramp(p, v, t, tc) { if (p._v !== v) { p._v = v; p.setTargetAtTime(v, t, tc); } }
// run the audio clock only while sound is on and the tab is visible
function sndPower() {
  if (!au) return;
  const c = au.ctx;
  ramp(au.master.gain, soundOn ? vol * vol : 0, c.currentTime, 0.05);
  if (soundOn && !document.hidden) { if (c.state !== 'running') c.resume().catch(() => {}); }
  else if (document.hidden) c.suspend().catch(() => {});
  else setTimeout(() => { if (!soundOn && c.state === 'running') c.suspend().catch(() => {}); }, 300);
}
document.addEventListener('visibilitychange', sndPower);
function updateAudio() {
  const a = au; if (!a || a.ctx.state !== 'running') return;
  const t = a.ctx.currentTime, live = soundOn && !paused;
  ramp(a.sim.gain, live ? 1 : 0, t, 0.08);
  // the chirp: frequency straight from the gravitational-wave source, one octave up
  const fr = clamp(audioF * 2, 40, 3000);
  a.o1.frequency.setTargetAtTime(fr, t, 0.03); a.o2.frequency.setTargetAtTime(fr * 2, t, 0.03); a.o3.frequency.setTargetAtTime(fr * 3, t, 0.03);
  const amp = live && audioF > 0 ? clamp(audioEnv / scopeMax, 0, 1) : 0;
  a.g.gain.setTargetAtTime(amp * 0.4, t, 0.04);
  if (gwSrc) { sndAt(gwSrc.cx, gwSrc.cy); ramp(a.gp.pan, sPan, t, 0.1); }
  // accretion rumble: louder and brighter the faster everything feeds, placed between the feeders by how much each eats
  let xr = 0, xp = 0;
  for (const b of bodies) if (isAccretor(b) && b.feedRate > 0) { sndAt(b.x, b.y); xr += b.feedRate; xp += b.feedRate * sPan; }
  const lv = live && xr > 3e-5 ? clamp((Math.log10(xr) + 4.5) / 3.5, 0, 1) : 0;
  ramp(a.rg.gain, lv * lv * 0.4, t, 0.25); ramp(a.rf.frequency, 70 + 380 * lv, t, 0.3); if (xr > 0) ramp(a.rp.pan, xp / xr, t, 0.3);
  ramp(a.amb.gain, live ? 0.05 : 0, t, 0.6);
}

