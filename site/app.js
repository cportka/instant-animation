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

/* -------------------------------------------------------------- scene -- */

function show(index, { direction, updateHash = true, variant } = {}) {
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

  stage.mount(scene, { direction, variant: variants?.[pick] });
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
 * It shares the gallery's lock rather than getting a shorter one of its own. A composition change is
 * a channel change like any other, and letting a tap interrupt one mid-flight drops the outgoing
 * scene and produces a visible jump; a second of not being able to tap is the cheaper of the two.
 */
const hasCompositions = () => (scenes[current]?.meta.variants?.length ?? 0) > 1;

function recompose(delta) {
  const variants = scenes[current]?.meta.variants;
  if (locked || !variants || variants.length < 2) return;
  lock();
  show(current, { direction: delta > 0 ? 'down' : 'up', variant: shown + delta });
}

/* -------------------------------------------------------------- input -- */

navUp.addEventListener('click', () => travel(-1));
navDown.addEventListener('click', () => travel(1));

window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  switch (event.key) {
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Spacebar':
      event.preventDefault();
      travel(1);
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
    if (Math.hypot(dx, dy) <= TAP_SLOP && event.timeStamp - press.at <= TAP_MS) recompose(1);
  },
  { passive: true },
);

window.addEventListener('hashchange', () => {
  const at = parseAddress(window.location.hash, scenes);
  show(at.index, { variant: at.variant, updateHash: false });
});

/* ---------------------------------------------------------------- boot -- */

const opening = parseAddress(window.location.hash, scenes);
show(opening.index, { variant: opening.variant });
