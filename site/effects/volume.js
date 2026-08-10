// Soft volumetric masses — the primitive anything made of *air* is built out of.
//
// A lobe is one ellipse filled with a radial gradient that fades to nothing at its rim. Draw two
// hundred of them at different sizes, tones and orientations and they stop reading as discs and
// start reading as a volume: fog, smoke, a plume, the haze around a light.
//
// Three decisions in here are load-bearing, and each of them is the obvious thing done the other
// way round:
//
// **The alpha lives in the gradient stops, never in `globalAlpha`.** A lobe has to be solid through
// the middle and gone at the edge, which is a *curve*, not a constant. Putting the fade in the
// paint means one fill, no group layer, and no state to put back afterwards — and `globalAlpha`
// would only scale a curve you still had to build.
//
// **The gradient is built in unit space, under the transform.** A canvas gradient's coordinates are
// resolved in the user space in force when it is *painted*, not when it is created — so a unit
// circle drawn under `scale(major, minor)` gets a correctly elliptical gradient for free. Canvas
// has no elliptical gradient of its own, and this is how you get one anyway.
//
// **No blur.** `ctx.filter = 'blur(24px)'` would give softer, better lobes, and it is not worth it:
// it allocates and composites an offscreen layer per drawing operation, so a couple of hundred of
// them is tens of milliseconds a frame, and where it is unsupported it fails *silently* — every
// shape lands hard-edged and the picture looks broken rather than degraded. A gradient is soft
// everywhere, always, and costs one fill.

import { TAU, rgba } from '../lib/draw.js';

/**
 * How the paint falls off from the middle of a lobe to its rim.
 *
 * `(1 - q²)^2.5` past a flat core. Three properties matter and all three come from that shape:
 *
 * It leaves the core with **zero slope**, so there is no visible ring where the solid part ends —
 * the obvious `(1 - q)^k` has a slope there and draws its own outline. It reaches the rim with zero
 * slope too, so a lobe fades out rather than stopping. And it stays **fat through the middle**,
 * which is what makes overlapping lobes merge: with a fast falloff a neighbour three quarters of a
 * radius away contributes almost nothing, so a lattice of them covers its centres and leaves the
 * spaces between, which is the exact failure this shape exists to avoid.
 */
const falloff = (p, core) => {
  if (p <= core) return 1;
  const q = (p - core) / (1 - core);
  const w = 1 - q * q;
  return w * w * Math.sqrt(w);
};

/** Sample offsets for the profile. Five is enough; the gradient interpolates between them. */
const SMOOTH = [0, 0.34, 0.58, 0.79, 1];

// How many points the wobbled outline is built from, and their angles, worked out once. Fourteen
// carries three harmonics without aliasing the highest of them, and the points never move — only
// their radii do — so the trigonometry for the ring itself is done at module load and never again.
const RIM = 14;
const RIM_COS = Array.from({ length: RIM }, (_, i) => Math.cos((i / RIM) * TAU));
const RIM_SIN = Array.from({ length: RIM }, (_, i) => Math.sin((i / RIM) * TAU));
const RX = new Float64Array(RIM);
const RY = new Float64Array(RIM);

/**
 * One soft mass.
 *
 * Positional rather than an options object on purpose — this is called a couple of hundred times a
 * frame, and an object literal per call is a couple of hundred allocations a frame for nothing.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x       centre
 * @param {number} y       centre
 * @param {number} major   radius along the lobe's own x axis, before rotation
 * @param {number} minor   radius along its y axis — `minor << major` is a wind-stretched filament
 * @param {number} angle   rotation of the major axis, radians
 * @param {number[]} colour `[r, g, b]`
 * @param {number} alpha   opacity at the core; the rim is always fully transparent
 * @param {number} core    fraction of the radius held at full alpha before the fade begins
 * @param {number} wobble  how far the outline departs from an ellipse, 0..~0.5
 * @param {number} phase   drives the outline's three harmonics; advance it with time to make the
 *                         shape churn, and give every lobe a different starting value
 * @param {number} facet   0 for a smooth outline; >0 snaps its radii to that many steps
 */
export function lobe(ctx, x, y, major, minor, angle, colour, alpha, core = 0.38, wobble = 0, phase = 0, facet = 0) {
  // Below these there is nothing to see, and the arithmetic starts producing degenerate transforms.
  if (!(alpha > 0.003) || !(major > 0.4) || !(minor > 0.4)) return;

  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.scale(major, minor);

  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const p of SMOOTH) g.addColorStop(p, rgba(colour, alpha * falloff(p, core)));
  ctx.fillStyle = g;

  ctx.beginPath();
  // The wobble is dropped on very elongated lobes, and that is not a nicety. The outline is
  // parameterised by *angle*, so on a ten-to-one ellipse almost all fourteen points bunch at the
  // two ends and the long sides are described by two or three of them — which draws visible
  // straight segments and corners, and a hard-edged chevron in a picture of fog is the loudest
  // thing on screen. A plain arc under the same scale is a perfect ellipse at any aspect.
  if (wobble > 0 && minor > major * 0.26) outline(ctx, wobble, phase, facet);
  else ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * The wobbled unit outline: three angular harmonics, advancing at different rates.
 *
 * A soft ellipse is still an ellipse — draw two hundred of them and the eye finds the discs however
 * gently they fade, which is the one failure that makes a picture of clouds look like a picture of
 * blobs. This is the cheapest fix that works: the *silhouette* stops being a conic while the paint
 * inside it stays a plain radial gradient, so the softness costs nothing extra.
 *
 * The rates matter as much as the amplitudes. `1 : 1.9 : 2.9` is roughly the turbulence cascade —
 * fine detail boils while the big shape holds. Advance all three together and the whole outline
 * wobbles as one rigid object, which reads as a lava lamp immediately.
 *
 * Points are drawn through their own midpoints as quadratics, so the curve is smooth everywhere
 * rather than a fourteen-sided polygon with rounded corners.
 */
function outline(ctx, wobble, phase, facet) {
  for (let i = 0; i < RIM; i += 1) {
    const a = (i / RIM) * TAU;
    let r =
      1 +
      wobble *
        (0.34 * Math.sin(3 * a + phase) +
          0.2 * Math.sin(7 * a - phase * 1.9) +
          0.11 * Math.sin(11 * a + phase * 2.9));
    // Coarse rendering, not a different shape: the same outline with its radii quantised, which is
    // what a decoder does to a curve when it runs out of bits to describe it with.
    if (facet > 0) r = Math.round(r * facet) / facet;
    RX[i] = RIM_COS[i] * r;
    RY[i] = RIM_SIN[i] * r;
  }

  ctx.moveTo((RX[RIM - 1] + RX[0]) / 2, (RY[RIM - 1] + RY[0]) / 2);
  for (let i = 0; i < RIM; i += 1) {
    const j = (i + 1) % RIM;
    ctx.quadraticCurveTo(RX[i], RY[i], (RX[i] + RX[j]) / 2, (RY[i] + RY[j]) / 2);
  }
  ctx.closePath();
}

/**
 * A soft darkening toward the edges of the frame.
 *
 * Any picture built out of lobes has a problem at its boundary: the outermost lobes fade toward
 * transparent exactly where the frame ends, so the corners come out *lighter* than the middle,
 * which is the opposite of what depth looks like. This puts the weight back.
 */
export function vignette(ctx, W, H, colour, alpha, inner = 0.34) {
  const cx = W / 2;
  const cy = H / 2;
  const outer = Math.hypot(W, H) * 0.58;
  const g = ctx.createRadialGradient(cx, cy, outer * inner, cx, cy, outer);
  g.addColorStop(0, rgba(colour, 0));
  g.addColorStop(0.62, rgba(colour, alpha * 0.34));
  g.addColorStop(1, rgba(colour, alpha));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
