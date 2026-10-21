import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/engine/rng.js';
import { ENEMIES, DIRECTOR, xpToNext } from '../src/game/config.js';
import { composeWave, waveBudget, isBossWave } from '../src/game/director.js';
import { UPGRADES, rollUpgrades, applyUpgrade } from '../src/game/upgrades.js';
import { createWorld, createPlayer, step, chooseUpgrade, spawnEnemy } from '../src/game/world.js';
import { autopilot } from '../src/game/autopilot.js';

test('waves spend their whole budget on unlocked enemy types only', () => {
  const rng = createRng(5);
  for (let wave = 1; wave <= 30; wave++) {
    const queue = composeWave(wave, rng);
    const regular = queue.filter((t) => t !== 'boss');
    const spent = regular.reduce((sum, t) => sum + ENEMIES[t].cost, 0);
    assert.equal(spent, waveBudget(wave), `wave ${wave}`);
    for (const type of regular) assert.ok(ENEMIES[type].unlock <= wave, `${type} appeared too early in wave ${wave}`);
    assert.equal(queue.includes('boss'), isBossWave(wave));
    if (isBossWave(wave)) assert.equal(queue.at(-1), 'boss', 'boss spawns first');
  }
});

test('xp required per level strictly increases', () => {
  for (let level = 1; level < 50; level++) assert.ok(xpToNext(level + 1) > xpToNext(level));
});

test('upgrade rolls are distinct and never offer a maxed-out upgrade', () => {
  const rng = createRng(9);
  const player = createPlayer();
  for (let i = 0; i < 200; i++) {
    const choices = rollUpgrades(rng, player.stacks, 3);
    assert.equal(new Set(choices).size, choices.length);
    for (const id of choices) {
      const max = UPGRADES.find((u) => u.id === id).max;
      assert.ok((player.stacks[id] ?? 0) < max);
    }
    if (choices.length) applyUpgrade(player, choices[0]);
  }
  // After 200 picks everything is maxed out, so nothing can be offered any more.
  assert.deepEqual(rollUpgrades(rng, player.stacks, 3), []);
  for (const u of UPGRADES) assert.equal(player.stacks[u.id], u.max);
});

test('upgrades change the stats they describe', () => {
  const p = createPlayer();
  const fireRate = p.weapon.fireRate;
  applyUpgrade(p, 'rapid');
  assert.ok(Math.abs(p.weapon.fireRate - fireRate * 1.2) < 1e-9);
  applyUpgrade(p, 'multi');
  assert.equal(p.weapon.projectiles, 2);
  const hp = p.maxHp;
  applyUpgrade(p, 'plating');
  assert.equal(p.maxHp, hp + 20);
  assert.throws(() => applyUpgrade(p, 'nope'));
});

test('bullets kill an enemy in range and drop XP', () => {
  const world = createWorld({ seed: 1 });
  world.director.breakTimer = Infinity; // no waves: controlled scenario
  const e = spawnEnemy(world, 'drone', world.player.x + 200, world.player.y);
  e.spawn = 0;
  for (let i = 0; i < 120 && e.alive; i++) step(world, 1 / 60);
  assert.equal(e.alive, false);
  assert.equal(world.kills, 1);
  assert.equal(world.gems.length, 1);
});

test('splitters break into minis when destroyed', () => {
  const world = createWorld({ seed: 2 });
  world.director.breakTimer = Infinity;
  const e = spawnEnemy(world, 'splitter', world.player.x + 300, world.player.y);
  e.spawn = 0;
  for (let i = 0; i < 300 && e.alive; i++) step(world, 1 / 60);
  assert.equal(e.alive, false);
  assert.equal(world.enemies.filter((x) => x.type === 'mini').length, 3);
});

test('contact damage respects invulnerability frames', () => {
  const world = createWorld({ seed: 3 });
  world.director.breakTimer = Infinity;
  world.player.weapon.damage = 0; // let the enemy reach the player
  const e = spawnEnemy(world, 'brute', world.player.x, world.player.y);
  e.spawn = 0;
  step(world, 1 / 60);
  const afterFirstHit = world.player.hp;
  assert.equal(afterFirstHit, 100 - ENEMIES.brute.damage);
  for (let i = 0; i < 10; i++) step(world, 1 / 60); // still inside the 0.7 s window
  assert.equal(world.player.hp, afterFirstHit);
});

test('level-up pauses the simulation until an upgrade is chosen', () => {
  const world = createWorld({ seed: 4 });
  world.director.breakTimer = Infinity;
  world.gems.push({ x: world.player.x, y: world.player.y, vx: 0, vy: 0, value: 100, r: 5, homing: false, alive: true });
  step(world, 1 / 60);
  assert.equal(world.state, 'levelup');
  assert.equal(world.choices.length, 3);
  const time = world.time;
  step(world, 1 / 60);
  assert.equal(world.time, time, 'frozen while choosing');
  const levels = world.pendingLevelUps;
  assert.ok(chooseUpgrade(world, 0));
  assert.equal(world.pendingLevelUps, levels - 1);
});

function simulate(seed, seconds) {
  const world = createWorld({ seed });
  let maxEnemies = 0;
  for (let i = 0; i < seconds * 60 && world.state !== 'dead'; i++) {
    step(world, 1 / 60, autopilot(world));
    if (world.state === 'levelup') chooseUpgrade(world, 0);
    world.events.length = 0;
    maxEnemies = Math.max(maxEnemies, world.enemies.length);
    if (i % 60 === 0) {
      const p = world.player;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'player position is finite');
      assert.ok(p.hp <= p.maxHp + 1e-9);
      for (const e of world.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y) && e.hp > 0);
    }
  }
  return { world, maxEnemies };
}

test('headless 5-minute bot run: waves progress and the state stays valid', () => {
  const { world, maxEnemies } = simulate(1, 300);
  assert.ok(world.director.wave >= 5, `reached wave ${world.director.wave}`);
  assert.ok(world.kills > 100);
  assert.ok(world.player.level > 5);
  assert.ok(maxEnemies <= DIRECTOR.maxAlive + 60, `enemy count stayed bounded (${maxEnemies})`);
});

test('simulation is deterministic for a given seed', () => {
  const a = simulate(12345, 90).world;
  const b = simulate(12345, 90).world;
  assert.equal(a.score, b.score);
  assert.equal(a.kills, b.kills);
  assert.equal(a.player.x, b.player.x);
  assert.equal(a.rng.state, b.rng.state);
});
