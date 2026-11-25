'use strict';
// 雅思备考 · 听力子页：Part 1–4 原创听力，用浏览器 speechSynthesis 朗读脚本（不做任何音频文件）。
// 考试模式：旁白开场 → 每组题前 30 秒读题 → 本组音频只播一次（不能暂停回放）→ 播完 30 秒检查 → 自动交卷。
// 练习模式：播放 / 暂停、逐段重播、调语速（0.85–1.15）、脚本开关；没有 TTS 或英文声音时直接看脚本做题。
// 交卷后逐题显示对错、正确答案和解析；脚本展开并高亮答案所在段，点任意一段重听。
// 切走子页 / 切标签 / pause / leave / 页面隐藏时一律 speechSynthesis.cancel() 并清理全部定时器。
// 接口：GET /api/ielts/listening、GET /api/ielts/listening/:id、POST /api/ielts/listening/:id/submit
// 设计：docs/design/ielts-listening-20261124.md
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE || !IE.registerPage) return;
  const esc = NCE.escapeHtml; // 转义 & < > "；本文件的 HTML 属性一律用双引号

  const READ_SEC = 30;
  const CHECK_SEC = 30;
  const EXAM_RATE = 1;
  const RATE_MIN = 0.85;
  const RATE_MAX = 1.15;
  const RATE_DEFAULT = 1;
  const GAP_SAME_MS = 350; // 同一人连续两段之间的停顿
  const GAP_SWITCH_MS = 650; // 换人时的停顿
  const START_DELAY_MS = 80; // cancel() 后立刻 speak() 在 Chrome 上可能被吞掉，稍等再开口
  const CHUNK_MAX = 200; // 每段再按句切成小块朗读，规避 Chrome 长句朗读被截断
  const VOICE_WAIT_MS = 2500;
  const MAX_DURATION_SEC = 7200;
  const ARM_RESET_MS = 4000;
  const PITCH_LADDER = [1, 1.18, 0.86, 1.32]; // 同一声音被多人复用时依次拉开音高

  const PART_INFO = {
    1: { name: 'Part 1', desc: '两人日常对话 · 表格 / 笔记填空 · 拼写人名、数字、日期、地址' },
    2: { name: 'Part 2', desc: '日常场景独白 · 单选 + 匹配' },
    3: { name: 'Part 3', desc: '2–3 人学术讨论 · 单选、匹配、句子填空' },
    4: { name: 'Part 4', desc: '学术讲座 · 笔记填空 + 摘要填空' },
  };
  const TYPE_LABEL = {
    'form-completion': '表格填空',
    'note-completion': '笔记填空',
    'sentence-completion': '句子填空',
    'summary-completion': '摘要填空',
    mcq: '单选',
    matching: '匹配',
  };
  const CHOICE_TYPES = ['mcq', 'matching'];
  const MODE_LABEL = { exam: '考试模式', practice: '练习模式' };
  // 与 app.js 一致：排除 macOS「趣味声音」，它们会发出音乐 / 机器噪音
  const NOVELTY_VOICE = /Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Jester|Organ|Superstar|Trinoids|Wobble|Zarvox|Hysterical|Whisper|Pipe Organ|Albert|Fred/i;
  // 声音 API 不提供性别，只能按常见声音名粗略判断；判断不出时按「未知」处理
  const FEMALE_RE = /\b(female|woman|serena|kate|stephanie|martha|fiona|moira|karen|samantha|tessa|victoria|allison|ava|susan|zira|hazel|libby|sonia|mia|emily|amy|joanna|salli|kimberly|ivy|kendra|catherine|veena|tina|nicky|zoe|jenny|aria|natasha|clara|emma|olivia|isla|maisie|abbi|bella|hollie|alice|ellie|lily|sarah|linda|heather|nora)\b/i;
  const MALE_RE = /\b(male|man|daniel|arthur|oliver|george|ryan|thomas|alex|tom|aaron|david|mark|james|rishi|gordon|lee|guy|brian|russell|matthew|joey|justin|eric|evan|nathan|reed|ralph|alfie|elliot|ethan|noah|william|harry|liam|connor|andrew|christopher|roger)\b/i;
  const QUALITY_VOICE = /daniel|serena|kate|arthur|stephanie|martha|oliver|google uk|enhanced|premium|natural|neural/i;

  const style = document.createElement('style');
  style.textContent = `
    .iel-list{display:flex;flex-direction:column;gap:10px}
    .iel-item{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card);padding:12px 14px;cursor:pointer;min-width:0}
    .iel-item:hover,.iel-item:focus{border-color:var(--brand);box-shadow:var(--shadow-sm);outline:none}
    .iel-item-h{display:flex;align-items:baseline;gap:4px 10px;flex-wrap:wrap}
    .iel-item-t{font-size:15px;font-weight:700;color:var(--ink);overflow-wrap:anywhere}
    .iel-item-s{font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.6}
    .iel-stat{margin-left:auto;font-size:12.5px;color:var(--muted)}
    .iel-stat b{color:var(--ok)}
    .iel-top{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;margin-bottom:10px}
    .iel-top .t{font-weight:700;color:var(--ink);font-size:14px;overflow-wrap:anywhere;min-width:0}
    .iel-intro{font-size:15px;line-height:1.7;color:var(--ink);font-style:italic;overflow-wrap:anywhere}
    .iel-meta{font-size:13px;color:var(--muted);line-height:1.7;margin-top:6px}
    .iel-cast{font-size:12.5px;color:var(--muted);line-height:1.7;margin-top:8px;overflow-wrap:anywhere}
    .iel-modes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
    @media (max-width:620px){.iel-modes{grid-template-columns:1fr}}
    .iel-mode{border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;display:flex;flex-direction:column;gap:10px;min-width:0}
    .iel-mode h4{margin:0;font-size:15px;color:var(--ink)}
    .iel-mode ul{margin:0;padding-left:18px;font-size:13px;color:var(--ink-soft);line-height:1.7}
    .iel-mode .btn{align-self:flex-start}
    .iel-mode.off h4,.iel-mode.off ul{opacity:.6}
    .iel-rate{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--ink-soft)}
    .iel-rate input{width:150px;max-width:100%;accent-color:var(--brand)}
    .iel-rate b{font-variant-numeric:tabular-nums;color:var(--ink);min-width:42px}
    .iel-bar{display:flex;flex-direction:column;gap:10px}
    .iel-status{display:flex;align-items:baseline;gap:4px 14px;flex-wrap:wrap}
    .iel-phase{font-size:14.5px;font-weight:800;color:var(--ink)}
    .iel-clock{font-size:28px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--brand);line-height:1}
    .iel-clock.warn{color:#d97706}
    .iel-now{font-size:13px;color:var(--muted);line-height:1.6}
    .iel-prog{height:6px;border-radius:999px;background:rgba(127,127,127,.16);overflow:hidden}
    .iel-prog i{display:block;height:100%;width:0;background:var(--accent-grad);transition:width .3s}
    .iel-ctrl{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .iel-chips{display:flex;gap:6px;flex-wrap:wrap}
    .iel-chip{min-width:30px;padding:3px 7px;border:1px solid var(--border);border-radius:7px;background:var(--card);color:var(--ink-soft);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;font-variant-numeric:tabular-nums}
    .iel-chip:hover{border-color:var(--brand);color:var(--brand)}
    .iel-chip.cur{background:var(--accent-grad);color:#fff;border-color:transparent}
    .iel-chip:disabled{opacity:.4;cursor:default}
    .iel-group{border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:14px;margin-top:12px;min-width:0;background:var(--card)}
    .iel-group.cur{border-color:var(--brand);box-shadow:var(--ring)}
    .iel-gh{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;margin-bottom:6px}
    .iel-gh b{color:var(--ink);font-size:14.5px}
    .iel-ins,.iel-limit{font-size:13.5px;color:var(--ink-soft);line-height:1.6;overflow-wrap:anywhere}
    .iel-limit b{color:var(--ink);letter-spacing:.02em}
    .iel-gt{font-weight:800;color:var(--ink);margin:12px 0 2px;font-size:14.5px;overflow-wrap:anywhere}
    .iel-rows{display:flex;flex-direction:column;gap:8px;margin-top:8px}
    .iel-row{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;font-size:14.5px;color:var(--ink);line-height:1.7;min-width:0;overflow-wrap:anywhere}
    .iel-notes .iel-row::before{content:"•";color:var(--muted)}
    .iel-heading{font-weight:700;color:var(--ink-soft);font-size:13.5px;margin-top:6px}
    .iel-no{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:22px;padding:0 5px;border-radius:6px;background:rgba(47,111,237,.10);color:var(--brand);font-size:12px;font-weight:800;flex:none;font-variant-numeric:tabular-nums}
    .iel-in{width:10em;max-width:100%;padding:5px 9px;font-size:14.5px}
    .iel-summary{font-size:14.5px;line-height:2.3;color:var(--ink);margin:8px 0 0;overflow-wrap:anywhere}
    .iel-gap{display:inline-flex;align-items:center;gap:4px;max-width:100%;vertical-align:middle}
    .iel-summary .iel-in{width:8em}
    .iel-mcq{margin-top:12px}
    .iel-q{display:flex;gap:8px;align-items:baseline;font-size:14.5px;color:var(--ink);line-height:1.6;overflow-wrap:anywhere}
    .iel-opts{display:flex;flex-direction:column;gap:6px;margin:6px 0 0 34px}
    @media (max-width:480px){.iel-opts{margin-left:0}}
    .iel-opt{display:flex;gap:8px;align-items:flex-start;padding:6px 10px;border:1px solid var(--border-soft);border-radius:8px;cursor:pointer;font-size:14px;color:var(--ink-soft);line-height:1.55;overflow-wrap:anywhere}
    .iel-opt:hover{border-color:var(--brand)}
    .iel-opt input{margin-top:4px;accent-color:var(--brand);flex:none}
    .iel-opt.on{border-color:var(--brand);background:rgba(47,111,237,.08)}
    .iel-box{border:1px dashed var(--border);border-radius:var(--radius-sm);padding:10px 12px;margin-top:8px;font-size:14px;color:var(--ink-soft);line-height:1.7;overflow-wrap:anywhere}
    .iel-box .t{font-weight:700;color:var(--ink);margin-bottom:2px}
    .iel-mp{flex:1 1 140px;min-width:0}
    .iel-sel{max-width:100%;padding:6px 32px 6px 10px;font-size:14px}
    .iel-script{display:flex;flex-direction:column;gap:6px}
    .iel-seg{border:1px solid var(--border-soft);border-left:3px solid transparent;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:14px;line-height:1.7;color:var(--ink-soft);overflow-wrap:anywhere}
    .iel-seg:hover{border-color:var(--brand)}
    .iel-seg.ans{border-left-color:var(--ok);background:rgba(22,163,74,.06)}
    .iel-seg.cur{border-left-color:var(--brand);background:rgba(47,111,237,.08)}
    .iel-seg.focus{box-shadow:var(--ring);border-color:var(--brand)}
    .iel-seg-h{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:2px}
    .iel-seg-h b{color:var(--ink);font-size:13px}
    .iel-seg mark{background:rgba(245,158,11,.30);color:inherit;border-radius:3px;padding:0 2px}
    .iel-qb{font-size:11px;font-weight:800;color:var(--ok);border:1px solid rgba(22,163,74,.45);border-radius:5px;padding:0 5px}
    .iel-score{display:flex;align-items:baseline;gap:6px 16px;flex-wrap:wrap}
    .iel-score b{font-size:38px;font-weight:900;color:var(--brand);line-height:1.1}
    .iel-res{border:1px solid var(--border-soft);border-left:3px solid var(--bad);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:14px;color:var(--ink-soft);line-height:1.7;overflow-wrap:anywhere}
    .iel-res.ok{border-left-color:var(--ok)}
    .iel-res-h{display:flex;gap:6px 8px;align-items:baseline;flex-wrap:wrap;color:var(--ink)}
    .iel-mark{font-weight:800;margin-left:auto;color:var(--bad)}
    .iel-res.ok .iel-mark{color:var(--ok)}
    .iel-res-e{margin-top:4px}
    .iel-res .btn{margin-top:6px}
    .iel-sub{font-size:13.5px;font-weight:700;color:var(--ink-soft);margin:14px 0 2px}
  `;
  document.head.appendChild(style);

  // ---------- 状态 ----------
  const st = {
    stage: 'list', // list | intro | run | review
    visible: false, // 本子页当前是否显示（页面隐藏时只处理自己的朗读）
    section: null, // 当前题目（服务端 publicSection，无答案）
    tts: null, // { ok, reason: '' | 'unsupported' | 'novoice', voices, gb }
    cast: null, // { speakers: { id: { voice, pitch } }, narrator }
    rate: RATE_DEFAULT,
    mode: null, // exam | practice
    answers: {}, // 题号字符串 -> 用户输入
    phase: '',
    groupIdx: 0,
    segIdx: -1, // 考试模式正在播放的段
    cursor: 0, // 练习模式当前段
    countdown: 0,
    startedAt: 0,
    showScript: false,
    interruptReason: '',
    submitError: '',
    exitArmed: false,
    submitArmed: false,
    result: null,
    reviewSeg: -1,
  };
  let root = null;
  let ctx = null;

  function alive() {
    return !!(ctx && ctx.isActive());
  }

  // ---------- 定时器：全部登记，切走时一次清空 ----------
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }
  function every(fn, ms) {
    const id = setInterval(fn, ms);
    timers.add(id);
    return id;
  }
  function clearTimer(id) {
    if (id == null) return;
    clearTimeout(id);
    clearInterval(id);
    timers.delete(id);
  }
  function clearTimers() {
    timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    timers.clear();
  }

  // ---------- 语速（按档案存 localStorage）----------
  function clampRate(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return RATE_DEFAULT;
    return Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(n * 20) / 20));
  }
  function loadRate() {
    try {
      const raw = localStorage.getItem(IE.storeKey('listening-rate'));
      return raw == null ? RATE_DEFAULT : clampRate(raw);
    } catch (e) {
      console.warn('[ielts-listening] 读取语速失败', e);
      return RATE_DEFAULT;
    }
  }
  function saveRate(v) {
    try {
      localStorage.setItem(IE.storeKey('listening-rate'), String(v));
    } catch (e) {
      console.warn('[ielts-listening] 保存语速失败', e);
    }
  }
  st.rate = loadRate();

  // ---------- TTS：声音检测与分配 ----------
  const TTS_OK = !!(window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function');

  function englishVoices() {
    if (!TTS_OK) return [];
    let all = [];
    try {
      all = window.speechSynthesis.getVoices() || [];
    } catch (e) {
      console.warn('[ielts-listening] getVoices 失败', e);
      all = [];
    }
    const usable = all.filter((v) => !NOVELTY_VOICE.test(v.name || ''));
    return (usable.length ? usable : all).filter((v) => /^en(?:[-_]|$)/i.test(v.lang || ''));
  }
  const isGb = (v) => /^en[-_]gb/i.test(v.lang || '');

  // getVoices() 首次常为空：监听 voiceschanged（addEventListener，不覆盖 app.js 的 onvoiceschanged）+ 轮询，最多等 2.5 秒
  let voiceWait = null;
  function waitVoices() {
    if (!TTS_OK) return Promise.resolve([]);
    const now = englishVoices();
    if (now.length) return Promise.resolve(now);
    if (voiceWait) return voiceWait;
    voiceWait = new Promise((resolve) => {
      const synth = window.speechSynthesis;
      const canListen = typeof synth.addEventListener === 'function';
      let done = false;
      let poll = null;
      let cap = null;
      const check = () => {
        if (englishVoices().length) finish();
      };
      function finish() {
        if (done) return;
        done = true;
        clearInterval(poll);
        clearTimeout(cap);
        if (canListen) synth.removeEventListener('voiceschanged', check);
        voiceWait = null;
        resolve(englishVoices());
      }
      if (canListen) synth.addEventListener('voiceschanged', check);
      poll = setInterval(check, 250);
      cap = setTimeout(finish, VOICE_WAIT_MS);
    });
    return voiceWait;
  }

  async function detectTts() {
    if (!TTS_OK) {
      st.tts = { ok: false, reason: 'unsupported', voices: [], gb: 0 };
      return st.tts;
    }
    const voices = await waitVoices();
    st.tts = voices.length
      ? { ok: true, reason: '', voices, gb: voices.filter(isGb).length }
      : { ok: false, reason: 'novoice', voices: [], gb: 0 };
    return st.tts;
  }

  function voiceGender(v) {
    const n = (v && v.name) || '';
    if (FEMALE_RE.test(n)) return 'female';
    if (MALE_RE.test(n)) return 'male';
    return null;
  }
  // 排序：en-GB 优先，其次高质量声音名；离线时本地声音优先、云端声音垫底
  function voiceScore(v) {
    let s = 0;
    if (isGb(v)) s += 100;
    if (QUALITY_VOICE.test(v.name || '')) s += 10;
    if (navigator.onLine === false) {
      if (v.localService === true) s += 50;
      else if (v.localService === false) s -= 200;
    } else if (v.localService === true) s += 3;
    return s;
  }

  // 每个说话人尽量用不同的声音；不够用时复用声音并用 pitch 区分
  function castVoices(section, voices) {
    const ordered = voices.slice().sort((a, b) => voiceScore(b) - voiceScore(a));
    const used = new Set();
    const dup = new Map();
    const out = { speakers: {}, narrator: null };
    for (const spk of section.speakers) {
      const want = spk.gender === 'male' ? 'male' : 'female';
      let v =
        ordered.find((x) => !used.has(x) && voiceGender(x) === want) ||
        ordered.find((x) => !used.has(x) && !voiceGender(x)) ||
        null;
      if (!v) v = ordered.find((x) => voiceGender(x) === want) || ordered[0] || null;
      if (v) used.add(v);
      const vg = voiceGender(v);
      let base = 1;
      if (vg && vg !== want) base = want === 'male' ? 0.7 : 1.35; // 只有异性声音可用时，用音高区分男女
      else if (!vg) base = want === 'male' ? 0.9 : 1.1;
      const key = `${v ? v.voiceURI || v.name : 'default'}|${base}`;
      const k = dup.get(key) || 0;
      dup.set(key, k + 1);
      const pitch = Math.min(2, Math.max(0.5, base * PITCH_LADDER[k % PITCH_LADDER.length]));
      out.speakers[spk.id] = { voice: v, pitch: Math.round(pitch * 100) / 100 };
    }
    out.narrator = { voice: ordered.find((x) => !used.has(x)) || ordered[0] || null, pitch: 1 };
    return out;
  }

  function voiceLabel(v) {
    return v ? `${v.name}（${v.lang}）` : '浏览器默认声音';
  }

  // ---------- TTS：朗读引擎 ----------
  // token：每次开始 / 停止都递增，旧 utterance 的回调一律作废；keep 持有引用防止被 GC 后 onend 不触发
  const sp = { token: 0, keep: [], active: false };

  function stopSpeech() {
    sp.token++;
    sp.keep = [];
    sp.active = false;
    if (!TTS_OK) return;
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn('[ielts-listening] speechSynthesis.cancel 失败', e);
    }
  }
  function haltAll() {
    stopSpeech();
    clearTimers();
  }

  // 按句切分（只在句末标点后跟空白处切，9.30 / a.m. 中间不切），再合并成 ≤ CHUNK_MAX 字符的小块
  function splitChunks(text) {
    const s = String(text || '');
    const sentences = [];
    const re = /[.!?]+["')\]]*\s+/g;
    let start = 0;
    let m;
    while ((m = re.exec(s))) {
      sentences.push(s.slice(start, m.index + m[0].length).trim());
      start = m.index + m[0].length;
    }
    if (start < s.length) sentences.push(s.slice(start).trim());
    const out = [];
    let cur = '';
    for (const x of sentences) {
      if (!x) continue;
      if (cur && cur.length + x.length + 1 > CHUNK_MAX) {
        out.push(cur);
        cur = x;
      } else cur = cur ? `${cur} ${x}` : x;
    }
    if (cur) out.push(cur);
    return out.length ? out : [s];
  }

  // 看门狗时长：按约 2.4 词/秒估算再放宽一倍多，onend 没触发时兜底继续
  function watchdogMs(text, rate) {
    const words = String(text).split(/\s+/).length;
    return Math.round((words / (2.4 * rate)) * 1000 * 2.2) + 5000;
  }

  function speakChunks(chunks, cast, rate, token, done) {
    let i = 0;
    const next = () => {
      if (token !== sp.token) return;
      if (i >= chunks.length) {
        done(true);
        return;
      }
      const text = chunks[i++];
      const u = new window.SpeechSynthesisUtterance(text);
      if (cast && cast.voice) {
        u.voice = cast.voice;
        u.lang = cast.voice.lang || 'en-GB';
      } else u.lang = 'en-GB';
      u.pitch = cast ? cast.pitch : 1;
      u.rate = rate;
      let settled = false;
      let dog = null;
      const settle = (ok, err) => {
        if (settled) return;
        settled = true;
        clearTimer(dog);
        if (token !== sp.token) return;
        if (ok) next();
        else done(false, err);
      };
      u.onend = () => settle(true);
      u.onerror = (ev) => settle(false, (ev && ev.error) || 'error');
      dog = later(() => {
        console.warn('[ielts-listening] 朗读超时未收到结束事件，继续下一句');
        settle(true);
      }, watchdogMs(text, rate));
      sp.keep.push(u);
      try {
        window.speechSynthesis.speak(u);
      } catch (e) {
        settle(false, e && e.message ? e.message : 'speak-failed');
      }
    };
    next();
  }

  /**
   * 顺序朗读 items（[{ text, cast, rate, seg, gapAfter }]）。先停掉正在读的内容。
   * opts.onItem(item) 每项开始时、opts.onDone() 全部读完、opts.onFail(err) 出错（含被别处 cancel）
   */
  function speakSeq(items, opts) {
    stopSpeech();
    if (!TTS_OK || !items.length) {
      if (opts.onFail) opts.onFail(TTS_OK ? 'empty' : 'unsupported');
      return;
    }
    const token = sp.token;
    sp.active = true;
    let i = 0;
    const step = () => {
      if (token !== sp.token) return;
      const it = items[i];
      if (opts.onItem) opts.onItem(it);
      speakChunks(splitChunks(it.text), it.cast, it.rate, token, (ok, err) => {
        if (token !== sp.token) return;
        if (!ok) {
          sp.active = false;
          if (opts.onFail) opts.onFail(err);
          return;
        }
        i++;
        if (i >= items.length) {
          sp.active = false;
          if (opts.onDone) opts.onDone();
          return;
        }
        later(step, it.gapAfter || 0);
      });
    };
    try {
      window.speechSynthesis.resume(); // 部分浏览器会卡在暂停态
    } catch (e) {
      console.warn('[ielts-listening] speechSynthesis.resume 失败', e);
    }
    later(step, START_DELAY_MS);
  }

  function segItems(from, to, rate) {
    const segs = st.section.segments;
    const out = [];
    for (let i = from; i <= to; i++) {
      const s = segs[i];
      const nx = segs[i + 1];
      out.push({
        text: s.text,
        cast: (st.cast && st.cast.speakers[s.speaker]) || { voice: null, pitch: 1 },
        rate,
        seg: i,
        gapAfter: nx && nx.speaker !== s.speaker ? GAP_SWITCH_MS : GAP_SAME_MS,
      });
    }
    return out;
  }

  // ---------- 通用小工具 ----------
  function speakerName(id) {
    const s = st.section && st.section.speakers.find((x) => x.id === id);
    return s ? s.name : String(id || '');
  }
  function firstNo(g) {
    return g.questions[0].no;
  }
  function lastNo(g) {
    return g.questions[g.questions.length - 1].no;
  }
  function rangeText(g) {
    return firstNo(g) === lastNo(g) ? `${firstNo(g)}` : `${firstNo(g)}–${lastNo(g)}`;
  }
  function rangeEn(g) {
    return firstNo(g) === lastNo(g) ? `question ${firstNo(g)}` : `questions ${firstNo(g)} to ${lastNo(g)}`;
  }
  function groupEnd(gi) {
    const s = st.section;
    const nx = s.groups[gi + 1];
    return nx ? nx.from - 1 : s.segments.length - 1;
  }
  function groupOfSeg(i) {
    const gs = st.section.groups;
    for (let gi = gs.length - 1; gi >= 0; gi--) if (i >= gs[gi].from) return gi;
    return 0;
  }
  function gapParts(prompt) {
    const p = String(prompt || '');
    const m = /_{3,}/.exec(p);
    return m ? [p.slice(0, m.index), p.slice(m.index + m[0].length)] : [p, ''];
  }
  function allQuestions() {
    const out = [];
    st.section.groups.forEach((g) => g.questions.forEach((q) => out.push({ g, q })));
    return out;
  }
  function answeredMap() {
    const out = {};
    for (const [k, v] of Object.entries(st.answers)) {
      const t = typeof v === 'string' ? v.trim() : '';
      if (t) out[k] = t;
    }
    return out;
  }
  function unansweredCount() {
    const a = answeredMap();
    return allQuestions().filter(({ q }) => !a[String(q.no)]).length;
  }
  function elapsedSec() {
    return Math.min(MAX_DURATION_SEC, Math.max(0, Math.round((Date.now() - st.startedAt) / 1000)));
  }
  function setText(box, sel, text) {
    const el = box.querySelector(sel);
    if (el) el.textContent = text;
  }
  function isValidSection(s) {
    return !!(
      s && typeof s.id === 'string' && Array.isArray(s.speakers) && Array.isArray(s.segments) && s.segments.length &&
      Array.isArray(s.groups) && s.groups.length &&
      s.groups.every((g) => g && Array.isArray(g.questions) && g.questions.length && Number.isInteger(g.from))
    );
  }

  function ttsNoteHtml() {
    const t = st.tts;
    if (!t) return '';
    if (t.ok) {
      return (
        '<div class="ie-note">' +
        `🔈 已检测到 <b>${t.voices.length}</b> 个英文声音（其中英音 ${t.gb} 个）${t.gb ? '' : '，没有英音时用其他英文口音代替'}。` +
        '朗读用浏览器自带的语音合成，音色比真人录音生硬，正式备考请配合剑雅真题音频。' +
        '</div>'
      );
    }
    const why = t.reason === 'unsupported'
      ? '当前浏览器不支持语音合成（speechSynthesis），听力无法发声。建议用 Chrome / Edge / Safari。'
      : '没有检测到可用的英文声音（系统没装英文语音包，或语音列表还没加载出来）。可以在系统设置里安装英文（英国）语音后点「重新检测」。';
    return (
      '<div class="ie-warn">' +
      `⚠️ ${esc(why)}<br>考试模式暂不可用；<b>练习模式可以直接看脚本做题</b>，交卷和复盘不受影响。` +
      (t.reason === 'novoice' ? '<div style="margin-top:8px"><button type="button" class="btn small iel-redetect">重新检测</button></div>' : '') +
      '</div>'
    );
  }
  function bindRedetect(box, after) {
    const b = box.querySelector('.iel-redetect');
    if (!b) return;
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = '检测中…';
      await detectTts();
      if (!alive()) return;
      after();
    };
  }

  function rateHtml() {
    return (
      '<label class="iel-rate">语速' +
      `<input type="range" class="iel-rate-in" min="${RATE_MIN}" max="${RATE_MAX}" step="0.05" value="${st.rate}" aria-label="语速">` +
      `<b class="iel-rate-v">${st.rate.toFixed(2)}×</b></label>`
    );
  }
  function bindRate(box, onChange) {
    const input = box.querySelector('.iel-rate-in');
    const label = box.querySelector('.iel-rate-v');
    if (!input) return;
    input.oninput = () => {
      label.textContent = `${clampRate(input.value).toFixed(2)}×`;
    };
    input.onchange = () => {
      st.rate = clampRate(input.value);
      input.value = String(st.rate);
      label.textContent = `${st.rate.toFixed(2)}×`;
      saveRate(st.rate);
      if (onChange) onChange();
    };
  }

  function castHtml() {
    if (!st.cast || !st.section) return '';
    const parts = st.section.speakers.map((s) => {
      const c = st.cast.speakers[s.id];
      return `${esc(s.name)}（${s.gender === 'male' ? '男' : '女'}）→ ${esc(voiceLabel(c && c.voice))}${c && c.pitch !== 1 ? ` · 音高 ${esc(c.pitch)}` : ''}`;
    });
    parts.push(`旁白 → ${esc(voiceLabel(st.cast.narrator.voice))}`);
    return `<div class="iel-cast">🗣️ 声音分配：${parts.join('；')}</div>`;
  }

  // ---------- 列表 ----------
  async function renderList() {
    haltAll();
    st.stage = 'list';
    st.section = null;
    st.result = null;
    root.innerHTML = '<div class="ie-loading">正在加载听力题目…</div>';
    let data;
    try {
      [data] = await Promise.all([IE.get('/api/ielts/listening'), detectTts()]);
    } catch (e) {
      if (!alive() || st.stage !== 'list') return;
      root.innerHTML = IE.errorHtml('听力题目加载失败', e);
      IE.bindRetry(root, renderList);
      return;
    }
    if (!alive() || st.stage !== 'list') return;
    paintList(data && Array.isArray(data.items) ? data : { items: [] });
  }

  function itemHtml(it) {
    const best = it.best;
    const stat = it.attempts
      ? `做过 ${esc(it.attempts)} 次${best ? ` · 最好 <b>${esc(best.raw)}/${esc(best.total)}</b> ≈ ${esc(IE.fmtBand(best.band))}（${esc(MODE_LABEL[best.mode] || best.mode)}）` : ''}`
      : '未做';
    const types = (Array.isArray(it.types) ? it.types : []).map((t) => TYPE_LABEL[t] || t).join(' + ');
    return (
      `<div class="iel-item" data-id="${esc(it.id)}" role="button" tabindex="0">` +
      '<div class="iel-item-h">' +
      `<span class="iel-item-t">${esc(it.title)}</span><span class="ie-muted">${esc(it.titleCn || '')}</span>` +
      `<span class="iel-stat">${stat}</span>` +
      '</div>' +
      `<div class="iel-item-s">${esc(types)} · ${esc(it.questionCount)} 题 · 脚本约 ${esc(it.scriptWords)} 词</div>` +
      '</div>'
    );
  }

  function paintList(data) {
    const items = data.items;
    let html = ttsNoteHtml();
    for (const part of [1, 2, 3, 4]) {
      const list = items.filter((x) => x.part === part);
      if (!list.length) continue;
      html +=
        '<div class="ie-card">' +
        `<h3>🎧 ${esc(PART_INFO[part].name)} <span class="ie-h3-sub">${esc(PART_INFO[part].desc)}</span></h3>` +
        `<div class="iel-list">${list.map(itemHtml).join('')}</div>` +
        '</div>';
    }
    if (!items.length) html += '<div class="ie-empty">还没有听力题目（data/ielts/listening/ 为空）。</div>';
    if (Number(data.skipped) > 0) {
      html += `<div class="ie-warn" style="margin-top:14px">有 ${esc(data.skipped)} 个听力 section 数据有误，已隐藏（详情见服务端日志）。</div>`;
    }
    if (data.bandNote) html += `<div class="ie-muted" style="margin-top:12px">${esc(data.bandNote)}</div>`;
    root.innerHTML = html;
    bindRedetect(root, () => paintList(data));
    root.querySelectorAll('.iel-item').forEach((el) => {
      el.onclick = () => openSection(el.dataset.id);
      el.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSection(el.dataset.id);
        }
      };
    });
  }

  // ---------- 准备页 ----------
  async function openSection(id) {
    haltAll();
    st.stage = 'intro';
    root.innerHTML = '<div class="ie-loading">正在加载题目…</div>';
    let sec;
    try {
      [sec] = await Promise.all([IE.get('/api/ielts/listening/' + encodeURIComponent(id)), detectTts()]);
      if (!isValidSection(sec)) throw new Error('题目数据格式不对');
    } catch (e) {
      if (!alive() || st.stage !== 'intro') return;
      root.innerHTML =
        '<div class="iel-top"><button type="button" class="btn small ghost iel-back">← 题目列表</button></div>' +
        IE.errorHtml('题目加载失败', e);
      root.querySelector('.iel-back').onclick = renderList;
      IE.bindRetry(root, () => openSection(id));
      return;
    }
    if (!alive() || st.stage !== 'intro') return;
    st.section = sec;
    st.cast = st.tts.ok ? castVoices(sec, st.tts.voices) : null;
    paintIntro();
  }

  function paintIntro() {
    const s = st.section;
    const ok = st.tts.ok;
    const part = PART_INFO[s.part] || { name: `Part ${s.part}` };
    const types = [...new Set(s.groups.map((g) => TYPE_LABEL[g.type] || g.type))].join(' + ');
    const limits = [...new Set(s.groups.map((g) => g.wordLimit).filter(Boolean))];
    root.innerHTML =
      '<div class="iel-top">' +
      '<button type="button" class="btn small ghost iel-back">← 题目列表</button>' +
      `<span class="t">${esc(part.name)} · ${esc(s.title)}</span>` +
      '</div>' +
      '<div class="ie-card">' +
      `<h3>🎧 ${esc(s.title)} <span class="ie-h3-sub">${esc(s.titleCn || '')}</span></h3>` +
      (s.intro ? `<div class="iel-intro">${esc(s.intro)}</div>` : '') +
      `<div class="iel-meta">说话人：${s.speakers.map((x) => `${esc(x.name)}（${x.gender === 'male' ? '男' : '女'}）`).join('、')} · ${esc(s.segments.length)} 段 · ${esc(s.questionCount || allQuestions().length)} 题 · ${esc(types)}` +
      (limits.length ? `<br>字数限制：${limits.map((l) => esc(l)).join('；')}` : '') +
      '</div>' +
      castHtml() +
      '</div>' +
      `<div style="margin-top:14px">${ttsNoteHtml()}</div>` +
      '<div class="iel-modes">' +
      `<div class="iel-mode${ok ? '' : ' off'}">` +
      '<h4>🎧 考试模式</h4>' +
      '<ul><li>每组题开始前 30 秒读题</li><li>整段只播放一次，不能暂停、不能回放</li><li>边听边作答；播完后 30 秒检查，时间到自动交卷</li><li>语速固定 1.0；中途切走页面，考试会中断</li></ul>' +
      `<button type="button" class="btn primary iel-start-exam"${ok ? '' : ' disabled'}>开始考试</button>` +
      (ok ? '' : '<span class="ie-muted">没有可用的英文声音，考试模式不可用</span>') +
      '</div>' +
      '<div class="iel-mode">' +
      '<h4>📝 练习模式</h4>' +
      '<ul><li>可以暂停、逐段重播、跳到任意一段</li><li>语速 0.85–1.15 可调</li><li>可以打开脚本对照；没有语音时直接看脚本做题</li></ul>' +
      rateHtml() +
      '<button type="button" class="btn iel-start-practice">开始练习</button>' +
      '</div>' +
      '</div>';
    root.querySelector('.iel-back').onclick = renderList;
    root.querySelector('.iel-start-exam').onclick = () => startRun('exam');
    root.querySelector('.iel-start-practice').onclick = () => startRun('practice');
    bindRate(root, null);
    bindRedetect(root, () => {
      st.cast = st.tts.ok ? castVoices(st.section, st.tts.voices) : null;
      paintIntro();
    });
  }

  // ---------- 作答页 ----------
  function inputHtml(no) {
    const v = st.answers[String(no)] || '';
    return (
      `<input type="text" class="ie-input iel-in" data-no="${esc(no)}" value="${esc(v)}" maxlength="100" ` +
      `autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="第 ${esc(no)} 题" placeholder="${esc(no)}">`
    );
  }
  function optionsOf(g, q) {
    return (g.type === 'mcq' ? q.options : g.options) || [];
  }
  function mcqHtml(q) {
    const sel = st.answers[String(q.no)] || '';
    return (
      '<div class="iel-mcq">' +
      `<div class="iel-q"><span class="iel-no">${esc(q.no)}</span><span>${esc(q.prompt)}</span></div>` +
      '<div class="iel-opts">' +
      (q.options || []).map((o) => {
        const on = sel === o.key;
        return (
          `<label class="iel-opt${on ? ' on' : ''}">` +
          `<input type="radio" name="iel-q${esc(q.no)}" value="${esc(o.key)}" data-no="${esc(q.no)}"${on ? ' checked' : ''}>` +
          `<span><b>${esc(o.key)}</b>&nbsp; ${esc(o.text)}</span></label>`
        );
      }).join('') +
      '</div></div>'
    );
  }
  function matchingHtml(g) {
    const box =
      '<div class="iel-box">' +
      (g.optionsTitle ? `<div class="t">${esc(g.optionsTitle)}</div>` : '') +
      g.options.map((o) => `<div><b>${esc(o.key)}</b>&nbsp; ${esc(o.text)}</div>`).join('') +
      '</div>';
    const rows = g.questions.map((q) => {
      const sel = st.answers[String(q.no)] || '';
      return (
        '<div class="iel-row">' +
        `<span class="iel-no">${esc(q.no)}</span><span class="iel-mp">${esc(q.prompt)}</span>` +
        `<select class="iel-sel" data-no="${esc(q.no)}" aria-label="第 ${esc(q.no)} 题"><option value="">—</option>` +
        g.options.map((o) => `<option value="${esc(o.key)}"${sel === o.key ? ' selected' : ''}>${esc(o.key)}</option>`).join('') +
        '</select></div>'
      );
    }).join('');
    return box + `<div class="iel-rows">${rows}</div>`;
  }
  function completionHtml(g) {
    if (g.type === 'summary-completion') {
      return (
        '<p class="iel-summary">' +
        g.questions.map((q) => {
          const [a, b] = gapParts(q.prompt);
          return `${esc(a)}<span class="iel-gap"><span class="iel-no">${esc(q.no)}</span>${inputHtml(q.no)}</span>${esc(b)}`;
        }).join(' ') +
        '</p>'
      );
    }
    let html = '';
    for (const q of g.questions) {
      if (q.heading) html += `<div class="iel-heading">${esc(q.heading)}</div>`;
      const [a, b] = gapParts(q.prompt);
      html +=
        '<div class="iel-row">' +
        `<span class="iel-no">${esc(q.no)}</span>` +
        (a.trim() ? `<span>${esc(a.trim())}</span>` : '') +
        inputHtml(q.no) +
        (b.trim() ? `<span>${esc(b.trim())}</span>` : '') +
        '</div>';
    }
    return `<div class="iel-rows${g.type === 'note-completion' ? ' iel-notes' : ''}">${html}</div>`;
  }
  function groupHeadHtml(g) {
    return (
      `<div class="iel-gh"><b>Questions ${esc(rangeText(g))}</b><span class="ie-pill mute">${esc(TYPE_LABEL[g.type] || g.type)}</span></div>` +
      `<div class="iel-ins">${esc(g.instruction)}</div>` +
      (g.wordLimit ? `<div class="iel-limit">Write <b>${esc(g.wordLimit)}</b> for each answer.</div>` : '') +
      (g.title ? `<div class="iel-gt">${esc(g.title)}</div>` : '')
    );
  }
  function groupHtml(g, gi) {
    let body;
    if (g.type === 'mcq') body = g.questions.map(mcqHtml).join('');
    else if (g.type === 'matching') body = matchingHtml(g);
    else body = completionHtml(g);
    return `<div class="iel-group" data-gi="${gi}">${groupHeadHtml(g)}${body}</div>`;
  }

  function segPlainHtml(i) {
    const sg = st.section.segments[i];
    return (
      `<div class="iel-seg" data-seg="${i}">` +
      `<div class="iel-seg-h"><b>${esc(speakerName(sg.speaker))}</b><span>#${i + 1}</span></div>` +
      `<div>${esc(sg.text)}</div></div>`
    );
  }

  function startRun(mode) {
    if (mode === 'exam' && !(st.tts && st.tts.ok)) {
      NCE.toast('没有可用的英文声音，考试模式不可用；可以用练习模式看脚本做题', 'warn');
      return;
    }
    haltAll();
    if (st.tts && st.tts.ok) st.cast = castVoices(st.section, st.tts.voices);
    Object.assign(st, {
      stage: 'run',
      mode,
      answers: {},
      phase: mode === 'exam' ? 'intro' : 'idle',
      groupIdx: 0,
      segIdx: -1,
      cursor: 0,
      countdown: 0,
      startedAt: Date.now(),
      showScript: mode === 'practice' && !st.tts.ok,
      interruptReason: '',
      submitError: '',
      exitArmed: false,
      submitArmed: false,
      result: null,
    });
    paintRun();
    window.scrollTo(0, 0);
    if (mode === 'exam') examIntro();
  }

  function practiceControlsHtml() {
    const off = st.tts.ok ? '' : ' disabled';
    return (
      '<div class="iel-ctrl">' +
      `<button type="button" class="btn small primary iel-play"${off}>▶ 播放</button>` +
      `<button type="button" class="btn small iel-prev"${off}>⏮ 上一段</button>` +
      `<button type="button" class="btn small iel-replay"${off}>🔁 重播本段</button>` +
      `<button type="button" class="btn small iel-next"${off}>⏭ 下一段</button>` +
      `<button type="button" class="btn small ghost iel-toggle-script">${st.showScript ? '📜 隐藏脚本' : '📜 显示脚本'}</button>` +
      '</div>' +
      (st.tts.ok ? rateHtml() : '') +
      '<div class="iel-chips">' +
      st.section.segments.map((sg, i) => `<button type="button" class="iel-chip" data-seg="${i}" title="${esc(speakerName(sg.speaker))}"${off}>${i + 1}</button>`).join('') +
      '</div>'
    );
  }

  function paintRun() {
    const s = st.section;
    const exam = st.mode === 'exam';
    const part = PART_INFO[s.part] || { name: `Part ${s.part}` };
    root.innerHTML =
      '<div class="iel-run">' +
      '<div class="iel-top">' +
      '<button type="button" class="btn small ghost iel-exit">← 退出</button>' +
      `<span class="t">${esc(part.name)} · ${esc(s.title)} · ${esc(MODE_LABEL[st.mode])}</span>` +
      '</div>' +
      '<div class="ie-card iel-bar">' +
      '<div class="iel-status"><span class="iel-phase"></span><span class="iel-clock" hidden></span><span class="iel-now"></span></div>' +
      '<div class="iel-prog"><i></i></div>' +
      '<div class="iel-actions"></div>' +
      (exam ? '' : practiceControlsHtml() + (st.tts.ok ? castHtml() : ttsNoteHtml())) +
      '</div>' +
      (exam
        ? ''
        : `<div class="ie-card iel-script-card"${st.showScript ? '' : ' hidden'}>` +
          `<h3>📜 脚本 <span class="ie-h3-sub">${st.tts.ok ? '点段落从这里播放' : '没有语音时直接看脚本做题'}</span></h3>` +
          `<div class="iel-script">${s.segments.map((_, i) => segPlainHtml(i)).join('')}</div></div>`) +
      `<div class="iel-qs">${s.groups.map(groupHtml).join('')}</div>` +
      '<div class="ie-row" style="margin-top:14px"><button type="button" class="btn primary iel-submit">交卷</button><span class="ie-msg iel-msg"></span></div>' +
      '</div>';

    const wrap = root.querySelector('.iel-run');
    bindAnswerInputs(wrap);
    wrap.querySelector('.iel-exit').onclick = onExit;
    wrap.querySelector('.iel-submit').onclick = () => submit(false);
    if (!exam) bindPracticeControls(wrap);
    paintStatus();
  }

  // 作答实时写入 st.answers（切走再回来、考试转练习时不丢）
  function bindAnswerInputs(wrap) {
    const record = (el) => {
      if (!el || !el.dataset || !el.dataset.no) return;
      if (el.type === 'radio') {
        if (!el.checked) return;
        wrap.querySelectorAll(`input[name="${el.name}"]`).forEach((r) => r.closest('.iel-opt').classList.toggle('on', r === el));
      }
      st.answers[el.dataset.no] = el.value;
      st.submitArmed = false;
    };
    wrap.oninput = (e) => record(e.target);
    wrap.onchange = (e) => record(e.target);
  }

  function bindPracticeControls(wrap) {
    const last = st.section.segments.length - 1;
    wrap.querySelector('.iel-play').onclick = () => {
      if (st.phase === 'playing') practicePause();
      else practicePlay(st.phase === 'ended' ? 0 : st.cursor, false);
    };
    wrap.querySelector('.iel-prev').onclick = () => practiceJump(Math.max(0, st.cursor - 1));
    wrap.querySelector('.iel-next').onclick = () => practiceJump(Math.min(last, st.cursor + 1));
    wrap.querySelector('.iel-replay').onclick = () => practicePlay(st.cursor, true);
    wrap.querySelector('.iel-toggle-script').onclick = (e) => {
      st.showScript = !st.showScript;
      wrap.querySelector('.iel-script-card').hidden = !st.showScript;
      e.currentTarget.textContent = st.showScript ? '📜 隐藏脚本' : '📜 显示脚本';
    };
    wrap.querySelectorAll('.iel-chip').forEach((c) => {
      c.onclick = () => practicePlay(Number(c.dataset.seg), false);
    });
    const script = wrap.querySelector('.iel-script');
    if (script) {
      script.onclick = (e) => {
        const seg = e.target.closest('.iel-seg');
        if (!seg) return;
        if (!st.tts.ok) {
          NCE.toast('没有可用的英文声音，脚本只能阅读', 'warn');
          return;
        }
        practicePlay(Number(seg.dataset.seg), false);
      };
    }
    bindRate(wrap, () => {
      if (st.phase === 'playing') practicePlay(st.cursor, false); // 播放中改语速：从本段开头按新语速重播
    });
  }

  // 退出：已作答时要再点一次确认，避免误触丢掉作答
  function onExit(e) {
    const btn = e.currentTarget;
    // 用时间戳判断是否在确认窗口内（复位文字的定时器可能被 haltAll 清掉，不能只靠它）
    const armed = st.exitArmed && Date.now() - st.exitArmed < ARM_RESET_MS;
    if (Object.keys(answeredMap()).length && !armed && st.phase !== 'submitting') {
      st.exitArmed = Date.now();
      btn.textContent = '再点一次退出（本次作答不保存）';
      later(() => {
        if (btn.isConnected) btn.textContent = '← 退出';
      }, ARM_RESET_MS);
      return;
    }
    haltAll();
    renderList();
  }

  // ---------- 状态栏 ----------
  function interruptText() {
    const r = st.interruptReason;
    if (r === 'hidden') return '切到了别的页面或标签。考试音频只能播放一次，无法续播。';
    if (r === 'interrupted' || r === 'canceled') return '朗读被别的声音打断了。考试音频只能播放一次，无法续播。';
    return `${ttsErrorText(r)}。考试音频只能播放一次，无法续播。`;
  }
  // not-allowed：浏览器要求页面先有用户点击才允许朗读（自动播放策略）
  function ttsErrorText(err) {
    if (err === 'not-allowed') return '浏览器拦截了朗读（需要先在页面上点击一次），请再点一次播放';
    return `朗读失败（${err || '未知原因'}），请检查系统英文语音，或打开脚本做题`;
  }

  function examView() {
    const s = st.section;
    const N = s.segments.length;
    const g = s.groups[st.groupIdx];
    const r = g ? rangeText(g) : '';
    const played = Math.max(0, st.segIdx + 1) / N;
    switch (st.phase) {
      case 'intro':
        return { phase: '🔈 开场介绍', now: '旁白介绍场景，随后进入读题时间', progress: 0 };
      case 'narrating':
        return { phase: '🔈 旁白提示', now: `接下来是第 ${r} 题的读题时间`, progress: played };
      case 'reading':
        return { phase: `📖 读题时间 · 第 ${r} 题`, clock: IE.fmtClock(st.countdown), clockWarn: st.countdown <= 5, now: '先看题、圈关键词，时间到自动开始播放', progress: played };
      case 'playing':
        return { phase: `🎧 正在播放 · 第 ${r} 题`, now: `第 ${st.segIdx + 1} / ${N} 段 · 只播放一次，不能暂停或回放`, progress: played };
      case 'narrating-end':
        return { phase: '🔈 录音结束', now: '接下来 30 秒检查答案', progress: 1 };
      case 'check':
        return { phase: '✅ 检查时间', clock: IE.fmtClock(st.countdown), clockWarn: st.countdown <= 5, now: '时间到自动交卷，也可以点「立即交卷」', progress: 1 };
      case 'check-hold':
        return { phase: '✅ 检查时间（已暂停）', now: '切走页面时检查计时已停止，检查好后点「立即交卷」', progress: 1 };
      case 'interrupted':
        return { phase: '⚠️ 考试已中断', now: '', progress: played };
      case 'submitting':
        return { phase: '⏳ 正在交卷…', now: '', progress: 1 };
      case 'submit-failed':
        return { phase: '⚠️ 交卷失败', now: st.submitError, progress: 1 };
      default:
        return { phase: '', now: '', progress: 0 };
    }
  }

  function practiceView() {
    const N = st.section.segments.length;
    const c = st.cursor;
    if (st.phase === 'submitting') return { phase: '⏳ 正在交卷…', now: '', progress: 1 };
    if (st.phase === 'submit-failed') return { phase: '⚠️ 交卷失败', now: st.submitError, progress: 1 };
    if (!st.tts.ok) {
      return { phase: '📜 看脚本做题', now: st.tts.reason === 'unsupported' ? '浏览器不支持语音合成' : '没有可用的英文声音', progress: 0 };
    }
    switch (st.phase) {
      case 'playing':
        return { phase: '🎧 正在播放', now: `第 ${c + 1} / ${N} 段 · ${speakerName(st.section.segments[c].speaker)}`, progress: (c + 1) / N };
      case 'paused':
        return { phase: '⏸ 已暂停', now: `停在第 ${c + 1} / ${N} 段，继续会从本段开头播放`, progress: (c + 1) / N };
      case 'ended':
        return { phase: '✅ 已播完', now: '可以点段号重听任意一段，或直接交卷', progress: 1 };
      default:
        return { phase: '📝 练习模式', now: `共 ${N} 段 · 点「▶ 播放」从第 ${c + 1} 段开始`, progress: c / N };
    }
  }

  function actionsHtml() {
    if (st.mode === 'exam' && st.phase === 'interrupted') {
      return (
        `<div class="ie-warn">${esc(interruptText())}` +
        '<div class="ie-row" style="margin-top:8px">' +
        '<button type="button" class="btn small primary iel-to-practice">转为练习模式继续（已填的答案保留）</button>' +
        '<button type="button" class="btn small iel-abandon">放弃本次</button>' +
        '</div></div>'
      );
    }
    return '';
  }
  function bindActions(box) {
    const toPractice = box.querySelector('.iel-to-practice');
    if (toPractice) toPractice.onclick = examToPractice;
    const abandon = box.querySelector('.iel-abandon');
    if (abandon) {
      abandon.onclick = () => {
        haltAll();
        renderList();
      };
    }
  }

  function paintStatus() {
    const wrap = root && root.querySelector('.iel-run');
    if (!wrap || st.stage !== 'run') return;
    const exam = st.mode === 'exam';
    const v = exam ? examView() : practiceView();
    const bar = wrap.querySelector('.iel-bar');
    setText(bar, '.iel-phase', v.phase);
    setText(bar, '.iel-now', v.now || '');
    const clock = bar.querySelector('.iel-clock');
    clock.hidden = !v.clock;
    clock.textContent = v.clock || '';
    clock.className = 'iel-clock' + (v.clockWarn ? ' warn' : '');
    bar.querySelector('.iel-prog i').style.width = `${Math.round(Math.min(1, Math.max(0, v.progress)) * 100)}%`;
    // 带按钮的提示只在阶段变化时重绘，避免倒计时刷新打断点击
    const actions = bar.querySelector('.iel-actions');
    if (actions.dataset.phase !== st.phase) {
      actions.dataset.phase = st.phase;
      actions.innerHTML = actionsHtml();
      bindActions(actions);
    }
    // 当前题组高亮
    let curGroup = -1;
    if (exam && ['reading', 'playing', 'narrating'].includes(st.phase)) curGroup = st.groupIdx;
    if (!exam && st.tts.ok && st.phase !== 'ended') curGroup = groupOfSeg(st.cursor);
    wrap.querySelectorAll('.iel-group').forEach((el) => el.classList.toggle('cur', Number(el.dataset.gi) === curGroup));
    if (!exam) {
      const play = wrap.querySelector('.iel-play');
      if (play) play.textContent = st.phase === 'playing' ? '⏸ 暂停' : '▶ 播放';
      const mark = st.phase === 'ended' ? -1 : st.cursor;
      wrap.querySelectorAll('.iel-chip').forEach((c) => c.classList.toggle('cur', Number(c.dataset.seg) === mark));
      wrap.querySelectorAll('.iel-script .iel-seg').forEach((el) => el.classList.toggle('cur', st.tts.ok && Number(el.dataset.seg) === mark));
    }
    const btn = wrap.querySelector('.iel-submit');
    if (exam) {
      btn.hidden = !['check', 'check-hold', 'submit-failed'].includes(st.phase);
      btn.textContent = st.phase === 'submit-failed' ? '重新交卷' : '立即交卷';
    } else {
      btn.textContent = st.phase === 'submit-failed' ? '重新交卷' : '交卷';
    }
    btn.disabled = st.phase === 'submitting';
  }

  // ---------- 考试模式流程 ----------
  function countdown(sec, done) {
    st.countdown = sec;
    paintStatus();
    const endAt = Date.now() + sec * 1000;
    const id = every(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (left !== st.countdown) {
        st.countdown = left;
        paintStatus();
      }
      if (left <= 0) {
        clearTimer(id);
        done();
      }
    }, 250);
  }

  function narrate(text, next) {
    speakSeq([{ text, cast: st.cast.narrator, rate: EXAM_RATE, seg: -1, gapAfter: 0 }], {
      onDone: next,
      onFail: interruptExam,
    });
  }

  function examIntro() {
    const s = st.section;
    st.phase = 'intro';
    paintStatus();
    narrate(`${s.intro || ''} First, you have some time to look at ${rangeEn(s.groups[0])}.`.trim(), () => examReading(0));
  }

  function examReading(gi) {
    st.groupIdx = gi;
    st.phase = 'reading';
    countdown(READ_SEC, () => examPlay(gi));
  }

  function examPlay(gi) {
    const s = st.section;
    st.phase = 'playing';
    st.segIdx = s.groups[gi].from;
    paintStatus();
    speakSeq(segItems(s.groups[gi].from, groupEnd(gi), EXAM_RATE), {
      onItem: (it) => {
        st.segIdx = it.seg;
        paintStatus();
      },
      onDone: () => (gi + 1 < s.groups.length ? examBetween(gi + 1) : examEnd()),
      onFail: interruptExam,
    });
  }

  function examBetween(gi) {
    const s = st.section;
    st.groupIdx = gi;
    st.phase = 'narrating';
    paintStatus();
    const kind = s.part === 1 || s.part === 3 ? 'conversation' : 'talk';
    narrate(`Before you hear the rest of the ${kind}, you have some time to look at ${rangeEn(s.groups[gi])}.`, () => examReading(gi));
  }

  function examEnd() {
    st.phase = 'narrating-end';
    paintStatus();
    narrate(`That is the end of Part ${st.section.part}. You now have thirty seconds to check your answers.`, () => {
      st.phase = 'check';
      countdown(CHECK_SEC, () => submit(true));
    });
  }

  // 考试中断：音频只能播一次，不续播；检查阶段被打断则停在检查阶段
  function interruptExam(reason) {
    haltAll();
    st.interruptReason = reason || '';
    st.phase = st.phase === 'check' || st.phase === 'check-hold' || st.phase === 'narrating-end' ? 'check-hold' : 'interrupted';
    paintStatus();
  }

  function examToPractice() {
    haltAll();
    st.mode = 'practice';
    st.phase = 'paused';
    st.cursor = st.segIdx >= 0 ? st.segIdx : st.section.groups[st.groupIdx].from;
    st.showScript = !st.tts.ok;
    paintRun();
    NCE.toast('已转为练习模式，交卷时记为练习', 'ok');
  }

  // ---------- 练习模式 ----------
  function practicePlay(from, single) {
    if (!st.tts.ok) {
      NCE.toast('没有可用的英文声音，请看脚本做题', 'warn');
      return;
    }
    const last = st.section.segments.length - 1;
    st.cursor = Math.min(last, Math.max(0, from));
    st.phase = 'playing';
    paintStatus();
    speakSeq(segItems(st.cursor, single ? st.cursor : last, st.rate), {
      onItem: (it) => {
        st.cursor = it.seg;
        paintStatus();
      },
      onDone: () => {
        st.phase = !single && st.cursor === last ? 'ended' : 'paused';
        paintStatus();
      },
      onFail: (err) => {
        haltAll();
        st.phase = 'paused';
        paintStatus();
        if (err !== 'interrupted' && err !== 'canceled') {
          NCE.toast(ttsErrorText(err), 'warn');
        }
      },
    });
  }

  function practicePause() {
    haltAll();
    st.phase = 'paused';
    paintStatus();
  }

  function practiceJump(i) {
    if (st.phase === 'playing') practicePlay(i, false);
    else {
      st.cursor = i;
      if (st.phase === 'ended' || st.phase === 'idle') st.phase = 'paused';
      paintStatus();
    }
  }

  // ---------- 交卷 ----------
  async function submit(auto) {
    if (st.stage !== 'run' || st.phase === 'submitting') return;
    const msg = root.querySelector('.iel-msg');
    if (!auto && st.mode === 'practice' && !st.submitArmed) {
      const blank = unansweredCount();
      if (blank > 0) {
        st.submitArmed = true;
        msg.className = 'ie-msg iel-msg bad';
        msg.textContent = `还有 ${blank} 题没作答，确定交卷就再点一次「交卷」`;
        return;
      }
    }
    haltAll();
    st.phase = 'submitting';
    paintStatus();
    msg.className = 'ie-msg iel-msg';
    msg.textContent = '';
    const sectionId = st.section.id;
    let r;
    try {
      r = await IE.post(
        `/api/ielts/listening/${encodeURIComponent(sectionId)}/submit`,
        { answers: answeredMap(), durationSec: elapsedSec(), mode: st.mode },
        { quiet: true }
      );
      if (!r || !Array.isArray(r.results)) throw new Error('服务端返回格式不对');
    } catch (e) {
      if (!alive() || st.stage !== 'run' || !st.section || st.section.id !== sectionId) return;
      st.phase = 'submit-failed';
      st.submitError = e.message;
      st.submitArmed = true;
      paintStatus();
      const m = root.querySelector('.iel-msg');
      if (m) {
        m.className = 'ie-msg iel-msg bad';
        m.textContent = `交卷失败：${e.message}。答案还在页面上，可以点「重新交卷」。`;
      }
      return;
    }
    if (!alive() || st.stage !== 'run' || !st.section || st.section.id !== sectionId) return;
    st.result = r;
    st.stage = 'review';
    st.reviewSeg = -1;
    renderReview();
    window.scrollTo(0, 0);
  }

  // ---------- 复盘 ----------
  function optionText(g, q, key) {
    const o = optionsOf(g, q).find((x) => x.key === String(key || '').toUpperCase());
    return o ? o.text : '';
  }
  function withCommas(s) {
    return /^\d{4,}$/.test(s) ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : s;
  }

  // 先在原文里定位，再逐片转义，避免在转义后的 HTML 上做替换
  function highlightHtml(text, phrases) {
    const lower = text.toLowerCase();
    const ranges = [];
    for (const p of phrases) {
      const needle = String(p || '').toLowerCase().trim();
      if (!needle) continue;
      let from = 0;
      for (;;) {
        const i = lower.indexOf(needle, from);
        if (i < 0) break;
        const before = i > 0 ? lower[i - 1] : '';
        const after = lower[i + needle.length] || '';
        if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) ranges.push([i, i + needle.length]);
        from = i + 1;
      }
    }
    if (!ranges.length) return esc(text);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) {
      const lastRange = merged[merged.length - 1];
      if (lastRange && r[0] <= lastRange[1]) lastRange[1] = Math.max(lastRange[1], r[1]);
      else merged.push(r.slice());
    }
    let out = '';
    let pos = 0;
    for (const [a, b] of merged) {
      out += `${esc(text.slice(pos, a))}<mark>${esc(text.slice(a, b))}</mark>`;
      pos = b;
    }
    return out + esc(text.slice(pos));
  }

  function reviewIndex() {
    const bySeg = new Map(); // 段 -> { nos: [], phrases: [] }
    const byNo = new Map();
    for (const x of st.result.results) {
      byNo.set(x.no, x);
      if (!Number.isInteger(x.segment)) continue;
      const e = bySeg.get(x.segment) || { nos: [], phrases: [] };
      e.nos.push(x.no);
      if (x.evidence) e.phrases.push(x.evidence);
      else (Array.isArray(x.answer) ? x.answer : []).forEach((a) => e.phrases.push(a, withCommas(String(a))));
      bySeg.set(x.segment, e);
    }
    return { bySeg, byNo };
  }

  function resultHtml(g, q, x) {
    const choice = CHOICE_TYPES.includes(g.type);
    const answers = Array.isArray(x.answer) ? x.answer : [];
    const show = (key) => {
      const t = optionText(g, q, key);
      return t ? `${String(key).toUpperCase()} · ${t}` : String(key);
    };
    const yours = x.yours ? (choice ? show(x.yours) : x.yours) : '';
    const main = answers.length ? (choice ? show(answers[0]) : answers[0]) : '';
    const others = choice ? [] : answers.slice(1);
    const prompt = choice ? q.prompt : gapParts(q.prompt).map((p) => p.trim()).filter(Boolean).join(' ____ ');
    const canLocate = Number.isInteger(x.segment);
    return (
      `<div class="iel-res${x.correct ? ' ok' : ''}">` +
      `<div class="iel-res-h"><span class="iel-no">${esc(x.no)}</span><span>${esc(prompt)}</span><span class="iel-mark">${x.correct ? '✓ 正确' : '✗ 错误'}</span></div>` +
      `<div>你的答案：${yours ? `<b>${esc(yours)}</b>` : '<span class="ie-muted">（未作答）</span>'}` +
      (x.overLimit ? ` <span class="ie-pill warn">超出字数限制 ${esc(g.wordLimit || '')}</span>` : '') +
      '</div>' +
      `<div>正确答案：<b>${esc(main)}</b>${others.length ? ` <span class="ie-muted">（也接受：${others.map((a) => esc(a)).join(' / ')}）</span>` : ''}</div>` +
      (x.explanation ? `<div class="iel-res-e">💡 ${esc(x.explanation)}</div>` : '') +
      (canLocate ? `<button type="button" class="btn small ghost iel-loc" data-seg="${esc(x.segment)}">📍 原文第 ${esc(x.segment + 1)} 段${st.tts.ok ? ' · 重听' : ''}</button>` : '') +
      '</div>'
    );
  }

  function renderReview() {
    const s = st.section;
    const r = st.result;
    const { bySeg, byNo } = reviewIndex();
    const part = PART_INFO[s.part] || { name: `Part ${s.part}` };
    const mode = r.mode || st.mode;
    const groupsHtml = s.groups.map((g) => {
      const rows = g.questions.map((q) => {
        const x = byNo.get(q.no);
        return x ? resultHtml(g, q, x) : '';
      }).join('');
      const right = g.questions.filter((q) => byNo.get(q.no) && byNo.get(q.no).correct).length;
      return `<div class="iel-sub">Questions ${esc(rangeText(g))} · ${esc(TYPE_LABEL[g.type] || g.type)} · 对 ${right} / ${g.questions.length}</div>${rows}`;
    }).join('');
    const scriptHtml = s.segments.map((sg, i) => {
      const e = bySeg.get(i);
      return (
        `<div class="iel-seg${e ? ' ans' : ''}" data-seg="${i}">` +
        `<div class="iel-seg-h"><b>${esc(speakerName(sg.speaker))}</b><span>#${i + 1}</span>${e ? e.nos.map((n) => `<span class="iel-qb">Q${esc(n)}</span>`).join('') : ''}</div>` +
        `<div>${e ? highlightHtml(sg.text, e.phrases) : esc(sg.text)}</div></div>`
      );
    }).join('');

    root.innerHTML =
      '<div class="iel-review">' +
      '<div class="iel-top">' +
      '<button type="button" class="btn small ghost iel-back">← 题目列表</button>' +
      `<span class="t">${esc(part.name)} · ${esc(s.title)} · 结果</span>` +
      '</div>' +
      '<div class="ie-card">' +
      '<div class="iel-score">' +
      `<span class="ie-muted">原始分</span><b>${esc(r.raw)} / ${esc(r.total)}</b>` +
      `<span class="ie-muted">估算 Band</span><b>≈ ${esc(IE.fmtBand(r.band))}</b>` +
      (r.isBest ? '<span class="ie-pill ok">本题新纪录</span>' : '') +
      '</div>' +
      `<div class="ie-muted" style="margin-top:6px">${esc(MODE_LABEL[mode] || mode)} · 用时 ${esc(IE.fmtDuration(r.durationSec))} · 折算到 40 题约 ${esc(r.raw40)} 分</div>` +
      (r.bandNote ? `<div class="ie-note" style="margin-top:10px">${esc(r.bandNote)}</div>` : '') +
      '</div>' +
      `<div class="ie-card"><h3>📝 逐题复盘</h3>${groupsHtml}</div>` +
      '<div class="ie-card">' +
      `<h3>📜 脚本 <span class="ie-h3-sub">绿色段落含答案（标出题号，答案词高亮）${st.tts.ok ? '；点任意一段重听' : ''}</span></h3>` +
      (st.tts.ok ? `<div style="margin-bottom:10px">${rateHtml()}</div>` : ttsNoteHtml()) +
      `<div class="iel-script">${scriptHtml}</div>` +
      '</div>' +
      '<div class="ie-row" style="margin-top:14px">' +
      '<button type="button" class="btn primary iel-again-practice">再练一次（练习模式）</button>' +
      `<button type="button" class="btn iel-again-exam"${st.tts.ok ? '' : ' disabled'}>再考一次（考试模式）</button>` +
      '<button type="button" class="btn ghost iel-back2">返回列表</button>' +
      '</div>' +
      '</div>';

    const wrap = root.querySelector('.iel-review');
    wrap.querySelector('.iel-back').onclick = renderList;
    wrap.querySelector('.iel-back2').onclick = renderList;
    wrap.querySelector('.iel-again-practice').onclick = () => startRun('practice');
    wrap.querySelector('.iel-again-exam').onclick = () => startRun('exam');
    bindRate(wrap, null);
    wrap.querySelector('.iel-script').onclick = (e) => {
      const seg = e.target.closest('.iel-seg');
      if (seg) reviewPlay(Number(seg.dataset.seg), false);
    };
    wrap.querySelectorAll('.iel-loc').forEach((b) => {
      b.onclick = () => reviewPlay(Number(b.dataset.seg), true);
    });
  }

  // 复盘：定位并重听某一段
  function reviewPlay(i, scroll) {
    const wrap = root.querySelector('.iel-review');
    if (!wrap) return;
    wrap.querySelectorAll('.iel-script .iel-seg').forEach((el) => {
      el.classList.toggle('focus', Number(el.dataset.seg) === i);
      el.classList.remove('cur');
    });
    const el = wrap.querySelector(`.iel-script .iel-seg[data-seg="${i}"]`);
    if (el && scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!st.tts.ok) {
      if (!scroll) NCE.toast('没有可用的英文声音，无法重听', 'warn');
      return;
    }
    if (!st.cast) st.cast = castVoices(st.section, st.tts.voices);
    speakSeq(segItems(i, i, st.rate), {
      onItem: () => {
        if (el) el.classList.add('cur');
      },
      onDone: () => {
        if (el) el.classList.remove('cur');
      },
      onFail: (err) => {
        if (el) el.classList.remove('cur');
        if (err !== 'interrupted' && err !== 'canceled') NCE.toast(ttsErrorText(err), 'warn');
      },
    });
  }

  // ---------- 生命周期 ----------
  // 页面隐藏 / 切走标签：停止朗读和计时；考试中断，练习暂停
  function suspend(reason) {
    haltAll();
    if (st.stage !== 'run') return;
    if (st.mode === 'exam') {
      if (['intro', 'narrating', 'reading', 'playing', 'narrating-end', 'check'].includes(st.phase)) interruptExam(reason);
    } else if (st.phase === 'playing') {
      st.phase = 'paused';
      paintStatus();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && st.visible && root && alive()) suspend('hidden');
  });
  // 关闭 / 刷新页面时部分浏览器不会自动停止朗读
  window.addEventListener('pagehide', () => {
    if (sp.active) stopSpeech();
  });

  // ---------- 对外：朗读引擎（全真模考页复用，只是把上面的函数挂出去，不改变本页行为）----------
  // speak(items, { onItem, onDone, onFail })：items 为 [{ text, cast: { voice, pitch }, rate, seg, gapAfter }]；
  // stop()：停止朗读并清掉朗读用到的定时器，调用方离开页面时必须调用。两个子页不会同时朗读（切子页先 leave）。
  IE.listeningTts = {
    detect: detectTts,
    castVoices,
    speak: speakSeq,
    stop: haltAll,
    voiceLabel,
    errorText: ttsErrorText,
    GAP_SAME_MS,
    GAP_SWITCH_MS,
  };

  IE.registerPage('listening', {
    meta: { label: '听力', icon: '🎧', before: 'writing' },
    render(body, c) {
      root = body;
      ctx = c;
      st.visible = true;
      renderList();
    },
    // 准备页 / 作答中 / 复盘时切走再回来保留现场（作答中已在 pause 时停止朗读）
    resume() {
      if (!root || !root.isConnected || st.stage === 'list') return false;
      st.visible = true;
      paintStatus();
      return true;
    },
    pause() {
      st.visible = false;
      suspend('hidden');
    },
    leave() {
      st.visible = false;
      haltAll();
      st.stage = 'list';
      st.section = null;
      st.result = null;
      st.answers = {};
    },
  });
})();
