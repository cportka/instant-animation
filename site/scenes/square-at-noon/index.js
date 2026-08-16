// "A living pixelated town-square western — detailed wind and dust with tumbleweeds, plants, rare
// but sometimes scurrying or crawling desert animals, a wooden town with old-timey facades and
// swinging bar doors that blow open and closed with the changes in the wind, horses in a stable.
// Not locked to any one bit style: a variety of different sizes of pixels and combinations of
// resolution and colours, to make things extremely psychedelic."
//
// **The last sentence is the animation and the rest is the subject.** Every other scene in this
// gallery makes one claim about its grid and its palette and then holds it — that consistency is
// most of why each of them reads as one machine drawing one picture. This one is asked to break
// that, and breaking it badly is very easy: vary the chunk size per object and things look blurry,
// vary it per frame and the picture buzzes, vary it at random and it reads as a broken renderer
// rather than as a decision.
//
// So the variation is **organised into strata**. The frame is cut into nine horizontal bands; each
// band has one grid and one palette all the way across; the boundaries are hard and drift slowly;
// and each band re-deals itself on its own staggered six-second clock, so the frame never changes
// all at once. Six palettes, five grids, nine bands: a still of this has four resolutions and four
// colour schemes in it, and the town's silhouette runs through all of them unbroken. See
// `strata.js` — it is the whole scene in one file, and the rest is what is standing in it.
//
// **The wind is the join.** There is exactly one wind here and everything is downstream of it: the
// dust rides it in three decks at three speeds, the tumbleweeds are carried by its *integral* so
// they keep rolling when it drops, the plants bend from the root, the saloon doors are knocked off
// their rest by its turbulence rather than pushed by its strength, and — the part that matters —
// `strata.js` coarsens every band in the frame in proportion to it. When a gust arrives, the picture
// itself goes blocky. The weather and the resolution are the same fact.
//
// Everything is axis-aligned blocks and nothing else, which is not a style choice but a requirement:
// a shape with a diagonal in it comes apart at every band boundary, and the town has to survive
// being drawn at four resolutions at once or the picture stops being a town.

import { createRng } from '../../lib/rng.js';
import { bend, knobsFor } from '../../lib/knobs.js';
import { baseChunk, planStrata } from './strata.js';
import { drawPlants, drawDust, drawSky, drawSquare, drawWeeds, planGround } from './ground.js';
import { drawTown, planTown } from './town.js';
import { drawCritter, drawStable, planBeasts } from './beasts.js';

export const meta = {
  id: 'square-at-noon',
  title: 'The Square at Noon',
  prompt: 'a living pixelated town-square western — detailed wind and dust with tumbleweeds, plants, rare scurrying and crawling desert animals, a wooden town with old-timey facades and swinging bar doors that blow open and closed with the wind, and horses in a stable — not locked to any one bit style, but a variety of pixel sizes, resolutions and colours, extremely psychedelic',
  created: '2026-08-16',
  background: '#2b1a2e',
  // Far enough in that the bands have re-dealt themselves several times and a gust is up: the frame
  // has four resolutions in it, the doors are moving, and something is crossing the square. A still
  // at t=0 has every band on its first deal and the air dead, which is the one frame that makes the
  // scene look like it only has one palette.
  posterTime: 47.3,
  // Arriving is the town resolving out of the wind: the picture is dealt into bands, each one
  // dropping to a different resolution and a different palette before it settles.
  transition: 'noon',
  // The nav arrows wear the scene: one chevron cut into three bands at three grids.
  chrome: 'noon',
  // Every grid in the frame is a whole multiple of one base chunk, and the finest band draws at that
  // base. Rendering at twice the pixels would be the same picture with more expensive rectangles —
  // and worse, it would halve the base chunk and make the fine bands stop reading as a *resolution*
  // at all. The strata only mean anything if the finest one is visibly a grid.
  maxDpr: 1,
  /**
   * Six knobs. `strata` is the one this scene is about: it drives how coarse the coarse bands are
   * **and** how far the palettes are allowed to roll apart, so one end of it is a nearly ordinary
   * sunbleached western and the other is the same square rendered by four machines that disagree
   * about everything. `blow` is the wind, and because the wind is what the resolution is made of,
   * turning it up makes the picture come apart as well as the dust.
   */
  knobs: [
    { id: 'blow', colour: '#ffb020' },
    { id: 'strata', colour: '#a06bff' },
    { id: 'grain', colour: '#5fd66a' },
    { id: 'growth', colour: '#3fd6d0' },
    { id: 'heat', colour: '#ffe9a8' },
    { id: 'form', colour: '#ff4fa3' },
  ],
};

export function create({ width, height, seed = meta.id, knobs }) {
  const rng = createRng(seed);
  const K = knobsFor(meta, knobs);
  // The strata first, so the bands are the same for a given seed however much is standing in them.
  const strata = planStrata(rng);
  const town = planTown(rng);
  const ground = planGround(rng);
  const beasts = planBeasts(rng);
  town.strata = strata;
  ground.strata = strata;
  beasts.strata = strata;

  let W = width;
  let H = height;

  return {
    resize(w, h) {
      // Nothing to rebuild. The bands are fractions of the frame and every plan is in normalised
      // units, so a resize is the same square through a different window.
      W = w;
      H = h;
    },

    draw(ctx, t) {
      ctx.save();
      // The knobs, worked out once for the whole frame and read from the live bag rather than kept.
      const tune = {
        blow: bend(K.blow, 0.12, 1, 2.8),
        growth: bend(K.growth, 0.3, 1, 2.2),
        heat: bend(K.heat, 0.15, 1, 2.1),
        sun: bend(K.heat, 0.35, 1, 2.4),
        rise: bend(K.form, 0.55, 1, 1.45),
        swing: bend(K.form, 0.25, 1, 2.4),
        often: bend(K.growth, 0.25, 1, 4),
      };
      // How coarse the coarse bands get, and how fine the fine one is. One knob moves both ends
      // apart, so the *disagreement between bands* is the thing being adjusted rather than the
      // overall resolution — which is what `grain` is for, separately.
      strata.spread = bend(K.strata, 0.25, 1, 1.9);
      const base = baseChunk(W, H, bend(K.grain, 0.45, 1, 2.2));

      drawSky(ctx, W, H, t, ground, base, tune);
      drawSquare(ctx, W, H, t, ground, base, tune);
      // The town before anything loose, so dust blows in front of it and the horses stand inside it.
      drawTown(ctx, W, H, t, town, base, tune);
      drawStable(ctx, W, H, t, beasts, base, tune);
      // Rooted things, then the things being carried past them.
      drawPlants(ctx, W, H, t, ground, base, tune);
      drawCritter(ctx, W, H, t, beasts, base, tune);
      drawWeeds(ctx, W, H, t, ground, base, tune);
      // Dust last and over everything, because it is the air and the air is in front of the town.
      drawDust(ctx, W, H, t, ground, base, tune);
      ctx.restore();
    },
  };
}
