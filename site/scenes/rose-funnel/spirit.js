// The spirit hand: how one is shaped, and how it is drawn.
//
// It was a mitten, then a nine-chunk bitmap, and both failed for the same reason — a hand authored
// as a fixed grid can only ever hold *one* pose, so everything it did had to be conveyed by moving
// the whole sprite about. A hand that never closes is not a hand doing something, it is a hand-shaped
// cursor.
//
// So this one is **built rather than authored**. A palm ellipse, four fingers rooted along its top
// edge, and a thumb off the side — each finger a capsule whose length and angle come from one `curl`
// parameter. Open at `curl = 0`, closed at `1`, and every value between is a real pose rather than a
// blend of two pictures. Grip, release, reach, flinch and hold are then all one number moving, and
// they can be driven by whatever the hand is actually doing.
//
// **Transparency is the other half of it.** A pale silhouette is a pale hand; what makes a ghost is
// that you can see through it, and with no alpha to spend that means dither. But dithering the whole
// shape is what turned the last version into a white blob — a 50% screen over a solid form destroys
// the *edge*, and the edge is the only thing carrying the drawing. So the outline is solid and only
// the fill is dithered: the hand keeps a hard, readable silhouette and the inside of it is half
// there. That is the 16-bit ghost, and it is the difference between a spectre and a smudge.
//
// The outline is *derived*, not drawn — a filled cell with an empty neighbour — so it follows the
// pose exactly, including around the gaps between fingers, which is precisely where a hand-drawn
// outline would go wrong.

import { clamp } from '../../lib/draw.js';
import { hash2 } from '../../effects/field.js';
import { bayerOn } from '../../effects/pixel.js';

/** The grid a hand is rasterised into. Big enough to hold a splayed hand with room for the thumb. */
export const HAND_W = 13;
export const HAND_H = 15;

/** Distance from a point to a segment — the primitive every finger is made of. */
function toSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const u = len > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1) : 0;
  return Math.hypot(px - ax - dx * u, py - ay - dy * u);
}

/**
 * The four fingers, as roots, fan angles and lengths — index nearest the thumb, then middle, ring,
 * little. Splayed like the sketch: they fan rather than running parallel, and the middle one is
 * longest.
 *
 * Each is drawn in **two segments**, and that is the whole of what makes a closed hand read. The
 * first version shortened the finger and swung it inward as it curled, which is what a finger looks
 * like it does — and at `curl` past about a half every hand in the frame collapsed into a triangular
 * lump with a wrist under it. That is precisely the "white blob" this sprite exists to stop being,
 * and the cause is that retracting a finger removes it from the silhouette entirely.
 *
 * A real finger does not retract, it **folds**: the knuckle stays out where it was and everything
 * past it rotates down across the palm. So the proximal segment barely moves with `curl` and the
 * distal one swings through a third of a turn, which leaves four knuckles standing proud of the palm
 * at full curl. A fist is legible because of its knuckles, and now it has some.
 */
const FINGERS = [
  { at: -0.66, lift: 0.05, len: 5.5 },
  { at: -0.22, lift: -0.25, len: 6 },
  { at: 0.22, lift: -0.05, len: 5.6 },
  { at: 0.66, lift: 0.5, len: 4.4 },
];

/**
 * Rasterise a hand at a given pose into a boolean grid.
 *
 * @param curl   0 open and splayed, 1 closed into a fist
 * @param reach  how far the whole hand is stretched out — fingers lengthen slightly as it reaches
 */
export function handMask(curl, reach = 0) {
  const cells = new Uint8Array(HAND_W * HAND_H);
  const cx = HAND_W / 2;
  // The palm sits low in the grid so the fingers have room above it.
  const py = HAND_H * 0.64;
  const prx = 3.6;
  const pry = 2.9;

  for (let r = 0; r < HAND_H; r += 1) {
    for (let c = 0; c < HAND_W; c += 1) {
      const x = c + 0.5;
      const y = r + 0.5;
      let on = false;

      // The palm — the round pad the sketch hangs everything off. A superellipse rather than an
      // ellipse: a true ellipse narrows to a single chunk at the bottom, and a wide knuckle band over
      // a pointed base is a chevron. Squaring it off keeps the palm full all the way down to the
      // wrist, which is what the sketch draws and what stops the silhouette reading as an arrowhead.
      if (Math.abs((x - cx) / prx) ** 2.6 + Math.abs((y - py) / pry) ** 2.6 <= 1) on = true;

      // Fingers, rooted on the palm's upper edge, fanning out from it and folding at the knuckle.
      if (!on) {
        for (const f of FINGERS) {
          const rootX = cx + f.at * prx * 0.9;
          const rootY = py - pry * 0.55 + f.lift;
          const len = f.len * (1 + reach * 0.14);
          // The knuckle barely moves — it only spreads a little as the hand closes, the way a fist
          // is wider across the knuckles than an open hand is.
          const a1 = f.at * 0.85 + curl * 0.22 * (f.at < 0 ? -1 : 1);
          const knuckle = len * 0.42 * (1 - curl * 0.18);
          const midX = rootX + Math.sin(a1) * knuckle;
          const midY = rootY - Math.cos(a1) * knuckle;
          // ...and everything past it **foreshortens** rather than swinging round.
          //
          // Rotating it down across the palm is what a finger does, and it is wrong from this angle:
          // seen front-on, a closing finger points at the viewer, so in the plane of the picture it
          // gets *shorter*. Swung instead, the distal segments passed through the horizontal at about
          // half curl and every hand in the frame sprouted sideways stubs that read as flying debris.
          const a2 = a1 + curl * 0.55;
          const reachOut = len * 0.58 * (1 - curl * 0.85);
          const tipX = midX + Math.sin(a2) * reachOut;
          const tipY = midY - Math.cos(a2) * reachOut;
          if (toSegment(x, y, rootX, rootY, midX, midY) <= 0.92) { on = true; break; }
          if (toSegment(x, y, midX, midY, tipX, tipY) <= 0.86) { on = true; break; }
        }
      }

      // The thumb: shorter, thicker, and set low and wide, which is the one feature that stops a
      // hand reading as a paw. It closes across the palm rather than folding up beside the fingers.
      if (!on) {
        const rootX = cx - prx * 0.78;
        const rootY = py + pry * 0.2;
        const len = 3.8 * (1 - curl * 0.18);
        const angle = -1.25 + curl * 1.6;
        const tipX = rootX + Math.sin(angle) * len;
        const tipY = rootY - Math.cos(angle) * len * 0.7;
        if (toSegment(x, y, rootX, rootY, tipX, tipY) <= 1.15) on = true;
      }

      // A wrist stub, and nothing beyond it. Disembodied is done by subtraction: there is no arm,
      // and the tail that follows is separating chunks rather than a limb fading out. Short and
      // nearly as wide as the palm — a long narrow one turned the whole sprite into a triangle,
      // which is half of why a closed hand used to read as an arrowhead.
      if (!on && Math.abs(x - cx) < 1.9 && y > py + pry * 0.82 && y < HAND_H - 1.2) on = true;

      cells[r * HAND_W + c] = on ? 1 : 0;
    }
  }
  return cells;
}

/**
 * Emit a hand into three buckets: the solid outline, the dithered fill, and a lit knuckle line.
 *
 * The dither is keyed to the hand's own grid rather than to the screen, so the holes travel with the
 * hand. Keyed to the screen it becomes a fixed screen-door that a hand happens to move behind, which
 * reads as a hole cut in the picture rather than as something you can see through.
 *
 * **`scatter` is how a spirit arrives and how it leaves.** At 0 the hand is whole; at 1 it is not
 * there at all, and in between its chunks have thinned out and drifted apart, upward and outward.
 * One parameter does both jobs because they are the same event run in opposite directions: a spirit
 * being taken has `scatter` rising, and one being summoned has it falling, so the chunks converge out
 * of the air and settle into a hand. Which chunk goes first is hashed on its own cell, so the
 * dispersal is a fixed pattern that the hand comes apart along rather than a shimmer.
 *
 * A fade in *density* alone was what this replaces, and it was not enough: the hand simply became a
 * fainter hand and then was gone between one frame and the next. Chunks have to visibly leave.
 */
export function stampSpirit(edge, fill, lit, mask, x, y, px, flip, solidity = 0.55, scatter = 0) {
  // Late and fast: it holds its shape while the first chunks lift off, then goes all at once. Linear
  // drift reads as a hand being gently blurred, which is not what is happening to it.
  const away = scatter * scatter;
  for (let r = 0; r < HAND_H; r += 1) {
    for (let c = 0; c < HAND_W; c += 1) {
      const sc = flip ? HAND_W - 1 - c : c;
      if (!mask[r * HAND_W + sc]) continue;

      let ox = 0;
      let oy = 0;
      if (scatter > 0) {
        const h = hash2(c * 1.7 + 0.31, r * 2.9 + 0.7);
        if (h < scatter) continue;
        // Up and out. The storm takes things upward, and a summoning is that in reverse.
        ox = (h * 2 - 1) * away * px * 7;
        oy = -away * px * (2 + h * 8);
      }
      // On the boundary? Then it is outline, and outline is never dithered — the silhouette is the
      // whole drawing and a half-erased edge is a smudge.
      const border = r === 0 || c === 0 || r === HAND_H - 1 || c === HAND_W - 1
        || !mask[(r - 1) * HAND_W + sc] || !mask[(r + 1) * HAND_W + sc]
        || !mask[r * HAND_W + (flip ? sc + 1 : sc - 1)] || !mask[r * HAND_W + (flip ? sc - 1 : sc + 1)];
      if (border) {
        edge.push(x + c * px + ox, y + r * px + oy, px, px);
        continue;
      }
      if (!bayerOn(c, r, solidity)) continue;
      // A brighter band across the knuckles, which is where a hand catches light and the one place
      // a third value buys anything.
      (r > HAND_H * 0.36 && r < HAND_H * 0.5 ? lit : fill).push(x + c * px + ox, y + r * px + oy, px, px);
    }
  }
}
