// The stage: one canvas, one scene at a time — and the channel change between them.
//
// The change itself lives in `site/effects/transitions.js` and is chosen by the *incoming* scene's
// `meta.transition`. The stage's part is only the mechanics: draw the two scenes exactly adjacent,
// push them past each other, and hand the composite to whichever change the next animation wants.
//
// It owns everything a scene shouldn't have to think about: device pixel ratio, resizing, the
// animation loop, pausing in a hidden tab, honouring `prefers-reduced-motion`, and the transition.
// A scene only ever receives a 2D context, a clock, and its size, which is also what makes scenes
// testable in Node against a stub context.

import { smoothstep } from './draw.js';
import { createTape } from '../effects/vhs.js';
import { channelChange, makeChannelChange } from '../effects/transitions.js';
import { dissolve } from '../effects/dissolves.js';
import { createRng } from './rng.js';

// Past 2x the extra pixels cost far more than they show. A scene can ask for less via
// `meta.maxDpr` — a deliberately lo-fi scene has no use for retina pixels, and the fill rate it
// saves is the difference between 60fps and a slideshow on modest hardware.
const MAX_DPR = 2;
const TRANSITION_SECONDS = 0.95;
// Shorter than a channel change, because nothing is travelling. A composition change is one picture
// re-arranging, and a long one starts to feel like an interruption rather than a rearrangement.
const DISSOLVE_SECONDS = 0.8;
// Below this the picture is mush; better to drop frames than to keep shrinking.
const MIN_QUALITY = 0.4;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onError?: (error: Error) => void }} [options]
 */
export function createStage(canvas, options = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const change = makeChannelChange(createRng('channel-change'));
  // One scratch buffer for the whole stage: the channel change uses it, and every scene is handed
  // the same one so the tape artefacts stay fast. See `createTape`.
  const tape = createTape();

  let current = null; // { module, instance, elapsed }
  let outgoing = null; // the scene being pushed off screen, during a transition
  let transition = 0; // 0 → 1
  let direction = 1; // +1 when travelling down the gallery, -1 when travelling up
  let melt = 0; // 0 when idle, else 0 → 1 as the frozen composition rots away

  let pixelCap = MAX_DPR;
  // Render scale backs off when the machine can't keep up. A full-screen effects pipeline is
  // fill-rate bound, so resolution is the one lever that always works.
  let quality = 1;
  let slowFrames = 0;
  let fastFrames = 0;
  let frame = 0;
  let lastTimestamp = 0;
  let width = 0;
  let height = 0;
  let running = false;

  const prefersReducedMotion = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function measure() {
    const dpr = Math.min(window.devicePixelRatio || 1, pixelCap) * quality;
    const nextWidth = Math.max(1, Math.round(canvas.clientWidth || window.innerWidth));
    const nextHeight = Math.max(1, Math.round(canvas.clientHeight || window.innerHeight));
    const pixelWidth = Math.round(nextWidth * dpr);
    const pixelHeight = Math.round(nextHeight * dpr);

    const changed = width !== nextWidth || height !== nextHeight;
    width = nextWidth;
    height = nextHeight;

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    // Draw in CSS pixels; the DPR scale is the stage's business, not the scene's.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return changed;
  }

  function paint(entry, offsetY, dt) {
    ctx.save();
    try {
      ctx.translate(0, offsetY);
      entry.instance.draw(ctx, entry.elapsed, dt);
    } catch (error) {
      // A broken scene shouldn't spin at 60fps throwing — freeze on its last good frame.
      stop();
      options.onError?.(error);
      if (!options.onError) console.error('[instant-animation] scene failed to draw', error);
    } finally {
      ctx.restore();
    }
  }

  function renderFrame(dt) {
    if (!current) return;

    if (!outgoing) {
      paint(current, 0, dt);
      // ...and if a composition is coming apart, the frozen one is stamped back over the top of it in
      // whatever blocks have not yet given up. Only the new arrangement is ever *drawn* — the old one
      // is a photograph — so a dissolve costs one scene draw a frame where the channel change costs
      // two, and the stale picture is genuinely stale rather than a second live scene fading out.
      if (melt > 0) {
        ctx.save();
        dissolve(current.module.meta.dissolve, ctx, width, height, smoothstep(0, 1, melt), current.elapsed, tape);
        ctx.restore();
      }
      return;
    }

    // Channel change: the two scenes are exactly adjacent, so between them they always cover the
    // full frame — one slides out while the other slides in behind it.
    const p = smoothstep(0, 1, transition);
    paint(outgoing, -p * height * direction, dt);
    paint(current, (1 - p) * height * direction, dt);

    // Then wreck the composite, in the language of the scene being arrived at. Peaks in the middle
    // of the move and settles at both ends.
    const violence = Math.sin(p * Math.PI);
    const seamY = (1 - p) * height * direction + (direction > 0 ? 0 : height);
    tape?.capture(ctx);
    ctx.save();
    channelChange(
      current.module.meta.transition,
      ctx,
      width,
      height,
      current.elapsed,
      violence,
      seamY,
      change,
      tape,
    );
    ctx.restore();
  }

  function tick(timestamp) {
    frame = window.requestAnimationFrame(tick);
    // Clamp the step so a backgrounded tab or a slow first frame can't teleport the animation.
    const dt = lastTimestamp ? Math.min((timestamp - lastTimestamp) / 1000, 0.1) : 0;
    lastTimestamp = timestamp;

    // Watch the real frame interval, not the clamped step, and trade resolution for smoothness.
    if (dt > 0) adaptQuality(dt);

    if (current) current.elapsed += dt;
    if (melt > 0) {
      melt += dt / DISSOLVE_SECONDS;
      if (melt >= 1) melt = 0;
    }
    if (outgoing) {
      outgoing.elapsed += dt;
      transition += dt / TRANSITION_SECONDS;
      if (transition >= 1) {
        transition = 0;
        outgoing = null;
      }
    }
    renderFrame(dt);
  }

  /**
   * Drop the render scale when frames get slow, put it back when they don't. Coming down is
   * deliberately much faster than going up: a visitor should never spend more than about a second
   * watching a slideshow, but a scale change is visible, so recovering waits until the machine has
   * been comfortable for a good while. A catastrophically slow frame counts triple, so a machine
   * that is badly over its budget reaches a usable scale in a handful of frames rather than in
   * half a minute. The counters resetting on every change is the hysteresis that stops it
   * oscillating. The scene never hears about any of this: it always draws in CSS pixels.
   */
  function adaptQuality(dt) {
    if (dt > 1 / 28) {
      slowFrames += dt > 1 / 12 ? 3 : 1;
      fastFrames = 0;
    } else if (dt < 1 / 50) {
      fastFrames += 1;
      slowFrames = 0;
    }

    if (slowFrames >= 12 && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.2);
      slowFrames = 0;
      fastFrames = 0;
      measure();
    } else if (fastFrames > 300 && quality < 1) {
      quality = Math.min(1, quality + 0.2);
      slowFrames = 0;
      fastFrames = 0;
      measure();
    }
  }

  function start() {
    if (running || !current) return;
    running = true;
    lastTimestamp = 0;
    frame = window.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  function resize() {
    if (!current) return;
    const changed = measure();
    current.instance.resize?.(width, height);
    outgoing?.instance.resize?.(width, height);
    // A still frame has no loop to repaint it, and a resize wipes the canvas either way.
    if (changed && !running) renderFrame(0);
  }

  function handleVisibility() {
    if (!current) return;
    if (document.hidden) stop();
    else if (!prefersReducedMotion()) start();
  }

  function build(module, variant) {
    return {
      module,
      elapsed: prefersReducedMotion() ? (module.meta.posterTime ?? 0) : 0,
      instance: module.create({ width, height, seed: module.meta.seed || module.meta.id, variant, tape }),
    };
  }

  /**
   * Mount a scene module. Pass a direction to play the channel change into it.
   *
   * `variant` is one of the scene's own `meta.variants`, chosen by the shell, and the stage does not
   * look inside it — it forwards it to `create()` and forgets it. That is deliberate: a scene having
   * several compositions of itself is a fact about the *artwork*, and the moment the engine starts
   * understanding compositions it acquires opinions about how they differ, which is exactly the
   * knowledge that belongs in the scene. Passing `undefined` is normal and means "however you open".
   *
   * @param {{ meta: object, create: Function }} module
   * @param {{ direction?: 'down' | 'up', variant?: object }} [opts]
   */
  function mount(module, opts = {}) {
    pixelCap = Math.min(module.meta.maxDpr ?? MAX_DPR, MAX_DPR);
    measure();
    const reduced = prefersReducedMotion();
    const next = build(module, opts.variant);

    // Re-mounting the *same* animation — which is what changing composition is — carries its clock
    // across. Both entries are then the same artwork at the same instant, so the sky, the stars, the
    // tide of lamps and the figment's schedule all continue through the change instead of snapping
    // back to zero, and what you see is one picture being re-arranged rather than two pictures.
    //
    // This is legal only because scenes are pure functions of `t`. Handing a freshly built instance
    // somebody else's clock would be meaningless if drawing at `t` depended on having drawn at
    // `t - dt` first — the whole determinism rule is what buys this one line.
    if (current && current.module === module && !reduced) next.elapsed = current.elapsed;

    // A transition is motion for its own sake — skip it entirely when that's unwelcome.
    if (current && opts.direction && !reduced) {
      outgoing = current;
      transition = 0;
      direction = opts.direction === 'up' ? -1 : 1;
    } else {
      outgoing = null;
      transition = 0;
    }
    melt = 0;
    current = next;

    if (reduced) {
      stop();
      renderFrame(0);
    } else {
      renderFrame(0);
      start();
    }
    return current.instance;
  }

  /**
   * Swap to another composition of the animation already mounted, dissolving in place.
   *
   * The clock carries across — both are the same artwork at the same instant — and the frame that is
   * on screen right now is frozen into a scratch layer *before* the swap, which is the whole trick:
   * what rots away over the next second is a photograph of the arrangement you were looking at, and
   * nothing has to keep drawing it.
   */
  function recompose(module, variant) {
    pixelCap = Math.min(module.meta.maxDpr ?? MAX_DPR, MAX_DPR);
    measure();
    const reduced = prefersReducedMotion();
    const next = build(module, variant);
    if (current && !reduced) next.elapsed = current.elapsed;

    if (current && !reduced && tape && module.meta.dissolve) {
      tape.capture(ctx, 'stale');
      melt = 0.0001;
    } else {
      melt = 0;
    }
    outgoing = null;
    transition = 0;
    current = next;

    if (reduced) {
      stop();
      renderFrame(0);
    } else {
      renderFrame(0);
      start();
    }
    return current.instance;
  }

  function destroy() {
    stop();
    window.removeEventListener('resize', resize);
    window.removeEventListener('orientationchange', resize);
    document.removeEventListener('visibilitychange', handleVisibility);
    observer?.disconnect();
    current = null;
    outgoing = null;
  }

  const observer =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  observer?.observe(canvas);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', handleVisibility);

  return {
    mount,
    recompose,
    destroy,
    resize,
    get scene() {
      return current?.module ?? null;
    },
    get running() {
      return running;
    },
    get transitioning() {
      return outgoing !== null;
    },
    get quality() {
      return quality;
    },
  };
}
