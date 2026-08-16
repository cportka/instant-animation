// The Square at Noon is the one animation here whose subject is its own renderer, so what has to be
// tested is the renderer's contract with itself.
//
// Nine bands, five grids, six palettes, all in one frame — and every one of those is a way for the
// picture to quietly stop being a picture. Bands whose boundaries cross give a stratum a negative
// height and everything in it disappears. A value hierarchy left to chance puts a ground brighter
// than the sky above it and the square floats off the bottom. Grids that are not multiples of one
// base do not tile, and the town's verticals come apart into a staircase of offsets. None of those
// fail loudly; all of them look like a bug in the scene rather than in the machinery.
//
// And one about the *wind*, which everything else is downstream of: it has to be mostly nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bend, makeKnobs } from '../site/lib/knobs.js';
import { create, meta } from '../site/scenes/square-at-noon/index.js';
import { BANDS, GRIDS, PALETTES, baseChunk, bandOf, chunkOf, edgeAt, inkOf, planStrata, strataAt } from '../site/scenes/square-at-noon/strata.js';
import { carriedBy, gustAt } from '../site/scenes/square-at-noon/wind.js';
import { swingAt } from '../site/scenes/square-at-noon/town.js';
import { createRng } from '../site/lib/rng.js';
import { createRecordingContext } from './helpers/recording-context.mjs';

const plan = () => planStrata(createRng(meta.id));
const SEEDS = ['square-at-noon', 'a', 'b', 'another-one', 'zzz'];

test('the band boundaries never cross, so no stratum is ever inside out', () => {
  // The scene walks the bands as ranges. A pair of edges that swapped would hand a band a negative
  // height, and everything drawn in it — sky, town, dust, whichever it happens to be — would vanish
  // for as long as the crossing lasted, on a slow drift nobody would connect to anything.
  for (const seed of SEEDS) {
    const strata = planStrata(createRng(seed));
    for (let t = 0; t < 400; t += 0.37) {
      let last = -Infinity;
      for (let n = 0; n <= BANDS; n += 1) {
        const edge = edgeAt(n, t, strata);
        assert.ok(edge > last, `${seed} @ ${t.toFixed(2)}s: edge ${n} at ${edge} is not past ${last}`);
        last = edge;
      }
      assert.equal(edgeAt(0, t, strata), 0, 'the top of the frame must be pinned');
      assert.equal(edgeAt(BANDS, t, strata), 1, 'the bottom of the frame must be pinned');
    }
  }
});

test('every band is somebody, and bandOf agrees with the edges it walks', () => {
  // Two answers to the same question — the range walk that shapes use and the point lookup that
  // particles use — computed by different code. A dust mote that thought it was in a different band
  // from the sky behind it would be drawn at the wrong resolution, which is exactly the kind of
  // thing that reads as "the strata are broken" rather than as "this mote is wrong".
  const strata = plan();
  for (let t = 0; t < 200; t += 1.3) {
    for (let up = 0; up < 1; up += 0.011) {
      const n = bandOf(up, t, strata);
      assert.ok(n >= 0 && n < BANDS, `bandOf gave ${n}`);
      assert.ok(up >= edgeAt(n, t, strata), `${up} is above band ${n}`);
      assert.ok(up < edgeAt(n + 1, t, strata), `${up} is below band ${n}`);
    }
  }
});

test('the value hierarchy holds in every palette: sky brightest, ground darkest', () => {
  // The one thing that keeps a frame with six palettes in it from being six pictures. Colours are
  // taken by *index*, so whatever ramp a band deals, step 4 is the lightest thing in it and step 0
  // the darkest — which is what lets the sky be sky and the ground be ground when the two are drawn
  // in unrelated colours. An earlier build rolled each band's ramp by a hashed step or two and the
  // square came out brighter than the sky above it.
  const luma = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  for (const ramp of PALETTES) {
    assert.equal(ramp.length, 5, 'every palette is five steps, because everything indexes them');
    for (let i = 1; i < ramp.length; i += 1) {
      assert.match(ramp[i], /^#[0-9a-f]{6}$/);
      assert.ok(
        luma(ramp[i]) > luma(ramp[i - 1]) + 12,
        `${ramp[i]} is not clearly lighter than ${ramp[i - 1]} — the ramp does not rise`,
      );
    }
  }
  // ...and `inkOf` must be the identity on the index rather than an offset into it.
  const strata = strataAt(3, 40, plan());
  for (let step = 0; step < 5; step += 1) assert.equal(inkOf(strata, step), strata.palette[step]);
  assert.equal(inkOf(strata, -3), strata.palette[0], 'clamped, not wrapped');
  assert.equal(inkOf(strata, 9), strata.palette[4], 'clamped, not wrapped');
});

test('every grid in the frame is a whole multiple of one base chunk', () => {
  // Bands that did not share a base would not line up on any column, and the town's verticals — the
  // one thing that has to survive being drawn at four resolutions — would come apart into a
  // staircase of offsets at every boundary.
  for (const [W, H] of [[1440, 900], [390, 844], [1024, 400], [800, 800]]) {
    for (const grain of [0.45, 1, 2.2]) {
      const base = baseChunk(W, H, grain);
      assert.ok(base >= 2, `a base chunk of ${base} is not a grid`);
      for (const grid of GRIDS) {
        for (const gust of [0, 0.3, 1]) {
          for (const spread of [0.25, 1, 1.9]) {
            const px = chunkOf(base, { grid }, gust, spread);
            assert.equal(px % base, 0, `${px} is not a multiple of ${base}`);
            assert.ok(px >= base, `${px} is finer than the base chunk`);
          }
        }
      }
    }
  }
});

test('a band holds its deal long enough to be seen, and the frame never re-deals all at once', () => {
  // Latched, and staggered. Re-rolled per frame this scene is static; dealt all at once it is a
  // slide projector. Both are the difference between psychedelic and broken.
  const strata = plan();
  let changes = 0;
  let together = 0;
  let previous = Array.from({ length: BANDS }, (_, n) => strataAt(n, 0, strata).era);
  for (let t = 0.1; t < 120; t += 0.1) {
    const now = Array.from({ length: BANDS }, (_, n) => strataAt(n, t, strata).era);
    const moved = now.filter((era, n) => era !== previous[n]).length;
    if (moved > 0) changes += 1;
    if (moved > 1) together += 1;
    previous = now;
  }
  // Nine bands over two minutes on a six-and-a-half second hold: about 165 deals, and no frame may
  // carry more than one of them.
  assert.ok(changes > 120 && changes < 220, `${changes} deals in two minutes is the wrong cadence`);
  assert.equal(together, 0, 'two bands re-dealt in the same frame — the stagger has collapsed');

  // ...and a deal must actually change something, or the hold is a hold on nothing.
  const seen = new Set();
  for (let n = 0; n < BANDS; n += 1) {
    for (let era = 0; era < 40; era += 1) {
      const s = strataAt(n, era * 6.5 + 0.1, strata);
      seen.add(`${s.grid}/${s.palette[0]}`);
    }
  }
  assert.ok(seen.size > 12, `only ${seen.size} distinct arrangements ever come up`);
});

test('the wind is mostly nothing, and what is loose in it never stops moving', () => {
  // A gust is an *arrival*. Four sines added up is a breeze that never drops, and a scene whose dust,
  // doors and resolution all read one number would then never be still — there would be nothing for
  // a gust to be louder than.
  let calm = 0;
  let hard = 0;
  let peak = 0;
  const samples = 6000;
  for (let i = 0; i < samples; i += 1) {
    const g = gustAt(i * 0.31);
    if (g < 0.25) calm += 1;
    if (g > 0.7) hard += 1;
    peak = Math.max(peak, g);
    assert.ok(g >= 0 && g <= 1.02, `a gust of ${g} is outside the range everything else assumes`);
  }
  assert.ok(calm / samples > 0.35, `only ${((calm / samples) * 100).toFixed(0)}% of the time is calm`);
  // Two per cent sounds like nothing and is a strong gust every minute or so, because the slowest
  // wave in the stack takes two and a half minutes to come round. Rare is the specification.
  assert.ok(hard / samples > 0.015, 'the wind never actually gusts');
  assert.ok(hard / samples < 0.3, 'the wind is a wind tunnel rather than weather');
  assert.ok(peak > 0.85, `the strongest gust in half an hour is ${peak.toFixed(2)}`);

  // The travel is the gust's integral, so a tumbleweed keeps rolling when the wind drops — it merely
  // rolls slower. Monotone is the whole claim: a ball of dead brush never goes backwards.
  let last = carriedBy(0);
  for (let t = 0.25; t < 900; t += 0.25) {
    const now = carriedBy(t);
    assert.ok(now > last, `the travel went backwards at ${t}s`);
    last = now;
  }
});

test('the doors are shut in still air and clatter in a gust', () => {
  // The brief asks for doors that blow open and closed with the *changes* in the wind, so a door
  // that tracked the gust — sitting half open through a steady blow — would be the wrong object.
  let stillest = { g: 1, swing: 0 };
  let roughest = { g: 0, swing: 0 };
  for (let t = 0; t < 2000; t += 0.05) {
    const g = gustAt(t);
    const swing = Math.abs(swingAt(t));
    if (g < stillest.g) stillest = { g, swing };
    if (g > roughest.g) roughest = { g, swing };
  }
  assert.ok(stillest.swing < 0.1, `the doors are ${stillest.swing.toFixed(2)} open in dead air`);
  assert.ok(roughest.swing > 0.6, `the doors barely move at ${roughest.g.toFixed(2)} of wind`);
});

test('the square draws at every viewport and every corner of its panel', () => {
  // The strata multiply everything: a knob that coarsens the grid and a gust that coarsens it again
  // can between them ask for a chunk wider than the frame, and a band with no rows in it is where
  // a `NaN` gets in.
  const ids = meta.knobs.map((k) => k.id);
  for (const [W, H] of [[1440, 900], [390, 844], [1024, 400]]) {
    for (let mask = 0; mask < 1 << ids.length; mask += 1) {
      const knobs = makeKnobs(meta);
      ids.forEach((id, i) => { knobs[id] = (mask >> i) & 1; });
      const recorder = createRecordingContext({ width: W, height: H });
      const scene = create({ width: W, height: H, seed: meta.id, knobs });
      for (const t of [0, 47.3, 203]) scene.draw(recorder.ctx, t, 1 / 60);
      recorder.assertClean(`${W}×${H} at ${JSON.stringify(knobs)}`);
      assert.equal(recorder.depth, 0, 'unbalanced save/restore');
      assert.ok(recorder.paints > 30, `${W}×${H}: drew almost nothing`);
    }
  }
  // ...and the one knob that is *about* the strata has to widen the gap between them rather than
  // move the whole picture, which is what `grain` is for.
  assert.ok(bend(1, 0.25, 1, 1.9) > bend(0, 0.25, 1, 1.9) * 4, 'the strata knob barely spreads them');
});
