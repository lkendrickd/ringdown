# Ringdown

An interactive black hole simulator that runs in your browser. Merge black holes and hear the gravitational-wave chirp and ringdown. Spin them up, feed them stars, and smash neutron stars into kilonovae.

**Live:** https://lkendrickd.github.io/ringdown/

It's a single self-contained `index.html` with no build step and no dependencies beyond Google Fonts. It uses WebGL2 for gravitational lensing and the black hole shadows, and Web Audio for sound.

## What you can do

- **Merge black holes.** Watch the inspiral, the merger and the ringdown. The strain scope shows the chirp, and **Listen** plays it (one octave up).
- **Spin them.** Each hole has a spin from −0.99 to +0.99. Spin moves the innermost stable orbit, drags gas around through frame dragging, and changes how mergers turn out. Accreted gas spins holes up toward the 0.998 Thorne limit.
- **Feed them.** Drop stars of any type (M, K, G, F, A, B, O, red giant, blue supergiant, white dwarf). Stars that overflow their Roche lobe stream gas into an accretion disk; get one too close and it's tidally disrupted.
- **Strip them.** A hole rarely eats a star whole. A giant that's fed on long enough is stripped to its helium core, which is left orbiting as a white dwarf (or a Wolf–Rayet star for a blue supergiant). On a stretched orbit a star loses a little on every close pass and survives, and the hole flares each time, like ASASSN-14ko. Part of the stolen gas is blown back out as a disk wind instead of being eaten.
- **Neutron stars.** Two of them merge into a kilonova, and above about 2.3 M☉ the remnant collapses to a black hole. A white dwarf that spirals into a neutron star gets shredded, and the neutron star feeds on it until it's spun up into a millisecond pulsar.
- **Inspect anything.** Click a body to see its mass ticking live, how fast it's gaining or losing mass, what's happening to it, and its orbit.
- **Make it explode.** Stars above about 8 M☉ can go supernova from the inspector: the iron core collapses, bounces, the shock stalls until neutrinos revive it, and the envelope is blown off, leaving a neutron star or a black hole. Pile stars together and collisions build monsters no galaxy makes on its own: 140–260 M☉ ends in a pair-instability supernova that leaves nothing behind, and above about 260 M☉ the star collapses straight into an intermediate-mass black hole.
- **Tilt the view.** Seen from the side, the disk is brighter on the side coming toward you (Doppler beaming), spinning holes show their exact Kerr shadow, and jets show up.

## Controls

| | Mouse | Touch |
|---|---|---|
| Pan | Drag (Move tool) | Drag |
| Zoom | Scroll | Pinch |
| Tilt & rotate | Right-drag or Shift-drag, or the view dial | Twist two fingers, or drag the view dial |
| Inspect & follow an object | Click it (Esc to close) | Tap it |
| Place an object | Pick it in the bar, click to orbit, drag to throw | Same |
| Undo placement | Ctrl/Cmd+Z | Undo button |
| Back to Move | Esc | Move chip |
| Pause | Space | Pause button |

## The physics

G and c are scaled together, so 1 grid unit is 11.8 km. Horizon sizes, orbital speeds, inspiral timing and gravitational-wave frequencies all match real values; on-screen time runs about 23× slower than real.

- **Inspiral:** Peters' quadrupole energy loss.
- **Remnants:** spin from the Rezzolla et al. (2008) aligned-spin fit; radiated energy from the remnant's ISCO binding energy. 36 + 29 M☉ gives about 62 M☉, spin 0.68, and 3 M☉ radiated, close to GW150914.
- **Ringdown:** Berti, Cardoso & Will fits for the l = m = 2 quasi-normal mode.
- **Black hole shadows:** the exact Kerr outline (Bardeen 1973) for each hole's spin and the viewing angle.
- **Orbits near holes:** a pseudo-Newtonian potential with the Bardeen–Press–Teukolsky ISCO for prograde and retrograde orbits.
- **Mass transfer:** Eggleton's Roche-lobe formula. Giants keep their size while the envelope drains, since a giant's radius is set by its core.
- **Disk winds:** 15–65% of the gas reaching the inner disk is blown out, more when the hole is feeding hard, as in ultraluminous X-ray sources.
- **Jets:** power scales with feeding rate × spin² (Blandford–Znajek), beamed for β = 0.92.

**What it fakes:** ordinary stars are drawn thousands of times smaller than life, mass transfer and pulsar spin-up run fast enough to watch, the space ripples and horizon wobble are exaggerated, lensing is a flat point-lens approximation, and the jets are drawn schematically.
