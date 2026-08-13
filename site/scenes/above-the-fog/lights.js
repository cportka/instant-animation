// What is burning down there, who is setting it, and what gets launched at the sky.
//
// This file is **the only colour in the animation**. The ground is a photo negative of an already
// de-saturated palette and the weather is six greys; against that, anything at full chroma does not
// read as coloured pixels, it reads as the one thing in frame that is *lit* rather than merely
// visible. So it is worth being careful with, and it is kept in one place.
//
// The colour is split in two, and the split is the point:
//
// **The fires are cold.** Cyan and green, low to the ground, steady, always there.
// **The fireworks are hot.** A four-step ramp from white through yellow and orange to a deep red,
// brief and violent and high in the air. Two kinds of burning that cannot be confused for one
// another even glimpsed through a hole in a cloud, which is what tells you the fireworks are an
// *event* while the fires are a *place*.
//
// Two rules govern the drawing, and both come from the camera being **directly overhead**:
//
// **Nothing is radially symmetric.** A flame from above is not a disc, it is a bright base with a
// plume of light lying downwind of it; a symmetric glow with a ring around it is a lens flare, or a
// flying saucer, which is what the first version of this looked like. Every light here leans.
//
// **Gravity points at the camera.** A firework's sparks do not arc downward, because "down" is away
// from you — they spread, decelerate and cool in place while the wind carries the whole burst
// sideways.
//
// The bursts are drawn as **pixel art**: every spark is a run of chunks snapped to a coarse grid,
// stepping down the ramp from a white head to a red tail, at full opacity with hard edges. They are
// drawn twice — once under the whole depth of the cloud and once over it at partial strength — so
// what you see is chunky sparks *amongst* the fog rather than a soft glow behind it. Softness is the
// default a canvas gives you for free and it is the wrong default here: a firework seen through
// weather is the one thing in this scene allowed a hard edge.

import { TAU, clamp, glow, rampAt, rgba, smoothstep, wrap01 } from '../../lib/draw.js';
import { curl, hash2, noise2 } from '../../effects/field.js';
import { chunk, ditherGlow } from '../../effects/pixel.js';
import { lobe } from '../../effects/volume.js';
import { WIND, gustAt } from './fog.js';

/* ------------------------------------------------------------- palette ---- */

// The fireworks, hottest first. Five steps and no more: a ramp with a dozen entries interpolates
// into a smooth gradient, and a smooth gradient is exactly what pixel art is not. The hottest step
// is a warm white rather than a true one, and there are two reds at the cold end — a burst is
// supposed to read as *orange and red*, and an evenly spaced ramp with one white in it comes out
// white, because the white sits on the head of every spark where the eye goes first.
const EMBER = [
  [255, 246, 206],
  [255, 206, 64],
  [255, 132, 26],
  [236, 62, 22],
  [176, 22, 26],
];

// The fires. Cold on purpose — see the note at the top.
const COLD = {
  cyan: { body: [64, 200, 255], core: [214, 246, 255] },
  green: { body: [72, 255, 158], core: [222, 255, 236] },
};

// People, seen from directly above: a dot the size of a pair of shoulders with a highlight on it.
// The body is dark and the highlight carries most of the read — with the ground taken down into the
// 60s and 100s, a dark dot alone has only a few dozen levels to work with on the deepest grass, and
// the pale mark on its shoulder is what still separates a person from a shadow.
const FIGURE = 'rgba(20, 16, 28, 0.88)';
const FIGURE_LIT = 'rgba(252, 246, 232, 0.85)';

/* ---------------------------------------------------------------- plan ---- */

export function planLights(rng, river, nearestRiver) {
  // Fires, off the water and spread out. Twelve rather than six, and each one on its own long cycle
  // of catching, burning and dying back — so at any moment some are alight, one or two are just
  // going up, and the field is not a fixed constellation you learn after a minute.
  const fires = [];
  for (let i = 0; i < 300 && fires.length < 12; i += 1) {
    const x = rng.next();
    const y = rng.next();
    if (nearestRiver(river, x, y).distance < 0.06) continue;
    if (fires.some((f) => Math.hypot(f.x - x, f.y - y) < 0.13)) continue;
    fires.push({
      x,
      y,
      hue: i % 2 ? 'cyan' : 'green',
      r: rng.range(0.011, 0.024),
      phase: rng.range(0, 30),
      // A fire surges every ten to twenty-five seconds and settles again. Separate from the flicker,
      // which never stops, and from the cycle below, which happens once.
      flare: rng.range(10, 25),
      flarePhase: rng.next(),
      // Catches, burns, dies back, and is dark for a while before somebody sets it again.
      cycle: rng.range(150, 320),
      cyclePhase: rng.next(),
    });
  }

  // Somebody is setting these off, so they go up from spots people can stand in — a firework
  // launched from the middle of an empty field is a firework nobody is next to.
  const shows = Array.from({ length: 3 }, (_, i) => ({
    x: 0.5 + rng.range(-0.24, 0.24),
    y: 0.5 + rng.range(-0.26, 0.26),
    // A minute and a half or so between shows, staggered, so two never go up together.
    period: rng.range(74, 118),
    phase: i / 3 + rng.range(-0.04, 0.04),
    shells: 3 + Math.floor(rng.range(0, 3)),
    seed: rng.range(0, 40),
  }));

  // And the people. They exist because everything else in this file implies them: something set
  // those fires and something is lighting those shells, and an overhead view with no one in it says
  // the town is abandoned and the fires are wild. They are clustered — a knot around each fire, a
  // larger crowd back from each launch site — because scattered evenly they read as speckle.
  const people = [];
  const knot = (cx, cy, count, radius, group, show) => {
    for (let i = 0; i < count; i += 1) {
      const a = rng.range(0, TAU);
      const d = radius * (0.35 + rng.next() * 0.65);
      people.push({
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        // Everyone mills about their own spot on their own slow clock.
        phase: rng.range(0, 40),
        drift: rng.range(0.004, 0.011),
        group,
        show,
      });
    }
  };
  fires.forEach((f, i) => knot(f.x, f.y, 4 + Math.floor(rng.range(0, 4)), 0.05, i, -1));
  shows.forEach((s, i) => knot(s.x, s.y, 9 + Math.floor(rng.range(0, 6)), 0.1, -1, i));

  return { fires, shows, people };
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

/**
 * Whether a fire is alight at all, and how strongly: nothing, then a fast catch, a long burn, a
 * slow die-back, and dark again.
 *
 * The catch is deliberately much faster than the die-back. Somebody puts a light to it and it goes
 * up in a couple of seconds; it takes a minute to fall to embers. Symmetrical would read as a
 * dimmer being turned, which is the same mistake the fireworks used to make in a different key.
 */
export function fireLifeAt(fire, t) {
  const u = wrap01(t / fire.cycle + fire.cyclePhase);
  if (u < 0.03) return smoothstep(0, 0.03, u);
  if (u < 0.7) return 1;
  if (u < 0.9) return 1 - smoothstep(0.7, 0.9, u);
  return 0;
}

/** The flare-up of a fire catching. Brief, bright, and only ever once per cycle. */
export function catchAt(fire, t) {
  const u = wrap01(t / fire.cycle + fire.cyclePhase);
  return u < 0.05 ? Math.sin((u / 0.05) * Math.PI) ** 1.6 : 0;
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
  for (let s = 0; s < shows.length; s += 1) {
    const show = shows[s];
    const cycles = t / show.period + show.phase;
    const n = Math.floor(cycles);
    const into = (cycles - n) * show.period;
    for (let i = 0; i < show.shells; i += 1) {
      const start = i * (0.75 + hash2(show.seed + i, n) * 0.85);
      const u = (into - start) / SHELL_LIFE;
      if (u <= 0 || u >= 1) continue;
      live.push({
        u,
        show: s,
        seed: show.seed + i * 3.7 + n * 11.3,
        // Each shell goes up from a slightly different spot, because they are being lit by hand.
        x: show.x + (hash2(show.seed + i * 2.3, n) - 0.5) * 0.07,
        y: show.y + (hash2(show.seed + i * 5.1, n + 3) - 0.5) * 0.07,
        // Where in the ramp this shell sits: some go up gold, some go up nearly all red.
        tint: hash2(show.seed + i * 7.9, n + 7) * 1.5,
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
const burstSpread = (shell, S) => S * (0.11 + 0.09 * hash2(shell.seed, 3));

/**
 * The firework grid, in pixels. Coarser than the fog's own chunk size on purpose: at the shared
 * coarseness a burst comes out as noise, and the whole point of drawing it this way is that a
 * firework should read as pixel art from across the room.
 */
const burstPixel = (S) => Math.max(3, Math.round(S / 130));

const SPARKS = 54;
/** Chunks in a spark's trail at full life — and, not coincidentally, steps in the ramp. */
const TRAIL = EMBER.length;

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
 * **life**, which here decides how many chunks of trail a spark still has and how far down the ramp
 * its head has cooled, rather than how transparent it is: a pixel spark goes out by losing its tail
 * and turning red, never by fading, because a half-transparent chunk is not a pixel.
 */
function burstSparks(shell, spread, out, fade, beat) {
  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    // Hashed angles, not even ones. Fifty-four rays at exactly 6.7 degrees apart is a compass rose,
    // and the eye finds that instantly.
    const h = hash2(shell.seed + i * 1.9, i);
    const k = hash2(shell.seed + i * 3.3, i + 5);
    const j = hash2(shell.seed + i * 6.1, i + 9);
    // Twinkling on the held clock: a spark blinks out for a beat and comes back. On a soft mark this
    // would be a defect; on a hard-edged one it is the thing that makes it look alive.
    if (hash2(shell.seed + i, beat) < 0.11) continue;
    sparks.push({
      // A little curl on top of the radial line, growing as it goes out — a streamer bends, a ray
      // does not.
      angle: h * TAU + (j - 0.5) * 0.7 * out,
      reach: spread * out * (0.42 + k * 1.05),
      life: clamp(fade * (0.45 + j * 1.1), 0, 1),
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

/**
 * The people, drawn flat under everything else.
 *
 * Not additive and not lit: they are the only thing in this file that is an *object* rather than a
 * light, so they composite normally and take their contrast from the ground's near-white river and
 * near-black roads. Two fills for the lot of them — a body pass and a highlight pass — because a
 * hundred separate two-pixel marks drawn one at a time is a hundred rasteriser passes for something
 * you can only see through a gap in a cloud.
 */
export function drawCrowd(ctx, W, H, t, lights) {
  if (!lights) return;
  const S = Math.min(W, H);
  const r = Math.max(1.3, S * 0.0034);
  const live = shellsAt(lights.shows, t);
  // A crowd with a shell in the air above it backs away from the launch spot. It costs one number
  // per person and it is the only reason the people read as *doing* something rather than standing
  // in a field.
  const firing = [false, false, false];
  for (const shell of live) firing[shell.show] = true;

  for (const [style, offset, scale] of [[FIGURE, 0, 1], [FIGURE_LIT, -r * 0.5, 0.5]]) {
    ctx.fillStyle = style;
    ctx.beginPath();
    for (const p of lights.people) {
      // Milling about: two slow noise reads, so nobody walks in a circle or on a straight line.
      let x = p.x + (noise2(p.phase, t * 0.09) - 0.5) * p.drift * 2;
      let y = p.y + (noise2(p.phase + 5.7, t * 0.07) - 0.5) * p.drift * 2;
      if (p.show >= 0 && firing[p.show]) {
        const show = lights.shows[p.show];
        const dx = x - show.x;
        const dy = y - show.y;
        const d = Math.hypot(dx, dy) || 1;
        x += (dx / d) * 0.024;
        y += (dy / d) * 0.024;
      }
      const cx = x * W;
      const cy = y * H + offset;
      ctx.moveTo(cx + r * scale, cy);
      ctx.arc(cx, cy, r * scale, 0, TAU);
    }
    ctx.fill();
  }
}

export function drawLights(ctx, W, H, t, lights) {
  if (!lights) return;
  const S = Math.min(W, H);
  const px = burstPixel(S);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const fire of lights.fires) {
    const life = fireLifeAt(fire, t);
    if (life > 0.01) drawFire(ctx, W, H, S, t, fire, life);
  }
  for (const shell of shellsAt(lights.shows, t)) drawShell(ctx, W, H, S, t, shell, px, 1);
  ctx.restore();
}

/**
 * One fire, from above: a bright base and a plume of light lying downwind of it.
 *
 * The flame body is rebuilt on a **held clock** rather than smoothly — twelve times a second, the
 * lobes jump to new sizes and offsets. Fire does not ease; it gutters. Interpolating between those
 * states is what makes a flame look like a lava lamp.
 */
function drawFire(ctx, W, H, S, t, fire, life) {
  const x = fire.x * W;
  const y = fire.y * H;
  const catching = catchAt(fire, t);
  const r = S * fire.r * (0.55 + life * 0.45);
  const flicker = flickerAt(fire, t);
  // A fire catching flares harder than it ever will again, and the surge that follows is the ordinary
  // one. Both feed the same number, so nothing downstream has to know which is happening.
  const flare = Math.max(flareAt(fire, t) * life, catching);
  const wind = windHere(x, y, S, t);
  const { body, core } = COLD[fire.hue];
  const beat = Math.floor(t * 12) / 12;
  const size = (1 + flare * 0.8) * flicker;

  // The pool of light it throws on the ground, stretched downwind.
  lobe(
    ctx, x + wind.x * r * 0.8, y + wind.y * r * 0.8,
    r * (3.4 + flare * 2.6) * flicker, r * (1.9 + flare * 1.2) * flicker,
    wind.angle, body, clamp((0.1 + flare * 0.16) * life, 0, 1), 0.06, 0.3, fire.phase + t * 0.6,
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
      wind.angle, body, clamp((0.22 - i * 0.05) * (0.7 + flare) * life, 0, 1), 0.1, 0.42,
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
      wind.angle, body, clamp((0.3 + flare * 0.3) * life, 0, 1), 0.12, 0.4, fire.phase + i + t * 2.2,
    );
  }

  // The hottest part, low and small and nearly white.
  lobe(
    ctx, x, y, r * (0.36 + flare * 0.2) * flicker, r * (0.3 + flare * 0.16) * flicker,
    wind.angle, core, clamp((0.5 + flare * 0.35) * life, 0, 1), 0.34, 0,
  );

  // Embers, only while it is up. They go where the air goes, which from here is sideways.
  if (flare > 0.12) {
    ctx.strokeStyle = rgba(core, clamp(flare * 0.5 * life, 0, 1));
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
 * One shell: up, then out, as pixel art.
 *
 * The climb is a chunk that **brightens and grows** rather than one that travels, because it is
 * coming straight up at the camera. The burst spreads, slows and cools in place.
 *
 * Every chunk in the burst is snapped to the grid and filled at full opacity, and the whole thing is
 * four fills — one per ramp step, every chunk of that colour in a single path. That is both why it
 * looks like pixel art and why it is cheap: the version this replaced gave each spark its own alpha
 * and therefore its own `stroke()`, which was fifty-four rasteriser passes a shell.
 */
function drawShell(ctx, W, H, S, t, shell, px, strength) {
  const wind = windHere(shell.x * W, shell.y * H, S, t);
  const x = shell.x * W + wind.x * S * 0.02 * shell.u;
  const y = shell.y * H + wind.y * S * 0.02 * shell.u;

  // Every chunk composites **normally**, not additively, and this is the single thing that decides
  // whether the burst looks like pixel art or like a lens flare. Additive is the natural mode for
  // light and it is fatal here: an orange chunk over a yellow one over a red one sums past white, so
  // the middle of every burst — where the sparks are densest and the eye goes first — came out as a
  // flat white blob with a few coloured squares at the rim. Flat, opaque, unblended colour is what
  // makes the ramp readable, and a readable ramp is the whole of "high contrast".
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  if (shell.u < BURST_AT) {
    const climb = shell.u / BURST_AT;
    const size = px * (1 + Math.round(climb * 1.4));
    ctx.fillStyle = rgba(rampAt(EMBER, 2 - climb * 2), clamp((0.35 + climb * 0.6) * strength, 0, 1));
    ctx.beginPath();
    chunk(ctx, x - size / 2, y - size / 2, size, size, px);
    ctx.fill();
    ctx.restore();
    return;
  }

  const v = burstProgress(shell);
  const spread = burstSpread(shell, S);
  // Decelerating hard: a spark loses almost all of its speed in the first fifth of its life, which
  // is what makes a burst read as an explosion rather than as an expanding circle. The exponent used
  // to be gentler, and a gentler one is wrong for a pixel burst specifically — chunks are discrete,
  // so a slow expansion spends its first half as an indistinct clot of squares at the centre instead
  // of as a thing that has gone off.
  const out = 1 - (1 - v) ** 3.2;
  const fade = (1 - v) ** 1.6;
  const drift = wind.speed * SHELL_LIFE * (1 - BURST_AT) * v * 0.5;
  const dx = wind.x * drift;
  const dy = wind.y * drift;
  const beat = Math.floor(t * 14) / 14;
  const sparks = burstSparks(shell, spread, out, fade, beat);

  // The flash, at the instant of ignition: a single white chunk, three grid squares across, for a
  // twentieth of the burst's life. There used to be a soft disc most of the width of the burst that
  // grew and shrank, and a disc that grows and shrinks is the one shape that says "a value is being
  // animated" rather than "something exploded".
  if (v < 0.05) {
    ctx.fillStyle = rgba(EMBER[0], clamp((1 - v / 0.05) * strength, 0, 1));
    ctx.beginPath();
    chunk(ctx, x - px * 1.5, y - px * 1.5, px * 3, px * 3, px);
    ctx.fill();
  }

  // One path per ramp step. A spark's head sits at its reach and its tail runs back toward the
  // centre, one chunk per step; as it dies it loses tail chunks and its head cools down the ramp, so
  // a burst ends as a scatter of single red squares rather than as a shape being faded out.
  for (let step = 0; step < TRAIL; step += 1) {
    let any = false;
    ctx.beginPath();
    for (const s of sparks) {
      const alive = 1 + Math.round(s.life * (TRAIL - 1));
      const cooled = Math.round((1 - s.life) * 2);
      // Trail spacing is a *fraction* of how far out the spark is, capped at a couple of grid
      // squares. A fixed spacing means a spark that has not travelled two chunks yet has its whole
      // tail behind the centre of the burst, where it gets culled — so the first half of every burst
      // was a dense knot with no radiating in it at all.
      const gap = Math.min(px * 2.2, s.reach * 0.22);
      for (let k = 0; k < alive; k += 1) {
        if (Math.min(TRAIL - 1, k + cooled) !== step) continue;
        const reach = s.reach - k * gap;
        if (reach < px * 0.4) continue;
        // Only half a chunk bigger at the head. A double-size white square is four times the area of
        // the tail chunks behind it, so the ramp's hottest step ends up covering more of the burst
        // than the other four together and the whole thing reads white.
        const size = k === 0 ? px * 1.5 : px;
        const cx = x + Math.cos(s.angle) * reach + dx;
        const cy = y + Math.sin(s.angle) * reach + dy;
        chunk(ctx, cx - size / 2, cy - size / 2, size, size, px);
        any = true;
      }
    }
    if (!any) continue;
    ctx.fillStyle = rgba(EMBER[step], clamp((0.95 - step * 0.05) * strength, 0, 1));
    ctx.fill();
  }

  ctx.restore();

  // Smoke, lit from inside: chunky clots dissolving on the ordered dither matrix rather than fading
  // smoothly — the same `bayerOn` The Cloud comes apart on, so the two things in this scene that
  // break into blocks break into the same blocks. These *are* additive: they are glow rather than
  // spark, they are what the chunks are sitting in, and they are faint enough never to sum to white.
  const puffBeat = Math.floor(t * 9) / 9;
  for (let i = 0; i < 6; i += 1) {
    const power = fade * (0.35 + hash2(shell.seed + i * 8.3, i + 2) * 0.5)
      * (0.45 + 0.55 * hash2(shell.seed + i, puffBeat)) * strength;
    if (power < 0.05) continue;
    const a = hash2(shell.seed + i * 4.7, i + 11) * TAU;
    const d = spread * out * (0.2 + hash2(shell.seed + i * 2.9, i + 4) * 0.7);
    ditherGlow(
      ctx,
      x + Math.cos(a) * d + dx, y + Math.sin(a) * d + dy,
      spread * (0.1 + 0.13 * hash2(shell.seed + i * 6.7, i)) * (0.55 + out * 0.75),
      rgba(rampAt(EMBER, 1 + shell.tint + v * 1.4), 0.5), power, px, 1, 1.5,
    );
  }
}

/* -------------------------------------------------- and through the fog ---- */

/**
 * Every light below, seen through the whole depth of the cloud.
 *
 * This is the pass that actually gets looked at, and it does two different jobs. The fires get
 * *softness* — a wide faint mass, because a fire's light reaches the top of a bank diffused and
 * nothing else. The fireworks get their **chunks drawn again**, at partial strength, on the same
 * grid and in the same colours: hard-edged sparks sitting amongst the weather rather than behind it.
 * Half of a firework's whole character is that its edges survive the cloud, and a soft bloom is a
 * picture of light arriving somewhere rather than of the thing that threw it.
 */
export function drawLightBloom(ctx, W, H, t, lights) {
  if (!lights) return;
  const S = Math.min(W, H);
  const px = burstPixel(S);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const fire of lights.fires) {
    const life = fireLifeAt(fire, t);
    if (life < 0.01) continue;
    const flare = Math.max(flareAt(fire, t) * life, catchAt(fire, t));
    const flicker = flickerAt(fire, t);
    const wind = windHere(fire.x * W, fire.y * H, S, t);
    const r = S * fire.r * (0.55 + life * 0.45);
    // A fire at full flare used to throw the largest, brightest coloured mass in the frame — larger
    // and brighter than a shell going off, which puts the hierarchy exactly the wrong way up. A fire
    // is a steady thing you keep noticing; a firework is an event.
    const centre = clamp((0.035 + flare * 0.19) * life, 0, 1);
    // Stretched downwind like everything else it belongs to, and offset the same way: the fog it is
    // lighting has already been carried along by the time the light gets up there.
    lobe(
      ctx,
      fire.x * W + wind.x * r * 2.2, fire.y * H + wind.y * r * 2.2,
      r * (4.2 + flare * 4.2) * (0.85 + flicker * 0.3), r * (2.6 + flare * 2.6) * (0.85 + flicker * 0.3),
      wind.angle, COLD[fire.hue].body, centre, 0.1, 0.34, fire.phase + t * 0.5,
    );
  }

  for (const shell of shellsAt(lights.shows, t)) {
    const glare = shellGlare(shell);
    if (glare < 0.01) continue;
    // A soft base underneath, at a **fixed** radius: the moment a size follows a brightness there is
    // a pulsing ball in the frame again, whatever is drawn on top of it.
    glow(
      ctx, shell.x * W, shell.y * H,
      burstSpread(shell, S) * 0.9, rampAt(EMBER, 1 + shell.tint),
      clamp(glare * 0.16, 0, 1), clamp(glare * 0.09, 0, 1),
    );
    // ...and the burst itself again, chunk for chunk, at just under half strength. Full strength here
    // would be the same firework drawn twice and the fog would count for nothing; leaving it out
    // altogether is what made a burst a soft smudge, which is what it was.
    drawShell(ctx, W, H, S, t, shell, px, 0.45);
  }

  ctx.restore();
}
