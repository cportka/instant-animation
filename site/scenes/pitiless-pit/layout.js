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
export const pixelFor = (W, H, grain = 1) => Math.max(2, Math.round(Math.min(W, H) / (96 * grain)));

/** The screen scale of the ring at depth `u`: 1 is the frame edge, `MOUTH` is the lip of the pit. */
export const scaleAt = (u) => MOUTH * Math.exp(u * LOG_RATIO);

/** ...and the depth at which a ring is a given scale. The exact inverse, which several things need. */
export const depthAt = (s) => Math.log(s / MOUTH) / LOG_RATIO;

/** Where the frame edge falls, in depth. Negative, because the ground is above the mouth. */
export const U_EDGE = depthAt(1);

/** A little further out again, so nothing is ever seen arriving. */
export const U_TOP = U_EDGE - 1.4;

/**
 * How fast the grid sharpens with depth, as a multiple of the perspective ratio.
 *
 * Above 1 means the chunk shrinks **faster than the ring does**, which is the whole point: a band
 * twice as far down is not merely half the size, it is drawn in more than twice the detail.
 */
export const SHARPEN = 1.2;

/**
 * The chunk size at a given depth — and this is the one place this scene breaks its own rule.
 *
 * Everywhere else the grid is a constant: `S / 96`, coarse, the same at the top of the frame as at
 * the bottom, because that is what 8-bit means and a picture that quietly gets finer where it feels
 * like it is not obeying a constraint, it is decorating one.
 *
 * **The pit is the exception, and it is an exception with a reason.** Depth in this scene is the
 * only thing there is; the shaft recedes forever and the whole animation is about what happens to
 * things that go down it. So the grid goes down with them. Each band is drawn finer than the one
 * above it, faster than perspective alone would shrink it, until at the bottom a chunk is **one
 * device pixel** — the finest thing the screen can say — and the last square of the pit is drawn at
 * the display's own resolution rather than the picture's.
 *
 * It inverts what distance normally does, and that is what makes it read. Everything else in the
 * world gets coarser as it goes away; this gets *sharper*, so the bottom of the pit is the most
 * detailed thing on the screen and there is no depth at which looking harder stops rewarding you.
 * The rule that nothing is ever half a chunk over still holds, exactly — it is only that down there
 * the chunk has become the screen's own grid, so the two rules are the same rule.
 */
export function pxAt(u, px, finest, sharpen = SHARPEN) {
  if (u <= 0) return px;
  const fine = px * Math.exp(u * sharpen * LOG_RATIO);
  return fine < finest ? finest : fine;
}

/**
 * One device pixel, in the CSS pixels the scene draws in.
 *
 * The stage draws every scene in CSS pixels and puts the device-pixel-ratio scale on the context, so
 * a scene that wants to reach the screen's own grid has to ask how big the backing store is. This is
 * the only number in the animation that is about the display rather than about the picture.
 */
export function finestOf(ctx, W) {
  const wide = ctx.canvas ? ctx.canvas.width : 0;
  const scale = wide ? wide / W : 1;
  return 1 / (scale > 0 ? scale : 1);
}

/**
 * The depth at which even the finest chunk is wider than the ring, and the drawing stops.
 *
 * The series does not end here — nothing ends here. This is only the depth past which the picture
 * has run out of pixels to say anything with, which is a fact about the screen and not about the
 * pit. Sharpening the grid moves it a very long way down: the pit used to run out at about
 * twenty-three bands and now goes past forty, because every band it descends it also gains detail,
 * and the two only stop racing when the chunk hits the display's own resolution and can go no finer.
 */
export const bottomDepth = (W, H, finest) => depthAt((finest * 2) / Math.min(W, H));

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
