'use strict';

// 阅读词汇量测试 —— 看英文单词选中文释义，估算阅读词汇量（自注册到「单词」合并标签）
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;

  const esc = NCE.escapeHtml;
  const escAttr = NCE.escapeAttr || esc;

  const style = document.createElement('style');
  style.textContent = `
    .rsv-wrap { max-width: 720px; margin: 0 auto; }
    .rsv-intro { background: #f4fff7; border: 1px solid #d4edda; border-radius: 12px; padding: 16px 18px; font-size: 14px; color: #334; line-height: 1.8; }
    .rsv-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 16px 0; }
    .rsv-row label { font-size: 14px; color: #555; }
    .rsv-row select { padding: 7px 10px; border: 1px solid #ccd; border-radius: 8px; font-size: 14px; }
    .rsv-btn { padding: 9px 18px; border: 1px solid #cfd6e6; border-radius: 8px; background: #fff; cursor: pointer; font-size: 15px; color: #223; }
    .rsv-btn:hover { background: #f0f3fb; }
    .rsv-btn.primary { background: #15803d; border-color: #15803d; color: #fff; }
    .rsv-btn.primary:hover { background: #166534; }
    .rsv-btn:disabled { opacity: .5; cursor: not-allowed; }
    .rsv-hist { font-size: 13px; color: #667; margin-top: 12px; }
    .rsv-hist b { color: #15803d; }
    .rsv-hist ul { margin: 6px 0 0; padding-left: 18px; }
    .rsv-card { background: #fff; border: 1px solid #e5e9f2; border-radius: 12px; padding: 20px; margin-top: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
    .rsv-progress { font-size: 14px; color: #667; margin-bottom: 10px; }
    .rsv-wordrow { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
    .rsv-word { font-size: 36px; font-weight: 800; color: #1e293b; line-height: 1.2; }
    .rsv-phon { font-size: 15px; color: #64748b; }
    .rsv-pos { font-size: 14px; color: #15803d; font-weight: 600; }
    .rsv-hint { font-size: 13px; color: #889; margin-bottom: 12px; }
    .rsv-opts { display: flex; flex-direction: column; gap: 8px; }
    .rsv-opt { text-align: left; padding: 11px 14px; border: 1px solid #d5dbe8; border-radius: 10px; background: #fff; cursor: pointer; font-size: 15px; color: #223; }
    .rsv-opt:hover { background: #f0fdf4; }
    .rsv-opt .k { display: inline-block; width: 20px; color: #99a; font-size: 13px; }
    .rsv-opt.chosen-ok { border-color: #22c55e; background: #f0fdf4; }
    .rsv-opt.chosen-bad { border-color: #ef4444; background: #fef2f2; }
    .rsv-opt.is-answer { border-color: #22c55e; background: #f0fdf4; }
    .rsv-opt:disabled { cursor: default; }
    .rsv-feedback { margin-top: 12px; font-size: 15px; line-height: 1.7; }
    .rsv-feedback .w { font-weight: 800; font-size: 17px; }
    .rsv-feedback.ok { color: #15803d; }
    .rsv-feedback.bad { color: #b91c1c; }
    .rsv-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .rsv-sum-big { text-align: center; font-size: 44px; font-weight: 800; color: #15803d; margin: 8px 0 2px; }
    .rsv-sum-sub { text-align: center; color: #667; font-size: 14px; margin-bottom: 16px; }
    .rsv-band { margin: 10px 0; }
    .rsv-band .lab { display: flex; justify-content: space-between; font-size: 13px; color: #445; margin-bottom: 4px; }
    .rsv-bar { height: 12px; border-radius: 999px; background: #eef2f7; overflow: hidden; }
    .rsv-bar > span { display: block; height: 100%; background: #22c55e; }
    .rsv-missed { margin-top: 18px; }
    .rsv-missed h4 { font-size: 14px; margin: 0 0 8px; color: #334; }
    .rsv-missed li { display: flex; gap: 10px; align-items: center; padding: 7px 10px; border: 1px solid #eee3e3; background: #fffafa; border-radius: 8px; margin-bottom: 6px; font-size: 14px; list-style: none; flex-wrap: wrap; }
    .rsv-missed ul { padding: 0; margin: 0; }
    .rsv-missed .w { font-weight: 700; }
    .rsv-missed .p { color: #64748b; font-size: 12px; }
    .rsv-missed .c { color: #333; flex: 1; min-width: 100px; }
    .rsv-note { font-size: 12px; color: #94a3b8; margin-top: 12px; line-height: 1.6; }
  `;
  document.head.appendChild(style);

  const st = {
    phase: 'intro',
    book: '1',
    size: 24,
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

  function onShow(panel) {
    st.panel = panel;
    const ui = NCE.vocabTestUi;
    const autoStart = ui && ui.consumePending('readvocab', st);
    if (st.phase === 'quiz' && st.items.length) renderQuiz(panel);
    else if (st.phase === 'summary' && st.lastReport) renderSummary(panel, st.lastReport);
    else renderIntro(panel, autoStart);
  }

  async function renderIntro(panel, autoStart) {
    st.phase = 'intro';
    const ui = NCE.vocabTestUi;
    const books = ui ? await ui.loadBooks('read-vocab') : [{ id: '1', total: 360 }];
    if (!books.some((b) => String(b.id) === String(st.book))) st.book = books[0].id;
    panel.innerHTML =
      '<div class="rsv-wrap">' +
      '<div class="rsv-intro">📖 <b>阅读词汇量测试</b> —— 显示英文单词，从 4 个中文释义中选出词义。' +
      '按课程先后分 3 段难度抽样，测完估算你在本册词表中「看得懂」的词汇量。选项猜中的概率已在估算中剔除。</div>' +
      '<div class="rsv-row">' +
      `<label>册：<select id="rsvBook">${ui ? ui.bookOptionsHtml(books, st.book) : '<option value="1">第1册</option>'}</select></label>` +
      '<label>题量：<select id="rsvSize">' +
      '<option value="12">12 词（快测）</option>' +
      '<option value="24" selected>24 词（推荐）</option>' +
      '<option value="36">36 词（更准）</option>' +
      '</select></label>' +
      '<button class="rsv-btn primary" id="rsvStart">开始测试 →</button>' +
      '</div>' +
      '<div class="rsv-hist" id="rsvHist">加载历史成绩…</div>' +
      '</div>';
    panel.querySelector('#rsvSize').value = String(st.size);
    panel.querySelector('#rsvBook').onchange = async (e) => {
      st.book = e.target.value;
      await ui.renderHistory('read-vocab', st.book, panel.querySelector('#rsvHist'), '#15803d');
    };
    panel.querySelector('#rsvSize').onchange = (e) => { st.size = Number(e.target.value) || 24; };
    panel.querySelector('#rsvStart').onclick = () => startTest(panel);

    await ui.renderHistory('read-vocab', st.book, panel.querySelector('#rsvHist'), '#15803d');
    if (autoStart) startTest(panel);
  }

  async function startTest(panel) {
    const btn = panel.querySelector('#rsvStart');
    if (btn) { btn.disabled = true; btn.textContent = '出题中…'; }
    let data;
    try {
      data = await NCE.api(`/api/read-vocab/sample?book=${st.book}&size=${st.size}`);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '开始测试 →'; }
      return;
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
      '<div class="rsv-wrap"><div class="rsv-card">' +
      `<div class="rsv-progress">第 ${st.idx + 1} / ${st.items.length} 词 · 已答对 ${correctSoFar}</div>` +
      '<div class="rsv-wordrow">' +
      `<span class="rsv-word">${esc(it.word)}</span>` +
      (it.phon ? `<span class="rsv-phon">${esc(it.phon)}</span>` : '') +
      `<span class="rsv-pos">${esc(it.pos || '')}</span>` +
      '</div>' +
      '<div class="rsv-hint">选出这个英文单词的中文释义（键盘 1-4 可选）。</div>' +
      '<div class="rsv-opts">' +
      it.options
        .map((o, i) => `<button class="rsv-opt" data-i="${i}"><span class="k">${i + 1}.</span>${esc(o)}</button>`)
        .join('') +
      '</div>' +
      '<div class="rsv-actions">' +
      '<button class="rsv-btn" id="rsvSpeak">🔊 发音</button>' +
      '<button class="rsv-btn" id="rsvSkip">不认识，跳过（算错）</button>' +
      '</div>' +
      '<div class="rsv-feedback" id="rsvFeedback"></div>' +
      '<div class="rsv-actions" id="rsvNextBox"></div>' +
      '</div></div>';

    st.answered = false;
    panel.querySelector('#rsvSpeak').onclick = () => NCE.speak(it.word);
    panel.querySelector('#rsvSkip').onclick = () => answer(panel, null);
    panel.querySelectorAll('.rsv-opt').forEach((b) => {
      b.onclick = () => answer(panel, it.options[Number(b.dataset.i)]);
    });
  }

  async function answer(panel, chosen) {
    if (st.answered) return;
    st.answered = true;
    const it = st.items[st.idx];
    let r;
    try {
      r = await post('/api/read-vocab/grade', { book: st.book, word: it.word, chosen });
    } catch (e) {
      st.answered = false;
      return;
    }
    st.results.push({ word: it.word, band: it.band, correct: r.correct });
    if (!r.correct) st.missed.push(r);

    panel.querySelectorAll('.rsv-opt').forEach((b) => {
      const text = it.options[Number(b.dataset.i)];
      b.disabled = true;
      if (text === r.cn) b.classList.add('is-answer');
      if (chosen != null && text === chosen && !r.correct) b.classList.add('chosen-bad');
      if (chosen != null && text === chosen && r.correct) b.classList.add('chosen-ok');
    });
    const fb = panel.querySelector('#rsvFeedback');
    fb.className = 'rsv-feedback ' + (r.correct ? 'ok' : 'bad');
    fb.innerHTML =
      (r.correct ? '✅ 正确！' : (chosen == null ? '⏭️ 已跳过。' : '❌ 答错了。')) +
      ` 正确释义：<span class="w">${esc(r.cn)}</span>` +
      (r.eg ? `<br>例：${esc(r.eg)}` : '');

    const isLast = st.idx >= st.items.length - 1;
    panel.querySelector('#rsvNextBox').innerHTML =
      `<button class="rsv-btn primary" id="rsvNext">${isLast ? '查看结果 →' : '下一词 →（回车）'}</button>`;
    panel.querySelector('#rsvNext').onclick = () => {
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
      const next = panel.querySelector('#rsvNext');
      if (next) { e.preventDefault(); next.click(); }
    } else if (/^[1-4]$/.test(e.key) && !st.answered) {
      const btn = panel.querySelector(`.rsv-opt[data-i="${Number(e.key) - 1}"]`);
      if (btn) btn.click();
    }
  });

  async function finish(panel) {
    let rep;
    try {
      rep = await post('/api/read-vocab/finish', { book: st.book, results: st.results });
    } catch (e) {
      return;
    }
    st.lastReport = rep;
    st.phase = 'summary';
    renderSummary(panel, rep);
  }

  function renderSummary(panel, rep) {
    const bandsHtml = rep.bands
      .map((b) => {
        const pct = b.total ? Math.round((b.est / b.total) * 100) : 0;
        return (
          '<div class="rsv-band">' +
          `<div class="lab"><span>${esc(b.label)} · Lesson ${b.lessonMin}–${b.lessonMax}</span>` +
          `<span>答对 ${b.correct}/${b.asked} → 约 ${b.est}/${b.total} 词</span></div>` +
          `<div class="rsv-bar"><span style="width:${pct}%"></span></div>` +
          '</div>'
        );
      })
      .join('');

    const missedHtml = st.missed.length
      ? '<div class="rsv-missed"><h4>❌ 不认识的词（' + st.missed.length + '）</h4><ul>' +
        st.missed
          .map(
            (w) =>
              `<li><span class="wd-spk rsv-spk" data-speak="${escAttr(w.word)}">🔊</span>` +
              `<span class="w">${esc(w.word)}</span><span class="p">${esc(w.phon || '')}</span>` +
              `<span class="c">${esc(w.pos || '')} ${esc(w.cn)}</span></li>`
          )
          .join('') +
        '</ul>' +
        '<div class="rsv-actions"><button class="rsv-btn" id="rsvStarAll">⭐ 全部加入生词本</button></div></div>'
      : '';

    panel.innerHTML =
      '<div class="rsv-wrap"><div class="rsv-card">' +
      `<div class="rsv-sum-big">≈ ${rep.estimate} 词</div>` +
      `<div class="rsv-sum-sub">估算阅读词汇量（本册词表共 ${rep.dictTotal} 词 · 本次答对 ${rep.correct}/${rep.asked}）</div>` +
      bandsHtml +
      missedHtml +
      '<div class="vt-compare" id="rsvCompare"></div>' +
      '<div class="rsv-actions">' +
      '<button class="rsv-btn primary" id="rsvAgain">再测一次</button>' +
      '<button class="rsv-btn" id="rsvBack">返回说明页</button>' +
      '</div>' +
      '<div class="rsv-note">估算方法：按课程先后分 3 段难度分层抽样，各段正确率剔除 4 选 1 的猜中基线（25%）后乘以该段词表总数求和。多测几次取平均更稳。</div>' +
      '</div></div>';

    panel.querySelectorAll('.rsv-spk').forEach((s) => {
      s.onclick = () => NCE.speak(s.dataset.speak);
    });
    panel.querySelector('#rsvAgain').onclick = () => startTest(panel);
    panel.querySelector('#rsvBack').onclick = () => renderIntro(panel);
    NCE.vocabTestUi.renderCompare(panel, st.book, 'read', '#15803d');
    const starAll = panel.querySelector('#rsvStarAll');
    if (starAll) {
      starAll.onclick = async () => {
        starAll.disabled = true;
        try {
          for (const w of st.missed) {
            await post('/api/vocab/star', {
              word: w.word, phon: w.phon, pos: w.pos, cn: w.cn, eg: w.eg,
              book: Number(st.book), lesson: w.lesson,
            });
          }
          NCE.toast(`⭐ 已把 ${st.missed.length} 个词加入生词本`, 'ok');
          starAll.textContent = '✓ 已加入生词本';
        } catch (e) {
          starAll.disabled = false;
        }
      };
    }
  }

  NCE.registerFeature({ id: 'readvocab', label: '阅读词汇量', icon: '📖', onShow });
})();
