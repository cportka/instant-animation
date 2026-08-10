// What is burning down there, and what gets launched at the sky.
//
// Everything in this file is **the only colour in the animation**. The ground is a photo negative
// of an already de-saturated palette and the weather is six greys; against that, a cyan and a green
// at full chroma do not read as coloured pixels, they read as the one thing in frame that is *lit*
// rather than merely visible. So it is worth being careful with, and it is kept in one place.
//
// Two rules govern all of it, and both come from the camera being **directly overhead**:
//
// **Nothing is radially symmetric.** A flame from above is not a disc, it is a bright base with a
// plume of light lying downwind of it; a symmetric glow with a ring around it is a lens flare, or a
// flying saucer, which is what the first version of this looked like. Every light here leans.
//
// **Gravity points at the camera.** A firework's sparks do not arc downward, because "down" is
// away from you — they spread, decelerate, and dim in place while the wind carries the whole burst
// sideways. Adding a downward bias would be drawing the view everyone has of a firework rather than
// the one this scene actually has.
//
// Each light is drawn twice: once here on the ground, under the entire depth of the cloud, where it
// is mostly invisible — and once as `drawLightBloom`, the light it throws *into* the fog, which is
// wide, faint, drawn last of everything, and is what you actually see almost all of the time. Fog
// does not hide a light so much as carry it.

import { TAU, clamp, glow, rgba, wrap01 } from '../../lib/draw.js';
import { curl, hash2, noise2 } from '../../effects/field.js';
import { lobe } from '../../effects/volume.js';
import { WIND, gustAt } from './fog.js';

/* ------------------------------------------------------------- palette ---- */

const NEON = {
  cyan: { body: [64, 200, 255], core: [214, 246, 255] },
  green: { body: [72, 255, 158], core: [222, 255, 236] },
  magenta: { body: [255, 92, 196], core: [255, 214, 240] },
  gold: { body: [255, 186, 64], core: [255, 238, 206] },
};
const SHELL_COLOURS = ['cyan', 'green', 'magenta', 'gold'];

/* ---------------------------------------------------------------- plan ---- */

export function planLights(rng, river, nearestRiver) {
  // Fires, off the water and spread out. One burning alone in a field is more interesting than a
  // town on fire, so they are pushed apart and never crowd the houses.
  const fires = [];
  for (let i = 0; i < 140 && fires.length < 6; i += 1) {
    const x = rng.next();
    const y = rng.next();
    if (nearestRiver(river, x, y).distance < 0.07) continue;
    if (fires.some((f) => Math.hypot(f.x - x, f.y - y) < 0.2)) continue;
    fires.push({
      x,
      y,
      hue: i % 2 ? 'cyan' : 'green',
      r: rng.range(0.013, 0.026),
      phase: rng.range(0, 30),
      // A fire surges every ten to twenty-five seconds and settles again. Separate from the flicker,
      // which never stops.
      flare: rng.range(10, 25),
      flarePhase: rng.next(),
    });
  }

  // Somebody is setting these off, so they go up from the near bank, close to the town — a firework
  // launched from the middle of an empty field is a firework nobody is standing next to.
  const shows = Array.from({ length: 3 }, (_, i) => ({
    x: 0.5 + rng.range(-0.24, 0.24),
    y: 0.5 + rng.range(-0.26, 0.26),
    // A minute and a half or so between shows, staggered, so two never go up together.
    period: rng.range(74, 118),
    phase: i / 3 + rng.range(-0.04, 0.04),
    shells: 3 + Math.floor(rng.range(0, 3)),
    seed: rng.range(0, 40),
  }));

  return { fires, shows };
}

/* ------------------------------------------------------------- schedule ---- */

/** A fire's fast, never-ending unsteadiness. */
export const flickerAt = (fire, t) =>
  0.6 + 0.4 * (noise2(fire.phase, t * 3.4) * 0.6 + noise2(fire.phase + 7.3, t * 9.1) * 0.4);

/** A fire's occasional surge — 0 most of the time, and never a sharp edge. */
export function flareAt(fire, t) {
  const u = wrap01(t / fire.flare + fire.flarePhase);
  const width = 0.14;
  return u < width ? Math.sin((u / width) * Math.PI) ** 1.4 : 0;
}

const SHELL_LIFE = 3.4;
/** Where in its arc a shell stops climbing and goes off. */
const BURST_AT = 0.38;

/**
 * The shells in the air right now, across every launch site.
 *
 * A *show*, not a shell: people do not set off one firework. Each site fires three to five in a
 * ragged sequence and then nothing happens there for a minute and a half.
 */
export function shellsAt(shows, t) {
  const live = [];
  for (const show of shows) {
    const cycles = t / show.period + show.phase;
    const n = Math.floor(cycles);
    const into = (cycles - n) * show.period;
    for (let i = 0; i < show.shells; i += 1) {
      const start = i * (0.75 + hash2(show.seed + i, n) * 0.85);
      const u = (into - start) / SHELL_LIFE;
      if (u <= 0 || u >= 1) continue;
      live.push({
        u,
        seed: show.seed + i * 3.7 + n * 11.3,
        // Each shell goes up from a slightly different spot, because they are being lit by hand.
        x: show.x + (hash2(show.seed + i * 2.3, n) - 0.5) * 0.07,
        y: show.y + (hash2(show.seed + i * 5.1, n + 3) - 0.5) * 0.07,
        colour: SHELL_COLOURS[Math.floor(hash2(show.seed + i * 7.9, n + 7) * SHELL_COLOURS.length)],
      });
    }
  }
  return live;
}

/** How bright a shell is overall, for the pass that lights the cloud. */
const shellGlare = (shell) =>
  shell.u < BURST_AT
    ? 0.1 * (shell.u / BURST_AT) ** 2
    : Math.max(0, 1 - (shell.u - BURST_AT) / (1 - BURST_AT)) ** 1.8;

/* ----------------------------------------------------------- the ground ---- */

/** The wind, here, now — direction and strength, agreeing with the fog's. */
function windHere(x, y, S, t) {
  const v = curl(x / S, y / S, t * 0.4, 1.8);
  const vx = gustAt(t) * WIND * S + v.x * S * 0.05;
  const vy = v.y * S * 0.05;
  const speed = Math.hypot(vx, vy);
  return { x: vx / speed, y: vy / speed, speed, angle: Math.atan2(vy, vx) };
}

export function drawLights(ctx, W, H, t, lights) {
  if (!lights) return;
  const S = Math.min(W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const fire of lights.fires) drawFire(ctx, W, H, S, t, fire);
  for (const shell of shellsAt(lights.shows, t)) drawShell(ctx, W, H, S, t, shell);
  ctx.restore();
}

/**
 * One fire, from above: a bright base and a plume of light lying downwind of it.
 *
 * The flame body is rebuilt on a **held clock** rather than smoothly — twelve times a second, the
 * lobes jump to new sizes and offsets. Fire does not ease; it gutters. Interpolating between those
 * states is what makes a flame look like a lava lamp.
 */
function drawFire(ctx, W, H, S, t, fire) {
  const x = fire.x * W;
  const y = fire.y * H;
  const r = S * fire.r;
  const flicker = flickerAt(fire, t);
  const flare = flareAt(fire, t);
  const wind = windHere(x, y, S, t);
  const { body, core } = NEON[fire.hue];
  const beat = Math.floor(t * 12) / 12;
  const size = (1 + flare * 0.8) * flicker;

  // The pool of light it throws on the ground, stretched downwind.
  lobe(
    ctx, x + wind.x * r * 0.8, y + wind.y * r * 0.8,
    r * (3.4 + flare * 2.6) * flicker, r * (1.9 + flare * 1.2) * flicker,
    wind.angle, body, clamp(0.1 + flare * 0.16, 0, 1), 0.06, 0.3, fire.phase + t * 0.6,
  );

  // The plume: three masses trailing off downwind, each further, smaller and fainter than the last.
  for (let i = 1; i <= 3; i += 1) {
    const reach = r * i * (0.9 + flare * 1.5) * flicker;
    const wander = (hash2(fire.phase + i, beat) - 0.5) * r * 0.7;
    lobe(
      ctx,
      x + wind.x * reach - wind.y * wander,
      y + wind.y * reach + wind.x * wander,
      r * (1.1 - i * 0.16) * size, r * (0.72 - i * 0.14) * size,
      wind.angle, body, clamp((0.22 - i * 0.05) * (0.7 + flare), 0, 1), 0.1, 0.42,
      fire.phase + i * 3.1 + t * 1.4,
    );
  }

  // The body: five lobes on the held clock, leaning into the wind's direction.
  for (let i = 0; i < 5; i += 1) {
    const h = hash2(fire.phase + i * 2.7, beat);
    const k = hash2(fire.phase + i * 5.3, beat + 13);
    const lean = r * (0.15 + h * 0.5) * (1 + flare);
    lobe(
      ctx,
      x + wind.x * lean + (k - 0.5) * r * 0.55,
      y + wind.y * lean + (h - 0.5) * r * 0.55,
      r * (0.4 + h * 0.42) * size, r * (0.32 + k * 0.34) * size,
      wind.angle, body, clamp(0.3 + flare * 0.3, 0, 1), 0.12, 0.4, fire.phase + i + t * 2.2,
    );
  }

  // The hottest part, low and small and nearly white.
  lobe(
    ctx, x, y, r * (0.36 + flare * 0.2) * flicker, r * (0.3 + flare * 0.16) * flicker,
    wind.angle, core, clamp(0.5 + flare * 0.35, 0, 1), 0.34, 0,
  );

  // Embers, only while it is up. They go where the air goes, which from here is sideways.
  if (flare > 0.12) {
    ctx.strokeStyle = rgba(core, clamp(flare * 0.5, 0, 1));
    ctx.lineWidth = Math.max(1, S * 0.0013);
    ctx.beginPath();
    for (let i = 0; i < 12; i += 1) {
      const age = wrap01(hash2(fire.phase + i * 1.7, 0) + t * 0.5);
      const reach = r * (0.6 + age * 6) * (0.5 + flare);
      const drift = (hash2(fire.phase + i * 4.1, 1) - 0.5) * r * 2.4 * age;
      const ex = x + wind.x * reach - wind.y * drift;
      const ey = y + wind.y * reach + wind.x * drift;
      const tail = r * 0.28 * (1 - age);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - wind.x * tail, ey - wind.y * tail);
    }
    ctx.stroke();
  }
}

/**
 * One shell: up, then out.
 *
 * The climb is drawn as a point that **brightens and grows** rather than one that travels, because
 * it is coming straight up at the camera. The burst spreads, slows and dims in place. Neither is
 * how a firework looks from the ground, and both are how one looks from above it.
 */
function drawShell(ctx, W, H, S, t, shell) {
  const wind = windHere(shell.x * W, shell.y * H, S, t);
  const { body, core } = NEON[shell.colour];
  const x = shell.x * W + wind.x * S * 0.02 * shell.u;
  const y = shell.y * H + wind.y * S * 0.02 * shell.u;

  if (shell.u < BURST_AT) {
    const climb = shell.u / BURST_AT;
    const r = S * (0.002 + climb * 0.008);
    glow(ctx, x, y, r * 5, body, clamp(0.1 + climb * 0.4, 0, 1) * 0.5, 0.06);
    glow(ctx, x, y, r, core, clamp(0.3 + climb * 0.6, 0, 1), 0.4);
    // The trail is left *behind* in the air, which from directly overhead means behind in the
    // wind, not below.
    ctx.strokeStyle = rgba(body, clamp(climb * 0.3, 0, 1));
    ctx.lineWidth = Math.max(1, S * 0.0014);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - wind.x * S * 0.02 * climb, y - wind.y * S * 0.02 * climb);
    ctx.stroke();
    return;
  }

  const v = (shell.u - BURST_AT) / (1 - BURST_AT);
  const spread = S * (0.075 + 0.075 * hash2(shell.seed, 3));
  // Decelerating: a spark loses almost all of its speed in the first third of its life, which is
  // what makes a burst read as an explosion rather than as an expanding circle.
  const out = 1 - (1 - v) ** 2.4;
  const fade = (1 - v) ** 1.6;
  const drift = wind.speed * SHELL_LIFE * (1 - BURST_AT) * v * 0.5;

  if (v < 0.18) {
    // The flash. Brief, and bigger than anything else the scene contains — but it keeps the shell's
    // colour in it. A white flash the size of the burst throws away the one moment the picture has
    // a hue in it.
    const punch = 1 - v / 0.18;
    glow(ctx, x, y, spread * (0.7 + punch * 1.1), body, clamp(punch * 0.6, 0, 1), clamp(punch * 0.3, 0, 1));
    glow(ctx, x, y, spread * (0.2 + punch * 0.4), core, clamp(punch * 0.9, 0, 1), 0.3);
  }

  for (const [colour, width, alpha, scale] of [
    [core, 0.0024, 0.85, 0.5],
    [body, 0.0017, 0.75, 1],
  ]) {
    ctx.strokeStyle = rgba(colour, clamp(fade * alpha, 0, 1));
    ctx.lineWidth = Math.max(1, S * width);
    ctx.beginPath();
    for (let i = 0; i < 42; i += 1) {
      // Hashed angles, not even ones. Forty-two rays at exactly 8.6 degrees apart is a compass
      // rose, and the eye finds that instantly.
      const a = hash2(shell.seed + i * 1.9, i) * TAU;
      const reach = spread * scale * out * (0.55 + hash2(shell.seed + i * 3.3, i + 5) * 0.75);
      const tail = reach * 0.42 * (0.35 + fade);
      const px = x + Math.cos(a) * reach + wind.x * drift;
      const py = y + Math.sin(a) * reach + wind.y * drift;
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.cos(a) * tail, py - Math.sin(a) * tail);
    }
    ctx.stroke();
  }
}

/* -------------------------------------------------- and through the fog ---- */

/**
 * Every light below, seen through the whole depth of the cloud.
 *
 * This is the pass that actually gets looked at. A shell going off *inside* weather lights the
 * weather — for a moment a whole region of grey has a colour in it — and that is the only way any
 * of this registers through ninety-seven percent coverage.
 */
export function drawLightBloom(ctx, W, H, t, lights) {
  if (!lights) return;
  const S = Math.min(W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const fire of lights.fires) {
    const flare = flareAt(fire, t);
    const flicker = flickerAt(fire, t);
    const wind = windHere(fire.x * W, fire.y * H, S, t);
    const r = S * fire.r;
    const centre = clamp(0.04 + flare * 0.26, 0, 1);
    // Stretched downwind like everything else it belongs to, and offset the same way: the fog it is
    // lighting has already been carried along by the time the light gets up there.
    lobe(
      ctx,
      fire.x * W + wind.x * r * 2.2, fire.y * H + wind.y * r * 2.2,
      r * (4.4 + flare * 7) * (0.85 + flicker * 0.3), r * (2.8 + flare * 4.4) * (0.85 + flicker * 0.3),
      wind.angle, NEON[fire.hue].body, centre, 0.1, 0.34, fire.phase + t * 0.5,
    );
  }

  for (const shell of shellsAt(lights.shows, t)) {
    const glare = shellGlare(shell);
    if (glare < 0.01) continue;
    const spread = S * (0.1 + 0.16 * glare + 0.06 * hash2(shell.seed, 3));
    glow(
      ctx,
      shell.x * W, shell.y * H,
      spread, NEON[shell.colour].body,
      clamp(glare * 0.42, 0, 1), clamp(glare * 0.2, 0, 1),
    );
  }

  ctx.restore();
}
