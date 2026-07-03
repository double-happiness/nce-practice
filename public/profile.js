'use strict';
// 多用户档案切换：顶栏「👤 档案」下拉。独立模块，不依赖 app.js。
// 切换/新建/删除后整页刷新，让所有数据视图读取新档案。
(function () {
  var EMOJIS = ['👤', '🧑‍🎓', '👧', '👦', '🐱', '🐼', '🦊', '🐰'];

  function api(url, body) {
    return fetch(url, body ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : undefined).then(function (r) { return r.json(); });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function build(meta) {
    var bar = document.querySelector('.topbar');
    if (!bar || bar.querySelector('.profile-switch')) return;
    var current = meta.profiles.find(function (p) { return p.id === meta.current; }) || meta.profiles[0];

    var wrap = el('div', 'profile-switch');
    var btn = el('button', 'profile-btn');
    btn.type = 'button';
    btn.title = '切换学习档案（各档案的进度/错题/复习/生词互相独立）';
    btn.innerHTML = '<span class="pf-emoji"></span><span class="pf-name"></span><span class="pf-caret">▾</span>';
    btn.querySelector('.pf-emoji').textContent = current.emoji || '👤';
    btn.querySelector('.pf-name').textContent = current.name;
    wrap.appendChild(btn);

    var menu = el('div', 'profile-menu hidden');
    meta.profiles.forEach(function (p) {
      var row = el('div', 'pf-row' + (p.id === meta.current ? ' current' : ''));
      var main = el('span', 'pf-row-main', (p.emoji || '👤') + ' ' + p.name + (p.id === meta.current ? ' ✓' : ''));
      main.onclick = function () {
        if (p.id === meta.current) return;
        api('/api/profile/switch', { id: p.id }).then(function (r) {
          if (r.error) { alert(r.error); return; }
          location.reload();
        });
      };
      row.appendChild(main);

      var ren = el('button', 'pf-op', '✎');
      ren.title = '重命名';
      ren.onclick = function (e) {
        e.stopPropagation();
        var name = prompt('新的档案名：', p.name);
        if (!name || name.trim() === p.name) return;
        api('/api/profile/rename', { id: p.id, name: name.trim() }).then(function (r) {
          if (r.error) { alert(r.error); return; }
          location.reload();
        });
      };
      row.appendChild(ren);

      if (p.id !== meta.current) {
        var del = el('button', 'pf-op danger', '✕');
        del.title = '删除该档案（数据会移入回收目录）';
        del.onclick = function (e) {
          e.stopPropagation();
          if (!confirm('删除档案「' + p.name + '」？其学习数据将移入 data/profiles/.trash/，可手工找回。')) return;
          api('/api/profile/remove', { id: p.id }).then(function (r) {
            if (r.error) { alert(r.error); return; }
            location.reload();
          });
        };
        row.appendChild(del);
      }
      menu.appendChild(row);
    });

    var add = el('div', 'pf-row pf-add', '＋ 新建档案');
    add.onclick = function () {
      var name = prompt('档案名（例如：爸爸 / 小明）：');
      if (!name || !name.trim()) return;
      var emoji = EMOJIS[meta.profiles.length % EMOJIS.length];
      api('/api/profile/create', { name: name.trim(), emoji: emoji }).then(function (r) {
        if (r.error) { alert(r.error); return; }
        location.reload(); // 创建后已自动切换到新档案
      });
    };
    menu.appendChild(add);
    wrap.appendChild(menu);

    btn.onclick = function (e) {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    };
    document.addEventListener('click', function () { menu.classList.add('hidden'); });

    // 插到顶栏品牌之后（语速选择之前）
    var anchor = bar.querySelector('.tts-rate');
    if (anchor) bar.insertBefore(wrap, anchor);
    else bar.appendChild(wrap);
  }

  function init() {
    api('/api/profile/list').then(build).catch(function () { /* 旧后端无此接口时静默 */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
