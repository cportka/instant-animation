// The gallery, **newest first**.
//
// The site reads top to bottom as new to old: the down arrow goes further back in time, the up
// arrow returns toward the present. A new animation goes at the FRONT of this array — and
// `tests/scenes.test.js` fails if the order ever stops being newest-first by `meta.created`.
//
// Adding an animation is two edits: drop a scene module in this folder, then add it here.

import * as floatingBed from './floating-bed.js';

export const scenes = [floatingBed];

export const findScene = (id) => scenes.find((scene) => scene.meta.id === id);
