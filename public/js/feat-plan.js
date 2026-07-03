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
    .pln-cell{aspect-ratio:1;border-radius:3px;background:#ebedf0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9aa2b1;font-variant-numeric:tabular-nums}
    .pln-cell.month{outline:1.5px solid #f97316;outline-offset:-1.5px;font-weight:700}
    .pln-cell[data-l="1"]{background:#c6e48b;color:#3f6212}
    .pln-cell[data-l="2"]{background:#7bc96f;color:#1a4314}
    .pln-cell[data-l="3"]{background:#239a3b;color:#fff}
    .pln-cell[data-l="4"]{background:#196127;color:#fff}
    .pln-heat-range{font-weight:400;font-size:12px;color:#9ca3af;margin-left:6px}
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
    .pln-skills{display:flex;flex-direction:column;gap:8px}
    .pln-skill{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #eef2f7;border-radius:10px;background:#fbfcfe}
    .pln-skill.met{background:#f0fdf4;border-color:#bbf7d0}
    .pln-skill-ic{font-size:22px;line-height:1;width:26px;text-align:center;flex:none}
    .pln-skill-main{flex:1;min-width:0}
    .pln-skill-t{font-size:14px;color:#374151}
    .pln-skill-sub{font-size:12px;color:#9ca3af;margin-top:2px}
    .pln-skill-badge{color:#059669;font-size:13px;font-weight:700;flex:none}
    .pln-skill-count{font-weight:400;font-size:13px;color:#059669;margin-left:6px}
    .pln-btn.small{padding:6px 12px;font-size:13px}
    .pln-plan-list{list-style:none;padding:0;margin:0}
    .pln-plan-list li{padding:7px 0;font-size:14px;color:#374151;line-height:1.6;border-bottom:1px solid #f3f4f6}
    .pln-plan-list li:last-child{border-bottom:0}
    .pln-lv-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
    .pln-lv-label{font-size:13px;color:#6b7280}
    .pln-lv{padding:5px 14px;font-size:13px;border:1px solid #d1d5db;border-radius:999px;background:#fff;color:#374151;cursor:pointer}
    .pln-lv:hover{border-color:#2563eb}
    .pln-lv.on{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:700}
    .pln-lv-note{font-size:12px;color:#9ca3af}
    .pln-rem-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
    .pln-rem-switch{display:flex;align-items:center;gap:8px;font-size:15px;color:#374151;cursor:pointer}
    .pln-rem-switch input{width:18px;height:18px;accent-color:#2563eb;cursor:pointer}
    .pln-rem-time{padding:8px 12px;font-size:15px;border:1px solid #d1d5db;border-radius:8px}
    .pln-rem-time:disabled{background:#f3f4f6;color:#9ca3af}
    .pln-rem-status{font-size:13px;margin-top:10px}
    .pln-rem-status.ok{color:#059669}
    .pln-rem-status.warn{color:#d97706}
    .pln-rem-status.err{color:#dc2626}
    .pln-rem-install{margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;color:#6b7280}
    .pln-badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px}
    .pln-badge{border:1px solid #eef2f7;border-radius:10px;padding:10px 6px;text-align:center;background:#fbfcfe;filter:grayscale(1);opacity:.62}
    .pln-badge.earned{filter:none;opacity:1;background:#fffbeb;border-color:#fde68a}
    .pln-badge-ic{font-size:26px;line-height:1;display:block}
    .pln-badge-name{font-size:12px;color:#374151;margin-top:6px;font-weight:600}
    .pln-badge-hint{font-size:11px;color:#9ca3af;margin-top:4px;font-variant-numeric:tabular-nums}
    .pln-badge.earned .pln-badge-hint{color:#b45309;font-weight:700}
    .pln-badge-prog{height:5px;background:#f1f5f9;border-radius:3px;overflow:hidden;margin-top:6px}
    .pln-badge-prog-fill{height:100%;background:#94a3b8;border-radius:3px}
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

    // 今日「听说读写」五技能闭环：每项绑定真实活动来源，做了即自动打勾，未完成给「去做 →」深链
    const skills = d.skills || [];
    const skillsMet = d.skillsMet != null ? d.skillsMet : skills.filter((s) => s.met).length;
    const skillsTotal = d.skillsTotal || skills.length;
    const skillRows = skills.map((s) =>
      `<div class="pln-skill${s.met ? ' met' : ''}">` +
      `<span class="pln-skill-ic">${s.met ? '✅' : s.icon}</span>` +
      '<div class="pln-skill-main">' +
      `<div class="pln-skill-t"><b>${esc(s.label)}</b> · ${esc(s.desc)}</div>` +
      `<div class="pln-skill-sub">${s.done} / ${s.target} ${esc(s.unit)}</div>` +
      '</div>' +
      (s.met
        ? '<span class="pln-skill-badge">已完成</span>'
        : `<button class="pln-btn small pln-skill-go" data-tab="${esc(s.tab)}">去做 →</button>`) +
      '</div>'
    ).join('');
    // 水平预设切换（初级/中级/冲刺）：一键换一套每日目标
    const levels = d.levels || [];
    const curLevel = d.level || 'starter';
    const levelBtns = levels.map((lv) =>
      `<button class="pln-lv${lv.key === curLevel ? ' on' : ''}" data-level="${esc(lv.key)}" title="${esc(lv.note)}">${esc(lv.label)}</button>`
    ).join('');
    const curNote = (levels.find((lv) => lv.key === curLevel) || {}).note || '';
    const tasksCard =
      `<div class="pln-card"><h3>🎯 今日「听说读写」闭环 <span class="pln-skill-count">${skillsMet}/${skillsTotal} 项达标</span></h3>` +
      `<div class="pln-lv-row"><span class="pln-lv-label">水平预设：</span>${levelBtns}<span class="pln-lv-note">${esc(curNote)}</span></div>` +
      `<div class="pln-skills">${skillRows}</div>` +
      '<div class="pln-note" style="margin-top:10px">五项每天各来一轮，围绕当前课文形成「读→听→说→写→记」完整闭环；全绿即今日达标。</div></div>';

    // 通关计划说明（随水平预设变化）
    const PROGRAM = {
      starter: { title: 'NCE1 通关计划（零基础 · 45–60 分钟/天）', main: '每天推进 1 篇新课文，走「读 → 听 → 说 → 写 → 记」闭环', mile: '6 课/周 → 约 12 周通关 NCE1 全 72 课；每月做 1 次听/读词汇量测试对比基线' },
      medium: { title: 'NCE2 进阶计划（中级 · 约 60 分钟/天）', main: '每天 1 课，加大说/写/读的量，语法放到成段语境里巩固', mile: '6 课/周 → 约 16 周走完 NCE2 全 96 课；每月词汇量测试看增长' },
      sprint: { title: '强化冲刺计划（90 分钟+/天）', main: '每天 1–2 课 + 每日复盘，四技能深度训练', mile: '翻倍推进 + 每周阶段测验；最快见效、强度高，注意可持续' },
    };
    const prog = PROGRAM[curLevel] || PROGRAM.starter;
    const programCard =
      `<div class="pln-card"><h3>🧭 ${esc(prog.title)}</h3>` +
      '<ul class="pln-plan-list">' +
      `<li>📖 <b>主线</b>：${esc(prog.main)}</li>` +
      '<li>🗓️ <b>节奏</b>：周一–周六各 1 课；周日不学新课，做本周阶段测验 + 补漏</li>' +
      `<li>🎯 <b>里程碑</b>：${esc(prog.mile)}</li>` +
      '</ul></div>';

    // 30 天热力图：每格显示日期（月内日号），格上标月份分隔
    const cells = d.calendar
      .map((c) => {
        const dd = Number(c.date.slice(8, 10));
        const label = dd === 1 ? c.date.slice(5, 7) + '月' : String(dd); // 每月 1 号显示「M月」以便定位月份
        return `<div class="pln-cell${dd === 1 ? ' month' : ''}" data-l="${heatLevel(c.count)}" title="${esc(c.date)}：${c.count} 次${c.count ? '，正确率 ' + c.accuracy + '%' : '（未学习）'}">${esc(label)}</div>`;
      })
      .join('');
    const first = d.calendar[0], last = d.calendar[d.calendar.length - 1];
    const range = first && last ? `${first.date} ～ ${last.date}` : '';
    const heatCard =
      `<div class="pln-card"><h3>🗓️ 最近 30 天打卡热力图 <span class="pln-heat-range">${esc(range)}</span></h3>` +
      `<div class="pln-heat">${cells}</div>` +
      '<div class="pln-legend">少' +
      '<span class="pln-cell" data-l="0"></span><span class="pln-cell" data-l="1"></span>' +
      '<span class="pln-cell" data-l="2"></span><span class="pln-cell" data-l="3"></span>' +
      '<span class="pln-cell" data-l="4"></span>多</div></div>';

    // 正确率趋势
    const trendCard =
      '<div class="pln-card"><h3>📈 正确率趋势</h3>' + renderTrend(d.calendar) + '</div>';

    // ⏰ 学习提醒(依赖 js/pwa.js 提供的 NCE.pwa)
    const pwa = NCE.pwa;
    let reminderCard;
    if (!pwa) {
      reminderCard =
        '<div class="pln-card"><h3>⏰ 学习提醒</h3>' +
        '<div class="pln-note">提醒功能未加载(需要引入 js/pwa.js)。</div></div>';
    } else {
      const rem = pwa.getReminder();
      reminderCard =
        '<div class="pln-card"><h3>⏰ 学习提醒</h3>' +
        '<div class="pln-rem-row">' +
        `<label class="pln-rem-switch"><input type="checkbox" id="pln-rem-on"${rem.enabled ? ' checked' : ''}> 开启每日提醒</label>` +
        `<input class="pln-rem-time" id="pln-rem-time" type="time" value="${esc(rem.time || '20:00')}"${rem.enabled ? '' : ' disabled'}>` +
        '</div>' +
        '<div class="pln-rem-status" id="pln-rem-status"></div>' +
        '<div class="pln-note" style="margin-top:10px">提醒基于浏览器通知:到点时若今日「听说读写」已全部达标则不打扰;' +
        '受浏览器限制,<b>需保持本页面(或安装后的 PWA)在前台/后台开启</b>,浏览器完全关闭时无法定时提醒。</div>' +
        '<div class="pln-rem-install" id="pln-rem-install"></div></div>';
    }

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
      streakCard + tasksCard + '<div id="pln-badges-slot"></div>' + programCard + heatCard + trendCard + reminderCard + goalCard;

    panel.innerHTML = '';
    panel.appendChild(wrap);

    // 🏅 成就徽章：异步加载，失败时整卡静默隐藏，不影响页面其它部分
    loadBadgesCard(wrap);

    // 「去做 →」深链跳到对应功能标签
    wrap.querySelectorAll('.pln-skill-go').forEach((b) => {
      b.onclick = () => { if (NCE.gotoTab) NCE.gotoTab(b.dataset.tab); };
    });

    // 水平预设切换：一键换一套每日目标并重绘
    wrap.querySelectorAll('.pln-lv').forEach((b) => {
      b.onclick = async () => {
        if (b.classList.contains('on')) return;
        try {
          await NCE.api('/api/plan/level', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level: b.dataset.level }),
          });
          renderHome(panel);
        } catch (e) { if (NCE.toast) NCE.toast('切换失败，请重试', 'error'); }
      };
    });

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

    // ⏰ 学习提醒:开关 / 时间 / 安装入口
    if (pwa) bindReminderCard(wrap, pwa);
  }

  // 🏅 成就徽章卡：已获得=彩色，未获得=灰色+进度条；hover（title）显示达成条件
  async function loadBadgesCard(wrap) {
    const slot = wrap.querySelector('#pln-badges-slot');
    if (!slot) return;
    let d;
    try {
      d = await NCE.api('/api/badges');
    } catch (e) {
      slot.remove(); // 拉取失败：整卡静默隐藏
      return;
    }
    const badges = (d && d.badges) || [];
    if (!badges.length) {
      slot.remove();
      return;
    }
    const earnedCount = badges.filter((b) => b.earned).length;
    const items = badges
      .map((b) => {
        const p = b.progress || { cur: 0, target: 1 };
        const pct = p.target > 0 ? Math.min(100, Math.round((p.cur / p.target) * 100)) : 0;
        const bottom = b.earned
          ? `<div class="pln-badge-hint">${esc(b.earnedHint || '已达成')} ✓</div>`
          : `<div class="pln-badge-prog"><div class="pln-badge-prog-fill" style="width:${pct}%"></div></div>` +
            `<div class="pln-badge-hint">${p.cur} / ${p.target}</div>`;
        return (
          `<div class="pln-badge${b.earned ? ' earned' : ''}" title="${esc(b.desc)}">` +
          `<span class="pln-badge-ic">${esc(b.icon)}</span>` +
          `<div class="pln-badge-name">${esc(b.label)}</div>` +
          bottom +
          '</div>'
        );
      })
      .join('');
    const card = document.createElement('div');
    card.className = 'pln-card';
    card.innerHTML =
      `<h3>🏅 成就 <span class="pln-skill-count">${earnedCount}/${badges.length} 枚</span></h3>` +
      `<div class="pln-badges">${items}</div>`;
    slot.replaceWith(card);
  }

  function bindReminderCard(wrap, pwa) {
    const remOn = wrap.querySelector('#pln-rem-on');
    const remTime = wrap.querySelector('#pln-rem-time');
    const remStatus = wrap.querySelector('#pln-rem-status');
    const installRow = wrap.querySelector('#pln-rem-install');
    if (!remOn || !remTime || !remStatus) return;

    function refreshStatus() {
      const cfg = pwa.getReminder();
      const perm = pwa.notificationPermission();
      remTime.disabled = !cfg.enabled;
      if (perm === 'unsupported') {
        remStatus.className = 'pln-rem-status err';
        remStatus.textContent = '当前浏览器不支持通知,无法使用提醒。';
      } else if (cfg.enabled && perm === 'granted') {
        remStatus.className = 'pln-rem-status ok';
        remStatus.textContent = `已开启:每天 ${cfg.time} 提醒(未达标才提醒)。`;
      } else if (perm === 'denied') {
        remStatus.className = 'pln-rem-status err';
        remStatus.textContent = '通知权限已被拒绝,请在浏览器地址栏的站点设置中重新允许通知。';
      } else {
        remStatus.className = 'pln-rem-status warn';
        remStatus.textContent = '未开启。开启后将请求浏览器通知权限。';
      }
    }

    remOn.onchange = async () => {
      if (remOn.checked) {
        const perm = await pwa.requestNotificationPermission();
        if (perm !== 'granted') {
          remOn.checked = false;
          pwa.setReminder({ enabled: false });
          refreshStatus();
          if (NCE.toast) NCE.toast(perm === 'denied' ? '通知权限被拒绝,无法开启提醒' : '未获得通知权限', 'error');
          return;
        }
      }
      pwa.setReminder({ enabled: remOn.checked, time: remTime.value || '20:00' });
      refreshStatus();
      if (remOn.checked && NCE.toast) NCE.toast('已开启每日学习提醒 ⏰');
    };

    remTime.onchange = () => {
      pwa.setReminder({ time: remTime.value || '20:00' });
      refreshStatus();
    };

    // 安装入口:仅在浏览器给出安装时机(beforeinstallprompt)时展示
    if (installRow) {
      if (pwa.isStandalone()) {
        installRow.textContent = '✅ 已以应用(PWA)方式运行,提醒在后台更可靠。';
      } else if (pwa.canInstall()) {
        installRow.innerHTML =
          '<button class="pln-btn small" id="pln-rem-install-btn">📲 安装到桌面/主屏幕</button>' +
          '<span>安装为应用后,保持其开启即可在后台收到提醒。</span>';
        const btn = installRow.querySelector('#pln-rem-install-btn');
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            const outcome = await pwa.promptInstall();
            if (outcome !== 'accepted') btn.disabled = false;
          } catch (e) {
            btn.disabled = false;
          }
        };
      } else {
        installRow.textContent = '提示:可通过浏览器菜单「安装应用 / 添加到主屏幕」把本站装成应用。';
      }
    }

    refreshStatus();
  }

  NCE.registerFeature({
    id: 'plan',
    label: '学习计划',
    icon: '🎯',
    onShow(panel) { renderHome(panel); },
  });
})();
