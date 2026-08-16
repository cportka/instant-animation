// The panel, and the one promise it makes to every scene in the gallery.
//
// A knob is not an event. The whole architecture rests on that: a scene is a pure function of `t`
// *and* of its knobs, both constant for the duration of a frame, which is what lets the render tests
// keep drawing eight timestamps out of order and the stage keep handing a fresh instance somebody
// else's clock. If a knob ever became an impulse — a nudge, a decay, anything the scene had to
// remember — every one of those would quietly stop being true and nothing here would say so.
//
// The other failure is duller and much more likely: a **dead knob**. A colour on the panel that
// moves nothing at all is indistinguishable from a working one until you try it, and a scene that
// declares six and wires four looks completely correct in every other test in this suite. So every
// knob of every scene is moved to both ends and the frame is compared.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { scenes } from '../site/scenes/index.js';
import { NEUTRAL, bend, knobsFor, makeKnobs, span } from '../site/lib/knobs.js';
import { createRecordingContext } from './helpers/recording-context.mjs';

const siteDir = fileURLToPath(new URL('../site/', import.meta.url));
const read = (name) => readFileSync(new URL(name, `file://${siteDir}`), 'utf8');

/** A viewport and a couple of instants — enough for a knob to have somewhere to show up. */
const VIEW = { width: 1280, height: 800 };
const TIMES = [4.6, 23.4, 74.2];

function shot(scene, knobs) {
  const recorder = createRecordingContext(VIEW);
  const instance = scene.create({ ...VIEW, seed: scene.meta.id, knobs });
  for (const t of TIMES) instance.draw(recorder.ctx, t, 1 / 60);
  return recorder.fingerprint();
}

test('every animation declares between four and ten knobs, and they are well formed', () => {
  const seen = new Map();
  for (const scene of scenes) {
    const { knobs, id } = { ...scene.meta, knobs: scene.meta.knobs };
    assert.ok(Array.isArray(knobs), `${id}: every animation needs a panel`);
    assert.ok(
      knobs.length >= 4 && knobs.length <= 10,
      `${id} declares ${knobs.length} knobs; four is too few to be worth opening and ten is a mixing desk`,
    );
    const ids = knobs.map((knob) => knob.id);
    assert.equal(new Set(ids).size, ids.length, `${id}: duplicate knob ids`);
    for (const knob of knobs) {
      assert.match(knob.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${id}: bad knob id "${knob.id}"`);
      assert.match(knob.colour, /^#[0-9a-f]{6}$/, `${id}/${knob.id}: a knob's colour is its only label`);
      // The colour is a vocabulary across the whole gallery, not a per-scene decoration: the same
      // swatch has to mean the same *kind* of gesture everywhere, or the panel teaches nothing.
      const already = seen.get(knob.id);
      if (already) {
        assert.equal(knob.colour, already, `${id}/${knob.id} is a different colour from the same knob elsewhere`);
      } else {
        seen.set(knob.id, knob.colour);
      }
    }
  }
});

test('the panel at its defaults is the artwork, exactly', () => {
  // Reset has to be a real answer rather than an approximation of one, and the three places that
  // build a scene without knowing what a knob is — the render tests, the determinism tests, the
  // poster path — have to get the picture as designed. Both are the same assertion.
  for (const scene of scenes) {
    assert.equal(
      shot(scene, undefined),
      shot(scene, makeKnobs(scene.meta)),
      `${scene.meta.id}: a scene built with no panel draws something other than the panel's defaults`,
    );
  }
});

test('every knob moves the picture, at both ends', () => {
  // The test the panel exists for. A knob that changes nothing is a colour on a control surface that
  // lies, and it is invisible to every other test in this suite.
  for (const scene of scenes) {
    const still = shot(scene, makeKnobs(scene.meta));
    for (const knob of scene.meta.knobs) {
      for (const at of [0, 1]) {
        const turned = makeKnobs(scene.meta);
        turned[knob.id] = at;
        assert.notEqual(
          shot(scene, turned),
          still,
          `${scene.meta.id}/${knob.id} at ${at} draws exactly the default picture — the knob is not wired to anything`,
        );
      }
    }
  }
});

test('a knob is part of the question, not an event', () => {
  // Turn one, turn it back, and the picture has to be the one you started with — bit for bit. That
  // is the whole difference between a parameter and an impulse, and it is what keeps a scene a pure
  // function of `t`. It also means a scene may not *read* a knob into its plan at build time and
  // then ignore the live value, which would make the panel work only until the scene was re-mounted.
  for (const scene of scenes) {
    const bag = makeKnobs(scene.meta);
    const recorder = createRecordingContext(VIEW);
    const instance = scene.create({ ...VIEW, seed: scene.meta.id, knobs: bag });

    const before = [];
    for (const t of TIMES) {
      recorder.ops.length = 0;
      instance.draw(recorder.ctx, t, 1 / 60);
      before.push(recorder.ops.join('\n'));
    }

    // Somebody sweeps the whole rack...
    for (const knob of scene.meta.knobs) bag[knob.id] = 0.87;
    for (const t of TIMES) instance.draw(recorder.ctx, t, 1 / 60);
    // ...and puts it back.
    for (const knob of scene.meta.knobs) bag[knob.id] = NEUTRAL;

    for (const [i, t] of TIMES.entries()) {
      recorder.ops.length = 0;
      instance.draw(recorder.ctx, t, 1 / 60);
      assert.equal(
        recorder.ops.join('\n'),
        before[i],
        `${scene.meta.id} at ${t}s does not come back when the knobs do — something is being remembered`,
      );
    }
  }
});

test('a scene handed a half-empty bag fills in the rest rather than drawing NaN', () => {
  // The bag is shared, mutable and outlives the scene that reads it, so it will be handed back with
  // a knob missing sooner or later — a scene gaining one between visits, a stale address, a typo.
  // `undefined` in an arithmetic chain does not throw; it produces `NaN` geometry, which the
  // recording context does catch, and a blank frame in a browser, which nothing catches.
  for (const scene of scenes) {
    const bag = makeKnobs(scene.meta);
    delete bag[scene.meta.knobs[0].id];
    bag[scene.meta.knobs[scene.meta.knobs.length - 1].id] = undefined;
    const recorder = createRecordingContext(VIEW);
    const instance = scene.create({ ...VIEW, seed: scene.meta.id, knobs: bag });
    for (const t of TIMES) instance.draw(recorder.ctx, t, 1 / 60);
    recorder.assertClean(`${scene.meta.id} with a gap in its knobs`);
    assert.ok(recorder.paints > 20, `${scene.meta.id} drew almost nothing with a gap in its knobs`);
  }
});

test('bend is neutral in the middle and reaches both ends', () => {
  // The helper the whole panel rests on. If its middle ever stopped being the middle, every scene's
  // default would drift off the artwork at once and nothing would fail anywhere else.
  const near = (got, want, what) => assert.ok(Math.abs(got - want) < 1e-12, `${what}: ${got} is not ${want}`);
  for (const [lo, mid, hi] of [[0, 1, 4], [-3, 0, 3], [2, 2, 9], [1, 0.5, 0.1]]) {
    // The middle is exact rather than nearly exact, because it is what "reset" means.
    assert.equal(bend(NEUTRAL, lo, mid, hi), mid);
    near(bend(0, lo, mid, hi), lo, 'the low end');
    near(bend(1, lo, mid, hi), hi, 'the high end');
    // Clamped rather than extrapolating past the ends, and monotone in each half.
    near(bend(-5, lo, mid, hi), lo, 'below the low end');
    near(bend(9, lo, mid, hi), hi, 'above the high end');
    near(bend(0.25, lo, mid, hi), (lo + mid) / 2, 'a quarter');
    near(bend(0.75, lo, mid, hi), (mid + hi) / 2, 'three quarters');
  }
  assert.equal(span(0.5, 10, 20), 15);
  assert.deepEqual(knobsFor({ knobs: [{ id: 'a' }] }, { a: Number.NaN }), { a: NEUTRAL });
});

test('the panel is markup with no words in it, and the reset is a black button', () => {
  const html = read('index.html');
  const css = read('styles.css');

  const opens = html.indexOf('<div class="panel"');
  const panel = opens < 0 ? null : html.slice(opens, html.indexOf('</div>', html.indexOf('knobs-reset')) + 6);
  assert.ok(panel, 'index.html has no panel');
  assert.match(panel, /\bhidden\b/, 'the panel must start hidden — the animation is the page');
  assert.match(panel, /id="knobs"/, 'app.js stocks the rack by id');
  assert.equal(panel.replace(/<[^>]+>/g, '').trim(), '', 'there is no text on this page, including in the panel');

  const reset = html.match(/<button[^>]*id="knobs-reset"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(reset, 'the panel needs a reset');
  assert.match(reset, /aria-label="/, 'the reset has no text, so it needs an accessible name');
  assert.equal(reset.replace(/<[^>]+>/g, '').trim(), '', 'the reset is a black square, not a word');
  const style = css.slice(css.indexOf('.panel__reset {'));
  assert.match(style.slice(0, style.indexOf('}')), /background:\s*#000000/, 'the reset must actually be black');

  // The knob's colour comes from the scene, so the stylesheet must defer to it rather than name one.
  const fill = css.slice(css.indexOf('.knob__fill {'));
  assert.match(fill.slice(0, fill.indexOf('}')), /var\(--knob/, 'a knob is drawn in whatever colour the scene declared');
});

test('the space bar and a double tap are the way in, and neither travels the gallery', () => {
  const app = read('app.js');
  assert.match(app, /case ' ':[\s\S]{0,120}panel\.toggle\(\)/, 'space must open the panel');
  assert.match(app, /'dblclick'[\s\S]{0,240}panel\.toggle\(\)/, 'a double tap must open the panel');
  // The single tap has to be held back or every visit to the panel re-arranges the picture on the
  // way in — and it must only wait where there is something to wait for.
  assert.match(app, /if \(!hasCompositions\(\)\) return;\s*\n\s*window\.clearTimeout\(tapTimer\)/,
    'a tap must defer to a possible double tap, and only on scenes that have compositions');
  assert.match(app, /window\.clearTimeout\(tapTimer\);\s*\n\s*panel\.toggle\(\)/, 'a double tap must cancel the pending tap');
  // And the key it took has to have actually been given up, or a scene changes underneath the panel.
  const keys = app.slice(app.indexOf('window.addEventListener(\'keydown\''), app.indexOf('window.addEventListener(\n  \'wheel\''));
  assert.doesNotMatch(keys, /case ' ':[\s\S]{0,80}travel\(/, 'space must no longer travel the gallery');
});
