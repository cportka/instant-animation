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

import { hash2 } from '../../effects/field.js';
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

  // Never under the moon's path, where it would be invisible, and never at the horizon, where it
  // would be at the surface. Both are hashed off `n`, so each one turns up somewhere new.
  const at = 0.12 + hash2(n * 1.9 + plan.seed, 5) * 0.76;
  const down = 0.35 + hash2(n * 2.7 + plan.seed, 11) * 0.5;
  return {
    x: at * W,
    y: horizonY + down * (H - horizonY),
    // Wide and shallow. A round glow is a ball of light at a known distance; a flattened one is
    // light coming *up through* something, spread by the water it has crossed.
    rx: Math.min(W, H) * (0.16 + hash2(n * 3.3 + plan.seed, 13) * 0.14),
    ry: Math.min(W, H) * (0.05 + hash2(n * 4.1 + plan.seed, 17) * 0.045),
    amp: clamp(amp, 0, 1) * (0.55 + hash2(n * 5.9 + plan.seed, 19) * 0.45),
    // It breathes while it is up, on its own clock, so it is never quite still.
    pulse: 0.82 + 0.18 * Math.sin(t * 1.15 + n),
  };
}

/** How much of the glow reaches this point, 0 to 1. */
export function glowAt(deep, x, y) {
  if (!deep) return 0;
  const dx = (x - deep.x) / deep.rx;
  const dy = (y - deep.y) / deep.ry;
  const d = dx * dx + dy * dy;
  if (d > 1) return 0;
  // Squared falloff, so the bright core is small and most of the ellipse is a long dim shoulder.
  // At a gentler exponent nearly the whole thing crossed the threshold onto the green ramp at once
  // and the result was a solid disc lying on the water like a dropped coin.
  return (1 - d) ** 2.6 * deep.amp * deep.pulse;
}
