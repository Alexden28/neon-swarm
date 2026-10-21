import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/engine/rng.js';
import { SpatialHash } from '../src/engine/spatialHash.js';
import { createLoop } from '../src/engine/loop.js';
import { segmentHitsCircle, damp } from '../src/engine/math.js';

test('rng: same seed gives the same sequence, different seeds diverge', () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const seqA = Array.from({ length: 100 }, () => a.next());
  const seqB = Array.from({ length: 100 }, () => b.next());
  const seqC = Array.from({ length: 100 }, () => c.next());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
});

test('rng: next() stays in [0, 1) and int() is inclusive on both ends', () => {
  const rng = createRng(7);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1);
    seen.add(rng.int(1, 3));
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('rng: weightedIndex never returns a zero-weight entry', () => {
  const rng = createRng(3);
  for (let i = 0; i < 2000; i++) {
    const idx = rng.weightedIndex([0, 2, 0, 1]);
    assert.ok(idx === 1 || idx === 3);
  }
});

test('spatial hash: queries return every overlapping item exactly once (vs brute force)', () => {
  const rng = createRng(11);
  const hash = new SpatialHash(64);
  for (let round = 0; round < 20; round++) {
    hash.clear();
    const items = Array.from({ length: 200 }, (_, id) => ({ id, x: rng.range(0, 2000), y: rng.range(0, 2000), r: rng.range(4, 60) }));
    for (const it of items) hash.insert(it);
    for (let q = 0; q < 50; q++) {
      const x = rng.range(0, 2000);
      const y = rng.range(0, 2000);
      const r = rng.range(5, 120);
      const found = hash.query(x, y, r);
      assert.equal(new Set(found).size, found.length, 'no duplicates');
      const expected = items.filter((it) => (it.x - x) ** 2 + (it.y - y) ** 2 <= (it.r + r) ** 2);
      for (const it of expected) assert.ok(found.includes(it), `missing overlapping item ${it.id}`);
    }
  }
});

test('spatial hash: clear() empties every cell', () => {
  const hash = new SpatialHash(32);
  hash.insert({ x: 10, y: 10, r: 5 });
  hash.insert({ x: 500, y: 500, r: 50 });
  hash.clear();
  assert.equal(hash.query(10, 10, 1000).length, 0);
});

test('segmentHitsCircle catches a fast bullet passing straight through a small target', () => {
  // A 40-unit step jumps completely over a radius-7 circle; the swept test must still hit.
  assert.ok(segmentHitsCircle(0, 0, 40, 0, 20, 3, 7));
  assert.ok(!segmentHitsCircle(0, 0, 40, 0, 20, 12, 7));
  assert.ok(!segmentHitsCircle(0, 0, 40, 0, 60, 0, 7));
});

test('damp is frame-rate independent', () => {
  let a = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 100, 5, 1 / 60);
  let b = 0;
  for (let i = 0; i < 30; i++) b = damp(b, 100, 5, 1 / 30);
  assert.ok(Math.abs(a - b) < 1e-9);
});

test('loop: runs a fixed number of steps for the elapsed time and clamps long frames', () => {
  let t = 0;
  let pending = null;
  let steps = 0;
  const loop = createLoop({
    step: () => steps++,
    render: () => {},
    dt: 1 / 60,
    now: () => t,
    raf: (cb) => {
      pending = cb;
    },
  });
  loop.start();
  t += 0.5; // half a second at 60 Hz, but maxFrame clamps it to 0.25 s
  pending();
  assert.equal(steps, 15);
  for (let i = 0; i < 60; i++) {
    t += 1 / 60;
    pending();
  }
  assert.ok(steps >= 74 && steps <= 76, `expected ~75 steps, got ${steps}`);
  loop.stop();
});
