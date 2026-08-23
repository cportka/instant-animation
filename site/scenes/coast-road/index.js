// "Side-scrolling follow of a 16-bit motorcycle with a rider decked out in shiny purple gear head to
//  toe. The background goes by, buildings like the game Rampage or Ninja Gaiden, but ultimately a
//  tropical 80s beachside metropolis at night. Endless driving forward to the right, around
//  occasional vehicles and overpasses and bridges and highway changes to local road changes back."
//
// **"Endless" is the hard word, and it is a promise about arithmetic rather than about length.**
//
// A side-scroller is normally a machine that *steps*: spawn a car off the right edge, shift
// everything left a little, recycle whatever falls off. Every verb in that sentence is a mutation,
// and this gallery forbids all of them — the render tests draw eight timestamps out of order, the
// stage hands a fresh instance somebody else's clock during a channel change, and the poster path
// asks for a single frame at `t = 39` having never drawn `t = 0`. A scene built the usual way would
// answer differently every time it was asked.
//
// So the road here is not simulated, it is **addressed**. Ask what is at world position `x` and it
// answers without having been anywhere else: which kind of road that is, how high the deck rides,
// whether a lamp stands there, whether a vehicle sits in that cell and in which lane. Each of those
// is a hash of `floor(x / pitch)`. Nothing is ever spawned and nothing is ever recycled, because
// everything is already there at every `x` and always has been. See `world.js`.
//
// The consequence that turned out to be interesting is in `traffic.js`. Going *around* a vehicle is
// a decision, and a pure function of `t` has no memory to hold an intention in — so the swerve is
// not remembered, it is **evaluated**: three lane costs and a soft minimum, from the traffic that
// happens to be near, with the last second and a half of the rider's own choices re-derived from
// scratch every frame to give it the hysteresis a rider needs. And the road is built so that at most
// one lane is ever blocked, which is what makes the answer always exist. It is a rider picking a gap,
// and it is an arithmetic expression, and those are the same thing here.

import { createRng } from '../../lib/rng.js';
import { bend, knobsFor } from '../../lib/knobs.js';
import { LANES, SPAN } from './world.js';
import { paletteAt } from './palette.js';
import {
  drawFarSide, drawGantries, drawNearSide, drawOverBack, drawOverFront, drawSheen,
  drawSurface, drawVerge, viewAt,
} from './road.js';
import { drawBay, drawBlocks, drawFore, drawPalms, drawSky, drawSkyline } from './city.js';
import { drawCar, drawFare, eachCar } from './traffic.js';
import { drawRider, riderAt, streakOf } from './rider.js';

export const meta = {
  id: 'coast-road',
  title: 'The All-Night Coast Road',
  prompt:
    'a side-scrolling follow of a 16-bit motorcycle with a rider decked out in shiny purple gear head to toe — the background going by, buildings like Rampage or Ninja Gaiden, but ultimately a tropical 80s beachside metropolis at night, driving endlessly forward to the right around occasional vehicles and overpasses and bridges, highway changing to local road and back',
  created: '2026-08-23',
  background: '#050a24',
  // A causeway, an overpass going by behind, traffic in the near lane to be got round, and a lamp
  // close enough that the highlight is somewhere interesting on the gear. A still at t=0 is a clear
  // stretch of empty highway, which is the one frame that makes the whole thing look like a loop.
  posterTime: 68.9,
  // Arriving is the picture being whipped past: the frame is cut into the scene's own parallax
  // layers and each one is dragged left at its own rate, smeared into light as it goes.
  transition: 'coast',
  // The nav arrows wear the scene: one chevron with its own speed trail behind it.
  chrome: 'coast',
  // Sixteen-bit means a chunk you can see. Rendering at twice the pixels would halve it and quietly
  // turn the whole thing into a smooth picture with a stepped drawing in it.
  maxDpr: 1,
  /**
   * Six knobs.
   *
   * `pace` is the one worth explaining, because the obvious knob on a scrolling scene is the *speed*
   * and speed is the one thing that cannot be touched: the world is addressed off `travelAt(t)`, so
   * scaling it teleports the rider hundreds of units down the road the moment the knob moves. `pace`
   * changes **how much world is across the frame** instead — the same apparent speed in pixels a
   * second, continuously, with the phase untouched. One end is down on the deck with the road
   * hammering past; the other is pulled back for a wide, slow run along the coast.
   */
  knobs: [
    { id: 'pace', colour: '#ffb020' },
    { id: 'swarm', colour: '#3fd6d0' },
    { id: 'grain', colour: '#5fd66a' },
    { id: 'glow', colour: '#ffe9a8' },
    { id: 'form', colour: '#ff4fa3' },
    { id: 'neon', colour: '#a06bff' },
  ],
};

export function create({ width, height, seed = meta.id, knobs }) {
  const rng = createRng(seed);
  const K = knobsFor(meta, knobs);
  // The only thing the seed decides, and the only thing there is to decide: **which mile of the road
  // this run came in on.** Everything in the world is a function of position, so an offset in
  // position is a different stretch of coast — its own sequence of highway and local road and
  // causeway, its own lamps, its own traffic — and it is consistent without a single lattice being
  // told, because every one of them is downstream of the same coordinate.
  const origin = rng.range(0, 90000);

  let W = width;
  let H = height;

  return {
    resize(w, h) {
      // Nothing to rebuild: every lattice is measured against the frame, so a resize is the same
      // ride through a different window.
      W = w;
      H = h;
    },

    draw(ctx, t) {
      ctx.save();
      const tune = {
        // The lens. Narrow is close and fast, wide is far and slow — and neither moves the phase.
        span: bend(K.pace, SPAN * 1.58, SPAN, SPAN * 0.62),
        grain: bend(K.grain, 0.5, 1, 2.1),
        glow: bend(K.glow, 0.3, 1, 1.9),
        tall: bend(K.form, 0.55, 1, 1.7),
        lift: bend(K.form, 0.35, 1, 1.9),
        growth: bend(K.form, 0.4, 1, 1.6),
        shine: bend(K.glow, 0.35, 1, 1.8),
        density: bend(K.swarm, 0.18, 0.55, 1),
        pal: paletteAt(bend(K.neon, 0, 0.34, 1)),
      };
      const view = viewAt(ctx, W, H, t, tune, origin);
      view.origin = origin;
      const rider = riderAt(view, tune.density);

      // Back to front, and the order is the whole composition.
      drawSky(view);
      drawBay(view);
      drawSkyline(view);
      drawBlocks(view);
      drawPalms(view);
      // What goes over the top, before the road it goes over.
      drawOverBack(view);
      drawGantries(view);
      // The ground beyond the deck, then the lamps standing on it, then the deck itself.
      drawVerge(view);
      drawFarSide(view);
      drawSurface(view);
      drawSheen(view);

      // Traffic splits around the rider by depth: anything further away is drawn under him, anything
      // nearer over him. That one comparison is what makes a flat band read as three lanes.
      eachCar(view, tune.density, (car, wx) => {
        if (LANES[car.lane] >= rider.lane) return;
        drawCar(view, car, wx);
        drawFare(view, car, wx);
      });
      drawRider(ctx, view, rider);
      eachCar(view, tune.density, (car, wx) => {
        if (LANES[car.lane] < rider.lane) return;
        drawCar(view, car, wx);
        drawFare(view, car, wx);
      });

      drawNearSide(view);
      drawOverFront(view);
      drawFore(view, streakOf(view, rider));
      ctx.restore();
    },
  };
}
