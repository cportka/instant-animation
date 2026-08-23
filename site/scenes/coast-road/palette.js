// Two nights, and a knob that runs between them.
//
// This is a **16-bit** scene, which in this gallery is a specific claim rather than a mood: flat
// steps with hard edges, ordered dither where two of them meet, and no smooth colour anywhere. So a
// palette here is a short ramp of exact values, and everything in the frame indexes one.
//
// What is unusual is that there are two of every ramp. *Beachside metropolis at night* is not one
// colour scheme — a coast city is indigo and teal on the seaward side and magenta and sodium where
// the strip is, and the interesting hour is the one where you cannot say which you are in. So the
// `neon` knob mixes every ramp between a **cool** night and a **hot** one, and mixes them all
// together: the sky, the water, the towers, the asphalt and the glow off the road all move at once,
// because a city lit differently is lit differently all the way down.
//
// **The rider does not move with it.** The gear is the same purple in every night, and that is a
// composition decision rather than an oversight: the subject of a side-scroller is the only thing
// that never leaves the frame, and if it changed colour with its surroundings there would be
// nothing in the picture to measure the surroundings against. The world is what changes. He rides
// through it.

import { clamp, lerp } from '../../lib/draw.js';

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const pad = (n) => (n < 16 ? `0${n.toString(16)}` : n.toString(16));
const str = ([r, g, b]) => `#${pad(Math.round(r))}${pad(Math.round(g))}${pad(Math.round(b))}`;

/** Mix two ramps of the same length, step for step. Every ramp here is built by this. */
const blend = (cool, hot, at) =>
  cool.map((c, i) => {
    const a = hex(c);
    const b = hex(hot[i]);
    return str([lerp(a[0], b[0], at), lerp(a[1], b[1], at), lerp(a[2], b[2], at)]);
  });

/* ----------------------------------------------------------------- ramps ---- */

// Every ramp runs **darkest first**, and every one of them is indexed by the same convention the
// rest of the gallery uses: a shape asks for a step, not for a colour. That is what lets the whole
// frame be re-lit by one number without a single call site knowing it happened.

/** The sky, zenith to horizon. The last step is the city's glow coming up off the water. */
const SKY_COOL = ['#050a24', '#0a1240', '#122058', '#1e2f74', '#2f4090', '#4a55a8', '#7d7fd0'];
const SKY_HOT = ['#12061e', '#230a36', '#3a1050', '#571866', '#7e2278', '#ac3a88', '#e2699a'];

/** The bay. Nearly black except where the moon is on it. */
const SEA_COOL = ['#03081c', '#06122f', '#0a1e4c', '#11386a', '#2c6f9e'];
const SEA_HOT = ['#0d0416', '#180a2a', '#281046', '#452066', '#7c3f88'];

/** The far skyline across the water. Three tower tones and the pinprick its windows are lit with. */
const CITY_COOL = ['#0a1038', '#141d52', '#1f2c6c', '#6d8fe0'];
const CITY_HOT = ['#160a2e', '#251142', '#381c5c', '#d474bc'];

/** The near blocks going by: two face tones, the seam between them, the parapet, and glass. */
const BUILD_COOL = ['#070c22', '#101a3e', '#1b2a56', '#2a3c70', '#456096', '#b0dcf4'];
const BUILD_HOT = ['#140820', '#231038', '#351a4e', '#4b2668', '#6e3a88', '#f4c6ea'];

/** The road, and the wet sheen on it. */
const ROAD_COOL = ['#090b1a', '#12162e', '#1c2242', '#2a3156', '#3f4872'];
const ROAD_HOT = ['#110a1a', '#1b112e', '#281a42', '#382654', '#4c386c'];

/** The palms, the sand, and whatever else is growing at the roadside. */
const LAND_COOL = ['#050a1c', '#0b1832', '#12294a', '#1d4260'];
const LAND_HOT = ['#0d0518', '#160c2a', '#241640', '#3a2456'];

/**
 * The signs, and they do **not** move with the knob.
 *
 * Neon is the one thing in a night city that is not lit by anything: it is the source. A tube full
 * of gas is the colour it is whatever the sky is doing, and shifting these with the rest would turn
 * the strip into a wash — the point of a sign is that it disagrees with everything around it.
 */
const NEON = ['#ff3f9a', '#3fe8e0', '#ffd24a', '#8f5cff', '#5cff9a', '#ff7a3f'];

/**
 * The rider's gear: seven steps of purple and a specular white above them.
 *
 * The longest ramp in the scene by some way, and it has to be. *Shiny* on hardware that cannot draw
 * a gradient is not a soft falloff — it is a **hard band two or three steps above the local tone**,
 * and a ramp with four steps in it has nowhere to put one. Seven leaves room for a lit side, a
 * turning side, a shadow side and a highlight that is unmistakably a highlight.
 */
const GEAR = ['#12081f', '#22103a', '#341a58', '#492678', '#63389c', '#8354c0', '#ab7ee0'];
const GLINT = ['#d0aef4', '#f4e6ff'];

/** Everything that is not lit by the night: rubber, steel, glass, and a tail light. */
const HARD = {
  tyre: '#08070e',
  tread: '#151424',
  rim: '#5a6280',
  chrome: '#8e9ac0',
  steel: '#3a4260',
  visor: '#4ff0e0',
  lamp: '#fff4d0',
  tail: '#ff2a3c',
  brake: '#ff6a50',
};

/**
 * The whole palette at a given point between the two nights.
 *
 * Built once a frame rather than once a mount, because `neon` is a knob and a knob is read every
 * frame. That is about forty small strings, against several thousand rectangles — it does not show
 * up in a profile, and paying for it is what lets the scene stay a pure function of its knobs.
 */
export function paletteAt(at) {
  const m = clamp(at, 0, 1);
  return {
    sky: blend(SKY_COOL, SKY_HOT, m),
    sea: blend(SEA_COOL, SEA_HOT, m),
    city: blend(CITY_COOL, CITY_HOT, m),
    build: blend(BUILD_COOL, BUILD_HOT, m),
    road: blend(ROAD_COOL, ROAD_HOT, m),
    land: blend(LAND_COOL, LAND_HOT, m),
    neon: NEON,
    gear: GEAR,
    glint: GLINT,
    hard: HARD,
    /** How far toward the hot night we are, for the few things that want the number itself. */
    heat: m,
  };
}
