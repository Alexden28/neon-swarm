// Best score persistence. localStorage can throw (private mode, blocked storage), so it is optional.
const KEY = 'neon-swarm.best';

export function loadBest() {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(score) {
  try {
    localStorage.setItem(KEY, String(score));
  } catch {
    // Storage unavailable: the best score just won't survive a reload.
  }
}
