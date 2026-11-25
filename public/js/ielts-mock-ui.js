'use strict';
// 雅思备考 · 全真模考子页：听力 → 阅读 → 写作 → 口语按考试顺序限时连做，最后出四项与总分。
// 听力：复用听力子页导出的 NCE.ielts.listeningTts 朗读，考试模式只播一遍，每组题前 30 秒读题，播完 2 分钟检查后自动交卷。
// 阅读 60 分钟、写作 60 分钟各自一个倒计时，时间到自动收卷；口语录音只存在浏览器内存（MediaRecorder + blob URL）。
// 每部分提交保存后才能进入下一部分；正在计时的部分被中断（切子页 / 切标签 / 刷新；听力另含页面隐藏）后，
// 只能「重新开始本部分」或「放弃本部分」。写作、口语进入自评后内容已冻结（存 localStorage），中断后可直接续做。
// 接口：POST /api/ielts/mock/start、GET /api/ielts/mock/:id、POST /api/ielts/mock/:id/section、
//       POST /api/ielts/mock/:id/finish、GET /api/ielts/mocks；题目取各模块已有的 GET 接口。
// 设计：docs/design/ielts-mock-20261125.md
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE || !IE.registerPage) return;
  const esc = NCE.escapeHtml; // 转义 & < > "；本文件的 HTML 属性一律用双引号

  const SECTIONS = ['listening', 'reading', 'writing', 'speaking'];
  const INFO = {
    listening: { label: '听力', icon: '🎧', desc: '4 个 Part 共 40 题，约 25–30 分钟。音频只播一遍，不能暂停或回放；每组题前 30 秒读题，全部播完后 2 分钟检查，时间到自动交卷。需要浏览器的英文语音。' },
    reading: { label: '阅读', icon: '📖', desc: '3 篇文章（易 → 中 → 难）共 39 题，60 分钟共用一个倒计时，时间到自动交卷。' },
    writing: { label: '写作', icon: '✍️', desc: 'Task 1 + Task 2 共 60 分钟（建议 Task 1 用 20 分钟、Task 2 用 40 分钟），时间到自动收卷；之后两篇分别四维自评。' },
    speaking: { label: '口语', icon: '🎙️', desc: 'Part 1 问答 → Part 2 准备 1 分钟、作答 2 分钟 → Part 3 追问。作答时自动录音（只存在本页内存，不上传），最后回听并四维自评。' },
  };
  const READ_SEC = 30;
  const CHECK_SEC = 120;
  const READING_SEC = 3600;
  const WRITING_SEC = 3600;
  const TASK1_HINT_SEC = 20 * 60;
  const PREP_SEC = 60;
  const TALK_SEC = 120;
  const MIN_WORDS = { task1: 150, task2: 250 };
  const MAX_DURATION = { listening: 7200, reading: 14400, writing: 14400, speaking: 3600 };
  const ARM_MS = 4000;
  const CAN_RECORD = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const STATE_LABEL = { pending: '未开始', running: '进行中', done: '已保存', skipped: '已放弃' };
  const STATUS_PILL = { 'in-progress': ['进行中', ''], finished: ['已出分', 'ok'], abandoned: ['已放弃', 'mute'] };
  const L_TYPE = {
    'form-completion': '表格填空', 'note-completion': '笔记填空', 'sentence-completion': '句子填空',
    'summary-completion': '摘要填空', mcq: '单选', matching: '匹配',
  };
  const R_TYPE = {
    tfng: 'TRUE / FALSE / NOT GIVEN', ynng: 'YES / NO / NOT GIVEN', 'matching-headings': '段落标题配对',
    'matching-information': '信息配对', mcq: '单选', 'sentence-completion': '句子填空', 'summary-completion': '摘要填空', 'short-answer': '简答',
  };
  const JUDGE = { tfng: ['TRUE', 'FALSE', 'NOT GIVEN'], ynng: ['YES', 'NO', 'NOT GIVEN'] };
  const DIFF_LABEL = { easy: '易', medium: '中', hard: '难' };
  // 计时中被打断后仍可直接续做的阶段（内容已冻结或已经在提交）
  const RESUMABLE = {
    listening: ['check-hold', 'submitting', 'submit-failed'],
    reading: ['submitting', 'submit-failed'],
    writing: ['assess', 'submitting', 'submit-failed'],
    speaking: ['assess', 'submitting', 'submit-failed'],
  };
  const REASON = {
    leave: '切到了别的子页',
    tab: '切到了别的标签页',
    hidden: '切到了别的窗口或浏览器标签（听力朗读会被打断）',
    exit: '主动退出了本部分',
  };

  const style = document.createElement('style');
  style.textContent = `
    .iem-top{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;margin-bottom:12px}
    .iem-top .t{font-weight:700;color:var(--ink);font-size:14px;min-width:0;overflow-wrap:anywhere}
    .iem-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:14px}
    @media (max-width:560px){.iem-steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
    .iem-step{border:1px solid var(--border);border-radius:var(--radius-sm);padding:9px 10px;background:var(--card);min-width:0}
    .iem-step.cur{border-color:var(--brand);box-shadow:var(--ring)}
    .iem-step.done{border-color:rgba(22,163,74,.45)}
    .iem-step.skipped{opacity:.65}
    .iem-step b{display:block;font-size:14px;color:var(--ink)}
    .iem-step span{font-size:12px;color:var(--muted)}
    .iem-bar{position:sticky;top:0;z-index:6;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:12px;box-shadow:var(--shadow-sm)}
    html[data-theme=midnight] .iem-bar{background:#0f1424}
    .iem-bar-row{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap}
    .iem-phase{font-weight:800;color:var(--ink);font-size:14px}
    .iem-clock{font-size:22px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--brand);line-height:1}
    .iem-clock.warn{color:#d97706}
    .iem-clock.over{color:var(--bad)}
    .iem-now{font-size:13px;color:var(--muted);line-height:1.6;flex:1 1 200px;min-width:0}
    .iem-prog{height:5px;border-radius:999px;background:rgba(127,127,127,.16);overflow:hidden;margin-top:8px}
    .iem-prog i{display:block;height:100%;width:0;background:var(--accent-grad);transition:width .3s}
    .iem-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .iem-tab{padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--ink-soft);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    .iem-tab.on{background:var(--brand);border-color:var(--brand);color:#fff}
    .iem-tab small{font-weight:600;opacity:.8}
    .iem-part{margin-top:16px}
    .iem-part-h{font-weight:800;color:var(--ink);font-size:15.5px}
    .iem-group{border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:12px 14px;margin-top:10px;background:var(--card);min-width:0}
    .iem-group.cur{border-color:var(--brand);box-shadow:var(--ring)}
    .iem-gh{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;font-weight:800;color:var(--ink);font-size:14px}
    .iem-ins{font-size:13px;color:var(--ink-soft);line-height:1.6;margin-top:4px;overflow-wrap:anywhere}
    .iem-limit{font-size:12px;font-weight:800;color:#d97706;margin-top:4px}
    .iem-gt{font-weight:800;color:var(--ink);margin:10px 0 2px;overflow-wrap:anywhere}
    .iem-row{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;font-size:14px;color:var(--ink);line-height:1.7;margin-top:8px;overflow-wrap:anywhere}
    .iem-heading{font-weight:700;color:var(--ink-soft);font-size:13px;margin-top:10px}
    .iem-no{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:22px;padding:0 5px;border-radius:6px;background:rgba(47,111,237,.12);color:var(--brand);font-size:12px;font-weight:800;flex:none;font-variant-numeric:tabular-nums}
    .iem-in{width:10em;max-width:100%;padding:4px 8px;font-size:14px}
    .iem-sel{max-width:100%;padding:5px 28px 5px 8px;font-size:13.5px}
    .iem-para{font-size:14px;line-height:2.3;color:var(--ink);margin:8px 0 0;overflow-wrap:anywhere}
    .iem-gap{display:inline-flex;align-items:center;gap:4px;max-width:100%;vertical-align:middle}
    .iem-para .iem-in{width:8em}
    .iem-q{margin-top:10px}
    .iem-qh{display:flex;gap:8px;align-items:baseline;font-size:14px;color:var(--ink);line-height:1.6;overflow-wrap:anywhere}
    .iem-opts{display:flex;flex-direction:column;gap:5px;margin:6px 0 0 34px}
    .iem-choices{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0 34px}
    .iem-line{margin:6px 0 0 34px}
    @media (max-width:480px){.iem-opts,.iem-choices,.iem-line{margin-left:0}}
    .iem-opt{display:flex;gap:8px;align-items:flex-start;width:100%;box-sizing:border-box;text-align:left;padding:6px 10px;border:1px solid var(--border-soft);border-radius:8px;background:var(--card);cursor:pointer;font-size:13.5px;color:var(--ink-soft);line-height:1.5;font-family:inherit;overflow-wrap:anywhere}
    .iem-opt input{margin-top:3px;flex:none;accent-color:var(--brand)}
    .iem-choice{padding:5px 11px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink-soft);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    .iem-opt:hover,.iem-choice:hover{border-color:var(--brand)}
    .iem-opt.on,.iem-choice.on{background:rgba(47,111,237,.12);border-color:var(--brand);color:var(--ink)}
    .iem-choice.on{background:var(--brand);color:#fff}
    .iem-opt:disabled,.iem-choice:disabled{cursor:default;opacity:.75}
    .iem-box{border:1px dashed var(--border);border-radius:var(--radius-sm);padding:8px 12px;margin-top:8px;font-size:13.5px;color:var(--ink-soft);line-height:1.7;overflow-wrap:anywhere}
    .iem-box b{color:var(--ink);margin-right:6px}
    .iem-bank{display:flex;flex-wrap:wrap;gap:2px 14px}
    .iem-cols{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px;align-items:start}
    @media (max-width:959px){.iem-cols{grid-template-columns:minmax(0,1fr)}}
    .iem-pane{border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;background:var(--card);min-width:0}
    @media (min-width:960px){.iem-pane{max-height:calc(100vh - 200px);overflow:auto;overscroll-behavior:contain}}
    .iem-passage{font-family:Georgia,"Times New Roman",serif;font-size:15px;line-height:1.8;color:var(--ink);overflow-wrap:break-word}
    .iem-passage h3{margin:0 0 10px;font-size:17px;color:var(--ink);line-height:1.4}
    .iem-passage p{margin:0 0 12px;display:flex;gap:10px;align-items:flex-start}
    .iem-passage p b{flex:none;width:22px;height:22px;margin-top:3px;border-radius:6px;background:rgba(127,127,127,.14);font:800 12px/22px system-ui,sans-serif;text-align:center}
    .iem-passage p span{flex:1;min-width:0}
    .iem-prompt{font-size:14.5px;line-height:1.7;color:var(--ink);white-space:pre-line;overflow-wrap:anywhere}
    .iem-bullets{margin:8px 0 0;padding-left:20px;font-size:14px;color:var(--ink);line-height:1.7}
    .iem-ta{display:block;width:100%;min-height:340px;box-sizing:border-box;margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card);color:var(--ink);font:15px/1.7 Georgia,"Times New Roman",serif;resize:vertical}
    .iem-ta:focus{outline:none;border-color:var(--brand);box-shadow:var(--ring)}
    html[data-theme=midnight] .iem-ta{background:rgba(255,255,255,.06);color-scheme:dark}
    .iem-wc{font-size:13px;color:var(--muted);margin-top:6px}
    .iem-wc.ok{color:var(--ok)}
    .iem-essay{font-family:Georgia,"Times New Roman",serif;color:var(--ink);line-height:1.7;overflow-wrap:anywhere}
    .iem-essay p{margin:0 0 8px}
    .iem-cue{border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;background:rgba(127,127,127,.04);line-height:1.7;color:var(--ink);overflow-wrap:anywhere}
    .iem-cue .t{font-weight:800;font-size:15.5px}
    .iem-cue ul{margin:4px 0;padding-left:20px}
    .iem-sq{font-size:16px;font-weight:700;color:var(--ink);line-height:1.6;overflow-wrap:anywhere}
    .iem-notes{display:block;width:100%;box-sizing:border-box;min-height:80px;margin-top:10px}
    .iem-recdot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--bad);margin-right:6px;animation:iemBlink 1s infinite}
    @keyframes iemBlink{50%{opacity:.25}}
    .iem-audio{display:block;width:100%;max-width:420px;margin-top:6px}
    .iem-sitem{border-top:1px dashed var(--border);padding:10px 0;font-size:14px;color:var(--ink-soft);line-height:1.6;overflow-wrap:anywhere}
    .iem-sitem:first-child{border-top:none;padding-top:0}
    .iem-sitem b{color:var(--ink)}
    .iem-note-s{font-size:12.5px;color:var(--muted);line-height:1.6;margin:8px 0}
    .iem-overall{display:flex;align-items:baseline;gap:6px 14px;flex-wrap:wrap}
    .iem-overall b{font-size:44px;font-weight:900;color:var(--brand);line-height:1}
    .iem-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}
    @media (max-width:560px){.iem-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
    .iem-tile{border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:10px 12px;min-width:0}
    .iem-tile b{display:block;font-size:24px;font-weight:900;color:var(--ink);line-height:1.2}
    .iem-tile span{display:block;font-size:12px;color:var(--muted);line-height:1.5;overflow-wrap:anywhere}
    .iem-up{color:var(--ok);font-weight:800}
    .iem-down{color:var(--bad);font-weight:800}
    .iem-sub{font-size:13.5px;font-weight:700;color:var(--ink-soft);margin:14px 0 2px;overflow-wrap:anywhere}
    .iem-sub:first-of-type{margin-top:0}
    .iem-wrong{border:1px solid var(--border-soft);border-left:3px solid var(--bad);border-radius:8px;padding:6px 10px;margin-top:6px;font-size:13.5px;color:var(--ink-soft);line-height:1.65;overflow-wrap:anywhere}
    .iem-wrong summary{cursor:pointer;color:var(--ink)}
    .iem-wrong .q{margin-top:4px;color:var(--ink)}
    .iem-wrong .ev{margin-top:4px;padding:4px 8px;border-left:3px solid var(--brand);background:rgba(127,127,127,.06);font-family:Georgia,"Times New Roman",serif}
    .iem-hist{display:flex;flex-direction:column;gap:8px}
    .iem-hi{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;cursor:pointer;background:var(--card)}
    .iem-hi:hover,.iem-hi:focus{border-color:var(--brand);outline:none}
    .iem-hi .d{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
    .iem-hi .s{flex:1 1 220px;font-size:13.5px;color:var(--ink-soft);min-width:0}
    .iem-hi .o{font-size:18px;font-weight:900;color:var(--brand)}
    .iem-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
    .iem-rules{margin:0;padding-left:20px}
    .iem-rules li{margin:3px 0}
  `;
  document.head.appendChild(style);

  // ---------- 状态 ----------
  // live：正在进行的那一部分（只在页面内存里）。{ mockId, section, startedAt（服务端开始时间）, localStart, phase,
  // interrupted, reason, durationSec, ...各部分的作答数据 }。与服务端 sections[section].startedAt 一致才算同一次作答。
  const st = {
    stage: 'home', // home | loading | overview | listening | reading | writing | speaking | result | abandoned | left
    visible: false,
    mock: null, // 当前模考视图（服务端返回）
    live: null,
    armed: '',
    armedAt: 0,
  };
  let root = null;
  let ctx = null;

  function alive() {
    return !!(ctx && ctx.isActive() && root && root.isConnected);
  }

  // ---------- 定时器：全部登记，切走 / 换阶段时一次清空 ----------
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

  // ---------- 朗读（听力子页导出的引擎）----------
  let ttsBusy = false;
  function tts() {
    return IE.listeningTts || null;
  }
  function stopSpeech() {
    const t = tts();
    if (t && ttsBusy) {
      try {
        t.stop();
      } catch (e) {
        console.warn('[ielts-mock] 停止朗读失败', e);
      }
    }
    ttsBusy = false;
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {
      console.warn('[ielts-mock] speechSynthesis.cancel 失败', e);
    }
  }

  // ---------- 录音（只在内存，D4）----------
  const rec = { stream: null, recorder: null, chunks: [], urls: [], denied: false, pending: null };
  function speakingAnswering() {
    const L = st.live;
    return !!(L && L.section === 'speaking' && L.phase === 'answer' && !L.interrupted);
  }
  // 申请麦克风；授权弹窗期间的多次调用共用同一次 getUserMedia；授权回来时已不在作答中就立刻关麦
  function ensureMic() {
    if (!CAN_RECORD || rec.denied) return Promise.resolve(null);
    if (rec.stream) return Promise.resolve(rec.stream);
    if (rec.pending) return rec.pending;
    rec.pending = navigator.mediaDevices.getUserMedia({ audio: true }).then(
      (stream) => {
        rec.stream = stream;
        if (!speakingAnswering()) {
          releaseMic();
          return null;
        }
        return stream;
      },
      (e) => {
        rec.denied = true;
        console.warn('[ielts-mock] 麦克风不可用', e);
        NCE.toast('麦克风不可用（' + (e && e.name === 'NotAllowedError' ? '权限被拒绝' : '没有设备或被占用') + '），口语只计时不录音', 'warn');
        return null;
      }
    ).finally(() => {
      rec.pending = null;
    });
    return rec.pending;
  }
  function recStart() {
    if (!rec.stream) return false;
    try {
      rec.chunks = [];
      const r = new MediaRecorder(rec.stream);
      r.ondataavailable = (e) => {
        if (e.data && e.data.size) rec.chunks.push(e.data);
      };
      r.start();
      rec.recorder = r;
      return true;
    } catch (e) {
      console.warn('[ielts-mock] 录音启动失败', e);
      NCE.toast('录音启动失败，本题只计时', 'warn');
      rec.recorder = null;
      return false;
    }
  }
  // 停止录音，返回回听用的 blob URL（没有录到时为 null）
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
      try {
        r.stop();
      } catch (e) {
        resolve(null);
      }
    });
  }
  // 关麦：停掉录音和音轨（浏览器的录音指示随之消失）；已录好的回听 URL 保留
  function releaseMic() {
    const r = rec.recorder;
    rec.recorder = null;
    if (r && r.state !== 'inactive') {
      r.onstop = null;
      try {
        r.stop();
      } catch (e) {
        console.warn('[ielts-mock] 停止录音失败', e);
      }
    }
    rec.chunks = [];
    if (rec.stream) {
      rec.stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (e) {
          console.warn('[ielts-mock] 关闭音轨失败', e);
        }
      });
      rec.stream = null;
    }
  }
  function dropRecordings() {
    rec.urls.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch (e) {
        console.warn('[ielts-mock] 释放录音失败', e);
      }
    });
    rec.urls = [];
  }

  // ---------- 写作图表（resize 监听要释放）----------
  let chartDisposers = [];
  function disposeCharts() {
    chartDisposers.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn('[ielts-mock] 图表释放失败', e);
      }
    });
    chartDisposers = [];
  }

  function haltAll() {
    stopSpeech();
    clearTimers();
    releaseMic();
    disposeCharts();
  }

  // ---------- 自评阶段的冻结内容（localStorage，按档案隔离）----------
  function frozenKey(id) {
    return IE.storeKey('mock-frozen:' + id);
  }
  function readFrozen(id) {
    try {
      const raw = localStorage.getItem(frozenKey(id));
      const f = raw ? JSON.parse(raw) : null;
      return f && typeof f === 'object' ? f : null;
    } catch (e) {
      console.warn('[ielts-mock] 读取自评草稿失败', e);
      return null;
    }
  }
  function writeFrozen(id, data) {
    try {
      localStorage.setItem(frozenKey(id), JSON.stringify(data));
    } catch (e) {
      console.warn('[ielts-mock] 保存自评草稿失败', e);
      NCE.toast('浏览器存储不可用：自评完成前请不要刷新或离开本页', 'warn');
    }
  }
  function clearFrozen(id) {
    if (!id) return;
    try {
      localStorage.removeItem(frozenKey(id));
    } catch (e) {
      console.warn('[ielts-mock] 清除自评草稿失败', e);
    }
  }
  // 与服务端「本部分仍在计时、开始时间一致」的冻结内容才能续做
  function frozenFor(v, name) {
    const s = v.sections[name];
    if (!s || s.state !== 'running' || (name !== 'writing' && name !== 'speaking')) return null;
    const f = readFrozen(v.id);
    if (!f || f.section !== name || f.startedAt !== s.startedAt || !Number.isInteger(f.durationSec)) return null;
    if (name === 'writing') {
      const ok = f.texts && typeof f.texts.task1 === 'string' && typeof f.texts.task2 === 'string' && f.taskSec &&
        Number.isFinite(f.taskSec.task1) && Number.isFinite(f.taskSec.task2);
      return ok ? f : null;
    }
    return Array.isArray(f.steps) && f.steps.every((x) => x && typeof x.label === 'string') ? f : null;
  }

  // ---------- 接口 ----------
  const api = {
    list: () => IE.get('/api/ielts/mocks?limit=50'),
    get: (id) => IE.get('/api/ielts/mock/' + encodeURIComponent(id)),
    start: (replace) => IE.post('/api/ielts/mock/start', replace ? { replaceActive: true } : {}, { quiet: true }),
    section: (id, body) => IE.post(`/api/ielts/mock/${encodeURIComponent(id)}/section`, body, { quiet: true }),
    finish: (id, body) => IE.post(`/api/ielts/mock/${encodeURIComponent(id)}/finish`, body || {}, { quiet: true }),
  };

  // ---------- 小工具 ----------
  function setMsg(text, cls) {
    const el = root && root.querySelector('.iem-msg');
    if (!el) return;
    el.className = 'ie-msg iem-msg' + (cls ? ' ' + cls : '');
    el.textContent = text || '';
  }
  // 需要二次确认的按钮：第一次点只改文字，ARM_MS 内再点一次才执行
  function confirmTwice(key, btn, prompt) {
    const now = Date.now();
    if (st.armed === key && now - st.armedAt < ARM_MS) {
      st.armed = '';
      return true;
    }
    st.armed = key;
    st.armedAt = now;
    if (btn) {
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.textContent = prompt;
      later(() => {
        if (btn.isConnected && btn.dataset.label) btn.textContent = btn.dataset.label;
      }, ARM_MS);
    }
    return false;
  }
  function countWords(text) {
    const s = String(text == null ? '' : text).trim();
    return s ? s.split(/\s+/).length : 0;
  }
  function paragraphsHtml(text) {
    const paras = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (!paras.length) return '<p class="ie-muted">（空）</p>';
    return paras.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  function elapsedSec(L, section) {
    return Math.min(MAX_DURATION[section], Math.max(0, Math.round((Date.now() - L.localStart) / 1000)));
  }
  function topBar(backLabel, title) {
    return (
      '<div class="iem-top">' +
      `<button type="button" class="btn small ghost iem-back">${esc(backLabel)}</button>` +
      (title ? `<span class="t">${esc(title)}</span>` : '') +
      '</div>'
    );
  }
  function fmtDelta(d) {
    if (d == null || !Number.isFinite(Number(d))) return '';
    const n = Number(d);
    if (n > 0) return ` <span class="iem-up">↑${n.toFixed(1)}</span>`;
    if (n < 0) return ` <span class="iem-down">↓${Math.abs(n).toFixed(1)}</span>`;
    return ' <span class="ie-muted">持平</span>';
  }
  function sectionBandsText(result) {
    if (!result) return '';
    return SECTIONS.map((k) => `${INFO[k].label} ${IE.fmtBand(result[k])}`).join(' · ');
  }

  // ---------- 首页 ----------
  async function renderHome() {
    haltAll();
    st.stage = 'home';
    st.mock = null;
    root.innerHTML = '<div class="ie-loading">正在加载模考记录…</div>';
    let data;
    try {
      data = await api.list();
    } catch (e) {
      if (!alive() || st.stage !== 'home') return;
      root.innerHTML = IE.errorHtml('模考记录加载失败', e);
      IE.bindRetry(root, renderHome);
      return;
    }
    if (!alive() || st.stage !== 'home') return;
    paintHome(data && Array.isArray(data.items) ? data.items : []);
  }

  function historyItemHtml(it) {
    const [label, cls] = STATUS_PILL[it.status] || [it.status, 'mute'];
    let s = '';
    let o = '';
    if (it.status === 'finished') {
      s = sectionBandsText(it.result);
      o = it.result && it.result.overall != null ? IE.fmtBand(it.result.overall) : '—';
    } else if (it.status === 'in-progress') {
      s = it.current ? `当前：${INFO[it.current].label}` : '四部分已结束，待出分';
    } else {
      s = SECTIONS.map((k) => `${INFO[k].label}${STATE_LABEL[it.states && it.states[k]] || ''}`).join(' · ');
    }
    return (
      `<div class="iem-hi" data-id="${esc(it.id)}" role="button" tabindex="0">` +
      `<span class="d">${esc(IE.fmtDateTime(it.createdAt))}</span>` +
      `<span class="ie-pill ${cls}">${esc(label)}</span>` +
      `<span class="s">${esc(s)}</span>` +
      (o ? `<span class="o" title="总分">${esc(o)}</span>` : '') +
      '</div>'
    );
  }

  function paintHome(items) {
    const active = items.find((x) => x.status === 'in-progress');
    root.innerHTML =
      '<div class="ie-card">' +
      '<h3>🏁 全真模考 <span class="ie-h3-sub">听力 → 阅读 → 写作 → 口语，连做约 3 小时</span></h3>' +
      '<div class="ie-note"><ul class="iem-rules">' +
      '<li><b>听力</b>约 25–30 分钟：音频只播一遍，每组题前 30 秒读题，播完 2 分钟检查，自动交卷（需要浏览器英文语音）。</li>' +
      '<li><b>阅读</b> 60 分钟、<b>写作</b> 60 分钟各一个倒计时，时间到自动收卷；<b>口语</b> Part 1 → 2 → 3，自动录音（只在本页内存）。</li>' +
      '<li>每部分保存后才能进入下一部分；可以中途离开，回来从当前部分继续。但<b>正在计时的部分一旦中断</b>（切到别的页面、刷新），只能重新开始或放弃本部分。</li>' +
      '<li>出分：听力 40 题、阅读 39 题按近似换算表；写作按 (Task 1 + 2 × Task 2) / 3、口语四维自评，都向下取整到 0.5；总分按官方规则取整。</li>' +
      '</ul></div>' +
      '<div class="iem-actions">' +
      (active
        ? `<button type="button" class="btn primary iem-continue" data-id="${esc(active.id)}">继续模考${active.current ? `（当前：${esc(INFO[active.current].label)}）` : '（待出分）'}</button>` +
          '<button type="button" class="btn small ghost iem-replace">放弃这套，重新组卷</button>'
        : '<button type="button" class="btn primary iem-new">开始新模考</button>') +
      '<span class="ie-msg iem-msg"></span>' +
      '</div>' +
      '</div>' +
      '<div class="ie-card">' +
      `<h3>📊 历次模考 <span class="ie-h3-sub">最多保留最近 50 套</span></h3>` +
      (items.length ? `<div class="iem-hist">${items.map(historyItemHtml).join('')}</div>` : '<div class="ie-empty">还没有模考记录。</div>') +
      '</div>';

    const cont = root.querySelector('.iem-continue');
    if (cont) cont.onclick = () => openMock(cont.dataset.id);
    const replace = root.querySelector('.iem-replace');
    if (replace) {
      replace.onclick = () => {
        if (!confirmTwice('replace', replace, '再点一次：放弃进行中的一套并重新组卷')) return;
        startNew(true, replace, active.id);
      };
    }
    const btnNew = root.querySelector('.iem-new');
    if (btnNew) btnNew.onclick = () => startNew(false, btnNew, null);
    root.querySelectorAll('.iem-hi').forEach((el) => {
      el.onclick = () => openMock(el.dataset.id);
      el.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMock(el.dataset.id);
        }
      };
    });
  }

  async function startNew(replace, btn, oldId) {
    btn.disabled = true;
    setMsg('正在组卷…');
    let r;
    try {
      r = await api.start(replace);
      if (!r || !r.mock || !r.mock.id) throw new Error('服务端返回格式不对');
    } catch (e) {
      if (!alive() || st.stage !== 'home') return;
      btn.disabled = false;
      if (e.status === 409) {
        NCE.toast('已有一套进行中的模考，先继续或放弃它', 'warn');
        renderHome();
        return;
      }
      setMsg(`组卷失败：${e.message}`, 'bad');
      return;
    }
    if (oldId) clearFrozen(oldId);
    st.live = null;
    dropRecordings();
    if (!alive() || st.stage !== 'home') return;
    showMock(r.mock);
  }

  // ---------- 打开一套模考 ----------
  async function openMock(id) {
    haltAll();
    st.stage = 'loading';
    root.innerHTML = '<div class="ie-loading">正在加载模考…</div>';
    let v;
    try {
      v = await api.get(id);
      if (!v || !v.id || !v.sections || !v.paper) throw new Error('服务端返回格式不对');
    } catch (e) {
      if (!alive() || st.stage !== 'loading') return;
      if (e.status === 404 && st.live && st.live.mockId === id) st.live = null;
      root.innerHTML = topBar('← 模考首页') + IE.errorHtml('模考加载失败', e);
      root.querySelector('.iem-back').onclick = renderHome;
      IE.bindRetry(root, () => openMock(id));
      return;
    }
    if (!alive() || st.stage !== 'loading') return;
    showMock(v);
  }

  function showMock(v) {
    st.mock = v;
    if (st.live && st.live.mockId !== v.id) st.live = null;
    if (v.status === 'finished') renderResult();
    else if (v.status === 'abandoned') renderAbandoned();
    else renderOverview();
    window.scrollTo(0, 0);
  }

  function renderAbandoned() {
    haltAll();
    st.stage = 'abandoned';
    const v = st.mock;
    root.innerHTML =
      topBar('← 模考首页', `模考 · ${IE.fmtDateTime(v.createdAt)}`) +
      stepsHtml(v) +
      '<div class="ie-card"><div class="ie-note">这套模考已放弃，不出分、不参与对比。已保存的部分仍记在各模块的练习记录里。</div></div>';
    root.querySelector('.iem-back').onclick = renderHome;
  }

  // ---------- 总览 ----------
  function liveMatches(v, name) {
    const L = st.live;
    const s = v.sections[name];
    return !!(L && L.mockId === v.id && L.section === name && s && s.state === 'running' && L.startedAt === s.startedAt);
  }

  function stepsHtml(v) {
    return (
      '<div class="iem-steps">' +
      SECTIONS.map((k, i) => {
        const s = v.sections[k];
        const cls = [v.current === k ? 'cur' : '', s.state === 'done' ? 'done' : '', s.state === 'skipped' ? 'skipped' : ''].filter(Boolean).join(' ');
        const extra = s.state === 'done' && s.durationSec != null ? ` · ${IE.fmtDuration(s.durationSec)}` : '';
        return `<div class="iem-step ${cls}"><b>${INFO[k].icon} ${i + 1}. ${esc(INFO[k].label)}</b><span>${esc(STATE_LABEL[s.state] || s.state)}${esc(extra)}</span></div>`;
      }).join('') +
      '</div>'
    );
  }

  function renderOverview(errText) {
    stopSpeech();
    clearTimers();
    st.stage = 'overview';
    const v = st.mock;
    const cur = v.current;
    // 页面内存里的作答还在且没被中断：直接回到作答 / 自评页
    if (cur && liveMatches(v, cur) && !st.live.interrupted) {
      resumeLive();
      return;
    }
    if (st.live && !liveMatches(v, st.live.section)) st.live = null;

    let body;
    if (!cur) {
      body =
        '<div class="ie-card"><h3>✅ 四个部分都已结束</h3><div class="ie-lead">点「出分」计算四项分数和总分。</div>' +
        '<div class="iem-actions"><button type="button" class="btn primary iem-finish">出分</button><span class="ie-msg iem-msg"></span></div></div>';
    } else {
      const s = v.sections[cur];
      const head = `<h3>${INFO[cur].icon} 第 ${SECTIONS.indexOf(cur) + 1} 部分 · ${esc(INFO[cur].label)}</h3>`;
      if (s.state === 'pending') {
        body =
          `<div class="ie-card">${head}<div class="ie-lead">${esc(INFO[cur].desc)}</div>` +
          (cur === 'listening' ? '<div class="iem-tts ie-muted">正在检测浏览器的英文语音…</div>' : '') +
          (cur === 'speaking' ? `<div class="iem-note-s">${CAN_RECORD ? '🎙 第一次开始作答时浏览器会请求麦克风权限；拒绝也能继续，只计时不录音。' : '⚠️ 当前浏览器不支持录音（需要 HTTPS 或 localhost），口语只计时。'}</div>` : '') +
          '<div class="iem-actions">' +
          `<button type="button" class="btn primary iem-begin"${cur === 'listening' ? ' disabled' : ''}>开始${esc(INFO[cur].label)}</button>` +
          '<button type="button" class="btn small ghost iem-skip">放弃本部分</button>' +
          '<span class="ie-msg iem-msg"></span></div></div>';
      } else if (frozenFor(v, cur)) {
        body =
          `<div class="ie-card">${head}<div class="ie-note">${cur === 'writing' ? '写作时间已结束、作文已锁定' : '口语已全部答完'}，还没有提交自评。可以接着自评后保存。</div>` +
          '<div class="iem-actions"><button type="button" class="btn primary iem-resume-frozen">继续自评</button>' +
          '<button type="button" class="btn small ghost iem-skip">放弃本部分</button><span class="ie-msg iem-msg"></span></div></div>';
      } else {
        const L = st.live && liveMatches(v, cur) ? st.live : null;
        const why = L && L.reason ? `（${L.reason}）` : '（页面已切走或刷新）';
        body =
          `<div class="ie-card">${head}` +
          `<div class="ie-warn">⚠️ ${esc(INFO[cur].label)}部分在计时中被中断${esc(why)}。开始于 ${esc(IE.fmtDateTime(s.startedAt))}${s.restarts ? `，已重新开始过 ${esc(s.restarts)} 次` : ''}。` +
          '<br>为保证计时完整，只能<b>重新开始本部分</b>（计时从头开始，已作答内容清空），或<b>放弃本部分</b>（不计分，本次不出总分）。</div>' +
          (cur === 'listening' ? '<div class="iem-tts ie-muted" style="margin-top:8px">正在检测浏览器的英文语音…</div>' : '') +
          '<div class="iem-actions">' +
          `<button type="button" class="btn primary iem-begin"${cur === 'listening' ? ' disabled' : ''}>重新开始本部分</button>` +
          '<button type="button" class="btn small ghost iem-skip">放弃本部分</button><span class="ie-msg iem-msg"></span></div></div>';
      }
    }

    root.innerHTML =
      topBar('← 模考首页', `模考 · ${IE.fmtDateTime(v.createdAt)} 开始`) +
      stepsHtml(v) +
      body +
      '<div class="iem-actions"><button type="button" class="btn small ghost iem-abandon-all">放弃整套模考</button></div>';

    root.querySelector('.iem-back').onclick = renderHome;
    const begin = root.querySelector('.iem-begin');
    if (begin) begin.onclick = () => beginSection(cur, begin);
    const skip = root.querySelector('.iem-skip');
    if (skip) {
      skip.onclick = () => {
        if (!confirmTwice('skip', skip, `再点一次：放弃${INFO[cur].label}（本次不出总分）`)) return;
        abandonSection(cur, skip);
      };
    }
    const resumeBtn = root.querySelector('.iem-resume-frozen');
    if (resumeBtn) resumeBtn.onclick = () => resumeFrozen(cur);
    const fin = root.querySelector('.iem-finish');
    if (fin) fin.onclick = () => doFinish();
    const all = root.querySelector('.iem-abandon-all');
    all.onclick = () => {
      if (!confirmTwice('abandon-all', all, '再点一次：放弃整套模考（不出分）')) return;
      abandonAll(all);
    };
    if (errText) setMsg(errText, 'bad');
    if (cur === 'listening' && begin) checkTts(begin);
  }

  // 听力开始前检测英文语音；没有时只能重新检测或放弃听力部分
  async function checkTts(btn) {
    const box = root.querySelector('.iem-tts');
    const t = tts();
    let ok = false;
    let reason = '';
    if (!t) reason = '听力朗读模块没有加载（ielts-listening-ui.js），请刷新页面。';
    else {
      try {
        const r = await t.detect();
        ok = !!(r && r.ok);
        if (ok) reason = `已检测到 ${r.voices.length} 个英文声音（英音 ${r.gb} 个），朗读用浏览器语音合成。`;
        else reason = r && r.reason === 'unsupported' ? '当前浏览器不支持语音合成（speechSynthesis）。' : '没有检测到可用的英文声音（系统没装英文语音包，或语音列表还没加载出来）。';
      } catch (e) {
        console.warn('[ielts-mock] 语音检测失败', e);
        reason = `语音检测失败：${e.message || e}`;
      }
    }
    if (!alive() || st.stage !== 'overview' || !box || !box.isConnected) return;
    btn.disabled = !ok;
    if (ok) {
      box.className = 'iem-tts iem-note-s';
      box.textContent = '🔈 ' + reason;
      return;
    }
    box.className = 'iem-tts ie-warn';
    box.style.marginTop = '8px';
    box.innerHTML = `⚠️ ${esc(reason)}听力无法进行：可以安装英文语音后重新检测，或放弃听力部分（不计听力分，本次不出总分）。` +
      '<div style="margin-top:8px"><button type="button" class="btn small iem-redetect">重新检测</button></div>';
    box.querySelector('.iem-redetect').onclick = () => {
      box.className = 'iem-tts ie-muted';
      box.textContent = '正在检测浏览器的英文语音…';
      checkTts(btn);
    };
  }

  // 开始 / 重新开始本部分：先拉题目（失败不开始计时），再通知服务端开始计时
  async function beginSection(name, btn) {
    const v = st.mock;
    root.querySelectorAll('.iem-actions .btn').forEach((b) => { b.disabled = true; });
    setMsg('正在加载题目…');
    let content;
    try {
      content = await loadContent(name, v.paper);
    } catch (e) {
      if (!alive() || st.stage !== 'overview' || st.mock !== v) return;
      root.querySelectorAll('.iem-actions .btn').forEach((b) => { b.disabled = false; });
      setMsg(`题目加载失败：${e.message}`, 'bad');
      return;
    }
    if (!alive() || st.stage !== 'overview' || st.mock !== v) return;
    let r;
    try {
      r = await api.section(v.id, { section: name, action: 'begin' });
      if (!r || !r.mock || !r.mock.sections) throw new Error('服务端返回格式不对');
    } catch (e) {
      if (!alive() || st.stage !== 'overview' || st.mock !== v) return;
      root.querySelectorAll('.iem-actions .btn').forEach((b) => { b.disabled = false; });
      setMsg(`开始失败：${e.message}`, 'bad');
      return;
    }
    st.mock = r.mock;
    // 服务端已开始计时但页面已经切走：下次回来会显示中断面板
    if (!alive() || st.stage !== 'overview') return;
    clearFrozen(v.id);
    dropRecordings();
    const s = r.mock.sections[name];
    st.live = Object.assign({ mockId: v.id, section: name, startedAt: s.startedAt, localStart: Date.now(), interrupted: false, reason: '', phase: '', durationSec: null }, content);
    if (name === 'listening') startListening();
    else if (name === 'reading') startReading();
    else if (name === 'writing') startWriting();
    else startSpeaking();
    window.scrollTo(0, 0);
    if (btn && btn.isConnected) btn.disabled = false;
  }

  function isListeningSection(s) {
    return !!(s && typeof s.id === 'string' && Array.isArray(s.speakers) && Array.isArray(s.segments) && s.segments.length &&
      Array.isArray(s.groups) && s.groups.length &&
      s.groups.every((g) => g && Array.isArray(g.questions) && g.questions.length && Number.isInteger(g.from)));
  }
  function isPassage(p) {
    return !!(p && typeof p.id === 'string' && Array.isArray(p.paragraphs) && Array.isArray(p.groups));
  }

  async function loadContent(name, paper) {
    const get = (kind, id) => IE.get(`/api/ielts/${kind}/${encodeURIComponent(id)}`);
    if (name === 'listening') {
      const t = tts();
      if (!t) throw new Error('听力朗读模块没有加载，请刷新页面');
      const [voice, ...sections] = await Promise.all([t.detect(), ...paper.listening.map((id) => get('listening', id))]);
      if (!voice || !voice.ok) throw new Error('没有可用的英文声音，听力无法进行');
      if (!sections.every(isListeningSection)) throw new Error('听力题目数据格式不对');
      return { sections, voices: voice.voices };
    }
    if (name === 'reading') {
      const passages = await Promise.all(paper.reading.map((id) => get('reading', id)));
      if (!passages.every(isPassage)) throw new Error('阅读题目数据格式不对');
      return { passages };
    }
    if (name === 'writing') {
      const [task1, task2] = await Promise.all([get('writing', paper.writing.task1), get('writing', paper.writing.task2)]);
      if (!task1 || !task2 || typeof task1.prompt !== 'string' || typeof task2.prompt !== 'string') throw new Error('写作题目数据格式不对');
      return { prompts: { task1, task2 } };
    }
    const [part1, part2] = await Promise.all([get('speaking', paper.speaking.part1), get('speaking', paper.speaking.part2)]);
    if (!part1 || !Array.isArray(part1.questions) || !part2 || !part2.cueCard) throw new Error('口语题目数据格式不对');
    return { items: { part1, part2 } };
  }

  async function abandonSection(name, btn) {
    const v = st.mock;
    btn.disabled = true;
    let r;
    try {
      r = await api.section(v.id, { section: name, action: 'abandon' });
      if (!r || !r.mock) throw new Error('服务端返回格式不对');
    } catch (e) {
      if (!alive() || st.stage !== 'overview') return;
      btn.disabled = false;
      setMsg(`放弃失败：${e.message}`, 'bad');
      return;
    }
    st.live = null;
    clearFrozen(v.id);
    dropRecordings();
    st.mock = r.mock;
    if (!alive()) return;
    NCE.toast(`已放弃${INFO[name].label}部分`, 'warn');
    if (!r.mock.current) doFinish();
    else renderOverview();
  }

  async function abandonAll(btn) {
    const v = st.mock;
    btn.disabled = true;
    try {
      await api.finish(v.id, { abandon: true });
    } catch (e) {
      if (!alive() || st.stage !== 'overview') return;
      btn.disabled = false;
      setMsg(`放弃失败：${e.message}`, 'bad');
      return;
    }
    st.live = null;
    clearFrozen(v.id);
    dropRecordings();
    if (!alive()) return;
    NCE.toast('已放弃这套模考', 'warn');
    renderHome();
  }

  async function doFinish() {
    const v = st.mock;
    haltAll();
    st.stage = 'loading';
    root.innerHTML = '<div class="ie-loading">正在出分…</div>';
    let r;
    try {
      r = await api.finish(v.id);
      if (!r || !r.mock || !r.mock.result) throw new Error('服务端返回格式不对');
    } catch (e) {
      if (!alive() || st.stage !== 'loading') return;
      renderOverview(`出分失败：${e.message}`);
      return;
    }
    st.mock = r.mock;
    if (!alive() || st.stage !== 'loading') return;
    renderResult();
    window.scrollTo(0, 0);
  }

  // 部分保存成功：清掉页面内存里的作答，进入下一部分（四部分都结束就直接出分）
  function onSectionSaved(L, v) {
    if (st.live === L) st.live = null;
    st.mock = v;
    clearFrozen(v.id);
    if (L.section === 'speaking') dropRecordings();
    if (!alive()) return;
    NCE.toast(`${INFO[L.section].label}部分已保存`, 'ok');
    if (!v.current) doFinish();
    else {
      renderOverview();
      window.scrollTo(0, 0);
    }
  }

  async function saveSection(L, payload, onFail) {
    let r;
    try {
      r = await api.section(L.mockId, payload);
      if (!r || !r.mock) throw new Error('服务端返回格式不对');
    } catch (e) {
      if (st.live !== L) return;
      L.phase = 'submit-failed';
      L.error = e.message;
      if (alive() && st.stage === L.section) onFail(e);
      return;
    }
    onSectionSaved(L, r.mock);
  }

  function resumeLive() {
    const L = st.live;
    st.stage = L.section;
    if (L.section === 'listening') paintListening();
    else if (L.section === 'reading') paintReading();
    else if (L.section === 'writing') paintWritingAssess();
    else paintSpeakingAssess();
  }

  // 刷新页面后从 localStorage 恢复已冻结的写作 / 口语，继续自评
  function resumeFrozen(name) {
    const v = st.mock;
    const f = frozenFor(v, name);
    if (!f) {
      renderOverview('自评草稿已失效，只能重新开始或放弃本部分');
      return;
    }
    const base = { mockId: v.id, section: name, startedAt: v.sections[name].startedAt, localStart: Date.now(), interrupted: false, reason: '', phase: 'assess', durationSec: f.durationSec };
    if (name === 'writing') {
      st.live = Object.assign(base, { texts: f.texts, taskSec: f.taskSec, variant: f.variant === 'G' ? 'G' : 'A' });
    } else {
      st.live = Object.assign(base, { steps: f.steps.map((x) => ({ label: x.label, part: x.part, durationSec: Number(x.durationSec) || 0, state: x.state, sample: '', audioUrl: null })), restored: true });
    }
    resumeLive();
  }

  // 计时中被打断：可续做的阶段保持原状（听力检查时间改为「已暂停」），其余标记为中断
  function markInterrupted(L, reason) {
    if (L.section === 'listening' && L.phase === 'check') {
      L.phase = 'check-hold';
      return false;
    }
    if (RESUMABLE[L.section].includes(L.phase)) return false;
    L.interrupted = true;
    L.reason = reason;
    return true;
  }

  function suspend(reason) {
    const L = st.live;
    haltAll();
    if (L) markInterrupted(L, reason);
    // 录音只在口语自评阶段保留（回来还能回听），其余情况一并释放
    if (!(L && L.section === 'speaking' && !L.interrupted)) dropRecordings();
  }

  function exitButton() {
    const b = root.querySelector('.iem-back');
    if (!b) return;
    b.onclick = () => {
      if (!confirmTwice('exit', b, '再点一次退出（本部分会中断，只能重新开始或放弃）')) return;
      suspend(REASON.exit);
      renderOverview();
    };
  }

  // ======================= 听力 =======================
  function lRange(g) {
    const a = g.questions[0].no;
    const b = g.questions[g.questions.length - 1].no;
    return a === b ? `${a}` : `${a}–${b}`;
  }
  function lRangeEn(g) {
    const a = g.questions[0].no;
    const b = g.questions[g.questions.length - 1].no;
    return a === b ? `question ${a}` : `questions ${a} to ${b}`;
  }
  function lGapParts(prompt) {
    const p = String(prompt || '');
    const m = /_{3,}/.exec(p);
    return m ? [p.slice(0, m.index), p.slice(m.index + m[0].length)] : [p, ''];
  }
  function groupEnd(sec, gi) {
    const nx = sec.groups[gi + 1];
    return nx ? nx.from - 1 : sec.segments.length - 1;
  }

  // 考试流程：每个 Part 旁白开场 → 每组题读题 30 秒 → 本组音频 → … → Part 结束提示；4 个 Part 后 2 分钟检查
  function listeningPlan(sections) {
    const steps = [];
    sections.forEach((sec, si) => {
      const kind = sec.part === 1 || sec.part === 3 ? 'conversation' : 'talk';
      // 题库的 intro 一般已以「Part N.」开头，没有时才补上
      const intro = String(sec.intro || '').trim();
      const opening = /^part\s+\d/i.test(intro) ? intro : `Part ${sec.part}. ${intro}`;
      sec.groups.forEach((g, gi) => {
        const text = gi === 0
          ? `${opening} First, you have some time to look at ${lRangeEn(g)}.`
          : `Before you hear the rest of the ${kind}, you have some time to look at ${lRangeEn(g)}.`;
        steps.push({ kind: 'narrate', si, gi, text: text.replace(/\s+/g, ' ') });
        steps.push({ kind: 'read', si, gi, sec: READ_SEC });
        steps.push({ kind: 'play', si, gi });
      });
      const last = si === sections.length - 1;
      steps.push({
        kind: 'narrate', si, gi: -1, end: last,
        text: last ? `That is the end of Part ${sec.part}, and the end of the listening test. You now have two minutes to check your answers.` : `That is the end of Part ${sec.part}.`,
      });
    });
    steps.push({ kind: 'check', si: sections.length - 1, gi: -1, sec: CHECK_SEC });
    return steps;
  }

  function segItems(sec, cast, from, to) {
    const t = tts();
    const out = [];
    for (let i = from; i <= to; i++) {
      const s = sec.segments[i];
      const nx = sec.segments[i + 1];
      out.push({
        text: s.text,
        cast: (cast && cast.speakers[s.speaker]) || { voice: null, pitch: 1 },
        rate: 1,
        seg: i,
        gapAfter: nx && nx.speaker !== s.speaker ? t.GAP_SWITCH_MS : t.GAP_SAME_MS,
      });
    }
    return out;
  }

  function startListening() {
    const L = st.live;
    const t = tts();
    L.casts = L.sections.map((sec) => t.castVoices(sec, L.voices));
    L.narrator = L.casts[0].narrator;
    L.answers = {};
    L.sections.forEach((sec) => { L.answers[sec.id] = {}; });
    L.plan = listeningPlan(L.sections);
    L.stepIdx = -1;
    L.segIdx = -1;
    L.countdown = 0;
    L.locked = false;
    st.stage = 'listening';
    paintListening();
    nextListeningStep();
  }

  function lInput(L, sid, no) {
    const v = (L.answers[sid] || {})[String(no)] || '';
    return (
      `<input type="text" class="ie-input iem-in" data-sid="${esc(sid)}" data-no="${esc(no)}" value="${esc(v)}" maxlength="100" ` +
      `autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="第 ${esc(no)} 题" placeholder="${esc(no)}"${L.locked ? ' disabled' : ''}>`
    );
  }
  function lMcq(L, sec, si, q) {
    const sel = (L.answers[sec.id] || {})[String(q.no)] || '';
    return (
      '<div class="iem-q">' +
      `<div class="iem-qh"><span class="iem-no">${esc(q.no)}</span><span>${esc(q.prompt)}</span></div>` +
      '<div class="iem-opts">' +
      (q.options || []).map((o) => {
        const on = sel === o.key;
        return (
          `<label class="iem-opt${on ? ' on' : ''}">` +
          `<input type="radio" name="iem-l${si}-${esc(q.no)}" value="${esc(o.key)}" data-sid="${esc(sec.id)}" data-no="${esc(q.no)}"${on ? ' checked' : ''}${L.locked ? ' disabled' : ''}>` +
          `<span><b>${esc(o.key)}</b>&nbsp; ${esc(o.text)}</span></label>`
        );
      }).join('') +
      '</div></div>'
    );
  }
  function lMatching(L, sec, g) {
    const opts = g.options || [];
    const box =
      '<div class="iem-box">' +
      (g.optionsTitle ? `<div><b>${esc(g.optionsTitle)}</b></div>` : '') +
      opts.map((o) => `<div><b>${esc(o.key)}</b>${esc(o.text)}</div>`).join('') +
      '</div>';
    const rows = g.questions.map((q) => {
      const sel = (L.answers[sec.id] || {})[String(q.no)] || '';
      return (
        '<div class="iem-row">' +
        `<span class="iem-no">${esc(q.no)}</span><span style="flex:1 1 140px;min-width:0">${esc(q.prompt)}</span>` +
        `<select class="iem-sel" data-sid="${esc(sec.id)}" data-no="${esc(q.no)}" aria-label="第 ${esc(q.no)} 题"${L.locked ? ' disabled' : ''}><option value="">—</option>` +
        opts.map((o) => `<option value="${esc(o.key)}"${sel === o.key ? ' selected' : ''}>${esc(o.key)}</option>`).join('') +
        '</select></div>'
      );
    }).join('');
    return box + rows;
  }
  function lGroupHtml(L, sec, si, g, gi) {
    let body;
    if (g.type === 'mcq') body = g.questions.map((q) => lMcq(L, sec, si, q)).join('');
    else if (g.type === 'matching') body = lMatching(L, sec, g);
    else if (g.type === 'summary-completion') {
      body =
        '<p class="iem-para">' +
        g.questions.map((q) => {
          const [a, b] = lGapParts(q.prompt);
          return `${esc(a)}<span class="iem-gap"><span class="iem-no">${esc(q.no)}</span>${lInput(L, sec.id, q.no)}</span>${esc(b)}`;
        }).join(' ') +
        '</p>';
    } else {
      body = g.questions.map((q) => {
        const [a, b] = lGapParts(q.prompt);
        return (
          (q.heading ? `<div class="iem-heading">${esc(q.heading)}</div>` : '') +
          '<div class="iem-row">' +
          `<span class="iem-no">${esc(q.no)}</span>` +
          (a.trim() ? `<span>${esc(a.trim())}</span>` : '') +
          lInput(L, sec.id, q.no) +
          (b.trim() ? `<span>${esc(b.trim())}</span>` : '') +
          '</div>'
        );
      }).join('');
    }
    return (
      `<div class="iem-group" data-si="${si}" data-gi="${gi}">` +
      `<div class="iem-gh">Questions ${esc(lRange(g))}<span class="ie-pill mute">${esc(L_TYPE[g.type] || g.type)}</span></div>` +
      `<div class="iem-ins">${esc(g.instruction)}</div>` +
      (g.wordLimit ? `<div class="iem-limit">Write ${esc(g.wordLimit)} for each answer.</div>` : '') +
      (g.title ? `<div class="iem-gt">${esc(g.title)}</div>` : '') +
      body +
      '</div>'
    );
  }

  function paintListening() {
    const L = st.live;
    st.stage = 'listening';
    root.innerHTML =
      topBar('← 退出', '模考 · 听力（考试模式）') +
      '<div class="iem-bar">' +
      '<div class="iem-bar-row"><span class="iem-phase"></span><span class="iem-clock" hidden></span><span class="iem-now"></span>' +
      '<button type="button" class="btn small primary iem-submit" hidden>立即交卷</button></div>' +
      '<div class="iem-prog"><i></i></div><div class="ie-msg iem-msg"></div>' +
      '</div>' +
      '<div class="iem-lq">' +
      L.sections.map((sec, si) =>
        `<div class="iem-part" data-si="${si}"><div class="iem-part-h">Part ${esc(sec.part)}</div>` +
        sec.groups.map((g, gi) => lGroupHtml(L, sec, si, g, gi)).join('') +
        '</div>'
      ).join('') +
      '</div>';
    exitButton();
    const wrap = root.querySelector('.iem-lq');
    const record = (el) => {
      if (!el || !el.dataset || !el.dataset.no || !el.dataset.sid || L.locked) return;
      if (el.type === 'radio') {
        if (!el.checked) return;
        wrap.querySelectorAll(`input[name="${el.name}"]`).forEach((r) => r.closest('.iem-opt').classList.toggle('on', r === el));
      }
      const a = L.answers[el.dataset.sid];
      if (a) a[el.dataset.no] = el.value;
    };
    wrap.oninput = (e) => record(e.target);
    wrap.onchange = (e) => record(e.target);
    root.querySelector('.iem-submit').onclick = () => submitListening(false);
    paintListeningStatus();
  }

  function listeningView(L) {
    const step = L.plan[L.stepIdx] || L.plan[0];
    const sec = L.sections[step.si] || L.sections[0];
    const g = step.gi >= 0 ? sec.groups[step.gi] : null;
    const range = g ? lRange(g) : '';
    switch (L.phase) {
      case 'narrate':
        return { phase: '🔈 旁白', now: g ? `Part ${sec.part} · 接下来读第 ${range} 题` : `Part ${sec.part} 结束` };
      case 'read':
        return { phase: `📖 读题 · 第 ${range} 题`, clock: L.countdown, warn: L.countdown <= 5, now: '先看题、圈关键词，时间到自动播放' };
      case 'play':
        return { phase: `🎧 Part ${sec.part} · 第 ${range} 题`, now: `第 ${L.segIdx + 1} / ${sec.segments.length} 段 · 只播放一次，不能暂停或回放` };
      case 'check':
        return { phase: '✅ 检查时间', clock: L.countdown, warn: L.countdown <= 15, now: '时间到自动交卷，也可以立即交卷' };
      case 'check-hold':
        return { phase: '✅ 检查时间（已暂停）', now: '离开页面时检查计时已停止，检查好后点「立即交卷」' };
      case 'submitting':
        return { phase: '⏳ 正在保存听力…', now: '' };
      case 'submit-failed':
        return { phase: '⚠️ 保存失败', now: `${L.error || ''}。答案还在页面上，可以重新交卷。` };
      default:
        return { phase: '', now: '' };
    }
  }

  function paintListeningStatus() {
    const L = st.live;
    if (!L || L.section !== 'listening' || st.stage !== 'listening' || !root) return;
    const bar = root.querySelector('.iem-bar');
    if (!bar) return;
    const v = listeningView(L);
    bar.querySelector('.iem-phase').textContent = v.phase;
    bar.querySelector('.iem-now').textContent = v.now || '';
    const clock = bar.querySelector('.iem-clock');
    clock.hidden = v.clock == null;
    clock.textContent = v.clock == null ? '' : IE.fmtClock(v.clock);
    clock.className = 'iem-clock' + (v.warn ? ' warn' : '');
    const done = Math.max(0, L.stepIdx + 1) / L.plan.length;
    bar.querySelector('.iem-prog i').style.width = `${Math.round(Math.min(1, done) * 100)}%`;
    const btn = bar.querySelector('.iem-submit');
    btn.hidden = !['check', 'check-hold', 'submit-failed'].includes(L.phase);
    btn.disabled = L.phase === 'submitting';
    btn.textContent = L.phase === 'submit-failed' ? '重新交卷' : '立即交卷';
    const step = L.plan[L.stepIdx];
    const live = step && ['narrate', 'read', 'play'].includes(L.phase) && step.gi >= 0;
    root.querySelectorAll('.iem-group').forEach((el) => {
      el.classList.toggle('cur', !!live && Number(el.dataset.si) === step.si && Number(el.dataset.gi) === step.gi);
    });
  }

  function scrollToGroup(si, gi) {
    const el = root && root.querySelector(`.iem-group[data-si="${si}"][data-gi="${gi}"]`);
    const bar = root && root.querySelector('.iem-bar');
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0) - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function listeningCountdown(sec, done) {
    const L = st.live;
    L.countdown = sec;
    paintListeningStatus();
    const endAt = Date.now() + sec * 1000;
    const id = every(() => {
      if (st.live !== L || L.interrupted) {
        clearTimer(id);
        return;
      }
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (left !== L.countdown) {
        L.countdown = left;
        paintListeningStatus();
      }
      if (left <= 0) {
        clearTimer(id);
        done();
      }
    }, 250);
  }

  function say(items, done, onItem) {
    const L = st.live;
    ttsBusy = true;
    tts().speak(items, {
      onItem,
      onDone: () => {
        if (st.live === L && !L.interrupted) done();
      },
      onFail: (err) => {
        if (st.live === L && !L.interrupted) listeningTtsFailed(err);
      },
    });
  }

  function nextListeningStep() {
    const L = st.live;
    if (!L || L.section !== 'listening' || L.interrupted) return;
    L.stepIdx++;
    const step = L.plan[L.stepIdx];
    if (!step) {
      submitListening(true);
      return;
    }
    L.phase = step.kind;
    if (step.kind === 'read') {
      scrollToGroup(step.si, step.gi);
      listeningCountdown(step.sec, nextListeningStep);
    } else if (step.kind === 'check') {
      listeningCountdown(step.sec, () => submitListening(true));
    } else if (step.kind === 'narrate') {
      paintListeningStatus();
      say([{ text: step.text, cast: L.narrator, rate: 1, seg: -1, gapAfter: 0 }], nextListeningStep);
    } else {
      const sec = L.sections[step.si];
      const g = sec.groups[step.gi];
      L.segIdx = g.from;
      paintListeningStatus();
      say(segItems(sec, L.casts[step.si], g.from, groupEnd(sec, step.gi)), nextListeningStep, (it) => {
        L.segIdx = it.seg;
        paintListeningStatus();
      });
    }
  }

  // 朗读出错：音频已全部播完（只差结束提示）时直接进检查时间；否则本部分中断
  function listeningTtsFailed(err) {
    const L = st.live;
    stopSpeech();
    clearTimers();
    const rest = L.plan.slice(L.stepIdx + 1);
    if (!rest.some((s) => s.kind === 'play') && L.phase !== 'play') {
      L.stepIdx = L.plan.length - 2; // 下一步就是检查时间
      nextListeningStep();
      return;
    }
    const t = tts();
    L.interrupted = true;
    L.reason = err === 'interrupted' || err === 'canceled' ? '朗读被别的声音打断' : (t ? t.errorText(err) : `朗读失败（${err}）`);
    if (alive()) renderOverview();
  }

  function listeningAnswers(L) {
    const out = {};
    for (const [sid, a] of Object.entries(L.answers)) {
      out[sid] = {};
      for (const [no, v] of Object.entries(a)) {
        const t = typeof v === 'string' ? v.trim() : '';
        if (t) out[sid][no] = t.slice(0, 100);
      }
    }
    return out;
  }

  async function submitListening(auto) {
    const L = st.live;
    if (!L || L.section !== 'listening' || L.phase === 'submitting') return;
    if (!auto && !['check', 'check-hold', 'submit-failed'].includes(L.phase)) return;
    stopSpeech();
    clearTimers();
    L.phase = 'submitting';
    if (L.durationSec == null) L.durationSec = elapsedSec(L, 'listening');
    if (!L.locked) {
      L.locked = true; // 检查时间结束，答案锁定
      if (alive() && st.stage === 'listening') root.querySelectorAll('.iem-lq input, .iem-lq select').forEach((el) => { el.disabled = true; });
    }
    paintListeningStatus();
    await saveSection(L, { section: 'listening', action: 'submit', durationSec: L.durationSec, answers: listeningAnswers(L) }, () => paintListeningStatus());
  }

  // ======================= 阅读 =======================
  function rQuestionCount(p) {
    if (Number.isInteger(p.questionCount) && p.questionCount > 0) return p.questionCount;
    return p.groups.reduce((n, g) => n + ((g && g.questions) || []).length, 0);
  }
  function rVal(L, pid, qid) {
    const v = (L.answers[pid] || {})[qid];
    return typeof v === 'string' ? v : '';
  }
  function rInput(L, pid, qid, no) {
    return (
      `<input type="text" class="ie-input iem-in" data-qid="${esc(qid)}" value="${esc(rVal(L, pid, qid))}" maxlength="200" ` +
      `autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="第 ${esc(no)} 题" placeholder="${esc(no)}"${L.locked ? ' disabled' : ''}>`
    );
  }
  function rSelect(L, pid, qid, options, label) {
    const cur = rVal(L, pid, qid);
    return (
      `<select class="iem-sel" data-qid="${esc(qid)}" aria-label="${esc(label)}"${L.locked ? ' disabled' : ''}><option value="">— 选择 —</option>` +
      options.map((o) => `<option value="${esc(o.value)}"${o.value === cur ? ' selected' : ''}>${esc(o.label)}</option>`).join('') +
      '</select>'
    );
  }
  function rQuestionHtml(L, p, g, q, off) {
    const qid = String(q.id);
    const no = off + Number(q.number);
    const num = `<span class="iem-no">${esc(no)}</span>`;
    const dis = L.locked ? ' disabled' : '';
    const cur = rVal(L, p.id, qid);
    switch (g.type) {
      case 'tfng':
      case 'ynng':
        return (
          `<div class="iem-q"><div class="iem-qh">${num}<span>${esc(q.prompt || '')}</span></div><div class="iem-choices">` +
          JUDGE[g.type].map((v) => `<button type="button" class="iem-choice${cur === v ? ' on' : ''}" data-qid="${esc(qid)}" data-choice="${esc(v)}"${dis}>${esc(v)}</button>`).join('') +
          '</div></div>'
        );
      case 'mcq':
        return (
          `<div class="iem-q"><div class="iem-qh">${num}<span>${esc(q.prompt || '')}</span></div><div class="iem-opts">` +
          (q.options || []).map((o) => `<button type="button" class="iem-opt${cur === o.key ? ' on' : ''}" data-qid="${esc(qid)}" data-choice="${esc(o.key)}"${dis}><b>${esc(o.key)}</b><span>${esc(o.text)}</span></button>`).join('') +
          '</div></div>'
        );
      case 'matching-headings':
        return (
          `<div class="iem-q"><div class="iem-qh">${num}<span>${esc(q.prompt || `Paragraph ${q.para || ''}`)}</span></div>` +
          `<div class="iem-line">${rSelect(L, p.id, qid, (g.options || []).map((o) => ({ value: o.key, label: `${o.key}. ${o.text}` })), `第 ${no} 题标题`)}</div></div>`
        );
      case 'matching-information':
        return (
          `<div class="iem-q"><div class="iem-qh">${num}<span>${esc(q.prompt || '')}</span></div>` +
          `<div class="iem-line">${rSelect(L, p.id, qid, p.paragraphs.map((x) => ({ value: x.label, label: `段落 ${x.label}` })), `第 ${no} 题段落`)}</div></div>`
        );
      case 'sentence-completion': {
        const parts = String(q.prompt || '').split('{blank}');
        return (
          `<div class="iem-q"><div class="iem-qh">${num}<span>` +
          parts.map((t, i) => esc(t) + (i < parts.length - 1 ? rInput(L, p.id, qid, no) : '')).join('') +
          '</span></div></div>'
        );
      }
      case 'short-answer':
        return (
          `<div class="iem-q"><div class="iem-qh">${num}<span>${esc(q.prompt || '')}</span></div>` +
          `<div class="iem-line">${rInput(L, p.id, qid, no)}</div></div>`
        );
      default:
        return `<div class="iem-q"><div class="iem-qh">${num}<span class="ie-muted">暂不支持的题型：${esc(g.type)}</span></div></div>`;
    }
  }
  // 摘要正文：{qN} 换成题号 + 输入框（词库型为下拉）
  function rSummaryHtml(L, p, g, off) {
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
        const no = off + Number(q.number);
        const field = bank
          ? rSelect(L, p.id, q.id, bank.map((o) => ({ value: o.key, label: `${o.key}  ${o.text}` })), `第 ${no} 题`)
          : rInput(L, p.id, q.id, no);
        html += `<span class="iem-gap"><span class="iem-no">${esc(no)}</span>${field}</span>`;
      } else html += esc(m[0]);
      last = m.index + m[0].length;
    }
    html += esc(text.slice(last));
    return (
      (bank ? `<div class="iem-box iem-bank">${bank.map((o) => `<span><b>${esc(o.key)}</b>${esc(o.text)}</span>`).join('')}</div>` : '') +
      `<div class="iem-para">${s.title ? `<div class="iem-gt">${esc(s.title)}</div>` : ''}${html}</div>`
    );
  }
  function rGroupHtml(L, p, g, off) {
    const nums = (g.questions || []).map((q) => off + Number(q.number)).filter(Number.isFinite);
    const range = nums.length ? (Math.min(...nums) === Math.max(...nums) ? `Question ${nums[0]}` : `Questions ${Math.min(...nums)}–${Math.max(...nums)}`) : '';
    let body = '';
    if (g.type === 'matching-headings' && Array.isArray(g.options)) {
      body += `<div class="iem-box"><div class="ie-muted">List of Headings</div>${g.options.map((o) => `<div><b>${esc(o.key)}</b>${esc(o.text)}</div>`).join('')}</div>`;
    }
    body += g.type === 'summary-completion' ? rSummaryHtml(L, p, g, off) : (g.questions || []).map((q) => rQuestionHtml(L, p, g, q, off)).join('');
    return (
      '<div class="iem-group">' +
      `<div class="iem-gh">${esc(range)}<span class="ie-pill mute">${esc(R_TYPE[g.type] || g.type)}</span></div>` +
      `<div class="iem-ins">${esc(g.instruction || '')}</div>` +
      (g.wordLimitLabel ? `<div class="iem-limit">${esc(g.wordLimitLabel)}</div>` : '') +
      body +
      '</div>'
    );
  }

  function startReading() {
    const L = st.live;
    L.answers = {};
    L.offsets = [];
    let off = 0;
    L.passages.forEach((p) => {
      L.answers[p.id] = {};
      L.offsets.push(off);
      off += rQuestionCount(p);
    });
    L.total = off;
    L.tab = 0;
    L.endAt = Date.now() + READING_SEC * 1000;
    L.phase = 'run';
    L.warned = false;
    L.locked = false;
    st.stage = 'reading';
    paintReading();
    every(tickReading, 250);
  }

  function readingAnswered(L, pid) {
    const ids = pid ? [pid] : Object.keys(L.answers);
    let n = 0;
    for (const id of ids) for (const v of Object.values(L.answers[id] || {})) if (typeof v === 'string' && v.trim()) n++;
    return n;
  }

  function paintReading() {
    const L = st.live;
    st.stage = 'reading';
    root.innerHTML =
      topBar('← 退出', '模考 · 阅读') +
      '<div class="iem-bar">' +
      '<div class="iem-bar-row"><span class="iem-phase">📖 阅读</span><span class="iem-clock"></span><span class="iem-now"></span>' +
      '<button type="button" class="btn small primary iem-submit">交卷</button></div>' +
      '<div class="iem-tabs">' +
      L.passages.map((p, i) => `<button type="button" class="iem-tab${i === L.tab ? ' on' : ''}" data-i="${i}">Passage ${i + 1} <small></small></button>`).join('') +
      '</div><div class="ie-msg iem-msg"></div>' +
      '</div>' +
      '<div class="iem-cols"><div class="iem-pane iem-pane-p"></div><div class="iem-pane iem-pane-q"></div></div>';
    exitButton();
    root.querySelectorAll('.iem-tab').forEach((b) => {
      b.onclick = () => {
        L.tab = Number(b.dataset.i);
        root.querySelectorAll('.iem-tab').forEach((x) => x.classList.toggle('on', x === b));
        paintReadingPanes();
      };
    });
    const submit = root.querySelector('.iem-submit');
    submit.onclick = () => submitReading(L.phase === 'submit-failed', submit);
    paintReadingPanes();
    paintReadingStatus();
  }

  function paintReadingPanes() {
    const L = st.live;
    const p = L.passages[L.tab];
    const off = L.offsets[L.tab];
    const pp = root.querySelector('.iem-pane-p');
    const pq = root.querySelector('.iem-pane-q');
    pp.innerHTML =
      '<div class="iem-passage">' +
      `<h3>${esc(p.title || '')}</h3>` +
      p.paragraphs.map((x) => `<p><b>${esc(x.label || '')}</b><span>${esc(x.text || '')}</span></p>`).join('') +
      '</div>';
    pq.innerHTML = `<div class="ie-muted">Passage ${L.tab + 1} · 第 ${off + 1}–${off + rQuestionCount(p)} 题</div>` + p.groups.map((g) => rGroupHtml(L, p, g, off)).join('');
    pp.scrollTop = 0;
    pq.scrollTop = 0;
    const set = (qid, value) => {
      if (L.locked || !L.answers[p.id]) return;
      L.answers[p.id][qid] = value;
      paintReadingCounts();
    };
    pq.onclick = (e) => {
      const b = e.target.closest('[data-choice]');
      if (!b || L.locked) return;
      set(b.dataset.qid, b.dataset.choice);
      pq.querySelectorAll('[data-choice]').forEach((x) => {
        if (x.dataset.qid === b.dataset.qid) x.classList.toggle('on', x === b);
      });
    };
    const onField = (e) => {
      const el = e.target;
      if (el && el.dataset && el.dataset.qid && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) set(el.dataset.qid, el.value);
    };
    pq.oninput = onField;
    pq.onchange = onField;
    paintReadingCounts();
  }

  function paintReadingCounts() {
    const L = st.live;
    root.querySelectorAll('.iem-tab').forEach((b) => {
      const p = L.passages[Number(b.dataset.i)];
      b.querySelector('small').textContent = `${readingAnswered(L, p.id)}/${rQuestionCount(p)}`;
    });
    const now = root.querySelector('.iem-now');
    if (now && L.phase === 'run') now.textContent = `已答 ${readingAnswered(L)} / ${L.total} 题 · 剩 10 分钟时提醒，时间到自动交卷`;
  }

  function paintReadingStatus() {
    const L = st.live;
    const clock = root.querySelector('.iem-clock');
    const btn = root.querySelector('.iem-submit');
    const now = root.querySelector('.iem-now');
    if (!clock || !btn) return;
    if (L.phase === 'run') {
      tickReading();
      paintReadingCounts();
      return;
    }
    clock.textContent = '';
    btn.disabled = L.phase === 'submitting';
    btn.textContent = L.phase === 'submit-failed' ? '重新交卷' : '交卷';
    now.textContent = L.phase === 'submitting' ? '⏳ 正在保存阅读…' : `⚠️ 保存失败：${L.error || ''}。答案还在，可以重新交卷。`;
  }

  function tickReading() {
    const L = st.live;
    if (!L || L.section !== 'reading' || L.phase !== 'run') return;
    const left = Math.ceil((L.endAt - Date.now()) / 1000);
    const el = root && root.querySelector('.iem-clock');
    if (el) {
      el.textContent = '⏱ ' + IE.fmtClock(Math.max(0, left));
      el.className = 'iem-clock' + (left <= 600 ? ' warn' : '');
    }
    if (left <= 600 && !L.warned) {
      L.warned = true;
      NCE.toast('阅读还剩 10 分钟', 'warn');
    }
    if (left <= 0) {
      NCE.toast('60 分钟到，阅读自动交卷', 'warn');
      submitReading(true);
    }
  }

  function readingPayloadAnswers(L) {
    const out = {};
    for (const [pid, a] of Object.entries(L.answers)) {
      out[pid] = {};
      for (const [qid, v] of Object.entries(a)) {
        const t = typeof v === 'string' ? v.trim() : '';
        if (t) out[pid][qid] = t.slice(0, 200);
      }
    }
    return out;
  }

  async function submitReading(force, btn) {
    const L = st.live;
    if (!L || L.section !== 'reading' || L.phase === 'submitting') return;
    if (!force && L.phase === 'run') {
      const blank = L.total - readingAnswered(L);
      if (!confirmTwice('reading-submit', btn, blank ? `还有 ${blank} 题没答，再点一次交卷` : '再点一次确认交卷（交卷后不能修改）')) return;
    }
    clearTimers();
    L.phase = 'submitting';
    if (L.durationSec == null) L.durationSec = elapsedSec(L, 'reading');
    if (!L.locked) {
      L.locked = true;
      if (alive() && st.stage === 'reading') paintReadingPanes();
    }
    if (alive() && st.stage === 'reading') paintReadingStatus();
    await saveSection(L, { section: 'reading', action: 'submit', durationSec: L.durationSec, answers: readingPayloadAnswers(L) }, () => paintReadingStatus());
  }

  // ======================= 写作 =======================
  const TASK_KEYS = ['task1', 'task2'];
  const TASK_LABEL = { task1: 'Task 1', task2: 'Task 2' };

  function startWriting() {
    const L = st.live;
    L.texts = { task1: '', task2: '' };
    L.taskSec = { task1: 0, task2: 0 };
    L.tab = 'task1';
    L.tabSince = Date.now();
    L.endAt = Date.now() + WRITING_SEC * 1000;
    L.phase = 'write';
    L.hinted = false;
    L.variant = L.prompts.task1.variant === 'G' ? 'G' : 'A';
    st.stage = 'writing';
    paintWriting();
    every(tickWriting, 500);
  }

  function tabSecNow(L, k) {
    return L.taskSec[k] + (L.phase === 'write' && L.tab === k ? (Date.now() - L.tabSince) / 1000 : 0);
  }
  function accumulateTab(L) {
    const now = Date.now();
    L.taskSec[L.tab] += (now - L.tabSince) / 1000;
    L.tabSince = now;
  }

  function paintWriting() {
    const L = st.live;
    st.stage = 'writing';
    root.innerHTML =
      topBar('← 退出', '模考 · 写作') +
      '<div class="iem-bar">' +
      '<div class="iem-bar-row"><span class="iem-phase">✍️ 写作</span><span class="iem-clock"></span>' +
      '<span class="iem-now">建议 Task 1 用 20 分钟、Task 2 用 40 分钟 · <span class="iem-split"></span></span>' +
      '<button type="button" class="btn small primary iem-end">结束写作，去自评</button></div>' +
      '<div class="iem-tabs">' +
      TASK_KEYS.map((k) => `<button type="button" class="iem-tab${k === L.tab ? ' on' : ''}" data-k="${k}">${TASK_LABEL[k]} <small></small></button>`).join('') +
      '</div><div class="ie-msg iem-msg"></div>' +
      '</div>' +
      '<div class="iem-wbody"></div>';
    exitButton();
    root.querySelectorAll('.iem-tab').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.k === L.tab) return;
        accumulateTab(L);
        L.tab = b.dataset.k;
        root.querySelectorAll('.iem-tab').forEach((x) => x.classList.toggle('on', x === b));
        paintWritingBody();
      };
    });
    const end = root.querySelector('.iem-end');
    end.onclick = () => endWriting(false, end);
    paintWritingBody();
    tickWriting();
  }

  function paintWritingBody() {
    const L = st.live;
    disposeCharts();
    const k = L.tab;
    const it = L.prompts[k];
    const isG = k === 'task1' && it.variant === 'G';
    const isA = k === 'task1' && !isG;
    const bullets = isG && Array.isArray(it.bullets) ? it.bullets.filter(Boolean) : [];
    const body = root.querySelector('.iem-wbody');
    body.innerHTML =
      '<div class="ie-card">' +
      `<div class="iem-prompt">${esc(it.prompt || '')}</div>` +
      (bullets.length ? `<ul class="iem-bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '') +
      (isG ? '<div class="ie-muted" style="margin-top:6px">开头写 Dear …，至少 150 词</div>' : '') +
      (isA ? '<div class="iem-chart" style="margin-top:10px"></div>' : '') +
      '</div>' +
      `<textarea class="iem-ta" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" placeholder="在这里写 ${TASK_LABEL[k]}，至少 ${MIN_WORDS[k]} 词…（考场没有拼写检查，这里也关掉了）"></textarea>` +
      '<div class="iem-wc"></div>';
    if (isA) {
      const el = body.querySelector('.iem-chart');
      if (IE.chart && it.chart) chartDisposers.push(IE.chart.mount(el, it.chart));
      else el.innerHTML = '<div class="ie-note">图表模块没有加载，请刷新页面。</div>';
    }
    const ta = body.querySelector('.iem-ta');
    ta.value = L.texts[k];
    const paintWc = () => {
      const wc = countWords(L.texts[k]);
      const el = body.querySelector('.iem-wc');
      el.textContent = `字数 ${wc} / 至少 ${MIN_WORDS[k]}`;
      el.className = 'iem-wc' + (wc >= MIN_WORDS[k] ? ' ok' : '');
      const tab = root.querySelector(`.iem-tab[data-k="${k}"] small`);
      if (tab) tab.textContent = `${wc} 词`;
    };
    ta.oninput = () => {
      L.texts[k] = ta.value;
      paintWc();
    };
    paintWc();
    TASK_KEYS.forEach((x) => {
      const tab = root.querySelector(`.iem-tab[data-k="${x}"] small`);
      if (tab) tab.textContent = `${countWords(L.texts[x])} 词`;
    });
  }

  function tickWriting() {
    const L = st.live;
    if (!L || L.section !== 'writing' || L.phase !== 'write') return;
    const left = Math.ceil((L.endAt - Date.now()) / 1000);
    const el = root && root.querySelector('.iem-clock');
    if (el) {
      el.textContent = '⏱ ' + IE.fmtClock(Math.max(0, left));
      el.className = 'iem-clock' + (left <= 300 ? ' warn' : '');
    }
    const split = root && root.querySelector('.iem-split');
    if (split) split.textContent = `Task 1 已用 ${IE.fmtClock(tabSecNow(L, 'task1'))} · Task 2 已用 ${IE.fmtClock(tabSecNow(L, 'task2'))}`;
    if (!L.hinted && L.tab === 'task1' && tabSecNow(L, 'task1') >= TASK1_HINT_SEC) {
      L.hinted = true;
      NCE.toast('Task 1 已写 20 分钟，建议转到 Task 2', 'warn');
    }
    if (left <= 0) {
      NCE.toast('60 分钟到，写作自动收卷', 'warn');
      endWriting(true);
    }
  }

  // 结束写作：作文与用时冻结（存 localStorage），进入两篇的四维自评
  function endWriting(auto, btn) {
    const L = st.live;
    if (!L || L.phase !== 'write') return;
    if (!auto && !confirmTwice('writing-end', btn, '再点一次结束写作（结束后不能再修改）')) return;
    clearTimers();
    accumulateTab(L);
    L.durationSec = elapsedSec(L, 'writing');
    L.taskSec = { task1: Math.round(L.taskSec.task1), task2: Math.round(L.taskSec.task2) };
    L.phase = 'assess';
    writeFrozen(L.mockId, { section: 'writing', startedAt: L.startedAt, durationSec: L.durationSec, taskSec: L.taskSec, texts: L.texts, variant: L.variant, ts: Date.now() });
    disposeCharts();
    paintWritingAssess();
    window.scrollTo(0, 0);
  }

  function rubricKind(L, k) {
    if (k === 'task2') return 'task2';
    return L.variant === 'G' ? 'task1G' : 'task1A';
  }

  async function paintWritingAssess() {
    const L = st.live;
    st.stage = 'writing';
    if (L.phase !== 'submitting') L.phase = L.phase === 'submit-failed' ? 'submit-failed' : 'assess';
    root.innerHTML =
      topBar('← 模考首页（自评可以稍后继续）', '模考 · 写作自评') +
      '<div class="ie-note">写作时间已结束，作文已锁定。对照评分说明给两篇分别四维自评（4–9 分，0.5 一档）：每篇取四维平均<b>向下取整到 0.5</b>，' +
      '写作分 = (Task 1 + 2 × Task 2) / 3，再向下取整到 0.5（Task 2 的权重是 Task 1 的两倍）。</div>' +
      TASK_KEYS.map((k) => {
        const text = L.texts[k];
        const wc = countWords(text);
        return (
          `<div class="ie-card" data-k="${k}">` +
          `<h3>${TASK_LABEL[k]} <span class="ie-h3-sub">${wc} 词 · 用时约 ${esc(IE.fmtDuration(L.taskSec[k]))}</span></h3>` +
          (text.trim()
            ? (wc < MIN_WORDS[k] ? `<div class="ie-warn" style="margin-bottom:10px">字数不足：${TASK_LABEL[k]} 至少 ${MIN_WORDS[k]} 词，考试中会被扣分。</div>` : '') +
              `<details><summary class="ie-muted" style="cursor:pointer">展开查看原文</summary><div class="iem-essay" style="margin-top:8px">${paragraphsHtml(text)}</div></details>` +
              '<div class="iem-form" style="margin-top:12px"><div class="ie-loading">正在加载评分说明…</div></div>'
            : '<div class="ie-note">这一篇没有写，记 0 分，不需要自评。</div>') +
          '</div>'
        );
      }).join('') +
      '<div class="ie-card"><div class="iem-preview ie-muted">两篇自评完成后显示写作分预览（以服务端计算为准）。</div>' +
      '<div class="iem-actions"><button type="button" class="btn primary iem-save" disabled>保存写作部分</button><span class="ie-msg iem-msg"></span></div></div>';
    root.querySelector('.iem-back').onclick = renderHome;
    L.forms = {};
    for (const k of TASK_KEYS) {
      if (!L.texts[k].trim()) continue;
      const { dims, fallback, error } = await IE.rubricDims(rubricKind(L, k));
      if (!alive() || st.live !== L || st.stage !== 'writing') return;
      const el = root.querySelector(`.ie-card[data-k="${k}"] .iem-form`);
      L.forms[k] = IE.mountScoreForm(el, dims);
      if (fallback) {
        el.insertAdjacentHTML('afterbegin', `<div class="ie-warn" style="margin-bottom:10px">评分说明暂时加载不了（${esc(error ? error.message : '未知原因')}），先按维度名称自评，保存不受影响。</div>`);
      }
    }
    const preview = root.querySelector('.iem-preview');
    const paintPreview = () => {
      const bands = {};
      for (const k of TASK_KEYS) {
        if (!L.texts[k].trim()) bands[k] = 0;
        else {
          const sc = L.forms[k] && L.forms[k].getScores();
          if (!sc) return;
          const vals = Object.values(sc);
          bands[k] = IE.floorHalf(vals.reduce((a, b) => a + b, 0) / vals.length);
        }
      }
      const w = IE.floorHalf((bands.task1 + 2 * bands.task2) / 3);
      preview.innerHTML = `Task 1 <b>${IE.fmtBand(bands.task1)}</b> · Task 2 <b>${IE.fmtBand(bands.task2)}</b> → (${IE.fmtBand(bands.task1)} + 2 × ${IE.fmtBand(bands.task2)}) / 3 向下取整 → 写作 <b>${IE.fmtBand(w)}</b>（以服务端计算为准）`;
    };
    root.querySelectorAll('.iem-form').forEach((el) => {
      el.addEventListener('click', paintPreview);
    });
    paintPreview();
    const save = root.querySelector('.iem-save');
    save.disabled = L.phase === 'submitting';
    save.onclick = () => submitWriting(save);
    if (L.phase === 'submit-failed') setMsg(`上次保存失败：${L.error || ''}，可以重试`, 'bad');
  }

  async function submitWriting(btn) {
    const L = st.live;
    if (!L || L.phase === 'submitting') return;
    const payload = { section: 'writing', action: 'submit', durationSec: L.durationSec };
    for (const k of TASK_KEYS) {
      const text = L.texts[k];
      const dur = Math.min(MAX_DURATION.writing, Math.max(0, Math.round(L.taskSec[k])));
      if (!text.trim()) {
        payload[k] = { text: '', durationSec: dur };
        continue;
      }
      const scores = L.forms[k] && L.forms[k].getScores();
      if (!scores) {
        setMsg(`${TASK_LABEL[k]} 还有维度没打分：${L.forms[k] ? L.forms[k].missing().join('、') : ''}`, 'bad');
        return;
      }
      payload[k] = { text, selfScores: scores, durationSec: dur };
    }
    btn.disabled = true;
    L.phase = 'submitting';
    setMsg('正在保存…');
    await saveSection(L, payload, (e) => {
      btn.disabled = false;
      setMsg(`保存失败：${e.message}，可以重试`, 'bad');
    });
  }

  // ======================= 口语 =======================
  function stepLabel(s) {
    if (s.part === 2) return `Part 2：${(s.cue && s.cue.title) || ''}`;
    return `Part ${s.part}：${s.q || ''}`;
  }

  function startSpeaking() {
    const L = st.live;
    const p1 = L.items.part1;
    const p2 = L.items.part2;
    L.steps = [
      ...(p1.questions || []).filter((q) => q && q.q).map((q) => ({ part: 1, q: q.q, sample: q.sample || '' })),
      { part: 2, cue: p2.cueCard || {}, sample: p2.sample || '' },
      ...(Array.isArray(p2.part3) ? p2.part3 : []).filter((x) => x && x.q).map((x) => ({ part: 3, q: x.q, sample: x.sample || '' })),
    ].map((s) => Object.assign(s, { state: 'ready', durationSec: 0, audioUrl: null, label: stepLabel(s) }));
    L.idx = 0;
    L.phase = 'answer';
    L.prepNotes = '';
    L.topic = [p1.topic, p1.topicCn].filter(Boolean).join(' · ');
    st.stage = 'speaking';
    paintSpeaking();
  }

  function stepProgress(L, step) {
    const of = (part) => L.steps.filter((x) => x.part === part);
    if (step.part === 2) return 'Part 2 题卡';
    const list = of(step.part);
    return `Part ${step.part} · 第 ${list.indexOf(step) + 1} / ${list.length} 题`;
  }

  function paintSpeaking() {
    const L = st.live;
    st.stage = 'speaking';
    const step = L.steps[L.idx];
    const spk = (text) => (text ? ` <button type="button" class="btn small ghost iem-spk" data-text="${esc(text)}" title="听题">🔊</button>` : '');
    let q;
    if (step.part === 2) {
      const cue = step.cue || {};
      const points = Array.isArray(cue.points) ? cue.points.filter(Boolean) : [];
      q =
        '<div class="iem-cue">' +
        `<div class="t">${esc(cue.title || '')}${spk(cue.title)}</div>` +
        (points.length ? `<div>You should say:</div><ul>${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '') +
        (cue.final ? `<div>${esc(cue.final)}</div>` : '') +
        '</div>';
    } else {
      q = `<div class="iem-sq">${esc(step.q)}${spk(step.q)}</div>`;
      if (step.part === 1 && L.topic) q = `<div class="ie-muted" style="margin-bottom:6px">话题：${esc(L.topic)}</div>` + q;
    }
    let actions;
    if (step.state === 'ready') {
      actions = step.part === 2
        ? '<button type="button" class="btn primary iem-prep">开始准备（60 秒）</button><button type="button" class="btn small ghost iem-talk">跳过准备，直接作答</button>'
        : '<button type="button" class="btn primary iem-talk">🎙 开始作答</button>';
    } else if (step.state === 'prep') {
      actions = '<button type="button" class="btn primary iem-talk">准备好了，开始作答</button>';
    } else {
      actions = `<button type="button" class="btn primary iem-stop">⏹ ${step.part === 2 ? '结束作答' : '结束本题'}</button>`;
    }
    const hint = step.part === 2
      ? (step.state === 'talk' ? '连续说满 2 分钟' : '先准备 1 分钟（可记笔记），再连续说 2 分钟')
      : step.part === 1 ? '建议每题答 20–30 秒：直接回答 + 原因或例子' : '建议每题答 40–60 秒：观点 + 解释 + 例子';
    root.innerHTML =
      topBar('← 退出', '模考 · 口语') +
      '<div class="iem-bar"><div class="iem-bar-row">' +
      `<span class="iem-phase">🎙️ ${esc(stepProgress(L, step))}</span><span class="iem-clock"${step.state === 'ready' ? ' hidden' : ''}></span>` +
      `<span class="iem-now">${esc(hint)}</span></div>` +
      `<div class="iem-prog"><i style="width:${Math.round((L.idx / L.steps.length) * 100)}%"></i></div></div>` +
      `<div class="iem-note-s">${CAN_RECORD && !rec.denied ? '🎙 作答时自动录音，录音只保存在本页内存里用于回听，不上传、不落盘。' : '⚠️ 麦克风不可用或浏览器不支持录音，本次只计时。'}</div>` +
      '<div class="ie-card">' + q +
      (step.part === 2 && step.state !== 'ready' ? `<textarea class="ie-input iem-notes" placeholder="准备笔记（只在本页，不提交）">${esc(L.prepNotes)}</textarea>` : '') +
      `<div class="iem-actions">${actions}</div>` +
      '</div>';
    exitButton();
    root.querySelectorAll('.iem-spk').forEach((b) => {
      b.onclick = () => NCE.speak(b.dataset.text);
    });
    const notes = root.querySelector('.iem-notes');
    if (notes) notes.oninput = () => { L.prepNotes = notes.value; };
    const prep = root.querySelector('.iem-prep');
    if (prep) prep.onclick = () => startPrep(step);
    const talk = root.querySelector('.iem-talk');
    if (talk) talk.onclick = () => startTalk(step);
    const stop = root.querySelector('.iem-stop');
    if (stop) stop.onclick = () => stopTalk(step, stop);
    if (step.state === 'prep' || step.state === 'talk') paintSpeakingClock(step);
  }

  function paintSpeakingClock(step) {
    const el = root && root.querySelector('.iem-clock');
    if (!el) return;
    const elapsed = (Date.now() - step.phaseStart) / 1000;
    if (step.state === 'prep') {
      el.textContent = IE.fmtClock(Math.max(0, PREP_SEC - elapsed));
      el.className = 'iem-clock';
      return;
    }
    const recOn = !!rec.recorder;
    const now = root.querySelector('.iem-now');
    if (step.part === 2) {
      const left = TALK_SEC - elapsed;
      el.textContent = left >= 0 ? IE.fmtClock(left) : '+' + IE.fmtClock(-left);
      el.className = 'iem-clock' + (left >= 0 ? '' : ' over');
      if (now) now.innerHTML = (recOn ? '<span class="iem-recdot"></span>录音中 · ' : '') + (left >= 0 ? '连续说满 2 分钟' : '2 分钟到了，考试中考官会在这里打断你，可以收尾了');
    } else {
      el.textContent = IE.fmtClock(elapsed);
      el.className = 'iem-clock';
      if (now) now.innerHTML = (recOn ? '<span class="iem-recdot"></span>录音中 · ' : '') + esc(step.part === 1 ? '直接回答 + 原因或例子' : '观点 + 解释 + 例子');
    }
  }

  // await 麦克风之后确认这一题仍是当前作答；已中断 / 切走时顺手关麦
  function stillCurrentStep(L, step) {
    if (alive() && st.live === L && !L.interrupted && L.phase === 'answer' && L.steps[L.idx] === step) return true;
    releaseMic();
    return false;
  }

  async function startPrep(step) {
    const L = st.live;
    if (step.starting) return;
    step.starting = true;
    stopSpeech();
    try {
      await ensureMic(); // 有用户点击时先申请麦克风，准备结束才能自动开录
    } finally {
      step.starting = false;
    }
    if (!stillCurrentStep(L, step)) return;
    step.state = 'prep';
    step.phaseStart = Date.now();
    paintSpeaking();
    clearTimers();
    every(() => {
      if (st.live !== L || L.interrupted) return;
      if ((Date.now() - step.phaseStart) / 1000 >= PREP_SEC) {
        NCE.toast('准备时间到，开始作答（2 分钟）', 'ok');
        startTalk(step);
        return;
      }
      paintSpeakingClock(step);
    }, 250);
  }

  async function startTalk(step) {
    const L = st.live;
    if (step.starting) return;
    step.starting = true;
    clearTimers();
    stopSpeech();
    try {
      await ensureMic();
    } finally {
      step.starting = false;
    }
    if (!stillCurrentStep(L, step)) return;
    recStart();
    step.state = 'talk';
    step.phaseStart = Date.now();
    step.overWarned = false;
    paintSpeaking();
    clearTimers();
    every(() => {
      if (st.live !== L || L.interrupted) return;
      if (step.part === 2 && !step.overWarned && (Date.now() - step.phaseStart) / 1000 >= TALK_SEC) {
        step.overWarned = true;
        NCE.toast('⏰ 2 分钟到了（考试中考官会在这里打断），可以结束作答', 'warn');
      }
      paintSpeakingClock(step);
    }, 250);
  }

  async function stopTalk(step, btn) {
    const L = st.live;
    if (step.state !== 'talk') return;
    clearTimers();
    step.durationSec = Math.max(1, Math.round((Date.now() - step.phaseStart) / 1000));
    step.state = 'stopping';
    if (btn) btn.disabled = true;
    const url = await recStop();
    if (st.live !== L || L.interrupted) {
      if (url) {
        try { URL.revokeObjectURL(url); } catch (e) { console.warn('[ielts-mock] 释放录音失败', e); }
      }
      return;
    }
    step.audioUrl = url;
    step.state = 'done';
    if (L.idx < L.steps.length - 1) {
      L.idx++;
      if (alive()) paintSpeaking();
    } else toSpeakingAssess();
  }

  // 全部答完：关麦（录音保留回听），答题用时冻结到 localStorage，进入四维自评
  function toSpeakingAssess() {
    const L = st.live;
    clearTimers();
    stopSpeech();
    releaseMic();
    L.phase = 'assess';
    L.durationSec = Math.min(MAX_DURATION.speaking, L.steps.reduce((n, s) => n + (Number(s.durationSec) || 0), 0));
    writeFrozen(L.mockId, {
      section: 'speaking',
      startedAt: L.startedAt,
      durationSec: L.durationSec,
      steps: L.steps.map((s) => ({ label: s.label, part: s.part, durationSec: s.durationSec, state: s.state })),
      ts: Date.now(),
    });
    if (alive()) {
      paintSpeakingAssess();
      window.scrollTo(0, 0);
    }
  }

  async function paintSpeakingAssess() {
    const L = st.live;
    st.stage = 'speaking';
    if (L.phase !== 'submitting') L.phase = L.phase === 'submit-failed' ? 'submit-failed' : 'assess';
    const missingAudio = L.restored || L.steps.some((s) => s.state === 'done' && !s.audioUrl && s.durationSec && CAN_RECORD && !rec.denied);
    root.innerHTML =
      topBar('← 模考首页（自评可以稍后继续）', '模考 · 口语自评') +
      '<div class="ie-card">' +
      `<h3>⏱ 本次作答 <span class="ie-h3-sub">${L.steps.length} 题 · 共 ${esc(IE.fmtDuration(L.durationSec))}</span></h3>` +
      (L.restored ? '<div class="iem-note-s">页面刷新过，录音已随之释放，只能凭记忆自评。</div>' : (missingAudio ? '<div class="iem-note-s">部分题目没有录到声音。</div>' : '')) +
      '<div>' +
      L.steps.map((s) =>
        '<div class="iem-sitem">' +
        `<b>${esc(s.label)}</b><div class="ie-muted">用时 ${esc(IE.fmtDuration(s.durationSec))}</div>` +
        (s.audioUrl ? `<audio class="iem-audio" controls src="${esc(s.audioUrl)}"></audio>` : '') +
        (s.sample ? `<details><summary class="ie-muted" style="cursor:pointer">参考答案（建议先回听自己的再看）</summary>${paragraphsHtml(s.sample)}</details>` : '') +
        '</div>'
      ).join('') +
      '</div></div>' +
      '<div class="ie-card"><h3>⚖️ 四维自评</h3>' +
      '<div class="ie-note" style="margin-bottom:12px">回听录音，对照每档描述和自查清单给四个维度各选一个分（4–9 分，0.5 一档）。口语分取平均后<b>向下取整到 0.5</b>。</div>' +
      '<div class="iem-form"><div class="ie-loading">正在加载评分说明…</div></div>' +
      '<textarea class="ie-input iem-notes iem-review" maxlength="1000" placeholder="备注（可选）：卡壳的地方、想换的表达…"></textarea>' +
      '<div class="iem-actions"><button type="button" class="btn primary iem-save" disabled>保存口语部分</button><span class="ie-msg iem-msg"></span></div></div>';
    root.querySelector('.iem-back').onclick = renderHome;
    const { dims, fallback, error } = await IE.rubricDims('speaking');
    if (!alive() || st.live !== L || st.stage !== 'speaking') return;
    const formEl = root.querySelector('.iem-form');
    L.form = IE.mountScoreForm(formEl, dims);
    if (fallback) {
      formEl.insertAdjacentHTML('afterbegin', `<div class="ie-warn" style="margin-bottom:10px">评分说明暂时加载不了（${esc(error ? error.message : '未知原因')}），先按维度名称自评，保存不受影响。</div>`);
    }
    const save = root.querySelector('.iem-save');
    save.disabled = L.phase === 'submitting';
    save.onclick = () => submitSpeaking(save);
    if (L.phase === 'submit-failed') setMsg(`上次保存失败：${L.error || ''}，可以重试`, 'bad');
  }

  async function submitSpeaking(btn) {
    const L = st.live;
    if (!L || L.phase === 'submitting') return;
    const scores = L.form && L.form.getScores();
    if (!scores) {
      setMsg('还有维度没打分：' + (L.form ? L.form.missing().join('、') : ''), 'bad');
      return;
    }
    const notes = (root.querySelector('.iem-review').value || '').trim().slice(0, 1000);
    btn.disabled = true;
    L.phase = 'submitting';
    setMsg('正在保存…');
    await saveSection(L, { section: 'speaking', action: 'submit', durationSec: L.durationSec, selfScores: scores, notes }, (e) => {
      btn.disabled = false;
      setMsg(`保存失败：${e.message}，可以重试`, 'bad');
    });
  }

  // ======================= 结果 =======================
  function wrongHtml(no, yours, yoursText, answer, answerText, extra) {
    const your = yours ? `${yours}${yoursText ? `（${yoursText}）` : ''}` : '未作答';
    const right = (Array.isArray(answer) ? answer : []).join(' / ');
    return (
      '<details class="iem-wrong"><summary>' +
      `<span class="iem-no">${esc(no)}</span> 你的答案：<b>${esc(your)}</b>${extra.overLimit ? ' <span class="ie-pill warn">超字数</span>' : ''}` +
      ` · 正确：<b>${esc(right)}${answerText ? `（${esc(answerText)}）` : ''}</b></summary>` +
      (extra.prompt ? `<div class="q">${esc(extra.prompt)}</div>` : '') +
      (extra.explanation ? `<div>${esc(extra.explanation)}</div>` : '') +
      (extra.evidence && extra.evidence.quote ? `<div class="ev">段落 ${esc(extra.evidence.para || '')}：${esc(extra.evidence.quote)}</div>` : '') +
      '</details>'
    );
  }

  function reviewListeningHtml(list) {
    if (!Array.isArray(list) || !list.length) return '<div class="ie-muted">听力部分已放弃，没有作答记录。</div>';
    return list.map((p) => {
      const head = `Part ${esc(p.part || '?')} · ${esc(p.title || p.sectionId)} · ${esc(p.raw)}/${esc(p.total)}` +
        (p.missing ? ' · 题目已不在题库里' : p.wrong.length ? ` · 错 ${p.wrong.length} 题` : ' · 全对');
      return `<div class="iem-sub">${head}</div>` +
        p.wrong.map((w) => wrongHtml(w.no, w.yours, w.yoursText, w.answer, w.answerText, w)).join('');
    }).join('');
  }

  function reviewReadingHtml(list) {
    if (!Array.isArray(list) || !list.length) return '<div class="ie-muted">阅读部分已放弃，没有作答记录。</div>';
    return list.map((p, i) => {
      const head = `Passage ${i + 1}（${esc(DIFF_LABEL[p.difficulty] || p.difficulty || '?')}）· ${esc(p.title || p.passageId)} · ${esc(p.raw)}/${esc(p.total)}` +
        (p.missing ? ' · 文章已不在题库里' : p.wrong.length ? ` · 错 ${p.wrong.length} 题` : ' · 全对');
      return `<div class="iem-sub">${head}</div>` +
        p.wrong.map((w) => wrongHtml(w.displayNo, w.yours, '', w.answer, w.answerText, w)).join('');
    }).join('');
  }

  function reviewWritingHtml(w, band) {
    if (!w) return '<div class="ie-muted">写作部分已放弃。</div>';
    const t1 = w.task1 || {};
    const t2 = w.task2 || {};
    const line = (k, t) => {
      const prompt = String(t.prompt || '');
      return (
        `<div class="iem-sitem"><b>${TASK_LABEL[k]}：${esc(IE.fmtBand(t.band))}</b>` +
        `<span class="ie-muted"> · ${esc(t.wordCount || 0)} 词${t.selfScores ? ' · ' + Object.keys(t.selfScores).map((d) => `${esc(d)} ${esc(IE.fmtBand(t.selfScores[d]))}`).join(' · ') : ' · 未作答'}</span>` +
        (prompt ? `<div class="ie-muted" style="margin-top:4px">${esc(prompt.length > 160 ? prompt.slice(0, 160) + '…' : prompt)}</div>` : '') +
        '</div>'
      );
    };
    return (
      line('task1', t1) + line('task2', t2) +
      `<div class="iem-note-s">写作分 = (${esc(IE.fmtBand(t1.band))} + 2 × ${esc(IE.fmtBand(t2.band))}) / 3 向下取整到 0.5 = <b>${esc(IE.fmtBand(band))}</b>。两篇作文在「记录」页可以看原文。</div>`
    );
  }

  function renderResult() {
    haltAll();
    st.stage = 'result';
    const v = st.mock;
    const r = v.result || {};
    const sc = v.scores || {};
    const rv = v.review || {};
    const cmp = v.compare;
    const d = (k) => (cmp ? fmtDelta(cmp.deltas[k]) : '');
    const tile = (k, sub) =>
      `<div class="iem-tile"><span>${INFO[k].icon} ${esc(INFO[k].label)}</span><b>${esc(IE.fmtBand(r[k]))}${d(k)}</b><span>${sub ? esc(sub) : (r[k] == null ? '已放弃' : '')}</span></div>`;
    const ls = sc.listening;
    const rs = sc.reading;
    const ws = sc.writing;
    const ss = sc.speaking;
    root.innerHTML =
      topBar('← 模考首页', `模考 · ${IE.fmtDateTime(v.createdAt)} · 出分于 ${IE.fmtDateTime(v.finishedAt)}`) +
      '<div class="ie-card">' +
      '<div class="iem-overall"><span class="ie-muted">总分</span>' +
      `<b>${esc(r.overall == null ? '—' : IE.fmtBand(r.overall))}</b>${d('overall')}` +
      (r.complete ? '' : '<span class="ie-muted">有部分被放弃，本次不出总分</span>') +
      '</div>' +
      '<div class="iem-tiles">' +
      tile('listening', ls ? `原始分 ${ls.raw}/${ls.total}` : '') +
      tile('reading', rs ? `原始分 ${rs.raw}/${rs.total} → 折算 ${rs.scaled40}/40` : '') +
      tile('writing', ws ? `Task 1 ${IE.fmtBand(ws.task1 && ws.task1.band)} · Task 2 ${IE.fmtBand(ws.task2 && ws.task2.band)}` : '') +
      tile('speaking', ss && ss.selfScores ? Object.keys(ss.selfScores).map((x) => `${x} ${IE.fmtBand(ss.selfScores[x])}`).join(' · ') : '') +
      '</div>' +
      `<div class="iem-note-s">${cmp
        ? `对比上次模考（${esc(IE.fmtDateTime(cmp.previous.finishedAt))}）：${esc(sectionBandsText(cmp.previous.result))} · 总分 ${esc(IE.fmtBand(cmp.previous.result.overall))}`
        : '这是第一套出分的模考，下次模考会和这次对比。'}</div>` +
      `<div class="iem-note-s">${esc(v.bandNote || '')}</div>` +
      '</div>' +
      `<div class="ie-card"><h3>🎧 听力错题 <span class="ie-h3-sub">点开看题目、正确答案和解析</span></h3>${reviewListeningHtml(rv.listening)}</div>` +
      `<div class="ie-card"><h3>📖 阅读错题 <span class="ie-h3-sub">题号按整套连续编号</span></h3>${reviewReadingHtml(rv.reading)}</div>` +
      `<div class="ie-card"><h3>✍️ 写作</h3>${reviewWritingHtml(rv.writing, r.writing)}</div>` +
      '<div class="iem-actions">' +
      '<button type="button" class="btn primary iem-home">返回模考首页</button>' +
      '<button type="button" class="btn small iem-go" data-page="listening">去听力练习</button>' +
      '<button type="button" class="btn small iem-go" data-page="reading">去阅读练习</button>' +
      '<button type="button" class="btn small iem-go" data-page="history">看写作 / 口语记录</button>' +
      '</div>';
    root.querySelector('.iem-back').onclick = renderHome;
    root.querySelector('.iem-home').onclick = renderHome;
    root.querySelectorAll('.iem-go').forEach((b) => {
      b.onclick = () => IE.go(b.dataset.page);
    });
  }

  // ---------- 生命周期 ----------
  // 听力：页面隐藏时朗读会被打断，考试中断（检查时间改为「已暂停」）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !st.visible) return;
    const L = st.live;
    if (!L || L.section !== 'listening' || !['narrate', 'read', 'play', 'check'].includes(L.phase)) return;
    stopSpeech();
    clearTimers();
    const hard = markInterrupted(L, REASON.hidden);
    if (!alive()) return;
    if (hard) renderOverview();
    else paintListeningStatus();
  });
  // 关闭 / 刷新页面时停止朗读、关麦
  window.addEventListener('pagehide', () => {
    if (!st.live) return;
    stopSpeech();
    releaseMic();
  });

  IE.registerPage('mock', {
    meta: { label: '模考', icon: '🏁', before: 'history' },
    render(body, c) {
      root = body;
      ctx = c;
      st.visible = true;
      // 有页面内存里的作答（可能已中断）：回到这套模考的总览，由总览决定续做还是只给「重新开始 / 放弃」
      if (st.live) openMock(st.live.mockId);
      else renderHome();
    },
    // 切回雅思标签时保留现场：计时中的部分已在 pause 时换成中断面板
    resume() {
      if (!root || !root.isConnected || st.stage === 'loading' || st.stage === 'left') return false;
      st.visible = true;
      return true;
    },
    pause() {
      st.visible = false;
      const L = st.live;
      suspend(REASON.tab);
      if (!alive() || !L) return;
      if (L.interrupted && st.stage === L.section) renderOverview();
      else if (L.section === 'listening' && st.stage === 'listening') paintListeningStatus();
    },
    leave() {
      st.visible = false;
      suspend(REASON.leave);
      st.stage = 'left';
    },
  });
})();
