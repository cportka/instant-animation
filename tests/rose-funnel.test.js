// The Rose Funnel's two correspondences.
//
// Both are things you can only check by *asking two parts of the scene the same question and
// comparing their answers*, which is exactly the kind of agreement that rots silently. The building
// and the labour never talk to each other — each computes from `t` alone — so nothing fails loudly
// when they drift apart; the temple just starts healing somewhere nobody is standing, and a hand
// starts carrying a roof tile to a wall. Both bugs shipped once already.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../site/lib/rng.js';
import { GOLD } from '../site/scenes/rose-funnel/palette.js';
import { create, meta } from '../site/scenes/rose-funnel/index.js';
import { planCycle } from '../site/scenes/rose-funnel/cycle.js';
import { planFunnel, vortexAt } from '../site/scenes/rose-funnel/funnel.js';
import { createRecordingContext } from './helpers/recording-context.mjs';
import {
  FIX_AT, MEND_BUCKETS, emptyMend, errandOf, pieceKindFor, planHands, stampPiece, swerveAt, tendingAt,
} from '../site/scenes/rose-funnel/hands.js';

const BAYS = 27;
const plan = () => planHands(createRng('rose-funnel'), BAYS);

test('every bay is exactly one spirit\'s responsibility', () => {
  const works = plan();
  const seen = new Map();
  for (const hand of works.hands) {
    for (const bay of hand.bays) {
      assert.ok(!seen.has(bay), `bay ${bay} is dealt to two spirits`);
      seen.set(bay, hand.key);
    }
  }
  for (let bay = 0; bay < BAYS; bay += 1) {
    assert.ok(seen.has(bay), `bay ${bay} is nobody's round, so it would never heal`);
    assert.equal(seen.get(bay), works.hands[bay % works.hands.length].key,
      `bay ${bay}: tendingAt looks up its mender by residue, so the shares must be dealt that way`);
  }
});

test('a bay is only ever credited to a spirit that is standing at it', () => {
  // The repair gate says a bay was mended at `doneAt`. At that instant the hand it names must be on
  // an errand to *that* bay — otherwise the building is healing where the labour is not.
  const works = plan();
  let checked = 0;
  for (let t = 40; t < 400; t += 0.25) {
    for (let bay = 0; bay < BAYS; bay += 1) {
      const { hand, doneAt } = tendingAt(works, bay, t);
      if (!Number.isFinite(doneAt) || Math.abs(doneAt - t) > 0.125) continue;
      assert.equal(errandOf(hand, t), bay,
        `t=${t.toFixed(2)}: bay ${bay} was mended while spirit ${hand.key} was at bay ${errandOf(hand, t)}`);
      checked += 1;
    }
  }
  assert.ok(checked > 50, `only ${checked} mends sampled — the window is too narrow to prove anything`);
});

test('a spirit carries a piece of the part it is going to mend', () => {
  // Bays run eaveL, eaveR, wall up each storey, and the last place is the spire. Every part takes two
  // materials, which is what keeps four benches busy: tile and bracket course for the roofs, timber
  // and lantern for the walls.
  const last = BAYS - 1;
  assert.equal(pieceKindFor(0, last), 'eave');
  assert.equal(pieceKindFor(1, last), 'bracket');
  assert.equal(pieceKindFor(2, last), 'wall');
  assert.equal(pieceKindFor(5, last), 'lantern');
  assert.equal(pieceKindFor(last, last), 'spire');

  // No craft may be starved. A pagoda is mostly roof, so mapping every eave to tile handed the kiln
  // two thirds of the errands and left the sawmill empty for most of a minute — which is a bench
  // nobody ever sees working.
  const share = {};
  for (let bay = 0; bay <= last; bay += 1) {
    const kind = pieceKindFor(bay, last);
    share[kind] = (share[kind] || 0) + 1;
  }
  for (const kind of ['eave', 'bracket', 'wall', 'lantern']) {
    assert.ok(share[kind] / (last + 1) > 0.1, `${kind} is only ${share[kind]} of ${last + 1} bays — its bench would stand idle`);
  }

  // ...and each **finished** kind is drawn in that part's own colours and no other part's. A roof
  // tile made of timber is the bug this guards, and it is invisible in a still. The half-made states
  // are deliberately allowed to glow gold, because that is what hot means.
  const only = {
    eave: ['tileLit', 'tile', 'tileDark'],
    bracket: ['bracket', 'gilt'],
    wall: ['postLit', 'post', 'bracket'],
    lantern: ['post', 'giltLit'],
    spire: ['gilt', 'giltLit'],
  };
  for (const [kind, allowed] of Object.entries(only)) {
    const mend = emptyMend();
    stampPiece(mend, kind, 100, 100, 4);
    const used = MEND_BUCKETS.filter((b) => mend[b].length > 0);
    assert.ok(used.length > 0, `${kind}: nothing was drawn, so the hand carries nothing`);
    for (const bucket of used) {
      assert.ok(allowed.includes(bucket), `${kind}: drawn into ${bucket}, which belongs to another part`);
    }
  }

  // And every stage of every craft puts *something* legible in the hand — an empty grip halfway
  // through making a thing is the "hands just wait and then have a piece" this round set out to fix.
  for (const kind of Object.keys(only)) {
    for (const made of [0, 0.2, 0.5, 0.8, 1]) {
      const mend = emptyMend();
      stampPiece(mend, kind, 100, 100, 4, 0, made);
      const cells = MEND_BUCKETS.reduce((n, b) => n + mend[b].length, 0);
      assert.ok(cells > 0, `${kind} at made=${made}: the hand is empty`);
      for (const bucket of MEND_BUCKETS) {
        assert.ok(mend[bucket].length % 4 === 0, `${kind}: ${bucket} is not whole x,y,w,h quads`);
        for (const v of mend[bucket]) assert.ok(Number.isFinite(v), `${kind}: ${bucket} holds a non-finite value`);
      }
    }
  }
});

test('the storm never teleports a spirit', () => {
  // Every position in this scene is recomputed from `t` alone with nothing carried between frames,
  // which means a discontinuity in the *formula* is a discontinuity on screen — there is no inertia
  // to hide behind. The flinch was `sign(gap) * dread² * wind * 1.5`, and it had both kinds:
  // unbounded (wind runs to ~900px near the mouth) and sign-flipping (at the axis). Hands crossed
  // the frame between frames, a hundred and twenty times a minute.
  //
  // So this is the shape contract, and it is the whole fix:
  for (const strength of [0.5, 0.675, 0.85, 1]) {
    // `Math.abs` because a signed zero is still zero, and `assert.equal` disagrees.
    assert.equal(Math.abs(swerveAt(0, strength)), 0, 'on the axis there is no "away", so there must be no push');
    for (const edge of [1, -1]) {
      assert.equal(Math.abs(swerveAt(edge, strength)), 0, 'at the edge of the field it must meet "no field" at zero');
      assert.equal(Math.abs(swerveAt(edge * 1.7, strength)), 0, 'and stay zero outside it');
    }

    let peak = 0;
    let worstSlope = 0;
    let prev = swerveAt(-1.4, strength);
    for (let s = -1.4; s <= 1.4; s += 0.001) {
      const v = swerveAt(s, strength);
      assert.ok(Number.isFinite(v), `swerveAt(${s}) is not finite`);
      peak = Math.max(peak, Math.abs(v));
      worstSlope = Math.max(worstSlope, Math.abs(v - prev));
      prev = v;
      // Odd, so the two sides of the column behave the same and neither is preferred.
      assert.ok(Math.abs(v + swerveAt(-s, strength)) < 1e-9, `swerveAt is not odd at ${s}`);
    }
    // Bounded: the caller multiplies by a reach capped at a twelfth of the frame, so a peak near 1
    // keeps the largest possible shove around a hundred pixels rather than fourteen hundred.
    assert.ok(peak < 1.2, `swerve peaks at ${peak.toFixed(2)} — too strong to stay on screen`);
    // Continuous: a thousandth of the field must not move a hand by a hundredth of the reach.
    assert.ok(worstSlope < 0.01, `swerve steps by ${worstSlope.toFixed(4)} over 0.001 of the field`);
  }

  // Outward through the middle, inward near the edge — the behaviour the shape has to keep.
  assert.ok(swerveAt(0.3, 1) > 0.2, 'a spirit half in the field should be thrown clear of it');
  assert.ok(swerveAt(0.9, 1) < 0, 'a spirit at the fringe should be tugged toward the column');
});

test('the fix happens at the moment the piece leaves the hand', () => {
  // `FIX_AT` is the phase the hand is credited at, and it is also the phase the piece stops being
  // drawn. If they ever part company the temple heals a beat before or after anyone let go.
  assert.ok(FIX_AT > 0.62 && FIX_AT < 0.82, 'FIX_AT must fall inside the fixing leg of the circuit');
});

/* --------------------------------------------------------- the two compositions ---- */

// The scene has two arrangements, and they differ by what is standing in front of the storm. The
// generic suite already checks that they render *differently*; these check that they differ in the
// three specific ways the composition blocks claim, because "differently" is satisfied by one chunk
// of one colour moving and would go on passing after any of them quietly stopped working.

const marching = meta.variants[0];
const alone = meta.variants[1];

test('the storey count is the whole temple, and zero of them is how it is removed', () => {
  // The second composition does not delete the building's parts one call at a time — it asks for a
  // building with nothing in it, and every population that depends on the temple sizes itself out
  // of existence from that one number. If this ever stops being true, removing the temple becomes a
  // list of things to remember, and the next thing added to the scene will be forgotten.
  const bays = (storeys) => planCycle(createRng('rose-funnel'), storeys).bays.length;
  assert.equal(bays(9), 9 * 3 + 1, 'nine storeys is three bays each and the sōrin');
  assert.equal(bays(0), 1, 'no storeys leaves only the sōrin, which is nothing to damage');
  assert.equal(marching.ground.storeys, 9);
  assert.equal(alone.ground.storeys, 0);
});

test('one composition marches and the other stands', () => {
  // "Centres the tornado" as a measurement rather than as an adjective: across four minutes the
  // storm's foot has to stay near the middle in one arrangement and cross most of the frame in the
  // other. Nearly still rather than pinned — a tornado nailed to the centre line is a diagram —
  // so the standing one is allowed to wander, just not far.
  const W = 1440;
  const H = 900;
  const spread = (storm) => {
    const plan = planFunnel(createRng('rose-funnel'), storm);
    let low = Infinity;
    let high = -Infinity;
    for (let t = 0; t < 240; t += 0.5) {
      const { cx } = vortexAt(W, H, t, plan, 0);
      low = Math.min(low, cx);
      high = Math.max(high, cx);
    }
    return { swing: (high - low) / W, off: Math.max(Math.abs(low - W / 2), Math.abs(high - W / 2)) / W };
  };

  const goes = spread(marching.storm);
  const stays = spread(alone.storm);
  const dead = spread({ ...alone.storm, march: 0 });
  assert.ok(goes.swing > 0.45, `the marching storm only crosses ${(goes.swing * 100).toFixed(0)}% of the frame`);
  assert.ok(stays.swing < goes.swing * 0.4, `the standing storm wanders ${(stays.swing * 100).toFixed(0)}% of the frame`);
  assert.ok(stays.off < 0.1, `the standing storm gets ${(stays.off * 100).toFixed(0)}% of the frame from centre`);
  // Nearly still rather than *pinned*, and the difference has to be measurable or it is a comment.
  // A tornado with the march taken all the way out still leans and snakes, so it is never literally
  // motionless — the claim is that this composition keeps a march, and the way to check that is to
  // ask the same plan with the march removed and find it wanders visibly less.
  assert.ok(
    stays.swing > dead.swing * 1.15,
    `the standing storm swings ${(stays.swing * 100).toFixed(1)}% against ${(dead.swing * 100).toFixed(1)}% with no march at all — it is pinned to the centre line, which is a diagram`,
  );
});

test('the standing column is wider, because nothing else is left to give it a scale', () => {
  // With the temple gone there is nothing in frame to measure the storm against but the frame, so a
  // funnel left the same width reads as smaller. The widening is the composition's, not the clock's:
  // asked at the same instant, one has to be wider than the other by the declared factor.
  const wide = planFunnel(createRng('rose-funnel'), alone.storm);
  const plain = planFunnel(createRng('rose-funnel'), marching.storm);
  const want = alone.storm.size / marching.storm.size;
  assert.ok(want > 1.05, 'the second composition declares no widening at all');
  for (let t = 0; t < 90; t += 3) {
    for (const up of [0.15, 0.5, 0.9]) {
      const ratio = vortexAt(1440, 900, t, wide, up).r / vortexAt(1440, 900, t, plain, up).r;
      assert.ok(
        Math.abs(ratio - want) < 1e-9,
        `at t=${t}, up=${up} the column is ${ratio.toFixed(3)}× the marching storm rather than ${want}`,
      );
    }
  }
});

test('nothing of the temple reaches the frame in the second composition', () => {
  // The darkest gold is the joinery — the temple's brackets, and the gilt a spirit carries back up
  // to mend one. Nothing else in the scene draws with it: the storm has no gold, the house's lamps
  // are two steps brighter, and the sky's cold lobes walk the lapis ramp rather than this one. So it
  // is the one question that can be asked from outside: *is the building there.* It has to be in
  // every frame of the first arrangement — the plinth's bracket course is structural, so the temple
  // is always standing however damaged — and in none of the second.
  const fillOf = ([r, g, b]) => `set:fillStyle(rgba(${r}, ${g}, ${b}, 1))`;
  const joinery = fillOf(GOLD[3]);
  const lamplight = fillOf(GOLD[1]);
  const paints = (variant, t) => {
    const recorder = createRecordingContext({ width: 1280, height: 800 });
    const scene = create({ width: 1280, height: 800, seed: meta.id, variant });
    scene.draw(recorder.ctx, t, 1 / 60);
    return recorder.ops;
  };

  for (const t of [0, 7.3, 11.6, 40, 96.5]) {
    const withTemple = paints(marching, t);
    const without = paints(alone, t);
    assert.ok(withTemple.includes(joinery), `t=${t}: the temple is missing from the composition that has one`);
    assert.ok(!without.includes(joinery), `t=${t}: the temple is still being drawn in the composition that removed it`);
    // ...and the little house is still standing, which is what makes this a re-composition rather
    // than a deletion. Lamplight is drawn by the house and by the workshops out on the treeline and
    // by nothing else that survives the change, so finding it in the arrangement with no temple in
    // it means the storm still has a landscape — and one thing in frame with a known size — to be
    // too big for. A storm alone on an empty plain has nothing to be measured against at all.
    assert.ok(without.includes(lamplight), `t=${t}: the second composition kept nothing but the storm`);
  }
});
