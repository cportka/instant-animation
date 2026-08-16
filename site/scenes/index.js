// The gallery, **newest first**.
//
// The site reads top to bottom as new to old: the down arrow goes further back in time, the up
// arrow returns toward the present. A new animation goes at the FRONT of this array — and
// `tests/scenes.test.js` fails if the order ever stops being newest-first by `meta.created`.
//
// Adding an animation is two edits: drop a scene module in this folder, then add it here.

import * as squareAtNoon from './square-at-noon/index.js';
import * as longCut from './long-cut/index.js';
import * as pitilessPit from './pitiless-pit/index.js';
import * as moonOverTheDeep from './moon-over-the-deep/index.js';
import * as roseFunnel from './rose-funnel/index.js';
import * as aboveTheFog from './above-the-fog/index.js';
import * as grizzlyPeak from './grizzly-peak/index.js';
import * as floatingBed from './floating-bed/index.js';

export const scenes = [
  squareAtNoon,
  longCut,
  pitilessPit,
  moonOverTheDeep,
  roseFunnel,
  aboveTheFog,
  grizzlyPeak,
  floatingBed,
];

export const findScene = (id) => scenes.find((scene) => scene.meta.id === id);
