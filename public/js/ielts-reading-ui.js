'use strict';
// 雅思备考 · 阅读子页：文章列表 → 答题（宽屏左文右题、窄屏标签切换；考试模式 20 分钟倒计时只提醒不强制交卷）
// → 交卷后逐题对错、点题定位原文证据句并高亮、中文解析、原始分与估算 band。
// 选中文字可高亮（只存在本次页面会话的内存里）；作答草稿存 localStorage（key 前缀 ielts-reading-，按档案隔离）。
// 接口：GET /api/ielts/reading、GET /api/ielts/reading/:id、POST /api/ielts/reading/:id/submit
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE || !IE.registerPage) return;
  const esc = NCE.escapeHtml;

  const EXAM_SEC = 20 * 60;
  const MAX_DURATION_SEC = 4 * 3600;
  const MAX_ANSWER_LEN = 200;
  const DRAFT_DELAY_MS = 600;
  const DRAFT_TICK_EVERY = 15; // 计时中每 15 秒顺带存一次草稿（保存已用时间）
  const NARROW_MQ = window.matchMedia ? window.matchMedia('(max-width: 959px)') : null;

  const DIFF = {
    easy: { label: '易', cls: 'ok' },
    medium: { label: '中', cls: 'warn' },
    hard: { label: '难', cls: 'bad' },
  };
  const TOPIC_LABEL = { science: '科学', history: '历史', society: '社会', environment: '环境', psychology: '心理', technology: '技术' };
  const TYPE_LABEL = {
    tfng: '判断 T/F/NG',
    ynng: '观点 Y/N/NG',
    'matching-headings': '段落标题配对',
    'matching-information': '信息定位',
    mcq: '单选',
    'sentence-completion': '句子填空',
    'summary-completion': '摘要填空',
    'short-answer': '简答',
  };
  const JUDGE = { tfng: ['TRUE', 'FALSE', 'NOT GIVEN'], ynng: ['YES', 'NO', 'NOT GIVEN'] };
  const MODE_LABEL = { exam: '考试模式', practice: '练习模式' };

  // ---- 样式（前缀 ier-；颜色走主题变量，明暗主题都可读）----
  const style = document.createElement('style');
  style.textContent = `
    main.container:has(> #feat-ielts:not(.hidden) .ier-split){max-width:1280px}
    .ie-wrap:has(.ier-split){max-width:none}
    .ier-filters{margin-bottom:14px}
    .ier-filters .chip{padding:6px 13px}
    .ier-list{display:flex;flex-direction:column;gap:10px}
    .ier-item{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card);padding:12px 14px}
    .ier-item-h{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;margin-bottom:6px}
    .ier-meta{font-size:12.5px;color:var(--muted)}
    .ier-stat{margin-left:auto;font-size:12.5px;color:var(--muted)}
    .ier-stat b{color:var(--ok)}
    .ier-item-t{font-size:15px;font-weight:700;color:var(--ink);line-height:1.5;overflow-wrap:anywhere}
    .ier-item-t span{font-weight:500;font-size:13px;color:var(--muted);margin-left:6px}
    .ier-types{font-size:12.5px;color:var(--muted);margin:4px 0 10px}
    .ier-split{--ier-top:0px;--ier-head:56px;overflow-wrap:break-word}
    .ier-head{position:sticky;top:var(--ier-top);z-index:6;background:var(--card);padding:6px 0 8px;margin-bottom:8px;border-bottom:1px solid var(--border-soft)}
    html[data-theme=midnight] .ier-head{background:#0f1424}
    .ier-bar{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap}
    .ier-bar-t{flex:1 1 160px;min-width:0;font-weight:700;color:var(--ink);font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ier-timer{font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink);font-size:14px;white-space:nowrap}
    .ier-timer.warn{color:#d97706}
    .ier-timer.over{color:var(--bad)}
    .ier-timer.calm{font-weight:600;color:var(--muted);font-size:13px}
    .ier-count{font-size:13px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
    .ier-msg{font-size:13px;margin-top:6px;line-height:1.6}
    .ier-msg:empty{display:none}
    .ier-msg.bad{color:var(--bad)}
    .ier-msg.warn{color:#d97706}
    .ier-tabs{display:none;gap:6px;margin-top:8px}
    .ier-tabs button{flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--ink-soft);font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}
    .ier-tabs button.on{background:var(--brand);border-color:var(--brand);color:#fff}
    .ier-cols{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;align-items:start}
    .ier-pane{position:sticky;top:calc(var(--ier-top) + var(--ier-head) + 8px);max-height:calc(100vh - var(--ier-top) - var(--ier-head) - 20px);overflow:auto;overscroll-behavior:contain;border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 16px;background:var(--card);min-width:0}
    .ier-ptitle h3{margin:0 0 4px;font-size:17px;color:var(--ink);line-height:1.4}
    .ier-tip{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin:8px 0 10px}
    .ier-tip button{padding:3px 10px;border:1px solid var(--border);border-radius:999px;background:transparent;color:var(--muted);font-size:12px;cursor:pointer;font-family:inherit}
    .ier-tip button:hover{border-color:var(--brand);color:var(--brand)}
    .ier-passage{font-family:Georgia,"Times New Roman",serif;font-size:15.5px;line-height:1.8;color:var(--ink)}
    .ier-para{margin:0 0 14px;display:flex;gap:10px;align-items:flex-start}
    .ier-plabel{flex:none;width:24px;height:24px;margin-top:3px;border-radius:6px;background:rgba(127,127,127,.14);color:var(--ink);font:800 13px/24px system-ui,sans-serif;text-align:center;user-select:none;-webkit-user-select:none}
    .ier-ptext{flex:1;min-width:0}
    mark.ier-hl{background:rgba(250,204,21,.45);color:inherit;border-radius:2px;cursor:pointer;padding:0}
    html[data-theme=midnight] mark.ier-hl{background:rgba(250,204,21,.3);color:#fff}
    mark.ier-ev{background:rgba(47,111,237,.16);color:inherit;border-radius:3px;box-shadow:0 0 0 2px rgba(47,111,237,.38);padding:0}
    html[data-theme=midnight] mark.ier-ev{background:rgba(124,92,255,.3);box-shadow:0 0 0 2px rgba(167,139,250,.6);color:#fff}
    .ier-hl-tool{position:fixed;z-index:1200;padding:6px 12px;border:1px solid var(--brand);border-radius:999px;background:var(--brand);color:#fff;font-size:13px;font-weight:700;box-shadow:var(--shadow-md);cursor:pointer;font-family:inherit}
    .ier-hl-tool[hidden]{display:none}
    .ier-saved{font-size:12px;color:var(--muted);margin-bottom:8px}
    .ier-group{padding:12px 0 14px;border-bottom:1px dashed var(--border)}
    .ier-group:last-child{border-bottom:none}
    .ier-gh{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-weight:800;color:var(--ink);font-size:14.5px;margin-bottom:6px}
    .ier-ins{font-size:13px;color:var(--ink-soft);line-height:1.65;margin-bottom:10px}
    .ier-limit{display:inline-block;font-size:12px;font-weight:800;color:#d97706;background:rgba(245,158,11,.12);border-radius:6px;padding:1px 7px;margin-bottom:10px}
    .ier-box{border:1px solid var(--border-soft);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:13.5px;color:var(--ink-soft);line-height:1.7;background:rgba(127,127,127,.04)}
    .ier-box b{color:var(--ink);margin-right:6px}
    .ier-bank{display:flex;flex-wrap:wrap;gap:4px 14px}
    .ier-q{margin:0 0 12px}
    .ier-qh{display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--ink);line-height:1.6}
    .ier-num{flex:none;min-width:24px;height:22px;padding:0 5px;border-radius:6px;background:rgba(47,111,237,.12);color:var(--brand);font-size:12.5px;font-weight:800;line-height:22px;text-align:center;font-variant-numeric:tabular-nums}
    .ier-qp{flex:1;min-width:0}
    .ier-choices{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0 32px}
    .ier-choice,.ier-opt{border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink-soft);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    .ier-choice{padding:5px 11px}
    .ier-opt{display:flex;gap:8px;width:100%;text-align:left;padding:7px 10px;font-weight:500;line-height:1.5;margin-top:5px}
    .ier-opt b{flex:none}
    .ier-choice:hover,.ier-opt:hover{border-color:var(--brand);color:var(--brand)}
    .ier-choice.on,.ier-opt.on{background:var(--brand);border-color:var(--brand);color:#fff}
    .ier-opts{margin:4px 0 0 32px}
    .ier-in{width:9em;max-width:100%;padding:4px 8px;border:1px solid var(--border);border-bottom:2px solid var(--brand);border-radius:6px;background:var(--card);color:var(--ink);font-size:14px;font-family:inherit}
    .ier-in:focus{outline:none;box-shadow:var(--ring)}
    html[data-theme=midnight] .ier-in{background:rgba(255,255,255,.07);color-scheme:dark}
    .ier-sel{max-width:100%;padding:5px 30px 5px 10px;font-size:13.5px}
    .ier-line{margin:6px 0 0 32px}
    .ier-summary{font-size:14px;color:var(--ink);line-height:2.1}
    .ier-summary-t{font-weight:700;margin-bottom:4px}
    .ier-gap{display:inline-flex;align-items:center;gap:4px;max-width:100%;vertical-align:middle}
    .ier-gap .ier-num{min-width:22px}
    .ier-score{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:baseline;margin-bottom:6px}
    .ier-score div{font-size:13px;color:var(--muted)}
    .ier-score b{font-size:26px;font-weight:900;color:var(--ink)}
    .ier-score .ier-band{color:var(--brand)}
    .ier-res{border:1px solid var(--border);border-left:4px solid var(--border);border-radius:8px;padding:8px 10px;margin-top:8px;cursor:pointer;background:var(--card)}
    .ier-res.ok{border-left-color:var(--ok)}
    .ier-res.bad{border-left-color:var(--bad)}
    .ier-res.on{box-shadow:var(--ring)}
    .ier-res-h{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;color:var(--ink);line-height:1.55}
    .ier-mark{flex:none;font-weight:900}
    .ier-res.ok .ier-mark{color:var(--ok)}
    .ier-res.bad .ier-mark{color:var(--bad)}
    .ier-res-a{font-size:13px;color:var(--ink-soft);margin:4px 0 0 32px;line-height:1.6}
    .ier-res-a b{color:var(--ink)}
    .ier-res-a .ier-bad{color:var(--bad);text-decoration:line-through}
    .ier-res-more{margin:8px 0 2px 32px;font-size:13.5px;color:var(--ink-soft);line-height:1.75}
    .ier-res-more[hidden]{display:none}
    .ier-ev-q{margin-top:6px;padding:6px 10px;border-left:3px solid var(--brand);background:rgba(127,127,127,.06);border-radius:0 6px 6px 0;font-family:Georgia,"Times New Roman",serif}
    .ier-goto{display:none;margin-top:8px}
    @media (max-width:959px){
      .ier-tabs{display:flex}
      .ier-cols{grid-template-columns:minmax(0,1fr)}
      .ier-pane{position:static;max-height:none;overflow:visible;padding:12px}
      .ier-split[data-pane=passage] .ier-pane-q{display:none}
      .ier-split[data-pane=questions] .ier-pane-p{display:none}
      .ier-goto{display:inline-block}
      .ier-passage{font-size:15px}
      .ier-choices,.ier-opts,.ier-line,.ier-res-a,.ier-res-more{margin-left:0}
    }
  `;
  document.head.appendChild(style);

  // ---- 状态 ----
  const st = {
    stage: 'list', // list | read | result
    filter: '',
    list: null,
    passage: null,
    qinfo: new Map(), // qid -> { q, g }
    mode: 'exam',
    answers: {},
    elapsedBase: 0,
    runningSince: 0,
    wasRunning: false,
    timerId: null,
    ticks: 0,
    timeUpWarned: false,
    saveTimer: null,
    confirmSubmit: false,
    submitting: false,
    result: null,
    evidence: null, // { para, quote }
    activeQ: null,
    pane: 'passage',
    paneScroll: {},
    openSeq: 0,
    selecting: false,
  };
  // 本次页面会话的高亮：passageId -> { 段落字母: [[start, end], ...] }，刷新页面即清空
  const highlights = new Map();
  let root = null;
  let ctx = null;
  let tool = null;
  let selTimer = null;

  function alive() {
    return !!(ctx && ctx.isActive() && root && root.isConnected);
  }
  function isNarrow() {
    return NARROW_MQ ? NARROW_MQ.matches : window.innerWidth < 960;
  }
  function fmtBand(v) {
    return IE.fmtBand(v);
  }
  function questionTotal() {
    return st.qinfo.size;
  }
  function answeredCount() {
    let n = 0;
    for (const qid of st.qinfo.keys()) if (typeof st.answers[qid] === 'string' && st.answers[qid].trim()) n++;
    return n;
  }

  // ---------- 草稿（localStorage；与 profile-store.js 一致，default 档案不加档案前缀）----------
  function lsKey(name) {
    const pid = (window.NCEStore && window.NCEStore.profileId) || 'default';
    const k = 'ielts-reading-' + name;
    return pid === 'default' ? k : pid + ':' + k;
  }
  function draftKey(id) {
    return lsKey('draft-' + id);
  }
  function readDraft(id) {
    try {
      const raw = localStorage.getItem(draftKey(id));
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && typeof d === 'object' && d.answers && typeof d.answers === 'object' ? d : null;
    } catch (e) {
      console.warn('[ielts-reading] 读取草稿失败', e);
      return null;
    }
  }
  function hasDraft(id) {
    const d = readDraft(id);
    return !!(d && Object.values(d.answers).some((v) => typeof v === 'string' && v.trim()));
  }
  function saveDraft() {
    clearTimeout(st.saveTimer);
    st.saveTimer = null;
    if (st.stage !== 'read' || !st.passage) return;
    const savedEl = root && root.querySelector('.ier-saved');
    try {
      if (!answeredCount()) {
        localStorage.removeItem(draftKey(st.passage.id));
        if (savedEl) savedEl.textContent = '作答会自动存为草稿';
        return;
      }
      localStorage.setItem(
        draftKey(st.passage.id),
        JSON.stringify({ answers: st.answers, mode: st.mode, elapsed: Math.round(elapsedNow()), ts: Date.now() })
      );
      if (savedEl) {
        const d = new Date();
        const p2 = (n) => String(n).padStart(2, '0');
        savedEl.textContent = `草稿已自动保存 ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
      }
    } catch (e) {
      console.warn('[ielts-reading] 保存草稿失败', e);
      if (savedEl) savedEl.textContent = '⚠️ 草稿保存失败（浏览器存储不可用），请不要刷新页面';
    }
  }
  function scheduleDraft() {
    clearTimeout(st.saveTimer);
    st.saveTimer = setTimeout(saveDraft, DRAFT_DELAY_MS);
  }
  function clearDraft(id) {
    try {
      localStorage.removeItem(draftKey(id));
    } catch (e) {
      console.warn('[ielts-reading] 清除草稿失败', e);
    }
  }
  // 草稿里只保留本篇存在的题号和合法字符串
  function cleanAnswers(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const qid of st.qinfo.keys()) {
      const v = raw[qid];
      if (typeof v === 'string' && v.trim() && v.length <= MAX_ANSWER_LEN) out[qid] = v;
    }
    return out;
  }

  // ---------- 计时 ----------
  function elapsedNow() {
    return st.elapsedBase + (st.runningSince ? (Date.now() - st.runningSince) / 1000 : 0);
  }
  function startTimer() {
    if (st.runningSince || st.stage !== 'read') return;
    st.runningSince = Date.now();
    clearInterval(st.timerId);
    st.timerId = setInterval(tick, 1000);
    tick();
  }
  function pauseTimer() {
    if (st.runningSince) {
      st.elapsedBase = elapsedNow();
      st.runningSince = 0;
    }
    clearInterval(st.timerId);
    st.timerId = null;
  }
  function stopAll() {
    pauseTimer();
    if (st.stage === 'read') saveDraft();
    clearTimeout(st.saveTimer);
    st.saveTimer = null;
    hideTool();
  }
  function tick() {
    const el = root && root.querySelector('.ier-timer');
    if (!el) return;
    if (st.mode !== 'exam') {
      el.textContent = '练习模式 · 不计时';
      el.className = 'ier-timer calm';
    } else {
      const left = EXAM_SEC - elapsedNow();
      if (left >= 0) {
        el.textContent = `⏱ 剩余 ${IE.fmtClock(left)}`;
        el.className = 'ier-timer' + (left < 300 ? ' warn' : '');
      } else {
        el.textContent = `⏰ 已超时 ${IE.fmtClock(-left)}`;
        el.className = 'ier-timer over';
        if (!st.timeUpWarned) {
          st.timeUpWarned = true;
          NCE.toast('20 分钟到了！考试中这篇就该收尾了；这里可以继续作答，交卷不受影响', 'warn');
          setMsg('⏰ 20 分钟已到（不强制交卷，可以继续作答）。', 'warn');
        }
      }
    }
    if (st.runningSince && ++st.ticks % DRAFT_TICK_EVERY === 0) saveDraft();
  }

  // ---------- 高亮工具条（挂在 body 上，只创建一次）----------
  function ensureTool() {
    if (tool) return tool;
    tool = document.createElement('button');
    tool.type = 'button';
    tool.className = 'ier-hl-tool';
    tool.textContent = '🖍 高亮';
    tool.hidden = true;
    tool.addEventListener('mousedown', (e) => e.preventDefault()); // 点按钮时保住选区
    tool.addEventListener('click', applySelectionHighlight);
    document.body.appendChild(tool);
    return tool;
  }
  function hideTool() {
    if (tool) tool.hidden = true;
  }

  function currentHighlights() {
    const id = st.passage && st.passage.id;
    if (!id) return {};
    if (!highlights.has(id)) highlights.set(id, {});
    return highlights.get(id);
  }

  // 节点内某个位置相对段落文本开头的字符偏移
  function offsetWithin(el, node, offset) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.setEnd(node, offset);
    return r.toString().length;
  }

  // 当前选区落在文章里的部分，按段拆成 [{ label, s, e }]
  function selectionParts() {
    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const passageEl = root && root.querySelector('.ier-passage');
    if (!passageEl || !range.intersectsNode(passageEl)) return null;
    const parts = [];
    passageEl.querySelectorAll('.ier-ptext').forEach((el) => {
      if (!range.intersectsNode(el)) return;
      const len = el.textContent.length;
      const s = el.contains(range.startContainer) ? offsetWithin(el, range.startContainer, range.startOffset) : 0;
      const e = el.contains(range.endContainer) ? offsetWithin(el, range.endContainer, range.endOffset) : len;
      if (e > s) parts.push({ label: el.dataset.para, s, e });
    });
    return parts.length ? { range, parts } : null;
  }

  function checkSelection() {
    if (!alive() || (st.stage !== 'read' && st.stage !== 'result') || st.selecting) {
      if (!st.selecting) hideTool();
      return;
    }
    const info = selectionParts();
    if (!info) return hideTool();
    const rect = info.range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return hideTool();
    const t = ensureTool();
    t.hidden = false;
    const w = t.offsetWidth || 80;
    const h = t.offsetHeight || 32;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 8);
    let top = rect.bottom + 8;
    if (top + h > window.innerHeight - 8) top = rect.top - h - 8;
    t.style.left = `${Math.round(left)}px`;
    t.style.top = `${Math.round(Math.max(8, top))}px`;
  }

  function applySelectionHighlight() {
    const info = selectionParts();
    hideTool();
    if (!info) return;
    const map = currentHighlights();
    for (const { label, s, e } of info.parts) {
      const list = (map[label] || []).concat([[s, e]]).sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const [a, b] of list) {
        const last = merged[merged.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else merged.push([a, b]);
      }
      map[label] = merged;
      repaintPara(label);
    }
    try { window.getSelection().removeAllRanges(); } catch (e) { /* 部分浏览器不支持，忽略 */ }
  }

  function removeHighlight(label, index) {
    const map = currentHighlights();
    const list = map[label];
    if (!list || !list[index]) return;
    list.splice(index, 1);
    if (!list.length) delete map[label];
    repaintPara(label);
  }

  // ---------- 文章渲染（高亮与证据句按字符区间切片，逐段转义）----------
  function evidenceRange(text, quote) {
    if (!quote) return null;
    const i = text.indexOf(quote);
    return i >= 0 ? [i, i + quote.length] : null;
  }

  function paraInnerHtml(label, text) {
    const hl = currentHighlights()[label] || [];
    const ev = st.evidence && st.evidence.para === label ? evidenceRange(text, st.evidence.quote) : null;
    const points = new Set([0, text.length]);
    hl.forEach(([s, e]) => { points.add(s); points.add(e); });
    if (ev) { points.add(ev[0]); points.add(ev[1]); }
    const cuts = [...points].filter((n) => n >= 0 && n <= text.length).sort((a, b) => a - b);
    let html = '';
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (a === b) continue;
      let seg = esc(text.slice(a, b));
      const hi = hl.findIndex(([s, e]) => s <= a && e >= b);
      if (hi >= 0) seg = `<mark class="ier-hl" data-hl="${hi}" title="点击取消高亮">${seg}</mark>`;
      if (ev && ev[0] <= a && ev[1] >= b) seg = `<mark class="ier-ev">${seg}</mark>`;
      html += seg;
    }
    return html;
  }

  function paraText(label) {
    const p = (st.passage.paragraphs || []).find((x) => x.label === label);
    return p ? String(p.text || '') : '';
  }

  function repaintPara(label) {
    const el = root && root.querySelector(`.ier-ptext[data-para="${CSS.escape(label)}"]`);
    if (el) el.innerHTML = paraInnerHtml(label, paraText(label));
  }

  function passagePaneHtml() {
    const p = st.passage;
    const d = DIFF[p.difficulty] || { label: p.difficulty || '', cls: 'mute' };
    return (
      '<div class="ier-ptitle">' +
      `<h3>${esc(p.title)}</h3>` +
      `<div class="ie-muted">${esc(p.titleCn || '')}${p.titleCn ? ' · ' : ''}${esc(TOPIC_LABEL[p.topic] || p.topic || '')} · 难度${esc(d.label)} · ${esc(String(p.wordCount || 0))} 词</div>` +
      '</div>' +
      '<div class="ier-tip">🖍 选中文字可高亮，点高亮处取消（只在本次打开页面期间保留）<button type="button" class="ier-hl-clear">清除本篇高亮</button></div>' +
      '<div class="ier-passage">' +
      (p.paragraphs || []).map((para) => {
        const label = String(para.label || '');
        return (
          `<p class="ier-para" id="ier-para-${esc(label)}">` +
          `<b class="ier-plabel">${esc(label)}</b>` +
          `<span class="ier-ptext" data-para="${esc(label)}">${paraInnerHtml(label, String(para.text || ''))}</span>` +
          '</p>'
        );
      }).join('') +
      '</div>'
    );
  }

  // ---------- 题目渲染 ----------
  function qRange(g) {
    const nums = (g.questions || []).map((q) => Number(q.number)).filter(Number.isFinite);
    if (!nums.length) return '';
    const a = Math.min(...nums);
    const b = Math.max(...nums);
    return a === b ? `Question ${a}` : `Questions ${a}–${b}`;
  }

  function val(qid) {
    return typeof st.answers[qid] === 'string' ? st.answers[qid] : '';
  }

  function inputHtml(qid, placeholder) {
    return `<input class="ier-in" type="text" data-qid="${esc(qid)}" value="${esc(val(qid))}" maxlength="${MAX_ANSWER_LEN}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="${esc(placeholder)}" placeholder="${esc(placeholder)}">`;
  }

  function selectHtml(qid, options, label) {
    const cur = val(qid);
    return (
      `<select class="ier-sel" data-qid="${esc(qid)}" aria-label="${esc(label)}">` +
      '<option value="">— 选择 —</option>' +
      options.map((o) => `<option value="${esc(o.value)}"${o.value === cur ? ' selected' : ''}>${esc(o.label)}</option>`).join('') +
      '</select>'
    );
  }

  function questionHtml(q, g) {
    const qid = String(q.id);
    const num = `<span class="ier-num">${esc(String(q.number))}</span>`;
    switch (g.type) {
      case 'tfng':
      case 'ynng':
        return (
          `<div class="ier-q" data-q="${esc(qid)}"><div class="ier-qh">${num}<span class="ier-qp">${esc(q.prompt || '')}</span></div>` +
          '<div class="ier-choices">' +
          JUDGE[g.type].map((v) => `<button type="button" class="ier-choice${val(qid) === v ? ' on' : ''}" data-qid="${esc(qid)}" data-v="${esc(v)}">${esc(v)}</button>`).join('') +
          '</div></div>'
        );
      case 'mcq':
        return (
          `<div class="ier-q" data-q="${esc(qid)}"><div class="ier-qh">${num}<span class="ier-qp">${esc(q.prompt || '')}</span></div>` +
          '<div class="ier-opts">' +
          (q.options || []).map((o) => `<button type="button" class="ier-opt${val(qid) === o.key ? ' on' : ''}" data-qid="${esc(qid)}" data-v="${esc(o.key)}"><b>${esc(o.key)}</b><span>${esc(o.text)}</span></button>`).join('') +
          '</div></div>'
        );
      case 'matching-headings':
        return (
          `<div class="ier-q" data-q="${esc(qid)}"><div class="ier-qh">${num}<span class="ier-qp">${esc(q.prompt || `Paragraph ${q.para || ''}`)}</span></div>` +
          `<div class="ier-line">${selectHtml(qid, (g.options || []).map((o) => ({ value: o.key, label: `${o.key}. ${o.text}` })), `第 ${q.number} 题标题`)}</div></div>`
        );
      case 'matching-information':
        return (
          `<div class="ier-q" data-q="${esc(qid)}"><div class="ier-qh">${num}<span class="ier-qp">${esc(q.prompt || '')}</span></div>` +
          `<div class="ier-line">${selectHtml(qid, (st.passage.paragraphs || []).map((p) => ({ value: p.label, label: `段落 ${p.label}` })), `第 ${q.number} 题段落`)}</div></div>`
        );
      case 'sentence-completion': {
        const parts = String(q.prompt || '').split('{blank}');
        return (
          `<div class="ier-q" data-q="${esc(qid)}"><div class="ier-qh">${num}<span class="ier-qp">` +
          parts.map((t, i) => esc(t) + (i < parts.length - 1 ? inputHtml(qid, `第 ${q.number} 题`) : '')).join('') +
          '</span></div></div>'
        );
      }
      case 'short-answer':
        return (
          `<div class="ier-q" data-q="${esc(qid)}"><div class="ier-qh">${num}<span class="ier-qp">${esc(q.prompt || '')}</span></div>` +
          `<div class="ier-line">${inputHtml(qid, `第 ${q.number} 题答案`)}</div></div>`
        );
      default:
        return `<div class="ier-q"><div class="ier-qh">${num}<span class="ier-qp ie-muted">暂不支持的题型：${esc(g.type)}</span></div></div>`;
    }
  }

  // 摘要正文：{qN} 换成编号 + 输入框（词库型为下拉）
  function summaryHtml(g) {
    const s = g.summary || {};
    const byId = new Map((g.questions || []).map((q) => [String(q.id), q]));
    const bank = Array.isArray(g.wordBank) ? g.wordBank : null;
    const text = String(s.text || '');
    const re = /\{(q\d{1,3})\}/g;
    let html = '';
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      html += esc(text.slice(last, m.index));
      const q = byId.get(m[1]);
      if (q) {
        const field = bank
          ? selectHtml(q.id, bank.map((o) => ({ value: o.key, label: `${o.key}  ${o.text}` })), `第 ${q.number} 题`)
          : inputHtml(q.id, `第 ${q.number} 题`);
        html += `<span class="ier-gap" data-q="${esc(q.id)}"><span class="ier-num">${esc(String(q.number))}</span>${field}</span>`;
      } else {
        html += esc(m[0]);
      }
      last = m.index + m[0].length;
    }
    html += esc(text.slice(last));
    return (
      (bank ? `<div class="ier-box ier-bank">${bank.map((o) => `<span><b>${esc(o.key)}</b>${esc(o.text)}</span>`).join('')}</div>` : '') +
      `<div class="ier-summary">${s.title ? `<div class="ier-summary-t">${esc(s.title)}</div>` : ''}${html}</div>`
    );
  }

  function groupHtml(g) {
    let body = '';
    if (g.type === 'matching-headings' && Array.isArray(g.options)) {
      body += `<div class="ier-box"><div class="ie-muted" style="margin-bottom:4px">List of Headings</div>${g.options.map((o) => `<div><b>${esc(o.key)}</b>${esc(o.text)}</div>`).join('')}</div>`;
    }
    body += g.type === 'summary-completion' ? summaryHtml(g) : (g.questions || []).map((q) => questionHtml(q, g)).join('');
    return (
      '<div class="ier-group">' +
      `<div class="ier-gh">${esc(qRange(g))}<span class="ie-pill mute">${esc(TYPE_LABEL[g.type] || g.type)}</span></div>` +
      `<div class="ier-ins">${esc(g.instruction || '')}</div>` +
      (g.wordLimitLabel ? `<div class="ier-limit">${esc(g.wordLimitLabel)}</div>` : '') +
      body +
      '</div>'
    );
  }

  // ---------- 列表页 ----------
  function paintList() {
    const items = (st.list || []).filter((it) => !st.filter || it.difficulty === st.filter);
    root.innerHTML =
      '<div class="ie-note" style="margin-bottom:14px">学术类阅读原创练习：每篇约 700–800 词、13 题。考试模式按真实考试节奏给 20 分钟倒计时（到时只提醒，不强制交卷）；练习模式不计时。交卷后可逐题查看原文定位和中文解析。</div>' +
      '<div class="ier-filters chips">' +
      [['', '全部'], ['easy', '易'], ['medium', '中'], ['hard', '难']].map(([v, l]) => `<div class="chip${st.filter === v ? ' active' : ''}" data-v="${v}">${l}</div>`).join('') +
      '</div>' +
      '<div class="ier-list">' +
      (items.length
        ? items.map((it) => {
          const d = DIFF[it.difficulty] || { label: it.difficulty || '?', cls: 'mute' };
          const b = it.best;
          const stat = b
            ? `最好 <b>${esc(String(b.raw))}/${esc(String(b.total))}</b> · Band ${esc(fmtBand(b.band))} · 做过 ${esc(String(it.attempts || 0))} 次`
            : '还没做过';
          const types = (Array.isArray(it.types) ? it.types : []).map((t) => TYPE_LABEL[t] || t).join(' · ');
          return (
            `<div class="ier-item" data-id="${esc(it.id)}">` +
            '<div class="ier-item-h">' +
            `<span class="ie-pill ${d.cls}">${esc(d.label)}</span>` +
            `<span class="ie-pill mute">${esc(TOPIC_LABEL[it.topic] || it.topicCn || it.topic || '')}</span>` +
            `<span class="ier-meta">${esc(String(it.wordCount || 0))} 词 · ${esc(String(it.questionCount || 0))} 题</span>` +
            (hasDraft(it.id) ? '<span class="ie-pill warn">📝 有草稿</span>' : '') +
            `<span class="ier-stat">${stat}</span>` +
            '</div>' +
            `<div class="ier-item-t">${esc(it.title)}${it.titleCn ? `<span>${esc(it.titleCn)}</span>` : ''}</div>` +
            (types ? `<div class="ier-types">题型：${esc(types)}</div>` : '') +
            '<div class="ie-row">' +
            `<button type="button" class="btn small primary ier-start" data-mode="exam">⏱ 考试模式（${esc(String(Math.round(EXAM_SEC / 60)))} 分钟）</button>` +
            '<button type="button" class="btn small ier-start" data-mode="practice">📝 练习模式</button>' +
            '</div>' +
            '</div>'
          );
        }).join('')
        : '<div class="ie-empty">没有符合条件的文章。</div>') +
      '</div>';
    root.querySelectorAll('.ier-filters .chip').forEach((c) => {
      c.onclick = () => {
        st.filter = c.dataset.v;
        paintList();
      };
    });
    root.querySelectorAll('.ier-item').forEach((item) => {
      item.querySelectorAll('.ier-start').forEach((btn) => {
        btn.onclick = () => openPassage(item.dataset.id, btn.dataset.mode);
      });
    });
  }

  async function renderList() {
    stopAll();
    st.stage = 'list';
    st.passage = null;
    st.result = null;
    st.evidence = null;
    root.innerHTML = '<div class="ie-loading">正在加载阅读文章…</div>';
    let r;
    try {
      r = await IE.get('/api/ielts/reading');
    } catch (e) {
      if (!alive() || st.stage !== 'list') return;
      root.innerHTML = IE.errorHtml('阅读文章加载失败', e);
      IE.bindRetry(root, renderList);
      return;
    }
    if (!alive() || st.stage !== 'list') return;
    st.list = r && Array.isArray(r.items) ? r.items : [];
    paintList();
  }

  // ---------- 答题页 ----------
  async function openPassage(id, mode) {
    stopAll();
    st.stage = 'read';
    // 加载期间不再持有上一篇（否则此时切走触发的存草稿会把旧答案写回）
    st.passage = null;
    st.answers = {};
    st.qinfo = new Map();
    const seq = ++st.openSeq;
    root.innerHTML = '<div class="ie-loading">正在加载文章…</div>';
    let p;
    try {
      p = await IE.get('/api/ielts/reading/' + encodeURIComponent(id));
    } catch (e) {
      if (!alive() || st.stage !== 'read' || seq !== st.openSeq) return;
      root.innerHTML = '<div class="ie-row" style="margin-bottom:10px"><button type="button" class="btn small ghost ier-back">← 文章列表</button></div>' + IE.errorHtml('文章加载失败', e);
      root.querySelector('.ier-back').onclick = renderList;
      IE.bindRetry(root, () => openPassage(id, mode));
      return;
    }
    if (!alive() || st.stage !== 'read' || seq !== st.openSeq) return;
    st.passage = p;
    st.qinfo = new Map();
    (p.groups || []).forEach((g) => (g.questions || []).forEach((q) => st.qinfo.set(String(q.id), { q, g })));
    st.mode = mode === 'practice' ? 'practice' : 'exam';
    const draft = readDraft(p.id);
    st.answers = draft ? cleanAnswers(draft.answers) : {};
    const draftElapsed = draft && draft.mode === st.mode ? Number(draft.elapsed) : 0;
    st.elapsedBase = Number.isFinite(draftElapsed) && draftElapsed > 0 ? Math.min(draftElapsed, MAX_DURATION_SEC) : 0;
    st.runningSince = 0;
    st.ticks = 0;
    st.timeUpWarned = st.mode === 'exam' && st.elapsedBase >= EXAM_SEC;
    st.confirmSubmit = false;
    st.submitting = false;
    st.result = null;
    st.evidence = null;
    st.activeQ = null;
    st.pane = 'passage';
    st.paneScroll = {};
    renderRead();
    if (Object.keys(st.answers).length) {
      NCE.toast(`已恢复上次的作答草稿（${IE.fmtDateTime(draft.ts) || '时间未知'}）`, 'ok');
    }
  }

  function splitHtml(barHtml, tabsHtml, qPaneHtml) {
    return (
      `<div class="ier-split" data-pane="${esc(st.pane)}">` +
      `<div class="ier-head"><div class="ier-bar">${barHtml}</div><div class="ier-tabs" role="tablist">${tabsHtml}</div><div class="ier-msg" role="status"></div></div>` +
      '<div class="ier-cols">' +
      `<section class="ier-pane ier-pane-p" aria-label="文章">${passagePaneHtml()}</section>` +
      `<section class="ier-pane ier-pane-q" aria-label="${st.stage === 'result' ? '结果' : '题目'}">${qPaneHtml}</section>` +
      '</div>' +
      '</div>'
    );
  }

  function tabsHtml(qLabel) {
    return (
      `<button type="button" data-pane="passage" class="${st.pane === 'passage' ? 'on' : ''}">📄 文章</button>` +
      `<button type="button" data-pane="questions" class="${st.pane === 'questions' ? 'on' : ''}">${qLabel}</button>`
    );
  }

  function renderRead() {
    st.stage = 'read';
    const p = st.passage;
    const total = questionTotal();
    const bar =
      '<button type="button" class="btn small ghost ier-back">← 文章列表</button>' +
      `<span class="ier-bar-t" title="${esc(p.title)}">${esc(p.title)}</span>` +
      `<span class="ie-pill${st.mode === 'exam' ? '' : ' mute'}">${esc(MODE_LABEL[st.mode])}</span>` +
      '<span class="ier-timer"></span>' +
      `<span class="ier-count">已答 0/${esc(String(total))}</span>` +
      '<button type="button" class="btn small primary ier-submit">交卷</button>';
    const qPane =
      '<div class="ier-saved">作答会自动存为草稿</div>' +
      (p.groups || []).map(groupHtml).join('') +
      '<div class="ie-row" style="margin-top:12px"><button type="button" class="btn primary ier-submit">交卷并查看解析</button></div>';
    root.innerHTML = splitHtml(bar, tabsHtml(`❓ 题目 <span class="ier-tab-n">0/${esc(String(total))}</span>`), qPane);
    bindSplitCommon();
    const qPaneEl = root.querySelector('.ier-pane-q');
    qPaneEl.oninput = (e) => {
      const t = e.target;
      if (t && t.matches('input.ier-in[data-qid]')) setAnswer(t.dataset.qid, t.value);
    };
    qPaneEl.onchange = (e) => {
      const t = e.target;
      if (t && t.matches('select.ier-sel[data-qid]')) setAnswer(t.dataset.qid, t.value);
    };
    qPaneEl.onclick = (e) => {
      const b = e.target.closest('button[data-qid][data-v]');
      if (!b || !qPaneEl.contains(b)) return;
      const qid = b.dataset.qid;
      const next = val(qid) === b.dataset.v ? '' : b.dataset.v; // 再点一次取消选择
      setAnswer(qid, next);
      const box = b.parentElement;
      box.querySelectorAll('button[data-qid]').forEach((x) => x.classList.toggle('on', x.dataset.v === next));
    };
    root.querySelectorAll('.ier-submit').forEach((b) => { b.onclick = submit; });
    root.querySelector('.ier-back').onclick = () => {
      saveDraft();
      renderList();
    };
    paintCount();
    startTimer();
    tick();
    layoutVars();
  }

  function setAnswer(qid, value) {
    if (!st.qinfo.has(qid)) return;
    const v = String(value == null ? '' : value).slice(0, MAX_ANSWER_LEN);
    if (v.trim()) st.answers[qid] = v;
    else delete st.answers[qid];
    if (st.confirmSubmit) {
      st.confirmSubmit = false;
      setMsg('');
    }
    paintCount();
    scheduleDraft();
  }

  function paintCount() {
    const total = questionTotal();
    const n = answeredCount();
    const c = root.querySelector('.ier-count');
    if (c) c.textContent = `已答 ${n}/${total}`;
    const t = root.querySelector('.ier-tab-n');
    if (t) t.textContent = `${n}/${total}`;
  }

  function setMsg(text, cls) {
    const el = root && root.querySelector('.ier-msg');
    if (!el) return;
    el.className = 'ier-msg' + (cls ? ' ' + cls : '');
    el.textContent = text || '';
  }

  // 文章 / 题目两栏共用的绑定：窄屏标签、高亮选择、点高亮取消
  function bindSplitCommon() {
    const split = root.querySelector('.ier-split');
    split.querySelectorAll('.ier-tabs button[data-pane]').forEach((b) => {
      b.onclick = () => setPane(b.dataset.pane);
    });
    const pPane = root.querySelector('.ier-pane-p');
    pPane.onpointerdown = () => { st.selecting = true; hideTool(); };
    pPane.onkeyup = () => setTimeout(checkSelection, 0);
    pPane.onscroll = hideTool;
    pPane.onclick = (e) => {
      const m = e.target.closest('mark.ier-hl');
      if (!m) return;
      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && !sel.isCollapsed) return; // 正在选字，不当作点击取消
      const ptext = m.closest('.ier-ptext');
      if (ptext) removeHighlight(ptext.dataset.para, Number(m.dataset.hl));
    };
    const clear = root.querySelector('.ier-hl-clear');
    clear.onclick = () => {
      if (st.passage) highlights.delete(st.passage.id);
      (st.passage.paragraphs || []).forEach((p) => repaintPara(p.label));
      hideTool();
    };
  }

  // 窄屏切换文章 / 题目，各自记住滚动位置
  function setPane(pane) {
    if (pane !== 'passage' && pane !== 'questions') return;
    const split = root.querySelector('.ier-split');
    if (!split) return;
    if (pane === st.pane) return;
    st.paneScroll[st.pane] = window.scrollY;
    st.pane = pane;
    split.dataset.pane = pane;
    split.querySelectorAll('.ier-tabs button[data-pane]').forEach((b) => b.classList.toggle('on', b.dataset.pane === pane));
    hideTool();
    const saved = st.paneScroll[pane];
    const splitTop = split.getBoundingClientRect().top + window.scrollY - topbarHeight();
    window.scrollTo(0, saved != null ? saved : Math.min(window.scrollY, Math.max(0, splitTop)));
  }

  function topbarHeight() {
    const tb = document.querySelector('.topbar');
    if (!tb) return 0;
    const pos = getComputedStyle(tb).position;
    return pos === 'sticky' || pos === 'fixed' ? tb.getBoundingClientRect().height : 0;
  }

  // 量出顶栏和答题头部的高度，供两栏 sticky 定位
  function layoutVars() {
    const split = root && root.querySelector('.ier-split');
    if (!split) return;
    split.style.setProperty('--ier-top', `${Math.round(topbarHeight())}px`);
    const head = split.querySelector('.ier-head');
    if (head) split.style.setProperty('--ier-head', `${Math.round(head.getBoundingClientRect().height)}px`);
  }

  async function submit() {
    if (st.submitting || st.stage !== 'read') return;
    const total = questionTotal();
    const n = answeredCount();
    if (!n) {
      setMsg('还没有作答任何题目，至少答一题再交卷。', 'bad');
      return;
    }
    // 有空题先提醒一次，再点一次才交（不用阻塞式弹窗）
    if (n < total && !st.confirmSubmit) {
      st.confirmSubmit = true;
      setMsg(`还有 ${total - n} 题没答，空题按错误计分。确定交卷请再点一次「交卷」。`, 'warn');
      return;
    }
    const wasRunning = !!st.runningSince;
    pauseTimer();
    saveDraft();
    st.submitting = true;
    root.querySelectorAll('.ier-submit').forEach((b) => { b.disabled = true; });
    setMsg('判分中…');
    const passageId = st.passage.id;
    const answers = {};
    for (const [qid, v] of Object.entries(st.answers)) if (st.qinfo.has(qid) && v.trim()) answers[qid] = v;
    let r;
    try {
      r = await IE.post(`/api/ielts/reading/${encodeURIComponent(passageId)}/submit`, {
        answers,
        durationSec: Math.min(MAX_DURATION_SEC, Math.round(elapsedNow())),
        mode: st.mode,
      });
    } catch (e) {
      st.submitting = false;
      if (!alive() || st.stage !== 'read' || !st.passage || st.passage.id !== passageId) return;
      root.querySelectorAll('.ier-submit').forEach((b) => { b.disabled = false; });
      setMsg(`交卷失败：${e.message}。作答已存为草稿，可以稍后重试。`, 'bad');
      if (wasRunning) startTimer();
      return;
    }
    st.submitting = false;
    clearDraft(passageId);
    if (!alive() || st.stage !== 'read' || !st.passage || st.passage.id !== passageId) return;
    st.result = r || {};
    renderResult();
  }

  // ---------- 结果页 ----------
  function promptText(q, g) {
    if (g.type === 'matching-headings') return q.prompt || `Paragraph ${q.para || ''}`;
    if (g.type === 'summary-completion') return `摘要第 ${q.number} 空${g.summary && g.summary.title ? `（${g.summary.title}）` : ''}`;
    if (g.type === 'sentence-completion') return String(q.prompt || '').split('{blank}').join('______');
    return q.prompt || '';
  }

  function optionText(g, q, key) {
    let list = null;
    if (g.type === 'mcq') list = q.options;
    else if (g.type === 'matching-headings') list = g.options;
    else if (g.type === 'summary-completion') list = g.wordBank;
    if (!Array.isArray(list)) return '';
    const hit = list.find((o) => String(o.key).toLowerCase() === String(key).trim().toLowerCase());
    return hit ? hit.text : '';
  }

  function resultRowHtml(res) {
    const info = st.qinfo.get(String(res.id)) || { q: { number: res.number }, g: { type: res.type } };
    const { q, g } = info;
    const answers = Array.isArray(res.answer) ? res.answer : [];
    const main = answers[0] || '';
    const mainText = res.answerText || optionText(g, q, main);
    const others = answers.slice(1);
    let mine;
    if (res.blank || !res.response) mine = '<span class="ie-muted">未作答</span>';
    else {
      const t = optionText(g, q, res.response);
      mine = `<b${res.correct ? '' : ' class="ier-bad"'}>${esc(res.response)}</b>${t ? ` ${esc(t)}` : ''}`;
    }
    const over = res.overLimit ? `<span class="ie-pill warn">超出字数限制${g.wordLimitLabel ? `：${esc(g.wordLimitLabel)}` : ''}</span>` : '';
    const ev = res.evidence && res.evidence.quote
      ? `<div class="ier-ev-q">📍 原文 ${esc(res.evidence.para)} 段：${esc(res.evidence.quote)}</div>`
      : '';
    return (
      `<div class="ier-res ${res.correct ? 'ok' : 'bad'}" data-qid="${esc(String(res.id))}" role="button" tabindex="0" aria-expanded="false">` +
      `<div class="ier-res-h"><span class="ier-num">${esc(String(res.number))}</span><span class="ier-mark">${res.correct ? '✓' : '✗'}</span><span class="ier-qp">${esc(promptText(q, g))}</span></div>` +
      `<div class="ier-res-a">你的答案：${mine} ${over}<br>正确答案：<b>${esc(main)}</b>${mainText ? ` ${esc(mainText)}` : ''}` +
      (others.length ? `<span class="ie-muted">（也可：${others.map((x) => esc(x)).join(' / ')}）</span>` : '') +
      '</div>' +
      '<div class="ier-res-more" hidden>' +
      `<div>💡 ${esc(res.explanation || '暂无解析')}</div>` +
      ev +
      (ev ? '<button type="button" class="btn small ier-goto">📄 在文章中查看</button>' : '') +
      '</div>' +
      '</div>'
    );
  }

  function renderResult() {
    st.stage = 'result'; // 先切阶段：stopAll 只在答题阶段存草稿，避免把刚清掉的草稿又写回去
    stopAll();
    st.activeQ = null;
    st.evidence = null;
    st.pane = isNarrow() ? 'questions' : 'passage';
    st.paneScroll = {};
    const p = st.passage;
    const r = st.result;
    const results = Array.isArray(r.results) ? r.results : [];
    const raw = Number(r.raw);
    const total = Number(r.total) || results.length;
    const dur = r.record && Number.isFinite(Number(r.record.durationSec)) ? Number(r.record.durationSec) : 0;
    const bar =
      '<button type="button" class="btn small ghost ier-back">← 文章列表</button>' +
      `<span class="ier-bar-t" title="${esc(p.title)}">${esc(p.title)}</span>` +
      `<span class="ie-pill${st.mode === 'exam' ? '' : ' mute'}">${esc(MODE_LABEL[st.mode])}</span>` +
      `<span class="ier-count">得分 ${esc(String(raw))}/${esc(String(total))} · Band ${esc(fmtBand(r.band))}</span>`;
    const qPane =
      '<div class="ier-score">' +
      `<div><b>${esc(String(raw))}</b>/${esc(String(total))} 原始分</div>` +
      `<div>折算 40 题约 <b>${esc(String(r.scaled40 != null ? r.scaled40 : '—'))}</b> 题</div>` +
      `<div>估算 Band <b class="ier-band">${esc(fmtBand(r.band))}</b></div>` +
      '</div>' +
      `<div class="ie-muted">${esc(MODE_LABEL[st.mode])} · 用时 ${esc(IE.fmtDuration(dur))}${st.mode === 'exam' && dur > EXAM_SEC ? '（超过 20 分钟）' : ''}</div>` +
      `<div class="ie-note" style="margin:10px 0">${esc(r.bandNote || '估算 band 只作参考。')}</div>` +
      '<div class="ie-row" style="margin-bottom:6px">' +
      '<button type="button" class="btn small primary ier-again" data-mode="exam">⏱ 考试模式再做</button>' +
      '<button type="button" class="btn small ier-again" data-mode="practice">📝 练习模式再做</button>' +
      '</div>' +
      '<div class="ie-muted" style="margin-top:8px">点任一题查看中文解析，文章里会高亮定位原文句子。</div>' +
      results.map(resultRowHtml).join('');
    root.innerHTML = splitHtml(bar, tabsHtml('✅ 结果'), qPane);
    bindSplitCommon();
    const qPaneEl = root.querySelector('.ier-pane-q');
    qPaneEl.onclick = (e) => {
      const go = e.target.closest('.ier-goto');
      const row = e.target.closest('.ier-res');
      if (!row || !qPaneEl.contains(row)) return;
      if (go) {
        selectResult(row.dataset.qid, true);
        setPane('passage');
        scrollToEvidence();
        return;
      }
      selectResult(row.dataset.qid, false);
    };
    qPaneEl.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.ier-res');
      if (!row || e.target !== row) return;
      e.preventDefault();
      selectResult(row.dataset.qid, false);
    };
    root.querySelectorAll('.ier-again').forEach((b) => {
      b.onclick = () => openPassage(p.id, b.dataset.mode);
    });
    root.querySelector('.ier-back').onclick = renderList;
    layoutVars();
    window.scrollTo(0, Math.min(window.scrollY, Math.max(0, root.getBoundingClientRect().top + window.scrollY - topbarHeight() - 8)));
  }

  // 点某题：展开解析，文章里高亮证据句；宽屏下同时把文章滚到证据句
  function selectResult(qid, keepOpen) {
    const res = (st.result && Array.isArray(st.result.results) ? st.result.results : []).find((x) => String(x.id) === qid);
    if (!res) return;
    const toggleOff = st.activeQ === qid && !keepOpen;
    const prevPara = st.evidence && st.evidence.para;
    st.activeQ = toggleOff ? null : qid;
    st.evidence = !toggleOff && res.evidence && res.evidence.quote ? { para: res.evidence.para, quote: res.evidence.quote } : null;
    root.querySelectorAll('.ier-res').forEach((row) => {
      const on = row.dataset.qid === st.activeQ;
      row.classList.toggle('on', on);
      row.setAttribute('aria-expanded', on ? 'true' : 'false');
      const more = row.querySelector('.ier-res-more');
      if (more) more.hidden = !on;
    });
    if (prevPara) repaintPara(prevPara);
    if (st.evidence && st.evidence.para !== prevPara) repaintPara(st.evidence.para);
    if (st.evidence && !isNarrow()) scrollToEvidence();
  }

  function scrollToEvidence() {
    const mark = root && root.querySelector('.ier-pane-p mark.ier-ev');
    if (!mark) return;
    const pane = root.querySelector('.ier-pane-p');
    const paneScrolls = pane && pane.scrollHeight > pane.clientHeight + 1 && getComputedStyle(pane).overflowY !== 'visible';
    // 等窄屏切换标签后的布局稳定再量位置
    requestAnimationFrame(() => {
      const mr = mark.getBoundingClientRect();
      if (paneScrolls) {
        const pr = pane.getBoundingClientRect();
        pane.scrollTo({ top: Math.max(0, pane.scrollTop + mr.top - pr.top - pane.clientHeight / 2 + mr.height / 2), behavior: 'smooth' });
      } else {
        window.scrollTo({ top: Math.max(0, window.scrollY + mr.top - window.innerHeight / 2), behavior: 'smooth' });
      }
    });
  }

  // ---------- 全局监听（模块加载时只注册一次，靠状态判断是否生效）----------
  document.addEventListener('selectionchange', () => {
    if (st.stage !== 'read' && st.stage !== 'result') return;
    clearTimeout(selTimer);
    selTimer = setTimeout(checkSelection, 200);
  });
  // 拖选可能在文章栏外松开，所以在 document 上收尾
  const endSelecting = () => {
    if (!st.selecting) return;
    st.selecting = false;
    setTimeout(checkSelection, 0);
  };
  document.addEventListener('pointerup', endSelecting);
  document.addEventListener('pointercancel', endSelecting);
  window.addEventListener('scroll', () => { if (tool && !tool.hidden) hideTool(); }, { passive: true });
  window.addEventListener('resize', () => {
    if (st.stage === 'read' || st.stage === 'result') {
      hideTool();
      layoutVars();
    }
  });

  IE.registerPage('reading', {
    meta: { label: '阅读', icon: '📖', before: 'writing' },
    render(body, c) {
      root = body;
      ctx = c;
      renderList();
    },
    // 切走再回来：答题 / 结果阶段保留现场，答题阶段恢复计时
    resume() {
      if (!root || !root.isConnected || st.stage === 'list') return false;
      if (st.stage === 'read' && st.wasRunning) startTimer();
      st.wasRunning = false;
      layoutVars();
      return true;
    },
    pause() {
      if (st.stage === 'read') st.wasRunning = !!st.runningSince;
      stopAll();
    },
    leave() {
      stopAll();
      st.stage = 'list';
      st.wasRunning = false;
    },
  });
})();
