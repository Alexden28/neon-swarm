// Seeded PRNG (mulberry32). All gameplay randomness goes through this so a run is fully
// reproducible from its seed — which is what makes the headless simulation tests possible.
export function createRng(seed = 1) {
  let s = seed >>> 0;

  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    // Inclusive on both ends.
    int: (min, max) => min + Math.floor((max - min + 1) * next()),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    weightedIndex(weights) {
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r < 0) return i;
      }
      // Floating point fallback: last entry with a positive weight.
      for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i;
      return -1;
    },
    get state() {
      return s;
    },
  };
}
