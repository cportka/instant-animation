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
  FIX_AT, MEND_BUCKETS, emptyMend, errandOf, pieceKindFor, planHands, stampPiece, tendingAt,
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

test('the fix happens at the moment the piece leaves the hand', () => {
  // `FIX_AT` is the phase the hand is credited at, and it is also the phase the piece stops being
  // drawn. If they ever part company the temple heals a beat before or after anyone let go.
  assert.ok(FIX_AT > 0.62 && FIX_AT < 0.82, 'FIX_AT must fall inside the fixing leg of the circuit');
});
