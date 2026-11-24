'use strict';
// 雅思备考（🎯）顶层标签壳层：子导航（总览计划 / 词汇 / 写作 / 口语 / 记录）+ 未开启时的开启引导。
// 各子页由 public/js/ielts-*.js 通过 NCE.ielts.registerPage(key, impl) 挂入，impl 约定：
//   render(container, ctx)  必需，渲染子页（可 async）；ctx.isActive() 为 false 时说明用户已切走，异步回调里不要再写 DOM
//   resume()                可选，重新进入标签时若能保留现场（如写作中途）返回 true，否则壳层重新 render
//   pause()                 可选，标签被隐藏时调用（停录音、存草稿等）
//   leave()                 可选，切到别的子页前调用（清定时器、释放资源）
// 深链：NCE.pendingIelts = { page } 后 gotoTab('ielts')；或直接 gotoTab('ielts:writing')（app.js 转换）。
// 接口契约见 docs/design/ielts-prep-mvp-20261124.md §5；后端未就绪时各页显示错误卡片，不白屏。
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;
  const esc = NCE.escapeHtml;

  // 开启引导的默认值（设计文档 §1）
  const DEFAULTS = { examType: 'A', examDate: '2027-05-24', target: 7.0 };
  const PAGES = [
    { key: 'plan', label: '总览计划', icon: '🗓️' },
    { key: 'vocab', label: '词汇', icon: '🔤' },
    { key: 'writing', label: '写作', icon: '✍️' },
    { key: 'speaking', label: '口语', icon: '🎙️' },
    { key: 'history', label: '记录', icon: '📈' },
  ];
  const PAGE_KEYS = PAGES.map((p) => p.key);
  const PHASE_NAME = { foundation: '基础期', skills: '专项期', sprint: '冲刺期' };
  const TARGET_OPTIONS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
  const pages = {}; // key -> impl

  // ---- 样式（前缀 ie-；颜色走主题变量，兼容明暗主题）----
  const style = document.createElement('style');
  style.textContent = `
    .ie-wrap{max-width:820px;margin:0 auto}
    .ie-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;margin-bottom:14px}
    .ie-head h2{margin:0 !important}
    .ie-head-sub{font-size:13px;color:var(--muted);font-weight:600}
    .ie-subnav .subtab{display:inline-flex;align-items:center;gap:4px}
    html[data-theme=midnight] .ie-subnav .subtab:not(.active){background:rgba(255,255,255,.07)}
    .ie-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-top:14px;box-shadow:var(--shadow-sm)}
    .ie-card:first-child{margin-top:0}
    .ie-card h3{margin:0 0 12px;font-size:15px;color:var(--ink-soft);display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
    .ie-card h3 .ie-h3-sub{font-size:12px;font-weight:600;color:var(--muted)}
    .ie-muted{color:var(--muted);font-size:13px}
    .ie-note{font-size:13px;color:var(--ink-soft);line-height:1.75;background:var(--accent-grad-soft);border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:10px 14px}
    .ie-warn{font-size:13px;color:var(--ink-soft);line-height:1.75;background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.35);border-radius:var(--radius-sm);padding:10px 14px}
    .ie-err{padding:14px 16px;border-radius:var(--radius-sm);background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.28);color:var(--ink-soft);font-size:14px;line-height:1.7}
    .ie-err-t{font-weight:700;color:var(--bad)}
    .ie-err-d{font-size:13px;margin-top:2px}
    .ie-err .btn{margin-top:10px}
    .ie-loading{color:var(--muted);padding:28px 0;text-align:center;font-size:14px}
    .ie-empty{color:var(--muted);padding:24px 0;text-align:center;font-size:14px;line-height:1.8}
    .ie-input{padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card);color:var(--ink);font-size:14px;font-family:inherit}
    .ie-input:focus{outline:none;border-color:var(--brand);box-shadow:var(--ring)}
    html[data-theme=midnight] .ie-input{color-scheme:dark;background:rgba(255,255,255,.07)}
    .ie-form{display:grid;gap:16px}
    .ie-field{display:flex;flex-direction:column;gap:8px}
    .ie-label{font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.04em}
    .ie-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .ie-msg{font-size:13px;min-height:18px}
    .ie-msg.bad{color:var(--bad)}
    .ie-msg.ok{color:var(--ok)}
    .ie-lead{font-size:14px;color:var(--ink-soft);line-height:1.75;margin:0 0 16px}
    .ie-tl{margin-top:18px}
    .ie-tl-t{font-weight:700;font-size:14px;color:var(--ink);margin-bottom:6px}
    .ie-tl ul{margin:0;padding-left:20px}
    .ie-tl li{margin:3px 0}
    .ie-tl b{color:var(--ink)}
    .ie-calc{margin-top:8px;font-weight:600}
    .ie-pill{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;background:rgba(47,111,237,.10);color:var(--brand);white-space:nowrap}
    .ie-pill.ok{background:rgba(22,163,74,.12);color:var(--ok)}
    .ie-pill.bad{background:rgba(220,38,38,.10);color:var(--bad)}
    .ie-pill.warn{background:rgba(245,158,11,.14);color:#d97706}
    .ie-pill.mute{background:rgba(127,127,127,.12);color:var(--muted)}
    /* 四维自评 */
    .ie-dims{display:flex;flex-direction:column;gap:14px}
    .ie-dim{border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;background:rgba(127,127,127,.03)}
    .ie-dim.done{border-color:rgba(22,163,74,.4)}
    .ie-dim-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:10px}
    .ie-dim-k{font-size:12px;font-weight:800;color:var(--brand);background:rgba(47,111,237,.10);border-radius:6px;padding:1px 7px}
    .ie-dim-h b{font-size:15px;color:var(--ink)}
    .ie-dim-val{margin-left:auto;font-size:13px;font-weight:700;color:var(--muted)}
    .ie-dim.done .ie-dim-val{color:var(--ok)}
    .ie-lvls{display:flex;flex-direction:column;gap:6px}
    .ie-lvl{display:flex;gap:10px;align-items:flex-start;padding:7px 10px;border:1px solid var(--border-soft);border-radius:8px;cursor:pointer;font-size:13px;color:var(--ink-soft);line-height:1.6}
    .ie-lvl:hover{border-color:var(--brand)}
    .ie-lvl.on{border-color:var(--brand);background:rgba(47,111,237,.08)}
    .ie-lvl-b{flex:none;font-weight:800;color:var(--ink);min-width:28px}
    .ie-chk{margin-top:10px;font-size:13px;color:var(--ink-soft)}
    .ie-chk-t{font-size:12px;font-weight:700;color:var(--muted);margin-bottom:4px}
    .ie-chk label{display:flex;gap:7px;align-items:flex-start;margin:3px 0;cursor:pointer;line-height:1.55}
    .ie-chk input{margin-top:3px;accent-color:var(--brand)}
    .ie-bands{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
    .ie-band-btn{min-width:44px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink-soft);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    .ie-band-btn:hover{border-color:var(--brand);color:var(--brand)}
    .ie-band-btn.on{background:var(--accent-grad);border-color:transparent;color:#fff}
    .ie-score-sum{margin-top:12px;font-size:13.5px;color:var(--ink-soft)}
    .ie-score-sum b{font-size:18px;color:var(--brand)}
  `;
  document.head.appendChild(style);

  // ---------- 请求 ----------
  // 与 NCE.api 的区别：可选「静默」——页面加载类 GET 失败时由页面自己显示错误卡片，
  // 不再额外弹 toast（后端未就绪时多个 404 连弹会很吵）；用户主动操作（POST）默认仍弹 toast。
  async function request(url, opts, quiet) {
    let r;
    try {
      r = await fetch(url, opts);
    } catch (e) {
      const err = new Error('网络请求失败，请确认服务是否在运行');
      err.status = 0;
      if (!quiet) NCE.toast(err.message, 'bad');
      throw err;
    }
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok || data == null) {
      const err = new Error((data && data.error) || (r.ok ? '服务端返回格式错误' : `请求失败（${r.status}）`));
      err.status = r.status;
      if (!quiet) NCE.toast(err.message, 'bad');
      throw err;
    }
    return data;
  }
  function get(url) {
    return request(url, undefined, true);
  }
  function post(url, body, opts) {
    return request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) },
      !!(opts && opts.quiet)
    );
  }

  // ---------- 小工具 ----------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  // 按本地日历校验（不用 toISOString：东八区本地零点换成 UTC 会落到前一天）
  function isDateStr(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }
  // 两个 YYYY-MM-DD 之间相差的天数（按本地零点，避开夏令时误差）
  function daysBetween(from, to) {
    const a = new Date(from + 'T00:00:00');
    const b = new Date(to + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }
  function fmtBand(v) {
    const n = Number(v);
    return v == null || v === '' || !Number.isFinite(n) ? '—' : n.toFixed(1);
  }
  function fmtDuration(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(s / 60);
    return m ? `${m} 分 ${pad2(s % 60)} 秒` : `${s} 秒`;
  }
  function fmtClock(sec) {
    const s = Math.max(0, Math.floor(Math.abs(Number(sec) || 0)));
    return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  }
  function fmtDateTime(ts) {
    const d = new Date(Number(ts) || 0);
    if (!Number(ts) || Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  // phase 可能是 key 字符串或 { key, name } 对象
  function phaseName(phase) {
    if (!phase) return '';
    if (typeof phase === 'object') return phase.name || PHASE_NAME[phase.key] || phase.key || '';
    return PHASE_NAME[phase] || String(phase);
  }
  function examTypeLabel(t) {
    return t === 'G' ? 'G 类（培训类）' : 'A 类（学术类）';
  }
  // 按档案隔离的 localStorage key（与 profile-store.js 一致：default 档案不加前缀）
  function storeKey(name) {
    const pid = (window.NCEStore && window.NCEStore.profileId) || 'default';
    const k = 'nce-ielts-' + name;
    return pid === 'default' ? k : pid + ':' + k;
  }
  function errorHtml(title, err) {
    const status = err && typeof err.status === 'number' ? err.status : null;
    let hint = '';
    if (status === 404) hint = '后端的雅思备考接口还没有就绪（404），更新服务端后再试。';
    else if (status === 0) hint = '网络连接失败，请确认服务在运行。';
    const detail = err && err.message ? err.message : '';
    return (
      '<div class="ie-err">' +
      `<div class="ie-err-t">⚠️ ${esc(title)}</div>` +
      (hint ? `<div class="ie-err-d">${esc(hint)}</div>` : '') +
      (detail ? `<div class="ie-err-d ie-muted">${esc(detail)}</div>` : '') +
      '<button type="button" class="btn small ie-retry">重试</button>' +
      '</div>'
    );
  }
  function bindRetry(root, fn) {
    root.querySelectorAll('.ie-retry').forEach((b) => { b.onclick = fn; });
  }

  // ---------- 评分维度与四维自评（写作 / 口语共用）----------
  // 选分只能是 4–9 的 0.5 步长
  const BAND_STEPS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
  const DIM_CC = { key: 'CC', name: 'Coherence and Cohesion', nameCn: '连贯与衔接' };
  const DIM_LR = { key: 'LR', name: 'Lexical Resource', nameCn: '词汇丰富度' };
  const DIM_GRA = { key: 'GRA', name: 'Grammatical Range and Accuracy', nameCn: '语法多样性与准确性' };
  const DIM_TA = { key: 'TA', name: 'Task Achievement', nameCn: '任务完成' };
  // rubrics 接口不可用时的兜底：只有维度名称，没有分档描述，保证仍能自评提交
  const FALLBACK_DIMS = {
    task1A: [DIM_TA, DIM_CC, DIM_LR, DIM_GRA],
    task1G: [DIM_TA, DIM_CC, DIM_LR, DIM_GRA],
    task2: [{ key: 'TR', name: 'Task Response', nameCn: '任务回应' }, DIM_CC, DIM_LR, DIM_GRA],
    speaking: [
      { key: 'FC', name: 'Fluency and Coherence', nameCn: '流利与连贯' },
      DIM_LR,
      DIM_GRA,
      { key: 'P', name: 'Pronunciation', nameCn: '发音' },
    ],
  };
  let rubricsPromise = null;
  function loadRubrics() {
    if (!rubricsPromise) {
      rubricsPromise = get('/api/ielts/rubrics').catch((e) => {
        rubricsPromise = null; // 失败不缓存，下次再试
        throw e;
      });
    }
    return rubricsPromise;
  }
  // kind: task1A | task1G | task2 | speaking → { dims, fallback, error }
  async function rubricDims(kind) {
    try {
      const r = await loadRubrics();
      const dims = kind === 'speaking' ? r && r.speaking : r && r.writing && r.writing[kind];
      if (Array.isArray(dims) && dims.length && dims.every((d) => d && d.key)) return { dims, fallback: false };
      return { dims: FALLBACK_DIMS[kind] || [], fallback: true, error: new Error('评分维度数据缺失') };
    } catch (e) {
      return { dims: FALLBACK_DIMS[kind] || [], fallback: true, error: e };
    }
  }
  // D5：四维平均后向下取整到 0.5（服务端为准，这里只做预览）
  function floorHalf(v) {
    return Math.floor(Number(v) * 2) / 2;
  }

  // 在 container 里渲染四维自评表单；返回 { getScores() → { KEY: band } | null, missing() → [维度名] }
  function mountScoreForm(container, dims) {
    const chosen = {};
    container.innerHTML =
      '<div class="ie-dims">' +
      dims.map((d) => {
        const levels = (Array.isArray(d.levels) ? d.levels : [])
          .filter((l) => l && Number.isFinite(Number(l.band)))
          .slice()
          .sort((a, b) => Number(a.band) - Number(b.band));
        const checklist = (Array.isArray(d.checklist) ? d.checklist : []).filter((c) => c != null && String(c).trim());
        return (
          `<div class="ie-dim" data-key="${esc(d.key)}">` +
          '<div class="ie-dim-h">' +
          `<span class="ie-dim-k">${esc(d.key)}</span><b>${esc(d.name || d.key)}</b>` +
          (d.nameCn ? `<span class="ie-muted">${esc(d.nameCn)}</span>` : '') +
          '<span class="ie-dim-val">未评分</span>' +
          '</div>' +
          (levels.length
            ? '<div class="ie-lvls">' +
              levels.map((l) => `<div class="ie-lvl" data-band="${Number(l.band)}" title="选 ${Number(l.band)} 分"><span class="ie-lvl-b">${Number(l.band)}</span><span>${esc(l.desc || '')}</span></div>`).join('') +
              '</div>'
            : '') +
          (checklist.length
            ? '<div class="ie-chk"><div class="ie-chk-t">自查清单（只帮你回顾，不计分）</div>' +
              checklist.map((c) => `<label><input type="checkbox"><span>${esc(c)}</span></label>`).join('') +
              '</div>'
            : '') +
          `<div class="ie-bands" role="group" aria-label="${esc(d.key)} 分数">` +
          BAND_STEPS.map((b) => `<button type="button" class="ie-band-btn" data-v="${b}">${b.toFixed(1)}</button>`).join('') +
          '</div>' +
          '</div>'
        );
      }).join('') +
      '</div>' +
      '<div class="ie-score-sum"></div>';

    const sumEl = container.querySelector('.ie-score-sum');
    function paintSum() {
      const vals = dims.map((d) => chosen[d.key]).filter((v) => v != null);
      if (vals.length < dims.length) {
        sumEl.innerHTML = `已评 ${vals.length} / ${dims.length} 个维度`;
        return;
      }
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      sumEl.innerHTML = `四维平均 ${avg.toFixed(2)}，向下取整到 0.5 → 预计总分 <b>${floorHalf(avg).toFixed(1)}</b>（以服务端计算为准）`;
    }
    function choose(dimEl, v) {
      if (!BAND_STEPS.includes(v)) return;
      chosen[dimEl.dataset.key] = v;
      dimEl.classList.add('done');
      dimEl.querySelector('.ie-dim-val').textContent = `${v.toFixed(1)} 分`;
      dimEl.querySelectorAll('.ie-band-btn').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === v));
      dimEl.querySelectorAll('.ie-lvl').forEach((l) => l.classList.toggle('on', Number(l.dataset.band) === v));
      paintSum();
    }
    container.querySelectorAll('.ie-dim').forEach((dimEl) => {
      dimEl.querySelectorAll('.ie-band-btn').forEach((b) => { b.onclick = () => choose(dimEl, Number(b.dataset.v)); });
      dimEl.querySelectorAll('.ie-lvl').forEach((l) => { l.onclick = () => choose(dimEl, Number(l.dataset.band)); });
    });
    paintSum();
    return {
      getScores() {
        const out = {};
        for (const d of dims) {
          if (chosen[d.key] == null) return null;
          out[d.key] = chosen[d.key];
        }
        return out;
      },
      missing() {
        return dims.filter((d) => chosen[d.key] == null).map((d) => d.nameCn || d.name || d.key);
      },
    };
  }

  // ---------- 壳层状态 ----------
  const st = {
    panel: null,
    body: null,
    page: 'plan',
    profile: null,
    derived: null,
    active: false,
    shellReady: false, // 子导航 + 子页容器已渲染（已开启状态）
    loadSeq: 0,
    pageToken: 0,
  };

  function setProfileData(data) {
    if (!data || typeof data !== 'object') return;
    if (data.profile && typeof data.profile === 'object') st.profile = data.profile;
    if (data.derived && typeof data.derived === 'object') st.derived = data.derived;
    st.active = !!(st.profile && st.profile.active === true);
  }

  function headSubText() {
    if (!st.active || !st.profile) return '';
    const p = st.profile;
    const parts = [examTypeLabel(p.examType)];
    const target = p.target && p.target.overall;
    if (target != null) parts.push(`目标 ${fmtBand(target)}`);
    if (p.examDate) parts.push(`考试日 ${p.examDate}`);
    const d = st.derived || {};
    if (Number.isFinite(Number(d.daysLeft))) {
      parts.push(Number(d.daysLeft) >= 0 ? `还有 ${d.daysLeft} 天` : '考试日已过');
    }
    return parts.join(' · ');
  }

  function headHtml() {
    return `<div class="ie-head"><h2>🎯 雅思备考</h2><span class="ie-head-sub" id="ieHeadSub">${esc(headSubText())}</span></div>`;
  }

  function refreshHead() {
    const el = st.panel && st.panel.querySelector('#ieHeadSub');
    if (el) el.textContent = headSubText();
  }

  // 地址栏记录子页（#ielts?page=writing），刷新后停在同一子页；app.js 的 hash 路由会识别它
  function syncHash() {
    if (!st.panel || st.panel.classList.contains('hidden')) return;
    const h = '#ielts?page=' + st.page;
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  function ctxFor(key, token) {
    return {
      page: key,
      profile: st.profile,
      derived: st.derived,
      isActive: () => st.pageToken === token && st.page === key && st.shellReady,
      go,
      reload,
    };
  }

  function leaveCurrent() {
    const impl = pages[st.page];
    if (impl && typeof impl.leave === 'function') {
      try { impl.leave(); } catch (e) { console.error('[ielts] leave', st.page, e); }
    }
  }

  function showPage(key, fresh) {
    if (!PAGE_KEYS.includes(key)) key = 'plan';
    if (st.shellReady && !fresh) leaveCurrent();
    st.page = key;
    const token = ++st.pageToken;
    if (!st.shellReady || !st.body) return;
    st.panel.querySelectorAll('.ie-subnav .subtab').forEach((el) => {
      el.classList.toggle('active', el.dataset.ipage === key);
    });
    syncHash();
    const body = st.body;
    const impl = pages[key];
    if (!impl) {
      body.innerHTML = '<div class="ie-note">这个子页暂不可用（对应脚本未加载），请刷新页面后重试。</div>';
      return;
    }
    body.innerHTML = '<div class="ie-loading">加载中…</div>';
    Promise.resolve()
      .then(() => impl.render(body, ctxFor(key, token)))
      .catch((e) => {
        console.error('[ielts] render', key, e);
        if (st.pageToken !== token) return;
        body.innerHTML = errorHtml('页面出错了', e);
        bindRetry(body, () => showPage(key));
      });
  }

  function renderShell() {
    st.panel.innerHTML =
      '<div class="ie-wrap">' +
      headHtml() +
      '<div class="subtabs ie-subnav">' +
      PAGES.map((p) => `<div class="subtab" data-ipage="${p.key}">${p.icon} ${esc(p.label)}</div>`).join('') +
      '</div>' +
      '<div class="ie-body"></div>' +
      '</div>';
    st.body = st.panel.querySelector('.ie-body');
    st.shellReady = true;
    // 注意：子导航用 data-ipage 而非 data-tab，避免被 app.js 的全局 .subtab 点击路由接管
    st.panel.querySelectorAll('.ie-subnav .subtab').forEach((el) => {
      el.onclick = () => {
        if (el.dataset.ipage === st.page) return;
        showPage(el.dataset.ipage);
        window.scrollTo(0, 0);
      };
    });
    showPage(st.page, true);
  }

  function renderLoadError(err) {
    st.panel.innerHTML = '<div class="ie-wrap">' + headHtml() + errorHtml('雅思备考档案加载失败', err) + '</div>';
    bindRetry(st.panel, () => loadShell());
  }

  async function loadShell() {
    if (!st.panel) return;
    const seq = ++st.loadSeq;
    if (st.shellReady) leaveCurrent();
    st.shellReady = false;
    st.body = null;
    st.pageToken++;
    st.panel.innerHTML = '<div class="ie-wrap">' + headHtml() + '<div class="ie-loading">加载中…</div></div>';
    let data;
    try {
      data = await get('/api/ielts/profile');
    } catch (e) {
      if (seq === st.loadSeq) renderLoadError(e);
      return;
    }
    if (seq !== st.loadSeq) return;
    setProfileData(data);
    if (st.active) renderShell();
    else renderOnboard();
  }

  // ---------- 开启引导 ----------
  function weeksUntil(examDate) {
    const days = daysBetween(todayStr(), examDate);
    return { days, weeks: Math.ceil(days / 7) };
  }

  function calcLineHtml(examDate) {
    if (!isDateStr(examDate)) return '请选择有效的考试日期。';
    const { days, weeks } = weeksUntil(examDate);
    if (days <= 0) return '考试日需要晚于今天。';
    const eff = Math.min(52, Math.max(4, weeks));
    const perDay = 600 / (eff * 7);
    let s = `按你选的考试日：还有 <b>${days}</b> 天（约 <b>${weeks}</b> 周），600 小时折合 <b>每天约 ${perDay.toFixed(1)} 小时</b>。`;
    if (weeks < 4) s += ' 不足 4 周，计划会按最短 4 周压缩，强度极高。';
    else if (weeks > 52) s += ' 超过 52 周，计划会按最长 52 周拉伸。';
    return s;
  }

  function renderOnboard() {
    st.shellReady = false;
    const p = st.profile || {};
    // 之前开启过（有 startDate）就沿用旧设置，否则用默认值
    const used = !!p.startDate;
    const examType = used && p.examType === 'G' ? 'G' : used && p.examType === 'A' ? 'A' : DEFAULTS.examType;
    const examDate = used && isDateStr(p.examDate) && p.examDate > todayStr() ? p.examDate : DEFAULTS.examDate;
    const t = used && p.target ? Number(p.target.overall) : NaN;
    const target = TARGET_OPTIONS.includes(t) ? t : DEFAULTS.target;
    const minDate = todayStr();

    st.panel.innerHTML =
      '<div class="ie-wrap">' +
      headHtml() +
      '<div class="ie-card">' +
      '<h3>🎯 开启雅思备考</h3>' +
      '<p class="ie-lead">设好考试类型、考试日和目标分，系统按 26 周三阶段模板生成每天的任务清单；以后改考试日，计划会自动压缩或拉伸。</p>' +
      '<div class="ie-form">' +
      '<div class="ie-field"><span class="ie-label">考试类型</span><div class="chips" id="ieObType">' +
      `<div class="chip${examType === 'A' ? ' active' : ''}" data-v="A">A 类 · 学术类（Academic）</div>` +
      `<div class="chip${examType === 'G' ? ' active' : ''}" data-v="G">G 类 · 培训类（General）</div>` +
      '</div></div>' +
      '<div class="ie-row">' +
      `<div class="ie-field"><label class="ie-label" for="ieObDate">考试日期</label><input class="ie-input" type="date" id="ieObDate" value="${esc(examDate)}" min="${esc(minDate)}"></div>` +
      '<div class="ie-field"><label class="ie-label" for="ieObTarget">目标总分</label><select id="ieObTarget">' +
      TARGET_OPTIONS.map((v) => `<option value="${v}"${v === target ? ' selected' : ''}>${v.toFixed(1)}</option>`).join('') +
      '</select></div>' +
      '</div>' +
      '<div class="ie-row"><button type="button" class="btn primary" id="ieObStart">开启雅思备考</button><span class="ie-msg" id="ieObMsg"></span></div>' +
      '</div>' +
      '<div class="ie-note ie-tl">' +
      '<div class="ie-tl-t">⏳ 时间线说明（请先看完）</div>' +
      '<ul>' +
      '<li>从 <b>A2</b> 到雅思 <b>7.0</b> 要跨 B1、B2、C1 三档，大约需要 <b>600 小时</b>有效学习。</li>' +
      '<li>按 26 周算，相当于<b>每天 3–3.5 小时</b>，这是<b>非常激进</b>的时间线。</li>' +
      '<li>计划分三阶段：基础期（第 1–8 周，A2→B1）、专项期（第 9–20 周，B1→B2）、冲刺期（第 21–26 周，B2→C1）。</li>' +
      '<li>第 8 / 14 / 20 周设检查点：不达标时会建议加量、把考试日推迟 4–8 周，或把目标暂调到 6.5。只给提示，不会自动修改。</li>' +
      '</ul>' +
      `<div class="ie-calc" id="ieObCalc">${calcLineHtml(examDate)}</div>` +
      '</div>' +
      '</div>' +
      '</div>';

    const typeBox = st.panel.querySelector('#ieObType');
    typeBox.querySelectorAll('.chip').forEach((c) => {
      c.onclick = () => typeBox.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
    });
    const dateEl = st.panel.querySelector('#ieObDate');
    const calcEl = st.panel.querySelector('#ieObCalc');
    dateEl.oninput = () => { calcEl.innerHTML = calcLineHtml(dateEl.value); };
    const btn = st.panel.querySelector('#ieObStart');
    const msg = st.panel.querySelector('#ieObMsg');
    btn.onclick = async () => {
      const typeChip = typeBox.querySelector('.chip.active');
      const examTypeVal = typeChip && typeChip.dataset.v === 'G' ? 'G' : 'A';
      const dateVal = dateEl.value;
      const targetVal = Number(st.panel.querySelector('#ieObTarget').value);
      msg.className = 'ie-msg bad';
      if (!isDateStr(dateVal) || dateVal <= todayStr()) {
        msg.textContent = '考试日期需要是今天之后的有效日期';
        return;
      }
      if (!TARGET_OPTIONS.includes(targetVal)) {
        msg.textContent = '请选择目标分';
        return;
      }
      btn.disabled = true;
      msg.className = 'ie-msg';
      msg.textContent = '正在开启…';
      try {
        const r = await post('/api/ielts/profile', {
          active: true,
          examType: examTypeVal,
          examDate: dateVal,
          target: { overall: targetVal },
        });
        setProfileData(r);
      } catch (e) {
        btn.disabled = false;
        msg.className = 'ie-msg bad';
        msg.textContent = '开启失败：' + e.message;
        return;
      }
      // 顺手把学习计划预设切到「雅思」；失败不影响开启（后端可能尚未支持该预设）
      try {
        await post('/api/plan/level', { level: 'ielts' }, { quiet: true });
      } catch (e) {
        NCE.toast('学习计划预设没能切到「雅思」，可稍后在「学习计划」页手动选择', 'warn');
      }
      NCE.toast('🎯 雅思备考已开启', 'ok');
      loadShell();
    };
  }

  // ---------- 对外 ----------
  function go(page) {
    const key = PAGE_KEYS.includes(page) ? page : 'plan';
    const visible = st.panel && !st.panel.classList.contains('hidden');
    if (!visible) {
      NCE.pendingIelts = { page: key };
      NCE.gotoTab('ielts');
      return;
    }
    if (!st.shellReady) {
      st.page = key; // 未开启或加载中：开启后落到该子页
      return;
    }
    if (key === st.page) return;
    showPage(key);
    window.scrollTo(0, 0);
  }

  // 重新拉档案并重绘（改了考试日 / 类型 / 目标后调用）
  function reload(page) {
    if (page && PAGE_KEYS.includes(page)) st.page = page;
    return loadShell();
  }

  // 标签被隐藏时通知当前子页（停录音、存草稿）
  function watchHidden(panel) {
    if (panel._ieWatcher || !window.MutationObserver) return;
    let wasHidden = panel.classList.contains('hidden');
    panel._ieWatcher = new MutationObserver(() => {
      const hidden = panel.classList.contains('hidden');
      if (hidden && !wasHidden && st.shellReady) {
        const impl = pages[st.page];
        if (impl && typeof impl.pause === 'function') {
          try { impl.pause(); } catch (e) { console.error('[ielts] pause', st.page, e); }
        }
      }
      wasHidden = hidden;
    });
    panel._ieWatcher.observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  function onShow(panel) {
    st.panel = panel;
    watchHidden(panel);
    const pend = NCE.pendingIelts;
    NCE.pendingIelts = null;
    const want = pend && PAGE_KEYS.includes(pend.page) ? pend.page : null;
    // 无深链时优先让当前子页恢复现场（如写作写到一半去查了别的页面）
    if (!want && st.shellReady && st.body && st.body.isConnected) {
      const impl = pages[st.page];
      let kept = false;
      try { kept = !!(impl && typeof impl.resume === 'function' && impl.resume()); } catch (e) { kept = false; }
      if (kept) {
        syncHash();
        return;
      }
    }
    if (want) st.page = want;
    loadShell();
  }

  NCE.ielts = {
    registerPage(key, impl) {
      if (!PAGE_KEYS.includes(key) || !impl || typeof impl.render !== 'function') {
        console.error('[ielts] registerPage 参数无效', key);
        return;
      }
      pages[key] = impl;
    },
    get,
    post,
    go,
    reload,
    currentPage: () => st.page,
    getProfile: () => ({ profile: st.profile, derived: st.derived, active: st.active }),
    setProfileData(data) {
      setProfileData(data);
      refreshHead();
    },
    todayStr,
    isDateStr,
    daysBetween,
    fmtBand,
    fmtDuration,
    fmtClock,
    fmtDateTime,
    phaseName,
    examTypeLabel,
    storeKey,
    errorHtml,
    bindRetry,
    rubricDims,
    mountScoreForm,
    floorHalf,
    BAND_STEPS,
    TARGET_OPTIONS,
    PHASE_NAME,
  };

  NCE.registerFeature({ id: 'ielts', label: '雅思备考', icon: '🎯', onShow });
})();
