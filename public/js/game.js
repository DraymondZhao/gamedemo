// 贪食蛇游戏逻辑
(function () {
  const $ = (id) => document.getElementById(id);

  const difficultyBox = $('difficultyBox');
  const gameWrap = $('gameWrap');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const mask = $('gameMask');
  const maskTitle = $('maskTitle');
  const maskBody = $('maskBody');
  const maskBtn = $('maskBtn');
  const startBtn = $('startBtn');
  const hudDiff = $('hudDiff');
  const hudScore = $('hudScore');
  const hudBest = $('hudBest');

  const DIFF = {
    easy: { speed: 150, name: '简单' },
    hard: { speed: 80, name: '困难' }
  };

  const GRID = 24;           // 格子数
  const CELL = canvas.width / GRID; // 单元格像素
  const COLORS = {
    bg: '#0a1410',
    grid: '#102017',
    head: '#86efac',
    body: '#22c55e',
    food: '#fbbf24',
    foodEdge: '#f59e0b'
  };

  let selectedDiff = null;
  let snake = [];
  let dir = { x: 1, y: 0 };
  let nextDir = { x: 1, y: 0 };
  let food = { x: 0, y: 0 };
  let score = 0;
  let best = 0;
  let timer = null;
  let running = false;
  let gameOver = false;

  // ============ 难度选择 ============
  document.querySelectorAll('.diff').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.diff').forEach((d) => d.classList.remove('selected'));
      el.classList.add('selected');
      selectedDiff = el.dataset.diff;
      startBtn.disabled = false;
      startBtn.textContent = '开始游戏 · ' + DIFF[selectedDiff].name;
    });
  });

  startBtn.addEventListener('click', () => {
    if (!selectedDiff) return;
    enterGame(selectedDiff);
  });

  function enterGame(diff) {
    difficultyBox.style.display = 'none';
    gameWrap.style.display = '';
    hudDiff.textContent = DIFF[diff].name;
    const user = window.App && window.App.currentUser;
    best = user ? (diff === 'easy' ? user.bestEasy : user.bestHard) || 0 : 0;
    hudBest.textContent = best;
    resetGame();
    showMask('准备开始', '点击下方按钮开始', '开始', startGame);
  }

  function exitToDifficulty() {
    if (timer) { clearInterval(timer); timer = null; }
    running = false;
    gameWrap.style.display = 'none';
    difficultyBox.style.display = '';
  }

  // ============ 游戏状态 ============
  function resetGame() {
    const mid = Math.floor(GRID / 2);
    snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid }
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    gameOver = false;
    hudScore.textContent = score;
    spawnFood();
    draw();
  }

  function spawnFood() {
    const free = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    if (free.length === 0) {
      // 通关
      food = null;
      return;
    }
    food = free[Math.floor(Math.random() * free.length)];
  }

  function startGame() {
    if (running) return;
    if (gameOver) resetGame();
    running = true;
    mask.style.display = 'none';
    timer = setInterval(tick, DIFF[selectedDiff].speed);
  }

  function tick() {
    // 应用方向变更
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // 撞墙
    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
      return endGame();
    }
    // 撞自己
    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      return endGame();
    }

    snake.unshift(head);
    if (food && head.x === food.x && head.y === food.y) {
      score += selectedDiff === 'hard' ? 3 : 1;
      hudScore.textContent = score;
      spawnFood();
    } else {
      snake.pop();
    }
    draw();

    if (!food) return endGame(true);
  }

  function endGame(win) {
    running = false;
    gameOver = true;
    if (timer) { clearInterval(timer); timer = null; }
    const isRecord = score > best;
    if (isRecord) best = score;
    hudBest.textContent = best;

    // 提交分数到后端
    submitScore(selectedDiff, score).then((data) => {
      const realRecord = data && data.isRecord;
      let body = `<div class="score-big">${score}</div>`;
      if (realRecord) body += `<div class="badge">🎉 刷新了你的最高分！</div>`;
      else body += `<div style="color:var(--muted); font-size:13px">个人最高：${data && data.best != null ? data.best : best}</div>`;
      showMask(win ? '通关啦！' : '游戏结束', body, '再玩一次', startGame);
      if (window.App) window.App.refreshMe();
    }).catch(() => {
      showMask(win ? '通关啦！' : '游戏结束',
        `<div class="score-big">${score}</div>`,
        '再玩一次', startGame);
    });
  }

  async function submitScore(difficulty, sc) {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: sc, difficulty })
    });
    return res.json();
  }

  function showMask(title, bodyHtml, btnText, onClick) {
    maskTitle.textContent = title;
    maskBody.innerHTML = bodyHtml;
    maskBtn.textContent = btnText;
    mask.style.display = '';
    maskBtn.onclick = onClick;
  }

  // ============ 渲染 ============
  function draw() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 网格
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL); ctx.lineTo(canvas.width, i * CELL); ctx.stroke();
    }

    // 食物
    if (food) {
      ctx.fillStyle = COLORS.food;
      ctx.strokeStyle = COLORS.foodEdge;
      ctx.lineWidth = 2;
      const pad = 3;
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - pad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 蛇身
    snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? COLORS.head : COLORS.body;
      const pad = 1;
      roundRect(seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 5);
      ctx.fill();
    });
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ============ 输入 ============
  function setDir(nx, ny) {
    // 不允许直接反向
    if (nx === -dir.x && ny === -dir.y) return;
    if (nx === dir.x && ny === dir.y) return;
    nextDir = { x: nx, y: ny };
  }

  window.addEventListener('keydown', (e) => {
    // 仅当游戏视图可见时响应
    if (gameWrap.style.display === 'none') return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'w'].includes(k)) { e.preventDefault(); setDir(0, -1); }
    else if (['arrowdown', 's'].includes(k)) { e.preventDefault(); setDir(0, 1); }
    else if (['arrowleft', 'a'].includes(k)) { e.preventDefault(); setDir(-1, 0); }
    else if (['arrowright', 'd'].includes(k)) { e.preventDefault(); setDir(1, 0); }
    else if (k === ' ' && !running) { e.preventDefault(); startGame(); }
  }, { passive: false });

  // 移动端滑动
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) { touchStart = null; return; }
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
    touchStart = null;
  }, { passive: true });

  // 进入游戏视图时重置难度选择面板
  window.addEventListener('hashchange', () => {
    if (location.hash.replace(/^#\/?/, '') === 'game') {
      if (timer) { clearInterval(timer); timer = null; }
      running = false;
      gameOver = false;
      selectedDiff = null;
      document.querySelectorAll('.diff').forEach((d) => d.classList.remove('selected'));
      startBtn.disabled = true;
      startBtn.textContent = '选择难度后开始';
      difficultyBox.style.display = '';
      gameWrap.style.display = 'none';
    }
  });
})();
