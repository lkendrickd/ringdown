/* ---------- star aging ----------
   A star's life is set by the mass it was born with. Each press of "Age it" jumps to its next stage,
   skipping the millions or billions of years in between (shown in the inspector). */
const msLife = m => 1e10 * Math.pow(m, -2.5);           // main-sequence lifetime, years
const wdMassFor = mi => clamp(0.109 * mi + 0.394, 0.5, 1.38); // initial-final mass relation for white dwarfs
function fmtYears(y) { return y >= 1e9 ? `${(y / 1e9).toFixed(y >= 1e10 ? 0 : 1)} billion years` : y >= 1e6 ? `${Math.round(y / 1e6)} million years` : `${Math.round(y / 1e3).toLocaleString('en-US')} thousand years`; }
const STAGE_NAME = { RG:'red giant', RSG:'red supergiant', BSG:'blue supergiant', LBV:'luminous blue variable', WR:'Wolf–Rayet star', PN:'white dwarf', SN:'supernova', WD:'white dwarf' };
function lifeTrack(b) {
  if (b.kind !== 'star' || isNS(b)) return null;
  const m = b.mBirth || b.m, id = b.type.id, ms = b.type.kind === 'ms' && !['WR', 'sdB'].includes(id);
  if (id === 'BD') return { stages: [id], note: 'A brown dwarf never fuses hydrogen. It just cools and fades.' };
  if (b.type.kind === 'wd') return { stages: [id], note: 'A white dwarf only cools from here, for far longer than the universe has existed. It changes only if something feeds it.' };
  if (id === 'sdB') return { stages: [id, 'WD'], wait: 1e8 };
  if (id === 'RCB') return { stages: [id, 'WD'], wait: 1e5 };
  if (id === 'WR') return { stages: [id, 'SN'], wait: 3e5 };
  if (id === 'LBV') return { stages: [id, 'WR', 'SN'], wait: 1e5 };
  if (id === 'RSG' || id === 'BSG') return { stages: [id, 'SN'], wait: id === 'RSG' ? 1e6 : 5e5 };
  if (id === 'RG' || id === 'YSG') return { stages: [id, 'PN'], wait: 0.1 * msLife(m) };
  if (!ms) return null;
  if (m < 0.8) return { stages: [id], note: `It will burn hydrogen for ${fmtYears(msLife(m))}, longer than the universe is old, so no star like it has aged yet.` };
  const wait = msLife(m);
  if (m < 8) return { stages: [id, 'RG', 'PN'], wait };
  if (m < 25) return { stages: [id, 'RSG', 'SN'], wait };
  if (m < 40) return { stages: [id, 'BSG', 'SN'], wait };
  return { stages: [id, 'LBV', 'WR', 'SN'], wait };
}
// drawn radius for a new stage (stars here are not to scale; the ordering follows real ones)
function stageRadius(id, m) {
  return id === 'RG' ? 22 * Math.pow(m / 1.2, 0.4) : id === 'RSG' ? 46 * Math.pow(m / 18, 0.5) : id === 'BSG' ? 30 * Math.pow(m / 25, 0.4)
    : id === 'LBV' ? 28 * Math.pow(m / 90, 0.3) : TYPE[id].R;
}
function ejectShell(st, mass, vmin, vmax, N) { // a slow, glowing shell of gas leaving a star
  N = Math.min(N, MAXG - gN);
  for (let k = 0; k < N; k++) {
    const a = rand() * Math.PI * 2, rr = st.R * (0.9 + 0.4 * rand()), x = st.x + Math.cos(a) * rr, y = st.y + Math.sin(a) * rr;
    const vInf = (vmin + (vmax - vmin) * rand()) * C, ve = escapeSpeed(x, y, st), sp = Math.min(Math.sqrt(vInf * vInf + ve * ve), 0.85 * C);
    if (addGas(x, y, st.vx + Math.cos(a) * sp, st.vy + Math.sin(a) * sp, mass / Math.max(N, 1), st.id)) gf[gN - 1] = 3;
  }
}
// skipping ahead in time: gas this star shed earlier would long since have drifted away
function clearShedGas(b) { for (let i = 0; i < gN; i++) if (gsrc[i] === b.id && gf[i] === 3) { removeGas(i); i--; } }
function ageStar(b) {
  const tr = lifeTrack(b); if (!tr || tr.stages.length < 2 || b.grow || b.sn) return;
  clearShedGas(b);
  const next = tr.stages[1], m = b.mBirth || b.m, from = b.type.lc, when = fmtYears(tr.wait || 0);
  if (next === 'SN') {
    if (!canSupernova(b)) return;
    startSupernova(b);
    toast('Out of fuel', [`After about ${when} more, the ${from}'s core is iron, which can't be burned for energy`, 'With nothing holding it up, the core collapses'], 'w');
    return;
  }
  if (next === 'PN' || next === 'WD') { // the outer layers drift off; the core is left as a white dwarf
    const mw = b.type.id === 'sdB' || b.type.id === 'RCB' ? Math.min(b.m, 1.2) : Math.min(wdMassFor(m), b.m);
    const lost = b.m - mw;
    if (lost > 0.001) ejectShell(b, lost, 0.0005, 0.002, 500);
    retype(b, mw < 0.5 ? TYPE.HeWD : TYPE.WD); b.m = b.m0 = mw;
    b.R = b.R0 = sized(b, wdRadius(Math.min(mw, M_CH * 0.99)), TYPE.WD);
    flashes.push({ x: b.x, y: b.y, t0: wallNow, dur: 5000, kind: 'sn', R: 10, power: 0.25, st: simTime });
    toast(lost > 0.01 ? 'Planetary nebula' : 'Settled into a white dwarf', lost > 0.01
      ? [`After about ${when} more, the ${from} puffed off its outer ${fmtM(lost)} M☉ as a glowing shell`, `Its ${fmtM(mw)} M☉ core is left as a white dwarf, about the size of Earth`]
      : [`After about ${when}, the ${from} has used up its helium and settled into a ${fmtM(mw)} M☉ white dwarf`], 'w');
    return;
  }
  // swell into the next stage, shedding some mass in a wind on the way
  const t = TYPE[next], windFrac = next === 'RSG' ? 0.12 : next === 'BSG' ? 0.1 : next === 'LBV' ? 0.2 : next === 'WR' ? 0.55 : 0;
  const lost = b.m * windFrac;
  if (lost > 0.001) ejectShell(b, lost, 0.002, 0.006, 400);
  const R0 = b.R;
  retype(b, t); b.m = b.m0 = b.m - lost;
  b.core = next === 'RG' ? wdMassFor(m) : next === 'RSG' ? 0.33 * m : next === 'BSG' ? 0.36 * m : next === 'LBV' ? 0.45 * m : 0;
  const R1 = sized(b, stageRadius(next, b.m), t);
  b.R = b.R0 = R0; b.grow = { t0: wallNow, R0, R1, dur: 3200 };
  const why = next === 'WR' ? `Its winds have stripped the outer layers away, exposing the hot helium core` : `It has burned the hydrogen in its core and is swelling as it starts on helium`;
  toast(`Now a ${STAGE_NAME[next]}`, [`After about ${when}, the ${from} moved on`, why, lost > 0.001 ? `${fmtM(lost)} M☉ blew away in its wind` : 'Watch it swell; if anything is close, it may start feeding it'], 'w');
}
// animate a swelling or shrinking star; its Roche lobe and feeding respond as it grows
function updateGrowth() {
  for (const b of bodies) {
    if (!b.grow) continue;
    const p = clamp((wallNow - b.grow.t0) / b.grow.dur, 0, 1), e = p * p * (3 - 2 * p);
    b.R = b.R0 = b.grow.R0 + (b.grow.R1 - b.grow.R0) * e;
    if (p >= 1) b.grow = null;
  }
}
