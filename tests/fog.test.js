// Claims about "Above the Fog" specifically — the two numbers in its brief that are checkable.
//
// The owner asked for fog that is "95% of the scene both in frequency and coverage, with only small
// peek-a-boos to the scene below". Those are the sort of requirement that is easy to satisfy on the
// day and easy to lose six rounds later to a tuning pass that made the gaps a little more generous
// each time. The render suite cannot see either one — it records drawing operations, not pixels —
// so both are measured here from the geometry directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../site/lib/rng.js';
import { planFog, windowCoverage } from '../site/scenes/above-the-fog/fog.js';
import { DURATION, FIGURES, PERIOD, apparitionAt } from '../site/scenes/above-the-fog/apparition.js';
import { createRecordingContext } from './helpers/recording-context.mjs';
import * as scene from '../site/scenes/above-the-fog/index.js';

const plan = () => planFog(createRng('above-the-fog'));

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 1024, height: 400 },
];

test('the peek-a-boos never open more than a twentieth of the frame', () => {
  const fog = plan();
  for (const { width, height } of VIEWPORTS) {
    let worst = 0;
    let sum = 0;
    let samples = 0;
    // Ten minutes at 20Hz — long enough to cover every phase relationship the windows can reach.
    for (let t = 0; t < 600; t += 0.05) {
      const open = windowCoverage(fog, t, width, height);
      worst = Math.max(worst, open);
      sum += open;
      samples += 1;
    }
    assert.ok(worst <= 0.05, `${width}x${height}: windows peaked at ${(worst * 100).toFixed(1)}% of the frame`);
    // And on average far below that — the peak is a moment, the mean is what the scene looks like.
    assert.ok(
      sum / samples < 0.02,
      `${width}x${height}: windows average ${((sum / samples) * 100).toFixed(1)}% of the frame`,
    );
  }
});

test('a peek-a-boo is a moment, not a state — and one is usually open somewhere', () => {
  const fog = plan();
  let openSomewhere = 0;
  let samples = 0;
  for (let t = 0; t < 600; t += 0.05) {
    if (windowCoverage(fog, t, 1440, 900) > 0) openSomewhere += 1;
    samples += 1;
  }
  const duty = openSomewhere / samples;
  // Always something to catch, never much of it. Zero would mean the peek-a-boos are dead; a duty
  // near 1 with tiny area is fine and expected — the constraint that matters is the area above.
  assert.ok(duty > 0.5, `a window is open only ${(duty * 100).toFixed(0)}% of the time`);
});

test('the fog is 95% of the scene, at every viewport, at every moment sampled', () => {
  // The load-bearing claim, measured rather than trusted. Every lobe is drawn as a unit circle
  // under a transform, filled with a gradient whose stops carry its alpha profile — so the recorded
  // op stream is enough to reconstruct exactly what the fog would composite to at any point,
  // without the scene exposing anything for the test's benefit.
  //
  // Only the lobes drawn in normal composite mode count toward hiding the town. The additive ones
  // are the crests and the filaments: they put light *on* the fog, and counting them here would let
  // a bright wisp stand in for coverage it does not provide.
  for (const viewport of VIEWPORTS) {
    const { width, height } = viewport;
    const recorder = createRecordingContext(viewport);
    const instance = scene.create({ ...viewport, seed: 'above-the-fog' });

    for (const t of [0, 3.7, 19.2, 41, 64.5, 121.3, 301.5]) {
      const before = recorder.ops.length;
      instance.draw(recorder.ctx, t, 1 / 60);
      const lobes = readLobes(recorder.ops.slice(before));
      assert.ok(lobes.length > 60, `t=${t}: only ${lobes.length} occluding masses drawn`);

      const hidden = [];
      for (let py = 0.5; py < 26; py += 1) {
        for (let px = 0.5; px < 40; px += 1) {
          hidden.push(occlusion(lobes, (px / 40) * width, (py / 26) * height));
        }
      }
      const fraction = (below) => hidden.filter((v) => v < below).length / hidden.length;
      const where = `${width}x${height} @ t=${t}`;

      // The brief, in one number: at most a twentieth of the frame is less than half fogged. That
      // twentieth is the peek-a-boos, and it is where the town is meant to come through.
      assert.ok(fraction(0.5) <= 0.05, `${where}: ${(fraction(0.5) * 100).toFixed(1)}% of the frame is barely fogged`);
      // The really clear part — where the town reads properly — is smaller still. "Small
      // peek-a-boos", not a picture of a town with weather over it.
      assert.ok(fraction(0.35) <= 0.02, `${where}: ${(fraction(0.35) * 100).toFixed(1)}% of the frame is nearly clear`);
      // And the typical point is thoroughly buried. Without this the two above could be satisfied
      // by a uniform veil at 0.55, which passes both and is not fog.
      hidden.sort((a, b) => a - b);
      const median = hidden[hidden.length >> 1];
      assert.ok(median > 0.8, `${where}: the middle of the frame is only ${(median * 100).toFixed(0)}% fogged`);
    }
  }
});

test('The Cloud comes about once a minute, and is gone the rest of the time', () => {
  // "Randomly every minute or so" is a claim about *rarity* as much as about frequency. An
  // apparition that showed up every twenty seconds would stop being an event, and one that only
  // ever fired at the top of the minute would be a clock.
  const starts = [];
  let live = 0;
  let previous = null;
  for (let t = 0; t < 1800; t += 0.05) {
    const event = apparitionAt(t);
    assert.deepEqual(event, apparitionAt(t), 'apparitionAt must be a pure function of time');
    if (!event) {
      previous = null;
      continue;
    }
    assert.ok(event.u > 0 && event.u < 1, `u ${event.u} out of range at t=${t}`);
    assert.ok(event.x > 0.1 && event.x < 0.9 && event.y > 0.1 && event.y < 0.9, 'apparition off frame');
    live += 1;
    if (previous !== event.n) starts.push(t);
    previous = event.n;
  }

  assert.equal(starts.length, Math.floor(1800 / PERIOD), 'one apparition per cycle, no more and no fewer');
  assert.ok(live * 0.05 / 1800 < 0.3, 'The Cloud is up too much of the time to be an event');

  // Not on a beat: the gaps between them must actually vary.
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  const spread = Math.max(...gaps) - Math.min(...gaps);
  assert.ok(spread > 4, `every apparition arrives ${gaps[0]}s after the last — that is a metronome`);
});

test('one apparition shows all four figures, in order, one at a time', () => {
  // The whole point of the feature is the sequence: The Cloud, an angel, a grim reaper, and The
  // Cloud again wearing a face. If a morph window ever swallowed a figure whole, nothing else in
  // the suite would notice.
  const seen = [];
  let start = null;
  for (let t = 0; t < PERIOD; t += 0.05) {
    if (apparitionAt(t)) { start = t; break; }
  }
  assert.ok(start !== null, 'no apparition in the first cycle');

  for (let t = start; t < start + DURATION; t += 0.02) {
    const event = apparitionAt(t);
    if (!event) continue;
    // "Settled" means this figure is on screen essentially alone.
    const settled = event.blend < 0.02 ? event.from : event.blend > 0.98 ? event.to : null;
    if (settled !== null && seen[seen.length - 1] !== settled) seen.push(settled);
  }

  assert.deepEqual(seen, [0, 1, 2, 3], `figures resolved in the order ${seen.join(' → ')}`);
  assert.equal(FIGURES.length, 4);
  for (const figure of FIGURES) {
    assert.ok(figure.count > 120, `a figure with only ${figure.count} cells will not read`);
    // Flat is unreadable at this size: a silhouette alone cannot tell an angel from a reaper.
    assert.ok(new Set(figure.level).size >= 2, 'a figure drawn at one tone is a blob');
  }
  // Between them the figures use the full depth — the darkest step is what hollows out the
  // reaper's cowl and cuts the eyes and mouth into the happy face, and nothing else supplies it.
  assert.equal(new Set(FIGURES.flatMap((f) => f.level)).size, 3);
});

/* ------------------------------------------------------------- helpers ---- */

/**
 * Recover every occluding lobe from a run of recorded ops: its ellipse and its alpha profile.
 *
 * A lobe is always the same sequence — `save`, `translate`, optional `rotate`, `scale`, then a
 * radial gradient over the *unit* circle, its stops, the outline, `fill`, `restore`. That unit
 * gradient is the signature: nothing else in the gallery draws one, and unlike the outline it is
 * the same whether the lobe is a plain ellipse or a wobbled one.
 *
 * The wobble is treated here as the ellipse it deviates from. Its three harmonics are zero-mean, so
 * over a probe grid the error cancels; where it does not, it is as likely to have added cover as
 * taken it away.
 */
function readLobes(ops) {
  const lobes = [];
  const modes = ['source-over'];
  let pending = null;

  for (const op of ops) {
    if (op === 'save') {
      modes.push(modes[modes.length - 1]);
    } else if (op === 'restore') {
      if (modes.length > 1) modes.pop();
      pending = null;
    } else if (op.startsWith('set:globalCompositeOperation(')) {
      modes[modes.length - 1] = op.slice('set:globalCompositeOperation('.length, -1);
    } else if (op.startsWith('translate(')) {
      const [x, y] = args(op);
      pending = { x, y, angle: 0, stops: [] };
    } else if (pending && op.startsWith('rotate(')) {
      pending.angle = args(op)[0];
    } else if (pending && op.startsWith('scale(')) {
      [pending.major, pending.minor] = args(op);
    } else if (pending && op === 'createRadialGradient(0.0000,0.0000,0.0000,0.0000,0.0000,1.0000)') {
      pending.unit = true;
    } else if (pending && op.startsWith('addColorStop(')) {
      const match = /^addColorStop\(([\d.-]+),rgba\([^)]*?,\s*([\d.-]+)\)\)$/.exec(op);
      if (match) pending.stops.push([Number(match[1]), Number(match[2])]);
    } else if (pending && op.startsWith('fill(')) {
      // Only the ones that actually hide something: additive lobes are light, not cover.
      if (pending.unit && pending.major !== undefined && pending.stops.length > 1 && modes[modes.length - 1] === 'source-over') {
        lobes.push(pending);
      }
      pending = null;
    } else if (/^(rect|fillRect|setTransform)/.test(op)) {
      pending = null;
    }
  }
  return lobes;
}

const args = (op) => op.slice(op.indexOf('(') + 1, -1).split(',').map(Number);

/**
 * What the fog composites to at a point, 0..1 — including the aerial wash, which covers the whole
 * frame unconditionally and is why a peek-a-boo is a hazy glimpse rather than a clean window.
 */
function occlusion(lobes, x, y) {
  let clear = 1 - WASH;
  for (const l of lobes) {
    const dx = x - l.x;
    const dy = y - l.y;
    const c = Math.cos(-l.angle);
    const s = Math.sin(-l.angle);
    const u = (dx * c - dy * s) / l.major;
    const v = (dx * s + dy * c) / l.minor;
    const r = Math.hypot(u, v);
    if (r >= 1) continue;
    clear *= 1 - alphaAt(l.stops, r);
  }
  return 1 - clear;
}

/** The lowest the aerial wash ever falls to. Measured off `wash()` in the scene. */
const WASH = 0.4;

/** The gradient's alpha at a fraction of the radius, interpolated between the recorded stops. */
function alphaAt(stops, r) {
  for (let i = 1; i < stops.length; i += 1) {
    const [p0, a0] = stops[i - 1];
    const [p1, a1] = stops[i];
    if (r <= p1) return p1 === p0 ? a1 : a0 + ((a1 - a0) * (r - p0)) / (p1 - p0);
  }
  return 0;
}
