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
 * The four crafts, where they stand along the horizon, and **what each one makes**.
 *
 * That last column is the change that matters. A spirit's craft used to be a fixed property of the
 * spirit — slot index modulo three — so a hand could spend its whole working life at the glass bench
 * and then carry a roof tile to the temple. That is the same incoherence the anonymous blue plank
 * was: the errand said one thing and the labour said another. The craft now **follows the errand**,
 * so a hand bound for an eave is at the kiln firing a tile, and one bound for a wall is at the mill.
 *
 * It also spreads them out. Two of the three benches used to sit at 0.72 and 0.87, which is why the
 * hands gathered in one corner and waited: most errands started there whatever they were for. Four
 * benches across the frame, chosen by what the building needs, and the traffic is spread by
 * construction rather than by luck.
 */
const SHOPS = [
  { kind: 'mill', at: 0.1, beat: 1.7 },
  { kind: 'forge', at: 0.2, beat: 2.6 },
  { kind: 'kiln', at: 0.55, beat: 1.1 },
  { kind: 'glass', at: 0.85, beat: 2.3 },
];
/** Which bench makes which piece. The one place the two halves are tied together. */
const SHOP_FOR = {
  wall: 0, bracket: 1, spire: 1, eave: 2, lantern: 3,
};

export function planHands(rng, bayCount = 27) {
  // Twelve slots rather than twelve hands. A slot is not always occupied: the storm takes them, and
  // a new one is summoned into the empty slot a while later — so the population breathes, and the
  // hands you are watching are not the hands you started with.
  const hands = Array.from({ length: 12 }, (_, i) => ({
    key: i,
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
        : shop.kind === 'mill'
          // A sawmill has no fire in it. One lamp so the shed is not a dead lump, and nothing else —
          // the mill is the one bench whose work is lit by somebody else's light.
          ? 0.3
          : 0.45 + 0.55 * Math.max(0, Math.sin(t * shop.beat));
    ember.push(x - bpx, horizonY - bpx * 2, heat);
    if (shop.kind !== 'mill') ember.push(x, horizonY - bpx * 2, heat * 0.8);

    // ...and what the craft throws off. The forge showers sparks, the kiln breathes smoke, the
    // glass bench sends up one slow bright gather at a time.
    // ...and the mill throws none of it, because a sawmill has no fire in it. A shed with a plume
    // over it is a shed that is burning something, and that one had nothing to burn.
    const jets = shop.kind === 'forge' ? 5 : shop.kind === 'kiln' ? 3 : shop.kind === 'mill' ? 0 : 2;
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

function spiritAt(hand, t, W, H, funnel, seed, lastBay) {
  const cycles = t / hand.life + hand.born;
  const n = Math.floor(cycles);
  const began = (n - hand.born) * hand.life;
  const age = (cycles - n) * hand.life;
  // Which bench this spirit was standing at when its round turned over — asked of the errand it was
  // on *then*, not of the one it is on now, because the whole question is where the storm was
  // relative to where the spirit was at that instant. A craft that follows the errand moves the
  // bench around, so the answer has to be looked up at the epoch like everything else here.
  const bench = SHOPS[SHOP_FOR[pieceKindFor(errandOf(hand, began), lastBay)]].at * W;

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
/**
 * What the bay at this key is a piece of. The spire is the one entry that is not a bay of a storey.
 *
 * Every part of this building takes **two** materials, and saying so is what keeps four benches busy
 * instead of one. An eave is glazed tile *and* the gilt bracket course under it; a wall is posts
 * *and* the lattice windows with a lamp behind them. Bays run `eaveL, eaveR, wall` up each storey,
 * so the eaves split by side and the walls by storey, and the traffic comes out near enough
 * two-two-one-one across kiln, forge, mill and glass.
 *
 * Mapping every eave to tile was the first cut and it was hopeless arithmetic: a pagoda is mostly
 * roof, so the kiln drew two thirds of all errands and the forge drew one bay in twenty-two. The
 * sawmill stood empty for most of a minute at a time, which is no way to show somebody a sawmill.
 */
export function pieceKindFor(bayKey, lastKey) {
  if (bayKey >= lastKey) return 'spire';
  const part = bayKey % 3;
  if (part === 0) return 'eave';
  if (part === 1) return 'bracket';
  return Math.floor(bayKey / 3) % 2 ? 'lantern' : 'wall';
}

/**
 * Where a spirit stands for each of the three acts of its craft, in chunks from its bench.
 *
 * The work used to be one station and a wiggle: a hand held its place for three or four seconds,
 * jiggled, and was then holding a finished piece. Nothing was made on screen, which is the whole
 * point of having crafts at all. Three stations means the hand **walks its bench** — out to the trees
 * and back with a log, along the kiln from wheel to fire to the cooling floor — and walking between
 * marked places is what reads as a process rather than as waiting.
 */
const STATIONS = {
  mill: [[-8, 2], [-4, 1], [0, 0]],
  forge: [[3, 0], [-1, 1], [-5, 1]],
  kiln: [[-5, 1], [0, 0], [5, -1]],
  glass: [[4, 0], [0, -2], [-5, -1]],
};

/** What each act is called, in order — the three beats of each craft. */
const ACTS = {
  mill: ['fell', 'haul', 'saw'],
  forge: ['smelt', 'pour', 'hammer'],
  kiln: ['throw', 'fire', 'draw'],
  glass: ['gather', 'blow', 'shape'],
};

/**
 * How a spirit holds itself through one act, and how fast it is moving while it does it.
 *
 * The gesture is the other half of the read. A hand that swings on a slow heavy arc is chopping; one
 * that shuttles fast and flat is sawing; one that turns slowly with an open grip is working glass.
 * All of it is `curl` and two offsets, which is everything a hand built from a pose parameter can do
 * and nothing a fixed sprite could have done at all.
 */
function gestureAt(craft, act, into, t, key) {
  const beat = (rate, phase = 0) => Math.sin(t * rate + key * 1.7 + phase);
  switch (`${craft}:${act}`) {
    // Heavy, slow, and mostly vertical: the axe comes up and comes down.
    case 'mill:fell': return { dx: beat(4.4) * 1.6, dy: Math.abs(beat(4.4)) * 2.6, curl: 0.92 };
    // Leaning into a load, and the load is heavy enough to rock the walk.
    case 'mill:haul': return { dx: 0, dy: Math.abs(beat(3.1)) * 0.9, curl: 0.95 };
    // Fast, flat, and along one axis — a saw is the one gesture with no vertical in it.
    case 'mill:saw': return { dx: beat(7.5) * 2.8, dy: 0, curl: 0.6 + beat(7.5) * 0.3 };
    case 'forge:smelt': return { dx: beat(2.2) * 1.1, dy: beat(2.2, 1.6) * 0.8, curl: 0.88 };
    // Tipping: a slow one-way lean rather than a cycle, because a pour happens once.
    case 'forge:pour': return { dx: into * 2.2, dy: into * 1.4, curl: 0.95 };
    case 'forge:hammer': return { dx: 0, dy: Math.max(0, beat(9)) * 3.4, curl: 0.9 };
    // Turning something soft: the grip opens and closes as the clay comes round.
    case 'kiln:throw': return { dx: beat(5.2) * 0.9, dy: 0, curl: 0.45 + beat(5.2, 1) * 0.35 };
    // Pushing it in, then holding still while it fires.
    case 'kiln:fire': return { dx: Math.min(1, into * 2) * 2.4, dy: 0, curl: 0.7 };
    case 'kiln:draw': return { dx: -into * 2.6, dy: beat(3.4) * 0.5, curl: 0.95 };
    case 'glass:gather': return { dx: beat(1.9) * 1.4, dy: beat(1.9, 0.8) * 1.1, curl: 0.9 };
    // Steady — the one act in the scene where a hand deliberately does not move much.
    case 'glass:blow': return { dx: 0, dy: beat(1.1) * 0.4, curl: 0.8 };
    default: return { dx: beat(2.6) * 1.2, dy: 0, curl: 0.4 + beat(2.6) * 0.25 };
  }
}

/** The buckets a carried piece can go into, and the temple colour each one is drawn in. */
export const MEND_BUCKETS = ['tileLit', 'tile', 'tileDark', 'postLit', 'post', 'bracket', 'gilt', 'giltLit'];
export const emptyMend = () => Object.fromEntries(MEND_BUCKETS.map((k) => [k, []]));

/**
 * What is on the bench during one act of one craft — the tools, the fire, and the tree.
 *
 * Emitted after the storm has had its say, so a spirit that flinches takes its axe with it. `px` is
 * the hand's own chunk, so every prop is sized against the hand holding it.
 */
function craftProps(craft, act, into, t, key, x, y, px, groundY, props) {
  const { tool, hot, bough, boughLit } = props;
  const mid = x + px * (HAND_W / 2);
  switch (`${craft}:${act}`) {
    case 'mill:fell': {
      // A conifer in the same tiers the forest is drawn in, leaning further with every stroke and
      // down by the end of the act. This is the one place the timber visibly *comes from* somewhere.
      //
      // It stands on the **ground line**, not on an offset from the hand: measured off the hand it
      // was drawn half buried, because the hand hovers and the ground does not.
      const lean = into * into * 11;
      const foot = groundY - px;
      for (let r = 0; r < 10; r += 1) {
        const wide = r < 3 ? 1 : Math.max(1, 5 - Math.floor((r - 3) / 2));
        const shift = Math.round((lean * r) / 10);
        (r < 3 ? bough : boughLit).push(
          mid - px * (3 + Math.floor(wide / 2)) + shift * px, foot - r * px, px * wide, px,
        );
      }
      // The axe, and the chips coming off the cut.
      const swing = Math.sin(t * 4.4 + key * 1.7);
      tool.push(x - px * 3, y + px * (8 + swing * 1.5), px * 5, px);
      if (swing > 0.7) {
        for (let s = 0; s < 3; s += 1) hot.push(mid - px * (4 + s), foot - px * (1 + s), 0.15);
      }
      return;
    }
    case 'mill:haul':
      // Dragging it: the log is behind the hand, not in it.
      tool.push(x - px * 7, y + px * 11, px * 9, px * 2);
      return;
    case 'mill:saw': {
      // The frame saw, and the dust it throws.
      for (let i = 0; i < 8; i += 1) tool.push(x + px * (i - 4), y + px * (12 + (i % 2) * 0.5), px, px * 0.6);
      if (Math.abs(Math.sin(t * 7.5 + key * 1.7)) > 0.6) hot.push(mid, y + px * 14, 0.15);
      return;
    }
    case 'forge:smelt':
      // A crucible with the melt rising in it.
      tool.push(x + px * 3, y + px * 10, px * 5, px * 3);
      hot.push(x + px * 4, y + px * (12 - into * 1.6), 0.8);
      hot.push(x + px * 6, y + px * (12 - into * 1.6), 0.95);
      return;
    case 'forge:pour':
      // A thread of it going into the mould, getting shorter as the crucible empties.
      for (let s = 0; s < 4; s += 1) {
        if (s / 4 > 1 - into * 0.6) continue;
        hot.push(x + px * (4 + s * 0.5), y + px * (10 + s * 1.6), 0.95 - s * 0.12);
      }
      tool.push(x + px * 2, y + px * 15, px * 6, px);
      return;
    case 'forge:hammer': {
      tool.push(x - px, y + px * 14, px * 7, px * 2);
      const blow = Math.max(0, Math.sin(t * 9 + key * 1.7));
      if (blow > 0.85) for (let s = 0; s < 5; s += 1) hot.push(mid + px * (s - 2) * 1.3, y + px * (13 - s * 0.6), 1);
      return;
    }
    case 'kiln:throw':
      // The wheel: a flat disc under the hands with the clay turning on it.
      tool.push(x - px * 2, y + px * 13, px * 9, px);
      return;
    case 'kiln:fire':
      // The mouth of the kiln, and it flares as the piece goes in.
      tool.push(x + px * 5, y + px * 8, px * 4, px * 6);
      hot.push(x + px * 6, y + px * 11, 0.75 + Math.min(1, into * 2) * 0.25);
      hot.push(x + px * 6, y + px * 13, 0.9);
      return;
    case 'kiln:draw':
      // Tongs, with the piece still glowing in their mouth.
      tool.push(x + px * 6, y + px * 9, px * 5, px * 0.7);
      tool.push(x + px * 6, y + px * 11, px * 5, px * 0.7);
      return;
    case 'glass:gather':
      // The pipe, into the furnace and out again with a gather on the end.
      tool.push(x + px * 2, y + px * 10, px * 9, px * 0.8);
      hot.push(x + px * 10, y + px * 10, 1);
      return;
    case 'glass:blow':
      tool.push(x + px * 2, y + px * 10, px * 8, px * 0.8);
      hot.push(x + px * 9, y + px * 10, 0.95);
      return;
    default:
      // glass:shape — the jacks, closing on the piece as it is worked.
      tool.push(x + px * 3, y + px * (9 + into), px * 5, px * 0.7);
      tool.push(x + px * 3, y + px * (12 - into), px * 5, px * 0.7);
  }
}

export function stampPiece(mend, kind, x, y, px, scatter = 0, made = 1) {
  // Centred on the palm and wider than it, so the grip reads as a grip: fingers over, piece under,
  // and enough of it sticking out either side to have a silhouette of its own.
  //
  // It comes apart with whatever is holding it. Gated on the haul instead, it vanished outright a
  // quarter of the way into a capture — a plank blinking out of a fist is the same pop the hands
  // themselves used to have, just smaller.
  if (scatter >= 1) return;
  const at = (w) => x + px * Math.round((HAND_W - w) / 2);
  const top = y + px * (9 - scatter * scatter * 6);

  // `made` runs 0 to 1 across the three acts of the craft, and the thing in the hand **changes with
  // it**. That is the difference between a hand that works and a hand that waits: you watch a lump of
  // clay go into the kiln dull, come out gold, and cool to glaze; a log arrive rough and leave
  // dressed; a gather swell and become a lantern. It is the same few rectangles either way — what
  // costs nothing is deciding *which* few.
  if (kind === 'eave') {
    if (made < 0.38) {
      // Wet clay, unfired: the roof's own material with none of its glaze yet.
      mend.tileDark.push(at(6), top, px * 6, px * 2);
      return;
    }
    if (made < 0.72) {
      // Out of the fire, still hot enough to be its own light source.
      mend.gilt.push(at(7), top, px * 7, px);
      mend.bracket.push(at(7), top + px, px * 7, px * 2);
      return;
    }
    // The roof's own chord on a piece of the roof: lit ridge, glaze, shaded curl beneath.
    mend.tileLit.push(at(7), top, px * 7, px);
    mend.tile.push(at(7), top + px, px * 7, px);
    mend.tileDark.push(at(7), top + px * 2, px * 7, px);
    return;
  }
  if (kind === 'wall') {
    if (made < 0.45) {
      // A log: round, bark-dark, and a chunk longer than the beam it will be cut into.
      mend.post.push(at(9), top, px * 9, px * 2);
      return;
    }
    // A dressed timber with the bracket already fitted to one end — the dougong is what a wall of
    // this building is, so a beam without one is a stick.
    mend.postLit.push(at(8), top, px * 8, px);
    mend.post.push(at(8), top + px, px * 8, px);
    mend.bracket.push(at(8), top + px, px, px);
    mend.bracket.push(at(8) + px * 7, top + px, px, px);
    return;
  }
  if (kind === 'bracket') {
    if (made < 0.4) {
      mend.gilt.push(at(4), top + px, px * 4, px);
      return;
    }
    if (made < 0.75) {
      mend.giltLit.push(at(5), top, px * 5, px * 2);
      return;
    }
    // A dougong block: the stepped bracket that carries an eave, and the reason the course under
    // every roof in this building reads as carpentry rather than as trim.
    mend.bracket.push(at(6), top, px * 6, px);
    mend.gilt.push(at(4), top + px, px * 4, px);
    mend.bracket.push(at(2), top + px * 2, px * 2, px);
    return;
  }
  if (kind === 'lantern') {
    if (made < 0.35) {
      // A gather on the end of the pipe: molten, and nothing yet but bright.
      mend.giltLit.push(at(3), top + px, px * 3, px * 2);
      return;
    }
    if (made < 0.7) {
      // Blown out — bigger every second, and still all light and no frame.
      const w = 3 + Math.round((made - 0.35) * 8);
      mend.gilt.push(at(w), top, px * w, px);
      mend.giltLit.push(at(w), top + px, px * w, px * 2);
      return;
    }
    // Finished: a lattice frame with the light shut inside it, which is what a temple lamp is.
    mend.post.push(at(5), top, px * 5, px * 4);
    mend.giltLit.push(at(5) + px, top + px, px * 3, px * 2);
    mend.post.push(at(5) + px * 2, top + px, px, px * 2);
    return;
  }
  if (made < 0.4) {
    // A pool of it in the crucible.
    mend.gilt.push(at(4), top + px, px * 4, px);
    return;
  }
  if (made < 0.75) {
    // Poured, and not yet struck into anything.
    mend.giltLit.push(at(4), top, px * 4, px * 2);
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
  const bough = [];
  const boughLit = [];
  const mend = emptyMend();
  // A hand is drawn at the size of the thing it is carrying rather than at the size of a hand — a
  // lie the eye takes without complaint, because there is no other hand in frame to measure against.
  const hpx = Math.max(2, Math.round(px * 0.72));

  for (const hand of plan.hands) {
    const state = spiritAt(hand, t, W, H, plan.funnel, plan.seed, places.length - 1);
    if (state.here <= 0) continue;

    const u = wrap01(t / hand.period + hand.phase);
    // The bay it is answerable for this circuit — the same one `tendingAt` will credit it with
    // mending, which is the whole of the correspondence.
    const bayKey = errandOf(hand, t);
    const site = places[Math.min(places.length - 1, bayKey)];
    if (!site) continue;
    // ...and therefore what it is carrying, and therefore **which bench it is standing at**. The
    // craft follows the errand, so a spirit bound for an eave spends its shift at the kiln.
    const kind = pieceKindFor(bayKey, places.length - 1);
    const shop = SHOPS[SHOP_FOR[kind]];

    // Clear of the shed roofs. At eight chunks the spirits stood knee-deep in the workshops and half
    // of every hand was down in the dark ground band where the drawing is lost.
    const bench = { x: shop.at * W, y: groundY - px * 11 };

    let x;
    let y;
    let curl = 0.2;
    let flip = false;
    // What the hand is holding, emitted *after* the storm has had its say — otherwise the plank and
    // the blowpipe stay where the hand would have been if it had not flinched, and a spirit that gets
    // shoved out of the wind leaves its work hanging in the air behind it.
    let holds = null;
    // How far through making the thing it is making, and which of the three acts it is on.
    let made = 1;
    let act = null;
    let into = 0;

    if (u < 0.34) {
      // Working, and working is now three acts rather than one wiggle: the spirit walks its bench
      // between three marked stations, and both what it is doing and what is in its hand change on
      // the way. Which act it is on is `t` and nothing else, like everything here.
      made = u / 0.34;
      const beat = made * 3;
      const step = Math.min(2, Math.floor(beat));
      into = clamp(beat - step, 0, 1);
      act = ACTS[shop.kind][step];
      // It slides between stations over the first fifth of each act, so the walk is visible and the
      // remaining four fifths are spent actually doing the thing.
      const was = STATIONS[shop.kind][Math.max(0, step - 1)];
      const now = STATIONS[shop.kind][step];
      const walk = clamp(into / 0.2, 0, 1);
      const ease = walk * walk * (3 - 2 * walk);
      const pose = gestureAt(shop.kind, act, into, t, hand.key);
      x = bench.x + (was[0] + (now[0] - was[0]) * ease) * px + pose.dx * px;
      y = bench.y + (was[1] + (now[1] - was[1]) * ease) * px + pose.dy * px;
      curl = pose.curl;
      flip = now[0] < was[0] || (step === 0 && shop.kind === 'mill');
      // The mill's first act is out among the trees with an axe, and there is no piece yet — the
      // timber does not exist until the tree is down.
      holds = shop.kind === 'mill' && step === 0 ? 'work' : 'carry';
    } else if (u < 0.62) {
      const leg = (u - 0.34) / 0.28;
      // It leaves from the **last station of its shift**, not from the middle of the bench. A spirit
      // that finishes hammering five chunks to the left of its anvil and then departs from the anvil
      // has jumped those five chunks in one frame.
      const off = STATIONS[shop.kind][2];
      const from = { x: bench.x + off[0] * px, y: bench.y + off[1] * px };
      // The detour round the column, decided when the errand set out and held for the flight. The
      // bump is zero at both ends, so the workshop and the bay are still hit exactly.
      const round = detourFor(hand, t, W, H, plan.funnel, (from.x + site.x) / 2);
      const bump = Math.sin(leg * Math.PI);
      x = from.x + (site.x - from.x) * leg + round.side * bump * round.block * W * 0.15;
      // The arc goes *over* on a clear run and **under** on a blocked one, on the same bump — the
      // storm's foot is the narrowest part of it, so under is where the way through is.
      y = from.y + (site.y - from.y) * leg - bump * H * 0.1 * (1 - round.block * 1.9);
      curl = 0.85;
      flip = site.x < from.x;
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
      // Home is the bench of the **next** errand, because that is where this spirit will be standing
      // when it gets there. Now that the craft follows the errand, flying back to the bench it left
      // and then starting work at a different one is a teleport — and a four-hundred-pixel one when
      // the next piece is made somewhere else, which is most of the time.
      const nextShop = SHOPS[SHOP_FOR[pieceKindFor(errandOf(hand, t + hand.period), places.length - 1)]];
      const off = STATIONS[nextShop.kind][0];
      const home = { x: nextShop.at * W + off[0] * px, y: bench.y + off[1] * px };
      x = site.x + (home.x - site.x) * leg;
      y = site.y + (home.y - site.y) * leg - Math.sin(leg * Math.PI) * H * 0.06;
      curl = 0.15;
      flip = home.x < site.x;
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
      if (holds === 'carry') stampPiece(mend, kind, x, y, hpx, scatter, made);
      else if (holds === 'fix') hot.push(x + px * 4, y + px * 7, 0.45);
    }
    // ...and the bench around it, which only exists while it is working and only while the storm has
    // not taken it. The axe goes with the hand that swings it.
    if (act && state.taken === 0) {
      craftProps(shop.kind, act, into, t, hand.key, x, y, hpx, groundY, { tool, hot, bough, boughLit });
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

  // The tree being felled goes first of all — it is behind the spirit cutting it — then the piece
  // last, in front of the hand holding it: fingers over, timber under.
  for (const [cells, colour] of [
    [bough, JADE[6]], [boughLit, JADE[5]],
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
