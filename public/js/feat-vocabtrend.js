'use strict';

// 词汇量历次估算趋势 —— 本册听/读 + 全局总词汇量折线图
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;

  const esc = NCE.escapeHtml;
  const LISTEN_COLOR = '#2b57d6';
  const READ_COLOR = '#15803d';
  const GLOBAL_COLOR = '#7c3aed';

  const style = document.createElement('style');
  style.textContent = `
    .vtd-wrap { max-width: 720px; margin: 0 auto; }
    .vtd-intro {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 16px 18px; font-size: 14px; color: #334; line-height: 1.8;
    }
    .vtd-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 16px 0; }
    .vtd-row label { font-size: 14px; color: #555; }
    .vtd-row select {
      padding: 7px 10px; border: 1px solid #ccd; border-radius: 8px; font-size: 14px;
    }
    .vtd-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; color: #556; margin-bottom: 8px; }
    .vtd-legend span { display: inline-flex; align-items: center; gap: 6px; }
    .vtd-legend i { display: inline-block; width: 14px; height: 3px; border-radius: 2px; }
    .vtd-card {
      background: #fff; border: 1px solid #e5e9f2; border-radius: 12px;
      padding: 18px 20px; margin-top: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.04);
    }
    .vtd-card h3 { margin: 0 0 12px; font-size: 15px; color: #374151; }
    .vtd-chart { width: 100%; height: 180px; display: block; }
    .vtd-empty { color: #94a3b8; font-size: 14px; padding: 28px 0; text-align: center; line-height: 1.7; }
    .vtd-empty a { color: #2b57d6; cursor: pointer; text-decoration: underline; }
    .vtd-sum { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .vtd-sum-item {
      flex: 1; min-width: 140px; padding: 10px 12px; border-radius: 10px;
      background: #f8fafc; border: 1px solid #e2e8f0; font-size: 13px; color: #556; line-height: 1.6;
    }
    .vtd-sum-item b { font-size: 22px; display: block; margin-top: 2px; }
    .vtd-sum-item.listen b { color: ${LISTEN_COLOR}; }
    .vtd-sum-item.read b { color: ${READ_COLOR}; }
    .vtd-sum-item.global b { color: ${GLOBAL_COLOR}; }
    .vtd-rec { width: 100%; border-collapse: collapse; font-size: 13px; }
    .vtd-rec th, .vtd-rec td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eef2f7; }
    .vtd-rec th { color: #889; font-weight: 600; font-size: 12px; }
    .vtd-rec .tag {
      display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
    }
    .vtd-rec .tag.listen { background: #eff6ff; color: ${LISTEN_COLOR}; }
    .vtd-rec .tag.read { background: #f0fdf4; color: ${READ_COLOR}; }
    .vtd-rec .tag.global { background: #f5f3ff; color: ${GLOBAL_COLOR}; }
    .vtd-links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .vtd-btn {
      padding: 8px 14px; border: 1px solid #cfd6e6; border-radius: 8px;
      background: #fff; cursor: pointer; font-size: 14px; color: #223;
    }
    .vtd-btn:hover { background: #f0f3fb; }
    .vtd-note { font-size: 12px; color: #94a3b8; margin-top: 12px; line-height: 1.6; }
    .vtd-sep { height: 1px; background: #eef2f7; margin: 20px 0; }
  `;
  document.head.appendChild(style);

  const st = { book: '1', panel: null };

  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function fmtDateShort(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function renderTrendChart(series, emptyHtml) {
    const all = series.flatMap((s) => s.points);
    if (!all.length) return emptyHtml || '<div class="vtd-empty">暂无记录</div>';

    const W = 700;
    const H = 180;
    const padL = 44;
    const padR = 20;
    const padT = 20;
    const padB = 32;
    const iw = W - padL - padR;
    const ih = H - padT - padB;

    const minTs = Math.min(...all.map((t) => t.ts));
    const maxTs = Math.max(...all.map((t) => t.ts));
    const tsSpan = maxTs - minTs || 86400000;

    const allEst = all.map((t) => t.estimate);
    let minY = Math.min(...allEst);
    let maxY = Math.max(...allEst);
    const pad = Math.max(10, Math.round((maxY - minY) * 0.1) || 20);
    minY = Math.max(0, minY - pad);
    maxY = maxY + pad;
    const ySpan = maxY - minY || 1;

    const x = (ts) => {
      if (all.length === 1) return padL + iw / 2;
      return padL + ((ts - minTs) / tsSpan) * iw;
    };
    const y = (v) => padT + (1 - (v - minY) / ySpan) * ih;

    const step = ySpan <= 50 ? 10 : ySpan <= 200 ? 50 : 100;
    const yTicks = [];
    for (let v = Math.ceil(minY / step) * step; v <= maxY; v += step) yTicks.push(v);
    if (yTicks.length < 2) {
      yTicks.length = 0;
      yTicks.push(minY, maxY);
    }

    const grid = yTicks
      .map(
        (v) =>
          `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}" stroke="#eef2f7"/>` +
          `<text x="2" y="${(y(v) + 4).toFixed(1)}" font-size="10" fill="#9ca3af">${Math.round(v)}</text>`
      )
      .join('');

    const xLabels =
      all.length > 1
        ? `<text x="${padL}" y="${H - 6}" font-size="10" fill="#9ca3af">${fmtDateShort(minTs)}</text>` +
          `<text x="${W - padR}" y="${H - 6}" font-size="10" fill="#9ca3af" text-anchor="end">${fmtDateShort(maxTs)}</text>`
        : `<text x="${(padL + iw / 2).toFixed(1)}" y="${H - 6}" font-size="10" fill="#9ca3af" text-anchor="middle">${fmtDateShort(minTs)}</text>`;

    const lines = series
      .map((s) => {
        if (!s.points.length) return '';
        const sorted = s.points.slice().sort((a, b) => a.ts - b.ts);
        let svg = '';
        if (sorted.length >= 2) {
          const pts = sorted.map((t) => `${x(t.ts).toFixed(1)},${y(t.estimate).toFixed(1)}`).join(' ');
          svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
        }
        svg += sorted
          .map(
            (t) =>
              `<circle cx="${x(t.ts).toFixed(1)}" cy="${y(t.estimate).toFixed(1)}" r="4" fill="${s.color}">` +
              `<title>${s.label} ${fmtDate(t.ts)}：≈ ${t.estimate} 词（答对 ${t.correct}/${t.asked}）</title></circle>`
          )
          .join('');
        return svg;
      })
      .join('');

    return (
      `<svg class="vtd-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
      grid +
      xLabels +
      lines +
      '</svg>'
    );
  }

  function renderRecords(rows) {
    if (!rows.length) return '<div class="vtd-empty">暂无记录</div>';
    const colorOf = { listen: LISTEN_COLOR, read: READ_COLOR, global: GLOBAL_COLOR };
    return (
      '<table class="vtd-rec"><thead><tr><th>类型</th><th>日期</th><th>估算</th><th>答对</th></tr></thead><tbody>' +
      rows
        .map(
          (t) =>
            `<tr><td><span class="tag ${t.kind}">${esc(t.label)}</span></td>` +
            `<td>${fmtDate(t.ts)}</td>` +
            `<td><b style="color:${colorOf[t.kind]}">${t.estimate}</b> / ${t.dictTotal}</td>` +
            `<td>${t.correct}/${t.asked}</td></tr>`
        )
        .join('') +
      '</tbody></table>'
    );
  }

  function bindGoto(panel) {
    panel.querySelectorAll('[data-goto]').forEach((el) => {
      el.onclick = () => NCE.gotoTab(el.dataset.goto);
    });
  }

  async function renderPage(panel) {
    panel.innerHTML = '<div class="vtd-wrap"><div class="vtd-intro">加载中…</div></div>';
    const ui = NCE.vocabTestUi;
    let data;
    try {
      data = await NCE.api(`/api/vocab-test/trend?book=${encodeURIComponent(st.book)}`);
    } catch (e) {
      panel.innerHTML = '<div class="vtd-wrap"><div class="vtd-empty">加载失败，请稍后重试。</div></div>';
      return;
    }

    const books =
      data.books && data.books.length
        ? data.books
        : ui
          ? await ui.loadBooks('listen-vocab')
          : [{ id: '1', total: 0 }];
    if (!books.some((b) => String(b.id) === String(st.book))) st.book = books[0].id;

    const listen = data.listen || [];
    const read = data.read || [];
    const global = data.global || [];
    const listenLatest = listen.length ? listen[listen.length - 1] : null;
    const readLatest = read.length ? read[read.length - 1] : null;
    const globalLatest = global.length ? global[global.length - 1] : null;

    const bookEmpty =
      '<div class="vtd-empty">本册尚无词汇量测试记录。<br>' +
      '先去测 <a data-goto="listenvocab">👂 听力</a> 或 <a data-goto="readvocab">📖 阅读</a> 词汇量吧。</div>';
    const globalEmpty =
      '<div class="vtd-empty">尚无总词汇量测试记录。<br>' +
      '去测 <a data-goto="globalvocab">🌐 总词汇量</a> 建立全局基线吧。</div>';

    const allRows = [
      ...listen.map((t) => ({ ...t, kind: 'listen', label: '听力' })),
      ...read.map((t) => ({ ...t, kind: 'read', label: '阅读' })),
      ...global.map((t) => ({ ...t, kind: 'global', label: '总词汇' })),
    ]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 15);

    panel.innerHTML =
      '<div class="vtd-wrap">' +
      '<div class="vtd-intro">📈 <b>词汇趋势</b> —— 汇总历次词汇量估算：上方为本册听/读对比，下方为基于内置词库的总词汇量走势。' +
      '悬停折线圆点可查看单次详情。</div>' +
      '<div class="vtd-row">' +
      `<label>本册：<select id="vtdBook">${ui ? ui.bookOptionsHtml(books, st.book) : '<option value="1">第1册</option>'}</select></label>` +
      '</div>' +
      '<div class="vtd-card">' +
      '<h3>本册听 / 读趋势</h3>' +
      '<div class="vtd-legend">' +
      `<span><i style="background:${LISTEN_COLOR}"></i>听力（${listen.length} 次）</span>` +
      `<span><i style="background:${READ_COLOR}"></i>阅读（${read.length} 次）</span>` +
      '</div>' +
      '<div class="vtd-sum">' +
      `<div class="vtd-sum-item listen">👂 听力最近<b>${listenLatest ? listenLatest.estimate : '—'}</b>${listenLatest ? ` / ${listenLatest.dictTotal} 词` : ' 尚未测试'}</div>` +
      `<div class="vtd-sum-item read">📖 阅读最近<b>${readLatest ? readLatest.estimate : '—'}</b>${readLatest ? ` / ${readLatest.dictTotal} 词` : ' 尚未测试'}</div>` +
      '</div>' +
      renderTrendChart(
        [
          { points: listen, color: LISTEN_COLOR, label: '听力' },
          { points: read, color: READ_COLOR, label: '阅读' },
        ],
        bookEmpty
      ) +
      '</div>' +
      '<div class="vtd-card">' +
      '<h3>🌐 总词汇量趋势</h3>' +
      '<div class="vtd-legend">' +
      `<span><i style="background:${GLOBAL_COLOR}"></i>总词汇（${global.length} 次，内置词库）</span>` +
      '</div>' +
      '<div class="vtd-sum">' +
      `<div class="vtd-sum-item global">🌐 总词汇最近<b>${globalLatest ? globalLatest.estimate : '—'}</b>${globalLatest ? ` / ${globalLatest.dictTotal} 词` : ' 尚未测试'}</div>` +
      '</div>' +
      renderTrendChart([{ points: global, color: GLOBAL_COLOR, label: '总词汇' }], globalEmpty) +
      '</div>' +
      '<div class="vtd-card"><h3>最近记录</h3>' +
      renderRecords(allRows) +
      '</div>' +
      '<div class="vtd-links">' +
      '<button type="button" class="vtd-btn" data-goto="listenvocab">👂 去测听力</button>' +
      '<button type="button" class="vtd-btn" data-goto="readvocab">📖 去测阅读</button>' +
      '<button type="button" class="vtd-btn" data-goto="globalvocab">🌐 去测总词汇</button>' +
      '</div>' +
      '<div class="vtd-note">说明：本册听/读基于教材词表；总词汇量基于内置频率分级词库（约 800+ 词），二者口径不同，不宜直接对比绝对数值。</div>' +
      '</div>';

    panel.querySelector('#vtdBook').onchange = async (e) => {
      st.book = e.target.value;
      await renderPage(panel);
    };
    bindGoto(panel);
  }

  function onShow(panel) {
    st.panel = panel;
    if (NCE.vocabTestUi) NCE.vocabTestUi.consumeVocabTrend(st);
    renderPage(panel);
  }

  NCE.registerFeature({ id: 'vocabtrend', label: '词汇趋势', icon: '📈', onShow });
})();
