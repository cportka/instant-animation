// The dissolve: what it looks like when one animation re-arranges itself.
//
// This is the *second* kind of change in the gallery and it is deliberately unlike the first. Moving
// between animations is a channel change — two scenes pushed past each other, the picture wrecked at
// the join, and you arrive somewhere else. Moving between compositions of one animation is not going
// anywhere: it is the same picture, put together differently. Pushing it past a near-copy of itself
// says "you have travelled" about something that has not moved, so the composition change **dissolves
// in place** instead. Nothing slides. The old arrangement stops being there and the new one is.
//
// Like the channel change, the style belongs to the scene — `meta.dissolve` — because a dissolve
// drawn in one animation's language sitting on another is a control bolted to the picture.
//
// The mechanism is one idea: **the outgoing composition is frozen once, and then it rots.** The stage
// captures the last frame of the old arrangement into a scratch layer at the moment the change
// starts and never captures again, so what persists on screen is a genuinely stale picture — not a
// second scene still being drawn, which would cost twice as much and, worse, would keep *moving* and
// so would read as a cross-fade between two live things rather than as one of them going off.

import { clamp } from '../lib/draw.js';
import { deviceScale } from './vhs.js';
import { bayerOn, hash01, pixelSize, snap } from './pixel.js';

/** Every dissolve a scene may ask for by name. `meta.dissolve` must be one of these. */
export const DISSOLVES = ['mosh', 'updraft', 'bleach'];

/**
 * Dissolve the frozen composition away, revealing the one already drawn underneath.
 *
 * @param {string} kind      the scene's `meta.dissolve`
 * @param {number} progress  0 at the start of the change, 1 when the old arrangement is gone
 */
export function dissolve(kind, ctx, W, H, progress, t, tape) {
  if (progress <= 0 || progress >= 1 || !tape) return;
  if (kind === 'updraft') updraftDissolve(ctx, W, H, progress, t, tape);
  else if (kind === 'bleach') bleachDissolve(ctx, W, H, progress, tape);
  else moshDissolve(ctx, W, H, progress, t, tape);
}

/**
 * *The Rose Funnel*: the storm takes the arrangement away.
 *
 * The scene's two compositions differ by what is standing in front of the tornado, so the change
 * between them is the tornado doing the only thing it does — and the useful part is that it is a
 * **different verb from the channel change into this same scene**, which also uses a vortex. That
 * one *winds* the frame: rows slide coherently around an axis and the picture stays whole while it
 * is twisted. This one **picks the picture up**. Chunks leave the ground, spiral in toward the axis,
 * and climb out of the top of the frame, and each one is gone the moment it has climbed far enough.
 * Winding is a force applied to something still there; lifting is that thing being carried off.
 *
 * Two details do the work. The order of leaving is **by distance from the axis** rather than hashed:
 * what is nearest the column goes first and the corners are the last to be pulled loose, so it reads
 * as suction rather than as decay. And a chunk's climb is squared in its own age, so nothing moves
 * for a moment and then the whole field goes up at once — which is the profile of being caught by
 * something rather than of falling apart.
 */
function updraftDissolve(ctx, W, H, progress, t, tape) {
  const px = pixelSize(W, H);
  // A much coarser block than the scene draws in, because this is the picture being *handled*
  // rather than the picture being drawn. At a chunk near the size of the art's own the frame comes
  // apart into confetti and reads as the picture dissolving; at six of them a piece is big enough
  // to still have something recognisable on it while it is carried off, which is the difference
  // between a picture being taken away and a picture falling apart.
  const block = px * 6;
  const cols = Math.ceil(W / block);
  const rows = Math.ceil(H / block);
  const scale = deviceScale(ctx, W, H);
  const stale = tape.of('stale');
  if (!stale?.width) return;

  // Where the column is standing. The funnel marches, but a dissolve lasts about a second and the
  // march is on a sixty-second clock, so the axis is taken once and held — a suction point that
  // slides while it is sucking would be a second motion nobody asked for.
  const axis = W * 0.5;
  const reach = Math.hypot(W * 0.5, H * 0.5);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * block;
      const y = r * block;
      // Nearest the axis first, with a little hashed scatter so the front of the suction is ragged
      // rather than a circle closing in — a clean expanding ring is a wipe, not a wind.
      const away = Math.hypot(x + block * 0.5 - axis, y + block * 0.5 - H) / reach;
      const gives = clamp(away * 0.82 + hash01(c * 4.19 + r * 9.13) * 0.3, 0, 1);
      if (gives < progress) continue;

      const held = clamp(progress / Math.max(0.001, gives), 0, 1);
      const lift = held * held;
      // In toward the axis and up out of the frame — the two halves of an updraft. The inward pull
      // is proportional to how far off-axis the chunk is, so the whole field converges rather than
      // shearing, and the climb is the same for everything because a column lifts what it has.
      const dx = snap((axis - x) * 0.55 * lift, px);
      const dy = snap(-H * 1.15 * lift, px);
      // ...and it turns as it goes. One shared angle rather than a per-chunk spin: it is one vortex.
      const turn = lift * 2.4 + t * 0.6;
      const swirl = snap(Math.sin(turn + away * 5.5) * block * 2.6 * lift, px);

      ctx.drawImage(
        stale,
        Math.round(x * scale.sx), Math.round(y * scale.sy),
        Math.max(1, Math.round(Math.min(block, W - x) * scale.sx)),
        Math.max(1, Math.round(Math.min(block, H - y) * scale.sy)),
        x + dx + swirl, y + dy,
        Math.min(block, W - x), Math.min(block, H - y),
      );
    }
  }
}

/** The nine bands the square cuts itself into, and the two inks its drawn composition uses. */
const BLEACH_BANDS = 9;
const PAPER = '#ffffff';
const RULE = '#101010';

/**
 * *The Square at Noon*: the colour drains out and the drawing is left behind.
 *
 * The scene's two compositions are the same square **painted** and the same square **drawn**, so the
 * change between them is the one verb that turns either into the other: the colour goes and the
 * structure stays. It is deliberately a different verb from the channel change into this animation,
 * which also works in the scene's nine bands — that one *deals* the frame, dropping each band to its
 * own resolution and washing it toward its own ramp, so it ends up looking like more of the picture.
 * This one takes the picture away and leaves the paper.
 *
 * Three things, in the order you notice them.
 *
 * **The bands go one at a time.** Each has its own share of the change, staggered top to bottom, so
 * the paper arrives as a front sweeping down the frame rather than as a fade — a fade over the whole
 * picture is a cross-dissolve, which says the two arrangements are two pictures. They are one.
 *
 * **The wash is dithered, not alpha.** This animation has no soft edges anywhere in it, and a
 * white sheet at forty per cent opacity is a soft edge over the entire frame. Punching the paper
 * through on the ordered matrix keeps every value in the change one of the two the composition it
 * is heading toward is allowed.
 *
 * **A rule is left along every boundary, and it thickens.** The bands are what the scene is made of,
 * and as the colour goes they are the last thing still saying so — by the end the frame is white
 * with nine dark lines ruled across it, which is a drawing of the strata, and then the drawing of
 * the square arrives underneath.
 */
function bleachDissolve(ctx, W, H, progress, tape) {
  const px = pixelSize(W, H);
  const cols = Math.ceil(W / px) + 1;

  for (let n = 0; n < BLEACH_BANDS; n += 1) {
    const top = Math.round((n / BLEACH_BANDS) * H);
    const bottom = Math.round(((n + 1) / BLEACH_BANDS) * H);
    const rows = Math.max(1, Math.round((bottom - top) / px));
    // Its own share of the change: band `n` starts when the one above it is half gone, so the front
    // travels down the frame at a little under twice the speed the whole change runs at.
    const start = (n / BLEACH_BANDS) * 0.55;
    const gone = clamp((progress - start) / (1 - start), 0, 1);
    if (gone <= 0) continue;

    ctx.fillStyle = PAPER;
    ctx.beginPath();
    for (let r = 0; r < rows; r += 1) {
      const y = top + r * px;
      // Squared, so a band holds almost everything for the first half of its share and then goes.
      const density = gone * gone;
      for (let c = 0; c < cols; c += 1) {
        if (bayerOn(c, r, density)) ctx.rect(c * px, y, px, px);
      }
    }
    ctx.fill();

    // ...and the rule the band leaves behind, growing as the colour goes.
    const rule = Math.max(1, Math.round(px * gone * 1.6));
    ctx.fillStyle = RULE;
    ctx.fillRect(0, top, W, rule);
  }
}

/**
 * *Westbound on Grizzly Peak*: the picture is a compressed stream and the stream has lost its
 * keyframe.
 *
 * A datamosh is not noise, and that is the whole thing to get right. It is what a block-based codec
 * does when it is handed motion vectors with nothing to apply them to: the macroblocks it still has
 * keep being re-used, keep being pushed along by whatever motion the stream last described, and
 * smear across the picture in coherent slabs while the blocks it has given up on snap to whatever
 * arrived underneath. So the two behaviours here are **persistence** and **drift**, and neither of
 * them is random per frame — a block that is stale stays stale, and it travels in one direction for
 * as long as it lasts. Re-rolling either one every frame gives you television static, which is a
 * different artefact belonging to a different decade.
 *
 * Blocks are given up in a hashed order rather than all at once, so the picture goes in patches;
 * and the drift accelerates as the block ages, so the last survivors are the ones streaked furthest.
 */
function moshDissolve(ctx, W, H, progress, t, tape) {
  const px = pixelSize(W, H);
  // Macroblocks, not chunks. The codec this is imitating worked in blocks of sixteen, and a mosh
  // built on single pixels is a dissolve — the coarse block *is* the tell.
  const block = px * 6;
  const cols = Math.ceil(W / block);
  const rows = Math.ceil(H / block);
  const scale = deviceScale(ctx, W, H);
  const stale = tape.of('stale');
  if (!stale?.width) return;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      // When this block gives up. Hashed per block and constant for the whole change, so a block
      // that has gone stays gone — the picture rots in patches instead of boiling.
      const gives = hash01(c * 7.31 + r * 3.17);
      if (gives < progress) continue;

      // How long it has been holding on, as its own 0..1. The drift is squared in it, so a block
      // barely moves at first and the last few are streaked right across the frame.
      const held = clamp((progress - 0) / Math.max(0.001, gives), 0, 1);
      const dir = hash01(c * 1.93 + r * 11.7) - 0.5;
      const lift = hash01(c * 5.11 + r * 2.3) - 0.5;
      const dx = snap(dir * block * 5 * held * held, px);
      const dy = snap(lift * block * 2.2 * held * held, px);

      const sx = Math.round(c * block * scale.sx);
      const sy = Math.round(r * block * scale.sy);
      const sw = Math.max(1, Math.round(Math.min(block, W - c * block) * scale.sx));
      const sh = Math.max(1, Math.round(Math.min(block, H - r * block) * scale.sy));
      // A block that is being dragged is also being *stretched* — the codec is re-using one block to
      // cover ground the motion vector says it should have moved across. Stretching along the drift
      // only, so the smear has a direction rather than a bloom.
      const grow = 1 + held * held * 2.4 * Math.abs(dir);
      ctx.drawImage(
        stale,
        sx, sy, sw, sh,
        c * block + dx, r * block + dy,
        Math.min(block, W - c * block) * grow, Math.min(block, H - r * block),
      );
    }
  }
}
