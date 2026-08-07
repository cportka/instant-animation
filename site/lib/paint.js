// Wet black paint, thrown over the picture and running very slowly downward.
//
// Not a filter and not part of the scene: these sit on top of everything, like something spilled
// on the lens. They are almost pure black, so they read as holes punched in the image — the wet
// look comes entirely from the specular edge, which is the only part that catches light.
//
// Two kinds of mark: small goopy splotches, and brush strokes that drawl downward from a loaded
// head and thin as they drag. Both are built from the same ribbon — a spine with an independent
// half-width at every sample — so thickness can bulge where paint gathers and pinch where it has
// run thin. A shape of constant width reads as a bar; the bulges are the whole difference between
// paint and ink.
//
// Everything moves on periods of two to five *minutes*. At sixty frames a second a drip advances
// by a fraction of a pixel per frame; you never see it move, only notice later that it has.

import { TAU, clamp, wrap01 } from './draw.js';

// Near-black with a hint of blue, so it separates from a pure-black background without reading
// as grey.
const PAINT = '#01000a';
const RIBBON_SAMPLES = 18;

/**
 * @param {{ avoid?: {x: number, y: number, r: number} }} [options] a normalised keep-out circle —
 *   mark centres are resampled away from it. Paint that lands squarely on the subject doesn't
 *   read as paint over a picture, it reads as no picture.
 */
export function makeSplotches(rng, count = 28, { avoid } = {}) {
  // Placed on a jittered grid rather than at random. Pure random clumps: several marks land on
  // top of each other and read as one big mass while half the frame stays bare, which is the
  // opposite of paint flicked over everything.
  const cols = Math.max(1, Math.round(Math.sqrt(count * 1.7)));
  const rows = Math.max(1, Math.ceil(count / cols));

  const place = (index) => {
    const col = index % cols;
    const row = Math.floor(index / cols) % rows;
    let x = (col + rng.range(0.12, 0.88)) / cols;
    let y = -0.08 + ((row + rng.range(0.1, 0.9)) / rows) * 0.92;
    // Nudge within the cell if it lands on the subject.
    for (let tries = 0; avoid && tries < 10; tries += 1) {
      if (Math.hypot(x - avoid.x, y - avoid.y) >= avoid.r) break;
      x = (col + rng.range(0.12, 0.88)) / cols;
      y = -0.08 + ((row + rng.range(0.1, 0.9)) / rows) * 0.92;
    }
    return { x, y };
  };

  return Array.from({ length: count }, (_, index) => {
    const { x, y } = place(index);
    // Fewer, fatter lobes than a splatter would have: surface tension pulls goopy paint into big
    // rounded bulges, not into fine points.
    const lobes = rng.int(8, 12);

    return {
      x,
      y,
      stroke: rng.next() < 0.4,
      // Small. A mark wide enough to be a shape in its own right competes with the picture; these
      // are meant to be flecks you keep finding, and what they cost the picture is what they hide.
      radius: rng.range(0.009, 0.03),
      radii: Array.from({ length: lobes }, () => rng.range(0.58, 1.3)),
      rotation: rng.range(0, TAU),
      creep: rng.range(150, 300),
      phase: rng.range(0, TAU),
      // Long relative to the head, because off a fleck-sized head a stroke that tapers away has
      // nothing left of it by halfway down. But it has to *drawl*, not descend: the swell below
      // fattens it somewhere along its length, and the lean is a fraction of the length rather
      // than of the head, so a long one actually wanders. A ribbon of constant width falling
      // straight is a column, and a frame of columns is a fence.
      brush: {
        length: rng.range(4, 10),
        width: rng.range(0.45, 0.8),
        taper: rng.range(0.5, 0.8),
        lean: rng.range(-0.5, 0.5),
        bulge: rng.range(0.25, 0.75),
        swell: rng.range(0.3, 0.8),
        period: rng.range(170, 340),
        phase: rng.next(),
        // The ribs give a stroke's edge its loaded, uneven bite.
        ribs: Array.from({ length: RIBBON_SAMPLES }, () => rng.range(0.72, 1.3)),
      },
      drips: Array.from({ length: rng.int(1, 3) }, () => ({
        angle: rng.range(0.15, 0.85) * Math.PI,
        width: rng.range(0.24, 0.5),
        length: rng.range(1.5, 6),
        period: rng.range(160, 320),
        phase: rng.next(),
        bulb: rng.range(1.2, 1.75),
        lean: rng.range(-0.35, 0.35),
        // Where the paint gathers on its way down, and by how much.
        bulge: rng.range(0.3, 0.7),
        swell: rng.range(0.2, 0.55),
      })),
    };
  });
}

/** Smooth closed blob through the per-lobe radii — quadratics through the midpoints. */
function blobPath(ctx, cx, cy, radius, radii, rotation, swell) {
  const n = radii.length;
  const point = (i) => {
    const a = rotation + ((i % n) / n) * TAU;
    const r = radius * radii[i % n] * swell;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const mid = (i) => {
    const [ax, ay] = point(i);
    const [bx, by] = point(i + 1);
    return [(ax + bx) / 2, (ay + by) / 2];
  };

  ctx.beginPath();
  const [sx, sy] = mid(n - 1);
  ctx.moveTo(sx, sy);
  for (let i = 0; i < n; i += 1) {
    const [px, py] = point(i);
    const [mx, my] = mid(i);
    ctx.quadraticCurveTo(px, py, mx, my);
  }
  ctx.closePath();
}

/**
 * A closed shape around a spine, with an independent half-width at every sample — the thing that
 * lets a run bulge where paint gathers and pinch where it has thinned.
 */
function ribbonPath(ctx, spine, halves) {
  const n = spine.length;
  const side = (sign) => {
    const points = [];
    for (let i = 0; i < n; i += 1) {
      const prev = spine[Math.max(0, i - 1)];
      const next = spine[Math.min(n - 1, i + 1)];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const len = Math.hypot(dx, dy) || 1;
      points.push([
        spine[i][0] - (dy / len) * halves[i] * sign,
        spine[i][1] + (dx / len) * halves[i] * sign,
      ]);
    }
    return points;
  };

  const left = side(1);
  const right = side(-1);
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i += 1) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = n - 1; i >= 0; i -= 1) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
}

/** A spine falling from (x, y), leaning in gradually so the top stays attached square-on. */
function fallingSpine(x, y, length, lean) {
  return Array.from({ length: RIBBON_SAMPLES }, (_, i) => {
    const u = i / (RIBBON_SAMPLES - 1);
    return [x + lean * u * u, y + length * u];
  });
}

/**
 * @param {number} intensity 0 hides the paint entirely, 1 is full coverage.
 */
export function drawSplotches(ctx, W, H, t, splotches, intensity = 1) {
  if (intensity <= 0) return;
  const reach = Math.min(W, H);

  for (const splotch of splotches) {
    const cx = splotch.x * W;
    const cy = splotch.y * H;
    const radius = splotch.radius * reach;
    const swell = 1 + Math.sin((t / splotch.creep) * TAU + splotch.phase) * 0.04;

    ctx.save();
    ctx.globalAlpha = clamp(intensity, 0, 1);
    ctx.fillStyle = PAINT;

    // The mark itself.
    blobPath(ctx, cx, cy, radius, splotch.radii, splotch.rotation, swell);
    ctx.fill();

    const tips = [];

    // A brush stroke drawling down from it: thick where the brush was loaded, dragged out to
    // almost nothing at the tail, ragged along both edges.
    if (splotch.stroke) {
      const { brush } = splotch;
      const creep = 0.45 + 0.55 * (0.5 - 0.5 * Math.cos(wrap01(t / brush.period + brush.phase) * TAU));
      const length = radius * brush.length * creep;
      const spine = fallingSpine(cx, cy, length, length * brush.lean * 0.4);
      const halves = brush.ribs.map((rib, i) => {
        const u = i / (RIBBON_SAMPLES - 1);
        // Broad gather — paint pooling along a drag, not the tight bead a hanging run makes.
        const gather = 1 + brush.swell * Math.exp(-((u - brush.bulge) ** 2) / 0.06);
        return Math.max(radius * brush.width * rib * (1 - u * brush.taper) * gather * swell, 0.6);
      });
      ribbonPath(ctx, spine, halves);
      ctx.fill();
      const tail = spine[spine.length - 1];
      tips.push({ x: tail[0], y: tail[1], r: halves[halves.length - 1] });
    }

    // Runs, each gathering into a bulge partway down and hanging off a heavy bead.
    for (const drip of splotch.drips) {
      const edge = radius * 0.82 * swell;
      const x = cx + Math.cos(drip.angle) * edge;
      const y = cy + Math.sin(drip.angle) * edge;
      const creep = 0.34 + 0.66 * (0.5 - 0.5 * Math.cos(wrap01(t / drip.period + drip.phase) * TAU));
      const length = radius * drip.length * creep;
      const spine = fallingSpine(x, y, length, radius * drip.lean * creep);
      const base = radius * drip.width;
      const halves = spine.map((_, i) => {
        const u = i / (RIBBON_SAMPLES - 1);
        const gather = 1 + drip.swell * Math.exp(-((u - drip.bulge) ** 2) / 0.02);
        return Math.max(base * (1 - u * 0.42) * gather, 0.6);
      });
      ribbonPath(ctx, spine, halves);
      ctx.fill();

      // The bead on the end, fatter than the column it hangs from.
      const tip = spine[spine.length - 1];
      const bead = Math.max(halves[halves.length - 1] * drip.bulb, 1);
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], bead, 0, TAU);
      ctx.fill();
      tips.push({ x: tip[0], y: tip[1], r: bead });
    }

    // The wet part. Without these it is a black hole in the picture rather than a surface.
    ctx.globalCompositeOperation = 'lighter';

    const sheen = ctx.createRadialGradient(
      cx - radius * 0.4, cy - radius * 0.44, 0,
      cx - radius * 0.4, cy - radius * 0.44, radius * 1.05,
    );
    sheen.addColorStop(0, `rgba(198, 222, 255, ${0.17 * intensity})`);
    sheen.addColorStop(0.5, `rgba(150, 118, 226, ${0.05 * intensity})`);
    sheen.addColorStop(1, 'rgba(120, 90, 200, 0)');
    ctx.fillStyle = sheen;
    blobPath(ctx, cx, cy, radius, splotch.radii, splotch.rotation, swell);
    ctx.fill();

    ctx.strokeStyle = `rgba(206, 230, 255, ${0.26 * intensity})`;
    ctx.lineWidth = Math.max(1, reach * 0.0016);
    ctx.save();
    blobPath(ctx, cx, cy, radius, splotch.radii, splotch.rotation, swell);
    ctx.clip();
    // Clipped to the mark, so only the inside edge lights up — an outline all the way round would
    // read as a sticker.
    blobPath(ctx, cx - radius * 0.05, cy - radius * 0.055, radius, splotch.radii, splotch.rotation, swell);
    ctx.stroke();
    ctx.restore();

    // A catchlight on every hanging bead and every stroke tail. It has to sit *inside* the bead —
    // a glow larger than the drop reads as a luminous bubble hanging in space, not as light on a
    // wet surface. Filling only the bead's own circle is what keeps it there.
    for (const tip of tips) {
      const light = ctx.createRadialGradient(
        tip.x - tip.r * 0.4, tip.y - tip.r * 0.44, 0,
        tip.x - tip.r * 0.4, tip.y - tip.r * 0.44, tip.r * 0.62,
      );
      light.addColorStop(0, `rgba(226, 240, 255, ${0.46 * intensity})`);
      light.addColorStop(1, 'rgba(190, 216, 255, 0)');
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, tip.r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}
