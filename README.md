# Ringdown

An interactive black hole simulator that runs in your browser. Merge black holes and hear the gravitational-wave chirp and ringdown. Spin them up, feed them stars, and smash neutron stars into kilonovae.

**Live:** https://lkendrickd.github.io/ringdown/

It's a single self-contained `index.html` with no build step and no dependencies beyond Google Fonts. It uses WebGL2 for gravitational lensing and the black hole shadows, and Web Audio for sound.

## What you can do

- **Merge black holes.** Watch the inspiral, the merger and the ringdown. The strain scope shows the chirp, and **Listen** plays it (one octave up).
- **Spin them.** Each hole has a spin from −0.99 to +0.99. Spin moves the innermost stable orbit, drags gas around through frame dragging, and changes how mergers turn out. Accreted gas spins holes up toward the 0.998 Thorne limit.
- **Feed them.** Drop stars of any type: brown dwarf; M, K, G, F, A, B and O main-sequence stars; red giant, yellow supergiant, red supergiant (Betelgeuse-like), blue supergiant, luminous blue variable (Eta Carinae-like) and Wolf–Rayet; white dwarf, helium white dwarf, hot subdwarf and R Coronae Borealis star; plus neutron stars and black holes. Stars that overflow their Roche lobe stream gas into an accretion disk; get one too close and it's tidally disrupted.
- **Feeding works for every pairing.** Black holes, neutron stars and white dwarfs all accept gas. A star feeding a white dwarf sets off novae. A star much heavier than its companion can't feed it stably: the transfer runs away into a common envelope, where the companion spirals inside the star and either throws off the envelope (leaving the bare core in a much tighter orbit, like Cygnus X-3) or merges with it.
- **Strip them.** A hole rarely eats a star whole. A giant that's fed on long enough is stripped to its helium core, which is left orbiting as a white dwarf (or a Wolf–Rayet star for a blue supergiant). On a stretched orbit a star loses a little on every close pass and survives, and the hole flares each time, like ASASSN-14ko. Part of the stolen gas is blown back out as a disk wind instead of being eaten.
- **Neutron stars.** Two of them merge into a kilonova, and above about 2.3 M☉ the remnant collapses to a black hole. A white dwarf that spirals into a neutron star gets shredded, and the neutron star feeds on it until it's spun up into a millisecond pulsar.
- **White dwarfs obey the Chandrasekhar limit.** They shrink as they gain mass and can't pass 1.44 M☉. Crash two carbon–oxygen white dwarfs past it and you get a Type Ia supernova that leaves nothing behind. Two helium white dwarfs reignite as a helium-burning hot subdwarf; a helium plus a carbon–oxygen one swell into an R Coronae Borealis giant.
- **Age stars.** Step a star through its real life: a Sun-like star swells into a red giant (and starts feeding a nearby hole on its own), then puffs off a planetary nebula and leaves a white dwarf; massive stars become supergiants, luminous blue variables and Wolf–Rayet stars, then go supernova.
- **Spaghettification close-up.** Follow a star into a hole in slow motion, watch it stretch and squeeze, then tear into a long stream of debris.
- **Sgr A\*.** The 4.3 million M☉ hole at the center of the Milky Way, with S2 and other S-stars on their measured orbits, at true scale with stars at their real sizes. S2's 16-year orbit plays in about 30 seconds. Throw a star in for a galactic-center tidal disruption.
- **Share a setup.** The share button packs the whole scene into the link.
- **Inspect anything.** Click a body to see its mass ticking live, how fast it's gaining or losing mass, and what's happening to it. A dashed ring shows the orbit it's on, run a lap ahead with the sim's own gravity: closest and farthest points, precession near a hole, and where it will fall in, get torn apart or escape.
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
| Edit or delete a body | Inspector → Edit | Inspector → Edit |
| Share the setup | Share button (top right) | Share button |
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
