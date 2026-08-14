// What is burning down there, who is setting it, and what gets launched at the sky.
//
// This file is **the only colour in the animation**. The ground is a photo negative of an already
// de-saturated palette and the weather is six greys; against that, anything at full chroma does not
// read as coloured pixels, it reads as the one thing in frame that is *lit* rather than merely
// visible. So it is worth being careful with, and it is kept in one place.
//
// **Everything that burns here is warm**, out of one five-step ramp: a warm white, a yellow, an
// orange and two reds. The fires were cyan and green for several rounds, on the theory that cold
// fires against hot fireworks would separate the two. It did separate them — and it also put the
// only cool hue in the animation on the one thing that is on screen continuously, so a soft
// blue-green disc sat in the cloud above every fire all the time, which is not a fire, it is a
// bubble of light. Fires and fireworks stay distinct on **shape and duration** instead, which is a
// stronger distinction anyway: a three-second event that comes apart into branching chunks cannot be
// confused with a mass that has sat there guttering for two minutes.
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
// The bursts are drawn as **branching pixel art**. Every limb is a run of chunks snapped to a coarse
// grid, stepping down the ramp from a warm-white head to a red tail at full opacity with hard edges,
// and limbs fork — each generation shorter, kinked further off its parent and cooler than the one it
// grew from. A plain radial star is the one arrangement that reads as *drawn* rather than as
// something that burst.
//
// **How many limbs, how often they fork, how far off, how far they throw and how long they burn are
// all drawn from the shell's own seed**, so one is a dense fine peony and the next is a dozen long
// unbranched streamers. Before that every burst had identical topology: the hashes underneath varied
// per shell so no two were the same *drawing*, and yet each was recognisably the same **object**.
// Randomising the seed harder cannot touch that, because what repeated was the structure and the
// structure was a constant. The launch sites move between shows for the same reason — once you have
// watched two rounds you know where to look, and no amount of variety inside a burst fixes a burst
// that always happens in the same place.
//
// They are drawn twice: once under the whole depth of the cloud, and once over it at a third
// strength with **the cloud eating chunks** — where the bank in front is thick a chunk is simply not
// drawn, on a hash of its own position so it is stable rather than sparkling. That is what "fog over
// a firework" has to mean for something made of hard squares: you cannot half-hide a pixel, so you
// take some of them away. Softness is the default a canvas gives you for free and it is the wrong
// default here: a firework seen through weather is the one thing in this scene allowed a hard edge.

import { TAU, clamp, glow, rampAt, rgba, smoothstep, wrap01 } from '../../lib/draw.js';
import { curl, hash2, noise2 } from '../../effects/field.js';
import { chunk, ditherGlow } from '../../effects/pixel.js';
import { lobe } from '../../effects/volume.js';
import { WIND, blackoutAt, cloudDensity, gustAt } from './fog.js';
import { leanX, leanY } from './town.js';

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

// The fires, out of the same family as the bursts — see the note at the top for why they are no
// longer cold. Two of them so a field of fires is not a field of one colour.
const FIRE = {
  ember: { body: [255, 108, 24], core: [255, 216, 150] },
  coal: { body: [226, 48, 20], core: [255, 176, 96] },
};

// People, seen from directly above: a dot the size of a pair of shoulders with a highlight on it.
// The body is dark and the highlight carries most of the read — with the ground taken down into the
// 60s and 100s, a dark dot alone has only a few dozen levels to work with on the deepest grass, and
// the pale mark on its shoulder is what still separates a person from a shadow.
const FIGURE = 'rgba(16, 12, 22, 0.94)';
const FIGURE_LIT = 'rgba(255, 250, 238, 0.92)';
/** Carried by a third of them. The one warm mark on the ground that is not a fire. */
const TORCH = 'rgba(255, 168, 58, 0.95)';
/** How tall a person is, in the units the town's lean is calibrated in. Shorter than a house. */
const PERSON_LIFT = 0.3;

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
      hue: i % 2 ? 'ember' : 'coal',
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
        // A slow circuit of their own patch, each at its own rate and in its own direction. This is
        // what gives a figure a **velocity** — noise alone jitters a mark about without ever
        // committing to a direction, which is why the crowd read as vibrating rather than walking.
        orbit: rng.range(0.013, 0.042),
        speed: rng.range(0.06, 0.2) * (rng.next() < 0.5 ? -1 : 1),
        tilt: rng.range(0, TAU),
        // Paces per second. Fast enough to be a walk, slow enough not to be a scuttle, and different
        // for everybody so a crowd never falls into step.
        stride: rng.range(3.4, 5.2),
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

/**
 * A fire's slow, never-ending unsteadiness.
 *
 * Two octaves, but the fast one is now half the rate it was and carries a third of the weight. At
 * 9 Hz the second term was a strobe, and twelve fires strobing out of phase is the kind of motion
 * you notice before you notice the scene. Fire breathes; it does not buzz.
 */
export const flickerAt = (fire, t) =>
  0.62 + 0.38 * (noise2(fire.phase, t * 1.9) * 0.72 + noise2(fire.phase + 7.3, t * 4.6) * 0.28);

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
    // **The site moves between shows.** Three fixed launch spots meant that once you had watched two
    // rounds you knew exactly where to look, and no amount of variety inside a burst fixes a burst
    // that always happens in the same place. People pick a different patch of bank each time.
    const siteX = show.x + (hash2(show.seed + 1.3, n * 2.7) - 0.5) * 0.19;
    const siteY = show.y + (hash2(show.seed + 4.9, n * 3.1 + 6) - 0.5) * 0.19;
    // ...and they do not always bring the same number of them.
    const count = 3 + Math.floor(hash2(show.seed + 8.1, n + 11) * 4);
    for (let i = 0; i < count; i += 1) {
      const start = i * (0.6 + hash2(show.seed + i, n) * 1.1);
      const u = (into - start) / SHELL_LIFE;
      if (u <= 0 || u >= 1) continue;
      const seed = show.seed + i * 3.7 + n * 11.3;
      live.push({
        u,
        show: s,
        seed,
        // Each shell goes up from a slightly different spot, because they are being lit by hand.
        x: siteX + (hash2(show.seed + i * 2.3, n) - 0.5) * 0.07,
        y: siteY + (hash2(show.seed + i * 5.1, n + 3) - 0.5) * 0.07,
        // Where in the ramp this shell sits: some go up gold, some go up nearly all red.
        tint: hash2(show.seed + i * 7.9, n + 7) * 1.5,
        ...shellKind(seed),
      });
    }
  }
  return live;
}

/**
 * What *kind* of firework this one is.
 *
 * Every burst used to have identical topology — the same two dozen primaries, forking twice at the
 * same angle, over the same fraction of the frame. The hashes underneath it all varied per shell, so
 * no two were the same *drawing*, and yet every one was recognisably the same **object**: a thing of
 * a certain size that comes apart a certain way. Randomising the seed harder would not have touched
 * that, because the thing that repeated was the structure and the structure was a constant.
 *
 * So the structure is drawn from the seed too. A shell can be a dense fine peony of forty limbs
 * forking twice, or a dozen long unbranched streamers, or a tight bright knot that barely spreads.
 * The three read as three different fireworks rather than three samples of one.
 */
function shellKind(seed) {
  const a = hash2(seed * 1.7, 21);
  const b = hash2(seed * 2.9 + 5, 33);
  const c = hash2(seed * 4.3 + 9, 47);
  return {
    // Twelve to forty-four primaries.
    sparks: 12 + Math.round(a * 32),
    // Nought to two generations of forking. Nought is a willow: long limbs, no branching at all.
    forks: Math.round(b * 2),
    // How far a fork kicks off its parent.
    kink: 0.22 + c * 0.6,
    // Fewer limbs throw further, so a sparse shell is a big one and a dense shell is a tight one —
    // which is roughly how they are actually built, and stops the count reading as a density knob.
    reach: 1.35 - a * 0.6,
    // Some burn out in a second, some hang for three.
    burn: 0.72 + b * 0.7,
  };
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

/** Chunks in a spark's trail at full life — and, not coincidentally, steps in the ramp. */
const TRAIL = EMBER.length;

/**
 * The sparks of a burst, as geometry — a **branching** structure, not a star.
 *
 * A primary ray forks in two partway along its length, and each of those may fork again — how many
 * times, how far off, how many rays there were to begin with and how far they throw all come from
 * the shell's own `kind`, so one burst is a dense fine peony and the next is a dozen long unbranched
 * streamers. Each generation is shorter, kinked further off its parent and shorter-lived than the one
 * it came from. A firework really does come apart this way, and a plain radial
 * star — which is what this was — is the one arrangement that reads as *drawn* rather than as
 * something that burst.
 *
 * A spark is a point, a direction and a length rather than an angle from the centre, because a
 * branch does not start at the centre. Its chunks are laid from the tip backwards.
 *
 * Two per-spark quantities do all the work of not being a circle. A **speed**, so the front is
 * ragged rather than a rim — one radius for every spark is a disc however it is coloured. And a
 * **life**, which here decides how many chunks of trail a spark still has and how far down the ramp
 * its head has cooled, rather than how transparent it is: a pixel spark goes out by losing its tail
 * and turning red, never by fading, because a half-transparent chunk is not a pixel.
 */
function burstSparks(shell, spread, out, fade, beat) {
  const sparks = [];

  const grow = (x0, y0, angle, len, life, depth, id) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    sparks.push({ x0, y0, dx, dy, len, life, depth });
    if (depth >= shell.forks) return;
    for (let b = 0; b < 2; b += 1) {
      const h = hash2(shell.seed + id * 2.7 + b * 5.3, depth + 3);
      const k = hash2(shell.seed + id * 4.1 + b * 1.9, depth + 11);
      // Fork somewhere in the outer half of the parent, so the limb it leaves has room to read as a
      // limb rather than as a second ray from the same point.
      const at = len * (0.4 + h * 0.34);
      grow(
        x0 + dx * at, y0 + dy * at,
        angle + (b ? 1 : -1) * (shell.kink + k * 0.4),
        len * (0.5 + h * 0.3),
        life * (0.62 + k * 0.16),
        depth + 1,
        id * 4 + b + 1,
      );
    }
  };

  for (let i = 0; i < shell.sparks; i += 1) {
    // Hashed angles, not even ones. Any number of rays at exactly equal spacing is a compass rose, and
    // the eye finds that instantly.
    const h = hash2(shell.seed + i * 1.9, i);
    const k = hash2(shell.seed + i * 3.3, i + 5);
    const j = hash2(shell.seed + i * 6.1, i + 9);
    // Twinkling on the held clock: a limb blinks out for a beat and comes back, and takes everything
    // growing off it with it. On a soft mark this would be a defect; on a hard-edged one it is the
    // thing that makes it look alive.
    if (hash2(shell.seed + i, beat) < 0.09) continue;
    grow(
      0, 0,
      // A little curl on top of the radial line, growing as it goes out — a streamer bends, a ray
      // does not.
      h * TAU + (j - 0.5) * 0.7 * out,
      spread * out * (0.42 + k * 1.05) * shell.reach,
      clamp(fade * (0.45 + j * 1.1) * shell.burn, 0, 1),
      0,
      i + 1,
    );
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
  const r = Math.max(1.8, S * 0.0052);

  // How worked up each crowd is: nothing, then rising as a shell climbs, peaking as it goes off, then
  // draining away. A **smooth envelope**, and that is the whole of the fix — this used to be a
  // boolean, and the moment a shell appeared every figure at that site jumped a fiftieth of the frame
  // outward in one frame and jumped back when it died. Ninety people teleporting in unison twice a
  // minute is not a reaction, it is a glitch that happens to be motivated.
  const excitement = (tt) => {
    const e = [0, 0, 0];
    for (const shell of shellsAt(lights.shows, tt)) {
      e[shell.show] = Math.max(
        e[shell.show],
        smoothstep(0, BURST_AT, shell.u) * (1 - smoothstep(0.55, 1, shell.u)),
      );
    }
    return e;
  };

  /**
   * Where a person is at a given moment.
   *
   * An ellipse around their own patch at their own rate and in their own direction, plus a slow
   * wander on noise, plus however far the crowd has backed off from a shell. Because it is a
   * function of time rather than a jitter, it can be **sampled twice** — and the difference between
   * the two samples is the direction they are walking, which is what everything else here needs.
   */
  const at = (p, tt, excite) => {
    const loop = tt * p.speed * TAU + p.phase;
    const ox = Math.cos(loop) * p.orbit;
    const oy = Math.sin(loop) * p.orbit * 0.7;
    // The circuit is tilted, so a crowd is not a set of concentric running tracks.
    let x = p.x + ox * Math.cos(p.tilt) - oy * Math.sin(p.tilt)
      + (noise2(p.phase, tt * 0.13) - 0.5) * p.drift * 2;
    let y = p.y + ox * Math.sin(p.tilt) + oy * Math.cos(p.tilt)
      + (noise2(p.phase + 5.7, tt * 0.11) - 0.5) * p.drift * 2;
    if (p.show >= 0 && excite[p.show] > 0.001) {
      const show = lights.shows[p.show];
      const dx = x - show.x;
      const dy = y - show.y;
      const d = Math.hypot(dx, dy) || 1;
      x += (dx / d) * 0.035 * excite[p.show];
      y += (dy / d) * 0.035 * excite[p.show];
    }
    return [x * W, y * H];
  };

  const now = excitement(t);
  const then = excitement(t - 0.2);

  const foot = [];
  const head = [];
  // The direction each figure is walking, and the one across it. Shoulders run **across a heading**,
  // not across the camera's lean: a person walking north-east presents their shoulders to you at that
  // angle whatever corner of the frame they are in, and getting that one thing right is most of the
  // difference between a crowd and a field of identical marks.
  const across = [];
  const gait = [];
  for (const p of lights.people) {
    const [bx, by] = at(p, t, now);
    const [px, py] = at(p, t - 0.2, then);
    let hx = bx - px;
    let hy = by - py;
    const speed = Math.hypot(hx, hy);
    if (speed < 0.0001) { hx = 1; hy = 0; }
    else { hx /= speed; hy /= speed; }
    across.push(-hy, hx);
    // A pace: the body rises and falls and the head rocks a little across the walk. Scaled by how
    // fast they are actually going, so somebody who has stopped stands still instead of marching on
    // the spot.
    // The reference speed is deliberately low: almost everybody who is moving at all gets a full
    // pace, and only somebody who has genuinely stopped stands still. Scaled off a walking pace
    // instead, the clamp sat around 0.4 for the whole crowd and the bob came out at a third of a
    // pixel — present in the arithmetic, invisible on the screen.
    const pace = Math.sin(t * p.stride + p.phase) * clamp(speed / (S * 0.0007), 0, 1);
    gait.push(pace);
    foot.push(bx, by);
    head.push(
      leanX(bx, W, PERSON_LIFT * (1 + pace * 0.3)) - hy * pace * r * 0.4,
      leanY(by, H, PERSON_LIFT * (1 + pace * 0.3)) + hx * pace * r * 0.4,
    );
  }

  // Shadows, opposite the lean, stretched a little across.
  ctx.fillStyle = 'rgba(2, 3, 10, 0.52)';
  ctx.beginPath();
  for (let i = 0; i < foot.length; i += 2) {
    const sx = leanX(foot[i], W, -PERSON_LIFT * 0.85);
    const sy = leanY(foot[i + 1], H, -PERSON_LIFT * 0.85);
    for (const side of [-0.45, 0.45]) {
      const cx = sx + across[i] * r * side;
      const cy = sy + across[i + 1] * r * side;
      ctx.moveTo(cx + r * 1.25, cy);
      ctx.arc(cx, cy, r * 1.25, 0, TAU);
    }
  }
  ctx.fill();

  // The torso: foot to shoulder, short and **thick** — as wide as it is long, so it is a mass and
  // not a line. This was a full-height stroke a pixel and a half wide, which is a matchstick, and
  // putting a ball on top of a matchstick gets you a matchstick with a ball on top.
  ctx.strokeStyle = FIGURE;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 1.5;
  ctx.beginPath();
  for (let i = 0; i < foot.length; i += 2) {
    ctx.moveTo(foot[i], foot[i + 1]);
    ctx.lineTo(foot[i] + (head[i] - foot[i]) * 0.62, foot[i + 1] + (head[i + 1] - foot[i + 1]) * 0.62);
  }
  ctx.stroke();

  // Shoulders: two overlapping discs set across the walk. Two arcs and no transform, so the whole
  // crowd's shoulders are still one path — and two discs side by side is the cheapest thing that
  // reads as *wider than it is deep*, which from directly above is the only thing a body is. They
  // rock with the pace, which at four pixels is the difference between walking and sliding.
  ctx.fillStyle = FIGURE;
  ctx.beginPath();
  for (let i = 0; i < head.length; i += 2) {
    const sx = foot[i] + (head[i] - foot[i]) * 0.66;
    const sy = foot[i + 1] + (head[i + 1] - foot[i + 1]) * 0.66;
    const swing = gait[i / 2] * 0.26;
    for (const side of [-0.5 + swing, 0.5 + swing]) {
      const cx = sx + across[i] * r * side;
      const cy = sy + across[i + 1] * r * side;
      ctx.moveTo(cx + r * 0.8, cy);
      ctx.arc(cx, cy, r * 0.8, 0, TAU);
    }
  }
  ctx.fill();

  // Head, and the highlight on it that carries the read at this size. The head is *smaller* than the
  // shoulders, which is the detail that makes the silhouette a person rather than a bowling pin —
  // the same mistake, at a hundredth of the size, that the angel took two goes to stop making. The
  // highlight and the carried light are both placed relative to the **walk**, so a torch is out in
  // front of whoever is holding it rather than pinned to one corner of the screen.
  for (const [style, scale, ahead, side, only] of [
    [FIGURE, 0.72, 0, 0, null],
    [FIGURE_LIT, 0.4, 0.24, -0.24, null],
    [TORCH, 0.4, 0.7, 0.75, 3],
  ]) {
    ctx.fillStyle = style;
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < head.length; i += 2) {
      // A third of them are carrying something burning. They are the ones setting the fires, so at
      // least some of them ought to have arrived with a light in their hand.
      if (only !== null && (i / 2) % only !== 0) continue;
      const cx = head[i] - across[i + 1] * r * ahead + across[i] * r * side;
      const cy = head[i + 1] + across[i] * r * ahead + across[i + 1] * r * side;
      ctx.moveTo(cx + r * scale, cy);
      ctx.arc(cx, cy, r * scale, 0, TAU);
      any = true;
    }
    if (any) ctx.fill();
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
  const { body, core } = FIRE[fire.hue];
  // The held clock the lobe body is rebuilt on. Seven times a second rather than twelve: a fire does
  // gutter rather than ease, but at twelve the guttering was faster than the eye tracks and read as
  // noise on top of the shape instead of as the shape moving.
  const beat = Math.floor(t * 7) / 7;
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

  // The flame itself, in chunks, on the same grid the fireworks use.
  drawFlame(ctx, S, t, fire, x, y, r, wind, flare, life, burstPixel(S), 1, null);

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
 * A fire's flame, as pixel art.
 *
 * The fires were soft lobes with a scatter of dithered specks over them, and the specks were what
 * you actually saw — a fire read as three or four loose pixels with no shape to them at all, which
 * is why they were indistinguishable from the burnt-out tail of a firework.
 *
 * A flame is a **tapering stack of rows**, widest at the base and narrowing as it goes, leaning
 * downwind further with every row, hottest at the bottom and cooling to red at the tip. Rebuilt on a
 * held clock at twelve frames a second so it gutters rather than eases — the same clock the soft
 * lobes underneath already run on, so the two halves of a fire flicker together instead of beating
 * against each other. Batched one path per ramp step, so a whole flame is five fills at most and
 * usually three.
 */
function drawFlame(ctx, S, t, fire, x, y, r, wind, flare, life, px, strength, veil) {
  // Between three and seven rows tall, by how hard it is burning.
  const rows = Math.max(3, Math.round((r / px) * (1.6 + flare * 1.4) * life));
  const wide = Math.max(1, Math.round((r / px) * 0.85));

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (let step = 0; step < TRAIL; step += 1) {
    let any = false;
    ctx.beginPath();
    for (let k = 0; k < rows; k += 1) {
      const up = k / rows;
      // Cooling upward, and the whole flame cools as it dies back.
      if (Math.min(TRAIL - 1, Math.round(up * (TRAIL - 1) + (1 - life) * 1.5)) !== step) continue;
      // Width and sway both come from **continuous noise**, and the noise is read *upward through the
      // flame* as well as through time — so a bulge starts at the base and travels to the tip, which
      // is what a flame does. This was a hash re-rolled per row on a held twelve-frame clock, which
      // gave every row a new unrelated width eighty-odd times a second: not flicker, scintillation.
      // The chunk grid still quantises the result, so it is a pixel flame either way; the difference
      // is whether the pixels are moving or merely changing.
      const swell = noise2(fire.phase + k * 0.55, t * 1.9 - k * 0.32);
      const half = Math.max(0, Math.round(wide * (1 - up * 0.85) * (0.62 + swell * 0.66)));
      // Leaning further downwind the higher it goes: the tip of a flame is downwind of its base. Only
      // a little, though — a flame that leans a full chunk per row is a flame lying on its side, and
      // twelve of those read as streaks rather than as fires.
      const lean = k * px * (0.16 + gustAt(t) * 0.22);
      const sway = (noise2(fire.phase + 6.3 + k * 0.4, t * 1.35 - k * 0.28) - 0.5) * 1.6;
      const cx = x + wind.x * lean + sway * px;
      const cy = y + wind.y * lean - k * px * 0.12;
      for (let c = -half; c <= half; c += 1) {
        const bx = cx + wind.y * c * px;
        const by = cy - wind.x * c * px;
        if (veil && hash2(bx * 0.021, by * 0.019) > veil(bx, by)) continue;
        chunk(ctx, bx - px / 2, by - px / 2, px, px, px);
        any = true;
      }
    }
    if (!any) continue;
    ctx.fillStyle = rgba(EMBER[step], clamp((0.95 - step * 0.05) * strength, 0, 1));
    ctx.fill();
  }
  ctx.restore();
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
function drawShell(ctx, W, H, S, t, shell, px, strength, veil = null) {
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

  // One path per ramp step. A limb's head sits at its tip and its tail runs back along itself, one
  // chunk per step; as it dies it loses tail chunks and its head cools down the ramp, so a burst
  // ends as a scatter of single red squares rather than as a shape being faded out. Deeper
  // generations start further down the ramp, so the branches are cooler than what they grew off.
  for (let step = 0; step < TRAIL; step += 1) {
    let any = false;
    ctx.beginPath();
    for (const s of sparks) {
      const alive = 1 + Math.round(s.life * (TRAIL - 1));
      const cooled = Math.round((1 - s.life) * 2) + s.depth;
      // Trail spacing is a *fraction* of the limb's length, capped at a couple of grid squares. A
      // fixed spacing means a limb shorter than two chunks has its whole tail behind its own root,
      // where it gets culled — so the first half of every burst was a knot with no radiating in it,
      // and every branch would have vanished for the same reason.
      const gap = Math.min(px * 2.2, s.len * 0.24);
      for (let k = 0; k < alive; k += 1) {
        if (Math.min(TRAIL - 1, k + cooled) !== step) continue;
        const along = s.len - k * gap;
        if (along < px * 0.4) continue;
        // Only half a chunk bigger at the head, and only on a primary. A double-size white square is
        // four times the area of the tail chunks behind it, so the ramp's hottest step ends up
        // covering more of the burst than the other four together and the whole thing reads white.
        const size = k === 0 && s.depth === 0 ? px * 1.5 : px;
        const cx = x + s.x0 + s.dx * along + dx;
        const cy = y + s.y0 + s.dy * along + dy;
        // The cloud eats chunks. Where the bank in front is thick a chunk is simply not drawn, and
        // the decision is a hash of its own position so it is stable frame to frame rather than
        // sparkling. This is what "more fog over the fireworks" means for something made of hard
        // squares: you cannot half-hide a pixel, so you take some of them away.
        if (veil && hash2(cx * 0.021, cy * 0.019) > veil(cx, cy)) continue;
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
  // No cloud, no light in the cloud. During a blackout this pass would leave a dozen soft glows and a
  // set of chunky sparks hanging in clear air with nothing to be inside, which is the one thing that
  // would give the trick away — the reveal only works if what is revealed is the *bare* ground.
  const cloud = 1 - blackoutAt(t);
  if (cloud <= 0.001) return;
  const S = Math.min(W, H);
  const px = burstPixel(S);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // A fire's light in the cloud, as **three chunky masses laid downwind** rather than one soft
  // ellipse. The ellipse was a bubble: a smooth coloured disc hanging over every fire, on screen the
  // whole time, and the single most artificial thing in the frame. Dithered blocks in a row that
  // leans with the wind read as a lit patch of cloud instead — and they are made of the same squares
  // the fireworks are, so the two things that glow now glow in the same language.
  for (const fire of lights.fires) {
    const life = fireLifeAt(fire, t);
    if (life < 0.01) continue;
    const flare = Math.max(flareAt(fire, t) * life, catchAt(fire, t));
    const flicker = flickerAt(fire, t);
    const wind = windHere(fire.x * W, fire.y * H, S, t);
    const r = S * fire.r * (0.55 + life * 0.45);
    const { body } = FIRE[fire.hue];
    // A fire at full flare used to throw the largest, brightest coloured mass in the frame — larger
    // and brighter than a shell going off, which puts the hierarchy exactly the wrong way up. A fire
    // is a steady thing you keep noticing; a firework is an event.
    const power = clamp((0.42 + flare * 0.85) * life * (0.75 + flicker * 0.35) * cloud, 0, 1);
    // A soft base, drawn as a **3:1 smear along the wind** at a low alpha. Firelight genuinely does
    // diffuse through cloud, and refusing it any softness at all does not remove the bubble, it just
    // replaces it with a tidy little pile of squares — which is what a tight dither on its own looks
    // like. What made the old one a bubble was that it was round, blue-green, bright, and on screen
    // continuously. Long, warm, faint and leaning is a different object.
    lobe(
      ctx,
      fire.x * W + wind.x * r * 2.6, fire.y * H + wind.y * r * 2.6,
      r * (5.2 + flare * 4) * (0.85 + flicker * 0.3), r * (1.7 + flare * 1.3) * (0.85 + flicker * 0.3),
      wind.angle, body, clamp(power * 0.13, 0, 1), 0.08, 0.4, fire.phase + t * 0.5,
    );
    // Smoke above it, dithered.
    ditherGlow(
      ctx,
      fire.x * W + wind.x * r * 2.4, fire.y * H + wind.y * r * 2.4,
      r * 1.4 * (1 + flare * 0.5), rgba(body, 0.5), power * 0.55, px, 1, 2.6,
    );
    // ...and the flame again, chunk for chunk, with the cloud eating whichever chunks have a bank in
    // front of them — exactly as a burst is treated. A fire seen through weather should come apart
    // the same way a firework does, or the two of them stop looking like they are in the same air.
    drawFlame(
      ctx, S, t, fire, fire.x * W, fire.y * H, r,
      wind, flare, life, px, 0.4, (cx, cy) => cloudDensity(cx, cy, S, t) ** 3.4,
    );
  }

  for (const shell of shellsAt(lights.shows, t)) {
    const glare = shellGlare(shell) * cloud;
    if (glare < 0.01) continue;
    // A soft base underneath, at a **fixed** radius: the moment a size follows a brightness there is
    // a pulsing ball in the frame again, whatever is drawn on top of it.
    glow(
      ctx, shell.x * W, shell.y * H,
      burstSpread(shell, S) * 0.9, rampAt(EMBER, 1 + shell.tint),
      clamp(glare * 0.12, 0, 1), clamp(glare * 0.07, 0, 1),
    );
    // ...and the burst itself again, chunk for chunk, at a third strength and with the cloud eating
    // whichever chunks have a bank in front of them. Full strength here would be the same firework
    // drawn twice and the fog would count for nothing; leaving it out altogether is what made a
    // burst a soft smudge, which is what it was. This is the middle, and it is where a firework
    // *inside* weather actually lives — most of it hidden, a scatter of it not.
    drawShell(ctx, W, H, S, t, shell, px, 0.34 * cloud, (cx, cy) => cloudDensity(cx, cy, S, t) ** 3.4);
  }

  ctx.restore();
}
