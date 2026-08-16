// "Stark monochromatic black and white. Slices towards the camera, falling down and to the side."
//
// **Monochromatic is treated as arithmetic, not as mood.** Every animation in this gallery makes one
// claim about how many values it is allowed and then keeps it — sixteen-bit is seven flat steps with
// hard edges between them, thirty-two-bit is ten steps with dither resolving the space between,
// eight-bit is a fixed table of thirty-two colours and no ramp to walk at all. This one says
// **one bit**: `#000000` and `#ffffff`, and nothing in between anywhere in the frame at any moment.
//
// That is a much harder promise than it sounds, because a canvas anti-aliases and there is no way to
// ask it not to. Fill a heptagon and the edge comes back as a row of greys — which is to say, as a
// lie about the palette, drawn a hundred thousand times a frame. So this scene never gives the
// canvas a diagonal. It rasterises its own polygons: `effects/onebit.js` walks each shape scanline
// by scanline, decides which cells of a grid have their centres inside it, and fills those cells as
// axis-aligned rectangles on a grid that is a whole number of **device** pixels wide. The staircase
// on every edge is not a stylistic choice laid over the picture; it is what the picture is made of,
// and it is the reason the two colours are actually two.
//
// **Which leaves depth with nothing to work with, and that is the interesting part.** Every other
// scene here separates near from far with tone. There is no dimmer white. So the slices alternate:
// even white, odd black, all the way down the train — and every slice is then guaranteed to contrast
// against its neighbours whatever their shapes are doing. Occlusion and size carry the whole read.
// A stack of same-coloured slices would be one silhouette; alternated, the same stack is a solid.
//
// **Slices towards the camera** is a train of cross-sections at regular intervals in space, moving
// at a constant rate. Nothing in the scene accelerates. The picture does, because constant speed
// through `1 / z` is a slow lean at the far end and a plunge at the near one, and that is what
// coming at you means. **Falling down and to the side** is the same argument once more: each slice
// drifts at a constant rate in the world from the moment it is cut, and the projection turns that
// into a fall out of the bottom-right corner without a gravity term anywhere.
//
// And they are slices *of something* — one bored, twisting, seven-sided column, every section of it
// a function of the slice's index and nothing else. Two neighbouring slices are two cuts a finger
// apart through the same lump. That is what makes it an object rather than a shuffle of cards, and
// it is why the hole in the middle lines up far enough down the train to look through.

import { createRng } from '../../lib/rng.js';
import { drawCut, planCut } from './cut.js';

export const meta = {
  id: 'long-cut',
  title: 'The Long Cut',
  prompt: 'stark monochromatic black and white — slices towards the camera, falling down and to the side',
  created: '2026-08-16',
  // The field is one of the two colours, not a third thing sitting behind them. The far end of the
  // train recedes *into* the page rather than onto it.
  background: '#000000',
  // Mid-fall: one slice large and sliding out of the corner, the bore of the next one open on the
  // train behind it, and the far end still converging. A still taken as a slice engulfs the frame
  // would be a black rectangle or a white one, which are the two frames that say nothing.
  posterTime: 33.2,
  // Arriving is being cut: the picture you were looking at is sheared into slabs that fall away
  // down and to the side, and the sections come through the gap.
  transition: 'cut',
  // Three chevrons at three depths, alternating — the scene's own trick, at glyph size.
  chrome: 'cut',
  // **The one thing this scene genuinely needs every device pixel for.** The grid is a whole number
  // of them by construction, which is what keeps a cell edge a hardware edge instead of something
  // the compositor has to resolve with a grey. Capped at one, a retina display would be handed a
  // half-resolution canvas to stretch, and the stretch is a blur — which in a picture whose entire
  // claim is that it contains two colours is not a softer picture, it is a broken promise.
  maxDpr: 2,
  /**
   * Six knobs, and the colours are a vocabulary rather than decoration: amber is always pace, blue
   * is always the shape of a fall or a depth, magenta is always how big and how violent a form is,
   * violet is always what a scene does with its holes and its palette, green is always resolution,
   * and cyan is always how much a thing turns or wanders. The same swatch is the same *kind* of
   * gesture in every panel in the gallery.
   *
   * Each one drives several numbers at once, and in more than one direction. `form` grows the column
   * while pulling its vertex range in, so one end of it is a small round shaft and the other a huge
   * spiked one. `grain` coarsens the cell **and** thickens the keyline, because a chunky raster with
   * a hairline outline is two decisions that disagree. `twist` winds the solid here and widens the
   * train's wander in `train.js`, which are the same idea at two scales.
   */
  knobs: [
    { id: 'pace', colour: '#ffb020' },
    { id: 'fall', colour: '#4d8bff' },
    { id: 'form', colour: '#ff4fa3' },
    { id: 'bore', colour: '#a06bff' },
    { id: 'grain', colour: '#5fd66a' },
    { id: 'twist', colour: '#3fd6d0' },
  ],
};

export function create({ width, height, seed = meta.id, knobs }) {
  const rng = createRng(seed);
  const plan = planCut(rng, meta, knobs);

  let W = width;
  let H = height;

  return {
    resize(w, h) {
      // Nothing to rebuild. The solid is described in world units and the camera converts them, so
      // a resize is the same column through a different window.
      W = w;
      H = h;
    },

    draw(ctx, t) {
      ctx.save();
      drawCut(ctx, W, H, t, plan);
      ctx.restore();
    },
  };
}
