// The spirit hands, their workshops, and the wood they are cutting.
//
// A hand is not a shape problem, it is a **size** problem, and every wrong answer starts by getting
// that backwards. At this scene's chunk size a hand drawn at the scale of a real hand is five squares
// across, and five squares is a mitten — you cannot draw a thumb, let alone a grip. So these are
// drawn at the size of the *thing they are carrying* rather than at the size of a hand, which is a
// lie the eye accepts instantly because it has no other hand in frame to compare against. What sells
// it is the silhouette having a wrist end and a finger end, and a gap where the thumb closes.
//
// **Disembodied** is done by subtraction. No arm, no shoulder, nothing it could be attached to — and
// a short trail of separating chunks behind the wrist that thins to nothing, so the eye reads
// "coming out of the air" rather than "cropped by something". An arm that faded out would be a
// drawing with a soft edge, and there is not one soft edge in this scene.
//
// The workshops are silhouettes with a single hot chunk in them, and that is not a saving. The band
// between the horizon and the bottom of the frame is nine background chunks deep, and a shed drawn
// with a structure, a roof and a lit doorway in nine chunks is a speckle. A dark shape with one
// ember in it reads as a forge from across the room, which is the distance this is being looked at.

import { clamp, rgba, wrap01 } from '../../lib/draw.js';
import { hash2 } from '../../effects/field.js';
import { bayerOn, chunk } from '../../effects/pixel.js';
import { backPixel, GROUND } from './layout.js';
import { GOLD, JADE, LAPIS, SPIN } from './palette.js';

/**
 * The three crafts, and where they stand along the horizon.
 *
 * Three, not five. Every one of them is a dark lump with a spark in it at this size, so a fourth and
 * a fifth add count without adding information — and the horizon band has a forest and everything
 * that lands to hold as well.
 */
const SHOPS = [
  { at: 0.12, kind: 'mill', beat: 1.7 },
  { at: 0.72, kind: 'kiln', beat: 1.1 },
  { at: 0.87, kind: 'glass', beat: 2.3 },
];

export function planHands(rng) {
  return {
    seed: rng.range(0, 90),
    // Two pairs. Four large hands read as ceaseless labour; ten small ones read as a swarm, and at
    // this size ten of them would also be a swarm of paddles.
    hands: Array.from({ length: 7 }, (_, i) => ({
      key: i,
      shop: i % SHOPS.length,
      // Staggered on one fixed circuit each, so the traffic never synchronises and nothing queues.
      period: 11 + rng.next() * 9,
      phase: rng.next(),
      storey: Math.floor(rng.range(0, 6)),
      lean: rng.range(-0.4, 0.4),
    })),
    trees: Array.from({ length: 34 }, (_, i) => ({
      at: (i + 0.5) / 34 + rng.range(-0.03, 0.03),
      h: rng.range(0.6, 1.5),
      lean: rng.range(-0.22, 0.22),
      // Two bands. The far one sits a chunk lower and a step darker, which is the entire depth cue a
      // treeline needs and costs one comparison.
      depth: rng.next(),
      // One tree is coming down at a time, on its own long clock. A forest where nothing ever falls
      // is scenery; one falling tree makes the whole treeline a source of timber.
      fell: rng.range(0, 1),
    })),
  };
}

/** The forest and the workshops: everything standing still on the far side of the ground. */
export function drawWorks(ctx, W, H, t, plan, px) {
  const bpx = backPixel(px);
  const horizonY = Math.round((H * GROUND) / bpx) * bpx;
  const mass = [];
  const canopy = [];
  const canopyFar = [];
  const crown = [];
  const ember = [];

  // The forest: conifers in tiers, in two depth bands.
  //
  // A tree at this size is not a trunk with a blob on it — that is a lollipop, and eighteen of them
  // in a row is a comb. What reads as a conifer is the **taper in steps**: a stack of three or four
  // tiers, each narrower than the one below and each with its own lit top edge and shaded underside.
  // It is the pagoda's own trick, which is not a coincidence — a pagoda is a stylised tree.
  //
  // And they are green. The forest is the other half of the scene's complement: jade against the
  // storm's rose, so the land reads as a living place the temple is standing in rather than as more
  // weather. The far band is a step darker and drawn a chunk lower, which is all the depth a
  // treeline needs.
  for (const tree of plan.trees) {
    // Clear of the temple, so the building stands in a clearing rather than in a hedge.
    if (Math.abs(tree.at - 0.33) < 0.1) continue;
    const x = Math.round((tree.at * W) / bpx) * bpx;
    const far = tree.depth < 0.5;
    const foot = horizonY - (far ? bpx : 0);
    const h = Math.max(4, Math.round((tree.h * H * (far ? 0.055 : 0.085)) / bpx));
    // One is always coming down: it leans further and further, then it is a stump, then it has grown
    // back. Pure in `t`, like everything else here — and it is what makes the treeline a source of
    // timber rather than scenery.
    const u = wrap01(t / 23 + tree.fell);
    const falling = u > 0.86 ? (u - 0.86) / 0.14 : 0;
    const lean = (tree.lean + falling * 3.2) * h;
    const tiers = Math.max(2, Math.round(h / 2.2));

    for (let r = 0; r < h; r += 1) {
      const shift = Math.round((lean * r) / h) * bpx;
      const up = r / h;
      // The trunk is the bottom fifth and one chunk wide; everything above it is canopy, and the
      // canopy's width steps *down* in tiers rather than tapering smoothly — the step is the read.
      if (up < 0.22) {
        mass.push(x + shift, foot - (r + 1) * bpx, bpx, bpx);
        continue;
      }
      const tier = Math.floor((up - 0.22) / (0.78 / tiers));
      const wide = Math.max(1, tiers - tier);
      const bx = x + shift - Math.floor(wide / 2) * bpx;
      const into = far ? canopyFar : canopy;
      into.push(bx, foot - (r + 1) * bpx, wide * bpx, bpx);
      // The lit crown of each tier: the top chunk of a tier catches what light there is.
      if (tier !== Math.floor((up - 0.22 - 1 / h) / (0.78 / tiers)) && !far) {
        crown.push(bx, foot - (r + 1) * bpx, wide * bpx, bpx);
      }
    }
  }

  // The workshops. A shed with a pitched roof, a lit mouth, and a chimney — and each craft doing a
  // visibly different thing, because three identical lumps with sparks over them is one workshop
  // drawn three times.
  for (const shop of SHOPS) {
    const x = Math.round((shop.at * W) / bpx) * bpx;
    mass.push(x - bpx * 3, horizonY - bpx * 3, bpx * 6, bpx * 3);
    // A pitched roof, stepped, so a shed is not a box.
    for (let r = 0; r < 2; r += 1) {
      mass.push(x - bpx * (4 - r), horizonY - bpx * (4 + r), bpx * (8 - r * 2), bpx);
    }
    // The chimney, and what is coming out of it.
    mass.push(x + bpx * 2, horizonY - bpx * 6, bpx, bpx * 2);

    // The mouth of the forge, always lit, breathing on this craft's own clock: a kiln glows steadily,
    // a smelter pulses hard, a glass furnace flares. Same two chunks, three different rhythms.
    const heat = shop.kind === 'kiln'
      ? 0.72 + 0.14 * Math.sin(t * shop.beat)
      : shop.kind === 'glass'
        ? 0.5 + 0.5 * Math.abs(Math.sin(t * shop.beat * 0.7)) ** 3
        : 0.45 + 0.55 * Math.max(0, Math.sin(t * shop.beat));
    ember.push(x - bpx, horizonY - bpx * 2, heat);
    ember.push(x, horizonY - bpx * 2, heat * 0.8);

    // ...and what the craft throws off. The smelter showers sparks, the kiln breathes smoke, the
    // glass bench sends up one slow bright gather at a time.
    const jets = shop.kind === 'mill' ? 5 : shop.kind === 'kiln' ? 3 : 2;
    for (let s = 0; s < jets; s += 1) {
      const rate = shop.kind === 'glass' ? 0.22 : 0.4 + s * 0.13;
      const u = wrap01(t * rate + shop.at * 7 + s * 0.31);
      if (u > 0.62) continue;
      const spread = shop.kind === 'mill' ? 5 : 2;
      ember.push(
        x + (hash2(s, Math.floor(t * rate + shop.at * 7)) - 0.5) * bpx * spread,
        horizonY - bpx * 6 - u * bpx * 6,
        (1 - u / 0.62) * (shop.kind === 'kiln' ? 0.35 : 1),
      );
    }
  }

  // Back to front: the far canopy, the near canopy, its lit crowns, then the built things in front
  // of all of it, then the fires.
  for (const [cells, colour] of [[canopyFar, JADE[6]], [canopy, JADE[5]], [crown, JADE[4]], [mass, LAPIS[7]]]) {
    if (!cells.length) continue;
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 4) chunk(ctx, cells[i], cells[i + 1], cells[i + 2], cells[i + 3], bpx);
    ctx.fill();
  }

  // Three heats. Gold, because fire is the one thing on the ground that is neither storm nor forest,
  // and because a hearth in the storm's own ramp is a piece of storm that has fallen over.
  for (const [colour, lo, hi] of [[GOLD[0], 0.75, 2], [GOLD[1], 0.4, 0.75], [GOLD[2], 0.12, 0.4]]) {
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < ember.length; i += 3) {
      if (ember[i + 2] < lo || ember[i + 2] >= hi) continue;
      chunk(ctx, ember[i], ember[i + 1], bpx, bpx, bpx);
    }
    ctx.fill();
  }
}

/**
 * A hand, as a bitmap.
 *
 * Everything before this was a palm rectangle with chunks stuck on it, and it read as a mitten
 * because a mitten is exactly what it was. A hand needs four things at any size — a **palm** with
 * mass, **fingers that are separate**, a **thumb set off across a gap**, and a **wrist narrower than
 * both** — and none of them survive being improvised per-hand in code. Authored as a grid they are
 * simply there, and the two poses can differ in the one way that matters: open and reaching, or
 * closed around something.
 *
 * `#` is the body, `+` the edge that catches light, `.` nothing.
 */
const POSE = {
  open: [
    '.+.+.+',
    '+#+#+#',
    '.####+',
    '+#####',
    '.####.',
    '..##..',
    '..#...',
  ],
  grip: [
    '......',
    '.+++..',
    '.####+',
    '+#####',
    '.####.',
    '..##..',
    '..#...',
  ],
};

/**
 * Stamp a pose — and this is where the hand stops being a hand and becomes a *spirit*.
 *
 * The trick is **ordered dither as translucency**. Every chunk is put through the same Bayer matrix
 * the sky's ramp uses, at a density that falls off from the middle of the palm outward: the core is
 * solid, the fingers are half there, and the wrist is barely there at all — so the picture behind it
 * shows through the gaps and the thing reads as not-quite-present. It is how a 16-bit machine drew a
 * ghost, for the same reason we are doing it: there is no alpha to be had, and a flat silhouette in
 * a pale colour is a *pale hand*, not a spectral one.
 *
 * Keyed on the sprite's own grid rather than on screen position, so the dither pattern travels with
 * the hand instead of the hand sliding across a fixed screen-door — which would read as a hole cut
 * in the picture that a hand happens to be behind.
 */
function stampHand(body, edge, aura, pose, x, y, px, flip) {
  const rows = POSE[pose];
  const midC = (rows[0].length - 1) / 2;
  const midR = 2.5;
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      const ch = rows[r][flip ? rows[r].length - 1 - c : c];
      // Solid at the palm, thinning to about a third out at the fingertips and the wrist.
      const away = Math.hypot((c - midC) / midC, (r - midR) / 3.4);
      const density = clamp(1.12 - away * 0.62, 0.28, 1);
      if (ch === '.') {
        // ...and the aura is the same shape one ring further out, at the density the silhouette has
        // just run out of. A spirit with a hard edge is a sticker.
        if (away > 0.8 && away < 1.25 && bayerOn(c, r, 0.34)) aura.push(x + c * px, y + r * px, px, px);
        continue;
      }
      if (!bayerOn(c, r, density)) continue;
      (ch === '+' ? edge : body).push(x + c * px, y + r * px, px, px);
    }
  }
}

/**
 * The hands themselves, on their circuits.
 *
 * Each runs one loop with four acts: **work** at its own craft, **carry** the piece up to the
 * temple, **fix** it into the building, and come back empty. A circuit rather than a queue, because
 * a queue is state and there is none to be had — and because ceaseless labour is a thing that has
 * always been going on, which is what a loop with no start looks like.
 *
 * The act is what makes the crafts different. A hand at the sawmill drives a blade back and forth and
 * throws sawdust; at the kiln it works tongs in the fire with a tile glowing in their mouth; at the
 * glass bench it turns a pipe with a gather on the end of it, slowly, because glass is slow. Same
 * sprite, same circuit, three unmistakably different jobs — and all of it a pure function of `t`.
 */
export function drawHands(ctx, W, H, t, plan, px, places) {
  const groundY = H * GROUND;
  const body = [];
  const edge = [];
  const aura = [];
  const wisp = [];
  const tool = [];
  const hot = [];

  for (const hand of plan.hands) {
    const shop = SHOPS[hand.shop];
    const u = wrap01(t / hand.period + hand.phase);
    const site = places[Math.min(places.length - 1, hand.storey * 3 + 2)];
    if (!site) continue;

    const bench = { x: shop.at * W, y: groundY - px * 7 };
    const stroke = Math.sin(t * shop.beat * 2.2 + hand.key * 1.7);

    let x;
    let y;
    let pose = 'open';
    let flip = false;

    if (u < 0.34) {
      // ---- working. The hand holds station and the *tool* does the travelling. ------------------
      const swing = stroke * px * 2.5;
      x = bench.x + swing;
      y = bench.y + Math.abs(stroke) * px;
      pose = 'grip';
      flip = stroke < 0;

      if (shop.kind === 'mill') {
        // A saw, drawn along the stroke with teeth on its underside, and dust off the far end.
        for (let i = 0; i < 7; i += 1) {
          tool.push(x + px * (i - 3) + swing, y + px * (2 + (i % 2) * 0.5), px, px * 0.6);
        }
        if (Math.abs(stroke) > 0.7) hot.push(x + swing * 2, y + px * 3, 0.2);
      } else if (shop.kind === 'kiln') {
        // Tongs, holding a tile in the mouth of the fire. The tile is the hot thing, not the hand.
        tool.push(x + px, y + px * 2, px * 3, px);
        hot.push(x + px * 3.5, y + px * 2, 0.55 + 0.45 * Math.abs(stroke));
      } else {
        // A blowpipe, turning, with the gather glowing on the end.
        const turn = Math.sin(t * 0.9 + hand.key);
        tool.push(x + px, y + px * 2, px * 4, px * 0.7);
        hot.push(x + px * 5, y + px * 2 - turn * px, 0.9);
      }
    } else if (u < 0.62) {
      // ---- carrying, up and out to the building --------------------------------------------------
      const leg = (u - 0.34) / 0.28;
      x = bench.x + (site.x - bench.x) * leg;
      y = bench.y + (site.y - bench.y) * leg - Math.sin(leg * Math.PI) * H * 0.1;
      pose = 'grip';
      flip = site.x < bench.x;
      tool.push(x + (flip ? -px * 3 : px * 5), y + px * 2, px * 3, px);
    } else if (u < 0.74) {
      // ---- fixing. It hovers at the bay and taps, and the taps are what mending looks like. ------
      const tap = Math.sin(((u - 0.62) / 0.12) * Math.PI * 7);
      x = site.x + px * 2;
      y = site.y + tap * px * 1.5;
      if (tap > 0.6) hot.push(x + px, y + px * 3, 0.45);
    } else {
      // ---- and back, empty. A hand returning with nothing is what tells you the one going up is
      // carrying something.
      const leg = (u - 0.74) / 0.26;
      x = site.x + (bench.x - site.x) * leg;
      y = site.y + (bench.y - site.y) * leg - Math.sin(leg * Math.PI) * H * 0.06;
      flip = bench.x < site.x;
    }

    stampHand(body, edge, aura, pose, x, y, px, flip);
    // The wrist, coming apart into a tail. No arm, nothing it could be attached to — disembodied is
    // done by subtraction. It is longer than it was and it *drifts*, each chunk further back lagging
    // further behind the hand's own travel, so the tail streams rather than hanging.
    for (let w = 1; w <= 7; w += 1) {
      if (hash2(hand.key * 3.3 + w, Math.floor(t * 4)) < w * 0.11) continue;
      const sway = Math.sin(t * 1.9 + hand.key * 2.2 - w * 0.7) * px * w * 0.28;
      wisp.push(x + px * 2 + sway - (flip ? -px : px) * w * 0.16, y + px * (6 + w * 1.1), px, px);
    }
  }

  // A spirit is the one thing in this frame lit by nothing, so it does not get the top of the ramp:
  // the two hottest steps belong to the storm's contact core and to lightning, and seven hands
  // wearing them would take the hot end by sheer count.
  // Spectral blue-white, and deliberately neither of the scene's two subjects: not the storm's rose
  // and not the building's jade or gold. A spirit lit by nothing has to be its own colour or it reads
  // as a chip off whichever thing it is standing in front of.
  for (const [cells, colour] of [[aura, LAPIS[2]], [wisp, LAPIS[1]], [tool, LAPIS[3]], [body, LAPIS[0]], [edge, SPIN[0]]]) {
    if (!cells.length) continue;
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 4) chunk(ctx, cells[i], cells[i + 1], cells[i + 2], cells[i + 3], px);
    ctx.fill();
  }

  // Whatever is glowing in their hands — hot metal, a gather of glass, a fired tile.
  for (const [colour, lo, hi] of [[GOLD[0], 0.7, 2], [GOLD[1], 0.4, 0.7], [GOLD[2], 0, 0.4]]) {
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < hot.length; i += 3) {
      if (hot[i + 2] < lo || hot[i + 2] >= hi) continue;
      chunk(ctx, hot[i], hot[i + 1], px, px, px);
    }
    ctx.fill();
  }
}
