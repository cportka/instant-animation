// The knobs: a live hand on the animation while it is running.
//
// Every scene here is a pure function of `t`. That is what lets the render tests draw eight
// timestamps out of order, what lets the stage hand a fresh instance somebody else's clock during a
// channel change, and what makes a poster frame possible at all. A control panel could easily have
// broken it — the obvious way to build one is to let a slider *do* something, and the moment a knob
// applies an impulse the scene has a history and none of the above works any more.
//
// So a knob is not an action. It is a **number that is part of the question**: a scene is a pure
// function of `t` *and of its knobs*, both of which are constant for the duration of a frame. Turn
// one and the same clock produces a different picture; turn it back and you get the old one exactly.
// Nothing integrates, nothing remembers, and every guarantee the gallery already relied on survives.
//
// The value bag is **mutated in place** rather than replaced, and that is the one piece of shared
// state here. The shell hands the same object to `create()` that the panel writes into, so turning a
// knob changes the next frame without re-mounting the scene — which matters, because re-mounting
// would restart the clock and a knob that restarts the animation is not a knob, it is a switch.

/** Where a knob sits until somebody moves it: the middle, which is the scene as it was designed. */
export const NEUTRAL = 0.5;

/** A fresh value bag for a scene's declared knobs, every one at its neutral. */
export function makeKnobs(meta) {
  const at = {};
  for (const knob of meta.knobs ?? []) at[knob.id] = NEUTRAL;
  return at;
}

/**
 * What a scene reads: whatever the shell handed `create()`, with every declared knob guaranteed
 * present and numeric.
 *
 * Scenes are built in three places that are not the shell — the render tests, the determinism
 * tests, and the poster path — and none of them knows what a knob is. Every one of those has to
 * draw the scene *as designed*, which is what filling the gaps with the neutral does.
 */
export function knobsFor(meta, given) {
  if (!given) return makeKnobs(meta);
  for (const knob of meta.knobs ?? []) {
    if (typeof given[knob.id] !== 'number' || !Number.isFinite(given[knob.id])) given[knob.id] = NEUTRAL;
  }
  return given;
}

/** Map a knob's 0..1 straight onto a range. For the few things that have no natural middle. */
export const span = (v, lo, hi) => lo + (hi - lo) * v;

/**
 * ...and the one nearly everything uses: a range that is **neutral in the middle**.
 *
 * `bend(v, lo, mid, hi)` gives `mid` at the default, `lo` at one end and `hi` at the other, with the
 * two halves interpolated separately. Two properties fall out of that and both are the point:
 *
 * - **A panel at its defaults is the scene as it shipped**, exactly, so nothing about the artwork is
 *   decided by the control that adjusts it. Reset is therefore a real answer rather than an
 *   approximation of one.
 * - **The two halves can mean different things.** A knob that drives four parameters can push two of
 *   them up and two of them down on the way to one end and do something else entirely on the way to
 *   the other, so turning it is a *gesture* rather than a volume control. That is what makes six
 *   knobs worth more than six sliders: each one is a direction the picture can be pushed in, not a
 *   parameter it happens to contain.
 */
export function bend(v, lo, mid, hi) {
  const at = v < 0 ? 0 : v > 1 ? 1 : v;
  return at < NEUTRAL ? lo + (mid - lo) * (at * 2) : mid + (hi - mid) * ((at - NEUTRAL) * 2);
}

/** A knob read as a switch: off below the middle, on above it. For the few that are a yes or a no. */
export const past = (v, at = NEUTRAL) => v > at;
