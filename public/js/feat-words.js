'use strict';

// 背单词 / 单词记忆 / 默写 —— 卡片背诵 + 默写拼写 + 掌握度追踪（查词请用独立「📕 查词典」）
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;

  const esc = NCE.escapeHtml;
  const escAttr = NCE.escapeAttr || esc;

  // ---------- 注入样式（类名前缀 wd-）----------
  const style = document.createElement('style');
  style.textContent = `
    .wd-wrap { max-width: 820px; margin: 0 auto; }
    .wd-modes { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .wd-mode-btn { padding: 8px 16px; border: 1px solid #d0d7de; background: #fff; border-radius: 8px;
      cursor: pointer; font-size: 14px; color: #444; }
    .wd-mode-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; }
    .wd-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .wd-toolbar label { font-size: 13px; color: #555; display: flex; align-items: center; gap: 4px; }
    .wd-toolbar select, .wd-toolbar input[type=text] { padding: 5px 9px; border: 1px solid #d0d7de; border-radius: 6px; font-size: 14px; }
    .wd-toolbar input[type=text] { min-width: 180px; }
    .wd-msg { text-align: center; color: #94a3b8; padding: 24px 0; }
    .wd-empty { text-align: center; color: #94a3b8; padding: 40px 0; }
    .wd-spk { cursor: pointer; user-select: none; }

    /* 掌握度徽章 */
    .wd-badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
    .wd-lv0 { background: #f1f5f9; color: #64748b; }
    .wd-lv1 { background: #fef3c7; color: #b45309; }
    .wd-lv2 { background: #dbeafe; color: #1d4ed8; }
    .wd-lv3 { background: #dcfce7; color: #15803d; }

    /* 词典浏览列表 */
    .wd-list { list-style: none; padding: 0; margin: 0; }
    .wd-list li { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 8px; background: #fff; flex-wrap: wrap; }
    .wd-list .wd-word { font-weight: 600; color: #111; font-size: 16px; }
    .wd-list .wd-phon { color: #64748b; font-size: 13px; }
    .wd-list .wd-pos { color: #2563eb; font-size: 13px; font-weight: 600; }
    .wd-list .wd-cn { color: #333; flex: 1; min-width: 120px; }
    .wd-list .wd-src { color: #94a3b8; font-size: 12px; }
    .wd-quick { display: flex; gap: 6px; }
    .wd-mini { padding: 3px 9px; border: 1px solid #d0d7de; background: #fff; border-radius: 6px; cursor: pointer; font-size: 12px; }
    .wd-mini.ok { border-color: #86efac; color: #15803d; }
    .wd-mini.no { border-color: #fca5a5; color: #dc2626; }
    .wd-count { font-size: 13px; color: #64748b; margin-bottom: 8px; }

    /* 背诵卡片 */
    .wd-card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 34px 24px; min-height: 190px;
      background: #fbfcff; cursor: pointer; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.04);
      display: flex; flex-direction: column; justify-content: center; gap: 12px; }
    .wd-card .c-word { font-size: 36px; font-weight: 700; color: #111; }
    .wd-card .c-phon { font-size: 18px; color: #64748b; }
    .wd-card .c-pos { font-size: 15px; color: #2563eb; font-weight: 600; }
    .wd-card .c-cn { font-size: 22px; color: #222; }
    .wd-card .c-eg { font-size: 15px; color: #475569; line-height: 1.6; }
    .wd-card .c-src { font-size: 12px; color: #94a3b8; }
    .wd-card .c-hint { font-size: 12px; color: #94a3b8; }
    .wd-rate { display: flex; gap: 10px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
    .wd-btn { padding: 9px 18px; border: 1px solid #d0d7de; background: #fff; border-radius: 8px; cursor: pointer; font-size: 14px; }
    .wd-btn:hover { background: #f1f5f9; }
    .wd-btn.known { border-color: #86efac; color: #15803d; }
    .wd-btn.vague { border-color: #fcd34d; color: #b45309; }
    .wd-btn.unknown { border-color: #fca5a5; color: #dc2626; }
    .wd-progress-line { text-align: center; font-size: 13px; color: #64748b; margin-top: 10px; }

    /* 默写 */
    .wd-spell-cn { font-size: 24px; font-weight: 600; color: #111; text-align: center; margin: 10px 0; }
    .wd-spell-hint { font-size: 13px; color: #94a3b8; text-align: center; margin-bottom: 14px; }
    .wd-spell-input { width: 100%; padding: 12px; font-size: 18px; border: 2px solid #d0d7de;
      border-radius: 10px; box-sizing: border-box; text-align: center; }
    .wd-spell-input:focus { outline: none; border-color: #2563eb; }
    .wd-feedback { text-align: center; font-size: 16px; margin: 12px 0; min-height: 24px; }
    .wd-feedback.ok { color: #16a34a; }
    .wd-feedback.bad { color: #dc2626; }
    .wd-score { text-align: center; font-size: 14px; color: #475569; margin-top: 10px; }

    /* 进度条 */
    .wd-stat { margin-bottom: 16px; }
    .wd-stat .lab { display: flex; justify-content: space-between; font-size: 14px; color: #444; margin-bottom: 5px; }
    .wd-bar { height: 14px; border-radius: 999px; background: #eef2f7; overflow: hidden; }
    .wd-bar > span { display: block; height: 100%; }
    .wd-total-num { font-size: 32px; font-weight: 700; color: #111; text-align: center; margin: 8px 0 20px; }
  `;
  document.head.appendChild(style);

  const LV_NAME = ['未学', '学习中', '熟悉', '已掌握'];
  function badge(level) {
    const lv = Number(level) || 0;
    return `<span class="wd-badge wd-lv${lv}">${LV_NAME[lv]}</span>`;
  }

  // ---------- 模块状态 ----------
  const st = {
    mode: 'flash', // flash | spell | progress
    book: '1',
    flash: { words: [], idx: 0, flipped: false, rated: 0 },
    spell: { pool: [], cur: null, right: 0, wrong: 0, done: false },
  };

  function post(url, obj) {
    return NCE.api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
    });
  }

  // ---------- 入口 ----------
  async function onShow(panel) {
    // 深链支持：首页「默写单词」等入口可带模式跳入（NCE.pendingWords = { mode: 'spell' }）
    const pend = NCE.pendingWords;
    if (pend) {
      if (pend.mode) st.mode = pend.mode;
      if (pend.book) st.book = String(pend.book);
      if (pend.customWords && pend.customWords.length) {
        if (pend.mode === 'spell') st.spell.customWords = pend.customWords;
        else st.flash.customWords = pend.customWords;
      }
      NCE.pendingWords = null;
    }
    const ui = NCE.vocabTestUi;
    const books = ui ? await ui.loadBooks('listen-vocab') : [{ id: '1', total: 0 }, { id: '2', total: 0 }];
    if (!books.some((b) => String(b.id) === String(st.book))) st.book = books[0].id;
    const bookOpts = ui
      ? ui.bookOptionsHtml(books, st.book)
      : '<option value="1">第1册</option><option value="2">第2册</option>';
    panel.innerHTML =
      '<div class="wd-wrap">' +
      '<div class="wd-toolbar wd-bookbar" style="margin-bottom:12px">' +
      `<label>册：<select class="wd-book-global">${bookOpts}</select></label>` +
      '</div>' +
      '<div class="wd-modes">' +
      '<button class="wd-mode-btn wd-goto-dict" type="button">📕 查词典</button>' +
      '<button class="wd-mode-btn" data-m="flash">🃏 背诵</button>' +
      '<button class="wd-mode-btn" data-m="spell">✍️ 默写</button>' +
      '<button class="wd-mode-btn" data-m="progress">📊 进度</button>' +
      '</div>' +
      '<div class="wd-body"></div>' +
      '</div>';
    const bookSel = panel.querySelector('.wd-book-global');
    bookSel.value = st.book;
    bookSel.onchange = () => {
      st.book = bookSel.value;
      switchMode(panel, st.mode);
    };
    panel.querySelector('.wd-goto-dict').onclick = () => {
      if (NCE.goToDictionary) NCE.goToDictionary('', st.book);
    };
    panel.querySelectorAll('.wd-mode-btn[data-m]').forEach((b) => {
      b.onclick = () => switchMode(panel, b.dataset.m);
    });
    switchMode(panel, st.mode);
  }

  function switchMode(panel, mode) {
    st.mode = mode;
    panel.querySelectorAll('.wd-mode-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.m === mode)
    );
    const body = panel.querySelector('.wd-body');
    if (mode === 'flash') renderFlash(body);
    else if (mode === 'spell') renderSpell(body);
    else renderProgress(body);
  }

  function bindSpk(root) {
    root.querySelectorAll('.wd-spk').forEach((s) => {
      s.onclick = (e) => {
        e.stopPropagation();
        NCE.speak(s.dataset.speak);
      };
    });
  }

  // ============ 1. 背诵（卡片）============
  async function renderFlash(body) {
    body.innerHTML = '<div class="wd-msg">加载中…</div>';
    if (st.flash.customWords && st.flash.customWords.length) {
      st.flash.words = st.flash.customWords;
      st.flash.customWords = null;
    } else {
      const d = await NCE.api(`/api/words/study?book=${encodeURIComponent(st.book)}&mode=new&limit=20`);
      st.flash.words = d.words || [];
    }
    st.flash.idx = 0;
    st.flash.flipped = false;
    st.flash.rated = 0;
    if (!st.flash.words.length) {
      body.innerHTML =
        '<div class="wd-empty">没有可背诵的新词（本册未学词都标过了）。<br>' +
        '<button class="wd-mode-btn" type="button" id="wdGoSpell" style="margin-top:12px">✍️ 去默写巩固</button> ' +
        '<button class="wd-mode-btn wd-goto-dict" type="button" style="margin-top:12px">📕 查词典</button> ' +
        '<button class="wd-mode-btn" type="button" id="wdGoVocab" style="margin-top:12px">📚 去词表</button></div>';
      const goSpell = body.querySelector('#wdGoSpell');
      if (goSpell) goSpell.onclick = () => switchMode(panel, 'spell');
      const goDict = body.querySelector('.wd-goto-dict');
      if (goDict && NCE.goToDictionary) goDict.onclick = () => NCE.goToDictionary('', st.book);
      const goVocab = body.querySelector('#wdGoVocab');
      if (goVocab && NCE.gotoTab) goVocab.onclick = () => NCE.gotoTab('vocab');
      return;
    }
    body.innerHTML =
      '<div class="wd-card"></div>' +
      '<div class="wd-rate">' +
      '<button class="wd-btn known" data-r="known">✓ 认识</button>' +
      '<button class="wd-btn vague" data-r="vague">～ 模糊</button>' +
      '<button class="wd-btn unknown" data-r="unknown">✗ 不认识</button>' +
      '</div>' +
      '<div class="wd-progress-line"></div>';

    const card = body.querySelector('.wd-card');
    card.onclick = () => {
      st.flash.flipped = !st.flash.flipped;
      paintFlash(body);
    };
    body.querySelectorAll('.wd-rate .wd-btn').forEach((b) => {
      b.onclick = () => rateFlash(body, b.dataset.r);
    });
    paintFlash(body);
  }

  function paintFlash(body) {
    const s = st.flash;
    const w = s.words[s.idx];
    const card = body.querySelector('.wd-card');
    if (!card) return;
    if (!s.flipped) {
      card.innerHTML =
        `<div class="c-word">${esc(w.word)} <span class="wd-spk" data-speak="${escAttr(w.word)}">🔊</span></div>` +
        `<div class="c-phon">${esc(w.phon || '')}</div>` +
        `<div class="c-hint">点击卡片查看释义</div>`;
    } else {
      card.innerHTML =
        `<div class="c-pos">${esc(w.pos || '')}</div>` +
        `<div class="c-cn">${esc(w.cn || '')}</div>` +
        (w.eg ? `<div class="c-eg">${esc(w.eg)} <span class="wd-spk" data-speak="${escAttr(w.eg)}">🔊</span></div>` : '') +
        `<div class="c-src">${w.lesson ? `Lesson ${esc(String(w.lesson))}${w.lessonTitle ? ' · ' + esc(w.lessonTitle) : ''}` : '词汇量测试错词'}</div>`;
    }
    bindSpk(card);
    body.querySelector('.wd-progress-line').textContent =
      `第 ${s.idx + 1} / ${s.words.length} 张 · 本轮已评 ${s.rated}`;
  }

  async function rateFlash(body, rating) {
    const s = st.flash;
    const w = s.words[s.idx];
    await post('/api/words/rate', { word: w.word, rating });
    s.rated++;
    if (s.idx >= s.words.length - 1) {
      body.innerHTML =
        `<div class="wd-empty">本轮完成！共背诵 <b>${s.words.length}</b> 张卡片。<br>` +
        `<button class="wd-btn known" data-a="again">再来一轮</button></div>`;
      const again = body.querySelector('[data-a="again"]');
      if (again) again.onclick = () => renderFlash(body);
      return;
    }
    s.idx++;
    s.flipped = false;
    paintFlash(body);
  }

  // ============ 3. 默写 ============
  function renderSpell(body) {
    body.innerHTML =
      '<div class="wd-toolbar">' +
      '<button class="wd-btn" data-a="restart">重新开始</button>' +
      '</div>' +
      '<div class="wd-spell-cn"></div>' +
      '<div class="wd-spell-hint"></div>' +
      '<input class="wd-spell-input" type="text" placeholder="拼写这个单词，回车提交" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<div class="wd-feedback"></div>' +
      '<div class="wd-score"></div>';
    body.querySelector('[data-a="restart"]').onclick = () => loadSpellPool(body);
    const input = body.querySelector('.wd-spell-input');
    input.onkeydown = (e) => {
      if (e.key === 'Enter') checkSpell(body);
    };
    loadSpellPool(body);
  }

  async function loadSpellPool(body) {
    const s = st.spell;
    s.right = 0;
    s.wrong = 0;
    s.done = false;
    body.querySelector('.wd-feedback').textContent = '';
    let pool;
    if (st.spell.customWords && st.spell.customWords.length) {
      pool = st.spell.customWords;
      st.spell.customWords = null;
    } else {
      // 优先抽未掌握的词：先 due（学习中），不足再补 new
      const dueRes = await NCE.api(`/api/words/study?book=${encodeURIComponent(st.book)}&mode=due&limit=20`);
      pool = dueRes.words || [];
      if (pool.length < 20) {
        const newRes = await NCE.api(`/api/words/study?book=${encodeURIComponent(st.book)}&mode=new&limit=20`);
        const have = new Set(pool.map((w) => w.word));
        for (const w of newRes.words || []) {
          if (!have.has(w.word)) pool.push(w);
          if (pool.length >= 20) break;
        }
      }
    }
    s.pool = pool;
    const input = body.querySelector('.wd-spell-input');
    if (!s.pool.length) {
      body.querySelector('.wd-spell-cn').textContent = '没有需要默写的词了，太棒了！';
      body.querySelector('.wd-spell-hint').textContent = '';
      input.disabled = true;
      updateScore(body);
      return;
    }
    input.disabled = false;
    nextSpell(body);
  }

  function nextSpell(body) {
    const s = st.spell;
    if (!s.pool.length) {
      s.done = true;
      body.querySelector('.wd-spell-cn').textContent = '本轮默写完成！';
      body.querySelector('.wd-spell-hint').textContent = '点「重新开始」再来一轮';
      body.querySelector('.wd-spell-input').disabled = true;
      updateScore(body);
      return;
    }
    s.cur = s.pool.shift();
    const w = s.cur;
    body.querySelector('.wd-spell-cn').innerHTML =
      `${esc(w.cn || '')} <span class="wd-spk" data-speak="${escAttr(w.word)}">🔊</span>`;
    body.querySelector('.wd-spell-hint').textContent = w.pos || '根据中文释义拼写英文';
    const spk = body.querySelector('.wd-spell-cn .wd-spk');
    if (spk) spk.onclick = () => NCE.speak(w.word);
    const input = body.querySelector('.wd-spell-input');
    input.value = '';
    input.focus();
    updateScore(body);
  }

  async function checkSpell(body) {
    const s = st.spell;
    const w = s.cur;
    if (!w || s.done) return;
    const input = body.querySelector('.wd-spell-input');
    const guess = input.value.trim();
    if (!guess) return;
    const fb = body.querySelector('.wd-feedback');
    const r = await post('/api/words/spell', { word: w.word, input: guess });
    if (r.correct) {
      s.right++;
      fb.className = 'wd-feedback ok';
      fb.textContent = `✓ 正确！${r.answer}`;
    } else {
      s.wrong++;
      fb.className = 'wd-feedback bad';
      fb.innerHTML = `✗ 正确拼写：<b>${esc(r.answer)}</b>`;
    }
    updateScore(body);
    setTimeout(() => {
      fb.textContent = '';
      fb.className = 'wd-feedback';
      nextSpell(body);
    }, 1100);
  }

  function updateScore(body) {
    const s = st.spell;
    const total = s.right + s.wrong;
    body.querySelector('.wd-score').textContent =
      `本轮：对 ${s.right} · 错 ${s.wrong}` +
      (total ? ` · 正确率 ${Math.round((s.right / total) * 100)}%` : '') +
      ` · 剩余 ${s.pool.length}`;
  }

  // ============ 4. 进度 ============
  async function renderProgress(body) {
    body.innerHTML = '<div class="wd-msg">加载中…</div>';
    const d = await NCE.api(`/api/words/stats?book=${encodeURIComponent(st.book)}`);
    const total = d.total || 0;
    const bar = (label, num, color) => {
      const pct = total ? Math.round((num / total) * 100) : 0;
      return (
        '<div class="wd-stat">' +
        `<div class="lab"><span>${label}</span><span>${num} · ${pct}%</span></div>` +
        `<div class="wd-bar"><span style="width:${pct}%;background:${color}"></span></div>` +
        '</div>'
      );
    };
    body.innerHTML =
      `<div class="wd-total-num">${total} 个单词</div>` +
      bar('✅ 已掌握', d.mastered || 0, '#22c55e') +
      bar('📘 学习中', d.learning || 0, '#3b82f6') +
      bar('⬜ 未学', d.newCount || 0, '#94a3b8');
  }

  NCE.registerFeature({ id: 'words', label: '背单词', icon: '🔤', onShow });
})();
