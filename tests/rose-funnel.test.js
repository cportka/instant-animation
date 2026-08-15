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
  // Bays run eaveL, eaveR, wall up each storey, and the last place is the spire.
  const last = BAYS - 1;
  assert.equal(pieceKindFor(0, last), 'eave');
  assert.equal(pieceKindFor(1, last), 'eave');
  assert.equal(pieceKindFor(2, last), 'wall');
  assert.equal(pieceKindFor(last, last), 'spire');

  // ...and each kind is drawn in that part's own colours and no other part's. A roof tile made of
  // timber is the bug this guards, and it is invisible in a still.
  const only = {
    eave: ['tileLit', 'tile', 'tileDark'],
    wall: ['postLit', 'post', 'bracket'],
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
    for (const bucket of MEND_BUCKETS) {
      assert.ok(mend[bucket].length % 4 === 0, `${kind}: ${bucket} is not whole x,y,w,h quads`);
      for (const v of mend[bucket]) assert.ok(Number.isFinite(v), `${kind}: ${bucket} holds a non-finite value`);
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
