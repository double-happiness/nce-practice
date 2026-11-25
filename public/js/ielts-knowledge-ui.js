'use strict';
// 雅思备考 · 📚 基础子页：知识卡片目录（按领域分组、水平 / 技能筛选、下一篇推荐）
// → 文章页（讲解、例句 🔊、表格、易错点、小测逐题即时反馈、交卷记成绩、相关跳转）。
// 小测在本地判分（单人自学，契约 docs/design/ielts-knowledge-20261125.md §2 §4），只把分数提交给服务端。
// 接口：GET /api/ielts/knowledge、GET /api/ielts/knowledge/:id、POST /api/ielts/knowledge/:id/progress
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE || !IE.registerPage) return;
  const esc = NCE.escapeHtml;

  const LEVELS = ['A2', 'B1', 'B2', 'C1'];
  const LEVEL_RANK = { A2: 0, B1: 1, B2: 2, C1: 3 };
  const SKILL_LABEL = { listening: '听力', reading: '阅读', writing: '写作', speaking: '口语' };
  const DOMAIN_ICON = { grammar: '🧱', strategy: '🎯', language: '💬', pronunciation: '🗣️', wordform: '🧩' };
  const TYPE_LABEL = { mcq: '单选', fill: '填空', correct: '改错' };
  const TAB_LABEL = {
    learn: '📖 教材学习',
    practice: '✏️ 刷题练习',
    dictionary: '📕 查词典',
    dictation: '🎧 听写',
    exam: '📝 阶段测验',
    transform: '🔀 句型转换',
    dialogue: '💬 情景对话',
    review: '🔁 间隔复习',
    words: '🔤 背单词',
    comprehension: '🧩 理解训练',
    'ielts:plan': '🗓️ 雅思计划',
    'ielts:vocab': '🔤 雅思词汇',
    'ielts:listening': '🎧 雅思听力',
    'ielts:reading': '📖 雅思阅读',
    'ielts:writing': '✍️ 雅思写作',
    'ielts:speaking': '🎙️ 雅思口语',
  };
  const DEFAULT_PASS_RATIO = 0.6;
  const MAX_INPUT_LEN = 300;
  const FILTER_KEY = 'knowledge-filter';

  // ---- 样式（前缀 iek-；颜色走主题变量，明暗主题都可读；窄屏不出现横向滚动）----
  const style = document.createElement('style');
  style.textContent = `
    .iek-wrap{overflow-wrap:anywhere}
    .iek-rec{background:var(--accent-grad-soft);border:1px solid var(--border-soft);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px}
    .iek-rec-k{font-size:12px;font-weight:800;color:var(--brand);letter-spacing:.04em;margin-bottom:4px}
    .iek-rec-t{font-size:16px;font-weight:800;color:var(--ink);line-height:1.45}
    .iek-rec-t span{font-size:13px;font-weight:500;color:var(--muted);margin-left:6px}
    .iek-rec-m{font-size:12.5px;color:var(--muted);margin:4px 0 6px}
    .iek-rec-s{font-size:13.5px;color:var(--ink-soft);line-height:1.7;margin-bottom:10px}
    .iek-rec-why{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.6}
    .iek-sum{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--muted);margin-bottom:10px}
    .iek-sum b{color:var(--ink)}
    .iek-filters{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
    .iek-frow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .iek-flabel{font-size:12px;font-weight:700;color:var(--muted);min-width:30px}
    .iek-filters .chips{gap:6px}
    .iek-filters .chip{padding:5px 12px;font-size:13px}
    .iek-domain{margin-top:16px}
    .iek-dh{display:flex;align-items:baseline;gap:6px 10px;flex-wrap:wrap;font-size:15px;font-weight:800;color:var(--ink);margin-bottom:8px}
    .iek-dh span{font-size:12.5px;font-weight:600;color:var(--muted)}
    .iek-track{font-size:12.5px;font-weight:700;color:var(--muted);margin:10px 0 6px}
    .iek-list{display:flex;flex-direction:column;gap:8px}
    .iek-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card);padding:10px 12px;cursor:pointer;font-family:inherit;color:var(--ink)}
    .iek-item:hover{border-color:var(--brand)}
    .iek-item:focus-visible{outline:none;box-shadow:var(--ring)}
    .iek-item.done{border-left:4px solid var(--ok)}
    .iek-item-main{flex:1;min-width:0}
    .iek-item-t{font-size:14.5px;font-weight:700;line-height:1.45}
    .iek-item-t span{font-size:12.5px;font-weight:500;color:var(--muted);margin-left:6px}
    .iek-item-m{font-size:12.5px;color:var(--muted);margin-top:2px}
    .iek-item-s{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .iek-head{margin-bottom:12px}
    .iek-kicker{font-size:12px;font-weight:800;color:var(--brand);letter-spacing:.04em}
    .iek-title{margin:4px 0 6px;font-size:19px;line-height:1.4;color:var(--ink)}
    .iek-title span{display:block;font-size:13.5px;font-weight:500;color:var(--muted);margin-top:2px}
    .iek-pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
    .iek-lead{font-size:14px;color:var(--ink-soft);line-height:1.75;margin:0}
    .iek-status{font-size:13px;color:var(--muted);margin-top:8px}
    .iek-status b{color:var(--ok)}
    .iek-sec h4,.iek-block h4{margin:0 0 10px;font-size:15.5px;color:var(--ink);line-height:1.45}
    .iek-body{font-size:14.5px;color:var(--ink-soft);line-height:1.85}
    .iek-body p{margin:0 0 10px}
    .iek-body b{color:var(--ink)}
    .iek-exs{display:flex;flex-direction:column;gap:8px;margin-top:6px}
    .iek-ex{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-left:3px solid var(--brand);background:rgba(127,127,127,.06);border-radius:0 8px 8px 0}
    .iek-ex-main{flex:1;min-width:0}
    .iek-en{font-family:Georgia,"Times New Roman",serif;font-size:15px;color:var(--ink);line-height:1.6;white-space:pre-line}
    .iek-cn{font-size:13px;color:var(--muted);line-height:1.6;white-space:pre-line}
    .iek-note{font-size:12.5px;color:#d97706;line-height:1.6;margin-top:2px}
    .iek-spk{flex:none;border:none;background:transparent;cursor:pointer;font-size:16px;line-height:1;padding:3px 2px;opacity:.75}
    .iek-spk:hover{opacity:1}
    .iek-spk:focus-visible{outline:none;box-shadow:var(--ring);border-radius:6px}
    .iek-tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:10px 0;border:1px solid var(--border);border-radius:8px;max-width:100%}
    .iek-table{border-collapse:collapse;width:100%;font-size:13.5px;color:var(--ink-soft)}
    .iek-table th,.iek-table td{padding:7px 10px;border-bottom:1px solid var(--border-soft);text-align:left;vertical-align:top;line-height:1.55;overflow-wrap:normal;word-break:normal}
    .iek-table th{font-weight:800;color:var(--ink);background:rgba(127,127,127,.07);white-space:nowrap}
    .iek-table tr:last-child td{border-bottom:none}
    .iek-pits{display:flex;flex-direction:column;gap:10px}
    .iek-pit{border:1px solid var(--border);border-radius:8px;padding:9px 12px;background:var(--card)}
    .iek-pit-w,.iek-pit-r{display:flex;gap:6px;align-items:flex-start;font-family:Georgia,"Times New Roman",serif;font-size:14.5px;line-height:1.6;white-space:pre-line}
    .iek-pit-w{color:var(--bad)}
    .iek-pit-w span:last-child{text-decoration:line-through;text-decoration-thickness:1px}
    .iek-pit-r{color:var(--ok)}
    .iek-pit-y{font-size:13px;color:var(--ink-soft);line-height:1.65;margin-top:4px}
    .iek-mark{flex:none;font-weight:900;font-family:system-ui,sans-serif}
    .iek-readbar{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;margin-top:12px}
    .iek-q{padding:12px 0;border-bottom:1px dashed var(--border)}
    .iek-q:last-of-type{border-bottom:none}
    .iek-qh{display:flex;gap:8px;align-items:flex-start;font-size:14.5px;color:var(--ink);line-height:1.6}
    .iek-num{flex:none;min-width:24px;height:22px;padding:0 5px;border-radius:6px;background:rgba(47,111,237,.12);color:var(--brand);font-size:12.5px;font-weight:800;line-height:22px;text-align:center}
    .iek-qp{flex:1;min-width:0;white-space:pre-line}
    .iek-qt{font-size:11.5px;font-weight:700;color:var(--muted);margin-right:6px}
    .iek-qa{margin:8px 0 0 32px}
    .iek-opts{display:flex;flex-direction:column;gap:6px}
    .iek-opt{display:block;width:100%;text-align:left;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink-soft);font-size:14px;line-height:1.5;cursor:pointer;font-family:inherit}
    .iek-opt:hover:not(:disabled){border-color:var(--brand);color:var(--brand)}
    .iek-opt:disabled{cursor:default}
    .iek-opt.right{border-color:var(--ok);background:rgba(22,163,74,.10);color:var(--ink)}
    .iek-opt.wrong{border-color:var(--bad);background:rgba(220,38,38,.08);color:var(--ink)}
    .iek-fillrow{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}
    .iek-in{flex:1 1 200px;min-width:0;max-width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink);font-size:14.5px;font-family:inherit;line-height:1.5;resize:vertical}
    .iek-in:focus{outline:none;border-color:var(--brand);box-shadow:var(--ring)}
    .iek-in:disabled{opacity:.85}
    html[data-theme=midnight] .iek-in{background:rgba(255,255,255,.07);color-scheme:dark}
    .iek-fb{margin-top:8px;font-size:13.5px;line-height:1.65;color:var(--ink-soft)}
    .iek-fb-h{font-weight:800}
    .iek-fb.ok .iek-fb-h{color:var(--ok)}
    .iek-fb.bad .iek-fb-h{color:var(--bad)}
    .iek-fb b{color:var(--ink)}
    .iek-quiz-foot{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;margin-top:12px}
    .iek-msg{font-size:13px;color:var(--muted)}
    .iek-msg.bad{color:var(--bad)}
    .iek-msg.ok{color:var(--ok)}
    .iek-result{margin-top:12px;padding:12px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:rgba(127,127,127,.04)}
    .iek-result.pass{border-color:rgba(22,163,74,.45);background:rgba(22,163,74,.07)}
    .iek-result-big{font-size:24px;font-weight:900;color:var(--ink)}
    .iek-result-sub{font-size:13px;color:var(--muted);margin-top:2px}
    .iek-rel{display:flex;flex-direction:column;gap:10px}
    .iek-rel-k{font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px}
    .iek-rel .ie-row{gap:8px}
    @media (max-width:600px){
      .iek-qa{margin-left:0}
      .iek-item{align-items:flex-start}
      .iek-title{font-size:17.5px}
    }
  `;
  document.head.appendChild(style);

  // <knowledge-grade> 与 lib/ielts-knowledge.js 的 normalizeAnswer / gradeExercise 规则一致：
  // 弯引号转直引号、合并空白、去掉句末标点、不区分大小写；mcq 比较所选选项，fill / correct 匹配任一可接受写法。
  // scripts/test-ielts-knowledge.js 会抽出这段代码与后端逐例比对，改动时两边一起改。
  function normalizeAnswer(s) {
    return String(s == null ? '' : s)
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[\s.!?…。！？]+$/u, '')
      .toLowerCase();
  }
  function gradeExercise(ex, response) {
    const norm = normalizeAnswer(response);
    if (!norm) return { correct: false, blank: true };
    if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return { correct: false, blank: false };
    if (ex.type === 'mcq') return { correct: typeof ex.answer === 'string' && normalizeAnswer(ex.answer) === norm, blank: false };
    const list = Array.isArray(ex.answer) ? ex.answer.filter((a) => typeof a === 'string') : [];
    const accepted = list.map(normalizeAnswer).filter(Boolean);
    return { correct: accepted.includes(norm), blank: false };
  }
  // </knowledge-grade>

  // ---- 状态 ----
  const st = {
    stage: 'list', // list | article
    list: null, // 目录条目（含 progress）
    domains: {},
    tracks: {},
    passRatio: DEFAULT_PASS_RATIO,
    filter: loadFilter(),
    article: null,
    quiz: null, // { order: [exIndex], optOrder: { exId: [option] }, answers: { exId: { response, correct } }, submitted, submitting, result }
    readPosting: false,
    seq: 0,
  };
  let root = null;
  let ctx = null;

  function alive() {
    return !!(ctx && ctx.isActive() && root && root.isConnected);
  }

  // ---------- 筛选条件（localStorage，按档案隔离；读写失败不影响使用）----------
  function loadFilter() {
    try {
      const raw = JSON.parse(localStorage.getItem(IE.storeKey(FILTER_KEY)) || 'null');
      return {
        level: raw && LEVELS.includes(raw.level) ? raw.level : '',
        skill: raw && Object.prototype.hasOwnProperty.call(SKILL_LABEL, raw.skill) ? raw.skill : '',
      };
    } catch (e) {
      console.warn('[ielts-knowledge] 读取筛选条件失败', e);
      return { level: '', skill: '' };
    }
  }
  function saveFilter() {
    try {
      localStorage.setItem(IE.storeKey(FILTER_KEY), JSON.stringify(st.filter));
    } catch (e) {
      console.warn('[ielts-knowledge] 保存筛选条件失败', e);
    }
  }

  // ---------- 进度判断 ----------
  function prog(item) {
    const p = item && item.progress;
    return p && typeof p === 'object' ? p : { readAt: null, best: null, total: null, attempts: 0 };
  }
  function bestRatio(p) {
    return Number(p.total) > 0 && Number.isFinite(Number(p.best)) ? Number(p.best) / Number(p.total) : null;
  }
  // 完成 = 已读 且 小测最好成绩达到通过线（默认 60%）
  function isDone(item) {
    const p = prog(item);
    const r = bestRatio(p);
    return !!p.readAt && r != null && r >= st.passRatio;
  }
  function statusPills(item) {
    const p = prog(item);
    if (isDone(item)) return `<span class="ie-pill ok">✓ 完成 ${esc(String(p.best))}/${esc(String(p.total))}</span>`;
    const out = [];
    if (p.readAt) out.push('<span class="ie-pill">已读</span>');
    if (Number(p.attempts) > 0 && bestRatio(p) != null) out.push(`<span class="ie-pill warn">小测 ${esc(String(p.best))}/${esc(String(p.total))}</span>`);
    if (!out.length) out.push('<span class="ie-pill mute">未读</span>');
    return out.join('');
  }

  // ---------- 文本渲染：先转义，再把 **加粗** 换成 <b> ----------
  function inline(s) {
    return esc(String(s == null ? '' : s)).replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');
  }
  function bodyHtml(s) {
    return String(s || '')
      .split(/\n{2,}/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p>${inline(para).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }
  // <knowledge-speech> 朗读文本：例句可能是多行对话或带标签前缀（Q: / A: / Notes: / Before: / After: …），
  // 显示时原样保留，朗读前逐行去掉行首标签。scripts/test-ielts-knowledge.js 会抽出这段代码测试。
  const SPEAK_LABEL_RE = /^\s*(Q|A|Notes|Before|After|Examiner|Candidate|Student|Teacher)\s*:\s*/im;
  function speechText(en) {
    return String(en == null ? '' : en)
      .split('\n')
      .map((line) => line.replace(SPEAK_LABEL_RE, ''))
      .join('\n')
      .trim();
  }
  // </knowledge-speech>
  function spkHtml(en) {
    const t = speechText(en);
    return t ? `<button type="button" class="iek-spk" data-say="${esc(t)}" title="朗读" aria-label="朗读">🔊</button>` : '';
  }
  function bindSpeak(scope) {
    scope.querySelectorAll('.iek-spk').forEach((b) => {
      b.onclick = () => {
        if (typeof NCE.speak === 'function') NCE.speak(b.dataset.say);
      };
    });
  }
  function levelSkillMeta(item) {
    const parts = [];
    if (item.level) parts.push(item.level);
    const skills = (Array.isArray(item.skills) ? item.skills : []).map((s) => SKILL_LABEL[s] || s);
    if (skills.length) parts.push(skills.join(' / '));
    if (Number(item.minutes) > 0) parts.push(`约 ${Number(item.minutes)} 分钟`);
    return parts.join(' · ');
  }
  function domainLabel(item) {
    return item.domainLabel || st.domains[item.domain] || item.domain || '';
  }
  function trackLabel(item) {
    return item.trackLabel || (st.tracks[item.domain] && st.tracks[item.domain][item.track]) || item.track || '';
  }

  // ---------- 目录 ----------
  function filtered() {
    const f = st.filter;
    return (st.list || []).filter((it) =>
      (!f.level || it.level === f.level) && (!f.skill || (Array.isArray(it.skills) && it.skills.includes(f.skill)))
    );
  }

  // 下一篇推荐：按 level（A2→C1）、order 升序，取第一篇未完成的；同级同序按目录顺序
  function recommend(items) {
    const indexed = items.map((it, i) => ({ it, i }));
    indexed.sort((a, b) =>
      (LEVEL_RANK[a.it.level] ?? 9) - (LEVEL_RANK[b.it.level] ?? 9) ||
      (Number(a.it.order) || 0) - (Number(b.it.order) || 0) ||
      a.i - b.i
    );
    const hit = indexed.find((x) => !isDone(x.it));
    return hit ? hit.it : null;
  }

  function recHtml(items) {
    const filteredNote = st.filter.level || st.filter.skill ? '（按当前筛选）' : '';
    if (!items.length) return '';
    const it = recommend(items);
    if (!it) {
      return `<div class="iek-rec"><div class="iek-rec-k">🎉 下一篇推荐${esc(filteredNote)}</div><div class="iek-rec-s">这里的文章都已完成，可以换个筛选条件，或者回头复习做错过的小测。</div></div>`;
    }
    const p = prog(it);
    const action = p.readAt ? '继续：做小测 →' : '开始学习 →';
    return (
      '<div class="iek-rec">' +
      `<div class="iek-rec-k">👉 下一篇推荐${esc(filteredNote)}</div>` +
      `<div class="iek-rec-t">${esc(it.title)}${it.titleEn ? `<span>${esc(it.titleEn)}</span>` : ''}</div>` +
      `<div class="iek-rec-m">${esc(DOMAIN_ICON[it.domain] || '📄')} ${esc(domainLabel(it))} · ${esc(trackLabel(it))} · ${esc(levelSkillMeta(it))}</div>` +
      (it.summary ? `<div class="iek-rec-s">${inline(it.summary)}</div>` : '') +
      `<div class="ie-row"><button type="button" class="btn small primary iek-open" data-id="${esc(it.id)}">${esc(action)}</button>${statusPills(it)}</div>` +
      `<div class="iek-rec-why">按水平从低到高、同水平按学习顺序，取第一篇还没完成的（完成 = 已读且小测正确率 ≥ ${Math.round(st.passRatio * 100)}%）。</div>` +
      '</div>'
    );
  }

  function filtersHtml() {
    const chip = (kind, v, label) =>
      `<div class="chip${st.filter[kind] === v ? ' active' : ''}" data-kind="${kind}" data-v="${esc(v)}" role="button" tabindex="0">${esc(label)}</div>`;
    return (
      '<div class="iek-filters">' +
      `<div class="iek-frow"><span class="iek-flabel">水平</span><div class="chips">${chip('level', '', '全部')}${LEVELS.map((l) => chip('level', l, l)).join('')}</div></div>` +
      `<div class="iek-frow"><span class="iek-flabel">技能</span><div class="chips">${chip('skill', '', '全部')}${Object.keys(SKILL_LABEL).map((s) => chip('skill', s, SKILL_LABEL[s])).join('')}</div></div>` +
      '</div>'
    );
  }

  function itemHtml(it) {
    return (
      `<button type="button" class="iek-item iek-open${isDone(it) ? ' done' : ''}" data-id="${esc(it.id)}">` +
      '<span class="iek-item-main">' +
      `<span class="iek-item-t">${esc(it.title)}${it.titleEn ? `<span>${esc(it.titleEn)}</span>` : ''}</span>` +
      `<span class="iek-item-m" style="display:block">${esc(levelSkillMeta(it))}</span>` +
      '</span>' +
      `<span class="iek-item-s">${statusPills(it)}</span>` +
      '</button>'
    );
  }

  // 按 domain 分组，组内按 track 再分小节（服务端已按 domain、track、order 排好序）
  function groupsHtml(items) {
    if (!items.length) return '<div class="ie-empty">当前筛选下没有文章，换个水平或技能试试。</div>';
    const groups = [];
    for (const it of items) {
      let g = groups[groups.length - 1];
      if (!g || g.domain !== it.domain) {
        g = { domain: it.domain, label: domainLabel(it), tracks: [], items: [] };
        groups.push(g);
      }
      g.items.push(it);
      let t = g.tracks[g.tracks.length - 1];
      if (!t || t.track !== it.track) {
        t = { track: it.track, label: trackLabel(it), items: [] };
        g.tracks.push(t);
      }
      t.items.push(it);
    }
    return groups.map((g) => {
      const read = g.items.filter((it) => prog(it).readAt).length;
      const done = g.items.filter(isDone).length;
      return (
        '<div class="iek-domain">' +
        `<div class="iek-dh">${esc(DOMAIN_ICON[g.domain] || '📄')} ${esc(g.label)}<span>已读 ${read}/${g.items.length} · 完成 ${done}/${g.items.length}</span></div>` +
        g.tracks.map((t) =>
          (g.tracks.length > 1 || t.label ? `<div class="iek-track">${esc(t.label)}</div>` : '') +
          `<div class="iek-list">${t.items.map(itemHtml).join('')}</div>`
        ).join('') +
        '</div>'
      );
    }).join('');
  }

  function paintList() {
    if (!alive() || st.stage !== 'list') return;
    const all = st.list || [];
    if (!all.length) {
      root.innerHTML =
        '<div class="iek-wrap"><div class="ie-card"><h3>📚 基础知识库</h3>' +
        '<div class="ie-empty">知识库内容还没有就绪（data/ielts/knowledge/ 下暂无文章）。</div></div></div>';
      return;
    }
    const items = filtered();
    const read = all.filter((it) => prog(it).readAt).length;
    const done = all.filter(isDone).length;
    root.innerHTML =
      '<div class="iek-wrap">' +
      recHtml(items) +
      '<div class="ie-card">' +
      '<h3>📚 基础知识库<span class="ie-h3-sub">讲解 + 例句 + 易错点 + 小测</span></h3>' +
      `<div class="iek-sum"><span>共 <b>${all.length}</b> 篇</span><span>已读 <b>${read}</b></span><span>完成 <b>${done}</b></span></div>` +
      filtersHtml() +
      groupsHtml(items) +
      '</div>' +
      '</div>';
    root.querySelectorAll('.iek-filters .chip').forEach((c) => {
      const pick = () => {
        st.filter[c.dataset.kind] = c.dataset.v;
        saveFilter();
        paintList();
      };
      c.onclick = pick;
      c.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      };
    });
    root.querySelectorAll('.iek-open').forEach((b) => {
      b.onclick = () => openArticle(b.dataset.id);
    });
  }

  async function renderList() {
    st.stage = 'list';
    st.article = null;
    st.quiz = null;
    const seq = ++st.seq;
    root.innerHTML = '<div class="ie-loading">正在加载基础知识库…</div>';
    let r;
    try {
      r = await IE.get('/api/ielts/knowledge');
    } catch (e) {
      if (!alive() || st.stage !== 'list' || seq !== st.seq) return;
      root.innerHTML = IE.errorHtml('基础知识库加载失败', e);
      IE.bindRetry(root, renderList);
      return;
    }
    if (!alive() || st.stage !== 'list' || seq !== st.seq) return;
    st.list = r && Array.isArray(r.items) ? r.items : [];
    st.domains = (r && r.domains) || {};
    st.tracks = (r && r.tracks) || {};
    const pr = Number(r && r.passRatio);
    st.passRatio = pr > 0 && pr <= 1 ? pr : DEFAULT_PASS_RATIO;
    paintList();
  }

  // ---------- 文章页 ----------
  async function openArticle(id) {
    st.stage = 'article';
    st.article = null;
    st.quiz = null;
    const seq = ++st.seq;
    root.innerHTML = '<div class="ie-loading">正在加载文章…</div>';
    scrollToTop();
    let a;
    try {
      a = await IE.get('/api/ielts/knowledge/' + encodeURIComponent(id));
    } catch (e) {
      if (!alive() || st.stage !== 'article' || seq !== st.seq) return;
      root.innerHTML = '<div class="ie-row" style="margin-bottom:10px"><button type="button" class="btn small ghost iek-back">← 基础目录</button></div>' + IE.errorHtml('文章加载失败', e);
      root.querySelector('.iek-back').onclick = renderList;
      IE.bindRetry(root, () => openArticle(id));
      return;
    }
    if (!alive() || st.stage !== 'article' || seq !== st.seq) return;
    st.article = a || {};
    st.quiz = newQuiz(st.article);
    paintArticle();
  }

  function scrollToTop() {
    const top = root ? root.getBoundingClientRect().top + window.scrollY - 80 : 0;
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
  }

  function fmtTime(ts) {
    return IE.fmtDateTime(ts) || '';
  }

  function headStatusHtml() {
    const a = st.article;
    const p = prog(a);
    const parts = [];
    if (isDone(a)) parts.push('<b>✓ 本篇已完成</b>');
    parts.push(p.readAt ? `已读（${esc(fmtTime(p.readAt))}）` : '还没标记已读');
    if (Number(p.attempts) > 0 && bestRatio(p) != null) parts.push(`小测最好 ${esc(String(p.best))}/${esc(String(p.total))}，做过 ${esc(String(p.attempts))} 次`);
    else parts.push('小测未做');
    return parts.join(' · ');
  }

  function sectionHtml(s) {
    const table = s.table && Array.isArray(s.table.head)
      ? '<div class="iek-tw"><table class="iek-table">' +
        `<thead><tr>${s.table.head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>` +
        `<tbody>${(s.table.rows || []).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>` +
        '</table></div>'
      : '';
    const exs = Array.isArray(s.examples) && s.examples.length
      ? '<div class="iek-exs">' +
        s.examples.map((e) =>
          '<div class="iek-ex">' +
          spkHtml(e.en) +
          '<div class="iek-ex-main">' +
          `<div class="iek-en">${esc(e.en)}</div>` +
          (e.cn ? `<div class="iek-cn">${esc(e.cn)}</div>` : '') +
          (e.note ? `<div class="iek-note">💡 ${inline(e.note)}</div>` : '') +
          '</div></div>'
        ).join('') +
        '</div>'
      : '';
    return (
      '<div class="ie-card iek-sec">' +
      `<h4>${esc(s.heading)}</h4>` +
      `<div class="iek-body">${bodyHtml(s.body)}</div>` +
      table +
      exs +
      '</div>'
    );
  }

  function pitfallsHtml(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return (
      '<div class="ie-card iek-block">' +
      '<h4>⚠️ 易错点</h4>' +
      '<div class="iek-pits">' +
      list.map((p) =>
        '<div class="iek-pit">' +
        `<div class="iek-pit-w"><span class="iek-mark">✗</span><span>${esc(p.wrong)}</span></div>` +
        `<div class="iek-pit-r"><span class="iek-mark">✓</span><span>${esc(p.right)}</span>${spkHtml(p.right)}</div>` +
        (p.why ? `<div class="iek-pit-y">${inline(p.why)}</div>` : '') +
        '</div>'
      ).join('') +
      '</div>' +
      '</div>'
    );
  }

  function readBarHtml() {
    const p = prog(st.article);
    return p.readAt
      ? `<div class="iek-readbar"><span class="ie-pill ok">✓ 已读</span><span class="ie-muted">${esc(fmtTime(p.readAt))}</span></div>`
      : '<div class="iek-readbar"><button type="button" class="btn small primary iek-read">✓ 读完了，标记已读</button><span class="iek-msg iek-read-msg"></span></div>';
  }

  function relatedHtml(rel) {
    const r = rel && typeof rel === 'object' ? rel : {};
    const tags = Array.isArray(r.grammarTags) ? r.grammarTags : [];
    const lessons = Array.isArray(r.nceLessons) ? r.nceLessons : [];
    const tabs = (Array.isArray(r.tabs) ? r.tabs : []).filter((t) => TAB_LABEL[t]);
    if (!tags.length && !lessons.length && !tabs.length) return '';
    const block = (label, btns) => (btns ? `<div><div class="iek-rel-k">${esc(label)}</div><div class="ie-row">${btns}</div></div>` : '');
    return (
      '<div class="ie-card iek-block">' +
      '<h4>🔗 相关练习</h4>' +
      '<div class="iek-rel">' +
      block('去刷这个语法（题库）', tags.map((t) => `<button type="button" class="btn small iek-go-grammar" data-tag="${esc(t)}">✏️ ${esc(t)}</button>`).join('')) +
      block('新概念课文', lessons.map((l) => `<button type="button" class="btn small iek-go-lesson" data-book="${esc(String(l.book))}" data-lesson="${esc(String(l.lesson))}">📖 第 ${esc(String(l.book))} 册 第 ${esc(String(l.lesson))} 课</button>`).join('')) +
      block('其他功能', tabs.map((t) => `<button type="button" class="btn small iek-go-tab" data-tab="${esc(t)}">${esc(TAB_LABEL[t])}</button>`).join('')) +
      '</div>' +
      '</div>'
    );
  }

  function paintArticle() {
    if (!alive() || st.stage !== 'article' || !st.article) return;
    const a = st.article;
    const skills = (Array.isArray(a.skills) ? a.skills : []).map((s) => `<span class="ie-pill mute">${esc(SKILL_LABEL[s] || s)}</span>`).join('');
    root.innerHTML =
      '<div class="iek-wrap">' +
      '<div class="ie-row" style="margin-bottom:10px"><button type="button" class="btn small ghost iek-back">← 基础目录</button></div>' +
      '<div class="ie-card iek-head">' +
      `<div class="iek-kicker">${esc(DOMAIN_ICON[a.domain] || '📄')} ${esc(domainLabel(a))} · ${esc(trackLabel(a))}</div>` +
      `<h3 class="iek-title">${esc(a.title)}${a.titleEn ? `<span>${esc(a.titleEn)}</span>` : ''}</h3>` +
      '<div class="iek-pills">' +
      (a.level ? `<span class="ie-pill">${esc(a.level)}</span>` : '') +
      skills +
      (Number(a.minutes) > 0 ? `<span class="ie-pill mute">约 ${Number(a.minutes)} 分钟</span>` : '') +
      '</div>' +
      (a.summary ? `<p class="iek-lead">${inline(a.summary)}</p>` : '') +
      `<div class="iek-status">${headStatusHtml()}</div>` +
      '</div>' +
      (Array.isArray(a.sections) ? a.sections.map(sectionHtml).join('') : '') +
      pitfallsHtml(a.pitfalls) +
      `<div class="ie-card iek-block iek-readcard"><h4>📌 读完了吗？</h4><div class="ie-muted">读完讲解和易错点再做下面的小测；交卷时也会自动标记已读。</div>${readBarHtml()}</div>` +
      '<div class="ie-card iek-block iek-quiz"></div>' +
      relatedHtml(a.related) +
      '<div class="ie-row" style="margin-top:14px"><button type="button" class="btn small ghost iek-back">← 基础目录</button></div>' +
      '</div>';
    root.querySelectorAll('.iek-back').forEach((b) => { b.onclick = renderList; });
    bindSpeak(root);
    bindRead();
    bindRelated();
    paintQuiz();
  }

  function refreshProgressViews() {
    if (!alive() || st.stage !== 'article') return;
    const s = root.querySelector('.iek-status');
    if (s) s.innerHTML = headStatusHtml();
    const card = root.querySelector('.iek-readcard .iek-readbar');
    if (card) {
      card.outerHTML = readBarHtml();
      bindRead();
    }
  }

  // 服务端返回的最新进度同步到文章与目录缓存
  function applyProgress(id, progress) {
    if (!progress || typeof progress !== 'object') return;
    if (st.article && st.article.id === id) st.article.progress = progress;
    const it = (st.list || []).find((x) => x.id === id);
    if (it) it.progress = progress;
  }

  async function postProgress(id, body, quiet) {
    const r = await IE.post(`/api/ielts/knowledge/${encodeURIComponent(id)}/progress`, body, { quiet: !!quiet });
    applyProgress(id, r && r.progress);
    return r;
  }

  function bindRead() {
    const btn = root.querySelector('.iek-read');
    if (!btn) return;
    btn.onclick = async () => {
      if (st.readPosting || !st.article) return;
      const id = st.article.id;
      const msg = root.querySelector('.iek-read-msg');
      st.readPosting = true;
      btn.disabled = true;
      try {
        await postProgress(id, { read: true }, true);
      } catch (e) {
        st.readPosting = false;
        if (!alive() || !st.article || st.article.id !== id) return;
        btn.disabled = false;
        if (msg) {
          msg.className = 'iek-msg bad iek-read-msg';
          msg.textContent = '标记失败：' + e.message;
        }
        return;
      }
      st.readPosting = false;
      if (!alive() || !st.article || st.article.id !== id) return;
      NCE.toast('已标记为已读', 'ok');
      refreshProgressViews();
    };
  }

  function bindRelated() {
    root.querySelectorAll('.iek-go-grammar').forEach((b) => {
      b.onclick = () => {
        if (typeof NCE.practiceGrammar !== 'function') return NCE.toast('刷题功能不可用', 'warn');
        Promise.resolve(NCE.practiceGrammar(b.dataset.tag)).catch((e) => {
          console.error('[ielts-knowledge] practiceGrammar', e);
          NCE.toast('打开刷题失败：' + e.message, 'bad');
        });
      };
    });
    root.querySelectorAll('.iek-go-lesson').forEach((b) => {
      b.onclick = () => {
        if (typeof NCE.goToLesson !== 'function') return NCE.toast('教材功能不可用', 'warn');
        Promise.resolve(NCE.goToLesson(Number(b.dataset.book), Number(b.dataset.lesson))).catch((e) => {
          console.error('[ielts-knowledge] goToLesson', e);
          NCE.toast('打开课文失败：' + e.message, 'bad');
        });
      };
    });
    root.querySelectorAll('.iek-go-tab').forEach((b) => {
      b.onclick = () => NCE.gotoTab(b.dataset.tab);
    });
  }

  // ---------- 小测 ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 每次开始小测：单选题选项打乱（防止「永远选第一个」），作答清空
  function newQuiz(a) {
    const exs = Array.isArray(a.exercises) ? a.exercises : [];
    const optOrder = {};
    exs.forEach((ex) => {
      if (ex.type === 'mcq') optOrder[ex.id] = shuffle(Array.isArray(ex.options) ? ex.options : []);
    });
    return { optOrder, answers: {}, submitted: false, submitting: false, result: null, error: '' };
  }

  function exercises() {
    return st.article && Array.isArray(st.article.exercises) ? st.article.exercises : [];
  }

  function answerLine(ex) {
    if (ex.type === 'mcq') return `<b>${esc(ex.answer)}</b>`;
    const list = Array.isArray(ex.answer) ? ex.answer : [];
    const main = list[0] || '';
    const others = list.slice(1);
    return `<b>${esc(main)}</b>${others.length ? `<span class="ie-muted">（也可：${others.map(esc).join(' / ')}）</span>` : ''}`;
  }

  function feedbackHtml(ex, ans) {
    if (!ans) return '';
    return (
      `<div class="iek-fb ${ans.correct ? 'ok' : 'bad'}">` +
      `<div><span class="iek-fb-h">${ans.correct ? '✓ 正确' : '✗ 不对'}</span>` +
      (ans.correct ? '' : `　正确答案：${answerLine(ex)}`) +
      '</div>' +
      (ex.explain ? `<div>💡 ${inline(ex.explain)}</div>` : '') +
      '</div>'
    );
  }

  function exerciseHtml(ex, i) {
    const q = st.quiz;
    const ans = q.answers[ex.id];
    const head =
      `<div class="iek-qh"><span class="iek-num">${i + 1}</span>` +
      `<span class="iek-qp"><span class="iek-qt">${esc(TYPE_LABEL[ex.type] || ex.type)}</span>${esc(ex.q)}</span></div>`;
    let body = '';
    if (ex.type === 'mcq') {
      const opts = q.optOrder[ex.id] || [];
      body =
        '<div class="iek-opts">' +
        opts.map((o) => {
          let cls = '';
          if (ans) {
            if (o === ex.answer) cls = ' right';
            else if (o === ans.response) cls = ' wrong';
          }
          return `<button type="button" class="iek-opt${cls}" data-ex="${esc(ex.id)}" data-v="${esc(o)}"${ans ? ' disabled' : ''}>${esc(o)}</button>`;
        }).join('') +
        '</div>';
    } else {
      const val = ans ? ans.response : ex.type === 'correct' ? ex.q : '';
      const field = ex.type === 'correct'
        ? `<textarea class="iek-in" rows="2" data-ex="${esc(ex.id)}" maxlength="${MAX_INPUT_LEN}" spellcheck="false" autocapitalize="off" autocorrect="off" aria-label="第 ${i + 1} 题：改正后的句子"${ans ? ' disabled' : ''}>${esc(val)}</textarea>`
        : `<input class="iek-in" type="text" data-ex="${esc(ex.id)}" value="${esc(val)}" maxlength="${MAX_INPUT_LEN}" autocomplete="off" spellcheck="false" autocapitalize="off" autocorrect="off" placeholder="填入答案" aria-label="第 ${i + 1} 题答案"${ans ? ' disabled' : ''}>`;
      body =
        '<div class="iek-fillrow">' +
        field +
        (ans ? '' : `<button type="button" class="btn small iek-check" data-ex="${esc(ex.id)}">检查</button>`) +
        '</div>' +
        (ex.type === 'correct' && !ans ? '<div class="ie-muted" style="margin-top:4px">直接在原句上改，改完点「检查」</div>' : '');
    }
    return `<div class="iek-q" data-ex="${esc(ex.id)}">${head}<div class="iek-qa">${body}${feedbackHtml(ex, ans)}<div class="iek-msg iek-qmsg"></div></div></div>`;
  }

  function quizFootHtml() {
    const q = st.quiz;
    const exs = exercises();
    const answered = exs.filter((ex) => q.answers[ex.id]).length;
    const correct = exs.filter((ex) => q.answers[ex.id] && q.answers[ex.id].correct).length;
    if (q.submitted && q.result) {
      const r = q.result;
      const p = r.progress || {};
      const pass = r.total > 0 && r.score / r.total >= st.passRatio;
      return (
        `<div class="iek-result${pass ? ' pass' : ''}">` +
        `<div class="iek-result-big">${esc(String(r.score))} / ${esc(String(r.total))}</div>` +
        `<div class="iek-result-sub">${pass ? '✓ 达到通过线' : `未到通过线（${Math.round(st.passRatio * 100)}%），看完解析可以再做一次`}` +
        (bestRatio(p) != null ? ` · 最好成绩 ${esc(String(p.best))}/${esc(String(p.total))} · 共做过 ${esc(String(p.attempts))} 次` : '') +
        '</div></div>' +
        '<div class="iek-quiz-foot"><button type="button" class="btn small iek-again">🔁 再做一次</button></div>'
      );
    }
    const left = exs.length - answered;
    return (
      '<div class="iek-quiz-foot">' +
      `<button type="button" class="btn small primary iek-submit"${left || q.submitting ? ' disabled' : ''}>${q.submitting ? '提交中…' : '交卷，记录成绩'}</button>` +
      `<span class="iek-msg${q.error ? ' bad' : ''}">${esc(q.error || (left ? `已答 ${answered}/${exs.length}，答完全部题目才能交卷` : `全部答完：答对 ${correct}/${exs.length}`))}</span>` +
      '</div>'
    );
  }

  function paintQuiz() {
    const box = root && root.querySelector('.iek-quiz');
    if (!box || !st.quiz) return;
    const exs = exercises();
    if (!exs.length) {
      box.innerHTML = '<h4>📝 小测</h4><div class="ie-muted">这篇文章暂时没有小测题目。</div>';
      return;
    }
    box.innerHTML =
      `<h4>📝 小测（${exs.length} 题）</h4>` +
      '<div class="ie-muted" style="margin-bottom:4px">逐题作答，答完马上看对错和解析；全部答完后交卷记录成绩。</div>' +
      exs.map(exerciseHtml).join('') +
      `<div class="iek-foot-wrap">${quizFootHtml()}</div>`;
    bindQuiz(box);
  }

  function repaintFoot(box) {
    const foot = box.querySelector('.iek-foot-wrap');
    if (!foot) return;
    foot.innerHTML = quizFootHtml();
    bindFoot(box);
  }

  function answerExercise(box, ex, response) {
    const q = st.quiz;
    if (!q || q.submitted || q.answers[ex.id]) return;
    const g = gradeExercise(ex, response);
    const block = box.querySelector(`.iek-q[data-ex="${CSS.escape(ex.id)}"]`);
    if (g.blank) {
      const m = block && block.querySelector('.iek-qmsg');
      if (m) {
        m.className = 'iek-msg bad iek-qmsg';
        m.textContent = '先写答案再检查';
      }
      return;
    }
    q.answers[ex.id] = { response: String(response), correct: g.correct };
    q.error = '';
    if (block) {
      const idx = exercises().indexOf(ex);
      block.outerHTML = exerciseHtml(ex, idx);
      bindExercise(box, box.querySelector(`.iek-q[data-ex="${CSS.escape(ex.id)}"]`));
    }
    repaintFoot(box);
  }

  function bindExercise(box, block) {
    if (!block) return;
    const ex = exercises().find((x) => x.id === block.dataset.ex);
    if (!ex) return;
    block.querySelectorAll('.iek-opt').forEach((b) => {
      b.onclick = () => answerExercise(box, ex, b.dataset.v);
    });
    const input = block.querySelector('.iek-in');
    const check = block.querySelector('.iek-check');
    if (input && check) {
      check.onclick = () => answerExercise(box, ex, input.value);
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          answerExercise(box, ex, input.value);
        }
      };
    }
  }

  function bindQuiz(box) {
    box.querySelectorAll('.iek-q').forEach((block) => bindExercise(box, block));
    bindFoot(box);
  }

  function bindFoot(box) {
    const submit = box.querySelector('.iek-submit');
    if (submit) submit.onclick = () => submitQuiz(box);
    const again = box.querySelector('.iek-again');
    if (again) {
      again.onclick = () => {
        st.quiz = newQuiz(st.article);
        paintQuiz();
        const q = root.querySelector('.iek-quiz');
        if (q) q.scrollIntoView({ block: 'start', behavior: 'smooth' });
      };
    }
  }

  async function submitQuiz(box) {
    const q = st.quiz;
    const a = st.article;
    if (!q || !a || q.submitting || q.submitted) return;
    const exs = exercises();
    if (exs.some((ex) => !q.answers[ex.id])) return;
    const score = exs.filter((ex) => q.answers[ex.id].correct).length;
    const total = exs.length;
    const id = a.id;
    const wasRead = !!prog(a).readAt;
    q.submitting = true;
    q.error = '';
    repaintFoot(box);
    let r;
    try {
      r = await postProgress(id, { score, total }, true);
    } catch (e) {
      q.submitting = false;
      if (!alive() || st.quiz !== q) return;
      q.error = `提交失败：${e.message}（作答还在，可以再点一次交卷）`;
      repaintFoot(box);
      return;
    }
    q.submitting = false;
    q.submitted = true;
    q.result = { score, total, progress: (r && r.progress) || {} };
    // 做完小测视为读过：还没标记已读时顺带标记，失败只提示，不影响成绩
    if (!wasRead) {
      try {
        const rr = await postProgress(id, { read: true }, true);
        q.result.progress = (rr && rr.progress) || q.result.progress;
      } catch (e) {
        console.warn('[ielts-knowledge] 自动标记已读失败', e);
        NCE.toast('成绩已记录，但自动标记已读失败：' + e.message, 'warn');
      }
    }
    if (!alive() || st.quiz !== q) return;
    repaintFoot(box);
    refreshProgressViews();
    NCE.toast(`小测成绩已记录：${score}/${total}`, 'ok');
  }

  IE.registerPage('knowledge', {
    meta: { label: '基础', icon: '📚', before: 'vocab' },
    render(body, c) {
      root = body;
      ctx = c;
      renderList();
    },
    // 去刷题 / 看课文再回来：文章页保留现场（含小测作答）
    resume() {
      return !!(root && root.isConnected && st.stage === 'article' && st.article);
    },
    leave() {
      st.seq++;
      st.stage = 'list';
      st.article = null;
      st.quiz = null;
      st.readPosting = false;
    },
  });
})();
