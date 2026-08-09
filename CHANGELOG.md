# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog
(https://keepachangelog.com) and the project uses Semantic Versioning (https://semver.org).

**Until a release is actually cut, changes fold into the current unreleased version** rather than
minting a new number each round — a version that was never tagged isn't a version. Once a release
has been published, the next change opens a new section. See `.claude/CLAUDE.md`.

## [1.0.0] - 2026-08-09

**The first animation is finished, and a second one begins.** In this repo that is exactly what a
MAJOR bump means — see `.claude/CLAUDE.md`. Everything below is the whole project to date in one
section, since nothing had been released before now. Intermediate states that were later replaced —
the cosy first composition, the cold monochrome pass, the fading caption chrome, the distant planet
— are not listed: they left nothing behind.

### The second animation — "Westbound on Grizzly Peak"

From *"2.5D 16-bit from the perspective of a car travelling diagonally up and to the left, a series
of copper bronze street lamps, a cliff drop-off overlooking the bay from Grizzly Peak west to the
water, trees, and a fiery sunset in a night sky — with a car spinning as a figment across it on
occasion"*.

Nothing in it is anti-aliased on purpose. Every coordinate snaps to a chunk a few screen pixels
across, there are about twenty colours in the whole scene, and **every gradient is flat bands with
ordered Bayer dither between them** — a `createLinearGradient` would be one call and would look
completely wrong, because smooth colour is the thing the hardware being imitated could not do and
its absence is most of why the style reads. Halos are dithered the same way, scanned as a box
rather than as rings: rings sound cheaper and are wrong, since successive rings don't tile the grid
and the light comes out as scattered specks with gaps between them.

- **Yellow, red, blue.** One fire ramp runs hot to deep and doubles as the water's reflection; one
  night ramp runs the other way. The sky's join is the whole palette in one place — deep blue
  straight into red, with only the dither mixing them.
- **A real perspective divide** on the road: `focal / (focal + z)`, not a lerp. That one division is
  what makes the lamps bunch toward the vanishing point and the centre line accelerate as it comes
  at you; with a linear map, things spaced evenly along the road are spaced evenly on screen too,
  which is not perspective at all.
- **Bronze lamps** on the hill side of the road, sodium heads on copper poles with the arm reaching
  back out over the tarmac. Wide flat pools of light, because a street lamp lights a long ellipse
  down the road rather than a circle under itself — and those pools are the only reason the road is
  legible.
- **The bay**, with the sun half into it and its glitter path broken into chunks that widen and
  quicken as they come toward you. A city across the water as blocks with a few lit windows.
- **Trees** on the slope, eucalyptus and pine, canopies built row by row — drawn as whole
  rectangles they are boxes on sticks, and at this distance the silhouette is the entire tree. They
  go down *before* the tarmac: a canopy anywhere near the middle of frame is wide enough to erase
  the road, the lamps and the light on both.
- **A car spins across the night sky** every twenty-three seconds, end over end, half transparent
  and never explained — the one thing in frame that does not obey the road.

### The first animation is done

*Asleep Among the Stars* is finished as of this release. What follows is its whole record.

### Added

**The engine.** `site/lib/stage.js` owns device pixel ratio, resizing, the frame loop, pausing in
a hidden tab, and `prefers-reduced-motion` (which holds a still poster frame instead of moving). A
scene receives only a 2D context, a clock and a size — no DOM — which is exactly what lets every
scene render headlessly in CI. Randomness is seeded (`site/lib/rng.js`), so a scene looks
hand-placed but draws identically on every machine.

The stage also adapts: a scene can cap its render scale with `meta.maxDpr`, and if frames start
arriving slower than ~28fps the stage drops resolution further and restores it when the machine
recovers. The scene never hears about either — it always draws in CSS pixels.

**The channel change.** Moving between animations draws the two scenes exactly adjacent and pushes
them vertically past each other while the composite is torn apart — displaced slices, chroma
smear, and a bright seam riding the join — then it settles. It lives in the stage and operates on
rendered pixels, so it knows nothing about scenes and every future animation gets it for free.
Skipped entirely under reduced motion.

**VHS artefacts** (`site/lib/vhs.js`), modelled on a real tape failure: per-scanline shred, chroma
pushed to neon, long horizontal smears, hexagonal honeycomb dither, head-switching dropout bars
with noise inside them, rolling scanlines and grain. The displacement is real, not an overlay —
slices of the rendered frame are copied back over it. At any moment roughly half the picture is in
pieces; the rest is what you are there to look at.

Two of them are about *digital* failure rather than tape wear. **The stuck macroblock**
(`blockRepeat`) samples one small rectangle and stamps it again and again across a strip, so a
stretch of picture becomes a print of itself — each cell holds its source for a beat before picking
another, which is what makes it read as stuck rather than as noise. And the **block field is
neither a lattice nor one shape** (`cellDither`): a regular comb of identical hexagons is the one
thing in frame that looks authored, so every row takes its own shear, squash, pitch, line weight
and colour, and every cell picks its own number of sides — triangles through octagons — its own
rotation, its own size, and a per-vertex wobble that stops even a single cell from being a regular
polygon. Cells drop out, a few flood solid, and all of it runs on a slow seed so the field holds a
shape for a beat instead of boiling.

And it is up **about one second in twenty** (`ditherAt`), on its own sparse schedule — roughly one
appearance every thirty seconds, lasting a second and a half. This is the one artefact in the chain
that does not run continuously, and the reason is that shapes over the picture *all the time* stop
being an artefact: they become the thing the frame is made of, and everything else has to compete
with them. Scarce, the field goes back to being a fault — the decoder losing its mind for a moment
and getting it back — which also lets it hit harder while it is there.

**Damage arrives on a schedule, not a beat** (`damageAt`). Ambient damage runs the whole time; on
top of it, time is cut into slots and each slot *may or may not* contain an event, at a hashed
offset inside it with a hashed length and amplitude. Empty slots run together into real silences —
sixteen seconds of them, measured — while two events either side of a slot boundary land almost on
top of each other. Amplitude is biased hard toward small, so most events are a flicker and, roughly
once a minute, one is an order of magnitude worse with no warning. A fixed period was the one thing
that gave the effect away: once you have heard the beat you stop being surprised by it, and the
tape stops feeling broken and starts feeling scored. Evaluated in constant time — only neighbouring
slots can still be sounding — and overlapping events add, so a cluster hits harder than its parts.

Every peak still **dwells at its maximum** rather than touching it in passing (`heldPulse`): a
plain sine bump is at full value for a single frame, so the worst moment of a fault is over before
the eye has settled on it. The envelope splices a plateau into the peak, rise and fall keeping the
shape they had. The artefacts underneath go on churning while it holds, so a held peak stays broken
without freezing. The biggest events also multiply *passes* rather than displacement: past about
half the frame width a shifted slice simply lands off screen, so more distance stops buying
anything, while running the same zones again at offset times keeps multiplying how much of the
picture is torn.

**The frame breaks** (`shatter`). Cracks run out from an impact point at unevenly spaced angles,
the pieces separate, spin and fall out of shot — inner shards flung hard, outer ones heavier and
dropping further. Rare and on its own slotted schedule, so it stays an event you wait for rather
than a rhythm you learn. The crack edges are drawn as four strokes stacked — a wide magenta bloom,
a violet body, a cyan edge and a **white core that stays one pixel wide** however far the bloom
spreads. The core is what makes it read as sharp: a crack drawn only as a glow is a smudge, and the
eye takes the thinnest bright line in a stack as the edge with everything softer around it as
light.

**Three ways the picture bleeds through itself.** A glitch that removes picture is just a hole; a
glitch that removes one layer to show another is the frame arguing with itself. The tape holds more
than one layer now — snapshots taken at different points in the chain, made on demand so a scene
that never asks for a second one never pays for it — and three artefacts read a *different* layer
than the one they draw over:

- the **shatter** paints the undamaged layer first and lays the shards back over it, so the reveal
  opens exactly as fast as the pieces travel, and at the end of a break you briefly see the scene
  with none of the damage on it at all;
- **bleed windows** punch a hard-edged rectangle of the clean picture straight back through the
  wreckage — the tracking momentarily locking, sampled slightly off from where it lands so the
  clean image sits offset from the damaged one around it. Short duty cycles: hold it and it stops
  being a fault and becomes a picture-in-picture;
- some **stuck blocks** print from the clean layer instead of the damaged one, so a strip of
  undistorted picture repeats across a frame that is otherwise in pieces.

**Wet black paint** (`site/lib/paint.js`) thrown over everything: small goopy flecks that read as
holes punched in the image, and brush strokes that drawl downward from a loaded head. Both are
built from one ribbon primitive — a spine with an independent half-width at every sample — so a run
bulges where paint gathers and pinches where it has thinned. That variation is the whole point: a
ribbon of constant width falling straight is a column, and a frame of columns is a fence. Strokes
swell somewhere along their length and lean by a fraction of that length rather than of the head,
so a long one wanders instead of hanging plumb.

The wet look comes entirely from the specular edge, since the paint itself is near-black, and a
catchlight has to sit *inside* its bead: a glow wider than the drop reads as a luminous bubble
hanging in space. Marks are placed on a jittered grid, because purely random ones clump into a
single mass while half the frame stays bare. Parked centres are kept off the sleeper.

**The paint is part of the scene, not a sheet over it.** Two things do that. It sits at *two
depths in the chain*: most marks go down before the bloom, so the same soft double that lands on
every other edge in the frame lands on them too and the tape then shreds and smears them with
everything else — the rest go on after every artefact, on the glass, as the one thing the tape
cannot tear. And every mark is **travelling**: it parks and creeps for most of a two-to-eight
minute cycle, then lets go, accelerates out of the bottom of frame, and comes back in over the top
in a different lane. At any moment about four of the thirty are crossing an edge and one is fully
out of shot, so marks drip in and out rather than the field scrolling together — a field where
everything moves at once is a texture going past; a field where one thing lets go at a time is
paint.

**The first animation — "Asleep Among the Stars"**, from *"a bed floating in space with someone
snuggled under the covers peacefully sleeping while the bed gently floats amongst the stars"*:

- Composed for scale. The bed is sized against the viewport's **short edge** rather than fitted to
  the frame, so it takes about a quarter of a desktop window and less on anything larger — the
  bigger the screen, the more lost it looks. It sits off-centre and the emptiness is the subject.
- It **rolls a full 360°** about the axis from the pillow to the foot of the bed — a vertical
  squash in projection, collapsing to a line edge-on and inverting past 90°. Eased so it dwells
  face-up and sweeps through the back, one turn every 44 seconds.
- Drift periods in **minutes, not seconds** (97s, 71s, and a 127s tumble), so it wanders the frame
  instead of bobbing in place.
- **Sunglasses** arrive out of nowhere, settle on the sleeper for a while, and leave. Nobody puts
  them there. They are lit like a sign rather than like glass — three weights of neon rim over
  black, a bar of light raking across, and chroma copies running either side — and they never
  commit to existing: they stutter on their own clock, arrive three times too big and shrink onto
  the face, then swing between about two thirds and one and a half while worn. Sized deliberately
  wider than the skull, because a pair fitted to a head this small is twenty screen pixels of
  nothing.
- **The sleeper is not reliably there.** Once every thirty-seven seconds they come apart into
  horizontal bands — each displaced by its own amount, some missing altogether, echoes thrown
  either side and magenta/cyan leaking out of the edges — stay gone long enough that you start
  looking for them, and reassemble. The bed never goes: an empty bed still adrift is the point.
  The bands are clipped in the bed's own coordinate space, so the effect composes with the roll and
  the tumble without knowing about either, and costs nothing while the sleeper is simply present.
- The sleeper **snores**: the mouth opens on the out-breath, and every snore pushes a wireframe
  solid out into space. Breathing, the Z's and the echoes all run off one clock.
- A **black hole** with a pocket of visibly bent spacetime around it. Concentric discs of the
  frame are each magnified, twisted and blurred more than the one outside it — and the pass runs
  *between* the accretion disc and the shadow, so the disc is dragged through its own lens while
  the shadow and photon ring stay hard-edged. The magnification breathes and the twist wanders, so
  the pocket is never still.
- An **orbiting pair of neutron stars**, the scene's single light source: the disc's lit limb, the
  duvet's rim and the sleeper's face all derive their edges from that one position.
- **Curve stitching** — sets of straight lines whose envelope is a parabola — over a galactic band
  of clustered stars cut by soft dust lanes.
- **Nothing is clean.** Heavy coloured haze in three big washes plus seven smaller clouds that
  visibly travel and wrap, and a bloom pass that draws the whole frame back over itself blurred,
  slightly enlarged and slowly drifting, so every edge has a soft double that moves.

**The front-end** (`site/index.html`, `app.js`, `styles.css`): **no text at all.** The animation is
the page; the title and description survive only as the canvas label and a screen-reader live
region. Navigation is two soft chevrons floating at the top and bottom edges, each present only
when there is somewhere to go — so a single-animation gallery is nothing but the animation. The
gallery runs **newest → oldest**: down goes further back in time, up returns toward the present, by
chevron, scroll, space, arrow keys, or a vertical swipe. `#scene-id` deep links work.

**Headless render tests.** A recording 2D context (`tests/helpers/recording-context.mjs`) draws
every scene at three viewports and eight timestamps, failing on NaN geometry, colours built from
`undefined`, out-of-range alpha, unbalanced `save()`/`restore()`, and non-determinism. Plus
registry and site-integrity suites: no orphaned scene files, no missing assets, no root-absolute
paths (which would 404 on a project Pages site), no CDN dependencies, no visible text on the page,
and a gallery that is still newest-first.

**GitHub Pages deployment from Actions** (`.github/workflows/pages.yml`), gated on the tests.

**`/animate <description>`** slash command and `docs/AUTHORING.md`, so adding an animation is one
described sentence.

Initial scaffold via repo-bootstrap (Portka standard): branch-per-change workflow, an enforced
SemVer version sync, a test suite, and CI.

### Performance

The full-screen effects are the whole frame's cost. Three findings worth keeping:

- **Never sample the canvas you are drawing into.** `drawImage(ctx.canvas, …)` forces a flush per
  call: 78 slices cost **948ms**, the same 78 read from a separate buffer cost **4.2ms**, and the
  one full copy that fills that buffer is free. The stage owns the buffer and hands it to scenes,
  so scenes still never touch the DOM. Measured in headless Chromium at 2880×1800.
- **Resolution is the only lever that reliably works** on a fill-rate-bound pipeline, which is why
  `meta.maxDpr` and the adaptive fallback exist. Coming down is much faster than going up, and a
  catastrophically slow frame counts triple, so a machine well over its budget reaches a usable
  scale in about a second rather than half a minute. Star fills are batched by colour and alpha
  step for the same reason — ~900 individual fills became a few dozen.
- Profiling by wrapping `fill`/`drawImage` is useless here: it accounted for 6.5ms of a 94ms
  frame, because Skia defers rasterisation to flush. Measure end-to-end frame time and real
  achieved frame rate instead.

### Versioning

- A **MAJOR** bump means *an animation is finished and the next one begins*. `1.0.0` will be cut
  when *Asleep Among the Stars* is done and a second animation starts.
- Changes fold into the current unreleased version until a release is actually published.

Both recorded in `.claude/CLAUDE.md`.
