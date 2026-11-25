'use strict';
// 雅思备考 · 口语子页：Part 1 逐题作答；Part 2 准备 60 秒 → 作答 120 秒（到时只提示）→ Part 3 追问；最后四维自评。
// 录音按 D4 只存在浏览器内存（MediaRecorder + blob URL），不上传不落盘；不支持或被拒绝时降级为只计时。
// 作答时另用 Web Speech API 实时转写（Chrome 需联网，语音由浏览器发往在线识别服务），结束后统计流利度指标，
// 只作 FC 自评参考、不自动打分；不支持 / 离线 / 被拒绝时降级为只录音。转写与指标随自评一起提交。
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

  // ---- 实时转写与流利度统计的口径 ----
  // 与情景对话一致用 en-US：Chrome 对 en-GB 的识别支持较差（口音不影响，只是识别模型）
  const ASR_LANG = 'en-US';
  const LONG_PAUSE_MS = 3000; // 相邻两次识别结果的间隔超过 3 秒算一次长停顿
  const MAX_TRANSCRIPT = 6000; // 与后端 lib/ielts.js 的 MAX_TRANSCRIPT 一致
  // 与后端指标白名单的上限一致；极端值（如只说了 1 秒）夹到上限，避免整份自评提交被 400
  const METRIC_CAP = { words: 20000, wpm: 600, fillers: 5000, repeats: 5000, longPauses: 2000, connectives: 5000 };
  const DEFAULT_FILLERS = ['um', 'uh', 'er', 'like', 'you know', 'I mean', 'actually', 'basically'];
  const MAX_FILLERS = 30;
  const NO_RESULT_MSG = '没有识别到内容：如果确实开口说了，可能是语音识别服务没有响应（Chrome 需要联网），只有录音、不计流利度。';
  // 连接词与复杂句标记；不含 and、so、but、then 这类最基础的连接（FC 自查清单要的是「不只是 and、so」）
  const CONNECTIVES = [
    'because', 'although', 'though', 'even though', 'whereas', 'while', 'which', 'who', 'whose', 'whom',
    'if', 'unless', 'whether', 'when', 'since', 'so that', 'in order to', 'as long as', 'as soon as',
    'however', 'therefore', 'moreover', 'furthermore', 'besides', 'otherwise', 'instead', 'meanwhile',
    'nevertheless', 'consequently', 'on the other hand', 'in addition', 'as a result', 'for example',
    'for instance', 'such as', 'on top of that', 'what i mean is', 'in contrast', 'despite', 'in spite of',
    'apart from', 'as well as', 'not only',
  ];
  // like 作动词 / 介词时不算填充词：前一个词或后一个词命中下面的表（或后一个词是 -ing）就跳过，启发式
  const LIKE_PREV_SKIP = new Set([
    'i', 'you', 'we', 'they', 'he', 'she', 'people', 'kids', 'children', 'students', 'friends', 'parents',
    'would', "i'd", "you'd", "we'd", "they'd", "he'd", "she'd", 'do', 'does', 'did', "don't", "doesn't", "didn't",
    'not', 'really', 'also', 'still', 'always', 'usually', 'never', 'just', 'to', 'look', 'looks', 'looked',
    'looking', 'feel', 'feels', 'felt', 'sound', 'sounds', 'sounded', 'seem', 'seems', 'seemed', 'something',
    'anything', 'nothing', 'everything', 'things', 'stuff', 'much', 'more', 'most',
  ]);
  const LIKE_NEXT_SKIP = new Set([
    'a', 'an', 'the', 'this', 'that', 'these', 'those', 'it', 'them', 'him', 'her', 'me', 'us', 'you', 'my',
    'your', 'his', 'their', 'our', 'its', 'to', 'what', 'how', 'some', 'any', 'many', 'all', 'other', 'each', 'every',
  ]);

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
    .ies-rec-note + .ies-rec-note{margin-top:-8px}
    .ies-asr-sw{font-weight:600;cursor:pointer;white-space:nowrap}
    .ies-asr-sw input{vertical-align:-2px;margin:0 4px 0 0}
    .ies-tx{margin-top:12px;padding:10px 12px;border:1px solid var(--border-soft);border-radius:var(--radius-sm);background:rgba(127,127,127,.04);font-size:15px;line-height:1.7;color:var(--ink);max-height:240px;overflow:auto;overflow-wrap:anywhere}
    .ies-tx .im{color:var(--muted)}
    .ies-tx .st{display:block;font-size:12.5px;color:var(--muted);margin-bottom:2px}
    .ies-tx .st.off{color:#d97706}
    .ies-mline{font-size:12.5px;color:var(--muted);margin-top:6px}
    .ies-step .ies-tx{font-size:14px;margin-top:8px}
    .ies-step details summary{cursor:pointer;color:var(--brand);font-size:13px;font-weight:600;margin-top:6px}
    .ies-mgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px}
    .ies-mgrid div{border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:8px 10px}
    .ies-mgrid b{display:block;font-size:20px;font-weight:800;color:var(--ink);line-height:1.2}
    .ies-mgrid span{font-size:12px;color:var(--muted)}
    .ies-fc{margin-top:12px;display:flex;flex-direction:column;gap:8px}
    .ies-fc-row{font-size:13.5px;color:var(--ink-soft);line-height:1.65;border-left:3px solid var(--border);padding-left:10px}
    .ies-fc-row .ref{color:var(--muted)}
    .ies-fcfg{margin-top:10px;font-size:13px}
    .ies-fcfg summary{cursor:pointer;color:var(--brand);font-weight:600}
    .ies-fcfg .ie-input{width:100%;margin-top:8px}
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
    fc: null, // rubrics 里 speaking FC 的 checklist（流利度指标的对照文字），自评页加载
  };
  // 录音状态（只在内存）
  const rec = { stream: null, recorder: null, chunks: [], urls: [], denied: false };
  let micPending = null; // 进行中的 getUserMedia（Promise），多次 ensureMic 共用
  // 语音识别状态：同一时刻最多一个识别实例（asr.rec），只服务于正在作答的那一题（asr.step）
  const asr = {
    rec: null,
    step: null,
    startedAt: 0,
    quickEnds: 0, // 连续「刚启动就结束」的次数，超过上限就不再自动重启，防止重启风暴
    blocked: null, // { code, msg, sticky }：识别失败后的降级原因；sticky 表示本页不再尝试，否则只到本轮结束
    warned: false, // 本轮已经弹过降级提示
  };
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
  // lockAsr：准备 / 作答中不允许切换转写开关（避免作答到一半开关识别器）
  function recNoteHtml(lockAsr) {
    return recLineHtml() + asrNoteHtml(lockAsr);
  }
  function recLineHtml() {
    if (!CAN_RECORD) return '<div class="ies-rec-note off">⚠️ 当前浏览器或访问方式不支持录音（需要 HTTPS 或 localhost），本次只计时。</div>';
    if (rec.denied) return '<div class="ies-rec-note off">⚠️ 麦克风不可用（权限被拒绝或没有设备），本次只计时；在地址栏重新允许麦克风后刷新即可录音。</div>';
    return '<div class="ies-rec-note">🎙 作答时自动录音，录音只保存在本页内存里用于回听，不上传、不落盘，离开口语页就释放。</div>';
  }
  function asrNoteHtml(lock) {
    const a = asrAvailability();
    if (a.code === 'unsupported') return `<div class="ies-rec-note off">⚠️ ${esc(a.msg)}</div>`;
    const sw = `<label class="ies-asr-sw"><input type="checkbox" class="ies-asr-toggle"${asrEnabled() ? ' checked' : ''}${lock ? ' disabled' : ''}>实时转写</label>`;
    if (a.ok) {
      return `<div class="ies-rec-note">📝 ${sw}：作答时用浏览器语音识别（${esc(ASR_LANG)}）实时显示文字，结束后统计流利度。Chrome 的识别需要联网，语音会由浏览器发送到在线识别服务。</div>`;
    }
    if (a.code === 'off') return `<div class="ies-rec-note">📝 ${sw}：已关闭，作答只录音、不统计流利度。</div>`;
    return `<div class="ies-rec-note off">⚠️ ${sw}：${esc(a.msg)}</div>`;
  }
  function bindAsrToggle(el) {
    const box = el.querySelector('.ies-asr-toggle');
    if (!box) return;
    box.onchange = () => {
      writePref('speaking-asr', box.checked);
      const note = box.closest('.ies-rec-note');
      if (!note) return;
      note.insertAdjacentHTML('afterend', asrNoteHtml(false));
      note.remove();
      bindAsrToggle(el);
    };
  }
  // 申请麦克风；权限弹窗期间的多次调用共用同一次 getUserMedia，避免拿到多个 stream（只有最后一个会被释放）
  function ensureMic() {
    if (!CAN_RECORD || rec.denied) return Promise.resolve(null);
    if (rec.stream) return Promise.resolve(rec.stream);
    if (micPending) return micPending;
    micPending = navigator.mediaDevices.getUserMedia({ audio: true }).then(
      (stream) => {
        rec.stream = stream;
        return stream;
      },
      (e) => {
        rec.denied = true;
        console.warn('[ielts-speaking] 麦克风不可用', e);
        NCE.toast('麦克风不可用（' + (e && e.name === 'NotAllowedError' ? '权限被拒绝' : '没有设备或被占用') + '），本次只计时', 'warn');
        return null;
      }
    ).finally(() => {
      micPending = null;
    });
    return micPending;
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

  // ---------- 本地设置（按档案隔离；localStorage 不可用时退回内存，只在本次有效）----------
  const prefMem = {};
  function readPref(name, fallback) {
    if (Object.prototype.hasOwnProperty.call(prefMem, name)) return prefMem[name];
    try {
      const v = localStorage.getItem(IE.storeKey(name));
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      console.warn('[ielts-speaking] 读取本地设置失败', name, e);
      return fallback;
    }
  }
  function writePref(name, value) {
    try {
      if (value == null) localStorage.removeItem(IE.storeKey(name));
      else localStorage.setItem(IE.storeKey(name), JSON.stringify(value));
      delete prefMem[name];
    } catch (e) {
      console.warn('[ielts-speaking] 保存本地设置失败', name, e);
      prefMem[name] = value;
      NCE.toast('设置没能存到本地（浏览器存储不可用），只在本次打开期间有效', 'warn');
    }
  }

  // ---------- 实时转写（Web Speech API）----------
  function recCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }
  function asrEnabled() {
    // 默认关闭：开启后 Chrome 会把作答语音发到 Google 语音识别服务，需用户主动打开（设计 D4：录音不上传）
    return readPref('speaking-asr', false) === true;
  }
  // 现在能不能开转写；不能时给出降级原因（只录音）
  function asrAvailability() {
    if (!recCtor()) return { ok: false, code: 'unsupported', msg: '当前浏览器不支持语音识别（Web Speech API），作答只录音、不转写；Chrome 或 Edge 可用。' };
    if (!asrEnabled()) return { ok: false, code: 'off', msg: '实时转写默认关闭，作答只录音。勾选「实时转写」可开启：开启后 Chrome 会把作答语音发送到 Google 语音识别服务（需联网），录音文件本身仍只留在本页内存。' };
    if (asr.blocked) return { ok: false, code: asr.blocked.code, msg: asr.blocked.msg };
    const needNet = typeof NCE.speechRecNeedsNetwork === 'function' ? NCE.speechRecNeedsNetwork() : true;
    const online = typeof NCE.isOnline === 'function' ? NCE.isOnline() : navigator.onLine;
    if (needNet && !online) return { ok: false, code: 'offline', msg: '当前离线：Chrome 的语音识别需要联网，作答只录音、不转写。' };
    return { ok: true, code: 'ok', msg: '' };
  }
  function asrErrorMsg(code) {
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      return '语音识别被拒绝（麦克风权限或浏览器的识别服务不可用），只录音不转写；在地址栏允许麦克风后刷新可重试。';
    }
    if (code === 'network') return '语音识别连不上在线服务（Chrome 的识别需要联网），本轮只录音不转写。';
    if (code === 'audio-capture') return '语音识别拿不到麦克风（没有设备或被占用），本轮只录音不转写。';
    if (code === 'language-not-supported') return `浏览器的语音识别不支持 ${ASR_LANG}，只录音不转写。`;
    if (code === 'restart-loop') return '语音识别反复中断，本轮后面只录音不转写。';
    if (code === 'init-failed' || code === 'start-failed') return '语音识别启动失败，本轮只录音不转写。';
    return `语音识别出错（${code}），本轮只录音不转写。`;
  }
  // 每题一份：committed 为已结束的识别会话文字，sessFinal / sessInterim 为当前会话的定稿和未定稿部分
  function newAsrState() {
    return { started: false, gotResult: false, fatal: '', error: '', committed: '', sessFinal: '', sessInterim: '', lastAt: 0, longPauses: 0 };
  }
  function squash(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }
  function stepText(step) {
    const a = step.asr;
    return a ? squash(`${a.committed} ${a.sessFinal} ${a.sessInterim}`) : '';
  }
  // 本题有可用的转写：至少收到过一次识别结果。识别器开着却一直没结果（没开口，或识别服务没响应）不算，不出指标
  function hasAsr(step) {
    return !!(step.asr && step.asr.gotResult);
  }
  // 把当前识别会话的文字收进 committed；abort 不会再补发 final，所以未定稿的 interim 也一并保留
  function commitAsrSession(a) {
    a.committed = squash(`${a.committed} ${a.sessFinal} ${a.sessInterim}`);
    a.sessFinal = '';
    a.sessInterim = '';
  }
  function asrDetach(r) {
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
  }
  // 停止识别（abort：立即停、丢弃还没返回的结果）。pause / leave / 切题 / 交卷 / 结束作答都走这里，可重复调用
  function asrStop() {
    const r = asr.rec;
    const step = asr.step;
    asr.rec = null;
    asr.step = null;
    if (!r) return;
    if (step && step.asr) commitAsrSession(step.asr);
    asrDetach(r); // 先解绑：abort 之后异步到达的 error / end 事件不会再触发重启
    try { r.abort(); } catch (e) { /* 已停止的实例 abort 会抛，忽略 */ }
  }
  // 记下降级原因；sticky（权限 / 服务被拒）本页不再尝试，其余只到本轮结束
  function asrBlock(step, code, sticky) {
    const msg = asrErrorMsg(code);
    asr.blocked = { code, msg, sticky: !!sticky };
    if (step && step.asr) {
      step.asr.fatal = code;
      step.asr.error = msg;
    }
    if (!asr.warned) {
      asr.warned = true;
      NCE.toast(msg, 'warn');
    }
  }
  // 开始转写；不可用时只把原因记到 step.asr.error（本题只录音）。同一题不会重复启动
  function asrStart(step) {
    if (asr.rec) {
      if (asr.step === step) return;
      asrStop();
    }
    if (!step.asr) step.asr = newAsrState();
    const avail = asrAvailability();
    if (!avail.ok) {
      step.asr.error = avail.msg;
      if (avail.code !== 'off' && avail.code !== 'unsupported' && !asr.warned) {
        asr.warned = true;
        NCE.toast(avail.msg, 'warn');
      }
      paintTranscript(step);
      return;
    }
    let r;
    try {
      const Ctor = recCtor();
      r = new Ctor();
      r.lang = ASR_LANG;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
    } catch (e) {
      console.warn('[ielts-speaking] 语音识别初始化失败', e);
      asrBlock(step, 'init-failed', false);
      paintTranscript(step);
      return;
    }
    // 事件只在创建实例时绑定一次；Chrome 中途自己结束时复用同一实例重启，不重复绑定
    r.onresult = (ev) => onAsrResult(r, step, ev);
    r.onerror = (ev) => onAsrError(r, step, ev);
    r.onend = () => onAsrEnd(r, step);
    asr.rec = r;
    asr.step = step;
    asr.quickEnds = 0;
    asrBegin(r, step);
  }
  function asrBegin(r, step) {
    try {
      r.start();
      asr.startedAt = Date.now();
      step.asr.started = true;
    } catch (e) {
      console.warn('[ielts-speaking] 语音识别启动失败', e);
      asrStop();
      asrBlock(step, 'start-failed', false);
    }
    paintTranscript(step);
  }
  function asrStillTalking(step) {
    const s = st.session;
    return alive() && st.stage === 'run' && !!s && s.steps[s.idx] === step && step.state === 'talk';
  }
  function onAsrResult(r, step, ev) {
    if (asr.rec !== r) return;
    const a = step.asr;
    const now = Date.now();
    // 每个 result 事件（含 interim）都说明在出声；相邻两次间隔超过阈值记一次长停顿
    if (a.lastAt && now - a.lastAt > LONG_PAUSE_MS) a.longPauses++;
    a.lastAt = now;
    a.gotResult = true;
    // continuous 模式下 results 是本次识别会话的全部结果，每次整体重建定稿 / 未定稿两段
    let fin = '';
    let interim = '';
    const list = (ev && ev.results) || [];
    for (let i = 0; i < list.length; i++) {
      const res = list[i];
      const alt = res && res[0];
      const t = alt && typeof alt.transcript === 'string' ? alt.transcript : '';
      if (res && res.isFinal) fin += ' ' + t;
      else interim += ' ' + t;
    }
    a.sessFinal = squash(fin);
    a.sessInterim = squash(interim);
    paintTranscript(step);
  }
  function onAsrError(r, step, ev) {
    if (asr.rec !== r) return;
    const code = (ev && ev.error) || 'unknown';
    // aborted：浏览器自己中止；no-speech：一段时间没听到声音。两者都等 onend 自动重启
    if (code === 'aborted' || code === 'no-speech') return;
    console.warn('[ielts-speaking] 语音识别出错', code, ev && ev.message);
    const sticky = code === 'not-allowed' || code === 'service-not-allowed' || code === 'language-not-supported';
    asrBlock(step, code, sticky);
    paintTranscript(step);
  }
  function onAsrEnd(r, step) {
    if (asr.rec !== r) return;
    commitAsrSession(step.asr);
    if (step.asr.fatal || !asrStillTalking(step)) {
      asr.rec = null;
      asr.step = null;
      asrDetach(r);
      paintTranscript(step);
      return;
    }
    // Chrome 遇到长时间静音、网络抖动或单次时长上限会自己结束：作答还在继续就重启同一实例
    asr.quickEnds = Date.now() - asr.startedAt < 1500 ? asr.quickEnds + 1 : 0;
    if (asr.quickEnds >= 3) {
      asr.rec = null;
      asr.step = null;
      asrDetach(r);
      asrBlock(step, 'restart-loop', false);
      paintTranscript(step);
      return;
    }
    asrBegin(r, step);
  }
  // 作答中只刷新转写框，不整页重绘
  function paintTranscript(step) {
    const box = root && root.querySelector('.ies-tx-live');
    const s = st.session;
    if (!box || !s || s.steps[s.idx] !== step || step.state !== 'talk') return;
    box.innerHTML = liveTxHtml(step);
    box.scrollTop = box.scrollHeight;
  }
  function liveTxHtml(step) {
    const a = step.asr || newAsrState();
    let status;
    if (a.error) status = `<span class="st off">⚠️ ${esc(a.error)}</span>`;
    else if (asr.rec && asr.step === step) status = `<span class="st">📝 实时转写中（${esc(ASR_LANG)}）${a.gotResult ? '' : '，开口说就会出现文字'}</span>`;
    else status = '<span class="st">📝 正在启动语音识别…</span>';
    const fixed = squash(`${a.committed} ${a.sessFinal}`);
    return status + esc(fixed) + (a.sessInterim ? ` <span class="im">${esc(a.sessInterim)}</span>` : '');
  }

  // ---------- 流利度统计（输入转写文本，纯计算）----------
  function tokenize(text) {
    return String(text || '').toLowerCase().replace(/[‘’`]/g, "'").match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) || [];
  }
  // 短语表 → 按词数从长到短排好的词序列；扫描时优先匹配长短语（even though 不会再算一次 though）
  function compilePhrases(list) {
    const seen = new Set();
    const out = [];
    (Array.isArray(list) ? list : []).forEach((p) => {
      const toks = tokenize(p);
      const key = toks.join(' ');
      if (!toks.length || seen.has(key)) return;
      seen.add(key);
      out.push(toks);
    });
    return out.sort((a, b) => b.length - a.length);
  }
  const CONNECTIVE_PHRASES = compilePhrases(CONNECTIVES);
  // 不重叠地数短语出现次数；skip(key, tokens, i) 返回 true 表示这一处不算
  function scanPhrases(tokens, phrases, skip) {
    const counts = {};
    let total = 0;
    let i = 0;
    while (i < tokens.length) {
      const hit = phrases.find((p) => p.every((w, j) => tokens[i + j] === w));
      const key = hit ? hit.join(' ') : '';
      if (hit && !(skip && skip(key, tokens, i))) {
        counts[key] = (counts[key] || 0) + 1;
        total++;
        i += hit.length;
      } else {
        i++;
      }
    }
    return { total, counts };
  }
  function fillerSkip(key, tokens, i) {
    if (key === 'like') {
      const prev = tokens[i - 1];
      const next = tokens[i + 1];
      if (prev && LIKE_PREV_SKIP.has(prev)) return true;
      if (next && (LIKE_NEXT_SKIP.has(next) || /ing$/.test(next))) return true;
    }
    if (key === 'i mean' && tokens[i - 1] === 'what') return true; // What I mean is 是衔接语，不算填充
    return false;
  }
  function normalizeFillers(list) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((p) => {
      const key = tokenize(p).join(' ');
      if (!key || key.length > 40 || seen.has(key)) return;
      seen.add(key);
      out.push(key);
    });
    return out.slice(0, MAX_FILLERS);
  }
  // 填充词表可在自评页修改（存本地）；没存过或存的是空表时用默认表
  function fillerList() {
    const saved = normalizeFillers(readPref('speaking-fillers', null));
    return saved.length ? saved : normalizeFillers(DEFAULT_FILLERS);
  }
  // 一题的指标：词数、WPM、填充词、重复词（同一个词紧挨着出现）、长停顿、连接词 / 复杂句标记
  function stepFluency(step, fillerPhrases) {
    const tokens = tokenize(stepText(step));
    const f = scanPhrases(tokens, fillerPhrases, fillerSkip);
    const c = scanPhrases(tokens, CONNECTIVE_PHRASES);
    const repeatCounts = {};
    let repeats = 0;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i] !== tokens[i - 1]) continue;
      repeats++;
      repeatCounts[tokens[i]] = (repeatCounts[tokens[i]] || 0) + 1;
    }
    const sec = Number(step.durationSec) || 0;
    return {
      sec,
      words: tokens.length,
      wpm: sec > 0 ? Math.round(tokens.length / (sec / 60)) : 0,
      fillers: f.total,
      fillerCounts: f.counts,
      repeats,
      repeatCounts,
      longPauses: (step.asr && step.asr.longPauses) || 0,
      connectives: c.total,
      connectiveCounts: c.counts,
    };
  }
  function answeredWithAsr() {
    return st.session ? st.session.steps.filter((x) => x.state === 'done' && hasAsr(x)) : [];
  }
  // 整轮汇总：只统计有转写的题，WPM 与停顿折算都以这些题的作答时长为分母
  function sessionFluency() {
    const steps = answeredWithAsr();
    if (!steps.length) return null;
    const phrases = compilePhrases(fillerList());
    const agg = { steps: steps.length, sec: 0, words: 0, fillers: 0, repeats: 0, longPauses: 0, connectives: 0, fillerCounts: {}, repeatCounts: {}, connectiveCounts: {} };
    const merge = (dst, src) => Object.keys(src).forEach((k) => { dst[k] = (dst[k] || 0) + src[k]; });
    steps.forEach((x) => {
      const m = stepFluency(x, phrases);
      ['sec', 'words', 'fillers', 'repeats', 'longPauses', 'connectives'].forEach((k) => { agg[k] += m[k]; });
      merge(agg.fillerCounts, m.fillerCounts);
      merge(agg.repeatCounts, m.repeatCounts);
      merge(agg.connectiveCounts, m.connectiveCounts);
    });
    agg.wpm = agg.sec > 0 ? Math.round(agg.words / (agg.sec / 60)) : 0;
    return agg;
  }
  function metricsPayload(agg) {
    const out = {};
    Object.keys(METRIC_CAP).forEach((k) => {
      out[k] = Math.min(METRIC_CAP[k], Math.max(0, Math.round(Number(agg[k]) || 0)));
    });
    return out;
  }
  function stepLabel(step) {
    if (step.part === 2) return 'Part 2';
    const same = st.session.steps.filter((y) => y.part === step.part);
    return `Part ${step.part} Q${same.indexOf(step) + 1}`;
  }
  // 提交用的整轮转写：每题一段并标上题号，超过上限截断
  function transcriptPayload() {
    let text = answeredWithAsr()
      .map((x) => {
        const t = stepText(x);
        return t ? `[${stepLabel(x)}] ${t}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
    if (text.length > MAX_TRANSCRIPT) text = text.slice(0, MAX_TRANSCRIPT - 1) + '…';
    return text;
  }

  // ---------- 流利度展示 ----------
  function metricLineHtml(m) {
    return '<div class="ies-mline">' +
      esc([`${m.words} 词`, `${m.wpm} WPM`, `填充词 ${m.fillers}`, `重复 ${m.repeats}`, `长停顿 ${m.longPauses}`, `连接/复杂句 ${m.connectives}`].join(' · ')) +
      '</div>';
  }
  // 单题的转写和指标；collapsed 时收进 <details>（自评 / 结果页的逐题回顾）
  function stepTxHtml(step, collapsed) {
    if (!hasAsr(step)) {
      const a = step.asr;
      if (a && a.error) return `<div class="ies-mline">未转写：${esc(a.error)}</div>`;
      if (a && a.started) return `<div class="ies-mline">📝 ${esc(NO_RESULT_MSG)}</div>`;
      return '';
    }
    const m = stepFluency(step, compilePhrases(fillerList()));
    const text = stepText(step);
    const body =
      `<div class="ies-tx">${text ? esc(text) : '<span class="im">（没有识别到内容）</span>'}</div>` +
      metricLineHtml(m) +
      (step.asr.fatal ? `<div class="ies-mline">⚠️ ${esc(step.asr.error)}（转写只到出错前）</div>` : '');
    return collapsed ? `<details><summary>📝 转写 · ${m.words} 词</summary>${body}</details>` : body;
  }
  // rubrics 里 FC checklist 中与指标有关的几条（按关键词挑），挑不到就不显示对照
  function fcRefs(dims) {
    const fc = (Array.isArray(dims) ? dims : []).find((d) => d && d.key === 'FC');
    const list = fc && Array.isArray(fc.checklist) ? fc.checklist.filter((c) => typeof c === 'string' && c.trim()) : [];
    const pick = (re) => list.find((c) => re.test(c)) || '';
    return { pause: pick(/停顿/), filler: pick(/\bum\b|重说/i), connective: pick(/连接|过渡/) };
  }
  // 解析「2 分钟内…3 秒以上停顿 ≤1 次接近 7 分，2–4 次接近 6 分」的分档；格式对不上返回 null，只显示原文
  function parsePauseRule(text) {
    const m = /(\d+)\s*分钟内[^≤]*?秒以上停顿\s*≤\s*(\d+)\s*次接近\s*(\d+(?:\.\d+)?)\s*分[，,；;]\s*(\d+)\s*[–—~-]\s*(\d+)\s*次接近\s*(\d+(?:\.\d+)?)\s*分/.exec(text || '');
    if (!m) return null;
    return { windowMin: Number(m[1]), low: { max: Number(m[2]), band: m[3] }, mid: { min: Number(m[4]), max: Number(m[5]), band: m[6] } };
  }
  function parseKindsRule(text) {
    const m = /(\d+)\s*种以上/.exec(text || '');
    return m ? Number(m[1]) : null;
  }
  function topCounts(counts, n) {
    return Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))
      .slice(0, n)
      .map((k) => `${k} ×${counts[k]}`)
      .join('、');
  }
  function refHtml(text) {
    return text ? `<div class="ref">对照 FC 自查清单：${esc(text)}</div>` : '';
  }
  function noAsrReason() {
    const steps = st.session ? st.session.steps : [];
    const failed = steps.find((x) => x.asr && x.asr.error);
    if (failed) return failed.asr.error;
    if (steps.some((x) => x.asr && x.asr.started)) return NO_RESULT_MSG;
    const a = asrAvailability();
    return a.ok ? '没有作答或语音识别没有启动' : a.msg;
  }
  function fluencyCardHtml(agg, editable) {
    const head = '<h3>📊 流利度参考 <span class="ie-h3-sub">来自语音识别转写，只作 FC 自评参考，不自动打分</span></h3>';
    if (!agg) return head + `<div class="ie-muted">本次没有可用的转写（${esc(noAsrReason())}），流利度指标需要语音识别。</div>`;
    const grid = [
      [agg.words, '总词数'],
      [agg.wpm, '语速 WPM'],
      [agg.fillers, '填充词'],
      [agg.repeats, '重复词'],
      [agg.longPauses, '长停顿（>3 秒）'],
      [agg.connectives, '连接词 / 复杂句标记'],
    ].map(([v, l]) => `<div><b>${esc(String(v))}</b><span>${esc(l)}</span></div>`).join('');
    const refs = st.fc || {};
    const min = agg.sec / 60;
    // 长停顿：按清单的时间窗折算后对照分档
    const rule = parsePauseRule(refs.pause);
    const winMin = rule ? rule.windowMin : 2;
    const per = agg.sec > 0 ? agg.longPauses / (agg.sec / (winMin * 60)) : 0;
    let verdict = '';
    if (rule) {
      if (per <= rule.low.max) verdict = `，落在「≤${rule.low.max} 次 → 接近 ${rule.low.band} 分」一档`;
      else if (per <= rule.mid.max) verdict = `，落在「${rule.mid.min}–${rule.mid.max} 次 → 接近 ${rule.mid.band} 分」一档`;
      else verdict = `，超过清单里「接近 ${rule.mid.band} 分」一档的上限（${rule.mid.max} 次）`;
    }
    const pauseRow =
      `<b>长停顿</b>：${esc(String(agg.longPauses))} 次 / 有转写的作答 ${esc(IE.fmtDuration(agg.sec))}，折合每 ${esc(String(winMin))} 分钟 ${esc(per.toFixed(1))} 次${esc(verdict)}` +
      (agg.sec < 60 ? '（作答不到 1 分钟，折算波动大）' : '') + '。' + refHtml(refs.pause);
    const fTop = topCounts(agg.fillerCounts, 8);
    const rTop = topCounts(agg.repeatCounts, 6);
    const fillerRow =
      `<b>填充词 / 重复</b>：填充词 ${esc(String(agg.fillers))} 次（每分钟 ${esc(min > 0 ? (agg.fillers / min).toFixed(1) : '0')}）${fTop ? '：' + esc(fTop) : ''}；` +
      `重复词 ${esc(String(agg.repeats))} 次${rTop ? '：' + esc(rTop) : ''}。` + refHtml(refs.filler);
    const kinds = Object.keys(agg.connectiveCounts).length;
    const need = parseKindsRule(refs.connective);
    const cTop = topCounts(agg.connectiveCounts, 12);
    const connRow =
      `<b>连接与复杂句</b>：共 ${esc(String(agg.connectives))} 次、${esc(String(kinds))} 种${cTop ? '：' + esc(cTop) : ''}` +
      (need != null ? `，${kinds >= need ? '已达到' : '还没达到'}清单里的「${esc(String(need))} 种以上」` : '') + '。' + refHtml(refs.connective);
    const fillers = fillerList();
    return head +
      `<div class="ies-mgrid">${grid}</div>` +
      `<div class="ies-fc"><div class="ies-fc-row">${pauseRow}</div><div class="ies-fc-row">${fillerRow}</div><div class="ies-fc-row">${connRow}</div></div>` +
      (st.fc ? '' : '<div class="ie-muted" style="margin-top:8px">评分说明没有加载到，暂时没有 FC 清单对照。</div>') +
      '<div class="ie-muted" style="margin-top:8px">口径：词数按识别出的英文单词计；WPM = 词数 ÷ 有转写的作答时长；长停顿按相邻两次识别结果的间隔估算（识别有延迟，也分不出是不是在找词）；' +
      '识别服务常把 um、uh 过滤掉，填充词往往偏少；like 只在不像动词 / 介词用法时计入；重复词是同一个词紧挨着出现两次。</div>' +
      (editable
        ? '<details class="ies-fcfg"><summary>调整填充词（当前 ' + fillers.length + ' 个）</summary>' +
          `<input type="text" class="ie-input ies-fillers" maxlength="600" value="${escAttr(fillers.join(', '))}" aria-label="填充词，逗号分隔">` +
          '<div class="ie-row" style="margin-top:8px"><button type="button" class="btn small ies-fsave">保存并重算</button><button type="button" class="btn small ghost ies-freset">恢复默认</button></div>' +
          '</details>'
        : '');
  }
  // 重绘流利度卡片；editable 时同时刷新逐题回顾里的指标（填充词表改了会影响每题的数）
  function paintFluency(editable, keepOpen) {
    const card = root && root.querySelector('.ies-fluency');
    if (!card) return;
    card.innerHTML = fluencyCardHtml(sessionFluency(), editable);
    if (!editable) return;
    const cfg = card.querySelector('.ies-fcfg');
    if (cfg && keepOpen) cfg.open = true;
    const input = card.querySelector('.ies-fillers');
    if (!input) return;
    card.querySelector('.ies-fsave').onclick = () => {
      const list = normalizeFillers(input.value.split(/[,，、;；\n]+/));
      if (!list.length) {
        NCE.toast('至少填一个填充词；想用默认表请点「恢复默认」', 'warn');
        return;
      }
      writePref('speaking-fillers', list);
      repaintReview();
      paintFluency(true, true);
    };
    card.querySelector('.ies-freset').onclick = () => {
      writePref('speaking-fillers', null);
      repaintReview();
      paintFluency(true, true);
    };
  }
  function repaintReview() {
    const box = root && root.querySelector('.ies-steps');
    if (box && st.session) box.innerHTML = stepsReviewHtml();
  }

  function endSession() {
    clearTimer();
    stopTts();
    asrStop();
    releaseMic(true);
    // 非 sticky 的识别降级只管到本轮结束，下一轮重新尝试
    if (asr.blocked && !asr.blocked.sticky) asr.blocked = null;
    asr.warned = false;
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
      recNoteHtml(false) +
      '<div class="ies-list"><div class="ie-loading">正在加载口语题目…</div></div>';
    bindAsrToggle(root);
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
    steps.forEach((s) => { s.state = 'ready'; s.durationSec = 0; s.audioUrl = null; s.asr = null; });
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
      clock = '<div class="ies-clock talk ies-live"></div><div class="ies-phase ies-live-phase"></div>' +
        `<div class="ies-tx ies-tx-live">${liveTxHtml(step)}</div>`;
      actions = `<button type="button" class="btn primary ies-stop">⏹ ${step.part === 2 ? '结束作答' : '结束本题'}</button>`;
    } else {
      clock = `<div class="ies-phase">本题用时 ${esc(IE.fmtDuration(step.durationSec))}${step.audioUrl ? '' : ' · 未录音'}</div>` +
        (step.audioUrl ? `<audio class="ies-audio" controls src="${escAttr(step.audioUrl)}"></audio>` : '') +
        stepTxHtml(step, false) +
        sampleHtml(step.sample, step.part === 2 ? '参考答案（Part 2）' : '参考答案');
      const nextLabel = isLast ? '去自评 →' : step.part === 2 ? '进入 Part 3 追问 →' : '下一题 →';
      actions = `<button type="button" class="btn primary ies-next">${nextLabel}</button><button type="button" class="btn small ies-redo">重答本题</button>`;
    }

    root.innerHTML =
      '<div class="ies-top">' +
      '<button type="button" class="btn small ghost ies-back">← 题目列表</button>' +
      `<span class="t">${esc(sessionTitle())}</span><span class="ie-pill">${esc(progress)}</span>` +
      '</div>' +
      recNoteHtml(step.state === 'prep' || step.state === 'talk') +
      '<div class="ie-card">' + body + clock +
      (step.part === 2 && (step.state === 'prep' || step.state === 'talk')
        ? `<textarea class="ie-input ies-notes" placeholder="准备笔记（只在本页，不提交）">${esc(s.notes)}</textarea>`
        : '') +
      `<div class="ies-actions">${actions}</div>` +
      '</div>';

    bindSpk(root);
    bindAsrToggle(root);
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
        asrStop(); // 切题：识别器此时应已停止，这里兜底
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
        asrStop();
        revokeUrl(step.audioUrl);
        step.audioUrl = null;
        step.asr = null;
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

  // await 麦克风之后确认这一题仍是当前会话的当前题；会话已结束（切走 / 回列表）时顺手关麦
  function stillCurrent(step) {
    const s = st.session;
    if (alive() && s && st.stage === 'run' && s.steps[s.idx] === step) return true;
    if (!alive() || !s || st.stage !== 'run') releaseMic(false);
    return false;
  }

  async function startPrep(step) {
    // 防重入：权限弹窗期间连点「开始准备」/「跳过准备」只处理第一次
    if (step.starting) return;
    step.starting = true;
    stopTts();
    try {
      // 准备阶段就申请麦克风（有用户点击），准备结束时才能自动开录
      await ensureMic();
    } finally {
      step.starting = false;
    }
    if (!stillCurrent(step)) return;
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
    // 防重入：权限弹窗期间连点「开始作答」只处理第一次（否则会重复 recStart 和 setInterval）
    if (step.starting) return;
    step.starting = true;
    clearTimer();
    stopTts();
    try {
      await ensureMic();
    } finally {
      step.starting = false;
    }
    if (!stillCurrent(step)) return;
    recStart();
    step.asr = newAsrState(); // 每次开始作答都是一份新的转写
    step.state = 'talk';
    step.phaseStart = Date.now();
    step.overWarned = false;
    renderStep();
    asrStart(step); // 在转写框渲染之后启动，状态和文字直接画进去
    clearTimer(); // 同一时刻只保留一个计时器
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
    asrStop(); // 结束作答：先停识别，未定稿的文字收进本题
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
    asrStop();
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
      '<div class="ie-card ies-fluency"><div class="ie-loading">正在统计流利度…</div></div>' +
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
    st.fc = fallback ? null : fcRefs(dims);
    paintFluency(true, false);
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
        (x.state === 'done' ? stepTxHtml(x, true) : '') +
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
    asrStop(); // 交卷：识别器此时应已停止，这里兜底
    const fluency = sessionFluency();
    const transcript = fluency ? transcriptPayload() : '';
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
        // 有转写时才带上（可选字段）；没有语音识别的作答不发
        ...(transcript ? { transcript } : {}),
        ...(fluency ? { metrics: metricsPayload(fluency) } : {}),
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
      `<div class="ie-card ies-fluency">${fluencyCardHtml(sessionFluency(), false)}</div>` +
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
        asrStop();
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
