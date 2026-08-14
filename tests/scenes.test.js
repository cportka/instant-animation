// The registry contract: every scene is well-formed and discoverable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { scenes, findScene } from '../site/scenes/index.js';
import { formatAddress, parseAddress, wrapIndex } from '../site/lib/gallery.js';
import { TRANSITIONS, channelChange, makeChannelChange } from '../site/effects/transitions.js';
import { DISSOLVES, dissolve } from '../site/effects/dissolves.js';
import { createRng } from '../site/lib/rng.js';
import { createRecordingContext } from './helpers/recording-context.mjs';

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

test('a scene with several compositions declares them properly', () => {
  for (const { meta } of scenes) {
    if (meta.variants === undefined) continue;
    assert.ok(Array.isArray(meta.variants), `${meta.id}: meta.variants must be an array`);
    // One composition is not a ring, it is a scene — and declaring it invites a tap that does
    // nothing, which is worse than no affordance at all.
    assert.ok(meta.variants.length > 1, `${meta.id}: meta.variants needs more than one entry`);
    for (const variant of meta.variants) {
      assert.match(variant.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${meta.id}: bad variant id "${variant.id}"`);
      assert.ok(variant.title?.trim(), `${meta.id}/${variant.id}: a composition needs a title`);
    }
    const ids = meta.variants.map((v) => v.id);
    // Variant ids are a public URL surface. Two the same and one of them is unreachable forever.
    assert.equal(new Set(ids).size, ids.length, `${meta.id}: duplicate variant ids: ${ids.join(', ')}`);
  }
});

test('a scene with compositions brings its own way of re-arranging', () => {
  // The second change in the gallery, and it wears the scene for the same reason the first does. A
  // scene that declares compositions but no dissolve would re-arrange itself with nothing at all —
  // an instant cut, which is the one thing that reads as a bug rather than as an effect.
  for (const { meta } of scenes) {
    if (!meta.variants) continue;
    assert.ok(meta.dissolve, `${meta.id}: has compositions but no meta.dissolve`);
    assert.ok(DISSOLVES.includes(meta.dissolve), `${meta.id}: dissolve "${meta.dissolve}" is not implemented`);
  }
});

test('every dissolve rots, cleanly and the same way twice', () => {
  // A stand-in scratch layer: the dissolve reads the frozen frame and must not care that it is a
  // stub, because in Node there is no canvas to have frozen.
  const stale = { width: 1280, height: 720 };
  const tape = { of: () => stale, source: stale, capture() {} };
  const run = (kind, progress) => {
    const rec = createRecordingContext({ width: 1280, height: 720 });
    dissolve(kind, rec.ctx, 1280, 720, progress, 4.5, tape);
    return rec;
  };

  const shapes = new Map();
  for (const kind of DISSOLVES) {
    const rec = run(kind, 0.5);
    assert.ok(rec.ops.length > 40, `${kind} barely drew anything (${rec.ops.length} ops)`);
    rec.assertClean(`dissolve ${kind}`);
    assert.equal(rec.depth, 0, `${kind}: unbalanced save/restore`);
    assert.deepEqual(run(kind, 0.5).ops, rec.ops, `${kind} is not deterministic`);

    // Bounded at both ends. At zero the old arrangement is simply still on screen and the stage has
    // not swapped yet; at one it is gone, and a dissolve still stamping anything at one is a
    // permanent overlay that never lifts.
    assert.equal(run(kind, 0).ops.length, 0, `${kind} draws before it has begun`);
    assert.equal(run(kind, 1).ops.length, 0, `${kind} is still drawing once it is over`);

    // ...and it thins as it goes: later is always fewer surviving blocks than earlier, which is what
    // makes it a dissolve rather than a shuffle.
    const early = run(kind, 0.25).ops.length;
    const late = run(kind, 0.8).ops.length;
    assert.ok(late < early, `${kind} does not thin out (${early} → ${late})`);
    shapes.set(kind, rec.ops.join('|'));
  }
  assert.equal(new Set(shapes.values()).size, DISSOLVES.length, 'two dissolves draw identically');
});

test('a composition is a lookup, never a fork', () => {
  // The whole design of the feature in one assertion. A variant is a block of numbers the scene
  // reads; the moment a scene asks *which* composition it is and branches, the two arrangements stop
  // being one implementation and start being two that happen to share a file — and every future
  // change has to be made twice, in a place where nothing will tell you that you missed one.
  const forks = /\bvariant(?:\.id)?\s*===|switch\s*\(\s*variant/;
  for (const folder of readdirSync(sceneDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    for (const file of readdirSync(new URL(`${folder.name}/`, new URL('../site/scenes/', import.meta.url)))) {
      if (!file.endsWith('.js')) continue;
      const source = readFileSync(
        new URL(`${folder.name}/${file}`, new URL('../site/scenes/', import.meta.url)),
        'utf8',
      );
      assert.doesNotMatch(
        source,
        forks,
        `${folder.name}/${file} branches on the composition — put the difference in meta.variants instead`,
      );
    }
  }
});

test('every composition draws a different picture', () => {
  // The whole promise of the feature. A variant block that the scene reads but never *acts* on
  // fails nothing else in this suite: it renders, it is deterministic, it survives a resize — and
  // it puts the identical picture on screen, so the tap appears broken and nothing says why.
  const viewport = { width: 1200, height: 800 };
  const shot = (scene, variant) => {
    const rec = createRecordingContext(viewport);
    const instance = scene.create({ ...viewport, seed: scene.meta.id, variant });
    instance.draw(rec.ctx, 6.4, 1 / 60);
    return rec.fingerprint();
  };

  for (const scene of scenes) {
    if (!scene.meta.variants) continue;
    const shapes = scene.meta.variants.map((variant) => shot(scene, variant));
    assert.equal(
      new Set(shapes).size,
      shapes.length,
      `${scene.meta.id}: two compositions render identically — the variant is declared but unused`,
    );
    // ...and the one the gallery opens on is the first, which is what every existing deep link and
    // every caller that predates compositions resolves to.
    assert.equal(
      shot(scene, undefined),
      shapes[0],
      `${scene.meta.id}: create() without a variant must draw meta.variants[0]`,
    );
  }
});

test('the gallery has two axes, and both of them wrap', () => {
  // Addresses round-trip: whatever `formatAddress` writes, `parseAddress` reads back as the same
  // place. The bare `#id` form is asserted separately because it is a promise to links already in
  // the world, not merely an internal consistency property.
  for (const scene of scenes) {
    const variants = scene.meta.variants ?? [undefined];
    for (let i = 0; i < variants.length; i += 1) {
      const at = parseAddress(formatAddress(scene, i), scenes);
      assert.equal(scenes[at.index].meta.id, scene.meta.id, `${scene.meta.id}: address lost the scene`);
      assert.equal(at.variant ?? 0, i, `${scene.meta.id}: address lost composition ${i}`);
    }
    assert.equal(formatAddress(scene, 0), `#${scene.meta.id}`, 'the first composition writes a bare id');
  }

  // Off either end of either ring lands somewhere real.
  assert.equal(wrapIndex(-1, scenes.length), scenes.length - 1);
  assert.equal(wrapIndex(scenes.length, scenes.length), 0);
  const ringed = scenes.find((s) => s.meta.variants);
  if (ringed) {
    const n = ringed.meta.variants.length;
    assert.equal(wrapIndex(-1, n), n - 1, 'walking back off the first composition reaches the last');
    assert.equal(wrapIndex(n, n), 0, 'walking on off the last composition reaches the first');
  }

  // An address nobody wrote resolves to the front rather than to a blank page.
  assert.deepEqual(parseAddress('#no-such-scene', scenes), { index: 0, variant: undefined });
  assert.deepEqual(parseAddress('', scenes), { index: 0, variant: undefined });
  if (ringed) {
    assert.equal(parseAddress(`#${ringed.meta.id}/no-such-composition`, scenes).variant, undefined);
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

test('every scene brings its own way of being arrived at', () => {
  // A scene naming a change nobody implements falls back silently to the tape one — which is the
  // VHS scene's language, and is exactly the mismatch this whole mechanism exists to stop.
  for (const { meta } of scenes) {
    assert.ok(meta.transition, `${meta.id}: no meta.transition — pick one of ${TRANSITIONS.join(', ')}`);
    assert.ok(
      TRANSITIONS.includes(meta.transition),
      `${meta.id}: meta.transition "${meta.transition}" is not implemented`,
    );
  }
  // And they have to actually differ, or this is one effect wearing three names.
  assert.ok(new Set(scenes.map((s) => s.meta.transition)).size > 1);
});

test('every channel change draws, cleanly and the same way twice', () => {
  const change = makeChannelChange(createRng('channel-change'));
  const run = (kind, violence) => {
    const rec = createRecordingContext({ width: 1280, height: 720 });
    channelChange(kind, rec.ctx, 1280, 720, 4.5, violence, 360, change, null);
    return rec;
  };

  const shapes = new Map();
  for (const kind of TRANSITIONS) {
    const rec = run(kind, 0.8);
    // Ops rather than paints: the pixel change does most of its work through `drawImage` and a
    // couple of batched paths, so counting fills would call a change that redraws the whole frame
    // "four paints" and let an empty one through.
    assert.ok(rec.ops.length > 60, `${kind} barely drew anything (${rec.ops.length} ops)`);
    assert.ok(rec.paints > 0, `${kind} painted nothing at all`);
    rec.assertClean(`channel change ${kind}`);
    assert.equal(rec.depth, 0, `${kind}: unbalanced save/restore`);
    assert.deepEqual(run(kind, 0.8).ops, rec.ops, `${kind} is not deterministic`);
    // Settled at both ends of the move: a change still drawing at rest is an overlay.
    assert.equal(run(kind, 0).paints, 0, `${kind} still draws at zero violence`);
    shapes.set(kind, rec.ops.join('|'));
  }
  assert.equal(new Set(shapes.values()).size, TRANSITIONS.length, 'two changes draw identically');
});
