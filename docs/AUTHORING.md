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

Then register it in `site/scenes/index.js`:

```js
import * as myScene from './my-scene.js';
export const scenes = [floatingBed, myScene];
```

## The three rules

1. **Nothing but the 2D context.** No `document`, no `window`, no images, no fonts you can't
   fall back from. That's what lets the whole gallery render headlessly in CI.
2. **No `Math.random()`, no `Date.now()`.** Use the `seed` you're handed and `createRng()` from
   `lib/rng.js`. `t` is your only clock. The render tests draw each scene twice and compare — a
   scene that isn't reproducible fails.
3. **Balance `save()`/`restore()`.** A leaked `save()` corrupts every frame after it, and the
   tests fail on it.

## Composing at any size

Scenes get whatever viewport the visitor has — a phone in portrait, an ultrawide monitor. The
pattern used by `floating-bed.js`:

- **Backgrounds** are drawn in screen space, using normalised (0–1) coordinates scaled by
  `width`/`height`, so they fill any shape of window.
- **The subject** is composed against a fixed design box and scaled with `fitContain()`, so its
  proportions never distort:

  ```js
  const scale = fitContain(width, height, DESIGN_WIDTH, DESIGN_HEIGHT);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  // …draw around the origin…
  ctx.restore();
  ```

## Motion that reads as alive

Layer slow sine waves at *different, non-harmonic* periods (8.4s, 13.1s, 17.3s) instead of one
fast one. The result never visibly repeats and never looks mechanical. `wave(t, period, phase)`
in `lib/draw.js` is that in friendlier units.

## Checking your work

```sh
npm test          # registry, headless render, determinism, site integrity
npm run serve     # http://localhost:4173
```

The render tests draw every scene at three viewports and eight timestamps, and fail on NaN
geometry, colours built from `undefined`, out-of-range alpha, unbalanced `save()`/`restore()`,
and non-determinism. If they pass, the scene will not blow up in a browser.
