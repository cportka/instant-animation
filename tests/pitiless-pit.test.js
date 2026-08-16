// The Pitiless Pit — the promises that are not visible in a frame.
//
// Two of these are claims the animation makes about *itself*: that it is 8-bit, which is a statement
// about how many colours reach the canvas rather than a mood; and that white is the eruption's alone,
// which is what makes the eruption an event rather than a brightening. Both would rot silently — a
// seventeenth colour added to a palette file looks like an improvement, and nothing anywhere would
// fail.
//
// The rest are about the **two clocks**, which are the whole architecture of the scene. Everything
// that descends is drawn from a flowed clock that stops during an eruption; everything about the
// eruption is drawn from wall time. If those ever disagree the picture does not break, it just
// quietly stops doing the one thing the brief asked for — "a complete stop to everything going down".

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../site/lib/rng.js';
import { createRecordingContext } from './helpers/recording-context.mjs';
import { create, meta } from '../site/scenes/pitiless-pit/index.js';
import { ERUPT, PERIOD, eruptionAt, flowAt, planClock, surgeAt } from '../site/scenes/pitiless-pit/clock.js';
import { MOUTH, U_EDGE, depthAt, edgeOf, pxAt, scaleAt } from '../site/scenes/pitiless-pit/layout.js';
import { WAYS, dissolveCell } from '../site/scenes/pitiless-pit/dissolve.js';
import { planDescent } from '../site/scenes/pitiless-pit/descent.js';
import { TEAR_SLIDE, corruptAt, tearAt } from '../site/scenes/pitiless-pit/glitch.js';
import { FALL, FLARE, GROUND, KERB, MOTE, SHAFT, STREAK } from '../site/scenes/pitiless-pit/palette.js';

const clock = () => planClock(createRng(meta.id));

/** The scene's plans in the order `create()` draws them, so the seeds line up. */
const plans = () => {
  const rng = createRng(meta.id);
  return { clock: planClock(rng), descent: planDescent(rng) };
};

const VIEWPORTS = [[1440, 900], [1920, 1080], [390, 844], [834, 1194]];

/** Draw one frame and hand back every fill colour and rectangle that reached the canvas. */
function frame(W, H, t) {
  const rec = createRecordingContext({ width: W, height: H });
  create({ width: W, height: H, seed: meta.id }).draw(rec.ctx, t, 1 / 60);
  rec.assertClean(`${W}x${H} at t=${t}`);
  const colours = new Set();
  const byColour = new Map();
  let colour = null;
  for (const op of rec.ops) {
    const set = /^set:fillStyle\((.*)\)$/.exec(op);
    if (set) {
      colour = set[1];
      colours.add(colour);
      continue;
    }
    const rect = /^(?:rect|fillRect)\((.*)\)$/.exec(op);
    if (rect) {
      if (!byColour.has(colour)) byColour.set(colour, []);
      byColour.get(colour).push(rect[1]);
    }
  }
  return { colours, byColour };
}

test('the pit is drawn in sixteen colours and never a seventeenth', () => {
  // 8-bit is a claim about arithmetic, and this is the arithmetic. Counted through the real draw
  // rather than by reading the palette file, because what matters is what reaches the canvas.
  const declared = new Set();
  for (const c of [GROUND, KERB, STREAK, MOTE, FLARE, ...SHAFT, ...FALL.flat()]) {
    declared.add(`rgba(${c[0]}, ${c[1]}, ${c[2]}, 1)`);
  }
  assert.equal(declared.size, 16, `the palette declares ${declared.size} colours, not sixteen`);

  const seen = new Set();
  for (const [W, H] of VIEWPORTS) {
    for (const t of [0, 3.5, 19, 41.5, 60, 73.5, 76, 79, 95, 120]) {
      for (const c of frame(W, H, t).colours) seen.add(c);
    }
  }
  for (const c of seen) {
    assert.ok(declared.has(c), `${c} reached the canvas and is not in the palette`);
  }
  assert.ok(seen.size <= 16, `${seen.size} colours reached the canvas`);
});

test('white belongs to the eruption and to nothing else', () => {
  // The palette's one rule. White is not the brightest thing in the picture — it is a colour the
  // picture has never contained, which is the whole of why the eruption lands as an event rather
  // than as the pit getting brighter. One structural colour creeping up to white would cost
  // nothing visually and take the entire effect with it.
  const white = `rgba(${FLARE[0]}, ${FLARE[1]}, ${FLARE[2]}, 1)`;
  const plan = clock();
  let quiet = 0;
  let loud = 0;
  for (let t = 0; t < 2.5 * PERIOD; t += 1.7) {
    const { colours } = frame(1440, 900, t);
    if (eruptionAt(t, plan).on) {
      if (colours.has(white)) loud += 1;
    } else {
      assert.ok(!colours.has(white), `white on the canvas at t=${t.toFixed(1)}, which is a quiet moment`);
      quiet += 1;
    }
  }
  assert.ok(quiet > 20, 'not enough quiet frames checked');
  assert.ok(loud > 3, 'the eruption never actually put any white on the canvas');
});

test('the flowed clock stops dead for an eruption and never for anything else', () => {
  // The scene's architecture in one assertion. `flowAt` runs at one second per second except while
  // the pit is erupting, when it does not run at all — and the freeze has to be *exactly* as wide
  // as the eruption, or things go on falling into a pit that has stopped taking them.
  const plan = clock();
  const step = 0.05;
  for (let t = 0; t < 4 * PERIOD; t += step) {
    const here = flowAt(t, plan);
    const next = flowAt(t + step, plan);
    const moved = next - here;
    assert.ok(moved >= -1e-9, `time ran backwards at t=${t.toFixed(2)}`);
    // Either it advanced by the full step, or it did not advance at all. Nothing in between —
    // an eruption that eased the flow to a halt would be a slow-down, not a stop.
    const erupting = eruptionAt(t, plan).on && eruptionAt(t + step, plan).on;
    if (erupting) {
      assert.ok(Math.abs(moved) < 1e-9, `the flow moved ${moved} during an eruption at t=${t.toFixed(2)}`);
    } else if (!eruptionAt(t, plan).on && !eruptionAt(t + step, plan).on) {
      assert.ok(Math.abs(moved - step) < 1e-9, `the flow moved ${moved} rather than ${step} at t=${t.toFixed(2)}`);
    }
  }
});

test('the flowed clock is continuous, so nothing ever jumps', () => {
  // Only the *derivative* is allowed to jump. If `flowAt` itself had a step in it — which is what
  // any "subtract the eruption once it is over" arithmetic gives you if it is written slightly
  // wrong — every block, line and mote in the picture would teleport at the instant the pit
  // resumed, which is the exact bug the second clock exists to make impossible.
  const plan = clock();
  const step = (t, eps) => flowAt(t + eps, plan) - flowAt(t - eps, plan);

  // Straddle the two instants per round where the derivative changes, rather than sweeping and
  // hoping to land on one. A sweep at any sane resolution walks straight past a discontinuity that
  // is one point wide — which is exactly what happened the first time this test was written, and it
  // passed against a `flowAt` that jumped by a full seven and a half seconds every round.
  for (let n = 0; n < 5; n += 1) {
    const opens = (n - plan.phase) * PERIOD;
    for (const edge of [opens, opens + ERUPT]) {
      const gap = step(edge, 1e-6);
      assert.ok(gap >= -1e-9 && gap < 1e-4,
        `the flow jumped by ${gap} across the boundary at t=${edge.toFixed(4)}`);
    }
  }

  for (let t = 0; t < 4 * PERIOD; t += 0.013) {
    const gap = step(t, 5e-5);
    assert.ok(gap >= -1e-9 && gap < 1e-3, `the flow jumped by ${gap} at t=${t.toFixed(3)}`);
  }
});

test('everything going down is frozen for the whole eruption', () => {
  // End to end, through the real draw: the things that fall in are the one part of the picture with
  // a position you can point at, so if the stop is working they are in the same place at the start
  // of an eruption and five seconds later.
  const plan = clock();
  let n = 0;
  while (!eruptionAt(n, plan).on) n += 0.25;
  const start = n + 0.3;
  const later = n + ERUPT - 1.2;
  assert.ok(eruptionAt(start, plan).on && eruptionAt(later, plan).on, 'both samples must be inside one eruption');

  const a = frame(1440, 900, start).byColour;
  const b = frame(1440, 900, later).byColour;
  let checked = 0;
  for (const hue of FALL) {
    for (const c of hue) {
      const key = `rgba(${c[0]}, ${c[1]}, ${c[2]}, 1)`;
      if (!a.has(key) && !b.has(key)) continue;
      assert.deepEqual(b.get(key) ?? [], a.get(key) ?? [],
        `the blocks in ${key} moved between t=${start.toFixed(2)} and t=${later.toFixed(2)}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'no blocks were on screen to check');
});

test('a corruption latches, and is over when it says it is', () => {
  // The difference between a fault and noise. A glitch that re-rolls every frame is a texture; one
  // that decides what is wrong with it *once* and holds that for the whole burst is something you
  // can watch happen. So `g` — which everything about a fault is hashed from — must be constant
  // across the burst and must change between bursts.
  let seen = 0;
  let lastG = null;
  for (let clock = 0; clock < 400; clock += 1 / 240) {
    const bad = corruptAt(clock, 0.37, 30, 0.6);
    if (!bad) continue;
    seen += 1;
    assert.ok(bad.age >= 0 && bad.age < 0.6, `age ${bad.age} outside the burst`);
    assert.ok(bad.at >= 0 && bad.at < 1, `at ${bad.at} outside 0..1`);
    if (lastG !== null && bad.g !== lastG) {
      // A new fault may only begin at the very start of its own burst.
      assert.ok(bad.age < 1 / 200, `fault ${bad.g} appeared already ${bad.age}s old`);
    }
    lastG = bad.g;
  }
  assert.ok(seen > 100, 'no corruptions in four hundred seconds of clock');
  // ...and it is occasional. A fault that is on more than it is off is a filter.
  const duty = seen / (400 * 240);
  assert.ok(duty > 0.01 && duty < 0.05, `corrupt ${(duty * 100).toFixed(1)}% of the time`);
});

test('the raster tear moves whole chunks and only sideways', () => {
  // It is a displacement, not a smear: an offset that is not a whole number of chunks would put the
  // torn band half a chunk off the grid, which is the one thing this scene may never do.
  for (const px of [4, 9, 11]) {
    for (let y = 0; y < 900; y += 3) {
      for (let t = 0; t < 8; t += 0.11) {
        const shift = tearAt(y, t, 900, TEAR_SLIDE, px);
        // `Math.abs` because a shift of exactly zero to the left is `-0`, and strict equality is
        // `Object.is`, which does not think that is zero.
        assert.equal(Math.abs(shift % px), 0, `a band slid ${shift}px, which is not a whole chunk of ${px}`);
        assert.ok(Math.abs(shift) <= TEAR_SLIDE * px, `a band slid ${shift}px, further than the tear reaches`);
      }
    }
  }
  // And at rest there is no tear at all — the strength is scaled by the surge, which is zero
  // outside an eruption, so a quiet frame is never displaced by a chunk.
  for (let y = 0; y < 900; y += 7) assert.equal(Math.abs(tearAt(y, 3.3, 900, 0, 9)), 0);
});

test('nothing is torn while the pit is quiet', () => {
  // The tear belongs to the eruption. If it leaked into an ordinary frame the pit would be a
  // permanently broken picture rather than one that breaks, and the eruption would stop being an
  // event — the same argument as white belonging to the eruption alone.
  // The tear only ever moves things **sideways**, so the property to check is not how many
  // rectangles a ring was drawn as — several rings share a colour, and slicing one into fifteen is
  // perfectly legal mid-eruption. It is that every one of them is still centred on the vanishing
  // point. A torn slice is displaced; an untorn ring cannot be.
  const plan = clock();
  const centred = (t) => {
    const { byColour } = frame(1440, 900, t);
    let off = 0;
    let total = 0;
    for (const step of SHAFT) {
      for (const r of byColour.get(`rgba(${step[0]}, ${step[1]}, ${step[2]}, 1)`) ?? []) {
        const [x, , w] = r.split(',').map(Number);
        total += 1;
        if (Math.abs(x + w / 2 - 720) > 9) off += 1;
      }
    }
    return { off, total };
  };

  let checked = 0;
  for (let t = 0; t < PERIOD * 2 && checked < 5; t += 3.1) {
    if (eruptionAt(t, plan).on) continue;
    const { off, total } = centred(t);
    assert.ok(total > 4, `only ${total} shaft rectangles at t=${t.toFixed(1)}`);
    assert.equal(off, 0, `${off} of ${total} shaft rectangles are displaced at t=${t.toFixed(1)}, a quiet moment`);
    checked += 1;
  }
  assert.equal(checked, 5, 'not enough quiet frames to check');

  // ...and mid-eruption it very much is torn, or the tear is not doing anything at all.
  let n = 0;
  while (!eruptionAt(n, plan).on) n += 0.25;
  let torn = 0;
  for (let a = 0.4; a < ERUPT - 1; a += 0.13) torn += centred(n + a).off > 0 ? 1 : 0;
  assert.ok(torn > 8, `the raster was only torn in ${torn} sampled frames of the eruption`);
});

test('the corruptions freeze with everything else they belong to', () => {
  // The faults on the fall run on the **flowed** clock, so when the pit stops taking, they stop
  // too. That is not a detail: a block frozen mid-air while its own torn row keeps sliding would
  // say the stop was cosmetic. Covered end to end by the frozen-blocks test above, which compares
  // the drawn positions of glitched sprites — this pins the reason.
  const plan = clock();
  let n = 0;
  while (!eruptionAt(n, plan).on) n += 0.25;
  const a = corruptAt(flowAt(n + 0.4, plan), 0.37, 30, 0.6);
  const b = corruptAt(flowAt(n + ERUPT - 0.6, plan), 0.37, 30, 0.6);
  assert.deepEqual(b, a, 'a corruption changed during a stop');
});

test('the surge rises, holds and is drawn back down', () => {
  assert.equal(surgeAt(-1), 0);
  assert.equal(surgeAt(0), 0);
  assert.equal(surgeAt(ERUPT), 0);
  assert.equal(surgeAt(ERUPT + 5), 0);
  let peak = 0;
  for (let age = 0; age < ERUPT; age += 0.01) {
    const s = surgeAt(age);
    assert.ok(s >= 0 && s <= 1, `surge ${s} at age ${age.toFixed(2)}`);
    peak = Math.max(peak, s);
  }
  assert.ok(peak > 0.999, 'the eruption never reaches full pressure');
  // Up fast and down slow: something bursting out and something settling back are not the same
  // shape, and a symmetrical envelope reads as a lamp on a dimmer.
  assert.ok(surgeAt(1) > surgeAt(ERUPT - 1), 'the eruption fades faster than it arrives');
});

test('the grid sharpens with depth and stops at one device pixel', () => {
  // The scene's one exception to its own coarseness. Above the mouth and at it, the grid is the
  // 8-bit grid; below, every band is finer than the one outside it — and it stops at exactly the
  // finest thing the display can draw, because there is nothing finer to reach for.
  for (const finest of [1, 0.5]) {
    assert.equal(pxAt(-3, 9, finest), 9, 'the ground is drawn on the ordinary grid');
    assert.equal(pxAt(0, 9, finest), 9, 'and so is the mouth');
    let last = 9;
    let floored = false;
    for (let u = 0.25; u < 60; u += 0.25) {
      const grid = pxAt(u, 9, finest);
      assert.ok(grid <= last + 1e-12, `the grid got coarser going down, at depth ${u}`);
      assert.ok(grid >= finest, `the grid went below one device pixel (${grid} < ${finest}) at depth ${u}`);
      if (grid === finest) floored = true;
      last = grid;
    }
    assert.ok(floored, `the grid never reached the display's own resolution (finest ${finest})`);
    // ...and it has to sharpen *faster* than the ring shrinks, or the pit merely stays as detailed
    // as it was rather than getting more so.
    assert.ok(pxAt(6, 9, finest) / 9 < scaleAt(6) / scaleAt(0), 'the grid is not outpacing perspective');
  }
});

test('the bottom of the pit is drawn at the display resolution', () => {
  // End to end, through the real draw, at two backing-store sizes — which is the only way to check
  // the claim that actually matters. The thing to assert is not that some rectangle is exactly one
  // device pixel wide: the innermost *ring* stops a couple of chunks across, so its width is a small
  // multiple of the grid rather than the grid itself. What has to be true is that the pit **goes
  // further when the display has more pixels to go on**, ends far finer than the 8-bit chunk it
  // started at, and does its sharpening down the hole rather than anywhere else.
  const deepest = (backing) => {
    const rec = createRecordingContext({ width: backing, height: backing * 0.625 });
    create({ width: 1440, height: 900, seed: meta.id }).draw(rec.ctx, 41.5, 1 / 60);
    rec.assertClean(`pit at a ${backing}px backing store`);
    let small = Infinity;
    let where = null;
    for (const op of rec.ops) {
      const m = /^fillRect\(([-\d.]+),([-\d.]+),([-\d.]+),/.exec(op);
      if (!m) continue;
      const size = Number(m[3]);
      if (size < small) {
        small = size;
        where = [Number(m[1]), Number(m[2])];
      }
    }
    return { small, where };
  };

  const px = 9;
  const retina = deepest(2880);
  const plain = deepest(1440);

  assert.ok(retina.small < plain.small,
    `the pit reached ${retina.small}px on a doubled backing store and ${plain.small}px on a plain one — it is ignoring the display`);
  assert.ok(retina.small <= px / 4,
    `the deepest thing drawn is ${retina.small}px against an ordinary chunk of ${px} — the pit barely sharpened`);
  // ...and the sharpening belongs to the bottom of the pit. A sub-chunk rectangle out on the ground
  // would mean the ramp had inverted and the coarse 8-bit grid was no longer the rule everywhere
  // else, which is the thing this exception is an exception *to*.
  assert.ok(Math.hypot(retina.where[0] - 720, retina.where[1] - 450) < 60,
    `the finest rectangle is at ${retina.where}, which is not the bottom of the pit`);
});

test('all seven ways of going are dealt, and every one of them finishes', () => {
  assert.equal(WAYS.length, 7);
  assert.equal(new Set(WAYS).size, 7, 'two of the ways have the same name');

  // Dealt round robin, so every way is on screen rather than merely implemented. A free draw from
  // seven leaves two or three of them unused on any given seed.
  const { blocks } = plans().descent;
  const dealt = new Set(blocks.map((b) => b.way));
  assert.equal(dealt.size, 7, `only ${dealt.size} of the seven ways were dealt to a block`);

  // ...and each one empties the sprite by the time it is done. The block stops being drawn at 1
  // whatever is left of it, so a way that only gets three quarters through ends in exactly the pop
  // these exist to remove — and a dissolution that is 80% finished looks finished in review. Four
  // of the seven were written that way first and this is what caught them.
  const out = [0, 0];
  for (const way of WAYS) {
    for (let seed = 0; seed < 64; seed += 1) {
      for (let col = 0; col < 4; col += 1) {
        for (let row = 0; row < 4; row += 1) {
          assert.equal(dissolveCell(way, col, row, 1, seed / 64, 0.6, 0.8, out), null,
            `${way} still has cells at the end of its dissolve`);
          // ...and nothing has happened yet before it starts.
          assert.notEqual(dissolveCell(way, col, row, 0, seed / 64, 0.6, 0.8, out), null,
            `${way} has already begun at zero`);
          // `Math.abs`, because a displacement of zero in the negative direction is `-0` and
          // strict equality is `Object.is`, which does not think that is zero.
          assert.equal(Math.abs(out[0]), 0, `${way} displaces a cell before the dissolve starts`);
          assert.equal(Math.abs(out[1]), 0, `${way} displaces a cell before the dissolve starts`);
        }
      }
    }
  }
});

test('the shaft is a geometric series, so it has no bottom', () => {
  // `scaleAt` and `depthAt` are exact inverses, which several things depend on — the eruption
  // launches particles at depths the shaft computed, and the descent wraps over a span the frame
  // decides. And the series never reaches zero: what stops the drawing is a ring becoming narrower
  // than one chunk, which is a fact about the screen and not about the pit.
  assert.ok(Math.abs(scaleAt(0) - MOUTH) < 1e-12, 'depth zero is the mouth');
  assert.ok(Math.abs(scaleAt(U_EDGE) - 1) < 1e-12, 'the frame edge is where the scale is one');
  for (const s of [1, 0.62, 0.3, 0.05, 0.004]) {
    assert.ok(Math.abs(scaleAt(depthAt(s)) - s) < 1e-12, `round trip failed at scale ${s}`);
  }
  let last = Infinity;
  for (let u = -5; u < 400; u += 0.5) {
    const s = scaleAt(u);
    assert.ok(s < last, `the shaft stopped shrinking at depth ${u}`);
    assert.ok(s > 0, `the shaft reached zero at depth ${u}`);
    last = s;
  }
});

test('a ring is the frame, and going round one is a closed walk', () => {
  // Every descent is a point at a fixed place around the ring, scaled. That only puts things on
  // straight rays converging on the vanishing point if the ring really is the frame's own
  // rectangle — and only enters from off-screen if the outermost one *is* the frame edge.
  const out = [0, 0];
  let prev = null;
  for (let p = 0; p <= 1.0001; p += 1 / 512) {
    edgeOf(p, out);
    const [x, y] = out;
    assert.ok(Math.abs(Math.max(Math.abs(x), Math.abs(y)) - 1) < 1e-12,
      `p=${p.toFixed(4)} lands at (${x}, ${y}), which is not on the unit frame`);
    if (prev) {
      // Continuous the whole way round, including across the corners and the seam at p=0.
      assert.ok(Math.hypot(x - prev[0], y - prev[1]) < 0.05, `the ring jumps at p=${p.toFixed(4)}`);
    }
    prev = [x, y];
  }
  edgeOf(0, out);
  const start = [out[0], out[1]];
  edgeOf(1, out);
  assert.deepEqual([out[0], out[1]], start, 'once round the ring must come back to where it began');
});
