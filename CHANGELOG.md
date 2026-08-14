# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog
(https://keepachangelog.com) and the project uses Semantic Versioning (https://semver.org).

**Changes fold into the current version** rather than minting a new number each round, so each
section describes what the project *is* rather than logging every state it passed through. A new
section opens when an animation is **finished** — see `.claude/CLAUDE.md`. This project does not
use git tags or GitHub Releases; the version in `package.json` is the record.

## [3.6.0] - 2026-08-14

**"Above the Fog" is finished, and a fourth animation begins.** That is the only thing a MAJOR bump
means here — see `.claude/CLAUDE.md`.

### Several compositions of one animation

An animation may now hold more than one *composition* of itself — the same artwork, arranged a
different way — and a tap on the picture walks them. The gallery has two axes: up and down moves
between animations, left and right moves between arrangements of the one you are looking at, and both
are rings.

- **A composition is data, not a branch.** A scene declares `meta.variants`, an ordered list in which
  index 0 is what the gallery opens on; `create()` receives the whole block and turns it into
  numbers the drawing code already takes as parameters. There is not one `if` about compositions
  anywhere in the draw code, and a test forbids one — the moment a scene asks *which* arrangement it
  is, the two stop being one implementation and become two that share a file, where every future
  change has to be made twice and nothing tells you when you missed one.
- **The engine never learns what a composition is.** The stage forwards an opaque value into
  `create()` and forgets it. A scene having several arrangements is a fact about the *artwork*, and
  an engine that understood compositions would immediately acquire opinions about how they differ.
- **Changing one carries the clock.** Both entries are the same artwork at the same instant, so the
  sky, the stars and every schedule in the scene continue straight through the change instead of
  snapping back to zero — one picture being re-arranged rather than two pictures. That is legal only
  because scenes are pure functions of `t`; the determinism rule is what buys the single line.
- **Tap, swipe and the daylight between them.** A press that stays inside ten pixels and half a
  second is a tap; one that travels sixty is a swipe; in between is a deliberate dead zone, because
  re-arranging the picture on an abandoned gesture reads as the page misreading you. The swipe is
  tested first and returns, so a long drag can never also count as a tap.
- **A latent bug in the old swipe handler, fixed on the way past.** A press that began on the canvas
  and lifted over a chevron never delivered a `pointerup`, so the start point survived and the *next*
  release measured a distance nobody travelled and moved the gallery for no reason. Pointer capture
  and a `pointercancel` handler close it.
- **Addresses gained a second half**, and the grammar moved to `lib/gallery.js` where it can be
  tested without a browser: `#<scene-id>/<composition-id>`, with the first composition writing no
  suffix at all — so every link already in the world still opens the picture it opened before.
- **A composition change dissolves; it does not travel.** Moving between animations is a channel
  change — two scenes pushed past each other and you arrive somewhere else. Moving between
  arrangements of one animation is not going anywhere, so pushing it past a near-copy of itself says
  *you have travelled* about a picture that has not moved. It now dissolves in place, and the style
  belongs to the scene the same way the channel change does (`meta.dissolve`).
- **The mechanism is that the outgoing arrangement is frozen once, and then rots.** The stage captures
  the last frame into a scratch layer at the moment the change starts and never captures again, so a
  dissolve costs *one* scene draw a frame where the channel change costs two — and what persists is a
  genuinely stale photograph rather than a second live scene fading out, which would keep moving and
  read as a cross-fade between two things instead of one of them going off.
- **Grizzly Peak re-arranges by losing its keyframe.** An 8-bit datamosh: the macroblocks the decoder
  still has get re-used and dragged along by motion vectors with nothing left to apply them to,
  smearing in coherent slabs and stretching along the drift, until they give up and the new
  arrangement is simply what was underneath. The two behaviours are **persistence** and **drift**, and
  neither is re-rolled per frame — a block that is stale stays stale and travels in one direction for
  as long as it lasts. Re-rolling either gives television static, which is a different artefact from a
  different decade.
- **Reachable without a pointer, and announced.** Left and right arrows walk the ring, swallowed only
  on animations that have one; the live region names the position and the gesture, which is the only
  way a tap-only affordance is discoverable without sight.

### "Westbound on Grizzly Peak" gets its original composition back

The road out over the bay is still what the scene opens on. Tap it and the vanishing point drops back
down onto the slope, where this animation started: no bend, no cliff, no rail, a wider road, and the
frame split cleanly in two — sunset, city and bay above the line, and below it nothing but tarmac and
lamps running away into the dark. The whole composition is that one horizontal edge, what the car is
driving *toward* on one side of it and what it is driving *into* on the other, and the bend was what
dissolved it: a road that leans across the frame has no side to be on.

Every improvement made since — the four-tint stars with their crosses, the five ways a lamp goes out,
the thicker treeline — belongs to both, because only the road's geometry is a composition and
everything else is the scene.

### The fourth animation — "The Rose Funnel"

From *"a pixelated tornado swirling up reds, pinks and purples"*.

Four things in the brief, and only one of them is hard. *Tornado* is a silhouette, *reds, pinks and
purples* is a palette, *pixelated* is a grid — but **swirling up** is the animation, and it is the
only part that cannot be faked with a texture. The scene is built around it.

- **You never draw a cylinder, you draw the front of one.** At any height the funnel is a circle
  seen edge-on, so the surface facing you spans the screen from `cx - r` to `cx + r`. Map a screen
  column back onto that circle with `asin((x - cx) / r)` and every chunk on screen knows the angle of
  the piece of funnel it is showing; feed that angle into a repeating colour band and the bands wrap
  around the shape for free — and because `asin` compresses hard near ±1, they crowd at the
  silhouette exactly the way markings on a spinning drum do. That one line is what makes a flat stack
  of rectangles read as something with a *back*.
- **Rotation is not motion.** Nothing in the funnel translates. The band's phase advances with `t`,
  so the colours travel around a shape that is standing still — which is what a rotating solid
  actually looks like. Add a term in *height* to that phase and the bands become a helix: they climb
  as they turn, and the funnel is swirling **up** rather than merely spinning.
- **Angular speed rises as the radius falls**, so the narrow end whips round while the mouth barely
  turns. Getting that the wrong way up is the single most obvious way to make a tornado look like a
  spinning cone, and it costs one term to get right.
- **Flared, not conical.** The radius goes as `up ** 0.62` — opening fast just above the ground and
  then widening slowly, which is the trumpet profile a real one has. A straight cone reads as a party
  hat, and the entire difference between the two is in that exponent. The axis snakes on two
  unrelated slow periods, with the top wandering further than the base because the top is in the part
  of the storm that is actually moving.
- **A storm to hang from and a horizon to stand on.** A funnel on a flat field is a shape floating in
  a colour. A wall cloud of counter-rotating lobes above it, rain shafts well behind it, and a dark
  ground rushing past below — and the same drawing reads as a thing in a place. What sells *contact*
  is the skirt: a low, wide, churning debris cloud at the foot of it that is **brighter** than the
  funnel above, because that mess is lit by everything and shaded by nothing.
- **One ramp, seven steps, and every single thing is drawn out of it** — funnel, storm, ground,
  debris, lightning. It runs as one line through colour space from a near-white rose down through
  pink, magenta and violet to a near-black plum, so any two steps beside each other look like the
  same material at two brightnesses rather than two colours meeting. Three separate hue families
  would have been three colours sharing a frame; this is one.
- **No gradients anywhere, and no interpolation between steps.** A ramp read continuously *is* a
  gradient, and a gradient is the thing pixel art is defined by not having — the bands only read as
  bands if there is a hard edge between them. Even the sky is an ordered Bayer dither between flat
  colours, which is how a machine that could not do smooth colour would have had to draw it.
- **Seven fills for the whole tornado**, however many thousand chunks it is made of: every chunk is
  bucketed by ramp step and each step issues one path. A fill per chunk is the identical picture at
  several thousand rasteriser passes a frame.

### The temple under it

*"An ornate pagoda temple many stories tall and with a giant spire, being destroyed and created —
wood splintering, roof tiles flung, stone statues cracking and exploding what they collide with,
glassware shattering — while disembodied spirit hands rebuild it ceaselessly, cutting trees, milling
wood, smelting iron, firing kilns and blowing glass, in a never-ending cycle of birth and death and
re-birth."*

- **A pagoda at seven pixels is not a shape, it is a chord.** Silhouette alone gets you *tower*. What
  gets you *pagoda* is a value rhythm repeated up the frame — dark mass, overhanging eave, bright rim
  — each repetition narrower than the one below, with the upturned corner defined in *columns from
  the tip* rather than as a fraction of the span, so the curl is exactly two chunks on the wide bottom
  roof and on the narrow top one alike. As a fraction it is a hook on one and a jag on the other.
- **The mass is one flat value, and it is the ramp's darkest — the one step the funnel forbids
  itself.** That prohibition, written for the tornado's own reasons, turns out to be load-bearing for
  the building: step 6 is produced only by things *behind* the funnel, so a step-6 shape in front of
  it can never be read as part of it. The temple is a hole in the tornado, which is the only way a
  building stays legible against a vortex drawn in the same seven colours. The chord is therefore
  spent on the *eaves* rather than the walls, because the eaves project past the funnel on both sides
  at every storey and a mid-ramp wall over a mid-ramp helix appears and vanishes on the rotation.
- **Destruction is caused, and causation is memory — which is forbidden.** The render tests sample `t`
  out of order, so nothing may be latched. The resolution: a latch is only forbidden if you have to
  *store* it. Every bay runs its own cycle, and the second its current round began is available in
  closed form as `began = (n - phase) * period`. Ask the storm where it was *then*, hash the verdict
  off `(bay, n)`, and destruction is causal, latched for the round, fresh every round, and computable
  at any `t` in any order. The funnel wandering off heals nothing, because nothing is re-asked.
- **It is never whole and never gone.** The strike chance has a floor, so something is always missing;
  the phases are spread over the whole unit interval with a golden rotation per storey, so at `t = 0`
  every bay is already inside its own round. There is no moment at which this building was ever new,
  and no seam, because there is no global loop — only thirty incommensurable ones.
- **Four materials out of one ramp.** Value is already spent on depth, so material is carried by
  aspect, spin, mass and how each one dies: wood is long and tumbles end over end, a tile collapses to
  a line twice a turn, stone is big and slow, glass is small and breaks into a dozen bright specks.
  All four share the same seven buckets, so four materials cost exactly what one costs. Spin rates are
  all under about two radians a second — faster and a five-chunk plank moves its own endpoint further
  than a chunk between frames, so the silhouette jumps instead of turning.
- **Every material shows what it is made of.** A flying piece used to be one solid rectangle, which
  was defensible while the temple was two values and the forest was lollipops — the law was
  "silhouette only", and a plank has to obey the same law as everything around it. That law changed:
  the building shows its joinery and the trees show their tiers, and against that a flat block reads
  as a hole in the picture shaped like debris. So each material now carries a second and third mark
  inside its own silhouette, and each mark is the one that names it — **wood** has grain along its
  length and a pale sawn end, **tile** wears the same lit-ridge-and-shaded-curl chord as the roof it
  came off, **stone** has a lit face and one broken corner (the corner is what makes it rubble rather
  than a block), and **glass** has a dark rim with light inside it, which is the one read glass has
  that nothing else does. The marks travel with the piece's rotation rather than being stamped in
  screen space, so a plank turning end over end shows its grain foreshortening with it.
- **A statue does not find something to hit; the thing it hits is launched so as to be there.** A
  detected collision cannot alter a trajectory that is a closed-form function of `t`, and integrating
  one is the stored state the tests exist to forbid — so the meeting is choreographed, solving
  `v = (p₁ - p₀ - ½gT²) / T` for the victim's launch. Exact, two lines, and it happens every round.
- **The hands are drawn at the size of what they carry, not at the size of a hand** — a lie the eye
  takes instantly because there is no other hand in frame to compare against. Disembodied is done by
  subtraction: no arm, nothing to be attached to, and a wrist that comes apart into separating chunks
  behind it. The workshops are silhouettes with one hot chunk each, because a shed with a structure
  and a lit doorway drawn in nine background chunks is a speckle, and a dark shape with an ember in it
  reads as a forge from across the room.
- **The funnel gave up its own debris.** It used to carry a hundred and fifty motes; the moment there
  was a temple beneath it being torn apart, those became the same idea drawn twice — two orbiting
  populations doing one job, at which point the orbit stops being legible and becomes a cloud.
  Everything in the air now came off the building, which is cheaper and makes the debris *mean*
  something.
- **The background moved to two grids and paid for all of it.** The sky's ramp is a smooth field whose
  dither is its only pattern, so coarsening it turns a texture into a lattice — and it is the cheap
  part. The storm and the ground are noise-driven, where a bigger chunk reads as a bigger billow, and
  they are where the time goes. Splitting them took the frame from 14ms to 10.9ms *before* anything
  was added; the whole scene now runs at 12ms with a temple, four kinds of debris, a forest, three
  workshops and four hands in it. The ceiling is 20ms, and it is not a preference: the stage drops
  render scale after twelve slow frames but only restores it after three hundred frames under 20ms, so
  a scene sitting above that would degrade once and never recover.

### Four ramps instead of one, and a storm with weather

The scene was reading as 8-bit, and the reason was structural rather than stylistic: with one
seven-step ramp, value was fully spent on depth, so *everything* had to be told apart by silhouette
alone. A picture where value carries no information is an 8-bit picture whatever else is true of it.

- **Twenty-six colours in four ramps, chosen as a harmony.** **SPIN** is the storm, rose through
  magenta, around 330°. **JADE** is everything that grows or is glazed — the forest, and the temple's
  roof tiles — at around 165°, which is magenta's **complement**: the greatest separation available
  without either colour looking arbitrary, and the reason a green-tiled temple in front of a rose
  tornado reads instantly as a different substance rather than as a darker piece of storm. **LAPIS**
  is the night and the shadow under everything, at 225°, sitting *between* the other two so the
  complement is a relationship rather than a collision. **GOLD** is the accent, four steps, rationed
  to a handful of chunks — fire, the finial, the light inside glass.
- **The green roof is not only a colour decision.** Fired ceramic tile is what a temple of this kind
  is actually roofed in, so the one element carrying the complement is also the one whose material
  the scene keeps showing you being made in a kiln.
- **The sky crosses two ramps**, deep lapis at the top falling into the storm's own rose at the
  horizon. A rose funnel against a rose sky is a shape in a field of its own colour; the same funnel
  against a night that turns rose only where it meets the ground has somewhere to be brightest.

### The storm has a life

It held one width, one speed and one place, which is a decoration rather than a tornado.

- **It walks.** The march moves the whole storm across a third of the frame on two long unrelated
  periods, so it comes down on the temple, grinds at it, and drags away — and because the temple's
  bays ask where the storm *was* when their round turned over, the destruction rate is not a constant
  with a wobble on it, it is the weather. Storm on the building: the eaves go, then the walls. Storm
  away: almost nothing. That contrast is the whole point of the cycle and it was previously invisible.
- **It swells and slackens**, from a rope at 0.73 of its width to a wedge at 1.2.
- **The turn is the integral of its speed, not its speed times the clock.** `t * power(t)` looks like
  the same quantity and is not: differentiate it and there is a `t · dpower/dt` term that grows
  without bound, so the vortex visibly runs *backwards* every time the wind eases. The closed form
  costs the same two cosines and turns one way forever, because the power never reaches zero.

### The temple, at nine values instead of two

A roof with a lit ridge, a body and a shaded underside is *ceramic*; the same roof in one flat tone
is a wedge. Every third tile column is a capped roll, keyed to the column index rather than to screen
position so the pattern does not crawl as the building sways. Under each eave: a dark shadow line
that separates one storey from the next, then a gold bracket course — the dougong, and the only
rhythm needed to read "repeated wooden units" at seven pixels. Lit doorways and windows with a lamp
burning inside, which is the one reason to believe anyone has ever been in here. A gilded sōrin with
its nine rings and the flaming jewel at the tip.

**And the walls have a lit face and a shadow face — chosen by where the storm is standing.** There is
no sun in this scene; the vortex is the only light in it, so the building re-lights itself as the
storm walks past. One comparison, a whole extra read.

### The forest, and what the hands are actually doing

- **Conifers in tiers, in two depth bands.** A trunk with a blob on it is a lollipop and eighteen in a
  row is a comb. What reads as a conifer is the taper *in steps* — a stack of tiers, each narrower
  than the one below, each with a lit crown. It is the pagoda's own trick, which is no coincidence:
  a pagoda is a stylised tree. The far band sits a chunk lower and a step darker, which is all the
  depth a treeline needs.
- **The hands are authored as a bitmap**, because a palm rectangle with chunks stuck on it is a
  mitten. A hand needs a palm with mass, fingers that are separate, a thumb set off across a gap, and
  a wrist narrower than both — none of which survive being improvised in code. Two poses, open and
  gripping, mirrored to face the way they are going.
- **Each craft is visibly a different job.** The circuit is four acts — work, carry, fix, return — and
  the work is where the crafts differ: the sawmill drives a toothed blade back and forth and throws
  dust, the kiln works tongs with a tile glowing in their mouth, the glass bench turns a pipe with a
  gather on the end of it, slowly, because glass is slow. The workshops gained pitched roofs,
  chimneys and lit mouths, each breathing on its own rhythm.

### A taller temple, and enough room inside it to build something

Held wide, the height budget ran out after a few storeys of stacked plates. Narrower and taller — a
pagoda's proportion is three or four times its base width — buys both more storeys *and* more rows
inside each one, and the rows are what the joinery needs: a storey of six rows can hold a wall, a
storey of twelve can hold a building.

What that room went on, one row each: the **dougong** drawn as separate brackets rather than one
bright rule, because the point of the course is that it is many small repeated wooden units and a
continuous line says *trim* where a row of blocks says *carpentry*; a **balcony** projecting past the
wall with balusters you can count, so the silhouette has two overhangs of different widths instead of
one; **corner and intermediate posts** with a beam across their heads, which is the answer to *what
is it made of*; **lattice windows** where the light comes through the joinery rather than out of a
hole; **double doors** with a split and a threshold on the ground storey; and a **bell** and a **stone
guardian**, which are the only two things in the building that are not *of* the building — which is
exactly why the eye finds them. Posts went from one every three chunks, where a wall becomes a stripe
pattern, to one every eight, where the panel between them is the thing you see.

### The hands are spirits now

Ordered dither as translucency. Every chunk goes through the same Bayer matrix the sky's ramp uses,
at a density falling off from the middle of the palm outward: the core is solid, the fingers are half
there, the wrist barely at all — so the picture behind shows through and the thing reads as
not-quite-present. It is how a 16-bit machine drew a ghost, for exactly the reason we need it: there
is no alpha to be had, and a flat silhouette in a pale colour is a *pale hand*, not a spectral one.
The dither is keyed to the sprite's own grid rather than to screen position, or the hand would slide
across a fixed screen-door and read as a hole cut in the picture.

They also gained an **aura** one ring outside the silhouette at the density it has just run out of —
a spirit with a hard edge is a sticker — and a long **streaming tail** whose chunks lag further
behind the further back they are. And they are spectral blue-white: neither the storm's rose nor the
building's jade and gold, because a thing lit by nothing has to be its own colour or it reads as a
chip off whatever it is standing in front of.

### Wind, and things going up the throat

- **A real bulge.** A sine everywhere is a wobble; the read of a bulge is that it is *somewhere in
  particular*. It is a narrow gaussian in height whose centre climbs the column on its own clock and
  whose depth comes and goes on a slower, unrelated one, so one swelling travels up and is gone, and
  another turns up somewhere else later.
- **The storm has a wind field as well as a body.** Most of what a tornado does, it does to things it
  never touches, so `vortexAt` now returns both numbers. The temple's damage is measured against the
  **field**, not the wall — a storm passing near strips it without the column ever crossing it, and
  the reach now matches the streaks you can see blowing past.
- **The wind is visible**: streaks orbiting outside the body on the same clock the surface turns on,
  obeying the same facing rule, lying *along* the circulation so they foreshorten as they come round.
  Bright, deliberately — wind at the dark end of the ramp is the sky's own value and simply is not
  there. Each streak is **reeled in as it climbs**, so the wind visibly *feeds* the column instead of
  decorating it, and its excursion is capped against the frame rather than against the field: `wind`
  scales with the funnel's own width, so a wedge-phase storm was flinging streaks into the corners,
  where they stopped reading as air and started reading as confetti.
- **The ground is covered in loose things, and they are taken.** Litter is lifted when the field
  passes over it, wound around the column, carried up and **gone**. Vanishing is the point: debris
  that orbits for ever is a decoration, and this is the one thing in the scene that is destroyed
  without anybody rebuilding it. Captured building debris now does the same — up the throat and out
  of existence — instead of circling until its round ran out.

### Its chrome and its channel change

Both required of a new animation, and both built out of this scene's own primitives.

- **`funnel` chrome** — a chevron cut out of chunk and *banded* rather than solid: two tones from the
  ramp, hot leading and cool trailing one chunk behind. That is the scene in a glyph, since its
  subject is a colour band wrapping a shape; a flat silhouette would have said "pixel art" without
  saying which. It hops on the same beat the pixel chrome does — neither may move by half a pixel.
- **`funnel` channel change** — the picture caught in the vortex. It shares every primitive with the
  pixel change and feels like its opposite, and the whole difference is one word: *coherent*. There,
  each band rolls its own dice and the frame shreds along horizontal lines; here the offset is a
  smooth function of height and time, so the rows stay in a relationship and the frame reads as being
  **wound** around a vertical axis rather than torn across. Tearing is a fault; winding is a force.
  The twist flares around the join — the funnel's own profile applied to the whole frame — the seam
  wears the ramp wrapped the way the funnel's bands are, and debris orbits the join on an ellipse,
  with the far half of the ring going down the ramp instead of being drawn in front.

## [2.0.0] - 2026-08-09

**"Westbound on Grizzly Peak" is finished, and a third animation begins.** That is the only thing a
MAJOR bump means here — see `.claude/CLAUDE.md`.

### The third animation — "Above the Fog"

From *"an overhead view of tons of billowing flowing fog under a gusting wind, wisps dissolving and
changing into each other, over a lazy winding river and a cute riverside town with a cafe, a
restaurant and twelve jewellery shops — the ground in reversed colour and barely ever visible, with
people down there setting fires and letting off fireworks that burst amongst the fog as stylised
orange and red fractal pixel art, and every few minutes one cloud pixelates into an angel, then a
grim reaper, then a giant happy face before dissolving back into fog"*.

Straight down, or very nearly — a long lens almost overhead, so there is no horizon to hang depth on
and the only perspective in it is the small radial lean that gives the ground its height. Every cue
that says *thick moving volume of air* rather than *scrolling texture* still has to come out of the
motion: shear between layers, light that moves independently of the shape it is on, and masses that
grow, draw out, thin away and are replaced by masses welling up through them.

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
- **Haze: the frequency that was missing.** Below it the fog runs from cell-sized lattice lobes down
  to filaments; above it there was nothing but a single linear wash over the whole frame. With no
  scale in between, the ground, the lights and the cloud read as three flat decks stacked up — every
  join in the picture happened at either the size of a lattice cell or the size of a window. Half a
  dozen masses a third of the frame across, living a minute apiece at an alpha you cannot point to,
  tie them into one atmosphere. They are subject to the peek-a-boos like everything else, because
  being that large they would otherwise quietly close one — and it would be invisible in review,
  since nothing about the picture would look wrong, there would simply never be anything underneath.
  The billows underneath them also went from twenty-two to twenty-nine across a much wider span of
  size and lifetime, a fifth of them big and slow, chosen by index rather than by a roll so one seed
  in ten cannot come out with no large masses in it at all.
- **The blackout.** Once or twice a minute the weather stops existing. The whole layer tears itself
  apart in bands, blocks of it drop out, and then for **one full second there is no fog in the frame
  at all** — the town, the river, the fires and every person on the ground, in the open, with nothing
  over them — before it comes back the same way it left.

  Two artefacts do the tearing, and they are the two a decoder actually produces. A **block** either
  arrives or it does not, so an element of the fog is drawn whole or not at all rather than faded out;
  and a **band** of the picture slides sideways as one, so the shift depends only on which horizontal
  strip a thing is in. Both are read off a held fifteen-frame clock so the shredding steps rather than
  slides — a smooth tear is a dissolve, and a dissolve is the one thing this must not look like. Hard
  bars of flat tone cross the frame on top, which is the dropped blocks made visible.

  It works precisely *because* it is rare, and that is the whole argument the rest of this file used
  to make in the other direction: fog has no detail to corrupt, so damaging it can only ever remove
  it, and fog dissolving in chunks minute after minute reads as a broken renderer rather than as
  weather. The same artefact at ninety-second intervals reads as an **event** — and what it reveals is
  the entire reason the ground below is drawn as carefully as it is.

  The light-in-the-cloud pass is gated on it too. Left running, a blackout would leave a dozen soft
  glows and a set of chunky sparks hanging in clear air with nothing to be inside, which is the one
  thing that would give it away: the reveal only works if what is revealed is the *bare* ground.

  This is the one place the scene's headline claim — that the fog is 95% of it, always — is
  deliberately broken, so `tests/fog.test.js` skips blackout moments **by name** and asserts the
  schedule separately: one per window, fully clear for about a second, under one part in fifty of the
  running time, and gaps that genuinely vary so it never becomes a metronome. The alternative was
  loosening the coverage bounds until a frame with no weather in it passed them, at which point the
  assertions stop saying anything.
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
- **The camera is no longer exactly overhead.** Everything that stands up — buildings, trees, rocks,
  people — displaces **radially from the centre of frame** in proportion to its height, which is what
  a very long lens looking almost-but-not-quite straight down actually does: the building under the
  lens shows you its roof and nothing else, and the one at the corner shows you a wall. A single
  fixed lean direction would have been cheaper and is exactly what makes an isometric mock-up look
  like a mock-up, because every object in it is viewed from the same impossible place. The scene now
  has a *principal point*, it is the middle of the frame, and nothing there stands up at all.

  A building is a footprint, four side faces and a roof. All the walls in the town go into **one
  path** and the roofs are painted over them afterwards — not a trick, just what is true: the top
  leans away from centre, so the far faces end up underneath the roof polygon and the near ones end
  up outside it, and painter's order does the hidden-surface work for nothing. Trees get a trunk
  stroked from foot to crown, rocks and people the same. Cast shadows are thrown the *opposite* way
  from the lean, which is what makes the lean read as height rather than as everything having been
  nudged sideways.

  One thing this broke on the way in, worth writing down: the awnings, ridges, parasols and tables a
  building carries are drawn in its own rotated frame, and that frame has to be translated to where
  the **roof** ended up, not to where the building stands. Anchored at the footprint they slide off
  the shopfronts the moment the town is anywhere but the middle of the frame.
- **The ground stopped being made of rectangles and discs.** Building footprints are four corners
  each jogged by its own amount, because a town of rectangles is a spreadsheet seen from above.
  Canopies are four to seven unequal lumps on an ellipse rather than three on a circle — three equal
  lumps still average to a disc at this size, which is how four hundred trees became a polka dot the
  first time. And the ground gained three things that are irregular by construction: **rock** in
  clusters of unequal lumps, allowed near the water where a tree is not; **scrub**, drawn as a spray
  of short strokes rather than a blob; and **reeds** in stands along the bank, leaning together on a
  shared gust so a clump moves as a clump.

  Trees are **clustered into copses**, not scattered evenly: two thirds of them are dropped around one
  of a dozen stand centres, square-rooted so the density does not pile up in the middle of each, and
  the rest left loose. A rejection-sampled uniform scatter is uniform, and four hundred evenly spread
  trees is a lawn with dots on it — a wooded valley from above is thick stands with clearings between
  them. Houses run over a much wider span of size than they did, because a row all within a tenth of
  each other is a terrace and a terrace behind a terrace is a housing estate. And a handful of
  **outbuildings** stand well out in the fields, turned whichever way they like: everything built used
  to be within a couple of hundred metres of the water and squared up to it, which reads as a model
  village, and the strays are what make it somewhere people spread out across.

  Fields are **parcels** now — closed, five-to-seven-sided, no two alike, over a wide span of size,
  each a slightly different tone with a hedge on its boundary and about half of them catching a neon
  rim. (All of them rimmed, at the count they run to, is a wireframe laid over the fields rather than
  a few edges picking up light.) They replaced nine long straight lines ruled across the grass at
  arbitrary angles. A hedge line does say *farmed*, but a straight one bounding nothing is a scratch
  on the picture, and once the ground had rocks and scrub and reeds on it those nine lines were the
  only thing left in frame that nothing in nature would have made.
- **A neon rim, on the edges that catch.** Roof outlines, parcel boundaries and the kerb in three
  blues — azure, periwinkle, cyan-teal — alternating so the town does not hum on one note, and the
  water's edge in amber because the river is the warm axis of the scheme and a cold rim would cut it
  out of the picture it belongs to. It is a *rim*, not an outline: thin, semi-transparent, and only
  ever on the boundary of something already there, so it reads as an edge catching light rather than
  a border drawn round a shape. The difference between the two is about thirty percent of alpha.
- **The town below** (`site/scenes/above-the-fog/town.js`) is a **photo negative**: hues at their
  complements, so the water is the lightest thing on the ground, the roads the darkest, and the
  vegetation blue. A glimpse reads as somewhere that is not quite a place rather than as a place
  lit differently, and the value *structure* survives the flip intact — everything that was
  distinguishable by brightness still is, just the other way up. It is built out of **value**, not
  detail, because it is only ever glimpsed: drop a gap anywhere and the shapes have to read in the
  second before it closes.

  **The scheme is one cool family against one warm axis.** Everything growing or built is blue — four
  steps of it in the grass, a lighter blue in the canopy, blue-grey in the rock and the roofs, and a
  blue neon rim on the edges that catch — and the two things that are *not* are the river and the
  roads, which run amber and a warm near-black. That is what a peek-a-boo needs: a field of one hue
  with a seam of its opposite through it, so the river reads as the river the instant it appears
  rather than as a lighter bit of ground.

  The ground was **violet** for several rounds, and violet is the wrong choice here for a reason that
  only shows up once everything else is in place: it sits half-way between the blue of the weather
  and the warm of the fire, so it argued with both. The roads went with it — they were a cold
  grey-teal, and at that value a hue barely registers as a hue, but a cold grey sitting in a coloured
  field is the one neutral that reads as *dirty*. Warm near-black instead, on the river's side of the
  scheme. And the neon went blue: azure, periwinkle and a cyan-teal. Blue neon on blue ground sounds
  like it should vanish and does the opposite, because a rim far more saturated and slightly brighter
  than what it sits on reads as *the same material lit* rather than as a different object outlined,
  which is exactly what neon is. The waterline keeps an amber rim, because the river is the warm axis
  and a cold rim would cut it out of the picture it belongs to.

  It is deliberately **not** a literal `255 - c` inversion any more, and it was. The negative of a
  de-saturated photograph is another de-saturated photograph — everything landed between about 130
  and 210, which is one flat mid-grey wash with a hint of lilac in it, and through a hole the size of
  a fist that is nothing at all. So: **contrast is value** — the ladder runs the whole way, roads
  near black at about 4 and the river the brightest thing on the ground, because brightness is the
  only thing that survives being seen for a second through a hole. And **off-ness is hue** — the
  complements are taken at real chroma instead of pulled back toward grey, giving blue grass, amber
  water, teal and slate roofs, jewel-toned awnings, and a *dark* glitter crawling downstream on a
  bright river. What stops it becoming a cartoon is that none of it is allowed to be **lit**: every
  colour down there is pigment, sitting still, and the neon in `lights.js` stays the only thing in
  the frame that emits.

  **And the whole ladder sits low.** The first pass at the above took the values *up* as it took the
  chroma up — grass in the 130s to 200s, a near-white river at 238, pale lilac trees — which is the
  wrong half of the range to be in, for two reasons that only show up once everything else is in
  place. The fog is a bright grey, so a pale ground has nothing to be seen *against*: the river came
  within a few levels of the cloud in front of it and dissolved into it, and a peek-a-boo stopped
  looking like a hole. And every light in the scene is additive, so a bright ground is a bright floor
  under the fires and the fireworks and leaves them less room to be brighter than it. The river is a
  burnt amber at 102 now rather than a cream at 238, the grass runs 55 down to 25 at nearly ninety
  percent saturation — the chroma is what stops that reading as *the lights went out* — the canopy
  sits between them, and the awnings and roofs went with them — richer than the pale version and most of
  it a hundred levels below where it started. The gap between the brightest grass and the darkest
  canopy is fifteen levels and it is the tightest join in the palette: close it and four hundred
  trees disappear into the field, open it and they come back as pale speckle. The people's pale shoulder highlight carries more of
  their read than it did, because a dark dot on deep grass has only a few dozen levels to work with.

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
- **The periodic multi-second stall was the measuring rig, not the scene.** Worth writing down
  because it was reported as an open performance problem for three rounds running. Rendering this
  scene off-screen in headless Chromium pauses for about a second and a half every twenty-odd
  frames. It survives `--disable-gpu` and `--disable-accelerated-2d-canvas` unchanged; it survives
  replacing all eight hundred of the frame's radial gradients with a single shared one; it happens
  with `t` **frozen**, so it is not the content at some particular moment; and a synthetic loop of
  seven hundred large translucent circles — no scene code involved at all — reproduces it exactly.
  It is the browser flushing deferred rasterisation for a canvas that is never presented, and the
  whole batch lands on whichever frame triggers the flush. There is nothing here to fix. The number
  that means anything is the median, which is **9–11ms** software-rasterised at 1280×800, and which
  did not move when the fires doubled, ninety people arrived and the bursts became pixel art.
- **Gradient caching was measured and rejected.** A full frame builds ~810 radial gradients, and
  since a lobe's gradient is always the unit circle, caching on the colour stops looked free. It is
  not: only **24%** of them repeat, because the lattice reads its grey at a continuous ramp position
  so almost every lobe has stops nobody else has. A quarter of the gradients is worth well under a
  millisecond, and buying it would cost `tests/fog.test.js` its independence — coverage is
  reconstructed from the recorded `addColorStop` alphas, and a cache hit records nothing.
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

- **People are down there setting fires and letting off fireworks** — `lights.js`, and the only
  colour in the animation. Against a ground that is a photo negative of an already de-saturated
  palette, under six greys of weather, anything at full chroma does not read as coloured pixels; it
  reads as the one thing in frame that is *lit* rather than merely visible.

  **Everything that burns is warm**, out of one five-step ramp: a warm white, a yellow, an orange and
  two reds. The fires were cyan and green for several rounds, on the theory that cold fires against
  hot fireworks would separate the two. It did separate them — and it also put the only cool hue in
  the animation on the one thing that is on screen continuously, so a soft blue-green disc sat in the
  cloud above every fire the whole time, which is not a fire, it is a bubble of light. Fires and
  fireworks stay distinct on **shape and duration** instead, which is a stronger distinction anyway:
  a three-second event that comes apart into branching chunks cannot be confused with a mass that has
  sat there guttering for two minutes.

  Both rules that shape the drawing come from the camera being **directly overhead**:

  *Nothing is radially symmetric.* A flame from above is a bright base with a plume of light lying
  downwind of it, not a disc — the first version was a symmetric glow with a ring and some rays
  around it, which is a lens flare, or a flying saucer, and looked like one. Every light leans now,
  and the flame body is rebuilt on a **held clock** twelve times a second rather than eased, because
  fire does not ease, it gutters.

  *Gravity points at the camera.* A firework's sparks cannot arc downward when "down" is away from
  you, so they spread, decelerate hard and cool in place while the wind carries the whole burst
  sideways. The climb is a chunk that brightens and grows rather than one that travels, for the same
  reason. Neither is how a firework looks from the ground and both are how one looks from above it.
  They go up in *shows* — three to five shells in a ragged sequence from one spot, then nothing there
  for a minute and a half — because people do not set off one firework.

  **A burst is branching pixel art.** Every limb is a run of chunks snapped to a coarse grid,
  stepping down the ramp from a warm-white head to a deep red tail, at full opacity with hard edges,
  and limbs **fork** — each generation shorter, kinked further off its parent and starting further
  down the ramp than the one it grew from. A plain radial star is the one arrangement that reads as
  *drawn* rather than as something that burst, and that is what this was.

  **No two are the same firework.** How many limbs leave the centre (twelve to forty-four), how many
  times they fork (nought to twice — nought is a willow, long limbs and no branching at all), how far
  a fork kicks off its parent, how far the limbs throw and how long they burn are all drawn from the
  shell's own seed. Fewer limbs throw further, so a sparse shell is a big one and a dense shell is a
  tight one, which is roughly how they are really built and stops the count reading as a density
  knob. The **launch sites move between shows** and the number of shells in a salvo varies with them.

  Every burst used to have identical topology, and the reason that was worth fixing is worth writing
  down: the hashes underneath it all *did* vary per shell, so no two were ever the same drawing — and
  yet every one was recognisably the same **object**, a thing of a certain size that comes apart a
  certain way. Randomising the seed harder could not have touched it, because what repeated was the
  structure and the structure was a constant. Nor could it have fixed three launch sites that never
  moved: once you have watched two rounds you know where to look, and no amount of variety inside a
  burst fixes a burst that always happens in the same place.

  A limb is a point, a direction and a length rather than an angle from the centre, because a branch
  does not start at the centre. Its chunks are laid from the tip backwards, spaced by a fraction of
  its own length — fixed spacing puts the tail of any limb shorter than two chunks behind its own
  root, where it gets culled, which would have deleted every branch in the burst.

  It is drawn twice: once under the whole depth of the cloud, and once over it at a third strength
  with **the cloud eating chunks**. Where the bank in front is thick a chunk is simply not drawn, on
  a hash of its own position so the pattern is stable rather than sparkling, reading the same density
  field the fog and the apparition read. That is what "fog over a firework" has to mean for something
  made of hard squares: you cannot half-hide a pixel, so you take some of them away. Softness is the
  default a canvas hands you for free and it is the wrong default here: a firework seen through
  weather is the one thing in this scene allowed a hard edge.

  Four decisions make that work, and three of them were mistakes first:

  - **The chunks composite normally, not additively.** This is the one that decides whether it looks
    like pixel art or like a lens flare. Additive is the natural mode for light and it is fatal here:
    an orange chunk over a yellow one over a red one sums past white, so the middle of every burst —
    where the sparks are densest and the eye goes first — came out as a flat white blob with a few
    coloured squares around the rim. Flat, opaque, unblended colour is what makes the ramp readable,
    and a readable ramp is the whole of "high contrast".
  - **Trail spacing is a fraction of how far out a spark is,** capped at a couple of grid squares. At
    a fixed spacing, a spark that has not yet travelled two chunks has its whole tail behind the
    centre of the burst where it gets culled — so the first half of every burst was a dense knot with
    no radiating in it at all.
  - **The hottest step is a warm white, there are two reds, and the head chunk is only half a square
    bigger than the tail.** A double-size white square is four times the area of the chunks behind it,
    so an evenly spaced ramp with one white in it comes out white.
  - **A spark dies by losing its tail and turning red, never by fading.** Life decides how many trail
    chunks a spark still has and how far its head has cooled, so a burst ends as a scatter of single
    red squares. A half-transparent chunk is not a pixel.

  It costs **five fills a shell** — one per ramp step, every chunk of that colour in a single path.
  The version this replaced gave each spark its own alpha and therefore its own `stroke()`, which was
  fifty-four rasteriser passes per colour per shell.

  Smoke is chunky clots dissolving on the ordered dither matrix from `effects/pixel.js` — the same
  `bayerOn` The Cloud comes apart on, so the two things in this scene that break into blocks break
  into the same blocks. Those *are* additive: they are glow rather than spark, and faint enough never
  to sum to white.

  **The fires catch, burn and die back.** Twelve of them rather than six, each on its own two-to-five
  minute cycle, so at any moment some are alight, one or two are just going up and one is out — the
  field is not a fixed constellation you learn after a minute. The catch is much faster than the
  die-back: somebody puts a light to it and it goes up in a couple of seconds, and it takes a minute
  to fall to embers. Symmetrical would read as a dimmer being turned. A fire's glare into the cloud
  is kept below a shell's, too: at full flare a campfire was throwing the largest brightest coloured
  mass in the frame, which puts the hierarchy the wrong way up. A fire is a steady thing you keep
  noticing; a firework is an event.

  **A flame is a tapering stack of rows** — widest at the base, narrowing as it goes, leaning a little
  further downwind with every row, hottest at the bottom and cooling to red at the tip.

  Its width and its sway come from **continuous noise read upward through the flame as well as
  through time**, so a bulge starts at the base and travels to the tip, which is what a flame does.
  That was a hash re-rolled per row on a held twelve-frame clock, which handed every row a new
  unrelated width eighty-odd times a second: not flicker, scintillation. The chunk grid quantises the
  result either way, so it is a pixel flame regardless — the difference is whether the pixels are
  *moving* or merely changing. The soft lobes underneath now gutter at seven frames a second rather
  than twelve, and the flicker's fast octave runs at half its old rate carrying a third of the weight;
  at 9 Hz it was a strobe, and twelve fires strobing out of phase is motion you notice before you
  notice the scene. Three to five fills each. It is drawn a second time over the
  fog with the cloud eating chunks, exactly as a burst is, because a fire seen through weather should
  come apart the way a firework does or the two stop looking like they are in the same air. Before
  this the fires were soft lobes with a scatter of dithered specks over them, and the specks were what
  you actually saw: three or four loose pixels with no shape at all, indistinguishable from the
  burnt-out tail of a firework. The lean is kept small — a flame that leans a full chunk per row is a
  flame lying on its side, and twelve of those read as streaks.

  A fire's light in the cloud is a **3:1 smear along the wind at a very low alpha, with dithered
  smoke above it** — not the soft round mass it was. Firelight genuinely does diffuse through
  cloud, so refusing it any softness at all does not remove the bubble; tried on its own, a tight
  dither is a tidy little pile of squares. What made the old one a bubble was that it was round,
  bright, blue-green and on screen continuously. Long, warm, faint and leaning is a different object,
  and the chunks in it give the plume the same grain as everything else that burns.

  **And the people.** They exist because everything else in the file implies them: something set those
  fires and something is lighting those shells, and an overhead view with no one in it says the town
  is abandoned and the fires are wild. Ninety-odd of them, clustered — a knot around each fire, a
  larger crowd back from each launch site — because scattered evenly they read as speckle. They mill
  about on their own slow noise, and a crowd with a shell in the air above it backs away from the
  launch spot, which costs one number per person and is the only reason they read as *doing*
  something rather than standing in a field. They are the one thing in the file that is an object
  rather than a light, so they composite normally, under everything additive.

  A person is a **head and a pair of shoulders**, which from directly above is all a person is. A
  shadow thrown away from the lean, a torso stroked from the feet up — short, and as wide as it is
  long, so it is a mass — then shoulders as two overlapping discs, then a head smaller than the
  shoulders, a highlight on it, and for a third of them a carried light. Six passes, six fills for the
  whole crowd, because every pass is one path and two discs side by side is the cheapest thing that
  reads as wider-than-deep without a transform. Before that it was a full-height stroke a pixel and a
  half wide with a ball on top, which is a matchstick — and the head being *smaller* than the
  shoulders is the detail that fixes it, the same mistake at a hundredth of the size that the angel
  took two goes to stop making.

  **They walk.** Each has a slow tilted circuit of their own patch, at their own rate and in their own
  direction — forty to eighty pixels across, five to ten seconds round — on top of the wander. That is
  the part that matters: noise alone jitters a mark about without ever committing to a direction,
  which is why the crowd read as vibrating rather than going anywhere. Because position is now a
  function of time it can be **sampled twice**, and the difference between the samples is a heading:
  shoulders run across the **walk** rather than across the camera's lean, so somebody walking
  north-east presents their shoulders at that angle from any corner of the frame, and the torch is out
  in front of whoever is carrying it rather than pinned to one corner of the screen. A pace rides on
  top — the body rises and falls, the shoulders rock, the head rocks against them — scaled by how fast
  they are actually going, so somebody who has stopped stands still instead of marching on the spot.

  And a crowd with a shell in the air above it backs away on a **smooth envelope** that rises as the
  shell climbs, peaks at the burst and drains off. That was a boolean: the instant a shell existed,
  every figure at that site jumped a fiftieth of the frame outward in one frame and jumped back when
  it died. Ninety people teleporting in unison twice a minute is not a reaction, it is a glitch that
  happens to be motivated.

  They lean on the same radial projection the buildings and the trees do, so a figure at the corner
  of the frame shows you its whole height and one in the middle shows you the top of its head. That
  is what turns a scatter of marks into people standing in a field — not detail, of which at four
  pixels there is no room for any, but the fact that they stand *up* and agree with everything around
  them about which way up is.

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

Three decisions carry it:

- **The figures are hand-drawn bitmaps, not procedural shapes,** on a 28×34 grid, as ASCII art in
  the source where they can be read and edited *as* art. Twenty-two columns across was not enough
  and no amount of care with a dozen cells fixed it — an angel and a reaper are both "a vertical
  mass with a lump on top" until there is room for a wing to be a wing.

  Resolution alone did not fix it either, which took two goes to learn. What separates a figure from
  a lump at this size is a **silhouette that changes width in a recognisable order** — halo, head,
  shoulders, wings, robe — and **one direction of light**, every figure lit down its left edge and
  shadowed down its right. A shape that widens smoothly from top to bottom is a bowling pin; a shape
  drawn in a single tone is a sticker. Both shipped here before that was written down. The angel now
  has an oval halo ring that reads as a ring rather than as a floating rectangle, a head clear of
  both the halo above it and the shoulders below, wings that meet those shoulders and sweep up and
  out with a feather break in them, and a robe with a lit side and a shadowed one. The reaper has a
  pointed cowl with a genuine hollow in it, shoulders wider than the hood, a hanging robe with fold
  lines and a ragged hem, and a crescent blade on a snath held clear of the body — always silhouetted
  against fog rather than against cloak, with an arm reaching out to grip it, which is what stops a
  scythe reading as a stray line beside him.

  Each figure carries its own two-colour ramp **and its own opacity**, because the two trade against
  each other. The reaper's ramp runs to a lighter stone than it did: the cowl has to sit far enough
  above the void inside it for the hood to *have* a hollow, and at the old spacing they were a few
  levels apart and he had a smooth head. Widening the ramp while dropping the opacity is not a wash —
  it buys back the contrast the extra transparency costs, so he sits deeper in the weather than
  before and reads better in it. What is not allowed is brightening him to fix the hollow, because a
  pale figure is a ghost.
- **The morph is a per-cell coin toss, not a cross-fade.** Each cell picks the old figure or the new
  one depending on whether its own hash has been passed by a sweeping threshold, so the angel is not
  dissolved into the reaper, it is *replaced* by it, cell by cell, in a scatter — and the cells
  nearest the threshold shove sideways while they change. That is what a decoder does when handed a
  keyframe it cannot fully apply.
- **It is veiled cell by cell, not as a whole.** The fog's density field is sampled across the
  figure's own grid and quantised into six bands, so parts of it are buried behind a bank while
  others come through, and the pattern crawls across it as the weather drifts. One opacity for the
  whole apparition is a decal turned down: uniformly faint, and still unmistakably lying *on* the
  picture rather than inside it. Sampled on every second cell in each direction — the field is smooth
  at that scale, so it is a quarter of the noise calls for a result nobody can tell apart.

  The band is taken from the **cube** of the density rather than from the density itself, and a cell
  can land on band zero and not be drawn at all. The field runs about 0.5 to 1 across the frame,
  which as a straight multiplier is a figure that is *evenly* half-lit — the whole thing dimmed and
  nothing actually buried. Raising it to a power pushes the thick end down toward nothing while
  barely touching the thin end, so the parts under a bank genuinely go and only the parts under a
  thin patch come through. That is the difference between "dimmer" and "behind something".

It is also drawn **early** — under the billows, the crests, the filaments and the dark strands, all
of which pass in front of it. Drawn late it was a sprite on the weather; drawn here it is a thing
happening some way down inside a bank of it. Seven masses drift across its face, dark ones as well
as pale: a figure only ever veiled by white haze reads as lit from in front, which is a spotlight,
not weather. Cloud in front and per-cell veiling from behind are two halves of one job, and either
alone leaves it looking stuck to the glass.

The cells are sorted into their (tonal step, veil band) buckets in **one pass** and drawn from
there, rather than the figure being walked once per bucket — which was fine at three steps and four
bands and is eighteen full scans at six. `tests/fog.test.js` asserts one apparition per cycle with
genuinely varying gaps, and that all four figures resolve, in order, one at a time — if a morph
window ever swallowed a figure whole, nothing else in the suite would notice.

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
  With more than one, **the gallery is a ring**: down from the oldest arrives back at the newest and
  up from the newest arrives at the oldest, so both chevrons are always live and no direction is ever
  a dead end you have to reverse out of. The index is wrapped rather than clamped, and it is wrapped
  as `((i % n) + n) % n` rather than `i % n`, because JavaScript's remainder keeps the sign of its
  left operand: `-1 % 3` is `-1`, so the naive version sends *up* from the first scene to
  `scenes[-1]` and renders a blank page. The wrap lives in `lib/gallery.js` as a pure function so it
  is tested as arithmetic rather than as a regular expression over `app.js`. Arriving by wrap is an
  arrival like any other, so it plays the **incoming** scene's own channel change — verified by
  driving the built page in a browser, not by reading the code.

And they are **invisible except once, on arrival**: a second or so after the page loads they fade
up, hold for a beat, and are then never seen again unless you reach for them. A control parked
permanently on top of the picture is chrome however soft it is, and the page's one rule is that the
animation *is* the page — but a control that resurfaces every ten seconds *forever*, which is what
this used to do, is worse in a different way. It is a blink you cannot help tracking, and once you
know the gallery is there you do not need reminding of it. Hover and keyboard focus cancel the
animation and bring the chevron straight back, which is what makes once enough. Under
`prefers-reduced-motion` they simply stay visible and still.

Two things about it are worth knowing, because both were wrong first. The `peek` animation has to
stay in the **same slot of the `animation-name` list** in every per-scene chrome override, because
the browser matches animations by position: move it and it restarts, and the chevrons flash again on
every scene change. And any override that restates `animation-duration` has to restate the peek's
duration too, for the same positional reason — one of them still carried the `10s` from when the
peek was a repeating cycle, which stretched a one-second introduction into four and a half. It was
on the vapour chrome, which is what the *first* scene wears, so the correct timing was the one
nobody ever saw. Both are asserted now, and the fix was found by sampling the computed opacity in a
real browser twice a second rather than by reading the stylesheet.

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
