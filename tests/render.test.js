// Render every scene headlessly and check what it actually put on the canvas.
//
// This is the test that earns its keep: it catches NaN geometry, colours built from undefined
// values, leaked save/restore, and any accidental Math.random()/Date.now() (which would break
// determinism) — all without a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scenes } from '../site/scenes/index.js';
import { createRecordingContext } from './helpers/recording-context.mjs';

const VIEWPORTS = [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 390, height: 844, label: 'phone portrait' },
  { width: 1024, height: 400, label: 'wide and short' },
];

/** Times chosen to cover the slow cycles: breathing, drift, the shooting-star schedule. */
const SAMPLE_TIMES = [0, 0.016, 1.5, 6.4, 12.6, 25, 61.25, 300.5];

/** A stand-in for the stage's scratch buffer that records how a scene uses it. */
function spyTape(width, height) {
  const size = { width, height };
  const reads = [];
  const captured = [];
  return {
    reads,
    captured,
    tape: {
      get source() {
        reads.push('main');
        return size;
      },
      of(name) {
        reads.push(name);
        return size;
      },
      capture(_ctx, name = 'main') {
        captured.push(name);
      },
    },
  };
}

for (const scene of scenes) {
  const { meta } = scene;

  test(`${meta.id}: renders cleanly at every viewport`, () => {
    for (const viewport of VIEWPORTS) {
      const recorder = createRecordingContext(viewport);
      const instance = scene.create({ ...viewport, seed: meta.id });

      for (const t of SAMPLE_TIMES) {
        instance.draw(recorder.ctx, t, 1 / 60);
      }

      recorder.assertClean(`${meta.id} @ ${viewport.label}`);
      assert.equal(recorder.depth, 0, `${meta.id} @ ${viewport.label}: unbalanced save/restore`);
      assert.ok(
        recorder.paints > SAMPLE_TIMES.length * 20,
        `${meta.id} @ ${viewport.label}: drew almost nothing (${recorder.paints} paints)`,
      );
    }
  });

  test(`${meta.id}: survives a resize`, () => {
    const recorder = createRecordingContext({ width: 800, height: 600 });
    const instance = scene.create({ width: 800, height: 600, seed: meta.id });
    instance.draw(recorder.ctx, 0, 0);
    instance.resize?.(1600, 500);
    instance.draw(recorder.ctx, 2.5, 1 / 60);
    instance.resize?.(320, 900);
    instance.draw(recorder.ctx, 5, 1 / 60);
    recorder.assertClean(`${meta.id} after resize`);
    assert.equal(recorder.depth, 0);
  });

  test(`${meta.id}: is deterministic for a given seed`, () => {
    const viewport = { width: 1200, height: 800 };
    const runs = [0, 1].map(() => {
      const recorder = createRecordingContext(viewport);
      const instance = scene.create({ ...viewport, seed: meta.id });
      for (const t of SAMPLE_TIMES) instance.draw(recorder.ctx, t, 1 / 60);
      return recorder.fingerprint();
    });
    assert.equal(
      runs[0],
      runs[1],
      `${meta.id} drew differently on two identical runs — is something using Math.random() or Date.now()?`,
    );
  });

  test(`${meta.id}: different seeds produce different art`, () => {
    const viewport = { width: 1200, height: 800 };
    const fingerprint = (seed) => {
      const recorder = createRecordingContext(viewport);
      const instance = scene.create({ ...viewport, seed });
      instance.draw(recorder.ctx, 3, 1 / 60);
      return recorder.fingerprint();
    };
    assert.notEqual(
      fingerprint(meta.id),
      fingerprint(`${meta.id}-alternate`),
      `${meta.id} ignores its seed — the stage's randomness isn't reaching the scene`,
    );
  });

  test(`${meta.id}: renders the same whether or not it gets a scratch tape`, () => {
    // The browser hands scenes a scratch buffer to read displacement from; the plain render tests
    // don't. Without this, the path every real visitor exercises is the untested one.
    //
    // Using the tape is optional — a scene that never samples the frame has no need of one — so
    // the invariant here is not "you must capture" but "you must not read a buffer you never
    // filled", which would sample a stale or empty canvas and is invisible until you look.
    const { tape, reads, captured } = spyTape(1200, 800);

    const viewport = { width: 1200, height: 800 };
    const recorder = createRecordingContext(viewport);
    const instance = scene.create({ ...viewport, seed: meta.id, tape });
    for (const t of SAMPLE_TIMES) instance.draw(recorder.ctx, t, 1 / 60);

    recorder.assertClean(`${meta.id} with a tape`);
    assert.equal(recorder.depth, 0, `${meta.id}: unbalanced save/restore on the tape path`);
    assert.ok(recorder.paints > SAMPLE_TIMES.length * 20, `${meta.id}: drew almost nothing`);
    if (reads.length) {
      assert.ok(
        captured.length > 0,
        `${meta.id} read the tape ${reads.length} times without ever capturing it`,
      );
    }
  });

  test(`${meta.id}: renders its reduced-motion poster frame`, () => {
    const viewport = { width: 1280, height: 720 };
    const recorder = createRecordingContext(viewport);
    const instance = scene.create({ ...viewport, seed: meta.id });
    instance.draw(recorder.ctx, meta.posterTime ?? 0, 0);
    recorder.assertClean(`${meta.id} poster frame`);
    assert.ok(recorder.paints > 20, `${meta.id}: poster frame is nearly blank`);
  });
}

// A claim about one artwork rather than about scenes in general: "Asleep Among the Stars" bleeds
// one layer of the picture through another — the shatter reveals the undamaged frame behind the
// falling shards, bleed windows punch it back through, and some stuck blocks print from it. All
// three need the tape to be holding more than one layer. If that ever collapses to a single layer
// they each silently sample the very thing they are drawing over, and the effect vanishes with
// nothing failing anywhere.
test('floating-bed keeps more than one tape layer, or its bleeds are dead', () => {
  const scene = scenes.find((s) => s.meta.id === 'floating-bed');
  assert.ok(scene, 'floating-bed is no longer in the gallery');

  const { tape, captured } = spyTape(1200, 800);
  const viewport = { width: 1200, height: 800 };
  const recorder = createRecordingContext(viewport);
  const instance = scene.create({ ...viewport, seed: scene.meta.id, tape });
  for (const t of SAMPLE_TIMES) instance.draw(recorder.ctx, t, 1 / 60);

  const layers = new Set(captured);
  assert.ok(
    layers.size > 1,
    `only captured "${[...layers].join(', ')}" — there is nothing left for a bleed to reveal`,
  );
});

// The five ways a lamp can stop existing, exercised directly. Driving them through the scene means
// waiting for a particular lamp to reach a particular point of its approach, which tests the clock
// rather than the effect — and would let four of the five rot unnoticed.
test('every lamp exit draws something, cheaply, and the same way twice', async () => {
  const { EXIT_KINDS, drawLampExit } = await import('../site/scenes/grizzly-peak/index.js');
  assert.equal(EXIT_KINDS.length, 5, 'all five exits must be reachable');

  const run = (kind, u) => {
    const rec = createRecordingContext({ width: 1440, height: 900 });
    drawLampExit(rec.ctx, kind, 900, 500, 240, u, 137, 5);
    return rec;
  };

  for (const kind of EXIT_KINDS) {
    // Something is drawn across the whole arc, not just at one instant.
    const painted = [0.05, 0.2, 0.4, 0.6, 0.8].map((u) => run(kind, u).ops.filter((op) => op.startsWith('rect(')).length);
    assert.ok(painted.every((n) => n > 0), `${kind} drew nothing at some point in its arc: ${painted}`);

    // Budgeted — and the budget is about *restraint*, not cost. The scene draws thousands of
    // chunks a frame for the sky alone, so a few hundred more would not be felt; but a lamp
    // reaching the near end is the most ordinary thing that happens here, and an exit big enough
    // to need hundreds of chunks is an exit that has taken over the frame. The first version of
    // the bolts peaked at 336 and did exactly that.
    const worst = Math.max(...painted);
    assert.ok(worst <= 90, `${kind} peaked at ${worst} chunks, budget is 90`);

    // Two fills or three, never a fill per particle.
    const fills = run(kind, 0.3).ops.filter((op) => op.startsWith('fill(')).length;
    assert.ok(fills <= 4, `${kind} used ${fills} fills — batch by colour`);

    // Deterministic, clean, and balanced, like everything else in the gallery.
    assert.deepEqual(run(kind, 0.3).ops, run(kind, 0.3).ops, `${kind} is not deterministic`);
    run(kind, 0.3).assertClean(`lamp exit ${kind}`);
    assert.equal(run(kind, 0.3).depth, 0, `${kind}: unbalanced save/restore`);

    // And it is over: nothing at all once the arc completes.
    assert.equal(run(kind, 1).ops.filter((op) => op.startsWith('rect(')).length, 0, `${kind} still drawing at u=1`);
  }

  // The five have to differ. Same seed, same moment, same everything but the kind.
  const shapes = new Set(EXIT_KINDS.map((kind) => run(kind, 0.3).ops.join('|')));
  assert.equal(shapes.size, 5, 'two exits draw identically — they are meant to be five different things');
});
