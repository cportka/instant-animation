// The registry contract: every scene is well-formed and discoverable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
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

test('every scene file is registered, and every id matches its filename', () => {
  const files = readdirSync(sceneDir)
    .filter((name) => name.endsWith('.js') && name !== 'index.js')
    .map((name) => name.replace(/\.js$/, ''))
    .sort();
  const ids = scenes.map((scene) => scene.meta.id).sort();
  assert.deepEqual(
    ids,
    files,
    'site/scenes/index.js and the files on disk disagree — an unregistered scene never ships',
  );
});
