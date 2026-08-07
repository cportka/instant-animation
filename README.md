# instant-animation

An instant animation generator. Animate anything you can describe.

**Version:** 0.2.0 · **Live:** https://cportka.github.io/instant-animation/

Describe something. It becomes a hand-drawn canvas animation and joins the gallery. The site
shows the animations and nothing else — chrome fades out after a couple of idle seconds.

## The gallery

| Animation | From the description |
| --- | --- |
| **Asleep Among the Stars** | *a bed floating in space with someone snuggled under the covers peacefully sleeping while the bed gently floats amongst the stars* |

## How it works

Every animation is one self-contained ES module in `site/scenes/` that draws itself into a 2D
canvas context — no build step, no dependencies, no image assets, nothing fetched at runtime. The
whole site is static files served straight from `site/`.

```
site/
  index.html         the shell: a full-bleed canvas and some chrome that gets out of the way
  app.js             mounts scenes, handles arrows/swipe/#deep-links
  lib/stage.js       DPR, resizing, the frame loop, pausing a hidden tab, reduced motion
  lib/rng.js         seeded randomness — scenes never call Math.random()
  lib/draw.js        shared geometry and colour helpers
  scenes/index.js    the registry
  scenes/*.js        one file per animation
```

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

The canvas carries the description as its label, scene changes are announced to screen readers,
navigation works from the keyboard (`←` `→` `Home` `End`), and visitors who ask for reduced motion
get a still frame held at the moment each scene reads best rather than a moving one.

## Deployment

Pushing to `main` deploys `site/` to GitHub Pages via `.github/workflows/pages.yml`. This needs
**Settings → Pages → Source: GitHub Actions** enabled once, by hand, on the repository.

## License

MIT — see [LICENSE](LICENSE).
