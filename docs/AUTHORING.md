# Authoring an animation

An animation is a self-contained folder: `site/scenes/<id>/`, with `index.js` as its entry point,
drawing into a 2D canvas context. No build step, no dependencies, no assets.

The folder is the unit, not the file. A scene that grows past a few hundred lines should split —
*Above the Fog* is `index.js` + `town.js` + `fog.js` — and the folder name **is** the scene id, which
is what lets the tests scan the directory and fail on anything unregistered.

Code two scenes would share does not live in either of them:

- **`site/lib/`** — the engine. The stage, the seeded RNG, the small canvas helpers. It knows
  nothing about any particular look.
- **`site/effects/`** — shared animation code, and nothing but looks: the VHS tape artefacts
  (`vhs.js`), wet-paint ribbons (`paint.js`), the 16-bit grid and its ordered dither (`pixel.js`),
  noise and flow fields (`field.js`), soft volumetric lobes (`volume.js`).

**No scene may import another scene**, and a test enforces it. If two scenes want the same thing,
it belongs in `effects/`.

## The contract

```js
export const meta = {
  id: 'floating-bed',        // kebab-case; must equal the folder name
  title: 'Asleep Among the Stars',
  prompt: '…the description this animation came from…',
  created: '2026-08-07',     // YYYY-MM-DD
  background: '#04050d',     // page colour behind the canvas (optional)
  posterTime: 7.4,           // the moment to freeze on for reduced motion (optional)
  chrome: 'neon',            // which nav chevron the scene wears
  transition: 'tape',        // the channel change *into* this scene
  maxDpr: 2,                 // cap the render scale; lo-fi scenes want 1 (optional)
};

export function create({ width, height, seed }) {
  // Build the scene's state once — star positions, particles, anything random.
  return {
    resize(width, height) {},        // optional
    draw(ctx, t, dt) {},             // t and dt are in seconds
  };
}
```

`create()` runs once per mount; `draw()` runs every frame. Sizes arrive in **CSS pixels** — the
stage has already applied the device pixel ratio, so draw as if the display were 1×.

Then register it in `site/scenes/index.js` — **at the front**, because the gallery runs newest to
oldest and the front-end depends on that order:

```js
import * as myScene from './my-scene/index.js';
export const scenes = [myScene, aboveTheFog, grizzlyPeak, floatingBed];
```

**A new animation brings its own chrome and its own channel change.** `meta.chrome` picks which nav
chevron is shown (a glyph in `index.html`, a rule in `styles.css`); `meta.transition` picks how the
gallery *arrives* at the scene (a case in `site/effects/transitions.js`). Build the change out of
your scene's own primitives, and note that it wears the scene being **arrived at** rather than the
one being left — the transition's job is to introduce the next animation. Both are checked:
`tests/scenes.test.js` fails on a scene that declares neither or names one nobody implements, and
the silent default is the VHS tape change, which belongs to one animation and is wrong for the rest.

A new animation is also the moment to cut a **MAJOR** version — *always* that, and *only* that. In
this repo the bump means one thing: the previous animation is finished and this one has begun. Every
new animation earns one, however small it is; nothing else earns one, however large it is.
`.claude/CLAUDE.md` keeps the ledger of which version finished which animation; add a row when you
cut one.

You get the channel change between scenes for free — it lives in the stage and works on rendered
pixels, so it never needs anything from the scene.

## Several compositions of one animation

An animation may hold more than one **composition** of itself — the same artwork, arranged a
different way. A tap on the picture (or `←` / `→`) walks them, so the gallery has two axes and both
are rings. Declare them in `meta.variants`, and take one in `create()`:

```js
export const meta = {
  …,
  // Index 0 is what the gallery opens on, and what a bare `#<id>` link resolves to. Keeping the
  // existing composition there is what makes adding one a pure addition.
  variants: [
    { id: 'over-the-bay',  title: 'Over the Bay',  road: { vp: { x: 0.28, y: 0.4 }, cliff: true } },
    { id: 'into-the-dark', title: 'Into the Dark', road: { vp: { x: 0.3,  y: 0.7 }, cliff: false } },
  ],
};

export function create({ width, height, seed, variant = meta.variants[0] }) {
  const road = makeRoad(variant.road);   // …and every draw function takes `road` as a parameter
}
```

Past `id` and `title` a variant is **your** vocabulary — the shell reads those two and forwards the
whole block to `create()` without looking inside it. Three rules make this work:

1. **A composition is data, not a branch.** Turn the block into numbers at build time and hand those
   to the drawing code. A test fails on `variant.id === …` or `switch (variant)` in a scene: the
   moment a scene asks which arrangement it is, the two stop being one implementation and become two
   that share a file, where every change has to be made twice and nothing says when you missed one.
2. **Index 0 is the default**, so `create()` without a variant draws it, every link already shared
   still resolves to the picture it did before, and the test suite's scene-shaped callers keep working.
3. **They must actually differ.** `tests/scenes.test.js` fingerprints each composition and fails if
   two draw the same picture — a variant block that is read but never acted on fails nothing else,
   and the tap simply appears broken.

The render tests run over every composition at every viewport, so a second arrangement doubles that
scene's share of the suite. That is the intended cost: an arrangement nobody looks at is the one that
rots.

## The three rules

1. **Nothing but the 2D context.** No `document`, no `window`, no images, no fonts you can't
   fall back from. That's what lets the whole gallery render headlessly in CI.
2. **No `Math.random()`, no `Date.now()`.** Use the `seed` you're handed and `createRng()` from
   `lib/rng.js`. `t` is your only clock. The render tests draw each scene twice and compare — a
   scene that isn't reproducible fails.
3. **Balance `save()`/`restore()`.** A leaked `save()` corrupts every frame after it, and the
   tests fail on it.

## Composing at any size

Scenes get whatever viewport the visitor has — a phone in portrait, an ultrawide monitor.

- **Backgrounds** are drawn in screen space, using normalised (0–1) coordinates scaled by
  `width`/`height`, so they fill any shape of window.
- **The subject** is drawn around its own origin in fixed design units, and placed with one
  transform. How you pick the scale decides how the composition feels:

  ```js
  // Fill the frame: the subject is as large as it can be without cropping.
  const scale = fitContain(width, height, DESIGN_WIDTH, DESIGN_HEIGHT);

  // Or hold a size against the short edge, so the subject gets *smaller* in frame as the window
  // grows. This is what `floating-bed.js` does — the bigger your monitor, the more lost it looks.
  const scale = Math.min(width, height) * BED_SCALE;

  ctx.save();
  ctx.translate(width * 0.34, height * 0.37);   // off-centre; negative space is a choice
  ctx.scale(scale, scale);
  // …draw around the origin…
  ctx.restore();
  ```

## One light source

Put the key light in a single constant and light everything from it — edges, gradients, which
side of a face falls into shadow. `floating-bed.js` keeps a distant sun in `KEY_STAR` and derives
the planet's lit limb, the duvet's rim, and the sleeper's face from that one position. Scenes fall
apart the moment two elements disagree about where the light is, and it's very hard to see why.

Rim light that runs at even brightness along a whole silhouette reads as neon piping. Give it a
gradient that falls off as the surface turns away, and it reads as a surface.

## Motion that reads as alive

Layer slow sine waves at *different, non-harmonic* periods (8.4s, 13.1s, 17.3s) instead of one
fast one. The result never visibly repeats and never looks mechanical. `wave(t, period, phase)`
in `lib/draw.js` is that in friendlier units.

## Tape, if you want it

`lib/vhs.js` provides `shred`, `tearBands`, `smearStreaks`, `dropoutBars`, `chromaSplit`,
`hexDither`, `saturate`, `contrastPunch`, `scanlines` and `grain`. Apply them last, after the
vignette, so the tape sits over everything including the subject.

**Pass the tape.** Every helper that samples the frame takes an optional last argument — the
scratch buffer the stage hands you in `create({ tape })`. Forward it. Without it they fall back to
sampling the destination canvas, which is correct but forces a flush per call: measured at
2880×1800, 78 slices cost **948ms** self-sampled and **4.2ms** from the buffer.

Three things learned the hard way:

- **Colour bleed must span the whole band.** Fade it out near the edges and the colour collects
  into two thin lines, and the picture ends up ruled with neon instead of softly smeared.
- **Skip a band until it has fully entered the frame.** A band half off screen squeezes its whole
  gradient into a few pixels, which is the same bright-line problem by another route.
- **Displacement wants an uneven distribution.** Jitter every line by a similar amount and it
  reads as static; square the noise so most lines barely move and a few go a long way, and it
  reads as a tape fault.

## Making it fast enough

A full-screen effects pipeline is fill-rate bound, so the levers are area and pass count:

- `meta.maxDpr` caps the render scale for your scene. A deliberately lo-fi scene has no use for
  retina pixels — `floating-bed` renders at `1` and looks better for the softness.
- The stage drops resolution further on its own if frames get slow, and restores it when they
  don't. You don't have to do anything for that, but don't fight it by reading canvas dimensions.
- **Batch fills.** Group by colour and quantise alpha into a few steps, then issue one `fill()`
  for many shapes. ~900 individually filled stars became a few dozen fills with no visible change.
- Watch anything that fills a circle bigger than the screen — a few large radial gradients can
  cost more than everything else together.

## Checking your work

```sh
npm test          # registry, headless render, determinism, site integrity
npm run serve     # http://localhost:4173
```

The render tests draw every scene at three viewports and eight timestamps, and fail on NaN
geometry, colours built from `undefined`, out-of-range alpha, unbalanced `save()`/`restore()`,
and non-determinism. If they pass, the scene will not blow up in a browser.
