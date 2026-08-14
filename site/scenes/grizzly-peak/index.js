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

import { createRng } from '../../lib/rng.js';
import { TAU, clamp, lerp, smoothstep, wave, wrap01 } from '../../lib/draw.js';
import { bayerOn, block, chunk, ditherGlow, ditherRamp, hash01, pixelSize, snap } from '../../effects/pixel.js';

/* ------------------------------------------------------------- horizons ---- */

// The frame is cut into bands once, in normalised height, and everything hangs off these. They sit
// above `meta` because one of the compositions below is defined by where it meets `RIDGE_END`, and
// a `const` referenced before its declaration is a dead-zone throw at import time rather than a
// value — which would take the whole gallery down, not just this scene.
const HORIZON = 0.44; // where the water meets the far shore
const WATER_END = 0.57; // the near edge of the bay, at the foot of the drop-off
const RIDGE_END = 0.71; // the bottom of the treed slope, where the roadside starts

export const meta = {
  id: 'grizzly-peak',
  title: 'Westbound on Grizzly Peak',
  prompt:
    "2.5D 16-bit from the perspective of a car travelling diagonally up and to the left, a series of copper bronze street lamps, a cliff drop-off overlooking the bay from Grizzly Peak west to the water, trees, and a fiery sunset in a night sky — with a car spinning as a figment across it on occasion",
  created: '2026-08-09',
  background: '#050b2e',
  posterTime: 12,
  // ...and so does the way you arrive. The channel change into it is a screen of tiles being rewritten out of
  // order — every displacement a whole number of chunks, and the seam lit like a sodium lamp.
  transition: 'pixel',
  // The nav arrows wear the scene: a stepped sprite in sodium amber, hard shadow, no glow.
  chrome: 'pixel',
  // Pixel art wants one device pixel per drawn pixel. At 2x the chunks are drawn twice as fine and
  // the whole point of the grid — that you can see it — goes away.
  maxDpr: 1,

  // Two compositions of the same drive, cycled by a tap on the picture.
  //
  // **Index 0 is what the gallery lands on**, and what a bare `#grizzly-peak` has always meant — so
  // this is a pure addition: every link already in the wild still opens the road out over the bay.
  //
  // Past `id` and `title`, everything in a variant is this scene's own vocabulary. The shell reads
  // those two and forwards the whole block to `create()` without looking inside it, which is what
  // keeps "a scene has several compositions" from becoming an engine concept — the engine only
  // knows the ring, and the artwork knows what turning it means.
  variants: [
    {
      id: 'over-the-bay',
      title: 'Over the Bay',
      // The vanishing point sits *at the waterline*, so the road climbs out of the bottom-right
      // corner and runs out over the bay, floating in front of the sunset. The one thing in this
      // scene that is not trying to be plausible — and it is why the cliff exists: a road with
      // nothing underneath it has to show you the edge it is running along, or it reads as a
      // mistake rather than as a liberty.
      road: {
        vp: { x: 0.28, y: 0.4 },
        curve: 0.2,
        edges: { left: -0.12, right: 0.8 },
        from: 0.4,
        range: 328,
        rate: 0.0004,
        lamps: 12,
        cliff: true,
      },
    },
    {
      id: 'into-the-dark',
      title: 'Into the Dark',
      // Where this scene started. The vanishing point is down on the slope and the road does not
      // bend, so the frame splits cleanly in two: sunset, city and bay above the line, and below it
      // nothing but tarmac and lamps running away into the dark. The whole composition is that one
      // horizontal edge — what the car is driving *toward* on one side of it, and what it is
      // driving *into* on the other — and the bend was what dissolved it, because a road that
      // leans across the frame has no side to be on.
      //
      // Wider at the bottom and a shorter lamp track than the bay road: the split only reads if the
      // lower half is filled, and lamps that arrive rarely leave it empty.
      road: {
        vp: { x: 0.3, y: 0.7 },
        curve: 0,
        edges: { left: -0.42, right: 0.99 },
        // The rows start at the roadside rather than at the vanishing point, which is the whole
        // trick of the split: above this line the road simply does not exist.
        from: RIDGE_END,
        range: 190,
        rate: 0.0016,
        lamps: 9,
        cliff: false,
      },
    },
  ],
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

// Stars are not white. Four soft tints, none of them saturated — the sweetness is in how narrow
// the range is, and one properly bright star among a field of dim ones.
const STAR_TINTS = ['#cdd8ff', '#ffeedd', '#ffd7e6', '#d4fbff'];
// The arc a lamp goes out over, as a fraction of its approach. It has to finish before the lamp
// reaches the corner, or the burst is cut off by the edge of frame instead of by the fade.
const LAMP_EXIT = { from: 0.7, to: 0.97 };
// Five ways for a lamp to stop existing. Each lamp draws the same one every time it comes round,
// picked when the scene is built, so the road has a mix rather than a sequence.
export const EXIT_KINDS = ['glitch', 'confetti', 'mosh', 'ember', 'bolts'];

/* --------------------------------------------------------------- travel ---- */

// More sideways than upward — the brief is diagonal, but mostly left.
const SPEED = 46;
const DRIFT_X = 1;
const DRIFT_Y = 0.32;

/* ------------------------------------------------------------ the scene ---- */

/**
 * @param variant  one of `meta.variants`. Defaults to the first, so every caller that predates
 *                 compositions — and every scene-shaped test — keeps working untouched.
 */
export function create({ width, height, seed = meta.id, variant = meta.variants[0] }) {
  const rng = createRng(seed);
  const road = makeRoad(variant.road);

  const stars = Array.from({ length: 260 }, () => ({
    x: rng.next(),
    y: rng.range(0, HORIZON * 0.92),
    bright: rng.next(),
    // Slow rates, and each star on its own — a field that pulses together is a strobe. These are
    // meant to be noticed one at a time, out of the corner of the eye.
    rate: rng.range(0.22, 0.95),
    phase: rng.range(0, TAU),
    tint: rng.int(0, STAR_TINTS.length - 1),
    // Only some ever throw a cross. If they all did, the sky would be a christmas tree.
    sparkles: rng.next() < 0.3,
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

  const farTrees = makeTrees(96, 0.075);
  // The roadside. Few and moderate, and rooted up the slope rather than at the bottom edge —
  // down there the road is nearly the full width of frame and a tree of any size is a wipe.
  const nearTrees = makeTrees(23, 0.21);

  // The lamps live on one track along the left edge of the road, evenly spaced in *world* distance
  // — which is what makes them bunch up toward the vanishing point on their own. How many, and how
  // far apart, is the composition's call: the long road out over the bay carries more of them.
  const lamps = Array.from({ length: road.lamps }, (_, i) => ({
    offset: i / road.lamps,
    flicker: rng.range(0.7, 1),
    exit: EXIT_KINDS[rng.int(0, EXIT_KINDS.length - 1)],
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
      drawRoad(ctx, W, H, t, travel, px, road);
      drawLamps(ctx, W, H, t, lamps, travel, px, road);
      drawHood(ctx, W, H, t, px);
      drawScanlines(ctx, W, H, px);
    },
  };
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

/**
 * The sky. Each star runs its own slow swell and, at the top of it, the brightest ones throw a
 * four-point cross — the whole trick of a sparkle, at this resolution, is that it is the same star
 * with four chunks added, so it reads as light rather than as a bigger dot.
 *
 * Batched by tint: one path per colour rather than one fill per star, which is the difference
 * between four fills a frame and two hundred and sixty.
 */
function drawStars(ctx, W, H, t, stars, travel, px) {
  const paths = STAR_TINTS.map(() => []);

  for (const star of stars) {
    // The sky is the slowest layer there is — the stars barely acknowledge that the car is moving.
    const x = wrap01(star.x + travel * 0.00002 * DRIFT_X) * W;
    const y = star.y * H + travel * 0.00002 * DRIFT_Y * H;
    // Nothing survives near the fire.
    const drowned = smoothstep(HORIZON * 0.45, HORIZON, y / H);
    if (drowned >= 1) continue;

    const swell = 0.5 + Math.sin(t * star.rate + star.phase) * 0.5;
    const level = star.bright * (0.35 + swell * 0.85) * (1 - drowned);
    if (level < 0.34) continue;
    paths[star.tint].push([x, y, star.sparkles && level > 0.86]);
  }

  for (let i = 0; i < STAR_TINTS.length; i += 1) {
    if (!paths[i].length) continue;
    ctx.fillStyle = STAR_TINTS[i];
    ctx.beginPath();
    for (const [x, y, cross] of paths[i]) {
      chunk(ctx, x, y, px, px, px);
      if (!cross) continue;
      chunk(ctx, x - px, y, px, px, px);
      chunk(ctx, x + px, y, px, px, px);
      chunk(ctx, x, y - px, px, px, px);
      chunk(ctx, x, y + px, px, px, px);
    }
    ctx.fill();
  }
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
    // Four silhouettes, because a hillside of two shapes repeated is a wallpaper. At this distance
    // the outline is the entire tree, so the only thing that distinguishes them is that outline.
    if (tree.kind < 0.3) {
      // Eucalyptus: a lumpy round crown, wider than it is tall, ragged on both sides.
      const r = size * 0.36 * tree.width;
      for (let dy = -r; dy <= r * 0.85; dy += px) {
        const u = dy / r;
        const lump = 0.82 + Math.sin(dy * 0.9 + tree.phase * 3) * 0.18;
        const half = Math.sqrt(Math.max(0, 1 - u * u)) * r * 1.15 * lump;
        if (half < px) continue;
        chunk(ctx, topX - half, topY + dy, half * 2, px, px);
      }
    } else if (tree.kind < 0.58) {
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
    } else if (tree.kind < 0.82) {
      // Cypress: a tall narrow spindle, widest a third of the way down. The vertical note in the
      // line — a ridge of nothing but round crowns has no rhythm to it.
      const tall = size * 0.62;
      const wide = size * 0.14 * tree.width;
      for (let dy = 0; dy < tall; dy += px) {
        const u = dy / tall;
        const half = wide * Math.sin(Math.min(1, u * 1.15) * Math.PI) ** 0.55;
        if (half < px) continue;
        chunk(ctx, topX - half, topY + dy, half * 2, px, px);
      }
    } else {
      // Dead: bare angular limbs off a bare trunk. One in six or so, and they are what stop the
      // treeline reading as decoration — something on this hillside did not make it.
      const limbs = 5;
      for (let i = 0; i < limbs; i += 1) {
        const up = 0.15 + (i / limbs) * 0.6;
        const from = [topX + tree.lean * size * up, topY + size * 0.55 * up];
        const angle = (hash01(tree.phase * 31 + i * 7.3) - 0.5) * 1.7 - (i % 2 ? 1 : 2) * 0.55;
        const reach = size * (0.2 + hash01(tree.phase * 17 + i) * 0.24) * tree.width;
        const steps = Math.max(2, Math.round(reach / px));
        for (let s = 0; s <= steps; s += 1) {
          const at = (s / steps) * reach;
          chunk(ctx, from[0] + Math.cos(angle) * at, from[1] + Math.sin(angle) * at, px, px, px);
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

/**
 * Turn a variant's road block into the projection the drawing code actually uses.
 *
 * Everything that differs between the two compositions passes through here and comes out as one
 * object, which is then handed to every function that draws anything on the road. That is the whole
 * mechanism: there is not one `if (variant …)` anywhere in the draw code, because the variant stops
 * being a choice the moment the scene is built and becomes a set of numbers like any other. A
 * composition is data, not a branch.
 *
 * `FOCAL` and `ROAD_END` stay out of it: they are the camera, not the composition. Both roads are
 * seen through the same lens from the same seat — what changes is where the road goes.
 */
function makeRoad(cfg) {
  const { vp, curve, edges } = cfg;

  /** The bend, in normalised width. Zero under the car, growing with the square of the distance. */
  const bendAt = (p) => -curve * (1 - p) * (1 - p);

  /** Normalised x of one road edge at projection factor `p`. */
  const edgeAt = (p, side) => vp.x + ((side < 0 ? edges.left : edges.right) - vp.x) * p + bendAt(p);

  return {
    ...cfg,
    edgeAt,

    /**
     * Screen position of a point on the road at world distance `z` ahead of the car.
     *
     * The projection is `focal / (focal + z)` and nothing else. It matters that this is a divide and
     * not a lerp: with a linear map, things spaced evenly along the road are spaced evenly *on
     * screen* too, which is not perspective at all — the lamps never bunch toward the vanishing
     * point and the centre line never accelerates as it comes at you. One division buys both.
     */
    at(z, W, H, side) {
      const p = FOCAL / (FOCAL + Math.max(0, z));
      return { x: edgeAt(p, side) * W, y: (vp.y + (ROAD_END - vp.y) * p) * H, scale: p };
    },

    /**
     * The road as rows, from where it begins down to the bottom of frame.
     *
     * `from` is the composition's own decision and is not always the vanishing point. Over the bay
     * the road starts *at* the vanishing point, up on the waterline, and is drawn over the water for
     * most of its length. Into the dark it starts at the roadside — above that line the road simply
     * does not exist, and that absence is the split the whole composition is built on.
     */
    rows(W, H, px) {
      const top = H * cfg.from;
      const out = [];
      for (let r = 0, n = Math.ceil((H - top) / px) + 2; r < n; r += 1) {
        const y = top + r * px;
        const p = (y / H - vp.y) / (ROAD_END - vp.y);
        if (p > 0) out.push({ y, p, left: edgeAt(p, -1) * W, right: edgeAt(p, 1) * W });
      }
      return out;
    },
  };
}

/**
 * How far out the lamp track runs, and how fast it comes at you — `road.range` and `road.rate`.
 *
 * These two have to move together. A lamp's world distance is `wrap01(offset - travel * rate) *
 * range`, so stretching the range alone spaces the lamps further apart *and* speeds them up by
 * exactly the same factor — they arrive just as often and nothing changes. Changing the rate
 * alongside is what actually makes them rarer: a longer gap, at the same closing speed.
 */

function drawRoad(ctx, W, H, t, travel, px, road) {
  const rows = road.rows(W, H, px);

  // The roadside on the hill side only — beyond the right-hand edge there is nothing to stand on.
  ctx.fillStyle = LAND[2];
  ctx.beginPath();
  ctx.rect(0, H * RIDGE_END, W, H - H * RIDGE_END);
  ctx.fill();

  // The cliff. Everything to the right of the road falls away, and the drop is drawn as a real
  // face rather than implied by a change of colour: a band of near-black hanging off the edge,
  // deepening as it comes toward you, with the far side of it ragged where the rock breaks up.
  // This is the whole difference between a road with a dark verge and a road on a precipice.
  //
  // Only the road that has nowhere to stand needs it. The road on the ground is *on* the slope, and
  // hanging a precipice off a road that plainly rests on something reads as a hole in the ground.
  if (road.cliff) {
    ctx.fillStyle = LAND[0];
    ctx.beginPath();
    for (const row of rows) {
      const depth = row.p * W * 0.17;
      const ragged = 1 + Math.sin(row.y * 0.09) * 0.12 + Math.sin(row.y * 0.31) * 0.06;
      chunk(ctx, row.right, row.y, depth * ragged, px, px);
    }
    ctx.fill();
  }

  // The wedge itself, row by row. Screen y maps straight back to the projection factor — no
  // inversion needed, because y interpolates between the vanishing point and the bottom edge.
  ctx.fillStyle = '#241f38';
  ctx.beginPath();
  for (const row of rows) chunk(ctx, row.left, row.y, row.right - row.left, px, px);
  ctx.fill();

  if (road.cliff) {
    // The lip: the last strip of tarmac before the drop. A hard bright line on the very edge is what
    // the eye reads as "this stops here" — and it is deliberately *cool*, catching sky rather than
    // lamplight, because in copper it disappeared into the pools the lamps were throwing over it.
    ctx.fillStyle = '#cfc2f0';
    ctx.beginPath();
    for (const row of rows) {
      const lip = Math.max(px, row.p * W * 0.012);
      chunk(ctx, row.right - lip, row.y, lip, px, px);
    }
    ctx.fill();

    // A second, dimmer line a little way down the face, so the drop has a near edge and a far one
    // and the eye has something to measure the depth against.
    ctx.fillStyle = '#3a2f5c';
    ctx.beginPath();
    for (const row of rows) {
      chunk(ctx, row.right + row.p * W * 0.05, row.y, Math.max(px, row.p * W * 0.02), px, px);
    }
    ctx.fill();
  }

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
    const left = road.at(z, W, H, -1);
    const right = road.at(z, W, H, 1);
    const span = right.x - left.x;
    const h = span * 0.03;
    if (h < px * 1.6) continue;
    chunk(ctx, (left.x + right.x) / 2 - span * 0.011, left.y, span * 0.022, h, px);
  }
  ctx.fill();

  // The white line on the hill side.
  ctx.fillStyle = '#c9c2d8';
  ctx.beginPath();
  for (const row of rows) chunk(ctx, row.left, row.y, Math.max(px, row.p * W * 0.025), px, px);
  ctx.fill();

  if (road.cliff) drawGuardRail(ctx, W, H, travel, px, road);
}

/**
 * The rail along the cliff edge. Posts spaced in world distance so they rush past at the same rate
 * as everything else on the road, with a slack cable strung between them.
 *
 * It does more for the drop than the black face does: a rail is a thing people put where you would
 * otherwise fall, so the eye reads the danger off the object rather than off the shading.
 */
function drawGuardRail(ctx, W, H, travel, px, road) {
  const POSTS = 26;
  const GAP = 7;
  const posts = [];
  for (let i = 0; i < POSTS; i += 1) {
    const z = ((i + wrap01(-travel * 0.02)) % POSTS) * GAP;
    const at = road.at(z, W, H, 1);
    if (at.scale < 0.05 || at.scale > 1.02) continue;
    posts.push(at);
  }
  posts.sort((a, b) => a.scale - b.scale);

  // The cable first, behind the posts, sagging between them.
  ctx.fillStyle = '#6d5f8a';
  ctx.beginPath();
  for (let i = 0; i < posts.length - 1; i += 1) {
    const a = posts[i];
    const b = posts[i + 1];
    const steps = Math.max(2, Math.round(Math.abs(b.x - a.x) / px));
    for (let s = 0; s <= steps; s += 1) {
      const u = s / steps;
      const x = a.x + (b.x - a.x) * u;
      const scale = a.scale + (b.scale - a.scale) * u;
      const top = a.y + (b.y - a.y) * u - scale * H * 0.055;
      chunk(ctx, x, top + Math.sin(u * Math.PI) * scale * H * 0.006, px, Math.max(px, scale * H * 0.008), px);
    }
  }
  ctx.fill();

  ctx.fillStyle = '#4a3f63';
  ctx.beginPath();
  for (const at of posts) {
    const h = at.scale * H * 0.06;
    if (h < px) continue;
    chunk(ctx, at.x - Math.max(px, at.scale * W * 0.004), at.y - h, Math.max(px, at.scale * W * 0.007), h, px);
  }
  ctx.fill();
}

/* ---------------------------------------------------------------- lamps ---- */

/**
 * The lamps. Copper poles with a curved arm, a sodium head, a dithered halo, and a pool of light
 * on the road under each. They are the only warm thing on this side of the water, and the reason
 * the road is legible at all.
 */
function drawLamps(ctx, W, H, t, lamps, travel, px, road) {
  // On the hill side, not the drop-off side. The bay edge runs off the left of frame within a few
  // poles, so a series planted there is two lamps and then nothing; on the right the line holds
  // all the way from the vanishing point to the bottom corner, which is the whole point of it.
  // Nearest last, so a near pole covers the far one it passes.
  const placed = lamps
    .map((lamp) => {
      // Evenly spaced in world distance, coming toward us; one wraps back to the far end as it
      // passes. The bunching near the vanishing point falls out of the projection for free.
      const z = wrap01(lamp.offset - travel * road.rate) * road.range;
      return { lamp, at: road.at(z, W, H, 1) };
    })
    .filter((p) => p.at.scale > 0.035 && p.at.scale < 1.02)
    .sort((a, b) => a.at.scale - b.at.scale);

  for (const { lamp, at } of placed) {
    const s = at.scale;
    // How far through going out this one is. It used to simply stop being drawn at the near end,
    // which reads as a bug however fast it happens — there is no distance at which an object the
    // size of a street lamp can vanish between two frames and be taken for anything else.
    const exit = smoothstep(LAMP_EXIT.from, LAMP_EXIT.to, s);
    const height = H * 0.34 * s;
    const poleW = Math.max(px, H * 0.008 * s);
    // The arm reaches out over the road — which from this side means back toward the left.
    const armLen = H * 0.075 * s;
    const headX = at.x - armLen;
    const headY = at.y - height;

    // Sodium lamps hum and dip; the flicker is slow and shallow or it reads as a fault.
    const flick = lamp.flicker * (0.9 + Math.sin(t * 2.7 + lamp.phase) * 0.06 + Math.sin(t * 11 + lamp.phase * 3) * 0.03);
    // Fading in at the vanishing point, and dying hard at the near end — the light collapses
    // faster than the metal does, so the pole is briefly a dark shape in its own dying halo.
    const fade = clamp(smoothstep(0.02, 0.12, s), 0, 1) * (1 - exit) ** 2;
    const solid = 1 - smoothstep(0.25, 0.75, exit);

    // The pool it throws on the road, drawn before the pole so the pole stands in its own light.
    // Wide and flat: a street lamp lights a long ellipse down the road, not a circle under itself,
    // and this pool is the only reason the tarmac is legible at all.
    ditherGlow(ctx, headX, at.y, height * 1.05, LAMP_DEEP, 0.9 * flick * fade, px, 0.3, 1.1);
    ditherGlow(ctx, headX, at.y, height * 0.66, LAMP_MID, 0.85 * flick * fade, px, 0.28, 1.2);
    ditherGlow(ctx, headX, at.y, height * 0.34, LAMP_HOT, 0.8 * flick * fade, px, 0.26, 1.3);

    // Pole and arm. Lit down the side facing the head. As the lamp goes out the metal comes apart
    // from the top down, so what is left standing is the base — the part furthest from the fault.
    ctx.save();
    ctx.globalAlpha = clamp(solid, 0, 1);
    ctx.fillStyle = COPPER;
    ctx.beginPath();
    const standing = height * solid;
    chunk(ctx, at.x - poleW / 2, at.y - standing, poleW, standing, px);
    for (let a = 0; a <= armLen; a += px) {
      const u = a / Math.max(px, armLen);
      chunk(ctx, at.x - a, headY - Math.sin(u * Math.PI * 0.5) * armLen * 0.34, poleW, poleW, px);
    }
    ctx.fill();

    // One lit edge down the side facing the lamp, which is what makes a flat bar read as copper.
    ctx.fillStyle = COPPER_LIT;
    ctx.beginPath();
    chunk(ctx, at.x - poleW / 2, at.y - standing, px, standing, px);
    ctx.fill();

    // The head: a squat shade with the lamp burning under it.
    const headW = Math.max(px * 2, H * 0.026 * s);
    const headH = Math.max(px, H * 0.009 * s);
    const lampY = headY - armLen * 0.34 + headH;
    block(ctx, headX - headW / 2, headY - armLen * 0.34, headW, headH, COPPER, px);
    block(ctx, headX - headW * 0.32, headY - armLen * 0.34 + headH, headW * 0.64, headH, LAMP_CORE, px);
    ctx.restore();

    ditherGlow(ctx, headX, lampY, height * 0.34, LAMP_DEEP, 0.8 * flick * fade, px, 1, 1.5);
    ditherGlow(ctx, headX, lampY, height * 0.17, LAMP_MID, 0.9 * flick * fade, px, 1, 1.5);
    ditherGlow(ctx, headX, lampY, height * 0.075, LAMP_HOT, 1 * flick * fade, px, 1, 1.2);

    // And the way out, whichever one this lamp was given.
    if (exit > 0) drawLampExit(ctx, lamp.exit, headX, lampY, height * 0.78, exit, lamp.phase * 97, px);
  }
}

/**
 * A lamp's way out. Five of them, one per lamp, chosen when the scene is built so the road shows a
 * mix rather than a sequence.
 *
 * All five are deliberately small, brief and dim. A lamp reaching the near end is the most ordinary
 * thing that happens in this scene — it does it every few seconds — and an effect that grabs the
 * frame turns a passing detail into the subject. The rule each one is built to: under about sixty
 * chunks, at most three fills, gone in half a second, and never brighter than the lamp it replaces.
 *
 * @param {number} progress 0 at the moment the lamp fails, 1 when there is nothing left.
 */
export function drawLampExit(ctx, kind, cx, cy, size, progress, seed, px) {
  const u = clamp(progress, 0, 1);
  // Brightest at the failure and fading from there. A burst that ramps up reads as something
  // arriving; this is something leaving.
  const alpha = clamp((1 - u) * 1.25, 0, 1) * 0.95;
  if (alpha < 0.02) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (kind === 'glitch') exitGlitch(ctx, cx, cy, size, u, seed, px);
  else if (kind === 'confetti') exitConfetti(ctx, cx, cy, size, u, seed, px);
  else if (kind === 'mosh') exitMosh(ctx, cx, cy, size, u, seed, px);
  else if (kind === 'ember') exitEmber(ctx, cx, cy, size, u, seed, px);
  else exitBolts(ctx, cx, cy, size, u, seed, px);
  ctx.restore();
}

/** A stepped clock, so an effect judders between a few states instead of sliding through them. */
const judder = (u, steps) => Math.floor(u * steps);

/**
 * **Glitch.** The lamp comes apart into horizontal slices that tear sideways and drop out one at a
 * time. Slices leave on a hashed roll against the progress, so it thins unevenly rather than
 * fading — which is the difference between a glitch and a dissolve.
 */
function exitGlitch(ctx, cx, cy, size, u, seed, px) {
  const bars = 9;
  const w = size * 0.42;
  const h = size * 0.3;
  const step = judder(u, 9);
  // A shear across the whole stack: every slice is offset a little further than the one above it,
  // so the lamp does not just come apart, it *leans* apart along a hard diagonal.
  const shear = (hash01(seed + step * 4.3) - 0.5) * size * 0.5;

  for (const [colour, side] of [[COPPER, 0], [LAMP_HOT, 1]]) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (let i = 0; i < bars; i += 1) {
      if (i % 2 !== side) continue;
      if (hash01(seed + i * 7.1) < u * 0.85) continue; // this slice has already gone
      const lean = shear * (i / bars) * (0.4 + u);
      const shove = (hash01(seed + i * 3.3 + step * 1.7) - 0.5) * size * 0.7 * (0.3 + u);
      const wide = w * (0.35 + hash01(seed + i * 5.9 + step) * 0.9);
      chunk(ctx, cx - wide / 2 + shove + lean, cy - h / 2 + (i * h) / bars, wide, h / bars, px);
    }
    ctx.fill();
  }
}

/**
 * **Confetti.** The lamp bursts into small squares that fly out and fall. Squares, not sparks —
 * one chunk each, no trails, so the whole thing is sixteen rectangles in three fills.
 */
function exitConfetti(ctx, cx, cy, size, u, seed, px) {
  const N = 18;
  const palette = [FIRE[1], FIRE[3], LAMP_HOT];

  for (let c = 0; c < palette.length; c += 1) {
    ctx.fillStyle = palette[c];
    ctx.beginPath();
    for (let i = c; i < N; i += palette.length) {
      // Eight directions, not a free angle. Confetti cut on the grid throws on the grid, and the
      // eight-way fan is what keeps the burst reading as angular rather than as a puff.
      const angle = (Math.floor(hash01(seed + i * 4.7) * 8) / 8) * TAU;
      const speed = size * (0.35 + hash01(seed + i * 9.1) * 0.55);
      const x = cx + Math.cos(angle) * speed * u;
      // Thrown out, then gravity takes it — squared, so the arc turns over near the top.
      const y = cy + Math.sin(angle) * speed * u + size * 0.8 * u * u;
      // Shards rather than dots: each is a two-chunk bar lying along one axis or the other.
      const flat = hash01(seed + i * 2.9) < 0.5;
      chunk(ctx, x, y, flat ? px * 2 : px, flat ? px : px * 2, px);
    }
    ctx.fill();
  }
}

/**
 * **Data mosh.** The lamp smears sideways into a few flat bands that stretch and re-seed, the way
 * a decoder drags one row of blocks across the picture. Five rectangles — the cheapest of the five
 * and, at this size, the one that reads most immediately as *wrong* rather than as an effect.
 */
function exitMosh(ctx, cx, cy, size, u, seed, px) {
  const bands = 7;
  const h = size * 0.34;
  const step = judder(u, 7);

  for (const [colour, side] of [[LAMP_MID, 0], [COPPER, 1]]) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (let i = 0; i < bands; i += 1) {
      if (i % 2 !== side) continue;
      const n = hash01(seed + i * 6.3 + step * 2.9);
      // Each band stretches from its own start, further as the smear runs on. Alternating bands
      // run the other way, so the shape stays a hard-edged comb instead of a single arrow.
      const wide = size * (0.12 + u * 1.5 * (0.3 + n));
      const drift = (hash01(seed + i * 2.1 + step) - 0.5) * size * 0.24;
      const back = i % 3 === 0 ? -wide : 0;
      chunk(ctx, cx - size * 0.12 + drift + back, cy - h / 2 + (i * h) / bands, wide, h / bands, px);
    }
    ctx.fill();
  }
}

/**
 * **Flame to ash.** A handful of chunks lift, brighten through the fire ramp, then go grey and
 * fall. The colour is chosen by *age*, not by particle, so the whole cluster turns over together —
 * which is what makes it read as one thing burning out rather than as separate embers.
 */
function exitEmber(ctx, cx, cy, size, u, seed, px) {
  const N = 16;
  // Yellow, orange, red, ash. The last is the point: fire that fades out is a light, fire that
  // goes grey has burned something.
  const ramp = u < 0.22 ? [FIRE[0], FIRE[1]] : u < 0.45 ? [FIRE[1], FIRE[2]] : u < 0.68 ? [FIRE[3], FIRE[4]] : ['#4a4358', '#2a2438'];

  for (let c = 0; c < ramp.length; c += 1) {
    ctx.fillStyle = ramp[c];
    ctx.beginPath();
    for (let i = c; i < N; i += ramp.length) {
      const spread = (hash01(seed + i * 3.1) - 0.5) * size * 0.6;
      const lift = size * (0.35 + hash01(seed + i * 8.7) * 0.8);
      // Rises while it burns, then the ash settles back down.
      const rise = u < 0.68 ? -lift * u : -lift * 0.68 + lift * (u - 0.68) * 1.4;
      // Straight lean rather than a wander: a flame that snakes reads as smoke.
      const lean = (hash01(seed + i * 5.7) - 0.5) * size * 0.3 * u;
      const tall = hash01(seed + i * 1.9) < 0.6;
      chunk(ctx, cx + spread + lean, cy + rise, tall ? px : px * 2, tall ? px * 2 : px, px);
    }
    ctx.fill();
  }
}

/**
 * **Bolts.** The current leaves in every direction — then, quickly, the bolts stop being lines and
 * break into juddering fragments that scatter and go.
 *
 * The jag is what makes a line read as current rather than as a ray, and the break-up is what stops
 * it outstaying its welcome: the lines only exist for the first third, and everything after that is
 * loose chunks re-seeded on a stepped clock, so it comes apart in front of you instead of fading.
 */
function exitBolts(ctx, cx, cy, size, u, seed, px) {
  const BOLTS = 7;
  const STEPS = 3;
  const ALONG = 3; // chunks laid down each segment — dashed, not solid
  const reach = size * 0.72;
  const drawn = smoothstep(0, 0.34, u);
  const step = judder(u, 12);

  // Walk every bolt once and collect the two things drawn: dashes down each segment, and a
  // brighter node at each kink. Two arrays, two fills, and a *fixed* chunk count.
  //
  // Filling each segment in proportion to its pixel length is what made the first version of this
  // three hundred chunks and easily the loudest thing in the frame. At this size a bolt drawn as a
  // dotted line reads exactly the same and is a fifth of the ink.
  const dashes = [];
  const nodes = [];

  for (let b = 0; b < BOLTS; b += 1) {
    let angle = (b / BOLTS) * TAU + hash01(seed + b * 3.7) * 0.6;
    let x = cx;
    let y = cy;
    for (let s = 0; s < STEPS; s += 1) {
      // Snapped to sixteenths of a turn. A free angle wanders; a quantised one breaks, and a
      // break is what reads as current arcing rather than as a drawn curve.
      angle += Math.round((hash01(seed + b * 11.3 + s * 5.9) - 0.5) * 5) * (TAU / 16);
      const run = (reach / STEPS) * (0.4 + drawn);
      const nx = x + Math.cos(angle) * run;
      const ny = y + Math.sin(angle) * run;

      if (u < 0.34) {
        for (let i = 1; i <= ALONG; i += 1) {
          dashes.push([x + (nx - x) * (i / ALONG), y + (ny - y) * (i / ALONG)]);
        }
        nodes.push([nx, ny]);
      } else if (hash01(seed + b * 2.3 + s * 4.1 + step) > (u - 0.34) * 1.9) {
        // Come apart: one juddering fragment where the segment used to end, drifting outward.
        const jx = (hash01(seed + b + s * 7.7 + step * 3.1) - 0.5) * size * 0.22;
        const jy = (hash01(seed + b * 5.3 + s + step * 2.3) - 0.5) * size * 0.22;
        dashes.push([nx + jx, ny + jy]);
      }
      x = nx;
      y = ny;
    }
  }

  for (const [colour, points] of [[LAMP_HOT, dashes], ['#bfeaff', nodes]]) {
    if (!points.length) continue;
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (const [x, y] of points) chunk(ctx, x, y, px * 1.6, px * 1.6, px);
    ctx.fill();
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
