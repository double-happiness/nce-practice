'use strict';
// PWA 支撑模块:Service Worker 注册 + 安装提示 + 每日学习提醒。
// 依赖 window.NCE(app.js 定义)与 window.NCEStore(js/profile-store.js),
// 必须放在 app.js 之后加载(app.js 会整体重建 window.NCE 对象)。
//
// 图标说明:manifest 里只有 SVG 图标(purpose any)。Chrome/Edge/Android 支持良好;
// iOS Safari 不认 manifest 的 SVG 图标(添加到主屏幕会用页面截图),
// 如需 iOS 图标需另加 PNG 的 apple-touch-icon,属后续可选优化。
(function () {
  var NCE = window.NCE;
  if (!NCE) {
    console.warn('[pwa] 未找到 window.NCE,请确认 pwa.js 在 app.js 之后加载');
    return;
  }

  // ---------- Service Worker 注册 ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/sw.js')
        .then(function (reg) {
          console.log('[pwa] Service Worker 已注册,scope:', reg.scope);
        })
        .catch(function (err) {
          console.warn('[pwa] Service Worker 注册失败(不影响在线使用)', err);
        });
    });
  }

  // ---------- 安装提示(A2HS) ----------
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // 攒起来,等用户在设置卡里主动点「安装」
    deferredPrompt = e;
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    if (NCE.toast) NCE.toast('已安装到桌面/主屏幕 🎉');
  });

  // ---------- 每日学习提醒 ----------
  var REMINDER_KEY = 'nce-reminder';
  var FIRED_KEY = 'nce-reminder-fired'; // 当天是否已提醒过(仅本浏览器,无需跨设备)
  var REMINDER_TITLE = '📘 新概念英语练习';
  var REMINDER_BODY = '今天的听说读写还没完成哦,来学一会吧~';

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // NCEStore 启动时只回填内置键,自定义键需从其本地镜像兜底读取
  // (镜像 key 规则与 profile-store.js 保持一致:default 档案不加前缀)
  function mirrorRead() {
    try {
      var pid = (window.NCEStore && window.NCEStore.profileId) || 'default';
      var raw = localStorage.getItem(pid === 'default' ? REMINDER_KEY : pid + ':' + REMINDER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getReminder() {
    var v = (window.NCEStore && window.NCEStore.get(REMINDER_KEY)) || mirrorRead();
    var cfg = { enabled: false, time: '20:00' };
    if (v && typeof v === 'object') {
      if (typeof v.enabled === 'boolean') cfg.enabled = v.enabled;
      if (typeof v.time === 'string' && /^\d{2}:\d{2}$/.test(v.time)) cfg.time = v.time;
    }
    return cfg;
  }

  function setReminder(patch) {
    var merged = Object.assign(getReminder(), patch || {});
    if (window.NCEStore) window.NCEStore.set(REMINDER_KEY, merged);
    return merged;
  }

  function firedToday() {
    try { return localStorage.getItem(FIRED_KEY) === todayStr(); } catch (e) { return false; }
  }
  function markFired() {
    try { localStorage.setItem(FIRED_KEY, todayStr()); } catch (e) { /* 隐私模式下不可用 */ }
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    try {
      var p = Notification.requestPermission();
      if (p && typeof p.then === 'function') return p;
      // 旧版回调式 API
      return new Promise(function (resolve) { Notification.requestPermission(resolve); });
    } catch (e) {
      return new Promise(function (resolve) { Notification.requestPermission(resolve); });
    }
  }

  function showNotification() {
    var opts = { body: REMINDER_BODY, icon: '/icon.svg', badge: '/icon.svg', tag: 'nce-daily-reminder' };
    var fallback = function () {
      try { new Notification(REMINDER_TITLE, opts); } catch (e) { console.warn('[pwa] 弹通知失败', e); }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then(function (reg) {
          if (reg && reg.showNotification) return reg.showNotification(REMINDER_TITLE, opts);
          fallback();
        })
        .catch(fallback);
    } else {
      fallback();
    }
  }

  // 每 30 秒检查一次;到点(或过点补提醒)且当天未提醒过 → 查今日达标情况再决定是否弹
  var CHECK_INTERVAL_MS = 30 * 1000;
  function reminderTick() {
    var cfg = getReminder();
    if (!cfg.enabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (firedToday()) return;
    var now = new Date();
    var hm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    if (hm < cfg.time) return; // 还没到设定时间(零填充 HH:MM 可直接按字符串比较)
    markFired(); // 先标记,避免请求返回前重复触发
    NCE.api('/api/plan/overview')
      .then(function (d) {
        var allMet = d && d.skillsTotal > 0 && d.skillsMet >= d.skillsTotal;
        if (allMet) return; // 今日听说读写已全部达标,不打扰
        showNotification();
      })
      .catch(function () {
        showNotification(); // 拿不到进度(如离线)时照常提醒,宁多勿漏
      });
  }
  setInterval(reminderTick, CHECK_INTERVAL_MS);
  // 后台标签页定时器会被浏览器节流,切回前台时立即补查一次
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) reminderTick();
  });

  // ---------- 暴露给设置卡(feat-plan.js)的接口 ----------
  NCE.pwa = {
    canInstall: function () { return !!deferredPrompt; },
    promptInstall: function () {
      if (!deferredPrompt) return Promise.resolve(null);
      var evt = deferredPrompt;
      deferredPrompt = null; // prompt 只能调用一次
      evt.prompt();
      return evt.userChoice.then(function (r) { return r ? r.outcome : null; });
    },
    isStandalone: function () {
      return (
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true
      );
    },
    notificationPermission: function () {
      return 'Notification' in window ? Notification.permission : 'unsupported';
    },
    requestNotificationPermission: requestNotificationPermission,
    getReminder: getReminder,
    setReminder: setReminder,
  };
})();
