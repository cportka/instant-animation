// Where a slice is: the depth train, and the fall.
//
// The slices are at **regular intervals in space** and move toward the eye at a constant rate, which
// is the one decision the whole scene's motion comes out of. Perspective does the rest, and it does
// something worth naming: constant speed through `scale = 1 / z` is not constant speed on screen. A
// slice crossing the far half of the train takes seconds to grow by a hair; the same slice crossing
// the last unit of it goes from a third of the frame to past your ear. Nothing here accelerates.
// The picture accelerates because that is what depth does, and the brief asked for slices coming
// *towards the camera* rather than for slices getting bigger.
//
// The same argument settles the fall. A slice drifts at a **constant** rate down and to one side,
// in world units, from the moment it is cut; on screen that drift is divided by the same shrinking
// `z`, so what you see is a slow lean at the far end and a plunge out of the corner at the near end.
// Written directly on screen it would need a gravity term and a fudge; written in the world it needs
// one multiplication, and it is right at every depth for free. (There is a small square term as
// well, so the drift is a fall in the world too and not only in the projection.)
//
// **Nothing here is stateful and nothing integrates.** A slice's identity is the integer `k`, its
// depth is `k − t·RATE`, and everything about it — its shape, its polarity, how far it has fallen —
// is a function of `k` and that depth. The render tests draw eight timestamps out of order; a train
// that remembered where it was last frame could not survive that, and a train that does not remember
// anything can be asked about any moment in any order.

/** Slices per second. */
export const RATE = 0.62;

/**
 * World depth between one slice and the next — and the single number the picture's density is.
 *
 * Cut the column coarsely and you get a handful of separate objects with black between them: the
 * near one covers everything behind it, and a scene whose whole subject is a *stack* shows one
 * shape. Cut it finely and consecutive sections differ by less than their own width, so each one
 * contributes a band rather than a body and the train arrives as a continuous ribbed ribbon of
 * alternating black and white. The second is the picture. Two dozen slices are on screen at once.
 */
const GAP = 0.30;

/** How far away a slice sits at `k = t·RATE` — the depth the near end of the train is anchored to. */
const NEAR = 1.15;

/**
 * Closer than this and a slice is behind the eye. Nothing is drawn there.
 *
 * Held far closer than it needs to be for anything to be *seen* at, and that is the whole point: a
 * slice must be **completely off the frame before it is culled**, or it does not leave, it vanishes.
 * The first build clipped at a depth where the nearest section was still a plate half the width of
 * the window, and every one of them blinked out of existence in the middle of the picture on a beat
 * — the only genuinely broken-looking thing the scene ever did. The last few slices are enormous,
 * far outside the frame, and cost one bounding-box test each.
 *
 * That is also what the fall's `REACH` is for. A slice leaves by *outrunning its own radius*: the
 * drift has to carry its centre further from the axis than the section is wide, or the thing simply
 * grows around the eye forever and there is no scale at which it is gone. Everything below is sized
 * against the fattest section the solid can produce, not the average one.
 */
const CLIP = 0.10;

/** ...and further than this, nothing is cut yet. Also the age a slice's fall is measured from. */
const FAR = 18;

/**
 * Depth, in slices, of the nearest one still drawn. Negative: the train runs on past the eye.
 *
 * Exported because it is the exact moment a slice stops existing, and "it is already gone from the
 * frame by then" is the invariant `tests/long-cut.test.js` checks at every viewport.
 */
export const BRINK = (CLIP - NEAR) / GAP;

/** How long a slice lives, in slice-units — which is what a fall is measured against. */
const LIFE = FAR - BRINK;

/**
 * The knobs' one hard rule, stated where it is easiest to break.
 *
 * **Nothing here may scale the master clock.** A slice's identity is the integer `k` and its depth is
 * `k − t·RATE`, so a knob that changed `RATE` would move `travel` by `t·ΔRATE` — which at four
 * minutes in is eighty slices, and the whole train would teleport the instant the knob was touched.
 * The same is true of any epoch or latch clock in this gallery.
 *
 * `GAP` is the way through, and it is not a workaround: a slice's *depth* is `NEAR + (k − travel)·GAP`,
 * so changing it leaves every slice exactly where it is in the train and only changes how much world
 * there is between them. The apparent speed is `RATE·GAP`, so the picture speeds up and thins out
 * together, continuously, from a knob that never touches the phase.
 */
export const tuneTrain = (K, bend, solid) => {
  const gap = bend(K.pace, 0.17, 0.30, 0.52);
  const brink = (CLIP - NEAR) / gap;
  const wander = bend(K.twist, 0.18, 1, 2.3);
  return {
    gap,
    brink,
    life: FAR - brink,
    /**
     * The fall, in **section widths** rather than in world units, and with a floor it may not go
     * under. Both halves of that are what keep the knobs from breaking the scene.
     *
     * A slice leaves the frame by outrunning its own radius, so if the drift is ever shorter than
     * the section is wide there is no depth at all at which the thing is gone: it grows around the
     * eye and then blinks out at the clip. That was the one genuinely broken-looking bug this scene
     * had before it shipped, and a panel is a very efficient way to hand it back — `form` at full
     * makes a section nearly twice the width `REACH` was chosen against.
     *
     * So the reach is multiplied by however much the knobs have widened the worst case, and by a
     * share of however much further the axis now wanders against it. And the **`fall` knob is not
     * allowed to shorten it**: its lower half changes `hold` instead, which is *when* the drift is
     * spent rather than how much of it there is. That is the better gesture anyway — held back, a
     * slice comes almost the whole way down the train on the axis and then leaves all at once.
     */
    reach: bend(K.fall, REACH, REACH, 3.6) * Math.max(1, solid.widen) * (1 + Math.max(0, wander - 1) * 0.16),
    hold: bend(K.fall, 6.5, 4, 2),
    wander,
  };
};

/** Where the train converges, as a fraction of the frame. Up and left, so the fall has a diagonal. */
const AXIS_X = 0.24;
const AXIS_Y = 0.16;

/** How far a slice drifts over its whole life, in world units, and in what direction. */
const REACH = 2.4;
const FALL_X = 0.62;
const FALL_Y = 0.80;

/**
 * How far the fall leans toward the long edge of the frame, and the most it is allowed to.
 *
 * This is the one place the scene bends its own physics, and it is worth saying exactly where the
 * line is. The **sections** are sized in world units against the short edge, so the solid is the
 * same thing on a phone and on a monitor. The **path** is a composition, and a composition is about
 * the frame it is in: a fall aimed at a fixed direction in the world runs off the right-hand side of
 * a wide window while the bottom half stays empty, and off the bottom of a tall one with the whole
 * right-hand side empty. Both were true of the first build of this and both looked like a mistake.
 *
 * Stretched by the frame's aspect, the fall aims at the far **corner** instead, so the diagonal is
 * the window's own diagonal and the picture is composed for whatever shape it is handed. The cap
 * stops an ultrawide from turning the fall into a horizontal skid.
 */
const LEAN = 2.6;

/**
 * The slices on screen at `t`, as the range of `k` to walk. **Furthest first** — the drawing is
 * painter's algorithm and nothing else, so the order is the entire depth-sorting mechanism.
 */
export function trainAt(t, tune) {
  const travel = t * RATE;
  return { travel, near: Math.ceil(travel + tune.brink), far: Math.floor(travel + FAR) };
}

/**
 * Where the train's axis wanders, in world units — a function of `k`, never of time.
 *
 * This is what makes the chain a curve rather than a corridor. If every slice were cut on the same
 * axis the train would be a straight tube and the fall would slide it sideways as a rigid whole;
 * giving each slice its own small offset, drifting slowly along the train, bends the tube — and
 * since the offset is fixed to the slice and the projection magnifies it as the slice approaches,
 * the bend arrives at you rather than sitting in the picture.
 *
 * Four waves at unrelated periods, the shortest of which takes eleven slices — half a minute — to
 * come round. Nothing about the curve ever repeats.
 */
const wanderX = (k) => 0.34 * Math.sin(k * 0.34) + 0.20 * Math.sin(k * 0.57 + 2.1);
const wanderY = (k) => 0.29 * Math.sin(k * 0.29 + 1.3) + 0.17 * Math.sin(k * 0.47 + 4.4);

/**
 * Put slice `k` on the screen: `out` gets its centre in CSS pixels and the pixels-per-world-unit it
 * is drawn at.
 *
 * The world unit is **half the short edge**, so the composition holds its proportions on a phone in
 * portrait and on an ultrawide alike — the solid is the same fraction of the narrow dimension in
 * both, and the extra room a wide window has is extra room for the fall to happen in.
 */
export function placeAt(k, depth, W, H, out, tune) {
  const short = Math.min(W, H);
  const z = NEAR + depth * tune.gap;
  const scale = (short * 0.5) / z;
  // How far through its life this slice is. Zero where it was cut, one as it passes the eye.
  const age = (FAR - depth) / tune.life;
  // A fourth power, not a square, and the exponent is doing one specific job. `REACH` is fixed by
  // the departure — it has to beat the widest section the solid can make, or a slice never clears
  // the frame. Spend that reach evenly and every slice is already halfway to the corner by the time
  // it is big enough to look at, and the picture empties out. Held back and then spent almost all at
  // once, the same total drift lets a slice come most of the way down the train nearly on the axis
  // and then leave in a rush. Which is also what falling looks like.
  const drift = tune.reach * (0.10 * age + 0.90 * age ** tune.hold);
  // The frame's half-extents in world units. One of these is exactly one — the short edge — and the
  // other is however much longer the window is; that ratio is what aims the fall at the corner.
  const spanX = Math.min(LEAN, W / short);
  const spanY = Math.min(LEAN, H / short);
  out[0] = W * AXIS_X + (wanderX(k) * tune.wander + FALL_X * drift * spanX) * scale;
  out[1] = H * AXIS_Y + (wanderY(k) * tune.wander + FALL_Y * drift * spanY) * scale;
  out[2] = scale;
}
