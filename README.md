# instant-animation

An instant animation generator. Animate anything you can describe.

**Version:** 3.8.1 · **Live:** https://cportka.github.io/instant-animation/

Describe something. It becomes a hand-drawn canvas animation and joins the gallery. There is no
text on the site — the animation *is* the page. The only chrome is a soft chevron floating at each
edge, and both are always live: the gallery is a **loop**.

## The gallery

Newest at the top, oldest at the bottom, and **it wraps** — down from the oldest arrives back at the
newest, up from the newest arrives at the oldest. So **down** goes further back in time and **up**
returns toward the present, and neither ever runs out: by clicking a chevron, scrolling, pressing
space or the arrow keys, or swiping. Moving between animations plays a channel change — the two
scenes push past each other while the picture tears itself apart, then settles — and the change is
always the one belonging to the animation you are arriving *at*, including on the wrap.

**Tap the picture** and some animations re-arrange themselves. An animation may hold more than one
*composition* of itself — the same artwork, put together a different way — so the gallery has two
axes, and both are rings: up and down moves between animations, left and right (or a tap) moves
between arrangements of the one you are looking at. It **dissolves in place** rather than pushing —
travelling between animations is going somewhere, re-arranging one is not — and the dissolve wears the
scene the same way the channel change does. The clock carries across, so what you see is one picture
being re-composed rather than two pictures. Compositions have their own addresses —
`#grizzly-peak/into-the-dark` — and the first one writes no suffix, so every link keeps its meaning.

| Animation | From the description |
| --- | --- |
| **The Rose Funnel** | *a pixelated tornado swirling up reds, pinks and purples, tearing apart an ornate pagoda temple that disembodied spirit hands rebuild without pause* |
| **Above the Fog** | *an overhead view of tons of billowing flowing fog under a gusting wind, wisps dissolving and changing into each other, over a lazy winding river and a riverside town in reversed colour — people down there setting fires and letting off fireworks that burst amongst the fog as stylised orange and red fractal pixel art, and every few minutes one cloud pixelates into an angel, then a grim reaper, then a giant happy face* |
| **Westbound on Grizzly Peak** *(two compositions)* | *2.5D 16-bit from the perspective of a car travelling diagonally up and to the left, a series of copper bronze street lamps, a cliff drop-off overlooking the bay, trees, and a fiery sunset in a night sky* |
| **Asleep Among the Stars** | *a bed floating in space with someone snuggled under the covers peacefully sleeping while the bed gently floats amongst the stars* |

## How it works

Every animation is a self-contained folder under `site/scenes/` whose contents draw into a 2D
canvas context — no build step, no dependencies, no image assets, nothing fetched at runtime. The
whole site is static files served straight from `site/`.

```
site/
  index.html          the shell: a full-bleed canvas and two chevrons
  app.js              mounts scenes, handles chevrons/scroll/keys/swipe/#deep-links

  lib/                the engine — knows nothing about any particular look
    stage.js          DPR, resizing, the frame loop, hidden-tab pausing, reduced motion,
                      and the channel change between scenes
    rng.js            seeded randomness — scenes never call Math.random()
    draw.js           shared geometry and colour helpers
    gallery.js        the rings: which scene an index lands on when you walk off the end,
                      and how an address names a scene and one of its compositions

  effects/            shared animation code — nothing but looks
    vhs.js            tracking bands, shred, chroma split, stuck macroblocks, tape dropouts
    paint.js          wet-paint ribbons: flecks, drips, brush strokes
    pixel.js          the 16-bit grid: chunking, ordered Bayer dither, dithered glow
    field.js          noise and divergence-free flow, all pure functions of position and time
    volume.js         the soft volumetric lobe that fog, smoke and haze are built from
    transitions.js    the channel change between animations, one per scene
    dissolves.js      the dissolve between compositions of one animation, one per scene

  scenes/index.js     the registry, newest first
  scenes/<id>/        one folder per animation; its name is the scene id, index.js is
                      the entry point, and no scene may import another
```

The split between `lib` and `effects` is the one that matters: `lib` is machinery every scene
needs and `effects` is technique any scene may borrow. A scene reaching into another scene is a
test failure — the moment one does, they stop being separable.

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
`Space` `Home` `End`, and `←` `→` between compositions). Where an animation has more than one
composition the live region says so, and names both the tap and the arrow keys — a tap-only
affordance is otherwise undiscoverable without sight. Visitors who ask for reduced motion get a still
frame held at the moment each scene reads best, the chevrons stop bobbing, and the channel change is
skipped entirely.

## Versioning

SemVer, with two repo-specific rules:

- A **MAJOR** bump marks an animation being *finished* and the next one starting — always that, and
  only that. Every new animation cuts one, however small; nothing else cuts one, however large.
  `1.0.0` finished *Asleep Among the Stars* and started *Westbound on Grizzly Peak*; `2.0.0`
  finished that one and started *Above the Fog*; `3.0.0` finished that one and started *The Rose
  Funnel*. If a bump can't name both, it isn't a MAJOR.
- **Changes fold into the current version** rather than minting a new number each round, so
  `CHANGELOG.md` describes what the project *is* rather than logging every intermediate state it
  passed through. A new section opens when an animation is finished, not on any other signal —
  this project doesn't use git tags or GitHub Releases, and nothing waits on them.

See `.claude/CLAUDE.md`.

## Deployment

Pushing to `main` deploys `site/` to GitHub Pages via `.github/workflows/pages.yml`. This needs
**Settings → Pages → Source: GitHub Actions** enabled once, by hand, on the repository.

## License

MIT — see [LICENSE](LICENSE).
