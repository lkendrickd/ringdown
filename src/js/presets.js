/* ================= presets ================= */
const PRESETS = {
  kerr:     { name:'Spinning hole, tilted view', extent:100, tilt:64, build() {
      const bh = makeBH(0, 0, 0, 0, 18, 0.92); const st = makeStar('RG', 0, 0, 0, 0);
      bodies.push(bh, st); orbitAround(bh, st, 22 / (1.06 * rocheFrac(1.2 / 18)), 0); } },
  gw150914: { name:'Binary merger · 36 + 29', extent:150, build() { addPair(makeBH(0,0,0,0,36), makeBH(0,0,0,0,29), 100); } },
  aligned:  { name:'Aligned spins · 30 + 30, χ 0.9', extent:150, tilt:35, build() { addPair(makeBH(0,0,0,0,30,0.9), makeBH(0,0,0,0,30,0.9), 100); } },
  ratio:    { name:'Lopsided merger · 40 + 8', extent:110, build() { addPair(makeBH(0,0,0,0,40), makeBH(0,0,0,0,8), 72); } },
  bns:      { name:'Neutron star merger · GW170817-like', extent:20, build() { addPair(makeStar('NS',0,0,0,0,1.46), makeStar('NS',0,0,0,0,1.27), 11); } },
  wdns:     { name:'White dwarf meets neutron star', extent:12, build() { addPair(makeStar('NS',0,0,0,0,1.4), makeStar('WD',0,0,0,0,0.8), 7.2); } },
  nsbh:     { name:'Neutron star vs. spinning hole', extent:26, tilt:40, build() {
      const bh = makeBH(0, 0, 0, 0, 6, 0.8); const ns = makeStar('NS', 0, 0, 0, 0); bodies.push(bh, ns); orbitAround(bh, ns, 14, 0); } },
  feeding:  { name:'Red giant feeding a hole', extent:170, build() {
      const bh = makeBH(0, 0, 0, 0, 12); const st = makeStar('RG', 0, 0, 0, 0);
      bodies.push(bh, st); orbitAround(bh, st, 22 / (1.05 * rocheFrac(1.2 / 12)), 0); } },
  partial:  { name:'Repeating partial disruption', extent:230, build() {
      // a red giant on a stretched orbit: each close pass overflows its Roche lobe by ~25% and strips a little
      const M = 20, bh = makeBH(0, 0, 0, 0, M), st = makeStar('RG', 0, 0, 0, 0), Mt = M + st.m;
      const rp = st.R / (rocheFrac(st.m / M) * 1.25), ra = 330, a = (rp + ra) / 2;
      const va = Math.sqrt(G * Mt * (2 / ra - 1 / a));
      st.x = ra * M / Mt; bh.x = -ra * st.m / Mt; st.vy = -va * M / Mt; bh.vy = va * st.m / Mt;
      bodies.push(bh, st); } },
  bsg:      { name:'Blue supergiant + hole', extent:130, build() {
      const bh = makeBH(0, 0, 0, 0, 20, 0.5); const st = makeStar('BSG', 0, 0, 0, 0);
      bodies.push(bh, st); orbitAround(bh, st, 30 / (1.04 * rocheFrac(25 / 20)), Math.PI); } },
  engulf:   { name:'Common envelope · supergiant engulfs a hole', extent:130, build() {
      const bh = makeBH(0, 0, 0, 0, 10, 0.3); const st = makeStar('BSG', 0, 0, 0, 0);
      bodies.push(bh, st); orbitAround(bh, st, 30 / (1.06 * rocheFrac(25 / 10)), Math.PI); } },
  nova:     { name:'Nova · K dwarf feeding a white dwarf', extent:24, build() {
      const wd = makeStar('WD', 0, 0, 0, 0, 1.0); const st = makeStar('K', 0, 0, 0, 0);
      bodies.push(wd, st); orbitAround(wd, st, 2.8 / (1.03 * rocheFrac(0.7 / 1.0)), 0); } },
  sgra:     { name:'Sgr A* · the S-stars at the galactic center', extent:1500 * 1.496e8 / KM_PER_UNIT, real:true, trailEvery: 7,
    // S2's 16.05-year orbit takes about 32 screen seconds
    warp: 16.05 * 3.156e7 / SIM2REAL / 32,
    build() {
      const hole = makeBH(0, 0, 0, 0, 4.3e6, 0.5); hole.label = 'Sgr A*'; bodies.push(hole);
      // name, type, mass, period (yr), eccentricity: orbits from GRAVITY/Keck fits, all drawn in one plane
      const S = [['S2','B',14,16.05,0.884],['S38','B',8,19.2,0.818],['S55','A',2.5,12.8,0.72],['S4711','A',2.2,7.6,0.768],['S4714','A',2,12.0,0.985]];
      S.forEach(([name, t, m, P, e], i) => {
        const st = makeStar(t, 0, 0, 0, 0, m); st.label = name;
        const aAU = Math.cbrt(P * P * (4.3e6 + m));
        keplerPlace(hole, st, aAU, e, i * 1.31 + 0.4, i % 2 ? -1 : 1, (i * 2.1) % (2 * Math.PI));
        bodies.push(st);
      }); } },
  spaghetti: { name:'Spaghettification close-up', extent:300, after() { const st = bodies.find(b => b.kind === 'star'); if (st) toggleCloseUp(st); }, build() { PRESETS.tde.build(); bodies = bodies.filter(b => !(b.kind === 'star' && b.type.id === 'K')); } },
  tde:      { name:'Tidal disruption', extent:300, build() {
      const M = 20, bh = makeBH(0, 0, 0, 0, M); const st = makeStar('RG', 0, 0, 0, 0);
      const rs = rsOf(M), rt = st.R / rocheFrac(st.m / M), rp = 0.45 * rt, r0 = 430;
      const v0 = Math.sqrt(2 * G * M / (r0 - rs)), vp = Math.sqrt(2 * G * M / (rp - rs));
      const vt = rp * vp / r0, vr = -Math.sqrt(Math.max(0, v0 * v0 - vt * vt));
      const th = Math.PI * 1.15, rx = Math.cos(th), ry = Math.sin(th);
      st.x = r0 * rx; st.y = r0 * ry; st.vx = rx * vr + ry * vt; st.vy = ry * vr - rx * vt;
      bodies.push(bh, st);
      const k = makeStar('K', 0, 0, 0, 0); bodies.push(k); orbitAround(bh, k, 170, 0.6); } },
  betelgeuse: { name:'Betelgeuse-like red supergiant', extent:110, build() {
      bodies.push(makeStar('RSG', 0, 0, 0, 0)); } },
  solar:    { name:'The Solar System · planets, belts and dwarf planets', extent: 34 * 1.496e8 / KM_PER_UNIT, real:true, trailEvery: 3, marks:'solar', orbits:true, d3:true,
    // one screen second is a quarter of a year: Earth goes round in 4 s, Jupiter in 47 s. Speed it up for the outer worlds.
    warp: 0.25 * 3.156e7 / SIM2REAL,
    build() {
      const D = Math.PI / 180, T = 2 * Math.PI, yr = 26.87; // years since J2000 (late 2026)
      const sun = makeStar('G', 0, 0, 0, 0, 1); sun.label = 'Sun'; bodies.push(sun);
      /* Every orbit in 3D, tilted to the ecliptic. Planets: JPL's J2000 mean elements (E. M. Standish, "Keplerian Elements for
         Approximate Positions of the Major Planets", table 1). Dwarf planets: inclination and node from the JPL Small-Body
         Database (J2000 ecliptic). The argument of perihelion is the longitude of perihelion less the node. */
      // name, type, mass (kg), radius (km), colour, a (AU), e, longitude of perihelion, mean longitude at J2000, inclination, ascending node (degrees)
      const P = [
        ['Mercury', 'ROCK', 3.301e23, 2439.7, [172,162,152], 0.387098, 0.205630, 77.458, 252.250, 7.005, 48.331],
        ['Venus',   'ROCK', 4.867e24, 6051.8, [234,206,150], 0.723332, 0.006772, 131.603, 181.979, 3.395, 76.680],
        ['Earth',   'ROCK', 5.972e24, 6371,   [98,152,224],  1.000003, 0.016709, 102.938, 100.465, 0, 0],
        ['Mars',    'ROCK', 6.417e23, 3389.5, [214,112,78],  1.523710, 0.093394, 336.056, 355.447, 1.850, 49.560],
        ['Jupiter', 'GAS',  1.898e27, 69911,  [216,174,126], 5.2029,   0.048386, 14.729, 34.396, 1.304, 100.474],
        ['Saturn',  'GAS',  5.683e26, 58232,  [228,202,152], 9.5367,   0.053862, 92.599, 49.955, 2.486, 113.662],
        ['Uranus',  'ICE',  8.681e25, 25362,  [160,222,228], 19.1892,  0.047257, 170.954, 313.238, 0.773, 74.017],
        ['Neptune', 'ICE',  1.024e26, 24622,  [92,128,232],  30.0699,  0.008590, 44.965, 304.880, 1.770, 131.784],
      ];
      const by = {};
      for (const [name, t, kg, km, col, a, e, peri, L0, inc, node] of P) {
        const b = world(t, name, kg, km, col), M = (((L0 - peri) + 360 * yr / Math.pow(a, 1.5)) * D) % T;
        eclPlace(sun, b, a, e, inc * D, node * D, peri * D, M); bodies.push(b); by[name] = b;
      }
      // dwarf planets: a, e, longitude of perihelion, mean anomaly now (from their perihelion dates), inclination, ascending node
      const W = [
        ['Ceres',    'AST',  9.38e20,  470,  [156,150,142], 2.767,  0.0785, 153.9, 308,    10.588, 80.249],
        ['Orcus',    'MOON', 6.3e20,   455,  [172,172,178], 39.42,  0.220,  341.1, 191,    20.557, 268.405],
        ['Pluto',    'MOON', 1.303e22, 1188, [216,190,160], 39.482, 0.2488, 224.1, 54,     17.148, 110.292],
        ['Haumea',   'MOON', 4.01e21,  800,  [226,226,230], 43.22,  0.196,  1.2,   225,    28.209, 121.786],
        ['Quaoar',   'MOON', 1.2e21,   545,  [178,132,112], 43.7,   0.041,  336,   300,    7.992,  188.919],
        ['Makemake', 'MOON', 3.1e21,   715,  [206,162,132], 45.56,  0.161,  14.4,  173,    29.028, 79.295],
        ['Gonggong', 'MOON', 1.75e21,  615,  [192,102,82],  67.38,  0.503,  184.5, 110,    30.899, 336.838],
        ['Eris',     'MOON', 1.66e22,  1163, [234,234,238], 67.78,  0.4361, 187.6, 212,    43.926, 36.005],
        ['Sedna',    'MOON', 1e21,     500,  [198,86,62],   506,    0.8496, 95.5,  358.32, 11.925, 144.506],
      ];
      for (const [name, t, kg, km, col, a, e, peri, M, inc, node] of W) { const b = world(t, name, kg, km, col); eclPlace(sun, b, a, e, inc * D, node * D, peri * D, M * D); bodies.push(b); }
      // the big moons: name, planet, mass (kg), radius (km), orbit radius (km), inclination to the ecliptic and its ascending node (degrees).
      // The Moon's node is where it is in late 2026 (it slides round in 18.6 years, a pull of the Sun the simulation reproduces on its own).
      // The others orbit in their planet's equator: Jupiter's and Saturn's poles from the IAU (Archinal et al. 2018), turned to the ecliptic.
      const Mn = [['Moon', 'Earth', 7.342e22, 1737.4, 384400, 5.145, 325.34], ['Io', 'Jupiter', 8.93e22, 1821.6, 421700, 2.217, 337.82], ['Europa', 'Jupiter', 4.8e22, 1560.8, 671100, 2.217, 337.82],
        ['Ganymede', 'Jupiter', 1.4819e23, 2634.1, 1070400, 2.217, 337.82], ['Callisto', 'Jupiter', 1.0759e23, 2410.3, 1882700, 2.217, 337.82], ['Titan', 'Saturn', 1.3452e23, 2574.7, 1221870, 28.052, 169.53]];
      Mn.forEach(([name, host, kg, km, a, inc, node], i) => { const b = world('MOON', name, kg, km, [200,196,188]); b.moonOf = by[host].id; circPlace(by[host], b, a / KM_PER_UNIT, inc * D, node * D, i * 1.9); bodies.push(b); });
      // belts, as loose matter on real kinds of orbits; each family with its typical spread of inclinations (Rayleigh, width in degrees)
      let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      let seed2 = 7; const rnd2 = () => (seed2 = (seed2 * 16807) % 2147483647) / 2147483647, tilt = w => w * D * Math.sqrt(-2 * Math.log(rnd2()));
      const tmp = { m: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
      const put = (a, e, peri, M, m, iw) => { eclPlace(sun, tmp, a, e, tilt(iw), T * rnd2(), peri, M); addMatter(tmp.x, tmp.y, tmp.vx, tmp.vy, m, 0, 1, tmp.z, tmp.vz); };
      const s = qScale, kb = 3e-11 / s;   // on a bigger matter budget: more grains, same mass in each belt
      for (let k = 0; k < 650 * s; k++) put(2.12 + 1.15 * rnd(), 0.02 + 0.16 * rnd(), T * rnd(), T * rnd(), 1.5e21 / 1.989e30 / (650 * s), 7);          // main belt
      const LJ = (34.396 + 360 * yr / Math.pow(5.2029, 1.5)) * D;
      for (let k = 0; k < 140 * s; k++) { const w = T * rnd(), L = LJ + (k % 2 ? 1 : -1) * (60 + 26 * (rnd() - 0.5)) * D; put(5.2029 + 0.1 * (rnd() - 0.5), 0.07 * rnd(), w, L - w, 1e20 / 1.989e30 / (140 * s), 10); } // Jupiter's Trojans, at L4 and L5
      for (let k = 0; k < 160 * s; k++) put(39.4 + 0.5 * (rnd() - 0.5), 0.1 + 0.2 * rnd(), T * rnd(), T * rnd(), kb, 9);                           // plutinos
      for (let k = 0; k < 620 * s; k++) put(42 + 6 * rnd(), 0.12 * rnd(), T * rnd(), T * rnd(), kb, k % 2 ? 2 : 10);                             // classical Kuiper belt: a flat cold half, a puffed-up hot half
      for (let k = 0; k < 220 * s; k++) { const a = 50 + 70 * rnd(), q = 33 + 7 * rnd(); put(a, 1 - q / a, T * rnd(), T * rnd(), kb, 14); }         // scattered disc
      let px = 0, py = 0, pz = 0; for (const b of bodies) if (b !== sun) { px += b.m * b.vx; py += b.m * b.vy; pz += b.m * b.vz; }
      sun.vx = -px / sun.m; sun.vy = -py / sun.m; sun.vz = -pz / sun.m;
    } },
  theia:    { name:'Giant impact · how the Moon formed', extent: 8.5 * 6371 / KM_PER_UNIT, real:true, orbits:true, warp: 600 / SIM2REAL,
    // a Mars-sized world, Theia, strikes the young Earth off-centre at just over escape speed. One screen second is 10 minutes:
    // the impact takes a few seconds, the disk a few minutes to gather (use the speed button).
    build() {
      const e = world('ROCK', 'Proto-Earth', 0.9 * 5.972e24, 0, [118,150,196]), th = world('ROCK', 'Theia', 0.13 * 5.972e24, 0, [204,122,92]);
      const Rc = e.R + th.R, GM = G * (e.m + th.m), vc = 1.08 * Math.sqrt(2 * GM / Rc), L = Rc * vc * Math.sin(40 * Math.PI / 180), r0 = 6.5 * e.R;
      const v0 = Math.sqrt(vc * vc - 2 * GM * (1 / Rc - 1 / r0)), vt = L / r0, vr = Math.sqrt(Math.max(0, v0 * v0 - vt * vt));
      th.x = -r0; th.vx = vr; th.vy = vt;
      e.vx = -th.vx * th.m / e.m; e.vy = -th.vy * th.m / e.m;
      bodies.push(e, th);
    } },
  saturn:   { name:'Rings · a moon strays inside the Roche limit', extent: 3.4 * 58232 / KM_PER_UNIT, real:true, orbits:true, tilt: 58, warp: 6000 / SIM2REAL,
    // an icy moon on a stretched orbit dips inside Saturn's Roche limit (as the lost moon "Chrysalis" may have, about 160 million years ago)
    build() {
      const R = 58232 / KM_PER_UNIT;
      const sat = world('GAS', 'Saturn', 5.683e26, 58232, [228,202,152]); bodies.push(sat);
      const m = world('MOON', 'Icy moon', 1.8e21, 735, [220,228,236]);
      const ra = 2.3 * R, rp = 1.22 * R, a = (ra + rp) / 2;   // softened gravity keeps it a little farther out than this at closest approach
      m.x = ra; m.vy = -Math.sqrt(G * sat.m * (2 / ra - 1 / a));
      const far = world('MOON', 'Outer moon', 1.1e20, 252, [214,222,232]); far.moonOf = sat.id;
      bodies.push(m, far); orbitAround(sat, far, 3.9 * R, 2.2);
    } },
  nursery:  { name:'Solar nebula · worlds gather from dust', extent: 3.6 * 1.496e8 / KM_PER_UNIT, real:true, orbits:true, trailEvery: 3, warp: 0.2 * 3.156e7 / SIM2REAL,
    build() {
      const AU = 1.496e8 / KM_PER_UNIT, sun = makeStar('G', 0, 0, 0, 0, 1); sun.label = 'Young star'; bodies.push(sun);
      let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const N = Math.min(4200 * qScale, Q.mat), Md = 0.004;   // a bigger matter budget makes more, lighter grains of the same disk; a lower quality setting fewer, heavier ones
      for (let k = 0; k < N; k++) {
        const r = (0.45 + 2.6 * Math.pow(rnd(), 0.8)) * AU, a = 2 * Math.PI * rnd(), v = Math.sqrt(G * sun.m / r) * (1 + 0.03 * (rnd() - 0.5));
        addMatter(r * Math.cos(a), r * Math.sin(a), Math.sin(a) * v, -Math.cos(a) * v, Md / N, 0);
      }
    } },
  magnetar: { name:'Magnetar · starquakes and giant flares', extent: 190, tilt: 35, build() {
      const mg = makeStar('MAG', 0, 0, 0, 0); mg.flareAt = wallNow + 4000; bodies.push(mg);
      const pl = makeStar('ROCK', 0, 0, 0, 0); bodies.push(pl); orbitAround(mg, pl, 150, 0.6);
      for (let k = 0; k < 520 * qScale; k++) { // a ring of rubble left over from the supernova that made it
        const r = 60 + 50 * rand(), a = rand() * Math.PI * 2, v = Math.sqrt(G * mg.m / r);
        addMatter(r * Math.cos(a), r * Math.sin(a), Math.sin(a) * v, -Math.cos(a) * v, 2e-9 / qScale, 0);
      }
    } },
  zoo:      { name:'Stellar zoo', extent:3500, build() {
      // a 300 Msun hole; orbits start well outside its innermost stable orbit (225 units) and are spaced 1.4x apart,
      // so each star stays clear of its neighbors' pull
      const bh = makeBH(0, 0, 0, 0, 300); bodies.push(bh);
      const plan = [['WD',320],['M',448],['K',627],['G',878],['F',1229],['A',1721],['B',2409],['RG',3373]];
      // place every star around a fixed hole, then remove the system's net momentum once
      // (letting each placement nudge the hole would leave earlier stars on oval orbits)
      plan.forEach(([t, r], i) => { const s = makeStar(t, 0, 0, 0, 0); bodies.push(s); orbitAround(bh, s, r, i * 2.39996); bh.vx = 0; bh.vy = 0; });
      let px = 0, py = 0, M = 0; for (const b of bodies) { px += b.m * b.vx; py += b.m * b.vy; M += b.m; }
      for (const b of bodies) { b.vx -= px / M; b.vy -= py / M; } } },
  chaos:    { name:'Three-body chaos', extent:150, build() {
      const m = 25, R = 62, s = R * Math.sqrt(3), w = Math.sqrt(G * 3 * m / (s * s * s));
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + k * 2 * Math.PI / 3, x = R * Math.cos(a), y = R * Math.sin(a);
        const v = w * R * (0.86 + (rand() - 0.5) * 0.06);
        bodies.push(makeBH(x, y, (y / R) * v, (-x / R) * v, m * (0.92 + rand() * 0.16), (rand() - 0.5) * 1.2));
      } } },
  empty:    { name:'Empty space', extent:200, build() {} },
};

// place `b` on a Keplerian orbit around `host` (at rest at the origin of its own motion)
// a named world with its real mass and (optionally) radius
function world(typeId, name, kg, km, col) {
  const b = makeStar(typeId, 0, 0, 0, 0, kg / 1.989e30); b.label = name;
  if (km) { b.R = b.R0 = km / KM_PER_UNIT; if (b.type.kind === 'planet') b.puff = b.R / planetR(b.m, true); }
  if (col) b.col = col;
  return b;
}
/* Things to find when you zoom out of the Solar System. Not simulated: nothing here moves on a human timescale.
   Stars sit at their true distance, in the direction of their right ascension. */
let landmarks = null;
const LANDMARKS = {
  solar: {
    rings: [[123, 'Heliopause · where the Sun’s wind gives way to interstellar gas'], [2000, 'Inner Oort cloud'], [50000, 'Outer Oort cloud · the Sun’s last comets']],
    probes: [['Voyager 1 · about one light-day out', 173 * 1.496e8, 17.25]],
    stars: [['Alpha Centauri', 4.37, 14.66, 'G'], ['Barnard’s Star', 5.96, 17.96, 'M'], ['Wolf 359', 7.86, 10.94, 'M'], ['Lalande 21185', 8.31, 11.06, 'M'],
      ['Sirius', 8.66, 6.75, 'A'], ['Luyten 726-8', 8.73, 1.65, 'M'], ['Ross 154', 9.70, 18.83, 'M'], ['Ross 248', 10.30, 23.70, 'M'], ['Epsilon Eridani', 10.47, 3.55, 'K'],
      ['Lacaille 9352', 10.72, 23.10, 'M'], ['Ross 128', 11.01, 11.80, 'M'], ['61 Cygni', 11.40, 21.12, 'K'], ['Procyon', 11.46, 7.66, 'F'], ['Tau Ceti', 11.91, 1.73, 'G']],
  },
};
function setLandmarks(id) { landmarks = PRESETS[id] && PRESETS[id].marks ? LANDMARKS[PRESETS[id].marks] : null; }
// The orbit each named world is on right now, worked out from its position and velocity (planetary scenes only).
function drawOrbits(c) {
  let star = null; for (const b of bodies) if (b.kind === 'star' && b.type.kind !== 'planet' && (!star || b.m > star.m)) star = b;
  c.save(); c.lineWidth = 1;
  for (const b of bodies) {
    if (!isPlanet(b) || !b.label) continue;
    const h = b.moonOf ? bodies.find(o => o.id === b.moonOf) : star;
    if (!h) continue;
    const rx = b.x - h.x, ry = b.y - h.y, rz = b.z - h.z, vx = b.vx - h.vx, vy = b.vy - h.vy, vz = b.vz - h.vz, r = zOn ? Math.hypot(rx, ry, rz) : Math.hypot(rx, ry), v2 = vx * vx + vy * vy + vz * vz, GM = G * (h.m + b.m);
    const E = 0.5 * v2 - GM / r; if (E >= 0) continue;
    const a = -GM / (2 * E); if (a * zoom < (b.moonOf ? 14 : 5)) continue;
    const rv = rx * vx + ry * vy + rz * vz, ex = ((v2 - GM / r) * rx - rv * vx) / GM, ey = ((v2 - GM / r) * ry - rv * vy) / GM, ez = ((v2 - GM / r) * rz - rv * vz) / GM;
    const e = Math.min(zOn ? Math.hypot(ex, ey, ez) : Math.hypot(ex, ey), 0.995), w = Math.atan2(ey, ex), pp = a * (1 - e * e);
    let P, Q;   // 3D: the orbit's own plane, P toward perihelion and Q square to it (normal × P, signed so a flat orbit is traced the same way round as below)
    if (zOn) {
      const el = Math.hypot(ex, ey, ez), nx = ry * vz - rz * vy, ny = rz * vx - rx * vz, nz = rx * vy - ry * vx, nl = Math.hypot(nx, ny, nz) * (nz < 0 ? -1 : 1);
      P = el > 1e-9 ? [ex / el, ey / el, ez / el] : [rx / r, ry / r, rz / r]; Q = [(ny * P[2] - nz * P[1]) / nl, (nz * P[0] - nx * P[2]) / nl, (nx * P[1] - ny * P[0]) / nl];
    }
    c.strokeStyle = `rgba(${b.col || b.type.col},${b.moonOf ? 0.22 : 0.3})`; c.beginPath();
    for (let k = 0; k <= 160; k++) {
      const th = k / 160 * Math.PI * 2, rr = pp / (1 + e * Math.cos(th));
      let x, y, z = 0;
      if (zOn) { const ct = Math.cos(th), st = Math.sin(th); x = h.x + rr * (ct * P[0] + st * Q[0]); y = h.y + rr * (ct * P[1] + st * Q[1]); z = h.z + rr * (ct * P[2] + st * Q[2]); }
      else { x = h.x + rr * Math.cos(th + w); y = h.y + rr * Math.sin(th + w); }
      k ? c.lineTo(toSX(x, y), toSY(x, y, z)) : c.moveTo(toSX(x, y), toSY(x, y, z));
    }
    c.stroke();
  }
  c.restore();
}
function drawLandmarks(c) {
  if (!landmarks) return;
  const sun = bodies.find(b => b.label === 'Sun') || { x: 0, y: 0, z: 0 };
  const X0 = toSX(sun.x, sun.y), Y0 = toSY(sun.x, sun.y, sun.z), AU = 1.496e8 / KM_PER_UNIT;
  c.save(); c.font = `400 10px ${MONO}`; c.textAlign = 'center';
  for (const [au, name] of landmarks.rings) {
    const r = au * AU * zoom; if (r < 46 || r > 6000) continue;
    c.setLineDash([2, 6]); c.strokeStyle = 'rgba(127,211,230,0.32)'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(X0, Y0, r, r * cosI, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    c.fillStyle = 'rgba(127,211,230,0.75)'; c.fillText(`${name} · ${au.toLocaleString('en-US')} AU`, X0, Y0 - r * cosI - 6);
  }
  const lab = [];
  const dot = (km, raH, col, label, big) => {
    const a = raH / 24 * Math.PI * 2, d = km / KM_PER_UNIT, x = sun.x + d * Math.cos(a), y = sun.y - d * Math.sin(a);
    const X = toSX(x, y), Y = toSY(x, y, sun.z);
    if (X < -40 || Y < -20 || X > vw + 40 || Y > vh + 20 || d * zoom < 30) return;
    const g = c.createRadialGradient(X, Y, 0, X, Y, big ? 9 : 5);
    g.addColorStop(0, `rgba(${col},0.95)`); g.addColorStop(0.3, `rgba(${col},0.5)`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(X - 10, Y - 10, 20, 20);
    if (lab.some(q => Math.abs(q[0] - X) < 90 && Math.abs(q[1] - Y) < 12)) return;
    lab.push([X, Y]);
    c.fillStyle = `rgba(${col},0.9)`; c.fillText(label, X, Y - 10);
  };
  for (const [name, km, ra] of landmarks.probes) dot(km, ra, '236,230,218', name, false);
  for (const [name, ly, ra, t] of landmarks.stars) dot(ly * 9.461e12, ra, TYPE[t].col.join(','), `${name} · ${ly} light-years`, true);
  c.restore();
}
function keplerPlace(host, b, aAU, e, omega, sense, meanAnom) {
  const AU = 1.496e8 / KM_PER_UNIT, a = aAU * AU, GM = G * (host.m + b.m);
  let E = meanAnom; for (let k = 0; k < 30; k++) E -= (E - e * Math.sin(E) - meanAnom) / (1 - e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = a * (1 - e * Math.cos(E)), p = a * (1 - e * e), vk = Math.sqrt(GM / p);
  let x = r * Math.cos(nu), y = r * Math.sin(nu), vx = -vk * Math.sin(nu), vy = vk * (e + Math.cos(nu));
  if (sense < 0) { y = -y; vy = -vy; }
  const c = Math.cos(omega), s = Math.sin(omega);
  b.x = host.x + x * c - y * s; b.y = host.y + x * s + y * c; b.vx = host.vx + vx * c - vy * s; b.vy = host.vy + vx * s + vy * c;
}
/* The same in 3D, for the Solar System: a real orbit from its elements (angles in radians): inclination to the ecliptic,
   longitude of the ascending node, longitude of perihelion, mean anomaly. Ecliptic coordinates (X toward the March
   equinox, Z to ecliptic north) become x = X, y = -Y, z = Z: screen y points down, so seen face-on we look down from
   the north, longitudes run counter-clockwise like the nearest-star markers, and north (z) is toward the viewer. */
function eclPlace(host, b, aAU, e, inc, node, peri, meanAnom) {
  const AU = 1.496e8 / KM_PER_UNIT, a = aAU * AU, GM = G * (host.m + b.m);
  let E = meanAnom; for (let k = 0; k < 30; k++) E -= (E - e * Math.sin(E) - meanAnom) / (1 - e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = a * (1 - e * Math.cos(E)), vk = Math.sqrt(GM / (a * (1 - e * e)));
  const w = peri - node, cO = Math.cos(node), sO = Math.sin(node), ci = Math.cos(inc), si = Math.sin(inc), cw = Math.cos(w), sw = Math.sin(w);
  const P = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si], Q = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];   // toward perihelion; 90° on along the orbit
  const p = r * Math.cos(nu), q = r * Math.sin(nu), vp = -vk * Math.sin(nu), vq = vk * (e + Math.cos(nu));
  b.x = host.x + p * P[0] + q * Q[0]; b.y = host.y - (p * P[1] + q * Q[1]); b.z = host.z + p * P[2] + q * Q[2];
  b.vx = host.vx + vp * P[0] + vq * Q[0]; b.vy = host.vy - (vp * P[1] + vq * Q[1]); b.vz = host.vz + vp * P[2] + vq * Q[2];
}
// a moon on a circular orbit of radius r around `host`, in a plane tilted `inc` to the ecliptic with its ascending node at `node`;
// u is how far along from that node it starts. Same speed and recoil as setCircular.
function circPlace(host, b, r, inc, node, u) {
  const cO = Math.cos(node), sO = Math.sin(node), ci = Math.cos(inc), si = Math.sin(inc), cu = Math.cos(u), su = Math.sin(u);
  const U = [cO * cu - sO * su * ci, sO * cu + cO * su * ci, su * si], T = [-cO * su - sO * cu * ci, -sO * su + cO * cu * ci, cu * si];
  const M = host.m + b.m, e = (host.R + b.R) * 0.5, v = Math.sqrt(G * M * r / (r * r + e * e)), kb = v * host.m / M, kh = v * b.m / M;
  b.x = host.x + r * U[0]; b.y = host.y - r * U[1]; b.z = host.z + r * U[2];
  b.vx = host.vx + kb * T[0]; b.vy = host.vy - kb * T[1]; b.vz = host.vz + kb * T[2];
  host.vx -= kh * T[0]; host.vy += kh * T[1]; host.vz -= kh * T[2];
}
function loadPreset(id, seed) {
  currentPreset = id; reseed(seed == null ? newSeed() : seed); qScale = grainScale(); zOn = !!PRESETS[id].d3; camZ = 0;
  warp = PRESETS[id].warp || 1; realSizes = !!PRESETS[id].real; tdeSlowUntil = -1e9; trailEvery = PRESETS[id].trailEvery || 2;
  if (typeof toastsEl !== 'undefined') toastsEl.replaceChildren();
  bodies = []; gN = 0; qN = 0; gwSrc = null; slow = 1; slowHoldUntil = -1; totalFed = 0; totalWind = 0; simTime = 0; flashes.length = 0; if (typeof xrBuf !== 'undefined') xrBuf.fill(0);
  scopeBuf.fill(0); scopeMark.fill(0); freqBuf.fill(0);
  setTilt(PRESETS[id].tilt || 0); setYaw(0);
  followId = null; followPos = null; placed.length = 0;
  closeUpId = null; closeUpDrift = null;
  PRESETS[id].build();
  setLandmarks(id);
  fitView(PRESETS[id].extent);
  opt.follow = true; syncToggles();
  computeAccel();
  if (PRESETS[id].after) PRESETS[id].after();
}
// What the camera centers on. Automatic: the heaviest object, or the barycenter of it and any bound partner
// with at least 30% of its mass (a true binary). Otherwise the object the viewer clicked.
function autoGroup() {
  if (!bodies.length) return [];
  let P = bodies[0]; for (const b of bodies) if (b.m > P.m) P = b;
  const g = [P];
  for (const b of bodies) {
    if (b === P || b.m < 0.3 * P.m) continue;
    const r = sepOf(P, b) || 1e-6, v2 = (b.vx - P.vx) ** 2 + (b.vy - P.vy) ** 2 + (b.vz - P.vz) ** 2;
    if (0.5 * v2 - G * (P.m + b.m) / r < 0) g.push(b);
  }
  return g;
}
function focusGroup() {
  if (followId != null) { const b = bodies.find(o => o.id === followId); if (b) return [b]; }
  return autoGroup();
}
function com() {
  let M = 0, x = 0, y = 0, vx = 0, vy = 0, z = 0, vz = 0;
  for (const b of focusGroup()) { M += b.m; x += b.m * b.x; y += b.m * b.y; vx += b.m * b.vx; vy += b.m * b.vy; z += b.m * b.z; vz += b.m * b.vz; }
  return M ? { x: x / M, y: y / M, vx: vx / M, vy: vy / M, z: z / M, vz: vz / M } : { x: camX, y: camY, vx: 0, vy: 0, z: camZ, vz: 0 };
}
function describe(b) { return b.kind === 'bh' ? `${fmtM(b.m)} M☉ black hole` : b.label || b.type.name; }
function focusLabel() {
  const g = focusGroup(); if (!g.length) return 'nothing yet';
  if (g.length === 1) return describe(g[0]);
  if (g.length === 2) return g[1].m < 0.0124 ? `${massStr(g[0].m)} + ${massStr(g[1].m)} barycenter` : `${fmtM(g[0].m)} + ${fmtM(g[1].m)} M☉ barycenter`;
  return `barycenter of ${g.length} objects`;
}
function fitView(extent) {
  const c = com(); camX = c.x; camY = c.y; camZ = c.z;
  const pad = document.documentElement.classList.contains('clean') ? 40 : document.documentElement.classList.contains('phone') ? 190 : 250;
  const usable = Math.max(200, Math.min(vw, vh - pad));
  zoom = clamp(usable / (2 * extent), 1e-12, 30);
}
function fitBodies() {
  const c = com(); let r = 8;
  for (const b of bodies) r = Math.max(r, sepOf(c, b) + (b.R || rsOf(b.m) * 3) * 2);
  fitView(Math.min(r * 1.1, 4000));
  opt.follow = true; syncToggles();
}
function setTilt(deg) {
  deg = clamp(deg, 0, 80);
  tiltDeg = deg; cosI = Math.cos(deg * Math.PI / 180); sinI = Math.sin(deg * Math.PI / 180);
  const r = Math.round(deg);
  const el = document.getElementById('tilt'); if (el) el.value = r;
  const out = document.getElementById('tiltOut'); if (out) out.textContent = r === 0 ? '0° face-on' : r + '°';
  if (typeof drawGizmo === 'function') drawGizmo();
}
function setYaw(rad) {
  const T = Math.PI * 2; yaw = ((rad % T) + T) % T; cY = Math.cos(yaw); sY = Math.sin(yaw);
  if (typeof drawGizmo === 'function') drawGizmo();
}

