// 认证与页面路由（单页应用）
(function () {
  const $ = (id) => document.getElementById(id);

  const views = {
    auth: $('view-auth'),
    home: $('view-home'),
    game: $('view-game'),
    ranking: $('view-ranking')
  };

  const topbar = $('topbar');
  const userLabel = $('userLabel');
  const welcomePhone = $('welcomePhone');
  const bestEasyEl = $('bestEasy');
  const bestHardEl = $('bestHard');

  let currentUser = null;

  // ============ 视图切换 ============
  function showView(name) {
    Object.keys(views).forEach((k) => {
      views[k].style.display = k === name ? '' : 'none';
    });
    topbar.style.display = name === 'auth' ? 'none' : '';
    window.scrollTo(0, 0);
  }

  function routeFromHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (!currentUser) {
      showView('auth');
      return;
    }
    if (h === 'game') showView('game');
    else if (h === 'ranking') {
      showView('ranking');
      if (window.loadRanking) window.loadRanking();
    } else showView('home');
  }

  // ============ 登录态 ============
  async function refreshMe() {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      if (data.loggedIn) {
        currentUser = data.user;
        userLabel.textContent = '手机 ' + maskPhone(currentUser.phone);
        welcomePhone.textContent = maskPhone(currentUser.phone);
        bestEasyEl.textContent = currentUser.bestEasy || 0;
        bestHardEl.textContent = currentUser.bestHard || 0;
        return true;
      }
      currentUser = null;
      return false;
    } catch (err) {
      console.error('refreshMe 失败:', err);
      currentUser = null;
      return false;
    }
  }

  function maskPhone(p) {
    return p ? p.slice(0, 3) + '****' + p.slice(-4) : '';
  }

  // ============ 表单 ============
  const tabs = document.querySelectorAll('.tabs button');
  const loginForm = $('loginForm');
  const registerForm = $('registerForm');
  const alertBox = $('authAlert');

  function setAlert(type, msg) {
    alertBox.textContent = msg;
    alertBox.className = 'alert show ' + type;
  }
  function clearAlert() {
    alertBox.className = 'alert';
    alertBox.textContent = '';
  }

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      clearAlert();
      tabs.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      loginForm.style.display = tab === 'login' ? '' : 'none';
      registerForm.style.display = tab === 'register' ? '' : 'none';
    });
  });

  async function postJSON(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const txt = await res.text();
        try {
          const obj = JSON.parse(txt);
          return obj;
        } catch {
          return { error: '服务器错误（' + res.status + '）' };
        }
      }
      return res.json();
    } catch (err) {
      return { error: '网络请求失败：' + (err.message || err) };
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    const phone = $('loginPhone').value.trim();
    const password = $('loginPassword').value;
    if (!phone || !password) return setAlert('error', '请填写手机号和密码');
    const data = await postJSON('/api/login', { phone, password });
    if (data.error) return setAlert('error', data.error);
    await refreshMe();
    location.hash = '#/';
    routeFromHash();
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    const phone = $('regPhone').value.trim();
    const password = $('regPassword').value;
    const password2 = $('regPassword2').value;
    if (!phone || !password) return setAlert('error', '请填写手机号和密码');
    if (password !== password2) return setAlert('error', '两次密码不一致');
    const data = await postJSON('/api/register', { phone, password });
    if (data.error) return setAlert('error', data.error);
    setAlert('success', '注册成功，已自动登录');
    await refreshMe();
    setTimeout(() => {
      location.hash = '#/';
      routeFromHash();
    }, 500);
  });

  $('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null;
    location.hash = '#/';
    showView('auth');
  });

  // 导航跳转
  $('goGame').addEventListener('click', (e) => {
    e.preventDefault();
    location.hash = '#/game';
  });
  $('goRank').addEventListener('click', (e) => {
    e.preventDefault();
    location.hash = '#/ranking';
  });

  // ============ 暴露给其他模块 ============
  window.App = {
    get currentUser() { return currentUser; },
    refreshMe,
    maskPhone,
    showView
  };

  // ============ 启动 ============
  window.addEventListener('hashchange', routeFromHash);
  (async function init() {
    const ok = await refreshMe();
    if (ok) routeFromHash();
    else showView('auth');
  })();
})();
