// Roguelite upgrade pool. Each entry mutates the player's stats; `max` caps how often it stacks
// and `weight` controls how often it is offered.
export const UPGRADES = [
  { id: 'rapid', name: 'Rapid Fire', desc: '+20% fire rate', max: 6, weight: 3, apply: (p) => { p.weapon.fireRate *= 1.2; } },
  { id: 'heavy', name: 'Heavy Rounds', desc: '+25% damage', max: 6, weight: 3, apply: (p) => { p.weapon.damage *= 1.25; } },
  { id: 'multi', name: 'Split Shot', desc: '+1 projectile per shot', max: 4, weight: 2, apply: (p) => { p.weapon.projectiles += 1; } },
  { id: 'pierce', name: 'Railgun Core', desc: 'Bullets pierce +1 enemy', max: 3, weight: 2, apply: (p) => { p.weapon.pierce += 1; } },
  {
    id: 'velocity', name: 'Accelerator', desc: '+20% bullet speed, +15% range', max: 3, weight: 2,
    apply: (p) => { p.weapon.bulletSpeed *= 1.2; p.weapon.range *= 1.15; },
  },
  { id: 'crit', name: 'Targeting AI', desc: '+8% critical hit chance', max: 4, weight: 2, apply: (p) => { p.weapon.critChance += 0.08; } },
  { id: 'thrust', name: 'Thrusters', desc: '+10% move speed', max: 4, weight: 2, apply: (p) => { p.speed *= 1.1; } },
  {
    id: 'plating', name: 'Hull Plating', desc: '+20 max HP and repair 20', max: 5, weight: 2,
    apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); },
  },
  { id: 'regen', name: 'Nanobots', desc: 'Regenerate 1 HP per second', max: 3, weight: 1, apply: (p) => { p.regen += 1; } },
  { id: 'magnet', name: 'Tractor Beam', desc: '+40% XP pickup radius', max: 3, weight: 1, apply: (p) => { p.magnet *= 1.4; } },
  { id: 'orbital', name: 'Orbital Blade', desc: '+1 blade circling your ship', max: 3, weight: 2, apply: (p) => { p.orbitals += 1; } },
  { id: 'dash', name: 'Blink Drive', desc: '-20% dash cooldown', max: 3, weight: 1, apply: (p) => { p.dashCooldown *= 0.8; } },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function availableUpgrades(stacks) {
  return UPGRADES.filter((u) => (stacks[u.id] ?? 0) < u.max);
}

// Up to `count` distinct upgrade ids, weighted, never offering a maxed-out one.
export function rollUpgrades(rng, stacks, count = 3) {
  const pool = availableUpgrades(stacks);
  const picks = [];
  while (picks.length < count && pool.length > 0) {
    const i = rng.weightedIndex(pool.map((u) => u.weight));
    picks.push(pool[i].id);
    pool.splice(i, 1);
  }
  return picks;
}

export function applyUpgrade(player, id) {
  const upgrade = UPGRADE_BY_ID[id];
  if (!upgrade) throw new Error(`Unknown upgrade: ${id}`);
  const level = player.stacks[id] ?? 0;
  if (level >= upgrade.max) return false;
  player.stacks[id] = level + 1;
  upgrade.apply(player);
  return true;
}
