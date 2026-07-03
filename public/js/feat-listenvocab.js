'use strict';

// 听力词汇量测试 —— 听发音选中文释义，估算听力词汇量（自注册到「单词」合并标签）
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;

  const esc = NCE.escapeHtml;
  const escAttr = NCE.escapeAttr || esc;

  // ---------- 样式（前缀 lsv-）----------
  const style = document.createElement('style');
  style.textContent = `
    .lsv-wrap { max-width: 720px; margin: 0 auto; }
    .lsv-intro { background: #f4f7ff; border: 1px solid #dbe4ff; border-radius: 12px; padding: 16px 18px; font-size: 14px; color: #334; line-height: 1.8; }
    .lsv-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 16px 0; }
    .lsv-row label { font-size: 14px; color: #555; }
    .lsv-row select { padding: 7px 10px; border: 1px solid #ccd; border-radius: 8px; font-size: 14px; }
    .lsv-btn { padding: 9px 18px; border: 1px solid #cfd6e6; border-radius: 8px; background: #fff; cursor: pointer; font-size: 15px; color: #223; }
    .lsv-btn:hover { background: #f0f3fb; }
    .lsv-btn.primary { background: #2b57d6; border-color: #2b57d6; color: #fff; }
    .lsv-btn.primary:hover { background: #2149bd; }
    .lsv-btn:disabled { opacity: .5; cursor: not-allowed; }
    .lsv-hist { font-size: 13px; color: #667; margin-top: 12px; }
    .lsv-hist b { color: #2b57d6; }
    .lsv-hist ul { margin: 6px 0 0; padding-left: 18px; }
    .lsv-card { background: #fff; border: 1px solid #e5e9f2; border-radius: 12px; padding: 20px; margin-top: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
    .lsv-progress { font-size: 14px; color: #667; margin-bottom: 10px; }
    .lsv-play { font-size: 40px; background: none; border: none; cursor: pointer; line-height: 1; }
    .lsv-playrow { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .lsv-pos { font-size: 14px; color: #2563eb; font-weight: 600; }
    .lsv-hint { font-size: 13px; color: #889; margin-bottom: 12px; }
    .lsv-opts { display: flex; flex-direction: column; gap: 8px; }
    .lsv-opt { text-align: left; padding: 11px 14px; border: 1px solid #d5dbe8; border-radius: 10px; background: #fff; cursor: pointer; font-size: 15px; color: #223; }
    .lsv-opt:hover { background: #f0f3fb; }
    .lsv-opt .k { display: inline-block; width: 20px; color: #99a; font-size: 13px; }
    .lsv-opt.chosen-ok { border-color: #22c55e; background: #f0fdf4; }
    .lsv-opt.chosen-bad { border-color: #ef4444; background: #fef2f2; }
    .lsv-opt.is-answer { border-color: #22c55e; background: #f0fdf4; }
    .lsv-opt:disabled { cursor: default; }
    .lsv-feedback { margin-top: 12px; font-size: 15px; line-height: 1.7; }
    .lsv-feedback .w { font-weight: 800; font-size: 17px; }
    .lsv-feedback.ok { color: #15803d; }
    .lsv-feedback.bad { color: #b91c1c; }
    .lsv-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .lsv-sum-big { text-align: center; font-size: 44px; font-weight: 800; color: #2b57d6; margin: 8px 0 2px; }
    .lsv-sum-sub { text-align: center; color: #667; font-size: 14px; margin-bottom: 16px; }
    .lsv-band { margin: 10px 0; }
    .lsv-band .lab { display: flex; justify-content: space-between; font-size: 13px; color: #445; margin-bottom: 4px; }
    .lsv-bar { height: 12px; border-radius: 999px; background: #eef2f7; overflow: hidden; }
    .lsv-bar > span { display: block; height: 100%; background: #3b82f6; }
    .lsv-missed { margin-top: 18px; }
    .lsv-missed h4 { font-size: 14px; margin: 0 0 8px; color: #334; }
    .lsv-missed li { display: flex; gap: 10px; align-items: center; padding: 7px 10px; border: 1px solid #eee3e3; background: #fffafa; border-radius: 8px; margin-bottom: 6px; font-size: 14px; list-style: none; flex-wrap: wrap; }
    .lsv-missed ul { padding: 0; margin: 0; }
    .lsv-missed .w { font-weight: 700; }
    .lsv-missed .p { color: #64748b; font-size: 12px; }
    .lsv-missed .c { color: #333; flex: 1; min-width: 100px; }
    .lsv-note { font-size: 12px; color: #94a3b8; margin-top: 12px; line-height: 1.6; }
  `;
  document.head.appendChild(style);

  // ---------- 模块状态 ----------
  const st = {
    phase: 'intro', // intro | quiz | summary
    book: '1',
    size: 24,
    items: [],
    idx: 0,
    results: [], // {word, band, correct}
    missed: [], // grade 返回的完整词条（含 phon/cn/eg/lesson）
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

  function onShow(panel) {
    st.panel = panel;
    const ui = NCE.vocabTestUi;
    const autoStart = ui && ui.consumePending('listenvocab', st);
    if (st.phase === 'quiz' && st.items.length) renderQuiz(panel);
    else if (st.phase === 'summary' && st.lastReport) renderSummary(panel, st.lastReport);
    else renderIntro(panel, autoStart);
  }

  // ---------- 1. 入口页：说明 + 历史成绩 + 开始 ----------
  async function renderIntro(panel, autoStart) {
    st.phase = 'intro';
    const ui = NCE.vocabTestUi;
    const books = ui ? await ui.loadBooks('listen-vocab') : [{ id: '1', total: 360 }];
    if (!books.some((b) => String(b.id) === String(st.book))) st.book = books[0].id;
    panel.innerHTML =
      '<div class="lsv-wrap">' +
      '<div class="lsv-intro">👂 <b>听力词汇量测试</b> —— 只放发音、不显示单词，从 4 个中文释义中选出词义。' +
      '按课程先后分 3 段难度抽样，测完估算你在本册词表中「听得懂」的词汇量。选项猜中的概率已在估算中剔除。</div>' +
      '<div class="lsv-row">' +
      `<label>册：<select id="lsvBook">${ui ? ui.bookOptionsHtml(books, st.book) : '<option value="1">第1册</option>'}</select></label>` +
      '<label>题量：<select id="lsvSize">' +
      '<option value="12">12 词（快测）</option>' +
      '<option value="24" selected>24 词（推荐）</option>' +
      '<option value="36">36 词（更准）</option>' +
      '</select></label>' +
      '<button class="lsv-btn primary" id="lsvStart">开始测试 →</button>' +
      '</div>' +
      '<div class="lsv-hist" id="lsvHist">加载历史成绩…</div>' +
      '<div class="vt-compare" id="lsvIntroCompare"></div>' +
      '</div>';
    panel.querySelector('#lsvSize').value = String(st.size);
    panel.querySelector('#lsvBook').onchange = async (e) => {
      st.book = e.target.value;
      await ui.renderHistory('listen-vocab', st.book, panel.querySelector('#lsvHist'), '#2b57d6');
      ui.renderIntroPeek(panel, st.book, 'listen', '#2b57d6');
    };
    panel.querySelector('#lsvSize').onchange = (e) => { st.size = Number(e.target.value) || 24; };
    panel.querySelector('#lsvStart').onclick = () => startTest(panel);

    await ui.renderHistory('listen-vocab', st.book, panel.querySelector('#lsvHist'), '#2b57d6');
    ui.renderIntroPeek(panel, st.book, 'listen', '#2b57d6');
    if (autoStart) startTest(panel);
  }

  // ---------- 2. 测试 ----------
  async function startTest(panel) {
    const btn = panel.querySelector('#lsvStart');
    if (btn) { btn.disabled = true; btn.textContent = '出题中…'; }
    let data;
    try {
      data = await NCE.api(`/api/listen-vocab/sample?book=${st.book}&size=${st.size}`);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '开始测试 →'; }
      return; // api() 已 toast
    }
    st.items = data.items || [];
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
      '<div class="lsv-wrap"><div class="lsv-card">' +
      `<div class="lsv-progress">第 ${st.idx + 1} / ${st.items.length} 词 · 已答对 ${correctSoFar}</div>` +
      '<div class="lsv-playrow">' +
      '<button class="lsv-play" id="lsvPlay" title="播放发音">🔊</button>' +
      `<span class="lsv-pos">${esc(it.pos || '')}</span>` +
      '</div>' +
      '<div class="lsv-hint">听发音，选出这个词的中文释义（键盘 1-4 可选）。单词不会显示，答完揭晓。</div>' +
      '<div class="lsv-opts">' +
      it.options
        .map((o, i) => `<button class="lsv-opt" data-i="${i}"><span class="k">${i + 1}.</span>${esc(o)}</button>`)
        .join('') +
      '</div>' +
      '<div class="lsv-actions">' +
      '<button class="lsv-btn" id="lsvReplay">🔊 重听</button>' +
      '<button class="lsv-btn" id="lsvSkip">听不出来，跳过（算错）</button>' +
      '</div>' +
      '<div class="lsv-feedback" id="lsvFeedback"></div>' +
      '<div class="lsv-actions" id="lsvNextBox"></div>' +
      '</div></div>';

    st.answered = false;
    const play = () => NCE.speak(it.word);
    panel.querySelector('#lsvPlay').onclick = play;
    panel.querySelector('#lsvReplay').onclick = play;
    panel.querySelector('#lsvSkip').onclick = () => answer(panel, null);
    panel.querySelectorAll('.lsv-opt').forEach((b) => {
      b.onclick = () => answer(panel, it.options[Number(b.dataset.i)]);
    });
    play(); // 自动播放一遍
  }

  async function answer(panel, chosen) {
    if (st.answered) return;
    st.answered = true;
    const it = st.items[st.idx];
    let r;
    try {
      r = await post('/api/listen-vocab/grade', { book: st.book, word: it.word, chosen });
    } catch (e) {
      st.answered = false;
      return;
    }
    st.results.push({ word: it.word, band: it.band, correct: r.correct });
    if (!r.correct) st.missed.push(r);

    // 高亮选项：所选（对绿错红）+ 正确答案（绿）
    panel.querySelectorAll('.lsv-opt').forEach((b) => {
      const text = it.options[Number(b.dataset.i)];
      b.disabled = true;
      if (text === r.cn) b.classList.add('is-answer');
      if (chosen != null && text === chosen && !r.correct) b.classList.add('chosen-bad');
      if (chosen != null && text === chosen && r.correct) b.classList.add('chosen-ok');
    });
    const fb = panel.querySelector('#lsvFeedback');
    fb.className = 'lsv-feedback ' + (r.correct ? 'ok' : 'bad');
    fb.innerHTML =
      (r.correct ? '✅ 正确！这个词是 ' : (chosen == null ? '⏭️ 已跳过，这个词是 ' : '❌ 答错了，这个词是 ')) +
      `<span class="w">${esc(r.word)}</span> ${esc(r.phon || '')} ${esc(r.pos || '')} ${esc(r.cn)}` +
      (r.eg ? `<br>例：${esc(r.eg)}` : '');

    const isLast = st.idx >= st.items.length - 1;
    panel.querySelector('#lsvNextBox').innerHTML =
      `<button class="lsv-btn primary" id="lsvNext">${isLast ? '查看结果 →' : '下一词 →（回车）'}</button>`;
    panel.querySelector('#lsvNext').onclick = () => {
      if (isLast) finish(panel);
      else {
        st.idx++;
        renderQuiz(panel);
      }
    };
  }

  // 键盘：1-4 选项，回车下一词（仅本面板可见时生效）
  document.addEventListener('keydown', (e) => {
    const panel = st.panel;
    if (!panel || panel.classList.contains('hidden') || st.phase !== 'quiz') return;
    if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
    if (e.key === 'Enter') {
      const next = panel.querySelector('#lsvNext');
      if (next) { e.preventDefault(); next.click(); }
    } else if (/^[1-4]$/.test(e.key) && !st.answered) {
      const btn = panel.querySelector(`.lsv-opt[data-i="${Number(e.key) - 1}"]`);
      if (btn) btn.click();
    }
  });

  // ---------- 3. 结果页 ----------
  async function finish(panel) {
    let rep;
    try {
      rep = await post('/api/listen-vocab/finish', { book: st.book, results: st.results });
    } catch (e) {
      return;
    }
    st.lastReport = rep;
    st.phase = 'summary';
    renderSummary(panel, rep);
  }

  function renderSummary(panel, rep) {
    const ui = NCE.vocabTestUi;
    const weakest = ui.findWeakestBand(rep.bands);
    const weakestHintHtml = weakest
      ? `<div class="vt-weakest-hint">${esc(ui.weakestBandHint(weakest))}</div>`
      : '';
    const bandsHtml = ui.renderBandsHtml(rep.bands, { bandClass: 'lsv-band', barClass: 'lsv-bar', esc });

    const missedHtml = st.missed.length
      ? '<div class="lsv-missed"><h4>❌ 没听出来的词（' + st.missed.length + '）</h4><ul>' +
        st.missed.map((w) => ui.missedRowHtml(w, esc, escAttr, st.book)).join('') +
        '</ul>' +
        '<div class="lsv-actions"><button class="lsv-btn" id="lsvStarAll">⭐ 全部加入生词本</button>' +
        '<button class="lsv-btn" id="lsvFlashAll">🃏 背诵错词</button>' +
        '<button class="lsv-btn" id="lsvSpellAll">✍️ 默写错词</button>' +
        '<button class="lsv-btn" id="lsvSrsAll">🔁 间隔复习</button>' +
        '<button class="lsv-btn primary" id="lsvReviewAll">📕 逐个复习错词</button>' +
        '<span class="vt-miss-hint">或点每词旁 📕 / 📖</span></div></div>'
      : '';

    panel.innerHTML =
      '<div class="lsv-wrap"><div class="lsv-card">' +
      `<div class="lsv-sum-big">≈ ${rep.estimate} 词</div>` +
      `<div class="lsv-sum-sub">估算听力词汇量（本册词表共 ${rep.dictTotal} 词 · 本次答对 ${rep.correct}/${rep.asked}）</div>` +
      weakestHintHtml +
      bandsHtml +
      missedHtml +
      '<div class="vt-compare" id="lsvCompare"></div>' +
      '<div class="lsv-actions">' +
      '<button class="lsv-btn primary" id="lsvAgain">再测一次</button>' +
      '<button class="lsv-btn" id="lsvTrend">📈 查看趋势</button>' +
      '<button class="lsv-btn" id="lsvBack">返回说明页</button>' +
      '</div>' +
      '<div class="lsv-note">估算方法：按课程先后分 3 段难度分层抽样，各段正确率剔除 4 选 1 的猜中基线（25%）后乘以该段词表总数求和。多测几次取平均更稳。</div>' +
      '</div></div>';

    ui.bindMissedActions(panel.querySelector('.lsv-missed'), st.book);
    ui.bindMissedFooter(panel, {
      missed: st.missed, book: st.book, starId: '#lsvStarAll', reviewId: '#lsvReviewAll',
      flashId: '#lsvFlashAll', spellId: '#lsvSpellAll', srsId: '#lsvSrsAll', returnTab: 'listenvocab',
    });
    panel.querySelector('#lsvAgain').onclick = () => startTest(panel);
    panel.querySelector('#lsvBack').onclick = () => renderIntro(panel);
    ui.bindTrendBtn(panel, '#lsvTrend', st.book);
    NCE.vocabTestUi.renderCompare(panel, st.book, 'listen', '#2b57d6');
  }

  NCE.registerFeature({ id: 'listenvocab', label: '听力词汇量', icon: '👂', onShow });
})();
