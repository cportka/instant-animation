// Birth, death and re-birth — the clock the temple is torn apart and rebuilt on.
//
// Everything hard about this scene collapses into one conflict. Destruction has to be *caused* — the
// storm comes near and the eaves go — and causation is memory: a thing was struck, and it stays
// struck after the cause has moved on. But the render tests sample `t` out of order and compare the
// drawing operation for operation, so there is no memory to be had. Nothing may be integrated,
// latched or carried from one frame to the next.
//
// The resolution is that a latch is only forbidden if you have to *store* it. Every bay runs its own
// cycle, `cycles = t / period + phase`, and `n = floor(cycles)` is which time round it is — and this
// is the whole trick — **the wall-clock second that round began is available in closed form**:
//
//     began = (n - phase) * period
//
// So ask the storm where it was at `began`, roll a hash addressed by `(bay, n)`, and the verdict is
// causal (it read the funnel's real position), latched (it cannot change until `n` does), fresh every
// round, and computable at any `t` in any order. The funnel wandering off afterwards heals nothing,
// because nothing is ever re-asked.
//
// That one rule buys the rest of the brief nearly free. Rebuilding is slow because the rest of the
// round after a strike is long. The temple is never whole because the strike chance has a floor —
// the storm is always taking something. And it never restarts from a clean slate because the phases
// are hashed across the whole unit interval, so at `t = 0` every bay is already somewhere inside its
// own round: **there is no moment at which this building was ever new.** The seam cannot be seen
// because there is no seam. There is no global loop, only thirty incommensurable ones.
//
// It is the house pattern, one step further on. `above-the-fog`'s fireworks hash their properties off
// `(seed, n)`, and this scene's own lightning hashes its position off `n`. Here the epoch does not
// merely *seed* the event — it reads the world at its own start time to decide whether the event
// happens at all.

import { clamp, smoothstep } from '../../lib/draw.js';
import { hash2 } from '../../effects/field.js';
import { vortexAt } from './funnel.js';

/** How long a bay takes to come apart, lie in pieces, and be put back. */
const FALL = 0.55;
const GONE = 3.2;

/**
 * The chance a bay is taken when its round turns over with the storm nowhere near.
 *
 * It is a floor, not luck: without it the temple would stand whole every time the funnel wandered
 * off, and a building that is periodically perfect is a building on a timer rather than one under
 * siege. With it, something is always missing.
 */
const BASE = 0.08;

/**
 * The bays: the unit that is struck, falls, and is carried back.
 *
 * Not the storey — a storey blinking in and out is a lighthouse, not a building coming apart. Not the
 * chunk — four thousand independent clocks is a rash of static, and no single chunk is a thing anyone
 * could be seen to carry. A bay is one side of one storey's roof, or its wall: recognisably a part of
 * the building, and losing one is a wound rather than an amputation.
 */
export function planCycle(rng, storeys) {
  const bays = [];
  for (let i = 0; i < storeys; i += 1) {
    for (const part of ['eaveL', 'eaveR', 'wall']) {
      bays.push({
        // A dense index, which is the hash address. `part` is a word and two of the three words
        // are the same length — keyed on that, the two eaves of a storey would share a verdict and
        // always be taken together, which is a building losing its arms in pairs.
        key: bays.length,
        storey: i,
        part,
        // A continuous range, never a set of round numbers: periods that share factors drift into
        // step with each other and the building starts to pulse.
        period: 17 + rng.next() * 23,
        // Phase over the whole interval, which is what guarantees no bay is ever new — plus the
        // golden rotation by storey so successive storeys land maximally far apart on the circle
        // instead of peeling off the top in a visible wave.
        phase: (rng.next() * 0.72 + i * 0.6180339887) % 1,
        // How far it stands out into the wind. An eave is all exposure; a wall is sheltered behind
        // the roof below it, and this is the only reason the storm takes the ornament first.
        exposure: part === 'wall' ? 0.34 : 1,
        // ...and the higher it is, the more of the storm it is standing in.
        reach: 0.25 + (i / Math.max(1, storeys - 1)) * 0.75,
      });
    }
  }
  // ...and the sōrin, which is one bay of its own: it is the highest thing on the building and the
  // most exposed, so it is taken often and is the part most often seen being carried back up.
  bays.push({
    key: bays.length,
    storey: storeys, part: 'spire',
    period: 21 + rng.next() * 17,
    phase: (rng.next() * 0.72 + storeys * 0.6180339887) % 1,
    exposure: 1,
    reach: 1,
  });
  return { bays, seed: rng.range(0, 40) };
}

/**
 * What is left of a bay, and where it is in its round.
 *
 * `life` runs 1 (whole) to 0 (gone). `struck` says the storm took it this round; `age` is seconds
 * since that round began, which is what the debris flies on.
 */
export function bayAt(bay, x, t, W, H, funnel, seed) {
  const cycles = t / bay.period + bay.phase;
  const n = Math.floor(cycles);
  // The second this round began — exact, possibly negative, and correct either way.
  const began = (n - bay.phase) * bay.period;
  const age = (cycles - n) * bay.period;

  // Where the storm was *then*. Sampling it at `t` instead would make destruction a function of
  // where the funnel is now, so the temple would heal the instant it wandered — splinters flying
  // home, the tape running backwards.
  const { cx, r, wind } = vortexAt(W, H, began, funnel, bay.reach * 0.7);
  // Measured against the **wind field**, not the wall. Most of what a tornado does, it does to things
  // it never touches — so a storm passing near the temple strips it without the column ever crossing
  // it, and the destruction has a reach that matches the streaks you can see blowing past.
  const near = 1 - smoothstep(r * 0.5, wind, Math.abs(x - cx));
  const bite = Math.max(BASE, near) * bay.exposure * bay.reach;
  const struck = hash2(bay.key * 3.1 + 0.7, n + seed) < bite;

  if (!struck) return { life: 1, struck: false, age, n, began };

  let life;
  if (age < FALL) life = 1 - age / FALL;
  else if (age < FALL + GONE) life = 0;
  // ...and then the hands bring it back, over whatever is left of the round. Rebuilding is slow
  // because it is the *rest* of the cycle: coming apart takes half a second and being put back takes
  // most of a minute, which is the ratio the brief is about.
  else life = smoothstep(0, 1, (age - FALL - GONE) / Math.max(1, bay.period - FALL - GONE));

  return { life: clamp(life, 0, 1), struck: true, age, n, began };
}
