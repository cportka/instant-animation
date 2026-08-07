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
});
