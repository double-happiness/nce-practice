'use strict';
// 主题切换：顶栏色板 + localStorage 记忆。默认 aurora（不写 data-theme）。
(function () {
  var KEY = 'nce-theme';
  var THEMES = [
    { k: 'aurora', label: '极光紫' },
    { k: 'ocean', label: '清新青' },
    { k: 'rose', label: '樱粉' },
    { k: 'paper', label: '纸质暖' },
    { k: 'midnight', label: '深色玻璃' },
  ];

  function apply(k) {
    if (k && k !== 'aurora') document.documentElement.setAttribute('data-theme', k);
    else document.documentElement.removeAttribute('data-theme');
  }

  var current = 'aurora';
  try { current = localStorage.getItem(KEY) || 'aurora'; } catch (e) {}
  apply(current); // 兜底（head 内联脚本已尽早应用，避免闪烁）

  function build() {
    var bar = document.querySelector('.topbar');
    if (!bar || bar.querySelector('.theme-switch')) return;

    var wrap = document.createElement('div');
    wrap.className = 'theme-switch';
    wrap.title = '切换主题配色';

    var dots = document.createElement('div');
    dots.className = 'theme-dots';
    THEMES.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-dot' + (t.k === current ? ' active' : '');
      b.dataset.k = t.k;
      b.title = t.label;
      b.setAttribute('aria-label', '主题：' + t.label);
      b.onclick = function () {
        current = t.k;
        try { localStorage.setItem(KEY, t.k); } catch (e) {}
        apply(t.k);
        dots.querySelectorAll('.theme-dot').forEach(function (d) {
          d.classList.toggle('active', d === b);
        });
      };
      dots.appendChild(b);
    });
    wrap.appendChild(dots);

    // 插到统计信息前；兼容 .stats-mini 被包在 .topbar-right 等容器内的情况
    var stats = bar.querySelector('.stats-mini');
    if (stats && stats.parentNode) stats.parentNode.insertBefore(wrap, stats);
    else bar.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
