// 排行榜模块
(function () {
  const $ = (id) => document.getElementById(id);
  const rankBody = $('rankBody');
  const tabs = document.querySelectorAll('.rank-tabs button');

  let currentTab = 'easy';
  let cached = { easy: [], hard: [] };

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.rank;
      render();
    });
  });

  async function loadRanking() {
    try {
      const res = await fetch('/api/ranking');
      const data = await res.json();
      cached.easy = data.easy || [];
      cached.hard = data.hard || [];
      render();
    } catch {
      rankBody.innerHTML = '<tr><td colspan="3" class="empty">加载失败，请稍后重试</td></tr>';
    }
  }

  function render() {
    const list = cached[currentTab];
    const user = window.App && window.App.currentUser;
    const myMaskedPhone = user ? window.App.maskPhone(user.phone) : null;

    if (!list || list.length === 0) {
      rankBody.innerHTML = '<tr><td colspan="3" class="empty">暂无记录，去打个榜吧 🎮</td></tr>';
      return;
    }
    rankBody.innerHTML = list.map((row) => {
      const me = myMaskedPhone && row.phone === myMaskedPhone ? 'me' : '';
      return `<tr class="${me}">
        <td class="rank-cell">${row.rank}</td>
        <td>${row.phone}</td>
        <td style="text-align:right; font-weight:700">${row.score}</td>
      </tr>`;
    }).join('');
  }

  window.loadRanking = loadRanking;
})();
