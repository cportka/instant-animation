// Smooth scalar and vector fields: the shared noise toolkit.
//
// Everything here is a **pure function of position and time**. That is not a stylistic preference,
// it is a hard requirement of this gallery: the headless render tests draw each scene at eight
// timestamps *out of order* (0, 0.016, 1.5, 6.4, 12.6, 25, 61.25, 300.5) and compare two runs
// op-for-op, and the stage clamps `dt` after a slow frame or a hidden tab. Anything that integrates
// velocity into a stored position would drift apart between the live loop, the reduced-motion
// poster frame and a resize — and the test that caught it would say "not deterministic", which
// tells you nothing about why.
//
// So: no state, no accumulation, no `dt`. Ask what the field is at (x, y) at time t and it answers.

import { TAU } from '../lib/draw.js';

/** Deterministic value noise on the integer lattice. The same hash the tape artefacts use. */
export const hash2 = (x, y) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Smoothstep on the unit interval, for interpolating between lattice points. */
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Value noise in 2D, in the range 0..1. Bilinear between four hashed lattice corners, eased on both
 * axes so the result has no visible grid — an un-eased lerp leaves diamond artefacts that read
 * immediately as "noise function" rather than as anything natural.
 */
export function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = ease(x - ix);
  const fy = ease(y - iy);

  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);

  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/**
 * Fractional Brownian motion: octaves of value noise at doubling frequency and halving amplitude.
 *
 * Three octaves is usually the right answer for something being *drawn* rather than sampled per
 * pixel — the fourth costs as much as the first three combined and, at the scale a shape gets
 * drawn at, moves its outline by less than a pixel.
 */
export function fbm(x, y, octaves = 3, gain = 0.5, lacunarity = 2) {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let fx = x;
  let fy = y;

  for (let i = 0; i < octaves; i += 1) {
    sum += noise2(fx, fy) * amplitude;
    total += amplitude;
    amplitude *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return sum / total;
}

/**
 * A divergence-free flow, from the curl of an analytic stream function.
 *
 * This is the difference between fog that *billows* and fog that slides. A field sampled straight
 * out of noise has sources and sinks in it: material piles up in some places and thins out in
 * others, and the eye reads that as things moving across each other rather than as one body of air
 * turning over. Taking the curl instead — rotating the gradient a quarter turn — gives a field that
 * conserves area, so the mass folds and shears without ever bunching.
 *
 * The stream function is three travelling sine sheets at deliberately non-harmonic wavelengths, so
 * the pattern never repeats within any length of time anyone will watch.
 *
 * @returns {{x: number, y: number}} a velocity, roughly unit-scaled
 */
export function curl(x, y, t, scale = 1) {
  const s = scale;
  // ∂ψ/∂y and −∂ψ/∂x of ψ = Σ aᵢ·sin(kᵢx + φᵢt)·cos(mᵢy + θᵢt), differentiated by hand.
  const vx =
    -0.9 * Math.sin(1.0 * x * s + t * 0.11) * Math.sin(1.3 * y * s - t * 0.07) * 1.3
    - 0.5 * Math.sin(2.3 * x * s - t * 0.17) * Math.sin(1.9 * y * s + t * 0.13) * 1.9
    - 0.3 * Math.sin(3.7 * x * s + t * 0.05) * Math.sin(4.1 * y * s - t * 0.09) * 4.1;
  const vy =
    0.9 * Math.cos(1.0 * x * s + t * 0.11) * Math.cos(1.3 * y * s - t * 0.07) * 1.0
    + 0.5 * Math.cos(2.3 * x * s - t * 0.17) * Math.cos(1.9 * y * s + t * 0.13) * 2.3
    + 0.3 * Math.cos(3.7 * x * s + t * 0.05) * Math.cos(4.1 * y * s - t * 0.09) * 3.7;

  return { x: vx * 0.34, y: vy * 0.34 };
}

/**
 * Where a point sitting in the flow has drifted to by time `t`.
 *
 * Closed form on purpose — see the note at the top of this file. Sampling the curl at the point's
 * *original* position rather than integrating along its path is an approximation, and over a long
 * enough time it would be a bad one; over the tens of seconds a fog element lives before it is
 * recycled it is indistinguishable, and it is exactly reproducible at any `t` in any order.
 */
export function driftTo(x, y, t, speed = 1, scale = 1) {
  const v = curl(x, y, t * 0.5, scale);
  return { x: x + v.x * t * speed, y: y + v.y * t * speed };
}

/** A wandering unit-ish value in 0..1 from one seed — a slow, smooth, non-repeating dial. */
export const wander = (seed, t, rate = 1) =>
  0.5 + 0.5 * Math.sin(t * rate * 0.37 + seed) * Math.cos(t * rate * 0.23 + seed * 1.7);

/** Angle of the flow at a point, for aligning elongated shapes along it. */
export function flowAngle(x, y, t, scale = 1) {
  const v = curl(x, y, t, scale);
  return Math.atan2(v.y, v.x);
}

export { TAU };
