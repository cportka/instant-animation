// The shaft's one coordinate, and the arithmetic that turns it into a picture.
//
// Everything in this scene lives at a **depth** `u`. Zero is the mouth of the pit, negative is out
// on the ground around it, and positive goes down. There is no second coordinate for height and no
// camera: the view is straight down the hole, so depth and screen size are the same fact.
//
// **The pit is a geometric series, and that is the whole of why it has no bottom.** A ring at depth
// `u` is drawn at scale `RATIO ** u`, so every step down is the same *proportion* smaller as the one
// before it rather than the same number of pixels. That is what perspective actually does, and it
// has a consequence worth stating plainly: the sequence never reaches zero. However far you follow
// it there is another ring, smaller, and the only thing that ever stops the drawing is a ring
// becoming narrower than one chunk. Nothing is at the bottom because there is no bottom to be at.
//
// It also makes the descent free of seams. Because the spacing is a constant ratio, sliding the
// whole pattern one unit deeper leaves it *identical* — so the bands can march down forever and
// nothing ever has to be created, destroyed, or wrapped around where anyone can see it.

export const MOUTH = 0.62;

/**
 * How much smaller each step down is. Not a free parameter as much as it looks.
 *
 * Near 1 the shaft is a smooth funnel with no readable structure and the descent turns into a slow
 * crawl of nearly-identical rectangles. Much below this and each band is enormously smaller than the
 * one outside it, the tunnel bottoms out within four or five rings, and the pit reads as a shallow
 * box rather than as something that keeps going.
 */
export const RATIO = 0.86;

const LOG_RATIO = Math.log(RATIO);

/**
 * The chunk grid, and it is **coarse**.
 *
 * This scene is 8-bit and the whole claim rests here. The Rose Funnel is at `S / 132` and the moon
 * at `S / 175`; this one is at `S / 96`, which is a chunk half again as wide as the funnel's and
 * nearly twice the moon's. That is not "the same art, bigger pixels" — it is a different budget, and
 * the palette and the total ban on dither downstream are the rest of the same decision. An 8-bit
 * machine had few pixels and few colours and could blend neither, and a picture that observes one of
 * those constraints while quietly breaking the other two just looks like a mistake.
 */
export const pixelFor = (W, H) => Math.max(3, Math.round(Math.min(W, H) / 96));

/** The screen scale of the ring at depth `u`: 1 is the frame edge, `MOUTH` is the lip of the pit. */
export const scaleAt = (u) => MOUTH * Math.exp(u * LOG_RATIO);

/** ...and the depth at which a ring is a given scale. The exact inverse, which several things need. */
export const depthAt = (s) => Math.log(s / MOUTH) / LOG_RATIO;

/** Where the frame edge falls, in depth. Negative, because the ground is above the mouth. */
export const U_EDGE = depthAt(1);

/** A little further out again, so nothing is ever seen arriving. */
export const U_TOP = U_EDGE - 1.4;

/**
 * The depth at which a ring is narrower than one chunk, and the drawing stops.
 *
 * The series does not end here — nothing ends here. This is only the depth past which the picture
 * has run out of pixels to say anything with, which is a fact about the screen and not about the pit.
 */
export const bottomDepth = (W, H, px) => depthAt((px * 2) / Math.min(W, H));

/**
 * A point on the unit ring: `p` runs 0 to 1 once around the rectangle, starting at the top-left
 * corner and going clockwise.
 *
 * The rings are **similar to the frame**, not circles, which is what lets the outermost one be the
 * frame edge exactly — so a thing travelling down starts at the border of the picture rather than
 * appearing out of a circle inscribed in it. It also means a line of constant `p` is a straight ray
 * through the centre, because the point simply scales: everything that travels down the pit travels
 * in a straight line on screen, and none of it needs a curve fitted to it.
 */
export function edgeOf(p, out) {
  const q = (p - Math.floor(p)) * 4;
  const side = q | 0;
  const f = (q - side) * 2 - 1;
  if (side === 0) { out[0] = f; out[1] = -1; } else if (side === 1) { out[0] = 1; out[1] = f; } else if (side === 2) { out[0] = -f; out[1] = 1; } else { out[0] = -1; out[1] = -f; }
  return out;
}

/** Snap to the chunk grid. Everything in this scene is snapped; nothing is ever half a chunk over. */
export const snapTo = (v, px) => Math.round(v / px) * px;
