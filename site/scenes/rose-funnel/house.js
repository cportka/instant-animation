// The little house at the foot of the storm.
//
// There has always been something down there — the funnel's skirt, a shed on the horizon — but it
// read as a triangle sitting on a rectangle rather than as a *place someone lived*. This is a house:
// a pitched terracotta roof with an overhanging eave, cream walls, one dark door, two lit windows
// and a chimney. Nothing else. The whole point of it is that it is modest, and that it is directly
// under the worst thing in the picture.
//
// It **travels with the storm**, always at the foot, which is the one decision that makes it work.
// A house standing somewhere fixed is a building the tornado happens to pass; a house that is always
// at the base is a house being *followed*, and it turns the tornado's whole march across the frame
// into one long act of destruction with a single victim you can keep track of.
//
// And it comes apart in place. How much of it is left is a pure function of how hard the thing above
// it is blowing — no cycle, no epoch, no latch, because unlike the temple this thing is not being
// rebuilt by anybody. It is eaten from the roof down and from the windward side in, and when the
// storm eases it is simply there again, which is the one liberty the scene takes and it takes it
// deliberately: the temple is the thing that is *repaired*, and giving the house its own crew of
// menders would say the same sentence twice.
//
// The lit side is the side facing the storm. That is not where the light would be if this were a
// daylit street, and it is the truth here: the brightest object in the frame is the tornado, so the
// wall that catches it is the wall being destroyed, and the house is lit by the thing killing it.

import { clamp, rgba } from '../../lib/draw.js';
import { hash2 } from '../../effects/field.js';
import { chunk } from '../../effects/pixel.js';
import { powerAt, vortexAt } from './funnel.js';
import { GROUND } from './layout.js';
import { GOLD } from './palette.js';

/**
 * The one place in this scene that is not on the storm's ramp or the land's.
 *
 * A terracotta roof and cream walls are warm, low-saturation and *domestic* — they belong to neither
 * the vortex nor the forest nor the temple, which is exactly why the house reads as a small ordinary
 * thing that has found itself in the wrong place. Six colours, used on one object, and nothing else
 * in the frame is allowed them.
 */
const ROOF = [201, 74, 24];
const ROOF_DARK = [138, 46, 15];
const WALL = [238, 224, 203];
const WALL_SHADE = [188, 170, 146];
const DOOR = [26, 44, 74];
/**
 * ...with one exception, and it is the palette's own.
 *
 * The windows are lit, and lamplight is exactly what `GOLD` is for — "fire, the finial, the light
 * inside glass". Four chunks per window is well inside the ration, and borrowing the accent here
 * rather than mixing a sixth private colour is what ties the house to the rest of the frame: the
 * same yellow burning in the kilns is burning in its windows.
 */
const LAMP = GOLD[1];

export function planHouse(rng) {
  return { seed: rng.range(0, 45), lean: rng.range(-0.35, 0.35) };
}

/**
 * Draw it, wherever the storm's foot happens to be.
 *
 * Drawn after the ground and before the funnel, so the column stands in front of it — the house is
 * *behind* the thing destroying it, which is the correct order and also the reason it never has to
 * be clipped.
 */
export function drawHouse(ctx, W, H, t, plan, funnel, px) {
  const groundY = Math.round((H * GROUND) / px) * px;
  const foot = vortexAt(W, H, t, funnel, 0);

  const half = Math.max(px * 4, Math.round((Math.min(W, H) * 0.06) / px) * px);
  const cols = Math.round(half / px);
  const wallRows = Math.max(5, Math.round(cols * 1.1));
  // Exactly enough rows to step the pitch in by one chunk a row — a true 45° roof, and the steepness
  // is what makes it a cottage rather than a barn. Derived rather than chosen twice over: a
  // proportional row count made the taper land on 11, 9, 7, 6, 4, 2, and a stepped roof with one
  // uneven step reads as a haystack; two chunks a row then stepped cleanly but only at 27°, which is
  // a shed. One chunk a row is the only ratio that is both regular and steep.
  const roofRows = cols + 2;

  // Beside the foot, not under it — a house directly on the axis is simply never visible. Offset by
  // its own half-width as well as by the funnel's radius, so a *wider* house does not end up further
  // inside the column: its near wall sits at a fixed distance from the flare however big it is.
  const cx = Math.round((foot.cx + foot.r * 1.15 + half * 1.05 + plan.lean * W * 0.02) / px) * px;

  // How much of it is left — and this cannot be a function of *distance*, which was the first thing
  // tried and is a category error: the house is always at the foot, so its distance to the storm is
  // a constant and a constant cannot dissolve anything. It came out at 0.03 standing at every power
  // and the house was simply never drawn.
  //
  // What varies is how hard the thing above it is blowing. So the house comes apart in the gusts and
  // knits back together in the lulls, on the storm's own breath — which is also the better picture:
  // a house being worried at, over and over, rather than one demolition that finishes.
  //
  // Asked of the storm directly. Deriving it from `r / wind` looked reasonable and was nonsense:
  // `wind` is defined *as* a multiple of `r`, so their ratio is very nearly constant and the house
  // came out at its floor at every strength — permanently rubble, and never once drawn whole.
  const power = powerAt(t);
  // The ceiling is above 1 on purpose: `wear` tops out at 1, so a ceiling of exactly 1 would leave
  // the top windward corner permanently half-eaten and the house would never once be seen whole.
  const standing = clamp(1.74 - power * 1.32, 0.05, 1.14);

  const roofCells = [];
  const roofDark = [];
  const wallCells = [];
  const wallShade = [];
  const doorCells = [];
  const lampCells = [];
  const stackCells = [];
  const stackCap = [];

  // Eaten from the windward side in, so which side goes depends on which side the storm is on.
  const windward = foot.cx < cx ? -1 : 1;
  const rows = wallRows + roofRows + 2;
  /**
   * Is this chunk gone yet?
   *
   * `r` counts up from the ground, so the weighting says the roof goes first — which is what a
   * tornado does to a house and, more to the point, is what a viewer can read at a glance. A house
   * that loses its middle is a house with a hole in it; a house that loses its roof is a house being
   * destroyed. The windward term then decides which *end* of the roof goes, so the damage always
   * points back at the storm.
   */
  const gone = (c, r) => {
    const side = (c * windward + cols) / (2 * cols);
    const up = r / rows;
    const wear = side * 0.38 + up * 0.62;
    // Ragged, not a clean cut: the edge of the damage is hashed per chunk so the house comes apart
    // in splinters rather than being sliced.
    return wear > standing + hash2(c * 2.7, r * 1.9 + plan.seed) * 0.2 - 0.1;
  };

  const put = (cells, c, r) => {
    if (gone(c, r)) return;
    cells.push(cx + c * px, groundY - (r + 1) * px, px, px);
  };

  // Walls: flat cream, with a plinth row at the ground and a shadow row under the eaves.
  //
  // Flat rather than modelled, and that took two tries. Shading the whole lee half made a house whose
  // walls were lit from one side and whose roof was a flat gable seen dead on, which is two
  // viewpoints in one object; shading the edge columns as well as the top and bottom then drew a
  // one-chunk border all the way round and the front read as a picture frame. The reference is a
  // plain cream front and it is plain for a reason — the form is carried entirely by the roof, and
  // the wall's job is to be quiet under it.
  for (let r = 0; r < wallRows; r += 1) {
    for (let c = -cols; c <= cols; c += 1) {
      put(r === 0 || r === wallRows - 1 ? wallShade : wallCells, c, r);
    }
  }

  // The door: one dark opening, centred, standing on the ground. The last thing to go, because it is
  // the lowest thing there is.
  const doorW = Math.max(1, Math.round(cols * 0.12));
  const doorH = Math.max(3, Math.round(wallRows * 0.62));
  for (let r = 0; r < doorH; r += 1) {
    for (let c = -doorW; c <= doorW; c += 1) put(doorCells, c, r);
  }

  // Two windows, four panes each: a lamp-coloured square crossed by a dark mullion. Three chunks is
  // the smallest a window can be and still read as a window rather than as a lit dot — the cross is
  // the whole tell, and it needs a middle to sit in.
  const winY = Math.max(2, Math.round(wallRows * 0.34));
  for (const at of [-Math.round(cols * 0.62), Math.round(cols * 0.62)]) {
    for (let r = 0; r < 3; r += 1) {
      for (let c = -1; c <= 1; c += 1) {
        put(c === 0 || r === 1 ? doorCells : lampCells, at + c, winY + r);
      }
    }
  }

  // The eave: one chunk wider than the walls on each side, in shadow, which is what makes the roof
  // read as sitting *on* the house rather than as a triangle continuing it.
  for (let c = -cols - 1; c <= cols + 1; c += 1) put(roofDark, c, wallRows);

  // The pitch: one chunk narrower every row, up to a single chunk of ridge, with a darker chunk at
  // each rake so the triangle has a drawn edge.
  const slopeAt = (r) => Math.max(0, cols + 1 - r);
  for (let r = 0; r < roofRows; r += 1) {
    const wide = slopeAt(r);
    for (let c = -wide; c <= wide; c += 1) {
      const rake = c === -wide || c === wide || r === roofRows - 1;
      put(rake ? roofDark : roofCells, c, wallRows + 1 + r);
    }
  }

  // A chimney off the lee slope, rising past the ridge. Two chunks of masonry and a cap: the detail
  // that turns a shed into a house faster than any other two chunks in the drawing.
  //
  // Its foot is *found* rather than picked — the lowest roof row whose slope still reaches out that
  // far. Choosing a row by proportion put the stack a chunk beyond the edge of the pitch at that
  // height and it floated in the sky beside the roof, attached to nothing.
  const stackAt = Math.max(2, Math.round(cols * 0.28)) * -windward;
  const stackOut = Math.max(Math.abs(stackAt), Math.abs(stackAt + 1));
  let stackRow = 0;
  while (stackRow + 1 < roofRows && slopeAt(stackRow + 1) >= stackOut) stackRow += 1;
  for (let r = stackRow; r <= roofRows; r += 1) {
    for (let c = 0; c < 2; c += 1) {
      put(r === roofRows ? stackCap : stackCells, stackAt + c, wallRows + 1 + r);
    }
  }

  // The stack goes on last, over the roof. Emitted into the wall's bucket it was painted *before*
  // the rake it passes behind, and came out one chunk wide for a row and two the next, as if the
  // chimney were growing out of the tiles rather than through them.
  for (const [cells, colour] of [
    [wallShade, WALL_SHADE], [wallCells, WALL], [doorCells, DOOR], [lampCells, LAMP],
    [roofDark, ROOF_DARK], [roofCells, ROOF], [stackCells, WALL_SHADE], [stackCap, ROOF_DARK],
  ]) {
    if (!cells.length) continue;
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 4) chunk(ctx, cells[i], cells[i + 1], cells[i + 2], cells[i + 3], px);
    ctx.fill();
  }
}
