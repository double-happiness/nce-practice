// 句型转换训练 —— 中译英 → 一般疑问句 → 否定句 → 对句子成分提问；通过 window.NCE 自注册
'use strict';

(function () {
  if (!window.NCE || !NCE.registerFeature) {
    console.error('[transform] NCE 未就绪，模块未加载');
    return;
  }

  var KIND_LABEL = {
    translate: '中译英',
    yesno: '一般疑问句',
    negative: '否定句',
    wh: '特殊疑问句',
    indirect: '间接引语',
    passive: '被动语态',
  };

  // ---------- 样式（全部 tf- 前缀，避免与全局冲突）----------
  function injectStyle() {
    if (document.getElementById('tf-style')) return;
    var css =
      '.tf-wrap{max-width:820px;margin:0 auto}' +
      '.tf-hist{background:#f4f7ff;border:1px solid #dbe4ff;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:14px;color:#334}' +
      '.tf-hist b{color:#2b57d6}' +
      '.tf-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}' +
      '.tf-chips{display:flex;gap:8px;flex-wrap:wrap}' +
      '.tf-chip{padding:7px 14px;border:1px solid #cfd6e6;border-radius:999px;background:#fff;cursor:pointer;font-size:14px;color:#223}' +
      '.tf-chip.active{background:#2b57d6;border-color:#2b57d6;color:#fff}' +
      '.tf-chip.muted{opacity:.45;cursor:not-allowed}' +
      '.tf-chip.covered{border-style:dashed}' +
      '.tf-cambridge{font-size:12px;color:#5b6b8a;background:#f0f4ff;border:1px solid #dbe4ff;border-radius:8px;padding:4px 10px;margin-left:8px}' +
      '.tf-mode{display:flex;gap:6px;margin-bottom:4px}' +
      '.tf-mode .tf-chip{font-size:13px;padding:5px 12px}' +
      '.tf-unit-group{width:100%;margin:4px 0 8px}' +
      '.tf-unit-sec{font-size:12px;color:#889;font-weight:600;margin:8px 0 4px}' +
      '.tf-select{padding:8px 10px;border:1px solid #ccd;border-radius:8px;font-size:15px}' +
      '.tf-btn{padding:9px 16px;border:1px solid #cfd6e6;border-radius:8px;background:#fff;cursor:pointer;font-size:15px;color:#223}' +
      '.tf-btn:hover{background:#f0f3fb}' +
      '.tf-btn.primary{background:#2b57d6;border-color:#2b57d6;color:#fff}' +
      '.tf-btn.primary:hover{background:#2149bd}' +
      '.tf-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.tf-card{background:#fff;border:1px solid #e5e9f2;border-radius:12px;padding:18px;margin-top:12px;box-shadow:0 1px 3px rgba(0,0,0,.04)}' +
      '.tf-progress{font-size:14px;color:#667;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
      '.tf-tags{color:#889;font-size:13px}' +
      '.tf-cn{font-size:22px;font-weight:600;margin:8px 0 14px;color:#123}' +
      '.tf-chain{margin:0 0 12px;padding:0;list-style:none}' +
      '.tf-chain li{padding:6px 10px;border-left:3px solid #dbe4ff;margin-bottom:4px;font-size:15px;background:#f8faff;border-radius:0 8px 8px 0}' +
      '.tf-chain .k{color:#667;font-size:13px;margin-right:8px}' +
      '.tf-chain .ok{color:#178a3a}' +
      '.tf-chain .bad{color:#d12f2f}' +
      '.tf-step-prompt{font-size:16px;font-weight:600;margin:10px 0 8px}' +
      '.tf-step-prompt .k{display:inline-block;background:#eef2ff;color:#2b57d6;border-radius:6px;padding:2px 8px;font-size:13px;margin-right:8px;font-weight:500}' +
      '.tf-input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ccd;border-radius:8px;font-size:16px;font-family:inherit}' +
      '.tf-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
      '.tf-verdict{font-size:16px;font-weight:600;margin:10px 0 4px}' +
      '.tf-verdict.ok{color:#178a3a}' +
      '.tf-verdict.bad{color:#d12f2f}' +
      '.tf-answer{margin-top:8px;padding:8px 12px;background:#f6f8fc;border-radius:8px;font-size:15px;color:#345}' +
      '.tf-cn{margin-top:4px;padding-top:4px;border-top:1px dashed #dbe2ef;color:#67718a;font-size:14px}' +
      '.tf-expl{margin-top:8px;padding:8px 12px;background:#fffaf0;border:1px solid #f4e6c8;border-radius:8px;font-size:14px;color:#654}' +
      '.tf-hint{color:#889;font-size:13px;margin:6px 0}' +
      '.tf-link-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}' +
      '.tf-link-btn{padding:5px 12px;border:1px solid #e5e9f2;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#334}' +
      '.tf-link-btn:hover{border-color:#2b57d6;color:#2b57d6}' +
      '.tf-lookup-hint{font-size:12px;color:#94a3b8;margin-top:6px}' +
      '.tf-summary{text-align:center;padding:20px}' +
      '.tf-summary .big{font-size:40px;font-weight:700;color:#2b57d6}' +
      '.tf-summary .sub{color:#667;margin-top:6px}' +
      '.tf-kinds{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}' +
      '.tf-kind{background:#f6f8fc;border-radius:10px;padding:8px 14px;font-size:14px;color:#345}' +
      '.tf-kind b{display:block;font-size:18px;color:#2b57d6}';
    var st = document.createElement('style');
    st.id = 'tf-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- 主流程 ----------
  function onShow(panel) {
    injectStyle();
    panel.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'tf-wrap';
    panel.appendChild(wrap);

    var hist = document.createElement('div');
    hist.className = 'tf-hist';
    hist.innerHTML = '🔀 <b>句型转换</b> —— 中译英后依次改疑问/否定/提问；练习链参考《剑桥初级/中级英语语法》单元编排，可与教材同步强化。';
    wrap.appendChild(hist);
    // 累计成绩（按当前档案）
    NCE.api('/api/transform/stats')
      .then(function (s) {
        if (s && s.total) {
          hist.innerHTML += ' 累计 <b>' + s.total + '</b> 步 · 正确率 <b>' + s.accuracy + '%</b>。';
        } else {
          hist.innerHTML += ' 还没有记录，来试试吧！';
        }
      })
      .catch(function () {});

    // 选择区：册数 + 筛选模式 + 语法点/剑桥单元 + 题量
    var setup = document.createElement('div');
    setup.innerHTML =
      '<div class="tf-row"><label style="font-size:15px">选择册数：</label><span class="tf-chips" id="tf-books"></span></div>' +
      '<div class="tf-row" id="tf-filter-row" style="display:none">' +
      '<label style="font-size:15px">筛选：</label>' +
      '<span class="tf-mode tf-chips" id="tf-mode">' +
      '<button type="button" class="tf-chip active" data-mode="grammar">语法点</button>' +
      '<button type="button" class="tf-chip" data-mode="cambridge">剑桥单元</button>' +
      '</span></div>' +
      '<div class="tf-row" id="tf-grammar-row" style="display:none"><label style="font-size:15px">语法点：</label><span class="tf-chips" id="tf-grammar"></span></div>' +
      '<div class="tf-row" id="tf-cambridge-row" style="display:none"><div id="tf-cambridge" style="width:100%"></div></div>' +
      '<div class="tf-row">' +
      '<label style="font-size:15px">句数：</label>' +
      '<select class="tf-select" id="tf-limit"><option value="5" selected>5 句</option><option value="10">10 句</option><option value="0">全部</option></select>' +
      '<label style="font-size:14px"><input type="checkbox" id="tf-random" checked /> 随机顺序</label>' +
      '<button class="tf-btn primary" id="tf-start" disabled>开始训练</button>' +
      '</div>';
    wrap.appendChild(setup);

    var stage = document.createElement('div');
    wrap.appendChild(stage);

    var booksBox = setup.querySelector('#tf-books');
    var filterRow = setup.querySelector('#tf-filter-row');
    var modeBox = setup.querySelector('#tf-mode');
    var grammarRow = setup.querySelector('#tf-grammar-row');
    var grammarBox = setup.querySelector('#tf-grammar');
    var cambridgeRow = setup.querySelector('#tf-cambridge-row');
    var cambridgeBox = setup.querySelector('#tf-cambridge');
    var startBtn = setup.querySelector('#tf-start');
    var curBook = '';
    var curGrammar = '';
    var curCambridgeUnit = '';
    var filterMode = 'grammar';
    var quizGrammarByBook = {};
    var tfGrammarByBook = {};
    var cambridgeByBook = {};

    function renderFilterPanels() {
      if (!curBook) {
        filterRow.style.display = 'none';
        grammarRow.style.display = 'none';
        cambridgeRow.style.display = 'none';
        curGrammar = '';
        curCambridgeUnit = '';
        return;
      }
      filterRow.style.display = '';
      if (filterMode === 'grammar') {
        grammarRow.style.display = '';
        cambridgeRow.style.display = 'none';
        curCambridgeUnit = '';
        renderGrammarChips();
      } else {
        grammarRow.style.display = 'none';
        cambridgeRow.style.display = '';
        curGrammar = '';
        renderCambridgeChips();
      }
    }

    function renderGrammarChips() {
      if (!curBook) {
        grammarRow.style.display = 'none';
        grammarBox.innerHTML = '';
        curGrammar = '';
        return;
      }
      var list = quizGrammarByBook[curBook] || tfGrammarByBook[curBook] || [];
      var covered = new Set(tfGrammarByBook[curBook] || []);
      if (!list.length) {
        grammarRow.style.display = 'none';
        grammarBox.innerHTML = '';
        curGrammar = '';
        return;
      }
      grammarRow.style.display = '';
      grammarBox.innerHTML = '';
      var all = document.createElement('button');
      all.type = 'button';
      all.className = 'tf-chip' + (curGrammar === '' ? ' active' : '');
      all.textContent = '全部语法';
      all.dataset.grammar = '';
      grammarBox.appendChild(all);
      list.forEach(function (tag) {
        var c = document.createElement('button');
        c.type = 'button';
        c.className = 'tf-chip' + (curGrammar === tag ? ' active' : '') + (covered.has(tag) ? '' : ' muted');
        c.textContent = tag;
        c.dataset.grammar = tag;
        c.title = covered.has(tag) ? '' : '该语法点暂无句型转换';
        if (!covered.has(tag)) c.disabled = true;
        grammarBox.appendChild(c);
      });
      grammarBox.querySelectorAll('.tf-chip').forEach(function (c) {
        c.onclick = function () {
          if (c.disabled) return;
          grammarBox.querySelectorAll('.tf-chip').forEach(function (x) {
            x.classList.toggle('active', x === c);
          });
          curGrammar = c.dataset.grammar;
        };
      });
    }

    function renderCambridgeChips() {
      var info = cambridgeByBook[curBook];
      if (!info || !info.sections || !info.sections.length) {
        cambridgeBox.innerHTML = '<span class="tf-hint">暂无剑桥单元对照</span>';
        return;
      }
      var covMap = {};
      (info.coverage || []).forEach(function (c) { covMap[c.unit] = c.count; });
      var html = '<div class="tf-unit-group"><span class="tf-chips">' +
        '<button type="button" class="tf-chip' + (curCambridgeUnit === '' ? ' active' : '') + '" data-unit="">全部单元</button>' +
        '</span></div>';
      info.sections.forEach(function (sec) {
        html += '<div class="tf-unit-group"><div class="tf-unit-sec">' + NCE.escapeHtml(sec.titleCn) + '</div><span class="tf-chips">';
        (sec.units || []).forEach(function (u) {
          var cnt = covMap[u.unit] || 0;
          var active = String(curCambridgeUnit) === String(u.unit);
          var cls = 'tf-chip' + (active ? ' active' : '') + (cnt ? '' : ' muted');
          html += '<button type="button" class="' + cls + '" data-unit="' + u.unit + '"' +
            (cnt ? '' : ' disabled') + ' title="' + NCE.escapeAttr(u.title) + '">' +
            'U' + u.unit + ' ' + NCE.escapeHtml(u.titleCn) + (cnt ? ' ·' + cnt : '') + '</button>';
        });
        html += '</span></div>';
      });
      if (info.levelTitle) {
        html = '<div class="tf-hint" style="margin-bottom:6px">📘 ' + NCE.escapeHtml(info.levelTitle) +
          (info.levelSubtitle ? '（' + NCE.escapeHtml(info.levelSubtitle) + '）' : '') + '</div>' + html;
      }
      cambridgeBox.innerHTML = html;
      cambridgeBox.querySelectorAll('.tf-chip').forEach(function (c) {
        c.onclick = function () {
          if (c.disabled) return;
          cambridgeBox.querySelectorAll('.tf-chip').forEach(function (x) {
            x.classList.toggle('active', x === c);
          });
          curCambridgeUnit = c.dataset.unit;
        };
      });
    }

    modeBox.querySelectorAll('.tf-chip').forEach(function (btn) {
      btn.onclick = function () {
        filterMode = btn.dataset.mode;
        modeBox.querySelectorAll('.tf-chip').forEach(function (x) {
          x.classList.toggle('active', x === btn);
        });
        renderFilterPanels();
      };
    });

    Promise.all([
      NCE.api('/api/transform/meta'),
      NCE.api('/api/meta').catch(function () { return {}; }),
    ])
      .then(function (res) {
        var m = res[0];
        var meta = res[1] || {};
        quizGrammarByBook = meta.grammarByBook || {};
        tfGrammarByBook = (m && m.grammarByBook) || {};
        cambridgeByBook = (m && m.cambridgeByBook) || {};
        var byBook = (m && m.byBook) || {};
        var books = Object.keys(byBook).sort();
        if (!books.length) {
          booksBox.innerHTML = '<span class="tf-hint">暂无练习内容</span>';
          return;
        }
        var all = document.createElement('button');
        all.className = 'tf-chip active';
        all.textContent = '全部 ' + (m.total || 0) + ' 句';
        all.dataset.book = '';
        booksBox.appendChild(all);
        books.forEach(function (b) {
          var c = document.createElement('button');
          c.className = 'tf-chip';
          c.textContent = '第' + b + '册 ' + byBook[b] + ' 句';
          c.dataset.book = b;
          booksBox.appendChild(c);
        });
        booksBox.querySelectorAll('.tf-chip').forEach(function (c) {
          c.onclick = function () {
            booksBox.querySelectorAll('.tf-chip').forEach(function (x) { x.classList.toggle('active', x === c); });
            curBook = c.dataset.book;
            curGrammar = '';
            curCambridgeUnit = '';
            renderFilterPanels();
          };
        });
        renderFilterPanels();
        startBtn.disabled = false;
      })
      .catch(function (e) {
        console.error('[transform] 加载元数据失败', e);
        booksBox.innerHTML = '<span class="tf-hint">加载失败</span>';
      });

    startBtn.onclick = function () {
      var limit = setup.querySelector('#tf-limit').value;
      var random = setup.querySelector('#tf-random').checked;
      var qs = '?limit=' + limit + (random ? '&random=1' : '') + (curBook ? '&book=' + curBook : '');
      if (curGrammar) qs += '&grammar=' + encodeURIComponent(curGrammar);
      if (curCambridgeUnit) qs += '&cambridgeUnit=' + encodeURIComponent(curCambridgeUnit);
      startBtn.disabled = true;
      NCE.api('/api/transform/exercises' + qs)
        .then(function (d) {
          var list = (d && d.exercises) || [];
          if (!list.length) {
            NCE.toast('没有符合条件的练习', 'warn');
            return;
          }
          runSession(stage, list);
        })
        .catch(function (e) {
          console.error('[transform] 拉取练习失败', e);
          NCE.toast('加载练习失败，请稍后重试', 'error');
        })
        .then(function () {
          startBtn.disabled = false;
        });
    };
  }

  // ---------- 单次训练会话 ----------
  function runSession(stage, exercises) {
    var exIdx = 0;
    var stepIdx = 0;
    var chain = []; // 当前句已完成步骤 [{kind, correct, canonical}]
    var tally = { seen: 0, correct: 0, byKind: {} }; // 本轮统计

    render();

    function render() {
      var ex = exercises[exIdx];
      var step = ex.steps[stepIdx];
      stage.innerHTML = '';

      var card = document.createElement('div');
      card.className = 'tf-card';
      var camTag = '';
      if (ex.cambridge && ex.cambridge.unit) {
        camTag = '<span class="tf-cambridge">📘 U' + ex.cambridge.unit + ' ' +
          NCE.escapeHtml(ex.cambridge.titleCn || ex.cambridge.title || '') + '</span>';
      }
      card.innerHTML =
        '<div class="tf-progress"><span>第 ' + (exIdx + 1) + ' / ' + exercises.length + ' 句 · 步骤 ' +
        (stepIdx + 1) + ' / ' + ex.steps.length + '</span>' +
        '<span class="tf-tags">' + NCE.escapeHtml((ex.grammar || []).join(' · ')) + camTag + '</span></div>' +
        '<div class="tf-cn">' + NCE.escapeHtml(ex.cn) + '</div>' +
        '<ul class="tf-chain" id="tf-chain"></ul>' +
        '<div class="tf-step-prompt"><span class="k">' + (KIND_LABEL[step.kind] || step.kind) + '</span>' +
        NCE.escapeHtml(step.prompt) + '</div>' +
        (NCE.bindPassageLookup ? '<div class="tf-lookup-hint">💡 选中下方英文句子中的单词可查词典</div>' : '') +
        '<input class="tf-input" id="tf-input" autocomplete="off" spellcheck="false" placeholder="输入英文句子，回车提交…" />' +
        '<div class="tf-actions"><button class="tf-btn primary" id="tf-submit">提交</button></div>' +
        '<div id="tf-feedback"></div>';
      stage.appendChild(card);

      // 已完成步骤链（标准形式），让转换过程一目了然
      var chainBox = card.querySelector('#tf-chain');
      chain.forEach(function (c) {
        var li = document.createElement('li');
        li.innerHTML =
          '<span class="' + (c.correct ? 'ok' : 'bad') + '">' + (c.correct ? '✓' : '✗') + '</span> ' +
          '<span class="k">' + (KIND_LABEL[c.kind] || c.kind) + '</span>' +
          (NCE.wrapPassageWords ? NCE.wrapPassageWords(c.canonical) : NCE.escapeHtml(c.canonical));
        chainBox.appendChild(li);
      });
      if (!chain.length) chainBox.style.display = 'none';
      else {
        if (NCE.bindPassageLookup) NCE.bindPassageLookup(chainBox, ex.book);
        if (NCE.bindPassageWords) NCE.bindPassageWords(chainBox, ex.book);
      }

      var input = card.querySelector('#tf-input');
      var submitBtn = card.querySelector('#tf-submit');
      var feedback = card.querySelector('#tf-feedback');
      input.focus();

      var graded = false;
      function submit() {
        if (graded) return;
        var val = input.value.trim();
        if (!val) {
          NCE.toast('先输入答案再提交', 'warn');
          return;
        }
        graded = true;
        submitBtn.disabled = true;
        input.disabled = true;
        NCE.api('/api/transform/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ex.id, step: stepIdx, response: val }),
        })
          .then(function (r) {
            if (!r || r.error) {
              NCE.toast((r && r.error) || '判分失败', 'error');
              graded = false;
              submitBtn.disabled = false;
              input.disabled = false;
              return;
            }
            showFeedback(r, val);
          })
          .catch(function (e) {
            console.error('[transform] 判分失败', e);
            NCE.toast('判分失败，请稍后重试', 'error');
            graded = false;
            submitBtn.disabled = false;
            input.disabled = false;
          });
      }

      function showFeedback(r, val) {
        tally.seen++;
        if (r.correct) tally.correct++;
        var bk = tally.byKind[r.kind] || { seen: 0, correct: 0 };
        bk.seen++;
        if (r.correct) bk.correct++;
        tally.byKind[r.kind] = bk;
        chain.push({ kind: r.kind, correct: r.correct, canonical: r.answers[0] });

        // 错步进入间隔复习队列（key = 练习id#步骤下标），按遗忘曲线重现
        if (!r.correct) {
          NCE.api('/api/srs/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [ex.id + '#' + stepIdx] }),
          }).catch(function () {});
        }

        var isLastStep = stepIdx + 1 >= ex.steps.length;
        var isLastEx = exIdx + 1 >= exercises.length;
        var nextLabel = !isLastStep ? '下一步 →' : (!isLastEx ? '下一句 →' : '查看小结 →');

        var answersHtml = NCE.formatAnswersWithSpeak
          ? NCE.formatAnswersWithSpeak(r.answers, { wrapPassage: true, btnClass: 'tf-btn tf-speak' })
          : NCE.escapeHtml((r.answers || [])[0] || '');

        var answerCnHtml = r.answerCn
          ? '<div class="tf-cn">译：' + NCE.escapeHtml(r.answerCn) + '</div>'
          : '';

        feedback.innerHTML =
          '<div class="tf-verdict ' + (r.correct ? 'ok' : 'bad') + '">' +
          (r.correct ? '✓ 正确' : '✗ 不对，看看参考答案（已加入间隔复习）') + '</div>' +
          '<div class="tf-answer" id="tf-answer">📖 参考答案：' + answersHtml + answerCnHtml + '</div>' +
          (isLastStep && r.explanation ? '<div class="tf-expl">💡 ' + NCE.escapeHtml(r.explanation) +
          (r.cambridgeHint ? '<br><span style="color:#5b6b8a">' + NCE.escapeHtml(r.cambridgeHint) + '</span>' : '') +
          '</div>' : '') +
          '<div class="tf-actions"><button class="tf-btn primary" id="tf-next">' + nextLabel + '</button></div>' +
          '<div class="tf-hint">回车 = 继续</div>';

        if (NCE.bindSpeakClicks) NCE.bindSpeakClicks(feedback);
        var ansEl = feedback.querySelector('#tf-answer');
        if (NCE.bindPassageLookup && ansEl) NCE.bindPassageLookup(ansEl, ex.book);
        if (NCE.bindPassageWords && ansEl) NCE.bindPassageWords(ansEl, ex.book);

        if (!r.correct) {
          var chipWords = [];
          var seen = {};
          [].concat(r.answers || [], [val]).concat(chain.map(function (c) { return c.canonical; })).forEach(function (src) {
            (NCE.extractLookupWords ? NCE.extractLookupWords(src) : []).forEach(function (w) {
              var k = w.toLowerCase();
              if (!seen[k]) { seen[k] = true; chipWords.push(w); }
            });
          });
          if (NCE.appendDictChips && chipWords.length) {
            NCE.appendDictChips(feedback, chipWords.slice(0, 8), ex.book);
          }
          if (NCE.goToLesson && ex.book != null && ex.lesson != null) {
            var links = document.createElement('div');
            links.className = 'tf-link-row';
            var lessonBtn = document.createElement('button');
            lessonBtn.type = 'button';
            lessonBtn.className = 'tf-link-btn';
            lessonBtn.textContent = '📖 去课文';
            lessonBtn.onclick = function () { NCE.goToLesson(ex.book, ex.lesson); };
            links.appendChild(lessonBtn);
            feedback.appendChild(links);
          }
        }

        var nextBtn = feedback.querySelector('#tf-next');
        nextBtn.focus();
        nextBtn.onclick = function () {
          if (!isLastStep) {
            stepIdx++;
          } else if (!isLastEx) {
            exIdx++;
            stepIdx = 0;
            chain = [];
          } else {
            finish();
            return;
          }
          render();
        };
      }

      input.onkeydown = function (e) {
        if (e.key === 'Enter') submit();
      };
      submitBtn.onclick = submit;
    }

    function finish() {
      var acc = tally.seen ? Math.round((tally.correct / tally.seen) * 100) : 0;
      stage.innerHTML = '';
      var card = document.createElement('div');
      card.className = 'tf-card tf-summary';
      var kindsHtml = Object.keys(tally.byKind)
        .map(function (k) {
          var v = tally.byKind[k];
          return '<div class="tf-kind"><b>' + v.correct + '/' + v.seen + '</b>' + (KIND_LABEL[k] || k) + '</div>';
        })
        .join('');
      card.innerHTML =
        '<div class="big">' + acc + '%</div>' +
        '<div class="sub">本轮正确率 · 共 ' + exercises.length + ' 句 ' + tally.seen + ' 步</div>' +
        '<div class="tf-kinds">' + kindsHtml + '</div>' +
        '<div class="tf-actions" style="justify-content:center;margin-top:16px">' +
        '<button class="tf-btn primary" id="tf-again">再练一组</button>' +
        '</div>';
      stage.appendChild(card);
      card.querySelector('#tf-again').onclick = function () {
        window.scrollTo(0, 0);
        stage.innerHTML = '';
        NCE.gotoTab('transform');
      };
    }
  }

  NCE.registerFeature({
    id: 'transform',
    label: '句型转换',
    icon: '🔀',
    onShow: onShow,
  });
})();
