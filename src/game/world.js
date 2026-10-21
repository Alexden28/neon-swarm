import { WORLD, PLAYER, WEAPON, ORBITAL, ENEMIES, DIRECTOR, xpToNext } from './config.js';
import { composeWave, hpScale, isBossWave } from './director.js';
import { rollUpgrades, applyUpgrade } from './upgrades.js';
import { createRng } from '../engine/rng.js';
import { SpatialHash } from '../engine/spatialHash.js';
import { TAU, clamp, damp, norm, segmentHitsCircle } from '../engine/math.js';

// The whole simulation. It has no DOM, canvas or audio dependency: it only mutates plain data
// and pushes events (`world.events`) that the renderer and audio layer react to. This keeps it
// deterministic and lets the tests run thousands of ticks headlessly in Node.

const NO_INPUT = Object.freeze({ x: 0, y: 0, dash: false });

export function createPlayer() {
  return {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    vx: 0,
    vy: 0,
    r: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    regen: 0,
    speed: PLAYER.speed,
    magnet: PLAYER.magnet,
    iframes: 0,
    dashTime: 0,
    dashCd: 0,
    dashCooldown: PLAYER.dashCooldown,
    facing: -Math.PI / 2,
    aim: -Math.PI / 2,
    fireCd: 0,
    weapon: { ...WEAPON },
    orbitals: 0,
    orbitAngle: 0,
    level: 1,
    xp: 0,
    xpNext: xpToNext(1),
    stacks: {},
  };
}

export function createWorld({ seed = 1 } = {}) {
  return {
    seed,
    rng: createRng(seed),
    time: 0,
    state: 'playing', // 'playing' | 'levelup' | 'dead'
    player: createPlayer(),
    enemies: [],
    bullets: [],
    enemyBullets: [],
    gems: [],
    events: [],
    score: 0,
    kills: 0,
    nextId: 1,
    hitStop: 0,
    director: { wave: 0, queue: [], spawnTimer: 0, breakTimer: DIRECTOR.firstWaveDelay, inWave: false, waveTime: 0 },
    pendingLevelUps: 0,
    choices: [],
    hash: new SpatialHash(64),
    near: [], // reusable query buffer
  };
}

function emit(world, type, data) {
  world.events.push({ type, ...data });
}

export function step(world, dt, input = NO_INPUT) {
  if (world.state !== 'playing') return;
  if (world.hitStop > 0) {
    world.hitStop -= dt; // brief freeze-frame when the player gets hit
    return;
  }
  world.time += dt;

  updatePlayer(world, dt, input);
  updateDirector(world, dt);
  updateEnemies(world, dt);
  rebuildHash(world);
  separateEnemies(world);
  updateWeapon(world, dt);
  updateBullets(world, dt);
  updateOrbitals(world);
  updateEnemyBullets(world, dt);
  updateContacts(world);
  updateGems(world, dt);

  compact(world.enemies);
  compact(world.bullets);
  compact(world.enemyBullets);
  compact(world.gems);

  if (world.player.hp <= 0) {
    world.player.hp = 0;
    world.state = 'dead';
    emit(world, 'gameover', { x: world.player.x, y: world.player.y, score: world.score });
  } else if (world.pendingLevelUps > 0) {
    openLevelUp(world);
  }
}

export function chooseUpgrade(world, index) {
  if (world.state !== 'levelup') return false;
  const id = world.choices[index];
  if (!id) return false;
  applyUpgrade(world.player, id);
  world.pendingLevelUps -= 1;
  world.choices = [];
  world.state = 'playing';
  emit(world, 'upgrade', { id });
  if (world.pendingLevelUps > 0) openLevelUp(world);
  return true;
}

function openLevelUp(world) {
  const choices = rollUpgrades(world.rng, world.player.stacks, 3);
  if (choices.length === 0) {
    // Everything is maxed out: level-ups become repairs instead of a menu.
    const p = world.player;
    p.hp = Math.min(p.maxHp, p.hp + 30 * world.pendingLevelUps);
    world.pendingLevelUps = 0;
    return;
  }
  world.choices = choices;
  world.state = 'levelup';
  emit(world, 'levelup', { level: world.player.level, x: world.player.x, y: world.player.y });
}

// --- player -------------------------------------------------------------------------------

function updatePlayer(world, dt, input) {
  const p = world.player;
  let ix = input.x || 0;
  let iy = input.y || 0;
  const il = Math.hypot(ix, iy);
  if (il > 1) {
    ix /= il;
    iy /= il;
  }
  if (il > 0.1) p.facing = Math.atan2(iy, ix);

  p.dashCd -= dt;
  if (input.dash && p.dashCd <= 0 && p.dashTime <= 0) {
    p.vx = Math.cos(p.facing) * PLAYER.dashSpeed;
    p.vy = Math.sin(p.facing) * PLAYER.dashSpeed;
    p.dashTime = PLAYER.dashTime;
    p.dashCd = p.dashCooldown;
    p.iframes = Math.max(p.iframes, PLAYER.dashTime + 0.08);
    emit(world, 'dash', { x: p.x, y: p.y });
  }

  if (p.dashTime > 0) {
    p.dashTime -= dt;
  } else {
    p.vx = damp(p.vx, ix * p.speed, PLAYER.responsiveness, dt);
    p.vy = damp(p.vy, iy * p.speed, PLAYER.responsiveness, dt);
  }

  p.x = clamp(p.x + p.vx * dt, p.r, WORLD.width - p.r);
  p.y = clamp(p.y + p.vy * dt, p.r, WORLD.height - p.r);
  p.iframes = Math.max(0, p.iframes - dt);
  if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  p.orbitAngle = (p.orbitAngle + ORBITAL.spin * dt) % TAU;
}

function hurtPlayer(world, dmg, fromX, fromY) {
  const p = world.player;
  if (p.iframes > 0) return false;
  p.hp -= dmg;
  p.iframes = PLAYER.iframes;
  const [nx, ny] = norm(p.x - fromX, p.y - fromY);
  p.vx += nx * 380;
  p.vy += ny * 380;
  world.hitStop = 0.05;
  emit(world, 'hurt', { x: p.x, y: p.y, dmg });
  return true;
}

// --- waves --------------------------------------------------------------------------------

function updateDirector(world, dt) {
  const d = world.director;
  if (!d.inWave) {
    d.breakTimer -= dt;
    if (d.breakTimer <= 0) {
      d.wave += 1;
      d.inWave = true;
      d.waveTime = 0;
      d.spawnTimer = 0;
      d.queue = composeWave(d.wave, world.rng);
      emit(world, 'wave', { wave: d.wave, boss: isBossWave(d.wave) });
    }
    return;
  }

  d.waveTime += dt;
  if (d.queue.length > 0) {
    d.spawnTimer -= dt;
    const pace = Math.min(2, 1 + d.wave * 0.05); // later waves trickle in faster
    while (d.spawnTimer <= 0 && d.queue.length > 0 && world.enemies.length < DIRECTOR.maxAlive) {
      spawnEnemy(world, d.queue.pop());
      d.spawnTimer += (DIRECTOR.spawnInterval * world.rng.range(0.4, 1.2)) / pace;
    }
    d.spawnTimer = Math.max(d.spawnTimer, -DIRECTOR.spawnInterval);
    return;
  }

  const bossAlive = world.enemies.some((e) => e.alive && e.type === 'boss');
  const cleared = world.enemies.length <= DIRECTOR.stragglers;
  if (!bossAlive && (cleared || d.waveTime > DIRECTOR.maxWaveTime)) {
    d.inWave = false;
    d.breakTimer = DIRECTOR.waveBreak;
    emit(world, 'waveClear', { wave: d.wave });
  }
}

function spawnPoint(world) {
  const p = world.player;
  const rng = world.rng;
  const [dMin, dMax] = DIRECTOR.spawnDistance;
  let best = null;
  let bestDist = -1;
  // Near a wall the ring around the player gets clipped; retry a few angles and keep the farthest.
  for (let i = 0; i < 8; i++) {
    const a = rng.range(0, TAU);
    const dist = rng.range(dMin, dMax);
    const x = clamp(p.x + Math.cos(a) * dist, 40, WORLD.width - 40);
    const y = clamp(p.y + Math.sin(a) * dist, 40, WORLD.height - 40);
    const actual = Math.hypot(x - p.x, y - p.y);
    if (actual >= dMin * 0.8) return { x, y };
    if (actual > bestDist) {
      bestDist = actual;
      best = { x, y };
    }
  }
  return best;
}

export function spawnEnemy(world, type, x, y) {
  const def = ENEMIES[type];
  const pos = x === undefined ? spawnPoint(world) : { x, y };
  const wave = Math.max(1, world.director.wave);
  let hp = def.hp * hpScale(wave);
  if (type === 'boss') hp *= 1 + 0.6 * (Math.floor(wave / DIRECTOR.bossEvery) - 1);
  const e = {
    id: world.nextId++,
    type,
    def,
    x: clamp(pos.x, def.radius, WORLD.width - def.radius),
    y: clamp(pos.y, def.radius, WORLD.height - def.radius),
    r: def.radius,
    hp,
    maxHp: hp,
    alive: true,
    mvx: 0, // steering velocity
    mvy: 0,
    kx: 0, // knockback velocity, decays on its own
    ky: 0,
    tx: 0, // desired velocity chosen by the AI this tick
    ty: 0,
    rate: 6,
    flash: 0,
    spawn: 0.45, // warp-in time: intangible and harmless until it reaches 0
    orbitCd: 0,
    state: 'chase',
    timer: world.rng.range(0.8, 2),
    summon: 4,
    dirX: 0,
    dirY: 0,
    _queryStamp: 0, // used by SpatialHash.query; declared up front to keep the object shape stable
  };
  world.enemies.push(e);
  return e;
}

// --- enemies ------------------------------------------------------------------------------

function setDesired(e, tx, ty, rate) {
  e.tx = tx;
  e.ty = ty;
  e.rate = rate;
}

function updateEnemies(world, dt) {
  const p = world.player;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.orbitCd = Math.max(0, e.orbitCd - dt);
    if (e.spawn > 0) {
      e.spawn -= dt;
      continue;
    }
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;

    switch (e.type) {
      case 'dasher':
        dasherAI(world, e, dt, ux, uy, dist);
        break;
      case 'gunner':
        gunnerAI(world, e, dt, ux, uy, dist);
        break;
      case 'boss':
        bossAI(world, e, dt, ux, uy);
        break;
      default:
        setDesired(e, ux * e.def.speed, uy * e.def.speed, 6);
    }

    e.mvx = damp(e.mvx, e.tx, e.rate, dt);
    e.mvy = damp(e.mvy, e.ty, e.rate, dt);
    e.kx = damp(e.kx, 0, 8, dt);
    e.ky = damp(e.ky, 0, 8, dt);
    e.x = clamp(e.x + (e.mvx + e.kx) * dt, e.r, WORLD.width - e.r);
    e.y = clamp(e.y + (e.mvy + e.ky) * dt, e.r, WORLD.height - e.r);
  }
}

// Telegraphed charge: approach, stop and aim (the renderer draws a warning line), lunge, recover.
function dasherAI(world, e, dt, ux, uy, dist) {
  e.timer -= dt;
  switch (e.state) {
    case 'chase':
      setDesired(e, ux * e.def.speed, uy * e.def.speed, 6);
      if (dist < 340 && e.timer <= 0) {
        e.state = 'windup';
        e.timer = 0.6;
      }
      break;
    case 'windup':
      setDesired(e, 0, 0, 10);
      e.dirX = ux;
      e.dirY = uy;
      if (e.timer <= 0) {
        e.state = 'dash';
        e.timer = 0.42;
        emit(world, 'enemyDash', { x: e.x, y: e.y });
      }
      break;
    case 'dash':
      setDesired(e, e.dirX * 640, e.dirY * 640, 30);
      if (e.timer <= 0) {
        e.state = 'recover';
        e.timer = 0.7;
      }
      break;
    default: // recover
      setDesired(e, 0, 0, 4);
      if (e.timer <= 0) {
        e.state = 'chase';
        e.timer = world.rng.range(0.6, 1.6);
      }
  }
}

// Keeps a ring distance from the player, strafes, and fires slow aimed shots.
function gunnerAI(world, e, dt, ux, uy, dist) {
  const s = e.def.speed;
  if (dist > 360) setDesired(e, ux * s, uy * s, 5);
  else if (dist < 250) setDesired(e, -ux * s, -uy * s, 5);
  else {
    const side = e.id % 2 ? 1 : -1;
    setDesired(e, -uy * s * 0.7 * side, ux * s * 0.7 * side, 3);
  }
  e.timer -= dt;
  if (e.timer <= 0 && dist < 520) {
    e.timer = world.rng.range(1.6, 2.4);
    fireEnemyBullet(world, e.x, e.y, Math.atan2(uy, ux), 270, e.def.damage);
    emit(world, 'enemyShoot', { x: e.x, y: e.y });
  }
}

// Boss: radial bullet bursts plus drone summons; faster and angrier below half HP.
function bossAI(world, e, dt, ux, uy) {
  const enraged = e.hp < e.maxHp * 0.5;
  const s = e.def.speed * (enraged ? 1.4 : 1);
  setDesired(e, ux * s, uy * s, 2);

  e.timer -= dt;
  if (e.timer <= 0) {
    const n = enraged ? 18 : 12;
    const phase = world.rng.range(0, TAU);
    for (let i = 0; i < n; i++) fireEnemyBullet(world, e.x, e.y, phase + (i / n) * TAU, enraged ? 230 : 200, 12);
    e.timer = enraged ? 1.8 : 2.6;
    emit(world, 'bossBurst', { x: e.x, y: e.y });
  }

  e.summon -= dt;
  if (e.summon <= 0) {
    e.summon = enraged ? 4 : 6;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      spawnEnemy(world, 'drone', e.x + Math.cos(a) * (e.r + 20), e.y + Math.sin(a) * (e.r + 20));
    }
  }
}

function fireEnemyBullet(world, x, y, angle, speed, dmg) {
  world.enemyBullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 6, dmg, life: 4, alive: true });
}

function rebuildHash(world) {
  world.hash.clear();
  for (const e of world.enemies) if (e.alive) world.hash.insert(e);
}

// Soft push-apart so the swarm spreads out instead of stacking into one blob. Heavier units win.
function separateEnemies(world) {
  const near = world.near;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    world.hash.query(e.x, e.y, e.r, near);
    for (const o of near) {
      if (o.id <= e.id || !o.alive) continue;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const min = e.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01;
      const overlap = (min - d) * 0.5;
      const nx = d2 > 0 ? dx / d : 1;
      const ny = d2 > 0 ? dy / d : 0;
      const total = e.def.mass + o.def.mass;
      e.x -= nx * overlap * (o.def.mass / total);
      e.y -= ny * overlap * (o.def.mass / total);
      o.x += nx * overlap * (e.def.mass / total);
      o.y += ny * overlap * (e.def.mass / total);
    }
  }
}

function damageEnemy(world, e, dmg, kx, ky, crit = false) {
  e.hp -= dmg;
  e.flash = 0.08;
  e.kx += kx;
  e.ky += ky;
  emit(world, 'hit', { x: e.x, y: e.y, dmg, crit });
  if (e.hp <= 0) killEnemy(world, e);
}

function killEnemy(world, e) {
  if (!e.alive) return;
  e.alive = false;
  world.kills += 1;
  const wave = Math.max(1, world.director.wave);
  world.score += Math.round(e.def.score * (1 + 0.1 * (wave - 1)));
  if (e.def.xp > 0) dropGems(world, e.x, e.y, e.def.xp);
  if (e.type === 'splitter') {
    for (let i = 0; i < 3; i++) {
      const a = world.rng.range(0, TAU);
      const m = spawnEnemy(world, 'mini', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10);
      m.spawn = 0;
      m.kx = Math.cos(a) * 220;
      m.ky = Math.sin(a) * 220;
    }
  }
  emit(world, 'kill', { x: e.x, y: e.y, r: e.r, color: e.def.color, enemy: e.type });
}

// --- player weapons -----------------------------------------------------------------------

function nearestEnemy(world, x, y, range) {
  let best = null;
  let bestD2 = range * range;
  for (const e of world.enemies) {
    if (!e.alive || e.spawn > 0) continue;
    const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = e;
    }
  }
  return best;
}

function updateWeapon(world, dt) {
  const p = world.player;
  const w = p.weapon;
  p.fireCd -= dt;
  if (p.fireCd > 0) return;
  const target = nearestEnemy(world, p.x, p.y, w.range);
  if (!target) {
    p.fireCd = 0; // stay ready, fire the moment something enters range
    return;
  }
  p.fireCd += 1 / w.fireRate;
  const aim = Math.atan2(target.y - p.y, target.x - p.x);
  p.aim = aim;
  for (let i = 0; i < w.projectiles; i++) {
    const a = aim + (i - (w.projectiles - 1) / 2) * w.spread;
    const crit = world.rng.chance(w.critChance);
    world.bullets.push({
      x: p.x + Math.cos(a) * (p.r + 4),
      y: p.y + Math.sin(a) * (p.r + 4),
      vx: Math.cos(a) * w.bulletSpeed,
      vy: Math.sin(a) * w.bulletSpeed,
      r: WEAPON.bulletRadius,
      dmg: w.damage * (crit ? w.critMult : 1),
      crit,
      pierce: w.pierce,
      hits: null,
      life: (w.range / w.bulletSpeed) * 1.25,
      alive: true,
    });
  }
  emit(world, 'shoot', { x: p.x, y: p.y, angle: aim });
}

function updateBullets(world, dt) {
  const near = world.near;
  for (const b of world.bullets) {
    const x0 = b.x;
    const y0 = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height) {
      b.alive = false;
      continue;
    }
    // Swept test along this tick's path so fast bullets can't skip over small enemies.
    const half = Math.hypot(b.x - x0, b.y - y0) / 2;
    world.hash.query((x0 + b.x) / 2, (y0 + b.y) / 2, half + b.r, near);
    for (const e of near) {
      if (!e.alive || e.spawn > 0) continue;
      if (b.hits && b.hits.includes(e.id)) continue;
      if (!segmentHitsCircle(x0, y0, b.x, b.y, e.x, e.y, e.r + b.r)) continue;
      const [nx, ny] = norm(b.vx, b.vy);
      const push = 140 / e.def.mass;
      damageEnemy(world, e, b.dmg, nx * push, ny * push, b.crit);
      if (b.pierce > 0) {
        b.pierce -= 1;
        (b.hits ??= []).push(e.id);
      } else {
        b.alive = false;
        break;
      }
    }
  }
}

function updateOrbitals(world) {
  const p = world.player;
  const n = p.orbitals;
  if (n === 0) return;
  const near = world.near;
  const dmg = ORBITAL.damage * (p.weapon.damage / WEAPON.damage); // scales with damage upgrades
  for (let i = 0; i < n; i++) {
    const a = p.orbitAngle + (i / n) * TAU;
    const ox = p.x + Math.cos(a) * ORBITAL.radius;
    const oy = p.y + Math.sin(a) * ORBITAL.radius;
    world.hash.query(ox, oy, ORBITAL.size, near);
    for (const e of near) {
      if (!e.alive || e.spawn > 0 || e.orbitCd > 0) continue;
      const rr = e.r + ORBITAL.size;
      if ((e.x - ox) ** 2 + (e.y - oy) ** 2 > rr * rr) continue;
      e.orbitCd = ORBITAL.hitCooldown;
      const push = 200 / e.def.mass;
      damageEnemy(world, e, dmg, Math.cos(a) * push, Math.sin(a) * push);
    }
  }
}

// --- damage to the player -----------------------------------------------------------------

function updateEnemyBullets(world, dt) {
  const p = world.player;
  for (const b of world.enemyBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height) {
      b.alive = false;
      continue;
    }
    const rr = p.r + b.r - 3; // slightly forgiving hitbox feels fairer
    if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < rr * rr && hurtPlayer(world, b.dmg, b.x, b.y)) b.alive = false;
  }
}

function updateContacts(world) {
  const p = world.player;
  const near = world.near;
  world.hash.query(p.x, p.y, p.r, near);
  for (const e of near) {
    if (!e.alive || e.spawn > 0) continue;
    const rr = e.r + p.r - 2;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    if (dx * dx + dy * dy > rr * rr) continue;
    if (hurtPlayer(world, e.def.damage, e.x, e.y)) {
      const [nx, ny] = norm(dx, dy);
      e.kx -= (nx * 260) / e.def.mass;
      e.ky -= (ny * 260) / e.def.mass;
    }
  }
}

// --- XP -----------------------------------------------------------------------------------

function dropGems(world, x, y, xp) {
  const pieces = xp >= 10 ? Math.ceil(xp / 5) : 1;
  for (let i = 0; i < pieces; i++) {
    const a = world.rng.range(0, TAU);
    const s = pieces > 1 ? world.rng.range(60, 220) : 0;
    const value = xp / pieces;
    world.gems.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, value, r: 5 + Math.min(4, value), homing: false, alive: true });
  }
  // Cap the number of gems on the floor: the oldest one is merged into the newest.
  if (world.gems.length > 300) {
    const oldest = world.gems.shift();
    world.gems[world.gems.length - 1].value += oldest.value;
  }
}

function updateGems(world, dt) {
  const p = world.player;
  for (const g of world.gems) {
    if (!g.alive) continue;
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < p.r + g.r + 4) {
      collectGem(world, g);
      continue;
    }
    if (!g.homing && d < p.magnet) g.homing = true;
    if (g.homing) {
      const s = Math.min(950, Math.max(260, Math.hypot(g.vx, g.vy) + 1500 * dt));
      g.vx = (dx / d) * s;
      g.vy = (dy / d) * s;
    } else {
      g.vx = damp(g.vx, 0, 5, dt);
      g.vy = damp(g.vy, 0, 5, dt);
    }
    g.x = clamp(g.x + g.vx * dt, 0, WORLD.width);
    g.y = clamp(g.y + g.vy * dt, 0, WORLD.height);
  }
}

function collectGem(world, g) {
  g.alive = false;
  const p = world.player;
  p.xp += g.value;
  emit(world, 'pickup', { x: g.x, y: g.y });
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level += 1;
    p.xpNext = xpToNext(p.level);
    world.pendingLevelUps += 1;
  }
}

function compact(list) {
  let j = 0;
  for (let i = 0; i < list.length; i++) if (list[i].alive) list[j++] = list[i];
  list.length = j;
}
