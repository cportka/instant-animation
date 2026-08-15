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
import { rgba, wrap01 } from '../../lib/draw.js';
import { snap } from '../../effects/pixel.js';
import { HORIZON, backPixel, shadeAt, waterlineAt } from './layout.js';
import { MOON, NIGHT } from './palette.js';

/**
 * Where the stars are, and which of them are worth looking at twice.
 *
 * A field of identical dots is graph paper. Real sky has a very few bright stars and a great many
 * faint ones, so `mag` is cubed on the way in: most come out dim, a handful are bright, and the two
 * or three brightest are the ones that give the field a shape you can remember.
 */
export function planSky(rng) {
  return {
    stars: Array.from({ length: 190 }, () => ({
      at: rng.next(),
      // Squared toward the top, because stars near the horizon are the ones a hazy sea eats first.
      high: rng.next() ** 0.7,
      mag: rng.next() ** 3,
      // Its own slow twinkle, and its own rate. A field that scintillates on one clock is a string
      // of fairy lights.
      rate: rng.range(0.15, 0.7),
      phase: rng.range(0, 10),
    })),
  };
}

export function drawSky(ctx, W, H, t, plan, px) {
  const bpx = backPixel(px);
  const skyBottom = waterlineAt(H, px);
  // `ceil`, so the sky always reaches the waterline and may overhang it by up to one coarse chunk.
  // The sea is drawn afterwards and covers the overhang; the alternative rounds short and leaves a
  // stripe of page background along the horizon.
  const rows = Math.max(1, Math.ceil(skyBottom / bpx));
  const cols = Math.max(1, Math.ceil(W / bpx));
  const bucket = NIGHT.map(() => []);

  for (let row = 0; row < rows; row += 1) {
    const y = row * bpx;
    const down = row / rows;
    // Steep near the horizon and flat overhead — the last tenth of the sky does half the climb,
    // which is what air does and is also what keeps the top of the frame properly black.
    const level = (NIGHT.length - 1) * down ** 2.4;
    for (let col = 0; col < cols; col += 1) {
      bucket[shadeAt(level, col, row, NIGHT.length)].push(col * bpx, y);
    }
  }

  for (let step = 0; step < NIGHT.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(NIGHT[step], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) ctx.rect(cells[i], cells[i + 1], bpx, bpx);
    ctx.fill();
  }

  drawStars(ctx, W, H, t, plan, px, skyBottom);
}

/**
 * Stars, on the **fine** grid rather than the sky's.
 *
 * The one thing in the sky that is not the sky. A star drawn three chunks wide is a square; drawn at
 * the water's resolution it is a point of light, and the difference between those two is the whole
 * reason the grid was split. It costs one extra pass over a few hundred cells.
 */
function drawStars(ctx, W, H, t, plan, px, skyBottom) {
  const bucket = [[], [], []];
  for (const star of plan.stars) {
    const y = Math.round((star.high * skyBottom * 0.94) / px) * px;
    // Nothing in the last stripe above the water: the horizon is where a real sky goes empty, and
    // stars sitting on the waterline read as specks on the lens.
    if (y > skyBottom - px * 4) continue;
    const x = Math.round((star.at * W) / px) * px;
    // The twinkle is in *brightness*, never in existence. A star that switches off is a dead pixel.
    const twinkle = 0.72 + 0.28 * Math.sin(t * star.rate * 6.2 + star.phase);
    const level = star.mag * 2.6 * twinkle;
    if (level < 0.35) continue;
    bucket[Math.min(2, Math.floor(level))].push(x, y);
    // The very brightest get a cross, one chunk on each side. Four chunks, and it is the difference
    // between a bright dot and a star.
    if (level > 2.2) {
      bucket[2].push(x - px, y, x + px, y, x, y - px, x, y + px);
    }
  }

  for (let step = 0; step < 3; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(MOON[[4, 2, 0][step]], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) ctx.rect(cells[i], cells[i + 1], px, px);
    ctx.fill();
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
