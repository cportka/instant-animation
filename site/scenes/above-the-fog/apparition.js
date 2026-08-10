// The Cloud.
//
// About once a minute one mass of fog stops being weather. It gathers, pixelates into a coarse grid
// of chunks, and resolves into an **angel**; the angel decodes into a **grim reaper**; the reaper
// decodes back into The Cloud, now wearing an enormous happy face; and then it comes apart and is
// fog again. Nobody comments on it.
//
// Two decisions carry the whole effect.
//
// **The figures are hand-drawn bitmaps, not procedural shapes.** Twenty-two cells across is not
// enough resolution for anything generated to be recognisable — an angel and a reaper are both "a
// vertical mass with a lump on top", and the difference between them is entirely in a dozen
// deliberately placed cells. So they are drawn as ASCII art, four levels deep, and the art is in
// the source where it can be read and edited as art.
//
// **The morph is a per-cell coin toss, not a cross-fade.** Each cell picks the *old* figure or the
// *new* one depending on whether its own hash has been passed by a sweeping threshold, so the angel
// does not dissolve into the reaper — it is replaced by it, cell by cell, in a scatter. That is what
// a decoder does when it is handed a keyframe it cannot fully apply, and it is the reason this
// reads as a picture failing rather than as an animation playing. Cells near the threshold also
// shove sideways, which is the same artefact carried into position.
//
// Everything is a pure function of `t`. See `site/effects/field.js`.

import { clamp, lerp, smoothstep } from '../../lib/draw.js';
import { hash2 } from '../../effects/field.js';
import { lobe } from '../../effects/volume.js';

/* ------------------------------------------------------------- figures ---- */

// `.` nothing, `-` the darkest step, `+` the middle, `#` the brightest. Each figure maps those
// steps through its own two-colour ramp, so the same three characters are a luminous robe in one
// and a hollow cowl in the next.

const ANGEL = [
  '......................',
  '.......+######+.......',
  '......##......##......',
  '......##......##......',
  '.......+######+.......',
  '.........###..........',
  '..+##...#####....##+..',
  '.+####..#####...####+.',
  '+#####..#####...#####+',
  '+######.#####..######+',
  '.+#####.#####..#####+.',
  '..+####.#####..####+..',
  '...+###.#####..###+...',
  '....+##.#####..##+....',
  '.....+#.#####..#+.....',
  '......#########.......',
  '......#########.......',
  '......#########.......',
  '......#########.......',
  '......#########.......',
  '....#############.....',
  '....#############.....',
  '....#############.....',
  '...++++++++++++++++...',
  '...++++++++++++++++...',
  '......................',
];

const REAPER = [
  '...............#####..',
  '..............##...#..',
  '..............#...##..',
  '......#++++++++###....',
  '......#########.#.....',
  '....##---------##.....',
  '....##---------##.....',
  '....##--++--++-##.....',
  '....####-----####.....',
  '......#########.#.....',
  '......#########.#.....',
  '......##+++++##.#.....',
  '....####+++++####.....',
  '....####+++++####.....',
  '....####+++++####.....',
  '....##+++++++++##.....',
  '....##+++++++++##.....',
  '....##+++++++++##.....',
  '....##+++++++++##.....',
  '..####+++++++++####...',
  '..####+++++++++####...',
  '..####+++++++++####...',
  '..##++++++++++++###...',
  '..##++++++++++++###...',
  '..##++++++++++++###...',
  '..++.++.++.++.++..++..',
];

const CLOUD = [
  '......................',
  '......................',
  '......................',
  '......................',
  '........+++++.........',
  '.......+#####+........',
  '.....++#######+++.....',
  '...++############+....',
  '..+###############+...',
  '..+###############+...',
  '.+#################+..',
  '.+#################+..',
  '.+#################+..',
  '.+#################+..',
  '.+#################+..',
  '.+#################+..',
  '.+#################+..',
  '.+#################+..',
  '..++#############++...',
  '...+#############+....',
  '....+++++++++++++.....',
  '......................',
  '......................',
  '......................',
  '......................',
  '......................',
];

const FACE = [
  '......................',
  '......................',
  '......................',
  '......................',
  '........+++++.........',
  '.......+#####+........',
  '.....++#######+++.....',
  '...++############+....',
  '..+###---####---##+...',
  '..+###---####---##+...',
  '.+####---####---###+..',
  '.+####---####---###+..',
  '.+#################+..',
  '.+#################+..',
  '.+####-########-###+..',
  '.+####---####---###+..',
  '.+#####--------####+..',
  '.+#######----######+..',
  '..++#############++...',
  '...+#############+....',
  '....+++++++++++++.....',
  '......................',
  '......................',
  '......................',
  '......................',
  '......................',
];

export const COLS = 22;
export const ROWS = 26;

/** Neutral steps, shared with the fog's own ramp. */
const VOID = [9, 11, 13];
const PITCH = [31, 36, 40];
const SLATE = [54, 60, 65];
const STONE = [78, 84, 89];
const ASH = [125, 132, 137];
const LINEN = [223, 227, 228];
const SNOW = [248, 249, 249];

const LEVELS = { '-': 0, '+': 0.5, '#': 1 };

/**
 * A figure, compiled once: its lit cells as flat arrays, and the ramp its levels run through.
 *
 * Flat arrays rather than a grid because drawing walks every lit cell in order and never asks
 * "what is at (col, row)" — and because a couple of hundred cells re-read out of strings sixty
 * times a second is string indexing in the hot path for no reason at all.
 */
function compile(art, dark, light, opacity) {
  const col = [];
  const row = [];
  const level = [];
  for (let r = 0; r < art.length; r += 1) {
    for (let c = 0; c < art[r].length; c += 1) {
      const value = LEVELS[art[r][c]];
      if (value === undefined) continue;
      col.push(c);
      row.push(r);
      level.push(value);
    }
  }
  return { col, row, level, count: col.length, dark, light, opacity };
}

// The order is the script: The Cloud, an angel, a grim reaper, and The Cloud again wearing a face.
// Ramp *and* opacity per figure, because the two trade against each other and the reaper needs
// both. Composited at 84% over mid-grey, its near-black void and dark-grey cowl come out eight
// levels apart and the hood stops having a hollow in it; brighten the cowl to fix that and he is a
// pale figure, which is a ghost, not a reaper. Keeping the ramp dark and taking his opacity almost
// to solid gets a black hollow inside a dark cloak, which is the thing itself.
export const FIGURES = [
  compile(CLOUD, ASH, LINEN, 0.8),
  compile(ANGEL, ASH, SNOW, 0.86),
  compile(REAPER, VOID, SLATE, 0.96),
  compile(FACE, PITCH, SNOW, 0.88),
];

/** Where in its life each figure is fully itself. Between them, the cells change over. */
const KEYS = [0.06, 0.32, 0.54, 0.76];

/* -------------------------------------------------------------- timing ---- */

/** One apparition per cycle. Long enough that it is an event rather than a feature of the scene. */
export const PERIOD = 62;
/** How long one lasts, gathering through to gone. */
export const DURATION = 16;

/**
 * The apparition happening right now, or `null` — which is almost always.
 *
 * The start slides around inside its cycle, so "about once a minute" never becomes a beat you can
 * count. It cannot straddle a cycle boundary: the latest start plus the duration still lands well
 * inside the period, which is what keeps this a closed form with no state in it.
 */
export function apparitionAt(t) {
  if (t < 0) return null;
  const n = Math.floor(t / PERIOD);
  const start = 0.04 + 0.3 * hash2(n * 3.1 + 1.7, 7.3);
  const u = (t / PERIOD - n - start) * (PERIOD / DURATION);
  if (u <= 0 || u >= 1) return null;

  // A fresh site each time, held off the edges — an apparition half out of frame is a mistake, not
  // a portent.
  const x = 0.24 + 0.52 * hash2(n * 5.7, 11.3);
  const y = 0.22 + 0.5 * hash2(n * 8.9 + 4.1, 19.7);

  let from = 0;
  while (from < KEYS.length - 1 && u >= KEYS[from + 1]) from += 1;
  const to = Math.min(FIGURES.length - 1, from + 1);
  // Each figure holds for the first third of its gap, then changes over. A morph that starts the
  // instant the last one finished never lets you read what you are looking at.
  const span = (KEYS[to] ?? 1) - KEYS[from];
  const blend = from === to ? 0 : smoothstep(KEYS[from] + span * 0.34, KEYS[from] + span * 0.88, u);

  return {
    n,
    u,
    x,
    y,
    from,
    to,
    blend,
    // In at the start, out at the end, and the way out is a scatter rather than a fade.
    presence: smoothstep(0, 0.05, u) * (1 - smoothstep(0.84, 1, u)),
    scatter: smoothstep(0.84, 1, u),
  };
}

/* ---------------------------------------------------------------- draw ---- */

/**
 * Draw the apparition, if there is one.
 *
 * Cells are batched into one path per (figure, level) — at most six fills for the whole thing, even
 * mid-morph with two figures on screen at once and every cell displaced by its own amount.
 */
export function drawApparition(ctx, W, H, t, tone = 1) {
  const event = apparitionAt(t);
  if (!event) return;

  const S = Math.min(W, H);
  const size = S * 0.54;
  const cell = size / ROWS;
  const originX = event.x * W - (COLS * cell) / 2;
  const originY = event.y * H - size / 2;

  // It arrives out of fog and goes back into it: a bright soft mass at the site, strongest at both
  // ends of the life, so the chunks are never seen simply appearing against clear air.
  const halo = 0.42 + (1 - smoothstep(0.02, 0.22, event.u)) + smoothstep(0.78, 1, event.u);
  if (halo > 0.01) {
    for (let i = 0; i < 4; i += 1) {
      const a = hash2(event.n + i * 3.7, i) * Math.PI * 2;
      const d = size * 0.2 * hash2(event.n + i * 1.9, i + 3);
      lobe(
        ctx,
        event.x * W + Math.cos(a) * d,
        event.y * H + Math.sin(a) * d,
        size * (0.5 + 0.28 * hash2(event.n + i, i + 7)),
        size * (0.4 + 0.24 * hash2(event.n + i, i + 9)),
        a * 0.3,
        LINEN,
        clamp(0.3 * halo * tone, 0, 1),
        0.16,
        0.4,
        event.n + i * 2.3 + t * 0.6,
      );
    }
  }

  if (event.presence < 0.01) return;

  // How violently the cells are coming apart right now: highest in the middle of a change-over,
  // and again while the whole thing scatters.
  const churn = Math.sin(event.blend * Math.PI) ** 0.6 + event.scatter * 1.4;
  // A held clock, so the grid stutters between states instead of sliding between them.
  const beat = Math.floor(t * 9) / 9;

  for (let f = 0; f < 2; f += 1) {
    const index = f === 0 ? event.from : event.to;
    if (f === 1 && event.to === event.from) break;
    const figure = FIGURES[index];

    for (let step = 0; step < 3; step += 1) {
      const value = step / 2;
      ctx.beginPath();
      let drawn = 0;

      for (let i = 0; i < figure.count; i += 1) {
        if (figure.level[i] !== value) continue;
        const c = figure.col[i];
        const r = figure.row[i];
        const roll = hash2(c * 1.9 + 0.3, r * 2.7 + 0.9);

        // The change-over, one cell at a time: past the threshold a cell belongs to the new figure.
        const changed = roll < event.blend;
        if ((f === 1) !== changed) continue;
        // ...and on the way out, cells stop belonging to anything.
        if (event.scatter > 0 && hash2(c * 3.3 + 7.1, r * 1.3 + 5.5) < event.scatter) continue;

        // Displacement, strongest for the cells that are changing over right now.
        const near = 1 - Math.min(1, Math.abs(roll - event.blend) * 6);
        const kick = churn * near + event.scatter * 0.7;
        const dx = kick * cell * 3.4 * (hash2(r * 4.1, beat + c * 0.7) - 0.5);
        const dy = kick * cell * 1.1 * (hash2(c * 6.7, beat + r * 0.5) - 0.5);

        ctx.rect(originX + c * cell + dx, originY + r * cell + dy, cell * 0.98, cell * 0.98);
        drawn += 1;
      }

      if (!drawn) continue;
      const [dr, dg, db] = figure.dark;
      const [lr, lg, lb] = figure.light;
      const red = Math.round(lerp(dr, lr, value));
      const green = Math.round(lerp(dg, lg, value));
      const blue = Math.round(lerp(db, lb, value));
      // Never fully opaque — a figure at alpha 1 is a sprite lying on the picture, and one you can
      // see a little of the weather through is something the weather is doing. The same alpha for
      // every *step* of a figure, though: fading the dark steps harder than the bright ones sounds
      // like the same idea and is not, because a figure whose darkest ink is its deepest shadow
      // loses that shadow first.
      const opacity = clamp(event.presence * tone * figure.opacity, 0, 1);
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${opacity.toFixed(4)})`;
      ctx.fill();
    }
  }

  // Two masses drifting across the front of it. Without these the grid has nothing between it and
  // the viewer, and a hard-edged thing with clear air in front of it is the one arrangement that
  // cannot be happening inside a fog bank.
  for (let i = 0; i < 2; i += 1) {
    const drift = t * 0.06 + i * 2.1;
    lobe(
      ctx,
      event.x * W + Math.cos(drift) * size * 0.42,
      event.y * H + Math.sin(drift * 0.7 + i) * size * 0.3,
      size * (0.42 + i * 0.16),
      size * (0.24 + i * 0.1),
      Math.sin(drift * 0.3) * 0.5,
      i ? STONE : LINEN,
      clamp(0.26 * event.presence * tone, 0, 1),
      0.1,
      0.44,
      event.n + i * 5.1 + t * 0.9,
    );
  }
}
