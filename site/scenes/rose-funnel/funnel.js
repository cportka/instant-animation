// The tornado.
//
// The whole thing turns on one idea: **you never draw a cylinder, you draw the front of one.**
//
// At any height the funnel is a circle seen edge-on, so the surface facing you spans the screen from
// `cx - r` to `cx + r`. Map a screen column back onto that circle with `angle = asin((x - cx) / r)`
// and you have, for every chunk on screen, the angle of the piece of funnel it is showing. Feed that
// angle into a repeating colour band and the bands wrap around the shape for free — and because
// `asin` compresses hard near ±1, they crowd together at the silhouette exactly the way markings on
// a spinning drum do. That single line is what makes a flat stack of rectangles read as something
// with a *back*.
//
// Rotation is then not motion at all. Nothing moves: the band's phase advances with `t`, so the
// colours travel around a shape that is standing still, which is what a rotating solid actually
// looks like. Add a term in height to that phase and the bands become a **helix** — they climb as
// they turn, and the funnel is swirling *up* rather than merely spinning.
//
// Everything is snapped to a chunk grid coarser than the rest of the gallery's, because a tornado
// made of four-pixel blocks at arm's length is just a soft tornado.

import { TAU, clamp, rgba, wrap01 } from '../../lib/draw.js';
import { fbm, hash2, noise2 } from '../../effects/field.js';
import { chunk } from '../../effects/pixel.js';
import { DUST, SPIN } from './palette.js';

/**
 * The chunk size for this scene, off the short edge so the art is the same *coarseness* on a phone
 * as on a monitor. Deliberately about half the resolution of the shared grid: the brief's first word
 * is "pixelated", and at the gallery's usual chunk size that reads as a texture rather than as a
 * decision.
 */
export const funnelPixel = (S) => Math.max(3, Math.round(S / 132));

/**
 * The size the funnel itself is held against — deliberately *not* the short edge.
 *
 * On a landscape monitor the short edge is the height, and a mouth of `0.3 * S` comes out around a
 * third of the width with sky either side of it. Turn the frame portrait and the short edge *is* the
 * width, so the identical fraction spans two thirds of the screen: the funnel runs edge to edge and
 * the storm it is supposed to be hanging out of is entirely behind it. Holding it against the
 * smaller of the short edge and a fraction of the width keeps the *composition* — subject, and air
 * on both sides of it — at every shape of frame, which is the thing that actually has to be
 * constant.
 */
const sizeRef = (W, H) => Math.min(Math.min(W, H), W * 0.72);

/** Where the funnel stands, top and bottom, as fractions of the frame. */
const TOP = 0.04;
const GROUND = 0.88;

/**
 * How many times the colour band wraps around the funnel, and how fast it climbs and turns.
 *
 * `TWIST` is in ramp cycles per radian, so the band goes round the circumference `TWIST * 2π` times
 * and the visible front — half of it — shows `TWIST * π`. That number is the single control on
 * whether this reads as a *mass* or as *stripes*, and the difference is not subtle. It started at
 * 1.35, which is 4.2 ramp cycles across the width: thirty colour steps edge to edge, so the funnel
 * came out as a handful of thin bright ribbons with dark between them and no body at all. At 0.5 the
 * band wraps about three times around and one and a half of those are facing you, which is a barber
 * pole — broad enough that each band is a surface you can see turning rather than a line.
 */
const TWIST = 0.5;
const RISE = 2.2;
const SPEED = 0.36;

/**
 * The funnel's axis at a given height — it snakes.
 *
 * A tornado that stands upright is a traffic cone. The axis leans, and the lean *itself* drifts on
 * two unrelated slow periods so the thing never settles into a shape you have seen before; the base
 * wanders a little and the top wanders more, because the top is in the part of the storm that is
 * actually moving.
 *
 * @param up  0 at the ground, 1 at the cloud
 */
function axisAt(up, t, W) {
  const lean = Math.sin(t * 0.19) * 0.5 + Math.sin(t * 0.073 + 1.9) * 0.5;
  const snake = noise2(up * 2.4, t * 0.28) - 0.5;
  return W * (0.5 + lean * 0.07 * up ** 1.4 + snake * 0.11 * up ** 0.8 + Math.sin(t * 0.11) * 0.012);
}

/**
 * The funnel's radius at a given height.
 *
 * Flared, not conical: `up ** 0.62` opens fast just above the ground and then keeps widening slowly,
 * which is the trumpet profile a real one has. A straight cone reads as a party hat, and the
 * difference between the two is entirely in that exponent.
 */
function radiusAt(up, t, S, plan) {
  const flare = plan.base + (plan.mouth - plan.base) * up ** 0.62;
  // A slow bulge travelling up the funnel, so the profile is never the same twice.
  const swell = 1 + 0.13 * Math.sin(up * 5.2 - t * 0.8) + 0.07 * Math.sin(up * 11 - t * 1.7);
  return S * flare * swell;
}

export function planFunnel(rng) {
  return {
    base: rng.range(0.036, 0.052),
    mouth: rng.range(0.26, 0.34),
    // Debris: everything it has torn up and is carrying around with it.
    motes: Array.from({ length: 150 }, () => ({
      up: rng.next(),
      angle: rng.range(0, TAU),
      // Outside the funnel wall by a little or a lot.
      out: rng.range(1.02, 1.9),
      rise: rng.range(0.05, 0.22),
      spin: rng.range(0.5, 1.6),
      size: rng.next() < 0.7 ? 1 : 2,
      step: Math.floor(rng.range(0, 4)),
    })),
    seed: rng.range(0, 50),
  };
}

/**
 * How fast the funnel is turning at a given height.
 *
 * Faster at the bottom. In a vortex the angular speed rises as the radius falls, so the narrow end
 * whips round while the mouth barely turns — and getting that the wrong way up is the single most
 * obvious way to make a tornado look like a spinning cone.
 */
const spinAt = (up) => 1.9 - up * 1.15;

export function drawFunnel(ctx, W, H, t, plan) {
  const S = Math.min(W, H);
  // The chunk grid stays on the short edge — the art is the same *coarseness* everywhere — while the
  // funnel's own size does not. They answer different questions.
  const px = funnelPixel(S);
  const R = sizeRef(W, H);
  const topY = H * TOP;
  const groundY = H * GROUND;
  const rows = Math.max(8, Math.round((groundY - topY) / px));

  // One path per ramp step: seven fills for the entire tornado, however many thousand chunks it is
  // made of. Building it the other way — a fill per chunk — is the same picture at forty times the
  // cost, and at this chunk size it is several thousand rasteriser passes a frame.
  const bucket = SPIN.map(() => []);

  for (let row = 0; row < rows; row += 1) {
    const y = groundY - row * px;
    // `up` is 0 at the ground and 1 at the cloud, which is what every profile function here wants:
    // the narrow end is the end touching the ground, and the mouth is up in the storm.
    const up = (groundY - y) / (groundY - topY);
    const cx = axisAt(up, t, W);
    const r = radiusAt(up, t, R, plan);
    const cols = Math.max(1, Math.round(r / px));
    // The whole column of the funnel turns, and lower rows turn faster.
    const turn = t * SPEED * spinAt(up);

    for (let c = -cols; c <= cols; c += 1) {
      const u = c / cols;
      // The angle on the front of the drum this column is showing. Everything else follows from it.
      const angle = Math.asin(clamp(u, -1, 1));
      // A helix: turns with the angle, climbs with the height, and advances with time.
      const band = wrap01(angle * TWIST + up * RISE + turn
        + noise2(plan.seed + up * 3.1, t * 0.5) * 0.35);
      let step = Math.floor(band * SPIN.length);
      // Limb darkening: the surface is turning away from you at the edges, so it goes down the ramp.
      step += Math.round(Math.abs(u) ** 2.6 * 2.0);
      // ...and the whole funnel cools with height, which is what puts the reds at the ground where
      // the dust is and the purples up in the cloud.
      step += Math.round(up * 1.1);
      // The top of the funnel shreds into the cloud rather than ending in a rim — but only a little.
      // Dropping most of the mouth leaves confetti where the funnel should be widest, and the widest
      // part is the part that has to look attached to the storm.
      if (up > 0.86 && hash2(c * 1.7 + row * 0.3, Math.floor(t * 9)) < (up - 0.86) * 3.2) continue;

      // The body never reaches the last step. That step is the *sky's* value, and a band wearing it
      // does not read as a dark part of the funnel — it reads as a hole you can see through, which
      // turns a solid mass into three ribbons floating in front of the storm. The darkest thing in
      // the frame has to be behind the subject, never in it.
      bucket[clamp(step, 0, SPIN.length - 2)].push(cx + c * px, y);
    }
  }

  for (let step = 0; step < SPIN.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(SPIN[step], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) chunk(ctx, cells[i], cells[i + 1], px, px, px);
    ctx.fill();
  }

  drawMotes(ctx, W, H, R, t, plan, px, topY, groundY);
  drawSkirt(ctx, W, H, R, t, plan, px, groundY);
}

/**
 * Debris, orbiting outside the wall.
 *
 * It rises on its own clock and wraps, so the population is constant and nothing ever pops: a mote
 * that reaches the cloud reappears at the ground, and since they are all at different heights and
 * rates there is no moment when the sky refills.
 */
function drawMotes(ctx, W, H, S, t, plan, px, topY, groundY) {
  const bucket = SPIN.map(() => []);
  for (const mote of plan.motes) {
    const height = wrap01(mote.up + t * mote.rise);
    const y = groundY - height * (groundY - topY);
    const cx = axisAt(height, t, W);
    const r = radiusAt(height, t, S, plan) * mote.out;
    const angle = mote.angle + t * SPEED * spinAt(height) * TAU * mote.spin;
    // Only the front half. A mote drawn on the far side would be behind the funnel, and drawing it
    // in front is the one thing that would collapse the whole depth illusion the body relies on.
    const facing = Math.sin(angle);
    if (facing < -0.15) continue;
    const step = clamp(mote.step + Math.round(height * 2) + (facing < 0.35 ? 2 : 0), 0, SPIN.length - 1);
    bucket[step].push(cx + Math.cos(angle) * r, y, mote.size);
  }

  for (let step = 0; step < SPIN.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(SPIN[step], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 3) {
      const size = px * cells[i + 2];
      chunk(ctx, cells[i], cells[i + 1], size, size, px);
    }
    ctx.fill();
  }
}

/**
 * The skirt: the dust it is tearing off the ground.
 *
 * A tornado with a clean base looks pasted onto the landscape. What sells contact is a low, wide,
 * churning mess at the foot of it that is *brighter* than the funnel above — the debris cloud is lit
 * by everything and shaded by nothing.
 */
function drawSkirt(ctx, W, H, S, t, plan, px, groundY) {
  const cx = axisAt(0, t, W);
  const spread = S * (plan.base * 5);
  const rows = 13;
  // Bucketed on the same ramp as everything else rather than filled in one flat tone. A single
  // colour at one alpha gives you a pale puddle with a rim — it has no interior, so the eye reads it
  // as a decal under the funnel instead of as a mass the funnel is standing in. Cooling outward from
  // the contact point is what gives it a near side and a far side.
  const bucket = SPIN.map(() => []);
  const dust = [];

  for (let row = 0; row < rows; row += 1) {
    const y = groundY - row * px;
    const lift = row / rows;
    // Widest where it meets the ground and tapering up — a pile of thrown dust, not a bell. Belling
    // it out symmetrically and filling it in solidly is how this became a flat plate under the
    // funnel: a debris cloud with a level top and a hard rim is a landing pad.
    const wide = spread * (1 - lift * 0.6);
    const cols = Math.max(1, Math.round(wide / px));
    for (let c = -cols; c <= cols; c += 1) {
      const edge = Math.abs(c / cols);
      // Dense in the middle, ragged at the rim, and boiling on its own clock.
      const churn = fbm(c * 0.26 + t * 1.6, row * 0.55 - t * 0.9, 2);
      // Thins outward *and* upward, which is what gives the cloud a torn crown instead of a lid.
      if (churn < edge * 0.62 + lift * 0.5) continue;
      // The core, right where it is tearing at the ground, is the brightest thing in the frame.
      if (edge < 0.26 && lift < 0.3) dust.push(cx + c * px, y);
      else bucket[clamp(1 + Math.round(edge * 2.4 + lift * 2.2), 0, SPIN.length - 2)].push(cx + c * px, y);
    }
  }

  for (let step = 0; step < SPIN.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(SPIN[step], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) chunk(ctx, cells[i], cells[i + 1], px, px, px);
    ctx.fill();
  }

  ctx.fillStyle = rgba(DUST, 0.92);
  ctx.beginPath();
  for (let i = 0; i < dust.length; i += 2) chunk(ctx, dust[i], dust[i + 1], px, px, px);
  ctx.fill();

  // A second, darker skirt thrown wider and lower — the stuff that has been flung clear and is
  // rolling out across the ground.
  const far = Math.round((spread * 2.2) / px);
  ctx.fillStyle = rgba(SPIN[4], 0.8);
  ctx.beginPath();
  for (let c = -far; c <= far; c += 1) {
    const edge = Math.abs(c / far);
    const churn = fbm(c * 0.17 - t * 1.1, t * 0.7, 2);
    if (churn < 0.3 + edge * 0.6) continue;
    chunk(ctx, cx + c * px, groundY + px * Math.round(churn * 2), px, px, px);
  }
  ctx.fill();
}
