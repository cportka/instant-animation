// The city, in five layers that go by at five speeds.
//
// The brief asks for *buildings like Rampage or Ninja Gaiden* over a *tropical 80s beachside
// metropolis at night*, and those two things pull in opposite directions in a useful way. The
// arcade-brawler building is a **flat front**: a rectangle, a parapet, and a grid of identical
// windows, with no perspective on it at all, because a side-scroller's backdrop is a painted flat
// and pretending otherwise breaks the moment it scrolls. The beachside metropolis is everything
// behind that flat — a skyline across the water, the moon on the bay, palms in the middle distance.
//
// So the blocks are drawn honestly flat and the *depth* is done entirely with parallax, which is the
// original solution and still the right one. Five rates: the stars barely move, the skyline across
// the bay creeps, the near blocks go by at a third, the palms at two thirds, and the roadside at
// one. Nothing is ever foreshortened and nothing needs to be.
//
// Every layer is addressed the same way the road is, except on a lattice measured in **screen
// pixels** rather than world units. Nothing in the backdrop is interacted with, so it does not need
// a place in the world — only a place in the picture and a rate to go by at.

import { clamp } from '../../lib/draw.js';
import { bayerOn, chunk, ditherGlow, ditherRamp, hash01, snap } from '../../effects/pixel.js';

/** Walk a backdrop lattice: `run(n, x)` for every slot that could touch the frame. */
function eachSlot(view, rate, pitch, margin, run) {
  const off = view.camX * view.pxu * rate;
  const from = Math.floor((off - margin) / pitch);
  const to = Math.floor((off + view.W + margin) / pitch);
  for (let n = from; n <= to; n += 1) run(n, snap(n * pitch - off, view.px));
}

/** How fast each layer goes by, as a fraction of the road's own speed. */
const STARS = 0.012;
const SKYLINE = 0.1;
const BLOCKS = 0.34;
const PALMS = 0.62;

/* ------------------------------------------------------------------ sky ---- */

/**
 * The sky, the stars and the moon.
 *
 * Seven flat steps with dithered joins, top to horizon. The last step is not the sky at all — it is
 * the city's glow coming up off the water, which is why the brightest part of a night sky in a coast
 * town is the bottom of it.
 */
export function drawSky(view) {
  const { ctx, W, px, pal } = view;
  // The join width is the one number in this file that is a straight cost/quality trade, and it was
  // measured rather than guessed. `ditherRamp` does one Bayer test per chunk of every *blended* row,
  // and the sky is the tallest thing in the frame, so at half-width joins this single call cost eight
  // milliseconds a frame — more than every other layer in the scene put together. Taken down to a
  // quarter it cost three, and the joins became narrow enough to read as **ruled lines** across the
  // sky, which is worse than the banding they exist to hide. Two fifths is where the line disappears
  // again and the call is under five.
  ditherRamp(ctx, W, -view.px * 2, view.horizon, pal.sky, px, { blend: 0.4 });

  // Stars, on their own barely-moving lattice, thinning toward the glow where nothing would show.
  ctx.fillStyle = pal.sky[6];
  ctx.beginPath();
  let drew = false;
  eachSlot(view, STARS, px * 7, px * 8, (n, x) => {
    for (let i = 0; i < 3; i += 1) {
      const seed = n * 3.1 + i * 17.7;
      if (hash01(seed) > 0.34) continue;
      const y = snap(hash01(seed * 1.7) * view.horizon * 0.82, px);
      if (y > view.horizon - px * 3) continue;
      // Faint ones drop out as the sky brightens toward the horizon, which is what happens.
      if (hash01(seed * 2.3) < y / view.horizon) continue;
      chunk(ctx, x + i * px * 2, y, px, px, px);
      drew = true;
    }
  });
  if (drew) ctx.fill();

  drawMoon(view);
}

/** How high the moon rides and how big it is, against the short edge. */
const MOON_UP = 0.2;
const MOON_R = 0.055;

function drawMoon(view) {
  const { ctx, px, pal } = view;
  const S = Math.min(view.W, view.H);
  // Nearly fixed: the moon is the one thing far enough away not to go past.
  const cx = snap(view.W * 0.76 - view.camX * view.pxu * 0.004, px);
  const cy = snap(view.H * MOON_UP, px);
  const r = S * MOON_R;

  ditherGlow(ctx, cx, cy, r * 4.2, pal.sky[6], 0.5, px, 1, 1.9);
  ctx.fillStyle = pal.hard.lamp;
  ctx.beginPath();
  for (let y = snap(cy - r, px); y <= cy + r; y += px) {
    const dy = (y + px / 2 - cy) / r;
    if (Math.abs(dy) > 1) continue;
    const half = Math.sqrt(1 - dy * dy) * r;
    chunk(ctx, cx - half, y, half * 2, px, px);
  }
  ctx.fill();

  // Two maria, so it is a moon rather than a lamp. One step down, never an outline.
  ctx.fillStyle = pal.sky[5];
  ctx.beginPath();
  chunk(ctx, cx - r * 0.42, cy - r * 0.3, r * 0.46, r * 0.34, px);
  chunk(ctx, cx + r * 0.12, cy + r * 0.18, r * 0.34, r * 0.3, px);
  ctx.fill();
}

/* ------------------------------------------------------------------ bay ---- */

/**
 * The water between the far skyline and the shore, and the moon laid down the middle of it.
 *
 * A moon column is the one thing that makes a flat band of dark blue read as *water* rather than as
 * a wall, and on a pixel grid it is a run of broken horizontal dashes narrowing with distance — the
 * reflection of a disc in a rippled surface, which is a shape everyone knows and nobody can draw
 * smoothly at this resolution anyway.
 */
export function drawBay(view) {
  const { ctx, W, px, pal } = view;
  const top = view.horizon;
  const bottom = view.shore;
  if (bottom - top < px) return;

  ditherRamp(ctx, W, top, bottom, [pal.sea[1], pal.sea[2]], px, { blend: 0.45 });

  // The city's light lying flat on the water, right under the far shore.
  ctx.fillStyle = pal.sea[3];
  ctx.beginPath();
  for (let x = 0; x < W + px; x += px) {
    const col = Math.round(x / px);
    for (let i = 0; i < 3; i += 1) {
      if (!bayerOn(col, i, 0.55 - i * 0.16)) continue;
      chunk(ctx, x, top + i * px, px, px, px);
    }
  }
  ctx.fill();

  // The moon's own column, dashed and rippling, brightest at the top where the disc is.
  const cx = snap(W * 0.76 - view.camX * view.pxu * 0.004, px);
  ctx.fillStyle = pal.sea[4];
  ctx.beginPath();
  const rows = Math.max(1, Math.round((bottom - top) / px));
  for (let r = 0; r < rows; r += 1) {
    const down = r / rows;
    const wide = Math.min(view.W, view.H) * MOON_R * (0.7 + down * 2.6);
    const ripple = Math.sin(view.t * 1.3 + r * 0.9) * px * 2 + Math.sin(view.t * 0.7 - r * 1.7) * px * 3;
    for (let x = snap(cx - wide, px); x < cx + wide; x += px) {
      const col = Math.round((x + ripple) / px);
      const across = 1 - Math.abs(x - cx) / wide;
      if (!bayerOn(col, r * 3, across * (1 - down * 0.55))) continue;
      chunk(ctx, x, top + r * px, px, px, px);
    }
  }
  ctx.fill();
}

/* -------------------------------------------------------------- skyline ---- */

/** The metropolis across the water: a mass of towers, small, dark, and full of lit windows. */
export function drawSkyline(view) {
  const { ctx, px, pal, tune } = view;
  const S = Math.min(view.W, view.H);
  // Set a little above the near blocks' feet, which is what puts it behind them and across the bay.
  const base = view.horizon - px * 5;
  const pitch = Math.max(px * 3, S * 0.035);

  for (const [step, back] of [[1, true], [2, false]]) {
    ctx.fillStyle = pal.city[step];
    ctx.beginPath();
    let drew = false;
    eachSlot(view, SKYLINE * (back ? 0.72 : 1), pitch, pitch * 2, (n, x) => {
      const seed = n * 1.7 + (back ? 91.3 : 5.1);
      if (hash01(seed * 3.3) > 0.86) return;
      const tall = S * (0.03 + hash01(seed) ** 2 * 0.15) * tune.tall * (back ? 0.7 : 1);
      const wide = pitch * (0.55 + hash01(seed * 2.1) * 0.5);
      chunk(ctx, x, base - tall, wide, tall, px);
      // A mast or a tank on the tall ones, which is most of a skyline's silhouette.
      if (hash01(seed * 5.9) < 0.3) chunk(ctx, x + wide * 0.4, base - tall - px * 3, px, px * 3, px);
      drew = true;
    });
    if (drew) ctx.fill();
  }

  // Windows: single chunks, sparse, latched so they turn over slowly rather than boiling.
  ctx.fillStyle = pal.city[3];
  ctx.beginPath();
  let drew = false;
  const era = Math.floor(view.t / 3.7);
  eachSlot(view, SKYLINE, pitch, pitch * 2, (n, x) => {
    const seed = n * 1.7 + 5.1;
    if (hash01(seed * 3.3) > 0.86) return;
    const tall = S * (0.03 + hash01(seed) ** 2 * 0.15) * tune.tall;
    const wide = pitch * (0.55 + hash01(seed * 2.1) * 0.5);
    for (let i = 0; i < 9; i += 1) {
      const lit = hash01(seed * 7.1 + i * 3.7 + Math.floor(era * hash01(seed + i) * 0.4));
      if (lit > 0.34 * tune.glow) continue;
      const wx = x + px * 2 + Math.floor(hash01(seed + i * 1.3) * Math.max(1, wide / px - 3)) * px;
      const wy = base - px * 2 - Math.floor(hash01(seed + i * 2.9) * Math.max(1, tall / px - 2)) * px;
      chunk(ctx, wx, wy, px, px, px);
      drew = true;
    }
  });
  if (drew) ctx.fill();
}

/* --------------------------------------------------------------- blocks ---- */

/**
 * The near blocks: the ones the brief is about.
 *
 * Flat fronts on a fixed pitch, each inset into its own slot by a hashed amount — which is what lets
 * a row of buildings have varied widths and still be *addressable*, since a running total of widths
 * would need every building to the left of the frame to have been visited first. Most insets come
 * out at nothing, so the blocks abut the way a city block does.
 */
export function drawBlocks(view) {
  const { ctx, px, pal, tune } = view;
  const S = Math.min(view.W, view.H);
  const pitch = Math.max(px * 8, S * 0.15);
  const base = view.horizon + px;

  // Bodies, in two tones alternating along the row so neighbours of the same height still part.
  for (const step of [1, 2]) {
    ctx.fillStyle = pal.build[step];
    ctx.beginPath();
    let drew = false;
    eachSlot(view, BLOCKS, pitch, pitch, (n, x) => {
      if ((((n % 2) + 2) % 2 === 0) !== (step === 1)) return;
      const b = blockAt(n, S, pitch, tune);
      if (!b.there) return;
      chunk(ctx, x + b.inset, base - b.tall, b.wide, b.tall, px);
      drew = true;
    });
    if (drew) ctx.fill();
  }

  // Parapets and the tanks and aerials on them: the whole silhouette of an arcade skyline.
  ctx.fillStyle = pal.build[3];
  ctx.beginPath();
  let drew = false;
  eachSlot(view, BLOCKS, pitch, pitch, (n, x) => {
    const b = blockAt(n, S, pitch, tune);
    if (!b.there) return;
    const cap = Math.max(px, px * 2);
    chunk(ctx, x + b.inset - px, base - b.tall - cap, b.wide + px * 2, cap, px);
    if (b.crown === 1) {
      chunk(ctx, x + b.inset + b.wide * 0.24, base - b.tall - cap * 3.4, b.wide * 0.3, cap * 2.4, px);
    } else if (b.crown === 2) {
      chunk(ctx, x + b.inset + b.wide * 0.62, base - b.tall - cap * 5, px, cap * 5, px);
      chunk(ctx, x + b.inset + b.wide * 0.5, base - b.tall - cap * 5, b.wide * 0.26, cap, px);
    }
    drew = true;
  });
  if (drew) ctx.fill();

  // Windows: a real grid, because that is what an arcade building has, with a latched pattern of
  // which ones are lit. A grid with random gaps reads as a building; noise reads as static.
  ctx.fillStyle = pal.build[5];
  ctx.beginPath();
  drew = false;
  const era = Math.floor(view.t / 5.3);
  eachSlot(view, BLOCKS, pitch, pitch, (n, x) => {
    const b = blockAt(n, S, pitch, tune);
    if (!b.there) return;
    const cell = Math.max(px * 2, S * 0.014);
    const cols = Math.max(1, Math.floor(b.wide / cell) - 1);
    const rows = Math.max(1, Math.floor(b.tall / cell) - 1);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const seed = n * 31.7 + r * 5.3 + c * 1.9;
        if (hash01(seed + Math.floor(era * hash01(seed) * 0.5)) > 0.42 * tune.glow) continue;
        chunk(ctx, x + b.inset + cell * (c + 0.6), base - b.tall + cell * (r + 0.8), cell * 0.45, cell * 0.5, px);
        drew = true;
      }
    }
  });
  if (drew) ctx.fill();

  drawSigns(view, pitch, base, S);
}

/** One block's shape, from its index alone. */
function blockAt(n, S, pitch, tune) {
  const seed = n * 4.7 + 13.1;
  const wide = pitch * (0.7 + hash01(seed * 2.3) * 0.28);
  return {
    wide,
    // A third of the slots are left empty, and it is not for variety — it is so the **bay shows
    // through**. Built shoulder to shoulder the near blocks are a wall across the middle of the
    // frame, and the water, the far skyline and the moon's column on it are all behind that wall.
    // A beachside city with no sea visible is just a city.
    there: hash01(seed * 9.7) > 0.34,
    inset: (pitch - wide) * hash01(seed * 1.3),
    tall: S * (0.08 + hash01(seed) ** 1.6 * 0.34) * tune.tall,
    crown: Math.floor(hash01(seed * 6.1) * 3),
  };
}

/**
 * The neon: the one thing in the picture that is a light source rather than lit by one.
 *
 * Hung on the fronts, vertical as often as horizontal, in colours that belong to no palette here —
 * a tube full of gas is the colour it is whatever the sky is doing, and a sign that shifted with the
 * night would be a reflection rather than a sign.
 */
function drawSigns(view, pitch, base, S) {
  const { ctx, px, pal, tune } = view;
  const era = Math.floor(view.t * 2.6);
  for (let hue = 0; hue < pal.neon.length; hue += 1) {
    ctx.fillStyle = pal.neon[hue];
    ctx.beginPath();
    let drew = false;
    eachSlot(view, BLOCKS, pitch, pitch, (n, x) => {
      const seed = n * 4.7 + 13.1;
      if (hash01(seed * 8.9) > 0.5) return;
      if (Math.floor(hash01(seed * 11.3) * pal.neon.length) !== hue) return;
      const b = blockAt(n, S, pitch, tune);
      if (!b.there) return;
      // A dud tube, flickering on its own beat. One in six signs, and it is the detail that makes
      // the strip look lived in rather than switched on.
      const dud = hash01(seed * 13.7) < 0.16 && hash01(era * 1.7 + seed) < 0.3;
      if (dud) return;
      const up = hash01(seed * 3.9) < 0.55;
      const w = up ? Math.max(px * 2, b.wide * 0.16) : b.wide * 0.72;
      const h = up ? b.tall * 0.46 : Math.max(px * 2, b.tall * 0.09);
      const sxx = x + b.inset + (up ? b.wide * 0.12 : b.wide * 0.14);
      const syy = base - b.tall + b.tall * 0.14;
      chunk(ctx, sxx, syy, w, h, px);
      drew = true;
    });
    if (drew) ctx.fill();
  }

  // ...and their glow, which is most of what lights the front of a building at night.
  eachSlot(view, BLOCKS, pitch, pitch, (n, x) => {
    const seed = n * 4.7 + 13.1;
    if (hash01(seed * 8.9) > 0.5) return;
    const b = blockAt(n, S, pitch, tune);
    if (!b.there) return;
    if (hash01(seed * 13.7) < 0.16 && hash01(era * 1.7 + seed) < 0.3) return;
    const hue = pal.neon[Math.floor(hash01(seed * 11.3) * pal.neon.length) % pal.neon.length];
    ditherGlow(ctx, x + b.inset + b.wide * 0.24, base - b.tall + b.tall * 0.3,
      S * 0.07 * tune.glow, hue, 0.4 * tune.glow, px, 1, 1.7);
  });
}

/* ---------------------------------------------------------------- palms ---- */

/**
 * Palms, in the middle distance, in silhouette.
 *
 * The tropics arrive almost entirely through these — a coast city at night is a skyline anywhere in
 * the world until something with fronds on it goes past — so they are the layer closest to the road
 * that is still scenery, and they are drawn nearly black with one lit edge. A palm rendered in full
 * colour at this distance would compete with the rider, who is the only thing in the frame allowed
 * to be purple.
 */
export function drawPalms(view) {
  const { ctx, px, pal, tune } = view;
  const S = Math.min(view.W, view.H);
  const pitch = Math.max(px * 6, S * 0.2);
  const base = view.top - px;

  for (const [step, lit] of [[0, false], [3, true]]) {
    ctx.fillStyle = pal.land[step];
    ctx.beginPath();
    let drew = false;
    eachSlot(view, PALMS, pitch, pitch, (n, x) => {
      const seed = n * 2.9 + 41.3;
      if (hash01(seed * 5.7) > 0.55 * tune.growth) return;
      const tall = S * (0.095 + hash01(seed) * 0.095) * tune.growth;
      const bend = (hash01(seed * 1.9) - 0.5) * tall * 0.45;
      const trunk = Math.max(px * 2, S * 0.009);
      // The trunk as a stack, each chunk leaning a little more than the one below it.
      const steps = Math.max(2, Math.round(tall / px / 2));
      for (let i = 0; i < steps; i += 1) {
        const up = i / steps;
        if (lit && i % 3 !== 0) continue;
        chunk(ctx, x + bend * up * up + (lit ? trunk * 0.6 : 0), base - tall * up - px * 2,
          lit ? Math.max(px, trunk * 0.4) : trunk, px * 2, px);
      }
      // Fronds: six runs of chunks falling away from the crown, no diagonals, all steps.
      const crownX = x + bend;
      const crownY = base - tall;
      // Five fronds, and the shape of one is the whole difference between a palm and a spider.
      //
      // A frond leaves the crown going **up** and only falls away at the end, so its profile is a
      // rise plus a quadratic drop rather than a straight droop — drawn as a simple fall from a point
      // you get five stiff legs radiating downward, which is precisely what the first pass looked
      // like. Five rather than six, too: an even count comes out symmetric about the trunk, and a
      // symmetric crown reads as a diagram of a tree.
      for (let f = 0; f < 5; f += 1) {
        const side = f % 2 === 0 ? 1 : -1;
        const reach = S * (0.03 + hash01(seed + f) * 0.026) * tune.growth;
        const rise = reach * (0.3 + hash01(seed + f * 3.1) * 0.34);
        const droop = reach * (0.7 + hash01(seed + f * 2.3) * 0.9);
        const cells = Math.max(3, Math.round(reach / px));
        for (let i = 0; i <= cells; i += 1) {
          const along = i / cells;
          if (lit && (i + f) % 3 !== 0) continue;
          const thick = Math.max(px, px * (2.6 - along * 1.8));
          chunk(ctx, crownX + side * reach * along - px,
            crownY - rise * (1 - (1 - along) ** 2) + droop * along * along * along - px,
            px * 2, thick, px);
        }
      }
      drew = true;
    });
    if (drew) ctx.fill();
  }
}

/**
 * The foreground: whatever is close enough to be a smear.
 *
 * Faster than the road, dark, and deliberately unreadable. A side-scroller with nothing in front of
 * the subject has no near plane and no sense of speed at all — this is a rail going past too quickly
 * to see, and it is the cheapest speed in the whole picture.
 */
export function drawFore(view, streak) {
  const { ctx, px, pal } = view;
  const pitch = Math.max(px * 5, Math.min(view.W, view.H) * 0.09);
  const y = view.H - px * 2;
  ctx.fillStyle = pal.road[0];
  ctx.beginPath();
  let drew = false;
  eachSlot(view, 1.45, pitch, pitch, (n, x) => {
    const smear = clamp(streak / view.pxu, 0.4, 2) * px * 3;
    chunk(ctx, x, y - px * 3, Math.max(px, px * 2 + smear), px * 5, px);
    drew = true;
  });
  if (drew) ctx.fill();
  ctx.fillStyle = pal.road[3];
  ctx.beginPath();
  chunk(ctx, 0, y + px, view.W, px, px);
  ctx.fill();
  // A wash over the very bottom, so the smear has something to sit against.
  ctx.fillStyle = pal.road[1];
  ctx.beginPath();
  chunk(ctx, 0, y + px * 2, view.W, px * 3, px);
  ctx.fill();
}
