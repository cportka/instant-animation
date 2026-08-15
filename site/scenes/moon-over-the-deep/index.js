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
};

export function create({ width, height, seed = meta.id }) {
  const rng = createRng(seed);
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
      const px = pixelFor(Math.min(W, H));
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
