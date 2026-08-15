// The moon.
//
// It is a disc, which is the easy part, and it is a **sphere**, which is the whole job. A flat white
// circle in a night sky reads as a hole in the picture — a shape the same colour as nothing — and no
// amount of detail inside it fixes that, because what is missing is not detail, it is *curvature*.
//
// Curvature is one term: brightness falls with distance from the centre. On a seven-step ramp that
// gives you four visible rings and a disc that looks like a target. On a six-step ramp resolved by
// dither it gives a limb that turns away from you continuously, and that is the entire difference
// between this scene's palette and the last one's, spent on the one object that most needs it.
//
// It is full, so it is lit dead-on and there is no terminator. What stops a full moon being a plain
// bright disc is the **maria** — the dark plains, a step or two down, in shapes that are not centred
// and not symmetrical. Four of them, and they are the only thing that makes the disc read as a
// specific object rather than as a light. Get them wrong and no amount of care elsewhere saves it:
// too faint and the moon is a cotton ball, too round and it is a golf ball.
//
// The air around it belongs to the **sky**, not to the moon — see `glareAt` at the bottom.

import { noise2 } from '../../effects/field.js';
import { clamp, rgba } from '../../lib/draw.js';
import { shadeAt } from './layout.js';
import { MOON } from './palette.js';

/**
 * How far the moon's glare carries into the sky, measured in its own radii.
 *
 * **Wide and weak, not tight and strong** — and that is a consequence of the grid rather than a
 * taste. The sky's chunks are three across the water's, so a lift that spends eight ramp steps in a
 * moon and a half is changing by nearly a whole step per chunk, and dither cannot resolve a gradient
 * that steep: it comes out as a chunky blue mat sitting behind the disc, which is a second object
 * again. Spread the same idea over three radii and half the height and every chunk is a fraction of
 * a step from its neighbour, which is the regime ordered dither is *for*.
 */
export const GLARE_REACH = 3.5;

/** How many steps of the sky's ramp the glare is worth where it is strongest. */
export const GLARE_LIFT = 5.4;

export function planMoon(rng) {
  return {
    // High and off to one side. Centred, it is a target; off-centre, the empty sky beside it becomes
    // part of the composition instead of margin.
    at: rng.range(0.3, 0.4),
    high: rng.range(0.16, 0.22),
    seed: rng.range(0, 60),
    // The plains, dealt from four fixed quadrants rather than four free positions. Three blobs with
    // a free run of the disc average out to a symmetrical smudge in the middle — which is a stain,
    // not a face. The moon's pattern is one large mare in the north-west running into a second, with
    // smaller ones standing apart from it; that arrangement is what the eye recognises, and it is a
    // composition rather than a distribution, so it is written down rather than sampled.
    // The depths are reckoned from a face that starts *below* the top of the ramp, not at it — so a
    // plain has to be worth half a step more than it looks like it should be, or it comes out as a
    // suggestion of a smudge. Deep enough to reach the third and fourth steps is what makes them
    // read as grey plains rather than as a slightly less white part of a white thing.
    maria: [
      { dx: rng.range(-0.36, -0.14), dy: rng.range(-0.44, -0.2), r: rng.range(0.44, 0.56), depth: 3 },
      { dx: rng.range(-0.04, 0.18), dy: rng.range(-0.28, -0.04), r: rng.range(0.34, 0.44), depth: 2.5 },
      { dx: rng.range(0.18, 0.44), dy: rng.range(0.04, 0.26), r: rng.range(0.2, 0.3), depth: 2 },
      { dx: rng.range(-0.44, -0.22), dy: rng.range(0.16, 0.38), r: rng.range(0.14, 0.24), depth: 1.6 },
    ],
  };
}

/** Where the moon is and how big, which the water needs to know to reflect it. */
export function moonAt(W, H, plan) {
  return {
    cx: plan.at * W,
    cy: plan.high * H,
    r: Math.min(W, H) * 0.115,
  };
}

export function drawMoon(ctx, W, H, t, plan, px) {
  const disc = moonAt(W, H, plan);
  // Snapped once, here rather than per rectangle. Everything below is `centre + col * px`, so with
  // the centre on the grid every chunk is too and none of them needs rounding on the way out.
  const cx = Math.round(disc.cx / px) * px;
  const cy = Math.round(disc.cy / px) * px;
  const { r } = disc;
  const bucket = MOON.map(() => []);
  const cols = Math.ceil(r / px) + 1;

  for (let row = -cols; row <= cols; row += 1) {
    for (let col = -cols; col <= cols; col += 1) {
      const x = col * px;
      const y = row * px;
      const d = Math.hypot(x, y) / r;
      if (d > 1) continue;
      // The limb. `√(1 - d²)` is the cosine of the angle the surface is turned through, which is
      // what makes this a sphere and not a disc — and the exponent decides how sharply it rolls off
      // at the edge. A full moon is lit from behind the viewer, so almost none of that fall-off is
      // shadow: the ball is bright nearly to its own edge and then stops. Overdo it and you get a
      // dark rim, which is a *gibbous* moon drawn wrong.
      //
      // **And it starts below zero, which is the whole of what keeps the face white.** `shadeAt`
      // clamps a negative level to step 0 and dithers nothing there; leave the bright middle sitting
      // a third of a step *above* white instead and every chunk of it is a mixture of two steps at
      // the same fraction — which is not a texture, it is a halftone screen, and whether you can see
      // its ruling depends on how crisply the frame happens to be rasterised. That is what made this
      // moon look like two different moons.
      const curve = (1 - d * d) ** 0.5;
      let level = (1 - curve ** 0.6) * 2.6 - 0.5;
      // The plains.
      //
      // Circles, warped. A mare is a lava flood that filled an impact basin, so its edge is a
      // coastline — a ragged thing with bays and headlands — and the difference between drawing the
      // radius straight and pushing it around with a little noise is the difference between the moon
      // and a slice of swiss cheese. The `** 0.7` does the other half: it holds the plain near its
      // full depth across the middle and spends the fall-off in the last fifth, so a mare is a flat
      // grey region with a shore, rather than a blob that is only its own centre.
      for (const m of plan.maria) {
        const mx = x / r - m.dx;
        const my = y / r - m.dy;
        const raw = Math.hypot(mx, my) / m.r;
        // The coastline can pull the shore in by a fifth or push it out by a quarter, so anything
        // beyond `1 / 0.78` of the plain's nominal radius is outside it whatever the noise says —
        // and asking the noise is four hashed sines. Testing the circle first is exact, not an
        // approximation: it only skips the chunks that could not have been inside either way.
        if (raw > 1.29) continue;
        const coast = 0.78 + noise2(mx * 3.2 + plan.seed, my * 3.2) * 0.55;
        const md = raw * coast;
        if (md < 1) level += (1 - md * md) ** 0.7 * m.depth;
      }
      // Two scales of mottle: broad highland brightness, then a fine grain over it.
      //
      // **Signed, and wide.** Both halves matter and both were wrong. A noise field runs 0..1, so
      // adding it raw is a third of a step of *bias* on every chunk in the picture — that is what
      // put the whole bright face off white. And the amplitude has to be worth more than a step, so
      // that where the mottle does show it carries the level *through* a boundary rather than
      // hovering beside one: a grain that sweeps across two steps reads as mottling, because the
      // dither density changes from chunk to chunk, while the same grain at half the amplitude
      // holds one density across the area and rules a screen over it. Narrow mottle is the halftone;
      // wide mottle is the cure.
      level += (noise2(x / (r * 0.34) + plan.seed, y / (r * 0.34)) - 0.5) * 1.15;
      level += (noise2(x / (r * 0.085), y / (r * 0.085) + plan.seed) - 0.5) * 0.35;
      // ...and the very edge always goes a little down the ramp, so the silhouette is a clean circle
      // however the mottling fell. A moon with a ragged outline is a moon with weather.
      level += clamp((d - 0.94) / 0.06, 0, 1) * 1.3;
      bucket[shadeAt(level, col + cols, row + cols, MOON.length)].push(cx + x, cy + y);
    }
  }

  for (let step = 0; step < MOON.length; step += 1) {
    const cells = bucket[step];
    if (!cells.length) continue;
    ctx.fillStyle = rgba(MOON[step], 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 2) ctx.rect(cells[i], cells[i + 1], px, px);
    ctx.fill();
  }
}

/**
 * How much the moon lifts the air at a point: 1 at the limb, 0 at `GLARE_REACH` radii out.
 *
 * **The moon does not draw its own glare.** This is a question the *sky* asks while it is drawing
 * itself, and the answer is added to the level it was going to use anyway — so the lit air is made
 * of the same chunks, on the same grid, on the same ramp, resolved by the same dither as the sky an
 * inch away from it. There is nothing to see a seam between, because there is no second object.
 *
 * That is worth stating plainly because the obvious alternative was tried and is bad: a halo drawn
 * *by* the moon has to decide where it ends, and every threshold that decides that is visible.
 */
export function glareAt(moon, x, y) {
  const d = Math.hypot(x - moon.cx, y - moon.cy) / moon.r;
  if (d >= GLARE_REACH) return 0;
  const near = d <= 1 ? 1 : (GLARE_REACH - d) / (GLARE_REACH - 1);
  // Weighted toward the disc, but gently — the exponent is what decides how much of the reach is
  // spent near nothing, and pushed hard it re-creates the steep gradient the wide reach was for.
  return near ** 2.1;
}
