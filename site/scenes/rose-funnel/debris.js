// What comes off the temple, and what happens to it.
//
// **Value is already spoken for, so material has to be carried by everything else.** The seven steps
// of the ramp are not a set of colours in this scene, they are a depth cue: the funnel's band steps
// down at the silhouette and again with height, and the darkest step is reserved for the building.
// A plank flying in front of that has to obey the same law or it stops being in the same picture. So
// the ramp cannot say *wood* or *glass*. There is no hue budget and there is no value budget either.
//
// What is left turns out to be enough, because the eye reads material from motion and silhouette
// long before it reads it from colour. A long thin thing turning end over end is a plank at any
// brightness. A flat thing that collapses to a line twice a turn and comes back is a tile. A big slow
// thing is stone. A small fast thing that breaks into a dozen bright specks is glass. So the four
// materials are separated by **aspect, spin, mass and how each one dies** — four levers that cost
// nothing and leave the ramp alone to do depth.
//
// One consequence is load-bearing: material is not a colour, so material is not a fill. All four drop
// into the same seven step-buckets, and four materials cost exactly what one costs.
//
// And the collisions, which are the same idea again: **a statue does not find something to hit — the
// thing it hits is launched so as to be there.** A detected collision cannot change a trajectory that
// is a closed-form function of `t`, and integrating one is exactly the stored state the render tests
// exist to forbid. So the meeting is choreographed: the statue flies its arc, and its victim is given
// the launch velocity that puts it in the statue's path at the appointed second. Solving
// `v = (p1 - p0 - ½gT²) / T` is two lines, it is exact, and it happens every round without fail.

import { clamp, rgba } from '../../lib/draw.js';
import { chunk } from '../../effects/pixel.js';
import { hash2 } from '../../effects/field.js';
import { bayAt } from './cycle.js';
import { vortexAt } from './funnel.js';
import { GROUND, TOP } from './layout.js';
import { JADE, SPIN } from './palette.js';

/**
 * The four materials. `w`/`h` are in chunks, `spin` in radians a second, `g` in gravities.
 *
 * The spin rates are all under about two radians a second, and that is a hard constraint rather than
 * a taste: a five-chunk plank at five radians a second moves its own endpoint a chunk and a half
 * between frames, so the silhouette *jumps* rather than turning, and a three-chunk tile flickering
 * between one and three chunks wide every other frame is a strobe. Slower also reads heavier, which
 * is what timber and stone want anyway.
 */
const MAT = {
  wood: { w: 5, h: 1, spin: 1.9, g: 1, step: 4, shards: 3, spread: 0.9 },
  tile: { w: 3, h: 1, spin: 2.2, g: 1.1, step: 3, shards: 4, spread: 1.2 },
  stone: { w: 3, h: 3, spin: 0.8, g: 1.5, step: 5, shards: 5, spread: 0.5 },
  glass: { w: 2, h: 2, spin: 1.6, g: 0.85, step: 1, shards: 9, spread: 1.5 },
};

/**
 * ...and what each one is *made of*, which is a separate question from what shape it is.
 *
 * Every piece used to be one solid rectangle, which was defensible while the temple was two values
 * and the forest was lollipops — a flying plank has to obey the same law as everything around it, and
 * the law was "silhouette only". It is not any more. The building shows its joinery, the trees show
 * their tiers, and against that a flat block reads as a hole in the picture with a piece of debris
 * shaped like it.
 *
 * So each material gets a second and third mark inside its own silhouette, and each mark is the one
 * that says what it is: **wood** has grain along its length and pale sawn ends; **tile** has a lit
 * ridge along the top and a dark curl under it, the same three-value chord the roof it came off is
 * drawn with; **stone** has a lit face and a broken corner; **glass** has a bright core with a dark
 * rim, because a thing with light *inside* it is the one read glass has that nothing else does.
 *
 * The marks travel with the piece's rotation rather than being stamped in screen space, so a plank
 * turning end over end shows its grain foreshortening with it.
 */
function detail(bucket, kind, x, y, w, h, px, turn, step) {
  const hot = (n) => bucket[clamp(step - n, 0, SPIN.length - 1)];
  const cold = (n) => bucket[clamp(step + n, 0, SPIN.length - 1)];
  const face = Math.cos(turn) > 0;

  if (kind === 'wood') {
    // Grain down the middle, and a pale sawn end on whichever end is coming toward you.
    if (h > px) hot(1).push(x, y + Math.floor(h / px / 2) * px, w, px);
    hot(2).push(face ? x + w - px : x, y, px, h);
    return;
  }
  if (kind === 'tile') {
    // The roof's own chord, on a piece of the roof: lit ridge, body, shaded curl beneath.
    hot(2).push(x, y, w, px);
    if (h > px) cold(2).push(x, y + h - px, w, px);
    return;
  }
  if (kind === 'stone') {
    // A lit face on one side and a broken corner off the other — the corner is what makes it
    // *rubble* rather than a block, and it is one chunk.
    hot(1).push(face ? x : x + w - px, y, px, h);
    cold(2).push(face ? x + w - px : x, y + h - px, px, px);
    return;
  }
  // Glass: a dark rim with light inside it. The only thing in the frame lit from within.
  cold(2).push(x, y, w, h);
  if (w > px && h > px) hot(3).push(x + px * 0.5, y + px * 0.5, Math.max(px, w - px), Math.max(px, h - px));
}
const KINDS = ['wood', 'tile', 'stone', 'glass'];

/** How long a piece is in the air before the hands have taken it away again. */
const FLIGHT = 4.6;

export function planDebris(rng, bayCount) {
  // Seats, not particles: a seat is a place a piece comes from, and it throws a fresh one every time
  // its bay's round turns over. Nothing is ever created or destroyed, so nothing has to be remembered.
  const seats = [];
  for (let b = 0; b < bayCount; b += 1) {
    for (let i = 0; i < 6; i += 1) {
      seats.push({
        bay: b,
        key: seats.length,
        along: rng.range(-1, 1),
        // Stone is rare and heavy — a statue is an event, not a texture. Glass is rarer still and is
        // the only thing in the scene allowed to be dazzling.
        kind: KINDS[[0, 0, 1, 1, 1, 2, 3][Math.floor(rng.next() * 7)]],
        lift: rng.range(0.7, 1.5),
        toss: rng.range(-0.5, 0.9),
      });
    }
  }
  return { seats, seed: rng.range(0, 70) };
}

/**
 * Loose things on the ground — leaf litter, twigs, torn-up turf — and what the storm does to them.
 *
 * The scene needed far more going *into* the funnel than came off the building, and this is the
 * cheapest honest way to get it: the ground is covered in small things, the wind field passes over
 * them, and they are lifted, wound around the column, carried up it and **gone**. Vanishing is the
 * point. Debris that orbits forever is a decoration; debris that is taken up the throat and stops
 * existing is what a tornado does, and it is the one moment in this scene where something is
 * destroyed without anybody rebuilding it.
 *
 * Every piece is on its own round, and whether that round *happens* is asked at the round's own
 * start against where the storm was then — the same latch the temple's bays use, for the same
 * reason: a piece already climbing must not drop back to the ground because the storm wandered off.
 */
export function planLitter(rng) {
  return {
    seed: rng.range(0, 55),
    bits: Array.from({ length: 100 }, () => ({
      at: rng.next(),
      period: 5 + rng.next() * 7,
      phase: rng.next(),
      out: rng.range(0.7, 1.5),
      rise: rng.range(0.75, 1.6),
      kind: rng.next(),
    })),
  };
}

export function drawLitter(ctx, W, H, t, plan, funnel, px) {
  const groundY = H * GROUND;
  const topY = H * TOP;
  const leaf = [];
  const dust = [];

  for (const bit of plan.bits) {
    const cycles = t / bit.period + bit.phase;
    const n = Math.floor(cycles);
    const began = (n - bit.phase) * bit.period;
    const u = cycles - n;
    const x0 = bit.at * W;

    // Was the wind over this patch when this round turned over? If not, the piece simply lies there.
    const then = vortexAt(W, H, began, funnel, 0);
    const caught = Math.abs(x0 - then.cx) < then.wind;
    if (!caught || u < 0.08) {
      if (u < 0.5) dust.push(x0, groundY + (bit.kind * 3 | 0) * px);
      continue;
    }

    // Lifted. It climbs on its own rate and winds around the column as it goes, and the higher it
    // gets the tighter it is drawn in — which is what makes the path a funnel rather than a helix of
    // constant width.
    const climb = Math.min(1, (u - 0.08) / 0.92 * bit.rise);
    const up = climb;
    const { cx, r, wind } = vortexAt(W, H, t, funnel, up);
    const angle = climb * 9 + bit.at * 30;
    const facing = Math.sin(angle);
    if (facing < -0.15) continue;
    const grip = 1 - climb * 0.75;
    const rad = r * 1.02 + (wind - r) * bit.out * grip * 0.6;
    const y = groundY - climb * (groundY - topY);
    // ...and it thins out near the top and is gone. Nothing arrives at the cloud.
    if (climb > 0.86 && hash2(bit.at * 40, Math.floor(climb * 30)) < (climb - 0.86) * 7) continue;
    if (climb >= 1) continue;
    leaf.push(cx + Math.cos(angle) * rad, y, climb);
  }

  // Two values, because litter is jade — it came off the land, not off the storm — and it cools as it
  // is carried up and away from the light at the ground.
  for (const [colour, lo, hi] of [[JADE[4], 0, 0.45], [JADE[5], 0.45, 0.8], [JADE[6], 0.8, 2]]) {
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < leaf.length; i += 3) {
      if (leaf[i + 2] < lo || leaf[i + 2] >= hi) continue;
      chunk(ctx, leaf[i], leaf[i + 1], px, px, px);
    }
    ctx.fill();
  }
  ctx.fillStyle = rgba(JADE[6], 1);
  ctx.beginPath();
  for (let i = 0; i < dust.length; i += 2) chunk(ctx, dust[i], dust[i + 1], px, px, px);
  ctx.fill();
}

/**
 * Every piece in the air this frame, bucketed by ramp step.
 *
 * `where(bay)` hands back the screen position of a bay on the building, which only the temple knows.
 */
export function drawDebris(ctx, W, H, t, plan, cycle, funnel, px, where) {
  const S = Math.min(W, H);
  const groundY = H * GROUND;
  const bucket = SPIN.map(() => []);
  const glint = [];

  for (const seat of plan.seats) {
    const bay = cycle.bays[seat.bay];
    if (!bay) continue;
    const site = where(bay);
    if (!site) continue;
    const bayUp = clamp((groundY - site.y) / (groundY - H * 0.04), 0, 1);
    const state = bayAt(bay, site.x, bayUp, t, W, H, funnel, cycle.seed, 0);
    // A piece exists only while its bay is down. Nothing is hidden and nothing pops: a seat whose bay
    // was not taken this round simply never threw anything.
    if (!state.struck || state.age > FLIGHT) continue;

    const mat = MAT[seat.kind];
    const roll = (n) => hash2(seat.key * 1.93 + n * 0.61, state.n * 7.31 + plan.seed);
    const age = state.age;

    const x0 = site.x + seat.along * site.half;
    const y0 = site.y;
    const g = S * 0.36 * mat.g;
    let vx = (seat.along * 1.4 + (roll(1) - 0.5) * mat.spread) * S * 0.13;
    let vy = -seat.lift * S * 0.16;

    // A statue is aimed. Its victim — the next seat along, whatever that turns out to be — is given
    // the velocity that puts it exactly where the statue will be at the appointed second, so the two
    // meet every round, without a single distance test.
    const struckAt = 0.42 + roll(4) * 0.5;
    if (seat.kind !== 'stone') {
      const boss = plan.seats[(seat.key + 1) % plan.seats.length];
      if (boss.kind === 'stone' && boss.bay === seat.bay) {
        const bm = MAT.stone;
        const bg = S * 0.36 * bm.g;
        const bx0 = site.x + boss.along * site.half;
        const bvx = (boss.along * 1.4 + (hash2(boss.key * 1.93 + 0.61, state.n * 7.31 + plan.seed) - 0.5) * bm.spread) * S * 0.13;
        const bvy = -boss.lift * S * 0.16;
        const T = struckAt;
        // Where the statue will be, and the launch that arrives there at the same instant.
        vx = (bx0 + bvx * T - x0) / T;
        vy = (y0 + bvy * T + 0.5 * bg * T * T - y0 - 0.5 * g * T * T) / T;
      }
    }

    let x = x0 + vx * age;
    let y = y0 + vy * age + 0.5 * g * age * age;

    // ...and if the vortex reaches it, it stops falling and starts orbiting. Captured pieces obey the
    // same facing rule the funnel's own surface does: the far half of the orbit is behind the body,
    // and drawing it in front is the one thing that would collapse the depth the whole scene rests on.
    const up = clamp((groundY - y) / (groundY - H * 0.04), 0, 1);
    const vortex = vortexAt(W, H, t, funnel, up);
    const grab = 1 - clamp(Math.abs(x - vortex.cx) / (vortex.r * 1.5), 0, 1);
    if (grab > 0.45) {
      const spun = age * 2.2 + roll(5) * 6.28;
      const facing = Math.sin(spun);
      if (facing < -0.15) continue;
      x = vortex.cx + Math.cos(spun) * vortex.r * (1.05 + roll(6) * 0.5);
      // Taken up the throat, and gone. A captured piece used to orbit until its round ran out, which
      // is a decoration; being carried up and *ceasing to exist* is what the storm actually does with
      // what it picks up, and it is the only thing in this scene nobody rebuilds.
      y -= age * S * 0.16 * grab;
      if (y < H * 0.3 && hash2(seat.key, Math.floor(y / px)) < 0.2) continue;
    }
    if (y > groundY + px * 4) continue;

    // Whole, or in pieces. A shatter is drawn as shards travelling *outward from where it broke*,
    // which is the whole difference between shattering and puffing: a puff has no memory of the
    // direction the thing was going when it stopped.
    const broken = age > struckAt;
    const step = clamp(mat.step + (grab > 0.45 ? 1 : 0), 0, SPIN.length - 1);

    if (!broken) {
      const turn = age * mat.spin + roll(2) * 6.28;
      // The silhouette *is* the material: a plank's long axis foreshortens as it turns end over end,
      // and a tile collapses to a line twice a turn. Same two lines of code, different aspect.
      const w = Math.max(1, Math.round(mat.w * Math.abs(Math.cos(turn)))) * px;
      const h = Math.max(1, Math.round(mat.h + (mat.w - mat.h) * Math.abs(Math.sin(turn)))) * px;
      bucket[step].push(x, y, w, h);
      detail(bucket, seat.kind, x, y, w, h, px, turn, step);
      // Glass keeps one dazzling chunk on top of all of it — the one place value is allowed to name a
      // material outright, and only because nothing else in front of the funnel may be this bright.
      if (seat.kind === 'glass') glint.push(x + px * 0.5, y + px * 0.5);
      continue;
    }

    const since = age - struckAt;
    const shards = mat.shards + (seat.kind === 'stone' ? 4 : 0);
    for (let s = 0; s < shards; s += 1) {
      const a = (s / shards) * 6.28 + roll(7 + s) * 1.2;
      const speed = S * (0.03 + roll(8 + s) * 0.07);
      const sx = x + Math.cos(a) * speed * since;
      const sy = y + Math.sin(a) * speed * since + 0.5 * g * since * since;
      if (sy > groundY + px * 2) continue;
      bucket[clamp(step + Math.round(since * 1.6), 0, SPIN.length - 1)].push(sx, sy, px, px);
    }
  }

  for (let step = 0; step < SPIN.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(SPIN[step], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 4) chunk(ctx, cells[i], cells[i + 1], cells[i + 2], cells[i + 3], px);
    ctx.fill();
  }

  if (glint.length) {
    ctx.fillStyle = rgba(SPIN[0], 1);
    ctx.beginPath();
    for (let i = 0; i < glint.length; i += 2) chunk(ctx, glint[i], glint[i + 1], px, px, px);
    ctx.fill();
  }
}
