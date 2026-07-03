// 情景对话练习 —— 按场景分类的角色扮演式口语输入训练
'use strict';

(function () {
  if (!window.NCE || !NCE.registerFeature) {
    console.error('[dialogue] NCE 未就绪，模块未加载');
    return;
  }

  function injectStyle() {
    if (document.getElementById('dlg-style')) return;
    var css =
      '.dlg-wrap{max-width:820px;margin:0 auto}' +
      '.dlg-hist{background:#f4f7ff;border:1px solid #dbe4ff;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:14px;color:#334}' +
      '.dlg-hist b{color:#2b57d6}' +
      '.dlg-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}' +
      '.dlg-chips{display:flex;gap:8px;flex-wrap:wrap}' +
      '.dlg-chip{padding:7px 14px;border:1px solid #cfd6e6;border-radius:999px;background:#fff;cursor:pointer;font-size:14px;color:#223}' +
      '.dlg-chip.active{background:#2b57d6;border-color:#2b57d6;color:#fff}' +
      '.dlg-btn{padding:9px 16px;border:1px solid #cfd6e6;border-radius:8px;background:#fff;cursor:pointer;font-size:15px;color:#223}' +
      '.dlg-btn:hover{background:#f0f3fb}' +
      '.dlg-btn.primary{background:#2b57d6;border-color:#2b57d6;color:#fff}' +
      '.dlg-btn.primary:hover{background:#2149bd}' +
      '.dlg-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.dlg-btn.mini{padding:5px 10px;font-size:13px}' +
      '.dlg-card{background:#fff;border:1px solid #e5e9f2;border-radius:12px;padding:18px;margin-top:12px;box-shadow:0 1px 3px rgba(0,0,0,.04)}' +
      '.dlg-scene{background:#fffaf0;border:1px solid #f4e6c8;border-radius:10px;padding:12px 14px;font-size:14px;color:#654;margin-bottom:14px}' +
      '.dlg-list{display:grid;gap:10px;margin-top:10px}' +
      '.dlg-item{border:1px solid #e5e9f2;border-radius:10px;padding:12px 14px;cursor:pointer;background:#fff;transition:background .15s}' +
      '.dlg-item:hover{background:#f6f8fc;border-color:#cfd6e6}' +
      '.dlg-item .t{font-size:16px;font-weight:600;color:#123}' +
      '.dlg-item .s{font-size:13px;color:#889;margin-top:4px}' +
      '.dlg-item .m{font-size:12px;color:#aab;margin-top:6px}' +
      '.dlg-progress{font-size:14px;color:#667;margin-bottom:10px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
      '.dlg-chat{display:flex;flex-direction:column;gap:10px;margin:14px 0;max-height:340px;overflow-y:auto;padding:4px}' +
      '.dlg-bubble{max-width:85%;padding:10px 14px;border-radius:14px;font-size:15px;line-height:1.5}' +
      '.dlg-bubble.them{align-self:flex-start;background:#f0f3fb;border:1px solid #dbe4ff;color:#234}' +
      '.dlg-bubble.you{align-self:flex-end;background:#e8f0ff;border:1px solid #c5d5f5;color:#123}' +
      '.dlg-bubble .role{font-size:12px;font-weight:600;color:#667;margin-bottom:4px}' +
      '.dlg-bubble .cn{font-size:13px;color:#889;margin-top:6px;border-top:1px dashed #dbe2ef;padding-top:6px}' +
      '.dlg-bubble.ok{border-color:#a8d5b5;background:#eef9f1}' +
      '.dlg-bubble.bad{border-color:#e8b4b4;background:#fef2f2}' +
      '.dlg-prompt{font-size:17px;font-weight:600;margin:10px 0 8px;color:#123}' +
      '.dlg-input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ccd;border-radius:8px;font-size:16px;font-family:inherit}' +
      '.dlg-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
      '.dlg-verdict{font-size:16px;font-weight:600;margin:10px 0 4px}' +
      '.dlg-verdict.ok{color:#178a3a}' +
      '.dlg-verdict.bad{color:#d12f2f}' +
      '.dlg-answer{margin-top:8px;padding:8px 12px;background:#f6f8fc;border-radius:8px;font-size:15px;color:#345}' +
      '.dlg-hint{color:#889;font-size:13px;margin:6px 0}' +
      '.dlg-summary{text-align:center;padding:20px}' +
      '.dlg-summary .big{font-size:40px;font-weight:700;color:#2b57d6}' +
      '.dlg-summary .sub{color:#667;margin-top:6px}';
    var st = document.createElement('style');
    st.id = 'dlg-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  var metaCache = null;
  var curCategory = '';

  function onShow(panel) {
    injectStyle();
    panel.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'dlg-wrap';
    panel.appendChild(wrap);

    var hist = document.createElement('div');
    hist.className = 'dlg-hist';
    hist.innerHTML = '💬 <b>情景对话</b> —— 选择场景，扮演角色，根据中文提示说出英文台词。';
    wrap.appendChild(hist);

    NCE.api('/api/dialogue/stats')
      .then(function (s) {
        if (s && s.total) {
          hist.innerHTML += ' 累计 <b>' + s.total + '</b> 句 · 正确率 <b>' + s.accuracy + '%</b> · 完成 <b>' + s.completed + '</b> 篇对话。';
        } else {
          hist.innerHTML += ' 还没有记录，来试试吧！';
        }
      })
      .catch(function () {});

    var setup = document.createElement('div');
    setup.innerHTML =
      '<div class="dlg-row"><label style="font-size:15px">选择场景：</label><span class="dlg-chips" id="dlg-cats">加载中…</span></div>';
    wrap.appendChild(setup);

    var stage = document.createElement('div');
    wrap.appendChild(stage);

    var catsBox = setup.querySelector('#dlg-cats');

    function loadMeta() {
      return NCE.api('/api/dialogue/meta').then(function (m) {
        metaCache = m;
        return m;
      });
    }

    function renderCategories(m) {
      var cats = (m && m.categories) || {};
      var byCat = (m && m.byCategory) || {};
      catsBox.innerHTML = '';

      var all = document.createElement('button');
      all.className = 'dlg-chip active';
      all.textContent = '全部 ' + (m.total || 0) + ' 篇';
      all.dataset.cat = '';
      catsBox.appendChild(all);

      Object.keys(cats).forEach(function (key) {
        if (!byCat[key]) return;
        var c = document.createElement('button');
        c.className = 'dlg-chip';
        c.textContent = (cats[key].icon || '') + ' ' + cats[key].label + ' ' + byCat[key];
        c.dataset.cat = key;
        catsBox.appendChild(c);
      });

      catsBox.querySelectorAll('.dlg-chip').forEach(function (chip) {
        chip.onclick = function () {
          catsBox.querySelectorAll('.dlg-chip').forEach(function (x) {
            x.classList.toggle('active', x === chip);
          });
          curCategory = chip.dataset.cat;
          showList();
        };
      });
    }

    function showList() {
      var qs = curCategory ? '?category=' + encodeURIComponent(curCategory) : '';
      stage.innerHTML = '<div class="dlg-hint">加载对话列表…</div>';
      NCE.api('/api/dialogue/list' + qs)
        .then(function (d) {
          var list = (d && d.dialogues) || [];
          if (!list.length) {
            stage.innerHTML = '<div class="dlg-hint">该场景暂无对话内容</div>';
            return;
          }
          stage.innerHTML = '<div class="dlg-list" id="dlg-list"></div>';
          var box = stage.querySelector('#dlg-list');
          list.forEach(function (item) {
            var el = document.createElement('div');
            el.className = 'dlg-item';
            var catLabel = (metaCache && metaCache.categories[item.category]) || {};
            el.innerHTML =
              '<div class="t">' + NCE.escapeHtml(item.titleCn || item.title) +
              ' <span style="font-weight:400;color:#889;font-size:14px">' + NCE.escapeHtml(item.title) + '</span></div>' +
              '<div class="s">' + NCE.escapeHtml(item.scene || '') + '</div>' +
              '<div class="m">' + NCE.escapeHtml((catLabel.icon || '') + ' ' + (catLabel.label || item.category)) +
              ' · ' + item.practiceCount + ' 句练习 · 共 ' + item.turnCount + ' 轮</div>';
            el.onclick = function () {
              startDialogue(item.id);
            };
            box.appendChild(el);
          });
        })
        .catch(function (e) {
          console.error('[dialogue] 加载列表失败', e);
          stage.innerHTML = '<div class="dlg-hint">加载失败，请稍后重试</div>';
        });
    }

    function startDialogue(id) {
      stage.innerHTML = '<div class="dlg-hint">加载对话…</div>';
      NCE.api('/api/dialogue/' + encodeURIComponent(id))
        .then(function (dlg) {
          if (!dlg || !dlg.turns || !dlg.turns.length) {
            NCE.toast('对话内容为空', 'warn');
            showList();
            return;
          }
          runPractice(stage, dlg);
        })
        .catch(function (e) {
          console.error('[dialogue] 加载对话失败', e);
          NCE.toast('加载对话失败', 'error');
          showList();
        });
    }

    loadMeta()
      .then(function (m) {
        renderCategories(m);
        showList();
      })
      .catch(function (e) {
        console.error('[dialogue] 加载元数据失败', e);
        catsBox.innerHTML = '<span class="dlg-hint">加载失败</span>';
      });
  }

  function runPractice(stage, dlg) {
    var turnIdx = 0;
    var chatLog = [];
    var tally = { correct: 0, total: 0 };

    render();

    function render() {
      stage.innerHTML = '';
      var card = document.createElement('div');
      card.className = 'dlg-card';

      var catLabel = '';
      if (dlg.category) {
        NCE.api('/api/dialogue/meta').then(function (m) {
          var c = (m && m.categories && m.categories[dlg.category]) || {};
          catLabel = (c.icon || '') + ' ' + (c.label || dlg.category);
        }).catch(function () {});
      }

      card.innerHTML =
        '<div class="dlg-progress">' +
        '<span>' + NCE.escapeHtml(dlg.titleCn || dlg.title) + '</span>' +
        '<span>第 ' + (turnIdx + 1) + ' / ' + dlg.turns.length + ' 轮</span>' +
        '</div>' +
        (dlg.scene ? '<div class="dlg-scene">📍 ' + NCE.escapeHtml(dlg.scene) + '</div>' : '') +
        '<div class="dlg-chat" id="dlg-chat"></div>' +
        '<div id="dlg-active"></div>';
      stage.appendChild(card);

      var chatBox = card.querySelector('#dlg-chat');
      chatLog.forEach(function (entry) {
        appendBubble(chatBox, entry);
      });
      chatBox.scrollTop = chatBox.scrollHeight;

      var active = card.querySelector('#dlg-active');
      var turn = dlg.turns[turnIdx];

      if (!turn) {
        finish();
        return;
      }

      if (turn.practice) {
        showPracticeTurn(active, turn);
      } else {
        showPartnerTurn(active, turn, function () {
          chatLog.push({ role: turn.role, en: turn.en, cn: turn.cn, practice: false });
          turnIdx++;
          render();
        });
      }
    }

    function appendBubble(box, entry) {
      var b = document.createElement('div');
      var cls = entry.practice ? 'dlg-bubble you' : 'dlg-bubble them';
      if (entry.correct === true) cls += ' ok';
      if (entry.correct === false) cls += ' bad';
      b.className = cls;
      b.innerHTML =
        '<div class="role">' + NCE.escapeHtml(entry.role) + '</div>' +
        NCE.escapeHtml(entry.en || entry.userText || '') +
        (entry.cn ? '<div class="cn">' + NCE.escapeHtml(entry.cn) + '</div>' : '');
      box.appendChild(b);
    }

    function showPartnerTurn(active, turn, onNext) {
      active.innerHTML =
        '<div class="dlg-bubble them" style="max-width:100%">' +
        '<div class="role">' + NCE.escapeHtml(turn.role) + '</div>' +
        NCE.escapeHtml(turn.en) +
        '<div class="cn">' + NCE.escapeHtml(turn.cn) + '</div>' +
        '</div>' +
        '<div class="dlg-actions">' +
        '<button class="dlg-btn mini" id="dlg-speak">🔊 朗读</button>' +
        '<button class="dlg-btn primary" id="dlg-continue">继续 →</button>' +
        '</div>';
      NCE.speak(turn.en);
      active.querySelector('#dlg-speak').onclick = function () {
        NCE.speak(turn.en);
      };
      var btn = active.querySelector('#dlg-continue');
      btn.focus();
      btn.onclick = onNext;
      document.onkeydown = function (e) {
        if (e.key === 'Enter') onNext();
      };
    }

    function showPracticeTurn(active, turn) {
      active.innerHTML =
        '<div class="dlg-prompt">🎭 你是 <b>' + NCE.escapeHtml(turn.role) + '</b>，请说出：</div>' +
        '<div class="dlg-scene" style="margin-bottom:10px;font-size:16px;color:#123;background:#f6f8fc;border-color:#dbe4ff">' +
        NCE.escapeHtml(turn.cn) + '</div>' +
        '<input class="dlg-input" id="dlg-input" autocomplete="off" spellcheck="false" placeholder="输入英文台词，回车提交…" />' +
        '<div class="dlg-actions">' +
        '<button class="dlg-btn primary" id="dlg-submit">提交</button>' +
        '<button class="dlg-btn" id="dlg-skip">显示答案</button>' +
        '</div>' +
        '<div id="dlg-feedback"></div>';

      var input = active.querySelector('#dlg-input');
      var submitBtn = active.querySelector('#dlg-submit');
      var skipBtn = active.querySelector('#dlg-skip');
      var feedback = active.querySelector('#dlg-feedback');
      input.focus();

      var graded = false;

      function doGrade(val, skipped) {
        if (graded) return;
        graded = true;
        submitBtn.disabled = true;
        skipBtn.disabled = true;
        input.disabled = true;

        NCE.api('/api/dialogue/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: dlg.id, turn: turn.index, response: val || '' }),
        })
          .then(function (r) {
            if (!r || r.error) {
              NCE.toast((r && r.error) || '判分失败', 'error');
              graded = false;
              submitBtn.disabled = false;
              skipBtn.disabled = false;
              input.disabled = false;
              return;
            }
            tally.total++;
            if (r.correct) tally.correct++;
            else if (r.srsKey) {
              NCE.api('/api/srs/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [r.srsKey] }),
              }).catch(function () {});
            }
            showTurnFeedback(r, val, skipped);
          })
          .catch(function (e) {
            console.error('[dialogue] 判分失败', e);
            NCE.toast('判分失败，请稍后重试', 'error');
            graded = false;
            submitBtn.disabled = false;
            skipBtn.disabled = false;
            input.disabled = false;
          });
      }

      function showTurnFeedback(r, val, skipped) {
        var isLast = turnIdx + 1 >= dlg.turns.length;
        feedback.innerHTML =
          '<div class="dlg-verdict ' + (r.correct ? 'ok' : 'bad') + '">' +
          (r.correct ? '✓ 正确！' : (skipped ? '参考答案：' : '✗ 不对，看看参考答案')) + '</div>' +
          '<div class="dlg-answer">📖 ' + NCE.escapeHtml(r.answer) +
          ' <button class="dlg-btn mini" id="dlg-speak-ans">🔊</button></div>' +
          '<div class="dlg-actions">' +
          '<button class="dlg-btn primary" id="dlg-next">' + (isLast ? '完成对话 →' : '下一轮 →') + '</button>' +
          '</div>';

        chatLog.push({
          role: turn.role,
          en: r.answer,
          userText: val,
          cn: turn.cn,
          practice: true,
          correct: r.correct,
        });

        feedback.querySelector('#dlg-speak-ans').onclick = function () {
          NCE.speak(r.answer);
        };
        if (!r.correct) NCE.speak(r.answer);

        var nextBtn = feedback.querySelector('#dlg-next');
        nextBtn.focus();
        nextBtn.onclick = function () {
          turnIdx++;
          document.onkeydown = null;
          render();
        };
      }

      input.onkeydown = function (e) {
        if (e.key === 'Enter') doGrade(input.value.trim(), false);
      };
      submitBtn.onclick = function () {
        var val = input.value.trim();
        if (!val) {
          NCE.toast('先输入台词再提交', 'warn');
          return;
        }
        doGrade(val, false);
      };
      skipBtn.onclick = function () {
        doGrade('', true);
      };
    }

    function finish() {
      document.onkeydown = null;
      var acc = tally.total ? Math.round((tally.correct / tally.total) * 100) : 0;

      NCE.api('/api/dialogue/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dlg.id, correct: tally.correct, total: tally.total }),
      }).catch(function () {});

      stage.innerHTML = '';
      var card = document.createElement('div');
      card.className = 'dlg-card dlg-summary';
      card.innerHTML =
        '<div style="font-size:18px;font-weight:600;margin-bottom:8px">' + NCE.escapeHtml(dlg.titleCn || dlg.title) + '</div>' +
        '<div class="big">' + acc + '%</div>' +
        '<div class="sub">本轮正确率 · 练习 ' + tally.total + ' 句 · 正确 ' + tally.correct + ' 句</div>' +
        '<div class="dlg-actions" style="justify-content:center;margin-top:16px">' +
        '<button class="dlg-btn primary" id="dlg-retry">再练一遍</button>' +
        '<button class="dlg-btn" id="dlg-back">返回列表</button>' +
        '</div>';
      stage.appendChild(card);

      card.querySelector('#dlg-retry').onclick = function () {
        turnIdx = 0;
        chatLog = [];
        tally = { correct: 0, total: 0 };
        render();
      };
      card.querySelector('#dlg-back').onclick = function () {
        window.scrollTo(0, 0);
        NCE.gotoTab('dialogue');
      };
    }
  }

  NCE.registerFeature({
    id: 'dialogue',
    label: '情景对话',
    icon: '💬',
    onShow: onShow,
  });
})();
