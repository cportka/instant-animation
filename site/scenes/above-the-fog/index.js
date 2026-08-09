// "An overhead view of fog. Tons of billowing and flowing fog, some of it glitching in and out of
//  existence. Underneath: a lazy winding river and a riverside town with a cafe, a restaurant and
//  twelve jewellery shops, surrounded by green. De-saturated realism, SimCity from above — and the
//  fog is 95% of it, in frequency and in coverage, running from near-white to near-black."
//
// Two layers, and almost all of the interest is in the one you can barely see through.
//
// `town.js` draws the ground straight down: river, roads, roofs, four hundred trees. It is built
// entirely out of *value* rather than detail, because it is only ever glimpsed — drop a gap
// anywhere and the shapes have to read in the second or so before the fog closes again.
//
// `fog.js` is the picture. A lattice of lobes guarantees the coverage, billows and lit crests give
// it a body and a top, filaments give it the fine structure that separates fog from smoke, seven
// wandering windows thin it enough to see through, and a damage schedule borrowed from the tape
// scene tears the whole thing up every few seconds.
//
// The scene draws top-down and orthographic, so there is no perspective anywhere in it. That is a
// constraint, not a saving: with no horizon and no parallax, every cue that says "this is a thick
// moving volume of air" has to come out of the motion itself — shear between layers, light that
// moves independently of the shape it is on, and masses that grow and die rather than slide.

import { createRng } from '../../lib/rng.js';
import { drawGround, planGround } from './town.js';
import { drawFog, planFog } from './fog.js';

export const meta = {
  id: 'above-the-fog',
  title: 'Above the Fog',
  prompt:
    'an overhead view of tons of billowing flowing fog, some of it glitching in and out of existence in a data mosh, over a lazy winding river and a cute riverside town with a cafe, a restaurant and twelve jewellery shops surrounded by green — de-saturated realism, the fog 95% of the scene and running from near-white to near-black',
  created: '2026-08-09',
  background: '#0e1113',
  // Late enough that every element is on its second or third life, on a beat where a window is
  // open over the town, and during a mild fault so the shred shows. A still frame of unbroken fog
  // would be honest and would also be a grey rectangle.
  posterTime: 34,
  // The nav arrows wear the scene: a chevron of soft grey vapour with no colour in it at all.
  chrome: 'vapour',
  // The fog is a couple of hundred large gradient fills a frame, which is fill-rate work and
  // nothing else. Four times the pixels would cost four times as much to render something whose
  // every edge is deliberately soft — there is not one hard edge in the frame to sharpen.
  maxDpr: 1,
};

export function create({ width, height, seed = meta.id, tape = null }) {
  const rng = createRng(seed);
  // Ground first, so the town's plan is the same for a given seed whatever the fog does with the
  // generator afterwards.
  const ground = planGround(rng);
  const fog = planFog(rng);

  let W = width;
  let H = height;

  return {
    resize(w, h) {
      // Nothing to rebuild. The town is planned in normalised coordinates and the fog's lattice is
      // derived from the frame every draw, so a resize is a different view of the same weather
      // rather than new weather.
      W = w;
      H = h;
    },

    draw(ctx, t) {
      ctx.save();
      drawGround(ctx, W, H, t, ground);
      drawFog(ctx, W, H, t, fog, tape);
      ctx.restore();
    },
  };
}
