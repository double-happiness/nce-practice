// 听写模式（Dictation）—— 纯前端功能模块，通过 window.NCE 自注册
'use strict';

(function () {
  // ---------- 纯函数：分词 / 逐词批改（放在 NCE 守卫之前，Node 可 require 做单测）----------
  function tokenize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[‘’ʼ]/g, "'") // 弯撇号 → 直撇号：听写打出 don’t 与 don't 等价
      .replace(/[^a-z0-9\s']/g, ' ') // 仅保留字母/数字/撇号
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
  }

  // 逐词批改：先用最长公共子序列（LCS）对齐两边的词序列，
  // 漏听/多打一个词只算错那一处，不会让后面整句错位全标红。
  // 返回 { rate, cells:[{word, ok}], total, correct }，cells 基于标准答案的每个词。
  function compare(standard, user) {
    var std = tokenize(standard);
    var usr = tokenize(user);
    var n = std.length;
    var m = usr.length;
    // dp[i][j] = std[i:] 与 usr[j:] 的 LCS 长度（句子都很短，O(n·m) 足够）
    var dp = [];
    for (var r = 0; r <= n; r++) dp.push(new Array(m + 1).fill(0));
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = std[i] === usr[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    // 回溯出对齐结果：std 中被匹配到的词记为正确
    var ok = new Array(n).fill(false);
    var a = 0;
    var b = 0;
    while (a < n && b < m) {
      if (std[a] === usr[b]) { ok[a] = true; a++; b++; }
      else if (dp[a + 1][b] >= dp[a][b + 1]) a++;
      else b++;
    }
    var cells = [];
    var correct = 0;
    for (var k = 0; k < n; k++) {
      if (ok[k]) correct++;
      cells.push({ word: std[k], ok: ok[k] });
    }
    var rate = n ? Math.round((correct / n) * 100) : 0;
    return { rate: rate, cells: cells, total: n, correct: correct };
  }

  // 导出纯函数以便测试（不影响浏览器运行）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { tokenize: tokenize, compare: compare };
  }
  if (typeof window === 'undefined') return; // Node 单测环境：只导出纯函数

  if (!window.NCE || !NCE.registerFeature) {
    console.error('[dictation] NCE 未就绪，模块未加载');
    return;
  }

  // 成绩/断点存 NCEStore（按档案隔离、服务器同步）
  var LS_BEST = 'dct-best'; // 历史最好平均正确率（数字）
  var LS_LAST = 'dct-last'; // 最近一次成绩（对象）
  var LS_POS = 'dct-pos'; // 每课上次听写到第几句（{ lesson: idx }）

  // ---------- 样式（全部 dct- 前缀，避免与全局冲突）----------
  function injectStyle() {
    if (document.getElementById('dct-style')) return;
    var css =
      '.dct-wrap{max-width:820px;margin:0 auto}' +
      '.dct-hist{background:#f4f7ff;border:1px solid #dbe4ff;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:14px;color:#334}' +
      '.dct-hist b{color:#2b57d6}' +
      '.dct-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}' +
      '.dct-select{padding:8px 10px;border:1px solid #ccd;border-radius:8px;font-size:15px;min-width:260px;max-width:100%}' +
      '.dct-btn{padding:9px 16px;border:1px solid #cfd6e6;border-radius:8px;background:#fff;cursor:pointer;font-size:15px;color:#223}' +
      '.dct-btn:hover{background:#f0f3fb}' +
      '.dct-btn.primary{background:#2b57d6;border-color:#2b57d6;color:#fff}' +
      '.dct-btn.primary:hover{background:#2149bd}' +
      '.dct-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.dct-progress{font-size:14px;color:#667;margin:6px 0}' +
      '.dct-nav{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}' +
      '.dct-navbtns{display:inline-flex;gap:6px}' +
      '.dct-btn.mini{padding:5px 10px;font-size:13px}' +
      '.dct-done{color:#178a3a;font-size:12px;font-weight:600}' +
      '.dct-card{background:#fff;border:1px solid #e5e9f2;border-radius:12px;padding:18px;margin-top:12px;box-shadow:0 1px 3px rgba(0,0,0,.04)}' +
      '.dct-play{font-size:38px;background:none;border:none;cursor:pointer;line-height:1}' +
      '.dct-hint{color:#889;font-size:13px;margin:8px 0}' +
      '.dct-input{width:100%;box-sizing:border-box;min-height:70px;padding:10px 12px;border:1px solid #ccd;border-radius:8px;font-size:16px;font-family:inherit;resize:vertical}' +
      '.dct-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
      '.dct-rate{font-size:16px;font-weight:600;margin:10px 0}' +
      '.dct-diff{font-size:18px;line-height:1.9;word-break:break-word}' +
      '.dct-ok{color:#178a3a;font-weight:600}' +
      '.dct-bad{color:#d12f2f;font-weight:600;text-decoration:underline dotted}' +
      '.dct-answer{margin-top:10px;padding:8px 12px;background:#f6f8fc;border-radius:8px;font-size:15px;color:#345}' +
      '.dct-cn{margin-top:4px;padding-top:4px;border-top:1px dashed #dbe2ef;color:#67718a;font-size:14px}' +
      '.dct-summary{text-align:center;padding:20px}' +
      '.dct-summary .big{font-size:40px;font-weight:700;color:#2b57d6}' +
      '.dct-summary .sub{color:#667;margin-top:6px}';
    var st = document.createElement('style');
    st.id = 'dct-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- NCEStore 读取（旧版存的是字符串，这里做一次类型兜底）----------
  function readNum(key) {
    var v = parseFloat(NCEStore.get(key));
    return isNaN(v) ? null : v;
  }
  function readJSON(key) {
    var v = NCEStore.get(key);
    return v === undefined ? null : v;
  }

  // ---------- 主流程 ----------
  function onShow(panel) {
    injectStyle();
    panel.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'dct-wrap';
    panel.appendChild(wrap);

    // 顶部历史成绩
    var hist = document.createElement('div');
    hist.className = 'dct-hist';
    var best = readNum(LS_BEST);
    var last = readJSON(LS_LAST);
    var histHtml = '🎧 <b>听写模式</b> —— 听英音、打出句子、逐词批改。';
    if (best != null) {
      histHtml += ' 历史最好平均正确率：<b>' + best + '%</b>。';
    } else {
      histHtml += ' 还没有记录，来试试吧！';
    }
    if (last && last.avg != null) {
      histHtml +=
        '<br>最近一次：Lesson ' +
        NCE.escapeHtml(String(last.lesson)) +
        ' · 平均 ' +
        NCE.escapeHtml(String(last.avg)) +
        '% · ' +
        NCE.escapeHtml(String(last.count)) +
        ' 句（' +
        NCE.escapeHtml(String(last.date || '')) +
        '）';
    }
    hist.innerHTML = histHtml;
    wrap.appendChild(hist);

    // 选课区
    var setup = document.createElement('div');
    setup.className = 'dct-row';
    setup.innerHTML =
      '<label style="font-size:15px">册：</label>' +
      '<select class="dct-select" id="dct-book" style="min-width:100px">' +
      '<option value="1">第1册</option><option value="2">第2册</option>' +
      '</select>' +
      '<label style="font-size:15px">课程：</label>' +
      '<select class="dct-select" id="dct-lesson"><option value="">加载课程中…</option></select>' +
      '<button class="dct-btn primary" id="dct-start" disabled>开始听写</button>';
    wrap.appendChild(setup);

    var stage = document.createElement('div');
    stage.id = 'dct-stage';
    wrap.appendChild(stage);

    var bookSel = setup.querySelector('#dct-book');
    var sel = setup.querySelector('#dct-lesson');
    var startBtn = setup.querySelector('#dct-start');
    var curBook = '1';

    function loadLessonList(book, pend) {
      curBook = String(book);
      bookSel.value = curBook;
      sel.innerHTML = '<option value="">加载中…</option>';
      startBtn.disabled = true;
      return NCE.api('/api/lessons?book=' + encodeURIComponent(curBook))
        .then(function (data) {
          var lessons = (data && data.lessons) || [];
          if (!lessons.length) {
            sel.innerHTML = '<option value="">无可用课程</option>';
            return;
          }
          sel.innerHTML = '';
          lessons.forEach(function (l) {
            var opt = document.createElement('option');
            opt.value = l.lesson;
            opt.textContent =
              'Lesson ' + l.lesson + '. ' + (l.title || '') + (l.titleCn ? ' · ' + l.titleCn : '');
            sel.appendChild(opt);
          });
          startBtn.disabled = false;
          if (pend && String(pend.book) === curBook && pend.lesson) {
            sel.value = String(pend.lesson);
          }
        })
        .catch(function (e) {
          console.error('[dictation] 加载课程失败', e);
          sel.innerHTML = '<option value="">加载失败</option>';
        });
    }

    bookSel.onchange = function () {
      loadLessonList(bookSel.value);
    };

    var pend = NCE.pendingDictation;
    NCE.pendingDictation = null;
    loadLessonList(pend && pend.book ? pend.book : '1', pend).then(function () {
      if (pend && pend.lesson && sel.value === String(pend.lesson)) startBtn.click();
    });

    startBtn.onclick = function () {
      var lesson = sel.value;
      if (!lesson) return;
      startBtn.disabled = true;
      startBtn.textContent = '准备中…';
      NCE.api('/api/lesson/' + curBook + '/' + lesson)
        .then(function (l) {
          if (!l || l.error) {
            NCE.toast((l && l.error) || '加载课程失败', 'bad');
            return;
          }
          var sentences = collectSentences(l);
          if (!sentences.length) {
            NCE.toast('本课没有可用于听写的例句，换一课试试', 'bad');
            return;
          }
          runSession(stage, curBook, lesson, sentences);
        })
        .catch(function (e) {
          console.error('[dictation] 加载课文失败', e);
          NCE.toast('加载课文失败，请稍后重试', 'bad');
        })
        .then(function () {
          startBtn.disabled = false;
          startBtn.textContent = '开始听写';
        });
    };
  }

  // 只保留中文部分（汉字 + 中文标点），用于答案区的译文展示
  function cnOnly(s) {
    var m = String(s == null ? '' : s).match(/[一-鿿　-〿＀-￯]+/g);
    return m ? m.join('').trim() : '';
  }

  // 从课文详情收集听写句集：优先 article 分段，其次 words[].eg + grammar[].examples。
  function collectSentences(l) {
    var raw = [];
    if (l.article && l.article.en) {
      var ens = String(l.article.en).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
      var cns = String(l.article.cn || '').split(/\n+/).map(function (s) { return s.trim(); });
      ens.forEach(function (en, i) {
        raw.push(cns[i] ? en + ' ' + cns[i] : en);
      });
    }
    (l.words || []).forEach(function (w) {
      if (w && w.eg) raw.push(w.eg);
    });
    (l.grammar || []).forEach(function (g) {
      (g && g.examples ? g.examples : []).forEach(function (e) {
        raw.push(e);
      });
    });
    var seen = {};
    var out = [];
    raw.forEach(function (s) {
      var en = NCE.enOnly(s);
      if (!en) return;
      if (tokenize(en).length < 3) return; // 太短跳过
      var key = tokenize(en).join(' ');
      if (seen[key]) return; // 去重
      seen[key] = 1;
      out.push({ en: en, cn: cnOnly(s) });
    });
    return out;
  }

  // 答案区 HTML：英文 + （若有）中文译文
  function answerHtml(s) {
    return (
      '<div class="dct-answer">📖 标准答案：' + NCE.escapeHtml(s.en) +
      (s.cn ? '<div class="dct-cn">译：' + NCE.escapeHtml(s.cn) + '</div>' : '') +
      '</div>'
    );
  }

  // 每课听写位置记忆（键 "册-课" → 句序号）
  function posKey(book, lesson) {
    return String(book) + '-' + String(lesson);
  }
  function loadPosMap() {
    return readJSON(LS_POS) || {};
  }
  function savePosFor(book, lesson, idx) {
    var m = loadPosMap();
    m[posKey(book, lesson)] = idx;
    NCEStore.set(LS_POS, m);
  }

  // ---------- 单次听写会话 ----------
  function runSession(stage, book, lesson, sentences) {
    var idx = 0;
    var pk = posKey(book, lesson);
    var savedPos = Number(loadPosMap()[pk]);
    var resumed = false;
    if (!isNaN(savedPos) && savedPos > 0 && savedPos < sentences.length) {
      idx = savedPos;
      resumed = true;
    }
    var rates = {}; // idx -> 该句最近一次正确率（跳过的句子不计入平均）
    render();

    // 前后翻句：随时可用，不必先提交本句
    function nav(delta) {
      var n = idx + delta;
      if (n < 0 || n >= sentences.length) return;
      idx = n;
      savePosFor(book, lesson, idx);
      render();
    }

    function render() {
      var s = sentences[idx];
      stage.innerHTML = '';
      var card = document.createElement('div');
      card.className = 'dct-card';

      var prog = document.createElement('div');
      prog.className = 'dct-progress dct-nav';
      prog.innerHTML =
        '<span>第 ' + (idx + 1) + ' / ' + sentences.length + ' 句' +
        (rates[idx] != null ? '　<span class="dct-done">已听写 ' + rates[idx] + '%</span>' : '') +
        (resumed && idx === savedPos ? '　<span class="dct-done">已从上次位置继续</span>' : '') +
        '</span>' +
        '<span class="dct-navbtns">' +
        '<button class="dct-btn mini" id="dct-prev"' + (idx <= 0 ? ' disabled' : '') + '>‹ 上一句</button>' +
        '<button class="dct-btn mini" id="dct-nextq"' + (idx >= sentences.length - 1 ? ' disabled' : '') + '>下一句 ›</button>' +
        '</span>';
      card.appendChild(prog);
      prog.querySelector('#dct-prev').onclick = function () { nav(-1); };
      prog.querySelector('#dct-nextq').onclick = function () { nav(1); };

      var playRow = document.createElement('div');
      playRow.className = 'dct-row';
      playRow.innerHTML =
        '<button class="dct-play" id="dct-play" title="播放">🔊</button>' +
        '<span class="dct-hint">点击喇叭播放，把听到的句子输入下方文本框。</span>';
      card.appendChild(playRow);

      var input = document.createElement('textarea');
      input.className = 'dct-input';
      input.id = 'dct-typed';
      input.placeholder = '在此输入你听到的句子…';
      input.setAttribute('autocomplete', 'off');
      input.spellcheck = false;
      card.appendChild(input);

      var actions = document.createElement('div');
      actions.className = 'dct-actions';
      actions.innerHTML =
        '<button class="dct-btn primary" id="dct-submit">提交批改</button>' +
        '<button class="dct-btn" id="dct-replay">🔊 重听</button>' +
        '<button class="dct-btn" id="dct-reveal">显示答案</button>';
      card.appendChild(actions);

      var result = document.createElement('div');
      result.id = 'dct-result';
      card.appendChild(result);

      stage.appendChild(card);

      // 自动播放当前句
      NCE.speak(s.en);
      input.focus();

      card.querySelector('#dct-play').onclick = function () {
        NCE.speak(s.en);
      };
      card.querySelector('#dct-replay').onclick = function () {
        NCE.speak(s.en);
      };
      card.querySelector('#dct-reveal').onclick = function () {
        result.innerHTML = answerHtml(s);
      };
      card.querySelector('#dct-submit').onclick = function () {
        doSubmit(s, input.value, result);
      };
    }

    function doSubmit(standard, typed, resultBox) {
      var cmp = compare(standard.en, typed);
      rates[idx] = cmp.rate; // 同一句重做取最近一次
      savePosFor(book, lesson, idx);

      var diffHtml = cmp.cells
        .map(function (c) {
          var cls = c.ok ? 'dct-ok' : 'dct-bad';
          return '<span class="' + cls + '">' + NCE.escapeHtml(c.word) + '</span>';
        })
        .join(' ');

      resultBox.innerHTML =
        '<div class="dct-rate">本句正确率：' +
        cmp.rate +
        '% （' +
        cmp.correct +
        '/' +
        cmp.total +
        ' 词）</div>' +
        '<div class="dct-diff">' +
        diffHtml +
        '</div>' +
        answerHtml(standard) +
        '<div class="dct-actions">' +
        (idx + 1 < sentences.length
          ? '<button class="dct-btn primary" id="dct-next">下一句 →</button>'
          : '<button class="dct-btn primary" id="dct-finish">查看小结 →</button>') +
        '<button class="dct-btn" id="dct-replay2">🔊 重听</button>' +
        '</div>';

      resultBox.querySelector('#dct-replay2').onclick = function () {
        NCE.speak(standard.en);
      };
      var nextBtn = resultBox.querySelector('#dct-next');
      if (nextBtn) {
        nextBtn.onclick = function () {
          nav(1);
        };
      }
      var finishBtn = resultBox.querySelector('#dct-finish');
      if (finishBtn) {
        finishBtn.onclick = function () {
          finish();
        };
      }
    }

    function finish() {
      // 只统计实际听写过的句子（跳过的不计入）
      var done = Object.keys(rates);
      var sum = done.reduce(function (a, k) {
        return a + rates[k];
      }, 0);
      var avg = done.length ? Math.round(sum / done.length) : 0;
      savePosFor(lesson, 0); // 本课听完，下次从头开始

      // 存最近一次成绩 + 更新历史最好
      var rec = {
        avg: avg,
        count: done.length,
        book: book,
        lesson: lesson,
        date: new Date().toLocaleString('zh-CN'),
      };
      NCEStore.set(LS_LAST, rec);
      var best = readNum(LS_BEST);
      if (best == null || avg > best) NCEStore.set(LS_BEST, avg);

      stage.innerHTML = '';
      var card = document.createElement('div');
      card.className = 'dct-card dct-summary';
      var best2 = readNum(LS_BEST);
      card.innerHTML =
        '<div class="big">' +
        avg +
        '%</div>' +
        '<div class="sub">平均正确率 · 共听写 ' +
        done.length +
        ' 句</div>' +
        (best2 != null ? '<div class="sub">历史最好：' + best2 + '%</div>' : '') +
        '<div class="dct-actions" style="justify-content:center">' +
        '<button class="dct-btn primary" id="dct-again">再听写一次</button>' +
        '</div>';
      stage.appendChild(card);
      card.querySelector('#dct-again').onclick = function () {
        idx = 0;
        rates = {};
        resumed = false;
        render();
      };
    }
  }

  NCE.registerFeature({
    id: 'dictation',
    label: '听写',
    icon: '🎧',
    onShow: onShow,
  });
})();
