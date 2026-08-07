---
description: Turn a description into a new animation in the gallery
argument-hint: <describe the animation you want>
---

Animate this: **$ARGUMENTS**

Follow `docs/AUTHORING.md`. In short:

1. Pick a kebab-case `id` from the description and create `site/scenes/<id>.js` exporting `meta`
   and `create({ width, height, seed })`. Put the user's exact words in `meta.prompt` — that
   description is what the gallery shows and what the animation is *for*.
2. Register it in `site/scenes/index.js`.
3. Build it out of paths only: no images, no external fonts, no DOM, no `Math.random()`,
   no `Date.now()`. Seeded randomness comes from `lib/rng.js`; `t` is the only clock.
4. Layer slow sine waves at unrelated periods so the motion never visibly loops. Study
   `site/scenes/floating-bed.js` for the house style — full-bleed background in screen space,
   subject composed in a fixed design box via `fitContain()`.
5. Run `npm test`. The render tests catch NaN geometry, bad colours, leaked `save()`, and
   non-determinism.
6. **Look at it.** Start `npm run serve`, screenshot several timestamps at both a desktop and a
   phone viewport, and actually inspect the images. Fix what reads wrong, then screenshot again.
   Do not ship an animation you have not seen.
7. Follow the repo's standard workflow in `.claude/CLAUDE.md`: branch, test, PR, merge on green.
   Add a `CHANGELOG.md` entry and bump the `package.json` version (a new animation is a MINOR
   bump), keeping the README's `**Version:**` line in sync.
