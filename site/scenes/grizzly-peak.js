// "2.5D 16-bit, from the perspective of a car travelling diagonally up and to the left along
//  Grizzly Peak — bronze street lamps, a cliff drop-off over the bay, and a sunset burning in a
//  sky that is already night. A car spins as a figment across it on occasion."
//
// The whole scene is drawn on a **pixel grid**. Nothing here is anti-aliased on purpose: every
// coordinate snaps to a chunk a few screen pixels across, gradients are flat bands with ordered
// dither between them, and there are about twenty colours in total. That constraint is the style —
// a smooth gradient and a hard-edged sprite in the same frame reads as neither, and the moment one
// curve is drawn true the rest stops looking deliberate.
//
// Depth is fake and done with layers: each one offsets by its own multiple of the same travel
// distance, more sideways than up, which is the "2.5D" of it. The road is the only thing with real
// perspective, and the lamps ride it.

import { createRng } from '../lib/rng.js';
import { TAU, clamp, lerp, smoothstep, wave, wrap01 } from '../lib/draw.js';

export const meta = {
  id: 'grizzly-peak',
  title: 'Westbound on Grizzly Peak',
  prompt:
    "2.5D 16-bit from the perspective of a car travelling diagonally up and to the left, a series of copper bronze street lamps, a cliff drop-off overlooking the bay from Grizzly Peak west to the water, trees, and a fiery sunset in a night sky — with a car spinning as a figment across it on occasion",
  created: '2026-08-09',
  background: '#050b2e',
  posterTime: 12,
  // Pixel art wants one device pixel per drawn pixel. At 2x the chunks are drawn twice as fine and
  // the whole point of the grid — that you can see it — goes away.
  maxDpr: 1,
};

/* ------------------------------------------------------------- palette ---- */

// Yellow, red, blue. The fire ramp runs hot to deep and doubles as the water's reflection ramp;
// the night ramp runs the other way. Everything else is borrowed from one of the two.
const FIRE = ['#fff6c2', '#ffe14a', '#ffab1c', '#ff6a15', '#e8232b', '#9c1550'];
const NIGHT = ['#03061c', '#070d33', '#0d1a55', '#152a80', '#2143a8', '#3060c4'];
const WATER = ['#050a24', '#0a1338', '#122559', '#1a3d86'];
const LAND = ['#02030c', '#070818', '#0c0f26', '#131634'];

// Sodium vapour: the colour a street lamp actually throws, and the copper the pole is made of.
const LAMP_CORE = '#fff4cf';
const LAMP_HOT = '#ffc65e';
const LAMP_MID = '#e2903a';
const LAMP_DEEP = '#a85a20';
const COPPER = '#8a5223';
const COPPER_LIT = '#c98a3f';

/* ------------------------------------------------------------- horizons ---- */

// The frame is cut into bands once, in normalised height, and everything hangs off these.
const HORIZON = 0.44; // where the water meets the far shore
const WATER_END = 0.57; // the near edge of the bay, at the foot of the drop-off
const RIDGE_END = 0.71; // the bottom of the treed slope, where the roadside starts
const VP = { x: 0.3, y: 0.7 }; // the road's vanishing point, up and to the left

// Travel. More sideways than upward — the brief is diagonal, but mostly left.
const SPEED = 46;
const DRIFT_X = 1;
const DRIFT_Y = 0.32;

const LAMP_COUNT = 9;
const LAMP_SPACING = 1 / LAMP_COUNT;

/* ------------------------------------------------------------ the scene ---- */

export function create({ width, height, seed = meta.id }) {
  const rng = createRng(seed);

  const stars = Array.from({ length: 150 }, () => ({
    x: rng.next(),
    y: rng.range(0, HORIZON * 0.92),
    bright: rng.next(),
    rate: rng.range(0.4, 1.9),
    phase: rng.range(0, TAU),
  }));

  // The far shore: Marin to the right of the gate, the city to the left of it. Chunky blocks, no
  // silhouette recognisable enough to be a landmark — a skyline at this distance is a bar chart.
  const skyline = Array.from({ length: 46 }, (_, i) => ({
    x: 0.34 + i * 0.0135,
    h: rng.range(0.004, 0.03) * (i > 18 && i < 30 ? 1.9 : 1),
    w: rng.range(0.004, 0.011),
    lit: rng.next() < 0.45,
    phase: rng.range(0, 10),
  }));

  // Two treelines. The far one sits on the ridge across the water and barely moves; the near one
  // is on the slope below us and slides past fast.
  const makeTrees = (count, spread) =>
    Array.from({ length: count }, () => ({
      x: rng.next(),
      lift: rng.range(0, 1),
      height: rng.range(0.6, 1.4),
      width: rng.range(0.5, 1.2),
      lean: rng.range(-0.22, 0.22),
      kind: rng.next(),
      sway: rng.range(0.5, 1.4),
      phase: rng.range(0, TAU),
      spread,
    }));

  const farTrees = makeTrees(56, 0.03);
  // The roadside. Few and moderate, and rooted up the slope rather than at the bottom edge —
  // down there the road is nearly the full width of frame and a tree of any size is a wipe.
  const nearTrees = makeTrees(13, 0.12);

  // The lamps live on one track along the left edge of the road, evenly spaced in *world* distance
  // — which is what makes them bunch up toward the vanishing point on their own.
  const lamps = Array.from({ length: LAMP_COUNT }, (_, i) => ({
    offset: i * LAMP_SPACING,
    flicker: rng.range(0.7, 1),
    phase: rng.range(0, 10),
  }));

  let W = width;
  let H = height;

  return {
    resize(nextWidth, nextHeight) {
      W = nextWidth;
      H = nextHeight;
    },

    draw(ctx, t) {
      const px = pixelSize(W, H);
      const travel = t * SPEED;

      drawSky(ctx, W, H, t, px);
      drawStars(ctx, W, H, t, stars, travel, px);
      drawSun(ctx, W, H, t, px);
      drawFigment(ctx, W, H, t, px);
      drawHeadlands(ctx, W, H, travel, px);
      drawSkyline(ctx, W, H, t, skyline, travel, px);
      drawWater(ctx, W, H, t, px);
      drawFarRidge(ctx, W, H, t, farTrees, travel, px);
      // Roadside trees go down *before* the tarmac. They stand on the slope beyond the road, and
      // drawn over it they are simply a wall — a canopy anywhere near the middle of frame is wide
      // enough at this scale to erase the road, the lamps and the light on both.
      drawNearTrees(ctx, W, H, t, nearTrees, travel, px);
      drawRoad(ctx, W, H, t, travel, px);
      drawLamps(ctx, W, H, t, lamps, travel, px);
      drawHood(ctx, W, H, t, px);
      drawScanlines(ctx, W, H, px);
    },
  };
}

/* -------------------------------------------------------- pixel plumbing ---- */

/**
 * One chunk of the grid, in CSS pixels. Tied to the short edge so the art is the same *coarseness*
 * on a phone and on a monitor rather than the same number of chunks — a fixed chunk count makes a
 * wide window look like a different game.
 */
function pixelSize(W, H) {
  return Math.max(2, Math.round(Math.min(W, H) / 190));
}

/** Snap to the grid. Everything drawn goes through this or it does not belong in the frame. */
const snap = (v, px) => Math.round(v / px) * px;

/** A rectangle on the grid, appended to the open path. */
function chunk(ctx, x, y, w, h, px) {
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
const bayerOn = (col, row, density) =>
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
function ditherRamp(ctx, W, top, bottom, colours, px, { blend = 0.45 } = {}) {
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
function block(ctx, x, y, w, h, colour, px) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  chunk(ctx, x, y, w, h, px);
  ctx.fill();
}

/**
 * A dithered disc — the 16-bit way to make light fall off. Concentric rings, each a Bayer density
 * of the same colour, so a lamp's halo is made of visible chunks rather than a soft gradient.
 */
function ditherGlow(ctx, cx, cy, radius, colour, strength, px, squash = 1, falloff = 1.6) {
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

/* ------------------------------------------------------------------ sky ---- */

function drawSky(ctx, W, H, t, px) {
  // Night at the top falling into fire at the waterline. The join is where the whole palette lives:
  // deep blue straight into red with nothing in between except the dither doing the mixing.
  ditherRamp(ctx, W, 0, H * HORIZON, [
    NIGHT[0], NIGHT[1], NIGHT[2], NIGHT[3], '#3a2a7a', '#7a2f66', FIRE[5], FIRE[4], FIRE[3],
  ], px, { blend: 0.55 });

  // The sun's own wash across the lower sky, west and a little left of centre. Breathes very
  // slowly, so the horizon is never quite the same colour twice.
  const glow = 0.72 + wave(t, 37) * 0.1;
  ditherGlow(ctx, W * 0.32, H * HORIZON, H * 0.3, FIRE[2], glow * 0.5, px, 0.62);
  ditherGlow(ctx, W * 0.32, H * HORIZON, H * 0.17, FIRE[1], glow * 0.55, px, 0.6);
}

function drawStars(ctx, W, H, t, stars, travel, px) {
  ctx.beginPath();
  ctx.fillStyle = '#cdd8ff';
  for (const star of stars) {
    // The sky is the slowest layer there is — the stars barely acknowledge that the car is moving.
    const x = wrap01(star.x + travel * 0.00002 * DRIFT_X) * W;
    const y = star.y * H + travel * 0.00002 * DRIFT_Y * H;
    // Nothing survives near the fire.
    const drowned = smoothstep(HORIZON * 0.45, HORIZON, y / H);
    const twinkle = 0.55 + Math.sin(t * star.rate + star.phase) * 0.45;
    if (star.bright * twinkle * (1 - drowned) < 0.42) continue;
    chunk(ctx, x, y, px, px, px);
  }
  ctx.fill();
}

/** The sun, half gone into the water: a stepped disc, banded hot to deep. */
function drawSun(ctx, W, H, t, px) {
  const cx = W * 0.32;
  const cy = H * (HORIZON + 0.012);
  const radius = Math.min(W, H) * 0.085;
  const bands = [FIRE[0], FIRE[1], FIRE[2], FIRE[3], FIRE[4]];

  for (let b = bands.length - 1; b >= 0; b -= 1) {
    const r = radius * (1 - b * 0.13);
    ctx.fillStyle = bands[bands.length - 1 - b];
    ctx.beginPath();
    // Drawn as rows of chunks rather than an arc, so the edge is genuinely stepped.
    for (let y = -r; y <= r; y += px) {
      if (cy + y > H * (HORIZON + 0.006)) break; // the water takes the rest
      const half = Math.sqrt(Math.max(0, r * r - y * y));
      chunk(ctx, cx - half, cy + y, half * 2, px, px);
    }
    ctx.fill();
  }

  // A slow horizontal bar across it, the way a low sun sits inside its own haze.
  const bar = H * 0.006 + Math.abs(wave(t, 11)) * H * 0.004;
  block(ctx, cx - radius * 1.35, cy - radius * 0.42, radius * 2.7, bar, FIRE[1], px);
}

/* ----------------------------------------------------------------- land ---- */

/** The far shore: two headlands either side of the gap the light comes through. */
function drawHeadlands(ctx, W, H, travel, px) {
  const slide = travel * 0.00004 * DRIFT_X * W;
  const y = H * HORIZON;

  ctx.fillStyle = LAND[1];
  ctx.beginPath();
  for (let i = 0; i < 2; i += 1) {
    const from = i === 0 ? -0.1 : 0.62;
    const to = i === 0 ? 0.24 : 1.12;
    for (let x = from; x < to; x += px / W) {
      const u = (x - from) / (to - from);
      // A lump, higher at its outer end, with a little noise so it isn't an arc.
      const h = Math.sin(u * Math.PI) ** 0.7 * (i === 0 ? 0.036 : 0.05)
        + Math.sin(u * 27 + i * 3) * 0.0035;
      const sx = (x + slide / W) * W;
      chunk(ctx, sx, y - h * H, px, h * H + px * 2, px);
    }
  }
  ctx.fill();
}

/** The city across the water. Blocks, and a few lit windows that come and go. */
function drawSkyline(ctx, W, H, t, skyline, travel, px) {
  const slide = travel * 0.00006 * DRIFT_X * W;
  const base = H * HORIZON;

  ctx.fillStyle = LAND[0];
  ctx.beginPath();
  for (const tower of skyline) {
    const x = ((tower.x + slide / W) % 1.3) * W - W * 0.15;
    chunk(ctx, x, base - tower.h * H, tower.w * W, tower.h * H + px, px);
  }
  ctx.fill();

  ctx.fillStyle = LAMP_HOT;
  ctx.beginPath();
  for (const tower of skyline) {
    if (!tower.lit) continue;
    if (Math.sin(t * 0.4 + tower.phase) < 0.1) continue;
    const x = ((tower.x + slide / W) % 1.3) * W - W * 0.15;
    chunk(ctx, x + tower.w * W * 0.35, base - tower.h * H + px, px, px, px);
  }
  ctx.fill();
}

/** The bay: flat bands, and the sun's road laid across them in broken chunks. */
function drawWater(ctx, W, H, t, px) {
  const top = H * HORIZON;
  const bottom = H * WATER_END;
  ditherRamp(ctx, W, top, bottom, [WATER[3], WATER[2], WATER[1]], px, { blend: 0.6 });

  // The glitter path. Rows of short dashes under the sun, each row jittering on its own clock —
  // this one effect does more for "water" than any amount of shading.
  const cx = W * 0.32;
  const rows = Math.round((bottom - top) / px);
  for (let pass = 0; pass < 3; pass += 1) {
    ctx.fillStyle = [FIRE[1], FIRE[2], FIRE[3]][pass];
    ctx.beginPath();
    for (let r = 0; r < rows; r += 1) {
      const y = top + r * px;
      const depth = r / rows;
      // The path widens as it comes toward you, the way a reflection actually behaves.
      const spread = W * (0.02 + depth * 0.16);
      const count = 2 + Math.round(depth * 7);
      for (let i = 0; i < count; i += 1) {
        const n = Math.sin(r * 12.9898 + i * 78.233 + pass * 3.1) * 43758.5453;
        const jitter = n - Math.floor(n);
        const shimmer = Math.sin(t * (1.4 + depth * 2) + r * 0.9 + i * 2.1);
        if (shimmer < -0.15 + pass * 0.35) continue;
        const x = cx + (jitter - 0.5) * spread * 2;
        const w = px * (1 + Math.round(jitter * (1 + depth * 3)));
        chunk(ctx, x, y, w, px, px);
      }
    }
    ctx.fill();
  }
}

/**
 * The drop-off: the slope below us, its far edge cutting the water off, with the treeline running
 * along the top of it. This is the cliff the road is on top of.
 */
function drawFarRidge(ctx, W, H, t, trees, travel, px) {
  const slide = travel * 0.00035 * DRIFT_X * W;
  const rise = travel * 0.00035 * DRIFT_Y * H;
  const crest = H * WATER_END;

  // The slope itself, dark and getting darker as it comes toward us.
  ditherRamp(ctx, W, crest, H * RIDGE_END + H * 0.02, [LAND[3], LAND[2], LAND[1]], px, { blend: 0.5 });

  // A hard lit edge along the crest where the last of the sun still catches it.
  ctx.fillStyle = '#5a2a55';
  ctx.beginPath();
  for (let x = 0; x < W + px; x += px) {
    const wobble = Math.sin((x / W) * 19 + slide * 0.01) * H * 0.004;
    chunk(ctx, x, crest + wobble, px, px, px);
  }
  ctx.fill();

  drawTrees(ctx, W, H, t, trees, crest, slide, rise, Math.min(W, H) * 0.055, px, false);
}

/** Eucalyptus: a bare leaning trunk with a ragged clump on top. Pine: a stepped triangle. */
function drawTrees(ctx, W, H, t, trees, baseY, slide, rise, scale, px, lit) {
  ctx.fillStyle = lit ? LAND[0] : LAND[1];
  ctx.beginPath();

  for (const tree of trees) {
    const x = wrap01(tree.x + slide / W) * W;
    const size = scale * tree.height;
    const base = baseY + tree.lift * H * tree.spread + rise;
    const bend = Math.sin(t * tree.sway * 0.35 + tree.phase) * size * 0.04;

    // Trunk.
    const trunkW = Math.max(px, size * 0.07 * tree.width);
    for (let s = 0; s <= size; s += px) {
      const u = s / size;
      const off = tree.lean * size * u * u + bend * u * u;
      chunk(ctx, x + off - trunkW / 2, base - s, trunkW, px, px);
    }

    const topX = x + tree.lean * size + bend;
    const topY = base - size;

    // Canopies are built row by row. Drawn as whole rectangles they are boxes on sticks — the
    // silhouette is the entire tree at this distance, and a box has no silhouette.
    if (tree.kind < 0.55) {
      // Eucalyptus: a lumpy round crown, wider than it is tall, ragged on both sides.
      const r = size * 0.36 * tree.width;
      for (let dy = -r; dy <= r * 0.85; dy += px) {
        const u = dy / r;
        const lump = 0.82 + Math.sin(dy * 0.9 + tree.phase * 3) * 0.18;
        const half = Math.sqrt(Math.max(0, 1 - u * u)) * r * 1.15 * lump;
        if (half < px) continue;
        chunk(ctx, topX - half, topY + dy, half * 2, px, px);
      }
    } else {
      // Pine: five tiers, each a stepped triangle, each wider than the one above it.
      const tiers = 5;
      const tierH = size * 0.24;
      for (let i = 0; i < tiers; i += 1) {
        const u = i / tiers;
        const top = topY + size * 0.15 * i;
        const wide = size * tree.width * (0.14 + u * 0.34);
        for (let dy = 0; dy < tierH; dy += px) {
          const half = (dy / tierH) * wide;
          if (half < px) continue;
          chunk(ctx, topX - half, top + dy, half * 2, px, px);
        }
      }
    }
  }
  ctx.fill();
}

/** The trees on our side of the road, big and fast and almost featureless. */
function drawNearTrees(ctx, W, H, t, trees, travel, px) {
  const slide = travel * 0.0022 * DRIFT_X * W;
  drawTrees(ctx, W, H, t, trees, H * 0.8, slide, 0, Math.min(W, H) * 0.17, px, true);
}

/* ----------------------------------------------------------------- road ---- */

const FOCAL = 9;
const ROAD_END = 1.06; // where the road's edges leave the bottom of frame
const EDGE_X = { left: -0.42, right: 0.99 };

/**
 * Screen position of a point on the road at world distance `z` ahead of the car.
 *
 * The projection is `focal / (focal + z)` and nothing else. It matters that this is a divide and
 * not a lerp: with a linear map, things spaced evenly along the road are spaced evenly *on screen*
 * too, which is not perspective at all — the lamps never bunch toward the vanishing point and the
 * centre line never accelerates as it comes at you. One division buys both.
 */
function onRoad(z, W, H, side) {
  const p = FOCAL / (FOCAL + Math.max(0, z));
  const edgeX = side < 0 ? EDGE_X.left : EDGE_X.right;
  return {
    x: (VP.x + (edgeX - VP.x) * p) * W,
    y: (VP.y + (ROAD_END - VP.y) * p) * H,
    scale: p,
  };
}

/** How far down the road one world distance sits, as a fraction of the way to the bottom edge. */
const ROAD_RANGE = 190;

function drawRoad(ctx, W, H, t, travel, px) {
  const bandTop = H * RIDGE_END;

  // The roadside, then the road, both as flat wedges built out of rows.
  ctx.fillStyle = LAND[2];
  ctx.beginPath();
  ctx.rect(0, bandTop, W, H - bandTop);
  ctx.fill();

  // The wedge, row by row. Screen y maps straight back to the projection factor — no inversion
  // needed, because y is a plain interpolation between the vanishing point and the bottom edge.
  const rows = Math.ceil((H - bandTop) / px) + 2;
  ctx.fillStyle = '#2a2440';
  ctx.beginPath();
  for (let r = 0; r < rows; r += 1) {
    const y = bandTop + r * px;
    const p = (y / H - VP.y) / (ROAD_END - VP.y);
    if (p <= 0) continue;
    const left = (VP.x + (EDGE_X.left - VP.x) * p) * W;
    const right = (VP.x + (EDGE_X.right - VP.x) * p) * W;
    chunk(ctx, left, y, right - left, px, px);
  }
  ctx.fill();

  // Centre line: dashes in world space, so they flow toward you at the right rate. Everything
  // below a minimum scale is dropped — near the vanishing point the perspective divide crushes a
  // dozen dashes into the same few chunks and they stack into one solid bar standing on the road.
  // Spaced evenly in *world* distance, which is the only way they bunch correctly as they recede.
  // Dropped once a dash would be less than a couple of chunks tall: every chunk is floored at one
  // grid unit, so past that point consecutive dashes weld into one bar standing on end at the
  // vanishing point rather than fading out.
  const DASHES = 22;
  const GAP = 9;
  ctx.fillStyle = '#c8a33c';
  ctx.beginPath();
  for (let d = 0; d < DASHES; d += 1) {
    const z = ((d + wrap01(-travel * 0.02)) % DASHES) * GAP;
    const left = onRoad(z, W, H, -1);
    const right = onRoad(z, W, H, 1);
    const span = right.x - left.x;
    const h = span * 0.03;
    if (h < px * 1.6) continue;
    chunk(ctx, (left.x + right.x) / 2 - span * 0.011, left.y, span * 0.022, h, px);
  }
  ctx.fill();

  // The white line along the drop-off side, which is the only thing between us and the bay.
  ctx.fillStyle = '#c9c2d8';
  ctx.beginPath();
  for (let r = 0; r < rows; r += 1) {
    const y = bandTop + r * px;
    const p = (y / H - VP.y) / (ROAD_END - VP.y);
    if (p <= 0) continue;
    const left = (VP.x + (EDGE_X.left - VP.x) * p) * W;
    chunk(ctx, left, y, Math.max(px, p * W * 0.03), px, px);
  }
  ctx.fill();
}

/* ---------------------------------------------------------------- lamps ---- */

/**
 * The lamps. Copper poles with a curved arm, a sodium head, a dithered halo, and a pool of light
 * on the road under each. They are the only warm thing on this side of the water, and the reason
 * the road is legible at all.
 */
function drawLamps(ctx, W, H, t, lamps, travel, px) {
  // On the hill side, not the drop-off side. The bay edge runs off the left of frame within a few
  // poles, so a series planted there is two lamps and then nothing; on the right the line holds
  // all the way from the vanishing point to the bottom corner, which is the whole point of it.
  // Nearest last, so a near pole covers the far one it passes.
  const placed = lamps
    .map((lamp) => {
      // Evenly spaced in world distance, coming toward us; one wraps back to the far end as it
      // passes. The bunching near the vanishing point falls out of the projection for free.
      const z = wrap01(lamp.offset - travel * 0.0016) * ROAD_RANGE;
      return { lamp, at: onRoad(z, W, H, 1) };
    })
    .filter((p) => p.at.scale > 0.035 && p.at.scale < 0.98)
    .sort((a, b) => a.at.scale - b.at.scale);

  for (const { lamp, at } of placed) {
    const s = at.scale;
    const height = H * 0.34 * s;
    const poleW = Math.max(px, H * 0.008 * s);
    // The arm reaches out over the road — which from this side means back toward the left.
    const armLen = H * 0.075 * s;
    const headX = at.x - armLen;
    const headY = at.y - height;

    // Sodium lamps hum and dip; the flicker is slow and shallow or it reads as a fault.
    const flick = lamp.flicker * (0.9 + Math.sin(t * 2.7 + lamp.phase) * 0.06 + Math.sin(t * 11 + lamp.phase * 3) * 0.03);
    const fade = clamp(smoothstep(0.02, 0.12, s), 0, 1);

    // The pool it throws on the road, drawn before the pole so the pole stands in its own light.
    // Wide and flat: a street lamp lights a long ellipse down the road, not a circle under itself,
    // and this pool is the only reason the tarmac is legible at all.
    ditherGlow(ctx, headX, at.y, height * 1.05, LAMP_DEEP, 0.9 * flick * fade, px, 0.3, 1.1);
    ditherGlow(ctx, headX, at.y, height * 0.66, LAMP_MID, 0.85 * flick * fade, px, 0.28, 1.2);
    ditherGlow(ctx, headX, at.y, height * 0.34, LAMP_HOT, 0.8 * flick * fade, px, 0.26, 1.3);

    // Pole and arm. Lit down the side facing the head.
    ctx.fillStyle = COPPER;
    ctx.beginPath();
    chunk(ctx, at.x - poleW / 2, headY, poleW, height, px);
    for (let a = 0; a <= armLen; a += px) {
      const u = a / Math.max(px, armLen);
      chunk(ctx, at.x - a, headY - Math.sin(u * Math.PI * 0.5) * armLen * 0.34, poleW, poleW, px);
    }
    ctx.fill();

    // One lit edge down the side facing the lamp, which is what makes a flat bar read as copper.
    ctx.fillStyle = COPPER_LIT;
    ctx.beginPath();
    chunk(ctx, at.x - poleW / 2, headY, px, height, px);
    ctx.fill();

    // The head: a squat shade with the lamp burning under it.
    const headW = Math.max(px * 2, H * 0.026 * s);
    const headH = Math.max(px, H * 0.009 * s);
    const lampY = headY - armLen * 0.34 + headH;
    ditherGlow(ctx, headX, lampY, height * 0.34, LAMP_DEEP, 0.8 * flick * fade, px, 1, 1.5);
    ditherGlow(ctx, headX, lampY, height * 0.17, LAMP_MID, 0.9 * flick * fade, px, 1, 1.5);
    ditherGlow(ctx, headX, lampY, height * 0.075, LAMP_HOT, 1 * flick * fade, px, 1, 1.2);
    block(ctx, headX - headW / 2, headY - armLen * 0.34, headW, headH, COPPER, px);
    block(ctx, headX - headW * 0.32, headY - armLen * 0.34 + headH, headW * 0.64, headH, LAMP_CORE, px);
  }
}

/* -------------------------------------------------------------- figments ---- */

/**
 * A car, spinning end over end across the night sky. Not reflected, not explained, and gone in a
 * few seconds — the one thing in the frame that does not obey the road.
 */
function drawFigment(ctx, W, H, t, px) {
  const PERIOD = 23;
  const index = Math.floor(t / PERIOD);
  const local = t - index * PERIOD;
  const LENGTH = 5.5;
  if (local > LENGTH) return;

  const n = Math.sin(index * 12.9898) * 43758.5453;
  const seedA = n - Math.floor(n);
  const m = Math.sin(index * 78.233) * 43758.5453;
  const seedB = m - Math.floor(m);

  const u = local / LENGTH;
  // Across and slightly down, on an arc — it is falling as much as flying.
  const x = lerp(-0.15, 1.15, seedB < 0.5 ? u : 1 - u) * W;
  const y = (0.05 + seedA * 0.22 + Math.sin(u * Math.PI) * -0.06 + u * u * 0.1) * H;
  const spin = u * TAU * (2 + seedA * 2) * (seedB < 0.5 ? 1 : -1);
  const size = Math.min(W, H) * (0.035 + seedA * 0.02);
  // Fades in and out at the edges of its window; never fully solid.
  const alpha = Math.sin(u * Math.PI) ** 0.6 * 0.5;
  if (alpha < 0.02) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(snap(x, px), snap(y, px));
  ctx.rotate(spin);

  // A 16-bit car is a box, a cabin, and two dark wheels.
  block(ctx, -size, -size * 0.18, size * 2, size * 0.42, '#241a3d', px);
  block(ctx, -size * 0.55, -size * 0.5, size * 1.05, size * 0.34, '#2f2352', px);
  block(ctx, -size * 0.45, -size * 0.44, size * 0.85, size * 0.2, LAMP_HOT, px);
  block(ctx, -size * 0.72, size * 0.18, size * 0.36, size * 0.2, '#120c22', px);
  block(ctx, size * 0.4, size * 0.18, size * 0.36, size * 0.2, '#120c22', px);
  // Headlamps, still on.
  block(ctx, size * 0.86, -size * 0.1, size * 0.16, size * 0.14, LAMP_CORE, px);
  ctx.restore();
}

/** The car we are in: a black edge across the bottom, catching a little of the lamps. */
function drawHood(ctx, W, H, t, px) {
  const top = H * 0.9 + Math.sin(t * 0.7) * H * 0.004;

  ctx.fillStyle = '#0a0714';
  ctx.beginPath();
  for (let x = 0; x < W + px; x += px) {
    const u = x / W;
    // A shallow curve, higher in the middle where the bonnet crowns.
    const crown = Math.sin(u * Math.PI) * H * 0.03;
    chunk(ctx, x, top - crown, px, H - top + crown + px, px);
  }
  ctx.fill();

  // One highlight running along the crown, in the lamps' colour.
  ctx.fillStyle = '#3a2440';
  ctx.beginPath();
  for (let x = 0; x < W + px; x += px) {
    const u = x / W;
    const crown = Math.sin(u * Math.PI) * H * 0.03;
    if (u < 0.12 || u > 0.86) continue;
    chunk(ctx, x, top - crown, px, px, px);
  }
  ctx.fill();
}

/** Scanlines, at the grid's own pitch. The screen this was meant to be seen on. */
function drawScanlines(ctx, W, H, px) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  for (let y = 0; y < H; y += px * 2) ctx.rect(0, y, W, px);
  ctx.fill();
  ctx.restore();
}
