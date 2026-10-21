import { WORLD } from './config.js';

// A small steering bot: dodges enemies and bullets, collects XP, stays away from walls.
// It plays the title-screen demo and drives the headless balance tests.
export function autopilot(world) {
  const p = world.player;
  let fx = 0;
  let fy = 0;

  for (const e of world.enemies) {
    if (!e.alive) continue;
    const range = 240 + e.r * 2;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range * range) continue;
    const d = Math.sqrt(d2) || 1;
    const w = (range - d) / range;
    const k = w * w * 3 * (e.type === 'boss' ? 2 : 1);
    fx += (dx / d) * k;
    fy += (dy / d) * k;
  }

  for (const b of world.enemyBullets) {
    const range = 130;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range * range) continue;
    const d = Math.sqrt(d2) || 1;
    const w = (range - d) / range;
    fx += (dx / d) * w * w * 2.5;
    fy += (dy / d) * w * w * 2.5;
  }

  let gem = null;
  let gemD2 = Infinity;
  for (const g of world.gems) {
    const d2 = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
    if (d2 < gemD2) {
      gemD2 = d2;
      gem = g;
    }
  }
  if (gem) {
    const d = Math.sqrt(gemD2) || 1;
    fx += ((gem.x - p.x) / d) * 0.6;
    fy += ((gem.y - p.y) / d) * 0.6;
  }

  const margin = 240;
  if (p.x < margin) fx += ((margin - p.x) / margin) * 2;
  if (p.x > WORLD.width - margin) fx -= ((p.x - (WORLD.width - margin)) / margin) * 2;
  if (p.y < margin) fy += ((margin - p.y) / margin) * 2;
  if (p.y > WORLD.height - margin) fy -= ((p.y - (WORLD.height - margin)) / margin) * 2;
  fx += (WORLD.width / 2 - p.x) * 0.0004;
  fy += (WORLD.height / 2 - p.y) * 0.0004;

  const l = Math.hypot(fx, fy);
  const danger = world.enemies.some(
    (e) => e.alive && e.spawn <= 0 && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 < (e.r + p.r + 28) ** 2,
  );
  return { x: l > 0.05 ? fx / l : 0, y: l > 0.05 ? fy / l : 0, dash: danger && p.dashCd <= 0 };
}
