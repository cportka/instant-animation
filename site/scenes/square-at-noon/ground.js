// The square itself: dirt, dust, plants, tumbleweeds, and the sky over it.
//
// This is where the brief's *detailed wind and dust* lives, and the detail is not in the number of
// particles. It is in the **layers moving at different rates**: sheet dust skimming the ground at
// ankle height, a coarser drift a body's height up, and the tall haze that only appears in a gust.
// A single population of motes at one speed is smoke; three populations at three speeds is wind,
// because the eye reads the *shear* between them.
//
// Everything loose in here is carried by `carriedBy` — the integral of the gust — rather than pushed
// by the gust directly. A ball of dead brush does not stop when the wind drops; it keeps rolling and
// merely rolls faster when it is blowing.

import { hash2, noise2 } from '../../effects/field.js';
import { wrap01 } from '../../lib/draw.js';
import { STREET } from './town.js';
import { bandOf, chunkIn, chunkOf, inBands, inkOf, strataAt } from './strata.js';
import { bearingAt, carriedBy, gustAt, windHere } from './wind.js';

export function planGround(rng) {
  return {
    // The dust: three decks at three heights, each with its own speed and its own coarseness.
    motes: Array.from({ length: 520 }, (_, i) => ({
      at: rng.next(),
      // Which deck. Two thirds of it is the sheet along the ground, because that is where dust is.
      deck: i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0,
      lift: rng.next() ** 2.2,
      rate: rng.range(0.6, 1.9),
      bob: rng.range(0, 20),
      step: rng.int(2, 4),
    })),
    // Scrub: creosote and dead grass, rooted, bending. Placed off the middle of the square so the
    // ground in front of the town stays open — a plant in the centre of a square is a centrepiece.
    plants: Array.from({ length: 34 }, () => {
      const at = rng.next();
      return {
        at,
        deep: rng.next(),
        tall: rng.range(0.02, 0.055),
        wide: rng.range(0.6, 1.5),
        kind: rng.int(0, 2),
        seed: rng.range(0, 50),
      };
    }),
    // Tumbleweeds. Few, and that is deliberate: the thing about a tumbleweed is that there is one.
    weeds: Array.from({ length: 5 }, (_, i) => ({
      lane: rng.range(0.08, 0.9),
      size: rng.range(0.018, 0.036),
      pace: rng.range(0.8, 1.45),
      phase: i / 5 + rng.range(-0.06, 0.06),
      seed: rng.range(0, 60),
    })),
  };
}

/** The sky, the sun, and the far hills — everything above the street. */
export function drawSky(ctx, W, H, t, plan, base, tune) {
  const gust = gustAt(t);
  const streetY = H * STREET;

  inBands(H, t, plan.strata, gust, base, (strata, top, bottom, px) => {
    if (top > streetY) return;
    // The band's own sky, flat, and always the **top** of its ramp. Every band is a different ramp,
    // so the sky *is* the strata — nine hard horizontal colour changes stacked up the frame is the
    // first thing you see, and it announces that this picture has more than one palette in it before
    // anything has moved.
    //
    // Pinned to step 4 rather than allowed to wander, because with six ramps in play a value
    // hierarchy cannot be left to chance: the sky at step 3 of one palette is darker than a building
    // at step 2 of another, and the town disappears into the air. Sky brightest, ground darkest,
    // everything else between — held by *index*, so it survives whatever colours a band deals.
    ctx.fillStyle = inkOf(strata, 4);
    ctx.beginPath();
    chunkIn(ctx, 0, top, W, bottom - top, top, bottom, px);
    ctx.fill();

    // Heat: a coarse mottle one step *down*, thickening toward the horizon. Drawn on the band's own
    // grid, so a fine band shimmers and a coarse one boils.
    ctx.fillStyle = inkOf(strata, 3);
    ctx.beginPath();
    let drew = false;
    const cols = Math.ceil(W / px);
    const rows = Math.ceil((bottom - top) / px);
    for (let r = 0; r < rows; r += 1) {
      const y = top + r * px;
      const down = y / streetY;
      for (let c = 0; c < cols; c += 1) {
        const shimmer = noise2(c * px * 0.012 + t * 0.3, y * 0.02 - t * 0.7);
        if (shimmer > 1.05 - down * 0.55 * tune.heat) continue;
        ctx.rect(c * px, y, px, px);
        drew = true;
      }
    }
    if (drew) ctx.fill();

    // The sun: a hard disc, no glow, no gradient. At noon it is a hole punched in the sky.
    const sunY = H * 0.16;
    const sunR = Math.min(W, H) * 0.055 * tune.sun;
    if (bottom > sunY - sunR && top < sunY + sunR) {
      ctx.fillStyle = inkOf(strata, 2);
      ctx.beginPath();
      drew = false;
      for (let r = -Math.ceil(sunR / px); r <= Math.ceil(sunR / px); r += 1) {
        const y = sunY + r * px;
        const half = Math.sqrt(Math.max(0, sunR * sunR - (r * px) ** 2));
        if (half < px * 0.5) continue;
        drew = chunkIn(ctx, W * 0.74 - half, y, half * 2, px, top, bottom, px) || drew;
      }
      if (drew) ctx.fill();
    }
  });
}

/** The dirt of the square, and the ruts in it. */
export function drawSquare(ctx, W, H, t, plan, base, tune) {
  const gust = gustAt(t);
  const streetY = H * STREET;

  inBands(H, t, plan.strata, gust, base, (strata, top, bottom, px) => {
    if (bottom < streetY) return;
    // Step 1, not 2. The ground has to be the darkest large area in the frame or the picture has no
    // floor — and with six palettes in play "darker" cannot be left to chance: a band on the acid
    // ramp at step 2 is brighter than a band on the violet ramp at step 4, and the square would
    // float. Held one step below everything else, it stays ground whatever ramp it is wearing.
    ctx.fillStyle = inkOf(strata, 1);
    ctx.beginPath();
    chunkIn(ctx, 0, streetY, W, H - streetY, top, bottom, px);
    ctx.fill();

    // Ruts and stones: the same ground one step darker, in long thin runs down the square. Wheel
    // ruts run *away* from the viewer, so they converge — the only perspective in the whole scene.
    ctx.fillStyle = inkOf(strata, 0);
    ctx.beginPath();
    let drew = false;
    const rows = Math.ceil((H - streetY) / px);
    for (let r = 0; r < rows; r += 1) {
      const y = streetY + r * px;
      const out = (y - streetY) / (H - streetY);
      for (const lane of [0.3, 0.42, 0.64, 0.76]) {
        const x = W * (0.5 + (lane - 0.5) * (0.5 + out * 1.6));
        const wide = px * (1 + out * 3);
        if (noise2(x * 0.01, y * 0.05 + lane * 20) > 0.52) continue;
        drew = chunkIn(ctx, x, y, wide, px, top, bottom, px) || drew;
      }
      for (let c = 0; c < Math.ceil(W / px); c += 1) {
        if (hash2(c * 1.7, r * 3.1) > 0.012 + out * 0.03) continue;
        drew = chunkIn(ctx, c * px, y, px, px, top, bottom, px) || drew;
      }
    }
    if (drew) ctx.fill();
  });
}

/** Scrub, rooted and bending. */
export function drawPlants(ctx, W, H, t, plan, base, tune) {
  const gust = gustAt(t);
  const streetY = H * STREET;
  const bend = bearingAt(t);

  for (const plant of plan.plants) {
    const y = streetY + (H - streetY) * plant.deep;
    const x = plant.at * W;
    const n = bandOf(y / H, t, plan.strata);
    const strata = strataAt(n, t, plan.strata);
    const px = chunkOf(base, strata, gust, plan.strata.spread ?? 1);
    const tall = plant.tall * H * (0.55 + plant.deep * 0.9) * tune.growth;
    const lean = windHere(plant.at, plant.deep, t) * bend * tall * 0.9;

    ctx.fillStyle = inkOf(strata, plant.kind === 2 ? 3 : 1);
    ctx.beginPath();
    const blades = plant.kind === 0 ? 5 : plant.kind === 1 ? 3 : 7;
    for (let b = 0; b < blades; b += 1) {
      const spread = (b / (blades - 1) - 0.5) * plant.wide;
      const steps = Math.max(2, Math.round(tall / px));
      for (let s = 0; s < steps; s += 1) {
        const up = s / steps;
        // A blade bends more the higher it is — the root does not move — which is the entire
        // difference between a plant in the wind and a plant sliding sideways.
        const bx = x + spread * px * 2 + lean * up * up;
        ctx.rect(Math.round(bx / px) * px, Math.round((y - up * tall) / px) * px, px, px);
      }
    }
    ctx.fill();
  }
}

/**
 * The dust: three decks, three speeds.
 *
 * A mote takes the band it is *in*, so the dust changes resolution as it crosses a boundary — which
 * is the cheapest and most convincing demonstration the scene has that the strata are real. The same
 * particle is a single fine speck on one side of a line and an eight-pixel block on the other.
 */
export function drawDust(ctx, W, H, t, plan, base, tune) {
  const gust = gustAt(t);
  const streetY = H * STREET;
  const carried = carriedBy(t);
  // One bucket per band, so a frame of five hundred motes is nine fills rather than five hundred.
  const buckets = [];

  for (const mote of plan.motes) {
    // Higher decks move faster and are thrown further, which is the shear that reads as wind.
    const speed = 0.22 + mote.deck * 0.5;
    const x = wrap01(mote.at + carried * speed * mote.rate * tune.blow) * W;
    const floor = streetY + (H - streetY) * (mote.deck === 0 ? 0.75 : mote.deck === 1 ? 0.4 : 0.08);
    const rise = mote.lift * H * (0.02 + mote.deck * 0.055) * (0.4 + gust * 1.7) * tune.blow;
    const y = floor - rise + Math.sin(t * mote.rate * 2.1 + mote.bob) * H * 0.006 * gust;
    if (y < 0 || y > H) continue;
    // **Only as much dust as the wind has picked up.** Every mote has a weight, and it is only in
    // the air while the gust is above it — so still air is a nearly clean square and a gust fills
    // the frame. Drawn unconditionally the population is a constant fog of confetti, which is what
    // the first build of this was: the wind changed how *high* the dust went and never how much of
    // it there was, so the one thing the scene is about could not be seen at all.
    if (mote.lift > gust * 1.15 + 0.06) continue;

    const n = bandOf(y / H, t, plan.strata);
    (buckets[n] ??= []).push(x, y, mote.step);
  }

  for (let n = 0; n < buckets.length; n += 1) {
    const list = buckets[n];
    if (!list?.length) continue;
    const strata = strataAt(n, t, plan.strata);
    // Dust changes resolution as it crosses a boundary, which is the cheapest demonstration the
    // scene has that the strata are real — the same speck is one fine pixel on one side of a line
    // and a block on the other. Capped at three chunks, though: at the coarsest grid a mote is a
    // brick, and a sky full of bricks is not weather.
    const px = Math.min(chunkOf(base, strata, gust, plan.strata.spread ?? 1), base * 3);
    // Two steps of the ramp, so the dust has a near and a far in it rather than being one tone.
    for (const step of [2, 3]) {
      ctx.fillStyle = inkOf(strata, step);
      ctx.beginPath();
      let drew = false;
      for (let i = 0; i < list.length; i += 3) {
        if (list[i + 2] === 3 ? step !== 3 : step !== 2) continue;
        ctx.rect(Math.round(list[i] / px) * px, Math.round(list[i + 1] / px) * px, px, px);
        drew = true;
      }
      if (drew) ctx.fill();
    }
  }
}

/**
 * Tumbleweeds: a ball of hashed spokes, rolling.
 *
 * The **roll is tied to the travel**, not to the clock — the ball turns because it is moving, so it
 * slows when the wind drops and never spins on the spot. Getting that backwards is the single most
 * obvious way to make a rolling thing look like a sprite being dragged.
 */
export function drawWeeds(ctx, W, H, t, plan, base, tune) {
  const gust = gustAt(t);
  const streetY = H * STREET;
  const carried = carriedBy(t);

  for (const weed of plan.weeds) {
    const along = wrap01(weed.phase + carried * weed.pace * 0.42 * tune.blow);
    const x = along * W;
    const deep = 0.2 + weed.lane * 0.7;
    const ground = streetY + (H - streetY) * deep;
    const size = weed.size * Math.min(W, H) * (0.6 + deep * 0.8) * tune.growth;
    // Bouncing: it is not a wheel, it is a shrub, and it leaves the ground constantly.
    const hop = Math.abs(Math.sin(along * 41 + weed.seed)) * size * 0.55 * (0.4 + gust);
    const y = ground - hop;

    const n = bandOf(y / H, t, plan.strata);
    const strata = strataAt(n, t, plan.strata);
    const px = chunkOf(base, strata, gust, plan.strata.spread ?? 1);
    const spin = along * 90 * weed.pace;

    ctx.fillStyle = inkOf(strata, 1);
    ctx.beginPath();
    const spokes = 11;
    for (let s = 0; s < spokes; s += 1) {
      const a = spin + (s / spokes) * Math.PI * 2;
      const len = size * (0.45 + hash2(weed.seed + s, 2.3) * 0.55);
      const steps = Math.max(2, Math.round(len / px));
      for (let i = 1; i <= steps; i += 1) {
        const r = (i / steps) * len;
        ctx.rect(
          Math.round((x + Math.cos(a) * r) / px) * px,
          Math.round((y + Math.sin(a) * r * 0.82) / px) * px,
          px, px,
        );
      }
    }
    ctx.fill();
  }
}
