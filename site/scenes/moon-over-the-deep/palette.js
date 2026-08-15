// Five ramps, forty-one colours, and one rule about how they are used.
//
// This scene is **32-bit**, and that is a technical claim rather than a mood. The Rose Funnel is
// 16-bit and says so by construction: seven steps, hard edges between them, and an explicit ban on
// interpolation — "a ramp read continuously *is* a gradient, and a gradient is the thing pixel art is
// defined by not having". Every value in that picture is one of seven.
//
// A generation later the constraint that mattered was different. The chunk grid stayed, the palette
// stopped being the scarce thing, and what a 32-bit machine could suddenly afford was **depth in a
// single hue** — ten or twelve steps down one line through colour space, close enough together that
// the eye reads the sequence as a surface curving away rather than as a set of bands. So the ramps
// here are long and finely spaced, and `shadeAt` resolves the space *between* two neighbouring steps
// with the same ordered dither the older scenes use to make texture. Same tool, opposite job: there
// it breaks a surface up, here it joins two steps together.
//
// The other half of the brief is **stark**, and starkness is a distribution rather than a palette.
// Nearly everything in frame sits in the bottom third of these ramps; the moon and the path it lays
// on the water sit at the very top; almost nothing is in the middle. That is why a night this dark
// does not read as murky — there is no murk, there is black water and there is white light on it.

/** The sky, from the top of the frame down to the horizon. Eight steps and none of them bright. */
export const NIGHT = [
  [3, 4, 12],
  [5, 7, 19],
  [7, 11, 28],
  [10, 16, 39],
  [14, 22, 51],
  [19, 29, 65],
  [24, 37, 79],
  [30, 45, 92],
];

/**
 * The water. Ten steps, and the reason there are ten.
 *
 * A sea is one colour lit at a thousand angles, so it is the surface in this scene with the most
 * *value* to describe and the least *hue* to describe it with. Ten steps down one blue is what buys
 * a swell that reads as a swell — the far face of a wave a step down from the near face, and the
 * trough two steps under both — where seven would have made each wave a stripe.
 */
export const SEA = [
  [1, 2, 10],
  [3, 6, 22],
  [5, 10, 34],
  [8, 16, 47],
  [11, 22, 60],
  [16, 30, 75],
  [22, 39, 92],
  [30, 50, 109],
  [42, 65, 132],
  [58, 83, 156],
];

/**
 * The moon. Six steps from paper white down to a cold grey.
 *
 * It is the brightest thing in the gallery and the only object in this scene allowed above the sea's
 * top step — which is the whole of why it reads as a light source rather than as a white disc.
 */
export const MOON = [
  [255, 255, 255],
  [242, 246, 255],
  [220, 230, 251],
  [194, 210, 242],
  [163, 183, 228],
  [130, 150, 204],
];

/**
 * The path the moon lays on the water — its own ramp, not the moon's and not the sea's.
 *
 * A glint is neither: it is the moon *seen in* the water, so it starts a shade under the moon and
 * ends a shade over the sea, and having its own six steps is what lets the path fade into the swell
 * instead of stopping at an edge.
 */
export const PATH = [
  [255, 255, 255],
  [234, 242, 255],
  [207, 224, 251],
  [169, 194, 239],
  [125, 155, 216],
  [82, 112, 180],
];

/**
 * Whatever is down there. Five steps of a cold green, and the only hue in the picture.
 *
 * Everything else in frame is on one blue axis, so a second hue is the loudest thing the palette can
 * possibly do — which is exactly right for something that happens once in a while and should stop
 * you when it does. Green rather than a warmer colour because warmth would read as a lamp, a boat,
 * somebody signalling; a cold green reads as *alive*, and nobody put it there.
 */
export const DEEP = [
  [184, 255, 232],
  [111, 230, 200],
  [56, 185, 162],
  [29, 125, 116],
  [17, 74, 76],
];

/** The island, and the one step of moonlight that finds its ridge. */
export const LAND = [2, 3, 11];
export const LAND_RIM = [36, 52, 89];
