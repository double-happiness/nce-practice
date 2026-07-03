'use strict';
// 学习计划 / 打卡 / 连续天数 / 趋势图 功能模块（前端）
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;
  const esc = NCE.escapeHtml;

  // ---- 注入样式（前缀 pln- 避免冲突）----
  const style = document.createElement('style');
  style.textContent = `
    .pln-wrap{max-width:760px;margin:0 auto}
    .pln-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:12px}
    .pln-head h2{margin:0;font-size:20px}
    .pln-card{border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-top:14px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
    .pln-card h3{margin:0 0 12px;font-size:15px;color:#374151}
    .pln-streak{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
    .pln-fire{font-size:44px;line-height:1}
    .pln-streak-n{font-size:38px;font-weight:800;color:#f97316;line-height:1}
    .pln-streak-txt{color:#6b7280;font-size:14px}
    .pln-bar-wrap{margin-top:14px}
    .pln-bar-top{display:flex;justify-content:space-between;font-size:13px;color:#6b7280;margin-bottom:6px}
    .pln-bar{height:14px;background:#f1f5f9;border-radius:8px;overflow:hidden}
    .pln-bar-fill{height:100%;background:linear-gradient(90deg,#34d399,#059669);border-radius:8px;transition:width .4s}
    .pln-done{color:#059669;font-weight:700;margin-top:8px}
    .pln-todo{color:#d97706;font-weight:600;margin-top:8px}
    .pln-tasks{list-style:none;padding:0;margin:0}
    .pln-tasks li{padding:8px 0;font-size:15px;border-bottom:1px solid #f3f4f6;color:#374151}
    .pln-tasks li:last-child{border-bottom:0}
    .pln-tasks .box{display:inline-block;width:20px}
    .pln-heat{display:grid;grid-template-columns:repeat(10,1fr);gap:5px}
    .pln-cell{aspect-ratio:1;border-radius:3px;background:#ebedf0}
    .pln-cell[data-l="1"]{background:#c6e48b}
    .pln-cell[data-l="2"]{background:#7bc96f}
    .pln-cell[data-l="3"]{background:#239a3b}
    .pln-cell[data-l="4"]{background:#196127}
    .pln-legend{display:flex;align-items:center;gap:6px;justify-content:flex-end;margin-top:10px;font-size:12px;color:#9ca3af}
    .pln-legend .pln-cell{width:13px;height:13px;aspect-ratio:auto}
    .pln-trend{width:100%;height:120px;display:block}
    .pln-trend-empty{color:#9ca3af;font-size:14px;padding:20px 0;text-align:center}
    .pln-goal-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .pln-input{width:90px;padding:9px 12px;font-size:15px;border:1px solid #d1d5db;border-radius:8px}
    .pln-btn{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:9px 18px;font-size:15px;cursor:pointer}
    .pln-btn:hover{background:#1d4ed8}
    .pln-btn:disabled{background:#9ca3af;cursor:not-allowed}
    .pln-msg{color:#059669;font-size:13px}
    .pln-note{color:#666;font-size:13px;line-height:1.6;background:#f5f7fa;border-radius:8px;padding:10px 14px}
    .pln-fb{padding:12px 14px;border-radius:8px;font-size:14px;background:#fef2f2;border:1px solid #fecaca}
  `;
  document.head.appendChild(style);

  // count -> 热力等级 0..4
  function heatLevel(c) {
    if (!c) return 0;
    if (c < 3) return 1;
    if (c < 6) return 2;
    if (c < 10) return 3;
    return 4;
  }

  // 折线趋势图（内联 SVG，取最近有记录的若干天正确率）
  function renderTrend(calendar) {
    const days = calendar.filter((d) => d.count > 0);
    const recent = days.slice(-14);
    if (recent.length < 2) {
      return '<div class="pln-trend-empty">积累 2 天以上的作答记录后，这里会显示正确率趋势📈</div>';
    }
    const W = 700, H = 120, padL = 30, padR = 10, padT = 12, padB = 22;
    const iw = W - padL - padR, ih = H - padT - padB;
    const n = recent.length;
    const x = (i) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => padT + (1 - v / 100) * ih;
    let pts = recent.map((d, i) => `${x(i).toFixed(1)},${y(d.accuracy).toFixed(1)}`).join(' ');
    let dots = recent
      .map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.accuracy).toFixed(1)}" r="3" fill="#2563eb"><title>${esc(d.date)}：正确率 ${d.accuracy}%（${d.count} 题）</title></circle>`)
      .join('');
    // 参考网格线 0/50/100
    const grid = [0, 50, 100]
      .map((v) => `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}" stroke="#eef2f7"/><text x="0" y="${(y(v) + 4).toFixed(1)}" font-size="10" fill="#9ca3af">${v}</text>`)
      .join('');
    return (
      `<svg class="pln-trend" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
      grid +
      `<polyline points="${pts}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>` +
      dots +
      '</svg>'
    );
  }

  async function renderHome(panel) {
    panel.innerHTML = '<div class="pln-wrap"><div class="pln-note">加载中…</div></div>';
    let d;
    try {
      d = await NCE.api('/api/plan/overview');
    } catch (e) {
      panel.innerHTML = '<div class="pln-wrap"><div class="pln-fb">加载失败，请稍后重试。</div></div>';
      return;
    }

    const goal = d.goal || 10;
    const todayCount = d.todayCount || 0;
    const pct = Math.min(100, goal ? Math.round((todayCount / goal) * 100) : 0);
    const done = todayCount >= goal;
    const remain = Math.max(0, goal - todayCount);

    // 打卡区
    const streakCard =
      '<div class="pln-card"><div class="pln-streak">' +
      '<span class="pln-fire">🔥</span>' +
      `<div><div class="pln-streak-n">连续 ${d.streak} 天</div>` +
      `<div class="pln-streak-txt">累计打卡 ${d.totalDays} 天 · 今日正确率 ${d.todayAccuracy}%</div></div></div>` +
      '<div class="pln-bar-wrap">' +
      `<div class="pln-bar-top"><span>今日进度</span><span>${todayCount} / ${goal} 次</span></div>` +
      `<div class="pln-bar"><div class="pln-bar-fill" style="width:${pct}%"></div></div>` +
      (done
        ? '<div class="pln-done">今日已完成 ✓</div>'
        : `<div class="pln-todo">还差 ${remain} 次达成今日目标</div>`) +
      '</div></div>';

    // 今日任务清单
    const chk = (ok) => (ok ? '✅' : '⬜');
    const todayDetail = (d.todayLines || []).filter((x) => x.count > 0)
      .map((x) => `${x.label} ${x.count}`).join(' · ');
    const tasksCard =
      '<div class="pln-card"><h3>📋 今日任务</h3><ul class="pln-tasks">' +
      `<li><span class="box">${chk(done)}</span> ① 完成 ${goal} 次练习（${todayCount}/${goal}）</li>` +
      (todayDetail ? `<li><span class="box">📊</span> 今日已练：${esc(todayDetail)}</li>` : '') +
      `<li><span class="box">${chk(false)}</span> ② 复习到期错题</li>` +
      `<li><span class="box">${chk(false)}</span> ③ 学 1 篇新课文</li>` +
      '</ul>' +
      '<div class="pln-note" style="margin-top:10px">' + esc(d.metricNote || '统计多种练习类型') + '</div></div>';

    // 30 天热力图
    const cells = d.calendar
      .map((c) => `<div class="pln-cell" data-l="${heatLevel(c.count)}" title="${esc(c.date)}：${c.count} 题${c.count ? '，正确率 ' + c.accuracy + '%' : ''}"></div>`)
      .join('');
    const heatCard =
      '<div class="pln-card"><h3>🗓️ 最近 30 天打卡热力图</h3>' +
      `<div class="pln-heat">${cells}</div>` +
      '<div class="pln-legend">少' +
      '<span class="pln-cell" data-l="0"></span><span class="pln-cell" data-l="1"></span>' +
      '<span class="pln-cell" data-l="2"></span><span class="pln-cell" data-l="3"></span>' +
      '<span class="pln-cell" data-l="4"></span>多</div></div>';

    // 正确率趋势
    const trendCard =
      '<div class="pln-card"><h3>📈 正确率趋势</h3>' + renderTrend(d.calendar) + '</div>';

    // 设定每日目标
    const goalCard =
      '<div class="pln-card"><h3>🎯 设定每日目标</h3><div class="pln-goal-row">' +
      `<input class="pln-input" id="pln-goal-input" type="number" min="1" max="500" value="${goal}">` +
      '<span>题 / 天</span>' +
      '<button class="pln-btn" id="pln-goal-save">保存</button>' +
      '<span class="pln-msg" id="pln-goal-msg"></span></div></div>';

    const wrap = document.createElement('div');
    wrap.className = 'pln-wrap';
    wrap.innerHTML =
      '<div class="pln-head"><h2>🎯 学习计划</h2></div>' +
      streakCard + tasksCard + heatCard + trendCard + goalCard;

    panel.innerHTML = '';
    panel.appendChild(wrap);

    // 绑定保存
    const input = wrap.querySelector('#pln-goal-input');
    const saveBtn = wrap.querySelector('#pln-goal-save');
    const msg = wrap.querySelector('#pln-goal-msg');
    saveBtn.onclick = async () => {
      const val = Number(input.value);
      if (!Number.isFinite(val) || val <= 0) {
        msg.style.color = '#dc2626';
        msg.textContent = '请输入正整数';
        return;
      }
      saveBtn.disabled = true;
      msg.style.color = '#059669';
      msg.textContent = '保存中…';
      try {
        const r = await NCE.api('/api/plan/goal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal: val }),
        });
        if (r && r.ok) {
          renderHome(panel); // 刷新概览
          return;
        }
        msg.style.color = '#dc2626';
        msg.textContent = (r && r.error) || '保存失败';
      } catch (e) {
        msg.style.color = '#dc2626';
        msg.textContent = '保存失败';
      }
      saveBtn.disabled = false;
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });
  }

  NCE.registerFeature({
    id: 'plan',
    label: '学习计划',
    icon: '🎯',
    onShow(panel) { renderHome(panel); },
  });
})();
