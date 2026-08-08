// Small math and canvas helpers shared by every scene.

export const TAU = Math.PI * 2;

export const lerp = (a, b, t) => a + (b - a) * t;

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** A sine in friendlier units: one full cycle every `period` seconds. */
export const wave = (t, period, phase = 0) => Math.sin((t / period) * TAU + phase);

/** Keep a normalised coordinate inside [0, 1) so drifting star fields wrap instead of popping. */
export const wrap01 = (v) => v - Math.floor(v);

/** `rgba()` string from an [r, g, b] triple — lets a colour keep its alpha animated. */
export const rgba = ([r, g, b], alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

/**
 * Rounded rectangle as an explicit path. Hand-rolled rather than `ctx.roundRect` so scenes only
 * ever touch the small, universally supported slice of the 2D API the test harness models.
 */
export function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  roundedRectPath(ctx, x, y, width, height, radius);
}

/**
 * The same shape appended to whatever path is already open, so several can be combined into one
 * fill or stroke — which is how a shape made of more than one rectangle stays a single object
 * under `clip()` and under a composite mode.
 */
export function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Magic constant for approximating a quarter circle with a cubic bezier.
const KAPPA = 0.5522847498;

/**
 * Ellipse as an explicit bezier path (no `ctx.ellipse`, no transform tricks), so the shape is
 * readable and the harness only has to model `bezierCurveTo`. Caller fills or strokes.
 */
export function ellipsePath(ctx, cx, cy, rx, ry) {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy);
  ctx.bezierCurveTo(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry);
  ctx.bezierCurveTo(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy);
  ctx.bezierCurveTo(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy);
  ctx.closePath();
}

/** Regular polygon, flat-topped at rotation 0. `sides < 3` falls back to a circle. */
export function polygonPath(ctx, cx, cy, radius, sides, rotation = 0) {
  ctx.beginPath();
  if (sides < 3) {
    ctx.arc(cx, cy, radius, 0, TAU);
    return;
  }
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * TAU - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Elliptical arc as a path, built under a scale transform and left in device space so the caller's
 * stroke width stays uniform. Caller fills or strokes.
 */
export function ellipseArcPath(ctx, cx, cy, rx, ry, start, end) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, start, end);
  ctx.restore();
}

/** Fill an ellipse in one call. */
export function fillEllipse(ctx, cx, cy, rx, ry, fillStyle) {
  ellipsePath(ctx, cx, cy, rx, ry);
  if (fillStyle) ctx.fillStyle = fillStyle;
  ctx.fill();
}

/** Soft radial glow, drawn as a filled circle so it composites cheaply. */
export function glow(ctx, cx, cy, radius, colour, innerAlpha, midAlpha = innerAlpha * 0.35) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, rgba(colour, innerAlpha));
  g.addColorStop(0.45, rgba(colour, midAlpha));
  g.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.fill();
}

/**
 * Scale factor that fits a design-space box inside the viewport without cropping it.
 * Scenes compose against fixed design coordinates and let this map them to any screen.
 */
export const fitContain = (width, height, designWidth, designHeight) =>
  Math.min(width / designWidth, height / designHeight);
