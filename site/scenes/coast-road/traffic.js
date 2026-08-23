// The traffic, and the rider's way through it.
//
// This is the file the whole scene was designed around. The brief asks for a rider going *around
// occasional vehicles*, and going around something is a **decision** — which is the one thing a pure
// function of `t` is not obviously allowed to make. There is no memory here to hold an intention in
// and no previous frame to have started a manoeuvre on. So the swerve is not remembered, it is
// **evaluated**: three lane costs and a soft minimum, in closed form, from whatever traffic happens
// to be near. It looks like a rider picking a gap because picking a gap is what the arithmetic does.
//
// Two things make that safe rather than merely plausible, and both are derived rather than tuned.

import { smoothstep } from '../../lib/draw.js';
import { chunk, ditherGlow, hash01, snap } from '../../effects/pixel.js';
import { CAR_PITCH, LANES, LOCAL, kindAt, travelAt } from './world.js';
import { lz, ly, smear, sx } from './road.js';

/** How fast the traffic moves, in world units a second. The rider does about a hundred and forty. */
export const TRAFFIC = 58;

/**
 * **The gap rule: only every third cell of the lattice may hold a vehicle at all.**
 *
 * This is the guarantee the rest of the file is built on, and it is worth being exact about what it
 * buys, because a weaker version of it was not enough.
 *
 * The cost kernel below has compact support two and a half cell-pitches wide, and the vehicles'
 * within-cell offsets are bounded, so the set of cells that can contribute to a decision is at most
 * **three consecutive** ones. Exactly one integer in any three is divisible by three. Therefore at
 * most **one vehicle** is ever in play, and therefore at most **one lane is ever blocked**.
 *
 * That last sentence is the whole thing. With two lanes blocked, a rider in one outside lane can be
 * required to reach the other, and the only way across is through the middle — which was the blocked
 * one. There is no continuous path from lane 0 to lane 2 that avoids lane 1, so no amount of
 * cleverness in the chooser can help: the road has to not ask. With one lane blocked, every lane the
 * rider might move to is free, the move is always to an *adjacent* lane, and the question never
 * arises. The safety is a property of how the road is built rather than of how well the rider rides.
 *
 * It costs two thirds of the possible traffic, which turns out to be the brief anyway — *occasional*
 * vehicles — and one modulo.
 */
const GAP_PHASE = 0;

/** The kinds on the road, as proportions of a car. */
/**
 * The kinds on the road, as proportions of a car.
 *
 * `roof` is how much of the height is cabin and `box` how much of the *width* that cabin takes. Both
 * are needed: with only the first, a van — which is nearly all cabin — comes out as a narrow tall
 * box balanced on a thin wide bar, because the cabin kept a saloon's setback. Seen from behind, what
 * distinguishes the kinds is exactly how much the greenhouse overhangs the body.
 */
const KINDS = [
  // A saloon: wide body, a cabin set well in from both sides, a big rear screen.
  { long: 13.5, tall: 5.4, roof: 0.4, box: 0.62, glass: 0.72, wheels: 1, doors: 0, cab: 0 },
  // A box van: the cabin *is* the vehicle, its back is a pair of doors and there is no glass in it,
  // and the cab pokes up beyond the box at the front. Take those away and it is a tall saloon.
  { long: 16.5, tall: 7.6, roof: 0.78, box: 0.94, glass: 0.3, wheels: 1, doors: 1, cab: 0.42 },
  // A pickup: a small cab at the front and an open bed behind it, so the silhouette has a step in it
  // — which is the only thing that tells one apart from a saloon at this size.
  { long: 15.5, tall: 5.8, roof: 0.46, box: 0.44, glass: 0.66, wheels: 1, doors: 0, cab: 0 },
  // A truck: a long box on twin rear axles, its cab well up over the front of it.
  { long: 22, tall: 9, roof: 0.82, box: 0.96, glass: 0.24, wheels: 2, doors: 1, cab: 0.5 },
];

/**
 * What is in cell `n`, or null. A pure function of the index and the density — no spawning, no
 * recycling, no list. The cell has always contained this and always will.
 */
export function carAt(n, density) {
  if (((n % 3) + 3) % 3 !== GAP_PHASE) return null;
  if (hash01(n * 2.71 + 4.4) > density) return null;
  const shape = KINDS[Math.floor(hash01(n * 6.53) * KINDS.length) % KINDS.length];
  return {
    n,
    // The offset is bounded, and the bound is load-bearing: it is what keeps the cost window down
    // to three consecutive cells and therefore what keeps the gap rule meaning anything.
    off: (hash01(n * 1.93) - 0.5) * 0.24,
    lane: Math.floor(hash01(n * 8.31) * LANES.length) % LANES.length,
    tone: Math.floor(hash01(n * 3.17) * 6),
    shape,
  };
}

/**
 * Where that vehicle is at `t`.
 *
 * **Every lane moves at the same speed**, and that is the second guarantee. Giving the lanes
 * different speeds is the obvious realism and it quietly destroys the first one: two vehicles from
 * cells far apart drift into line with each other, the "three consecutive cells" bound stops
 * describing anything, and all three lanes can close at once. Moving the whole lattice rigidly keeps
 * every adjacency it was built with. What you lose is traffic overtaking traffic; what you keep is a
 * rider who can always get through, and since the rider is nearly three times quicker than any of it,
 * every overtake in the picture is his anyway.
 */
export const carX = (car, t) => (car.n + 0.5 + car.off) * CAR_PITCH + TRAFFIC * t;

/* -------------------------------------------------------------- the line ---- */

/**
 * How much a vehicle at `delta` cell-pitches away costs the lane it is in.
 *
 * **Flat-topped**, and that is the correction that mattered most. The obvious kernel is a smooth
 * bump, and a smooth bump has its maximum at one point and is *below* it everywhere else — including
 * across the whole stretch where the vehicle and the bike actually overlap. Built that way the rider
 * is pushed hardest a moment before the danger and is already easing back into the lane as he draws
 * level with the van. A lane is occupied or it is not, so the cost is 1 across the entire pass and
 * the shoulders are only there to make it continuous.
 *
 * The shoulders are asymmetric because the situation is: it rises from a cell and a half ahead (so
 * the move starts early, while there is room) and releases half a cell behind (so the rider comes
 * back promptly rather than trailing a vehicle he has already passed).
 *
 * Compact support — exactly **two cell-pitches**, from −0.5 to +1.5 — is what the gap rule's
 * guarantee rests on. Anything with a tail, however small, makes the set of vehicles that can
 * influence a decision unbounded, and then no argument about three consecutive cells is available.
 */
export function costOf(delta) {
  if (delta <= -SUPPORT_BACK || delta >= SUPPORT_FRONT) return 0;
  if (delta < -FLAT_BACK) return smoothstep(-SUPPORT_BACK, -FLAT_BACK, delta);
  if (delta > FLAT_FRONT) return 1 - smoothstep(FLAT_FRONT, SUPPORT_FRONT, delta);
  return 1;
}

/**
 * Where the kernel starts and stops, in cell-pitches, and where its flat top runs between.
 *
 * Two constraints pin these, and they pull against each other.
 *
 * **The flat top has to cover the whole overlap.** The longest vehicle on the road is twenty-one
 * units and the bike is seven, so the two are alongside each other for `(21 + 7) / 2 / 32` — about
 * 0.44 of a cell — either side of level. Any narrower and the cost is already falling while a bus is
 * still beside the rider, which is exactly when it must not be.
 *
 * **The support has to stay under three cell-pitches.** Only every third cell may hold a vehicle, so
 * a window narrower than three cells contains at most one eligible cell and therefore at most one
 * vehicle — which is the guarantee the whole lane chooser is built on. Allowing for the vehicles'
 * within-cell offsets, the widest usable support is 2.76; this is 2.5, and the slack is deliberate.
 */
const SUPPORT_BACK = 0.75;
const SUPPORT_FRONT = 1.75;
const FLAT_BACK = 0.55;
const FLAT_FRONT = 0.9;

/**
 * The lane the rider would prefer if nothing were in the way — and it is deliberately **not** the
 * middle of the road.
 *
 * Sitting home in the middle makes the two outside lanes exactly equally attractive, and a soft
 * minimum over three options with two of them tied returns the average of the tied pair — which is
 * the middle lane, the one with the van in it. The rider would answer "something is in my lane" by
 * staying precisely where he is. Off centre, no two lanes are ever worth the same and the choice
 * always resolves.
 *
 * It sits on the **near** side because that is where the subject of a side-scroller belongs. The far
 * lane is drawn a fifth smaller and a third of the band higher, and a hero who spends the ride up
 * there is a hero the traffic is bigger than. Riding the near lanes and moving out to overtake puts
 * the bike at its largest for most of the picture and sends it *away* from the camera to pass, which
 * is also the more legible of the two directions: something receding to overtake reads as depth, and
 * something swelling toward you reads as arriving.
 */
const HOME = 0.66;

/** How much drifting from home costs, and how sharply the minimum over the three is taken. */
const BIAS = 0.75;
const TEMPER = 0.32;

/**
 * How much lateral travel costs, per unit of it squared.
 *
 * **This is the term that makes the choice a choice.** Without it the soft minimum is an average
 * over lane *positions*, and an average is the wrong operation on a multi-modal thing: with the two
 * outside lanes free and the middle one blocked, it returns the midpoint of the outsides — which is
 * the middle lane, which is the one with the van in it. Bias alone does not save it either, because
 * any small residual cost on one outside lane cancels the bias on the other and the tie comes back.
 *
 * Measured against a lane change, which is 0.36 of the band: one lane costs `MOVE · 0.13` and two
 * cost `MOVE · 0.52`. For the rider to change lanes for a vehicle worth about 0.9 but never to cross
 * two at once, `MOVE` has to sit between 1.7 and 6.9. Which is a range, not a number, so it is set
 * near the middle of it and the picture is not sensitive to where in it.
 */
const MOVE = 4.4;

/**
 * **Hysteresis and the lean trade places, and getting that wrong was the last real bug in here.**
 *
 * Two forces want the same knob. The move-cost is what makes a choice decisive — a rider who has
 * committed to the outside stays there. The slow lean below is what stops him passing everything on
 * the same side for the whole ride. Applied together at full strength they make the map **bistable**:
 * two stable answers, a watershed between them, and when the lean finally outvotes the home bias the
 * rider does not drift across the carriageway, he **teleports** across it. Measured over forty
 * minutes it fires about twice, which is twice more than anybody should ever see a motorcycle do it.
 *
 * They cannot both be strong, so they take turns, keyed off how blocked the road actually is:
 *
 * - **Clear road** — no grip, full lean. There is nothing to commit to, the soft minimum is a
 *   genuine blend, and the rider wanders across the lanes as smoothly and as slowly as the lean does.
 *   With no memory in the map there is no second stable answer to snap to.
 * - **Vehicle up ahead** — grip comes on as the square of the blockage, the lean falls off as the
 *   cube of what is left. By the time a lane is properly blocked the lean is worth nothing next to
 *   the home bias, so the escape has exactly one direction and the rider slides that way instead of
 *   choosing between two.
 *
 * The lean has still done its job: it decided which side of the road he was on when the vehicle
 * arrived, which is what decides the overtake. It just is not allowed to argue during one.
 */
const grip = (worst) => MOVE * worst * worst;
const fade = (worst) => (1 - worst) ** 3;

/**
 * A lane is blocked or it is not — its cost is capped at one.
 *
 * Two vehicles in the same lane do not make it twice as unavailable, and letting them say so breaks
 * the argument below: with an unbounded cost the rider will cross two lanes at once to escape a
 * doubly-blocked one, and crossing two lanes at once means going straight through the middle of the
 * one between them.
 */
const BLOCKED = 1;

/** The three lanes' costs at one instant. */
function costsAt(x, t, density, out) {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  const base = Math.floor((x - TRAFFIC * t) / CAR_PITCH);
  for (let n = base - 3; n <= base + 3; n += 1) {
    const car = carAt(n, density);
    if (!car) continue;
    const cost = costOf((carX(car, t) - x) / CAR_PITCH);
    if (cost > 0) out[car.lane] += cost;
  }
  out[0] = out[0] > BLOCKED ? BLOCKED : out[0];
  out[1] = out[1] > BLOCKED ? BLOCKED : out[1];
  out[2] = out[2] > BLOCKED ? BLOCKED : out[2];
  return out;
}

const COSTS = [0, 0, 0];

/**
 * How far the rider's preference leans across the carriageway, and how slowly it wanders.
 *
 * Without it the home bias decides which way to go round every single vehicle, and the rider passes
 * everything on the same side for the whole ride — which reads as a rail rather than as riding. The
 * tilt is a little larger than the home bias's own asymmetry, so it can outvote it, and it turns over
 * on periods of half a minute and a couple of minutes: long enough that any one overtake is decided
 * well before it starts, short enough that both sides get used.
 *
 * It is safe to let it swing the choice **only** because of the gap rule. With one lane blocked, both
 * of the others are free, so there is no wrong answer for it to pick — it is choosing between two
 * good lines rather than between a good one and a van.
 */
const TILT = 0.55;
const tiltAt = (t) => 0.62 * Math.sin(t * 0.187 + 0.9) + 0.38 * Math.sin(t * 0.081 + 3.4);

/** Where the rider would rather be, given the traffic and where they currently are. */
function targetLane(x, t, density, from) {
  const costs = costsAt(x, t, density, COSTS);
  const tilt = tiltAt(t) * TILT;
  const worst = Math.max(costs[0], costs[1], costs[2]);
  const hold = grip(worst);
  const lean = tilt * fade(worst);
  let weight = 0;
  let lane = 0;
  for (let i = 0; i < LANES.length; i += 1) {
    const move = LANES[i] - from;
    const c = costs[i] + Math.abs(LANES[i] - HOME) * BIAS + hold * move * move + lean * (LANES[i] - 0.5);
    const w = Math.exp(-c / TEMPER);
    weight += w;
    lane += LANES[i] * w;
  }
  return weight > 0 ? lane / weight : from;
}

/**
 * How far back the rider's line is worked out from, and how fast they cross the carriageway.
 *
 * `STEP_T` is the old value divided by three, and that division is the whole of what tripling the
 * road speed cost. A lane change takes the same *distance* whatever you are doing, so at three times
 * the speed it has to take a third of the **time** — and a rider whose reactions stayed where they
 * were simply arrives at the van still in its lane. The measured clearance falls from a fifth of a
 * lane spacing to nothing at all, and no other constant in this file needed touching.
 */
const STEPS = 22;
const STEP_T = 0.023;
const EASE = 0.18;

/**
 * The rider's line: **the last second and a half of decisions, recomputed from scratch.**
 *
 * Choosing a lane needs to depend on which lane you are already in — it is the difference between a
 * rider and a coin. Nothing else in this gallery has ever needed that, because nothing else has had
 * to decide anything, and the usual way to get it is a field on an object that the last frame wrote.
 * Which is exactly what a scene here may not have: the render tests draw eight timestamps out of
 * order, so a lane that depended on the previous frame would answer differently depending on which
 * frames happened to have been drawn.
 *
 * So the history is not stored, it is **re-derived**. Every frame walks the last eighteen eightieths
 * of a second forward from a fixed start, evaluating the choice at each one and easing toward it,
 * and hands back where that leaves the rider. It is a recursion with its depth unrolled, which is
 * the general trick for having state in a pure function: the state is a function of `t`, so compute
 * it.
 *
 * **The arbitrary start does not survive.** Each step keeps `1 - EASE` of the previous position, so
 * the lane the walk begins at is worth `0.74¹⁸ ≈ 0.0045` by the time it arrives — four parts in a
 * thousand of a band a few hundred pixels tall, which is a fraction of one chunk. The answer is the
 * road's, not the initial condition's, and it costs about a hundred and eighty arithmetic operations
 * a frame to say so.
 */
export function lineAt(t, density, origin = 0) {
  let lane = HOME;
  for (let k = STEPS; k >= 0; k -= 1) {
    const tk = t - k * STEP_T;
    lane += (targetLane(travelAt(tk) + origin, tk, density, lane) - lane) * EASE;
  }
  return lane;
}

/* --------------------------------------------------------------- drawing ---- */

/**
 * Every vehicle that could touch the frame, nearest lane last so the near ones cover the far.
 *
 * The cell range is taken **in the traffic's own frame**, not the world's: the lattice slides at
 * `TRAFFIC · t`, so by five minutes in it has moved five thousand units and the cells sitting under
 * the camera are nowhere near the ones the camera's world position indexes. Scanning the wrong frame
 * costs nothing and draws nothing, which is a good deal harder to notice than a crash.
 */
export function eachCar(view, density, run) {
  const t = view.t;
  const slide = TRAFFIC * t;
  const from = Math.floor((view.camX - slide - CAR_PITCH * 2) / CAR_PITCH);
  const to = Math.floor((view.camX - slide + view.span + CAR_PITCH * 2) / CAR_PITCH);
  for (let lane = 0; lane < LANES.length; lane += 1) {
    for (let n = from; n <= to; n += 1) {
      const car = carAt(n, density);
      if (!car || car.lane !== lane) continue;
      run(car, carX(car, t));
    }
  }
}

/**
 * A vehicle, as five rectangles: body, cabin, glass, tail lights and the shadow it sits in.
 *
 * Everything is drawn from *behind and slightly above*, because that is where the rider is: you see
 * a roof, a back window and two tail lights, and almost never a wheel. Getting that wrong — drawing
 * a neat side-on profile of a car — is what makes a side-scroller look like a diagram.
 */
export function drawCar(view, car, wx) {
  const { ctx, px, pal } = view;
  const shape = car.shape;
  const z = lz(LANES[car.lane]) * view.pxu;
  const road = ly(view, LANES[car.lane]);
  const x = snap(sx(view, wx) - (shape.long * z) / 2, px);
  const w = Math.max(px * 4, shape.long * z);
  const h = Math.max(px * 4, shape.tall * z);
  const y = road - h;
  const roof = Math.max(px * 2, h * shape.roof);
  const tone = 1 + (car.tone % 3);
  const wheel = Math.max(px * 2, h * 0.19);
  const cab = shape.cab > 0 ? Math.max(px * 2, h * shape.cab) : 0;

  // **Wheels first, under everything.** Two dark blocks standing clear of the road with the body
  // above them, and they are most of what separates a vehicle from a box: without them the whole
  // thing hovers, which is exactly what the first build did.
  ctx.fillStyle = pal.hard.tyre;
  ctx.beginPath();
  for (let i = 0; i < shape.wheels; i += 1) {
    chunk(ctx, x + w * (0.1 + i * 0.14), road - wheel, Math.max(px, w * 0.1), wheel + px, px);
    chunk(ctx, x + w * (0.76 - i * 0.14), road - wheel, Math.max(px, w * 0.1), wheel + px, px);
  }
  ctx.fill();

  ctx.fillStyle = pal.road[0];
  ctx.beginPath();
  chunk(ctx, x - px, road - px, w + px * 2, px * 2, px);
  ctx.fill();

  // The body, sitting on the wheels rather than on the ground, and the cab of a van or a truck
  // showing above and beyond the box it is pulling.
  ctx.fillStyle = pal.build[tone];
  ctx.beginPath();
  chunk(ctx, x, y + roof, w, h - roof - wheel * 0.55, px);
  if (cab > 0) chunk(ctx, x + w * 0.86, y + roof - cab, w * 0.14, cab, px);
  ctx.fill();

  // The cabin, one step **darker** than the body. A roof is the panel the sky is not reaching, and
  // drawn lighter it turns the greenhouse into a lit sign balanced on a bumper.
  const inset = w * (1 - shape.box) * 0.5;
  ctx.fillStyle = pal.build[Math.max(0, tone - 1)];
  ctx.beginPath();
  chunk(ctx, x + inset, y, w * shape.box, roof + px, px);
  ctx.fill();

  // A highlight along the roof edge and a bumper across the bottom, both one chunk deep. Two lines
  // for the price of two rectangles, and between them they give the body a top and a bottom instead
  // of leaving it a rectangle that happens to be car-coloured.
  ctx.fillStyle = pal.build[Math.min(pal.build.length - 1, tone + 1)];
  ctx.beginPath();
  chunk(ctx, x + inset, y, w * shape.box, px, px);
  chunk(ctx, x + px, road - wheel - px * 2, w - px * 2, px * 2, px);
  ctx.fill();

  // The rear screen, narrower than the cabin so there are pillars either side of it — or, on a box
  // van, a pair of doors with a dark seam down the middle and no glass to speak of.
  ctx.fillStyle = pal.build[4];
  ctx.beginPath();
  const glassW = w * shape.box * shape.glass;
  chunk(ctx, x + w * 0.5 - glassW * 0.5, y + px * 2, glassW, Math.max(px, roof * 0.52), px);
  ctx.fill();
  if (shape.doors) {
    ctx.fillStyle = pal.build[0];
    ctx.beginPath();
    chunk(ctx, x + w * 0.5 - px * 0.5, y + px, px, roof + h * 0.3, px);
    chunk(ctx, x + inset, y + roof, w * shape.box, px, px);
    ctx.fill();
  }

  // Tail lights: **horizontal bars at the outside corners**, not dots. They are the width of a
  // cluster rather than a pixel, they sit where the body meets the cabin, and at night they are the
  // thing the eye actually reads a vehicle by.
  const lampW = Math.max(px * 2, w * 0.13);
  const lampH = Math.max(px, h * 0.13);
  const lampY = y + roof + Math.max(px, h * 0.1);
  ctx.fillStyle = pal.hard.tail;
  ctx.beginPath();
  chunk(ctx, x + px, lampY, lampW, lampH, px);
  chunk(ctx, x + w - lampW - px, lampY, lampW, lampH, px);
  ctx.fill();

  // A halo on each, and the wet road giving it back. The reflection is drawn tall rather than round
  // because that is what a light on wet tarmac does — it runs toward you.
  const halo = Math.max(px * 2, w * 0.1) * view.tune.glow;
  for (const at of [x + px + lampW * 0.5, x + w - lampW * 0.5 - px]) {
    ditherGlow(ctx, at, lampY + lampH * 0.5, halo, pal.hard.tail, 0.4 * view.tune.glow, px, 1, 2.2);
    // ...and the same wedge the lamps get, in red, running back toward the viewer. Every light in
    // this picture is on a wet road and every one of them is given back by it.
    smear(ctx, at, road, view.band * 0.3, Math.max(px, w * 0.06), pal.hard.tail, 0.5 * view.tune.glow, px);
  }
}

/** The one thing that is not on the lattice: a taxi's roof light, on local roads only. */
export function drawFare(view, car, wx) {
  if (car.tone % 6 !== 0 || kindAt(wx) !== LOCAL) return;
  const { ctx, px, pal } = view;
  const z = lz(LANES[car.lane]) * view.pxu;
  const h = Math.max(px * 2, car.shape.tall * z);
  const y = ly(view, LANES[car.lane]) - h;
  ctx.fillStyle = pal.neon[2];
  ctx.beginPath();
  chunk(ctx, snap(sx(view, wx) - px, px), y - px * 2, px * 3, px * 2, px);
  ctx.fill();
}

