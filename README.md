# Ringdown

An interactive astrophysics sandbox that runs in your browser. Merge black holes and hear the gravitational-wave chirp and ringdown. Spin them up, feed them stars, and smash neutron stars into kilonovae. Pour out raw matter and watch it fall together into moons, planets and stars. Fly the Solar System out to Sedna and on to the nearest stars, replay the impact that made the Moon, and give a planet rings.

**Live:** https://lkendrickd.github.io/ringdown/

It ships as a single self-contained `index.html` with no dependencies beyond Google Fonts. It uses WebGL2 for everything on screen (instanced gas and stars, HDR with bloom, ray-traced lensing of the disk) and Web Audio for sound. Without WebGL2 it falls back to a plain 2D canvas.

## What you can do

- **Merge black holes.** Watch the inspiral, the merger and the ringdown. The strain scope shows the chirp, and **Listen** plays it (one octave up), along with synthesized sounds for supernovae, kilonovae, mergers, tidal disruptions, flares, impacts and feeding, with a volume slider beside it.
- **Spin them.** Each hole has a spin from −0.99 to +0.99. Spin moves the innermost stable orbit, drags gas around through frame dragging, and changes how mergers turn out. Accreted gas spins holes up toward the 0.998 Thorne limit.
- **Feed them.** Drop stars of any type: brown dwarf; M, K, G, F, A, B and O main-sequence stars; red giant, yellow supergiant, red supergiant (Betelgeuse-like), blue supergiant, luminous blue variable (Eta Carinae-like) and Wolf–Rayet; white dwarf, helium white dwarf, hot subdwarf and R Coronae Borealis star; plus neutron stars and black holes. Stars that overflow their Roche lobe stream gas into an accretion disk; get one too close and it's tidally disrupted.
- **Feeding works for every pairing.** Black holes, neutron stars and white dwarfs all accept gas. A star feeding a white dwarf sets off novae. A star much heavier than its companion can't feed it stably: the transfer runs away into a common envelope, where the companion spirals inside the star and either throws off the envelope (leaving the bare core in a much tighter orbit, like Cygnus X-3) or merges with it.
- **Strip them.** A hole rarely eats a star whole. A giant that's fed on long enough is stripped to its helium core, which is left orbiting as a white dwarf (or a Wolf–Rayet star for a blue supergiant). On a stretched orbit a star loses a little on every close pass and survives, and the hole flares each time, like ASASSN-14ko. Part of the stolen gas is blown back out as a disk wind instead of being eaten.
- **Neutron stars.** Two of them merge into a kilonova, and above about 2.3 M☉ the remnant collapses to a black hole. A white dwarf that spirals into a neutron star gets shredded, and the neutron star feeds on it until it's spun up into a millisecond pulsar.
- **White dwarfs obey the Chandrasekhar limit.** They shrink as they gain mass and can't pass 1.44 M☉. Crash two carbon–oxygen white dwarfs past it and you get a Type Ia supernova that leaves nothing behind. Two helium white dwarfs reignite as a helium-burning hot subdwarf; a helium plus a carbon–oxygen one swell into an R Coronae Borealis giant.
- **Age stars.** Step a star through its real life: a Sun-like star swells into a red giant (and starts feeding a nearby hole on its own), then puffs off a planetary nebula and leaves a white dwarf; massive stars become supergiants, luminous blue variables and Wolf–Rayet stars, then go supernova.
- **Spaghettification close-up.** Follow a star into a hole in slow motion, watch it stretch and squeeze, then tear into a long stream of debris.
- **Sgr A\*.** The 4.3 million M☉ hole at the center of the Milky Way, with S2 and other S-stars on their measured orbits, at true scale with stars at their real sizes. S2's 16-year orbit plays in about 30 seconds. Throw a star in for a galactic-center tidal disruption.
- **Rewind.** Missed the merger? The strip above the object bar holds the last two minutes of the scene, with a marker for every merger, nova, supernova, disruption and the like (point at one, or tap it, to see its name). Drag back along the strip, click a marker to land a moment before that event, or press the back button (or B) to go back 10 seconds. Everything goes back: bodies, gas, loose matter, explosions in flight and the strain scope, and it plays out again from there. While paused you can scrub back and forth freely; once time runs again, the old future is gone.
- **Share a setup.** The share button packs the whole scene into the link.
- **Graph it.** The Graphs strip under the strain scope opens three live graphs. A light curve of the whole scene, where a nova, a supernova, a kilonova, a tidal disruption or a star losing a little on every close pass each leave their own shape, with the notices marked along the top. The mass of whatever you're inspecting over time, kept for every body from the start of the scene (a supernova's remnant or a merger's product carries on the history of what it came from). And a Hertzsprung–Russell diagram with every star at its temperature and luminosity, the main sequence drawn faintly behind: age a Sun-like star and watch it climb to the giants, then drop to the white dwarfs. Hover or tap for values.
- **Inspect anything.** Click a body to see its mass ticking live, how fast it's gaining or losing mass, and what's happening to it. A dashed ring shows the orbit it's on, run a lap ahead with the sim's own gravity: closest and farthest points, precession near a hole, and where it will fall in, get torn apart or escape.
- **Make it explode.** Stars above about 8 M☉ can go supernova from the inspector: the iron core collapses, bounces, the shock stalls until neutrinos revive it, and the envelope is blown off, leaving a neutron star or a black hole. Pile stars together and collisions build monsters no galaxy makes on its own: 140–260 M☉ ends in a pair-instability supernova that leaves nothing behind, and above about 260 M☉ the star collapses straight into an intermediate-mass black hole.
- **Pour out matter.** The Matter tool sprays raw gas and dust wherever you hold the pointer, from a dusting to tens of Suns a second. In empty space it falls together under its own gravity; near a body it goes into orbit. What forms depends only on how much gathers: asteroid, moon, rocky planet, ice giant, gas giant, brown dwarf (13 Jupiters), star (0.075 M☉), and a star that keeps growing moves up the main sequence until it can't hold together.
- **Planets, moons and asteroids.** Drop them like stars. Their size follows their mass. Two that collide slowly merge; a fast glancing hit throws off molten debris that can gather into a moon.
- **Rings.** Anything held together only by its own gravity is pulled apart inside a planet's Roche limit, and the pieces spread into a ring that can't re-form into a moon that close in. The dashed red circle shows the limit while you place a moon. Outside it, ring matter sticks back together into moonlets.
- **The Solar System.** All eight planets on their real orbits, the Moon, the Galilean moons and Titan, Ceres, Pluto, Orcus, Haumea, Quaoar, Makemake, Gonggong, Eris and Sedna, the asteroid belt, Jupiter's Trojans and the Kuiper belt. It's in true 3D: tilt the view and every orbit sits at its real angle to the ecliptic, so Pluto (17°), Eris (44°) and Sedna rise above the plane and dip below it, and the belts are puffed up like the real ones. Click a world to follow it and zoom in. Zoom out past the heliopause and the Oort cloud to the fourteen nearest star systems.
- **How the Moon formed.** A Mars-sized world strikes the young Earth off-centre. Part of it is thrown into orbit, and the debris beyond the Roche limit gathers into moonlets that capture each other and merge. Given a few minutes (use 16× or 64×) it usually ends as one Moon of roughly 0.7 to 1.5 times the real one's mass, 3 to 4 Earth radii out.
- **A solar nebula.** A disk of dust round a young star sticks together into a family of planets.
- **Magnetars.** A neutron star with a field a thousand times a pulsar's. Every so often its crust cracks in a starquake and it lets off a giant flare that blows nearby gas and rubble outward and scorches any planet close by.
- **Tilt the view.** Seen from the side, the disk is brighter on the side coming toward you (Doppler beaming), spinning holes show their exact Kerr shadow, and jets show up.

## Controls

| | Mouse | Touch |
|---|---|---|
| Pan | Drag (Move tool) | Drag |
| Zoom | Scroll | Pinch |
| Tilt & rotate | Right-drag or Shift-drag, or the view dial | Twist two fingers, or drag the view dial |
| Inspect & follow an object | Click it (Esc to close) | Tap it |
| Place an object | Pick it in the bar, click to orbit, drag to throw | Same |
| Pour out matter | Pick Matter, set the flow, hold and drag | Same |
| Undo placement | Ctrl/Cmd+Z | Undo button |
| Edit or delete a body | Inspector → Edit | Inspector → Edit |
| Share the setup | Share button (top right) | Share button |
| Back to Move | Esc | Move chip |
| Pause | Space | Pause button |
| Graphs: light curve, mass, HR diagram | G, or the Graphs strip under the scope; hover to read values | Tap the Graphs strip; tap or drag on a graph |
| Rewind | Drag the timeline above the object bar, click a marker, or the 10 s back button (B) | Drag or tap the timeline |
| Hide all the controls | H, or the eye button | Eye button (tap it again to bring them back) |
| Screenshot (PNG, no controls) | P, or the camera button | Camera menu → Screenshot (to the share sheet, where the phone has one) |
| Record a clip (up to 60 s) | Record button; with sound when Listen is on | Camera menu → Record |
| Photo mode | Photo button: pauses, hides everything, the camera stays free; Esc exits | Camera menu → Photo mode |
| Fullscreen | F, or the fullscreen button | Camera menu → Fullscreen (not on iPhone) |
| Help, the tour and things to try | ?, or the ? button | ? button |

On a phone (or a narrow window) the screenshot, record, photo-mode and fullscreen buttons fold into one camera menu in the top bar. On a phone the layout also tightens up on its own: the strain scope folds into a one-line strip (tap it to open), with the graphs as a second strip under it, the inspector and settings become sheets above the object bar (tap an inspected object's name for the full readout), and only the newest notice shows, small, at the top (tap to dismiss). It also works held sideways.

### Keyboard

Every control can be reached with Tab and shows a focus ring. The scene itself is the first Tab stop; with it focused (or nothing focused):

| Key | Does |
|---|---|
| Arrow keys | Pan |
| + / − | Zoom in / out |
| [ / ] | Turn the view |
| , / . | Tilt toward face-on / edge-on |
| Enter | Place the selected object at the centre of the view (with Matter, hold it to pour) |
| Space | Pause |
| B | Back 10 seconds |
| H | Hide all the controls |
| G | Open or close the graphs |
| P | Screenshot |
| F | Fullscreen |
| Esc | Back to Move; leaves photo mode; inside the share box or settings, closes them |
| Ctrl/Cmd+Z | Undo placement |

In the object bar, ← and → pick an object and Enter places it. On a graph, ← and → step through the readings (Shift for ten at a time, Home and End for the first and newest; on the HR diagram, through the stars from hottest to coolest) and Esc clears the reading. On the timeline, ← and → step through the saved moments, Page Up and Page Down jump to the event before or after, and Home and End go to the oldest and the newest. Keys are ignored while you type in a field. Screen readers announce each notice as it appears; each graph reads out as a slider, with a one-line summary of what it shows.

### Gamepad

| Control | Does |
|---|---|
| Left stick | Pan |
| Right stick | Turn (sideways) and tilt (up and down) |
| Right / left trigger | Zoom in / out |
| A | Place the selected object at the centre of the view (with Matter, hold it to pour) |
| B | Back to Move |
| X | Pause |
| LB / RB | Previous / next object |
| Start | Hide all the controls |

Any pad with the standard layout works. Press a button once so the browser lets the page see it.

### Install and offline

Ringdown installs like an app: use the browser's Install option (Chrome, Edge), or Share → Add to Home Screen in Safari on iPhone and iPad. After one visit it also opens with no connection, fonts included. When you're online it always loads the newest version. Opened straight from a downloaded `index.html`, it runs the same, just without the offline copy.

## Working on it

The page is written as the files under `src/` and joined into the one `index.html` by a small script with no dependencies (it needs Node 20 or newer):

```
node build.mjs           # writes dist/index.html, plus the service worker, manifest and icons
node build.mjs --watch   # the same, again on every save
```

Open `dist/index.html` straight from disk, or serve `dist/` for the offline copy and the install prompt.

`src/index.html` is the shell: the markup, and one `/*@include css/phone.css*/` or `/*@include js/physics.js*/` line for each file, in order. The build pastes each file in where its line is, so all the styles end up in one `<style>` and all the scripts in one `<script>` sharing a single scope. Nothing is imported or exported; a new file only needs its own include line, and the build stops if a file under `src/css` or `src/js` has none.

The tests drive the built page in headless Chromium:

```
npm ci
npx playwright install chromium
npm test                 # builds first
```

Every push runs them, and a push to `main` that passes is published to the live site.

## The physics

G and c are scaled together, so 1 grid unit is 11.8 km. Horizon sizes, orbital speeds, inspiral timing and gravitational-wave frequencies all match real values; on-screen time runs about 23× slower than real.

- **Inspiral:** Peters' quadrupole energy loss.
- **Remnants:** spin from the Rezzolla et al. (2008) aligned-spin fit; radiated energy from the remnant's ISCO binding energy. 36 + 29 M☉ gives about 62 M☉, spin 0.68, and 3 M☉ radiated, close to GW150914.
- **Ringdown:** Berti, Cardoso & Will fits for the l = m = 2 quasi-normal mode.
- **Black hole shadows:** the exact Kerr outline (Bardeen 1973) for each hole's spin and the viewing angle.
- **Lensed sky:** the background is bent by the exact Schwarzschild deflection angle (a closed form fitted to the elliptic integral to within 0.1%), so there is a true Einstein ring, the inverted second image of everything inside it, and the whole sky crowding into thin rings at the shadow's edge.
- **Lensed disks:** each pixel near a hole is traced back along a null geodesic to where it crosses the orbital plane, once for the direct view and once more for light bent round the far side. Spin enters to leading order in the frame dragging: a spinning hole bends light like a non-spinning one moved sideways, away from the side turning toward you, by a sin i far out (Asada & Kasai 2000) and by the exact shadow's own offset at the photon sphere, with rays captured exactly on the Kerr outline.
- **Disk light:** the disk's inner edge is the innermost stable orbit for the hole's spin and the way the gas orbits (prograde or retrograde), and its light is shifted by the exact Kerr redshift of a circular orbit, g = 1 / (u^t (1 − Ω ξ)): Doppler beaming, time dilation and gravitational redshift together, brightness as g³.
- **Stars and planets:** stars are limb darkened (a quadratic law, stronger and redder at the limb for cooler stars) and show boiling granulation, a few huge cells on a supergiant and many small ones on a dwarf, with starspots on cool dwarfs; planets get banded, cloudy, icy or cratered surfaces by type, lit from the nearest star.
- **Picture:** HDR with bloom, then a filmic curve (untouched up to 0.7, then the shoulder of the ACES fit, so highlights roll off without clipping) and FXAA edge anti-aliasing. Supernovae, novae, magnetar flares and kilonovae are drawn on the GPU as HDR light behind the lens: their cores blaze far brighter than white for the first second and bloom, and a hole in front bends and hides them like everything else. The Quality setting scales the picture: Low turns off anti-aliasing and surface detail (star and planet surfaces, the filaments in a supernova's fireball), Medium only the surface detail.
- **Orbits near holes:** a pseudo-Newtonian potential with the Bardeen–Press–Teukolsky ISCO for prograde and retrograde orbits.
- **Mass transfer:** Eggleton's Roche-lobe formula. Giants keep their size while the envelope drains, since a giant's radius is set by its core.
- **Disk winds:** 15–65% of the gas reaching the inner disk is blown out, more when the hole is feeding hard, as in ultraluminous X-ray sources.
- **Planets:** radius from mass on a curve through Ceres, the Moon, Earth, Neptune, Saturn and Jupiter. In scenes with nothing relativistic in them, bodies are integrated with a plain Newtonian leapfrog that resolves every orbit down to the moons (in three dimensions in the Solar System).
- **Roche limit:** a body breaks up inside 2 × its radius × (host mass / its mass)^(1/3) after about one of its own free-fall times there; loose matter only clumps where the clump would fit well inside its Hill sphere.
- **Giant impacts:** debris fraction grows with impact angle and with speed above escape speed; the Moon-forming scene is the canonical case (0.13 Earth masses, about 45°, just over escape speed).
- **Solar System:** J2000 orbital elements run forward to late 2026 (JPL's mean elements for the planets, the JPL Small-Body Database for the dwarf planets), real masses and radii, each orbit at its real inclination and ascending node. The Moon's orbit is tilted 5.1° and its node slides round in about 18.4 years, close to the real 18.6, from the Sun's pull alone; Jupiter's moons and Titan start in their planet's equator. The belts get a realistic spread of inclinations (a few degrees for the main belt, up to tens of degrees in the scattered disc). Every other scene is flat.
- **Jets:** power scales with feeding rate × spin² (Blandford–Znajek), beamed for β = 0.92.
- **Star temperatures and luminosities (the HR diagram):** each star type carries a real temperature and radius, and L = R²T⁴ in solar units gives its luminosity. Main-sequence stars follow one curve through the sim's own M, K, G, F, A, B and O types (beyond them, L ∝ M^2.3 below 0.3 M☉ and M^1.5 above 20 M☉), so a star that is fed or stripped slides along the main sequence. Giants take their true radius from their drawn one, so they brighten as they swell, and one whose envelope is down to under 5% of its core heats up at the same luminosity, as stripped giants do on their way to becoming white dwarfs. White dwarfs follow the Nauenberg mass–radius relation, so they fade as they gain mass. Neutron stars (10⁶ K) are off the hot end of the diagram and marked with an arrow.
- **Brightness (the light curve):** the light of everything in the scene, in Suns. Stars as above; gas falling onto a hole, neutron star or white dwarf at the accretor's efficiency (5.7% of the rest-mass energy for a still hole up to 32% for a fast prograde spin, from its innermost stable orbit; GM/Rc², about 17%, for a neutron star and 0.01–0.03% for a white dwarf), up to the Eddington limit (3.3 × 10⁴ L☉ per M☉), past which it grows only as 1 + ln of the excess (Shakura & Sunyaev). Explosions peak at 10^(3 + 6 × the strength the renderer gives their flash) L☉: about 10⁵ for a nova, 5 × 10⁵ for a common-envelope outburst, 10⁹ for a core-collapse supernova, 4 × 10⁹ for a Type Ia and 2.5 × 10¹¹ for a pair-instability supernova, all close to real peaks; kilonovae peak at 10⁸. The time axis is real time, and every graph keeps the whole run in a fixed amount of memory by merging older readings in pairs, each keeping the range it covered and the light curve its brightest moment.

**What it fakes:** ordinary stars are drawn thousands of times smaller than life, mass transfer and pulsar spin-up run fast enough to watch, the space ripples and horizon wobble are exaggerated, and the jets are drawn schematically. The lensing follows Schwarzschild geodesics with spin added only to leading order (a shifted, rescaled stand-in hole), the sky is lensed as if seen from about 11 M away so its Einstein ring stays a few horizon sizes across, and the light of gas near a hole is shifted as if it were on a circular orbit in the disk plane. Star and planet surfaces are procedural, not maps of real ones, and explosions are artist's light: a supernova's flash, fireball and light front are timed for the eye (seconds, not weeks), not modelled. Matter sticks and clumps on a coarse grid of a few thousand particles (up to four times as many on a fast device), enormously faster than in nature. In the Solar System, anything you place starts in the plane of the ecliptic, gas and the gravity between clumps of loose matter are worked out in that plane, the planets aren't flattened at the poles (so over centuries Jupiter's moons and Titan drift off their planet's equator instead of staying on it), dwarf-planet positions are approximate, and the nearest stars are markers, not simulated bodies. The light curve is the total light of everything in the scene, not what a telescope would see through one filter, and nothing is dimmed by distance or dust. Explosions keep the eye's timing on it too, so in the compressed scenes a supernova rises and fades in a fraction of a real second; their peaks are calibrated to real ones, but every explosion has the same generic shape (a fast rise and a steady fade, no plateau for a Type II-P and no second peak). Mass transfer runs far faster than real, so the Eddington limit for accretion light is set where the sim's own disks glow their brightest (1/160 M☉ per screen second at 10% efficiency), not from true rates. A magnetar's giant flare reads millions of times too faint (real ones briefly reach about 10¹³ L☉), and impacts and jets add nothing. Temperatures are the star types' own: white dwarfs never cool, and a star changes stage only when you age it. While paused, the picture's explosions keep fading but the graphs wait. Rewind keeps the last two minutes of running time (paused time doesn't count), in steps of half a second near the present and coarser further back, so that even a scene full of gas and matter stays within about 64 MB; scrubbing lands on the nearest saved step. A replay runs on the same physics from the same state, but not on exactly the same frame times as the first run, so a chaotic scene (three-body chaos, or the debris after a giant impact) can take a slightly different turn the second time. The camera goes back to what it was following but keeps your zoom and viewing angle (except in a close-up, which sets its own zoom); your settings and sounds already playing are not rewound, and a change you make by hand while back in time is replaced if you scrub to another moment before letting time run.
