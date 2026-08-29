(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const W = 960;
  const H = 640;
  const HUD_H = 40;
  const PLAY_Y = HUD_H;
  const PLAY_BOTTOM = H;
  const CELL = 30;
  const COLS = 32;
  const ROWS = 20;
  const TANK_SIZE = 28;

  const MAX_ACTIVE_ENEMIES = 5;
  const MAX_ALLIES = 2;
  const ALLY_RESPAWN_TIME = 18;
  const TOTAL_ENEMIES = 10;
  const BASE_PLAYER_SPEED = 178;
  const BASE_MAX_HP = 3;
  const MAX_SKILLS = 5;
  const SKILL_UNLOCK_INTERVAL = 24;

  const DIRS = {
    up: { x: 0, y: -1, angle: -Math.PI / 2 },
    down: { x: 0, y: 1, angle: Math.PI / 2 },
    left: { x: -1, y: 0, angle: Math.PI },
    right: { x: 1, y: 0, angle: 0 },
  };

  const LETTERS = {
    S: ["111", "100", "111", "001", "111"],
    T: ["111", "010", "010", "010", "010"],
    R: ["110", "101", "110", "101", "101"],
  };

  const ENEMY_TYPES = {
    scout: {
      hp: 1,
      speed: 128,
      fireInterval: 1.9,
      weapon: "plasma",
      color: "#43d9ff",
      glow: "#15c9ff",
      score: 120,
    },
    soldier: {
      hp: 2,
      speed: 88,
      fireInterval: 1.45,
      weapon: "shell",
      color: "#ff6b52",
      glow: "#ff3d2e",
      score: 100,
    },
    heavy: {
      hp: 4,
      speed: 62,
      fireInterval: 2.5,
      weapon: "rocket",
      color: "#ffb547",
      glow: "#ff8a2a",
      score: 220,
    },
    sniper: {
      hp: 2,
      speed: 58,
      fireInterval: 2.05,
      weapon: "laser",
      color: "#b78cff",
      glow: "#7c4dff",
      score: 180,
    },
    rusher: {
      hp: 1,
      speed: 185,
      fireInterval: 2.7,
      weapon: "shell",
      color: "#78ff91",
      glow: "#28e04d",
      score: 110,
    },
    shield: {
      hp: 3,
      shieldHp: 2,
      speed: 64,
      fireInterval: 2.0,
      weapon: "shell",
      color: "#67d8c6",
      glow: "#26b4a2",
      score: 170,
    },
    boss: {
      hp: 6,
      speed: 55,
      fireInterval: 2.9,
      weapon: "rocket",
      color: "#ff4f73",
      glow: "#ff2453",
      score: 420,
    },
  };

  const PROP_TYPES = {
    repair: { color: "#5ef2a8", glow: "#2dd883", label: "+", instant: true, weight: 14 },
    shield: { color: "#5bd7ff", glow: "#2aa8ff", label: "S", duration: 6, weight: 12 },
    rapid: { color: "#ffd166", glow: "#ff9f1a", label: "R", duration: 5, weight: 12 },
    triple: { color: "#c792ff", glow: "#9b4dff", label: "T", duration: 5, weight: 12 },
    speed: { color: "#75ffd9", glow: "#23d4a2", label: "M", duration: 6, weight: 10 },
    power: { color: "#ffb35f", glow: "#ff7a1f", label: "P", duration: 6, weight: 10 },
    bomb: { color: "#ff6f6f", glow: "#ff2f45", label: "B", instant: true, weight: 8 },
    drone: { color: "#a8a0ff", glow: "#6b5cff", label: "D", duration: 7, weight: 9 },
    slow: { color: "#9fd7ff", glow: "#4ca8ff", label: "Z", duration: 5, weight: 9 },
    emp: { color: "#ff7f8c", glow: "#ff3450", label: "E", instant: true, weight: 9 },
    score: { color: "#fff0a6", glow: "#f7c948", label: "★", instant: true, weight: 10 },
  };

  const SKILLS = {
    strike: { name: "导弹支援", key: "1", color: "#ff9f5f", cooldown: 10, unlocked: true },
    shield: { name: "护盾", key: "2", color: "#4bd9ff", cooldown: 10 },
    emp: { name: "EMP", key: "3", color: "#ff7f8c", cooldown: 12 },
    barrage: { name: "弹幕", key: "4", color: "#c792ff", cooldown: 13 },
    overclock: { name: "超频", key: "5", color: "#ffd166", cooldown: 16 },
  };

  let state = "menu";
  let keys = {};
  let lastTime = performance.now();
  let gameTime = 0;
  let score = 0;
  let lives = 3;
  let combo = 0;
  let comboTimer = 0;
  let baseAlive = true;
  let baseHp = BASE_MAX_HP;
  let baseMaxHp = BASE_MAX_HP;
  let enemiesRemaining = TOTAL_ENEMIES;
  let enemiesToSpawn = TOTAL_ENEMIES;
  let allies = [];
  let allySpawnTimer = 3.5;
  let enemySpawnTimer = 1.2;
  let pickupSpawnTimer = 3.2;
  let empTimer = 0;
  let slowTimer = 0;
  let shake = 0;
  let skillUnlockTimer = SKILL_UNLOCK_INTERVAL;
  let unlockedSkills = ["strike"];
  let skillCooldowns = {
    strike: 0,
    shield: 0,
    emp: 0,
    barrage: 0,
    overclock: 0,
  };

  let player = null;
  let enemies = [];
  let bullets = [];
  let particles = [];
  let shockwaves = [];
  let pickups = [];
  let floatTexts = [];
  let obstacleGrid = [];

  const audio = {
    ctx: null,
    enabled: true,
    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.ctx = new AudioContext();
      }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    tone(startFreq, endFreq, duration, type = "sine", volume = 0.035) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(startFreq, now);
      if (endFreq !== startFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
      }
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    },
    shoot() {
      this.tone(540, 740, 0.07, "square", 0.022);
    },
    laser() {
      this.tone(900, 180, 0.1, "sawtooth", 0.03);
    },
    hit() {
      this.tone(230, 110, 0.08, "square", 0.03);
    },
    explode() {
      this.tone(120, 42, 0.28, "sawtooth", 0.045);
    },
    pickup() {
      this.tone(420, 760, 0.08, "square", 0.025);
      setTimeout(() => this.tone(760, 1120, 0.08, "square", 0.025), 60);
    },
    emp() {
      this.tone(320, 55, 0.32, "sine", 0.05);
    },
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rect(x, y, w, h) {
    return { x, y, w, h };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function angleTo(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  }

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function cellKey(col, row) {
    return `${col},${row}`;
  }

  function cellCenter(col, row) {
    return {
      x: col * CELL + CELL / 2,
      y: PLAY_Y + row * CELL + CELL / 2,
    };
  }

  function entityCenter(entity) {
    return {
      x: entity.x + entity.w / 2,
      y: entity.y + entity.h / 2,
    };
  }

  function resetObstacles() {
    obstacleGrid = Array.from({ length: COLS }, () => Array(ROWS).fill(null));

    let letterX = 10;
    const letterY = 8;
    ["S", "T", "R"].forEach((ch) => {
      const pattern = LETTERS[ch];
      for (let row = 0; row < pattern.length; row += 1) {
        for (let col = 0; col < pattern[row].length; col += 1) {
          if (pattern[row][col] === "1") {
            obstacleGrid[letterX + col][letterY + row] = "steel";
          }
        }
      }
      letterX += 4;
    });

    const brick = (col, row) => {
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS && !obstacleGrid[col][row]) {
        obstacleGrid[col][row] = "brick";
      }
    };

    // 基地保护墙
    [13, 17].forEach((c) => brick(c, 17));
    [16, 17].forEach((c) => brick(c, 17));
    [13, 18].forEach((c) => brick(c, 18));
    [16, 18].forEach((c) => brick(c, 18));
    brick(14, 19);
    brick(15, 19);
    brick(16, 19);

    // 更多战术掩体
    [[2, 4], [3, 4], [4, 4], [2, 5], [4, 5], [2, 6], [3, 6], [4, 6]].forEach(([c, r]) => brick(c, r));
    [[27, 4], [28, 4], [29, 4], [27, 5], [29, 5], [27, 6], [28, 6], [29, 6]].forEach(([c, r]) => brick(c, r));
    [[6, 13], [7, 13], [6, 14], [7, 14]].forEach(([c, r]) => brick(c, r));
    [[24, 13], [25, 13], [24, 14], [25, 14]].forEach(([c, r]) => brick(c, r));
    [[1, 11], [2, 11], [1, 12], [2, 12]].forEach(([c, r]) => brick(c, r));
    [[29, 11], [30, 11], [29, 12], [30, 12]].forEach(([c, r]) => brick(c, r));

    // 随机将部分砖墙升级为不可破坏钢墙，但保留基地入口附近的可破坏性。
    for (let col = 0; col < COLS; col += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        if (obstacleGrid[col][row] !== "brick") continue;
        const nearBase = row >= 17 && col >= 13 && col <= 17;
        if (!nearBase && Math.random() < 0.18) {
          obstacleGrid[col][row] = "steel";
        }
      }
    }
  }

  function getBaseRect() {
    return rect(15 * CELL + 2, PLAY_Y + 18 * CELL + 2, CELL - 4, CELL - 4);
  }

  function entityRect(entity) {
    return rect(entity.x, entity.y, entity.w, entity.h);
  }

  function rectHitsObstacles(box, ignoreBase = false) {
    const left = Math.floor(box.x / CELL);
    const right = Math.floor((box.x + box.w - 0.01) / CELL);
    const top = Math.floor((box.y - PLAY_Y) / CELL);
    const bottom = Math.floor((box.y + box.h - 0.01 - PLAY_Y) / CELL);

    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
        if (obstacleGrid[col][row]) return true;
      }
    }

    if (!ignoreBase && baseAlive && rectsOverlap(box, getBaseRect())) return true;
    return false;
  }

  function getObstacleHit(box) {
    const left = Math.floor(box.x / CELL);
    const right = Math.floor((box.x + box.w - 0.01) / CELL);
    const top = Math.floor((box.y - PLAY_Y) / CELL);
    const bottom = Math.floor((box.y + box.h - 0.01 - PLAY_Y) / CELL);

    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
        if (obstacleGrid[col][row]) return { col, row, type: obstacleGrid[col][row] };
      }
    }
    return null;
  }

  function rectHitsTanks(box, ignore) {
    for (const enemy of enemies) {
      if (enemy !== ignore && enemy.alive && rectsOverlap(box, entityRect(enemy))) return true;
    }
    for (const ally of allies) {
      if (ally !== ignore && ally.alive && rectsOverlap(box, entityRect(ally))) return true;
    }
    if (player && player !== ignore && player.alive && rectsOverlap(box, entityRect(player))) return true;
    return false;
  }

  function canOccupy(entity, x, y) {
    const box = rect(x, y, entity.w, entity.h);
    if (x < 0 || y < PLAY_Y || x + box.w > W || y + box.h > PLAY_BOTTOM) return false;
    if (rectHitsObstacles(box, false)) return false;
    if (rectHitsTanks(box, entity)) return false;
    return true;
  }

  function moveTank(entity, dt) {
    const dir = DIRS[entity.dir];
    const speedMultiplier = entity.type === "enemy" && slowTimer > 0 ? 0.55 : 1;
    const distance = entity.speed * speedMultiplier * dt;
    const oldX = entity.x;
    const oldY = entity.y;

    entity.x += dir.x * distance;
    if (!canOccupy(entity, entity.x, oldY)) entity.x = oldX;

    entity.y += dir.y * distance;
    if (!canOccupy(entity, entity.x, entity.y)) entity.y = oldY;

    entity.blocked =
      Math.abs(entity.x - oldX) < 0.01 && Math.abs(entity.y - oldY) < 0.01;
  }

  function tankCell(entity) {
    const cx = entity.x + entity.w / 2;
    const cy = entity.y + entity.h / 2;
    return {
      col: Math.floor(cx / CELL),
      row: Math.floor((cy - PLAY_Y) / CELL),
    };
  }

  function tankCells(entity) {
    const left = Math.floor(entity.x / CELL);
    const right = Math.floor((entity.x + entity.w - 0.01) / CELL);
    const top = Math.floor((entity.y - PLAY_Y) / CELL);
    const bottom = Math.floor((entity.y + entity.h - 0.01 - PLAY_Y) / CELL);
    const cells = [];
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) cells.push({ col, row });
      }
    }
    return cells;
  }

  function isCellBlockedForPath(col, row, self) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
    if (obstacleGrid[col][row]) return true;
    if (baseAlive && col === 15 && row === 18) return true;

    for (const enemy of enemies) {
      if (enemy === self || !enemy.alive) continue;
      for (const cell of tankCells(enemy)) {
        if (cell.col === col && cell.row === row) return true;
      }
    }
    for (const ally of allies) {
      if (ally === self || !ally.alive) continue;
      for (const cell of tankCells(ally)) {
        if (cell.col === col && cell.row === row) return true;
      }
    }
    return false;
  }

  function nearestOpenCell(col, row, self) {
    const queue = [{ col, row, dist: 0 }];
    const seen = new Set([cellKey(col, row)]);
    while (queue.length) {
      const current = queue.shift();
      if (!isCellBlockedForPath(current.col, current.row, self)) return current;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = current.col + dc;
        const nr = current.row + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        const key = cellKey(nc, nr);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push({ col: nc, row: nr, dist: current.dist + 1 });
        }
      }
    }
    return { col, row };
  }

  function aStar(startCol, startRow, goalCol, goalRow, self) {
    if (startCol === goalCol && startRow === goalRow) return [];
    const goal = nearestOpenCell(goalCol, goalRow, self);
    const queue = [{ col: startCol, row: startRow, path: [] }];
    const visited = new Set([cellKey(startCol, startRow)]);

    while (queue.length) {
      const current = queue.shift();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = current.col + dc;
        const nr = current.row + dr;
        if (isCellBlockedForPath(nc, nr, self)) continue;
        const key = cellKey(nc, nr);
        if (visited.has(key)) continue;
        const nextPath = current.path.concat([{ col: nc, row: nr }]);
        if (nc === goal.col && nr === goal.row) return nextPath;
        visited.add(key);
        queue.push({ col: nc, row: nr, path: nextPath });
      }
    }
    return null;
  }

  function lineOfSight(x1, y1, x2, y2) {
    const d = dist(x1, y1, x2, y2);
    const steps = Math.max(1, Math.ceil(d / 5));
    for (let i = 0; i <= steps; i += 1) {
      const x = lerp(x1, x2, i / steps);
      const y = lerp(y1, y2, i / steps);
      const col = Math.floor(x / CELL);
      const row = Math.floor((y - PLAY_Y) / CELL);
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS && obstacleGrid[col][row]) return false;
    }
    return true;
  }

  function createPlayer(nowSec = performance.now() / 1000) {
    return {
      x: 2 * CELL + 1,
      y: PLAY_Y + 17 * CELL + 1,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir: "up",
      baseSpeed: BASE_PLAYER_SPEED,
      speed: BASE_PLAYER_SPEED,
      cooldown: 0,
      invincibleUntil: nowSec + 1.4,
      shield: 0,
      rapid: 0,
      triple: 0,
      speedBoost: 0,
      power: 0,
      drone: 0,
      droneCooldown: 0,
      alive: true,
      type: "player",
    };
  }

  function createEnemy(typeKey, col, row, dir = "down") {
    const def = ENEMY_TYPES[typeKey];
    return {
      x: col * CELL,
      y: PLAY_Y + row * CELL,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir,
      speed: def.speed + Math.random() * 8,
      hp: def.hp,
      maxHp: def.hp,
      shieldHp: def.shieldHp || 0,
      shieldMaxHp: def.shieldHp || 0,
      color: def.color,
      glow: def.glow,
      weapon: def.weapon,
      score: def.score,
      type: typeKey,
      fireInterval: def.fireInterval,
      shootTimer: 0.8 + Math.random() * 1.4,
      pathTimer: 0.2 + Math.random() * 0.5,
      path: [],
      targetCell: null,
      hitFlash: 0,
      stun: 0,
      blocked: false,
      alive: true,
    };
  }

  function createAlly(col, row, dir = "up") {
    return {
      x: col * CELL,
      y: PLAY_Y + row * CELL,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir,
      baseSpeed: 128,
      speed: 128,
      hp: 3,
      maxHp: 3,
      color: "#3fd9a0",
      glow: "#2ee2a5",
      type: "ally",
      shootTimer: 0.6 + Math.random() * 0.8,
      pathTimer: 0.3 + Math.random() * 0.4,
      path: [],
      targetCell: null,
      hitFlash: 0,
      blocked: false,
      alive: true,
      respawnTimer: 0,
      dirHoldTimer: 0,
      lastTargetKey: "",
      blockedCooldown: 0,
    };
  }

  function chooseEnemyTarget(enemy) {
    const pc = player ? tankCell(player) : { col: 2, row: 17 };
    if (enemy.type === "heavy" && baseAlive && Math.random() < 0.58) {
      const candidates = [
        { col: 15, row: 17 },
        { col: 14, row: 17 },
        { col: 16, row: 17 },
      ];
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (Math.random() < 0.72) {
      const nearby = nearestOpenCell(pc.col, pc.row, enemy);
      return nearby;
    }
    return {
      col: Math.floor(Math.random() * COLS),
      row: Math.floor(Math.random() * ROWS),
    };
  }

  function chooseEnemyDirection(enemy) {
    const options = shuffle(["up", "down", "left", "right"]);
    for (const key of options) {
      const dir = DIRS[key];
      const probe = rect(
        enemy.x + dir.x * 6,
        enemy.y + dir.y * 6,
        enemy.w,
        enemy.h
      );
      if (
        probe.x >= 0 &&
        probe.y >= PLAY_Y &&
        probe.x + probe.w <= W &&
        probe.y + probe.h <= PLAY_BOTTOM &&
        !rectHitsObstacles(probe, false) &&
        !rectHitsTanks(probe, enemy)
      ) {
        enemy.dir = key;
        return;
      }
    }
  }

  function followPath(enemy, dt) {
    if (!enemy.path.length) {
      moveTank(enemy, dt);
      if (enemy.blocked) {
        chooseEnemyDirection(enemy);
        moveTank(enemy, dt);
        enemy.pathTimer = Math.min(enemy.pathTimer, 0.5);
      }
      return;
    }

    const next = enemy.path[0];
    const target = cellCenter(next.col, next.row);
    const center = entityCenter(enemy);
    const dx = target.x - center.x;
    const dy = target.y - center.y;

    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      enemy.path.shift();
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      enemy.dir = dx > 0 ? "right" : "left";
    } else {
      enemy.dir = dy > 0 ? "down" : "up";
    }

    moveTank(enemy, dt);
    if (enemy.blocked) {
      enemy.path = [];
      enemy.pathTimer = 0;
      chooseEnemyDirection(enemy);
    }
  }

  function followPathAlly(ally, dt) {
    if (!ally.path.length) {
      moveTank(ally, dt);
      if (ally.blocked) {
        chooseAllyDirection(ally);
        moveTank(ally, dt);
      }
      return;
    }

    const next = ally.path[0];
    const target = cellCenter(next.col, next.row);
    const center = entityCenter(ally);
    const dx = target.x - center.x;
    const dy = target.y - center.y;

    // 方向锁定：在短时间内不允许切换方向，防止抖动
    if (ally.dirHoldTimer > 0) {
      ally.dirHoldTimer -= dt;
    }

    // 到达路径点：跳过并继续处理下一个点（不 return，防止卡顿）
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      ally.path.shift();
      if (!ally.path.length) return;
    }

    // 方向选择：使用阈值滞后(hysteresis)，防止 |dx|≈|dy| 时频繁翻转
    const HYSTERESIS = 8;
    if (ally.dirHoldTimer <= 0) {
      let newDir;
      if (Math.abs(dx) > Math.abs(dy) + HYSTERESIS) {
        newDir = dx > 0 ? "right" : "left";
      } else if (Math.abs(dy) > Math.abs(dx) + HYSTERESIS) {
        newDir = dy > 0 ? "down" : "up";
      } else {
        // 差值在阈值内，保持当前方向
        newDir = ally.dir;
      }

      if (newDir !== ally.dir) {
        ally.dir = newDir;
        ally.dirHoldTimer = 0.22;
      }
    }

    moveTank(ally, dt);
    if (ally.blocked) {
      // 被阻挡时不清空路径，先尝试侧向移动
      ally.blockedCooldown -= dt;
      if (ally.blockedCooldown <= 0) {
        ally.path = [];
        ally.pathTimer = 0;
        chooseAllyDirection(ally);
        ally.blockedCooldown = 0.3;
      }
    }
  }

  function chooseAllyDirection(ally) {
    const options = shuffle(["up", "down", "left", "right"]);
    for (const key of options) {
      const dir = DIRS[key];
      const probe = rect(
        ally.x + dir.x * 6,
        ally.y + dir.y * 6,
        ally.w,
        ally.h
      );
      if (
        probe.x >= 0 &&
        probe.y >= PLAY_Y &&
        probe.x + probe.w <= W &&
        probe.y + probe.h <= PLAY_BOTTOM &&
        !rectHitsObstacles(probe, false) &&
        !rectHitsTanks(probe, ally)
      ) {
        ally.dir = key;
        ally.dirHoldTimer = 0.2;
        return;
      }
    }
  }

  function addParticles(x, y, color, count = 10, power = 1, type = "spark") {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (35 + Math.random() * 120) * power;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.5,
        maxLife: 0.8,
        size: 1.5 + Math.random() * 3.5,
        color,
        type,
        drag: 0.98,
        dead: false,
      });
    }
  }

  function addShockwave(x, y, maxRadius, color) {
    shockwaves.push({
      x,
      y,
      radius: 6,
      maxRadius,
      life: 0.42,
      maxLife: 0.42,
      color,
      dead: false,
    });
  }

  function addFloatText(x, y, text, color = "#ffffff") {
    floatTexts.push({
      x,
      y,
      text,
      color,
      life: 1.1,
      maxLife: 1.1,
      vy: -42,
      dead: false,
    });
  }

  function muzzlePoint(entity) {
    const dir = DIRS[entity.dir];
    const center = entityCenter(entity);
    const offset = entity.w / 2 + 8;
    return {
      x: center.x + dir.x * offset,
      y: center.y + dir.y * offset,
    };
  }

  function spawnBullet(x, y, angle, kind, owner, source, damageOverride = 0) {
    const defs = {
      "player-shell": { speed: 360, radius: 4, color: "#a9f9ff", glow: "#35d7ff", damage: 1, trail: true },
      "enemy-shell": { speed: 300, radius: 4, color: "#ffb25f", glow: "#ff5a3c", damage: 1, trail: true },
      plasma: { speed: 220, radius: 5, color: "#5fe9ff", glow: "#1a8eff", damage: 1, trail: true, homing: 0.12 },
      laser: { speed: 520, radius: 3, color: "#ff6d6d", glow: "#ff1535", damage: 1, trail: true },
      rocket: { speed: 185, radius: 6, color: "#ffc857", glow: "#ff7a3c", damage: 1, trail: true, explosive: true },
    };
    const def = defs[kind] || defs["player-shell"];
    const bullet = {
      x: x - def.radius,
      y: y - def.radius,
      w: def.radius * 2,
      h: def.radius * 2,
      radius: def.radius,
      angle,
      vx: Math.cos(angle) * def.speed,
      vy: Math.sin(angle) * def.speed,
      speed: def.speed,
      color: def.color,
      glow: def.glow,
      damage: damageOverride || def.damage,
      trail: def.trail,
      homing: def.homing || 0,
      explosive: def.explosive || false,
      owner,
      source,
      life: 4,
      dead: false,
      wobble: Math.random() * Math.PI * 2,
    };
    bullets.push(bullet);

    if (owner === "player") {
      if (kind === "player-shell") audio.shoot();
      else if (kind === "laser") audio.laser();
      else if (kind === "rocket") audio.shoot();
    }
    return bullet;
  }

  function spawnPlayerShot(dirKey) {
    const angle = DIRS[dirKey].angle;
    const p = muzzlePoint(player);
    const kind = "player-shell";
    const damage = player.power > 0 ? 2 : 1;
    spawnBullet(p.x, p.y, angle, kind, "player", player, damage);
    addParticles(p.x, p.y, "#a9f9ff", 5, 0.5, "spark");

    if (player.triple > 0) {
      spawnBullet(p.x, p.y, angle - 0.22, kind, "player", player, damage);
      spawnBullet(p.x, p.y, angle + 0.22, kind, "player", player, damage);
    }
  }

  function spawnEnemyShot(enemy) {
    if (player && !player.alive) return;
    const p = muzzlePoint(enemy);
    const angle = player
      ? angleTo(p.x, p.y, player.x + player.w / 2, player.y + player.h / 2)
      : DIRS[enemy.dir].angle;
    spawnBullet(p.x, p.y, angle, enemy.weapon, "enemy", enemy);
    addParticles(p.x, p.y, enemy.glow, 5, 0.45, "spark");
  }

  function respawnPlayer() {
    const nowSec = performance.now() / 1000;
    player.x = 2 * CELL + 1;
    player.y = PLAY_Y + 17 * CELL + 1;
    player.dir = "up";
    player.invincibleUntil = nowSec + 1.8;
    player.cooldown = 0;
    player.shield = Math.max(player.shield, 1.4);
  }

  function damageEnemy(enemy, amount = 1, hitX, hitY) {
    if (!enemy.alive) return;
    if (enemy.shieldHp > 0) {
      enemy.shieldHp -= amount;
      enemy.hitFlash = 0.12;
      audio.hit();
      addShockwave(hitX, hitY, 34, "#55e6d2");
      addParticles(hitX, hitY, "#55e6d2", 12, 0.7, "spark");
      addFloatText(hitX, hitY - 14, "护盾吸收", "#55e6d2");
      return;
    }
    enemy.hp -= amount;
    enemy.hitFlash = 0.16;
    audio.hit();
    addParticles(hitX, hitY, enemy.glow, 10, 0.7, "spark");

    if (enemy.hp <= 0) {
      enemy.alive = false;
      combo += 1;
      comboTimer = 2.5;
      const bonus = Math.max(0, combo - 1) * 25;
      score += enemy.score + bonus;
      enemiesRemaining -= 1;
      audio.explode();
      addShockwave(hitX, hitY, 58, enemy.glow);
      addParticles(hitX, hitY, enemy.glow, 32, 1.3, "spark");
      addParticles(hitX, hitY, "#ff5f3c", 18, 1.1, "smoke");
      addFloatText(hitX, hitY - 16, `+${enemy.score + bonus}`, "#ffd166");
      shake = 8;

      if (enemiesRemaining <= 0 && enemies.every((item) => !item.alive)) {
        state = "win";
      }
    }
  }

  function damagePlayer(bullet) {
    const nowSec = performance.now() / 1000;
    if (!player.alive || nowSec < player.invincibleUntil) return;

    if (player.shield > 0) {
      player.shield = Math.max(0, player.shield - 1.5);
      addShockwave(player.x + player.w / 2, player.y + player.h / 2, 48, "#4dd9ff");
      addParticles(player.x + player.w / 2, player.y + player.h / 2, "#4dd9ff", 14, 0.8, "spark");
      return;
    }

    lives -= 1;
    audio.explode();
    addShockwave(player.x + player.w / 2, player.y + player.h / 2, 62, "#4dd9ff");
    addParticles(player.x + player.w / 2, player.y + player.h / 2, "#4dd9ff", 30, 1.25, "spark");
    shake = 10;

    if (lives <= 0) {
      player.alive = false;
      state = "gameover";
    } else {
      respawnPlayer();
    }
  }

  function damageBase(amount = 1) {
    if (!baseAlive) return;
    baseHp -= amount;
    const base = getBaseRect();
    addParticles(base.x + base.w / 2, base.y + base.h / 2, "#ff8a42", 18, 0.9, "spark");
    addFloatText(base.x + base.w / 2, base.y - 10, "基地受损", "#ff9d8f");
    audio.hit();
    if (baseHp <= 0) {
      baseAlive = false;
      audio.explode();
      addShockwave(base.x + base.w / 2, base.y + base.h / 2, 90, "#ff4a3c");
      addParticles(base.x + base.w / 2, base.y + base.h / 2, "#ff4a3c", 48, 1.5, "spark");
      addParticles(base.x + base.w / 2, base.y + base.h / 2, "#4f3a32", 24, 1, "smoke");
      shake = 16;
      state = "gameover";
    } else {
      shake = 8;
    }
  }

  function createExplosion(x, y, radius, owner) {
    audio.explode();
    addShockwave(x, y, radius, owner === "player" ? "#ffd166" : "#ff5a3c");
    addParticles(x, y, owner === "player" ? "#ffd166" : "#ff5a3c", 34, 1.25, "spark");
    addParticles(x, y, "#5b2f22", 16, 1, "smoke");

    if (owner === "player") {
      for (const enemy of enemies) {
        if (enemy.alive && dist(x, y, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2) < radius + enemy.w / 2) {
          damageEnemy(enemy, 2, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
        }
      }
    } else if (player && player.alive) {
      const pc = entityCenter(player);
      if (dist(x, y, pc.x, pc.y) < radius + player.w / 2) damagePlayer({});
    }
  }

  function spawnEnemy() {
    if (enemiesToSpawn <= 0 || enemies.filter((e) => e.alive).length >= MAX_ACTIVE_ENEMIES) return;
    const queue = [
      "scout",
      "rusher",
      "soldier",
      "shield",
      "sniper",
      "soldier",
      "heavy",
      "rusher",
      "sniper",
      "boss",
    ];
    const spawnedCount = TOTAL_ENEMIES - enemiesToSpawn;
    const typeKey = queue[spawnedCount % queue.length];
    const spawnCols = [5, 15, 25, 8, 20, 11, 17, 28];
    const col = spawnCols[spawnedCount % spawnCols.length];
    const row = Math.random() < 0.5 ? 0 : 1;
    const enemy = createEnemy(typeKey, col, row, "down");
    enemiesToSpawn -= 1;
    enemies.push(enemy);
    addShockwave(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 38, enemy.glow);
    addParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, enemy.glow, 18, 0.8, "spark");
    addFloatText(enemy.x + enemy.w / 2, enemy.y - 12, typeKey.toUpperCase(), enemy.glow);
  }

  function nearestAliveEnemy() {
    let best = null;
    let bestDist = Infinity;
    const pc = player ? entityCenter(player) : { x: W / 2, y: H / 2 };
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const ec = entityCenter(enemy);
      const d = dist(pc.x, pc.y, ec.x, ec.y);
      if (d < bestDist) {
        bestDist = d;
        best = enemy;
      }
    }
    return best;
  }

  function isCellFreeForTank(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    const probe = rect(col * CELL + 1, PLAY_Y + row * CELL + 1, TANK_SIZE, TANK_SIZE);
    return (
      probe.x >= 0 &&
      probe.y >= PLAY_Y &&
      probe.x + probe.w <= W &&
      probe.y + probe.h <= PLAY_BOTTOM &&
      !rectHitsObstacles(probe, false) &&
      !rectHitsTanks(probe, null)
    );
  }

  function findAllySpawnCell() {
    const base = player ? tankCell(player) : { col: 2, row: 17 };
    const offsets = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
      [0, -2],
      [2, 0],
      [0, 2],
      [-2, 0],
      [2, -1],
      [2, 1],
      [-2, 1],
      [-2, -1],
      [1, -2],
      [1, 2],
      [-1, 2],
      [-1, -2],
    ];

    for (const [dc, dr] of offsets) {
      const col = base.col + dc;
      const row = base.row + dr;
      if (isCellFreeForTank(col, row)) return { col, row };
    }

    for (let radius = 3; radius <= 6; radius += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        for (let dr = -radius; dr <= radius; dr += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
          const col = base.col + dc;
          const row = base.row + dr;
          if (isCellFreeForTank(col, row)) return { col, row };
        }
      }
    }

    for (let col = 0; col < COLS; col += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        if (isCellFreeForTank(col, row)) return { col, row };
      }
    }
    return null;
  }

  function spawnAlly() {
    if (allies.filter((ally) => ally.alive).length >= MAX_ALLIES) return;
    const cell = findAllySpawnCell();
    if (!cell) return;
    const ally = createAlly(cell.col, cell.row, "up");
    allies.push(ally);
    addShockwave(ally.x + ally.w / 2, ally.y + ally.h / 2, 34, ally.glow);
    addFloatText(ally.x + ally.w / 2, ally.y - 12, "友军支援", "#5ee6a8");
  }

  function damageAlly(ally, amount = 1) {
    if (!ally.alive) return;
    ally.hp -= amount;
    ally.hitFlash = 0.14;
    audio.hit();
    addParticles(ally.x + ally.w / 2, ally.y + ally.h / 2, ally.glow, 10, 0.7, "spark");
    if (ally.hp <= 0) {
      ally.alive = false;
      ally.respawnTimer = ALLY_RESPAWN_TIME;
      addShockwave(ally.x + ally.w / 2, ally.y + ally.h / 2, 46, ally.glow);
      addFloatText(ally.x + ally.w / 2, ally.y - 12, "友军撤离", "#9fd7ff");
    }
  }

  function updateAlly(ally, dt) {
    if (!ally.alive) return;

    ally.hitFlash = Math.max(0, ally.hitFlash - dt);
    ally.shootTimer -= dt;
    ally.pathTimer -= dt;
    ally.blockedCooldown = Math.max(0, ally.blockedCooldown - dt);

    const target = nearestAliveEnemy();
    const targetCell = target
      ? tankCell(target)
      : player
        ? tankCell(player)
        : { col: 2, row: 17 };

    const targetKey = `${targetCell.col},${targetCell.row}`;

    // 重规划条件：定时器到期 或 目标格子变了 或 路径为空
    const needsRepath =
      ally.pathTimer <= 0 ||
      !ally.path.length ||
      targetKey !== ally.lastTargetKey;

    if (needsRepath) {
      ally.blocked = false;
      const current = tankCell(ally);
      ally.path = aStar(current.col, current.row, targetCell.col, targetCell.row, ally) || [];
      ally.lastTargetKey = targetKey;
      ally.pathTimer = 0.8 + Math.random() * 0.6;
      ally.dirHoldTimer = 0.15;
    }

    followPathAlly(ally, dt);

    if (target) {
      const ac = entityCenter(ally);
      const ec = entityCenter(target);
      if (ally.shootTimer <= 0 && lineOfSight(ac.x, ac.y, ec.x, ec.y) && dist(ac.x, ac.y, ec.x, ec.y) < 420) {
        const angle = angleTo(ac.x, ac.y, ec.x, ec.y);
        spawnBullet(ac.x, ac.y, angle, "player-shell", "ally", ally, 1);
        ally.shootTimer = 0.72 + Math.random() * 0.45;
      }
    }
  }

  function weightedPickupType() {
    const total = Object.values(PROP_TYPES).reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const [key, def] of Object.entries(PROP_TYPES)) {
      roll -= def.weight;
      if (roll <= 0) return key;
    }
    return "repair";
  }

  function spawnPickup() {
    if (pickups.length >= 4) return;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const col = Math.floor(Math.random() * COLS);
      const row = Math.floor(Math.random() * ROWS);
      if (isCellBlockedForPath(col, row, null)) continue;
      if (player && dist(col * CELL + CELL / 2, PLAY_Y + row * CELL + CELL / 2, player.x, player.y) < 130) continue;
      const type = weightedPickupType();
      pickups.push({
        col,
        row,
        x: col * CELL,
        y: PLAY_Y + row * CELL,
        type,
        life: 12,
        maxLife: 12,
        phase: Math.random() * Math.PI * 2,
        dead: false,
      });
      return;
    }
  }

  function applyPickup(pickup) {
    const def = PROP_TYPES[pickup.type];
    const center = cellCenter(pickup.col, pickup.row);
    audio.pickup();
    addParticles(center.x, center.y, def.glow, 18, 0.9, "spark");

    if (pickup.type === "repair") {
      lives = Math.min(4, lives + 1);
      addFloatText(center.x, center.y - 12, "装甲修复 +1", def.glow);
    } else if (pickup.type === "shield") {
      player.shield = Math.max(player.shield, def.duration);
      addFloatText(center.x, center.y - 12, "能量护盾", def.glow);
    } else if (pickup.type === "rapid") {
      player.rapid = def.duration;
      addFloatText(center.x, center.y - 12, "急速射击", def.glow);
    } else if (pickup.type === "triple") {
      player.triple = def.duration;
      addFloatText(center.x, center.y - 12, "三向弹幕", def.glow);
    } else if (pickup.type === "speed") {
      player.speedBoost = def.duration;
      addFloatText(center.x, center.y - 12, "机动强化", def.glow);
    } else if (pickup.type === "power") {
      player.power = def.duration;
      addFloatText(center.x, center.y - 12, "火力强化", def.glow);
    } else if (pickup.type === "bomb") {
      enemies.forEach((enemy) => {
        if (enemy.alive) damageEnemy(enemy, 2, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
      });
      addShockwave(center.x, center.y, 210, def.glow);
      addFloatText(center.x, center.y - 12, "全屏轰炸", def.glow);
    } else if (pickup.type === "drone") {
      player.drone = def.duration;
      addFloatText(center.x, center.y - 12, "无人机上线", def.glow);
    } else if (pickup.type === "slow") {
      slowTimer = def.duration;
      addFloatText(center.x, center.y - 12, "时间减速", def.glow);
    } else if (pickup.type === "emp") {
      empTimer = 3;
      enemies.forEach((enemy) => {
        if (enemy.alive) enemy.stun = 3;
      });
      addShockwave(center.x, center.y, 180, def.glow);
      addFloatText(center.x, center.y - 12, "EMP 冲击", def.glow);
      audio.emp();
    } else if (pickup.type === "score") {
      score += 250;
      addFloatText(center.x, center.y - 12, "+250", def.glow);
    }
  }

  function useSkill(id) {
    if (!player || !player.alive) return;
    if (!unlockedSkills.includes(id)) return;
    if (skillCooldowns[id] > 0) return;

    const def = SKILLS[id];
    const pc = entityCenter(player);
    skillCooldowns[id] = def.cooldown;
    addFloatText(pc.x, pc.y - 28, `${def.name} 发动`, def.color);

    if (id === "strike") {
      const targets = enemies
        .filter((enemy) => enemy.alive)
        .sort((a, b) => {
          const ac = entityCenter(a);
          const bc = entityCenter(b);
          return dist(pc.x, pc.y, ac.x, ac.y) - dist(pc.x, pc.y, bc.x, bc.y);
        })
        .slice(0, 3);
      targets.forEach((enemy) => {
        const ec = entityCenter(enemy);
        const angle = angleTo(pc.x, pc.y, ec.x, ec.y);
        spawnBullet(pc.x, pc.y, angle, "rocket", "player", player, 2);
      });
      addShockwave(pc.x, pc.y, 80, def.color);
      addParticles(pc.x, pc.y, def.color, 24, 1.1, "spark");
    } else if (id === "shield") {
      player.shield = Math.max(player.shield, 6);
      addShockwave(pc.x, pc.y, 60, def.color);
    } else if (id === "emp") {
      empTimer = 3;
      enemies.forEach((enemy) => {
        if (enemy.alive) enemy.stun = 3;
      });
      addShockwave(pc.x, pc.y, 190, def.color);
      audio.emp();
    } else if (id === "barrage") {
      for (let i = 0; i < 12; i += 1) {
        const angle = (Math.PI * 2 * i) / 12;
        spawnBullet(pc.x, pc.y, angle, "laser", "player", player, 1);
      }
      addShockwave(pc.x, pc.y, 65, def.color);
    } else if (id === "overclock") {
      player.rapid = 5;
      player.triple = 5;
      player.speedBoost = 5;
      player.power = 3;
      addShockwave(pc.x, pc.y, 75, def.color);
    }
  }

  function updatePlayer(dt) {
    if (!player || !player.alive) return;

    player.cooldown -= dt;
    player.invincibleUntil -= dt;
    player.shield = Math.max(0, player.shield - dt);
    player.rapid = Math.max(0, player.rapid - dt);
    player.triple = Math.max(0, player.triple - dt);
    player.speedBoost = Math.max(0, player.speedBoost - dt);
    player.power = Math.max(0, player.power - dt);
    player.drone = Math.max(0, player.drone - dt);
    player.droneCooldown -= dt;
    player.speed = player.baseSpeed * (player.speedBoost > 0 ? 1.35 : 1);

    let nextDir = player.dir;
    if (keys["ArrowUp"] || keys["KeyW"]) nextDir = "up";
    else if (keys["ArrowDown"] || keys["KeyS"]) nextDir = "down";
    else if (keys["ArrowLeft"] || keys["KeyA"]) nextDir = "left";
    else if (keys["ArrowRight"] || keys["KeyD"]) nextDir = "right";

    const moving =
      keys["ArrowUp"] ||
      keys["ArrowDown"] ||
      keys["ArrowLeft"] ||
      keys["ArrowRight"] ||
      keys["KeyW"] ||
      keys["KeyS"] ||
      keys["KeyA"] ||
      keys["KeyD"];

    if (moving) {
      player.dir = nextDir;
      moveTank(player, dt);
    }

    if (keys["Space"] && player.cooldown <= 0) {
      spawnPlayerShot(player.dir);
      player.cooldown = player.rapid > 0 ? 0.1 : 0.22;
    }

    if (player.drone > 0 && player.droneCooldown <= 0) {
      const nearest = enemies
        .filter((enemy) => enemy.alive)
        .sort((a, b) => {
          const ac = entityCenter(a);
          const bc = entityCenter(b);
          const pc = entityCenter(player);
          return dist(pc.x, pc.y, ac.x, ac.y) - dist(pc.x, pc.y, bc.x, bc.y);
        })[0];
      if (nearest) {
        const pc = entityCenter(player);
        const nc = entityCenter(nearest);
        const angle = angleTo(pc.x, pc.y, nc.x, nc.y);
        spawnBullet(pc.x, pc.y, angle, "laser", "player", player, 1);
        player.droneCooldown = 0.45;
      }
    }

    for (const pickup of pickups) {
      if (!pickup.dead && rectsOverlap(entityRect(player), rect(pickup.x, pickup.y, CELL, CELL))) {
        applyPickup(pickup);
        pickup.dead = true;
      }
    }
  }

  function updateEnemy(enemy, dt) {
    if (!enemy.alive) return;

    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.shootTimer -= dt;
    enemy.pathTimer -= dt;

    if (enemy.stun > 0) {
      enemy.stun -= dt;
      addParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, "#7fe9ff", 1, 0.2, "spark");
      return;
    }

    if (enemy.pathTimer <= 0 || enemy.blocked) {
      enemy.blocked = false;
      enemy.targetCell = chooseEnemyTarget(enemy);
      const current = tankCell(enemy);
      enemy.path = aStar(current.col, current.row, enemy.targetCell.col, enemy.targetCell.row, enemy) || [];
      enemy.pathTimer = 0.55 + Math.random() * 0.75;
    }

    followPath(enemy, dt);

    if (player && player.alive) {
      const ec = entityCenter(enemy);
      const pc = entityCenter(player);
      const canShoot = enemy.shootTimer <= 0 && lineOfSight(ec.x, ec.y, pc.x, pc.y);
      if (canShoot && dist(ec.x, ec.y, pc.x, pc.y) < 460) {
        spawnEnemyShot(enemy);
        enemy.shootTimer = enemy.fireInterval * (0.8 + Math.random() * 0.5);
      }
    }
  }

  function circleRectOverlap(cx, cy, radius, box) {
    const px = clamp(cx, box.x, box.x + box.w);
    const py = clamp(cy, box.y, box.y + box.h);
    return dist(cx, cy, px, py) <= radius;
  }

  function updateBullets(dt) {
    for (const bullet of bullets) {
      if (bullet.dead) continue;
      bullet.life -= dt;
      if (bullet.life <= 0) {
        bullet.dead = true;
        continue;
      }

      if (bullet.homing && bullet.owner === "enemy" && player && player.alive) {
        const pc = entityCenter(player);
        const currentAngle = Math.atan2(bullet.vy, bullet.vx);
        const desired = angleTo(bullet.x + bullet.radius, bullet.y + bullet.radius, pc.x, pc.y);
        let diff = desired - currentAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = clamp(diff, -bullet.homing * dt * 8, bullet.homing * dt * 8);
        const nextAngle = currentAngle + turn;
        bullet.vx = Math.cos(nextAngle) * bullet.speed;
        bullet.vy = Math.sin(nextAngle) * bullet.speed;
      }

      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.wobble += dt * 20;

      if (bullet.trail) {
        addParticles(
          bullet.x + bullet.radius,
          bullet.y + bullet.radius,
          bullet.glow,
          1,
          0.18,
          "glow"
        );
      }

      const cx = bullet.x + bullet.radius;
      const cy = bullet.y + bullet.radius;
      const box = entityRect(bullet);
      if (
        cx < 0 ||
        cy < PLAY_Y ||
        cx > W ||
        cy > PLAY_BOTTOM
      ) {
        bullet.dead = true;
        continue;
      }

      const obstacleHit = getObstacleHit(box);
      if (obstacleHit) {
        if (obstacleHit.type === "brick") {
          obstacleGrid[obstacleHit.col][obstacleHit.row] = null;
          if (bullet.owner === "player" || bullet.owner === "ally") score += 10;
          addParticles(
            obstacleHit.col * CELL + CELL / 2,
            PLAY_Y + obstacleHit.row * CELL + CELL / 2,
            "#d7895b",
            12,
            0.65,
            "spark"
          );
        }
        if (bullet.explosive) createExplosion(cx, cy, 68, bullet.owner);
        bullet.dead = true;
        continue;
      }

      if (bullet.owner === "player" || bullet.owner === "ally") {
        for (const enemy of enemies) {
          if (enemy.alive && circleRectOverlap(cx, cy, bullet.radius, entityRect(enemy))) {
            damageEnemy(enemy, bullet.damage, cx, cy);
            if (bullet.explosive) createExplosion(cx, cy, 68, "player");
            bullet.dead = true;
            break;
          }
        }
      } else if (bullet.owner === "enemy") {
        let hitAlly = false;
        for (const ally of allies) {
          if (ally.alive && circleRectOverlap(cx, cy, bullet.radius, entityRect(ally))) {
            damageAlly(ally, bullet.damage || 1);
            hitAlly = true;
            break;
          }
        }
        if (hitAlly) {
          bullet.dead = true;
        } else if (player && player.alive && circleRectOverlap(cx, cy, bullet.radius, entityRect(player))) {
          damagePlayer(bullet);
          if (bullet.explosive) createExplosion(cx, cy, 68, "enemy");
          bullet.dead = true;
        } else if (baseAlive && circleRectOverlap(cx, cy, bullet.radius, getBaseRect())) {
          if (bullet.explosive) createExplosion(cx, cy, 68, "enemy");
          damageBase(bullet.damage || 1);
          bullet.dead = true;
        }
      }
    }

    bullets = bullets.filter((bullet) => !bullet.dead);
  }

  function updateParticles(dt) {
    for (const particle of particles) {
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.dead = true;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= particle.drag;
      particle.vy *= particle.drag;
    }
    particles = particles.filter((particle) => !particle.dead);
  }

  function updateShockwaves(dt) {
    for (const wave of shockwaves) {
      wave.life -= dt;
      if (wave.life <= 0) wave.dead = true;
    }
    shockwaves = shockwaves.filter((wave) => !wave.dead);
  }

  function updatePickups(dt) {
    pickupSpawnTimer -= dt;
    if (pickupSpawnTimer <= 0) {
      spawnPickup();
      pickupSpawnTimer = 3.8 + Math.random() * 2.6;
    }

    for (const pickup of pickups) {
      pickup.life -= dt;
      pickup.phase += dt * 3;
      if (pickup.life <= 0) pickup.dead = true;
    }
    pickups = pickups.filter((pickup) => !pickup.dead);
  }

  function updateFloatTexts(dt) {
    for (const text of floatTexts) {
      text.life -= dt;
      text.y += text.vy * dt;
      if (text.life <= 0) text.dead = true;
    }
    floatTexts = floatTexts.filter((text) => !text.dead);
  }

  function update(dt) {
    gameTime += dt;
    shake = Math.max(0, shake - dt * 30);
    comboTimer -= dt;
    empTimer = Math.max(0, empTimer - dt);
    slowTimer = Math.max(0, slowTimer - dt);
    if (comboTimer <= 0) combo = 0;

    for (const id of Object.keys(skillCooldowns)) {
      skillCooldowns[id] = Math.max(0, skillCooldowns[id] - dt);
    }
    if (unlockedSkills.length < MAX_SKILLS) {
      skillUnlockTimer -= dt;
      if (skillUnlockTimer <= 0) {
        const nextId = Object.keys(SKILLS)[unlockedSkills.length];
        unlockedSkills.push(nextId);
        skillUnlockTimer = SKILL_UNLOCK_INTERVAL;
        addFloatText(W / 2, H / 2 - 40, `技能解锁：${SKILLS[nextId].name}`, SKILLS[nextId].color);
        audio.pickup();
      }
    }

    enemySpawnTimer -= dt;
    if (enemySpawnTimer <= 0 && enemiesToSpawn > 0) {
      spawnEnemy();
      enemySpawnTimer = 2.2;
    }

    allySpawnTimer -= dt;
    if (allySpawnTimer <= 0) {
      spawnAlly();
      allySpawnTimer = 6.5;
    }

    allies.forEach((ally) => {
      if (ally.alive) {
        updateAlly(ally, dt);
      } else {
        ally.respawnTimer -= dt;
        if (ally.respawnTimer <= 0) {
          ally.alive = true;
          ally.hp = ally.maxHp;
          ally.respawnTimer = 0;
          const spawnCell = findAllySpawnCell();
          ally.x = spawnCell ? spawnCell.col * CELL + 1 : 2 * CELL + 1;
          ally.y = spawnCell ? PLAY_Y + spawnCell.row * CELL + 1 : PLAY_Y + 17 * CELL + 1;
          ally.dir = "up";
          ally.path = [];
          ally.lastTargetKey = "";
          ally.dirHoldTimer = 0.2;
          ally.blockedCooldown = 0;
          ally.pathTimer = 0.3;
          addShockwave(ally.x + ally.w / 2, ally.y + ally.h / 2, 30, ally.glow);
        }
      }
    });

    updatePlayer(dt);
    enemies.forEach((enemy) => updateEnemy(enemy, dt));
    updateBullets(dt);
    updateParticles(dt);
    updateShockwaves(dt);
    updatePickups(dt);
    updateFloatTexts(dt);
  }

  function resetGame() {
    audio.init();
    score = 0;
    lives = 3;
    combo = 0;
    comboTimer = 0;
    baseAlive = true;
    baseHp = BASE_MAX_HP;
    baseMaxHp = BASE_MAX_HP;
    enemiesRemaining = TOTAL_ENEMIES;
    enemiesToSpawn = TOTAL_ENEMIES;
    allies = [];
    allySpawnTimer = 3.5;
    enemySpawnTimer = 1.2;
    pickupSpawnTimer = 3.2;
    empTimer = 0;
    slowTimer = 0;
    skillUnlockTimer = SKILL_UNLOCK_INTERVAL;
    unlockedSkills = ["strike"];
    skillCooldowns = {
      strike: 0,
      shield: 0,
      emp: 0,
      barrage: 0,
      overclock: 0,
    };
    gameTime = 0;
    shake = 0;
    bullets = [];
    particles = [];
    shockwaves = [];
    pickups = [];
    floatTexts = [];
    enemies = [];
    resetObstacles();
    player = createPlayer();
    state = "playing";
  }

  function drawFallbackBackground() {
    const gradient = ctx.createLinearGradient(0, PLAY_Y, 0, H);
    gradient.addColorStop(0, "#07131a");
    gradient.addColorStop(0.5, "#0c1b22");
    gradient.addColorStop(1, "#132a2b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(38, 190, 206, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += CELL) {
      ctx.beginPath();
      ctx.moveTo(x, PLAY_Y);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = PLAY_Y; y <= H; y += CELL) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(47, 176, 190, 0.06)";
    ctx.fillRect(44, 82, 92, 190);
    ctx.fillRect(116, 58, 68, 214);
    ctx.fillRect(782, 72, 78, 200);
    ctx.fillRect(858, 96, 78, 176);

    ctx.strokeStyle = "rgba(68, 220, 226, 0.16)";
    for (let i = 0; i < 5; i += 1) {
      const x = 150 + i * 145;
      const y = 180 + (i % 3) * 95;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 程序化绘制"浪尖儿 WavePeak Elite"logo 水印（低透明度，不遮挡视野）
  function drawWavepeakLogo() {
    const playH = H - PLAY_Y;
    const S = Math.min(playH * 0.86, 470);
    const bcx = W / 2;
    const bcy = PLAY_Y + playH / 2;

    ctx.save();
    ctx.globalAlpha = 0.16;

    // 柔和暗色衬底，提升 logo 存在感但不形成硬色块
    const vignette = ctx.createRadialGradient(bcx, bcy, 0, bcx, bcy, S * 0.72);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = vignette;
    ctx.fillRect(bcx - S * 0.75, bcy - S * 0.75, S * 1.5, S * 1.5);

    // ---- 波形喇叭图标 ----
    const ox = bcx - S * 0.175; // 开口中心
    const oy = bcy;
    const rx = S * 0.032;
    const ry = S * 0.128;
    const tx = ox - S * 0.265; // 左侧尖端

    const hornGrad = ctx.createLinearGradient(tx, oy + ry, ox, oy - ry);
    hornGrad.addColorStop(0, "#1668d6");
    hornGrad.addColorStop(0.45, "#2ab3e8");
    hornGrad.addColorStop(0.78, "#86d322");
    hornGrad.addColorStop(1, "#b8e62e");

    ctx.beginPath();
    ctx.moveTo(tx, oy);
    ctx.bezierCurveTo(tx + S * 0.10, oy - S * 0.012, ox - S * 0.10, oy - ry, ox, oy - ry);
    ctx.ellipse(ox, oy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
    ctx.bezierCurveTo(ox - S * 0.10, oy + ry, tx + S * 0.10, oy + S * 0.012, tx, oy);
    ctx.closePath();
    ctx.fillStyle = hornGrad;
    ctx.fill();
    ctx.strokeStyle = hornGrad;
    ctx.lineWidth = S * 0.006;
    ctx.stroke();

    // 开口内的同心圆环
    ctx.lineWidth = S * 0.007;
    const rings = [
      { dx: S * 0.012, k: 0.72 },
      { dx: S * 0.026, k: 0.52 },
      { dx: S * 0.040, k: 0.34 },
    ];
    for (const ring of rings) {
      ctx.beginPath();
      ctx.ellipse(ox + ring.dx, oy, rx * 0.85, ry * ring.k, 0, 0, Math.PI * 2);
      ctx.strokeStyle = hornGrad;
      ctx.stroke();
    }

    // ---- 文字 ----
    const tx2 = bcx + S * 0.025;
    ctx.fillStyle = "#f4fbfb";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    ctx.font = `bold ${Math.round(S * 0.118)}px 'Microsoft YaHei', 'PingFang SC', sans-serif`;
    ctx.fillText("浪尖儿", tx2, bcy - S * 0.082);

    ctx.font = `bold ${Math.round(S * 0.068)}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText("WavePeak", tx2, bcy + 0.004 * S);
    ctx.fillText("Elite", tx2, bcy + S * 0.078);

    ctx.restore();
  }

  function drawBackground() {
    drawFallbackBackground();
    drawWavepeakLogo();
  }

  function glow(color, blur = 12) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }

  function resetGlow() {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  function drawSteelCell(x, y) {
    ctx.fillStyle = "#24333a";
    ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
    ctx.strokeStyle = "#5f8893";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
    glow("rgba(71, 221, 226, 0.5)", 7);
    ctx.strokeStyle = "#73dfe4";
    ctx.strokeRect(x + 4, y + 4, CELL - 8, CELL - 8);
    resetGlow();
    ctx.fillStyle = "#7fd8dc";
    ctx.fillRect(x + 8, y + 8, 4, 4);
    ctx.fillRect(x + 18, y + 8, 4, 4);
    ctx.fillRect(x + 8, y + 18, 4, 4);
    ctx.fillRect(x + 18, y + 18, 4, 4);
  }

  function drawBrickCell(x, y) {
    ctx.fillStyle = "#7c3328";
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = "#4f1f19";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
    ctx.strokeStyle = "#c96d47";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 10);
    ctx.lineTo(x + CELL, y + 10);
    ctx.moveTo(x, y + 20);
    ctx.lineTo(x + CELL, y + 20);
    ctx.moveTo(x + 15, y);
    ctx.lineTo(x + 15, y + 10);
    ctx.moveTo(x + 7, y + 10);
    ctx.lineTo(x + 7, y + 20);
    ctx.moveTo(x + 22, y + 10);
    ctx.lineTo(x + 22, y + 20);
    ctx.stroke();
  }

  function drawObstacles() {
    for (let col = 0; col < COLS; col += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        const type = obstacleGrid[col][row];
        if (!type) continue;
        const x = col * CELL;
        const y = PLAY_Y + row * CELL;
        if (type === "steel") drawSteelCell(x, y);
        else drawBrickCell(x, y);
      }
    }
  }

  function drawTank(entity, bodyColor, glowColor, tankType) {
    if (!entity.alive) return;

    // 阵营预设：玩家→金色，友军→蓝色，敌人→红色系
    const presets = {
      player: { body: "#ffd166", glow: "#ff9f1a", ring: "rgba(255, 180, 60, 0.35)", label: "P" },
      ally:   { body: "#5bd7ff", glow: "#2aa8ff", ring: "rgba(91, 215, 255, 0.30)", label: "A" },
      enemy:  { body: bodyColor, glow: glowColor, ring: "rgba(255, 90, 60, 0.25)", label: "" },
    };
    const preset = presets[tankType] || presets.enemy;
    const isPlayer = tankType === "player";

    const nowMs = performance.now();
    const blink =
      isPlayer &&
      nowMs / 1000 < entity.invincibleUntil &&
      Math.floor(nowMs / 100) % 2 === 0;
    if (blink) return;

    const cx = entity.x + entity.w / 2;
    const cy = entity.y + entity.h / 2;
    const angle = DIRS[entity.dir].angle;
    const half = entity.w / 2;

    // 阵营色环（在坦克下方，作为阵营标识）
    if (tankType !== "enemy") {
      glow(preset.ring.replace(/[\d.]+\)/, "0.45)"), 10);
      ctx.strokeStyle = preset.ring;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, half + 4, 0, Math.PI * 2);
      ctx.stroke();
      resetGlow();
    } else {
      // 敌人：红色警示光圈
      glow("#ff5a3c", 8);
      ctx.strokeStyle = "rgba(255, 90, 60, 0.20)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, half + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      resetGlow();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.fillStyle = "#111c20";
    ctx.fillRect(-half, -half, entity.w, 7);
    ctx.fillRect(-half, half - 7, entity.w, 7);
    ctx.fillStyle = "#2b4148";
    for (let i = -6; i <= 6; i += 1) {
      ctx.fillRect(i * 4, -half, 3, 7);
      ctx.fillRect(i * 4, half - 7, 3, 7);
    }

    // 阵营配色渐变（中间深色区用阵营色调色）
    const bodyGradient = ctx.createLinearGradient(-half, -half, half, half);
    bodyGradient.addColorStop(0, preset.body);
    bodyGradient.addColorStop(0.42, "#0f1b20");
    bodyGradient.addColorStop(0.58, "#0f1b20");
    bodyGradient.addColorStop(1, preset.body);
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.moveTo(-half + 2, -half + 5);
    ctx.lineTo(half - 4, -half + 7);
    ctx.lineTo(half - 4, half - 7);
    ctx.lineTo(-half + 2, half - 5);
    ctx.closePath();
    ctx.fill();

    glow(preset.glow, 7);
    ctx.strokeStyle = preset.glow;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    resetGlow();

    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    ctx.fillRect(-half + 5, -half + 7, entity.w - 14, 3);

    glow(preset.glow, 12);
    ctx.fillStyle = "#17262b";
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = preset.glow;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    resetGlow();

    // 炮管
    ctx.fillStyle = "#d6e8e8";
    ctx.fillRect(4, -3, 16, 6);
    ctx.fillStyle = preset.glow;
    ctx.fillRect(16, -2, 8, 4);

    // 阵营标识：玩家→星形，友军→三角/箭头
    if (isPlayer) {
      // 玩家：炮塔顶部绘制闪烁星标
      glow(preset.glow, 10);
      ctx.fillStyle = "#fff0c0";
      ctx.beginPath();
      const starR = 4 + Math.sin(gameTime * 8) * 0.8;
      for (let i = 0; i < 5; i += 1) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const px = Math.cos(a) * starR;
        const py = Math.sin(a) * starR;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        const a2 = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a2) * starR * 0.45, Math.sin(a2) * starR * 0.45);
      }
      ctx.closePath();
      ctx.fill();
      resetGlow();
    } else if (tankType === "ally") {
      // 友军：炮塔顶部绘制三角箭头
      glow(preset.glow, 8);
      ctx.fillStyle = "#a8e8ff";
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4, 3);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fill();
      resetGlow();
    }

    ctx.restore();

    // 玩家护盾光环
    if (isPlayer && entity.shield > 0) {
      glow("#3ee0ff", 16);
      ctx.strokeStyle = `rgba(62, 224, 255, ${0.55 + Math.sin(gameTime * 6) * 0.25})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, half + 8 + Math.sin(gameTime * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
      resetGlow();
    }

    // 玩家名称标签
    if (isPlayer) {
      ctx.fillStyle = "#ffe8a0";
      ctx.font = "bold 9px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("玩家", cx, entity.y - 2);
    } else if (tankType === "ally") {
      ctx.fillStyle = "#b8ecff";
      ctx.font = "bold 9px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("友军", cx, entity.y - 2);
    }
  }

  function drawEnemyDetails(enemy) {
    if (enemy.shieldHp > 0) {
      glow("#55e6d2", 12);
      ctx.strokeStyle = "rgba(85, 230, 210, 0.85)";
      ctx.lineWidth = 2;
      const cx = enemy.x + enemy.w / 2;
      const cy = enemy.y + enemy.h / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, enemy.w / 2 + 6, 0, Math.PI * 2);
      ctx.stroke();
      resetGlow();
    }

    if (enemy.stun > 0) {
      glow("#7fe9ff", 8);
      ctx.strokeStyle = "rgba(127, 233, 255, 0.8)";
      ctx.lineWidth = 2;
      const cx = enemy.x + enemy.w / 2;
      const cy = enemy.y + enemy.h / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, enemy.w / 2 + 5, 0, Math.PI * 2);
      ctx.stroke();
      resetGlow();
    }

    if (enemy.hp < enemy.maxHp) {
      const width = enemy.w;
      const ratio = enemy.hp / enemy.maxHp;
      ctx.fillStyle = "#2a1414";
      ctx.fillRect(enemy.x, enemy.y - 8, width, 4);
      ctx.fillStyle = enemy.glow;
      ctx.fillRect(enemy.x, enemy.y - 8, width * ratio, 4);
    }
  }

  function drawBase() {
    const base = getBaseRect();
    const cx = base.x + base.w / 2;
    const cy = base.y + base.h / 2;

    if (baseAlive) {
      ctx.fillStyle = "#20363b";
      ctx.fillRect(base.x, base.y, base.w, base.h);
      glow("#35d4dc", 12);
      ctx.strokeStyle = "#5fe0e5";
      ctx.lineWidth = 2;
      ctx.strokeRect(base.x + 2, base.y + 2, base.w - 4, base.h - 4);
      resetGlow();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(gameTime * 0.8);
      ctx.fillStyle = "#8decf0";
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI * 2 * i) / 6;
        const px = Math.cos(a) * 10;
        const py = Math.sin(a) * 10;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(8, 20, 24, 0.72)";
      ctx.fillRect(base.x - 2, base.y - 19, base.w + 4, 4);
      ctx.fillStyle = "#5fe0e5";
      ctx.fillRect(base.x - 2, base.y - 19, (base.w + 4) * (baseHp / baseMaxHp), 4);
      ctx.fillStyle = "#d5f7f7";
      ctx.font = "bold 10px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("基地", cx, base.y - 28);
    } else {
      ctx.fillStyle = "#2d2622";
      ctx.fillRect(base.x, base.y, base.w, base.h);
      ctx.strokeStyle = "#6d4a3c";
      ctx.lineWidth = 2;
      ctx.strokeRect(base.x + 2, base.y + 2, base.w - 4, base.h - 4);
      ctx.beginPath();
      ctx.strokeStyle = "#ff5a42";
      ctx.moveTo(base.x + 6, base.y + 6);
      ctx.lineTo(base.x + base.w - 6, base.y + base.h - 6);
      ctx.moveTo(base.x + base.w - 6, base.y + 6);
      ctx.lineTo(base.x + 6, base.y + base.h - 6);
      ctx.stroke();
    }
  }

  function drawBullets() {
    for (const bullet of bullets) {
      const cx = bullet.x + bullet.radius;
      const cy = bullet.y + bullet.radius;
      const angle = Math.atan2(bullet.vy, bullet.vx);

      glow(bullet.glow, 14);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = bullet.color;
      if (bullet.explosive) {
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff0b0";
        ctx.fillRect(-4, -1, 8, 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-bullet.radius * 2.3, -1, bullet.radius * 2.2, 2);
      }
      ctx.restore();
      resetGlow();
    }
  }

  function drawParticles() {
    for (const particle of particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      if (particle.type === "glow") {
        glow(particle.color, 6);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        resetGlow();
      } else if (particle.type === "smoke") {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawShockwaves() {
    for (const wave of shockwaves) {
      const progress = 1 - wave.life / wave.maxLife;
      const radius = lerp(wave.radius, wave.maxRadius, progress);
      ctx.globalAlpha = clamp(wave.life / wave.maxLife, 0, 1);
      glow(wave.color, 12);
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      resetGlow();
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups() {
    for (const pickup of pickups) {
      const def = PROP_TYPES[pickup.type];
      const cx = pickup.x + CELL / 2;
      const cy = pickup.y + CELL / 2;
      const pulse = 1 + Math.sin(pickup.phase) * 0.08;
      const alpha = pickup.life < 3 ? 0.45 + 0.35 * Math.sin(pickup.phase * 2) : 1;

      ctx.globalAlpha = alpha;
      glow(def.glow, 14);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI * 2 * i) / 6 + pickup.phase * 0.2;
        const px = cx + Math.cos(a) * 11 * pulse;
        const py = cy + Math.sin(a) * 11 * pulse;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      resetGlow();

      ctx.fillStyle = "#081317";
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(def.label, cx, cy + 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloatTexts() {
    for (const text of floatTexts) {
      ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1);
      glow(text.color, 7);
      ctx.fillStyle = text.color;
      ctx.font = "bold 15px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text.text, text.x, text.y);
      resetGlow();
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    ctx.fillStyle = "rgba(3, 14, 18, 0.88)";
    ctx.fillRect(0, 0, W, HUD_H);

    ctx.strokeStyle = "rgba(50, 211, 224, 0.3)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 4);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(50, 211, 224, 0.75)";
    ctx.fillRect(0, HUD_H - 2, W, 1);

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 17px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.fillStyle = "#a5f4f6";
    ctx.fillText("STR // TANK OPS", 14, HUD_H / 2);

    ctx.font = "14px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(`得分 ${score}`, 268, HUD_H / 2);
    ctx.fillStyle = "#ff8f82";
    ctx.fillText(`敌军 ${Math.max(0, enemiesRemaining)}`, 430, HUD_H / 2);
    ctx.fillStyle = "#c6e7c6";
    ctx.fillText("生命", 680, HUD_H / 2);

    for (let i = 0; i < lives; i += 1) {
      ctx.fillStyle = "#56cf74";
      ctx.fillRect(720 + i * 23, 15, 17, 10);
      ctx.fillStyle = "#183b22";
      ctx.fillRect(720 + i * 23, 14, 17, 3);
      ctx.fillRect(720 + i * 23, 21, 17, 3);
    }

    let effectX = 800;
    const drawEffect = (label, color) => {
      if (effectX > W - 50) return;
      glow(color, 6);
      ctx.fillStyle = color;
      ctx.fillRect(effectX, 13, 18, 14);
      resetGlow();
      ctx.fillStyle = "#061014";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, effectX + 9, 20);
      effectX += 24;
    };
    if (player) {
      if (player.shield > 0) drawEffect("S", "#4bd9ff");
      if (player.rapid > 0) drawEffect("R", "#ffd166");
      if (player.triple > 0) drawEffect("T", "#c792ff");
      if (player.speedBoost > 0) drawEffect("M", "#75ffd9");
      if (player.power > 0) drawEffect("P", "#ffb35f");
      if (player.drone > 0) drawEffect("D", "#a8a0ff");
      if (slowTimer > 0) drawEffect("Z", "#9fd7ff");
    }
  }

  function drawSkills() {
    const ids = Object.keys(SKILLS);
    const startX = 12;
    const y = H - 38;
    const slot = 36;

    ctx.fillStyle = "rgba(3, 14, 18, 0.62)";
    ctx.fillRect(startX - 8, y - 8, ids.length * slot + 14, 46);

    ids.forEach((id, index) => {
      const def = SKILLS[id];
      const x = startX + index * slot;
      const unlocked = unlockedSkills.includes(id);
      const cd = skillCooldowns[id] || 0;
      const ratio = def.cooldown > 0 ? clamp(cd / def.cooldown, 0, 1) : 0;

      ctx.fillStyle = unlocked ? "#14282d" : "#0b1417";
      ctx.fillRect(x, y, 30, 30);
      ctx.strokeStyle = unlocked ? def.color : "rgba(140, 160, 160, 0.25)";
      ctx.lineWidth = unlocked ? 1.5 : 1;
      ctx.strokeRect(x, y, 30, 30);

      if (unlocked) {
        glow(def.color, 6);
        ctx.fillStyle = def.color;
        ctx.font = "bold 12px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(index + 1), x + 15, y + 15);
        resetGlow();
      } else {
        ctx.fillStyle = "rgba(140, 160, 160, 0.35)";
        ctx.font = "bold 16px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", x + 15, y + 15);
      }

      if (unlocked && cd > 0) {
        ctx.fillStyle = "rgba(4, 10, 12, 0.72)";
        ctx.fillRect(x, y + 30 * (1 - ratio), 30, 30 * ratio);
      }
    });

    if (unlockedSkills.length < MAX_SKILLS) {
      const progress = clamp(1 - skillUnlockTimer / SKILL_UNLOCK_INTERVAL, 0, 1);
      ctx.fillStyle = "rgba(140, 170, 170, 0.28)";
      ctx.fillRect(startX, y + 38, ids.length * slot - 6, 3);
      ctx.fillStyle = "#5fe0e5";
      ctx.fillRect(startX, y + 38, (ids.length * slot - 6) * progress, 3);
    }
  }

  function drawBorder() {
    glow("#2fd3df", 7);
    ctx.strokeStyle = "rgba(68, 225, 231, 0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, PLAY_Y + 1, W - 2, H - PLAY_Y - 2);
    resetGlow();

    ctx.fillStyle = "rgba(68, 225, 231, 0.45)";
    const pulse = 0.6 + Math.sin(gameTime * 2.2) * 0.25;
    ctx.fillRect(0, PLAY_Y + 12, 5, 24);
    ctx.fillRect(W - 5, PLAY_Y + H - 36, 5, 24);
    ctx.globalAlpha = pulse;
    ctx.fillRect(W - 5, PLAY_Y + 12, 5, 24);
    ctx.fillRect(0, PLAY_Y + H - 36, 5, 24);
    ctx.globalAlpha = 1;
  }

  function drawScanlines() {
    ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 1);
    }
  }

  function drawOverlay(title, subtitle, hint, color = "#eaf6ea") {
    ctx.fillStyle = "rgba(2, 11, 14, 0.76)";
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    glow(color, 20);
    ctx.fillStyle = color;
    ctx.font = "bold 54px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.fillText(title, W / 2, H / 2 - 54);
    resetGlow();

    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 28px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.fillText(subtitle, W / 2, H / 2 - 8);
    ctx.fillStyle = "#c8dcdd";
    ctx.font = "16px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.fillText(hint, W / 2, H / 2 + 46);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) {
      const sx = (Math.random() - 0.5) * shake;
      const sy = (Math.random() - 0.5) * shake;
      ctx.translate(sx, sy);
    }

    drawBackground();
    drawBorder();
    drawObstacles();
    drawBase();
    drawPickups();

    if (player) drawTank(player, "#ffd166", "#ff9f1a", "player");
    allies.forEach((ally) => {
      if (ally.alive) {
        drawTank(ally, ally.hitFlash > 0 ? "#fff0b0" : ally.color, ally.glow, "ally");
        if (ally.hp < ally.maxHp) {
          const ratio = ally.hp / ally.maxHp;
          ctx.fillStyle = "#14231c";
          ctx.fillRect(ally.x, ally.y - 8, ally.w, 4);
          ctx.fillStyle = ally.glow;
          ctx.fillRect(ally.x, ally.y - 8, ally.w * ratio, 4);
        }
      }
    });
    enemies.forEach((enemy) => {
      if (enemy.alive) {
        drawTank(enemy, enemy.hitFlash > 0 ? "#fff0b0" : enemy.color, enemy.glow, "enemy");
        drawEnemyDetails(enemy);
      }
    });

    drawBullets();
    drawShockwaves();
    drawParticles();
    drawFloatTexts();
    drawScanlines();
    ctx.restore();

    drawHud();
    drawSkills();

    if (state === "menu") {
      drawOverlay("坦克大战", "S T R // NEON OPS", "点击或按 Enter 开始", "#a5f4f6");
    } else if (state === "paused") {
      drawOverlay("已暂停", "战术系统待命", "按 P 继续", "#c8dcdd");
    } else if (state === "win") {
      drawOverlay("胜利", "基地安全", "按 R 或点击重新开始", "#ffe28a");
    } else if (state === "gameover") {
      drawOverlay("任务失败", "基地失守", "按 R 或点击重新开始", "#ff9d8f");
    }
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    if (state === "playing") update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (event) => {
    audio.init();
    keys[event.code] = true;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }

    const skillByCode = {
      Digit1: "strike",
      Digit2: "shield",
      Digit3: "emp",
      Digit4: "barrage",
      Digit5: "overclock",
    };
    if (state === "playing" && skillByCode[event.code]) {
      useSkill(skillByCode[event.code]);
      event.preventDefault();
    }

    if (event.code === "Enter") {
      if (state === "menu" || state === "win" || state === "gameover") resetGame();
    } else if (event.code === "KeyP") {
      if (state === "playing") state = "paused";
      else if (state === "paused") state = "playing";
    } else if (event.code === "KeyR") {
      if (state !== "menu") resetGame();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys[event.code] = false;
  });

  window.addEventListener("blur", () => {
    keys = {};
  });

  canvas.addEventListener("pointerdown", () => {
    audio.init();
    if (state === "menu" || state === "win" || state === "gameover") resetGame();
    else if (state === "paused") state = "playing";
  });

  resetObstacles();
  requestAnimationFrame(frame);
})();
