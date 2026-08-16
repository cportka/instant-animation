// Sixteen colours, and no way to get a seventeenth.
//
// Sixteen exactly, and it is counted rather than gestured at: two for the ground and its lip, five
// for the shaft, two for the traffic going down, six for the three things that fall in — a near and
// a far apiece — and white. `tests/pitiless-pit.test.js` draws the scene at four viewports across a
// hundred seconds and fails if a seventeenth ever reaches the canvas, because a palette that is only
// a claim in a comment is not a constraint, it is a preference.
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
//   surface picks one of these sixteen and that is the colour it is. Where the moon scene would
//   resolve a fraction between two steps, this one **rounds**, and where it would reach for a value
//   in between, this one has nothing to reach for.
//
// That constraint is why the palette has to carry meaning instead of range, and it does, in one
// rule: **the pit has no colour and the things falling into it do.** Everything structural here —
// the ground, the lip, the shaft, the lines, the motes — is one desaturated blue-grey axis. The only
// saturated colours in the picture belong to the blocks going down, and they are not blended,
// faded or tinted on the way: each one simply switches to its own darker twin once it is far enough
// in. The pit does not transform what it takes. It takes it.
//
// White appears nowhere. It is reserved, whole, for the thing that comes back up.

/** The plane you are standing on, and the lip you are standing at the edge of. */
export const GROUND = [40, 42, 50];
export const KERB = [66, 70, 82];

/**
 * The shaft, rim to depth. Five steps and they are **bands**, not a ramp.
 *
 * They are read by rounding a depth to an integer, so two neighbouring bands meet at a hard line and
 * that line is the drawing. A ramp resolved smoothly here would make a funnel; resolved by dither it
 * would make the moon's sea. Rounded, it makes a stack of rings, which is the only one of the three
 * that reads as a shaft with sides.
 */
export const SHAFT = [
  [72, 84, 116],
  [48, 56, 84],
  [30, 36, 58],
  [16, 20, 36],
  [6, 8, 16],
];

/** The lines that run in off the ground, and the loose pixels that follow them down. */
export const STREAK = [128, 142, 178];
export const MOTE = [96, 108, 140];

/**
 * The things that fall in — the only saturated colours in the frame.
 *
 * Two entries each rather than a fade: near, and far. An 8-bit machine had no way to dim a sprite,
 * so it swapped the sprite's colours for darker ones, and that hard switch partway down the shaft is
 * both the period-correct answer and the better-looking one. A block does not dissolve into the
 * dark; it is bright, and then it is dim, and then it is one chunk, and then it is not there.
 */
export const FALL = [
  [[206, 66, 70], [104, 34, 44]],
  [[74, 176, 166], [34, 88, 92]],
  [[218, 178, 66], [110, 88, 40]],
];

/**
 * Pure white, and it is the only thing in this palette that is not part of the picture.
 *
 * Nothing else in the scene is allowed near it — the brightest structural colour is the lip of the
 * pit, and that is a grey-blue two thirds of the way down. So when the pit stops swallowing and
 * throws white back out, it is not merely brighter than what was there. It is a colour the picture
 * has never contained.
 */
export const FLARE = [255, 255, 255];
