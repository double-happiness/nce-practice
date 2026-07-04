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
      '.tf-section{background:#f8faff;border:1px solid #e0e8f8;border-radius:12px;padding:14px 16px;margin:12px 0}' +
      '.tf-section-title{font-size:15px;font-weight:700;color:#1e3a8a;margin:0 0 8px}' +
      '.tf-section .tf-hint{margin:0 0 10px}' +
      '.tf-label{font-size:14px;font-weight:600;color:#445;min-width:72px;flex-shrink:0;padding-top:6px}' +
      '.tf-row{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin:10px 0}' +
      '.tf-chips{display:flex;gap:8px;flex-wrap:wrap;flex:1}' +
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
      '.tf-kind b{display:block;font-size:18px;color:#2b57d6}' +
      '.tf-layout{display:flex;align-items:stretch;gap:0;margin-top:14px;min-height:max(420px,calc(100vh - 200px));border:1px solid #e5e9f2;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04)}' +
      '.tf-sidebar{flex:0 0 248px;border-right:1px solid #e8ecf4;background:#f8faff}' +
      '.tf-sidebar-sticky{position:sticky;top:14px;max-height:calc(100vh - 120px);display:flex;flex-direction:column;padding:14px 12px}' +
      '.tf-sidebar-head{font-size:13px;font-weight:700;color:#556;letter-spacing:.12em;margin-bottom:4px}' +
      '.tf-sidebar-sub{font-size:11px;color:#99a;margin-bottom:8px;line-height:1.4}' +
      '.tf-cat-mode{display:flex;gap:6px;margin-bottom:8px}' +
      '.tf-cat-mode .tf-chip{font-size:12px;padding:5px 10px}' +
      '.tf-cat-search{width:100%;margin-bottom:8px;padding:7px 10px;border:1px solid #dbe4ff;border-radius:8px;background:#fff;font-size:13px;color:#234}' +
      '.tf-cat-search:focus{outline:none;border-color:#2b57d6;box-shadow:0 0 0 3px rgba(43,87,214,.14)}' +
      '.tf-cat-toc{overflow-y:auto;flex:1;padding:2px 0}' +
      '.tf-cat-toc::-webkit-scrollbar{width:5px}' +
      '.tf-cat-toc::-webkit-scrollbar-thumb{background:#cfd8ee;border-radius:3px}' +
      '.tf-group{margin-bottom:4px}' +
      '.tf-group-hd{display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:#456;background:transparent;user-select:none}' +
      '.tf-group-hd:hover{background:#eef3ff}' +
      '.tf-group-hd.open .chev{transform:rotate(90deg)}' +
      '.tf-group-hd .chev{flex:none;font-size:10px;color:#889;width:12px;text-align:center;transition:transform .15s}' +
      '.tf-group-hd .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.tf-group-hd .cnt{flex:none;font-size:11px;color:#889;font-variant-numeric:tabular-nums}' +
      '.tf-group-items{display:none;padding:0 0 4px 4px}' +
      '.tf-group-items.open{display:block}' +
      '.tf-cat-item{display:flex;align-items:center;gap:8px;padding:7px 10px 7px 22px;border-radius:8px;cursor:pointer;font-size:12px;color:#345;transition:background .12s}' +
      '.tf-cat-item:hover{background:#eef3ff}' +
      '.tf-cat-item.active{background:#e8f0ff;color:#1a3fad;font-weight:600}' +
      '.tf-cat-item .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.tf-cat-item .cnt{flex:none;font-size:11px;color:#889;font-variant-numeric:tabular-nums}' +
      '.tf-cat-item.active .cnt{color:#5a7fd6}' +
      '.tf-main{flex:1;min-width:0;display:flex;flex-direction:column}' +
      '.tf-main-head{padding:14px 16px 10px;border-bottom:1px solid #eef1f8;flex:none}' +
      '.tf-main-title{font-size:16px;font-weight:700;color:#123;margin:0 0 6px}' +
      '.tf-main-sub{font-size:13px;color:#889;margin:0 0 10px;line-height:1.5}' +
      '.tf-main-body{flex:1;padding:12px 16px 16px;overflow:hidden;display:flex;flex-direction:column;min-height:0}' +
      '.tf-advanced{margin-top:4px;flex:none}' +
      '.tf-advanced-toggle{font-size:13px;color:#2b57d6;background:none;border:none;cursor:pointer;padding:0;margin-bottom:8px}' +
      '.tf-advanced-toggle:hover{text-decoration:underline}' +
      '.tf-advanced-panel{display:none;margin-bottom:12px;padding:12px;background:#f8faff;border:1px solid #e0e8f8;border-radius:10px}' +
      '.tf-advanced-panel.open{display:block}' +
      '.tf-preview{flex:1;display:flex;flex-direction:column;min-height:0;margin-top:12px}' +
      '.tf-preview-title{font-size:13px;font-weight:700;color:#667;margin-bottom:8px;flex:none}' +
      '.tf-preview-list{flex:1;display:flex;flex-direction:column;gap:6px;overflow-y:auto;min-height:0}' +
      '.tf-preview-list::-webkit-scrollbar{width:5px}' +
      '.tf-preview-list::-webkit-scrollbar-thumb{background:#cfd8ee;border-radius:3px}' +
      '.tf-preview-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #e5e9f2;border-radius:8px;font-size:13px;color:#345;background:#fafbfd;line-height:1.45}' +
      '.tf-preview-item .body{flex:1;min-width:0}' +
      '.tf-preview-item .cn{font-weight:600;color:#123}' +
      '.tf-preview-item .meta{font-size:11px;color:#99a;margin-top:3px}' +
      '.tf-preview-start{flex:none;font-size:12px;padding:5px 12px;white-space:nowrap}' +
      '.tf-layout.tf-practicing .tf-sidebar{display:none}' +
      '.tf-layout.tf-practicing .tf-main-head,.tf-layout.tf-practicing .tf-main-body{display:none}' +
      '@media(max-width:760px){.tf-layout{flex-direction:column;min-height:0}.tf-sidebar{flex:none;border-right:none;border-bottom:1px solid #e8ecf4}.tf-sidebar-sticky{position:static;max-height:none}.tf-cat-toc{max-height:36vh}.tf-layout.tf-practicing .tf-sidebar{display:none}}';
    var st = document.createElement('style');
    st.id = 'tf-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  var STEP_KIND_ORDER = ['translate', 'yesno', 'negative', 'wh', 'passive', 'indirect'];

  // ---------- 主流程 ----------
  function onShow(panel) {
    injectStyle();
    panel.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'tf-wrap';
    panel.appendChild(wrap);

    var hist = document.createElement('div');
    hist.className = 'tf-hist';
    hist.innerHTML = '🔀 <b>句型转换</b> —— 左侧目录选册/课次或语法点，右侧确认范围后开始训练。';
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

    // 目录 + 主面板
    var layout = document.createElement('div');
    layout.className = 'tf-layout';
    layout.id = 'tf-layout';
    layout.innerHTML =
      '<aside class="tf-sidebar">' +
      '<div class="tf-sidebar-sticky">' +
      '<div class="tf-sidebar-head">练习目录</div>' +
      '<div class="tf-sidebar-sub">按课次或语法点浏览，点击条目选定范围</div>' +
      '<div class="tf-cat-mode" id="tf-cat-mode"></div>' +
      '<input class="tf-cat-search" id="tf-cat-search" type="text" placeholder="🔍 搜课次 / 语法点…" autocomplete="off" />' +
      '<div class="tf-cat-toc" id="tf-cat-toc"></div>' +
      '</div></aside>' +
      '<div class="tf-main">' +
      '<div class="tf-main-head" id="tf-main-head">' +
      '<div class="tf-main-title" id="tf-main-title">全部练习</div>' +
      '<div class="tf-main-sub" id="tf-main-sub">在左侧选择册数、课次或语法点；未选时练习全部句型。</div>' +
      '<div class="tf-row" style="margin:0">' +
      '<span class="tf-label">题量</span>' +
      '<select class="tf-select" id="tf-limit"><option value="5" selected>5 句</option><option value="10">10 句</option><option value="0">全部</option></select>' +
      '<label style="font-size:14px"><input type="checkbox" id="tf-random" checked /> 随机顺序</label>' +
      '<button class="tf-btn primary" id="tf-start" disabled>开始训练</button>' +
      '</div></div>' +
      '<div class="tf-main-body" id="tf-main-body">' +
      '<div class="tf-advanced">' +
      '<button type="button" class="tf-advanced-toggle" id="tf-advanced-toggle">▸ 更多筛选（步骤类型 · 剑桥单元）</button>' +
      '<div class="tf-advanced-panel" id="tf-advanced-panel">' +
      '<div class="tf-row"><span class="tf-label">步骤类型</span><span class="tf-chips" id="tf-step-kind"></span></div>' +
      '<div class="tf-row" id="tf-cambridge-row" style="display:none"><div id="tf-cambridge" style="width:100%"></div></div>' +
      '</div></div>' +
      '<div class="tf-preview" id="tf-preview"></div>' +
      '</div>' +
      '<div id="tf-stage"></div>' +
      '</div>';
    wrap.appendChild(layout);

    var catToc = layout.querySelector('#tf-cat-toc');
    var catSearch = layout.querySelector('#tf-cat-search');
    var catModeBox = layout.querySelector('#tf-cat-mode');
    var mainTitle = layout.querySelector('#tf-main-title');
    var mainSub = layout.querySelector('#tf-main-sub');
    var stage = layout.querySelector('#tf-stage');
    var previewBox = layout.querySelector('#tf-preview');
    var stepKindBox = layout.querySelector('#tf-step-kind');
    var cambridgeRow = layout.querySelector('#tf-cambridge-row');
    var cambridgeBox = layout.querySelector('#tf-cambridge');
    var advancedPanel = layout.querySelector('#tf-advanced-panel');
    var startBtn = layout.querySelector('#tf-start');

    var curBook = '';
    var curGrammar = '';
    var curStepKind = '';
    var curCambridgeUnit = '';
    var curLessonMin = '';
    var curLessonMax = '';
    var catalogMode = 'lesson';
    var catQ = '';
    var expandedBooks = {};
    var showAdvanced = false;
    var metaCache = null;
    var previewTimer = null;
    var previewListCache = [];

    function selectionLabel() {
      var parts = [];
      if (curBook) parts.push('第' + curBook + '册');
      if (curLessonMin) {
        parts.push(curLessonMin === curLessonMax ? 'Lesson ' + curLessonMin : 'L' + curLessonMin + '–' + curLessonMax);
      }
      if (curGrammar) parts.push(curGrammar);
      if (curCambridgeUnit) parts.push('剑桥 U' + curCambridgeUnit);
      if (curStepKind) parts.push(KIND_LABEL[curStepKind] || curStepKind);
      return parts.length ? parts.join(' · ') : '全部练习';
    }

    function updateMainHead() {
      mainTitle.textContent = selectionLabel();
      var hints = [];
      if (!curBook && !curGrammar && !curLessonMin) hints.push('未限定范围，将随机抽取全库句型');
      else if (curLessonMin) hints.push('已限定课次，优先练本课句型');
      if (curGrammar) hints.push('语法点：' + curGrammar);
      mainSub.textContent = hints.length ? hints.join('；') + '。' : '在左侧选择册数、课次或语法点。';
    }

    function buildQs(lessonMin, lessonMax) {
      var limit = layout.querySelector('#tf-limit').value;
      var random = layout.querySelector('#tf-random').checked;
      var qs = '?limit=' + limit + (random ? '&random=1' : '') + (curBook ? '&book=' + curBook : '');
      if (curGrammar) qs += '&grammar=' + encodeURIComponent(curGrammar);
      if (curStepKind) qs += '&stepKind=' + encodeURIComponent(curStepKind);
      if (curCambridgeUnit) qs += '&cambridgeUnit=' + encodeURIComponent(curCambridgeUnit);
      if (lessonMin) qs += '&lessonMin=' + encodeURIComponent(lessonMin);
      if (lessonMax) qs += '&lessonMax=' + encodeURIComponent(lessonMax);
      return qs;
    }

    function schedulePreview() {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(refreshPreview, 200);
    }

    function applyStepKindFilter(list) {
      if (!curStepKind) return list;
      return list.map(function (ex) {
        return {
          id: ex.id,
          book: ex.book,
          lesson: ex.lesson,
          grammar: ex.grammar,
          cambridge: ex.cambridge,
          cn: ex.cn,
          steps: ex.steps.filter(function (s) { return s.kind === curStepKind; }),
        };
      }).filter(function (ex) { return ex.steps.length; });
    }

    function startTraining(list) {
      list = applyStepKindFilter(list);
      if (!list.length) {
        NCE.toast('没有符合条件的练习', 'warn');
        return;
      }
      layout.classList.add('tf-practicing');
      runSession(stage, list, function () {
        layout.classList.remove('tf-practicing');
        stage.innerHTML = '';
        schedulePreview();
      });
    }

    function refreshPreview() {
      if (!metaCache) return;
      NCE.api('/api/transform/exercises' + buildQs(curLessonMin, curLessonMax) + '&limit=50')
        .then(function (d) {
          var list = (d && d.exercises) || [];
          if (curStepKind) {
            list = list.filter(function (ex) {
              return ex.steps.some(function (s) { return s.kind === curStepKind; });
            });
          }
          previewListCache = list;
          if (!list.length) {
            previewBox.innerHTML = '<div class="tf-hint">当前筛选暂无匹配句型</div>';
            return;
          }
          var total = d.count || list.length;
          var html = '<div class="tf-preview-title">预览 · 共 ' + total + ' 句' +
            (total > list.length ? '（显示前 ' + list.length + ' 句）' : '') + '</div><div class="tf-preview-list">';
          list.forEach(function (ex) {
            html += '<div class="tf-preview-item">' +
              '<div class="body"><div class="cn">' + NCE.escapeHtml(ex.cn) + '</div>' +
              '<div class="meta">第' + ex.book + '册 · L' + ex.lesson +
              (ex.grammar && ex.grammar.length ? ' · ' + NCE.escapeHtml(ex.grammar.join(' · ')) : '') +
              '</div></div>' +
              '<button type="button" class="tf-btn primary tf-preview-start" data-id="' + NCE.escapeAttr(ex.id) + '">开始训练</button>' +
              '</div>';
          });
          html += '</div>';
          previewBox.innerHTML = html;
          previewBox.querySelectorAll('.tf-preview-start').forEach(function (btn) {
            btn.onclick = function () {
              var ex = previewListCache.find(function (x) { return x.id === btn.dataset.id; });
              if (ex) startTraining([ex]);
            };
          });
        })
        .catch(function () { previewBox.innerHTML = ''; });
    }

    function clearLessonFilter() {
      curLessonMin = '';
      curLessonMax = '';
    }

    function selectAll() {
      curBook = '';
      curGrammar = '';
      clearLessonFilter();
      curCambridgeUnit = '';
      renderCatalog();
      updateMainHead();
      schedulePreview();
    }

    function selectBook(b) {
      curBook = b;
      clearLessonFilter();
      curCambridgeUnit = '';
      if (b) expandedBooks[b] = true;
      renderCatalog();
      renderCambridgeChips();
      updateMainHead();
      schedulePreview();
    }

    function selectLesson(book, lesson) {
      curBook = String(book);
      curLessonMin = String(lesson);
      curLessonMax = String(lesson);
      curGrammar = '';
      curCambridgeUnit = '';
      expandedBooks[curBook] = true;
      renderCatalog();
      renderCambridgeChips();
      updateMainHead();
      schedulePreview();
    }

    function selectGrammar(tag, book) {
      curGrammar = tag || '';
      if (book != null && book !== '') curBook = String(book);
      clearLessonFilter();
      renderCatalog();
      updateMainHead();
      schedulePreview();
    }

    function renderCatMode() {
      catModeBox.innerHTML = '';
      [['lesson', '按课次'], ['grammar', '按语法']].forEach(function (pair) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tf-chip' + (catalogMode === pair[0] ? ' active' : '');
        btn.textContent = pair[1];
        btn.onclick = function () {
          catalogMode = pair[0];
          renderCatMode();
          renderCatalog();
        };
        catModeBox.appendChild(btn);
      });
    }

    function matchesSearch(text) {
      if (!catQ) return true;
      return String(text || '').toLowerCase().indexOf(catQ) >= 0;
    }

    function renderCatalog() {
      if (!metaCache) return;
      var html = '';
      var m = metaCache;
      var byBook = m.byBook || {};
      var books = Object.keys(byBook).sort(function (a, b) { return Number(a) - Number(b); });

      if (catalogMode === 'lesson') {
        html += '<div class="tf-cat-item' + (!curBook && !curLessonMin && !curGrammar ? ' active' : '') +
          '" data-action="all"><span class="lbl">全部</span><span class="cnt">' + (m.total || 0) + '</span></div>';
        books.forEach(function (b) {
          var cat = (m.catalogByBook && m.catalogByBook[b]) || { lessons: [], total: byBook[b] };
          var open = !!expandedBooks[b];
          html += '<div class="tf-group"><div class="tf-group-hd' + (open ? ' open' : '') + '" data-book="' + b + '">' +
            '<span class="chev">▶</span><span class="lbl">第' + b + '册</span><span class="cnt">' + (cat.total || byBook[b]) + '</span></div>' +
            '<div class="tf-group-items' + (open ? ' open' : '') + '">';
          (cat.lessons || []).forEach(function (le) {
            var label = 'L' + le.lesson + (le.title ? ' ' + le.title : '');
            if (!matchesSearch(label) && !matchesSearch('第' + b + '册')) return;
            var active = curBook === b && String(curLessonMin) === String(le.lesson);
            html += '<div class="tf-cat-item' + (active ? ' active' : '') + '" data-book="' + b + '" data-lesson="' + le.lesson + '">' +
              '<span class="lbl">' + NCE.escapeHtml(label) + '</span><span class="cnt">' + le.count + '</span></div>';
          });
          html += '</div></div>';
        });
      } else {
        html += '<div class="tf-cat-item' + (!curGrammar ? ' active' : '') +
          '" data-action="grammar-all"><span class="lbl">全部语法</span><span class="cnt">' + (m.total || 0) + '</span></div>';
        books.forEach(function (b) {
          var cat = (m.catalogByBook && m.catalogByBook[b]) || { grammar: [], total: byBook[b] };
          var gItems = (cat.grammar || []).filter(function (g) { return matchesSearch(g.tag); });
          if (!gItems.length && catQ) return;
          var open = expandedBooks[b] !== false;
          html += '<div class="tf-group"><div class="tf-group-hd' + (open ? ' open' : '') + '" data-book="' + b + '">' +
            '<span class="chev">▶</span><span class="lbl">第' + b + '册</span><span class="cnt">' + gItems.length + '</span></div>' +
            '<div class="tf-group-items' + (open ? ' open' : '') + '">';
          gItems.forEach(function (g) {
            var active = curGrammar === g.tag && curBook === b;
            html += '<div class="tf-cat-item' + (active ? ' active' : '') + '" data-grammar="' + NCE.escapeAttr(g.tag) + '" data-book="' + b + '">' +
              '<span class="lbl">' + NCE.escapeHtml(g.tag) + '</span><span class="cnt">' + g.count + '</span></div>';
          });
          html += '</div></div>';
        });
      }

      catToc.innerHTML = html || '<div class="tf-hint" style="padding:8px">无匹配目录项</div>';
      catToc.querySelectorAll('[data-action="all"]').forEach(function (el) { el.onclick = selectAll; });
      catToc.querySelectorAll('[data-action="grammar-all"]').forEach(function (el) {
        el.onclick = function () { selectGrammar(''); };
      });
      catToc.querySelectorAll('.tf-group-hd').forEach(function (hd) {
        hd.onclick = function () {
          var b = hd.dataset.book;
          if (catalogMode === 'grammar') {
            expandedBooks[b] = !expandedBooks[b];
            renderCatalog();
            return;
          }
          if (expandedBooks[b] && curBook === b && !curLessonMin) {
            expandedBooks[b] = false;
            renderCatalog();
            return;
          }
          selectBook(b);
        };
      });
      catToc.querySelectorAll('.tf-cat-item[data-lesson]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          selectLesson(el.dataset.book, el.dataset.lesson);
        };
      });
      catToc.querySelectorAll('.tf-cat-item[data-grammar]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          selectGrammar(el.dataset.grammar, el.dataset.book);
        };
      });
    }

    function renderStepKindChips() {
      stepKindBox.innerHTML = '';
      var all = document.createElement('button');
      all.type = 'button';
      all.className = 'tf-chip' + (curStepKind === '' ? ' active' : '');
      all.textContent = '全部步骤';
      all.dataset.kind = '';
      stepKindBox.appendChild(all);
      STEP_KIND_ORDER.forEach(function (kind) {
        var cnt = (metaCache && metaCache.stepKindCounts && metaCache.stepKindCounts[kind]) || 0;
        if (!cnt) return;
        var c = document.createElement('button');
        c.type = 'button';
        c.className = 'tf-chip' + (curStepKind === kind ? ' active' : '');
        c.textContent = (KIND_LABEL[kind] || kind) + ' ·' + cnt;
        c.dataset.kind = kind;
        stepKindBox.appendChild(c);
      });
      stepKindBox.querySelectorAll('.tf-chip').forEach(function (c) {
        c.onclick = function () {
          stepKindBox.querySelectorAll('.tf-chip').forEach(function (x) {
            x.classList.toggle('active', x === c);
          });
          curStepKind = c.dataset.kind;
          updateMainHead();
          schedulePreview();
        };
      });
    }

    function renderCambridgeChips() {
      if (!curBook) {
        cambridgeRow.style.display = 'none';
        return;
      }
      var info = (metaCache && metaCache.cambridgeByBook && metaCache.cambridgeByBook[curBook]) || null;
      if (!info || !info.sections || !info.sections.length) {
        cambridgeBox.innerHTML = '<span class="tf-hint">暂无剑桥单元对照</span>';
        cambridgeRow.style.display = showAdvanced ? '' : 'none';
        return;
      }
      var covMap = {};
      (info.coverage || []).forEach(function (c) { covMap[c.unit] = c.count; });
      var html = '<div class="tf-hint" style="margin-bottom:6px">📘 ' + NCE.escapeHtml(info.levelTitle || '') +
        (info.levelSubtitle ? '（' + NCE.escapeHtml(info.levelSubtitle) + '）' : '') + '</div>';
      html += '<span class="tf-chips"><button type="button" class="tf-chip' + (curCambridgeUnit === '' ? ' active' : '') +
        '" data-unit="">全部单元</button></span>';
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
      cambridgeBox.innerHTML = html;
      cambridgeRow.style.display = showAdvanced ? '' : 'none';
      cambridgeBox.querySelectorAll('.tf-chip').forEach(function (c) {
        c.onclick = function () {
          if (c.disabled) return;
          cambridgeBox.querySelectorAll('.tf-chip').forEach(function (x) {
            x.classList.toggle('active', x === c);
          });
          curCambridgeUnit = c.dataset.unit;
          updateMainHead();
          schedulePreview();
        };
      });
    }

    layout.querySelector('#tf-advanced-toggle').onclick = function () {
      showAdvanced = !showAdvanced;
      advancedPanel.classList.toggle('open', showAdvanced);
      layout.querySelector('#tf-advanced-toggle').textContent =
        (showAdvanced ? '▾ ' : '▸ ') + '更多筛选（步骤类型 · 剑桥单元）';
      renderCambridgeChips();
    };

    catSearch.oninput = function () {
      catQ = catSearch.value.trim().toLowerCase();
      renderCatalog();
    };

    renderCatMode();

    Promise.all([
      NCE.api('/api/transform/meta'),
      NCE.api('/api/meta').catch(function () { return {}; }),
    ])
      .then(function (res) {
        metaCache = res[0];
        if (!metaCache || !metaCache.total) {
          catToc.innerHTML = '<span class="tf-hint">暂无练习内容</span>';
          return;
        }
        Object.keys(metaCache.byBook || {}).forEach(function (b) {
          if (expandedBooks[b] == null) expandedBooks[b] = Number(b) === 1;
        });
        renderCatalog();
        renderStepKindChips();
        renderCambridgeChips();
        updateMainHead();
        schedulePreview();

        var pending = NCE.pendingTransform;
        if (pending) {
          if (pending.book != null && pending.book !== '') curBook = String(pending.book);
          if (pending.grammar) curGrammar = pending.grammar;
          if (pending.stepKind) curStepKind = pending.stepKind;
          if (pending.cambridgeUnit != null && pending.cambridgeUnit !== '') {
            curCambridgeUnit = String(pending.cambridgeUnit);
            showAdvanced = true;
            advancedPanel.classList.add('open');
            layout.querySelector('#tf-advanced-toggle').textContent = '▾ 更多筛选（步骤类型 · 剑桥单元）';
          }
          if (pending.showCambridge) showAdvanced = true;
          if (pending.lessonMin != null && pending.lessonMin !== '') {
            curLessonMin = String(pending.lessonMin);
            curLessonMax = pending.lessonMax != null && pending.lessonMax !== ''
              ? String(pending.lessonMax) : curLessonMin;
          }
          if (pending.limit != null) {
            var limEl = layout.querySelector('#tf-limit');
            if (limEl) limEl.value = String(pending.limit);
          }
          var autoStart = pending.autoStart;
          NCE.pendingTransform = null;
          if (curBook) expandedBooks[curBook] = true;
          renderCatalog();
          renderStepKindChips();
          renderCambridgeChips();
          updateMainHead();
          schedulePreview();
          startBtn.disabled = false;
          if (autoStart) startBtn.click();
          return;
        }
        startBtn.disabled = false;
      })
      .catch(function (e) {
        console.error('[transform] 加载元数据失败', e);
        catToc.innerHTML = '<span class="tf-hint">加载失败</span>';
      });

    startBtn.onclick = function () {
      startBtn.disabled = true;
      NCE.api('/api/transform/exercises' + buildQs(curLessonMin, curLessonMax))
        .then(function (d) {
          var list = (d && d.exercises) || [];
          if (!list.length && curLessonMin) {
            return NCE.api('/api/transform/exercises' + buildQs('', '')).then(function (d2) {
              if (d2 && d2.exercises && d2.exercises.length) {
                NCE.toast('本课暂无匹配句型，已改为同语法/单元练习', 'warn');
              }
              return d2;
            });
          }
          return d;
        })
        .then(function (d) { startTraining((d && d.exercises) || []); })
        .catch(function (e) {
          console.error('[transform] 拉取练习失败', e);
          NCE.toast('加载练习失败，请稍后重试', 'error');
        })
        .then(function () { startBtn.disabled = false; });
    };

  }

  // ---------- 单次训练会话 ----------
  function runSession(stage, exercises, onDone) {
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
        (NCE.speakBtnHtml ? NCE.speakBtnHtml(step.prompt) : '') +
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
          (NCE.speakBtnHtml ? NCE.speakBtnHtml(c.canonical) : '') +
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
      if (NCE.bindSpeakClicks) NCE.bindSpeakClicks(card);
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
        if (onDone) onDone();
        else NCE.gotoTab('transform');
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
