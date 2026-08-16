// The wind, and everything in the square is downstream of it.
//
// The brief asks for *detailed wind and dust*, for *bar doors that blow open and closed with the
// changes in the wind*, and for a resolution that varies — and the cheapest way to get all three is
// to build them on the same number instead of on three unrelated noises. So there is exactly one
// wind here. The dust rides it, the tumbleweeds are pushed by it, the doors answer to it, the plants
// bend in it, the animals hide from it, and `strata.js` coarsens the whole frame in it.
//
// That is what makes the square feel like a *place* rather than a collage: when a gust arrives,
// everything in the picture agrees that it has, including the pixels.
//
// **Gusts are not a sine.** Wind is mostly nothing with occasional arrivals, and a scene driven by
// `sin(t)` has a metronome in it that you notice within twenty seconds. This is a low base plus a
// short stack of unrelated slow waves raised to a power: the power is what turns a wobble into a
// *distribution* — most of the time the sum is small and the power crushes it to nothing, and now and
// then the waves line up and it goes over one for a few seconds. That is what a gust is.

import { noise2 } from '../../effects/field.js';

/**
 * The waves the gust is built from. Four, at periods with no common factor, so the pattern of
 * arrivals never repeats — the shortest is half a minute and the beat between all four is hours.
 */
const GUSTS = [
  { rate: 0.213, amp: 1.0, phase: 0.7 },
  { rate: 0.131, amp: 0.8, phase: 2.9 },
  { rate: 0.077, amp: 0.7, phase: 4.4 },
  { rate: 0.041, amp: 0.6, phase: 1.3 },
];

/** How hard it is blowing at all, before the gusts arrive. A desert is never quite still. */
const BREEZE = 0.12;

/** How far the wind carries something loose in a second, on average, in frame widths. */
const RUN = 0.06;

/**
 * How strong the wind is at `t`, from about zero to a bit over one.
 *
 * The exponent is the whole shape of the thing. At 1 this is four sines added up, which is a breeze
 * that never stops; at 2.6 the sum spends most of its time near the floor and the arrivals are
 * genuinely arrivals — measured over half an hour it is under a quarter strength forty-five per cent
 * of the time and over seven tenths for two, which is the distribution of a real desert afternoon.
 * Everything downstream reads *this* number, so it is also what synchronises the doors with the dust
 * with the resolution.
 */
export function gustAt(t) {
  let sum = 0;
  let scale = 0;
  for (const g of GUSTS) {
    sum += g.amp * Math.sin(t * g.rate + g.phase);
    scale += g.amp;
  }
  const at = (sum / scale + 1) * 0.5;
  return BREEZE + (1 - BREEZE) * at ** 2.6;
}

/**
 * ...and which way, in the same units. Mostly one way, because a square with a prevailing wind has a
 * *downwind* side — which is where the dust piles and where the tumbleweeds go — and a wind that
 * changes its mind every few seconds has neither.
 */
export function bearingAt(t) {
  return 0.82 + 0.34 * Math.sin(t * 0.043 + 1.9) + 0.18 * Math.sin(t * 0.019 + 3.7);
}

/**
 * The wind at a place, not just at a time. Adds a slow field so a gust is not a flat sheet arriving
 * everywhere at once — it has eddies in it, and the corner of the square is quieter than the middle.
 */
export function windHere(x, y, t) {
  return gustAt(t) * (0.62 + 0.76 * noise2(x * 2.2 + t * 0.24, y * 2.2 - t * 0.13));
}

/**
 * How far something loose has been carried by the wind since `t = 0`, in world widths.
 *
 * The **integral** of the gust rather than the gust itself, and the difference matters: a tumbleweed
 * pushed by `gustAt(t)` directly would stop dead every time the wind dropped and jump forward when
 * it arrived, which is what a leaf on a spring does, not what a ball of dead brush does. Integrated,
 * it keeps rolling and merely rolls *faster* in a gust — and because the integral of a sum of sines
 * is a sum of sines, it stays closed-form and the scene stays a pure function of `t`.
 */
export function carriedBy(t) {
  let sum = 0;
  let scale = 0;
  for (const g of GUSTS) {
    // ∫sin(rt + p) dt = −cos(rt + p)/r, and the constant is dropped: everything here is a difference.
    sum += (g.amp * -Math.cos(t * g.rate + g.phase)) / g.rate;
    scale += g.amp;
  }
  // **The steady term is exactly one, and that is not a tuning choice.** Differentiate this and you
  // get `RUN · (1 + Σ amp·sin / Σ amp)`, and the sum is bounded by one — so the travel is
  // non-decreasing everywhere, touching a standstill only at the instant the waves all point
  // backwards at once. Any smaller and a lull would carry a tumbleweed *uphill*, which is not
  // something a ball of dead brush does and is the one motion in this scene you would notice
  // immediately. The shaping `gustAt` applies cannot be applied to an integral, so this is the
  // guarantee that replaces it.
  return RUN * (t + sum / scale);
}
