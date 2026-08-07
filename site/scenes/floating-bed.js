// "A bed floating in space with someone snuggled under the covers peacefully sleeping while the
//  bed gently floats amongst the stars."
//
// Composed for scale, not for comfort: the bed is a few hundred pixels of warm dark against a
// void, a galactic band, and the unlit limb of something enormous. Almost all of the frame is
// empty on purpose — the emptiness is the subject, and the sleeper is what makes it hurt.
//
// Everything is drawn from paths — no images, no fonts beyond a stray "Z" — so the scene stays a
// few kilobytes and renders identically in a browser and in the headless render tests.

import { createRng } from '../lib/rng.js';
import {
  TAU,
  clamp,
  glow,
  lerp,
  rgba,
  roundedRect,
  fillEllipse,
  smoothstep,
  wave,
  wrap01,
} from '../lib/draw.js';

export const meta = {
  id: 'floating-bed',
  title: 'Asleep Among the Stars',
  prompt:
    'a bed floating in space with someone snuggled under the covers peacefully sleeping while the bed gently floats amongst the stars',
  created: '2026-08-07',
  background: '#000208',
  // Where the still frame is taken when the visitor prefers reduced motion.
  posterTime: 34,
};

// The bed is ~714 units long and is scaled against the viewport's short edge, so the larger the
// screen, the smaller it becomes in frame — the bigger your window, the more lost it looks.
const BED_SCALE = 0.00056;

const STAR_TINTS = [
  [255, 255, 255],
  [255, 255, 255],
  [255, 255, 255],
  [198, 219, 255],
  [255, 226, 190],
];

// Cold and near-monochrome. The only warmth in the whole frame is the sleeper.
const VOID_TOP = '#04060f';
const VOID_MID = '#02030a';
const VOID_DEEP = '#000104';

const FRAME_DARK = '#090b16';
const FRAME_EDGE = '#1a2038';
const LINEN = '#333b52';
const LINEN_LIGHT = '#5a6684';
// Cool near-black rather than true black: the hair has to sit a hair's breadth above the void,
// or the head reads as bald and the graze light along the crown looks like a detached wire.
const HAIR = '#1b1927';
const SKIN = '#c1926f';
const SKIN_SHADE = '#7d5c46';

const SHOOTER_PERIOD = 27; // seconds between shooting stars — rare enough to feel like luck

// The distant sun, in normalised viewport coordinates. Everything with a lit edge — the planet's
// limb, the duvet, the sleeper's face — is lit from here, so it lives in one place.
const KEY_STAR = { x: 0.82, y: 0.15 };

export function create({ width, height, seed = meta.id }) {
  const rng = createRng(seed);

  // Star positions live in normalised space so a resize never reshuffles the sky.
  const layers = [
    makeStarLayer(rng, { count: 520, minRadius: 0.3, maxRadius: 0.8, alpha: 0.42, depth: 0.06 }),
    makeStarLayer(rng, { count: 120, minRadius: 0.7, maxRadius: 1.4, alpha: 0.72, depth: 0.14 }),
    makeStarLayer(rng, { count: 26, minRadius: 1.3, maxRadius: 2.3, alpha: 1, depth: 0.3 }),
  ];

  // The galactic band: stars clustered along an axis, in the band's own rotated space.
  const bandStars = Array.from({ length: 340 }, () => {
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

  // Two washes, both cold. Any third colour starts to look decorative.
  const nebulae = [
    { x: rng.range(0.2, 0.4), y: rng.range(0.3, 0.5), radius: 0.55, colour: [46, 60, 140], alpha: 0.08 },
    { x: rng.range(0.6, 0.8), y: rng.range(0.5, 0.75), radius: 0.42, colour: [26, 84, 106], alpha: 0.05 },
  ].map((n) => ({ ...n, phase: rng.range(0, TAU), drift: rng.range(0.004, 0.011) }));

  const shooters = Array.from({ length: 9 }, () => ({
    x: rng.range(0.02, 0.6),
    y: rng.range(0.04, 0.4),
    angle: rng.range(0.2, 0.5),
    length: rng.range(0.22, 0.4),
    duration: rng.range(1.3, 2),
  }));

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

      drawVoid(ctx, W, H);
      drawNebulae(ctx, W, H, t, nebulae);
      drawGalacticBand(ctx, W, H, bandStars, dustLanes);
      drawStars(ctx, W, H, t, layers, driftX, driftY);
      drawKeyStar(ctx, W, H, t);
      drawShootingStar(ctx, W, H, t, shooters);
      // After the stars, because it blots them out. That silhouette is the whole point.
      drawPlanet(ctx, W, H);

      const scale = Math.min(W, H) * BED_SCALE;
      const cx = W * (0.34 + driftX);
      const cy = H * (0.37 + driftY);
      // A tumble so slow you only notice it by looking away and back.
      const tumble = wave(t, 127, 1.4) * 0.1 + wave(t, 61, 0.2) * 0.028;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      // The one warm thing in the frame, and it is very nearly nothing.
      glow(ctx, -170, -70, 900, [255, 176, 112], 0.055, 0.014);
      ctx.rotate(tumble);
      drawBed(ctx, t);
      drawZzz(ctx, t);
      ctx.restore();

      drawVignette(ctx, W, H);
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

function drawNebulae(ctx, W, H, t, nebulae) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const n of nebulae) {
    const cx = (n.x + Math.sin(t * n.drift + n.phase) * 0.02) * W;
    const cy = (n.y + Math.cos(t * n.drift * 0.8 + n.phase) * 0.016) * H;
    glow(ctx, cx, cy, n.radius * Math.max(W, H), n.colour, n.alpha, n.alpha * 0.42);
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

  // The diffuse glow of unresolved stars.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const wash = ctx.createLinearGradient(0, -halfWidth, 0, halfWidth);
  wash.addColorStop(0, 'rgba(56, 70, 136, 0)');
  wash.addColorStop(0.36, 'rgba(54, 66, 128, 0.07)');
  wash.addColorStop(0.5, 'rgba(100, 116, 186, 0.16)');
  wash.addColorStop(0.64, 'rgba(54, 66, 128, 0.07)');
  wash.addColorStop(1, 'rgba(56, 70, 136, 0)');
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
    const lane_ = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    lane_.addColorStop(0, `rgba(1, 2, 6, ${lane.alpha})`);
    lane_.addColorStop(0.55, `rgba(1, 2, 6, ${lane.alpha * 0.45})`);
    lane_.addColorStop(1, 'rgba(1, 2, 6, 0)');
    ctx.fillStyle = lane_;
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

function drawStars(ctx, W, H, t, layers, driftX, driftY) {
  for (const layer of layers) {
    const dx = driftX * layer.depth;
    const dy = driftY * layer.depth;
    for (const star of layer.stars) {
      const alpha = clamp(star.alpha * (0.88 + 0.12 * Math.sin(t * star.twinkle + star.phase)), 0, 1);
      if (alpha <= 0.01) continue;
      const x = wrap01(star.x + dx) * W;
      const y = wrap01(star.y + dy) * H;

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

/** A distant sun: small, brutally bright, and the reason anything in the frame has an edge. */
function drawKeyStar(ctx, W, H, t) {
  const m = Math.min(W, H);
  const x = W * KEY_STAR.x;
  const y = H * KEY_STAR.y;
  const pulse = 0.94 + 0.06 * Math.sin(t * 0.19);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, m * 0.26, [128, 160, 240], 0.07 * pulse, 0.018 * pulse);
  glow(ctx, x, y, m * 0.045, [226, 238, 255], 0.42 * pulse, 0.13 * pulse);

  const spike = (length, thickness, alpha, horizontal) => {
    const g = horizontal
      ? ctx.createLinearGradient(x - length, y, x + length, y)
      : ctx.createLinearGradient(x, y - length, x, y + length);
    g.addColorStop(0, 'rgba(206, 224, 255, 0)');
    g.addColorStop(0.5, `rgba(236, 244, 255, ${alpha})`);
    g.addColorStop(1, 'rgba(206, 224, 255, 0)');
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
  };

  spike(m * 0.2 * pulse, Math.max(0.7, m * 0.002), 0.5 * pulse, true);
  spike(m * 0.13 * pulse, Math.max(0.7, m * 0.002), 0.4 * pulse, false);

  ctx.fillStyle = `rgba(255, 255, 255, ${0.95 * pulse})`;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, m * 0.0035), 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * Something enormous, just off frame, almost entirely unlit — we get its limb and nothing else.
 * It never moves. It's the thing that makes the bed small.
 */
function drawPlanet(ctx, W, H) {
  const m = Math.min(W, H);
  const cx = W + m * 0.15;
  const cy = H + m * 0.75;
  const r = m * 1.15;

  // The body occludes the star field behind it.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = '#010207';
  ctx.fill();

  // The faintest suggestion of a surface, only near the edge.
  ctx.clip();
  const surface = ctx.createRadialGradient(cx, cy, r * 0.88, cx, cy, r);
  surface.addColorStop(0, 'rgba(12, 16, 38, 0)');
  surface.addColorStop(1, 'rgba(34, 46, 96, 0.55)');
  ctx.fillStyle = surface;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  ctx.restore();

  // The limb: a blade of light, brightest where the surface faces the distant sun. The gradient
  // runs along the star→planet axis rather than between viewport corners, so the lit arc lands in
  // the same place whatever the window's shape.
  const starX = W * KEY_STAR.x;
  const starY = H * KEY_STAR.y;
  const distance = Math.hypot(cx - starX, cy - starY);
  const nearest = clamp((distance - r) / Math.max(distance, 1), 0, 0.9);

  const limbGradient = (alpha) => {
    const g = ctx.createLinearGradient(starX, starY, cx, cy);
    g.addColorStop(0, `rgba(224, 238, 255, ${alpha})`);
    g.addColorStop(nearest, `rgba(220, 236, 255, ${alpha})`);
    g.addColorStop(Math.min(1, nearest + 0.16), `rgba(150, 182, 245, ${alpha * 0.42})`);
    g.addColorStop(Math.min(1, nearest + 0.34), 'rgba(90, 120, 200, 0)');
    g.addColorStop(1, 'rgba(90, 120, 200, 0)');
    return g;
  };

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Wide and faint first (the atmosphere), then the hard edge on top.
  for (const [width, alpha] of [
    [m * 0.055, 0.05],
    [m * 0.016, 0.1],
    [Math.max(1.1, m * 0.0032), 0.9],
  ]) {
    ctx.strokeStyle = limbGradient(alpha);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

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
  const tailX = headX - dirX * tailLength;
  const tailY = headY - dirY * tailLength;
  const alpha = Math.sin(p * Math.PI) * 0.7;

  const streak = ctx.createLinearGradient(tailX, tailY, headX, headY);
  streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
  streak.addColorStop(1, `rgba(255, 255, 255, ${alpha})`);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = streak;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(headX, headY);
  ctx.stroke();
  ctx.restore();
}

function drawVignette(ctx, W, H) {
  const radius = Math.hypot(W, H) * 0.62;
  const vignette = ctx.createRadialGradient(W / 2, H / 2, radius * 0.3, W / 2, H / 2, radius);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

/* ---------------------------------------------------------------- bed ---- */

function drawBed(ctx, t) {
  const breath = wave(t, 6.4); // the sleeper's slow, even breathing
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
  ctx.fillStyle = back ? '#04050d' : FRAME_DARK;
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
  side.addColorStop(1, '#171c2c');
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
  // Kept dark: the brightest things in frame are the sun, the planet's limb, and the sleeper's
  // face — in that order. A bright pillow steals from all three.
  pillow(ctx, -266, -78, 80, 34, -0.14, '#2b3146', '#0d1120');
  pillow(ctx, -248, -50, 78, 32, -0.07, '#454f6c', '#161b29');
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
  ctx.strokeStyle = 'rgba(150, 180, 240, 0.26)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(-228, -106 + lift, 44, Math.PI * 1.5, Math.PI * 1.88);
  ctx.stroke();
  ctx.restore();

  // Face. At this scale it is a handful of pixels — one closed eye is all the detail that
  // survives. Lit hard from the distant sun and falling to nothing on the far side, so the head
  // reads as a sphere emerging from the dark rather than a disc pasted on it.
  const face = ctx.createLinearGradient(-184, -120, -230, -60);
  face.addColorStop(0, '#dcae86');
  face.addColorStop(0.5, '#a87c5e');
  face.addColorStop(1, '#43301f');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(-206, -92 + lift, 33, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-176, -88 + lift, 7, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#2c2028';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-190, -98 + lift, 7.5, Math.PI * 1.06, Math.PI * 1.94);
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
  body.addColorStop(0, '#3a4578');
  body.addColorStop(0.4, '#1a2044');
  body.addColorStop(1, '#080b1e');
  ctx.fillStyle = body;
  ctx.fill();

  // Creases, clipped to the duvet so they never bleed onto the mattress.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(4, 6, 18, 0.22)';
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
  cuff.addColorStop(0, '#5a667f');
  cuff.addColorStop(1, '#1c2231');
  ctx.fillStyle = cuff;
  ctx.fill();
}

/** The distant sun catching every upward-facing edge. It is the only thing separating the bed
 *  from the void behind it. */
function drawRimLight(ctx, breath) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  // Falls off toward the head end, which is turned away from the light. An even rim reads as
  // neon piping; an uneven one reads as a surface.
  const falloff = ctx.createLinearGradient(-220, 0, 360, 0);
  falloff.addColorStop(0, 'rgba(178, 206, 255, 0.1)');
  falloff.addColorStop(0.45, 'rgba(178, 206, 255, 0.34)');
  falloff.addColorStop(1, 'rgba(198, 220, 255, 0.6)');
  ctx.strokeStyle = falloff;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  traceDuvetTop(ctx, breath);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(178, 206, 255, 0.22)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-345, -176);
  ctx.lineTo(-345, 24);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(198, 220, 255, 0.5)';
  ctx.beginPath();
  // The footboard's lit face — nearest the sun, so it gets the hardest edge on the bed.
  ctx.moveTo(346, -58);
  ctx.lineTo(346, 34);
  ctx.stroke();
  ctx.restore();
}

/** Barely there — a whisper of breath, dissolving. */
function drawZzz(ctx, t) {
  const cycle = 11;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i += 1) {
    const p = wrap01(t / cycle + i / 3);
    const alpha = Math.sin(p * Math.PI) * 0.24;
    if (alpha <= 0.01) continue;
    const size = 24 + p * 46;
    const x = -166 + p * 210 + Math.sin(p * 5.5 + i) * 18;
    const y = -160 - p * 300;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(p * 3 + i) * 0.18);
    ctx.font = `italic 300 ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = rgba([198, 216, 255], alpha);
    ctx.fillText('Z', 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
