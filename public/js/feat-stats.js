'use strict';
// 薄弱点分析 / 语法正确率热力图 功能模块
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;
  const esc = NCE.escapeHtml;

  // ---- 注入样式（前缀 sta- 避免冲突）----
  const style = document.createElement('style');
  style.textContent = `
    .sta-wrap{max-width:760px;margin:0 auto}
    .sta-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:8px}
    .sta-head h2{margin:0;font-size:20px}
    .sta-note{color:#666;font-size:13px;line-height:1.6;background:#f5f7fa;border-radius:8px;padding:10px 14px;margin:10px 0}
    .sta-empty{text-align:center;color:#666;font-size:16px;padding:40px 16px;line-height:1.7}
    .sta-cards{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0}
    .sta-card{flex:1 1 140px;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
    .sta-card .num{font-size:26px;font-weight:700;color:#2563eb;line-height:1.2}
    .sta-card .lbl{color:#888;font-size:13px;margin-top:4px}
    .sta-weak{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
    .sta-weak .chip{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:999px;padding:3px 10px;font-size:13px}
    .sta-sect{margin-top:22px}
    .sta-sect h3{margin:0 0 10px;font-size:16px}
    .sta-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
    .sta-cell{border-radius:10px;padding:12px 14px;color:#111;border:1px solid rgba(0,0,0,.06)}
    .sta-cell .tag{font-weight:600;font-size:14px}
    .sta-cell .rate{font-size:20px;font-weight:700;margin-top:2px}
    .sta-cell .frac{font-size:12px;opacity:.8;margin-top:2px}
    .sta-lessons{display:flex;flex-direction:column;gap:8px}
    .sta-lrow{display:flex;align-items:center;gap:12px;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px}
    .sta-lrow .lt{flex:1;min-width:0;font-size:14px}
    .sta-lrow .lt small{color:#888}
    .sta-lrow .bar{flex:0 0 120px;height:8px;border-radius:999px;background:#eee;overflow:hidden}
    .sta-lrow .bar i{display:block;height:100%;border-radius:999px}
    .sta-lrow .pct{flex:0 0 48px;text-align:right;font-weight:700;font-size:14px}
  `;
  document.head.appendChild(style);

  // 正确率 -> 背景色（红→黄→绿）
  function heatBg(acc) {
    if (acc < 50) return '#fecaca';   // 红
    if (acc < 80) return '#fde68a';   // 橙黄
    return '#bbf7d0';                 // 绿
  }
  function barColor(acc) {
    if (acc < 50) return '#dc2626';
    if (acc < 80) return '#d97706';
    return '#059669';
  }

  async function render(panel) {
    panel.innerHTML = '<div class="sta-wrap"><div class="sta-note">加载中…</div></div>';
    let overview, grammar, lesson;
    try {
      [overview, grammar, lesson] = await Promise.all([
        NCE.api('/api/stats/overview'),
        NCE.api('/api/stats/grammar'),
        NCE.api('/api/stats/lesson'),
      ]);
    } catch (e) {
      panel.innerHTML = '<div class="sta-wrap"><div class="sta-note">加载失败，请稍后重试。</div></div>';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'sta-wrap';
    wrap.innerHTML = '<div class="sta-head"><h2>📊 薄弱点分析</h2></div>';

    const grammarList = (grammar && grammar.grammar) || [];
    const lessonList = (lesson && lesson.lessons) || [];

    if (!overview || !overview.totalAttempts) {
      wrap.innerHTML +=
        '<div class="sta-empty">🌱 先去刷几道题，这里会生成你的薄弱点分析<br>' +
        '<small style="color:#999">按语法标签、按课统计正确率，帮你定位该重点加强哪里</small></div>';
      panel.innerHTML = '';
      panel.appendChild(wrap);
      return;
    }

    // ---- 概览卡片 ----
    const weakChips = (overview.weakest || [])
      .map((w) => `<span class="chip">${esc(w.tag)} ${w.accuracy}%</span>`)
      .join('');
    const cards = document.createElement('div');
    cards.className = 'sta-cards';
    cards.innerHTML =
      `<div class="sta-card"><div class="num">${overview.totalAttempts}</div><div class="lbl">总练习量</div></div>` +
      `<div class="sta-card"><div class="num">${overview.accuracy}%</div><div class="lbl">总正确率</div></div>` +
      `<div class="sta-card"><div class="num">${overview.grammarCovered}</div><div class="lbl">已覆盖语法</div></div>`;
    wrap.appendChild(cards);

    const weakCard = document.createElement('div');
    weakCard.className = 'sta-card';
    weakCard.style.marginTop = '0';
    weakCard.innerHTML =
      '<div class="lbl" style="margin-bottom:6px">最需加强</div>' +
      (weakChips ? `<div class="sta-weak">${weakChips}</div>` : '<div class="sta-weak"><span class="chip" style="background:#ecfdf5;border-color:#a7f3d0;color:#059669">暂无明显薄弱项 🎉</span></div>');
    cards.appendChild(weakCard);

    // ---- 语法热力图 ----
    if (grammarList.length) {
      const sect = document.createElement('div');
      sect.className = 'sta-sect';
      const grid = grammarList.map((g) => {
        const bg = heatBg(g.accuracy);
        return `<div class="sta-cell" style="background:${bg}">` +
          `<div class="tag">${esc(g.tag)}</div>` +
          `<div class="rate">${g.accuracy}%</div>` +
          `<div class="frac">${g.correct}/${g.seen}</div></div>`;
      }).join('');
      sect.innerHTML =
        '<h3>语法正确率热力图</h3>' +
        '<div class="sta-note" style="margin-top:0">颜色越红代表该语法点越薄弱（红 &lt;50%，橙黄 50-79%，绿 ≥80%），最弱在前。</div>' +
        `<div class="sta-grid">${grid}</div>`;
      wrap.appendChild(sect);
    }

    // ---- 按课薄弱 ----
    if (lessonList.length) {
      const sect = document.createElement('div');
      sect.className = 'sta-sect';
      const rows = lessonList.map((l) => {
        const title = l.lessonTitle || `Lesson ${l.lesson}`;
        return `<div class="sta-lrow">` +
          `<div class="lt">${esc(title)} <small>Book ${l.book} · Lesson ${l.lesson} · ${l.correct}/${l.seen}</small></div>` +
          `<div class="bar"><i style="width:${l.accuracy}%;background:${barColor(l.accuracy)}"></i></div>` +
          `<div class="pct" style="color:${barColor(l.accuracy)}">${l.accuracy}%</div></div>`;
      }).join('');
      sect.innerHTML = '<h3>按课薄弱（正确率最低在前）</h3>' + `<div class="sta-lessons">${rows}</div>`;
      wrap.appendChild(sect);
    }

    panel.innerHTML = '';
    panel.appendChild(wrap);
  }

  NCE.registerFeature({
    id: 'stats',
    label: '薄弱分析',
    icon: '📊',
    onShow(panel) { render(panel); },
  });
})();
