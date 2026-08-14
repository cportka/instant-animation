---
description: Turn a description into a new animation in the gallery
argument-hint: <describe the animation you want>
---

Animate this: **$ARGUMENTS**

Follow `docs/AUTHORING.md`. In short:

1. Pick a kebab-case `id` from the description and create the folder `site/scenes/<id>/` with
   `index.js` as its entry point, exporting `meta` and `create({ width, height, seed })`. Put the
   user's exact words in `meta.prompt` — that description is what the gallery shows and what the
   animation is *for*. Split the scene across several files in that folder as it grows; the folder
   name **is** the id.
2. Register it in `site/scenes/index.js` — **at the front**. The gallery runs newest to oldest.
3. Give it its own `meta.chrome` and `meta.transition`, and implement both: a glyph in
   `site/index.html` plus a rule in `site/styles.css`, and a case in `site/effects/transitions.js`
   built out of *this* scene's own primitives. A new animation gets its own nav chevron and its own
   channel change; the change wears the scene it is arriving *at*. Neither is optional — the tests
   fail on a scene that declares neither or names one nobody implements.
4. Build it out of paths only: no images, no external fonts, no DOM, no `Math.random()`,
   no `Date.now()`. Seeded randomness comes from `lib/rng.js`; `t` is the only clock.
5. Layer slow sine waves at unrelated periods so the motion never visibly loops. Study
   `site/scenes/floating-bed/index.js` for the house style — full-bleed background in screen space,
   subject drawn in its own design units and placed with a single transform, and one key light
   in one constant that everything else derives its edges and shadows from.
6. Run `npm test`. The render tests catch NaN geometry, bad colours, leaked `save()`, and
   non-determinism.
7. **Look at it.** Start `npm run serve`, screenshot several timestamps at both a desktop and a
   phone viewport, and actually inspect the images. Fix what reads wrong, then screenshot again.
   Do not ship an animation you have not seen.
8. Follow the repo's standard workflow in `.claude/CLAUDE.md`: branch, test, PR, merge on green.
   **A new animation is a MAJOR bump — always, and it is the only thing that earns one.** The bump
   means the previous animation is finished and this one has begun, so open a fresh
   `CHANGELOG.md` section for it and add a row to the ledger in `.claude/CLAUDE.md` naming both
   the animation you finished and the one you started. Keep the README's `**Version:**` line and
   its gallery table in sync.
