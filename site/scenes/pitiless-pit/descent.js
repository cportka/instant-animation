// Everything that goes down: the lines, the loose pixels, and the things that fall in.
//
// All three are the same object with three sizes. Each has a position around the ring, a speed, and
// a phase; each is at a depth that advances with the flowed clock; and each is drawn at whatever
// scale that depth implies. Nothing here has a velocity that gets integrated, nothing accelerates,
// and nothing remembers where it was — a descent is `phase + flow * speed`, evaluated.
//
// They fall **in a straight line on screen**, and for free. A thing at a fixed position around the
// ring simply scales toward the centre as it goes down, and scaling a point is a straight ray. So
// the perspective, the convergence, and the fact that everything in the picture is pointed at the
// same spot all come out of the coordinate rather than being drawn.
//
// The wrap is invisible at both ends, which is the other thing the geometry buys. An item leaving
// the bottom is smaller than one chunk; the same item re-entering at the top is outside the frame.
// There is nowhere to stand where you could watch one turn over.

import { hash2 } from '../../effects/field.js';
import { rgba } from '../../lib/draw.js';
import { FALL, MOTE, STREAK } from './palette.js';
import { corruptAt, flickerOn } from './glitch.js';
import { WAYS, dissolveCell, dissolveLine } from './dissolve.js';
import { RATIO, U_TOP, bottomDepth, edgeOf, finestOf, pxAt, scaleAt, snapTo } from './layout.js';

/**
 * How much of an item's fall is spent coming apart.
 *
 * In depth rather than in seconds, so a thing near the mouth and a thing deep in the shaft
 * dissolve over the same *distance* and therefore look like the same event happening at two
 * scales — which is what perspective would do to it if it were real.
 */
const UNDOING = 3.2;

/**
 * How often a given thing falling in goes wrong, and for how long.
 *
 * Per *object*, so the rate you actually see is this divided by however many are falling — fourteen
 * blocks on a thirty-second cycle is a corruption somewhere about every two seconds, which is often
 * enough to be a property of the pit and rare enough that you still notice each one. Faults that
 * arrive faster than you can finish looking at one stop being faults and become a filter.
 */
const BREAKS = 30;
const BURST = 0.6;

/**
 * The things that fall in, as 4×4 bitmaps.
 *
 * Abstract, and deliberately not *quite* anything. A recognisable object falling into an abstract
 * pit turns the picture into a story about that object; a shape that is only a shape leaves it a
 * picture about the pit. Four by four because that is the smallest grid that can hold a hole, and a
 * hole is what makes a block read as constructed rather than as a blob.
 */
const SHAPES = [
  '1111100110011111',
  '0110111111110110',
  '1100110000110011',
  '0100111001000100',
  '1110101000101110',
  '1001010000101001',
  '1111000110001111',
  '0011011011001100',
  '1010111101011010',
  '1110110010100001',
  '0110100110010110',
  '1101101101101011',
];

/** One cell of a shape, read through a quarter-turn. */
function bitAt(shape, row, col, rot) {
  let r = row;
  let c = col;
  for (let i = 0; i < rot; i += 1) {
    const nr = c;
    c = 3 - r;
    r = nr;
  }
  return shape.charCodeAt(r * 4 + c) === 49;
}

export function planDescent(rng) {
  return {
    // Lines run in off the ground and keep going. They are the fastest thing in the picture and the
    // only one with a length, which is what makes the pit read as *pulling* rather than as a hole
    // things happen to be near.
    lines: Array.from({ length: 30 }, (_, i) => ({
      p: rng.next(),
      speed: rng.range(0.5, 0.95),
      phase: rng.range(0, 60),
      len: rng.range(1.2, 2.8),
      glitch: rng.next(),
      way: WAYS[i % WAYS.length],
      // Swallowed like everything else, and the exponent is **1** where a mote's is 2 — see the
      // motes below for where those numbers come from. A line is not a point: it is three or four
      // chunks long and that length shrinks with the scale, so its ink falls off one power of the
      // scale more slowly than a mote's does and its survivor count has to fall one power faster
      // to compensate. A long tail keeps a few going all the way down, so the shaft has lines in
      // it rather than merely near it.
      vanish: 4 + Math.log(rng.range(0.02, 1)) / (1 * Math.log(RATIO)),
    })),
    // Loose pixels. Many, small, and at a wider spread of speeds than anything else, so the shaft
    // always has some texture moving in it even when nothing else is happening.
    motes: Array.from({ length: 300 }, () => ({
      p: rng.next(),
      speed: rng.range(0.55, 1.5),
      phase: rng.range(0, 60),
      // How deep it gets before the pit has it.
      //
      // **Something has to thin them out, and perspective says exactly how much.** Every ray
      // converges on the same point, so a population spread evenly through depth is spread over a
      // screen area that shrinks *geometrically* — drawn in full, the far half of the shaft is not
      // texture, it is a solid speckled slab sitting where the picture most needs to be empty.
      //
      // Written this way, `P(vanish > u)` works out to `RATIO ** (K * (u - floor))`. The area a ring
      // occupies goes as `RATIO ** (2u)`, so holding the density constant on *screen* means
      // **K = 2** — and that is the whole derivation. It is worth doing rather than guessing: this
      // was tuned by eye to 0.55 twice, which is nearly four times too slow, and the slab came back
      // both times as soon as a reshuffled seed dealt a few more of them deep.
      //
      // It also happens to be the truthful thing to draw. They are not fading out. They are gone.
      vanish: 3 + Math.log(rng.range(0.02, 1)) / (2 * Math.log(RATIO)),
    })),
    // ...and the blocks, which are slow, because a heavy thing going into a hole is the one event
    // here with any weight to it and it should not be over before you have looked at it.
    blocks: Array.from({ length: 14 }, (_, i) => ({
      p: rng.next(),
      speed: rng.range(0.34, 0.62),
      phase: rng.range(0, 60),
      shape: Math.floor(rng.next() * SHAPES.length) % SHAPES.length,
      hue: Math.floor(rng.next() * FALL.length) % FALL.length,
      spin: rng.range(0.1, 0.42),
      size: rng.range(0.1, 0.2),
      glitch: rng.next(),
      // Which of the seven this one goes by. Dealt from the plan, so a given block always comes
      // apart the same way and you can learn to recognise it before it starts.
      //
      // **Round robin, not a random draw.** Fourteen blocks each picking freely from seven ways
      // leaves two or three of the seven undealt on any given seed — they exist, they are tested,
      // and nobody ever sees them. Dealt in turn, every way is on screen twice and the gallery
      // actually contains what it says it does.
      way: WAYS[i % WAYS.length],
      // ...and how far down it gets before that starts.
      //
      // Blocks need this said explicitly now, where they did not before. They used to leave simply
      // by becoming smaller than a chunk — but the grid sharpens faster than perspective shrinks
      // them, so a block is now *further* above the resolution floor the deeper it goes and would
      // ride all the way to the bottom.
      //
      // **Shallow, and that is the whole tuning of this feature.** Perspective is brutal on anything
      // deep: a block eight depths down is a fifth of the size it arrived at, and a four-by-four
      // sprite coming apart at a dozen pixels across is an event nobody can see happen. Dealt across
      // the upper half of the shaft, the largest of them dissolve at forty pixels and the deepest at
      // a dozen — which is the range that reads as the same thing at different distances rather than
      // as one thing that only works close up.
      vanish: rng.range(4.5, 12),
    })),
  };
}

/** Where a depth lands on screen, along the ray at `p`. */
function place(out, p, u, cx, cy, halfW, halfH) {
  const s = scaleAt(u);
  edgeOf(p, out);
  out[0] = cx + out[0] * s * halfW;
  out[1] = cy + out[1] * s * halfH;
  return s;
}

const wrapTo = (v, span) => v - Math.floor(v / span) * span;

export function drawDescent(ctx, W, H, flow, plan, px) {
  const finest = finestOf(ctx, W);
  const cx = snapTo(W / 2, px);
  const cy = snapTo(H / 2, px);
  const halfW = W / 2;
  const halfH = H / 2;
  const deepest = bottomDepth(W, H, finest);
  const span = deepest - U_TOP;
  const at = [0, 0];
  const tail = [0, 0];
  const cell = [0, 0];

  // Lines, drawn body-first so every head lands on top of its own trail. Grouped by the grid they
  // are drawn on, because that grid now depends on how deep the chunk is — see `pxAt`.
  const bodies = [];
  const heads = [];
  for (const line of plan.lines) {
    let u = U_TOP + wrapTo(line.phase + flow * line.speed, span);
    if (u > line.vanish) continue;
    // A line that goes wrong jumps somewhere it has not been yet and stutters there — the read came
    // off the wrong address, and the next one will too until it recovers.
    const bad = corruptAt(flow, line.glitch, BREAKS, BURST);
    if (bad) {
      if (!flickerOn(bad.g, bad.age)) continue;
      u += (hash2(bad.g * 1.7 + line.glitch, 41) - 0.35) * 3.2;
      if (u <= U_TOP || u > line.vanish) continue;
    }
    // How far through its undoing it is. Nothing simply stops being drawn any more: the last
    // stretch of every fall is spent coming apart, in whichever of the seven ways this one was
    // dealt. See `dissolve.js`.
    const undone = Math.max(0, 1 - (line.vanish - u) / UNDOING);
    const { keep, slide } = dissolveLine(line.way, undone, line.glitch, flow);
    if (keep <= 0) continue;

    const grid = pxAt(u, px, finest);
    place(at, line.p, u, cx, cy, halfW, halfH);
    // The tail is held just off the frame edge: a line near the mouth is long enough that its far
    // end is well outside the picture, and stepping chunks all the way out there is work spent on
    // pixels nobody has.
    place(tail, line.p, Math.max(u - line.len * keep, U_TOP), cx, cy, halfW, halfH);
    const dx = at[0] - tail[0];
    const dy = at[1] - tail[1];
    const steps = Math.min(220, Math.ceil(Math.hypot(dx, dy) / grid));
    for (let i = 0; i < steps; i += 1) {
      const f = i / steps;
      bodies.push(snapTo(tail[0] + dx * f + slide, grid), snapTo(tail[1] + dy * f, grid), grid);
    }
    heads.push(snapTo(at[0] + slide, grid), snapTo(at[1], grid), grid);
  }
  stamp(ctx, bodies, MOTE);
  // One chunk at the leading end, a shade brighter. It is the whole of what tells you which way a
  // line is going, and without it a radial streak is as much an arrival as a departure.
  stamp(ctx, heads, STREAK);

  // The motes need no dissolution of their own: a single chunk on a grid that sharpens with depth
  // already shrinks the whole way down and leaves as one device pixel. That is the plainest of the
  // seven ways to go and the pit gives it to the things too small to have any other.
  const motes = [];
  for (const mote of plan.motes) {
    const u = U_TOP + wrapTo(mote.phase + flow * mote.speed, span);
    if (u > mote.vanish) continue;
    const grid = pxAt(u, px, finest);
    place(at, mote.p, u, cx, cy, halfW, halfH);
    motes.push(snapTo(at[0], grid), snapTo(at[1], grid), grid);
  }
  stamp(ctx, motes, MOTE);

  // The blocks. Bucketed by colour so each is one path, which matters here only because a block is
  // sixteen cells rather than one chunk.
  const cells = FALL.map(() => [[], []]);
  for (const block of plan.blocks) {
    const u = U_TOP + wrapTo(block.phase + flow * block.speed, span);
    const s = place(at, block.p, u, cx, cy, halfW, halfH);

    // What is wrong with this one, if anything. Decided once and held for the whole burst: the
    // colour it has been given by mistake, which of its four rows was read from the wrong address,
    // and how far that row sits from the rest of it.
    const bad = corruptAt(flow, block.glitch, BREAKS, BURST);
    if (bad && !flickerOn(bad.g, bad.age)) continue;
    // Attribute clash: colour belonged to the cell, not the sprite, so a sprite crossing one came
    // out wearing whatever the cell was already holding. It is the single most recognisable way for
    // a picture of this generation to be broken, and it costs one index.
    const hue = bad ? (block.hue + 1 + Math.floor(hash2(bad.g * 2.3, 43) * (FALL.length - 1))) % FALL.length : block.hue;
    const torn = bad ? Math.floor(hash2(bad.g * 3.1, 47) * 4) : -1;
    const slip = bad ? (hash2(bad.g * 4.7, 53) < 0.5 ? -1 : 1) * (1 + Math.floor(hash2(bad.g * 5.9, 59) * 2)) : 0;

    // Near, or far. One switch, no fade — see `FALL`.
    const into = cells[hue][u > 8.5 ? 1 : 0];
    const wide = block.size * s * Math.min(W, H);
    // The grid this depth is drawn on, which gets finer the further down it is. A block near the
    // bottom is therefore made of chunks a fraction the size of the ones it arrived as, and its
    // dissolution is drawn at that resolution too — the pit takes it apart in more detail than it
    // was ever built with.
    const grid = pxAt(u, px, finest);

    // How far through its undoing. Zero for almost the whole fall; the last couple of depths are
    // spent coming apart in whichever of the seven ways this block was dealt.
    const undone = Math.max(0, 1 - (block.vanish - u) / UNDOING);
    if (undone >= 1) continue;

    // **A sprite runs out of resolution before the pit runs out of depth**, and what it does then is
    // the thing to get right. Holding the bitmap at one chunk a cell would stop a block ever getting
    // smaller than four chunks across — so instead of being swallowed they pile up around the
    // vanishing point at a size the shaft left behind long ago, which is the one thing in this
    // picture that must not happen. So it drops to a smaller sprite, twice, and then it is gone. An
    // 8-bit game receding a sprite swapped it for a coarser one for exactly this reason; the steps
    // are visible if you look for them and invisible at the size they happen.
    if (wide < grid * 0.9) continue;
    if (wide < grid * 2.2) {
      into.push(snapTo(at[0], grid), snapTo(at[1], grid), grid);
      continue;
    }
    // Quarter-turns, never a fraction of one. A sprite that rotates smoothly is the single loudest
    // way to break this style — 8-bit hardware could flip a tile and nothing else.
    const rot = ((Math.floor(flow * block.spin + block.phase) % 4) + 4) % 4;
    if (wide < grid * 4.4) {
      // Two by two: the shape's own quadrants, on wherever the full bitmap had anything in them.
      const x2 = snapTo(at[0] - grid, grid);
      const y2 = snapTo(at[1] - grid, grid);
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 2; col += 1) {
          const on = bitAt(SHAPES[block.shape], row * 2, col * 2, rot)
            || bitAt(SHAPES[block.shape], row * 2 + 1, col * 2 + 1, rot);
          if (on) into.push(x2 + col * grid, y2 + row * grid, grid);
        }
      }
      continue;
    }
    const size = snapTo(wide / 4, grid);
    const shape = SHAPES[block.shape];
    const x0 = snapTo(at[0] - size * 2, grid);
    const y0 = snapTo(at[1] - size * 2, grid);
    // Which way it is heading on screen, in case its dissolution wants to smear along it. Every
    // fall is a straight ray from the centre, so this is just where it is relative to there.
    const away = Math.hypot(at[0] - cx, at[1] - cy) || 1;
    const rx = (at[0] - cx) / away;
    const ry = (at[1] - cy) / away;
    for (let row = 0; row < 4; row += 1) {
      // ...and one row of it may have come from somewhere else entirely.
      const skew = row === torn ? slip * size : 0;
      for (let col = 0; col < 4; col += 1) {
        if (!bitAt(shape, row, col, rot)) continue;
        let ox = 0;
        let oy = 0;
        if (undone > 0) {
          if (!dissolveCell(block.way, col, row, undone, block.glitch, -rx, -ry, cell)) continue;
          ox = cell[0] * size * 0.5;
          oy = cell[1] * size * 0.5;
        }
        into.push(x0 + col * size + skew + ox, y0 + row * size + oy, size);
      }
    }
  }
  for (let hue = 0; hue < FALL.length; hue += 1) {
    for (let near = 0; near < 2; near += 1) {
      const list = cells[hue][near];
      if (!list.length) continue;
      ctx.fillStyle = rgba(FALL[hue][near], 1);
      for (let i = 0; i < list.length; i += 3) ctx.fillRect(list[i], list[i + 1], list[i + 2], list[i + 2]);
    }
  }
}

/** Chunks as `(x, y, size)` triples — the size travels with them, because the grid does. */
function stamp(ctx, xyz, colour) {
  if (!xyz.length) return;
  ctx.fillStyle = rgba(colour, 1);
  ctx.beginPath();
  for (let i = 0; i < xyz.length; i += 3) ctx.rect(xyz[i], xyz[i + 1], xyz[i + 2], xyz[i + 2]);
  ctx.fill();
}
