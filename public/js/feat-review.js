'use strict';
// 间隔重复复习（SRS / 艾宾浩斯遗忘曲线）功能模块
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;
  const esc = NCE.escapeHtml;
  const escA = NCE.escapeAttr || esc;

  // ---- 注入样式（前缀 srv- 避免冲突）----
  const style = document.createElement('style');
  style.textContent = `
    .srv-wrap{max-width:720px;margin:0 auto}
    .srv-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:8px}
    .srv-head h2{margin:0;font-size:20px}
    .srv-stat{color:#2563eb;font-weight:600}
    .srv-note{color:#666;font-size:13px;line-height:1.6;background:#f5f7fa;border-radius:8px;padding:10px 14px;margin:10px 0}
    .srv-btn{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:9px 18px;font-size:15px;cursor:pointer}
    .srv-btn:hover{background:#1d4ed8}
    .srv-btn:disabled{background:#9ca3af;cursor:not-allowed}
    .srv-btn.ghost{background:#fff;color:#2563eb;border:1px solid #2563eb}
    .srv-card{border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-top:14px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
    .srv-meta{color:#888;font-size:12px;margin-bottom:6px}
    .srv-stem{font-size:17px;line-height:1.6;margin-bottom:14px}
    .srv-spk{cursor:pointer;user-select:none}
    .srv-opt{display:block;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin:8px 0;cursor:pointer;font-size:15px}
    .srv-opt:hover{border-color:#2563eb;background:#f0f6ff}
    .srv-input{width:100%;box-sizing:border-box;padding:10px 12px;font-size:15px;border:1px solid #d1d5db;border-radius:8px}
    .srv-fb{margin-top:14px;padding:12px 14px;border-radius:8px;font-size:14px;line-height:1.6}
    .srv-fb.ok{background:#ecfdf5;border:1px solid #a7f3d0}
    .srv-fb.no{background:#fef2f2;border:1px solid #fecaca}
    .srv-fb .tag{font-weight:700}
    .srv-fb .tag.ok{color:#059669}
    .srv-fb .tag.no{color:#dc2626}
    .srv-exp{color:#555;margin-top:6px}
    .srv-next{color:#2563eb;font-size:13px;margin-top:6px}
    .srv-empty{text-align:center;color:#059669;font-size:16px;padding:36px 0}
    .srv-actions{margin-top:16px;display:flex;gap:10px;flex-wrap:wrap}
    .srv-progress{color:#888;font-size:13px;margin-top:10px}
    .srv-link-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .srv-link-btn{
      padding:5px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;
      cursor:pointer;font-size:13px;color:#334
    }
    .srv-link-btn:hover{border-color:#2563eb;color:#2563eb}
    .srv-lookup-hint{font-size:12px;color:#94a3b8;margin-top:6px}
    .srv-ie-ctx{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin:8px 0 12px;max-height:340px;overflow:auto;font-size:14px;line-height:1.7}
    .srv-ie-p{margin:0 0 8px}
    .srv-ie-p:last-child{margin-bottom:0}
    .srv-ie-plabel{display:inline-block;min-width:18px;font-weight:700;color:#2563eb;margin-right:6px}
    .srv-ie-script summary{cursor:pointer;color:#2563eb;font-size:13px;margin-top:6px}
    .srv-ie-speaker{font-weight:600;color:#334155;margin-right:4px}
    .srv-ie-play{margin-right:8px}
    .srv-ie-gt{font-weight:600;font-size:14px;margin-bottom:4px}
    .srv-ie-ins{color:#555;font-size:13px;line-height:1.6;margin-bottom:6px}
    .srv-ie-limit{display:inline-block;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:6px;padding:1px 8px;font-size:12px;font-weight:600;margin-bottom:8px}
    .srv-ie-heading{color:#64748b;font-size:13px;margin-bottom:2px}
    .srv-ie-num{display:inline-block;min-width:22px;padding:0 6px;border-radius:6px;background:#2563eb;color:#fff;font-size:13px;line-height:22px;text-align:center;margin-right:6px}
    .srv-ie-gap{font-weight:700;color:#2563eb}
    .srv-ie-mark{background:#fef08a;padding:0 2px;border-radius:3px}
    .srv-ie-pill{display:inline-block;background:#fff7ed;color:#c2410c;border-radius:6px;padding:0 6px;font-size:12px;margin-left:6px}
    .srv-ie-hint{margin:-8px 0 12px;color:#b45309;font-size:13px;line-height:1.6}
    .srv-ie-fig{margin:4px 0 10px;min-width:0}
  `;
  document.head.appendChild(style);

  function fmtDue(ts) {
    const diff = ts - Date.now();
    if (diff <= 60000) return '稍后（约 10 分钟内）';
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `约 ${mins} 分钟后`;
    const hrs = Math.round(diff / 3600000);
    if (hrs < 24) return `约 ${hrs} 小时后`;
    const days = Math.round(diff / 86400000);
    return `约 ${days} 天后`;
  }

  function extractWords(text) {
    return NCE.extractLookupWords ? NCE.extractLookupWords(text) : [];
  }

  function appendDictChips(container, words, book) {
    if (NCE.appendDictChips) NCE.appendDictChips(container, words, book);
  }

  // ---- 雅思阅读 / 听力错题（服务端 lib/ielts-srs.js 下发 q.ielts）----
  const IE_TYPE_LABEL = {
    tfng: '判断 T/F/NG',
    ynng: '观点 Y/N/NG',
    'matching-headings': '段落标题配对',
    'matching-information': '信息定位',
    mcq: '单选',
    'sentence-completion': '句子填空',
    'summary-completion': '摘要填空',
    'short-answer': '简答',
    'form-completion': '表格填空',
    'note-completion': '笔记填空',
    'flowchart-completion': '流程图填空',
    matching: '匹配',
    'map-labelling': '地图标注',
    'mcq-multi': '多选',
  };
  const IE_BLANK = '{blank}';

  function ieltsInfo(q) {
    const ie = q && q.ielts;
    if (!ie || typeof ie !== 'object') return null;
    return q.kind === 'ielts-reading' || q.kind === 'ielts-listening' ? ie : null;
  }

  function ieChoices(ie) {
    return Array.isArray(ie.choices) ? ie.choices.filter((c) => c && typeof c.key === 'string') : null;
  }

  function ieChoiceLabel(ie, c) {
    if (ie.groupType === 'matching-information') return `段落 ${c.key}`;
    return c.text ? `${c.key}. ${c.text}` : c.key;
  }

  function ieChoiceText(ie, key) {
    const list = ieChoices(ie) || [];
    const k = String(key == null ? '' : key).trim().toUpperCase();
    const hit = list.find((c) => c.key.toUpperCase() === k);
    return hit ? hit.text : '';
  }

  // 题干：{blank} 换成「(题号) ______」，其余文字一律转义
  function iePromptHtml(ie) {
    const gap = `<span class="srv-ie-gap">(${esc(String(ie.number))}) ______</span>`;
    return String(ie.prompt || '').split(IE_BLANK).map((t) => esc(t)).join(gap);
  }

  // 在纯文本里把第一处 needle（不分大小写）标黄；找不到返回 null。三段分别转义
  function ieMarkOnce(text, needle) {
    const t = String(text || '');
    const n = String(needle || '').trim();
    const i = n ? t.toLowerCase().indexOf(n.toLowerCase()) : -1;
    if (i < 0) return null;
    return `${esc(t.slice(0, i))}<mark class="srv-ie-mark">${esc(t.slice(i, i + n.length))}</mark>${esc(t.slice(i + n.length))}`;
  }

  function ieContextHtml(ie) {
    if (Array.isArray(ie.paragraphs)) {
      return (
        '<div class="srv-ie-ctx">' +
        ie.paragraphs.map((p) =>
          `<p class="srv-ie-p" data-label="${escA(p.label)}"><span class="srv-ie-plabel">${esc(p.label)}</span>` +
          `<span class="srv-ie-ptext">${esc(p.text)}</span></p>`
        ).join('') +
        '</div>'
      );
    }
    const sc = ie.script;
    if (!sc || typeof sc.text !== 'string') return '';
    // 先听后看：脚本默认收起，可点 🔊 朗读（NCE.speak），答完自动展开
    const play = NCE.speak
      ? `<button type="button" class="srv-btn ghost srv-spk srv-ie-play" data-speak="${escA(sc.text)}" title="朗读这段原文">🔊 播放原文</button>`
      : '';
    return (
      '<div class="srv-ie-ctx srv-ie-script">' +
      play +
      `<details><summary>📄 显示脚本（原文第 ${esc(String(Number(sc.index) + 1))} 段）</summary>` +
      `<p class="srv-ie-p"><span class="srv-ie-speaker">${esc(sc.speaker)}:</span><span class="srv-ie-ptext">${esc(sc.text)}</span></p>` +
      '</details></div>'
    );
  }

  function ieltsCardHtml(q, ie, idx, total) {
    const isReading = q.kind === 'ielts-reading';
    const src = isReading ? '📖 雅思阅读' : `🎧 雅思听力 Part ${esc(String(ie.part || ''))}`;
    const typeLabel = IE_TYPE_LABEL[ie.groupType] || ie.groupType || '';
    const choices = ieChoices(ie);
    return (
      `<div class="srv-meta">第 ${idx + 1} / ${total} 题 · ${src} · ${esc(ie.title)}` +
      (ie.titleCn ? `（${esc(ie.titleCn)}）` : '') +
      (typeLabel ? ` · ${esc(typeLabel)}` : '') +
      '</div>' +
      ieContextHtml(ie) +
      (ie.groupTitle ? `<div class="srv-ie-gt">${esc(ie.groupTitle)}</div>` : '') +
      (ie.instruction ? `<div class="srv-ie-ins">${esc(ie.instruction)}</div>` : '') +
      (ie.wordLimitLabel ? `<div class="srv-ie-limit">${esc(ie.wordLimitLabel)}</div>` : '') +
      (choices && ie.choicesTitle ? `<div class="srv-ie-ins"><b>${esc(ie.choicesTitle)}</b></div>` : '') +
      (ie.heading ? `<div class="srv-ie-heading">${esc(ie.heading)}</div>` : '') +
      `<div class="srv-stem">${String(ie.prompt || '').includes(IE_BLANK) ? '' : `<span class="srv-ie-num">${esc(String(ie.number))}</span>`}${iePromptHtml(ie)}</div>` +
      // 多选题干是组题干，服务端另给「本组有 N 个正确选项，选出其中一个」
      (ie.pickHint ? `<div class="srv-ie-hint">${esc(ie.pickHint)}</div>` : '') +
      (NCE.bindPassageLookup ? '<div class="srv-lookup-hint">💡 选中原文或题干中的英文可查词典</div>' : '') +
      (ie.figure ? '<div class="srv-ie-fig"></div>' : '')
    );
  }

  // 地图标注题：有 figure 时在选项上方画地图（卡片进入页面后再挂，按容器实际宽度出图）；
  // NCE.ielts.chart 由 ielts-chart.js 提供，没加载时给提示。换题 / 小结 / 回首页前释放 resize 监听
  let figureDispose = null;
  function releaseIeltsFigure() {
    if (!figureDispose) return;
    try {
      figureDispose();
    } catch (e) {
      console.warn('[review] 地图释放失败', e);
    }
    figureDispose = null;
  }
  function mountIeltsFigure(card, ie) {
    releaseIeltsFigure();
    const el = card.querySelector('.srv-ie-fig');
    if (!el || !ie.figure) return;
    const chart = NCE.ielts && NCE.ielts.chart;
    if (chart && typeof chart.mount === 'function') figureDispose = chart.mount(el, ie.figure);
    else el.innerHTML = '<div class="srv-note">地图需要雅思备考模块的图表脚本，请刷新页面后再试。</div>';
  }

  // 作答控件：选择类用单选（值为选项字母 / TRUE 等），填空类用输入框（长度上限与原模块一致）
  function renderIeltsControls(q, ie, body, onEnter) {
    const choices = ieChoices(ie);
    if (choices) {
      choices.forEach((c) => {
        const label = document.createElement('label');
        label.className = 'srv-opt';
        label.innerHTML = `<input type="radio" name="srv_${escA(q.id)}" value="${escA(c.key)}"> ${esc(ieChoiceLabel(ie, c))}`;
        body.appendChild(label);
      });
      return () => {
        const sel = body.querySelector('input[type=radio]:checked');
        return sel ? sel.value : null;
      };
    }
    const input = document.createElement('input');
    input.className = 'srv-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    if (Number.isInteger(ie.maxLength) && ie.maxLength > 0) input.maxLength = ie.maxLength;
    input.placeholder = ie.wordLimitLabel ? `输入答案（${ie.wordLimitLabel}）` : '输入答案后提交';
    body.appendChild(input);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onEnter();
    });
    return () => input.value;
  }

  function ieltsFeedbackEl(q, ie, r) {
    const d = r.ielts && typeof r.ielts === 'object' ? r.ielts : {};
    const isChoice = !!ieChoices(ie);
    const isMulti = ie.groupType === 'mcq-multi';
    const answers = (Array.isArray(r.answer) ? r.answer : [r.answer]).filter((a) => a != null && a !== '').map(String);
    const main = answers[0] || '';
    const mainText = d.answerText || (isChoice ? ieChoiceText(ie, main) : '');
    const others = isChoice ? [] : answers.slice(1);
    const resp = typeof d.response === 'string' ? d.response : '';
    const respText = isChoice && resp ? ieChoiceText(ie, resp) : '';
    const mine = d.blank || !resp
      ? '<span style="color:#94a3b8">未作答</span>'
      : `<b>${esc(resp)}</b>${respText ? ` ${esc(respText)}` : ''}`;
    const over = d.overLimit
      ? `<span class="srv-ie-pill">超出字数限制${d.wordLimitLabel ? `：${esc(d.wordLimitLabel)}` : ''}</span>`
      : '';
    const ev = d.evidence && d.evidence.quote
      ? `<div class="srv-exp">📍 ${d.evidence.para ? `原文 ${esc(d.evidence.para)} 段` : '原文依据'}：${esc(d.evidence.quote)}</div>`
      : '';
    const fb = document.createElement('div');
    fb.className = 'srv-fb ' + (r.correct ? 'ok' : 'no');
    fb.innerHTML =
      `<span class="tag ${r.correct ? 'ok' : 'no'}">${r.correct ? '✓ 回答正确' : '✗ 回答错误'}</span>` +
      `<div>你的答案：${mine}${over}</div>` +
      (isMulti
        // 多选：answer 是本组全部正确选项，逐个列出字母和文字
        ? `<div>正确答案：${answers.map((k) => {
          const t = ieChoiceText(ie, k);
          return `<b>${esc(k)}</b>${t ? ` ${esc(t)}` : ''}`;
        }).join('；')}<span style="color:#94a3b8">（选中其中任意一个即算对）</span></div>`
        : `<div>正确答案：<b>${esc(main)}</b>${mainText ? ` ${esc(mainText)}` : ''}` +
          (others.length ? `<span style="color:#94a3b8">（也可：${others.map((x) => esc(x)).join(' / ')}）</span>` : '') +
          '</div>') +
      (r.explanation ? `<div class="srv-exp">💡 ${esc(r.explanation)}</div>` : '') +
      ev +
      `<div class="srv-next">⏰ 下次复习：${esc(fmtDue(r.nextDueAt))}</div>`;
    // 填空题答错：给正确答案（首选写法）里的单词查词入口
    if (!r.correct && !isChoice) appendDictChips(fb, extractWords(main).slice(0, 6), q.book);
    return fb;
  }

  // 答完：阅读把原文依据标黄；听力展开脚本，并把依据或正确答案标黄（找不到就只展开）
  function revealIeltsContext(card, ie, r) {
    const d = r.ielts && typeof r.ielts === 'object' ? r.ielts : {};
    const details = card.querySelector('.srv-ie-script details');
    if (details) details.open = true;
    const quote = d.evidence && d.evidence.quote ? d.evidence.quote : '';
    const para = d.evidence && d.evidence.para ? d.evidence.para : '';
    const answers = Array.isArray(r.answer) ? r.answer : [];
    const needles = quote ? [quote] : ieChoices(ie) ? [] : answers;
    card.querySelectorAll('.srv-ie-p').forEach((p) => {
      if (para && p.dataset.label !== para) return;
      const span = p.querySelector('.srv-ie-ptext');
      if (!span) return;
      for (const n of needles) {
        const html = ieMarkOnce(span.textContent, n);
        if (html) {
          span.innerHTML = html;
          const mark = span.querySelector('.srv-ie-mark');
          if (mark && mark.scrollIntoView) mark.scrollIntoView({ block: 'nearest' });
          return;
        }
      }
    });
  }

  async function renderHome(panel) {
    releaseIeltsFigure();
    panel.innerHTML = '<div class="srv-wrap"><div class="srv-note">加载中…</div></div>';
    let stats = { due: 0, total: 0, upcoming: 0 };
    let due = { count: 0, questions: [] };
    try {
      [stats, due] = await Promise.all([
        NCE.api('/api/srs/stats'),
        NCE.api('/api/srs/due'),
      ]);
    } catch (e) {
      panel.innerHTML = '<div class="srv-wrap"><div class="srv-fb no">加载失败，请稍后重试。</div></div>';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'srv-wrap';
    wrap.innerHTML =
      '<div class="srv-head"><h2>🔁 间隔复习</h2>' +
      `<span class="srv-stat">今日待复习 ${stats.due} 题 · 队列共 ${stats.total} 题</span></div>` +
      '<div class="srv-note">做题答错的题、句型转换答错的步骤、雅思阅读与听力交卷时答错的题会被自动加入复习队列，并按<b>艾宾浩斯遗忘曲线</b>在 1 / 2 / 4 / 7 / 15 天后重新出现；每答对一次间隔就拉长，答错则重头再来。' +
      (stats.upcoming ? `<br>未来 7 天内还有 ${stats.upcoming} 题即将到期。` : '') +
      '</div>';

    const actions = document.createElement('div');
    actions.className = 'srv-actions';
    if (due.count > 0) {
      const start = document.createElement('button');
      start.className = 'srv-btn';
      start.textContent = `开始复习（${due.count} 题）`;
      start.onclick = () => runSession(panel, due.questions.slice());
      actions.appendChild(start);
    } else {
      const empty = document.createElement('div');
      empty.className = 'srv-empty';
      empty.textContent = stats.total ? '🎉 太棒了，暂无到期复习' : '🌱 复习队列还是空的，去做几道题吧';
      wrap.appendChild(empty);
    }
    wrap.appendChild(actions);
    panel.innerHTML = '';
    panel.appendChild(wrap);
  }

  function runSession(panel, questions) {
    let idx = 0;
    let right = 0;
    let wrong = 0;

    function showSummary() {
      releaseIeltsFigure();
      const wrap = document.createElement('div');
      wrap.className = 'srv-wrap';
      wrap.innerHTML =
        '<div class="srv-head"><h2>本轮小结</h2></div>' +
        `<div class="srv-card"><div class="srv-stem">共 ${questions.length} 题：` +
        `<span style="color:#059669">对 ${right}</span> · <span style="color:#dc2626">错 ${wrong}</span></div>` +
        '<div class="srv-note">答错的题已重新排入队列，稍后会再次出现。坚持每天复习效果最好。</div></div>';
      const back = document.createElement('button');
      back.className = 'srv-btn';
      back.textContent = '返回';
      back.onclick = () => renderHome(panel);
      wrap.appendChild(back);
      panel.innerHTML = '';
      panel.appendChild(wrap);
    }

    function showQuestion() {
      if (idx >= questions.length) return showSummary();
      const q = questions[idx];
      const ie = ieltsInfo(q);
      const wrap = document.createElement('div');
      wrap.className = 'srv-wrap';

      const card = document.createElement('div');
      card.className = 'srv-card';
      const speakBtn = NCE.speak
        ? `<span class="srv-spk" data-speak="${escA(q.stem)}" title="朗读">🔊</span>`
        : '';
      card.innerHTML = ie
        ? ieltsCardHtml(q, ie, idx, questions.length)
        : `<div class="srv-meta">第 ${idx + 1} / ${questions.length} 题 · Book ${q.book} · Lesson ${q.lesson}${q.lessonTitle ? ' ' + esc(q.lessonTitle) : ''}</div>` +
          `<div class="srv-stem">${esc(q.stem)} ${speakBtn}</div>` +
          (NCE.bindPassageLookup ? '<div class="srv-lookup-hint">💡 选中题干中的英文可查词典</div>' : '');

      const body = document.createElement('div');
      let getResponse = () => null;

      if (ie) {
        getResponse = renderIeltsControls(q, ie, body, () => submitBtn.click());
      } else if (q.type === 'mcq' && Array.isArray(q.options)) {
        (q.options || []).forEach((opt) => {
          const label = document.createElement('label');
          label.className = 'srv-opt';
          label.innerHTML =
            `<input type="radio" name="srv_${q.id}" value="${escA(opt)}"> ${esc(opt)}`;
          body.appendChild(label);
        });
        getResponse = () => {
          const sel = body.querySelector('input[type=radio]:checked');
          return sel ? sel.value : null;
        };
      } else {
        const input = document.createElement('input');
        input.className = 'srv-input';
        input.type = 'text';
        input.placeholder = '输入答案后提交';
        body.appendChild(input);
        getResponse = () => input.value;
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') submitBtn.click();
        });
      }
      card.appendChild(body);

      const actions = document.createElement('div');
      actions.className = 'srv-actions';
      const submitBtn = document.createElement('button');
      submitBtn.className = 'srv-btn';
      submitBtn.textContent = '提交';
      actions.appendChild(submitBtn);
      card.appendChild(actions);

      wrap.appendChild(card);
      releaseIeltsFigure();
      panel.innerHTML = '';
      panel.appendChild(wrap);
      if (ie && ie.figure) mountIeltsFigure(card, ie);

      const spk = card.querySelector('.srv-spk');
      if (spk && NCE.speak) spk.onclick = () => NCE.speak(spk.dataset.speak);
      if (NCE.bindPassageLookup) NCE.bindPassageLookup(card.querySelector('.srv-stem'), q.book);
      if (ie && NCE.bindPassageLookup) NCE.bindPassageLookup(card.querySelector('.srv-ie-ctx'), q.book);

      // 雅思题提交失败（如复习中途原题被删、服务端返回 404）时给「跳过此题」，不卡在这一题
      function offerSkip() {
        if (actions.querySelector('.srv-skip')) return;
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'srv-btn ghost srv-skip';
        skip.textContent = '跳过此题';
        skip.onclick = () => { idx++; showQuestion(); };
        actions.appendChild(skip);
      }

      submitBtn.onclick = async () => {
        const response = getResponse();
        if (response == null || String(response).trim() === '') {
          const inp = body.querySelector('input.srv-input');
          if (inp) { inp.focus(); return; }
          if (q.type === 'mcq' || ie) return; // mcq / 雅思选择题未选不提交
        }
        submitBtn.disabled = true;
        let r;
        try {
          r = await NCE.api('/api/srs/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: q.id, response }),
          });
        } catch (e) {
          submitBtn.disabled = false;
          if (ie) offerSkip();
          return;
        }
        if (r.correct) right++; else wrong++;

        if (ie) {
          card.insertBefore(ieltsFeedbackEl(q, ie, r), actions);
          revealIeltsContext(card, ie, r);
        } else {
          const ansText = Array.isArray(r.answer) ? r.answer.join(' / ') : r.answer;
          const ansHtml = !r.correct && NCE.formatAnswersWithSpeak
            ? NCE.formatAnswersWithSpeak(r.answer, { btnClass: 'srv-btn', btnStyle: 'padding:2px 8px;font-size:13px;margin-left:4px' })
            : `<b>${esc(String(ansText))}</b>`;
          const fb = document.createElement('div');
          fb.className = 'srv-fb ' + (r.correct ? 'ok' : 'no');
          fb.innerHTML =
            `<span class="tag ${r.correct ? 'ok' : 'no'}">${r.correct ? '✓ 回答正确' : '✗ 回答错误'}</span>` +
            (r.correct ? '' : `　正确答案：${ansHtml}`) +
            (!r.correct && r.answerCn ? `<div class="srv-exp">译：${esc(r.answerCn)}</div>` : '') +
            (r.explanation ? `<div class="srv-exp">💡 ${esc(r.explanation)}</div>` : '') +
            `<div class="srv-next">⏰ 下次复习：${esc(fmtDue(r.nextDueAt))}</div>`;
          card.insertBefore(fb, actions);
          if (!r.correct && NCE.bindSpeakClicks) NCE.bindSpeakClicks(fb);

          if (!r.correct) {
            const stemWords = extractWords(q.stem);
            const ansWords = extractWords(ansText);
            const chips = [...new Set([...stemWords, ...ansWords].map((w) => w.toLowerCase()))]
              .map((k) => stemWords.find((w) => w.toLowerCase() === k) || ansWords.find((w) => w.toLowerCase() === k))
              .filter(Boolean);
            appendDictChips(fb, chips.slice(0, 6), q.book);
            const links = document.createElement('div');
            links.className = 'srv-link-row';
            if (NCE.goToLesson && q.book != null && q.lesson != null) {
              const lessonBtn = document.createElement('button');
              lessonBtn.type = 'button';
              lessonBtn.className = 'srv-link-btn';
              lessonBtn.textContent = '📖 去课文';
              lessonBtn.onclick = () => NCE.goToLesson(q.book, q.lesson);
              links.appendChild(lessonBtn);
            }
            if (links.childNodes.length) fb.appendChild(links);
          }
        }

        // 禁用作答控件
        body.querySelectorAll('input').forEach((i) => { i.disabled = true; });
        actions.innerHTML = '';
        const nextBtn = document.createElement('button');
        nextBtn.className = 'srv-btn';
        nextBtn.textContent = idx + 1 >= questions.length ? '查看小结' : '下一题';
        nextBtn.onclick = () => { idx++; showQuestion(); };
        actions.appendChild(nextBtn);
        nextBtn.focus();
      };
    }

    showQuestion();
  }

  NCE.registerFeature({
    id: 'review',
    label: '间隔复习',
    icon: '🔁',
    onShow(panel) { renderHome(panel); },
  });
})();
