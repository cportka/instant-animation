// One bit: two colours, and a rasteriser written out longhand.
//
// Every other grid in this gallery is a *style* — a canvas that could draw anything, held to a
// coarse grid and a short palette because that is what the picture wants. This one is a
// **constraint**, and the difference is the whole reason the file exists.
//
// A canvas anti-aliases. Ask it to fill a triangle and the edge comes back as a row of greys, which
// is exactly right for almost everything and fatal for a picture that has decided it owns two
// colours. There is no flag to turn that off. So the only way to get a genuinely one-bit frame is to
// never hand the canvas a diagonal at all: decide, in your own code, which cells of a grid are
// inside the shape, and fill those cells as axis-aligned rectangles. That is `scanFill` — a
// scanline polygon rasteriser, even-odd, with holes, in about forty lines.
//
// The second half of it is the grid. Snapping to whole CSS pixels is not enough: on a display at
// 1.5× a CSS-integer edge lands halfway through a device pixel and the browser resolves that the
// only way it can, with a grey. So `cellFor` returns a cell that is a whole number of **device**
// pixels, which makes every rectangle boundary in the frame a real hardware boundary at any ratio.
// Then the frame contains `#000000` and `#ffffff` and nothing between them — not as a claim about
// the palette, but as a property of the output.

/** The two colours. There are no others, and that is the entire point. */
export const VOID = '#000000';
export const INK = '#ffffff';

/**
 * The size of one device pixel, in the CSS pixels a scene draws in.
 *
 * The stage has already applied `setTransform(dpr, 0, 0, dpr, 0, 0)`, so a scene never sees the
 * ratio it is being drawn at. This recovers it from the backing store, which is the one place it is
 * still written down.
 */
export function finestOf(ctx, W) {
  const wide = ctx.canvas ? ctx.canvas.width : 0;
  const scale = wide && W ? wide / W : 1;
  return 1 / (scale > 0 ? scale : 1);
}

/**
 * One cell of the grid, in CSS pixels — as near `across` cells to the short edge as a **whole
 * number of device pixels** allows.
 *
 * Tied to the short edge for the same reason every other grid here is: the art should be the same
 * coarseness on a phone and on a monitor, not the same number of cells. Rounded to device pixels
 * because that is what keeps the two colours to two.
 */
export function cellFor(ctx, W, H, across) {
  const finest = finestOf(ctx, W);
  const steps = Math.round(Math.min(W, H) / across / finest);
  return finest * (steps > 1 ? steps : 1);
}

/** Snap to the grid. Anything drawn off it is a soft edge waiting to happen. */
export const snapTo = (v, cell) => Math.round(v / cell) * cell;

/** Scratch for one row's crossings. Small, reused, and never escapes a call. */
const CROSS = new Float64Array(64);

/**
 * Rasterise a set of closed rings onto the cell grid and append the covered cells to the open path.
 * Caller sets `fillStyle`, opens the path and fills — so a whole slice is one `fill()`.
 *
 * **Even-odd**, which is what gets holes for free: a ring inside another ring is a hole, a ring
 * inside that one is solid again, and no special case is written anywhere. Rings are flat arrays of
 * `x, y, x, y…` in CSS pixels and are closed implicitly.
 *
 * A cell is filled when its **centre** is inside the shape. That is the whole of the sampling rule,
 * and it is worth stating because it is what makes the edges jagged in the honest way: a shape
 * smaller than a cell can miss every centre and vanish, exactly as it would on hardware that had
 * only these cells to spend.
 *
 * @returns {number} how many rectangles were appended — zero means the shape fell between the cells
 */
export function scanFill(ctx, rings, cell, W, H) {
  let top = Infinity;
  let bottom = -Infinity;
  for (const ring of rings) {
    if (ring.length < 6) continue;
    for (let i = 1; i < ring.length; i += 2) {
      if (ring[i] < top) top = ring[i];
      if (ring[i] > bottom) bottom = ring[i];
    }
  }
  if (!(top < bottom)) return 0;

  const lastRow = Math.ceil(H / cell) - 1;
  const lastCol = Math.ceil(W / cell) - 1;
  let row = Math.floor(top / cell);
  if (row < 0) row = 0;
  let stop = Math.floor(bottom / cell);
  if (stop > lastRow) stop = lastRow;

  let drawn = 0;
  for (; row <= stop; row += 1) {
    const y = (row + 0.5) * cell;
    let n = 0;
    for (const ring of rings) {
      const len = ring.length;
      if (len < 6) continue;
      for (let i = 0; i < len; i += 2) {
        const ay = ring[i + 1];
        const j = i + 2 < len ? i + 2 : 0;
        const by = ring[j + 1];
        // Half-open in y, so a vertex exactly on the sample line counts once rather than twice and
        // the span cannot invert. Horizontal edges fall out of this test by themselves.
        if ((ay <= y) === (by <= y)) continue;
        if (n >= CROSS.length) break;
        const ax = ring[i];
        CROSS[n] = ax + ((y - ay) / (by - ay)) * (ring[j] - ax);
        n += 1;
      }
    }
    if (n < 2) continue;

    // Insertion sort: n is at most a couple of dozen and usually four, and `Array#sort` on a
    // subarray would allocate on every row of every slice of every frame.
    for (let i = 1; i < n; i += 1) {
      const v = CROSS[i];
      let j = i - 1;
      while (j >= 0 && CROSS[j] > v) {
        CROSS[j + 1] = CROSS[j];
        j -= 1;
      }
      CROSS[j + 1] = v;
    }

    for (let i = 0; i + 1 < n; i += 2) {
      let lo = Math.ceil(CROSS[i] / cell - 0.5);
      let hi = Math.floor(CROSS[i + 1] / cell - 0.5);
      if (lo < 0) lo = 0;
      if (hi > lastCol) hi = lastCol;
      if (hi < lo) continue;
      ctx.rect(lo * cell, row * cell, (hi - lo + 1) * cell, cell);
      drawn += 1;
    }
  }
  return drawn;
}

/** One cell, for a shape that came out smaller than the grid and would otherwise blink out. */
export function speck(ctx, x, y, cell) {
  ctx.rect(snapTo(x - cell / 2, cell), snapTo(y - cell / 2, cell), cell, cell);
}
