// Where the horizon is, how coarse the art is, and the one function the whole scene is drawn with.

import { bayerOn } from '../../effects/pixel.js';

/**
 * The waterline.
 *
 * Low, and the composition depends on it. The moon is the subject but the *path* is the animation —
 * the broken column of light the swell makes underneath it — and that path needs room to widen as it
 * comes toward you. Put the horizon at the middle and the path is a stub; at 0.42 the water is most
 * of the frame and the moon sits in a wide, almost empty sky, which is also what "stark" asks for.
 */
export const HORIZON = 0.42;

/**
 * The chunk grid, off the short edge so the art is the same coarseness on a phone as on a monitor.
 *
 * Deliberately **finer than the older scenes**: the Rose Funnel is drawn at `S / 132` because its
 * first word is "pixelated" and it wants each chunk to be a visible decision. This one is at `S / 175`
 * — about three quarters that — because a long ramp resolved by dither needs enough chunks per step to
 * make the dither read as a value rather than as a checkerboard. Coarse chunks and deep ramps fight
 * each other; that is most of what separates the look of one machine from the next.
 */
export const pixelFor = (S) => Math.max(2, Math.round(S / 175));

/**
 * The waterline in pixels, snapped to the fine grid — **the** waterline, asked for in one place.
 *
 * The sky and the sea both have to end and begin exactly here, and they are drawn on grids that are
 * a factor of three apart. Rounding the same fraction independently on each of them put the sky's
 * last row five pixels above the sea's first, and the page background showed through the gap as a
 * hard black rule across the horizon.
 */
export const waterlineAt = (H, px) => Math.round((H * HORIZON) / px) * px;

/** ...and the grid the sky is drawn on: three chunks to the water's one. */
export const backPixel = (px) => px * 3;

/**
 * **The scene in one function.** Pick a ramp step, given a continuous position along the ramp.
 *
 * `level` is a float index. The integer part is the step; the fraction is resolved by an ordered
 * dither against the chunk's own grid position, so a surface that wants to sit two thirds of the way
 * between step 4 and step 5 gets a stable two-thirds mix of the two — an apparent value that is not
 * in the palette at all.
 *
 * Every surface in this scene is drawn this way, which is what makes it one picture: the sky's fall
 * to the horizon, the curve of the moon's limb, the face of every swell and the fade of the glow
 * from below are all the same operation with a different `level`. Nothing here picks a colour; it
 * picks a *height* on a ramp and this decides what that means.
 */
export function shadeAt(level, col, row, steps) {
  const capped = level < 0 ? 0 : level > steps - 1 ? steps - 1 : level;
  const base = Math.floor(capped);
  if (base >= steps - 1) return steps - 1;
  return bayerOn(col, row, capped - base) ? base + 1 : base;
}
