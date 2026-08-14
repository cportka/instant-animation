// The ground, seen from directly overhead: a river, a town on its banks, and a lot of trees.
//
// This layer is almost never visible. The fog above it covers well over ninety-five percent of the
// frame, so what reaches the viewer is a gap a couple of hundred pixels across, for a second or
// two, at a random place. Everything here is built for that: **value** does the work, not detail.
// Drop a hole anywhere and the shapes read immediately, because they differ in brightness rather
// than in hue.
//
// **The palette is reversed** — the hues are complements, so the water is the *lightest* thing on
// the ground and the roads the darkest, and the vegetation is blue rather than green. A glimpse of
// it reads as a photographic negative, something that is not quite a place, rather than as a place
// lit differently.
//
// It is **not** a literal `255 - c` inversion, and it used to be. The negative of a de-saturated
// photograph is another de-saturated photograph: everything landed between about 130 and 210, so
// the ground came up as one flat mid-grey wash with faint lilac in it, and through a hole the size
// of a fist that is nothing at all. Two things changed.
//
// **Contrast is value.** The ladder runs the whole way — roads near black at about 4, the river the
// brightest thing on the ground at about 102 — because the only thing that survives being seen for a
// second through a hole is the difference between light and dark. Everything that was
// distinguishable by brightness before still is; there is just far more room between the rungs.
//
// **Off-ness is hue.** The complements are taken at real chroma instead of being pulled back to
// grey — deep blue ground, amber water, a *dark* glint crawling on a bright river. What keeps it
// from looking like a cartoon is that none of it is allowed to be **lit**: every colour here is
// pigment, sitting still. The fires and the fireworks in `lights.js` are the only things in the
// frame that emit, and they stay the only ones.
//
// **The scheme is one cool family against one warm axis.** Everything growing or built is blue —
// four steps of it in the grass, a lighter blue in the canopy, blue-grey in the rock and the roofs
// — and the two things that are *not* are the river and the roads, which run amber and a warm
// near-black. That is what a peek-a-boo needs: a field of one hue with a seam of its opposite
// running through it, so the river reads as the river the instant it appears rather than as a
// lighter bit of ground. The ground was violet through several rounds and violet is the wrong
// choice here for a reason that only shows next to everything else — it sits half-way between the
// blue of the weather and the warm of the fire, so it argued with both.
//
// **And the whole ladder sits low.** The first pass at this took the values *up* as it took the
// chroma up — grass in the 130s to 200s, a near-white river, pale lilac trees — which is the wrong
// half of the range to be in for two reasons. The fog above is a bright grey, so a pale ground has
// nothing to be seen *against*: the river came within a few levels of the cloud in front of it and
// simply dissolved into it. And every light in the scene is additive, so a bright ground is a bright
// floor under the fires and the fireworks, and they had less room to be brighter than it. Deep
// blue grass under a burnt amber river, all of it richer than the pale version and most of it a
// hundred levels below where it started, gives the peek-a-boos something to be a hole *in* and the
// fires somewhere to burn.

import { TAU, clamp, lerp } from '../../lib/draw.js';
import { fbm, hash2, noise2 } from '../../effects/field.js';

/* ------------------------------------------------------------- palette ---- */

// The comments name what each thing *is*, not what it now looks like, so the inversion stays
// legible as an inversion. The number after each is its rough luminance — the ladder is the point,
// so it is written down where it can be checked rather than trusted.

// Grass, at four steps that are genuinely four steps apart: deep blue, 55 down to 25, at nearly
// ninety percent saturation — the chroma is what stops that reading as "the lights went out".
const GRASS = ['#123a86', '#0e2f70', '#0a245b', '#071a46'];
// Hedge lines between the fields — and *darker than the grass*, which is what a hedge from above
// actually is. It was paler than everything it crossed and read as a scratch.
const SCRUB = '#050e22';
// The river, and the warm half of the whole scheme. Deep water was the darkest thing in the world,
// so inverted it is the brightest thing on the ground — a burnt amber at 102, not the cream at 238
// it began as, because against a bright cloud a near-white river is not a river, it is a gap in the
// fog. It is also the only large warm mass down there, which is what makes the blue read as blue.
const WATER_DEEP = '#93610f';
const WATER = '#794d08';
// The crawl of light on the surface, which inverts to a crawl of *dark*. Keeping that honest is the
// single oddest thing in the frame and worth all of the rest: a black glitter running downstream.
const WATER_LIT = '#241606';
const BANK = '#0d1730';
// Tarmac was pale, so the roads are the near-black in this picture — the one hard value in a scene
// with no hard edges, and the thing a peek-a-boo lands on and immediately reads as a town. Warm
// near-black rather than the cold grey-teal they were: at this value the hue barely registers as a
// hue, but a cold grey sitting in a blue field is the one neutral that reads as *dirty*, and it
// was the thing in frame that looked like a mistake.
const ROAD = '#130b04';
const ROAD_EDGE = '#060302';
// Roofs, spread from a blue-grey slate down to a deep teal tile, so a cluster of buildings is a
// cluster of *different* buildings rather than one mass with lines on it. Slate stays the lightest
// thing in the town because a roof catching the sky is the one place a brighter value belongs.
const ROOF_SLATE = '#456080';
const ROOF_TILE = '#0a2438';
const ROOF_LEAD = '#232a38';
// The one place the inversion is felt as more than a colour swap: a shadow becomes a *highlight*, so
// the side of a roof that was dark now flares. Amber rather than white, so it belongs to the river's
// half of the palette instead of being the one uncoloured thing in frame.
const WALL_SHADOW = 'rgba(176, 148, 88, 0.5)';
const CAFE_ROOF = '#04324c';
const RESTAURANT_ROOF = '#152552';
// Twelve shops, twelve awnings, at jewel chroma. These used to be pulled most of the way to grey on
// the grounds that four saturated pixels would be the only saturated thing in frame — but they are
// four *dark* pixels, and dark saturated pigment reads as an awning. Nothing here is bright enough
// to be mistaken for something burning, which was the actual risk.
const JEWEL = ['#44081c', '#08234a', '#072d28', '#432801', '#0e1550', '#450b03'];

// Canopy, sitting above the grass in value and below the river — so a wood reads as a wood against
// the field it stands in, which is the only job these have. The gap to the brightest grass is
// sixteen levels and it is the tightest join in the palette: close it and four hundred trees
// disappear into the field, open it and they come back as pale speckle.
const TREE = ['#2f66b4', '#27599f', '#1f4c8a'];
const TREE_LIT = '#3a74c4';
const TRUNK = '#080f1a';

// The shaded side of everything that stands up. One colour for every wall in the town rather than a
// shade per roof: from this height a wall is three or four pixels of a face nobody is meant to
// study, and forty separate darks in it read as noise where one reads as *the side away from the
// light*.
const WALL = '#04070f';
const CAST = 'rgba(1, 3, 10, 0.38)';

// Rock, reed, scrub. The ground was river, grass, road, roof and canopy and nothing else, which is
// four hundred identical lollipops on a lawn — the three things here are all irregular by
// construction and exist to break that up.
const ROCK = ['#28324a', '#1c2536', '#333d55'];
const REED = '#4c3c14';
const SCRUB_LEAF = ['#194280', '#133668'];

// Neon, and it is **blue** — azure, periwinkle and a cyan-teal, alternating so the town does not hum
// on one note. Not a colour anything down there *is*: a rim on the edges that catch, which at this
// size is the only way an outline can carry a hue without becoming a cartoon border.
//
// Blue neon on a blue ground sounds like it should vanish and does the opposite, because the rim is
// far more *saturated* and slightly brighter than anything it sits on — it reads as the same
// material lit rather than as a different object outlined, which is exactly what neon is. The one
// exception is the waterline, which takes an amber rim: the river is the warm axis of the scheme and
// a cold rim on it would cut it out of the picture it belongs to.
const NEON = ['rgba(28, 200, 255, 0.62)', 'rgba(86, 132, 255, 0.58)', 'rgba(20, 246, 222, 0.48)'];
const NEON_WATER = 'rgba(255, 148, 40, 0.36)';
const NEON_ROAD = 'rgba(40, 172, 255, 0.32)';

/* --------------------------------------------------------------- 2.5D ---- */

/**
 * How far a thing of a given height leans, in the direction it leans.
 *
 * The camera is no longer *exactly* overhead. Points displace **radially from the centre of frame**
 * in proportion to their height, which is what a very long lens looking almost — but not quite —
 * straight down actually does: the building under the lens shows you its roof and nothing else, and
 * the one at the corner of the frame shows you a wall. A single fixed lean direction would have been
 * cheaper and is the thing that makes an isometric mock-up look like a mock-up, because every object
 * in it is being viewed from the same impossible place.
 *
 * The consequence worth knowing: the scene now has a *principal point*, and it is the middle of the
 * frame. Nothing there stands up at all. That is correct and it is also why the town is never
 * planned dead-centre.
 */
export const LEAN = 0.055;
export const leanX = (px, W, height) => px + (px - W / 2) * height * LEAN;
export const leanY = (py, H, height) => py + (py - H / 2) * height * LEAN;


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
    // An irregular footprint, as four corners each pushed out by its own amount. A town of
    // rectangles is a spreadsheet seen from above; the same four fills with the corners jogged is a
    // town. The jitter is per-corner rather than per-building because a uniformly-scaled rectangle
    // is still a rectangle.
    const corner = Array.from({ length: 4 }, (_, i) => ({
      x: (i === 0 || i === 3 ? -0.5 : 0.5) * w * (0.82 + rng.next() * 0.36),
      y: (i < 2 ? -0.5 : 0.5) * h * (0.82 + rng.next() * 0.36),
    }));
    buildings.push({
      x: at.x + nx * offset * side,
      y: at.y + ny * offset * side,
      w,
      h,
      corner,
      // How far it stands up, in the units `LEAN` is calibrated in. The shops are a terrace and
      // therefore all much of a height; the houses behind them are not.
      lift: rng.range(0.55, 1.15),
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

  // Ordinary houses behind the front, on a second, third and fourth row, so the town has depth — and
  // over a much wider span of size than they had, because a row of houses all within a tenth of each
  // other is a terrace, and a terrace behind a terrace is a housing estate.
  const houses = 22 + Math.floor(rng.range(0, 12));
  for (let i = 0; i < houses; i += 1) {
    const along = rng.range(townFrom - 0.05, townTo + 0.04);
    const row = 0.085 + Math.floor(rng.range(0, 4)) * 0.034 + rng.range(-0.012, 0.012);
    place(along, row, rng.range(0.012, 0.038), rng.range(0.013, 0.036), 'house',
      [ROOF_SLATE, ROOF_TILE, ROOF_LEAD][Math.floor(rng.range(0, 3))]);
  }

  // Outbuildings: barns and sheds out in the fields, well away from the town and turned whichever
  // way they like. Everything built was within a couple of hundred metres of the water and squared
  // up to it, which reads as a model village — the strays are what make it a place people spread out
  // across rather than one street seen from above.
  const strays = 5 + Math.floor(rng.range(0, 6));
  for (let i = 0; i < 200 && buildings.length < houses + 14 + strays; i += 1) {
    const bx = rng.next();
    const by = rng.next();
    if (nearestRiver(river, bx, by).distance < 0.1) continue;
    if (buildings.some((b) => Math.hypot(b.x - bx, b.y - by) < 0.09)) continue;
    const w = rng.range(0.014, 0.034);
    const h = rng.range(0.012, 0.03);
    const angle = rng.range(0, TAU);
    buildings.push({
      x: bx,
      y: by,
      w,
      h,
      corner: Array.from({ length: 4 }, (_, k) => ({
        x: (k === 0 || k === 3 ? -0.5 : 0.5) * w * (0.82 + rng.next() * 0.36),
        y: (k < 2 ? -0.5 : 0.5) * h * (0.82 + rng.next() * 0.36),
      })),
      lift: rng.range(0.4, 1.3),
      angle,
      kind: 'house',
      roof: [ROOF_SLATE, ROOF_TILE, ROOF_LEAD][Math.floor(rng.range(0, 3))],
    });
  }

  // Trees everywhere the town is not. Placement is rejection-sampled against the river and the
  // buildings, because a canopy sitting on a roof or floating on the water is the one mistake that
  // makes an overhead view stop reading as an overhead view.
  //
  // They are also **clustered into copses**. A rejection-sampled uniform scatter is uniform, and four
  // hundred evenly spread trees is a lawn with dots on it — what a wooded valley looks like from
  // above is thick stands with clearings between them. Two thirds of the trees are dropped near one
  // of a dozen copse centres and the rest are left scattered, which is what puts a wood in one place
  // and open ground in another.
  const copses = Array.from({ length: 12 }, () => ({
    x: rng.next(),
    y: rng.next(),
    r: rng.range(0.05, 0.16),
  }));
  const trees = [];
  for (let i = 0; i < 900 && trees.length < 420; i += 1) {
    let tx = rng.next();
    let ty = rng.next();
    if (rng.next() < 0.68) {
      const copse = copses[Math.floor(rng.range(0, copses.length))];
      const a = rng.range(0, TAU);
      // Square-rooted so the density does not pile up in the middle of every stand.
      const d = copse.r * Math.sqrt(rng.next());
      tx = copse.x + Math.cos(a) * d;
      ty = copse.y + Math.sin(a) * d;
      if (tx < 0 || tx > 1 || ty < 0 || ty > 1) continue;
    }
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
      lift: rng.range(0.22, 0.5),
      // How ragged this crown is, and which way it has grown. A canopy is not a circle and four
      // hundred circles is a polka dot.
      lumps: 4 + Math.floor(rng.range(0, 3)),
      sway: rng.range(0, TAU),
    });
  }

  // Parcels: closed, irregular, five-to-seven-sided fields. The lines above say *farmed*; a line is
  // an edge with nothing on either side of it, and what actually reads as agriculture from the air
  // is enclosed ground of slightly different tone, in shapes no two of which are alike.
  const parcels = [];
  const wanted = 11 + Math.floor(rng.range(0, 8));
  for (let i = 0; i < 60 && parcels.length < wanted; i += 1) {
    const cx = rng.next();
    const cy = rng.next();
    if (nearestRiver(river, cx, cy).distance < 0.09) continue;
    const sides = 5 + Math.floor(rng.range(0, 3));
    const spin = rng.range(0, TAU);
    const rx = rng.range(0.035, 0.19);
    const ry = rx * rng.range(0.55, 1.1);
    parcels.push({
      tone: Math.floor(rng.range(0, GRASS.length)),
      // Only about half of them catch a rim. Every parcel rimmed, at the count they run to now, is a
      // wireframe laid over the fields rather than a few edges picking up light.
      neon: rng.next() < 0.5 ? Math.floor(rng.range(0, NEON.length)) : -1,
      points: Array.from({ length: sides }, (_, k) => {
        const a = spin + (k / sides) * TAU + rng.range(-0.2, 0.2);
        const wobble = 0.72 + rng.next() * 0.5;
        return { x: cx + Math.cos(a) * rx * wobble, y: cy + Math.sin(a) * ry * wobble };
      }),
    });
  }

  // Rock, and scrub that is not a tree. Both are clusters of unequal lumps with no symmetry in them
  // at all, which is the point: they are the ground's irregularity, and everything else on it is
  // either a rectangle or a disc.
  const rocks = [];
  for (let i = 0; i < 160 && rocks.length < 30; i += 1) {
    const x = rng.next();
    const y = rng.next();
    const near = nearestRiver(river, x, y);
    // Rock likes a riverbank and a hillside, so it is allowed close to the water where a tree is not.
    if (near.distance > 0.2 && rng.next() < 0.6) continue;
    rocks.push({
      x,
      y,
      r: rng.range(0.003, 0.010),
      lumps: 2 + Math.floor(rng.range(0, 3)),
      tint: Math.floor(rng.range(0, ROCK.length)),
      lift: rng.range(0.15, 0.4),
    });
  }

  const scrub = [];
  for (let i = 0; i < 240 && scrub.length < 90; i += 1) {
    const x = rng.next();
    const y = rng.next();
    if (nearestRiver(river, x, y).distance < 0.05) continue;
    if (buildings.some((b) => Math.abs(b.x - x) < b.w && Math.abs(b.y - y) < b.h)) continue;
    scrub.push({
      x,
      y,
      r: rng.range(0.004, 0.011),
      tint: Math.floor(rng.range(0, SCRUB_LEAF.length)),
      spread: rng.range(0, TAU),
    });
  }

  // Reeds, in stands along the water. Short strokes leaning together, which is the one texture that
  // says a bank is soft rather than cut.
  const reeds = Array.from({ length: 34 }, () => ({
    along: rng.next(),
    side: rng.next() < 0.5 ? -1 : 1,
    count: 5 + Math.floor(rng.range(0, 7)),
    lean: rng.range(-0.5, 0.5),
    phase: rng.range(0, 20),
  }));

  return { river, buildings, trees, parcels, rocks, scrub, reeds, townFrom, townTo, side };
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
  drawReeds(ctx, W, H, S, t, ground);
  drawRoads(ctx, W, H, ground);
  // Rock and scrub go under the trees and the town: they are ground cover, and ground cover drawn
  // last is litter.
  drawRocks(ctx, W, H, S, ground.rocks);
  drawScrub(ctx, W, H, S, t, ground.scrub);
  drawTrees(ctx, W, H, S, ground.trees);
  drawBuildings(ctx, W, H, S, ground.buildings);
  // Neon last of everything on the ground, so a rim is never buried by the thing standing next to it.
  drawNeon(ctx, W, H, S, ground);
}

/** Rock: two or three unequal lumps, leaning the way everything else leans. */
function drawRocks(ctx, W, H, S, rocks) {
  const lump = (rock, cx, cy, scale) => {
    for (let i = 0; i < rock.lumps; i += 1) {
      const h = hash2(rock.x * 91 + i * 3.7, rock.y * 143 - i * 5.1);
      const a = hash2(rock.x * 37 - i * 8.3, rock.y * 59 + i * 1.7) * TAU;
      const d = rock.r * S * h * 0.6;
      const r = rock.r * S * scale * (0.5 + h * 0.7);
      ctx.moveTo(cx + Math.cos(a) * d + r, cy + Math.sin(a) * d);
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, TAU);
    }
  };

  ctx.fillStyle = CAST;
  ctx.beginPath();
  for (const rock of rocks) {
    lump(rock, leanX(rock.x * W, W, -rock.lift), leanY(rock.y * H, H, -rock.lift), 1);
  }
  ctx.fill();

  for (let i = 0; i < ROCK.length; i += 1) {
    ctx.fillStyle = ROCK[i];
    ctx.beginPath();
    for (const rock of rocks) {
      if (rock.tint !== i) continue;
      lump(rock, leanX(rock.x * W, W, rock.lift), leanY(rock.y * H, H, rock.lift), 1);
    }
    ctx.fill();
  }
}

/** Scrub: low bushes, drawn as a spray of short strokes rather than as a blob. */
function drawScrub(ctx, W, H, S, t, scrub) {
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, S * 0.0016);
  for (let i = 0; i < SCRUB_LEAF.length; i += 1) {
    ctx.strokeStyle = SCRUB_LEAF[i];
    ctx.beginPath();
    for (const s of scrub) {
      if (s.tint !== i) continue;
      const cx = s.x * W;
      const cy = s.y * H;
      const r = s.r * S;
      for (let k = 0; k < 5; k += 1) {
        const a = s.spread + k * 1.31 + noise2(s.x * 53 + k, t * 0.08) * 0.5;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r * (0.7 + hash2(s.x * 17 + k, s.y * 23) * 0.8),
          cy + Math.sin(a) * r * (0.7 + hash2(s.y * 19 + k, s.x * 29) * 0.8));
      }
    }
    ctx.stroke();
  }
}

/** Reeds: stands of them along the bank, leaning together and shifting on the wind. */
function drawReeds(ctx, W, H, S, t, ground) {
  ctx.strokeStyle = REED;
  ctx.lineWidth = Math.max(1, S * 0.0014);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const stand of ground.reeds) {
    const at = riverAt(ground.river, stand.along);
    const nx = Math.cos(at.angle + Math.PI / 2) * stand.side;
    const ny = Math.sin(at.angle + Math.PI / 2) * stand.side;
    // Just outside the water, where reeds live.
    const bx = (at.x + nx * at.width * 0.78) * W;
    const by = (at.y + ny * at.width * 0.78) * H;
    // One shared gust per stand, so a clump moves as a clump.
    const gust = noise2(stand.phase, t * 0.22) - 0.5;
    for (let i = 0; i < stand.count; i += 1) {
      const spread = (i / stand.count - 0.5) * at.width * 1.5;
      const rx = bx + Math.cos(at.angle) * spread * W;
      const ry = by + Math.sin(at.angle) * spread * H;
      const len = S * (0.006 + hash2(stand.phase + i, stand.along) * 0.009);
      const lean = stand.lean + gust * 0.7 + (hash2(stand.phase * 3 + i, 5) - 0.5) * 0.4;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.sin(lean) * len, ry - Math.cos(lean) * len);
    }
  }
  ctx.stroke();
}

/**
 * The neon rim.
 *
 * One pass, at the end, batched by colour — the roofs' edges, the parcels' boundaries, the road's
 * kerb and the water's edge. It is a *rim*, not an outline: thin, semi-transparent, and only ever on
 * the boundary of something that is already there, so it reads as an edge catching light rather than
 * as a border drawn round a shape. An opaque line at full width around every roof is a cartoon, and
 * the difference between the two is about thirty percent of alpha.
 */
function drawNeon(ctx, W, H, S, ground) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Parcels and roofs, alternating through the three neons so the town does not hum on one note.
  for (let n = 0; n < NEON.length; n += 1) {
    ctx.strokeStyle = NEON[n];
    ctx.lineWidth = Math.max(1, S * 0.0016);
    ctx.beginPath();
    for (const parcel of ground.parcels) {
      if (parcel.neon !== n) continue;
      parcel.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x * W, p.y * H);
        else ctx.lineTo(p.x * W, p.y * H);
      });
      ctx.closePath();
    }
    ground.buildings.forEach((b, i) => {
      if (i % NEON.length !== n) return;
      roofPath(ctx, b, W, H, b.lift);
    });
    ctx.stroke();
  }

  // The water's edge and the kerb: long, continuous, and fainter than the rest, because a rim that
  // runs the height of the frame at the strength of a roof's would be the loudest thing down there.
  ctx.strokeStyle = NEON_WATER;
  ctx.lineWidth = Math.max(1, S * 0.0022);
  ctx.beginPath();
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 90; i += 1) {
      const at = riverAt(ground.river, i / 90);
      const nx = Math.cos(at.angle + Math.PI / 2) * at.width * 0.62 * s;
      const ny = Math.sin(at.angle + Math.PI / 2) * at.width * 0.62 * s;
      if (i === 0) ctx.moveTo((at.x + nx) * W, (at.y + ny) * H);
      else ctx.lineTo((at.x + nx) * W, (at.y + ny) * H);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = NEON_ROAD;
  ctx.lineWidth = Math.max(1, S * 0.0014);
  ctx.beginPath();
  for (let i = 0; i <= 60; i += 1) {
    const u = lerp(ground.townFrom - 0.07, ground.townTo + 0.07, i / 60);
    const at = riverAt(ground.river, u);
    const nx = Math.cos(at.angle + Math.PI / 2) * 0.038 * ground.side;
    const ny = Math.sin(at.angle + Math.PI / 2) * 0.038 * ground.side;
    if (i === 0) ctx.moveTo((at.x + nx) * W, (at.y + ny) * H);
    else ctx.lineTo((at.x + nx) * W, (at.y + ny) * H);
  }
  ctx.stroke();
}

/** A building's four corners in pixels, at a given height. */
function footprint(b, W, H, lift) {
  const cos = Math.cos(b.angle);
  const sin = Math.sin(b.angle);
  return b.corner.map((c) => {
    const ox = c.x * W;
    const oy = c.y * H;
    const px = b.x * W + (ox * cos - oy * sin);
    const py = b.y * H + (ox * sin + oy * cos);
    return { x: leanX(px, W, lift), y: leanY(py, H, lift) };
  });
}

/** A building's footprint at a given height, appended to the open path. */
function roofPath(ctx, b, W, H, lift) {
  const cos = Math.cos(b.angle);
  const sin = Math.sin(b.angle);
  for (let i = 0; i < 4; i += 1) {
    const c = b.corner[i];
    // Rotate in *pixel* space. The corners are stored in normalised units whose x and y are scaled
    // by different numbers, so rotating them before the scale shears every building that is not
    // axis-aligned — on a wide viewport, badly.
    const ox = c.x * W;
    const oy = c.y * H;
    const px = b.x * W + (ox * cos - oy * sin);
    const py = b.y * H + (ox * sin + oy * cos);
    const x = leanX(px, W, lift);
    const y = leanY(py, H, lift);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
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

  // Parcels: enclosed ground at a slightly different tone, in irregular five-to-seven-sided shapes.
  // The hedge lines below say *farmed*, but a line is an edge with nothing either side of it, and
  // what actually reads as agriculture from the air is fields — no two of them alike.
  for (let i = 0; i < GRASS.length; i += 1) {
    let any = false;
    ctx.beginPath();
    for (const parcel of ground.parcels) {
      if (parcel.tone !== i) continue;
      parcel.points.forEach((p, k) => {
        if (k === 0) ctx.moveTo(p.x * W, p.y * H);
        else ctx.lineTo(p.x * W, p.y * H);
      });
      ctx.closePath();
      any = true;
    }
    if (!any) continue;
    ctx.fillStyle = GRASS[i];
    ctx.fill();
  }

  // Hedges, on the parcels' own boundaries.
  //
  // These used to be nine long straight lines ruled across the grass at arbitrary angles, on the
  // grounds that a hedge line is what tells you a field is farmed. It is — but a *straight* one,
  // bounding nothing, is a scratch on the picture, and once the ground had rocks and scrub and
  // reeds and irregular parcels on it, nine ruled lines were the only thing left in frame that
  // nothing in nature would have made. A hedge grows where a field ends, so that is where they are
  // now, and each one closes.
  ctx.strokeStyle = SCRUB;
  ctx.lineWidth = Math.max(1, Math.min(W, H) * 0.0032);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const parcel of ground.parcels) {
    parcel.points.forEach((p, k) => {
      if (k === 0) ctx.moveTo(p.x * W, p.y * H);
      else ctx.lineTo(p.x * W, p.y * H);
    });
    ctx.closePath();
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
  // A crown of four to seven unequal lumps on an ellipse rather than three on a circle, each one's
  // offset, radius and squash its own. Three equal lumps still average out to a disc at this size,
  // which is how four hundred trees became a polka dot the first time.
  const crown = (tree, cx, cy, scale) => {
    for (let i = 0; i < tree.lumps; i += 1) {
      const h = hash2(tree.x * 137 + i * 4.3, tree.y * 211 - i * 7.1);
      const k = hash2(tree.x * 53 - i * 9.7, tree.y * 71 + i * 2.9);
      const a = tree.sway + (i / tree.lumps) * TAU + (k - 0.5) * 1.4;
      const d = tree.r * S * (0.14 + h * 0.52);
      const r = tree.r * S * scale * (0.44 + h * 0.5);
      // Squashed along its own axis, so no lump is a circle either.
      const x = cx + Math.cos(a) * d * (0.8 + k * 0.6);
      const y = cy + Math.sin(a) * d * (0.7 + h * 0.5);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
  };

  // The shadow falls on the *opposite* side from the lean, which is what makes the lean read as
  // height rather than as everything having been nudged. One path for the lot.
  ctx.fillStyle = CAST;
  ctx.beginPath();
  for (const tree of trees) {
    crown(tree, leanX(tree.x * W, W, -tree.lift * 0.7), leanY(tree.y * H, H, -tree.lift * 0.7), 0.72);
  }
  ctx.fill();

  // Trunks: one stroke each from the foot to the crown, which is the whole 2.5D trick — you can see
  // the stem of the tree at the corner of the frame and none of the one under the lens.
  ctx.strokeStyle = TRUNK;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, S * 0.0016);
  ctx.beginPath();
  for (const tree of trees) {
    const bx = tree.x * W;
    const by = tree.y * H;
    ctx.moveTo(bx, by);
    ctx.lineTo(leanX(bx, W, tree.lift), leanY(by, H, tree.lift));
  }
  ctx.stroke();

  for (let i = 0; i < TREE.length; i += 1) {
    ctx.fillStyle = TREE[i];
    ctx.beginPath();
    for (const tree of trees) {
      if (tree.tint !== i) continue;
      crown(tree, leanX(tree.x * W, W, tree.lift), leanY(tree.y * H, H, tree.lift), 1);
    }
    ctx.fill();
  }

  // A highlight on the sunward side of some crowns.
  ctx.fillStyle = TREE_LIT;
  ctx.beginPath();
  for (const tree of trees) {
    if (!tree.lit) continue;
    const cx = leanX(tree.x * W, W, tree.lift) - tree.r * 0.28 * W;
    const cy = leanY(tree.y * H, H, tree.lift) - tree.r * 0.32 * H;
    crown(tree, cx, cy, 0.46);
  }
  ctx.fill();
}

/** Roofs, from above, each with the shadow that makes it a building rather than a rectangle. */
function drawBuildings(ctx, W, H, S, buildings) {
  // Everything a building carries on top of its roof — ridge, awning, parasols, tables — is drawn in
  // the building's own rotated frame, translated to where the *roof* ended up rather than to where
  // the building stands. Draw it at the footprint instead and the awnings slide off the shopfronts
  // the moment the town is anywhere but the middle of the frame.
  const liftedOriented = (b, w, h, fn) => {
    ctx.save();
    ctx.translate(leanX(b.x * w, w, b.lift), leanY(b.y * h, h, b.lift));
    ctx.rotate(b.angle);
    fn();
    ctx.restore();
  };

  // Cast shadows, thrown the opposite way from the lean, all in one path.
  ctx.fillStyle = CAST;
  ctx.beginPath();
  for (const b of buildings) roofPath(ctx, b, W, H, -b.lift * 0.75);
  ctx.fill();

  // The walls. Every building's four side faces go into **one path**, and the roofs are painted over
  // the top of them afterwards — which is not a trick, it is just what is true: the top leans away
  // from the centre of frame, so the faces on the far side end up underneath the roof polygon and
  // the ones on the near side end up outside it. Painter's order does the hidden-surface work for
  // free, and the whole town's walls cost one fill.
  ctx.fillStyle = WALL;
  ctx.beginPath();
  for (const b of buildings) {
    const base = footprint(b, W, H, 0);
    const top = footprint(b, W, H, b.lift);
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      ctx.moveTo(base[i].x, base[i].y);
      ctx.lineTo(base[j].x, base[j].y);
      ctx.lineTo(top[j].x, top[j].y);
      ctx.lineTo(top[i].x, top[i].y);
      ctx.closePath();
    }
  }
  ctx.fill();

  // Roofs. Each is its own fill because each has its own colour, which was true before the buildings
  // stood up and is still true now.
  for (const b of buildings) {
    ctx.fillStyle = b.roof;
    ctx.beginPath();
    roofPath(ctx, b, W, H, b.lift);
    ctx.fill();
  }

  for (const b of buildings) {
    liftedOriented(b, W, H, () => {
      const w = b.w * W;
      const h = b.h * H;

      // A ridge line down the middle of the roof: the single detail that reads as a pitched roof
      // from overhead, and it costs one rectangle. Inverted along with everything else, so the lit
      // ridge is now a dark one.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
      if (w > h) ctx.fillRect(-w / 2, -Math.max(1, h * 0.06), w, Math.max(1, h * 0.12));
      else ctx.fillRect(-Math.max(1, w * 0.06), -h / 2, Math.max(1, w * 0.12), h);

      if (b.kind === 'shop') {
        // The awning on the street side — twelve of these in a row down the front is what makes
        // twelve shops read as a parade rather than as more houses.
        ctx.fillStyle = b.awning;
        ctx.fillRect(-w / 2, h / 2, w, Math.max(1.5, h * 0.3));
        if (b.lamp) {
          ctx.fillStyle = 'rgba(3, 10, 32, 0.78)';
          ctx.fillRect(-w * 0.1, h / 2 + h * 0.34, Math.max(1.5, w * 0.2), Math.max(1.5, h * 0.16));
        }
      }

      if (b.kind === 'cafe') {
        // Parasols on the forecourt. Circles, from above, in a rough arc.
        ctx.fillStyle = '#03080f';
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
        ctx.fillStyle = 'rgba(2, 5, 12, 0.64)';
        ctx.fillRect(-w * 0.55, h / 2, w * 1.1, h * 0.5);
        ctx.fillStyle = '#8f7a4e';
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
