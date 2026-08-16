// Front-end shell: mount a scene, and otherwise stay invisible.
//
// The gallery runs newest at the top to oldest at the bottom, so "next" means down and "previous"
// means up — and it is a **loop**: down from the oldest arrives back at the newest, up from the
// newest arrives at the oldest. Two floating chevrons are the only chrome and both are always live,
// because on a ring every direction goes somewhere. The one exception is a gallery of one, where
// the page is nothing but the animation and a control that returns you to where you already are is
// worse than no control at all.

import { scenes } from './scenes/index.js';
import { formatAddress, parseAddress, wrapIndex } from './lib/gallery.js';
import { makeKnobs } from './lib/knobs.js';
import { createPanel } from './lib/panel.js';
import { createStage } from './lib/stage.js';

// One wheel gesture should move one animation, not fifty.
const WHEEL_THRESHOLD = 60;
const INPUT_LOCK_MS = 1100;
const SWIPE_THRESHOLD = 60;
// How still a press has to be to count as a tap. Between this and SWIPE_THRESHOLD is a deliberate
// dead zone: a gesture that went somewhere and stopped is an *aborted* swipe, and re-composing the
// picture on a half-swipe reads as the page misreading you rather than as you having done anything.
const TAP_SLOP = 10;
// ...and how briefly. A still finger held past this is a long-press — a selection or callout
// gesture the platform owns — and quietly re-arranging the picture underneath it is a surprise.
const TAP_MS = 500;
// How long a tap waits to find out whether it was the first half of a double one. A single tap
// re-composes and a double opens the panel, so the first of a pair has to be held back or every
// visit to the panel also re-arranges the picture on the way in. Well under the threshold where a
// deliberate action starts to feel unanswered, and invisible next to the second of dissolve it is
// delaying. Scenes with only one composition have nothing to defer and do not wait at all.
const DOUBLE_MS = 260;

const canvas = document.getElementById('stage');
const navUp = document.getElementById('nav-up');
const navDown = document.getElementById('nav-down');
const liveEl = document.getElementById('live');

const stage = createStage(canvas, {
  onError(error) {
    console.error('[instant-animation] scene failed', error);
    liveEl.textContent = 'This animation stopped unexpectedly.';
  },
});

let current = -1;
// Which composition of the current scene is on screen, and which one each scene was last left on.
// Remembering is the point: choosing an arrangement and having the gallery forget it the moment you
// look at something else would make the choice feel like it did not count.
let shown = 0;
const chosen = new Map();
let locked = false;
let lockTimer = 0;
let wheelTravel = 0;
let tapTimer = 0;

// Where every scene's knobs are kept, one live bag each. Kept **per scene and for the whole visit**
// for the same reason the chosen composition is: having the gallery forget a setting the moment you
// look at something else would make moving it feel like it did not count. The bag is mutated in
// place by the panel and read by the scene, so a knob changes the next frame without re-mounting —
// and re-mounting would restart the clock, which is not what a knob does.
const tuning = new Map();
const knobsOf = (scene) => {
  if (!tuning.has(scene.meta.id)) tuning.set(scene.meta.id, makeKnobs(scene.meta));
  return tuning.get(scene.meta.id);
};

const panel = createPanel(
  document.getElementById('knobs'),
  document.getElementById('knobs-reset'),
  // A still frame has no loop to repaint it, so a knob turned under reduced motion would do nothing
  // visible at all until something else happened to redraw.
  () => stage.repaint(),
);

/* -------------------------------------------------------------- scene -- */

function show(index, { direction, updateHash = true, variant, dissolving = false } = {}) {
  const next = wrapIndex(index, scenes.length);
  const scene = scenes[next];
  const variants = scene.meta.variants;
  const pick = variants ? wrapIndex(variant ?? chosen.get(scene.meta.id) ?? 0, variants.length) : 0;
  // Re-mounting what is already on screen is a no-op — but a *different composition of the same
  // scene* is not, and that second half is the one this feature lives or dies on. With only the
  // scene compared, a shared link to a composition works perfectly for anyone opening it cold and
  // does nothing at all for anyone who already had the page open: the worst shape a bug can take,
  // because whoever built it never sees it.
  if (next === current && pick === shown) return;
  current = next;
  shown = pick;
  if (variants) chosen.set(scene.meta.id, pick);

  const title = variants ? `${scene.meta.title} — ${variants[pick].title}` : scene.meta.title;
  document.body.style.background = scene.meta.background || '#02010a';
  canvas.setAttribute('aria-label', `${title}. ${scene.meta.prompt}`);
  document.title = `${title} · Instant Animation`;
  // Nothing is written on the page, but the description still reaches a screen reader — and where an
  // animation has more than one arrangement, saying so is the only way that fact is discoverable
  // without sight. The tap is otherwise an affordance you can only find by accident.
  liveEl.textContent = variants
    ? `${title}, composition ${pick + 1} of ${variants.length}. Tap the picture or press left and right to change it. ${scene.meta.prompt}`
    : `${title}: ${scene.meta.prompt}`;
  if (updateHash) history.replaceState(null, '', formatAddress(scene, pick));

  // Both, always — the gallery is a ring. Only a gallery of one has nowhere to go.
  navUp.hidden = scenes.length < 2;
  navDown.hidden = scenes.length < 2;
  // The chrome wears the scene. An arrow drawn in one animation's language sitting on top of
  // another reads as a control bolted to the picture rather than as part of it — which is the one
  // thing this page is trying not to be. Scenes that say nothing get the original chevron.
  for (const nav of [navUp, navDown]) nav.dataset.chrome = scene.meta.chrome || 'neon';

  // Moving between animations pushes; moving between compositions of one dissolves in place. They
  // are different events and they have to look different — a push says "you have travelled" about a
  // picture that has not moved anywhere.
  // The rack belongs to the artwork, so it is restocked with the scene — and with that scene's own
  // values, which is what makes leaving and coming back a return rather than a reset.
  const knobs = knobsOf(scene);
  panel.stock(scene.meta, knobs);

  if (dissolving) stage.recompose(scene, variants?.[pick], knobs);
  else stage.mount(scene, { direction, variant: variants?.[pick], knobs });
}

/** Hold off further input until the channel change has finished, so it can't be cut in half. */
function lock() {
  locked = true;
  window.clearTimeout(lockTimer);
  lockTimer = window.setTimeout(() => {
    locked = false;
  }, INPUT_LOCK_MS);
}

function travel(delta) {
  if (locked || scenes.length < 2) return;
  lock();
  show(wrapIndex(current + delta, scenes.length), { direction: delta > 0 ? 'down' : 'up' });
}

/**
 * Walk the compositions of the animation already on screen — the second ring, inside the first.
 *
 * It shares the gallery's lock rather than getting a shorter one of its own: letting a tap land
 * mid-change drops whatever is in flight and produces a visible jump, and a second of not being able
 * to tap is the cheaper of the two.
 */
const hasCompositions = () => (scenes[current]?.meta.variants?.length ?? 0) > 1;

function recompose(delta) {
  const variants = scenes[current]?.meta.variants;
  if (locked || !variants || variants.length < 2) return;
  lock();
  show(current, { variant: shown + delta, dissolving: true });
}

/* -------------------------------------------------------------- input -- */

navUp.addEventListener('click', () => travel(-1));
navDown.addEventListener('click', () => travel(1));

window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  switch (event.key) {
    case 'ArrowDown':
    case 'PageDown':
      event.preventDefault();
      travel(1);
      break;
    // The space bar opens the knobs. It used to travel the gallery, which four other gestures
    // already do — the arrows, page keys, the wheel, a swipe and both chevrons — while the panel
    // had no keyboard route at all. A key that duplicates five others is worth more spent on the
    // thing that has none.
    case ' ':
    case 'Spacebar':
      event.preventDefault();
      panel.toggle();
      break;
    case 'Escape':
      panel.close();
      break;
    case 'ArrowUp':
    case 'PageUp':
      event.preventDefault();
      travel(-1);
      break;
    // The gallery runs up and down, so its second axis runs left and right. Nothing else on the
    // page uses these, and they are the only way to reach a composition without a pointer.
    // The gallery runs up and down, so its second axis runs left and right. The key is only
    // swallowed where it does something: on the three animations with a single composition it stays
    // the browser's, because taking a key and doing nothing with it is worse than not taking it.
    case 'ArrowRight':
    case 'ArrowLeft':
      if (!hasCompositions()) break;
      event.preventDefault();
      recompose(event.key === 'ArrowRight' ? 1 : -1);
      break;
    case 'Home':
      event.preventDefault();
      show(0, { direction: 'up' });
      break;
    case 'End':
      event.preventDefault();
      show(scenes.length - 1, { direction: 'down' });
      break;
    default:
      break;
  }
});

window.addEventListener(
  'wheel',
  (event) => {
    if (locked) return;
    // Accumulate so a trackpad's many small deltas add up to one deliberate gesture.
    wheelTravel = Math.sign(event.deltaY) === Math.sign(wheelTravel) ? wheelTravel + event.deltaY : event.deltaY;
    if (Math.abs(wheelTravel) < WHEEL_THRESHOLD) return;
    travel(wheelTravel > 0 ? 1 : -1);
    wheelTravel = 0;
  },
  { passive: true },
);

let swipeStart = null;
canvas.addEventListener(
  'pointerdown',
  (event) => {
    // Only the primary pointer. A second finger arriving mid-pinch must not restart the gesture.
    if (!event.isPrimary) return;
    swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId, at: event.timeStamp };
    // Capture, so a press that began here also *ends* here. Without it a drag that starts on the
    // canvas and releases over a chevron never delivers a pointerup, the start point survives, and
    // the next release computes a delta of several hundred pixels and travels the gallery for no
    // reason the visitor can connect to anything they did.
    canvas.setPointerCapture?.(event.pointerId);
  },
  { passive: true },
);
canvas.addEventListener('pointercancel', () => { swipeStart = null; }, { passive: true });
canvas.addEventListener(
  'pointerup',
  (event) => {
    if (!swipeStart || event.pointerId !== swipeStart.id) return;
    const press = swipeStart;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    swipeStart = null;
    // Swiping up pulls the next animation into view, the way a feed does.
    if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
      travel(dy < 0 ? 1 : -1);
      return;
    }
    // ...and a tap that went nowhere re-composes the one you are looking at. On a scene with a
    // single composition this does nothing at all, which is the correct amount for a page whose
    // entire premise is that the animation *is* the interface.
    //
    // Held back for a moment first, but only where there is something to hold back: a double tap
    // opens the knobs, and without the wait every visit to the panel would re-arrange the picture
    // on its way in. `dblclick` cancels whatever is pending.
    if (Math.hypot(dx, dy) <= TAP_SLOP && event.timeStamp - press.at <= TAP_MS) {
      if (!hasCompositions()) return;
      window.clearTimeout(tapTimer);
      tapTimer = window.setTimeout(() => recompose(1), DOUBLE_MS);
    }
  },
  { passive: true },
);

// Two taps in quick succession are not two taps. The panel is the second thing the picture can be
// asked for, and a double tap is the gesture with no other job on this page.
canvas.addEventListener('dblclick', (event) => {
  event.preventDefault();
  window.clearTimeout(tapTimer);
  panel.toggle();
});

window.addEventListener('hashchange', () => {
  const at = parseAddress(window.location.hash, scenes);
  show(at.index, { variant: at.variant, updateHash: false });
});

/* ---------------------------------------------------------------- boot -- */

const opening = parseAddress(window.location.hash, scenes);
show(opening.index, { variant: opening.variant });
