// How the gallery is ordered, and what happens when you walk off the end of it.

/**
 * The scene index you land on, given any index at all.
 *
 * The gallery is a **loop**: down from the last animation arrives at the first, up from the first
 * arrives at the last. It used to be a line with two stops — the index was clamped and the chevron
 * at each end was hidden — and the trouble with a line is that the last animation is a dead end you
 * have to reverse out of. A ring has no dead end, so both chevrons are always live and every
 * direction always goes somewhere.
 *
 * Written as `((i % n) + n) % n` rather than `i % n` because JavaScript's remainder keeps the sign
 * of its left operand: `-1 % 3` is `-1`, not `2`, so the naive version sends *up* from the first
 * scene to `scenes[-1]`, which is `undefined`, which is a blank page.
 *
 * @param {number} index  any integer, in range or not
 * @param {number} count  how many scenes there are
 */
export const wrapIndex = (index, count) => (count > 0 ? ((index % count) + count) % count : 0);
