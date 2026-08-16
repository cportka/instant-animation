// When it goes wrong.
//
// A glitch is the easiest thing in this gallery to do badly, because the obvious implementation is
// "randomise something every frame" and that is not a glitch — it is noise, and noise reads as a
// texture rather than as a fault. What makes a fault legible is that it **latches**: something is
// wrong, it stays exactly that wrong for a moment, and then it is not wrong any more. So every
// corruption here is an epoch — it has an index, everything about it is hashed off that index, and
// for the length of the burst it does not change its mind.
//
// **They are 8-bit faults, because this is an 8-bit picture.** That is not decoration; it is the
// same argument as the palette and the grid. The failures a machine of that generation actually had
// are specific and they look like nothing else:
//
// - **attribute clash** — colour stored per cell rather than per pixel, so a sprite crossing a cell
//   boundary drags the wrong colour in with it and wears it until it leaves;
// - **a torn tile row** — one row of a character read from the wrong address, so it sits a couple of
//   cells off from the rest of the sprite while the other rows are fine;
// - **sprite dropout** — more sprites on a scanline than the hardware could multiplex, so some are
//   simply not drawn on alternate frames and the picture flickers rather than dims;
// - **a torn raster** — the beam displaced sideways for a band of scanlines, which corrupts a stripe
//   of the *screen* rather than any object on it.
//
// The first three belong to the fall, because the things falling in are sprites. The last belongs to
// the eruption, because that is the whole signal coming apart rather than one object misbehaving.
//
// And all of it is a pure function of a clock, like everything else here — which matters more than
// usual, because the fall's corruptions run on the **flowed** clock. When the pit stops taking, the
// glitches stop too. Even the faults are held still.

import { hash2 } from '../../effects/field.js';

/**
 * A latched corruption, or `null` when the thing is behaving.
 *
 * `key` spreads objects across the cycle so they do not all break at once, `period` is how often one
 * is due, and `burst` is how long it lasts. Everything a caller wants to know about *this* fault it
 * hashes off `g`, which is constant for the whole burst — that constancy is the entire point.
 */
export function corruptAt(clock, key, period, burst) {
  const cycles = clock / period + key;
  const g = Math.floor(cycles);
  const age = (cycles - g) * period;
  if (age >= burst) return null;
  return { g, age, at: age / burst };
}

/**
 * Whether a dropping-out sprite is drawn this instant.
 *
 * Irregular rather than alternating. A clean on-off at a fixed rate is a strobe, and a strobe reads
 * as something the picture is *doing*; a hashed pattern at the same rate reads as something failing
 * to happen, which is the difference between an effect and a fault.
 */
export function flickerOn(g, age, rate = 15) {
  return hash2(g * 2.7 + Math.floor(age * rate), 31) > 0.42;
}

/** How many horizontal bands the raster tears into, and how far one slides at full pressure. */
export const TEAR_BANDS = 15;
export const TEAR_SLIDE = 22;

/**
 * How far this row of the screen is displaced sideways, in whole chunks.
 *
 * The raster fault, and the one that belongs to the eruption. It is **screen space** — it does not
 * know or care what is being drawn through it, which is what separates a broken signal from a broken
 * object. Most bands are untouched at any instant; the ones that are not hold their offset until the
 * next tick, so the tear reads as a sequence of states rather than as a shimmer.
 *
 * **Everything in a band has to move together, and that is the whole reason this is shared.** Slid on
 * its own, a field of scattered white pixels is not visibly torn at all: translate scattered points
 * and you get scattered points, which is exactly what the first attempt looked like. What makes a
 * tear legible is a hard *edge* crossing the band boundary and coming out somewhere else — so the
 * shaft's rings are sliced along these same bands and shifted by this same amount. One function, two
 * callers, and they cannot drift apart.
 */
export function tearAt(y, t, H, strength, px) {
  const band = Math.floor((y / H) * TEAR_BANDS);
  const tick = Math.floor(t * 7);
  if (hash2(band * 3.7 + tick * 1.9, 29) > 0.34) return 0;
  return Math.round((hash2(band * 5.3 + tick * 2.3, 37) - 0.5) * strength) * px;
}
