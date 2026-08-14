// One ramp, seven steps, and everything in the scene is drawn out of it.
//
// The brief names three hues and no values — "reds, pinks and purples" — so the ramp is the *whole*
// design decision here, and it is built as a single line through colour space rather than as three
// families that happen to sit near each other. It runs from a near-white rose at the hot end down
// through pink, rose, magenta and violet to a near-black plum, and because every step is on the same
// line, any two of them next to each other look like the same material at two brightnesses instead
// of like two different colours meeting.
//
// Seven steps and no interpolation anywhere. A ramp read continuously is a gradient, and a gradient
// is what pixel art is defined by not having: the bands *are* the picture, and they only read as
// bands if there is a hard edge between them.

/** Hottest first. Index 0 is the inside of the funnel where it is moving fastest. */
export const SPIN = [
  [255, 232, 244],
  [255, 158, 200],
  [246, 84, 146],
  [206, 34, 110],
  [140, 28, 116],
  [78, 22, 86],
  [38, 14, 48],
];

/** The sky behind it: the same line, continued past the dark end into a storm. */
export const SKY = ['#2a1038', '#3a1444', '#4a1a4c', '#5e2352', '#7a3059', '#9c4363'];

/** The ground it is standing on, and the dust it has torn off it. */
export const EARTH = ['#2c1230', '#3a1838', '#1d0c22'];
export const DUST = [255, 176, 208];
