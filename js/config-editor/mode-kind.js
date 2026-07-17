/* 玩法種類常數與新增模式彈窗純邏輯（可 Node 測試） */
(function () {
  'use strict';
  const SP = (window.SlotPlanner = window.SlotPlanner || {});
  const CE = (SP.ConfigEditor = SP.ConfigEditor || {});

  const MODE_KIND_OPTIONS = [
    { v: 'SPIN',       label: 'SPIN' },
    { v: 'WHEEL',      label: '輪盤' },
    { v: 'PICK',       label: '點點樂' },
    { v: 'COLLECTION', label: '收集' },
    { v: 'OTHER',      label: '其他' },
  ];
  const MODE_KIND_LABEL = Object.fromEntries(MODE_KIND_OPTIONS.map(o => [o.v, o.label]));
  const BONUS_KINDS = { WHEEL: 1, PICK: 1, COLLECTION: 1 };

  function isBonusKind(m) {
    return !!(m && BONUS_KINDS[m.mode_kind]);
  }

  function modeAddCanConfirm(dlg) {
    const name = String((dlg && dlg.name) || '').trim();
    if (!name || (dlg && dlg.nameTaken)) return false;
    if ((dlg && dlg.kind) === 'OTHER' && !String((dlg && dlg.otherText) || '').trim()) return false;
    return true;
  }

  function applyModeAddKind(m, kind, otherText) {
    m.mode_kind = kind;
    if (kind === 'OTHER') m.notes = String(otherText || '').trim();
    return m;
  }

  CE.ModeKind = {
    MODE_KIND_OPTIONS,
    MODE_KIND_LABEL,
    isBonusKind,
    modeAddCanConfirm,
    applyModeAddKind,
  };
})();
