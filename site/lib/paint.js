// Wet black paint, thrown over the picture and running very slowly downward.
//
// Not a filter and not part of the scene: these sit on top of everything, like something spilled
// on the lens. They are almost pure black, so they read as holes punched in the image — the wet
// look comes entirely from the specular edge, which is the only part that catches light.
//
// Everything moves on periods of two to five *minutes*. At sixty frames a second a drip advances
// by a fraction of a pixel per frame; you never see it move, only notice later that it has.

import { TAU, clamp, wrap01 } from './draw.js';

// Near-black with a hint of blue, so it separates from a pure-black background without reading
// as grey.
const PAINT = '#01000a';

/**
 * @param {{ avoid?: {x: number, y: number, r: number} }} [options] a normalised keep-out circle —
 *   splotch centres are resampled away from it. Paint that lands squarely on the subject doesn't
 *   read as paint over a picture, it reads as no picture.
 */
export function makeSplotches(rng, count = 4, { avoid } = {}) {
  const place = () => {
    let x = rng.next();
    let y = rng.range(-0.12, 0.48);
    for (let tries = 0; avoid && tries < 12; tries += 1) {
      if (Math.hypot(x - avoid.x, y - avoid.y) >= avoid.r) break;
      x = rng.next();
      y = rng.range(-0.12, 0.48);
    }
    return { x, y };
  };

  return Array.from({ length: count }, () => {
    // Many lobes with a wide spread of radii. Fewer, gentler lobes give a soft oval, which reads
    // as a cloud rather than as something thrown at the lens.
    const lobes = rng.int(13, 19);
    // Biased toward the top: paint runs downward, so it needs frame below it to run into.
    const { x, y } = place();
    return {
      x,
      y,
      radius: rng.range(0.12, 0.26),
      radii: Array.from({ length: lobes }, () => rng.range(0.48, 1.28)),
      rotation: rng.range(0, TAU),
      // Minutes, not seconds.
      creep: rng.range(150, 300),
      phase: rng.range(0, TAU),
      drips: Array.from({ length: rng.int(3, 5) }, () => ({
        // Angle around the lower half of the blob, where paint would actually run from.
        angle: rng.range(0.12, 0.88) * Math.PI,
        width: rng.range(0.045, 0.14),
        length: rng.range(0.35, 2.6),
        period: rng.range(160, 320),
        phase: rng.next(),
        bulb: rng.range(1, 1.7),
        lean: rng.range(-0.09, 0.09),
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
 * A run of paint: a column that narrows as it falls, leans slightly off vertical, and ends in a
 * hanging bulb. The taper and the lean are what stop it reading as a black bar with a bead on it.
 */
function dripPath(ctx, x, y, width, length, bulb, lean) {
  const top = width / 2;
  const tip = Math.max(top * 0.36, 0.6);
  const bx = x + lean;
  ctx.beginPath();
  ctx.moveTo(x - top, y);
  ctx.bezierCurveTo(x - top * 0.92, y + length * 0.38, bx - tip * 1.35, y + length * 0.74, bx - tip, y + length);
  // Anticlockwise so the arc hangs below the column rather than capping it above.
  ctx.arc(bx, y + length, tip * bulb, Math.PI, 0, true);
  ctx.bezierCurveTo(bx + tip * 1.35, y + length * 0.74, x + top * 0.92, y + length * 0.38, x + top, y);
  ctx.closePath();
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
    // The blob itself barely breathes — enough that it never looks like a decal.
    const swell = 1 + Math.sin((t / splotch.creep) * TAU + splotch.phase) * 0.035;

    ctx.save();
    ctx.globalAlpha = clamp(intensity, 0, 1);

    // Paint first, all of it, so the drips join the blob as one body.
    ctx.fillStyle = PAINT;
    blobPath(ctx, cx, cy, radius, splotch.radii, splotch.rotation, swell);
    ctx.fill();

    const runs = [];
    for (const drip of splotch.drips) {
      const angle = drip.angle;
      // Anchor a little inside the edge so the run grows out of the blob, not off it.
      const edge = radius * 0.86 * swell;
      const x = cx + Math.cos(angle) * edge;
      const y = cy + Math.sin(angle) * edge;
      // Creeps between roughly a third and full length, over minutes, each on its own clock.
      const creep = 0.34 + 0.66 * (0.5 - 0.5 * Math.cos(wrap01(t / drip.period + drip.phase) * TAU));
      const length = radius * drip.length * creep;
      const width = radius * drip.width;
      const lean = radius * drip.lean * creep;
      dripPath(ctx, x, y, width, length, drip.bulb, lean);
      ctx.fill();
      runs.push({ x: x + lean, y, width: Math.max(width * 0.36, 0.6), length, bulb: drip.bulb });
    }

    // The wet part. A soft sheen inside the upper-left of the blob, a hard rim along that same
    // edge, and a catchlight on every hanging bulb — without these it is just a black hole in the
    // picture rather than something with a surface.
    ctx.globalCompositeOperation = 'lighter';

    const sheen = ctx.createRadialGradient(
      cx - radius * 0.42, cy - radius * 0.46, 0,
      cx - radius * 0.42, cy - radius * 0.46, radius * 0.95,
    );
    sheen.addColorStop(0, `rgba(186, 214, 255, ${0.16 * intensity})`);
    sheen.addColorStop(0.55, `rgba(140, 110, 220, ${0.05 * intensity})`);
    sheen.addColorStop(1, 'rgba(120, 90, 200, 0)');
    ctx.fillStyle = sheen;
    blobPath(ctx, cx, cy, radius, splotch.radii, splotch.rotation, swell);
    ctx.fill();

    ctx.strokeStyle = `rgba(200, 226, 255, ${0.22 * intensity})`;
    ctx.lineWidth = Math.max(1, reach * 0.0016);
    ctx.save();
    blobPath(ctx, cx, cy, radius, splotch.radii, splotch.rotation, swell);
    ctx.clip();
    // Clipped to the blob, so only the inside edge lights up — an outline all the way round would
    // read as a sticker.
    blobPath(ctx, cx - radius * 0.035, cy - radius * 0.04, radius, splotch.radii, splotch.rotation, swell);
    ctx.stroke();
    ctx.restore();

    for (const run of runs) {
      const r = Math.max(run.width * run.bulb, 1);
      const light = ctx.createRadialGradient(
        run.x - r * 0.4, run.y + run.length - r * 0.45, 0,
        run.x - r * 0.4, run.y + run.length - r * 0.45, r * 1.5,
      );
      light.addColorStop(0, `rgba(226, 240, 255, ${0.5 * intensity})`);
      light.addColorStop(1, 'rgba(200, 226, 255, 0)');
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(run.x, run.y + run.length, r * 1.5, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}
