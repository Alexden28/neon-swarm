import { DIRECTOR, ENEMIES } from './config.js';

// Wave composition: every wave gets a point budget that is spent on the enemy types unlocked so far.
// Pure functions, so difficulty can be unit-tested without running the game.

export const waveBudget = (wave) => DIRECTOR.baseBudget + DIRECTOR.budgetPerWave * (wave - 1);

export const isBossWave = (wave) => wave % DIRECTOR.bossEvery === 0;

export const hpScale = (wave) => 1 + DIRECTOR.hpScalePerWave * (wave - 1);

// Returns a spawn queue, consumed from the end with pop().
export function composeWave(wave, rng) {
  const pool = Object.entries(ENEMIES).filter(([, def]) => def.cost > 0 && def.unlock <= wave);
  const queue = [];
  let left = waveBudget(wave);
  while (left > 0) {
    const affordable = pool.filter(([, def]) => def.cost <= left);
    if (affordable.length === 0) break;
    const [type, def] = affordable[rng.weightedIndex(affordable.map(([, d]) => d.weight))];
    queue.push(type);
    left -= def.cost;
  }
  if (isBossWave(wave)) queue.push('boss'); // last in the array = first to spawn
  return queue;
}
