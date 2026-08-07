// "A bed floating in space with someone snuggled under the covers peacefully sleeping while the
//  bed gently floats amongst the stars."
//
// Everything here is drawn from paths — no images, no fonts beyond a stray "Z" — so the scene
// stays a few kilobytes and renders identically in a browser and in the headless render tests.

import { createRng } from '../lib/rng.js';
import {
  TAU,
  fitContain,
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
  background: '#04050d',
  // Where the still frame is taken when the visitor prefers reduced motion.
  posterTime: 7.4,
};

// The bed is composed against a fixed box and scaled to fit whatever screen shows up. The box is
// sized to the bed plus the headroom the Zzz's drift into, so the composition fills the frame.
const DESIGN_WIDTH = 940;
const DESIGN_HEIGHT = 660;

const STAR_TINTS = [
  [255, 255, 255],
  [255, 255, 255],
  [206, 226, 255],
  [255, 232, 205],
  [223, 214, 255],
];

const NEBULA_COLOURS = [
  [86, 66, 178],
  [32, 118, 140],
  [148, 62, 122],
  [58, 74, 190],
];

const WOOD = {
  light: '#a4795c',
  mid: '#7c5540',
  dark: '#4b3126',
  edge: '#33211a',
};

const SKIN = '#f0c8a6';
const SKIN_SHADE = '#d7a582';
const HAIR = '#3b2a35';
const SHOOTER_PERIOD = 12.5; // seconds between shooting stars

export function create({ width, height, seed = meta.id }) {
  const rng = createRng(seed);

  // Star positions live in normalised space so a resize never reshuffles the sky.
  const layers = [
    makeStarLayer(rng, { count: 460, minRadius: 0.35, maxRadius: 0.95, alpha: 0.55, depth: 0.15 }),
    makeStarLayer(rng, { count: 150, minRadius: 0.8, maxRadius: 1.6, alpha: 0.8, depth: 0.4 }),
    makeStarLayer(rng, { count: 38, minRadius: 1.5, maxRadius: 2.6, alpha: 1, depth: 0.85 }),
  ];

  const nebulae = Array.from({ length: 4 }, (_, i) => ({
    x: rng.range(0.1, 0.9),
    y: rng.range(0.1, 0.9),
    radius: rng.range(0.34, 0.62),
    colour: NEBULA_COLOURS[i % NEBULA_COLOURS.length],
    alpha: rng.range(0.07, 0.13),
    phase: rng.range(0, TAU),
    driftX: rng.range(0.008, 0.02),
    driftY: rng.range(0.006, 0.016),
  }));

  const shooters = Array.from({ length: 9 }, () => ({
    x: rng.range(0.02, 0.7),
    y: rng.range(0.04, 0.46),
    angle: rng.range(0.2, 0.52),
    length: rng.range(0.18, 0.34),
    duration: rng.range(1.1, 1.7),
  }));

  // Motes drift in the bed's own design space, so they float along with it.
  const motes = Array.from({ length: 30 }, () => ({
    x: rng.range(-430, 430),
    offset: rng.next(), // where in the rise it starts
    radius: rng.range(0.9, 2.3),
    speed: rng.range(9, 26), // design units per second
    alpha: rng.range(0.25, 0.65),
    phase: rng.range(0, TAU),
    sway: rng.range(6, 22),
  }));

  const planet = {
    x: rng.range(0.12, 0.22),
    y: rng.range(0.16, 0.28),
    radius: rng.range(0.07, 0.1),
  };

  let W = width;
  let H = height;

  return {
    resize(nextWidth, nextHeight) {
      W = nextWidth;
      H = nextHeight;
    },

    draw(ctx, t) {
      // The bed's gentle drift also nudges the sky, which is what sells the parallax.
      const driftX = wave(t, 23, 0.6) * 0.012 + wave(t, 37, 2.1) * 0.006;
      const driftY = wave(t, 29, 1.3) * 0.008;

      drawSky(ctx, W, H);
      drawNebulae(ctx, W, H, t, nebulae);
      drawPlanet(ctx, W, H, planet);
      drawStars(ctx, W, H, t, layers, driftX, driftY);
      drawShootingStar(ctx, W, H, t, shooters);

      const scale = fitContain(W, H, DESIGN_WIDTH, DESIGN_HEIGHT);
      const bobY = wave(t, 8.4) * 15 + wave(t, 13.1, 1.7) * 7;
      const swayX = wave(t, 11.6, 0.6) * 20;
      const tilt = wave(t, 17.3, 2.4) * 0.03;

      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);
      ctx.translate(swayX, bobY);

      // The halo is outside the tilt so the light stays anchored to the sleeper, not the frame.
      glow(ctx, -140, -60, 620, [255, 196, 132], 0.17, 0.05);
      glow(ctx, 20, 10, 420, [122, 148, 255], 0.08, 0.02);

      ctx.rotate(tilt);
      drawBed(ctx, t);
      drawMotes(ctx, t, motes);
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
      alpha: alpha * rng.range(0.55, 1),
      twinkle: rng.range(0.6, 2.4),
      phase: rng.range(0, TAU),
      tint: rng.pick(STAR_TINTS),
      spike: rng.next() > 0.72,
    })),
  };
}

function drawSky(ctx, W, H) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#070a1e');
  sky.addColorStop(0.55, '#05060f');
  sky.addColorStop(1, '#02030a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const depth = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.7);
  depth.addColorStop(0, 'rgba(42, 54, 120, 0.32)');
  depth.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = depth;
  ctx.fillRect(0, 0, W, H);
}

function drawNebulae(ctx, W, H, t, nebulae) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const n of nebulae) {
    const cx = (n.x + Math.sin(t * n.driftX + n.phase) * 0.03) * W;
    const cy = (n.y + Math.cos(t * n.driftY + n.phase) * 0.025) * H;
    const radius = n.radius * Math.max(W, H);
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.09 + n.phase);
    glow(ctx, cx, cy, radius, n.colour, n.alpha * pulse, n.alpha * pulse * 0.4);
  }
  ctx.restore();
}

function drawPlanet(ctx, W, H, planet) {
  const cx = planet.x * W;
  const cy = planet.y * H;
  const r = planet.radius * Math.min(W, H);

  ctx.save();
  ctx.globalAlpha = 0.55;
  const body = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r);
  body.addColorStop(0, '#3b4880');
  body.addColorStop(0.55, '#232a55');
  body.addColorStop(1, '#0d1128');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();

  // A thin lit limb so it reads as a sphere rather than a hole.
  ctx.strokeStyle = 'rgba(163, 186, 255, 0.22)';
  ctx.lineWidth = Math.max(0.8, r * 0.022);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.99, Math.PI * 1.15, Math.PI * 1.7);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, cx, cy, r * 2.6, [70, 96, 190], 0.1, 0.03);
  ctx.restore();
}

function drawStars(ctx, W, H, t, layers, driftX, driftY) {
  for (const layer of layers) {
    const dx = driftX * layer.depth;
    const dy = driftY * layer.depth;
    for (const star of layer.stars) {
      const alpha = star.alpha * (0.62 + 0.38 * Math.sin(t * star.twinkle + star.phase));
      if (alpha <= 0.01) continue;
      const x = wrap01(star.x + dx) * W;
      const y = wrap01(star.y + dy) * H;

      ctx.fillStyle = rgba(star.tint, alpha);
      ctx.beginPath();
      ctx.arc(x, y, star.radius, 0, TAU);
      ctx.fill();

      if (star.spike && star.radius > 1.4) {
        const reach = star.radius * 5.5 * (0.7 + 0.3 * alpha);
        ctx.strokeStyle = rgba(star.tint, alpha * 0.4);
        ctx.lineWidth = star.radius * 0.4;
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
  const tailLength = span * 0.38 * smoothstep(0, 0.25, p);
  const tailX = headX - dirX * tailLength;
  const tailY = headY - dirY * tailLength;
  const alpha = Math.sin(p * Math.PI) * 0.9;

  const streak = ctx.createLinearGradient(tailX, tailY, headX, headY);
  streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
  streak.addColorStop(1, `rgba(255, 255, 255, ${alpha})`);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = streak;
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(headX, headY);
  ctx.stroke();
  glow(ctx, headX, headY, 26, [255, 250, 235], alpha * 0.55, alpha * 0.16);
  ctx.restore();
}

function drawVignette(ctx, W, H) {
  const radius = Math.hypot(W, H) * 0.62;
  const vignette = ctx.createRadialGradient(W / 2, H / 2, radius * 0.42, W / 2, H / 2, radius);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

/* ---------------------------------------------------------------- bed ---- */

function drawBed(ctx, t) {
  const breath = wave(t, 5.6); // the sleeper's slow, even breathing
  const flutter = wave(t, 7.3, 0.9); // the duvet's free corner in zero gravity

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

function woodGradient(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, WOOD.light);
  g.addColorStop(0.45, WOOD.mid);
  g.addColorStop(1, WOOD.dark);
  return g;
}

function drawHeadboard(ctx) {
  ctx.fillStyle = woodGradient(ctx, -352, -196, -316, 44);
  roundedRect(ctx, -354, -196, 40, 240, 18);
  ctx.fill();

  // Inset panel, so the headboard has a little joinery instead of reading as a plank.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  roundedRect(ctx, -344, -180, 20, 190, 10);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 214, 176, 0.14)';
  roundedRect(ctx, -344, -180, 7, 190, 4);
  ctx.fill();
}

function drawFootboard(ctx) {
  ctx.fillStyle = woodGradient(ctx, 316, -70, 350, 44);
  roundedRect(ctx, 314, -70, 36, 114, 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 214, 176, 0.12)';
  roundedRect(ctx, 316, -66, 8, 104, 4);
  ctx.fill();
}

function drawLegs(ctx, back) {
  const positions = back ? [-268, 250] : [-300, 282];
  const top = back ? 52 : 56;
  const height = back ? 40 : 52;
  ctx.fillStyle = back ? WOOD.edge : woodGradient(ctx, 0, top, 0, top + height);
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
  // Side face.
  const side = ctx.createLinearGradient(0, -10, 0, 36);
  side.addColorStop(0, '#f4eee2');
  side.addColorStop(1, '#d9cfbe');
  ctx.fillStyle = side;
  roundedRect(ctx, -302, -12, 604, 48, 14);
  ctx.fill();

  // The sliver of top surface that makes the view read as slightly-from-above.
  const top = ctx.createLinearGradient(0, -34, 0, -6);
  top.addColorStop(0, '#fffaf1');
  top.addColorStop(1, '#eee5d6');
  ctx.fillStyle = top;
  roundedRect(ctx, -298, -34, 596, 30, 14);
  ctx.fill();

  // Quilting seam.
  ctx.strokeStyle = 'rgba(150, 133, 110, 0.35)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-286, 12);
  ctx.lineTo(286, 12);
  ctx.stroke();
}

function drawFrame(ctx) {
  ctx.fillStyle = woodGradient(ctx, 0, 28, 0, 62);
  roundedRect(ctx, -318, 28, 636, 34, 10);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 216, 178, 0.16)';
  roundedRect(ctx, -312, 31, 624, 7, 4);
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
  pillow(ctx, -266, -78, 80, 34, -0.14, '#efe8dc', '#cbc0b0');
  pillow(ctx, -248, -50, 78, 32, -0.07, '#fdfaf4', '#ddd3c4');
  // The dent the head presses into the pillow.
  ctx.save();
  ctx.globalAlpha = 0.18;
  fillEllipse(ctx, -214, -64, 44, 14, '#9c8f7c');
  ctx.restore();
}

function drawSleeper(ctx, breath, t) {
  const lift = breath * 1.5; // the head rides the breath a little

  // Hair spread across the pillow, then the face set on top so a crescent of hair frames it.
  ctx.fillStyle = HAIR;
  fillEllipse(ctx, -250, -88 + lift, 30, 22);
  ctx.beginPath();
  ctx.arc(-223, -103 + lift, 40, 0, TAU);
  ctx.fill();

  drawHairWisps(ctx, t, lift);

  // Neck, tucked toward the covers (the duvet is drawn after this and hides the join).
  ctx.fillStyle = SKIN_SHADE;
  roundedRect(ctx, -212, -74 + lift, 34, 34, 12);
  ctx.fill();

  // Face.
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(-210, -94 + lift, 34, 0, TAU);
  ctx.fill();
  // Nose.
  ctx.beginPath();
  ctx.arc(-179, -90 + lift, 7.5, 0, TAU);
  ctx.fill();

  // Cheek.
  ctx.save();
  ctx.globalAlpha = 0.22;
  fillEllipse(ctx, -190, -84 + lift, 11, 7, '#e08a72');
  ctx.restore();

  // Closed eye and a contented mouth.
  ctx.strokeStyle = '#4a3340';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(-193, -100 + lift, 7.5, Math.PI * 1.06, Math.PI * 1.94);
  ctx.stroke();

  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(74, 51, 64, 0.4)';
  ctx.beginPath();
  ctx.arc(-193, -110 + lift, 12, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(150, 84, 82, 0.65)';
  ctx.beginPath();
  ctx.arc(-190, -80 + lift, 7, Math.PI * 0.12, Math.PI * 0.62);
  ctx.stroke();
}

/** A few strands lifting off the pillow — the cheapest possible tell that gravity is missing. */
function drawHairWisps(ctx, t, lift) {
  ctx.strokeStyle = HAIR;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    const drift = wave(t, 6.5 + i * 1.3, i * 1.9);
    const startX = -246 - i * 10;
    const startY = -116 - i * 8 + lift;
    ctx.lineWidth = 2.4 - i * 0.4;
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
    const dip = 66 + Math.sin(i * 1.7 + t * 0.42) * 9;
    const end = 50 + Math.sin(i * 2.1 + t * 0.36) * 5;
    ctx.quadraticCurveTo((x0 + x1) / 2, dip, x1, end);
  }
  // Soft edge back up to the chin.
  ctx.bezierCurveTo(-198, 22, -196, -18, -180, -50);
  ctx.closePath();

  const body = ctx.createLinearGradient(-220, -140, 240, 90);
  body.addColorStop(0, '#8ea3e8');
  body.addColorStop(0.42, '#4f62aa');
  body.addColorStop(1, '#2a3670');
  ctx.fillStyle = body;
  ctx.fill();

  // Creases, clipped to the duvet so they never bleed onto the mattress.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(22, 30, 68, 0.15)';
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

  ctx.strokeStyle = 'rgba(178, 199, 255, 0.11)';
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
  cuff.addColorStop(0, '#fdfaf3');
  cuff.addColorStop(1, '#d9d0c1');
  ctx.fillStyle = cuff;
  ctx.fill();

  ctx.strokeStyle = 'rgba(120, 108, 92, 0.28)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-180, -50);
  ctx.bezierCurveTo(-168, -88, -136, shoulder - 6, -96, shoulder);
  ctx.stroke();
}

/** A cool additive edge light, as if a distant blue star were off to the upper left. */
function drawRimLight(ctx, breath) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(150, 182, 255, 0.28)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  traceDuvetTop(ctx, breath);
  ctx.stroke();

  // Only the headboard's outer edge — anything crossing the bedding reads as a stray wire.
  ctx.strokeStyle = 'rgba(150, 182, 255, 0.2)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-345, -178);
  ctx.lineTo(-345, 26);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------- extras ---- */

// Vertical band the motes recycle through, in design units.
const MOTE_BAND = 600;

function drawMotes(ctx, t, motes) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const mote of motes) {
    // Rise slowly and wrap, so the bed always sits in a gentle updraft of light.
    const y = 300 - wrap01(mote.offset + (t * mote.speed) / MOTE_BAND) * MOTE_BAND;
    const x = mote.x + Math.sin(t * 0.35 + mote.phase) * mote.sway;
    // Fade in as they enter the band and out as they leave it — no popping.
    const fade = mote.alpha * Math.min(smoothstep(300, 190, y), smoothstep(-300, -190, y));
    if (fade <= 0.01) continue;
    glow(ctx, x, y, mote.radius * 7, [255, 226, 189], fade * 0.5, fade * 0.15);
    ctx.fillStyle = rgba([255, 245, 230], fade);
    ctx.beginPath();
    ctx.arc(x, y, mote.radius, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawZzz(ctx, t) {
  const cycle = 6.4;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i += 1) {
    const p = wrap01(t / cycle + i / 3);
    const alpha = Math.sin(p * Math.PI) * 0.5;
    if (alpha <= 0.01) continue;
    const size = 20 + p * 30;
    const x = -166 + p * 132 + Math.sin(p * 5.5 + i) * 12;
    const y = -146 - p * 156;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(p * 3 + i) * 0.18);
    ctx.font = `italic 700 ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = rgba([228, 236, 255], alpha);
    ctx.fillText('Z', 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
