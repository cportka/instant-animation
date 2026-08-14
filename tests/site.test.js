// The deployed site has to hold together on GitHub Pages, where it lives under a
// /instant-animation/ path — so every asset reference must be relative and must exist.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const siteDir = fileURLToPath(new URL('../site/', import.meta.url));
const read = (name) => readFileSync(join(siteDir, name), 'utf8');

const html = read('index.html');

const { scenes } = await import('../site/scenes/index.js');
const { wrapIndex } = await import('../site/lib/gallery.js');

test('index.html exists and names the app', () => {
  assert.match(html, /<title>[^<]*Instant Animation[^<]*<\/title>/);
  assert.match(html, /<canvas[^>]+id="stage"/);
  assert.match(html, /<script type="module" src="app\.js">/);
});

test('nothing is written on the page', () => {
  // The animation is the interface. The only text allowed in the body is what a screen reader
  // needs (the live region, the noscript fallback) and it must never be visible.
  const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'));
  const withoutHidden = body
    .replace(/<p id="live"[\s\S]*?<\/p>/, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  assert.equal(withoutHidden, '', `visible text found in index.html: ${JSON.stringify(withoutHidden)}`);
});

test('navigation is two chevrons, hidden until app.js decides otherwise', () => {
  for (const id of ['nav-up', 'nav-down']) {
    const button = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(button, `missing ${id} button`);
    assert.match(button, /aria-label="/, `${id} needs an accessible name — it has no text`);
    assert.match(button, /\bhidden\b/, `${id} must start hidden and be revealed by app.js`);
  }
});

test('the gallery is a ring: every index lands on a real scene', () => {
  // The navigation wraps, so `show()` and `travel()` are handed out-of-range indices by design —
  // down from the last scene asks for `scenes.length`, up from the first asks for `-1`. Both have to
  // come back to something that exists.
  const count = scenes.length;
  for (let i = -2 * count - 1; i <= 2 * count + 1; i += 1) {
    const landed = wrapIndex(i, count);
    assert.ok(
      Number.isInteger(landed) && landed >= 0 && landed < count,
      `wrapIndex(${i}, ${count}) gave ${landed}, which is not a scene`,
    );
    assert.ok(scenes[landed], `wrapIndex(${i}, ${count}) points at nothing`);
  }

  // The two that matter, named: off each end and onto the other.
  assert.equal(wrapIndex(count, count), 0, 'down from the last animation must reach the first');
  assert.equal(wrapIndex(-1, count), count - 1, 'up from the first animation must reach the last');

  // JavaScript's remainder keeps the sign of its left operand, so a plain `i % n` sends up-from-the-
  // first to `scenes[-1]` — undefined, and a blank page. This is the assertion that catches it.
  assert.equal(wrapIndex(-1, 3), 2);
  assert.equal(wrapIndex(-4, 3), 2);

  // A gallery of one, and the degenerate case, both land somewhere rather than on NaN.
  assert.equal(wrapIndex(5, 1), 0);
  assert.equal(wrapIndex(-5, 1), 0);
  assert.equal(wrapIndex(3, 0), 0);
});

test('app.js wraps rather than clamps, and keeps both chevrons live', () => {
  const app = read('app.js');
  assert.match(app, /wrapIndex\(index, scenes\.length\)/, 'show() must wrap the index it is given');
  assert.match(app, /wrapIndex\(current \+ delta, scenes\.length\)/, 'travel() must wrap past the ends');
  // The old shape — hiding a chevron at each end — is exactly what a ring does not do.
  assert.doesNotMatch(app, /navUp\.hidden\s*=\s*current === 0/, 'the up chevron must not hide at the top');
  assert.doesNotMatch(
    app,
    /navDown\.hidden\s*=\s*current === scenes\.length - 1/,
    'the down chevron must not hide at the bottom',
  );
});

test('the canvas and live region carry the description for screen readers', () => {
  assert.match(html, /<canvas[^>]+aria-label="/);
  assert.match(html, /id="live"[^>]*class="sr-only"[^>]*role="status"/);
});

test('a tap re-composes, a swipe travels, and the gap between them does nothing', () => {
  const app = read('app.js');

  // The two gestures are told apart by distance, and there is deliberate daylight between them.
  assert.match(app, /Math\.hypot\(dx, dy\) <= TAP_SLOP/, 'a tap must be bounded by how far it moved');
  assert.ok(
    Number(app.match(/const TAP_SLOP = (\d+)/)?.[1]) < Number(app.match(/const SWIPE_THRESHOLD = (\d+)/)?.[1]),
    'TAP_SLOP must be smaller than SWIPE_THRESHOLD, or every tap is also a swipe',
  );
  // The swipe is tested first and returns, so a long vertical drag can never also count as a tap.
  assert.match(app, /travel\(dy < 0 \? 1 : -1\);\s*\n\s*return;/, 'a swipe must return before the tap check');

  // Pointer capture and cancel, together. A press that starts on the canvas and releases over a
  // chevron otherwise leaves swipeStart set, and the *next* release travels the gallery for no
  // reason — an intermittent bug that only ever reproduces on touch.
  assert.match(app, /setPointerCapture/, 'the canvas must capture the pointer it is tracking');
  assert.match(app, /'pointercancel'/, 'a cancelled pointer must clear the gesture');
  assert.match(app, /event\.pointerId !== swipeStart\.id/, 'a second pointer must not finish the first gesture');

  // Both rings share one lock. A tap that interrupts a channel change drops the outgoing scene.
  assert.match(app, /function recompose\(delta\)/, 'app.js must expose composition cycling');
  assert.match(app, /if \(locked \|\| !variants \|\| variants\.length < 2\) return;/, 'recompose must respect the lock');

  // A composition of the scene already on screen still has to re-mount, or deep links to one are
  // dead for anyone who already had the page open.
  assert.match(app, /next === current && pick === shown/, 'the no-op guard must compare the composition too');

  // And it is reachable without a pointer at all.
  assert.match(app, /case 'ArrowRight':/, 'compositions need a keyboard route');
  assert.match(app, /case 'ArrowLeft':/, 'compositions need a keyboard route in both directions');
});

test('every asset index.html references exists', () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 3, 'expected index.html to reference its stylesheet, icon and script');
  for (const ref of refs) {
    if (/^(https?:)?\/\//.test(ref)) continue; // external, nothing to check on disk
    assert.ok(existsSync(join(siteDir, ref)), `index.html references missing file: ${ref}`);
  }
});

test('no root-absolute asset paths', () => {
  // A leading slash resolves to cportka.github.io/… and 404s on a project Pages site.
  const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(absolute, [], `use relative paths on a project Pages site: ${absolute.join(', ')}`);
});

test('the front-end has no external runtime dependencies', () => {
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  const external = scripts.filter((src) => /^(https?:)?\/\//.test(src));
  assert.deepEqual(external, [], 'the site is meant to ship as plain modules with no CDN');
});

test('every module import resolves on disk', () => {
  const walk = (dir) =>
    readdirSync(join(siteDir, dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(dir, entry.name))
        : entry.name.endsWith('.js')
          ? [join(dir, entry.name)]
          : [],
    );

  const files = walk('.');
  assert.ok(files.length >= 4, 'expected the site to ship several modules');

  for (const file of files) {
    const source = readFileSync(join(siteDir, file), 'utf8');
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const specifier of imports) {
      assert.ok(
        specifier.startsWith('.'),
        `${file} imports a bare specifier "${specifier}" — there is no bundler here`,
      );
      const resolved = fileURLToPath(new URL(specifier, new URL(file, `file://${siteDir}`)));
      assert.ok(existsSync(resolved), `${file} imports missing module: ${specifier}`);
    }
  }
});

test('styles keep the animation full-bleed', () => {
  const css = read('styles.css');
  assert.match(css, /#stage\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /overflow:\s*hidden/);
});

test('the floating chevrons hold still for reduced motion', () => {
  const css = read('styles.css');
  assert.match(css, /@keyframes float-down/);
  assert.match(css, /@keyframes float-up/);
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /animation:\s*none/, 'the chevrons must stop bobbing for reduced motion');
  // With the peek keyframes driving opacity, dropping the animation is what makes the chevrons
  // steadily visible again — so reduced motion must also set an opacity, or they never appear.
  assert.match(reduced, /opacity:\s*[\d.]+/, 'reduced motion must give the chevrons a fixed opacity');
});

test('the arrows wear whichever scene is mounted', async () => {
  const html = read('index.html');
  const css = read('styles.css');
  const app = read('app.js');
  const { scenes } = await import('../site/scenes/index.js');

  // Every chrome a scene asks for must have a glyph in the markup and a rule that shows it —
  // a scene naming one that does not exist would silently render no arrow at all.
  const declared = new Set(scenes.map((scene) => scene.meta.chrome).filter(Boolean));
  assert.ok(declared.size > 1, 'at least two scenes must differ, or this is one style with extra steps');

  for (const chrome of declared) {
    for (const id of ['nav-up', 'nav-down']) {
      const button = html.slice(html.indexOf(`id="${id}"`));
      const body = button.slice(0, button.indexOf('</button>'));
      assert.match(body, new RegExp(`nav__glyph--${chrome}\\b`), `${id} has no ${chrome} glyph`);
    }
    assert.match(
      css,
      new RegExp(`\\[data-chrome='${chrome}'\\][^{]*\\.nav__glyph--${chrome}\\s*\\{[^}]*display:\\s*block`),
      `no rule reveals the ${chrome} glyph`,
    );
  }

  // Glyphs are hidden by default, so a missing or unknown chrome must still leave one showing.
  assert.match(css, /\.nav__glyph\s*\{[^}]*display:\s*none/, 'glyphs must start hidden');
  assert.match(css, /\.nav:not\(\[data-chrome\]\)\s+\.nav__glyph--neon/, 'no fallback glyph for a scene with no chrome');
  assert.match(app, /dataset\.chrome\s*=\s*scene\.meta\.chrome\s*\|\|\s*'neon'/, 'app.js must apply the scene chrome with a fallback');
});

test('the chevrons flash once on arrival and never again', () => {
  const css = read('styles.css');

  // Invisible at rest: the animation is the page, and a control parked on top of it is chrome.
  const base = css.slice(css.indexOf('\n.nav {'), css.indexOf('.nav[hidden]'));
  assert.match(base, /opacity:\s*0\s*;/, '.nav must sit at zero opacity once it has introduced itself');

  for (const rule of ['.nav--down', '.nav--up']) {
    const block = css.slice(css.indexOf(rule), css.indexOf('}', css.indexOf(rule)));
    const peek = block.match(/peek\s+([\d.]+)s[^,;]*/)?.[0];
    assert.ok(peek, `${rule} must run the peek animation`);
    // The whole point: it runs a fixed number of times, and that number is one. A control that
    // resurfaces on a timer is a control that keeps interrupting.
    assert.doesNotMatch(peek, /infinite/, `${rule} must not repeat its peek forever`);
    assert.match(peek, /\s1$/, `${rule} must run the peek exactly once`);
  }

  // Held visible for about a second, with a fade either side. Percentages are of the peek's own
  // duration, which is read out of the rule rather than assumed.
  const seconds = Number(css.match(/peek\s+([\d.]+)s/)[1]);
  const peek = css.slice(css.indexOf('@keyframes peek'));
  const body = peek.slice(0, peek.indexOf('\n}'));
  const stops = [...body.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
  const opaque = [...body.matchAll(/([\d.]+)%,?\s*\n\s*([\d.]+)%\s*\{\s*opacity:\s*var\(--nav-idle\)/g)];
  assert.ok(opaque.length === 1, 'expected exactly one held-visible span in the peek');
  const held = ((Number(opaque[0][2]) - Number(opaque[0][1])) / 100) * seconds;
  assert.ok(held > 0.8 && held < 1.5, `chevrons hold visible for ${held.toFixed(2)}s, expected ~1s`);
  assert.ok(Math.max(...stops) === 100 && Math.min(...stops) === 0, 'peek must cover its whole timeline');
  // It has to be over quickly — this is an introduction, not an interlude.
  assert.ok(seconds <= 4, `the peek runs for ${seconds}s; it should be done with well inside four`);

  // Hover and focus have to override it, or the control is unreachable for the rest of the visit.
  const hoverAt = css.indexOf('.nav:hover');
  const reach = css.slice(hoverAt, css.indexOf('}', hoverAt));
  assert.match(reach, /animation:\s*none/, 'hover/focus must cancel the peek so the opacity below wins');

  // Every per-scene chrome override must keep `peek` in the same slot of the animation-name list.
  // Reorder it and the browser matches animations by position, restarts it, and the chevrons flash
  // again on every scene change — which is the exact behaviour this test exists to prevent.
  for (const [, names] of css.matchAll(/animation-name:\s*([^;]+);/g)) {
    const list = names.split(',').map((n) => n.trim());
    assert.equal(list[1], 'peek', `animation-name "${names.trim()}" must keep peek second`);
  }

  // ...and any override that restates `animation-duration` must give the peek the same length as the
  // base rule. It is a positional list, so the second value *is* the peek's duration — this is how a
  // one-second introduction silently became four and a half, and on the chrome the first scene wears,
  // which meant the correct timing was the one nobody ever saw.
  for (const [, durations] of css.matchAll(/animation-duration:\s*([^;]+);/g)) {
    const list = durations.split(',').map((d) => d.trim());
    assert.equal(
      list[1],
      `${seconds}s`,
      `animation-duration "${durations.trim()}" gives the peek ${list[1]}, not the base rule's ${seconds}s`,
    );
  }
});
