// The fog: ninety-five percent of this picture, and the only thing in it that moves.
//
// The brief asks for three things that pull against each other, and the whole structure of this
// file is the arrangement that gets all three at once:
//
//   *coverage* — the ground below is almost never visible, and where it is, it is a gap a couple of
//   hundred pixels across for a second or two;
//   *range* — the fog runs from near-black to near-white, not a field of mid-grey;
//   *change* — masses billow, draw out, thin away and are replaced by masses welling up through
//   them, so the field is always turning into itself rather than sliding past.
//
// Nothing here glitches. There was a whole pass of it once — lobes strobing out, bands of the
// lattice shoved sideways, the finished frame shredded — and the trouble with all of it is that fog
// has no detail to corrupt, so damaging it can only ever *remove* it. Fog vanishing in chunks does
// not read as a fault in the picture, it reads as a fault in the renderer. The glitching moved
// wholesale into `apparition.js`, where it belongs to one object with an outline and a face, and is
// unmistakably something happening rather than something broken.
//
// **Coverage is geometric, not lucky.** The base of the fog is a lattice: a jittered grid of lobes,
// each a good half wider than its cell, so every point in the frame is inside two or three of them
// by construction. Fog built by scattering clouds around and hoping cannot promise 95% — there is
// always a hole somewhere — and a hole that appears because the random numbers came out that way is
// a hole in the wrong place, which is worse than no hole at all.
//
// **The peek-a-boos are subtraction, not holes.** Seven windows wander the frame on a staggered
// clock, and a lobe near an open one is drawn *thinner* rather than skipped. So a gap opens because
// the fog above it thinned, closes when a billow drifts back over, and is ringed by a soft
// transition the whole time — none of which a punched hole gives you. It follows that the *aerial
// wash* has to stay light: it is the one layer covering the whole frame unconditionally, so
// whatever opacity it carries is a floor on how clear a window can ever get. Most of the hiding is
// therefore done by cloud, which windows can thin, rather than by haze, which they cannot.
//
// **Range comes from ordering, not from opacity.** A stack of transparent greys composites toward
// its own mean, and cranking the alphas only gets you to mid-grey faster. So one slow, large-scale
// field decides where the fog is thick and where it is thin, and *everything* reads it: the base
// takes its tone from it, the light is only allowed to land where it is already high, and the
// near-black strands only where there is light to eat into. That is what turns six greys into
// banks — a near-black mass here, a pale one drifting over there — instead of an even mottle. The
// brightest lobes are additive on top of that, which is the only way to actually reach white.
//
// Everything here is a pure function of `t`. See the note at the top of `site/effects/field.js` for
// why that is a hard requirement and not a preference.

import { TAU, clamp, rampAt, smoothstep, wrap01 } from '../../lib/draw.js';
import { curl, fbm, flowAngle, hash2 } from '../../effects/field.js';
import { lobe, vignette } from '../../effects/volume.js';
import { drawApparition } from './apparition.js';

/* ------------------------------------------------------------- palette ---- */

// One neutral ramp, near-black to near-white, with two or three points of channel spread — cool in
// the shadows, a hair warm at the top. Desaturated realism is not the same as grey: a truly neutral
// ramp reads as a printing error, and anything more than this reads as weather on another planet.
const VOID = [9, 11, 13];
const COAL = [20, 24, 27];
const PITCH = [31, 36, 40];
const SLATE = [54, 60, 65];
const STONE = [78, 84, 89];
const ASH = [125, 132, 137];
const BONE = [172, 178, 181];
const LINEN = [223, 227, 228];
const SNOW = [243, 245, 245];

/** The dark base. Weighted toward the bottom of the ramp: this deck is what hides the town. */
const CURTAIN = [PITCH, SLATE, STONE, ASH, BONE, LINEN];
/** The body of the fog, between the curtain and the light. */
const BODY = [SLATE, STONE, STONE, ASH];
/** Lit tops. Drawn additively, so these are the values that actually reach white. */
const CREST = [BONE, LINEN, SNOW];

// One light, fixed, up and slightly left — the sun somewhere behind the overcast. Crests are the
// same mass as the billow beneath them, shifted this way; that offset is the entire reason a flat
// soft disc reads as a three-dimensional billow instead of as a stain.
const KEY_X = -0.36;
const KEY_Y = -0.92;

/* ---------------------------------------------------------------- plan ---- */

// How long a window's whole cycle takes. Every window shares it, and their phases are spread evenly
// around it — which is what stops them ever bunching up. Give them slightly different periods and
// they drift into alignment eventually and hand you a frame with the fog half gone.
const WINDOW_PERIOD = 21;

/**
 * Everything about the fog that is decided once. Nothing in here depends on the viewport: the
 * lattice is derived from the frame at draw time and its per-cell randomness comes out of a hash,
 * so a resize cannot shuffle the weather.
 */
export function planFog(rng) {
  const salt = rng.range(0, 97);

  // Billows: the mass of the fog. Each is born small, swells, and dies, and is reborn somewhere
  // else — which is the difference between fog that billows and fog that merely deforms in place.
  const billows = Array.from({ length: 22 }, (_, i) => ({
    id: i * 3.71 + salt,
    life: rng.range(13, 27),
    phase: rng.next(),
    tone: Math.floor(rng.range(0, BODY.length)),
    alpha: rng.range(0.15, 0.30),
    size: rng.range(0.085, 0.185),
    squash: rng.range(0.48, 0.84),
    // Rather more than half catch the light. A crest is the same mass drawn again, offset, so this
    // is a flag on the billow and not a deck of its own — the highlight is always *on* something.
    lit: rng.next() < 0.75,
    crestTone: Math.floor(rng.range(0, CREST.length)),
    crestAlpha: rng.range(0.15, 0.30),
  }));

  // Wisps: the fine frequency. Long, thin, aligned to the flow, and much brighter than they are
  // big. Without a second scale an order of magnitude finer than the billows, the whole thing reads
  // as smoke from a machine rather than as a fog bank — this is the layer that decides it.
  const wisps = Array.from({ length: 70 }, (_, i) => ({
    id: i * 5.13 + salt * 1.7,
    // Short lives on purpose. A filament that took half a minute to draw out and go would be
    // indistinguishable from one sitting still; at five to eleven seconds you watch it happen.
    life: rng.range(5, 11),
    phase: rng.next(),
    tone: Math.floor(rng.range(0, CREST.length)),
    alpha: rng.range(0.05, 0.13),
    size: rng.range(0.055, 0.15),
    squash: rng.range(0.16, 0.34),
  }));

  // Erosion: the same shape in near-black, drawn last over the light, so the crests come apart into
  // strands instead of sitting there as smooth blobs. Fog is as dark as it is bright.
  const streaks = Array.from({ length: 40 }, (_, i) => ({
    id: i * 7.31 + salt * 2.3,
    life: rng.range(6, 13),
    phase: rng.next(),
    tone: Math.floor(rng.range(0, 3)),
    alpha: rng.range(0.07, 0.15),
    size: rng.range(0.06, 0.17),
    squash: rng.range(0.16, 0.36),
  }));

  // The peek-a-boos. Evenly spread around one shared period; only the duty cycle varies, which
  // breaks the rhythm without ever letting two of them line up.
  const windows = Array.from({ length: 7 }, (_, i) => ({
    id: i * 17.33 + salt * 3.1,
    phase: i / 7 + rng.range(-0.018, 0.018),
    duty: rng.range(0.26, 0.36),
  }));

  return { salt, billows, wisps, streaks, windows };
}

/* ------------------------------------------------------- time and chance ---- */

/** Per-cell randomness that depends only on where the cell is — so a resize cannot reshuffle it. */
const cellRand = (col, row, salt, k) =>
  hash2(col * 1.37 + k * 7.13 + salt * 0.61, row * 2.11 - k * 3.71 - salt * 0.29);

/**
 * How pale the fog is at a point: one slow, large-scale field, sampled by everything that needs to
 * agree about where the banks are.
 *
 * Everything reads the *same* field, which is the point. The dark decks take their tone from it and
 * the light lands only where it is already high, so a highlight always sits on the top of a pale
 * mass. Choose the two independently and the crests come out as bright shapes scattered over
 * near-black — objects lying on the fog rather than light falling on it.
 */
const bankAt = (x, y, S, t) => fbm((x / S) * 0.85 + t * 0.008, (y / S) * 0.85 - t * 0.004, 3);

/**
 * How much of what is underneath gets up through the cloud here: 1 where the bank is thin, down
 * toward a half where it is thick.
 *
 * Exported because two other things need to agree with the fog about where its banks are — the
 * apparition, which is veiled cell by cell, and the fireworks, whose chunks are eaten by it. A
 * second opinion about where the fog is would put both of them brightest exactly where it is
 * thickest.
 */
export const cloudDensity = (x, y, S, t) => 1 - 0.5 * bankAt(x, y, S, t);

/* ------------------------------------------------------------------ wind ---- */

// The wind gusts. Two slow sine terms on top of a steady base, at deliberately non-harmonic
// periods (~57s and ~146s), so the air surges and slackens without ever settling into a rhythm.
// Never negative: 1 - 0.35 - 0.22 leaves a third of the base speed at the calmest moment.
const GUST_A = 0.35;
const GUST_W = 0.11;
const GUST_B = 0.22;
const GUST_V = 0.043;

/** The wind's speed at time `t`, as a multiple of the base. */
export const gustAt = (t) => 1 + GUST_A * Math.sin(t * GUST_W) + GUST_B * Math.sin(t * GUST_V + 1.7);

/**
 * How far the wind has carried something by time `t`, as a multiple of the base speed — the
 * *integral* of `gustAt`, in closed form.
 *
 * This is the whole reason gusting works at all. Multiplying position by a time-varying speed
 * (`x = speed(t) * t`) is not motion under a changing wind, it is teleportation: raise the speed
 * and everything that has already travelled instantly jumps further out. Integrating instead means
 * a gust only affects where things go *from now on*, which is what wind does.
 */
const windAt = (t) =>
  t
  - (GUST_A / GUST_W) * (Math.cos(t * GUST_W) - 1)
  - (GUST_B / GUST_V) * (Math.cos(t * GUST_V + 1.7) - Math.cos(1.7));

/** Base wind speed, in fractions of the short edge per second. */
export const WIND = 0.045;

/**
 * One incarnation of a recycled element: which life it is on, how far through, and where that life
 * put it. Stateless — ask at any `t`, in any order, and get the same answer, which is what lets the
 * render tests sample time backwards.
 *
 * **A mass dissolves, it does not fade.** `spread` grows monotonically through the life while
 * `swell` rises and falls, so a mass arrives small and dense and leaves wide and thin — which is
 * what vapour does, and the difference between fog that dissipates and fog that simply stops being
 * drawn. Scaling opacity and size together, the old way, gives you a shape that shrinks back to a
 * point: a thing being removed rather than a thing spreading out until it is indistinguishable from
 * the air around it.
 *
 * **And each life begins where the last one ended.** The home of incarnation `n` is the home of
 * `n - 1` plus a short hop, so a mass that has just thinned away is replaced by one welling up
 * through it rather than by one somewhere else entirely — the eye joins them into a single body of
 * air turning over. Cheap, and it is most of what makes the field read as *changing into itself*
 * rather than as a set of independent puffs taking turns.
 */
function incarnate(element, t, W, H) {
  const cycles = (t + element.phase * element.life) / element.life;
  const n = Math.floor(cycles);
  const u = cycles - n;

  // The chain: a walk that only ever moves a little at each step, evaluated from the incarnation
  // number so it stays closed-form. Two hops of history is enough for the handover to read.
  const hop = (k, salt) => (hash2(element.id + salt, k) - 0.5) * 0.34;
  const x = (wrap01(hash2(element.id, n >> 2) + hop(n, 0) + hop(n - 1, 0) * 0.5) * 1.36 - 0.18) * W;
  const y = (wrap01(hash2(element.id + 41.7, n >> 2) + hop(n, 9.1) + hop(n - 1, 9.1) * 0.5) * 1.36 - 0.18) * H;

  return {
    u,
    n,
    x,
    y,
    // When this life began, so the wind it has been carried by can be integrated over exactly the
    // stretch of time it has existed for rather than approximated by a constant rate.
    born: n * element.life - element.phase * element.life,
    life: element.life,
    // Zero at both ends: nothing pops into or out of existence.
    swell: Math.sin(u * Math.PI) ** 0.62,
    // Always growing. Never zero, so a mass is never a point.
    spread: 0.52 + 1.22 * u,
    // Fine detail boils harder as a mass comes apart. The outline is where this shows.
    unrest: 0.6 + 2.4 * u * u,
  };
}

/**
 * Where the wind has carried a live element, relative to its home.
 *
 * Centred on the middle of its life — half a life's travel upwind at birth, half downwind at death
 * — so a mass is not always born to the left of where it belongs and the left of the frame does not
 * run short. And it is the *integral* over the element's own lifetime, so a gust that arrives
 * halfway through moves it from there rather than retroactively.
 */
const carried = (live, t, S) =>
  (windAt(t) - windAt(live.born) - (windAt(live.born + live.life) - windAt(live.born)) * 0.5) * S * WIND;

/* -------------------------------------------------------------- windows ---- */

/** The windows that are open right now, already scaled by how far open they are. */
function openWindows(fog, t, W, H) {
  const S = Math.min(W, H);
  const live = [];
  for (const w of fog.windows) {
    const cycles = t / WINDOW_PERIOD + w.phase;
    const n = Math.floor(cycles);
    const u = cycles - n;
    if (u >= w.duty) continue;
    const open = Math.sin((u / w.duty) * Math.PI) ** 0.7;
    const r = S * (0.046 + 0.038 * hash2(w.id + 7.3, n)) * open;
    if (r < 2) continue;
    // Held off the very edge of the frame: a peek-a-boo half out of shot is a torn corner.
    const hx = 0.13 + 0.74 * hash2(w.id, n);
    const hy = 0.13 + 0.74 * hash2(w.id + 19.1, n * 1.7 + 5);
    const drift = curl(hx * 2.2, hy * 2.2, t * 0.3, 1);
    live.push({ x: (hx + drift.x * 0.05) * W, y: (hy + drift.y * 0.05) * H, r });
  }
  return live;
}

/**
 * How much of a lobe survives the windows under it — 1 well clear of them, 0 over the middle of one.
 *
 * The lobe's own radius is most of the reach, and it has to be: a cloud whose *centre* is a whole
 * radius away still covers the window completely, so attenuating only the ones sitting on top of it
 * opens nothing at all. It is capped against the window's own size, or the largest masses in the
 * frame would be thinned by windows they are nowhere near.
 */
function clearance(wins, x, y, R) {
  let a = 1;
  for (let i = 0; i < wins.length; i += 1) {
    const w = wins[i];
    const reach = w.r + Math.min(R, w.r * 3.2) * 1.02;
    a *= smoothstep(reach * 0.24, reach, Math.hypot(x - w.x, y - w.y));
    if (a < 0.004) return 0;
  }
  return a;
}

/* ----------------------------------------------------------------- draw ---- */

export function drawFog(ctx, W, H, t, fog) {
  const S = Math.min(W, H);
  const wins = openWindows(fog, t, W, H);

  wash(ctx, W, H, t);
  curtain(ctx, W, H, S, t, fog, wins);
  // The apparition goes in *early* — under the billows, the crests, the filaments and the dark
  // strands, all of which then pass in front of it. Drawn late it was a sprite on the weather;
  // drawn here it is a thing happening some way down inside a bank of it. It is also dimmed by
  // however thick the fog is directly above it, which is the other half of the same idea.
  drawApparition(ctx, W, H, t, (x, y) => cloudDensity(x, y, S, t));
  billows(ctx, W, H, S, t, fog, wins);
  wisps(ctx, W, H, S, t, fog, wins);
  erosion(ctx, W, H, S, t, fog, wins);
  vignette(ctx, W, H, VOID, 0.34);
}

/**
 * Aerial perspective: the air between the camera and the ground, which is there whether or not
 * there is a cloud in the way. This is the only layer that covers the whole frame unconditionally,
 * and it is why a peek-a-boo arrives as a hazy glimpse rather than as a window cut in a sheet.
 */
function wash(ctx, W, H, t) {
  const g = ctx.createLinearGradient(0, 0, W * 0.22, H);
  const swing = 0.5 + 0.5 * Math.sin(t * 0.043);
  // The wash breathes, but only a little: it is the one layer that moves the *whole* frame at once.
  g.addColorStop(0, `rgba(116, 122, 126, ${(0.33 + swing * 0.05).toFixed(4)})`);
  g.addColorStop(0.55, `rgba(96, 102, 107, ${(0.29 + swing * 0.04).toFixed(4)})`);
  g.addColorStop(1, `rgba(74, 80, 85, ${(0.35 - swing * 0.04).toFixed(4)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * The lattice that guarantees the coverage.
 *
 * Cell size comes off the frame *diagonal*, not off its smaller side, which is what keeps the lobe
 * count near ninety at every shape of viewport — off `min(W, H)` a wide short frame needs three
 * times as many, and a phone twice as many again.
 *
 * The lattice scrolls sideways as one body, and each cell keeps its identity as it goes: the column
 * index is offset by however many whole cells have passed, so a cell that wraps off the right edge
 * is the same cell arriving on the left, not a new one popping into existence.
 */
function curtain(ctx, W, H, S, t, fog, wins) {
  const cell = Math.hypot(W, H) * 0.058;
  const shift = (windAt(t) * S * WIND) / cell;
  const base = Math.floor(shift);
  const frac = shift - base;
  // Three cells of margin on every side. A lobe reaches almost two cells past its own centre and
  // can be displaced by another one, so anything closer in and the *outermost* column — whose
  // identity changes every time the lattice scrolls a whole cell — is still poking into frame when
  // it does, and pops. It is off screen and costs nothing, and the guarantee is worth the columns.
  const margin = 3;
  const cols = Math.ceil(W / cell) + margin * 2;
  const rows = Math.ceil(H / cell) + margin * 2;

  for (let row = -margin; row < rows; row += 1) {
    // Rows slide at their own rate. Overhead there is no parallax to sell depth, so this shear is
    // the only cue that says "a thick volume turning over" rather than "a texture scrolling".
    const shear = Math.sin(row * 1.71 + t * 0.11) * cell * 0.36;
    for (let col = -margin; col < cols; col += 1) {
      const id = col - base;
      const r1 = cellRand(id, row, fog.salt, 1);
      const r2 = cellRand(id, row, fog.salt, 2);
      const r3 = cellRand(id, row, fog.salt, 3);
      const r4 = cellRand(id, row, fog.salt, 4);
      const r5 = cellRand(id, row, fog.salt, 5);

      let x = (col - 1 + frac) * cell + (r1 - 0.5) * cell * 0.52 + shear;
      let y = (row - 1) * cell + (r2 - 0.5) * cell * 0.52;

      // A coherent wander on top, from the divergence-free flow. Bounded to under half a cell, so
      // neighbours breathe and shear against each other without the lattice ever tearing open.
      const v = curl(x / S, y / S, t * 0.55, 2.4);
      x += v.x * cell * 0.44;
      y += v.y * cell * 0.44;

      // Tone comes from a slow, large-scale field, not from this cell's own hash. Per-cell tone is
      // salt and pepper: every value appears everywhere, they average out, and the fog has no
      // weather in it. Sampled at a wavelength of several cells, the same six tones become banks —
      // a near-black mass here, a pale one drifting over there.
      // Continuously, not by index. Picking `CURTAIN[floor(...)]` off a field that drifts is what
      // made clumps of fog snap: every lobe steps from one grey to the next in a single frame, forty
      // levels at a time, dozens of times a second across the frame.
      const bank = bankAt(x, y, S, t);
      const tone = rampAt(CURTAIN, (bank * 1.9 - 0.42 + r1 * 0.2) * (CURTAIN.length - 1));

      // Never to zero. This deck is the coverage; it breathes, it does not blink.
      const breath = 0.86 + 0.14 * Math.cos(wrap01((t + r3 * 19) / 19) * TAU);

      // Stretched along the way it is actually going, and more so the faster it goes. This is the
      // cheapest honest fluid cue there is: air being dragged past air elongates along the flow,
      // and because the total velocity is the gusting wind *plus* the local curl, a lobe sitting in
      // a slack eddy stays round while one in the stream draws out — which is what makes a gust
      // read as a gust rather than as everything sliding faster.
      const vx = gustAt(t) * WIND * S + v.x * S * 0.05;
      const vy = v.y * S * 0.05;
      const speed = Math.hypot(vx, vy) / (S * WIND);
      const drag = clamp(speed * 0.42, 0, 1.1);

      const major = cell * (1.56 + r4 * 0.42) * (0.94 + 0.16 * Math.sin(t * 0.19 + r5 * 9)) * (1 + drag * 0.45);
      const minor = major * (0.58 + r5 * 0.28) / (1 + drag * 0.5);

      const alpha = (0.82 + r3 * 0.18) * breath * clearance(wins, x, y, major);
      if (alpha < 0.01) continue;

      lobe(
        ctx,
        x,
        y,
        major,
        minor,
        Math.atan2(vy, vx),
        tone,
        clamp(alpha, 0, 1),
        0.18,
        0.38,
        // Each cell's outline turns over on its own clock, at its own rate. One shared rate and the
        // whole lattice writhes in step, which reads as a single surface rippling.
        r4 * 12 + t * (0.5 + r2 * 0.7),
      );
    }
  }
}

/**
 * The mass, and the light on it.
 *
 * Each billow is three lobes clustered tight enough to merge, and the lit ones are drawn a second
 * time — same cluster, shrunk slightly and shifted toward the key light, additively. Additive is
 * not decoration: a near-white lobe composited normally over grey lands at grey plus a bit, and the
 * top of the ramp is simply never reached. `lighter` climbs to white and stays there.
 */
function billows(ctx, W, H, S, t, fog, wins) {
  const lit = [];

  for (const b of fog.billows) {
    const live = incarnate(b, t, W, H);
    if (live.swell < 0.02) continue;

    const drift = curl(live.x / S, live.y / S, t * 0.4, 1.6);
    const x = live.x + drift.x * S * 0.13 * live.u + carried(live, t, S);
    const y = live.y + drift.y * S * 0.13 * live.u;
    const vx = gustAt(t) * WIND * S + drift.x * S * 0.06;
    const vy = drift.y * S * 0.06;
    const drag = clamp((Math.hypot(vx, vy) / (S * WIND)) * 0.4, 0, 1.1);
    // Always expanding, whatever the opacity is doing — that is what makes a mass *dissolve* into
    // the fog around it rather than shrink back to the point it grew from — and stretched along the
    // way it is actually going, more so the faster it goes.
    const major = S * b.size * live.spread * (1 + drag * 0.4);
    const minor = (major * b.squash) / (1 + drag * 0.45);
    const angle = Math.atan2(vy, vx);
    const alpha = b.alpha * live.swell * clearance(wins, x, y, major);
    if (alpha < 0.008) continue;

    const phase = b.id + live.n * 3.1 + t * 0.42 * live.unrest;
    cluster(ctx, x, y, major, minor, angle, b.id + live.n, BODY[b.tone], alpha, 0.2, phase);
    const top = 0.12 + 0.88 * smoothstep(0.38, 0.72, bankAt(x, y, S, t));
    if (b.lit) lit.push({ b, x, y, major, minor, angle, live, phase, top });
  }

  if (!lit.length) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const { b, x, y, major, minor, angle, live, phase, top } of lit) {
    const offset = S * 0.016 * (0.5 + live.swell);
    cluster(
      ctx,
      x + KEY_X * offset,
      y + KEY_Y * offset,
      major * 1.06,
      minor * 1.02,
      angle,
      b.id + live.n + 0.5,
      CREST[b.crestTone],
      b.crestAlpha * live.swell * top * clearance(wins, x, y, major),
      0.16,
      phase + 1.7,
    );
  }
  ctx.restore();
}

/**
 * Three lobes around a centre, close enough that their tails overlap.
 *
 * Spacing is the whole trick and it is not the obvious number: at a radius apart the lobes read as
 * separate blobs, and only at about a third of a radius do they merge into one lumpy mass with a
 * silhouette no single ellipse could have.
 */
function cluster(ctx, x, y, major, minor, angle, seed, colour, alpha, core, phase) {
  for (let i = 0; i < 4; i += 1) {
    const a = hash2(seed + i * 3.1, i) * TAU;
    const d = (0.24 + hash2(seed + i * 5.7, i + 2) * 0.4) * major;
    const scale = 0.48 + hash2(seed + i * 2.9, i + 4) * 0.56;
    lobe(
      ctx,
      x + Math.cos(a) * d,
      y + Math.sin(a) * d * 0.7,
      major * scale,
      minor * scale,
      angle + (hash2(seed + i * 7.3, i + 6) - 0.5) * 0.9,
      colour,
      alpha,
      core,
      0.4,
      // Every lobe of a mass turns over at a different rate, so the mass churns internally instead
      // of deforming as one rigid object.
      phase * (0.7 + i * 0.22) + i * 2.3,
    );
  }
}

/**
 * The fine frequency: filaments stretched along the wind, bright, and barely there.
 *
 * These are the layer that carries "dissolving and changing into each other". A filament is born as
 * a short soft puff and *draws out* along the flow as it ages — the major axis running away with
 * the life while the minor barely moves — so it stretches into a thread and thins to nothing while
 * the next one is already welling up through where it was.
 */
function wisps(ctx, W, H, S, t, fog, wins) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const w of fog.wisps) {
    const live = incarnate(w, t, W, H);
    if (live.swell < 0.04) continue;

    const drift = curl(live.x / S, live.y / S, t * 0.6, 2.9);
    const x = live.x + drift.x * S * 0.2 * live.u + carried(live, t, S) * 1.25;
    const y = live.y + drift.y * S * 0.2 * live.u;
    // A filament does not just grow, it *draws out*: the major axis runs away with the life while
    // the minor one barely moves, so a soft puff becomes a long thread and then nothing. Watching
    // one is the clearest read in the scene of fog changing rather than fog moving.
    // Drawing out is a change in *aspect*, and it has to be bounded. Letting the major axis run
    // while the minor one stands still gives ratios past fifty to one by the end of a life, and a
    // fifty-to-one ellipse is not a filament, it is a scratch on the lens.
    const vx = gustAt(t) * WIND * S * 1.25 + drift.x * S * 0.1;
    const vy = drift.y * S * 0.1;
    const drag = clamp((Math.hypot(vx, vy) / (S * WIND)) * 0.34, 0, 1.2);
    const major = S * w.size * live.spread * (0.75 + 0.55 * live.u) * (1 + drag * 0.38);
    const minor = (major * w.squash * (1.15 - 0.45 * live.u)) / (1 + drag * 0.38);
    const alpha =
      w.alpha * live.swell * smoothstep(0.3, 0.66, bankAt(x, y, S, t)) * clearance(wins, x, y, major);
    if (alpha < 0.006) continue;

    lobe(
      ctx,
      x,
      y,
      major,
      minor,
      // Along the direction it is actually travelling — a filament at right angles to the way the
      // air is going reads instantly as a mistake.
      Math.atan2(vy, vx),
      CREST[w.tone],
      alpha,
      0.06,
      0.46,
      w.id + live.n * 2.7 + t * 0.7 * live.unrest,
    );
  }
  ctx.restore();
}

/** Near-black strands drawn over the light, so the crests come apart instead of staying smooth. */
function erosion(ctx, W, H, S, t, fog, wins) {
  for (const s of fog.streaks) {
    const live = incarnate(s, t, W, H);
    if (live.swell < 0.04) continue;

    const drift = curl(live.x / S, live.y / S, t * 0.5, 2.3);
    const x = live.x + drift.x * S * 0.17 * live.u + carried(live, t, S) * 1.1;
    const y = live.y + drift.y * S * 0.17 * live.u;
    const major = S * s.size * live.spread * (0.8 + 0.5 * live.u);
    // The mirror of the crest gate. Between them, a pale bank gets both the brightest and the
    // darkest values in the frame — which is what fog actually does, and what gives a single frame
    // the whole range rather than making the range something you only see over a minute.
    const alpha =
      s.alpha * live.swell * (0.25 + 0.75 * smoothstep(0.34, 0.68, bankAt(x, y, S, t)))
      * clearance(wins, x, y, major);
    if (alpha < 0.006) continue;

    lobe(
      ctx,
      x,
      y,
      major,
      major * s.squash * (1.15 - 0.4 * live.u),
      Math.atan2(drift.y * S * 0.08, gustAt(t) * WIND * S * 1.1 + drift.x * S * 0.08),
      [VOID, COAL, PITCH][s.tone],
      alpha,
      0.16,
      0.44,
      s.id + live.n * 4.1 + t * 0.6 * live.unrest,
    );
  }
}

/** Exported for the tests: the open-window area at a moment, as a fraction of the frame. */
export function windowCoverage(fog, t, W, H) {
  return openWindows(fog, t, W, H).reduce((sum, w) => sum + Math.PI * w.r * w.r, 0) / (W * H);
}

