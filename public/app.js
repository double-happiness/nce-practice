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

// ---------- 语音朗读（浏览器内置 TTS，优先英音）----------
let VOICE = null;
// macOS/部分系统的“趣味语音”会发出音乐/机器噪音而非清晰人声，且常被标成 en_US 排在前面，
// 若无 en-GB 就绪时退回 /^en/ 很容易误选它们（用户听到“声音不对、有噪音”）。这里显式排除。
const NOVELTY_VOICE = /Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Jester|Organ|Superstar|Trinoids|Wobble|Zarvox|Hysterical|Whisper|Pipe Organ|Albert|Fred/i;
function pickVoice() {
  if (!window.speechSynthesis) return;
  const all = speechSynthesis.getVoices();
  if (!all.length) return; // 语音尚未加载，onvoiceschanged 会再次触发
  // 排除趣味语音；若过滤后为空（极少数系统只有趣味语音）再退回全量，保证有声可读
  const usable = all.filter((v) => !NOVELTY_VOICE.test(v.name));
  const pool = usable.length ? usable : all;
  const byLang = (re) => pool.filter((v) => re.test(v.lang));
  // 每个语言档里优先挑公认高质量的英音/美音（Daniel/Serena/Kate/Samantha…）或标注 enhanced/premium 的
  const best = (list) =>
    list.find((v) => /daniel|serena|kate|arthur|stephanie|samantha|enhanced|premium/i.test(v.name)) || list[0];
  const gb = byLang(/en[-_]GB/i);
  const us = byLang(/en[-_]US/i);
  const en = byLang(/^en/i);
  VOICE = (gb.length && best(gb)) || (us.length && best(us)) || (en.length && best(en)) || null;
}
if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
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
function speak(text) {
  if (!window.speechSynthesis) {
    toast('当前浏览器不支持语音朗读，建议使用 Chrome / Edge / Safari。', 'bad');
    return;
  }
  const t = enOnly(text);
  if (!t) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = 'en-GB';
  if (VOICE) u.voice = VOICE;
  u.rate = TTS_RATE;
  speechSynthesis.speak(u);
}
// 依次朗读一组词（用于“全部单词连读”）
function speakSequence(list) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  list.map(enOnly).filter(Boolean).forEach((t) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'en-GB';
    if (VOICE) u.voice = VOICE;
    u.rate = TTS_RATE * 0.95;
    speechSynthesis.speak(u);
  });
}
// 顺序连读多句并在读完最后一句时回调（用于精读“朗读全文”，供按钮复位）
function speakLines(lines, onEnd) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const items = (lines || []).map(enOnly).filter(Boolean);
  if (!items.length) { if (onEnd) onEnd(); return; }
  items.forEach((t, i) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'en-GB';
    if (VOICE) u.voice = VOICE;
    u.rate = TTS_RATE * 0.95;
    if (i === items.length - 1 && onEnd) u.onend = onEnd;
    speechSynthesis.speak(u);
  });
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
  state.meta = await api('/api/meta');
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
  // 切换标签时打断正在进行的朗读，避免听写/对话等页面的自动朗读串到新页面继续读
  if (window.speechSynthesis) speechSynthesis.cancel();
  const tabId = el.dataset.tab;
  if (tabId === 'dictionary' && location.hash.startsWith('#dictionary?')) return;
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

function goToDictionary(q, book) {
  const params = new URLSearchParams();
  const qs = String(q == null ? '' : q).trim();
  if (qs) params.set('q', qs);
  if (book != null && book !== '') params.set('book', String(book));
  const tail = params.toString();
  window.NCE.pendingDictionary = {
    q: qs,
    book: book != null && book !== '' ? String(book) : '',
    expandDetail: !!qs,
  };
  history.replaceState(null, '', '#dictionary' + (tail ? '?' + tail : ''));
  gotoTab('dictionary');
}

// 暴露给 feature 模块的公共 API
window.NCE = {
  api,
  speak,
  speakSequence,
  enOnly,
  registerFeature,
  gotoTab,
  goToLesson,
  goToDictionary,
  goToVocab,
  normWordKey,
  toast,
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
  const [prog, plan, srs, gram, wordsStats, vocabOv, vocabStars, training] = await Promise.all([
    api('/api/progress').catch(() => ({ totalAttempts: 0, accuracy: 0, wrongCount: 0 })),
    api('/api/plan/overview').catch(() => ({ goal: 10, todayCount: 0, streak: 0, totalDays: 0 })),
    api('/api/srs/stats').catch(() => ({ due: 0, upcoming: 0, total: 0 })),
    api('/api/stats/grammar').catch(() => ({ grammar: [] })),
    api(`/api/words/stats?book=${encodeURIComponent(vocabBook)}`).catch(() => null),
    api(`/api/vocab-test/overview?book=${encodeURIComponent(vocabBook)}`).catch(() => null),
    api('/api/vocab/stars').catch(() => ({ words: [] })),
    api('/api/stats/training').catch(() => null),
  ]);

  // 薄弱语法点：练够 4 次且正确率 < 85% 才算（接口已按正确率升序，最弱在前）
  const weak = (gram.grammar || []).filter((g) => g.seen >= 4 && g.accuracy < 85);
  const w1 = weak[0] || null;
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
  let showGuide = false;
  try { showGuide = !localStorage.getItem('nce-guide-dismissed'); } catch (e) { /* ignore */ }
  box.innerHTML =
    '<div class="home-grid">' +
    (showGuide
      ? `<div class="home-guide">
          <div class="hg-body">
            <div class="hg-title">👋 欢迎使用新概念英语练习系统</div>
            <p class="hg-line"><b>学</b>　教材、词典、听写预习　·　<b>练</b>　刷题、听写、句型转换</p>
            <p class="hg-line"><b>复习</b>　错题间隔复习、单词背诵　·　<b>我的</b>　统计、计划、备份</p>
            <p class="hg-tip">推荐路径：今日学习 → 教材学习 → 刷题练习 → 间隔复习</p>
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
             <div class="hc-sub">正确率 <b class="acc ${accClass(w1.accuracy)}">${w1.accuracy}%</b>（已练 ${w1.seen} 次），是你目前最薄弱的语法点${
               weak[1] ? `；其次是「${escapeHtml(weak[1].tag)}」（${weak[1].accuracy}%）` : ''
             }</div>
             <button class="btn primary" id="homeWeakBtn">专练 10 题 →</button>${trainingHint ? `<div class="hc-sub" style="margin-top:8px">${trainingHint}</div>` : ''}`
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
      </div>
    </div>` +
    '</div>';

  box.querySelectorAll('[data-goto]').forEach((el) => {
    el.onclick = () => gotoTab(el.dataset.goto);
  });
  const guideDismiss = $('homeGuideDismiss');
  if (guideDismiss) {
    guideDismiss.onclick = () => {
      try { localStorage.setItem('nce-guide-dismissed', '1'); } catch (e) { /* ignore */ }
      const g = box.querySelector('.home-guide');
      if (g) g.remove();
    };
  }
  // 薄弱专练：直接按最弱语法点组一组题
  const weakBtn = $('homeWeakBtn');
  if (weakBtn && w1) weakBtn.onclick = () => practiceGrammar(w1.tag);
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
    const runHomeDict = () => goToDictionary(homeDictQ.value, last ? last.book : '');
    homeDictBtn.onclick = runHomeDict;
    homeDictQ.onkeydown = (e) => { if (e.key === 'Enter') runHomeDict(); };
  }
  const dictQueueBtn = $('homeDictQueueBtn');
  if (dictQueueBtn) {
    dictQueueBtn.onclick = () => {
      NCE.pendingDictionary = { reviewQueue: true };
      gotoTab('dictionary');
    };
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
  const v = list.filter((l) => viewed.has(`${l.book}-${l.lesson}`)).length;
  const m = list.filter((l) => mastered.has(`${l.book}-${l.lesson}`)).length;
  box.querySelector('.tp-bar i').style.width = `${Math.round((v / list.length) * 100)}%`;
  box.querySelector('.tp-text').textContent = `已学 ${v} / ${list.length} 课${m ? ` · 已掌握 ${m} 课 ★` : ''}`;
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
    api('/api/lessons?book=' + book),
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
  data.lessons.forEach((l) => {
    const key = `${l.book}-${l.lesson}`;
    const item = document.createElement('div');
    item.className = 'toc-item' +
      (viewed.has(key) ? ' viewed' : '') +
      (mastered.has(key) ? ' mastered' : '');
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

// 渲染当前子页：orig=教材原文(用户录入) / mine=原创精读(AI)
function renderArticleView(l, which) {
  const view = $('articleView');
  if (!view) return;
  if (which === 'mine') {
    if (l.article && l.article.en) {
      view.innerHTML = `<div class="art-note">✍️ 原创精读短文（同主题、同语法、同核心词）· 点击单词或选中短语可查词典</div>` +
        renderPassage(l.article.en, l.article.cn);
    } else {
      view.innerHTML = `<div class="art-empty">本课原创精读短文即将补充。</div>`;
    }
  } else {
    const t = state.currentLessonText;
    if (t && t.en) {
      view.innerHTML = `<div class="art-note">📖 你录入的教材原文 <button class="btn ghost small" id="editTextBtn">编辑</button> · 点击单词或选中短语可查词典</div>` +
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
      // 正在朗读 → 停止；否则从头顺序连读全篇，读完由 speakLines 回调复位
      if (window.speechSynthesis && speechSynthesis.speaking) {
        speechSynthesis.cancel();
        resetRead();
        return;
      }
      const lines = Array.from(view.querySelectorAll('.passage .pl .spk')).map((s) => s.dataset.speak);
      readBtn.textContent = '⏹ 停止';
      speakLines(lines, resetRead);
    };
  }
  bindPassageLookup(view, l.book);
  bindPassageWords(view, l.book);
}

function bindArticle(l) {
  const tabs = $('lessonDetail').querySelectorAll('.art-tab');
  const hasOrig = !!(state.currentLessonText && state.currentLessonText.en);
  const hasMine = !!(l.article && l.article.en);
  let which = 'orig';
  if (!hasOrig && hasMine) which = 'mine';
  tabs.forEach((t) => {
    t.classList.toggle('on', t.dataset.at === which);
    t.onclick = () => {
      tabs.forEach((x) => x.classList.toggle('on', x === t));
      renderArticleView(l, t.dataset.at);
    };
  });
  renderArticleView(l, which);
}

async function openLesson(book, lesson, opts) {
  let l, starsRes, textRes;
  try {
    [l, starsRes, textRes] = await Promise.all([
      api(`/api/lesson/${book}/${lesson}`),
      api('/api/vocab/stars').catch(() => ({ words: [] })),
      api(`/api/lesson-text/${book}/${lesson}`).catch(() => ({ text: null })),
    ]);
  } catch (e) {
    return; // api() 已 toast 具体错误（如「该课程尚未收录」）
  }
  state.currentLesson = l;
  state.currentLessonText = (textRes && textRes.text) || null;
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
        <button class="art-tab on" data-at="orig">📖 教材原文</button>
        <button class="art-tab" data-at="mine">✍️ 原创精读</button>
      </div>
      <div class="article-view" id="articleView"></div>
    </div>` +
    `<div class="sec-title">📝 重点单词 <button class="btn ghost small" id="readAllWords">🔊 全部单词连读</button></div>` +
    `<div class="words-wrap"><table class="words"><tr><th>单词</th><th>词性</th><th>释义</th><th>例句（原创）</th></tr>${words}</table></div>` +
    `<div class="sec-title">📐 语法精讲</div>${grammar}` +
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

  // 「已掌握」按钮状态跟随当前课
  updateMasterBtn(l);

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
async function practiceGrammar(tag) {
  const byBook = (state.meta && state.meta.grammarByBook) || {};
  // 该语法点所在的册：优先当前选中的册，否则取第一个含它的册
  let book = (byBook[state.selectedBook] || []).includes(tag) ? state.selectedBook : null;
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
    el.title = b.subtitle + (n < 50 ? ' · 本册题量较少，持续扩充中' : '');
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
  const stem = `<div class="q-stem">${index + 1}. ${escapeHtml(q.stem)}</div>`;
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
    (r.correct ? '✅ 回答正确！' : `❌ 回答错误，正确答案：<b>${escapeHtml(ansText)}</b>`) +
    (r.explanation ? `<div class="r-exp">💡 ${escapeHtml(r.explanation)}</div>` : '');

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
      `<div class="r-stem">${escapeHtml(r.stem)}</div>` +
      `<div class="r-line">你的答案：<span class="${r.correct ? 'yes' : 'no'}">${escapeHtml(r.response || '（未作答）')}</span>` +
      (r.correct ? ' ✓' : ` ✗　正确答案：<span class="yes">${escapeHtml(answerText)}</span>`) +
      `</div>` +
      (r.explanation ? `<div class="r-exp">💡 ${escapeHtml(r.explanation)}</div>` : '');
    box.appendChild(card);
  });
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
