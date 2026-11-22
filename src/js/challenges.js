/* ================= challenges =================
   Short goals with a pass check. Each one loads a starting scene, shows a goal card with a live readout, and passes on
   the simulation's own state (body types, masses, spins, orbits) or on an event the physics logged with a stable id in
   its data (toast(..., data) → logEvent). Never on a click.

   Nothing runs in free play: the check is added to frameHooks (and the event watcher to eventHooks) when a challenge
   starts and taken out when it ends. Loading another scene (the picker, a share link, a saved scene) ends it.
   A pass, once earned, stays earned, also after a rewind; the readout always follows the state the sim is in now.
   Which challenges have been passed is kept with the other settings (storeGet/storeSet: a private window or blocked
   storage only means nothing is remembered). */
const CHAL_KEY = 'ringdown.challenges';
const chalStore = storeGet(CHAL_KEY), chalDone = chalStore && chalStore.done && typeof chalStore.done === 'object' ? chalStore.done : {};
const LM = 3.694e-8, AU_U = 1.496e8 / KM_PER_UNIT;   // the Moon's mass (M☉), one AU (sim units)
let chal = null, chalBusy = false;

// a challenge's starting scene: a preset, changed by edit() if given and framed to `extent`, with a tool picked in the bar
function chalScene(id, seed, edit, extent, toolId) {
  presetSel.value = id; loadPreset(id, seed);
  if (edit) { edit(); computeAccel(); fitView(extent || PRESETS[id].extent); }
  followId = null; setTool(toolId || 'move');
  if (paused) { paused = false; syncPlay(); }
}
// made by the simulation during this challenge (formed from matter, left by a merger or an explosion), not placed by hand
const chalBorn = b => !chal.start.has(b.id) && !placed.includes(b.id);
// the data of the first logged event of this kind that counts for this challenge
function chalHit(id) { const e = chal.hits.find(e => e.data.id === id && (!chal.def.hit || chal.def.hit(e.data))); return e ? e.data : null; }
// the bound orbit of b round host: semi-major axis and eccentricity, or null when unbound
function chalOrbit(b, host) {
  const rx = b.x - host.x, ry = b.y - host.y, rz = b.z - host.z, vx = b.vx - host.vx, vy = b.vy - host.vy, vz = b.vz - host.vz;
  const r = Math.hypot(rx, ry, rz), v2 = vx * vx + vy * vy + vz * vz, GM = G * (b.m + host.m), E = 0.5 * v2 - GM / r;
  if (E >= 0) return null;
  const a = -GM / (2 * E), h2 = (ry * vz - rz * vy) ** 2 + (rz * vx - rx * vz) ** 2 + (rx * vy - ry * vx) ** 2;
  return { a, e: Math.sqrt(Math.max(0, 1 - h2 / (GM * a))) };
}
const holes = () => bodies.filter(b => b.kind === 'bh');
// the last logged event of this kind, whether it counts or not (for "that one didn't do it" readouts)
function chalLast(id) { for (let i = chal.hits.length - 1; i >= 0; i--) if (chal.hits[i].data.id === id) return chal.hits[i].data; return null; }
// how a star that can explode would end, from its birth mass (as explode() decides it)
function snFate(b) {
  const m = b.mBirth || b.m;
  if (b.m >= 260) return 'collapse without exploding';
  if (b.m >= 140) return 'blow itself apart, leaving nothing';
  return (b.type.id === 'WR' ? b.m >= 15 : m >= 20) ? 'leave a black hole' : 'leave a neutron star';
}

/* The challenges, easy to hard. scene(seed) builds the start. check() returns the readout (text), how far along it is
   (p, 0 to 1) and whether it has passed (done). A challenge that passes on a logged event names it in `ev`, and hit(data)
   says which of those count; `won` is the line shown on passing (a function gets that event's data). */
const CHAL = [
  { id: 'star', lvl: 'Easy', t: 'Light a star', goal: 'Pour out raw matter until a clump of it ignites as a star.',
    hint: 'Matter is picked in the bar. Drag Flow up to about 0.1 M☉ a second, then hold the pointer down in the middle of the view for a second or two and let go.',
    won: 'Past 0.075 M☉ a clump’s core gets hot and dense enough to fuse hydrogen. A little lighter and it would have stayed a brown dwarf; under 13 Jupiters, a planet.',
    scene: s => chalScene('empty', s, null, 0, 'matter'),
    check() {
      let m = 0, star = false;
      for (const b of bodies) if (b.kind === 'star' && chalBorn(b)) { if (b.m > m) m = b.m; if (b.type.kind === 'ms') star = true; }
      return { done: star, p: m / 0.075, text: m ? `Biggest clump: ${massStr(m)} · a star needs 0.075 M☉` : 'Nothing has gathered yet · a star needs 0.075 M☉' };
    } },
  { id: 'bhsn', lvl: 'Easy', t: 'A black hole from a supernova', goal: 'Make a star explode and leave a black hole behind, not a neutron star.',
    hint: 'Stars born above about 20 M☉ leave a black hole; this Betelgeuse-like star is 18. Add an O star or a blue supergiant from the bar, click it, and press Go supernova.',
    won: 'In the heaviest stars most of the core falls back after the bounce and pushes past what neutron pressure can hold up, so it collapses into a black hole.',
    scene: s => chalScene('betelgeuse', s),
    ev: 'supernova', hit: d => d.rem === 'bh',
    check() {
      if (chalHit('supernova')) return { done: true, text: 'The core collapsed into a black hole' };
      let best = null;
      for (const b of bodies) if ((canSupernova(b) || (b.sn && b.sn.mode !== 'ia')) && (!best || (b.mBirth || b.m) > (best.mBirth || best.m))) best = b;
      const last = chalLast('supernova');
      if (!best) return { p: 0, text: last ? 'That one left a neutron star · no star left that can explode' : 'No star heavy enough to explode (8 M☉)' };
      const fate = snFate(best), m = best.mBirth || best.m;
      return { p: fate === 'leave a black hole' ? 0.9 : 0.8 * Math.min(m, 20) / 20, text: `${best.type.name}, born at ${fmtM(m)} M☉: would ${fate}` };
    } },
  { id: 'ring', lvl: 'Easy', t: 'Give Saturn a ring', goal: 'Send something inside Saturn’s Roche limit and let tides tear it into a ring.',
    hint: 'Pick Asteroid in the bar. While you aim, a dashed red circle round Saturn marks its Roche limit: click between that circle and the planet. (A Moon works too, but being denser it has to go much closer.)',
    won: 'Inside the Roche limit, Saturn pulls on the near side harder than the body’s own gravity can hold it together. The pieces spread along the orbit and can’t gather back into a moon that close in, which is why rings hug their planets.',
    scene: s => chalScene('saturn', s, () => { bodies = bodies.filter(b => b.label !== 'Icy moon'); }, 0),
    ev: 'ring',
    check() {
      if (chalHit('ring')) return { done: true, text: 'Torn into a ring' };
      let f = 0; for (const b of bodies) if (isPlanet(b) && b.label !== 'Saturn' && b.f > f) f = b.f;
      return { p: 0.95 * Math.min(f, 1), text: f ? `Closest: ${(1 / f).toFixed(2)}× its Roche limit · needs to be inside it` : 'Nothing close to Saturn yet' };
    } },
  { id: 'ratio', lvl: 'Easy', t: 'A lopsided merger', goal: 'Merge a black hole into one at least 8 times heavier.',
    hint: 'Black hole is picked in the bar. Drag Mass down to 10 M☉ or less, then click just outside the big hole’s black shadow (if it says Too close, a little farther out). They spiral together within a minute.',
    won: d => `The remnant spins at ${Math.abs(d.chi).toFixed(2)}; equal masses leave about 0.69. A light hole brings little orbital spin with it, and only ${(100 * (1 - d.mf / (d.m1 + d.m2))).toFixed(1)}% of the mass left as gravitational waves.`,
    scene: s => chalScene('empty', s, () => bodies.push(makeBH(0, 0, 0, 0, 80)), 150, 'bh'),
    ev: 'bh-merge', hit: d => d.m1 >= 8 * d.m2,
    check() {
      const h = chalHit('bh-merge'); if (h) return { done: true, text: `Merged at ${(h.m1 / h.m2).toFixed(1)} to 1` };
      const bh = holes().sort((a, b) => b.m - a.m), last = chalLast('bh-merge');
      if (bh.length < 2) return { p: 0, text: last ? `That merger was ${(last.m1 / last.m2).toFixed(1)} to 1 · try a lighter partner` : 'Place a second, much lighter black hole' };
      const q = bh[0].m / bh[1].m;
      return { p: 0.95 * Math.min(q / 8, 1), text: `Mass ratio: ${q.toFixed(1)} to 1 · needs 8 to 1` };
    } },
  { id: 'nova', lvl: 'Medium', t: 'Three novae', goal: 'Get a star to feed this white dwarf until it flares as a nova three times.',
    hint: 'Zoom in, pick K dwarf and click right beside the white dwarf, so close the two nearly touch. Too far and the star can’t fill its Roche lobe; on top of it and they collide.',
    won: 'Gas spilling over from the star piles up on the white dwarf until the bottom of the layer ignites in a thermonuclear flash. Each nova blows most of the layer off, so the white dwarf grows only slowly.',
    scene: s => chalScene('empty', s, () => bodies.push(makeStar('WD', 0, 0, 0, 0, 1.0)), 24),
    check() {
      let n = 0, layer = 0, f = 0, wd = false;
      for (const b of bodies) {
        if (isWD(b)) { wd = true; if ((b.novae || 0) >= n) { n = b.novae || 0; layer = b.layer || 0; } }
        else if (b.kind === 'star' && !isCompact(b) && !isPlanet(b) && b.f > f) f = b.f;
      }
      if (!wd) return { p: 0, text: 'The white dwarf is gone · start over' };
      return { done: n >= 3, p: (n + clamp(layer / NOVA_LAYER, 0, 0.95)) / 3,
        text: `Novae: ${Math.min(n, 3)} of 3` + (n >= 3 ? '' : f ? ` · the star fills ${Math.round(Math.min(f, 9.99) * 100)}% of its Roche lobe` : ' · no star close enough to feed it') };
    } },
  { id: 'sun', lvl: 'Medium', t: 'Loosen the Sun’s grip', goal: 'Make the Sun lose mass until Earth’s orbit spreads past 1.5 AU.',
    hint: 'Click the Sun and press Age it: it swells into a red giant. Press it again and it puffs off its outer layers as a planetary nebula.',
    won: 'Orbits are set by the mass in the middle. Once the Sun has lost half its mass it no longer holds the planets as tightly, and they swing far out. Here the shell leaves in one jump; really it takes hundreds of thousands of years, and Earth’s orbit would only about double.',
    scene: s => chalScene('solar', s),
    check() {
      const sun = bodies.find(b => b.label === 'Sun'), earth = bodies.find(b => b.label === 'Earth');
      if (!sun || !earth) return { p: 0, text: earth ? 'The Sun is gone · start over' : 'Earth is gone · start over' };
      const o = chalOrbit(earth, sun);
      if (!o) return { done: true, text: 'Earth has broken free of the Sun' };
      const a = o.a / AU_U;
      return { done: a >= 1.5, p: (a - 1) / 0.5, text: `Earth’s orbit: ${a.toFixed(2)} AU · needs 1.5 · the Sun: ${fmtM(sun.m)} M☉` };
    } },
  { id: 'msp', lvl: 'Medium', t: 'Spin a pulsar up to milliseconds', goal: 'Feed this neutron star until it turns 300 times a second, about 3 ms a turn.',
    hint: 'Zoom in and drop a white dwarf right next to it. Gravitational waves pull the two together until the neutron star tears the white dwarf apart and feeds on the disk. A K dwarf placed very close works too, more slowly.',
    won: 'Gas falling in from a disk carries spin with it: about a tenth of a solar mass winds a neutron star up to millisecond periods. This recycling is how most millisecond pulsars are thought to form.',
    scene: s => chalScene('empty', s, () => bodies.push(makeStar('NS', 0, 0, 0, 0, 1.4)), 24),
    check() {
      let hz = -1; for (const b of bodies) if (isNS(b) && b.spinHz > hz) hz = b.spinHz;
      if (hz < 0) return { p: 0, text: 'No neutron star left · start over' };
      const per = hz >= 1 ? `${(1000 / hz).toFixed(hz >= 100 ? 1 : 0)} ms` : `${(1 / hz).toFixed(1)} s`;
      return { done: hz >= 300, p: hz / 300, text: `Spin: ${hz < 10 ? hz.toFixed(1) : Math.round(hz)} turns a second (${per} a turn) · needs 300` };
    } },
  { id: 'strip', lvl: 'Medium', t: 'Strip a giant to its core', goal: 'Let this black hole feed on a red giant until only the giant’s core is left.',
    hint: 'Pick Red giant. While you aim near the hole, dashed rings show where a star starts to leak, where it pours a stream and where it is torn apart: click between the stream ring and the tear ring. Then speed time up (16× or 64×).',
    won: 'A giant’s size is set by its dense helium core, so it stays big and keeps overflowing while the hole draws off its envelope. When the envelope is gone the bare core is left orbiting as a white dwarf: holes rarely eat stars whole.',
    scene: s => chalScene('empty', s, () => bodies.push(makeBH(0, 0, 0, 0, 12)), 170),
    ev: 'stripped',
    check() {
      if (chalHit('stripped')) return { done: true, text: 'Only the core is left' };
      let g = null; for (const b of bodies) if (b.kind === 'star' && b.type.kind === 'giant' && (!g || b.f > g.f)) g = b;
      if (!g) return { p: 0, text: 'No giant near the hole yet' };
      const env0 = Math.max(1e-6, g.mBirth - g.core), env = Math.max(0, g.m - g.core);
      return { p: 0.95 * clamp(1 - env / env0, 0, 1), text: `Envelope left: ${env.toFixed(3)} M☉ · Roche lobe ${Math.round(Math.min(g.f, 9.99) * 100)}% full` };
    } },
  { id: 'typeia', lvl: 'Medium', t: 'Over the Chandrasekhar limit', goal: 'Push this 1.2 M☉ white dwarf past 1.44 M☉ so it explodes as a Type Ia supernova.',
    hint: 'Feeding it from an ordinary star is too slow: each nova keeps only a sliver. Bring a second white dwarf right up to it (zoom in and click very close), or drag to throw one straight at it.',
    won: 'Past 1.44 M☉ a white dwarf’s electrons can no longer hold it up. Carbon ignites in a runaway and the whole star blows apart, leaving nothing. They all peak at about the same brightness, which makes them yardsticks across the universe.',
    scene: s => chalScene('empty', s, () => bodies.push(makeStar('WD', 0, 0, 0, 0, 1.2)), 24),
    ev: 'typeia', hit: d => d.via !== 'edit',
    check() {
      if (chalHit('typeia')) return { done: true, text: 'Type Ia supernova' };
      if (chalLast('typeia')) return { p: 0, text: 'Setting the mass by hand doesn’t count · start over and let physics do it' };
      let m = 0; for (const b of bodies) if (isWD(b) && b.m > m) m = b.m;
      return { p: 0.95 * clamp((m - 1.2) / 0.24, 0, 1), text: m ? `White dwarf: ${m.toFixed(3)} of 1.44 M☉` : 'No white dwarf left · start over' };
    } },
  { id: 'spin', lvl: 'Hard', t: 'Spin up a merger', goal: 'Merge two black holes into one spinning faster than 0.9.',
    hint: 'Black hole is picked in the bar. Turn Spin up to about +0.9 (↺, the way a placed orbit turns) before you place each hole, and put the second one close to the first. Spins against the orbit cancel out.',
    won: d => `Spin ${Math.abs(d.chi).toFixed(2)}. Spins lined up with the orbit add to the angular momentum the pair already has; holes that don’t spin leave about 0.69. Aligned pairs also hang on longer before they merge, and radiate more.`,
    scene: s => chalScene('empty', s, null, 0, 'bh'),
    ev: 'bh-merge', hit: d => Math.abs(d.chi) >= 0.9,
    check() {
      const h = chalHit('bh-merge'); if (h) return { done: true, text: `Remnant spin ${Math.abs(h.chi).toFixed(2)}` };
      const bh = holes(), last = chalLast('bh-merge');
      if (bh.length >= 2) {   // what the closest pair would leave, from the same fit the merger uses
        let pr = null, bs = 0;
        for (let i = 0; i < bh.length; i++) for (let j = i + 1; j < bh.length; j++) { const s = bh[i].m * bh[j].m / (sepOf(bh[i], bh[j]) || 1e-6); if (s > bs) { bs = s; pr = [bh[i], bh[j]]; } }
        const [a, b] = pr, sL = orbitSign(a, b), big = a.m >= b.m ? a : b, sml = big === a ? b : a;
        const chi = Math.abs(remnantFit(big.m, sml.m, big.chi * sL, sml.chi * sL).chi);
        return { p: 0.95 * Math.min(chi / 0.9, 1), text: `If these two merge: spin ${chi.toFixed(2)} · needs 0.90` };
      }
      return { p: last ? 0.95 * Math.min(Math.abs(last.chi) / 0.9, 1) : 0, text: last ? `That merger left spin ${Math.abs(last.chi).toFixed(2)} · needs 0.90` : 'Place two black holes' };
    } },
  { id: 'nsleft', lvl: 'Hard', t: 'A kilonova that leaves a neutron star', goal: 'Make these two neutron stars merge into a neutron star instead of a black hole.',
    hint: 'Together they are too heavy: past about 2.35 M☉ what is left collapses. Pause (Space), click each neutron star, open Edit in the inspector and set its mass to about 1.15, then play. Lighter stars spiral in more slowly, so speed time up.',
    won: d => `${d.m1.toFixed(2)} + ${d.m2.toFixed(2)} M☉ left a ${d.mf.toFixed(2)} M☉ neutron star. None can be much heavier than about 2.3 M☉; past that even neutron pressure gives way. The remnant of GW170817 was probably heavier, and collapsed into a black hole within a second.`,
    scene: s => chalScene('bns', s),
    ev: 'ns-merge', hit: d => d.rem === 'ns',
    check() {
      const h = chalHit('ns-merge'); if (h) return { done: true, text: `Left a ${h.mf.toFixed(2)} M☉ neutron star` };
      const ns = bodies.filter(isNS).sort((a, b) => a.m - b.m);
      if (ns.length < 2) return { p: 0, text: chalLast('ns-merge') ? 'That one collapsed into a black hole · start over' : 'Needs two neutron stars' };
      const tot = ns[0].m + ns[1].m;
      return { p: 0.95 * clamp((2.75 - tot) / 0.4, 0, 1), text: `The pair: ${tot.toFixed(2)} M☉ · ${tot < 2.36 ? 'light enough to leave a neutron star' : 'heavy enough to collapse'}` };
    } },
  { id: 'moon', lvl: 'Hard', t: 'Make a Moon', goal: 'Pour matter round the young Earth until it gathers into a moon of 0.7 to 1.5 times the Moon’s mass.',
    hint: 'Matter is picked. Set Flow to about 0.01 Earth masses a second and hold the pointer down five or six Earth radii from the planet for two seconds, then speed time up to 64×. Too little and the moonlets stay small; inside about three Earth radii matter stays a ring.',
    won: 'Beyond the Roche limit, about three Earth radii out, matter sticks together into moonlets, and moonlets that meet merge into one. The Moon is thought to have gathered like this from the debris of a giant impact.',
    scene: s => chalScene('theia', s, () => { bodies = [world('ROCK', 'Earth', 5.972e24, 6371, [118, 150, 196])]; }, 0, 'matter'),
    check() {
      const earth = bodies.find(b => b.label === 'Earth');
      if (!earth) return { p: 0, text: 'Earth is gone · start over' };
      let m = 0; for (const b of bodies) if (b !== earth && isPlanet(b) && b.m > m && chalBorn(b) && chalOrbit(b, earth)) m = b.m;
      const x = m / LM;
      return { done: x >= 0.7 && x <= 1.5, p: x / 0.7,
        text: m ? `Biggest moon: ${x.toFixed(2)} Moon masses · needs 0.7 to 1.5${x > 1.5 ? ' (too heavy: start over)' : ''}` : 'No moon has gathered yet · needs 0.7 to 1.5 Moon masses' };
    } },
];

/* ---------- the goal card ---------- */
const chalEl = $('chal'), chalProg = $('chalProg'), chalMeter = $('chalMeter'), chalHintEl = $('chalHint'), chalHintB = $('chalHintB');
function chalFrame() {
  const c = chal; if (!c) return;
  const r = c.def.check();
  if (r.text !== c.text) { c.text = r.text; chalProg.textContent = r.text; }
  const p = r.done ? 1 : clamp(r.p || 0, 0, 1);
  if (Math.abs(p - c.p) > 0.002) { c.p = p; chalMeter.style.width = (100 * p).toFixed(1) + '%'; }
  if (r.done && !c.won) chalWin(c);
}
function chalEvent(ev) { if (chal && ev.data && ev.data.id && (!chal.def.ev || chal.def.ev === ev.data.id)) chal.hits.push(ev); }
function chalWin(c) {
  c.won = true; chalDone[c.def.id] = Date.now(); storeSet(CHAL_KEY, { done: chalDone });
  const had = chalEl.contains(document.activeElement);
  const won = typeof c.def.won === 'function' ? c.def.won(chalHit(c.def.ev)) : c.def.won;
  chalEl.classList.add('won'); $('chalTag').textContent = 'Passed';
  $('chalGoal').textContent = won; chalHintB.hidden = true; chalHintEl.hidden = true; $('chalAgain').hidden = true;
  const nx = chalNextId(c.def.id); $('chalNext').hidden = !nx; $('chalFree').hidden = false;
  toast('Challenge passed', [c.def.t], 'w', { id: 'challenge', chal: c.def.id });   // the card says why; a screen reader hears it next
  if (toastsEl.lastChild) toastsEl.lastChild.classList.add('pass');   // stays up beside newer notices (challenges.css)
  say(won);
  sfx('nova', null, null, 0.9);
  if (had) (nx ? $('chalNext') : $('chalFree')).focus();
  renderChal();
}
function chalNextId(id) {
  const i = CHAL.findIndex(d => d.id === id), order = CHAL.slice(i + 1).concat(CHAL.slice(0, i));
  const nx = order.find(d => !chalDone[d.id]) || CHAL[i + 1];
  return nx ? nx.id : null;
}
function chalStart(id, seed) {
  const i = CHAL.findIndex(d => d.id === id); if (i < 0) return false;
  chalStop(true);
  const def = CHAL[i];
  chalBusy = true; try { def.scene(seed); } finally { chalBusy = false; }
  chal = { def, start: new Set(bodies.map(b => b.id)), hits: [], won: false, text: '', p: -1 };
  frameHooks.push(chalFrame); eventHooks.push(chalEvent);
  chalEl.classList.remove('won');
  $('chalTag').textContent = `Challenge ${i + 1} of ${CHAL.length} · ${def.lvl}`;
  $('chalT').textContent = def.t; $('chalGoal').textContent = def.goal;
  chalHintEl.textContent = def.hint; chalHintEl.hidden = true; chalHintB.hidden = false;
  chalHintB.textContent = 'Show a hint'; chalHintB.setAttribute('aria-expanded', 'false');
  $('chalNext').hidden = true; $('chalFree').hidden = true; $('chalAgain').hidden = false;
  chalEl.hidden = false; document.documentElement.classList.add('chal-on');
  chalFrame(); renderChal();
  say(`Challenge: ${def.t}. ${def.goal}`);
  return true;
}
function chalStop(quiet) {
  if (!chal) return;
  const was = chal.def; chal = null;
  for (const [list, f] of [[frameHooks, chalFrame], [eventHooks, chalEvent]]) { const k = list.indexOf(f); if (k >= 0) list.splice(k, 1); }
  const had = chalEl.contains(document.activeElement);
  chalEl.hidden = true; document.documentElement.classList.remove('chal-on');
  if (had) $('help').focus();
  renderChal();
  if (!quiet) say(`Left the challenge “${was.t}”. Back to free play.`);
}
// another scene loaded (the picker, a share link, a saved scene) ends the challenge; a rewind keeps a pass and recounts the rest
sceneHooks.push(() => { if (chal && !chalBusy) chalStop(); });
rewindHooks.push(t => { if (!chal) return; chal.hits = chal.hits.filter(e => e.t <= t); chalFrame(); });
$('chalX').addEventListener('click', () => chalStop());
$('chalFree').addEventListener('click', () => chalStop());
$('chalAgain').addEventListener('click', () => { if (chal) { chalStart(chal.def.id); $('chalAgain').focus(); } });
$('chalNext').addEventListener('click', () => { const nx = chal && chalNextId(chal.def.id); if (nx) { chalStart(nx); chalHintB.focus(); } });
chalHintB.addEventListener('click', () => {
  const on = chalHintEl.hidden; chalHintEl.hidden = !on;
  chalHintB.textContent = on ? 'Hide the hint' : 'Show a hint'; chalHintB.setAttribute('aria-expanded', String(on));
});
// the card's height, so the newest notice can drop in just below it (challenges.css)
if (window.ResizeObserver) new ResizeObserver(() => { if (!chalEl.hidden) document.documentElement.style.setProperty('--chal-h', Math.ceil(chalEl.offsetHeight) + 'px'); }).observe(chalEl);

/* ---------- the list, in the help panel ---------- */
const cList = $('cList');
CHAL.forEach((d, i) => {
  const li = document.createElement('li'), b = document.createElement('button');
  b.type = 'button'; b.className = 'g-item c-item';
  b.innerHTML = '<span class="c-num" aria-hidden="true"></span><span class="g-tick" aria-hidden="true"></span><span><b></b><small></small><span class="c-lvl"></span><span class="sr"></span></span>';
  b.querySelector('.c-num').textContent = i + 1; b.querySelector('b').textContent = d.t;
  b.querySelector('small').textContent = d.goal; b.querySelector('.c-lvl').textContent = d.lvl;
  b.addEventListener('click', () => { guideShow(false); $('help').focus(); chalStart(d.id); });
  d.el = b; li.appendChild(b); cList.appendChild(li);
});
function renderChal() {
  let n = 0;
  for (const d of CHAL) {
    const on = !!chalDone[d.id], now = !!chal && chal.def === d; n += on;
    d.el.classList.toggle('done', on);
    if (now) d.el.setAttribute('aria-current', 'true'); else d.el.removeAttribute('aria-current');
    d.el.querySelector('.c-lvl').textContent = now ? `${d.lvl} · playing now` : d.lvl;
    d.el.querySelector('.sr').textContent = on ? ' (passed)' : '';
  }
  $('cDone').textContent = n; $('cAll').textContent = CHAL.length; $('cMeter').style.width = (100 * n / Math.max(CHAL.length, 1)) + '%';
}
$('gToChal').addEventListener('click', () => { guideTab('chal'); $('gtab-chal').focus(); });
renderChal();
