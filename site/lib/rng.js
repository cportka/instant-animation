// Deterministic pseudo-randomness.
//
// Scenes must look hand-placed but never change between runs: the same seed has to produce the
// same star field on every machine, in CI, and in the headless render tests. So nothing in a scene
// may call Math.random() — it asks the stage for a seeded generator instead.

/** FNV-1a — turns a scene id into a 32-bit seed. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Mulberry32 — small, fast, and good enough for scattering stars.
 * @param {string|number} seed
 */
export function createRng(seed) {
  let state = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x9e3779b9;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max] inclusive. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** One element of `list`. */
    pick: (list) => list[Math.floor(next() * list.length)],
  };
}
