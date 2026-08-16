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
import { drawFunnel, drawWind, funnelPixel, planFunnel, sizeRef } from './funnel.js';
import { planCycle } from './cycle.js';
import { drawDebris, drawLitter, planDebris, planLitter } from './debris.js';
import { drawHands, drawWorks, planHands } from './hands.js';
import { drawHouse, planHouse } from './house.js';
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
  // ...and re-arranging it is the storm taking the arrangement away: the old composition is pulled
  // off the frame in chunks that orbit the axis and climb out of the top of the picture.
  dissolve: 'updraft',
  // The whole scene is snapped to a chunk grid derived from the short edge, so rendering it at
  // twice the pixels produces exactly the same picture with more expensive rectangles.
  maxDpr: 1,
  /**
   * Two compositions, and they are a question about what the scene is *about*.
   *
   * The first is a storm with something in its way — a temple being taken apart faster than the
   * hands can heal it, which is the version the brief grew into, and everything in the lower half of
   * the frame is either the building, what has come off it, or somebody trying to put it back. The
   * funnel marches across the frame because it has somewhere to be.
   *
   * The second takes all of that away and leaves the thing the brief actually asked for: *a
   * pixelated tornado swirling up reds, pinks and purples*, alone, centred, with nothing to destroy
   * and nothing to look at but the column. It is not the first one with pieces deleted — a storm on
   * an empty plain would be a picture with a hole in it. It stands still (the march is nearly off,
   * not off) and it is **half again as wide**: the temple was what gave the first composition its
   * scale, and a funnel left the same width on an empty plain reads as *smaller*, because the only
   * thing left to measure it against is a frame edge it is nowhere near.
   *
   * Index 0 is the arrangement every existing link already resolves to.
   */
  variants: [
    {
      id: 'over-the-temple',
      title: 'Over the Temple',
      storm: { march: 1, size: 1, stand: 0.5 },
      ground: { storeys: 9 },
    },
    {
      id: 'the-column',
      title: 'The Column',
      // Barely marching rather than pinned: a tornado nailed to the centre line is a diagram. It
      // still snakes and leans on its own two slow clocks, and the eighth of a march left keeps it
      // from ever quite settling on the axis it is standing on.
      storm: { march: 0.12, size: 1.16, stand: 0.5 },
      ground: { storeys: 0 },
    },
  ],
};

export function create({ width, height, seed = meta.id, variant = meta.variants[0] }) {
  const rng = createRng(seed);
  // Sky first, so the storm is the same for a given seed however many motes the funnel asks for.
  const sky = planSky(rng);
  const pagoda = planPagoda(rng);
  const funnel = planFunnel(rng, variant.storm);
  // Nine storeys' worth of bays, whatever the frame turns out to hold. The plan cannot depend on the
  // viewport — a resize must not re-roll which parts of the temple the storm has taken — so it is
  // built for the most storeys there can ever be and the shorter frames simply use fewer.
  //
  // A composition with **no** storeys is how the temple is removed, and the storey count does most
  // of the work on its own: no storeys means no bays, no bays means nothing to damage, nothing to
  // heal, nothing to come off and nobody to come and put it back — so the debris and the hands size
  // themselves out of existence from this one number rather than from a flag.
  //
  // The building itself still has to be told, because its geometry is not made of bays: a pagoda
  // with nothing wrong with it is still a pagoda. That is the one thing `standing` gates, and it
  // gates the two populations that would otherwise be flying pieces to a temple that is not there.
  const cycle = planCycle(rng, variant.ground.storeys);
  const standing = variant.ground.storeys > 0;
  const debris = planDebris(rng, cycle.bays.length);
  // The hands need the size of the temple, because every bay is dealt out to one of them and a bay
  // nobody is answerable for would be a hole that never closes.
  const works = planHands(rng, cycle.bays.length);
  const litter = planLitter(rng);
  const house = planHouse(rng);
  // The hands need to know where the storm is to be afraid of it, and the temple needs to know where
  // the hands are to heal where they have been. One plan, handed to both.
  works.funnel = funnel;

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
      // temple, on the background's coarse grid, where a bigger chunk reads as further away. They
      // stand in **both** compositions: they are the land, not the building, and a storm with an
      // empty green strip under it has nothing left to be tall against.
      drawWorks(ctx, W, H, t, works, px);
      // The little house, always at the storm's foot, coming apart wherever the wind reaches it.
      // It stays for the same reason — with the temple gone it is the only thing in frame with a
      // known size, which is the entire job of a house in a landscape.
      drawHouse(ctx, W, H, t, house, funnel, px);
      if (standing) drawPagoda(ctx, W, H, t, pagoda, px, R, cycle, funnel, works);
      drawFunnel(ctx, W, H, t, funnel);
      // The wind is outside the column, so it goes over it — and the ground litter it has picked up
      // rides the same field, climbing until it is gone.
      drawWind(ctx, W, H, t, funnel);
      drawLitter(ctx, W, H, t, litter, funnel, px);
      // Everything that has come off the building, drawn *after* the storm: it is the nearest thing
      // in the frame, and debris hidden behind the tornado that threw it is the one arrangement that
      // makes no sense from any angle.
      if (standing) {
        const places = bayPlaces(W, H, t, pagoda, px, R);
        drawDebris(ctx, W, H, t, debris, cycle, funnel, px, (bay) => places[cycle.bays.indexOf(bay)]);
        // ...and the hands last of all, because they are the only thing in the frame that is not
        // being thrown about by the storm, and they have to be legible against everything that is.
        drawHands(ctx, W, H, t, works, px, places);
      }
      // Last, and additive: the flash has to sit over the funnel, because a strike behind it would
      // be a light source the subject is blocking, and the subject is the brightest thing here.
      drawLightning(ctx, W, H, t, sky);
      ctx.restore();
    },
  };
}
