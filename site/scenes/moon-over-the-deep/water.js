// The sea, and the path the moon lays on it.
//
// The moon is the subject and this is the animation. A full moon over water does one thing that
// nothing else in nature does: it puts a **broken column of light** on the surface, narrow at the
// horizon and spreading toward you, made of separate glints that appear and vanish as the swell
// turns each face toward the eye and away again. Draw the water without it and you have a dark
// rectangle; draw it and the whole picture starts moving without anything having to travel.
//
// So the glints are *derived* rather than drawn. Every point on the water has a wave slope, and a
// point is bright when its face is tilted to bounce the moon at the viewer. That single condition
// produces the narrow-to-wide taper, the dashes, and their flicker for free — none of which are
// authored anywhere, and all of which fall out the moment the slope is a real quantity.
//
// **Perspective is depth, and depth is one division.** The screen row is `d` from 0 at the horizon
// to 1 at the bottom of the frame, and the distance out to sea is `1 / d`: rows near the horizon are
// a long way off, so the swell there is compressed into a few pixels and its wavelength on screen
// collapses. Everything else — how wide the path is, how tall a wave face reads, how much of the sky
// the water is reflecting — is a function of that same number.
//
// The rollers come **toward** you, nearly parallel to the horizon and tilted a few degrees, because
// "gently rolls" is a swell and not a chop. Three of them at unrelated wavelengths, so the surface
// never repeats and the biggest one gives it a slow breathing rhythm you can watch.

import { clamp, rgba } from '../../lib/draw.js';
import { bayerOn } from '../../effects/pixel.js';
import { shadeAt, waterlineAt } from './layout.js';
import { DEEP, PATH, SEA } from './palette.js';
import { deepAt, glowAt } from './deep.js';

export function planWater(rng) {
  return {
    seed: rng.range(0, 50),
    // Three, at wavelengths with no common factor: one long slow roller carrying most of the height,
    // one at half its length, and a short one that only ever shows up as texture on their faces.
    // `tilt` is the wavelength *across* the swell, and it is the difference between a sea and a set
    // of blinds. With only a cross-term of a fraction of a radian the phase was very nearly constant
    // along a row, so an entire row lit or did not and the moonpath came out as a stack of
    // horizontal bars. A roller is a long crest, not an infinite one: it has to break up along its
    // own length or every highlight on it is the same highlight.
    swells: [
      { k: rng.range(2.6, 3.4), speed: rng.range(0.3, 0.42), tilt: rng.range(0.7, 1.2), amp: 1 },
      { k: rng.range(6, 8), speed: rng.range(0.5, 0.72), tilt: rng.range(-2.4, -1.4), amp: 0.46 },
      { k: rng.range(13, 17), speed: rng.range(0.9, 1.3), tilt: rng.range(3.2, 5), amp: 0.34 },
    ],
  };
}

/**
 * The surface at a point: how high it is, and how steeply it is tilted toward the viewer.
 *
 * Both come out of the same three sines — the height is the sum, the slope is the sum of the
 * derivatives — which is why they can never disagree about where a crest is. Anything else in the
 * scene that needs to know what the water is doing asks this, so the island's reflection breaks on
 * exactly the waves you can see.
 */
export function surfaceAt(plan, t, xFrac, d) {
  // Distance out to sea. The `+ 0.045` is what stops the horizon row dividing by nothing and taking
  // the wavelength to zero, where it would alias into a moiré fence.
  const z = 1 / (d + 0.045);
  // Sideways distance in the same world units as `z`, so a crest a long way out is compressed along
  // its length exactly as much as it is across. Plus a constant floor, which is not perspective and
  // is not a fudge: a swell crest has a **coherence length**, and a term that scales purely with `z`
  // says it does not — the cross-frequency collapsed to nothing near the viewer, every near crest
  // became one unbroken line, and the bottom of the path came out as four enormous smooth lenses.
  const across = (xFrac - 0.5) * (z * 2.6 + 7);
  let h = 0;
  let slope = 0;
  for (const s of plan.swells) {
    const phase = z * s.k - t * s.speed * s.k + across * s.tilt + plan.seed;
    h += s.amp * Math.sin(phase);
    // Toward the viewer means `-z`, so the sign here is what decides which face of a roller is lit.
    slope -= s.amp * s.k * Math.cos(phase);
  }
  return { h, slope: slope / 9 };
}

export function drawWater(ctx, W, H, t, plan, moon, deepPlan, px) {
  const top = waterlineAt(H, px);
  const rows = Math.max(1, Math.ceil((H - top) / px));
  const cols = Math.max(1, Math.ceil(W / px));
  const deep = deepAt(W, H, t, deepPlan, top);
  const swells = plan.swells;
  const n = swells.length;

  const sea = SEA.map(() => []);
  const path = PATH.map(() => []);
  const lume = DEEP.map(() => []);

  // The swell, marched across each row instead of evaluated at every chunk.
  //
  // `surfaceAt` above is the definition and this is the same thing computed the fast way. Along a
  // row the phase of every swell is **linear in the column** — `z` is fixed, so all that changes is
  // the cross term, by the same amount each step — which means the sine and cosine can be advanced
  // by angle addition: two multiplies apiece instead of a trig call. Evaluated the obvious way this
  // scene spent forty-seven milliseconds a frame, nearly all of it in six transcendentals per chunk
  // across forty-seven thousand chunks. The picture is identical; a test holds the two in agreement.
  const sin = new Float64Array(n);
  const cos = new Float64Array(n);
  const dSin = new Float64Array(n);
  const dCos = new Float64Array(n);
  // The run being accumulated across the current row: which bucket, which step, and where it began.
  let runInto = null;
  let runStep = -1;
  let runX = 0;

  for (let row = 0; row < rows; row += 1) {
    const y = top + row * px;
    const d = (row + 0.5) / rows;
    const z = 1 / (d + 0.045);
    const spanX = z * 2.6 + 7;
    for (let i = 0; i < n; i += 1) {
      const s = swells[i];
      const start = z * s.k - t * s.speed * s.k - 0.5 * spanX * s.tilt + plan.seed;
      const step = (px / W) * spanX * s.tilt;
      sin[i] = Math.sin(start);
      cos[i] = Math.cos(start);
      dSin[i] = Math.sin(step);
      dCos[i] = Math.cos(step);
    }
    // The far water is a mirror for the sky and the near water is a hole. That is the single
    // strongest depth cue a sea has, and it is one term: bright at the horizon, falling away fast.
    //
    // It does not fall to zero. The swell is added on top of this, so a base at the very bottom of
    // the ramp gives the troughs nowhere to go: everything below the mid-water clamped to the
    // darkest step and the near sea came out dead flat black, with the rollers only visible in the
    // far half where there was headroom left.
    const base = 1.5 + 3.9 * (1 - d) ** 2.1;
    // A swell is only legible where there is room for it to be — a wave a third of a chunk high at
    // the horizon is noise, so its contribution grows with nearness.
    const relief = 0.3 + d * 1.5;
    // ...and the path widens as it comes toward you, which is the shape everybody recognises.
    const spread = W * (0.006 + d * 0.19);
    const glare = 0.55 + d * 0.85;

    // The envelope is a gaussian, so three widths out it is worth a thousandth of a step. Outside
    // that the exponential is not worth calling — and outside it is most of the row.
    const litFrom = moon.cx - spread * 3;
    const litTo = moon.cx + spread * 3;

    for (let col = 0; col < cols; col += 1) {
      const x = col * px;
      let h = 0;
      let slope = 0;
      for (let i = 0; i < n; i += 1) {
        const s = swells[i];
        h += s.amp * sin[i];
        slope -= s.amp * s.k * cos[i];
        const ns = sin[i] * dCos[i] + cos[i] * dSin[i];
        cos[i] = cos[i] * dCos[i] - sin[i] * dSin[i];
        sin[i] = ns;
      }
      slope /= 9;

      // A face is lit when it is tilted to bounce the moon at the eye. Raised to a **high** power,
      // because a specular highlight has almost no shoulder: either the angle is right and it is
      // dazzling, or it is wrong and there is nothing there. At a gentle exponent the whole lit half
      // of every roller came up and the path was a row of soft lily pads; at five, only the tips of
      // the crests catch, and the column breaks into separate glints the way it does on real water.
      let lit = 0;
      if (x > litFrom && x < litTo && slope > 0) {
        const off = (x - moon.cx) / spread;
        lit = slope ** 3.4 * Math.exp(-off * off) * glare;
      }

      // Which of the three surfaces this chunk belongs to, and which step of it.
      let into;
      let step;
      if (lit > 0.1) {
        into = path;
        step = shadeAt((1 - clamp(lit, 0, 1)) * (PATH.length - 1) * 1.25, col, row, PATH.length);
      } else {
        // Whatever is down there. Two tiers, and the second one is what stops it being a disc: only
        // the core is drawn on the green ramp, and everything outside it is *sea that has been
        // lifted* — so the glow fades into the water instead of ending at the edge of an ellipse.
        const glow = deep === null ? 0 : glowAt(deep, x, y);
        // The handover between the two tiers is **dithered**, not a threshold. A hard cut put the
        // green ramp's dark end against lifted sea, and those are far enough apart to draw a rim —
        // which turned something diffuse rising through water into a coin lying on it.
        if (glow > 0.2 && bayerOn(col, row, clamp((glow - 0.2) / 0.16, 0, 1))) {
          // Lit from beneath, and the swell keeps rolling over the top of it unlit — which is the
          // whole of what makes the light read as *under* the surface rather than on it.
          into = lume;
          step = shadeAt((1 - glow * (0.85 + h * 0.12)) * (DEEP.length - 1) * 1.1, col, row, DEEP.length);
        } else {
          into = sea;
          step = shadeAt(base + h * relief + lit * 3 + glow * 5, col, row, SEA.length);
        }
      }

      // Runs, not chunks. Whether a run of neighbouring columns lands on the same step is the whole
      // cost of this pass: the sea is thirty thousand cells and most of it is long stretches of one
      // value — the flat troughs, the dark near water, everything outside the path. Emitting a
      // rectangle per chunk asks the rasteriser for thirty thousand quads a frame and cost twenty
      // milliseconds on its own; merged, the same picture is a few thousand.
      if (into === runInto && step === runStep) continue;
      if (runInto !== null) runInto[runStep].push(runX, y, x - runX, px);
      runInto = into;
      runStep = step;
      runX = x;
    }
    if (runInto !== null) runInto[runStep].push(runX, y, cols * px - runX, px);
    runInto = null;
  }

  for (const [ramp, bucket] of [[SEA, sea], [DEEP, lume], [PATH, path]]) {
    for (let step = 0; step < ramp.length; step += 1) {
      const cells = bucket[step];
      if (!cells.length) continue;
      ctx.fillStyle = rgba(ramp[step], 1);
      ctx.beginPath();
      // `ctx.rect` rather than `chunk`: `chunk` snaps its arguments to the grid — four roundings and
      // two clamps a rectangle — and every coordinate here is `col * px` off a snapped origin, so it
      // is already exactly on the grid.
      for (let i = 0; i < cells.length; i += 4) ctx.rect(cells[i], cells[i + 1], cells[i + 2], cells[i + 3]);
      ctx.fill();
    }
  }
}
