'use strict';
// 生词本：全教材去重词表的「列表式」浏览器
// - 筛选分类：全部 / 未学过 / 已学过 / 已掌握 / ⭐收藏
// - 每页 10 个，列表展示，带分页
// - 记住上次的册/筛选/页码/搜索，再次进入不重置
(function () {
  if (!window.NCE) { console.warn('[feat-vocab] NCE 未就绪'); return; }
  const { api, speak, escapeHtml, escapeAttr, registerFeature, goToDictionary, goToLesson, vocabTestUi } = window.NCE;

  const PER = 10; // 每页词数
  let V = null;   // 模块状态（跨 onShow 保留，解决“每次回到第一个”）
  let META = null;
  let panelEl = null;
  let bound = false;

  const style = document.createElement('style');
  style.textContent = `
    .voc-tools{display:flex;flex-direction:column;gap:12px;margin-bottom:14px}
    .voc-books,.voc-filters{display:flex;flex-wrap:wrap;gap:8px}
    .voc-chip{padding:6px 14px;border:1px solid var(--border,#e4e8f2);border-radius:999px;background:#fff;
      cursor:pointer;font-size:13px;font-weight:600;color:var(--ink-soft,#3a4356);user-select:none;transition:all .15s}
    .voc-chip:hover{border-color:var(--brand,#2f6fed);color:var(--brand,#2f6fed)}
    .voc-chip.on{background:var(--brand,#2f6fed);color:#fff;border-color:transparent}
    .voc-chip .c{opacity:.75;font-weight:700;margin-left:4px}
    .voc-search{display:flex;align-items:center;gap:10px}
    .voc-search input{flex:1;padding:9px 13px;border:1px solid var(--border,#e4e8f2);border-radius:10px;font-size:14px}
    .voc-search input:focus{outline:none;border-color:var(--brand,#2f6fed);box-shadow:0 0 0 3px rgba(47,111,237,.16)}
    .voc-list{display:flex;flex-direction:column;gap:8px}
    .voc-row{display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid var(--border,#e4e8f2);
      border-radius:12px;background:#fff;transition:box-shadow .15s,border-color .15s}
    .voc-row:hover{box-shadow:0 4px 14px rgba(30,45,90,.07)}
    .voc-spk{cursor:pointer;font-size:16px;opacity:.6;flex:none}
    .voc-spk:hover{opacity:1}
    .voc-main{flex:1;min-width:0}
    .voc-w{font-size:16px;font-weight:700;color:var(--ink,#1b2030)}
    .voc-phon{font-size:12px;color:var(--muted,#6b7280);margin-left:6px}
    .voc-pos{font-size:12px;color:var(--brand,#2f6fed);margin-left:6px}
    .voc-cn{font-size:13px;color:var(--ink-soft,#3a4356);margin-top:2px}
    .voc-lesson{font-size:11px;color:var(--muted-2,#9aa2b1);margin-top:2px}
    .voc-badge{font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;flex:none}
    .voc-badge.new{background:#f1f3f7;color:#8b93a2}
    .voc-badge.learning{background:#fff4e5;color:#c47f17}
    .voc-badge.mastered{background:#e9f9ef;color:#16a34a}
    .voc-acts{display:flex;gap:6px;flex:none}
    .voc-btn{border:1px solid var(--border,#e4e8f2);background:#fff;border-radius:8px;padding:5px 10px;
      font-size:12px;font-weight:600;cursor:pointer;color:var(--ink-soft,#3a4356);transition:all .12s}
    .voc-btn.know:hover{border-color:#16a34a;color:#16a34a}
    .voc-btn.link:hover{border-color:var(--brand,#2f6fed);color:var(--brand,#2f6fed)}
    .voc-star{font-size:17px;cursor:pointer;flex:none;line-height:1}
    .voc-star.on{color:#f5a623}
    .voc-star:not(.on){color:#cbd2de}
    .voc-pager{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:16px}
    .voc-pager button{border:1px solid var(--border,#e4e8f2);background:#fff;border-radius:8px;padding:7px 16px;
      font-size:13px;font-weight:600;cursor:pointer}
    .voc-pager button:disabled{opacity:.4;cursor:not-allowed}
    .voc-pager .pg{font-size:13px;color:var(--muted,#6b7280)}
    .voc-empty{text-align:center;color:var(--muted,#6b7280);padding:30px;font-size:14px}
    .voc-review-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
    .voc-review-btn{padding:7px 14px;border:1px solid var(--brand,#2f6fed);border-radius:8px;background:#eff6ff;
      color:var(--brand,#2f6fed);font-size:13px;font-weight:600;cursor:pointer}
    .voc-review-btn:hover{background:#dbeafe}
  `;
  document.head.appendChild(style);

  const FILTERS = [
    { k: 'all', label: '全部' },
    { k: 'new', label: '未学过' },
    { k: 'learned', label: '已学过' },
    { k: 'mastered', label: '已掌握' },
    { k: 'starred', label: '⭐收藏' },
  ];

  function badge(level) {
    if (level >= 3) return '<span class="voc-badge mastered">已掌握</span>';
    if (level >= 1) return '<span class="voc-badge learning">学习中</span>';
    return '<span class="voc-badge new">未学</span>';
  }

  // 各分类计数（用于 chip 上的数字）
  function counts() {
    const c = { all: V.words.length, new: 0, learned: 0, mastered: 0, starred: 0 };
    for (const w of V.words) {
      if (w.level >= 3) c.mastered++;
      if (w.level >= 1) c.learned++; else c.new++;
      if (V.stars.has(w.word.toLowerCase())) c.starred++;
    }
    return c;
  }

  function filteredWords() {
    let arr = V.words;
    const q = V.q.trim().toLowerCase();
    if (q) arr = arr.filter((w) => w.word.toLowerCase().includes(q) || (w.cn || '').includes(V.q.trim()));
    switch (V.filter) {
      case 'new': return arr.filter((w) => w.level === 0);
      case 'learned': return arr.filter((w) => w.level >= 1);
      case 'mastered': return arr.filter((w) => w.level >= 3);
      case 'starred': return arr.filter((w) => V.stars.has(w.word.toLowerCase()));
      default: return arr;
    }
  }

  // 只重绘列表 + 分页 + chip 计数（不动搜索框，保证输入不失焦）
  function renderList() {
    const arr = filteredWords();
    const pages = Math.max(1, Math.ceil(arr.length / PER));
    if (V.page >= pages) V.page = pages - 1;
    if (V.page < 0) V.page = 0;
    const slice = arr.slice(V.page * PER, V.page * PER + PER);

    const listBox = panelEl.querySelector('.voc-list');
    if (!arr.length) {
      listBox.innerHTML = `<div class="voc-empty">${V.filter === 'starred' ? '还没有收藏的单词，点单词右侧的 ☆ 收藏吧' : '没有符合条件的单词'}</div>`;
    } else {
      listBox.innerHTML = slice.map((w) => {
        const starred = V.stars.has(w.word.toLowerCase());
        return `<div class="voc-row">
          <span class="voc-spk" data-act="speak" data-word="${escapeAttr(w.word)}">🔊</span>
          <div class="voc-main">
            <div><span class="voc-w">${escapeHtml(w.word)}</span><span class="voc-phon">${escapeHtml(w.phon || '')}</span><span class="voc-pos">${escapeHtml(w.pos || '')}</span></div>
            <div class="voc-cn">${escapeHtml(w.cn || '')}</div>
            <div class="voc-lesson">首现 L${w.lesson} · ${escapeHtml(w.lessonTitle || '')}</div>
          </div>
          ${badge(w.level)}
          <div class="voc-acts">
            <button class="voc-btn link" data-act="dict" data-word="${escapeAttr(w.word)}" title="查词典">📕</button>
            <button class="voc-btn link" data-act="lesson" data-word="${escapeAttr(w.word)}" data-book="${w.book}" data-lesson="${w.lesson}" title="去课文">📖</button>
            <button class="voc-btn know" data-act="know" data-word="${escapeAttr(w.word)}">认识</button>
            <button class="voc-btn unknow" data-act="unknow" data-word="${escapeAttr(w.word)}">不认识</button>
          </div>
          <span class="voc-star ${starred ? 'on' : ''}" data-act="star" data-word="${escapeAttr(w.word)}" title="收藏到生词本">${starred ? '★' : '☆'}</span>
        </div>`;
      }).join('');
    }

    // 分页
    const pager = panelEl.querySelector('.voc-pager');
    pager.innerHTML =
      `<button data-act="prev" ${V.page <= 0 ? 'disabled' : ''}>← 上一页</button>` +
      `<span class="pg">第 ${arr.length ? V.page + 1 : 0} / ${pages} 页 · 共 ${arr.length} 词</span>` +
      `<button data-act="next" ${V.page >= pages - 1 ? 'disabled' : ''}>下一页 →</button>`;

    // 更新 chip 计数与选中态
    const c = counts();
    FILTERS.forEach((f) => {
      const chip = panelEl.querySelector(`.voc-chip[data-f="${f.k}"]`);
      if (!chip) return;
      chip.classList.toggle('on', V.filter === f.k);
      chip.querySelector('.c').textContent = c[f.k];
    });
  }

  function renderShell() {
    const books = (META && META.books) || [{ id: 1 }];
    panelEl.innerHTML =
      `<h2 style="margin:0 0 6px">📚 教材词表</h2>` +
      `<p style="margin:0 0 14px;font-size:13px;color:var(--muted,#6b7280)">浏览全册去重词库 · 点 ☆ 收藏即加入生词本</p>` +
      `<div class="voc-review-bar hidden" id="vocReviewBar">` +
      `<button type="button" class="voc-review-btn" id="vocReviewStarred">📕 逐个复习收藏</button>` +
      `<button type="button" class="voc-review-btn" id="vocGoStarred">⭐ 只看收藏</button>` +
      `</div>` +
      `<div class="voc-tools">
        <div class="voc-books">${books.map((b) => `<span class="voc-chip ${b.id === V.book ? 'on' : ''}" data-book="${b.id}">新概念${b.id}</span>`).join('')}</div>
        <div class="voc-filters">${FILTERS.map((f) => `<span class="voc-chip ${V.filter === f.k ? 'on' : ''}" data-f="${f.k}">${f.label}<span class="c">0</span></span>`).join('')}</div>
        <div class="voc-search"><input type="text" placeholder="搜索单词或释义…" value="${escapeAttr(V.q)}"></div>
      </div>
      <div class="voc-list"></div>
      <div class="voc-pager"></div>`;

    // 册切换
    panelEl.querySelectorAll('.voc-chip[data-book]').forEach((el) => {
      el.onclick = () => {
        const b = Number(el.dataset.book);
        if (b === V.book) return;
        V.book = b; V.page = 0;
        panelEl.querySelectorAll('.voc-chip[data-book]').forEach((x) => x.classList.toggle('on', Number(x.dataset.book) === b));
        reload();
      };
    });
    // 筛选切换
    panelEl.querySelectorAll('.voc-chip[data-f]').forEach((el) => {
      el.onclick = () => { V.filter = el.dataset.f; V.page = 0; renderList(); };
    });
    // 搜索（只重绘列表，不动输入框）
    const inp = panelEl.querySelector('.voc-search input');
    inp.oninput = () => { V.q = inp.value; V.page = 0; renderList(); };

    // 列表内交互（事件委托，绑定一次）
    if (!bound) { panelEl.addEventListener('click', onListClick); bound = true; }
    updateReviewBar();
  }

  function updateReviewBar() {
    const bar = panelEl && panelEl.querySelector('#vocReviewBar');
    if (!bar || !V) return;
    const n = V.stars ? V.stars.size : 0;
    bar.classList.toggle('hidden', !n);
    const rev = panelEl.querySelector('#vocReviewStarred');
    if (rev) {
      rev.onclick = () => {
        const list = V.words.filter((w) => V.stars.has(w.word.toLowerCase()));
        if (vocabTestUi && list.length) vocabTestUi.startMissedReview(list, V.book, 'vocab');
      };
    }
    const go = panelEl.querySelector('#vocGoStarred');
    if (go) {
      go.onclick = () => {
        V.filter = 'starred';
        V.page = 0;
        renderList();
        panelEl.querySelectorAll('.voc-chip[data-f]').forEach((el) => {
          el.classList.toggle('on', el.dataset.f === 'starred');
        });
      };
    }
  }

  function findWord(word) { return V.words.find((w) => w.word === word); }

  async function onListClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !panelEl.contains(el)) return;
    const act = el.dataset.act;
    if (act === 'prev') { V.page--; renderList(); return; }
    if (act === 'next') { V.page++; renderList(); return; }
    const word = el.dataset.word;
    if (act === 'speak') { speak(word); return; }
    if (act === 'dict') {
      const w = findWord(word);
      if (goToDictionary) goToDictionary(word, w && w.book);
      return;
    }
    if (act === 'lesson') {
      if (goToLesson) goToLesson(el.dataset.book, el.dataset.lesson, { highlightWord: word });
      return;
    }
    if (act === 'know' || act === 'unknow') {
      const rating = act === 'know' ? 'known' : 'unknown';
      const r = await api('/api/words/rate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, rating }),
      }).catch(() => null);
      const w = findWord(word);
      if (w && r && typeof r.level === 'number') w.level = r.level;
      renderList();
      return;
    }
    if (act === 'star') {
      const key = word.toLowerCase();
      const w = findWord(word);
      if (V.stars.has(key)) {
        await api('/api/vocab/unstar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word }) }).catch(() => {});
        V.stars.delete(key);
      } else {
        await api('/api/vocab/star', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(w || { word }) }).catch(() => {});
        V.stars.add(key);
      }
      renderList();
      return;
    }
  }

  async function reload() {
    const listBox = panelEl.querySelector('.voc-list');
    if (listBox) listBox.innerHTML = '<div class="voc-empty">加载中…</div>';
    const [wl, st] = await Promise.all([
      api('/api/words/list?book=' + V.book + '&filter=all').catch(() => ({ words: [] })),
      api('/api/vocab/stars').catch(() => ({ words: [] })),
    ]);
    V.words = (wl && wl.words) || [];
    V.stars = new Set(((st && st.words) || []).map((w) => String(w.word).toLowerCase()));
    updateReviewBar();
    renderList();
  }

  registerFeature({
    id: 'vocab', label: '词表', icon: '📚',
    async onShow(panel) {
      panelEl = panel;
      if (!V) V = { book: 1, filter: 'all', q: '', page: 0, words: [], stars: new Set() };
      const pend = window.NCE.pendingVocab;
      if (pend) {
        if (pend.filter) V.filter = pend.filter;
        if (pend.book != null) V.book = Number(pend.book);
        V.page = 0;
        NCE.pendingVocab = null;
      }
      if (!META) META = await api('/api/meta').catch(() => ({ books: [{ id: 1 }] }));
      renderShell();
      reload();
    },
  });
})();
