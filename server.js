// 贪食蛇游戏后端服务
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// 会话密钥：优先使用环境变量，本地默认值仅供开发
const SESSION_SECRET = process.env.SESSION_SECRET || 'snake-dev-secret-change-me';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    name: 'snake.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Railway 使用 https 反向代理，生产环境开启 secure
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 天
    }
  })
);

// 静态资源
app.use(express.static(path.join(__dirname, 'public')));

// 数据库就绪状态：未就绪时 /api/* 返回 503，页面照常可访问便于排查
let dbReady = false;
app.use('/api/', (req, res, next) => {
  if (!dbReady) {
    return res.status(503).json({ error: '数据库尚未就绪，请稍后再试或查看日志' });
  }
  next();
});

// 简单中间件：要求登录
function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '未登录' });
  }
  next();
}

// 手机号校验：11 位数字
function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

// ============ 接口 ============

// 注册
app.post('/api/register', async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ error: '手机号和密码不能为空' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: '手机号格式不正确' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users(phone, password_hash) VALUES($1, $2) RETURNING id, phone',
      [phone, hash]
    );
    const user = result.rows[0];
    req.session.userId = user.id;
    req.session.phone = user.phone;
    return res.json({ ok: true, user: { id: user.id, phone: user.phone } });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(400).json({ error: '该手机号已注册' });
    }
    console.error('注册失败:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// 登录
app.post('/api/login', async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ error: '手机号和密码不能为空' });
  }
  try {
    const result = await pool.query(
      'SELECT id, phone, password_hash FROM users WHERE phone = $1',
      [phone]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: '用户不存在或密码错误' });
    }
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(400).json({ error: '用户不存在或密码错误' });
    }
    req.session.userId = user.id;
    req.session.phone = user.phone;
    return res.json({ ok: true, user: { id: user.id, phone: user.phone } });
  } catch (err) {
    console.error('登录失败:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// 退出
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('snake.sid');
    res.json({ ok: true });
  });
});

// 当前登录状态
app.get('/api/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ loggedIn: false });
  }
  try {
    const r = await pool.query(
      `SELECT u.id, u.phone,
        COALESCE(MAX(CASE WHEN s.difficulty='easy' THEN s.score END), 0) AS best_easy,
        COALESCE(MAX(CASE WHEN s.difficulty='hard' THEN s.score END), 0) AS best_hard
       FROM users u
       LEFT JOIN scores s ON s.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [req.session.userId]
    );
    if (r.rows.length === 0) {
      return res.json({ loggedIn: false });
    }
    const row = r.rows[0];
    return res.json({
      loggedIn: true,
      user: {
        id: row.id,
        phone: row.phone,
        bestEasy: Number(row.best_easy) || 0,
        bestHard: Number(row.best_hard) || 0
      }
    });
  } catch (err) {
    console.error('获取用户信息失败:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// 提交分数
app.post('/api/score', requireLogin, async (req, res) => {
  const { score, difficulty } = req.body || {};
  const validDiff = ['easy', 'hard'];
  if (typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: '分数无效' });
  }
  if (!validDiff.includes(difficulty)) {
    return res.status(400).json({ error: '难度无效' });
  }
  try {
    const userId = req.session.userId;
    // 仅在超过历史最高时插入新记录（保留历史也可，这里只更新最高分）
    const prev = await pool.query(
      `SELECT MAX(score) AS best FROM scores WHERE user_id=$1 AND difficulty=$2`,
      [userId, difficulty]
    );
    const prevBest = prev.rows[0].best ? Number(prev.rows[0].best) : 0;
    let isRecord = false;
    if (score > prevBest) {
      // 删除旧记录，只保留该难度最高分
      await pool.query(
        'DELETE FROM scores WHERE user_id=$1 AND difficulty=$2',
        [userId, difficulty]
      );
      await pool.query(
        'INSERT INTO scores(user_id, score, difficulty) VALUES($1, $2, $3)',
        [userId, score, difficulty]
      );
      isRecord = true;
    }
    return res.json({ ok: true, isRecord, best: Math.max(prevBest, score) });
  } catch (err) {
    console.error('提交分数失败:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// 排行榜：每难度 Top 50
app.get('/api/ranking', async (req, res) => {
  try {
    const easy = await pool.query(
      `SELECT u.id, u.phone, s.score, s.created_at
       FROM scores s JOIN users u ON u.id = s.user_id
       WHERE s.difficulty = 'easy'
       ORDER BY s.score DESC, s.created_at ASC
       LIMIT 50`
    );
    const hard = await pool.query(
      `SELECT u.id, u.phone, s.score, s.created_at
       FROM scores s JOIN users u ON u.id = s.user_id
       WHERE s.difficulty = 'hard'
       ORDER BY s.score DESC, s.created_at ASC
       LIMIT 50`
    );
    // 手机号脱敏：138****1234
    const mask = (p) => p ? p.slice(0, 3) + '****' + p.slice(-4) : '';
    const fmt = (rows) => rows.map((r, i) => ({
      rank: i + 1,
      phone: mask(r.phone),
      score: Number(r.score)
    }));
    return res.json({
      easy: fmt(easy.rows),
      hard: fmt(hard.rows)
    });
  } catch (err) {
    console.error('获取排行榜失败:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// 前端页面路由（直接访问也返回 index，由前端处理跳转）
app.get(['/', '/game', '/ranking'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动：先开 HTTP 服务（保证 Railway 健康检查通过、页面可访问），再异步连数据库
app.listen(PORT, () => {
  console.log(`HTTP 服务已启动: http://localhost:${PORT}`);
  initDB()
    .then(() => {
      dbReady = true;
      console.log('数据库已就绪，所有接口可用');
    })
    .catch((err) => {
      console.error('数据库初始化失败，HTTP 仍在运行，但 /api/* 不可用:', err.message || err);
    });
});
