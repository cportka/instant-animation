// The Long Cut keeps four promises that nothing else in the suite can see it break.
//
// Three of them are about the **one-bit claim**, which is unusual among this gallery's scenes in
// being a property of the output rather than a style laid over it: the frame contains `#000000` and
// `#ffffff` and no third value, at any device pixel ratio. Nothing about that fails loudly. A
// coordinate snapped to whole CSS pixels instead of whole device pixels looks perfect at 1× and 2×
// and puts a grey seam down every edge at 1.5×; a shape handed to the canvas as a path instead of as
// cells is anti-aliased everywhere and still renders a picture you would have to look closely at to
// doubt. The scene would go on looking almost right while its entire premise was gone.
//
// The fourth is about **leaving**. A slice is culled at a fixed depth, and if it is still on the
// frame at that depth it does not travel out of shot, it blinks — which the first build did, on a
// beat, in the middle of the picture, and which no render test would ever notice.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cellFor, finestOf, scanFill } from '../site/effects/onebit.js';
import { create, meta } from '../site/scenes/long-cut/index.js';
import { SIDES, boreAt, sectionAt } from '../site/scenes/long-cut/solid.js';
import { BRINK, placeAt, trainAt } from '../site/scenes/long-cut/train.js';
import { createRecordingContext } from './helpers/recording-context.mjs';

const VIEWS = [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 390, height: 844, label: 'phone portrait' },
  { width: 1024, height: 400, label: 'wide and short' },
  { width: 800, height: 800, label: 'square' },
];

const TIMES = [0, 1.3, 6.4, 17.9, 33.2, 61.25, 140.5];

/** A recording context that admits to being drawn at `dpr`, the way the real stage would be. */
function at(view, dpr = 1) {
  return createRecordingContext({ width: view.width * dpr, height: view.height * dpr });
}

const shoot = (view, dpr, times = TIMES) => {
  const rec = at(view, dpr);
  const scene = create({ width: view.width, height: view.height, seed: meta.id });
  for (const t of times) scene.draw(rec.ctx, t, 1 / 60);
  return rec;
};

test('the frame is two colours and there is no third', () => {
  // The claim the whole scene is built on. Not "a restrained palette" — *two*, and any grey at all
  // means the rasteriser has been bypassed somewhere and the canvas is anti-aliasing again.
  const used = new Set();
  for (const view of VIEWS) {
    for (const op of shoot(view, 2).ops) {
      if (op.startsWith('set:fillStyle')) used.add(op.slice('set:fillStyle('.length, -1));
      assert.ok(!op.startsWith('set:strokeStyle'), 'nothing here is stroked — a stroke is a soft edge');
      assert.ok(!op.startsWith('set:globalAlpha'), 'a partial alpha is a third colour by another name');
    }
  }
  assert.deepEqual([...used].sort(), ['#000000', '#ffffff'], `the scene painted ${[...used].join(', ')}`);
});

test('nothing is drawn off the device pixel grid, at any ratio', () => {
  // Snapping to whole *CSS* pixels is the plausible version of this and it is wrong: at 1.5× a
  // CSS-integer edge lands halfway through a hardware pixel and the browser resolves that the only
  // way it can, with a grey. Every rectangle the scene emits must land on a whole device pixel at
  // every ratio a display might hand it, which is what makes "two colours" true of the *output*.
  for (const dpr of [1, 1.5, 2, 3]) {
    for (const view of VIEWS) {
      const rec = shoot(view, dpr, [12.5, 44.7]);
      let checked = 0;
      for (const op of rec.ops) {
        const match = /^(?:rect|fillRect)\(([^)]*)\)$/.exec(op);
        if (!match) continue;
        for (const value of match[1].split(',').map(Number)) {
          const device = value * dpr;
          // The slack is the recorder's, not the scene's: it rounds every coordinate to four
          // decimals so two runs can be compared, and a third of a pixel does not survive that.
          // Half a device pixel — the thing this is looking for — is four orders of magnitude bigger.
          assert.ok(
            Math.abs(device - Math.round(device)) < 1e-3,
            `${view.label} @${dpr}×: ${value} CSS px is ${device} device px — a half-covered pixel is a grey`,
          );
        }
        checked += 1;
      }
      assert.ok(checked > 400, `${view.label} @${dpr}×: only ${checked} rectangles to check`);
    }
  }
});

test('the cell is a whole number of device pixels, however coarse it was asked to be', () => {
  // The other half of the same argument, at the source. `cellFor` is asked for a coarseness and must
  // answer with something the hardware can actually draw an edge on.
  for (const dpr of [1, 1.25, 1.5, 2, 2.75, 3]) {
    for (const view of VIEWS) {
      const ctx = at(view, dpr).ctx;
      const finest = finestOf(ctx, view.width);
      assert.ok(Math.abs(finest * dpr - 1) < 1e-9, `finestOf is wrong at ${dpr}×`);
      for (const across of [40, 90, 140, 300, 4000]) {
        const cell = cellFor(ctx, view.width, view.height, across);
        assert.ok(cell > 0, `cell collapsed at ${across} across`);
        const steps = cell / finest;
        assert.ok(
          Math.abs(steps - Math.round(steps)) < 1e-9 && Math.round(steps) >= 1,
          `${view.label} @${dpr}×: a cell of ${cell} is ${steps} device pixels`,
        );
      }
    }
  }
});

test('scanFill fills exactly the cells whose centres are inside the shape', () => {
  // The rasteriser, checked against the definition of the rule it claims to implement. Every other
  // test in this file is downstream of this one being true.
  // Deliberately off the whole numbers. On a tidy polygon an edge crossing lands *exactly* on a cell
  // centre and the answer there is a coin toss between two equally defensible conventions — which is
  // a fact about ties, not about the rasteriser, and testing it would only pin down an accident.
  const outer = new Float64Array([
    60.31, 20.17, 175.31, 55.17, 120.31, 96.17, 190.31, 150.17, 96.31, 185.17, 22.31, 140.17, 44.31, 88.17,
  ]);
  const bore = new Float64Array([84.31, 74.17, 128.31, 82.17, 138.31, 118.17, 100.31, 140.17, 70.31, 116.17]);
  const inside = (rings, x, y) => {
    let crossings = 0;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const j = i + 2 < ring.length ? i + 2 : 0;
        const ay = ring[i + 1];
        const by = ring[j + 1];
        if ((ay <= y) === (by <= y)) continue;
        if (ring[i] + ((y - ay) / (by - ay)) * (ring[j] - ring[i]) > x) crossings += 1;
      }
    }
    return crossings % 2 === 1;
  };

  for (const rings of [[outer], [outer, bore]]) {
    for (const cell of [1, 3, 4, 7]) {
      const rec = createRecordingContext({ width: 220, height: 210 });
      scanFill(rec.ctx, rings, cell, 220, 210);
      const painted = new Set();
      for (const op of rec.ops) {
        const [x, y, w, h] = /^rect\(([^)]*)\)$/.exec(op)[1].split(',').map(Number);
        assert.equal(h, cell, 'a run is always exactly one row tall');
        for (let c = 0; c < Math.round(w / cell); c += 1) {
          const key = `${Math.round(x / cell) + c},${Math.round(y / cell)}`;
          assert.ok(!painted.has(key), `cell ${key} was covered twice — the spans overlap`);
          painted.add(key);
        }
      }
      for (let row = 0; row * cell < 210; row += 1) {
        for (let col = 0; col * cell < 220; col += 1) {
          const want = inside(rings, (col + 0.5) * cell, (row + 0.5) * cell);
          assert.equal(
            painted.has(`${col},${row}`),
            want,
            `${rings.length} ring(s), cell ${cell}: cell ${col},${row} should${want ? '' : ' not'} be filled`,
          );
        }
      }
      // ...and the hole is genuinely a hole, rather than the outline of one drawn over a solid.
      if (rings.length === 2) assert.ok(!painted.has(`${Math.round(105 / cell)},${Math.round(105 / cell)}`));
    }
  }
});

test('the bore never escapes the section it is cut through', () => {
  // Even-odd gets a hole for free and gives no warning when the hole stops being inside anything:
  // a bore corner crossing a short side of the section turns into a solid lobe hanging off the
  // edge. The scene's defence is that every bore vertex is pulled in along the ray to the section
  // vertex it shares a direction with — so the check is that nothing on the bore, vertices or the
  // edges between them, is ever outside.
  const section = new Float64Array(SIDES * 2);
  const bore = new Float64Array(SIDES * 2);
  const within = (poly, x, y) => {
    let crossings = 0;
    for (let i = 0; i < poly.length; i += 2) {
      const j = i + 2 < poly.length ? i + 2 : 0;
      const ay = poly[i + 1];
      const by = poly[j + 1];
      if ((ay <= y) === (by <= y)) continue;
      if (poly[i] + ((y - ay) / (by - ay)) * (poly[j] - poly[i]) > x) crossings += 1;
    }
    return crossings % 2 === 1;
  };

  for (let k = -60; k < 260; k += 0.25) {
    sectionAt(k, section);
    boreAt(k, section, bore);
    for (let i = 0; i < SIDES * 2; i += 2) {
      const j = i + 2 < SIDES * 2 ? i + 2 : 0;
      for (const [x, y] of [
        [bore[i], bore[i + 1]],
        [(bore[i] + bore[j]) / 2, (bore[i + 1] + bore[j + 1]) / 2],
      ]) {
        assert.ok(within(section, x, y), `slice ${k}: the bore crosses the section at ${x}, ${y}`);
      }
    }
  }
});

test('a slice paints nothing by the time it is culled', () => {
  // The one bug in this scene that reads as broken software rather than as a choice. A slice stops
  // being drawn at exactly `BRINK`; if it is still putting cells on the frame then, it does not
  // leave, it vanishes — on the beat, at whatever size it happened to be.
  //
  // Asked of the rasteriser rather than of a bounding box, because that is the question: not "has
  // the shape's box left the window" but "was anything still being painted". The departure is a race
  // between the fall and the section's own width — the drift has to carry a slice's centre further
  // from the axis than the widest section is wide, or there is no depth at which it is gone at all.
  const section = new Float64Array(SIDES * 2);
  const outer = new Float64Array(SIDES * 2);
  const bore = new Float64Array(SIDES * 2);
  const at3 = [0, 0, 0];

  for (const view of VIEWS) {
    const rec = at(view, 2);
    const cell = cellFor(rec.ctx, view.width, view.height, 140);
    for (let k = 0; k < 500; k += 1) {
      placeAt(k, BRINK, view.width, view.height, at3);
      sectionAt(k, section);
      boreAt(k, section, bore);
      for (let i = 0; i < SIDES * 2; i += 2) {
        outer[i] = at3[0] + section[i] * at3[2];
        outer[i + 1] = at3[1] + section[i + 1] * at3[2];
        bore[i] = at3[0] + bore[i] * at3[2];
        bore[i + 1] = at3[1] + bore[i + 1] * at3[2];
      }
      const painted = scanFill(rec.ctx, [outer, bore], cell, view.width, view.height);
      assert.equal(
        painted,
        0,
        `${view.label}: slice ${k} still paints ${painted} runs at the moment it is culled — ` +
          'it blinks out instead of leaving',
      );
    }
  }
});

test('the fall lands on the same place in the frame whatever shape the frame is', () => {
  // Sizes are in world units against the short edge; the *path* is a composition and has to be about
  // the window. Aimed in a fixed world direction the fall runs off the right of a wide frame with
  // the bottom half left empty, and off the bottom of a tall one with the right-hand side empty —
  // both were true of the first build and both looked like a mistake rather than a composition.
  //
  // Stretched by the aspect, the two cancel exactly: the horizontal reach is `0.62 · REACH · scale`
  // of the *frame's* width and the vertical is `0.80 · REACH · scale` of its height, in every window
  // regardless of shape. So the invariant is not that a wide frame is crossed the long way — it is
  // that every frame is crossed the *same* way, and the trajectory ends past the same corner.
  const at3 = [0, 0, 0];
  const where = (width, height, depth) => {
    placeAt(0, depth, width, height, at3);
    return [at3[0] / width, at3[1] / height];
  };

  const shapes = [[1600, 700], [420, 900], [800, 800], [1440, 900]];
  // Sampled where a slice is large and still in shot, which is where the composition is decided.
  const [refX, refY] = where(...shapes[0], 0);
  for (const [width, height] of shapes) {
    const [x, y] = where(width, height, 0);
    // Not exact, and the slack is one specific term: the axis's own wander is in world units — it
    // is a property of the solid, not of the window — so it is a larger fraction of a narrow frame
    // than of a wide one. Without the aspect stretch the spread here is five times this.
    assert.ok(
      Math.abs(x - refX) < 0.09 && Math.abs(y - refY) < 0.09,
      `${width}×${height} puts a near slice at ${x.toFixed(3)}, ${y.toFixed(3)} of the frame ` +
        `rather than near ${refX.toFixed(3)}, ${refY.toFixed(3)}`,
    );
    // ...and by the end it is past the corner rather than parked inside it, whatever the shape.
    const [outX, outY] = where(width, height, BRINK);
    assert.ok(outX > 1 && outY > 1, `${width}×${height}: the fall stops inside the frame (${outX}, ${outY})`);
  }
});

test('every slice on screen is painted, and the two colours alternate down the train', () => {
  // Two things at once, because they are the same walk. Nothing on screen may be skipped — a slice
  // too small to catch a cell centre still has to leave its one cell, or the far end of the train
  // blinks instead of receding. And the polarity must alternate: it is the only thing separating one
  // section from the next, and a train drawn all in one colour is a silhouette, not a stack.
  const section = new Float64Array(SIDES * 2);
  const at3 = [0, 0, 0];

  for (const view of VIEWS) {
    for (const t of TIMES) {
      const { travel, near, far } = trainAt(t);
      let onScreen = 0;
      for (let k = far; k >= near; k -= 1) {
        placeAt(k, k - travel, view.width, view.height, at3);
        sectionAt(k, section);
        let reach = 0;
        for (let i = 0; i < SIDES * 2; i += 2) reach = Math.max(reach, Math.hypot(section[i], section[i + 1]));
        const r = reach * at3[2];
        if (at3[0] + r > 0 && at3[0] - r < view.width && at3[1] + r > 0 && at3[1] - r < view.height) {
          onScreen += 1;
        }
      }
      assert.ok(onScreen > 6, `${view.label} @ ${t}s: only ${onScreen} slices are on screen at all`);

      const rec = at(view, 2);
      create({ width: view.width, height: view.height, seed: meta.id }).draw(rec.ctx, t, 1 / 60);
      const fills = rec.ops.filter((op) => op === 'fill()').length;
      assert.ok(
        fills >= onScreen,
        `${view.label} @ ${t}s: ${onScreen} slices are on screen but only ${fills} were painted`,
      );

      // Every drawn slice sets two colours — its keyline, then its body — so after the one that
      // paints the field they come in pairs. Within a pair they must differ, or the keyline is
      // invisible and a slice on the black field has no edge; and the *bodies* must alternate down
      // the train, which is the only thing telling one section from the next.
      const colours = rec.ops.filter((op) => op.startsWith('set:fillStyle')).slice(1);
      assert.equal(colours.length % 2, 0, `${view.label} @ ${t}s: a slice set an odd number of colours`);
      let previous = null;
      for (let i = 0; i < colours.length; i += 2) {
        assert.notEqual(colours[i], colours[i + 1], `${view.label} @ ${t}s: a slice is the colour of its own keyline`);
        if (previous !== null) {
          assert.notEqual(colours[i + 1], previous, `${view.label} @ ${t}s: two slices in a row share a colour`);
        }
        previous = colours[i + 1];
      }
    }
  }
});
