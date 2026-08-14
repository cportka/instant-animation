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
import { GROUND, TOP, pixelFor } from './layout.js';
import { DUST, SPIN } from './palette.js';

export const funnelPixel = pixelFor;

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
export const sizeRef = (W, H) => Math.min(Math.min(W, H), W * 0.72);

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
 * The storm's own weather — how hard it is blowing, and where it is standing.
 *
 * A tornado that holds one width, one speed and one place is a decoration. This one has a life: it
 * swells into a wedge and thins back to a rope, whips and slackens, and **walks across the frame**,
 * so it comes down on the temple, grinds at it, and drags away again. None of that is scripted —
 * every one of them is a sum of slow sines on unrelated periods, so the storm never repeats and
 * never arrives anywhere on a schedule you can feel.
 *
 * The march is the one that matters most, because everything else in the scene reads it. The temple's
 * bays ask where the storm was when their round turned over, so a storm that is *here* takes the
 * eaves off and a storm that has walked away takes almost nothing — the destruction rate is not a
 * constant with a wobble on it, it is the weather.
 */
const GUSTS = [
  { amp: 0.6, rate: 0.053, phase: 0 },
  { amp: 0.4, rate: 0.023, phase: 1.1 },
];
const CALM = 0.7;
const GUST = 0.3;

/** 0.4 in the lulls, 1 at its worst. Never zero: a vortex that stops is a column of dust. */
const powerAt = (t) => CALM + GUST * GUSTS.reduce((sum, g) => sum + g.amp * Math.sin(t * g.rate + g.phase), 0);

/**
 * ...and the angle it has turned through by `t`, which is the **integral** of that speed and not the
 * speed multiplied by the clock.
 *
 * `t * powerAt(t)` looks like the same quantity and is not: differentiate it and there is a
 * `t * dpower/dt` term that grows without bound, so the vortex visibly runs *backwards* every time
 * the wind eases. The closed form below is exact, costs the same two cosines, and turns one way
 * forever because `powerAt` never reaches zero.
 */
const turnedBy = (t) => CALM * t
  - GUST * GUSTS.reduce((sum, g) => sum + (g.amp / g.rate) * Math.cos(t * g.rate + g.phase), 0);

/** Where the storm is standing, -1 to 1 across the frame. Long, unrelated periods; no schedule. */
const marchAt = (t) => Math.sin(t * 0.041) * 0.62 + Math.sin(t * 0.017 + 2.3) * 0.38;

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
  // The march moves the whole storm; the lean and the snake bend it about wherever that has put it.
  return W * (0.5 + marchAt(t) * 0.3
    + lean * 0.07 * up ** 1.4 + snake * 0.11 * up ** 0.8 + Math.sin(t * 0.11) * 0.012);
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
  // A slow ripple travelling up the funnel, so the profile is never the same twice...
  const swell = 1 + 0.13 * Math.sin(up * 5.2 - t * 0.8) + 0.07 * Math.sin(up * 11 - t * 1.7);
  // ...and on top of it a real **bulge**: one localised swelling that climbs the column and is gone,
  // then another somewhere else a while later. A sine everywhere is a wobble — the whole read of a
  // bulge is that it is *somewhere in particular*, so it is a narrow gaussian in height whose centre
  // rises with its own clock and whose depth comes and goes on a slower, unrelated one.
  const at = wrap01(t * 0.11);
  const bulge = 1 + 0.5 * Math.max(0, Math.sin(t * 0.037 + 0.6)) * Math.exp(-((up - at) ** 2) / 0.012);
  // ...and the storm's own strength on top of that: a rope at 0.73 of its width, a wedge at 1.2.
  return S * flare * swell * bulge * (0.42 + powerAt(t) * 0.78);
}

export function planFunnel(rng) {
  return {
    base: rng.range(0.036, 0.052),
    mouth: rng.range(0.26, 0.34),
    // The funnel carries no debris of its own any more. It used to have a hundred and fifty motes
    // orbiting it, and the moment there was a temple underneath being torn apart, they became the
    // same idea drawn twice — two orbiting populations doing one job, at which point the orbit stops
    // being legible and becomes a cloud. Everything in the air now came off the building, which is
    // both cheaper and the only version where the debris *means* something.
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

/**
 * Where the vortex is, and how wide, at a given height and time.
 *
 * The one thing anything outside this file is allowed to ask about the funnel. The temple needs it
 * to know whether the storm was on it when a cycle turned over, and the debris needs it to know
 * whether a piece flying past gets caught — both of which are questions about where the tornado *is*,
 * which is exactly the thing the funnel knows and nobody else should be re-deriving.
 */
export function vortexAt(W, H, t, plan, up) {
  const r = radiusAt(up, t, sizeRef(W, H), plan);
  // The wind reaches a long way past the wall. A tornado is not a solid object with a clean edge —
  // most of what it does, it does to things it never touches — so everything that asks about the
  // storm gets both numbers: `r` is the body, `wind` is the field, and the field is what does damage
  // at a distance and what drags loose things off the ground and into the column.
  return { cx: axisAt(up, t, W), r, wind: r * (2.2 + powerAt(t) * 1.4) };
}

/**
 * The wind around it — the part of the storm that is not the funnel.
 *
 * Drawn as streaks on the *outside* of the body, orbiting the axis on the same clock the surface
 * turns on, and obeying the same facing rule: the far half of each orbit is behind the column and is
 * simply not drawn. Long, thin, and following the circulation rather than pointing at it, because
 * wind that radiates outward reads as an explosion and wind that curves reads as a vortex.
 *
 * They fade with distance rather than stopping, which is what tells you the storm has no edge.
 */
export function drawWind(ctx, W, H, t, plan) {
  const S = Math.min(W, H);
  const px = funnelPixel(S);
  const topY = H * TOP;
  const groundY = H * GROUND;
  const bucket = SPIN.map(() => []);

  for (let i = 0; i < 240; i += 1) {
    // Each streak climbs on its own clock and wraps — a constant population, and nothing ever pops
    // because they are all at different heights going at different rates.
    const rise = 0.05 + hash2(i * 1.7, 3) * 0.3;
    const up = wrap01(hash2(i * 2.3, 7) + t * rise);
    const y = groundY - up * (groundY - topY);
    const { cx, r, wind } = vortexAt(W, H, t, plan, up);
    // Out in the field, not on the wall. The nearer ones move faster, which is the one cue that says
    // this is circulation rather than a halo.
    const out = 1.04 + hash2(i * 3.1, 11) * 0.62;
    const angle = hash2(i * 5.9, 13) * TAU + turnedBy(t) * SPEED * spinAt(up) * TAU * (1.4 / out);
    const facing = Math.sin(angle);
    if (facing < -0.1) continue;
    const rad = r * out + (wind - r) * ((out - 1.04) / 0.62) * 0.28;
    const x = cx + Math.cos(angle) * rad;
    // A streak lies *along* the circulation, so it is wide where the orbit is crossing the frame and
    // short where it is coming at you — the same foreshortening the funnel's own bands have.
    const len = Math.max(px, Math.round(Math.abs(facing) * px * (2 + hash2(i * 7.3, 17) * 4)));
    // Bright, and deliberately so: wind at the dark end of the ramp is the sky's own value and
    // simply is not there. It is the fastest thing in the frame and it has to look like it.
    const step = clamp(1 + Math.round((out - 1.04) * 5.2) + Math.round(up * 1.6), 0, SPIN.length - 1);
    bucket[step].push(x, y, len, px);
  }

  for (let step = 0; step < SPIN.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(SPIN[step], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 4) chunk(ctx, cells[i], cells[i + 1], cells[i + 2], cells[i + 3], px);
    ctx.fill();
  }
}

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
    const turn = turnedBy(t) * SPEED * spinAt(up);

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

  drawSkirt(ctx, W, H, R, t, plan, px, groundY);
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
