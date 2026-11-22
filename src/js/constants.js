/* ================= constants ================= */
const G = 1.5e5;                 // world^3 / (Msun s^2)
const KR = 0.25;                 // Schwarzschild radius per Msun (world units)
const C = Math.sqrt(2 * G / KR); // ~1095 world/s
const G4C5 = G ** 4 / C ** 5;
const KM_PER_UNIT = 2.9532 / KR; // 11.8 km
const TSUN_SIM = G / (C * C * C);
const TSUN_REAL = 4.925491e-6;
const SIM2REAL = TSUN_REAL / TSUN_SIM; // real s per sim s
const ISCO_K = Math.sqrt(27 * KR * KR * KR / G);
const rsOf = m => KR * m;
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

// Star types, grouped as the toolbar shows them. R is the drawn radius in sim units: ordered like real stars,
// but thousands of times smaller than life (except neutron stars, which are true size).
const STAR_TYPES = [
  { g:1, id:'NS', Rsun:1.72e-05,  name:'Neutron star',     short:'Neutron star', m:1.4, R:1.0, T:1e6, col:[200,230,255], kind:'ns' },
  { g:1, id:'MAG', Rsun:1.72e-05, name:'Magnetar', eg:'like SGR 1806−20', short:'Magnetar', m:1.4, R:1.0, T:1e6, col:[226,186,255], kind:'ns' },
  { g:2, id:'BD', Rsun:0.1,  name:'Brown dwarf',      short:'Brown dwarf', m:0.05, R:0.9, T:1800, col:[176,84,60], kind:'bd' },
  { g:2, id:'M', Rsun:0.3,   name:'M dwarf', eg:'like Proxima Centauri',          short:'M dwarf',   m:0.3, R:2.0, T:3200,  col:[255,132,88],  kind:'ms' },
  { g:2, id:'K', Rsun:0.75,   name:'K dwarf',          short:'K dwarf',   m:0.7, R:2.8, T:4400,  col:[255,188,118], kind:'ms' },
  { g:2, id:'G', Rsun:1.0,   name:'G dwarf', eg:'like the Sun', short:'G · Sun-like', m:1.0, R:3.4, T:5800, col:[255,230,165], kind:'ms' },
  { g:2, id:'F', Rsun:1.3,   name:'F star',           short:'F star',    m:1.4, R:4.0, T:6700,  col:[255,246,226], kind:'ms' },
  { g:2, id:'A', Rsun:1.8,   name:'A star',           short:'A star',    m:2.0, R:5.0, T:8800,  col:[224,233,255], kind:'ms' },
  { g:2, id:'B', Rsun:3.5,   name:'B star',           short:'B star',    m:6.0, R:7.0, T:18000, col:[168,196,255], kind:'ms' },
  { g:2, id:'O', Rsun:10,   name:'O star',           short:'O star',    m:20,  R:10,  T:38000, col:[138,172,255], kind:'ms' },
  { g:3, id:'RG', Rsun:25,  name:'Red giant', eg:'like Arcturus',        short:'Red giant', m:1.2, R:22,  T:3900,  col:[255,116,72],  kind:'giant', core:0.35 },
  { g:3, id:'YSG', Rsun:46, name:'Yellow supergiant', eg:'like Polaris', short:'Yellow supergiant', m:6, R:26, T:6000, col:[255,232,160], kind:'giant', core:1.8 },
  { g:3, id:'RSG', Rsun:760, name:'Red supergiant', eg:'like Betelgeuse', short:'Red supergiant', m:18, R:46, T:3500, col:[255,94,58], kind:'giant', core:6 },
  { g:3, id:'BSG', Rsun:78, name:'Blue supergiant', eg:'like Rigel',  short:'Blue supergiant', m:25, R:30, T:22000, col:[122,164,255], kind:'giant', core:9 },
  { g:3, id:'LBV', Rsun:100, name:'Luminous blue variable', eg:'like Eta Carinae', short:'Luminous blue variable', m:90, R:28, T:20000, col:[178,206,255], kind:'giant', core:40 },
  { g:3, id:'WR', Rsun:1.5,  name:'Wolf–Rayet star', eg:'like WR 104',  short:'Wolf–Rayet', m:12, R:4.2, T:60000, col:[150,186,255], kind:'ms' },
  { g:4, id:'WD', Rsun:0.011,  name:'White dwarf', eg:'like Sirius B',      short:'White dwarf', m:0.8, R:1.6, T:20000, col:[236,242,255], kind:'wd' },
  { g:4, id:'HeWD', Rsun:0.02, name:'Helium white dwarf', short:'He white dwarf', m:0.35, R:1.9, T:25000, col:[226,236,255], kind:'wd' },
  { g:4, id:'sdB', Rsun:0.2, name:'Hot subdwarf',     short:'Hot subdwarf', m:0.5, R:2.4, T:30000, col:[176,200,255], kind:'ms' },
  { g:4, id:'RCB', Rsun:70, name:'R Coronae Borealis star', eg:'like R CrB itself', short:'R CrB star', m:0.9, R:14, T:6500, col:[255,224,168], kind:'giant', core:0.8 },
  // cold bodies. Their radius comes from their mass (planetR), so R and Rsun here are only the toolbar defaults.
  { g:5, id:'AST',  Rsun:0.00068, name:'Asteroid', eg:'like Ceres',            short:'Asteroid',     m:4.7e-10,  R:0.16, T:170, col:[168,156,142], kind:'planet' },
  { g:5, id:'MOON', Rsun:0.0025,  name:'Small world', eg:'like the Moon or Pluto', short:'Moon',     m:3.694e-8, R:0.31, T:250, col:[196,192,184], kind:'planet' },
  { g:5, id:'ROCK', Rsun:0.00916, name:'Rocky planet', eg:'like Earth',        short:'Rocky planet', m:3.003e-6, R:0.5,  T:288, col:[98,152,224],  kind:'planet' },
  { g:5, id:'ICE',  Rsun:0.0354,  name:'Ice giant', eg:'like Neptune',         short:'Ice giant',    m:5.15e-5,  R:0.62, T:72,  col:[124,190,226], kind:'planet' },
  { g:5, id:'GAS',  Rsun:0.1005,  name:'Gas giant', eg:'like Jupiter',         short:'Gas giant',    m:9.546e-4, R:0.75, T:165, col:[216,174,126], kind:'planet' },
];
const RSUN_U = 696000 / KM_PER_UNIT; // one solar radius in sim units
// lowercase name for use mid-sentence, keeping proper names (Wolf–Rayet, R Coronae Borealis) capitalized
for (const t of STAR_TYPES) t.lc = /Wolf|Coronae/.test(t.name) ? t.name : /^[A-Z] /.test(t.name) ? t.name[0] + t.name.slice(1).toLowerCase() : t.name.toLowerCase();
const TYPE = Object.fromEntries(STAR_TYPES.map(t => [t.id, t]));

