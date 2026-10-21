// Fixed-timestep simulation with variable-rate rendering ("Fix Your Timestep", G. Fiedler).
// Gameplay always advances in identical `dt` slices, so it behaves the same at 30, 60 or 144 Hz.
export function createLoop({
  step,
  render,
  dt = 1 / 60,
  maxFrame = 0.25, // avoids the "spiral of death" after a tab switch or a long GC pause
  now = () => performance.now() / 1000,
  raf = (cb) => requestAnimationFrame(cb),
}) {
  let acc = 0;
  let last = 0;
  let running = false;

  function frame() {
    if (!running) return;
    const t = now();
    const frameTime = Math.min(t - last, maxFrame);
    last = t;
    acc += frameTime;
    while (acc >= dt) {
      step(dt);
      acc -= dt;
    }
    render(acc / dt, frameTime);
    raf(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      acc = 0;
      last = now();
      raf(frame);
    },
    stop() {
      running = false;
    },
    get running() {
      return running;
    },
  };
}
