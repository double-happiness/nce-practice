'use strict';
// 理解训练（Comprehension）—— 听力理解 + 阅读理解，题目由后端从精读文章自动生成
(function () {
  if (typeof window === 'undefined') return;
  if (!window.NCE || !NCE.registerFeature) {
    console.error('[comprehension] NCE 未就绪，模块未加载');
    return;
  }
  const esc = NCE.escapeHtml;
  const escAttr = NCE.escapeAttr;

  // ---- 样式（全部 comp- 前缀，浅色卡片风格）----
  function injectStyle() {
    if (document.getElementById('comp-style')) return;
    const style = document.createElement('style');
    style.id = 'comp-style';
    style.textContent = `
      .comp-wrap{max-width:760px;margin:0 auto}
      .comp-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:12px}
      .comp-head h2{margin:0;font-size:20px}
      .comp-head .sub{color:#6b7280;font-size:13px}
      .comp-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-top:14px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
      .comp-card h3{margin:0 0 12px;font-size:15px;color:#374151}
      .comp-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
      .comp-row .lbl{font-size:13px;color:#6b7280;min-width:3em}
      .comp-chip{padding:7px 16px;font-size:14px;border:1px solid #d1d5db;border-radius:999px;background:#fff;color:#374151;cursor:pointer}
      .comp-chip:hover{border-color:#2563eb}
      .comp-chip.on{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:700}
      .comp-btn{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:9px 18px;font-size:15px;cursor:pointer}
      .comp-btn:hover{background:#1d4ed8}
      .comp-btn:disabled{background:#9ca3af;cursor:not-allowed}
      .comp-btn.ghost{background:#fff;color:#374151;border:1px solid #d1d5db}
      .comp-btn.ghost:hover{background:#f3f4f6}
      .comp-progress{font-size:13px;color:#6b7280;margin-bottom:8px}
      .comp-scene{font-size:13px;color:#9ca3af;margin-bottom:10px}
      .comp-stem{font-size:19px;line-height:1.7;color:#111827;margin:8px 0 14px;word-break:break-word}
      .comp-stem .blank{color:#2563eb;font-weight:700;letter-spacing:1px}
      .comp-listen{display:flex;align-items:center;gap:12px;margin:6px 0 14px}
      .comp-listen .ear{font-size:40px;line-height:1}
      .comp-hint{color:#9ca3af;font-size:13px}
      .comp-opts{display:flex;flex-direction:column;gap:8px}
      .comp-opt{text-align:left;padding:11px 14px;font-size:15px;border:1px solid #e5e7eb;border-radius:10px;background:#fbfcfe;color:#374151;cursor:pointer;line-height:1.6}
      .comp-opt:hover{border-color:#2563eb;background:#eff6ff}
      .comp-opt .no{display:inline-block;width:1.6em;color:#9ca3af;font-weight:700}
      .comp-summary{text-align:center;padding:10px 0 4px}
      .comp-summary .big{font-size:42px;font-weight:800;color:#2563eb;line-height:1.1}
      .comp-summary .sub{color:#6b7280;margin-top:6px;font-size:14px}
      .comp-review{list-style:none;padding:0;margin:14px 0 0}
      .comp-review li{padding:12px;border:1px solid #eef2f7;border-radius:10px;background:#fbfcfe;margin-top:10px;font-size:14px;color:#374151;line-height:1.7}
      .comp-review li.bad{background:#fef2f2;border-color:#fecaca}
      .comp-review .en{font-size:15px;color:#111827}
      .comp-review .cn{color:#6b7280}
      .comp-review .pick{margin-top:4px}
      .comp-review .pick .ok{color:#059669;font-weight:700}
      .comp-review .pick .no{color:#dc2626;font-weight:700}
      .comp-review .tag{display:inline-block;font-size:12px;color:#6b7280;background:#f3f4f6;border-radius:6px;padding:1px 8px;margin-right:6px}
      .comp-spk{background:none;border:none;cursor:pointer;font-size:17px;padding:0 4px;vertical-align:middle}
      .comp-empty{text-align:center;padding:26px 10px;color:#6b7280;font-size:15px;line-height:1.8}
      .comp-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:16px}
    `;
    document.head.appendChild(style);
  }

  const TYPE_LABEL = { listen: '🎧 听句选义', read: '📖 读句选义', cloze: '✏️ 完形选词' };

  // ---- 模块状态 ----
  const st = {
    mode: 'listen', // listen | read
    book: 1,
    books: [], // [{book, lessons}] 来自 /api/comprehension/meta
    quiz: null, // 当前测验（后端下发）
    idx: 0,
    answers: [], // [{id, choice}]
  };
  let root = null;

  // ---- 设置区 ----
  function renderSetup() {
    const bookChips = st.books
      .map(
        (b) =>
          `<button class="comp-chip${b.book === st.book ? ' on' : ''}" data-book="${b.book}">第 ${b.book} 册（${b.lessons} 篇）</button>`,
      )
      .join('');
    root.innerHTML = `
      <div class="comp-head"><h2>🧩 理解训练</h2>
        <span class="sub">题目从精读文章自动生成：听懂 / 读懂每一句</span></div>
      <div class="comp-card">
        <h3>选择模式</h3>
        <div class="comp-row"><span class="lbl">模式</span>
          <button class="comp-chip${st.mode === 'listen' ? ' on' : ''}" data-mode="listen">🎧 听力理解</button>
          <button class="comp-chip${st.mode === 'read' ? ' on' : ''}" data-mode="read">📖 阅读理解</button>
        </div>
        <div class="comp-row"><span class="lbl">教材</span>${bookChips}</div>
        <div class="comp-row">
          <button class="comp-btn" id="compStart">开始（随机一课，5 题）</button>
        </div>
        <div class="comp-hint">${st.mode === 'listen' ? '听力模式只播语音不显示英文：听句子选出正确的中文意思。' : '阅读模式：读句选义 + 完形选词交替出题。'}</div>
      </div>`;

    root.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => { st.mode = b.dataset.mode; renderSetup(); };
    });
    root.querySelectorAll('[data-book]').forEach((b) => {
      b.onclick = () => { st.book = Number(b.dataset.book); renderSetup(); };
    });
    root.querySelector('#compStart').onclick = startQuiz;
  }

  function renderEmpty(msg) {
    root.innerHTML = `
      <div class="comp-head"><h2>🧩 理解训练</h2></div>
      <div class="comp-card"><div class="comp-empty">
        ${esc(msg || '该册暂无精读文章。')}<br>
        <div class="comp-actions">
          <button class="comp-btn ghost" id="compBack">返回设置</button>
          <button class="comp-btn" id="compGoLearn">📖 去教材学习看看</button>
        </div>
      </div></div>`;
    root.querySelector('#compBack').onclick = renderSetup;
    root.querySelector('#compGoLearn').onclick = () => NCE.gotoTab('learn');
  }

  // ---- 出题 / 答题 ----
  async function startQuiz() {
    let quiz;
    try {
      quiz = await NCE.api(
        `/api/comprehension/quiz?mode=${st.mode}&book=${st.book}&count=5`,
      );
    } catch (e) {
      renderEmpty(e && e.message);
      return;
    }
    if (!quiz.questions || !quiz.questions.length) {
      renderEmpty('本课未能生成题目，请再试一次。');
      return;
    }
    st.quiz = quiz;
    st.idx = 0;
    st.answers = [];
    renderQuestion();
  }

  function renderQuestion() {
    const quiz = st.quiz;
    const q = quiz.questions[st.idx];
    const from = `L${quiz.lesson} ${quiz.titleCn || quiz.title || ''}`;

    let stem = '';
    if (q.type === 'listen') {
      stem = `
        <div class="comp-listen"><span class="ear">🎧</span>
          <button class="comp-btn ghost" id="compReplay">🔊 再听一遍</button>
          <span class="comp-hint">听句子，选出正确的中文意思</span></div>`;
    } else if (q.type === 'cloze') {
      stem = `
        <div class="comp-hint">选出适合填入空格的单词</div>
        <div class="comp-stem">${esc(q.en).replace(/_{3,}/, '<span class="blank">_____</span>')}</div>`;
    } else {
      stem = `
        <div class="comp-hint">读句子，选出正确的中文意思</div>
        <div class="comp-stem">${esc(q.en)}</div>`;
    }

    const opts = q.options
      .map(
        (o, i) =>
          `<button class="comp-opt" data-choice="${escAttr(o)}"><span class="no">${'ABCD'.charAt(i) || i + 1}.</span>${esc(o)}</button>`,
      )
      .join('');

    root.innerHTML = `
      <div class="comp-head"><h2>🧩 理解训练</h2>
        <span class="sub">${st.mode === 'listen' ? '🎧 听力理解' : '📖 阅读理解'} · 第 ${quiz.book} 册</span></div>
      <div class="comp-card">
        <div class="comp-progress">第 ${st.idx + 1} / ${quiz.questions.length} 题 · ${esc(TYPE_LABEL[q.type] || '')}</div>
        <div class="comp-scene">出自 ${esc(from)}</div>
        ${stem}
        <div class="comp-opts">${opts}</div>
      </div>`;

    if (q.type === 'listen') {
      const replay = root.querySelector('#compReplay');
      replay.onclick = () => NCE.speak(q.speak);
      NCE.speak(q.speak); // 出题即自动播一遍
    }
    root.querySelectorAll('.comp-opt').forEach((b) => {
      b.onclick = () => answer(q.id, b.dataset.choice);
    });
  }

  function answer(id, choice) {
    st.answers.push({ id, choice });
    if (st.idx + 1 < st.quiz.questions.length) {
      st.idx++;
      renderQuestion();
    } else {
      grade();
    }
  }

  // ---- 判分 / 成绩单 ----
  async function grade() {
    let r;
    try {
      r = await NCE.api('/api/comprehension/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: st.quiz.quizId, answers: st.answers }),
      });
    } catch (e) {
      renderEmpty((e && e.message) || '判分失败，请重新开始一组。');
      return;
    }
    renderSummary(r);
  }

  function renderSummary(r) {
    const quiz = st.quiz;
    const rows = r.results
      .map((it) => {
        const spk = `<button class="comp-spk" data-speak="${escAttr(it.en)}" title="朗读原句">🔊</button>`;
        const pick = it.correct
          ? `<div class="pick"><span class="ok">✔ 答对</span> ${esc(it.choice)}</div>`
          : `<div class="pick"><span class="no">✘ 你的选择：</span>${esc(it.choice || '（未选）')}<br><span class="ok">✔ 正确答案：</span>${esc(it.answer)}</div>`;
        return `<li class="${it.correct ? '' : 'bad'}">
          <span class="tag">${esc(TYPE_LABEL[it.type] || '')}</span>
          <div class="en">${esc(it.en)} ${it.correct ? '' : spk}</div>
          <div class="cn">${esc(it.cn)}</div>
          ${pick}</li>`;
      })
      .join('');

    root.innerHTML = `
      <div class="comp-head"><h2>🧩 理解训练 · 成绩单</h2>
        <span class="sub">${st.mode === 'listen' ? '🎧 听力理解' : '📖 阅读理解'} · 第 ${quiz.book} 册 L${quiz.lesson}</span></div>
      <div class="comp-card">
        <div class="comp-summary">
          <div class="big">${r.accuracy}%</div>
          <div class="sub">答对 ${r.correct} / ${r.total} 题${r.accuracy === 100 ? '，太棒了！' : r.accuracy >= 60 ? '，继续加油！' : '，错句多听几遍再战。'}</div>
        </div>
        <ul class="comp-review">${rows}</ul>
        <div class="comp-actions">
          <button class="comp-btn" id="compAgain">🔁 再来一组</button>
          <button class="comp-btn ghost" id="compSetup">返回设置</button>
        </div>
      </div>`;

    root.querySelectorAll('.comp-spk').forEach((b) => {
      b.onclick = () => NCE.speak(b.dataset.speak);
    });
    root.querySelector('#compAgain').onclick = startQuiz;
    root.querySelector('#compSetup').onclick = renderSetup;
  }

  // ---- 注册 ----
  NCE.registerFeature({
    id: 'comprehension',
    label: '理解训练',
    icon: '🧩',
    onShow(panel) {
      injectStyle();
      root = document.createElement('div');
      root.className = 'comp-wrap';
      panel.innerHTML = '';
      panel.appendChild(root);
      root.innerHTML = '<div class="comp-empty">加载中…</div>';
      NCE.api('/api/comprehension/meta')
        .then((m) => {
          st.books = (m && m.books) || [];
          if (!st.books.length) {
            renderEmpty('暂无任何精读文章，先到「教材学习」逛逛吧。');
            return;
          }
          if (!st.books.some((b) => b.book === st.book)) st.book = st.books[0].book;
          renderSetup();
        })
        .catch(() => renderEmpty('加载失败，请确认服务是否在运行。'));
    },
  });
})();
