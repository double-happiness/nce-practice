'use strict';

// 数据备份 导出/导入 —— 自注册功能模块
(function () {
  const NCE = window.NCE;
  if (!NCE || !NCE.registerFeature) return;

  // ---------- 注入样式（类名前缀 bk-）----------
  const style = document.createElement('style');
  style.textContent = `
    .bk-wrap { max-width: 640px; margin: 0 auto; }
    .bk-intro { color: #475569; font-size: 14px; line-height: 1.7; margin-bottom: 18px; }
    .bk-card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px 22px; background: #fbfcff;
      box-shadow: 0 2px 8px rgba(0,0,0,.04); margin-bottom: 18px; }
    .bk-card h3 { margin: 0 0 14px; font-size: 15px; color: #111; }
    .bk-stats { list-style: none; padding: 0; margin: 0; display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
    .bk-stats li { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #fff; }
    .bk-stats .bk-num { font-size: 22px; font-weight: 700; color: #2563eb; }
    .bk-stats .bk-lbl { font-size: 13px; color: #64748b; margin-top: 2px; }
    .bk-stats li.bk-off .bk-num { color: #cbd5e1; }
    .bk-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .bk-btn { padding: 10px 18px; border: 1px solid #2563eb; background: #2563eb; color: #fff;
      border-radius: 8px; cursor: pointer; font-size: 14px; }
    .bk-btn:hover { background: #1d4ed8; }
    .bk-btn.ghost { background: #fff; color: #2563eb; }
    .bk-btn.ghost:hover { background: #eff6ff; }
    .bk-hint { font-size: 12px; color: #94a3b8; margin-top: 10px; line-height: 1.6; }
    .bk-msg { font-size: 14px; margin-top: 12px; min-height: 20px; }
    .bk-msg.ok { color: #16a34a; }
    .bk-msg.bad { color: #dc2626; }
    .bk-loading { color: #94a3b8; padding: 12px 0; }
  `;
  document.head.appendChild(style);

  const esc = NCE.escapeHtml;

  // 拼下载文件名里的日期 YYYYMMDD
  function dateStamp() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}${m}${day}`;
  }

  // ---------- 数据概览 ----------
  async function renderInfo(box) {
    box.innerHTML = '<div class="bk-loading">加载中…</div>';
    let info;
    try {
      info = await NCE.api('/api/backup/info');
    } catch (e) {
      box.innerHTML = '<div class="bk-msg bad">无法读取数据概览。</div>';
      return;
    }
    const cell = (obj, count, label) => {
      const off = !obj || !obj.exists;
      const num = off ? '—' : count;
      return `<li class="${off ? 'bk-off' : ''}"><div class="bk-num">${esc(String(num))}</div>` +
        `<div class="bk-lbl">${esc(label)}</div></li>`;
    };
    box.innerHTML =
      '<ul class="bk-stats">' +
      cell(info.progress, info.progress && info.progress.attempts, '练习记录数') +
      cell(info.vocab, info.vocab && info.vocab.stars, '收藏词数') +
      cell(info.words, info.words && info.words.states, '单词掌握数') +
      cell(info.srs, info.srs && info.srs.items, '错题复习数') +
      cell(info.plan, info.plan && info.plan.exists ? '已设置' : '—', '学习计划') +
      cell(info.transforms, info.transforms && info.transforms.attempts, '句型转换步数') +
      '</ul>';
  }

  // ---------- 导出 ----------
  async function doExport(msg) {
    msg.className = 'bk-msg';
    msg.textContent = '正在导出…';
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error('导出请求失败');
      const payload = await res.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nce-backup-${dateStamp()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      msg.className = 'bk-msg ok';
      msg.textContent = '✓ 备份已下载。';
    } catch (e) {
      msg.className = 'bk-msg bad';
      msg.textContent = '✗ 导出失败：' + (e.message || e);
    }
  }

  // ---------- 导入 ----------
  function doImport(input, msg, infoBox) {
    const file = input.files && input.files[0];
    input.value = ''; // 允许重复选同一文件
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let obj;
      try {
        obj = JSON.parse(reader.result);
      } catch (e) {
        msg.className = 'bk-msg bad';
        msg.textContent = '✗ 文件不是有效的 JSON，无法解析。';
        return;
      }
      if (!obj || obj.app !== 'nce' || !obj.data) {
        msg.className = 'bk-msg bad';
        msg.textContent = '✗ 这不是本系统的备份文件（缺少 app:"nce"）。';
        return;
      }
      if (!window.confirm('导入会覆盖当前对应数据，确定继续？')) return;
      msg.className = 'bk-msg';
      msg.textContent = '正在导入…';
      try {
        const r = await NCE.api('/api/backup/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(obj),
        });
        if (!r || !r.ok) throw new Error((r && r.error) || '导入失败');
        const list = (r.restored || []).join('、') || '（无）';
        msg.className = 'bk-msg ok';
        msg.textContent = `✓ 已恢复：${list}。页面即将自动刷新以加载最新数据…`;
        renderInfo(infoBox);
        // 页面内存中的学习状态（NCEStore 缓存等）已是旧值，刷新一次全部对齐
        setTimeout(() => location.reload(), 1500);
      } catch (e) {
        msg.className = 'bk-msg bad';
        msg.textContent = '✗ 导入失败：' + (e.message || e);
      }
    };
    reader.onerror = () => {
      msg.className = 'bk-msg bad';
      msg.textContent = '✗ 读取文件失败。';
    };
    reader.readAsText(file);
  }

  // ---------- 入口 ----------
  function onShow(panel) {
    panel.innerHTML =
      '<div class="bk-wrap">' +
      '<div class="bk-intro">把练习记录、收藏词、单词掌握、错题复习、学习计划一次性导出为 JSON 文件保存；' +
      '换设备或重装后再导入即可恢复。</div>' +
      '<div class="bk-card"><h3>📊 当前数据概览</h3><div class="bk-info"></div></div>' +
      '<div class="bk-card"><h3>💾 备份与恢复</h3>' +
      '<div class="bk-actions">' +
      '<button class="bk-btn" data-a="export">导出备份</button>' +
      '<button class="bk-btn ghost" data-a="import">导入备份</button>' +
      '<input type="file" class="bk-file" accept="application/json,.json" hidden>' +
      '</div>' +
      '<div class="bk-hint">导出：下载一个 nce-backup-日期.json 文件。<br>' +
      '导入：选择之前导出的文件，会覆盖当前对应数据。</div>' +
      '<div class="bk-msg"></div>' +
      '</div>' +
      '</div>';

    const infoBox = panel.querySelector('.bk-info');
    const msg = panel.querySelector('.bk-msg');
    const fileInput = panel.querySelector('.bk-file');

    panel.querySelector('[data-a="export"]').onclick = () => doExport(msg);
    panel.querySelector('[data-a="import"]').onclick = () => fileInput.click();
    fileInput.onchange = () => doImport(fileInput, msg, infoBox);

    renderInfo(infoBox);
  }

  NCE.registerFeature({ id: 'backup', label: '数据备份', icon: '💾', onShow });
})();
