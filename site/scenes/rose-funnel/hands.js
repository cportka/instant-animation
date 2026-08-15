// The spirit hands, their workshops, and the wood they are cutting.
//
// A hand is not a shape problem, it is a **size** problem, and every wrong answer starts by getting
// that backwards. At this scene's chunk size a hand drawn at the scale of a real hand is five squares
// across, and five squares is a mitten — you cannot draw a thumb, let alone a grip. So these are
// drawn at the size of the *thing they are carrying* rather than at the size of a hand, which is a
// lie the eye accepts instantly because it has no other hand in frame to compare against. What sells
// it is the silhouette having a wrist end and a finger end, and a gap where the thumb closes.
//
// **Disembodied** is done by subtraction. No arm, no shoulder, nothing it could be attached to — and
// a short trail of separating chunks behind the wrist that thins to nothing, so the eye reads
// "coming out of the air" rather than "cropped by something". An arm that faded out would be a
// drawing with a soft edge, and there is not one soft edge in this scene.
//
// What a hand *looks* like is in `spirit.js`. This file is what one **does**: whose bay it is
// answerable for and when it gets there (which is the whole of the temple's repair rule, computed on
// this side of it), how it behaves near the storm, and the fact that the storm sometimes wins. The
// last of those is why there are slots rather than hands — a slot can be empty.
//
// The workshops are silhouettes with a single hot chunk in them, and that is not a saving. The band
// between the horizon and the bottom of the frame is nine background chunks deep, and a shed drawn
// with a structure, a roof and a lit doorway in nine chunks is a speckle. A dark shape with one
// ember in it reads as a forge from across the room, which is the distance this is being looked at.

import { clamp, rgba, wrap01 } from '../../lib/draw.js';
import { hash2 } from '../../effects/field.js';
import { chunk } from '../../effects/pixel.js';
import { backPixel, GROUND } from './layout.js';
import { vortexAt } from './funnel.js';
import { HAND_H, HAND_W, handMask, stampSpirit } from './spirit.js';
import { GOLD, JADE, LAPIS, SPIN } from './palette.js';

/**
 * The three crafts, and where they stand along the horizon.
 *
 * Three, not five. Every one of them is a dark lump with a spark in it at this size, so a fourth and
 * a fifth add count without adding information — and the horizon band has a forest and everything
 * that lands to hold as well.
 */
const SHOPS = [
  { at: 0.12, kind: 'mill', beat: 1.7 },
  { at: 0.72, kind: 'kiln', beat: 1.1 },
  { at: 0.87, kind: 'glass', beat: 2.3 },
];

export function planHands(rng, bayCount = 27) {
  // Twelve slots rather than twelve hands. A slot is not always occupied: the storm takes them, and
  // a new one is summoned into the empty slot a while later — so the population breathes, and the
  // hands you are watching are not the hands you started with.
  const hands = Array.from({ length: 12 }, (_, i) => ({
    key: i,
    shop: i % SHOPS.length,
    // Staggered on one fixed circuit each, so the traffic never synchronises and nothing queues.
    period: 9 + rng.next() * 7,
    phase: rng.next(),
    // How long a spirit lasts before the question of whether the storm has taken it comes round
    // again — and how strong it is, which decides whether it can hold its ground in the wind.
    //
    // Short rounds on purpose. At sixty seconds the question was asked so rarely that a spirit was
    // taken about once every seventy-five seconds across every slot there is, and the empty slot that
    // follows was on screen four percent of the time — a mechanic nobody would ever see run.
    life: 22 + rng.next() * 22,
    born: rng.next(),
    nerve: rng.range(0.35, 1),
    /** The bays this one is answerable for, taken in turn, one per circuit. */
    bays: [],
  }));
  // Share the temple out. Every bay is somebody's round and no bay is nobody's — which is the thing
  // that makes a repair *locatable* at all: ask who mends this bay and there is exactly one answer,
  // and that spirit's errand is to fly to it.
  for (let k = 0; k < bayCount; k += 1) hands[k % hands.length].bays.push(k);
  return {
    seed: rng.range(0, 90),
    hands,
    trees: Array.from({ length: 34 }, (_, i) => ({
      at: (i + 0.5) / 34 + rng.range(-0.03, 0.03),
      h: rng.range(0.6, 1.5),
      lean: rng.range(-0.22, 0.22),
      // Two bands. The far one sits a chunk lower and a step darker, which is the entire depth cue a
      // treeline needs and costs one comparison.
      depth: rng.next(),
      // One tree is coming down at a time, on its own long clock. A forest where nothing ever falls
      // is scenery; one falling tree makes the whole treeline a source of timber.
      fell: rng.range(0, 1),
    })),
  };
}

/** The forest and the workshops: everything standing still on the far side of the ground. */
export function drawWorks(ctx, W, H, t, plan, px) {
  const bpx = backPixel(px);
  const horizonY = Math.round((H * GROUND) / bpx) * bpx;
  const mass = [];
  const canopy = [];
  const canopyFar = [];
  const crown = [];
  const ember = [];

  // The forest: conifers in tiers, in two depth bands.
  //
  // A tree at this size is not a trunk with a blob on it — that is a lollipop, and eighteen of them
  // in a row is a comb. What reads as a conifer is the **taper in steps**: a stack of three or four
  // tiers, each narrower than the one below and each with its own lit top edge and shaded underside.
  // It is the pagoda's own trick, which is not a coincidence — a pagoda is a stylised tree.
  //
  // And they are green. The forest is the other half of the scene's complement: jade against the
  // storm's rose, so the land reads as a living place the temple is standing in rather than as more
  // weather. The far band is a step darker and drawn a chunk lower, which is all the depth a
  // treeline needs.
  for (const tree of plan.trees) {
    // Clear of the temple, so the building stands in a clearing rather than in a hedge.
    if (Math.abs(tree.at - 0.33) < 0.1) continue;
    const x = Math.round((tree.at * W) / bpx) * bpx;
    const far = tree.depth < 0.5;
    const foot = horizonY - (far ? bpx : 0);
    const h = Math.max(4, Math.round((tree.h * H * (far ? 0.055 : 0.085)) / bpx));
    // One is always coming down: it leans further and further, then it is a stump, then it has grown
    // back. Pure in `t`, like everything else here — and it is what makes the treeline a source of
    // timber rather than scenery.
    const u = wrap01(t / 23 + tree.fell);
    const falling = u > 0.86 ? (u - 0.86) / 0.14 : 0;
    const lean = (tree.lean + falling * 3.2) * h;
    const tiers = Math.max(2, Math.round(h / 2.2));

    for (let r = 0; r < h; r += 1) {
      const shift = Math.round((lean * r) / h) * bpx;
      const up = r / h;
      // The trunk is the bottom fifth and one chunk wide; everything above it is canopy, and the
      // canopy's width steps *down* in tiers rather than tapering smoothly — the step is the read.
      if (up < 0.22) {
        mass.push(x + shift, foot - (r + 1) * bpx, bpx, bpx);
        continue;
      }
      const tier = Math.floor((up - 0.22) / (0.78 / tiers));
      const wide = Math.max(1, tiers - tier);
      const bx = x + shift - Math.floor(wide / 2) * bpx;
      const into = far ? canopyFar : canopy;
      into.push(bx, foot - (r + 1) * bpx, wide * bpx, bpx);
      // The lit crown of each tier: the top chunk of a tier catches what light there is.
      if (tier !== Math.floor((up - 0.22 - 1 / h) / (0.78 / tiers)) && !far) {
        crown.push(bx, foot - (r + 1) * bpx, wide * bpx, bpx);
      }
    }
  }

  // The workshops. A shed with a pitched roof, a lit mouth, and a chimney — and each craft doing a
  // visibly different thing, because three identical lumps with sparks over them is one workshop
  // drawn three times.
  for (const shop of SHOPS) {
    const x = Math.round((shop.at * W) / bpx) * bpx;
    mass.push(x - bpx * 3, horizonY - bpx * 3, bpx * 6, bpx * 3);
    // A pitched roof, stepped, so a shed is not a box.
    for (let r = 0; r < 2; r += 1) {
      mass.push(x - bpx * (4 - r), horizonY - bpx * (4 + r), bpx * (8 - r * 2), bpx);
    }
    // The chimney, and what is coming out of it.
    mass.push(x + bpx * 2, horizonY - bpx * 6, bpx, bpx * 2);

    // The mouth of the forge, always lit, breathing on this craft's own clock: a kiln glows steadily,
    // a smelter pulses hard, a glass furnace flares. Same two chunks, three different rhythms.
    const heat = shop.kind === 'kiln'
      ? 0.72 + 0.14 * Math.sin(t * shop.beat)
      : shop.kind === 'glass'
        ? 0.5 + 0.5 * Math.abs(Math.sin(t * shop.beat * 0.7)) ** 3
        : 0.45 + 0.55 * Math.max(0, Math.sin(t * shop.beat));
    ember.push(x - bpx, horizonY - bpx * 2, heat);
    ember.push(x, horizonY - bpx * 2, heat * 0.8);

    // ...and what the craft throws off. The smelter showers sparks, the kiln breathes smoke, the
    // glass bench sends up one slow bright gather at a time.
    const jets = shop.kind === 'mill' ? 5 : shop.kind === 'kiln' ? 3 : 2;
    for (let s = 0; s < jets; s += 1) {
      const rate = shop.kind === 'glass' ? 0.22 : 0.4 + s * 0.13;
      const u = wrap01(t * rate + shop.at * 7 + s * 0.31);
      if (u > 0.62) continue;
      const spread = shop.kind === 'mill' ? 5 : 2;
      ember.push(
        x + (hash2(s, Math.floor(t * rate + shop.at * 7)) - 0.5) * bpx * spread,
        horizonY - bpx * 6 - u * bpx * 6,
        (1 - u / 0.62) * (shop.kind === 'kiln' ? 0.35 : 1),
      );
    }
  }

  // Back to front: the far canopy, the near canopy, its lit crowns, then the built things in front
  // of all of it, then the fires.
  for (const [cells, colour] of [[canopyFar, JADE[6]], [canopy, JADE[5]], [crown, JADE[4]], [mass, LAPIS[7]]]) {
    if (!cells.length) continue;
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 4) chunk(ctx, cells[i], cells[i + 1], cells[i + 2], cells[i + 3], bpx);
    ctx.fill();
  }

  // Three heats. Gold, because fire is the one thing on the ground that is neither storm nor forest,
  // and because a hearth in the storm's own ramp is a piece of storm that has fallen over.
  for (const [colour, lo, hi] of [[GOLD[0], 0.75, 2], [GOLD[1], 0.4, 0.75], [GOLD[2], 0.12, 0.4]]) {
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < ember.length; i += 3) {
      if (ember[i + 2] < lo || ember[i + 2] >= hi) continue;
      chunk(ctx, ember[i], ember[i + 1], bpx, bpx, bpx);
    }
    ctx.fill();
  }
}

/**
 * Where a hand is in its life, and whether it is there at all.
 *
 * A slot runs a long round of its own. At the start of each round the question is asked once — was
 * the storm near this hand's beat when the round turned over? — and if it was, this is the round the
 * spirit is **taken**: it is pulled off its circuit, wound up the column, and gone. The slot then
 * stands empty for a while and a new hand is summoned into it, fading up out of nothing.
 *
 * Asked once, at the round's own start, against where the storm was *then* — the same latch the
 * temple's bays use, and for the same reason. A spirit halfway up the funnel must not be handed back
 * because the weather improved.
 */
function spiritAt(hand, t, W, H, funnel, seed) {
  const cycles = t / hand.life + hand.born;
  const n = Math.floor(cycles);
  const began = (n - hand.born) * hand.life;
  const age = (cycles - n) * hand.life;
  const bench = SHOPS[hand.shop].at * W;

  const storm = vortexAt(W, H, began, funnel, 0.12);
  const exposed = 1 - clamp(Math.abs(bench - storm.cx) / Math.max(1, storm.wind), 0, 1);
  const doomed = hash2(hand.key * 5.3 + 1.7, n + seed) < exposed * (1.9 - hand.nerve);

  if (!doomed) return { here: 1, taken: 0 };
  // Taken partway through the round: dragged across and wound up the column, then an empty slot long
  // enough to be noticed, then a new one summoned into it. The empty stretch is the part that has to
  // be generous — a slot that refills before you have registered it was empty is not a replacement,
  // it is a flicker.
  const at = hand.life * 0.42;
  if (age < at) return { here: 1, taken: 0 };
  if (age < at + 2.6) return { here: 1, taken: (age - at) / 2.6 };
  if (age < at + 9.1) return { here: 0, taken: 1 };
  return { here: clamp((age - at - 9.1) / 3.2, 0, 1), taken: 0 };
}

/**
 * Which bay a hand is on its way to at time `t`, and where that is.
 *
 * A hand takes its own bays in turn, one per circuit, so which one it is carrying a piece to is a
 * function of the circuit number and nothing else — computable from `t` alone, on both sides of the
 * building, without either side telling the other.
 */
function errandOf(hand, t) {
  const round = Math.floor(t / hand.period + hand.phase);
  const slot = ((round % hand.bays.length) + hand.bays.length) % hand.bays.length;
  return hand.bays[slot];
}

/**
 * When the hand answerable for this bay last finished a fix pass *at this bay*.
 *
 * This is the half that makes the repairs mean anything, and it took two goes. A bay used to come
 * back on a plain timer, whether or not a hand was anywhere near it. Then it came back on *a* hand's
 * circuit — better, except that hand's errand went to a storey picked at random when the scene was
 * planned, so the building still healed at one end while the labour was at the other. Now the errand
 * and the repair name the same bay, and a hole stays a hole until you have watched somebody fly to it.
 */
export const FIX_AT = 0.7;
export function tendingAt(plan, bayKey, t) {
  const hand = plan.hands[bayKey % plan.hands.length];
  const slot = hand.bays.indexOf(bayKey);
  // A bay nobody is answerable for is a bay that never heals — but the shares are dealt out over
  // every bay there is, so this is a guard rather than a case.
  if (slot < 0) return { hand, doneAt: -Infinity };
  // The last circuit that reached its fix at all...
  const last = Math.floor(t / hand.period + hand.phase - FIX_AT);
  // ...then back to the last one whose turn it was to come *here*.
  const every = hand.bays.length;
  const n = last - (((last - slot) % every) + every) % every;
  return { hand, doneAt: (n + FIX_AT - hand.phase) * hand.period };
}

/**
 * The hands themselves, on their circuits.
 *
 * Four acts: **work** at their own craft, **carry** the piece out to the temple, **fix** it into the
 * building, and come back empty. A circuit rather than a queue, because a queue is state and there
 * is none to be had — and because ceaseless labour is a thing that has always been going on, which
 * is what a loop with no start looks like.
 *
 * What is new is that they are **afraid**. A hand whose path would take it into the wind is pushed
 * out of it, and the nearer the storm the wider it swings and the tighter it curls — so the traffic
 * bends around the column instead of walking through it, and when the storm is on the temple the
 * work visibly stops going there. Sometimes the push is not enough and the spirit is taken.
 */
export function drawHands(ctx, W, H, t, plan, px, places) {
  const groundY = H * GROUND;
  const edge = [];
  const fill = [];
  const lit = [];
  const wisp = [];
  const tool = [];
  const hot = [];
  // A hand is drawn at the size of the thing it is carrying rather than at the size of a hand — a
  // lie the eye takes without complaint, because there is no other hand in frame to measure against.
  const hpx = Math.max(2, Math.round(px * 0.72));

  for (const hand of plan.hands) {
    const state = spiritAt(hand, t, W, H, plan.funnel, plan.seed);
    if (state.here <= 0) continue;

    const shop = SHOPS[hand.shop];
    const u = wrap01(t / hand.period + hand.phase);
    // The bay it is answerable for this circuit — the same one `tendingAt` will credit it with
    // mending, which is the whole of the correspondence.
    const site = places[Math.min(places.length - 1, errandOf(hand, t))];
    if (!site) continue;

    const bench = { x: shop.at * W, y: groundY - px * 8 };
    const stroke = Math.sin(t * shop.beat * 2.2 + hand.key * 1.7);

    let x;
    let y;
    let curl = 0.2;
    let flip = false;
    // What the hand is holding, emitted *after* the storm has had its say — otherwise the plank and
    // the blowpipe stay where the hand would have been if it had not flinched, and a spirit that gets
    // shoved out of the wind leaves its work hanging in the air behind it.
    let holds = null;

    if (u < 0.34) {
      // Working. The hand holds station and the tool travels — and the grip opens and closes on the
      // stroke, which is the thing a fixed sprite could never do.
      x = bench.x + stroke * px * 2.5;
      y = bench.y + Math.abs(stroke) * px;
      curl = 0.55 + stroke * 0.35;
      flip = stroke < 0;
      holds = 'work';
    } else if (u < 0.62) {
      const leg = (u - 0.34) / 0.28;
      x = bench.x + (site.x - bench.x) * leg;
      y = bench.y + (site.y - bench.y) * leg - Math.sin(leg * Math.PI) * H * 0.1;
      curl = 0.85;
      flip = site.x < bench.x;
      holds = 'carry';
    } else if (u < 0.82) {
      // Fixing: hovering at the wound and tapping, with the hand opening on each tap.
      const tap = Math.sin(((u - FIX_AT + 0.08) / 0.2) * Math.PI * 6);
      x = site.x + px * 2;
      y = site.y + tap * px * 1.5;
      curl = 0.3 + tap * 0.25;
      if (tap > 0.6) holds = 'fix';
    } else {
      const leg = (u - 0.82) / 0.18;
      x = site.x + (bench.x - site.x) * leg;
      y = site.y + (bench.y - site.y) * leg - Math.sin(leg * Math.PI) * H * 0.06;
      curl = 0.15;
      flip = bench.x < site.x;
    }

    // ---- fear, and being taken ------------------------------------------------------------------
    // How far into the wind this hand has strayed. It is asked at `t`, not at any epoch, because
    // flinching is not a decision that has to persist — it is where the hand is *right now*.
    const up = clamp((groundY - y) / (groundY - H * 0.04), 0, 1);
    const near = vortexAt(W, H, t, plan.funnel, up);
    const gap = x - near.cx;
    const dread = 1 - clamp(Math.abs(gap) / Math.max(1, near.wind), 0, 1);
    if (dread > 0) {
      // Two forces, not one. The spirit shoves itself out of the wind and the wind pulls it back in,
      // and which wins depends on how deep in it already is. `flinch` is quadratic and `drag` is
      // shallower than linear, so at the outer edge of the wind the pull is the larger of the two and
      // the hand is drawn *toward* the column before it has noticed; from about a third of the way in
      // the flinch overtakes it and throws the hand clear.
      //
      // A single outward shove was the first version and it was a hand that simply avoided a region.
      // Two forces crossing over is a hand that gets too close, gets tugged, and scrambles out — and
      // it costs one extra `pow`.
      const strength = 0.5 + hand.nerve * 0.5;
      const flinch = dread * dread * near.wind * 1.5 * strength;
      const drag = dread ** 0.8 * near.wind * 0.3;
      // The sign of `gap` keeps it on the side it was already on, so hands do not swap sides of the
      // column mid-errand.
      x += Math.sign(gap || 1) * (flinch - drag);
      // Losing the argument also means being lifted, which is the tell that the pull is winning.
      y -= Math.max(0, drag - flinch) * 0.55;
      // ...and it flinches: fingers spread and the whole thing shakes on a fast clock. How far the
      // fingers go is per-spirit, because when the storm walks onto the temple every hand in the
      // frame flinches at once, and a dozen identical splayed hands in an arc is a stencil.
      curl = clamp(curl - dread * (0.3 + hash2(hand.key, 11) * 0.45), 0, 1);
      y += Math.sin(t * 17 + hand.key * 3) * dread * px * 0.8;
    }

    if (state.taken > 0) {
      // Caught: hauled across to the column, then wound around it and carried up, curling tight as it
      // goes. Hauled rather than *placed* — the first version assigned the vortex position outright
      // and the hand vanished from its bench and reappeared on the funnel in one frame, which is a
      // cut, not a capture. The whole event is worth watching only if you see it lose.
      const g = state.taken;
      const climb = clamp((g - 0.35) / 0.65, 0, 1);
      const grabbed = vortexAt(W, H, t, plan.funnel, climb * 0.9);
      const spin = g * 11 + hand.key;
      const haul = clamp(g / 0.35, 0, 1);
      const ease = haul * haul * (3 - 2 * haul);
      x += (grabbed.cx + Math.cos(spin) * grabbed.r * 1.05 - x) * ease;
      y += (groundY - climb * (groundY - H * 0.1) - y) * ease;
      curl = clamp(curl + (0.15 + g * 0.7 - curl) * ease, 0, 1);
      flip = Math.cos(spin) < 0;
      // Behind the column once it is riding it — but not before, or it would blink out mid-haul while
      // still out in the open.
      if (ease > 0.9 && Math.sin(spin) < -0.15) continue;
    }

    // What it is holding, now that it is where it is actually going to be drawn. A spirit that is
    // being carried up the funnel has dropped everything, which is why this is gated on the haul.
    if (holds && state.taken < 0.25) {
      if (holds === 'carry') {
        tool.push(x + (flip ? -px * 3 : px * 7), y + px * 4, px * 3, px);
      } else if (holds === 'fix') {
        hot.push(x + px * 4, y + px * 7, 0.45);
      } else if (shop.kind === 'mill') {
        for (let i = 0; i < 7; i += 1) tool.push(x + px * (i - 3), y + px * (3 + (i % 2) * 0.5), px, px * 0.6);
        if (Math.abs(stroke) > 0.7) hot.push(x + stroke * px * 5, y + px * 4, 0.2);
      } else if (shop.kind === 'kiln') {
        tool.push(x + px, y + px * 3, px * 3, px);
        hot.push(x + px * 3.5, y + px * 3, 0.55 + 0.45 * Math.abs(stroke));
      } else {
        tool.push(x + px, y + px * 3, px * 4, px * 0.7);
        hot.push(x + px * 5, y + px * 3 - Math.sin(t * 0.9 + hand.key) * px, 0.9);
      }
    }

    // Fading up as it is summoned, and fading as it is taken: the dither density *is* the presence.
    const solid = 0.28 + 0.42 * state.here * (1 - state.taken * 0.75);
    stampSpirit(edge, fill, lit, handMask(clamp(curl, 0, 1), dread), x, y, hpx, flip, solid);

    // Being summoned: sparks gathering into the palm. The fade-up alone said "appearing"; the sparks
    // say somebody is *doing* it, which is the difference between a spirit that turns up and a spirit
    // the others have made — and it is the only moment in the scene where gold is spent on a hand.
    if (state.here < 1 && state.taken === 0) {
      const born = 1 - state.here;
      for (let s = 0; s < 4; s += 1) {
        const a = s * 1.57 + t * 2.4 + hand.key;
        hot.push(
          x + hpx * (HAND_W / 2) + Math.cos(a) * born * px * 5,
          y + hpx * HAND_H * 0.6 + Math.sin(a) * born * px * 4,
          0.45 + state.here * 0.5,
        );
      }
    }

    // The tail — separating chunks streaming behind the wrist, each one lagging further back.
    for (let w = 1; w <= 8; w += 1) {
      if (hash2(hand.key * 3.3 + w, Math.floor(t * 4)) < w * 0.1 + state.taken * 0.4) continue;
      const sway = Math.sin(t * 1.9 + hand.key * 2.2 - w * 0.7) * hpx * w * 0.3;
      wisp.push(x + hpx * (HAND_W / 2) + sway, y + hpx * (HAND_H + w * 0.9), hpx, hpx);
    }
  }

  for (const [cells, colour] of [[wisp, LAPIS[2]], [tool, LAPIS[3]], [fill, LAPIS[1]], [lit, LAPIS[0]], [edge, LAPIS[0]]]) {
    if (!cells.length) continue;
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i += 4) chunk(ctx, cells[i], cells[i + 1], cells[i + 2], cells[i + 3], hpx);
    ctx.fill();
  }

  for (const [colour, lo, hi] of [[GOLD[0], 0.7, 2], [GOLD[1], 0.4, 0.7], [GOLD[2], 0, 0.4]]) {
    ctx.fillStyle = rgba(colour, 1);
    ctx.beginPath();
    for (let i = 0; i < hot.length; i += 3) {
      if (hot[i + 2] < lo || hot[i + 2] >= hi) continue;
      chunk(ctx, hot[i], hot[i + 1], px, px, px);
    }
    ctx.fill();
  }
}
