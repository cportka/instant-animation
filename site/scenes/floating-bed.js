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
import {
  chromaSplit,
  contrastPunch,
  dropoutBars,
  grain,
  hexDither,
  makeDropoutBars,
  makeShredZones,
  makeTearBands,
  diffuse,
  saturate,
  scanlines,
  shred,
  smearStreaks,
  tearBands,
} from '../lib/vhs.js';

export const meta = {
  id: 'floating-bed',
  title: 'Asleep Among the Stars',
  prompt:
    'a bed floating in space with someone snuggled under the covers peacefully sleeping while the bed gently floats amongst the stars',
  created: '2026-08-07',
  background: '#02010a',
  // Where the still frame is taken when the visitor prefers reduced motion.
  posterTime: 34,
  // Render at CSS resolution, not retina. The tape artefacts are full-screen fill-rate work, and
  // four times the pixels buys nothing a scene this deliberately lo-fi wants — on a high-DPI
  // display the softness the upscale adds is the right look anyway.
  maxDpr: 1,
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
const ROLL_PERIOD = 44; // one full turn about the pillow-to-foot axis
const GLASSES_CYCLE = 21; // sunglasses drift on, sit a while, drift off, stay away
const BURST_PERIOD = 9.5; // how often the tape gives out completely

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

export function create({ width, height, seed = meta.id, tape = null }) {
  const rng = createRng(seed);

  // Star positions live in normalised space so a resize never reshuffles the sky.
  const layers = [
    // Brighter than before: the haze raises the floor, and stars have to sit on top of it.
    makeStarLayer(rng, { count: 460, minRadius: 0.35, maxRadius: 0.9, alpha: 0.6, depth: 0.06 }),
    makeStarLayer(rng, { count: 120, minRadius: 0.8, maxRadius: 1.5, alpha: 0.9, depth: 0.14 }),
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
      tint: rng.int(0, STAR_TINTS.length - 1),
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

  // Colour in the air is most of what makes this vaporwave rather than a dark space scene with
  // pink accents, so the haze is heavy. Three washes, not more: each one fills a circle larger
  // than the screen with a radial gradient, and that is the single most expensive thing in the
  // frame — the intensity lives in the alpha, which is free.
  const haze = [
    { x: 0.26, y: 0.3, radius: 0.55, colour: MAGENTA, alpha: 0.2 },
    { x: 0.82, y: 0.58, radius: 0.5, colour: CYAN, alpha: 0.12 },
    { x: 0.46, y: 0.92, radius: 0.5, colour: VIOLET, alpha: 0.16 },
  ].map((h) => ({ ...h, phase: rng.range(0, TAU), drift: rng.range(0.004, 0.011) }));

  // Smaller clouds that visibly travel and wrap. The big washes set the colour; these are what
  // make the haze *move*, so nothing in the frame ever sits still and clean.
  const clouds = Array.from({ length: 7 }, () => ({
    x: rng.next(),
    y: rng.next(),
    radius: rng.range(0.15, 0.32),
    colour: rng.pick([MAGENTA, CYAN, VIOLET]),
    alpha: rng.range(0.035, 0.075),
    speedX: rng.range(-0.022, 0.022),
    speedY: rng.range(-0.012, 0.012),
    phase: rng.range(0, TAU),
    breathe: rng.range(0.05, 0.13),
  }));

  // Curve stitching: straight lines whose envelope is a parabola. Placed where nothing else is.
  const stringArt = [
    { x: 0.05, y: 0.95, size: 0.62, angle: -Math.PI / 2, spread: Math.PI / 2, lines: 16, colour: MAGENTA, alpha: 0.3 },
    { x: 0.98, y: 0.3, size: 0.4, angle: Math.PI * 0.55, spread: Math.PI * 0.42, lines: 12, colour: CYAN, alpha: 0.26 },
    // Tucked into the corner. Anywhere nearer the middle and its straight lines read as a box
    // thrown across the picture rather than as an envelope.
    { x: 0.015, y: 0.03, size: 0.22, angle: Math.PI * 0.5, spread: -Math.PI * 0.48, lines: 9, colour: VIOLET, alpha: 0.24 },
  ].map((s) => ({ ...s, phase: rng.range(0, TAU), sway: rng.range(0.02, 0.05) }));

  const shooters = Array.from({ length: 9 }, () => ({
    x: rng.range(0.02, 0.6),
    y: rng.range(0.04, 0.4),
    angle: rng.range(0.2, 0.5),
    length: rng.range(0.22, 0.4),
    duration: rng.range(1.3, 2),
  }));

  const bands = makeTearBands(rng, 6);
  const shredZones = makeShredZones(rng, 3);
  const bars = makeDropoutBars(rng, 3);

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
      drawHaze(ctx, W, H, t, haze, clouds);
      drawGalacticBand(ctx, W, H, bandStars, dustLanes);
      drawStars(ctx, W, H, t, layers, driftX, driftY, hole);
      drawStringArt(ctx, W, H, t, stringArt);
      drawShootingStar(ctx, W, H, t, shooters);
      // The accretion disc goes down first, then the whole pocket — background *and* disc — is
      // dragged through the lens together, and only then does the hard-edged shadow land on top.
      // Warping the disc along with everything else is what makes the hole distort itself.
      drawAccretion(ctx, W, H, t, hole);
      tape?.capture(ctx);
      drawLensWarp(ctx, W, H, t, hole, tape);
      drawHorizon(ctx, t, hole);
      drawNeutronBinary(ctx, W, H, t);

      const scale = Math.min(W, H) * BED_SCALE;
      const bedX = W * (0.34 + driftX);
      const bedY = H * (0.37 + driftY);
      // A tumble so slow you only notice it by looking away and back.
      const tumble = wave(t, 127, 1.4) * 0.1 + wave(t, 61, 0.2) * 0.028;

      // The sleeper's shapes leave from roughly where their head is, and keep going.
      drawEchoes(ctx, W, H, t, bedX - 200 * scale, bedY - 95 * scale);

      // A full turn about the axis running from the pillow to the foot of the bed. Seen from the
      // side that axis is horizontal, so the roll is a vertical squash: cos(roll) collapses the
      // bed to a line edge-on and inverts it past 90°. Eased so it dwells face-up and sweeps
      // through the back — still exactly one turn per period, just not at a constant rate.
      const spin = (t / ROLL_PERIOD) * TAU;
      const roll = spin - 0.55 * Math.sin(spin);
      const squash = Math.cos(roll);
      // Never scale to exactly zero: a degenerate matrix drops the whole frame.
      const flattened = (squash < 0 ? -1 : 1) * Math.max(Math.abs(squash), 0.04);

      ctx.save();
      ctx.translate(bedX, bedY);
      ctx.scale(scale, scale);
      // The one warm thing in the frame, and it is very nearly nothing.
      glow(ctx, -170, -70, 900, [255, 150, 190], 0.07, 0.018);
      ctx.rotate(tumble);
      ctx.save();
      ctx.scale(1, flattened);
      drawBed(ctx, t, squash);
      ctx.restore();
      // The breath drifts the same way whichever way up the bed is, so it stays outside the roll.
      drawZzz(ctx, t);
      ctx.restore();

      drawVignette(ctx, W, H);

      // Soft the whole picture out before the tape gets to it. The offset drifts, so the bloom
      // slides over everything instead of sitting on it.
      tape?.capture(ctx);
      diffuse(ctx, W, H, {
        amount: 0.26,
        blur: Math.max(3, Math.min(W, H) * 0.007),
        scale: 1.02 + Math.sin(t * 0.09) * 0.006,
        dx: Math.sin(t * 0.13) * 5,
        dy: Math.cos(t * 0.11) * 4,
      }, tape);

      // Tape last, over everything — including the sleeper. Ambient damage all the time, with the
      // heads giving out completely for about a second at a time.
      const burstAt = t - Math.floor(t / BURST_PERIOD) * BURST_PERIOD;
      const burst = burstAt < 0.95 ? Math.sin((burstAt / 0.95) * Math.PI) ** 0.6 : 0;

      // Ambient damage stays readable; the burst is where it goes to pieces.
      contrastPunch(ctx, W, H, 0.34 + burst * 0.26, tape);
      saturate(ctx, W, H, 0.42 + burst * 0.45);
      // Snapshot *after* the colour grade so displaced slices carry the same colour as the frame
      // they were torn out of, and before the displacement so the artefacts don't feed each other.
      tape?.capture(ctx);
      shred(ctx, W, H, t, shredZones, 0.22 + burst * 3.6, tape);
      tearBands(ctx, W, H, t, bands, 0.85 + burst * 2.8, tape);
      smearStreaks(ctx, W, H, t, 5 + Math.round(burst * 13), 0.45 + burst * 1.9, tape);
      dropoutBars(ctx, W, H, t, bars, 0.3 + burst * 1.45, tape);
      tape?.capture(ctx);
      chromaSplit(ctx, W, H, t, 1.1 + burst * 4.2, tape);
      if (burst > 0.12) {
        const y = wrap01(t * 0.07) * H;
        hexDither(ctx, W, y, H * 0.16, Math.max(9, H * 0.024), burst * 0.24);
      }
      scanlines(ctx, W, H, t, { spacing: 4, alpha: 0.16, rollSpeed: 5 });
      grain(ctx, W, H, t, { count: 34 + Math.round(burst * 90), alpha: 0.14, rate: 10 });
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
      tint: rng.int(0, STAR_TINTS.length - 1),
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

function drawHaze(ctx, W, H, t, haze, clouds) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const wash of haze) {
    const cx = (wash.x + Math.sin(t * wash.drift + wash.phase) * 0.03) * W;
    const cy = (wash.y + Math.cos(t * wash.drift * 0.8 + wash.phase) * 0.024) * H;
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.07 + wash.phase);
    glow(ctx, cx, cy, wash.radius * Math.max(W, H), wash.colour, wash.alpha * pulse, wash.alpha * pulse * 0.4);
  }

  // Travelling clouds, wrapped so they cross the frame and come back round.
  for (const cloud of clouds) {
    const cx = wrap01(cloud.x + t * cloud.speedX) * (W * 1.4) - W * 0.2;
    const cy = wrap01(cloud.y + t * cloud.speedY) * (H * 1.4) - H * 0.2;
    const swell = 1 + Math.sin(t * cloud.breathe + cloud.phase) * 0.22;
    glow(ctx, cx, cy, cloud.radius * Math.max(W, H) * swell, cloud.colour, cloud.alpha, cloud.alpha * 0.35);
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

  // And the stars that resolve out of it — one path per colour, same batching reason as the sky.
  for (let tint = 0; tint < STAR_TINTS.length; tint += 1) {
    ctx.fillStyle = rgba(STAR_TINTS[tint], 0.6);
    ctx.beginPath();
    let any = false;
    for (const star of bandStars) {
      if (star.tint !== tint) continue;
      const x = star.along * span;
      const y = star.across * halfWidth;
      ctx.moveTo(x + star.radius, y);
      ctx.arc(x, y, star.radius, 0, TAU);
      any = true;
    }
    if (any) ctx.fill();
  }

  ctx.restore();
}

function drawStars(ctx, W, H, t, layers, driftX, driftY, hole) {
  // Batched by colour and by a coarse alpha step: ~900 stars become a few dozen fills instead of
  // ~900. Individually filling each one is the single most expensive thing the scene does, and the
  // banding from quantising alpha to 1/8ths is invisible at these sizes.
  const batches = new Map();
  const spikes = [];

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

      const step = Math.round(alpha * 8);
      if (step <= 0) continue;
      const key = star.tint * 16 + step;
      let batch = batches.get(key);
      if (!batch) {
        batch = { tint: star.tint, alpha: step / 8, points: [] };
        batches.set(key, batch);
      }
      batch.points.push(x, y, star.radius);
      if (star.spike && star.radius > 1.3) spikes.push(x, y, star.radius, star.tint, alpha);
    }
  }

  for (const batch of batches.values()) {
    ctx.fillStyle = rgba(STAR_TINTS[batch.tint], batch.alpha);
    ctx.beginPath();
    for (let i = 0; i < batch.points.length; i += 3) {
      const r = batch.points[i + 2];
      ctx.moveTo(batch.points[i] + r, batch.points[i + 1]);
      ctx.arc(batch.points[i], batch.points[i + 1], r, 0, TAU);
    }
    ctx.fill();
  }

  for (let i = 0; i < spikes.length; i += 5) {
    const [x, y, radius, tint, alpha] = spikes.slice(i, i + 5);
    const reach = radius * 6;
    ctx.strokeStyle = rgba(STAR_TINTS[tint], alpha * 0.3);
    ctx.lineWidth = radius * 0.32;
    ctx.beginPath();
    ctx.moveTo(x - reach, y);
    ctx.lineTo(x + reach, y);
    ctx.moveTo(x, y - reach);
    ctx.lineTo(x, y + reach);
    ctx.stroke();
  }
}

/* --------------------------------------------------------- black hole ---- */

function holeGeometry(W, H) {
  const m = Math.min(W, H);
  const shadow = m * 0.037;
  return {
    cx: W * BLACK_HOLE.x,
    cy: H * BLACK_HOLE.y,
    shadow,
    // The pocket of bent spacetime: everything inside this radius is warped, swirled and blurred.
    lens: shadow * 7,
  };
}

/**
 * Gravitational lensing done to the picture rather than to a list of stars: concentric discs of
 * the frame so far, each magnified, twisted and blurred more than the one outside it, drawn from
 * the edge of the pocket inward so only the outer band of each survives. Whatever is behind the
 * hole — haze, the galactic band, stars, the string art — gets dragged around it.
 *
 * Reads from the tape rather than the live canvas: fourteen self-blits would cost more than the
 * rest of the frame put together.
 */
function drawLensWarp(ctx, W, H, t, hole, tape) {
  const source = tape?.source ?? ctx.canvas;
  const sw = source.width || W;
  const sh = source.height || H;
  const { cx, cy, lens, shadow } = hole;
  const maxBlur = Math.min(W, H) * 0.018;
  const rings = 8;

  for (let i = 0; i < rings; i += 1) {
    const radius = lens * (1 - i / rings);
    if (radius < shadow * 0.55) break;
    // 0 at the edge of the pocket, 1 at the shadow.
    const depth = 1 - radius / lens;
    // The pocket is never still: the magnification breathes and the twist wanders.
    const ripple = 1 + Math.sin(t * 0.85 + depth * 7) * 0.07 * depth;
    const magnify = (1 + 1.05 * depth * depth) * ripple;
    const swirl = depth * depth * (1.15 + Math.sin(t * 0.31) * 0.35) + Math.sin(t * 0.13) * 0.1;
    const blur = depth * depth * maxBlur;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.clip();
    if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.translate(cx, cy);
    ctx.rotate(swirl);
    ctx.scale(magnify, magnify);
    ctx.translate(-cx, -cy);
    ctx.drawImage(source, 0, 0, sw, sh, 0, 0, W, H);
    ctx.restore();
  }

  // Haze hanging in the pocket itself, so the warp reads as thick space rather than a lens.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, cx, cy, lens * 1.1, VIOLET, 0.1, 0.04);
  glow(ctx, cx, cy, lens * 0.55, MAGENTA, 0.07, 0.03);
  ctx.restore();
}

/**
 * The hole itself: an accretion disc seen nearly edge-on, with its far side lensed up and over
 * the shadow. Drawn in three passes — far side, then the shadow and its photon ring, then the
 * near side in front — which is what makes the disc read as wrapping around a sphere of nothing.
 */
function drawAccretion(ctx, W, H, t, hole) {
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
  glow(ctx, cx, cy, outer * 2.2, VIOLET, 0.09, 0.03);
  ctx.restore();
}

/**
 * Drawn *after* the lens warp, so the shadow and its photon ring stay hard-edged while everything
 * around them — including the disc's own far side — has been dragged through the pocket.
 */
function drawHorizon(ctx, t, hole) {
  const { cx, cy, shadow } = hole;
  const outer = shadow * 3.6;
  const wobble = 1 + Math.sin(t * 0.62) * 0.06;

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

  // Near side of the disc, passing in front of the shadow.
  ctx.beginPath();
  ctx.rect(cx - outer * 1.5, cy, outer * 3, outer * 1.5);
  ctx.clip();
  const near = ctx.createLinearGradient(cx - outer, cy, cx + outer, cy);
  near.addColorStop(0, 'rgba(80, 240, 255, 0.42)');
  near.addColorStop(0.35, 'rgba(190, 120, 255, 0.52)');
  near.addColorStop(0.7, 'rgba(255, 74, 200, 0.52)');
  near.addColorStop(1, 'rgba(255, 150, 120, 0.4)');
  strokeDisc(ctx, cx, cy, outer * wobble, outer * 0.3 * (2 - wobble), near, shadow * 0.42);
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

/**
 * Curve stitching: two straight axes, and a line from the i-th point on one to the (n-i)-th on
 * the other. None of the lines is curved; the parabola is the envelope they leave behind. The
 * axes sway a little, which makes the envelope breathe without any of the maths changing.
 */
function drawStringArt(ctx, W, H, t, sets) {
  const reach = Math.min(W, H);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const set of sets) {
    const ox = set.x * W;
    const oy = set.y * H;
    const sway = Math.sin(t * set.sway + set.phase) * 0.09;
    const a1 = set.angle + sway;
    const a2 = set.angle + set.spread - sway;
    const length = set.size * reach;
    const pulse = 0.75 + 0.25 * Math.sin(t * 0.13 + set.phase);

    ctx.strokeStyle = rgba(set.colour, set.alpha * pulse);
    ctx.lineWidth = Math.max(0.7, reach * 0.0016);
    ctx.beginPath();
    for (let i = 0; i <= set.lines; i += 1) {
      const f = i / set.lines;
      ctx.moveTo(ox + Math.cos(a1) * length * (1 - f), oy + Math.sin(a1) * length * (1 - f));
      ctx.lineTo(ox + Math.cos(a2) * length * f, oy + Math.sin(a2) * length * f);
    }
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

/**
 * @param {number} squash cos(roll): +1 face-up, 0 edge-on, -1 showing the underside. The caller
 *   has already applied it as a vertical scale; it's passed in so the bed can dim as it turns
 *   away and skip the things you couldn't see from underneath.
 */
function drawBed(ctx, t, squash) {
  // One snore: a long draw in, a longer let out. The echoes ride the same clock.
  const breath = wave(t, SNORE_PERIOD);
  const flutter = wave(t, 11.5, 0.9); // the duvet's free corner in zero gravity
  const faceUp = squash >= 0;

  drawHeadboard(ctx);
  drawFootboard(ctx);
  drawLegs(ctx, true);
  drawMattress(ctx);
  drawFrame(ctx);
  drawLegs(ctx, false);
  drawPillows(ctx);
  drawSleeper(ctx, breath, t);
  // Sunglasses ride the roll with the face, and there is no face to see from below.
  if (faceUp) drawSunglasses(ctx, t, breath * 1.5);
  drawDuvet(ctx, t, breath, flutter);
  drawRimLight(ctx, breath);
}

/**
 * A pair of shades that drifts in, settles on the sleeper for a while, and drifts off again.
 * Nobody puts them there; they simply arrive.
 */
function drawSunglasses(ctx, t, lift) {
  const p = wrap01(t / GLASSES_CYCLE);
  let travel; // 0 = worn, 1 = far away
  if (p < 0.19) travel = 1 - smoothstep(0, 0.19, p);
  else if (p < 0.62) travel = 0;
  else if (p < 0.81) travel = smoothstep(0.62, 0.81, p);
  else return; // away entirely

  const alpha = 1 - smoothstep(0.55, 1, travel) * 0.9;
  if (alpha <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  // They come and go from up and to the right, tumbling gently on the way.
  ctx.translate(travel * 250, -96 + lift - travel * 210);
  ctx.rotate(travel * 0.85 + Math.sin(t * 0.7) * 0.04 * (1 - travel));

  // Temple arm, receding toward the ear.
  ctx.strokeStyle = '#0b0320';
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-243, -6);
  ctx.lineTo(-210, -2);
  ctx.stroke();

  // The lens. Near-black, with a hard neon sheen across it.
  ctx.save();
  ctx.rotate(-0.08);
  roundedRect(ctx, -212, -16, 44, 24, 8);
  const glass = ctx.createLinearGradient(-212, -16, -168, 8);
  glass.addColorStop(0, '#1a0736');
  glass.addColorStop(0.55, '#08021a');
  glass.addColorStop(1, '#160a30');
  ctx.fillStyle = glass;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  const sheen = ctx.createLinearGradient(-212, 8, -176, -16);
  sheen.addColorStop(0, 'rgba(255, 74, 200, 0)');
  sheen.addColorStop(0.42, 'rgba(255, 74, 200, 0.5)');
  sheen.addColorStop(0.55, 'rgba(120, 240, 255, 0.65)');
  sheen.addColorStop(0.72, 'rgba(80, 240, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-214, -18, 50, 30);
  ctx.restore();

  // Brow bar along the top of the lens.
  ctx.strokeStyle = 'rgba(180, 200, 255, 0.4)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-208, -15);
  ctx.lineTo(-171, -13);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
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
