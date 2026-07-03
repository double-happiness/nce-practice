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

  async function renderHome(panel) {
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
      '<div class="srv-note">做题时答错的题会被自动加入复习队列，并按<b>艾宾浩斯遗忘曲线</b>在 1 / 2 / 4 / 7 / 15 天后重新出现；每答对一次间隔就拉长，答错则重头再来。' +
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
      const wrap = document.createElement('div');
      wrap.className = 'srv-wrap';

      const card = document.createElement('div');
      card.className = 'srv-card';
      const speakBtn = NCE.speak
        ? `<span class="srv-spk" data-speak="${escA(q.stem)}" title="朗读">🔊</span>`
        : '';
      card.innerHTML =
        `<div class="srv-meta">第 ${idx + 1} / ${questions.length} 题 · Book ${q.book} · Lesson ${q.lesson}${q.lessonTitle ? ' ' + esc(q.lessonTitle) : ''}</div>` +
        `<div class="srv-stem">${esc(q.stem)} ${speakBtn}</div>`;

      const body = document.createElement('div');
      let getResponse = () => null;

      if (q.type === 'mcq' && Array.isArray(q.options)) {
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
      panel.innerHTML = '';
      panel.appendChild(wrap);

      const spk = card.querySelector('.srv-spk');
      if (spk && NCE.speak) spk.onclick = () => NCE.speak(spk.dataset.speak);

      submitBtn.onclick = async () => {
        const response = getResponse();
        if (response == null || String(response).trim() === '') {
          const inp = body.querySelector('input.srv-input');
          if (inp) { inp.focus(); return; }
          if (q.type === 'mcq') return; // mcq 未选不提交
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
          return;
        }
        if (r.correct) right++; else wrong++;

        const ansText = Array.isArray(r.answer) ? r.answer.join(' / ') : r.answer;
        const fb = document.createElement('div');
        fb.className = 'srv-fb ' + (r.correct ? 'ok' : 'no');
        fb.innerHTML =
          `<span class="tag ${r.correct ? 'ok' : 'no'}">${r.correct ? '✓ 回答正确' : '✗ 回答错误'}</span>` +
          (r.correct ? '' : `　正确答案：<b>${esc(String(ansText))}</b>`) +
          (r.explanation ? `<div class="srv-exp">💡 ${esc(r.explanation)}</div>` : '') +
          `<div class="srv-next">⏰ 下次复习：${esc(fmtDue(r.nextDueAt))}</div>`;
        card.insertBefore(fb, actions);

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
