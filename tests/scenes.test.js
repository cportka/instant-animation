// The registry contract: every scene is well-formed and discoverable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { scenes, findScene } from '../site/scenes/index.js';

const sceneDir = fileURLToPath(new URL('../site/scenes/', import.meta.url));

test('the gallery is not empty', () => {
  assert.ok(scenes.length > 0, 'site/scenes/index.js exports no scenes');
});

test('every scene exports meta and create', () => {
  for (const scene of scenes) {
    assert.equal(typeof scene.create, 'function', `${scene.meta?.id}: create must be a function`);
    assert.equal(typeof scene.meta, 'object', 'a scene is missing its meta export');
  }
});

test('scene metadata is complete', () => {
  for (const { meta } of scenes) {
    assert.match(meta.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad scene id: ${meta.id}`);
    assert.ok(meta.title?.trim(), `${meta.id}: title is required`);
    // The prompt is the whole point — it's the description the animation came from.
    assert.ok(meta.prompt?.trim().length > 10, `${meta.id}: prompt is required`);
    assert.match(meta.created, /^\d{4}-\d{2}-\d{2}$/, `${meta.id}: created must be YYYY-MM-DD`);
    if (meta.background !== undefined) {
      assert.match(meta.background, /^#[0-9a-f]{3,8}$/i, `${meta.id}: background must be a hex colour`);
    }
    if (meta.posterTime !== undefined) {
      assert.ok(Number.isFinite(meta.posterTime) && meta.posterTime >= 0, `${meta.id}: bad posterTime`);
    }
  }
});

test('scene ids are unique and resolvable', () => {
  const ids = scenes.map((scene) => scene.meta.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate scene ids: ${ids.join(', ')}`);
  for (const id of ids) {
    assert.equal(findScene(id)?.meta.id, id);
  }
});

test('the gallery is ordered newest first', () => {
  const dates = scenes.map((scene) => scene.meta.created);
  const sorted = [...dates].sort().reverse();
  assert.deepEqual(
    dates,
    sorted,
    'site/scenes/index.js must list scenes newest-first — down means older, up means newer',
  );
});

test('every scene folder is registered, and every id matches its folder', () => {
  // One directory per animation. A scene is a self-contained thing that may grow to several files,
  // so the unit on disk is the folder and its name is the id — which is also what makes the
  // registry checkable: anything here that isn't in index.js would never ship.
  const folders = readdirSync(sceneDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const ids = scenes.map((scene) => scene.meta.id).sort();
  assert.deepEqual(
    ids,
    folders,
    'site/scenes/index.js and the folders on disk disagree — an unregistered scene never ships',
  );
});

test('no scene reaches into another scene', () => {
  // The point of a scene being its own folder. Shared code lives in site/effects (animation) or
  // site/lib (engine); the moment one scene imports another they stop being separable and the
  // gallery becomes one program with two entry points.
  for (const folder of readdirSync(sceneDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    for (const file of readdirSync(new URL(`${folder.name}/`, new URL('../site/scenes/', import.meta.url)))) {
      if (!file.endsWith('.js')) continue;
      const source = readFileSync(new URL(`${folder.name}/${file}`, new URL('../site/scenes/', import.meta.url)), 'utf8');
      const reaches = [...source.matchAll(/from '\.\.\/([a-z0-9-]+)\//g)].map((m) => m[1]);
      for (const target of reaches) {
        assert.notEqual(target, folder.name, `${folder.name}/${file} imports itself the long way round`);
        assert.ok(
          !folders_(sceneDir).includes(target),
          `${folder.name}/${file} imports scene "${target}" — put shared code in site/effects instead`,
        );
      }
    }
  }
});

const folders_ = (dir) =>
  readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
