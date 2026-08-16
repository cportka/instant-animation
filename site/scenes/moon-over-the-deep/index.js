// "A stark, highly-stylized, 32-bit pixel style full moon over the water with an island in the
// background. The water below gently rolls, it's a clear night with stars out. A faint glow
// occasionally comes from deep below the water."
//
// Four things in that brief and they pull in different directions, which is what makes it a
// composition rather than a checklist.
//
// **Stark** wants almost nothing in frame. **32-bit** wants depth in every surface. Those sound
// opposed and are not: starkness is about how many *objects* there are, and the bit depth is about
// how many *values* each one gets. So there are four things in this picture — a moon, a sea, an
// island, a sky — and every one of them is described by a ten-step ramp read continuously. The Rose
// Funnel is the same grid with the opposite settings: seven steps, hard edges, and interpolation
// explicitly banned. Both are pixel art; they are pixel art from different decades.
//
// **The moon is the subject and the path is the animation.** Nothing in this scene travels. The moon
// hangs, the island sits, the stars hold their places — and the picture is never still, because the
// swell keeps turning wave faces toward the eye and away again, and each one that catches the moon
// lights up for a moment. That column of broken light does all the moving, and it is not drawn: it
// is what falls out of asking every point on the water whether its slope bounces the moon at you.
//
// **And once in a while something under the water lights up.** It is the only hue in the frame — a
// cold green where everything else is on one blue axis — so a dim thing that happens for fifteen
// seconds in every fifty still stops you. The swell rolls over the top of it, unlit, which is the
// whole of what makes it read as *below* rather than *on*.

import { createRng } from '../../lib/rng.js';
import { bend, knobsFor } from '../../lib/knobs.js';
import { pixelFor } from './layout.js';
import { drawMeteor, drawSky, planSky } from './sky.js';
import { drawMoon, moonAt, planMoon } from './moon.js';
import { drawIsland, planIsland } from './island.js';
import { drawWater, planWater } from './water.js';
import { planDeep } from './deep.js';

export const meta = {
  id: 'moon-over-the-deep',
  title: 'Moon Over the Deep',
  prompt: 'a stark, highly-stylized, 32-bit pixel style full moon over the water with an island in the background, the water gently rolling under a clear night sky, and a faint glow that occasionally comes from deep below',
  created: '2026-08-15',
  background: '#03040c',
  // Far enough in that the long roller has carried a crest most of the way toward the viewer, so the
  // path is at its most broken. A still at t = 0 has the swell flat and the path nearly solid, which
  // is the one frame that makes this look like a photograph of a light on still water.
  posterTime: 16.8,
  // Arriving is the tide coming in: the picture floods from the bottom, and what is under the
  // waterline is dragged by the swell and pulled down into the sea's own ramp.
  transition: 'tide',
  // The nav arrows wear the scene: a chevron drawn in four steps of moonlight.
  chrome: 'moon',
  // Every value in this scene is a dithered position on a long ramp, so the art *is* the pixel grid.
  // Rendering it at twice the pixels produces the same picture with four times the rectangles.
  maxDpr: 1,
  /**
   * Six knobs. `glow` is the one that matters most here: it drives the moon's own haze, how far that
   * haze reaches into the sky, *and* how much of the light from far below is allowed to mix into the
   * water — three separate systems that the scene has always meant as one idea, which is how much of
   * this picture is made of light rather than of things.
   *
   * `swell` moves the waves' height up while pulling their wavelength *down*, so one end of it is a
   * long slow ocean and the other is a short violent one, rather than the same sea louder.
   */
  knobs: [
    { id: 'pace', colour: '#ffb020' },
    { id: 'swell', colour: '#4d8bff' },
    { id: 'form', colour: '#ff4fa3' },
    { id: 'glow', colour: '#ffe9a8' },
    { id: 'swarm', colour: '#3fd6d0' },
    { id: 'grain', colour: '#5fd66a' },
  ],
};

export function create({ width, height, seed = meta.id, knobs }) {
  const rng = createRng(seed);
  const K = knobsFor(meta, knobs);
  const sky = planSky(rng);
  const moon = planMoon(rng);
  const island = planIsland(rng);
  const water = planWater(rng);
  const deep = planDeep(rng);

  let W = width;
  let H = height;

  return {
    resize(w, h) {
      // Nothing to rebuild: every plan is in normalised units and the chunk grid is derived from the
      // frame each draw, so a resize is a different window onto the same night.
      W = w;
      H = h;
    },

    draw(ctx, t) {
      ctx.save();
      // The knobs, written onto the plans the drawing already reads. Nothing is remembered: every
      // one is recomputed from the live bag and from the *shipped* values, so turning one back
      // restores the picture exactly rather than approximately.
      moon.size = bend(K.form, 0.42, 1, 2.1);
      moon.haze = bend(K.glow, 0.15, 1, 1.85);
      deep.lift = bend(K.glow, 0.12, 1, 1.9);
      // How many stars, and — past the middle, where the field has run out of stars to add — how
      // bright the ones there are. The count is fixed at build time, so the top half of the knob
      // spends itself on magnitude instead, which pulls the faintest layer of the field up out of
      // the threshold it is sitting under and *does* add stars, just not new ones.
      sky.swarm = bend(K.swarm, 0.05, 1, 1);
      sky.blaze = bend(K.swarm, 0.8, 1, 1.5);
      // The sky is drawn three chunks to the water's one, and `grain` moves that ratio as well as
      // the chunk itself. The water's grid answers to a hard budget — a knob may ask for a finer sea
      // and will be refused on a phone — but the sky is cheap enough to give away, so the fine end
      // of the knob still has somewhere to go even where the sea has stopped.
      sky.coarse = bend(K.grain, 5, 3, 1.6);
      for (let i = 0; i < water.swells.length; i += 1) {
        water.swells[i].speed = water.rest[i].speed * bend(K.pace, 0.18, 1, 3.4);
        water.swells[i].amp = water.rest[i].amp * bend(K.swell, 0.22, 1, 2.3);
        water.swells[i].k = water.rest[i].k * bend(K.swell, 1.9, 1, 0.48);
      }
      const px = pixelFor(W, H, bend(K.grain, 0.4, 1, 2.2));
      const disc = moonAt(W, H, moon);
      // The sky is told where the moon is, because the glare around it is *sky* — drawn on the sky's
      // grid, on the sky's ramp, by the sky's own dither. Nothing else would join without a seam.
      drawSky(ctx, W, H, t, sky, px, disc);
      drawMoon(ctx, W, H, t, moon, px);
      drawMeteor(ctx, W, H, t, px);
      // The sea is drawn over the waterline, so the island — which stands *on* that line — has to
      // come after it, and its reflection after that.
      drawWater(ctx, W, H, t, water, disc, deep, px);
      drawIsland(ctx, W, H, t, island, water, disc, px);
      ctx.restore();
    },
  };
}
