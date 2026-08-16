// "An abstract pitiless pit that goes down. The view is of the pit and lines from the ground travel
// down the pit, pixels travel down the pit, blocks and abstract shapes fall in. Every 1-2 minutes
// there is a complete stop to everything going down into the pit and the pit explodes forth pure
// white pixels for 5-10 seconds in a great flurry."
//
// **Pitiless is the word the whole thing is built around**, and it is a word about *withholding*.
// So the design is mostly a list of things this animation refuses to do. The pit has no bottom — the
// depth scale is a geometric series, so there is always another ring and the drawing stops only when
// the screen runs out of pixels, never when the pit runs out of pit. The pit has no colour: the hole
// and the plane it sits in are one desaturated blue-grey, and every hue in the frame belongs to
// something the pit has not taken yet — the blocks falling in, and the things crawling on the
// border toward it. Nothing that goes down ever comes back, nothing lands, nothing piles up, and the
// pit is not moved by any of it. There is no floor to hit and no sound of hitting it.
//
// **The border is not scenery.** It is dark, it is the widest thing in frame, and it is crawling:
// close to a hundred small forms, no two the same, each generated from a hash rather than picked
// from a table, each permanently part-way through one of the seven distortions, each taking a minute
// and a half to reach the edge. A hole with things crawling toward it is not a hole with a
// distraction beside it — it is a hole with a reason.
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
// — the palette is thirty-two fixed colours, and there is no dither anywhere and no ramp to walk.
// Where Moon Over the Deep resolves the space between two steps, this rounds. See `palette.js`.

import { createRng } from '../../lib/rng.js';
import { pixelFor } from './layout.js';
import { eruptionAt, flowAt, planClock } from './clock.js';
import { drawShaft } from './shaft.js';
import { drawCrawl, planCrawl } from './crawl.js';
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
  // **The one scene in the gallery that asks for every pixel the display has**, and the only one
  // with a reason to. Everywhere else here the grid is a coarse constant, so rendering at twice the
  // pixels would be the same picture drawn four times over — which is why this said `1` until the
  // pit learned to sharpen with depth. Now the bottom of the shaft is drawn at *one device pixel* a
  // chunk, and at a capped ratio of 1 there would be no such thing to reach: "max screen resolution"
  // would mean the CSS grid, and the deepest square would be as coarse as the lip. The rest of the
  // picture gets something out of it too — a chunk that lands on exact device pixels has harder
  // edges than one the browser has to stretch, and hard edges are the entire style.
  maxDpr: 2,
};

export function create({ width, height, seed = meta.id }) {
  const rng = createRng(seed);
  const clock = planClock(rng);
  const descent = planDescent(rng);
  const crawl = planCrawl(rng);

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
      // The border, which is crawling. On the flowed clock like everything else, so when the pit
      // stops taking, the crawling stops with it.
      drawCrawl(ctx, W, H, flow, crawl, px);
      // Then the traffic, on the flowed clock, which is frozen for the duration of an eruption.
      drawDescent(ctx, W, H, flow, descent, px);
      // ...and last, over everything, whatever is coming out.
      drawFlare(ctx, W, H, erupt, clock, px);
      ctx.restore();
    },
  };
}
