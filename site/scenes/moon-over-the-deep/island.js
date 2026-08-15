// The island.
//
// It is a silhouette and it stays one. Everything else in the frame is a surface being described by
// value — the moon's limb, the sea's depth, the glow's falloff — and the island is the one thing that
// is described by **outline alone**, at the very bottom of every ramp. That contrast is most of what
// "stark" means here: a hole in the picture, shaped like land, with a moonlit sea behind it.
//
// The one concession is a single step of rim light along the edge that faces the moon. Without it a
// black shape at the horizon reads as a gap in the drawing; with it the shape is *lit from somewhere*
// and the somewhere is the moon, which ties the far half of the picture to the near half.
//
// And it has a reflection, broken on the same swell the water is drawn with — the island's own
// darkness laid on the sea and chopped up by the waves passing under it. It fades within a few rows,
// because a reflection is only ever as long as the water is calm and this water is not.

import { hash2, noise2 } from '../../effects/field.js';
import { clamp, rgba } from '../../lib/draw.js';
import { LAND, LAND_RIM } from './palette.js';
import { surfaceAt } from './water.js';
import { waterlineAt } from './layout.js';

export function planIsland(rng) {
  return {
    // Away from the moon, and off-centre. An island under the moon would stand in the path, which is
    // the one thing in this composition that must not be interrupted.
    at: rng.range(0.66, 0.78),
    wide: rng.range(0.15, 0.22),
    tall: rng.range(0.055, 0.085),
    seed: rng.range(0, 70),
    // Two summits rather than one: a single hump is a whale, and three is a mountain range.
    peaks: [
      { at: rng.range(-0.3, -0.1), h: 1, w: rng.range(0.3, 0.42) },
      { at: rng.range(0.12, 0.34), h: rng.range(0.5, 0.78), w: rng.range(0.22, 0.34) },
    ],
  };
}

/** The island's skyline as a height in pixels above the waterline, for a screen x. */
function ridgeAt(plan, W, H, x) {
  const half = plan.wide * W;
  const u = (x - plan.at * W) / half;
  if (Math.abs(u) > 1) return 0;
  let h = 0;
  for (const p of plan.peaks) {
    const d = (u - p.at) / p.w;
    if (Math.abs(d) < 1) h = Math.max(h, p.h * (1 - d * d) ** 0.75);
  }
  // The shore: whatever the peaks did, the profile has to reach zero at both ends or the island is a
  // block with a hill on it.
  h *= (1 - u * u) ** 0.35;
  // ...and a little erosion, so the ridge is a ridge and not an arc.
  h += noise2(u * 5.2 + plan.seed, 0) * 0.16 * (1 - u * u);
  return Math.max(0, h) * plan.tall * H;
}

export function drawIsland(ctx, W, H, t, plan, water, moon, px) {
  const line = waterlineAt(H, px);
  const half = plan.wide * W;
  const from = Math.floor((plan.at * W - half) / px);
  const to = Math.ceil((plan.at * W + half) / px);
  const mass = [];
  const rim = [];

  for (let col = from; col <= to; col += 1) {
    const x = col * px;
    const top = ridgeAt(plan, W, H, x + px * 0.5);
    if (top < px * 0.6) continue;
    const rows = Math.round(top / px);
    // Which way the light is coming from. One comparison, and it decides which slope is rimmed.
    const facing = x < moon.cx;
    const nextTop = ridgeAt(plan, W, H, x + px * (facing ? 1.5 : -0.5));
    // A chunk is on the rim if the skyline is climbing away from it toward the moon — that is the
    // edge the light grazes, and it is a discrete test rather than a shading term because there is
    // no room at this size for a gradient along a coastline.
    const lipped = nextTop > top + px * 0.25;
    for (let r = 0; r < rows; r += 1) {
      (lipped && r === rows - 1 ? rim : mass).push(x, line - (r + 1) * px);
    }
    if (!lipped && rows > 0) rim.push(x, line - rows * px);
  }

  for (const [cells, colour] of [[mass, LAND], [rim, LAND_RIM]]) {
    if (!cells.length) continue;
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) ctx.rect(cells[i], cells[i + 1], px, px);
    ctx.fill();
  }

  drawWake(ctx, W, H, t, plan, water, px, line);
}

/**
 * The island's own darkness, laid on the water and broken by it.
 *
 * Drawn *over* the sea rather than mixed into it, and only where the swell is not showing its lit
 * face — so the reflection is interrupted by every wave that passes under it. A solid smear would be
 * a shadow, and shadows do not exist at night on water.
 */
function drawWake(ctx, W, H, t, plan, water, px, line) {
  const half = plan.wide * W;
  const from = Math.floor((plan.at * W - half) / px);
  const to = Math.ceil((plan.at * W + half) / px);
  const rows = Math.round((H * 0.1) / px);
  ctx.fillStyle = rgba(LAND, 1);
  ctx.beginPath();
  for (let r = 0; r < rows; r += 1) {
    const y = line + r * px;
    const d = (r + 0.5) / Math.max(1, (H - line) / px);
    const fade = 1 - r / rows;
    for (let col = from; col <= to; col += 1) {
      const x = col * px;
      const top = ridgeAt(plan, W, H, x + px * 0.5);
      if (top < px * 0.6) continue;
      // As tall as the island is, upside down, and thinning fast.
      if (r * px > top * 1.15) continue;
      const { slope } = surfaceAt(water, t, x / W, d);
      // The lit faces punch through it; the troughs keep it.
      if (clamp(slope, 0, 1) ** 2 > 0.1) continue;
      if (hash2(col * 1.9 + plan.seed, r * 2.7) > fade * 0.85 + 0.15) continue;
      ctx.rect(x, y, px, px);
    }
  }
  ctx.fill();
}
