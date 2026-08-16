// The stable, the horses in it, and whatever is crossing the square today.
//
// Two populations with opposite jobs. The **horses** are the thing in the picture that is always
// there and never leaves: three of them under an open-fronted stable at the end of the row, standing
// the way animals stand — weight on three legs, head down, an ear or a tail moving and nothing else.
// The **critters** are the opposite, and the brief is precise about them: *rare but sometimes
// scurrying or crawling through*. Rare is the whole specification. Something that crosses the square
// every four seconds is a population; something that crosses it twice a minute is an event, and an
// event is worth waiting for.
//
// Both are drawn from bitmaps rather than from procedural shapes, because an animal is a silhouette
// you either recognise or you do not, and at eight pixels a leg there is no room to be approximate.

import { hash2 } from '../../effects/field.js';
import { wrap01 } from '../../lib/draw.js';
import { STREET } from './town.js';
import { bandOf, chunkIn, chunkOf, inBands, inkOf, strataAt } from './strata.js';
import { gustAt, windHere } from './wind.js';

/**
 * A horse, side on, as a 13×9 bitmap. Head low, because a horse at rest keeps it there.
 *
 * `2` is the body, `1` the mane and the tail, `0` the shadowed underside and the legs. Read as ramp
 * steps, so a horse is the same horse in every palette in the scene.
 */
const HORSE = [
  '.....22......',
  '....2222.....',
  '...1222222...',
  '..112222222..',
  '..1122222221.',
  '..0022222201.',
  '...00.00.00..',
  '...00.00.00..',
  '...00.00.00..',
];

/** A lizard, 9×3. The one that *scurries*: it stops, waits, and bolts. */
const LIZARD = ['.11..1.1.', '111111111', '.1..1.1..'];

/** A scorpion, 7×4. The one that *crawls*: it never stops and never hurries. */
const SCORPION = ['..1...1', '.111111', '1111111', '.1.1.1.'];

/** A jackrabbit, 7×6. Straight through, at speed, and gone. */
const RABBIT = ['.11....', '.11....', '.1111..', '1111111', '.11..11', '.1..1..'];

const CRITTERS = [
  { art: LIZARD, pace: 3.4, scurry: true, ground: 0.42 },
  { art: SCORPION, pace: 0.9, scurry: false, ground: 0.68 },
  { art: RABBIT, pace: 5.2, scurry: false, ground: 0.3 },
];

/** How often something crosses, in seconds. Twice a minute, near enough, and never two at once. */
const CROSSING = 31;

export function planBeasts(rng) {
  return {
    stable: {
      // Hard against one end of the row, so the street has a stop at one end and runs off at the
      // other. A stable in the middle would cut the town in half.
      at: rng.next() < 0.5 ? 0.03 : 0.72,
      wide: rng.range(0.24, 0.3),
      seed: rng.range(0, 40),
    },
    horses: Array.from({ length: 3 }, (_, i) => ({
      slot: i,
      // Which way it is facing, how far into its stall, and its own slow clock for the ear and tail.
      flip: rng.next() < 0.45,
      into: rng.range(0.1, 0.5),
      rate: rng.range(0.4, 0.9),
      phase: rng.range(0, 20),
      // How often it shifts its weight. Minutes, not seconds.
      shift: rng.range(19, 37),
    })),
    seed: rng.range(0, 70),
  };
}

/** Stamp a bitmap on a grid, appending to the open path. Only cells matching `step` are drawn. */
function stamp(ctx, art, x, y, px, step, flip) {
  const rows = art.length;
  const cols = art[0].length;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (art[r][flip ? cols - 1 - c : c] !== step) continue;
      ctx.rect(x + c * px, y + r * px, px, px);
    }
  }
}

export function drawStable(ctx, W, H, t, plan, base, tune) {
  const gust = gustAt(t);
  const streetY = H * STREET;
  const { stable } = plan;
  const x = stable.at * W;
  const w = stable.wide * W;
  const roofY = streetY - H * 0.3 * tune.rise;

  // The shell goes through the bands like every other building, because a stable drawn as one flat
  // object is a slab: it is a third of the width of the frame and four bands tall, and committing it
  // to a single grid and a single colour puts the largest untouched rectangle in the picture right
  // where the strata are supposed to be most visible. Only the animals commit.
  inBands(H, t, plan.strata, gust, base, (strata, top, bottom, px) => {
    if (top > streetY || bottom < roofY - H * 0.06) return;
    // The dark of the open front. Step 0 everywhere, so however the band is coloured the stalls read
    // as the one place in the frame that the noon light does not reach.
    ctx.fillStyle = inkOf(strata, 0);
    ctx.beginPath();
    if (chunkIn(ctx, x, roofY, w, streetY - roofY, top, bottom, px)) ctx.fill();

    ctx.fillStyle = inkOf(strata, 2);
    ctx.beginPath();
    let drew = chunkIn(ctx, x, roofY, w, Math.max(px, H * 0.022), top, bottom, px);
    for (let i = 0; i <= 3; i += 1) {
      drew = chunkIn(ctx, x + (w * i) / 3, roofY, Math.max(px, w * 0.018), streetY - roofY, top, bottom, px) || drew;
    }
    // A hayloft opening in the gable, which is the detail that says stable rather than shed.
    drew = chunkIn(ctx, x + w * 0.42, roofY - H * 0.05, w * 0.16, H * 0.05, top, bottom, px) || drew;
    if (drew) ctx.fill();
  });

  // The horses, on the band their feet are in and drawn whole. An animal cut across a resolution
  // boundary stops being an animal — the silhouette is the entire content of a nine-row sprite — so
  // this is the one thing in the scene that refuses the strata rather than riding them.
  const n = bandOf((streetY - H * 0.02) / H, t, plan.strata);
  const strata = strataAt(n, t, plan.strata);
  // Capped at three chunks. A sprite drawn on the band's own grid takes that grid as its *cell*, so
  // at the coarsest stratum a nine-row horse would be nine coarse chunks tall — most of the frame —
  // and the stable would be full of pale slabs. The animals still change resolution with the band,
  // just not by a factor of eight.
  const px = Math.min(chunkOf(base, strata, gust, plan.strata.spread ?? 1), base * 3);
  const snap = (v) => Math.round(v / px) * px;
  const scale = Math.max(px, snap((H * 0.115 * tune.rise) / HORSE.length));

  for (const step of ['0', '1', '2']) {
    ctx.fillStyle = inkOf(strata, step === '0' ? 1 : step === '1' ? 3 : 4);
    ctx.beginPath();
    for (const horse of plan.horses) {
      const stallX = x + w * (0.06 + horse.slot * 0.31);
      // Weight shifted from one side to the other, on a clock measured in tens of seconds. It is one
      // chunk of movement and it is the only thing that stops three horses looking like a decal.
      const lean = Math.round(Math.sin((t / horse.shift) * 6.28 + horse.phase)) * scale;
      const bob = Math.round(Math.sin(t * horse.rate + horse.phase) * 0.6) * scale;
      const hx = snap(stallX + horse.into * w * 0.06 + lean);
      const hy = snap(streetY - HORSE.length * scale + bob);
      stamp(ctx, HORSE, hx, hy, scale, step, horse.flip);
      // The tail, which is the one part of a resting horse that is always moving.
      if (step === '1') {
        const swish = Math.round(Math.sin(t * horse.rate * 2.3 + horse.phase) * 1.4);
        const tailX = hx + (horse.flip ? HORSE[0].length * scale : -scale);
        ctx.rect(tailX, hy + (3 + Math.abs(swish)) * scale, scale, scale * 2);
      }
    }
    ctx.fill();
  }
}

/**
 * Whatever is crossing right now, or nothing.
 *
 * One at a time, on an epoch: the crossing index is `floor(t / CROSSING)` and everything about that
 * crossing — which animal, which way, how high up the square, whether it happens at all — is hashed
 * off it. Nothing is remembered and nothing overlaps, which is what makes a crossing an event rather
 * than a stream, and it is computable at any `t` in any order.
 */
export function drawCritter(ctx, W, H, t, plan, base, tune) {
  const clock = t / (CROSSING / tune.often);
  const n = Math.floor(clock);
  const into = clock - n;
  const key = n * 3.7 + plan.seed;
  // A third of the slots are empty, so the gaps are uneven: crossings on a strict timetable read as
  // a mechanism, and the whole point of these is that you are not expecting one.
  if (hash2(key, 1.3) < 0.34) return;

  const critter = CRITTERS[Math.floor(hash2(key, 5.9) * CRITTERS.length) % CRITTERS.length];
  const flip = hash2(key, 7.1) < 0.5;
  const deep = 0.18 + hash2(key, 11.3) * 0.7;
  const streetY = H * STREET;
  const y = streetY + (H - streetY) * deep;

  // How far across it is. A scurrying thing goes in bursts with stops in between; a crawling thing
  // goes at one speed and never looks up. Both are the same function of `into` with a different
  // exponent on the stop-and-start term, which is the cheapest way to have two gaits.
  const dashes = critter.scurry ? Math.max(0, Math.sin(into * 17) ** 3) * 0.55 + into * 0.45 : into;
  const along = flip ? 1 - dashes : dashes;
  const x = (-0.12 + along * 1.24) * W;
  if (x < -W * 0.2 || x > W * 1.2) return;

  const band = bandOf(y / H, t, plan.strata);
  const strata = strataAt(band, t, plan.strata);
  const px = chunkOf(base, strata, gustAt(t));
  const scale = Math.max(px, Math.round((H * 0.02 * (0.6 + deep) * tune.growth) / critter.art.length / px) * px);
  // A scurrying thing bobs as it goes; a crawler does not.
  const bob = critter.scurry ? Math.round(Math.abs(Math.sin(into * 90)) * 1.2) * scale : 0;

  ctx.fillStyle = inkOf(strata, 1);
  ctx.beginPath();
  stamp(
    ctx,
    critter.art,
    Math.round(x / px) * px,
    Math.round((y - critter.art.length * scale - bob) / px) * px,
    scale,
    '1',
    flip,
  );
  ctx.fill();
}

/** How much the air is moving where an animal is standing, for anything that flinches at it. */
export const feltBy = (x, deep, t) => windHere(x, STREET + deep * 0.3, t);
