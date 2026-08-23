// The All-Night Coast Road is the only animation here that has to make a *decision*, so what has to
// be tested is that the decision is always available, always safe, and always continuous.
//
// The scene's whole claim is that an endless side-scroller can be a pure function of `t`: nothing is
// spawned, nothing is recycled, and the rider's swerve around a van is evaluated rather than
// remembered. Three ways that goes wrong, none of them loudly:
//
//   - the road builds a stretch with no way through it, and the rider drives into a van;
//   - the lane chooser turns out to be bistable, and the bike **teleports** across the carriageway
//     between two frames a hundredth of a second apart;
//   - the arithmetic the guarantees rest on gets replaced by something that looks equivalent — a
//     smooth kernel for a flat-topped one, an inverse-square falloff for a compact one — and every
//     argument in `traffic.js` quietly stops holding while the picture still looks fine.
//
// All three are here, along with the geometry of a causeway and the fact that a motorcycle may not
// come to a stop in the middle of a highway.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bend, makeKnobs } from '../site/lib/knobs.js';
import { create, meta } from '../site/scenes/coast-road/index.js';
import {
  BIKE_HALF, BIKE_LONG, CAR_PITCH, LANE_HALF, LANES, SEG_LEN,
  kindAt, lightAt, riseAt, travelAt,
} from '../site/scenes/coast-road/world.js';
import { TRAFFIC, carAt, carX, costOf, lineAt } from '../site/scenes/coast-road/traffic.js';
import { createRecordingContext } from './helpers/recording-context.mjs';

/** How far apart a vehicle and the bike have to stay across the band, from their real widths. */
const CLEAR = LANE_HALF + BIKE_HALF;

/** The densities the `swarm` knob actually reaches, ends included. */
const DENSITIES = [bend(0, 0.18, 0.55, 1), bend(0.5, 0.18, 0.55, 1), bend(1, 0.18, 0.55, 1)];

test('the rider never stops, and never goes backwards', () => {
  // The travel is the integral of a wobbling throttle, and the wobble is bounded strictly below one
  // so the speed keeps a margin over zero everywhere. At exactly one the rider would coast to a dead
  // stop at the instant every wave pointed backwards — and a motorcycle that comes to rest in the
  // middle of a highway has not eased off, it has crashed.
  let least = Infinity;
  let last = travelAt(0);
  for (let t = 0.01; t < 3000; t += 0.01) {
    const now = travelAt(t);
    least = Math.min(least, (now - last) / 0.01);
    last = now;
  }
  assert.ok(least > 0, `the rider went backwards (${least.toFixed(3)} units a second)`);
  // ...and with real room to spare rather than by a whisker, which is what the bound is *for*.
  assert.ok(least > 12, `the rider all but stopped at ${least.toFixed(2)} units a second`);

  // And the clock is the clock: no knob may scale it. `travelAt` takes the time and nothing else,
  // which is the only way to be sure — a scaled clock moves the rider `t·Δrate` down the road the
  // instant the knob is touched, which at five minutes in is most of a mile.
  assert.equal(travelAt.length, 1, 'travelAt has grown a parameter — something is scaling the clock');
});

test('the road is built so that at most one lane is ever blocked', () => {
  // The guarantee everything else rests on. The cost kernel reaches two cell-pitches, so at most
  // three consecutive cells can matter; only every third cell may hold a vehicle; so at most one
  // vehicle is ever in play. Without it a rider in one outside lane can be required to reach the
  // other, and the only way across is the middle — which is the lane that was blocked.
  for (const density of [...DENSITIES, 1]) {
    for (let n = -4000; n < 4000; n += 1) {
      const here = carAt(n, density);
      if (!here) continue;
      assert.equal(carAt(n + 1, density), null, `cells ${n} and ${n + 1} both hold a vehicle`);
      assert.equal(carAt(n + 2, density), null, `cells ${n} and ${n + 2} both hold a vehicle`);
    }
  }
  // ...and the traffic must not be so sparse that the guarantee is vacuous.
  let carried = 0;
  for (let n = 0; n < 3000; n += 1) if (carAt(n, DENSITIES[1])) carried += 1;
  assert.ok(carried > 300, `only ${carried} of 3000 cells carry anything — there is no traffic`);
});

test('the cost kernel is flat-topped and reaches exactly two cell-pitches', () => {
  // Both properties are load-bearing and neither is obvious.
  //
  // **Compact support** is what bounds the decision to three consecutive cells; a kernel with a
  // tail, however small, makes the set of vehicles that can influence a choice unbounded and there
  // is then no argument at all about how many lanes can be blocked.
  //
  // **The flat top** is what keeps the rider clear for the whole pass. A smooth bump has its maximum
  // at a single point and is below it everywhere else — including across the entire stretch where
  // the bike and the vehicle overlap — so the rider is pushed hardest a moment *before* the danger
  // and is already drifting back as he draws level with it.
  assert.equal(costOf(-0.75), 0);
  assert.equal(costOf(1.75), 0);
  for (const d of [-3, -1.2, -0.76, 1.76, 2.4, 9]) assert.equal(costOf(d), 0, `costOf(${d}) is not zero`);
  // ...and the support stays under three cell-pitches, which is what keeps the window to three
  // consecutive cells and therefore to one vehicle. Wider and the guarantee above is not a fact.
  let first = Infinity;
  let last = -Infinity;
  for (let d = -6; d < 6; d += 0.005) {
    if (costOf(d) <= 0) continue;
    first = Math.min(first, d);
    last = Math.max(last, d);
  }
  const width = last - first;
  assert.ok(width < 2.76, `the kernel spans ${width.toFixed(2)} cells — the gap rule no longer bounds it`);
  assert.ok(width > 1.5, `the kernel spans only ${width.toFixed(2)} cells — there is no warning in it`);
  // Flat at one across everywhere the two bodies can overlap, with room either side.
  const overlap = (22 + BIKE_LONG) / 2 / CAR_PITCH;
  for (let d = -overlap; d <= overlap; d += 0.01) {
    assert.equal(costOf(d), 1, `costOf(${d.toFixed(2)}) is ${costOf(d)} while a bus is alongside`);
  }
  // ...and continuous, so a lane's cost never jumps and neither does the line that reads it.
  let jump = 0;
  let prev = costOf(-1);
  for (let d = -1; d < 2; d += 0.001) {
    const now = costOf(d);
    jump = Math.max(jump, Math.abs(now - prev));
    prev = now;
  }
  assert.ok(jump < 0.02, `the kernel steps by ${jump.toFixed(3)} — it is not continuous`);
});

test('the rider never rides through a vehicle, at any traffic density', () => {
  // The test the scene exists to pass. Twenty minutes of riding at each end of the `swarm` knob and
  // in the middle, checking every hundredth of a second whether the bike is inside something.
  for (const density of DENSITIES) {
    let worst = Infinity;
    for (let t = 0; t < 400; t += 0.01) {
      const x = travelAt(t);
      const lane = lineAt(t, density);
      const base = Math.floor((x - TRAFFIC * t) / CAR_PITCH);
      for (let n = base - 3; n <= base + 3; n += 1) {
        const car = carAt(n, density);
        if (!car) continue;
        if (Math.abs(carX(car, t) - x) >= (car.shape.long + BIKE_LONG) / 2) continue;
        worst = Math.min(worst, Math.abs(LANES[car.lane] - lane) - CLEAR);
      }
    }
    assert.ok(worst > 0, `at density ${density.toFixed(2)} the bike was ${(-worst).toFixed(3)} inside a vehicle`);
  }
});

test('the line is continuous: the bike never teleports across the carriageway', () => {
  // The failure the hysteresis was rebuilt around. A soft minimum sharp enough to commit is also
  // sharp enough to be **bistable** — two stable answers with a watershed between them — and a
  // rider with a strong memory of where he was does not drift across the road when the preference
  // flips, he jumps. It fires perhaps twice in forty minutes, which is twice too often, and every
  // other test in this file passes while it does.
  for (const density of DENSITIES) {
    let fastest = 0;
    let at = 0;
    let prev = lineAt(0, density);
    for (let t = 0.004; t < 400; t += 0.004) {
      const now = lineAt(t, density);
      const rate = Math.abs(now - prev) / 0.004;
      if (rate > fastest) {
        fastest = rate;
        at = t;
      }
      prev = now;
    }
    // A real lane change crosses the band in about a second. Anything past six is not a manoeuvre.
    assert.ok(fastest < 6, `the bike crossed at ${fastest.toFixed(1)} bands a second at ${at.toFixed(2)}s`);
  }
  // ...and it has to actually move, or "continuous" is being satisfied by a bike on a rail.
  let low = 1;
  let high = 0;
  for (let t = 0; t < 600; t += 0.05) {
    const lane = lineAt(t, DENSITIES[1]);
    low = Math.min(low, lane);
    high = Math.max(high, lane);
  }
  assert.ok(high - low > 0.3, `the rider only ever used ${(high - low).toFixed(2)} of the road`);
});

test('the causeway meets the ground at the ground', () => {
  // A bridge arcs over its own segment and its neighbours do not, so the two have to agree at the
  // boundary in **height and in slope**. `sin²` is zero and flat at both ends, which is why the
  // segment `x` is in is the only one that ever has to be evaluated. An arc that did not flatten
  // would put a crease in the road at every abutment, and the road is the one thing in a
  // side-scroller everybody has watched go by.
  for (const lift of [0.35, 1, 1.9]) {
    let jump = 0;
    let slope = 0;
    let tallest = 0;
    let prev = riseAt(-5000, lift);
    for (let x = -5000; x < 20000; x += 0.5) {
      const now = riseAt(x, lift);
      jump = Math.max(jump, Math.abs(now - prev));
      prev = now;
      tallest = Math.max(tallest, now);
    }
    // Loose enough to allow the causeway's own gradient, tight enough that a discontinuity — which
    // would be the whole lift, tens of units — cannot hide inside it.
    assert.ok(jump < 0.5, `the deck steps by ${jump.toFixed(3)} units in half a unit of road`);
    assert.ok(tallest > 8 * lift, `nothing ever rises: the tallest crossing is ${tallest.toFixed(1)}`);
    // Every boundary is at grade, whatever is on either side of it.
    for (let s = -12; s < 60; s += 1) {
      assert.equal(riseAt(s * SEG_LEN, lift), 0, `segment ${s} does not start at grade`);
      const step = riseAt(s * SEG_LEN + 0.25, lift) - riseAt(s * SEG_LEN, lift);
      slope = Math.max(slope, Math.abs(step));
    }
    assert.ok(slope < 0.02, `the deck leaves the abutment at a slope of ${slope.toFixed(4)}`);
  }
  // ...and all three kinds of road actually turn up, or the change of road is a change of nothing.
  const kinds = new Set();
  for (let x = 0; x < 200000; x += SEG_LEN * 0.5) kinds.add(kindAt(x));
  assert.equal(kinds.size, 3, `only ${kinds.size} kinds of road are ever built`);
});

test('the passing lights are continuous, and they actually pass', () => {
  // Everything shiny in this scene reads one function, so a step in it is a step in the gear, the
  // chrome, the tank and the wet road at once. Only the five nearest lamps are summed, so the
  // weight has to reach **exactly** zero at the edge of that window: an inverse-square falloff drops
  // a small but non-zero contribution every thirty units and puts a tick in the highlight forever.
  let jump = 0;
  let dark = 1;
  let bright = 0;
  let behind = 1;
  let ahead = -1;
  let prev = lightAt(0);
  for (let x = 0; x < 9000; x += 0.02) {
    const now = lightAt(x);
    jump = Math.max(jump, Math.abs(now.strength - prev.strength), Math.abs(now.bearing - prev.bearing));
    prev = now;
    dark = Math.min(dark, now.strength);
    bright = Math.max(bright, now.strength);
    behind = Math.min(behind, now.bearing);
    ahead = Math.max(ahead, now.bearing);
    assert.ok(now.strength >= 0 && now.strength <= 1, `a light of ${now.strength}`);
  }
  // The bound is set just above what the compact kernel actually does (0.0029), not at some round
  // number well clear of it — the whole failure being guarded is a *small* step repeating every
  // thirty units forever, and a loose threshold lets exactly that through while looking rigorous.
  assert.ok(jump < 0.006, `the light steps by ${jump.toFixed(4)} in a fiftieth of a unit`);
  // It has to be a *pulse*. A smooth kernel summed over a regular lattice is very nearly constant,
  // which makes a fine weighted average and a completely useless one for how hard the light is:
  // sampled with it the rider is lit exactly as much between two lamps as directly under one.
  assert.ok(dark < 0.1, `the darkest place on the road is still at ${dark.toFixed(2)} of full light`);
  assert.ok(bright > 0.9, `the brightest place on the road is only ${bright.toFixed(2)}`);
  // ...and it has to come from both sides, or the highlight never sweeps anywhere.
  assert.ok(behind < -0.3 && ahead > 0.3, `the light only ever arrives from ${behind.toFixed(2)}..${ahead.toFixed(2)}`);

  // The two kernels must genuinely be two. `strength` and `bearing` come from the same loop over the
  // same five lamps, and the temptation is to weight them the same way — which silently costs the
  // pulse, because a smooth kernel summed over a regular lattice is nearly constant. Sharing the
  // wide weight leaves `strength` pinned near one everywhere and nothing else in this file notices.
  const strengths = [];
  for (let x = 0; x < 400; x += 0.5) strengths.push(lightAt(x).strength);
  const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
  const spread = Math.sqrt(strengths.reduce((a, b) => a + (b - mean) ** 2, 0) / strengths.length);
  assert.ok(spread > 0.2, `the light barely varies (deviation ${spread.toFixed(3)}) — it is not a pulse`);
});

test('the road draws at every viewport and every corner of its panel', () => {
  // Six knobs multiply: a lens pulled all the way in, a chunk at twice its size and a skyline at
  // nearly twice its height can between them ask for geometry nothing was checked against.
  const ids = meta.knobs.map((k) => k.id);
  for (const [W, H] of [[1440, 900], [390, 844], [1024, 400]]) {
    for (let mask = 0; mask < 1 << ids.length; mask += 1) {
      const knobs = makeKnobs(meta);
      ids.forEach((id, i) => { knobs[id] = (mask >> i) & 1; });
      const recorder = createRecordingContext({ width: W, height: H });
      const scene = create({ width: W, height: H, seed: meta.id, knobs });
      for (const t of [0, 38.6, 214.5]) scene.draw(recorder.ctx, t, 1 / 60);
      recorder.assertClean(`${W}×${H} at ${JSON.stringify(knobs)}`);
      assert.equal(recorder.depth, 0, 'unbalanced save/restore');
      assert.ok(recorder.paints > 30, `${W}×${H}: drew almost nothing`);
    }
  }
  // The seed's one job: a different seed is a different mile of the same road, and the whole world
  // is downstream of that one number rather than of a lattice each having been told separately.
  const shot = (seed) => {
    const rec = createRecordingContext({ width: 1280, height: 720 });
    const scene = create({ width: 1280, height: 720, seed });
    for (const t of [12.5, 88.25]) scene.draw(rec.ctx, t, 1 / 60);
    return rec.ops.join('\n');
  };
  assert.notEqual(shot('coast-road'), shot('somewhere-else'), 'the seed does not reach the road');
  assert.equal(shot('coast-road'), shot('coast-road'), 'the same seed drew two different roads');
});
