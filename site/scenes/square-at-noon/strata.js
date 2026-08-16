// The scene's one idea: **the frame does not agree with itself about what a pixel is.**
//
// Every other animation in this gallery makes a single claim about its grid and its palette and then
// keeps it — sixteen-bit is one chunk size and seven flat steps, one-bit is one cell and two
// colours, and holding that line is most of why each of them reads as one machine drawing one
// picture. The brief for this one says the opposite, in as many words: *not locked to any one bit
// style, but a variety of different sizes of pixels and combinations of resolution and colours.*
//
// Doing that badly is easy and looks like a bug. Vary the chunk size per object and you get a scene
// where some things are blurry; vary it per frame and you get a scene that is buzzing. What makes it
// read as a **decision** rather than as damage is that the variation is *organised*: the frame is cut
// into horizontal strata, every stratum has one grid and one palette all the way across, the
// boundaries are hard, and they hold still long enough to be seen before they move.
//
// **The wind decides.** A stratum's grid comes from how hard it is blowing at that height, so the
// picture gets coarser where the air is rough and finer where it is still — and since the gusts are
// slow and the whole scene is built on them, the resolution *breathes*. That is the join between the
// two halves of the brief: the wind is the thing the town is made of, and it is also the thing the
// picture is made of.
//
// The palettes are the psychedelia and they are not naturalistic. A desert at noon is one narrow
// band of oranges; six palettes stacked in one frame, cycling, is a desert at noon **remembered
// wrong**, which is the only honest way to draw one and call it psychedelic.

import { hash2 } from '../../effects/field.js';
import { TAU, wrap01 } from '../../lib/draw.js';

/**
 * How many bands the frame is cut into.
 *
 * Nine. Fewer and each one is a wide stripe you read as a *layer of the landscape*, which fights the
 * picture — the eye tries to make the boundary into a horizon and the town ends up standing in four
 * different deserts. More and they are too thin to establish a grid before the next one starts, so
 * the whole frame goes back to being one texture. At nine a band is about a tenth of the height:
 * wide enough to hold a resolution, narrow enough that three of them cross the saloon.
 */
export const BANDS = 9;

/**
 * The grids, in multiples of the base chunk. Not a smooth range — a **set**, and a small one.
 *
 * Sizes an eye can tell apart at a glance is the whole requirement, and consecutive integers cannot
 * be told apart at all: a five-pixel chunk beside a six-pixel chunk is one texture with a seam in
 * it. Roughly doubling means every boundary in the frame is unmistakable, which is what makes the
 * strata read as a decision instead of as a rendering fault.
 */
export const GRIDS = [1, 2, 3, 5, 8];

/**
 * Six palettes, and every one of them is the same desert lit by a different lie.
 *
 * Each is a ramp of five, darkest first, and everything in the scene — sky, timber, horse, dust,
 * lizard — is drawn out of whichever ramp its band is wearing, by *index*. That is what keeps a
 * frame with six palettes in it from reading as six pictures: a shingle is always ramp step 3
 * wherever it is, so the town holds its shape across a boundary while its colour changes completely.
 *
 * They run from a plausible noon out to things a desert has never been. `SUNBLEACH` is the one the
 * scene would have been drawn in if it were behaving; `ACID` and `VIOLET` are what it does instead.
 */
export const PALETTES = [
  // Sunbleached: the honest one, and the only one.
  ['#2b1a2e', '#6d3540', '#c66a43', '#efa953', '#ffe6a8'],
  // Sunset iron: the same desert an hour later, pushed too far.
  ['#1b1030', '#4b1b52', '#a12b5c', '#e4614e', '#ffc46b'],
  // Acid: the noon glare with the green left in.
  ['#10261c', '#1c5b3a', '#4fae4b', '#c3e34a', '#f4ffb0'],
  // Violet shade: what the shadow side does when the light is this hard.
  ['#150d2e', '#3a1f6b', '#7434a8', '#c05fd0', '#f3b8ef'],
  // Cyanotype: the blue-hour version, drawn at noon anyway.
  ['#061225', '#123a5c', '#1f7e96', '#54c6c0', '#c2f6ef'],
  // Ember: down to two useful values and a fire at the top of them.
  ['#1a0a0a', '#521414', '#a33218', '#e8761f', '#ffcf6a'],
];

/** How long a stratum holds its arrangement before the next one is dealt, in seconds. */
const HOLD = 6.5;

/** ...and how far the boundaries slide within that, as a fraction of a band. */
const SLIDE = 0.42;

/**
 * Where the boundary above band `n` sits, as a fraction of the frame's height.
 *
 * The boundaries drift on their own slow waves rather than sitting on a fixed ladder — a frame ruled
 * into nine equal parts is a chart. Each interior edge moves on its own two periods, so the bands
 * breathe in and out of each other and none is ever quite where it was; the top and the bottom of
 * the frame are pinned, because a band sliding off the edge would leave a strip of nothing.
 *
 * The drift is held to under half a band so the edges cannot cross. Ordered boundaries are not a
 * nicety here — the whole scene walks them as ranges, and a pair that swapped would give a band a
 * negative height and every element in it would vanish for as long as the crossing lasted.
 */
export function edgeAt(n, t, plan) {
  if (n <= 0) return 0;
  if (n >= BANDS) return 1;
  const seed = n * 4.7 + plan.seed;
  const drift = Math.sin(t * 0.11 + seed) * SLIDE + Math.sin(t * 0.067 - seed * 1.7) * SLIDE * 0.5;
  return (n + drift * 0.62) / BANDS;
}

/** Which band a height falls in. For anything that is a point rather than a shape. */
export function bandOf(up, t, plan) {
  for (let n = 1; n < BANDS; n += 1) if (up < edgeAt(n, t, plan)) return n - 1;
  return BANDS - 1;
}

/**
 * Walk the bands, handing each one its own grid and palette.
 *
 * Everything with a *shape* is drawn through this: the callback runs once per band with the band's
 * screen range and chunk size, and draws whatever part of itself falls inside. Nine passes over a
 * dozen rectangles is nothing, and it is what lets a saloon front be one building drawn at four
 * resolutions rather than four buildings.
 */
export function inBands(H, t, plan, gust, base, run) {
  for (let n = 0; n < BANDS; n += 1) {
    const top = H * edgeAt(n, t, plan);
    const bottom = H * edgeAt(n + 1, t, plan);
    if (bottom - top < 1) continue;
    const strata = strataAt(n, t, plan);
    run(strata, top, bottom, chunkOf(base, strata, gust, plan.spread ?? 1), n);
  }
}

/**
 * A rectangle, snapped to the band's grid and clipped to the band, appended to the open path.
 *
 * Clipped by clamping rather than with `ctx.clip()`, which would need a save/restore pair per band
 * per element and would put a clip stack between every fill and the frame. The shapes here are all
 * axis-aligned, so the clip is two `Math.max` calls.
 */
export function chunkIn(ctx, x, y, w, h, top, bottom, px) {
  const x0 = Math.round(x / px) * px;
  const x1 = Math.round((x + w) / px) * px;
  const y0 = Math.max(Math.round(y / px) * px, Math.round(top / px) * px);
  const y1 = Math.min(Math.round((y + h) / px) * px, Math.round(bottom / px) * px);
  if (x1 <= x0 || y1 <= y0) return false;
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  return true;
}

/**
 * What band `n` is wearing at `t`: which grid, which palette, and how far through its hold it is.
 *
 * **Latched, and that is the whole difference between psychedelic and broken.** A band's grid and
 * palette are hashed off the whole number of holds elapsed, so they are decided once and then held
 * for six and a half seconds — long enough to look at, long enough to notice that the frame has more
 * than one of them, and long enough that the change *is* an event. Re-rolled per frame this is
 * static; eased between rolls it is a cross-fade, which is a fourth thing on top of two grids and
 * two palettes and reads as mud. It cuts.
 *
 * The bands are dealt on **staggered** clocks — band `n` turns over a fraction of a hold after band
 * `n - 1` — so the frame never changes all at once. A whole-frame cut every six seconds is a slide
 * projector; a rolling one is weather.
 */
export function strataAt(n, t, plan) {
  const clock = t / HOLD + n * 0.37 + plan.phase;
  const era = Math.floor(clock);
  const into = clock - era;
  const key = era * 1.7 + n * 9.31 + plan.seed;
  return {
    era,
    into,
    grid: GRIDS[Math.floor(hash2(key, 3.3) * GRIDS.length) % GRIDS.length],
    palette: PALETTES[Math.floor(hash2(key, 11.7) * PALETTES.length) % PALETTES.length],
  };
}

/**
 * The wind's own contribution: how much coarser everything gets when it is blowing.
 *
 * The grid a band draws at is its dealt size *times* this, so a gust drags the whole frame toward
 * the coarse end at once and the picture comes apart into blocks while the air is moving. It is the
 * one thing every band agrees about, which is what keeps nine independent strata reading as one
 * weather rather than as nine.
 */
export const gustGrid = (gust) => 1 + gust * 1.6;

/**
 * A colour out of a stratum's ramp, by index.
 *
 * **Index, not offset**, and the difference is the whole legibility of the scene. An earlier version
 * rolled each band's ramp by a hashed step or two so that two bands on the same palette would still
 * differ — and it worked, at the cost of the only thing holding the picture together. With six ramps
 * already in play the value hierarchy cannot also be allowed to move: the sky is step 4 and the
 * ground is step 0 *everywhere*, so whatever colours a band deals, the sky is the brightest thing in
 * it and the ground is the darkest. Rolled, a ground came out brighter than the sky above it and the
 * square floated off the bottom of the picture. Six palettes and five grids is variety enough.
 */
export function inkOf(strata, step) {
  const ramp = strata.palette;
  return ramp[step < 0 ? 0 : step >= ramp.length ? ramp.length - 1 : step];
}

/**
 * The chunk a stratum draws at, in CSS pixels, snapped so neighbouring bands tile.
 *
 * Every grid in the frame is a whole multiple of the same base chunk, which is not a detail: with
 * unrelated sizes the bands would not line up on any column, and the vertical edges of the town —
 * the one thing that has to survive all this — would come apart into a staircase of offsets. Sharing
 * a base means a post is a post all the way up, drawn at four resolutions.
 */
export const chunkOf = (base, strata, gust, spread = 1) => {
  // `spread` pulls the grid *away from one*, so a knob can widen the disagreement between bands
  // without changing the overall resolution: at one this is the dealt size, above it the coarse
  // bands get coarser and the fine ones stay fine, below it every band converges on the base and the
  // scene quietly becomes an ordinary single-resolution picture.
  const grid = 1 + (strata.grid - 1) * spread;
  return Math.max(base, Math.round((base * grid * gustGrid(gust)) / base) * base);
};

/** The base chunk, off the short edge, before any band has had its say. */
export const baseChunk = (W, H, grain = 1) => Math.max(2, Math.round(Math.min(W, H) / (260 * grain)));

/** Everything decided once. The strata are a function of `t`, so there is very little of it. */
export function planStrata(rng) {
  return { seed: rng.range(0, 60), phase: rng.next() };
}

/** A hashed angle, for anything that needs to point somewhere and never change its mind. */
export const facing = (seed) => wrap01(hash2(seed, 5.1)) * TAU;
