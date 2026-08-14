// The temple.
//
// A pagoda at seven pixels is not a shape, it is a **chord** — and the chord is what you draw seven
// times. Silhouette alone gets you "tower". What gets you *pagoda* is a three-value vertical chord
// repeated up the frame — dark under-eave shadow, bright bracket course, mid wall — sandwiched
// between two overhanging roofs, each repetition narrower than the one below it. At this chunk size
// you cannot draw a bracket set or a rafter tail. You can draw a jump across one chunk boundary,
// seven times, at a diminishing interval, and the eye reads the rhythm as ornament even though not
// one ornament is present. `above-the-fog/town.js` says the same thing about its ground layer:
// **value does the work, not detail.** This is that, stood on end.
//
// Two things about how it is coloured, both the opposite of what you would guess.
//
// **The mass is one flat value, and it is the ramp's darkest.** Everything else in the scene forbids
// itself that step — `funnel.js` will not let the tornado's body reach it, because the darkest thing
// in the frame has to be *behind* the subject and never in it. That prohibition is what makes this
// work: step 6 is produced only by things behind the funnel, so a step-6 shape drawn in *front* of
// it can never be mistaken for part of it. The temple is a hole in the tornado. It is the only way a
// building stays legible against a vortex drawn in the same seven colours.
//
// **So the chord is spent on the eaves, not the walls.** The obvious design — a value rhythm up the
// whole building — puts mid-ramp walls directly over a funnel body that is itself producing mid-ramp
// bands at every height, and the silhouette then appears and disappears on the helix's rotation
// period. The eaves project past the funnel on both sides at every storey, so that is where the
// ornament goes, and it is legible there against sky instead of against a moving barber pole.

import { rgba } from '../../lib/draw.js';
import { chunk } from '../../effects/pixel.js';
import { bayAt } from './cycle.js';
import { CLOUD, GROUND } from './layout.js';
import { SPIN } from './palette.js';

/** Each storey is this much of the one below it. */
const SHRINK = 0.93;
const MAX_STOREYS = 9;
/** Below this a storey has no room for a wall between its two roofs, and stops being a storey. */
const MIN_ROWS = 6;

/**
 * How far the temple stands off the funnel's axis, as a fraction of the size reference.
 *
 * This is the composition, and it was the one thing the design could not settle from argument. Push
 * it out and you have a building standing politely beside a tornado, which is a diagram of two
 * things rather than a picture of one happening to the other. Put it on the axis and the funnel
 * simply erases it. At 0.2 the storm's foot grinds through the upper storeys while the whole
 * left-hand silhouette — every eave tip on that side — still projects past it into clear sky, which
 * is what makes the destruction legible: you can see the thing being destroyed.
 */
const OFFSET = 0.28;

export function planPagoda(rng) {
  return { seed: rng.range(0, 60), sway: rng.range(0, 30) };
}

/**
 * The building's proportions, in screen units, from the frame alone.
 *
 * The storey *count* absorbs the aspect ratio — which is the one thing a pagoda can do that no other
 * building can, because it is defined by repetition. A tall frame gets more storeys rather than a
 * taller storey, so the rhythm stays the same and only the tower grows. Held against `W` rather than
 * the funnel's size reference for the opposite reason `sizeRef` exists: the funnel must not span a
 * portrait frame, but the temple must not *shrink* in one.
 */
export function pagodaShape(W, H, px, R) {
  const baseY = Math.round((H * GROUND) / px) * px + px * 2;
  const column = baseY - H * CLOUD;
  // Held against the *larger* of a fraction of the width and a fraction of the short edge. Width
  // alone is right on a monitor and collapses on a phone, where it would put a sixty-pixel building
  // at the bottom of an eight-hundred-pixel frame — the exact opposite failure to the funnel's, which
  // is why `sizeRef` takes the smaller and this takes the larger. They are not the same question.
  const half0 = Math.max(px * 3, W * 0.078, Math.min(W, H) * 0.13);
  const storyH = half0 * 0.76;

  const rows = [];
  let used = 0;
  for (let i = 0; i < MAX_STOREYS; i += 1) {
    const r = Math.round((storyH * SHRINK ** i) / px);
    if (r < MIN_ROWS) break;
    if (used + r > (column * 0.72) / px) break;
    rows.push(r);
    used += r;
  }
  // A frame too small for three storeys gets three anyway, at the minimum height. Two roofs with a
  // line between them is not a pagoda, and a phone is not an excuse.
  while (rows.length < 3) {
    rows.push(MIN_ROWS);
    used += MIN_ROWS;
  }

  return {
    cx: Math.round((W * 0.5 - R * OFFSET) / px) * px,
    baseY,
    px,
    rows,
    half0,
    // The spire carries the rest of the column. It is *giant* — the brief says so — and it is what
    // puts the building's one hot accent up where the storm is worst.
    spireRows: Math.max(6, Math.round((column * 0.14) / px)),
    bodyRows: used,
  };
}

/** The wall half-width of storey `i`, and the eave that overhangs it. */
const wallHalf = (shape, i) => shape.half0 * SHRINK ** i;
const eaveHalf = (shape, i) => wallHalf(shape, i) * 1.32;

/**
 * The storm shoves it. Rounded to whole chunks, which is the point: it jolts in discrete steps
 * rather than sliding, so it reads as a building being pushed rather than as an elastic sway. Two
 * unrelated slow periods, and under two chunks even at the top.
 */
const shoveAt = (t, plan, lift, px) =>
  Math.round((Math.sin(t * 0.41 + plan.sway) * 0.62 + Math.sin(t * 0.17 + plan.sway * 1.9) * 0.38)
    * lift ** 1.6 * 2) * px;

/**
 * Draw the temple.
 *
 * Called before the funnel, so the storm's flare occludes the spire for free — painter's order, no
 * z-sort, no clip.
 */
/**
 * Where each bay physically is, this frame — the one thing the debris needs from the building.
 *
 * Indexed to match `planCycle`'s bay order, so a piece of wood knows which eave it came off without
 * either file having to describe the other. The temple owns its own geometry; everything else asks.
 */
export function bayPlaces(W, H, t, plan, px, R) {
  const shape = pagodaShape(W, H, px, R);
  const { cx, baseY, rows } = shape;
  const n = rows.length;
  const places = [];
  let top = baseY;
  for (let i = 0; i < n; i += 1) {
    const dx = shoveAt(t, plan, (i + 0.5) / n, px);
    top -= rows[i] * px;
    const half = Math.round(wallHalf(shape, i) / px) * px;
    const eave = Math.round(eaveHalf(shape, i) / px) * px;
    places[i * 3] = { x: cx + dx - eave * 0.6, y: top, half: eave * 0.4 };
    places[i * 3 + 1] = { x: cx + dx + eave * 0.6, y: top, half: eave * 0.4 };
    places[i * 3 + 2] = { x: cx + dx, y: top + rows[i] * px * 0.6, half };
  }
  places[n * 3] = { x: cx + shoveAt(t, plan, 1, px), y: top - shape.spireRows * px * 0.5, half: px * 2 };
  return places;
}

export function drawPagoda(ctx, W, H, t, plan, px, R, cycle, funnel) {
  const shape = pagodaShape(W, H, px, R);
  const { cx, baseY, rows } = shape;
  const n = rows.length;

  // Two buckets and two fills for the whole building. The mass is the ramp's darkest step and the
  // eaves are the chord; nothing else in front of the funnel is allowed either.
  const mass = [];
  const rim = [];
  const put = (into, x, y, w, h) => into.push(x, y, w, h);
  const bayOf = (storey, part) => cycle.bays[storey * 3 + ['eaveL', 'eaveR', 'wall'].indexOf(part)];

  let top = baseY;
  for (let i = 0; i < n; i += 1) {
    const lift = (i + 0.5) / n;
    const dx = shoveAt(t, plan, lift, px);
    const storeyRows = rows[i];
    top -= storeyRows * px;

    const half = Math.round(wallHalf(shape, i) / px) * px;
    const eave = Math.round(eaveHalf(shape, i) / px) * px;
    const roofRows = Math.max(2, Math.round(storeyRows * 0.32));
    const cols = Math.max(2, Math.round(eave / px));

    // What the storm has left of this storey, asked once per bay per round.
    const left = bayAt(bayOf(i, 'eaveL'), cx + dx - eave, t, W, H, funnel, cycle.seed).life;
    const right = bayAt(bayOf(i, 'eaveR'), cx + dx + eave, t, W, H, funnel, cycle.seed).life;
    const wall = bayAt(bayOf(i, 'wall'), cx + dx, t, W, H, funnel, cycle.seed).life;

    // The wall goes from the top down. Erosion has a *direction*: a per-chunk hash test scatters
    // holes evenly through the masonry, which is the one texture that reads as a broken renderer
    // rather than as a building coming apart.
    const wallRows = Math.round((storeyRows - roofRows) * wall);
    if (wallRows > 0) {
      const wallTop = top + (storeyRows - wallRows) * px;
      put(mass, cx + dx - half, wallTop, half * 2, wallRows * px);
    }

    // The roof, column by column, and this is where the upturn lives. The fall is concave —
    // `u ** 0.62`, the funnel's own flare exponent, for the same reason: a linear fall is a party
    // hat. The kick is defined by *columns from the tip*, not by a fraction of the span, so the
    // curl is exactly two chunks on the wide bottom roof and on the narrow top one alike; as a
    // fraction it becomes a hook on one and a jag on the other.
    //
    // Each side is eaten from its own tip inward, because that is the end standing in the wind.
    for (let c = -cols; c <= cols; c += 1) {
      const reach = Math.round(cols * (c < 0 ? left : right));
      if (Math.abs(c) > reach) continue;
      const u = Math.abs(c) / cols;
      const fall = Math.round((roofRows - 1) * u ** 0.62);
      const fromTip = cols - Math.abs(c);
      const kick = fromTip === 0 ? 2 : fromTip === 1 ? 1 : 0;
      const yTop = top + (fall - kick) * px;
      // Solid down to the wall under the middle of the roof, a thin blade out past it.
      const deep = Math.abs(c) * px <= half ? roofRows + 1 - fall + kick : 2;
      put(mass, cx + dx + c * px, yTop, px, deep * px);
      // The eave rim: one chunk along the lower edge, and the only ornament on the building. It is
      // what survives being crossed by the funnel, because it is the part that sticks out past it.
      put(rim, cx + dx + c * px, yTop + (deep - 1) * px, px, px);
    }
  }

  // The spire. Rings stacked on a mast, narrowing, with the building's one bright accent at the very
  // top — deliberately the point the storm is grinding at.
  const spire = bayAt(cycle.bays[cycle.bays.length - 1], cx, t, W, H, funnel, cycle.seed).life;
  const topDx = shoveAt(t, plan, 1, px);
  const spireRows = Math.round(shape.spireRows * spire);
  if (spireRows > 1) {
    const mastW = Math.max(px, Math.round((wallHalf(shape, n - 1) * 0.22) / px) * px);
    put(mass, cx + topDx - mastW / 2, top - spireRows * px, mastW, spireRows * px);
    // Nine rings is the sōrin's own number, and they are narrow: wide ones stack into a fir tree.
    const ringCount = Math.min(9, Math.max(4, Math.round(spireRows / 4)));
    for (let r = 0; r < ringCount; r += 1) {
      const u = r / Math.max(1, ringCount - 1);
      const rw = Math.max(px, Math.round((wallHalf(shape, n - 1) * 0.3 * (1 - u * 0.6)) / px) * px);
      const y = top - px * 3 - Math.round(((spireRows - 4) * px * u) / px) * px;
      put(rim, cx + topDx - rw, y, rw * 2, px);
    }
  }

  // The plinth it stands on, and the only part the storm never takes — you cannot carry away a
  // foundation. Deliberately *not* the mass value: step 6 and the ground are within a few levels of
  // each other, so a building whose foot wears the mass colour has no feet at all.
  const plinthHalf = Math.round((wallHalf(shape, 0) * 1.25) / px) * px;
  ctx.fillStyle = rgba(SPIN[5], 1);
  ctx.beginPath();
  chunk(ctx, cx - plinthHalf, baseY, plinthHalf * 2, px * 2, px);
  ctx.fill();

  ctx.fillStyle = rgba(SPIN[6], 1);
  ctx.beginPath();
  for (let i = 0; i < mass.length; i += 4) chunk(ctx, mass[i], mass[i + 1], mass[i + 2], mass[i + 3], px);
  ctx.fill();

  ctx.fillStyle = rgba(SPIN[2], 1);
  ctx.beginPath();
  for (let i = 0; i < rim.length; i += 4) chunk(ctx, rim[i], rim[i + 1], rim[i + 2], rim[i + 3], px);
  ctx.fill();
}
