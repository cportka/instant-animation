// The fog: ninety-five percent of this picture, and the only thing in it that moves.
//
// The brief asks for three things that pull against each other, and the whole structure of this
// file is the arrangement that gets all three at once:
//
//   *coverage* — the ground below is almost never visible, and where it is, it is a gap a few
//   hundred pixels across for a second or two;
//   *range* — the fog runs from near-black to near-white, not a field of mid-grey;
//   *failure* — clouds glitch out of existence and back, like a decoder losing them.
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

import { TAU, clamp, smoothstep, wrap01 } from '../../lib/draw.js';
import { curl, fbm, flowAngle, hash2 } from '../../effects/field.js';
import { lobe, vignette } from '../../effects/volume.js';
import { blockRepeat, chromaSplit, damageAt, makeRepeatCells, makeShredZones, shred, smearStreaks } from '../../effects/vhs.js';

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
  const wisps = Array.from({ length: 44 }, (_, i) => ({
    id: i * 5.13 + salt * 1.7,
    life: rng.range(6, 14),
    phase: rng.next(),
    tone: Math.floor(rng.range(0, CREST.length)),
    alpha: rng.range(0.035, 0.09),
    size: rng.range(0.06, 0.16),
    squash: rng.range(0.2, 0.4),
  }));

  // Erosion: the same shape in near-black, drawn last over the light, so the crests come apart into
  // strands instead of sitting there as smooth blobs. Fog is as dark as it is bright.
  const streaks = Array.from({ length: 26 }, (_, i) => ({
    id: i * 7.31 + salt * 2.3,
    life: rng.range(7, 16),
    phase: rng.next(),
    tone: Math.floor(rng.range(0, 3)),
    alpha: rng.range(0.08, 0.18),
    size: rng.range(0.055, 0.14),
    squash: rng.range(0.2, 0.42),
  }));

  // The peek-a-boos. Evenly spread around one shared period; only the duty cycle varies, which
  // breaks the rhythm without ever letting two of them line up.
  const windows = Array.from({ length: 7 }, (_, i) => ({
    id: i * 17.33 + salt * 3.1,
    phase: i / 7 + rng.range(-0.018, 0.018),
    duty: rng.range(0.29, 0.38),
  }));

  return { salt, billows, wisps, streaks, windows, zones: makeShredZones(rng, 3), peek: makeRepeatCells(rng, 1) };
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

/** A value that holds still for a beat and then jumps, for anything that should stutter. */
const judder = (t, rate) => Math.floor(t * rate) / rate;

/**
 * How broken the fog is right now, 0..1.
 *
 * Borrowed wholesale from the tape scene's damage schedule, which was built to arrive in bursts and
 * silences rather than on a beat, and is tested for exactly that. A fog bank that glitched every
 * four seconds would be a metronome with clouds on it.
 */
const glitchAt = (t) => clamp(damageAt(t * 0.62, 19.4) / 20, 0, 1);

/**
 * One incarnation of a recycled element: which life it is on, how far through, and where that life
 * put it. Stateless — ask at any `t`, in any order, and get the same answer, which is what lets the
 * render tests sample time backwards.
 */
function incarnate(element, t, W, H) {
  const cycles = (t + element.phase * element.life) / element.life;
  const n = Math.floor(cycles);
  const u = cycles - n;
  // A fresh home for every life. Spread wider than the frame so births and deaths happen off the
  // edges as often as not.
  const x = (hash2(element.id, n) * 1.44 - 0.22) * W;
  const y = (hash2(element.id + 41.7, n * 1.31 + 3) * 1.44 - 0.22) * H;
  // Zero at both ends: nothing ever pops into or out of existence except when it is meant to.
  return { u, n, x, y, swell: Math.sin(u * Math.PI) ** 0.62 };
}

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
    const r = S * (0.035 + 0.03 * hash2(w.id + 7.3, n)) * open;
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
    const reach = w.r + Math.min(R, w.r * 2.6) * 0.9;
    a *= smoothstep(reach * 0.24, reach, Math.hypot(x - w.x, y - w.y));
    if (a < 0.004) return 0;
  }
  return a;
}

/* ----------------------------------------------------------------- draw ---- */

export function drawFog(ctx, W, H, t, fog, tape = null) {
  const S = Math.min(W, H);
  const g = glitchAt(t);
  const wins = openWindows(fog, t, W, H);

  // The layer the datamosh prints from: the ground before any fog reached it. Only worth the blit
  // when something is actually about to go wrong.
  if (g > 0.06) tape?.capture(ctx, 'clear');

  wash(ctx, W, H, t);
  curtain(ctx, W, H, S, t, fog, wins, g);
  billows(ctx, W, H, S, t, fog, wins, g);
  wisps(ctx, W, H, S, t, fog, wins, g);
  erosion(ctx, W, H, S, t, fog, wins, g);
  if (g > 0.06) mosh(ctx, W, H, t, fog, g, tape);
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
  g.addColorStop(0, `rgba(116, 122, 126, ${(0.34 + swing * 0.05).toFixed(4)})`);
  g.addColorStop(0.55, `rgba(96, 102, 107, ${(0.30 + swing * 0.04).toFixed(4)})`);
  g.addColorStop(1, `rgba(74, 80, 85, ${(0.36 - swing * 0.04).toFixed(4)})`);
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
function curtain(ctx, W, H, S, t, fog, wins, damage) {
  const cell = Math.hypot(W, H) * 0.058;
  const shift = (t * S * 0.021) / cell;
  const base = Math.floor(shift);
  const frac = shift - base;
  const cols = Math.ceil(W / cell) + 3;
  const rows = Math.ceil(H / cell) + 3;
  const stutter = damage > 0.25 ? judder(t, 11) : t;

  for (let row = -1; row < rows; row += 1) {
    // Rows slide at their own rate. Overhead there is no parallax to sell depth, so this shear is
    // the only cue that says "a thick volume turning over" rather than "a texture scrolling".
    const shear = Math.sin(row * 1.71 + t * 0.11) * cell * 0.36;
    for (let col = -1; col < cols; col += 1) {
      const id = col - base;
      const r1 = cellRand(id, row, fog.salt, 1);
      const r2 = cellRand(id, row, fog.salt, 2);
      const r3 = cellRand(id, row, fog.salt, 3);
      const r4 = cellRand(id, row, fog.salt, 4);
      const r5 = cellRand(id, row, fog.salt, 5);

      // Clouds coming apart into shifted blocks: whole bands of the lattice jump sideways at once.
      const band = Math.floor(row / 2);
      const mosh = damage > 0.3
        ? (hash2(band * 13.7, judder(t, 9)) - 0.5) * cell * 2.6 * damage
        : 0;

      let x = (col - 1 + frac) * cell + (r1 - 0.5) * cell * 0.52 + shear + mosh;
      let y = (row - 1) * cell + (r2 - 0.5) * cell * 0.52;

      // A coherent wander on top, from the divergence-free flow. Bounded to a third of a cell, so
      // neighbours breathe and shear against each other without the lattice ever tearing open.
      const v = curl(x / S, y / S, stutter * 0.55, 2.4);
      x += v.x * cell * 0.34;
      y += v.y * cell * 0.34;

      // Tone comes from a slow, large-scale field, not from this cell's own hash. Per-cell tone is
      // salt and pepper: every value appears everywhere, they average out, and the fog has no
      // weather in it. Sampled at a wavelength of several cells, the same six tones become banks —
      // a near-black mass here, a pale one drifting over there.
      const bank = bankAt(x, y, S, t);
      const tone = clamp(Math.floor((bank * 1.9 - 0.42 + r1 * 0.2) * CURTAIN.length), 0, CURTAIN.length - 1);

      // Never to zero. This deck is the coverage; it breathes, it does not blink.
      const breath = 0.86 + 0.14 * Math.cos(wrap01((t + r3 * 19) / 19) * TAU);
      const major = cell * (1.3 + r4 * 0.38) * (0.94 + 0.16 * Math.sin(t * 0.19 + r5 * 9));
      const minor = major * (0.58 + r5 * 0.28);

      let alpha = (0.78 + r3 * 0.22) * breath * clearance(wins, x, y, major);
      if (alpha < 0.01) continue;

      // In and out of existence, one cloud at a time — its neighbours hold, which is what makes it
      // read as the picture failing rather than as the fog thinning.
      //
      // A glitched cloud mostly **jumps** rather than disappearing, and that is the whole design of
      // this pass. Simply dropping a fraction of the lattice during a burst opens the fog, and an
      // opening in the fog is a view of the town — so the glitch stops being a fault in the picture
      // and becomes the one moment the picture is on show, which is the opposite of the brief.
      // Displaced, the same lobe is somewhere wrong instead of nowhere: the coverage survives and
      // the failure is louder, not quieter. Only a twelfth actually go.
      let jumpX = 0;
      let jumpY = 0;
      if (damage > 0.12) {
        const roll = hash2(id * 2.3 + row * 7.7, judder(t, 13));
        if (roll < damage * 0.12) continue;
        if (roll < damage * 0.6) {
          jumpX = (hash2(id * 5.1, judder(t, 13) + 2) - 0.5) * cell * 3.4 * damage;
          jumpY = (hash2(row * 8.9, judder(t, 13) + 4) - 0.5) * cell * 1.6 * damage;
        }
      }
      if (damage > 0.5) alpha *= 1.12;

      lobe(
        ctx,
        x + jumpX,
        y + jumpY,
        major,
        minor,
        flowAngle(x / S, y / S, stutter * 0.4, 2.4),
        CURTAIN[tone],
        clamp(alpha, 0, 1),
        0.18,
        0.38,
        r4 * 12 + t * 0.42,
        damage > 0.34 ? 3 + Math.floor(r2 * 3) : 0,
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
function billows(ctx, W, H, S, t, fog, wins, damage) {
  const lit = [];

  for (const b of fog.billows) {
    const live = incarnate(b, t, W, H);
    if (live.swell < 0.02) continue;
    if (damage > 0.15 && hash2(b.id * 1.9, judder(t, 10)) < damage * 0.22) continue;

    const drift = curl(live.x / S, live.y / S, t * 0.4, 1.6);
    // Carried by the same wind the lattice runs in, but centred on its home: a life begins half a
    // travel upwind and ends half a travel downwind, rather than always setting off to the right of
    // where it was born and leaving the left of the frame short.
    const travel = S * 0.021 * b.life;
    const x = live.x + drift.x * S * 0.13 * live.u + travel * (live.u - 0.5);
    const y = live.y + drift.y * S * 0.13 * live.u;
    const major = S * b.size * (0.58 + 0.62 * live.swell);
    const minor = major * b.squash;
    const angle = flowAngle(x / S, y / S, t * 0.3, 1.6);
    const alpha = b.alpha * live.swell * clearance(wins, x, y, major);
    if (alpha < 0.008) continue;

    const facet = damage > 0.4 ? 3 + Math.floor(hash2(b.id, live.n) * 3) : 0;
    const phase = b.id + live.n * 3.1 + t * 0.5;
    cluster(ctx, x, y, major, minor, angle, b.id + live.n, BODY[b.tone], alpha, 0.2, phase, facet);
    const top = 0.12 + 0.88 * smoothstep(0.38, 0.72, bankAt(x, y, S, t));
    if (b.lit) lit.push({ b, x, y, major, minor, angle, live, phase, facet, top });
  }

  if (!lit.length) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const { b, x, y, major, minor, angle, live, phase, facet, top } of lit) {
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
      facet,
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
function cluster(ctx, x, y, major, minor, angle, seed, colour, alpha, core, phase, facet) {
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
      phase + i * 2.3,
      facet,
    );
  }
}

/** The fine frequency: filaments stretched along the wind, bright, and barely there. */
function wisps(ctx, W, H, S, t, fog, wins, damage) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const w of fog.wisps) {
    const live = incarnate(w, t, W, H);
    if (live.swell < 0.04) continue;
    if (damage > 0.2 && hash2(w.id * 2.7, judder(t, 15)) < damage * 0.4) continue;

    const drift = curl(live.x / S, live.y / S, t * 0.6, 2.9);
    const travel = S * 0.028 * w.life;
    const x = live.x + drift.x * S * 0.2 * live.u + travel * (live.u - 0.5);
    const y = live.y + drift.y * S * 0.2 * live.u;
    const major = S * w.size * (0.5 + 0.7 * live.swell);
    const alpha =
      w.alpha * live.swell * smoothstep(0.3, 0.66, bankAt(x, y, S, t)) * clearance(wins, x, y, major);
    if (alpha < 0.006) continue;

    lobe(
      ctx,
      x,
      y,
      major,
      major * w.squash,
      // Aligned to the flow, so the filaments lie along the wind rather than across it — a wisp at
      // right angles to the direction everything else is travelling reads instantly as a mistake.
      flowAngle(x / S, y / S, t * 0.5, 2.9),
      CREST[w.tone],
      alpha,
      0.06,
      0.44,
      w.id + live.n * 2.7 + t * 0.8,
      damage > 0.45 ? 2 + Math.floor(hash2(w.id, live.n) * 3) : 0,
    );
  }
  ctx.restore();
}

/** Near-black strands drawn over the light, so the crests come apart instead of staying smooth. */
function erosion(ctx, W, H, S, t, fog, wins, damage) {
  for (const s of fog.streaks) {
    const live = incarnate(s, t, W, H);
    if (live.swell < 0.04) continue;
    if (damage > 0.25 && hash2(s.id * 3.3, judder(t, 12)) < damage * 0.28) continue;

    const drift = curl(live.x / S, live.y / S, t * 0.5, 2.3);
    const travel = S * 0.021 * s.life;
    const x = live.x + drift.x * S * 0.17 * live.u + travel * (live.u - 0.5);
    const y = live.y + drift.y * S * 0.17 * live.u;
    const major = S * s.size * (0.55 + 0.6 * live.swell);
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
      major * s.squash,
      flowAngle(x / S, y / S, t * 0.44, 2.3),
      [VOID, COAL, PITCH][s.tone],
      alpha,
      0.16,
      0.42,
      s.id + live.n * 4.1 + t * 0.7,
      damage > 0.45 ? 2 + Math.floor(hash2(s.id, live.n) * 3) : 0,
    );
  }
}

/**
 * The data mosh proper, once the fog itself is down.
 *
 * The lobes above glitch by being *drawn* wrong — dropped, banded, shoved. This is the other half:
 * the finished frame torn up as an image. Some of the stuck blocks print from the layer captured
 * before the fog went on, so a strip of bare town repeats across the frame — a peek-a-boo that
 * arrives as a decoding failure rather than as a gap in the weather, which is exactly the thing the
 * brief asks for and the one effect the fog itself cannot produce.
 */
function mosh(ctx, W, H, t, fog, damage, tape) {
  if (!tape) return;
  tape.capture(ctx);
  // Displacement, not replacement. The stuck-macroblock artefact was built for a picture full of
  // high-frequency detail: tiling one block of *that* prints an obvious repeat. Fog has no detail
  // to repeat, so the same effect here tiles a smooth patch into a flat grey rectangle and reads as
  // a rectangle somebody drew. Shredding keeps the picture and breaks it, which on a soft image is
  // the only one of the two that survives.
  shred(ctx, W, H, t, fog.zones, 0.4 + damage * 2.2, tape);
  smearStreaks(ctx, W, H, t, 4, damage * 0.5, tape);
  // The one thing allowed to print from before the fog: a single stuck cell, so a strip of bare
  // town repeats across the frame. A handful of tiles is a decode failure; a screenful is the
  // picture with the weather switched off.
  if (damage > 0.5) blockRepeat(ctx, W, H, t, fog.peek, (damage - 0.5) * 0.9, tape, 'clear');
  // The only colour in the frame, and only at the worst of it. In a picture with no saturation
  // anywhere, a chroma break is the loudest possible way to say that something is broken.
  if (damage > 0.45) chromaSplit(ctx, W, H, t, (damage - 0.45) * 9, tape);
}

/** Exported for the tests: the open-window area at a moment, as a fraction of the frame. */
export function windowCoverage(fog, t, W, H) {
  return openWindows(fog, t, W, H).reduce((sum, w) => sum + Math.PI * w.r * w.r, 0) / (W * H);
}

export { glitchAt };
