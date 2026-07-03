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

  NCE.vocabTestUi = {
    fmtDate,
    avgEstimate,
    loadBooks,
    bookOptionsHtml,
    loadOverview,
    renderHistory,
    renderCompare,
    consumePending,
    goToVocabTest,
  };
})();
