// Whatever is down there.
//
// "A faint glow occasionally comes from deep below the water." Three words in that are load-bearing
// and each one is a decision the drawing has to make.
//
// **Faint** — it never comes near the moon. The moon owns the top of every ramp in this scene and
// nothing else is allowed up there, so the glow works at the *bottom*: it lifts water that was
// almost black to water that is merely dark, and it is the only hue in the picture, which is how
// something dim still stops you.
//
// **Occasionally** — on the gallery's epoch pattern. `n` is which one it is, where and how big are
// hashed off `n`, and it is silent for most of a round. About one every fifty seconds, up and gone
// in fifteen. Rare enough that a viewer who has settled into the swell gets interrupted, which is
// the whole point of it; and computable at any `t` in any order, with nothing stored, which is what
// the render tests require.
//
// **Deep** — it is *under* the surface, so it must not behave like a light on it. Two things sell
// that. It never reaches the horizon, because distance underwater is depth: the far water is a thin
// band and anything showing through it would be at the surface. And the swell rides over the top of
// it — the glow tints the water and the waves keep moving across it, unlit, so the light is clearly
// behind them.

import { hash2, noise2 } from '../../effects/field.js';
import { clamp } from '../../lib/draw.js';

const PERIOD = 51;
/** Up, held, and gone. Long enough to notice, short enough that you are not sure you did. */
const RISE = 4.5;
const HOLD = 5;
const FADE = 6;

export function planDeep(rng) {
  return { seed: rng.range(0, 40), phase: rng.next() };
}

/**
 * The patchiness, tabulated.
 *
 * `glowAt` is asked about tens of thousands of chunks a frame and the patch field it wants is *very*
 * smooth — a handful of noise lattice cells across the whole bloom. Sampling it per chunk is asking
 * for four hashed sines to answer a question whose answer barely changed since the chunk before, and
 * it cost a millisecond and a half of a twenty-millisecond budget. Two hundred and eighty-eight
 * samples over the ellipse, read back bilinearly, is the same field for a fortieth of the work.
 *
 * The buffer is module-level and rebuilt in full on every `deepAt`, so nothing survives a frame and
 * the render tests can still walk `t` out of order.
 */
const PATCH_W = 24;
const PATCH_H = 12;
const PATCH = new Float32Array(PATCH_W * PATCH_H);

function fillPatch(seed, drift) {
  for (let j = 0; j < PATCH_H; j += 1) {
    const ny = ((j / (PATCH_H - 1)) * 2 - 1) * 2.3 + drift;
    for (let i = 0; i < PATCH_W; i += 1) {
      PATCH[j * PATCH_W + i] = 0.5 + noise2(((i / (PATCH_W - 1)) * 2 - 1) * 2.3 + seed, ny) * 0.72;
    }
  }
}

/**
 * How strong the glow is right now, and where.
 *
 * Returned as a small object rather than sampled per chunk, because everything about it except the
 * falloff is constant across a frame — the water asks for this once and then only does arithmetic.
 */
export function deepAt(W, H, t, plan, horizonY) {
  const cycles = t / PERIOD + plan.phase;
  const n = Math.floor(cycles);
  const age = (cycles - n) * PERIOD;
  const span = RISE + HOLD + FADE;
  if (age > span) return null;

  // Up on a curve and down on a slower one: something surfacing has a different shape from something
  // sinking, and a symmetrical envelope reads as a lamp on a dimmer.
  const amp = age < RISE
    ? (age / RISE) ** 1.7
    : age < RISE + HOLD
      ? 1
      : 1 - ((age - RISE - HOLD) / FADE) ** 0.7;

  // Never at the horizon, where it would be at the surface. Hashed off `n`, so each one turns up
  // somewhere new.
  const band = H - horizonY;
  const at = 0.12 + hash2(n * 1.9 + plan.seed, 5) * 0.76;
  const down = 0.42 + hash2(n * 2.7 + plan.seed, 11) * 0.46;
  const y = horizonY + down * band;
  // Wide and shallow, and **big** — a good fraction of the whole sea. Something small is an object
  // at a known distance, and an object under water is a lamp somebody dropped. Something the size of
  // the bay has no scale you can pin down, which is the entire difference between a light source and
  // whatever this is. A round glow would give the game away too; flattening it is what says the light
  // has crossed a lot of water on the way up.
  const rx = W * (0.26 + hash2(n * 3.3 + plan.seed, 13) * 0.22);
  const ry = band * (0.3 + hash2(n * 4.1 + plan.seed, 17) * 0.2);
  // Where the patchiness has drifted to. Baked into the table here rather than sampled from `t`
  // inside the falloff, so `glowAt` stays a function of position alone.
  fillPatch(plan.seed + n * 3.7, t * 0.045);
  return {
    x: at * W,
    y,
    rx,
    // ...but never through the horizon, whatever the frame's shape. The far water is a thin band and
    // anything showing in it would be at the surface — so the reach up-frame is capped by how much
    // sea there actually is above the centre, rather than trusted to a constant that happens to work
    // at one aspect ratio.
    ry: Math.min(ry, (y - horizonY) * 0.94),
    amp: clamp(amp, 0, 1) * (0.3 + hash2(n * 5.9 + plan.seed, 19) * 0.24),
    // It breathes while it is up, on its own clock, so it is never quite still.
    pulse: 0.82 + 0.18 * Math.sin(t * 0.62 + n),
  };
}

/** How much of the glow reaches this point, 0 to 1. */
export function glowAt(deep, x, y) {
  if (!deep) return 0;
  const dx = (x - deep.x) / deep.rx;
  const dy = (y - deep.y) / deep.ry;
  const d = dx * dx + dy * dy;
  if (d > 1) return 0;
  // Patchy, and slowly moving. An ellipse with a smooth falloff has one very hard tell: the coverage
  // it hands the dither is *constant* across large areas, and an ordered dither at a constant
  // fraction is not a texture, it is a halftone screen — a regular grid of dots you can see the
  // ruling of. Breaking the strength up with a drifting noise field is the fix, and it is also just
  // true of the thing being drawn: whatever is down there is not a uniform lamp with a lens on it.
  const pu = (dx + 1) * 0.5 * (PATCH_W - 1);
  const pv = (dy + 1) * 0.5 * (PATCH_H - 1);
  const i0 = pu | 0;
  const j0 = pv | 0;
  const i1 = i0 + 1 < PATCH_W ? i0 + 1 : i0;
  const j1 = j0 + 1 < PATCH_H ? j0 + 1 : j0;
  const fu = pu - i0;
  const fv = pv - j0;
  const p00 = PATCH[j0 * PATCH_W + i0];
  const p10 = PATCH[j0 * PATCH_W + i1];
  const p01 = PATCH[j1 * PATCH_W + i0];
  const p11 = PATCH[j1 * PATCH_W + i1];
  const patch = (p00 + (p10 - p00) * fu) * (1 - fv) + (p01 + (p11 - p01) * fu) * fv;
  // A long shoulder. The falloff used to be steep, to keep the thing from crossing onto the green
  // ramp all at once and lying on the water like a dropped coin — but steepness was the wrong cure
  // for that, because it fixed the edge by making the whole glow small. What actually stops it being
  // a disc is `mixAt` below, which never lets the green be solid anywhere; with that in place the
  // falloff is free to be gentle, and gentle is what makes it read as *diffuse*.
  return (1 - d) ** 1.7 * deep.amp * deep.pulse * patch;
}

/**
 * What fraction of the water at a point is replaced by the glow's own ramp — never all of it.
 *
 * **This is the whole of why it reads as something under the surface.** The sea and the green are
 * mixed chunk by chunk on the ordered dither, so at the rim one chunk in twenty is green and at the
 * heart it is two in three — and never, anywhere, at any brightness, more than that. Water you can
 * see is what makes light *underwater*; the moment a region goes fully green it stops being water
 * with something beneath it and becomes a green thing floating on top.
 *
 * It also means the glow has no edge to find. There is no radius at which it stops: the coverage
 * simply runs out, the last few chunks scatter, and the dither does the fading.
 */
export const MIX_CAP = 0.52;

export function mixAt(glow, lift = 1) {
  // Starts almost at nothing and climbs slowly, so the reach is enormous, nearly all of it is a
  // scattering, and only the very heart of the thing gets anywhere near the cap.
  return clamp(((glow - 0.03) / 0.95) * lift, 0, MIX_CAP * lift);
}
