// Keyboard + floating virtual joystick (touch, pen or mouse drag).
// Aiming is automatic, so a single stick is enough on mobile; a second finger or the DASH button dashes.
const DASH_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight']);
const SCROLL_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput(target, { dashButton } = {}) {
  const keys = new Set();
  let dashQueued = false;
  const stick = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0, radius: 56 };

  function release() {
    stick.active = false;
    stick.id = -1;
    stick.dx = 0;
    stick.dy = 0;
  }

  window.addEventListener('keydown', (e) => {
    if (SCROLL_KEYS.has(e.code)) e.preventDefault();
    if (DASH_KEYS.has(e.code) && !e.repeat) dashQueued = true;
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    release();
  });

  target.addEventListener('pointerdown', (e) => {
    if (stick.active) {
      dashQueued = true;
      return;
    }
    stick.active = true;
    stick.id = e.pointerId;
    stick.ox = e.clientX;
    stick.oy = e.clientY;
    stick.dx = 0;
    stick.dy = 0;
    target.setPointerCapture?.(e.pointerId);
  });

  target.addEventListener('pointermove', (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox;
    let dy = e.clientY - stick.oy;
    const l = Math.hypot(dx, dy);
    if (l > stick.radius) {
      // Drag the base along with the finger so the stick never "runs out" of travel.
      stick.ox += dx * (1 - stick.radius / l);
      stick.oy += dy * (1 - stick.radius / l);
      dx = e.clientX - stick.ox;
      dy = e.clientY - stick.oy;
    }
    stick.dx = dx;
    stick.dy = dy;
  });

  const end = (e) => {
    if (e.pointerId === stick.id) release();
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);

  dashButton?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dashQueued = true;
  });

  return {
    stick,
    // Called once per simulation tick. The dash press is consumed by the first tick that reads it.
    read() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (stick.active) {
        const dead = 8;
        const l = Math.hypot(stick.dx, stick.dy);
        if (l > dead) {
          const m = Math.min(1, (l - dead) / (stick.radius - dead));
          x += (stick.dx / l) * m;
          y += (stick.dy / l) * m;
        }
      }
      const dash = dashQueued;
      dashQueued = false;
      return { x, y, dash };
    },
    reset() {
      keys.clear();
      release();
      dashQueued = false;
    },
  };
}
