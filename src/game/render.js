import { WORLD, ORBITAL, PLAYER } from './config.js';
import { TAU, clamp, damp } from '../engine/math.js';
import { createParticles } from './particles.js';

const COLORS = {
  void: '#020208',
  floor: '#070a18',
  grid: 'rgba(90, 100, 255, 0.10)',
  wall: '#3d4cff',
  player: '#3df2ff',
  bullet: '#e8fdff',
  crit: '#ffe14d',
  enemyBullet: '#ff8a3d',
  gem: '#4dffb8',
  hp: '#ff3d6e',
  xp: '#4dffb8',
  text: '#e6e9ff',
  dim: 'rgba(230, 233, 255, 0.55)',
};

const FONT = 'ui-monospace, "Cascadia Mono", "SFMono-Regular", Menlo, Consolas, monospace';

// Canvas 2D renderer. Owns everything purely visual (camera, screen shake, particles,
// banners) and reacts to simulation events — the world never knows it exists.
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const particles = createParticles(2500);
  const floaters = [];
  const cam = { x: WORLD.width / 2, y: WORLD.height / 2, scale: 1, trauma: 0, hurt: 0 };
  let banner = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let clock = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const short = Math.min(width, height);
    cam.scale = short / (WORLD.viewSize * (short < 600 ? 0.75 : 1)); // zoom in a bit on phones
  }
  window.addEventListener('resize', resize);
  resize();

  const addTrauma = (t) => {
    cam.trauma = Math.min(1, cam.trauma + t);
  };

  function reset(world) {
    particles.clear();
    floaters.length = 0;
    banner = null;
    cam.x = world.player.x;
    cam.y = world.player.y;
    cam.trauma = 0;
    cam.hurt = 0;
  }

  function handleEvent(ev) {
    switch (ev.type) {
      case 'hit':
        particles.burst(ev.x, ev.y, 3, '#ffffff', 160, 0.18, 2);
        if (ev.crit) floaters.push({ x: ev.x, y: ev.y - 10, text: `${Math.round(ev.dmg)}!`, t: 0.7, color: COLORS.crit });
        break;
      case 'kill':
        particles.burst(ev.x, ev.y, 10 + ev.r, ev.color, 120 + ev.r * 8, 0.6, 3);
        particles.burst(ev.x, ev.y, 6, '#ffffff', 90, 0.3, 2);
        if (ev.enemy === 'boss') {
          particles.ring(ev.x, ev.y, 64, ev.color, 420, 1.2, 5);
          particles.burst(ev.x, ev.y, 160, ev.color, 600, 1.4, 5);
          addTrauma(1);
          banner = { text: 'HIVE DESTROYED', sub: '+1000', t: 2.2, color: COLORS.crit };
        } else {
          addTrauma(ev.r > 20 ? 0.25 : 0.06);
        }
        break;
      case 'hurt':
        addTrauma(0.5);
        cam.hurt = 0.35;
        particles.burst(ev.x, ev.y, 24, COLORS.hp, 260, 0.5, 3);
        break;
      case 'pickup':
        particles.burst(ev.x, ev.y, 3, COLORS.gem, 90, 0.25, 2);
        break;
      case 'dash':
        particles.ring(ev.x, ev.y, 16, COLORS.player, 160, 0.3, 2);
        break;
      case 'levelup':
        particles.ring(ev.x, ev.y, 48, COLORS.xp, 340, 0.7, 3);
        break;
      case 'wave':
        banner = ev.boss
          ? { text: 'WARNING', sub: 'HIVE MOTHER INBOUND', t: 2.6, color: COLORS.hp }
          : { text: `WAVE ${ev.wave}`, sub: '', t: 1.8, color: COLORS.text };
        if (ev.boss) addTrauma(0.4);
        break;
      case 'bossBurst':
        addTrauma(0.15);
        break;
      case 'gameover':
        particles.burst(ev.x, ev.y, 140, COLORS.player, 520, 1.3, 4);
        particles.ring(ev.x, ev.y, 48, '#ffffff', 300, 0.9, 3);
        addTrauma(1);
        break;
      default:
    }
  }

  function draw(world, frameDt, { hud = true, stick = null, frozen = false } = {}) {
    const dt = frozen ? 0 : frameDt;
    clock += dt;
    const p = world.player;

    cam.x = damp(cam.x, p.x, 7, dt);
    cam.y = damp(cam.y, p.y, 7, dt);
    cam.trauma = Math.max(0, cam.trauma - dt * 1.5);
    cam.hurt = Math.max(0, cam.hurt - dt);
    const shake = cam.trauma * cam.trauma * 16; // squared trauma: small hits barely shake, big ones rattle
    const sx = frozen ? 0 : (Math.random() * 2 - 1) * shake;
    const sy = frozen ? 0 : (Math.random() * 2 - 1) * shake;

    if (p.dashTime > 0 && !frozen) {
      for (let i = 0; i < 3; i++) particles.spawn(p.x, p.y, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0.3, 4, COLORS.player);
    }
    particles.update(dt);
    for (const f of floaters) {
      f.t -= dt;
      f.y -= 30 * dt;
    }
    for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t <= 0) floaters.splice(i, 1);

    // --- world space ---
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = COLORS.void;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const s = cam.scale * dpr;
    const camX = cam.x + sx;
    const camY = cam.y + sy;
    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - camX * s, canvas.height / 2 - camY * s);
    const halfW = canvas.width / 2 / s;
    const halfH = canvas.height / 2 / s;
    const view = { x0: camX - halfW - 60, y0: camY - halfH - 60, x1: camX + halfW + 60, y1: camY + halfH + 60 };
    const visible = (o) => o.x > view.x0 && o.x < view.x1 && o.y > view.y0 && o.y < view.y1;

    drawFloor(view);

    ctx.globalCompositeOperation = 'lighter'; // additive blending = cheap neon glow
    for (const g of world.gems) if (visible(g)) drawGem(g);
    for (const e of world.enemies) if (e.alive && visible(e)) drawEnemy(e, p);
    for (const b of world.enemyBullets) if (visible(b)) drawEnemyBullet(b);
    for (const b of world.bullets) if (visible(b)) drawBullet(b);
    drawOrbitals(p);
    if (world.state !== 'dead') drawPlayer(p, frozen);
    particles.draw(ctx);
    ctx.globalCompositeOperation = 'source-over';

    ctx.textAlign = 'center';
    ctx.font = `700 14px ${FONT}`;
    for (const f of floaters) {
      ctx.globalAlpha = clamp(f.t / 0.7, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // --- screen space ---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cam.hurt > 0) drawHurtVignette(cam.hurt / 0.35);
    if (hud) drawHud(world);
    if (banner) {
      banner.t -= dt;
      if (banner.t <= 0) banner = null;
      else drawBanner(banner);
    }
    if (stick?.active) drawStick(stick);
  }

  // --- world-space pieces ---

  function drawFloor(view) {
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    const step = 100;
    const x0 = Math.max(0, Math.floor(view.x0 / step) * step);
    const x1 = Math.min(WORLD.width, view.x1);
    const y0 = Math.max(0, Math.floor(view.y0 / step) * step);
    const y1 = Math.min(WORLD.height, view.y1);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += step) {
      ctx.moveTo(x, Math.max(0, view.y0));
      ctx.lineTo(x, y1);
    }
    for (let y = y0; y <= y1; y += step) {
      ctx.moveTo(Math.max(0, view.x0), y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(0, 0, WORLD.width, WORLD.height);
    glow(COLORS.wall, 4);
  }

  function glow(color, width) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = width * 3.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function poly(x, y, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * TAU;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function star(x, y, r, inner, points, rot) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = rot + (i / (points * 2)) * TAU;
      const rr = i % 2 === 0 ? r : inner;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawGem(g) {
    const bob = Math.sin(clock * 6 + g.x * 0.05) * 0.25;
    poly(g.x, g.y, g.r * (1 + bob * 0.3), 4, clock * 2);
    ctx.fillStyle = 'rgba(77, 255, 184, 0.25)';
    ctx.fill();
    glow(COLORS.gem, 1.5);
  }

  function drawEnemy(e, p) {
    const color = e.flash > 0 ? '#ffffff' : e.def.color;
    if (e.spawn > 0) {
      // Warp-in: a collapsing ring that tells the player where something is about to appear.
      const t = e.spawn / 0.45;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (1 + t * 3), 0, TAU);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = e.def.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    const facing = Math.atan2(p.y - e.y, p.x - e.x);
    switch (e.type) {
      case 'drone':
      case 'mini':
        poly(e.x, e.y, e.r, 3, facing);
        glow(color, 2);
        break;
      case 'dasher':
        if (e.state === 'windup') {
          const pulse = 0.35 + 0.35 * Math.sin(clock * 40);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + e.dirX * 360, e.y + e.dirY * 360);
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = e.def.color;
          ctx.lineWidth = 2;
          ctx.setLineDash([10, 8]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        poly(e.x, e.y, e.r * (e.state === 'dash' ? 1.25 : 1), 4, e.state === 'chase' ? clock * 3 : Math.atan2(e.dirY, e.dirX));
        glow(color, 2);
        break;
      case 'gunner':
        poly(e.x, e.y, e.r, 4, clock * 1.5 + Math.PI / 4);
        glow(color, 2);
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(facing) * 5, e.y + Math.sin(facing) * 5, 3, 0, TAU);
        ctx.fillStyle = color;
        ctx.fill();
        break;
      case 'splitter':
        poly(e.x, e.y, e.r, 6, clock);
        glow(color, 2);
        poly(e.x, e.y, e.r * 0.5, 6, -clock * 1.5);
        glow(color, 1.5);
        break;
      case 'brute':
        poly(e.x, e.y, e.r, 8, clock * 0.5);
        glow(color, 3.5);
        poly(e.x, e.y, e.r * 0.45, 4, -clock);
        glow(color, 2);
        drawHpPip(e);
        break;
      case 'boss': {
        const enraged = e.hp < e.maxHp * 0.5;
        star(e.x, e.y, e.r, e.r * 0.72, 12, clock * (enraged ? 1.2 : 0.5));
        glow(color, 4);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 0.4 + Math.sin(clock * 8) * 3, 0, TAU);
        ctx.fillStyle = enraged ? 'rgba(255, 225, 77, 0.5)' : 'rgba(255, 42, 109, 0.4)';
        ctx.fill();
        glow(enraged ? COLORS.crit : color, 2);
        break;
      }
      default:
        poly(e.x, e.y, e.r, 5, 0);
        glow(color, 2);
    }
  }

  function drawHpPip(e) {
    if (e.hp >= e.maxHp) return;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * (e.hp / e.maxHp));
    ctx.strokeStyle = e.def.color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawEnemyBullet(b) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fillStyle = 'rgba(255, 138, 61, 0.35)';
    ctx.fill();
    glow(COLORS.enemyBullet, 2);
  }

  function drawBullet(b) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
    ctx.lineTo(b.x, b.y);
    ctx.lineCap = 'round';
    glow(b.crit ? COLORS.crit : COLORS.bullet, 3);
    ctx.lineCap = 'butt';
  }

  function drawOrbitals(p) {
    for (let i = 0; i < p.orbitals; i++) {
      const a = p.orbitAngle + (i / p.orbitals) * TAU;
      const ox = p.x + Math.cos(a) * ORBITAL.radius;
      const oy = p.y + Math.sin(a) * ORBITAL.radius;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ORBITAL.radius, a - 0.5, a);
      ctx.strokeStyle = COLORS.player;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      star(ox, oy, ORBITAL.size, ORBITAL.size * 0.45, 4, a * 2);
      glow(COLORS.player, 2);
    }
  }

  function drawPlayer(p, frozen) {
    if (!frozen && p.iframes > 0 && p.dashTime <= 0 && Math.floor(clock * 20) % 2 === 0) return; // damage blink
    const a = p.aim;
    const r = p.r;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 40) {
      const back = Math.atan2(-p.vy, -p.vx);
      const len = r * (0.8 + Math.random() * 0.6) * Math.min(1, speed / PLAYER.speed);
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(back + 0.5) * r * 0.5, p.y + Math.sin(back + 0.5) * r * 0.5);
      ctx.lineTo(p.x + Math.cos(back) * (r * 0.6 + len), p.y + Math.sin(back) * (r * 0.6 + len));
      ctx.lineTo(p.x + Math.cos(back - 0.5) * r * 0.5, p.y + Math.sin(back - 0.5) * r * 0.5);
      glow('#ff9a3d', 2);
    }
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * r * 1.3, p.y + Math.sin(a) * r * 1.3);
    ctx.lineTo(p.x + Math.cos(a + 2.4) * r, p.y + Math.sin(a + 2.4) * r);
    ctx.lineTo(p.x + Math.cos(a + Math.PI) * r * 0.45, p.y + Math.sin(a + Math.PI) * r * 0.45);
    ctx.lineTo(p.x + Math.cos(a - 2.4) * r, p.y + Math.sin(a - 2.4) * r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(61, 242, 255, 0.25)';
    ctx.fill();
    glow(COLORS.player, 2.5);

    // Dash cooldown ring fills up around the ship.
    const ready = clamp(1 - p.dashCd / p.dashCooldown, 0, 1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * ready);
    ctx.strokeStyle = COLORS.player;
    ctx.globalAlpha = ready >= 1 ? 0.35 : 0.2;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // --- screen-space pieces ---

  function bar(x, y, w, h, t, color, label) {
    ctx.fillStyle = 'rgba(10, 12, 30, 0.75)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(t, 0, 1), h);
    ctx.strokeStyle = 'rgba(230, 233, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (label) {
      ctx.fillStyle = COLORS.text;
      ctx.font = `700 ${Math.max(10, h - 4)}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 6, y + h / 2 + 1);
    }
  }

  function drawHud(world) {
    const p = world.player;
    const pad = 16;
    const w = clamp(width * 0.38, 140, 260);
    ctx.textBaseline = 'middle';
    bar(pad, pad, w, 16, p.hp / p.maxHp, COLORS.hp, `HP ${Math.ceil(p.hp)}/${Math.round(p.maxHp)}`);
    bar(pad, pad + 22, w, 6, p.xp / p.xpNext, COLORS.xp);
    ctx.fillStyle = COLORS.dim;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`LV ${p.level}`, pad, pad + 42);

    const mins = Math.floor(world.time / 60);
    const secs = Math.floor(world.time % 60).toString().padStart(2, '0');
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(world.score.toLocaleString('en-US'), width - pad, 72);
    ctx.fillStyle = COLORS.dim;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(`WAVE ${Math.max(1, world.director.wave)}  ·  ${mins}:${secs}`, width - pad, 92);

    const boss = world.enemies.find((e) => e.alive && e.type === 'boss' && e.spawn <= 0);
    if (boss) {
      const bw = Math.min(420, width - 2 * pad);
      bar((width - bw) / 2, 112, bw, 12, boss.hp / boss.maxHp, boss.def.color, 'HIVE MOTHER');
    }
  }

  function drawBanner(b) {
    const fade = clamp(b.t / 0.4, 0, 1);
    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = b.color;
    ctx.font = `800 ${clamp(width * 0.08, 28, 54)}px ${FONT}`;
    ctx.fillText(b.text, width / 2, height * 0.3);
    if (b.sub) {
      ctx.fillStyle = COLORS.dim;
      ctx.font = `700 ${clamp(width * 0.03, 12, 18)}px ${FONT}`;
      ctx.fillText(b.sub, width / 2, height * 0.3 + 40);
    }
    ctx.globalAlpha = 1;
  }

  function drawHurtVignette(t) {
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.7);
    g.addColorStop(0, 'rgba(255, 30, 80, 0)');
    g.addColorStop(1, `rgba(255, 30, 80, ${0.45 * t})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  function drawStick(stick) {
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, stick.radius, 0, TAU);
    ctx.strokeStyle = 'rgba(61, 242, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(stick.ox + stick.dx, stick.oy + stick.dy, 22, 0, TAU);
    ctx.fillStyle = 'rgba(61, 242, 255, 0.25)';
    ctx.fill();
    ctx.stroke();
  }

  return { draw, handleEvent, reset, resize };
}
