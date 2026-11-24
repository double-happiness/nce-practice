'use strict';
// 雅思 Task 1（A 类）图表：用内联 SVG 渲染 bar / line / pie，table 用 HTML 表格。
// 数据结构见设计文档 §3.2：{ type, title, unit, categories: [], series: [{ name, values: [] }] }（pie 只有 1 个 series）。
// 文字与坐标轴颜色走主题变量，明暗主题都清楚；按容器实际宽度出图（字号不随缩放变小），窗口变宽变窄时重绘。
// 对外：NCE.ielts.chart.mount(el, chart) 挂到元素上；NCE.ielts.chart.html(chart, width) 只取 HTML。
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE) return;
  const esc = NCE.escapeHtml;

  // 系列配色：中等明度，在白底和深色底上都能区分
  const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
  const TYPE_LABEL = { bar: '柱状图', line: '折线图', pie: '饼图', table: '表格' };
  const FONT = 12;

  const style = document.createElement('style');
  style.textContent = `
    .iec{margin:6px 0 2px}
    .iec-title{font-weight:700;font-size:14px;color:var(--ink);text-align:center;margin-bottom:6px;line-height:1.5}
    .iec-svg{display:block;width:100%;height:auto;max-width:100%}
    .iec-svg text{fill:var(--muted);font-family:inherit}
    .iec-svg text.iec-xl{fill:var(--ink-soft)}
    .iec-svg text.iec-val{fill:var(--ink-soft);font-weight:600}
    .iec-svg text.iec-pct{fill:#fff;font-weight:700;paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2px}
    .iec-svg .iec-axis{stroke:var(--muted-2);stroke-width:1}
    .iec-svg .iec-grid{stroke:var(--border);stroke-width:1}
    .iec-svg .iec-slice{stroke:var(--card);stroke-width:1.5}
    .iec-legend{display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:center;margin-top:8px;font-size:13px;color:var(--ink-soft);line-height:1.5}
    .iec-legend span{display:inline-flex;align-items:center;gap:6px}
    .iec-legend i{flex:none;display:inline-block;width:12px;height:12px;border-radius:3px}
    .iec-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
    .iec-table{border-collapse:collapse;width:100%;font-size:13.5px}
    .iec-table th,.iec-table td{border:1px solid var(--border);padding:7px 10px;text-align:right;color:var(--ink-soft)}
    .iec-table thead th{background:rgba(127,127,127,.10);color:var(--ink);font-weight:700}
    .iec-table th:first-child,.iec-table td:first-child{text-align:left;color:var(--ink);font-weight:600}
    .iec-caption{font-size:12px;color:var(--muted);text-align:center;margin-top:6px}
    .iec-bad{font-size:13px;color:var(--muted);padding:12px;border:1px dashed var(--border);border-radius:8px;text-align:center}
  `;
  document.head.appendChild(style);

  function toNum(v) {
    const n = typeof v === 'number' ? v : Number(v);
    return v == null || v === '' || !Number.isFinite(n) ? null : n;
  }
  function fmtNum(v) {
    if (v == null) return '—';
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
  }
  function withUnit(v, unit) {
    if (v == null) return '—';
    if (!unit) return fmtNum(v);
    return unit === '%' ? `${fmtNum(v)}%` : `${fmtNum(v)} ${unit}`;
  }
  // 估算文字像素宽（中文按整字宽，西文按 0.58 字宽）
  function textW(s, size) {
    let w = 0;
    for (const ch of String(s)) w += /[⺀-￿]/.test(ch) ? size : size * 0.58;
    return w;
  }
  function clip(s, max) {
    const str = String(s);
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  // 统一校验与清洗：values 长度按 categories 对齐，缺值为 null
  function normalize(chart) {
    if (!chart || typeof chart !== 'object') return null;
    const type = TYPE_LABEL[chart.type] ? chart.type : null;
    const cats = Array.isArray(chart.categories) ? chart.categories.map((c) => String(c == null ? '' : c)) : [];
    const series = (Array.isArray(chart.series) ? chart.series : [])
      .filter((s) => s && Array.isArray(s.values))
      .map((s) => ({ name: String(s.name == null ? '' : s.name), values: cats.map((_, i) => toNum(s.values[i])) }));
    if (!type || !cats.length || !series.length) return null;
    return { type, title: String(chart.title || ''), unit: String(chart.unit || ''), cats, series };
  }

  // 「好看」的刻度：步长取 1 / 2 / 2.5 / 5 × 10^n
  function niceScale(min, max, count) {
    if (min === max) max = min + 1;
    const rough = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
    return { lo, hi, ticks };
  }

  function legendHtml(items) {
    return '<div class="iec-legend">' +
      items.map((it) => `<span><i style="background:${it.color}"></i>${esc(it.label)}</span>`).join('') +
      '</div>';
  }

  // ---------- 柱状图 / 折线图（共用坐标系）----------
  function axisChartHtml(d, width) {
    const W = Math.round(width);
    const n = d.cats.length;
    const all = [];
    d.series.forEach((s) => s.values.forEach((v) => { if (v != null) all.push(v); }));
    if (!all.length) return '<div class="iec-bad">图表没有可显示的数值</div>';
    const scale = niceScale(Math.min(0, ...all), Math.max(0, ...all), W < 420 ? 4 : 5);
    const tickLabelW = Math.max(...scale.ticks.map((t) => textW(fmtNum(t), FONT)));
    const padL = Math.max(34, Math.ceil(tickLabelW) + 12);
    const padR = 14;
    const padT = 24; // 顶部留给单位
    // x 轴标签放不下就斜放，底部按最长标签留白
    const plotW = W - padL - padR;
    const slot = plotW / n;
    const labels = d.cats.map((c) => clip(c, 18));
    const maxLabelW = Math.max(...labels.map((c) => textW(c, FONT)));
    const rotate = maxLabelW > slot - 6;
    const padB = rotate ? Math.min(120, Math.ceil(maxLabelW * 0.72) + 18) : 30;
    const H = Math.round(Math.max(220, Math.min(380, W * 0.58)) + (rotate ? padB - 30 : 0));
    const plotH = H - padT - padB;
    const y = (v) => padT + (1 - (v - scale.lo) / (scale.hi - scale.lo)) * plotH;
    const y0 = y(Math.max(scale.lo, Math.min(scale.hi, 0)));

    let g = '';
    scale.ticks.forEach((t) => {
      const ty = y(t).toFixed(1);
      g += `<line class="iec-grid" x1="${padL}" y1="${ty}" x2="${W - padR}" y2="${ty}"/>`;
      g += `<text x="${padL - 6}" y="${(y(t) + 4).toFixed(1)}" font-size="${FONT}" text-anchor="end">${esc(fmtNum(t))}</text>`;
    });
    if (d.unit) g += `<text x="4" y="13" font-size="${FONT}">单位：${esc(d.unit)}</text>`;

    if (d.type === 'bar') {
      const k = d.series.length;
      const groupW = slot * (k > 1 ? 0.78 : 0.56);
      const barW = groupW / k;
      const showVals = barW >= 20;
      d.series.forEach((s, j) => {
        const color = PALETTE[j % PALETTE.length];
        s.values.forEach((v, i) => {
          if (v == null) return;
          const x = padL + slot * i + (slot - groupW) / 2 + j * barW;
          const yv = y(v);
          const top = Math.min(yv, y0);
          const h = Math.max(1, Math.abs(y0 - yv));
          g += `<rect x="${(x + 1).toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(1, barW - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${color}">` +
            `<title>${esc(s.name)} · ${esc(d.cats[i])}：${esc(withUnit(v, d.unit))}</title></rect>`;
          if (showVals) {
            g += `<text class="iec-val" x="${(x + barW / 2).toFixed(1)}" y="${(v >= 0 ? top - 4 : top + h + 12).toFixed(1)}" font-size="${FONT - 1}" text-anchor="middle">${esc(fmtNum(v))}</text>`;
          }
        });
      });
    } else {
      const cx = (i) => padL + slot * (i + 0.5);
      d.series.forEach((s, j) => {
        const color = PALETTE[j % PALETTE.length];
        // 缺值处断开折线
        let seg = [];
        const flush = () => {
          if (seg.length > 1) g += `<polyline points="${seg.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
          seg = [];
        };
        s.values.forEach((v, i) => {
          if (v == null) { flush(); return; }
          seg.push(`${cx(i).toFixed(1)},${y(v).toFixed(1)}`);
        });
        flush();
        s.values.forEach((v, i) => {
          if (v == null) return;
          g += `<circle cx="${cx(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${color}"><title>${esc(s.name)} · ${esc(d.cats[i])}：${esc(withUnit(v, d.unit))}</title></circle>`;
        });
      });
    }

    // 坐标轴（画在数据之上，保证基线清晰）
    g += `<line class="iec-axis" x1="${padL}" y1="${padT}" x2="${padL}" y2="${(padT + plotH).toFixed(1)}"/>`;
    g += `<line class="iec-axis" x1="${padL}" y1="${y0.toFixed(1)}" x2="${W - padR}" y2="${y0.toFixed(1)}"/>`;
    labels.forEach((c, i) => {
      const x = padL + slot * (i + 0.5);
      const ly = padT + plotH + (rotate ? 12 : 18);
      g += rotate
        ? `<text class="iec-xl" x="${x.toFixed(1)}" y="${ly}" font-size="${FONT}" text-anchor="end" transform="rotate(-38 ${x.toFixed(1)} ${ly})"><title>${esc(d.cats[i])}</title>${esc(c)}</text>`
        : `<text class="iec-xl" x="${x.toFixed(1)}" y="${ly}" font-size="${FONT}" text-anchor="middle">${esc(c)}</text>`;
    });

    const svg = `<svg class="iec-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.title || TYPE_LABEL[d.type])}">${g}</svg>`;
    const legend = legendHtml(d.series.map((s, j) => ({ color: PALETTE[j % PALETTE.length], label: s.name || `系列 ${j + 1}` })));
    return svg + legend;
  }

  // ---------- 饼图 ----------
  function pieHtml(d, width) {
    const s = d.series[0];
    const parts = d.cats.map((c, i) => ({ label: c, v: s.values[i], color: PALETTE[i % PALETTE.length] })).filter((p) => p.v != null && p.v > 0);
    const total = parts.reduce((a, p) => a + p.v, 0);
    if (!parts.length || total <= 0) return '<div class="iec-bad">饼图没有可显示的数值</div>';
    const S = Math.round(Math.max(200, Math.min(300, width)));
    const r = S / 2 - 8;
    const c = S / 2;
    let a0 = -Math.PI / 2;
    let g = '';
    parts.forEach((p) => {
      const frac = p.v / total;
      const a1 = a0 + frac * Math.PI * 2;
      const tip = `<title>${esc(p.label)}：${esc(withUnit(p.v, d.unit))}（${Math.round(frac * 100)}%）</title>`;
      if (parts.length === 1) {
        g += `<circle class="iec-slice" cx="${c}" cy="${c}" r="${r}" fill="${p.color}">${tip}</circle>`;
      } else {
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0);
        const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1);
        g += `<path class="iec-slice" d="M${c},${c} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" fill="${p.color}">${tip}</path>`;
      }
      // 扇区够大才在内部标百分比，小扇区看图例
      if (frac >= 0.05) {
        const mid = (a0 + a1) / 2;
        const lx = c + r * 0.64 * Math.cos(mid), ly = c + r * 0.64 * Math.sin(mid);
        g += `<text class="iec-pct" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" font-size="${FONT}" text-anchor="middle">${Math.round(frac * 100)}%</text>`;
      }
      a0 = a1;
    });
    const svg = `<svg class="iec-svg" viewBox="0 0 ${S} ${S}" style="max-width:${S}px;margin:0 auto" role="img" aria-label="${esc(d.title || '饼图')}">${g}</svg>`;
    const showShare = d.unit !== '%';
    const legend = legendHtml(parts.map((p) => ({
      color: p.color,
      label: `${p.label} ${withUnit(p.v, d.unit)}${showShare ? `（${Math.round((p.v / total) * 100)}%）` : ''}`,
    })));
    const name = s.name ? `<div class="iec-caption">${esc(s.name)}${d.unit ? ' · 单位：' + esc(d.unit) : ''}</div>` : (d.unit ? `<div class="iec-caption">单位：${esc(d.unit)}</div>` : '');
    return svg + legend + name;
  }

  // ---------- 表格 ----------
  function tableHtml(d) {
    const head = '<tr><th></th>' + d.cats.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr>';
    const rows = d.series.map((s) =>
      `<tr><td>${esc(s.name)}</td>${s.values.map((v) => `<td>${esc(fmtNum(v))}</td>`).join('')}</tr>`
    ).join('');
    return (
      `<div class="iec-table-wrap"><table class="iec-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>` +
      (d.unit ? `<div class="iec-caption">单位：${esc(d.unit)}</div>` : '')
    );
  }

  function html(chart, width) {
    const d = normalize(chart);
    if (!d) return '<div class="iec-bad">图表数据缺失或格式不对，暂时无法显示</div>';
    const w = Math.max(280, Math.min(760, Number(width) || 560));
    const title = d.title ? `<div class="iec-title">${esc(d.title)}</div>` : '';
    if (d.type === 'table') return title + tableHtml(d);
    if (d.type === 'pie') return title + pieHtml(d, w);
    return title + axisChartHtml(d, w);
  }

  // 挂载并在宽度变化时重绘；元素移出文档后自动解绑
  function mount(el, chart) {
    if (!el) return;
    el.classList.add('iec');
    let lastW = el.clientWidth || 0;
    el.innerHTML = html(chart, lastW);
    const d = normalize(chart);
    if (!d || d.type === 'table') return;
    let t = null;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!el.isConnected) {
          window.removeEventListener('resize', onResize);
          return;
        }
        const w = el.clientWidth || 0;
        if (Math.abs(w - lastW) < 12) return;
        lastW = w;
        el.innerHTML = html(chart, w);
      }, 150);
    };
    window.addEventListener('resize', onResize);
  }

  IE.chart = { mount, html, TYPE_LABEL };
})();
