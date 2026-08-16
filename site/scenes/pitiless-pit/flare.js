// What comes back up.
//
// The pit takes for a minute and a half and then, for seven and a half seconds, it gives — and the
// thing it gives back is not what went in. Everything that went down had a colour and a shape and a
// direction; what comes out is pure white, single pixels, in numbers, all of it moving outward at
// once. That is the only moment in this animation when anything travels away from the centre, and
// it is the only moment when the palette's sixteenth colour is used at all.
//
// The particles ride the shaft's own coordinate backwards. A thing going down has a depth that
// increases; these have depths that **decrease**, from far below the last visible ring out through
// the mouth and across the ground to the frame edge. Because the depth scale is geometric, a
// constant rate in depth is an *accelerating* rush on screen — slow while it is still deep, then
// faster and faster as it comes up, and finally tearing across the ground. Nothing here is
// accelerated by hand; the perspective does it, and it is the same perspective that made everything
// look like it was slowing down as it fell.
//
// None of this is simulated. Every particle is a closed-form function of `(n, i, age)`, where `n` is
// which eruption it belongs to — so the whole flurry can be evaluated at any instant, in any order,
// with nothing carried between frames.

import { hash2 } from '../../effects/field.js';
import { rgba } from '../../lib/draw.js';
import { ERUPT, surgeAt } from './clock.js';
import { TEAR_SLIDE, tearAt } from './glitch.js';
import { FLARE } from './palette.js';
import { U_TOP, bottomDepth, edgeOf, scaleAt, snapTo } from './layout.js';

/** How many are thrown in a round at full pressure. */
const MOTES = 1500;

/** How long the pit goes on throwing them, of the seconds it has. */
const THROW = ERUPT * 0.62;

export function drawFlare(ctx, W, H, erupt, plan, px, tune) {
  if (!erupt.on) return;
  const { n, age } = erupt;
  const cx = snapTo(W / 2, px);
  const cy = snapTo(H / 2, px);
  const halfW = W / 2;
  const halfH = H / 2;
  const deepest = bottomDepth(W, H, px);
  const surge = surgeAt(age);
  // Every round is thrown differently — how many, how hard, how spread. The interval between them
  // cannot vary (see `clock.js`), so this is where the variety has to live, and it is enough: no two
  // eruptions arrive at the same rate or reach the frame edge at the same moment.
  const count = Math.round(MOTES * tune.glow * (0.55 + hash2(n * 1.7 + plan.seed, 3) * 0.65));
  // **Fast enough to get out.** A particle has to cross the whole shaft and the ground beyond it —
  // some twenty-five depths — and it has to do that in a second or two, or the flurry is a crowd of
  // white pixels loitering deep in a shaft that is also white, which is exactly nothing to look at.
  // Launched over the first stretch and crossing in a couple of seconds gives a stream rather than a
  // wave: there are always some just leaving and some already at the frame edge.
  const vigour = (9 + hash2(n * 2.3 + plan.seed, 7) * 7) * tune.glow;
  const at = [0, 0];

  const xy = [];
  for (let i = 0; i < count; i += 1) {
    // Launched over the first stretch of the round, so the flurry builds instead of appearing.
    const delay = hash2(i * 1.9 + n, 11) ** 1.7 * THROW;
    const live = age - delay;
    if (live <= 0) continue;
    // Started deep, and how deep varies — the ones from further down arrive later and are still
    // coming when the early ones have gone, which is what stops the whole thing being one wavefront.
    const from = 6 + hash2(i * 2.7 + n, 13) * 14;
    const rate = vigour * (0.7 + hash2(i * 3.1 + n, 17) * 0.6);
    const u = from - live * rate;
    if (u <= U_TOP) continue;
    // ...and it thins as the pressure comes off, from the outside in: the ones furthest along are
    // the first to stop being drawn, so the flurry retreats toward the pit rather than fading where
    // it stands.
    if (hash2(i * 4.3 + n, 19) > surge + (u / deepest) * 0.55) continue;
    const s = scaleAt(u);
    edgeOf(hash2(i * 5.9 + n, 23), at);
    const y = snapTo(cy + at[1] * s * halfH, px);
    // ...and the raster it is being drawn onto is coming apart. **Screen space**, applied after the
    // particle knows where it belongs: the fault is in the signal, not in the thing, so a stripe of
    // the frame is displaced and everything crossing that stripe goes with it. The eruption is the
    // pit failing rather than an object misbehaving, so this is the one glitch here that corrupts
    // the picture instead of a sprite.
    xy.push(snapTo(cx + at[0] * s * halfW, px) + tearAt(y, age, H, TEAR_SLIDE * surge, px), y);
  }

  // Rows blown out whole. Rare, brief, and full width — a strip of video memory written over with
  // whatever was coming up the shaft. Only at real pressure, so they read as the eruption at its
  // worst rather than as a thing it does throughout.
  const tick = Math.floor(age * 9);
  if (surge > 0.55) {
    for (let r = 0; r < 3; r += 1) {
      if (hash2(n * 6.7 + tick * 3.3 + r, 61) > 0.16 * surge) continue;
      const y = snapTo(hash2(n * 7.9 + tick * 1.7 + r, 67) * H, px);
      const from = Math.floor(hash2(n * 8.3 + tick, 71) * W * 0.4);
      const wide = W * (0.35 + hash2(n * 9.1 + tick + r, 73) * 0.65);
      for (let x = from; x < from + wide; x += px) {
        if (hash2(x * 0.37 + tick * 2.9 + r, 79) > 0.62) continue;
        xy.push(snapTo(x, px), y);
      }
    }
  }

  if (!xy.length) return;
  ctx.fillStyle = rgba(FLARE, 1);
  ctx.beginPath();
  for (let i = 0; i < xy.length; i += 2) ctx.rect(xy[i], xy[i + 1], px, px);
  ctx.fill();
}
