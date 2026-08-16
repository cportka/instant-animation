// "An abstract pitiless pit that goes down. The view is of the pit and lines from the ground travel
// down the pit, pixels travel down the pit, blocks and abstract shapes fall in. Every 1-2 minutes
// there is a complete stop to everything going down into the pit and the pit explodes forth pure
// white pixels for 5-10 seconds in a great flurry."
//
// **Pitiless is the word the whole thing is built around**, and it is a word about *withholding*.
// So the design is mostly a list of things this animation refuses to do. The pit has no bottom — the
// depth scale is a geometric series, so there is always another ring and the drawing stops only when
// the screen runs out of pixels, never when the pit runs out of pit. The pit has no colour: every
// structural thing in frame is one desaturated blue-grey, and the only saturated colours belong to
// the blocks going in. Nothing that goes down ever comes back, nothing lands, nothing piles up, and
// the pit is not moved by any of it. There is no floor to hit and no sound of hitting it.
//
// **And then it gives, and what it gives back is white.** Once every ninety-six seconds everything
// descending stops — not slows, stops — and for seven and a half seconds pure white pixels pour out
// of the vanishing point and across the ground. White appears nowhere else in the palette, so it is
// not merely brighter than the picture; it is a colour the picture has never contained.
//
// The stop is the technical centre of the scene, and it is a **second clock** rather than an event.
// `flowAt(t)` is wall time with every eruption cut out of it; everything that descends is drawn from
// it and has never heard of eruptions, and everything about the eruption is drawn from `t` and has
// never heard of the descent. The two meet at a function that is continuous and whose *derivative*
// jumps, which is why nothing anywhere in the picture moves when the stop begins — it simply stops.
// A flag set on one frame and cleared on another would have been the obvious way and is forbidden
// here: the render tests draw at eight timestamps out of order, and a scene that remembers anything
// cannot survive that.
//
// **8-bit** is a claim about arithmetic. The chunk grid is `S / 96` — nearly twice the moon scene's
// — the palette is sixteen fixed colours, and there is no dither anywhere and no ramp to walk. Where
// Moon Over the Deep resolves the space between two steps, this rounds. See `palette.js`.

import { createRng } from '../../lib/rng.js';
import { pixelFor } from './layout.js';
import { eruptionAt, flowAt, planClock } from './clock.js';
import { drawShaft } from './shaft.js';
import { drawDescent, planDescent } from './descent.js';
import { drawFlare } from './flare.js';

export const meta = {
  id: 'pitiless-pit',
  title: 'The Pitiless Pit',
  prompt: 'an abstract pitiless pit that goes down — lines from the ground travel down the pit, pixels travel down the pit, blocks and abstract shapes fall in, and every minute or two everything stops and the pit erupts pure white pixels in a great flurry',
  created: '2026-08-16',
  background: '#04050c',
  // Deep into a quiet stretch, with the traffic at its most varied and no eruption anywhere near.
  // A still of the flurry would be a white rectangle, which is the one frame that says nothing about
  // what this is — the eruption only means anything if you have watched the pit take for a while.
  posterTime: 41.5,
  // Arriving is being swallowed: the picture you were looking at is dragged down the shaft and the
  // pit throws white back out over it.
  transition: 'pit',
  // The nav arrows wear the scene: a chevron of three flat bars, receding.
  chrome: 'pit',
  // Sixteen colours on a coarse grid. Twice the pixels would be the same picture drawn four times.
  maxDpr: 1,
};

export function create({ width, height, seed = meta.id }) {
  const rng = createRng(seed);
  const clock = planClock(rng);
  const descent = planDescent(rng);

  let W = width;
  let H = height;

  return {
    resize(w, h) {
      // Nothing to rebuild. Every plan is in ring-and-depth coordinates, which have no pixels in
      // them — a resize is the same pit through a different window.
      W = w;
      H = h;
    },

    draw(ctx, t) {
      ctx.save();
      const px = pixelFor(W, H);
      const flow = flowAt(t, clock);
      const erupt = eruptionAt(t, clock);
      // The shaft first, because everything else is *in* it: the ground, the lip, and the bands
      // marching down — which also carry the white front on their way back up.
      drawShaft(ctx, W, H, flow, erupt, px);
      // Then the traffic, on the flowed clock, which is frozen for the duration of an eruption.
      drawDescent(ctx, W, H, flow, descent, px);
      // ...and last, over everything, whatever is coming out.
      drawFlare(ctx, W, H, erupt, clock, px);
      ctx.restore();
    },
  };
}
