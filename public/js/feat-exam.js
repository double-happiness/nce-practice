'use strict';

// 阶段测验 / 模考 —— 选区间限时组卷、交卷出成绩单、历次成绩回看
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;

  // ---------- 注入样式（类名前缀 ex-）----------
  const style = document.createElement('style');
  style.textContent = `
    .ex-wrap { max-width: 820px; margin: 0 auto; }
    .ex-card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px 22px; background: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,.04); margin-bottom: 16px; }
    .ex-h { font-size: 18px; font-weight: 700; color: #111; margin: 0 0 14px; }
    .ex-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
    .ex-row label { font-size: 14px; color: #444; display: flex; align-items: center; gap: 6px; }
    .ex-row select { padding: 6px 10px; border: 1px solid #d0d7de; border-radius: 8px; font-size: 14px; }
    .ex-btn { padding: 9px 20px; border: 1px solid #2563eb; background: #2563eb; color: #fff;
      border-radius: 9px; cursor: pointer; font-size: 15px; font-weight: 600; }
    .ex-btn:hover { background: #1d4ed8; }
    .ex-btn.ghost { background: #fff; color: #2563eb; }
    .ex-btn.ghost:hover { background: #f1f5f9; }
    .ex-msg { text-align: center; color: #94a3b8; padding: 30px 0; }

    /* 历次成绩 */
    .ex-hist { list-style: none; padding: 0; margin: 0; }
    .ex-hist li { display: flex; align-items: center; gap: 12px; padding: 10px 12px;
      border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 8px; font-size: 14px; }
    .ex-hist .hd { color: #64748b; min-width: 132px; }
    .ex-hist .hs { flex: 1; color: #334155; }
    .ex-hist .ha { font-weight: 700; }
    .ex-badge { padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .ex-badge.pass { background: #dcfce7; color: #15803d; }
    .ex-badge.fail { background: #fee2e2; color: #b91c1c; }

    /* 答题页 */
    .ex-bar { position: sticky; top: 0; z-index: 5; background: #fff; border: 1px solid #e2e8f0;
      border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center;
      gap: 16px; box-shadow: 0 2px 8px rgba(0,0,0,.05); }
    .ex-timer { font-size: 20px; font-weight: 700; color: #111; font-variant-numeric: tabular-nums; }
    .ex-timer.warn { color: #dc2626; }
    .ex-prog { font-size: 14px; color: #64748b; }
    .ex-q { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; margin-bottom: 14px; background: #fff; }
    .ex-q .qn { font-size: 13px; color: #94a3b8; margin-bottom: 4px; }
    .ex-q .qstem { font-size: 16px; color: #111; margin-bottom: 12px; line-height: 1.6; display: flex; align-items: flex-start; gap: 6px; }
    .ex-spk { border: none; background: none; cursor: pointer; font-size: 16px; opacity: .65; padding: 0; flex: none; }
    .ex-spk:hover { opacity: 1; }
    .ex-opts { display: flex; flex-direction: column; gap: 8px; }
    .ex-opt { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid #e2e8f0;
      border-radius: 9px; cursor: pointer; font-size: 15px; }
    .ex-opt:hover { background: #f8fafc; }
    .ex-opt input { margin: 0; }
    .ex-fill { width: 100%; padding: 10px 12px; font-size: 15px; border: 2px solid #d0d7de;
      border-radius: 9px; box-sizing: border-box; }
    .ex-fill:focus { outline: none; border-color: #2563eb; }

    /* 成绩单 */
    .ex-score-hero { text-align: center; padding: 10px 0 6px; }
    .ex-score-big { font-size: 46px; font-weight: 800; color: #111; line-height: 1.1; }
    .ex-score-acc { font-size: 20px; color: #2563eb; font-weight: 700; margin-top: 4px; }
    .ex-score-meta { font-size: 13px; color: #64748b; margin-top: 8px; }
    .ex-gram { margin: 4px 0 0; }
    .ex-gram-item { margin-bottom: 10px; }
    .ex-gram-top { display: flex; justify-content: space-between; font-size: 14px; color: #334155; margin-bottom: 4px; }
    .ex-gram-track { height: 8px; background: #eef2f7; border-radius: 999px; overflow: hidden; }
    .ex-gram-fill { height: 100%; border-radius: 999px; }
    .ex-rev { border: 1px solid #e2e8f0; border-radius: 11px; padding: 14px 16px; margin-bottom: 12px; }
    .ex-rev.ok { border-left: 4px solid #16a34a; }
    .ex-rev.bad { border-left: 4px solid #dc2626; }
    .ex-rev .rstem { font-size: 15px; color: #111; margin-bottom: 8px; line-height: 1.6; display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
    .ex-rev .rline { font-size: 14px; margin: 3px 0; }
    .ex-rev .rmine.ok { color: #16a34a; }
    .ex-rev .rmine.bad { color: #dc2626; }
    .ex-rev .rans { color: #15803d; }
    .ex-rev .rexp { color: #64748b; font-size: 13px; margin-top: 6px; line-height: 1.6; }
    .ex-rev .rtags { margin-top: 6px; }
    .ex-tag { display: inline-block; background: #eff6ff; color: #2563eb; font-size: 12px;
      padding: 1px 8px; border-radius: 999px; margin-right: 6px; }
    .ex-presets { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 14px; }
    .ex-preset { padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 999px; background: #f8fafc;
      color: #334155; font-size: 13px; cursor: pointer; }
    .ex-preset:hover { border-color: #2563eb; color: #2563eb; background: #eff6ff; }
    .ex-preset.primary { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; font-weight: 600; }
  `;
  document.head.appendChild(style);

  const esc = NCE.escapeHtml;
  const escAttr = NCE.escapeAttr || esc;

  function spkBtn(text) {
    const t = String(text || '').trim();
    if (!t || !NCE.speak) return '';
    return `<button type="button" class="ex-spk" data-speak="${escAttr(t)}" title="朗读">🔊</button>`;
  }

  // ---------- 模块状态 ----------
  const st = {
    books: [],
    units: {},
    setup: { book: '1', unitIdx: '', count: '20', limitMin: '0' },
    scope: null, // 本次测验范围 {book,lessonMin,lessonMax,label}
    questions: [],
    startTs: 0,
    limitSec: 0,
    timer: null,
  };

  let PANEL = null;

  function jsonPost(url, obj) {
    return NCE.api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
    });
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function accColor(a) {
    if (a >= 80) return '#16a34a';
    if (a >= 60) return '#f59e0b';
    return '#dc2626';
  }

  // ---------- 入口 ----------
  async function onShow(panel) {
    PANEL = panel;
    clearTimer();
    if (!st.books.length) {
      try {
        const meta = await NCE.api('/api/meta');
        st.books = meta.books || [];
        st.units = meta.units || {};
      } catch (e) {
        st.books = [];
        st.units = [];
      }
    }
    renderSetup();
  }

  function clearTimer() {
    if (st.timer) {
      clearInterval(st.timer);
      st.timer = null;
    }
  }

  function presetHtml(book) {
    const units = st.units[book] || [];
    if (!units.length) return '';
    const chips = units.map((u, i) =>
      `<button type="button" class="ex-preset" data-unit="${i}" data-count="20" data-limit="20">${esc(u.label)} · 20题</button>`
    ).join('');
    const all = Number(book) === 4
      ? '<button type="button" class="ex-preset primary" data-unit="" data-count="40" data-limit="40">全书模考 · 40题 · 40分钟</button>'
      : '';
    return '<div class="ex-presets">' + chips + all + '</div>';
  }

  function applyPreset(unitIdx, count, limitMin) {
    const s = st.setup;
    s.unitIdx = unitIdx === '' || unitIdx == null ? '' : String(unitIdx);
    s.count = String(count);
    s.limitMin = String(limitMin);
    renderSetup();
    const start = PANEL && PANEL.querySelector('.ex-start');
    if (start) start.click();
  }

  // ============ 1. 设置页 ============
  async function renderSetup() {
    clearTimer();
    const s = st.setup;
    const bookOpts = st.books.map((b) =>
      `<option value="${escAttr(String(b.id))}"${String(b.id) === s.book ? ' selected' : ''}>${esc(b.name || ('第' + b.id + '册'))}</option>`
    ).join('');
    const units = st.units[s.book] || [];
    const unitOpts = ['<option value="">全部课程</option>'].concat(
      units.map((u, i) =>
        `<option value="${i}"${String(i) === s.unitIdx ? ' selected' : ''}>${esc(u.label)}</option>`)
    ).join('');

    PANEL.innerHTML =
      '<div class="ex-wrap">' +
      '<div class="ex-card">' +
      '<h3 class="ex-h">📝 组卷设置</h3>' +
      '<div class="ex-row">' +
      `<label>册：<select class="ex-book">${bookOpts}</select></label>` +
      `<label>范围：<select class="ex-unit">${unitOpts}</select></label>` +
      '</div>' +
      presetHtml(s.book) +
      '<div class="ex-row">' +
      '<label>题量：<select class="ex-count">' +
      ['10', '20', '30', '40'].map((c) => `<option value="${c}"${c === s.count ? ' selected' : ''}>${c} 题</option>`).join('') +
      '</select></label>' +
      '<label>限时：<select class="ex-limit">' +
      [['0', '不限时'], ['10', '10 分钟'], ['20', '20 分钟'], ['30', '30 分钟'], ['40', '40 分钟']].map(([v, t]) =>
        `<option value="${v}"${v === s.limitMin ? ' selected' : ''}>${t}</option>`).join('') +
      '</select></label>' +
      '</div>' +
      '<button class="ex-btn ex-start">开始测验</button>' +
      '</div>' +
      '<div class="ex-card">' +
      '<h3 class="ex-h">📊 历次成绩</h3>' +
      '<div class="ex-hist-box"><div class="ex-msg">加载中…</div></div>' +
      '</div>' +
      '</div>';

    const bookSel = PANEL.querySelector('.ex-book');
    bookSel.onchange = () => {
      s.book = bookSel.value;
      s.unitIdx = '';
      renderSetup();
    };
    PANEL.querySelector('.ex-unit').onchange = (e) => { s.unitIdx = e.target.value; };
    PANEL.querySelector('.ex-count').onchange = (e) => { s.count = e.target.value; };
    PANEL.querySelector('.ex-limit').onchange = (e) => { s.limitMin = e.target.value; };
    PANEL.querySelectorAll('.ex-preset').forEach((btn) => {
      btn.onclick = () => applyPreset(btn.dataset.unit, btn.dataset.count, btn.dataset.limit);
    });
    PANEL.querySelector('.ex-start').onclick = startExam;

    loadHistory();
  }

  async function loadHistory() {
    const box = PANEL && PANEL.querySelector('.ex-hist-box');
    if (!box) return;
    let exams = [];
    try {
      const d = await NCE.api('/api/exam/history?limit=20');
      exams = d.exams || [];
    } catch (e) { /* 忽略 */ }
    if (!exams.length) {
      box.innerHTML = '<div class="ex-msg">还没有测验记录，完成一次测验后这里会显示成绩。</div>';
      return;
    }
    const items = exams.map((e) => {
      const label = (e.scope && e.scope.label) || '测验';
      return '<li>' +
        `<span class="hd">${esc(fmtDate(e.ts))}</span>` +
        `<span class="hs">${esc(label)} · ${e.correct}/${e.total}</span>` +
        `<span class="ha" style="color:${accColor(e.accuracy)}">${e.accuracy}%</span>` +
        `<span class="ex-badge ${e.passed ? 'pass' : 'fail'}">${e.passed ? '通过' : '未通过'}</span>` +
        '</li>';
    }).join('');
    box.innerHTML = `<ul class="ex-hist">${items}</ul>`;
  }

  // ============ 2. 答题页 ============
  async function startExam() {
    const s = st.setup;
    const units = st.units[s.book] || [];
    const unit = s.unitIdx !== '' ? units[Number(s.unitIdx)] : null;
    let url = `/api/exam/generate?book=${encodeURIComponent(s.book)}&count=${encodeURIComponent(s.count)}`;
    if (unit) url += `&lessonMin=${unit.min}&lessonMax=${unit.max}`;

    const bookName = (st.books.find((b) => String(b.id) === s.book) || {}).name || ('第' + s.book + '册');
    st.scope = {
      book: Number(s.book),
      lessonMin: unit ? unit.min : undefined,
      lessonMax: unit ? unit.max : undefined,
      label: `${bookName} · ${unit ? unit.label : '全部课程'}`,
    };

    PANEL.innerHTML = '<div class="ex-wrap"><div class="ex-msg">正在组卷…</div></div>';
    let questions = [];
    try {
      const d = await NCE.api(url);
      questions = d.questions || [];
    } catch (e) {
      PANEL.innerHTML = '<div class="ex-wrap"><div class="ex-msg">组卷失败，请重试。</div></div>';
      return;
    }
    if (!questions.length) {
      PANEL.innerHTML = '<div class="ex-wrap"><div class="ex-card"><div class="ex-msg">该范围内暂无题目，换个范围试试。</div>' +
        '<div style="text-align:center"><button class="ex-btn ghost ex-back">返回设置</button></div></div></div>';
      PANEL.querySelector('.ex-back').onclick = renderSetup;
      return;
    }
    st.questions = questions;
    st.startTs = Date.now();
    st.limitSec = Number(s.limitMin) * 60;
    renderExam();
  }

  function renderExam() {
    const qs = st.questions;
    const body = qs.map((q, i) => {
      const qn = `第 ${i + 1} 题 · Lesson ${esc(String(q.lesson))} · ${esc(q.lessonTitle || '')}`;
      let input;
      if (q.type === 'mcq') {
        input = '<div class="ex-opts">' +
          (q.options || []).map((opt) =>
            `<label class="ex-opt"><input type="radio" name="q_${escAttr(q.id)}" value="${escAttr(opt)}">` +
            `<span>${esc(opt)}</span></label>`).join('') +
          '</div>';
      } else {
        input = `<input class="ex-fill" type="text" data-id="${escAttr(q.id)}" placeholder="填写答案" ` +
          'autocomplete="off" autocapitalize="off" spellcheck="false">';
      }
      return `<div class="ex-q" data-id="${escAttr(q.id)}">` +
        `<div class="qn">${qn}</div>` +
        `<div class="qstem">${spkBtn(q.stem)}<span>${esc(q.stem)}</span></div>` +
        input + '</div>';
    }).join('');

    PANEL.innerHTML =
      '<div class="ex-wrap">' +
      '<div class="ex-bar">' +
      `<span class="ex-timer">${st.limitSec ? fmtTime(st.limitSec) : '00:00'}</span>` +
      '<span class="ex-prog">已答 0 / ' + qs.length + '</span>' +
      '<span style="margin-left:auto"></span>' +
      '<button class="ex-btn ex-submit">交卷</button>' +
      '</div>' +
      body +
      '<div style="text-align:center;margin:8px 0 24px"><button class="ex-btn ex-submit2">交卷</button></div>' +
      '</div>';

    const onInput = () => updateProgress();
    PANEL.querySelectorAll('.ex-q input').forEach((el) => {
      el.addEventListener('change', onInput);
      el.addEventListener('input', onInput);
    });
    PANEL.querySelector('.ex-submit').onclick = () => confirmSubmit();
    PANEL.querySelector('.ex-submit2').onclick = () => confirmSubmit();
    if (NCE.bindSpeakClicks) NCE.bindSpeakClicks(PANEL);
    updateProgress();
    startTimer();
  }

  function collectAnswers() {
    return st.questions.map((q) => {
      let response = '';
      if (q.type === 'mcq') {
        const sel = PANEL.querySelector(`input[name="q_${cssEsc(q.id)}"]:checked`);
        response = sel ? sel.value : '';
      } else {
        const inp = PANEL.querySelector(`.ex-fill[data-id="${cssEsc(q.id)}"]`);
        response = inp ? inp.value.trim() : '';
      }
      return { id: q.id, response };
    });
  }
  // CSS 选择器里安全转义 id（题目 id 形如 b1-001，含短横，需转义以防意外）
  function cssEsc(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function answeredCount() {
    return collectAnswers().filter((a) => a.response !== '').length;
  }
  function updateProgress() {
    const el = PANEL && PANEL.querySelector('.ex-prog');
    if (el) el.textContent = `已答 ${answeredCount()} / ${st.questions.length}`;
  }

  function startTimer() {
    clearTimer();
    const el = () => PANEL && PANEL.querySelector('.ex-timer');
    st.timer = setInterval(() => {
      // 切走标签时面板只是加了 hidden 类、.ex-timer 仍在 DOM 中；若继续跑，到点会在后台静默交卷。
      // 此时停表并直接返回，不自动提交（重新进入本页 onShow 会回到设置页）。
      if (PANEL && PANEL.classList.contains('hidden')) { clearTimer(); return; }
      const elapsed = (Date.now() - st.startTs) / 1000;
      const t = el();
      if (!t) { clearTimer(); return; }
      if (st.limitSec) {
        const remain = st.limitSec - elapsed;
        t.textContent = fmtTime(remain);
        t.classList.toggle('warn', remain <= 60);
        if (remain <= 0) {
          clearTimer();
          doSubmit(); // 到点自动交卷
        }
      } else {
        t.textContent = fmtTime(elapsed);
      }
    }, 500);
  }

  function confirmSubmit() {
    const answered = answeredCount();
    const total = st.questions.length;
    if (answered < total) {
      if (!window.confirm(`还有 ${total - answered} 题未作答，确定交卷吗？`)) return;
    }
    doSubmit();
  }

  async function doSubmit() {
    clearTimer();
    const answers = collectAnswers();
    const durationSec = Math.round((Date.now() - st.startTs) / 1000);
    PANEL.innerHTML = '<div class="ex-wrap"><div class="ex-msg">正在判分…</div></div>';
    let res;
    try {
      res = await jsonPost('/api/exam/submit', { answers, durationSec, scope: st.scope });
    } catch (e) {
      PANEL.innerHTML = '<div class="ex-wrap"><div class="ex-card"><div class="ex-msg">交卷失败，请重试。</div>' +
        '<div style="text-align:center"><button class="ex-btn ghost ex-back">返回设置</button></div></div></div>';
      PANEL.querySelector('.ex-back').onclick = renderSetup;
      return;
    }
    // 错题加入间隔复习（失败忽略）
    if (res.wrongIds && res.wrongIds.length) {
      jsonPost('/api/srs/add', { ids: res.wrongIds }).catch(() => {});
    }
    renderReport(res, durationSec);
  }

  // ============ 3. 成绩单页 ============
  function renderReport(res, durationSec) {
    const acc = res.accuracy;
    const gram = (res.byGrammar || []).map((g) => {
      const col = accColor(g.accuracy);
      return '<div class="ex-gram-item">' +
        `<div class="ex-gram-top"><span>${esc(g.tag)}</span>` +
        `<span style="color:${col};font-weight:700">${g.accuracy}% · ${g.correct}/${g.total}</span></div>` +
        `<div class="ex-gram-track"><div class="ex-gram-fill" style="width:${g.accuracy}%;background:${col}"></div></div>` +
        '</div>';
    }).join('') || '<div class="ex-msg">无语法标签数据。</div>';

    const review = (res.results || []).map((r, i) => {
      const ans = Array.isArray(r.answer) ? r.answer.join(' / ') : r.answer;
      const mine = r.response && r.response !== '' ? esc(r.response) : '（未作答）';
      const tags = (r.grammar || []).map((t) => `<span class="ex-tag">${esc(t)}</span>`).join('');
      return `<div class="ex-rev ${r.correct ? 'ok' : 'bad'}">` +
        `<div class="rstem">${spkBtn(r.stem)}<span><b>${i + 1}.</b> ${esc(r.stem)} ` +
        `<span style="color:${r.correct ? '#16a34a' : '#dc2626'}">${r.correct ? '✓' : '✗'}</span></span></div>` +
        `<div class="rline rmine ${r.correct ? 'ok' : 'bad'}">你的答案：${mine}</div>` +
        (r.correct ? '' : `<div class="rline rans">正确答案：${esc(ans)}</div>`) +
        (r.explanation ? `<div class="rexp">解析：${esc(r.explanation)}</div>` : '') +
        (tags ? `<div class="rtags">${tags}</div>` : '') +
        '</div>';
    }).join('');

    PANEL.innerHTML =
      '<div class="ex-wrap">' +
      '<div class="ex-card">' +
      '<div class="ex-score-hero">' +
      `<div class="ex-score-big">${res.correct} / ${res.total}</div>` +
      `<div class="ex-score-acc" style="color:${accColor(acc)}">正确率 ${acc}% ` +
      `<span class="ex-badge ${res.passed ? 'pass' : 'fail'}">${res.passed ? '通过' : '未通过'}</span></div>` +
      `<div class="ex-score-meta">用时 ${fmtTime(durationSec)}${st.scope ? ' · ' + esc(st.scope.label) : ''}</div>` +
      '</div>' +
      '<div style="text-align:center;margin-top:14px"><button class="ex-btn ex-again">再考一次</button></div>' +
      '</div>' +
      '<div class="ex-card"><h3 class="ex-h">🧩 按语法拆解</h3><div class="ex-gram">' + gram + '</div></div>' +
      '<div class="ex-card"><h3 class="ex-h">🔍 逐题回看</h3>' + review + '</div>' +
      '</div>';

    PANEL.querySelector('.ex-again').onclick = renderSetup;
    if (NCE.bindSpeakClicks) NCE.bindSpeakClicks(PANEL);
  }

  NCE.registerFeature({ id: 'exam', label: '阶段测验', icon: '📝', onShow });
})();
