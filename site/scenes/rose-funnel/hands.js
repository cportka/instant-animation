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
import { chunk } from '../../effects/pixel.js';
import { backPixel, GROUND } from './layout.js';
import { SPIN } from './palette.js';

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
    hands: Array.from({ length: 4 }, (_, i) => ({
      key: i,
      shop: i % SHOPS.length,
      // Staggered on one fixed circuit each, so the traffic never synchronises and nothing queues.
      period: 9 + rng.next() * 7,
      phase: rng.next(),
      storey: Math.floor(rng.range(0, 6)),
      lean: rng.range(-0.4, 0.4),
    })),
    trees: Array.from({ length: 18 }, (_, i) => ({
      at: (i + 0.5) / 18 + rng.range(-0.02, 0.02),
      h: rng.range(0.6, 1.4),
      lean: rng.range(-0.3, 0.3),
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
  const ember = [];

  // The treeline. Three chunks of trunk and a blob of canopy — at this size a tree is a texture with
  // a stem, and anything more is invisible from the first row back.
  for (const tree of plan.trees) {
    // Clear of the temple, so the building stands in a clearing rather than in a hedge.
    if (Math.abs(tree.at - 0.33) < 0.09) continue;
    const x = Math.round((tree.at * W) / bpx) * bpx;
    const h = Math.max(3, Math.round((tree.h * H * 0.062) / bpx));
    // ...and one is always coming down: it leans further and further, then it is a stump, then a new
    // one has grown. Pure in `t`, like everything else here.
    const u = wrap01(t / 23 + tree.fell);
    const falling = u > 0.82 ? (u - 0.82) / 0.18 : 0;
    const lean = Math.round((tree.lean + falling * 2.6) * h);
    for (let r = 0; r < h; r += 1) {
      const shift = Math.round((lean * r) / h) * bpx;
      // Trunk for the lower half, canopy above it — at three chunks a tree is a stem with a
      // blob on it, and the blob has to be at least twice the stem or the whole thing is a post.
      const wide = r > h - 3 ? 3 : 1;
      mass.push(x + shift - (wide - 1) * bpx * 0.5, horizonY - (r + 1) * bpx, wide * bpx, bpx);
    }
  }

  // The workshops. A shed and a hearth: one dark lump, one hot chunk that breathes on its own beat.
  for (const shop of SHOPS) {
    const x = Math.round((shop.at * W) / bpx) * bpx;
    mass.push(x - bpx * 3, horizonY - bpx * 2, bpx * 6, bpx * 2);
    mass.push(x - bpx * 4, horizonY - bpx * 3, bpx * 8, bpx);
    // The fire in it. A kiln glows steadily, a smelter pulses, a glass furnace flares — same chunk,
    // different clock, and that is the whole difference between three crafts at this size.
    const heat = 0.55 + 0.45 * Math.sin(t * shop.beat + shop.at * 30);
    ember.push(x - bpx * 0.5, horizonY - bpx, heat);
    // Sparks off the mill and the smelter, rising and gone.
    for (let s = 0; s < 3; s += 1) {
      const u = wrap01(t * (0.4 + s * 0.13) + shop.at * 7 + s * 0.31);
      if (u > 0.5) continue;
      ember.push(x + (hash2(s, Math.floor(t * (0.4 + s * 0.13) + shop.at * 7)) - 0.5) * bpx * 4,
        horizonY - bpx * 3 - u * bpx * 5, 1 - u * 2);
    }
  }

  ctx.fillStyle = rgba(SPIN[6], 1);
  ctx.beginPath();
  for (let i = 0; i < mass.length; i += 4) chunk(ctx, mass[i], mass[i + 1], mass[i + 2], mass[i + 3], bpx);
  ctx.fill();

  // Two heats, two fills — the hearths are the only warm thing on the ground and they have to sit
  // clearly below the skirt's contact core, which owns the top of the ramp.
  for (const [step, lo, hi] of [[2, 0.62, 2], [3, 0, 0.62]]) {
    ctx.fillStyle = rgba(SPIN[step], 1);
    ctx.beginPath();
    for (let i = 0; i < ember.length; i += 3) {
      if (ember[i + 2] < lo || ember[i + 2] >= hi) continue;
      chunk(ctx, ember[i], ember[i + 1], bpx, bpx, bpx);
    }
    ctx.fill();
  }
}

/**
 * The hands themselves, on their circuits.
 *
 * Each runs one fixed loop: out to its workshop, and back up the building to the storey it is
 * mending, carrying whatever it has just made. A circuit rather than a queue, because a queue is
 * state and there is none to be had — and because ceaseless labour is a thing that has always been
 * going on, which is exactly what a loop with no start looks like.
 */
export function drawHands(ctx, W, H, t, plan, px, places) {
  const groundY = H * GROUND;
  const mass = [];
  const lit = [];
  const cargo = [];

  for (const hand of plan.hands) {
    const shop = SHOPS[hand.shop];
    const u = wrap01(t / hand.period + hand.phase);
    const site = places[Math.min(places.length - 1, hand.storey * 3 + 2)];
    if (!site) continue;

    const from = { x: shop.at * W, y: groundY - px * 3 };
    const to = { x: site.x, y: site.y };
    // Out and back on one path, with the carry on the outward leg. `1 - |2u - 1|` is a triangle
    // wave: it goes, it arrives, it returns, and it never jumps at the wrap because both ends are
    // the same point.
    const leg = 1 - Math.abs(2 * u - 1);
    const x = from.x + (to.x - from.x) * leg;
    // Lifted on an arc, so it flies rather than slides. Nothing in this scene walks.
    const y = from.y + (to.y - from.y) * leg - Math.sin(leg * Math.PI) * H * 0.09;
    const carrying = u < 0.5;

    // The hand: a palm, two fingers, a thumb, and a wrist that comes apart behind it. Nine chunks,
    // and the gap between thumb and fingers is the one that makes it a hand and not a paddle.
    const tilt = Math.sin(t * 1.6 + hand.key * 2.1) * 0.5 + hand.lean;
    const d = Math.round(tilt) * px;
    mass.push(x - px * 1.5, y, px * 3, px * 3); // palm
    mass.push(x - px * 1.5 + d, y - px, px * 2, px); // fingers
    mass.push(x + px * 0.5 + d, y - px * 2, px, px * 2); // the long finger, further forward
    mass.push(x + px * 1.5, y + px, px, px * 2); // thumb, set off the palm by a gap
    // The wrist, coming apart. Three chunks that thin to nothing — no arm, nothing it is attached to.
    for (let w = 1; w <= 3; w += 1) {
      if (hash2(hand.key * 3.3 + w, Math.floor(t * 6)) < w * 0.28) continue;
      lit.push(x - px * 0.5 - d * w * 0.4, y + px * (2 + w));
    }

    // ...and what it has made, on the way up only. A hand going back empty is what tells you the
    // one going up is carrying something.
    if (carrying) cargo.push(x - px * 2, y - px * 4, px * 4, px);
  }

  ctx.fillStyle = rgba(SPIN[2], 1);
  ctx.beginPath();
  for (let i = 0; i < mass.length; i += 4) chunk(ctx, mass[i], mass[i + 1], mass[i + 2], mass[i + 3], px);
  ctx.fill();

  // The wisp is a step down from the hand, not up: a spirit is the thing in this frame lit by
  // nothing, and the two hottest steps belong to the storm's contact core and to lightning.
  ctx.fillStyle = rgba(SPIN[4], 1);
  ctx.beginPath();
  for (let i = 0; i < lit.length; i += 2) chunk(ctx, lit[i], lit[i + 1], px, px, px);
  ctx.fill();

  ctx.fillStyle = rgba(SPIN[clamp(4, 0, 6)], 1);
  ctx.beginPath();
  for (let i = 0; i < cargo.length; i += 4) chunk(ctx, cargo[i], cargo[i + 1], cargo[i + 2], cargo[i + 3], px);
  ctx.fill();
}
