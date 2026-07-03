'use strict';
// 教材词典：在新概念收录的单词库中按中英文检索
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;

  const { api, speak, escapeHtml, escapeAttr, goToLesson, toast } = NCE;
  const HIST_KEY = 'nce-dict-history';
  const HIST_MAX = 8;

  const style = document.createElement('style');
  style.textContent = `
    .dict-wrap { max-width: 760px; margin: 0 auto; }
    .dict-head { margin-bottom: 18px; }
    .dict-head h2 { margin: 0 0 6px; font-size: 20px; }
    .dict-head p { margin: 0; font-size: 14px; color: var(--muted, #6b7280); }
    .dict-tools { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
    .dict-search { display: flex; align-items: center; gap: 10px; }
    .dict-search input {
      flex: 1; padding: 12px 14px; font-size: 16px;
      border: 1px solid var(--border, #e4e8f2); border-radius: 12px;
    }
    .dict-search input:focus {
      outline: none; border-color: var(--brand, #2f6fed);
      box-shadow: 0 0 0 3px rgba(47, 111, 237, .16);
    }
    .dict-books { display: flex; flex-wrap: wrap; gap: 8px; }
    .dict-chip {
      padding: 6px 14px; border: 1px solid var(--border, #e4e8f2); border-radius: 999px;
      background: #fff; cursor: pointer; font-size: 13px; font-weight: 600;
      color: var(--ink-soft, #3a4356); user-select: none;
    }
    .dict-chip:hover { border-color: var(--brand, #2f6fed); color: var(--brand, #2f6fed); }
    .dict-chip.on { background: var(--brand, #2f6fed); color: #fff; border-color: transparent; }
    .dict-hist { margin-bottom: 4px; }
    .dict-hist-lab { font-size: 12px; color: var(--muted-2, #9aa2b1); margin-bottom: 8px; }
    .dict-hist-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .dict-hist-item {
      padding: 5px 12px; border: 1px dashed var(--border, #e4e8f2); border-radius: 999px;
      background: #fafbfc; cursor: pointer; font-size: 13px; color: var(--ink-soft, #3a4356);
    }
    .dict-hist-item:hover { border-color: var(--brand, #2f6fed); color: var(--brand, #2f6fed); background: #f0f5ff; }
    .dict-hist-clear {
      margin-left: 6px; padding: 0; border: none; background: none; cursor: pointer;
      font-size: 12px; color: var(--muted-2, #9aa2b1);
    }
    .dict-hist-clear:hover { color: var(--brand, #2f6fed); text-decoration: underline; }
    .dict-count { font-size: 13px; color: var(--muted, #6b7280); margin-bottom: 10px; min-height: 20px; }
    .dict-list { display: flex; flex-direction: column; gap: 10px; }
    .dict-item {
      padding: 14px 16px; border: 1px solid var(--border, #e4e8f2); border-radius: 12px; background: #fff;
    }
    .dict-item-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .dict-word { font-size: 22px; font-weight: 700; color: var(--ink, #1b2030); }
    .dict-phon { font-size: 14px; color: var(--muted, #6b7280); }
    .dict-pos { font-size: 13px; font-weight: 600; color: var(--brand, #2f6fed); }
    .dict-spk { cursor: pointer; font-size: 18px; opacity: .65; }
    .dict-spk:hover { opacity: 1; }
    .dict-star {
      cursor: pointer; font-size: 20px; line-height: 1; flex: none;
      color: #cbd2de; user-select: none; transition: color .12s, transform .12s;
    }
    .dict-star.on { color: #f5a623; }
    .dict-star:hover { transform: scale(1.12); }
    .dict-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
    .dict-cn { font-size: 16px; color: var(--ink-soft, #3a4356); margin-top: 8px; }
    .dict-eg { font-size: 14px; color: var(--muted, #6b7280); margin-top: 8px; line-height: 1.6; }
    .dict-src {
      display: inline-flex; align-items: center; gap: 4px; margin-top: 10px; padding: 0;
      border: none; background: none; cursor: pointer; font-size: 13px; color: var(--brand, #2f6fed);
    }
    .dict-src:hover { text-decoration: underline; }
    .dict-empty, .dict-hint { text-align: center; color: var(--muted, #6b7280); padding: 36px 16px; font-size: 14px; line-height: 1.7; }
    .dict-msg { text-align: center; color: var(--muted, #6b7280); padding: 24px 0; }
  `;
  document.head.appendChild(style);

  let panelEl = null;
  let META = null;
  let totalWords = 0;
  let timer = null;
  let starSet = new Set();
  let lastWords = [];
  const st = { book: '', q: '' };

  function wordKey(word) {
    return String(word || '').trim().toLowerCase();
  }

  async function loadStars() {
    const d = await api('/api/vocab/stars').catch(() => ({ words: [] }));
    starSet = new Set((d.words || []).map((w) => wordKey(w.word)));
  }

  function starBtn(w) {
    const on = starSet.has(wordKey(w.word));
    return `<button type="button" class="dict-star${on ? ' on' : ''}" data-word="${escapeAttr(w.word)}" title="${on ? '移出生词本' : '加入生词本'}">${on ? '★' : '☆'}</button>`;
  }

  async function toggleStar(word, btn) {
    const key = wordKey(word);
    const w = lastWords.find((x) => wordKey(x.word) === key);
    if (!w) return;
    const on = starSet.has(key);
    btn.classList.toggle('on', !on);
    btn.textContent = on ? '☆' : '★';
    btn.title = on ? '加入生词本' : '移出生词本';
    try {
      if (on) {
        await api('/api/vocab/unstar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: w.word }),
        });
        starSet.delete(key);
        toast(`已移出生词本：${w.word}`, 'ok');
      } else {
        await api('/api/vocab/star', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: w.word,
            phon: w.phon || '',
            pos: w.pos || '',
            cn: w.cn || '',
            eg: w.eg || '',
            book: w.book,
            lesson: w.lesson,
          }),
        });
        starSet.add(key);
        toast(`⭐ 已加入生词本：${w.word}`, 'ok');
      }
    } catch (e) {
      btn.classList.toggle('on', on);
      btn.textContent = on ? '★' : '☆';
      btn.title = on ? '移出生词本' : '加入生词本';
    }
  }

  function bindResultActions(root) {
    root.querySelectorAll('.dict-spk').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        speak(el.dataset.speak);
      };
    });
    root.querySelectorAll('.dict-star').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        toggleStar(btn.dataset.word, btn);
      };
    });
    root.querySelectorAll('.dict-src').forEach((btn) => {
      btn.onclick = () => {
        if (!goToLesson) return;
        goToLesson(btn.dataset.book, btn.dataset.lesson, { highlightWord: btn.dataset.word });
      };
    });
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HIST_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.trim()) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(list) {
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, HIST_MAX)));
    } catch (e) { /* 存储满则忽略 */ }
  }

  function addHistory(q) {
    const text = String(q || '').trim();
    if (!text) return;
    const list = loadHistory().filter((s) => s !== text);
    list.unshift(text);
    saveHistory(list);
  }

  function clearHistory() {
    try { localStorage.removeItem(HIST_KEY); } catch (e) { /* ignore */ }
  }

  function historyHtml() {
    const list = loadHistory();
    if (!list.length) return '';
    return (
      '<div class="dict-hist">' +
      '<div class="dict-hist-lab">最近搜索' +
      '<button type="button" class="dict-hist-clear">清空</button></div>' +
      '<div class="dict-hist-list">' +
      list.map((q) => `<button type="button" class="dict-hist-item" data-q="${escapeAttr(q)}">${escapeHtml(q)}</button>`).join('') +
      '</div></div>'
    );
  }

  function bindHistory(root) {
    root.querySelectorAll('.dict-hist-item').forEach((btn) => {
      btn.onclick = () => {
        st.q = btn.dataset.q || '';
        const qInput = panelEl.querySelector('.dict-q');
        if (qInput) qInput.value = st.q;
        search();
      };
    });
    const clearBtn = root.querySelector('.dict-hist-clear');
    if (clearBtn) {
      clearBtn.onclick = () => {
        clearHistory();
        renderIdle();
      };
    }
  }

  async function loadTotal() {
    const d = await api('/api/words/stats').catch(() => ({ total: 0 }));
    totalWords = d.total || 0;
  }

  function renderIdle() {
    const countEl = panelEl.querySelector('.dict-count');
    const box = panelEl.querySelector('.dict-results');
    if (countEl) countEl.textContent = '';
    if (!box) return;
    box.innerHTML =
      historyHtml() +
      '<div class="dict-hint">输入关键词开始查询<br><span style="font-size:13px">例如：apple、搜查、被动语态</span></div>';
    bindHistory(box);
  }

  function renderShell() {
    const books = (META && META.books) || [{ id: 1, title: '第一册' }];
    panelEl.innerHTML =
      '<div class="dict-wrap">' +
      '<div class="dict-head">' +
      '<h2>📕 教材词典</h2>' +
      `<p>在新概念英语收录的 <b>${totalWords || '…'}</b> 个单词中检索，支持英文或中文释义。</p>` +
      '</div>' +
      '<div class="dict-tools">' +
      '<div class="dict-search">' +
      `<input type="text" class="dict-q" placeholder="输入英文单词或中文释义…" value="${escapeAttr(st.q)}" autocomplete="off">` +
      '</div>' +
      '<div class="dict-books">' +
      '<div class="dict-chip' + (st.book === '' ? ' on' : '') + '" data-book="">全部册</div>' +
      books.map((b) =>
        `<div class="dict-chip${String(st.book) === String(b.id) ? ' on' : ''}" data-book="${b.id}">第${b.id}册</div>`
      ).join('') +
      '</div>' +
      '</div>' +
      '<div class="dict-count"></div>' +
      '<div class="dict-results"></div>' +
      '</div>';

    const qInput = panelEl.querySelector('.dict-q');
    qInput.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        st.q = qInput.value;
        search();
      }, 250);
    };
    qInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        clearTimeout(timer);
        st.q = qInput.value;
        search();
      }
    };

    panelEl.querySelectorAll('.dict-chip').forEach((chip) => {
      chip.onclick = () => {
        st.book = chip.dataset.book || '';
        panelEl.querySelectorAll('.dict-chip').forEach((c) =>
          c.classList.toggle('on', c.dataset.book === st.book)
        );
        search();
      };
    });

    if (!st.q.trim()) renderIdle();
    setTimeout(() => qInput.focus(), 50);
  }

  async function search() {
    const countEl = panelEl.querySelector('.dict-count');
    const box = panelEl.querySelector('.dict-results');
    const q = st.q.trim();
    if (!q) {
      renderIdle();
      return;
    }

    countEl.textContent = '';
    box.innerHTML = '<div class="dict-msg">检索中…</div>';

    const params = `filter=all&q=${encodeURIComponent(q)}` +
      (st.book ? `&book=${encodeURIComponent(st.book)}` : '');
    const d = await api('/api/words/list?' + params).catch(() => ({ words: [], count: 0 }));
    const words = d.words || [];
    lastWords = words;
    addHistory(q);
    countEl.textContent = `找到 ${words.length} 个结果`;

    if (!words.length) {
      box.innerHTML = '<div class="dict-empty">没有匹配的单词，换个关键词试试。</div>';
      return;
    }

    box.innerHTML =
      '<div class="dict-list">' +
      words.map((w) =>
        '<article class="dict-item">' +
        '<div class="dict-item-head">' +
        `<span class="dict-word">${escapeHtml(w.word)}</span>` +
        (w.phon ? `<span class="dict-phon">${escapeHtml(w.phon)}</span>` : '') +
        (w.pos ? `<span class="dict-pos">${escapeHtml(w.pos)}</span>` : '') +
        `<span class="dict-actions">` +
        starBtn(w) +
        `<span class="dict-spk" data-speak="${escapeAttr(w.word)}" title="朗读">🔊</span>` +
        `</span>` +
        '</div>' +
        (w.cn ? `<div class="dict-cn">${escapeHtml(w.cn)}</div>` : '') +
        (w.eg ? `<div class="dict-eg">${escapeHtml(w.eg)}</div>` : '') +
        `<button type="button" class="dict-src" data-book="${w.book}" data-lesson="${w.lesson}" data-word="${escapeAttr(w.word)}">` +
        `📖 第${w.book}册 · Lesson ${w.lesson}${w.lessonTitle ? ' · ' + escapeHtml(w.lessonTitle) : ''} →` +
        '</button>' +
        '</article>'
      ).join('') +
      '</div>';

    bindResultActions(box);
  }

  NCE.registerFeature({
    id: 'dictionary',
    label: '查词典',
    icon: '📕',
    async onShow(panel) {
      panelEl = panel;
      const pend = NCE.pendingDictionary;
      if (pend) {
        if (pend.q != null) st.q = String(pend.q);
        if (pend.book != null) st.book = String(pend.book);
        NCE.pendingDictionary = null;
      }
      if (!META) META = await api('/api/meta').catch(() => ({ books: [{ id: 1 }] }));
      await Promise.all([loadTotal(), loadStars()]);
      renderShell();
      if (st.q.trim()) search();
    },
  });
})();
