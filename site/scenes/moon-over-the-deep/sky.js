// The night, and the stars in it.
//
// The sky is the largest surface in the frame and the one with the least happening on it, which is a
// composition problem before it is a drawing problem: a big empty area either reads as *air* or it
// reads as a flat fill somebody forgot to finish. What makes it air is that it is never one value —
// it falls continuously from almost-black overhead to a bruised blue at the waterline, resolved by
// dither, so the eye can find depth in it without ever finding a band.
//
// It is drawn on a coarser grid than the water: three chunks to one. That began as economics — the
// sky is two thirds of the pixels and none of the interest — and stayed because a coarser chunk
// reads as further away, so the water comes forward without anything being drawn in front of it.

import { hash2 } from '../../effects/field.js';
import { clamp, rgba, wrap01 } from '../../lib/draw.js';
import { snap } from '../../effects/pixel.js';
import { HORIZON, backPixel, shadeAt, waterlineAt } from './layout.js';
import { GLARE, MOON, NIGHT, STAR_COLD, STAR_WARM } from './palette.js';
import { GLARE_LIFT, GLARE_REACH, glareAt } from './moon.js';

/**
 * Where the stars are, and which of them are worth looking at twice.
 *
 * A field of identical dots is graph paper, and the way out of that is not *more* dots — it is dots
 * that differ along more than one axis at once. There are four here, and each one is a thing you can
 * point at in a real sky:
 *
 * - **magnitude**, raised to a high power on the way in, so most come out barely there, a few are
 *   obvious, and three or four are the ones that give the field a shape you can remember;
 * - **colour**, cold for four fifths of them and amber for the rest, which is the axis that turns a
 *   texture into a population of individual objects;
 * - **scintillation**, which is *stronger the fainter the star* — that is not a stylistic choice,
 *   it is what the atmosphere does, and it means the dim ones shimmer while the bright ones hold;
 * - **rate**, all different, because a field that twinkles on one clock is a string of fairy lights.
 */
export function planSky(rng) {
  return {
    // Nearly three times what this began with. The count is what buys *depth* — a sky where the
    // faintest layer is only just resolvable reads as having more behind it, and the eye stops
    // counting and starts looking.
    stars: Array.from({ length: 520 }, () => ({
      at: rng.next(),
      // Squared toward the top, because stars near the horizon are the ones a hazy sea eats first.
      high: rng.next() ** 0.7,
      mag: rng.next() ** 3.2,
      warm: rng.next(),
      rate: rng.range(0.8, 3.2),
      phase: rng.range(0, 10),
    })),
  };
}

export function drawSky(ctx, W, H, t, plan, px, moon) {
  const bpx = backPixel(px);
  const skyBottom = waterlineAt(H, px);
  // `ceil`, so the sky always reaches the waterline and may overhang it by up to one coarse chunk.
  // The sea is drawn afterwards and covers the overhang; the alternative rounds short and leaves a
  // stripe of page background along the horizon.
  const rows = Math.max(1, Math.ceil(skyBottom / bpx));
  const cols = Math.max(1, Math.ceil(W / bpx));
  const bucket = GLARE.map(() => []);

  // The glare only touches a few moons' worth of sky, so the columns it can reach are worked out per
  // row rather than every chunk being asked and told no.
  const reach = moon.r * GLARE_REACH;
  // Runs, exactly as the water does them — and the sky is the surface that benefits most. Away from
  // the moon the level is *constant along a row*, so the Bayer matrix repeats every four columns and
  // there are only ever four distinct answers; whole rows come out as one rectangle whenever the
  // dither happens to land the same way on all four. Ninety-six chunks a row became a handful.
  let runStep = -1;
  let runX = 0;

  for (let row = 0; row < rows; row += 1) {
    const y = row * bpx;
    const down = row / rows;
    // Steep near the horizon and flat overhead — the last tenth of the sky does half the climb,
    // which is what air does and is also what keeps the top of the frame properly black.
    const night = (NIGHT.length - 1) * down ** 2.4;
    const dy = y + bpx / 2 - moon.cy;
    const half = Math.abs(dy) < reach ? Math.sqrt(reach * reach - dy * dy) : -1;
    const from = half < 0 ? 0 : Math.max(0, Math.ceil((moon.cx - half - bpx / 2) / bpx));
    const to = half < 0 ? -1 : Math.min(cols - 1, Math.floor((moon.cx + half - bpx / 2) / bpx));
    for (let col = 0; col < cols; col += 1) {
      const x = col * bpx;
      // ...and the moon lights the air it is hanging in. Asked here rather than drawn by the moon,
      // so the glare is literally sky at a higher level: same chunks, same ramp, same dither, no
      // edge anywhere for the eye to catch on. See `glareAt`.
      const level = col < from || col > to
        ? night
        : night + glareAt(moon, x + bpx / 2, y + bpx / 2) * GLARE_LIFT;
      const step = shadeAt(level, col, row, GLARE.length);
      if (step === runStep) continue;
      if (runStep >= 0) bucket[runStep].push(runX, y, x - runX);
      runStep = step;
      runX = x;
    }
    if (runStep >= 0) bucket[runStep].push(runX, y, cols * bpx - runX);
    runStep = -1;
  }

  for (let step = 0; step < GLARE.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(GLARE[step], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 3) ctx.rect(cells[i], cells[i + 1], cells[i + 2], bpx);
    ctx.fill();
  }

  drawStars(ctx, W, H, t, plan, px, skyBottom, moon);
}

/**
 * Stars, on the **fine** grid rather than the sky's.
 *
 * The one thing in the sky that is not the sky. A star drawn three chunks wide is a square; drawn at
 * the water's resolution it is a point of light, and the difference between those two is the whole
 * reason the grid was split. It costs one extra pass over a few hundred cells.
 *
 * Three things beyond brightness are decided here, and each one is the sky doing something to the
 * star rather than the star doing something on its own: **extinction**, which is the mile of air a
 * low star is seen through and is why the field thins toward the horizon instead of stopping at a
 * line; the **moon's wash**, which is why the sky beside a full moon is empty; and the **spike** on
 * the brightest few, which is the eye's own optics and is what makes something read as a star rather
 * than as a bright dot.
 */
function drawStars(ctx, W, H, t, plan, px, skyBottom, moon) {
  const steps = STAR_COLD.length;
  const cold = STAR_COLD.map(() => []);
  const warm = STAR_WARM.map(() => []);
  for (const star of plan.stars) {
    const y = Math.round((star.high * skyBottom * 0.94) / px) * px;
    // Nothing in the last stripe above the water: the horizon is where a real sky goes empty, and
    // stars sitting on the waterline read as specks on the lens.
    if (y > skyBottom - px * 4) continue;
    const x = Math.round((star.at * W) / px) * px;
    // Scintillation, and it is **irregular** — two sines at an irrational ratio rather than one, so
    // the flicker never settles into a rhythm you can count. And the twinkle is in *brightness*,
    // never in existence: a star that switches off is a dead pixel.
    const swing = 0.08 + 0.34 * (1 - star.mag);
    const shimmer = Math.sin(t * star.rate + star.phase) * 0.62
      + Math.sin(t * star.rate * 2.37 + star.phase * 1.7) * 0.38;
    // Air, and a lot of it near the waterline.
    const haze = clamp(0.22 + (1 - y / skyBottom) * 1.2, 0, 1);
    // ...and the moon, which is the brightest thing for a hundred million miles and empties the sky
    // around itself. The same falloff the air is lit by, so the hole in the star field and the glow
    // it sits in are the same shape by construction.
    const wash = 1 - glareAt(moon, x, y) * 0.88;
    const level = star.mag * (steps + 1.4) * (1 + swing * shimmer) * haze * wash;
    if (level < 0.55) continue;
    // Counted down from the top of the ramp: a bright star is step 0 and a barely-there one is the
    // last step, a shade off the sky itself.
    const idx = clamp(Math.round(steps - level), 0, steps - 1);
    const ramp = star.warm > 0.8 ? warm : cold;
    ramp[idx].push(x, y);
    // The brightest get a diffraction spike, and it *fades outward*: a cross drawn in one tone is a
    // plus sign, while arms that step down the ramp as they go read as light spilling.
    //
    // Gated on the star's own magnitude and **not** on the level it is drawn at, for two reasons.
    // The level moves with the twinkle, so a threshold on it makes the arms flick in and out — the
    // same "a star that switches off is a dead pixel" mistake, one ring further out. And a dozen of
    // these is a night sky where sixty is a Christmas card: at a fortieth of the field they are the
    // three or four stars you would actually name, which is the point of drawing them differently.
    if (star.mag > 0.93) {
      ramp[Math.min(idx + 2, steps - 1)].push(x - px, y, x + px, y, x, y - px, x, y + px);
      if (star.mag > 0.975) {
        ramp[Math.min(idx + 4, steps - 1)].push(x - px * 2, y, x + px * 2, y, x, y - px * 2, x, y + px * 2);
      }
    }
  }

  for (const [ramp, bucket] of [[STAR_COLD, cold], [STAR_WARM, warm]]) {
    for (let step = 0; step < steps; step += 1) {
      const cells = bucket[step];
      if (!cells.length) continue;
      ctx.fillStyle = rgba(ramp[step], 1);
      ctx.beginPath();
      for (let i = 0; i < cells.length; i += 2) ctx.rect(cells[i], cells[i + 1], px, px);
      ctx.fill();
    }
  }
}

/**
 * A meteor, now and then.
 *
 * On the epoch pattern the gallery uses everywhere: `n` is which one it is, everything about it is
 * hashed off `n`, and it is computable at any `t` in any order with nothing stored. Rare enough that
 * it is a surprise — one about every forty seconds, lasting under one — and drawn as a short streak
 * that thins to nothing behind the head rather than as a line, because a line is a scratch.
 */
export function drawMeteor(ctx, W, H, t, px) {
  const PERIOD = 41;
  const n = Math.floor(t / PERIOD);
  const age = t - n * PERIOD;
  const life = 0.9;
  if (age > life) return;
  const u = age / life;
  const fromX = hash2(n * 1.7, 3) * W;
  const fromY = hash2(n * 2.3, 7) * H * HORIZON * 0.5;
  const lean = 0.55 + hash2(n * 3.1, 11) * 0.6;
  const reach = H * 0.3;
  const headX = fromX + reach * lean * u * (hash2(n * 5.3, 13) > 0.5 ? 1 : -1);
  const headY = fromY + reach * u;
  ctx.fillStyle = rgba(MOON[0], 1);
  ctx.beginPath();
  for (let i = 0; i < 7; i += 1) {
    // The tail is thrown away from the front: each chunk behind the head is likelier to be missing
    // than the one in front of it, so the streak frays instead of stopping.
    if (wrap01(hash2(n * 7.1 + i, 17)) < i * 0.14 + u * 0.5) continue;
    const back = i * px * 1.4;
    ctx.rect(snap(headX - back * lean * Math.sign(headX - fromX || 1), px), snap(headY - back, px), px, px);
  }
  ctx.fill();
}
