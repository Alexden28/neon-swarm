import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createAudio } from './engine/audio.js';
import { createWorld, step as stepWorld, chooseUpgrade } from './game/world.js';
import { autopilot } from './game/autopilot.js';
import { createRenderer } from './game/render.js';
import { createUI } from './game/ui.js';
import { loadBest, saveBest } from './game/storage.js';

// Wiring: owns the app mode (title / play / paused / levelup / over) and routes simulation
// events to the renderer, the audio layer and the DOM overlays.

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas, { dashButton: document.getElementById('btn-dash') });

const SOUND_FOR = {
  shoot: 'shoot',
  hit: 'hit',
  pickup: 'pickup',
  hurt: 'hurt',
  dash: 'dash',
  levelup: 'levelup',
  upgrade: 'select',
  enemyShoot: 'enemyShoot',
  bossBurst: 'burst',
  gameover: 'gameover',
};

let mode = 'title';
let world = null;
let best = loadBest();
let showcaseHud = false;

const ui = createUI({
  onPlay: startGame,
  onResume: resume,
  onQuit: toTitle,
  onPause: pause,
  onMute: () => ui.setMuted(audio.toggleMute()),
});
ui.setBest(best);

function newSeed() {
  return params.has('seed') ? Number(params.get('seed')) >>> 0 : (Math.random() * 2 ** 32) >>> 0;
}

function setWorld(next) {
  world = next;
  renderer.reset(world);
}

function startGame() {
  audio.unlock();
  setWorld(createWorld({ seed: newSeed() }));
  input.reset();
  mode = 'play';
  ui.show(null);
}

function toTitle() {
  setWorld(createWorld({ seed: newSeed() })); // the title screen runs a bot-played demo behind the menu
  mode = 'title';
  ui.show('title');
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  ui.show('pause');
}

function resume() {
  if (mode !== 'paused') return;
  input.reset();
  mode = 'play';
  ui.show(null);
}

function pickUpgrade(index) {
  if (mode !== 'levelup') return;
  chooseUpgrade(world, index);
  flushEvents();
  if (world.state === 'playing') {
    input.reset();
    mode = 'play';
    ui.show(null);
  }
}

function gameOver() {
  mode = 'over';
  const isBest = world.score > best;
  if (isBest) {
    best = world.score;
    saveBest(best);
    ui.setBest(best);
  }
  const stats = {
    score: world.score,
    wave: world.director.wave,
    time: world.time,
    kills: world.kills,
    level: world.player.level,
    isBest,
    best,
  };
  setTimeout(() => {
    if (mode === 'over') ui.showGameOver(stats);
  }, 900); // let the explosion play before the menu covers it
}

function flushEvents() {
  const demo = mode === 'title';
  for (const ev of world.events) {
    renderer.handleEvent(ev);
    if (demo) continue;
    if (ev.type === 'kill') audio.play(ev.enemy === 'boss' ? 'bossKill' : 'kill');
    else if (ev.type === 'wave') audio.play(ev.boss ? 'boss' : 'wave');
    else if (SOUND_FOR[ev.type]) audio.play(SOUND_FOR[ev.type]);

    if (ev.type === 'levelup') {
      mode = 'levelup';
      ui.showLevelUp(world, pickUpgrade);
    } else if (ev.type === 'gameover') {
      gameOver();
    }
  }
  world.events.length = 0;
}

function stepDemo(dt) {
  stepWorld(world, dt, autopilot(world));
  if (world.state === 'levelup') chooseUpgrade(world, 0);
  if (world.state === 'dead') setWorld(createWorld({ seed: newSeed() }));
}

const loop = createLoop({
  step(dt) {
    if (mode === 'title') {
      stepDemo(dt);
      flushEvents();
    } else if (mode === 'play' || mode === 'over') {
      stepWorld(world, dt, mode === 'play' ? input.read() : undefined);
      flushEvents();
    }
  },
  render(_alpha, frameDt) {
    renderer.draw(world, frameDt, {
      hud: mode !== 'title' || showcaseHud,
      stick: mode === 'play' ? input.stick : null,
      frozen: mode === 'paused' || mode === 'levelup',
    });
  },
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
  } else if (e.code === 'KeyM') {
    ui.setMuted(audio.toggleMute());
  } else if (mode === 'levelup' && /^Digit[1-3]$/.test(e.code)) {
    pickUpgrade(Number(e.code.slice(5)) - 1);
  } else if ((mode === 'title' || mode === 'over') && e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
    startGame();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

toTitle();

// `?shot` = screenshot mode used to generate the README images: fast-forwards the bot-played
// demo by `t` seconds and hides the menu (`&hud` also draws the in-game HUD).
if (params.has('shot')) {
  const seconds = Number(params.get('t') || 45);
  for (let i = 0; i < seconds * 60; i++) {
    stepDemo(1 / 60);
    world.events.length = 0;
  }
  showcaseHud = params.has('hud');
  ui.show('title');
  document.getElementById('screen-title').classList.add('hidden');
}

loop.start();
