// Thirty-two colours, and no way to get a thirty-third.
//
// It was sixteen, which is what a C64 had. Thirty-two is what a Master System had, and the NES could
// put twenty-five of its fifty-four on screen at once — so the number moved and the *constraint* did
// not, which is the only thing that matters here. A fixed table, no blending, no dither, and a
// surface picks one entry and is that colour. Doubling the table buys a ground that can be crawling
// with things that are not all the same colour; it does not buy a gradient, and there is still no
// way to ask for a colour that is not on this page.
//
// Counted rather than gestured at: two for the ground and its lip, seven for the shaft, two for the
// traffic going down, twelve for the six things that fall in — a near and a far apiece — eight for
// the things crawling on the ground, and white. `tests/pitiless-pit.test.js` draws the scene at four
// viewports across two minutes and fails if a thirty-third ever reaches the canvas, because a palette
// that is only a claim in a comment is not a constraint, it is a preference.
//
// This scene is **8-bit**, and in this gallery that is a claim about arithmetic rather than about
// mood. The other two pixel scenes are the same idea at different budgets, and it is worth having
// all three in one place because the difference between them is the entire point:
//
// - **The Rose Funnel is 16-bit.** Seven steps a surface, hard edges between them, and interpolation
//   banned — a ramp read continuously *is* a gradient, and a gradient is the thing pixel art is
//   defined by not having.
// - **Moon Over the Deep is 32-bit.** Ten steps down one hue, close enough together that ordered
//   dither *joins* two of them into an apparent value that is not in the palette at all.
// - **This is 8-bit, and it does neither.** There is no ramp to walk and there is no dither. A
//   surface picks one of these thirty-two and that is the colour it is. Where the moon scene would
//   resolve a fraction between two steps, this one **rounds**, and where it would reach for a value
//   in between, this one has nothing to reach for.
//
// That constraint is why the palette has to carry meaning instead of range, and it still does, in
// one rule: **the pit has no colour and everything else does.** The hole and the plane it is in —
// the ground, the lip, the shaft, the lines, the motes — are one desaturated blue-grey axis, and
// nothing about the pit itself ever leaves it. Every hue in the picture belongs to something the pit
// has not taken yet: the blocks falling in, and the crawlers on the border. Neither is blended,
// faded or tinted on the way down; a block simply switches to its own darker twin once it is far
// enough in. The pit does not transform what it takes. It takes it.
//
// White appears nowhere. It is reserved, whole, for the thing that comes back up.

/**
 * The plane you are standing on, and the lip you are standing at the edge of.
 *
 * **The lip is now the brightest structural thing in the picture and the ground is the darkest**,
 * and the two of them meeting is most of what the word *foreboding* buys. A pale hard rim around a
 * black hole is a different object from a grey rim around a grey hole: the eye reads the rim as an
 * edge you could stand on and the dark inside it as something that goes down a long way, and it does
 * that on contrast alone without anything being drawn. The ground went darker at the same time and
 * for the same reason — it has things crawling on it now, and they need somewhere to be seen.
 */
export const GROUND = [24, 24, 30];
export const KERB = [148, 156, 176];

/**
 * The shaft, rim to depth. Seven steps, and they are **bands**, not a ramp.
 *
 * They are read by rounding a depth to an integer, so two neighbouring bands meet at a hard line and
 * that line is the drawing. A ramp resolved smoothly here would make a funnel; resolved by dither it
 * would make the moon's sea. Rounded, it makes a stack of rings, which is the only one of the three
 * that reads as a shaft with sides.
 *
 * **Seven steps now, each about a third darker than the last, and the hue turns on the way down.**
 * The first of them is already a long way below the lip, which is deliberate and is most of the
 * contrast: a ring's *area* goes as the square of its scale, so the outermost bands are almost all
 * of the pit by the time you measure it in pixels. Start the ramp anywhere near the lip's brightness
 * and three quarters of the hole is pale however steeply the rest of it falls — which is what the
 * first two attempts at this looked like, a bright picture frame with a dark stamp in the middle.
 * The drop from lip to first band is the largest single step in the palette for that reason.
 * Both halves of that are the foreboding. The steps used to fall gently and stay the same blue-grey
 * the whole way, which made the shaft read as a corridor that happened to be unlit; falling this
 * steeply it reads as something that swallows light, because each band is visibly a large fraction
 * of the one outside it rather than a shade off it. And the hue walks from a cold steel at the rim
 * through a bruised indigo into a red-violet that is very nearly black — so going down is not only
 * getting darker, it is getting *warmer in the wrong way*, which is the difference between a dark
 * place and a place you would not go.
 */
export const SHAFT = [
  [78, 84, 112],
  [52, 54, 82],
  [33, 32, 58],
  [20, 17, 40],
  [12, 8, 24],
  [6, 3, 12],
  [1, 1, 4],
];

/** The lines that run in off the ground, and the loose pixels that follow them down. */
export const STREAK = [176, 186, 214];
export const MOTE = [104, 114, 148];

/**
 * The things that fall in — the only saturated colours in the frame.
 *
 * Two entries each rather than a fade: near, and far. An 8-bit machine had no way to dim a sprite,
 * so it swapped the sprite's colours for darker ones, and that hard switch partway down the shaft is
 * both the period-correct answer and the better-looking one. A block does not dissolve into the
 * dark; it is bright, and then it is dim, and then it is one chunk, and then it is not there.
 */
export const FALL = [
  [[214, 62, 66], [104, 30, 40]],
  [[64, 186, 172], [28, 90, 92]],
  [[228, 182, 62], [112, 88, 36]],
  [[176, 88, 210], [84, 40, 106]],
  [[92, 210, 96], [40, 100, 50]],
  [[240, 128, 48], [116, 60, 26]],
];

/**
 * The things crawling on the ground, which are the only population in this scene that is not going
 * anywhere in a hurry.
 *
 * Eight, and pitched **between** the ground and the things that fall in: brighter than the plane so
 * they are legible on it, and much duller than the blocks so they never compete with them. That gap
 * is doing the composition. The blocks are events — a thing arrives, falls, and is destroyed — and
 * they have to stay the loudest colours in the frame; the crawlers are a *condition*, something the
 * border is simply covered in, and a condition that shouts is an event.
 *
 * Eight different hues rather than eight steps of one, because the whole point of them is that they
 * are not all the same thing.
 */
export const CRAWL = [
  [88, 96, 118],
  [116, 92, 124],
  [78, 110, 106],
  [126, 104, 78],
  [98, 84, 132],
  [70, 118, 128],
  [132, 88, 92],
  [104, 118, 82],
];

/**
 * Pure white, and it is the only thing in this palette that is not part of the picture.
 *
 * Nothing else in the scene is allowed near it. The lip is the brightest thing the picture ever
 * holds and it is still a grey-blue well short of white — deliberately so, because the lip got much
 * brighter in the same round the shaft got darker, and the one thing that could not be allowed to
 * happen was the rim creeping close enough to white to spend it. So when the pit stops swallowing
 * and throws white back out, it is not merely brighter than what was there. It is a colour the
 * picture has never contained.
 */
export const FLARE = [255, 255, 255];
