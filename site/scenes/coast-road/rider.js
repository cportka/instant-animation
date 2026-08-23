// The bike, and the rider in shiny purple gear from head to toe.
//
// **"Shiny" on hardware that cannot draw a gradient is a hard-edged band that moves.** That is the
// whole of it, and it is why the gear ramp in `palette.js` is seven steps long while nothing else in
// the scene needs more than five: a highlight has to be two or three steps above the local tone to
// read as one, and a short ramp has nowhere to put it. Gloss is not a softer edge, it is a *brighter
// step in a smaller place*, and it moves when the light does.
//
// So the highlight is a vertical band swept across the bike by `lightAt` — the same function the
// road's wet sheen and the tank's chrome read. As a lamp comes up the band slides from the nose back
// along the tank, over the shoulder and off the tail, and every purple surface it crosses jumps a
// couple of steps and drops back. Nothing here decides on its own when to be bright: the rider is lit
// by the road he is on, which is what makes him belong to it rather than sit on top of it.
//
// The parts are a list rather than a bitmap. A motorcycle at this size is twenty-odd rectangles and
// four discs, and written out as a grid it would be four hundred characters nobody could edit; as
// parts, each one carries its own ramp step and its own **gloss**, which is what the highlight needs
// to know. Leather is glossier than a tyre, a visor is glossier than either.

import { clamp, lerp, wave } from '../../lib/draw.js';
import { bayerOn, chunk, ditherGlow, snap } from '../../effects/pixel.js';
import { lightAt, paceAt } from './world.js';
import { ly, lz } from './road.js';
import { lineAt } from './traffic.js';

/** The design box the parts are laid out in: rear tyre to headlight, ground to helmet. */
const BOX_W = 26;
const BOX_H = 24;

/** How long the bike is drawn, in world units. Longer than its clearance box — a rider overhangs. */
const DRAWN = 15;

/** Which ramp a part is drawn out of: the rider's gear, the machine's paint, or bare material. */
const GEAR = 0;
const HARD = 1;
const SHELL = 2;

/**
 * The machine and the man, back to front.
 *
 * `step` indexes the part's own ramp, `gloss` is how much the moving highlight is allowed to lift it.
 * Rubber takes none of it, painted metal takes some, and the gear takes all — which is the ordering
 * that makes the rider read as the shiny thing in a picture that also contains chrome.
 */
const PARTS = [
  // ---- the machine, low and long, so the rider sits visibly *on* it rather than in it ----
  { x: 5, y: 4, w: 7.4, h: 2.2, ramp: HARD, tone: 'steel', gloss: 0.2 },
  { x: 11, y: 2.8, w: 8.4, h: 1.8, ramp: HARD, tone: 'chrome', gloss: 0.9 },
  { disc: true, x: 5.4, y: 4.5, r: 4.5, ramp: HARD, tone: 'tyre', gloss: 0 },
  { disc: true, x: 21, y: 4.5, r: 4.5, ramp: HARD, tone: 'tyre', gloss: 0 },
  { disc: true, x: 5.4, y: 4.5, r: 1.8, ramp: HARD, tone: 'rim', gloss: 0.7 },
  { disc: true, x: 21, y: 4.5, r: 1.8, ramp: HARD, tone: 'rim', gloss: 0.7 },
  { x: 9, y: 4.6, w: 8, h: 4, ramp: HARD, tone: 'steel', gloss: 0.3 },
  { x: 19.4, y: 4.5, w: 2.2, h: 6.6, ramp: HARD, tone: 'chrome', gloss: 0.8 },
  // Painted bodywork, in amber rather than in the rider's purple. The tank is the biggest flat panel
  // on a motorcycle and takes the moving highlight better than anything else in the frame.
  { x: 12, y: 8.4, w: 7.2, h: 3.6, ramp: SHELL, step: 4, gloss: 1 },
  { x: 5.6, y: 8.4, w: 6.6, h: 3, ramp: SHELL, step: 2, gloss: 0.6 },
  { x: 3.6, y: 10, w: 3.4, h: 3.6, ramp: SHELL, step: 3, gloss: 0.8 },
  { x: 17.8, y: 6.8, w: 6.2, h: 6.2, ramp: SHELL, step: 3, gloss: 0.9 },
  { x: 22.4, y: 9.4, w: 2.6, h: 2.6, ramp: HARD, tone: 'lamp', gloss: 0 },
  // ---- the rider, foot to helmet, crouched forward over the tank ----
  { x: 10.4, y: 3.4, w: 3.6, h: 2.4, ramp: GEAR, step: 0, gloss: 0.6 },
  { x: 11, y: 5.6, w: 2.6, h: 4, ramp: GEAR, step: 2, gloss: 0.8 },
  { x: 11.4, y: 9.4, w: 4.2, h: 3.6, ramp: GEAR, step: 4, gloss: 1 },
  { x: 8, y: 12, w: 5.2, h: 3.2, ramp: GEAR, step: 3, gloss: 0.9 },
  { x: 5.8, y: 13, w: 5.2, h: 4.2, ramp: GEAR, step: 1, gloss: 0.7 },
  { x: 8, y: 16, w: 5.2, h: 3.4, ramp: GEAR, step: 2, gloss: 0.9 },
  { x: 11.4, y: 18, w: 5.2, h: 3.6, ramp: GEAR, step: 4, gloss: 1 },
  { x: 15, y: 15.4, w: 6, h: 3.2, ramp: GEAR, step: 3, gloss: 1 },
  { x: 19.4, y: 14.4, w: 2.6, h: 2.8, ramp: GEAR, step: 1, gloss: 0.8 },
  { x: 14.8, y: 20.4, w: 5.2, h: 3.6, ramp: GEAR, step: 5, gloss: 1 },
  { x: 16.8, y: 21.2, w: 3.4, h: 2.2, ramp: HARD, tone: 'visor', gloss: 1 },
];

/** Where the highlight sits across the box, and how wide it is. */
const BAND_REACH = 1.9;
const BAND_WIDE = 7.5;

/**
 * The rider's whole state at `t`: where on the road, how big, how leaned over, how lit.
 *
 * The lean is the lane's own **derivative**, taken as a difference over a tenth of a second rather
 * than stored. A motorcycle changes direction by falling into the turn, so a bike that moved sideways
 * without leaning would read as a sprite being dragged; and since the line is a closed-form function
 * of `t`, its rate of change is two more evaluations of it and no state at all.
 */
export function riderAt(view, density) {
  const t = view.t;
  const origin = view.origin;
  const lane = lineAt(t, density, origin);
  const rate = (lineAt(t + 0.05, density, origin) - lineAt(t - 0.05, density, origin)) / 0.1;
  const light = lightAt(view.travel);
  const pace = paceAt(t);
  return {
    lane,
    light,
    pace,
    // Leaning *away* from the direction of travel across the band: moving toward the camera the bike
    // banks over to the near side, which in profile is a roll of the whole silhouette.
    lean: clamp(rate * 0.14, -0.5, 0.5),
    // A bike is never still. Two unrelated periods and a bump from the throttle coming on.
    bob: wave(t, 0.83) * 0.3 + wave(t, 1.37, 1.1) * 0.22 + (pace - 1) * 0.9,
    z: lz(lane),
  };
}

/**
 * How much a part at `at` across the box is lifted by the light, in ramp steps.
 *
 * The band is *hard*: a part is in it or it is not, and the falloff is quantised on the way out by
 * being rounded to whole steps. A smooth falloff here would put four intermediate purples on the
 * screen and undo the palette in one function.
 */
function liftAt(at, light, gloss) {
  const band = BOX_W * 0.5 + light.bearing * BOX_W * BAND_REACH;
  const d = (at - band) / BAND_WIDE;
  const near = 1 - d * d;
  if (near <= 0) return 0;
  return Math.round(near * light.strength * gloss * 2.4);
}

/** The bike and its rider, drawn around the point on the road they are riding on. */
export function drawRider(ctx, view, rider) {
  const { px, pal } = view;
  const scale = (DRAWN * view.pxu * rider.z) / BOX_W;
  const originX = view.W * 0.34;
  const originY = ly(view, rider.lane) + rider.bob * scale;

  // The shadow the bike sits in, so it is on the road rather than over it. Two chunks tall and a
  // little wider than the wheelbase — a motorcycle's shadow at night is one pool under the engine.
  ctx.fillStyle = pal.road[0];
  ctx.beginPath();
  chunk(ctx, originX - BOX_W * scale * 0.36, originY - px, BOX_W * scale * 0.7, px * 3, px);
  ctx.fill();

  // The headlight, thrown down the road ahead of the bike so the machine sits inside its own light.
  const glow = view.tune.glow;
  const lampX = originX + BOX_W * scale * 0.5;
  const lampY = originY - 10.4 * scale;
  // The throw: a wide soft cone, a tight bright one inside it, and the pool where it lands. Three
  // passes over the same wedge, and the pool is the one that matters — a beam with no lit patch of
  // road at the end of it is a shape in the air, and light in the air is the part you cannot see.
  beam(ctx, lampX, lampY, 1, scale * 40, scale * 1.2, scale * 6, scale * 10.4, pal.hard.ember, 0.72 * glow, px);
  beam(ctx, lampX, lampY, 1, scale * 30, scale * 1, scale * 4, scale * 9.6, pal.hard.bronze, 0.66 * glow, px);
  beam(ctx, lampX, lampY, 1, scale * 16, scale * 0.7, scale * 2, scale * 4.6, pal.shine[0], 0.6 * glow, px);
  ditherGlow(ctx, lampX + scale * 26, originY - px * 2, scale * 13 * glow, pal.hard.bronze, 0.3 * glow, px, 0.22, 2.2);
  ditherGlow(ctx, lampX, lampY, scale * 4 * glow, pal.hard.lamp, 0.72 * glow, px, 1, 1.6);

  // Every part, grouped by the colour it ends up as, so the whole rider is a handful of fills.
  const runs = new Map();
  for (const part of PARTS) {
    const at = part.disc ? part.x : part.x + part.w / 2;
    const lift = liftAt(at, rider.light, part.gloss * view.tune.shine);
    let colour;
    if (part.ramp === HARD) {
      colour = lift > 1 && part.gloss > 0.6 ? pal.shine[0] : pal.hard[part.tone];
    } else {
      const ramp = part.ramp === SHELL ? pal.shell : pal.gear;
      const top = part.ramp === SHELL ? pal.shine : pal.glint;
      const step = part.step + lift;
      colour = step >= ramp.length ? top[Math.min(top.length - 1, step - ramp.length)] : ramp[step];
    }
    if (!runs.has(colour)) runs.set(colour, []);
    runs.get(colour).push(part);
  }

  // The lean is a roll, and a roll of a stack of rectangles is a shear: everything above the contact
  // patch slides by its own height. Cheaper than a rotation and it keeps every edge axis-aligned,
  // which on a chunk grid is the difference between a leaning bike and a smeared one.
  const shear = rider.lean * scale;
  for (const [colour, parts] of runs) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (const part of parts) {
      if (part.disc) {
        const cx = originX + (part.x - BOX_W / 2) * scale + shear * part.y;
        const cy = originY - part.y * scale;
        discPath(ctx, cx, cy, part.r * scale, px);
      } else {
        const mid = part.y + part.h / 2;
        const x = originX + (part.x - BOX_W / 2) * scale + shear * mid;
        chunk(ctx, x, originY - (part.y + part.h) * scale, part.w * scale, part.h * scale, px);
      }
    }
    ctx.fill();
  }

  // The tail light: a lamp, a red wash thrown back down the road, and a pool of it on the tarmac.
  const tailX = originX - BOX_W * scale * 0.42;
  const tailY = originY - 11.6 * scale;
  beam(ctx, tailX, tailY, -1, scale * 16, scale * 0.9, scale * 3.4, scale * 6.4,
    pal.hard.tail, 0.55 * glow, px);
  ctx.fillStyle = pal.hard.brake;
  ctx.beginPath();
  chunk(ctx, tailX - scale, tailY, Math.max(px, scale * 2), Math.max(px, scale * 1.6), px);
  ctx.fill();
  ditherGlow(ctx, tailX, tailY, scale * 3.4 * glow, pal.hard.tail, 0.6 * glow, px, 1, 1.6);
  ditherGlow(ctx, tailX - scale * 4, originY - px, scale * 6 * glow, pal.hard.tail, 0.3 * glow, px, 0.34, 2.2);
}

/**
 * A cone of light thrown along the road, as chunks on the grid.
 *
 * **A lamp is not its bulb, it is what it lands on**, and this scene is at night on a wet road, so
 * the beams are most of what the bike contributes to the picture. The wedge widens as it goes and
 * *drops* as it goes — a headlight points slightly down, so its far end is on the tarmac rather than
 * out at eye level, and drawing it level is the single thing that makes a beam read as a cardboard
 * triangle glued to the front of a sprite.
 *
 * Dithered rather than faded, because the falloff has to be made of the same chunks as everything
 * else. Density drops with distance along the beam *and* with distance from its axis, so it is
 * brightest in a small place at the lamp and thin and wide by the time it lands.
 */
function beam(ctx, x0, y0, dir, reach, near, far, drop, colour, strength, px) {
  if (reach < px || strength <= 0.02) return;
  ctx.fillStyle = colour;
  ctx.beginPath();
  const steps = Math.max(1, Math.round(reach / px));
  for (let i = 0; i < steps; i += 1) {
    const along = i / steps;
    const fade = (1 - along) ** 1.5 * strength;
    if (fade < 0.02) continue;
    const x = snap(x0 + dir * along * reach, px);
    const axis = y0 + drop * along * along;
    const half = Math.max(px, near + (far - near) * along);
    const col = Math.round(x / px);
    for (let y = snap(axis - half, px); y <= axis + half; y += px) {
      const across = 1 - Math.abs(y + px / 2 - axis) / half;
      if (across <= 0) continue;
      const density = fade * across ** 0.7;
      if (density > 0.03 && bayerOn(col, Math.round(y / px), density)) ctx.rect(x, y, px, px);
    }
  }
  ctx.fill();
}

/**
 * A disc on the chunk grid, as scanlines.
 *
 * Not `arc()`: a filled circle on a canvas is anti-aliased and there is no flag to stop it, so a
 * wheel drawn that way would be the one soft edge in a frame made entirely of hard ones — which is
 * exactly the thing that makes the rest look accidental rather than deliberate.
 */
function discPath(ctx, cx, cy, r, px) {
  const top = snap(cy - r, px);
  const bottom = snap(cy + r, px);
  for (let y = top; y <= bottom; y += px) {
    const dy = (y + px / 2 - cy) / r;
    if (Math.abs(dy) > 1) continue;
    const half = Math.sqrt(1 - dy * dy) * r;
    const x0 = snap(cx - half, px);
    const wide = snap(half * 2, px);
    if (wide >= px) ctx.rect(x0, y, wide, px);
  }
}

/** How fast the road is going past, for anything that wants to streak with it. */
export const streakOf = (view, rider) => lerp(0.5, 1.6, clamp(rider.pace, 0, 2) / 2) * view.pxu;
