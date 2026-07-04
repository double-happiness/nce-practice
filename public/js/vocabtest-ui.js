'use strict';

// 听力/阅读词汇量测试共用 UI 辅助
(function () {
  const NCE = window.NCE;
  if (!NCE) return;

  const style = document.createElement('style');
  style.textContent = `
    .vt-compare { margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 14px; color: #445; line-height: 1.7; }
    .vt-compare-link { margin-left: 6px; padding: 4px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; font-size: 13px; color: #334; }
    .vt-compare-link:hover { background: #f1f5f9; }
    .vt-weakest-hint { margin: 0 0 14px; padding: 10px 12px; border-radius: 8px; background: #fffbeb; border: 1px solid #fcd34d; font-size: 14px; color: #92400e; line-height: 1.6; text-align: center; }
    .vt-weakest-tag { color: #b45309; font-weight: 600; font-size: 12px; margin-left: 4px; }
    .vt-bar-weakest > span { background: #f59e0b !important; }
    .vt-miss-acts { display: flex; gap: 4px; margin-left: auto; flex: none; }
    .vt-miss-btn { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 2px 8px; cursor: pointer; font-size: 14px; line-height: 1.2; }
    .vt-miss-btn:hover { background: #eff6ff; border-color: #3b82f6; }
    .vt-miss-spk { cursor: pointer; }
    .vt-miss-hint { font-size: 12px; color: #94a3b8; align-self: center; }
  `;
  document.head.appendChild(style);

  const escAttr = (s) => (NCE.escapeAttr || NCE.escapeHtml)(s);

  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function avgEstimate(tests, n) {
    if (!tests || !tests.length) return null;
    const slice = tests.slice(0, n || 3);
    return Math.round(slice.reduce((s, t) => s + t.estimate, 0) / slice.length);
  }

  async function loadBooks(apiPrefix) {
    try {
      const d = await NCE.api(`/api/${apiPrefix}/books`);
      return d.books && d.books.length ? d.books : [{ id: '1', total: 0 }];
    } catch (e) {
      return [{ id: '1', total: 0 }];
    }
  }

  function bookOptionsHtml(books, selected) {
    return books
      .map((b) => `<option value="${escAttr(b.id)}"${String(b.id) === String(selected) ? ' selected' : ''}>第${b.id}册（${b.total} 词）</option>`)
      .join('');
  }

  async function loadOverview(book) {
    try {
      return await NCE.api(`/api/vocab-test/overview?book=${encodeURIComponent(book)}`);
    } catch (e) {
      return null;
    }
  }

  async function renderHistory(apiPrefix, book, histEl, accent) {
    try {
      const h = await NCE.api(`/api/${apiPrefix}/history?book=${encodeURIComponent(book)}`);
      if (!h.count) {
        histEl.textContent = '本册还没有测试记录，测一次建立基线吧。';
        return;
      }
      const latest = h.tests[0];
      const avg = avgEstimate(h.tests, 3);
      const avgLine =
        h.tests.length >= 2 && avg != null
          ? ` · 近 ${Math.min(3, h.tests.length)} 次平均 <b style="color:${accent}">≈ ${avg}</b> 词`
          : '';
      histEl.innerHTML =
        `上次估算：<b style="color:${accent}">${latest.estimate}</b> / ${latest.dictTotal} 词` +
        `（${fmtDate(latest.ts)}，答对 ${latest.correct}/${latest.asked}）${avgLine}` +
        (h.tests.length > 1
          ? '<ul>' + h.tests.slice(1, 5).map((t) => `<li>${fmtDate(t.ts)}：${t.estimate} / ${t.dictTotal} 词</li>`).join('') + '</ul>'
          : '');
    } catch (e) {
      histEl.textContent = '';
    }
  }

  // 结果页：听读对比条（current = 'listen' | 'read'）
  async function renderCompare(panel, book, current, accent) {
    const box = panel.querySelector('.vt-compare');
    if (!box) return;
    const ov = await loadOverview(book);
    if (!ov) {
      box.innerHTML = '';
      return;
    }
    const other = current === 'listen' ? ov.read : ov.listen;
    const otherId = current === 'listen' ? 'readvocab' : 'listenvocab';
    const otherLabel = current === 'listen' ? '阅读' : '听力';
    const otherIcon = current === 'listen' ? '📖' : '👂';
    if (!other.latest) {
      box.innerHTML =
        `<div class="vt-compare-inner">本册尚未测过${otherLabel}词汇量，` +
        `<button type="button" class="vt-compare-link" data-goto="${otherId}">${otherIcon} 去测${otherLabel} →</button></div>`;
    } else {
      const curEst = current === 'listen' ? ov.listen.latest : ov.read.latest;
      const curVal = curEst ? curEst.estimate : null;
      const diff = curVal != null ? other.latest.estimate - curVal : null;
      let diffText = '';
      if (diff != null && diff !== 0) {
        diffText =
          diff > 0
            ? `（${otherLabel}比你刚测的${current === 'listen' ? '听力' : '阅读'}高约 <b>${diff}</b> 词）`
            : `（${otherLabel}比你刚测的${current === 'listen' ? '听力' : '阅读'}低约 <b>${-diff}</b> 词）`;
      } else if (diff === 0) {
        diffText = '（听读估算一致）';
      }
      box.innerHTML =
        `<div class="vt-compare-inner">${otherIcon} 本册${otherLabel}上次：<b style="color:${accent}">≈ ${other.latest.estimate}</b> / ${other.latest.dictTotal} 词 ${diffText} ` +
        `<button type="button" class="vt-compare-link" data-goto="${otherId}">再测${otherLabel} →</button></div>`;
    }
    box.querySelectorAll('[data-goto]').forEach((el) => {
      el.onclick = () => goToVocabTest(el.dataset.goto, book);
    });
  }

  function consumePending(target, st) {
    const pend = NCE.pendingVocabTest;
    if (!pend || pend.target !== target) return false;
    if (pend.book) st.book = String(pend.book);
    NCE.pendingVocabTest = null;
    return !!pend.start;
  }

  function goToVocabTest(target, book) {
    NCE.pendingVocabTest = { target, book: String(book || '1') };
    NCE.gotoTab(target);
  }

  function consumeVocabTrend(st) {
    const pend = NCE.pendingVocabTrend;
    if (!pend) return;
    if (pend.book) st.book = String(pend.book);
    NCE.pendingVocabTrend = null;
  }

  function goToVocabTrend(book) {
    NCE.pendingVocabTrend = { book: book != null ? String(book) : '' };
    NCE.gotoTab('vocabtrend');
  }

  // 结果页通用：绑定「查看趋势」
  function bindTrendBtn(panel, btnId, book) {
    const btn = panel.querySelector(btnId);
    if (btn) btn.onclick = () => goToVocabTrend(book);
  }

  // 入口页：显示另一项（听/读）的简要对比
  async function renderIntroPeek(panel, book, current, accent) {
    const boxes = panel.querySelectorAll('.vt-compare');
    const box = boxes[0];
    if (!box) return;
    const ov = await loadOverview(book);
    if (!ov) return;
    const other = current === 'listen' ? ov.read : ov.listen;
    const otherId = current === 'listen' ? 'readvocab' : 'listenvocab';
    const otherLabel = current === 'listen' ? '阅读' : '听力';
    const otherIcon = current === 'listen' ? '📖' : '👂';
    if (!other.latest) {
      box.innerHTML =
        `<div class="vt-compare-inner">本册${otherLabel}词汇量尚未测试，` +
        `<button type="button" class="vt-compare-link" data-goto="${otherId}">${otherIcon} 去测${otherLabel} →</button></div>`;
    } else {
      box.innerHTML =
        `<div class="vt-compare-inner">${otherIcon} 本册${otherLabel}上次：<b style="color:${accent}">≈ ${other.latest.estimate}</b> / ${other.latest.dictTotal} 词` +
        (other.avgN >= 2 ? ` · 近 ${other.avgN} 次均 ≈ ${other.avg}` : '') +
        ` <button type="button" class="vt-compare-link" data-goto="${otherId}">去测${otherLabel} →</button></div>`;
    }
    box.querySelectorAll('[data-goto]').forEach((el) => {
      el.onclick = () => goToVocabTest(el.dataset.goto, book);
    });
  }

  // 在 asked>0 的段中，est/total 最低者为最薄弱段
  function findWeakestBand(bands) {
    if (!bands || !bands.length) return null;
    let weakest = null;
    let lowest = Infinity;
    for (const b of bands) {
      if (!b.asked) continue;
      const ratio = b.total ? b.est / b.total : 0;
      if (ratio < lowest) {
        lowest = ratio;
        weakest = b;
      }
    }
    return weakest;
  }

  function weakestBandHint(weakest) {
    if (!weakest) return '';
    const scope =
      weakest.lessonMin != null
        ? `，建议重点复习 Lesson ${weakest.lessonMin}–${weakest.lessonMax}`
        : '，建议重点复习该难度段的词汇';
    return `${weakest.label}最薄弱${scope}`;
  }

  function renderBandsHtml(bands, { bandClass, barClass, esc }) {
    const weakest = findWeakestBand(bands);
    return (bands || [])
      .map((b) => {
        const pct = b.total ? Math.round((b.est / b.total) * 100) : 0;
        const isWeakest = weakest && b.band === weakest.band;
        const tag = isWeakest ? '<span class="vt-weakest-tag">⚠️ 最薄弱</span>' : '';
        const barCls = isWeakest ? `${barClass} vt-bar-weakest` : barClass;
        const lesson =
          b.lessonMin != null ? ` · Lesson ${b.lessonMin}–${b.lessonMax}` : '';
        return (
          `<div class="${bandClass}">` +
          `<div class="lab"><span>${esc(b.label)}${lesson} ${tag}</span>` +
          `<span>答对 ${b.correct}/${b.asked} → 约 ${b.est}/${b.total} 词</span></div>` +
          `<div class="${barCls}"><span style="width:${pct}%"></span></div>` +
          '</div>'
        );
      })
      .join('');
  }

  function missedRowHtml(w, esc, escAttr, book) {
    const b = book != null && book !== '' ? book : (w.book != null ? w.book : '');
    const acts =
      '<span class="vt-miss-acts">' +
      `<button type="button" class="vt-miss-btn" data-act="dict" data-word="${escAttr(w.word)}" data-book="${escAttr(b)}" title="查词典">📕</button>` +
      (w.lesson
        ? `<button type="button" class="vt-miss-btn" data-act="lesson" data-book="${escAttr(b)}" data-lesson="${w.lesson}" data-word="${escAttr(w.word)}" title="去课文">📖</button>`
        : '') +
      '</span>';
    return (
      '<li>' +
      `<span class="vt-miss-spk" data-speak="${escAttr(w.word)}">🔊</span>` +
      `<span class="w">${esc(w.word)}</span>` +
      `<span class="p">${esc(w.phon || '')}</span>` +
      `<span class="c">${esc(w.pos || '')} ${esc(w.cn)}</span>` +
      acts +
      '</li>'
    );
  }

  function bindMissedActions(root, book) {
    if (!root) return;
    root.querySelectorAll('.vt-miss-spk').forEach((s) => {
      s.onclick = () => NCE.speak(s.dataset.speak);
    });
    root.querySelectorAll('.vt-miss-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (btn.dataset.act === 'dict' && NCE.goToDictionary) {
          NCE.goToDictionary(btn.dataset.word, btn.dataset.book || book);
        } else if (btn.dataset.act === 'lesson' && NCE.goToLesson) {
          NCE.goToLesson(btn.dataset.book, btn.dataset.lesson, { highlightWord: btn.dataset.word });
        }
      };
    });
  }

  // 词汇量测试错词 → 词典逐个复习模式
  function startMissedReview(missed, book, returnTab) {
    if (!missed || !missed.length) return;
    const words = missed.map((w) => ({
      word: w.word,
      phon: w.phon || '',
      pos: w.pos || '',
      cn: w.cn || '',
      eg: w.eg || '',
      lesson: w.lesson,
      lessonTitle: w.lessonTitle || '',
      book: w.book != null ? w.book : book,
    }));
    try {
      sessionStorage.setItem('nce-dict-queue', JSON.stringify({
        book: String(book != null ? book : ''),
        words,
        idx: 0,
        returnTo: returnTab ? { tab: returnTab } : null,
      }));
    } catch (e) { /* ignore */ }
    NCE.goToDictionary(words[0].word, book, { forcePage: true, reviewQueue: true });
  }

  async function starAllMissed(missed, book) {
    for (const w of missed) {
      await NCE.api('/api/vocab/star', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: w.word,
          phon: w.phon || '',
          pos: w.pos || '',
          cn: w.cn || '',
          eg: w.eg || '',
          book: w.book != null ? w.book : (book ? Number(book) || book : 0),
          lesson: w.lesson,
        }),
      });
    }
  }

  async function enqueueMissedLearning(missed, book) {
    if (!missed || !missed.length) return;
    try {
      await NCE.api('/api/words/mark-missed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book: book || undefined,
          words: missed.map((w) => ({
            word: w.word,
            phon: w.phon || '',
            pos: w.pos || '',
            cn: w.cn || '',
            eg: w.eg || '',
            lesson: w.lesson,
            lessonTitle: w.lessonTitle || '',
            book: w.book != null ? w.book : book,
            band: w.band,
            bandLabel: w.bandLabel,
            source: w.source || 'vocab-test',
          })),
        }),
      });
    } catch (e) { /* ignore */ }
  }

  async function srsAllMissed(missed) {
    if (!missed || !missed.length) return 0;
    const d = await NCE.api('/api/srs/add-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: missed }),
    });
    return d && d.added != null ? d.added : 0;
  }

  function bindMissedFooter(panel, { missed, book, starId, reviewId, flashId, spellId, srsId, returnTab }) {
    if (!missed || !missed.length) return;
    const starBtn = starId ? panel.querySelector(starId) : null;
    if (starBtn) {
      starBtn.onclick = async () => {
        starBtn.disabled = true;
        try {
          await starAllMissed(missed, book);
          NCE.toast(`⭐ 已把 ${missed.length} 个词加入生词本`, 'ok');
          starBtn.textContent = '✓ 已加入生词本';
        } catch (e) {
          starBtn.disabled = false;
        }
      };
    }
    const reviewBtn = reviewId ? panel.querySelector(reviewId) : null;
    if (reviewBtn) reviewBtn.onclick = () => startMissedReview(missed, book, returnTab);
    const flashBtn = flashId ? panel.querySelector(flashId) : null;
    if (flashBtn) flashBtn.onclick = () => startMissedWords(missed, book, 'flash');
    const spellBtn = spellId ? panel.querySelector(spellId) : null;
    if (spellBtn) spellBtn.onclick = () => startMissedWords(missed, book, 'spell');
    const srsBtn = srsId ? panel.querySelector(srsId) : null;
    if (srsBtn) {
      srsBtn.onclick = async () => {
        srsBtn.disabled = true;
        try {
          await enqueueMissedLearning(missed, book);
          const n = await srsAllMissed(missed);
          NCE.toast(`🔁 已将 ${n} 个词加入间隔复习`, 'ok');
          srsBtn.textContent = '✓ 已加入复习';
        } catch (e) {
          srsBtn.disabled = false;
        }
      };
    }
  }

  function mapMissedWords(missed, book) {
    return missed.map((w) => ({
      word: w.word,
      phon: w.phon || '',
      pos: w.pos || '',
      cn: w.cn || '',
      eg: w.eg || '',
      lesson: w.lesson,
      lessonTitle: w.lessonTitle || '',
      book: w.book != null ? w.book : book,
    }));
  }

  function startMissedWords(missed, book, mode) {
    if (!missed || !missed.length) return;
    enqueueMissedLearning(missed, book);
    NCE.pendingWords = {
      mode: mode || 'flash',
      book: String(book != null && book !== '' ? book : '1'),
      customWords: mapMissedWords(missed, book),
    };
    NCE.gotoTab('words');
  }

  // 根据各 CEFR 段掌握比例给出粗估水平（总词汇量结果页用）
  function cefrLevelHint(bands) {
    if (!bands || !bands.length) return '';
    let low = null;
    let high = null;
    for (const b of bands) {
      if (!b.asked || !b.total) continue;
      const ratio = b.est / b.total;
      const m = (b.label || '').match(/（([A-C]\d)）/);
      const tag = m ? m[1] : null;
      if (!tag) continue;
      if (ratio >= 0.4) high = tag;
      if (ratio >= 0.2) low = low || tag;
    }
    if (!high && !low) return '';
    if (high && low && high !== low) return `各段掌握情况粗估约相当于 <b>${low}–${high}</b> 水平`;
    if (high) return `各段掌握情况粗估约相当于 <b>${high}</b> 及以上水平`;
    return low ? `各段掌握情况粗估约处于 <b>${low}</b> 附近` : '';
  }

  NCE.vocabTestUi = {
    fmtDate,
    avgEstimate,
    loadBooks,
    bookOptionsHtml,
    loadOverview,
    renderHistory,
    renderCompare,
    renderIntroPeek,
    consumePending,
    goToVocabTest,
    consumeVocabTrend,
    goToVocabTrend,
    bindTrendBtn,
    findWeakestBand,
    weakestBandHint,
    renderBandsHtml,
    missedRowHtml,
    bindMissedActions,
    startMissedReview,
    starAllMissed,
    bindMissedFooter,
    startMissedWords,
    srsAllMissed,
    cefrLevelHint,
  };
})();
