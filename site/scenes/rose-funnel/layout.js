// Where things stand in the frame, and how coarse they are drawn.
//
// These numbers used to live in whichever file happened to need them first: `funnel.js` had a
// `GROUND` and `sky.js` had a `HORIZON`, and both read 0.88 by agreement rather than by
// construction. They are one number about one plane — the ground the storm's foot stands on and the
// land meets — so the first person to nudge one would have left a bright seam with the tornado
// standing a few pixels below the ground it is standing on, and nothing would have said why.

/** The top of the funnel's reach — up inside the storm. */
export const TOP = 0.04;

/**
 * The ground plane: the horizon, the funnel's foot, and the temple's plinth.
 *
 * 0.86 rather than 0.88 because the band below it has to hold a treeline, the workshops, and
 * everything that lands. At 1440x900 the old number left 108px — under eight chunks on the
 * background grid — for all of it, which is a speckle strip rather than a landscape. It costs the
 * funnel two percent of its height, taken off the foot, which is the end that is about to be buried
 * in dust and building anyway.
 */
export const GROUND = 0.86;

/** The underside of the storm's solid roof. Nothing above this line is sky. */
export const CLOUD = 0.09;

/**
 * The chunk grid, off the short edge so the art is the same *coarseness* on a phone as on a monitor.
 * Deliberately about half the resolution of the shared grid: the brief's first word is "pixelated",
 * and at the gallery's usual chunk size that reads as a texture rather than as a decision.
 */
export const pixelFor = (S) => Math.max(3, Math.round(S / 132));

/**
 * ...and the grid everything *behind* the subject is drawn on: three chunks to the subject's one.
 *
 * It began as economics and stayed as art. A full-frame dithered ramp plus thirty churning cloud
 * lobes is the most expensive thing in the scene by a factor of two, and every 2D scan in it falls
 * to a ninth of its area at three chunks instead of one. But it also *reads* better: a coarser chunk
 * is the oldest depth cue in the medium, so the storm sits back behind the subject instead of
 * competing with it for the same plane. Both grids are multiples of the same chunk, so nothing
 * misaligns.
 *
 * This is the line that pays for everything standing in front of it.
 */
export const backPixel = (px) => px * 2;
