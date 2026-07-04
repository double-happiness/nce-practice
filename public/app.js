'use strict';

const state = {
  meta: null,
  selectedBook: 1,
  selectedUnit: null, // { min, max } 或 null=全部
  selectedGrammar: null, // string 或 null=全部
  questions: [], // 当前答题的题目
  learnBook: 1, // 教材学习当前选中的册数
  learnLessons: [], // 当前册的课程目录（供翻页）
  lessonStats: {}, // 每课练习正确率（key: "book-lesson"，来自 /api/stats/lesson）
  vocabStars: new Set(), // 生词本已收藏的单词
  speakContext: null, // { book, lesson } 听写等无 currentLesson 时的朗读上下文
  articleTab: null, // official | orig | mine — 教材页当前子标签
};

const $ = (id) => document.getElementById(id);

// 统一请求出口：网络失败 / 服务端报错时 toast 提示（否则界面会静默失败）。
// 调用方仍会收到 reject，需要兜底值的地方照常用 .catch(() => fallback)。
let lastApiToast = { msg: '', ts: 0 };
async function api(url, opts) {
  let r;
  try {
    r = await fetch(url, opts);
  } catch (e) {
    apiErrorToast('网络请求失败，请确认服务是否在运行');
    throw e;
  }
  if (!r.ok) {
    let msg = `请求失败（${r.status}）`;
    try {
      const j = await r.json();
      if (j && j.error) msg = j.error;
    } catch (e) { /* 非 JSON 响应，用默认文案 */ }
    apiErrorToast(msg);
    throw new Error(msg);
  }
  return r.json();
}
// 同一错误 3 秒内只弹一次（首页并发 3 个请求失败时不连弹 3 条）
function apiErrorToast(msg) {
  const now = Date.now();
  if (msg === lastApiToast.msg && now - lastApiToast.ts < 3000) return;
  lastApiToast = { msg, ts: now };
  toast(msg, 'bad');
}

// ---------- 语音朗读（浏览器内置 TTS，优先英音 + 本地语音，离线可用）----------
let VOICE = null;
let TTS_CLOUD_ONLY = false; // 当前选中的是否为需联网的云端语音
let ttsWarnedOffline = false;
// macOS/部分系统的“趣味语音”会发出音乐/机器噪音而非清晰人声，且常被标成 en_US 排在前面，
// 若无 en-GB 就绪时退回 /^en/ 很容易误选它们（用户听到“声音不对、有噪音”）。这里显式排除。
const NOVELTY_VOICE = /Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Jester|Organ|Superstar|Trinoids|Wobble|Zarvox|Hysterical|Whisper|Pipe Organ|Albert|Fred/i;

function voicePool(all) {
  const usable = all.filter((v) => !NOVELTY_VOICE.test(v.name));
  return usable.length ? usable : all;
}

// 优先 localService===true 的本地语音；离线时跳过明确需联网的云端语音
function preferOfflineCapable(list) {
  if (!list.length) return list;
  const local = list.filter((v) => v.localService === true);
  const unknown = list.filter((v) => v.localService !== true && v.localService !== false);
  const cloud = list.filter((v) => v.localService === false);
  if (!navigator.onLine) return local.length ? local : unknown;
  return local.length ? local : (unknown.length ? unknown : cloud);
}

function pickVoice() {
  if (!window.speechSynthesis) return;
  const all = speechSynthesis.getVoices();
  if (!all.length) return; // 语音尚未加载，onvoiceschanged 会再次触发
  const pool = preferOfflineCapable(voicePool(all));
  const byLang = (re) => pool.filter((v) => re.test(v.lang));
  // 每个语言档里优先挑公认高质量的英音/美音（Daniel/Serena/Kate/Samantha…）或标注 enhanced/premium 的
  const best = (list) =>
    list.find((v) => /daniel|serena|kate|arthur|stephanie|samantha|enhanced|premium/i.test(v.name)) || list[0];
  const gb = byLang(/en[-_]GB/i);
  const us = byLang(/en[-_]US/i);
  const en = byLang(/^en/i);
  VOICE = (gb.length && best(gb)) || (us.length && best(us)) || (en.length && best(en)) || null;
  TTS_CLOUD_ONLY = !!(VOICE && VOICE.localService === false);
}

function ensureVoice() {
  if (!window.speechSynthesis) return null;
  if (!VOICE) pickVoice();
  if (!VOICE) speechSynthesis.getVoices(); // 部分浏览器需再次触发才能加载语音列表
  return VOICE;
}

function makeUtterance(text, rateMul) {
  ensureVoice();
  const u = new SpeechSynthesisUtterance(text);
  if (VOICE) {
    u.voice = VOICE;
    u.lang = VOICE.lang || 'en-GB';
  } else {
    u.lang = 'en-GB';
  }
  u.rate = TTS_RATE * (rateMul != null ? rateMul : 1);
  u.onerror = function (ev) {
    if (!ev || ev.error === 'interrupted' || ev.error === 'canceled') return;
    if (!navigator.onLine || TTS_CLOUD_ONLY) {
      if (!ttsWarnedOffline) {
        ttsWarnedOffline = true;
        toast('朗读失败：当前无可用本地语音。请联网后重试，或在系统设置中安装英文语音包。', 'warn');
      }
    }
  };
  return u;
}

if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
  window.addEventListener('online', function () {
    ttsWarnedOffline = false;
    pickVoice();
  });
  window.addEventListener('offline', pickVoice);
}
// 只保留英文部分再朗读：去掉中文、全角标点，以及 emoji/符号（否则 TTS 会读出杂音）
function enOnly(s) {
  return String(s || '')
    .replace(/[一-鿿]/g, ' ') // CJK 汉字
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]/gu, ' ') // emoji/箭头/杂项符号
    .replace(/[，。！？；：、""''（）【】《》]/g, ' ') // 全角标点
    .replace(/[°§¶†‡•™©®*_#|~^`\\]/g, ' ') // 度数号等非朗读符号
    .replace(/\s+/g, ' ')
    .trim();
}
// 全局语速（顶栏可调，localStorage 记忆），听写/慢速跟读都靠它
let TTS_RATE = 0.9;
try { TTS_RATE = Number(localStorage.getItem('nce-tts-rate')) || 0.9; } catch (e) {}
function asAnswerList(answers) {
  if (answers == null || answers === '') return [];
  const list = Array.isArray(answers) ? answers : [answers];
  return list.filter((a) => a != null && String(a).trim());
}

function firstAnswer(answers) {
  const list = asAnswerList(answers);
  return list.length ? list[0] : '';
}

// 单个英文句子/词旁的 🔊 按钮 HTML
function speakBtnHtml(text, extraClass) {
  const t = enOnly(firstAnswer(text) || text);
  if (!t) return '';
  const cls = extraClass ? `spk ${extraClass}` : 'spk';
  return `<span class="${cls}" data-speak="${escapeAttr(t)}" title="朗读">🔊</span>`;
}

// 多个可接受答案时，每个答案后各跟一个 🔊
function formatAnswersWithSpeak(answers, opts) {
  const list = asAnswerList(answers);
  if (!list.length) return '';
  const o = opts || {};
  const wrap = o.wrapPassage ? wrapPassageWords : escapeHtml;
  const sep = o.sep != null ? o.sep : ' <span style="color:#94a3b8">/</span> ';
  const btnClass = o.btnClass || '';
  const btnStyle = o.btnStyle || 'padding:2px 8px;font-size:13px';
  return list.map((a) => {
    const cls = btnClass ? ` class="${btnClass}"` : '';
    return `${wrap(a)} <button${cls} style="${btnStyle}" data-speak="${escapeAttr(a)}" title="朗读">🔊</button>`;
  }).join(sep);
}

function bindSpeakClicks(root) {
  if (!root) return;
  root.querySelectorAll('[data-speak]').forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      speak(el.dataset.speak);
    };
  });
}

// ---------- 真人发音库（Wikimedia Commons，本地缓存）----------
let PRONUNC_INDEX = null;
let humanAudio = null;

// ---------- 原声课文片段（LRC 时间轴，优先于真人单词/TTS）----------
let OFFICIAL_SEGMENTS = null;
let officialSegmentAudio = null;

function normSpeakLine(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[一-鿿]/g, ' ')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakContextLesson() {
  if (state.currentOfficialPassage && state.currentOfficialPassage.book != null) {
    return { book: state.currentOfficialPassage.book, lesson: state.currentOfficialPassage.lesson };
  }
  if (state.currentLesson) {
    return { book: state.currentLesson.book, lesson: state.currentLesson.lesson };
  }
  if (state.speakContext) return state.speakContext;
  return null;
}

function segmentsFromPassage(p) {
  const segs = [];
  const lines = p.lines || [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    const n = normSpeakLine(line.en);
    if (!n) continue;
    segs.push({ n, audio: p.audio, start: line.t, end: next ? next.t : line.t + 5 });
  }
  return segs;
}

function lookupOfficialSegment(text) {
  const ctx = speakContextLesson();
  if (!ctx) return null;
  const n = normSpeakLine(enOnly(firstAnswer(text) || text));
  if (!n) return null;

  let segs = null;
  const p = state.currentOfficialPassage;
  if (p && p.book === ctx.book && p.lesson === ctx.lesson && p.lines && p.lines.length) {
    segs = segmentsFromPassage(p);
  } else if (OFFICIAL_SEGMENTS) {
    segs = OFFICIAL_SEGMENTS[`${ctx.book}-${ctx.lesson}`];
  }
  if (!segs || !segs.length) return null;

  let hit = segs.find((s) => s.n === n);
  if (hit) return hit;
  hit = segs.find((s) => n.startsWith(s.n) || s.n.startsWith(n));
  return hit || null;
}

function stopOfficialSegmentAudio() {
  if (officialSegmentAudio) {
    officialSegmentAudio.pause();
    officialSegmentAudio.onended = null;
    officialSegmentAudio.ontimeupdate = null;
    officialSegmentAudio = null;
  }
}

function stopAllSpeakAudio() {
  stopHumanAudio();
  stopOfficialAudio();
  if (window.speechSynthesis) speechSynthesis.cancel();
}

function pronuncSlugClient(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function pronuncLookupKeys(text) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return [];
  const slug = pronuncSlugClient(raw);
  const keys = [slug, raw];
  if (raw.includes(' ')) keys.push(raw.replace(/\s+/g, ''));
  return [...new Set(keys.filter(Boolean))];
}

function isPronuncLookupCandidate(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return t.split(/\s+/).filter(Boolean).length <= 4 && t.length <= 48;
}

function lookupHumanPronunc(text) {
  if (!PRONUNC_INDEX || !isPronuncLookupCandidate(text)) return null;
  for (const k of pronuncLookupKeys(text)) {
    const e = PRONUNC_INDEX[k];
    if (e && e.file) return e;
  }
  return null;
}

function isLessonTextTab() {
  return state.articleTab === 'orig';
}

/** 教材原文与官方 LRC 正文是否实质相同（导入脚本写入的重复内容） */
function lessonTextMatchesOfficial() {
  const t = state.currentLessonText;
  const p = state.currentOfficialPassage;
  if (!t || !t.en || !p || !p.en) return false;
  return normSpeakLine(t.en) === normSpeakLine(p.en);
}

function showLessonTextTab() {
  const hasOrig = !!(state.currentLessonText && state.currentLessonText.en);
  const hasOfficial = !!(state.currentOfficialPassage && state.currentOfficialPassage.en);
  if (!hasOrig) return false;
  // 与原声课文正文相同则隐藏，避免两标签重复展示
  return !hasOfficial || !lessonTextMatchesOfficial();
}

/** 课文原声切片：教材原文页强制；其余仅在课文详情页的长句使用（单词/短短语走真人+TTS） */
function shouldUseOfficialAudio(text) {
  const t = enOnly(firstAnswer(text) || text);
  if (!t) return false;
  const wrap = $('lessonDetailWrap');
  if (!wrap || wrap.classList.contains('hidden')) return false;
  if (!speakContextLesson()) return false;
  if (state.articleTab === 'mine') return false; // 原创精读走 TTS，不用课文原声
  if (isLessonTextTab()) return true;
  const wc = t.split(/\s+/).filter(Boolean).length;
  if (wc <= 2 && t.length <= 28) return false;
  return true;
}

let speakFailWarned = false;
function toastSpeakFail() {
  if (speakFailWarned) return;
  speakFailWarned = true;
  setTimeout(function () { speakFailWarned = false; }, 8000);
  const msg = !navigator.onLine || TTS_CLOUD_ONLY
    ? '朗读失败：请联网，或在系统设置中安装英文语音包后重试'
    : '朗读失败：请检查系统英文语音，或确认浏览器未静音';
  toast(msg, 'warn');
}

function speakWithTts(t) {
  if (!window.speechSynthesis) {
    toast('当前浏览器不支持语音朗读，建议使用 Chrome / Edge / Safari。', 'bad');
    return;
  }
  stopAllSpeakAudio();
  try { speechSynthesis.resume(); } catch (e) {}
  if (!ensureVoice()) pickVoice();
  const u = makeUtterance(t);
  const baseErr = u.onerror;
  u.onerror = function (ev) {
    if (baseErr) baseErr(ev);
    if (!ev || ev.error === 'interrupted' || ev.error === 'canceled') return;
    toastSpeakFail();
  };
  speechSynthesis.speak(u);
}

function stopHumanAudio() {
  if (humanAudio) {
    humanAudio.pause();
    humanAudio.currentTime = 0;
    humanAudio = null;
  }
}

function trySpeakHuman(text, onFail) {
  const entry = lookupHumanPronunc(text);
  if (!entry) return false;
  stopAllSpeakAudio();
  const a = new Audio(entry.file);
  humanAudio = a;
  let done = false;
  function finish(failed) {
    if (done) return;
    done = true;
    if (humanAudio === a) humanAudio = null;
    if (failed && onFail) onFail();
  }
  a.onended = function () { finish(false); };
  a.onerror = function () { finish(true); };
  a.play().catch(function () { finish(true); });
  return true;
}

function trySpeakOfficial(text, onFail) {
  const seg = lookupOfficialSegment(text);
  if (!seg) return false;
  stopAllSpeakAudio();
  const a = new Audio(seg.audio);
  officialSegmentAudio = a;
  const endAt = seg.end > seg.start ? seg.end : seg.start + 5;
  const maxMs = Math.max(400, (endAt - seg.start) * 1000 + 250);
  let stopTimer = null;
  let done = false;

  function cleanup() {
    if (stopTimer) clearTimeout(stopTimer);
    if (officialSegmentAudio === a) officialSegmentAudio = null;
    a.onended = null;
    a.ontimeupdate = null;
    a.onerror = null;
  }

  function finish(failed) {
    if (done) return;
    done = true;
    cleanup();
    if (failed && onFail) onFail();
  }

  a.currentTime = seg.start;
  a.ontimeupdate = function () {
    if (a.currentTime >= endAt - 0.05) {
      a.pause();
      finish(false);
    }
  };
  a.onended = function () { finish(false); };
  a.onerror = function () { finish(true); };
  stopTimer = setTimeout(function () {
    if (officialSegmentAudio === a) {
      a.pause();
      finish(false);
    }
  }, maxMs);
  a.play().catch(function () { finish(true); });
  return true;
}

async function loadPronuncIndex() {
  try {
    const r = await fetch('/audio/pronunc-index.json');
    if (!r.ok) return;
    const j = await r.json();
    PRONUNC_INDEX = {};
    for (const k of Object.keys(j)) {
      if (k.startsWith('_')) continue;
      PRONUNC_INDEX[k] = j[k];
    }
  } catch (e) {
    PRONUNC_INDEX = {};
  }
}

async function loadOfficialSegments() {
  try {
    const r = await fetch('/audio/official-segments.json');
    if (!r.ok) return;
    OFFICIAL_SEGMENTS = await r.json();
  } catch (e) {
    OFFICIAL_SEGMENTS = {};
  }
}

function speak(text) {
  const t = enOnly(firstAnswer(text) || text);
  if (!t) {
    toast('没有可朗读的英文内容', 'warn');
    return;
  }
  if (isLessonTextTab()) {
    const onFail = function () {
      toast('本句无法匹配原声片段，请确认教材原文与录音一致', 'warn');
    };
    if (trySpeakOfficial(t, onFail)) return;
    onFail();
    return;
  }
  if (state.articleTab === 'mine') {
    speakWithTts(t);
    return;
  }
  const fallbackTts = function () { speakWithTts(t); };
  if (shouldUseOfficialAudio(text) && trySpeakOfficial(t, fallbackTts)) return;
  if (trySpeakHuman(t, fallbackTts)) return;
  fallbackTts();
}
// 依次朗读一组词（用于“全部单词连读”）
function speakSequence(list) {
  stopAllSpeakAudio();
  if (!window.speechSynthesis) return;
  try { speechSynthesis.resume(); } catch (e) {}
  list.map(enOnly).filter(Boolean).forEach((t) => {
    speechSynthesis.speak(makeUtterance(t, 0.95));
  });
}
// 顺序连读多句（逐句等待上一句结束，避免浏览器 TTS 队列错乱）
function speakLines(lines, onEnd) {
  if (!window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }
  stopAllSpeakAudio();
  try { speechSynthesis.resume(); } catch (e) {}
  const items = (lines || []).map(enOnly).filter(Boolean);
  if (!items.length) { if (onEnd) onEnd(); return; }
  let i = 0;
  function next() {
    if (i >= items.length) {
      if (onEnd) onEnd();
      return;
    }
    const u = makeUtterance(items[i], 0.95);
    i += 1;
    u.onend = next;
    u.onerror = function (ev) {
      if (!ev || ev.error === 'interrupted' || ev.error === 'canceled') { next(); return; }
      toastSpeakFail();
      next();
    };
    speechSynthesis.speak(u);
  }
  next();
}

/** 课文区「朗读全文」：教材原文播整课 MP3，原创精读等仅 TTS 逐句 */
function speakPassageFull(tab, lines, onEnd) {
  stopAllSpeakAudio();
  if (tab === 'orig') {
    const p = state.currentOfficialPassage;
    if (!p || !p.audio) {
      toast('本课无原声 MP3，无法朗读教材原文', 'warn');
      if (onEnd) onEnd();
      return;
    }
    const a = new Audio(p.audio);
    officialLessonAudio = a;
    a.onended = function () { if (onEnd) onEnd(); };
    a.onerror = function () { toastOfficialAudioFail(); if (onEnd) onEnd(); };
    a.play().catch(function () {
      toastOfficialAudioFail();
      if (onEnd) onEnd();
    });
    return;
  }
  speakLines(lines, onEnd);
}

// ---------- 轻提示（toast，替代阻塞式 alert）----------
function toast(msg, type) {
  let box = $('toastBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toastBox';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
  }, 2600);
}

// ---------- 初始化 ----------
async function init() {
  await NCEStore.ready; // 学习状态（最近课/已学/已掌握等）加载完再渲染，避免读到空值
  await loadPronuncIndex(); // 真人发音索引（离线可读 public/audio/）
  await loadOfficialSegments(); // 原声课文句子时间轴（离线可读）
  state.meta = await api('/api/meta').catch(() => ({
    books: [
      { id: 1, title: '第一册' },
      { id: 2, title: '第二册' },
      { id: 3, title: '第三册' },
      { id: 4, title: '第四册' },
    ],
    units: {},
    grammarByBook: {},
    stats: { total: 0, byBook: {}, byType: {}, lessonsByBook: {} },
  }));
  state.transformMeta = await api('/api/transform/meta').catch(() => null);
  renderBookChips();
  renderUnitChips();
  renderGrammarChips();
  updateStatsMini();
  updatePoolHint();

  $('startBtn').onclick = () => startQuiz(false);
  $('wrongBtn').onclick = () => startQuiz(true);
  $('resetBtn').onclick = resetProgress;
  $('submitBtn').onclick = submitQuiz;
  $('backBtn').onclick = () => { clearDraft(); showSetup(); }; // 主动离开答题即放弃草稿
  $('againBtn').onclick = showSetup;
  $('retryWrongBtn').onclick = retryWrong;
  $('typeSelect').onchange = updatePoolHint;
  $('limitSelect').onchange = updatePoolHint;

  setupTabs();
  renderLearnBookChips();
  loadLessons(state.learnBook);
  $('practiceThisBtn').onclick = practiceCurrentLesson;
  const transformThisBtn = $('transformThisBtn');
  if (transformThisBtn) transformThisBtn.onclick = practiceTransformLesson;
  $('tocSearch').oninput = filterToc;
  // 标为已掌握（手动打标，目录显示 ★）
  $('masterBtn').onclick = () => {
    const l = state.currentLesson;
    if (!l) return;
    const on = toggleLessonMastered(l.book, l.lesson);
    updateMasterBtn(l);
    const item = $('lessonToc').querySelector(`.toc-item[data-lesson="${l.lesson}"]`);
    if (item) item.classList.toggle('mastered', on);
    updateTocProgress();
    toast(on ? '★ 已标为掌握' : '已取消掌握标记', 'ok');
  };
  // 学习打卡（手动勾选学了本课，目录显示 📅，计入学习计划打卡）
  $('checkinBtn').onclick = () => {
    const l = state.currentLesson;
    if (!l) return;
    const on = toggleLessonCheckin(l.book, l.lesson);
    updateCheckinBtn(l);
    const item = $('lessonToc').querySelector(`.toc-item[data-lesson="${l.lesson}"]`);
    if (item) item.classList.toggle('checkin', on);
    updateTocProgress();
    toast(on ? '📅 已打卡，本课计入学习计划' : '已取消本课打卡', 'ok');
  };
  // 听写本课：带上课号深链到听写页
  $('dictThisBtn').onclick = () => {
    const l = state.currentLesson;
    if (!l) return;
    NCE.pendingDictation = { book: l.book, lesson: l.lesson };
    gotoTab('dictation');
  };
  // 教材学习页内用键盘 ←/→ 翻上一课/下一课（输入框聚焦时不触发）
  document.addEventListener('keydown', (e) => {
    if ($('lessonsPanel').classList.contains('hidden') || !state.currentLesson) return;
    if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') navLesson(-1);
    else if (e.key === 'ArrowRight') navLesson(1);
  });
  // 逐题模式键盘操作：数字键 1-4 选选项，回车 确认/下一题
  document.addEventListener('keydown', (e) => {
    if ($('quizPanel').classList.contains('hidden') || state.mode !== 'step') return;
    if (e.key === 'Enter') {
      const btn = $('stepConfirmBtn');
      if (btn) { e.preventDefault(); btn.click(); }
    } else if (/^[1-9]$/.test(e.key) && !/^(input|textarea|select)$/i.test(e.target.tagName)) {
      const opts = document.querySelectorAll('#quizList .option');
      const opt = opts[Number(e.key) - 1];
      if (opt && !opt.querySelector('input').disabled) opt.click();
    }
  });
  // 顶栏语速选择
  const rateSel = $('ttsRate');
  if (rateSel) {
    rateSel.value = String(TTS_RATE);
    if (rateSel.value !== String(TTS_RATE)) rateSel.value = '0.9'; // 存的值不在选项里则回退常速
    rateSel.onchange = () => {
      TTS_RATE = Number(rateSel.value) || 0.9;
      try { localStorage.setItem('nce-tts-rate', String(TTS_RATE)); } catch (e) {}
      speak('This is the reading speed.'); // 试听
    };
  }
  renderHome(); // 登录默认停在「今日学习」首页
  // 未完成练习不再在加载时自动弹出（否则会顶掉首页）；改为首次进入「刷题练习」时再恢复
  applyHashTab(); // meta / 学习状态 / 各 feat 标签都已就绪，此时再按 hash 恢复深链才安全
}

// ---------- 标签切换 ----------
function setupTabs() {
  // 只绑定内置的“今日学习/刷题练习/教材学习”标签；功能模块标签由 registerFeature 各自绑定，
  // 不能用 querySelectorAll('.tab') 全量覆盖，否则会把功能标签的点击处理器一并清掉。
  document.querySelectorAll('.tab[data-tab="home"], .tab[data-tab="practice"], .tab[data-tab="learn"]').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.tab === 'learn') showLearn();
      else if (tab.dataset.tab === 'home') showHome();
      else showSetup();
    };
  });
}

// ---------- Hash 路由：地址栏记录当前标签页，刷新/分享链接后不回到首页 ----------
function parseLocationHash() {
  const raw = (location.hash || '').replace(/^#/, '');
  const qi = raw.indexOf('?');
  const id = decodeURIComponent(qi >= 0 ? raw.slice(0, qi) : raw);
  const params = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
  return { id, params };
}

function applyHashTab() {
  const { id, params } = parseLocationHash();
  if (!id) return;
  // 「今日学习」为默认落地页：不因残留的 #practice 把加载后的用户重新带回刷题页
  if (id === 'practice') return;
  if (id === 'dictionary') {
    const q = params.get('q') || '';
    const book = params.get('book') || '';
    if (q || book) {
      window.NCE.pendingDictionary = { q, book, expandDetail: !!q };
    }
    gotoTab('dictionary');
    return;
  }
  if (id === 'learn') {
    const book = params.get('book');
    const lesson = params.get('lesson');
    if (book && lesson) {
      goToLesson(book, lesson);
      return;
    }
    const tab = document.querySelector('.tab[data-tab="learn"]');
    if (tab && !tab.classList.contains('active')) tab.click();
    return;
  }
  const sub = document.querySelector(`.subtab[data-tab="${id}"]`);
  if (sub) {
    const hostPanel = $('feat-' + sub.dataset.host);
    if (!sub.classList.contains('active') || (hostPanel && hostPanel.classList.contains('hidden'))) gotoTab(id);
    return;
  }
  const tab = document.querySelector(`.tab[data-tab="${id}"]`);
  if (tab && !tab.classList.contains('active')) tab.click();
}
// 点击标签时同步 hash（词典等有查询参数的标签保留当前 URL）
document.addEventListener('click', (e) => {
  const el = e.target.closest('.tab, .subtab');
  if (!el || !el.dataset.tab) return;
  if (window.NCE.isDictOverlayOpen && window.NCE.isDictOverlayOpen()) {
    window.NCE.closeDictOverlay({ restoreScroll: false });
  }
  // 切换标签时打断正在进行的朗读，避免听写/对话等页面的自动朗读串到新页面继续读
  stopAllSpeakAudio();
  const tabId = el.dataset.tab;
  if (tabId === 'dictionary' && location.hash.startsWith('#dictionary?')) return;
  if (tabId === 'dictionary' && !location.hash.includes('?')) {
    window.NCE.dictReturnState = null;
    hideDictReturnBar();
  }
  if (tabId === 'learn' && location.hash.startsWith('#learn?')) return;
  if (location.hash !== '#' + tabId) history.replaceState(null, '', '#' + tabId);
});
window.addEventListener('hashchange', applyHashTab);
// 首次按 hash 恢复改到 init() 末尾执行（那时 /api/meta 已 await 就绪）：
// 原先绑在 DOMContentLoaded 上会在 async init 拿到 meta 之前触发，深链刷新到非第 1 册教材会因 state.meta 为 null 崩溃。

// 跳转到任意标签页（含合并标签的子页）
function gotoTab(id) {
  const sub = document.querySelector(`.subtab[data-tab="${id}"]`);
  if (sub) {
    const host = document.querySelector(`.tab[data-tab="${sub.dataset.host}"]`);
    if (host) host.click();
    sub.click();
    return;
  }
  const tab = document.querySelector(`.tab[data-tab="${id}"]`);
  if (tab) tab.click();
}

// 仅切换可见面板，不触发 onShow（用于词典返回，避免打断进行中的练习）
function showTabSilent(id, ret) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  if (id === 'home') {
    document.querySelector('.tab[data-tab="home"]')?.classList.add('active');
    hideAll();
    $('homePanel').classList.remove('hidden');
    return;
  }
  if (id === 'learn') {
    document.querySelector('.tab[data-tab="learn"]')?.classList.add('active');
    hideAll();
    $('lessonsPanel').classList.remove('hidden');
    return;
  }
  if (id === 'practice') {
    document.querySelector('.tab[data-tab="practice"]')?.classList.add('active');
    hideAll();
    const pp = (ret && ret.practicePanel) || 'setup';
    if (pp === 'quiz') $('quizPanel').classList.remove('hidden');
    else $('setupPanel').classList.remove('hidden');
    return;
  }
  const sub = document.querySelector(`.subtab[data-tab="${id}"]`);
  if (sub) {
    const hostId = sub.dataset.host;
    document.querySelector(`.tab[data-tab="${hostId}"]`)?.classList.add('active');
    hideAll();
    const hostPanel = $('feat-' + hostId);
    if (hostPanel) {
      hostPanel.classList.remove('hidden');
      hostPanel.querySelectorAll('.subtabs .subtab').forEach((s) => {
        s.classList.toggle('active', s === sub);
      });
      hostPanel.querySelectorAll('.subpanel').forEach((p) => p.classList.add('hidden'));
    }
    const panel = $('feat-' + id);
    if (panel) panel.classList.remove('hidden');
    if (mergeHost) mergeHost.current = sub;
    return;
  }
  const tab = document.querySelector(`.tab[data-tab="${id}"]`);
  if (tab) {
    tab.classList.add('active');
    hideAll();
    const panel = $('feat-' + id);
    if (panel) panel.classList.remove('hidden');
  }
}

function hideAll() {
  document.querySelectorAll('main.container > .panel').forEach((p) => p.classList.add('hidden'));
}

// ---------- 功能模块注册（供 public/js/feat-*.js 自注册标签页，零冲突扩展）----------
const FEATURES = [];
// 标签分组：id → 组名（学/练/复习/我的）；未列出的默认追加到「我的」组
const TAB_GROUP_OF = {
  dictionary: 'learn',
  dictation: 'practice', exam: 'practice', transform: 'practice', dialogue: 'practice',
  review: 'review', wordhub: 'review',
  stats: 'mine', plan: 'mine', backup: 'mine',
};
function tabGroupBox(id) {
  const g = TAB_GROUP_OF[id] || 'mine';
  return document.querySelector(`.tab-group[data-group="${g}"]`) || document.querySelector('.tabs');
}

// 合并标签：生词本 + 背单词 归入同一个「单词」标签，内部用子页切换
const MERGE = { id: 'wordhub', label: '单词', icon: '🔤', children: { vocab: true, words: true, listenvocab: true, readvocab: true, globalvocab: true, vocabtrend: true } };
let mergeHost = null; // { tab, panel, subnav, body, current }
function ensureMergeHost() {
  if (mergeHost) return mergeHost;
  const container = document.querySelector('main.container');
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.tab = MERGE.id;
  tab.textContent = MERGE.icon + ' ' + MERGE.label;
  tabGroupBox(MERGE.id).appendChild(tab);

  const panel = document.createElement('section');
  panel.className = 'panel hidden';
  panel.id = 'feat-' + MERGE.id;
  const subnav = document.createElement('div');
  subnav.className = 'subtabs';
  const body = document.createElement('div');
  panel.appendChild(subnav);
  panel.appendChild(body);
  container.appendChild(panel);

  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    hideAll();
    panel.classList.remove('hidden');
    window.scrollTo(0, 0);
    const saved = (() => {
      try {
        if (typeof NCEStore !== 'undefined') return NCEStore.get('nce-wordhub-tab');
        return localStorage.getItem('nce-wordhub-tab');
      } catch (e) { return null; }
    })();
    const cur = mergeHost.current ||
      (saved && subnav.querySelector(`.subtab[data-tab="${saved}"]`)) ||
      subnav.querySelector('.subtab');
    if (cur) cur.click();
  };
  mergeHost = { tab, panel, subnav, body, current: null };
  return mergeHost;
}

function registerFeature(opts) {
  // opts: { id, label, icon, onShow(panelEl, feat) }
  // 归入合并标签的功能：不建顶层标签，改建宿主面板内的子页
  if (MERGE.children[opts.id]) {
    const host = ensureMergeHost();
    const sub = document.createElement('div');
    sub.className = 'subtab';
    sub.dataset.tab = opts.id;
    sub.dataset.host = MERGE.id;
    sub.textContent = (opts.icon ? opts.icon + ' ' : '') + opts.label;
    host.subnav.appendChild(sub);

    const panel = document.createElement('section');
    panel.className = 'subpanel hidden';
    panel.id = 'feat-' + opts.id;
    host.body.appendChild(panel);

    const feat = { id: opts.id, tab: sub, panel, onShow: opts.onShow };
    FEATURES.push(feat);
    sub.onclick = () => {
      host.subnav.querySelectorAll('.subtab').forEach((s) => s.classList.toggle('active', s === sub));
      host.body.querySelectorAll(':scope > .subpanel').forEach((p) => p.classList.add('hidden'));
      panel.classList.remove('hidden');
      host.current = sub;
      try {
        if (typeof NCEStore !== 'undefined') NCEStore.set('nce-wordhub-tab', opts.id);
        else localStorage.setItem('nce-wordhub-tab', opts.id);
      } catch (e) { /* ignore */ }
      try { opts.onShow && opts.onShow(panel, feat); } catch (e) { console.error('[feature]', opts.id, e); }
    };
    return feat;
  }

  const container = document.querySelector('main.container');
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.tab = opts.id;
  tab.textContent = (opts.icon ? opts.icon + ' ' : '') + opts.label;
  tabGroupBox(opts.id).appendChild(tab);

  const panel = document.createElement('section');
  panel.className = 'panel hidden';
  panel.id = 'feat-' + opts.id;
  container.appendChild(panel);

  const feat = { id: opts.id, tab, panel, onShow: opts.onShow };
  FEATURES.push(feat);
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    hideAll();
    panel.classList.remove('hidden');
    window.scrollTo(0, 0);
    try { opts.onShow && opts.onShow(panel, feat); } catch (e) { console.error('[feature]', opts.id, e); }
  };
  return feat;
}

function normWordKey(w) {
  return String(w == null ? '' : w).trim().toLowerCase();
}

function goToVocab(opts) {
  window.NCE.pendingVocab = opts || {};
  gotoTab('vocab');
}

function captureDictReturn() {
  if (window.NCE.isDictionaryPageActive && window.NCE.isDictionaryPageActive()) return;
  let hash = location.hash || '#home';
  const tabId = hash.replace(/^#/, '').split('?')[0];
  if ((tabId === 'learn' || hash.startsWith('#learn')) && state.currentLesson) {
    const l = state.currentLesson;
    hash = `#learn?book=${l.book}&lesson=${l.lesson}`;
  }
  let practicePanel = '';
  if (!$('quizPanel').classList.contains('hidden')) practicePanel = 'quiz';
  else if (!$('setupPanel').classList.contains('hidden')) practicePanel = 'setup';
  const id = hash.replace(/^#/, '').split('?')[0];
  window.NCE.dictReturnState = {
    scrollY: window.scrollY,
    hash,
    practicePanel,
    label: dictReturnLabel(id, hash),
  };
}

const DICT_RETURN_LABELS = {
  home: '🏠 返回今日学习',
  learn: '📖 返回教材学习',
  practice: '✏️ 返回刷题练习',
  transform: '🔀 返回句型转换',
  dictation: '🎧 返回听写',
  dialogue: '💬 返回情景对话',
  review: '🔁 返回间隔复习',
  vocab: '📚 返回词表',
  words: '🔤 返回背单词',
  listenvocab: '👂 返回听力测试',
  readvocab: '📖 返回阅读测试',
  globalvocab: '🌐 返回总词汇测试',
  vocabtrend: '📈 返回词汇趋势',
  exam: '📝 返回阶段测验',
  stats: '📊 返回薄弱分析',
  plan: '📅 返回学习计划',
  wordhub: '🔤 返回单词',
  comprehension: '📖 返回阅读理解',
  level: '📊 返回水平评估',
};

function dictReturnLabel(tabId, hash) {
  if (tabId === 'learn' && hash && hash.includes('lesson=')) {
    const params = new URLSearchParams(hash.split('?')[1] || '');
    const lesson = params.get('lesson');
    const book = params.get('book');
    if (book && lesson) return `📖 返回第${book}册 · Lesson ${lesson}`;
  }
  return DICT_RETURN_LABELS[tabId] || '← 返回继续';
}

function ensureDictReturnBar() {
  let bar = document.getElementById('dictReturnBar');
  if (bar) return bar;
  if (!document.getElementById('dict-return-style')) {
    const st = document.createElement('style');
    st.id = 'dict-return-style';
    st.textContent =
      '.dict-return-fixed{position:fixed;top:0;left:0;right:0;z-index:8500;display:none;' +
      'padding:10px 16px;background:linear-gradient(135deg,#eff6ff,#f0fdf4);' +
      'border-bottom:1px solid #bfdbfe;box-shadow:0 2px 10px rgba(15,23,42,.08)}' +
      '.dict-return-fixed.show{display:flex;align-items:center;justify-content:center}' +
      '.dict-return-fixed button{padding:9px 22px;border:none;border-radius:10px;' +
      'background:var(--brand,#2f6fed);color:#fff;font-size:15px;font-weight:700;cursor:pointer}' +
      '.dict-return-fixed button:hover{opacity:.92}' +
      'body.dict-return-active{padding-top:48px}' +
      'body.dict-return-active .dict-return-fixed{top:0}';
    document.head.appendChild(st);
  }
  bar = document.createElement('div');
  bar.id = 'dictReturnBar';
  bar.className = 'dict-return-fixed';
  document.body.prepend(bar);
  return bar;
}

function showDictReturnBar() {
  if (window.NCE.isDictOverlayOpen && window.NCE.isDictOverlayOpen()) {
    hideDictReturnBar();
    return;
  }
  const ret = window.NCE.dictReturnState;
  if (!ret) {
    hideDictReturnBar();
    return;
  }
  const dictPanel = document.getElementById('feat-dictionary');
  if (!dictPanel || dictPanel.classList.contains('hidden')) {
    hideDictReturnBar();
    return;
  }
  const bar = ensureDictReturnBar();
  bar.innerHTML = `<button type="button" id="dictReturnBtn">${escapeHtml(ret.label || '← 返回继续')}</button>`;
  bar.classList.add('show');
  document.body.classList.add('dict-return-active');
  bar.querySelector('#dictReturnBtn').onclick = () => restoreDictReturn();
}

function hideDictReturnBar() {
  const bar = document.getElementById('dictReturnBar');
  if (bar) bar.classList.remove('show');
  document.body.classList.remove('dict-return-active');
}

function restoreDictReturn() {
  const ret = window.NCE.dictReturnState;
  window.NCE.dictReturnState = null;
  hideDictReturnBar();
  if (window.NCE.closeDictOverlay) window.NCE.closeDictOverlay({ restoreScroll: false });
  if (!ret) return;
  if (ret.hash && location.hash !== ret.hash) history.replaceState(null, '', ret.hash);
  const tabId = (ret.hash || '').replace(/^#/, '').split('?')[0];
  if (tabId && tabId !== 'dictionary') {
    if (tabId === 'learn' && ret.hash.includes('book=')) {
      showTabSilent('learn', ret);
      const params = new URLSearchParams((ret.hash.split('?')[1]) || '');
      const book = params.get('book');
      const lesson = params.get('lesson');
      const cur = state.currentLesson;
      if (book && lesson && (!cur || String(cur.book) !== String(book) || String(cur.lesson) !== String(lesson))) {
        goToLesson(book, lesson);
      }
    } else {
      showTabSilent(tabId, ret);
    }
  }
  if (typeof ret.scrollY === 'number') {
    setTimeout(() => window.scrollTo(0, ret.scrollY), 80);
  }
}

function goToDictionary(q, book, opts) {
  opts = opts || {};
  const params = new URLSearchParams();
  const qs = String(q == null ? '' : q).trim();
  if (qs) params.set('q', qs);
  if (book != null && book !== '') params.set('book', String(book));
  const tail = params.toString();
  const onDictPage = window.NCE.isDictionaryPageActive && window.NCE.isDictionaryPageActive();
  if (!opts.forcePage && !opts.reviewQueue && !onDictPage) {
    captureDictReturn();
    if (typeof window.NCE.openDictOverlay === 'function') {
      window.NCE.openDictOverlay(q, book);
      return;
    }
  }
  if (!onDictPage) captureDictReturn();
  window.NCE.pendingDictionary = {
    q: qs,
    book: book != null && book !== '' ? String(book) : '',
    expandDetail: !!qs,
    reviewQueue: !!opts.reviewQueue,
  };
  history.replaceState(null, '', '#dictionary' + (tail ? '?' + tail : ''));
  gotoTab('dictionary');
  showDictReturnBar();
}

// 暴露给 feature 模块的公共 API
window.NCE = {
  api,
  speak,
  speakSequence,
  setSpeakContext: function (ctx) { state.speakContext = ctx || null; },
  hasOfficialSegment: function (text) { return !!lookupOfficialSegment(text); },
  hasHumanPronunc: function (text) { return !!lookupHumanPronunc(enOnly(firstAnswer(text) || text)); },
  enOnly,
  asAnswerList,
  firstAnswer,
  formatAnswersWithSpeak,
  speakBtnHtml,
  bindSpeakClicks,
  registerFeature,
  gotoTab,
  goToLesson,
  goToTransform,
  practiceGrammar,
  practiceWeakTransform,
  practiceWeakRecommend,
  goToDictionary,
  goToVocab,
  restoreDictReturn,
  showDictReturnBar,
  hideDictReturnBar,
  captureDictReturn,
  normWordKey,
  toast,
  speechRecNeedsNetwork: function () { return true; },
  isOnline: function () { return navigator.onLine; },
  bindPassageLookup,
  bindPassageWords,
  wrapPassageWords,
  extractLookupWords,
  appendDictChips,
  escapeHtml: (s) => escapeHtml(s),
  escapeAttr: (s) => escapeAttr(s),
};

function showLearn() {
  hideAll();
  $('lessonsPanel').classList.remove('hidden');
  window.scrollTo(0, 0);
}

// ---------- 今日学习（首页）----------
function showHome() {
  hideAll();
  $('homePanel').classList.remove('hidden');
  window.scrollTo(0, 0);
  renderHome();
}

function loadLastLesson() {
  return NCEStore.get('nce-last-lesson') || null;
}

async function renderHome() {
  const box = $('homeContent');
  const last = loadLastLesson();
  const vocabBook = last ? String(last.book) : '1';
  // 每项独立兜底：任一接口失败只影响对应卡片的数据，不拖垮整个首页
  const [prog, plan, srs, gram, wordsStats, vocabOv, vocabStars, training, recommend] = await Promise.all([
    api('/api/progress').catch(() => ({ totalAttempts: 0, accuracy: 0, wrongCount: 0 })),
    api('/api/plan/overview').catch(() => ({ goal: 10, todayCount: 0, streak: 0, totalDays: 0 })),
    api('/api/srs/stats').catch(() => ({ due: 0, upcoming: 0, total: 0 })),
    api('/api/stats/grammar').catch(() => ({ grammar: [] })),
    api(`/api/words/stats?book=${encodeURIComponent(vocabBook)}`).catch(() => null),
    api(`/api/vocab-test/overview?book=${encodeURIComponent(vocabBook)}`).catch(() => null),
    api('/api/vocab/stars').catch(() => ({ words: [] })),
    api('/api/stats/training').catch(() => null),
    api(`/api/stats/recommend?book=${encodeURIComponent(vocabBook)}&limit=3`).catch(() => ({ recommendations: [] })),
  ]);

  // 薄弱语法点：练够 4 次且正确率 < 85% 才算（接口已按正确率升序，最弱在前）
  const weak = (gram.grammar || []).filter((g) => g.seen >= 4 && g.accuracy < 85);
  const rec1 = (recommend.recommendations || [])[0] || null;
  const w1 = rec1 || weak[0] || null;
  // 「学习中」(level 1-2) 的单词是默写待巩固池（按当前/最近学习册统计）
  const wordsDue = wordsStats ? wordsStats.learning || 0 : 0;
  const wordsDueHint = wordsDue
    ? `<br>第 <b>${vocabBook}</b> 册有 <b>${wordsDue}</b> 个学习中的单词待默写巩固`
    : '';

  let dictQueueLeft = 0;
  try {
    const q = JSON.parse(sessionStorage.getItem('nce-dict-queue') || 'null');
    if (q && q.words && q.words.length) {
      dictQueueLeft = Math.max(0, q.words.length - (Number(q.idx) || 0));
    }
  } catch (e) { /* ignore */ }
  const dictQueueHint = dictQueueLeft
    ? `<br>📕 错词复习进行中，还剩 <b>${dictQueueLeft}</b> 个`
    : '';

  const starCount = (vocabStars && vocabStars.words) ? vocabStars.words.length : 0;

  const listenLatest = vocabOv && vocabOv.listen && vocabOv.listen.latest;
  const readLatest = vocabOv && vocabOv.read && vocabOv.read.latest;
  const globalLatest = vocabOv && vocabOv.global && vocabOv.global.latest;
  const vocabLine = (icon, label, t, avg, key) =>
    t
      ? `${icon} ${label}：<b>≈ ${t.estimate}</b> / ${t.dictTotal} 词` +
        (avg != null && vocabOv[key].avgN >= 2
          ? `（近 ${vocabOv[key].avgN} 次均 ≈ ${avg}）`
          : '')
      : `${icon} ${label}：${key === 'global' ? '尚未测试' : `第${vocabBook}册尚未测试`}`;
  let vocabGap = '';
  if (vocabOv && vocabOv.gap != null && vocabOv.gap !== 0) {
    vocabGap =
      vocabOv.gap > 0
        ? `<br>阅读比听力高约 <b>${vocabOv.gap}</b> 词，可多练听力缩小差距。`
        : `<br>听力比阅读高约 <b>${-vocabOv.gap}</b> 词，可多练阅读识字。`;
  } else if (vocabOv && vocabOv.gap === 0 && listenLatest && readLatest) {
    vocabGap = '<br>听读估算一致，保持双线练习即可。';
  }
  const globalLine = globalLatest
    ? `<br>${vocabLine('🌐', '总词汇', globalLatest, vocabOv.global.avg, 'global')}`
    : '<br>🌐 总词汇：尚未测试（基于内置词库估算整体水平）';
  const vocabSub =
    listenLatest || readLatest
      ? `${vocabLine('👂', '听力', listenLatest, vocabOv.listen.avg, 'listen')}<br>${vocabLine('📖', '阅读', readLatest, vocabOv.read.avg, 'read')}${vocabGap}${globalLine}`
      : `第 ${vocabBook} 册词表基线尚未建立，各测一次可对比听读差距。${globalLine}`;

  const goalPct = Math.min(100, plan.goal ? Math.round((plan.todayCount / plan.goal) * 100) : 0);
  const goalDone = plan.todayCount >= plan.goal;
  const todayLines = (plan.todayLines || [])
    .filter((x) => x.count > 0)
    .map((x) => `${x.label} ${x.count}`)
    .join(' · ');
  const todayDetail = todayLines
    ? `<br><span style="font-size:13px;color:#64748b">今日已练：${escapeHtml(todayLines)}</span>`
    : '';
  const tfWeak = training && training.transform && training.transform.weakestKind;
  const dlgWeak = training && training.dialogue && training.dialogue.weak && training.dialogue.weak[0];
  const trainingHint = tfWeak
    ? `<br>🔀 句型「${escapeHtml(tfWeak.label)}」正确率 ${tfWeak.accuracy}%（${tfWeak.seen} 步），建议去句型转换专练。`
    : dlgWeak
      ? `<br>💬 对话「${escapeHtml(dlgWeak.title)}」正确率 ${dlgWeak.accuracy}%，可多练情景对话。`
      : '';
  const weakSubDetail = (g) => {
    const parts = [`正确率 <b class="acc ${accClass(g.accuracy)}">${g.accuracy}%</b>（已练 ${g.seen} 次）`];
    if (g.quiz && g.quiz.seen >= 3) parts.push(`刷题 ${g.quiz.accuracy}%`);
    if (g.transform && g.transform.seen >= 3) parts.push(`句型 ${g.transform.accuracy}%`);
    return parts.join(' · ');
  };
  const weakBookHint = rec1 && rec1.book ? ` · 推荐第 ${rec1.book} 册` : '';
  const weakReason = rec1 && rec1.reason ? `<br><span style="font-size:12px;color:#64748b">💡 ${escapeHtml(rec1.reason)}${weakBookHint}</span>` : weakBookHint ? `<br><span style="font-size:12px;color:#64748b">💡 推荐第 ${rec1.book} 册</span>` : '';
  const weakQuizBtnHtml = rec1 && rec1.quizAvailable
    ? `<button class="btn ${rec1.primary === 'quiz' ? 'primary' : ''}" id="homeWeakQuizBtn">刷题 10 题 →</button>`
    : '';
  const weakTfBtnHtml = rec1 && rec1.transformAvailable
    ? `<button class="btn ${rec1.primary === 'transform' ? 'primary' : ''}" id="homeWeakTfBtn">句型 5 句 →</button>`
    : '';
  const weakLegacyBtn = !rec1 && w1
    ? `<button class="btn primary" id="homeWeakBtn">专练 10 题 →</button>`
    : '';
  let showGuide = false;
  try { showGuide = !localStorage.getItem('nce-guide-dismissed'); } catch (e) { /* ignore */ }
  box.innerHTML =
    '<div class="home-grid">' +
    (showGuide
      ? `<div class="home-guide">
          <div class="hg-body">
            <div class="hg-title">👋 欢迎使用新概念英语练习系统</div>
            <p class="hg-line"><b>学</b>　教材、原声课文、词典　·　<b>练</b>　刷题、听写、句型、情景对话</p>
            <p class="hg-line"><b>复习</b>　错题间隔复习、单词背诵　·　<b>我的</b>　统计、计划、备份</p>
            <p class="hg-tip">推荐路径：今日学习 → 教材学习 → 刷题练习 → 间隔复习 · <a href="/help.html" class="hg-help-link">📖 完整使用说明</a></p>
          </div>
          <button type="button" class="btn primary small" id="homeGuideDismiss">知道了</button>
        </div>`
      : '') +
    // 今日目标
    `<div class="home-card">
      <div class="hc-title">🎯 今日目标</div>
      <div class="hc-big">${plan.todayCount} <span class="hc-unit">/ ${plan.goal} 题</span></div>
      <div class="hc-bar"><i style="width:${goalPct}%"></i></div>
      <div class="hc-sub">${goalDone ? '今日目标已完成，真棒！' : `还差 ${plan.goal - plan.todayCount} 次完成今日目标`} · 连续打卡 <b>${plan.streak}</b> 天${todayDetail}</div>
      <div class="hc-sub" style="margin-top:6px;font-size:12px;color:#94a3b8">统计刷题、句型转换、背单词、词汇测、听写、对话等练习</div>
      <button class="btn primary" data-goto="practice">开始练习 →</button>
    </div>` +
    // 今日复习（到期错题 + 待巩固单词）
    `<div class="home-card">
      <div class="hc-title">🔁 今日复习</div>
      <div class="hc-big">${srs.due} <span class="hc-unit">题错题到期</span></div>
      <div class="hc-sub">${
        srs.due
          ? '按遗忘曲线到期了，趁热复习效果最好'
          : srs.upcoming
            ? `暂无到期错题，未来 7 天将有 ${srs.upcoming} 题到期`
            : '错题复习队列是空的，先去刷题积累吧'
      }${wordsDueHint}${dictQueueHint}</div>
      <div class="hc-btns">
        <button class="btn ${srs.due ? 'primary' : ''}" data-goto="review">复习错题 →</button>
        ${wordsDue ? '<button class="btn" id="homeSpellBtn">默写单词 →</button>' : ''}
        ${dictQueueLeft ? '<button class="btn primary" id="homeDictQueueBtn">继续错词复习 →</button>' : ''}
      </div>
    </div>` +
    // 薄弱专练（来自语法正确率统计）
    `<div class="home-card">
      <div class="hc-title">📌 薄弱专练</div>
      ${
        w1
          ? `<div class="hc-big hc-small">${escapeHtml(w1.tag)}</div>
             <div class="hc-sub">${weakSubDetail(w1)}，是你目前最薄弱的语法点${
               weak[1] ? `；其次是「${escapeHtml(weak[1].tag)}」（${weak[1].accuracy}%）` : ''
             }${weakReason}</div>
             <div class="hc-btns">${weakQuizBtnHtml}${weakTfBtnHtml}${weakLegacyBtn}</div>${trainingHint ? `<div class="hc-sub" style="margin-top:8px">${trainingHint}</div>` : ''}`
          : (gram.grammar || []).length
            ? `<div class="hc-sub">已练过的语法点正确率都在 85% 以上，继续保持！想看全貌可去薄弱分析。</div>
               <button class="btn" data-goto="stats">看薄弱分析 →</button>${trainingHint ? `<div class="hc-sub" style="margin-top:8px">${trainingHint}</div>` : ''}`
            : `<div class="hc-sub">练习数据还不够，先刷几组题，这里会告诉你最该补的语法点。</div>
               <button class="btn" data-goto="practice">去刷题 →</button>${trainingHint ? `<div class="hc-sub" style="margin-top:8px">${trainingHint}</div>` : ''}`
      }
    </div>` +
    // 词汇量基线（听 / 读抽样估算）
    `<div class="home-card">
      <div class="hc-title">📚 词汇量基线</div>
      <div class="hc-big hc-small">第 ${vocabBook} 册</div>
      <div class="hc-sub">${vocabSub}</div>
      <div class="hc-btns">
        <button class="btn" id="homeListenVocab">👂 测听力 →</button>
        <button class="btn" id="homeReadVocab">📖 测阅读 →</button>
        <button class="btn" data-goto="globalvocab">🌐 测总词汇 →</button>
        <button class="btn" id="homeVocabTrend">📈 看趋势 →</button>
      </div>
    </div>` +
    // 继续学习
    `<div class="home-card">
      <div class="hc-title">📖 继续学习</div>
      ${
        last
          ? `<div class="hc-big hc-small">第${last.book}册 · Lesson ${last.lesson}</div>
             <div class="hc-sub">${escapeHtml(last.title || '')}　${escapeHtml(last.titleCn || '')}</div>`
          : '<div class="hc-sub">还没开始学教材，从第一课开始吧</div>'
      }
      <button class="btn primary" id="homeContinueBtn">${last ? '继续学这课 →' : '去教材学习 →'}</button>
    </div>` +
    // 教材词典快捷查词
    `<div class="home-card home-dict-card">
      <div class="hc-title">📕 教材词典</div>
      <div class="home-dict-row">
        <input type="text" id="homeDictQ" placeholder="查单词或中文释义…" autocomplete="off">
        <button class="btn primary" id="homeDictBtn" type="button">查询</button>
      </div>
      <div class="hc-sub">在新概念教材词库中检索，支持英文、中文与例句${starCount ? ` · 已收藏 <b>${starCount}</b> 个生词` : ''}</div>
      ${starCount ? '<button class="btn" id="homeStarredBtn">⭐ 复习收藏生词 →</button>' : ''}
    </div>` +
    // 累计概况 + 快捷入口
    `<div class="home-card">
      <div class="hc-title">📈 累计学习</div>
      <div class="hc-big hc-small">${prog.totalAttempts} 题 · 正确率 ${prog.accuracy}%</div>
      <div class="hc-sub">错题本 ${prog.wrongCount} 题 · 累计学习 ${plan.totalDays} 天</div>
      <div class="hc-links">
        <a data-goto="dialogue">💬 情景对话</a>
        <a data-goto="dictionary">📕 查词典</a>
        <a data-goto="dictation">🎧 听写</a>
        <a data-goto="words">🔤 背单词</a>
        <a data-goto="listenvocab">👂 听力词汇量</a>
        <a data-goto="readvocab">📖 阅读词汇量</a>
        <a data-goto="globalvocab">🌐 总词汇量</a>
        <a data-goto="review">🔁 间隔复习</a>
        <a data-goto="vocabtrend">📈 词汇趋势</a>
        <a data-goto="transform">🔀 句型转换</a>
        <a data-goto="exam">📝 阶段测验</a>
        <a data-goto="stats">📊 薄弱分析</a>
        <a href="/help.html" class="hc-help-link">📖 使用说明</a>
      </div>
    </div>` +
    // 使用说明
    `<div class="home-card home-help-card">
      <div class="hc-title">📖 使用说明</div>
      <div class="hc-sub">功能地图、原声/情景对话、学习路径、Git LFS 克隆、FAQ</div>
      <button class="btn" type="button" id="homeHelpBtn">打开使用说明 →</button>
    </div>` +
    '</div>';

  box.querySelectorAll('[data-goto]').forEach((el) => {
    el.onclick = () => gotoTab(el.dataset.goto);
  });
  const helpBtn = $('homeHelpBtn');
  if (helpBtn) helpBtn.onclick = () => { window.location.href = '/help.html'; };
  const guideDismiss = $('homeGuideDismiss');
  if (guideDismiss) {
    guideDismiss.onclick = () => {
      try { localStorage.setItem('nce-guide-dismissed', '1'); } catch (e) { /* ignore */ }
      const g = box.querySelector('.home-guide');
      if (g) g.remove();
    };
  }
  // 薄弱专练：按推荐或最弱语法点组题 / 句型转换
  const weakBtn = $('homeWeakBtn');
  if (weakBtn && w1) weakBtn.onclick = () => practiceGrammar(w1.tag, rec1 && rec1.book);
  const weakQuizBtn = $('homeWeakQuizBtn');
  if (weakQuizBtn && rec1) weakQuizBtn.onclick = () => practiceGrammar(rec1.tag, rec1.book);
  const weakTfBtn = $('homeWeakTfBtn');
  if (weakTfBtn && rec1) weakTfBtn.onclick = () => practiceWeakTransform(rec1.tag, rec1.book);
  // 默写单词：深链到「背单词」的默写模式
  const spellBtn = $('homeSpellBtn');
  if (spellBtn) {
    spellBtn.onclick = () => {
      NCE.pendingWords = { mode: 'spell' };
      gotoTab('words');
    };
  }
  const listenVocabBtn = $('homeListenVocab');
  if (listenVocabBtn && NCE.vocabTestUi) {
    listenVocabBtn.onclick = () => NCE.vocabTestUi.goToVocabTest('listenvocab', vocabBook);
  }
  const readVocabBtn = $('homeReadVocab');
  if (readVocabBtn && NCE.vocabTestUi) {
    readVocabBtn.onclick = () => NCE.vocabTestUi.goToVocabTest('readvocab', vocabBook);
  }
  const vocabTrendBtn = $('homeVocabTrend');
  if (vocabTrendBtn && NCE.vocabTestUi) {
    vocabTrendBtn.onclick = () => NCE.vocabTestUi.goToVocabTrend(vocabBook);
  }
  const homeDictQ = $('homeDictQ');
  const homeDictBtn = $('homeDictBtn');
  if (homeDictQ && homeDictBtn) {
    const runHomeDict = () => goToDictionary(homeDictQ.value, last ? last.book : '', { forcePage: true });
    homeDictBtn.onclick = runHomeDict;
    homeDictQ.onkeydown = (e) => { if (e.key === 'Enter') runHomeDict(); };
  }
  const dictQueueBtn = $('homeDictQueueBtn');
  if (dictQueueBtn) {
    dictQueueBtn.onclick = () => goToDictionary('', '', { forcePage: true, reviewQueue: true });
  }
  const starredBtn = $('homeStarredBtn');
  if (starredBtn && starCount && NCE.vocabTestUi) {
    starredBtn.onclick = () => {
      NCE.vocabTestUi.startMissedReview(vocabStars.words, vocabBook);
    };
  }
  const cont = $('homeContinueBtn');
  if (cont) {
    cont.onclick = async () => {
      gotoTab('learn');
      if (last) {
        if (state.learnBook !== last.book) {
          state.learnBook = last.book;
          renderLearnBookChips();
          await loadLessons(last.book);
        }
        openLesson(last.book, last.lesson);
      }
    };
  }
}

// ---------- 课程学习 ----------
// 左侧册数切换：选哪册，目录就只显示哪册
function renderLearnBookChips() {
  const box = $('learnBookChips');
  box.innerHTML = '';
  state.meta.books.forEach((b) => {
    const el = mkChip(`新概念${b.id}`, b.id === state.learnBook, () => {
      if (state.learnBook === b.id) return;
      state.learnBook = b.id;
      renderLearnBookChips();
      loadLessons(b.id);
    });
    const ln = (state.meta.stats && state.meta.stats.lessonsByBook && state.meta.stats.lessonsByBook[b.id]) || 0;
    const cnt = document.createElement('span');
    cnt.className = 'chip-count';
    cnt.textContent = ln ? `${ln}课` : '未收录';
    el.appendChild(cnt);
    el.title = (b.name || '') + (ln ? `（已收录 ${ln} 课）` : '（课程内容暂未收录）');
    box.appendChild(el);
  });
}

// 已学课程记录（NCEStore，按档案隔离、服务器同步），用于目录里的 ✓ 标记
function loadViewedLessons() {
  return new Set(NCEStore.get('nce-viewed-lessons') || []);
}
function markLessonViewed(book, lesson) {
  const s = loadViewedLessons();
  s.add(`${book}-${lesson}`);
  NCEStore.set('nce-viewed-lessons', [...s]);
}

// 已掌握课程（手动打标，NCEStore），目录里显示 ★
function loadMasteredLessons() {
  return new Set(NCEStore.get('nce-mastered-lessons') || []);
}
function toggleLessonMastered(book, lesson) {
  const key = `${book}-${lesson}`;
  const s = loadMasteredLessons();
  const on = !s.has(key);
  if (on) s.add(key); else s.delete(key);
  NCEStore.set('nce-mastered-lessons', [...s]);
  return on;
}

// 学习打卡（手动勾选"今天学了这一课"，NCEStore 存 { "book-lesson": "YYYY-MM-DD" }）。
// 打卡会顺带上报一条学习活动，计入学习计划的连续打卡 / 热力图，反馈学习进度。
function loadCheckinLessons() {
  const v = NCEStore.get('nce-checkin-lessons');
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toggleLessonCheckin(book, lesson) {
  const map = loadCheckinLessons();
  const key = `${book}-${lesson}`;
  const on = !map[key];
  if (on) {
    map[key] = todayStr();
    // 打卡计入学习计划（连续打卡 / 热力图）；失败不阻断本地打卡
    api('/api/activity/log', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'lesson', correct: true }),
    }).catch(() => {});
  } else {
    delete map[key];
  }
  NCEStore.set('nce-checkin-lessons', map);
  return on;
}
// 「打卡本课」按钮文案/样式跟随当前课的打卡状态
function updateCheckinBtn(l) {
  const btn = $('checkinBtn');
  if (!btn || !l) return;
  const date = loadCheckinLessons()[`${l.book}-${l.lesson}`];
  btn.textContent = date ? `✅ 已打卡 ${date.slice(5)}` : '📅 打卡本课';
  btn.classList.toggle('checkin-on', !!date);
}

// 正确率配色档位：≥80 绿 / 60–79 黄 / <60 红
function accClass(a) { return a >= 80 ? 'good' : a >= 60 ? 'mid' : 'low'; }

// 取某课的练习统计。新概念1奇数课是课文、偶数课是配套练习，题目可能挂在任一课号上，
// 因此第一册把 n 与 n+1 的统计合并归到课文课 n。
function lessonStatFor(book, lesson) {
  const a = state.lessonStats[`${book}-${lesson}`];
  const b = Number(book) === 1 ? state.lessonStats[`${book}-${Number(lesson) + 1}`] : null;
  if (!a && !b) return null;
  const seen = (a ? a.seen : 0) + (b ? b.seen : 0);
  const correct = (a ? a.correct : 0) + (b ? b.correct : 0);
  return { seen, correct, accuracy: seen ? Math.round((correct / seen) * 100) : 0 };
}

// 目录页头部的学习进度条：已学 n / N 课 · 已掌握 m
function updateTocProgress() {
  const box = $('tocProgress');
  const list = state.learnLessons || [];
  if (!box) return;
  if (!list.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const viewed = loadViewedLessons();
  const mastered = loadMasteredLessons();
  const checkin = loadCheckinLessons();
  const v = list.filter((l) => viewed.has(`${l.book}-${l.lesson}`)).length;
  const m = list.filter((l) => mastered.has(`${l.book}-${l.lesson}`)).length;
  const c = list.filter((l) => checkin[`${l.book}-${l.lesson}`]).length;
  // 进度条按「已打卡」占比走（打卡是主动的学习进度反馈；未打卡时回退用已学）
  box.querySelector('.tp-bar i').style.width = `${Math.round(((c || v) / list.length) * 100)}%`;
  box.querySelector('.tp-text').textContent =
    `已打卡 ${c} / ${list.length} 课 📅` + (m ? ` · 已掌握 ${m} 课 ★` : '') + (v ? ` · 已学 ${v}` : '');
}

// 目录搜索：按课号 / 英文标题 / 中文标题过滤
function filterToc() {
  const q = ($('tocSearch').value || '').trim().toLowerCase();
  $('lessonToc').querySelectorAll('.toc-item').forEach((el) => {
    el.classList.toggle('hidden', !!q && !(el.dataset.key || '').includes(q));
  });
}

// 加载指定册的课程目录到左侧边栏（同时拉每课练习正确率，做目录角标）
async function loadLessons(book) {
  const [data, statsRes] = await Promise.all([
    api('/api/lessons?book=' + book).catch(() => ({ lessons: [] })),
    api('/api/stats/lesson').catch(() => ({ lessons: [] })),
  ]);
  state.lessonStats = {};
  (statsRes.lessons || []).forEach((s) => { state.lessonStats[`${s.book}-${s.lesson}`] = s; });

  const box = $('lessonToc');
  box.innerHTML = '';
  state.learnLessons = data.lessons; // 供上一课/下一课翻页使用
  // 切换册数时清空右侧详情，回到占位提示；清空搜索
  state.currentLesson = null;
  $('tocSearch').value = '';
  $('lessonDetailWrap').classList.add('hidden');
  $('learnPlaceholder').classList.remove('hidden');
  updateTocProgress();

  if (!data.lessons.length) {
    box.innerHTML = '<p class="hint">该册课程内容暂未收录，敬请期待。</p>';
    return;
  }
  const viewed = loadViewedLessons();
  const mastered = loadMasteredLessons();
  const checkin = loadCheckinLessons();
  data.lessons.forEach((l) => {
    const key = `${l.book}-${l.lesson}`;
    const item = document.createElement('div');
    item.className = 'toc-item' +
      (viewed.has(key) ? ' viewed' : '') +
      (mastered.has(key) ? ' mastered' : '') +
      (checkin[key] ? ' checkin' : '');
    item.dataset.lesson = l.lesson;
    item.dataset.key = `${l.lesson} lesson ${l.lesson} ${l.title} ${l.titleCn || ''}`.toLowerCase();
    // 该课练习正确率角标（练过才显示）
    const st = lessonStatFor(l.book, l.lesson);
    const acc = st && st.seen ? `<span class="acc ${accClass(st.accuracy)}" title="本课练习正确率（${st.seen} 次作答）">${st.accuracy}%</span>` : '';
    // 书籍目录样式：标题 + 点线引导 + 课号（页码位）
    item.innerHTML =
      `<div class="row"><span class="t">${escapeHtml(l.title)}</span><span class="dots"></span><span class="no">${l.lesson}</span></div>` +
      `<div class="cn"><span>${escapeHtml(l.titleCn || '')}</span>${acc}</div>`;
    item.onclick = () => openLesson(l.book, l.lesson);
    box.appendChild(item);
  });

  // 书签行为：目录就绪后自动翻到上次学习的课
  const last = loadLastLesson();
  if (last && last.book === book && data.lessons.some((x) => x.lesson === last.lesson)) {
    openLesson(book, last.lesson);
  }
}

// 「已掌握」按钮的文案/样式跟随当前课的打标状态
function updateMasterBtn(l) {
  const btn = $('masterBtn');
  if (!btn || !l) return;
  const on = loadMasteredLessons().has(`${l.book}-${l.lesson}`);
  btn.textContent = on ? '★ 已掌握' : '☆ 标为已掌握';
  btn.classList.toggle('mastered-on', on);
}

// 上一课 / 下一课（delta = -1 / +1）
function navLesson(delta) {
  const cur = state.currentLesson;
  const list = state.learnLessons || [];
  if (!cur) return;
  const i = list.findIndex((x) => x.lesson === cur.lesson);
  const next = list[i + delta];
  if (next) openLesson(next.book, next.lesson);
}

// ---------- 课文区（原文 B + 原创精读 A）----------
// 从英文文本提取可查词的 token（去重、保留原大小写）
function extractLookupWords(text) {
  const raw = String(text || '');
  const seen = new Set();
  const out = [];
  const re = /[a-zA-Z]+(?:'[a-zA-Z]+)?/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const w = m[0];
    const k = w.toLowerCase();
    if (w.length < 3 || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

function appendDictChips(container, words, book) {
  if (!container || !words.length) return;
  const row = document.createElement('div');
  row.className = 'lookup-chips';
  words.forEach((w) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lookup-chip';
    btn.textContent = `📕 ${w}`;
    btn.onclick = () => goToDictionary(w, book);
    row.appendChild(btn);
  });
  container.appendChild(row);
}

// 课文英文按词包裹，支持点击查词典
function wrapPassageWords(line) {
  const raw = String(line || '');
  const re = /[a-zA-Z]+(?:'[a-zA-Z]+)?/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out += escapeHtml(raw.slice(last, m.index));
    const w = m[0];
    out += `<span class="pw" data-w="${escapeAttr(w)}" title="查词典">${escapeHtml(w)}</span>`;
    last = m.index + w.length;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

// 点击单词直接查词典；拖拽选中仍走 bindPassageLookup
function bindPassageWords(root, book) {
  if (!root) return;
  root.addEventListener('click', (e) => {
    if (e.target.closest('.spk')) return;
    const pw = e.target.closest('.pw');
    if (!pw) return;
    e.stopPropagation();
    const w = pw.dataset.w;
    if (w && w.length >= 2) goToDictionary(w, book);
  });
}

// 选中课文中的单词/短语，弹出查词典入口
function bindPassageLookup(root, book) {
  if (!root) return;
  let pop = null;
  function removePop() {
    if (pop) { pop.remove(); pop = null; }
  }
  root.onmouseup = (e) => {
    setTimeout(() => {
      if (e.target.closest('.pw')) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return removePop();
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return removePop();
      const raw = sel.toString().trim();
      if (!raw || raw.length > 48) return removePop();
      const text = enOnly(raw) || raw;
      if (!text || text.length < 2) return removePop();
      removePop();
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      pop = document.createElement('button');
      pop.type = 'button';
      pop.className = 'lookup-pop';
      const label = text.length > 18 ? text.slice(0, 16) + '…' : text;
      pop.textContent = `📕 查「${label}」`;
      pop.style.left = Math.min(rect.left, window.innerWidth - 180) + 'px';
      pop.style.top = (rect.bottom + 6) + 'px';
      pop.onclick = (ev) => {
        ev.stopPropagation();
        goToDictionary(text, book);
        sel.removeAllRanges();
        removePop();
      };
      document.body.appendChild(pop);
    }, 10);
  };
}

// 把一段文本按行拆成句子，每句带 🔊；可选中文翻译
function renderPassage(en, cn) {
  const lines = String(en || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const body = lines
    .map((line) => `<div class="pl"><span class="spk" data-speak="${escapeAttr(line)}">🔊</span> ${wrapPassageWords(line)}</div>`)
    .join('');
  const cnBlock = cn ? `<div class="passage-cn">${escapeHtml(cn).replace(/\n+/g, '<br>')}</div>` : '';
  // 顶部“朗读全文”按钮：多句由 speakLines 顺序连读，再点切换为停止（见 renderArticleView 绑定）
  const tools = lines.length
    ? `<div class="passage-tools"><button type="button" class="btn ghost small read-passage" data-label="🔊 朗读全文">🔊 朗读全文</button></div>`
    : '';
  return `${tools}<div class="passage">${body}</div>${cnBlock}`;
}

// ---------- 原声课文（MP3 + LRC 时间轴）----------
let officialLessonAudio = null;

function stopOfficialAudio() {
  stopOfficialSegmentAudio();
  if (officialLessonAudio) {
    officialLessonAudio.pause();
    officialLessonAudio.currentTime = 0;
    officialLessonAudio = null;
  }
  document.querySelectorAll('.official-line.active').forEach((el) => el.classList.remove('active'));
}

function fmtAudioTime(sec) {
  if (!sec || !Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function toastOfficialAudioFail() {
  toast(
    '原声无法播放。请确认已执行 git lfs pull，并硬刷新页面（Cmd+Shift+R）以清除旧音频缓存。',
    'warn'
  );
}

function renderOfficialPassage(p) {
  const lines = (p.lines || []).map((line, i) =>
    `<div class="pl official-line" data-t="${line.t}" data-i="${i}">${speakBtnHtml(line.en)} ${wrapPassageWords(line.en)}</div>`
  ).join('');
  return (
    `<div class="art-note">🎧 新概念<b>英音原声</b> · ${escapeHtml(p.title || '')} · 点击句子可跳转到对应位置</div>` +
    `<div class="official-player">` +
    `<button type="button" class="btn primary small" id="officialPlayBtn">▶ 播放原声</button>` +
    `<span class="official-time" id="officialTime">0:00</span>` +
    `<audio id="officialAudio" src="${escapeAttr(p.audio)}" preload="metadata"></audio>` +
    `</div>` +
    `<div class="passage official-passage">${lines || escapeHtml(p.en || '')}</div>`
  );
}

function bindOfficialPassage(view) {
  const audio = view.querySelector('#officialAudio');
  const playBtn = view.querySelector('#officialPlayBtn');
  const timeEl = view.querySelector('#officialTime');
  if (!audio || !playBtn) return;

  officialLessonAudio = audio;
  const lines = view.querySelectorAll('.official-line');

  function syncHighlight() {
    const t = audio.currentTime;
    let active = null;
    lines.forEach((el) => {
      const ts = Number(el.dataset.t);
      if (ts <= t + 0.05) active = el;
    });
    lines.forEach((el) => el.classList.toggle('active', el === active));
    if (timeEl) timeEl.textContent = fmtAudioTime(t);
  }

  playBtn.onclick = function () {
    stopAllSpeakAudio();
    if (!audio.paused && !audio.ended) {
      audio.pause();
      playBtn.textContent = '▶ 播放原声';
      return;
    }
    if (audio.ended) audio.currentTime = 0;
    audio.play().then(function () {
      playBtn.textContent = '⏸ 暂停';
    }).catch(function () {
      playBtn.textContent = '▶ 播放原声';
      toastOfficialAudioFail();
    });
  };

  audio.onerror = function () {
    playBtn.textContent = '▶ 播放原声';
    toastOfficialAudioFail();
  };

  audio.ontimeupdate = syncHighlight;
  audio.onended = function () {
    playBtn.textContent = '▶ 播放原声';
    lines.forEach((el) => el.classList.remove('active'));
  };
  audio.onloadedmetadata = function () {
    if (timeEl) timeEl.textContent = '0:00 / ' + fmtAudioTime(audio.duration);
  };

  lines.forEach(function (el) {
    const spk = el.querySelector('.spk');
    if (spk) {
      spk.onclick = function (e) {
        e.stopPropagation();
        speak(spk.dataset.speak);
      };
    }
    el.onclick = function () {
      stopAllSpeakAudio();
      audio.currentTime = Number(el.dataset.t) || 0;
      audio.play().catch(function () {});
      playBtn.textContent = '⏸ 暂停';
      lines.forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
    };
  });
}

// 原文录入编辑器（方案 B：内容由用户粘贴，存到项目内）
function renderTextEditor(l) {
  const view = $('articleView');
  if (!view) return;
  const t = state.currentLessonText || {};
  view.innerHTML =
    `<div class="art-note">📖 <b>教材原文需自行录入</b>（保存后随备份同步，系统不预置版权课文）。暂无原文？可点上方「✍️ 原创精读」或查看下方重点单词。</div>` +
    `<textarea id="txtEn" class="art-ta" placeholder="在此粘贴英文原文，建议一句一行…">${escapeHtml(t.en || '')}</textarea>` +
    `<textarea id="txtCn" class="art-ta" placeholder="（可选）中文翻译…">${escapeHtml(t.cn || '')}</textarea>` +
    `<div class="actions"><button class="btn primary small" id="saveTextBtn">保存原文</button>` +
    (t.en ? `<button class="btn ghost small" id="clearTextBtn">清空</button>` : '') + `</div>`;
  $('saveTextBtn').onclick = () => saveLessonText(l, $('txtEn').value, $('txtCn').value);
  const c = $('clearTextBtn');
  if (c) c.onclick = () => saveLessonText(l, '', '');
}

async function saveLessonText(l, en, cn) {
  await api(`/api/lesson-text/${l.book}/${l.lesson}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ en, cn }),
  }).catch(() => {});
  state.currentLessonText = en.trim() ? { en: en.trim(), cn: (cn || '').trim() } : null;
  toast(en.trim() ? '课文原文已保存' : '已清空原文', 'ok');
  renderArticleView(l, 'orig');
}

// 渲染当前子页：official=原声课文 / orig=教材原文(用户录入) / mine=原创精读
function renderArticleView(l, which) {
  const view = $('articleView');
  if (!view) return;
  state.articleTab = which;
  stopOfficialAudio();
  if (which === 'official') {
    const p = state.currentOfficialPassage;
    if (p && p.en) {
      view.innerHTML = renderOfficialPassage(p);
      bindOfficialPassage(view);
      bindPassageLookup(view, l.book);
      bindPassageWords(view, l.book);
    } else {
      view.innerHTML = '<div class="art-empty">本课原声文件缺失。请确认 <code>public/audio/nce/</code> 目录下已有对应 MP3，或运行 <code>npm run import:official -- --source "…/英音"</code> 重新导入。</div>';
    }
    return;
  }
  if (which === 'mine') {
    if (l.article && l.article.en) {
      view.innerHTML = `<div class="art-note">✍️ 原创精读短文（同主题、同语法、同核心词）· 朗读为浏览器 TTS · 点击单词或选中短语可查词典</div>` +
        renderPassage(l.article.en, l.article.cn);
    } else {
      view.innerHTML = `<div class="art-empty">本课原创精读短文即将补充。</div>`;
    }
  } else {
    const t = state.currentLessonText;
    if (t && t.en) {
      view.innerHTML = `<div class="art-note">📖 教材原文 · 真人英音原声朗读 <button class="btn ghost small" id="editTextBtn">编辑</button> · 点击单词或选中短语可查词典</div>` +
        renderPassage(t.en, t.cn);
      $('editTextBtn').onclick = () => renderTextEditor(l);
    } else {
      renderTextEditor(l);
    }
  }
  const readBtn = view.querySelector('.read-passage');
  const resetRead = readBtn ? () => { readBtn.textContent = readBtn.dataset.label; } : () => {};
  // 单句 🔊 会 cancel() 打断整段朗读，顺手把“朗读全文”按钮复位，避免卡在“停止”
  view.querySelectorAll('.spk').forEach((el) => { el.onclick = () => { speak(el.dataset.speak); resetRead(); }; });
  if (readBtn) {
    readBtn.onclick = () => {
      const tab = state.articleTab;
      const reading = (humanAudio && !humanAudio.paused)
        || officialSegmentAudio
        || (officialLessonAudio && !officialLessonAudio.paused)
        || (window.speechSynthesis && speechSynthesis.speaking);
      if (reading) {
        stopAllSpeakAudio();
        resetRead();
        return;
      }
      const lines = Array.from(view.querySelectorAll('.passage .pl .spk')).map((s) => s.dataset.speak);
      readBtn.textContent = '⏹ 停止';
      speakPassageFull(tab, lines, resetRead);
    };
  }
  bindPassageLookup(view, l.book);
  bindPassageWords(view, l.book);
}

function bindArticle(l) {
  const tabs = $('lessonDetail').querySelectorAll('.art-tab');
  const hasOfficial = !!(state.currentOfficialPassage && state.currentOfficialPassage.en);
  const hasOrig = showLessonTextTab();
  const hasMine = !!(l.article && l.article.en);
  let which = hasOfficial ? 'official' : (hasOrig ? 'orig' : 'mine');
  if (!hasOfficial && !hasOrig && hasMine) which = 'mine';
  tabs.forEach((t) => {
    const at = t.dataset.at;
    const show = at === 'official' ? hasOfficial
      : at === 'orig' ? hasOrig
      : at === 'mine' ? hasMine
      : true;
    t.style.display = show ? '' : 'none';
    t.classList.toggle('on', t.dataset.at === which);
    t.onclick = () => {
      stopOfficialAudio();
      tabs.forEach((x) => x.classList.toggle('on', x === t));
      renderArticleView(l, t.dataset.at);
    };
  });
  renderArticleView(l, which);
}

async function openLesson(book, lesson, opts) {
  let l, starsRes, textRes, officialRes;
  try {
    [l, starsRes, textRes, officialRes] = await Promise.all([
      api(`/api/lesson/${book}/${lesson}`),
      api('/api/vocab/stars').catch(() => ({ words: [] })),
      api(`/api/lesson-text/${book}/${lesson}`).catch(() => ({ text: null })),
      api(`/api/official/${book}/${lesson}`).catch(() => null),
    ]);
  } catch (e) {
    return; // api() 已 toast 具体错误（如「该课程尚未收录」）
  }
  state.currentLesson = l;
  state.currentLessonText = (textRes && textRes.text) || null;
  state.currentOfficialPassage = (officialRes && officialRes.en && !officialRes.error) ? officialRes : null;
  state.vocabStars = new Set((starsRes.words || []).map((w) => normWordKey(w.word)));
  // 记录最近学习的课，供首页「继续学习」使用
  NCEStore.set('nce-last-lesson', { book: l.book, lesson: l.lesson, title: l.title, titleCn: l.titleCn });

  const words = (l.words || []).map((w) => {
    const starred = state.vocabStars.has(normWordKey(w.word));
    return `<tr><td class="w"><span class="wstar${starred ? ' on' : ''}" data-word="${escapeAttr(w.word)}" title="${starred ? '移出生词本' : '加入生词本'}">${starred ? '★' : '☆'}</span><span class="wdict" data-word="${escapeAttr(w.word)}" title="查词典">📕</span><span class="spk" data-speak="${escapeAttr(w.word)}">🔊</span> ${escapeHtml(w.word)}<div class="phon">${escapeHtml(w.phon || '')}</div></td>` +
      `<td class="pos">${escapeHtml(w.pos || '')}</td><td>${escapeHtml(w.cn || '')}</td>` +
      `<td>${escapeHtml(w.eg || '')}${w.eg ? ` <span class="spk" data-speak="${escapeAttr(w.eg)}">🔊</span>` : ''}</td></tr>`;
  }).join('');

  const grammar = (l.grammar || []).map((g) => {
    const ex = (g.examples || []).map((e) => `<div><span class="spk" data-speak="${escapeAttr(e)}">🔊</span> ${wrapPassageWords(e)}</div>`).join('');
    return `<div class="gram-item"><div class="gp">📌 ${escapeHtml(g.point)}</div>` +
      `<div class="gx">${escapeHtml(g.explain)}</div><div class="ge">${ex}</div></div>`;
  }).join('');
  const camUnits = cambridgeUnitsForLesson(l);
  const camRow = camUnits.length
    ? `<div class="gram-cambridge"><span class="gram-cam-label">📘 剑桥语法单元</span>` +
      camUnits.map((u) =>
        `<button type="button" class="btn ghost small gram-cam-btn" data-cam-unit="${u.unit}" title="${escapeAttr(u.title || '')}">` +
        `U${u.unit} ${escapeHtml(u.titleCn)} · ${u.count}句</button>`).join('') +
      `</div>`
    : '';

  // 本课学习情况条（练习次数/正确率来自 /api/stats/lesson）
  const st = lessonStatFor(l.book, l.lesson);
  const statsLine = st && st.seen
    ? `本课已练 ${st.seen} 次 · 正确率 <b class="acc ${accClass(st.accuracy)}">${st.accuracy}%</b>`
    : '本课还没练过题，学完右上角开练';

  $('lessonDetail').innerHTML =
    `<div class="lesson-title">Lesson ${l.lesson}. ${escapeHtml(l.title)} <span class="spk" data-speak="${escapeAttr(l.title)}">🔊</span><span class="cn">${escapeHtml(l.titleCn || '')}</span></div>` +
    `<div class="lesson-stats">📊 ${statsLine} · 重点单词 ${(l.words || []).length} 个 · 语法点 ${(l.grammar || []).length} 个</div>` +
    `<div class="lesson-scene">🎬 <b>课文情景</b>：${escapeHtml(l.scene || '')}</div>` +
    `<div class="sec-title">📄 课文</div>` +
    `<div class="article-box">
      <div class="article-tabs">
        <button class="art-tab" data-at="official">🎧 原声课文</button>
        <button class="art-tab" data-at="orig">📖 教材原文</button>
        <button class="art-tab" data-at="mine">✍️ 原创精读</button>
      </div>
      <div class="article-view" id="articleView"></div>
    </div>` +
    `<div class="sec-title">📝 重点单词 <button class="btn ghost small" id="readAllWords">🔊 全部单词连读</button></div>` +
    `<div class="words-wrap"><table class="words"><tr><th>单词</th><th>词性</th><th>释义</th><th>例句（原创）</th></tr>${words}</table></div>` +
    `<div class="sec-title">📐 语法精讲</div>${camRow}${grammar}` +
    `<div class="sec-title">💡 理解与记忆方法</div><div class="tips-box">${escapeHtml(l.tips || '').replace(/①|②|③|④/g, '<br>$&')}</div>` +
    (l.notes
      ? `<div class="sec-title">📓 视频笔记</div><div class="notes-box">${renderNotes(l.notes)}</div>`
      : '') +
    // 书页页脚：上一课 / 页码 / 下一课
    `<div class="page-nav">
      <button class="btn ghost small" id="prevLessonBtn">‹ 上一课</button>
      <span class="page-no" id="pageNo"></span>
      <button class="btn ghost small" id="nextLessonBtn">下一课 ›</button>
    </div>`;

  // 翻页按钮与页码（键盘 ←/→ 也可翻页）
  const list = state.learnLessons || [];
  const idx = list.findIndex((x) => x.lesson === l.lesson);
  $('pageNo').textContent = idx >= 0 ? `Lesson ${l.lesson} · 第 ${idx + 1} / ${list.length} 课` : `Lesson ${l.lesson}`;
  $('prevLessonBtn').disabled = idx <= 0;
  $('nextLessonBtn').disabled = idx < 0 || idx >= list.length - 1;
  $('prevLessonBtn').onclick = () => navLesson(-1);
  $('nextLessonBtn').onclick = () => navLesson(1);

  // 绑定朗读
  $('lessonDetail').querySelectorAll('.spk').forEach((el) => {
    el.onclick = () => speak(el.dataset.speak);
  });
  $('lessonDetail').querySelectorAll('.wdict').forEach((el) => {
    el.onclick = () => goToDictionary(el.dataset.word, l.book);
  });
  const spellThis = $('spellThisBtn');
  if (spellThis) {
    spellThis.onclick = () => {
      NCE.pendingWords = { mode: 'spell', book: l.book };
      gotoTab('words');
    };
  }
  const dictLookup = $('dictLookupBtn');
  if (dictLookup) {
    dictLookup.onclick = () => goToDictionary('', l.book);
  }
  const readAll = $('readAllWords');
  if (readAll) readAll.onclick = () => speakSequence((l.words || []).map((w) => w.word));

  // 课文区：原文（用户录入）/ 原创精读（AI）双子页
  bindArticle(l);
  $('lessonDetail').querySelectorAll('.ge').forEach((ge) => {
    bindPassageLookup(ge, l.book);
    bindPassageWords(ge, l.book);
  });

  // 单词收藏：点 ☆/★ 加入/移出生词本（与「单词」页共用 /api/vocab）
  $('lessonDetail').querySelectorAll('.gram-cam-btn').forEach((btn) => {
    btn.onclick = () => {
      goToTransform({
        book: l.book,
        lessonMin: l.lesson,
        lessonMax: l.lesson,
        cambridgeUnit: Number(btn.dataset.camUnit),
        showCambridge: true,
      });
    };
  });
  $('lessonDetail').querySelectorAll('.wstar').forEach((el) => {
    el.onclick = async () => {
      const word = el.dataset.word;
      const on = el.classList.contains('on');
      el.classList.toggle('on', !on);
      el.textContent = on ? '☆' : '★';
      el.title = on ? '加入生词本' : '移出生词本';
      try {
        const w = (l.words || []).find((x) => x.word === word) || { word };
        await api('/api/vocab/' + (on ? 'unstar' : 'star'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(on ? { word } : { ...w, book: l.book, lesson: l.lesson }),
        });
        if (on) state.vocabStars.delete(normWordKey(word)); else state.vocabStars.add(normWordKey(word));
        toast(on ? `已移出生词本：${word}` : `⭐ 已加入生词本：${word}`, 'ok');
      } catch (e) {
        // 失败回滚
        el.classList.toggle('on', on);
        el.textContent = on ? '★' : '☆';
        toast('操作失败，请稍后重试', 'bad');
      }
    };
  });

  // 「已掌握」「打卡本课」按钮状态跟随当前课
  updateMasterBtn(l);
  updateCheckinBtn(l);

  // 在右侧内容区展示详情，并高亮左侧目录当前课（记为已学，✓ 标记）
  markLessonViewed(l.book, l.lesson);
  updateTocProgress();
  $('learnPlaceholder').classList.add('hidden');
  $('lessonDetailWrap').classList.remove('hidden');
  let activeItem = null;
  $('lessonToc').querySelectorAll('.toc-item').forEach((el) => {
    const on = Number(el.dataset.lesson) === Number(lesson);
    el.classList.toggle('active', on);
    if (on) { el.classList.add('viewed'); activeItem = el; }
  });
  // 目录跟随：当前课滚入目录可视区（翻页/继续学习时目录不脱节）
  if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
  // 滚动到新打开的课文详情（而不是回到页面顶部）
  $('lessonDetailWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (opts && opts.highlightWord) {
    setTimeout(() => highlightWordInLesson(opts.highlightWord), 150);
  }
  history.replaceState(null, '', `#learn?book=${l.book}&lesson=${l.lesson}`);
}

// 词典等入口深链到指定课，并可选高亮单词行
function highlightWordInLesson(word) {
  const key = String(word || '').trim().toLowerCase();
  if (!key || !$('lessonDetail')) return;
  $('lessonDetail').querySelectorAll('.words tr').forEach((row) => {
    const el = row.querySelector('.wstar[data-word]');
    if (!el) return;
    if (String(el.dataset.word).trim().toLowerCase() === key) {
      row.classList.add('word-highlight');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => row.classList.remove('word-highlight'), 2800);
    }
  });
}

async function goToLesson(book, lesson, opts) {
  const b = Number(book);
  const l = Number(lesson);
  if (state.learnBook !== b) {
    state.learnBook = b;
    renderLearnBookChips();
    await loadLessons(b);
  }
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  const learnTab = document.querySelector('.tab[data-tab="learn"]');
  if (learnTab) learnTab.classList.add('active');
  hideAll();
  $('lessonsPanel').classList.remove('hidden');
  window.scrollTo(0, 0);
  await openLesson(b, l, opts);
}

// 本课对应的剑桥语法单元（有句型转换练习的）
function cambridgeUnitsForLesson(l) {
  const info = state.transformMeta && state.transformMeta.cambridgeByBook && state.transformMeta.cambridgeByBook[l.book];
  if (!info || !info.sections) return [];
  const tags = new Set(l.grammarTags || []);
  const covMap = {};
  (info.coverage || []).forEach((c) => { covMap[c.unit] = c.count; });
  const out = [];
  const seen = new Set();
  for (const sec of info.sections) {
    for (const u of sec.units || []) {
      if (seen.has(u.unit)) continue;
      if ((u.grammar || []).some((g) => tags.has(g)) && covMap[u.unit] > 0) {
        seen.add(u.unit);
        out.push({
          unit: u.unit,
          title: u.title,
          titleCn: u.titleCn,
          count: covMap[u.unit],
          sectionTitleCn: sec.titleCn,
          levelTitle: info.levelTitle,
        });
      }
    }
  }
  return out.sort((a, b) => a.unit - b.unit);
}

function goToTransform(opts) {
  NCE.pendingTransform = Object.assign({ autoStart: true }, opts || {});
  gotoTab('transform');
}

async function practiceTransformLesson() {
  const l = state.currentLesson;
  if (!l) return;
  const base = { book: l.book, lessonMin: l.lesson, lessonMax: l.lesson };
  const units = cambridgeUnitsForLesson(l);
  const tags = l.grammarTags || [];
  if (units.length) {
    goToTransform({ ...base, cambridgeUnit: units[0].unit, showCambridge: true });
    return;
  }
  if (tags.length) {
    goToTransform({ ...base, grammar: tags[0] });
    return;
  }
  goToTransform(base);
}

// 练本课语法：优先出挂在本课的题，不足 10 题再用本课语法标签的同册题补足
// （只按语法标签取会大量抽到其它课的题，练第 3 课却做第 121 课的题体验很差）
async function practiceCurrentLesson() {
  const l = state.currentLesson;
  if (!l) return;
  const tags = new Set(l.grammarTags || []);
  const all = await api(`/api/questions?book=${l.book}&limit=0`);
  // 新概念1奇数课是课文、偶数课是配套练习，挂在 n+1 课号的题也算本课
  const isOwn = (q) => q.lesson === l.lesson || (l.book === 1 && q.lesson === l.lesson + 1);
  const pick = (arr) => arr.slice().sort(() => Math.random() - 0.5);
  const own = pick(all.questions.filter(isOwn));
  const related = pick(all.questions.filter((q) => !isOwn(q) && (q.grammar || []).some((g) => tags.has(g))));
  const qs = own.concat(related).slice(0, 10);
  if (!qs.length) {
    toast('本课语法暂无对应练习题，可去「刷题练习」自由组卷。');
    return;
  }
  beginQuiz(qs);
}

// 按语法点直接组一组题（首页「薄弱专练」入口），并把刷题设置页的筛选同步过去，
// 练完点「再练一组」能延续同一条件
async function practiceGrammar(tag, preferredBook) {
  const byBook = (state.meta && state.meta.grammarByBook) || {};
  // 该语法点所在的册：优先推荐册 / 当前册，否则取第一个含它的册
  let book = preferredBook != null ? Number(preferredBook) : null;
  if (!book || !(byBook[book] || []).includes(tag)) {
    book = (byBook[state.selectedBook] || []).includes(tag) ? state.selectedBook : null;
  }
  if (!book) {
    const b = Object.keys(byBook).find((k) => (byBook[k] || []).includes(tag));
    if (b) book = Number(b);
  }
  const p = new URLSearchParams({ grammar: tag, random: '1', limit: '10' });
  if (book) p.set('book', book);
  const data = await api('/api/questions?' + p.toString()).catch(() => null);
  if (!data || !data.count) {
    toast('该语法点暂无可练题目');
    return;
  }
  if (book) {
    state.selectedBook = book;
    state.selectedGrammar = tag;
    state.selectedUnit = null;
    renderBookChips();
    renderUnitChips();
    renderGrammarChips();
  }
  beginQuiz(data.questions);
}

function practiceWeakTransform(tag, book) {
  goToTransform({
    grammar: tag,
    book: book != null ? book : undefined,
    limit: 5,
    autoStart: true,
  });
}

function practiceWeakRecommend(rec) {
  if (!rec || !rec.tag) return;
  if (rec.primary === 'transform' && rec.transformAvailable) {
    practiceWeakTransform(rec.tag, rec.book);
  } else if (rec.quizAvailable) {
    practiceGrammar(rec.tag, rec.book);
  } else if (rec.transformAvailable) {
    practiceWeakTransform(rec.tag, rec.book);
  } else {
    toast('该语法点暂无可练内容');
  }
}

function renderBookChips() {
  const box = $('bookChips');
  box.innerHTML = '';
  state.meta.books.forEach((b) => {
    const el = document.createElement('div');
    el.className = 'chip' + (b.id === state.selectedBook ? ' active' : '');
    const n = (state.meta.stats && state.meta.stats.byBook && state.meta.stats.byBook[b.id]) || 0;
    el.textContent = `第${b.id}册`;
    const cnt = document.createElement('span');
    cnt.className = 'chip-count';
    cnt.textContent = n ? `${n}题` : '暂无题';
    el.appendChild(cnt);
    el.title = b.subtitle;
    el.onclick = () => {
      state.selectedBook = b.id;
      state.selectedUnit = null;
      state.selectedGrammar = null;
      renderBookChips();
      renderUnitChips();
      renderGrammarChips();
      updatePoolHint();
    };
    box.appendChild(el);
  });
}

function renderUnitChips() {
  const box = $('unitChips');
  box.innerHTML = '';
  const units = (state.meta.units && state.meta.units[state.selectedBook]) || [];
  const all = mkChip('全部课程', state.selectedUnit === null, () => {
    state.selectedUnit = null;
    renderUnitChips();
    updatePoolHint();
  });
  box.appendChild(all);
  units.forEach((u) => {
    const active = state.selectedUnit && state.selectedUnit.min === u.min && state.selectedUnit.max === u.max;
    box.appendChild(
      mkChip(u.label, active, () => {
        state.selectedUnit = { min: u.min, max: u.max };
        renderUnitChips();
        updatePoolHint();
      })
    );
  });
}

function renderGrammarChips() {
  const box = $('grammarChips');
  box.innerHTML = '';
  const list = (state.meta.grammarByBook && state.meta.grammarByBook[state.selectedBook]) || [];
  box.appendChild(
    mkChip('全部语法', state.selectedGrammar === null, () => {
      state.selectedGrammar = null;
      renderGrammarChips();
      updatePoolHint();
    })
  );
  list.forEach((g) => {
    box.appendChild(
      mkChip(g, state.selectedGrammar === g, () => {
        state.selectedGrammar = g;
        renderGrammarChips();
        updatePoolHint();
      })
    );
  });
}

function mkChip(text, active, onclick) {
  const el = document.createElement('div');
  el.className = 'chip' + (active ? ' active' : '');
  el.textContent = text;
  el.onclick = onclick;
  return el;
}

function buildQuery() {
  const p = new URLSearchParams();
  p.set('book', state.selectedBook);
  if (state.selectedUnit) {
    p.set('lessonMin', state.selectedUnit.min);
    p.set('lessonMax', state.selectedUnit.max);
  }
  if (state.selectedGrammar) p.set('grammar', state.selectedGrammar);
  const type = $('typeSelect').value;
  if (type) p.set('type', type);
  const limit = $('limitSelect').value;
  if (limit && limit !== '0') p.set('limit', limit);
  if ($('randomCheck').checked) p.set('random', '1');
  return p;
}

async function updatePoolHint() {
  // 统计当前筛选下的可用题量（不含 limit）
  const p = new URLSearchParams();
  p.set('book', state.selectedBook);
  if (state.selectedUnit) {
    p.set('lessonMin', state.selectedUnit.min);
    p.set('lessonMax', state.selectedUnit.max);
  }
  if (state.selectedGrammar) p.set('grammar', state.selectedGrammar);
  const type = $('typeSelect').value;
  if (type) p.set('type', type);
  p.set('countOnly', '1'); // 只要题数，不拉整份题目
  const data = await api('/api/questions?' + p.toString()).catch(() => null);
  if (data) $('poolHint').textContent = `当前条件下题库共有 ${data.count} 道题可供练习。`;
}

async function updateStatsMini() {
  const s = await api('/api/progress');
  $('statsMini').textContent = `累计 ${s.totalAttempts} 题 · 正确率 ${s.accuracy}% · 错题本 ${s.wrongCount}`;
}

// ---------- 答题草稿（sessionStorage，防刷新丢失作答）----------
const DRAFT_KEY = 'nce-quiz-draft';
function saveDraft() {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      mode: state.mode,
      questions: state.questions,
      answers: currentAnswerMap(),
      stepIndex: state.stepIndex || 0,
      stepResults: state.stepResults || [],
    }));
  } catch (e) { /* 存储不可用时静默降级 */ }
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
}
function loadDraftQuiz() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
}
// 从 DOM 收集当前已填写的作答 { 题id: 答案 }
function currentAnswerMap() {
  const map = {};
  state.questions.forEach((q) => {
    const inp = document.querySelector(`[name="q_${q.id}"]:checked`) ||
      document.querySelector(`input.fill-input[name="q_${q.id}"]`);
    if (inp && inp.value) map[q.id] = inp.value;
  });
  return map;
}
// 把草稿中的作答回填到已渲染的整卷题目上
function restoreAnswers(answers) {
  state.questions.forEach((q) => {
    const val = answers[q.id];
    if (val == null) return;
    if (q.type === 'mcq') {
      const inp = Array.from(document.querySelectorAll(`input[name="q_${q.id}"]`)).find((i) => i.value === val);
      if (inp) {
        inp.checked = true;
        inp.closest('.option').classList.add('selected');
      }
    } else {
      const inp = document.querySelector(`input.fill-input[name="q_${q.id}"]`);
      if (inp) inp.value = val;
    }
  });
}
// 页面刷新后恢复未完成的练习；有草稿则直接回到答题页
function resumeDraftQuiz() {
  const draft = loadDraftQuiz();
  if (!draft || !Array.isArray(draft.questions) || !draft.questions.length) return false;
  state.questions = draft.questions;
  state.mode = draft.mode || 'sheet';
  state.stepIndex = Math.min(draft.stepIndex || 0, draft.questions.length - 1);
  state.stepResults = draft.stepResults || [];
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'practice'));
  history.replaceState(null, '', '#practice'); // hash 与恢复后的页面保持一致
  if (state.mode === 'step') {
    renderStepQuiz();
  } else {
    renderQuiz();
    restoreAnswers(draft.answers || {});
  }
  showPanel('quizPanel');
  return true;
}

// ---------- 答题 ----------
// 统一入口：设置题目并按当前作答模式进入答题
function beginQuiz(questions) {
  state.questions = questions;
  state.mode = ($('modeSelect') && $('modeSelect').value) || 'sheet';
  state.stepIndex = 0;
  state.stepResults = [];
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'practice'));
  history.replaceState(null, '', '#practice'); // 从首页/教材页直入答题时同步 hash
  if (state.mode === 'step') renderStepQuiz();
  else renderQuiz();
  showPanel('quizPanel');
  saveDraft();
}

async function startQuiz(wrongOnly) {
  let data;
  if (wrongOnly) {
    data = await api('/api/wrong');
    if (!data.count) {
      toast('错题本是空的，先去练习吧！', 'ok');
      return;
    }
  } else {
    data = await api('/api/questions?' + buildQuery().toString());
    if (!data.count) {
      toast('当前条件下没有题目，请调整筛选。');
      return;
    }
  }
  beginQuiz(data.questions);
}

// 生成一道题的卡片内容 HTML（整卷与逐题共用）
function questionCardHtml(q, index) {
  const tags = (q.grammar || []).map((g) => `<span class="q-tag">${g}</span>`).join('');
  const meta = `<div class="q-meta">第${q.book}册 · Lesson ${q.lesson} ${q.lessonTitle || ''} ${tags}</div>`;
  const stem = `<div class="q-stem">${index + 1}. ${speakBtnHtml(q.stem)} ${escapeHtml(q.stem)}</div>`;
  let body = '';
  if (q.type === 'mcq') {
    body = '<div class="options">';
    (q.options || []).forEach((opt) => {
      body += `<label class="option"><input type="radio" name="q_${q.id}" value="${escapeAttr(opt)}"><span>${escapeHtml(opt)}</span></label>`;
    });
    body += '</div>';
  } else {
    body = `<input class="fill-input" type="text" name="q_${q.id}" placeholder="在此输入答案" autocomplete="off">`;
  }
  return meta + stem + body;
}

// 绑定选项高亮，并在每次作答后保存草稿
function bindOptionEvents(box) {
  box.querySelectorAll('.option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const name = opt.querySelector('input').name;
      box.querySelectorAll(`input[name="${name}"]`).forEach((inp) =>
        inp.closest('.option').classList.remove('selected')
      );
      opt.classList.add('selected');
      saveDraft();
    });
  });
  box.querySelectorAll('.fill-input').forEach((inp) => {
    inp.addEventListener('input', saveDraft);
  });
}

function renderQuiz() {
  const box = $('quizList');
  box.innerHTML = '';
  state.questions.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'q-card';
    card.dataset.qid = q.id;
    card.innerHTML = questionCardHtml(q, i);
    box.appendChild(card);
  });
  bindOptionEvents(box);
  bindSpeakClicks(box);
  $('submitBtn').classList.remove('hidden');
  $('progressText').textContent = `共 ${state.questions.length} 题`;
}

// ---------- 逐题模式：一题一判，即时反馈 ----------
function renderStepQuiz() {
  const box = $('quizList');
  const i = state.stepIndex;
  const q = state.questions[i];
  const correctSoFar = state.stepResults.filter((r) => r.correct).length;
  $('submitBtn').classList.add('hidden');
  $('progressText').textContent = `第 ${i + 1} / ${state.questions.length} 题 · 已答对 ${correctSoFar}`;

  box.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'q-card';
  card.dataset.qid = q.id;
  card.innerHTML =
    questionCardHtml(q, i) +
    '<div class="step-feedback hidden" id="stepFeedback"></div>' +
    '<div class="actions"><button class="btn primary" id="stepConfirmBtn">确认答案</button>' +
    (q.type === 'mcq' ? '<span class="hint">键盘：1-4 选选项 · 回车确认</span>' : '<span class="hint">键盘：回车确认</span>') +
    '</div>';
  box.appendChild(card);
  bindOptionEvents(box);
  bindSpeakClicks(box);
  $('stepConfirmBtn').onclick = confirmStep;
  const fill = box.querySelector('.fill-input');
  if (fill) fill.focus();
}

async function confirmStep() {
  const q = state.questions[state.stepIndex];
  const inp = document.querySelector(`[name="q_${q.id}"]:checked`) ||
    document.querySelector(`input.fill-input[name="q_${q.id}"]`);
  const response = inp ? inp.value : '';
  if (!response.trim() && !confirm('这题还没作答，确定跳过（按答错计）吗？')) return;

  const res = await api('/api/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: [{ id: q.id, response }] }),
  });
  const r = res.results && res.results[0];
  if (!r) return;
  state.stepResults.push(r);

  // 即时反馈：对错 + 解析
  const fb = $('stepFeedback');
  const ansText = Array.isArray(r.answer) ? r.answer.join(' / ') : r.answer;
  fb.className = 'step-feedback ' + (r.correct ? 'ok' : 'bad');
  fb.innerHTML =
    (r.correct ? '✅ 回答正确！' : `❌ 回答错误，正确答案：${formatAnswersWithSpeak(r.answer) || `<b>${escapeHtml(ansText)}</b>`}`) +
    (r.explanation ? `<div class="r-exp">💡 ${escapeHtml(r.explanation)}</div>` : '');
  bindSpeakClicks(fb);

  // 已判分的题不允许再改
  document.querySelectorAll('#quizList input').forEach((el) => { el.disabled = true; });

  const btn = $('stepConfirmBtn');
  const isLast = state.stepIndex >= state.questions.length - 1;
  btn.textContent = isLast ? '查看成绩 →' : '下一题 →';
  btn.onclick = () => {
    if (isLast) {
      finishStepQuiz();
    } else {
      state.stepIndex++;
      saveDraft();
      renderStepQuiz();
    }
  };
  $('progressText').textContent =
    `第 ${state.stepIndex + 1} / ${state.questions.length} 题 · 已答对 ${state.stepResults.filter((x) => x.correct).length}`;
  updateStatsMini();
  saveDraft();
}

function finishStepQuiz() {
  const results = state.stepResults;
  const correct = results.filter((r) => r.correct).length;
  clearDraft();
  renderResult({
    total: results.length,
    correct,
    accuracy: results.length ? Math.round((correct / results.length) * 100) : 0,
    results,
  });
  showPanel('resultPanel');
  sendWrongToSrs(results);
}

function collectAnswers() {
  return state.questions.map((q) => {
    const inp = document.querySelector(`[name="q_${q.id}"]:checked`) ||
      document.querySelector(`input.fill-input[name="q_${q.id}"]`);
    return { id: q.id, response: inp ? inp.value : '' };
  });
}

// 把本次错题送入间隔重复复习队列（若 SRS 模块已启用）
function sendWrongToSrs(results) {
  const wrongIds = results.filter((r) => !r.correct).map((r) => r.id);
  if (!wrongIds.length) return;
  api('/api/srs/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: wrongIds }),
  }).catch(() => {});
}

async function submitQuiz() {
  const answers = collectAnswers();
  const unanswered = answers.filter((a) => !a.response.trim()).length;
  if (unanswered && !confirm(`还有 ${unanswered} 题未作答，确定提交吗？`)) return;

  const result = await api('/api/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  clearDraft();
  renderResult(result);
  showPanel('resultPanel');
  updateStatsMini();
  sendWrongToSrs(result.results);
}

// ---------- 结果 ----------
function renderResult(result) {
  const wrongCount = result.results.filter((r) => !r.correct).length;
  $('scoreBox').innerHTML =
    `<div class="big">${result.correct} / ${result.total}</div>` +
    `<div class="sub">正确率 ${result.accuracy}%${
      wrongCount ? ` · ${wrongCount} 道错题已加入「🔁 间隔复习」，到期后按遗忘曲线重现` : ''
    }</div>`;

  const box = $('resultList');
  box.innerHTML = '';
  state.lastWrongIds = [];
  result.results.forEach((r) => {
    if (!r.correct) state.lastWrongIds.push(r.id);
    const answerText = Array.isArray(r.answer) ? r.answer.join(' / ') : r.answer;
    const card = document.createElement('div');
    card.className = 'r-card ' + (r.correct ? 'ok' : 'bad');
    card.innerHTML =
      `<div class="r-stem">${speakBtnHtml(r.stem)} ${escapeHtml(r.stem)}</div>` +
      `<div class="r-line">你的答案：<span class="${r.correct ? 'yes' : 'no'}">${escapeHtml(r.response || '（未作答）')}</span>` +
      (r.correct ? ' ✓' : ` ✗　正确答案：${formatAnswersWithSpeak(r.answer) || `<span class="yes">${escapeHtml(answerText)}</span>`}`) +
      `</div>` +
      (r.explanation ? `<div class="r-exp">💡 ${escapeHtml(r.explanation)}</div>` : '');
    box.appendChild(card);
  });
  bindSpeakClicks(box);
}

async function retryWrong() {
  if (!state.lastWrongIds || !state.lastWrongIds.length) {
    toast('本次没有错题，太棒了！', 'ok');
    return;
  }
  // 直接从本次已加载的题目里筛出错题重练：
  // 不能按当前选中册重新拉取——错题本重练可能跨册，按册过滤会漏题
  const ids = new Set(state.lastWrongIds);
  beginQuiz(state.questions.filter((q) => ids.has(q.id)));
}

async function resetProgress() {
  if (!confirm('确定清空所有练习记录和错题本吗？')) return;
  await api('/api/progress/reset', { method: 'POST' });
  updateStatsMini();
  toast('进度已重置。', 'ok');
}

// ---------- 面板切换 ----------
function showPanel(id) {
  hideAll();
  $(id).classList.remove('hidden');
  window.scrollTo(0, 0);
}
let draftResumeChecked = false;
function showSetup() {
  // 首次进入「刷题练习」时，若上次有中途未完成的草稿则直接续做；否则显示出题设置
  if (!draftResumeChecked) {
    draftResumeChecked = true;
    if (resumeDraftQuiz()) return;
  }
  showPanel('setupPanel');
  updatePoolHint();
}

// ---------- 工具 ----------
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
// 视频笔记：支持字符串（换行转 <br>）或字符串数组（逐条列出）
function renderNotes(n) {
  const arr = Array.isArray(n) ? n : [n];
  return arr
    .map((x) => escapeHtml(x).replace(/\n/g, '<br>'))
    .join('<br>');
}

init();
