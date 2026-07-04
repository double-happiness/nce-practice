'use strict';
// 「我的水平」总览仪表盘 + 新手引导（首次进入弹一次）
// 数据来源（均为已存在的后端接口，单个失败不拖垮整页）：
//   GET  /api/vocab-test/overview?book=X  听/读/总词汇量（routes/vocaboverview.js）
//   GET  /api/vocab-test/trend?book=X     词汇量趋势点（routes/vocaboverview.js）
//   GET  /api/plan/overview               streak / skills / level（routes/plan.js）
//   GET  /api/progress                    刷题总量 / 正确率（server.js）
//   GET  /api/stats/overview              薄弱语法点（routes/stats.js）
//   GET  /api/stats/training              对话正确率 / 句型薄弱（routes/stats.js）
//   GET  /api/transform/stats             句型转换总正确率（routes/transform.js）
//   GET  /api/meta                        各册课数（server.js）
//   POST /api/plan/level {level}          写入水平预设 starter/medium/sprint（routes/plan.js）
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;
  const esc = NCE.escapeHtml;

  // ---- 注入样式（前缀 lv- 避免冲突，浅色卡片风格与 feat-plan.js 一致）----
  const style = document.createElement('style');
  style.textContent = `
    .lv-wrap{max-width:760px;margin:0 auto}
    .lv-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:12px}
    .lv-head h2{margin:0;font-size:20px}
    .lv-relink{font-size:12px;color:#9ca3af;cursor:pointer;text-decoration:underline;margin-left:auto}
    .lv-relink:hover{color:#2563eb}
    .lv-card{border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-top:14px;box-shadow:0 1px 3px rgba(0,0,0,.05);background:#fff}
    .lv-card h3{margin:0 0 12px;font-size:15px;color:#374151}
    .lv-hero{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
    .lv-hero-badge{font-size:34px;font-weight:800;color:#2563eb;line-height:1.1;padding:14px 20px;border-radius:14px;background:#eff6ff;flex:none}
    .lv-hero-badge .lv-hero-sub{display:block;font-size:12px;font-weight:400;color:#6b7280;margin-top:4px}
    .lv-hero-main{flex:1;min-width:220px}
    .lv-hero-t{font-size:16px;font-weight:700;color:#111827;margin-bottom:6px}
    .lv-hero-d{font-size:14px;color:#4b5563;line-height:1.7}
    .lv-trend-up{color:#059669;font-weight:600}
    .lv-trend-down{color:#d97706;font-weight:600}
    .lv-quads{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
    .lv-quad{border:1px solid #eef2f7;border-radius:10px;background:#fbfcfe;padding:14px}
    .lv-quad-t{font-size:14px;font-weight:700;color:#374151;margin-bottom:8px}
    .lv-quad-n{font-size:26px;font-weight:800;color:#111827;line-height:1.2}
    .lv-quad-n .u{font-size:13px;font-weight:400;color:#9ca3af;margin-left:2px}
    .lv-quad-sub{font-size:12.5px;color:#6b7280;margin-top:6px;line-height:1.6}
    .lv-quad-empty{font-size:13px;color:#9ca3af;line-height:1.6;margin:4px 0 10px}
    .lv-btn{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer}
    .lv-btn:hover{background:#1d4ed8}
    .lv-btn.small{padding:6px 12px;font-size:13px}
    .lv-btn.ghost{background:#fff;color:#2563eb;border:1px solid #bfdbfe}
    .lv-btn.ghost:hover{background:#eff6ff}
    .lv-prog-row{margin-top:12px}
    .lv-prog-row:first-of-type{margin-top:0}
    .lv-prog-top{display:flex;justify-content:space-between;font-size:13px;color:#6b7280;margin-bottom:6px}
    .lv-prog-top b{color:#374151}
    .lv-bar{height:12px;background:#f1f5f9;border-radius:8px;overflow:hidden}
    .lv-bar-fill{height:100%;background:linear-gradient(90deg,#60a5fa,#2563eb);border-radius:8px;transition:width .4s}
    .lv-prog-hint{font-size:12.5px;color:#6b7280;margin-top:6px;line-height:1.6}
    .lv-note{color:#666;font-size:13px;line-height:1.6;background:#f5f7fa;border-radius:8px;padding:10px 14px}
    .lv-fb{padding:12px 14px;border-radius:8px;font-size:14px;background:#fef2f2;border:1px solid #fecaca}
    /* 新手引导弹层 */
    .lv-ob-mask{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px}
    .lv-ob-card{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:26px 24px;box-shadow:0 20px 50px rgba(0,0,0,.25)}
    .lv-ob-title{font-size:19px;font-weight:800;color:#111827;margin-bottom:6px}
    .lv-ob-desc{font-size:14px;color:#6b7280;line-height:1.7;margin-bottom:16px}
    .lv-ob-opt{display:block;width:100%;text-align:left;background:#fbfcfe;border:1px solid #e5e7eb;border-radius:10px;padding:13px 14px;font-size:14.5px;color:#374151;cursor:pointer;margin-top:10px}
    .lv-ob-opt:hover{border-color:#2563eb;background:#eff6ff}
    .lv-ob-opt b{color:#111827}
    .lv-ob-opt .d{display:block;font-size:12.5px;color:#9ca3af;margin-top:3px}
    .lv-ob-skip{display:block;margin:14px auto 0;background:none;border:0;font-size:13px;color:#9ca3af;cursor:pointer;text-decoration:underline}
    .lv-ob-skip:hover{color:#6b7280}
  `;
  document.head.appendChild(style);

  const ONBOARD_KEY = 'nce-onboarded';

  // nce-onboarded 不在 /api/ui-state 白名单里，服务器不会存；
  // NCEStore.set 仍会写本地镜像（localStorage），读取时兜底直接读镜像。
  function onboardMirrorKey() {
    const pid = (window.NCEStore && window.NCEStore.profileId) || 'default';
    return pid === 'default' ? ONBOARD_KEY : pid + ':' + ONBOARD_KEY;
  }
  function hasOnboarded() {
    if (window.NCEStore && window.NCEStore.get(ONBOARD_KEY)) return true;
    try { return !!localStorage.getItem(onboardMirrorKey()); } catch (e) { return false; }
  }
  function markOnboarded() {
    try { if (window.NCEStore) window.NCEStore.set(ONBOARD_KEY, 1); } catch (e) { /* ignore */ }
    try { localStorage.setItem(onboardMirrorKey(), JSON.stringify(1)); } catch (e) { /* ignore */ }
  }

  // ---- CEFR 档位（主要由总词汇量映射）----
  function cefrOf(v) {
    if (v == null || !Number.isFinite(v)) return null;
    if (v < 500) return { code: 'Pre-A1', name: '入门准备', desc: '正在积累最基础的词汇，跟着 NCE1 每天一课，很快就能突破。' };
    if (v < 1000) return { code: 'A1', name: '入门级', desc: '能理解并使用日常最基本的表达，NCE1 的内容正对口。' };
    if (v < 2000) return { code: 'A2', name: '基础级', desc: '能就熟悉的日常话题进行简单交流，可逐步过渡到 NCE2。' };
    if (v <= 3500) return { code: 'B1', name: '进阶级', desc: '能应对旅行、工作中的多数场景，NCE2 精学 + 大量听说是关键。' };
    return { code: 'B1+', name: '进阶级以上', desc: '词汇量已超出 NCE2 主线，可以加码原版阅读与听力保持增长。' };
  }

  function trendHint(latest, avg, avgN, unit) {
    if (!latest || avg == null || avgN < 2) return '';
    const d = latest.estimate - avg;
    if (d > 0) return `<span class="lv-trend-up">↗ 高于近${avgN}次均值 ${d} ${esc(unit)}</span>`;
    if (d < 0) return `<span class="lv-trend-down">↘ 低于近${avgN}次均值 ${-d} ${esc(unit)}</span>`;
    return `→ 与近${avgN}次均值持平`;
  }

  // 四象限小卡：有数据显示数字+趋势；没数据显示引导按钮深链
  function quadCard(title, has, numHtml, subHtml, emptyText, gotoText, gotoTabId) {
    return (
      `<div class="lv-quad"><div class="lv-quad-t">${title}</div>` +
      (has
        ? `<div class="lv-quad-n">${numHtml}</div><div class="lv-quad-sub">${subHtml}</div>`
        : `<div class="lv-quad-empty">${esc(emptyText)}</div>` +
          `<button class="lv-btn small ghost lv-go" data-tab="${esc(gotoTabId)}">${esc(gotoText)} →</button>`) +
      '</div>'
    );
  }

  function fmtWeeks(w) {
    return w >= 1 ? `约 ${w} 周` : '不到 1 周';
  }

  // 打卡进度行：done/total + 按最近 14 天周速估算完成时间
  function progRow(bookLabel, done, viewed, total, perWeek) {
    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
    let hint;
    if (done >= total && total > 0) {
      hint = '本册已全部打卡完成 🎉';
    } else if (perWeek > 0) {
      const weeks = Math.ceil((total - done) / perWeek);
      hint = `最近两周平均每周打卡 ${Math.round(perWeek * 10) / 10} 课，照这个速度${fmtWeeks(weeks)}学完本册`;
    } else if (done > 0) {
      hint = '最近两周没有打卡记录，恢复节奏后这里会估算完成时间';
    } else {
      hint = viewed > 0 ? `已浏览 ${viewed} 课，学完记得在课文页打卡 📅` : '还没开始，本册从第 1 课出发吧';
    }
    return (
      '<div class="lv-prog-row">' +
      `<div class="lv-prog-top"><b>${esc(bookLabel)}</b><span>打卡 ${done} / ${total} 课 · 已学 ✓ ${viewed} 课</span></div>` +
      `<div class="lv-bar"><div class="lv-bar-fill" style="width:${pct}%"></div></div>` +
      `<div class="lv-prog-hint">${esc(hint)}</div>` +
      '</div>'
    );
  }

  function countByBook(keys, book) {
    const prefix = book + '-';
    let n = 0;
    for (const k of keys) if (String(k).indexOf(prefix) === 0) n++;
    return n;
  }

  async function renderLevel(panel) {
    panel.innerHTML = '<div class="lv-wrap"><div class="lv-note">正在汇总你的学习数据…</div></div>';

    if (window.NCEStore && window.NCEStore.ready) {
      try { await window.NCEStore.ready; } catch (e) { /* 离线时用本地镜像 */ }
    }
    const store = window.NCEStore || { get: () => undefined };
    const last = store.get('nce-last-lesson') || null;
    const book = last ? String(last.book) : '1';

    // 并行拉取，单个失败置 null，不拖垮整页
    const [vocabOv, vocabTrend, plan, prog, statsOv, training, tfStats, meta] = await Promise.all([
      NCE.api(`/api/vocab-test/overview?book=${encodeURIComponent(book)}`).catch(() => null),
      NCE.api(`/api/vocab-test/trend?book=${encodeURIComponent(book)}`).catch(() => null),
      NCE.api('/api/plan/overview').catch(() => null),
      NCE.api('/api/progress').catch(() => null),
      NCE.api('/api/stats/overview').catch(() => null),
      NCE.api('/api/stats/training').catch(() => null),
      NCE.api('/api/transform/stats').catch(() => null),
      NCE.api('/api/meta').catch(() => null),
    ]);

    // ---- 顶部大卡：综合 CEFR 档位 ----
    const globalSum = vocabOv && vocabOv.global;
    const listenSum = vocabOv && vocabOv.listen;
    const readSum = vocabOv && vocabOv.read;
    const globalLatest = globalSum && globalSum.latest;
    const listenLatest = listenSum && listenSum.latest;
    const readLatest = readSum && readSum.latest;

    let vocabBase = null; // 用于映射 CEFR 的词汇量
    let baseNote = '';
    if (globalLatest) {
      vocabBase = globalLatest.estimate;
      baseNote = '基于总词汇量测试';
    } else if (readLatest || listenLatest) {
      vocabBase = Math.max(readLatest ? readLatest.estimate : 0, listenLatest ? listenLatest.estimate : 0);
      baseNote = `基于第 ${book} 册听/读测试粗估，建议做一次总词汇量测试更准`;
    }
    const cefr = cefrOf(vocabBase);

    // 总词汇量趋势（trend 接口 global 序列，比较最近两次）
    let globalTrendTxt = '';
    const gPoints = vocabTrend && Array.isArray(vocabTrend.global) ? vocabTrend.global : [];
    if (gPoints.length >= 2) {
      const d = gPoints[gPoints.length - 1].estimate - gPoints[gPoints.length - 2].estimate;
      if (d > 0) globalTrendTxt = `<span class="lv-trend-up">较上次测试 +${d} 词，在变强 💪</span>`;
      else if (d < 0) globalTrendTxt = `<span class="lv-trend-down">较上次测试 ${d} 词，抽样有波动，多测两次看均值</span>`;
      else globalTrendTxt = '与上次测试持平';
    }

    // 一句人话总结
    const streak = plan ? plan.streak : 0;
    const weakest = statsOv && Array.isArray(statsOv.weakest) && statsOv.weakest[0] ? statsOv.weakest[0] : null;
    let summary;
    if (cefr) {
      summary = `你的词汇量约 <b>${vocabBase}</b> 词，相当于 CEFR <b>${esc(cefr.code)}</b>（${esc(cefr.name)}）。${esc(cefr.desc)}`;
      if (streak > 0) summary += ` 目前已连续打卡 <b>${streak}</b> 天，节奏在线。`;
      if (weakest) summary += ` 当前最薄弱的语法点是「${esc(weakest.tag)}」（正确率 ${weakest.accuracy}%），建议专练补一补。`;
      if (globalTrendTxt) summary += `<br>${globalTrendTxt}`;
    } else {
      summary = '还没做过词汇量测试，花 5 分钟测一次，就能给你估出 CEFR 档位和适合的学习路线。';
    }

    const heroCard =
      '<div class="lv-card"><div class="lv-hero">' +
      (cefr
        ? `<div class="lv-hero-badge">${esc(cefr.code)}<span class="lv-hero-sub">${esc(cefr.name)} · ${esc(baseNote)}</span></div>`
        : '<div class="lv-hero-badge">?<span class="lv-hero-sub">待测定</span></div>') +
      '<div class="lv-hero-main">' +
      `<div class="lv-hero-t">${cefr ? '📍 你的综合水平估计' : '📍 先去测一下词汇量'}</div>` +
      `<div class="lv-hero-d">${summary}</div>` +
      (cefr ? '' : '<div style="margin-top:10px"><button class="lv-btn lv-go" data-tab="globalvocab">🌐 去测总词汇量（约 5 分钟） →</button></div>') +
      '</div></div></div>';

    // ---- 四象限：听 / 说 / 读 / 写 ----
    // 听：听力词汇量 + 听写最好成绩
    const dctBest = Number(store.get('dct-best'));
    const hasListen = !!listenLatest || (Number.isFinite(dctBest) && dctBest > 0);
    let listenNum = '—', listenSub = '';
    if (listenLatest) {
      listenNum = `≈ ${listenLatest.estimate}<span class="u">听力词汇（第${esc(String(book))}册）</span>`;
      listenSub = trendHint(listenLatest, listenSum.avg, listenSum.avgN, '词');
    } else if (hasListen) {
      listenNum = `${Math.round(dctBest)}<span class="u">% 听写最好成绩</span>`;
    }
    if (Number.isFinite(dctBest) && dctBest > 0 && listenLatest) {
      listenSub += (listenSub ? '<br>' : '') + `🎧 听写历史最好平均正确率 ${Math.round(dctBest)}%`;
    }
    const listenCard = quadCard('🎧 听', hasListen, listenNum, listenSub || '继续听写与听力测试，保持增长',
      '还没有听力数据，先做一次听力词汇量测试建立基线。', '👂 测听力词汇量', 'listenvocab');

    // 说：情景对话正确率
    const dlg = training && training.dialogue;
    const hasSpeak = !!(dlg && dlg.total > 0);
    const speakCard = quadCard('💬 说', hasSpeak,
      hasSpeak ? `${dlg.accuracy}<span class="u">% 对话正确率</span>` : '—',
      hasSpeak ? `累计对话 ${dlg.total} 句 · 已完成 ${dlg.completed} 组场景${dlg.accuracy >= 80 ? '<br><span class="lv-trend-up">开口质量不错，保持 ↗</span>' : '<br>正确率还有空间，多复盘错句'}` : '',
      '还没练过情景对话，开口是提升最快的一环。', '💬 去情景对话', 'dialogue');

    // 读：阅读词汇量 + 刷题正确率
    const hasRead = !!readLatest || !!(prog && prog.totalAttempts > 0);
    let readNum = '—', readSub = '';
    if (readLatest) {
      readNum = `≈ ${readLatest.estimate}<span class="u">阅读词汇（第${esc(String(book))}册）</span>`;
      readSub = trendHint(readLatest, readSum.avg, readSum.avgN, '词');
    } else if (prog && prog.totalAttempts > 0) {
      readNum = `${prog.accuracy}<span class="u">% 刷题正确率</span>`;
    }
    if (prog && prog.totalAttempts > 0 && readLatest) {
      readSub += (readSub ? '<br>' : '') + `📖 刷题 ${prog.totalAttempts} 题 · 正确率 ${prog.accuracy}%`;
    }
    const readCard = quadCard('📖 读', hasRead, readNum, readSub || '继续精读课文 + 刷题巩固',
      '还没有阅读数据，测一次阅读词汇量或刷一组题。', '📖 测阅读词汇量', 'readvocab');

    // 写：句型转换正确率
    const hasWrite = !!(tfStats && tfStats.total > 0);
    const tfWeakKind = training && training.transform && training.transform.weakestKind;
    const writeCard = quadCard('✍️ 写', hasWrite,
      hasWrite ? `${tfStats.accuracy}<span class="u">% 句型转换正确率</span>` : '—',
      hasWrite
        ? `累计转换 ${tfStats.total} 步` +
          (tfWeakKind ? `<br>最薄弱：「${esc(tfWeakKind.label)}」${tfWeakKind.accuracy}%，建议专练` : '<br><span class="lv-trend-up">各类型都在稳步推进 ↗</span>')
        : '',
      '还没练过句型转换（中译英 + 改写）。', '✍️ 去句型转换', 'transform');

    const quadsCard =
      '<div class="lv-card"><h3>🧩 听说读写四象限</h3>' +
      `<div class="lv-quads">${listenCard}${speakCard}${readCard}${writeCard}</div></div>`;

    // ---- 进度卡：NCE1/NCE2 打卡进度 + 周速估算 ----
    const checkin = (function () {
      const v = store.get('nce-checkin-lessons');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    })();
    const viewedArr = Array.isArray(store.get('nce-viewed-lessons')) ? store.get('nce-viewed-lessons') : [];
    const lessonsByBook = (meta && meta.stats && meta.stats.lessonsByBook) || {};
    const totals = {
      1: Number(lessonsByBook['1']) || 72,
      2: Number(lessonsByBook['2']) || 96,
      3: Number(lessonsByBook['3']) || 60,
      4: Number(lessonsByBook['4']) || 48,
    };

    const checkinKeys = Object.keys(checkin);
    const now = Date.now();
    const cut14 = now - 14 * 86400000;
    function perWeekOf(bk) {
      // 最近 14 天该册打卡数 / 2 = 周速
      let n = 0;
      for (const k of checkinKeys) {
        if (k.indexOf(bk + '-') !== 0) continue;
        const ts = Date.parse(checkin[k]);
        if (Number.isFinite(ts) && ts >= cut14) n++;
      }
      return n / 2;
    }

    const rows = ['1', '2', '3', '4']
      .filter((bk) => totals[bk] > 0)
      .map((bk) =>
        progRow(`NCE${bk}`, countByBook(checkinKeys, bk), countByBook(viewedArr, bk), totals[bk], perWeekOf(bk))
      ).join('');
    const anyProgress = checkinKeys.length > 0 || viewedArr.length > 0;
    const progCard =
      '<div class="lv-card"><h3>📅 教材进度与节奏</h3>' +
      (plan ? `<div class="lv-prog-hint" style="margin:0 0 10px">🔥 连续打卡 <b>${plan.streak}</b> 天 · 累计学习 <b>${plan.totalDays}</b> 天</div>` : '') +
      rows +
      (anyProgress ? '' : '<div style="margin-top:12px"><button class="lv-btn lv-go" data-tab="learn">📖 去教材学习，从第 1 课开始 →</button></div>') +
      '</div>';

    const wrap = document.createElement('div');
    wrap.className = 'lv-wrap';
    wrap.innerHTML =
      '<div class="lv-head"><h2>🧭 我的水平</h2><span class="lv-relink" id="lv-reonboard">重新查看引导</span></div>' +
      heroCard + quadsCard + progCard +
      '<div class="lv-note" style="margin-top:14px">词汇量为抽样估算，多测几次看均值更稳；CEFR 档位仅供参考，听说读写四项均衡才是真水平。</div>';

    panel.innerHTML = '';
    panel.appendChild(wrap);

    wrap.querySelectorAll('.lv-go').forEach((b) => {
      b.onclick = () => { if (NCE.gotoTab) NCE.gotoTab(b.dataset.tab); };
    });
    const re = wrap.querySelector('#lv-reonboard');
    if (re) re.onclick = () => showOnboard();
  }

  // ---- 新手引导弹层 ----
  let obMask = null;
  function closeOnboard() {
    if (obMask) { obMask.remove(); obMask = null; }
  }
  async function postLevel(level) {
    try {
      await NCE.api('/api/plan/level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      });
    } catch (e) {
      // 写入失败不阻塞引导流程，可稍后在学习计划页再选
      if (NCE.toast) NCE.toast('水平预设保存失败，可稍后在「学习计划」中设置', 'bad');
    }
  }
  function showOnboard() {
    if (obMask) return;
    obMask = document.createElement('div');
    obMask.className = 'lv-ob-mask';
    obMask.innerHTML =
      '<div class="lv-ob-card">' +
      '<div class="lv-ob-title">👋 欢迎来到新概念英语练习系统</div>' +
      '<div class="lv-ob-desc">先告诉我们你的起点，我们会为你选好每日计划：</div>' +
      '<button class="lv-ob-opt" data-choice="starter"><b>🌱 我是零基础</b><span class="d">从 NCE1 第 1 课开始，读 → 听 → 说 → 写 → 记 一步步来</span></button>' +
      '<button class="lv-ob-opt" data-choice="medium"><b>📚 我有基础</b><span class="d">先做 5 分钟词汇量测试，定位适合的起点</span></button>' +
      '<button class="lv-ob-skip" data-choice="skip">随便看看，跳过引导</button>' +
      '</div>';
    document.body.appendChild(obMask);
    obMask.querySelectorAll('[data-choice]').forEach((b) => {
      b.onclick = async () => {
        const c = b.dataset.choice;
        markOnboarded();
        closeOnboard();
        if (c === 'starter') {
          await postLevel('starter');
          if (NCE.gotoTab) NCE.gotoTab('learn');
        } else if (c === 'medium') {
          await postLevel('medium');
          if (NCE.gotoTab) NCE.gotoTab('globalvocab');
        }
        // skip：只关闭并记录已看过
      };
    });
  }

  // 首次进入判定：三个学习状态键全空 且 刷题总量为 0，才认为是新用户
  async function maybeOnboard() {
    const store = window.NCEStore;
    if (!store) return;
    try { await store.ready; } catch (e) { /* 离线时按本地镜像判断 */ }
    if (hasOnboarded()) return;

    const checkin = store.get('nce-checkin-lessons');
    const viewed = store.get('nce-viewed-lessons');
    const lastLesson = store.get('nce-last-lesson');
    const emptyObj = (v) => !v || (typeof v === 'object' && Object.keys(v).length === 0);
    const emptyArr = (v) => !v || (Array.isArray(v) && v.length === 0);
    if (!emptyObj(checkin) || !emptyArr(viewed) || !emptyObj(lastLesson)) return;

    let progData = null;
    try { progData = await NCE.api('/api/progress'); } catch (e) { return; } // 拿不到练习量就不打扰
    if (!progData || progData.totalAttempts !== 0) return;

    showOnboard();
  }

  NCE.registerFeature({
    id: 'level',
    label: '我的水平',
    icon: '🧭',
    onShow(panel) { renderLevel(panel); },
  });

  maybeOnboard();
})();
