/* ================= gravitational-wave source + scope ================= */
const SCOPE_N = 540;
const scopeBuf = new Float32Array(SCOPE_N), scopeMark = new Uint8Array(SCOPE_N), freqBuf = new Float32Array(SCOPE_N), xrBuf = new Float32Array(SCOPE_N);
let xrMax = 1e-6;
let scopeHead = 0, scopeMax = 0.5, markScope = false;
let fgwText = 'no source', audioF = 0, audioEnv = 0;

function closestPair() {
  const cs = bodies.filter(isCompact); let best = null, bs = 0;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j], r = sepOf(a, b);
    const s = a.m * b.m / r;
    if (s > bs) { bs = s; best = [a, b, r]; }
  }
  return best;
}
function updateGW() {
  const pair = closestPair();
  let h = 0, f = 0, env = 0;
  const ringT = gwSrc && gwSrc.mode === 'ring' ? simTime - gwSrc.tm : Infinity;
  const ringStrain = ringT < 12 * (gwSrc ? gwSrc.tau : 0);
  if (gwSrc && gwSrc.mode === 'ring' && (ringStrain || !pair)) {
    const rem = bodies.find(b => b.id === gwSrc.remId);
    if (rem) { gwSrc.cx = rem.x; gwSrc.cy = rem.y; }
    if (ringStrain) {
      env = gwSrc.Ar * Math.exp(-ringT / gwSrc.tau);
      h = env * Math.cos(2 * gwSrc.phi + gwSrc.wq * ringT);
      f = gwSrc.fReal;
      fgwText = `ringdown ${fmtHz(gwSrc.fReal)} · τ ${(gwSrc.tauReal * 1000).toFixed(gwSrc.tauReal < 0.001 ? 2 : 1)} ms`;
    } else {
      fgwText = `remnant · ringdown ${fmtHz(gwSrc.fReal)}`;
      if (ringT * C * zoom > Math.hypot(vw, vh) * 1.5) gwSrc = null;
    }
  } else if (pair) {
    const [a, b, r] = pair, w = pairWave(a, b), M = a.m + b.m;
    gwSrc = { mode:'binary', cx:(a.x * a.m + b.x * b.m) / M, cy:(a.y * a.m + b.y * b.m) / M, phi:w.phi, om:w.om, A:w.A, vis:w.vis, sep:r };
    env = w.A; h = w.A * Math.cos(2 * w.phi);
    f = Math.abs(w.om) / Math.PI / SIM2REAL;
    fgwText = `f_GW ${fmtHz(f)} · ${fmtDist(r * KM_PER_UNIT)} apart`;
  } else {
    gwSrc = null; fgwText = bodies.length ? 'no binary' : 'no source';
  }
  audioF = f; audioEnv = env;
  if (!paused) {
    let xr = 0; for (const b of bodies) if (isAccretor(b)) xr += b.feedRate || 0;
    xrBuf[scopeHead] = xr;
    scopeBuf[scopeHead] = h; freqBuf[scopeHead] = f; scopeMark[scopeHead] = markScope ? 1 : 0; markScope = false;
    scopeHead = (scopeHead + 1) % SCOPE_N;
  }
}

