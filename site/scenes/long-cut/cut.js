// Drawing the train: back to front, one fill per slice.
//
// **Occlusion is the only depth cue this picture has**, and saying so is not a lament. Every other
// animation in this gallery separates near from far with tone — the fog goes pale with distance, the
// pit goes dark with it, the sea goes down a ramp. Two colours cannot do any of that. There is no
// dimmer white and no lighter black; a slice at the far end of the train is drawn in exactly the
// paint the one passing your ear is drawn in. So depth here is carried entirely by **what covers
// what**, plus the size perspective gives, and the drawing is therefore a straight painter's
// algorithm with nothing clever in it: furthest first, and the last one down wins.
//
// Which leaves one problem, and the answer to it is the thing that makes the scene look the way it
// does. If every slice were the same colour, a stack of them would be a silhouette — one shape, no
// interior, nothing to see. So **the polarity alternates**: even slices are white, odd slices are
// black, all the way along the train. Adjacent slices are then guaranteed to contrast against each
// other whatever their shapes are doing, and the frame fills with crescents and rims of the two
// colours where each one fails to cover the one behind. In a picture with two colours, alternating
// them by depth is not a stylistic flourish; it is the difference between a legible solid and an
// ink blot.
//
// The consequence is a rhythm nobody had to write. The field is black, so a black slice sweeping the
// frame *erases* the picture as it passes and a white one *floods* it, forever. That is the beat of
// the animation and it falls out of one `& 1`.
//
// **And every slice is keylined in the other colour**, which is the second half of the same
// argument and was not obvious until the scene was built without it. Alternating polarity separates
// a slice from its *neighbours*; it does nothing to separate a black slice from the black field,
// and a first pass at this looked like one white blob drifting about, because every second slice in
// the train was invisible and the picture was half missing. So each one is drawn twice: the
// silhouette grown outward and its hole shrunk inward, in the opposite colour, and then the slice
// itself over the top. The rim is a fixed width **in screen pixels** rather than a fraction of the
// slice, so it is a hairline around the near ones and most of the far ones — which is exactly the
// right way round, because the far end of the train is where a section is otherwise too small to
// have an inside at all.
//
// It costs nothing anywhere else. A slice's rim is the colour of the slice *behind* it, so where it
// overlaps that one it merges with it and cannot be seen; it only shows where it overhangs onto
// something further back, or onto the field. The keyline appears exactly where a keyline is needed
// and nowhere else, without a single test of what is underneath.

import { INK, VOID, cellFor, scanFill, speck } from '../../effects/onebit.js';
import { bend, knobsFor } from '../../lib/knobs.js';
import { SIDES, boreAt, sectionAt, tuneSolid } from './solid.js';
import { placeAt, trainAt, tuneTrain } from './train.js';

/** How many cells across the short edge. Coarse enough that every edge is visibly a staircase. */
const ACROSS = 140;

/** How wide the keyline is, in cells — and how much of a slice it is ever allowed to become. */
const RIM = 1.35;
const RIM_CAP = 0.34;

export function planCut(rng, meta, knobs) {
  return {
    // The live bag the panel writes into. Read every frame and never remembered, so the scene stays
    // a pure function of `t` *and* of these — turn a knob back and the picture comes back exactly.
    K: knobsFor(meta, knobs),
    // Where along the column this particular run came in. The solid is infinite in both directions
    // and entirely determined by the slice index, so a seed has exactly one thing to decide: which
    // part of it you are looking at. Fractional on purpose — the shape functions are smooth in `k`,
    // and landing between two whole slices is a cut nobody else's seed will make.
    grain: rng.range(0, 400),
    // Scratch. One section and one bore, rewritten for every slice of every frame, because a scene
    // that allocates two arrays per slice allocates six hundred a second.
    section: new Float64Array(SIDES * 2),
    outer: new Float64Array(SIDES * 2),
    bore: new Float64Array(SIDES * 2),
    halo: new Float64Array(SIDES * 2),
    pupil: new Float64Array(SIDES * 2),
    at: [0, 0, 0],
  };
}

export function drawCut(ctx, W, H, t, plan) {
  const { K } = plan;
  // Everything the knobs decide, worked out once for the whole frame. A knob is part of the question
  // the scene is being asked, not an event, so it is read here and is constant for every slice in
  // the frame — which is what keeps the picture reproducible from `t` and the panel alone.
  const solid = tuneSolid(K, bend);
  const rails = tuneTrain(K, bend, solid);
  const cell = cellFor(ctx, W, H, bend(K.grain, 44, ACROSS, 330));
  const rimAt = bend(K.grain, 2.6, RIM, 0.75);
  const { travel, near, far } = trainAt(t, rails);
  const { section, outer, bore, halo, pupil, at } = plan;
  const body = [outer, bore];
  // The keyline is the *whole* silhouette, grown, and the body is then painted over the middle of it
  // — rather than the two thin rim bands on their own, which even-odd would give for free by adding
  // `outer` and `bore` to this list. Both draw exactly the same picture; the difference is what they
  // cost, and it is worth writing down because the obvious answer is the wrong one. Rims only halve
  // the painted area but need four spans a row instead of two, and a canvas2d fill is done on the
  // GPU while the path in front of it is built on the CPU one `rect()` at a time. Half the area of
  // something nearly free, for half again as many rectangles, is a bad trade. (Measured the other
  // way round on a machine with no GPU at all, where fill *is* the cost — which is what a headless
  // container is, and is a good way to draw exactly the wrong conclusion from a profile.)
  const keyline = [halo, pupil];

  // The field. Black, and the far end of the train recedes into it rather than onto it — which is
  // why the background is one of the two colours and not a third thing.
  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, W, H);

  for (let k = far; k >= near; k -= 1) {
    const depth = k - travel;
    placeAt(k, depth, W, H, at, rails);
    const cx = at[0];
    const cy = at[1];
    const scale = at[2];

    // The section of the column at this slice, and the hole through it. Both are asked for in world
    // units around the slice's own centre and projected here, which is the whole of the camera: one
    // multiply and one add, because a slice is flat and square to the eye and has no perspective of
    // its own to work out.
    sectionAt(k + plan.grain, section, solid);
    boreAt(k + plan.grain, section, bore, solid);

    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    let reach = 0;
    for (let i = 0; i < SIDES * 2; i += 2) {
      const x = section[i] * scale;
      const y = section[i + 1] * scale;
      outer[i] = cx + x;
      outer[i + 1] = cy + y;
      bore[i] = cx + bore[i] * scale;
      bore[i + 1] = cy + bore[i + 1] * scale;
      if (outer[i] < left) left = outer[i];
      if (outer[i] > right) right = outer[i];
      if (outer[i + 1] < top) top = outer[i + 1];
      if (outer[i + 1] > bottom) bottom = outer[i + 1];
      const far_ = Math.hypot(x, y);
      if (far_ > reach) reach = far_;
    }

    // The keyline, in screen pixels and capped at a third of the slice — so it is a hairline on the
    // near sections and nearly all of the far ones, but never swallows the shape it is describing.
    const rim = Math.min(cell * rimAt, reach * RIM_CAP);
    for (let i = 0; i < SIDES * 2; i += 2) {
      const ox = outer[i] - cx;
      const oy = outer[i + 1] - cy;
      // Along its own ray, which is a true offset only for a circle and near enough for a heptagon.
      const out = 1 + rim / (Math.hypot(ox, oy) || 1);
      halo[i] = cx + ox * out;
      halo[i + 1] = cy + oy * out;

      const bx = bore[i] - cx;
      const by = bore[i + 1] - cy;
      const deep = Math.hypot(bx, by);
      // ...and the hole pulled in the same distance, collapsing onto the centre rather than turning
      // inside out. A bore narrower than the rim simply has no inside left, which is correct: the
      // keyline has closed over it.
      const into = deep > rim ? 1 - rim / deep : 0;
      pupil[i] = cx + bx * into;
      pupil[i + 1] = cy + by * into;
    }
    if (right + rim < 0 || left - rim > W || bottom + rim < 0 || top - rim > H) continue;

    // The rim first, then the slice over it. Two fills, and the second is inside the first.
    ctx.fillStyle = k % 2 === 0 ? VOID : INK;
    ctx.beginPath();
    // A slice too small to catch a cell centre draws nothing at all — correct, and wrong to leave,
    // because the far end of the train would blink instead of receding. One cell is what the grid
    // has left to say about it.
    if (scanFill(ctx, keyline, cell, W, H) === 0) speck(ctx, cx, cy, cell);
    ctx.fill();

    ctx.fillStyle = k % 2 === 0 ? INK : VOID;
    ctx.beginPath();
    if (scanFill(ctx, body, cell, W, H) > 0) ctx.fill();
  }
}
