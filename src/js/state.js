/* ================= state ================= */
let bodies = [];
let nextId = 1;
let simTime = 0;
let paused = false;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 16, 64];
let speedIdx = 2;
let slow = 1, slowHoldUntil = -1;
let gwBoost = 1;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const opt = { slow:true, lens:true, bloom:true, waves:!reduceMotion, jets:true, trails:true, labels:true, follow:true, fps:false };
let tool = 'move';
let bhMass = 30, bhSpin = 0;
let camX = 0, camY = 0, camZ = 0, zoom = 1;
let tiltDeg = 0, cosI = 1, sinI = 0, yaw = 0, cY = 1, sY = 0;
let zOn = false;       // a 3D scene: bodies and matter have a height z above the plane (toward the viewer face-on). Every other scene stays flat (z = 0)
let followId = null, followPos = null; // null = automatic focus
let warp = 1;          // sim seconds per screen second at 1x speed (huge for the galactic-center scene)
let realSizes = false; // stars placed at their true radii (galactic-center scene)
let tdeSlowUntil = -1e9, tdeSlow = 1 / 40, breakFrame = false, trailEvery = 2;
let shake = -1e9, shX = 0, shY = 0;   // brief camera shake when something explodes
const placed = [];                     // ids of objects the viewer placed, for undo
let totalFed = 0, totalWind = 0;
let gwSrc = null;
let currentPreset = 'kerr';
let wallNow = 0;
const flashes = [];
// Everything random in the simulation draws from this seeded generator (mulberry32), so the same seed plays out the
// same way. Each scene gets a fresh seed; share links carry the generator's state. (Camera shake stays on Math.random:
// it is only for the eye and never touches the simulation.)
let rngS = 1;
function reseed(s) { rngS = s >>> 0; }
const newSeed = () => Math.floor(Math.random() * 4294967296);
function rand() {
  let t = rngS = (rngS + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

const MAXG = 20000;
let gasCap = 3200;       // soft budget for streamed gas; the frame-time governor moves it, up to Q.gas
const gx = new Float64Array(MAXG), gy = new Float64Array(MAXG), gvx = new Float64Array(MAXG), gvy = new Float64Array(MAXG);
const gm = new Float64Array(MAXG), gage = new Float64Array(MAXG); const gb = new Uint8Array(MAXG), gf = new Uint8Array(MAXG), gsrc = new Int32Array(MAXG);
let gN = 0;
// for drawing: distance to, and velocity relative to, whatever each particle is orbiting (0 = not bound to anything yet)
const grh = new Float32Array(MAXG), grvx = new Float32Array(MAXG), grvy = new Float32Array(MAXG);

/* Kerr helpers: a > 0 prograde. Radii in units of M = GM/c^2 = r_s/2 */
function riscoM(a) {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  return 3 + z2 - Math.sign(a) * Math.sqrt(Math.max(0, (3 - z1) * (3 + z1 + 2 * z2)));
}
const eIsco = a => Math.sqrt(1 - 2 / (3 * riscoM(a)));
function updateKerr(b) {
  const a = Math.min(Math.abs(b.chi), 0.998);
  if (b._a === a) return;
  b._a = a; b.kP = riscoM(a) / 6; b.kR = riscoM(-a) / 6; b.kPlus = (1 + Math.sqrt(1 - a * a)) / 2;
}

function makeBH(x, y, vx, vy, m, chi = 0) {
  const b = { kind:'bh', id:nextId++, x, y, vx, vy, ax:0, ay:0, z:0, vz:0, az:0, m, chi, ring:null, trail:[], fedFrame:0, feedRate:0, grbT:-1e9, _a:-1, kP:1, kR:1, kPlus:1 };
  updateKerr(b); return b;
}
function makeStar(tid, x, y, vx, vy, m) {
  const t = TYPE[tid], mm = m || t.m;
  const R0 = t.kind === 'planet' ? planetR(mm, realSizes) : realSizes ? t.Rsun * RSUN_U * (t.kind === 'ms' ? Math.pow(mm / t.m, 0.8) : 1) : t.R;
  const s = { kind:'star', id:nextId++, type:t, x, y, vx, vy, ax:0, ay:0, z:0, vz:0, az:0, m:mm, m0:mm, R:R0, R0, real: realSizes, trail:[], emitAcc:0, f:0, hx:0, hy:0, noted:false,
    core: t.core ? t.core * mm / t.m : 0, ep: null, passes: 0, mBirth: mm };
  if (t.kind === 'ns') { s.spinHz = 1 + 3 * rand(); s.beamPh = rand() * 6.28; s.msp = false; }
  if (tid === 'MAG') { s.spinHz = 0.1 + 0.2 * rand(); s.flareAt = wallNow + 5000 + 6000 * rand(); s.flares = 0; }   // magnetars spin slowly: their field has braked them
  return s;
}
const isNS = b => b.kind === 'star' && b.type.kind === 'ns';
const isMag = b => b.kind === 'star' && b.type.id === 'MAG';
const isWD = b => b.kind === 'star' && b.type.kind === 'wd';
// compact objects radiate gravitational waves strongly enough to inspiral; holes and neutron stars can also accrete gas
const isCompact = b => b.kind === 'bh' || isNS(b) || isWD(b);
const isAccretor = b => b.kind === 'bh' || isNS(b) || isWD(b);
function addGas(x, y, vx, vy, m, src) {
  if (gN >= MAXG) return false;
  gx[gN] = x; gy[gN] = y; gvx[gN] = vx; gvy[gN] = vy; gm[gN] = m; gage[gN] = 0; gb[gN] = 9; gf[gN] = 0; gsrc[gN] = src || 0; grh[gN] = 0; gN++;
  return true;
}
function removeGas(i) {
  gN--;
  gx[i] = gx[gN]; gy[i] = gy[gN]; gvx[i] = gvx[gN]; gvy[i] = gvy[gN]; gm[i] = gm[gN]; gage[i] = gage[gN]; gb[i] = gb[gN]; gf[i] = gf[gN]; gsrc[i] = gsrc[gN]; grh[i] = grh[gN]; grvx[i] = grvx[gN]; grvy[i] = grvy[gN];
}
const bhList = () => bodies.filter(b => b.kind === 'bh');
// how far apart two bodies are: in a 3D scene their heights count too, so orbits that only cross on screen never touch
const sepOf = (a, b) => zOn ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : Math.hypot(b.x - a.x, b.y - a.y);
// height and vertical speed of what two merging bodies leave, mass-weighted like x and vx (always 0 in a flat scene)
function zmix(d, a, b) { const M = a.m + b.m; d.z = (a.z * a.m + b.z * b.m) / M; d.vz = (a.vz * a.m + b.vz * b.m) / M; }

