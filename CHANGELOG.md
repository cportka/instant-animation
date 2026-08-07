# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog
(https://keepachangelog.com) and the project uses Semantic Versioning (https://semver.org).
Every change bumps the version and adds an entry below.

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
