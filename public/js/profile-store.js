'use strict';
// NCEStore：轻量 UI 学习状态存储（最近学习课/已学/已掌握/听写成绩与断点）。
// 服务器为准（/api/ui-state，按档案隔离，跨浏览器一致、可备份），
// localStorage 作离线兜底镜像（key 按档案加前缀，档案 id 来自后端 cookie: nce_pid）。
// 必须在 app.js 及各 feat 脚本之前加载；读写方须先 await NCEStore.ready。
(function () {
  var KEYS = [
    'nce-last-lesson',
    'nce-viewed-lessons',
    'nce-mastered-lessons',
    'nce-checkin-lessons',
    'nce-onboarded',
    'dct-best',
    'dct-last',
    'dct-pos',
    'nce-wordhub-tab',
    'nce-dict-book',
    'nce-dict-history',
  ];

  function readPid() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)nce_pid=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : 'default';
    } catch (e) {
      return 'default';
    }
  }
  var pid = readPid();
  // default 档案不加前缀：兼容档案功能上线前的旧数据，也让旧数据可被迁移上服务器
  function lsKey(k) { return pid === 'default' ? k : pid + ':' + k; }

  function mirrorRead(k) {
    try {
      var raw = localStorage.getItem(lsKey(k));
      return raw == null ? undefined : JSON.parse(raw);
    } catch (e) {
      return undefined;
    }
  }
  function mirrorWrite(k, v) {
    try { localStorage.setItem(lsKey(k), JSON.stringify(v)); } catch (e) { /* 隐私模式下不可用 */ }
  }
  function mirrorRemove(k) {
    try { localStorage.removeItem(lsKey(k)); } catch (e) { /* ignore */ }
  }

  // 先用本地镜像同步填充缓存（旧数据/离线兜底），服务器数据到达后以服务器为准
  var cache = {};
  KEYS.forEach(function (k) {
    var v = mirrorRead(k);
    if (v !== undefined && v !== null) cache[k] = v;
  });

  function push(patch) {
    return fetch('/api/ui-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(function (e) {
      console.warn('[NCEStore] 同步到服务器失败（数据仍在本地镜像中）', e);
    });
  }

  var ready = fetch('/api/ui-state')
    .then(function (r) { return r.json(); })
    .then(function (server) {
      // 服务器完全为空 → 首次启用，把本地旧数据一次性迁移上去；
      // 服务器非空 → 一律以服务器为准，镜像同步成服务器状态（含删除服务器没有的键，
      // 避免恢复备份后被本地旧镜像"复活"已删数据）。
      if (!Object.keys(server).length) {
        if (Object.keys(cache).length) return push(cache);
        return;
      }
      KEYS.forEach(function (k) {
        if (server[k] !== undefined && server[k] !== null) {
          cache[k] = server[k];
          mirrorWrite(k, server[k]);
        } else {
          delete cache[k];
          mirrorRemove(k);
        }
      });
    })
    .catch(function (e) {
      console.warn('[NCEStore] 读取服务器状态失败，本次使用本地镜像', e);
    });

  window.NCEStore = {
    profileId: pid,
    ready: ready,
    get: function (k) { return cache[k]; },
    set: function (k, v) {
      cache[k] = v;
      mirrorWrite(k, v);
      push((function () { var p = {}; p[k] = v; return p; })());
    },
  };
})();
