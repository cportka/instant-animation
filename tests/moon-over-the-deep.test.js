// Moon Over the Deep — the things in it that can go wrong without anything failing.
//
// Every property checked here is one the picture depends on and no ordinary render test can see.
// The scene draws fine, deterministically, at every viewport, with all of them broken: the sea
// still renders when it is racing, the moon still renders when it is ringed with loose specks, the
// glow still renders when it has crossed the horizon, and the fast path still renders when it has
// drifted away from the definition it is supposed to be an optimisation of. They are all
// *agreements* — between a function and its faster twin, between a plan and the pace it implies,
// between an object and the region it is allowed to draw in — and agreements rot silently.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../site/lib/rng.js';
import { createRecordingContext } from './helpers/recording-context.mjs';
import { pixelFor, waterlineAt } from '../site/scenes/moon-over-the-deep/layout.js';
import { marchRow, planWater, surfaceAt } from '../site/scenes/moon-over-the-deep/water.js';
import { GLARE_REACH, drawMoon, glareAt, moonAt, planMoon } from '../site/scenes/moon-over-the-deep/moon.js';
import { MIX_CAP, deepAt, glowAt, mixAt, planDeep } from '../site/scenes/moon-over-the-deep/deep.js';
import { planSky } from '../site/scenes/moon-over-the-deep/sky.js';
import { planIsland } from '../site/scenes/moon-over-the-deep/island.js';

/**
 * The scene's own plans.
 *
 * Drawn in the order `create()` draws them, and **every one of them**, including the island nobody
 * here asks a question about: they share one seeded stream, so skipping a planner or standing in a
 * single `next()` for it shifts every plan after it and the tests below start checking a sea that
 * the gallery never renders.
 */
function plans() {
  const rng = createRng('moon-over-the-deep');
  return {
    sky: planSky(rng),
    moon: planMoon(rng),
    island: planIsland(rng),
    water: planWater(rng),
    deep: planDeep(rng),
  };
}

const VIEWPORTS = [[1440, 900], [1920, 1080], [390, 844], [1024, 768], [800, 1280]];

test('the marched swell is the swell', () => {
  // `drawWater` does not evaluate `surfaceAt`; it advances a sine and a cosine by angle addition
  // along each row, which is six transcendentals a chunk cheaper and is only correct while it is
  // *exactly* the same function. Nothing about the picture says which one is being drawn.
  const { water } = plans();
  const W = 1440;
  const px = 5;
  const cols = Math.ceil(W / px);
  const out = new Float64Array(cols * 2);

  for (const t of [0, 3.25, 41.5, 300.5]) {
    for (const d of [0.02, 0.31, 0.5, 0.87, 1]) {
      marchRow(water, t, d, W, px, out);
      for (let col = 0; col < cols; col += 8) {
        const want = surfaceAt(water, t, (col * px) / W, d);
        assert.ok(Math.abs(out[col * 2] - want.h) < 1e-9,
          `t=${t} d=${d} col=${col}: marched height ${out[col * 2]} but the definition says ${want.h}`);
        assert.ok(Math.abs(out[col * 2 + 1] - want.slope) < 1e-9,
          `t=${t} d=${d} col=${col}: marched slope ${out[col * 2 + 1]} but the definition says ${want.slope}`);
      }
    }
  }
});

test('the swell rolls, and rolling is a pace', () => {
  // "The water below gently rolls." What reads as speed is the *shortest* swell — the eye takes the
  // fastest thing in a picture as the picture's tempo — so it is the short one that has to be slow
  // enough, and the long one that has to be slow enough to be a roller rather than a ripple.
  const { water } = plans();
  let fastest = 0;
  for (const s of water.swells) {
    // Radians a second, so the crest-to-crest period is 2π over it.
    const period = (Math.PI * 2) / (s.speed * s.k);
    assert.ok(period > 0.85,
      `a swell repeats every ${period.toFixed(2)}s, which is a chop and not a roll`);
    fastest = Math.max(fastest, s.speed * s.k);
  }
  const longest = (Math.PI * 2) / Math.min(...water.swells.map((s) => s.speed * s.k));
  assert.ok(longest > 8, `the biggest roller breathes every ${longest.toFixed(1)}s, which is too brisk to watch`);
  assert.ok(fastest > 0, 'a swell that does not move is not a swell');
});

test('the moon draws inside its own circle and nowhere else', () => {
  // The air around the moon was once drawn *by* the moon: a scatter of pale chunks on a hashed
  // threshold, ringing the disc. Hash noise has no structure, so it came out as loose specks at
  // random radii — dust on the lens — and it ate the silhouette on the way. The glare belongs to
  // the sky now (see `glareAt`), and this is the guard that keeps it there: everything this pass
  // emits is on the disc, so there is nothing it can scatter.
  const { moon } = plans();
  for (const [W, H] of VIEWPORTS) {
    const px = pixelFor(Math.min(W, H));
    const disc = moonAt(W, H, moon);
    const rec = createRecordingContext({ width: W, height: H });
    drawMoon(rec.ctx, W, H, 12, moon, px);
    rec.assertClean(`${W}x${H} moon`);
    let rects = 0;
    for (const op of rec.ops) {
      const m = /^rect\(([-\d.]+),([-\d.]+),/.exec(op);
      if (!m) continue;
      rects += 1;
      // The disc snaps its centre to the grid, so a chunk of slack on the radius is the snapping
      // and not a stray.
      const far = Math.hypot(Number(m[1]) - disc.cx, Number(m[2]) - disc.cy);
      assert.ok(far < disc.r + px * 2,
        `${W}x${H}: a chunk at ${far.toFixed(0)}px is outside a moon of radius ${disc.r.toFixed(0)}px`);
    }
    assert.ok(rects > 200, `${W}x${H}: only ${rects} chunks — that is not a moon`);
  }
});

test('the glare is a field, not a scatter', () => {
  // What replaced the halo has to be something dither can resolve: continuous, monotone, and
  // finished by the time it reaches the edge of its own reach. A field with any of those missing
  // is a shape, and a shape around a light is the artefact this scene got rid of.
  const moon = { cx: 400, cy: 200, r: 100 };
  let last = Infinity;
  for (let d = 0; d <= GLARE_REACH + 0.4; d += 0.02) {
    const here = glareAt(moon, moon.cx + d * moon.r, moon.cy);
    assert.ok(here <= last + 1e-12, `the glare brightens again at ${d.toFixed(2)} radii`);
    assert.ok(here >= 0 && here <= 1, `the glare is ${here} at ${d.toFixed(2)} radii`);
    last = here;
  }
  assert.equal(glareAt(moon, moon.cx, moon.cy), 1, 'the air over the disc is the brightest air there is');
  assert.equal(glareAt(moon, moon.cx + GLARE_REACH * moon.r, moon.cy), 0, 'the glare has to end');
  assert.equal(glareAt(moon, moon.cx + 40 * moon.r, moon.cy), 0, 'and stay ended');
});

test('the glow stays under the water', () => {
  // Distance out to sea is depth: the far water is a thin band, so anything showing through it
  // would be *at* the surface and the whole illusion goes. The bloom is now most of the width of
  // the bay, which is exactly the size at which a constant that happened to work at one aspect
  // ratio stops working at another — so it is checked at five of them, over forty rounds.
  const { deep } = plans();
  for (const [W, H] of VIEWPORTS) {
    const horizon = waterlineAt(H, pixelFor(Math.min(W, H)));
    for (let t = 0; t < 40 * 51; t += 3.7) {
      const it = deepAt(W, H, t, deep, horizon);
      if (it === null) continue;
      assert.ok(it.y - it.ry > horizon,
        `${W}x${H} t=${t.toFixed(1)}: the glow reaches ${(it.y - it.ry).toFixed(0)}px, above the waterline at ${horizon}px`);
      assert.ok(it.amp >= 0 && it.amp <= 1, `${W}x${H} t=${t.toFixed(1)}: amplitude ${it.amp}`);
    }
  }
});

test('the water is never wholly replaced by the glow', () => {
  // The mix is the whole of why it reads as something *under* the surface. Water you can still see
  // is what puts the light beneath it; the moment any region goes fully green it stops being water
  // with something below and becomes a green thing floating on top — and, being a region rather
  // than a scattering, it acquires an edge, which is the other half of the same failure.
  const { deep } = plans();
  const horizon = waterlineAt(900, 5);
  assert.ok(MIX_CAP < 0.75, 'a cap this high is not a mix, it is a fill');
  let sawSome = false;
  for (let t = 0; t < 8 * 51; t += 0.9) {
    const it = deepAt(1440, 900, t, deep, horizon);
    if (it === null) continue;
    for (let a = 0; a < 24; a += 1) {
      // Straight through the middle, which is where the coverage is highest.
      const x = it.x + ((a / 23) * 2 - 1) * it.rx * 0.999;
      const mix = mixAt(glowAt(it, x, it.y));
      assert.ok(mix >= 0 && mix <= MIX_CAP, `t=${t.toFixed(1)}: coverage ${mix} at the heart`);
      if (mix > 0.05) sawSome = true;
    }
  }
  assert.ok(sawSome, 'the glow never got strong enough to see, which is the opposite failure');
});

test('the star field is a population and not a texture', () => {
  // Brightness alone gives you a field of dots at different weights, which the eye reads as one
  // object drawn with more or less ink. These three are the axes that make it a *population*, and
  // each of them is a proportion rather than a switch — so each of them can drift.
  const { sky } = plans();
  const stars = sky.stars;
  assert.ok(stars.length > 400, `${stars.length} stars is a sparse sky`);

  const warm = stars.filter((s) => s.warm > 0.8).length / stars.length;
  assert.ok(warm > 0.13 && warm < 0.28, `${(warm * 100).toFixed(0)}% amber — either invisible or a Christmas card`);

  // The spikes. A dozen is a night sky; sixty is a greetings card. They are gated on the star's own
  // magnitude rather than on the level it happens to be drawn at, because the level moves with the
  // twinkle and a threshold on it makes the arms flick in and out.
  const spiked = stars.filter((s) => s.mag > 0.93).length;
  assert.ok(spiked >= 4 && spiked <= 26, `${spiked} stars carry spikes, which is not "the few you would name"`);

  // ...and something like half of them are barely there, which is what buys the depth.
  const faint = stars.filter((s) => s.mag < 0.1).length / stars.length;
  assert.ok(faint > 0.4, `only ${(faint * 100).toFixed(0)}% of the field is faint — that is graph paper`);
  assert.ok(Math.max(...stars.map((s) => s.mag)) > 0.9, 'nothing in the sky is actually bright');
});
