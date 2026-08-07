# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog
(https://keepachangelog.com) and the project uses Semantic Versioning (https://semver.org).
Every change bumps the version and adds an entry below.

## [0.3.0] - 2026-08-07

### Added
- **A channel change between animations.** The two scenes are drawn exactly adjacent and pushed
  vertically past each other while the composite is torn apart — displaced slices, chroma smear,
  and a bright seam on the join — then it settles. It lives in the stage and operates on rendered
  pixels, so every future animation gets it for nothing. Skipped entirely under reduced motion.
- **VHS artefacts** (`site/lib/vhs.js`): drifting tracking bands, rolling scanlines, whole-frame
  chroma split, and sparse tape dropouts. Real horizontal displacement, done with
  `ctx.drawImage(ctx.canvas, …)` — a 2D context sampling its own bitmap — so it needs no second
  canvas and no DOM, and still renders in the headless tests.
- **A black hole**, with an accretion disc whose far side is lensed up over the shadow, a photon
  ring, material visibly streaming round, and star positions bent outward as they pass it.
- **An orbiting pair of neutron stars**, now the scene's single light source.
- Geometric echoes: every snore pushes a wireframe solid out of the sleeper and it keeps going.

### Changed
- **The front-end has no text at all.** Title and description are gone from the page; they survive
  only as the canvas label and a screen-reader live region. Navigation is two soft chevrons that
  float at the top and bottom edges, each present only when there is somewhere to go — so a
  single-animation gallery is nothing but the animation.
- **The gallery runs newest → oldest.** Down goes further back in time, up returns toward the
  present, by arrow click, scroll, space, arrow keys, or a vertical swipe. `scenes.test.js` fails
  if `site/scenes/index.js` stops being newest-first.
- **Vaporwave.** Magenta, cyan and violet throughout, with coloured haze in the air; the galactic
  band now bleeds magenta on one edge and cyan on the other, and the sleeper's rim light runs from
  magenta at the head to cyan at the foot.
- The sleeper snores: mouth opens on the out-breath, and the breathing, the Z's and the geometric
  echoes all run off one clock.
- Removed the distant planet — the black hole took its job, and the frame is starker for it.

### Versioning
- A **MAJOR** bump now means *an animation is finished and the next one begins*. `1.0.0` will be
  cut when *Asleep Among the Stars* is done and a second animation starts. Recorded in
  `.claude/CLAUDE.md`.

## [0.2.0] - 2026-08-07

### Changed
- **"Asleep Among the Stars" recomposed for scale and stripped back.** The animation now reads as
  something small and lost rather than something cosy:
  - The bed is scaled against the viewport's **short edge** instead of fitted to the frame, so it
    occupies roughly a quarter of a desktop window and less on anything larger — the bigger the
    screen, the more lost it looks. It sits off-centre, with the emptiness as the subject.
  - Drift periods went from seconds to **minutes** (97s, 71s, 127s), so the bed wanders the frame
    and tumbles almost imperceptibly instead of bobbing in place.
  - New background: a **galactic band** of clustered stars cut by soft dust lanes, and the unlit
    limb of **something enormous** just off frame, which occludes the star field behind it.
  - A single **distant sun** (`KEY_STAR`) is now the one light source in the scene. The planet's
    lit limb, the duvet's rim and the sleeper's face all derive their edges from that one
    position, and the rim light falls off as surfaces turn away from it rather than running at an
    even brightness like neon piping.
  - Palette pulled to cold near-monochrome; the sleeper's face is the only warmth in the frame.
    Star twinkle cut to a flicker, shooting stars made rare (27s), the Zzz's reduced to a whisper.

### Added
- `docs/AUTHORING.md` guidance on composing for scale contrast and on keeping one key light.

## [0.1.0] - 2026-08-07

### Added
- **The animation engine.** `site/lib/stage.js` owns device pixel ratio, resizing, the frame
  loop, pausing in a hidden tab, and `prefers-reduced-motion` (which holds a still poster frame
  instead of moving). Scenes receive only a 2D context, a clock and a size — which is what lets
  them render headlessly in CI.
- **Seeded randomness** (`site/lib/rng.js`) and shared geometry helpers (`site/lib/draw.js`), so
  a scene looks hand-placed but draws identically on every machine.
- **First animation — "Asleep Among the Stars"**: a bed floating in space with someone snuggled
  under the covers, from the description *"a bed floating in space with someone snuggled under
  the covers peacefully sleeping while the bed gently floats amongst the stars"*. Parallax star
  field, drifting nebulae, a distant planet, periodic shooting stars, and a bed that bobs, sways
  and tilts on unrelated slow sine waves while the sleeper breathes and the duvet's free corner
  drifts in zero gravity.
- **The front-end** (`site/index.html`, `app.js`, `styles.css`): a full-bleed canvas and nothing
  else. Title, description and navigation dots fade out after a couple of idle seconds and come
  back on interaction. Arrow keys, swipe, and `#scene-id` deep links move between animations;
  the dots hide entirely while there is only one.
- **Headless render tests.** A recording 2D context (`tests/helpers/recording-context.mjs`) draws
  every scene at three viewports and eight timestamps, failing on NaN geometry, colours built
  from `undefined`, out-of-range alpha, unbalanced `save()`/`restore()`, and non-determinism.
  Plus registry and site-integrity suites — no orphaned scene files, no missing assets, no
  root-absolute paths (which would 404 on a project Pages site), no CDN dependencies.
- **GitHub Pages deployment from Actions** (`.github/workflows/pages.yml`), gated on the tests.
- **`/animate <description>`** slash command and `docs/AUTHORING.md`, so adding an animation is
  one described sentence.
- Initial scaffold via repo-bootstrap (Portka standard): branch-per-change workflow, an enforced
  SemVer version sync, a test suite, and CI.
