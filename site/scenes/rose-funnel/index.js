// "A pixelated tornado swirling up reds, pinks and purples."
//
// The brief is four things, and it is worth being honest about which one is the hard one. *Tornado*
// is a silhouette. *Reds, pinks and purples* is a palette. *Pixelated* is a grid. **Swirling up** is
// the whole animation, and it is the only part that cannot be faked with a texture.
//
// So the scene is built around it. `funnel.js` draws the front surface of a rotating drum and maps
// every screen column back onto the circle it is showing, which makes the colour bands wrap around
// the shape and crowd at the silhouette on their own; add a term in height to the band's phase and
// they climb as they turn. Nothing in the funnel translates — the shape stands still and the colour
// goes round it, which is what a spinning solid actually looks like, and it is why the thing reads
// as a volume rather than as a stack of rectangles.
//
// `sky.js` gives it a top and a bottom. A funnel on a flat field is a shape floating in a colour; a
// funnel hanging out of a wall cloud and standing on a horizon is a thing in a place, and the two
// cost almost nothing next to the difference they make. `palette.js` is one seven-step ramp, and
// *everything* — funnel, storm, ground, debris, lightning — is drawn out of it, so the reds, pinks
// and purples read as one material at different brightnesses instead of three colours sharing a
// frame.
//
// There are no gradients anywhere in this scene, and no interpolation between ramp steps. That is
// the point of "pixelated": a ramp read continuously is a gradient, and the bands only read as bands
// if there is a hard edge between them. Even the sky is an ordered Bayer dither between flat
// colours, which is how a machine that could not do smooth colour would have had to draw it.

import { createRng } from '../../lib/rng.js';
import { drawFunnel, funnelPixel, planFunnel, sizeRef } from './funnel.js';
import { planCycle } from './cycle.js';
import { drawDebris, planDebris } from './debris.js';
import { drawHands, drawWorks, planHands } from './hands.js';
import { bayPlaces, drawPagoda, planPagoda } from './pagoda.js';
import { drawLightning, drawSky, planSky } from './sky.js';

export const meta = {
  id: 'rose-funnel',
  title: 'The Rose Funnel',
  prompt: 'a pixelated tornado swirling up reds, pinks and purples',
  created: '2026-08-14',
  background: '#1d0c22',
  // Far enough in that the funnel has leaned off vertical and the helix has climbed a full turn.
  // A still at t=0 is a symmetrical cone, which is the one frame that makes the scene look static.
  posterTime: 11.6,
  // Arriving is the storm arriving: the picture shatters into the funnel's own chunk grid and the
  // pieces are dragged around a vortex before they settle.
  transition: 'funnel',
  // The nav arrows wear the scene: a chevron cut out of chunk, in the ramp's hot pink.
  chrome: 'funnel',
  // The whole scene is snapped to a chunk grid derived from the short edge, so rendering it at
  // twice the pixels produces exactly the same picture with more expensive rectangles.
  maxDpr: 1,
};

export function create({ width, height, seed = meta.id }) {
  const rng = createRng(seed);
  // Sky first, so the storm is the same for a given seed however many motes the funnel asks for.
  const sky = planSky(rng);
  const pagoda = planPagoda(rng);
  const funnel = planFunnel(rng);
  // Nine storeys' worth of bays, whatever the frame turns out to hold. The plan cannot depend on the
  // viewport — a resize must not re-roll which parts of the temple the storm has taken — so it is
  // built for the most storeys there can ever be and the shorter frames simply use fewer.
  const cycle = planCycle(rng, 9);
  const debris = planDebris(rng, cycle.bays.length);
  const works = planHands(rng);

  let W = width;
  let H = height;

  return {
    resize(w, h) {
      // Nothing to rebuild. Both plans are in normalised units and the chunk grid is derived from
      // the frame every draw, so a resize is a different window onto the same storm.
      W = w;
      H = h;
    },

    draw(ctx, t) {
      ctx.save();
      const px = funnelPixel(Math.min(W, H));
      drawSky(ctx, W, H, t, sky, px);
      // Before the funnel, so the storm's flare occludes the spire for free — painter's order does
      // the hidden-surface work and nothing has to be sorted or clipped.
      const R = sizeRef(W, H);
      // The forest and the workshops belong to the ground, so they go down with it — behind the
      // temple, on the background's coarse grid, where a bigger chunk reads as further away.
      drawWorks(ctx, W, H, t, works, px);
      drawPagoda(ctx, W, H, t, pagoda, px, R, cycle, funnel);
      drawFunnel(ctx, W, H, t, funnel);
      // Everything that has come off the building, drawn *after* the storm: it is the nearest thing
      // in the frame, and debris hidden behind the tornado that threw it is the one arrangement that
      // makes no sense from any angle.
      const places = bayPlaces(W, H, t, pagoda, px, R);
      drawDebris(ctx, W, H, t, debris, cycle, funnel, px, (bay) => places[cycle.bays.indexOf(bay)]);
      // ...and the hands last of all, because they are the only thing in the frame that is not being
      // thrown about by the storm, and they have to be legible against everything that is.
      drawHands(ctx, W, H, t, works, px, places);
      // Last, and additive: the flash has to sit over the funnel, because a strike behind it would
      // be a light source the subject is blocking, and the subject is the brightest thing here.
      drawLightning(ctx, W, H, t, sky);
      ctx.restore();
    },
  };
}
