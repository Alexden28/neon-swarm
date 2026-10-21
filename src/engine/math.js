export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

// Frame-rate independent exponential smoothing: moves `a` toward `b` at `rate` per second.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export function norm(x, y) {
  const l = Math.hypot(x, y);
  return l > 1e-9 ? [x / l, y / l] : [0, 0];
}

// True if the segment (x0,y0)-(x1,y1) passes within `r` of (cx,cy).
// Used for bullets so fast projectiles can't tunnel through small enemies.
export function segmentHitsCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((cx - x0) * dx + (cy - y0) * dy) / l2, 0, 1) : 0;
  const qx = x0 + dx * t - cx;
  const qy = y0 + dy * t - cy;
  return qx * qx + qy * qy <= r * r;
}
