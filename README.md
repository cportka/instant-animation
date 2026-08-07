# instant-animation

An instant animation generator. Animate anything you can describe.

**Version:** 0.3.0 (unreleased) · **Live:** https://cportka.github.io/instant-animation/

Describe something. It becomes a hand-drawn canvas animation and joins the gallery. There is no
text on the site — the animation *is* the page. The only chrome is a soft chevron floating at each
edge, and each one exists only when there is somewhere to go.

## The gallery

Newest at the top, oldest at the bottom. **Down** goes further back in time, **up** returns toward
the present — by clicking a chevron, scrolling, pressing space or the arrow keys, or swiping.
Moving between animations plays a channel change: the two scenes push past each other while the
picture tears itself apart, then settles.

| Animation | From the description |
| --- | --- |
| **Asleep Among the Stars** | *a bed floating in space with someone snuggled under the covers peacefully sleeping while the bed gently floats amongst the stars* |

## How it works

Every animation is one self-contained ES module in `site/scenes/` that draws itself into a 2D
canvas context — no build step, no dependencies, no image assets, nothing fetched at runtime. The
whole site is static files served straight from `site/`.

```
site/
  index.html         the shell: a full-bleed canvas and two chevrons
  app.js             mounts scenes, handles chevrons/scroll/keys/swipe/#deep-links
  lib/stage.js       DPR, resizing, the frame loop, hidden-tab pausing, reduced motion,
                     and the channel change between scenes
  lib/vhs.js         tracking bands, scanlines, chroma split, tape dropouts
  lib/rng.js         seeded randomness — scenes never call Math.random()
  lib/draw.js        shared geometry and colour helpers
  scenes/index.js    the registry, newest first
  scenes/*.js        one file per animation
```

The VHS distortion is real displacement, not an overlay: a 2D context can sample its own bitmap
via `ctx.drawImage(ctx.canvas, …)`, so slices of the frame are genuinely pushed sideways with no
second canvas, no WebGL, and nothing that would stop the scene rendering in Node.

Because scenes only ever touch a 2D context, they render headlessly in Node — so CI draws every
animation at three viewports and eight timestamps and fails on NaN geometry, colours built from
`undefined` values, leaked `save()`/`restore()`, and any loss of determinism.

## Adding an animation

With Claude Code in this repo:

```
/animate a paper boat drifting down a rain-slick street at night
```

By hand: see **[docs/AUTHORING.md](docs/AUTHORING.md)** for the scene contract.

## Local development

```sh
npm test          # registry, headless render, determinism, site integrity
npm run serve     # http://localhost:4173
```

Node 20+. There are no dependencies to install.

## Accessibility

Nothing is written on the page, so the description has to reach a screen reader another way: the
canvas carries it as its label, and scene changes are announced through a live region. The
chevrons are real buttons with accessible names. Navigation works from the keyboard (`↑` `↓`
`Space` `Home` `End`). Visitors who ask for reduced motion get a still frame held at the moment
each scene reads best, the chevrons stop bobbing, and the channel change is skipped entirely.

## Versioning

SemVer, with two repo-specific rules:

- A **MAJOR** bump marks an animation being *finished* and the next one starting. `1.0.0` is cut
  when *Asleep Among the Stars* is done.
- **Changes fold into the current unreleased version** rather than minting a new number each
  round. Nothing has been released yet, so `CHANGELOG.md` has one section describing what the
  project *is* — not a log of every intermediate state it passed through.

See `.claude/CLAUDE.md`.

## Deployment

Pushing to `main` deploys `site/` to GitHub Pages via `.github/workflows/pages.yml`. This needs
**Settings → Pages → Source: GitHub Actions** enabled once, by hand, on the repository.

## License

MIT — see [LICENSE](LICENSE).
