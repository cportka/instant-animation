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
    const viewport = { width: 1200, height: 800 };
    let captures = 0;
    const tape = {
      source: { width: viewport.width, height: viewport.height },
      capture() {
        captures += 1;
      },
    };

    const recorder = createRecordingContext(viewport);
    const instance = scene.create({ ...viewport, seed: meta.id, tape });
    for (const t of SAMPLE_TIMES) instance.draw(recorder.ctx, t, 1 / 60);

    recorder.assertClean(`${meta.id} with a tape`);
    assert.equal(recorder.depth, 0, `${meta.id}: unbalanced save/restore on the tape path`);
    assert.ok(recorder.paints > SAMPLE_TIMES.length * 20, `${meta.id}: drew almost nothing`);
    assert.ok(captures > 0, `${meta.id} never snapshotted the tape — the fast path is dead code`);
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
