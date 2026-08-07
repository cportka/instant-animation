# Authoring an animation

An animation is one file: a self-contained ES module in `site/scenes/` that draws itself into a 2D
canvas context. No build step, no dependencies, no assets.

## The contract

```js
export const meta = {
  id: 'floating-bed',        // kebab-case; must equal the filename
  title: 'Asleep Among the Stars',
  prompt: '…the description this animation came from…',
  created: '2026-08-07',     // YYYY-MM-DD
  background: '#04050d',     // page colour behind the canvas (optional)
  posterTime: 7.4,           // the moment to freeze on for reduced motion (optional)
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
import * as myScene from './my-scene.js';
export const scenes = [myScene, floatingBed];
```

A new animation is also the moment to cut a **MAJOR** version: in this repo that bump means the
previous animation is finished. See `.claude/CLAUDE.md`.

You get the channel change between scenes for free — it lives in the stage and works on rendered
pixels, so it never needs anything from the scene.

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

`lib/vhs.js` provides `tearBands`, `scanlines`, `chromaSplit` and `grain`. They work by sampling
the canvas's own bitmap — `ctx.drawImage(ctx.canvas, …)` — so the displacement is real without a
second canvas or any DOM. Two things learned the hard way:

- **Colour bleed must span the whole band.** Fade it out near the edges and the colour collects
  into two thin lines, and the picture ends up ruled with neon instead of softly smeared.
- **Skip a band until it has fully entered the frame.** A band half off screen squeezes its whole
  gradient into a few pixels, which is the same bright-line problem by another route.

Apply them last, after the vignette, so the tape sits over everything including the subject.

## Checking your work

```sh
npm test          # registry, headless render, determinism, site integrity
npm run serve     # http://localhost:4173
```

The render tests draw every scene at three viewports and eight timestamps, and fail on NaN
geometry, colours built from `undefined`, out-of-range alpha, unbalanced `save()`/`restore()`,
and non-determinism. If they pass, the scene will not blow up in a browser.
