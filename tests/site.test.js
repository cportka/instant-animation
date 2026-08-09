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

test('navigation is two chevrons, hidden until there is somewhere to go', () => {
  for (const id of ['nav-up', 'nav-down']) {
    const button = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(button, `missing ${id} button`);
    assert.match(button, /aria-label="/, `${id} needs an accessible name — it has no text`);
    assert.match(button, /\bhidden\b/, `${id} must start hidden and be revealed by app.js`);
  }
});

test('the canvas and live region carry the description for screen readers', () => {
  assert.match(html, /<canvas[^>]+aria-label="/);
  assert.match(html, /id="live"[^>]*class="sr-only"[^>]*role="status"/);
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

test('the chevrons are invisible until they peek, once every ten seconds', () => {
  const css = read('styles.css');

  // Invisible at rest: the animation is the page, and a control parked on top of it is chrome.
  const base = css.slice(css.indexOf('\n.nav {'), css.indexOf('.nav[hidden]'));
  assert.match(base, /opacity:\s*0\s*;/, '.nav must sit at zero opacity between peeks');

  for (const rule of ['.nav--down', '.nav--up']) {
    const block = css.slice(css.indexOf(rule), css.indexOf('}', css.indexOf(rule)));
    assert.match(block, /peek\s+10s/, `${rule} must run the peek cycle on a ten-second period`);
  }

  // Visible for about a second in the middle of the cycle, with a fade either side. Percentages
  // are of ten seconds, so the held span is (last full - first full) / 10.
  const peek = css.slice(css.indexOf('@keyframes peek'));
  const stops = [...peek.slice(0, peek.indexOf('\n}')).matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
  const opaque = [...peek.slice(0, peek.indexOf('\n}')).matchAll(/([\d.]+)%,?\s*\n\s*([\d.]+)%\s*\{\s*opacity:\s*var\(--nav-idle\)/g)];
  assert.ok(opaque.length === 1, 'expected exactly one held-visible span in the peek cycle');
  const held = (Number(opaque[0][2]) - Number(opaque[0][1])) / 100 * 10;
  assert.ok(held > 0.8 && held < 1.3, `chevrons hold visible for ${held.toFixed(2)}s, expected ~1s`);
  assert.ok(Math.max(...stops) === 100 && Math.min(...stops) === 0, 'peek must cover the whole cycle');

  // Hover and focus have to override the cycle, or the control only answers on its own schedule.
  const hoverAt = css.indexOf('.nav:hover');
  const reach = css.slice(hoverAt, css.indexOf('}', hoverAt));
  assert.match(reach, /animation:\s*none/, 'hover/focus must cancel the peek so the opacity below wins');
});
