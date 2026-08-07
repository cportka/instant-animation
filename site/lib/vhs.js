// VHS artefacts: tracking bands, scanlines, chroma fringe, grain.
//
// The trick that makes *real* distortion possible with no second canvas and no DOM access:
// a 2D context can sample its own bitmap — `ctx.drawImage(ctx.canvas, …)`. Source coordinates are
// raw device pixels; destination coordinates pass through the current transform (CSS pixels), so
// everything here converts between the two.
//
// Bands are processed top to bottom and may overlap slightly. That's not a bug worth fixing — a
// tracking error smearing into the one below it is exactly the artefact being imitated.

import { clamp, wrap01 } from './draw.js';

/** Device pixels per CSS pixel, read off the context's own bitmap. */
export function deviceScale(ctx, width, height) {
  const canvas = ctx.canvas || {};
  const sx = canvas.width ? canvas.width / width : 1;
  const sy = canvas.height ? canvas.height / height : 1;
  return { sx: sx || 1, sy: sy || 1 };
}

/** Deterministic value noise — no Math.random, so a frame always looks the same. */
export const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export function makeTearBands(rng, count = 5) {
  return Array.from({ length: count }, () => ({
    offset: rng.next(),
    speed: rng.range(0.01, 0.036), // fraction of the screen per second — slow on purpose
    heightFrac: rng.range(0.03, 0.12), // tall and soft, not thin and graphic
    shiftFrac: rng.range(0.003, 0.014),
    wobble: rng.range(0.3, 1.1),
    phase: rng.range(0, Math.PI * 2),
  }));
}

/**
 * Horizontal tracking bands: slices of the frame nudged sideways, edged in chroma fringe.
 * `intensity` scales the displacement — 1 for ambient drift, higher during a channel change.
 */
export function tearBands(ctx, W, H, t, bands, intensity = 1) {
  if (intensity <= 0) return;
  const { sx, sy } = deviceScale(ctx, W, H);
  const sourceWidth = Math.max(1, Math.round(W * sx));

  for (const band of bands) {
    const height = Math.max(2, band.heightFrac * H * (0.65 + 0.35 * Math.sin(t * band.wobble + band.phase)));
    const y = wrap01(band.offset + t * band.speed) * (H + height) - height;
    const top = clamp(y, 0, H);
    const bottom = clamp(y + height, 0, H);
    const visible = bottom - top;
    // A band half off screen would squeeze its whole colour bleed into a few pixels — a bright
    // line rather than a wash. Let it finish entering first.
    if (visible < height * 0.5) continue;

    const shift = Math.sin(t * band.wobble * 1.7 + band.phase * 2) * band.shiftFrac * W * intensity;

    ctx.drawImage(
      ctx.canvas,
      0,
      Math.round(top * sy),
      sourceWidth,
      Math.max(1, Math.round(visible * sy)),
      shift,
      top,
      W,
      visible,
    );

    // Chroma bleed on the torn edges — the colour separation is what sells it as tape. It has to
    // be a gradient: a hard-edged fill reads as a neon rule ruled across the picture, not as a
    // tracking error.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // The bleed has to run the full height of the band. Fading it out near the edges leaves the
    // colour concentrated in two thin lines, and the picture ends up ruled with neon.
    const fringe = ctx.createLinearGradient(0, top, 0, bottom);
    fringe.addColorStop(0, `rgba(255, 74, 200, ${clamp(0.11 * intensity, 0, 1)})`);
    fringe.addColorStop(0.5, 'rgba(190, 140, 230, 0)');
    fringe.addColorStop(1, `rgba(80, 240, 255, ${clamp(0.1 * intensity, 0, 1)})`);
    ctx.fillStyle = fringe;
    ctx.fillRect(shift, top, W, visible);
    ctx.restore();
  }
}

/** Fine horizontal lines, rolling slowly. The one artefact that reads as "CRT" on its own. */
export function scanlines(ctx, W, H, t, { spacing = 4, alpha = 0.16, rollSpeed = 6 } = {}) {
  const roll = (t * rollSpeed) % spacing;
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  for (let y = -spacing + roll; y < H; y += spacing) {
    ctx.fillRect(0, y, W, 1);
  }
}

/** A whole-frame colour split — magenta left, cyan right, both very faint. */
export function chromaSplit(ctx, W, H, t, intensity = 1) {
  if (intensity <= 0) return;
  const { sx, sy } = deviceScale(ctx, W, H);
  const offset = (0.8 + Math.sin(t * 0.31) * 0.6) * intensity;
  if (Math.abs(offset) < 0.2) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(0.05 * intensity, 0, 1);
  ctx.drawImage(ctx.canvas, 0, 0, Math.round(W * sx), Math.round(H * sy), -offset, 0, W, H);
  ctx.drawImage(ctx.canvas, 0, 0, Math.round(W * sx), Math.round(H * sy), offset, 0, W, H);
  ctx.restore();
}

/** Sparse tape dropouts — a handful of bright specks that resettle a few times a second. */
export function grain(ctx, W, H, t, { count = 40, alpha = 0.16, rate = 12 } = {}) {
  const frame = Math.floor(t * rate);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i += 1) {
    const seed = frame * 97 + i * 7.13;
    const x = hash(seed) * W;
    const y = hash(seed + 1.7) * H;
    const width = 1 + hash(seed + 3.1) * 5;
    ctx.fillStyle = `rgba(255, 235, 255, ${alpha * hash(seed + 5.5)})`;
    ctx.fillRect(x, y, width, 1);
  }
  ctx.restore();
}

/** The bright seam where two scenes meet during a channel change. */
export function seam(ctx, W, y, intensity) {
  if (intensity <= 0) return;
  const thickness = 2 + intensity * 10;
  const bleed = ctx.createLinearGradient(0, y - thickness * 3, 0, y + thickness * 3);
  bleed.addColorStop(0, 'rgba(80, 240, 255, 0)');
  bleed.addColorStop(0.42, `rgba(80, 240, 255, ${0.5 * intensity})`);
  bleed.addColorStop(0.5, `rgba(255, 255, 255, ${0.85 * intensity})`);
  bleed.addColorStop(0.58, `rgba(255, 74, 200, ${0.5 * intensity})`);
  bleed.addColorStop(1, 'rgba(255, 74, 200, 0)');

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = bleed;
  ctx.fillRect(0, y - thickness * 3, W, thickness * 6);
  ctx.restore();
}
