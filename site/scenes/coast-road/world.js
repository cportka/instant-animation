// The world, and the one idea this animation is built on.
//
// **"Endless" is a promise about arithmetic, not about length.** A side-scroller is normally a
// machine that *steps*: spawn a car off the right edge, move everything left a bit, recycle
// whatever falls off the left. Every one of those verbs is a mutation, and this gallery forbids all
// of them — the render tests draw eight timestamps out of order, the stage hands a fresh instance
// somebody else's clock during a channel change, and the poster path asks for one frame at `t=39`
// having never drawn `t=0`. A scene that stepped would answer differently every time.
//
// So the road is not simulated, it is **addressed**. Ask what is at world position `x` and it
// answers without having visited anywhere else: which segment that is, whether a lamp stands there,
// whether a car sits in that cell and in which lane, how high the deck rides. Every one of those is
// a hash of an integer index, and the integer is `floor(x / pitch)`. Nothing is ever spawned and
// nothing is ever recycled, because everything is *already there*, at every `x`, at every `t`, and
// always has been. Drive for an hour and come back to the same mile and it is the same mile.
//
// The interesting consequence is in `traffic.js`: because the road is addressable, the rider's
// swerve does not have to be *remembered*. It is evaluated — three lane costs and a soft minimum,
// closed form, from the traffic that happens to be near. It looks like a decision and it is an
// arithmetic expression, which is the only kind of decision a pure function is allowed to make.

import { clamp } from '../../lib/draw.js';
import { hash01 } from '../../effects/pixel.js';

/* ----------------------------------------------------------------- units ---- */

// World units are roughly feet, and the numbers below are chosen against each other rather than
// against reality: a car is fourteen of them, the bike is seven, and a lamp goes by every thirty.

/** How fast the rider travels, in world units a second, before the throttle wobbles it. */
const SPEED = 46;

/** How much world fits across the frame, before the `pace` knob has its say. */
export const SPAN = 190;

/** The lattices. Each is a pitch, and an integer index into it is the address of a thing. */
export const CAR_PITCH = 32;
export const LAMP_PITCH = 30;
export const SEG_LEN = 340;
export const OVER_PITCH = 470;

/** The three lanes, as depth across the road band: 0 is the far side, 1 the near kerb. */
export const LANES = [0.1, 0.5, 0.9];

/**
 * How wide a vehicle is across the band, and how wide the bike is — the footprints that have to
 * stay apart. These are the vehicles' **road-plane** widths rather than their drawn heights: what a
 * car occupies in the depth direction is its track, not the box it is drawn as. A real lane is about
 * three and a half metres, a car about one and eight and a motorcycle about eight tenths, so a car and
 * a bike together take up **thirty-seven per cent** of one lane spacing. These keep exactly that
 * ratio against the 0.4 the lanes are apart, which is what makes the clearance a fact about traffic
 * rather than a number somebody liked. Drawn bodies overlap each other freely, as things at different
 * distances do; it is the footprints that must not.
 */
export const LANE_HALF = 0.103;
export const BIKE_HALF = 0.046;

/** How long the bike is, in world units — the other half of the same clearance. */
export const BIKE_LONG = 7;

/* --------------------------------------------------------------- travel ---- */

/**
 * The throttle: three slow waves the speed is modulated by, at periods with no common factor.
 *
 * A constant rate is a treadmill. You notice it in about fifteen seconds, and no amount of detail
 * in the scenery fixes it, because what gives a ride its life is that it is *being ridden* — the
 * throttle comes on out of a corner and eases off under a bridge.
 */
const THROTTLE = [
  { rate: 0.17, amp: 1.0, phase: 0.4 },
  { rate: 0.091, amp: 0.7, phase: 2.6 },
  { rate: 0.043, amp: 0.5, phase: 5.1 },
];

/**
 * How much of the speed the throttle is allowed to take away.
 *
 * **Strictly less than one, and the margin is the whole point.** Differentiate `travelAt` and you
 * get `SPEED · (1 + WOBBLE · Σ amp·sin ⁄ Σ amp)`, whose sum is bounded by one — so the travel is
 * increasing everywhere with at least `SPEED · (1 - WOBBLE)` to spare. At `WOBBLE = 1` the rider
 * would coast to a dead stop at the instant every wave pointed backwards, and a motorcycle that
 * comes to a stop in the middle of a highway has not eased off, it has crashed. The bound is the
 * difference between riding and stalling, so it is derived rather than chosen by ear.
 */
const WOBBLE = 0.35;

/** How far the rider has come at `t`, in world units. Strictly increasing, everywhere. */
export function travelAt(t) {
  let sum = 0;
  let scale = 0;
  for (const g of THROTTLE) {
    // ∫sin(rt + p) dt = −cos(rt + p)/r. The constant drops out: everything downstream is a place.
    sum += (g.amp * -Math.cos(t * g.rate + g.phase)) / g.rate;
    scale += g.amp;
  }
  return SPEED * (t + WOBBLE * (sum / scale));
}

/** How fast the rider is going at `t`, for the things that lean and stretch with it. */
export function paceAt(t) {
  let sum = 0;
  let scale = 0;
  for (const g of THROTTLE) {
    sum += g.amp * Math.sin(t * g.rate + g.phase);
    scale += g.amp;
  }
  return 1 + WOBBLE * (sum / scale);
}

/* -------------------------------------------------------------- segments ---- */

export const HIGHWAY = 0;
export const LOCAL = 1;
export const BRIDGE = 2;

/**
 * What kind of road segment `s` is. The brief asks for *highway changes to local road changes
 * back*, and this is the whole of that: a hash on the segment index, three kinds, no memory.
 *
 * The change itself is never drawn as a transition, and that is the part worth noticing. Nothing
 * cross-fades at a segment boundary, because the road is not what changes — the **objects** are.
 * Every lamp, barrier post, kerb stone and sign asks the world what kind of place it is standing in,
 * and answers for itself. So the boundary arrives the way it does from a saddle: the barrier runs
 * out, the last gantry goes over, and the street lamps start. It sweeps across the frame at exactly
 * the speed you are travelling, because that is what it is.
 */
export function kindOf(s) {
  const r = hash01(s * 3.71 + 11.2);
  return r < 0.44 ? HIGHWAY : r < 0.76 ? LOCAL : BRIDGE;
}

/** What kind of road is at world position `x`. */
export const kindAt = (x) => kindOf(Math.floor(x / SEG_LEN));

/**
 * How high the deck rides at `x`, in world units, above the ordinary grade. Bridges arc; nothing
 * else lifts.
 *
 * `sin²` over the segment, which is not decoration: it is zero **and flat** at both ends, so a
 * bridge segment meets its neighbours at their height with their slope whatever they happen to be.
 * Continuity across the boundary therefore needs no blending window and no lookahead — only the
 * segment `x` is actually in ever has to be evaluated, and the causeway still comes out of the
 * ground smoothly and goes back into it smoothly. An arc that did not flatten at its ends would
 * put a crease in the road at every abutment.
 */
export function riseAt(x, lift = 1) {
  const s = Math.floor(x / SEG_LEN);
  if (kindOf(s) !== BRIDGE) return 0;
  const u = x / SEG_LEN - s;
  return LIFT * lift * Math.sin(Math.PI * u) ** 2;
}

/** How far a causeway climbs at its crown, in world units. */
const LIFT = 26;

/* ------------------------------------------------------------ overpasses ---- */

/**
 * Where the next thing crossing overhead is, if there is one in this cell.
 *
 * Its own sparse lattice rather than a segment kind, because an overpass is something that happens
 * *to* a road rather than a kind of road — a highway can duck under one and so can a high street.
 */
export function overpassAt(n) {
  if (hash01(n * 7.13 + 2.9) > 0.62) return null;
  return {
    at: (n + 0.2 + hash01(n * 1.77) * 0.6) * OVER_PITCH,
    // A carriageway's worth across and about five metres of headroom, in the same units the road is
    // measured in. The first build had them forty units up and eighty across, which is a viaduct
    // through the middle of the sky rather than a road crossing over a road — and at that size the
    // near pier stops being something you flash past and becomes a wall down the middle of the frame.
    wide: 30 + hash01(n * 4.41) * 22,
    high: 13 + hash01(n * 9.07) * 4,
    piers: hash01(n * 2.33) < 0.62,
  };
}

/* ------------------------------------------------------------- the light ---- */

/** How tall a lamp stands, as a fraction of the pitch. Sets the angle the light arrives at. */
const LAMP_HIGH = 0.55;

/** Where lamp `n` stands, with a little wander so the row is not a ruler. */
export const lampXAt = (n) => (n + 0.5 + (hash01(n * 5.19) - 0.5) * 0.22) * LAMP_PITCH;

/**
 * How the passing lights fall on the rider at world position `x`.
 *
 * Everything shiny in this scene reads *this* — the gear, the tank, the chrome, the wet sheen on
 * the road — so that when a lamp goes by, every surface in the frame agrees about where it is. That
 * is the gallery's one-light rule with the light put in motion: there is still exactly one answer to
 * "where is the light", it just depends on where you are.
 *
 * The weight has **compact support** and that is a correctness requirement rather than a taste. Only
 * the five nearest lamps are summed, so an inverse-square weight would drop a lamp with a small but
 * non-zero contribution every thirty units and put a tick in the highlight forever. `(1 - d²/4)²`
 * reaches exactly zero at the edge of the window, so the lamp that leaves was already contributing
 * nothing and the sum is continuous in `x`.
 *
 * @returns {{bearing: number, strength: number}} bearing is −1 behind to +1 ahead
 */
export function lightAt(x) {
  const n0 = Math.round(x / LAMP_PITCH);
  let weight = 0;
  let bearing = 0;
  let glare = 0;
  for (let n = n0 - 2; n <= n0 + 2; n += 1) {
    const d = (lampXAt(n) - x) / LAMP_PITCH;
    const falloff = 1 - (d * d) / 4;
    if (falloff <= 0) continue;
    // A second, far narrower kernel — for how *hard* the light is, and for where it is coming from.
    // It has to be its own sum, and the reason is a small piece of arithmetic worth keeping:
    // a smooth kernel summed over a regular lattice is very nearly **constant** — which is what
    // makes the wide one a good weighted average and exactly what makes it useless as a pulse.
    // Sampled with it, the rider would be lit to precisely the same degree between two lamps as
    // directly beneath one, and the bearing would never leave a fifteenth of its range. Narrower
    // than the pitch, the sum finally has somewhere to fall to, and passing a lamp is an event.
    const sharp = falloff ** 20;
    glare += sharp;
    // The horizontal part of the direction to the lamp, which needs the lamp's *height* to mean
    // anything: a light thirty units ahead and sixteen up is nearly level with you, and the same
    // light two units ahead is nearly overhead. Straight `d` would say those were the same place.
    weight += sharp;
    bearing += sharp * (d / Math.hypot(d, LAMP_HIGH));
  }
  if (weight <= 0) return { bearing: 0, strength: 0 };
  return { bearing: clamp(bearing / weight, -1, 1), strength: clamp((glare - 0.42) * 1.7, 0, 1) };
}

/* --------------------------------------------------------------- camera ---- */

/**
 * The lens: how many world units the frame is wide, and therefore how many screen pixels a world
 * unit is worth.
 *
 * This is what the `pace` knob moves, and it moves it for a reason worth stating. The obvious knob
 * on a scrolling scene is the *speed*, and it is the one thing that cannot be touched: the world is
 * addressed off `travelAt(t)`, so scaling that by even a few per cent teleports the rider several
 * hundred units down the road the instant the knob is turned — at five minutes in, past a dozen
 * segments. Changing how much world is on screen gives the same apparent speed in pixels a second,
 * continuously, without the phase moving at all. The rider stays exactly where they were; the
 * camera comes in or pulls back.
 */
export const lensAt = (W, span) => W / span;

/** Everything decided once. There is very little of it, because the world is a function. */
export function planWorld(rng) {
  return { seed: rng.range(0, 90), sign: rng.range(0, 40) };
}
