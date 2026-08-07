// The stage: one canvas, one scene at a time.
//
// It owns everything a scene shouldn't have to think about — device pixel ratio, resizing, the
// animation loop, pausing in a hidden tab, and honouring `prefers-reduced-motion`. A scene only
// ever receives a 2D context, a clock, and its size, which is also what makes scenes testable in
// Node against a stub context.

// Past 2x the extra pixels cost far more than they show.
const MAX_DPR = 2;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onError?: (error: Error) => void }} [options]
 */
export function createStage(canvas, options = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });

  let scene = null; // the mounted module
  let instance = null; // its per-mount state
  let frame = 0; // requestAnimationFrame handle
  let lastTimestamp = 0;
  let elapsed = 0; // seconds of *visible* animation, so a hidden tab doesn't jump on return
  let width = 0;
  let height = 0;
  let running = false;

  const prefersReducedMotion = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function measure() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
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

  function renderFrame(dt) {
    if (!instance) return;
    ctx.save();
    try {
      instance.draw(ctx, elapsed, dt);
    } catch (error) {
      // A broken scene shouldn't spin at 60fps throwing — freeze on its last good frame.
      stop();
      options.onError?.(error);
      if (!options.onError) console.error('[instant-animation] scene failed to draw', error);
    } finally {
      ctx.restore();
    }
  }

  function tick(timestamp) {
    frame = window.requestAnimationFrame(tick);
    // Clamp the step so a backgrounded tab or a slow first frame can't teleport the animation.
    const dt = lastTimestamp ? Math.min((timestamp - lastTimestamp) / 1000, 0.1) : 0;
    lastTimestamp = timestamp;
    elapsed += dt;
    renderFrame(dt);
  }

  function start() {
    if (running || !instance) return;
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
    if (!instance) return;
    const changed = measure();
    instance.resize?.(width, height);
    // A still frame has no loop to repaint it, and a resize wipes the canvas either way.
    if (changed && !running) renderFrame(0);
  }

  function handleVisibility() {
    if (!instance) return;
    if (document.hidden) stop();
    else if (!prefersReducedMotion()) start();
  }

  /**
   * Mount a scene module. Replaces whatever was on the stage.
   * @param {{ meta: object, create: Function }} module
   */
  function mount(module) {
    stop();
    scene = module;
    elapsed = 0;
    measure();
    instance = module.create({ width, height, seed: module.meta.seed || module.meta.id });

    if (prefersReducedMotion()) {
      // Still image, held at the moment the scene says it reads best.
      elapsed = module.meta.posterTime ?? 0;
      renderFrame(0);
    } else {
      renderFrame(0);
      start();
    }
    return instance;
  }

  function destroy() {
    stop();
    window.removeEventListener('resize', resize);
    window.removeEventListener('orientationchange', resize);
    document.removeEventListener('visibilitychange', handleVisibility);
    observer?.disconnect();
    instance = null;
    scene = null;
  }

  const observer =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  observer?.observe(canvas);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', handleVisibility);

  return {
    mount,
    destroy,
    resize,
    get scene() {
      return scene;
    },
    get running() {
      return running;
    },
  };
}
