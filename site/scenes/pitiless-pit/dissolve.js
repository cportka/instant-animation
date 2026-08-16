// Seven ways to stop existing.
//
// Everything that goes down this pit used to end the same way: it reached the depth the perspective
// had allotted it and was not drawn on the next frame. That is *correct* — the pit takes things and
// nothing comes back — and it is also the one moment in the animation where the picture cheated,
// because the taking was over before you could see it happen. A thing you watched for eight seconds
// disappeared between two frames.
//
// So each item now comes apart in its own way over the last stretch of its fall, and there are seven
// so that watching two go at once is watching two different events. They are all **structural**,
// which they have to be: this scene has no alpha, no dither and sixteen flat colours, so nothing here
// can fade. A thing can only leave by being *moved*, *repeated*, or *not drawn* — and it turns out
// that is a rich enough alphabet, because those are exactly the three ways an 8-bit machine could
// destroy a sprite too.
//
// Each takes a progress from 0 (whole) to 1 (gone) and rewrites the sprite's cells. They are pure
// functions of that progress and the cell's own position; nothing accumulates, which is what lets
// the render tests draw the eighth second of a dissolve without having drawn the first.

import { hash2 } from '../../effects/field.js';

/** The names, in the order a plan picks them. Exported so a test can insist all seven are dealt. */
export const WAYS = ['glitch', 'wave', 'mosh', 'liquid', 'crumble', 'collapse', 'shear'];

/**
 * How a cell of a dissolving sprite is displaced, or whether it survives at all.
 *
 * `col`/`row` are the cell's place in the 4×4 bitmap, `at` is 0..1 through the dissolve, `seed`
 * separates one item's dissolve from another's, and `spin` is the direction the sprite is travelling
 * so the ways that smear know which way to smear. Returns `null` when the cell is gone.
 */
export function dissolveCell(way, col, row, at, seed, dx, dy, out) {
  out[0] = 0;
  out[1] = 0;
  switch (way) {
    // **Glitch.** Rows are read from further and further off, until the sprite is a stack of
    // unrelated slices and then not there. The one that looks like the machine failing rather than
    // the object failing — the sprite is intact, its *address* is not.
    case 'glitch': {
      if (hash2(row * 3.1 + seed, Math.floor(at * 9) + 13) < at * 1.05) return null;
      out[0] = Math.round((hash2(row * 5.7 + seed, Math.floor(at * 9)) - 0.5) * 8 * at);
      return out;
    }

    // **Wave.** A travelling ripple through the rows, growing until the sprite has been shaken
    // apart. Cells leave from the crest first, so the shape unravels along the wave rather than
    // thinning evenly.
    case 'wave': {
      // Quadratic, so the sprite stays whole while the ripple builds and clears in the last third.
      if (hash2(col + row * 4 + seed, 17) < at * at * 1.35) return null;
      const phase = at * 9 - row * 1.1;
      const swing = Math.sin(phase) * at * 5;
      out[0] = Math.round(swing);
      out[1] = Math.round(Math.cos(phase * 0.7) * at * 2);
      // ...and a cell thrown furthest by the crest is the likeliest to be shaken off it.
      return Math.abs(swing) > 4.2 - at * 1.2 ? null : out;
    }

    // **Data mosh.** The cell stops being redrawn where it is and starts being redrawn where it was
    // going — smeared along its own direction of travel in repeating steps, the way a compressed
    // frame keeps applying motion to a block nobody sent an update for. It is the only one of the
    // seven that makes the sprite *bigger* on its way out.
    case 'mosh': {
      const steps = 1 + Math.floor(at * 5);
      const k = Math.floor(hash2(col * 2.3 + row * 4.1 + seed, 19) * steps);
      out[0] = Math.round(dx * k * at * 3);
      out[1] = Math.round(dy * k * at * 3);
      return hash2(col + row * 4 + seed, 23) < at * 1.1 ? null : out;
    }

    // **Liquid.** Every column runs at its own rate and the sprite drains downward, the way a
    // melting thing does — nothing moves sideways at all, and what is left at the end is the last
    // column still holding on.
    case 'liquid': {
      const run = hash2(col * 7.3 + seed, 29);
      const drop = Math.max(0, at - run * 0.35) / 0.65;
      out[1] = Math.round(drop * drop * 14);
      return drop > 0.92 ? null : out;
    }

    // **Crumble.** Cells drop out from the outside in, so the sprite loses its corners, then its
    // edges, and is briefly just its middle before that goes too.
    case 'crumble': {
      const edge = Math.max(Math.abs(col - 1.5), Math.abs(row - 1.5)) / 1.5;
      return hash2(col + row * 4 + seed, 31) < at * 1.6 - (1 - edge) * 0.55 ? null : out;
    }

    // **Collapse.** It falls into itself faster than the perspective is shrinking it, every cell
    // walking toward the sprite's own centre until the whole thing is one chunk and then none.
    case 'collapse': {
      out[0] = -Math.round((col - 1.5) * at * 2.6);
      out[1] = -Math.round((row - 1.5) * at * 2.6);
      return at > 0.93 ? null : out;
    }

    // **Shear.** Alternate rows slide in opposite directions and keep going, so the sprite is pulled
    // into strips that separate and then run off on their own.
    default: {
      const dir = row % 2 === 0 ? 1 : -1;
      out[0] = Math.round(dir * at * at * 16);
      return hash2(row * 11.3 + seed, 37) < at * at * 1.3 ? null : out;
    }
  }
}

/**
 * The same alphabet applied to a line, which has no cells to rearrange — only a length and an end.
 *
 * A line is a single stroke, so most of the seven have nothing to grip. These three do, and they are
 * the three that need only one dimension: it is eaten from the tail, it is shaken apart, or it
 * smears past where it should have stopped. Returns how much of the line is left, and how far the
 * whole thing is thrown sideways.
 */
export function dissolveLine(way, at, seed, t) {
  if (way === 'wave') {
    return { keep: 1 - at * 0.35, slide: Math.sin(t * 7 + seed * 30) * at * 9 };
  }
  if (way === 'mosh') {
    return { keep: 1 + at * 1.6, slide: 0 };
  }
  // Eaten from the far end, which is the one that reads on something with no width.
  return { keep: Math.max(0, 1 - at * 1.2), slide: 0 };
}
