/* 模式玩法設定區段 registry（精靈第 2 步／卡片共用） */
(function () {
  'use strict';
  const SP = (window.SlotPlanner = window.SlotPlanner || {});
  const CE = (SP.ConfigEditor = SP.ConfigEditor || {});

  const ALL = '*';
  const MODE_SETTING_SECTIONS = [
    { id: 'pay_type', label: '賠付模型覆寫', kinds: ['SPIN', 'OTHER'], defaultFor: ['SPIN'],
      fields: ['pay_type_override'] },
    { id: 'multipliers', label: '倍數／封頂', kinds: ['SPIN', 'OTHER'], defaultFor: [],
      fields: ['reset_scope', 'stack_mode', 'cap_enabled', 'cap_value'] },
    { id: 'choice_group', label: '玩家擇一', kinds: [ALL], defaultFor: [],
      fields: ['choice_group'] },
    { id: 'hold_win', label: '鎖點重轉 Hold&Win', kinds: [ALL], defaultFor: ['COLLECTION'],
      fields: ['respin_base', 'respin_reset_on', 'respin_stop_cond'] },
    { id: 'collect', label: 'Hold&Win 收集設定', kinds: [ALL], defaultFor: ['COLLECTION'],
      fields: ['collect_enabled', 'respin_reset_symbol', 'grid_expand_in_collect', 'allow_persistent'] },
    { id: 'cascade', label: '消除連鎖', kinds: ['SPIN', 'OTHER'], defaultFor: [],
      fields: ['cascade_enabled', 'cascade_max_depth'] },
    { id: 'mult_compose', label: '倍數複合覆寫', kinds: ['SPIN', 'OTHER'], defaultFor: [],
      fields: ['mult_compose_override'] },
    { id: 'refill_track', label: '補盤路徑覆寫', kinds: ['SPIN', 'OTHER'], defaultFor: [],
      fields: ['refill_track_override'] },
    { id: 'wheel', label: '輪盤設定', kinds: ['WHEEL'], defaultFor: ['WHEEL'],
      fields: ['wheel_upgrade_to'] },
    { id: 'pick', label: '點點樂設定', kinds: ['PICK'], defaultFor: ['PICK'],
      fields: ['pick_count'] },
    { id: 'collect_target', label: '收集目標', kinds: ['COLLECTION'], defaultFor: ['COLLECTION'],
      fields: ['collect_target'] },
    { id: 'bonus_items', label: '獎項／分段／獎勵', kinds: ['WHEEL', 'PICK', 'COLLECTION'],
      defaultFor: ['WHEEL', 'PICK', 'COLLECTION'], fields: ['items'] },
  ];

  function kindMatch(kinds, kind) {
    return kinds.indexOf(ALL) >= 0 || kinds.indexOf(kind) >= 0;
  }

  function sectionsForKind(kind) {
    const k = kind || 'SPIN';
    return MODE_SETTING_SECTIONS.filter(s => kindMatch(s.kinds, k));
  }

  function defaultEnabledSections(kind) {
    const k = kind || 'SPIN';
    return sectionsForKind(k).filter(s => s.defaultFor.indexOf(k) >= 0).map(s => s.id);
  }

  function resolveEnabledSections(m) {
    if (m && Array.isArray(m.enabled_sections)) return m.enabled_sections.slice();
    return sectionsForKind(m && m.mode_kind).map(s => s.id);
  }

  function materializeEnabledSections(m) {
    if (!m) return [];
    if (!Array.isArray(m.enabled_sections)) {
      m.enabled_sections = resolveEnabledSections(m);
    }
    return m.enabled_sections;
  }

  CE.ModeSections = {
    MODE_SETTING_SECTIONS,
    sectionsForKind,
    defaultEnabledSections,
    resolveEnabledSections,
    materializeEnabledSections,
  };
})();
