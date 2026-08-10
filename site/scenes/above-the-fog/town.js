// The ground, seen from directly overhead: a river, a town on its banks, and a lot of trees.
//
// This layer is almost never visible. The fog above it covers well over ninety-five percent of the
// frame, so what reaches the viewer is a gap a couple of hundred pixels across, for a second or
// two, at a random place. Everything here is built for that: **value** does the work, not detail.
// Drop a hole anywhere and the shapes read immediately, because they differ in brightness rather
// than in hue.
//
// **The palette is reversed** — every colour is its own photo negative, channel by channel. So the
// water is now the *lightest* thing on the ground and the roads the darkest, the vegetation is a
// pale lilac rather than a dark green, and the whole ground comes up bright underneath grey
// weather. Inverting is not the same as picking pale colours: it takes the hues to their
// complements too, which is what makes a glimpse of it read as a photographic negative — something
// that is not quite a place — rather than as a place lit differently.
//
// The value *structure* survives the inversion intact, which is the reason it works: everything
// that was distinguishable by brightness still is, just the other way up. Still de-saturated —
// nothing here is more than about 20% saturated — because inverting a near-neutral leaves a
// near-neutral.

import { TAU, clamp, glow, lerp, rgba, wrap01 } from '../../lib/draw.js';
import { fbm, hash2, noise2 } from '../../effects/field.js';

/* ------------------------------------------------------------- palette ---- */

// Each of these is `255 - c` per channel of the colour it replaced. The comments name what the
// thing *is*, not what it now looks like, so the inversion stays legible as an inversion.
const GRASS = ['#c3baca', '#bab0c3', '#b1a6bc', '#a89db4'];
const SCRUB = '#ccc3d1';
const WATER_DEEP = '#d0c5bf';
const WATER = '#c5b8b1';
const WATER_LIT = '#b3a49d';
const BANK = '#a5a3af';
const ROAD = '#9c9da1';
const ROAD_EDGE = '#8c8d93';
const ROOF_SLATE = '#b0aba5';
const ROOF_TILE = '#94a4af';
const ROOF_LEAD = '#a5a09c';
// The one place the inversion is felt as more than a colour swap: a shadow becomes a *highlight*,
// so the side of a roof that was dark now flares.
const WALL_SHADOW = 'rgba(241, 238, 241, 0.5)';
const CAFE_ROOF = '#82a9b9';
const RESTAURANT_ROOF = '#92b0ad';
// Twelve shops, twelve awnings. Jewel colours pulled most of the way to grey — at this size the
// awning is four pixels of hue, and four saturated pixels would be the only saturated thing in the
// frame and would read as an error.
const JEWEL = ['#a39087', '#929fa8', '#8897a5', '#a08a99', '#8a9f95', '#998f83'];

const TREE = ['#d0c5d3', '#c8bccf', '#c0b4c9'];
const TREE_LIT = '#b5a8bf';

// The only saturated thing anywhere in this gallery's third animation, and deliberately so. Every
// other colour in the scene has been pulled to within twenty percent of neutral and then inverted;
// against that, a cyan and a green at full chroma do not read as "some coloured pixels", they read
// as the one thing in frame that is *lit* rather than merely visible. Which is what fire is.
const FIRE = {
  blue: { body: [64, 200, 255], core: [214, 246, 255] },
  green: { body: [72, 255, 158], core: [222, 255, 236] },
};

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

  // Fires. Placed off the water and thinned out near the houses, because the interesting thing is
  // one burning in a field with nothing around it rather than a town on fire.
  const fires = [];
  for (let i = 0; i < 120 && fires.length < 7; i += 1) {
    const fx = rng.next();
    const fy = rng.next();
    const near = nearestRiver(river, fx, fy);
    if (near.distance < near.width * 1.1) continue;
    if (fires.some((f) => Math.hypot(f.x - fx, f.y - fy) < 0.16)) continue;
    fires.push({
      x: fx,
      y: fy,
      hue: i % 2 ? 'blue' : 'green',
      r: rng.range(0.012, 0.028),
      rate: rng.range(0.7, 1.7),
      phase: rng.range(0, 20),
      // Seconds between neon bursts, and where in that cycle this one is. Prime-ish and unequal, so
      // seven fires never come to agree.
      burst: rng.range(11, 27),
      burstPhase: rng.next(),
    });
  }

  return { river, buildings, trees, fields, fires, townFrom, townTo, side };
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
  drawFires(ctx, W, H, S, t, ground.fires);
}

/**
 * How hard a fire is flaring right now, 0..1 — zero almost all of the time.
 *
 * Exported because the fog draws the *scatter* of these, and the two have to agree exactly: light
 * from below and the glow it throws into the cloud above it are one event, and computing the
 * envelope twice is how they end up a frame apart.
 */
export function burstAt(fire, t) {
  const u = wrap01(t / fire.burst + fire.burstPhase);
  const width = 0.1;
  return u < width ? Math.sin((u / width) * Math.PI) ** 0.7 : 0;
}

/**
 * The fires seen *through* the fog: a coloured bloom on the near side of the whole cloud.
 *
 * Fog does not simply hide a light, it carries it — a lamp inside a bank of it turns the bank into
 * the lamp, over a radius many times the source. So this is drawn after all the weather rather than
 * with the flame, is an order of magnitude wider and far fainter than what makes it, and is the
 * only reason a fire under a hundred feet of cloud registers at all. It is also the one place any
 * colour survives to the top of the frame, so the scene reads as grey weather with something
 * burning underneath it rather than as grey weather.
 */
export function fireBloom(ctx, W, H, S, t, fires) {
  if (!fires) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const fire of fires) {
    const burst = burstAt(fire, t);
    const flicker = flickerAt(fire, t);
    const { body } = FIRE[fire.hue];
    const spread = S * fire.r * (3.4 + burst * 7) * (0.85 + flicker * 0.3);
    // Between bursts this is a faint coloured stain in the cloud and nothing more. A burst is meant
    // to be the one moment the scene has a colour in it, so it climbs by an order of magnitude.
    const centre = clamp(0.045 + burst * 0.3, 0, 1);
    // `glow`'s last argument is the alpha at 45% of the radius, not a falloff rate. Handing it a
    // number larger than the centre alpha turns the glow inside out and draws a *ring* — which is
    // what a light in fog is emphatically not, and looked like seven flying saucers.
    glow(ctx, fire.x * W, fire.y * H, spread, body, centre, centre * 0.5);
  }
  ctx.restore();
}

/** The flame's own unsteadiness, separate from the bursts. */
export const flickerAt = (fire, t) =>
  0.62 + 0.38 * (noise2(fire.phase, t * fire.rate * 2.6) * 0.65 + noise2(fire.phase + 7.3, t * fire.rate * 6.1) * 0.35);

/**
 * Fires, in blue and green, with the occasional neon burst.
 *
 * Drawn additively — they are light, not paint, and a flame composited normally over grass is a
 * coloured shape lying on it. `lighter` is also what lets the core go white without a white in the
 * palette: enough saturated blue on top of itself simply arrives there.
 */
function drawFires(ctx, W, H, S, t, fires) {
  if (!fires) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const fire of fires) {
    const x = fire.x * W;
    const y = fire.y * H;
    const flicker = flickerAt(fire, t);
    const burst = burstAt(fire, t);
    const { body, core } = FIRE[fire.hue];
    const r = S * fire.r;

    // A fire is a small bright thing. Most of what you ever see of one is the light it throws into
    // the cloud above it — see `fireBloom` — so the flame itself stays modest and the burst does the
    // shouting.
    glow(ctx, x, y, r * (1.9 + burst * 2.6) * flicker, body, clamp(0.22 * flicker + burst * 0.5, 0, 1), 0.1);
    glow(ctx, x, y, r * (0.7 + burst * 0.45) * flicker, core, clamp(0.34 + burst * 0.5, 0, 1), 0.28);

    if (burst > 0.03) {
      // The burst: a ring going out, and a few spikes with it. Both thin and both brief — a neon
      // tube's whole character is that it is a *line* of light, so anything soft here would read as
      // a second glow rather than as a discharge.
      //
      // The ring is **broken**, and the spikes are at hashed angles rather than even ones. An
      // unbroken circle with nine evenly spaced rays is a compass rose: the one shape in the frame
      // that could only have been produced by arithmetic.
      const reach = r * (1.2 + burst * 4);
      ctx.strokeStyle = rgba(core, clamp(burst * 0.6, 0, 1));
      ctx.lineWidth = Math.max(1, S * 0.0013);
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const from = (i / 5) * TAU + fire.phase * 0.7;
        const arc = TAU * (0.06 + 0.11 * hash2(fire.phase + i, i * 3.1));
        ctx.arc(x, y, reach * (0.92 + 0.16 * hash2(i * 5.3, fire.phase)), from, from + arc);
      }
      ctx.stroke();

      ctx.strokeStyle = rgba(body, clamp(burst * 0.7, 0, 1));
      ctx.lineWidth = Math.max(1, S * 0.0018);
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = hash2(fire.phase + i * 2.7, i) * TAU;
        const from = reach * (0.4 + 0.3 * hash2(i, fire.phase));
        const to = reach * (0.9 + 0.6 * noise2(i * 2.3 + fire.phase, t * 2.4));
        ctx.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from);
        ctx.lineTo(x + Math.cos(a) * to, y + Math.sin(a) * to);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
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

  // Shadows first, all of them, in one path. Inverted, a cast shadow is a *pale* shape beside the
  // crown rather than a dark one — but the offset is doing the same job it always did, and it is
  // the offset, not the darkness, that reads as "this thing stands up".
  ctx.fillStyle = 'rgba(243, 239, 243, 0.34)';
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
      ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
      if (w > h) ctx.fillRect(-w / 2, -Math.max(1, h * 0.06), w, Math.max(1, h * 0.12));
      else ctx.fillRect(-Math.max(1, w * 0.06), -h / 2, Math.max(1, w * 0.12), h);

      if (b.kind === 'shop') {
        // The awning on the street side — twelve of these in a row down the front is what makes
        // twelve shops read as a parade rather than as more houses.
        ctx.fillStyle = b.awning;
        ctx.fillRect(-w / 2, h / 2, w, Math.max(1.5, h * 0.3));
        if (b.lamp) {
          ctx.fillStyle = 'rgba(31, 49, 87, 0.5)';
          ctx.fillRect(-w * 0.1, h / 2 + h * 0.34, Math.max(1.5, w * 0.2), Math.max(1.5, h * 0.16));
        }
      }

      if (b.kind === 'cafe') {
        // Parasols on the forecourt. Circles, from above, in a rough arc.
        ctx.fillStyle = '#727e8d';
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
        ctx.fillStyle = 'rgba(97, 103, 117, 0.55)';
        ctx.fillRect(-w * 0.55, h / 2, w * 1.1, h * 0.5);
        ctx.fillStyle = '#c0bdc3';
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
