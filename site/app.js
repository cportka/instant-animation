// Front-end shell: mount a scene, and otherwise stay invisible.
//
// The chrome (title, prompt, dots) surfaces on interaction and fades back out after a couple of
// idle seconds, so what's on screen is the animation and nothing else.

import { scenes, findScene } from './scenes/index.js';
import { createStage } from './lib/stage.js';

const CHROME_IDLE_MS = 2600;
const SWIPE_THRESHOLD = 60;

const canvas = document.getElementById('stage');
const titleEl = document.getElementById('scene-title');
const promptEl = document.getElementById('scene-prompt');
const dotsEl = document.getElementById('dots');
const liveEl = document.getElementById('live');

const stage = createStage(canvas, {
  onError(error) {
    console.error('[instant-animation] scene failed', error);
    liveEl.textContent = 'This animation stopped unexpectedly.';
  },
});

let current = -1;
let idleTimer = 0;

/* ------------------------------------------------------------- chrome -- */

function showChrome() {
  document.body.dataset.chrome = 'visible';
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    // Don't hide controls out from under a keyboard user.
    if (dotsEl.contains(document.activeElement)) return showChrome();
    document.body.dataset.chrome = 'hidden';
  }, CHROME_IDLE_MS);
}

function buildDots() {
  dotsEl.replaceChildren();
  // A single animation needs no navigation at all.
  dotsEl.hidden = scenes.length < 2;
  if (dotsEl.hidden) return;

  scenes.forEach((scene, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = scene.meta.title;
    button.setAttribute('aria-label', scene.meta.title);
    button.addEventListener('click', () => show(index));
    dotsEl.append(button);
  });
}

function syncDots() {
  [...dotsEl.children].forEach((button, index) => {
    button.setAttribute('aria-current', String(index === current));
  });
}

/* -------------------------------------------------------------- scene -- */

function show(index, { updateHash = true } = {}) {
  const next = ((index % scenes.length) + scenes.length) % scenes.length;
  if (next === current) return;
  current = next;

  const scene = scenes[current];
  document.body.style.background = scene.meta.background || '#04050d';
  titleEl.textContent = scene.meta.title;
  promptEl.textContent = scene.meta.prompt;
  canvas.setAttribute('aria-label', `${scene.meta.title}. ${scene.meta.prompt}`);
  document.title = `${scene.meta.title} · Instant Animation`;
  liveEl.textContent = `${scene.meta.title}: ${scene.meta.prompt}`;
  if (updateHash) history.replaceState(null, '', `#${scene.meta.id}`);

  syncDots();
  stage.mount(scene);
  showChrome();
}

function indexFromHash() {
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const scene = id && findScene(id);
  return scene ? scenes.indexOf(scene) : 0;
}

/* --------------------------------------------------------------- input -- */

window.addEventListener('keydown', (event) => {
  showChrome();
  if (event.key === 'ArrowRight' || event.key === 'PageDown') show(current + 1);
  else if (event.key === 'ArrowLeft' || event.key === 'PageUp') show(current - 1);
  else if (event.key === 'Home') show(0);
  else if (event.key === 'End') show(scenes.length - 1);
});

window.addEventListener('pointermove', showChrome, { passive: true });
window.addEventListener('pointerdown', showChrome, { passive: true });

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
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      show(current + (dx < 0 ? 1 : -1));
    }
  },
  { passive: true },
);

window.addEventListener('hashchange', () => show(indexFromHash(), { updateHash: false }));

/* ---------------------------------------------------------------- boot -- */

buildDots();
show(indexFromHash());
