'use strict';
// 雅思备考 · 口语子页：Part 1 逐题作答；Part 2 准备 60 秒 → 作答 120 秒（到时只提示）→ Part 3 追问；最后四维自评。
// 录音按 D4 只存在浏览器内存（MediaRecorder + blob URL），不上传不落盘；不支持或被拒绝时降级为只计时。
// 接口：GET /api/ielts/speaking?part=、GET /api/ielts/speaking/:id、POST /api/ielts/speaking/submit、GET /api/ielts/rubrics
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE || !IE.registerPage) return;
  const esc = NCE.escapeHtml;
  const escAttr = NCE.escapeAttr || esc;

  const CATEGORY_LABEL = { person: '人物', place: '地点', object: '物品', event: '事件', experience: '经历', media: '媒体' };
  const PREP_SEC = 60;
  const TALK_SEC = 120;
  const HINT = { 1: '建议每题答 20–30 秒：直接回答 + 原因或例子', 3: '建议每题答 40–60 秒：观点 + 解释 + 例子' };
  const CAN_RECORD = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  const style = document.createElement('style');
  style.textContent = `
    .ies-list{display:flex;flex-direction:column;gap:10px}
    .ies-item{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card);padding:12px 14px;cursor:pointer}
    .ies-item:hover{border-color:var(--brand);box-shadow:var(--shadow-sm)}
    .ies-item-t{font-size:15px;font-weight:700;color:var(--ink);line-height:1.5}
    .ies-item-s{font-size:12.5px;color:var(--muted);margin-top:4px}
    .ies-rec-note{font-size:12.5px;color:var(--muted);margin:10px 0 14px}
    .ies-rec-note.off{color:#d97706}
    .ies-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    .ies-top .t{font-weight:700;color:var(--ink);font-size:14px}
    .ies-q{font-size:19px;font-weight:700;color:var(--ink);line-height:1.6;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
    .ies-cue{border:2px dashed var(--border);border-radius:var(--radius-sm);padding:14px 16px}
    .ies-cue .t{font-size:17px;font-weight:800;color:var(--ink);line-height:1.5}
    .ies-cue .say{font-size:13px;color:var(--muted);margin:8px 0 2px}
    .ies-cue ul{margin:0;padding-left:22px;font-size:15px;color:var(--ink-soft);line-height:1.8}
    .ies-cue .fin{font-size:15px;color:var(--ink-soft);margin-top:2px}
    .ies-clock{font-size:34px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--ink);margin:14px 0 2px;line-height:1.1}
    .ies-clock.prep{color:#d97706}
    .ies-clock.talk{color:var(--brand)}
    .ies-clock.over{color:var(--bad)}
    .ies-phase{font-size:13px;color:var(--muted)}
    .ies-recdot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--bad);margin-right:6px;animation:iesBlink 1s infinite}
    @keyframes iesBlink{50%{opacity:.25}}
    .ies-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center}
    .ies-notes{width:100%;min-height:80px;margin-top:12px}
    .ies-audio{width:100%;max-width:420px;margin-top:12px;display:block}
    .ies-sample{margin-top:12px;font-size:14px;color:var(--ink-soft);line-height:1.75}
    .ies-sample summary{cursor:pointer;color:var(--brand);font-weight:600}
    .ies-sample p{margin:8px 0 0}
    .ies-steps{display:flex;flex-direction:column;gap:10px}
    .ies-step{border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:10px 12px}
    .ies-step-q{font-size:14px;font-weight:600;color:var(--ink)}
    .ies-step-s{font-size:12.5px;color:var(--muted);margin-top:2px}
    .ies-band{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
    .ies-band b{font-size:46px;font-weight:900;color:var(--brand);line-height:1}
  `;
  document.head.appendChild(style);

  const st = {
    stage: 'list', // list | run | score | result
    listPart: '1',
    lists: { 1: null, 2: null },
    session: null, // { item, part, idx, steps: [{ part, q, cue, sample, state, durationSec, audioUrl }], notes }
    timer: null,
    form: null,
    result: null,
  };
  // 录音状态（只在内存）
  const rec = { stream: null, recorder: null, chunks: [], urls: [], denied: false };
  let root = null;
  let ctx = null;

  function alive() {
    return ctx && ctx.isActive();
  }
  function paragraphsHtml(text) {
    const paras = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return paras.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  function sampleHtml(sample, label) {
    if (!sample || !String(sample).trim()) return '';
    return `<details class="ies-sample"><summary>${esc(label || '参考答案')}（建议先自己说完再看）</summary>${paragraphsHtml(sample)}</details>`;
  }
  function spk(text) {
    return text ? `<span class="spk ies-spk" data-speak="${escAttr(text)}" title="听题">🔊</span>` : '';
  }
  function bindSpk(el) {
    el.querySelectorAll('.ies-spk').forEach((s) => {
      s.onclick = (e) => {
        e.stopPropagation();
        NCE.speak(s.dataset.speak);
      };
    });
  }
  function stopTts() {
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }
  function clearTimer() {
    if (st.timer) {
      clearInterval(st.timer);
      st.timer = null;
    }
  }

  // ---------- 录音 ----------
  function recNoteHtml() {
    if (!CAN_RECORD) return '<div class="ies-rec-note off">⚠️ 当前浏览器或访问方式不支持录音（需要 HTTPS 或 localhost），本次只计时。</div>';
    if (rec.denied) return '<div class="ies-rec-note off">⚠️ 麦克风不可用（权限被拒绝或没有设备），本次只计时；在地址栏重新允许麦克风后刷新即可录音。</div>';
    return '<div class="ies-rec-note">🎙 作答时自动录音，录音只保存在本页内存里用于回听，不上传、不落盘，离开口语页就释放。</div>';
  }
  async function ensureMic() {
    if (!CAN_RECORD || rec.denied) return null;
    if (rec.stream) return rec.stream;
    try {
      rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return rec.stream;
    } catch (e) {
      rec.denied = true;
      console.warn('[ielts-speaking] 麦克风不可用', e);
      NCE.toast('麦克风不可用（' + (e && e.name === 'NotAllowedError' ? '权限被拒绝' : '没有设备或被占用') + '），本次只计时', 'warn');
      return null;
    }
  }
  function recStart() {
    if (!rec.stream) return false;
    try {
      rec.chunks = [];
      const r = new MediaRecorder(rec.stream);
      r.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
      r.start();
      rec.recorder = r;
      return true;
    } catch (e) {
      console.warn('[ielts-speaking] 录音启动失败', e);
      NCE.toast('录音启动失败，本题只计时', 'warn');
      rec.recorder = null;
      return false;
    }
  }
  // 停止录音，返回回听用的 blob URL（无录音时为 null）
  function recStop() {
    const r = rec.recorder;
    rec.recorder = null;
    if (!r || r.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      r.onstop = () => {
        const blob = new Blob(rec.chunks, { type: r.mimeType || 'audio/webm' });
        rec.chunks = [];
        if (!blob.size) {
          resolve(null);
          return;
        }
        const url = URL.createObjectURL(blob);
        rec.urls.push(url);
        resolve(url);
      };
      r.onerror = () => resolve(null);
      try { r.stop(); } catch (e) { resolve(null); }
    });
  }
  function revokeUrl(url) {
    if (!url) return;
    try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
    rec.urls = rec.urls.filter((u) => u !== url);
  }
  // 关麦（停掉音轨，浏览器的录音指示随之消失），可选同时释放全部录音
  function releaseMic(dropRecordings) {
    const r = rec.recorder;
    rec.recorder = null;
    if (r && r.state !== 'inactive') {
      r.onstop = null;
      try { r.stop(); } catch (e) { /* ignore */ }
    }
    rec.chunks = [];
    if (rec.stream) {
      rec.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* ignore */ } });
      rec.stream = null;
    }
    if (dropRecordings) {
      rec.urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
      rec.urls = [];
    }
  }
  function endSession() {
    clearTimer();
    stopTts();
    releaseMic(true);
    st.session = null;
    st.form = null;
    st.result = null;
  }

  // ---------- 列表 ----------
  async function renderList() {
    endSession();
    st.stage = 'list';
    const part = st.listPart;
    root.innerHTML =
      '<div class="ie-row chips ies-parts">' +
      `<div class="chip${part === '1' ? ' active' : ''}" data-p="1">Part 1 · 日常问答</div>` +
      `<div class="chip${part === '2' ? ' active' : ''}" data-p="2">Part 2 + 3 · 题卡与追问</div>` +
      '</div>' +
      recNoteHtml() +
      '<div class="ies-list"><div class="ie-loading">正在加载口语题目…</div></div>';
    root.querySelectorAll('.ies-parts .chip').forEach((c) => {
      c.onclick = () => {
        if (c.dataset.p === st.listPart) return;
        st.listPart = c.dataset.p;
        renderList();
      };
    });
    const box = root.querySelector('.ies-list');
    if (!st.lists[part]) {
      try {
        const r = await IE.get('/api/ielts/speaking?part=' + encodeURIComponent(part));
        st.lists[part] = Array.isArray(r) ? r : (r && Array.isArray(r.items) ? r.items : []);
      } catch (e) {
        if (!alive() || st.stage !== 'list' || st.listPart !== part) return;
        box.innerHTML = IE.errorHtml('口语题目加载失败', e);
        IE.bindRetry(box, renderList);
        return;
      }
      if (!alive() || st.stage !== 'list' || st.listPart !== part) return;
    }
    const items = st.lists[part];
    box.innerHTML = items.length
      ? items.map((it) => {
        let title;
        let sub;
        if (Number(it.part) === 2) {
          title = (it.cueCard && it.cueCard.title) || it.id;
          const n = it.part3Count != null ? it.part3Count : Array.isArray(it.part3) ? it.part3.length : null;
          sub = [CATEGORY_LABEL[it.category] || it.category, n != null ? `Part 3 追问 ${n} 题` : ''].filter(Boolean).join(' · ');
        } else {
          title = [it.topic, it.topicCn].filter(Boolean).join(' · ') || it.id;
          const n = it.questionCount != null ? it.questionCount : Array.isArray(it.questions) ? it.questions.length : null;
          sub = n != null ? `${n} 题` : '';
        }
        return `<div class="ies-item" data-id="${escAttr(it.id)}"><div class="ies-item-t">${esc(title)}</div>${sub ? `<div class="ies-item-s">${esc(sub)}</div>` : ''}</div>`;
      }).join('')
      : '<div class="ie-empty">暂时没有题目。</div>';
    box.querySelectorAll('.ies-item').forEach((el) => {
      el.onclick = () => openItem(el.dataset.id);
    });
  }

  // ---------- 练习 ----------
  async function openItem(id) {
    endSession();
    st.stage = 'run';
    root.innerHTML = '<div class="ie-loading">正在加载题目…</div>';
    let item;
    try {
      item = await IE.get('/api/ielts/speaking/' + encodeURIComponent(id));
    } catch (e) {
      if (!alive() || st.stage !== 'run') return;
      root.innerHTML = '<div class="ies-top"><button type="button" class="btn small ghost ies-back">← 题目列表</button></div>' + IE.errorHtml('题目加载失败', e);
      root.querySelector('.ies-back').onclick = renderList;
      IE.bindRetry(root, () => openItem(id));
      return;
    }
    if (!alive() || st.stage !== 'run') return;
    const part = Number(item.part) === 2 ? 2 : 1;
    let steps;
    if (part === 2) {
      steps = [{ part: 2, cue: item.cueCard || {}, sample: item.sample || '' }].concat(
        (Array.isArray(item.part3) ? item.part3 : []).filter((x) => x && x.q).map((x) => ({ part: 3, q: x.q, sample: x.sample || '' }))
      );
    } else {
      steps = (Array.isArray(item.questions) ? item.questions : []).filter((x) => x && x.q).map((x) => ({ part: 1, q: x.q, sample: x.sample || '' }));
    }
    if (!steps.length) {
      root.innerHTML = '<div class="ies-top"><button type="button" class="btn small ghost ies-back">← 题目列表</button></div><div class="ie-empty">这个条目没有题目内容。</div>';
      root.querySelector('.ies-back').onclick = renderList;
      return;
    }
    steps.forEach((s) => { s.state = 'ready'; s.durationSec = 0; s.audioUrl = null; });
    st.session = { item, part, idx: 0, steps, notes: '' };
    renderStep();
  }

  function sessionTitle() {
    const s = st.session;
    if (s.part === 2) return 'Part 2 + 3 · ' + ((s.item.cueCard && s.item.cueCard.title) || s.item.id);
    return 'Part 1 · ' + ([s.item.topic, s.item.topicCn].filter(Boolean).join(' · ') || s.item.id);
  }

  function renderStep() {
    const s = st.session;
    const step = s.steps[s.idx];
    const isLast = s.idx === s.steps.length - 1;
    const p3Count = s.steps.filter((x) => x.part === 3).length;
    const p3Idx = step.part === 3 ? s.steps.slice(0, s.idx + 1).filter((x) => x.part === 3).length : 0;
    let progress;
    if (step.part === 2) progress = 'Part 2 题卡';
    else if (step.part === 3) progress = `Part 3 追问 第 ${p3Idx} / ${p3Count} 题`;
    else progress = `第 ${s.idx + 1} / ${s.steps.length} 题`;

    let body;
    if (step.part === 2) {
      const cue = step.cue || {};
      const points = Array.isArray(cue.points) ? cue.points.filter(Boolean) : [];
      body =
        '<div class="ies-cue">' +
        `<div class="t">${esc(cue.title || '')} ${spk(cue.title)}</div>` +
        (points.length ? `<div class="say">You should say:</div><ul>${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '') +
        (cue.final ? `<div class="fin">${esc(cue.final)}</div>` : '') +
        '</div>';
    } else {
      body = `<div class="ies-q">${esc(step.q)} ${spk(step.q)}</div>`;
    }

    let clock = '';
    let actions = '';
    if (step.state === 'ready') {
      if (step.part === 2) {
        clock = `<div class="ies-clock prep">${IE.fmtClock(PREP_SEC)}</div><div class="ies-phase">先准备 1 分钟（可记笔记），再连续说 2 分钟</div>`;
        actions = '<button type="button" class="btn primary ies-prep">开始准备（60 秒）</button><button type="button" class="btn small ghost ies-talk">跳过准备，直接作答</button>';
      } else {
        clock = `<div class="ies-clock">00:00</div><div class="ies-phase">${esc(HINT[step.part] || '')}</div>`;
        actions = '<button type="button" class="btn primary ies-talk">🎙 开始作答</button>';
      }
    } else if (step.state === 'prep') {
      clock = '<div class="ies-clock prep ies-live"></div><div class="ies-phase">准备中：想好要说的几个点，时间到自动开始作答</div>';
      actions = '<button type="button" class="btn primary ies-talk">准备好了，开始作答</button>';
    } else if (step.state === 'talk') {
      clock = '<div class="ies-clock talk ies-live"></div><div class="ies-phase ies-live-phase"></div>';
      actions = `<button type="button" class="btn primary ies-stop">⏹ ${step.part === 2 ? '结束作答' : '结束本题'}</button>`;
    } else {
      clock = `<div class="ies-phase">本题用时 ${esc(IE.fmtDuration(step.durationSec))}${step.audioUrl ? '' : ' · 未录音'}</div>` +
        (step.audioUrl ? `<audio class="ies-audio" controls src="${escAttr(step.audioUrl)}"></audio>` : '') +
        sampleHtml(step.sample, step.part === 2 ? '参考答案（Part 2）' : '参考答案');
      const nextLabel = isLast ? '去自评 →' : step.part === 2 ? '进入 Part 3 追问 →' : '下一题 →';
      actions = `<button type="button" class="btn primary ies-next">${nextLabel}</button><button type="button" class="btn small ies-redo">重答本题</button>`;
    }

    root.innerHTML =
      '<div class="ies-top">' +
      '<button type="button" class="btn small ghost ies-back">← 题目列表</button>' +
      `<span class="t">${esc(sessionTitle())}</span><span class="ie-pill">${esc(progress)}</span>` +
      '</div>' +
      recNoteHtml() +
      '<div class="ie-card">' + body + clock +
      (step.part === 2 && (step.state === 'prep' || step.state === 'talk')
        ? `<textarea class="ie-input ies-notes" placeholder="准备笔记（只在本页，不提交）">${esc(s.notes)}</textarea>`
        : '') +
      `<div class="ies-actions">${actions}</div>` +
      '</div>';

    bindSpk(root);
    root.querySelector('.ies-back').onclick = renderList;
    const notes = root.querySelector('.ies-notes');
    if (notes) notes.oninput = () => { s.notes = notes.value; };
    const prep = root.querySelector('.ies-prep');
    if (prep) prep.onclick = () => startPrep(step);
    const talk = root.querySelector('.ies-talk');
    if (talk) talk.onclick = () => startTalk(step);
    const stop = root.querySelector('.ies-stop');
    if (stop) stop.onclick = () => stopTalk(step);
    const next = root.querySelector('.ies-next');
    if (next) {
      next.onclick = () => {
        if (isLast) renderScore();
        else {
          s.idx++;
          renderStep();
        }
      };
    }
    const redo = root.querySelector('.ies-redo');
    if (redo) {
      redo.onclick = () => {
        revokeUrl(step.audioUrl);
        step.audioUrl = null;
        step.durationSec = 0;
        step.state = 'ready';
        renderStep();
      };
    }
    if (step.state === 'prep' || step.state === 'talk') paintClock(step);
  }

  function paintClock(step) {
    const el = root && root.querySelector('.ies-live');
    if (!el) return;
    const elapsed = (Date.now() - step.phaseStart) / 1000;
    if (step.state === 'prep') {
      el.textContent = IE.fmtClock(Math.max(0, PREP_SEC - elapsed));
      return;
    }
    const phase = root.querySelector('.ies-live-phase');
    if (step.part === 2) {
      const left = TALK_SEC - elapsed;
      el.textContent = left >= 0 ? IE.fmtClock(left) : '+' + IE.fmtClock(-left);
      el.className = 'ies-clock ies-live ' + (left >= 0 ? 'talk' : 'over');
      if (phase) {
        phase.innerHTML = (rec.recorder ? '<span class="ies-recdot"></span>录音中 · ' : '') +
          (left >= 0 ? '连续说满 2 分钟' : '2 分钟到了，考试中考官会在这里打断你，可以收尾了');
      }
    } else {
      el.textContent = IE.fmtClock(elapsed);
      if (phase) phase.innerHTML = (rec.recorder ? '<span class="ies-recdot"></span>录音中 · ' : '') + esc(HINT[step.part] || '');
    }
  }

  async function startPrep(step) {
    stopTts();
    // 准备阶段就申请麦克风（有用户点击），准备结束时才能自动开录
    await ensureMic();
    if (!alive() || !st.session || st.stage !== 'run') {
      releaseMic(false);
      return;
    }
    step.state = 'prep';
    step.phaseStart = Date.now();
    renderStep();
    clearTimer();
    st.timer = setInterval(() => {
      if (!alive()) return;
      if ((Date.now() - step.phaseStart) / 1000 >= PREP_SEC) {
        NCE.toast('准备时间到，开始作答（2 分钟）', 'ok');
        startTalk(step);
        return;
      }
      paintClock(step);
    }, 250);
  }

  async function startTalk(step) {
    clearTimer();
    stopTts();
    await ensureMic();
    if (!alive() || !st.session || st.stage !== 'run') {
      releaseMic(false);
      return;
    }
    recStart();
    step.state = 'talk';
    step.phaseStart = Date.now();
    step.overWarned = false;
    renderStep();
    st.timer = setInterval(() => {
      if (!alive()) return;
      if (step.part === 2 && !step.overWarned && (Date.now() - step.phaseStart) / 1000 >= TALK_SEC) {
        step.overWarned = true;
        NCE.toast('⏰ 2 分钟到了（考试中考官会在这里打断），可以结束作答', 'warn');
      }
      paintClock(step);
    }, 250);
  }

  async function stopTalk(step) {
    clearTimer();
    step.durationSec = Math.max(1, Math.round((Date.now() - step.phaseStart) / 1000));
    const stopBtn = root.querySelector('.ies-stop');
    if (stopBtn) stopBtn.disabled = true;
    const url = await recStop();
    if (!st.session || st.stage !== 'run') {
      revokeUrl(url);
      return;
    }
    step.audioUrl = url;
    step.state = 'done';
    if (alive()) renderStep();
  }

  // ---------- 自评 ----------
  function totalDuration() {
    return st.session.steps.reduce((n, s) => n + (Number(s.durationSec) || 0), 0);
  }

  async function renderScore() {
    clearTimer();
    stopTts();
    releaseMic(false); // 作答结束就关麦，录音保留用于回听
    st.stage = 'score';
    const s = st.session;
    const answered = s.steps.filter((x) => x.state === 'done').length;
    root.innerHTML =
      '<div class="ies-top">' +
      '<button type="button" class="btn small ghost ies-back">← 放弃本次，回题目列表</button>' +
      `<span class="t">${esc(sessionTitle())} · 自评</span>` +
      '</div>' +
      '<div class="ie-card">' +
      `<h3>⏱ 本次作答 <span class="ie-h3-sub">${answered} / ${s.steps.length} 题 · 共 ${esc(IE.fmtDuration(totalDuration()))}</span></h3>` +
      '<div class="ies-steps">' + stepsReviewHtml() + '</div>' +
      '</div>' +
      '<div class="ie-card">' +
      '<h3>⚖️ 四维自评</h3>' +
      '<div class="ie-note" style="margin-bottom:12px">回听录音，对照每档描述和自查清单给四个维度各选一个分（4–9 分，0.5 一档）。总分取平均后<b>向下取整到 0.5</b>。</div>' +
      '<div class="ies-form"><div class="ie-loading">正在加载评分说明…</div></div>' +
      '<textarea class="ie-input ies-notes ies-review" maxlength="1000" placeholder="备注（可选）：这次卡壳的地方、想换的表达…"></textarea>' +
      '<div class="ie-row" style="margin-top:14px"><button type="button" class="btn primary ies-submit" disabled>提交自评</button><span class="ie-msg ies-msg"></span></div>' +
      '</div>';
    bindSpk(root);
    root.querySelector('.ies-back').onclick = renderList;
    const { dims, fallback, error } = await IE.rubricDims('speaking');
    if (!alive() || st.stage !== 'score') return;
    const formEl = root.querySelector('.ies-form');
    st.form = IE.mountScoreForm(formEl, dims);
    if (fallback) {
      formEl.insertAdjacentHTML('afterbegin', `<div class="ie-warn" style="margin-bottom:10px">评分说明暂时加载不了（${esc(error ? error.message : '未知原因')}），先按维度名称自评，提交不受影响。</div>`);
    }
    const btn = root.querySelector('.ies-submit');
    btn.disabled = false;
    btn.onclick = () => submit(btn);
  }

  function stepsReviewHtml() {
    return st.session.steps.map((x) => {
      const q = x.part === 2 ? 'Part 2：' + ((x.cue && x.cue.title) || '') : `Part ${x.part}：${x.q}`;
      return (
        '<div class="ies-step">' +
        `<div class="ies-step-q">${esc(q)}</div>` +
        `<div class="ies-step-s">${x.state === 'done' ? `用时 ${esc(IE.fmtDuration(x.durationSec))}${x.audioUrl ? '' : ' · 未录音'}` : '未作答'}</div>` +
        (x.audioUrl ? `<audio class="ies-audio" controls src="${escAttr(x.audioUrl)}"></audio>` : '') +
        sampleHtml(x.sample, '参考答案') +
        '</div>'
      );
    }).join('');
  }

  async function submit(btn) {
    const msg = root.querySelector('.ies-msg');
    const scores = st.form && st.form.getScores();
    if (!scores) {
      msg.className = 'ie-msg ies-msg bad';
      msg.textContent = '还有维度没打分：' + (st.form ? st.form.missing().join('、') : '');
      return;
    }
    const s = st.session;
    const notes = (root.querySelector('.ies-review').value || '').trim();
    btn.disabled = true;
    msg.className = 'ie-msg ies-msg';
    msg.textContent = '提交中…';
    let r;
    try {
      // Part 2 + 3 作为一次练习提交（part 取条目本身的 2），时长为各题作答时间之和
      r = await IE.post('/api/ielts/speaking/submit', {
        itemId: s.item.id,
        part: s.part,
        durationSec: totalDuration(),
        selfScores: scores,
        notes,
      });
    } catch (e) {
      if (!alive() || st.stage !== 'score') return;
      btn.disabled = false;
      msg.className = 'ie-msg ies-msg bad';
      msg.textContent = '提交失败：' + e.message + '，可以重试';
      return;
    }
    if (!alive() || st.stage !== 'score') return;
    st.result = { r: r || {}, scores, notes };
    renderResult();
  }

  function renderResult() {
    st.stage = 'result';
    const { r, scores } = st.result;
    const vals = Object.values(scores);
    const band = Number.isFinite(Number(r.band)) ? Number(r.band) : IE.floorHalf(vals.reduce((a, b) => a + b, 0) / vals.length);
    root.innerHTML =
      '<div class="ies-top">' +
      '<button type="button" class="btn small ghost ies-back">← 题目列表</button>' +
      `<span class="t">${esc(sessionTitle())} · 结果</span>` +
      '</div>' +
      '<div class="ie-card">' +
      `<div class="ies-band"><span class="ie-muted">自评 Band</span><b>${esc(IE.fmtBand(band))}</b></div>` +
      `<div style="font-size:14px;color:var(--ink-soft);margin-top:6px">${Object.keys(scores).map((k) => `${esc(k)} ${esc(IE.fmtBand(scores[k]))}`).join(' · ')}</div>` +
      `<div class="ie-muted" style="margin-top:4px">作答共 ${esc(IE.fmtDuration(totalDuration()))}</div>` +
      '</div>' +
      '<div class="ie-card">' +
      '<h3>🎧 回听与参考答案 <span class="ie-h3-sub">录音只在本页内存，离开口语页就释放</span></h3>' +
      `<div class="ies-steps">${stepsReviewHtml()}</div>` +
      '</div>' +
      '<div class="ie-row" style="margin-top:14px">' +
      '<button type="button" class="btn primary ies-again">再练一个</button>' +
      '<button type="button" class="btn ies-redo-all">重练本题</button>' +
      '</div>';
    bindSpk(root);
    const id = st.session.item.id;
    root.querySelector('.ies-back').onclick = renderList;
    root.querySelector('.ies-again').onclick = renderList;
    root.querySelector('.ies-redo-all').onclick = () => openItem(id);
  }

  IE.registerPage('speaking', {
    render(body, c) {
      root = body;
      ctx = c;
      renderList();
    },
    // 自评 / 结果阶段切走再回来保留现场（录音还在内存）；作答中切走则整轮结束
    resume() {
      return !!(root && root.isConnected && (st.stage === 'score' || st.stage === 'result') && st.session);
    },
    pause() {
      if (st.stage === 'score' || st.stage === 'result') {
        releaseMic(false);
        return;
      }
      endSession();
      st.stage = 'list';
    },
    leave() {
      endSession();
      st.stage = 'list';
    },
  });
})();
