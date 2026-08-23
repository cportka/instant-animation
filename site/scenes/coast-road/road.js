// The road: the band the rider is on, and everything standing beside it.
//
// The brief asks for *highway changes to local road changes back*, and for *overpasses and bridges*.
// None of that is drawn as a transition. Every object here — every lamp, barrier post, kerb stone,
// gantry and railing — asks `world.js` what kind of place it is standing in and answers for itself,
// so a change of road arrives the way it does from a saddle: the barrier runs out, the last gantry
// goes over, and the street lamps start. It sweeps across the frame at exactly the speed you are
// travelling, because that is what it is.
//
// The road is a **band with depth**, not a line. Three lanes across it, the far one drawn smaller
// and higher and the near one bigger and lower, which is how every side-on game with traffic in it
// has ever worked: it costs one multiply per object and it is the only reason "around occasional
// vehicles" can mean anything in a side view at all.

import { clamp, lerp } from '../../lib/draw.js';
import { bayerOn, chunk, ditherGlow, ditherRamp, hash01, pixelSize, snap } from '../../effects/pixel.js';
import {
  BRIDGE, HIGHWAY, LAMP_PITCH, LANES, LOCAL, OVER_PITCH, SEG_LEN,
  kindAt, lampXAt, overpassAt, riseAt, travelAt,
} from './world.js';

/* ------------------------------------------------------------- geometry ---- */

/**
 * Where the sky stops and the bay starts — and this line is the composition.
 *
 * The city stands **across the water**, not beside the road, and getting that wrong the first time
 * cost the scene its whole subject: with the blocks planted on the near shore they are simply a wall
 * across the middle of the frame, and the bay, the far skyline and the moon's column on it are all
 * behind that wall. *Beachside* metropolis means you can see the beach and the sea from the road.
 * So the order down the frame is sky, far skyline, near blocks, **water**, shore, road.
 */
const HORIZON = 0.5;
/** ...where the water meets the shore. */
const SHORE = 0.615;
/** ...and the road band itself. */
const ROAD_TOP = 0.645;
const ROAD_BAND = 0.245;

/** Where the rider sits across the frame. Left of centre: the road ahead is what you are watching. */
const BIKE_AT = 0.34;

/** How much smaller the far lane is drawn than the near one. */
const FAR = 0.8;
const NEAR = 1.16;

/**
 * Everything the frame needs to know about where it is, worked out once a frame.
 *
 * `span` is the lens — how much world is across the picture — and it is what the `pace` knob moves.
 * Everything else is derived from it, which is why one knob can make the whole world close in and
 * hammer past without the rider's position in the world changing by a single unit.
 */
export function viewAt(ctx, W, H, t, tune, origin) {
  const px = Math.max(2, Math.round(pixelSize(W, H) * tune.grain));
  // How much world the frame shows, narrowed on a tall window.
  //
  // A span fixed in world units is the same *composition* at every size, which is usually what this
  // gallery wants — and here it is wrong. The subject of a side-scroller is one object about a
  // fourteenth of the frame wide, and a fourteenth of a phone in portrait is forty pixels: a rider
  // you cannot see is riding. So a narrow window is handed less road rather than a smaller bike,
  // which is what a game would do with the same problem.
  const span = tune.span * (0.55 + 0.45 * clamp(W / H / 1.6, 0.3, 1));
  const pxu = W / span;
  // **The seed's whole job is to decide which mile of the road this run came in on.**
  // The world is a function of position, so an offset in position is a different road: different
  // segments, different bridges, different lamps, different traffic, all of it consistent because
  // all of it is downstream of the same coordinate. One number, and no lattice has to know.
  const travel = travelAt(t) + origin;
  const lift = riseAt(travel, tune.lift);
  const top = snap(H * ROAD_TOP, px);
  const band = snap(H * ROAD_BAND, px);
  return {
    ctx, W, H, px, span, pxu, travel, t,
    // The world position at the left edge of the frame.
    camX: travel - span * BIKE_AT,
    top,
    band,
    bottom: top + band,
    // **The horizon does not move.** An earlier build sank the whole backdrop as the deck climbed a
    // causeway, on the reasoning that rising takes you above what you are looking at. It does, by
    // about eight metres — and the city is a mile away across the bay, so the true shift is a couple
    // of pixels, not the eighty it was drawing. What that actually looked like was the skyline
    // bobbing up and down every time a bridge went by, which reads as a bug in the renderer rather
    // than as a hill. The climb is told instead by the things that are genuinely near: the railing
    // opening up, the water arriving under the deck, and the lamps changing to masts.
    horizon: snap(H * HORIZON, px),
    shore: snap(H * SHORE, px),
    pal: tune.pal,
    tune,
  };
}

/** World x to screen x. */
export const sx = (view, x) => (x - view.camX) * view.pxu;
/** Lane depth (0 far, 1 near) to screen y. */
export const ly = (view, lane) => view.top + lane * view.band;
/** ...and how big something in that lane is drawn. */
export const lz = (lane) => lerp(FAR, NEAR, lane);

/** Walk every cell of a world lattice that could touch the frame, with a margin for wide objects. */
function eachCell(view, pitch, margin, run) {
  const from = Math.floor((view.camX - margin) / pitch);
  const to = Math.floor((view.camX + view.span + margin) / pitch);
  for (let n = from; n <= to; n += 1) run(n);
}

/* ------------------------------------------------------------ the water ---- */

/**
 * The strip between the shore and the road: promenade on land, open water on a bridge.
 *
 * Drawn as **runs of columns**, each column asking the world what it is standing over. That is the
 * whole mechanism of the road changing, in its simplest form — nothing here knows a segment boundary
 * exists, and the boundary still arrives exactly where and when it should, on the chunk grid, at the
 * speed of travel.
 */
export function drawVerge(view) {
  const { W, px, pal } = view;
  const top = view.shore;
  const bottom = view.top;
  if (bottom - top < px) return;

  for (const [kind, step, ramp] of [[BRIDGE, 2, 'sea'], [LOCAL, 1, 'land'], [HIGHWAY, 1, 'land']]) {
    view.ctx.fillStyle = pal[ramp][step];
    view.ctx.beginPath();
    let drew = false;
    for (let x = 0; x < W + px; x += px) {
      const at = view.camX + x / view.pxu;
      if (kindAt(at) !== kind) continue;
      chunk(view.ctx, x, top, px, bottom - top, px);
      drew = true;
    }
    if (drew) view.ctx.fill();
  }

  // The lit edge where the land meets the deck, and the glitter where the water does. One row of
  // chunks, and it is what stops the verge reading as a flat bar of colour behind the road.
  const ctx = view.ctx;
  ctx.fillStyle = pal.sea[4];
  ctx.beginPath();
  let drew = false;
  for (let x = 0; x < W + px; x += px) {
    const at = view.camX + x / view.pxu;
    if (kindAt(at) !== BRIDGE) continue;
    const row = Math.round(x / px);
    if (!bayerOn(row, Math.round(view.t * 2.4) + row, 0.3 + 0.4 * hash01(row * 0.7 + Math.floor(view.t * 3)))) continue;
    chunk(ctx, x, top + ((row * 7) % Math.max(1, Math.round((bottom - top) / px))) * px, px, px, px);
    drew = true;
  }
  if (drew) ctx.fill();

  ctx.fillStyle = pal.land[3];
  ctx.beginPath();
  drew = false;
  for (let x = 0; x < W + px; x += px) {
    const at = view.camX + x / view.pxu;
    if (kindAt(at) === BRIDGE) continue;
    chunk(ctx, x, bottom - px * 2, px, px * 2, px);
    drew = true;
  }
  if (drew) ctx.fill();
}

/* ----------------------------------------------------------- the tarmac ---- */

/**
 * The road surface: four steps of asphalt, far to near, with the joins dithered.
 *
 * A flat fill would be the honest 16-bit answer and it is wrong here, because a side-on road *is*
 * its depth — the only thing telling you the far lane is further away is that it is darker and
 * higher. Four bands is enough to say so and few enough to still read as flat colour.
 */
export function drawSurface(view) {
  const { ctx, W, px, pal } = view;
  ditherRamp(ctx, W, view.top, view.bottom, [pal.road[1], pal.road[2], pal.road[3]], px, { blend: 0.42 });

  // The lane lines. Dashes on a world lattice, so they stream past at the speed of the road rather
  // than at some rate of their own — the one place in a scrolling scene where a wrong number is
  // instantly obvious, because everybody has watched a road go by.
  const dash = 13;
  for (let i = 1; i < LANES.length; i += 1) {
    const lane = (LANES[i] + LANES[i - 1]) / 2;
    const y = ly(view, lane);
    const wide = Math.max(px, px * lz(lane) * 1.6);
    ctx.fillStyle = pal.road[4];
    ctx.beginPath();
    let drew = false;
    eachCell(view, dash * 2, dash, (n) => {
      const at = n * dash * 2;
      if (kindAt(at) === LOCAL && i === 2) return;
      chunk(ctx, sx(view, at), y, dash * view.pxu, wide, px);
      drew = true;
    });
    if (drew) ctx.fill();
  }

  // The edge lines: solid, and only where the road has a shoulder to have one against.
  ctx.fillStyle = pal.road[4];
  ctx.beginPath();
  let drew = false;
  for (let x = 0; x < W + px; x += px) {
    if (kindAt(view.camX + x / view.pxu) === LOCAL) continue;
    chunk(ctx, x, view.top, px, px, px);
    chunk(ctx, x, view.bottom - px, px, px, px);
    drew = true;
  }
  if (drew) ctx.fill();
}

/**
 * A light given back by the wet road: a wedge running toward the viewer, brightest at the top.
 *
 * `ditherGlow` was the obvious tool and it is the wrong shape. Squashed narrow enough to read as a
 * reflection it becomes a sparse dotted string, because a tall thin ellipse simply has very few
 * chunks in it — and what you get is a vertical row of specks rather than light on a road.
 *
 * A real reflection is a **wedge**: pinned and bright directly under its source, spreading and
 * fading as it comes toward you, because the nearer water is at a shallower angle to your eye. That
 * shape is one scanline loop and it is unmistakable — nobody looks at it and asks what it is, which
 * was the whole complaint about the version before this one.
 */
function smear(ctx, cx, top, height, wide, colour, strength, px) {
  if (height < px || wide < px || strength <= 0.02) return;
  ctx.fillStyle = colour;
  ctx.beginPath();
  const rows = Math.max(1, Math.round(height / px));
  for (let r = 0; r < rows; r += 1) {
    const down = r / rows;
    const half = wide * (0.3 + down * 1.1);
    const density = strength * (1 - down) ** 1.4;
    if (density < 0.03) continue;
    const y = snap(top + r * px, px);
    const row = Math.round(y / px);
    for (let x = snap(cx - half, px); x <= cx + half; x += px) {
      const across = 1 - Math.abs(x + px / 2 - cx) / half;
      if (across <= 0) continue;
      if (bayerOn(Math.round(x / px), row, density * across ** 0.55)) ctx.rect(x, y, px, px);
    }
  }
  ctx.fill();
}

/**
 * The sheen: the road is wet, and the wet is where the lights are.
 *
 * A column of dithered light under every lamp, smeared down the band and stretched by the lane
 * depth. It reads the same `lightAt` the rider's gear does, so when a lamp goes by the road and the
 * rider brighten together — which is most of what makes a night scene feel lit rather than tinted.
 */
export { smear };

export function drawSheen(view) {
  const { ctx, px, pal, tune } = view;

  eachCell(view, LAMP_PITCH, LAMP_PITCH, (n) => {
    const x = sx(view, lampXAt(n));
    if (x < -view.W * 0.2 || x > view.W * 1.2) return;
    // Three wedges nested inside each other — pale bronze at the top where the lamp is, through the
    // deeper glow, out to the ember that reaches the near kerb. **This is the only colour on the
    // road, and it has a source you can see directly above it.** An earlier build laid the strip's
    // neon down here on a lattice of its own — magenta and cyan blooms with nothing above them
    // casting anything — and what that looks like is a coloured blob sliding along the ground.
    const wide = Math.max(px, view.pxu * 2 * tune.glow);
    smear(ctx, x, view.top, view.band * 1.05, wide * 1.5, pal.hard.ember, 0.5 * tune.glow, px);
    smear(ctx, x, view.top, view.band * 0.72, wide, pal.hard.glow, 0.72 * tune.glow, px);
    smear(ctx, x, view.top, view.band * 0.34, wide * 0.6, pal.hard.bronze, 0.95 * tune.glow, px);
  });
}

/* --------------------------------------------------------- the furniture ---- */

/** How tall a lamp stands, in world units, and how far its head reaches over the road. */
const LAMP_H = 11;

/**
 * Lamps, barriers, kerbs and railings — everything that stands beside the road and knows what kind
 * of road it is beside.
 *
 * Drawn in two passes with the traffic between them: the far side goes behind everything on the
 * road, the near side goes in front. That is the whole of the depth here, and it is enough — a
 * barrier post that passed *behind* the near lane would flatten the band into a stripe.
 */
export function drawFarSide(view) {
  const { ctx, px, pal, tune } = view;
  const H = LAMP_H * view.pxu * tune.tall;
  const foot = view.top;

  // The lamp columns and their heads. On a highway they are tall and on a gantry stalk; on a local
  // road they are shorter and hooked; on a bridge they are masts. One shape, three proportions.
  ctx.fillStyle = pal.road[0];
  ctx.beginPath();
  let drew = false;
  eachCell(view, LAMP_PITCH, LAMP_PITCH, (n) => {
    const wx = lampXAt(n);
    const kind = kindAt(wx);
    const x = snap(sx(view, wx), px);
    const tallness = kind === LOCAL ? 0.74 : kind === BRIDGE ? 1.25 : 1;
    const h = H * tallness;
    chunk(ctx, x, foot - h, Math.max(px, px * 1.4), h, px);
    // The arm, reaching out over the road in the direction of travel.
    const reach = h * (kind === LOCAL ? 0.3 : 0.42);
    chunk(ctx, x, foot - h, reach, Math.max(px, px * 1.2), px);
    drew = true;
  });
  if (drew) ctx.fill();

  // The heads, lit. Separate pass so the whole row is one fill.
  ctx.fillStyle = pal.hard.bronze;
  ctx.beginPath();
  drew = false;
  eachCell(view, LAMP_PITCH, LAMP_PITCH, (n) => {
    const wx = lampXAt(n);
    const kind = kindAt(wx);
    const x = snap(sx(view, wx), px);
    const h = H * (kind === LOCAL ? 0.74 : kind === BRIDGE ? 1.25 : 1);
    const reach = h * (kind === LOCAL ? 0.3 : 0.42);
    chunk(ctx, x + reach - px, foot - h, px * 2, px * 2, px);
    drew = true;
  });
  if (drew) ctx.fill();

  // ...and their haloes, which is where most of the light in this picture comes from.
  eachCell(view, LAMP_PITCH, LAMP_PITCH, (n) => {
    const wx = lampXAt(n);
    const kind = kindAt(wx);
    const x = snap(sx(view, wx), px);
    if (x < -view.W * 0.15 || x > view.W * 1.15) return;
    const h = H * (kind === LOCAL ? 0.74 : kind === BRIDGE ? 1.25 : 1);
    const reach = h * (kind === LOCAL ? 0.3 : 0.42);
    // Two haloes rather than one: a tight bronze core and a wider, weaker wash of the same lamp's
    // deeper tone. A single ring reads as a flat disc stuck to the sky; two nested ones fall off in
    // a way a light actually does, and it costs one more pass over a small box.
    ditherGlow(ctx, x + reach, foot - h, view.pxu * 6.5 * tune.glow, pal.hard.ember, 0.3 * tune.glow, px, 1, 2.6);
    ditherGlow(ctx, x + reach, foot - h, view.pxu * 3.2 * tune.glow, pal.hard.bronze, 0.46 * tune.glow, px, 1, 1.8);
  });

  // The far barrier: highway only. A rail on posts, and it is the thing that says *motorway*.
  ctx.fillStyle = pal.road[3];
  ctx.beginPath();
  drew = false;
  for (let x = 0; x < view.W + px; x += px) {
    const at = view.camX + x / view.pxu;
    if (kindAt(at) === LOCAL) continue;
    chunk(ctx, x, view.top - px * 3, px, px * 2, px);
    drew = true;
  }
  if (drew) ctx.fill();
}

/**
 * The near side: the kerb, the barrier or the bridge railing, along the bottom of the road.
 *
 * A bridge railing is **open** — posts with sky between them — and a highway barrier is solid. That
 * one difference is the strongest signal in the scene that you are over water, stronger than the
 * colour under the deck, because you can see through it and you could not see through the last one.
 */
export function drawNearSide(view) {
  const { ctx, px, pal } = view;
  const y = view.bottom;
  const high = Math.max(px * 2, view.band * 0.13);

  // **The near verge, all the way to the bottom of the frame.** Not a detail: the road stops at
  // ninety per cent of the height and for a while nothing was drawn below it at all, so the bottom
  // tenth of every frame was bare canvas — which reads as a black bar under the picture and is very
  // hard to see as *missing* rather than as a deliberately heavy foreground.
  ditherRamp(ctx, view.W, y, view.H + px, [pal.road[1], pal.road[0]], px, { blend: 0.5 });

  // Solid parapet where the road has one.
  ctx.fillStyle = pal.road[0];
  ctx.beginPath();
  let drew = false;
  for (let x = 0; x < view.W + px; x += px) {
    const at = view.camX + x / view.pxu;
    const kind = kindAt(at);
    if (kind === BRIDGE) {
      // Posts only: one chunk in every four, so the night shows through the gaps.
      if (Math.round(x / px) % 4 !== 0) continue;
      chunk(ctx, x, y - high, px, high + px * 2, px);
    } else {
      chunk(ctx, x, y, px, high * (kind === LOCAL ? 0.5 : 1), px);
    }
    drew = true;
  }
  if (drew) ctx.fill();

  // The top rail, unbroken, over both. A railing with no rail is a row of sticks.
  ctx.fillStyle = pal.road[4];
  ctx.beginPath();
  drew = false;
  for (let x = 0; x < view.W + px; x += px) {
    const at = view.camX + x / view.pxu;
    const kind = kindAt(at);
    if (kind === LOCAL) continue;
    chunk(ctx, x, kind === BRIDGE ? y - high : y, px, px, px);
    drew = true;
  }
  if (drew) ctx.fill();

  // Sand and scrub on the verge, so the strip below the road is a place rather than a fill.
  ctx.fillStyle = pal.land[1];
  ctx.beginPath();
  drew = false;
  for (let x = 0; x < view.W + px; x += px) {
    const col = Math.round(x / px);
    for (let r = 0; r < 5; r += 1) {
      if (!bayerOn(col, r * 2, 0.42 - r * 0.08)) continue;
      chunk(ctx, x, y + high + r * px * 2, px, px, px);
      drew = true;
    }
  }
  if (drew) ctx.fill();

  // The kerb, local roads only, with the stones on a lattice so it reads as laid rather than poured.
  ctx.fillStyle = pal.land[2];
  ctx.beginPath();
  drew = false;
  for (let x = 0; x < view.W + px; x += px) {
    const at = view.camX + x / view.pxu;
    if (kindAt(at) !== LOCAL) continue;
    const stone = Math.floor(at / 4) % 2 === 0;
    chunk(ctx, x, y + px, px, stone ? px * 2 : px, px);
    drew = true;
  }
  if (drew) ctx.fill();
}

/* ---------------------------------------------------------- what crosses ---- */

/**
 * Gantries and overpasses: the things that go over the top.
 *
 * A gantry is a sign frame on a highway and hangs in the upper air; an overpass is another road
 * entirely, on piers, and the near pier passes **in front of the rider** for about a fifth of a
 * second. That momentary occlusion is worth the whole structure: nothing else in a side-scroller
 * says "you went under that" as plainly as the subject briefly disappearing behind something.
 */
export function drawGantries(view) {
  const { ctx, px, pal, tune } = view;
  const H = LAMP_H * view.pxu * tune.tall;
  ctx.fillStyle = pal.road[0];
  ctx.beginPath();
  let drew = false;
  eachCell(view, SEG_LEN, SEG_LEN, (s) => {
    if (kindAt(s * SEG_LEN + SEG_LEN * 0.5) !== HIGHWAY) return;
    const wx = (s + 0.35 + hash01(s * 6.1) * 0.3) * SEG_LEN;
    const x = snap(sx(view, wx), px);
    const top = view.top - H * 1.5;
    chunk(ctx, x, top, view.pxu * 26, Math.max(px, px * 2), px);
    chunk(ctx, x, top, Math.max(px, px * 1.5), H * 1.5, px);
    chunk(ctx, x + view.pxu * 26, top, Math.max(px, px * 1.5), H * 1.5, px);
    // The board slung under it.
    chunk(ctx, x + view.pxu * 4, top + px * 2, view.pxu * 18, H * 0.34, px);
    drew = true;
  });
  if (drew) ctx.fill();

  // The board's face, lit, so a gantry reads as a sign rather than as scaffolding.
  ctx.fillStyle = pal.build[4];
  ctx.beginPath();
  drew = false;
  eachCell(view, SEG_LEN, SEG_LEN, (s) => {
    if (kindAt(s * SEG_LEN + SEG_LEN * 0.5) !== HIGHWAY) return;
    const wx = (s + 0.35 + hash01(s * 6.1) * 0.3) * SEG_LEN;
    const x = snap(sx(view, wx), px);
    const top = view.top - H * 1.5;
    for (let i = 0; i < 3; i += 1) {
      chunk(ctx, x + view.pxu * (5 + i * 5.4), top + px * 4, view.pxu * 3.4, H * 0.14, px);
    }
    drew = true;
  });
  if (drew) ctx.fill();
}

/** The far half of every overpass: the deck across the view and the pier standing behind the road. */
export function drawOverBack(view) {
  const { ctx, px, pal } = view;
  const deep = view.pxu * 4;

  ctx.fillStyle = pal.build[0];
  ctx.beginPath();
  let drew = false;
  eachCell(view, OVER_PITCH, OVER_PITCH, (n) => {
    const over = overpassAt(n);
    if (!over) return;
    const x = snap(sx(view, over.at), px);
    const w = over.wide * view.pxu;
    const deckY = view.top - over.high * view.pxu;
    chunk(ctx, x, deckY, w, deep, px);
    if (over.piers) chunk(ctx, x + w * 0.1, deckY + deep, view.pxu * 3.4, over.high * view.pxu, px);
    drew = true;
  });
  if (drew) ctx.fill();

  // The parapet along the top and a lit soffit line under it. Without them the deck is a black bar
  // ruled across the picture; with them it is a road, seen edge on, with something driving on it.
  ctx.fillStyle = pal.build[2];
  ctx.beginPath();
  drew = false;
  eachCell(view, OVER_PITCH, OVER_PITCH, (n) => {
    const over = overpassAt(n);
    if (!over) return;
    const x = snap(sx(view, over.at), px);
    const w = over.wide * view.pxu;
    const deckY = view.top - over.high * view.pxu;
    chunk(ctx, x, deckY - px * 2, w, px * 2, px);
    chunk(ctx, x, deckY + deep - px, w, px, px);
    drew = true;
  });
  if (drew) ctx.fill();

  // Lamps along its parapet, which is what says the thing carries traffic of its own.
  ctx.fillStyle = pal.hard.lamp;
  ctx.beginPath();
  drew = false;
  eachCell(view, OVER_PITCH, OVER_PITCH, (n) => {
    const over = overpassAt(n);
    if (!over) return;
    const x = snap(sx(view, over.at), px);
    const w = over.wide * view.pxu;
    const deckY = view.top - over.high * view.pxu;
    for (let i = 0; i < 3; i += 1) chunk(ctx, x + w * (0.2 + i * 0.3), deckY - px * 4, px, px * 2, px);
    drew = true;
  });
  if (drew) ctx.fill();
}

/** ...and the near pier, which is the half that gets in the way. */
export function drawOverFront(view) {
  const { ctx, px, pal } = view;
  ctx.fillStyle = pal.build[1];
  ctx.beginPath();
  let drew = false;
  eachCell(view, OVER_PITCH, OVER_PITCH, (n) => {
    const over = overpassAt(n);
    if (!over || !over.piers) return;
    const x = snap(sx(view, over.at), px);
    const w = over.wide * view.pxu;
    const deckY = view.top - over.high * view.pxu;
    chunk(ctx, x + w * 0.72, deckY, view.pxu * 4, (over.high + 46) * view.pxu, px);
    drew = true;
  });
  if (drew) ctx.fill();

  // A lit edge down the leading side, so the pier arrives rather than simply appearing.
  ctx.fillStyle = pal.build[3];
  ctx.beginPath();
  drew = false;
  eachCell(view, OVER_PITCH, OVER_PITCH, (n) => {
    const over = overpassAt(n);
    if (!over || !over.piers) return;
    const x = snap(sx(view, over.at), px);
    const w = over.wide * view.pxu;
    const deckY = view.top - over.high * view.pxu;
    chunk(ctx, x + w * 0.72 + view.pxu * 4 - px, deckY, px, (over.high + 46) * view.pxu, px);
    drew = true;
  });
  if (drew) ctx.fill();
}
