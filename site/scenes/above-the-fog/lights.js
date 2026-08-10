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
import { ditherGlow, pixelSize } from '../../effects/pixel.js';
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

/** How far into its burst a shell is, 0..1 — undefined before it goes off. */
const burstProgress = (shell) => (shell.u - BURST_AT) / (1 - BURST_AT);

/** How wide this particular shell throws, in pixels. Fixed per shell, so it is a size, not a swell. */
const burstSpread = (shell, S) => S * (0.075 + 0.075 * hash2(shell.seed, 3));

const SPARKS = 54;
/** How many alpha levels the sparks are drawn at — see the batching note in `drawShell`. */
const SPARK_BANDS = 5;

/**
 * The sparks of a burst, as geometry.
 *
 * Shared by the ground pass and the pass that lights the fog, which is the whole point of pulling it
 * out: the light in the cloud is then the shape of *this* burst rather than a circle standing in for
 * it. A coloured circle growing and shrinking is what a firework looks like to someone who has only
 * ever seen one described.
 *
 * Two per-spark quantities do all the work of not being a circle. A **speed**, so the front is
 * ragged rather than a rim — one radius for every spark is a disc however it is coloured. And a
 * **life**, so they go out one at a time over a couple of seconds instead of the whole shape dimming
 * together, which is the difference between an explosion and a dial being turned down.
 */
function burstSparks(shell, spread, out, fade, beat) {
  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    // Hashed angles, not even ones. Fifty-four rays at exactly 6.7 degrees apart is a compass rose,
    // and the eye finds that instantly.
    const h = hash2(shell.seed + i * 1.9, i);
    const k = hash2(shell.seed + i * 3.3, i + 5);
    const j = hash2(shell.seed + i * 6.1, i + 9);
    sparks.push({
      // A little curl on top of the radial line, growing as it goes out — a streamer bends, a ray
      // does not.
      angle: h * TAU + (j - 0.5) * 0.7 * out,
      reach: spread * out * (0.42 + k * 1.05),
      // Twinkling on the held clock. A spark that is going out does not go out smoothly.
      life: clamp(fade * (0.45 + j * 1.1), 0, 1) * (0.55 + 0.45 * hash2(shell.seed + i, beat)),
    });
  }
  return sparks;
}

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
 *
 * What a burst is *made of* here is streamers, crackle and pixelated puffs, in that order. There is
 * a flash, but it is small and lasts about a fifth of a second — the previous one was a disc most of
 * the width of the burst that grew and shrank, and a disc that grows and shrinks is the one shape
 * that says "a value is being animated" instead of "something exploded". The light a firework throws
 * belongs to the sparks; it is not a ball of colour they happen to be near.
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

  const v = burstProgress(shell);
  const spread = burstSpread(shell, S);
  // Decelerating: a spark loses almost all of its speed in the first third of its life, which is
  // what makes a burst read as an explosion rather than as an expanding circle.
  const out = 1 - (1 - v) ** 2.4;
  const fade = (1 - v) ** 1.6;
  const drift = wind.speed * SHELL_LIFE * (1 - BURST_AT) * v * 0.5;
  const dx = wind.x * drift;
  const dy = wind.y * drift;
  // Fireworks are lit on a held clock for the same reason fire is: they crackle, they do not ease.
  const beat = Math.floor(t * 14) / 14;
  const sparks = burstSparks(shell, spread, out, fade, beat);

  // The pop, at the instant of ignition. A twentieth of the burst's life and a tenth of its width —
  // enough to register as a bang, far too brief and too small to be the thing you are looking at.
  if (v < 0.05) {
    const punch = 1 - v / 0.05;
    glow(ctx, x, y, spread * 0.16 * (0.6 + punch * 0.6), core, clamp(punch * 0.9, 0, 1), 0.3);
  }

  // The streamers. Wide coloured body first, then a thin near-white centre on top of it, which is
  // what gives a spark a hot middle instead of making it a coloured line.
  //
  // Sparks are grouped into a handful of **alpha bands** and one path is stroked per band. A path
  // carries a single alpha, so the obvious way to give every spark its own is a `stroke()` each —
  // and that is fifty-four rasteriser passes per pass per shell, which measured at seven
  // milliseconds a frame all by itself. Quantising the life to five levels is free to look at: they
  // are already twinkling on a held clock, over a range narrower than the twinkle.
  for (const [colour, width, alpha, scale] of [
    [body, 0.0019, 0.8, 1],
    [core, 0.0011, 0.9, 0.66],
  ]) {
    ctx.lineWidth = Math.max(1, S * width);
    ctx.lineCap = 'round';
    for (let band = 1; band <= SPARK_BANDS; band += 1) {
      let any = false;
      ctx.beginPath();
      for (const s of sparks) {
        if (Math.ceil(s.life * SPARK_BANDS) !== band) continue;
        const reach = s.reach * scale;
        // Long streaks while they are moving, short blips once they have stopped — a streamer is a
        // spark plus the distance it covered while the eye was open.
        const tail = reach * (0.26 + 0.6 * (1 - v));
        const px = x + Math.cos(s.angle) * reach + dx;
        const py = y + Math.sin(s.angle) * reach + dy;
        ctx.moveTo(px, py);
        ctx.lineTo(px - Math.cos(s.angle) * tail, py - Math.sin(s.angle) * tail);
        any = true;
      }
      if (!any) continue;
      ctx.strokeStyle = rgba(colour, clamp((band / SPARK_BANDS) * alpha, 0, 1));
      ctx.stroke();
    }
  }

  // Crackle: every sixth spark comes apart near the end of its run and throws a knot of smaller
  // ones sideways. Two dozen extra marks, and they are most of why the burst has a texture.
  if (v > 0.18) {
    ctx.strokeStyle = rgba(core, clamp(fade * 0.5, 0, 1));
    ctx.lineWidth = Math.max(1, S * 0.0012);
    ctx.beginPath();
    for (let i = 0; i < SPARKS; i += 6) {
      const s = sparks[i];
      if (s.life < 0.05) continue;
      const bx = x + Math.cos(s.angle) * s.reach * 0.78 + dx;
      const by = y + Math.sin(s.angle) * s.reach * 0.78 + dy;
      for (let j = 0; j < 3; j += 1) {
        const a = hash2(shell.seed + i * 2.1 + j, beat) * TAU;
        const d = spread * 0.09 * (0.4 + hash2(shell.seed + j * 5.7, i) * 1.2) * out;
        ctx.moveTo(bx + Math.cos(a) * d, by + Math.sin(a) * d);
        ctx.lineTo(bx + Math.cos(a) * d * 0.55, by + Math.sin(a) * d * 0.55);
      }
    }
    ctx.stroke();
  }

  // Pixelated puffs: chunky clots of colour hanging in the burst, dissolving on the ordered dither
  // matrix rather than fading smoothly. This is the shared 16-bit toolkit — the same `bayerOn` that
  // The Cloud comes apart on — so the one thing in this scene that breaks into blocks now has
  // company, and the fireworks are tied to the scene's own vocabulary instead of being generic.
  const px = pixelSize(W, H) * 2;
  const puffBeat = Math.floor(t * 9) / 9;
  for (let i = 0; i < 7; i += 1) {
    const strength = fade * (0.35 + hash2(shell.seed + i * 8.3, i + 2) * 0.5)
      * (0.45 + 0.55 * hash2(shell.seed + i, puffBeat));
    if (strength < 0.04) continue;
    const a = hash2(shell.seed + i * 4.7, i + 11) * TAU;
    const d = spread * out * (0.2 + hash2(shell.seed + i * 2.9, i + 4) * 0.7);
    // A puff jitters by a chunk or two on the held clock instead of drifting, so it reads as
    // something being redrawn rather than something moving.
    const jx = (hash2(shell.seed + i * 3.1, puffBeat) - 0.5) * px * 3;
    const jy = (hash2(shell.seed + i * 7.3, puffBeat + 5) - 0.5) * px * 3;
    ditherGlow(
      ctx,
      x + Math.cos(a) * d + dx + jx, y + Math.sin(a) * d + dy + jy,
      spread * (0.1 + 0.13 * hash2(shell.seed + i * 6.7, i)) * (0.55 + out * 0.75),
      rgba(i % 3 === 0 ? core : body, 0.5), strength, px, 1, 1.5,
    );
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
    // A fire at full flare used to throw the largest, brightest coloured mass in the frame — larger
    // and brighter than a shell going off, which puts the hierarchy exactly the wrong way up. A fire
    // is a steady thing you keep noticing; a firework is an event. The fire keeps its glow, it just
    // stops winning.
    const centre = clamp(0.035 + flare * 0.19, 0, 1);
    // Stretched downwind like everything else it belongs to, and offset the same way: the fog it is
    // lighting has already been carried along by the time the light gets up there.
    lobe(
      ctx,
      fire.x * W + wind.x * r * 2.2, fire.y * H + wind.y * r * 2.2,
      r * (4.2 + flare * 4.2) * (0.85 + flicker * 0.3), r * (2.6 + flare * 2.6) * (0.85 + flicker * 0.3),
      wind.angle, NEON[fire.hue].body, centre, 0.1, 0.34, fire.phase + t * 0.5,
    );
  }

  for (const shell of shellsAt(lights.shows, t)) {
    const glare = shellGlare(shell);
    if (glare < 0.01) continue;
    const { body, core } = NEON[shell.colour];
    const wind = windHere(shell.x * W, shell.y * H, S, t);
    const x = shell.x * W;
    const y = shell.y * H;

    if (shell.u < BURST_AT) {
      // Climbing. A dull point moving up through the cloud, and nothing else.
      glow(ctx, x, y, S * 0.03, body, clamp(glare * 0.5, 0, 1), clamp(glare * 0.25, 0, 1));
      continue;
    }

    const v = burstProgress(shell);
    const spread = burstSpread(shell, S);
    const out = 1 - (1 - v) ** 2.4;
    const fade = (1 - v) ** 1.6;
    const drift = wind.speed * SHELL_LIFE * (1 - BURST_AT) * v * 0.5;

    // Fog lit by a burst is lit in the *shape* of the burst — arms, not a ball. Wide soft strokes
    // down the same rays the sparks are on, which is the entire difference between light coming off
    // an explosion and a coloured circle being turned up and turned down again. It used to be one
    // `glow()` whose radius grew with its brightness, and that single call was the orb: it is drawn
    // last, over everything, so it was also the only part of a firework you could reliably see.
    ctx.lineWidth = Math.max(2, S * 0.015);
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(body, clamp(glare * 0.17, 0, 1));
    ctx.beginPath();
    for (const s of burstSparks(shell, spread, out, fade, Math.floor(t * 7) / 7)) {
      if (s.life < 0.06) continue;
      const px = x + Math.cos(s.angle) * s.reach + wind.x * drift;
      const py = y + Math.sin(s.angle) * s.reach + wind.y * drift;
      ctx.moveTo(x + Math.cos(s.angle) * s.reach * 0.15, y + Math.sin(s.angle) * s.reach * 0.15);
      ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ...and a base glare underneath it at a **fixed** radius. Faint, and it only ever changes
    // brightness — the moment its size follows its brightness there is a pulsing ball in the frame
    // again, whatever is drawn on top.
    glow(ctx, x, y, spread * 0.85, core, clamp(glare * 0.12, 0, 1), clamp(glare * 0.07, 0, 1));
  }

  ctx.restore();
}
