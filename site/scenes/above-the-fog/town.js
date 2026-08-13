// The ground, seen from directly overhead: a river, a town on its banks, and a lot of trees.
//
// This layer is almost never visible. The fog above it covers well over ninety-five percent of the
// frame, so what reaches the viewer is a gap a couple of hundred pixels across, for a second or
// two, at a random place. Everything here is built for that: **value** does the work, not detail.
// Drop a hole anywhere and the shapes read immediately, because they differ in brightness rather
// than in hue.
//
// **The palette is reversed** — the hues are complements, so the water is the *lightest* thing on
// the ground and the roads the darkest, and the vegetation is lilac rather than green. A glimpse of
// it reads as a photographic negative, something that is not quite a place, rather than as a place
// lit differently.
//
// It is **not** a literal `255 - c` inversion, and it used to be. The negative of a de-saturated
// photograph is another de-saturated photograph: everything landed between about 130 and 210, so
// the ground came up as one flat mid-grey wash with faint lilac in it, and through a hole the size
// of a fist that is nothing at all. Two things changed.
//
// **Contrast is value.** The ladder runs the whole way — roads near black at about 20, the river the
// brightest thing on the ground at about 170 — because the only thing that survives being seen for a
// second through a hole is the difference between light and dark. Everything that was
// distinguishable by brightness before still is; there is just far more room between the rungs.
//
// **Off-ness is hue.** The complements are taken at real chroma instead of being pulled back to
// grey — violet grass, amber water, teal roofs, a *dark* glint crawling on a bright river. What
// keeps it from looking like a cartoon is that none of it is allowed to be **lit**: every colour
// here is pigment, sitting still. The neon in `lights.js` is the only thing in the frame that emits,
// and it stays the only thing.
//
// **And the whole ladder sits low.** The first pass at this took the values *up* as it took the
// chroma up — grass in the 130s to 200s, a near-white river, pale lilac trees — which is the wrong
// half of the range to be in for two reasons. The fog above is a bright grey, so a pale ground has
// nothing to be seen *against*: the river came within a few levels of the cloud in front of it and
// simply dissolved into it. And every light in the scene is additive, so a bright ground is a bright
// floor under the fires and the fireworks, and they had less room to be brighter than it. Deep
// violet grass under a deep amber river, all of it richer than the pale version and most of it forty
// or fifty levels below where it was, gives the peek-a-boos something to be a hole *in* and the
// neon somewhere to burn.

import { TAU, clamp, lerp } from '../../lib/draw.js';
import { fbm, hash2, noise2 } from '../../effects/field.js';

/* ------------------------------------------------------------- palette ---- */

// The comments name what each thing *is*, not what it now looks like, so the inversion stays
// legible as an inversion. The number after each is its rough luminance — the ladder is the point,
// so it is written down where it can be checked rather than trusted.

// Grass, at four steps that are genuinely four steps apart: deep violet, 110 down to 57.
const GRASS = ['#8163a6', '#6d5194', '#5a4083', '#472f70'];
// Hedge lines between the fields — and *darker than the grass*, which is what a hedge from above
// actually is. It was paler than everything it crossed and read as a scratch.
const SCRUB = '#33205c';
// The river. Deep water was the darkest thing in the world, so inverted it is the brightest thing on
// the ground — but "brightest on the ground" is a deep amber at 170, not the cream at 238 it was.
// Against a bright cloud, a near-white river is not a river, it is a gap in the fog.
const WATER_DEEP = '#cfa55f';
const WATER = '#b98b45';
// The crawl of light on the surface, which inverts to a crawl of *dark*. Keeping that honest is the
// single oddest thing in the frame and worth all of the rest: a black glitter running downstream.
const WATER_LIT = '#5c4018';
const BANK = '#3f3550';
// Tarmac was pale, so the roads are the near-black in this picture — the one hard value in a scene
// with no hard edges, and the thing a peek-a-boo lands on and immediately reads as a town.
const ROAD = '#1c2429';
const ROAD_EDGE = '#0c1013';
// Roofs, spread from a pale slate down to a deep teal tile, so a cluster of buildings is a cluster
// of *different* buildings rather than one mass with lines on it. Slate stays the lightest thing in
// the town because a roof catching the sky is the one place a bright value belongs.
const ROOF_SLATE = '#8a9c96';
const ROOF_TILE = '#245066';
const ROOF_LEAD = '#5a6069';
// The one place the inversion is felt as more than a colour swap: a shadow becomes a *highlight*, so
// the side of a roof that was dark now flares. Amber rather than white, so it belongs to the river's
// half of the palette instead of being the one uncoloured thing in frame.
const WALL_SHADOW = 'rgba(240, 226, 178, 0.55)';
const CAFE_ROOF = '#1d6274';
const RESTAURANT_ROOF = '#553a70';
// Twelve shops, twelve awnings, at jewel chroma. These used to be pulled most of the way to grey on
// the grounds that four saturated pixels would be the only saturated thing in frame — but they are
// four *dark* pixels, and dark saturated pigment reads as an awning. Nothing here is bright enough
// to be mistaken for something burning, which was the actual risk.
const JEWEL = ['#6e2438', '#1f4463', '#245a4f', '#5e3d12', '#3d2f6b', '#6b2418'];

// Canopy, sitting above the grass in value and below the river — so a wood reads as a wood against
// the field it stands in, which is the only job these have.
const TREE = ['#a68fc0', '#9881b4', '#8a73a8'];
const TREE_LIT = '#c0acd4';


/* ---------------------------------------------------------------- plan ---- */

/**
 * Everything about the ground, worked out once. The river is the spine: it is generated first, and
 * the road, the town and the trees are all placed relative to it, which is what stops the result
 * looking like three unrelated layers stacked up.
 */
export function planGround(rng) {
  // The river, as a smooth path down the frame. Control points wander left and right; the drawing
  // code smooths through them, so "lazy winding" comes from having few of them, far apart.
  const river = [];
  const bends = 7;
  let x = 0.5 + rng.range(-0.12, 0.12);
  for (let i = 0; i <= bends; i += 1) {
    river.push({ x, y: -0.12 + (i / bends) * 1.24, w: rng.range(0.045, 0.075) });
    x = clamp(x + rng.range(-0.19, 0.19), 0.16, 0.84);
  }

  // The town sits on one bank, in a stretch of the river's length. Both are chosen once.
  const townFrom = rng.range(0.24, 0.34);
  const townTo = townFrom + 0.42;
  const side = rng.next() < 0.5 ? -1 : 1;

  const buildings = [];
  const place = (along, offset, w, h, kind, roof, extra = {}) => {
    const at = riverAt(river, along);
    const nx = Math.cos(at.angle + Math.PI / 2);
    const ny = Math.sin(at.angle + Math.PI / 2);
    buildings.push({
      x: at.x + nx * offset * side,
      y: at.y + ny * offset * side,
      w,
      h,
      angle: at.angle,
      kind,
      roof,
      ...extra,
    });
  };

  // Twelve jewellers in a parade along the front, which is what the owner asked for and also the
  // only way twelve of anything reads as twelve rather than as "some": a regular rhythm, one
  // detail varying down the row.
  for (let i = 0; i < 12; i += 1) {
    const along = lerp(townFrom + 0.03, townTo - 0.09, i / 11);
    place(along, rng.range(0.052, 0.062), 0.019, 0.026, 'shop', i % 2 ? ROOF_SLATE : ROOF_LEAD, {
      awning: JEWEL[i % JEWEL.length],
      // A courtyard light behind a few of them, so the row is not perfectly uniform.
      lamp: rng.next() < 0.4,
    });
  }

  // The cafe on the corner with a forecourt of parasols, and the restaurant further along, larger,
  // with its own terrace. Two buildings that have to be *identifiable* at a glance.
  place(townTo - 0.055, rng.range(0.05, 0.058), 0.026, 0.03, 'cafe', CAFE_ROOF, { parasols: 5 });
  place(townFrom - 0.015, rng.range(0.055, 0.065), 0.038, 0.036, 'restaurant', RESTAURANT_ROOF, {
    tables: 7,
  });

  // Ordinary houses behind the front, on a second and third row, so the town has depth.
  for (let i = 0; i < 26; i += 1) {
    const along = rng.range(townFrom - 0.03, townTo + 0.02);
    const row = 0.085 + Math.floor(rng.range(0, 3)) * 0.036 + rng.range(-0.008, 0.008);
    place(along, row, rng.range(0.016, 0.028), rng.range(0.018, 0.03), 'house',
      [ROOF_SLATE, ROOF_TILE, ROOF_LEAD][Math.floor(rng.range(0, 3))]);
  }

  // Trees everywhere the town is not. Placement is rejection-sampled against the river and the
  // buildings, because a canopy sitting on a roof or floating on the water is the one mistake that
  // makes an overhead view stop reading as an overhead view.
  const trees = [];
  for (let i = 0; i < 620 && trees.length < 420; i += 1) {
    const tx = rng.next();
    const ty = rng.next();
    const near = nearestRiver(river, tx, ty);
    if (near.distance < near.width * 0.62) continue;
    if (buildings.some((b) => Math.abs(b.x - tx) < b.w * 0.9 && Math.abs(b.y - ty) < b.h * 0.9)) continue;
    // Denser away from the town, so the settlement sits in a clearing.
    const clearing = buildings.reduce((m, b) => Math.min(m, Math.hypot(b.x - tx, b.y - ty)), 1);
    if (clearing < 0.06 && rng.next() < 0.8) continue;
    trees.push({
      x: tx,
      y: ty,
      r: rng.range(0.006, 0.021),
      tint: Math.floor(rng.range(0, TREE.length)),
      lit: rng.next() < 0.35,
    });
  }

  // Field boundaries: a few long soft lines in the grass, which is most of what tells you a green
  // field from above is farmed rather than wild.
  const fields = Array.from({ length: 9 }, () => ({
    x: rng.next(),
    y: rng.next(),
    angle: rng.range(0, TAU),
    len: rng.range(0.12, 0.36),
  }));


  return { river, buildings, trees, fields, townFrom, townTo, side };
}

/** A point on the river at parameter `u` in 0..1, with the tangent angle and half-width there. */
function riverAt(river, u) {
  const span = (river.length - 1) * clamp(u, 0, 0.999);
  const i = Math.floor(span);
  const f = span - i;
  const a = river[i];
  const b = river[Math.min(river.length - 1, i + 1)];
  const smooth = f * f * (3 - 2 * f);
  const x = lerp(a.x, b.x, smooth);
  const y = lerp(a.y, b.y, smooth);
  const ahead = 0.01;
  const s2 = Math.min(0.999, u + ahead) * (river.length - 1);
  const j = Math.floor(s2);
  const g = s2 - j;
  const c = river[j];
  const d = river[Math.min(river.length - 1, j + 1)];
  const sm = g * g * (3 - 2 * g);
  return {
    x,
    y,
    width: lerp(a.w, b.w, smooth),
    angle: Math.atan2(lerp(c.y, d.y, sm) - y, lerp(c.x, d.x, sm) - x),
  };
}

/** Distance from a point to the river's centreline, sampled coarsely — good enough to reject on. */
export function nearestRiver(river, x, y) {
  let best = { distance: 1, width: 0.05 };
  for (let s = 0; s <= 60; s += 1) {
    const at = riverAt(river, s / 60);
    const d = Math.hypot(at.x - x, at.y - y);
    if (d < best.distance) best = { distance: d, width: at.width };
  }
  return best;
}

/* ---------------------------------------------------------------- draw ---- */

export function drawGround(ctx, W, H, t, ground) {
  const S = Math.min(W, H);
  drawVegetation(ctx, W, H, ground);
  drawRiver(ctx, W, H, t, ground.river);
  drawRoads(ctx, W, H, ground);
  drawTrees(ctx, W, H, S, ground.trees);
  drawBuildings(ctx, W, H, S, ground.buildings);
}





/** Grass, in patches. One flat green over the whole frame reads as felt. */
function drawVegetation(ctx, W, H, ground) {
  ctx.fillStyle = GRASS[1];
  ctx.fillRect(0, 0, W, H);

  // Big soft patches at the four tiers, from noise sampled on a coarse grid — as overlapping
  // **discs**, not as a grid of rectangles.
  //
  // Rectangles were fine while the four tiers were within a few levels of each other: the boundary
  // genuinely was invisible, and the old comment here said so. Spread across seventy levels the
  // same code became a wall of tiles, which is the one texture that announces "generated" out loud
  // and is exactly what a peek-a-boo would land on. Discs a little wider than a cell merge into
  // their neighbours and leave an organic edge for the same number of operations.
  const cols = 34;
  const rows = Math.max(10, Math.round((cols * H) / W));
  const cell = Math.hypot(W / cols, H / rows);
  for (let i = 0; i < GRASS.length; i += 1) {
    ctx.fillStyle = GRASS[i];
    ctx.beginPath();
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const n = fbm((c / cols) * 3.1, (r / rows) * 3.1, 3);
        if (Math.floor(n * GRASS.length * 0.999) !== i) continue;
        const h = hash2(c * 1.7, r * 2.3);
        const k = hash2(c * 4.1 + 9, r * 3.7);
        const x = ((c + 0.5) / cols) * W + (h - 0.5) * (W / cols) * 0.8;
        const y = ((r + 0.5) / rows) * H + (k - 0.5) * (H / rows) * 0.8;
        const radius = cell * (0.62 + h * 0.42);
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, TAU);
      }
    }
    ctx.fill();
  }

  // Field boundaries — hedge lines, darker than anything around them.
  ctx.strokeStyle = SCRUB;
  ctx.lineWidth = Math.max(1, Math.min(W, H) * 0.0035);
  ctx.beginPath();
  for (const f of ground.fields) {
    ctx.moveTo(f.x * W, f.y * H);
    ctx.lineTo((f.x + Math.cos(f.angle) * f.len) * W, (f.y + Math.sin(f.angle) * f.len) * H);
  }
  ctx.stroke();
}

/** The river: a wide dark ribbon with a pale bank and a slow crawl of light on the surface. */
function drawRiver(ctx, W, H, t, river) {
  const S = Math.min(W, H);
  const ribbon = (width, style) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let s = 0; s <= 90; s += 1) {
      const at = riverAt(river, s / 90);
      if (s === 0) ctx.moveTo(at.x * W, at.y * H);
      else ctx.lineTo(at.x * W, at.y * H);
    }
    ctx.stroke();
  };

  ribbon(S * 0.088, BANK);
  ribbon(S * 0.07, WATER);
  ribbon(S * 0.045, WATER_DEEP);

  // Light on the water — inverted, so a *dark* glitter crawling downstream on a pale river. The only
  // thing on the ground that moves, and the reason a gap in the fog reads as a live scene rather
  // than a map.
  //
  // Two details keep it from reading as road markings, which is what it did the moment the river
  // went pale and the glints went dark. The strokes lie **across** the current, the way a wave crest
  // does — along it, evenly spaced down the middle of a pale ribbon, is a centre line and nothing
  // else. And their position across the channel drifts on its own slow noise instead of being
  // derived from the same value as their length, so they scatter over the water rather than tracking
  // in a lane.
  ctx.strokeStyle = WATER_LIT;
  ctx.lineWidth = Math.max(1, S * 0.0035);
  ctx.beginPath();
  for (let i = 0; i < 42; i += 1) {
    const u = ((i / 42) + hash2(i * 2.9, 3) * 0.021 + t * 0.012) % 1;
    const at = riverAt(river, u);
    const n = noise2(i * 3.1, t * 0.3 + i);
    if (n < 0.42) continue;
    const across = (noise2(i * 7.7, t * 0.12) - 0.5) * 1.7;
    const nx = Math.cos(at.angle + Math.PI / 2);
    const ny = Math.sin(at.angle + Math.PI / 2);
    const cx = (at.x + nx * at.width * 0.42 * across) * W;
    const cy = (at.y + ny * at.width * 0.42 * across) * H;
    const len = S * (0.004 + n * 0.011);
    ctx.moveTo(cx - nx * len, cy - ny * len);
    ctx.lineTo(cx + nx * len, cy + ny * len);
  }
  ctx.stroke();
}

/** The riverside road, its side streets, and the bridge. */
function drawRoads(ctx, W, H, ground) {
  const S = Math.min(W, H);
  const { river, side, townFrom, townTo } = ground;

  const along = (offset, width, style, from, to) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let s = 0; s <= 60; s += 1) {
      const u = lerp(from, to, s / 60);
      const at = riverAt(river, u);
      const nx = Math.cos(at.angle + Math.PI / 2) * offset * side;
      const ny = Math.sin(at.angle + Math.PI / 2) * offset * side;
      if (s === 0) ctx.moveTo((at.x + nx) * W, (at.y + ny) * H);
      else ctx.lineTo((at.x + nx) * W, (at.y + ny) * H);
    }
    ctx.stroke();
  };

  // The front, running the length of the town, and a back lane behind the houses.
  along(0.038, S * 0.016, ROAD_EDGE, townFrom - 0.07, townTo + 0.07);
  along(0.038, S * 0.012, ROAD, townFrom - 0.07, townTo + 0.07);
  along(0.125, S * 0.011, ROAD, townFrom - 0.02, townTo + 0.03);

  // Side streets, running away from the water.
  ctx.strokeStyle = ROAD;
  ctx.lineWidth = S * 0.008;
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const at = riverAt(river, lerp(townFrom, townTo, i / 4));
    const nx = Math.cos(at.angle + Math.PI / 2) * side;
    const ny = Math.sin(at.angle + Math.PI / 2) * side;
    ctx.moveTo((at.x + nx * 0.038) * W, (at.y + ny * 0.038) * H);
    ctx.lineTo((at.x + nx * 0.16) * W, (at.y + ny * 0.16) * H);
  }
  ctx.stroke();

  // One bridge, because a town on a river has one and its absence is felt.
  const at = riverAt(river, townFrom + 0.16);
  const nx = Math.cos(at.angle + Math.PI / 2);
  const ny = Math.sin(at.angle + Math.PI / 2);
  ctx.strokeStyle = ROAD_EDGE;
  ctx.lineWidth = S * 0.014;
  ctx.beginPath();
  ctx.moveTo((at.x - nx * 0.06) * W, (at.y - ny * 0.06) * H);
  ctx.lineTo((at.x + nx * 0.06) * W, (at.y + ny * 0.06) * H);
  ctx.stroke();
}

/**
 * Canopies, each a small cluster with a shadow thrown off it.
 *
 * A crown drawn as one circle is the mistake that turns four hundred trees into a polka-dot
 * pattern: the eye finds a field of identical discs instantly, and once it has, the whole ground
 * layer reads as a texture rather than as a place. Three offset circles at three different sizes
 * cost the same — everything is still batched into one path per tint, so it is four fills for the
 * lot however many lumps each crown has.
 */
function drawTrees(ctx, W, H, S, trees) {
  const crown = (tree, cx, cy, scale) => {
    for (let i = 0; i < 3; i += 1) {
      const h = hash2(tree.x * 137 + i * 4.3, tree.y * 211 - i * 7.1);
      const a = hash2(tree.x * 53 - i * 9.7, tree.y * 71 + i * 2.9) * TAU;
      const d = tree.r * S * (0.1 + h * 0.34);
      const r = tree.r * S * scale * (0.62 + h * 0.46);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
  };

  // Shadows first, all of them, in one path. Inverted, a cast shadow is a *pale* shape beside the
  // crown rather than a dark one — but the offset is doing the same job it always did, and it is
  // the offset, not the darkness, that reads as "this thing stands up".
  ctx.fillStyle = 'rgba(226, 206, 156, 0.45)';
  ctx.beginPath();
  for (const tree of trees) {
    crown(tree, (tree.x + tree.r * 0.4) * W, (tree.y + tree.r * 0.48) * H, 1);
  }
  ctx.fill();

  for (let i = 0; i < TREE.length; i += 1) {
    ctx.fillStyle = TREE[i];
    ctx.beginPath();
    for (const tree of trees) {
      if (tree.tint !== i) continue;
      crown(tree, tree.x * W, tree.y * H, 1);
    }
    ctx.fill();
  }

  // A highlight on the sunward side of some crowns.
  ctx.fillStyle = TREE_LIT;
  ctx.beginPath();
  for (const tree of trees) {
    if (!tree.lit) continue;
    crown(tree, (tree.x - tree.r * 0.28) * W, (tree.y - tree.r * 0.32) * H, 0.5);
  }
  ctx.fill();
}

/** Roofs, from above, each with the shadow that makes it a building rather than a rectangle. */
function drawBuildings(ctx, W, H, S, buildings) {
  const oriented = (b, fn) => {
    ctx.save();
    ctx.translate(b.x * W, b.y * H);
    ctx.rotate(b.angle);
    fn();
    ctx.restore();
  };

  // Shadows, offset down-right, all in one pass.
  ctx.fillStyle = WALL_SHADOW;
  for (const b of buildings) {
    oriented(b, () => {
      ctx.fillRect(-b.w * W * 0.5 + S * 0.006, -b.h * H * 0.5 + S * 0.007, b.w * W, b.h * H);
    });
  }

  for (const b of buildings) {
    oriented(b, () => {
      const w = b.w * W;
      const h = b.h * H;
      ctx.fillStyle = b.roof;
      ctx.fillRect(-w / 2, -h / 2, w, h);

      // A ridge line down the middle of the roof: the single detail that reads as a pitched roof
      // from overhead, and it costs one rectangle. Inverted along with everything else, so the lit
      // ridge is now a dark one.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      if (w > h) ctx.fillRect(-w / 2, -Math.max(1, h * 0.06), w, Math.max(1, h * 0.12));
      else ctx.fillRect(-Math.max(1, w * 0.06), -h / 2, Math.max(1, w * 0.12), h);

      if (b.kind === 'shop') {
        // The awning on the street side — twelve of these in a row down the front is what makes
        // twelve shops read as a parade rather than as more houses.
        ctx.fillStyle = b.awning;
        ctx.fillRect(-w / 2, h / 2, w, Math.max(1.5, h * 0.3));
        if (b.lamp) {
          ctx.fillStyle = 'rgba(12, 24, 54, 0.7)';
          ctx.fillRect(-w * 0.1, h / 2 + h * 0.34, Math.max(1.5, w * 0.2), Math.max(1.5, h * 0.16));
        }
      }

      if (b.kind === 'cafe') {
        // Parasols on the forecourt. Circles, from above, in a rough arc.
        ctx.fillStyle = '#1b2330';
        ctx.beginPath();
        for (let i = 0; i < b.parasols; i += 1) {
          const px = lerp(-w * 0.45, w * 0.45, i / (b.parasols - 1));
          const py = h * 0.62 + Math.sin(i * 1.7) * h * 0.1;
          const r = Math.max(1.6, S * 0.0055);
          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, TAU);
        }
        ctx.fill();
      }

      if (b.kind === 'restaurant') {
        // A terrace: a paler slab with tables on it.
        ctx.fillStyle = 'rgba(18, 22, 34, 0.55)';
        ctx.fillRect(-w * 0.55, h / 2, w * 1.1, h * 0.5);
        ctx.fillStyle = '#d8c69a';
        ctx.beginPath();
        for (let i = 0; i < b.tables; i += 1) {
          const px = lerp(-w * 0.42, w * 0.42, i / (b.tables - 1));
          const py = h * 0.72;
          const r = Math.max(1.2, S * 0.003);
          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, TAU);
        }
        ctx.fill();
      }
    });
  }
}
