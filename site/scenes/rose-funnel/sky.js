// The storm the funnel is hanging from, and the ground it is standing on.
//
// Both exist to do one job: give the tornado a top and a bottom. A funnel drawn against a flat field
// is a shape floating in a colour — it needs a cloud to come *out of* and a horizon to stand *on*,
// and the moment it has both, the same drawing reads as a thing in a place.
//
// Everything here is a band or a chunk. No gradients: the sky is a dithered ramp on the ordered
// Bayer matrix, which is how a machine that could not do smooth colour would have drawn it, and it
// keeps the background in the same language as the subject.

import { clamp, rgba } from '../../lib/draw.js';
import { fbm, hash2, noise2 } from '../../effects/field.js';
import { chunk, ditherRamp } from '../../effects/pixel.js';
import { EARTH, SKY, SPIN } from './palette.js';

const HORIZON = 0.88;

export function planSky(rng) {
  return {
    // The mesocyclone: the rotating mass the funnel drops out of. Lobes, not one disc — a wall cloud
    // is a pile of things at different heights turning together, and a single ellipse reads as a lid.
    wall: Array.from({ length: 30 }, () => ({
      at: rng.range(-0.75, 0.75),
      lift: rng.range(0, 1),
      size: rng.range(0.09, 0.24),
      spin: rng.range(0.4, 1.1),
      // Steps 3–5, never the last: the near-black is the ground's colour and the sky's, and a cloud
      // wearing it is a hole in the frame rather than a mass in it.
      step: 3 + Math.floor(rng.range(0, 3)),
      phase: rng.range(0, 30),
    })),
    // Rain shafts hanging out of the storm, well behind the funnel.
    shafts: Array.from({ length: 9 }, () => ({
      x: rng.next(),
      width: rng.range(0.01, 0.05),
      drop: rng.range(0.3, 0.72),
      step: 4 + Math.floor(rng.range(0, 2)),
      drift: rng.range(-0.01, 0.01),
    })),
    seed: rng.range(0, 40),
  };
}

/**
 * Everything behind the funnel is drawn one chunk step coarser than the funnel is.
 *
 * It began as economics and stayed as art. On the fine grid the background cost eight times what the
 * subject cost — a full-frame dithered ramp is twenty-three thousand cells before the storm draws a
 * thing — and at `px * 2` all of it quarters. But it also *reads* better: a coarser chunk is the
 * oldest depth cue in the medium, so the storm sits back behind the funnel instead of competing with
 * it for the same plane, and the sky's dither stops being a fine speckle you have to look past and
 * becomes a texture you can see. Both grids are multiples of the same chunk, so nothing misaligns.
 */
const backPixel = (px) => px * 2;

export function drawSky(ctx, W, H, t, sky, px) {
  const horizonY = H * HORIZON;
  const bpx = backPixel(px);

  // The sky itself: six bands with dithered joins, darkest at the top. The blend is wide — at this
  // chunk size a narrow one puts the whole transition in a row or two and the join reads as a dotted
  // line ruled across the sky rather than as one colour giving way to another.
  ditherRamp(ctx, W, 0, horizonY, SKY, bpx, { blend: 0.9 });

  drawShafts(ctx, W, H, t, sky, bpx, horizonY);
  drawWall(ctx, W, H, t, sky, bpx);
  drawGround(ctx, W, H, t, bpx, horizonY);
}

/** Rain, falling in columns a long way behind everything else. */
function drawShafts(ctx, W, H, t, sky, px, horizonY) {
  for (const shaft of sky.shafts) {
    ctx.fillStyle = rgba(SPIN[shaft.step], 0.3);
    ctx.beginPath();
    const x = (shaft.x + t * shaft.drift) % 1;
    const cols = Math.max(1, Math.round((shaft.width * W) / px));
    const rows = Math.round((horizonY * shaft.drop) / px);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        // Thinning as it falls, and streaked rather than solid.
        const fade = 1 - r / rows;
        if (noise2(c * 2.3 + shaft.x * 40, r * 0.4 - t * 6) > 0.35 + fade * 0.4) continue;
        chunk(ctx, x * W + c * px, r * px, px, px, px);
      }
    }
    ctx.fill();
  }
}

/**
 * The wall cloud: lobes of chunk turning together at the top of the frame.
 *
 * It starts with a solid roof rather than lobes alone. A funnel needs to hang out of *something* —
 * with only lobes, the storm is a row of separate puffs and the tornado's mouth ends in mid-air
 * between two of them. The roof is the mass; the lobes are its underside.
 */
function drawWall(ctx, W, H, t, sky, px) {
  ctx.fillStyle = rgba(SPIN[5], 1);
  ctx.fillRect(0, 0, W, H * 0.09);

  const bucket = SPIN.map(() => []);
  for (const lobe of sky.wall) {
    const angle = t * 0.16 * lobe.spin + lobe.phase;
    const cx = W * (0.5 + lobe.at * 0.55) + Math.cos(angle) * W * 0.05;
    const cy = H * (0.05 + lobe.lift * 0.17) + Math.sin(angle) * H * 0.02;
    const rx = W * lobe.size;
    const ry = rx * 0.5;
    const cols = Math.max(1, Math.round(rx / px));
    const rows = Math.max(1, Math.round(ry / px));
    for (let r = -rows; r <= rows; r += 1) {
      for (let c = -cols; c <= cols; c += 1) {
        const d = Math.hypot(c / cols, r / rows);
        if (d > 1) continue;
        // A soft mass with a hard edge, which is the whole trick of a pixel cloud: the *density*
        // falls off, the colour does not.
        const churn = fbm(c * 0.26 + lobe.phase, r * 0.38 - t * 0.25, 2);
        if (churn < d * 0.9) continue;
        bucket[clamp(lobe.step + Math.round(d * 1.6), 0, SPIN.length - 1)].push(cx + c * px, cy + r * px);
      }
    }
  }

  for (let step = 0; step < SPIN.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(SPIN[step], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) chunk(ctx, cells[i], cells[i + 1], px, px, px);
    ctx.fill();
  }
}

/** The ground: flat, dark, and lit only along the horizon where the storm is behind it. */
function drawGround(ctx, W, H, t, px, horizonY) {
  ctx.fillStyle = EARTH[2];
  ctx.fillRect(0, horizonY, W, H - horizonY);

  // A band of field just under the horizon, and a scatter of chunk that reads as ground texture
  // rushing past. It is the only thing telling you the camera is not standing still.
  const cols = Math.ceil(W / px) + 1;
  const rows = Math.ceil((H - horizonY) / px);
  for (let i = 0; i < 2; i += 1) {
    ctx.fillStyle = EARTH[i];
    ctx.beginPath();
    for (let r = 0; r < rows; r += 1) {
      // Nearer rows scroll faster, which is the cheapest parallax there is.
      const speed = 0.6 + (r / rows) * 5.5;
      for (let c = 0; c < cols; c += 1) {
        // Low frequency on both axes, so neighbouring chunks agree and the ground comes out in
        // patches. Sampled per chunk, the same noise gives every cell an independent value and the
        // result is television snow — which is a texture, but not a landscape.
        const n = fbm(c * 0.22 + t * speed * 0.12, r * 0.35 + i * 9.1, 2);
        if (Math.floor(n * 2.999) !== i) continue;
        chunk(ctx, c * px, horizonY + r * px, px, px, px);
      }
    }
    ctx.fill();
  }

  // The horizon line itself, lit from behind.
  ctx.fillStyle = rgba(SPIN[3], 0.55);
  ctx.fillRect(0, horizonY - px, W, px);
}

/** A slow pulse of light in the cloud. Rare, brief, and never in the same place twice. */
export function drawLightning(ctx, W, H, t, sky) {
  const n = Math.floor(t / 7.3);
  const into = t / 7.3 - n;
  if (into > 0.06) return;
  // Where this particular strike is, hashed off the strike's index so it never repeats and never
  // needs remembering.
  const at = 0.12 + hash2(n, sky.seed) * 0.76;
  // A few frames of flash, then nothing. A long fade would be a lamp, not a strike.
  const flash = (1 - into / 0.06) ** 2.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(SPIN[1], flash * 0.16);
  ctx.fillRect(0, 0, W, H * 0.5);
  ctx.fillStyle = rgba(SPIN[0], flash * 0.1);
  ctx.fillRect(W * (at - 0.16), 0, W * 0.32, H * 0.2);
  ctx.restore();
}
