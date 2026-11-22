/* ================= capture: screenshot, recording, photo mode, fullscreen ================= */
// The view keeps no copy of its last frame (no preserveDrawingBuffer), so captures are taken inside the frame,
// right after the view and the overlay are drawn: the loop calls capFrame only while a screenshot or a clip is wanted.
const root = document.documentElement;
const stamp = ext => { const d = new Date(), p = n => String(n).padStart(2, '0');
  return `ringdown-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`; };
function paintCap(cv, W, H) {   // the view plus the overlay (labels, orbits, jets), fitted into W×H
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const x = cv.getContext('2d', { alpha:false }), k = Math.min(W / vw, H / vh), dw = vw * k, dh = vh * k, dx = (W - dw) / 2, dy = (H - dh) / 2;
  if (dx > 0.5 || dy > 0.5) { x.fillStyle = '#04050b'; x.fillRect(0, 0, W, H); }
  x.drawImage(view, dx, dy, dw, dh); x.drawImage(ui, dx, dy, dw, dh);
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
// touch devices get the share sheet (save to photos, send) where it takes files; everything else downloads
function saveFile(blob, name) {
  try {
    const f = coarse && navigator.canShare && new File([blob], name, { type: blob.type });
    if (f && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: 'Ringdown' }).catch(e => { if (e.name !== 'AbortError') download(blob, name); }); return; }
  } catch (e) {}
  download(blob, name);
}
let shotWant = false;
const shot = () => { shotWant = true; };
function capFrame() {
  if (rec) paintCap(rec.cv, rec.cv.width, rec.cv.height);
  if (!shotWant) return;
  shotWant = false;
  const cv = document.createElement('canvas'), name = stamp('png');
  paintCap(cv, ui.width, ui.height);   // device resolution
  cv.toBlob(b => {
    if (!b) { toast('Screenshot failed', ['The browser could not make the image'], '', { ui: true }); return; }
    saveFile(b, name); toast('Screenshot saved', [name], '', { ui: true });
    if (photo) { photoWake(); $('photoShot').textContent = 'Saved'; setTimeout(() => { $('photoShot').textContent = 'Screenshot'; }, 1400); }
  }, 'image/png');
}

// recording: a canvas of the view's size gets view + overlay each frame while recording, and MediaRecorder encodes it
const REC_MAX = 60;   // seconds
const recType = audio => ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  .map(t => audio && t.includes('codecs') ? t + ',opus' : t).find(t => MediaRecorder.isTypeSupported(t));
const canRec = typeof MediaRecorder === 'function' && typeof MediaRecorder.isTypeSupported === 'function' && !!HTMLCanvasElement.prototype.captureStream && !!recType(false);
let rec = null;
function recStart() {
  const cv = document.createElement('canvas'), W = Math.max(2, view.width & ~1), H = Math.max(2, view.height & ~1);   // even sizes suit every encoder
  paintCap(cv, W, H);
  const stream = cv.captureStream(30);
  // sound on: tap the output after its compressor into the clip
  const src = soundOn && au && (au.comp || au.g); let tap = null;
  if (src && au.ctx.createMediaStreamDestination) { tap = au.ctx.createMediaStreamDestination(); src.connect(tap); for (const t of tap.stream.getAudioTracks()) stream.addTrack(t); }
  const type = recType(!!tap), chunks = [];
  const end = () => { stream.getTracks().forEach(t => t.stop()); if (tap) try { src.disconnect(tap); } catch (e) {} };
  let mr;
  try { mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 }); mr.start(1000); }
  catch (e) { end(); toast('Recording failed', ['This browser could not start a video recording'], '', { ui: true }); return; }
  const r = rec = { mr, cv, t0: performance.now(), tick: setInterval(recTick, 250), ms: 0, why: '' };
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.onerror = () => recStop();
  mr.onstop = async () => {
    end();
    if (!chunks.length) { toast('Recording failed', ['No video came through'], '', { ui: true }); return; }
    const mt = (mr.mimeType || type).split(';')[0], ext = mt.includes('mp4') ? 'mp4' : 'webm', name = stamp(ext);
    let blob = new Blob(chunks, { type: mt });
    if (ext === 'webm') blob = await webmLength(blob, r.ms);
    saveFile(blob, name); toast('Clip saved', [name, `${(r.ms / 1000).toFixed(1)} s${tap ? ' with sound' : ''}${r.why}`], '', { ui: true });
  };
  syncRec();
}
function recStop(why) {
  if (!rec) return;
  const r = rec; rec = null; clearInterval(r.tick);
  r.ms = performance.now() - r.t0; r.why = why || '';
  if (r.mr.state !== 'inactive') r.mr.stop();
  syncRec();
}
function recTick() {
  if (!rec) return;
  const s = (performance.now() - rec.t0) / 1000;
  if (s >= REC_MAX) { recStop(` · stopped at the ${REC_MAX} s limit`); return; }
  $('recT').textContent = `REC ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
function syncRec() {
  const on = !!rec, b = $('rec');
  b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Stop recording' : 'Record a clip');
  b.querySelector('span').textContent = on ? 'Stop recording' : 'Record';
  $('recind').hidden = !on; recTick();
}
// Chrome and Firefox write WebM clips without a length, which leaves them unseekable in many players: put it in the header
async function webmLength(blob, ms) {
  try {
    const h = new Uint8Array(await blob.slice(0, 8192).arrayBuffer());
    const vint = i => { let n = 1; while (n < 9 && !(h[i] & (0x100 >> n))) n++; let v = h[i] & (0xff >> n); for (let k = 1; k < n; k++) v = v * 256 + h[i + k]; return [v, n]; };
    for (let i = 0; i + 5 < h.length; i++) {
      if (h[i] !== 0x15 || h[i + 1] !== 0x49 || h[i + 2] !== 0xA9 || h[i + 3] !== 0x66) continue;   // Segment Info
      const [size, n] = vint(i + 4), s = i + 4 + n, e = s + size;
      if (n > 8 || e > h.length) return blob;
      let scale = 1e6;
      for (let j = s; j < e;) {   // its children: stop if a length is already there, note the timecode scale
        const idn = vint(j)[1], [sz, sn] = vint(j + idn);
        if (h[j] === 0x44 && h[j + 1] === 0x89) return blob;
        if (h[j] === 0x2A && h[j + 1] === 0xD7 && h[j + 2] === 0xB1) { scale = 0; for (let k = 0; k < sz; k++) scale = scale * 256 + h[j + idn + sn + k]; }
        j += idn + sn + sz;
      }
      const d = new Uint8Array(11); d[0] = 0x44; d[1] = 0x89; d[2] = 0x88; new DataView(d.buffer).setFloat64(3, ms * 1e6 / (scale || 1e6));
      const len = new Uint8Array(8); len[0] = 1; for (let k = 7, v = size + 11; k > 0; k--, v = Math.floor(v / 256)) len[k] = v % 256;
      return new Blob([blob.slice(0, i + 4), len, blob.slice(s, e), d, blob.slice(e)], { type: blob.type });
    }
  } catch (e) {}
  return blob;
}

// fullscreen on the whole page (not offered where the browser can't, e.g. iPhone)
const fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFS() {
  try {
    const p = fsEl() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
function syncFS() {
  const on = !!fsEl(), b = $('fs');
  b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
  b.querySelector('span').textContent = on ? 'Exit fullscreen' : 'Fullscreen';
}
document.addEventListener('fullscreenchange', syncFS); document.addEventListener('webkitfullscreenchange', syncFS);

// photo mode: pause, clean view without the bar, camera still free; leaving puts back exactly what was there
let photo = null, photoT = 0;
function photoWake(e) {
  if (e && e.type === 'pointermove' && e.buttons) return;   // not while dragging the view around
  root.classList.remove('photo-idle'); clearTimeout(photoT);
  photoT = setTimeout(() => root.classList.add('photo-idle'), 2600);
}
function setPhoto(on) {
  if (!on === !photo) return;
  if (on) {
    photo = { paused, clean: root.classList.contains('clean'), panel: !$('panel').hidden };
    closeCap(); paused = true; syncPlay(); setClean(true); root.classList.add('photo');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    $('photoHelp').textContent = coarse ? 'Drag to pan · pinch to zoom · dial to tilt' : 'Drag to pan · scroll to zoom · right-drag to tilt · P saves · Esc exits';
    photoWake(); addEventListener('pointermove', photoWake, true); addEventListener('pointerdown', photoWake, true);
  } else {
    const p = photo; photo = null;
    removeEventListener('pointermove', photoWake, true); removeEventListener('pointerdown', photoWake, true);
    clearTimeout(photoT); root.classList.remove('photo', 'photo-idle');
    setClean(p.clean); paused = p.paused; syncPlay();
    if (p.panel) { $('panel').hidden = false; $('gear').setAttribute('aria-expanded', 'true'); $('gear').setAttribute('aria-pressed', 'true'); }
  }
}

// on narrow bars the capture buttons live in a menu under the camera button
const capEl = $('cap');
function closeCap() { capEl.classList.remove('open'); $('capMore').setAttribute('aria-expanded', 'false'); $('capMore').setAttribute('aria-pressed', 'false'); }
$('capMore').addEventListener('click', () => {
  const on = !capEl.classList.contains('open'); capEl.classList.toggle('open', on);
  $('capMore').setAttribute('aria-expanded', String(on)); $('capMore').setAttribute('aria-pressed', String(on));
});
capEl.addEventListener('click', e => { if (e.target.closest('button')) closeCap(); });
addEventListener('pointerdown', e => { if (capEl.classList.contains('open') && !capEl.contains(e.target) && !$('capMore').contains(e.target)) closeCap(); });
$('shot').addEventListener('click', shot);
$('photoShot').addEventListener('click', shot);
$('rec').hidden = !canRec;
$('rec').addEventListener('click', () => rec ? recStop() : recStart());
$('recind').addEventListener('click', () => recStop());
$('photo').addEventListener('click', () => setPhoto(true));
$('photoExit').addEventListener('click', () => setPhoto(false));
$('fs').hidden = !fsOK;
$('fs').addEventListener('click', toggleFS);

