// Gameplay tuning. Every balance number lives here so the game can be rebalanced
// without touching logic (the simulation tests in /tests guard against regressions).

export const WORLD = {
  width: 2400,
  height: 2400,
  viewSize: 820, // logical units visible across the shorter side of the screen
};

export const PLAYER = {
  radius: 14,
  maxHp: 100,
  speed: 270,
  responsiveness: 14, // velocity smoothing rate (1/s): higher = snappier
  iframes: 0.7,
  dashSpeed: 920,
  dashTime: 0.14,
  dashCooldown: 1.5,
  magnet: 95,
};

export const WEAPON = {
  fireRate: 3.5, // shots per second
  damage: 12,
  bulletSpeed: 720,
  bulletRadius: 4,
  range: 520,
  projectiles: 1,
  spread: 0.14, // radians between parallel projectiles
  pierce: 0,
  critChance: 0.05,
  critMult: 2,
};

export const ORBITAL = { radius: 72, size: 9, damage: 9, spin: 3.2, hitCooldown: 0.35 };

// cost/weight drive wave composition; `unlock` is the first wave a type can appear in.
export const ENEMIES = {
  drone: { hp: 20, speed: 125, radius: 11, damage: 10, xp: 1, score: 10, cost: 1, weight: 6, unlock: 1, mass: 1, color: '#ff3df2' },
  dasher: { hp: 28, speed: 95, radius: 13, damage: 14, xp: 2, score: 25, cost: 2, weight: 3, unlock: 2, mass: 1, color: '#ffb000' },
  gunner: { hp: 34, speed: 100, radius: 13, damage: 10, xp: 3, score: 30, cost: 3, weight: 2, unlock: 3, mass: 1, color: '#7cff4f' },
  splitter: { hp: 52, speed: 82, radius: 18, damage: 12, xp: 3, score: 35, cost: 3, weight: 2, unlock: 4, mass: 2, color: '#ff5470' },
  brute: { hp: 180, speed: 60, radius: 26, damage: 22, xp: 8, score: 80, cost: 6, weight: 1, unlock: 6, mass: 5, color: '#b26bff' },
  mini: { hp: 9, speed: 155, radius: 7, damage: 6, xp: 0, score: 5, cost: 0, weight: 0, unlock: Infinity, mass: 0.5, color: '#ff8fa3' },
  boss: { hp: 1000, speed: 52, radius: 54, damage: 30, xp: 40, score: 1000, cost: 0, weight: 0, unlock: Infinity, mass: 30, color: '#ff2a6d' },
};

export const DIRECTOR = {
  firstWaveDelay: 1.2,
  waveBreak: 2.5,
  baseBudget: 8,
  budgetPerWave: 6,
  hpScalePerWave: 0.09,
  bossEvery: 5,
  spawnInterval: 0.32,
  maxAlive: 150,
  stragglers: 2, // a wave counts as cleared when this many enemies or fewer remain
  maxWaveTime: 50, // seconds before the next wave starts anyway
  spawnDistance: [620, 760], // just outside the visible area
};

export function xpToNext(level) {
  return Math.floor(5 + 3 * (level - 1) + Math.pow(level, 1.4));
}
