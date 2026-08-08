// VHS artefacts: tracking bands, scanline shred, chroma smear, dropout bars, dither, grain.
//
// Modelled on a real tape failure (see the reference analysis in the PR that added it). Six
// artefacts define that look, in order of how much they matter:
//
//   1. per-scanline horizontal displacement — many thin lines, each offset differently
//   2. extreme chroma — colour pushed to saturated neon while luma structure survives
//   3. horizontal smear — long trails dragged out of high-contrast edges
//   4. hexagonal honeycomb dither in the flat fields
//   5. dropout bars — thick dark full-width bands with noise, offset sideways
//   6. fine scanlines, plus hairline full-width tears
//
// The displacement is real, not an overlay: slices of the rendered frame are copied back over it
// with `drawImage`. Source coordinates are raw device pixels; destination coordinates pass through
// the current transform (CSS pixels), so every helper here converts between the two.
//
// Every helper that samples the frame takes an optional `tape` — see `createTape` for why that
// matters enormously, and what happens without one.
//
// Bands are processed top to bottom and may overlap slightly. That's not a bug worth fixing — a
// tracking error smearing into the one below it is exactly the artefact being imitated.

import { TAU, clamp, wrap01 } from './draw.js';

// Bounds the worst case: a tall zone on a tall screen must not quietly ask for hundreds of blits.
const MAX_SHRED_LINES = 26;

/** Device pixels per CSS pixel, read off the context's own bitmap. */
export function deviceScale(ctx, width, height) {
  const canvas = ctx.canvas || {};
  const sx = canvas.width ? canvas.width / width : 1;
  const sy = canvas.height ? canvas.height / height : 1;
  return { sx: sx || 1, sy: sy || 1 };
}

/**
 * A scratch copy of the frame for the displacement effects to read from.
 *
 * This is not an optimisation detail, it is the difference between the effect being usable and
 * not. Measured in headless Chromium at 2880x1800: 78 slices copied from the destination canvas
 * onto *itself* cost **948ms**; the same 78 read from a separate buffer cost **4.2ms**, and the
 * one full copy that fills the buffer is free. Sampling a canvas you are simultaneously drawing
 * into forces a flush per call.
 *
 * The stage owns one of these and hands it to the scene, so scenes still never touch the DOM.
 * Without one, every helper falls back to `ctx.canvas` — correct, just slow — which is what the
 * headless tests exercise.
 */
export function createTape() {
  let canvas = null;
  if (typeof OffscreenCanvas === 'function') canvas = new OffscreenCanvas(1, 1);
  else if (typeof document !== 'undefined' && document.createElement) canvas = document.createElement('canvas');
  if (!canvas) return null;

  const buffer = canvas.getContext('2d', { alpha: false });
  if (!buffer) return null;

  return {
    source: canvas,
    /** Snapshot the destination canvas as it stands. Call again to re-snapshot; it's ~free. */
    capture(ctx) {
      const from = ctx.canvas;
      if (!from?.width) return;
      if (canvas.width !== from.width || canvas.height !== from.height) {
        canvas.width = from.width;
        canvas.height = from.height;
      }
      buffer.setTransform(1, 0, 0, 1, 0, 0);
      buffer.drawImage(from, 0, 0);
    },
  };
}

const sourceOf = (ctx, tape) => tape?.source ?? ctx.canvas;

/** Fold a value back into [-span/2, span/2] by wrapping rather than clipping. */
const fold = (value, span) => (((value % span) + span * 1.5) % span) - span / 2;

/**
 * A damage envelope that *dwells* at its peak instead of touching it in passing.
 *
 * A plain `sin(u·π)^shape` bump is at full value for a single instant, so the worst moment of a
 * fault is gone before the eye has settled on it — you register that something happened, not what.
 * This splices `hold` seconds of the peak into the middle of that bump: the rise and the fall keep
 * exactly the shape they had, and the top becomes a plateau. The tape stays broken long enough to
 * be read as broken.
 *
 * @param {number} at seconds since the pulse began; outside [0, rise + hold) the envelope is 0
 * @param {number} rise the width of the original bump — the rise and the fall together
 * @param {number} hold seconds spent pinned at full value, inserted at the peak
 * @param {number} shape exponent on the sine; >1 peaks sharply, <1 fattens the shoulders
 */
export function heldPulse(at, rise, hold, shape = 1) {
  if (at < 0 || at >= rise + hold) return 0;
  const half = rise / 2;
  if (at > half && at <= half + hold) return 1;
  // Before the plateau the clock runs straight; after it, rewind by the held time so the fall
  // resumes from exactly where the rise stopped.
  const u = at <= half ? at : at - hold;
  return Math.sin((u / rise) * Math.PI) ** shape;
}

/** Deterministic value noise — no Math.random, so a frame always looks the same. */
export const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** Copy a horizontal slice of the frame back over it, offset and optionally stretched. */
function blitSlice(ctx, source, W, H, scale, { top, height, dx = 0, dw = W }) {
  const clampedTop = clamp(top, 0, H);
  const bottom = clamp(top + height, 0, H);
  const visible = bottom - clampedTop;
  if (visible < 0.5) return 0;
  ctx.drawImage(
    source,
    0,
    Math.round(clampedTop * scale.sy),
    Math.max(1, Math.round(W * scale.sx)),
    Math.max(1, Math.round(visible * scale.sy)),
    dx,
    clampedTop,
    dw,
    visible,
  );
  return visible;
}

export function makeTearBands(rng, count = 5) {
  return Array.from({ length: count }, () => ({
    offset: rng.next(),
    speed: rng.range(0.01, 0.036), // fraction of the screen per second — slow on purpose
    heightFrac: rng.range(0.03, 0.12), // tall and soft, not thin and graphic
    shiftFrac: rng.range(0.004, 0.02),
    wobble: rng.range(0.3, 1.1),
    phase: rng.range(0, TAU),
  }));
}

/**
 * Horizontal tracking bands: slices of the frame nudged sideways, edged in chroma bleed.
 * `intensity` scales the displacement — 1 for ambient drift, higher during a burst.
 */
export function tearBands(ctx, W, H, t, bands, intensity = 1, tape = null) {
  if (intensity <= 0) return;
  const scale = deviceScale(ctx, W, H);
  const source = sourceOf(ctx, tape);

  for (const band of bands) {
    const height = Math.max(2, band.heightFrac * H * (0.65 + 0.35 * Math.sin(t * band.wobble + band.phase)));
    const y = wrap01(band.offset + t * band.speed) * (H + height) - height;
    const top = clamp(y, 0, H);
    const bottom = clamp(y + height, 0, H);
    const visible = bottom - top;
    // A band half off screen would squeeze its whole colour bleed into a few pixels — a bright
    // line rather than a wash. Let it finish entering first.
    if (visible < height * 0.5) continue;

    // Clamped rather than folded: there are only six bands, all driven by sines, and folding can
    // drop several of them near zero at once — so the worst moment of a surge would randomly look
    // calm. The shred has enough slices for folding to stay varied; this doesn't.
    const shift = clamp(
      Math.sin(t * band.wobble * 1.7 + band.phase * 2) * band.shiftFrac * W * intensity,
      -W * 0.5,
      W * 0.5,
    );
    blitSlice(ctx, source, W, H, scale, { top, height: visible, dx: shift });

    // The bleed has to run the full height of the band. Fading it out near the edges leaves the
    // colour concentrated in two thin lines, and the picture ends up ruled with neon.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fringe = ctx.createLinearGradient(0, top, 0, bottom);
    fringe.addColorStop(0, `rgba(255, 74, 200, ${clamp(0.13 * intensity, 0, 1)})`);
    fringe.addColorStop(0.5, 'rgba(190, 140, 230, 0)');
    fringe.addColorStop(1, `rgba(80, 240, 255, ${clamp(0.12 * intensity, 0, 1)})`);
    ctx.fillStyle = fringe;
    ctx.fillRect(shift, top, W, visible);
    ctx.restore();
  }
}

/**
 * The signature artefact: a zone of very thin slices, each displaced by its own amount, so
 * vertical edges shatter into a comb. Zones drift down the frame; `intensity` sets how far each
 * line can travel.
 */
export function shred(ctx, W, H, t, zones, intensity = 1, tape = null) {
  if (intensity <= 0) return;
  const scale = deviceScale(ctx, W, H);
  const source = sourceOf(ctx, tape);

  for (const zone of zones) {
    const zoneHeight = zone.heightFrac * H;
    const top = wrap01(zone.offset + t * zone.speed) * (H + zoneHeight) - zoneHeight;
    // Every slice is a full-width blit, the most expensive thing in the frame. Cap the count and
    // widen the slices to fit, rather than letting a tall zone on a tall screen quietly ask for
    // hundreds of them.
    const lines = Math.min(MAX_SHRED_LINES, Math.ceil(zoneHeight / Math.max(1.5, zone.sliceFrac * H)));
    const sliceHeight = zoneHeight / lines;
    // A slow-moving seed keeps a zone coherent for a beat instead of boiling every frame.
    const seed = Math.floor(t * zone.churn) * 131 + zone.phase * 977;

    for (let i = 0; i < lines; i += 1) {
      const y = top + i * sliceHeight;
      if (y + sliceHeight < 0 || y > H) continue;
      const noise = hash(seed + i * 3.7) - 0.5;
      // Squaring keeps most lines nearly still and throws a few a long way, which is what the
      // reference does — an evenly jittered comb reads as static, not as a tape fault.
      // Wrapped, not clamped. Past about two thirds of the width a slice lands entirely off frame,
      // but clamping makes every slice saturate at the same offset during a surge — coherent bars
      // instead of chaos. Folding the displacement back into range keeps it varied at any
      // magnitude, which is what a ten-times surge needs to still look like shredding.
      const dx = fold(Math.sign(noise) * noise * noise * 4 * zone.shiftFrac * W * intensity, W * 1.32);
      blitSlice(ctx, source, W, H, scale, { top: y, height: sliceHeight, dx });
    }
  }
}

/**
 * Long horizontal trails dragged out of the picture: a thin slice sampled and stretched many
 * times its width. This is what makes the frame read as tape rather than digital noise.
 */
export function smearStreaks(ctx, W, H, t, count = 8, intensity = 1, tape = null) {
  if (intensity <= 0) return;
  const scale = deviceScale(ctx, W, H);
  const source = sourceOf(ctx, tape);
  const seed = Math.floor(t * 3) * 71;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i += 1) {
    const n = seed + i * 5.31;
    const top = hash(n) * H;
    const height = (2 + hash(n + 1.1) * 5) * (0.6 + intensity * 0.6);
    const from = hash(n + 2.2) * W * 0.7;
    const width = (0.18 + hash(n + 3.3) * 0.5) * W * intensity;
    ctx.globalAlpha = clamp((0.06 + hash(n + 4.4) * 0.1) * intensity, 0, 1);
    // Sample a narrow strip and stretch it far to the right.
    ctx.drawImage(
      source,
      Math.round(from * scale.sx),
      Math.round(clamp(top, 0, H) * scale.sy),
      Math.max(1, Math.round(W * 0.03 * scale.sx)),
      Math.max(1, Math.round(height * scale.sy)),
      from,
      clamp(top, 0, H),
      width,
      height,
    );
  }
  ctx.restore();
}

/**
 * Head-switching dropouts: thick dark bands, hard-edged, offset sideways, with bright noise
 * inside them. The reference has three at once during its worst moments.
 */
export function dropoutBars(ctx, W, H, t, bars, intensity = 1, tape = null) {
  if (intensity <= 0) return;
  const scale = deviceScale(ctx, W, H);
  const source = sourceOf(ctx, tape);

  for (const bar of bars) {
    const cycle = wrap01(bar.offset + t * bar.speed);
    // Each bar is only present for part of its cycle, so they come and go rather than parade.
    const presence = cycle < bar.duty ? 1 : 0;
    if (!presence) continue;

    const height = Math.max(3, bar.heightFrac * H * intensity);
    const top = (cycle / bar.duty) * (H + height) - height;
    if (top + height < 0 || top > H) continue;

    const shift = (hash(Math.floor(t * 8) + bar.phase) - 0.5) * 0.06 * W * intensity;
    const drawn = blitSlice(ctx, source, W, H, scale, { top, height, dx: shift });
    if (!drawn) continue;

    const y = clamp(top, 0, H);
    ctx.save();
    ctx.fillStyle = `rgba(4, 1, 12, ${clamp(0.72 * intensity, 0, 1)})`;
    ctx.fillRect(0, y, W, drawn);
    // Bright speckle inside the dropout.
    ctx.globalCompositeOperation = 'lighter';
    const specks = Math.round(drawn * 2.2);
    for (let i = 0; i < specks; i += 1) {
      const n = Math.floor(t * 20) * 313 + i * 7.7 + bar.phase;
      ctx.fillStyle = `rgba(255, 240, 255, ${0.1 + hash(n + 2) * 0.5})`;
      ctx.fillRect(hash(n) * W, y + hash(n + 1) * drawn, 1 + hash(n + 3) * 7, 1);
    }
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

/** A whole-frame colour split — magenta one way, cyan the other, both faint. */
export function chromaSplit(ctx, W, H, t, intensity = 1, tape = null) {
  if (intensity <= 0) return;
  const scale = deviceScale(ctx, W, H);
  const source = sourceOf(ctx, tape);
  const offset = (1.4 + Math.sin(t * 0.31) * 1.1) * intensity;
  if (Math.abs(offset) < 0.2) return;

  // Band-limited rather than whole-frame. Two reasons, pulling the same way: chroma noise on tape
  // isn't uniform down the picture, and a full-frame blended blit is one of the most expensive
  // operations available — three narrow bands cost a quarter of it and read better.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(0.085 * intensity, 0, 1);
  for (let i = 0; i < 3; i += 1) {
    const height = H * 0.13;
    const top = wrap01(0.31 * i + t * 0.023) * (H + height) - height;
    blitSlice(ctx, source, W, H, scale, { top, height, dx: -offset });
    blitSlice(ctx, source, W, H, scale, { top, height, dx: offset });
  }
  ctx.restore();
}

/**
 * The honeycomb that fills the reference's flat colour fields. Scoped to a band rather than the
 * whole frame — everywhere at once reads as wallpaper, not as a compression artefact.
 *
 * And it must not be a *lattice*. A mathematically perfect comb is the one thing in the frame that
 * looks authored: real block-decode garbage shears row against row, drops cells, floods some solid,
 * and changes its mind several times a second. So every row gets its own shear, its own line
 * weight and its own colour, cells drop out on a hashed roll, and a few fill instead of stroking.
 * All of it keyed to a slow seed so the comb holds a shape for a beat rather than boiling.
 */
export function hexDither(ctx, W, y, height, radius, alpha, t = 0, chaos = 1) {
  if (alpha <= 0.005 || height <= 0) return;
  const stepX = radius * Math.sqrt(3);
  const stepY = radius * 1.5;
  const seed = Math.floor(t * 3.2) * 149;
  const damage = clamp(chaos, 0, 3);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'bevel';

  for (let row = 0, cy = y; cy < y + height + stepY; row += 1, cy += stepY) {
    const n = hash(seed + row * 7.31);
    // Whole rows drop, the way a decoder loses a strip of blocks.
    if (n < 0.1 * damage) continue;

    // Each row slides independently, so the comb shears instead of tiling.
    const shear = (hash(seed + row * 3.17) - 0.5) * stepX * 3.4 * damage;
    const squash = 1 + (hash(seed + row * 11.9) - 0.5) * 0.5 * damage;
    const inset = (row % 2 ? stepX / 2 : 0) + shear;
    const rowAlpha = clamp(alpha * (0.55 + n * 0.9), 0, 1);
    const cyan = hash(seed + row * 5.11) > 0.34;

    ctx.lineWidth = 0.6 + hash(seed + row * 2.71) * 1.9;
    ctx.strokeStyle = cyan
      ? `rgba(120, 220, 255, ${rowAlpha})`
      : `rgba(255, 110, 215, ${rowAlpha})`;
    ctx.fillStyle = cyan
      ? `rgba(70, 170, 220, ${rowAlpha * 0.5})`
      : `rgba(210, 80, 180, ${rowAlpha * 0.5})`;

    ctx.beginPath();
    const solid = [];
    for (let cx = inset - stepX, column = 0; cx < W + stepX; cx += stepX, column += 1) {
      const c = hash(seed + row * 17.3 + column * 1.93);
      // Scattered cells simply aren't there.
      if (c < 0.16 * damage) continue;
      // Per-cell wobble as well as per-row shear. Without it a row is still a ruler: the shear
      // makes the rows disagree, this makes the cells within one disagree too.
      const jx = (hash(seed + row * 23.1 + column * 4.41) - 0.5) * radius * 0.7 * damage;
      const jy = (hash(seed + row * 6.53 + column * 8.09) - 0.5) * radius * 0.5 * damage;
      const size = radius * (1 + (c - 0.5) * 0.45 * damage);
      const cell = [];
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU - Math.PI / 2;
        cell.push([cx + jx + Math.cos(a) * size, cy + jy + Math.sin(a) * size * squash]);
      }
      // A handful flood solid — the block that decoded to one flat colour.
      if (c > 1 - 0.1 * damage) solid.push(cell);
      else {
        ctx.moveTo(cell[0][0], cell[0][1]);
        for (let i = 1; i < 6; i += 1) ctx.lineTo(cell[i][0], cell[i][1]);
        ctx.closePath();
      }
    }
    ctx.stroke();

    if (solid.length) {
      ctx.beginPath();
      for (const cell of solid) {
        ctx.moveTo(cell[0][0], cell[0][1]);
        for (let i = 1; i < 6; i += 1) ctx.lineTo(cell[i][0], cell[i][1]);
        ctx.closePath();
      }
      ctx.fill();
    }
  }
  ctx.restore();
}

export function makeRepeatCells(rng, count = 5) {
  return Array.from({ length: count }, () => ({
    offset: rng.next(),
    drift: rng.range(0.008, 0.045),
    heightFrac: rng.range(0.04, 0.12),
    widthFrac: rng.range(0.05, 0.17),
    // How often the stuck block picks a new source. Slow: the whole point is that it repeats.
    churn: rng.range(0.5, 2.2),
    // Only part of each cell's cycle is spent stuck. Low on purpose: at full duty every cell is
    // printing at once and the picture underneath is gone, which is a different effect — the
    // brief is half the frame in pieces, not all of it.
    duty: rng.range(0.22, 0.5),
    phase: rng.range(0, 10),
  }));
}

/**
 * The stuck macroblock: one small piece of the frame stamped again and again across a strip, so a
 * stretch of picture becomes a print of itself. This is the artefact that reads as *digital*
 * failure rather than tape wear — the tear and the smear are analogue, this is a decoder repeating
 * its last good block because the next one never arrived.
 *
 * Each cell holds its source for a beat before picking another, which is what makes it read as
 * stuck rather than as noise, and tiles jitter vertically so the strip doesn't become a neat row.
 */
export function blockRepeat(ctx, W, H, t, cells, intensity = 1, tape = null) {
  if (intensity <= 0) return;
  const scale = deviceScale(ctx, W, H);
  const source = sourceOf(ctx, tape);

  for (const cell of cells) {
    const cycle = wrap01(cell.offset + t * cell.drift);
    if (cycle > cell.duty) continue;

    const seed = Math.floor(t * cell.churn) * 197 + cell.phase * 43;
    const height = Math.max(4, cell.heightFrac * H);
    const width = Math.max(6, cell.widthFrac * W * clamp(1.4 - intensity * 0.3, 0.45, 1.4));
    const top = clamp((cycle / cell.duty) * (H + height) - height, 0, Math.max(0, H - 1));
    const visible = Math.min(height, H - top);
    if (visible < 2) continue;

    // The block being repeated, sampled once and reused for every tile.
    const from = hash(seed) * Math.max(1, W - width);
    const sx = Math.round(from * scale.sx);
    const sy = Math.round(top * scale.sy);
    const sw = Math.max(1, Math.round(width * scale.sx));
    const sh = Math.max(1, Math.round(visible * scale.sy));
    const tiles = Math.min(18, Math.max(2, Math.ceil(W / width)));

    ctx.save();
    for (let i = 0; i < tiles; i += 1) {
      const n = hash(seed + i * 5.7);
      // Gaps in the run: the strip is a print of one block, not a wall of them.
      if (n < 0.14) continue;
      const jitter = (hash(seed + i * 2.3) - 0.5) * visible * 0.5 * intensity;
      ctx.drawImage(source, sx, sy, sw, sh, i * width, top + jitter, width, visible);
    }
    ctx.restore();
  }
}

/**
 * Push the whole frame toward maximum saturation. The `saturation` blend mode takes the source's
 * saturation and the backdrop's hue and luminosity, so one saturated fill does the entire job —
 * colour goes neon, structure survives.
 */
export function saturate(ctx, W, H, amount) {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = clamp(amount, 0, 1);
  ctx.fillStyle = 'hsl(300, 100%, 50%)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Compositing the frame with itself in `overlay` is a real contrast curve, in one operation. */
export function contrastPunch(ctx, W, H, amount, tape = null) {
  if (amount <= 0) return;
  const scale = deviceScale(ctx, W, H);
  const source = sourceOf(ctx, tape);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = clamp(amount, 0, 1);
  blitSlice(ctx, source, W, H, scale, { top: 0, height: H });
  ctx.restore();
}

/**
 * Bloom: the frame drawn back over itself, blurred, slightly enlarged and slowly drifting. It is
 * what stops anything reading as clean — every edge in the picture gets a soft double, and because
 * the offset moves, the softness moves with it.
 */
export function diffuse(ctx, W, H, { amount = 0.2, blur = 8, scale = 1.03, dx = 0, dy = 0 } = {}, tape = null) {
  if (amount <= 0) return;
  const source = sourceOf(ctx, tape);
  const sw = source.width || W;
  const sh = source.height || H;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(amount, 0, 1);
  ctx.filter = `blur(${Math.max(0, blur).toFixed(2)}px)`;
  ctx.translate(W / 2 + dx, H / 2 + dy);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, W, H);
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
  bleed.addColorStop(0.42, `rgba(80, 240, 255, ${clamp(0.5 * intensity, 0, 1)})`);
  bleed.addColorStop(0.5, `rgba(255, 255, 255, ${clamp(0.85 * intensity, 0, 1)})`);
  bleed.addColorStop(0.58, `rgba(255, 74, 200, ${clamp(0.5 * intensity, 0, 1)})`);
  bleed.addColorStop(1, 'rgba(255, 74, 200, 0)');

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = bleed;
  ctx.fillRect(0, y - thickness * 3, W, thickness * 6);
  ctx.restore();
}

/** Seeded configuration for the artefacts that need a persistent layout. */
export function makeShredZones(rng, count = 3) {
  return Array.from({ length: count }, () => ({
    offset: rng.next(),
    speed: rng.range(0.02, 0.09),
    heightFrac: rng.range(0.08, 0.26),
    sliceFrac: rng.range(0.002, 0.006),
    shiftFrac: rng.range(0.006, 0.026),
    churn: rng.range(3, 9),
    phase: rng.range(0, 10),
  }));
}

export function makeDropoutBars(rng, count = 3) {
  return Array.from({ length: count }, () => ({
    offset: rng.next(),
    speed: rng.range(0.045, 0.1),
    duty: rng.range(0.12, 0.3),
    heightFrac: rng.range(0.008, 0.03),
    phase: rng.range(0, 10),
  }));
}
