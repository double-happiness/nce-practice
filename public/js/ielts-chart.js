'use strict';
// 雅思 Task 1（A 类）图表：用内联 SVG 渲染 bar / line / pie / process（流程图）/ map（地图），table 用 HTML 表格。
// 数据结构见设计文档 §3.2：{ type, title, unit, categories: [], series: [{ name, values: [] }] }（pie 只有 1 个 series）。
// 流程图：{ type: 'process', title, cycle?: true, stages: [{ id, label, note? }], links: [{ from, to, label? }] }
// 地图：  { type: 'map', title, compass?: true, maps: [{ title, features: [{ kind, x, y, w, h, label }] } ×2] }（坐标 0–100）
// 文字与坐标轴颜色走主题变量，明暗主题都清楚；按容器实际宽度出图（字号不随缩放变小），窗口变宽变窄时重绘。
// 对外：NCE.ielts.chart.mount(el, chart) 挂到元素上并返回 dispose()；NCE.ielts.chart.html(chart, width) 只取 HTML。
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE) return;
  const esc = NCE.escapeHtml;

  // 系列配色：中等明度，在白底和深色底上都能区分
  const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
  const TYPE_LABEL = { bar: '柱状图', line: '折线图', pie: '饼图', table: '表格', process: '流程图', map: '地图' };
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
    /* 流程图与地图：地物色用半透明色，叠在浅底和深底上都能分清；文字描边色（halo）跟随卡片底色 */
    .iec{--iec-halo:var(--card);--iec-bld:#a3b0c2;--iec-bld-s:#64748b;--iec-park:rgba(34,197,94,.30);--iec-park-s:#16a34a;
      --iec-water:rgba(59,130,246,.28);--iec-water-s:#3b82f6;--iec-cp:rgba(245,158,11,.20);--iec-cp-s:#d97706;
      --iec-road:rgba(148,163,184,.50);--iec-road-s:rgba(100,116,139,.75)}
    html[data-theme=midnight] .iec{--iec-halo:#141a2b;--iec-bld:#4f586c;--iec-bld-s:#8b93ad;--iec-park:rgba(52,211,153,.24);--iec-park-s:#34d399;
      --iec-water:rgba(96,165,250,.28);--iec-water-s:#60a5fa;--iec-cp:rgba(251,191,36,.18);--iec-cp-s:#fbbf24;
      --iec-road:rgba(148,163,184,.34);--iec-road-s:rgba(148,163,184,.6)}
    .iec-svg .iec-halo{paint-order:stroke;stroke:var(--iec-halo);stroke-width:3px;stroke-linejoin:round}
    .iec-svg .iec-pbox{fill:var(--card);stroke:var(--brand);stroke-width:1.5}
    .iec-svg text.iec-plabel{fill:var(--ink);font-weight:700}
    .iec-svg text.iec-pnote{fill:var(--muted)}
    .iec-svg .iec-edge{fill:none;stroke:var(--muted);stroke-width:1.6;stroke-linejoin:round}
    .iec-svg .iec-head{fill:var(--muted)}
    .iec-svg text.iec-elabel{fill:var(--ink-soft);font-style:italic}
    .iec-maps{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
    .iec-maps.two{grid-template-columns:repeat(2,minmax(0,1fr))}
    .iec-map{min-width:0}
    .iec-map-title{font-weight:700;font-size:13.5px;color:var(--ink-soft);text-align:center;margin-bottom:4px}
    .iec-svg .iec-mframe{fill:rgba(127,127,127,.05);stroke:var(--border);stroke-width:1}
    .iec-svg .iec-mf-building{fill:var(--iec-bld);stroke:var(--iec-bld-s);stroke-width:1}
    .iec-svg .iec-mf-road{fill:var(--iec-road);stroke:var(--iec-road-s);stroke-width:.8}
    .iec-svg .iec-mf-park{fill:var(--iec-park);stroke:var(--iec-park-s);stroke-width:1}
    .iec-svg .iec-mf-water{fill:var(--iec-water);stroke:var(--iec-water-s);stroke-width:1}
    .iec-svg .iec-mf-car-park{fill:var(--iec-cp);stroke:var(--iec-cp-s);stroke-width:1;stroke-dasharray:4 2}
    .iec-svg .iec-mf-label{fill:none;stroke:var(--muted-2);stroke-width:1;stroke-dasharray:3 3}
    .iec-svg .iec-mroad-line{stroke:rgba(255,255,255,.75);stroke-width:1;stroke-dasharray:5 4}
    .iec-svg text.iec-mtext{fill:var(--ink);font-weight:600}
    .iec-svg text.iec-mtext-label{fill:var(--ink-soft);font-weight:400;font-style:italic}
    .iec-svg .iec-mletter circle{fill:var(--card);stroke:var(--brand);stroke-width:1.8}
    .iec-svg .iec-mletter text{fill:var(--ink);font-weight:800}
    .iec-legend i.iec-mf-building{background:var(--iec-bld);border:1px solid var(--iec-bld-s)}
    .iec-legend i.iec-mf-road{background:var(--iec-road);border:1px solid var(--iec-road-s)}
    .iec-legend i.iec-mf-park{background:var(--iec-park);border:1px solid var(--iec-park-s)}
    .iec-legend i.iec-mf-water{background:var(--iec-water);border:1px solid var(--iec-water-s)}
    .iec-legend i.iec-mf-car-park{background:var(--iec-cp);border:1px dashed var(--iec-cp-s)}
    .iec-compass svg{display:block}
    .iec-compass .iec-cn{fill:var(--ink);font-weight:800}
    .iec-compass .iec-ca{fill:var(--ink)}
    .iec-compass .iec-cb{fill:none;stroke:var(--muted-2)}
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
    if (chart.type === 'process') return normalizeProcess(chart);
    if (chart.type === 'map') return normalizeMap(chart);
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

  // ---------- 流程图与地图共用 ----------
  const CJK = /[⺀-￿]/;
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  function str(v) {
    return v == null ? '' : String(v).trim();
  }
  // 按词折行；没有空格的中文超宽时按字切开
  function wrapLines(text, maxW, size) {
    const lines = [];
    let cur = '';
    const push = (piece, glue) => {
      const next = cur ? cur + glue + piece : piece;
      if (cur && textW(next, size) > maxW) {
        lines.push(cur);
        cur = piece;
      } else cur = next;
    };
    String(text).split(/\s+/).filter(Boolean).forEach((word) => {
      if (CJK.test(word) && textW(word, size) > maxW) Array.from(word).forEach((ch, i) => push(ch, i === 0 ? ' ' : ''));
      else push(word, ' ');
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // ---------- 流程图 ----------
  const PF = 13; // 阶段名字号
  const NF = 11.5; // 阶段备注字号
  const EF = 11; // 连线标注字号
  const CANVAS_PAD = 8;
  const BOX_PX = 8;
  const BOX_PY = 7;
  const HEAD = 8; // 箭头长度

  // 清洗：丢掉缺 id / label 或重复 id 的阶段、引用不存在阶段的连线（报错交给 scripts/validate.js，这里只保证能画）
  function normalizeProcess(chart) {
    const stages = [];
    const indexOf = new Map();
    (Array.isArray(chart.stages) ? chart.stages : []).forEach((s) => {
      if (!s || typeof s !== 'object') return;
      const id = str(s.id);
      const label = str(s.label);
      if (!id || !label || indexOf.has(id)) return;
      indexOf.set(id, stages.length);
      stages.push({ id, label, note: str(s.note) });
    });
    const links = [];
    const seen = new Set();
    (Array.isArray(chart.links) ? chart.links : []).forEach((l) => {
      if (!l || typeof l !== 'object') return;
      const from = indexOf.get(str(l.from));
      const to = indexOf.get(str(l.to));
      if (from == null || to == null || from === to || seen.has(from + '>' + to)) return;
      seen.add(from + '>' + to);
      links.push({ from, to, label: str(l.label) });
    });
    if (stages.length < 2 || !links.length) return null;
    return { type: 'process', title: String(chart.title || ''), cycle: chart.cycle === true && stages.length >= 3, stages, links };
  }

  // 方框内文字：阶段名加粗在上，备注在下；返回折好的行和所需高度
  function boxContent(s, bw) {
    const inner = Math.max(20, bw - BOX_PX * 2);
    const lines = wrapLines(s.label, inner, PF * 1.06);
    const notes = s.note ? wrapLines(s.note, inner, NF) : [];
    const h = BOX_PY * 2 + lines.length * PF * 1.3 + (notes.length ? 4 + notes.length * NF * 1.3 : 0);
    return { lines, notes, h: Math.ceil(h) };
  }
  // 方框至少要放得下最长的英文单词
  function longestWordW(d) {
    let m = 0;
    d.stages.forEach((s) => {
      s.label.split(/\s+/).forEach((w) => { if (!CJK.test(w)) m = Math.max(m, textW(w, PF * 1.06)); });
      s.note.split(/\s+/).forEach((w) => { if (!CJK.test(w)) m = Math.max(m, textW(w, NF)); });
    });
    return m;
  }
  function center(b) {
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  // 从方框中心朝 (tx, ty) 方向与边框（外扩 gap）的交点
  function clipToBox(b, tx, ty, gap) {
    const c = center(b);
    const dx = tx - c.x;
    const dy = ty - c.y;
    if (!dx && !dy) return c;
    const t = Math.min(dx ? (b.w / 2 + gap) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + gap) / Math.abs(dy) : Infinity);
    return { x: c.x + dx * t, y: c.y + dy * t };
  }
  // 相邻两层之间的直线箭头；标注横向连线写在线上方，纵向连线写在线右侧
  function straightEdge(bu, bv, label) {
    const cu = center(bu);
    const cv = center(bv);
    const p0 = clipToBox(bu, cv.x, cv.y, 2);
    const p1 = clipToBox(bv, cu.x, cu.y, 3);
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    const flat = Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y);
    return {
      pts: [p0, p1],
      label: label ? (flat ? { text: label, x: mx, y: my - 5, anchor: 'middle' } : { text: label, x: mx + 6, y: my + 4, anchor: 'start' }) : null,
    };
  }

  // 分层：按 stages 顺序（作者按流程先后排列），正向连线做最长路径分层；指回前面的连线（回路）和跨层连线另走通道
  function processLayers(d) {
    const n = d.stages.length;
    const fwd = d.links.filter((l) => l.to > l.from);
    const lv = new Array(n).fill(0);
    for (let i = 0; i < n; i++) fwd.forEach((l) => { if (l.from === i) lv[l.to] = Math.max(lv[l.to], lv[i] + 1); });
    // 中途加入的投入（只有出边）贴近它的下游，而不是挤在第一列
    const hasIn = new Array(n).fill(false);
    fwd.forEach((l) => { hasIn[l.to] = true; });
    for (let i = 0; i < n; i++) {
      if (hasIn[i]) continue;
      const outs = fwd.filter((l) => l.from === i).map((l) => lv[l.to]);
      if (outs.length) lv[i] = Math.max(lv[i], Math.min(...outs) - 1);
    }
    const used = Array.from(new Set(lv)).sort((a, b) => a - b);
    const rank = new Map(used.map((v, k) => [v, k]));
    for (let i = 0; i < n; i++) lv[i] = rank.get(lv[i]);
    const cols = used.map(() => []);
    for (let i = 0; i < n; i++) cols[lv[i]].push(i);
    // 同层（分支）按上游位置的重心排序，减少连线交叉
    const pos = new Array(n).fill(0);
    cols.forEach((col, c) => {
      if (c > 0) {
        const bary = (i) => {
          const ps = fwd.filter((l) => l.to === i && lv[l.from] < c).map((l) => pos[l.from] - (cols[lv[l.from]].length - 1) / 2);
          return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
        };
        col.sort((a, b) => bary(a) - bary(b) || a - b);
      }
      col.forEach((i, k) => { pos[i] = k; });
    });
    const adjacent = (l) => l.to > l.from && lv[l.to] === lv[l.from] + 1;
    return { lv, cols, adjacent };
  }

  // 非循环流程：放得下就横排（一行，或 S 形折成多行），放不下（窄屏）改纵排
  function layeredLayout(d, W) {
    const { lv, cols, adjacent } = processLayers(d);
    const L = cols.length;
    const avail = W - CANVAS_PAD * 2;
    const lanes = d.links.filter((l) => !adjacent(l));
    const adjLabelW = Math.max(0, ...d.links.filter((l) => adjacent(l) && l.label).map((l) => textW(l.label, EF)));
    const gx = Math.min(110, Math.max(32, adjLabelW ? Math.ceil(adjLabelW) + 14 : 0));
    const bwMin = Math.max(92, Math.ceil(longestWordW(d)) + BOX_PX * 2);
    const perRow = Math.floor((avail + gx) / (bwMin + gx));
    const o = { lv, cols, adjacent, lanes, gx };
    if (perRow >= L) return rowsLayout(d, W, { ...o, per: L });
    if (perRow >= 3) {
      const per = Math.ceil(L / Math.ceil(L / perRow));
      const rowOf = (i) => Math.floor(lv[i] / per);
      // 跨行连线只支持相邻两行之间绕行，再远就改纵排，避免线压在方框上
      if (lanes.every((l) => Math.abs(rowOf(l.from) - rowOf(l.to)) <= 1)) return rowsLayout(d, W, { ...o, per });
    }
    return columnLayout(d, W, o);
  }

  // 横排：每行 per 层，奇数行从右往左（S 形），行尾向下转到下一行
  function rowsLayout(d, W, o) {
    const { lv, cols, adjacent, lanes, gx, per } = o;
    const L = cols.length;
    const R = Math.ceil(L / per);
    const avail = W - CANVAS_PAD * 2;
    const bw = Math.min(170, Math.floor((avail - (per - 1) * gx) / per));
    const contents = d.stages.map((s) => boxContent(s, bw));
    const bh = Math.max(...contents.map((c) => c.h));
    const GS = 14; // 分支上下堆叠的间距
    const rowOfLevel = (c) => Math.floor(c / per);
    const colOfLevel = (c) => {
      const r = rowOfLevel(c);
      const k = c - r * per;
      return r % 2 ? per - 1 - k : k;
    };
    const left = CANVAS_PAD + (avail - (per * bw + (per - 1) * gx)) / 2;

    // 跨层连线走水平通道：gap 0 在第一行上方，gap r 在第 r-1 行与第 r 行之间，gap R 在最后一行下方
    const gaps = Array.from({ length: R + 1 }, () => []);
    const laneInfo = lanes.map((l) => {
      const ru = rowOfLevel(lv[l.from]);
      const rv = rowOfLevel(lv[l.to]);
      let g;
      let outSide;
      let inSide;
      if (ru === rv) {
        if (ru === R - 1 && R > 1) [g, outSide, inSide] = [R, 'bottom', 'bottom'];
        else [g, outSide, inSide] = [ru, 'top', 'top'];
      } else if (rv < ru) [g, outSide, inSide] = [ru, 'top', 'bottom'];
      else [g, outSide, inSide] = [rv, 'bottom', 'top'];
      const info = { l, g, outSide, inSide, k: gaps[g].length };
      gaps[g].push(info);
      return info;
    });
    const hasLbl = (g) => gaps[g].some((x) => x.l.label);
    const step = (g) => (hasLbl(g) ? 15 : 10);
    const gapH = gaps.map((ls, g) => {
      const inner = g > 0 && g < R ? 34 : 0; // 行间要放转折箭头
      if (!ls.length) return inner;
      const need = 12 + (ls.length - 1) * step(g) + (hasLbl(g) ? 14 : 0) + (g > 0 && g < R ? 12 : 0);
      return Math.max(inner, need);
    });
    const stackH = (c) => cols[c].length * bh + (cols[c].length - 1) * GS;
    const rowH = [];
    for (let r = 0; r < R; r++) {
      let m = 0;
      for (let c = r * per; c < Math.min(L, r * per + per); c++) m = Math.max(m, stackH(c));
      rowH.push(m);
    }
    const rowTop = [];
    let y = CANVAS_PAD + gapH[0];
    for (let r = 0; r < R; r++) {
      rowTop.push(y);
      y += rowH[r] + gapH[r + 1];
    }
    const H = Math.ceil(y + CANVAS_PAD);

    const boxes = new Array(d.stages.length);
    cols.forEach((col, c) => {
      const r = rowOfLevel(c);
      const top = rowTop[r] + (rowH[r] - stackH(c)) / 2;
      const x = left + colOfLevel(c) * (bw + gx);
      col.forEach((i, j) => { boxes[i] = { x, y: top + j * (bh + GS), w: bw, h: bh }; });
    });

    const edges = d.links.filter(adjacent).map((l) => straightEdge(boxes[l.from], boxes[l.to], l.label));
    laneInfo.forEach((info) => {
      const bu = boxes[info.l.from];
      const bv = boxes[info.l.to];
      const cu = bu.x + bu.w / 2;
      const cv = bv.x + bv.w / 2;
      let ux;
      let vx;
      // 出入点偏离中心，避开中心处的转折箭头
      if (Math.abs(cu - cv) < 1) ux = vx = cu + bw * 0.25;
      else {
        const s = cv > cu ? 1 : -1;
        ux = cu + s * bw * 0.22;
        vx = cv - s * bw * 0.22;
      }
      const uy = info.outSide === 'top' ? bu.y : bu.y + bu.h;
      const vy = info.inSide === 'top' ? bv.y - 2 : bv.y + bv.h + 2;
      const g = info.g;
      let laneY;
      if (g === 0) laneY = rowTop[0] - 12 - info.k * step(g);
      else if (g === R) laneY = rowTop[R - 1] + rowH[R - 1] + 12 + info.k * step(g);
      else {
        const gTop = rowTop[g - 1] + rowH[g - 1];
        laneY = gTop + (gapH[g] - (gaps[g].length - 1) * step(g)) / 2 + info.k * step(g) + (hasLbl(g) ? 6 : 0);
      }
      const text = info.l.label;
      let label = null;
      if (text) {
        label = ux === vx
          ? { text, x: ux + 6, y: (uy + vy) / 2 + 4, anchor: 'start' }
          : { text, x: (ux + vx) / 2, y: g === R ? laneY + 13 : laneY - 4, anchor: 'middle' };
      }
      const pts = ux === vx
        ? [{ x: ux, y: uy }, { x: vx, y: vy }]
        : [{ x: ux, y: uy }, { x: ux, y: laneY }, { x: vx, y: laneY }, { x: vx, y: vy }];
      edges.push({ pts, label });
    });
    return { H, boxes, contents, edges };
  }

  // 纵排：每层一行，分支并排；跨层连线（回路）从右侧通道绕行，标注竖写在通道旁
  function columnLayout(d, W, o) {
    const { cols, adjacent, lanes } = o;
    const LANE_GAP = 14;
    const GS = 12;
    const GY = 30;
    const laneLbl = lanes.some((l) => l.label);
    const gutter = lanes.length ? 14 + lanes.length * LANE_GAP + (laneLbl ? 10 : 0) : 0;
    const avail = W - CANVAS_PAD * 2 - gutter;
    const full = Math.min(340, avail);
    const left = CANVAS_PAD + (avail - full) / 2;
    const widthOf = (k) => (full - (k - 1) * GS) / k;
    const contents = new Array(d.stages.length);
    cols.forEach((col) => col.forEach((i) => { contents[i] = boxContent(d.stages[i], widthOf(col.length)); }));
    const bh = Math.max(...contents.map((c) => c.h));
    const boxes = new Array(d.stages.length);
    let y = CANVAS_PAD;
    cols.forEach((col) => {
      const w = widthOf(col.length);
      col.forEach((i, j) => { boxes[i] = { x: left + j * (w + GS), y, w, h: bh }; });
      y += bh + GY;
    });
    const H = Math.ceil(y - GY + CANVAS_PAD);
    const edges = d.links.filter(adjacent).map((l) => straightEdge(boxes[l.from], boxes[l.to], l.label));
    lanes.forEach((l, k) => {
      const bu = boxes[l.from];
      const bv = boxes[l.to];
      const laneX = left + full + 14 + k * LANE_GAP;
      const uy = bu.y + bu.h / 2 + 6;
      const vy = bv.y + bv.h / 2 - 6;
      edges.push({
        pts: [{ x: bu.x + bu.w, y: uy }, { x: laneX, y: uy }, { x: laneX, y: vy }, { x: bv.x + bv.w + 2, y: vy }],
        label: l.label ? { text: l.label, x: laneX + 3, y: (uy + vy) / 2, anchor: 'middle', rotate: 90 } : null,
      });
    });
    return { H, boxes, contents, edges };
  }

  // 循环流程（窄屏或椭圆放不下时）：两列跑道形环——右列自上而下、左列自下而上，
  // 底部和顶部的两条转折连线从框外绕行（U 形），标注写在绕行线上
  function racetrackLayout(d, W) {
    const n = d.stages.length;
    const avail = W - CANVAS_PAD * 2;
    const GX = 36;
    const GY = 30;
    const bw = Math.min(170, Math.floor((avail - GX) / 2));
    const contents = d.stages.map((s) => boxContent(s, bw));
    const bh = Math.max(...contents.map((c) => c.h));
    const k = Math.ceil(n / 2); // 右列阶段数
    const m = n - k; // 左列阶段数
    const isBottom = (l) => l.from === k - 1 && l.to === k;
    const isTop = (l) => l.from === n - 1 && l.to === 0;
    const topLbl = d.links.some((l) => isTop(l) && l.label);
    const botLbl = d.links.some((l) => isBottom(l) && l.label);
    const top = CANVAS_PAD + 18 + (topLbl ? 14 : 0);
    const leftX = CANVAS_PAD + (avail - (bw * 2 + GX)) / 2;
    const rightX = leftX + bw + GX;
    const rowY = (r) => top + r * (bh + GY);
    const shift = ((k - m) * (bh + GY)) / 2; // 奇数个阶段时左列上移半行，保持居中
    const boxes = d.stages.map((_, i) =>
      i < k ? { x: rightX, y: rowY(i), w: bw, h: bh } : { x: leftX, y: rowY(k - 1 - (i - k)) - shift, w: bw, h: bh }
    );
    const laneT = top - 12;
    const laneB = rowY(k - 1) + bh + 12;
    const H = Math.ceil(laneB + (botLbl ? 14 : 0) + 6 + CANVAS_PAD);
    const edges = d.links.map((l) => {
      if (!isTop(l) && !isBottom(l)) return straightEdge(boxes[l.from], boxes[l.to], l.label);
      const bu = boxes[l.from];
      const bv = boxes[l.to];
      const ux = bu.x + bu.w / 2;
      const vx = bv.x + bv.w / 2;
      const laneY = isTop(l) ? laneT : laneB;
      const uy = isTop(l) ? bu.y : bu.y + bu.h;
      const vy = isTop(l) ? bv.y - 2 : bv.y + bv.h + 2;
      return {
        pts: [{ x: ux, y: uy }, { x: ux, y: laneY }, { x: vx, y: laneY }, { x: vx, y: vy }],
        label: l.label ? { text: l.label, x: (ux + vx) / 2, y: isTop(l) ? laneY - 4 : laneY + 13, anchor: 'middle' } : null,
      };
    });
    return { H, boxes, contents, edges };
  }

  // 循环流程：阶段按顺序顺时针排在椭圆上（第一个在正上方），把椭圆拉高直到方框互不重叠；
  // 窄屏或拉高也放不下（奇数个阶段时底部两框等高，只能靠横向间距分开）时改用跑道形环
  function ringLayout(d, W) {
    if (W < 520) return racetrackLayout(d, W);
    const n = d.stages.length;
    const avail = W - CANVAS_PAD * 2;
    const bwMin = Math.max(92, Math.ceil(longestWordW(d)) + BOX_PX * 2);
    const bw = Math.max(bwMin, Math.min(150, Math.floor(avail * (W >= 520 ? 0.24 : 0.36))));
    const contents = d.stages.map((s) => boxContent(s, bw));
    const bh = Math.max(...contents.map((c) => c.h));
    const rx = Math.max(0, Math.min(avail / 2 - bw / 2, 250));
    const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
    const fits = (ry) => {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = Math.abs(rx * (Math.cos(ang(i)) - Math.cos(ang(j))));
          const dy = Math.abs(ry * (Math.sin(ang(i)) - Math.sin(ang(j))));
          if (dx < bw + 18 && dy < bh + 26) return false;
        }
      }
      return true;
    };
    const cap = Math.max(rx * 2, bh * 4);
    let ry = Math.max(bh, rx * 0.55);
    while (!fits(ry) && ry <= cap) ry += 4;
    if (!fits(ry)) return racetrackLayout(d, W);
    const cx = W / 2;
    const cy = CANVAS_PAD + bh / 2 + ry;
    const boxes = d.stages.map((_, i) => ({ x: cx + rx * Math.cos(ang(i)) - bw / 2, y: cy + ry * Math.sin(ang(i)) - bh / 2, w: bw, h: bh }));
    const H = Math.ceil(2 * ry + bh + CANVAS_PAD * 2);
    const edges = d.links.map((l) => {
      const bu = boxes[l.from];
      const bv = boxes[l.to];
      if (l.to !== (l.from + 1) % n) return straightEdge(bu, bv, l.label); // 环上不相邻的连线画直线
      // 环上相邻：二次曲线向外鼓，看起来像一个环
      const pu = center(bu);
      const pv = center(bv);
      const mx = (pu.x + pv.x) / 2;
      const my = (pu.y + pv.y) / 2;
      const ox = mx - cx;
      const oy = my - cy;
      const len = Math.hypot(ox, oy) || 1;
      const bulge = Math.hypot(pv.x - pu.x, pv.y - pu.y) * 0.22;
      const c = { x: mx + (ox / len) * bulge, y: my + (oy / len) * bulge };
      const p0 = clipToBox(bu, c.x, c.y, 2);
      const p1 = clipToBox(bv, c.x, c.y, 3);
      let label = null;
      if (l.label) {
        const bx = 0.25 * p0.x + 0.5 * c.x + 0.25 * p1.x + (ox / len) * 8;
        const by = 0.25 * p0.y + 0.5 * c.y + 0.25 * p1.y + (oy / len) * 8;
        label = { text: l.label, x: bx, y: by + 4, anchor: bx > cx + 4 ? 'start' : bx < cx - 4 ? 'end' : 'middle' };
      }
      return { quad: [p0, c, p1], label };
    });
    return { H, boxes, contents, edges };
  }

  function arrowHead(x, y, ang) {
    const bx = x - HEAD * Math.cos(ang);
    const by = y - HEAD * Math.sin(ang);
    const px = -Math.sin(ang) * 4.5;
    const py = Math.cos(ang) * 4.5;
    return `<polygon class="iec-head" points="${f1(x)},${f1(y)} ${f1(bx + px)},${f1(by + py)} ${f1(bx - px)},${f1(by - py)}"/>`;
  }
  // 连线本身停在箭头底部，箭头单独画在方框之上
  function edgeSvg(e) {
    let tip;
    let from;
    let path;
    if (e.quad) {
      const [p0, c, p1] = e.quad;
      tip = p1;
      from = c;
      path = (end) => `M${f1(p0.x)},${f1(p0.y)} Q${f1(c.x)},${f1(c.y)} ${f1(end.x)},${f1(end.y)}`;
    } else {
      const pts = e.pts;
      tip = pts[pts.length - 1];
      from = pts[pts.length - 2];
      path = (end) => 'M' + pts.slice(0, -1).map((p) => `${f1(p.x)},${f1(p.y)}`).join(' L') + ` L${f1(end.x)},${f1(end.y)}`;
    }
    const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
    const end = { x: tip.x - Math.cos(ang) * (HEAD - 1), y: tip.y - Math.sin(ang) * (HEAD - 1) };
    return { line: `<path class="iec-edge" d="${path(end)}"/>`, head: arrowHead(tip.x, tip.y, ang) };
  }
  function edgeLabelSvg(lb, W) {
    if (!lb || !lb.text) return '';
    let x = lb.x;
    if (!lb.rotate) {
      // 横排标注不出画布左右边界
      const tw = textW(lb.text, EF);
      const x0 = lb.anchor === 'middle' ? x - tw / 2 : lb.anchor === 'end' ? x - tw : x;
      x += Math.max(0, 2 - x0) - Math.max(0, x0 + tw - (W - 2));
    }
    const rot = lb.rotate ? ` transform="rotate(${lb.rotate} ${f1(x)} ${f1(lb.y)})"` : '';
    return `<text class="iec-elabel iec-halo" x="${f1(x)}" y="${f1(lb.y)}" font-size="${EF}" text-anchor="${lb.anchor}"${rot}>${esc(lb.text)}</text>`;
  }
  function boxSvg(s, b, c) {
    const cx = b.x + b.w / 2;
    let ty = b.y + (b.h - (c.h - BOX_PY * 2)) / 2; // 内容在框内垂直居中
    let t = '';
    c.lines.forEach((ln) => {
      ty += PF * 1.3;
      t += `<text class="iec-plabel" x="${f1(cx)}" y="${f1(ty - PF * 0.3)}" font-size="${PF}" text-anchor="middle">${esc(ln)}</text>`;
    });
    if (c.notes.length) ty += 4;
    c.notes.forEach((ln) => {
      ty += NF * 1.3;
      t += `<text class="iec-pnote" x="${f1(cx)}" y="${f1(ty - NF * 0.3)}" font-size="${NF}" text-anchor="middle">${esc(ln)}</text>`;
    });
    return (
      `<g><title>${esc(s.note ? `${s.label}：${s.note}` : s.label)}</title>` +
      `<rect class="iec-pbox" x="${f1(b.x)}" y="${f1(b.y)}" width="${f1(b.w)}" height="${f1(b.h)}" rx="8"/>${t}</g>`
    );
  }

  function processHtml(d, width) {
    const W = Math.round(width);
    const lay = d.cycle ? ringLayout(d, W) : layeredLayout(d, W);
    const parts = lay.edges.map(edgeSvg);
    // 先画连线，再画方框，箭头和标注压在最上层
    const g =
      parts.map((p) => p.line).join('') +
      d.stages.map((s, i) => boxSvg(s, lay.boxes[i], lay.contents[i])).join('') +
      parts.map((p) => p.head).join('') +
      lay.edges.map((e) => edgeLabelSvg(e.label, W)).join('');
    return `<svg class="iec-svg" viewBox="0 0 ${W} ${lay.H}" role="img" aria-label="${esc(d.title || TYPE_LABEL.process)}">${g}</svg>`;
  }

  // ---------- 地图 ----------
  // order：绘制顺序（水体、绿地在下，建筑在上）；legend：图例文字（英文，方便直接用在作文里）
  const MAP_KINDS = {
    water: { order: 0, legend: 'Water' },
    park: { order: 1, legend: 'Park / green space' },
    'car-park': { order: 2, legend: 'Car park' },
    road: { order: 3, legend: 'Road' },
    building: { order: 4, legend: 'Building' },
    label: { order: 5, legend: 'Area' },
  };
  const LEGEND_ORDER = ['building', 'road', 'park', 'water', 'car-park'];
  const isMapKind = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(MAP_KINDS, k);
  const COMPASS_SVG =
    '<svg width="22" height="30" viewBox="0 0 22 30" role="img" aria-label="指北针：上方为北">' +
    '<text class="iec-cn" x="11" y="10" font-size="11" text-anchor="middle">N</text>' +
    '<polygon class="iec-ca" points="11,12 16,29 11,25 6,29"/></svg>';

  function clamp100(v) {
    const n = toNum(v);
    return n == null ? null : Math.max(0, Math.min(100, n));
  }
  // 坐标夹到 0–100，丢掉未知 kind 和没有面积的非文字地物
  function normalizeMap(chart) {
    const maps = (Array.isArray(chart.maps) ? chart.maps : [])
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({
        title: str(m.title),
        features: (Array.isArray(m.features) ? m.features : [])
          .map((f) => {
            if (!f || typeof f !== 'object' || !isMapKind(f.kind)) return null;
            const x = clamp100(f.x);
            const y = clamp100(f.y);
            if (x == null || y == null) return null;
            const w = Math.min(clamp100(f.w) || 0, 100 - x);
            const h = Math.min(clamp100(f.h) || 0, 100 - y);
            if (f.kind !== 'label' && (w <= 0 || h <= 0)) return null;
            return { kind: f.kind, x, y, w, h, label: str(f.label) };
          })
          .filter(Boolean),
      }));
    if (!maps.length || !maps.some((m) => m.features.length)) return null;
    return { type: 'map', title: String(chart.title || ''), compass: chart.compass === true, maps };
  }

  function mapSvg(m, S, font) {
    const M = 6;
    const span = S - M * 2;
    const px = (v) => M + (v / 100) * span;
    const feats = m.features
      .map((f, i) => ({ ...f, i }))
      .sort((a, b) => MAP_KINDS[a.kind].order - MAP_KINDS[b.kind].order || a.i - b.i);
    let shapes = `<rect class="iec-mframe" x="0.5" y="0.5" width="${S - 1}" height="${S - 1}" rx="6"/>`;
    let texts = '';
    feats.forEach((f) => {
      const x = px(f.x);
      const y = px(f.y);
      const w = (f.w / 100) * span;
      const h = (f.h / 100) * span;
      const tip = `<title>${esc(f.label ? `${f.label} · ${MAP_KINDS[f.kind].legend}` : MAP_KINDS[f.kind].legend)}</title>`;
      if (w > 0 && h > 0) {
        const atEdge = f.x <= 0 || f.y <= 0 || f.x + f.w >= 100 || f.y + f.h >= 100;
        let rx = 2;
        if (f.kind === 'park') rx = Math.min(8, w / 2, h / 2);
        else if (f.kind === 'water') rx = atEdge ? 2 : Math.min(18, w * 0.3, h * 0.3);
        else if (f.kind === 'road') rx = 0;
        else if (f.kind === 'label') rx = 4;
        shapes += `<rect class="iec-mf-${f.kind}" x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(rx)}">${tip}</rect>`;
        // 路面中线
        if (f.kind === 'road' && Math.min(w, h) >= 9) {
          shapes += w >= h
            ? `<line class="iec-mroad-line" x1="${f1(x + 3)}" y1="${f1(y + h / 2)}" x2="${f1(x + w - 3)}" y2="${f1(y + h / 2)}"/>`
            : `<line class="iec-mroad-line" x1="${f1(x + w / 2)}" y1="${f1(y + 3)}" x2="${f1(x + w / 2)}" y2="${f1(y + h - 3)}"/>`;
        }
      }
      if (!f.label) return;
      // 听力地图标注题：单个大写字母的文字标注画成加粗圆圈标记（真考图上的 A–H），写作地图不用单字母标注
      if (f.kind === 'label' && /^[A-Z]$/.test(f.label)) {
        const r = font * 0.95;
        const cx = Math.max(M + r + 1, Math.min(S - M - r - 1, x));
        const cy = Math.max(M + r + 1, Math.min(S - M - r - 1, y));
        texts += `<g class="iec-mletter"><title>${esc(f.label)}</title><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}"/>` +
          `<text x="${f1(cx)}" y="${f1(cy + font * 0.36)}" font-size="${font}" text-anchor="middle">${esc(f.label)}</text></g>`;
        return;
      }
      const cls = f.kind === 'label' ? 'iec-mtext iec-mtext-label iec-halo' : 'iec-mtext iec-halo';
      const keep = (v, half) => Math.max(M + half + 2, Math.min(S - M - half - 2, v)); // 文字不出画框
      if (f.kind === 'road' && h > w * 1.5) {
        // 竖向道路：文字沿路竖排
        const tw = textW(f.label, font);
        const cx = x + w / 2;
        const cy = keep(y + h / 2, tw / 2);
        texts += `<text class="${cls}" x="${f1(cx)}" y="${f1(cy + font * 0.35)}" font-size="${font}" text-anchor="middle" transform="rotate(-90 ${f1(cx)} ${f1(cy)})">${esc(f.label)}</text>`;
        return;
      }
      const lines = wrapLines(f.label, f.kind === 'road' ? Math.max(w, 60) : Math.max(w - 6, 56), font);
      const lh = font * 1.2;
      const tw = Math.max(...lines.map((ln) => textW(ln, font)));
      const cx = keep(x + w / 2, tw / 2);
      const cy = keep(y + h / 2, (lines.length * lh) / 2);
      let ty = cy - ((lines.length - 1) * lh) / 2 + font * 0.35;
      lines.forEach((ln) => {
        texts += `<text class="${cls}" x="${f1(cx)}" y="${f1(ty)}" font-size="${font}" text-anchor="middle">${esc(ln)}</text>`;
        ty += lh;
      });
    });
    return shapes + texts;
  }

  // 两张图宽屏并排、窄屏上下排；方位标和图例放在图下方，两张图共用
  function mapHtml(d, width) {
    const W = Math.round(width);
    const two = d.maps.length > 1 && W >= 520;
    const S = two ? Math.floor((W - 14) / 2) : Math.min(W, 460);
    const font = S < 340 ? 10.5 : 11.5;
    const items = d.maps.map((m, i) =>
      '<div class="iec-map">' +
      (m.title ? `<div class="iec-map-title">${esc(m.title)}</div>` : '') +
      `<svg class="iec-svg" viewBox="0 0 ${S} ${S}" style="max-width:${S}px;margin:0 auto" role="img" aria-label="${esc(m.title || `地图 ${i + 1}`)}">${mapSvg(m, S, font)}</svg>` +
      '</div>'
    ).join('');
    const present = LEGEND_ORDER.filter((k) => d.maps.some((m) => m.features.some((f) => f.kind === k)));
    const legend =
      '<div class="iec-legend">' +
      (d.compass ? `<span class="iec-compass" title="指北针：上方为北">${COMPASS_SVG}</span>` : '') +
      present.map((k) => `<span><i class="iec-mf-${k}"></i>${esc(MAP_KINDS[k].legend)}</span>`).join('') +
      '</div>';
    return `<div class="iec-maps${two ? ' two' : ''}">${items}</div>` + legend;
  }

  function html(chart, width) {
    const d = normalize(chart);
    if (!d) return '<div class="iec-bad">图表数据缺失或格式不对，暂时无法显示</div>';
    const w = Math.max(280, Math.min(760, Number(width) || 560));
    const title = d.title ? `<div class="iec-title">${esc(d.title)}</div>` : '';
    if (d.type === 'table') return title + tableHtml(d);
    if (d.type === 'pie') return title + pieHtml(d, w);
    if (d.type === 'process') return title + processHtml(d, w);
    if (d.type === 'map') return title + mapHtml(d, w);
    return title + axisChartHtml(d, w);
  }

  // 挂载并在宽度变化时重绘；返回 dispose()，页面离开时调用以移除 resize 监听（元素移出文档后下次 resize 也会自动解绑）
  function mount(el, chart) {
    const noop = () => {};
    if (!el) return noop;
    el.classList.add('iec');
    let lastW = el.clientWidth || 0;
    el.innerHTML = html(chart, lastW);
    const d = normalize(chart);
    if (!d || d.type === 'table') return noop;
    let t = null;
    let disposed = false;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!el.isConnected) {
          dispose();
          return;
        }
        const w = el.clientWidth || 0;
        if (Math.abs(w - lastW) < 12) return;
        lastW = w;
        el.innerHTML = html(chart, w);
      }, 150);
    };
    function dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
    }
    window.addEventListener('resize', onResize);
    return dispose;
  }

  IE.chart = { mount, html, TYPE_LABEL };
})();
