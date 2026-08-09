// Drawing on a pixel grid: the shared 16-bit toolkit.
//
// Everything here exists to make a canvas — which is happy to draw anything at any sub-pixel
// position with a smooth gradient — behave like hardware that could do none of that. Coordinates
// snap to a chunk a few screen pixels across, gradients become flat bands with ordered dither
// between them, and light falls off in visible steps rather than smoothly.
//
// Extracted from "Westbound on Grizzly Peak", which is where all of it was worked out. Any scene
// that wants the same look imports it from here rather than growing its own copy.

import { TAU, clamp } from '../lib/draw.js';

/**
 * One chunk of the grid, in CSS pixels. Tied to the short edge so the art is the same *coarseness*
 * on a phone and on a monitor rather than the same number of chunks — a fixed chunk count makes a
 * wide window look like a different game.
 */
export function pixelSize(W, H) {
  return Math.max(2, Math.round(Math.min(W, H) / 190));
}

/** Snap to the grid. Everything drawn goes through this or it does not belong in the frame. */
export const snap = (v, px) => Math.round(v / px) * px;

/** A rectangle on the grid, appended to the open path. */
export function chunk(ctx, x, y, w, h, px) {
  const x0 = snap(x, px);
  const y0 = snap(y, px);
  ctx.rect(x0, y0, Math.max(px, snap(w, px)), Math.max(px, snap(h, px)));
}

/**
 * The 4x4 ordered matrix every 16-bit gradient in the world was built out of. Returns whether a
 * chunk at (col, row) is set at this density — so a band can be 3/16 of the way to the next colour
 * without a single new colour being introduced.
 */
const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];
export const bayerOn = (col, row, density) =>
  BAYER[(((row % 4) + 4) % 4) * 4 + (((col % 4) + 4) % 4)] < density * 16;

/**
 * A vertical ramp through a list of colours, as flat bands with dithered joins.
 *
 * This is the single most important function in the scene. A `createLinearGradient` here would be
 * one call and would look completely wrong: smooth colour is the thing 16-bit hardware could not
 * do, and its absence is most of why this style reads as it does. So each pair of neighbouring
 * colours gets a run of rows where the upper colour is punched through by the lower one on the
 * Bayer matrix, at a density climbing from nothing to everything.
 */
export function ditherRamp(ctx, W, top, bottom, colours, px, { blend = 0.45 } = {}) {
  const rows = Math.max(1, Math.round((bottom - top) / px));
  const steps = colours.length - 1;
  const cols = Math.ceil(W / px) + 1;

  for (let s = 0; s <= steps; s += 1) {
    const from = Math.round((s / (steps + 1)) * rows);
    const to = Math.round(((s + 1) / (steps + 1)) * rows);
    ctx.fillStyle = colours[Math.min(s, steps)];
    ctx.beginPath();
    ctx.rect(0, top + from * px, W, (to - from) * px + px);
    ctx.fill();
  }

  // Then punch each join through with the colour below it.
  for (let s = 0; s < steps; s += 1) {
    const joinRow = Math.round(((s + 1) / (steps + 1)) * rows);
    const span = Math.max(2, Math.round((rows / (steps + 1)) * blend));
    ctx.fillStyle = colours[s + 1];
    ctx.beginPath();
    for (let r = -span; r < span; r += 1) {
      const row = joinRow + r;
      if (row < 0 || row >= rows) continue;
      const density = clamp((r + span) / (span * 2), 0, 1);
      for (let c = 0; c < cols; c += 1) {
        if (bayerOn(c, row, density)) chunk(ctx, c * px, top + row * px, px, px, px);
      }
    }
    ctx.fill();
  }
}

/** A flat block of colour, snapped. */
export function block(ctx, x, y, w, h, colour, px) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  chunk(ctx, x, y, w, h, px);
  ctx.fill();
}

/**
 * A dithered disc — the 16-bit way to make light fall off. Concentric rings, each a Bayer density
 * of the same colour, so a lamp's halo is made of visible chunks rather than a soft gradient.
 */
export function ditherGlow(ctx, cx, cy, radius, colour, strength, px, squash = 1, falloff = 1.6) {
  if (radius < px || strength <= 0.01) return;
  const ry = Math.max(px, radius * squash);
  // Scanned as a box rather than as rings. Rings sound cheaper and are wrong: successive rings do
  // not tile the grid, so the halo comes out as scattered specks with gaps between them instead of
  // a solid falling-off field. The scan visits every chunk once and decides it on the matrix.
  ctx.fillStyle = colour;
  ctx.beginPath();
  const x0 = snap(cx - radius, px);
  const x1 = snap(cx + radius, px);
  const y0 = snap(cy - ry, px);
  const y1 = snap(cy + ry, px);
  for (let y = y0; y <= y1; y += px) {
    const dy = (y - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const span = Math.sqrt(1 - dy * dy);
    for (let x = cx - radius * span; x <= cx + radius * span; x += px) {
      const dx = (x - cx) / radius;
      const density = (1 - Math.min(1, Math.hypot(dx, dy))) ** falloff * strength;
      if (density > 0.02 && bayerOn(Math.round(x / px), Math.round(y / px), density)) {
        chunk(ctx, x, y, px, px, px);
      }
    }
  }
  ctx.fill();
}

/** The same deterministic value noise the tape uses, kept local so the scene owns no imports. */
export const hash01 = (n) => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};
