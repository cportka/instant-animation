// Four ramps, twenty-six colours, and one relationship holding them together.
//
// This began as a single rose ramp, because the brief named three hues and no values and one line
// through colour space was the honest reading of it. Seven steps is enough to describe a tornado and
// nothing else — and the moment there was a temple, a forest, five crafts and four materials of
// debris in front of it, seven steps was not a discipline any more, it was a shortage. Everything
// had to be told apart by silhouette alone because value was fully spent, and a picture where value
// carries no information is an 8-bit picture whatever else is true of it.
//
// So the ramps are chosen as a **harmony**, not as a collection:
//
// - **SPIN** is the storm. Rose through magenta to plum — magenta, around 330°.
// - **JADE** is everything that grows or is glazed: the forest, and the temple's roof tiles. Around
//   165°, which is magenta's **complement** — the one relationship that gives the greatest possible
//   separation without either colour looking arbitrary, and the reason a green-tiled temple in front
//   of a rose tornado reads instantly as two different substances rather than as two shades.
// - **LAPIS** is the night the storm is standing in, and the shadow under everything. Around 225°,
//   sitting between the other two on the wheel, which is what stops the complement from being a
//   collision: a deep blue between rose and jade reads as the dark they both fall into.
// - **GOLD** is the accent, and it is rationed. Fire, the finial, the light inside glass — four
//   steps, used on a handful of chunks, because an accent spent widely is not an accent.
//
// The green-glazed roof is not only a colour decision. Fired ceramic tile really is what a temple of
// this kind is roofed in, so the one element carrying the complement is also the one whose material
// the scene keeps showing you being made in a kiln.

/** The storm. Hottest first; step 0 is the inside of the vortex where it is moving fastest. */
export const SPIN = [
  [255, 236, 246],
  [255, 176, 212],
  [250, 108, 164],
  [222, 52, 124],
  [162, 34, 118],
  [104, 28, 94],
  [58, 18, 62],
  [30, 10, 36],
];

/** Growing things, and glazed ceramic. Magenta's complement, so nothing here is ever mistaken for storm. */
export const JADE = [
  [226, 255, 240],
  [150, 244, 202],
  [78, 214, 172],
  [34, 168, 144],
  [24, 122, 116],
  [20, 80, 86],
  [14, 48, 58],
];

/** The night, and the shadow under everything. Between the other two, which is what keeps them civil. */
export const LAPIS = [
  [212, 228, 255],
  [140, 176, 255],
  [80, 118, 236],
  [48, 76, 190],
  [34, 52, 138],
  [24, 34, 92],
  [16, 22, 58],
  [10, 13, 36],
];

/** Fire, the finial, and the light inside glass. Four steps, and spent on very few chunks. */
export const GOLD = [
  [255, 248, 214],
  [255, 218, 128],
  [236, 164, 62],
  [172, 100, 34],
];

/**
 * The sky: deep lapis at the top falling into the storm's own rose at the horizon.
 *
 * Nine bands rather than six, and it runs across two ramps rather than staying inside one. That
 * crossing is what makes the tornado look *lit* — a rose funnel against a rose sky is a shape in a
 * field of its own colour, and the same funnel against a night that turns rose only where it meets
 * the ground has somewhere to be brightest against.
 */
export const SKY = [
  '#0a0d24', '#141a3c', '#1e2a5e', '#33306e', '#4d2f6e', '#6b3168', '#8c3a63', '#a8485f', '#c25a63',
];

/** The land: dark, cool, and green enough to be ground rather than more storm. */
export const EARTH = ['#152b30', '#1b3a3a', '#0d1c24'];

/** What the funnel tears off the ground — the brightest thing in the frame, and the only one. */
export const DUST = [255, 214, 232];
