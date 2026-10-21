import { TAU } from '../engine/math.js';

// Cosmetic particle system stored as a struct of typed arrays: no per-particle objects,
// so thousands of sparks don't create garbage. Dead particles are swap-removed.
export function createParticles(max = 2000) {
  const x = new Float32Array(max);
  const y = new Float32Array(max);
  const vx = new Float32Array(max);
  const vy = new Float32Array(max);
  const life = new Float32Array(max);
  const maxLife = new Float32Array(max);
  const size = new Float32Array(max);
  const color = new Array(max);
  let count = 0;

  function spawn(px, py, pvx, pvy, l, s, c) {
    if (count >= max) return;
    const i = count++;
    x[i] = px;
    y[i] = py;
    vx[i] = pvx;
    vy[i] = pvy;
    life[i] = l;
    maxLife[i] = l;
    size[i] = s;
    color[i] = c;
  }

  return {
    spawn,
    burst(px, py, n, c, speed, l = 0.5, s = 2.5) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU;
        const sp = speed * (0.25 + Math.random() * 0.75);
        spawn(px, py, Math.cos(a) * sp, Math.sin(a) * sp, l * (0.6 + Math.random() * 0.6), s * (0.6 + Math.random() * 0.8), c);
      }
    },
    ring(px, py, n, c, speed, l = 0.5, s = 2.5) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        spawn(px, py, Math.cos(a) * speed, Math.sin(a) * speed, l, s, c);
      }
    },
    update(dt) {
      const drag = Math.exp(-3 * dt);
      for (let i = 0; i < count; ) {
        life[i] -= dt;
        if (life[i] <= 0) {
          count--;
          x[i] = x[count];
          y[i] = y[count];
          vx[i] = vx[count];
          vy[i] = vy[count];
          life[i] = life[count];
          maxLife[i] = maxLife[count];
          size[i] = size[count];
          color[i] = color[count];
          continue;
        }
        x[i] += vx[i] * dt;
        y[i] += vy[i] * dt;
        vx[i] *= drag;
        vy[i] *= drag;
        i++;
      }
    },
    draw(ctx) {
      for (let i = 0; i < count; i++) {
        const t = life[i] / maxLife[i];
        const s = size[i] * (0.4 + 0.6 * t);
        ctx.globalAlpha = t;
        ctx.fillStyle = color[i];
        ctx.fillRect(x[i] - s / 2, y[i] - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    },
    clear() {
      count = 0;
    },
    get count() {
      return count;
    },
  };
}
