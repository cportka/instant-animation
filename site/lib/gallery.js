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

/* ------------------------------------------------------------- addresses ---- */
//
// An animation may have several **compositions** of itself — the same artwork, arranged a different
// way — and a tap on the picture walks them as a second ring inside the first. That gives the
// gallery two axes, so an address is now two things rather than one, and the URL has to be able to
// say both.
//
// The grammar is `#<scene-id>` or `#<scene-id>/<variant-id>`. A slash, because both halves are
// kebab-case by their own id rules and so neither can ever swallow the other, and because the pair
// reads as a path — which is what it is. **The first composition writes no suffix**, so the bare
// form still means precisely what it always meant, and every link already in the world keeps opening
// the picture it opened before. That is the entire reason the default sits at index 0.
//
// This lives here rather than in `app.js` because it is a claim about how the gallery is addressed,
// which is this file's whole subject — and because in `app.js` it was two regexes nobody could test
// without a browser.

/**
 * Parse a location hash into `{ index, variant }`.
 *
 * `variant` is left `undefined` rather than `0` when the hash doesn't name one: "no opinion" and
 * "the first one" are different answers, and the caller uses the difference to keep whichever
 * composition you last chose for a scene when you come back round to it.
 *
 * Anything unrecognised — a stale link, a renamed composition, a typo — resolves to the front of the
 * gallery. A page that fails to its first animation is better than one that fails to a blank screen.
 */
export function parseAddress(hash, scenes) {
  const [id, variantId] = decodeURIComponent(String(hash ?? '').replace(/^#/, '')).split('/');
  const index = scenes.findIndex((scene) => scene.meta.id === id);
  if (index < 0) return { index: 0, variant: undefined };
  const variants = scenes[index].meta.variants;
  const found = variants && variantId ? variants.findIndex((v) => v.id === variantId) : -1;
  return { index, variant: found >= 0 ? found : undefined };
}

/** The hash for an address — the inverse of `parseAddress`, and the thing that keeps old links true. */
export function formatAddress(scene, variant = 0) {
  const variants = scene.meta.variants;
  return variants && variant > 0 ? `#${scene.meta.id}/${variants[variant].id}` : `#${scene.meta.id}`;
}
