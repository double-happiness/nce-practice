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
      '.dlg-wrap{max-width:960px;margin:0 auto}' +
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
      '.dlg-cn{margin-top:4px;padding-top:4px;border-top:1px dashed #dbe2ef;color:#67718a;font-size:14px}' +
      '.dlg-hint{color:#889;font-size:13px;margin:6px 0}' +
      '.dlg-summary{text-align:center;padding:20px}' +
      '.dlg-summary .big{font-size:40px;font-weight:700;color:#2b57d6}' +
      '.dlg-summary .sub{color:#667;margin-top:6px}' +
      '.dlg-chain{margin-top:16px;border:1px solid #c5d5f5;border-radius:12px;overflow:hidden;background:#f8faff}' +
      '.dlg-chain-hd{padding:12px 14px;background:linear-gradient(135deg,#eef3ff,#f6f8fc);border-bottom:1px solid #dbe4ff}' +
      '.dlg-chain-hd .t{font-size:15px;font-weight:700;color:#1a3fad}' +
      '.dlg-chain-hd .s{font-size:13px;color:#667;margin-top:4px}' +
      '.dlg-chain-parts{padding:8px}' +
      '.dlg-chain-part{border:1px solid #e5e9f2;border-radius:8px;padding:10px 12px;margin:6px;cursor:pointer;background:#fff}' +
      '.dlg-chain-part:hover{background:#f6f8fc;border-color:#cfd6e6}' +
      '.dlg-chain-part .p{font-size:12px;color:#2b57d6;font-weight:600}' +
      '.dlg-chain-part .t{font-size:15px;font-weight:600;color:#123;margin-top:2px}' +
      '.dlg-chain-part .s{font-size:13px;color:#889;margin-top:4px}' +
      '.dlg-chain-badge{display:inline-block;font-size:12px;background:#2b57d6;color:#fff;padding:2px 8px;border-radius:999px;margin-left:8px;vertical-align:middle}' +
      '.dlg-btn.rec{background:#d12f2f;border-color:#d12f2f;color:#fff;animation:dlgRecPulse 1.2s ease-in-out infinite}' +
      '.dlg-btn.rec:hover{background:#b82626}' +
      '.dlg-btn.offline{opacity:.55;cursor:not-allowed}' +
      '@keyframes dlgRecPulse{0%,100%{opacity:1}50%{opacity:.6}}' +
      '.dlg-shadow-fb{font-size:14px;margin-top:8px;min-height:1em}' +
      '.dlg-shadow-fb .ok{color:#178a3a;font-weight:600}' +
      '.dlg-shadow-fb .bad{color:#d12f2f}' +
      /* 左场景目录 + 右对话列表 */
      '.dlg-layout{display:flex;align-items:stretch;gap:0;margin-top:14px;min-height:420px;border:1px solid #e5e9f2;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04)}' +
      '.dlg-sidebar{flex:0 0 240px;border-right:1px solid #e8ecf4;background:#f8faff}' +
      '.dlg-sidebar-sticky{position:sticky;top:14px;max-height:calc(100vh - 120px);display:flex;flex-direction:column;padding:14px 12px}' +
      '.dlg-sidebar-head{font-size:13px;font-weight:700;color:#556;letter-spacing:.12em;margin-bottom:4px}' +
      '.dlg-sidebar-sub{font-size:11px;color:#99a;margin-bottom:8px;line-height:1.4}' +
      '.dlg-cat-search{width:100%;margin-bottom:8px;padding:7px 10px;border:1px solid #dbe4ff;border-radius:8px;background:#fff;font-size:13px;color:#234}' +
      '.dlg-cat-search:focus{outline:none;border-color:#2b57d6;box-shadow:0 0 0 3px rgba(43,87,214,.14)}' +
      '.dlg-cat-toc{overflow-y:auto;flex:1;padding:2px 0}' +
      '.dlg-cat-toc::-webkit-scrollbar{width:5px}' +
      '.dlg-cat-toc::-webkit-scrollbar-thumb{background:#cfd8ee;border-radius:3px}' +
      '.dlg-cat-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:13px;color:#345;transition:background .12s}' +
      '.dlg-cat-item:hover{background:#eef3ff}' +
      '.dlg-cat-item.active{background:#e8f0ff;color:#1a3fad;font-weight:600}' +
      '.dlg-cat-item.active::before{content:"";flex:none;width:3px;height:14px;background:#2b57d6;border-radius:2px;margin-right:-2px}' +
      '.dlg-cat-item .ico{flex:none;font-size:15px}' +
      '.dlg-cat-item .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.dlg-cat-item .cnt{flex:none;font-size:11px;color:#889;font-variant-numeric:tabular-nums}' +
      '.dlg-cat-item.active .cnt{color:#5a7fd6}' +
      '.dlg-group{margin-bottom:4px}' +
      '.dlg-group-hd{display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:#456;background:transparent;user-select:none}' +
      '.dlg-group-hd:hover{background:#eef3ff}' +
      '.dlg-group-hd .chev{flex:none;font-size:10px;color:#889;width:12px;text-align:center;transition:transform .15s}' +
      '.dlg-group-hd.open .chev{transform:rotate(90deg)}' +
      '.dlg-group-hd .ico{flex:none;font-size:14px}' +
      '.dlg-group-hd .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.dlg-group-hd .cnt{flex:none;font-size:11px;color:#889;font-variant-numeric:tabular-nums}' +
      '.dlg-group-items{display:none;padding:0 0 4px 4px}' +
      '.dlg-group-items.open{display:block}' +
      '.dlg-cat-item.nested{padding-left:22px;font-size:12px}' +
      '.dlg-main{flex:1;min-width:0;display:flex;flex-direction:column}' +
      '.dlg-main-head{padding:14px 16px 10px;border-bottom:1px solid #eef1f8;flex:none}' +
      '.dlg-main-head.hidden{display:none}' +
      '.dlg-main-title{font-size:16px;font-weight:700;color:#123;margin:0 0 8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.dlg-main-title .sub{font-size:13px;font-weight:400;color:#889}' +
      '.dlg-list-search{width:100%;padding:8px 11px;border:1px solid #e5e9f2;border-radius:8px;font-size:14px;color:#234;background:#fafbfd}' +
      '.dlg-list-search:focus{outline:none;border-color:#2b57d6;box-shadow:0 0 0 3px rgba(43,87,214,.14)}' +
      '.dlg-stage{flex:1;padding:12px 16px 16px;overflow-y:auto}' +
      '.dlg-pager{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid #eef1f8}' +
      '.dlg-pager button{padding:6px 14px;border:1px solid #cfd6e6;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#345}' +
      '.dlg-pager button:disabled{opacity:.4;cursor:not-allowed}' +
      '.dlg-pager .pg{font-size:13px;color:#889}' +
      '.dlg-item.done{border-color:#c8e6d0}' +
      '.dlg-item .prog{font-size:12px;font-weight:600;margin-left:auto;white-space:nowrap}' +
      '.dlg-item .prog.good{color:#178a3a}' +
      '.dlg-item .prog.mid{color:#b07f2a}' +
      '.dlg-item .prog.low{color:#d12f2f}' +
      '.dlg-item .t-row{display:flex;align-items:flex-start;gap:8px}' +
      '.dlg-item .t-row .t{flex:1;min-width:0}' +
      '.dlg-item.done .t::after{content:" ✓";color:#178a3a;font-size:13px;font-weight:600}' +
      '.dlg-item.active,.dlg-chain-part.active{background:#eef3ff;border-color:#2b57d6;box-shadow:0 0 0 2px rgba(43,87,214,.12)}' +
      '.dlg-layout.dlg-practicing .dlg-sidebar{display:none}' +
      '.dlg-layout.dlg-practicing .dlg-main-head{display:none}' +
      '@media(max-width:760px){.dlg-layout{flex-direction:column;min-height:0}.dlg-sidebar{flex:none;border-right:none;border-bottom:1px solid #e8ecf4}.dlg-sidebar-sticky{position:static;max-height:none}.dlg-cat-toc{max-height:36vh}.dlg-layout.dlg-practicing .dlg-sidebar{display:none}}';
    var st = document.createElement('style');
    st.id = 'dlg-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function offlineDlg() {
    return window.NCEDialogueOffline || null;
  }

  function dlgApi(apiFn, offlineFn) {
    var off = offlineDlg();
    if (!navigator.onLine && off) return offlineFn(off);
    return apiFn().catch(function () {
      if (!off) throw new Error('offline');
      return offlineFn(off);
    });
  }

  var offlineMode = false;

  function markOfflineMeta(m) {
    offlineMode = !!(m && m.offline);
    return m;
  }

  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var activeRec = null; // 当前识别实例；切轮 / 切页时必须 abort，避免泄漏
  var ttsWaitTimer = null; // 跟读前等 TTS 播完的轮询定时器

  function stopVoice() {
    if (ttsWaitTimer) {
      clearInterval(ttsWaitTimer);
      ttsWaitTimer = null;
    }
    if (activeRec) {
      var rec = activeRec;
      activeRec = null; // 先置空，onend 里据此区分“主动停止”
      try {
        rec.abort();
      } catch (e) {
        /* 已停止的实例 abort 会抛，忽略 */
      }
    }
  }

  function recErrorMsg(code) {
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      return '麦克风权限被拒绝，请在浏览器地址栏允许使用麦克风后重试';
    }
    if (code === 'no-speech') return '没听到声音，请靠近麦克风大声说一次';
    if (code === 'audio-capture') return '未检测到麦克风设备，请检查连接';
    if (code === 'network') return '语音识别需联网（Chrome 在线服务），离线请改用键盘输入';
    return '语音识别出错（' + code + '），请重试';
  }

  function speechRecUsable() {
    return SpeechRec && navigator.onLine;
  }

  function warnOfflineRec() {
    NCE.toast(recErrorMsg('network'), 'warn');
  }

  function markRecOffline(btn, offline) {
    if (!btn) return;
    btn.title = offline ? '语音识别需联网，离线请用键盘输入' : '';
    btn.classList.toggle('offline', offline);
  }

  // 开始一次识别。opts: { onStart(), onResult(text), onEnd() }
  // 已在识别中会先 abort 旧的再开新的，保证重复点击可停可重开
  function startVoice(opts) {
    if (!navigator.onLine) {
      warnOfflineRec();
      if (opts && opts.onEnd) opts.onEnd();
      return;
    }
    stopVoice();
    var rec = new SpeechRec();
    rec.lang = 'en-US'; // en-GB 识别支持差，统一 en-US
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = function (ev) {
      var text = '';
      try {
        text = ev.results[0][0].transcript || '';
      } catch (e) {}
      text = text.trim();
      if (text && opts.onResult) opts.onResult(text);
    };
    rec.onerror = function (ev) {
      if (ev.error === 'aborted') return; // 主动停止，不打扰
      NCE.toast(recErrorMsg(ev.error), 'warn');
    };
    rec.onend = function () {
      if (activeRec === rec) activeRec = null;
      if (opts.onEnd) opts.onEnd();
    };
    activeRec = rec;
    try {
      rec.start();
      if (opts.onStart) opts.onStart();
    } catch (e) {
      activeRec = null;
      NCE.toast('语音识别启动失败，请重试', 'error');
      if (opts.onEnd) opts.onEnd();
    }
  }

  // 等 speechSynthesis 播完再回调（NCE.speak 无回调，轮询兜底，最多等 15 秒）
  function afterTTS(cb) {
    if (ttsWaitTimer) clearInterval(ttsWaitTimer);
    var waited = 0;
    ttsWaitTimer = setInterval(function () {
      waited += 200;
      var speaking =
        window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending);
      // 前 600ms 不判定：speak 是异步起播，刚调用时 speaking 可能还是 false
      if (waited < 600) return;
      if (!speaking || waited >= 15000) {
        clearInterval(ttsWaitTimer);
        ttsWaitTimer = null;
        cb();
      }
    }, 200);
  }

  // 宽松相似度：转小写去标点后按词算编辑距离，用于跟读即时反馈（不计分）
  function speechSimilarity(said, target) {
    function words(s) {
      return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9' ]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    }
    var wa = words(said);
    var wb = words(target);
    if (!wa.length || !wb.length) return 0;
    var prev = [];
    var cur = [];
    var i, j;
    for (j = 0; j <= wb.length; j++) prev[j] = j;
    for (i = 1; i <= wa.length; i++) {
      cur[0] = i;
      for (j = 1; j <= wb.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (wa[i - 1] === wb[j - 1] ? 0 : 1)
        );
      }
      var tmp = prev;
      prev = cur;
      cur = tmp;
    }
    return 1 - prev[wb.length] / Math.max(wa.length, wb.length);
  }

  var metaCache = null;
  var BK_KEY = 'nce-last-dialogue';
  var PER_PAGE = 25;
  var dlgUi = null;

  // 与 lib/dialogue-meta.js 保持同步；API 响应或 SW 旧缓存缺 groups 时前端兜底
  var DLG_GROUPS = {
    home_life: { label: '居家社交', icon: '🏡', order: 1 },
    food_shop: { label: '餐饮购物', icon: '🛒', order: 2 },
    travel: { label: '出行旅游', icon: '✈️', order: 3 },
    work_study: { label: '职场学习', icon: '💼', order: 4 },
    housing: { label: '住房物业', icon: '🏘️', order: 5 },
    health: { label: '健康运动', icon: '🏥', order: 6 },
    life_svc: { label: '生活服务', icon: '🔧', order: 7 },
    leisure: { label: '休闲文娱', icon: '🎬', order: 8 },
  };
  var DLG_CAT_GROUP = {
    home: 'home_life', phone: 'home_life', daily: 'home_life', neighbor: 'home_life',
    parenting: 'home_life', social: 'home_life', community: 'home_life', holiday: 'home_life',
    wedding: 'home_life', voting: 'home_life',
    restaurant: 'food_shop', cafe: 'food_shop', grocery: 'food_shop', market: 'food_shop',
    shopping: 'food_shop', warehouse: 'food_shop', convenience: 'food_shop', bakery: 'food_shop',
    fleamarket: 'food_shop', secondhand: 'food_shop', delivery: 'food_shop', online: 'food_shop',
    airport: 'travel', travel: 'travel', transit: 'travel', directions: 'travel',
    driving: 'travel', customs: 'travel', carwash: 'travel', camping: 'travel',
    office: 'work_study', interview: 'work_study', itwork: 'work_study', remote: 'work_study',
    school: 'work_study', library: 'work_study', campus: 'work_study',
    housing: 'housing', property: 'housing', moving: 'housing', inspection: 'housing',
    storage: 'housing', clubhouse: 'housing', plumbing: 'housing', locksmith: 'housing', hardware: 'housing',
    hospital: 'health', pharmacy: 'health', gym: 'health', sports: 'health', emergency: 'health',
    bank: 'life_svc', insurance: 'life_svc', postoffice: 'life_svc', services: 'life_svc',
    salon: 'life_svc', tech: 'life_svc', auto: 'life_svc', pet: 'life_svc', complaint: 'life_svc',
    cleaning: 'life_svc', laundry: 'life_svc', garden: 'life_svc', farm: 'life_svc', recycle: 'life_svc',
    entertainment: 'leisure', nightlife: 'leisure', amusement: 'leisure', museum: 'leisure',
    park: 'leisure', fishing: 'leisure', golf: 'leisure',
  };

  function rebuildGroupsFromMeta(m) {
    var byCat = (m && m.byCategory) || {};
    var cats = (m && m.categories) || {};
    var buckets = {};
    Object.keys(DLG_GROUPS).forEach(function (gid) {
      var g = DLG_GROUPS[gid];
      buckets[gid] = { id: gid, label: g.label, icon: g.icon, order: g.order, count: 0, categories: [] };
    });
    Object.keys(byCat).forEach(function (catKey) {
      var n = byCat[catKey];
      if (!n) return;
      var gid = DLG_CAT_GROUP[catKey] || 'life_svc';
      if (!buckets[gid]) {
        buckets[gid] = { id: gid, label: gid, icon: '📁', order: 99, count: 0, categories: [] };
      }
      buckets[gid].categories.push({ id: catKey, count: n });
      buckets[gid].count += n;
    });
    return Object.keys(buckets)
      .filter(function (gid) { return buckets[gid].count > 0; })
      .map(function (gid) { return buckets[gid]; })
      .sort(function (a, b) { return (a.order || 99) - (b.order || 99); })
      .map(function (g) {
        g.categories.sort(function (a, b) {
          var diff = b.count - a.count;
          if (diff) return diff;
          var la = (cats[a.id] && cats[a.id].label) || a.id;
          var lb = (cats[b.id] && cats[b.id].label) || b.id;
          return la.localeCompare(lb, 'zh');
        });
        return g;
      });
  }

  function metaWithGroups(m) {
    if (!m) return m;
    if (!m.groups || !m.groups.length) m.groups = rebuildGroupsFromMeta(m);
    return m;
  }

  function groupsForMeta(m) {
    m = metaWithGroups(m || metaCache);
    return (m && m.groups) || [];
  }

  function dlgBookmark() {
    if (typeof NCEStore !== 'undefined') return NCEStore.get(BK_KEY) || null;
    try {
      return JSON.parse(localStorage.getItem(BK_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function saveDlgBookmark(patch) {
    var prev = dlgBookmark() || {};
    var next = Object.assign({}, prev, patch);
    if (typeof NCEStore !== 'undefined') NCEStore.set(BK_KEY, next);
    else {
      try {
        localStorage.setItem(BK_KEY, JSON.stringify(next));
      } catch (e) { /* ignore */ }
    }
  }

  function accClass(n) {
    if (n >= 80) return 'good';
    if (n >= 60) return 'mid';
    return 'low';
  }

  function onShow(panel) {
    injectStyle();
    stopVoice();
    if (!panel._dlgVoiceWatcher && window.MutationObserver) {
      panel._dlgVoiceWatcher = new MutationObserver(function () {
        if (panel.classList.contains('hidden')) stopVoice();
      });
      panel._dlgVoiceWatcher.observe(panel, { attributes: true, attributeFilter: ['class'] });
    }
    panel.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'dlg-wrap';
    panel.appendChild(wrap);

    var hist = document.createElement('div');
    hist.className = 'dlg-hist';
    hist.innerHTML = '💬 <b>情景对话</b> —— 左侧先选大类，再选具体场景，右侧挑选对话练习。';
    wrap.appendChild(hist);

    var layout = document.createElement('div');
    layout.className = 'dlg-layout';
    layout.id = 'dlg-layout';
    layout.innerHTML =
      '<aside class="dlg-sidebar">' +
      '<div class="dlg-sidebar-sticky">' +
      '<div class="dlg-sidebar-head">场景目录</div>' +
      '<div class="dlg-sidebar-sub">二级：大类 → 场景</div>' +
      '<input class="dlg-cat-search" id="dlg-cat-search" type="text" placeholder="🔍 搜大类 / 场景…" autocomplete="off" />' +
      '<div class="dlg-cat-toc" id="dlg-cat-toc"></div>' +
      '</div></aside>' +
      '<div class="dlg-main">' +
      '<div class="dlg-main-head" id="dlg-main-head">' +
      '<h3 class="dlg-main-title" id="dlg-cat-title"></h3>' +
      '<input class="dlg-list-search" id="dlg-list-search" type="text" placeholder="🔍 搜标题 / 情景描述…" autocomplete="off" />' +
      '</div>' +
      '<div class="dlg-stage" id="dlg-stage"></div>' +
      '</div>';
    wrap.appendChild(layout);

    dlgUi = {
      layout: layout,
      stage: layout.querySelector('#dlg-stage'),
      catToc: layout.querySelector('#dlg-cat-toc'),
      catSearch: layout.querySelector('#dlg-cat-search'),
      listSearch: layout.querySelector('#dlg-list-search'),
      mainHead: layout.querySelector('#dlg-main-head'),
      catTitle: layout.querySelector('#dlg-cat-title'),
      category: '',
      listQ: '',
      catQ: '',
      page: 0,
      completedMap: {},
      highlightId: null,
      practicing: false,
      expandedGroups: {},
    };

    function loadMeta() {
      return dlgApi(
        function () { return NCE.api('/api/dialogue/meta'); },
        function (off) { return off.getMeta(); },
      ).then(function (m) {
        metaCache = metaWithGroups(markOfflineMeta(m));
        return metaCache;
      });
    }

    function loadStats() {
      return dlgApi(
        function () { return NCE.api('/api/dialogue/stats'); },
        function (off) { return off.getStats(); },
      )
        .then(function (s) {
          if (s && s.offline) offlineMode = true;
          if (s && s.total) {
            hist.innerHTML =
              '💬 <b>情景对话</b> —— 左侧先选大类，再选具体场景，右侧挑选对话练习。' +
              (offlineMode ? ' <span style="color:#b45309">（离线模式 · 练习记录暂不同步）</span>' : '') +
              ' 累计 <b>' + s.total + '</b> 句 · 正确率 <b>' + s.accuracy + '%</b> · 完成 <b>' + s.completed + '</b> 篇。';
          } else {
            hist.innerHTML =
              '💬 <b>情景对话</b> —— 左侧先选大类，再选具体场景，右侧挑选对话练习。' +
              (offlineMode ? ' <span style="color:#b45309">（离线模式 · 练习记录暂不同步）</span>' : '') +
              ' 还没有记录，来试试吧！';
          }
          dlgUi.completedMap = (s && s.completedMap) || {};
        })
        .catch(function () {});
    }

    function categoryKeys(m) {
      var cats = (m && m.categories) || {};
      var byCat = (m && m.byCategory) || {};
      return Object.keys(cats)
        .filter(function (key) {
          return byCat[key] > 0;
        })
        .sort(function (a, b) {
          var diff = (byCat[b] || 0) - (byCat[a] || 0);
          if (diff) return diff;
          return (cats[a].label || a).localeCompare(cats[b].label || b, 'zh');
        });
    }

    function pickDefaultCategory(m) {
      var keys = categoryKeys(m);
      if (!keys.length) return '';
      var bk = dlgBookmark();
      if (bk && bk.category && keys.indexOf(bk.category) >= 0) return bk.category;
      return keys[0];
    }

    function groupForCategory(catKey, m) {
      var gid = DLG_CAT_GROUP[catKey] || 'life_svc';
      var groups = groupsForMeta(m);
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].id === gid) return gid;
        if ((groups[i].categories || []).some(function (c) { return c.id === catKey; })) return groups[i].id;
      }
      return gid;
    }

    function ensureGroupExpanded(gid) {
      if (gid) dlgUi.expandedGroups[gid] = true;
    }

    function renderCategoryToc(m) {
      m = metaWithGroups(m || metaCache);
      if (!m) return;
      var cats = m.categories || {};
      var groups = groupsForMeta(m);
      var q = (dlgUi.catQ || '').trim().toLowerCase();
      dlgUi.catToc.innerHTML = '';

      if (q) {
        categoryKeys(m).forEach(function (key) {
          var c = cats[key] || {};
          var label = (c.icon || '') + ' ' + (c.label || key);
          var gid = groupForCategory(key, m);
          var grp = groups.find(function (g) { return g.id === gid; }) || {};
          var grpLabel = grp.label || '';
          var hay = (label + ' ' + key + ' ' + grpLabel).toLowerCase();
          if (hay.indexOf(q) < 0) return;
          var item = document.createElement('div');
          item.className = 'dlg-cat-item' + (dlgUi.category === key ? ' active' : '');
          item.dataset.cat = key;
          var prefix = grp.label ? NCE.escapeHtml(grp.label) + ' · ' : '';
          item.innerHTML =
            '<span class="ico">' + NCE.escapeHtml(c.icon || '📁') + '</span>' +
            '<span class="lbl">' + prefix + NCE.escapeHtml(c.label || key) + '</span>' +
            '<span class="cnt">' + ((m.byCategory && m.byCategory[key]) || 0) + '</span>';
          item.onclick = function () { selectCategory(key); };
          dlgUi.catToc.appendChild(item);
        });
      } else {
        groups.forEach(function (g) {
          var groupWrap = document.createElement('div');
          groupWrap.className = 'dlg-group';
          var open = !!dlgUi.expandedGroups[g.id];
          var hd = document.createElement('div');
          hd.className = 'dlg-group-hd' + (open ? ' open' : '');
          hd.innerHTML =
            '<span class="chev">▶</span>' +
            '<span class="ico">' + NCE.escapeHtml(g.icon || '📁') + '</span>' +
            '<span class="lbl">' + NCE.escapeHtml(g.label || g.id) + '</span>' +
            '<span class="cnt">' + (g.count || 0) + '</span>';
          var items = document.createElement('div');
          items.className = 'dlg-group-items' + (open ? ' open' : '');
          (g.categories || []).forEach(function (entry) {
            var key = entry.id;
            var c = cats[key] || {};
            var item = document.createElement('div');
            item.className = 'dlg-cat-item nested' + (dlgUi.category === key ? ' active' : '');
            item.dataset.cat = key;
            item.innerHTML =
              '<span class="ico">' + NCE.escapeHtml(c.icon || '📁') + '</span>' +
              '<span class="lbl">' + NCE.escapeHtml(c.label || key) + '</span>' +
              '<span class="cnt">' + (entry.count || 0) + '</span>';
            item.onclick = function (ev) {
              ev.stopPropagation();
              selectCategory(key);
            };
            items.appendChild(item);
          });
          hd.onclick = function () {
            dlgUi.expandedGroups[g.id] = !dlgUi.expandedGroups[g.id];
            renderCategoryToc(m);
          };
          groupWrap.appendChild(hd);
          groupWrap.appendChild(items);
          dlgUi.catToc.appendChild(groupWrap);
        });
      }

      if (!dlgUi.catToc.children.length) {
        dlgUi.catToc.innerHTML = '<div class="dlg-hint">没有匹配的场景</div>';
        return;
      }
      var activeEl = dlgUi.catToc.querySelector('.dlg-cat-item.active');
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    }

    function updateCategoryTitle(m) {
      m = metaWithGroups(m || metaCache);
      var cats = m.categories || {};
      var byCat = m.byCategory || {};
      var c = cats[dlgUi.category] || {};
      var n = byCat[dlgUi.category] || 0;
      var gid = groupForCategory(dlgUi.category, m);
      var grp = groupsForMeta(m).find(function (g) { return g.id === gid; }) || {};
      var prefix = grp.label ? NCE.escapeHtml(grp.label) + ' · ' : '';
      dlgUi.catTitle.innerHTML =
        prefix + NCE.escapeHtml((c.icon || '') + ' ' + (c.label || dlgUi.category)) +
        ' <span class="sub">共 ' + n + ' 篇</span>';
    }

    function selectCategory(key, opts) {
      opts = opts || {};
      if (!key) return;
      dlgUi.category = key;
      ensureGroupExpanded(groupForCategory(key, metaCache));
      if (!opts.keepPage) dlgUi.page = 0;
      if (!opts.keepListQ) {
        dlgUi.listQ = '';
        dlgUi.listSearch.value = '';
      }
      saveDlgBookmark({ category: key });
      renderCategoryToc(metaCache);
      updateCategoryTitle(metaCache);
      showList();
    }

    function filterDialogues(list) {
      var q = (dlgUi.listQ || '').trim().toLowerCase();
      if (!q) return list;
      return list.filter(function (item) {
        var hay =
          (item.title || '') + ' ' + (item.titleCn || '') + ' ' + (item.scene || '');
        return hay.toLowerCase().indexOf(q) >= 0;
      });
    }

    function buildDisplayUnits(list, meta) {
      var chains = (meta && meta.chains) || [];
      var chainIdSet = new Set();
      chains.forEach(function (ch) {
        (ch.partIds || []).forEach(function (id) {
          chainIdSet.add(id);
        });
      });
      var units = [];
      chains.forEach(function (ch) {
        var parts = list.filter(function (item) {
          return ch.partIds && ch.partIds.indexOf(item.id) >= 0;
        });
        if (!parts.length) return;
        parts.sort(function (a, b) {
          return (a.chain && a.chain.part || 0) - (b.chain && b.chain.part || 0);
        });
        units.push({ type: 'chain', chain: ch, parts: parts });
      });
      list.forEach(function (item) {
        if (!chainIdSet.has(item.id)) units.push({ type: 'item', item: item });
      });
      return units;
    }

    function unitHasId(unit, id) {
      if (unit.type === 'item') return unit.item.id === id;
      return unit.parts.some(function (p) {
        return p.id === id;
      });
    }

    function pageForDialogue(list, meta, id) {
      if (!id) return 0;
      var units = buildDisplayUnits(list, meta);
      for (var i = 0; i < units.length; i++) {
        if (unitHasId(units[i], id)) return Math.floor(i / PER_PAGE);
      }
      return 0;
    }

    function scrollToHighlight() {
      if (!dlgUi.highlightId) return;
      var el = dlgUi.stage.querySelector('[data-dlg-id="' + dlgUi.highlightId + '"]');
      dlgUi.highlightId = null;
      if (el) {
        el.classList.add('active');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(function () {
          el.classList.remove('active');
        }, 2000);
      }
    }

    function showList() {
      stopVoice();
      dlgUi.practicing = false;
      dlgUi.layout.classList.remove('dlg-practicing');
      dlgUi.mainHead.classList.remove('hidden');

      if (!dlgUi.category) {
        dlgUi.stage.innerHTML = '<div class="dlg-hint">请从左侧选择一个场景</div>';
        return;
      }

      var qs = '?category=' + encodeURIComponent(dlgUi.category);
      dlgUi.stage.innerHTML = '<div class="dlg-hint">加载对话列表…</div>';
      Promise.all([
        dlgApi(
          function () { return NCE.api('/api/dialogue/list' + qs); },
          function (off) { return off.listDialogues(dlgUi.category); },
        ),
        metaCache ? Promise.resolve(metaCache) : dlgApi(
          function () { return NCE.api('/api/dialogue/meta'); },
          function (off) { return off.getMeta().then(markOfflineMeta); },
        ),
        dlgApi(
          function () { return NCE.api('/api/dialogue/stats'); },
          function (off) { return off.getStats(); },
        ).catch(function () {
          return null;
        }),
      ])
        .then(function (res) {
          var d = res[0];
          var meta = res[1] || metaCache;
          if (d && d.offline) offlineMode = true;
          if (meta && meta.chains) metaCache = meta;
          if (res[2] && res[2].completedMap) dlgUi.completedMap = res[2].completedMap;

          var list = filterDialogues((d && d.dialogues) || []);
          if (!list.length) {
            dlgUi.stage.innerHTML =
              '<div class="dlg-hint">' +
              (dlgUi.listQ ? '没有匹配的对话，试试换个关键词' : '该场景暂无对话内容') +
              '</div>';
            return;
          }

          if (dlgUi.highlightId) {
            dlgUi.page = pageForDialogue(list, metaCache, dlgUi.highlightId);
          }

          var units = buildDisplayUnits(list, metaCache);
          var totalPages = Math.max(1, Math.ceil(units.length / PER_PAGE));
          if (dlgUi.page >= totalPages) dlgUi.page = totalPages - 1;
          if (dlgUi.page < 0) dlgUi.page = 0;
          var slice = units.slice(dlgUi.page * PER_PAGE, dlgUi.page * PER_PAGE + PER_PAGE);

          dlgUi.stage.innerHTML = '<div id="dlg-list-root"></div>';
          var root = dlgUi.stage.querySelector('#dlg-list-root');

          slice.forEach(function (unit) {
            if (unit.type === 'chain') {
              var ch = unit.chain;
              var parts = unit.parts;
              var block = document.createElement('div');
              block.className = 'dlg-chain';
              block.innerHTML =
                '<div class="dlg-chain-hd">' +
                '<div class="t">🔗 ' + NCE.escapeHtml(ch.titleCn || ch.title) +
                ' <span class="dlg-chain-badge">' + parts.length + ' 环</span></div>' +
                '<div class="s">完整对话链 · 按顺序练习</div>' +
                '</div><div class="dlg-chain-parts"></div>';
              var partsBox = block.querySelector('.dlg-chain-parts');
              parts.forEach(function (item) {
                partsBox.appendChild(makeListItem(item, true));
              });
              root.appendChild(block);
            } else {
              root.appendChild(makeListItem(unit.item, false));
            }
          });

          if (units.length > PER_PAGE) {
            var pager = document.createElement('div');
            pager.className = 'dlg-pager';
            pager.innerHTML =
              '<button type="button" id="dlg-pg-prev">上一页</button>' +
              '<span class="pg">第 ' + (dlgUi.page + 1) + ' / ' + totalPages + ' 页 · 共 ' + units.length + ' 组</span>' +
              '<button type="button" id="dlg-pg-next">下一页</button>';
            root.appendChild(pager);
            var prevBtn = pager.querySelector('#dlg-pg-prev');
            var nextBtn = pager.querySelector('#dlg-pg-next');
            prevBtn.disabled = dlgUi.page <= 0;
            nextBtn.disabled = dlgUi.page >= totalPages - 1;
            prevBtn.onclick = function () {
              if (dlgUi.page > 0) {
                dlgUi.page--;
                showList();
              }
            };
            nextBtn.onclick = function () {
              if (dlgUi.page < totalPages - 1) {
                dlgUi.page++;
                showList();
              }
            };
          }

          requestAnimationFrame(scrollToHighlight);
        })
        .catch(function (e) {
          console.error('[dialogue] 加载列表失败', e);
          dlgUi.stage.innerHTML = '<div class="dlg-hint">加载失败，请稍后重试</div>';
        });
    }

    function makeListItem(item, inChain) {
      var el = document.createElement('div');
      el.className = inChain ? 'dlg-chain-part' : 'dlg-item';
      el.dataset.dlgId = item.id;
      var done = dlgUi.completedMap[item.id];
      if (done && done.count > 0) el.classList.add('done');
      var catLabel = (metaCache && metaCache.categories[item.category]) || {};
      var partLabel = item.chain
        ? '<div class="p">第 ' + item.chain.part + ' / ' + item.chain.parts + ' 环</div>'
        : '';
      var prog =
        done && done.count > 0
          ? '<span class="prog ' + accClass(done.best || 0) + '" title="已完成 ' + done.count + ' 次">最佳 ' + (done.best || 0) + '%</span>'
          : '';
      el.innerHTML =
        partLabel +
        '<div class="t-row"><div class="t">' + NCE.escapeHtml(item.titleCn || item.title) +
        ' <span style="font-weight:400;color:#889;font-size:14px">' + NCE.escapeHtml(item.title) + '</span></div>' +
        prog + '</div>' +
        '<div class="s">' + NCE.escapeHtml(item.scene || '') + '</div>' +
        (inChain
          ? ''
          : '<div class="m">' + NCE.escapeHtml((catLabel.icon || '') + ' ' + (catLabel.label || item.category)) +
            ' · ' + item.practiceCount + ' 句练习 · 共 ' + item.turnCount + ' 轮</div>');
      el.onclick = function () {
        startDialogue(item.id);
      };
      return el;
    }

    function startDialogue(id) {
      dlgUi.practicing = true;
      dlgUi.layout.classList.add('dlg-practicing');
      dlgUi.mainHead.classList.add('hidden');
      saveDlgBookmark({ category: dlgUi.category, dialogueId: id });
      dlgUi.highlightId = id;
      dlgUi.stage.innerHTML = '<div class="dlg-hint">加载对话…</div>';
      dlgApi(
        function () { return NCE.api('/api/dialogue/' + encodeURIComponent(id)); },
        function (off) { return off.getDialogue(id); },
      )
        .then(function (dlg) {
          if (dlg && dlg.offline) offlineMode = true;
          if (!dlg || !dlg.turns || !dlg.turns.length) {
            NCE.toast('对话内容为空', 'warn');
            showList();
            return;
          }
          runPractice(dlgUi.stage, dlg, {
            onNextPart: function (nextId) {
              startDialogue(nextId);
            },
            onBack: function () {
              window.scrollTo(0, 0);
              showList();
            },
            onComplete: function () {
              NCE.api('/api/dialogue/stats')
                .then(function (s) {
                  if (s && s.completedMap) dlgUi.completedMap = s.completedMap;
                })
                .catch(function () {});
            },
          });
        })
        .catch(function (e) {
          console.error('[dialogue] 加载对话失败', e);
          NCE.toast('加载对话失败', 'error');
          showList();
        });
    }

    dlgUi.catSearch.oninput = function () {
      dlgUi.catQ = dlgUi.catSearch.value;
      renderCategoryToc(metaCache);
    };
    dlgUi.listSearch.oninput = function () {
      dlgUi.listQ = dlgUi.listSearch.value;
      dlgUi.page = 0;
      showList();
    };

    Promise.all([loadMeta(), loadStats()])
      .then(function (res) {
        var m = res[0];
        var cat = pickDefaultCategory(m);
        if (!cat) {
          dlgUi.catToc.innerHTML = '<div class="dlg-hint">暂无对话内容</div>';
          dlgUi.stage.innerHTML = '<div class="dlg-hint">暂无对话内容</div>';
          return;
        }
        ensureGroupExpanded(groupForCategory(cat, m));
        // 首次进入默认展开全部大类，避免侧栏只见标题不见场景
        groupsForMeta(m).forEach(function (g) {
          dlgUi.expandedGroups[g.id] = true;
        });
        var bk = dlgBookmark();
        if (bk && bk.dialogueId) dlgUi.highlightId = bk.dialogueId;
        selectCategory(cat, { keepListQ: true });
      })
      .catch(function (e) {
        console.error('[dialogue] 加载元数据失败', e);
        dlgUi.catToc.innerHTML = '<div class="dlg-hint">加载失败</div>';
        dlgUi.stage.innerHTML = '<div class="dlg-hint">加载失败，请稍后重试</div>';
      });
  }

  function runPractice(stage, dlg, hooks) {
    hooks = hooks || {};
    var turnIdx = 0;
    var chatLog = [];
    var tally = { correct: 0, total: 0 };

    render();

    function render() {
      stopVoice(); // 进入下一轮前中止未完成的识别
      stage.innerHTML = '';
      var card = document.createElement('div');
      card.className = 'dlg-card';

      var catLabel = '';
      if (dlg.category && metaCache && metaCache.categories) {
        var c = metaCache.categories[dlg.category] || {};
        catLabel = (c.icon || '') + ' ' + (c.label || dlg.category);
      }

      card.innerHTML =
        '<div class="dlg-progress">' +
        '<span>' + NCE.escapeHtml(dlg.titleCn || dlg.title) +
        (dlg.chain
          ? ' <span class="dlg-chain-badge">链 ' + dlg.chain.part + '/' + dlg.chain.parts + '</span>'
          : '') +
        '</span>' +
        '<span>第 ' + (turnIdx + 1) + ' / ' + dlg.turns.length + ' 轮</span>' +
        '</div>' +
        (dlg.chain
          ? '<div class="dlg-scene" style="background:#eef3ff;border-color:#c5d5f5">🔗 ' +
            NCE.escapeHtml(dlg.chain.titleCn || dlg.chain.title) + '</div>'
          : '') +
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
        (NCE.speakBtnHtml && (entry.en || entry.userText) ? NCE.speakBtnHtml(entry.en || entry.userText) : '') +
        NCE.escapeHtml(entry.en || entry.userText || '') +
        (entry.cn ? '<div class="cn">' + NCE.escapeHtml(entry.cn) + '</div>' : '');
      if (NCE.bindSpeakClicks) NCE.bindSpeakClicks(b);
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
        (SpeechRec ? '<button class="dlg-btn mini" id="dlg-shadow">🎤 跟读</button>' : '') +
        '<button class="dlg-btn primary" id="dlg-continue">继续 →</button>' +
        '</div>' +
        '<div class="dlg-shadow-fb" id="dlg-shadow-fb"></div>';
      NCE.speak(turn.en);
      active.querySelector('#dlg-speak').onclick = function () {
        NCE.speak(turn.en);
      };

      // 跟读：先播标准音，再识别用户跟读，宽松比对给即时反馈；不计分不上报
      var shadowBtn = active.querySelector('#dlg-shadow');
      if (shadowBtn) {
        var shadowFb = active.querySelector('#dlg-shadow-fb');
        markRecOffline(shadowBtn, !speechRecUsable());
        shadowBtn.onclick = function () {
          if (!speechRecUsable()) {
            warnOfflineRec();
            return;
          }
          if (activeRec || ttsWaitTimer) {
            // 再点一次 = 停止（含还在播标准音的阶段）
            stopVoice();
            if (window.speechSynthesis) {
              try {
                speechSynthesis.cancel();
              } catch (e) {}
            }
            shadowBtn.textContent = '🎤 跟读';
            shadowBtn.classList.remove('rec');
            return;
          }
          shadowFb.innerHTML = '';
          shadowBtn.textContent = '🔊 听标准音…';
          shadowBtn.classList.add('rec');
          NCE.speak(turn.en);
          afterTTS(function () {
            startVoice({
              onStart: function () {
                shadowBtn.textContent = '🛑 跟读中…点击停止';
              },
              onResult: function (text) {
                var sim = speechSimilarity(text, turn.en);
                if (sim >= 0.65) {
                  shadowFb.innerHTML = '<span class="ok">跟读得不错 ✓</span>';
                } else {
                  shadowFb.innerHTML =
                    '<span class="bad">再试一次（你说的是: ' + NCE.escapeHtml(text) + '）</span>';
                }
              },
              onEnd: function () {
                shadowBtn.textContent = '🎤 跟读';
                shadowBtn.classList.remove('rec');
              },
            });
          });
        };
      }

      var btn = active.querySelector('#dlg-continue');
      btn.onclick = onNext;
      btn.focus(); // 聚焦按钮后按回车会原生触发 click 推进；不再用 document.onkeydown（会与练习轮输入框回车双触发、跳过练习轮）
    }

    function showPracticeTurn(active, turn) {
      active.innerHTML =
        '<div class="dlg-prompt">🎭 你是 <b>' + NCE.escapeHtml(turn.role) + '</b>，请说出：</div>' +
        '<div class="dlg-scene" style="margin-bottom:10px;font-size:16px;color:#123;background:#f6f8fc;border-color:#dbe4ff">' +
        NCE.escapeHtml(turn.cn) + '</div>' +
        '<input class="dlg-input" id="dlg-input" autocomplete="off" spellcheck="false" placeholder="输入英文台词，回车提交…" />' +
        '<div class="dlg-actions">' +
        '<button class="dlg-btn primary" id="dlg-submit">提交</button>' +
        (SpeechRec ? '<button class="dlg-btn" id="dlg-mic">🎤 开口说</button>' : '') +
        '<button class="dlg-btn" id="dlg-skip">显示答案</button>' +
        '</div>' +
        '<div id="dlg-feedback"></div>';

      var input = active.querySelector('#dlg-input');
      var submitBtn = active.querySelector('#dlg-submit');
      var skipBtn = active.querySelector('#dlg-skip');
      var micBtn = active.querySelector('#dlg-mic');
      var feedback = active.querySelector('#dlg-feedback');
      markRecOffline(micBtn, !speechRecUsable());
      input.focus();

      var graded = false;

      function setBusy(busy) {
        submitBtn.disabled = busy;
        skipBtn.disabled = busy;
        input.disabled = busy;
        if (micBtn) micBtn.disabled = busy;
      }

      function doGrade(val, skipped) {
        if (graded) return;
        graded = true;
        stopVoice(); // 提交时中止仍在进行的识别
        setBusy(true);

        dlgApi(
          function () {
            return NCE.api('/api/dialogue/grade', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: dlg.id, turn: turn.index, response: val || '' }),
            });
          },
          function (off) { return off.gradeDialogue(dlg.id, turn.index, val || ''); },
        )
          .then(function (r) {
            if (!r || r.error) {
              NCE.toast((r && r.error) || '判分失败', 'error');
              graded = false;
              setBusy(false);
              return;
            }
            if (r.offline) offlineMode = true;
            tally.total++;
            if (r.correct) tally.correct++;
            else if (r.srsKey && !offlineMode) {
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
            setBusy(false);
          });
      }

      function showTurnFeedback(r, val, skipped) {
        var isLast = turnIdx + 1 >= dlg.turns.length;
        var answerCnHtml = (r.cn || turn.cn)
          ? '<div class="dlg-cn">译：' + NCE.escapeHtml(r.cn || turn.cn) + '</div>'
          : '';
        var answersHtml = NCE.formatAnswersWithSpeak
          ? NCE.formatAnswersWithSpeak(r.answer, { btnClass: 'dlg-btn mini' })
          : NCE.escapeHtml(NCE.firstAnswer ? NCE.firstAnswer(r.answer) : r.answer);
        var primaryAnswer = NCE.firstAnswer ? NCE.firstAnswer(r.answer) : r.answer;
        feedback.innerHTML =
          '<div class="dlg-verdict ' + (r.correct ? 'ok' : 'bad') + '">' +
          (r.correct ? '✓ 正确！' : (skipped ? '参考答案：' : '✗ 不对，看看参考答案')) + '</div>' +
          '<div class="dlg-answer">📖 ' + answersHtml + answerCnHtml + '</div>' +
          '<div class="dlg-actions">' +
          '<button class="dlg-btn primary" id="dlg-next">' + (isLast ? '完成对话 →' : '下一轮 →') + '</button>' +
          '</div>';

        chatLog.push({
          role: turn.role,
          en: primaryAnswer,
          userText: val,
          cn: turn.cn,
          practice: true,
          correct: r.correct,
        });

        if (NCE.bindSpeakClicks) NCE.bindSpeakClicks(feedback);
        if (!r.correct && primaryAnswer) NCE.speak(primaryAnswer);

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
      // 开口说：识别结果填入输入框并直接走 doGrade 判分链路（判分有口语等价容忍）
      if (micBtn) {
        micBtn.onclick = function () {
          if (!speechRecUsable()) {
            warnOfflineRec();
            return;
          }
          if (graded) return;
          if (activeRec) {
            stopVoice(); // 再点一次 = 停止，onend 会复位按钮
            return;
          }
          startVoice({
            onStart: function () {
              micBtn.textContent = '🛑 识别中…点击停止';
              micBtn.classList.add('rec');
            },
            onResult: function (text) {
              input.value = text;
              doGrade(text, false);
            },
            onEnd: function () {
              micBtn.textContent = '🎤 开口说';
              micBtn.classList.remove('rec');
            },
          });
        };
      }
    }

    function finish() {
      stopVoice();
      document.onkeydown = null;
      var acc = tally.total ? Math.round((tally.correct / tally.total) * 100) : 0;

      NCE.api('/api/dialogue/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dlg.id, correct: tally.correct, total: tally.total }),
      })
        .then(function () {
          if (hooks.onComplete) hooks.onComplete();
        })
        .catch(function () {
          if (hooks.onComplete) hooks.onComplete();
        });

      stage.innerHTML = '';
      var card = document.createElement('div');
      card.className = 'dlg-card dlg-summary';
      var nextBtn =
        dlg.nextId
          ? '<button class="dlg-btn primary" id="dlg-next-part">下一环 →</button>'
          : '';
      card.innerHTML =
        '<div style="font-size:18px;font-weight:600;margin-bottom:8px">' + NCE.escapeHtml(dlg.titleCn || dlg.title) + '</div>' +
        (dlg.chain
          ? '<div class="sub">🔗 ' + NCE.escapeHtml(dlg.chain.titleCn || dlg.chain.title) +
            ' · 第 ' + dlg.chain.part + ' / ' + dlg.chain.parts + ' 环完成</div>'
          : '') +
        '<div class="big">' + acc + '%</div>' +
        '<div class="sub">本轮正确率 · 练习 ' + tally.total + ' 句 · 正确 ' + tally.correct + ' 句</div>' +
        '<div class="dlg-actions" style="justify-content:center;margin-top:16px">' +
        nextBtn +
        '<button class="dlg-btn primary" id="dlg-retry">再练一遍</button>' +
        '<button class="dlg-btn" id="dlg-back">返回列表</button>' +
        '</div>';
      stage.appendChild(card);

      if (dlg.nextId && hooks.onNextPart) {
        card.querySelector('#dlg-next-part').onclick = function () {
          hooks.onNextPart(dlg.nextId);
        };
      }

      card.querySelector('#dlg-retry').onclick = function () {
        turnIdx = 0;
        chatLog = [];
        tally = { correct: 0, total: 0 };
        render();
      };
      card.querySelector('#dlg-back').onclick = function () {
        if (hooks.onBack) hooks.onBack();
        else {
          window.scrollTo(0, 0);
          NCE.gotoTab('dialogue');
        }
      };
    }
  }

  window.addEventListener('online', function () {
    document.querySelectorAll('#dlg-mic, #dlg-shadow').forEach(function (btn) {
      markRecOffline(btn, false);
    });
  });
  window.addEventListener('offline', function () {
    document.querySelectorAll('#dlg-mic, #dlg-shadow').forEach(function (btn) {
      markRecOffline(btn, true);
    });
  });

  NCE.registerFeature({
    id: 'dialogue',
    label: '情景对话',
    icon: '💬',
    onShow: onShow,
  });
})();
