// 範本管理 UI 純函式（供 Node 測試與 Esc 關閉優先序）
(function () {
  'use strict';
  const SP = (window.SlotPlanner = window.SlotPlanner || {});
  const CE = (SP.ConfigEditor = SP.ConfigEditor || {});

  /** 一次只關一層：預覽 → 差異 modal → 範本面板 */
  function resolveTemplateEsc(state) {
    const s = {
      showTemplatePanel: !!state.showTemplatePanel,
      diffOpen: !!state.diffOpen,
      tplLoadPreviewOpen: !!state.tplLoadPreviewOpen,
    };
    if (!s.showTemplatePanel) return s;
    if (s.tplLoadPreviewOpen) return { ...s, tplLoadPreviewOpen: false };
    if (s.diffOpen) return { ...s, diffOpen: false };
    return { ...s, showTemplatePanel: false };
  }

  CE.TemplateUi = { resolveTemplateEsc };
})();
