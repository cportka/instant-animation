// The border, and what lives on it.
//
// The ground used to be a flat fill and a note saying it was flat on purpose: *"not the subject, and
// anything happening on it would be something to look at instead of the hole."* That was true of a
// picture with nothing on the ground. It stopped being true the moment the ground had a population,
// because a hole with things crawling toward it is not a hole with a distraction next to it — it is
// a hole with a **reason**, and the eye still ends up looking down it.
//
// So the border crawls. Everything out here is:
//
// - **different** — no sprite table. A form is generated from a hash, mirrored down its middle so it
//   reads as a thing with sides rather than as static, which means there are as many shapes as there
//   are seeds and no two crawlers are the same object;
// - **changing** — every few seconds a crawler takes an entirely new form. It does not fade between
//   them; the form is simply a different one, on the beat, in the same 8-bit spirit as everything
//   else here;
// - **shifting, distorting, glitching** — continuously, and each one in its own way, borrowed from
//   the same seven that take things apart at the bottom of the pit. Out here they are applied
//   *partially and forever* rather than run to completion: a crawler is permanently a quarter
//   dissolved, breathing in and out of shape on its own clock. The same alphabet used as a state
//   instead of as an ending;
// - **slowly moving toward the pit** — at a fiftieth of the speed of anything falling. They take a
//   minute and a half to cross the border, which is roughly one eruption, and at the lip they are
//   taken like everything else.
//
// They run on the **flowed** clock, so when the pit stops, the crawling stops with it.

import { hash2 } from '../../effects/field.js';
import { rgba } from '../../lib/draw.js';
import { WAYS, dissolveCell } from './dissolve.js';
import { CRAWL } from './palette.js';
import { edgeOf, scaleAt, snapTo } from './layout.js';

/** Where a crawler enters, in ring scale. Past the frame edge, so none is ever seen arriving. */
const OUTSIDE = 1.16;

/** ...and where it ends: the outer edge of the lip, which is as far as the ground goes. */
const LIP = scaleAt(-0.55);

/** How much of the crossing is spent being taken at the lip. */
const TAKEN = 0.12;

/** How often a crawler takes a new form, in flowed seconds. */
const MORPH = 3.4;

export function planCrawl(rng) {
  return {
    things: Array.from({ length: 96 }, (_, i) => ({
      // Where around the border, and how far across it. Both free, so they are scattered rather
      // than in a ring — a population, not a procession.
      p: rng.next(),
      at: rng.next(),
      // A minute and a half to cross, give or take. Slow enough that you have to *notice* it is
      // moving, which is the difference between a crawl and a march.
      speed: rng.range(0.006, 0.014),
      // Three, four or five cells across. The mixture matters more than any of the sizes.
      span: 3 + (i % 3),
      hue: i % CRAWL.length,
      // Its own way of coming apart, dealt round robin so all seven are out here at once.
      way: WAYS[i % WAYS.length],
      // How hard it churns, and on what clock. Every one of them different, or the border pulses.
      churn: rng.range(0.12, 0.34),
      rate: rng.range(0.35, 1.15),
      seed: rng.range(0, 90),
      phase: rng.range(0, 20),
    })),
  };
}

/**
 * Whether a cell of a crawler's current form is filled.
 *
 * **Mirrored down the middle**, and that one line is what separates a creature from a smear. An
 * unmirrored hash over twenty-five cells is noise — the eye has nothing to hold on to and reads it
 * as damage. Folded in half it reads as a thing with a left and a right, and the shapes that come
 * out of it look *designed* even though nothing designed them.
 */
function formOn(seed, col, row, span) {
  const half = span - 1 - col;
  const c = col < half ? col : half;
  return hash2(seed * 3.7 + c * 5.3 + span, row * 7.1 + seed * 1.9) > 0.42;
}

export function drawCrawl(ctx, W, H, flow, plan, px, tune) {
  const cx = snapTo(W / 2, px);
  const cy = snapTo(H / 2, px);
  const halfW = W / 2;
  const halfH = H / 2;
  const at = [0, 0];
  const cell = [0, 0];
  const buckets = CRAWL.map(() => []);

  const alive = Math.round(plan.things.length * tune.swarm);
  for (let nth = 0; nth < alive; nth += 1) {
    const thing = plan.things[nth];
    // Across the border, and wrapping. Out of the frame at one end and into the pit at the other,
    // so the wrap is never on screen.
    const across = thing.at + flow * thing.speed;
    const q = across - Math.floor(across);
    const s = OUTSIDE + (LIP - OUTSIDE) * q;

    edgeOf(thing.p, at);
    // Constant size, whatever the ring says. This is the one place in the scene where perspective is
    // deliberately *not* applied: the ground is a plane seen from straight above, so everything on it
    // is the same distance from the eye and a thing does not get smaller for being further out. Only
    // what goes over the lip is allowed to shrink.
    const size = px * thing.span * tune.bulk;
    const x0 = snapTo(cx + at[0] * s * halfW - size / 2, px);
    const y0 = snapTo(cy + at[1] * s * halfH - size / 2, px);

    // How dissolved it is right now. It is **never zero**: out here the seven ways are a condition
    // rather than an ending, so a crawler sits permanently part-way apart and breathes in and out of
    // shape. Only at the lip does it run all the way to one and the pit has it.
    const churn = thing.churn * (0.55 + 0.45 * Math.sin(flow * thing.rate + thing.phase));
    const taken = q > 1 - TAKEN ? (q - (1 - TAKEN)) / TAKEN : 0;
    const undone = taken > 0 ? churn + (1 - churn) * taken : churn;
    if (undone >= 1) continue;

    // ...and which form it is wearing. A new one every few seconds, and no transition between them:
    // the shape is simply different on the next beat, which is what the churn is for — a crawler
    // that is already coming apart has nowhere to pop *from*.
    const form = thing.seed + Math.floor(flow / MORPH + thing.phase) * 13.7;
    const into = buckets[thing.hue];
    const mid = (thing.span - 1) / 2;

    for (let row = 0; row < thing.span; row += 1) {
      for (let col = 0; col < thing.span; col += 1) {
        if (!formOn(form, col, row, thing.span)) continue;
        // The seven take a four-by-four sprite, so a three or five wide one is asked about the cell
        // it most nearly is. They are distortions, not indexes; nothing here needs them exact.
        const c4 = Math.round(((col - mid) / Math.max(1, mid)) * 1.5 + 1.5);
        const r4 = Math.round(((row - mid) / Math.max(1, mid)) * 1.5 + 1.5);
        if (!dissolveCell(thing.way, c4, r4, undone, thing.seed, -at[0], -at[1], cell)) continue;
        into.push(
          x0 + col * px + Math.round(cell[0] * px * 0.5),
          y0 + row * px + Math.round(cell[1] * px * 0.5),
        );
      }
    }
  }

  for (let hue = 0; hue < CRAWL.length; hue += 1) {
    const list = buckets[hue];
    if (!list.length) continue;
    ctx.fillStyle = rgba(CRAWL[hue], 1);
    ctx.beginPath();
    for (let i = 0; i < list.length; i += 2) ctx.rect(list[i], list[i + 1], px, px);
    ctx.fill();
  }
}
