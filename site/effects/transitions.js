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

import { TAU, clamp, wrap01 } from '../lib/draw.js';
import { chromaSplit, deviceScale, makeTearBands, seam, tearBands } from './vhs.js';
import { bayerOn, block, chunk, hash01, pixelSize, snap } from './pixel.js';
import { lobe } from './volume.js';

/** Every change a scene may ask for by name. `meta.transition` must be one of these. */
export const TRANSITIONS = ['tape', 'pixel', 'vapour', 'funnel', 'tide', 'pit'];

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
  else if (kind === 'tide') tideChange(ctx, W, H, t, violence, seamY, tape);
  else if (kind === 'pit') pitChange(ctx, W, H, t, violence, seamY);
  else tapeChange(ctx, W, H, t, violence, seamY, change, tape);
}

/**
 * The shaft, in the colours it wears at the depths this change reaches. Flat, few, and far apart —
 * the scene being arrived at has no ramp in it and nothing to dither with, so neither does this.
 */
const PIT_WALL = ['#48546f', '#303852', '#1e2438', '#101426', '#06080f'];

/** How much smaller each ring is than the one outside it. The scene's own ratio. */
const PIT_RATIO = 0.86;

/**
 * The `pit` change: the picture is swallowed and white is thrown back out over it.
 *
 * The scene this introduces is one idea — a hole made of flat concentric rings, receding forever
 * because the scale is geometric — and one event: everything stops and the pit erupts pure white
 * pixels. So the change is those two things and nothing else. The mouth opens over whatever you were
 * looking at, ring by ring, each a flat colour with a hard edge; and white pixels pour out of the
 * middle along the same rays the scene's own eruption uses, accelerating outward because a constant
 * rate through a geometric scale *is* an acceleration.
 *
 * It opens on the **seam** rather than on the frame centre. That is where the two pictures are being
 * pushed past each other, so it is the one line in the frame that already means something — the pit
 * opens at the join, which reads as the join being what gives way.
 */
function pitChange(ctx, W, H, t, violence, seamY) {
  const px = pixelSize(W, H);
  const cx = snap(W / 2, px);
  const cy = snap(H / 2 + (seamY - H / 2) * 0.6, px);
  // Past one at the peak, so the outermost ring is off-frame and the mouth has no visible edge of
  // its own — what you see is rings arriving from outside the picture, not a circle growing in it.
  const open = violence * 1.35;
  if (open <= 0) return;

  for (let j = 0; ; j += 1) {
    const s = open * PIT_RATIO ** j;
    const w = Math.max(px, snap(W * s, px));
    const h = Math.max(px, snap(H * s, px));
    if (w <= px && h <= px) break;
    ctx.fillStyle = PIT_WALL[Math.min(PIT_WALL.length - 1, j >> 1)];
    ctx.fillRect(cx - snap(w / 2, px), cy - snap(h / 2, px), w, h);
  }

  // ...and what comes back up. Same rays, same geometry, and the only white in the scene.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 900; i += 1) {
    const out = wrap01(hash01(i * 3.1) + t * (0.42 + hash01(i * 7.7) * 0.55));
    // Exponential in the depth coordinate, which is what turns a constant rate into a rush.
    const s = open * Math.exp(out * 3.4) * 0.06;
    if (s > 1.4 || hash01(i * 11.3) > violence) continue;
    // Around the ring: a rectangle similar to the frame, so the last of them leave at the corners.
    const q = wrap01(hash01(i * 5.3)) * 4;
    const side = q | 0;
    const f = (q - side) * 2 - 1;
    const ex = side === 0 ? f : side === 1 ? 1 : side === 2 ? -f : -1;
    const ey = side === 0 ? -1 : side === 1 ? f : side === 2 ? 1 : -f;
    ctx.rect(snap(cx + ex * s * W * 0.5, px), snap(cy + ey * s * H * 0.5, px), px, px);
  }
  ctx.fill();
}

/* ------------------------------------------------------------------ tide ---- */

/** The sea's own ramp, short enough to carry as a literal. */
const TIDE = ['#3a539c', '#1e326d', '#16275c', '#0b163c', '#050a22', '#01020a'];
const GLINT = ['#ffffff', '#cfe0fb', '#7d9bd8'];

/**
 * Arriving at *Moon Over the Deep*: the picture floods.
 *
 * Every other change in the gallery is something happening **to** the frame — torn, chunked, wound,
 * fogged. This one is the frame **going under**, and the difference matters because the scene it
 * introduces has a waterline in it: what settles at the end of the move is a horizon, so the move
 * should be the moment that horizon arrives.
 *
 * Rows below the line are displaced sideways by the same rolling swell the water is drawn with — a
 * long roller and a short one, phase advancing with the clock — so the outgoing picture is not
 * covered up, it is **refracted**, which is what looking at something through moving water does. And
 * they are pulled down the sea's own ramp with depth, so the further under a row is the more of it
 * has become sea and the less of it is still whatever it used to be.
 *
 * Then the surface itself: a scatter of glints along the line, on the same specular condition the
 * moonpath uses — bright where the swell's slope would bounce a light at you. It is the scene's one
 * unmistakable signature, and putting it on the seam means the thing you recognise is already there
 * before the picture has finished settling.
 */
function tideChange(ctx, W, H, t, violence, seamY, tape) {
  const px = pixelSize(W, H);
  const scale = deviceScale(ctx, W, H);
  const source = tape ? tape.source : ctx.canvas;
  const line = snap(seamY, px);
  const bandHeight = px * 2;

  // Refraction: everything under the line slides on the swell, and nothing above it moves at all.
  for (let top = line; top < H; top += bandHeight) {
    const height = Math.min(bandHeight, H - top);
    if (height < 1) continue;
    const under = (top - line) / Math.max(1, H - line);
    const roll = Math.sin(under * 7.5 - t * 2.1) + 0.45 * Math.sin(under * 19 - t * 3.4);
    const dx = snap(roll * W * 0.055 * violence * (0.35 + under * 0.9), px);
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

  // ...and drowns. Depth takes a row down the ramp, dithered, so the fade is a sequence of steps
  // rather than a wash — which is the whole language of the scene being arrived at.
  const cols = Math.ceil(W / px) + 1;
  const rows = Math.ceil((H - line) / px);
  const bucket = TIDE.map(() => []);
  for (let r = 0; r < rows; r += 1) {
    const under = r / Math.max(1, rows);
    const sink = clamp(violence * (0.25 + under * 1.5), 0, 1);
    for (let c = 0; c < cols; c += 1) {
      if (!bayerOn(c, r, sink)) continue;
      const shade = clamp(Math.round(under * (TIDE.length - 1) + Math.sin(c * 0.3 - r * 0.5 - t * 2) * 0.6), 0, TIDE.length - 1);
      bucket[shade].push(c * px, line + r * px);
    }
  }
  for (let step = 0; step < TIDE.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = TIDE[step];
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) chunk(ctx, cells[i], cells[i + 1], px, px, px);
    ctx.fill();
  }

  // The surface, and the moon already on it.
  const glints = GLINT.map(() => []);
  for (let c = 0; c < cols; c += 1) {
    for (let r = -2; r <= 5; r += 1) {
      const away = Math.abs(r) / 5;
      const slope = Math.cos(c * 0.22 - t * 3.1) * 0.6 + Math.cos(c * 0.07 - t * 1.5);
      const lit = clamp(slope, 0, 1) ** 3 * (1 - away) * violence;
      if (lit < 0.12 || !bayerOn(c, r, lit)) continue;
      glints[clamp(Math.round((1 - lit) * 2.4), 0, GLINT.length - 1)].push(c * px, line + r * px);
    }
  }
  for (let step = 0; step < GLINT.length; step += 1) {
    const cells = glints[step];
    if (!cells.length) continue;
    ctx.fillStyle = GLINT[step];
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) chunk(ctx, cells[i], cells[i + 1], px, px, px);
    ctx.fill();
  }
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
