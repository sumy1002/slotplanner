// ============================================================
//  config-editor/index.js — A 設定檔編輯器 · 組裝點
//
//  v3.4 起的 4 檔架構:
//    helpers.js   → SP.ConfigEditor.Helpers     (純資料 + 常數 + LS I/O)
//    template.js  → SP.ConfigEditor.TEMPLATE    (Vue template 字串)
//    setup.js     → SP.ConfigEditor.setup       (Vue setup function)
//    index.js     → SP.ConfigPage               (組裝成 Vue component)
//
//  載入順序由 app.html 保證:helpers → template → setup → index
//
//  原始 12,331 行單檔已拆為:
//    helpers ~2000 / template ~4400 / setup ~6000 / index ~50
//
//  外部依然透過 window.SlotPlanner.ConfigPage 取用,使用方完全無感。
// ============================================================
(function () {
  'use strict';

  window.SlotPlanner = window.SlotPlanner || {};
  const SP = window.SlotPlanner;

  // 防呆:三個 sub-module 必須都已載入
  if (!SP.ConfigEditor || !SP.ConfigEditor.Helpers) {
    console.error('[config-editor/index] helpers.js not loaded — check script order');
    return;
  }
  if (typeof SP.ConfigEditor.TEMPLATE !== 'string') {
    console.error('[config-editor/index] template.js not loaded — check script order');
    return;
  }
  if (typeof SP.ConfigEditor.setup !== 'function') {
    console.error('[config-editor/index] setup.js not loaded — check script order');
    return;
  }

  // 組裝 Vue component
  SP.ConfigPage = {
    emits: ['status'],
    template: SP.ConfigEditor.TEMPLATE,
    setup: SP.ConfigEditor.setup,
  };

  console.log('[config-editor] ConfigPage loaded (4-file build)');

})();
