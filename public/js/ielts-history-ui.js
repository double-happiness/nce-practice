'use strict';
// 雅思备考 · 记录子页：写作 / 口语历次自评记录、band 趋势折线（内联 SVG），点开看原文与题目（口语另有转写与流利度指标）。
// 接口：GET /api/ielts/history?type=writing|speaking&limit=、GET /api/ielts/summary；
// 题目标题优先用 history 返回的 title；缺 title 时才拉 GET /api/ielts/writing、GET /api/ielts/speaking 做映射（拿不到就只显示题目 id）。
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE || !IE.registerPage) return;
  const esc = NCE.escapeHtml;

  const LIMIT = 200;
  const Y_MIN = 3;
  const Y_MAX = 9;

  const style = document.createElement('style');
  style.textContent = `
    .ieh-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
    .ieh-sum div{border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:10px 12px}
    .ieh-sum b{display:block;font-size:22px;font-weight:800;color:var(--ink);line-height:1.2}
    .ieh-sum span{font-size:12px;color:var(--muted)}
    .ieh-tabs{margin:14px 0 0}
    .ieh-svg{display:block;width:100%;height:auto}
    .ieh-svg text{fill:var(--muted);font-family:inherit}
    .ieh-svg .grid{stroke:var(--border);stroke-width:1}
    .ieh-svg .target{stroke:var(--ok);stroke-width:1.5;stroke-dasharray:5 4}
    .ieh-svg text.target-l{fill:var(--ok)}
    .ieh-svg .line{fill:none;stroke:var(--brand);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
    .ieh-svg .dot{fill:var(--brand)}
    .ieh-list{display:flex;flex-direction:column;gap:8px}
    .ieh-rec{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card)}
    .ieh-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;cursor:pointer}
    .ieh-row:hover{background:rgba(127,127,127,.05)}
    .ieh-date{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
    .ieh-title{flex:1;min-width:160px;font-size:14px;color:var(--ink);line-height:1.5}
    .ieh-meta{font-size:12.5px;color:var(--muted);white-space:nowrap}
    .ieh-band{font-size:16px;font-weight:800;color:var(--brand);min-width:36px;text-align:right}
    .ieh-detail{border-top:1px dashed var(--border);padding:12px 14px;font-size:14px;color:var(--ink-soft);line-height:1.75}
    .ieh-detail .essay{font-family:Georgia,"Times New Roman",serif;color:var(--ink);overflow-wrap:anywhere}
    .ieh-detail .essay p{margin:0 0 8px}
    .ieh-detail details{margin-top:8px}
    .ieh-detail summary{cursor:pointer;color:var(--brand);font-weight:600}
    .ieh-prompt{margin-bottom:10px;padding:8px 10px;border-radius:8px;background:rgba(127,127,127,.06);white-space:pre-line}
    .ieh-tx{margin-top:6px;color:var(--ink);overflow-wrap:anywhere}
    .ieh-tx p{margin:0 0 6px}
  `;
  document.head.appendChild(style);

  const st = {
    type: 'writing',
    records: { writing: null, speaking: null },
    titles: null, // id → 标题
    titlesLoading: null,
    full: {}, // 'writing:id' / 'speaking:id' → 完整题目
  };
  let root = null;
  let ctx = null;

  function alive() {
    return ctx && ctx.isActive();
  }
  function paragraphsHtml(text) {
    const paras = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (!paras.length) return '<p class="ie-muted">（空）</p>';
    return paras.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  function toList(r) {
    if (Array.isArray(r)) return r;
    if (r && Array.isArray(r.items)) return r.items;
    if (r && Array.isArray(r.records)) return r.records;
    return [];
  }
  function scoresText(s) {
    if (!s || typeof s !== 'object') return '';
    return Object.keys(s).map((k) => `${k} ${IE.fmtBand(s[k])}`).join(' · ');
  }
  function clip(s, n) {
    const str = String(s || '');
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }
  // 口语记录的流利度指标（语音识别统计，可选字段）；只显示白名单里的有限数
  const SPEAKING_METRICS = [
    ['words', '总词数'],
    ['wpm', '语速 WPM'],
    ['fillers', '填充词'],
    ['repeats', '重复词'],
    ['longPauses', '长停顿（>3 秒）'],
    ['connectives', '连接词 / 复杂句标记'],
  ];
  function speakingMetricsHtml(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return '';
    const parts = SPEAKING_METRICS
      .filter(([k]) => typeof m[k] === 'number' && Number.isFinite(m[k]))
      .map(([k, label]) => `${label} ${m[k]}`);
    if (!parts.length) return '';
    return `<div style="margin-top:6px"><b>流利度指标：</b>${esc(parts.join(' · '))} <span class="ie-muted">（来自语音识别，只作参考）</span></div>`;
  }
  function transcriptHtml(text) {
    if (typeof text !== 'string' || !text.trim()) return '';
    return `<details open><summary>转写文本</summary><div class="ieh-tx">${paragraphsHtml(text)}</div></details>`;
  }

  // 题目标题映射（只用于展示，失败不影响记录列表）
  function loadTitles() {
    if (st.titles) return Promise.resolve(st.titles);
    if (st.titlesLoading) return st.titlesLoading;
    let failed = false;
    const soft = (url) => IE.get(url).then(toList, (e) => {
      failed = true;
      console.warn('[ielts-history] 题目列表加载失败，标题先显示题目 id', url, e);
      return [];
    });
    st.titlesLoading = Promise.all([
      soft('/api/ielts/writing'),
      soft('/api/ielts/speaking'),
    ]).then(([w, s]) => {
      const map = {};
      w.forEach((it) => { if (it && it.id) map['writing:' + it.id] = clip(it.prompt, 90); });
      s.forEach((it) => {
        if (!it || !it.id) return;
        const t = Number(it.part) === 2 ? it.cueCard && it.cueCard.title : [it.topic, it.topicCn].filter(Boolean).join(' · ');
        map['speaking:' + it.id] = t || it.id;
      });
      // 映射为空或有一边没拉到时不缓存，下次进入再重试
      if (!failed && Object.keys(map).length) st.titles = map;
      st.titlesLoading = null;
      return map;
    });
    return st.titlesLoading;
  }

  function recordLabel(type, r) {
    if (type === 'writing') {
      if (Number(r.task) === 2) return 'Task 2';
      return r.variant === 'G' ? 'Task 1 G' : 'Task 1 A';
    }
    return Number(r.part) === 2 ? 'Part 2 + 3' : `Part ${r.part || 1}`;
  }

  // ---------- 趋势 ----------
  function trendHtml(list, width) {
    const pts = list
      .filter((r) => Number.isFinite(Number(r.band)))
      .slice()
      .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
      .slice(-30);
    if (pts.length < 2) {
      return '<div class="ie-empty">积累 2 次以上记录后，这里会显示 band 趋势 📈</div>';
    }
    const W = Math.max(300, Math.min(760, Math.round(width || 600)));
    const H = 200;
    const padL = 34, padR = 16, padT = 14, padB = 26;
    const iw = W - padL - padR, ih = H - padT - padB;
    const n = pts.length;
    const x = (i) => padL + (i / (n - 1)) * iw;
    const y = (v) => padT + (1 - (Math.max(Y_MIN, Math.min(Y_MAX, v)) - Y_MIN) / (Y_MAX - Y_MIN)) * ih;
    let g = '';
    for (let v = Y_MIN; v <= Y_MAX; v++) {
      g += `<line class="grid" x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}"/>`;
      g += `<text x="${padL - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end">${v}</text>`;
    }
    const prof = IE.getProfile().profile;
    const target = prof && prof.target ? Number(prof.target.overall) : NaN;
    if (Number.isFinite(target) && target >= Y_MIN && target <= Y_MAX) {
      g += `<line class="target" x1="${padL}" y1="${y(target).toFixed(1)}" x2="${W - padR}" y2="${y(target).toFixed(1)}"/>`;
      g += `<text class="target-l" x="${W - padR}" y="${(y(target) - 5).toFixed(1)}" font-size="11" text-anchor="end">目标 ${IE.fmtBand(target)}</text>`;
    }
    g += `<polyline class="line" points="${pts.map((p, i) => `${x(i).toFixed(1)},${y(Number(p.band)).toFixed(1)}`).join(' ')}"/>`;
    pts.forEach((p, i) => {
      g += `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(Number(p.band)).toFixed(1)}" r="4"><title>${esc(IE.fmtDateTime(p.ts))}：${esc(IE.fmtBand(p.band))}</title></circle>`;
    });
    const d0 = IE.fmtDateTime(pts[0].ts).slice(5, 10);
    const d1 = IE.fmtDateTime(pts[n - 1].ts).slice(5, 10);
    g += `<text x="${padL}" y="${H - 6}" font-size="11">${esc(d0)}</text>`;
    g += `<text x="${W - padR}" y="${H - 6}" font-size="11" text-anchor="end">${esc(d1)}</text>`;
    return `<svg class="ieh-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="band 趋势">${g}</svg>` +
      `<div class="ie-muted" style="text-align:center">最近 ${n} 次自评 band（按时间从左到右）</div>`;
  }

  // ---------- 列表 ----------
  function recHtml(type, r, i) {
    const titles = st.titles || {};
    const id = type === 'writing' ? r.promptId : r.itemId;
    const title = r.title || titles[type + ':' + id] || id || '（未知题目）';
    const meta = [];
    if (type === 'writing' && r.wordCount != null) meta.push(`${r.wordCount} 词`);
    if (r.durationSec != null) meta.push(IE.fmtDuration(r.durationSec));
    return (
      `<div class="ieh-rec" data-i="${i}">` +
      '<div class="ieh-row">' +
      `<span class="ieh-date">${esc(IE.fmtDateTime(r.ts))}</span>` +
      `<span class="ie-pill">${esc(recordLabel(type, r))}</span>` +
      `<span class="ieh-title">${esc(title)}</span>` +
      (meta.length ? `<span class="ieh-meta">${esc(meta.join(' · '))}</span>` : '') +
      `<span class="ieh-band">${esc(IE.fmtBand(r.band))}</span>` +
      '</div>' +
      '</div>'
    );
  }

  async function fullItem(type, id) {
    const key = type + ':' + id;
    if (st.full[key]) return st.full[key];
    const item = await IE.get(`/api/ielts/${type}/${encodeURIComponent(id)}`);
    st.full[key] = item;
    return item;
  }

  async function toggleDetail(type, recEl, r) {
    const open = recEl.querySelector('.ieh-detail');
    if (open) {
      open.remove();
      return;
    }
    const det = document.createElement('div');
    det.className = 'ieh-detail';
    const dims = scoresText(r.selfScores);
    if (type === 'writing') {
      det.innerHTML =
        '<div class="ieh-prompt ie-muted">正在加载题目…</div>' +
        (dims ? `<div>四维自评：${esc(dims)}</div>` : '') +
        '<div style="margin-top:8px"><b>我的作文</b></div>' +
        `<div class="essay">${paragraphsHtml(r.text)}</div>`;
    } else {
      det.innerHTML =
        '<div class="ieh-prompt ie-muted">正在加载题目…</div>' +
        (dims ? `<div>四维自评：${esc(dims)}</div>` : '') +
        (r.notes ? `<div style="margin-top:6px"><b>备注：</b>${esc(r.notes)}</div>` : '') +
        speakingMetricsHtml(r.metrics) +
        transcriptHtml(r.transcript) +
        '<div class="ie-muted" style="margin-top:6px">录音不保存（只在练习当时的页面内存里）。</div>';
    }
    recEl.appendChild(det);
    const id = type === 'writing' ? r.promptId : r.itemId;
    const promptEl = det.querySelector('.ieh-prompt');
    if (!id) {
      promptEl.textContent = '没有题目信息';
      return;
    }
    let item;
    try {
      item = await fullItem(type, id);
    } catch (e) {
      promptEl.textContent = `题目 ${id} 加载失败：${e.message}`;
      return;
    }
    if (!det.isConnected) return;
    promptEl.classList.remove('ie-muted');
    if (type === 'writing') {
      const bullets = Array.isArray(item.bullets) && item.bullets.length
        ? '\n' + item.bullets.map((b) => '• ' + b).join('\n')
        : '';
      promptEl.textContent = (item.prompt || id) + bullets;
      if (item.modelAnswer) {
        det.insertAdjacentHTML('beforeend',
          `<details><summary>看范文${item.modelBand != null ? `（约 Band ${esc(IE.fmtBand(item.modelBand))}）` : ''}</summary><div class="essay" style="margin-top:6px">${paragraphsHtml(item.modelAnswer)}</div></details>`);
      }
    } else if (Number(item.part) === 2) {
      const cue = item.cueCard || {};
      const pts = Array.isArray(cue.points) ? cue.points.map((p) => '• ' + p).join('\n') : '';
      const p3 = Array.isArray(item.part3) ? item.part3.map((q) => '• ' + q.q).join('\n') : '';
      promptEl.textContent = [cue.title, pts, cue.final, p3 ? 'Part 3：\n' + p3 : ''].filter(Boolean).join('\n');
    } else {
      const qs = Array.isArray(item.questions) ? item.questions.map((q) => '• ' + q.q).join('\n') : '';
      promptEl.textContent = [[item.topic, item.topicCn].filter(Boolean).join(' · '), qs].filter(Boolean).join('\n');
    }
  }

  function paintRecords() {
    const type = st.type;
    const list = st.records[type] || [];
    const box = root.querySelector('.ieh-main');
    if (!box) return;
    const name = type === 'writing' ? '写作' : '口语';
    if (!list.length) {
      box.innerHTML = `<div class="ie-card"><div class="ie-empty">还没有${name}记录。去「${name}」子页完成一次练习和自评，这里就会出现。<br><button type="button" class="btn small primary ieh-go" style="margin-top:10px">去练${name} →</button></div></div>`;
      box.querySelector('.ieh-go').onclick = () => ctx.go(type);
      return;
    }
    box.innerHTML =
      `<div class="ie-card"><h3>📈 ${name} band 趋势</h3><div class="ieh-trend"></div></div>` +
      `<div class="ie-card"><h3>🗂️ ${name}记录 <span class="ie-h3-sub">共 ${list.length} 条 · 点开看原文</span></h3><div class="ieh-list">${list.map((r, i) => recHtml(type, r, i)).join('')}</div></div>`;
    const trend = box.querySelector('.ieh-trend');
    trend.innerHTML = trendHtml(list, trend.clientWidth);
    box.querySelectorAll('.ieh-rec').forEach((el) => {
      el.querySelector('.ieh-row').onclick = () => toggleDetail(type, el, list[Number(el.dataset.i)]);
    });
  }

  async function loadRecords() {
    const type = st.type;
    const box = root.querySelector('.ieh-main');
    box.innerHTML = '<div class="ie-loading">正在加载记录…</div>';
    let list;
    try {
      list = toList(await IE.get(`/api/ielts/history?type=${encodeURIComponent(type)}&limit=${LIMIT}`));
    } catch (e) {
      if (!alive() || st.type !== type) return;
      box.innerHTML = '<div class="ie-card">' + IE.errorHtml('练习记录加载失败', e) + '</div>';
      IE.bindRetry(box, loadRecords);
      return;
    }
    if (!alive() || st.type !== type) return;
    // 后端已在每条记录里带 title；只有缺 title 时才拉题目列表做映射（loadTitles 不会抛错）
    if (list.some((r) => !r || !r.title)) {
      await loadTitles();
      if (!alive() || st.type !== type) return;
    }
    st.records[type] = list;
    paintRecords();
  }

  async function loadSummary() {
    const el = root.querySelector('.ieh-summary');
    let sum;
    try {
      sum = await IE.get('/api/ielts/summary');
    } catch (e) {
      if (el) el.remove(); // 概况拿不到就不显示，不影响记录
      return;
    }
    if (!alive() || !el || !el.isConnected) return;
    const w = sum.writing || {};
    const s = sum.speaking || {};
    const v = sum.vocab || {};
    const e = sum.estimate || {};
    el.innerHTML =
      '<div class="ieh-sum">' +
      `<div><b>${esc(IE.fmtBand(w.last3Avg))}</b><span>写作近 3 次均分 · 共 ${Number(w.count) || 0} 篇</span></div>` +
      `<div><b>${esc(IE.fmtBand(s.last3Avg))}</b><span>口语近 3 次均分 · 共 ${Number(s.count) || 0} 次</span></div>` +
      `<div><b>${v.lastOverall != null ? esc(String(v.lastOverall)) + '%' : '—'}</b><span>最近一次词汇诊断</span></div>` +
      `<div><b>${esc(IE.fmtBand(e.overall))}</b><span>总分粗估${e.note ? ' · ' + esc(e.note) : ''}</span></div>` +
      '</div>';
  }

  function render(body, c) {
    root = body;
    ctx = c;
    st.records = { writing: null, speaking: null }; // 每次进入都重新拉，刚提交的记录能马上看到
    body.innerHTML =
      '<div class="ie-card ieh-summary"><div class="ie-loading" style="padding:8px 0">正在加载概况…</div></div>' +
      '<div class="ie-row chips ieh-tabs">' +
      `<div class="chip${st.type === 'writing' ? ' active' : ''}" data-t="writing">✍️ 写作</div>` +
      `<div class="chip${st.type === 'speaking' ? ' active' : ''}" data-t="speaking">🎙️ 口语</div>` +
      '</div>' +
      '<div class="ieh-main"></div>';
    body.querySelectorAll('.ieh-tabs .chip').forEach((chip) => {
      chip.onclick = () => {
        if (chip.dataset.t === st.type) return;
        st.type = chip.dataset.t;
        body.querySelectorAll('.ieh-tabs .chip').forEach((x) => x.classList.toggle('active', x === chip));
        if (st.records[st.type]) paintRecords();
        else loadRecords();
      };
    });
    loadSummary();
    loadRecords();
  }

  IE.registerPage('history', { render });
})();
