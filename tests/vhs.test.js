// The pure parts of the tape: envelopes and noise. Everything else in `site/lib/vhs.js` needs a
// canvas and is covered by the headless render suite instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  heldPulse,
  hash,
  cellDither,
  blockRepeat,
  makeRepeatCells,
  damageAt,
  shatterAt,
  ditherAt,
} from '../site/effects/vhs.js';
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

test('damage arrives in bursts and silences, not on a beat', () => {
  const step = 0.05;
  const span = 600;
  const level = [];
  for (let t = 0; t < span; t += step) level.push(damageAt(t, 5.4));

  const quiet = level.filter((d) => d < 0.15).length / level.length;
  assert.ok(quiet > 0.2 && quiet < 0.75, `${(quiet * 100).toFixed(0)}% quiet — want real silences and real noise`);

  // Silences long enough to notice, and hits an order of magnitude above the common case.
  let run = 0;
  let longest = 0;
  for (const d of level) {
    run = d < 0.15 ? run + step : 0;
    longest = Math.max(longest, run);
  }
  assert.ok(longest > 6, `longest silence was only ${longest.toFixed(1)}s`);

  const peaks = level.filter((d) => d > 8).length;
  assert.ok(peaks > 0, 'nothing ever hit hard');
  assert.ok(peaks / level.length < 0.1, 'the big hits are supposed to be rare');

  // The thing this replaced: a metronome. If any period divides the schedule, it is back.
  for (const period of [3.6, 7.2, 9.5, 12, 18, 71]) {
    const shifted = level.map((_, i) => damageAt(i * step + period, 5.4));
    const drift = level.reduce((sum, d, i) => sum + Math.abs(d - shifted[i]), 0) / level.length;
    assert.ok(drift > 0.1, `damage repeats itself every ${period}s — that is a beat, not a schedule`);
  }
});

test('the block field is up about one second in twenty', () => {
  // The whole point of the field is scarcity. Up continuously it stops being an artefact and
  // becomes the thing the frame is made of, so the duty cycle is a requirement, not a side effect.
  const step = 0.02;
  const span = 4000;
  let on = 0;
  let events = 0;
  let previous = 0;

  for (let t = 0; t < span; t += step) {
    const level = ditherAt(t, 5.4);
    assert.ok(level >= 0 && level <= 1, `level ${level} out of range`);
    if (level > 0) on += step;
    if (level > 0 && previous === 0) events += 1;
    previous = level;
  }

  const duty = on / span;
  assert.ok(duty > 0.03 && duty < 0.07, `field is up ${(duty * 100).toFixed(1)}% of the time, want ~5%`);
  // Short appearances rather than one long one: a five-percent duty spent in a single stretch
  // would be a minute of wallpaper followed by twenty of nothing.
  assert.ok(on / events < 3, `each appearance averages ${(on / events).toFixed(1)}s — too long to be a fault`);
  assert.equal(ditherAt(123.4, 5.4), ditherAt(123.4, 5.4), 'ditherAt must be pure');
});

test('shatterAt is rare, bounded and deterministic', () => {
  let active = 0;
  let events = 0;
  let previous = null;

  for (let t = 0; t < 600; t += 0.05) {
    const event = shatterAt(t, 5.4);
    if (!event) {
      previous = null;
      continue;
    }
    active += 1;
    assert.ok(event.phase > 0 && event.phase < 1, `phase ${event.phase} out of range`);
    assert.ok(event.x > 0 && event.x < 1 && event.y > 0 && event.y < 1, 'impact point off frame');
    assert.deepEqual(shatterAt(t, 5.4), event, 'shatterAt must be a pure function of time');
    if (previous !== event.seed) events += 1;
    previous = event.seed;
  }

  assert.ok(events > 4, `only ${events} breaks in ten minutes`);
  const duty = active * 0.05 / 600;
  assert.ok(duty < 0.35, `the frame is broken ${(duty * 100).toFixed(0)}% of the time`);
});

test('the block field is never a clean lattice, and never one shape', () => {
  const render = (t, chaos) => {
    const rec = createRecordingContext({ width: 800, height: 600 });
    cellDither(rec.ctx, 800, 100, 300, 24, 0.3, t, chaos);
    return rec;
  };

  // Cells drop, rows shear and a few flood solid, so damage must change what is drawn.
  const calm = render(4, 0.2).ops.join('|');
  const wrecked = render(4, 2.5).ops.join('|');
  assert.notEqual(calm, wrecked, 'chaos does not affect the comb');

  // And it must keep changing over time rather than sitting still.
  assert.notEqual(render(4, 1).ops.join('|'), render(9, 1).ops.join('|'));

  // Same inputs, same field — it still has to survive the determinism check.
  assert.deepEqual(render(4, 1).ops, render(4, 1).ops);
  assert.deepEqual(render(4, 1).problems, []);

  // Cells are polygons of mixed side counts, not a honeycomb. Each is moveTo + n-1 lineTo +
  // closePath, so counting the lineTo runs between closePaths recovers the shapes drawn.
  const sides = new Set();
  let run = 0;
  for (const op of render(4, 1.6).ops) {
    if (op.startsWith('moveTo')) run = 1;
    else if (op.startsWith('lineTo')) run += 1;
    else if (op.startsWith('closePath') && run) {
      sides.add(run);
      run = 0;
    }
  }
  assert.ok(sides.size >= 3, `only ${[...sides].join('/')}-sided cells — that is a pattern`);
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
