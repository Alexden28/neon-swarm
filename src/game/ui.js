import { UPGRADE_BY_ID } from './upgrades.js';

// DOM overlays (menus, level-up cards). The canvas draws the in-game HUD; HTML handles anything
// that needs real buttons, focus and accessibility.
export function createUI(handlers) {
  const $ = (id) => document.getElementById(id);
  const screens = {
    title: $('screen-title'),
    pause: $('screen-pause'),
    levelup: $('screen-levelup'),
    over: $('screen-over'),
  };
  const cards = $('cards');
  let cardsArmedAt = 0;

  $('btn-play').addEventListener('click', handlers.onPlay);
  $('btn-resume').addEventListener('click', handlers.onResume);
  $('btn-restart').addEventListener('click', handlers.onPlay);
  $('btn-quit').addEventListener('click', handlers.onQuit);
  $('btn-again').addEventListener('click', handlers.onPlay);
  $('btn-menu').addEventListener('click', handlers.onQuit);
  $('btn-pause').addEventListener('click', handlers.onPause);
  $('btn-mute').addEventListener('click', handlers.onMute);

  function show(name) {
    for (const [key, el] of Object.entries(screens)) el.classList.toggle('hidden', key !== name);
    document.body.dataset.mode = name ?? 'play';
    if (document.activeElement instanceof HTMLElement && !name) document.activeElement.blur();
  }

  function showLevelUp(world, onPick) {
    cards.replaceChildren();
    world.choices.forEach((id, i) => {
      const upgrade = UPGRADE_BY_ID[id];
      const next = (world.player.stacks[id] ?? 0) + 1;
      const card = document.createElement('button');
      card.className = 'card';
      card.innerHTML = `<span class="key">${i + 1}</span><strong>${upgrade.name}</strong><span class="desc">${upgrade.desc}</span><em>Lv ${next} / ${upgrade.max}</em>`;
      card.addEventListener('click', () => {
        // Ignore taps that land in the first instants: the player was probably still steering.
        if (performance.now() - cardsArmedAt > 300) onPick(i);
      });
      cards.append(card);
    });
    $('levelup-title').textContent = `Level ${world.player.level}`;
    cardsArmedAt = performance.now();
    show('levelup');
  }

  function showGameOver({ score, wave, time, kills, level, isBest, best }) {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60).toString().padStart(2, '0');
    $('over-score').textContent = score.toLocaleString('en-US');
    $('over-stats').textContent = `Wave ${wave} · ${mins}:${secs} survived · ${kills} kills · level ${level}`;
    $('over-best').textContent = isBest ? 'New best score!' : `Best: ${best.toLocaleString('en-US')}`;
    $('over-best').classList.toggle('highlight', isBest);
    show('over');
    $('btn-again').focus();
  }

  return {
    show,
    showLevelUp,
    showGameOver,
    setBest(score) {
      $('best-score').textContent = score.toLocaleString('en-US');
    },
    setMuted(muted) {
      $('btn-mute').classList.toggle('muted', muted);
      $('btn-mute').setAttribute('aria-pressed', String(muted));
    },
  };
}
