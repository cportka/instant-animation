// The ground, seen from directly overhead: a river, a town on its banks, and a lot of trees.
//
// This layer is almost never visible. The fog above it covers about ninety-five percent of the
// frame, so what reaches the viewer is a gap a few hundred pixels across, for a second or two, at
// a random place. Everything here is built for that: **value** does the work, not detail. The water
// is the darkest thing on the ground, the roads are the lightest, the roofs sit between them, and
// the vegetation is dark enough to frame all three. Drop a hole anywhere and the shapes read
// immediately, because they differ in brightness rather than in hue.
//
// De-saturated on purpose — nothing here is more than about 20% saturated. It is a real place on
// an overcast morning, not a game board.

import { TAU, clamp, lerp } from '../../lib/draw.js';
import { fbm, hash2, noise2 } from '../../effects/field.js';

/* ------------------------------------------------------------- palette ---- */

const GRASS = ['#3c4535', '#454f3c', '#4e5943', '#57624b'];
const SCRUB = '#333c2e';
const WATER_DEEP = '#2f3a40';
const WATER = '#3a474e';
const WATER_LIT = '#4c5b62';
const BANK = '#5a5c50';
const ROAD = '#63625e';
const ROAD_EDGE = '#73726c';
const ROOF_SLATE = '#4f545a';
const ROOF_TILE = '#6b5b50';
const ROOF_LEAD = '#5a5f63';
const WALL_SHADOW = 'rgba(14, 17, 14, 0.5)';
const CAFE_ROOF = '#7d5646';
const RESTAURANT_ROOF = '#6d4f52';
// Twelve shops, twelve awnings. Jewel colours pulled most of the way to grey — at this size the
// awning is four pixels of hue, and four saturated pixels would be the only saturated thing in the
// frame and would read as an error.
const JEWEL = ['#5c6f78', '#6d5f75', '#77685a', '#5f7566', '#75606a', '#66707c'];

const TREE = ['#2f3a2c', '#374330', '#3f4b36'];
const TREE_LIT = '#4a5740';

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
function nearestRiver(river, x, y) {
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

  // Big soft patches of slightly different greens, from noise sampled on a coarse grid. Drawn as
  // overlapping rectangles rather than per-pixel: at this size the boundary is invisible anyway.
  const cols = 26;
  const rows = Math.max(8, Math.round((cols * H) / W));
  for (let i = 0; i < GRASS.length; i += 1) {
    ctx.fillStyle = GRASS[i];
    ctx.beginPath();
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const n = fbm((c / cols) * 3.1, (r / rows) * 3.1, 3);
        if (Math.floor(n * GRASS.length * 0.999) !== i) continue;
        ctx.rect((c / cols) * W - 1, (r / rows) * H - 1, W / cols + 2, H / rows + 2);
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

  // Light on the water. Short strokes across the current, crawling downstream — the only thing on
  // the ground that moves, and the reason a gap in the fog reads as a live scene rather than a map.
  ctx.strokeStyle = WATER_LIT;
  ctx.lineWidth = Math.max(1, S * 0.004);
  ctx.beginPath();
  for (let i = 0; i < 42; i += 1) {
    const u = ((i / 42) + t * 0.012) % 1;
    const at = riverAt(river, u);
    const n = noise2(i * 3.1, t * 0.3 + i);
    if (n < 0.42) continue;
    const nx = Math.cos(at.angle + Math.PI / 2) * at.width * 0.42 * (n - 0.5) * 2;
    const ny = Math.sin(at.angle + Math.PI / 2) * at.width * 0.42 * (n - 0.5) * 2;
    const len = S * (0.006 + n * 0.014);
    ctx.moveTo((at.x + nx) * W - Math.cos(at.angle) * len, (at.y + ny) * H - Math.sin(at.angle) * len);
    ctx.lineTo((at.x + nx) * W + Math.cos(at.angle) * len, (at.y + ny) * H + Math.sin(at.angle) * len);
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

  // Shadows first, all of them, in one path — from overhead, a tree is a dark shape with a slightly
  // darker one beside it, and that offset is the entire read of "this thing stands up".
  ctx.fillStyle = 'rgba(12, 16, 12, 0.34)';
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
      // from overhead, and it costs one rectangle.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
      if (w > h) ctx.fillRect(-w / 2, -Math.max(1, h * 0.06), w, Math.max(1, h * 0.12));
      else ctx.fillRect(-Math.max(1, w * 0.06), -h / 2, Math.max(1, w * 0.12), h);

      if (b.kind === 'shop') {
        // The awning on the street side — twelve of these in a row down the front is what makes
        // twelve shops read as a parade rather than as more houses.
        ctx.fillStyle = b.awning;
        ctx.fillRect(-w / 2, h / 2, w, Math.max(1.5, h * 0.3));
        if (b.lamp) {
          ctx.fillStyle = 'rgba(224, 206, 168, 0.5)';
          ctx.fillRect(-w * 0.1, h / 2 + h * 0.34, Math.max(1.5, w * 0.2), Math.max(1.5, h * 0.16));
        }
      }

      if (b.kind === 'cafe') {
        // Parasols on the forecourt. Circles, from above, in a rough arc.
        ctx.fillStyle = '#8d8172';
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
        ctx.fillStyle = 'rgba(158, 152, 138, 0.55)';
        ctx.fillRect(-w * 0.55, h / 2, w * 1.1, h * 0.5);
        ctx.fillStyle = '#3f423c';
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
