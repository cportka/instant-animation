// Two clocks, and the scene is built on the difference between them.
//
// "Every 1-2 minutes there is a complete stop to everything going down into the pit and the pit
// explodes forth pure white pixels." A complete stop is easy to describe and awkward to build,
// because this gallery forbids the obvious implementation. Nothing may hold state between frames:
// the render tests draw each scene at eight timestamps **out of order** and compare the two runs
// op for op, so a `paused` flag that gets set when an eruption starts and cleared when it ends is
// not a bug waiting to happen, it is a test failure waiting to be understood.
//
// So the pause is not an event that happens to the scene. It is a **second clock**.
//
// `flowAt(t)` is the time that has *flowed into the pit* by wall-clock `t`. It runs at one second
// per second, except during an eruption, when it does not run at all. Everything that descends is
// drawn from it and knows nothing about eruptions; everything about the eruption is drawn from `t`
// and knows nothing about the descent. Neither ever asks whether the other is happening.
//
// The join is what makes it work: `flowAt` is **continuous** and only its *derivative* jumps. The
// picture therefore has no discontinuity in it anywhere — every block, line and mote is exactly
// where it was a frame ago at the instant the stop begins, and exactly where it was a frame ago at
// the instant it ends. It simply stops, and then it simply starts.

/**
 * How often. Fixed, and it has to be — see `flowAt`.
 *
 * A hashed interval per round would be nicer and is not available: the flowed time is wall time
 * minus the eruptions that have already finished, and *that* is a closed form only while every
 * eruption is the same length. A varying one turns it into a sum over every round since zero, which
 * cannot be evaluated at an arbitrary `t` without walking there. What varies instead is everything
 * about how an eruption *looks*, which is hashed off its own index and costs nothing.
 */
export const PERIOD = 96;

/** ...and for how long. Long enough to stop being a flash and become a condition. */
export const ERUPT = 7.5;

/** The rise, at the start, and the recede, at the end. The middle is the flurry. */
export const SURGE = 1.6;
export const EBB = 2.4;

export function planClock(rng) {
  return { phase: rng.next(), seed: rng.range(0, 40) };
}

/**
 * Which eruption we are in or heading toward, how far into it, and whether it is happening.
 *
 * The epoch pattern this gallery uses everywhere: `n` names the round, everything about that round
 * is hashed off `n`, and it is computable at any `t` in any order with nothing stored.
 */
export function eruptionAt(t, plan) {
  const cycles = t / PERIOD + plan.phase;
  const n = Math.floor(cycles);
  const age = (cycles - n) * PERIOD;
  return { n, age, on: age < ERUPT };
}

/**
 * The time that has flowed into the pit — wall time with every eruption cut out of it.
 *
 * `n * ERUPT` removes the rounds already finished and `min(age, ERUPT)` removes however much of the
 * current one has elapsed. Between eruptions that second term is the whole constant `ERUPT` and the
 * expression is `t` minus a constant, so time runs normally; during one it grows exactly as fast as
 * `t` does and the two cancel, so time does not run at all.
 */
export function flowAt(t, plan) {
  const cycles = t / PERIOD + plan.phase;
  const n = Math.floor(cycles);
  const age = (cycles - n) * PERIOD;
  return t - n * ERUPT - (age < ERUPT ? age : ERUPT);
}

/**
 * How hard it is erupting, 0 to 1 — up fast, held, and drawn back down.
 *
 * Asymmetric on purpose. Something bursting out and something settling back are not the same shape,
 * and an envelope that rises and falls alike reads as a light on a dimmer rather than as a pressure
 * being released.
 */
export function surgeAt(age) {
  if (age <= 0 || age >= ERUPT) return 0;
  if (age < SURGE) return (age / SURGE) ** 0.45;
  if (age > ERUPT - EBB) return 1 - ((age - (ERUPT - EBB)) / EBB) ** 1.6;
  return 1;
}
