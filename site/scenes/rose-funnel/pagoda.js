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
import { vortexAt } from './funnel.js';
import { CLOUD, GROUND } from './layout.js';
import { GOLD, JADE, LAPIS, SPIN } from './palette.js';

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

  // One bucket per colour the building is allowed, filled back-to-front and emptied in that order.
  // Nine values instead of two, which is the whole difference between a silhouette and a building:
  // a roof with a lit ridge, a body and a shaded underside is *ceramic*, and the same roof in one
  // flat tone is a wedge. The order matters — a bright bracket course emitted after the wall it sits
  // on would be painted under it and vanish.
  const B = {
    shadow: [], wallLit: [], wallDark: [], door: [], lamp: [],
    tileDark: [], tile: [], tileLit: [], bracket: [], gilt: [],
  };
  const put = (into, x, y, w, h) => into.push(x, y, w, h);
  const bayOf = (storey, part) => cycle.bays[storey * 3 + ['eaveL', 'eaveR', 'wall'].indexOf(part)];

  // Where the storm is standing, asked once. The scene has no sun — the vortex is the only light in
  // it — so which face of the temple is lit is a question about where the storm *is*, and because it
  // walks, the building re-lights itself as the storm passes. A whole extra read for one comparison.
  const stormX = vortexAt(W, H, t, funnel, 0.35).cx;

  let top = baseY;
  for (let i = 0; i < n; i += 1) {
    const lift = (i + 0.5) / n;
    const dx = shoveAt(t, plan, lift, px);
    const storeyRows = rows[i];
    top -= storeyRows * px;

    const half = Math.round(wallHalf(shape, i) / px) * px;
    const eave = Math.round(eaveHalf(shape, i) / px) * px;
    const roofRows = Math.max(3, Math.round(storeyRows * 0.34));
    const cols = Math.max(2, Math.round(eave / px));

    const left = bayAt(bayOf(i, 'eaveL'), cx + dx - eave, t, W, H, funnel, cycle.seed).life;
    const right = bayAt(bayOf(i, 'eaveR'), cx + dx + eave, t, W, H, funnel, cycle.seed).life;
    const wall = bayAt(bayOf(i, 'wall'), cx + dx, t, W, H, funnel, cycle.seed).life;

    // ---- the body of the storey, top down: shadow, brackets, then wall -------------------------
    const bodyRows = storeyRows - roofRows;
    const standing = Math.round(bodyRows * wall);
    if (standing > 0) {
      const bodyTop = top + (storeyRows - standing) * px;
      // The dark line directly under the eave. It is what separates one storey from the next, and
      // without it the roofs read as shelves bolted to a single tower.
      put(B.shadow, cx + dx - half, bodyTop, half * 2, px);
      // The bracket course — the dougong. One bright row under every eave, and the only rhythm the
      // eye needs to read "this is built out of repeated wooden units" at seven pixels.
      if (standing > 2) put(B.bracket, cx + dx - half, bodyTop + px, half * 2, px);
      const wallTop = bodyTop + Math.min(2, standing - 1) * px;
      const wallH = bodyTop + standing * px - wallTop;
      if (wallH > 0) {
        // Two faces. The light in this scene is the storm — there is no sun — so the lit side is
        // simply the side the vortex is on, which means the building re-lights itself as the storm
        // walks past it. One flat wall would have thrown that away.
        const litLeft = stormX < cx + dx;
        put(B.wallLit, cx + dx - half, wallTop, half * (litLeft ? 1.2 : 0.8), wallH);
        put(B.wallDark, cx + dx + (litLeft ? half * 0.2 : -half * 0.8), wallTop, half * (litLeft ? 0.8 : 1.2), wallH);
        // A door on the ground storey, windows above it. Dark openings with a lamp burning inside —
        // the only reason to believe anyone has ever been in here.
        if (wallH > px * 2) {
          const openW = Math.max(px, Math.round((half * 0.34) / px) * px);
          const openH = Math.min(wallH - px, px * (i === 0 ? 4 : 2));
          const oy = wallTop + wallH - openH;
          put(B.door, cx + dx - openW / 2, oy, openW, openH);
          put(B.lamp, cx + dx - openW / 2 + px, oy + px, Math.max(px, openW - px * 2), Math.max(px, openH - px * 2));
        }
      }
    }

    // ---- the roof ------------------------------------------------------------------------------
    // Glazed tile, and the one thing in the frame wearing the storm's complement. A green roof in
    // front of a rose vortex is instantly a different substance; the same roof in the storm's own
    // ramp is a darker piece of storm. It is also what the kiln down on the ground is firing.
    for (let c = -cols; c <= cols; c += 1) {
      const reach = Math.round(cols * (c < 0 ? left : right));
      if (Math.abs(c) > reach) continue;
      const u = Math.abs(c) / cols;
      const fall = Math.round((roofRows - 1) * u ** 0.62);
      const fromTip = cols - Math.abs(c);
      const kick = fromTip === 0 ? 2 : fromTip === 1 ? 1 : 0;
      const yTop = top + (fall - kick) * px;
      const deep = Math.abs(c) * px <= half ? roofRows + 1 - fall + kick : 2;

      // Ridge light along the top chunk, body beneath, and the underside in shade — three values up
      // a two-or-three chunk roof, which is as much modelling as this resolution can hold and
      // exactly enough to read as a curved tiled surface rather than a plank.
      put(B.tileLit, cx + dx + c * px, yTop, px, px);
      if (deep > 2) put(B.tile, cx + dx + c * px, yTop + px, px, (deep - 2) * px);
      put(B.tileDark, cx + dx + c * px, yTop + (deep - 1) * px, px, px);
      // Every third tile column is a capped roll — the ridges a tiled roof actually has, and the
      // reason it reads as many small pieces rather than one sheet. Keyed to the column index, not
      // to screen position, so the pattern does not crawl across the roof as the building sways.
      if (Math.abs(c) % 3 === 0 && deep > 1) put(B.tile, cx + dx + c * px, yTop, px, px);
      // ...and the upturned tip is gilded, which is where the eye goes.
      if (fromTip <= 1) put(B.gilt, cx + dx + c * px, yTop + (deep - 1) * px, px, px);
    }
  }

  // ---- the sōrin ------------------------------------------------------------------------------
  const spire = bayAt(cycle.bays[cycle.bays.length - 1], cx, t, W, H, funnel, cycle.seed).life;
  const topDx = shoveAt(t, plan, 1, px);
  const spireRows = Math.round(shape.spireRows * spire);
  if (spireRows > 1) {
    const mastW = Math.max(px, Math.round((wallHalf(shape, n - 1) * 0.22) / px) * px);
    put(B.wallDark, cx + topDx - mastW / 2, top - spireRows * px, mastW, spireRows * px);
    const ringCount = Math.min(9, Math.max(4, Math.round(spireRows / 4)));
    for (let r = 0; r < ringCount; r += 1) {
      const u = r / Math.max(1, ringCount - 1);
      const rw = Math.max(px, Math.round((wallHalf(shape, n - 1) * 0.3 * (1 - u * 0.6)) / px) * px);
      const y = top - px * 3 - Math.round(((spireRows - 4) * px * u) / px) * px;
      put(B.gilt, cx + topDx - rw, y, rw * 2, px);
    }
    // The hōju — the flaming jewel at the very tip, and the single brightest chunk on the building.
    put(B.bracket, cx + topDx - px, top - (spireRows + 1) * px, px * 2, px * 2);
  }

  // ---- the plinth -----------------------------------------------------------------------------
  // Stone, and the one part the storm never takes: you cannot carry away a foundation.
  const plinthHalf = Math.round((wallHalf(shape, 0) * 1.3) / px) * px;
  put(B.wallDark, cx - plinthHalf, baseY, plinthHalf * 2, px * 2);
  put(B.bracket, cx - plinthHalf, baseY, plinthHalf * 2, px);

  const ORDER = [
    ['shadow', SPIN[7]], ['wallDark', LAPIS[6]], ['wallLit', LAPIS[5]],
    ['door', LAPIS[7]], ['lamp', GOLD[2]],
    ['tileDark', JADE[5]], ['tile', JADE[3]], ['tileLit', JADE[1]],
    ['bracket', GOLD[3]], ['gilt', GOLD[1]],
  ];
  for (const [name, colour] of ORDER) {
    const cells = B[name];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 4) chunk(ctx, cells[i], cells[i + 1], cells[i + 2], cells[i + 3], px);
    ctx.fill();
  }
}
