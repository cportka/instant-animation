# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog
(https://keepachangelog.com) and the project uses Semantic Versioning (https://semver.org).

**Until a release is actually cut, changes fold into the current unreleased version** rather than
minting a new number each round — a version that was never tagged isn't a version. Once a release
has been published, the next change opens a new section. See `.claude/CLAUDE.md`.

## [0.3.0] - Unreleased

Nothing has been released yet, so this is the whole project to date in one section. Intermediate
states that were later replaced — the cosy first composition, the cold monochrome pass, the
fading caption chrome, the distant planet — are not listed: they left nothing behind.

### Added

**The engine.** `site/lib/stage.js` owns device pixel ratio, resizing, the frame loop, pausing in
a hidden tab, and `prefers-reduced-motion` (which holds a still poster frame instead of moving). A
scene receives only a 2D context, a clock and a size — no DOM — which is exactly what lets every
scene render headlessly in CI. Randomness is seeded (`site/lib/rng.js`), so a scene looks
hand-placed but draws identically on every machine.

**The channel change.** Moving between animations draws the two scenes exactly adjacent and pushes
them vertically past each other while the composite is torn apart — displaced slices, chroma
smear, and a bright seam riding the join — then it settles. It lives in the stage and operates on
rendered pixels, so it knows nothing about scenes and every future animation gets it for free.
Skipped entirely under reduced motion.

**VHS artefacts** (`site/lib/vhs.js`): drifting tracking bands, rolling scanlines, whole-frame
chroma split, and sparse tape dropouts. The displacement is real, not an overlay — a 2D context
can sample its own bitmap via `ctx.drawImage(ctx.canvas, …)`, so slices genuinely move with no
second canvas, no WebGL, and nothing that would stop a scene rendering in Node.

**The first animation — "Asleep Among the Stars"**, from *"a bed floating in space with someone
snuggled under the covers peacefully sleeping while the bed gently floats amongst the stars"*:

- Composed for scale. The bed is sized against the viewport's **short edge** rather than fitted to
  the frame, so it takes about a quarter of a desktop window and less on anything larger — the
  bigger the screen, the more lost it looks. It sits off-centre and the emptiness is the subject.
- Drift periods in **minutes, not seconds** (97s, 71s, and a 127s tumble), so it wanders the frame
  instead of bobbing in place.
- A **black hole** whose accretion disc is lensed up over the shadow, with a photon ring, material
  visibly streaming round, and star positions bent outward as they pass it.
- An **orbiting pair of neutron stars**, the scene's single light source: the disc's lit limb, the
  duvet's rim and the sleeper's face all derive their edges from that one position, and the rim
  light falls off as surfaces turn away rather than running at an even neon brightness.
- A **galactic band** of clustered stars cut by soft dust lanes, bleeding magenta on one edge and
  cyan on the other, over a vaporwave palette with coloured haze in the air.
- The sleeper **snores**: the mouth opens on the out-breath, and every snore pushes a wireframe
  solid out into space. Breathing, the Z's and the echoes all run off one clock.

**The front-end** (`site/index.html`, `app.js`, `styles.css`): **no text at all.** The animation is
the page; the title and description survive only as the canvas label and a screen-reader live
region. Navigation is two soft chevrons floating at the top and bottom edges, each present only
when there is somewhere to go — so a single-animation gallery is nothing but the animation. The
gallery runs **newest → oldest**: down goes further back in time, up returns toward the present, by
chevron, scroll, space, arrow keys, or a vertical swipe. `#scene-id` deep links work.

**Headless render tests.** A recording 2D context (`tests/helpers/recording-context.mjs`) draws
every scene at three viewports and eight timestamps, failing on NaN geometry, colours built from
`undefined`, out-of-range alpha, unbalanced `save()`/`restore()`, and non-determinism. Plus
registry and site-integrity suites: no orphaned scene files, no missing assets, no root-absolute
paths (which would 404 on a project Pages site), no CDN dependencies, no visible text on the page,
and a gallery that is still newest-first.

**GitHub Pages deployment from Actions** (`.github/workflows/pages.yml`), gated on the tests.

**`/animate <description>`** slash command and `docs/AUTHORING.md`, so adding an animation is one
described sentence.

Initial scaffold via repo-bootstrap (Portka standard): branch-per-change workflow, an enforced
SemVer version sync, a test suite, and CI.

### Versioning

- A **MAJOR** bump means *an animation is finished and the next one begins*. `1.0.0` will be cut
  when *Asleep Among the Stars* is done and a second animation starts.
- Changes fold into the current unreleased version until a release is actually published.

Both recorded in `.claude/CLAUDE.md`.
