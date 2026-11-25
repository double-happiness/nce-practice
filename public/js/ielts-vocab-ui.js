'use strict';
// 雅思备考 · 词汇子页：按话题 / CEFR 浏览（显示掌握度）、卡片背诵、拼写、搭配练习、例句填空、雅思词汇诊断。
// 背诵复用 POST /api/words/rate（带 word/cn/eg/pos/phon，由后端存入 extras，掌握度与间隔复习共用），
// 拼写复用 POST /api/words/spell；诊断走 GET/POST /api/ielts/vocab-check（D2：不影响「总词汇量」成绩）。
// 搭配练习 / 例句填空每答一题也调 /api/words/rate（对 known、错 unknown），掌握度、间隔复习与今日「记」沿用同一套逻辑。
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE || !IE.registerPage) return;
  const esc = NCE.escapeHtml;
  const escAttr = NCE.escapeAttr || esc;

  const TOPIC_LABEL = {
    academic: '学术通用', education: '教育', environment: '环境', technology: '科技', health: '健康',
    work: '工作', crime: '犯罪', media: '媒体', urban: '城市', globalization: '全球化',
    government: '政府', culture: '文化', science: '科学',
  };
  const CEFR_LIST = ['B1', 'B2', 'C1', 'C2'];
  const CHECK_BANDS = ['B1', 'B2', 'C1'];
  const LV_NAME = ['未学', '学习中', '熟悉', '已掌握'];
  const PAGE_SIZE = 50;
  const POOL_SIZE = 20;
  const DRILL_SIZE = 10; // 搭配练习 / 例句填空每轮题数
  const SCOPE_PAGE = 500; // /api/ielts/vocab 单次 limit 上限
  const SCOPE_MAX = 3000; // 练习范围分页拉取的兜底上限

  const style = document.createElement('style');
  style.textContent = `
    .iev-modes{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
    .iev-filters{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
    .iev-filters .ie-row{gap:8px}
    .iev-filters .chip{padding:6px 13px}
    .iev-q{flex:1;min-width:160px;max-width:280px}
    .iev-count{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin-bottom:10px}
    .iev-count .sp{flex:1}
    .iev-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
    .iev-item{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card);padding:10px 12px;cursor:pointer}
    .iev-item:hover{border-color:var(--brand)}
    .iev-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
    .iev-word{font-size:16px;font-weight:700;color:var(--ink)}
    .iev-phon{font-size:13px;color:var(--muted)}
    .iev-pos{font-size:13px;color:var(--brand);font-weight:600}
    .iev-cn{flex:1;min-width:120px;font-size:14px;color:var(--ink-soft)}
    .iev-topic{font-size:12px;color:var(--muted)}
    .iev-lv{font-size:12px;padding:2px 8px;border-radius:999px;white-space:nowrap;font-weight:600}
    .iev-lv0{background:rgba(127,127,127,.14);color:var(--muted)}
    .iev-lv1{background:rgba(245,158,11,.15);color:#d97706}
    .iev-lv2{background:rgba(59,130,246,.15);color:#3b82f6}
    .iev-lv3{background:rgba(22,163,74,.14);color:var(--ok)}
    .iev-detail{margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:13.5px;color:var(--ink-soft);line-height:1.7}
    .iev-detail .cn2{color:var(--muted)}
    .iev-detail .col{margin-top:4px;color:var(--muted)}
    .iev-detail .btn{margin-top:6px}
    .iev-more{text-align:center;margin-top:12px}
    .iev-card{border:1px solid var(--border);border-radius:var(--radius);padding:30px 22px;min-height:200px;background:var(--accent-grad-soft);cursor:pointer;text-align:center;display:flex;flex-direction:column;justify-content:center;gap:10px}
    .iev-card .w{font-size:34px;font-weight:800;color:var(--ink);word-break:break-word}
    .iev-card .ph{font-size:16px;color:var(--muted)}
    .iev-card .ps{font-size:14px;color:var(--brand);font-weight:700}
    .iev-card .cn{font-size:21px;color:var(--ink)}
    .iev-card .eg{font-size:15px;color:var(--ink-soft);line-height:1.6}
    .iev-card .eg2{font-size:13px;color:var(--muted)}
    .iev-card .hint{font-size:12px;color:var(--muted)}
    .iev-rate{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}
    .iev-rate .btn.known{border-color:rgba(22,163,74,.5);color:var(--ok)}
    .iev-rate .btn.vague{border-color:rgba(245,158,11,.55);color:#d97706}
    .iev-rate .btn.unknown{border-color:rgba(220,38,38,.45);color:var(--bad)}
    .iev-prog{text-align:center;font-size:13px;color:var(--muted);margin-top:10px}
    .iev-spell-cn{font-size:22px;font-weight:700;color:var(--ink);text-align:center;margin:8px 0}
    .iev-spell-hint{font-size:13px;color:var(--muted);text-align:center;margin-bottom:12px}
    .iev-spell-input{width:100%;font-size:18px;text-align:center;padding:12px}
    .iev-fb{text-align:center;font-size:15px;margin:12px 0;min-height:22px}
    .iev-fb.ok{color:var(--ok)}
    .iev-fb.bad{color:var(--bad)}
    .iev-q-word{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:6px 0 14px}
    .iev-q-word b{font-size:32px;font-weight:800;color:var(--ink);word-break:break-word}
    .iev-opts{display:flex;flex-direction:column;gap:8px}
    .iev-opt{text-align:left;padding:11px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card);color:var(--ink);cursor:pointer;font-size:15px;font-family:inherit}
    .iev-opt:hover{border-color:var(--brand)}
    .iev-opt .k{display:inline-block;width:22px;color:var(--muted);font-size:13px}
    .iev-opt.skip{color:var(--muted);border-style:dashed}
    .iev-big{font-size:44px;font-weight:900;color:var(--brand);text-align:center;line-height:1.1}
    .iev-big-sub{text-align:center;font-size:13px;color:var(--muted);margin:4px 0 14px}
    .iev-band{margin:10px 0}
    .iev-band .lab{display:flex;justify-content:space-between;font-size:13px;color:var(--ink-soft);margin-bottom:4px}
    .iev-bar{height:12px;border-radius:999px;background:rgba(127,127,127,.16);overflow:hidden}
    .iev-bar i{display:block;height:100%;background:var(--accent-grad)}
    .iev-wrong{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
    .iev-wrong li{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;font-size:14px;padding:7px 10px;border:1px solid rgba(220,38,38,.22);border-radius:8px;background:rgba(220,38,38,.04)}
    .iev-wrong .w{font-weight:700;color:var(--ink)}
    .iev-wrong .a{color:var(--ok)}
    .iev-wrong .c{color:var(--muted);font-size:12.5px}
    .iev-drill-head{display:flex;justify-content:space-between;gap:4px 10px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin-bottom:8px}
    .iev-drill-q{font-size:22px;font-weight:700;color:var(--ink);line-height:1.5;text-align:center;margin:10px 0 6px;overflow-wrap:anywhere}
    .iev-drill-hint{font-size:14px;color:var(--ink-soft);line-height:1.6;text-align:center;margin-bottom:14px;overflow-wrap:anywhere}
    .iev-drill-hint .m{display:block;font-size:12.5px;color:var(--muted)}
    .iev-drill-q.sent{font-size:17px;font-weight:500;line-height:1.8;text-align:left}
    .iev-drill-hint.sent{text-align:left}
    .iev-blank{color:var(--brand);font-weight:700;white-space:nowrap}
    .iev-hl{color:var(--brand);font-weight:700}
    .iev-drill-row{display:flex;gap:8px;flex-wrap:wrap}
    .iev-drill-input{flex:1 1 180px;min-width:0;font-size:17px;padding:11px 12px}
    .iev-opt:disabled{cursor:default}
    .iev-opt.ok{border-color:var(--ok);color:var(--ok);background:rgba(22,163,74,.08)}
    .iev-opt.bad{border-color:var(--bad);color:var(--bad);background:rgba(220,38,38,.06)}
    .iev-drill-fb{margin-top:14px;padding:12px 14px;border:1px dashed var(--border);border-radius:var(--radius-sm);font-size:14px;color:var(--ink-soft);line-height:1.75;overflow-wrap:anywhere}
    .iev-drill-fb .r{font-size:15px;font-weight:700}
    .iev-drill-fb .r.ok{color:var(--ok)}
    .iev-drill-fb .r.bad{color:var(--bad)}
    .iev-drill-fb .cn2{color:var(--muted)}
    .iev-drill-fb .btn{margin-top:10px}
  `;
  document.head.appendChild(style);

  const st = {
    mode: 'browse', // browse | flash | spell | check | DRILLS 里的练习模式（colloc / cloze）
    topic: '',
    cefr: '',
    q: '',
    topics: [],
    items: [],
    total: 0,
    listSeq: 0,
    flash: { words: [], idx: 0, flipped: false, rated: 0, busy: false },
    spell: { pool: [], cur: null, right: 0, wrong: 0, unsynced: 0, timer: null, warned: false },
    check: { quiz: null, idx: 0, answers: [], result: null },
    // 练习引擎（搭配练习 / 例句填空）：每轮换一个新对象，异步回调用对象身份判断是否还是当前这一轮
    drill: { mode: '', scope: [], questions: [], idx: 0, right: 0, wrong: [], retry: false, unsynced: 0, warned: false, finished: false },
  };
  let root = null;
  let ctx = null;
  let searchTimer = null;

  function topicLabel(key, fallback) {
    return TOPIC_LABEL[key] || fallback || key || '';
  }
  function levelOf(w) {
    const n = Number(w && w.level);
    return Number.isInteger(n) && n >= 0 && n <= 3 ? n : 0;
  }
  function lvBadge(w) {
    const lv = levelOf(w);
    return `<span class="iev-lv iev-lv${lv}">${LV_NAME[lv]}</span>`;
  }
  function spk(text) {
    return text ? `<span class="spk iev-spk" data-speak="${escAttr(text)}" title="朗读">🔊</span>` : '';
  }
  function bindSpk(el) {
    el.querySelectorAll('.iev-spk').forEach((s) => {
      s.onclick = (e) => {
        e.stopPropagation();
        NCE.speak(s.dataset.speak);
      };
    });
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function listUrl(limit, offset) {
    const p = new URLSearchParams();
    if (st.topic) p.set('topic', st.topic);
    if (st.cefr) p.set('cefr', st.cefr);
    if (st.q) p.set('q', st.q);
    p.set('limit', String(limit));
    p.set('offset', String(offset));
    return '/api/ielts/vocab?' + p.toString();
  }
  function clearSpellTimer() {
    if (st.spell.timer) {
      clearTimeout(st.spell.timer);
      st.spell.timer = null;
    }
  }
  function alive() {
    return ctx && ctx.isActive();
  }

  // ---------- 框架 ----------
  function render(body, c) {
    root = body;
    ctx = c;
    clearSpellTimer();
    body.innerHTML =
      '<div class="iev-modes">' +
      '<button type="button" class="btn small" data-m="browse">📚 浏览</button>' +
      '<button type="button" class="btn small" data-m="flash">🃏 背诵</button>' +
      '<button type="button" class="btn small" data-m="spell">✍️ 拼写</button>' +
      '<button type="button" class="btn small" data-m="colloc">🔗 搭配练习</button>' +
      '<button type="button" class="btn small" data-m="cloze">📝 例句填空</button>' +
      '<button type="button" class="btn small" data-m="check">🩺 词汇诊断</button>' +
      '</div>' +
      '<div class="iev-filters"></div>' +
      '<div class="iev-body"></div>';
    body.querySelectorAll('.iev-modes [data-m]').forEach((b) => {
      b.onclick = () => switchMode(b.dataset.m);
    });
    renderFilters();
    switchMode(st.mode);
  }

  // flashWords：切到背诵时直接背这组词（练习错词「去背诵」入口），不传则按筛选抽词
  function switchMode(mode, flashWords) {
    if (!root) return;
    clearSpellTimer();
    st.mode = mode;
    root.querySelectorAll('.iev-modes [data-m]').forEach((b) => b.classList.toggle('primary', b.dataset.m === mode));
    root.querySelector('.iev-filters').classList.toggle('hidden', mode === 'check');
    const box = root.querySelector('.iev-body');
    if (mode === 'flash') startFlash(box, flashWords);
    else if (mode === 'spell') startSpell(box);
    else if (Object.prototype.hasOwnProperty.call(DRILLS, mode)) startDrill(box, mode);
    else if (mode === 'check') renderCheckIntro(box);
    else loadList(true);
  }

  // ---------- 筛选 ----------
  function topicOptionsHtml() {
    const fromApi = Array.isArray(st.topics) && st.topics.length
      ? st.topics.map((t) => ({ key: t.key, label: topicLabel(t.key, t.label), count: t.count }))
      : Object.keys(TOPIC_LABEL).map((k) => ({ key: k, label: TOPIC_LABEL[k], count: null }));
    return (
      `<option value="">全部话题</option>` +
      fromApi.map((t) =>
        `<option value="${escAttr(t.key)}"${t.key === st.topic ? ' selected' : ''}>${esc(t.label)}${t.count != null ? `（${Number(t.count) || 0}）` : ''}</option>`
      ).join('')
    );
  }

  function renderFilters() {
    const box = root.querySelector('.iev-filters');
    box.innerHTML =
      '<div class="ie-row">' +
      `<select class="iev-topic-sel" aria-label="话题">${topicOptionsHtml()}</select>` +
      `<input type="search" class="ie-input iev-q" placeholder="搜单词或中文…" value="${escAttr(st.q)}" maxlength="50" autocomplete="off">` +
      '</div>' +
      '<div class="ie-row chips iev-cefr">' +
      `<div class="chip${st.cefr ? '' : ' active'}" data-c="">全部级别</div>` +
      CEFR_LIST.map((c) => `<div class="chip${st.cefr === c ? ' active' : ''}" data-c="${c}">${c}</div>`).join('') +
      '</div>';
    box.querySelector('.iev-topic-sel').onchange = (e) => {
      st.topic = e.target.value;
      onFilterChange();
    };
    box.querySelectorAll('.iev-cefr .chip').forEach((chip) => {
      chip.onclick = () => {
        st.cefr = chip.dataset.c;
        box.querySelectorAll('.iev-cefr .chip').forEach((x) => x.classList.toggle('active', x === chip));
        onFilterChange();
      };
    });
    const q = box.querySelector('.iev-q');
    q.oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        st.q = q.value.trim();
        onFilterChange();
      }, 350);
    };
  }

  function refreshTopicOptions() {
    const sel = root && root.querySelector('.iev-topic-sel');
    if (sel) sel.innerHTML = topicOptionsHtml();
  }

  function onFilterChange() {
    if (!alive()) return;
    switchMode(st.mode === 'check' ? 'browse' : st.mode);
  }

  // ---------- 浏览 ----------
  function itemHtml(w, i) {
    const cols = Array.isArray(w.collocations) ? w.collocations.filter(Boolean) : [];
    return (
      `<li class="iev-item" data-i="${i}">` +
      '<div class="iev-row">' +
      `<span class="iev-word">${esc(w.word)}</span>${spk(w.word)}` +
      (w.phon ? `<span class="iev-phon">${esc(w.phon)}</span>` : '') +
      (w.pos ? `<span class="iev-pos">${esc(w.pos)}</span>` : '') +
      `<span class="iev-cn">${esc(w.cn || '')}</span>` +
      (w.cefr ? `<span class="ie-pill">${esc(w.cefr)}</span>` : '') +
      (w.topic ? `<span class="iev-topic">${esc(topicLabel(w.topic))}</span>` : '') +
      lvBadge(w) +
      '</div>' +
      '<div class="iev-detail hidden">' +
      (w.eg ? `<div>${esc(w.eg)} ${spk(w.eg)}</div>` : '') +
      (w.egCn ? `<div class="cn2">${esc(w.egCn)}</div>` : '') +
      (cols.length ? `<div class="col">搭配：${cols.map((c) => esc(c)).join(' · ')}</div>` : '') +
      '<button type="button" class="btn small iev-dict">📕 查词典</button>' +
      '</div>' +
      '</li>'
    );
  }

  async function loadList(reset) {
    const box = root.querySelector('.iev-body');
    if (reset) {
      st.items = [];
      st.total = 0;
      box.innerHTML = '<div class="ie-loading">正在加载雅思词汇…</div>';
    }
    const seq = ++st.listSeq;
    let r;
    try {
      r = await IE.get(listUrl(PAGE_SIZE, st.items.length));
    } catch (e) {
      if (seq !== st.listSeq || !alive()) return;
      box.innerHTML = IE.errorHtml('雅思词汇加载失败', e);
      IE.bindRetry(box, () => loadList(true));
      return;
    }
    if (seq !== st.listSeq || !alive() || st.mode !== 'browse') return;
    // 话题计数随 cefr / q 筛选变化，每次都用最新返回的 topics 刷新下拉框
    if (Array.isArray(r.topics) && r.topics.length) {
      st.topics = r.topics;
      refreshTopicOptions();
    }
    st.total = Number(r.total) || 0;
    st.items = st.items.concat(Array.isArray(r.items) ? r.items : []);
    paintList(box);
  }

  function paintList(box) {
    if (!st.items.length) {
      box.innerHTML = '<div class="ie-empty">没有符合条件的词。换个话题、级别或关键词试试。</div>';
      return;
    }
    const mastered = st.items.filter((w) => levelOf(w) === 3).length;
    const learning = st.items.filter((w) => levelOf(w) === 1 || levelOf(w) === 2).length;
    box.innerHTML =
      '<div class="iev-count">' +
      `<span>共 ${st.total} 词，已加载 ${st.items.length} · 其中已掌握 ${mastered}、学习中 ${learning}</span><span class="sp"></span>` +
      '<button type="button" class="btn small primary iev-go-flash">🃏 背这组</button>' +
      '<button type="button" class="btn small iev-go-spell">✍️ 拼这组</button>' +
      '</div>' +
      `<ul class="iev-list">${st.items.map(itemHtml).join('')}</ul>` +
      (st.items.length < st.total ? '<div class="iev-more"><button type="button" class="btn small iev-more-btn">加载更多</button></div>' : '');
    bindSpk(box);
    box.querySelector('.iev-go-flash').onclick = () => switchMode('flash');
    box.querySelector('.iev-go-spell').onclick = () => switchMode('spell');
    box.querySelectorAll('.iev-item').forEach((li) => {
      li.onclick = () => li.querySelector('.iev-detail').classList.toggle('hidden');
    });
    box.querySelectorAll('.iev-dict').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const w = st.items[Number(b.closest('.iev-item').dataset.i)];
        if (w && NCE.goToDictionary) NCE.goToDictionary(w.word, '');
      };
    });
    const more = box.querySelector('.iev-more-btn');
    if (more) {
      more.onclick = () => {
        more.disabled = true;
        more.textContent = '加载中…';
        loadList(false);
      };
    }
  }

  // 背诵 / 拼写的词池：按当前筛选取一批，优先未掌握的，随机 20 个
  async function loadPool(box) {
    box.innerHTML = '<div class="ie-loading">正在组词…</div>';
    const seq = ++st.listSeq;
    let r;
    try {
      r = await IE.get(listUrl(200, 0));
    } catch (e) {
      if (seq === st.listSeq && alive()) {
        box.innerHTML = IE.errorHtml('雅思词汇加载失败', e);
        IE.bindRetry(box, () => switchMode(st.mode));
      }
      return null;
    }
    if (seq !== st.listSeq || !alive()) return null;
    if (Array.isArray(r.topics) && r.topics.length) {
      st.topics = r.topics;
      refreshTopicOptions();
    }
    const items = (Array.isArray(r.items) ? r.items : []).filter((w) => w && w.word);
    return shuffle(items.filter((w) => levelOf(w) < 3)).slice(0, POOL_SIZE);
  }

  function emptyPoolHtml() {
    return '<div class="ie-empty">这一组词都已掌握 🎉<br>换个话题或级别，或去「浏览」看看全部词。</div>';
  }

  // ---------- 背诵 ----------
  async function startFlash(box, preset) {
    let words;
    if (Array.isArray(preset) && preset.length) {
      st.listSeq++; // 作废还在路上的抽词请求
      words = preset.slice();
    } else {
      words = await loadPool(box);
    }
    if (!words || st.mode !== 'flash') return;
    if (!words.length) {
      box.innerHTML = emptyPoolHtml();
      return;
    }
    Object.assign(st.flash, { words, idx: 0, flipped: false, rated: 0, busy: false });
    box.innerHTML =
      '<div class="iev-card" tabindex="0"></div>' +
      '<div class="iev-rate">' +
      '<button type="button" class="btn known" data-r="known">✓ 认识</button>' +
      '<button type="button" class="btn vague" data-r="vague">～ 模糊</button>' +
      '<button type="button" class="btn unknown" data-r="unknown">✗ 不认识</button>' +
      '</div>' +
      '<div class="iev-prog"></div>';
    const card = box.querySelector('.iev-card');
    card.onclick = () => {
      st.flash.flipped = !st.flash.flipped;
      paintFlash(box);
    };
    box.querySelectorAll('.iev-rate .btn').forEach((b) => {
      b.onclick = () => rateFlash(box, b.dataset.r);
    });
    paintFlash(box);
  }

  function paintFlash(box) {
    const s = st.flash;
    const w = s.words[s.idx];
    const card = box.querySelector('.iev-card');
    if (!card || !w) return;
    if (!s.flipped) {
      card.innerHTML =
        `<div class="w">${esc(w.word)} ${spk(w.word)}</div>` +
        (w.phon ? `<div class="ph">${esc(w.phon)}</div>` : '') +
        `<div class="hint">${esc([w.cefr, topicLabel(w.topic)].filter(Boolean).join(' · '))} · 点击卡片看释义</div>`;
    } else {
      const cols = Array.isArray(w.collocations) ? w.collocations.filter(Boolean) : [];
      card.innerHTML =
        `<div class="w" style="font-size:22px">${esc(w.word)}</div>` +
        (w.pos ? `<div class="ps">${esc(w.pos)}</div>` : '') +
        `<div class="cn">${esc(w.cn || '')}</div>` +
        (w.eg ? `<div class="eg">${esc(w.eg)} ${spk(w.eg)}</div>` : '') +
        (w.egCn ? `<div class="eg2">${esc(w.egCn)}</div>` : '') +
        (cols.length ? `<div class="eg2">搭配：${cols.map((c) => esc(c)).join(' · ')}</div>` : '');
    }
    bindSpk(card);
    box.querySelector('.iev-prog').textContent = `第 ${s.idx + 1} / ${s.words.length} 张 · 本轮已评 ${s.rated} · 当前掌握度：${LV_NAME[levelOf(w)]}`;
  }

  async function rateFlash(box, rating) {
    const s = st.flash;
    const w = s.words[s.idx];
    if (!w || s.busy) return;
    s.busy = true;
    box.querySelectorAll('.iev-rate .btn').forEach((b) => { b.disabled = true; });
    let r;
    try {
      // 带上释义等字段，后端存入 words.json 的 extras，查词典 / 间隔复习可复用
      r = await IE.post('/api/words/rate', { word: w.word, rating, cn: w.cn, eg: w.eg, pos: w.pos, phon: w.phon });
    } catch (e) {
      s.busy = false;
      box.querySelectorAll('.iev-rate .btn').forEach((b) => { b.disabled = false; });
      return; // 请求层已提示，停在本卡可重试
    }
    s.busy = false;
    if (!alive() || st.mode !== 'flash') return;
    if (r && Number.isInteger(r.level)) w.level = r.level;
    s.rated++;
    if (s.idx >= s.words.length - 1) {
      box.innerHTML =
        `<div class="ie-empty">本轮完成！共背了 <b>${s.words.length}</b> 张卡片。<br>` +
        '<button type="button" class="btn primary small iev-again" style="margin-top:12px">再来一组</button> ' +
        '<button type="button" class="btn small iev-to-spell" style="margin-top:12px">✍️ 拼写巩固</button></div>';
      box.querySelector('.iev-again').onclick = () => startFlash(box);
      box.querySelector('.iev-to-spell').onclick = () => switchMode('spell');
      return;
    }
    s.idx++;
    s.flipped = false;
    box.querySelectorAll('.iev-rate .btn').forEach((b) => { b.disabled = false; });
    paintFlash(box);
  }

  // ---------- 拼写 ----------
  async function startSpell(box) {
    const pool = await loadPool(box);
    if (!pool || st.mode !== 'spell') return;
    if (!pool.length) {
      box.innerHTML = emptyPoolHtml();
      return;
    }
    Object.assign(st.spell, { pool, cur: null, right: 0, wrong: 0, unsynced: 0, warned: false });
    box.innerHTML =
      '<div class="iev-spell-cn"></div>' +
      '<div class="iev-spell-hint"></div>' +
      '<input type="text" class="ie-input iev-spell-input" placeholder="拼写这个单词，回车提交" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<div class="iev-fb"></div>' +
      '<div class="iev-prog"></div>';
    box.querySelector('.iev-spell-input').onkeydown = (e) => {
      if (e.key === 'Enter') checkSpell(box);
    };
    nextSpell(box);
  }

  function spellScore() {
    const s = st.spell;
    const total = s.right + s.wrong;
    return `对 ${s.right} · 错 ${s.wrong}${total ? ` · 正确率 ${Math.round((s.right / total) * 100)}%` : ''} · 剩余 ${s.pool.length}` +
      (s.unsynced ? ` · ${s.unsynced} 题未同步` : '');
  }

  function nextSpell(box) {
    const s = st.spell;
    const input = box.querySelector('.iev-spell-input');
    if (!input) return;
    if (!s.pool.length) {
      s.cur = null;
      box.querySelector('.iev-spell-cn').textContent = '本轮拼写完成！';
      box.querySelector('.iev-spell-hint').innerHTML = '<button type="button" class="btn small primary iev-again">再来一组</button>';
      box.querySelector('.iev-again').onclick = () => startSpell(box);
      input.disabled = true;
      box.querySelector('.iev-prog').textContent = spellScore();
      return;
    }
    s.cur = s.pool.shift();
    const w = s.cur;
    box.querySelector('.iev-spell-cn').innerHTML = `${esc(w.cn || '')} ${spk(w.word)}`;
    box.querySelector('.iev-spell-hint').textContent = [w.pos, w.cefr, topicLabel(w.topic)].filter(Boolean).join(' · ') || '根据中文拼写英文';
    bindSpk(box.querySelector('.iev-spell-cn'));
    input.disabled = false;
    input.value = '';
    input.focus();
    box.querySelector('.iev-prog').textContent = spellScore();
  }

  async function checkSpell(box) {
    const s = st.spell;
    const w = s.cur;
    const input = box.querySelector('.iev-spell-input');
    if (!w || !input || input.disabled) return;
    const guess = input.value.trim();
    if (!guess) return;
    input.disabled = true;
    let r;
    try {
      r = await IE.post('/api/words/spell', { word: w.word, input: guess }, { quiet: true });
    } catch (e) {
      // 服务不可用时本地判对错，继续练，但不计入掌握度
      s.unsynced++;
      if (!s.warned) {
        s.warned = true;
        NCE.toast('拼写结果没能保存（' + e.message + '），本轮继续练习但不计入掌握度', 'warn');
      }
      r = { correct: guess.toLowerCase() === String(w.word).trim().toLowerCase(), answer: w.word };
    }
    if (!alive() || st.mode !== 'spell') return;
    if (r && Number.isInteger(r.level)) w.level = r.level;
    const fb = box.querySelector('.iev-fb');
    if (r.correct) {
      s.right++;
      fb.className = 'iev-fb ok';
      fb.textContent = `✓ 正确！${r.answer || w.word}`;
    } else {
      s.wrong++;
      fb.className = 'iev-fb bad';
      fb.innerHTML = `✗ 正确拼写：<b>${esc(r.answer || w.word)}</b>`;
    }
    box.querySelector('.iev-prog').textContent = spellScore();
    clearSpellTimer();
    st.spell.timer = setTimeout(() => {
      st.spell.timer = null;
      if (!alive() || st.mode !== 'spell') return;
      fb.className = 'iev-fb';
      fb.textContent = '';
      nextSpell(box);
    }, r.correct ? 900 : 1600);
  }

  // ---------- 挖空匹配：在搭配 / 例句里找目标词（含屈折形式）----------
  // 规则屈折按词性生成，宁可多生成（commit→commited 这类不存在的拼写不会在文本里出现），不规则形式查表
  const IRREGULAR_VERB = {
    be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'], have: ['has', 'had', 'having'], do: ['does', 'did', 'done', 'doing'],
    arise: ['arose', 'arisen'], become: ['became'], begin: ['began', 'begun'], break: ['broke', 'broken'], bring: ['brought'],
    build: ['built'], buy: ['bought'], catch: ['caught'], choose: ['chose', 'chosen'], come: ['came'], deal: ['dealt'],
    draw: ['drew', 'drawn'], drive: ['drove', 'driven'], fall: ['fell', 'fallen'], feel: ['felt'], find: ['found'],
    get: ['got', 'gotten'], give: ['gave', 'given'], go: ['went', 'gone'], grow: ['grew', 'grown'], hold: ['held'],
    keep: ['kept'], know: ['knew', 'known'], lead: ['led'], leave: ['left'], lose: ['lost'], make: ['made'], mean: ['meant'],
    meet: ['met'], overcome: ['overcame'], pay: ['paid'], prove: ['proven'], rise: ['rose', 'risen'], run: ['ran'],
    say: ['said'], see: ['saw', 'seen'], seek: ['sought'], sell: ['sold'], send: ['sent'], speak: ['spoke', 'spoken'],
    spend: ['spent'], stand: ['stood'], take: ['took', 'taken'], teach: ['taught'], tell: ['told'], think: ['thought'],
    throw: ['threw', 'thrown'], undergo: ['underwent', 'undergone'], understand: ['understood'],
    undertake: ['undertook', 'undertaken'], win: ['won'], withdraw: ['withdrew', 'withdrawn'], write: ['wrote', 'written'],
  };
  const IRREGULAR_NOUN = {
    analysis: ['analyses'], basis: ['bases'], child: ['children'], crisis: ['crises'], criterion: ['criteria'],
    hypothesis: ['hypotheses'], man: ['men'], medium: ['media'], person: ['people'], phenomenon: ['phenomena'],
    thesis: ['theses'], woman: ['women'],
  };
  // 词内字符：字母、数字、连字符。目标词前后紧挨这些字符就不算命中（start 里的 art、single-use 里的 use 都不挖）
  const WORD_CHARS = 'A-Za-z0-9\\u00C0-\\u024F';

  function normAnswer(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  }
  // 末尾「辅元辅」（末辅音不是 w/x/y）时可能双写：commit→committed、big→bigger
  function doubledStem(w) {
    return /[^aeiou][aeiou][b-df-hj-np-tvz]$/.test(w) ? w + w.slice(-1) : null;
  }
  function pluralForms(w) {
    const out = [w + 's'];
    if (/(s|x|z|ch|sh|o)$/.test(w)) out.push(w + 'es');
    if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + 'ies');
    if (/fe$/.test(w)) out.push(w.slice(0, -2) + 'ves');
    else if (/f$/.test(w)) out.push(w.slice(0, -1) + 'ves');
    return out.concat(IRREGULAR_NOUN[w] || []);
  }
  function verbForms(w) {
    const out = pluralForms(w); // 三单与名词复数同规则
    if (/e$/.test(w)) out.push(w + 'd');
    else if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + 'ied');
    else out.push(w + 'ed');
    if (/ie$/.test(w)) out.push(w.slice(0, -2) + 'ying');
    else if (/[^eoy]e$/.test(w)) out.push(w.slice(0, -1) + 'ing');
    out.push(w + 'ing');
    const d = doubledStem(w);
    if (d) out.push(d + 'ed', d + 'ing');
    return out.concat(IRREGULAR_VERB[w] || []);
  }
  function adjForms(w) {
    const out = [];
    if (/e$/.test(w)) out.push(w + 'r', w + 'st');
    else if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + 'ier', w.slice(0, -1) + 'iest');
    else out.push(w + 'er', w + 'est');
    const d = doubledStem(w);
    if (d) out.push(d + 'er', d + 'est');
    return out;
  }
  // 目标词的全部候选形式（小写，长的在前）
  function wordForms(word, pos) {
    const base = normAnswer(word);
    if (!base) return [];
    const p = String(pos || '');
    const forms = new Set([base]);
    const parts = base.split(' ');
    if (parts.length === 1) {
      if (/adj/.test(p)) adjForms(base).forEach((f) => forms.add(f));
      // 名词 / 动词 / 短语 / 未标词性：复数与动词屈折都试（词表里不少名词在例句里作动词用）
      else if (!/adv|conj|prep/.test(p)) verbForms(base).forEach((f) => forms.add(f));
    } else {
      const rest = parts.slice(1).join(' ');
      const head = parts.slice(0, -1).join(' ');
      // 动词短语变首词（drop out → dropped out），名词短语变末词（fossil fuel → fossil fuels）
      if (!p || /(^|[^a-z])v\.|phr/.test(p)) verbForms(parts[0]).forEach((f) => forms.add(f + ' ' + rest));
      if (!/adv|conj|prep/.test(p)) pluralForms(parts[parts.length - 1]).forEach((f) => forms.add(head + ' ' + f));
    }
    return [...forms].sort((a, b) => b.length - a.length);
  }
  function escRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  // 按词边界找目标词在 text 里的所有出现，返回 [{ start, text }]（text 为原文里的实际写法）
  function findBlanks(text, word, pos) {
    const src = typeof text === 'string' ? text : '';
    const forms = wordForms(word, pos);
    if (!src || !forms.length) return [];
    const alt = forms.map((f) => escRegExp(f).replace(/ /g, '\\s+')).join('|');
    const re = new RegExp(`(^|[^${WORD_CHARS}-])(${alt})(?![${WORD_CHARS}-])`, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(src))) out.push({ start: m.index + m[1].length, text: m[2] });
    return out;
  }
  // 按命中位置把文本切成段：{ text, blank }
  function splitBlanks(text, blanks) {
    const segs = [];
    let at = 0;
    for (const b of blanks) {
      if (b.start > at) segs.push({ text: text.slice(at, b.start), blank: false });
      segs.push({ text: b.text, blank: true });
      at = b.start + b.text.length;
    }
    if (at < text.length) segs.push({ text: text.slice(at), blank: false });
    return segs;
  }
  // reveal=false 显示空格，true 高亮原词
  function segsHtml(segs, reveal) {
    return segs.map((s) => {
      if (!s.blank) return esc(s.text);
      return reveal ? `<span class="iev-hl">${esc(s.text)}</span>` : '<span class="iev-blank">____</span>';
    }).join('');
  }
  function highlightHtml(text, w) {
    return segsHtml(splitBlanks(text, findBlanks(text, w.word, w.pos)), true);
  }
  // 题目对象的公共部分：判分接受原形 + 文本里实际出现的形式
  function blankQuestion(w, mode, source, blanks) {
    const forms = blanks.map((b) => b.text);
    return {
      w,
      mode,
      source,
      segs: splitBlanks(source, blanks),
      form: forms[0],
      answers: [...new Set([normAnswer(w.word)].concat(forms.map(normAnswer)))],
      alts: [], // 额外算对的同释义词（只有搭配练习用）
      type: 'input',
      options: null,
      done: false,
    };
  }

  // ---------- 搭配练习 ----------
  // 四选一干扰项：同词性的其他词；跳过填进空里恰好构成它自己搭配的词，以及本身就是正确答案某种形式的词
  function collocOptions(q, scope) {
    const key = normAnswer(q.w.word);
    const pos = String(q.w.pos || '');
    const used = new Set([key]);
    const picks = [];
    for (const d of shuffle(scope)) {
      if (picks.length >= 3) break;
      const dk = normAnswer(d && d.word);
      if (!dk || used.has(dk) || q.answers.includes(dk) || String(d.pos || '') !== pos) continue;
      const filled = normAnswer(q.segs.map((s) => (s.blank ? d.word : s.text)).join(''));
      if ((Array.isArray(d.collocations) ? d.collocations : []).some((c) => normAnswer(c) === filled)) continue;
      used.add(dk);
      picks.push(d.word);
    }
    return picks.length === 3 ? shuffle([q.w.word].concat(picks)) : null;
  }

  function sameMeaningWords(w, scope) {
    const cn = String(w.cn || '').trim();
    const key = normAnswer(w.word);
    if (!cn) return [];
    return scope
      .filter((d) => d && d.word && String(d.cn || '').trim() === cn && normAnswer(d.word) !== key)
      .map((d) => normAnswer(d.word));
  }

  // order 为本轮题号：偶数题四选一、奇数题输入；同词性干扰项凑不够 3 个时退回输入
  function buildCollocQuestion(w, order, scope) {
    const cols = (Array.isArray(w.collocations) ? w.collocations : []).filter((c) => typeof c === 'string' && c.trim());
    for (const c of shuffle(cols)) {
      const blanks = findBlanks(c, w.word, w.pos);
      if (!blanks.length) continue;
      const q = blankQuestion(w, 'colloc', c, blanks);
      // 挖完只剩空格的搭配（搭配就是词本身）出不了题
      if (!q.segs.some((s) => !s.blank && /[A-Za-z]/.test(s.text))) continue;
      // 提示是中文释义：释义完全相同的词（moreover / furthermore）填进来也算对，也不拿来当干扰项
      q.alts = sameMeaningWords(w, scope);
      q.answers = [...new Set(q.answers.concat(q.alts))];
      if (order % 2 === 0) {
        const opts = collocOptions(q, scope);
        if (opts) {
          q.type = 'choice';
          q.options = opts;
        }
      }
      return q;
    }
    return null;
  }

  function collocPromptHtml(q) {
    const w = q.w;
    const baseNote = q.type === 'choice' && normAnswer(q.form) !== normAnswer(w.word) ? ' · 选项为原形' : '';
    return (
      `<div class="iev-drill-q">${segsHtml(q.segs, false)}</div>` +
      `<div class="iev-drill-hint">提示：${esc(w.cn || '')}` +
      `<span class="m">${esc([w.pos, w.cefr, topicLabel(w.topic)].filter(Boolean).join(' · '))}${baseNote}</span></div>`
    );
  }

  function collocRevealHtml(q) {
    const w = q.w;
    return (
      `<div>搭配：${segsHtml(q.segs, true)} ${spk(q.source)}</div>` +
      (w.eg ? `<div>${highlightHtml(w.eg, w)} ${spk(w.eg)}</div>` : '') +
      (w.egCn ? `<div class="cn2">${esc(w.egCn)}</div>` : '')
    );
  }

  // ---------- 例句填空 ----------
  // 用词条自己的例句挖空目标词（含屈折形式），全部输入题；例句里找不到可挖的位置就跳过这个词
  function buildClozeQuestion(w) {
    const eg = typeof w.eg === 'string' ? w.eg.trim() : '';
    const blanks = findBlanks(eg, w.word, w.pos);
    return blanks.length ? blankQuestion(w, 'cloze', eg, blanks) : null;
  }

  function clozePromptHtml(q) {
    const w = q.w;
    const hint = w.egCn ? esc(w.egCn) : `释义：${esc(w.cn || '')}`;
    return (
      `<div class="iev-drill-q sent">${segsHtml(q.segs, false)}</div>` +
      `<div class="iev-drill-hint sent">${hint}` +
      `<span class="m">${esc([w.pos, w.cefr, topicLabel(w.topic)].filter(Boolean).join(' · '))}</span></div>`
    );
  }

  function clozeRevealHtml(q) {
    const w = q.w;
    return (
      `<div>${segsHtml(q.segs, true)} ${spk(q.source)}</div>` +
      (w.egCn ? `<div class="cn2">${esc(w.egCn)}</div>` : '')
    );
  }

  // ---------- 练习引擎（搭配练习 / 例句填空共用）----------
  // 每种练习只提供：出题 build(w, order, scope)、题面 prompt(q)、答后展示 reveal(q)、无题可出时的提示
  const DRILLS = {
    colloc: {
      name: '🔗 搭配练习',
      inputHint: '填入空缺的单词，回车提交',
      empty: '当前范围里没有能出搭配题的词。换个话题、级别或关键词试试。',
      build: buildCollocQuestion,
      prompt: collocPromptHtml,
      reveal: collocRevealHtml,
    },
    cloze: {
      name: '📝 例句填空',
      inputHint: '填入空缺的词，回车提交',
      empty: '当前范围里没有能出例句填空题的词。换个话题、级别或关键词试试。',
      build: buildClozeQuestion,
      prompt: clozePromptHtml,
      reveal: clozeRevealHtml,
    },
  };

  // 练习范围：按当前筛选（话题 / CEFR / 关键词）分页取全，抽题和四选一干扰项都从这里取
  async function loadDrillScope(box, mode) {
    box.innerHTML = '<div class="ie-loading">正在组题…</div>';
    const seq = ++st.listSeq;
    const items = [];
    try {
      for (;;) {
        const r = await IE.get(listUrl(SCOPE_PAGE, items.length));
        if (seq !== st.listSeq || !alive() || st.mode !== mode) return null;
        if (!items.length && Array.isArray(r.topics) && r.topics.length) {
          st.topics = r.topics;
          refreshTopicOptions();
        }
        const page = Array.isArray(r.items) ? r.items : [];
        items.push(...page);
        if (!page.length || items.length >= (Number(r.total) || 0) || items.length >= SCOPE_MAX) break;
      }
    } catch (e) {
      if (seq === st.listSeq && alive() && st.mode === mode) {
        box.innerHTML = IE.errorHtml('雅思词汇加载失败', e);
        IE.bindRetry(box, () => switchMode(mode));
      }
      return null;
    }
    return items.filter((w) => w && w.word);
  }

  // retryWords：再练一轮错词时传入，沿用上一轮的范围做干扰项；不传则按筛选重新抽词
  async function startDrill(box, mode, retryWords) {
    const def = DRILLS[mode];
    const retry = Array.isArray(retryWords) && retryWords.length > 0;
    let scope;
    let words;
    if (retry) {
      scope = st.drill.scope;
      words = retryWords.slice();
    } else {
      scope = await loadDrillScope(box, mode);
      if (!scope || st.mode !== mode) return;
      // 优先没掌握的词，不够再补已掌握的
      words = shuffle(scope.filter((w) => levelOf(w) < 3)).concat(shuffle(scope.filter((w) => levelOf(w) === 3)));
    }
    const questions = [];
    for (const w of words) {
      if (questions.length >= DRILL_SIZE) break;
      const q = def.build(w, questions.length, scope);
      if (q) questions.push(q);
    }
    if (!questions.length) {
      box.innerHTML = `<div class="ie-empty">${esc(def.empty)}</div>`;
      return;
    }
    st.drill = { mode, scope, questions, idx: 0, right: 0, wrong: [], retry, unsynced: 0, warned: false, finished: false };
    paintDrill(box);
  }

  function paintDrill(box) {
    const d = st.drill;
    const def = DRILLS[d.mode];
    const q = d.questions[d.idx];
    const isChoice = q.type === 'choice';
    box.innerHTML =
      '<div class="ie-card">' +
      '<div class="iev-drill-head">' +
      `<span>${esc(def.name)}${d.retry ? ' · 错词重练' : ''} · 第 ${d.idx + 1} / ${d.questions.length} 题</span>` +
      `<span>${isChoice ? '四选一' : '填空'} · 对 ${d.right} · 错 ${d.wrong.length}</span>` +
      '</div>' +
      def.prompt(q) +
      (isChoice
        ? '<div class="iev-opts">' +
          q.options.map((o, i) => `<button type="button" class="iev-opt" data-i="${i}"><span class="k">${'ABCD'.charAt(i)}.</span>${esc(o)}</button>`).join('') +
          '</div>'
        : '<div class="iev-drill-row">' +
          `<input type="text" class="ie-input iev-drill-input" placeholder="${escAttr(def.inputHint)}" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false">` +
          '<button type="button" class="btn primary iev-drill-submit">提交</button>' +
          '<button type="button" class="btn iev-drill-skip">🤷 不会</button>' +
          '</div>') +
      '<div class="iev-drill-fb hidden"></div>' +
      '</div>';
    bindSpk(box);
    if (isChoice) {
      box.querySelectorAll('.iev-opt').forEach((b) => {
        b.onclick = () => answerDrill(box, q.options[Number(b.dataset.i)], b);
      });
      return;
    }
    const input = box.querySelector('.iev-drill-input');
    const submit = () => {
      if (input.value.trim()) answerDrill(box, input.value, null);
    };
    input.onkeydown = (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      // 阻止默认行为：否则焦点移到「下一题」后，同一次回车会直接触发它
      e.preventDefault();
      submit();
    };
    box.querySelector('.iev-drill-submit').onclick = submit;
    box.querySelector('.iev-drill-skip').onclick = () => answerDrill(box, '', null);
    input.focus();
  }

  function unsyncedText(d) {
    return d.unsynced ? `有 ${d.unsynced} 题的结果没能保存，未计入掌握度。` : '';
  }

  // 每答一题记一次掌握度：答对 known、答错 unknown。失败不打断练习，只累计未同步题数；
  // 不等请求落地就能进下一题 / 看结果，迟到的失败若结果页还在就原地更新提示
  function rateDrill(d, w, correct) {
    IE.post(
      '/api/words/rate',
      { word: w.word, rating: correct ? 'known' : 'unknown', cn: w.cn, eg: w.eg, pos: w.pos, phon: w.phon },
      { quiet: true }
    ).then(
      (r) => {
        if (r && Number.isInteger(r.level)) w.level = r.level;
      },
      (e) => {
        d.unsynced++;
        if (!alive() || st.drill !== d || st.mode !== d.mode) return;
        if (!d.warned) {
          d.warned = true;
          NCE.toast('练习结果没能保存（' + e.message + '），本轮继续练习但不计入掌握度', 'warn');
        }
        const note = d.finished && root && root.querySelector('.iev-drill-unsynced');
        if (note) {
          note.textContent = unsyncedText(d);
          note.classList.remove('hidden');
        }
      }
    );
  }

  function answerDrill(box, given, optBtn) {
    const d = st.drill;
    const def = DRILLS[d.mode];
    const q = d.questions[d.idx];
    if (!q || q.done) return;
    q.done = true;
    const guess = normAnswer(given);
    const correct = !!guess && q.answers.includes(guess);
    if (correct) d.right++;
    else d.wrong.push({ q, given: String(given || '').trim() });
    rateDrill(d, q.w, correct);

    box.querySelectorAll('.iev-opt').forEach((b) => {
      b.disabled = true;
      if (normAnswer(q.options[Number(b.dataset.i)]) === normAnswer(q.w.word)) b.classList.add('ok');
      else if (b === optBtn) b.classList.add('bad');
    });
    box.querySelectorAll('.iev-drill-row input, .iev-drill-row button').forEach((el) => {
      el.disabled = true;
    });
    const head = box.querySelector('.iev-drill-head span:last-child');
    if (head) head.textContent = `${q.type === 'choice' ? '四选一' : '填空'} · 对 ${d.right} · 错 ${d.wrong.length}`;

    const w = q.w;
    const last = d.idx >= d.questions.length - 1;
    const baseNote = normAnswer(q.form) !== normAnswer(w.word) ? `（原形 ${esc(w.word)}）` : '';
    const viaAlt = correct && Array.isArray(q.alts) && q.alts.includes(guess);
    const fb = box.querySelector('.iev-drill-fb');
    fb.innerHTML =
      (correct
        ? `<div class="r ok">✓ 正确！${viaAlt ? `${esc(String(given).trim())} 与 ${esc(w.word)} 释义相同，也算对` : ''}</div>`
        : `<div class="r bad">✗ ${guess ? '你的答案：' + esc(String(given).trim()) : '没答出来'}</div>`) +
      `<div>正确答案：<b class="iev-hl">${esc(q.form)}</b>${baseNote} ${spk(w.word)}` +
      ` <span class="cn2">${esc([w.phon, w.pos, w.cn].filter(Boolean).join(' · '))}</span></div>` +
      def.reveal(q) +
      `<button type="button" class="btn primary small iev-next">${last ? '查看本轮结果' : '下一题 →'}</button>`;
    fb.classList.remove('hidden');
    bindSpk(fb);
    const next = fb.querySelector('.iev-next');
    next.onclick = () => {
      if (st.drill !== d) return;
      if (!last) {
        d.idx++;
        paintDrill(box);
        return;
      }
      d.finished = true;
      paintDrillResult(box, d);
    };
    next.focus();
  }

  function paintDrillResult(box, d) {
    const def = DRILLS[d.mode];
    const total = d.questions.length;
    const pct = total ? Math.round((d.right / total) * 100) : 0;
    const wrongWords = d.wrong.map((x) => x.q.w);
    const wrongHtml = d.wrong.length
      ? '<h3 style="margin-top:16px">错词清单</h3><ul class="iev-wrong">' +
        d.wrong.map((x) => {
          const w = x.q.w;
          return (
            `<li><span class="w">${esc(w.word)}</span>${spk(w.word)}<span class="a">${esc(w.cn || '')}</span>` +
            `<span class="c">${segsHtml(x.q.segs, true)} · 你答：${x.given ? esc(x.given) : '不会'}</span></li>`
          );
        }).join('') +
        '</ul>'
      : '<div class="ie-empty" style="padding:10px 0">全部答对 🎉</div>';
    box.innerHTML =
      '<div class="ie-card">' +
      `<div class="iev-big">${pct}%</div>` +
      `<div class="iev-big-sub">${esc(def.name)}${d.retry ? ' · 错词重练' : ''} · 答对 ${d.right} / ${total}</div>` +
      `<div class="ie-muted iev-drill-unsynced${d.unsynced ? '' : ' hidden'}">${esc(unsyncedText(d))}</div>` +
      wrongHtml +
      '<div class="ie-row" style="margin-top:16px">' +
      (d.wrong.length
        ? `<button type="button" class="btn primary iev-retry-wrong">🔁 再练一轮错词（${d.wrong.length}）</button>` +
          '<button type="button" class="btn iev-flash-wrong">🃏 去背诵错词</button>'
        : '') +
      `<button type="button" class="btn${d.wrong.length ? '' : ' primary'} iev-drill-again">再来一组</button>` +
      '</div>' +
      '</div>';
    bindSpk(box);
    box.querySelector('.iev-drill-again').onclick = () => startDrill(box, d.mode);
    const retryBtn = box.querySelector('.iev-retry-wrong');
    if (retryBtn) retryBtn.onclick = () => startDrill(box, d.mode, wrongWords);
    const flashBtn = box.querySelector('.iev-flash-wrong');
    if (flashBtn) flashBtn.onclick = () => switchMode('flash', wrongWords);
  }

  // ---------- 雅思词汇诊断 ----------
  function bandsInOrder(byBand) {
    const keys = Object.keys(byBand || {});
    return CHECK_BANDS.filter((b) => keys.includes(b)).concat(keys.filter((k) => !CHECK_BANDS.includes(k)));
  }

  function bandBarsHtml(byBand) {
    return bandsInOrder(byBand).map((b) => {
      const x = byBand[b] || {};
      const cov = Math.max(0, Math.min(100, Number(x.coverage) || 0));
      const cnt = x.total != null ? ` · ${Number(x.correct) || 0} / ${Number(x.total) || 0}` : '';
      return (
        '<div class="iev-band">' +
        `<div class="lab"><span><b>${esc(b)}</b> 段${cnt}</span><span>覆盖率 ${cov}%</span></div>` +
        `<div class="iev-bar"><i style="width:${cov}%"></i></div>` +
        '</div>'
      );
    }).join('');
  }

  async function renderCheckIntro(box) {
    st.check = { quiz: null, idx: 0, answers: [], result: null };
    box.innerHTML =
      '<div class="ie-card">' +
      '<h3>🩺 雅思词汇诊断</h3>' +
      '<div class="ie-note">从雅思词表的 <b>B1 / B2 / C1</b> 三段各抽 10 个词，四选一选中文释义，约 5 分钟。' +
      '不认识就点「不认识」，别猜，结果才准。<br>结果是雅思词表覆盖率估算，用来看高段词汇进度，不影响「总词汇量」测试的历次成绩。</div>' +
      '<div class="iev-last" style="margin-top:12px"></div>' +
      '<div class="ie-row" style="margin-top:14px"><button type="button" class="btn primary iev-start">开始诊断</button></div>' +
      '</div>';
    box.querySelector('.iev-start').onclick = () => startCheck(box);
    // 上次结果（拿不到就不显示）
    try {
      const sum = await IE.get('/api/ielts/summary');
      if (!alive() || st.mode !== 'check') return;
      const v = sum && sum.vocab;
      const last = box.querySelector('.iev-last');
      if (last && v && v.lastOverall != null) {
        last.innerHTML =
          `<div class="ie-muted" style="margin-bottom:4px">上次诊断：总覆盖率 <b>${esc(String(v.lastOverall))}%</b></div>` +
          (v.byBand && typeof v.byBand === 'object' ? bandBarsHtml(v.byBand) : '');
      }
    } catch (e) { /* 概况拿不到不影响诊断 */ }
  }

  async function startCheck(box) {
    box.innerHTML = '<div class="ie-loading">正在抽题…</div>';
    let quiz;
    try {
      quiz = await IE.get('/api/ielts/vocab-check');
    } catch (e) {
      if (!alive() || st.mode !== 'check') return;
      box.innerHTML = IE.errorHtml('诊断题目加载失败', e);
      IE.bindRetry(box, () => startCheck(box));
      return;
    }
    if (!alive() || st.mode !== 'check') return;
    const items = quiz && Array.isArray(quiz.items) ? quiz.items.filter((x) => x && x.id != null && Array.isArray(x.options)) : [];
    if (!quiz || !quiz.quizId || !items.length) {
      box.innerHTML = '<div class="ie-err"><div class="ie-err-t">⚠️ 诊断题目为空</div><div class="ie-err-d">雅思词表可能还没导入，稍后再试。</div><button type="button" class="btn small ie-retry">重试</button></div>';
      IE.bindRetry(box, () => startCheck(box));
      return;
    }
    st.check = { quiz: { quizId: quiz.quizId, items }, idx: 0, answers: [], result: null };
    paintQuestion(box);
  }

  function paintQuestion(box) {
    const c = st.check;
    const it = c.quiz.items[c.idx];
    box.innerHTML =
      '<div class="ie-card">' +
      `<div class="ie-muted">第 ${c.idx + 1} / ${c.quiz.items.length} 题</div>` +
      `<div class="iev-q-word"><b>${esc(it.word)}</b>${spk(it.word)}</div>` +
      '<div class="iev-opts">' +
      it.options.map((o, i) => `<button type="button" class="iev-opt" data-choice="${escAttr(o)}"><span class="k">${'ABCD'.charAt(i) || i + 1}.</span>${esc(o)}</button>`).join('') +
      '<button type="button" class="iev-opt skip" data-choice="">🤷 不认识</button>' +
      '</div>' +
      '</div>';
    bindSpk(box);
    box.querySelectorAll('.iev-opt').forEach((b) => {
      b.onclick = () => {
        // 与 routes/comprehension.js 一致：choice 传选项原文，空串表示不认识
        c.answers.push({ id: it.id, choice: b.dataset.choice });
        c.idx++;
        if (c.idx < c.quiz.items.length) paintQuestion(box);
        else submitCheck(box);
      };
    });
  }

  async function submitCheck(box) {
    const c = st.check;
    box.innerHTML = '<div class="ie-loading">正在计算覆盖率…</div>';
    let r;
    try {
      r = await IE.post('/api/ielts/vocab-check', { quizId: c.quiz.quizId, answers: c.answers });
    } catch (e) {
      if (!alive() || st.mode !== 'check') return;
      if (e.status === 404) {
        // 诊断已过期（后端只保留 30 分钟）或不存在：原答案提交不了，重试没有意义，只能重新抽题
        box.innerHTML = IE.errorHtml('诊断提交失败', e, { retryLabel: '重新抽题' });
        IE.bindRetry(box, () => startCheck(box));
        return;
      }
      box.innerHTML =
        IE.errorHtml('提交失败，答案还在，可以重试', e) +
        '<div class="ie-row" style="margin-top:10px"><button type="button" class="btn small iev-restart">重新抽题</button></div>';
      IE.bindRetry(box, () => submitCheck(box));
      box.querySelector('.iev-restart').onclick = () => startCheck(box);
      return;
    }
    if (!alive() || st.mode !== 'check') return;
    c.result = r;
    paintCheckResult(box, r);
  }

  function paintCheckResult(box, r) {
    const byBand = r && r.byBand && typeof r.byBand === 'object' ? r.byBand : {};
    const wrong = Array.isArray(r && r.wrong) ? r.wrong : [];
    // 覆盖率最低的一段，给「去背」入口
    const weakest = bandsInOrder(byBand).reduce((m, b) => {
      const cov = Number(byBand[b] && byBand[b].coverage);
      return Number.isFinite(cov) && (m == null || cov < m.cov) ? { band: b, cov } : m;
    }, null);
    const wrongHtml = wrong.length
      ? '<h3 style="margin-top:16px">没认出的词</h3><ul class="iev-wrong">' +
        wrong.map((w) => {
          const word = w.word || '';
          const ans = w.answer || w.cn || '';
          const choice = w.choice ? `你选：${esc(w.choice)}` : '你选：不认识';
          return `<li><span class="w">${esc(word)}</span>${spk(word)}${ans ? `<span class="a">${esc(ans)}</span>` : ''}<span class="c">${choice}</span></li>`;
        }).join('') +
        '</ul>'
      : '';
    box.innerHTML =
      '<div class="ie-card">' +
      `<div class="iev-big">${r && r.overall != null ? esc(String(r.overall)) + '%' : '—'}</div>` +
      '<div class="iev-big-sub">雅思词表总覆盖率（估算）</div>' +
      bandBarsHtml(byBand) +
      wrongHtml +
      '<div class="ie-row" style="margin-top:16px">' +
      '<button type="button" class="btn primary iev-recheck">再测一次</button>' +
      (weakest ? `<button type="button" class="btn iev-study" data-band="${escAttr(weakest.band)}">🃏 去背 ${esc(weakest.band)} 词</button>` : '') +
      '</div>' +
      '<div class="ie-muted" style="margin-top:10px">建议每周测一次，看各段覆盖率的变化；检查点会用最近一次诊断的结果。</div>' +
      '</div>';
    bindSpk(box);
    box.querySelector('.iev-recheck').onclick = () => startCheck(box);
    const study = box.querySelector('.iev-study');
    if (study) {
      study.onclick = () => {
        st.cefr = CEFR_LIST.includes(study.dataset.band) ? study.dataset.band : '';
        st.topic = '';
        st.q = '';
        renderFilters();
        switchMode('flash');
      };
    }
  }

  IE.registerPage('vocab', {
    render,
    // 切到别的顶层标签时也清掉拼写模式的自动下一题定时器，避免在后台触发（没有 resume，回来时壳层重新渲染）
    pause() {
      clearSpellTimer();
    },
    leave() {
      clearSpellTimer();
      clearTimeout(searchTimer);
      st.listSeq++;
    },
  });
})();
