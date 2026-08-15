// The moon.
//
// It is a disc, which is the easy part, and it is a **sphere**, which is the whole job. A flat white
// circle in a night sky reads as a hole in the picture — a shape the same colour as nothing — and no
// amount of detail inside it fixes that, because what is missing is not detail, it is *curvature*.
//
// Curvature is one term: brightness falls with distance from the centre. On a seven-step ramp that
// gives you four visible rings and a disc that looks like a target. On a six-step ramp resolved by
// dither it gives a limb that turns away from you continuously, and that is the entire difference
// between this scene's palette and the last one's, spent on the one object that most needs it.
//
// It is full, so it is lit dead-on and there is no terminator. What stops a full moon being a plain
// bright disc is the **maria** — the dark plains, a step or two down, in blobs that are not centred
// and not symmetrical. Three of them, hashed into place once, and they are the only thing that makes
// the disc read as a specific object rather than as a light.

import { hash2, noise2 } from '../../effects/field.js';
import { clamp, rgba } from '../../lib/draw.js';
import { shadeAt } from './layout.js';
import { MOON } from './palette.js';

export function planMoon(rng) {
  return {
    // High and off to one side. Centred, it is a target; off-centre, the empty sky beside it becomes
    // part of the composition instead of margin.
    at: rng.range(0.3, 0.4),
    high: rng.range(0.16, 0.22),
    seed: rng.range(0, 60),
    maria: Array.from({ length: 3 }, () => ({
      dx: rng.range(-0.42, 0.42),
      dy: rng.range(-0.45, 0.3),
      r: rng.range(0.2, 0.38),
      depth: rng.range(0.7, 1.5),
    })),
  };
}

/** Where the moon is and how big, which the water needs to know to reflect it. */
export function moonAt(W, H, plan) {
  return {
    cx: plan.at * W,
    cy: plan.high * H,
    r: Math.min(W, H) * 0.115,
  };
}

export function drawMoon(ctx, W, H, t, plan, px) {
  const disc = moonAt(W, H, plan);
  // Snapped once, here rather than per rectangle. Everything below is `centre + col * px`, so with
  // the centre on the grid every chunk is too and none of them needs rounding on the way out.
  const cx = Math.round(disc.cx / px) * px;
  const cy = Math.round(disc.cy / px) * px;
  const { r } = disc;
  const bucket = MOON.map(() => []);
  const cols = Math.ceil(r / px) + 1;

  for (let row = -cols; row <= cols; row += 1) {
    for (let col = -cols; col <= cols; col += 1) {
      const x = col * px;
      const y = row * px;
      const d = Math.hypot(x, y) / r;
      if (d > 1) continue;
      // The limb. `1 - d²` is the cosine of the angle the surface is turned through, which is what
      // makes this a sphere and not a disc — and the exponent decides how sharply it rolls off at
      // the edge. Low and the moon is a flat coin with a dark rim; high and it is a glowing ball.
      const curve = (1 - d * d) ** 0.42;
      let level = (1 - curve) * 3.4;
      // The maria, and one soft field of mottling under everything so the plains have a coast rather
      // than a circumference.
      for (const m of plan.maria) {
        const md = Math.hypot(x / r - m.dx, y / r - m.dy) / m.r;
        if (md < 1) level += (1 - md * md) * m.depth;
      }
      level += noise2(x / (r * 0.22) + plan.seed, y / (r * 0.22)) * 0.55;
      // ...and the very edge always goes to the bottom of the ramp, so the silhouette is a clean
      // circle however the mottling fell. A moon with a ragged outline is a moon with weather.
      level += clamp((d - 0.86) / 0.14, 0, 1) * 2.2;
      bucket[shadeAt(level, col + cols, row + cols, MOON.length)].push(cx + x, cy + y);
    }
  }

  for (let step = 0; step < MOON.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(MOON[step], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) ctx.rect(cells[i], cells[i + 1], px, px);
    ctx.fill();
  }

  drawHalo(ctx, cx, cy, r, plan, px);
}

/**
 * The air around it.
 *
 * Not a glow — there is no soft edge anywhere in this scene and there is not going to be one here.
 * It is a ring of chunks at the sky's own brightest step, thinning outward on a hashed threshold, so
 * what surrounds the moon is *sky that has been lifted a little* rather than a light with a gradient
 * on it. Two chunks of it, and it is the difference between a moon in a sky and a moon on a sky.
 */
function drawHalo(ctx, cx, cy, r, plan, px) {
  // Tight, and it has to be. Spread wide with a shallow falloff it was a cloud of loose specks a
  // third of the moon's radius out — which does not read as air being lit, it reads as dust on the
  // lens. A ring that is dense against the disc and gone within a fifth of a radius is the one that
  // reads as glare.
  const reach = 1.22;
  const out = Math.ceil((r * reach) / px);
  ctx.fillStyle = rgba(MOON[5], 1);
  ctx.beginPath();
  for (let row = -out; row <= out; row += 1) {
    for (let col = -out; col <= out; col += 1) {
      const d = Math.hypot(col * px, row * px) / r;
      if (d <= 1 || d > reach) continue;
      const near = (reach - d) / (reach - 1);
      if (hash2(col * 1.7 + plan.seed, row * 2.3) > near ** 1.8) continue;
      ctx.rect(cx + col * px, cy + row * px, px, px);
    }
  }
  ctx.fill();
}
