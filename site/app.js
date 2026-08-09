// Front-end shell: mount a scene, and otherwise stay invisible.
//
// The gallery runs newest at the top to oldest at the bottom, so "next" means down and "previous"
// means up. Two floating chevrons are the only chrome, and each only exists when there is
// somewhere to go — with a single animation the page is nothing but the animation.

import { scenes, findScene } from './scenes/index.js';
import { createStage } from './lib/stage.js';

// One wheel gesture should move one animation, not fifty.
const WHEEL_THRESHOLD = 60;
const INPUT_LOCK_MS = 1100;
const SWIPE_THRESHOLD = 60;

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
let locked = false;
let lockTimer = 0;
let wheelTravel = 0;

/* -------------------------------------------------------------- scene -- */

function show(index, { direction, updateHash = true } = {}) {
  const next = Math.max(0, Math.min(index, scenes.length - 1));
  if (next === current) return;
  current = next;

  const scene = scenes[current];
  document.body.style.background = scene.meta.background || '#02010a';
  canvas.setAttribute('aria-label', `${scene.meta.title}. ${scene.meta.prompt}`);
  document.title = `${scene.meta.title} · Instant Animation`;
  // Nothing is written on the page, but the description still reaches a screen reader.
  liveEl.textContent = `${scene.meta.title}: ${scene.meta.prompt}`;
  if (updateHash) history.replaceState(null, '', `#${scene.meta.id}`);

  navUp.hidden = current === 0;
  navDown.hidden = current === scenes.length - 1;
  // The chrome wears the scene. An arrow drawn in one animation's language sitting on top of
  // another reads as a control bolted to the picture rather than as part of it — which is the one
  // thing this page is trying not to be. Scenes that say nothing get the original chevron.
  for (const nav of [navUp, navDown]) nav.dataset.chrome = scene.meta.chrome || 'neon';

  stage.mount(scene, { direction });
}

function travel(delta) {
  if (locked) return;
  const next = current + delta;
  if (next < 0 || next > scenes.length - 1) return;

  locked = true;
  window.clearTimeout(lockTimer);
  lockTimer = window.setTimeout(() => {
    locked = false;
  }, INPUT_LOCK_MS);

  show(next, { direction: delta > 0 ? 'down' : 'up' });
}

function indexFromHash() {
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const scene = id && findScene(id);
  return scene ? scenes.indexOf(scene) : 0;
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
    swipeStart = { x: event.clientX, y: event.clientY };
  },
  { passive: true },
);
canvas.addEventListener(
  'pointerup',
  (event) => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    // Swiping up pulls the next animation into view, the way a feed does.
    if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) travel(dy < 0 ? 1 : -1);
  },
  { passive: true },
);

window.addEventListener('hashchange', () => show(indexFromHash(), { updateHash: false }));

/* ---------------------------------------------------------------- boot -- */

show(indexFromHash());
