// The gallery, newest last.
//
// Adding an animation is two edits: drop a scene module in this folder, then add it here. The
// front-end picks it up automatically and `tests/scenes.test.js` keeps the two in agreement.

import * as floatingBed from './floating-bed.js';

export const scenes = [floatingBed];

export const findScene = (id) => scenes.find((scene) => scene.meta.id === id);
