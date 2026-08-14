// The channel change: what it looks like to move from one animation to the next.
//
// The stage does the mechanical part — the two scenes are drawn exactly adjacent and pushed
// vertically past each other, so between them they always cover the frame. What happens *to* that
// composite while it moves is this file, and it is **per scene**.
//
// One shared effect for the whole gallery was always wrong, and obviously so once there were three
// animations: a VHS tracking tear is the language of *Asleep Among the Stars* and nothing else, so
// arriving at a 16-bit sunset through chroma bleed and analogue smear announced the wrong thing
// about where you were going. A change wears **the scene it is arriving at**, because that is the
// picture you are left looking at when it settles — the transition's job is to introduce the next
// animation, not to eulogise the last one.
//
// Each one is built out of that scene's own primitives, so they cannot drift apart from the scene
// they belong to: the tape change is the tape artefacts, the pixel and funnel changes are the pixel
// grid, and the vapour change is the soft lobes fog is made of.

import { TAU, clamp } from '../lib/draw.js';
import { chromaSplit, deviceScale, makeTearBands, seam, tearBands } from './vhs.js';
import { bayerOn, block, chunk, hash01, pixelSize, snap } from './pixel.js';
import { lobe } from './volume.js';

/** Every change a scene may ask for by name. `meta.transition` must be one of these. */
export const TRANSITIONS = ['tape', 'pixel', 'vapour', 'funnel'];

/** Everything the changes need decided once. The stage owns one of these for the whole gallery. */
export function makeChannelChange(rng) {
  return {
    bands: makeTearBands(rng, 7),
    // The bank that rolls across the join in the vapour change. Spread *deep* as well as wide, and
    // at a real range of sizes: puffs all the same height on the same line merge into one smooth
    // white lozenge, which is a bar drawn across the picture rather than weather closing over it.
    puffs: Array.from({ length: 24 }, (_, i) => ({
      at: (i + 0.5) / 24 + rng.range(-0.04, 0.04),
      lift: rng.range(-1, 1),
      size: rng.range(0.08, 0.3),
      squash: rng.range(0.5, 0.95),
      wobble: rng.range(0.34, 0.56),
      tone: Math.floor(rng.range(0, 3)),
      phase: rng.range(0, 20),
    })),
  };
}

/**
 * Wreck the composite in the incoming scene's own language.
 *
 * @param {string} kind          the incoming scene's `meta.transition`
 * @param {number} violence      0 at both ends of the move, 1 in the middle
 * @param {number} seamY         where the two scenes meet, in CSS pixels
 */
export function channelChange(kind, ctx, W, H, t, violence, seamY, change, tape = null) {
  if (violence <= 0) return;
  if (kind === 'pixel') pixelChange(ctx, W, H, t, violence, seamY, tape);
  else if (kind === 'vapour') vapourChange(ctx, W, H, t, violence, seamY, change);
  else if (kind === 'funnel') funnelChange(ctx, W, H, t, violence, seamY, tape);
  else tapeChange(ctx, W, H, t, violence, seamY, change, tape);
}

/* ------------------------------------------------------------------ tape ---- */

/**
 * *Asleep Among the Stars*: the picture is on a tape and the tape is failing. Displaced slices,
 * chroma pulled apart, and a bright seam riding the join.
 */
function tapeChange(ctx, W, H, t, violence, seamY, change, tape) {
  tearBands(ctx, W, H, t, change.bands, 0.6 + violence * 5, tape);
  chromaSplit(ctx, W, H, t, violence * 6, tape);
  seam(ctx, W, seamY, violence);
}

/* ----------------------------------------------------------------- pixel ---- */

// Sodium amber and the copper it sits in — the two colours *Westbound on Grizzly Peak* lights its
// road with, and the only two this change is allowed to introduce.
const LAMP_CORE = '#fff4cf';
const LAMP_HOT = '#ffc65e';
const COPPER = '#8a5223';
const NIGHT = '#03061c';

/**
 * *Westbound on Grizzly Peak*: the frame is a screen full of tiles and the tiles are being
 * rewritten out of order.
 *
 * Every displacement here is a **whole number of chunks**. That is the entire discipline of the
 * scene it belongs to, and a band sliding by half a chunk is the one tell that would give the whole
 * style away — a smooth sub-pixel slide next to hard-edged art reads as neither.
 */
function pixelChange(ctx, W, H, t, violence, seamY, tape) {
  const px = pixelSize(W, H);
  const scale = deviceScale(ctx, W, H);
  const source = tape ? tape.source : ctx.canvas;
  const bandHeight = px * 6;
  const rows = Math.ceil(H / bandHeight);
  // A held clock: the tiles rewrite on a beat rather than boiling every frame, which is what a
  // machine redrawing a screen looks like.
  const beat = Math.floor(t * 14);

  for (let i = 0; i < rows; i += 1) {
    const roll = hash01(i * 3.7 + beat * 1.31);
    if (roll < 0.42) continue;
    const top = i * bandHeight;
    const height = Math.min(bandHeight, H - top);
    if (height < 1) continue;
    const dx = snap((roll - 0.5) * W * 0.9 * violence, px);
    ctx.drawImage(
      source,
      0,
      Math.round(top * scale.sy),
      Math.max(1, Math.round(W * scale.sx)),
      Math.max(1, Math.round(height * scale.sy)),
      dx,
      top,
      W,
      height,
    );
  }

  // The join, as a lamp-lit bar: a hard black shadow, the sodium core, and a dithered falloff on
  // both sides. No gradient — the falloff is the Bayer matrix, exactly as the road's light is.
  const cols = Math.ceil(W / px) + 1;
  const bar = snap(seamY, px);
  block(ctx, 0, bar - px * 2, W, px * 2, NIGHT, px);
  block(ctx, 0, bar, W, px * Math.max(1, Math.round(1 + violence * 2)), LAMP_CORE, px);

  for (const [colour, from, to] of [[LAMP_HOT, 1, 5], [COPPER, 5, 11]]) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (let r = from; r < to; r += 1) {
      const density = clamp(1 - (r - from) / (to - from), 0, 1) * violence;
      for (let c = 0; c < cols; c += 1) {
        if (bayerOn(c, r, density)) chunk(ctx, c * px, bar + r * px, px, px, px);
        if (bayerOn(c, -r, density)) chunk(ctx, c * px, bar - (r + 2) * px, px, px, px);
      }
    }
    ctx.fill();
  }
}

/* ---------------------------------------------------------------- funnel ---- */

// The scene's ramp, hottest first — the same seven steps `rose-funnel/palette.js` draws everything
// out of, and the only colours this change is allowed to introduce.
const SPIN = ['#ffe8f4', '#ff9ec8', '#f65492', '#ce226e', '#8c1c74', '#4e1656', '#260e30'];

/**
 * *The Rose Funnel*: the picture is caught in the vortex.
 *
 * It shares every primitive with the pixel change and feels like the opposite of it, and the whole
 * difference is one word: **coherent**. There, each band rolls its own dice and the frame shreds
 * along horizontal lines. Here the offset is a smooth function of height and time, so the rows stay
 * in a relationship with one another and the frame reads as being *wound* around a vertical axis
 * instead of torn across. Tearing is a fault; winding is a force, and this scene is about a force.
 *
 * The twist also flares — strongest at the join and tapering away from it — which is the funnel's
 * own profile applied to the whole frame rather than to a column of chunks.
 */
function funnelChange(ctx, W, H, t, violence, seamY, tape) {
  const px = pixelSize(W, H);
  const scale = deviceScale(ctx, W, H);
  const source = tape ? tape.source : ctx.canvas;
  const bandHeight = px * 5;
  const rows = Math.ceil(H / bandHeight);
  // A held clock, so the wind-up advances on a beat like everything else drawn on this grid.
  const beat = Math.floor(t * 12) / 12;
  const bar = snap(seamY, px);

  for (let i = 0; i < rows; i += 1) {
    const top = i * bandHeight;
    const height = Math.min(bandHeight, H - top);
    if (height < 1) continue;
    // The helix: a turn and a bit down the frame, climbing with time.
    const turn = Math.sin((top / H) * TAU * 1.35 - beat * 2.4);
    // Flared around the join. At the seam the frame is inside the mouth of the funnel; further off
    // it is caught in the outer circulation rather than left alone — the seam crosses the frame
    // during the move, so a falloff tight enough to leave most rows untouched means most of the
    // change is a bar sliding past a still picture.
    const grip = 1 - clamp(Math.abs(top - seamY) / (H * 0.85), 0, 1);
    const dx = snap(turn * W * 0.55 * violence * (0.45 + grip * 0.55), px);
    if (dx === 0) continue;
    ctx.drawImage(
      source,
      0,
      Math.round(top * scale.sy),
      Math.max(1, Math.round(W * scale.sx)),
      Math.max(1, Math.round(height * scale.sy)),
      dx,
      top,
      W,
      height,
    );
  }

  // The join wears the ramp, wrapped. Which step a column shows is a function of its position and
  // the clock, exactly the way the funnel's bands are — so the seam is a slice of the thing you are
  // arriving at rather than a bar drawn over it. Dithered falloff on both sides, never a gradient.
  const cols = Math.ceil(W / px) + 1;
  const depth = Math.max(1, Math.round(3 + violence * 11));
  const bucket = SPIN.map(() => []);
  for (let c = 0; c < cols; c += 1) {
    for (let r = -depth; r <= depth; r += 1) {
      const away = Math.abs(r) / depth;
      if (!bayerOn(c, r, (1 - away) * violence)) continue;
      const band = ((c * px) / W) * 1.6 + r * 0.06 + beat * 0.7;
      const step = Math.floor((band - Math.floor(band)) * SPIN.length);
      bucket[clamp(step + Math.round(away * 2.5), 0, SPIN.length - 1)].push(c * px, bar + r * px);
    }
  }

  // Debris, orbiting the join on an ellipse — a ring seen edge-on, which is the same read the
  // funnel's body is built on. The far half goes down the ramp instead of being drawn in front,
  // because a mote that ignores which side of the ring it is on flattens the whole thing.
  for (let i = 0; i < 110; i += 1) {
    const angle = hash01(i * 2.3) * TAU + beat * (1.4 + hash01(i * 5.1) * 1.2);
    const radius = (0.08 + hash01(i * 7.1) * 0.55) * W * violence;
    const facing = Math.sin(angle);
    const step = clamp(1 + Math.round(hash01(i * 3.3) * 2) + (facing < 0 ? 3 : 0), 0, SPIN.length - 1);
    bucket[step].push(
      snap(W * 0.5 + Math.cos(angle) * radius, px),
      snap(bar + facing * radius * 0.3, px),
    );
  }

  for (let step = 0; step < SPIN.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = SPIN[step];
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) chunk(ctx, cells[i], cells[i + 1], px, px, px);
    ctx.fill();
  }
}

/* ---------------------------------------------------------------- vapour ---- */

const STONE = [78, 84, 89];
const BONE = [172, 178, 181];
const SNOW = [243, 245, 245];
const VOID = [9, 11, 13];

/**
 * *Above the Fog*: weather closes over the join and opens again on the other side.
 *
 * Nothing is displaced and nothing is sampled — which is the point. Every other change in here
 * damages the picture; fog does not damage anything, it *hides* it, and a scene whose whole subject
 * is being unable to see is introduced by not being able to see.
 */
function vapourChange(ctx, W, H, t, violence, seamY, change) {
  const S = Math.min(W, H);
  const swell = violence * violence * (3 - 2 * violence);

  // Dark under-mass first, so the bank has a shadowed base rather than glowing from nothing.
  for (const puff of change.puffs) {
    lobe(
      ctx,
      puff.at * W,
      seamY + puff.lift * S * 0.3 * (0.4 + swell),
      S * puff.size * (0.6 + swell * 1.1),
      S * puff.size * puff.squash * (0.5 + swell * 0.9),
      puff.lift * 0.5,
      [VOID, STONE, STONE][puff.tone],
      clamp(swell * 0.5, 0, 1),
      0.2,
      puff.wobble,
      puff.phase + t * 0.9,
    );
  }

  // Then the lit tops, additively — the only way the bank reaches the near-white the scene runs to.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const puff of change.puffs) {
    lobe(
      ctx,
      puff.at * W - S * 0.02,
      seamY + puff.lift * S * 0.3 * (0.4 + swell) - S * 0.03,
      S * puff.size * (0.5 + swell * 1.0),
      S * puff.size * puff.squash * (0.44 + swell * 0.8),
      puff.lift * 0.5,
      puff.tone === 2 ? SNOW : BONE,
      clamp(swell * 0.26, 0, 1),
      0.14,
      puff.wobble,
      puff.phase + 3.1 + t * 1.1,
    );
  }
  ctx.restore();

  // And a haze over everything at the worst of it, so for a moment neither animation is legible.
  ctx.fillStyle = `rgba(196, 201, 204, ${clamp(swell * 0.42, 0, 1).toFixed(4)})`;
  ctx.fillRect(0, 0, W, H);
}
