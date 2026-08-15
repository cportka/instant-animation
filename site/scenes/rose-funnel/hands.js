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
import { GOLD, JADE, LAPIS } from './palette.js';

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
    life: 28 + rng.next() * 20,
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

/**
 * The five acts of being taken, in seconds.
 *
 * All of them longer than they were, and `DRAG` and `SHRED` are new. The whole event used to run in
 * 2.6 seconds and it was over before you could see what had happened — a hand slid onto the column
 * and stopped existing. Losing a spirit is the most dramatic thing that happens in this scene and it
 * gets nine seconds: dragged in against its own efforts, wound up the column in plain sight, and then
 * coming apart at the top, chunk by chunk, rather than being switched off.
 */
const DRAG = 2.2;
const CLIMB = 4.2;
const SHRED = 1.6;
const EMPTY = 5;
const SUMMON = 3.4;
const CAUGHT = DRAG + CLIMB;
const LOST = CAUGHT + SHRED;

function spiritAt(hand, t, W, H, funnel, seed) {
  const cycles = t / hand.life + hand.born;
  const n = Math.floor(cycles);
  const began = (n - hand.born) * hand.life;
  const age = (cycles - n) * hand.life;
  const bench = SHOPS[hand.shop].at * W;

  const storm = vortexAt(W, H, began, funnel, 0.12);
  const exposed = 1 - clamp(Math.abs(bench - storm.cx) / Math.max(1, storm.wind), 0, 1);
  const doomed = hash2(hand.key * 5.3 + 1.7, n + seed) < exposed * (1.9 - hand.nerve);

  if (!doomed) return { here: 1, taken: 0, shred: 0 };
  // Taken partway through the round: dragged in, wound up the column, shredded at the top, then an
  // empty slot long enough to be noticed, then a new one summoned into it. The empty stretch has to
  // be generous — a slot that refills before you have registered it was empty is not a replacement,
  // it is a flicker.
  //
  // The moment of capture is pulled *earlier* if the round is too short to finish the whole sequence
  // afterwards. At two fifths of the way in, a spirit with the shortest life would still have been
  // half-summoned when its round turned over — and at a round boundary the verdict is re-rolled, so
  // it would have snapped to fully present in one frame. That is a pop with a one-in-seventy chance
  // of being seen, which is exactly the kind that survives every review and ships.
  const since = age - Math.min(hand.life * 0.42, hand.life - (LOST + EMPTY + SUMMON));
  if (since < 0) return { here: 1, taken: 0, shred: 0 };
  if (since < CAUGHT) return { here: 1, taken: since / CAUGHT, shred: 0 };
  if (since < LOST) return { here: 1, taken: 1, shred: (since - CAUGHT) / SHRED };
  if (since < LOST + EMPTY) return { here: 0, taken: 1, shred: 1 };
  return { here: clamp((since - LOST - EMPTY) / SUMMON, 0, 1), taken: 0, shred: 0 };
}

/**
 * Which bay a hand is on its way to at time `t`, and where that is.
 *
 * A hand takes its own bays in turn, one per circuit, so which one it is carrying a piece to is a
 * function of the circuit number and nothing else — computable from `t` alone, on both sides of the
 * building, without either side telling the other.
 */
/**
 * How hard the storm pushes a spirit sideways, as a fraction of its reach.
 *
 * `soft` is where the hand sits across the wind field: 0 on the axis, ±1 at the edge of it. The
 * result is **odd, smooth, and bounded**, and every one of those three is load-bearing.
 *
 * The first version was `sign(gap) * dread² * wind * 1.5`, and it had two faults that between them
 * were the worst artefact in the scene. `wind` reaches nine hundred pixels up near the mouth, so the
 * shove could be *fourteen hundred* — and `sign()` inverts the instant the storm's axis crosses the
 * hand, which doubles it. Hands teleported six hundred to two thousand pixels between one frame and
 * the next, a hundred and twenty times a minute, sometimes clean off the side of the frame. Watching
 * it, that is not a hand avoiding a tornado; it is a hand disappearing here and reappearing there.
 *
 * So: **zero on the axis**, because "which way is out" has no answer there and any function that
 * commits to one has to flip somewhere. Outward through the middle of the field, where sideways
 * actually helps. Inward past about two thirds out — the tug the storm has on anything that strays
 * into its reach, which is the one piece of the old behaviour worth keeping. And **zero again at the
 * edge**, which is the part that is easy to miss: outside the field there is no force at all, so a
 * curve that is still pulling hard at `|s| = 1` steps by its whole value the moment a hand crosses
 * out. That was worth a hundred pixels a frame on its own after the first fix.
 *
 * Both zeroes come from the `s(1 - s²)` factor, so they cannot be tuned apart by accident. The way
 * out of the middle is not sideways in any case — it is **down**, and down has no sign to flip.
 */
export function swerveAt(soft, strength) {
  const s = clamp(soft, -1, 1);
  return s * (1 - s * s) * (2.4 * strength - 4.3 * s * s);
}

/**
 * Which way round the column this errand goes, and how much it has to go round.
 *
 * Latched on the circuit, like everything else in this scene that must not change its mind: asked
 * once, of where the storm was when the errand set out, and held for the whole flight. A side chosen
 * per frame from where the hand happens to be is a side that inverts the moment the axis crosses the
 * straight line between workshop and temple — and a hand that reverses its detour mid-flight covers
 * the whole width of the frame in one frame.
 */
function detourFor(hand, t, W, H, funnel, midX) {
  const round = Math.floor(t / hand.period + hand.phase);
  const began = (round - hand.phase) * hand.period;
  const storm = vortexAt(W, H, began, funnel, 0.3);
  return {
    side: storm.cx > midX ? -1 : 1,
    block: 1 - clamp(Math.abs(storm.cx - midX) / Math.max(1, storm.wind), 0, 1),
  };
}

export function errandOf(hand, t) {
  const round = Math.floor(t / hand.period + hand.phase);
  const slot = ((round % hand.bays.length) + hand.bays.length) % hand.bays.length;
  return hand.bays[slot];
}

/**
 * What a spirit is carrying — and it is a piece of the exact thing it is on its way to mend.
 *
 * It used to be a blue bar. Not a plank, not a tile: a bar, in the hands' own spectral blue, which
 * said only "this hand is holding something" and was the last place in the scene where a thing was
 * drawn as a placeholder for itself. It also quietly undid the errand work — a hand flying to a
 * *specific* bay while carrying an anonymous stick is a hand that could be going anywhere.
 *
 * Bays run `eaveL, eaveR, wall` up each storey, so a bay's key says what it is, and the piece is
 * drawn in that part's own colours off the temple's own palette: a section of glazed roof in the
 * three-value chord the eaves are drawn with, a timber with its gilt bracket for a wall, a gilded
 * ring for the spire at the top. You can tell what a hand is carrying, and therefore where it is
 * going, before it gets there.
 */
const PART_OF = ['eave', 'eave', 'wall'];

/** What the bay at this key is a piece of. The spire is the one entry that is not a bay of a storey. */
export const pieceKindFor = (bayKey, lastKey) => (bayKey >= lastKey ? 'spire' : PART_OF[bayKey % 3]);

/** The buckets a carried piece can go into, and the temple colour each one is drawn in. */
export const MEND_BUCKETS = ['tileLit', 'tile', 'tileDark', 'postLit', 'post', 'bracket', 'gilt', 'giltLit'];
export const emptyMend = () => Object.fromEntries(MEND_BUCKETS.map((k) => [k, []]));

export function stampPiece(mend, kind, x, y, px, scatter = 0) {
  // Centred on the palm and wider than it, so the grip reads as a grip: fingers over, piece under,
  // and enough of it sticking out either side to have a silhouette of its own.
  //
  // It comes apart with whatever is holding it. Gated on the haul instead, it vanished outright a
  // quarter of the way into a capture — a plank blinking out of a fist is the same pop the hands
  // themselves used to have, just smaller.
  if (scatter >= 1) return;
  const at = (w) => x + px * Math.round((HAND_W - w) / 2);
  const top = y + px * (9 - scatter * scatter * 6);
  if (kind === 'eave') {
    // The roof's own chord on a piece of the roof: lit ridge, glaze, shaded curl beneath.
    mend.tileLit.push(at(7), top, px * 7, px);
    mend.tile.push(at(7), top + px, px * 7, px);
    mend.tileDark.push(at(7), top + px * 2, px * 7, px);
    return;
  }
  if (kind === 'wall') {
    // A dressed timber with the bracket already fitted to one end — the dougong is what a wall of
    // this building is, so a beam without one is a stick.
    mend.postLit.push(at(8), top, px * 8, px);
    mend.post.push(at(8), top + px, px * 8, px);
    mend.bracket.push(at(8), top + px, px, px);
    mend.bracket.push(at(8) + px * 7, top + px, px, px);
    return;
  }
  // A ring off the sōrin: the one piece that is only ever carried to the very top.
  mend.giltLit.push(at(4), top, px * 4, px);
  mend.gilt.push(at(4), top + px, px * 4, px * 2);
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
  const mend = emptyMend();
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
    const bayKey = errandOf(hand, t);
    const site = places[Math.min(places.length - 1, bayKey)];
    if (!site) continue;
    // ...and therefore what it is carrying.
    const kind = pieceKindFor(bayKey, places.length - 1);

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
      // The detour round the column, decided when the errand set out and held for the flight. The
      // bump is zero at both ends, so the workshop and the bay are still hit exactly.
      const round = detourFor(hand, t, W, H, plan.funnel, (bench.x + site.x) / 2);
      const bump = Math.sin(leg * Math.PI);
      x = bench.x + (site.x - bench.x) * leg + round.side * bump * round.block * W * 0.15;
      // The arc goes *over* on a clear run and **under** on a blocked one, on the same bump — the
      // storm's foot is the narrowest part of it, so under is where the way through is.
      y = bench.y + (site.y - bench.y) * leg - bump * H * 0.1 * (1 - round.block * 1.9);
      curl = 0.85;
      flip = site.x < bench.x;
      holds = 'carry';
    } else if (u < 0.82) {
      // Fixing: hovering at the wound and tapping, with the hand opening on each tap. It is still
      // holding the piece until the moment it is fitted, and empty-handed after — which is the same
      // instant `tendingAt` credits it with the mend, so what you see and what the building believes
      // are the same event.
      const tap = Math.sin(((u - FIX_AT + 0.08) / 0.2) * Math.PI * 6);
      x = site.x + px * 2;
      y = site.y + tap * px * 1.5;
      curl = 0.3 + tap * 0.25;
      holds = u < FIX_AT ? 'carry' : (tap > 0.6 ? 'fix' : null);
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
      // Sideways by a **bounded** amount, on a curve that is zero on the axis — see `swerveAt`. The
      // cap matters as much as the shape: `near.wind` is a fraction of the funnel's own width and runs
      // to nine hundred pixels up near the mouth, so a shove expressed as a multiple of it is a shove
      // that can throw a hand off the side of the frame. A twelfth of the frame is more than enough to
      // read as flinching and cannot teleport anything.
      const strength = 0.5 + hand.nerve * 0.5;
      const reach = Math.min(near.wind, W * 0.085);
      x += swerveAt(gap / Math.max(1, near.wind), strength) * reach;
      // ...and it **ducks**, which is the real way out and the only one with no sign to flip. The
      // funnel is a trumpet, so its foot is the narrowest part of it and the wind down there is the
      // weakest; because `up` is derived from `y`, that relief is computed rather than asserted — go
      // low enough and the next frame's `dread` really is smaller.
      y += dread * dread * px * 13;
      // ...and it flinches: fingers spread and the whole thing shakes on a fast clock. How far the
      // fingers go is per-spirit, because when the storm walks onto the temple every hand in the
      // frame flinches at once, and a dozen identical splayed hands in an arc is a stencil.
      curl = clamp(curl - dread * (0.3 + hash2(hand.key, 11) * 0.45), 0, 1);
      y += Math.sin(t * 17 + hand.key * 3) * dread * px * 0.8;
    }
    // The floor is a property of where a spirit may be, not of whether it is frightened. Applied
    // inside the flinch it switched on and off with `dread`, and a hand whose errand already took it
    // below the line stepped up to meet the clamp the instant the storm came within reach.
    y = Math.min(y, groundY - hpx * 5);

    if (state.taken > 0) {
      // Caught, in two acts you can watch separately.
      //
      // **Dragged**, first: the spirit is reeled off its errand onto a wide orbit that tightens onto
      // the column, over two seconds, still fighting — which is the part that was missing. The first
      // version assigned the vortex position outright and the hand vanished from its bench and
      // reappeared on the funnel in one frame; the second lerped it across in half a second, which is
      // a shove rather than a capture. **Then wound up**, over four more, in plain sight.
      const pull = clamp((state.taken * CAUGHT) / DRAG, 0, 1);
      const rise = clamp((state.taken * CAUGHT - DRAG) / CLIMB, 0, 1);
      const grabbed = vortexAt(W, H, t, plan.funnel, rise * 0.92);
      // The orbit is wide when it is first caught and reeled in as it goes, so the spiral is
      // legible — a hand that snaps to the wall has nowhere left to travel and reads as attached.
      //
      // And it is kept on the **front** of the column for the whole ride. `sin(spin) > 0` is the
      // facing rule everything else in the storm obeys, and a spirit given a turn and a half to climb
      // through spent more than half of it behind the funnel: you saw it caught, then a hand appeared
      // and vanished twice somewhere up the column, then nothing. Held inside `(0, π)` it sweeps once
      // across the visible face as it rises — right side to left, crossing in front of the thing that
      // has it, which is the only arrangement where the whole event is legible from one seat.
      // Strictly inside `(0, π)` — the per-spirit offset goes at the *start* of the sweep, not on top
      // of its end. Added to the end it pushed the total to 3.34 radians for one spirit in three, past
      // π, and those hands blinked out a moment before they came apart. Measured: two in sixty seconds.
      const spin = 0.42 + (hand.key % 3) * 0.1 + rise * 1.95 + pull * 0.45;
      const orbit = grabbed.r * (1.05 + (1 - pull) ** 1.6 * 2.1);
      const ease = pull * pull * (3 - 2 * pull);
      x += (grabbed.cx + Math.cos(spin) * orbit - x) * ease;
      y += (groundY - rise * (groundY - H * 0.1) - y) * ease;
      // Wide open while it is losing — a spirit clutching at nothing — then clenched as it goes up.
      curl = clamp(curl + ((rise > 0 ? 0.2 + rise * 0.65 : 0.05) - curl) * ease, 0, 1);
      // Still shaking, and hardest at the moment it is being taken rather than after.
      y += Math.sin(t * 21 + hand.key * 2.3) * (1 - pull) * ease * px;
      flip = Math.cos(spin) < 0;
      // Behind the column once it is riding it — a guard rather than a case now that `spin` cannot
      // leave `(0, π)`, and kept because the day somebody widens that sweep is the day a hand starts
      // being drawn through the funnel it is inside.
      if (rise > 0.05 && Math.sin(spin) < -0.15) continue;
    }

    // Two things carry presence, and they do different jobs. The dither **density** says how solid
    // the spirit is; `scatter` says how much of it is still in one place.
    const solid = 0.2 + 0.5 * state.here * (1 - state.taken * 0.55);
    const scatter = Math.max(state.shred, 1 - state.here);

    // What it is holding, now that it is where it is actually going to be drawn. A spirit being
    // hauled up the funnel keeps hold of its piece and loses it the way it loses everything else —
    // but it has no business still sawing, so the bench work stops the moment it is caught.
    if (holds && (holds === 'carry' || state.taken === 0)) {
      if (holds === 'carry') {
        stampPiece(mend, kind, x, y, hpx, scatter);
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

    // Density alone was the whole of presence once, and a hand that only ever got fainter still had
    // to stop existing on some frame — which is the popping. It comes apart into drifting chunks at
    // both ends of its life now: apart as the storm shreds it at the top of the column, together as
    // it is summoned back.
    stampSpirit(edge, fill, lit, handMask(clamp(curl, 0, 1), dread), x, y, hpx, flip, solid, scatter);

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

    // The tail — separating chunks streaming behind the wrist, each one lagging further back. It
    // thins out with the rest of the spirit, so a hand coming apart does not keep a tidy tail.
    for (let w = 1; w <= 8; w += 1) {
      if (hash2(hand.key * 3.3 + w, Math.floor(t * 4)) < w * 0.1 + scatter * 0.9) continue;
      const sway = Math.sin(t * 1.9 + hand.key * 2.2 - w * 0.7) * hpx * w * 0.3;
      wisp.push(x + hpx * (HAND_W / 2) + sway, y + hpx * (HAND_H + w * 0.9), hpx, hpx);
    }
  }

  // The piece goes on last, in front of the hand that is holding it: fingers over, timber under.
  for (const [cells, colour] of [
    [wisp, LAPIS[2]], [tool, LAPIS[3]], [fill, LAPIS[1]], [lit, LAPIS[0]], [edge, LAPIS[0]],
    [mend.tileDark, JADE[5]], [mend.tile, JADE[3]], [mend.tileLit, JADE[1]],
    [mend.post, LAPIS[4]], [mend.postLit, LAPIS[3]], [mend.bracket, GOLD[3]],
    [mend.gilt, GOLD[1]], [mend.giltLit, GOLD[0]],
  ]) {
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
