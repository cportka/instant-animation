// The thing being cut.
//
// There is one solid. It is a bored heptagonal column that swells, narrows, twists and wanders, and
// every slice on screen is a **cross-section of it at one place along its length** — so the shape of
// slice `k` is a function of `k` and of nothing else. That is the whole reason the picture reads as
// an object rather than as a shuffle of unrelated cards: two neighbouring slices are two cuts a
// finger's width apart through the same lump, so they are nearly the same shape, and the sequence of
// them is the lump.
//
// Every parameter below is therefore a slow function of `k` — slow enough that no single step along
// the train changes much, fast enough that the length of it you can see is never the same twice. The
// frequencies are all mutually irrational-ish multiples, so the solid never repeats itself: the
// shortest of them takes forty slices to come round, which is a hundred seconds, and the beat
// between them is far longer than anybody watches.
//
// **Seven sides**, and odd on purpose. An even polygon has every edge parallel to the one opposite,
// which under rotation gives a shape that keeps agreeing with itself — it looks like it snaps to
// angles. Seven never does.

import { TAU } from '../../lib/draw.js';

/** Sides of the section. Odd, so nothing in it is ever parallel to anything else in it. */
export const SIDES = 7;

/** Radians of twist per slice. Over the length you can see, most of a quarter turn. */
const TWIST = 0.088;

/** The section's half-size, in world units — a world unit being half the frame's short edge. */
const GIRTH = 1.05;

/**
 * The golden angle, used to step *between vertices* rather than around the section.
 *
 * The wobble that makes a vertex long or short is a wave in a coordinate that advances by this much
 * per vertex, so no two vertices of a heptagon ever sit at the same place on it and no vertex agrees
 * with its neighbour. Step by anything that divides the ring instead — a half, a third — and the
 * section comes out with mirror symmetry, which reads as a logo.
 */
const FACE = 2.39996323;

/** How far a vertex may be pulled in: full length down to this fraction of it. */
const PULL = 0.62;

/** Write slice `k`'s outer section into `out` as `x, y, x, y…` in world units. */
export function sectionAt(k, out) {
  const girth = GIRTH * (1 + 0.20 * Math.sin(k * 0.17 + 0.6) + 0.12 * Math.sin(k * 0.29 + 3.1));
  const spin = k * TWIST + 0.34 * Math.sin(k * 0.11 + 1.7);
  // One axis of the section stretched against the other, drifting. Combined with the spin this is a
  // shear the polygon cannot undo by turning, so the solid reads as *deformed* along its length
  // rather than merely rotated — a column that has been pulled as well as wound.
  const squash = 1 + 0.24 * Math.sin(k * 0.23 + 2.0);

  for (let j = 0; j < SIDES; j += 1) {
    const face = j * FACE;
    const wob = 0.5 + 0.5 * (0.62 * Math.sin(face + k * 0.27) + 0.38 * Math.sin(face * 2.1 - k * 0.17 + 2.4));
    const r = girth * (PULL + (1 - PULL) * wob);
    const a = spin + (j / SIDES) * TAU;
    out[j * 2] = Math.cos(a) * r;
    out[j * 2 + 1] = Math.sin(a) * r * squash;
  }
}

/**
 * ...and the bore through it, written into `out` the same way.
 *
 * Every vertex of the bore is a fraction of the way out to the section vertex in the **same
 * direction**, and it is worth being clear that this is a containment proof rather than a
 * convenience. `scanFill` fills by the even-odd rule, so a hole is a hole only while it is *inside*
 * the ring around it; let one corner of the bore cross a short side of the section and the picture
 * grows a solid lobe hanging off the edge, which reads as a broken renderer rather than as a shape.
 *
 * Pulled in along the same rays, it cannot. Each bore edge is a convex combination of two points
 * that lie on the segments from the centre out to the section's own vertices, so it lies inside the
 * triangle those two segments span, and the section — star-shaped about its centre — contains every
 * such triangle. The fractions may then be anything below one, which is what lets the hole run all
 * the way from a pinhole to a thin shell. An independently rotated or *offset* bore has no such
 * argument and would have to be kept small enough to be dull.
 *
 * The fractions vary around the ring on their own frequency, so the wall is more than twice as thick
 * on one side as the other and the channel does not read as concentric. That eccentricity, not an
 * offset, is what stops a slice looking like a washer.
 */
export function boreAt(k, section, out) {
  const shrink = 0.46 + 0.26 * Math.sin(k * 0.19 + 0.9);

  for (let j = 0; j < SIDES; j += 1) {
    const face = j * FACE;
    const wob = shrink * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(face * 1.6 + k * 0.21 + 1.1)));
    out[j * 2] = section[j * 2] * wob;
    out[j * 2 + 1] = section[j * 2 + 1] * wob;
  }
}
