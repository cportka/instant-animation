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
