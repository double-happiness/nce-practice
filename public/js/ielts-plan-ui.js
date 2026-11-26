'use strict';
// 雅思备考 · 总览计划子页：倒计时、三阶段进度条、本周重点与 tips、今日任务清单（external 可打勾）、
// 后两周预告、检查点卡片（状态 + 建议）、成绩概况（听说读写四项 + 总分估算）、档案设置（考试日 / 类型 / 目标）。
// 接口：GET /api/ielts/plan、GET /api/ielts/summary、POST /api/ielts/plan/check、POST /api/ielts/profile
(function () {
  const NCE = window.NCE;
  const IE = NCE && NCE.ielts;
  if (!IE || !IE.registerPage) return;
  const esc = NCE.escapeHtml;

  // 计划接口缺 phases 时的兜底（与 data/ielts/plan.json 模板一致）
  const DEFAULT_PHASES = [
    { key: 'foundation', name: '基础期', weeks: [1, 8], cefrGoal: 'B1' },
    { key: 'skills', name: '专项期', weeks: [9, 20], cefrGoal: 'B2' },
    { key: 'sprint', name: '冲刺期', weeks: [21, 26], cefrGoal: 'C1' },
  ];
  const TEMPLATE_WEEKS = 26;
  const CP_STATUS = {
    future: { label: '未到', cls: 'mute' },
    due: { label: '待检查', cls: '' },
    passed: { label: '已达标', cls: 'ok' },
    failed: { label: '未达标', cls: 'bad' },
  };
  // 与 ielts-history-ui.js 约定的一次性标记：值为记录页标签 key
  const HISTORY_TAB_KEY = 'nce-ielts-history-tab';
  const DETAIL_LABEL = {
    vocabCoverage: '词汇覆盖率', vocab: '词汇覆盖率', vocabBand: '词汇段',
    writing: '写作均分', writingAvg: '写作均分', speaking: '口语均分', speakingAvg: '口语均分',
  };

  const style = document.createElement('style');
  style.textContent = `
    .iep-hero{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
    .iep-days{flex:none;text-align:center;padding:12px 20px;border-radius:var(--radius);background:var(--accent-grad-soft);border:1px solid var(--border-soft)}
    .iep-days b{display:block;font-size:40px;font-weight:900;line-height:1.05;color:var(--brand)}
    .iep-days span{font-size:12px;color:var(--muted);font-weight:600}
    .iep-hero-main{flex:1;min-width:220px;font-size:14px;color:var(--ink-soft);line-height:1.8}
    .iep-hero-main .t{font-size:16px;font-weight:800;color:var(--ink)}
    .iep-phases{position:relative;margin-top:16px}
    .iep-phase-row{display:flex;gap:3px;height:12px;border-radius:999px;overflow:hidden}
    .iep-seg{position:relative;background:rgba(127,127,127,.16);overflow:hidden}
    .iep-seg i{position:absolute;left:0;top:0;bottom:0;background:var(--accent-grad)}
    .iep-seg.cur{box-shadow:inset 0 0 0 1px var(--brand)}
    .iep-marker{position:absolute;top:-4px;width:3px;height:20px;border-radius:2px;background:var(--ink);transform:translateX(-50%)}
    .iep-phase-labels{display:flex;gap:3px;margin-top:6px}
    .iep-phase-labels div{font-size:12px;color:var(--muted);line-height:1.4;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .iep-phase-labels div.cur{color:var(--brand);font-weight:700}
    .iep-tips{margin:8px 0 0;padding-left:20px;font-size:13px;color:var(--ink-soft);line-height:1.75}
    .iep-focus{font-size:15px;font-weight:700;color:var(--ink);line-height:1.6}
    .iep-tasks{display:flex;flex-direction:column;gap:8px}
    .iep-task{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border-soft);border-radius:var(--radius-sm);background:rgba(127,127,127,.04)}
    .iep-task.met{background:rgba(22,163,74,.07);border-color:rgba(22,163,74,.3)}
    .iep-task-ic{flex:none;width:24px;text-align:center;font-size:18px}
    .iep-task-ic input{width:18px;height:18px;accent-color:var(--brand);cursor:pointer}
    .iep-task-main{flex:1;min-width:0}
    .iep-task-t{font-size:14px;color:var(--ink);font-weight:600;line-height:1.5}
    .iep-task-sub{font-size:12px;color:var(--muted);margin-top:2px}
    .iep-mini-bar{height:5px;border-radius:3px;background:rgba(127,127,127,.16);overflow:hidden;margin-top:6px;max-width:260px}
    .iep-mini-bar i{display:block;height:100%;background:var(--accent-grad)}
    .iep-done{flex:none;font-size:12px;font-weight:700;color:var(--ok)}
    .iep-tag{display:inline-block;margin-left:6px;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:rgba(245,158,11,.14);color:#d97706;vertical-align:1px}
    .iep-up{padding:10px 0;border-bottom:1px dashed var(--border)}
    .iep-up:last-child{border-bottom:0;padding-bottom:0}
    .iep-up:first-child{padding-top:0}
    .iep-up-t{font-size:14px;font-weight:700;color:var(--ink)}
    .iep-up-s{font-size:13px;color:var(--muted);margin-top:3px;line-height:1.6}
    .iep-cps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
    .iep-cp{border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;background:rgba(127,127,127,.04)}
    .iep-cp.failed{border-color:rgba(220,38,38,.35)}
    .iep-cp.passed{border-color:rgba(22,163,74,.35)}
    .iep-cp.due{border-color:var(--brand)}
    .iep-cp-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px}
    .iep-cp-h b{font-size:14px;color:var(--ink)}
    .iep-cp ul{margin:0;padding-left:18px;font-size:13px;color:var(--ink-soft);line-height:1.7}
    .iep-cp-detail{font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.6}
    .iep-cp-sug{margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)}
    .iep-cp-sug-t{font-size:12px;font-weight:700;color:var(--bad);margin-bottom:4px}
    .iep-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
    .iep-sum div{border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:10px 12px}
    .iep-sum b{display:block;font-size:22px;font-weight:800;color:var(--ink);line-height:1.2}
    .iep-sum span{font-size:12px;color:var(--muted)}
    .iep-prof{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}
  `;
  document.head.appendChild(style);

  // 实际周 i → 模板周（D6）：round((i−1)×26/实际周数)+1
  function templateWeekOf(i, totalWeeks) {
    return Math.min(TEMPLATE_WEEKS, Math.max(1, Math.round(((i - 1) * TEMPLATE_WEEKS) / totalWeeks) + 1));
  }

  // 每个阶段在实际周上的跨度（反推 D6 映射），用于画按比例分段的阶段条
  function phaseSegments(phases, totalWeeks) {
    const segs = phases.map((p) => ({ p, from: null, to: null, count: 0 }));
    for (let i = 1; i <= totalWeeks; i++) {
      const tw = templateWeekOf(i, totalWeeks);
      const s = segs.find((x) => Array.isArray(x.p.weeks) && tw >= x.p.weeks[0] && tw <= x.p.weeks[1]);
      if (!s) continue;
      s.count++;
      if (s.from == null) s.from = i;
      s.to = i;
    }
    return segs.filter((s) => s.count > 0);
  }

  function phaseBarHtml(phases, totalWeeks, currentWeek) {
    const list = Array.isArray(phases) && phases.length && phases.every((p) => Array.isArray(p.weeks)) ? phases : DEFAULT_PHASES;
    const total = Math.max(1, Number(totalWeeks) || TEMPLATE_WEEKS);
    const cur = Math.min(total, Math.max(0, Number(currentWeek) || 0));
    const segs = phaseSegments(list, total);
    if (!segs.length) return '';
    const bars = segs.map((s) => {
      // 本段内已走过的比例（当前周按走了一半算）
      const passed = cur <= 0 ? 0 : Math.min(s.count, Math.max(0, cur - s.from + 0.5));
      const isCur = cur >= s.from && cur <= s.to;
      return `<div class="iep-seg${isCur ? ' cur' : ''}" style="flex:${s.count}"><i style="width:${((passed / s.count) * 100).toFixed(1)}%"></i></div>`;
    }).join('');
    const labels = segs.map((s) => {
      const isCur = cur >= s.from && cur <= s.to;
      const goal = s.p.cefrGoal ? ` → ${esc(s.p.cefrGoal)}` : '';
      const name = s.p.name || IE.phaseName(s.p.key);
      return `<div class="${isCur ? 'cur' : ''}" style="flex:${s.count}" title="${esc(name)} 第 ${s.from}–${s.to} 周">${esc(name)} 第 ${s.from}–${s.to} 周${goal}</div>`;
    }).join('');
    const marker = cur > 0 ? `<span class="iep-marker" style="left:${(((cur - 0.5) / total) * 100).toFixed(2)}%" title="当前第 ${cur} 周"></span>` : '';
    return `<div class="iep-phases"><div class="iep-phase-row">${bars}</div>${marker}<div class="iep-phase-labels">${labels}</div></div>`;
  }

  function heroHtml(profile, derived, plan) {
    const p = profile || {};
    const d = derived || {};
    const daysLeft = Number(d.daysLeft);
    const totalWeeks = Number((plan && plan.totalWeeks) || d.totalWeeks) || null;
    const currentWeek = Number((plan && plan.currentWeek) || d.currentWeek) || null;
    const phase = IE.phaseName((plan && plan.week && plan.week.phase) || d.phase);
    let daysHtml;
    if (!Number.isFinite(daysLeft)) daysHtml = '<b>—</b><span>距考试</span>';
    else if (daysLeft > 0) daysHtml = `<b>${daysLeft}</b><span>天后考试</span>`;
    else if (daysLeft === 0) daysHtml = '<b>今天</b><span>考试日，加油！</span>';
    else daysHtml = '<b>已过</b><span>考试日已过，可在下方改期</span>';
    const weekLine = currentWeek && totalWeeks
      ? `第 <b>${Math.min(currentWeek, totalWeeks)}</b> / ${totalWeeks} 周${phase ? ' · ' + esc(phase) : ''}`
      : '';
    const target = p.target && p.target.overall != null ? IE.fmtBand(p.target.overall) : '—';
    return (
      '<div class="ie-card">' +
      '<div class="iep-hero">' +
      `<div class="iep-days">${daysHtml}</div>` +
      '<div class="iep-hero-main">' +
      `<div class="t">${esc(IE.examTypeLabel(p.examType))} · 目标 ${esc(target)}</div>` +
      `<div>考试日 ${esc(p.examDate || '—')}${p.startDate ? ` · 开始于 ${esc(p.startDate)}` : ''}${p.baseline ? ` · 起点 ${esc(p.baseline)}` : ''}</div>` +
      (weekLine ? `<div>${weekLine}</div>` : '') +
      '</div></div>' +
      (totalWeeks ? phaseBarHtml(plan && plan.phases, totalWeeks, currentWeek) : '') +
      '</div>'
    );
  }

  function tipsHtml(tips) {
    if (!tips) return '';
    const list = Array.isArray(tips) ? tips : [tips];
    const items = list.filter((t) => t != null && String(t).trim());
    if (!items.length) return '';
    return `<ul class="iep-tips">${items.map((t) => `<li>💡 ${esc(t)}</li>`).join('')}</ul>`;
  }

  function weekCardHtml(plan) {
    const w = plan.week;
    if (!w) return '';
    const cur = plan.currentWeek;
    // w.week 是实际周，w.templateWeek 才是压缩 / 拉伸后对应的模板周（lib/ielts-plan.js buildPlanView）
    const tw = Number(w.templateWeek);
    const tmpl = tw && cur && tw !== Number(cur) ? `<span class="ie-h3-sub">对应模板第 ${esc(String(tw))} 周</span>` : '';
    return (
      '<div class="ie-card">' +
      `<h3>📌 第 ${esc(String(cur || w.week || '—'))} 周重点 ${tmpl}</h3>` +
      `<div class="iep-focus">${esc(w.focus || '本周暂无重点说明')}</div>` +
      tipsHtml(w.tips) +
      '</div>'
    );
  }

  // 任务完成状态：
  // - internal：按 done / target 统计（逻辑不变）
  // - external：后端给 per（day | week）、target、done（今天 / 本周已打勾天数）、met（done >= target）
  //   和 checkedToday（今天是否已打勾）。复选框只反映今天是否打勾，「已完成」只看 met。
  function taskState(t) {
    const ext = t.kind === 'external';
    if (ext) {
      const per = t.per === 'week' ? 'week' : 'day';
      const target = Math.max(1, Number(t.target) || 1);
      const doneN = Math.max(0, Number(t.done) || 0);
      const met = typeof t.met === 'boolean' ? t.met : doneN >= target;
      return { ext, per, target, doneN, met, checkedToday: t.checkedToday === true };
    }
    const target = Math.max(0, Number(t.target) || 0);
    const doneN = Math.max(0, Number(t.done) || 0);
    const met = t.met === true || (target > 0 && doneN >= target);
    return { ext, target, doneN, met };
  }

  function taskSubText(t, s) {
    let text;
    if (!s.ext) text = `${s.doneN} / ${s.target || '—'} ${esc(t.unit || '')}`;
    else if (s.per === 'week') text = `本周 ${s.doneN} / ${s.target} 次 · ${s.checkedToday ? '今天已打勾' : '做完当天打勾'}`;
    else text = s.checkedToday ? '今天已打勾' : '外部资料，完成后手动打勾';
    return text + (t.minutes ? ` · 约 ${esc(String(t.minutes))} 分钟` : '');
  }

  function taskRowHtml(t, i) {
    const s = taskState(t);
    // internal 与按周的 external 显示进度条；按天的 external 只有勾选框
    const showBar = !s.ext || s.per === 'week';
    const pct = s.target ? Math.min(100, Math.round((s.doneN / s.target) * 100)) : 0;
    const icon = s.ext
      ? `<input type="checkbox" class="iep-check" data-i="${i}"${s.checkedToday ? ' checked' : ''} aria-label="今天已完成">`
      : s.met ? '✅' : '⬜';
    const sub = taskSubText(t, s);
    let action = '';
    if (s.met) action = '<span class="iep-done">已完成</span>';
    // 外部任务（剑雅）做完去记录页录成绩，按钮带 data-ext，点击时由 bindToday 留标记打开「剑雅」标签
    else if (t.tab && s.ext) action = `<button type="button" class="btn small iep-go" data-tab="${esc(t.tab)}" data-ext="1">录成绩 →</button>`;
    else if (t.tab) action = `<button type="button" class="btn small iep-go" data-tab="${esc(t.tab)}">去做 →</button>`;
    return (
      `<div class="iep-task${s.met ? ' met' : ''}" data-i="${i}">` +
      `<div class="iep-task-ic">${icon}</div>` +
      '<div class="iep-task-main">' +
      `<div class="iep-task-t">${esc(t.label || t.key || '任务')}${s.ext ? '<span class="iep-tag">外部</span>' : ''}</div>` +
      `<div class="iep-task-sub">${sub}</div>` +
      (showBar ? `<div class="iep-mini-bar"><i style="width:${pct}%"></i></div>` : '') +
      '</div>' +
      action +
      '</div>'
    );
  }

  function todaySummaryText(tasks) {
    const met = tasks.filter((t) => taskState(t).met).length;
    const minutes = tasks.reduce((n, t) => n + (Number(t.minutes) || 0), 0);
    return `${met} / ${tasks.length} 项完成${minutes ? ` · 合计约 ${minutes} 分钟` : ''}`;
  }

  function todayCardHtml(tasks) {
    return (
      '<div class="ie-card" id="iepToday">' +
      `<h3>✅ 今日任务 <span class="ie-h3-sub" id="iepTodaySum">${esc(todaySummaryText(tasks))}</span></h3>` +
      (tasks.length
        ? `<div class="iep-tasks">${tasks.map(taskRowHtml).join('')}</div>`
        : '<div class="ie-empty">今天没有安排任务（可能是考试周降量或计划尚未生成）。</div>') +
      '<div class="ie-muted" style="margin-top:10px">练习类任务按当天的活动记录自动统计；「外部」任务（如剑雅真题）做完后手动打勾，或点「录成绩」录入分数时顺带打勾。</div>' +
      '</div>'
    );
  }

  // 后端 upcoming[] 只给 taskCount / minutesPerDay，不带 tasks 数组
  function upcomingLoadText(w) {
    const n = Number(w.taskCount);
    const m = Number(w.minutesPerDay);
    const parts = [];
    if (Number.isFinite(n) && n > 0) parts.push(`${n} 项任务`);
    if (Number.isFinite(m) && m > 0) parts.push(`约 ${m} 分钟/天`);
    return parts.join(' · ');
  }

  function upcomingHtml(list) {
    if (!Array.isArray(list) || !list.length) return '';
    const rows = list.map((w) => {
      const load = upcomingLoadText(w);
      const phase = w.phaseName || IE.phaseName(w.phase);
      return (
        '<div class="iep-up">' +
        `<div class="iep-up-t">第 ${esc(String(w.week != null ? w.week : '—'))} 周${phase ? ' · ' + esc(phase) : ''}</div>` +
        `<div class="iep-up-s">${esc(w.focus || '')}</div>` +
        (load ? `<div class="iep-up-s">${esc(load)}</div>` : '') +
        '</div>'
      );
    }).join('');
    return `<div class="ie-card"><h3>🔭 后两周预告</h3>${rows}</div>`;
  }

  function criteriaItems(c) {
    if (!c || typeof c !== 'object') return [];
    const out = [];
    if (c.vocabBand) {
      out.push(`雅思词汇诊断 ${esc(c.vocabBand)} 段覆盖率 ≥ ${esc(String(c.vocabCoverageMin != null ? c.vocabCoverageMin : '—'))}%`);
    }
    if (c.writingMin != null) out.push(`写作近 3 次自评均分 ≥ ${esc(IE.fmtBand(c.writingMin))}`);
    if (c.speakingMin != null) out.push(`口语近 3 次自评均分 ≥ ${esc(IE.fmtBand(c.speakingMin))}`);
    return out;
  }

  // detail 可能是字符串或对象（实测值），两种都兼容
  function detailHtml(detail) {
    if (detail == null || detail === '') return '';
    if (typeof detail !== 'object') return `<div class="iep-cp-detail">${esc(String(detail))}</div>`;
    const parts = Object.keys(detail).map((k) => {
      const v = detail[k];
      if (v != null && typeof v === 'object') return '';
      const label = DETAIL_LABEL[k] || k;
      const val = v == null ? '暂无数据' : /coverage|vocab$/i.test(k) && typeof v === 'number' ? `${v}%` : String(v);
      return `${esc(label)}：${esc(val)}`;
    }).filter(Boolean);
    return parts.length ? `<div class="iep-cp-detail">实测：${parts.join(' · ')}</div>` : '';
  }

  function suggestionText(s) {
    if (s == null) return '';
    if (typeof s === 'string') return s;
    return s.text || s.label || s.title || '';
  }

  function checkpointsHtml(list) {
    if (!Array.isArray(list) || !list.length) return '';
    const cards = list.map((cp) => {
      const stx = CP_STATUS[cp.status] || CP_STATUS.future;
      const crit = criteriaItems(cp.criteria);
      const sug = (Array.isArray(cp.suggestions) ? cp.suggestions : []).map(suggestionText).filter(Boolean);
      return (
        `<div class="iep-cp ${esc(cp.status || 'future')}">` +
        `<div class="iep-cp-h"><b>${esc(cp.name || '检查点')}</b><span class="ie-pill ${stx.cls}">第 ${esc(String(cp.week != null ? cp.week : '—'))} 周 · ${stx.label}</span></div>` +
        (crit.length ? `<ul>${crit.map((x) => `<li>${x}</li>`).join('')}</ul>` : '') +
        detailHtml(cp.detail) +
        (sug.length
          ? `<div class="iep-cp-sug"><div class="iep-cp-sug-t">建议（只做提示，不会自动修改）</div><ul>${sug.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
          : '') +
        '</div>'
      );
    }).join('');
    return `<div class="ie-card"><h3>🚩 检查点</h3><div class="iep-cps">${cards}</div></div>`;
  }

  // 成绩概况：听力 / 阅读（只有模考计分）、写作 / 口语（自评）、词汇诊断与总分估算
  function summaryHtml(sum) {
    if (!sum || typeof sum !== 'object') return '';
    const l = sum.listening || {};
    const r = sum.reading || {};
    const w = sum.writing || {};
    const s = sum.speaking || {};
    const v = sum.vocab || {};
    const e = sum.estimate || {};
    const has = [l, r, w, s].some((x) => (Number(x.count) || 0) > 0 || (Number(x.practiceCount) || 0) > 0) ||
      v.lastOverall != null || e.overall != null;
    if (!has) return '';
    // 每项说明优先用后端口径 label（整套优先 / 单项），没有时退回原文案
    const cell = (x, name, fallback) =>
      `<div><b>${esc(IE.fmtBand(x.last3Avg))}</b><span>${esc(IE.summaryLabel(x, name) || fallback)}</span></div>`;
    const scoredCell = (x, name) => {
      const p = Number(x.practiceCount) || 0;
      return cell(x, name, `${name}近 3 次模考均分 · 模考 ${Number(x.count) || 0} 次${p ? ` · 练习 ${p} 次` : ''}`);
    };
    return (
      '<div class="ie-card"><h3>📊 成绩概况</h3><div class="iep-sum">' +
      scoredCell(l, '听力') +
      scoredCell(r, '阅读') +
      cell(w, '写作', `写作近 3 次自评均分 · 共 ${Number(w.count) || 0} 篇`) +
      cell(s, '口语', `口语近 3 次自评均分 · 共 ${Number(s.count) || 0} 次`) +
      `<div><b>${v.lastOverall != null ? esc(String(v.lastOverall)) + '%' : '—'}</b><span>最近一次词汇诊断覆盖率</span></div>` +
      `<div><b>${esc(IE.fmtBand(e.overall))}</b><span>总分粗估</span></div>` +
      '</div>' +
      (e.note ? `<div class="ie-muted" style="margin-top:10px;line-height:1.7">📐 ${esc(e.note)}</div>` : '') +
      '</div>'
    );
  }

  function profileCardHtml(profile) {
    const p = profile || {};
    const t = p.target ? Number(p.target.overall) : NaN;
    const target = IE.TARGET_OPTIONS.includes(t) ? t : 7;
    return (
      '<div class="ie-card"><h3>⚙️ 备考档案</h3>' +
      '<div class="iep-prof">' +
      '<div class="ie-field"><span class="ie-label">考试类型</span><div class="chips" id="iepType">' +
      `<div class="chip${p.examType !== 'G' ? ' active' : ''}" data-v="A">A 类 · 学术</div>` +
      `<div class="chip${p.examType === 'G' ? ' active' : ''}" data-v="G">G 类 · 培训</div>` +
      '</div></div>' +
      `<div class="ie-field"><label class="ie-label" for="iepDate">考试日期</label><input class="ie-input" type="date" id="iepDate" value="${esc(p.examDate || '')}"></div>` +
      '<div class="ie-field"><label class="ie-label" for="iepTarget">目标总分</label><select id="iepTarget">' +
      IE.TARGET_OPTIONS.map((v) => `<option value="${v}"${v === target ? ' selected' : ''}>${v.toFixed(1)}</option>`).join('') +
      '</select></div>' +
      '<button type="button" class="btn primary" id="iepSave">保存</button>' +
      '</div>' +
      '<div class="ie-msg" id="iepMsg" style="margin-top:8px"></div>' +
      '<div class="ie-muted">改考试日后，计划会按剩余周数自动压缩或拉伸（最短 4 周、最长 52 周）。</div>' +
      '</div>'
    );
  }

  function bindProfileCard(root, ctx) {
    const typeBox = root.querySelector('#iepType');
    if (!typeBox) return;
    typeBox.querySelectorAll('.chip').forEach((c) => {
      c.onclick = () => typeBox.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
    });
    const btn = root.querySelector('#iepSave');
    const msg = root.querySelector('#iepMsg');
    btn.onclick = async () => {
      const chip = typeBox.querySelector('.chip.active');
      const examType = chip && chip.dataset.v === 'G' ? 'G' : 'A';
      const examDate = root.querySelector('#iepDate').value;
      const overall = Number(root.querySelector('#iepTarget').value);
      msg.className = 'ie-msg bad';
      if (!IE.isDateStr(examDate)) {
        msg.textContent = '请填写有效的考试日期';
        return;
      }
      if (!IE.TARGET_OPTIONS.includes(overall)) {
        msg.textContent = '请选择目标分';
        return;
      }
      btn.disabled = true;
      msg.className = 'ie-msg';
      msg.textContent = '保存中…';
      try {
        const r = await IE.post('/api/ielts/profile', { examType, examDate, target: { overall } });
        IE.setProfileData(r);
      } catch (e) {
        btn.disabled = false;
        msg.className = 'ie-msg bad';
        msg.textContent = '保存失败：' + e.message;
        return;
      }
      NCE.toast('备考档案已更新', 'ok');
      ctx.reload('plan'); // 重新拉档案与计划（周数映射可能变了）
    };
  }

  function bindToday(root, tasks, ctx) {
    root.querySelectorAll('.iep-go').forEach((b) => {
      b.onclick = () => {
        const tab = b.dataset.tab || '';
        // 「录成绩 →」：留一次性标记，记录页读到后直接打开「剑雅」标签（只在目标是记录页时写，避免残留到下次进入）
        if (b.dataset.ext === '1' && tab === 'ielts:history') {
          try {
            sessionStorage.setItem(HISTORY_TAB_KEY, 'external');
          } catch (e) {
            console.warn('[ielts-plan] 写入记录页标签标记失败，记录页将停在上次的标签', e);
          }
        }
        if (tab === 'ielts') ctx.go('plan');
        else if (tab.indexOf('ielts:') === 0) ctx.go(tab.slice(6));
        else NCE.gotoTab(tab);
      };
    });
    root.querySelectorAll('.iep-check').forEach((cb) => {
      cb.onchange = async () => {
        const t = tasks[Number(cb.dataset.i)];
        if (!t) return;
        const done = cb.checked;
        cb.disabled = true;
        try {
          await IE.post('/api/ielts/plan/check', { date: IE.todayStr(), taskKey: t.key, done });
          // 本地同步：今天的勾选变化 ±1 天，met 按 done >= target 重算（与后端口径一致）
          const before = taskState(t);
          if (before.checkedToday !== done) t.done = Math.max(0, before.doneN + (done ? 1 : -1));
          t.checkedToday = done;
          t.met = Math.max(0, Number(t.done) || 0) >= before.target;
        } catch (e) {
          cb.checked = !done; // 失败回滚（toast 已由请求层弹出）
          cb.disabled = false;
          return;
        }
        if (!ctx.isActive()) return;
        const row = root.querySelector(`.iep-task[data-i="${cb.dataset.i}"]`);
        if (row) {
          row.outerHTML = taskRowHtml(t, Number(cb.dataset.i));
          bindToday(root, tasks, ctx);
        }
        const sum = root.querySelector('#iepTodaySum');
        if (sum) sum.textContent = todaySummaryText(tasks);
      };
    });
  }

  async function render(body, ctx) {
    body.innerHTML = '<div class="ie-loading">正在加载备考计划…</div>';
    let plan = null;
    let planErr = null;
    let summary = null;
    await Promise.all([
      IE.get('/api/ielts/plan').then((r) => { plan = r; }, (e) => { planErr = e; }),
      IE.get('/api/ielts/summary').then((r) => { summary = r; }, () => { summary = null; }),
    ]);
    if (!ctx.isActive()) return;
    const prof = IE.getProfile();

    if (!plan) {
      // 计划拉不到时仍显示倒计时和档案设置，方便改期后重试
      body.innerHTML =
        heroHtml(prof.profile, prof.derived, null) +
        '<div class="ie-card">' + IE.errorHtml('备考计划加载失败', planErr) + '</div>' +
        profileCardHtml(prof.profile);
      IE.bindRetry(body, () => render(body, ctx));
      bindProfileCard(body, ctx);
      return;
    }

    const tasks = plan.today && Array.isArray(plan.today.tasks) ? plan.today.tasks : [];
    body.innerHTML =
      heroHtml(prof.profile, prof.derived, plan) +
      (plan.warning ? `<div class="ie-warn" style="margin-top:14px">⏳ ${esc(plan.warning)}</div>` : '') +
      weekCardHtml(plan) +
      todayCardHtml(tasks) +
      upcomingHtml(plan.upcoming) +
      checkpointsHtml(plan.checkpoints) +
      summaryHtml(summary) +
      profileCardHtml(prof.profile);
    bindToday(body, tasks, ctx);
    bindProfileCard(body, ctx);
  }

  IE.registerPage('plan', { render });
})();
