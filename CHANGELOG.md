# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog
(https://keepachangelog.com) and the project uses Semantic Versioning (https://semver.org).

**Changes fold into the current version** rather than minting a new number each round, so each
section describes what the project *is* rather than logging every state it passed through. A new
section opens when an animation is **finished** — see `.claude/CLAUDE.md`. This project does not
use git tags or GitHub Releases; the version in `package.json` is the record.

## [2.0.0] - 2026-08-09

**"Westbound on Grizzly Peak" is finished, and a third animation begins.** That is the only thing a
MAJOR bump means here — see `.claude/CLAUDE.md`.

### The third animation — "Above the Fog"

From *"an overhead view of tons of billowing flowing fog under a gusting wind, wisps dissolving and
changing into each other, over a lazy winding river and a cute riverside town with a cafe, a
restaurant and twelve jewellery shops — the ground in reversed colour and barely ever visible with
blue and green fires burning on it, and every few minutes one cloud pixelates into an angel, then a
grim reaper, then a giant happy face before dissolving back into fog"*.

Straight down and orthographic, so there is no perspective anywhere in it and no horizon to hang
depth on. Every cue that says *thick moving volume of air* rather than *scrolling texture* has to
come out of the motion: shear between layers, light that moves independently of the shape it is on,
and masses that grow, draw out, thin away and are replaced by masses welling up through them.

- **Coverage is geometric, not lucky.** The base of the fog is a *lattice*: a jittered grid of
  lobes, each a good half wider than its cell, so every point in frame is inside two or three of them
  by construction. Fog built by scattering clouds about and hoping cannot promise 95% — there is
  always a hole somewhere, and a hole that appears because the random numbers came out that way is a
  hole in the wrong place, which is worse than no hole at all. The lattice scrolls as one body and
  each cell keeps its identity as it goes, so a cell leaving the right edge is the same cell arriving
  on the left rather than a new one popping into being. Cell size comes off the frame **diagonal**,
  not its short side: off `min(W, H)` a wide short window needs three times as many lobes and a
  phone twice as many again, and this way the count stays near ninety at every shape of viewport.
- **The peek-a-boos are subtraction, not holes.** Seven windows wander the frame, and a lobe near an
  open one is drawn *thinner* rather than skipped — so a gap opens because the fog above it thinned,
  closes when a billow drifts back over, and is ringed by a soft transition the whole time. None of
  which a punched hole gives you, and a hard `clip()` would leave a crisp outline around every gap.
  The window never clears completely either: the aerial wash stays, so the town arrives hazy, which
  is what looking down through a few hundred feet of air actually looks like — and it means the
  *wash* is a hard ceiling on how clear a window can ever get, so most of the hiding has to be done
  by cloud, which windows can thin, rather than by haze, which they cannot. All seven windows share
  one period with their phases spread evenly around it — give them slightly different periods and
  they drift into alignment eventually and hand you a frame with the fog half gone. The typical
  point in frame is about **97% obscured** and the clearest point in any frame around 40%,
  both measured off the recorded op stream at every sample time — and *both* are asserted, because
  fog thick enough to satisfy the coverage bound and never open at all is a change that looks like
  an improvement right up until the scene has nothing underneath it.
- **Range comes from one shared field, not from opacity.** A stack of transparent greys composites
  toward its own mean, and cranking the alphas only gets you to mid-grey faster. So a single slow,
  large-scale noise field decides where the fog is thick and where it is thin, and *everything*
  reads it: the base takes its tone from it, the light only lands where it is already high, and the
  near-black strands only where there is light to eat into. That is what turns six greys into banks
  — a near-black mass here, a pale one drifting over there — instead of an even mottle, and it is
  what gives a *single frame* the whole range rather than making the range something you only see
  over a minute. Highlights are the same mass drawn again, shrunk and shifted toward one fixed key
  light so they sit on the shoulder of something, and they are **additive**, which is the only way
  to actually reach white — a near-white lobe composited normally over grey lands at grey plus a
  bit, and the top of the ramp is never arrived at.
- **Filaments are the layer that decides it.** Long, thin, aligned to the flow, bright, and barely
  there. Without a second spatial frequency an order of magnitude finer than the billows carrying
  it, the whole thing reads as smoke from a machine rather than as a fog bank. Near-black strands go
  over the light afterwards, so the crests come apart into fibres instead of staying smooth blobs.
- **Nothing in the fog snaps.** The one that mattered most, and it was not any of the places I
  looked: each lattice lobe took its grey by **indexing** a six-entry ramp with a drifting field —
  `CURTAIN[Math.floor(bank * …)]` — so every lobe stepped from one grey to the next in a single
  frame, forty levels at a time, dozens of times a second all over the frame. Reading the ramp at a
  *continuous* position instead removed it outright. Measured on the rendered pixels rather than on
  the code: worst single-frame change in a 40s run went from **80 levels to 14**, and the 95th
  percentile from 20 to 6, with the median frame-to-frame change unchanged — so it is the outliers
  that went, not the motion. The other one it found: four two-hundred-pixel masses appearing and
  vanishing in a single frame at both ends of every apparition, because The Cloud's halo was never
  multiplied by the envelope the rest of it fades on. The lattice also carries three cells of margin
  now instead of one, so the outermost column — whose identity changes every time the field scrolls
  a whole cell — does that off screen where it belongs.
- **Wind, and a bit of physics.** The wind gusts: two slow non-harmonic sine terms on a steady base,
  and — the part that matters — position integrates the *speed* rather than multiplying by it.
  `x = speed(t) * t` is not motion under a changing wind, it is teleportation, because raising the
  speed instantly relocates everything that has already travelled. Integrating means a gust only
  affects where things go from now on. Every free mass is advected over exactly the stretch of time
  it has existed for, so the whole field surges together. And everything is **stretched along the
  way it is actually going**, more so the faster it goes: the total velocity is the gusting wind
  plus the local curl, so a mass in a slack eddy stays round while one in the stream draws out,
  which is what makes a gust read as a gust rather than as everything sliding faster at once.
- **The fog dissolves; it does not disappear.** Every mass now *expands* monotonically through its
  life while its opacity rises and falls, so it arrives small and dense and leaves wide and thin —
  which is what vapour does. Scaling size and opacity together, the obvious way, gives a shape that
  shrinks back to the point it grew from: a thing being removed rather than a thing spreading out
  until it is indistinguishable from the air around it. Filaments go further and change *aspect*,
  the major axis running away from the minor as they age, so a soft puff draws out into a thread and
  thins to nothing. Bounded, though — letting the major axis run while the minor one stands still
  reaches fifty to one by the end of a life, and a fifty-to-one ellipse is a scratch on the lens.
- **And each life begins where the last one ended.** A mass's home is its own previous home plus a
  short hop, evaluated from the incarnation number so it stays closed-form, so a mass that has just
  thinned away is replaced by one welling up *through* it rather than by one somewhere else
  entirely. That is most of what makes the field read as changing into itself rather than as a set
  of independent puffs taking turns.
- **Nothing in the fog glitches any more, and that is the fix.** There was a whole pass of it —
  lobes strobing out, bands of the lattice shoved sideways, the finished frame shredded and printed
  back over itself. The trouble with every version of it is the same: fog has no detail to corrupt,
  so damaging it can only *remove* it, and fog vanishing in chunks does not read as a fault in the
  picture, it reads as a fault in the renderer. The glitching moved wholesale into The Cloud, below,
  where it belongs to one object with an outline and a face and is unmistakably something happening.
  Losing the full-frame tape effects also took the frame cost from ~95ms to ~6ms software-rasterised
  — they were the entire budget.
- **The town below** (`site/scenes/above-the-fog/town.js`) is a **photo negative**: hues at their
  complements, so the water is the lightest thing on the ground, the roads the darkest, and the
  vegetation violet. A glimpse reads as somewhere that is not quite a place rather than as a place
  lit differently, and the value *structure* survives the flip intact — everything that was
  distinguishable by brightness still is, just the other way up. It is built out of **value**, not
  detail, because it is only ever glimpsed: drop a gap anywhere and the shapes have to read in the
  second before it closes.

  It is deliberately **not** a literal `255 - c` inversion any more, and it was. The negative of a
  de-saturated photograph is another de-saturated photograph — everything landed between about 130
  and 210, which is one flat mid-grey wash with a hint of lilac in it, and through a hole the size of
  a fist that is nothing at all. So: **contrast is value** — the ladder now runs the whole way, roads
  near black at about 26 and the river near white at about 240, because brightness is the only thing
  that survives being seen for a second through a hole. And **off-ness is hue** — the complements are
  taken at real chroma instead of pulled back toward grey, giving violet grass, sand-coloured water,
  teal and slate roofs, jewel-toned awnings, and a *dark* glitter crawling downstream on a pale
  river. What stops it becoming a cartoon is that none of it is allowed to be **lit**: every colour
  down there is pigment, mid-to-dark, sitting still, and the neon in `lights.js` stays the only thing
  in the frame that emits.

  Two things that were invisible at the old contrast and unbearable at the new one, both fixed with
  the value spread kept: the grass tiers are drawn as **overlapping discs** rather than as a grid of
  rectangles — the grid genuinely could not be seen while the four tiers were a few levels apart, and
  across seventy levels it became a wall of tiles, which is the one texture that announces *generated*
  out loud. And the glints on the water lie **across** the current, the way a wave crest does, with
  their position in the channel drifting on its own noise: along it, evenly spaced down the middle of
  a pale ribbon, they had become a road's centre line.

  The river is generated first and everything else is placed relative to it, which is what stops the
  result looking like three unrelated layers stacked up: twelve jewellers in a parade along the front
  under jewel-coloured awnings, a cafe with a forecourt of parasols, a larger restaurant with its own
  terrace, twenty-six houses on rows behind, and four hundred trees rejection-sampled against the
  water and the roofs — a canopy sitting on a roof is the one mistake that makes an overhead view
  stop reading as an overhead view.
- **No blur.** `ctx.filter = 'blur(24px)'` would give softer lobes and is not worth it: it allocates
  and composites an offscreen layer per drawing operation, so a couple of hundred of them is tens of
  milliseconds a frame — and where it is unsupported it fails *silently*, landing every shape
  hard-edged, so the scene does not look worse, it looks broken. A radial gradient is soft
  everywhere, always, and costs one fill.
- **Smaller and more numerous, not fewer and softer.** The first version drew masses a quarter of
  the frame across, and a frame five masses wide reads as five blobs however gently they fade.
  Halving every radius and doubling the count costs nothing, because what a gradient fill costs is
  its *area* and the area is unchanged — and it is the change that made the fog stop looking like
  overlapping discs. The two related findings: a lobe's flat centre is what gives it away, so the
  falloff runs `(1 - q²)^2.5` from a very small core (leaves and reaches the rim at zero slope, and
  stays fat through the middle so neighbours merge in their tails); and deforming a lobe's
  *outline* barely shows, because the alpha out there is already near zero — the lumpy silhouette
  has to come from clustering four lobes at four different sizes, not from wobbling one.
- The nav arrows wear it: a **vapour** chevron, a wide blurred stroke with a thin sharp one inside,
  drifting sideways as much as up. It carries a dark halo rather than a bright one, because the
  scene beneath runs all the way to near-white and an arrow with only a glow disappears the moment a
  lit crest passes under it.

- **Something is burning down there, and somebody is setting off fireworks** — `lights.js`, and the
  only colour in the animation. Against a ground that is a photo negative of an already de-saturated
  palette, under six greys of weather, a cyan and a green at full chroma do not read as coloured
  pixels; they read as the one thing in frame that is *lit* rather than merely visible.

  Both rules that shape it come from the camera being **directly overhead**:

  *Nothing is radially symmetric.* A flame from above is a bright base with a plume of light lying
  downwind of it, not a disc — the first version was a symmetric glow with a ring and some rays
  around it, which is a lens flare, or a flying saucer, and looked like one. Every light leans now,
  and the flame body is rebuilt on a **held clock** twelve times a second rather than eased, because
  fire does not ease, it gutters.

  *Gravity points at the camera.* A firework's sparks cannot arc downward when "down" is away from
  you, so they spread, decelerate hard and dim in place while the wind carries the whole burst
  sideways. The climb is drawn as a point that brightens and grows rather than one that travels, for
  the same reason. Neither is how a firework looks from the ground and both are how one looks from
  above it. They go up in *shows* — three to five shells in a ragged sequence from one spot, then
  nothing there for a minute and a half — because people do not set off one firework.

  A burst is **streamers, crackle and pixelated puffs**, and the flash is small and lasts about a
  fifth of a second. It used to be a disc most of the width of the burst that grew and shrank, and a
  disc that grows and shrinks is the one shape that says *a value is being animated* rather than
  *something exploded*. Two per-spark quantities do the work of not being a circle: a **speed**, so
  the front is ragged rather than a rim (one radius for every spark is a disc however it is
  coloured), and a **life**, so sparks go out one at a time over a couple of seconds instead of the
  whole shape dimming together. Every sixth streamer comes apart near the end of its run and throws
  a knot of smaller ones sideways, and the puffs are chunky clots of colour dissolving on the ordered
  dither matrix from `effects/pixel.js` — the same `bayerOn` The Cloud comes apart on, so the one
  thing in this scene that breaks into blocks now has company.

  The spark geometry is shared with the pass that lights the fog, which is the point of pulling it
  out: **the cloud is lit in the shape of the burst**, in arms rather than as a ball. That pass is
  drawn last over everything, so its single `glow()` — whose radius grew with its brightness — was
  not merely *an* orb, it was the only part of a firework that could reliably be seen. What is left
  of it is a base glare at a **fixed** radius that only ever changes brightness; the moment a size
  follows a brightness there is a pulsing ball in the frame again, whatever is drawn on top of it.
  The fires' own glow came down at the same time, for the same reason in reverse: at full flare a
  campfire was throwing the largest, brightest coloured mass in the frame, out-punching a shell going
  off, which puts the hierarchy the wrong way up. A fire is a steady thing you keep noticing; a
  firework is an event.

  Sparks are stroked in five **alpha bands** rather than one `stroke()` each. A path carries a single
  alpha, so the obvious way to give every spark its own life is fifty-four rasteriser passes per
  colour per shell, which measured at around seven milliseconds a frame by itself; quantising a life
  that is already twinkling on a held clock, over a range narrower than the twinkle, is free to look
  at.

  And every light is drawn **twice**: once on the ground, under the whole depth of the cloud, where
  it is mostly invisible; and once as the light it throws *into* the fog — wide, faint, last of
  everything. Fog does not hide a light so much as carry it, and a shell going off inside weather
  lights the weather. That second pass is what is actually looked at, and the only reason any of
  this registers through ninety-seven percent coverage.

  One mistake worth keeping: `glow`'s last argument is the alpha at 45% of the radius, not a falloff
  rate. Hand it a number larger than the centre alpha and the gradient turns inside out and draws a
  **ring** — which is emphatically not what a light in fog looks like, and rendered as seven flying
  saucers hanging in the cloud.

#### The Cloud

About every three and a half minutes one mass of fog stops being weather. (It was once a minute,
which turned out to be often enough that it stopped being an event and became a feature of the
scene — you should have half forgotten it can happen.) It gathers, pixelates into a coarse grid of
chunks, and resolves into an **angel**; the angel decodes into a **grim reaper**; the reaper decodes
back into The Cloud, now wearing an enormous happy face; and then it comes apart and is fog again.
Nobody comments on it. It is the only thing in the scene that glitches, and that is the point — the
fog going to pieces reads as a rendering fault, one object doing it reads as something happening.

Two decisions carry it:

- **The figures are hand-drawn bitmaps, not procedural shapes,** on a 28×34 grid. Twenty-two across
  was not enough and no amount of care with a dozen cells fixed it — an angel and a reaper are both
  "a vertical mass with a lump on top" until there is room for a wing to be a wing. Six more columns
  bought the angel a halo, a head clear of its shoulders and two wings sweeping up behind it, and
  the reaper a pointed cowl, a hollow with eyes in it, and a crescent blade on a snath that stays
  outside the robe for its whole length instead of vanishing into it. They are ASCII art in the source, four levels deep, where they can be read and edited *as*
  art. Each carries its own two-colour ramp **and its own opacity**, because the two trade against
  each other — the reaper's near-black void inside a dark-grey cowl comes out eight levels apart
  once it is composited at 84% over mid-grey, and brightening the cowl to fix that makes him a
  ghost. Keeping the ramp dark and taking his opacity nearly to solid gets a black hollow inside a
  dark cloak, which is the thing itself.
- **The morph is a per-cell coin toss, not a cross-fade.** Each cell picks the old figure or the new
  one depending on whether its own hash has been passed by a sweeping threshold, so the angel is not
  dissolved into the reaper, it is *replaced* by it, cell by cell, in a scatter — and the cells
  nearest the threshold shove sideways while they change. That is what a decoder does when handed a
  keyframe it cannot fully apply.

It is drawn **early** — under the billows, the crests, the filaments and the dark strands, all of
which pass in front of it — and dimmed by however thick the fog is directly above it, sampling the
scene's own density field rather than growing a second opinion about where the banks are. Drawn
late it was a sprite on the weather; drawn here it is a thing happening some way down inside a bank
of it. Five masses drift across its face, dark ones as well as pale: a figure only ever veiled by
white haze reads as lit from in front, which is a spotlight, not weather.

At most six fills for the whole thing, mid-morph, with two figures on screen and every cell
displaced by its own amount. `tests/fog.test.js` asserts one apparition per cycle with genuinely
varying gaps, and that all four figures resolve, in order, one at a time — if a morph window ever
swallowed a figure whole, nothing else in the suite would notice.

### Changed — the channel change wears the scene it arrives at

Moving between animations used to run one hard-coded effect: displaced slices, chroma pulled apart,
a bright seam. That is the language of *Asleep Among the Stars* and of nothing else, so arriving at
a 16-bit sunset through analogue smear announced the wrong thing about where you were going.

It is now `meta.transition`, dispatched in `site/effects/transitions.js`, and each one is built out
of the primitives of the scene it belongs to so the two cannot drift apart:

| | |
| --- | --- |
| **tape** | the tape failing — displaced slices, chroma apart, a bright seam riding the join |
| **pixel** | a screen of tiles being rewritten out of order, every displacement a whole number of chunks, the join lit like a sodium lamp with a Bayer falloff instead of a gradient |
| **vapour** | weather closing over the join and opening on the other side — nothing displaced and nothing sampled, because fog does not damage a picture, it hides it |

A change wears the scene it is **arriving at**, not the one it is leaving: the transition's job is to
introduce the next animation, and that animation is what you are left looking at when it settles.

Two things fell out of building them. The pixel change has to snap *every* displacement to whole
chunks — a band sliding by half a chunk next to hard-edged art reads as neither, and it is the one
tell that would give the style away. And the vapour bank needed spreading in depth as well as width:
puffs of similar size on a single line merge into one smooth white lozenge, which is a bar drawn
across the picture rather than weather closing over it.

`.claude/CLAUDE.md` and `docs/AUTHORING.md` now say so as a standing rule — a new animation, which
is the only thing that earns a MAJOR here, brings its own nav chrome *and* its own channel change.
`tests/scenes.test.js` fails on a scene that declares neither or names one nobody implements, since
the silent default is the tape change and that belongs to exactly one animation.

### Changed — every scene is its own self-contained thing

The gallery had grown to the point where "a scene" meant one very long file and the shared code was
wherever it was first written. Both are now structural:

- **`site/scenes/<id>/`** — one directory per animation, its name *is* its id, `index.js` is its
  entry point, and it may grow to as many files as it wants (*Above the Fog* is three). The unit on
  disk being the folder is also what makes the registry checkable: `tests/scenes.test.js` now scans
  the directory and fails on anything present but unregistered, or registered under a different name
  than its folder.
- **`site/effects/`** — shared *animation* code, the things a future scene would otherwise
  reimplement: the VHS tape artefacts, the wet-paint ribbons, the 16-bit pixel grid and its ordered
  dither (`pixel.js`, lifted out of *Grizzly Peak*), the noise and flow fields (`field.js`), and the
  soft volumetric lobe (`volume.js`).
- **`site/lib/`** — the *engine*: the stage, the seeded RNG, and the small canvas helpers. The
  distinction that matters is that `lib` knows nothing about any particular look, and `effects` is
  nothing but looks.
- **No scene may import another scene**, and there is now a test that says so. The moment one does
  they stop being separable and the gallery becomes one program with several entry points.

`field.js` carries the constraint that governs all of this in its header: everything in it is a pure
function of position and time, with no state and no `dt`, because the render tests draw each scene at
eight timestamps **out of order** and compare two runs op-for-op. Anything integrating velocity into
a stored position would drift apart between the live loop, the poster frame and a resize.

### The second animation is done

*Westbound on Grizzly Peak* is finished as of this release. Its record is the `1.0.0` section below.

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
- **The road climbs out over the bay.** Its vanishing point is at the waterline rather than on the
  ground, and it bends left on the way — quadratically in distance, so it is straight under the car
  and leans harder the further off it goes. A constant offset would just move the vanishing point,
  which is a different road, not a curved one. It is the one thing in the scene not trying to be
  plausible.
- **A cliff, not a verge.** The drop to the right of the road is drawn as a real face: a band of
  near-black hanging off the edge and deepening as it comes toward you, ragged where the rock
  breaks up, with a second dimmer line partway down so the eye has something to measure the depth
  against. Along the very edge is a **cool** pale lip, catching sky rather than lamplight — in
  copper it disappeared into the pools the lamps were throwing over it. A guard rail runs the
  length, posts spaced in world distance with a cable sagging between them, which does more for the
  drop than the shading does: a rail is a thing people put where you would otherwise fall.
- **Bronze lamps** on the hill side of the road, one every four and a half seconds, sodium heads on
  copper poles with the arm reaching back out over the tarmac. Wide flat pools of light, because a street lamp lights a long ellipse
  down the road rather than a circle under itself — and those pools are the only reason the road is
  legible.
- **Lamps do not simply stop being drawn** — there is no distance at which an object that size can
  vanish between two frames and be taken for anything but a bug. As one reaches the near end its
  light collapses and the metal comes apart from the top down, and then it goes one of **five**
  ways, picked per lamp when the scene is built so the road shows a mix rather than a sequence:

  | | |
  | --- | --- |
  | **glitch** | tears into horizontal slices that shove sideways and drop out one at a time |
  | **confetti** | bursts into small squares that fly out and fall |
  | **mosh** | smears into flat bands that stretch and re-seed, like a decoder dragging a row |
  | **ember** | burns yellow → orange → red, goes grey, and the ash settles back down |
  | **bolts** | throws jagged dashes outward on angles snapped to sixteenths of a turn, then breaks into juddering fragments |

  All five are **angular** — hard slices, shards, bands and kinks snapped to a fixed set of angles,
  nothing that curves — and all five are over in about half a second. They are drawn at real size,
  because a lamp only reaches the near end every four and a half seconds now and each exit has the
  frame to itself when it does. Each is still built to one rule: under ninety chunks, at most three
  fills, and never brighter than the lamp it replaces. That budget is about restraint rather than
  cost — the sky alone draws thousands of chunks a frame — but the first version of the bolts
  peaked at 336 and was easily the loudest thing in the picture.
- **The stars sparkle** in four soft tints, each on its own slow swell — a field that pulses
  together is a strobe. At the top of a swell the brightest of them throw a four-point cross, which
  at this resolution is the same star with four chunks added, so it reads as light rather than as a
  bigger dot. Batched one path per tint: four fills a frame instead of two hundred and sixty.
- **The bay**, with the sun half into it and its glitter path broken into chunks that widen and
  quicken as they come toward you. A city across the water as blocks with a few lit windows.
- **Trees** on the slope in four silhouettes — eucalyptus, pine, a tall narrow cypress, and the bare
  angular limbs of a dead one — roughly twice as many as before, across a band twice as deep. At
  this distance the outline *is* the tree, so the outline is the only thing that distinguishes them,
  and a hillside of two shapes repeated is wallpaper. Canopies are built row by row; drawn as whole
  rectangles they are boxes on sticks. They go down *before* the tarmac: a canopy anywhere near the
  middle of frame is wide enough to erase the road, the lamps and the light on both.
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
when there is somewhere to go — so a single-animation gallery is nothing but the animation.

And they are **invisible almost all of the time**: every ten seconds they fade up, hold for a
second, and fade away again. A control parked permanently on top of the picture is chrome however
soft it is, and the page's one rule is that the animation *is* the page. Reaching for one — hover
or keyboard focus — cancels the cycle and brings it back immediately, because a control that only
answers on its own schedule is a puzzle rather than an interface. Under `prefers-reduced-motion`
they simply stay visible and still.

**The arrows wear whichever scene is mounted** (`meta.chrome`). Each button carries every glyph the
gallery knows how to draw and shows the one the scene asks for: *Asleep Among the Stars* gets the
soft stroked chevron with its magenta and cyan bloom; *Westbound on Grizzly Peak* gets a stepped
sprite in sodium amber with a hard offset shadow, which **hops** four pixels rather than gliding.
No blurred glow and no sub-pixel motion, because the scene it belongs to has no soft edge anywhere
in it and one would be enough to make the rest look accidental. A scene that names no chrome gets
the original chevron.

The gallery runs **newest → oldest**: down goes further back in time, up returns toward the present,
by chevron, scroll, space, arrow keys, or a vertical swipe. `#scene-id` deep links work.

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

- A **MAJOR** bump means *an animation is finished and the next one begins* — that and nothing
  else. `.claude/CLAUDE.md` keeps the ledger of which version finished which animation.
- Everything else folds into the current version rather than minting a number per round.

Both recorded in `.claude/CLAUDE.md`.
