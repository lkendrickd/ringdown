/* ---------- editing ---------- */
function massBounds(b) {
  if (b.kind === 'bh') return [0.5, 1e10];
  if (isNS(b)) return [1.1, 3];
  const k = b.type.kind;
  if (k === 'planet') return [1e-14, 0.0124];
  return k === 'bd' ? [0.01, 0.08] : k === 'wd' ? [0.1, 1.6] : k === 'giant' ? [0.3, 300] : [0.08, 300];
}
function applyEdit(b, m, chi) {
  const [lo, hi] = massBounds(b);
  if (Number.isFinite(m)) {
    m = clamp(m, lo, hi);
    if (b.kind === 'star' && b.type.kind === 'ms' && !isNS(b)) b.R = b.R0 = b.R * Math.pow(m / b.m, 0.8);
    if (b.kind === 'star' && b.type.kind === 'giant' && b.core) b.core *= m / b.m;
    b.m = b.m0 = m; if (b.kind === 'star') b.mBirth = m;
    if (isPlanet(b)) { const lab = b.label; b.label = ''; regrade(b); b.label = b.type.kind === 'planet' ? lab : ''; }
    if (b.kind === 'star' && b.type.kind === 'wd') { b.R = b.R0 = sized(b, wdRadius(Math.min(m, M_CH * 0.99)), TYPE.WD); if (m >= M_CH && !b.sn) { b.sn = { t0: wallNow, mode: 'ia' }; toast('Over the Chandrasekhar limit', [`At ${fmtM(m)} M☉ the white dwarf can't hold itself up`, 'Carbon is about to ignite']); } }
    if (b.kind === 'star' && (b.type.kind === 'ms' || b.type.kind === 'giant') && m >= 140 && !b.sn) { startSupernova(b); toast('Too massive to survive', [`A ${fmtM(m)} M☉ star is far past the ~150 M☉ that stars can hold together`]); }
  }
  if (b.kind === 'bh' && Number.isFinite(chi)) b.chi = clamp(chi, -0.99, 0.99);
  if (b.kind === 'bh') updateKerr(b);
  computeAccel();
}
function deleteBody(b) {
  bodies = bodies.filter(o => o !== b);
  if (followId === b.id) followId = null;
  if (closeUpId === b.id) closeUpId = null;
  computeAccel();
  toast('Removed', [`${describe(b)} taken out of the simulation`]);
}
