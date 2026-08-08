// The pure parts of the tape: envelopes and noise. Everything else in `site/lib/vhs.js` needs a
// canvas and is covered by the headless render suite instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { heldPulse, hash, hexDither, blockRepeat, makeRepeatCells } from '../site/lib/vhs.js';
import { roundedRect, roundedRectPath } from '../site/lib/draw.js';
import { createRng } from '../site/lib/rng.js';
import { createRecordingContext } from './helpers/recording-context.mjs';

/** Seconds the envelope spends at (or within a hair of) full value, sampled at 1ms. */
function timeAtPeak(f, until = 20) {
  let seconds = 0;
  for (let t = 0; t < until; t += 0.001) if (f(t) >= 0.95) seconds += 0.001;
  return seconds;
}

const bareBump = (rise, shape) => (t) => (t < rise ? Math.sin((t / rise) * Math.PI) ** shape : 0);

test('heldPulse is zero outside its window', () => {
  assert.equal(heldPulse(-0.1, 1, 1), 0);
  assert.equal(heldPulse(0, 1, 1), 0);
  assert.equal(heldPulse(2, 1, 1), 0, 'the window is rise + hold');
  assert.equal(heldPulse(2.5, 1, 1), 0);
});

test('heldPulse sits at exactly 1 across the plateau', () => {
  for (const at of [1.5, 2, 2.5, 3, 3.15]) {
    assert.equal(heldPulse(at, 3, 1.65, 2.2), 1, `held at t=${at}`);
  }
});

test('heldPulse keeps the bump\'s rise and fall, only inserting the hold', () => {
  const rise = 3;
  const hold = 1.65;
  for (const at of [0.2, 0.8, 1.4]) {
    // The climb is untouched...
    assert.ok(Math.abs(heldPulse(at, rise, hold, 2.2) - bareBump(rise, 2.2)(at)) < 1e-12);
    // ...and the fall is the same climb mirrored, shifted by the held time.
    const mirrored = rise - at;
    assert.ok(Math.abs(heldPulse(mirrored + hold, rise, hold, 2.2) - bareBump(rise, 2.2)(mirrored)) < 1e-12);
  }
});

test('heldPulse holds each scene cycle at full value ~5x longer than a bare bump', () => {
  // The two cycles the floating-bed scene drives its tape damage with.
  for (const [name, rise, hold, shape] of [['burst', 0.95, 1, 0.6], ['surge', 3, 1.65, 2.2]]) {
    const before = timeAtPeak(bareBump(rise, shape));
    const after = timeAtPeak((t) => heldPulse(t, rise, hold, shape));
    const ratio = after / before;
    assert.ok(ratio > 4.5 && ratio < 5.5, `${name}: held ${ratio.toFixed(2)}x longer, expected ~5x`);
  }
});

test('heldPulse has no discontinuity at either seam of the plateau', () => {
  const step = 0.0005;
  let worst = 0;
  for (let t = 0; t < 5; t += step) {
    worst = Math.max(worst, Math.abs(heldPulse(t + step, 3, 1.65, 2.2) - heldPulse(t, 3, 1.65, 2.2)));
  }
  // A seam would show up as a jump far larger than the envelope's own slope.
  assert.ok(worst < 0.01, `largest step was ${worst}`);
});

test('roundedRectPath appends to the open path instead of starting a new one', () => {
  // The sunglasses are two lenses filled and stroked as one object; if this ever calls beginPath
  // the second lens silently erases the first, which looks like a monocle rather than an error.
  const appended = createRecordingContext();
  appended.ctx.beginPath();
  roundedRectPath(appended.ctx, 0, 0, 10, 10, 2);
  roundedRectPath(appended.ctx, 20, 0, 10, 10, 2);
  assert.equal(appended.ops.filter((op) => op.startsWith('beginPath')).length, 1);

  // ...while the convenience wrapper still opens its own.
  const standalone = createRecordingContext();
  roundedRect(standalone.ctx, 0, 0, 10, 10, 2);
  assert.equal(standalone.ops.filter((op) => op.startsWith('beginPath')).length, 1);
});

test('the honeycomb is never a clean lattice', () => {
  const render = (t, chaos) => {
    const rec = createRecordingContext({ width: 800, height: 600 });
    hexDither(rec.ctx, 800, 100, 300, 24, 0.3, t, chaos);
    return rec;
  };

  // Cells drop, rows shear and a few flood solid, so damage must change what is drawn.
  const calm = render(4, 0.2).ops.join('|');
  const wrecked = render(4, 2.5).ops.join('|');
  assert.notEqual(calm, wrecked, 'chaos does not affect the comb');

  // And it must keep changing over time rather than sitting still.
  assert.notEqual(render(4, 1).ops.join('|'), render(9, 1).ops.join('|'));

  // Same inputs, same comb — it still has to survive the determinism check.
  assert.deepEqual(render(4, 1).ops, render(4, 1).ops);
  assert.deepEqual(render(4, 1).problems, []);
});

test('blockRepeat stamps one source rect many times over', () => {
  const cells = makeRepeatCells(createRng('repeat-test'), 5);
  const rec = createRecordingContext({ width: 800, height: 600 });
  // Sweep time so at least one cell is inside its duty window.
  for (let t = 0; t < 40; t += 0.5) blockRepeat(rec.ctx, 800, 600, t, cells, 1);

  const blits = rec.ops.filter((op) => op.startsWith('drawImage('));
  assert.ok(blits.length > 0, 'no blocks were ever drawn');
  assert.deepEqual(rec.problems, []);
  assert.equal(rec.depth, 0, 'unbalanced save/restore');

  // The signature of the artefact: the same source rectangle reused across many destinations.
  // drawImage args are (source, sx, sy, sw, sh, dx, dy, dw, dh) — group by the source quad.
  const bySource = new Map();
  for (const op of blits) {
    const args = op.slice('drawImage('.length, -1).split(',');
    const key = args.slice(1, 5).join(',');
    bySource.set(key, (bySource.get(key) || 0) + 1);
  }
  assert.ok(
    Math.max(...bySource.values()) >= 3,
    'every blit used a different source — that is a smear, not a repeat',
  );
});

test('hash is deterministic and stays in [0, 1)', () => {
  for (let i = 0; i < 500; i += 1) {
    const value = hash(i * 3.7);
    assert.equal(value, hash(i * 3.7), 'hash must be a pure function of its input');
    assert.ok(value >= 0 && value < 1, `hash(${i * 3.7}) = ${value} is out of range`);
  }
});
