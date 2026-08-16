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
import { bandAt, powerAt, vortexAt } from './funnel.js';
import { GROUND } from './layout.js';
import { GOLD, SPIN } from './palette.js';

/**
 * The house's own colours — and they are the **storm's**, warmed.
 *
 * The first version was terracotta and cream, on the argument that a domestic palette belonging to
 * nothing else in the frame is what makes the house read as a small ordinary thing in the wrong
 * place. That is a good argument for a house standing in a field, and this one is not: it is at the
 * foot of the tornado, it goes where the tornado goes, and it is being taken. A separate palette said
 * "a house the storm is passing" when the picture wanted "a house the storm is *making part of
 * itself*".
 *
 * So every colour here sits on `SPIN`, nudged warm and a little desaturated — enough that the roof is
 * still a roof and the walls are still walls, not enough that it is ever a different substance from
 * the thing standing over it. `DOOR` is the storm's own darkest step outright, which is what turns a
 * doorway into a hole rather than a navy rectangle.
 */
const ROOF = [206, 74, 106];
const ROOF_DARK = [140, 40, 84];
const WALL = [246, 200, 218];
const WALL_SHADE = [198, 142, 176];
const DOOR = SPIN[6];
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
  const power = powerAt(t, funnel);
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
  const wearAt = (c, r) => ((c * windward + cols) / (2 * cols)) * 0.38 + (r / rows) * 0.62;
  const gone = (c, r) => (
    // Ragged, not a clean cut: the edge of the damage is hashed per chunk so the house comes apart
    // in splinters rather than being sliced.
    wearAt(c, r) > standing + hash2(c * 2.7, r * 1.9 + plan.seed) * 0.2 - 0.1
  );

  // ...and one bucket per ramp step, for the chunks the storm has already claimed.
  const taken = SPIN.map(() => []);

  /**
   * How far into the tornado a chunk has got.
   *
   * The house is not a building the storm is knocking bits off, it is a building the storm is
   * **turning into more storm**, and that has to be visible in the colour and not only in the holes.
   * A claimed chunk stops being house and shows whatever the funnel's surface is showing at that
   * point on screen — the same helix from the same function, so the bands run *through* the house and
   * out the other side.
   *
   * It is a **frontier**, not a wash: the same `wear` that decides where the holes are, read from
   * just below the threshold, so the claimed chunks are the band immediately ahead of the damage and
   * the whole thing sweeps across the house as the storm gets up. Spreading it evenly over the
   * building was the first try and it dissolved the house outright at forty percent claimed — the
   * silhouette went, and a house you cannot make out is not being absorbed by anything, it is absent.
   *
   * Hashed rather than mixed, because a mix is a gradient and there is not one in this scene. Chunk
   * by chunk the house changes hands, ragged in exactly the way the damage is.
   */
  const claim = (c, r) => clamp((wearAt(c, r) - standing + 0.4) / 0.4, 0, 1);

  const put = (cells, c, r) => {
    if (gone(c, r)) return;
    const x = cx + c * px;
    const y = groundY - (r + 1) * px;
    if (hash2(c * 1.31 + plan.seed, r * 2.17) < claim(c, r)) {
      // Its own sweep across the drum, held off the silhouette so the limb darkening never runs to
      // the bottom of the ramp — this is the *foot* of the storm, where the dust is lit, and a house
      // dissolving into near-black would read as being deleted rather than taken.
      taken[bandAt(W, H, t, funnel, (c / cols) * 0.8, y)].push(x, y);
      return;
    }
    cells.push(x, y, px, px);
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
  // The claimed chunks first, so the house's own surviving fabric is drawn over them rather than
  // under: what is left of the building has to be in front of what it is dissolving into.
  for (let step = 0; step < SPIN.length; step += 1) {
    if (!taken[step].length) continue;
    ctx.fillStyle = rgba(SPIN[step], 1);
    ctx.beginPath();
    for (let i = 0; i < taken[step].length; i += 2) chunk(ctx, taken[step][i], taken[step][i + 1], px, px, px);
    ctx.fill();
  }

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
