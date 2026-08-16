// The town: a row of wooden fronts across the square, and the doors that answer to the wind.
//
// **The facades are false and that is the joke of the architecture.** An old-timey western front is
// a flat board nailed to the top of a small building to make it look like a big one — the whole
// street is a set even when it is real — so the town here is drawn as exactly that: a rectangle, a
// parapet on top of it, and a shadowed gap behind the parapet where the actual roof is a foot lower.
// It costs three rectangles a building and it is the one detail that makes a row of boxes read as a
// frontier street rather than as a row of boxes.
//
// Everything is drawn through `inBands`, so a two-storey saloon is one building rendered at three
// different resolutions and in three different palettes at once, with hard boundaries across it. The
// silhouette is what survives: the geometry does not change from band to band, only the grid it is
// quantised to and the ramp it is coloured out of. That is the whole reason the town is built out of
// axis-aligned blocks and nothing else — a shape with a diagonal in it would come apart at every
// boundary, and the picture would stop being a town.

import { hash2 } from '../../effects/field.js';
import { chunkIn, inBands, inkOf } from './strata.js';
import { gustAt, windHere } from './wind.js';

/** Where the boardwalk sits, as a fraction of the frame. The square is everything below it. */
export const STREET = 0.66;

/** ...and the skyline the fronts are hung from. */
const EAVE = 0.22;

/**
 * The buildings, laid out once.
 *
 * A **street is a rhythm**, so the widths come from a short repeating figure rather than from free
 * random numbers: wide, narrow, wide, wide, narrow. Rolled independently you get a row with no
 * cadence, which reads as a bar chart of buildings; and the two-storey ones have to be *placed*
 * rather than sampled, because the tallest thing in a western street is the saloon and it belongs
 * near the middle where the eye goes.
 */
export function planTown(rng) {
  const FIGURE = [1.35, 0.78, 1.15, 1.28, 0.72, 1.05];
  const fronts = [];
  let at = -0.08;
  for (let i = 0; at < 1.1; i += 1) {
    const wide = FIGURE[i % FIGURE.length] * 0.14;
    fronts.push({
      at,
      wide,
      // Two storeys near the middle of the row, one at the ends. The saloon is the tall one with the
      // doors in it, and there is exactly one — a street with three saloons is a theme park.
      tall: Math.abs(at + wide / 2 - 0.46) < 0.18 ? rng.range(0.62, 0.78) : rng.range(0.34, 0.5),
      // How the parapet is cut: flat, stepped, or a shallow gable. Three shapes is plenty; the
      // silhouette of a street is made by the *sequence*, not by the invention in any one of them.
      crown: rng.int(0, 2),
      // Windows: how many, and whether the ground floor is a shopfront or a door.
      lights: rng.int(1, 3),
      shop: rng.next() < 0.55,
      seed: rng.range(0, 40),
      post: rng.next() < 0.7,
    });
    at += wide + rng.range(0.004, 0.02);
  }
  // The saloon is the tallest front nearest the middle, and it is the only one with swinging doors.
  let saloon = 0;
  for (let i = 1; i < fronts.length; i += 1) {
    const better = fronts[i].tall > fronts[saloon].tall
      || (fronts[i].tall === fronts[saloon].tall && Math.abs(fronts[i].at - 0.46) < Math.abs(fronts[saloon].at - 0.46));
    if (better) saloon = i;
  }
  fronts[saloon].saloon = true;
  return { fronts, saloon };
}

/**
 * How far the saloon's doors are swung open, from −1 to 1, as one number.
 *
 * The brief asks for doors that *blow open and closed with the changes in the wind*, and the useful
 * word is **changes**: a door that tracked the gust would sit half open in a steady blow, which is
 * not what a door does. A café door on a spring has a rest position and gets *knocked* off it, so
 * this is the wind's own turbulence — a fast field on top of the slow gust — with the gust as the
 * amplitude. In still air the doors are shut; in a gust they clatter, harder and faster.
 *
 * The two leaves swing together rather than mirroring, because they are hung on the same jamb and a
 * gust pushes both the same way. What makes them read as a *pair* is that the near one is drawn over
 * the far one and lags it by a fraction of a second.
 */
export function swingAt(t, lag = 0) {
  const gust = gustAt(t - lag);
  const knock = Math.sin((t - lag) * 3.7) * 0.6 + Math.sin((t - lag) * 6.1 + 1.4) * 0.4;
  const rattle = Math.sin((t - lag) * 11.3 + 0.9) * 0.25;
  return (knock + rattle * gust) * gust * 1.35;
}

export function drawTown(ctx, W, H, t, plan, base, tune) {
  const gust = gustAt(t);
  const streetY = H * STREET;

  inBands(H, t, plan.strata, gust, base, (strata, top, bottom, px) => {
    if (top > streetY) return;

    // Five passes over the row, one per ramp step, so a band is five fills however many buildings
    // it crosses. Bodies in two tones, then the dark seams and shadow, then the crown, then glass.
    //
    // **Two body tones, alternating along the row**, and it is the difference between a street and a
    // wall. Drawn in one step the fronts merge into a single mass the moment two of them are the
    // same height — which they often are — and the row stops being buildings. Alternating gives
    // every pair of neighbours a hard edge for free, without a seam to draw or a gap to leave.
    for (const [step, part] of [[1, 'body'], [2, 'other'], [0, 'under'], [3, 'crown'], [4, 'light']]) {
      ctx.fillStyle = inkOf(strata, step);
      ctx.beginPath();
      let drew = false;

      for (const front of plan.fronts) {
        const x = front.at * W;
        const w = front.wide * W;
        const headY = streetY - front.tall * H * (1 - EAVE) * tune.rise;
        const parapet = Math.max(px, H * 0.02);

        if (part === 'body' || part === 'other') {
          if ((plan.fronts.indexOf(front) % 2 === 0) !== (part === 'body')) continue;
          drew = chunkIn(ctx, x, headY, w, streetY - headY, top, bottom, px) || drew;
        } else if (part === 'under') {
          // A dark seam down the near side of every front, so even two neighbours on the same tone
          // have a line between them. One chunk wide: any more and it is a gap, not a joint.
          drew = chunkIn(ctx, x, headY, px, streetY - headY, top, bottom, px) || drew;
          // The shadow gap behind the false front, and the boardwalk's own shade under the awning.
          drew = chunkIn(ctx, x, headY + parapet, w, parapet * 0.55, top, bottom, px) || drew;
          drew = chunkIn(ctx, x, streetY - H * 0.018, w, H * 0.018, top, bottom, px) || drew;
        } else if (part === 'crown') {
          // The parapet, cut three ways. Flat, stepped, or gabled — as blocks, never as a diagonal.
          if (front.crown === 0) {
            drew = chunkIn(ctx, x, headY, w, parapet, top, bottom, px) || drew;
          } else if (front.crown === 1) {
            drew = chunkIn(ctx, x, headY, w, parapet, top, bottom, px) || drew;
            drew = chunkIn(ctx, x + w * 0.24, headY - parapet * 0.6, w * 0.52, parapet * 0.6, top, bottom, px) || drew;
          } else {
            for (let i = 0; i < 3; i += 1) {
              const inset = w * (0.1 * i);
              drew = chunkIn(ctx, x + inset, headY - parapet * 0.42 * i, w - inset * 2, parapet, top, bottom, px) || drew;
            }
          }
          // The awning posts down to the boardwalk: the one vertical rhythm in the whole street.
          if (front.post) {
            const postW = Math.max(px, w * 0.035);
            for (const side of [0.04, 0.94]) {
              drew = chunkIn(ctx, x + w * side, streetY - H * 0.09, postW, H * 0.09, top, bottom, px) || drew;
            }
          }
        } else {
          // Glass. Lit from inside even at noon, because a dark hole in a bright wall is a hole.
          const lit = front.lights;
          const winH = H * 0.045;
          const winY = headY + parapet * 2.2;
          for (let i = 0; i < lit; i += 1) {
            const wx = x + w * (0.18 + (i * 0.64) / Math.max(1, lit));
            if (hash2(front.seed + i, 3.1) > 0.22) {
              drew = chunkIn(ctx, wx, winY, w * 0.16, winH, top, bottom, px) || drew;
            }
          }
          if (front.shop && !front.saloon) {
            drew = chunkIn(ctx, x + w * 0.2, streetY - H * 0.075, w * 0.6, H * 0.055, top, bottom, px) || drew;
          }
        }
      }
      if (drew) ctx.fill();
    }
  });

  drawDoors(ctx, W, H, t, plan, base, gust, tune);
}

/**
 * The saloon's swinging doors.
 *
 * Drawn after the town and *not* through `inBands` as a shape: a door is small enough to sit inside
 * one band almost always, and cutting a moving object across a resolution boundary is where the
 * strata stop reading as strata and start reading as a tear. It takes the band its own top edge
 * falls in and commits — the one thing in the scene that is allowed to.
 */
function drawDoors(ctx, W, H, t, plan, base, gust, tune) {
  const front = plan.fronts[plan.saloon];
  const streetY = H * STREET;
  const doorH = H * 0.085;
  const doorY = streetY - doorH;
  const midX = (front.at + front.wide / 2) * W;
  const leafW = front.wide * W * 0.19;

  inBands(H, t, plan.strata, gust, base, (strata, top, bottom, px) => {
    if (bottom < doorY || top > streetY) return;

    // The dark of the doorway behind them, so a door that swings wide reveals an inside.
    ctx.fillStyle = inkOf(strata, 0);
    ctx.beginPath();
    let drew = chunkIn(ctx, midX - leafW * 1.05, doorY, leafW * 2.1, doorH, top, bottom, px);
    if (drew) ctx.fill();

    for (const [lag, step] of [[0.18, 2], [0, 3]]) {
      const swing = swingAt(t, lag) * tune.swing;
      ctx.fillStyle = inkOf(strata, step);
      ctx.beginPath();
      drew = false;
      for (const side of [-1, 1]) {
        // A swing is a rotation, and this draws it as a *narrowing* — the leaf foreshortens as it
        // turns away and slides across the jamb. Two rectangles, no trigonometry beyond a cosine,
        // and at this chunk size the difference between that and a real hinge is nothing.
        const open = swing * side * 0.5 + swing * 0.5;
        const wide = leafW * Math.max(0.12, Math.cos(open * 1.3));
        const shift = side * leafW * 0.52 + open * leafW * 0.55;
        drew = chunkIn(ctx, midX + shift - wide / 2, doorY, wide, doorH, top, bottom, px) || drew;
      }
      if (drew) ctx.fill();
    }
  });
}

/** How hard the air is moving at the boardwalk, for anything standing on it. */
export const streetWind = (x, t) => windHere(x, STREET, t);
