/* ---------- share links ----------
   The whole setup (bodies, camera, scene scale) is packed into the link's #hash: JSON, deflated, then written in
   base32 (letters and digits only, so it survives as a plain #name everywhere). Gas isn't saved. */
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const num = v => +(+v).toPrecision(9);
// Off the plane (3D scenes), a body's height and vertical speed are appended, and the camera's height: only when not zero,
// so flat setups make exactly the links they always did, and older links (without them) load as they always did.
const zTail = b => b.z || b.vz ? [num(b.z), num(b.vz)] : [];
function snapshot() {
  return { v: 1, p: currentPreset, r: rngS, w: num(warp), rs: realSizes ? 1 : 0, te: trailEvery, t: num(tiltDeg), y: num(yaw), z: num(zoom), c: camZ ? [num(camX), num(camY), num(camZ)] : [num(camX), num(camY)],
    f: followId != null ? bodies.findIndex(b => b.id === followId) : -1,
    b: bodies.map(b => b.kind === 'bh'
      ? ['h', num(b.m), num(b.x), num(b.y), num(b.vx), num(b.vy), num(b.chi), b.label || '', ...zTail(b)]
      : ['s', b.type.id, num(b.m), num(b.x), num(b.y), num(b.vx), num(b.vy), num(b.R), num(b.mBirth || b.m), num(b.core || 0), b.label || '', b.real ? 1 : 0, num(b.spinHz || 0), b.col || 0, ...zTail(b)]) };
}
function restore(st) {
  toastsEl.replaceChildren();
  bodies = []; gN = 0; qN = 0; gwSrc = null; flashes.length = 0; totalFed = 0; totalWind = 0; closeUpId = null; closeUpDrift = null;
  scopeBuf.fill(0); scopeMark.fill(0); freqBuf.fill(0); xrBuf.fill(0);
  warp = st.w || 1; realSizes = !!st.rs; trailEvery = st.te || 2; tdeSlowUntil = -1e9; qScale = grainScale();
  reseed(Number.isFinite(st.r) ? st.r : newSeed());   // links made before seeds existed get a fresh one
  const zOf = (b, a, i) => { if (a.length > i + 1) { b.z = +a[i] || 0; b.vz = +a[i + 1] || 0; } };
  for (const a of st.b || []) {
    if (a[0] === 'h') { const b = makeBH(a[2], a[3], a[4], a[5], a[1], a[6]); if (a[7]) b.label = a[7]; zOf(b, a, 8); bodies.push(b); continue; }
    if (!TYPE[a[1]]) continue;
    const b = makeStar(a[1], a[3], a[4], a[5], a[6], a[2]);
    b.R = b.R0 = a[7]; b.mBirth = a[8]; b.core = a[9]; if (a[10]) b.label = a[10]; b.real = !!a[11]; if (isNS(b) && a[12]) b.spinHz = a[12]; if (Array.isArray(a[13])) b.col = a[13]; zOf(b, a, 14);
    bodies.push(b);
  }
  zOn = !!(PRESETS[st.p] && PRESETS[st.p].d3) || bodies.some(b => b.z || b.vz);
  setTilt(st.t || 0); setYaw(st.y || 0); zoom = st.z || 1; camX = st.c ? st.c[0] : 0; camY = st.c ? st.c[1] : 0; camZ = zOn && st.c && st.c[2] || 0;
  followId = st.f >= 0 && bodies[st.f] ? bodies[st.f].id : null; opt.follow = true; syncToggles();
  if (PRESETS[st.p]) { currentPreset = st.p; presetSel.value = st.p; }
  setLandmarks(st.p);
  computeAccel(); renderMoveCtx(true);
}
function toB32(bytes) {
  let out = '', bits = 0, val = 0;
  for (const by of bytes) { val = (val << 8) | by; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function fromB32(str) {
  const out = []; let bits = 0, val = 0;
  for (const ch of str) { const i = B32.indexOf(ch); if (i < 0) throw new Error('bad link'); val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
async function pipeBytes(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
async function encodeState() {
  const raw = new TextEncoder().encode(JSON.stringify(snapshot()));
  if (typeof CompressionStream === 'function') { try { return 's1z-' + toB32(await pipeBytes(raw, new CompressionStream('deflate-raw'))); } catch (e) {} }
  return 's1r-' + toB32(raw);
}
async function decodeState(code) {
  const m = /^s1([zr])-([a-z2-7]+)$/.exec(code); if (!m) return null;
  let bytes = fromB32(m[2]);
  if (m[1] === 'z') bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function loadFromHash() {
  const h = location.hash.slice(1); if (!/^s1[zr]-/.test(h)) return false;
  try { const st = await decodeState(h); if (!st) return false; restore(st); toast('Shared setup loaded', [`${bodies.length} objects, exactly as they were when the link was made`]); return true; }
  catch (e) { toast('Link not readable', ['That link looks incomplete or damaged, so the default scene is shown instead']); return false; }
}
const sharePop = $('sharepop');
$('share').addEventListener('click', async () => {
  if (!sharePop.hidden) { sharePop.hidden = true; $('share').setAttribute('aria-expanded', 'false'); return; }
  const code = await encodeState();
  try { history.replaceState(null, '', '#' + code); } catch (e) { location.hash = code; }
  const topLevel = (() => { try { return window.top === window; } catch (e) { return false; } })();
  $('shareUrl').value = location.href;
  $('shareNote').textContent = topLevel
    ? `Anyone opening this link gets this exact setup: ${bodies.length} objects, the camera and the view. Gas clouds and debris aren't included.`
    : `The setup is now in this page's address. Copy the address, or use the Share menu, to send it. Gas clouds and debris aren't included.`;
  sharePop.hidden = false; $('share').setAttribute('aria-expanded', 'true');
  $('shareUrl').focus(); $('shareUrl').select();
});
$('shareCopy').addEventListener('click', () => {
  const el = $('shareUrl'), done = () => { $('shareCopy').textContent = 'Copied'; setTimeout(() => { $('shareCopy').textContent = 'Copy'; }, 1600); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(done, () => { el.focus(); el.select(); });
  else { el.focus(); el.select(); }
});
addEventListener('pointerdown', e => { if (!sharePop.hidden && !sharePop.contains(e.target) && !$('share').contains(e.target)) { sharePop.hidden = true; $('share').setAttribute('aria-expanded', 'false'); } });
addEventListener('hashchange', () => { loadFromHash(); });

