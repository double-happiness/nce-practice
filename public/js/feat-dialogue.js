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
      '@keyframes dlgRecPulse{0%,100%{opacity:1}50%{opacity:.6}}' +
      '.dlg-shadow-fb{font-size:14px;margin-top:8px;min-height:1em}' +
      '.dlg-shadow-fb .ok{color:#178a3a;font-weight:600}' +
      '.dlg-shadow-fb .bad{color:#d12f2f}';
    var st = document.createElement('style');
    st.id = 'dlg-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- 语音识别（Web Speech API，零依赖；Firefox 等不支持时按钮不显示） ----------
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
    if (code === 'network') return '语音识别失败：Chrome 的识别走在线服务，请检查网络后重试';
    return '语音识别出错（' + code + '），请重试';
  }

  // 开始一次识别。opts: { onStart(), onResult(text), onEnd() }
  // 已在识别中会先 abort 旧的再开新的，保证重复点击可停可重开
  function startVoice(opts) {
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
  var curCategory = '';

  function onShow(panel) {
    injectStyle();
    stopVoice(); // 重进本页时清掉残留识别
    // 面板被切走（加 hidden class）时中止识别，registerFeature 没有 onHide 钩子，用观察器兜底
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
      stopVoice();
      var qs = curCategory ? '?category=' + encodeURIComponent(curCategory) : '';
      stage.innerHTML = '<div class="dlg-hint">加载对话列表…</div>';
      Promise.all([
        NCE.api('/api/dialogue/list' + qs),
        metaCache ? Promise.resolve(metaCache) : NCE.api('/api/dialogue/meta'),
      ])
        .then(function (res) {
          var d = res[0];
          var meta = res[1] || metaCache;
          if (meta && meta.chains) metaCache = meta;
          var list = (d && d.dialogues) || [];
          if (!list.length) {
            stage.innerHTML = '<div class="dlg-hint">该场景暂无对话内容</div>';
            return;
          }
          stage.innerHTML = '<div id="dlg-list-root"></div>';
          var root = stage.querySelector('#dlg-list-root');
          var chains = (metaCache && metaCache.chains) || [];
          var chainIdSet = new Set();
          chains.forEach(function (ch) {
            (ch.partIds || []).forEach(function (id) {
              chainIdSet.add(id);
            });
          });

          chains.forEach(function (ch) {
            var parts = list.filter(function (item) {
              return ch.partIds && ch.partIds.indexOf(item.id) >= 0;
            });
            if (!parts.length) return;
            parts.sort(function (a, b) {
              return (a.chain && a.chain.part || 0) - (b.chain && b.chain.part || 0);
            });
            var block = document.createElement('div');
            block.className = 'dlg-chain';
            block.innerHTML =
              '<div class="dlg-chain-hd">' +
              '<div class="t">🔗 ' + NCE.escapeHtml(ch.titleCn || ch.title) +
              ' <span class="dlg-chain-badge">' + parts.length + ' 环</span></div>' +
              '<div class="s">完整对话链 · 按顺序练习，体验从需求到交付的全过程</div>' +
              '</div><div class="dlg-chain-parts"></div>';
            var partsBox = block.querySelector('.dlg-chain-parts');
            parts.forEach(function (item) {
              partsBox.appendChild(makeListItem(item, true));
            });
            root.appendChild(block);
          });

          var standalone = list.filter(function (item) {
            return !chainIdSet.has(item.id);
          });
          if (standalone.length) {
            var box = document.createElement('div');
            box.className = 'dlg-list';
            if (chains.length) {
              var hd = document.createElement('div');
              hd.className = 'dlg-hint';
              hd.style.marginTop = '8px';
              hd.textContent = '单篇对话';
              root.appendChild(hd);
            }
            standalone.forEach(function (item) {
              box.appendChild(makeListItem(item, false));
            });
            root.appendChild(box);
          }
        })
        .catch(function (e) {
          console.error('[dialogue] 加载列表失败', e);
          stage.innerHTML = '<div class="dlg-hint">加载失败，请稍后重试</div>';
        });
    }

    function makeListItem(item, inChain) {
      var el = document.createElement('div');
      el.className = inChain ? 'dlg-chain-part' : 'dlg-item';
      var catLabel = (metaCache && metaCache.categories[item.category]) || {};
      var partLabel = item.chain
        ? '<div class="p">第 ' + item.chain.part + ' / ' + item.chain.parts + ' 环</div>'
        : '';
      el.innerHTML =
        partLabel +
        '<div class="t">' + NCE.escapeHtml(item.titleCn || item.title) +
        ' <span style="font-weight:400;color:#889;font-size:14px">' + NCE.escapeHtml(item.title) + '</span></div>' +
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
      stage.innerHTML = '<div class="dlg-hint">加载对话…</div>';
      NCE.api('/api/dialogue/' + encodeURIComponent(id))
        .then(function (dlg) {
          if (!dlg || !dlg.turns || !dlg.turns.length) {
            NCE.toast('对话内容为空', 'warn');
            showList();
            return;
          }
          runPractice(stage, dlg, {
            onNextPart: function (nextId) {
              startDialogue(nextId);
            },
            onBack: function () {
              window.scrollTo(0, 0);
              showList();
            },
          });
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
      if (dlg.category) {
        NCE.api('/api/dialogue/meta').then(function (m) {
          var c = (m && m.categories && m.categories[dlg.category]) || {};
          catLabel = (c.icon || '') + ' ' + (c.label || dlg.category);
        }).catch(function () {});
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
        shadowBtn.onclick = function () {
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

        NCE.api('/api/dialogue/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: dlg.id, turn: turn.index, response: val || '' }),
        })
          .then(function (r) {
            if (!r || r.error) {
              NCE.toast((r && r.error) || '判分失败', 'error');
              graded = false;
              setBusy(false);
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
            setBusy(false);
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
      // 开口说：识别结果填入输入框并直接走 doGrade 判分链路（判分有口语等价容忍）
      if (micBtn) {
        micBtn.onclick = function () {
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
      }).catch(function () {});

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

  NCE.registerFeature({
    id: 'dialogue',
    label: '情景对话',
    icon: '💬',
    onShow: onShow,
  });
})();
