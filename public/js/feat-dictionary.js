'use strict';
// 教材词典：在新概念收录的单词库中按中英文检索
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;

  const { api, speak, escapeHtml, escapeAttr, goToLesson, toast } = NCE;
  const HIST_KEY = 'nce-dict-history';
  const BOOK_KEY = 'nce-dict-book';
  const QUEUE_KEY = 'nce-dict-queue';
  const HIST_MAX = 10;
  const PER_PAGE = 25;
  const LV_NAME = ['未学', '学习中', '熟悉', '已掌握'];
  const RETURN_LABELS = {
    listenvocab: '👂 返回听力测试',
    readvocab: '📖 返回阅读测试',
    globalvocab: '🌐 返回总词汇测试',
    vocab: '📚 返回词表',
  };

  const style = document.createElement('style');
  style.textContent = `
    .dict-wrap { max-width: 760px; margin: 0 auto; }
    .dict-head { margin-bottom: 18px; }
    .dict-head h2 { margin: 0 0 6px; font-size: 20px; }
    .dict-head p { margin: 0; font-size: 14px; color: var(--muted, #6b7280); }
    .dict-tools { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
    .dict-search { display: flex; align-items: center; gap: 8px; position: relative; }
    .dict-search input {
      flex: 1; padding: 12px 36px 12px 14px; font-size: 16px;
      border: 1px solid var(--border, #e4e8f2); border-radius: 12px;
    }
    .dict-search input:focus {
      outline: none; border-color: var(--brand, #2f6fed);
      box-shadow: 0 0 0 3px rgba(47, 111, 237, .16);
    }
    .dict-clear {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      border: none; background: none; cursor: pointer; font-size: 18px; color: var(--muted-2, #9aa2b1);
      line-height: 1; padding: 4px;
    }
    .dict-clear:hover { color: var(--ink-soft, #3a4356); }
    .dict-kbd { font-size: 11px; color: var(--muted-2, #9aa2b1); white-space: nowrap; }
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
    .dict-word {
      font-size: 22px; font-weight: 700; color: var(--ink, #1b2030); cursor: pointer;
      border-bottom: 1px dashed transparent;
    }
    .dict-word:hover { border-bottom-color: var(--brand, #2f6fed); color: var(--brand, #2f6fed); }
    .dict-phon { font-size: 14px; color: var(--muted, #6b7280); }
    .dict-pos { font-size: 13px; font-weight: 600; color: var(--brand, #2f6fed); }
    .dict-badge {
      font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; white-space: nowrap;
    }
    .dict-badge.lv0 { background: #f1f5f9; color: #64748b; }
    .dict-badge.lv1 { background: #fef3c7; color: #b45309; }
    .dict-badge.lv2 { background: #dbeafe; color: #1d4ed8; }
    .dict-badge.lv3 { background: #dcfce7; color: #15803d; }
    .dict-spk { cursor: pointer; font-size: 18px; opacity: .65; }
    .dict-spk:hover { opacity: 1; }
    .dict-star {
      cursor: pointer; font-size: 20px; line-height: 1; flex: none;
      color: #cbd2de; user-select: none; transition: color .12s, transform .12s;
      border: none; background: none; padding: 0;
    }
    .dict-star.on { color: #f5a623; }
    .dict-star:hover { transform: scale(1.12); }
    .dict-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
    .dict-cn { font-size: 16px; color: var(--ink-soft, #3a4356); margin-top: 8px; }
    .dict-eg { font-size: 14px; color: var(--muted, #6b7280); margin-top: 8px; line-height: 1.6; }
    .dict-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
    .dict-src {
      display: inline-flex; align-items: center; gap: 4px; padding: 0;
      border: none; background: none; cursor: pointer; font-size: 13px; color: var(--brand, #2f6fed);
    }
    .dict-src:hover { text-decoration: underline; }
    .dict-mark { background: #fef08a; color: inherit; border-radius: 3px; padding: 0 1px; }
    .dict-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
    .dict-pager button {
      border: 1px solid var(--border, #e4e8f2); background: #fff; border-radius: 8px;
      padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .dict-pager button:disabled { opacity: .4; cursor: not-allowed; }
    .dict-pager .pg { font-size: 13px; color: var(--muted, #6b7280); }
    .dict-empty, .dict-hint { text-align: center; color: var(--muted, #6b7280); padding: 36px 16px; font-size: 14px; line-height: 1.7; }
    .dict-msg { text-align: center; color: var(--muted, #6b7280); padding: 24px 0; }
    .dict-queue-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
      padding: 12px 14px; margin-bottom: 14px; border-radius: 12px;
      background: linear-gradient(135deg, #eff6ff, #f0fdf4); border: 1px solid #bfdbfe;
    }
    .dict-queue-bar .ql { font-size: 14px; font-weight: 700; color: #1e40af; }
    .dict-queue-bar .qr { display: flex; gap: 8px; flex-wrap: wrap; }
    .dict-queue-btn {
      padding: 6px 14px; border: 1px solid var(--border, #e4e8f2); border-radius: 8px;
      background: #fff; cursor: pointer; font-size: 13px; font-weight: 600;
    }
    .dict-queue-btn:hover { border-color: var(--brand, #2f6fed); color: var(--brand, #2f6fed); }
    .dict-queue-btn.primary { background: var(--brand, #2f6fed); color: #fff; border-color: transparent; }
    .dict-queue-btn.primary:hover { opacity: .92; color: #fff; }
    .dict-queue-done { text-align: center; padding: 40px 16px; }
    .dict-queue-done h3 { margin: 0 0 8px; font-size: 20px; color: #15803d; }
    .dict-tools.queue-hide { display: none; }
  `;
  document.head.appendChild(style);

  let panelEl = null;
  let META = null;
  let totalWords = 0;
  let timer = null;
  let starSet = new Set();
  let lastWords = [];
  let keyBound = false;
  const st = { book: '', q: '', page: 0, queue: null };

  function wordKey(word) {
    return String(word || '').trim().toLowerCase();
  }

  function loadBookPref() {
    try { return localStorage.getItem(BOOK_KEY) || ''; } catch (e) { return ''; }
  }

  function saveBookPref() {
    try { localStorage.setItem(BOOK_KEY, st.book); } catch (e) { /* ignore */ }
  }

  function syncHash() {
    const params = new URLSearchParams();
    const q = st.q.trim();
    if (q) params.set('q', q);
    if (st.book) params.set('book', st.book);
    const tail = params.toString();
    const hash = '#dictionary' + (tail ? '?' + tail : '');
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function hl(text, q) {
    const s = String(text == null ? '' : text);
    if (!q || !s) return escapeHtml(s);
    const kw = q.trim();
    if (!kw) return escapeHtml(s);
    const low = s.toLowerCase();
    const kwLow = kw.toLowerCase();
    let out = '';
    let i = 0;
    while (i < s.length) {
      const idx = low.indexOf(kwLow, i);
      if (idx < 0) {
        out += escapeHtml(s.slice(i));
        break;
      }
      out += escapeHtml(s.slice(i, idx));
      out += '<mark class="dict-mark">' + escapeHtml(s.slice(idx, idx + kw.length)) + '</mark>';
      i = idx + kw.length;
    }
    return out;
  }

  function levelBadge(lv) {
    const n = Number(lv) || 0;
    return `<span class="dict-badge lv${n}">${LV_NAME[n] || LV_NAME[0]}</span>`;
  }

  async function loadStars() {
    const d = await api('/api/vocab/stars').catch(() => ({ words: [] }));
    starSet = new Set((d.words || []).map((w) => wordKey(w.word)));
  }

  function starBtn(w) {
    const on = starSet.has(wordKey(w.word));
    return `<button type="button" class="dict-star${on ? ' on' : ''}" data-word="${escapeAttr(w.word)}" title="${on ? '移出生词本' : '加入生词本'}">${on ? '★' : '☆'}</button>`;
  }

  async function copyWord(word) {
    const text = String(word || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(`已复制：${text}`, 'ok');
    } catch (e) {
      toast(text, 'ok');
    }
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
    root.querySelectorAll('.dict-word').forEach((el) => {
      el.onclick = () => copyWord(el.textContent);
    });
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

  function loadQueue() {
    try {
      const raw = sessionStorage.getItem(QUEUE_KEY);
      if (!raw) { st.queue = null; return; }
      const q = JSON.parse(raw);
      if (!q || !Array.isArray(q.words) || !q.words.length) { st.queue = null; return; }
      st.queue = q;
      if (typeof st.queue.idx !== 'number') st.queue.idx = 0;
    } catch (e) {
      st.queue = null;
    }
  }

  function saveQueue() {
    if (st.queue && st.queue.words && st.queue.words.length) {
      sessionStorage.setItem(QUEUE_KEY, JSON.stringify(st.queue));
    } else {
      sessionStorage.removeItem(QUEUE_KEY);
    }
  }

  function exitQueue() {
    st.queue = null;
    sessionStorage.removeItem(QUEUE_KEY);
  }

  function inQueueMode() {
    return !!(st.queue && st.queue.words && st.queue.words.length);
  }

  function wordCardHtml(w, q) {
    const book = w.book != null ? w.book : (st.book || '');
    return (
      '<article class="dict-item">' +
      '<div class="dict-item-head">' +
      `<span class="dict-word" title="点击复制">${hl(w.word, q || w.word)}</span>` +
      (w.phon ? `<span class="dict-phon">${hl(w.phon, q || w.word)}</span>` : '') +
      (w.pos ? `<span class="dict-pos">${escapeHtml(w.pos)}</span>` : '') +
      levelBadge(w.level) +
      `<span class="dict-actions">` +
      starBtn(w) +
      `<span class="dict-spk" data-speak="${escapeAttr(w.word)}" title="朗读">🔊</span>` +
      `</span>` +
      '</div>' +
      (w.cn ? `<div class="dict-cn">${hl(w.cn, q || w.word)}</div>` : '') +
      (w.eg ? `<div class="dict-eg">${hl(w.eg, q || w.word)}</div>` : '') +
      (w.lesson
        ? '<div class="dict-foot">' +
          `<button type="button" class="dict-src" data-book="${book}" data-lesson="${w.lesson}" data-word="${escapeAttr(w.word)}">` +
          `📖 第${book}册 · Lesson ${w.lesson}${w.lessonTitle ? ' · ' + escapeHtml(w.lessonTitle) : ''} →` +
          '</button></div>'
        : '') +
      '</article>'
    );
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
    } catch (e) { /* ignore */ }
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
        st.page = 0;
        const qInput = panelEl.querySelector('.dict-q');
        if (qInput) qInput.value = st.q;
        updateClearBtn();
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

  function updateClearBtn() {
    const btn = panelEl && panelEl.querySelector('.dict-clear');
    if (btn) btn.classList.toggle('hidden', !st.q.trim());
  }

  async function loadTotal() {
    const d = await api('/api/words/stats' + (st.book ? `?book=${encodeURIComponent(st.book)}` : ''))
      .catch(() => ({ total: 0 }));
    totalWords = d.total || 0;
  }

  function renderIdle() {
    const countEl = panelEl.querySelector('.dict-count');
    const box = panelEl.querySelector('.dict-results');
    if (countEl) countEl.textContent = '';
    if (!box) return;
    let queueHint = '';
    try {
      const q = JSON.parse(sessionStorage.getItem(QUEUE_KEY) || 'null');
      if (q && q.words && q.words.length) {
        const left = Math.max(0, q.words.length - (Number(q.idx) || 0));
        queueHint =
          '<div class="dict-hist" style="margin-bottom:12px">' +
          `<button type="button" class="dict-hist-item" id="dictResumeQueue">继续错词复习（剩 ${left} 个）</button></div>`;
      }
    } catch (e) { /* ignore */ }
    box.innerHTML =
      queueHint +
      historyHtml() +
      '<div class="dict-hint">输入关键词开始查询<br><span style="font-size:13px">支持英文、中文释义、例句与音标 · 按 <b>/</b> 快速聚焦</span></div>';
    bindHistory(box);
    const resume = box.querySelector('#dictResumeQueue');
    if (resume) {
      resume.onclick = () => {
        loadQueue();
        if (inQueueMode()) renderQueueContent();
      };
    }
  }

  function renderShell() {
    const books = (META && META.books) || [{ id: 1, title: '第一册' }];
    panelEl.innerHTML =
      '<div class="dict-wrap">' +
      '<div class="dict-head">' +
      '<h2>📕 教材词典</h2>' +
      `<p>在${st.book ? `第${st.book}册` : '全部'}收录的 <b>${totalWords || '…'}</b> 个单词中检索。</p>` +
      '</div>' +
      '<div class="dict-queue-slot"></div>' +
      '<div class="dict-tools">' +
      '<div class="dict-search">' +
      `<input type="text" class="dict-q" placeholder="英文 / 中文 / 例句 / 音标…" value="${escapeAttr(st.q)}" autocomplete="off">` +
      `<button type="button" class="dict-clear${st.q.trim() ? '' : ' hidden'}" title="清空">×</button>` +
      '<span class="dict-kbd">/</span>' +
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
    const clearBtn = panelEl.querySelector('.dict-clear');
    qInput.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        st.q = qInput.value;
        st.page = 0;
        updateClearBtn();
        search();
      }, 250);
    };
    qInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        clearTimeout(timer);
        st.q = qInput.value;
        st.page = 0;
        search();
      }
      if (e.key === 'Escape') {
        st.q = '';
        st.page = 0;
        qInput.value = '';
        updateClearBtn();
        syncHash();
        renderIdle();
      }
    };
    clearBtn.onclick = () => {
      st.q = '';
      st.page = 0;
      qInput.value = '';
      qInput.focus();
      updateClearBtn();
      syncHash();
      renderIdle();
    };

    panelEl.querySelectorAll('.dict-chip').forEach((chip) => {
      chip.onclick = async () => {
        st.book = chip.dataset.book || '';
        st.page = 0;
        saveBookPref();
        panelEl.querySelectorAll('.dict-chip').forEach((c) =>
          c.classList.toggle('on', c.dataset.book === st.book)
        );
        await loadTotal();
        panelEl.querySelector('.dict-head p').innerHTML =
          `在${st.book ? `第${st.book}册` : '全部'}收录的 <b>${totalWords || '…'}</b> 个单词中检索。`;
        search();
      };
    });

    if (!st.q.trim() && !inQueueMode()) renderIdle();
    setTimeout(() => qInput.focus(), 50);
    updateQueueChrome();
  }

  function updateQueueChrome() {
    if (!panelEl) return;
    const tools = panelEl.querySelector('.dict-tools');
    const slot = panelEl.querySelector('.dict-queue-slot');
    const head = panelEl.querySelector('.dict-head');
    if (!inQueueMode()) {
      if (tools) tools.classList.remove('queue-hide');
      if (slot) slot.innerHTML = '';
      if (head) {
        head.querySelector('h2').textContent = '📕 教材词典';
        head.querySelector('p').style.display = '';
      }
      return;
    }
    if (tools) tools.classList.add('queue-hide');
    if (head) {
      head.querySelector('h2').textContent = '📕 错词复习';
      head.querySelector('p').style.display = 'none';
    }
    const { words, idx } = st.queue;
    if (slot) {
      slot.innerHTML =
        '<div class="dict-queue-bar">' +
        `<span class="ql">逐个复习错词 · 第 ${idx + 1} / ${words.length}</span>` +
        '<span class="qr">' +
        `<button type="button" class="dict-queue-btn" data-qact="prev" ${idx <= 0 ? 'disabled' : ''}>← 上一个</button>` +
        `<button type="button" class="dict-queue-btn primary" data-qact="next">${idx >= words.length - 1 ? '完成 ✓' : '下一个 →'}</button>` +
        '<button type="button" class="dict-queue-btn" data-qact="exit">退出复习</button>' +
        '</span></div>';
      slot.querySelectorAll('[data-qact]').forEach((btn) => {
        btn.onclick = () => {
          if (btn.dataset.qact === 'prev' && st.queue.idx > 0) {
            st.queue.idx--;
            saveQueue();
            renderQueueContent();
          } else if (btn.dataset.qact === 'next') {
            if (st.queue.idx >= st.queue.words.length - 1) {
              renderQueueDone();
            } else {
              st.queue.idx++;
              saveQueue();
              renderQueueContent();
            }
          } else if (btn.dataset.qact === 'exit') {
            exitQueue();
            updateQueueChrome();
            renderIdle();
          }
        };
      });
    }
  }

  async function renderQueueContent() {
    if (!inQueueMode()) return;
    updateQueueChrome();
    const countEl = panelEl.querySelector('.dict-count');
    const box = panelEl.querySelector('.dict-results');
    const raw = st.queue.words[st.queue.idx];
    if (!raw) return;
    countEl.textContent = `复习进度 ${st.queue.idx + 1} / ${st.queue.words.length}`;
    box.innerHTML = '<div class="dict-msg">加载中…</div>';
    const book = st.queue.book || raw.book || '';
    const params = `filter=all&q=${encodeURIComponent(raw.word)}` +
      (book ? `&book=${encodeURIComponent(book)}` : '');
    const d = await api('/api/words/list?' + params).catch(() => ({ words: [] }));
    const enriched = (d.words || []).find((x) => wordKey(x.word) === wordKey(raw.word)) || {
      ...raw,
      book: raw.book || book,
      level: 0,
    };
    lastWords = [enriched];
    box.innerHTML = '<div class="dict-list">' + wordCardHtml(enriched, raw.word) + '</div>';
    bindResultActions(box);
    speak(raw.word);
  }

  function renderQueueDone() {
    const n = st.queue.words.length;
    const returnTo = st.queue.returnTo;
    exitQueue();
    updateQueueChrome();
    panelEl.querySelector('.dict-count').textContent = '';
    let doneBtns =
      '<button type="button" class="dict-queue-btn primary" id="dictDoneVocab">📚 去词表</button>' +
      '<button type="button" class="dict-queue-btn" id="dictDoneWords">🔤 去背单词</button>';
    if (returnTo && returnTo.tab && RETURN_LABELS[returnTo.tab]) {
      doneBtns =
        `<button type="button" class="dict-queue-btn primary" id="dictDoneReturn">${RETURN_LABELS[returnTo.tab]}</button>` +
        doneBtns;
    }
    panelEl.querySelector('.dict-results').innerHTML =
      '<div class="dict-queue-done">' +
      `<h3>🎉 错词复习完成</h3>` +
      `<p>已浏览 ${n} 个错词。建议把它们加入生词本，或用「背单词」巩固。</p>` +
      '<div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
      doneBtns +
      '</div></div>';
    const ret = panelEl.querySelector('#dictDoneReturn');
    if (ret) ret.onclick = () => NCE.gotoTab(returnTo.tab);
    const v = panelEl.querySelector('#dictDoneVocab');
    if (v) v.onclick = () => NCE.gotoTab('vocab');
    const w = panelEl.querySelector('#dictDoneWords');
    if (w) w.onclick = () => NCE.gotoTab('words');
  }

  function renderResults(words, q) {
    const countEl = panelEl.querySelector('.dict-count');
    const box = panelEl.querySelector('.dict-results');
    const total = words.length;
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    if (st.page >= pages) st.page = pages - 1;
    const slice = words.slice(st.page * PER_PAGE, (st.page + 1) * PER_PAGE);

    countEl.textContent = total > PER_PAGE
      ? `找到 ${total} 个结果 · 第 ${st.page + 1} / ${pages} 页`
      : `找到 ${total} 个结果`;

    box.innerHTML =
      '<div class="dict-list">' +
      slice.map((w) => wordCardHtml(w, q)).join('') +
      '</div>' +
      (pages > 1
        ? `<div class="dict-pager">
            <button type="button" class="dict-prev" ${st.page <= 0 ? 'disabled' : ''}>上一页</button>
            <span class="pg">${st.page + 1} / ${pages}</span>
            <button type="button" class="dict-next" ${st.page >= pages - 1 ? 'disabled' : ''}>下一页</button>
          </div>`
        : '');

    bindResultActions(box);
    const prev = box.querySelector('.dict-prev');
    const next = box.querySelector('.dict-next');
    if (prev) prev.onclick = () => { st.page--; renderResults(lastWords, q); };
    if (next) next.onclick = () => { st.page++; renderResults(lastWords, q); };
  }

  async function search() {
    const box = panelEl.querySelector('.dict-results');
    const q = st.q.trim();
    if (!q) {
      syncHash();
      renderIdle();
      return;
    }

    box.innerHTML = '<div class="dict-msg">检索中…</div>';
    syncHash();

    const params = `filter=all&q=${encodeURIComponent(q)}` +
      (st.book ? `&book=${encodeURIComponent(st.book)}` : '');
    const d = await api('/api/words/list?' + params).catch(() => ({ words: [], count: 0 }));
    lastWords = d.words || [];
    addHistory(q);

    if (!lastWords.length) {
      panelEl.querySelector('.dict-count').textContent = '';
      box.innerHTML = '<div class="dict-empty">没有匹配的单词，换个关键词试试。<br><span style="font-size:13px">可搜英文、中文、例句或音标</span></div>';
      return;
    }

    renderResults(lastWords, q);
  }

  function bindGlobalKeys() {
    if (keyBound) return;
    keyBound = true;
    document.addEventListener('keydown', (e) => {
      if (!panelEl || !panelEl.isConnected) return;
      const panel = panelEl.closest('.panel');
      if (!panel || panel.classList.contains('hidden')) return;
      if (e.key === '/' && !/^(input|textarea|select)$/i.test(e.target.tagName)) {
        e.preventDefault();
        panelEl.querySelector('.dict-q')?.focus();
      }
      if (inQueueMode()) {
        if (e.key === 'ArrowRight' && !/^(input|textarea|select)$/i.test(e.target.tagName)) {
          e.preventDefault();
          const next = panelEl.querySelector('[data-qact="next"]');
          if (next) next.click();
        }
        if (e.key === 'ArrowLeft' && !/^(input|textarea|select)$/i.test(e.target.tagName)) {
          e.preventDefault();
          const prev = panelEl.querySelector('[data-qact="prev"]');
          if (prev && !prev.disabled) prev.click();
        }
      }
    });
  }

  function readHashQuery() {
    const raw = (location.hash || '').replace(/^#/, '');
    if (!raw.startsWith('dictionary')) return null;
    const qi = raw.indexOf('?');
    if (qi < 0) return null;
    const params = new URLSearchParams(raw.slice(qi + 1));
    return { q: params.get('q') || '', book: params.get('book') || '' };
  }

  NCE.registerFeature({
    id: 'dictionary',
    label: '查词典',
    icon: '📕',
    async onShow(panel) {
      panelEl = panel;
      bindGlobalKeys();
      loadQueue();
      let freshQueue = false;
      const pend = NCE.pendingDictionary;
      if (pend) {
        if (pend.reviewQueue) {
          loadQueue();
          freshQueue = true;
          if (pend.book != null) st.book = String(pend.book);
        } else {
          if (pend.q != null) st.q = String(pend.q);
          if (pend.book != null) st.book = String(pend.book);
        }
        st.page = 0;
        NCE.pendingDictionary = null;
      } else if (!inQueueMode()) {
        const fromHash = readHashQuery();
        if (fromHash) {
          st.q = fromHash.q;
          st.book = fromHash.book;
          st.page = 0;
        } else if (!st.book) {
          st.book = loadBookPref();
        }
      }
      if (!META) META = await api('/api/meta').catch(() => ({ books: [{ id: 1 }] }));
      await Promise.all([loadTotal(), loadStars()]);
      renderShell();
      if (inQueueMode()) {
        if (freshQueue) {
          st.queue.idx = 0;
          saveQueue();
        }
        renderQueueContent();
      } else if (st.q.trim()) {
        search();
      }
    },
  });
})();
