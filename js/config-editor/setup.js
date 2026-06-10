// ============================================================
//  config-editor/setup.js — A 設定檔編輯器 · Vue setup function
//
//  從原 config-editor.js 拆出(v3.4 起的 4 檔架構)
//
//  ⚠ 此檔依賴 helpers.js 已先載入(讀取 SP.ConfigEditor.Helpers)
//
//  掛載點:window.SlotPlanner.ConfigEditor.setup
//  index.js 會把它組裝進 SP.ConfigPage.setup
// ============================================================
(function () {
  'use strict';

  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.ConfigEditor = window.SlotPlanner.ConfigEditor || {};
  const SP = window.SlotPlanner;

  const { ref, reactive, computed, watch, onMounted, onUnmounted, inject } = Vue;

  // 從 helpers.js 解構出全部常數與函式,讓下面 setup 內部不必每次寫 H.xxx
  const H = SP.ConfigEditor.Helpers;
  const {
    TAB_GROUPS, TABS, TABS_BY_GROUP, PAY_TYPES,
    WAYS_DIRS, DEFAULT_GLOBAL, LS_GLOBAL_KEY, LS_MODES_KEY,
    LS_BASELINE_KEY, BASELINE_KEYS, captureBaselineSnapshot, saveBaseline,
    loadBaseline, ensureBaseline, _safeParse, _diffObject,
    _diffArrayById, _diffWeightsMap, computeChangesFromBaseline, computeChangesBetweenSnapshots,
    _TPL_SHORT_TO_LS, _templateDataGetter, computeChangesBetweenTemplates, _computeChangesBetween,
    _fmtVal, _formatWeightsChanges, loadGlobal, saveGlobal,
    makeMode, DEFAULT_MODES, loadModes, saveModes,
    LS_LAYOUT_KEY, makeReel, DEFAULT_LAYOUT, loadLayout,
    saveLayout, LS_BINS_KEY, DEFAULT_BINS, DEFAULT_BIN_EDGES,
    loadBins, saveBins, parseBinEdges, LS_PAYLINES_KEY,
    PAYLINE_DIRECTIONS, makePayline, DEFAULT_PAYLINES, loadPaylines,
    savePaylines, parsePathString, validatePayline, LS_CONSTRAINTS_KEY,
    CONSTRAINT_TYPES, makeConstraint, DEFAULT_CONSTRAINTS, loadConstraints,
    saveConstraints, LS_REELW_KEY, loadReelWeights, saveReelWeights,
    LS_GRIDW_KEY, DEFAULT_GRID_SIZES, loadGridWeights, saveGridWeights,
    parseGridSizes, LS_COMBO_KEY, loadComboWeights, saveComboWeights,
    LS_DISCARD_KEY, DISCARD_KINDS, makeDiscard, DEFAULT_DISCARDS,
    loadDiscards, saveDiscards, LS_RULES_KEY, TRIGGER_CATALOG,
    TRIGGER_TYPES, TRIGGER_BY_TYPE, OP_TYPES, OP_IS_LIST,
    VAR_CATEGORIES, VAR_CATEGORY_MAP, makeAction, makeRule,
    DEFAULT_RULES, loadRules, deepCopyRule, migrateRuleSchema,
    MIGRATE_TRIGGER_MAP, PRESET_LIBRARY, saveRules, parseCondition,
    buildCondition, evalCondition, evalRow, ACTION_CATALOG,
    ACTION_BY_TYPE, encodeActionValue, encodeAction, buildActionsDSL,
    parseActionsDSL, parseActionParamsDSL, parseActionValue, splitTopLevel,
    indexOfTopLevel, parseActionParams, buildActionParams, composeConditionWithModeScope,
    extractModeScope, asStr, asNum, asBool,
    LAYOUT_CELL_SIZE, LAYOUT_CELL_GAP, LAYOUT_SUBREEL_GAP, LAYOUT_LABEL_HEIGHT,  } = H;

  // ──────────────────────────────────────────────────────────
  //  setup function — 原 config-editor.js 內 setup(props, { emit }) 的內容
  // ──────────────────────────────────────────────────────────
  SP.ConfigEditor.setup = function (props, { emit }) {
      const active   = ref('global');
      const g        = reactive(loadGlobal());

      // ──────────────────────────────────────────────────────────
      //  v3.4 / C12:暗色模式
      //  - 寫入 LS,並透過 document.documentElement.dataset.theme 觸發 CSS 變數覆寫
      //  - 三段:'auto' (跟系統)/ 'light' / 'dark'
      // ──────────────────────────────────────────────────────────
      const LS_THEME_KEY = 'slotplanner.uiTheme.v1';
      const themeMode = ref(localStorage.getItem(LS_THEME_KEY) || 'auto');
      function _applyTheme(mode) {
        // 解析最終要套用的 data-theme:auto 看系統
        let effective = mode;
        if (mode === 'auto') {
          const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
          effective = (mq && mq.matches) ? 'dark' : 'light';
        }
        document.documentElement.dataset.theme = effective;
      }
      function setThemeMode(mode) {
        themeMode.value = mode;
        try { localStorage.setItem(LS_THEME_KEY, mode); } catch (e) {}
        _applyTheme(mode);
      }
      function cycleThemeMode() {
        const order = ['auto', 'light', 'dark'];
        const idx = order.indexOf(themeMode.value);
        setThemeMode(order[(idx + 1) % order.length]);
      }
      const themeModeIcon = computed(() => ({
        'auto':  '◐',
        'light': '☀',
        'dark':  '☾',
      })[themeMode.value] || '◐');
      const themeModeLabel = computed(() => ({
        'auto':  '跟隨系統',
        'light': '亮色',
        'dark':  '暗色',
      })[themeMode.value] || '?');

      // 監聽系統色彩偏好變化(only when in auto mode)
      function _setupThemeWatcher() {
        if (!window.matchMedia) return;
        try {
          const mq = window.matchMedia('(prefers-color-scheme: dark)');
          const handler = () => { if (themeMode.value === 'auto') _applyTheme('auto'); };
          if (mq.addEventListener) mq.addEventListener('change', handler);
          else mq.addListener(handler);
        } catch (e) {}
      }

      // ──────────────────────────────────────────────────────────
      //  v3.4 / B6:範本載入 diff preview
      // ──────────────────────────────────────────────────────────
      const tplLoadPreviewOpen = ref(false);
      const tplLoadPreviewData = ref(null);    // { slug, name, description, counts, currentCounts, diff }
      function _computeCurrentCounts() {
        // 從 LS 直接讀(避免依賴 reactive 變數順序)
        const counts = {
          modes: 0, layout: 0, paylines: 0, constraints: 0,
          rules: 0, discards: 0, symbols: 0,
        };
        try {
          const m = JSON.parse(localStorage.getItem('slotplanner.aconfig.modes.v1') || '[]');
          counts.modes = Array.isArray(m) ? m.length : 0;
          const l = JSON.parse(localStorage.getItem('slotplanner.aconfig.layout.v1') || '[]');
          counts.layout = Array.isArray(l) ? l.length : 0;
          const p = JSON.parse(localStorage.getItem('slotplanner.aconfig.paylines.v1') || '[]');
          counts.paylines = Array.isArray(p) ? p.length : 0;
          const c = JSON.parse(localStorage.getItem('slotplanner.aconfig.constraints.v1') || '[]');
          counts.constraints = Array.isArray(c) ? c.length : 0;
          const r = JSON.parse(localStorage.getItem('slotplanner.aconfig.rules.v1') || '[]');
          counts.rules = Array.isArray(r) ? r.length : 0;
          const d = JSON.parse(localStorage.getItem('slotplanner.aconfig.discards.v1') || '[]');
          counts.discards = Array.isArray(d) ? d.length : 0;
          const reg = JSON.parse(localStorage.getItem('slotplanner.registry.v1') || 'null');
          counts.symbols = reg && Array.isArray(reg.symbols) ? reg.symbols.length : 0;
        } catch (e) {}
        return counts;
      }
      function showTemplateDiff(t) {
        // t 是 templates list 裡的 meta
        const current = _computeCurrentCounts();
        const target = t.counts || {};
        const fields = [
          { key: 'modes', label: '模式', icon: '🎯' },
          { key: 'layout', label: 'Reel 數', icon: '🎰' },
          { key: 'symbols', label: '符號', icon: '🎨' },
          { key: 'paylines', label: '中獎線', icon: '➰' },
          { key: 'constraints', label: '硬約束', icon: '🚫' },
          { key: 'rules', label: '拼圖規則', icon: '🧩' },
          { key: 'discards', label: '棄牌規則', icon: '🗑' },
        ];
        const diff = fields.map(f => ({
          ...f,
          before: current[f.key] || 0,
          after: target[f.key] || 0,
          delta: (target[f.key] || 0) - (current[f.key] || 0),
        }));
        tplLoadPreviewData.value = {
          slug: t.slug,
          name: t.name,
          description: t.description || '',
          modified: t.modified,
          currentCounts: current,
          targetCounts: target,
          diff,
          totalChanges: diff.reduce((s, d) => s + Math.abs(d.delta), 0),
        };
        tplLoadPreviewOpen.value = true;
      }
      function closeTemplateDiff() {
        tplLoadPreviewOpen.value = false;
        tplLoadPreviewData.value = null;
      }

      // ──────────────────────────────────────────────────────────
      //  v3.4 / B5:form-header 內嵌驗證徽章
      //  讓使用者不必上頂部 source bar 就能看到問題,且能跳到對應 tab
      // ──────────────────────────────────────────────────────────
      // 取得當前 active tab 的 issues(只篩屬於這個 tab 的)
      // 注意:validationIssues 在更後面才宣告,所以這裡用 function 封裝
      function activeTabIssues() {
        if (!validationIssues.value) return [];
        return validationIssues.value.filter(i => i.tabId === active.value);
      }

      // ──────────────────────────────────────────────────────
      // ── 方案 A 左右分割：選中的項目索引 ──
      const selectedRuleIdx    = ref(0);
      const selectedDiscardIdx = ref(0);
      const selectedPaylineIdx = ref(0);

      // ── v3.1:09+10 合併後的「規則」tab 共享狀態 ──
      // selectedKind 區分當前左欄選中的是 puzzle (rules) 還是 discard (discards)
      const selectedKind = ref('puzzle');  // 'puzzle' | 'discard'
      // 左欄過濾器:全部 / 拼圖 / HARD / SOFT
      const rulesListFilter = ref('all');  // 'all' | 'puzzle' | 'hard' | 'soft'
      // 新增按鈕的下拉選單開關
      const rulesAddMenuOpen = ref(false);
      // 合併列表(供左欄渲染),含 puzzle + discard,套用 filter
      // 注意:rules 已是 reactive array,modes 已是 reactive — 但 selectedKind / rulesListFilter
      //       是 ref,filter 變動會自動觸發 recomputed
      function _selectItem(kind, idx) {
        selectedKind.value = kind;
        if (kind === 'puzzle') selectedRuleIdx.value = idx;
        else if (kind === 'discard') selectedDiscardIdx.value = idx;
      }
      // 從 add menu 觸發的新增動作
      function addRuleFromMenu(kind) {
        rulesAddMenuOpen.value = false;
        if (kind === 'puzzle') {
          addRule();
          // addRule 已內部設 selectedRuleIdx,這裡只要切 kind
          selectedKind.value = 'puzzle';
        } else if (kind === 'hard' || kind === 'soft') {
          addDiscard();
          // addDiscard 預設 discard_kind = 'HARD',若使用者選 SOFT 就改
          if (kind === 'soft') {
            const d = discards[discards.length - 1];
            if (d) d.discard_kind = 'SOFT';
          }
          selectedKind.value = 'discard';
          selectedDiscardIdx.value = discards.length - 1;
        }
      }
      // 點擊文件其他地方時關閉 add menu
      function _onDocClickForRulesAddMenu(e) {
        if (!rulesAddMenuOpen.value) return;
        const host = e.target.closest && e.target.closest('.cfg-rules-add-host');
        if (!host) rulesAddMenuOpen.value = false;
      }

      // ──────────────────────────────────────────────────────
      //  v3.3:條件 / 動作 / 規則 → 白話翻譯
      //  把 DSL 翻成自然中文,讓非技術人員也能讀懂
      // ──────────────────────────────────────────────────────

      // 變數 → 白話對照表(對齊 VAR_CATEGORIES 但用更口語的詞)
      const VAR_HUMAN = {
        symbol_count:           { label: '符號數量', needsSubkey: true, subkeyPrefix: '' },
        mode:                   { label: '當前模式' },
        combo_step:             { label: '連爆次數' },
        multiplier:             { label: '當前倍數' },
        total_multiplier:       { label: '累積倍數' },
        consecutive_dead_spins: { label: '連續死局數' },
        event:                  { label: '觸發事件名' },
        global:                 { label: '全域變數', needsSubkey: true, subkeyPrefix: 'global.' },
        spin:                   { label: '本局變數', needsSubkey: true, subkeyPrefix: 'spin.' },
        spin_locals:            { label: '本局變數', needsSubkey: true, subkeyPrefix: 'spin.' },
        payload:                { label: '事件資料', needsSubkey: true, subkeyPrefix: 'payload.' },
      };

      // 運算子 → 白話
      const OP_HUMAN = {
        '==':      '等於',
        '!=':      '不等於',
        '>':       '大於',
        '>=':      '≥',
        '<':       '小於',
        '<=':      '≤',
        'in':      '屬於',
        'not_in':  '不屬於',
        'contains':'包含',
      };

      // 把 condition DSL 翻成白話
      // 'symbol_count.SCAT >= 3 AND mode == FG1' → '符號 SCAT 數量 ≥ 3,並且 當前模式 等於 FG1'
      function humanizeCondition(str) {
        if (!str || !String(str).trim()) return '(無條件,直接觸發)';
        const parsed = parseCondition(str);
        if (!parsed.ok) return null;  // 解析失敗 → UI 自己決定要不要顯示
        if (parsed.rows.length === 0) return '(無條件,直接觸發)';
        let out = '';
        for (let i = 0; i < parsed.rows.length; i++) {
          const r = parsed.rows[i];
          const meta = VAR_HUMAN[r.category];
          let varDesc;
          if (!meta) {
            varDesc = r.subkey ? `${r.category}.${r.subkey}` : r.category;
          } else if (meta.needsSubkey) {
            varDesc = r.subkey ? `${meta.label} ${meta.subkeyPrefix || ''}${r.subkey}` : meta.label;
          } else {
            varDesc = meta.label;
          }
          const op = OP_HUMAN[r.op] || r.op;
          const val = (r.value == null || r.value === '') ? '?' : r.value;
          const seg = `${varDesc} ${op} ${val}`;
          if (i === 0) {
            out = seg;
          } else {
            const joiner = (r.combinator || 'AND').toUpperCase() === 'OR' ? ',或者 ' : ',並且 ';
            out = out + joiner + seg;
          }
        }
        return out;
      }

      // 把單一 action 翻成白話
      function humanizeAction(action) {
        if (!action || !action.atype) return '(未設定動作)';
        const meta = ACTION_BY_TYPE[action.atype];
        const p = action.params || {};
        const fb = meta ? meta.label : action.atype;
        switch (action.atype) {
          case 'ADJUST_MULTIPLIER': {
            const op = { add: '加上', sub: '減去', mul: '乘以', set: '設為' }[p.op] || p.op || '?';
            return `將當前倍數 ${op} ${p.value ?? '?'}`;
          }
          case 'UPDATE_GLOBAL': {
            const op = { add: '加上', sub: '減去', mul: '乘以', set: '設為' }[p.op] || p.op || '?';
            return `全域變數 ${p.var || '?'} ${op} ${p.value ?? '?'}`;
          }
          case 'UPDATE_LOCAL': {
            const op = { add: '加上', sub: '減去', mul: '乘以', set: '設為' }[p.op] || p.op || '?';
            return `本局變數 ${p.var || '?'} ${op} ${p.value ?? '?'}`;
          }
          case 'EMIT_EVENT':
            return `廣播事件「${p.name || '?'}」` + (p.payload ? `(附資料)` : '');
          case 'SWITCH_MODE':
            return `切換到「${p.target || '?'}」模式` + (p.inherit_globals ? '(繼承 globals)' : '');
          case 'AWARD_FREE_SPIN':
            return `給 ${p.count ?? '?'} 局免費 spin` + (p.mode ? `(${p.mode} 模式)` : '');
          case 'HALT_RESOLUTION':
            return '立即中斷本 trigger 後續所有規則';
          case 'BOARD_FILL':
            return `在盤面填補「${p.symbol_id || '?'}」` + (p.positions ? `到 ${p.positions}` : '到所有空格');
          case 'BOARD_TRANSFORM':
            return `把盤面上的「${p.from_symbol || '?'}」全部轉成「${p.to_symbol || '?'}」`;
          case 'BOARD_DESTROY':
            return p.symbol_id ? `銷毀盤面上所有「${p.symbol_id}」` : `銷毀位置 ${p.positions || '?'}`;
          case 'MOVE':
            return `把 ${p.from || '?'} 的符號移到 ${p.to || '?'}`;
          case 'SWAP':
            return `交換 ${p.a || '?'} 與 ${p.b || '?'} 的符號`;
          case 'STICKY':
            return `黏著 ${p.positions || '所有中獎符號'} ${p.duration ?? '?'} 局`;
          case 'LOCK_REEL':
            return `鎖定 reel ${p.reel ?? '?'} 不重抽,持續 ${p.duration ?? '?'} 局`;
          default:
            return fb;
        }
      }

      // 把整條規則翻成一段白話描述
      //   '當 ON_COMBO_END 時,如果 連爆次數 ≥ 6,則 廣播事件「mega_combo」'
      function humanizeRule(rule) {
        if (!rule) return '';
        const trig = TRIGGER_BY_TYPE[rule.trigger];
        const trigLabel = trig ? trig.label.replace(/^[\u{1F000}-\u{1FFFF}]\s*/u, '') : (rule.trigger || '?');
        const condStr = humanizeCondition(rule.condition || '');
        // 動作摘要(只取前 2 個,多的省略)
        const actions = (rule.actions || []).filter(a => a && a.atype);
        let actDesc;
        if (actions.length === 0) {
          actDesc = '(未設定動作)';
        } else if (actions.length === 1) {
          actDesc = humanizeAction(actions[0]);
        } else if (actions.length === 2) {
          actDesc = `${humanizeAction(actions[0])},然後 ${humanizeAction(actions[1])}`;
        } else {
          actDesc = `${humanizeAction(actions[0])},然後 ${humanizeAction(actions[1])}(還有 ${actions.length - 2} 個動作)`;
        }
        const scope = (rule.mode_scope && rule.mode_scope !== 'ALL') ? `(僅限 ${rule.mode_scope} 模式)` : '';
        if (condStr === null) {
          return `當 ${trigLabel} 時${scope},則 ${actDesc}`;
        }
        if (condStr === '(無條件,直接觸發)') {
          return `當 ${trigLabel} 時${scope},則 ${actDesc}`;
        }
        return `當 ${trigLabel} 時${scope},若 ${condStr},則 ${actDesc}`;
      }

      // 棄牌規則的白話翻譯
      function humanizeDiscard(d) {
        if (!d) return '';
        const condStr = humanizeCondition(d.condition || '');
        const scope = (d.mode_scope && d.mode_scope !== 'ALL') ? `(僅限 ${d.mode_scope} 模式)` : '';
        const kind = d.discard_kind === 'HARD' ? '硬棄牌(整局排除統計)'
                   : d.discard_kind === 'SOFT' ? '軟棄牌(仍計入但單獨追蹤)'
                   : '棄牌';
        if (!condStr || condStr === '(無條件,直接觸發)') {
          return `${kind}${scope}:此規則無條件 — 請補上條件`;
        }
        if (condStr === null) {
          return `${kind}${scope}(條件格式有誤)`;
        }
        return `${scope ? scope + ' ' : ''}若 ${condStr},則 ${kind}`;
      }

      // ──────────────────────────────────────────────────────
      //  v3.3:複製規則 / 複製棄牌
      // ──────────────────────────────────────────────────────
      function _nextRuleId() {
        const taken = new Set(rules.map(r => r.rule_id).filter(Boolean));
        let i = rules.length + 1;
        let id = `P${String(i).padStart(3, '0')}`;
        while (taken.has(id)) { i++; id = `P${String(i).padStart(3, '0')}`; }
        return id;
      }
      function _nextDiscardId() {
        const taken = new Set(discards.map(d => d.discard_id).filter(Boolean));
        let i = discards.length + 1;
        let id = `D${String(i).padStart(3, '0')}`;
        while (taken.has(id)) { i++; id = `D${String(i).padStart(3, '0')}`; }
        return id;
      }

      function duplicateRule(idx) {
        const src = rules[idx];
        if (!src) return;
        const newId = _nextRuleId();
        // 深拷貝(actions / params 不能共享 reference)
        const copy = {
          ...src,
          rule_id: newId,
          // priority + 1 讓副本排在原規則前面(數字大優先)
          priority: (typeof src.priority === 'number' ? src.priority : 100) + 1,
          actions: (src.actions || []).map(a => ({
            atype: a.atype,
            params: { ...(a.params || {}) },
          })),
          emits: [...(src.emits || [])],
          description: src.description ? `${src.description}(複製)` : '(複製)',
        };
        rules.push(copy);
        // builder state 也要建立(否則新規則進去是空白 builder)
        builderRowsMap[newId] = [];
        ruleEditMode[newId] = ruleEditMode[src.rule_id] || 'builder';
        ruleParseError[newId] = null;
        selectedKind.value = 'puzzle';
        selectedRuleIdx.value = rules.length - 1;
        // 避免 filter 隱藏剛建立的規則
        if (rulesListFilter.value === 'hard' || rulesListFilter.value === 'soft') {
          rulesListFilter.value = 'all';
        }
        emit('status', { type: 'ok', msg: `已複製「${src.rule_id}」→「${newId}」` });
      }

      function duplicateDiscard(idx) {
        const src = discards[idx];
        if (!src) return;
        const newId = _nextDiscardId();
        const copy = {
          ...src,
          discard_id: newId,
          notes: src.notes ? `${src.notes}(複製)` : '(複製)',
        };
        discards.push(copy);
        selectedKind.value = 'discard';
        selectedDiscardIdx.value = discards.length - 1;
        if (rulesListFilter.value === 'puzzle') rulesListFilter.value = 'all';
        emit('status', { type: 'ok', msg: `已複製「${src.discard_id}」→「${newId}」` });
      }

      // ──────────────────────────────────────────────────────
      //  #17 規則拖曳排序(09_Puzzle_Rules)
      //  HTML5 drag-and-drop;拖曳重排後可選擇是否自動依新順序重設 priority
      // ──────────────────────────────────────────────────────
      const rulesDragState = reactive({
        draggingIdx: null,         // 正在拖曳的 row index
        dragOverIdx: null,         // 滑鼠當前位於哪個 row 上
        dropPosition: null,        // 'before' | 'after'(插入線位置)
      });
      // 是否在拖曳結束後依新順序自動重設 priority
      const rulesAutoPriority = ref(true);

      function onRuleDragStart(idx, ev) {
        rulesDragState.draggingIdx = idx;
        // 給 dataTransfer 一個 minimum payload,讓 Firefox 也能 drag
        try {
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', String(idx));
        } catch (e) { /* 某些瀏覽器 setData 在 dragstart 外會 throw */ }
      }
      function onRuleDragOver(idx, ev) {
        if (rulesDragState.draggingIdx == null) return;
        if (rulesDragState.draggingIdx === idx) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        // 用游標相對 row 高度的中點決定插入位置
        const rect = ev.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        rulesDragState.dragOverIdx = idx;
        rulesDragState.dropPosition = ev.clientY < midY ? 'before' : 'after';
      }
      function onRuleDragLeave(idx) {
        // 只在離開的剛好是當前 dragOver 的 row 才清(避免在 children 上觸發誤清)
        if (rulesDragState.dragOverIdx === idx) {
          rulesDragState.dragOverIdx = null;
          rulesDragState.dropPosition = null;
        }
      }
      function onRuleDrop(targetIdx, ev) {
        ev.preventDefault();
        const fromIdx = rulesDragState.draggingIdx;
        if (fromIdx == null || fromIdx === targetIdx) {
          _resetRuleDrag();
          return;
        }
        // 算最終插入位置(考慮 before/after)
        let insertAt = targetIdx + (rulesDragState.dropPosition === 'after' ? 1 : 0);
        // 從原位置移除後,如果插入位置在原位置之後,index 要 -1
        if (insertAt > fromIdx) insertAt--;
        // 執行重排
        const moved = rules.splice(fromIdx, 1)[0];
        rules.splice(insertAt, 0, moved);
        // 維持 selection 跟著移動的 row 走
        if (selectedRuleIdx.value === fromIdx) {
          selectedRuleIdx.value = insertAt;
        } else if (fromIdx < selectedRuleIdx.value && insertAt >= selectedRuleIdx.value) {
          selectedRuleIdx.value--;
        } else if (fromIdx > selectedRuleIdx.value && insertAt <= selectedRuleIdx.value) {
          selectedRuleIdx.value++;
        }
        // 自動重設 priority(從 100 開始,間隔 10,確保現有 priority 為從上往下遞減)
        if (rulesAutoPriority.value) {
          const step = 10;
          const start = Math.max(100, rules.length * step);
          rules.forEach((r, i) => { r.priority = start - i * step; });
        }
        emit('status', {
          type: 'ok',
          msg: `已將「${moved.rule_id || '?'}」移到第 ${insertAt + 1} 位${rulesAutoPriority.value ? '(priority 已自動重設)' : ''}`,
        });
        _resetRuleDrag();
      }
      function onRuleDragEnd() {
        _resetRuleDrag();
      }
      function _resetRuleDrag() {
        rulesDragState.draggingIdx = null;
        rulesDragState.dragOverIdx = null;
        rulesDragState.dropPosition = null;
      }
      // ── 方案 B Sticky 模式選擇:各矩陣頁的當前模式 ──
      const reelActiveMode    = ref('');
      const gridActiveMode    = ref('');
      const comboActiveModeBar = ref('');
      // v3.5 / #16:05 跨模式複製提示
      const LS_GRID_HINT_KEY = 'slotplanner.ui.gridHintDismissed.v1';
      const gridHintDismissed = ref(localStorage.getItem(LS_GRID_HINT_KEY) === '1');
      function dismissGridHint() {
        gridHintDismissed.value = true;
        try { localStorage.setItem(LS_GRID_HINT_KEY, '1'); } catch(_){}
      }
      // 把當前模式的格數權重複製到其他所有模式
      function gridCopyToAllModes(srcMode) {
        if (!srcMode) return;
        const src = gridW(srcMode);
        let n = 0;
        for (const name of modeNames.value) {
          if (name === srcMode) continue;
          ensureGridWeightsForMode(name);
          const dst = gridW(name);
          // 同步 grid_sizes
          dst.grid_sizes = src.grid_sizes.slice();
          dst.weights = {};
          for (const k of Object.keys(src.weights)) dst.weights[k] = src.weights[k];
          n++;
        }
        emit('status', { type: 'ok', msg: `已把「${srcMode}」的格數權重複製到 ${n} 個其他模式` });
      }

      // ──────────────────────────────────────────────────────────
      //  v3.5 / #7:矩陣批次操作 Undo
      //  - 每個 kind 各自一個 stack(reel / grid / combo)
      //  - 每次 push 之前如果已有 10 個 snapshot,丟掉最舊的
      //  - snapshot 內容:完整 weights + symbol_ids/grid_sizes/steps 的深拷貝
      //  - 觸發方式:Ctrl+Z(或 Cmd+Z on Mac)
      // ──────────────────────────────────────────────────────────
      const UNDO_LIMIT = 10;
      const undoStacks = reactive({ reel: [], grid: [], combo: [] });
      // v3.6 / #2:Redo stack(配對 undoStacks)
      //   - 任何新的 _pushUndo 操作會清空 redo(分支動作不能再 redo)
      //   - undoMatrix pop 後把當前狀態 push 到 redo
      //   - redoMatrix pop 後把當前狀態 push 回 undo
      const redoStacks = reactive({ reel: [], grid: [], combo: [] });
      function _snapshotReel(mode) {
        const e = reelW(mode);
        return {
          kind: 'reel', mode,
          symbol_ids: e.symbol_ids.slice(),
          weights: JSON.parse(JSON.stringify(e.weights)),
          label: `reel.${mode}`,
          ts: Date.now(),
        };
      }
      function _snapshotGrid(mode) {
        const e = gridW(mode);
        return {
          kind: 'grid', mode,
          grid_sizes: e.grid_sizes.slice(),
          weights: JSON.parse(JSON.stringify(e.weights)),
          label: `grid.${mode}`,
          ts: Date.now(),
        };
      }
      function _snapshotCombo(mode) {
        const e = comboW(mode);
        return {
          kind: 'combo', mode,
          symbol_ids: e.symbol_ids.slice(),
          steps: e.steps.slice(),
          weights: JSON.parse(JSON.stringify(e.weights)),
          label: `combo.${mode}`,
          ts: Date.now(),
        };
      }
      function _pushUndo(kind, mode) {
        if (!kind || !mode) return;
        // 連鎖呼叫去重:200ms 內、同一 kind/mode 不重複 push
        const stack = undoStacks[kind];
        if (stack && stack.length > 0) {
          const last = stack[stack.length - 1];
          if (last.mode === mode && (Date.now() - last.ts) < 200) return;
        }
        let snap;
        if (kind === 'reel')  snap = _snapshotReel(mode);
        else if (kind === 'grid')  snap = _snapshotGrid(mode);
        else if (kind === 'combo') snap = _snapshotCombo(mode);
        else return;
        undoStacks[kind].push(snap);
        if (undoStacks[kind].length > UNDO_LIMIT) undoStacks[kind].shift();
        // v3.6 / #2:任何新的編輯動作清空 redo stack
        //   redoStacks[kind] 整個清掉,而不是只清 mode 的(避免遺留歧義分支)
        if (redoStacks[kind] && redoStacks[kind].length > 0) {
          redoStacks[kind].splice(0, redoStacks[kind].length);
        }
      }
      // 對範圍 selection 操作前的 snapshot:依 selection scope 決定 push 到哪個 stack
      function _pushUndoForSelection() {
        if (matrixSelection.keys.size === 0) return;
        const first = matrixSelection.keys.values().next().value;
        if (!first) return;
        const [kind, mode] = first.split(':');
        _pushUndo(kind, mode);
      }
      // 哪個 tab 是「當前」,給 Ctrl+Z 用
      function _currentMatrixContext() {
        if (active.value === 'reel_weights') return { kind: 'reel', mode: reelActiveMode.value };
        if (active.value === 'grid_size_weights') return { kind: 'grid', mode: gridActiveMode.value };
        if (active.value === 'combo_weights') return { kind: 'combo', mode: comboActiveModeBar.value };
        return null;
      }
      function undoMatrix() {
        const ctx = _currentMatrixContext();
        if (!ctx || !ctx.mode) return;
        const stack = undoStacks[ctx.kind];
        if (!stack || stack.length === 0) {
          emit('status', { type: 'warn', msg: '沒有可復原的操作' });
          return;
        }
        const snap = stack.pop();
        // v3.6 / #2:undo 前先把當前狀態 snapshot 到 redo
        //   注意:redo snapshot 必須在「pop 之後 + 套用之前」抓
        //   因為 redo 要回到「當前的這個狀態」
        let currentSnap;
        if (snap.kind === 'reel')  currentSnap = _snapshotReel(snap.mode);
        else if (snap.kind === 'grid')  currentSnap = _snapshotGrid(snap.mode);
        else if (snap.kind === 'combo') currentSnap = _snapshotCombo(snap.mode);
        if (currentSnap) {
          redoStacks[snap.kind].push(currentSnap);
          if (redoStacks[snap.kind].length > UNDO_LIMIT) redoStacks[snap.kind].shift();
        }
        // 套用 snapshot
        if (snap.kind === 'reel') {
          const e = reelW(snap.mode);
          e.symbol_ids = snap.symbol_ids.slice();
          e.weights = JSON.parse(JSON.stringify(snap.weights));
        } else if (snap.kind === 'grid') {
          const e = gridW(snap.mode);
          e.grid_sizes = snap.grid_sizes.slice();
          e.weights = JSON.parse(JSON.stringify(snap.weights));
        } else if (snap.kind === 'combo') {
          const e = comboW(snap.mode);
          e.symbol_ids = snap.symbol_ids.slice();
          e.steps = snap.steps.slice();
          e.weights = JSON.parse(JSON.stringify(snap.weights));
        }
        emit('status', { type: 'ok', msg: `已復原 ${snap.label}(剩 ${stack.length} 步可復原)` });
      }
      // v3.6 / #2:Redo(配對 Undo)
      //   - pop redo stack 並套用
      //   - 把當前狀態 push 回 undo
      //   - 觸發:Ctrl+Shift+Z(或 Cmd+Shift+Z)/ Ctrl+Y
      function redoMatrix() {
        const ctx = _currentMatrixContext();
        if (!ctx || !ctx.mode) return;
        const stack = redoStacks[ctx.kind];
        if (!stack || stack.length === 0) {
          emit('status', { type: 'warn', msg: '沒有可重做的操作' });
          return;
        }
        const snap = stack.pop();
        // 把當前狀態 push 回 undo(避免無限 redo 後 undo 失效)
        let currentSnap;
        if (snap.kind === 'reel')  currentSnap = _snapshotReel(snap.mode);
        else if (snap.kind === 'grid')  currentSnap = _snapshotGrid(snap.mode);
        else if (snap.kind === 'combo') currentSnap = _snapshotCombo(snap.mode);
        if (currentSnap) {
          undoStacks[snap.kind].push(currentSnap);
          if (undoStacks[snap.kind].length > UNDO_LIMIT) undoStacks[snap.kind].shift();
        }
        if (snap.kind === 'reel') {
          const e = reelW(snap.mode);
          e.symbol_ids = snap.symbol_ids.slice();
          e.weights = JSON.parse(JSON.stringify(snap.weights));
        } else if (snap.kind === 'grid') {
          const e = gridW(snap.mode);
          e.grid_sizes = snap.grid_sizes.slice();
          e.weights = JSON.parse(JSON.stringify(snap.weights));
        } else if (snap.kind === 'combo') {
          const e = comboW(snap.mode);
          e.symbol_ids = snap.symbol_ids.slice();
          e.steps = snap.steps.slice();
          e.weights = JSON.parse(JSON.stringify(snap.weights));
        }
        emit('status', { type: 'ok', msg: `已重做 ${snap.label}(剩 ${stack.length} 步可重做)` });
      }
      function canUndo(kind, mode) {
        if (!kind || !mode) {
          const ctx = _currentMatrixContext();
          if (!ctx) return false;
          kind = ctx.kind;
          mode = ctx.mode;
        }
        const stack = undoStacks[kind];
        return stack && stack.some(s => s.mode === mode);
      }
      function canRedo(kind, mode) {
        if (!kind || !mode) {
          const ctx = _currentMatrixContext();
          if (!ctx) return false;
          kind = ctx.kind;
          mode = ctx.mode;
        }
        const stack = redoStacks[kind];
        return stack && stack.some(s => s.mode === mode);
      }
      function undoCountForCurrent() {
        const ctx = _currentMatrixContext();
        if (!ctx || !ctx.mode) return 0;
        return (undoStacks[ctx.kind] || []).filter(s => s.mode === ctx.mode).length;
      }
      function redoCountForCurrent() {
        const ctx = _currentMatrixContext();
        if (!ctx || !ctx.mode) return 0;
        return (redoStacks[ctx.kind] || []).filter(s => s.mode === ctx.mode).length;
      }

      // ──────────────────────────────────────────────────────────
      //  v3.5 / #15:矩陣 CSV 匯入 / 匯出
      //  04 / 05 / 08 通用。CSV 格式:
      //    第一列:reel,sid1,sid2,sid3,...
      //    後續列:1,100,50,0,...
      //  08 額外:檔名/開頭加 step= 標記;只匯出/入當前 step
      // ──────────────────────────────────────────────────────────
      function _downloadText(filename, text) {
        try {
          const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        } catch (e) {
          emit('status', { type: 'err', msg: '匯出失敗:' + (e && e.message || e) });
        }
      }
      function _csvEscape(v) {
        const s = String(v == null ? '' : v);
        if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }
      function _csvParse(text) {
        // 簡單 CSV parser:支援 "" escape 與引號內逗號
        const rows = [];
        let row = [], field = '', inQ = false, i = 0;
        const s = text.replace(/^\ufeff/, '');
        while (i < s.length) {
          const c = s[i];
          if (inQ) {
            if (c === '"' && s[i+1] === '"') { field += '"'; i += 2; continue; }
            if (c === '"') { inQ = false; i++; continue; }
            field += c; i++; continue;
          }
          if (c === '"') { inQ = true; i++; continue; }
          if (c === ',') { row.push(field); field = ''; i++; continue; }
          if (c === '\n' || c === '\r') {
            if (c === '\r' && s[i+1] === '\n') i++;
            row.push(field); rows.push(row); row = []; field = ''; i++;
            continue;
          }
          field += c; i++;
        }
        if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
        return rows.filter(r => r.length > 0 && !(r.length === 1 && r[0] === ''));
      }
      function exportReelCSV(mode) {
        const e = reelW(mode);
        const header = ['reel'].concat(e.symbol_ids);
        const lines = [header.map(_csvEscape).join(',')];
        for (let r = 1; r <= layout.length; r++) {
          const row = [r];
          for (const sid of e.symbol_ids) row.push(Number(e.weights[`${r}-${sid}`]) || 0);
          lines.push(row.map(_csvEscape).join(','));
        }
        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        _downloadText(`04_ReelWeights_${mode}_${ts}.csv`, lines.join('\n'));
        emit('status', { type: 'ok', msg: `已匯出「${mode}」的 Reel 權重` });
      }
      function exportGridCSV(mode) {
        const e = gridW(mode);
        const header = ['reel'].concat(e.grid_sizes.map(sz => `${sz}格`));
        const lines = [header.map(_csvEscape).join(',')];
        for (let r = 1; r <= layout.length; r++) {
          const row = [r];
          for (const sz of e.grid_sizes) row.push(Number(e.weights[`${r}-${sz}`]) || 0);
          lines.push(row.map(_csvEscape).join(','));
        }
        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        _downloadText(`05_GridSizeWeights_${mode}_${ts}.csv`, lines.join('\n'));
        emit('status', { type: 'ok', msg: `已匯出「${mode}」的格數權重` });
      }
      function exportComboCSV(mode, step) {
        const e = comboW(mode);
        const header = ['reel'].concat(e.symbol_ids);
        const lines = [`# step=${step}`, header.map(_csvEscape).join(',')];
        for (let r = 1; r <= layout.length; r++) {
          const row = [r];
          for (const sid of e.symbol_ids) row.push(Number(e.weights[`${step}-${r}-${sid}`]) || 0);
          lines.push(row.map(_csvEscape).join(','));
        }
        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        _downloadText(`08_ComboWeights_${mode}_step${step}_${ts}.csv`, lines.join('\n'));
        emit('status', { type: 'ok', msg: `已匯出「${mode}」第 ${step} 爆的連爆權重` });
      }
      // 通用 CSV import
      // kind: 'reel' | 'grid' | 'combo'
      // 觸發方式:hidden file input
      function _pickCSV(callback) {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.csv,text/csv';
        inp.style.display = 'none';
        inp.onchange = (ev) => {
          const f = ev.target.files && ev.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => {
            try { callback(String(reader.result)); }
            catch (e) { emit('status', { type: 'err', msg: 'CSV 匯入失敗:' + (e && e.message || e) }); }
            document.body.removeChild(inp);
          };
          reader.onerror = () => {
            emit('status', { type: 'err', msg: 'CSV 讀取失敗' });
            document.body.removeChild(inp);
          };
          reader.readAsText(f, 'utf-8');
        };
        document.body.appendChild(inp);
        inp.click();
      }
      function importReelCSV(mode) {
        _pickCSV((text) => {
          const rows = _csvParse(text).filter(r => !(r[0] || '').startsWith('#'));
          if (rows.length < 2) { emit('status', { type: 'err', msg: 'CSV 內容不足' }); return; }
          const header = rows[0].slice(1); // 去掉第一格 'reel'
          const e = reelW(mode);
          if (!confirm(`即將以 CSV 內容覆寫「${mode}」的 Reel 權重(${header.length} 個符號 × ${rows.length - 1} 列),確定?`)) return;
          e.symbol_ids = header.slice();
          e.weights = {};
          for (let i = 1; i < rows.length; i++) {
            const r = parseInt(rows[i][0], 10);
            if (!r) continue;
            for (let j = 0; j < header.length; j++) {
              const v = Number(rows[i][j + 1]);
              e.weights[`${r}-${header[j]}`] = isNaN(v) ? 0 : v;
            }
          }
          emit('status', { type: 'ok', msg: `已匯入 Reel 權重(${header.length} 個符號)` });
        });
      }
      function importGridCSV(mode) {
        _pickCSV((text) => {
          const rows = _csvParse(text).filter(r => !(r[0] || '').startsWith('#'));
          if (rows.length < 2) { emit('status', { type: 'err', msg: 'CSV 內容不足' }); return; }
          // 第一列:reel, 3格, 4格, 5格, ... → 取數字
          const header = rows[0].slice(1).map(h => parseInt(String(h).replace(/[^\d]/g, ''), 10)).filter(x => !isNaN(x));
          if (header.length === 0) { emit('status', { type: 'err', msg: 'CSV header 找不到有效格數' }); return; }
          const e = gridW(mode);
          if (!confirm(`即將以 CSV 內容覆寫「${mode}」的格數權重(${header.length} 個格數欄 × ${rows.length - 1} 列),確定?`)) return;
          e.grid_sizes = header.slice();
          e.weights = {};
          for (let i = 1; i < rows.length; i++) {
            const r = parseInt(rows[i][0], 10);
            if (!r) continue;
            for (let j = 0; j < header.length; j++) {
              const v = Number(rows[i][j + 1]);
              e.weights[`${r}-${header[j]}`] = isNaN(v) ? 0 : v;
            }
          }
          emit('status', { type: 'ok', msg: `已匯入格數權重(${header.length} 個格數)` });
        });
      }
      function importComboCSV(mode, step) {
        _pickCSV((text) => {
          const all = _csvParse(text);
          // 偵測 # step= 開頭
          let detectedStep = null;
          const rows = [];
          for (const r of all) {
            const head = (r[0] || '').trim();
            if (head.startsWith('#')) {
              const m = head.match(/step\s*=\s*(\d+)/);
              if (m) detectedStep = parseInt(m[1], 10);
              continue;
            }
            rows.push(r);
          }
          if (rows.length < 2) { emit('status', { type: 'err', msg: 'CSV 內容不足' }); return; }
          const header = rows[0].slice(1);
          const e = comboW(mode);
          const targetStep = detectedStep || step;
          let msg = `即將以 CSV 內容覆寫「${mode}」第 ${targetStep} 爆的權重(${header.length} 個符號 × ${rows.length - 1} 列)。`;
          if (detectedStep && detectedStep !== step) msg += `\n\n⚠ CSV 內標記 step=${detectedStep},與目前選的第 ${step} 爆不同,將寫入第 ${detectedStep} 爆。`;
          msg += '\n\n確定?';
          if (!confirm(msg)) return;
          // 符號清單以 CSV 為主
          e.symbol_ids = header.slice();
          // 確保 step 存在
          if (!e.steps.includes(targetStep)) {
            e.steps.push(targetStep);
            e.steps.sort((a, b) => a - b);
          }
          for (let i = 1; i < rows.length; i++) {
            const r = parseInt(rows[i][0], 10);
            if (!r) continue;
            for (let j = 0; j < header.length; j++) {
              const v = Number(rows[i][j + 1]);
              e.weights[`${targetStep}-${r}-${header[j]}`] = isNaN(v) ? 0 : v;
            }
          }
          emit('status', { type: 'ok', msg: `已匯入第 ${targetStep} 爆權重(${header.length} 個符號)` });
        });
      }
      const dirty    = ref(false);
      // sourceMode:default(未編輯過)/ local(已寫入 localStorage)/ xlsx(從 xlsx 匯入,尚未實作)
      const sourceMode = ref(
        (localStorage.getItem(LS_GLOBAL_KEY)
         || localStorage.getItem(LS_MODES_KEY)
         || localStorage.getItem(LS_LAYOUT_KEY)
         || localStorage.getItem(LS_BINS_KEY)
         || localStorage.getItem(LS_PAYLINES_KEY)
         || localStorage.getItem(LS_CONSTRAINTS_KEY)
         || localStorage.getItem(LS_REELW_KEY)
         || localStorage.getItem(LS_GRIDW_KEY)
         || localStorage.getItem(LS_COMBO_KEY)
         || localStorage.getItem(LS_DISCARD_KEY)
         || localStorage.getItem(LS_RULES_KEY)) ? 'local' : 'default'
      );

      // ── 取得跨頁面共享的 SymbolRegistry ──
      const registry = inject('registry', null);

      // ── 11_Mode_Config 狀態 ──
      const modes = reactive(loadModes());
      const modeNames = computed(() =>
        modes.map(m => (m.mode || '').trim()).filter(n => n.length > 0)
      );
      const duplicateNames = computed(() => {
        const seen = new Set();
        const dup = new Set();
        for (const m of modes) {
          const n = (m.mode || '').trim();
          if (!n) continue;
          if (seen.has(n)) dup.add(n);
          seen.add(n);
        }
        return dup;
      });
      const modesDebugJson = computed(() => JSON.stringify(modes, null, 2));

      // ── 方案 B：sticky 模式選擇欄自動初始化 ──
      watch(modeNames, (names) => {
        if (names.length > 0) {
          if (!names.includes(reelActiveMode.value))    reelActiveMode.value    = names[0];
          if (!names.includes(gridActiveMode.value))    gridActiveMode.value    = names[0];
          if (!names.includes(comboActiveModeBar.value)) comboActiveModeBar.value = names[0];
        }
      }, { immediate: true });

      // 模式卡片穩定 key:用 WeakMap 給每個 mode 物件 session 內穩定 id。
      // 不寫 LS、不進 A.xlsx 契約(僅供 Vue :key)。修正以陣列索引當 key 時,
      // 刪除/重排中間模式造成的輸入框狀態錯位。
      const _modeCardKeyMap = new WeakMap();
      let _modeCardKeySeq = 0;
      function modeCardKey(m) {
        if (!m || typeof m !== 'object') return 'm?';
        let k = _modeCardKeyMap.get(m);
        if (!k) { k = 'm' + (++_modeCardKeySeq); _modeCardKeyMap.set(m, k); }
        return k;
      }

      function addMode() {
        // 自動產生不衝突的新名稱
        const taken = new Set(modes.map(m => m.mode));
        let base = 'MODE';
        let i = 1;
        while (taken.has(`${base}${i}`)) i++;
        modes.push(makeMode(`${base}${i}`));
        emit('status', { type: 'ok', msg: `已新增模式 ${base}${i}` });
        // 流程優化:捲動到新卡片並聚焦名稱欄(找不到則 no-op,不影響功能)
        Vue.nextTick(() => {
          try {
            const cards = document.querySelectorAll('.cfg-mode-card');
            const last = cards[cards.length - 1];
            if (!last) return;
            last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const inp = last.querySelector('.cfg-mode-name-input');
            if (inp) { inp.focus(); inp.select?.(); }
          } catch (e) { /* no-op */ }
        });
      }
      function removeMode(idx) {
        if (modes.length <= 1) return;
        const m = modes[idx];
        if (!confirm(`確定要刪除模式「${m.mode || '(未命名)'}」嗎?`)) return;
        modes.splice(idx, 1);
        emit('status', { type: 'ok', msg: `已刪除模式「${m.mode}」` });
      }

      // ── 02_Layout 狀態 ──
      const layout = reactive(loadLayout());
      const layoutDebugJson = computed(() => JSON.stringify(layout, null, 2));
      // 目前選中的 Reel 索引（0-based）
      const activeReelIdx = ref(0);
      const activeReel = computed(() => layout[activeReelIdx.value] || null);

      // v4.0 / #9:格數權重(每 reel 的列數分佈權重)只有「列高不一致」的盤面
      //   (Megaways 類)才有意義。等高盤(所有 reel max_rows 相同)隱藏該分頁。
      //   註:Batch 5 盤面結構重構後,會改由明確的機制選擇來驅動,此處先以資料判斷。
      const isVariableHeightBoard = computed(() => {
        const rows = layout.map(r => r.max_rows);
        return new Set(rows).size > 1;
      });
      // 渲染用分頁群組:等高盤過濾掉 grid_size_weights
      const visibleTabGroups = computed(() =>
        TABS_BY_GROUP.map(grp => ({
          ...grp,
          tabs: grp.tabs.filter(t => t.id !== 'grid_size_weights' || isVariableHeightBoard.value),
        })).filter(grp => grp.tabs.length > 0)
      );
      // 若目前停在格數權重頁、但盤面變回等高 → 自動切回 Reel 權重,避免停在隱藏頁
      watch(isVariableHeightBoard, (v) => {
        if (!v && active.value === 'grid_size_weights') active.value = 'reel_weights';
      });

      function addReel() {
        const new_id = layout.length + 1;
        layout.push(makeReel(new_id));
        activeReelIdx.value = layout.length - 1;  // 自動跳到新 reel
        emit('status', { type: 'ok', msg: `已新增 Reel #${new_id}` });
      }
      function removeReel(idx) {
        if (layout.length <= 1) return;
        if (!confirm(`確定要刪除 Reel #${layout[idx].reel_id} 嗎?\n後續 reel 會自動重編號。`)) return;
        // 刪除前先記下「目前各位置的 reel_id」順序,供權重 key 重映射
        const oldIds = layout.map(r => r.reel_id);
        layout.splice(idx, 1);
        // 自動重編號,保持 1..N 連續
        layout.forEach((r, i) => { r.reel_id = i + 1; });
        // 倖存 reel 的舊 id(依新順序),用來搬移權重 key,避免資料位移
        const survivingOldIds = oldIds.filter((_, i) => i !== idx);
        _remapReelDimension(survivingOldIds);
        // 選中索引不要超出邊界
        if (activeReelIdx.value >= layout.length) {
          activeReelIdx.value = layout.length - 1;
        }
        emit('status', { type: 'ok', msg: '已刪除 Reel 並自動重編號' });
      }

      // 把所有權重表(reel / grid / combo)的 reel 維度 key 依「舊 id → 新 id」搬移。
      // survivingOldIds[k] = 第 (k+1) 個新 reel_id 對應到的舊 reel_id。
      // 對應不到(= 被刪掉那一格)的 key 直接丟棄,不殘留孤兒鍵。
      function _remapReelDimension(survivingOldIds) {
        const newForOld = {};
        survivingOldIds.forEach((oldId, k) => { newForOld[oldId] = k + 1; });
        // reel / grid:key 格式 `${reel}-${rest}`(rest = sid 或 grid_size)
        for (const table of [reelWeights, gridWeights]) {
          for (const mode in table) {
            const w = table[mode] && table[mode].weights;
            if (!w) continue;
            const nw = {};
            for (const key in w) {
              const dash = key.indexOf('-');
              if (dash < 0) continue;
              const reel = parseInt(key.slice(0, dash), 10);
              const rest = key.slice(dash + 1);
              const nid = newForOld[reel];
              if (nid !== undefined) nw[`${nid}-${rest}`] = w[key];
            }
            table[mode].weights = nw;
          }
        }
        // combo:key 格式 `${step}-${reel}-${rest}`
        for (const mode in comboWeights) {
          const w = comboWeights[mode] && comboWeights[mode].weights;
          if (!w) continue;
          const nw = {};
          for (const key in w) {
            const parts = key.split('-');
            if (parts.length < 3) continue;
            const step = parts[0];
            const reel = parseInt(parts[1], 10);
            const rest = parts.slice(2).join('-');
            const nid = newForOld[reel];
            if (nid !== undefined) nw[`${step}-${nid}-${rest}`] = w[key];
          }
          comboWeights[mode].weights = nw;
        }
      }

      // ──────────────────────────────────────────────────────────
      //  v4.0 / #11:拖曳互換兩個 Reel
      //  reel_id 維持 1..N 連續(後端硬性要求),所以「互換」= 交換兩個
      //  位置上的所有屬性 + 交換對應的權重欄(reel/grid),讓整支 reel 連同
      //  列高、副輪、權重一起搬過去。
      // ──────────────────────────────────────────────────────────
      const _dragReelIdx = ref(-1);
      const _dragOverIdx = ref(-1);
      function _swapReelWeightKeys(ra, rb) {
        for (const table of [reelWeights, gridWeights]) {
          for (const mode in table) {
            const w = table[mode] && table[mode].weights;
            if (!w) continue;
            const nw = {};
            for (const key in w) {
              const dash = key.indexOf('-');
              if (dash < 0) { nw[key] = w[key]; continue; }
              const reel = parseInt(key.slice(0, dash), 10);
              const rest = key.slice(dash + 1);
              if (reel === ra)      nw[`${rb}-${rest}`] = w[key];
              else if (reel === rb) nw[`${ra}-${rest}`] = w[key];
              else                  nw[key] = w[key];
            }
            table[mode].weights = nw;
          }
        }
      }
      function swapReels(fromIdx, toIdx) {
        if (fromIdx === toIdx) return;
        if (fromIdx < 0 || toIdx < 0 || fromIdx >= layout.length || toIdx >= layout.length) return;
        const a = layout[fromIdx], b = layout[toIdx];
        const ridA = a.reel_id, ridB = b.reel_id;
        const attrs = ['y_offset', 'max_rows', 'has_subreel', 'subreel_position', 'subreel_rows', 'subreel_inherit_weight'];
        for (const k of attrs) { const t = a[k]; a[k] = b[k]; b[k] = t; }
        _swapReelWeightKeys(ridA, ridB);
        activeReelIdx.value = toIdx;
        emit('status', { type: 'ok', msg: `已互換 R${ridA} ↔ R${ridB}(含列高/副輪/權重)` });
      }
      function onReelDragStart(idx, ev) {
        _dragReelIdx.value = idx;
        if (ev && ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = 'move';
          try { ev.dataTransfer.setData('text/plain', String(idx)); } catch (e) { /* 某些瀏覽器限制 */ }
        }
      }
      function onReelDragOver(idx) { _dragOverIdx.value = idx; }
      function onReelDragLeave(idx) { if (_dragOverIdx.value === idx) _dragOverIdx.value = -1; }
      function onReelDrop(idx) {
        const from = _dragReelIdx.value;
        if (from >= 0 && from !== idx) swapReels(from, idx);
        _dragReelIdx.value = -1;
        _dragOverIdx.value = -1;
      }
      function onReelDragEnd() { _dragReelIdx.value = -1; _dragOverIdx.value = -1; }

      // ──────────────────────────────────────────────────────────
      //  v3.3 / A4:盤面範本(LAYOUT_PRESETS)
      //  一鍵替換整個 layout — 90% 玩家點進去都是要這幾個常見盤
      // ──────────────────────────────────────────────────────────
      const LAYOUT_PRESETS = [
        { key: 'std-5x3',  icon: '⬛', label: '5×3 標準',
          note: '經典 5 reel 3 row,大部分線上 slot 起手式',
          gen: () => Array.from({length: 5}, (_, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: 3,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: 'std-5x4',  icon: '⬜', label: '5×4 大盤',
          note: '5 reel 4 row,空間更大,常見於 96% RTP 機台',
          gen: () => Array.from({length: 5}, (_, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: 4,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: 'std-6x4',  icon: '▦', label: '6×4 高盤',
          note: '6 reel 4 row,適合 Cluster Pays 或多 Ways 設計',
          gen: () => Array.from({length: 6}, (_, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: 4,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: 'std-3x3',  icon: '◼', label: '3×3 小盤',
          note: '3 reel 3 row,適合復古老虎機風格',
          gen: () => Array.from({length: 3}, (_, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: 3,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: 'diamond',  icon: '◆', label: 'Diamond 鑽石',
          note: '5 reel 不規則高度(3-4-5-4-3),中間最高、兩側收斂',
          gen: () => [
            { reel_id: 1, y_offset:  1, max_rows: 3, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false },
            { reel_id: 2, y_offset:  0, max_rows: 4, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false },
            { reel_id: 3, y_offset: -1, max_rows: 5, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false },
            { reel_id: 4, y_offset:  0, max_rows: 4, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false },
            { reel_id: 5, y_offset:  1, max_rows: 3, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false },
          ] },
        { key: 'megaways', icon: '⥯', label: 'Megaways 2-3-4-5-4-3-2',
          note: '6 reel 變動列高(2/3/4/5/4/3/2),Megaways 經典開法',
          gen: () => [2,3,4,5,4,3,2].map((rows, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: rows,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: 'hold-win', icon: '🔒', label: 'Hold & Win 5×3 + 副 R',
          note: '5×3 主盤 + 第 3 reel 含底部副 reel(1 列),Bonus 機制常用',
          gen: () => [
            { reel_id: 1, y_offset: 0, max_rows: 3, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false },
            { reel_id: 2, y_offset: 0, max_rows: 3, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false },
            { reel_id: 3, y_offset: 0, max_rows: 3, has_subreel: true,  subreel_position: 'BOTTOM', subreel_rows: 1, subreel_inherit_weight: true },
            { reel_id: 4, y_offset: 0, max_rows: 3, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false },
            { reel_id: 5, y_offset: 0, max_rows: 3, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false },
          ] },
      ];

      const layoutPresetMenuOpen = ref(false);
      function toggleLayoutPresetMenu(ev) {
        if (ev) ev.stopPropagation();
        layoutPresetMenuOpen.value = !layoutPresetMenuOpen.value;
      }
      function _onDocClickForLayoutPreset(ev) {
        if (!layoutPresetMenuOpen.value) return;
        const host = ev.target.closest && ev.target.closest('.cfg-layout-preset-host');
        if (!host) layoutPresetMenuOpen.value = false;
      }

      function applyLayoutPreset(key) {
        const preset = LAYOUT_PRESETS.find(p => p.key === key);
        if (!preset) return;
        // 確認(避免誤觸):列出當前 layout 大小 vs 即將套用的範本
        const cur = layout.length;
        const next = preset.gen().length;
        if (cur > 0 && !confirm(
          `套用範本「${preset.label}」會替換整個盤面結構:\n\n` +
          `  當前:${cur} 個 Reel\n` +
          `  套用後:${next} 個 Reel\n\n` +
          `04/05/08 矩陣的權重會保留,但缺少對應的 Reel 行會自動補 0,多餘的會空著。\n\n` +
          `確定要套用嗎?`
        )) return;
        // 替換 layout(用 splice 保 reactivity)
        layout.splice(0, layout.length, ...preset.gen());
        activeReelIdx.value = 0;
        layoutPresetMenuOpen.value = false;
        emit('status', { type: 'ok', msg: `已套用盤面範本「${preset.label}」` });
      }

      // ──────────────────────────────────────────────────────────
      //  v3.3 / A1:07_Constraints 兩欄改造 + 智能輔助
      // ──────────────────────────────────────────────────────────
      // 約束選中索引(預設 0)
      const selectedConstraintIdx = ref(0);

      // 解析 reels_allowed 字串 → 數字陣列(忽略無效)
      function parseReelsAllowed(str) {
        if (!str || !String(str).trim()) return [];
        const out = new Set();
        for (const tok of String(str).split(',')) {
          const n = parseInt(tok.trim(), 10);
          if (Number.isFinite(n) && n >= 1) out.add(n);
        }
        return [...out].sort((a, b) => a - b);
      }
      // 數字陣列 → 字串("2,3,4")
      function reelsToString(arr) {
        return [...new Set(arr)].sort((a, b) => a - b).join(',');
      }
      // toggle 單一 reel 在 c.reels_allowed
      function toggleConstraintReel(c, reelNum) {
        const cur = new Set(parseReelsAllowed(c.reels_allowed));
        if (cur.has(reelNum)) cur.delete(reelNum);
        else cur.add(reelNum);
        c.reels_allowed = reelsToString([...cur]);
      }
      function constraintReelActive(c, reelNum) {
        return parseReelsAllowed(c.reels_allowed).includes(reelNum);
      }

      // 複製約束(類似 duplicateRule)
      function duplicateConstraint(idx) {
        const src = constraints[idx];
        if (!src) return;
        const taken = new Set(constraints.map(c => c.constraint_id).filter(Boolean));
        let i = constraints.length + 1;
        let newId = `C${String(i).padStart(3, '0')}`;
        while (taken.has(newId)) { i++; newId = `C${String(i).padStart(3, '0')}`; }
        constraints.push({ ...src, constraint_id: newId,
                          notes: src.notes ? `${src.notes}(複製)` : '(複製)' });
        selectedConstraintIdx.value = constraints.length - 1;
        emit('status', { type: 'ok', msg: `已複製「${src.constraint_id}」→「${newId}」` });
      }

      // 約束白話翻譯
      function humanizeConstraint(c) {
        if (!c) return '';
        const sid = c.symbol_id || '?';
        const scope = (c.mode_scope && c.mode_scope !== 'ALL') ? `(僅限 ${c.mode_scope} 模式)` : '';
        if (c.ctype === 'REEL_RESTRICT') {
          const reels = parseReelsAllowed(c.reels_allowed);
          if (reels.length === 0) return `${scope}「${sid}」只能出現在(尚未指定 Reel)— 將完全不出現`;
          const reelStr = reels.map(r => `R${r}`).join('、');
          return `${scope}「${sid}」只能出現在 ${reelStr}`;
        }
        if (c.ctype === 'GLOBAL_MAX') {
          return `${scope}全盤上「${sid}」最多 ${c.threshold ?? '?'} 個`;
        }
        if (c.ctype === 'GLOBAL_MIN') {
          return `${scope}全盤上「${sid}」至少 ${c.threshold ?? '?'} 個(否則不接受該盤面)`;
        }
        return c.ctype || '(未設定類型)';
      }

      // 約束狀態:用於列表 item 的徽章顏色 / banner
      //   'ok'        全部有效
      //   'warn'      reels_allowed 空、symbol 為空、threshold 為 0
      //   'err'       constraint_id 為空或重複
      function constraintStatus(c) {
        if (!c.constraint_id || !c.constraint_id.trim()) return { kind: 'err', msg: 'constraint_id 為空' };
        if (constraintDuplicateIds.value.has(c.constraint_id)) return { kind: 'err', msg: `編號「${c.constraint_id}」重複` };
        if (!c.symbol_id || !c.symbol_id.trim()) return { kind: 'warn', msg: '未指定符號' };
        if (c.ctype === 'REEL_RESTRICT') {
          const reels = parseReelsAllowed(c.reels_allowed);
          if (reels.length === 0) return { kind: 'warn', msg: '未勾選任何 Reel(此符號將不出現)' };
        }
        if ((c.ctype === 'GLOBAL_MAX' || c.ctype === 'GLOBAL_MIN')) {
          if (c.threshold == null || c.threshold === '' || isNaN(c.threshold)) {
            return { kind: 'warn', msg: '未指定門檻數量' };
          }
        }
        return { kind: 'ok', msg: '' };
      }

      // 給約束 list item 用的 mini SVG:畫盤面 + 高亮 reels_allowed 的範圍
      //   REEL_RESTRICT:高亮允許的 Reel
      //   GLOBAL_MAX/MIN:每個 Reel 都標一個小數字(threshold)
      function constraintMiniSvg(c) {
        const W = 80, H = 40, pad = 3;
        if (layout.length === 0) return { viewBox: `0 0 ${W} ${H}`, cells: [] };
        const { minTop, maxBot } = layoutMetrics.value;
        const totalH = maxBot - minTop + 1;
        const cellW = (W - pad * 2) / layout.length;
        const cellH = (H - pad * 2) / Math.max(1, totalH);
        const size = Math.max(2, Math.min(cellW, cellH) - 0.5);
        const allowed = c.ctype === 'REEL_RESTRICT' ? new Set(parseReelsAllowed(c.reels_allowed)) : null;
        const cells = [];
        layout.forEach((r, idx) => {
          const reelNum = idx + 1;
          const isAllowed = allowed ? allowed.has(reelNum) : false;
          const isRestrict = c.ctype === 'REEL_RESTRICT';
          for (let i = 0; i < r.max_rows; i++) {
            const row = r.y_offset + i;
            cells.push({
              x: pad + idx * cellW + (cellW - size) / 2,
              y: pad + (row - minTop) * cellH + (cellH - size) / 2,
              w: size, h: size,
              // 三種狀態:'allowed' 紫亮 / 'restricted' 灰暗 / 'neutral' 中性
              state: isRestrict ? (isAllowed ? 'allowed' : 'restricted') : 'neutral',
            });
          }
        });
        return { viewBox: `0 0 ${W} ${H}`, cells };
      }

      // 約束選中後的「適用 Reel」chip 列(REEL_RESTRICT 用)
      function constraintActiveReelChips() {
        return Array.from({length: layout.length}, (_, i) => i + 1);
      }

      // ──────────────────────────────────────────────────────────
      //  v3.3 / A2:矩陣強化(04/05/08)
      //  - 整欄正規化、整欄統一值、複製整欄
      //  - 範圍選擇 + 批次操作
      //  - 整欄 sum 顯示
      // ──────────────────────────────────────────────────────────

      // 整欄 sum(欄 = 某 symbol 在所有 reel 的權重總和)
      function reelTotalForCol(mode, sid) {
        const e = reelW(mode);
        let s = 0;
        for (let r = 1; r <= layout.length; r++) {
          const v = e.weights[`${r}-${sid}`];
          if (typeof v === 'number') s += v;
        }
        return s;
      }
      // 整欄填統一值
      function reelFillColUniform(mode, sid, v = 100) {
        _pushUndo("reel", mode);        const e = reelW(mode);
        for (let r = 1; r <= layout.length; r++) {
          e.weights[`${r}-${sid}`] = v;
        }
        emit('status', { type: 'ok', msg: `「${sid}」整欄已設為 ${v}` });
      }
      // 整欄縮放(*factor),保留比例
      function reelScaleCol(mode, sid, factor) {
        _pushUndo("reel", mode);        if (!factor || factor <= 0) return;
        const e = reelW(mode);
        for (let r = 1; r <= layout.length; r++) {
          const v = e.weights[`${r}-${sid}`];
          if (typeof v === 'number') {
            e.weights[`${r}-${sid}`] = Math.round(v * factor);
          }
        }
        emit('status', { type: 'ok', msg: `「${sid}」整欄已乘以 ${factor}` });
      }
      // 整欄正規化到目標總和(預設 100)
      function reelNormalizeCol(mode, sid, target = 100) {
        _pushUndo("reel", mode);        const cur = reelTotalForCol(mode, sid);
        if (cur === 0) {
          // 平均分配
          const each = Math.floor(target / layout.length);
          for (let r = 1; r <= layout.length; r++) {
            reelW(mode).weights[`${r}-${sid}`] = each;
          }
        } else {
          reelScaleCol(mode, sid, target / cur);
        }
        emit('status', { type: 'ok', msg: `「${sid}」整欄已正規化到 ${target}` });
      }

      // 整欄複製到其他所有欄
      function reelCopyColToAll(mode, from_sid) {
        _pushUndo("reel", mode);        const e = reelW(mode);
        for (const sid of e.symbol_ids) {
          if (sid === from_sid) continue;
          for (let r = 1; r <= layout.length; r++) {
            e.weights[`${r}-${sid}`] = e.weights[`${r}-${from_sid}`] ?? 0;
          }
        }
        emit('status', { type: 'ok', msg: `已把「${from_sid}」複製到所有其他符號欄` });
      }

      // 欄級操作 popover state(類似 reel 級)
      const colMenu = reactive({
        open: false,
        kind: '',       // 'reel'(04)/ 'combo'(08;05 沒有 symbol 欄因此暫不用)
        mode: '',
        sid: '',
      });
      function openColMenu(kind, mode, sid) {
        colMenu.open = !(colMenu.open && colMenu.kind === kind && colMenu.mode === mode && colMenu.sid === sid);
        if (colMenu.open) {
          colMenu.kind = kind;
          colMenu.mode = mode;
          colMenu.sid = sid;
        }
      }
      function closeColMenu() { colMenu.open = false; }
      function _onDocClickForColMenu(ev) {
        if (!colMenu.open) return;
        const host = ev.target.closest && ev.target.closest('.cfg-matrix-col-menu-host');
        if (!host) colMenu.open = false;
      }

      // v3.5 / #5:整列操作 popover(合計欄變可點 chip)
      const rowMenu = reactive({
        open: false,
        kind: '',       // 'reel' / 'grid' / 'combo'
        mode: '',
        reel: 0,
        step: null,     // combo 才用
      });
      function openRowMenu(kind, mode, reel, step) {
        const stp = (step === undefined) ? null : step;
        const same = rowMenu.open && rowMenu.kind === kind && rowMenu.mode === mode
                  && rowMenu.reel === reel && rowMenu.step === stp;
        if (same) { rowMenu.open = false; return; }
        rowMenu.open = true;
        rowMenu.kind = kind;
        rowMenu.mode = mode;
        rowMenu.reel = reel;
        rowMenu.step = stp;
      }
      function closeRowMenu() { rowMenu.open = false; }
      function _onDocClickForRowMenu(ev) {
        if (!rowMenu.open) return;
        const host = ev.target.closest && ev.target.closest('.cfg-matrix-row-menu-host');
        if (!host) rowMenu.open = false;
      }

      // v3.5 / #13:08 跨爆階段「複製到…」popover
      const stepCopyMenu = reactive({ open: false });
      function toggleStepCopyMenu() { stepCopyMenu.open = !stepCopyMenu.open; }
      function closeStepCopyMenu() { stepCopyMenu.open = false; }
      function _onDocClickForStepCopy(ev) {
        if (!stepCopyMenu.open) return;
        const host = ev.target.closest && ev.target.closest('.cfg-combo-step-copy-host');
        if (!host) stepCopyMenu.open = false;
      }
      // 整列正規化:把該列總和縮放到目標值
      function reelNormalizeRow(mode, reel, target = 100) {
        _pushUndo("reel", mode);        const e = reelW(mode);
        let s = 0;
        for (const sid of e.symbol_ids) s += Number(e.weights[`${reel}-${sid}`]) || 0;
        if (s === 0) {
          const each = Math.floor(target / Math.max(1, e.symbol_ids.length));
          for (const sid of e.symbol_ids) e.weights[`${reel}-${sid}`] = each;
        } else {
          const f = target / s;
          for (const sid of e.symbol_ids) {
            const v = Number(e.weights[`${reel}-${sid}`]) || 0;
            e.weights[`${reel}-${sid}`] = Math.round(v * f);
          }
        }
        emit('status', { type: 'ok', msg: `R${reel} 整列已正規化到 ${target}` });
      }
      function gridNormalizeRow(mode, reel, target = 100) {
        _pushUndo("grid", mode);        const e = gridW(mode);
        let s = 0;
        for (const sz of e.grid_sizes) s += Number(e.weights[`${reel}-${sz}`]) || 0;
        if (s === 0) {
          const each = Math.floor(target / Math.max(1, e.grid_sizes.length));
          for (const sz of e.grid_sizes) e.weights[`${reel}-${sz}`] = each;
        } else {
          const f = target / s;
          for (const sz of e.grid_sizes) {
            const v = Number(e.weights[`${reel}-${sz}`]) || 0;
            e.weights[`${reel}-${sz}`] = Math.round(v * f);
          }
        }
        emit('status', { type: 'ok', msg: `R${reel} 整列已正規化到 ${target}` });
      }
      function comboNormalizeRow(mode, step, reel, target = 100) {
        _pushUndo("combo", mode);        const e = comboW(mode);
        let s = 0;
        for (const sid of e.symbol_ids) s += Number(e.weights[`${step}-${reel}-${sid}`]) || 0;
        if (s === 0) {
          const each = Math.floor(target / Math.max(1, e.symbol_ids.length));
          for (const sid of e.symbol_ids) e.weights[`${step}-${reel}-${sid}`] = each;
        } else {
          const f = target / s;
          for (const sid of e.symbol_ids) {
            const v = Number(e.weights[`${step}-${reel}-${sid}`]) || 0;
            e.weights[`${step}-${reel}-${sid}`] = Math.round(v * f);
          }
        }
        emit('status', { type: 'ok', msg: `R${reel} 第 ${step} 爆整列已正規化到 ${target}` });
      }
      // 整列縮放
      function reelScaleRow(mode, reel, factor) {
        _pushUndo("reel", mode);        if (!factor || factor <= 0) return;
        const e = reelW(mode);
        for (const sid of e.symbol_ids) {
          const v = Number(e.weights[`${reel}-${sid}`]) || 0;
          e.weights[`${reel}-${sid}`] = Math.round(v * factor);
        }
        emit('status', { type: 'ok', msg: `R${reel} 整列已乘以 ${factor}` });
      }
      function gridScaleRow(mode, reel, factor) {
        _pushUndo("grid", mode);        if (!factor || factor <= 0) return;
        const e = gridW(mode);
        for (const sz of e.grid_sizes) {
          const v = Number(e.weights[`${reel}-${sz}`]) || 0;
          e.weights[`${reel}-${sz}`] = Math.round(v * factor);
        }
        emit('status', { type: 'ok', msg: `R${reel} 整列已乘以 ${factor}` });
      }
      function comboScaleRow(mode, step, reel, factor) {
        _pushUndo("combo", mode);        if (!factor || factor <= 0) return;
        const e = comboW(mode);
        for (const sid of e.symbol_ids) {
          const v = Number(e.weights[`${step}-${reel}-${sid}`]) || 0;
          e.weights[`${step}-${reel}-${sid}`] = Math.round(v * factor);
        }
        emit('status', { type: 'ok', msg: `R${reel} 第 ${step} 爆整列已乘以 ${factor}` });
      }

      // ──────────────────────────────────────────────────────────
      //  v3.5:矩陣顯示模式切換(數值 / %橫 / %縱)
      //  - raw:cell 顯示原始權重(預設)
      //  - pct_row:每列正規化後顯示百分比(看「同 reel 內各符號比例」)
      //  - pct_col:每欄正規化後顯示百分比(看「同符號跨 reel 分佈」)
      //  注意:輸入值仍是絕對權重,百分比只是 cell 內附加的小字 overlay。
      //  keys 格式:`${kind}:${mode}` → 'raw' | 'pct_row' | 'pct_col'
      //    其中 combo 跨 step 共用同一個顯示模式(避免切 step 後又要重設)
      // ──────────────────────────────────────────────────────────
      // v3.6 / #1:顯示模式偏好持久化到 LS(slotplanner.ui.matrixDisplay.v1)
      //   - 初始化時讀 LS,寫入時 debounce 100ms 回寫
      //   - 結構:{ "reel:NG": "pct_row", "combo:FG1": "pct_col", ... }
      const LS_MATRIX_DISPLAY_KEY = 'slotplanner.ui.matrixDisplay.v1';
      function _loadMatrixDisplayLS() {
        try {
          const raw = localStorage.getItem(LS_MATRIX_DISPLAY_KEY);
          if (!raw) return {};
          const parsed = JSON.parse(raw);
          return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch(_) { return {}; }
      }
      const matrixDisplayMode = reactive(_loadMatrixDisplayLS());
      let _matrixDisplaySaveTimer = null;
      function _saveMatrixDisplayLS() {
        if (_matrixDisplaySaveTimer) clearTimeout(_matrixDisplaySaveTimer);
        _matrixDisplaySaveTimer = setTimeout(() => {
          try {
            localStorage.setItem(LS_MATRIX_DISPLAY_KEY, JSON.stringify(matrixDisplayMode));
          } catch(_){}
        }, 100);
      }
      function _dmKey(kind, mode) { return `${kind}:${mode}`; }
      function getMatrixDisplayMode(kind, mode) {
        return matrixDisplayMode[_dmKey(kind, mode)] || 'raw';
      }
      function setMatrixDisplayMode(kind, mode, v) {
        matrixDisplayMode[_dmKey(kind, mode)] = v;
        _saveMatrixDisplayLS();
      }
      // 計算某 cell 在「列」或「欄」內所占百分比;失敗或不適用回 null
      // kind: 'reel' | 'grid' | 'combo'
      // r:     reel_id
      // col:   reel 是 sid;grid 是 grid_size(number);combo 是 sid
      // step:  只 combo 用
      function cellPercent(kind, mode, r, col, step) {
        const dm = getMatrixDisplayMode(kind, mode);
        if (dm === 'raw') return null;
        let cur = 0, denom = 0;
        if (kind === 'reel') {
          const e = reelW(mode);
          cur = Number(e.weights[`${r}-${col}`]) || 0;
          if (dm === 'pct_row') {
            for (const sid of e.symbol_ids) denom += Number(e.weights[`${r}-${sid}`]) || 0;
          } else {
            for (const rr of layout) denom += Number(e.weights[`${rr.reel_id}-${col}`]) || 0;
          }
        } else if (kind === 'grid') {
          const e = gridW(mode);
          cur = Number(e.weights[`${r}-${col}`]) || 0;
          if (dm === 'pct_row') {
            for (const sz of e.grid_sizes) denom += Number(e.weights[`${r}-${sz}`]) || 0;
          } else {
            for (const rr of layout) denom += Number(e.weights[`${rr.reel_id}-${col}`]) || 0;
          }
        } else if (kind === 'combo') {
          const e = comboW(mode);
          const st = step;
          cur = Number(e.weights[`${st}-${r}-${col}`]) || 0;
          if (dm === 'pct_row') {
            for (const sid of e.symbol_ids) denom += Number(e.weights[`${st}-${r}-${sid}`]) || 0;
          } else {
            for (const rr of layout) denom += Number(e.weights[`${st}-${rr.reel_id}-${col}`]) || 0;
          }
        }
        if (denom <= 0) return null;
        const pct = (cur / denom) * 100;
        // 小於 0.05% 也顯示 0.1 避免欄寬抖動;大於 99.5 顯示 100
        if (pct < 0.05) return '0%';
        if (pct >= 99.95) return '100%';
        if (pct < 10) return pct.toFixed(1) + '%';
        return Math.round(pct) + '%';
      }

      // ──────────────────────────────────────────────────────────
      //  v3.5:05_Grid_Size_Weights 整欄操作(對齊 04 體驗)
      //  欄 = 某 grid_size 在所有 reel 的權重總和
      // ──────────────────────────────────────────────────────────
      function gridTotalForCol(mode, sz) {
        const e = gridW(mode);
        let s = 0;
        for (let r = 1; r <= layout.length; r++) {
          const v = e.weights[`${r}-${sz}`];
          if (typeof v === 'number') s += v;
        }
        return s;
      }
      function gridFillColUniform(mode, sz, v = 100) {
        _pushUndo("grid", mode);        const e = gridW(mode);
        for (let r = 1; r <= layout.length; r++) e.weights[`${r}-${sz}`] = v;
        emit('status', { type: 'ok', msg: `「${sz} 格」整欄已設為 ${v}` });
      }
      function gridScaleCol(mode, sz, factor) {
        _pushUndo("grid", mode);        if (!factor || factor <= 0) return;
        const e = gridW(mode);
        for (let r = 1; r <= layout.length; r++) {
          const v = e.weights[`${r}-${sz}`];
          if (typeof v === 'number') e.weights[`${r}-${sz}`] = Math.round(v * factor);
        }
        emit('status', { type: 'ok', msg: `「${sz} 格」整欄已乘以 ${factor}` });
      }
      function gridNormalizeCol(mode, sz, target = 100) {
        _pushUndo("grid", mode);        const cur = gridTotalForCol(mode, sz);
        if (cur === 0) {
          const each = Math.floor(target / layout.length);
          for (let r = 1; r <= layout.length; r++) gridW(mode).weights[`${r}-${sz}`] = each;
        } else {
          gridScaleCol(mode, sz, target / cur);
        }
        emit('status', { type: 'ok', msg: `「${sz} 格」整欄已正規化到 ${target}` });
      }
      function gridCopyColToAll(mode, from_sz) {
        _pushUndo("grid", mode);        const e = gridW(mode);
        for (const sz of e.grid_sizes) {
          if (sz === from_sz) continue;
          for (let r = 1; r <= layout.length; r++) {
            e.weights[`${r}-${sz}`] = e.weights[`${r}-${from_sz}`] ?? 0;
          }
        }
        emit('status', { type: 'ok', msg: `已把「${from_sz} 格」複製到所有其他格數欄` });
      }

      // ──────────────────────────────────────────────────────────
      //  v3.5:08_Combo_Weights 整欄操作(在當前 step 內)
      //  欄 = 某符號在當前爆階段、所有 reel 的權重總和
      // ──────────────────────────────────────────────────────────
      function comboTotalForCol(mode, step, sid) {
        const e = comboW(mode);
        let s = 0;
        for (let r = 1; r <= layout.length; r++) {
          const v = e.weights[`${step}-${r}-${sid}`];
          if (typeof v === 'number') s += v;
        }
        return s;
      }
      function comboFillColUniform(mode, step, sid, v = 100) {
        _pushUndo("combo", mode);        const e = comboW(mode);
        for (let r = 1; r <= layout.length; r++) e.weights[`${step}-${r}-${sid}`] = v;
        emit('status', { type: 'ok', msg: `「${sid}」第 ${step} 爆整欄已設為 ${v}` });
      }
      function comboScaleCol(mode, step, sid, factor) {
        _pushUndo("combo", mode);        if (!factor || factor <= 0) return;
        const e = comboW(mode);
        for (let r = 1; r <= layout.length; r++) {
          const k = `${step}-${r}-${sid}`;
          const v = e.weights[k];
          if (typeof v === 'number') e.weights[k] = Math.round(v * factor);
        }
        emit('status', { type: 'ok', msg: `「${sid}」第 ${step} 爆整欄已乘以 ${factor}` });
      }
      function comboNormalizeCol(mode, step, sid, target = 100) {
        _pushUndo("combo", mode);        const cur = comboTotalForCol(mode, step, sid);
        if (cur === 0) {
          const each = Math.floor(target / layout.length);
          for (let r = 1; r <= layout.length; r++) comboW(mode).weights[`${step}-${r}-${sid}`] = each;
        } else {
          comboScaleCol(mode, step, sid, target / cur);
        }
        emit('status', { type: 'ok', msg: `「${sid}」第 ${step} 爆整欄已正規化到 ${target}` });
      }
      function comboCopyColToAll(mode, step, from_sid) {
        _pushUndo("combo", mode);        const e = comboW(mode);
        for (const sid of e.symbol_ids) {
          if (sid === from_sid) continue;
          for (let r = 1; r <= layout.length; r++) {
            e.weights[`${step}-${r}-${sid}`] = e.weights[`${step}-${r}-${from_sid}`] ?? 0;
          }
        }
        emit('status', { type: 'ok', msg: `已把「${from_sid}」第 ${step} 爆複製到所有其他符號欄` });
      }

      // 矩陣「Cell 選取狀態」(用於範圍批次操作)
      // v3.5:支援 04 / 05 / 08(原本只支援 04)
      // key 格式:`${kind}:${mode}:${stepOrEmpty}:${r}-${col}`
      //   - reel:  step 段為空字串,col 是 sid 字串
      //   - grid:  step 段為空字串,col 是 grid_size 數字字串(注意:當作字串比對)
      //   - combo: step 段是當前爆階段數字字串,col 是 sid 字串
      const matrixSelection = reactive({
        keys: new Set(),
        anchor: null,    // shift+click 的起點 { r, col }
      });

      function _selKey(kind, mode, r, col, step) {
        const st = (step === undefined || step === null) ? '' : String(step);
        return `${kind}:${mode}:${st}:${r}-${col}`;
      }
      // 取得當前 kind+mode 的 col 列表(reel: symbol_ids;grid: grid_sizes;combo: symbol_ids)
      function _colsForKind(kind, mode) {
        if (kind === 'reel')  return reelW(mode).symbol_ids.slice();
        if (kind === 'grid')  return gridW(mode).grid_sizes.map(String);
        if (kind === 'combo') return comboW(mode).symbol_ids.slice();
        return [];
      }
      // selection 是否屬於同一個 kind/mode/step(避免跨 tab 套用)
      function _selectionScope() {
        // 從第一個 key 推斷 scope;為空回 null
        const first = matrixSelection.keys.values().next().value;
        if (!first) return null;
        const [kind, mode, step] = first.split(':');
        return { kind, mode, step };
      }
      function toggleMatrixCell(kind, mode, r, col, ev, step) {
        // 切換 kind/mode/step:若新點 cell 不屬於現有 scope,先清空
        const scope = _selectionScope();
        const stStr = (step === undefined || step === null) ? '' : String(step);
        if (scope && (scope.kind !== kind || scope.mode !== mode || scope.step !== stStr)) {
          matrixSelection.keys = new Set();
          matrixSelection.anchor = null;
        }
        col = String(col);
        const key = _selKey(kind, mode, r, col, step);
        if (ev && ev.shiftKey && matrixSelection.anchor) {
          // 範圍選取:從 anchor 到當前
          _selectRange(kind, mode, matrixSelection.anchor, { r, col }, step);
        } else if (ev && (ev.ctrlKey || ev.metaKey)) {
          // toggle 單一
          if (matrixSelection.keys.has(key)) matrixSelection.keys.delete(key);
          else matrixSelection.keys.add(key);
          matrixSelection.anchor = { r, col };
        } else {
          // 一般點:清空 + 選這個
          matrixSelection.keys = new Set([key]);
          matrixSelection.anchor = { r, col };
        }
      }
      function _selectRange(kind, mode, a, b, step) {
        // 由 a.r..b.r 與 a.col..b.col 框出矩形
        const cols = _colsForKind(kind, mode);
        if (cols.length === 0) return;
        const aCol = String(a.col);
        const bCol = String(b.col);
        const cidxA = cols.indexOf(aCol);
        const cidxB = cols.indexOf(bCol);
        if (cidxA < 0 || cidxB < 0) return;
        const rMin = Math.min(a.r, b.r), rMax = Math.max(a.r, b.r);
        const cMin = Math.min(cidxA, cidxB), cMax = Math.max(cidxA, cidxB);
        for (let r = rMin; r <= rMax; r++) {
          for (let c = cMin; c <= cMax; c++) {
            matrixSelection.keys.add(_selKey(kind, mode, r, cols[c], step));
          }
        }
      }
      function clearMatrixSelection() {
        matrixSelection.keys = new Set();
        matrixSelection.anchor = null;
      }
      function isMatrixCellSelected(kind, mode, r, col, step) {
        return matrixSelection.keys.has(_selKey(kind, mode, r, String(col), step));
      }
      // 對選取的 cells 套用操作
      function applyMatrixSelOp(op, v = null) {
        _pushUndoForSelection();        if (matrixSelection.keys.size === 0) return;
        const targets = [];
        for (const k of matrixSelection.keys) {
          // 'kind:mode:step:r-col' — mode/step 可能含 ':' 嗎?modeNames 是純識別字,不會
          const parts = k.split(':');
          // [kind, mode, step, coord]
          const kind  = parts[0];
          const mode  = parts[1];
          const step  = parts[2]; // '' for reel/grid
          const coord = parts.slice(3).join(':');
          const dash  = coord.indexOf('-');
          if (dash < 0) continue;
          const r   = parseInt(coord.substring(0, dash), 10);
          const col = coord.substring(dash + 1);
          if (kind === 'reel') {
            targets.push({ table: reelW(mode).weights, key: `${r}-${col}` });
          } else if (kind === 'grid') {
            targets.push({ table: gridW(mode).weights, key: `${r}-${col}` });
          } else if (kind === 'combo') {
            targets.push({ table: comboW(mode).weights, key: `${step}-${r}-${col}` });
          }
        }
        for (const t of targets) {
          const cur = Number(t.table[t.key]) || 0;
          let next = cur;
          switch (op) {
            case 'set':   next = v; break;
            case 'add':   next = cur + v; break;
            case 'mul':   next = Math.round(cur * v); break;
            case 'zero':  next = 0; break;
          }
          t.table[t.key] = Math.max(0, next);
        }
        emit('status', { type: 'ok', msg: `已對 ${matrixSelection.keys.size} 個 cell 套用 ${op}` });
      }

      // 視覺預覽的計算
      const layoutMetrics = computed(() => {
        let minTop = 0, maxBot = 0;
        for (const r of layout) {
          let top = r.y_offset;
          let bot = r.y_offset + Math.max(1, r.max_rows) - 1;
          if (r.has_subreel && r.subreel_rows > 0) {
            if (r.subreel_position === 'TOP')    top = top - r.subreel_rows;
            if (r.subreel_position === 'BOTTOM') bot = bot + r.subreel_rows;
          }
          minTop = Math.min(minTop, top);
          maxBot = Math.max(maxBot, bot);
        }
        return { minTop, maxBot };
      });

      const layoutCells = computed(() => {
        const { minTop } = layoutMetrics.value;
        const cells = [];
        layout.forEach((r, idx) => {
          const x = idx * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP);
          // 主 Reel 格子
          for (let i = 0; i < r.max_rows; i++) {
            const row = r.y_offset + i;
            cells.push({
              x,
              y: (row - minTop) * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP),
              kind: 'main',
              reel_id: r.reel_id,
              // #9 點選用:邏輯座標(reel 從 1 開始 = idx+1;row 為該 reel 內的 1-based index)
              reel: idx + 1,
              row: i + 1,
            });
          }
          // 副 Reel 格子
          if (r.has_subreel && r.subreel_rows > 0) {
            if (r.subreel_position === 'TOP') {
              for (let i = 0; i < r.subreel_rows; i++) {
                const row = r.y_offset - r.subreel_rows + i;
                cells.push({
                  x,
                  y: (row - minTop) * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP) - LAYOUT_SUBREEL_GAP,
                  kind: 'sub',
                  reel_id: r.reel_id,
                  reel: idx + 1,
                  row: null, // 副 reel 不參與點選
                });
              }
            } else if (r.subreel_position === 'BOTTOM') {
              for (let i = 0; i < r.subreel_rows; i++) {
                const row = r.y_offset + r.max_rows + i;
                cells.push({
                  x,
                  y: (row - minTop) * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP) + LAYOUT_SUBREEL_GAP,
                  kind: 'sub',
                  reel_id: r.reel_id,
                  reel: idx + 1,
                  row: null,
                });
              }
            }
          }
        });
        return cells;
      });

      const layoutLabels = computed(() => layout.map((r, idx) => ({
        x: idx * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP) + LAYOUT_CELL_SIZE / 2,
        reel_id: r.reel_id,
      })));

      const layoutViewBox = computed(() => {
        if (layout.length === 0) return '0 0 100 100';
        const w = Math.max(1, layout.length) * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP);
        const { minTop, maxBot } = layoutMetrics.value;
        const h = (maxBot - minTop + 1) * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP)
                  + 2 * LAYOUT_SUBREEL_GAP + LAYOUT_LABEL_HEIGHT;
        return `0 ${-LAYOUT_LABEL_HEIGHT - LAYOUT_SUBREEL_GAP} ${w} ${h}`;
      });

      const totalCells = computed(() =>
        layout.reduce((s, r) => s + r.max_rows + (r.has_subreel ? r.subreel_rows : 0), 0)
      );

      const LAYOUT_CELL_SIZE_OUT = LAYOUT_CELL_SIZE;  // 模板要用

      // ── 12_Distribution_Bins 狀態 ──
      const bins = reactive(loadBins());
      const binsDebugJson = computed(() => JSON.stringify(bins, null, 2));

      // 為每個模式名稱確保 bins 內有對應條目(lazy init)
      function ensureBinForMode(name) {
        if (!bins[name]) bins[name] = { bin_edges: DEFAULT_BIN_EDGES, notes: '' };
      }
      // 當 modeNames 變化時自動為新模式建立預設 bin 條目
      watch(modeNames, (names) => {
        for (const n of names) ensureBinForMode(n);
      }, { immediate: true });

      function binsFor(modeName) {
        ensureBinForMode(modeName);
        return bins[modeName];
      }
      function binsValid(modeName) {
        const entry = bins[modeName];
        if (!entry) return { valid: false, msg: '尚未設定', edges: [] };
        return parseBinEdges(entry.bin_edges);
      }
      function binTickPercent(edges, i) {
        if (edges.length < 2) return 0;
        // 用「索引等距」而非「實際值線性」——後者在 0 到 1000 這種大跨距下會擠成一團
        return (i / (edges.length - 1)) * 100;
      }

      // ── 訂閱 SymbolRegistry,跨頁讀符號清單 ──
      const symbolList = ref([]);
      function refreshSymbols() {
        if (!registry) { symbolList.value = []; return; }
        try { symbolList.value = registry.symbols(); }
        catch (e) { symbolList.value = []; }
      }
      refreshSymbols();
      let unbindRegistry = null;
      // 標記 symbols tab dirty:registry 變動時觸發(任務 2)
      // 用 hasInitialized flag 避免 mount 時的初始 emit 也算 dirty
      let _registryReady = false;
      if (registry && typeof registry.on === 'function') {
        unbindRegistry = registry.on('changed', () => {
          refreshSymbols();
          if (_registryReady) {
            // dirtyTabs / dirty 此時尚未宣告(在後面),用 setTimeout 延後執行
            setTimeout(() => {
              if (typeof dirtyTabs !== 'undefined' && dirtyTabs) {
                dirtyTabs['symbols'] = true;
                if (typeof dirty !== 'undefined') dirty.value = true;
              }
              // #10:registry 寫入 LS 後,也觸發變更回顧重算
              if (typeof changesVersion !== 'undefined' && changesVersion) {
                changesVersion.value++;
              }
            }, 0);
          }
        });
        setTimeout(() => { _registryReady = true; }, 100);
      }
      onUnmounted(() => { if (unbindRegistry) unbindRegistry(); });

      // 從 symbol 物件抽出顯示名稱:name 優先,否則 #number,否則 id 後綴
      const symbolNames = computed(() =>
        symbolList.value
          .map(s => (s.name && s.name.trim()) ? s.name.trim()
                  : (s.number && String(s.number).trim()) ? `#${s.number}`
                  : `id${s.id}`)
          .filter(n => n.length > 0)
      );

      // Mode_Scope 用的下拉清單:ALL + 所有模式名
      const allModeScopes = computed(() => ['ALL', ...modeNames.value]);

      // ── 06_Paylines 狀態 ──
      const paylines = reactive(loadPaylines());
      const paylinesDebugJson = computed(() => JSON.stringify(paylines, null, 2));

      function addPayline() {
        const next_id = paylines.length > 0
          ? Math.max(...paylines.map(p => p.line_id || 0)) + 1 : 1;
        paylines.push(makePayline(next_id));
        selectedPaylineIdx.value = paylines.length - 1;
        emit('status', { type: 'ok', msg: `已新增中獎線 L${next_id}` });
      }
      function removePayline(idx) {
        if (paylines.length <= 1) return;
        const pl = paylines[idx];
        if (!confirm(`確定要刪除中獎線 L${pl.line_id} 嗎?`)) return;
        paylines.splice(idx, 1);
        selectedPaylineIdx.value = Math.min(selectedPaylineIdx.value, Math.max(0, paylines.length - 1));
        emit('status', { type: 'ok', msg: `已刪除中獎線 L${pl.line_id}` });
      }
      // 對單一 payline 做驗證(close over layout)
      function paylineValid(pl) { return validatePayline(pl, layout); }
      // 把 payline 的座標轉成 SVG 用的中心點(close over layoutMetrics/LAYOUT_CELL_SIZE)
      function paylineCells(pl) {
        const v = paylineValid(pl);
        if (!v.valid || v.points.length === 0) return [];
        const { minTop } = layoutMetrics.value;
        const out = [];
        for (const pt of v.points) {
          const idx = pt.reel - 1;
          if (idx < 0 || idx >= layout.length) continue;
          const r = layout[idx];
          const abs_row = r.y_offset + (pt.row - 1);
          out.push({
            x: idx * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP) + LAYOUT_CELL_SIZE / 2,
            y: (abs_row - minTop) * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP) + LAYOUT_CELL_SIZE / 2,
          });
        }
        return out;
      }

      // ──────────────────────────────────────────────────────────
      //  #9 中獎線視覺點選模式
      //  在 06_Paylines SVG 預覽上直接點 cell 即可建構路徑
      //  - 左鍵新增點(若該點已存在 → 移除)
      //  - 右鍵移除最後一點
      //  - 與文字 input 雙向同步(都寫入 paylines[idx].path)
      // ──────────────────────────────────────────────────────────
      const paylineClickMode = ref(false);

      // 把目前選中 payline 的 path 解析成 [{reel, row}] 列表
      // 注意:解析失敗或只有 1 點時 parsed.valid 為 false,但仍可有 points,
      // 點選模式需要能從 0/1 個點繼續加,所以這裡無論 valid 都回傳 points
      function _currentPaylinePoints() {
        const pl = paylines[selectedPaylineIdx.value];
        if (!pl || !pl.path) return [];
        const parsed = parsePathString(pl.path);
        return parsed.points || [];
      }
      // 把點列表寫回成 "(R,r)-(R,r)-..." 字串
      function _pointsToPathString(points) {
        return points.map(p => `(${p.reel},${p.row})`).join('-');
      }
      // 該 cell (reel,row) 是否在當前 payline 路徑中?回傳序號(1-based)或 0
      function paylineCellPathIndex(cell) {
        if (!cell || cell.row == null) return 0;
        const pts = _currentPaylinePoints();
        for (let i = 0; i < pts.length; i++) {
          if (pts[i].reel === cell.reel && pts[i].row === cell.row) return i + 1;
        }
        return 0;
      }
      // 左鍵點 cell:已存在 → 移除該點;否則加到最後
      // ──────────────────────────────────────────────────────────
      //  v3.2:LINE 模式智能引導
      //  - 當 g.pay_type === 'LINE',強制「每 Reel 恰好 1 點」
      //  - 點同 Reel 的另一 cell → 替換該 Reel 的點(而非新增)
      //  - 寫回 path 時依 reel 升序排序,確保 LTR 邏輯一致
      // ──────────────────────────────────────────────────────────
      const paylineLineMode = computed(() => (g.pay_type || '').toUpperCase() === 'LINE');

      // 智能引導預設開啟(只在 LINE 模式下生效)
      const paylineGuideOn = ref(true);

      // 依 reel 升序排序點列表(LINE 模式的標準寫回形式)
      function _sortPointsByReel(pts) {
        return [...pts].sort((a, b) => a.reel - b.reel);
      }

      // v4.0 / #16:方向白話標籤 / 說明
      function paylineDirLabel(d) {
        return d === 'LTR' ? '左 → 右' : (d === 'RTL' ? '右 → 左' : '雙向');
      }
      function paylineDirHint(d) {
        return d === 'LTR' ? '由左至右計分(從 R1 那端開始連續相同)'
             : (d === 'RTL' ? '由右至左計分(從最右 Reel 那端開始)'
             : '兩個方向都計分(雙向中獎線)');
      }

      // v4.0 / #15:把 path 字串轉成白話描述
      //   - 取得每個 reel 的列高,把列位翻成「上/中/下/第N列」
      //   - 全部同列 → 「中排直線」之類;否則逐輪描述 R1·上 → R2·中 …
      function humanizePaylinePath(pl) {
        const parsed = parsePathString(pl && pl.path ? pl.path : '');
        const pts = (parsed.points || []).slice().sort((a, b) => a.reel - b.reel);
        if (pts.length === 0) return '(未設定路徑)';
        const rowName = (reel, row) => {
          const r = layout.find(x => x.reel_id === reel);
          const mr = r ? r.max_rows : Math.max(...pts.map(p => p.row));
          if (mr <= 1) return '單列';
          if (row === 1) return '上';
          if (row === mr) return '下';
          const mid = Math.ceil(mr / 2);
          if (row === mid) return '中';
          return `第${row}列`;
        };
        const rows = pts.map(p => p.row);
        const allSame = rows.every(r => r === rows[0]);
        if (allSame) {
          return `${rowName(pts[0].reel, rows[0])}排直線(每輪第 ${rows[0]} 列,共 ${pts.length} 輪)`;
        }
        // 偵測單調上升/下降(斜線)
        const asc = rows.every((r, i) => i === 0 || r >= rows[i - 1]);
        const desc = rows.every((r, i) => i === 0 || r <= rows[i - 1]);
        const shape = (asc && !desc) ? '上行斜線 ' : (desc && !asc) ? '下行斜線 ' : '';
        return shape + pts.map(p => `R${p.reel}·${rowName(p.reel, p.row)}`).join(' → ');
      }

      // 計算這條 payline 的完整度(LINE 模式)
      // 回傳 { filledReels:Set, missingReels:[], duplicateReels:[], reelCount }
      function paylineCompleteness(pl) {
        const total = layout.length;
        const filled = new Map();   // reel → count
        const pts = pl && pl.path ? parsePathString(pl.path).points : [];
        for (const p of pts) {
          filled.set(p.reel, (filled.get(p.reel) || 0) + 1);
        }
        const missing = [];
        const duplicate = [];
        for (let r = 1; r <= total; r++) {
          const c = filled.get(r) || 0;
          if (c === 0) missing.push(r);
          else if (c > 1) duplicate.push(r);
        }
        const isComplete = missing.length === 0 && duplicate.length === 0;
        return { filled, missingReels: missing, duplicateReels: duplicate, reelCount: total, isComplete };
      }

      // 下一個「期望要點」的 reel(智能引導用)
      // = 第一個還沒有點的 reel;若全部都有點則回 null
      function paylineNextExpectedReel(pl) {
        const total = layout.length;
        const pts = pl && pl.path ? parsePathString(pl.path).points : [];
        const filledSet = new Set(pts.map(p => p.reel));
        for (let r = 1; r <= total; r++) {
          if (!filledSet.has(r)) return r;
        }
        return null;
      }

      // 取得當前選中 payline(便利 helper,避免重複)
      function _activePayline() { return paylines[selectedPaylineIdx.value]; }

      // 該 cell 在點選模式下的狀態
      //   'in-path'   已加入路徑
      //   'expected'  下一個該點(智能引導高亮)
      //   'disabled'  該 reel 已有點(智能引導模式下,不該再點)
      //   'available' 可點
      // 注意:LINE 模式智能引導開啟時才會出現 disabled
      function paylineCellState(cell) {
        if (!cell || cell.kind !== 'main' || cell.row == null) return '';
        const pl = _activePayline();
        if (!pl) return '';
        if (paylineCellPathIndex(cell) > 0) return 'in-path';
        const pts = _currentPaylinePoints();
        // v4.0 / #17:該 Reel 已有點(非本格)→ 點下去會替換,任何模式都標示
        if (pts.some(p => p.reel === cell.reel)) return 'replace';
        if (paylineLineMode.value && paylineGuideOn.value) {
          const expected = paylineNextExpectedReel(pl);
          if (expected != null && cell.reel === expected) return 'expected';
          // 還沒輪到的 reel
          if (expected != null && cell.reel > expected + 0) return 'available';
        }
        return 'available';
      }

      function onPaylineCellClick(cell) {
        if (!paylineClickMode.value) return;
        if (!cell || cell.kind !== 'main' || cell.row == null) return;
        const pl = _activePayline();
        if (!pl) return;
        const pts = _currentPaylinePoints();
        const sameCellIdx = pts.findIndex(p => p.reel === cell.reel && p.row === cell.row);

        if (sameCellIdx >= 0) {
          // 點同一格 → 移除(這個語意在 LINE / WAYS 都直觀)
          pts.splice(sameCellIdx, 1);
          pl.path = _pointsToPathString(paylineLineMode.value ? _sortPointsByReel(pts) : pts);
          emit('status', { type: 'ok', msg: `已移除點 (${cell.reel},${cell.row})` });
          return;
        }

        // 中獎線本質:每個 Reel 只能有一個連線點。
        // v4.0 / #17:不論 pay_type 為何,同一 Reel 已有點就「替換」(防呆),
        //   不再允許同一 Reel 出現多個點;寫回時一律依 reel 升序排序。
        const sameReelIdx = pts.findIndex(p => p.reel === cell.reel);
        if (sameReelIdx >= 0) {
          const old = pts[sameReelIdx];
          pts[sameReelIdx] = { reel: cell.reel, row: cell.row };
          pl.path = _pointsToPathString(_sortPointsByReel(pts));
          emit('status', { type: 'ok', msg: `R${cell.reel} 已從列 ${old.row} 改為列 ${cell.row}` });
          return;
        }
        // 新增點(依 reel 排序)
        pts.push({ reel: cell.reel, row: cell.row });
        pl.path = _pointsToPathString(_sortPointsByReel(pts));
        emit('status', { type: 'ok', msg: `R${cell.reel} 設為列 ${cell.row}` });
      }

      // 右鍵:移除最後一點(LINE 模式下會移除「reel 編號最大的那個點」,符合視覺直覺)
      function onPaylineSvgRightClick(ev) {
        if (!paylineClickMode.value) return;
        ev.preventDefault();
        const pl = _activePayline();
        if (!pl) return;
        const pts = _currentPaylinePoints();
        if (pts.length === 0) return;
        let removed;
        if (paylineLineMode.value) {
          // 找 reel 最大的那個點移除
          let maxIdx = 0;
          for (let i = 1; i < pts.length; i++) if (pts[i].reel > pts[maxIdx].reel) maxIdx = i;
          removed = pts.splice(maxIdx, 1)[0];
          pl.path = _pointsToPathString(_sortPointsByReel(pts));
        } else {
          removed = pts.pop();
          pl.path = _pointsToPathString(pts);
        }
        emit('status', { type: 'ok', msg: `已移除點 (${removed.reel},${removed.row})` });
      }
      // 清空所有點
      function clearPaylinePath() {
        const pl = paylines[selectedPaylineIdx.value];
        if (!pl) return;
        if (!pl.path) return;
        if (!confirm('清空目前中獎線的所有點?')) return;
        pl.path = '';
        emit('status', { type: 'ok', msg: '已清空中獎線路徑' });
      }
      // 把任意點列表 [{reel,row}] 轉成 SVG 中心點(用於點選模式視覺化,
      // 不像 paylineCells 那樣只在 valid 時才回傳;單點/不完整路徑也能看到)
      function paylineCellsForClickMode() {
        const pts = _currentPaylinePoints();
        if (pts.length === 0) return [];
        const { minTop } = layoutMetrics.value;
        const out = [];
        for (const pt of pts) {
          const idx = pt.reel - 1;
          if (idx < 0 || idx >= layout.length) continue;
          const r = layout[idx];
          if (pt.row < 1 || pt.row > r.max_rows) continue;
          const abs_row = r.y_offset + (pt.row - 1);
          out.push({
            x: idx * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP) + LAYOUT_CELL_SIZE / 2,
            y: (abs_row - minTop) * (LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP) + LAYOUT_CELL_SIZE / 2,
          });
        }
        return out;
      }

      // ──────────────────────────────────────────────────────────
      //  v3.2:前 3 格重疊偵測(對應後端 a_loader._parse_paylines)
      //  回傳 Set<idx>,記錄哪些 payline index 與其他線前 3 格重疊
      // ──────────────────────────────────────────────────────────
      const paylineOverlapIdxs = computed(() => {
        const overlap = new Set();
        const prefixMap = new Map();   // "r1,r1-r2,r2-r3,r3" → first idx
        for (let i = 0; i < paylines.length; i++) {
          const pl = paylines[i];
          const v = paylineValid(pl);
          if (!v.valid || v.points.length < 3) continue;
          const key = v.points.slice(0, 3).map(p => `${p.reel},${p.row}`).join('-');
          if (prefixMap.has(key)) {
            overlap.add(prefixMap.get(key));
            overlap.add(i);
          } else {
            prefixMap.set(key, i);
          }
        }
        return overlap;
      });

      // 當前選中 payline 的整體驗證摘要(用於 SVG 上方 banner)
      const activePaylineStatus = computed(() => {
        const pl = paylines[selectedPaylineIdx.value];
        if (!pl) return { kind: 'empty', msg: '' };
        const v = paylineValid(pl);
        if (!v.valid) {
          // 沒輸入 / 不完整,LINE 模式特殊處理
          if (paylineLineMode.value && layout.length > 0) {
            const c = paylineCompleteness(pl);
            if (!pl.path) {
              return { kind: 'info', msg: `LINE 模式:請依序為 R1 至 R${layout.length} 各加一個點` };
            }
            if (c.duplicateReels.length > 0) {
              return { kind: 'warn', msg: `LINE 模式:R${c.duplicateReels.join(', R')} 有多個點,每個 Reel 應該只有一個點` };
            }
            if (c.missingReels.length > 0) {
              return { kind: 'warn', msg: `LINE 模式:還缺 R${c.missingReels.join(', R')}(${c.filled.size}/${c.reelCount})` };
            }
          }
          return { kind: 'error', msg: v.msg || '路徑無效' };
        }
        // valid 但檢查 LINE 完整度
        if (paylineLineMode.value) {
          const c = paylineCompleteness(pl);
          if (!c.isComplete) {
            if (c.duplicateReels.length > 0) {
              return { kind: 'warn', msg: `LINE 模式:R${c.duplicateReels.join(', R')} 有重複點` };
            }
            if (c.missingReels.length > 0) {
              return { kind: 'warn', msg: `LINE 模式:缺 R${c.missingReels.join(', R')}(${c.filled.size}/${c.reelCount} Reels)` };
            }
          }
        }
        // 檢查重疊
        if (paylineOverlapIdxs.value.has(selectedPaylineIdx.value)) {
          return { kind: 'warn', msg: '前 3 格與其他中獎線重疊,匯出時會被擋掉' };
        }
        return { kind: 'ok', msg: `✓ 路徑有效,共 ${v.points.length} 個點` };
      });

      // ──────────────────────────────────────────────────────────
      //  v3.2:中獎線範本(依當前盤面尺寸動態生成 path)
      // ──────────────────────────────────────────────────────────
      const PAYLINE_PRESETS = [
        { key: 'top',        icon: '─', label: '頂列直線',
          note: '所有 Reel 都選第 1 列',
          gen: (n) => Array.from({length: n}, (_, i) => ({ reel: i+1, row: 1 })) },
        { key: 'middle',     icon: '─', label: '中央橫線',
          note: '所有 Reel 都選中間列',
          gen: (n, rows) => Array.from({length: n}, (_, i) => ({ reel: i+1, row: Math.ceil(rows[i]/2) })) },
        { key: 'bottom',     icon: '─', label: '底列直線',
          note: '所有 Reel 都選最後一列',
          gen: (n, rows) => Array.from({length: n}, (_, i) => ({ reel: i+1, row: rows[i] })) },
        { key: 'v',          icon: 'V', label: 'V 型',
          note: '從頂開始,中間到底,再回到頂',
          gen: (n, rows) => {
            const mid = (n - 1) / 2;
            return Array.from({length: n}, (_, i) => {
              const t = mid === 0 ? 0 : Math.abs(i - mid) / mid;   // 0 中心, 1 邊緣
              const row = Math.max(1, Math.round(rows[i] - t * (rows[i] - 1)));
              return { reel: i+1, row: rows[i] - row + 1 };       // 反轉成 V(中間最深)
            });
          } },
        { key: 'inv-v',      icon: 'Λ', label: '倒 V 型',
          note: '從底開始,中間到頂,再回到底',
          gen: (n, rows) => {
            const mid = (n - 1) / 2;
            return Array.from({length: n}, (_, i) => {
              const t = mid === 0 ? 0 : Math.abs(i - mid) / mid;
              const row = Math.max(1, Math.round(1 + t * (rows[i] - 1)));
              return { reel: i+1, row };
            });
          } },
        { key: 'z',          icon: 'Z', label: 'Z 型',
          note: '頂 → 對角下行 → 底',
          gen: (n, rows) => Array.from({length: n}, (_, i) => {
            const t = n === 1 ? 0 : i / (n - 1);
            return { reel: i+1, row: Math.max(1, Math.round(1 + t * (rows[i] - 1))) };
          }) },
        { key: 'n',          icon: 'N', label: '反 Z(N 型)',
          note: '底 → 對角上行 → 頂',
          gen: (n, rows) => Array.from({length: n}, (_, i) => {
            const t = n === 1 ? 0 : i / (n - 1);
            return { reel: i+1, row: Math.max(1, Math.round(rows[i] - t * (rows[i] - 1))) };
          }) },
        { key: 'zigzag-top', icon: '∿', label: '鋸齒(由上)',
          note: '頂列、第 2 列、頂列... 交替',
          gen: (n, rows) => Array.from({length: n}, (_, i) => ({
            reel: i+1, row: i % 2 === 0 ? 1 : Math.min(2, rows[i])
          })) },
        { key: 'zigzag-bot', icon: '∾', label: '鋸齒(由下)',
          note: '底列、倒數第 2 列、底列... 交替',
          gen: (n, rows) => Array.from({length: n}, (_, i) => ({
            reel: i+1, row: i % 2 === 0 ? rows[i] : Math.max(1, rows[i] - 1)
          })) },
        { key: 'blank',      icon: '∅', label: '空白(自己畫)',
          note: '不預填,進點選模式自己畫',
          gen: () => [] },
      ];

      function _newPaylineNextId() {
        return paylines.length > 0
          ? Math.max(...paylines.map(p => p.line_id || 0)) + 1 : 1;
      }

      // v3.2:取代原 addPayline,改為依範本生成
      // 不傳 key → 預設使用「中央橫線」(最常見的起手線)
      function addPaylineFromPreset(key) {
        if (layout.length === 0) {
          emit('status', { type: 'wait', msg: '請先在 02_Layout 設定盤面結構' });
          return;
        }
        const preset = PAYLINE_PRESETS.find(p => p.key === key) || PAYLINE_PRESETS[1]; // middle 預設
        const rows = layout.map(r => r.max_rows);
        const pts = preset.gen(layout.length, rows);
        const next_id = _newPaylineNextId();
        const path = pts.length > 0 ? _pointsToPathString(_sortPointsByReel(pts)) : '';
        paylines.push({
          line_id: next_id,
          path,
          direction: 'LTR',
          notes: preset.label === '空白(自己畫)' ? '' : preset.label,
        });
        selectedPaylineIdx.value = paylines.length - 1;
        paylineAddMenuOpen.value = false;
        if (preset.key === 'blank') {
          paylineClickMode.value = true;   // 空白範本自動開點選模式
          emit('status', { type: 'ok', msg: `已新增 L${next_id} 並進入點選模式` });
        } else {
          emit('status', { type: 'ok', msg: `已新增 L${next_id}:${preset.label}` });
        }
      }

      // 「新增中獎線」下拉選單開關
      const paylineAddMenuOpen = ref(false);
      function togglePaylineAddMenu(ev) {
        if (ev) ev.stopPropagation();
        paylineAddMenuOpen.value = !paylineAddMenuOpen.value;
      }
      function _onDocClickForPaylineAddMenu(ev) {
        if (!paylineAddMenuOpen.value) return;
        const host = document.querySelector('.cfg-payline-add-host');
        if (host && !host.contains(ev.target)) paylineAddMenuOpen.value = false;
      }

      // ──────────────────────────────────────────────────────────
      //  v3.2:總覽模式(所有中獎線疊加顯示,不同色)
      // ──────────────────────────────────────────────────────────
      const paylineOverviewMode = ref(false);

      // 給定 idx,回傳該 payline 的顯示色(從 accent 系列循環)
      const PAYLINE_OVERVIEW_COLORS = [
        '#5a3db0', '#c95810', '#27ae60', '#2980b9', '#c0392b',
        '#8e44ad', '#16a085', '#d35400', '#34495e', '#e67e22',
      ];
      function paylineColor(idx) {
        return PAYLINE_OVERVIEW_COLORS[idx % PAYLINE_OVERVIEW_COLORS.length];
      }

      // 給每條 payline 算出 polyline 的點字串(總覽用)
      function paylineOverviewLines() {
        return paylines.map((pl, idx) => {
          const cells = paylineCells(pl);
          if (cells.length < 2) return null;
          return {
            idx,
            line_id: pl.line_id,
            color: paylineColor(idx),
            points: cells.map(c => `${c.x},${c.y}`).join(' '),
            isActive: idx === selectedPaylineIdx.value,
            isOverlap: paylineOverlapIdxs.value.has(idx),
          };
        }).filter(Boolean);
      }

      // ──────────────────────────────────────────────────────────
      //  v3.2:左欄 mini SVG 預覽
      //  尺寸固定 80×40,讓使用者一眼看出每條線是哪種形狀
      // ──────────────────────────────────────────────────────────
      function paylineMiniSvg(pl) {
        const W = 80, H = 40, pad = 3;
        if (layout.length === 0) {
          return { viewBox: `0 0 ${W} ${H}`, cells: [], linePoints: '', isEmpty: true };
        }
        const { minTop, maxBot } = layoutMetrics.value;
        const totalH = maxBot - minTop + 1;
        const cellW = (W - pad * 2) / layout.length;
        const cellH = (H - pad * 2) / Math.max(1, totalH);
        const size = Math.max(2, Math.min(cellW, cellH) - 0.5);
        const cells = [];
        layout.forEach((r, idx) => {
          for (let i = 0; i < r.max_rows; i++) {
            const row = r.y_offset + i;
            cells.push({
              x: pad + idx * cellW + (cellW - size) / 2,
              y: pad + (row - minTop) * cellH + (cellH - size) / 2,
              w: size, h: size,
            });
          }
        });
        // 線點
        const v = paylineValid(pl);
        let linePoints = '';
        const pts = v.points || (pl.path ? parsePathString(pl.path).points : []);
        if (pts.length >= 2) {
          linePoints = pts.map(pt => {
            const reelIdx = pt.reel - 1;
            if (reelIdx < 0 || reelIdx >= layout.length) return null;
            const r = layout[reelIdx];
            const abs_row = r.y_offset + (pt.row - 1);
            const cx = pad + reelIdx * cellW + cellW / 2;
            const cy = pad + (abs_row - minTop) * cellH + cellH / 2;
            return `${cx.toFixed(1)},${cy.toFixed(1)}`;
          }).filter(Boolean).join(' ');
        }
        return { viewBox: `0 0 ${W} ${H}`, cells, linePoints, isEmpty: false };
      }

      // ── 07_Constraints 狀態 ──
      const constraints = reactive(loadConstraints());
      const constraintsDebugJson = computed(() => JSON.stringify(constraints, null, 2));

      const constraintDuplicateIds = computed(() => {
        const seen = new Set();
        const dup = new Set();
        for (const c of constraints) {
          const id = (c.constraint_id || '').trim();
          if (!id) continue;
          if (seen.has(id)) dup.add(id);
          seen.add(id);
        }
        return dup;
      });

      function addConstraint() {
        const taken = new Set(constraints.map(c => c.constraint_id));
        let i = constraints.length + 1;
        while (taken.has(`C${String(i).padStart(3, '0')}`)) i++;
        const newId = `C${String(i).padStart(3, '0')}`;
        constraints.push(makeConstraint(newId));
        emit('status', { type: 'ok', msg: `已新增約束 ${newId}` });
      }
      function removeConstraint(idx) {
        const c = constraints[idx];
        if (!confirm(`確定要刪除約束「${c.constraint_id || '(未命名)'}」嗎?`)) return;
        constraints.splice(idx, 1);
        emit('status', { type: 'ok', msg: `已刪除約束「${c.constraint_id}」` });
      }

      // ── 04_Reel_Weights 狀態 ──
      const reelWeights = reactive(loadReelWeights());
      const reelWeightsDebugJson = computed(() => JSON.stringify(reelWeights, null, 2));

      // 為某模式建立預設 Reel 權重表(以當前 layout.length × symbolNames 為基準)
      const _fillSigReel = {};
      function ensureReelWeightsForMode(name) {
        if (!reelWeights[name]) {
          // 第一次進入該模式:用當前 symbolNames 為符號清單
          const base = symbolNames.value.length > 0
            ? symbolNames.value
            : ['WILD', 'H1', 'H2', 'H3', 'L1', 'L2', 'L3', 'L4'];
          reelWeights[name] = {
            symbol_ids: [...new Set(base)],   // 去重:重複會撞欄 key
            weights: {},
            notes: '',
          };
        }
        const entry = reelWeights[name];
        // 防呆:symbol_ids 去重。重複的符號會讓矩陣 <th :key="sid"> 出現重複 key,
        // 造成 Vue patch 崩潰(nextSibling null)、點擊落錯 cell、占比分母重複計數。
        // 只有真的有重複時才重新賦值,避免每次 render 都產生新陣列觸發無限更新。
        const deduped = [...new Set(entry.symbol_ids)];
        if (deduped.length !== entry.symbol_ids.length) entry.symbol_ids = deduped;
        // ── 效能:形狀(reel_ids × symbol_ids)沒變就跳過填值迴圈。
        //    reelW() 在矩陣 render 時會被呼叫上百次,原本每次都跑 O(reels×symbols)
        //    的 `k in weights` 迴圈,是矩陣卡頓主因。形狀簽章短路後降為 O(reels+symbols)。
        const sig = layout.length + '|' + layout.map(r => r.reel_id).join(',') + '|' + entry.symbol_ids.join(',');
        if (_fillSigReel[name] === sig) return;
        // 用實際 reel_id 建 cell(不假設 reel_id 連續 1..N)
        for (const r of layout) {
          for (const sid of entry.symbol_ids) {
            const k = `${r.reel_id}-${sid}`;
            if (!(k in entry.weights)) entry.weights[k] = 100;
          }
        }
        _fillSigReel[name] = sig;
      }
      function reelW(mode) { ensureReelWeightsForMode(mode); return reelWeights[mode]; }
      // 解析 "WILD, H1, H2" 等格式,失敗回 null
      function parseSymbolIds(str) {
        if (!str || !str.trim()) return null;
        const parts = str.split(/[,\s]+/).filter(Boolean);
        if (parts.length === 0) return null;
        return [...new Set(parts)];
      }
      function reelSymbolIdsStr(mode) {
        const e = reelW(mode);
        return e.symbol_ids.join(', ');
      }
      function setReelSymbolIdsStr(mode, str) {
        const parsed = parseSymbolIds(str);
        if (!parsed) return;
        const entry = reelW(mode);
        entry.symbol_ids = parsed;
        // 為新 symbol 初始化權重
        for (let r = 1; r <= layout.length; r++) {
          for (const sid of parsed) {
            const k = `${r}-${sid}`;
            if (!(k in entry.weights)) entry.weights[k] = 100;
          }
        }
      }
      // v3.5 / #9:從 03_Symbols 取符號 id(用 symbol_id;沒有就用 name)
      // v4.0 / #2 + #13:停用(enabled === false)的符號不帶入
      function _registrySymbolIds() {
        const ids = [];
        for (const s of (symbolList.value || [])) {
          if (s && s.enabled === false) continue;   // #13:停用符號排除
          const id = (s.symbol_id && s.symbol_id.trim()) || s.name;
          if (id) ids.push(id);
        }
        return [...new Set(ids)];   // 去重,避免重複欄 key
      }
      // v4.0 / #2:以 03_Symbols 為唯一來源「完整套用」符號欄。
      //   - 帶入所有啟用中的符號(新欄權重初始化 100)
      //   - 移除已不在清單內的欄,並清掉對應的孤兒權重鍵
      function reelSyncFromRegistry(mode) {
        const ids = _registrySymbolIds();
        if (ids.length === 0) {
          emit('status', { type: 'warn', msg: '03_Symbols 沒有任何啟用中的符號' });
          return;
        }
        const entry = reelW(mode);
        const before = entry.symbol_ids.slice();
        entry.symbol_ids = ids;
        const valid = new Set(ids);
        // 補新欄的權重(用真實 reel_id)
        for (const r of layout) {
          for (const sid of ids) {
            const k = `${r.reel_id}-${sid}`;
            if (!(k in entry.weights)) entry.weights[k] = 100;
          }
        }
        // 清掉欄已不存在的孤兒鍵
        for (const k of Object.keys(entry.weights)) {
          const dash = k.indexOf('-');
          if (dash < 0) continue;
          const sid = k.slice(dash + 1);
          if (!valid.has(sid)) delete entry.weights[k];
        }
        const added = ids.filter(s => !before.includes(s)).length;
        const removed = before.filter(s => !valid.has(s)).length;
        emit('status', { type: 'ok', msg: `已套用 03_Symbols:共 ${ids.length} 欄(新增 ${added}、移除 ${removed})` });
      }
      // 計算某模式內最大權重,給熱力圖背景強度用
      // 效能:活躍模式的「最大值 + top-2 門檻」用 computed 快取一次,
      //   供 reelHeatColor / reelIsTopWeight 每格讀取(原本每格各自掃描/排序整表)。
      //   依賴 reelW(active).weights,任一格變動才重算一次。
      const _reelActiveStats = computed(() => {
        const e = reelW(reelActiveMode.value);
        let mx = 0; const vals = [];
        for (const v of Object.values(e.weights)) {
          if (typeof v === 'number') { if (v > mx) mx = v; if (v > 0) vals.push(v); }
        }
        vals.sort((a, b) => b - a);
        const th = vals.length <= 2 ? 0 : vals[1];
        return { mx, th };
      });
      function reelMaxWeight(mode) {
        if (mode === reelActiveMode.value) return _reelActiveStats.value.mx;
        const e = reelW(mode);
        let mx = 0;
        for (const v of Object.values(e.weights)) {
          if (typeof v === 'number' && v > mx) mx = v;
        }
        return mx;
      }
      // v3.5 / #6:強化熱力圖
      //   - 0:顯眼灰底(提示「這個 cell 完全不會出」)
      //   - 中段:sqrt 加速色彩變化,讓 50-150 的差異看得出來
      //   - 最大值:濃紫
      function reelHeatColor(mode, w) {
        if (w === 0 || w === undefined || w === null) {
          return 'rgba(120,120,140,0.10)';  // 灰底
        }
        const mx = reelMaxWeight(mode);
        if (!mx) return 'transparent';
        // sqrt 讓低權重區也有顏色差,而不是大半都接近透明
        const ratio = Math.sqrt(Math.min(1, w / mx));
        return `rgba(140, 110, 220, ${(0.08 + 0.50 * ratio).toFixed(3)})`;
      }
      // v3.5 / #6:該模式內整表 top-N(預設 2)的 weight 門檻
      function _topNThreshold(weights, n = 2) {
        const vals = Object.values(weights).filter(v => typeof v === 'number' && v > 0);
        if (vals.length <= n) return 0; // 不夠多,不標
        vals.sort((a, b) => b - a);
        return vals[n - 1];
      }
      function reelIsTopWeight(mode, r, sid) {
        const e = reelW(mode);
        const v = Number(e.weights[`${r}-${sid}`]) || 0;
        if (v <= 0) return false;
        const th = (mode === reelActiveMode.value)
          ? _reelActiveStats.value.th
          : _topNThreshold(e.weights, 2);
        return th > 0 && v >= th;
      }
      function reelTotalForRow(mode, reel_id) {
        const e = reelW(mode);
        let s = 0;
        for (const sid of e.symbol_ids) {
          const v = e.weights[`${reel_id}-${sid}`];
          if (typeof v === 'number') s += v;
        }
        return s;
      }
      // 一鍵填整列為均勻 100
      function reelFillRowUniform(mode, reel_id, v = 100) {
        _pushUndo("reel", mode);        const e = reelW(mode);
        for (const sid of e.symbol_ids) e.weights[`${reel_id}-${sid}`] = v;
      }
      // 把某 Reel 的權重複製到所有 Reel
      function reelCopyToAll(mode, from_reel) {
        _pushUndo("reel", mode);        const e = reelW(mode);
        for (let r = 1; r <= layout.length; r++) {
          if (r === from_reel) continue;
          for (const sid of e.symbol_ids) {
            e.weights[`${r}-${sid}`] = e.weights[`${from_reel}-${sid}`] ?? 0;
          }
        }
      }
      // 04 排序:重新排列 symbol_ids 順序(只動欄,不動權重值)
      function sortReelSymbols(mode, by) {
        const e = reelW(mode);
        if (by === 'alpha-asc') {
          e.symbol_ids.sort((a, b) => a.localeCompare(b));
        } else if (by === 'alpha-desc') {
          e.symbol_ids.sort((a, b) => b.localeCompare(a));
        } else if (by === 'weight-desc' || by === 'weight-asc') {
          const totals = {};
          for (const sid of e.symbol_ids) {
            let t = 0;
            for (let r = 1; r <= layout.length; r++) {
              const v = e.weights[`${r}-${sid}`];
              if (typeof v === 'number') t += v;
            }
            totals[sid] = t;
          }
          if (by === 'weight-desc') {
            e.symbol_ids.sort((a, b) => totals[b] - totals[a]);
          } else {
            e.symbol_ids.sort((a, b) => totals[a] - totals[b]);
          }
        }
      }

      // ── 矩陣「行(Reel)」視覺排序狀態 ──
      // key:`${kind}:${mode}` → 'default' | 'weight-desc' | 'weight-asc'
      // ⚠ 純視覺排序!不會修改 layout 陣列或 reel_id,02_Layout 對應永遠保持
      const matrixRowSort = reactive({});
      function rowSortKey(kind, mode) { return `${kind}:${mode}`; }
      function getRowSort(kind, mode) {
        return matrixRowSort[rowSortKey(kind, mode)] || 'default';
      }
      function setRowSort(kind, mode, by) {
        matrixRowSort[rowSortKey(kind, mode)] = by;
      }
      // 取得某 mode 的「按 row 排序後」layout(視覺用)
      function sortedReels(kind, mode) {
        const by = getRowSort(kind, mode);
        if (by === 'default') return layout;
        // 計算每個 reel 的總權重(依矩陣類型不同)
        const totals = {};
        for (const r of layout) {
          let t = 0;
          if (kind === 'reel') {
            const e = reelW(mode);
            for (const sid of e.symbol_ids) {
              const v = e.weights[`${r.reel_id}-${sid}`];
              if (typeof v === 'number') t += v;
            }
          } else if (kind === 'grid') {
            const e = gridW(mode);
            for (const sz of e.grid_sizes) {
              const v = e.weights[`${r.reel_id}-${sz}`];
              if (typeof v === 'number') t += v;
            }
          } else if (kind === 'combo') {
            const e = comboW(mode);
            for (const step of e.steps) {
              for (const sid of e.symbol_ids) {
                const v = e.weights[`${step}-${r.reel_id}-${sid}`];
                if (typeof v === 'number') t += v;
              }
            }
          }
          totals[r.reel_id] = t;
        }
        const arr = [...layout];
        if (by === 'weight-desc') {
          arr.sort((a, b) => totals[b.reel_id] - totals[a.reel_id]);
        } else {
          arr.sort((a, b) => totals[a.reel_id] - totals[b.reel_id]);
        }
        return arr;
      }

      // ──────────────────────────────────────────────────────────
      //  矩陣「模式級操作」共用 menu(04 / 05 / 08 通用)
      //  避免逐格點擊;支援整表縮放、複製模式、正規化等批次操作
      // ──────────────────────────────────────────────────────────
      // popover open state:同時間只開一個 menu
      const matrixMenu = reactive({
        open: false,
        kind: null,   // 'reel' | 'grid' | 'combo'
        mode: null,   // current mode name
        step: null,   // combo only
        copyPick: false,  // 「從另一模式複製」是否已展開源模式選擇
      });
      function openMatrixMenu(kind, mode, step) {
        // 點同一顆按鈕再開等於 toggle 關閉
        if (matrixMenu.open && matrixMenu.kind === kind && matrixMenu.mode === mode
            && (matrixMenu.step || null) === (step || null)) {
          matrixMenu.open = false;
          matrixMenu.copyPick = false;
          return;
        }
        matrixMenu.kind = kind;
        matrixMenu.mode = mode;
        matrixMenu.step = step || null;
        matrixMenu.copyPick = false;
        matrixMenu.open = true;
      }
      function closeMatrixMenu() {
        matrixMenu.open = false;
        matrixMenu.copyPick = false;
      }
      // 全域點擊監聽:點 popover 外面就關閉(在 onMounted 註冊)
      // 同時處理 matrix menu 和 health popover 兩個 popover
      function _onDocClickForMatrixMenu(ev) {
        const t = ev.target;
        // ─ matrix menu ─
        if (matrixMenu.open) {
          if (t && t.closest && (t.closest('.cfg-matrix-menu-popover') || t.closest('.cfg-matrix-menu-btn'))) {
            // 點在 popover 自身或開啟按鈕上,不關閉
          } else {
            closeMatrixMenu();
          }
        }
        // ─ health popover ─
        if (validationPanelOpen.value) {
          if (t && t.closest && (t.closest('.cfg-health-popover') || t.closest('.cfg-health-badge'))) {
            // 點在自身或徽章上,不關閉
          } else {
            validationPanelOpen.value = false;
          }
        }
        // ─ changes popover ─
        if (changesPanelOpen.value) {
          if (t && t.closest && (t.closest('.cfg-changes-popover') || t.closest('.cfg-changes-badge'))) {
            // 點在自身或徽章上,不關閉
          } else {
            changesPanelOpen.value = false;
          }
        }
      }

      // 取得當前矩陣的權重容器(回傳 weights map + 預期的 key prefix function)
      function _getMatrixCtx(kind, mode, step) {
        if (kind === 'reel') {
          const e = reelW(mode);
          // key: "r-sid";iter:layout × symbol_ids
          return {
            weights: e.weights,
            iter: function* () {
              for (let r = 1; r <= layout.length; r++) {
                for (const sid of e.symbol_ids) yield `${r}-${sid}`;
              }
            },
            rowKey: (r) => (sid) => `${r}-${sid}`,
            cols: e.symbol_ids,
          };
        }
        if (kind === 'grid') {
          const e = gridW(mode);
          return {
            weights: e.weights,
            iter: function* () {
              for (let r = 1; r <= layout.length; r++) {
                for (const s of e.grid_sizes) yield `${r}-${s}`;
              }
            },
            rowKey: (r) => (s) => `${r}-${s}`,
            cols: e.grid_sizes,
          };
        }
        if (kind === 'combo') {
          const e = comboW(mode);
          // step null = 全爆階段;否則指定 step
          const steps = (step == null) ? e.steps : [step];
          return {
            weights: e.weights,
            iter: function* () {
              for (const st of steps) {
                for (let r = 1; r <= layout.length; r++) {
                  for (const sid of e.symbol_ids) yield `${st}-${r}-${sid}`;
                }
              }
            },
            rowKey: (r) => (sid) => `${(step == null ? e.steps[0] : step)}-${r}-${sid}`,
            cols: (step == null) ? [] : e.symbol_ids, // 正規化在全爆階段下不支援
            stepsAll: steps,
          };
        }
        return null;
      }

      // 「整表 × factor」— factor 可為 0.5, 2, 1.5...;四捨五入,最小為 0
      function matrixScale(kind, mode, step, factor) {
        _pushUndo(kind, mode);        const ctx = _getMatrixCtx(kind, mode, step);
        if (!ctx) return;
        for (const k of ctx.iter()) {
          const v = ctx.weights[k];
          if (typeof v === 'number') {
            ctx.weights[k] = Math.max(0, Math.round(v * factor));
          }
        }
        const scope = (kind === 'combo' && step == null) ? '(全爆)' : (step != null ? `(第${step}爆)` : '');
        emit('status', { type: 'ok', msg: `${mode} ${scope} 整表 × ${factor}` });
        closeMatrixMenu();
      }

      // 「整表填同值」— value 預設 100;適合快速重置
      function matrixFillAll(kind, mode, step, value) {
        _pushUndo(kind, mode);        const v = Math.max(0, Math.round(Number(value) || 0));
        const ctx = _getMatrixCtx(kind, mode, step);
        if (!ctx) return;
        for (const k of ctx.iter()) ctx.weights[k] = v;
        const scope = (kind === 'combo' && step == null) ? '(全爆)' : (step != null ? `(第${step}爆)` : '');
        emit('status', { type: 'ok', msg: `${mode} ${scope} 整表填 ${v}` });
        closeMatrixMenu();
      }
      // 「整表清空為 0」— 含 confirm,因為破壞性較強
      function matrixClearAll(kind, mode, step) {
        _pushUndo(kind, mode);        const scope = (kind === 'combo' && step == null) ? '(全爆階段)' : (step != null ? `(第 ${step} 爆)` : '');
        if (!confirm(`確定要把「${mode}」${scope} 整表清空為 0 嗎?\n\n所有 cell 會變為 0,此動作不可復原。`)) {
          return;
        }
        matrixFillAll(kind, mode, step, 0);
      }

      // 「正規化每列」— 每個 reel 列各自加總 → 100(權重相對比例不變)
      // 不適用於 combo 全爆階段(語意模糊)
      function matrixNormalizeRows(kind, mode, step) {
        _pushUndo(kind, mode);        if (kind === 'combo' && step == null) {
          emit('status', { type: 'err', msg: '請先選擇某個爆階段再正規化' });
          return;
        }
        const ctx = _getMatrixCtx(kind, mode, step);
        if (!ctx || !ctx.cols || ctx.cols.length === 0) return;
        for (let r = 1; r <= layout.length; r++) {
          const keyFn = ctx.rowKey(r);
          let sum = 0;
          for (const c of ctx.cols) {
            const v = ctx.weights[keyFn(c)];
            if (typeof v === 'number') sum += v;
          }
          if (sum <= 0) continue;   // 整列為 0 → 不動,避免除零
          for (const c of ctx.cols) {
            const k = keyFn(c);
            const v = ctx.weights[k];
            if (typeof v === 'number') {
              ctx.weights[k] = Math.max(0, Math.round(v * 100 / sum));
            }
          }
        }
        const scope = (step != null ? `(第${step}爆)` : '');
        emit('status', { type: 'ok', msg: `${mode} ${scope} 每列已正規化至 100` });
        closeMatrixMenu();
      }

      // 「從另一模式複製」— deep clone 來源權重覆蓋當前模式
      // combo 模式:若 step 為 null 複製整個 entry,否則只複製單一爆階段
      function matrixCopyFromMode(kind, mode, step, srcMode) {
        _pushUndo(kind, mode);        if (!srcMode || srcMode === mode) {
          emit('status', { type: 'err', msg: '無效的來源模式' });
          return;
        }
        if (kind === 'reel') {
          const src = reelW(srcMode);
          const dst = reelW(mode);
          dst.symbol_ids = [...src.symbol_ids];
          dst.weights = JSON.parse(JSON.stringify(src.weights));
        } else if (kind === 'grid') {
          const src = gridW(srcMode);
          const dst = gridW(mode);
          dst.grid_sizes = [...src.grid_sizes];
          dst.weights = JSON.parse(JSON.stringify(src.weights));
        } else if (kind === 'combo') {
          const src = comboW(srcMode);
          const dst = comboW(mode);
          if (step == null) {
            // 全表複製:含 steps 結構
            dst.steps = [...src.steps];
            dst.symbol_ids = [...src.symbol_ids];
            dst.weights = JSON.parse(JSON.stringify(src.weights));
            // 重置當前 active step
            comboActiveStep[mode] = dst.steps[0];
          } else {
            // 單一爆階段:從 src 對應 step 複製,若 src 沒有該 step 用 src.steps[0]
            const srcStep = src.steps.includes(step) ? step : src.steps[0];
            // symbol_ids 必須跟當前一致;若不同就以當前為準(複製能對齊的部份)
            for (let r = 1; r <= layout.length; r++) {
              for (const sid of dst.symbol_ids) {
                const srcKey = `${srcStep}-${r}-${sid}`;
                const dstKey = `${step}-${r}-${sid}`;
                if (srcKey in src.weights) {
                  dst.weights[dstKey] = src.weights[srcKey];
                }
              }
            }
          }
        }
        const scope = (kind === 'combo' && step == null) ? '(全爆)' : (step != null ? `(第${step}爆)` : '');
        emit('status', { type: 'ok', msg: `已從 ${srcMode} 複製到 ${mode} ${scope}` });
        closeMatrixMenu();
      }

      // 給 popover UI 取「其他模式」清單
      function matrixOtherModes(mode) {
        return modeNames.value.filter(m => m && m !== mode);
      }
      // ── 05_Grid_Size_Weights 狀態 ──
      const gridWeights = reactive(loadGridWeights());
      const gridWeightsDebugJson = computed(() => JSON.stringify(gridWeights, null, 2));

      const _fillSigGrid = {};
      function ensureGridWeightsForMode(name) {
        if (!gridWeights[name]) {
          gridWeights[name] = {
            grid_sizes: [...DEFAULT_GRID_SIZES],
            weights: {},
            notes: '',
          };
        }
        const entry = gridWeights[name];
        const sig = layout.length + '|' + layout.map(r => r.reel_id).join(',') + '|' + entry.grid_sizes.join(',');
        if (_fillSigGrid[name] === sig) return;
        for (let r = 1; r <= layout.length; r++) {
          for (const s of entry.grid_sizes) {
            const k = `${r}-${s}`;
            if (!(k in entry.weights)) entry.weights[k] = 100;
          }
        }
        _fillSigGrid[name] = sig;
      }
      function gridW(mode) { ensureGridWeightsForMode(mode); return gridWeights[mode]; }
      function gridSizesStr(mode) { return gridW(mode).grid_sizes.join(', '); }
      function setGridSizesStr(mode, str) {
        const parsed = parseGridSizes(str);
        if (!parsed) return;
        const entry = gridW(mode);
        entry.grid_sizes = parsed;
        for (let r = 1; r <= layout.length; r++) {
          for (const s of parsed) {
            const k = `${r}-${s}`;
            if (!(k in entry.weights)) entry.weights[k] = 100;
          }
        }
      }
      function gridTotalForRow(mode, reel_id) {
        const e = gridW(mode);
        let s = 0;
        for (const sz of e.grid_sizes) {
          const v = e.weights[`${reel_id}-${sz}`];
          if (typeof v === 'number') s += v;
        }
        return s;
      }
      // v3.5 / #8:對齊 04,讓 05 sticky bar 也有 Max meta
      //   效能:活躍模式的 max 用 computed 快取(gridHeatColor 每格讀取)。
      const _gridActiveMax = computed(() => {
        const e = gridW(gridActiveMode.value);
        let mx = 0;
        for (const v of Object.values(e.weights)) {
          if (typeof v === 'number' && v > mx) mx = v;
        }
        return mx;
      });
      function gridMaxWeight(mode) {
        if (mode === gridActiveMode.value) return _gridActiveMax.value;
        const e = gridW(mode);
        let mx = 0;
        for (const v of Object.values(e.weights)) {
          if (typeof v === 'number' && v > mx) mx = v;
        }
        return mx;
      }
      function gridFillRowUniform(mode, reel_id, v = 100) {
        _pushUndo("grid", mode);        const e = gridW(mode);
        for (const sz of e.grid_sizes) e.weights[`${reel_id}-${sz}`] = v;
      }
      // 05 排序:重新排列 grid_sizes 順序
      function sortGridSizes(mode, by) {
        const e = gridW(mode);
        if (by === 'num-asc') {
          e.grid_sizes.sort((a, b) => a - b);
        } else if (by === 'num-desc') {
          e.grid_sizes.sort((a, b) => b - a);
        } else if (by === 'weight-desc' || by === 'weight-asc') {
          const totals = {};
          for (const sz of e.grid_sizes) {
            let t = 0;
            for (let r = 1; r <= layout.length; r++) {
              const v = e.weights[`${r}-${sz}`];
              if (typeof v === 'number') t += v;
            }
            totals[sz] = t;
          }
          if (by === 'weight-desc') {
            e.grid_sizes.sort((a, b) => totals[b] - totals[a]);
          } else {
            e.grid_sizes.sort((a, b) => totals[a] - totals[b]);
          }
        }
      }

      // ── 08_Combo_Weights 狀態 ──
      const comboWeights = reactive(loadComboWeights());
      const comboWeightsDebugJson = computed(() => JSON.stringify(comboWeights, null, 2));
      // UI 狀態:每個模式當前正在編輯哪個 step(不持久化)
      const comboActiveStep = reactive({});

      const _fillSigCombo = {};
      function ensureComboWeightsForMode(name) {
        if (!comboWeights[name]) {
          const syms = symbolNames.value.length > 0
            ? [...symbolNames.value]
            : ['WILD', 'H1', 'H2', 'H3', 'L1', 'L2', 'L3', 'L4'];
          comboWeights[name] = {
            steps: [1, 2],
            symbol_ids: syms,
            weights: {},
            notes: '',
          };
        }
        const e = comboWeights[name];
        const sig = layout.length + '|' + layout.map(r => r.reel_id).join(',') + '|' + e.steps.join(',') + '|' + e.symbol_ids.join(',');
        if (_fillSigCombo[name] !== sig) {
          for (const step of e.steps) {
            for (let r = 1; r <= layout.length; r++) {
              for (const sid of e.symbol_ids) {
                const k = `${step}-${r}-${sid}`;
                if (!(k in e.weights)) e.weights[k] = 100;
              }
            }
          }
          _fillSigCombo[name] = sig;
        }
        if (!comboActiveStep[name] || !e.steps.includes(comboActiveStep[name])) {
          comboActiveStep[name] = e.steps[0];
        }
      }
      function comboW(mode) { ensureComboWeightsForMode(mode); return comboWeights[mode]; }
      function comboOtherSteps(mode) {
        const cur = comboActiveStep[mode];
        return comboW(mode).steps.filter(function(s) { return s !== cur; });
      }
      function comboSymbolIdsStr(mode) { return comboW(mode).symbol_ids.join(', '); }
      function setComboSymbolIdsStr(mode, str) {
        const parsed = parseSymbolIds(str);
        if (!parsed) return;
        const e = comboW(mode);
        e.symbol_ids = parsed;
        for (const step of e.steps) {
          for (let r = 1; r <= layout.length; r++) {
            for (const sid of parsed) {
              const k = `${step}-${r}-${sid}`;
              if (!(k in e.weights)) e.weights[k] = 100;
            }
          }
        }
      }
      // v3.5 / #9:從 03_Symbols 同步符號清單到 combo
      function comboSyncFromRegistry(mode) {
        const ids = _registrySymbolIds();
        if (ids.length === 0) {
          emit('status', { type: 'warn', msg: '03_Symbols 沒有任何符號' });
          return;
        }
        setComboSymbolIdsStr(mode, ids.join(', '));
        emit('status', { type: 'ok', msg: `已從 03_Symbols 同步 ${ids.length} 個符號(套用到所有爆階段)` });
      }
      // v3.5 / #14:平均占比預覽
      //  - reel:每個符號平均出現比例 = mean over reels of (weight / row_total)
      //  - combo:同上,但只看當前 step
      //  - grid 不適用(格數機制不同)
      function reelSymbolAvgProb(mode) {
        const e = reelW(mode);
        const result = {};
        for (const sid of e.symbol_ids) result[sid] = 0;
        let validRows = 0;
        for (let r = 1; r <= layout.length; r++) {
          let total = 0;
          const rowVals = {};
          for (const sid of e.symbol_ids) {
            const v = Number(e.weights[`${r}-${sid}`]) || 0;
            rowVals[sid] = v;
            total += v;
          }
          if (total <= 0) continue;
          validRows++;
          for (const sid of e.symbol_ids) result[sid] += rowVals[sid] / total;
        }
        if (validRows === 0) return null;
        for (const sid of e.symbol_ids) result[sid] = (result[sid] / validRows) * 100;
        return result; // { sid: percent }
      }
      function comboSymbolAvgProb(mode, step) {
        const e = comboW(mode);
        const result = {};
        for (const sid of e.symbol_ids) result[sid] = 0;
        let validRows = 0;
        for (let r = 1; r <= layout.length; r++) {
          let total = 0;
          const rowVals = {};
          for (const sid of e.symbol_ids) {
            const v = Number(e.weights[`${step}-${r}-${sid}`]) || 0;
            rowVals[sid] = v;
            total += v;
          }
          if (total <= 0) continue;
          validRows++;
          for (const sid of e.symbol_ids) result[sid] += rowVals[sid] / total;
        }
        if (validRows === 0) return null;
        for (const sid of e.symbol_ids) result[sid] = (result[sid] / validRows) * 100;
        return result;
      }
      function gridSizeAvgProb(mode) {
        const e = gridW(mode);
        const result = {};
        for (const sz of e.grid_sizes) result[sz] = 0;
        let validRows = 0;
        for (let r = 1; r <= layout.length; r++) {
          let total = 0;
          const rowVals = {};
          for (const sz of e.grid_sizes) {
            const v = Number(e.weights[`${r}-${sz}`]) || 0;
            rowVals[sz] = v;
            total += v;
          }
          if (total <= 0) continue;
          validRows++;
          for (const sz of e.grid_sizes) result[sz] += rowVals[sz] / total;
        }
        if (validRows === 0) return null;
        for (const sz of e.grid_sizes) result[sz] = (result[sz] / validRows) * 100;
        return result;
      }
      function fmtPct(p) {
        if (p == null || isNaN(p)) return '–';
        if (p < 0.05) return '0%';
        if (p >= 99.95) return '100%';
        if (p < 10) return p.toFixed(1) + '%';
        return Math.round(p) + '%';
      }
      // 顯示開關
      const probBarOpen = ref(true);
      function toggleProbBar() { probBarOpen.value = !probBarOpen.value; }

      function comboMaxWeight(mode, step) {
        const e = comboW(mode);
        let mx = 0;
        for (let r = 1; r <= layout.length; r++) {
          for (const sid of e.symbol_ids) {
            const v = e.weights[`${step}-${r}-${sid}`];
            if (typeof v === 'number' && v > mx) mx = v;
          }
        }
        return mx;
      }
      function comboHeatColor(mode, step, w) {
        if (w === 0 || w === undefined || w === null) {
          return 'rgba(120,120,140,0.10)';  // 灰底
        }
        const mx = comboMaxWeight(mode, step);
        if (!mx) return 'transparent';
        const ratio = Math.sqrt(Math.min(1, w / mx));
        return `rgba(255, 150, 100, ${(0.08 + 0.55 * ratio).toFixed(3)})`; // 橘色,跟 04 紫色區隔
      }
      // v3.5 / #6:08 該 step 內 top-N 判斷
      function comboIsTopWeight(mode, step, r, sid) {
        const e = comboW(mode);
        const v = Number(e.weights[`${step}-${r}-${sid}`]) || 0;
        if (v <= 0) return false;
        // 只看當前 step 的 cells
        const subset = {};
        for (let rr = 1; rr <= layout.length; rr++) {
          for (const s of e.symbol_ids) {
            const k = `${step}-${rr}-${s}`;
            if (typeof e.weights[k] === 'number') subset[k] = e.weights[k];
          }
        }
        const th = _topNThreshold(subset, 2);
        return th > 0 && v >= th;
      }
      function comboTotalForRow(mode, step, reel) {
        const e = comboW(mode);
        let s = 0;
        for (const sid of e.symbol_ids) {
          const v = e.weights[`${step}-${reel}-${sid}`];
          if (typeof v === 'number') s += v;
        }
        return s;
      }
      function comboFillRowUniform(mode, step, reel, v = 100) {
        _pushUndo("combo", mode);        const e = comboW(mode);
        for (const sid of e.symbol_ids) e.weights[`${step}-${reel}-${sid}`] = v;
      }
      function comboCopyToAllReels(mode, step, from_reel) {
        _pushUndo("combo", mode);        const e = comboW(mode);
        for (let r = 1; r <= layout.length; r++) {
          if (r === from_reel) continue;
          for (const sid of e.symbol_ids) {
            e.weights[`${step}-${r}-${sid}`] = e.weights[`${step}-${from_reel}-${sid}`] ?? 0;
          }
        }
      }
      // 08 排序:重新排列 symbol_ids(跨所有 step + reel 加總比較)
      function sortComboSymbols(mode, by) {
        const e = comboW(mode);
        if (by === 'alpha-asc') {
          e.symbol_ids.sort((a, b) => a.localeCompare(b));
        } else if (by === 'alpha-desc') {
          e.symbol_ids.sort((a, b) => b.localeCompare(a));
        } else if (by === 'weight-desc' || by === 'weight-asc') {
          const totals = {};
          for (const sid of e.symbol_ids) {
            let t = 0;
            for (const step of e.steps) {
              for (let r = 1; r <= layout.length; r++) {
                const v = e.weights[`${step}-${r}-${sid}`];
                if (typeof v === 'number') t += v;
              }
            }
            totals[sid] = t;
          }
          if (by === 'weight-desc') {
            e.symbol_ids.sort((a, b) => totals[b] - totals[a]);
          } else {
            e.symbol_ids.sort((a, b) => totals[a] - totals[b]);
          }
        }
      }
      function comboCopyStepTo(mode, from_step, to_step) {
        _pushUndo("combo", mode);        const e = comboW(mode);
        for (let r = 1; r <= layout.length; r++) {
          for (const sid of e.symbol_ids) {
            e.weights[`${to_step}-${r}-${sid}`] = e.weights[`${from_step}-${r}-${sid}`] ?? 0;
          }
        }
      }

      // ──────────────────────────────────────────────────────────
      //  v3.5 / #4A + #4B:08 三種檢視模式
      //   - edit:單一 step 編輯(現況)
      //   - compare:所有 step 並排,當前 step 可編輯,其他 read-only
      //   - diff:所有 step 並排,非當前 step 顯示相對於「baseline step」的 ±%
      //  各模式的 baseline step 預設是 comboActiveStep[mode]
      // ──────────────────────────────────────────────────────────
      const comboViewMode = ref('edit');
      function setComboViewMode(v) { comboViewMode.value = v; }

      // v3.6 / #3:diff 模式 baseline step 選擇
      //   - 預設 null,實際 baseline 走 effectiveDiffBaseline()(回退到 comboActiveStep)
      //   - 結構:{ mode: step } 各模式各自記
      //   - 切換 mode、刪除 step 時自動清空無效的 baseline
      const comboDiffBaseline = reactive({});
      function effectiveDiffBaseline(mode) {
        const e = comboW(mode);
        const pinned = comboDiffBaseline[mode];
        if (pinned != null && e.steps.includes(pinned)) return pinned;
        return comboActiveStep[mode];
      }
      function setComboDiffBaseline(mode, step) {
        if (step == null) {
          delete comboDiffBaseline[mode];
        } else {
          comboDiffBaseline[mode] = step;
        }
      }
      function isComboDiffBaselinePinned(mode) {
        const e = comboW(mode);
        const pinned = comboDiffBaseline[mode];
        return pinned != null && e.steps.includes(pinned);
      }

      // v3.6 / #4:compare/diff 模式可隱藏部分 step,避免太多 step 太擠
      //   - 預設全部顯示
      //   - 結構:{ mode: Set<step> }(內含「隱藏」的 step,所有 step - 此 set = 可見)
      //   - 不存在的 mode key 預設為空 set(全顯示)
      const comboHiddenSteps = reactive({});
      function _ensureHiddenSet(mode) {
        if (!comboHiddenSteps[mode]) comboHiddenSteps[mode] = new Set();
        return comboHiddenSteps[mode];
      }
      function comboStepVisible(mode, step) {
        const s = comboHiddenSteps[mode];
        return !(s && s.has(step));
      }
      function toggleComboStepVisible(mode, step) {
        const s = _ensureHiddenSet(mode);
        if (s.has(step)) s.delete(step);
        else {
          // 不允許隱藏 baseline(基準必須顯示)
          if (step === effectiveDiffBaseline(mode)) {
            emit('status', { type: 'warn', msg: '基準爆階段無法隱藏(請先換基準)' });
            return;
          }
          // 不允許隱藏 active step(否則 compare 模式沒地方編輯)
          if (step === comboActiveStep[mode]) {
            emit('status', { type: 'warn', msg: '當前爆階段無法隱藏(請先切換當前)' });
            return;
          }
          s.add(step);
        }
        // 強制 reactive
        comboHiddenSteps[mode] = new Set(s);
      }
      function comboVisibleSteps(mode) {
        const e = comboW(mode);
        const hidden = comboHiddenSteps[mode];
        if (!hidden || hidden.size === 0) return e.steps.slice();
        return e.steps.filter(s => !hidden.has(s));
      }
      function comboHiddenCount(mode) {
        const s = comboHiddenSteps[mode];
        return s ? s.size : 0;
      }
      function comboShowAllSteps(mode) {
        if (comboHiddenSteps[mode]) {
          comboHiddenSteps[mode] = new Set();
        }
      }

      // 差異 cell 改用 effective baseline 計算
      // diff 計算:other_step.weight vs base_step.weight
      // 回傳 { delta: number | null, sign: 'up'|'down'|'eq'|'na' }
      //   - 兩邊都 0 → 'eq'
      //   - base 是 0 但 other > 0 → 'up' (delta = null,顯示 "+new")
      //   - base > 0 但 other 是 0 → 'down' (delta = -100,顯示 "✕")
      //   - 其他 → 計算百分比變化
      function comboCellDiff(mode, base_step, other_step, r, sid) {
        if (base_step === other_step) return { delta: 0, sign: 'eq' };
        const e = comboW(mode);
        const bv = Number(e.weights[`${base_step}-${r}-${sid}`]) || 0;
        const ov = Number(e.weights[`${other_step}-${r}-${sid}`]) || 0;
        if (bv === 0 && ov === 0) return { delta: 0, sign: 'eq', empty: true };
        if (bv === 0 && ov > 0)   return { delta: null, sign: 'up', other_value: ov };
        if (bv > 0 && ov === 0)   return { delta: -100, sign: 'down', base_value: bv };
        const pct = ((ov - bv) / bv) * 100;
        if (Math.abs(pct) < 0.5)  return { delta: 0, sign: 'eq' };
        return { delta: pct, sign: pct > 0 ? 'up' : 'down' };
      }
      function comboDiffLabel(d) {
        if (!d) return '';
        if (d.sign === 'eq') return d.empty ? '·' : '=';
        if (d.sign === 'up' && d.delta == null) return '+new';
        if (d.sign === 'down' && d.delta === -100) return '✕';
        const v = Math.abs(d.delta);
        const sign = d.delta > 0 ? '+' : '−';
        if (v < 10) return sign + v.toFixed(1) + '%';
        if (v >= 1000) return sign + '≫';
        return sign + Math.round(v) + '%';
      }

      // ──────────────────────────────────────────────────────────
      //  v3.6 / #5:reel / grid 整 mode 比較(類似 #4A/#4B,但維度是「模式」)
      //   - reelViewMode / gridViewMode:'edit' | 'compare' | 'diff'
      //   - 比較的是「所有模式並排」(不是 step)
      //   - baseline mode 預設 reelActiveMode / gridActiveMode,可 pin
      //   - 隱藏 mode 機制同 combo:reelHiddenModes / gridHiddenModes
      // ──────────────────────────────────────────────────────────
      const reelViewMode = ref('edit');
      const gridViewMode = ref('edit');
      function setReelViewMode(v) { reelViewMode.value = v; }
      function setGridViewMode(v) { gridViewMode.value = v; }

      // baseline mode(若 pin 且該 mode 存在 → 用 pinned,否則 fallback 到 active)
      const reelDiffBaselineMode = ref('');
      const gridDiffBaselineMode = ref('');
      function effectiveReelBaselineMode() {
        const pin = reelDiffBaselineMode.value;
        if (pin && modeNames.value.includes(pin)) return pin;
        return reelActiveMode.value;
      }
      function effectiveGridBaselineMode() {
        const pin = gridDiffBaselineMode.value;
        if (pin && modeNames.value.includes(pin)) return pin;
        return gridActiveMode.value;
      }
      function setReelBaselineMode(m) {
        if (!m || m === effectiveReelBaselineMode()) reelDiffBaselineMode.value = '';
        else reelDiffBaselineMode.value = m;
      }
      function setGridBaselineMode(m) {
        if (!m || m === effectiveGridBaselineMode()) gridDiffBaselineMode.value = '';
        else gridDiffBaselineMode.value = m;
      }
      function isReelBaselinePinned() {
        return reelDiffBaselineMode.value && modeNames.value.includes(reelDiffBaselineMode.value);
      }
      function isGridBaselinePinned() {
        return gridDiffBaselineMode.value && modeNames.value.includes(gridDiffBaselineMode.value);
      }

      // 隱藏 mode(同 combo 的 hidden step)
      const reelHiddenModes = reactive(new Set());
      const gridHiddenModes = reactive(new Set());
      function reelModeVisible(m) { return !reelHiddenModes.has(m); }
      function gridModeVisible(m) { return !gridHiddenModes.has(m); }
      function toggleReelModeVisible(m) {
        if (reelHiddenModes.has(m)) reelHiddenModes.delete(m);
        else {
          if (m === effectiveReelBaselineMode()) {
            emit('status', { type: 'warn', msg: '基準模式無法隱藏(請先換基準)' });
            return;
          }
          if (m === reelActiveMode.value) {
            emit('status', { type: 'warn', msg: '當前模式無法隱藏(請先切換當前)' });
            return;
          }
          reelHiddenModes.add(m);
        }
      }
      function toggleGridModeVisible(m) {
        if (gridHiddenModes.has(m)) gridHiddenModes.delete(m);
        else {
          if (m === effectiveGridBaselineMode()) {
            emit('status', { type: 'warn', msg: '基準模式無法隱藏(請先換基準)' });
            return;
          }
          if (m === gridActiveMode.value) {
            emit('status', { type: 'warn', msg: '當前模式無法隱藏(請先切換當前)' });
            return;
          }
          gridHiddenModes.add(m);
        }
      }
      function reelVisibleModes() {
        return modeNames.value.filter(m => !reelHiddenModes.has(m));
      }
      function gridVisibleModes() {
        return modeNames.value.filter(m => !gridHiddenModes.has(m));
      }
      function reelShowAllModes() { reelHiddenModes.clear(); }
      function gridShowAllModes() { gridHiddenModes.clear(); }
      function reelHiddenCount() { return reelHiddenModes.size; }
      function gridHiddenCount() { return gridHiddenModes.size; }

      // cell diff(對 reel:base_mode vs other_mode 的同 cell 比較)
      function _cellDiff(base, other) {
        if (base === 0 && other === 0) return { delta: 0, sign: 'eq', empty: true };
        if (base === 0 && other > 0)   return { delta: null, sign: 'up', other_value: other };
        if (base > 0 && other === 0)   return { delta: -100, sign: 'down', base_value: base };
        const pct = ((other - base) / base) * 100;
        if (Math.abs(pct) < 0.5)        return { delta: 0, sign: 'eq' };
        return { delta: pct, sign: pct > 0 ? 'up' : 'down' };
      }
      function reelCellDiff(base_mode, other_mode, r, sid) {
        if (base_mode === other_mode) return { delta: 0, sign: 'eq' };
        const eb = reelW(base_mode);
        const eo = reelW(other_mode);
        const bv = Number(eb.weights[`${r}-${sid}`]) || 0;
        const ov = Number(eo.weights[`${r}-${sid}`]) || 0;
        return _cellDiff(bv, ov);
      }
      function gridCellDiff(base_mode, other_mode, r, sz) {
        if (base_mode === other_mode) return { delta: 0, sign: 'eq' };
        const eb = gridW(base_mode);
        const eo = gridW(other_mode);
        const bv = Number(eb.weights[`${r}-${sz}`]) || 0;
        const ov = Number(eo.weights[`${r}-${sz}`]) || 0;
        return _cellDiff(bv, ov);
      }
      // diffLabel 跟 comboDiffLabel 邏輯一致,直接複用
      const cellDiffLabel = comboDiffLabel;

      function comboAddStep(mode) {
        const e = comboW(mode);
        const next = e.steps.length > 0 ? Math.max(...e.steps) + 1 : 1;
        e.steps.push(next);
        e.steps.sort((a, b) => a - b);
        for (let r = 1; r <= layout.length; r++) {
          for (const sid of e.symbol_ids) {
            e.weights[`${next}-${r}-${sid}`] = 100;
          }
        }
        comboActiveStep[mode] = next;
        emit('status', { type: 'ok', msg: `已新增第 ${next} 爆權重表` });
      }
      function comboRemoveStep(mode, step) {
        const e = comboW(mode);
        if (e.steps.length <= 1) return;
        if (!confirm(`確定要刪除模式 ${mode} 的第 ${step} 爆權重表嗎?\n此動作不可復原。`)) return;
        const idx = e.steps.indexOf(step);
        if (idx === -1) return;
        e.steps.splice(idx, 1);
        for (let r = 1; r <= layout.length; r++) {
          for (const sid of e.symbol_ids) {
            delete e.weights[`${step}-${r}-${sid}`];
          }
        }
        if (comboActiveStep[mode] === step) {
          comboActiveStep[mode] = e.steps[0];
        }
        emit('status', { type: 'ok', msg: `已刪除第 ${step} 爆權重表` });
      }

      // ── 10_Discard_Rules 狀態 ──
      const discards = reactive(loadDiscards());
      const discardsDebugJson = computed(() => JSON.stringify(discards, null, 2));

      const discardDuplicateIds = computed(() => {
        const seen = new Set();
        const dup = new Set();
        for (const d of discards) {
          const id = (d.discard_id || '').trim();
          if (!id) continue;
          if (seen.has(id)) dup.add(id);
          seen.add(id);
        }
        return dup;
      });

      function addDiscard() {
        const taken = new Set(discards.map(d => d.discard_id));
        let i = discards.length + 1;
        while (taken.has(`D${String(i).padStart(3, '0')}`)) i++;
        const newId = `D${String(i).padStart(3, '0')}`;
        discards.push(makeDiscard(newId));
        selectedDiscardIdx.value = discards.length - 1;
        emit('status', { type: 'ok', msg: `已新增棄牌規則 ${newId}` });
      }
      function removeDiscard(idx) {
        const d = discards[idx];
        if (!confirm(`確定要刪除棄牌規則「${d.discard_id || '(未命名)'}」嗎?`)) return;
        discards.splice(idx, 1);
        selectedDiscardIdx.value = Math.min(selectedDiscardIdx.value, Math.max(0, discards.length - 1));
        emit('status', { type: 'ok', msg: `已刪除棄牌規則「${d.discard_id}」` });
      }
      // 統計 HARD / SOFT 數量(畫面提示用)
      const discardStats = computed(() => {
        let hard = 0, soft = 0;
        for (const d of discards) {
          if (d.discard_kind === 'HARD') hard++;
          else if (d.discard_kind === 'SOFT') soft++;
        }
        return { hard, soft };
      });

      // ── 09_Puzzle_Rules 狀態 ──
      const rules = reactive(loadRules());
      const rulesDebugJson = computed(() => JSON.stringify(rules, null, 2));

      const ruleDuplicateIds = computed(() => {
        const seen = new Set();
        const dup = new Set();
        for (const r of rules) {
          const id = (r.rule_id || '').trim();
          if (!id) continue;
          if (seen.has(id)) dup.add(id);
          seen.add(id);
        }
        return dup;
      });

      // UI 暫存(不持久化):
      //   builderRowsMap[rule_id] = [...rows]  ← Condition 拼圖列
      //   ruleEditMode[rule_id]   = 'builder' | 'raw'
      //   ruleParseError[rule_id] = '...' | null  ← 切回建構模式時 parse 失敗的訊息
      const builderRowsMap = reactive({});
      const ruleEditMode = reactive({});
      const ruleParseError = reactive({});

      // 確保某條 rule 的 builder rows 已從 condition 解析過一次
      function ensureBuilderRows(rule) {
        if (!rule) return;
        const rid = rule.rule_id;
        if (!rid) return;
        if (rid in builderRowsMap) return;
        const parsed = parseCondition(rule.condition);
        if (parsed.ok) {
          builderRowsMap[rid] = parsed.rows;
          ruleEditMode[rid] = 'builder';
          ruleParseError[rid] = null;
        } else {
          builderRowsMap[rid] = [];
          ruleEditMode[rid] = 'raw';
          ruleParseError[rid] = parsed.error;
        }
      }
      // 從 builder rows 重新生成 condition 字串並寫回該 rule
      function rebuildConditionForRule(rule_idx) {
        const r = rules[rule_idx];
        if (!r) return;
        const rid = r.rule_id;
        const rowsRef = builderRowsMap[rid];
        if (!rowsRef) return;
        r.condition = buildCondition(rowsRef);
      }
      // 切換編輯模式;raw → builder 時嘗試 reparse
      function setRuleEditMode(rule, mode) {
        const rid = rule.rule_id;
        if (!rid) return;
        if (mode === 'builder') {
          const parsed = parseCondition(rule.condition);
          if (parsed.ok) {
            builderRowsMap[rid] = parsed.rows;
            ruleEditMode[rid] = 'builder';
            ruleParseError[rid] = null;
          } else {
            // 解析失敗,留在 raw 模式並提示
            ruleEditMode[rid] = 'raw';
            ruleParseError[rid] = parsed.error;
            emit('status', { type: 'err', msg: '無法切回建構模式:' + parsed.error });
          }
        } else {
          // builder → raw:不需要做什麼,condition 已是真相
          ruleEditMode[rid] = 'raw';
          ruleParseError[rid] = null;
        }
      }
      // 新增 / 移除 builder row
      function addBuilderRow(rule_idx, combinator = 'AND') {
        const r = rules[rule_idx];
        const rid = r.rule_id;
        if (!rid) return;
        if (!builderRowsMap[rid]) builderRowsMap[rid] = [];
        const newRow = {
          category: 'symbol_count', subkey: '', op: '>=', value: '0', combinator,
        };
        builderRowsMap[rid].push(newRow);
        rebuildConditionForRule(rule_idx);
      }
      function removeBuilderRow(rule_idx, row_idx) {
        const r = rules[rule_idx];
        const rid = r.rule_id;
        if (!rid || !builderRowsMap[rid]) return;
        builderRowsMap[rid].splice(row_idx, 1);
        rebuildConditionForRule(rule_idx);
      }
      // 取得當前 row 對應的 VAR_CATEGORY 物件
      function rowCategoryMeta(row) {
        return VAR_CATEGORY_MAP[row.category] || VAR_CATEGORIES[0];
      }
      // 切換 row 的 category 時要重置 subkey(避免殘留錯欄位)
      function changeRowCategory(rule_idx, row_idx, newCategory) {
        const r = rules[rule_idx];
        const rid = r.rule_id;
        if (!rid || !builderRowsMap[rid]) return;
        const row = builderRowsMap[rid][row_idx];
        if (!row) return;
        row.category = newCategory;
        const meta = VAR_CATEGORY_MAP[newCategory];
        if (!meta || !meta.needsSubkey) row.subkey = '';
        rebuildConditionForRule(rule_idx);
      }

      // CRUD
      function addRule() {
        const taken = new Set(rules.map(r => r.rule_id));
        let i = rules.length + 1;
        while (taken.has(`P${String(i).padStart(3, '0')}`)) i++;
        const newId = `P${String(i).padStart(3, '0')}`;
        rules.push(makeRule(newId));
        builderRowsMap[newId] = [];
        ruleEditMode[newId] = 'builder';
        ruleParseError[newId] = null;
        selectedRuleIdx.value = rules.length - 1;
        emit('status', { type: 'ok', msg: `已新增規則 ${newId}` });
      }

      // ──────────────────────────────────────────────────────
      //  規則庫 preset 抽屜
      // ──────────────────────────────────────────────────────
      const presetDrawerOpen = ref(false);
      const presetSearch = ref('');

      // 按搜尋詞過濾 + 仍按原本 group 結構回傳
      const filteredPresetGroups = computed(() => {
        const q = (presetSearch.value || '').trim().toLowerCase();
        if (!q) return PRESET_LIBRARY;
        const out = [];
        for (const grp of PRESET_LIBRARY) {
          const matched = grp.presets.filter(p => {
            const hay = [
              p.key, p.name, p.desc,
              ...(p.tags || []),
              p.template.trigger,
              ...(p.template.actions || []).map(a => a.atype),
              p.template.condition || '',
              p.template.description || '',
            ].join(' ').toLowerCase();
            return hay.includes(q);
          });
          if (matched.length > 0) {
            out.push({ ...grp, presets: matched });
          }
        }
        return out;
      });

      // 把 preset 插入到 rules 清單(自動配 unique ID,不覆蓋現有)
      function insertPreset(preset) {
        if (!preset || !preset.template) return;
        // 1. 配 unique rule_id
        const taken = new Set(rules.map(r => r.rule_id).filter(Boolean));
        let i = rules.length + 1;
        let newId = `P${String(i).padStart(3, '0')}`;
        while (taken.has(newId)) {
          i++;
          newId = `P${String(i).padStart(3, '0')}`;
        }
        // 2. 深拷貝 template(避免改 preset 也影響到原始庫)
        const t = preset.template;
        const newRule = {
          ...makeRule(newId),
          rule_id: newId,
          mode_scope: t.mode_scope || 'ALL',
          trigger: t.trigger,
          condition: t.condition || '',
          actions: (t.actions || []).map(a => ({
            atype: a.atype,
            params: { ...(a.params || {}) },
          })),
          emits: [...(t.emits || [])],
          enabled: true,
          priority: t.priority != null ? t.priority : 100,
          description: t.description || preset.name || '',
        };
        rules.push(newRule);
        builderRowsMap[newId] = [];
        ruleEditMode[newId] = 'builder';
        ruleParseError[newId] = null;
        selectedRuleIdx.value = rules.length - 1;
        // v3.1:合併 tab 後使用者可能正在看棄牌規則,插入 preset 後自動切到拼圖類別
        selectedKind.value = 'puzzle';
        // 確保過濾器不會把剛插入的規則隱藏起來
        if (rulesListFilter.value === 'hard' || rulesListFilter.value === 'soft') {
          rulesListFilter.value = 'all';
        }
        emit('status', { type: 'ok', msg: `已從規則庫插入「${preset.name}」→ ${newId}` });
        // 不自動關抽屜 — 使用者可能想連續插入多個
      }

      // ──────────────────────────────────────────────────────
      //  最近一次模擬統計(從 sim_history LS 拿,顯示在規則縮覽列徽章)
      // ──────────────────────────────────────────────────────
      const latestSimStats = ref(null); // { ruleTriggers: {id:count}, ruleRtp: {id:value}, totalPayout, ts, sourceName }

      function refreshLatestSimStats() {
        try {
          const raw = localStorage.getItem('slotplanner.sim_history.v1');
          if (!raw) { latestSimStats.value = null; return; }
          const arr = JSON.parse(raw);
          if (!Array.isArray(arr) || arr.length === 0) { latestSimStats.value = null; return; }
          // 最後一筆(最新)
          const last = arr[arr.length - 1];
          // compare 模式取 B(後者通常是「修改後」的版本,代表使用者最關心)
          const summary = last.kind === 'compare'
            ? (last.B && last.B.summary)
            : last.summary;
          if (!summary) { latestSimStats.value = null; return; }
          latestSimStats.value = {
            ts:           last.ts,
            sourceName:   last.sourceName || '',
            kind:         last.kind || 'single',
            ruleTriggers: summary.rule_trigger_counts || {},
            ruleRtp:      summary.rule_rtp_contributions || {},
            totalPayout:  Number(summary.total_payout) || 0,
          };
        } catch (e) {
          console.warn('[config-editor] refreshLatestSimStats failed:', e);
          latestSimStats.value = null;
        }
      }
      // 進入 規則 tab 時自動讀一次(讀 LS 一次就行)
      refreshLatestSimStats();

      // 每條規則對應的徽章資料(回傳 null = 不顯示;ruleId 從 rules 拿)
      function getRuleSimBadge(ruleId) {
        if (!latestSimStats.value || !ruleId) return null;
        const count = Number(latestSimStats.value.ruleTriggers[ruleId]) || 0;
        const rtp   = Number(latestSimStats.value.ruleRtp[ruleId]) || 0;
        if (count === 0 && Math.abs(rtp) < 0.0001) {
          // 完全沒觸發 — 標記為 dead code
          // 但只在 ruleId 確實出現在最近一次 summary 中時才標(避免新加的規則被誤判)
          if (ruleId in latestSimStats.value.ruleTriggers ||
              ruleId in latestSimStats.value.ruleRtp) {
            return { count: 0, rtp: 0, dead: true };
          }
          return null;
        }
        return { count, rtp, dead: false };
      }

      function removeRule(idx) {
        const r = rules[idx];
        if (!confirm(`確定要刪除規則「${r.rule_id || '(未命名)'}」嗎?`)) return;
        const rid = r.rule_id;
        rules.splice(idx, 1);
        if (rid) {
          delete builderRowsMap[rid];
          delete ruleEditMode[rid];
          delete ruleParseError[rid];
        }
        selectedRuleIdx.value = Math.min(selectedRuleIdx.value, Math.max(0, rules.length - 1));
        emit('status', { type: 'ok', msg: `已刪除規則「${rid}」` });
      }
      // 規則 ID 改名時,搬移 UI 暫存
      function renameRuleBuilderState(oldId, newId) {
        if (!oldId || !newId || oldId === newId) return;
        if (oldId in builderRowsMap) {
          builderRowsMap[newId] = builderRowsMap[oldId];
          delete builderRowsMap[oldId];
        }
        if (oldId in ruleEditMode) {
          ruleEditMode[newId] = ruleEditMode[oldId];
          delete ruleEditMode[oldId];
        }
        if (oldId in ruleParseError) {
          ruleParseError[newId] = ruleParseError[oldId];
          delete ruleParseError[oldId];
        }
      }

      // ── Condition 單元測試:可摺疊的「測試上下文」面板 ──
      //   ruleTestOpen[rule_id]:該規則的測試面板是否展開
      //   testCtx:全域共用的假 EvalContext(避免每條規則都複製一份)
      const ruleTestOpen = reactive({});
      const testCtx = reactive({
        mode: 'NG',
        combo_step: 0,
        multiplier: 1,
        total_multiplier: 0,
        consecutive_dead_spins: 0,
        event: '',
        symbol_count_str: 'SCAT:3, WILD:1, H1:5',  // 文字輸入,parse 為 symbol_count obj
        global_str: 'coin_pool:50, dead_count:0',
        spin_locals_str: 'fg_combo_count:0',
        payload_str: '',
      });
      // 把 "K1:V1, K2:V2" 文字解析成 { K1:V1, ... } 物件
      function parseKVPairs(s, asNumber = true) {
        const out = {};
        if (!s || !s.trim()) return out;
        for (const part of s.split(',')) {
          const m = part.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/);
          if (!m) continue;
          let v = m[2];
          if (asNumber) {
            const n = Number(v);
            if (!Number.isNaN(n)) v = n;
          }
          out[m[1]] = v;
        }
        return out;
      }
      // 把 testCtx 字串欄位轉成 evaluator 真正吃的 EvalContext
      function compiledTestCtx() {
        return {
          mode: testCtx.mode,
          combo_step: Number(testCtx.combo_step) || 0,
          multiplier: Number(testCtx.multiplier) || 0,
          total_multiplier: Number(testCtx.total_multiplier) || 0,
          consecutive_dead_spins: Number(testCtx.consecutive_dead_spins) || 0,
          event: String(testCtx.event || ''),
          symbol_count: parseKVPairs(testCtx.symbol_count_str, true),
          global: parseKVPairs(testCtx.global_str, true),
          spin_locals: parseKVPairs(testCtx.spin_locals_str, true),
          payload: parseKVPairs(testCtx.payload_str, true),
        };
      }
      // 對指定 rule 跑 evalCondition,回傳 { ok, result, trace }
      function evalRuleNow(rule) {
        if (!rule) return { ok: true, result: null, trace: [], empty: true };
        ensureBuilderRows(rule);
        const rows = builderRowsMap[rule.rule_id] || [];
        if (rows.length === 0) return { ok: true, result: null, trace: [], empty: true };
        return evalCondition(compiledTestCtx(), rows);
      }
      function toggleRuleTest(rule_id) {
        ruleTestOpen[rule_id] = !ruleTestOpen[rule_id];
      }

      // ──────────────────────────────────────────────────────
      //  #5 共用 Test Inspector(09/10/11 共用的固定面板)
      //  pinnedTest:{ kind, id, label } 表示目前釘住測試的條件
      //  inspectorOpen:面板展開狀態(可手動收起讓畫面更大)
      // ──────────────────────────────────────────────────────
      const pinnedTest = ref(null);
      const inspectorOpen = ref(true);   // 預設展開
      const inspectorCtxExpanded = ref(false);  // ctx 編輯區是否展開

      // 取 builder rows(統一介面,內部分支處理 rule 和 condBuilderState)
      function _getBuilderRows(kind, id) {
        if (!id) return [];
        if (kind === 'rule') {
          return builderRowsMap[id] || [];
        }
        return condBuilderState.rows[condKey(kind, id)] || [];
      }
      function pinTest(kind, id, label) {
        if (!id) return;
        pinnedTest.value = { kind, id, label: label || id };
        inspectorOpen.value = true;
      }
      function unpinTest() {
        pinnedTest.value = null;
      }
      // 評估目前 pinned 條件 — 回傳跟 evalRuleNow 一樣的形狀
      function evalPinned() {
        const p = pinnedTest.value;
        if (!p) return { ok: true, result: null, trace: [], empty: true, nopin: true };
        const rows = _getBuilderRows(p.kind, p.id);
        if (rows.length === 0) return { ok: true, result: null, trace: [], empty: true };
        return evalCondition(compiledTestCtx(), rows);
      }
      // 顯示用的 kind 中文標籤
      function pinnedKindLabel(kind) {
        if (kind === 'rule') return '腳本規則';
        if (kind === 'discard') return '棄牌規則';
        if (kind === 'mode') return '模式觸發';
        return kind;
      }
      // 切換 active tab 時若該 tab 有第一條規則且沒 pinned,自動 pin 它
      // 這讓使用者切到 規則/global 立即看到 inspector 在工作
      function _autoPinIfNeeded() {
        if (pinnedTest.value) return;  // 已 pinned 就不動
        const id = active.value;
        if (id === 'rules') {
          // v3.1:合併 tab。根據當前 selectedKind 決定 pin 哪一種
          if (selectedKind.value === 'discard' && discards.length > 0) {
            const d = discards[selectedDiscardIdx.value] || discards[0];
            if (d.discard_id) pinTest('discard', d.discard_id, d.discard_id);
          } else if (rules.length > 0) {
            const r = rules[selectedRuleIdx.value] || rules[0];
            if (r.rule_id) pinTest('rule', r.rule_id, r.rule_id);
          } else if (discards.length > 0) {
            // 沒拼圖規則就退而求其次 pin 棄牌
            const d = discards[0];
            if (d.discard_id) pinTest('discard', d.discard_id, d.discard_id);
          }
        } else if (id === 'global' && modes.length > 0) {
          // v3.1:模式定義已合進 global tab,在這裡 pin 模式條件
          // 跳過 NG(通常無條件),pin 第一個有條件的模式
          const m = modes.find(x => x.trigger_condition) || modes[0];
          if (m && m.mode) pinTest('mode', m.mode, m.mode);
        }
      }
      // 監看 active 切換,自動 pin
      watch(active, () => {
        // 切到「規則」tab 或 global tab(含模式定義)時自動 pin
        if (active.value === 'rules' || active.value === 'global') {
          _autoPinIfNeeded();
        }
      });
      // 判斷目前 active 是否為 puzzle tab(含 global 因為內含模式定義、含合併後的 rules)
      const isInPuzzleTab = computed(() =>
        active.value === 'rules' ||
        active.value === 'global'
      );

      // ──────────────────────────────────────────────────────
      //  共用 Condition 建構器(Session C)
      //  state key 形式 `${kind}:${id}`,讓 10/11 可重用 09 的 UI 邏輯
      // ──────────────────────────────────────────────────────
      const condBuilderState = reactive({
        rows:  {},   // key -> rows array
        mode:  {},   // key -> 'builder' | 'raw'
        error: {},   // key -> error string | null
      });
      function condKey(kind, id) { return `${kind}:${id || ''}`; }

      function condEnsureBuilder(rec, kind, idField, condField) {
        if (!rec) return;
        const id = rec[idField];
        if (!id) return;
        const k = condKey(kind, id);
        if (k in condBuilderState.rows) return;
        const parsed = parseCondition(rec[condField]);
        if (parsed.ok) {
          condBuilderState.rows[k] = parsed.rows;
          condBuilderState.mode[k] = 'builder';
          condBuilderState.error[k] = null;
        } else {
          condBuilderState.rows[k] = [];
          condBuilderState.mode[k] = 'raw';
          condBuilderState.error[k] = parsed.error;
        }
      }
      function condRebuild(rec, kind, idField, condField) {
        const id = rec[idField];
        if (!id) return;
        const k = condKey(kind, id);
        const rows = condBuilderState.rows[k];
        if (!rows) return;
        rec[condField] = buildCondition(rows);
      }
      function condSetEditMode(rec, kind, idField, condField, mode) {
        const id = rec[idField];
        if (!id) return;
        const k = condKey(kind, id);
        if (mode === 'builder') {
          const parsed = parseCondition(rec[condField]);
          if (parsed.ok) {
            condBuilderState.rows[k] = parsed.rows;
            condBuilderState.mode[k] = 'builder';
            condBuilderState.error[k] = null;
          } else {
            condBuilderState.mode[k] = 'raw';
            condBuilderState.error[k] = parsed.error;
            emit('status', { type: 'err', msg: '無法切回建構模式:' + parsed.error });
          }
        } else {
          condBuilderState.mode[k] = 'raw';
          condBuilderState.error[k] = null;
        }
      }
      function condAddRow(rec, kind, idField, condField, combinator = 'AND') {
        const id = rec[idField];
        if (!id) return;
        const k = condKey(kind, id);
        if (!condBuilderState.rows[k]) condBuilderState.rows[k] = [];
        condBuilderState.rows[k].push({
          category: 'symbol_count', subkey: '', op: '>=', value: '0', combinator,
        });
        condRebuild(rec, kind, idField, condField);
      }
      function condRemoveRow(rec, kind, idField, condField, rowIdx) {
        const id = rec[idField];
        if (!id) return;
        const k = condKey(kind, id);
        if (!condBuilderState.rows[k]) return;
        condBuilderState.rows[k].splice(rowIdx, 1);
        condRebuild(rec, kind, idField, condField);
      }
      function condChangeCategory(rec, kind, idField, condField, rowIdx, newCategory) {
        const id = rec[idField];
        if (!id) return;
        const k = condKey(kind, id);
        if (!condBuilderState.rows[k]) return;
        const row = condBuilderState.rows[k][rowIdx];
        if (!row) return;
        row.category = newCategory;
        const meta = VAR_CATEGORY_MAP[newCategory];
        if (!meta || !meta.needsSubkey) row.subkey = '';
        condRebuild(rec, kind, idField, condField);
      }

      // ── 為 10_Discard_Rules 與 11_Mode_Config 包一層 wrapper ──
      const discardCond = {
        ensure:    (rec)       => rec && condEnsureBuilder(rec, 'discard', 'discard_id', 'condition'),
        rebuild:   (rec)       => rec && condRebuild(rec, 'discard', 'discard_id', 'condition'),
        setMode:   (rec, m)    => rec && condSetEditMode(rec, 'discard', 'discard_id', 'condition', m),
        addRow:    (rec, c)    => rec && condAddRow(rec, 'discard', 'discard_id', 'condition', c),
        removeRow: (rec, i)    => rec && condRemoveRow(rec, 'discard', 'discard_id', 'condition', i),
        changeCat: (rec, i, c) => rec && condChangeCategory(rec, 'discard', 'discard_id', 'condition', i, c),
        key:       (rec)       => condKey('discard', rec ? rec.discard_id : ''),
      };
      const modeCond = {
        ensure:    (rec)       => rec && condEnsureBuilder(rec, 'mode', 'mode', 'trigger_condition'),
        rebuild:   (rec)       => rec && condRebuild(rec, 'mode', 'mode', 'trigger_condition'),
        setMode:   (rec, m)    => rec && condSetEditMode(rec, 'mode', 'mode', 'trigger_condition', m),
        addRow:    (rec, c)    => rec && condAddRow(rec, 'mode', 'mode', 'trigger_condition', c),
        removeRow: (rec, i)    => rec && condRemoveRow(rec, 'mode', 'mode', 'trigger_condition', i),
        changeCat: (rec, i, c) => rec && condChangeCategory(rec, 'mode', 'mode', 'trigger_condition', i, c),
        key:       (rec)       => condKey('mode', rec ? rec.mode : ''),
      };

      // ──────────────────────────────────────────────────────
      //  Action 動作清單管理
      // ──────────────────────────────────────────────────────
      //  rules[i].actions = [{ atype, params }, ...]
      //  actionEditMode[rule_id]:'visual'(預設) / 'dsl'(原始字串編輯)
      //  actionsParseError[rule_id]:DSL 解析錯誤訊息
      const actionEditMode = reactive({});
      const actionsParseError = reactive({});

      // 把 ACTION_CATALOG 按 type 開頭/語意分成三組,讓下拉的 optgroup 更好讀
      const actionsByGroup = computed(() => {
        const numericTypes = new Set(['ADJUST_MULTIPLIER', 'UPDATE_GLOBAL', 'UPDATE_LOCAL']);
        const flowTypes    = new Set(['EMIT_EVENT', 'SWITCH_MODE', 'AWARD_FREE_SPIN', 'HALT_RESOLUTION']);
        const boardTypes   = new Set(['BOARD_FILL', 'BOARD_TRANSFORM', 'BOARD_DESTROY',
                                       'MOVE', 'SWAP', 'STICKY', 'LOCK_REEL']);
        return {
          numeric: ACTION_CATALOG.filter(a => numericTypes.has(a.type)),
          flow:    ACTION_CATALOG.filter(a => flowTypes.has(a.type)),
          board:   ACTION_CATALOG.filter(a => boardTypes.has(a.type)),
        };
      });

      function actionMeta(type) {
        return ACTION_BY_TYPE[type] || null;
      }

      // ── 單一 action 物件的 params 操作 ──
      function actParamValue(act, key) {
        if (!act || !act.params) return '';
        const v = act.params[key];
        return v == null ? '' : v;
      }
      function setActParam(act, key, value) {
        if (!act) return;
        if (!act.params) act.params = {};
        if (value === '' || value == null) {
          delete act.params[key];
        } else {
          act.params[key] = value;
        }
      }

      // ── list 操作 ──
      function addAction(rule_idx, atype) {
        const r = rules[rule_idx];
        if (!r) return;
        if (!Array.isArray(r.actions)) r.actions = [];
        const newAct = makeAction(atype || '');
        // 若有指定 atype,把 catalog 中所有有 default 的欄位先補上
        if (atype) {
          const meta = ACTION_BY_TYPE[atype];
          if (meta) {
            for (const p of meta.params) {
              if (p.default !== undefined) newAct.params[p.key] = p.default;
            }
          }
        }
        r.actions.push(newAct);
      }
      function removeAction(rule_idx, action_idx) {
        const r = rules[rule_idx];
        if (!r || !Array.isArray(r.actions)) return;
        r.actions.splice(action_idx, 1);
      }
      function moveAction(rule_idx, action_idx, delta) {
        const r = rules[rule_idx];
        if (!r || !Array.isArray(r.actions)) return;
        const ni = action_idx + delta;
        if (ni < 0 || ni >= r.actions.length) return;
        const [act] = r.actions.splice(action_idx, 1);
        r.actions.splice(ni, 0, act);
      }
      function duplicateAction(rule_idx, action_idx) {
        const r = rules[rule_idx];
        if (!r || !Array.isArray(r.actions)) return;
        const src = r.actions[action_idx];
        if (!src) return;
        r.actions.splice(action_idx + 1, 0, {
          atype: src.atype,
          params: { ...(src.params || {}) },
        });
      }

      // 切換某個 action card 的 atype:保留同名 param,補上新 atype 的 default
      function changeActionAtType(rule_idx, action_idx, newType) {
        const r = rules[rule_idx];
        if (!r || !Array.isArray(r.actions)) return;
        const act = r.actions[action_idx];
        if (!act) return;
        const oldParams = act.params || {};
        act.atype = newType;
        if (!newType) {
          act.params = {};
          return;
        }
        const meta = ACTION_BY_TYPE[newType];
        if (!meta) return;
        const next = {};
        for (const p of meta.params) {
          if (p.key in oldParams && oldParams[p.key] !== '' && oldParams[p.key] != null) {
            next[p.key] = oldParams[p.key];
          } else if (p.default !== undefined) {
            next[p.key] = p.default;
          }
        }
        act.params = next;
      }

      // ── DSL 互轉 ──
      function setActionsFromDSL(rule_idx, dslText) {
        const r = rules[rule_idx];
        if (!r) return;
        try {
          const parsed = parseActionsDSL(dslText);
          r.actions = parsed;
          actionsParseError[r.rule_id] = null;
        } catch (e) {
          actionsParseError[r.rule_id] = e.message || '解析失敗';
        }
      }

      function setActionEditMode(rule, mode) {
        if (!rule || !rule.rule_id) return;
        actionEditMode[rule.rule_id] = mode;
        if (mode === 'visual') {
          actionsParseError[rule.rule_id] = null;
        }
      }

      // ── 舊 API 相容墊片(避免其他地方還有引用)──
      // changeActionType / paramValue / setActionParam 對應舊 schema 的單一 action
      // 現在沒地方用,但 setup return 還掛著時保留以免報錯
      function changeActionType(rule, newType) {
        // legacy:新 schema 沒有 rule.action_type;直接忽略
        console.warn('[config-editor] changeActionType is deprecated; use changeActionAtType on action list');
      }
      function paramValue(rule, key) {
        // legacy
        return '';
      }
      function setActionParam(rule, key, value) {
        // legacy
      }
      function actionParamsObj(rule) {
        // legacy
        return {};
      }

      // ──────────────────────────────────────────────────────
      //  匯入 A.xlsx
      // ──────────────────────────────────────────────────────
      async function importXlsx(file) {
        if (!file) return;
        if (typeof window.ExcelJS === 'undefined') {
          emit('status', { type: 'err', msg: 'ExcelJS 未載入,無法匯入' });
          return;
        }
        if (sourceMode.value !== 'default') {
          if (!confirm('即將以匯入的 A.xlsx 內容覆蓋目前所有設定,確定要繼續嗎?\n\n建議先用「⇩ 匯出」備份目前的設定。')) {
            return;
          }
        }
        emit('status', { type: 'wait', msg: '正在解析 A.xlsx ...' });

        const warnings = [];
        try {
          const buf = await file.arrayBuffer();
          const wb = new window.ExcelJS.Workbook();
          await wb.xlsx.load(buf);

          // ── 01_Global ── key-value 列
          const ws1 = wb.getWorksheet('01_Global');
          if (ws1) {
            ws1.eachRow((row, idx) => {
              if (idx === 1) return;
              const key = asStr(row.getCell(1).value).trim();
              if (!key || !(key in g)) return;
              const raw = row.getCell(2).value;
              const def = g[key];
              if (typeof def === 'number')      g[key] = asNum(raw, def);
              else if (typeof def === 'boolean') g[key] = asBool(raw);
              else                              g[key] = asStr(raw);
            });
          } else warnings.push('找不到 01_Global');

          // ── 02_Layout ── 每列一個 Reel
          const ws2 = wb.getWorksheet('02_Layout');
          if (ws2) {
            const nl = [];
            ws2.eachRow((row, idx) => {
              if (idx === 1) return;
              const reel_id = asNum(row.getCell(1).value, 0);
              if (!reel_id) return;
              nl.push({
                reel_id,
                y_offset: asNum(row.getCell(2).value, 0),
                max_rows: asNum(row.getCell(3).value, 1),
                has_subreel: asBool(row.getCell(4).value),
                subreel_position: asStr(row.getCell(5).value).trim(),
                subreel_rows: asNum(row.getCell(6).value, 0),
                subreel_inherit_weight: asBool(row.getCell(7).value),
              });
            });
            if (nl.length > 0) layout.splice(0, layout.length, ...nl);
          } else warnings.push('找不到 02_Layout');

          // ── 11_Mode_Config ── 先匯入,後面 04/05/08/12 才有正確 modeNames
          const ws11 = wb.getWorksheet('11_Mode_Config');
          if (ws11) {
            const nm = [];
            ws11.eachRow((row, idx) => {
              if (idx === 1) return;
              const mode = asStr(row.getCell(1).value).trim();
              if (!mode) return;
              nm.push({
                mode,
                trigger_condition: asStr(row.getCell(2).value),
                spin_count: asNum(row.getCell(3).value, 0),
                inherit_globals: asBool(row.getCell(4).value),
                on_enter_reset_vars: asStr(row.getCell(5).value),
                notes: asStr(row.getCell(6).value),
              });
            });
            if (nm.length > 0) modes.splice(0, modes.length, ...nm);
          } else warnings.push('找不到 11_Mode_Config');

          // ── 12_Distribution_Bins ──
          const ws12 = wb.getWorksheet('12_Distribution_Bins');
          if (ws12) {
            Object.keys(bins).forEach(k => delete bins[k]);
            ws12.eachRow((row, idx) => {
              if (idx === 1) return;
              const m = asStr(row.getCell(1).value).trim();
              if (!m) return;
              bins[m] = {
                bin_edges: asStr(row.getCell(2).value),
                notes: asStr(row.getCell(3).value),
              };
            });
          }

          // ── 06_Paylines ──
          const ws6 = wb.getWorksheet('06_Paylines');
          if (ws6) {
            const np = [];
            ws6.eachRow((row, idx) => {
              if (idx === 1) return;
              const line_id = asNum(row.getCell(1).value, 0);
              if (!line_id) return;
              np.push({
                line_id,
                path: asStr(row.getCell(2).value),
                direction: asStr(row.getCell(3).value) || 'LTR',
                notes: asStr(row.getCell(4).value),
              });
            });
            if (np.length > 0) paylines.splice(0, paylines.length, ...np);
          }

          // ── 07_Constraints ──
          const ws7 = wb.getWorksheet('07_Constraints');
          if (ws7) {
            const nc = [];
            ws7.eachRow((row, idx) => {
              if (idx === 1) return;
              const cid = asStr(row.getCell(1).value).trim();
              if (!cid) return;
              nc.push({
                constraint_id: cid,
                ctype: asStr(row.getCell(2).value) || 'REEL_RESTRICT',
                symbol_id: asStr(row.getCell(3).value),
                reels_allowed: asStr(row.getCell(4).value),
                threshold: asNum(row.getCell(5).value, 0),
                mode_scope: asStr(row.getCell(6).value) || 'ALL',
                notes: asStr(row.getCell(7).value),
              });
            });
            if (nc.length > 0) constraints.splice(0, constraints.length, ...nc);
          }

          // ── 10_Discard_Rules ──
          const ws10 = wb.getWorksheet('10_Discard_Rules');
          if (ws10) {
            const nd = [];
            ws10.eachRow((row, idx) => {
              if (idx === 1) return;
              const did = asStr(row.getCell(1).value).trim();
              if (!did) return;
              nd.push({
                discard_id: did,
                discard_kind: asStr(row.getCell(2).value) || 'HARD',
                mode_scope: asStr(row.getCell(3).value) || 'ALL',
                condition: asStr(row.getCell(4).value),
                notes: asStr(row.getCell(5).value),
              });
            });
            if (nd.length > 0) discards.splice(0, discards.length, ...nd);
          }

          // ── 09_Puzzle_Rules ──
          // 同時支援新 schema (Rule_ID, Priority, Trigger, Condition, Actions, Emits, Enabled, Description)
          // 與舊 schema (Rule_ID, Mode_Scope, Trigger, Condition, Action_Type, Action_Params, Priority, Notes)
          // 用首列標頭判斷
          const ws9 = wb.getWorksheet('09_Puzzle_Rules');
          if (ws9) {
            // 讀首列判斷 schema 版本
            const hdr = [];
            const hdrRow = ws9.getRow(1);
            for (let c = 1; c <= 10; c++) hdr.push(asStr(hdrRow.getCell(c).value).trim());
            const isNewSchema = hdr.includes('Actions') && hdr.includes('Enabled');

            const nr = [];
            ws9.eachRow((row, idx) => {
              if (idx === 1) return;
              const rid = asStr(row.getCell(1).value).trim();
              if (!rid) return;
              if (isNewSchema) {
                // 新 schema: Rule_ID | Priority | Trigger | Condition | Actions | Emits | Enabled | Description
                const fullCondition = asStr(row.getCell(4).value);
                const { mode_scope, rest_condition } = extractModeScope(fullCondition);
                const emitsStr = asStr(row.getCell(6).value);
                const enabledStr = asStr(row.getCell(7).value).trim().toUpperCase();
                let actions = [];
                try {
                  actions = parseActionsDSL(asStr(row.getCell(5).value));
                } catch (e) {
                  console.warn(`[09_Puzzle_Rules] rule ${rid} actions parse failed:`, e);
                }
                nr.push({
                  ...makeRule(rid),
                  rule_id: rid,
                  priority: asNum(row.getCell(2).value, 100),
                  trigger: asStr(row.getCell(3).value) || 'ON_GRID_GENERATED',
                  condition: rest_condition,
                  mode_scope: mode_scope || 'ALL',
                  actions,
                  emits: emitsStr ? emitsStr.split(',').map(s => s.trim()).filter(Boolean) : [],
                  enabled: enabledStr !== 'FALSE' && enabledStr !== 'NO' && enabledStr !== '0',
                  description: asStr(row.getCell(8).value),
                });
              } else {
                // 舊 schema:轉換到新 schema 結構
                const oldRow = {
                  rule_id: rid,
                  mode_scope: asStr(row.getCell(2).value) || 'ALL',
                  trigger: asStr(row.getCell(3).value) || 'ON_GRID_GENERATED',
                  condition: asStr(row.getCell(4).value),
                  action_type: asStr(row.getCell(5).value),
                  action_params: asStr(row.getCell(6).value),
                  priority: asNum(row.getCell(7).value, 100),
                  notes: asStr(row.getCell(8).value),
                };
                nr.push(migrateRuleSchema(oldRow));
              }
            });
            if (nr.length > 0) {
              rules.splice(0, rules.length, ...nr);
              // 重置 UI 暫存,讓下次進入時重新 parse
              Object.keys(builderRowsMap).forEach(k => delete builderRowsMap[k]);
              Object.keys(ruleEditMode).forEach(k => delete ruleEditMode[k]);
              Object.keys(ruleParseError).forEach(k => delete ruleParseError[k]);
              Object.keys(actionEditMode).forEach(k => delete actionEditMode[k]);
              Object.keys(actionsParseError).forEach(k => delete actionsParseError[k]);
            }
          }

          // ── 04_Reel_Weights ── 扁平 → 巢狀
          const ws4 = wb.getWorksheet('04_Reel_Weights');
          if (ws4) {
            const nrw = {};
            ws4.eachRow((row, idx) => {
              if (idx === 1) return;
              const m   = asStr(row.getCell(1).value).trim();
              const rid = asNum(row.getCell(2).value, 0);
              const sid = asStr(row.getCell(3).value).trim();
              const w   = asNum(row.getCell(4).value, 0);
              if (!m || !rid || !sid) return;
              if (!nrw[m]) nrw[m] = { symbol_ids: [], weights: {}, notes: '' };
              if (!nrw[m].symbol_ids.includes(sid)) nrw[m].symbol_ids.push(sid);
              nrw[m].weights[`${rid}-${sid}`] = w;
            });
            Object.keys(reelWeights).forEach(k => delete reelWeights[k]);
            Object.assign(reelWeights, nrw);
          }

          // ── 05_Grid_Size_Weights ── 扁平 → 巢狀
          const ws5 = wb.getWorksheet('05_Grid_Size_Weights');
          if (ws5) {
            const ngw = {};
            ws5.eachRow((row, idx) => {
              if (idx === 1) return;
              const m   = asStr(row.getCell(1).value).trim();
              const rid = asNum(row.getCell(2).value, 0);
              const sz  = asNum(row.getCell(3).value, 0);
              const w   = asNum(row.getCell(4).value, 0);
              if (!m || !rid || !sz) return;
              if (!ngw[m]) ngw[m] = { grid_sizes: [], weights: {}, notes: '' };
              if (!ngw[m].grid_sizes.includes(sz)) ngw[m].grid_sizes.push(sz);
              ngw[m].weights[`${rid}-${sz}`] = w;
            });
            for (const m of Object.keys(ngw)) {
              ngw[m].grid_sizes.sort((a, b) => a - b);
            }
            Object.keys(gridWeights).forEach(k => delete gridWeights[k]);
            Object.assign(gridWeights, ngw);
          }

          // ── 08_Combo_Weights ── 扁平(mode/step/reel/symbol/weight)→ 巢狀
          const ws8 = wb.getWorksheet('08_Combo_Weights');
          if (ws8) {
            const ncw = {};
            ws8.eachRow((row, idx) => {
              if (idx === 1) return;
              const m    = asStr(row.getCell(1).value).trim();
              const step = asNum(row.getCell(2).value, 0);
              const rid  = asNum(row.getCell(3).value, 0);
              const sid  = asStr(row.getCell(4).value).trim();
              const w    = asNum(row.getCell(5).value, 0);
              if (!m || !step || !rid || !sid) return;
              if (!ncw[m]) ncw[m] = { steps: [], symbol_ids: [], weights: {}, notes: '' };
              if (!ncw[m].steps.includes(step)) ncw[m].steps.push(step);
              if (!ncw[m].symbol_ids.includes(sid)) ncw[m].symbol_ids.push(sid);
              ncw[m].weights[`${step}-${rid}-${sid}`] = w;
            });
            for (const m of Object.keys(ncw)) {
              ncw[m].steps.sort((a, b) => a - b);
            }
            Object.keys(comboWeights).forEach(k => delete comboWeights[k]);
            Object.assign(comboWeights, ncw);
            Object.keys(comboActiveStep).forEach(k => delete comboActiveStep[k]);
          }

          // 03_Symbols ── 保守合併:只更新可對到的 symbol(by symbol_id 或 name),
          //               不新增/刪除 SymbolRegistry 內條目,避免破壞 swatch
          const ws3 = wb.getWorksheet('03_Symbols');
          if (ws3 && registry) {
            const allSyms = registry.symbols();
            // header 自動偵測:讀第一列找欄位順序
            const headerRow = ws3.getRow(1);
            const headers = {};
            headerRow.eachCell((cell, col) => {
              headers[asStr(cell.value).trim()] = col;
            });
            // 必要欄位:Symbol_ID 或 Display_Name 用來對應
            const colSymId    = headers['Symbol_ID']        || null;
            const colName     = headers['Display_Name']     || null;
            const colType     = headers['Type']             || null;
            const colP3       = headers['Pay_3x']           || null;
            const colP4       = headers['Pay_4x']           || null;
            const colP5       = headers['Pay_5x']           || null;
            const colP6       = headers['Pay_6x']           || null;
            const colMW       = headers['Mega_W']           || null;
            const colMH       = headers['Mega_H']           || null;
            const colIsWild   = headers['Is_Wild']          || null;
            const colIsScat   = headers['Is_Scatter']       || null;

            let updated = 0;
            let skipped = 0;
            ws3.eachRow((row, idx) => {
              if (idx === 1) return;
              const symId = colSymId ? asStr(row.getCell(colSymId).value).trim() : '';
              const name  = colName  ? asStr(row.getCell(colName).value).trim()  : '';
              if (!symId && !name) return;
              // 在 registry 內找對應(優先比對 symbol_id,其次 name)
              const matched = allSyms.find(s =>
                (symId && s.symbol_id === symId) ||
                (symId && s.name === symId) ||
                (name && s.name === name)
              );
              if (!matched) { skipped++; return; }
              // 更新擴充欄位
              if (colSymId) matched.symbol_id  = symId;
              if (colType)  matched.type       = asStr(row.getCell(colType).value)  || 'HIGH';
              if (colP3)    matched.pay_3x     = asNum(row.getCell(colP3).value, 0);
              if (colP4)    matched.pay_4x     = asNum(row.getCell(colP4).value, 0);
              if (colP5)    matched.pay_5x     = asNum(row.getCell(colP5).value, 0);
              if (colP6)    matched.pay_6x     = asNum(row.getCell(colP6).value, 0);
              if (colMW)    matched.mega_w     = asNum(row.getCell(colMW).value, 1);
              if (colMH)    matched.mega_h     = asNum(row.getCell(colMH).value, 1);
              if (colIsWild) matched.is_wild   = asBool(row.getCell(colIsWild).value);
              if (colIsScat) matched.is_scatter= asBool(row.getCell(colIsScat).value);
              updated++;
            });
            // 把更新後的 symbols 套回 registry(觸發 changed)
            try { registry.applyAll(allSyms, registry.swatchMap()); } catch (e) {}
            if (updated > 0 || skipped > 0) {
              warnings.push(`03_Symbols:更新 ${updated} 個符號,跳過 ${skipped} 個(無對應的 Symbol_ID/Display_Name)`);
            }
          }

          sourceMode.value = 'xlsx';
          const msg = warnings.length > 0
            ? `✓ 已匯入(${warnings.length} 條提示,請查看 console)`
            : '✓ A.xlsx 已成功匯入';
          emit('status', { type: 'ok', msg });
          if (warnings.length > 0) console.warn('[config-editor] import warnings:', warnings);
          // #10:匯入成功 → 設新基準(以新匯入的設定為起點)
          // 用 setTimeout 確保上面所有 reactive 寫入 LS 完畢(scheduleSave 預設 400ms debounce)
          setTimeout(() => {
            saveBaseline('import', '匯入 A.xlsx 後');
            refreshBaselineInfo();
            changesVersion.value++;
            clearAllTabsDirty();
          }, 500);
        } catch (err) {
          console.error('[config-editor] importXlsx failed:', err);
          emit('status', { type: 'err', msg: '匯入失敗:' + (err.message || err) });
        }
      }

      function onImportFile(event) {
        const file = event.target.files && event.target.files[0];
        if (file) importXlsx(file);
        event.target.value = ''; // 清空,讓相同檔案可重選
      }

      // ──────────────────────────────────────────────────────
      //  設定範本管理(任務 1)
      //  存取放在 aconfig-xlsx.js 的 window.SlotPlanner.Templates.*
      //  載入時用 location.reload() 重整頁面以套用所有 reactive state
      // ──────────────────────────────────────────────────────
      const showTemplatePanel = ref(false);
      const templateList = ref([]);
      const newTemplateName = ref('');
      const newTemplateDesc = ref('');
      // #6:「另存為新範本」是否展開(預設收合,點 + 存為新範本 才展開)
      const tplSaveOpen = ref(false);
      const tplNameInputRef = ref(null);
      // #16:範本 diff modal
      //   - diffOpen:modal 是否開啟
      //   - diffSelecting:正在「選擇兩個範本」的階段(true)或顯示 diff(false)
      //   - diffPickA / diffPickB:user 已選的範本 slug(string|null)
      //   - diffPickFor:目前正在選 'A' 或 'B'
      const diffOpen = ref(false);
      const diffSelecting = ref(true);
      const diffPickA = ref(null);
      const diffPickB = ref(null);
      const diffPickFor = ref('A');
      const diffComparisonResult = ref(null);   // { tplA, tplB, changes }
      // 任務 3:搜尋 / 排序
      const templateSearch = ref('');
      const templateSortBy = ref('modified-desc'); // 'modified-desc' | 'created-desc' | 'name-asc' | 'name-desc'
      const TEMPLATE_SORT_OPTIONS = [
        { value: 'modified-desc', label: '最近修改' },
        { value: 'created-desc',  label: '最近建立' },
        { value: 'name-asc',      label: '名稱 A→Z' },
        { value: 'name-desc',     label: '名稱 Z→A' },
      ];
      const filteredSortedTemplates = computed(() => {
        const q = templateSearch.value.trim().toLowerCase();
        let arr = templateList.value;
        if (q) {
          arr = arr.filter(t => {
            const name = (t.name || '').toLowerCase();
            const desc = (t.description || '').toLowerCase();
            return name.includes(q) || desc.includes(q);
          });
        }
        const sortBy = templateSortBy.value;
        const sorted = [...arr];
        if (sortBy === 'modified-desc') {
          sorted.sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
        } else if (sortBy === 'created-desc') {
          sorted.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
        } else if (sortBy === 'name-asc') {
          sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));
        } else if (sortBy === 'name-desc') {
          sorted.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'zh-Hant'));
        }
        return sorted;
      });
      const tplApi = () => (window.SlotPlanner && window.SlotPlanner.Templates) || null;

      function refreshTemplateList() {
        const api = tplApi();
        templateList.value = api ? api.list() : [];
      }
      function toggleTemplatePanel() {
        showTemplatePanel.value = !showTemplatePanel.value;
        if (showTemplatePanel.value) refreshTemplateList();
      }
      function saveAsTemplate() {
        const api = tplApi();
        if (!api) { emit('status', { type: 'err', msg: '範本 API 未載入' }); return; }
        const name = newTemplateName.value.trim();
        if (!name) { emit('status', { type: 'err', msg: '請輸入範本名稱' }); return; }
        const existing = templateList.value.find(t => t.name === name);
        if (existing) {
          if (!confirm(`已有同名範本「${name}」,確定要覆蓋嗎?`)) return;
        }
        try {
          // 強制立即觸發一次 scheduleSave 收尾(避免 400ms debounce 還沒寫)
          scheduleSave('範本');
          // 直接寫入 LS(scheduleSave 是非同步的,但快照仍用同步 LS 取值,所以
          // 為求準確,等一個 microtask 再實際儲存)
          setTimeout(() => {
            try {
              const meta = api.save(name, newTemplateDesc.value.trim());
              newTemplateName.value = '';
              newTemplateDesc.value = '';
              tplSaveOpen.value = false;   // #6:存完自動收合
              refreshTemplateList();
              emit('status', { type: 'ok', msg: `✓ 已存為範本「${meta.name}」` });
            } catch (e) {
              emit('status', { type: 'err', msg: '存範本失敗:' + e.message });
            }
          }, 450);
        } catch (e) {
          emit('status', { type: 'err', msg: '存範本失敗:' + e.message });
        }
      }
      // template 用的進入點(同名以底線開頭避免跟原 saveAsTemplate 撞)
      function _handleSaveAsTemplate() {
        saveAsTemplate();
      }
      // tplSaveOpen 開啟時自動 focus 名稱欄位,避免使用者還要再去點
      watch(tplSaveOpen, (open) => {
        if (open) {
          setTimeout(() => {
            const el = document.querySelector('.cfg-tpl-name-input');
            if (el) el.focus();
          }, 30);
        }
      });
      // ── 自動備份保留數量(超過則刪最舊)──
      const AUTO_BACKUP_PREFIX = '🤖 自動備份_';
      const AUTO_BACKUP_KEEP = 5;
      function _rotateAutoBackups(api) {
        try {
          const all = api.list().filter(t => t.name && t.name.startsWith(AUTO_BACKUP_PREFIX));
          // 依 created 升冪排序,從最舊開始刪
          all.sort((a, b) => (a.created || '').localeCompare(b.created || ''));
          while (all.length > AUTO_BACKUP_KEEP) {
            const oldest = all.shift();
            try { api.remove(oldest.slug); } catch (e) {}
          }
        } catch (e) { console.warn('[rotateAutoBackups]', e); }
      }

      function loadTemplateConfirm(t) {
        // v3.4 / B6:先開 diff preview,讓使用者看到會覆蓋什麼
        //   diff modal 內按「確認載入」才會走到 _executeTemplateLoad
        showTemplateDiff(t);
      }

      // 實際執行範本載入(v3.4 從 modal 確認後呼叫,保留原本邏輯)
      function _executeTemplateLoad(t) {
        const api = tplApi();
        if (!api) return;
        try {
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const backupName = `${AUTO_BACKUP_PREFIX}${stamp}`;
          scheduleSave('範本');
          setTimeout(() => {
            try {
              api.save(backupName, `載入「${t.name}」之前的自動備份`);
              _rotateAutoBackups(api);
              api.load(t.slug);
              saveBaseline('template-load', `載入範本「${t.name}」後`);
              emit('status', {
                type: 'ok',
                msg: `✓ 已自動備份當前狀態並載入範本「${t.name}」,正在重整…`,
              });
              setTimeout(() => location.reload(), 500);
            } catch (e) {
              emit('status', { type: 'err', msg: '載入範本失敗:' + e.message });
            }
          }, 450);
        } catch (e) {
          emit('status', { type: 'err', msg: '載入範本失敗:' + e.message });
        }
      }
      // diff modal 內的「確認載入」按鈕呼叫
      function confirmTemplateDiffLoad() {
        const d = tplLoadPreviewData.value;
        if (!d) return;
        const t = { slug: d.slug, name: d.name };
        closeTemplateDiff();
        _executeTemplateLoad(t);
      }

      // ──────────────────────────────────────────────────────
      //  #16 範本 diff:比較兩個範本的設定差異
      // ──────────────────────────────────────────────────────
      function openDiffModal(preselectSlug) {
        diffOpen.value = true;
        diffSelecting.value = true;
        diffPickA.value = preselectSlug || null;
        diffPickB.value = null;
        diffPickFor.value = preselectSlug ? 'B' : 'A';
        diffComparisonResult.value = null;
      }
      function closeDiffModal() {
        diffOpen.value = false;
      }
      function pickTemplateForDiff(slug) {
        if (diffPickFor.value === 'A') {
          diffPickA.value = slug;
          // 若 B 還沒選 → 自動切換到選 B
          if (!diffPickB.value) diffPickFor.value = 'B';
        } else {
          diffPickB.value = slug;
          if (!diffPickA.value) diffPickFor.value = 'A';
        }
      }
      // 從 LS 讀某個範本的 data
      function _loadTemplateData(slug) {
        if (!slug) return null;
        try {
          const raw = localStorage.getItem(`slotplanner.template.${slug}.v1`);
          if (!raw) return null;
          const obj = JSON.parse(raw);
          return obj.data || null;
        } catch (e) {
          console.warn('[config-editor] _loadTemplateData failed:', e);
          return null;
        }
      }
      function runTemplateDiff() {
        const slugA = diffPickA.value;
        const slugB = diffPickB.value;
        if (!slugA || !slugB) {
          emit('status', { type: 'err', msg: '請選擇兩個範本' });
          return;
        }
        if (slugA === slugB) {
          emit('status', { type: 'err', msg: '請選兩個不同的範本' });
          return;
        }
        const dataA = _loadTemplateData(slugA);
        const dataB = _loadTemplateData(slugB);
        if (!dataA || !dataB) {
          emit('status', { type: 'err', msg: '範本資料讀取失敗' });
          return;
        }
        const tplA = templateList.value.find(t => t.slug === slugA);
        const tplB = templateList.value.find(t => t.slug === slugB);
        const changes = computeChangesBetweenTemplates(dataA, dataB);
        diffComparisonResult.value = {
          tplA: tplA || { name: slugA, slug: slugA },
          tplB: tplB || { name: slugB, slug: slugB },
          changes,
        };
        diffSelecting.value = false;
      }
      function diffBackToSelecting() {
        diffSelecting.value = true;
        diffComparisonResult.value = null;
      }
      function diffSwapAB() {
        const tmp = diffPickA.value;
        diffPickA.value = diffPickB.value;
        diffPickB.value = tmp;
        // 若已經有結果就重跑;否則只是換 placeholder
        if (!diffSelecting.value) runTemplateDiff();
      }
      // 給 UI 取 changes 總數
      const diffTotalCount = computed(() => {
        const r = diffComparisonResult.value;
        if (!r || !r.changes) return 0;
        let n = 0;
        for (const g of r.changes) n += g.changes.length;
        return n;
      });

      function deleteTemplateConfirm(t) {
        if (!confirm(`確定要刪除範本「${t.name}」嗎?此動作不可復原。`)) return;
        const api = tplApi();
        if (!api) return;
        try {
          api.remove(t.slug);
          refreshTemplateList();
          emit('status', { type: 'ok', msg: `已刪除範本「${t.name}」` });
        } catch (e) {
          emit('status', { type: 'err', msg: '刪除失敗:' + e.message });
        }
      }
      function exportTemplateFile(t) {
        const api = tplApi();
        if (!api) return;
        try {
          const json = api.exportJSON(t.slug);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `SlotPlanner_範本_${t.slug}.json`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          emit('status', { type: 'ok', msg: `✓ 已下載範本「${t.name}」` });
        } catch (e) {
          emit('status', { type: 'err', msg: '匯出失敗:' + e.message });
        }
      }
      function onImportTemplate(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const api = tplApi();
        if (!api) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const meta = api.importJSON(e.target.result);
            refreshTemplateList();
            emit('status', { type: 'ok', msg: `✓ 已匯入範本「${meta.name}」` });
          } catch (err) {
            emit('status', { type: 'err', msg: '匯入失敗:' + err.message });
          }
          event.target.value = '';
        };
        reader.readAsText(file);
      }

      // ──────────────────────────────────────────────────────
      //  匯出 A.xlsx
      // ──────────────────────────────────────────────────────
      async function exportXlsx() {
        if (typeof window.ExcelJS === 'undefined') {
          emit('status', { type: 'err', msg: 'ExcelJS 未載入,無法匯出' });
          return;
        }
        emit('status', { type: 'wait', msg: '正在生成 A.xlsx ...' });

        try {
          const wb = new window.ExcelJS.Workbook();
          wb.creator = 'SlotPlanner Pro';
          wb.created = new Date();

          const stamp = new Date().toLocaleString('zh-TW');
          const boldHdr = (ws) => { ws.getRow(1).font = { bold: true, color: { argb: 'FF5A3DB0' } }; };
          const setCols = (ws, widths) => { ws.columns = widths.map(w => ({ width: w })); };

          // ── 00_README ──
          const wsR = wb.addWorksheet('00_README');
          wsR.addRows([
            ['SlotPlanner Pro · A 設定檔'],
            [`匯出時間:${stamp}`],
            [`匯出來源:網頁版設定檔編輯器`],
            [],
            ['分頁列表'],
            ['01_Global', '全域設定'],
            ['02_Layout', '盤面結構'],
            ['03_Symbols', '符號清單'],
            ['04_Reel_Weights', 'Reel 權重(Mode × Reel × Symbol)'],
            ['05_Grid_Size_Weights', '格數權重(Megaways 開幾格)'],
            ['06_Paylines', '中獎線'],
            ['07_Constraints', '硬約束(REEL_RESTRICT / GLOBAL_MAX/MIN)'],
            ['08_Combo_Weights', '連爆權重(Mode × Step × Reel × Symbol)'],
            ['09_Puzzle_Rules', '腳本規則(含 Condition 拼圖建構器)'],
            ['10_Discard_Rules', '棄牌規則(HARD 風控 / SOFT 體感)'],
            ['11_Mode_Config', '模式設定'],
            ['12_Distribution_Bins', '分佈區間'],
          ]);
          wsR.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF5A3DB0' } };
          wsR.getRow(5).font = { bold: true };
          setCols(wsR, [28, 50]);

          // ── 01_Global ──
          const wsG = wb.addWorksheet('01_Global');
          wsG.addRow(['Key', 'Value', 'Notes']);
          for (const [k, v] of Object.entries(g)) wsG.addRow([k, v, '']);
          boldHdr(wsG); setCols(wsG, [22, 28, 36]);

          // ── 02_Layout ──
          const wsL = wb.addWorksheet('02_Layout');
          wsL.addRow(['Reel_ID', 'Y_Offset', 'Max_Rows', 'Has_SubReel',
                      'SubReel_Position', 'SubReel_Rows', 'SubReel_Inherit_Weight']);
          for (const r of layout) {
            wsL.addRow([r.reel_id, r.y_offset, r.max_rows, r.has_subreel,
                        r.subreel_position, r.subreel_rows, r.subreel_inherit_weight]);
          }
          boldHdr(wsL); setCols(wsL, [10, 10, 10, 13, 18, 14, 22]);

          // ── 03_Symbols(從 registry 讀,含 A.xlsx 擴充欄位)──
          const wsS = wb.addWorksheet('03_Symbols');
          wsS.addRow([
            'Symbol_ID', 'Display_Name', 'Number', 'Type',
            'Pay_3x', 'Pay_4x', 'Pay_5x', 'Pay_6x',
            'Mega_W', 'Mega_H', 'Is_Wild', 'Is_Scatter',
            'Weight', 'Max_Count', 'Use_Max', 'Reel_Limit',
          ]);
          if (registry) {
            for (const s of registry.symbols()) {
              const sid = s.symbol_id || s.name || `#${s.number}`;
              wsS.addRow([
                sid, s.name, s.number, s.type || 'HIGH',
                s.pay_3x || 0, s.pay_4x || 0, s.pay_5x || 0, s.pay_6x || 0,
                s.mega_w || 1, s.mega_h || 1, !!s.is_wild, !!s.is_scatter,
                s.weight, s.max_count, s.use_max, (s.reel_limit || []).join(','),
              ]);
            }
          }
          boldHdr(wsS); setCols(wsS, [14, 16, 10, 12, 10, 10, 10, 10, 9, 9, 10, 11, 10, 12, 10, 18]);

          // ── 04_Reel_Weights(扁平化)──
          const wsRW = wb.addWorksheet('04_Reel_Weights');
          wsRW.addRow(['Mode_Scope', 'Reel_ID', 'Symbol_ID', 'Weight', 'Notes']);
          for (const m of modeNames.value) {
            ensureReelWeightsForMode(m);
            const e = reelWeights[m];
            for (let r = 1; r <= layout.length; r++) {
              for (const sid of e.symbol_ids) {
                const w = e.weights[`${r}-${sid}`];
                if (typeof w === 'number' && w > 0) {
                  wsRW.addRow([m, r, sid, w, '']);
                }
              }
            }
          }
          boldHdr(wsRW); setCols(wsRW, [12, 10, 14, 10, 24]);

          // ── 05_Grid_Size_Weights(扁平化)──
          const wsGW = wb.addWorksheet('05_Grid_Size_Weights');
          wsGW.addRow(['Mode_Scope', 'Reel_ID', 'Grid_Size', 'Weight', 'Notes']);
          for (const m of modeNames.value) {
            ensureGridWeightsForMode(m);
            const e = gridWeights[m];
            for (let r = 1; r <= layout.length; r++) {
              for (const sz of e.grid_sizes) {
                const w = e.weights[`${r}-${sz}`];
                if (typeof w === 'number' && w > 0) {
                  wsGW.addRow([m, r, sz, w, '']);
                }
              }
            }
          }
          boldHdr(wsGW); setCols(wsGW, [12, 10, 11, 10, 24]);

          // ── 06_Paylines ──
          const wsP = wb.addWorksheet('06_Paylines');
          wsP.addRow(['Line_ID', 'Path', 'Direction', 'Notes']);
          // v4.0 / #16:方向是全域設定;每行寫入 g.payline_direction(後端仍逐行讀 Direction,維持相容)
          for (const pl of paylines) wsP.addRow([pl.line_id, pl.path, g.payline_direction || 'LTR', pl.notes]);
          boldHdr(wsP); setCols(wsP, [10, 44, 12, 28]);

          // ── 07_Constraints ──
          const wsC = wb.addWorksheet('07_Constraints');
          wsC.addRow(['Constraint_ID', 'Type', 'Symbol_ID', 'Reels_Allowed',
                      'Max_Count_Global', 'Mode_Scope', 'Notes']);
          for (const c of constraints) {
            wsC.addRow([c.constraint_id, c.ctype, c.symbol_id, c.reels_allowed,
                        c.threshold, c.mode_scope, c.notes]);
          }
          boldHdr(wsC); setCols(wsC, [14, 16, 13, 16, 18, 13, 28]);

          // ── 08_Combo_Weights(扁平化)──
          const wsCW = wb.addWorksheet('08_Combo_Weights');
          wsCW.addRow(['Mode_Scope', 'Combo_Step', 'Reel_ID', 'Symbol_ID', 'Weight', 'Notes']);
          for (const m of modeNames.value) {
            ensureComboWeightsForMode(m);
            const e = comboWeights[m];
            for (const step of e.steps) {
              for (let r = 1; r <= layout.length; r++) {
                for (const sid of e.symbol_ids) {
                  const w = e.weights[`${step}-${r}-${sid}`];
                  if (typeof w === 'number' && w > 0) {
                    wsCW.addRow([m, step, r, sid, w, '']);
                  }
                }
              }
            }
          }
          boldHdr(wsCW); setCols(wsCW, [12, 12, 10, 14, 10, 24]);

          const wsPR = wb.addWorksheet('09_Puzzle_Rules');
          wsPR.addRow(['Rule_ID', 'Priority', 'Trigger', 'Condition',
                       'Actions', 'Emits', 'Enabled', 'Description']);
          // 依 priority 由小到大排序匯出(數字越小越優先 — 對齊後端 logic_parser._build_index 的排序鍵)
          const sortedRules = [...rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
          for (const r of sortedRules) {
            const condition = composeConditionWithModeScope(r.mode_scope, r.condition);
            const actionsDSL = buildActionsDSL(r.actions);
            const emitsStr = (r.emits || []).join(',');
            wsPR.addRow([
              r.rule_id,
              r.priority,
              r.trigger,
              condition,
              actionsDSL,
              emitsStr,
              r.enabled !== false ? 'TRUE' : 'FALSE',
              r.description || '',
            ]);
          }
          boldHdr(wsPR); setCols(wsPR, [12, 10, 22, 40, 50, 18, 10, 28]);

          const wsDR = wb.addWorksheet('10_Discard_Rules');
          wsDR.addRow(['Discard_ID', 'Discard_Kind', 'Mode_Scope', 'Condition', 'Notes']);
          for (const d of discards) {
            wsDR.addRow([d.discard_id, d.discard_kind, d.mode_scope, d.condition, d.notes]);
          }
          boldHdr(wsDR); setCols(wsDR, [12, 14, 13, 36, 24]);

          // ── 11_Mode_Config ──
          const wsM = wb.addWorksheet('11_Mode_Config');
          wsM.addRow(['Mode', 'Trigger_Condition', 'Spin_Count', 'Inherit_Globals',
                      'On_Enter_Reset_Vars', 'Notes']);
          for (const m of modes) {
            wsM.addRow([m.mode, m.trigger_condition, m.spin_count, m.inherit_globals,
                        m.on_enter_reset_vars, m.notes]);
          }
          boldHdr(wsM); setCols(wsM, [12, 32, 12, 16, 22, 28]);

          // ── 12_Distribution_Bins ──
          const wsB = wb.addWorksheet('12_Distribution_Bins');
          wsB.addRow(['Mode_Scope', 'Bin_Edges', 'Notes']);
          for (const [m, entry] of Object.entries(bins)) {
            wsB.addRow([m, entry.bin_edges, entry.notes]);
          }
          boldHdr(wsB); setCols(wsB, [13, 40, 28]);

          // ── 寫出 + 下載 ──
          const buf = await wb.xlsx.writeBuffer();
          const blob = new Blob([buf], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });
          const today = new Date().toISOString().slice(0, 10);
          const filename = `A_設定檔_${today}.xlsx`;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);

          emit('status', { type: 'ok', msg: `✓ 已下載 ${filename}` });
          // 任務 2:匯出成功 → 所有 tab 不再 dirty
          clearAllTabsDirty();
          // #10:匯出成功 → 把當前狀態設為新基準
          saveBaseline('export', `匯出 ${filename} 後`);
          refreshBaselineInfo();
          changesVersion.value++;
        } catch (err) {
          console.error('[config-editor] exportXlsx failed:', err);
          emit('status', { type: 'err', msg: '匯出失敗:' + (err.message || err) });
        }
      }

      // ── 把子 component(symbol-page)的 status 事件往上傳 ──
      function passStatus(s) { emit('status', s); }

      const activeTab = computed(() => TABS.find(t => t.id === active.value) || TABS[0]);

      const sourceIcon = computed(() => ({
        local:   '🟢',
        xlsx:    '🔵',
        default: '⚪',
      })[sourceMode.value] || '⚪');

      const sourceText = computed(() => ({
        local:   '已自動儲存於本機(localStorage)',
        xlsx:    '從 A.xlsx 匯入',
        default: '使用預設範本(尚未變更)',
      })[sourceMode.value] || '');

      // #13 簡短版本給窄螢幕用
      const sourceTextShort = computed(() => ({
        local:   '本機',
        xlsx:    'xlsx',
        default: '預設',
      })[sourceMode.value] || '');

      // #11 dev mode:source-icon 連點 5 下切換,藏起 cfg-debug 那些只給開發者看的 JSON 預覽
      const devMode = ref(false);
      let _devClickCount = 0;
      let _devClickTimer = null;
      function onSourceIconClick() {
        _devClickCount++;
        if (_devClickTimer) clearTimeout(_devClickTimer);
        _devClickTimer = setTimeout(() => { _devClickCount = 0; }, 1500);
        if (_devClickCount >= 5) {
          _devClickCount = 0;
          devMode.value = !devMode.value;
          emit('status', {
            type: 'ok',
            msg: devMode.value ? '🛠 開發者模式 ON(JSON 預覽已顯示)' : '✓ 開發者模式 OFF',
          });
        }
      }

      // ──────────────────────────────────────────────────────────
      //  #15 Ctrl+K 全編輯器搜尋
      //  把所有跨 tab 可搜尋的東西(模式、符號、欄位、reel、payline 等)
      //  建成一個扁平索引,讓使用者用模糊匹配快速跳轉
      // ──────────────────────────────────────────────────────────
      const searchOpen = ref(false);
      const searchQuery = ref('');
      const searchSelectedIdx = ref(0);

      // 01_Global 的欄位名 — 寫死,因為這些是 schema 固定的
      const GLOBAL_FIELDS = [
        { key: 'simulation_count', label: '模擬次數' },
        { key: 'random_seed',      label: '隨機種子' },
        { key: 'output_prefix',    label: '輸出檔名前綴' },
        { key: 'pay_type',         label: '賠付類型' },
        { key: 'ways_direction',   label: 'Ways 方向' },
        { key: 'cluster_min_size', label: 'Cluster 最小群組' },
        { key: 'return_pct',       label: '目標 RTP' },
        { key: 'big_win_thresholds', label: '大獎門檻' },
        { key: 'dead_spin_buckets',  label: '連續死局統計分桶' },
      ];

      // 建立扁平索引,每次 reactive 變動會自動重算
      const searchIndex = computed(() => {
        const items = [];

        // ─ 1. 所有 12 tab ─
        for (const t of TABS) {
          items.push({
            id: `tab:${t.id}`,
            tab: t.id,
            category: 'tab',
            categoryLabel: '分頁',
            icon: t.icon,
            title: t.name,
            subtitle: t.sheet,
            haystack: `${t.name} ${t.sheet} ${t.id}`.toLowerCase(),
          });
        }

        // ─ 2. 01_Global 欄位 ─
        for (const f of GLOBAL_FIELDS) {
          items.push({
            id: `field:global:${f.key}`,
            tab: 'global',
            category: 'field',
            categoryLabel: '01 欄位',
            icon: '⚙',
            title: f.label,
            subtitle: f.key,
            haystack: `${f.label} ${f.key} global`.toLowerCase(),
          });
        }

        // ─ 3. 02_Layout Reel ─
        for (const r of layout) {
          items.push({
            id: `reel:${r.reel_id}`,
            tab: 'layout',
            category: 'reel',
            categoryLabel: '02 Reel',
            icon: '🎰',
            title: `R${r.reel_id}`,
            subtitle: `${r.max_rows} rows · y_offset ${r.y_offset}${r.has_subreel ? ' · 含副 Reel' : ''}`,
            haystack: `r${r.reel_id} reel ${r.reel_id} ${r.max_rows} rows`.toLowerCase(),
          });
        }

        // ─ 4. 03_Symbols 符號 ─
        for (const s of symbolList.value) {
          if (!s.name) continue;
          items.push({
            id: `symbol:${s.name}`,
            tab: 'symbols',
            category: 'symbol',
            categoryLabel: '03 符號',
            icon: '🎨',
            title: s.name,
            subtitle: s.type || (s.is_wild ? 'WILD' : s.is_scatter ? 'SCATTER' : 'PAY'),
            haystack: `${s.name} ${s.type || ''} ${s.is_wild ? 'wild' : ''} ${s.is_scatter ? 'scatter' : ''}`.toLowerCase(),
          });
        }

        // ─ 5. 06_Paylines ─
        for (const pl of paylines) {
          if (!pl.line_id) continue;
          items.push({
            id: `payline:${pl.line_id}`,
            tab: 'paylines',
            category: 'payline',
            categoryLabel: '06 中獎線',
            icon: '➰',
            title: pl.line_id,
            subtitle: pl.path ? pl.path.slice(0, 40) : '(空)',
            haystack: `${pl.line_id} ${pl.path || ''} ${pl.notes || ''}`.toLowerCase(),
          });
        }

        // ─ 6. 07_Constraints ─
        for (const c of constraints) {
          if (!c.constraint_id) continue;
          items.push({
            id: `constraint:${c.constraint_id}`,
            tab: 'constraints',
            category: 'constraint',
            categoryLabel: '07 硬約束',
            icon: '🚫',
            title: c.constraint_id,
            subtitle: `${c.ctype || ''} · ${c.symbol_id || ''} · ${c.mode_scope || ''}`,
            haystack: `${c.constraint_id} ${c.ctype || ''} ${c.symbol_id || ''} ${c.mode_scope || ''} ${c.notes || ''}`.toLowerCase(),
          });
        }

        // ─ 7. 09_Puzzle_Rules ─
        for (const r of rules) {
          if (!r.rule_id) continue;
          const firstAct = (r.actions && r.actions[0] && r.actions[0].atype) || '';
          const allActs = (r.actions || []).map(a => a.atype).filter(Boolean).join(' ');
          items.push({
            id: `rule:${r.rule_id}`,
            tab: 'rules',
            category: 'rule',
            categoryLabel: '09 腳本規則',
            icon: '🧩',
            title: r.rule_id,
            subtitle: `${r.trigger || ''} · ${firstAct || '(無動作)'} · ${r.mode_scope || ''}`,
            haystack: `${r.rule_id} ${r.trigger || ''} ${allActs} ${r.mode_scope || ''} ${r.description || ''} ${r.condition || ''}`.toLowerCase(),
          });
        }

        // ─ 8. 10_Discard_Rules ─
        for (const d of discards) {
          if (!d.discard_id) continue;
          items.push({
            id: `discard:${d.discard_id}`,
            tab: 'rules',
            category: 'discard',
            categoryLabel: '10 棄牌規則',
            icon: '🗑',
            title: d.discard_id,
            subtitle: `${d.discard_kind || ''} · ${d.mode_scope || ''}`,
            haystack: `${d.discard_id} ${d.discard_kind || ''} ${d.mode_scope || ''} ${d.notes || ''} ${d.condition || ''}`.toLowerCase(),
          });
        }

        // ─ 9. 11_Mode_Config 模式 ─
        for (const m of modes) {
          if (!m.mode) continue;
          // 找出引用此模式的位置(reel_weights/grid/combo)
          const usedIn = [];
          if (reelWeights[m.mode]) usedIn.push('04');
          if (gridWeights[m.mode]) usedIn.push('05');
          if (comboWeights[m.mode]) usedIn.push('08');
          if (bins[m.mode]) usedIn.push('12');
          items.push({
            id: `mode:${m.mode}`,
            tab: 'global',                   // v3.1:模式已合進 global tab
            category: 'mode',
            categoryLabel: '模式定義',
            icon: '🔀',
            title: m.mode,
            subtitle: `引用於:${usedIn.length > 0 ? usedIn.join(', ') : '無'}${m.trigger_condition ? ' · 有觸發條件' : ''}`,
            haystack: `${m.mode} mode ${m.notes || ''} ${m.trigger_condition || ''}`.toLowerCase(),
          });
        }

        return items;
      });

      // 模糊匹配 + 排序
      // 規則:
      //  1. query 必須全部字符依序在 haystack 中出現(連續或不連續都行)
      //  2. 連續匹配加分;開頭匹配加分;title 內匹配比 subtitle 內匹配高分
      function _fuzzyMatch(haystack, title, query) {
        if (!query) return { match: true, score: 0 };
        const q = query.toLowerCase();
        const h = haystack;
        const t = title.toLowerCase();
        // 先快速檢查所有 query 字符都在 haystack 內
        let hi = 0;
        for (const qc of q) {
          const found = h.indexOf(qc, hi);
          if (found < 0) return { match: false, score: 0 };
          hi = found + 1;
        }
        // 計分
        let score = 0;
        // title 連續包含完整 query → 高分
        if (t.includes(q)) score += 100;
        if (t.startsWith(q)) score += 50;
        // haystack 連續包含 → 中分
        if (h.includes(q)) score += 20;
        // 短 title 加分(避免長字串混淆)
        score -= title.length * 0.1;
        return { match: true, score };
      }

      const searchResults = computed(() => {
        const q = searchQuery.value.trim();
        if (!q) {
          // 空 query → 列出 tab 與 modes 作為「快速跳轉」
          return searchIndex.value
            .filter(i => i.category === 'tab' || i.category === 'mode')
            .slice(0, 12);
        }
        const scored = [];
        for (const item of searchIndex.value) {
          const r = _fuzzyMatch(item.haystack, item.title, q);
          if (r.match) scored.push({ ...item, _score: r.score });
        }
        scored.sort((a, b) => b._score - a._score);
        return scored.slice(0, 30);   // 最多顯示 30 條
      });

      function openSearch() {
        searchOpen.value = true;
        searchQuery.value = '';
        searchSelectedIdx.value = 0;
        // 下一個 tick focus 輸入框
        setTimeout(() => {
          const el = document.querySelector('.cfg-search-input');
          if (el) el.focus();
        }, 30);
      }
      function closeSearch() {
        searchOpen.value = false;
      }
      function executeSearchResult(item) {
        if (!item) return;
        // 切到對應 tab
        if (item.tab) active.value = item.tab;
        closeSearch();
        emit('status', { type: 'ok', msg: `→ 跳至 ${item.categoryLabel}:${item.title}` });
      }
      function onSearchKeydown(ev) {
        const results = searchResults.value;
        if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          searchSelectedIdx.value = Math.min(searchSelectedIdx.value + 1, results.length - 1);
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          searchSelectedIdx.value = Math.max(searchSelectedIdx.value - 1, 0);
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          executeSearchResult(results[searchSelectedIdx.value]);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          closeSearch();
        }
      }
      // query 變動就重置 selected 到 0
      watch(searchQuery, () => { searchSelectedIdx.value = 0; });

      // 全域鍵盤監聽:Ctrl+K / Cmd+K
      function _onGlobalKeydown(ev) {
        // 只攔 Ctrl+K / Cmd+K(忽略其他)
        if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) {
          ev.preventDefault();
          if (searchOpen.value) closeSearch();
          else openSearch();
        }
        // v3.5 / #7:Ctrl+Z 復原矩陣批次操作(只在權重 tab 生效,且不在輸入框內)
        if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z') && !ev.shiftKey) {
          const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName);
          const isMatrixTab = ['reel_weights', 'grid_size_weights', 'combo_weights'].includes(active.value);
          if (isMatrixTab && !inField) {
            ev.preventDefault();
            undoMatrix();
          }
        }
        // v3.6 / #2:Ctrl+Shift+Z 或 Ctrl+Y 重做矩陣批次操作
        const isRedoCombo =
          ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === 'z' || ev.key === 'Z')) ||
          ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && (ev.key === 'y' || ev.key === 'Y'));
        if (isRedoCombo) {
          const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName);
          const isMatrixTab = ['reel_weights', 'grid_size_weights', 'combo_weights'].includes(active.value);
          if (isMatrixTab && !inField) {
            ev.preventDefault();
            redoMatrix();
          }
        }
        // ── layout tab:← → 切換 Reel(不在 input/textarea 內才攔)──
        if (active.value === 'layout' && !searchOpen.value) {
          const inField = ['INPUT', 'TEXTAREA'].includes(ev.target.tagName);
          if (!inField && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
            ev.preventDefault();
            if (ev.key === 'ArrowLeft')  activeReelIdx.value = Math.max(0, activeReelIdx.value - 1);
            if (ev.key === 'ArrowRight') activeReelIdx.value = Math.min(layout.length - 1, activeReelIdx.value + 1);
          }
        }
      }
      const debugJson = computed(() => JSON.stringify(g, null, 2));

      // [效能] JSON 預覽 gating:<details> 收合時不 render <pre>,對應的
      // *DebugJson computed 就不會被存取 → 不在每次編輯時白做 JSON.stringify。
      // 鍵:global/layout/paylines/constraints/rules/discards/bins。
      const dbgOpen = reactive({});

      // ── 自動儲存(防抖 400ms)── 共用 timer,合併所有 watcher 的寫入
      // ── 修改追蹤(任務 2)── 每個 tab 是否有未匯出的變動
      const dirtyTabs = reactive({});  // { tabId: true }
      // label → tabId 對應(scheduleSave 的中文 label 對到 TABS id)
      const LABEL_TO_TAB = {
        '全域設定':   'global',
        '模式設定':   'global',           // v3.1:模式設定已合進 01_Global,共用同一個 dirty 旗標
        '盤面結構':   'layout',
        '分佈區間':   'distribution_bins',
        '中獎線':     'paylines',
        '硬約束':     'constraints',
        'Reel 權重':  'reel_weights',
        '格數權重':   'grid_size_weights',
        '連爆權重':   'combo_weights',
        '棄牌規則':   'rules',            // v3.1:09+10 已合併為 'rules' tab
        '腳本規則':   'rules',            // v3.1:09+10 已合併為 'rules' tab
        '範本':       null,            // 不歸屬任何 tab
      };
      function markTabDirty(label) {
        const tid = LABEL_TO_TAB[label];
        if (tid) dirtyTabs[tid] = true;
      }
      function clearAllTabsDirty() {
        for (const k of Object.keys(dirtyTabs)) dirtyTabs[k] = false;
      }
      // 給左側分組標題用:該 group 內有幾個 tab 處於 dirty
      function groupDirtyCount(grp) {
        if (!grp || !grp.tabs) return 0;
        let n = 0;
        for (const t of grp.tabs) if (dirtyTabs[t.id]) n++;
        return n;
      }

      let saveTimer = null;
      // 只 flush 真正變動過的 store(每個 label 對應一個 saver)。
      // 原本每次 debounce tick 都重新序列化全部 11 個 store(含 3 個矩陣 deep clone),
      // 即使只改一格;改為累積 pending labels,到點時僅寫入有變動者。
      const _pendingSaves = new Set();
      function _saverFor(label) {
        switch (label) {
          case '全域設定': return () => saveGlobal({ ...g });
          case '模式設定': return () => saveModes(modes.map(m => ({ ...m })));
          case '盤面結構': return () => saveLayout(layout.map(r => ({ ...r })));
          case '分佈區間': return () => saveBins(JSON.parse(JSON.stringify(bins)));
          case '中獎線':   return () => savePaylines(paylines.map(p => ({ ...p })));
          case '硬約束':   return () => saveConstraints(constraints.map(c => ({ ...c })));
          case 'Reel 權重': return () => saveReelWeights(JSON.parse(JSON.stringify(reelWeights)));
          case '格數權重': return () => saveGridWeights(JSON.parse(JSON.stringify(gridWeights)));
          case '連爆權重': return () => saveComboWeights(JSON.parse(JSON.stringify(comboWeights)));
          case '棄牌規則': return () => saveDiscards(discards.map(d => ({ ...d })));
          case '腳本規則': return () => saveRules(rules.map(r => ({ ...r })));
          default: return null;
        }
      }
      function scheduleSave(label) {
        dirty.value = true;
        markTabDirty(label);
        if (label) _pendingSaves.add(label);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const labels = [..._pendingSaves];
          _pendingSaves.clear();
          let ok = true;
          for (const lb of labels) {
            const saver = _saverFor(lb);
            if (saver && !saver()) ok = false;
          }
          if (ok) {
            sourceMode.value = sourceMode.value === 'xlsx' ? 'xlsx' : 'local';
            dirty.value = false;
            // #10:LS 寫入成功 → 觸發變更回顧重算
            changesVersion.value++;
            // [效能] 健康度檢查與儲存同一拍(防抖)重算,解耦每次編輯的同步成本
            recomputeValidation();
            emit('status', { type: 'ok', msg: `${label} 已自動儲存` });
          } else {
            emit('status', { type: 'err', msg: 'localStorage 寫入失敗' });
          }
        }, 400);
      }
      watch(g,            () => scheduleSave('全域設定'), { deep: true });
      watch(modes,        () => scheduleSave('模式設定'), { deep: true });
      watch(layout,       () => scheduleSave('盤面結構'), { deep: true });
      watch(bins,         () => scheduleSave('分佈區間'), { deep: true });
      watch(paylines,     () => scheduleSave('中獎線'),   { deep: true });
      watch(constraints,  () => scheduleSave('硬約束'),   { deep: true });
      watch(reelWeights,  () => scheduleSave('Reel 權重'), { deep: true });
      watch(gridWeights,  () => scheduleSave('格數權重'), { deep: true });
      watch(comboWeights, () => scheduleSave('連爆權重'), { deep: true });
      watch(discards,     () => scheduleSave('棄牌規則'), { deep: true });
      watch(rules,        () => scheduleSave('腳本規則'), { deep: true });

      // ──────────────────────────────────────────────────────────
      //  #2 跨 tab 健康度檢查(validateConfig)
      //  [效能] 原為 computed:被 header 徽章(validationSummary)與左側
      //  分頁徽章(issuesByTab)常駐讀取,故任一 store/symbolNames 結構變動
      //  都會同步重跑這 ~225 行。改為「純函式 _computeValidationIssues()
      //  + 結果 ref」:只在自動儲存 flush 那一拍(同 changesVersion)與
      //  symbolNames 變動時重算,不再卡在每次編輯的熱路徑(徽章 ~400ms lag)。
      //  純函式在 setTimeout/手動呼叫情境下執行,無 reactive 追蹤 → 真正解耦。
      // ──────────────────────────────────────────────────────────
      function _computeValidationIssues() {
        const out = [];
        // 跑時 push 函數(以避免重複 push 同種訊息可在外層去重)
        const add = (severity, tab, msg, detail) => {
          out.push({ severity, tab, msg, detail: detail || '' });
        };

        // 從 modes 取現存模式名(去掉空白/重名後的有效模式)
        const validModeSet = new Set();
        const modeCount = {};
        for (const m of modes) {
          const nm = (m.mode || '').trim();
          if (!nm) continue;
          modeCount[nm] = (modeCount[nm] || 0) + 1;
          validModeSet.add(nm);
        }
        // 03_Symbols 名稱集合(SymbolRegistry)
        const symbolNameSet = new Set(symbolNames.value);

        // ─── 02_Layout ───
        if (layout.length === 0) {
          add('error', 'layout', '盤面結構為空,請至少新增一個 Reel');
        }
        const reelIdSeen = new Set();
        for (const r of layout) {
          if (reelIdSeen.has(r.reel_id)) {
            add('error', 'layout', `Reel ID 重複:${r.reel_id}`);
          } else {
            reelIdSeen.add(r.reel_id);
          }
        }

        // ─── 11_Mode_Config(現已合進 01_Global) ───
        if (validModeSet.size === 0) {
          add('error', 'global', '尚未定義任何模式,04/05/08 權重表都無法使用');
        }
        for (const [nm, c] of Object.entries(modeCount)) {
          if (c > 1) add('error', 'global', `模式名稱重複:${nm}(出現 ${c} 次)`);
        }

        // ─── 04_Reel_Weights ───
        for (const mode of Object.keys(reelWeights)) {
          if (!validModeSet.has(mode)) {
            add('warn', 'reel_weights',
              `孤兒模式:${mode}`,
              '這個模式在 11_Mode_Config 已不存在,但 Reel 權重表仍保留資料。匯出時會被忽略。');
            continue;
          }
          const entry = reelWeights[mode];
          if (!entry || !entry.symbol_ids) continue;
          const unknown = entry.symbol_ids.filter(s => !symbolNameSet.has(s));
          if (unknown.length > 0) {
            add('warn', 'reel_weights',
              `${mode} 模式:${unknown.length} 個符號未在 03_Symbols 定義`,
              `孤立符號:${unknown.join(', ')}`);
          }
        }

        // ─── 05_Grid_Size_Weights ───
        for (const mode of Object.keys(gridWeights)) {
          if (!validModeSet.has(mode)) {
            add('warn', 'grid_size_weights',
              `孤兒模式:${mode}`,
              '這個模式在 11_Mode_Config 已不存在,但格數權重仍保留資料。');
          }
        }

        // ─── 08_Combo_Weights ───
        // v4.0 / #14:連爆權重已移除,不再驗證

        // ─── 06_Paylines ───
        const lineIdSeen = new Map();
        for (const pl of paylines) {
          if (pl.line_id) {
            lineIdSeen.set(pl.line_id, (lineIdSeen.get(pl.line_id) || 0) + 1);
          }
          if (!pl.path) continue;
          const v = validatePayline(pl, layout);
          if (!v.valid) {
            add('warn', 'paylines',
              `${pl.line_id || '(未命名)'}:路徑無效`,
              v.msg);
          }
        }
        for (const [lid, c] of lineIdSeen) {
          if (c > 1) add('error', 'paylines', `中獎線 ID 重複:${lid}(出現 ${c} 次)`);
        }

        // ─── 07_Constraints ───
        const conIdSeen = new Map();
        for (const c of constraints) {
          if (c.constraint_id) {
            conIdSeen.set(c.constraint_id, (conIdSeen.get(c.constraint_id) || 0) + 1);
          }
          if (c.mode_scope && c.mode_scope !== 'ALL' && !validModeSet.has(c.mode_scope)) {
            add('warn', 'constraints',
              `${c.constraint_id || '(未命名)'}:mode_scope = ${c.mode_scope} 不存在`,
              '請選擇 ALL 或現存模式');
          }
          if (c.symbol_id && !symbolNameSet.has(c.symbol_id)) {
            add('warn', 'constraints',
              `${c.constraint_id || '(未命名)'}:符號 ${c.symbol_id} 未在 03_Symbols 定義`);
          }
        }
        for (const [cid, count] of conIdSeen) {
          if (count > 1) add('error', 'constraints', `約束 ID 重複:${cid}(出現 ${count} 次)`);
        }

        // ─── 09_Puzzle_Rules ───
        const ruleIdSeen = new Map();
        const validTriggerSet = new Set(TRIGGER_TYPES);
        const validActionSet  = new Set(ACTION_CATALOG.map(a => a.type));
        for (const r of rules) {
          const rid = r.rule_id || '(未命名)';
          if (r.rule_id) {
            ruleIdSeen.set(r.rule_id, (ruleIdSeen.get(r.rule_id) || 0) + 1);
          }
          // 規則 ID 為空
          if (!r.rule_id || !r.rule_id.trim()) {
            add('error', 'rules', '規則 ID 為空', `第 ${rules.indexOf(r) + 1} 條規則沒有編號`);
          }
          // mode_scope 不存在
          if (r.mode_scope && r.mode_scope !== 'ALL' && !validModeSet.has(r.mode_scope)) {
            add('warn', 'rules',
              `${rid}:mode_scope = ${r.mode_scope} 不存在`,
              '請改選 ALL 或現存模式;否則匯出時會被合併到 condition 但模式比對永遠 false');
          }
          // trigger 不在 enum
          if (!r.trigger || !validTriggerSet.has(r.trigger)) {
            add('error', 'rules',
              `${rid}:trigger 「${r.trigger || '(空)'}」不是合法觸發點`,
              '會在後端 LogicParser 載入時拋 ValueError;請從觸發點 chip 選一個');
          }
          // 沒有 actions
          const acts = Array.isArray(r.actions) ? r.actions : [];
          if (acts.length === 0) {
            add('warn', 'rules',
              `${rid}:沒有任何 action`,
              '條件成立也不會有副作用,僅統計觸發次數');
          }
          // 各 action 的合法性
          for (let ai = 0; ai < acts.length; ai++) {
            const act = acts[ai] || {};
            const tag = `${rid} · action #${ai + 1}`;
            if (!act.atype) {
              add('error', 'rules', `${tag}:atype 為空`);
              continue;
            }
            if (!validActionSet.has(act.atype)) {
              add('error', 'rules',
                `${tag}:未知的 atype「${act.atype}」`,
                `合法值:${ACTION_CATALOG.map(a => a.type).join(', ')}`);
              continue;
            }
            const meta = ACTION_BY_TYPE[act.atype];
            if (!meta) continue;
            // 必填參數檢查
            for (const p of meta.params) {
              if (p.required) {
                const v = (act.params || {})[p.key];
                if (v == null || v === '') {
                  add('error', 'rules',
                    `${tag}:必填參數「${p.key}」未填`,
                    p.label || '');
                }
              }
              // symbol 引用檢查
              if (p.type === 'symbol' && act.params && act.params[p.key]) {
                if (!symbolNameSet.has(act.params[p.key])) {
                  add('warn', 'rules',
                    `${tag}:符號「${act.params[p.key]}」未在 03_Symbols 定義`);
                }
              }
              // mode 引用檢查
              if (p.type === 'mode' && act.params && act.params[p.key]) {
                if (!validModeSet.has(act.params[p.key])) {
                  add('warn', 'rules',
                    `${tag}:模式「${act.params[p.key]}」不存在於 11_Mode_Config`);
                }
              }
            }
          }
          // emits 宣告但 actions 中沒有對應的 EMIT_EVENT(只警告,不是錯)
          if (Array.isArray(r.emits) && r.emits.length > 0) {
            const actualEmits = acts
              .filter(a => a.atype === 'EMIT_EVENT')
              .map(a => (a.params || {}).name)
              .filter(Boolean);
            const missing = r.emits.filter(e => !actualEmits.includes(e));
            if (missing.length > 0) {
              add('warn', 'rules',
                `${rid}:emits 宣告 [${missing.join(', ')}] 但 actions 中沒對應的 EMIT_EVENT`,
                'emits 為文件性宣告;若真的會發出該事件,加一個 EMIT_EVENT(name=...) action');
            }
          }
        }
        for (const [rid, count] of ruleIdSeen) {
          if (count > 1) add('error', 'rules', `規則 ID 重複:${rid}(出現 ${count} 次)`);
        }

        // ─── 10_Discard_Rules ───
        const discIdSeen = new Map();
        for (const d of discards) {
          if (d.discard_id) {
            discIdSeen.set(d.discard_id, (discIdSeen.get(d.discard_id) || 0) + 1);
          }
          if (d.mode_scope && d.mode_scope !== 'ALL' && !validModeSet.has(d.mode_scope)) {
            add('warn', 'rules',
              `${d.discard_id || '(未命名)'}:mode_scope = ${d.mode_scope} 不存在`);
          }
        }
        for (const [did, count] of discIdSeen) {
          if (count > 1) add('error', 'rules', `棄牌 ID 重複:${did}(出現 ${count} 次)`);
        }

        // ─── 12_Distribution_Bins ───
        for (const modeKey of Object.keys(bins)) {
          if (!validModeSet.has(modeKey)) {
            add('warn', 'distribution_bins',
              `孤兒模式:${modeKey}`,
              '這個模式在 11_Mode_Config 已不存在。');
          }
        }

        return out;
      }

      // [效能] 結果存 ref;只在自動儲存 flush(同一拍)與 symbolNames 變動時重算。
      // 初始即時算一次(此處在 setup 同步流程中、非 effect 內 → 不建立追蹤)。
      const validationIssues = ref(_computeValidationIssues());
      function recomputeValidation() {
        validationIssues.value = _computeValidationIssues();
      }
      // 符號來自另一頁(SymbolRegistry),改動罕見且便宜 → 即時重算,避免徽章漏更新。
      watch(symbolNames, recomputeValidation);

      // 摘要:錯誤/警告數
      const validationSummary = computed(() => {
        const issues = validationIssues.value;
        let err = 0, warn = 0;
        for (const i of issues) {
          if (i.severity === 'error') err++;
          else if (i.severity === 'warn') warn++;
        }
        return { error: err, warn, total: issues.length };
      });

      // 健康度面板開關
      const validationPanelOpen = ref(false);
      function toggleValidationPanel() {
        validationPanelOpen.value = !validationPanelOpen.value;
      }
      function goToTabFromValidation(tabId) {
        active.value = tabId;
        validationPanelOpen.value = false;
      }

      // 「警告依 tab 分組」給 popover UI 用
      const issuesByTab = computed(() => {
        const groups = {};
        for (const i of validationIssues.value) {
          if (!groups[i.tab]) groups[i.tab] = [];
          groups[i.tab].push(i);
        }
        // 依 TABS 原本順序排序
        const ordered = [];
        for (const t of TABS) {
          if (groups[t.id]) {
            ordered.push({ tab: t, issues: groups[t.id] });
          }
        }
        return ordered;
      });

      // ──────────────────────────────────────────────────────────
      //  #10 變更回顧
      //  baseline 在 onMounted 時 ensure;之後使用者每次修改觸發 scheduleSave
      //  寫入 LS,changesByTab 就會 re-compute
      //  注意:diff 是讀 LS 而非 reactive 物件,所以需要 changesVersion 來觸發重算
      // ──────────────────────────────────────────────────────────
      const changesPanelOpen = ref(false);
      const changesVersion = ref(0);   // 寫 LS 後 +1,觸發 changesByTab 重算
      const baselineInfo = ref(null);  // { takenAt, source, sourceLabel }
      function refreshBaselineInfo() {
        const b = loadBaseline();
        baselineInfo.value = b ? { takenAt: b.takenAt, source: b.source, sourceLabel: b.sourceLabel } : null;
      }
      const changesByTab = computed(() => {
        // 故意依賴 changesVersion 來強制重算
        // eslint-disable-next-line no-unused-expressions
        changesVersion.value;
        const b = loadBaseline();
        if (!b) return [];
        return computeChangesFromBaseline(b);
      });
      const changesSummary = computed(() => {
        const groups = changesByTab.value;
        let total = 0;
        for (const g of groups) total += g.changes.length;
        return { tabs: groups.length, total };
      });
      function toggleChangesPanel() {
        changesPanelOpen.value = !changesPanelOpen.value;
        if (changesPanelOpen.value) {
          refreshBaselineInfo();
          changesVersion.value++;  // 開啟時強制重算一次,確保最新
        }
      }
      function goToTabFromChanges(tabId) {
        active.value = tabId;
        changesPanelOpen.value = false;
      }
      // 「將當前狀態定為新基準」— 給使用者清空變更列表的選項
      function resetBaseline() {
        if (!confirm('將「目前的設定狀態」設為新的變更基準?\n\n這之後做的修改才會出現在變更列表。原本累積的變更摘要會被清空(但實際設定不變)。')) return;
        saveBaseline('manual', '使用者手動設定基準');
        refreshBaselineInfo();
        changesVersion.value++;
        emit('status', { type: 'ok', msg: '✓ 已將當前狀態設為新基準' });
      }
      // 給 UI 顯示 baseline 時間用
      function formatBaselineTime(iso) {
        if (!iso) return '';
        try {
          const d = new Date(iso);
          // 「2 小時前」「3 天前」這種相對時間
          const diff = Date.now() - d.getTime();
          const sec = Math.floor(diff / 1000);
          if (sec < 60) return '剛剛';
          if (sec < 3600) return Math.floor(sec / 60) + ' 分鐘前';
          if (sec < 86400) return Math.floor(sec / 3600) + ' 小時前';
          if (sec < 86400 * 30) return Math.floor(sec / 86400) + ' 天前';
          return d.toLocaleString('zh-TW');
        } catch (e) { return iso; }
      }

      // ── 重設當前分頁 ──
      // 對所有的 confirm 提示加上「即將清除」的具體內容摘要,讓使用者明確知道後果
      function resetCurrent() {
        const id = active.value;
        const tab = TABS.find(t => t.id === id);
        const tabLabel = tab ? `「${tab.sheet} ${tab.name}」` : '本分頁';

        if (id === 'global') {
          // v3.1:global 同時涵蓋全域 + 模式定義(原 11_Mode_Config 已合併進來)
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· 模擬參數(simulation_count、random_seed、output_prefix)\n· 賠付模型(pay_type、ways_direction、cluster_min_size)\n· 模式定義(目前 ${modes.length} 個模式:${modes.map(m => m.mode).filter(Boolean).join(', ') || '無'})\n· 各模式的 trigger_condition 拼圖暫存\n· 進階參數(max_chain_depth/max_chain_per_rule/big_win_thresholds/dead_spin_buckets)\n\n所有欄位將回到預設值,此動作不可復原。`)) return;
          Object.assign(g, DEFAULT_GLOBAL);
          modes.splice(0, modes.length, ...DEFAULT_MODES.map(m => ({ ...m })));
          emit('status', { type: 'ok', msg: '已重設全域設定 + 模式定義為預設值' });
        } else if (id === 'layout') {
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· 目前 ${layout.length} 個 Reel(含副 Reel 設定)\n\n回到預設 5 Reel × 3 列,此動作不可復原。`)) return;
          layout.splice(0, layout.length, ...DEFAULT_LAYOUT.map(r => ({ ...r })));
          emit('status', { type: 'ok', msg: '已重設盤面結構為預設值' });
        } else if (id === 'distribution_bins') {
          const binKeys = Object.keys(bins);
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· ${binKeys.length} 個模式的分佈區間設定(${binKeys.join(', ') || '無'})\n\n此動作不可復原。`)) return;
          Object.keys(bins).forEach(k => delete bins[k]);
          Object.assign(bins, JSON.parse(JSON.stringify(DEFAULT_BINS)));
          for (const n of modeNames.value) ensureBinForMode(n);
          emit('status', { type: 'ok', msg: '已重設分佈區間為預設值' });
        } else if (id === 'paylines') {
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· 目前 ${paylines.length} 條中獎線\n\n回到預設 5 線範本,此動作不可復原。`)) return;
          paylines.splice(0, paylines.length, ...DEFAULT_PAYLINES.map(p => ({ ...p })));
          emit('status', { type: 'ok', msg: '已重設中獎線為預設值' });
        } else if (id === 'constraints') {
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· 目前 ${constraints.length} 條硬約束\n\n回到預設範本,此動作不可復原。`)) return;
          constraints.splice(0, constraints.length, ...DEFAULT_CONSTRAINTS.map(c => ({ ...c })));
          emit('status', { type: 'ok', msg: '已重設硬約束為預設值' });
        } else if (id === 'reel_weights') {
          const modeCount = Object.keys(reelWeights).length;
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· ${modeCount} 個模式的 Reel × Symbol 權重矩陣\n\n所有權重會被設為均勻 100,此動作不可復原。`)) return;
          Object.keys(reelWeights).forEach(k => delete reelWeights[k]);
          for (const m of modeNames.value) ensureReelWeightsForMode(m);
          emit('status', { type: 'ok', msg: '已重設 Reel 權重為均勻 100' });
        } else if (id === 'grid_size_weights') {
          const modeCount = Object.keys(gridWeights).length;
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· ${modeCount} 個模式的格數權重\n\n所有權重會被設為均勻 100,此動作不可復原。`)) return;
          Object.keys(gridWeights).forEach(k => delete gridWeights[k]);
          for (const m of modeNames.value) ensureGridWeightsForMode(m);
          emit('status', { type: 'ok', msg: '已重設格數權重為均勻 100' });
        } else if (id === 'combo_weights') {
          const modeCount = Object.keys(comboWeights).length;
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· ${modeCount} 個模式的連爆權重表(含所有爆階段)\n\n所有權重會被設為均勻 100,此動作不可復原。`)) return;
          Object.keys(comboWeights).forEach(k => delete comboWeights[k]);
          Object.keys(comboActiveStep).forEach(k => delete comboActiveStep[k]);
          for (const m of modeNames.value) ensureComboWeightsForMode(m);
          emit('status', { type: 'ok', msg: '已重設連爆權重為均勻 100' });
        } else if (id === 'rules') {
          // v3.1:09 + 10 已合併;rules 同時涵蓋拼圖規則與棄牌規則
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· 目前 ${rules.length} 條拼圖規則(含拼圖建構器暫存與 raw/builder 切換狀態)\n· 目前 ${discards.length} 條棄牌規則(含拼圖暫存)\n\n所有規則會回到預設範本,此動作不可復原。`)) return;
          Object.keys(builderRowsMap).forEach(k => delete builderRowsMap[k]);
          Object.keys(ruleEditMode).forEach(k => delete ruleEditMode[k]);
          Object.keys(ruleParseError).forEach(k => delete ruleParseError[k]);
          rules.splice(0, rules.length, ...DEFAULT_RULES.map(r => ({ ...r })));
          discards.splice(0, discards.length, ...DEFAULT_DISCARDS.map(d => ({ ...d })));
          emit('status', { type: 'ok', msg: '已重設拼圖規則 + 棄牌規則為預設值' });
        } else if (id === 'symbols') {
          emit('status', { type: 'wait', msg: '請使用上方「↺ 重設」按鈕(在符號清單卡片內)' });
        } else {
          emit('status', { type: 'wait', msg: '本分頁尚未實作,沒有可重設的內容' });
        }
      }

      onMounted(() => {
        emit('status', { type: 'wait', msg: 'A 設定檔編輯器' });
        // v3.4:啟動暗色模式(套用 LS 中的 themeMode)
        _applyTheme(themeMode.value);
        _setupThemeWatcher();
        document.addEventListener('click', _onDocClickForMatrixMenu, true);
        document.addEventListener('click', _onDocClickForRulesAddMenu, true);
        document.addEventListener('click', _onDocClickForPaylineAddMenu, true);
        // v3.3 新增的 listener
        document.addEventListener('click', _onDocClickForLayoutPreset, true);
        document.addEventListener('click', _onDocClickForColMenu, true);
        // v3.5:整列操作 popover
        document.addEventListener('click', _onDocClickForRowMenu, true);
        // v3.5:08 跨爆階段複製 popover
        document.addEventListener('click', _onDocClickForStepCopy, true);
        // #15:全域 Ctrl+K 開啟搜尋
        document.addEventListener('keydown', _onGlobalKeydown);
        // #10:確保 baseline 存在(若首次使用就用當前 LS 內容建立)
        ensureBaseline();
        refreshBaselineInfo();
      });
      onUnmounted(() => {
        document.removeEventListener('click', _onDocClickForMatrixMenu, true);
        document.removeEventListener('click', _onDocClickForRulesAddMenu, true);
        document.removeEventListener('click', _onDocClickForPaylineAddMenu, true);
        document.removeEventListener('click', _onDocClickForLayoutPreset, true);
        document.removeEventListener('click', _onDocClickForColMenu, true);
        document.removeEventListener('click', _onDocClickForRowMenu, true);
        document.removeEventListener('click', _onDocClickForStepCopy, true);
        document.removeEventListener('keydown', _onGlobalKeydown);
      });

      // ============================================================
      //  v4.1 補回:template 需要、但先前 setup 未實作/未 return 的綁定
      //  分四組:賠付模型 / 計分方向 / 分頁適用性 / layout 群組多選 +
      //  預覽互動 / 矩陣 quickbar。皆只動 reactive 既有資料,不碰 A.xlsx 契約。
      // ============================================================

      // ── 賠付模型(01_Global,5 按鈕:LINE/WAYS/MEGAWAYS/SCATTER/CLUSTER)──
      //    引擎 pay_type enum 只有 LINE/WAYS/SCATTER/CLUSTER;
      //    MEGAWAYS = pay_type='WAYS' + UI-only megaways 旗標(a_loader 忽略 megaways)
      const PAY_MODELS = [
        { id: 'LINE',     label: 'LINE 中獎線',  desc: '固定中獎線計分' },
        { id: 'WAYS',     label: 'WAYS 全路徑',  desc: '相鄰輪相同符號即計分(243 ways 等)' },
        { id: 'MEGAWAYS', label: 'MEGAWAYS',     desc: '全路徑 + 每輪列數可變(可變高度盤面)' },
        { id: 'SCATTER',  label: 'SCATTER 任意', desc: '任意位置散佈計分' },
        { id: 'CLUSTER',  label: 'CLUSTER 群集', desc: '同符相鄰成群計分' },
      ];
      const activePayModel = computed(() =>
        (g.pay_type === 'WAYS' && g.megaways) ? 'MEGAWAYS' : g.pay_type
      );
      function selectPayModel(id) {
        if (id === 'MEGAWAYS') {
          g.pay_type = 'WAYS';
          g.megaways = true;
        } else {
          g.pay_type = id;
          g.megaways = false;
        }
        emit('status', { type: 'ok', msg: `賠付模型已設為 ${id}` });
      }

      // ── 計分方向(全域單一控制,同時套用 ways_direction 與 payline_direction)──
      const scanDirApplicable = computed(() => {
        const m = activePayModel.value;
        return m === 'LINE' || m === 'WAYS' || m === 'MEGAWAYS';
      });
      const curScanDir = computed(() => g.ways_direction || g.payline_direction || 'LTR');
      function setScanDir(d) {
        if (!WAYS_DIRS.includes(d)) return;
        g.ways_direction = d;
        g.payline_direction = d;
      }

      // ── 分頁適用性(條件式反灰;grid_size_weights / paylines)──
      function tabNotApplicable(id) {
        if (id === 'grid_size_weights') return !isVariableHeightBoard.value;
        if (id === 'paylines')          return g.pay_type !== 'LINE';
        return false;
      }
      function tabNAReason(id) {
        if (id === 'grid_size_weights')
          return '目前盤面為等高(各輪 max_rows 相同),格數權重不會被引擎使用;改用 Megaways / 不等高盤面後才需設定。';
        if (id === 'paylines')
          return `目前賠付模型為 ${activePayModel.value},不使用固定中獎線。改回 LINE 才需要設定中獎線。`;
        return '';
      }

      // ── 04/05 矩陣熱力圖:grid 版(沿用 reel 的色階,改用 gridMaxWeight)──
      function gridHeatColor(mode, w) {
        if (w === 0 || w === undefined || w === null) {
          return 'rgba(120,120,140,0.10)';
        }
        const mx = gridMaxWeight(mode);
        if (!mx) return 'transparent';
        const ratio = Math.sqrt(Math.min(1, w / mx));
        return `rgba(140, 110, 220, ${(0.08 + 0.50 * ratio).toFixed(3)})`;
      }

      // ── 矩陣 quickbar(常駐快速操作列)──
      const matrixFillValue = ref(10);
      function quickFillTable(kind, mode) {
        matrixFillAll(kind, mode, null, Math.max(0, Number(matrixFillValue.value) || 0));
      }
      function quickApplySelection() {
        if (matrixSelection.keys.size === 0) return;
        applyMatrixSelOp('set', Math.max(0, Number(matrixFillValue.value) || 0));
      }
      function selectWholeColumn(kind, mode, col) {
        clearMatrixSelection();
        const reels = sortedReels(kind, mode);
        const colStr = String(col);
        reels.forEach(r => matrixSelection.keys.add(_selKey(kind, mode, r.reel_id, colStr)));
        matrixSelection.anchor = null;
      }
      function selectWholeRow(kind, mode, reelId) {
        clearMatrixSelection();
        const cols = _colsForKind(kind, mode);
        cols.forEach(c => matrixSelection.keys.add(_selKey(kind, mode, reelId, String(c))));
        matrixSelection.anchor = null;
      }

      // ── layout:Reel chip 多選 / 群組批次編輯(Batch C)──
      const selectedReelIdxs = ref([]);                       // 0-based reel index 多選
      const groupActive = computed(() => selectedReelIdxs.value.length >= 2);
      const groupRowsValue = ref(3);
      const groupOffsetValue = ref(0);

      function clearReelSelection() { selectedReelIdxs.value = []; }

      function selectReelById(reelId) {
        const idx = layout.findIndex(r => r.reel_id === reelId);
        if (idx >= 0) {
          activeReelIdx.value = idx;
          selectedReelIdxs.value = [];
        }
      }
      function onReelChipClick(idx, ev) {
        if (idx < 0 || idx >= layout.length) return;
        if (ev && (ev.ctrlKey || ev.metaKey)) {
          const arr = selectedReelIdxs.value.slice();
          const at = arr.indexOf(idx);
          if (at >= 0) arr.splice(at, 1); else arr.push(idx);
          selectedReelIdxs.value = arr;
          activeReelIdx.value = idx;
        } else if (ev && ev.shiftKey) {
          const anchor = activeReelIdx.value;
          const lo = Math.min(anchor, idx), hi = Math.max(anchor, idx);
          const arr = [];
          for (let i = lo; i <= hi; i++) arr.push(i);
          selectedReelIdxs.value = arr;
          activeReelIdx.value = idx;
        } else {
          selectedReelIdxs.value = [];
          activeReelIdx.value = idx;
        }
      }
      // 群組批次的作用對象:有多選就用多選,否則退回當前單一 reel
      function _groupTargetReels() {
        const set = new Set(selectedReelIdxs.value);
        if (set.size === 0) set.add(activeReelIdx.value);
        return [...set].map(i => layout[i]).filter(Boolean);
      }
      function groupSetRows(v) {
        const n = Math.max(1, Math.min(20, Number(v) || 1));
        _groupTargetReels().forEach(r => { r.max_rows = n; });
      }
      function groupAdjustRows(d) {
        _groupTargetReels().forEach(r => {
          r.max_rows = Math.max(1, Math.min(20, (Number(r.max_rows) || 1) + d));
        });
      }
      function groupSetOffset(v) {
        const n = Math.max(-20, Math.min(20, Number(v) || 0));
        _groupTargetReels().forEach(r => { r.y_offset = n; });
      }
      function groupAdjustOffset(d) {
        _groupTargetReels().forEach(r => {
          r.y_offset = Math.max(-20, Math.min(20, (Number(r.y_offset) || 0) + d));
        });
      }
      function groupToggleSubreel() {
        const targets = _groupTargetReels();
        const turnOn = targets.some(r => !r.has_subreel); // 有任一未開 → 整組開;否則整組關
        targets.forEach(r => {
          r.has_subreel = turnOn;
          if (turnOn) {
            if (!r.subreel_position) r.subreel_position = 'BOTTOM';
            if (!r.subreel_rows || r.subreel_rows < 1) r.subreel_rows = 1;
          }
        });
      }

      // ── layout:SVG 預覽點選 / 拖曳互換 ──
      const previewDragFrom = ref(-1);
      const previewDragOver = ref(-1);
      let _previewPointerActive = false;
      let _previewPointerUp = null;
      function onPreviewPointerDown(reelIdx, ev) {
        if (reelIdx < 0 || reelIdx >= layout.length) return;
        activeReelIdx.value = reelIdx;
        selectedReelIdxs.value = [];
        previewDragFrom.value = reelIdx;
        previewDragOver.value = reelIdx;
        _previewPointerActive = true;
        // 用 window pointerup 收尾,允許在 svg 外放開
        _previewPointerUp = () => {
          if (previewDragFrom.value >= 0 && previewDragOver.value >= 0 &&
              previewDragFrom.value !== previewDragOver.value) {
            swapReels(previewDragFrom.value, previewDragOver.value);
          }
          previewDragFrom.value = -1;
          previewDragOver.value = -1;
          _previewPointerActive = false;
          if (_previewPointerUp) {
            window.removeEventListener('pointerup', _previewPointerUp, true);
            _previewPointerUp = null;
          }
        };
        window.addEventListener('pointerup', _previewPointerUp, true);
      }
      function onPreviewPointerEnter(reelIdx) {
        if (!_previewPointerActive) return;
        if (reelIdx < 0 || reelIdx >= layout.length) return;
        previewDragOver.value = reelIdx;
      }

      return {
        // ── v4.1 補回(賠付模型 / 計分方向 / 分頁適用性)──
        PAY_MODELS, activePayModel, selectPayModel,
        scanDirApplicable, curScanDir, setScanDir,
        tabNotApplicable, tabNAReason,
        gridHeatColor,
        // ── v4.1 補回(矩陣 quickbar)──
        matrixFillValue, quickFillTable, quickApplySelection,
        selectWholeColumn, selectWholeRow,
        // ── v4.1 補回(layout 群組多選 + 預覽互動)──
        selectedReelIdxs, groupActive, groupRowsValue, groupOffsetValue,
        clearReelSelection, selectReelById, onReelChipClick,
        groupSetRows, groupAdjustRows, groupSetOffset, groupAdjustOffset, groupToggleSubreel,
        previewDragFrom, previewDragOver, onPreviewPointerDown, onPreviewPointerEnter,
        // ── template 用非底線名稱的別名(對應既有底線實作)──
        selectItem: _selectItem,
        handleSaveAsTemplate: _handleSaveAsTemplate,
        dragReelIdx: _dragReelIdx,
        dragOverIdx: _dragOverIdx,
        tplNameInputRef,
        TABS, TABS_BY_GROUP, visibleTabGroups, isVariableHeightBoard, active, activeTab, groupDirtyCount,
        g, PAY_TYPES, WAYS_DIRS,
        registry, symbolList, symbolNames, allModeScopes,
        modes, modeNames, duplicateNames, modesDebugJson,
        addMode, removeMode, modeCardKey, passStatus,
        layout, layoutCells, layoutLabels, layoutViewBox, totalCells, layoutDebugJson,
        activeReelIdx, activeReel,
        addReel, removeReel, swapReels,
        _dragReelIdx, _dragOverIdx,
        onReelDragStart, onReelDragOver, onReelDragLeave, onReelDrop, onReelDragEnd,
        LAYOUT_CELL_SIZE: LAYOUT_CELL_SIZE_OUT,
        bins, binsFor, binsValid, binTickPercent, binsDebugJson,
        paylines, paylinesDebugJson, PAYLINE_DIRECTIONS,
        addPayline, removePayline, paylineValid, paylineCells,
        // ── #9 中獎線視覺點選 ──
        paylineClickMode, paylineCellPathIndex, paylineCellsForClickMode,
        onPaylineCellClick, onPaylineSvgRightClick, clearPaylinePath,
        // ── v3.2 中獎線升級 ──
        paylineLineMode, paylineGuideOn,
        paylineCompleteness, paylineNextExpectedReel, paylineCellState,
        humanizePaylinePath, paylineDirLabel, paylineDirHint,
        paylineOverlapIdxs, activePaylineStatus,
        PAYLINE_PRESETS, addPaylineFromPreset,
        paylineAddMenuOpen, togglePaylineAddMenu,
        paylineOverviewMode, paylineColor, paylineOverviewLines,
        paylineMiniSvg,
        constraints, constraintsDebugJson, constraintDuplicateIds, CONSTRAINT_TYPES,
        addConstraint, removeConstraint,
        reelWeights, reelWeightsDebugJson,
        reelW, reelSymbolIdsStr, setReelSymbolIdsStr,
        reelMaxWeight, reelHeatColor, reelTotalForRow,
        reelFillRowUniform, reelCopyToAll, sortReelSymbols,
        matrixRowSort, getRowSort, setRowSort, sortedReels,
        // ── #4 矩陣模式級操作(04/05/08 共用)──
        matrixMenu, openMatrixMenu, closeMatrixMenu,
        matrixScale, matrixFillAll, matrixNormalizeRows, matrixClearAll,
        matrixCopyFromMode, matrixOtherModes,
        // ── #2 健康度檢查 ──
        validationIssues, validationSummary, validationPanelOpen,
        toggleValidationPanel, goToTabFromValidation, issuesByTab,
        // ── #10 變更回顧 ──
        changesPanelOpen, changesByTab, changesSummary, baselineInfo,
        toggleChangesPanel, goToTabFromChanges, resetBaseline, formatBaselineTime,
        // ── #5 Test Inspector(09/10/11 共用)──
        pinnedTest, inspectorOpen, inspectorCtxExpanded,
        pinTest, unpinTest, evalPinned, pinnedKindLabel, isInPuzzleTab,
        // ── #15 Ctrl+K 搜尋 ──
        searchOpen, searchQuery, searchSelectedIdx, searchResults,
        openSearch, closeSearch, executeSearchResult, onSearchKeydown,
        gridWeights, gridWeightsDebugJson,
        gridW, gridSizesStr, setGridSizesStr,
        gridTotalForRow, gridFillRowUniform, sortGridSizes,
        gridMaxWeight,
        comboWeights, comboWeightsDebugJson, comboActiveStep,
        comboW, comboOtherSteps, comboSymbolIdsStr, setComboSymbolIdsStr,
        comboMaxWeight, comboHeatColor, comboTotalForRow,
        comboFillRowUniform, comboCopyToAllReels, comboCopyStepTo,
        comboAddStep, comboRemoveStep, sortComboSymbols,
        discards, discardsDebugJson, discardDuplicateIds, discardStats, DISCARD_KINDS,
        addDiscard, removeDiscard,
        rules, rulesDebugJson, ruleDuplicateIds,
        addRule, removeRule,
        // v3.3:複製 + 白話翻譯
        duplicateRule, duplicateDiscard,
        humanizeCondition, humanizeAction, humanizeRule, humanizeDiscard,
        // v3.3 A4:layout 範本
        LAYOUT_PRESETS, layoutPresetMenuOpen, toggleLayoutPresetMenu, applyLayoutPreset,
        // v3.3 A1:constraints 兩欄
        selectedConstraintIdx, parseReelsAllowed, toggleConstraintReel, constraintReelActive,
        duplicateConstraint, humanizeConstraint, constraintStatus, constraintMiniSvg,
        constraintActiveReelChips,
        // v3.3 A2:矩陣強化
        reelTotalForCol, reelFillColUniform, reelScaleCol, reelNormalizeCol, reelCopyColToAll,
        colMenu, openColMenu, closeColMenu,
        matrixSelection, toggleMatrixCell, clearMatrixSelection,
        isMatrixCellSelected, applyMatrixSelOp,
        // v3.5:矩陣顯示模式 + 05/08 整欄操作
        getMatrixDisplayMode, setMatrixDisplayMode, cellPercent,
        gridTotalForCol, gridFillColUniform, gridScaleCol, gridNormalizeCol, gridCopyColToAll,
        comboTotalForCol, comboFillColUniform, comboScaleCol, comboNormalizeCol, comboCopyColToAll,
        // v3.5 / #5:整列操作 popover(合計欄 chip)
        rowMenu, openRowMenu, closeRowMenu,
        reelNormalizeRow, gridNormalizeRow, comboNormalizeRow,
        reelScaleRow, gridScaleRow, comboScaleRow,
        // v3.5 / #13:08 跨爆階段複製 popover
        stepCopyMenu, toggleStepCopyMenu, closeStepCopyMenu,
        // v3.5 / #6:熱力圖 top-N 標示
        reelIsTopWeight, comboIsTopWeight,
        // v3.5 / #9:從 03_Symbols 同步
        reelSyncFromRegistry, comboSyncFromRegistry,
        // v3.5 / #16:05 跨模式複製提示
        gridHintDismissed, dismissGridHint, gridCopyToAllModes,
        // v3.5 / #14:平均占比預覽
        reelSymbolAvgProb, comboSymbolAvgProb, gridSizeAvgProb,
        fmtPct, probBarOpen, toggleProbBar,
        // v3.5 / #15:CSV 匯入匯出
        exportReelCSV, importReelCSV,
        exportGridCSV, importGridCSV,
        exportComboCSV, importComboCSV,
        // v3.5 / #4A + #4B:08 檢視模式
        comboViewMode, setComboViewMode,
        comboCellDiff, comboDiffLabel,
        // v3.6 / #2:Undo / Redo
        undoMatrix, canUndo, undoCountForCurrent,
        redoMatrix, canRedo, redoCountForCurrent,
        // v3.6 / #3:diff baseline picker(combo step)
        comboDiffBaseline, effectiveDiffBaseline, setComboDiffBaseline, isComboDiffBaselinePinned,
        // v3.6 / #4:隱藏 step
        comboHiddenSteps, comboStepVisible, toggleComboStepVisible,
        comboVisibleSteps, comboHiddenCount, comboShowAllSteps,
        // v3.6 / #5:reel/grid 整 mode 比較
        reelViewMode, gridViewMode, setReelViewMode, setGridViewMode,
        reelDiffBaselineMode, gridDiffBaselineMode,
        effectiveReelBaselineMode, effectiveGridBaselineMode,
        setReelBaselineMode, setGridBaselineMode,
        isReelBaselinePinned, isGridBaselinePinned,
        reelModeVisible, gridModeVisible,
        toggleReelModeVisible, toggleGridModeVisible,
        reelVisibleModes, gridVisibleModes,
        reelShowAllModes, gridShowAllModes,
        reelHiddenCount, gridHiddenCount,
        reelCellDiff, gridCellDiff, cellDiffLabel,
        // v3.4 / C12:暗色模式
        themeMode, themeModeIcon, themeModeLabel, setThemeMode, cycleThemeMode,
        // v3.4 / B6:範本載入 diff preview
        tplLoadPreviewOpen, tplLoadPreviewData, showTemplateDiff, closeTemplateDiff,
        confirmTemplateDiffLoad,
        // v3.4 / B5:active tab issues
        activeTabIssues,
        presetDrawerOpen, presetSearch, filteredPresetGroups, insertPreset,
        latestSimStats, getRuleSimBadge, refreshLatestSimStats,
        TRIGGER_TYPES, TRIGGER_CATALOG, TRIGGER_BY_TYPE,
        OP_TYPES, OP_IS_LIST, VAR_CATEGORIES, VAR_CATEGORY_MAP,
        builderRowsMap, ruleEditMode, ruleParseError,
        ensureBuilderRows, addBuilderRow, removeBuilderRow,
        rebuildConditionForRule, setRuleEditMode,
        changeRowCategory, rowCategoryMeta,
        renameRuleBuilderState,
        ruleTestOpen, testCtx, toggleRuleTest, evalRuleNow,
        condBuilderState, condKey, discardCond, modeCond,
        ACTION_CATALOG, ACTION_BY_TYPE, actionsByGroup,
        actionEditMode, actionsParseError,
        actionMeta, actParamValue, setActParam,
        addAction, removeAction, moveAction, duplicateAction,
        changeActionAtType, setActionsFromDSL, setActionEditMode,
        buildActionsDSL,
        // legacy(向下相容,不再使用,但留著避免 undefined 錯誤)
        actionParamsObj, paramValue, setActionParam, changeActionType,
        parseActionParams,
        exportXlsx, onImportFile,
        dirtyTabs,
        showTemplatePanel, templateList, newTemplateName, newTemplateDesc,
        tplSaveOpen, _handleSaveAsTemplate,
        // ── #16 範本 diff ──
        diffOpen, diffSelecting, diffPickA, diffPickB, diffPickFor,
        diffComparisonResult, diffTotalCount,
        openDiffModal, closeDiffModal, pickTemplateForDiff,
        runTemplateDiff, diffBackToSelecting, diffSwapAB,
        templateSearch, templateSortBy, TEMPLATE_SORT_OPTIONS, filteredSortedTemplates,
        toggleTemplatePanel, refreshTemplateList,
        saveAsTemplate, loadTemplateConfirm, deleteTemplateConfirm,
        exportTemplateFile, onImportTemplate,
        sourceIcon, sourceText, sourceTextShort, dirty,
        devMode, onSourceIconClick,
        debugJson, dbgOpen,
        resetCurrent,
        selectedRuleIdx, selectedDiscardIdx, selectedPaylineIdx,
        // v3.1:合併 09+10 為「規則」tab 用
        selectedKind, rulesListFilter, rulesAddMenuOpen,
        addRuleFromMenu,
        // ── #17 規則拖曳排序 ──
        rulesDragState, rulesAutoPriority,
        onRuleDragStart, onRuleDragOver, onRuleDragLeave, onRuleDrop, onRuleDragEnd,
        reelActiveMode, gridActiveMode, comboActiveModeBar,
      };
  };

  console.log('[config-editor/setup] loaded');

})();
