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

import { rgba } from '../../lib/draw.js';
import { FALL, MOTE, STREAK } from './palette.js';
import { RATIO, U_TOP, bottomDepth, edgeOf, scaleAt, snapTo } from './layout.js';

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
    lines: Array.from({ length: 30 }, () => ({
      p: rng.next(),
      speed: rng.range(0.5, 0.95),
      phase: rng.range(0, 60),
      len: rng.range(1.2, 2.8),
      // Swallowed like everything else, and on the same distribution as the motes but reaching
      // deeper — a line is the one thing here with enough length to still read as a line most of
      // the way down, and a few of them going all the way is what keeps the shaft from looking as
      // though it stops somewhere. Without this the thirty of them converge into the same twenty
      // chunks at the bottom and weld themselves into a solid grey slab.
      vanish: 4 + Math.log(rng.range(0.02, 1)) / (0.42 * Math.log(RATIO)),
    })),
    // Loose pixels. Many, small, and at a wider spread of speeds than anything else, so the shaft
    // always has some texture moving in it even when nothing else is happening.
    motes: Array.from({ length: 300 }, () => ({
      p: rng.next(),
      speed: rng.range(0.55, 1.5),
      phase: rng.range(0, 60),
      // How deep it gets before the pit has it.
      //
      // **Something has to thin them out, and perspective says how much.** Every ray converges on
      // the same point, so a population spread evenly through depth is spread over a screen area
      // that shrinks geometrically — draw them all and the far half of the shaft is not texture, it
      // is a solid speckled blob sitting exactly where the picture most needs to be empty. Keeping
      // the *screen* density constant means the survivor count has to fall like the scale does, and
      // `log(q) / log(RATIO)` on a uniform `q` is exactly the distribution that does it.
      //
      // It also happens to be the truthful thing to draw. They are not fading out. They are gone.
      vanish: 3 + Math.log(rng.range(0.02, 1)) / (0.55 * Math.log(RATIO)),
    })),
    // ...and the blocks, which are slow, because a heavy thing going into a hole is the one event
    // here with any weight to it and it should not be over before you have looked at it.
    blocks: Array.from({ length: 14 }, () => ({
      p: rng.next(),
      speed: rng.range(0.34, 0.62),
      phase: rng.range(0, 60),
      shape: Math.floor(rng.next() * SHAPES.length) % SHAPES.length,
      hue: Math.floor(rng.next() * FALL.length) % FALL.length,
      spin: rng.range(0.1, 0.42),
      size: rng.range(0.1, 0.2),
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
  const cx = snapTo(W / 2, px);
  const cy = snapTo(H / 2, px);
  const halfW = W / 2;
  const halfH = H / 2;
  const deepest = bottomDepth(W, H, px);
  const span = deepest - U_TOP;
  const at = [0, 0];
  const tail = [0, 0];

  // Lines, drawn body-first so every head lands on top of its own trail.
  const bodies = [];
  const heads = [];
  for (const line of plan.lines) {
    const u = U_TOP + wrapTo(line.phase + flow * line.speed, span);
    if (u > line.vanish) continue;
    place(at, line.p, u, cx, cy, halfW, halfH);
    // The tail is held just off the frame edge: a line near the mouth is long enough that its far
    // end is well outside the picture, and stepping chunks all the way out there is work spent on
    // pixels nobody has.
    place(tail, line.p, Math.max(u - line.len, U_TOP), cx, cy, halfW, halfH);
    const dx = at[0] - tail[0];
    const dy = at[1] - tail[1];
    const steps = Math.min(160, Math.ceil(Math.hypot(dx, dy) / px));
    for (let i = 0; i < steps; i += 1) {
      const f = i / steps;
      bodies.push(snapTo(tail[0] + dx * f, px), snapTo(tail[1] + dy * f, px));
    }
    heads.push(snapTo(at[0], px), snapTo(at[1], px));
  }
  stamp(ctx, bodies, MOTE, px);
  // One chunk at the leading end, a shade brighter. It is the whole of what tells you which way a
  // line is going, and without it a radial streak is as much an arrival as a departure.
  stamp(ctx, heads, STREAK, px);

  const motes = [];
  for (const mote of plan.motes) {
    const u = U_TOP + wrapTo(mote.phase + flow * mote.speed, span);
    if (u > mote.vanish) continue;
    place(at, mote.p, u, cx, cy, halfW, halfH);
    motes.push(snapTo(at[0], px), snapTo(at[1], px));
  }
  stamp(ctx, motes, MOTE, px);

  // The blocks. Bucketed by colour so each is one path, which matters here only because a block is
  // sixteen cells rather than one chunk.
  const cells = FALL.map(() => [[], []]);
  for (const block of plan.blocks) {
    const u = U_TOP + wrapTo(block.phase + flow * block.speed, span);
    const s = place(at, block.p, u, cx, cy, halfW, halfH);
    // Near, or far. One switch, no fade — see `FALL`.
    const into = cells[block.hue][u > 8.5 ? 1 : 0];
    const wide = block.size * s * Math.min(W, H);

    // **A sprite runs out of resolution before the pit runs out of depth**, and what it does then is
    // the thing to get right. Holding the bitmap at one chunk a cell would stop a block ever getting
    // smaller than four chunks across — so instead of being swallowed they pile up around the
    // vanishing point at a size the shaft left behind long ago, which is the one thing in this
    // picture that must not happen. So it drops to a smaller sprite, twice, and then it is gone. An
    // 8-bit game receding a sprite swapped it for a coarser one for exactly this reason; the steps
    // are visible if you look for them and invisible at the size they happen.
    if (wide < px * 0.9) continue;
    if (wide < px * 2.2) {
      into.push(snapTo(at[0], px), snapTo(at[1], px), px);
      continue;
    }
    // Quarter-turns, never a fraction of one. A sprite that rotates smoothly is the single loudest
    // way to break this style — 8-bit hardware could flip a tile and nothing else.
    const rot = ((Math.floor(flow * block.spin + block.phase) % 4) + 4) % 4;
    if (wide < px * 4.4) {
      // Two by two: the shape's own quadrants, on wherever the full bitmap had anything in them.
      const x2 = snapTo(at[0] - px, px);
      const y2 = snapTo(at[1] - px, px);
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 2; col += 1) {
          const on = bitAt(SHAPES[block.shape], row * 2, col * 2, rot)
            || bitAt(SHAPES[block.shape], row * 2 + 1, col * 2 + 1, rot);
          if (on) into.push(x2 + col * px, y2 + row * px, px);
        }
      }
      continue;
    }
    const cell = snapTo(wide / 4, px);
    const shape = SHAPES[block.shape];
    const x0 = snapTo(at[0] - cell * 2, px);
    const y0 = snapTo(at[1] - cell * 2, px);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        if (bitAt(shape, row, col, rot)) into.push(x0 + col * cell, y0 + row * cell, cell);
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

function stamp(ctx, xy, colour, px) {
  if (!xy.length) return;
  ctx.fillStyle = rgba(colour, 1);
  ctx.beginPath();
  for (let i = 0; i < xy.length; i += 2) ctx.rect(xy[i], xy[i + 1], px, px);
  ctx.fill();
}
