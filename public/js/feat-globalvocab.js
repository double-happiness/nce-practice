'use strict';

// 总词汇量测试 —— 基于内置全局词库（频率/CEFR 分级），估算整体英语词汇量
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;

  const esc = NCE.escapeHtml;
  const escAttr = NCE.escapeAttr || esc;
  const API = 'global-vocab';
  const ACCENT = '#2563eb';

  const style = document.createElement('style');
  style.textContent = `
    .gv-wrap { max-width: 720px; margin: 0 auto; }
    .gv-intro { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px 18px; font-size: 14px; color: #334; line-height: 1.8; }
    .gv-meta { font-size: 13px; color: #64748b; margin: 10px 0 0; }
    .gv-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 16px 0; }
    .gv-row label { font-size: 14px; color: #555; }
    .gv-row select { padding: 7px 10px; border: 1px solid #ccd; border-radius: 8px; font-size: 14px; }
    .gv-btn { padding: 9px 18px; border: 1px solid #cfd6e6; border-radius: 8px; background: #fff; cursor: pointer; font-size: 15px; color: #223; }
    .gv-btn:hover { background: #f0f3fb; }
    .gv-btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
    .gv-btn.primary:hover { background: #1d4ed8; }
    .gv-btn:disabled { opacity: .5; cursor: not-allowed; }
    .gv-hist { font-size: 13px; color: #667; margin-top: 12px; }
    .gv-hist b { color: ${ACCENT}; }
    .gv-hist ul { margin: 6px 0 0; padding-left: 18px; }
    .gv-card { background: #fff; border: 1px solid #e5e9f2; border-radius: 12px; padding: 20px; margin-top: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
    .gv-progress { font-size: 14px; color: #667; margin-bottom: 10px; }
    .gv-wordrow { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
    .gv-word { font-size: 36px; font-weight: 800; color: #1e293b; line-height: 1.2; }
    .gv-phon { font-size: 15px; color: #64748b; }
    .gv-pos { font-size: 14px; color: #2563eb; font-weight: 600; }
    .gv-hint { font-size: 13px; color: #889; margin-bottom: 12px; }
    .gv-opts { display: flex; flex-direction: column; gap: 8px; }
    .gv-opt { text-align: left; padding: 11px 14px; border: 1px solid #d5dbe8; border-radius: 10px; background: #fff; cursor: pointer; font-size: 15px; color: #223; }
    .gv-opt:hover { background: #eff6ff; }
    .gv-opt .k { display: inline-block; width: 20px; color: #99a; font-size: 13px; }
    .gv-opt.chosen-ok { border-color: #22c55e; background: #f0fdf4; }
    .gv-opt.chosen-bad { border-color: #ef4444; background: #fef2f2; }
    .gv-opt.is-answer { border-color: #22c55e; background: #f0fdf4; }
    .gv-opt:disabled { cursor: default; }
    .gv-feedback { margin-top: 12px; font-size: 15px; line-height: 1.7; }
    .gv-feedback .w { font-weight: 800; font-size: 17px; }
    .gv-feedback.ok { color: #15803d; }
    .gv-feedback.bad { color: #b91c1c; }
    .gv-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .gv-sum-big { text-align: center; font-size: 44px; font-weight: 800; color: ${ACCENT}; margin: 8px 0 2px; }
    .gv-sum-sub { text-align: center; color: #667; font-size: 14px; margin-bottom: 16px; }
    .gv-band { margin: 10px 0; }
    .gv-band .lab { display: flex; justify-content: space-between; font-size: 13px; color: #445; margin-bottom: 4px; }
    .gv-bar { height: 12px; border-radius: 999px; background: #eef2f7; overflow: hidden; }
    .gv-bar > span { display: block; height: 100%; background: #3b82f6; }
    .gv-missed { margin-top: 18px; }
    .gv-missed h4 { font-size: 14px; margin: 0 0 8px; color: #334; }
    .gv-missed li { display: flex; gap: 10px; align-items: center; padding: 7px 10px; border: 1px solid #eee3e3; background: #fffafa; border-radius: 8px; margin-bottom: 6px; font-size: 14px; list-style: none; flex-wrap: wrap; }
    .gv-missed ul { padding: 0; margin: 0; }
    .gv-missed .w { font-weight: 700; }
    .gv-missed .p { color: #64748b; font-size: 12px; }
    .gv-missed .c { color: #333; flex: 1; min-width: 100px; }
    .gv-note { font-size: 12px; color: #94a3b8; margin-top: 12px; line-height: 1.6; }
    .gv-disclaimer { font-size: 13px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-top: 12px; line-height: 1.6; }
    .gv-cefr-hint { text-align: center; font-size: 14px; color: #4338ca; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
  `;
  document.head.appendChild(style);

  const st = {
    phase: 'intro',
    size: 24,
    dictTotal: 0,
    bandMeta: [],
    items: [],
    idx: 0,
    results: [],
    missed: [],
    answered: false,
    lastReport: null,
    panel: null,
  };

  function post(url, obj) {
    return NCE.api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
    });
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function avgEstimate(tests, n) {
    if (!tests || !tests.length) return null;
    const slice = tests.slice(0, n || 3);
    return Math.round(slice.reduce((s, t) => s + t.estimate, 0) / slice.length);
  }

  async function loadInfo() {
    try {
      return await NCE.api(`/api/${API}/info`);
    } catch (e) {
      return { dictTotal: 0, bands: [] };
    }
  }

  async function renderHistory(histEl) {
    try {
      const h = await NCE.api(`/api/${API}/history`);
      if (!h.count) {
        histEl.textContent = '还没有测试记录，测一次建立基线吧。';
        return;
      }
      const latest = h.tests[0];
      const avg = avgEstimate(h.tests, 3);
      const avgLine =
        h.tests.length >= 2 && avg != null
          ? ` · 近 ${Math.min(3, h.tests.length)} 次平均 <b style="color:${ACCENT}">≈ ${avg}</b> 词`
          : '';
      histEl.innerHTML =
        `上次估算：<b style="color:${ACCENT}">${latest.estimate}</b> / ${latest.dictTotal} 词` +
        `（${fmtDate(latest.ts)}，答对 ${latest.correct}/${latest.asked}）${avgLine}` +
        (h.tests.length > 1
          ? '<ul>' + h.tests.slice(1, 5).map((t) => `<li>${fmtDate(t.ts)}：${t.estimate} / ${t.dictTotal} 词</li>`).join('') + '</ul>'
          : '');
    } catch (e) {
      histEl.textContent = '';
    }
  }

  function onShow(panel) {
    st.panel = panel;
    if (st.phase === 'quiz' && st.items.length) renderQuiz(panel);
    else if (st.phase === 'summary' && st.lastReport) renderSummary(panel, st.lastReport);
    else renderIntro(panel);
  }

  async function renderIntro(panel) {
    st.phase = 'intro';
    const info = await loadInfo();
    st.dictTotal = info.dictTotal || 0;
    st.bandMeta = info.bands || [];
    const bandLine = st.bandMeta.length
      ? st.bandMeta.map((b) => `${esc(b.label)} ${b.total}`).join(' · ')
      : '加载中…';

    panel.innerHTML =
      '<div class="gv-wrap">' +
      '<div class="gv-intro">🌐 <b>总词汇量测试</b> —— 显示英文单词，从 4 个中文释义中选出词义。' +
      '词库按词频/CEFR 分 ' + (st.bandMeta.length || '…') + ' 段难度抽样，测完估算你在内置通用词库中「看得懂」的词汇量。' +
      '选项猜中的概率已在估算中剔除。</div>' +
      `<div class="gv-meta">内置词库共 <b>${st.dictTotal}</b> 词（${bandLine}）</div>` +
      '<div class="gv-row">' +
      '<label>题量：<select id="gvSize">' +
      '<option value="12">12 词（快测）</option>' +
      '<option value="24" selected>24 词（推荐）</option>' +
      '<option value="36">36 词（更准）</option>' +
      '<option value="48">48 词（最准）</option>' +
      '</select></label>' +
      '<button class="gv-btn primary" id="gvStart">开始测试 →</button>' +
      '</div>' +
      '<div class="gv-hist" id="gvHist">加载历史成绩…</div>' +
      '<div class="gv-actions"><button type="button" class="gv-btn" id="gvIntroTrend">📈 查看历次趋势</button></div>' +
      '<div class="gv-disclaimer">⚠️ 本测试基于内置词库的频率分级抽样推断，<b>不是</b>官方考试分数（如 CET/IELTS/托福词汇量）。词库规模有限，结果仅供自测参考。</div>' +
      '</div>';

    panel.querySelector('#gvSize').value = String(st.size);
    panel.querySelector('#gvSize').onchange = (e) => { st.size = Number(e.target.value) || 24; };
    panel.querySelector('#gvStart').onclick = () => startTest(panel);
    await renderHistory(panel.querySelector('#gvHist'));
    const trendBtn = panel.querySelector('#gvIntroTrend');
    if (trendBtn && NCE.vocabTestUi) {
      trendBtn.onclick = () => NCE.vocabTestUi.goToVocabTrend();
    }
  }

  async function startTest(panel) {
    const btn = panel.querySelector('#gvStart');
    if (btn) { btn.disabled = true; btn.textContent = '出题中…'; }
    let data;
    try {
      data = await NCE.api(`/api/${API}/sample?size=${st.size}`);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '开始测试 →'; }
      return;
    }
    st.items = data.items || [];
    st.dictTotal = data.dictTotal || st.dictTotal;
    st.idx = 0;
    st.results = [];
    st.missed = [];
    st.answered = false;
    st.phase = 'quiz';
    renderQuiz(panel);
  }

  function renderQuiz(panel) {
    const it = st.items[st.idx];
    const correctSoFar = st.results.filter((r) => r.correct).length;
    panel.innerHTML =
      '<div class="gv-wrap"><div class="gv-card">' +
      `<div class="gv-progress">第 ${st.idx + 1} / ${st.items.length} 词 · 已答对 ${correctSoFar}</div>` +
      '<div class="gv-wordrow">' +
      `<span class="gv-word">${esc(it.word)}</span>` +
      (it.phon ? `<span class="gv-phon">${esc(it.phon)}</span>` : '') +
      `<span class="gv-pos">${esc(it.pos || '')}</span>` +
      '</div>' +
      '<div class="gv-hint">选出这个英文单词的中文释义（键盘 1-4 可选）。</div>' +
      '<div class="gv-opts">' +
      it.options
        .map((o, i) => `<button class="gv-opt" data-i="${i}"><span class="k">${i + 1}.</span>${esc(o)}</button>`)
        .join('') +
      '</div>' +
      '<div class="gv-actions">' +
      '<button class="gv-btn" id="gvSpeak">🔊 发音</button>' +
      '<button class="gv-btn" id="gvSkip">不认识，跳过（算错）</button>' +
      '</div>' +
      '<div class="gv-feedback" id="gvFeedback"></div>' +
      '<div class="gv-actions" id="gvNextBox"></div>' +
      '</div></div>';

    st.answered = false;
    panel.querySelector('#gvSpeak').onclick = () => NCE.speak(it.word);
    panel.querySelector('#gvSkip').onclick = () => answer(panel, null);
    panel.querySelectorAll('.gv-opt').forEach((b) => {
      b.onclick = () => answer(panel, it.options[Number(b.dataset.i)]);
    });
  }

  async function answer(panel, chosen) {
    if (st.answered) return;
    st.answered = true;
    const it = st.items[st.idx];
    let r;
    try {
      r = await post(`/api/${API}/grade`, { word: it.word, chosen });
    } catch (e) {
      st.answered = false;
      return;
    }
    st.results.push({ word: it.word, band: it.band, correct: r.correct });
    if (!r.correct) st.missed.push(r);

    panel.querySelectorAll('.gv-opt').forEach((b) => {
      const text = it.options[Number(b.dataset.i)];
      b.disabled = true;
      if (text === r.cn) b.classList.add('is-answer');
      if (chosen != null && text === chosen && !r.correct) b.classList.add('chosen-bad');
      if (chosen != null && text === chosen && r.correct) b.classList.add('chosen-ok');
    });
    const fb = panel.querySelector('#gvFeedback');
    fb.className = 'gv-feedback ' + (r.correct ? 'ok' : 'bad');
    fb.innerHTML =
      (r.correct ? '✅ 正确！' : (chosen == null ? '⏭️ 已跳过。' : '❌ 答错了。')) +
      ` 正确释义：<span class="w">${esc(r.cn)}</span>`;

    const isLast = st.idx >= st.items.length - 1;
    panel.querySelector('#gvNextBox').innerHTML =
      `<button class="gv-btn primary" id="gvNext">${isLast ? '查看结果 →' : '下一词 →（回车）'}</button>`;
    panel.querySelector('#gvNext').onclick = () => {
      if (isLast) finish(panel);
      else {
        st.idx++;
        renderQuiz(panel);
      }
    };
  }

  document.addEventListener('keydown', (e) => {
    const panel = st.panel;
    if (!panel || panel.classList.contains('hidden') || st.phase !== 'quiz') return;
    if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
    if (e.key === 'Enter') {
      const next = panel.querySelector('#gvNext');
      if (next) { e.preventDefault(); next.click(); }
    } else if (/^[1-4]$/.test(e.key) && !st.answered) {
      const btn = panel.querySelector(`.gv-opt[data-i="${Number(e.key) - 1}"]`);
      if (btn) btn.click();
    }
  });

  async function finish(panel) {
    let rep;
    try {
      rep = await post(`/api/${API}/finish`, { results: st.results });
    } catch (e) {
      return;
    }
    st.lastReport = rep;
    st.phase = 'summary';
    renderSummary(panel, rep);
  }

  function renderSummary(panel, rep) {
    const ui = NCE.vocabTestUi;
    const weakest = ui ? ui.findWeakestBand(rep.bands) : null;
    const weakestHint = weakest && ui ? ui.weakestBandHint(weakest) : '';
    const bandsHtml = ui
      ? ui.renderBandsHtml(rep.bands, { bandClass: 'gv-band', barClass: 'gv-bar', esc })
      : '';

    const missedHtml = st.missed.length
      ? '<div class="gv-missed"><h4>❌ 不认识的词（' + st.missed.length + '）</h4><ul>' +
        st.missed.map((w) => NCE.vocabTestUi.missedRowHtml(w, esc, escAttr, '')).join('') +
        '</ul>' +
        '<div class="gv-actions" style="margin-top:10px">' +
        '<button class="gv-btn" id="gvStarAll">⭐ 全部加入生词本</button>' +
        '<button class="gv-btn" id="gvFlashAll">🃏 背诵错词</button>' +
        '<button class="gv-btn" id="gvSpellAll">✍️ 默写错词</button>' +
        '<button class="gv-btn" id="gvSrsAll">🔁 间隔复习</button>' +
        '<button class="gv-btn primary" id="gvReviewAll">📕 逐个复习错词</button>' +
        '<span class="vt-miss-hint">或点每词旁 📕</span></div></div>'
      : '';

    const cefrHint = ui ? ui.cefrLevelHint(rep.bands) : '';

    panel.innerHTML =
      '<div class="gv-wrap"><div class="gv-card">' +
      `<div class="gv-sum-big">≈ ${rep.estimate} 词</div>` +
      `<div class="gv-sum-sub">估算总词汇量（内置词库共 ${rep.dictTotal} 词 · 本次答对 ${rep.correct}/${rep.asked}）</div>` +
      (cefrHint ? `<div class="gv-cefr-hint">${cefrHint}</div>` : '') +
      (weakestHint ? `<div class="vt-weakest-hint">${esc(weakestHint)}</div>` : '') +
      bandsHtml +
      missedHtml +
      '<div class="gv-actions">' +
      '<button class="gv-btn primary" id="gvAgain">再测一次</button>' +
      '<button class="gv-btn" id="gvTrend">📈 查看趋势</button>' +
      '<button class="gv-btn" id="gvBack">返回说明页</button>' +
      '</div>' +
      '<div class="gv-note">估算方法：按词频/CEFR 分段分层抽样，各段正确率剔除 4 选 1 的猜中基线（25%）后乘以该段词表总数求和。多测几次取平均更稳。</div>' +
      '<div class="gv-disclaimer">⚠️ 这是基于内置词库的频率分级估算，<b>不是</b>官方考试分数。词库约 ' + rep.dictTotal + ' 词，覆盖通用英语高频词，结果仅供自测参考。</div>' +
      '</div></div>';

    NCE.vocabTestUi.bindMissedActions(panel.querySelector('.gv-missed'), '');
    NCE.vocabTestUi.bindMissedFooter(panel, {
      missed: st.missed, book: '', starId: '#gvStarAll', reviewId: '#gvReviewAll',
      flashId: '#gvFlashAll', spellId: '#gvSpellAll', srsId: '#gvSrsAll', returnTab: 'globalvocab',
    });
    panel.querySelector('#gvAgain').onclick = () => startTest(panel);
    panel.querySelector('#gvBack').onclick = () => renderIntro(panel);
    if (NCE.vocabTestUi) NCE.vocabTestUi.bindTrendBtn(panel, '#gvTrend');
  }

  NCE.registerFeature({ id: 'globalvocab', label: '总词汇量', icon: '🌐', onShow });
})();
