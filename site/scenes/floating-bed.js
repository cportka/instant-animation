// "A bed floating in space with someone snuggled under the covers peacefully sleeping while the
//  bed gently floats amongst the stars."
//
// Composed for scale, not for comfort: the bed is a few hundred pixels of warm dark against a
// void, a galactic band, a black hole, and a pair of neutron stars locked in orbit. Almost all of
// the frame is empty on purpose — the emptiness is the subject, and the sleeper is what makes it
// hurt. The whole thing is played back off a tape that has been through the machine too often.
//
// Everything is drawn from paths — no images, no fonts beyond a stray "Z" — so the scene stays a
// few kilobytes and renders identically in a browser and in the headless render tests.

import { createRng } from '../lib/rng.js';
import {
  TAU,
  clamp,
  ellipseArcPath,
  fillEllipse,
  glow,
  lerp,
  polygonPath,
  rgba,
  roundedRect,
  smoothstep,
  wave,
  wrap01,
} from '../lib/draw.js';
import { chromaSplit, grain, makeTearBands, scanlines, tearBands } from '../lib/vhs.js';

export const meta = {
  id: 'floating-bed',
  title: 'Asleep Among the Stars',
  prompt:
    'a bed floating in space with someone snuggled under the covers peacefully sleeping while the bed gently floats amongst the stars',
  created: '2026-08-07',
  background: '#02010a',
  // Where the still frame is taken when the visitor prefers reduced motion.
  posterTime: 34,
};

// The bed is ~714 units long and is scaled against the viewport's short edge, so the larger the
// screen, the smaller it becomes in frame — the bigger your window, the more lost it looks.
const BED_SCALE = 0.00056;

// Everything with a lit edge is lit from here: the neutron pair is both the binary and the key
// light. One source, one place, so nothing in the frame can disagree about where the light is.
const KEY_STAR = { x: 0.82, y: 0.15 };
const BLACK_HOLE = { x: 0.6, y: 0.75 };

const SHOOTER_PERIOD = 27; // seconds between shooting stars — rare enough to feel like luck
const SNORE_PERIOD = 5.4; // one full breath; the Z's and the echoes ride the same clock
const ECHO_LIFE = 13; // how long a geometric echo takes to leave the frame

// Vaporwave: magenta and cyan doing all the work, violet holding them together.
const MAGENTA = [255, 74, 200];
const CYAN = [80, 240, 255];
const VIOLET = [150, 90, 255];

const STAR_TINTS = [
  [255, 255, 255],
  [255, 255, 255],
  [226, 214, 255],
  [255, 198, 238],
  [198, 240, 255],
];

const VOID_TOP = '#100630';
const VOID_MID = '#07021a';
const VOID_DEEP = '#02010a';

const FRAME_DARK = '#150a2c';
const LINEN = '#3b2b62';
const LINEN_LIGHT = '#7c66b8';
const HAIR = '#241536';
const SKIN_SHADE = '#6d3a52';

// Wireframe solids, in the order the sleeper exhales them.
const ECHO_SHAPES = [3, 4, 0, 6, 5];

export function create({ width, height, seed = meta.id }) {
  const rng = createRng(seed);

  // Star positions live in normalised space so a resize never reshuffles the sky.
  const layers = [
    makeStarLayer(rng, { count: 460, minRadius: 0.3, maxRadius: 0.8, alpha: 0.4, depth: 0.06 }),
    makeStarLayer(rng, { count: 120, minRadius: 0.7, maxRadius: 1.4, alpha: 0.7, depth: 0.14 }),
    makeStarLayer(rng, { count: 24, minRadius: 1.3, maxRadius: 2.3, alpha: 1, depth: 0.3 }),
  ];

  // The galactic band: stars clustered along an axis, in the band's own rotated space.
  const bandStars = Array.from({ length: 320 }, () => {
    // Sum of three uniforms ≈ normal, which piles the stars up along the spine of the band.
    const across = (rng.next() + rng.next() + rng.next()) / 1.5 - 1;
    return {
      along: rng.range(-1, 1),
      across,
      radius: rng.range(0.25, 1.05),
      alpha: rng.range(0.2, 0.85),
      tint: rng.pick(STAR_TINTS),
    };
  });

  const dustLanes = Array.from({ length: 6 }, () => ({
    along: rng.range(-0.8, 0.8),
    across: rng.range(-0.35, 0.35),
    length: rng.range(0.1, 0.26),
    thickness: rng.range(0.08, 0.22),
    alpha: rng.range(0.2, 0.42),
    tilt: rng.range(-0.16, 0.16),
  }));

  // Haze: a few enormous, very faint washes. Vaporwave lives or dies on the colour in the air.
  const haze = [
    { x: 0.26, y: 0.3, radius: 0.5, colour: MAGENTA, alpha: 0.032 },
    { x: 0.74, y: 0.62, radius: 0.46, colour: CYAN, alpha: 0.026 },
    { x: 0.48, y: 0.88, radius: 0.42, colour: VIOLET, alpha: 0.03 },
  ].map((h) => ({ ...h, phase: rng.range(0, TAU), drift: rng.range(0.004, 0.011) }));

  const shooters = Array.from({ length: 9 }, () => ({
    x: rng.range(0.02, 0.6),
    y: rng.range(0.04, 0.4),
    angle: rng.range(0.2, 0.5),
    length: rng.range(0.22, 0.4),
    duration: rng.range(1.3, 2),
  }));

  const bands = makeTearBands(rng, 6);

  let W = width;
  let H = height;

  return {
    resize(nextWidth, nextHeight) {
      W = nextWidth;
      H = nextHeight;
    },

    draw(ctx, t) {
      // Minutes-long periods, not seconds: the bed is adrift, not bobbing.
      const driftX = wave(t, 97, 0.4) * 0.055 + wave(t, 53, 2.2) * 0.022;
      const driftY = wave(t, 71, 1.1) * 0.038 + wave(t, 41, 0.3) * 0.014;

      const hole = holeGeometry(W, H);

      drawVoid(ctx, W, H);
      drawHaze(ctx, W, H, t, haze);
      drawGalacticBand(ctx, W, H, bandStars, dustLanes);
      drawStars(ctx, W, H, t, layers, driftX, driftY, hole);
      drawShootingStar(ctx, W, H, t, shooters);
      drawBlackHole(ctx, W, H, t, hole);
      drawNeutronBinary(ctx, W, H, t);

      const scale = Math.min(W, H) * BED_SCALE;
      const bedX = W * (0.34 + driftX);
      const bedY = H * (0.37 + driftY);
      // A tumble so slow you only notice it by looking away and back.
      const tumble = wave(t, 127, 1.4) * 0.1 + wave(t, 61, 0.2) * 0.028;

      // The sleeper's shapes leave from roughly where their head is, and keep going.
      drawEchoes(ctx, W, H, t, bedX - 200 * scale, bedY - 95 * scale);

      ctx.save();
      ctx.translate(bedX, bedY);
      ctx.scale(scale, scale);
      // The one warm thing in the frame, and it is very nearly nothing.
      glow(ctx, -170, -70, 900, [255, 150, 190], 0.06, 0.015);
      ctx.rotate(tumble);
      drawBed(ctx, t);
      drawZzz(ctx, t);
      ctx.restore();

      drawVignette(ctx, W, H);

      // Tape last, over everything — including the sleeper.
      tearBands(ctx, W, H, t, bands, 1);
      chromaSplit(ctx, W, H, t, 1);
      scanlines(ctx, W, H, t, { spacing: 4, alpha: 0.14, rollSpeed: 5 });
      grain(ctx, W, H, t, { count: 34, alpha: 0.13, rate: 10 });
    },
  };
}

/* ---------------------------------------------------------------- sky ---- */

function makeStarLayer(rng, { count, minRadius, maxRadius, alpha, depth }) {
  return {
    depth,
    stars: Array.from({ length: count }, () => ({
      x: rng.next(),
      y: rng.next(),
      radius: rng.range(minRadius, maxRadius),
      alpha: alpha * rng.range(0.4, 1),
      // Barely there. A twinkling sky reads as friendly; a steady one reads as cold.
      twinkle: rng.range(0.25, 0.9),
      phase: rng.range(0, TAU),
      tint: rng.pick(STAR_TINTS),
      spike: rng.next() > 0.82,
    })),
  };
}

function drawVoid(ctx, W, H) {
  const sky = ctx.createLinearGradient(W * 0.9, 0, W * 0.1, H);
  sky.addColorStop(0, VOID_TOP);
  sky.addColorStop(0.5, VOID_MID);
  sky.addColorStop(1, VOID_DEEP);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
}

function drawHaze(ctx, W, H, t, haze) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const wash of haze) {
    const cx = (wash.x + Math.sin(t * wash.drift + wash.phase) * 0.03) * W;
    const cy = (wash.y + Math.cos(t * wash.drift * 0.8 + wash.phase) * 0.024) * H;
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.07 + wash.phase);
    glow(ctx, cx, cy, wash.radius * Math.max(W, H), wash.colour, wash.alpha * pulse, wash.alpha * pulse * 0.4);
  }
  ctx.restore();
}

/**
 * The galactic plane: a faint band of light crossing the frame, thick with stars and cut by dark
 * dust lanes. It costs almost nothing and does more for the sense of depth than anything else
 * here — it puts something unreachably far behind the bed.
 */
function drawGalacticBand(ctx, W, H, bandStars, dustLanes) {
  const angle = -0.46;
  const cx = W * 0.52;
  const cy = H * 0.58;
  const span = Math.hypot(W, H);
  const halfWidth = span * 0.16;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // The diffuse glow of unresolved stars, bled toward magenta on one edge and cyan on the other.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const wash = ctx.createLinearGradient(0, -halfWidth, 0, halfWidth);
  wash.addColorStop(0, 'rgba(255, 74, 200, 0)');
  wash.addColorStop(0.34, 'rgba(190, 80, 210, 0.1)');
  wash.addColorStop(0.5, 'rgba(190, 155, 245, 0.22)');
  wash.addColorStop(0.66, 'rgba(90, 190, 235, 0.1)');
  wash.addColorStop(1, 'rgba(80, 240, 255, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(-span, -halfWidth, span * 2, halfWidth * 2);
  ctx.restore();

  // Dust lanes, drawn dark over the glow. They have to be soft the whole way out — a hard-edged
  // dark shape over a near-black field doesn't read as dust, it reads as a rendering fault.
  for (const lane of dustLanes) {
    const reach = lane.length * span;
    ctx.save();
    ctx.translate(lane.along * span, lane.across * halfWidth);
    ctx.rotate(lane.tilt);
    ctx.scale(1, (lane.thickness * halfWidth) / reach);
    const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    shade.addColorStop(0, `rgba(2, 1, 10, ${lane.alpha})`);
    shade.addColorStop(0.55, `rgba(2, 1, 10, ${lane.alpha * 0.45})`);
    shade.addColorStop(1, 'rgba(2, 1, 10, 0)');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(0, 0, reach, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // And the stars that resolve out of it.
  for (const star of bandStars) {
    ctx.fillStyle = rgba(star.tint, star.alpha);
    ctx.beginPath();
    ctx.arc(star.along * span, star.across * halfWidth, star.radius, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

function drawStars(ctx, W, H, t, layers, driftX, driftY, hole) {
  for (const layer of layers) {
    const dx = driftX * layer.depth;
    const dy = driftY * layer.depth;
    for (const star of layer.stars) {
      let x = wrap01(star.x + dx) * W;
      let y = wrap01(star.y + dy) * H;
      let alpha = clamp(star.alpha * (0.88 + 0.12 * Math.sin(t * star.twinkle + star.phase)), 0, 1);

      // Anything close to the hole gets pushed outward and brightened — a cheap stand-in for
      // gravitational lensing that crowds stars into a ring instead of swallowing them.
      const toHole = Math.hypot(x - hole.cx, y - hole.cy);
      if (toHole < hole.lens) {
        const bent = Math.sqrt(toHole * toHole + 2 * hole.shadow * hole.shadow);
        const blend = 1 - smoothstep(hole.shadow * 2, hole.lens, toHole);
        const scale = lerp(1, bent / Math.max(toHole, 0.001), blend);
        x = hole.cx + (x - hole.cx) * scale;
        y = hole.cy + (y - hole.cy) * scale;
        alpha = clamp(alpha * (1 + blend * 0.8), 0, 1);
      }
      if (alpha <= 0.01) continue;

      ctx.fillStyle = rgba(star.tint, alpha);
      ctx.beginPath();
      ctx.arc(x, y, star.radius, 0, TAU);
      ctx.fill();

      if (star.spike && star.radius > 1.3) {
        const reach = star.radius * 6;
        ctx.strokeStyle = rgba(star.tint, alpha * 0.3);
        ctx.lineWidth = star.radius * 0.32;
        ctx.beginPath();
        ctx.moveTo(x - reach, y);
        ctx.lineTo(x + reach, y);
        ctx.moveTo(x, y - reach);
        ctx.lineTo(x, y + reach);
        ctx.stroke();
      }
    }
  }
}

/* --------------------------------------------------------- black hole ---- */

function holeGeometry(W, H) {
  const m = Math.min(W, H);
  return {
    cx: W * BLACK_HOLE.x,
    cy: H * BLACK_HOLE.y,
    shadow: m * 0.037,
    lens: m * 0.037 * 5.5,
  };
}

/**
 * The hole itself: an accretion disc seen nearly edge-on, with its far side lensed up and over
 * the shadow. Drawn in three passes — far side, then the shadow and its photon ring, then the
 * near side in front — which is what makes the disc read as wrapping around a sphere of nothing.
 */
function drawBlackHole(ctx, W, H, t, hole) {
  const { cx, cy, shadow } = hole;
  const outer = shadow * 3.6;
  // Tilted enough that the disc reads as a ring seen in perspective. Near edge-on with a thick
  // stroke it just fills in, and a black hole becomes a flying saucer.
  const ry = outer * 0.3;
  const spin = t * 0.16;

  const discGradient = (alpha) => {
    const g = ctx.createLinearGradient(cx - outer, cy, cx + outer, cy);
    g.addColorStop(0, `rgba(80, 240, 255, ${alpha * 0.8})`);
    g.addColorStop(0.35, `rgba(190, 120, 255, ${alpha})`);
    g.addColorStop(0.7, `rgba(255, 74, 200, ${alpha})`);
    g.addColorStop(1, `rgba(255, 150, 120, ${alpha * 0.75})`);
    return g;
  };

  // Far side, behind the shadow: clipped to above the hole's midline.
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - outer * 1.4, cy - outer * 1.4, outer * 2.8, outer * 1.4);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  strokeDisc(ctx, cx, cy, outer, ry, discGradient(0.34), shadow * 0.42);
  ctx.restore();

  // The far side again, bent up over the top of the shadow. This arc is the whole illusion, so it
  // stays tight to the shadow — any further out and it detaches into a handle.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [radius, widthScale, alpha] of [
    [shadow * 1.5, 1.3, 0.16],
    [shadow * 1.36, 0.5, 0.4],
  ]) {
    ellipseArcPath(ctx, cx, cy, radius, radius * 0.9, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = discGradient(alpha);
    ctx.lineWidth = shadow * 0.22 * widthScale;
    ctx.stroke();
  }
  ctx.restore();

  // The shadow. Nothing comes out, so nothing is drawn — flat, absolute black.
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(cx, cy, shadow, 0, TAU);
  ctx.fill();

  // Photon ring: the hard bright circle right on the edge of the shadow.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255, 226, 250, ${0.55 + 0.08 * Math.sin(t * 0.6)})`;
  ctx.lineWidth = Math.max(1, shadow * 0.045);
  ctx.beginPath();
  ctx.arc(cx, cy, shadow * 1.035, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // Near side, in front of the shadow — brighter, because we're seeing it lit from behind.
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - outer * 1.4, cy, outer * 2.8, outer * 1.4);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  strokeDisc(ctx, cx, cy, outer, ry, discGradient(0.46), shadow * 0.42);
  ctx.restore();

  // Material streaming round: short bright arcs that advance, so the disc is visibly turning.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i += 1) {
    const start = spin * (1 + i * 0.11) + (i / 5) * TAU;
    ellipseArcPath(ctx, cx, cy, outer * (0.82 + i * 0.05), ry * (0.82 + i * 0.05), start, start + 0.45);
    ctx.strokeStyle = rgba(i % 2 ? CYAN : MAGENTA, 0.26);
    ctx.lineWidth = shadow * 0.07;
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, cx, cy, outer * 2.2, VIOLET, 0.07, 0.02);
  ctx.restore();
}

function strokeDisc(ctx, cx, cy, rx, ry, stroke, lineWidth) {
  ellipseArcPath(ctx, cx, cy, rx, ry, 0, TAU);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/* ------------------------------------------------------ neutron binary ---- */

/** Two dead stars going round each other far too fast, and the only light in the scene. */
function drawNeutronBinary(ctx, W, H, t) {
  const m = Math.min(W, H);
  const cx = W * KEY_STAR.x;
  const cy = H * KEY_STAR.y;
  // Wide enough apart to read as two objects rather than one smeared one.
  const separation = m * 0.055;
  const angle = (t / 4.6) * TAU;

  const dx = Math.cos(angle) * separation;
  const dy = Math.sin(angle) * separation * 0.34;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // The halo the pair share. No drawn orbit line — at this size it read as a tiny ringed planet.
  glow(ctx, cx, cy, m * 0.3, [150, 190, 255], 0.06, 0.018);

  // Whichever star is lower is nearer, so it goes on top.
  const stars = [
    { x: cx + dx, y: cy + dy, tint: [214, 250, 255] },
    { x: cx - dx, y: cy - dy, tint: [255, 214, 246] },
  ].sort((a, b) => a.y - b.y);

  for (const star of stars) {
    glow(ctx, star.x, star.y, m * 0.032, star.tint, 0.4, 0.12);
    spike(ctx, star.x, star.y, m * 0.1, Math.max(0.7, m * 0.0016), 0.36, true);
    spike(ctx, star.x, star.y, m * 0.06, Math.max(0.7, m * 0.0016), 0.3, false);
    ctx.fillStyle = rgba(star.tint, 0.98);
    ctx.beginPath();
    ctx.arc(star.x, star.y, Math.max(0.9, m * 0.003), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function spike(ctx, x, y, length, thickness, alpha, horizontal) {
  const g = horizontal
    ? ctx.createLinearGradient(x - length, y, x + length, y)
    : ctx.createLinearGradient(x, y - length, x, y + length);
  g.addColorStop(0, 'rgba(214, 232, 255, 0)');
  g.addColorStop(0.5, `rgba(240, 246, 255, ${alpha})`);
  g.addColorStop(1, 'rgba(214, 232, 255, 0)');
  ctx.strokeStyle = g;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(x - length, y);
    ctx.lineTo(x + length, y);
  } else {
    ctx.moveTo(x, y - length);
    ctx.lineTo(x, y + length);
  }
  ctx.stroke();
}

/* -------------------------------------------------------------- extras ---- */

function drawShootingStar(ctx, W, H, t, shooters) {
  const index = Math.floor(t / SHOOTER_PERIOD);
  const shooter = shooters[((index % shooters.length) + shooters.length) % shooters.length];
  const local = t - index * SHOOTER_PERIOD;
  const p = local / shooter.duration;
  if (p < 0 || p > 1) return;

  const span = Math.max(W, H) * shooter.length;
  const dirX = Math.cos(shooter.angle);
  const dirY = Math.sin(shooter.angle);
  const headX = shooter.x * W + dirX * span * p;
  const headY = shooter.y * H + dirY * span * p;
  const tailLength = span * 0.45 * smoothstep(0, 0.25, p);
  const alpha = Math.sin(p * Math.PI) * 0.7;

  const streak = ctx.createLinearGradient(headX - dirX * tailLength, headY - dirY * tailLength, headX, headY);
  streak.addColorStop(0, 'rgba(255, 74, 200, 0)');
  streak.addColorStop(0.6, `rgba(255, 160, 230, ${alpha * 0.5})`);
  streak.addColorStop(1, `rgba(255, 255, 255, ${alpha})`);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = streak;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(headX - dirX * tailLength, headY - dirY * tailLength);
  ctx.lineTo(headX, headY);
  ctx.stroke();
  ctx.restore();
}

/**
 * Every snore pushes a wireframe solid out of the sleeper, and it keeps going. They expand past
 * the edge of the frame and thin out to nothing — the sound leaving, with nothing to carry it.
 */
function drawEchoes(ctx, W, H, t, originX, originY) {
  const reach = Math.max(W, H);
  const newest = Math.floor(t / SNORE_PERIOD);
  const alive = Math.ceil(ECHO_LIFE / SNORE_PERIOD);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let k = 0; k < alive; k += 1) {
    const index = newest - k;
    if (index < 0) continue;
    const age = t - index * SNORE_PERIOD;
    if (age < 0 || age > ECHO_LIFE) continue;

    const p = age / ECHO_LIFE;
    const alpha = Math.sin(Math.PI * Math.min(p * 1.15, 1)) ** 1.4 * 0.32;
    if (alpha <= 0.01) continue;

    const sides = ECHO_SHAPES[((index % ECHO_SHAPES.length) + ECHO_SHAPES.length) % ECHO_SHAPES.length];
    // Eased so they leave quickly and then coast — born on top of the sleeper they just read as
    // a glitch over the bed, so the first thing they do is get clear of it.
    const spread = p ** 0.72;
    const radius = reach * (0.02 + spread * 0.36);
    const x = originX + reach * (0.05 + spread * 0.3);
    const y = originY - reach * (0.03 + spread * 0.24);
    const tint = index % 2 ? CYAN : MAGENTA;

    ctx.strokeStyle = rgba(tint, alpha);
    ctx.lineWidth = Math.max(0.8, reach * 0.0016 * (1 - p * 0.5));
    polygonPath(ctx, x, y, radius, sides, p * 0.7 + index * 0.4);
    ctx.stroke();

    // A second, tighter copy just inside it reads as a ring rather than an outline.
    ctx.strokeStyle = rgba(tint, alpha * 0.4);
    ctx.lineWidth = Math.max(0.6, reach * 0.0009);
    polygonPath(ctx, x, y, radius * 0.93, sides, p * 0.7 + index * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignette(ctx, W, H) {
  const radius = Math.hypot(W, H) * 0.62;
  const vignette = ctx.createRadialGradient(W / 2, H / 2, radius * 0.3, W / 2, H / 2, radius);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

/* ---------------------------------------------------------------- bed ---- */

function drawBed(ctx, t) {
  // One snore: a long draw in, a longer let out. The echoes ride the same clock.
  const breath = wave(t, SNORE_PERIOD);
  const flutter = wave(t, 11.5, 0.9); // the duvet's free corner in zero gravity

  drawHeadboard(ctx);
  drawFootboard(ctx);
  drawLegs(ctx, true);
  drawMattress(ctx);
  drawFrame(ctx);
  drawLegs(ctx, false);
  drawPillows(ctx);
  drawSleeper(ctx, breath, t);
  drawDuvet(ctx, t, breath, flutter);
  drawRimLight(ctx, breath);
}

function drawHeadboard(ctx) {
  ctx.fillStyle = FRAME_DARK;
  roundedRect(ctx, -354, -196, 40, 240, 18);
  ctx.fill();
}

function drawFootboard(ctx) {
  ctx.fillStyle = FRAME_DARK;
  roundedRect(ctx, 314, -70, 36, 114, 14);
  ctx.fill();
}

function drawLegs(ctx, back) {
  const positions = back ? [-268, 250] : [-300, 282];
  const top = back ? 52 : 56;
  const height = back ? 40 : 52;
  ctx.fillStyle = back ? '#0a0518' : FRAME_DARK;
  for (const x of positions) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + 22, top);
    ctx.lineTo(x + 16, top + height);
    ctx.lineTo(x + 6, top + height);
    ctx.closePath();
    ctx.fill();
  }
}

function drawMattress(ctx) {
  const side = ctx.createLinearGradient(0, -10, 0, 36);
  side.addColorStop(0, LINEN);
  side.addColorStop(1, '#1a1030');
  ctx.fillStyle = side;
  roundedRect(ctx, -302, -12, 604, 48, 14);
  ctx.fill();

  // The sliver of top surface that makes the view read as slightly-from-above.
  const top = ctx.createLinearGradient(0, -34, 0, -6);
  top.addColorStop(0, LINEN_LIGHT);
  top.addColorStop(1, LINEN);
  ctx.fillStyle = top;
  roundedRect(ctx, -298, -34, 596, 30, 14);
  ctx.fill();
}

function drawFrame(ctx) {
  ctx.fillStyle = FRAME_DARK;
  roundedRect(ctx, -318, 28, 636, 34, 10);
  ctx.fill();
}

function pillow(ctx, cx, cy, rx, ry, tilt, light, shade) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  const g = ctx.createLinearGradient(0, -ry, 0, ry);
  g.addColorStop(0, light);
  g.addColorStop(1, shade);
  ctx.fillStyle = g;
  roundedRect(ctx, -rx, -ry, rx * 2, ry * 2, ry * 0.9);
  ctx.fill();
  ctx.restore();
}

function drawPillows(ctx) {
  // Kept dark: the brightest things in frame are the neutron pair, the accretion disc, and the
  // sleeper's face — in that order. A bright pillow steals from all three.
  pillow(ctx, -266, -78, 80, 34, -0.14, '#2e2049', '#100a22');
  pillow(ctx, -248, -50, 78, 32, -0.07, '#4c3a75', '#191030');
}

function drawSleeper(ctx, breath, t) {
  const lift = breath * 1.5; // the head rides the breath a little

  // Hair spread across the pillow, then the face set well down and to the right of it, so a
  // thick crescent of hair frames the face instead of the head reading as a bare sphere.
  ctx.fillStyle = HAIR;
  fillEllipse(ctx, -256, -84 + lift, 34, 26);
  ctx.beginPath();
  ctx.arc(-228, -106 + lift, 44, 0, TAU);
  ctx.fill();

  drawHairWisps(ctx, t, lift);

  // Neck, tucked toward the covers (the duvet is drawn after this and hides the join).
  ctx.fillStyle = SKIN_SHADE;
  roundedRect(ctx, -208, -72 + lift, 34, 34, 12);
  ctx.fill();

  // A thin cold graze along the crown, so the skull has a top edge against the void.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(120, 220, 255, 0.3)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(-228, -106 + lift, 44, Math.PI * 1.5, Math.PI * 1.88);
  ctx.stroke();
  ctx.restore();

  // Face. At this scale it is a handful of pixels — one closed eye is all the detail that
  // survives. Lit hard from the binary and falling to nothing on the far side, so the head reads
  // as a sphere emerging from the dark rather than a disc pasted on it.
  const face = ctx.createLinearGradient(-184, -120, -230, -60);
  face.addColorStop(0, '#f0b8a0');
  face.addColorStop(0.5, '#b06e78');
  face.addColorStop(1, '#3a1c34');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(-206, -92 + lift, 33, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-176, -88 + lift, 7, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#2a1428';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-190, -98 + lift, 7.5, Math.PI * 1.06, Math.PI * 1.94);
  ctx.stroke();

  // The mouth, open a crack on the out-breath. It's where the sound is coming from.
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = 'rgba(52, 20, 44, 0.85)';
  ctx.beginPath();
  ctx.arc(-186, -74 + lift, 5 + Math.max(0, breath) * 3.5, Math.PI * 0.05, Math.PI * 0.75);
  ctx.stroke();
}

/** A few strands lifting off the pillow — the cheapest possible tell that gravity is missing. */
function drawHairWisps(ctx, t, lift) {
  ctx.strokeStyle = HAIR;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i += 1) {
    const drift = wave(t, 9.5 + i * 1.9, i * 1.9);
    const startX = -252 - i * 11;
    const startY = -122 - i * 8 + lift;
    ctx.lineWidth = 2.2 - i * 0.4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    // A short curl that loops back on itself: it can never straighten into an antenna, whatever
    // phase the drift happens to be in.
    ctx.bezierCurveTo(
      startX - 6,
      startY - 13,
      startX - 21 + drift * 3,
      startY - 15 + drift * 3,
      startX - 25 - i * 2 + drift * 4,
      startY - 5 + drift * 3,
    );
    ctx.stroke();
  }
}

/**
 * The duvet's top edge, from the sleeper's chin to the foot of the bed: shoulder, waist, hip,
 * thigh, feet. Traced on its own so the rim light can stroke exactly the same silhouette.
 */
function traceDuvetTop(ctx, breath) {
  const shoulder = -106 - breath * 5;
  const hip = -112 - breath * 2;
  ctx.moveTo(-180, -50);
  ctx.bezierCurveTo(-168, -88, -136, shoulder - 6, -96, shoulder);
  ctx.bezierCurveTo(-62, shoulder + 4, -46, -76, -6, -76);
  ctx.bezierCurveTo(30, -76, 54, hip - 4, 96, hip);
  ctx.bezierCurveTo(136, hip + 6, 162, -76, 196, -72);
  ctx.bezierCurveTo(232, -68, 268, -54, 300, -48);
  ctx.bezierCurveTo(320, -44, 334, -38, 342, -28);
}

function drawDuvet(ctx, t, breath, flutter) {
  ctx.beginPath();
  traceDuvetTop(ctx, breath);

  // The free corner past the footboard, drifting because nothing holds it down.
  ctx.bezierCurveTo(356 + flutter * 6, -4, 358 + flutter * 10, 20, 346 + flutter * 14, 44);

  // Hem, draped over the side rail and rippling very slowly.
  const hemStart = 346;
  const hemEnd = -182;
  const steps = 7;
  for (let i = 1; i <= steps; i += 1) {
    const x0 = lerp(hemStart, hemEnd, (i - 1) / steps);
    const x1 = lerp(hemStart, hemEnd, i / steps);
    const dip = 66 + Math.sin(i * 1.7 + t * 0.26) * 9;
    const end = 50 + Math.sin(i * 2.1 + t * 0.22) * 5;
    ctx.quadraticCurveTo((x0 + x1) / 2, dip, x1, end);
  }
  // Soft edge back up to the chin.
  ctx.bezierCurveTo(-198, 22, -196, -18, -180, -50);
  ctx.closePath();

  // Lit along the top, falling away to nothing underneath.
  const body = ctx.createLinearGradient(-220, -140, 240, 90);
  body.addColorStop(0, '#8a3ec4');
  body.addColorStop(0.4, '#3d1470');
  body.addColorStop(1, '#0d0426');
  ctx.fillStyle = body;
  ctx.fill();

  // Creases, clipped to the duvet so they never bleed onto the mattress.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(8, 2, 22, 0.24)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-92, -92);
  ctx.bezierCurveTo(-60, -60, -40, -34, -26, 30);
  ctx.moveTo(104, -98);
  ctx.bezierCurveTo(126, -58, 138, -30, 150, 34);
  ctx.moveTo(232, -58);
  ctx.bezierCurveTo(248, -30, 254, -8, 258, 40);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 150, 230, 0.09)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-40, -86);
  ctx.bezierCurveTo(-14, -50, 4, -20, 16, 36);
  ctx.moveTo(170, -78);
  ctx.bezierCurveTo(190, -44, 198, -18, 204, 38);
  ctx.stroke();
  ctx.restore();

  drawSheetCuff(ctx, breath);
}

/** The folded-back sheet at the top of the duvet — what makes it read as "tucked in". */
function drawSheetCuff(ctx, breath) {
  const shoulder = -106 - breath * 5;
  ctx.beginPath();
  ctx.moveTo(-180, -50);
  ctx.bezierCurveTo(-168, -88, -136, shoulder - 6, -96, shoulder);
  ctx.bezierCurveTo(-132, shoulder - 22, -170, -104, -200, -54);
  ctx.closePath();

  const cuff = ctx.createLinearGradient(-190, -110, -110, -40);
  cuff.addColorStop(0, '#6f5f9c');
  cuff.addColorStop(1, '#1d1433');
  ctx.fillStyle = cuff;
  ctx.fill();
}

/** The binary catching every upward-facing edge — the only thing separating the bed from the
 *  void behind it. */
function drawRimLight(ctx, breath) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  // Falls off toward the head end, which is turned away from the light. An even rim reads as
  // neon piping; an uneven one reads as a surface.
  const falloff = ctx.createLinearGradient(-220, 0, 360, 0);
  falloff.addColorStop(0, 'rgba(255, 110, 210, 0.12)');
  falloff.addColorStop(0.45, 'rgba(180, 160, 255, 0.34)');
  falloff.addColorStop(1, 'rgba(120, 240, 255, 0.62)');
  ctx.strokeStyle = falloff;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  traceDuvetTop(ctx, breath);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 110, 210, 0.22)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-345, -176);
  ctx.lineTo(-345, 24);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120, 240, 255, 0.5)';
  ctx.beginPath();
  // The footboard's lit face — nearest the binary, so it gets the hardest edge on the bed.
  ctx.moveTo(346, -58);
  ctx.lineTo(346, 34);
  ctx.stroke();
  ctx.restore();
}

/** Barely there — a whisper of breath, dissolving. */
function drawZzz(ctx, t) {
  const cycle = SNORE_PERIOD * 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i += 1) {
    const p = wrap01(t / cycle + i / 3);
    const alpha = Math.sin(p * Math.PI) * 0.26;
    if (alpha <= 0.01) continue;
    const size = 24 + p * 46;
    const x = -166 + p * 210 + Math.sin(p * 5.5 + i) * 18;
    const y = -160 - p * 300;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(p * 3 + i) * 0.18);
    ctx.font = `italic 300 ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = rgba([236, 200, 255], alpha);
    ctx.fillText('Z', 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
