'use strict';
// 雅思备考 · 🎯 弱项子页：按题型统计听力 / 阅读正确率，列出最需要补的 2–3 个题型（建议 + 看讲解 + 去练），
// 听力另列按 Part 的正确率与错误原因，阅读另列按难度的正确率。条形图为纯 CSS，不画 SVG。
// 接口：GET /api/ielts/weakness?days=30|60|90（设计见 docs/design/ielts-weakness-20261126.md §4–5）。
// 「📚 看讲解 →」写一次性 sessionStorage['nce-ielts-knowledge-open'] 后切到 📚 基础子页，由 ielts-knowledge-ui.js 直接打开文章。
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE || !IE.registerPage) return;
  const esc = NCE.escapeHtml;

  const WINDOWS = [30, 60, 90];
  const DEFAULT_DAYS = 60;
  const WEAK_BELOW = 0.7; // 与后端一致：正确率低于 70% 才算弱项
  const KNOWLEDGE_OPEN_KEY = 'nce-ielts-knowledge-open';
  const SKILLS = {
    listening: { name: '听力', icon: '🎧' },
    reading: { name: '阅读', icon: '📖' },
  };

  // ---- 样式（前缀 iew-；颜色走主题变量，明暗主题都可读）----
  const style = document.createElement('style');
  style.textContent = `
    .iew-main{margin-top:14px}
    .iew-days{margin:2px 0 10px}
    .iew-range{margin-top:8px}
    .iew-weak{border:1px solid var(--border);border-left:4px solid var(--bad);border-radius:var(--radius-sm);padding:12px 14px;background:var(--card)}
    .iew-weak+.iew-weak{margin-top:10px}
    .iew-weak-h{display:flex;align-items:baseline;gap:6px 10px;flex-wrap:wrap}
    .iew-weak-t{font-size:15.5px;font-weight:800;color:var(--ink)}
    .iew-weak-acc{margin-left:auto;font-size:20px;font-weight:900;color:var(--bad);font-variant-numeric:tabular-nums}
    .iew-weak-acc small{font-size:12.5px;font-weight:600;color:var(--muted);margin-left:6px}
    .iew-tip{font-size:13.5px;color:var(--ink-soft);line-height:1.75;margin:6px 0 10px}
    .iew-weak .ie-row{gap:8px}
    .iew-cause{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;margin-top:12px;padding:10px 12px;border-radius:var(--radius-sm);background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.35);font-size:13.5px;color:var(--ink-soft);line-height:1.6}
    .iew-cause b{color:var(--ink)}
    .iew-sub{font-size:12.5px;font-weight:700;color:var(--muted);margin:16px 0 8px;letter-spacing:.04em}
    .iew-sub:first-of-type{margin-top:4px}
    .iew-bars{display:flex;flex-direction:column;gap:8px}
    /* 第三列定宽：各行的条形轨道等长，便于上下比较（带「样本少」标签的行不会把条挤短） */
    .iew-bar-row{display:grid;grid-template-columns:minmax(72px,112px) minmax(60px,1fr) 12.5em;align-items:center;gap:10px;font-size:13px}
    .iew-bar-l{color:var(--ink);font-weight:600;overflow-wrap:anywhere}
    .iew-bar{display:block;height:10px;border-radius:999px;background:rgba(127,127,127,.14);overflow:hidden}
    .iew-bar span{display:block;height:100%;border-radius:999px;background:var(--ok)}
    .iew-bar span.warn{background:#f59e0b}
    .iew-bar span.bad{background:var(--bad)}
    .iew-bar span.count{background:var(--brand)}
    .iew-bar-v{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:6px}
    .iew-bar-v b{color:var(--ink);font-weight:800}
    .iew-bar-row.few .iew-bar-l,.iew-bar-row.few .iew-bar-v b{color:var(--muted);font-weight:600}
    .iew-bar-row.few .iew-bar span{background:rgba(127,127,127,.38)}
    @media (max-width:600px){
      .iew-bar-row{grid-template-columns:minmax(64px,88px) minmax(40px,1fr)}
      .iew-bar-v{grid-column:2;margin-top:-4px}
    }
  `;
  document.head.appendChild(style);

  const st = {
    days: DEFAULT_DAYS, // 子页切走再回来保留上次选的窗口（刷新后回到 60）
    seq: 0, // 请求序号：切换窗口 / 离开子页后，只认最后一次请求
  };
  let root = null;
  let ctx = null;

  function alive(seq) {
    return !!(ctx && ctx.isActive() && root && root.isConnected && seq === st.seq);
  }

  // ---------- 小工具 ----------
  function pct(acc) {
    const n = Number(acc);
    return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(1, n)) * 100) : 0;
  }
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function list(v) {
    return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [];
  }
  function skillOf(key) {
    return SKILLS[key] || null;
  }

  // ---------- 条形 ----------
  // 正确率条：< 50% 红、< 70% 橙、其余绿；样本不足（enough=false）灰显并标「样本少」
  function accuracyBarHtml(x) {
    const p = pct(x.accuracy);
    const few = x.enough !== true;
    const acc = Number(x.accuracy);
    const cls = few ? '' : acc < 0.5 ? 'bad' : acc < WEAK_BELOW ? 'warn' : '';
    return (
      `<div class="iew-bar-row${few ? ' few' : ''}">` +
      `<span class="iew-bar-l">${esc(String(x.label || x.key || ''))}</span>` +
      `<span class="iew-bar" role="img" aria-label="${esc(String(x.label || ''))} 正确率 ${p}%"><span class="${cls}" style="width:${p}%"></span></span>` +
      `<span class="iew-bar-v"><b>${p}%</b>对 ${esc(String(num(x.correct)))} / ${esc(String(num(x.total)))}` +
      (few ? '<span class="ie-pill mute">样本少</span>' : '') +
      '</span>' +
      '</div>'
    );
  }

  function accuracyBarsHtml(items) {
    const rows = list(items);
    if (!rows.length) return '<div class="ie-muted">暂无数据</div>';
    return `<div class="iew-bars">${rows.map(accuracyBarHtml).join('')}</div>`;
  }

  // 错误原因：条长为占全部错题的比例
  function causesHtml(causes) {
    const rows = list(causes);
    if (!rows.length) return '<div class="ie-muted">这段时间计入统计的题全部答对，没有错题 🎉</div>';
    const sum = rows.reduce((s, c) => s + num(c.count), 0) || 1;
    return (
      '<div class="iew-bars">' +
      rows
        .map((c) => {
          const p = Math.round((num(c.count) / sum) * 100);
          return (
            '<div class="iew-bar-row">' +
            `<span class="iew-bar-l">${esc(String(c.label || c.key || ''))}</span>` +
            `<span class="iew-bar" role="img" aria-label="${esc(String(c.label || ''))} 占错题 ${p}%"><span class="count" style="width:${p}%"></span></span>` +
            `<span class="iew-bar-v"><b>${esc(String(num(c.count)))} 次</b>${p}%</span>` +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  // ---------- 最需要补的 ----------
  function learnBtnHtml(knowledgeId) {
    return typeof knowledgeId === 'string' && knowledgeId
      ? `<button type="button" class="btn small iew-learn" data-k="${esc(knowledgeId)}">📚 看讲解 →</button>`
      : '';
  }

  function weakCardHtml(w) {
    const sk = skillOf(w.skill);
    const practice = skillOf(w.practice) ? w.practice : null;
    return (
      '<div class="iew-weak">' +
      '<div class="iew-weak-h">' +
      (sk ? `<span class="ie-pill">${esc(sk.icon)} ${esc(sk.name)}</span>` : '') +
      `<span class="iew-weak-t">${esc(String(w.label || w.key || ''))}</span>` +
      `<span class="iew-weak-acc">${pct(w.accuracy)}%<small>对 ${esc(String(num(w.correct)))} / ${esc(String(num(w.total)))}</small></span>` +
      '</div>' +
      (w.tip ? `<div class="iew-tip">💡 ${esc(String(w.tip))}</div>` : '') +
      '<div class="ie-row">' +
      learnBtnHtml(w.knowledgeId) +
      (practice ? `<button type="button" class="btn small primary iew-practice" data-p="${esc(practice)}">去练${esc(SKILLS[practice].name)} →</button>` : '') +
      '</div>' +
      '</div>'
    );
  }

  function topCauseHtml(tc) {
    if (!tc || typeof tc !== 'object' || !tc.label) return '';
    return (
      '<div class="iew-cause">' +
      `<span>🎧 听力错题最常见的原因：<b>${esc(String(tc.label))}</b>（${esc(String(num(tc.count)))} 次）</span>` +
      learnBtnHtml(tc.knowledgeId) +
      '</div>'
    );
  }

  // 没有最弱项时区分两种情况：样本都不够（每个题型都不到 8 题）/ 样本够但都 ≥ 70%
  function noWeakestHtml(data) {
    const types = [...list(data.listening && data.listening.byType), ...list(data.reading && data.reading.byType)];
    if (!types.some((x) => x.enough === true)) {
      return (
        '<div class="ie-empty">数据还不够：每个题型至少要做满 8 题才参与排名。<br>再做几组题（听力考试模式、阅读考试模式）后回来看看。' +
        '<div class="ie-row" style="justify-content:center;margin-top:10px">' +
        '<button type="button" class="btn small primary iew-practice" data-p="listening">去练听力 →</button>' +
        '<button type="button" class="btn small primary iew-practice" data-p="reading">去练阅读 →</button>' +
        '</div></div>'
      );
    }
    return '<div class="ie-empty">暂时没有明显弱项 👍<br>样本足够的题型正确率都在 70% 以上，可以换个时间窗口看看，或去做一套模考检验。</div>';
  }

  function weakestCardHtml(data) {
    const weakest = list(data.weakest);
    const tc = data.listening && data.listening.topCause;
    return (
      '<div class="ie-card">' +
      '<h3>🩹 最需要补的<span class="ie-h3-sub">样本 ≥ 8 题、正确率 &lt; 70% 的题型，按正确率从低到高，最多 3 项</span></h3>' +
      (weakest.length ? weakest.map(weakCardHtml).join('') : noWeakestHtml(data)) +
      topCauseHtml(tc) +
      '</div>'
    );
  }

  // ---------- 分项 ----------
  function skillHeadSub(x, unit) {
    const parts = [`${num(x.records)} ${unit} · ${num(x.questions)} 题`];
    if (num(x.skipped) > 0) parts.push(`另有 ${num(x.skipped)} 条记录因题目已更新或已不在题库，未计入`);
    return parts.join(' · ');
  }

  function listeningCardHtml(l) {
    const x = l || {};
    let body;
    if (!num(x.questions)) {
      body = '<div class="ie-empty">这段时间没有可统计的听力记录。考试模式做完一组题后，这里会出现按题型、按 Part 的正确率。</div>';
    } else {
      body =
        '<div class="iew-sub">按题型</div>' + accuracyBarsHtml(x.byType) +
        '<div class="iew-sub">按 Part</div>' + accuracyBarsHtml(x.byPart) +
        '<div class="iew-sub">错误原因</div>' + causesHtml(x.causes);
    }
    return `<div class="ie-card"><h3>🎧 听力<span class="ie-h3-sub">${esc(skillHeadSub(x, '组'))}</span></h3>${body}</div>`;
  }

  function readingCardHtml(r) {
    const x = r || {};
    let body;
    if (!num(x.questions)) {
      body = '<div class="ie-empty">这段时间没有考试模式的阅读记录（练习模式不计入）。考试模式做完一篇后，这里会出现按题型、按难度的正确率。</div>';
    } else {
      body =
        '<div class="iew-sub">按题型</div>' + accuracyBarsHtml(x.byType) +
        '<div class="iew-sub">按难度</div>' + accuracyBarsHtml(x.byDifficulty);
    }
    return `<div class="ie-card"><h3>📖 阅读<span class="ie-h3-sub">${esc(skillHeadSub(x, '篇'))}</span></h3>${body}</div>`;
  }

  // ---------- 跳转 ----------
  // 写一次性标记后切到基础子页，由 ielts-knowledge-ui.js 读到后直接打开文章；写入失败时仍跳过去（停在目录）
  function openKnowledge(id) {
    try {
      sessionStorage.setItem(KNOWLEDGE_OPEN_KEY, id);
    } catch (e) {
      console.warn('[ielts-weakness] 写入讲解跳转标记失败，将停在基础目录', e);
    }
    ctx.go('knowledge');
  }

  function bindActions(scope) {
    scope.querySelectorAll('.iew-learn').forEach((b) => {
      b.onclick = () => openKnowledge(b.dataset.k);
    });
    scope.querySelectorAll('.iew-practice').forEach((b) => {
      b.onclick = () => {
        if (skillOf(b.dataset.p)) ctx.go(b.dataset.p);
      };
    });
  }

  // ---------- 加载与渲染 ----------
  function paint(data) {
    const main = root.querySelector('.iew-main');
    const range = root.querySelector('.iew-range');
    if (!main) return;
    if (range) {
      range.textContent = data.from && data.to ? `统计区间：${data.from} 至 ${data.to}（近 ${num(data.days)} 天）` : '';
    }
    main.innerHTML = weakestCardHtml(data) + listeningCardHtml(data.listening) + readingCardHtml(data.reading);
    bindActions(main);
  }

  async function load() {
    const seq = ++st.seq;
    const main = root.querySelector('.iew-main');
    if (!main) return;
    main.innerHTML = '<div class="ie-loading">正在统计…</div>';
    let data;
    try {
      data = await IE.get(`/api/ielts/weakness?days=${encodeURIComponent(st.days)}`);
    } catch (e) {
      if (!alive(seq)) return;
      main.innerHTML = IE.errorHtml('弱项统计加载失败', e);
      IE.bindRetry(main, load);
      return;
    }
    if (!alive(seq)) return;
    paint(data && typeof data === 'object' ? data : {});
  }

  function chipsHtml() {
    return WINDOWS.map(
      (d) => `<div class="chip${d === st.days ? ' active' : ''}" data-d="${d}" role="button" tabindex="0">近 ${d} 天</div>`
    ).join('');
  }

  function render(body, c) {
    root = body;
    ctx = c;
    if (!WINDOWS.includes(st.days)) st.days = DEFAULT_DAYS;
    body.innerHTML =
      '<div class="ie-card">' +
      '<h3>🎯 弱项<span class="ie-h3-sub">按题型看听力、阅读的正确率，找出最该补的题型</span></h3>' +
      `<div class="ie-row chips iew-days">${chipsHtml()}</div>` +
      '<div class="ie-muted">口径：听力考试模式（含模考）每题都算、没作答记为错，练习模式只算作答了的题；' +
      '阅读只算考试模式（含模考）——阅读记录不保存作答内容，练习模式分不清「没做」和「做错」。按当前题库重判，题目改过的旧记录不计入。</div>' +
      '<div class="ie-muted iew-range"></div>' +
      '</div>' +
      '<div class="iew-main"></div>';
    body.querySelectorAll('.iew-days .chip').forEach((chip) => {
      const pick = () => {
        const d = Number(chip.dataset.d);
        if (d === st.days || !WINDOWS.includes(d)) return;
        st.days = d;
        body.querySelectorAll('.iew-days .chip').forEach((x) => x.classList.toggle('active', x === chip));
        load();
      };
      chip.onclick = pick;
      chip.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      };
    });
    load();
  }

  IE.registerPage('weakness', {
    meta: { label: '弱项', icon: '🎯', before: 'history' },
    render,
    leave() {
      st.seq++; // 作废进行中的请求
    },
  });
})();
