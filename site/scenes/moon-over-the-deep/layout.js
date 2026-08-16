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
 * The waterline in pixels, snapped to the fine grid — **the** waterline, asked for in one place.
 *
 * The sky and the sea both have to end and begin exactly here, and they are drawn on grids that are
 * a factor of three apart. Rounding the same fraction independently on each of them put the sky's
 * last row five pixels above the sea's first, and the page background showed through the gap as a
 * hard black rule across the horizon.
 */
export const waterlineAt = (H, px) => Math.round((H * HORIZON) / px) * px;

/**
 * How many chunks of water this scene will draw at a given grid, which is what a frame costs.
 *
 * Very nearly all of the frame is this number: the sea is drawn per chunk and everything else in
 * the picture is a rounding error beside it.
 */
const waterChunks = (W, H, px) =>
  Math.max(1, Math.ceil((H - waterlineAt(H, px)) / px)) * Math.max(1, Math.ceil(W / px));

/**
 * The most water chunks this scene is willing to draw, whatever shape the frame is.
 *
 * Set at what a 1440×900 window already asks for, because that is the size this scene was composed
 * and tuned at and it should come through untouched.
 */
const CHUNK_BUDGET = 30000;

/**
 * The chunk grid: off the short edge, then made coarser until the frame is affordable.
 *
 * Deliberately **finer than the older scenes**: the Rose Funnel is drawn at `S / 132` because its
 * first word is "pixelated" and it wants each chunk to be a visible decision. This one is at `S / 175`
 * — about three quarters that — because a long ramp resolved by dither needs enough chunks per step to
 * make the dither read as a value rather than as a checkerboard. Coarse chunks and deep ramps fight
 * each other; that is most of what separates the look of one machine from the next.
 *
 * **The short edge alone is not enough, and the reason is worth writing down.** It sounds like the
 * rule that keeps the art the same coarseness everywhere, and for the axis it measures it is. But the
 * chunk count is a product of *both* axes, and the horizon is a fraction of the **height** — so on a
 * tall frame the short edge is the width while almost all of the drawing is down the long side. A
 * 390×844 phone came out at forty-eight thousand water chunks against a 1440×900 monitor's thirty
 * thousand: sixty per cent more work, on the weakest hardware that runs this, for a picture nobody
 * would call more detailed.
 *
 * What that cost is not is a slow frame you can shrug at. The stage backs the render scale off when
 * frames run long and restores it after five good seconds, so a scene sitting near the threshold does
 * not degrade — it **oscillates**, and the picture visibly changes resolution every few seconds for
 * no reason the viewer can see. Staying inside a budget is what keeps the stage's hand off the dial.
 */
export function pixelFor(W, H, grain = 1) {
  let px = Math.max(2, Math.round(Math.min(W, H) / (175 * grain)));
  // The budget still applies whatever a knob asks for — it **moves** with the knob rather than being
  // overridden by it. Asking for a finer sea is a knob's business; a phone quietly drawing five
  // times the chunks because somebody dragged one is not, and an unbounded grain would walk straight
  // into the failure this ceiling exists for: a scene expensive enough to trip the stage's quality
  // drop, then cheap enough at the lower resolution to restore, forever.
  const budget = CHUNK_BUDGET * Math.min(2.4, Math.max(0.5, grain * grain));
  while (px < 24 && waterChunks(W, H, px) > budget) px += 1;
  return px;
}

/** ...and the grid the sky is drawn on: three chunks to the water's one. */
export const backPixel = (px, coarse = 3) => Math.max(px, Math.round(px * coarse));

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
