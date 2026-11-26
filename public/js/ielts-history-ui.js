'use strict';
// 雅思备考 · 记录子页：写作 / 口语历次自评记录、听力 / 阅读历次成绩，band 趋势折线（内联 SVG）；
// 写作口语点开看原文与题目（口语另有转写与流利度指标），听力阅读点开看错题并可跳回对应模块重做。
// 接口：GET /api/ielts/history?type=writing|speaking|listening|reading&limit=、GET /api/ielts/summary；
// 写作口语的题目标题优先用 history 返回的 title；缺 title 时才拉 GET /api/ielts/writing、GET /api/ielts/speaking 做映射（拿不到就只显示题目 id）。
// 「剑雅」标签：录入 / 查看 / 删除剑桥雅思等外部真题成绩，接口 GET / POST /api/ielts/external-tests、DELETE /api/ielts/external-tests/:id
// （设计见 docs/design/ielts-external-scores-20261126.md §6–7）。
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
    .ieh-svg .dot.practice{fill:var(--card);stroke:var(--brand);stroke-width:2}
    .ieh-sum-note{margin-top:10px;line-height:1.7}
    .ieh-wrongs{display:flex;flex-direction:column;gap:8px;margin-top:8px}
    .ieh-wrong{padding:9px 12px;border-radius:8px;background:rgba(127,127,127,.06);font-size:13.5px;line-height:1.7;overflow-wrap:anywhere}
    .ieh-wrong-q{color:var(--ink)}
    .ieh-wrong-q b{margin-right:6px}
    .ieh-wrong .bad{color:var(--bad);font-weight:600}
    .ieh-wrong .ok{color:var(--ok);font-weight:600}
    .ieh-wrong .quote{font-family:Georgia,"Times New Roman",serif;font-style:italic}
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
    .iex-form [hidden]{display:none}
    .iex-num{width:110px}
    .iex-grow{flex:1;min-width:200px}
    .iex-grow .ie-input{width:100%;box-sizing:border-box}
    .iex-notes{display:block;width:100%;box-sizing:border-box;min-height:64px;resize:vertical}
    .iex-chk{display:inline-flex;gap:7px;align-items:center;font-size:13px;color:var(--ink-soft);cursor:pointer;line-height:1.55}
    .iex-chk input{accent-color:var(--brand)}
    .iex-ovr-box{margin-top:10px}
    .iex-line{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;padding:10px 12px}
    .iex-pills{display:flex;gap:6px;flex-wrap:wrap}
    .iex-memo{padding:0 12px 10px;font-size:13px;color:var(--muted);line-height:1.6;white-space:pre-line;overflow-wrap:anywhere}
  `;
  document.head.appendChild(style);

  // 记录类型：todo 用于空状态引导，hint 是列表标题旁的提示
  const TYPES = {
    writing: { name: '写作', icon: '✍️', todo: '完成一次练习和自评', hint: '点开看原文' },
    speaking: { name: '口语', icon: '🎙️', todo: '完成一次练习和自评', hint: '点开看原文' },
    listening: { name: '听力', icon: '🎧', todo: '做完一组题并交卷', hint: '点开看错题' },
    reading: { name: '阅读', icon: '📖', todo: '做完一篇并交卷', hint: '点开看错题' },
  };
  // 听力 / 阅读：有原始分和错题，没有自评维度
  function isScored(type) {
    return type === 'listening' || type === 'reading';
  }

  // 「剑雅」标签不走 /api/ielts/history，放在四个记录类型之后
  const EXT_TAB = { name: '剑雅', icon: '📘' };
  const TAB_KEYS = [...Object.keys(TYPES), 'external'];
  function tabMeta(key) {
    return key === 'external' ? EXT_TAB : TYPES[key];
  }
  // 计划页「录成绩 →」写入的一次性标记（ielts-plan-ui.js），进入记录页时读到就打开对应标签
  const TAB_HINT_KEY = 'nce-ielts-history-tab';
  const EXT_SKILLS = [
    { key: 'listening', short: '听' },
    { key: 'reading', short: '读' },
    { key: 'writing', short: '写' },
    { key: 'speaking', short: '口' },
  ];
  // 听力 / 阅读按书后换算表填的 band：0–9、步长 0.5（低分段也能填）；写作 / 口语沿用 IE.BAND_STEPS
  const LR_BANDS = Array.from({ length: 19 }, (_, i) => i / 2);
  const RAW_MAX = 40;
  const BOOK_RANGE = [1, 30];
  const TEST_RANGE = [1, 4];
  const MAX_PAST_DAYS = 730; // 与后端一致：只能补录两年内的成绩
  // 顺带打勾的计划任务 key → 展示名（data/ielts/plan.json 里的外部任务）
  const EXT_TASK_NAME = { 'cam-lr': '剑雅听力 + 阅读', 'cam-mock': '剑雅全套模考' };

  const st = {
    type: 'writing',
    records: { writing: null, speaking: null, listening: null, reading: null },
    titles: null, // id → 标题
    titlesLoading: null,
    full: {}, // 'writing:id' / 'speaking:id' → 完整题目
    sumSeq: 0, // 概况请求序号：录入 / 删除后会重拉，只认最后一次
    extSeq: 0, // 剑雅列表请求序号
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
  // opts（可选）：hollow(r) 为 true 的点画成空心（听力 / 阅读的练习模式），caption(n) 自定义图下说明
  function trendHtml(list, width, opts) {
    const o = opts || {};
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
    // 纵轴默认 3–9；有低于 3 的成绩（听力阅读低分段）时向下扩到对应整数，避免点被压在底线上
    const yMin = Math.max(0, Math.min(Y_MIN, Math.floor(Math.min(...pts.map((p) => Number(p.band))))));
    const x = (i) => padL + (i / (n - 1)) * iw;
    const y = (v) => padT + (1 - (Math.max(yMin, Math.min(Y_MAX, v)) - yMin) / (Y_MAX - yMin)) * ih;
    let g = '';
    for (let v = yMin; v <= Y_MAX; v++) {
      g += `<line class="grid" x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}"/>`;
      g += `<text x="${padL - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end">${v}</text>`;
    }
    const prof = IE.getProfile().profile;
    const target = prof && prof.target ? Number(prof.target.overall) : NaN;
    if (Number.isFinite(target) && target >= yMin && target <= Y_MAX) {
      g += `<line class="target" x1="${padL}" y1="${y(target).toFixed(1)}" x2="${W - padR}" y2="${y(target).toFixed(1)}"/>`;
      g += `<text class="target-l" x="${W - padR}" y="${(y(target) - 5).toFixed(1)}" font-size="11" text-anchor="end">目标 ${IE.fmtBand(target)}</text>`;
    }
    g += `<polyline class="line" points="${pts.map((p, i) => `${x(i).toFixed(1)},${y(Number(p.band)).toFixed(1)}`).join(' ')}"/>`;
    pts.forEach((p, i) => {
      const hollow = typeof o.hollow === 'function' && o.hollow(p);
      g += `<circle class="dot${hollow ? ' practice' : ''}" cx="${x(i).toFixed(1)}" cy="${y(Number(p.band)).toFixed(1)}" r="4"><title>${esc(IE.fmtDateTime(p.ts))}：${esc(IE.fmtBand(p.band))}</title></circle>`;
    });
    const d0 = IE.fmtDateTime(pts[0].ts).slice(5, 10);
    const d1 = IE.fmtDateTime(pts[n - 1].ts).slice(5, 10);
    g += `<text x="${padL}" y="${H - 6}" font-size="11">${esc(d0)}</text>`;
    g += `<text x="${W - padR}" y="${H - 6}" font-size="11" text-anchor="end">${esc(d1)}</text>`;
    const caption = typeof o.caption === 'function' ? o.caption(n) : `最近 ${n} 次自评 band（按时间从左到右）`;
    return `<svg class="ieh-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="band 趋势">${g}</svg>` +
      `<div class="ie-muted" style="text-align:center">${esc(caption)}</div>`;
  }

  // 听力 / 阅读：练习模式画空心点（不计入总分估算）
  const SCORED_TREND = {
    hollow: (r) => r.mode !== 'exam',
    caption: (n) => `最近 ${n} 次 band（实心为模考、空心为练习，按时间从左到右）`,
  };

  // ---------- 列表 ----------
  function recHtml(type, r, i) {
    const pills = [];
    const meta = [];
    let title;
    if (isScored(type)) {
      // 听力 / 阅读：题目已不在题库时后端 title 为空，退回显示题目 id
      title = r.title || (type === 'listening' ? r.sectionId : r.passageId) || '（未知题目）';
      if (type === 'listening' && r.part) pills.push(`<span class="ie-pill">Part ${esc(String(r.part))}</span>`);
      pills.push(r.mode === 'exam' ? '<span class="ie-pill">模考</span>' : '<span class="ie-pill mute">练习</span>');
      meta.push(`${r.raw} / ${r.total}`);
      meta.push(Number(r.wrongCount) > 0 ? `错 ${r.wrongCount} 题` : '全对');
    } else {
      const titles = st.titles || {};
      const id = type === 'writing' ? r.promptId : r.itemId;
      title = r.title || titles[type + ':' + id] || id || '（未知题目）';
      pills.push(`<span class="ie-pill">${esc(recordLabel(type, r))}</span>`);
      if (type === 'writing' && r.wordCount != null) meta.push(`${r.wordCount} 词`);
    }
    if (r.durationSec != null) meta.push(IE.fmtDuration(r.durationSec));
    return (
      `<div class="ieh-rec" data-i="${i}">` +
      '<div class="ieh-row">' +
      `<span class="ieh-date">${esc(IE.fmtDateTime(r.ts))}</span>` +
      pills.join('') +
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

  // 一道错题：听力有「你的答案」（空串为未作答）；阅读记录不保存作答内容，yours 为 null
  function wrongItemHtml(w) {
    const answer = Array.isArray(w.answer) ? w.answer.join(' / ') : '';
    let yours = '';
    if (typeof w.yours === 'string') {
      yours = w.yours
        ? `<div>你的答案：<span class="bad">${esc(w.yours)}</span>${w.overLimit ? '（超出字数限制，判错）' : ''}</div>`
        : '<div>你的答案：<span class="bad">未作答</span></div>';
    }
    const quote = w.quote
      ? `<div class="ie-muted">原文${w.para ? `（${esc(w.para)} 段）` : ''}：<span class="quote">${esc(w.quote)}</span></div>`
      : '';
    return (
      '<div class="ieh-wrong">' +
      `<div class="ieh-wrong-q"><b>第 ${esc(String(w.no))} 题</b>${esc(w.prompt || '')}</div>` +
      yours +
      `<div>正确答案：<span class="ok">${esc(answer)}</span>${w.answerText ? ` · ${esc(w.answerText)}` : ''}</div>` +
      quote +
      (w.explanation ? `<div>解析：${esc(w.explanation)}</div>` : '') +
      '</div>'
    );
  }

  function scoredDetailHtml(type, r) {
    const name = TYPES[type].name;
    let body;
    if (!(Number(r.wrongCount) > 0)) {
      body = '<div>这次全部答对 🎉</div>';
    } else if (!Array.isArray(r.wrongItems)) {
      body = `<div class="ie-muted">题目已更新或已不在题库，无法还原这次的 ${esc(String(r.wrongCount))} 道错题。</div>`;
    } else {
      body =
        `<div><b>错题 ${r.wrongItems.length} 道</b>` +
        (type === 'reading' ? '<span class="ie-muted">（阅读记录不保存作答内容，这里只列正确答案）</span>' : '') +
        '</div>' +
        `<div class="ieh-wrongs">${r.wrongItems.map(wrongItemHtml).join('')}</div>`;
    }
    return (
      body +
      '<div class="ie-row" style="margin-top:10px">' +
      `<button type="button" class="btn small primary ieh-redo">去${name}再练 →</button>` +
      (r.mode === 'exam' ? '' : '<span class="ie-muted">练习模式的成绩不计入总分估算</span>') +
      '</div>'
    );
  }

  async function toggleDetail(type, recEl, r) {
    const open = recEl.querySelector('.ieh-detail');
    if (open) {
      open.remove();
      return;
    }
    const det = document.createElement('div');
    det.className = 'ieh-detail';
    if (isScored(type)) {
      // 错题已随记录返回，不用再请求；按钮跳到对应模块（NCE.ielts.go）
      det.innerHTML = scoredDetailHtml(type, r);
      recEl.appendChild(det);
      det.querySelector('.ieh-redo').onclick = () => ctx.go(type);
      return;
    }
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
    const t = TYPES[type];
    const name = t.name;
    if (!list.length) {
      box.innerHTML = `<div class="ie-card"><div class="ie-empty">还没有${name}记录。去「${name}」子页${t.todo}，这里就会出现。<br><button type="button" class="btn small primary ieh-go" style="margin-top:10px">去练${name} →</button></div></div>`;
      box.querySelector('.ieh-go').onclick = () => ctx.go(type);
      return;
    }
    box.innerHTML =
      `<div class="ie-card"><h3>📈 ${name} band 趋势</h3><div class="ieh-trend"></div></div>` +
      `<div class="ie-card"><h3>🗂️ ${name}记录 <span class="ie-h3-sub">共 ${list.length} 条 · ${t.hint}</span></h3><div class="ieh-list">${list.map((r, i) => recHtml(type, r, i)).join('')}</div></div>`;
    const trend = box.querySelector('.ieh-trend');
    trend.innerHTML = trendHtml(list, trend.clientWidth, isScored(type) ? SCORED_TREND : null);
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
    // 后端已在每条记录里带 title；写作口语缺 title 时才拉题目列表做映射（loadTitles 不会抛错）。
    // 听力阅读的 title 为空说明题目已不在题库，列表里直接显示题目 id
    if (!isScored(type) && list.some((r) => !r || !r.title)) {
      await loadTitles();
      if (!alive() || st.type !== type) return;
    }
    st.records[type] = list;
    paintRecords();
  }

  // ---------- 剑雅成绩 ----------
  function pad2(n) {
    return String(n).padStart(2, '0');
  }
  // n 天前的本地日期 YYYY-MM-DD（日期输入框的 min）
  function daysAgoStr(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function bandOptionsHtml(steps) {
    return '<option value="">不填</option>' + steps.map((b) => `<option value="${b}">${b.toFixed(1)}</option>`).join('');
  }
  function fieldHtml(id, label, control, cls) {
    return `<div class="ie-field${cls ? ' ' + cls : ''}"><label class="ie-label" for="${id}">${esc(label)}</label>${control}</div>`;
  }
  function intInputHtml(id, lo, hi, placeholder) {
    return `<input class="ie-input iex-num" type="number" id="${id}" min="${lo}" max="${hi}" step="1" inputmode="numeric" placeholder="${esc(placeholder)}">`;
  }
  function bandSelectHtml(id, steps) {
    return `<select id="${id}">${bandOptionsHtml(steps)}</select>`;
  }

  // G 类阅读没有内置换算表：阅读 band 直接放在原始分旁边、必填；A 类的听力 / 阅读 band 都收在「按书后换算表填 band」里
  function extFormHtml(isG) {
    const today = IE.todayStr();
    const testOptions = '<option value="">不填</option>' +
      Array.from({ length: TEST_RANGE[1] - TEST_RANGE[0] + 1 }, (_, i) => `<option value="${TEST_RANGE[0] + i}">Test ${TEST_RANGE[0] + i}</option>`).join('');
    const hint = isG
      ? '听力填答对题数（/40）会自动换算 band；G 类阅读没有内置换算表，请按书后换算表选阅读 band，原始分可不填。写作、口语按自评或老师给分填。'
      : '听力、阅读填答对题数（/40），按 A 类换算表自动出 band；剑雅每本书后的换算表略有差异，想以书为准就勾上「按书后换算表填 band」。写作、口语按自评或老师给分填。';
    return (
      '<h3>📝 录入剑雅成绩 <span class="ie-h3-sub">四项至少填一项，没做的留空</span></h3>' +
      '<div class="ie-form iex-form">' +
      '<div class="ie-row">' +
      fieldHtml('iexDate', '做题日期', `<input class="ie-input" type="date" id="iexDate" value="${esc(today)}" max="${esc(today)}" min="${esc(daysAgoStr(MAX_PAST_DAYS))}">`) +
      fieldHtml('iexBook', '剑雅书号', intInputHtml('iexBook', BOOK_RANGE[0], BOOK_RANGE[1], '如 18')) +
      fieldHtml('iexTest', 'Test 号', `<select id="iexTest">${testOptions}</select>`) +
      fieldHtml('iexTitle', '标题（可选）', '<input class="ie-input" type="text" id="iexTitle" maxlength="60" placeholder="不填则显示为 剑雅 18 Test 2">', 'iex-grow') +
      '</div>' +
      '<div class="ie-row">' +
      fieldHtml('iexLRaw', `听力原始分 /${RAW_MAX}`, intInputHtml('iexLRaw', 0, RAW_MAX, '答对题数')) +
      fieldHtml('iexRRaw', `阅读原始分 /${RAW_MAX}`, intInputHtml('iexRRaw', 0, RAW_MAX, isG ? '可不填' : '答对题数')) +
      (isG ? fieldHtml('iexRBandG', '阅读 band（G 类必填）', bandSelectHtml('iexRBandG', LR_BANDS)) : '') +
      fieldHtml('iexW', '写作 band', bandSelectHtml('iexW', IE.BAND_STEPS)) +
      fieldHtml('iexS', '口语 band', bandSelectHtml('iexS', IE.BAND_STEPS)) +
      '</div>' +
      '<div>' +
      `<label class="iex-chk"><input type="checkbox" id="iexOvr">${isG ? '按书后换算表填听力 band' : '按书后换算表填 band'}（填了以它为准）</label>` +
      '<div class="ie-row iex-ovr-box" id="iexOvrBox" hidden>' +
      fieldHtml('iexLBand', '听力 band', bandSelectHtml('iexLBand', LR_BANDS)) +
      (isG ? '' : fieldHtml('iexRBand', '阅读 band', bandSelectHtml('iexRBand', LR_BANDS))) +
      '</div>' +
      '</div>' +
      fieldHtml('iexNotes', '备注（可选）', '<textarea class="ie-input iex-notes" id="iexNotes" maxlength="500" placeholder="错得多的题型、时间分配、下次要注意的地方…"></textarea>') +
      '<label class="iex-chk"><input type="checkbox" id="iexTick" checked>同时在学习计划里打勾当天的剑雅任务</label>' +
      '<div class="ie-row"><button type="button" class="btn small primary" id="iexSave">保存成绩</button><span class="ie-msg" id="iexMsg"></span></div>' +
      `<div class="ie-muted">${esc(hint)}</div>` +
      '</div>'
    );
  }

  // 可选整数：空 → null；非整数或越界抛出中文说明（collectExternal 统一接住）
  function readInt(el, range, name) {
    const s = String(el.value || '').trim();
    const msg = `${name}请填写 ${range[0]}–${range[1]} 的整数`;
    if (!s) {
      // number 输入框里填了非数字时 value 为空串，但 badInput 为 true，不能当成没填
      if (el.validity && el.validity.badInput) throw new Error(msg);
      return null;
    }
    if (!/^\d+$/.test(s)) throw new Error(msg);
    const n = Number(s);
    if (n < range[0] || n > range[1]) throw new Error(msg);
    return n;
  }
  function readBand(sel) {
    if (!sel || sel.value === '') return null;
    const n = Number(sel.value);
    return Number.isFinite(n) ? n : null;
  }
  // 听力 / 阅读：只填原始分 → { raw }，填了 band → { raw?, band }，都没填 → null（整项不发）
  function rawBandEntry(raw, band) {
    if (raw == null && band == null) return null;
    const out = {};
    if (raw != null) out.raw = raw;
    if (band != null) out.band = band;
    return out;
  }

  // 表单 → POST 请求体；校验不过返回 { error }
  function collectExternal(card, isG) {
    const $ = (id) => card.querySelector('#' + id);
    const today = IE.todayStr();
    const date = $('iexDate').value;
    if (!IE.isDateStr(date)) return { error: '请填写有效的做题日期' };
    if (date > today) return { error: '做题日期不能晚于今天' };
    if (IE.daysBetween(date, today) > MAX_PAST_DAYS) return { error: '只能补录两年内的成绩' };
    let book, test, lRaw, rRaw;
    try {
      book = readInt($('iexBook'), BOOK_RANGE, '剑雅书号');
      test = readInt($('iexTest'), TEST_RANGE, 'Test 号');
      lRaw = readInt($('iexLRaw'), [0, RAW_MAX], '听力原始分');
      rRaw = readInt($('iexRRaw'), [0, RAW_MAX], '阅读原始分');
    } catch (e) {
      return { error: e.message };
    }
    // 没勾「按书后换算表填 band」时忽略收起来的 band 选择
    const ovr = $('iexOvr').checked;
    const lBand = ovr ? readBand($('iexLBand')) : null;
    const rBand = isG ? readBand($('iexRBandG')) : ovr ? readBand($('iexRBand')) : null;
    if (isG && rRaw != null && rBand == null) return { error: 'G 类阅读没有内置换算表，请按书后换算表选阅读 band' };

    const body = { date, tickPlan: $('iexTick').checked };
    if (book != null) body.book = book;
    if (test != null) body.test = test;
    const title = $('iexTitle').value.trim();
    if (title) body.title = title;
    const listening = rawBandEntry(lRaw, lBand);
    const reading = rawBandEntry(rRaw, rBand);
    const writing = readBand($('iexW'));
    const speaking = readBand($('iexS'));
    if (listening) body.listening = listening;
    if (reading) body.reading = reading;
    if (writing != null) body.writing = { band: writing };
    if (speaking != null) body.speaking = { band: speaking };
    if (!listening && !reading && writing == null && speaking == null) return { error: '听说读写至少填一项成绩' };
    const notes = $('iexNotes').value.trim();
    if (notes) body.notes = notes;
    return { body };
  }

  function savedToastText(item, ticked, tickPlan) {
    const name = item && item.displayTitle ? `「${item.displayTitle}」` : '';
    let s = `剑雅成绩${name}已保存`;
    if (ticked.length) s += `，已在学习计划里打勾：${ticked.map((k) => EXT_TASK_NAME[k] || k).join('、')}`;
    else if (tickPlan) s += '（这一天不在备考计划内或当周没有剑雅任务，没有打勾）';
    return s;
  }

  function mountExternalForm(card) {
    const prof = IE.getProfile().profile;
    const isG = !!(prof && prof.examType === 'G');
    card.innerHTML = extFormHtml(isG);
    const ovr = card.querySelector('#iexOvr');
    const ovrBox = card.querySelector('#iexOvrBox');
    ovr.onchange = () => { ovrBox.hidden = !ovr.checked; };
    card.querySelector('#iexSave').onclick = () => saveExternal(card, isG);
  }

  async function saveExternal(card, isG) {
    const btn = card.querySelector('#iexSave');
    const msg = card.querySelector('#iexMsg');
    const got = collectExternal(card, isG);
    if (got.error) {
      msg.className = 'ie-msg bad';
      msg.textContent = got.error;
      return;
    }
    btn.disabled = true;
    msg.className = 'ie-msg';
    msg.textContent = '保存中…';
    let r;
    try {
      r = await IE.post('/api/ielts/external-tests', got.body);
    } catch (e) {
      // 请求层已弹 toast；表单内容保留，改完可直接再存
      if (!card.isConnected) return;
      btn.disabled = false;
      msg.className = 'ie-msg bad';
      msg.textContent = '保存失败：' + e.message;
      return;
    }
    const ticked = r && Array.isArray(r.ticked) ? r.ticked : [];
    NCE.toast(savedToastText(r && r.item, ticked, got.body.tickPlan), 'ok');
    if (!alive()) return;
    loadSummary();
    // 保存期间切走了标签就不再动表单和列表（下次进入会重新拉）
    if (!card.isConnected) return;
    mountExternalForm(card);
    loadExternalList();
  }

  function extSkillPillHtml(sk, v) {
    if (!v || !Number.isFinite(Number(v.band))) return `<span class="ie-pill mute">${sk.short} —</span>`;
    const raw = v.raw != null ? `（${v.raw}/${RAW_MAX}）` : '';
    const tip = v.bandFrom === 'manual' ? '按书后换算表填写的 band' : v.bandFrom === 'table' ? '按原始分自动换算的 band' : '';
    return `<span class="ie-pill"${tip ? ` title="${esc(tip)}"` : ''}>${sk.short} ${esc(IE.fmtBand(v.band))}${esc(raw)}</span>`;
  }

  function extRowHtml(r, i) {
    const hasOverall = r.overall != null && Number.isFinite(Number(r.overall));
    return (
      `<div class="ieh-rec iex-rec" data-i="${i}">` +
      '<div class="iex-line">' +
      `<span class="ieh-date">${esc(r.date || '')}</span>` +
      (r.examType === 'G' ? '<span class="ie-pill warn">G 类</span>' : '') +
      `<span class="ieh-title">${esc(r.displayTitle || r.title || '剑雅成绩')}</span>` +
      `<span class="iex-pills">${EXT_SKILLS.map((sk) => extSkillPillHtml(sk, r[sk.key])).join('')}</span>` +
      (hasOverall ? `<span class="ieh-meta">总分</span><span class="ieh-band">${esc(IE.fmtBand(r.overall))}</span>` : '') +
      '<button type="button" class="btn small ghost iex-del">删除</button>' +
      '</div>' +
      (r.notes ? `<div class="iex-memo">${esc(r.notes)}</div>` : '') +
      '</div>'
    );
  }

  async function deleteExternal(r, btn) {
    const name = r.displayTitle || r.title || '剑雅成绩';
    if (!window.confirm(`删除 ${r.date || ''} 的「${name}」？\n删除后不会自动取消学习计划里的打勾。`)) return;
    btn.disabled = true;
    try {
      await IE.del(`/api/ielts/external-tests/${encodeURIComponent(r.id)}`);
    } catch (e) {
      // 请求层已弹 toast；记录已不存在（业务 404）时刷新列表与服务端对齐，其他错误允许再点
      if (!alive()) return;
      if (e.status === 404 && !e.apiMissing) {
        loadExternalList();
        loadSummary();
      } else if (btn.isConnected) {
        btn.disabled = false;
      }
      return;
    }
    NCE.toast(`已删除「${name}」`, 'ok');
    if (!alive()) return;
    loadSummary();
    loadExternalList();
  }

  function paintExternalList(card, list) {
    const head = `<h3>🗂️ 剑雅成绩 <span class="ie-h3-sub">共 ${list.length} 条 · 新的在前</span></h3>`;
    if (!list.length) {
      card.innerHTML = head + '<div class="ie-empty">还没有剑雅成绩。做完一套剑桥雅思真题后在上面录入分数，<br>成绩概况和总分估算会优先用整套成绩。</div>';
      return;
    }
    card.innerHTML =
      head +
      `<div class="ieh-list">${list.map(extRowHtml).join('')}</div>` +
      '<div class="ie-muted" style="margin-top:10px">成绩暂不支持修改，录错了删掉重录即可；删除不会取消学习计划里的打勾。</div>';
    card.querySelectorAll('.iex-rec').forEach((el) => {
      const r = list[Number(el.dataset.i)];
      const btn = el.querySelector('.iex-del');
      btn.onclick = () => deleteExternal(r, btn);
    });
  }

  async function loadExternalList() {
    const card = root && root.querySelector('.iex-list-card');
    if (!card) return;
    const seq = ++st.extSeq;
    let r;
    try {
      r = await IE.get('/api/ielts/external-tests');
    } catch (e) {
      if (!alive() || seq !== st.extSeq || !card.isConnected) return;
      card.innerHTML = IE.errorHtml('剑雅成绩加载失败', e);
      IE.bindRetry(card, loadExternalList);
      return;
    }
    if (!alive() || seq !== st.extSeq || !card.isConnected) return;
    paintExternalList(card, toList(r).filter((x) => x && typeof x === 'object'));
  }

  // 每次切到「剑雅」都重建表单并重拉列表
  function showExternal() {
    const box = root.querySelector('.ieh-main');
    if (!box) return;
    box.innerHTML =
      '<div class="ie-card iex-form-card"></div>' +
      '<div class="ie-card iex-list-card"><div class="ie-loading">正在加载剑雅成绩…</div></div>';
    mountExternalForm(box.querySelector('.iex-form-card'));
    loadExternalList();
  }

  // 进入页面时加载；录入 / 删除剑雅成绩后会再调一次重算（只认最后一次请求）
  async function loadSummary() {
    const el = root.querySelector('.ieh-summary');
    const seq = ++st.sumSeq;
    let sum;
    try {
      sum = await IE.get('/api/ielts/summary');
    } catch (e) {
      if (seq !== st.sumSeq) return;
      // 首次拿不到就不显示，不影响记录；重拉失败时保留上一次的概况
      if (el && !el.querySelector('.ieh-sum')) el.remove();
      else console.warn('[ielts-history] 成绩概况刷新失败，先显示上一次的结果', e);
      return;
    }
    if (!alive() || seq !== st.sumSeq || !el || !el.isConnected) return;
    const l = sum.listening || {};
    const r = sum.reading || {};
    const w = sum.writing || {};
    const s = sum.speaking || {};
    const v = sum.vocab || {};
    const e = sum.estimate || {};
    // 每项说明优先用后端口径 label（整套优先 / 单项），没有时退回原文案
    const cell = (x, name, fallback) =>
      `<div><b>${esc(IE.fmtBand(x.last3Avg))}</b><span>${esc(IE.summaryLabel(x, name) || fallback)}</span></div>`;
    // 听力 / 阅读只有模考计分，练习次数单独列出
    const scoredCell = (x, name) => {
      const p = Number(x.practiceCount) || 0;
      return cell(x, name, `${name}近 3 次模考均分 · 模考 ${Number(x.count) || 0} 次${p ? ` · 练习 ${p} 次` : ''}`);
    };
    el.innerHTML =
      '<div class="ieh-sum">' +
      scoredCell(l, '听力') +
      scoredCell(r, '阅读') +
      cell(w, '写作', `写作近 3 次自评均分 · 共 ${Number(w.count) || 0} 篇`) +
      cell(s, '口语', `口语近 3 次自评均分 · 共 ${Number(s.count) || 0} 次`) +
      `<div><b>${v.lastOverall != null ? esc(String(v.lastOverall)) + '%' : '—'}</b><span>最近一次词汇诊断</span></div>` +
      `<div><b>${esc(IE.fmtBand(e.overall))}</b><span>总分粗估</span></div>` +
      '</div>' +
      (e.note ? `<div class="ie-muted ieh-sum-note">📐 ${esc(e.note)}</div>` : '');
  }

  // 读一次性标签标记，读完即删；sessionStorage 不可用（隐私模式等）时当作没有
  function takeTabHint() {
    let v = null;
    try {
      v = sessionStorage.getItem(TAB_HINT_KEY);
      sessionStorage.removeItem(TAB_HINT_KEY);
    } catch (e) {
      console.warn('[ielts-history] 读取标签跳转标记失败', e);
      return null;
    }
    return TAB_KEYS.includes(v) ? v : null;
  }

  // 打开当前标签：剑雅走自己的接口，其余四类走 /api/ielts/history（已拉过的直接重绘）
  function showCurrentTab() {
    if (st.type === 'external') showExternal();
    else if (st.records[st.type]) paintRecords();
    else loadRecords();
  }

  function render(body, c) {
    root = body;
    ctx = c;
    // 每次进入都重新拉，刚提交的记录能马上看到
    st.records = { writing: null, speaking: null, listening: null, reading: null };
    const hint = takeTabHint();
    if (hint) st.type = hint;
    body.innerHTML =
      '<div class="ie-card ieh-summary"><div class="ie-loading" style="padding:8px 0">正在加载概况…</div></div>' +
      '<div class="ie-row chips ieh-tabs">' +
      TAB_KEYS
        .map((k) => `<div class="chip${st.type === k ? ' active' : ''}" data-t="${k}">${tabMeta(k).icon} ${tabMeta(k).name}</div>`)
        .join('') +
      '</div>' +
      '<div class="ieh-main"></div>';
    body.querySelectorAll('.ieh-tabs .chip').forEach((chip) => {
      chip.onclick = () => {
        if (chip.dataset.t === st.type) return;
        st.type = chip.dataset.t;
        body.querySelectorAll('.ieh-tabs .chip').forEach((x) => x.classList.toggle('active', x === chip));
        showCurrentTab();
      };
    });
    loadSummary();
    showCurrentTab();
  }

  IE.registerPage('history', { render });
})();
