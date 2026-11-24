'use strict';
// 雅思备考 · 写作子页：题目筛选 → 计时写作（Task 1 20 分钟 / Task 2 40 分钟，超时只提示）→ 四维自评 → band + 范文对照。
// 草稿每 5 秒存 localStorage（按档案前缀隔离）；范文在提交前隐藏。
// 接口：GET /api/ielts/writing、GET /api/ielts/writing/:id、POST /api/ielts/writing/submit、GET /api/ielts/rubrics
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE || !IE.registerPage) return;
  const esc = NCE.escapeHtml;
  const escAttr = NCE.escapeAttr || esc;

  const QTYPE_LABEL = {
    opinion: '观点类', discussion: '讨论双方', 'problem-solution': '问题解决', 'adv-disadv': '利弊类', 'two-part': '双问题',
  };
  const TONE_LABEL = { formal: '正式', 'semi-formal': '半正式', informal: '非正式' };
  const TOPIC_LABEL = {
    academic: '学术通用', education: '教育', environment: '环境', technology: '科技', health: '健康',
    work: '工作', crime: '犯罪', media: '媒体', urban: '城市', globalization: '全球化',
    government: '政府', culture: '文化', science: '科学',
  };
  const LIMIT_SEC = { 1: 20 * 60, 2: 40 * 60 };
  const MIN_WORDS = { 1: 150, 2: 250 };
  const DRAFT_EVERY_MS = 5000;

  const style = document.createElement('style');
  style.textContent = `
    .iew-filters{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
    .iew-filters .chip{padding:6px 13px}
    .iew-list{display:flex;flex-direction:column;gap:10px}
    .iew-item{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card);padding:12px 14px;cursor:pointer}
    .iew-item:hover{border-color:var(--brand);box-shadow:var(--shadow-sm)}
    .iew-item-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
    .iew-meta{font-size:12.5px;color:var(--muted)}
    .iew-stat{margin-left:auto;font-size:12.5px;color:var(--muted)}
    .iew-stat b{color:var(--ok)}
    .iew-item-p{font-size:14px;color:var(--ink-soft);line-height:1.6}
    .iew-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    .iew-top .iew-title{font-weight:700;color:var(--ink);font-size:14px}
    .iew-prompt-text{font-size:15px;color:var(--ink);line-height:1.75;white-space:pre-line}
    .iew-prompt details{margin-top:10px;font-size:13.5px;color:var(--ink-soft);line-height:1.7}
    .iew-prompt summary{cursor:pointer;color:var(--brand);font-weight:600}
    .iew-prompt ul{margin:6px 0;padding-left:20px}
    .iew-bullets{margin:10px 0 0;padding-left:22px;font-size:15px;color:var(--ink);line-height:1.8}
    .iew-chart{margin-top:12px}
    .iew-status{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;margin:14px 0 8px;font-size:14px;color:var(--ink-soft)}
    .iew-timer{font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink)}
    .iew-timer.warn{color:#d97706}
    .iew-timer.over{color:var(--bad)}
    .iew-wc{font-variant-numeric:tabular-nums}
    .iew-wc.low{color:#d97706}
    .iew-wc.ok{color:var(--ok)}
    .iew-saved{font-size:12px;color:var(--muted)}
    .iew-ta{width:100%;min-height:340px;resize:vertical;padding:14px;font-size:15.5px;line-height:1.75;font-family:Georgia,"Times New Roman",serif;color:var(--ink);background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm)}
    .iew-ta:focus{outline:none;border-color:var(--brand);box-shadow:var(--ring)}
    html[data-theme=midnight] .iew-ta{background:rgba(255,255,255,.05)}
    .iew-essay{font-size:14.5px;line-height:1.8;color:var(--ink);font-family:Georgia,"Times New Roman",serif;overflow-wrap:anywhere}
    .iew-essay p{margin:0 0 10px}
    .iew-essay p:last-child{margin-bottom:0}
    .iew-band{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
    .iew-band b{font-size:46px;font-weight:900;color:var(--brand);line-height:1}
    .iew-dims{font-size:14px;color:var(--ink-soft);margin-top:6px}
    .iew-compare{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .iew-col{border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:12px 14px;min-width:0}
    .iew-col-h{font-size:13px;font-weight:700;color:var(--muted);margin-bottom:8px}
    @media (max-width:720px){.iew-compare{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const st = {
    stage: 'list', // list | write | score | result
    filter: { task: '', variant: null, topic: '', qtype: '' }, // variant 为 null 时跟随档案 examType
    list: null,
    item: null,
    text: '',
    elapsedBase: 0,
    runningSince: 0,
    wasRunning: false,
    timerId: null,
    saveId: null,
    overtimeWarned: false,
    lastSavedText: null,
    durationSec: 0,
    form: null,
    result: null,
    lowWordsConfirmed: false,
  };
  let root = null;
  let ctx = null;

  function alive() {
    return ctx && ctx.isActive();
  }
  function profileVariant() {
    const p = IE.getProfile().profile;
    return p && p.examType === 'G' ? 'G' : 'A';
  }
  function curVariant() {
    return st.filter.variant || profileVariant();
  }
  function countWords(text) {
    const m = String(text || '').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
    return m ? m.length : 0;
  }
  // 先转义，再按空行分段；段内单个换行保留为 <br>
  function paragraphsHtml(text) {
    const paras = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (!paras.length) return '<p class="ie-muted">（空）</p>';
    return paras.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  function taskLabel(it) {
    if (!it) return '';
    if (Number(it.task) === 2) return 'Task 2';
    return it.variant === 'G' ? 'Task 1 · G 类书信' : 'Task 1 · A 类图表';
  }
  function itemMeta(it) {
    const parts = [];
    if (Number(it.task) === 2 && it.qtype) parts.push(QTYPE_LABEL[it.qtype] || it.qtype);
    if (it.variant === 'G' && it.tone) parts.push(`语气：${TONE_LABEL[it.tone] || it.tone}`);
    if (it.variant === 'A' && it.chart && it.chart.type && IE.chart) parts.push(IE.chart.TYPE_LABEL[it.chart.type] || it.chart.type);
    if (it.topic) parts.push(TOPIC_LABEL[it.topic] || it.topic);
    return parts.join(' · ');
  }
  function rubricKind(it) {
    if (Number(it.task) === 2) return 'task2';
    return it.variant === 'G' ? 'task1G' : 'task1A';
  }

  // ---------- 草稿（localStorage，按档案隔离；存储不可用时只提示不中断）----------
  function draftKey(id) {
    return IE.storeKey('writing-draft:' + id);
  }
  function readDraft(id) {
    try {
      const raw = localStorage.getItem(draftKey(id));
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && typeof d.text === 'string' ? d : null;
    } catch (e) {
      console.warn('[ielts-writing] 读取草稿失败', e);
      return null;
    }
  }
  function hasDraft(id) {
    const d = readDraft(id);
    return !!(d && d.text.trim());
  }
  function saveDraft(force) {
    if (!st.item || !st.item.id) return;
    if (!force && st.text === st.lastSavedText) return;
    const savedEl = root && root.querySelector('.iew-saved');
    try {
      if (!st.text.trim()) localStorage.removeItem(draftKey(st.item.id));
      else localStorage.setItem(draftKey(st.item.id), JSON.stringify({ text: st.text, elapsed: Math.round(elapsedNow()), ts: Date.now() }));
      st.lastSavedText = st.text;
      if (savedEl && st.text.trim()) {
        const d = new Date();
        savedEl.textContent = `草稿已自动保存 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      }
    } catch (e) {
      console.warn('[ielts-writing] 保存草稿失败', e);
      if (savedEl) savedEl.textContent = '⚠️ 草稿保存失败（浏览器存储不可用），请勿刷新页面';
    }
  }
  function clearDraft(id) {
    try {
      localStorage.removeItem(draftKey(id));
    } catch (e) {
      console.warn('[ielts-writing] 清除草稿失败', e);
    }
  }

  // ---------- 计时 ----------
  function elapsedNow() {
    return st.elapsedBase + (st.runningSince ? (Date.now() - st.runningSince) / 1000 : 0);
  }
  function startTimer() {
    if (st.runningSince) return;
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
    tick();
  }
  function stopAll() {
    pauseTimer();
    clearInterval(st.saveId);
    st.saveId = null;
  }
  function tick() {
    const el = root && root.querySelector('.iew-timer');
    const btn = root && root.querySelector('.iew-timer-toggle');
    if (btn) btn.textContent = st.runningSince ? '⏸ 暂停计时' : '▶ 继续计时';
    if (!el || !st.item) return;
    const limit = LIMIT_SEC[Number(st.item.task)] || LIMIT_SEC[2];
    const left = limit - elapsedNow();
    if (left >= 0) {
      el.textContent = `⏱ 剩余 ${IE.fmtClock(left)}`;
      el.className = 'iew-timer' + (left < 300 ? ' warn' : '');
    } else {
      el.textContent = `⏰ 已超时 ${IE.fmtClock(-left)}`;
      el.className = 'iew-timer over';
      if (!st.overtimeWarned) {
        st.overtimeWarned = true;
        NCE.toast(`${Math.round(limit / 60)} 分钟到了！考试中这时就要停笔，这里可以继续写完再提交`, 'warn');
      }
    }
  }

  // ---------- 列表 ----------
  function filtersHtml() {
    const f = st.filter;
    const topics = Array.from(new Set((st.list || []).map((it) => it.topic).filter(Boolean)));
    const showQtype = f.task !== '1';
    const showVariant = f.task !== '2';
    return (
      '<div class="iew-filters">' +
      '<div class="ie-row chips iew-task">' +
      [['', '全部'], ['1', 'Task 1'], ['2', 'Task 2']].map(([v, l]) => `<div class="chip${f.task === v ? ' active' : ''}" data-v="${v}">${l}</div>`).join('') +
      '</div>' +
      (showVariant
        ? '<div class="ie-row chips iew-variant">' +
          `<div class="chip${curVariant() === 'A' ? ' active' : ''}" data-v="A">A 类 · 图表</div>` +
          `<div class="chip${curVariant() === 'G' ? ' active' : ''}" data-v="G">G 类 · 书信</div>` +
          `<span class="ie-muted">Task 1 默认跟随档案（${profileVariant()} 类）${st.filter.variant && st.filter.variant !== profileVariant() ? '，当前为临时切换' : ''}</span>` +
          '</div>'
        : '') +
      '<div class="ie-row">' +
      '<select class="iew-topic" aria-label="话题"><option value="">全部话题</option>' +
      topics.map((t) => `<option value="${escAttr(t)}"${f.topic === t ? ' selected' : ''}>${esc(TOPIC_LABEL[t] || t)}</option>`).join('') +
      '</select>' +
      (showQtype
        ? '<select class="iew-qtype" aria-label="Task 2 题型"><option value="">Task 2 全部题型</option>' +
          Object.keys(QTYPE_LABEL).map((k) => `<option value="${k}"${f.qtype === k ? ' selected' : ''}>${QTYPE_LABEL[k]}</option>`).join('') +
          '</select>'
        : '') +
      '</div>' +
      '</div>'
    );
  }

  function filteredList() {
    const f = st.filter;
    const v = curVariant();
    return (st.list || []).filter((it) => {
      const task = String(it.task);
      if (f.task && task !== f.task) return false;
      if (task === '1' && (it.variant || 'A') !== v) return false;
      if (f.topic && it.topic !== f.topic) return false;
      if (f.qtype && (task !== '2' || it.qtype !== f.qtype)) return false;
      return true;
    });
  }

  function paintList() {
    root.innerHTML = filtersHtml() + '<div class="iew-list"></div>';
    const box = root.querySelector('.iew-list');
    const items = filteredList();
    box.innerHTML = items.length
      ? items.map((it) => {
        const done = Number(it.done) || 0;
        const stat = done
          ? `已写 ${done} 次${it.bestBand != null ? ` · 最佳 <b>${esc(IE.fmtBand(it.bestBand))}</b>` : ''}`
          : '未写';
        const prompt = String(it.prompt || '');
        return (
          `<div class="iew-item" data-id="${escAttr(it.id)}">` +
          '<div class="iew-item-h">' +
          `<span class="ie-pill">${esc(taskLabel(it))}</span><span class="iew-meta">${esc(itemMeta(it))}</span>` +
          (hasDraft(it.id) ? '<span class="ie-pill warn">📝 有草稿</span>' : '') +
          `<span class="iew-stat">${stat}</span>` +
          '</div>' +
          `<div class="iew-item-p">${esc(prompt.length > 160 ? prompt.slice(0, 158) + '…' : prompt)}</div>` +
          '</div>'
        );
      }).join('')
      : '<div class="ie-empty">没有符合条件的题目，换个筛选试试。</div>';
    bindFilters();
    box.querySelectorAll('.iew-item').forEach((el) => {
      el.onclick = () => openPrompt(el.dataset.id);
    });
  }

  function bindFilters() {
    const f = st.filter;
    root.querySelectorAll('.iew-task .chip').forEach((c) => {
      c.onclick = () => {
        f.task = c.dataset.v;
        if (f.task === '1') f.qtype = '';
        paintList();
      };
    });
    root.querySelectorAll('.iew-variant .chip').forEach((c) => {
      c.onclick = () => {
        f.variant = c.dataset.v === profileVariant() ? null : c.dataset.v; // 切回档案类型即恢复「跟随」
        paintList();
      };
    });
    const topic = root.querySelector('.iew-topic');
    if (topic) topic.onchange = () => { f.topic = topic.value; paintList(); };
    const qtype = root.querySelector('.iew-qtype');
    if (qtype) qtype.onchange = () => { f.qtype = qtype.value; paintList(); };
  }

  async function renderList() {
    stopAll();
    st.stage = 'list';
    st.item = null;
    root.innerHTML = '<div class="ie-loading">正在加载写作题目…</div>';
    let r;
    try {
      r = await IE.get('/api/ielts/writing');
    } catch (e) {
      if (!alive() || st.stage !== 'list') return;
      root.innerHTML = IE.errorHtml('写作题目加载失败', e);
      IE.bindRetry(root, renderList);
      return;
    }
    if (!alive() || st.stage !== 'list') return;
    st.list = Array.isArray(r) ? r : (r && Array.isArray(r.items) ? r.items : []);
    paintList();
  }

  // ---------- 写作 ----------
  async function openPrompt(id) {
    stopAll();
    st.stage = 'write';
    root.innerHTML = '<div class="ie-loading">正在加载题目…</div>';
    let item;
    try {
      item = await IE.get('/api/ielts/writing/' + encodeURIComponent(id));
    } catch (e) {
      if (!alive() || st.stage !== 'write') return;
      root.innerHTML =
        '<div class="iew-top"><button type="button" class="btn small ghost iew-back">← 题目列表</button></div>' +
        IE.errorHtml('题目加载失败', e);
      root.querySelector('.iew-back').onclick = renderList;
      IE.bindRetry(root, () => openPrompt(id));
      return;
    }
    if (!alive() || st.stage !== 'write') return;
    st.item = item;
    const draft = readDraft(item.id);
    st.text = draft ? draft.text : '';
    st.elapsedBase = draft && Number.isFinite(Number(draft.elapsed)) ? Math.max(0, Number(draft.elapsed)) : 0;
    st.runningSince = 0;
    st.lastSavedText = st.text;
    st.overtimeWarned = st.elapsedBase > (LIMIT_SEC[Number(item.task)] || LIMIT_SEC[2]);
    st.lowWordsConfirmed = false;
    st.result = null;
    renderWrite();
    if (draft && draft.text.trim()) {
      NCE.toast(`已恢复上次的草稿（${IE.fmtDateTime(draft.ts) || '时间未知'}）`, 'ok');
    }
  }

  function helpersHtml(it) {
    const blocks = [];
    const list = (title, arr) => {
      const xs = (Array.isArray(arr) ? arr : []).filter((x) => x != null && String(x).trim());
      return xs.length ? `<div><b>${title}</b><ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    };
    blocks.push(list('思路', it.ideas));
    blocks.push(list('提纲', it.outline));
    blocks.push(list('可用句型', it.phrases));
    blocks.push(list('要点', it.keyFeatures));
    const body = blocks.join('');
    return body ? `<details><summary>💡 写作提示（建议先自己构思再看）</summary>${body}</details>` : '';
  }

  function promptCardHtml(it) {
    const isG = Number(it.task) === 1 && it.variant === 'G';
    const isA = Number(it.task) === 1 && !isG;
    const bullets = isG && Array.isArray(it.bullets) ? it.bullets.filter(Boolean) : [];
    return (
      '<div class="ie-card iew-prompt">' +
      `<div class="iew-prompt-text">${esc(it.prompt || '')}</div>` +
      (bullets.length ? `<ul class="iew-bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '') +
      (isG && it.tone ? `<div class="ie-muted" style="margin-top:6px">语气：${esc(TONE_LABEL[it.tone] || it.tone)} · 开头写 Dear …，至少 150 词</div>` : '') +
      (isA ? '<div class="iew-chart"></div>' : '') +
      (it.promptCn ? `<details><summary>中文题意</summary>${esc(it.promptCn)}</details>` : '') +
      helpersHtml(it) +
      '</div>'
    );
  }

  function renderWrite() {
    const it = st.item;
    st.stage = 'write';
    const min = MIN_WORDS[Number(it.task)] || 250;
    root.innerHTML =
      '<div class="iew-top">' +
      '<button type="button" class="btn small ghost iew-back">← 题目列表</button>' +
      `<span class="iew-title">${esc(taskLabel(it))}${itemMeta(it) ? ' · ' + esc(itemMeta(it)) : ''}</span>` +
      '</div>' +
      promptCardHtml(it) +
      '<div class="iew-status">' +
      '<span class="iew-timer"></span>' +
      `<span class="iew-wc"></span>` +
      '<span class="iew-saved"></span>' +
      '</div>' +
      `<textarea class="iew-ta" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" placeholder="在这里写作，至少 ${min} 词…（考场没有拼写检查，这里也关掉了）"></textarea>` +
      '<div class="ie-row" style="margin-top:12px">' +
      '<button type="button" class="btn primary iew-done">写完了，去自评 →</button>' +
      '<button type="button" class="btn small ghost iew-timer-toggle">⏸ 暂停计时</button>' +
      '<span class="ie-msg iew-msg"></span>' +
      '</div>';

    if (Number(it.task) === 1 && it.variant !== 'G') {
      const chartEl = root.querySelector('.iew-chart');
      if (IE.chart) IE.chart.mount(chartEl, it.chart);
      else chartEl.innerHTML = '<div class="ie-note">图表模块没有加载，请刷新页面。</div>';
    }
    const ta = root.querySelector('.iew-ta');
    ta.value = st.text;
    const paintWc = () => {
      const wc = countWords(st.text);
      const el = root.querySelector('.iew-wc');
      el.textContent = `字数 ${wc} / 至少 ${min}`;
      el.className = 'iew-wc ' + (wc >= min ? 'ok' : wc > 0 ? 'low' : '');
    };
    ta.oninput = () => {
      st.text = ta.value;
      st.lowWordsConfirmed = false;
      paintWc();
    };
    paintWc();
    root.querySelector('.iew-back').onclick = () => {
      saveDraft(true);
      renderList();
    };
    root.querySelector('.iew-timer-toggle').onclick = () => {
      if (st.runningSince) pauseTimer();
      else startTimer();
    };
    root.querySelector('.iew-done').onclick = () => finishWriting(min);
    clearInterval(st.saveId);
    st.saveId = setInterval(() => saveDraft(false), DRAFT_EVERY_MS);
    startTimer();
  }

  function finishWriting(min) {
    const msg = root.querySelector('.iew-msg');
    const wc = countWords(st.text);
    if (!st.text.trim()) {
      msg.className = 'ie-msg iew-msg bad';
      msg.textContent = '还没有写内容';
      return;
    }
    // 字数不足先提醒一次，再点一次才继续（不用阻塞式弹窗）
    if (wc < min && !st.lowWordsConfirmed) {
      st.lowWordsConfirmed = true;
      msg.className = 'ie-msg iew-msg bad';
      msg.textContent = `现在 ${wc} 词，少于 ${min} 词，考试中会被扣分。确定要结束，再点一次「写完了」。`;
      return;
    }
    pauseTimer();
    st.durationSec = Math.round(elapsedNow());
    saveDraft(true);
    clearInterval(st.saveId);
    st.saveId = null;
    renderScore();
  }

  // ---------- 自评 ----------
  async function renderScore() {
    const it = st.item;
    st.stage = 'score';
    const wc = countWords(st.text);
    root.innerHTML =
      '<div class="iew-top">' +
      '<button type="button" class="btn small ghost iew-continue">← 回去继续修改</button>' +
      `<span class="iew-title">${esc(taskLabel(it))} · 自评</span>` +
      '</div>' +
      '<div class="ie-card">' +
      `<h3>📝 你的作文 <span class="ie-h3-sub">${wc} 词 · 用时 ${esc(IE.fmtDuration(st.durationSec))}</span></h3>` +
      `<details><summary class="ie-muted" style="cursor:pointer">展开查看原文</summary><div class="iew-essay" style="margin-top:8px">${paragraphsHtml(st.text)}</div></details>` +
      '</div>' +
      '<div class="ie-card">' +
      '<h3>⚖️ 四维自评</h3>' +
      '<div class="ie-note" style="margin-bottom:12px">对照每一档的描述和自查清单，给四个维度各选一个分（4–9 分，0.5 一档）。总分取四维平均后<b>向下取整到 0.5</b>，自评偏乐观时更保守。</div>' +
      '<div class="iew-form"><div class="ie-loading">正在加载评分说明…</div></div>' +
      '<div class="ie-row" style="margin-top:14px"><button type="button" class="btn primary iew-submit" disabled>提交自评</button><span class="ie-msg iew-msg"></span></div>' +
      '</div>';
    root.querySelector('.iew-continue').onclick = () => {
      renderWrite();
    };
    const { dims, fallback, error } = await IE.rubricDims(rubricKind(it));
    if (!alive() || st.stage !== 'score') return;
    const formEl = root.querySelector('.iew-form');
    st.form = IE.mountScoreForm(formEl, dims);
    if (fallback) {
      formEl.insertAdjacentHTML('afterbegin', `<div class="ie-warn" style="margin-bottom:10px">评分说明暂时加载不了（${esc(error ? error.message : '未知原因')}），先按维度名称自评，提交不受影响。</div>`);
    }
    const btn = root.querySelector('.iew-submit');
    btn.disabled = false;
    btn.onclick = () => submit(btn);
  }

  async function submit(btn) {
    const msg = root.querySelector('.iew-msg');
    const scores = st.form && st.form.getScores();
    if (!scores) {
      msg.className = 'ie-msg iew-msg bad';
      msg.textContent = '还有维度没打分：' + (st.form ? st.form.missing().join('、') : '');
      return;
    }
    btn.disabled = true;
    msg.className = 'ie-msg iew-msg';
    msg.textContent = '提交中…';
    let r;
    try {
      r = await IE.post('/api/ielts/writing/submit', {
        promptId: st.item.id,
        text: st.text,
        durationSec: st.durationSec,
        selfScores: scores,
      });
    } catch (e) {
      if (!alive() || st.stage !== 'score') return;
      btn.disabled = false;
      msg.className = 'ie-msg iew-msg bad';
      msg.textContent = `提交失败：${e.message}。作文已存为草稿，可稍后重试。`;
      return;
    }
    clearDraft(st.item.id);
    st.result = { r: r || {}, scores };
    if (!alive() || st.stage !== 'score') return;
    renderResult();
  }

  // ---------- 结果与范文对照 ----------
  function hintList(r) {
    const raw = [r.wordHint, r.hint, r.warning, r.note].concat(Array.isArray(r.hints) ? r.hints : []);
    return raw.filter((x) => typeof x === 'string' && x.trim());
  }

  function renderResult() {
    const it = st.item;
    const { r, scores } = st.result;
    st.stage = 'result';
    const vals = Object.values(scores);
    const localBand = IE.floorHalf(vals.reduce((a, b) => a + b, 0) / vals.length);
    const band = Number.isFinite(Number(r.band)) ? Number(r.band) : localBand;
    const wc = Number.isFinite(Number(r.wordCount)) ? Number(r.wordCount) : countWords(st.text);
    const hints = hintList(r);
    const model = String(it.modelAnswer || '');
    const extras = [];
    const listBlock = (title, arr) => {
      const xs = (Array.isArray(arr) ? arr : []).filter((x) => x != null && String(x).trim());
      if (xs.length) extras.push(`<div style="margin-top:10px"><b>${title}</b><ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`);
    };
    listBlock('范文提纲', it.outline);
    listBlock('可用句型', it.phrases);
    listBlock('要点', it.keyFeatures);
    root.innerHTML =
      '<div class="iew-top">' +
      '<button type="button" class="btn small ghost iew-back">← 题目列表</button>' +
      `<span class="iew-title">${esc(taskLabel(it))} · 结果</span>` +
      '</div>' +
      '<div class="ie-card">' +
      `<div class="iew-band"><span class="ie-muted">自评 Band</span><b>${esc(IE.fmtBand(band))}</b></div>` +
      `<div class="iew-dims">${Object.keys(scores).map((k) => `${esc(k)} ${esc(IE.fmtBand(scores[k]))}`).join(' · ')}</div>` +
      `<div class="ie-muted" style="margin-top:4px">字数 ${wc} · 用时 ${esc(IE.fmtDuration(st.durationSec))}</div>` +
      (hints.length ? `<div class="ie-warn" style="margin-top:10px">${hints.map((h) => esc(h)).join('<br>')}</div>` : '') +
      '</div>' +
      '<div class="ie-card iew-prompt">' +
      `<h3>📖 范文对照${it.modelBand != null ? ` <span class="ie-h3-sub">范文约 Band ${esc(IE.fmtBand(it.modelBand))}</span>` : ''}</h3>` +
      '<div class="iew-compare">' +
      `<div class="iew-col"><div class="iew-col-h">我的作文（${wc} 词）</div><div class="iew-essay">${paragraphsHtml(st.text)}</div></div>` +
      `<div class="iew-col"><div class="iew-col-h">范文（${countWords(model)} 词）</div><div class="iew-essay">${model ? paragraphsHtml(model) : '<p class="ie-muted">这道题暂无范文</p>'}</div></div>` +
      '</div>' +
      (extras.length ? `<details><summary>范文提纲与句型</summary>${extras.join('')}</details>` : '') +
      '</div>' +
      '<div class="ie-row" style="margin-top:14px">' +
      '<button type="button" class="btn primary iew-next">再写一篇</button>' +
      '<button type="button" class="btn iew-redo">重写本题</button>' +
      '</div>';
    root.querySelector('.iew-back').onclick = renderList;
    root.querySelector('.iew-next').onclick = renderList;
    root.querySelector('.iew-redo').onclick = () => openPrompt(it.id);
  }

  IE.registerPage('writing', {
    render(body, c) {
      root = body;
      ctx = c;
      st.filter.variant = null; // 每次进入子页都重新跟随档案的考试类型
      renderList();
    },
    // 切走再回来：写作 / 自评 / 结果阶段保留现场，写作阶段恢复计时
    resume() {
      if (!root || !root.isConnected || st.stage === 'list') return false;
      if (st.stage === 'write') {
        if (st.wasRunning) startTimer();
        clearInterval(st.saveId);
        st.saveId = setInterval(() => saveDraft(false), DRAFT_EVERY_MS);
      }
      return true;
    },
    pause() {
      if (st.stage !== 'write') return;
      st.wasRunning = !!st.runningSince;
      saveDraft(true);
      stopAll();
    },
    leave() {
      if (st.stage === 'write') saveDraft(true);
      stopAll();
      st.stage = 'list';
    },
  });
})();
