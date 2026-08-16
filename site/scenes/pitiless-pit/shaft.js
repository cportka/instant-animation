// The ground, and the pit in it.
//
// The whole shaft is a stack of rectangles drawn largest first, each one covering the middle of the
// last. That is the entire wall: no annulus arithmetic, no clipping, no path with a hole in it —
// twenty-odd `fillRect`s, outside in, and the one on top is the deepest thing you can see. It is
// worth noticing how cheap that is, because it is not a trick played to save time. Concentric flat
// bands *are* what a shaft looks like from directly above, and the drawing is short because the
// shape is simple, which is what this scene is for.
//
// The bands march. Each one is nailed to an integer depth and the whole ladder slides downward with
// the flowed clock, so a band you are looking at gets smaller, darker, and eventually is one chunk.
// Because the depth scale is geometric, sliding it by exactly one unit leaves the picture identical
// — so the march never has to wrap, and no band is ever born or destroyed where it can be seen.

import { rgba } from '../../lib/draw.js';
import { ERUPT, surgeAt } from './clock.js';
import { FLARE, GROUND, KERB, SHAFT } from './palette.js';
import { MOUTH, bottomDepth, scaleAt, snapTo } from './layout.js';

/** How fast the bands slide down, in depths per flowed second. */
const MARCH = 0.62;

/** How many depths it takes to fall one step down the palette. */
const GLOOM = 3.4;

/** The shallowest the eruption's white front ever reaches. */
const THROAT = 6.5;

export function drawShaft(ctx, W, H, flow, erupt, px) {
  const cx = snapTo(W / 2, px);
  const cy = snapTo(H / 2, px);
  const halfW = W / 2;
  const halfH = H / 2;

  // The ground: the plane the pit is in. Flat, because it is not the subject and anything happening
  // on it would be something to look at instead of the hole.
  ctx.fillStyle = rgba(GROUND, 1);
  ctx.fillRect(0, 0, W, H);

  // The lip. One band of a lighter grey immediately outside the mouth, which is the only thing in
  // the picture that says the ground has a *thickness* — without it the pit is a hole cut in paper.
  const kerb = scaleAt(-0.55);
  ctx.fillStyle = rgba(KERB, 1);
  fillRing(ctx, cx, cy, halfW * kerb, halfH * kerb, px);

  const deepest = bottomDepth(W, H, px);
  // Where the white has climbed to. Below this depth the shaft is gone and what is there is the
  // thing coming up; above it, the shaft is still the shaft. It rushes out from the vanishing point
  // and is drawn back into it, so the eruption has a *front* rather than simply being switched on.
  //
  // It stops well short of the mouth, and that is the difference between a picture and a flash. Let
  // the front reach the lip and every band goes white at once: the pit becomes a flat white
  // rectangle, the shaft it was five seconds ago is gone, and the pixels pouring out of it — which
  // are the actual event — are white on white and cannot be seen at all. Held to a throat a third of
  // the way down, it reads as what it is: a light too far away to make out, and everything between
  // you and it thrown up in front of it.
  const white = erupt.on ? deepest - surgeAt(erupt.age) * (deepest - THROAT) : Infinity;

  const march = flow * MARCH;
  const base = Math.floor(march);
  const slip = march - base;

  for (let j = -1; ; j += 1) {
    const u = j + slip;
    // Band −1 straddles the mouth; it is drawn from the mouth rather than from where it starts, so
    // the ground and the shaft always meet exactly at the lip whatever the march is doing.
    const top = u < 0 ? 0 : u;
    const s = top === 0 ? MOUTH : scaleAt(top);
    if (s * Math.min(W, H) < px * 2) break;

    let colour;
    if (top >= white) {
      colour = FLARE;
    } else {
      // Deeper is darker, and every other band is one step darker again. The gloom is what makes it
      // a pit; the alternation is what makes the descent visible, because a shaft that only darkens
      // with depth is a still picture however fast you slide it.
      const stripe = (((j - base) % 2) + 2) % 2;
      const step = Math.min(SHAFT.length - 1, Math.floor(top / GLOOM) + stripe);
      colour = SHAFT[step];
    }
    ctx.fillStyle = rgba(colour, 1);
    fillRing(ctx, cx, cy, halfW * s, halfH * s, px);
  }
}

/** One band: a snapped rectangle centred on the vanishing point. */
function fillRing(ctx, cx, cy, hx, hy, px) {
  const w = Math.max(px, snapTo(hx * 2, px));
  const h = Math.max(px, snapTo(hy * 2, px));
  ctx.fillRect(cx - snapTo(w / 2, px), cy - snapTo(h / 2, px), w, h);
}

/** How long an eruption lasts, for anything that needs to know without importing the clock. */
export const ERUPT_SPAN = ERUPT;
