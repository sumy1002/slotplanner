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
    SUBREEL_KINDS, SUBREEL_KIND_MAP,
    makePanel, loadPanels, savePanels, normalizeMask, panelCellSet, loadSymbolSets, saveSymbolSets,
    makeJackpot, loadJackpots, saveJackpots,
    LS_MULTIPLIERS_KEY, defaultMultipliers, makeMultValue, loadMultipliers, saveMultipliers, parseLadder,
    makePayRow, migratePayRows,
    LS_REEL_STRIPS_KEY, defaultReelStrips, loadReelStrips, saveReelStrips,
    parseStripStr, stripToStr, stripToWeights, weightsToStrip,
    makeBonusItem,
    // v8.0:bonus 小遊戲已併入 mode 玩法種類(mode_kind);移除 LS_BONUS_GAMES_KEY/defaultBonusGames/
    //   makeBonusGame/loadBonusGames/saveBonusGames 匯入。makeBonusItem 保留(ModeConfig.items 用)。
    LS_COIN_VALUES_KEY, defaultCoinValues, makeCoinDenom, loadCoinValues, saveCoinValues,
    LS_BET_CONFIG_KEY, defaultBetConfig, makeBuyFeature, loadBetConfig, saveBetConfig,
    saveLayout, LS_BINS_KEY, DEFAULT_BINS, DEFAULT_BIN_EDGES,
    loadBins, saveBins, parseBinEdges, LS_PAYLINES_KEY,
    PAYLINE_DIRECTIONS, makePayline, DEFAULT_PAYLINES, loadPaylines,
    savePaylines, parsePathString, validatePayline, generatePaylinePoints, LS_CONSTRAINTS_KEY,
    CONSTRAINT_TYPES, makeConstraint, DEFAULT_CONSTRAINTS, loadConstraints,
    saveConstraints, LS_REELW_KEY, loadReelWeights, saveReelWeights,
    makeGenLimit, loadGenLimits, saveGenLimits, genLimitZones, genLimitZoneLabel, genLimitStatus, humanizeGenLimit,
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
      const active   = ref('rules');  // v7.10:01_Global 已併入規則頁;落地改規則頁(模式子分頁)
      const g        = reactive(loadGlobal());
      // v8.7 / R6 A-4:全域 additive 欄位正規化(DEFAULT_GLOBAL 在 helpers,不在 scope;此處補預設)。
      //   ways_both_dedup:雙向 WAYS 同組合僅計一次(規格描述)。01_Global 匯出走 Object.entries(g) 自動帶。
      if (g.ways_both_dedup == null) g.ways_both_dedup = true;
      // v8.20 / G 界-3:結構化最大贏分封頂(規格描述;與 disclosure.max_win 字串並存)。
      //   0=沿用字串(不另封頂)、-1=明示無上限、>0=硬封頂值(注額倍數)。缺欄(舊 LS)→ 0 安全降級。
      //   01_Global 匯出走 Object.entries(g) 自動帶 max_win_cap;Python 端 _parse_max_win_cap 同規則降級。
      if (g.max_win_cap == null) g.max_win_cap = 0;
      // v8.39 / GAP-F1+軌道:全域補盤軌道('' = 現行滾動/重力補盤)與主盤跨局位移宣告
      //   ('' / 0 = 主盤不滾動)。01_Global 匯出走 Object.entries(g) 自動帶;Python by-name 降級。
      if (g.refill_track == null) g.refill_track = '';
      if (g.scroll_track == null) g.scroll_track = '';
      if (g.scroll_step == null) g.scroll_step = 0;
      // v8.28 / 缺口C:跨來源倍數複合方式(規格描述;引擎不消費,交下游)。
      //   MUL=相乘(預設,向後相容)、ADD=相加、MAX=取最高。缺欄(舊 LS)→ MUL 安全降級。
      //   01_Global 匯出走 Object.entries(g) 自動帶 mult_compose;Python 端 _parse_global 同規則降級。
      if (g.mult_compose == null) g.mult_compose = 'MUL';

      // ──────────────────────────────────────────────────────────
      //  v5.0-b:主題單源化 — C12 重複實作已移除
      //  亮暗切換唯一入口在 app.js(sidebar 按鈕),寫 slotplanner.uiTheme.v1
      //  + document.documentElement.dataset.theme;本元件不再持有 themeMode。
      // ──────────────────────────────────────────────────────────

      // ──────────────────────────────────────────────────────────
      //  v3.4 / B6:範本載入 diff preview
      // ──────────────────────────────────────────────────────────
      const tplLoadPreviewOpen = ref(false);
      const tplLoadPreviewData = ref(null);    // { slug, name, description, counts, currentCounts, diff }
      function _computeCurrentCounts() {
        // 從 LS 直接讀(避免依賴 reactive 變數順序)。
        // L1 (R-P0):改為 per-key safe-parse。舊碼單一 try/catch 下,任一 key 的 JSON
        //   損毀(如 modes.v1)會讓其後所有計數一起歸零 → 範本 diff 顯示錯誤的當前值。
        //   逐鍵各自吞錯,一個髒 key 不牽連其他(實測:髒 modes 時 layout/paylines/symbols 仍正確)。
        const _arr = (k) => {
          try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; }
          catch (e) { return []; }
        };
        const _obj = (k) => {
          try { const v = JSON.parse(localStorage.getItem(k) || '{}'); return (v && typeof v === 'object') ? v : {}; }
          catch (e) { return {}; }
        };
        const reg = _obj('slotplanner.registry.v1');
        const bc  = _obj('slotplanner.aconfig.betconfig.v1');
        const cv  = _obj('slotplanner.aconfig.coinvalues.v1');
        return {
          modes:        _arr('slotplanner.aconfig.modes.v1').length,
          layout:       _arr('slotplanner.aconfig.layout.v1').length,
          paylines:     _arr('slotplanner.aconfig.paylines.v1').length,
          constraints:  _arr('slotplanner.aconfig.constraints.v1').length,
          rules:        _arr('slotplanner.aconfig.rules.v1').length,
          discards:     _arr('slotplanner.aconfig.discards.v1').length,
          symbols:      (reg && Array.isArray(reg.symbols)) ? reg.symbols.length : 0,
          jackpots:     _arr('slotplanner.aconfig.jackpots.v1').length,
          buy_features: Array.isArray(bc.buy_features) ? bc.buy_features.length : 0,
          coin_denoms:  Array.isArray(cv.denominations) ? cv.denominations.length : 0,
        };
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
      // v8.15 #4:HARD/SOFT 過濾 chips 退役(合併清單後以列表徽章呈現類別,不再提供過濾);
      //   rulesListFilter 狀態一併移除,關鍵字搜尋(v8.11)成為唯一過濾器。
      // v8.11/A-1:規則清單關鍵字搜尋(取代與子分頁重疊的「全部/拼圖」chips)
      const rulesListSearch = ref('');
      function ruleMatchesSearch(r) {
        const q = (rulesListSearch.value || '').toLowerCase();
        if (!q) return true;
        if (!r) return false;
        if ((r.rule_id || '').toLowerCase().includes(q)) return true;
        if ((r.description || '').toLowerCase().includes(q)) return true;
        if ((r.trigger || '').toLowerCase().includes(q)) return true;
        if (Array.isArray(r.actions) && r.actions.some(a => a && (a.atype || '').toLowerCase().includes(q))) return true;
        return false;
      }
      function discardMatchesSearch(d) {
        const q = (rulesListSearch.value || '').toLowerCase();
        if (!q) return true;
        if (!d) return false;
        return (d.discard_id || '').toLowerCase().includes(q)
            || (d.description || '').toLowerCase().includes(q)
            || (d.condition || '').toLowerCase().includes(q);
      }
      // v7.10:盤面規則 vs 通用規則分流(選項 A,依 action type 黑白判定)。
      //   規則只要含任一「盤面/符號幾何」action → 盤面規則;完全不含 → 通用規則。一條規則唯一歸屬。
      const BOARD_ACTION_TYPES = new Set([
        'BOARD_FILL', 'BOARD_TRANSFORM', 'BOARD_DESTROY', 'MOVE', 'SWAP', 'STICKY', 'LOCK_REEL',
        // v8.9.1 bug 修復:v8.4 新增七枚盤面/圖示 action 漏收 → 曾被錯分到「通用規則」
        //   子分頁(違反分流守則 #119 語義:盤面操作歸盤面)。
        'EXPAND_REEL', 'NUDGE', 'WALK', 'REVEAL_AS', 'SPLIT', 'DESTROY_ADJACENT', 'GROW_BOARD',
        // v8.29 / W-2:G1/v8.28 新增盤面幾何 action 漏收修復(同 v8.9.1 病灶)。
        //   SPAWN=幾何放置、COMPACT=盤面壓實、CONVERT=符號轉換(同 BOARD_TRANSFORM 語系,
        //   v8.21 起獨立 atype)。COLLECT/PAY/MULTIPLY_VALUE/REVIVE 為值/流程動作,維持通用。
        'SPAWN', 'COMPACT', 'CONVERT',
      ]);
      function isBoardRule(r) {
        if (!r || !Array.isArray(r.actions)) return false;
        return r.actions.some(a => a && BOARD_ACTION_TYPES.has(a.atype));
      }
      // 給目前子分頁(board/general)決定某 puzzle 規則是否顯示
      function ruleInSection(r) {
        if (rulesSection.value === 'board')   return isBoardRule(r);
        if (rulesSection.value === 'general') return !isBoardRule(r);
        return true;  // 其他情況(理論上不會,因 puzzle section 只在 board/general 顯示)
      }
      // v7.10:規則頁總入口四子分類(全域/模式/盤面圖示規則/通用規則)。純前端 UI 狀態,非持久化。
      //   'global' = 賠付模型 + 全域參數(原 01_Global) / 'modes' = 模式定義 + 關聯 Bonus(原 11/17)
      //   'board'  = 盤面/圖示相關 puzzle 規則 / 'general' = 通用 puzzle + 棄牌規則
      const rulesSection = ref('modes');  // 進規則頁預設停在「模式」(先定義模式的流程優先)
      function setRulesSection(s) { rulesSection.value = s; }
      // v7.10:規則母項在分頁列的子項展開狀態。
      //   預設行為:使用者目前在規則的某個子分頁時,每次「分頁列重新展開」(hover 浮出 / 釘選切換)
      //   母項自動呈展開。使用者手動收合則覆寫,直到下次「重新展開」事件才重置(收合態 hover);
      //   釘選態無自動重置事件,手動展開/收合持久,由使用者點母項控制。
      const rulesNavExpanded = ref(true);
      const rulesNavManual = ref(false);   // 使用者是否手動覆寫過(本次展開週期內)
      const isOnRules = () => active.value === 'rules';
      // 母項點擊:切到規則頁(預設模式子分頁)+ 切換子項展開(手動覆寫)
      function onRulesParentClick() {
        if (active.value !== 'rules') { active.value = 'rules'; rulesSection.value = 'modes'; }
        rulesNavExpanded.value = !rulesNavExpanded.value;
        rulesNavManual.value = true;        // 標記手動覆寫
      }
      // 點子項:切到規則頁對應子分頁
      function gotoRulesSub(section) {
        active.value = 'rules';
        rulesSection.value = section;
        // v7.10:棄牌子分頁 → 右側詳情切棄牌;盤面/通用 → 切拼圖
        if (section === 'discard') {
          selectedKind.value = 'discard';
        } else if (section === 'board' || section === 'general') {
          selectedKind.value = 'puzzle';
        }
        cfgTabRailCollapsed.value = true;   // 與其他 tab 點擊一致:行動版點完收抽屜
      }
      // 「分頁列重新展開」事件(收合態 hover 浮出 / 釘選切換):重置手動覆寫,回預設(在規則子分頁就展開)
      function onRailReopen() {
        rulesNavManual.value = false;
        rulesNavExpanded.value = isOnRules();
      }
      // v7.10:導覽相容墊片 — 舊程式碼會把 active 設成 'global'(01_Global 已併入規則頁)。
      //   一律改導向規則頁的「模式」子分頁(賠付橫幅 + 模式定義都在那)。其餘 tab 原樣通過。
      function navTo(tabId) {
        if (tabId === 'global') { active.value = 'rules'; rulesSection.value = 'modes'; return; }
        if (tabId === 'jackpots' || tabId === 'gamble') tabId = 'bet_config';   // 甲:已併入押注頁
        active.value = tabId;
      }
      // §2.1 peer 分段:規則（拼圖 DSL）｜中獎線｜產牌(中獎線僅 pay_type=LINE 顯示)
      const rulePeer = computed(() => {
        if (active.value === 'paylines') return 'lines';
        if (rulesSection.value === 'genlimits' || rulesSection.value === 'discard') return 'gen';
        return 'rules';
      });
      const rulePeerLineVisible = computed(() => (g.pay_type || '').toUpperCase() === 'LINE');
      function gotoPeer(p) {
        if (p === 'lines') { active.value = 'paylines'; return; }
        if (p === 'gen') { active.value = 'rules'; rulesSection.value = 'genlimits'; return; }
        active.value = 'rules';
        if (!['modes', 'board', 'general'].includes(rulesSection.value)) rulesSection.value = 'board';
      }
      // ── 權重頁 W1:peer 骨架(輪帶 / 分佈)。reel_weights 為 parent,其餘 3 分頁 hidden;
      //    active ∈ {reel_weights, reel_strips} → 輪帶;{grid_size_weights, distribution_bins} → 分佈 ──
      const weightPeer = computed(() => {
        if (active.value === 'grid_size_weights' || active.value === 'distribution_bins') return 'dist';
        return 'reels';   // reel_weights / reel_strips
      });
      function gotoWeightPeer(p) {
        if (p === 'dist') { active.value = 'grid_size_weights'; return; }
        active.value = 'reel_weights';   // 'reels'
      }
      // 新增按鈕的下拉選單開關
      const rulesAddMenuOpen = ref(false);
      // 合併列表(供左欄渲染),含 puzzle + discard,套用 filter
      // 注意:rules 已是 reactive array,modes 已是 reactive — selectedKind 是 ref,
      //       變動會自動觸發 recomputed(v8.15:rulesListFilter 已退役)
      function _selectItem(kind, idx) {
        selectedKind.value = kind;
        if (kind === 'puzzle') selectedRuleIdx.value = idx;
        else if (kind === 'discard') selectedDiscardIdx.value = idx;
      }
      // 從 add menu 觸發的新增動作
      function addRuleFromMenu(kind) {
        rulesAddMenuOpen.value = false;
        // v8.15 #3:新增改走彈窗流程(拼圖兩步 / 棄牌單步);
        //   舊 addRule / addDiscard 保留為程式後備(規則庫 preset 等路徑仍會用到 CRUD 基元)。
        // v8.15 批2:棄牌 HARD/SOFT 合併為單一入口(彈窗內選類型);新增「產牌限制」入口。
        if (kind === 'puzzle') openRuleDlg('puzzle');
        else if (kind === 'discard') openRuleDlg('discard', 'HARD');
        else if (kind === 'genlimit') {
          gotoRulesSub('genlimits');
          addGenLimit();
          glSelectedIdx.value = genLimits.length - 1;
        }
      }
      // 點擊文件其他地方時關閉 add menu
      function _onDocClickForRulesAddMenu(e) {
        if (!rulesAddMenuOpen.value) return;
        const host = e.target.closest && e.target.closest('.cfg-rules-add-host');
        if (!host) rulesAddMenuOpen.value = false;
      }

      // ══════════════════════════════════════════════════════
      //  v8.15:規則頁大改版
      //    #1 動態標題(跟隨子分頁)
      //    #2 三群合併清單(盤面/通用/棄牌恆列;當前群置頂;跨群點擊自動切子分頁)
      //    #5 清單第二行改「模式 · 觸發點」
      //    #6 方案 C:條件列膠囊化(pill;點擊原地展開編輯)+ 動作卡收合
      //    #3 兩步彈窗(拼圖)/ 單步彈窗(棄牌)
      //  注意:僅 UI 層;A.xlsx 契約 / DSL / 引擎零變更。
      // ══════════════════════════════════════════════════════

      // #1:拼圖/棄牌共用區的動態標題
      const RULES_SECTION_META = {
        board:   { icon: '🎰', label: '盤面 / 圖示規則' },
        general: { icon: '🧩', label: '通用規則' },
        discard: { icon: '🗑', label: '棄牌規則' },
      };
      const rulesSectionMeta = computed(() =>
        RULES_SECTION_META[rulesSection.value] || RULES_SECTION_META.general);

      // #5:觸發點短標籤(去 emoji 前綴,給清單第二行 / 彈窗唯讀行)
      function triggerShortLabel(t) {
        const meta = TRIGGER_BY_TYPE[t];
        if (!meta) return t || '–';
        return meta.label.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]+\s*/u, '').trim();
      }
      // #5:拼圖清單第二行 = 模式 · 觸發點(取代舊「trigger · atype」技術字串)
      function ruleListSub(r) {
        if (!r) return '';
        const scope = (r.mode_scope && r.mode_scope !== 'ALL') ? r.mode_scope : '全部模式';
        return `${scope} · ${triggerShortLabel(r.trigger)}`;
      }
      // #5:棄牌清單第二行 = 模式(HARD/SOFT 已有徽章)
      function discardListSub(d) {
        if (!d) return '';
        return (d.mode_scope && d.mode_scope !== 'ALL') ? d.mode_scope : '全部模式';
      }

      // #2:三群合併清單(套用 v8.11 關鍵字搜尋;固定基準序 盤面→通用→棄牌,當前群搬到最前)
      const rulesListGroups = computed(() => {
        const boardItems   = [];
        const generalItems = [];
        rules.forEach((r, idx) => {
          if (!ruleMatchesSearch(r)) return;
          (isBoardRule(r) ? boardItems : generalItems).push({ obj: r, idx });
        });
        const discardItems = [];
        discards.forEach((d, idx) => {
          if (!discardMatchesSearch(d)) return;
          discardItems.push({ obj: d, idx });
        });
        // v8.15 批2:棄牌群內 HARD 置前(穩定排序;同類維持原順序)
        discardItems.sort((a, b) =>
          (a.obj.discard_kind === 'HARD' ? 0 : 1) - (b.obj.discard_kind === 'HARD' ? 0 : 1));
        // v8.15 批2 #F:產牌限制併入清單(第四群;點擊跳 genlimits 子分頁並選中該列)
        const genItems = [];
        genLimits.forEach((gl, idx) => {
          if (!genLimitMatchesSearch(gl)) return;
          genItems.push({ obj: gl, idx });
        });
        const groups = [
          { key: 'board',     kind: 'puzzle',   icon: '🎰', label: '盤面 / 圖示規則', items: boardItems },
          { key: 'general',   kind: 'puzzle',   icon: '🧩', label: '通用規則',        items: generalItems },
          { key: 'genlimits', kind: 'genlimit', icon: '🎲', label: '產牌限制',        items: genItems },
        ];   // §4.10a:棄牌群已抽離為專屬清單(不再併入 roster)
        const cur = rulesSection.value;
        return groups.filter(g => g.key === cur).concat(groups.filter(g => g.key !== cur));
      });
      // #2:點清單項 → 跨群自動切子分頁 + 選中該項(清單隨之以該群置頂重排)
      function selectRuleFromList(groupKey, kind, idx) {
        if (rulesSection.value !== groupKey) rulesSection.value = groupKey;
        _selectItem(kind, idx);
      }

      // #6:膠囊條件列展開狀態(scope = 'rule:<rid>' / discardCond.key(rec);dlg 內恆展開不經此表)
      const condRowOpen = reactive({});
      function condRowKey(scope, ri) { return `${scope}::${ri}`; }
      function isCondRowOpen(scope, ri) { return !!condRowOpen[condRowKey(scope, ri)]; }
      function toggleCondRow(scope, ri) {
        const k = condRowKey(scope, ri);
        condRowOpen[k] = !condRowOpen[k];
      }
      function openCondRow(scope, ri) { condRowOpen[condRowKey(scope, ri)] = true; }

      // #6:新增條件列的 UI 包裝 — 新列自動展開編輯。
      //   順帶修復:舊 template 在編輯區引用了不存在的 idx / r(v-for 重構殘留),
      //   造成「+ AND / + OR / 新增第一片條件」與「拼圖↔原始」切換按鈕 TypeError(errata 記錄)。
      function addBuilderRowUI(combinator = 'AND') {
        const r = rules[selectedRuleIdx.value];
        if (!r || !r.rule_id) return;
        addBuilderRow(selectedRuleIdx.value, combinator);
        const rows = builderRowsMap[r.rule_id] || [];
        openCondRow('rule:' + r.rule_id, rows.length - 1);
      }
      function discardAddRowUI(rec, combinator = 'AND') {
        if (!rec) return;
        discardCond.addRow(rec, combinator);
        const rows = condBuilderState.rows[discardCond.key(rec)] || [];
        openCondRow(discardCond.key(rec), rows.length - 1);
      }
      // #6:動作卡收合(預設收合成一行白話;未選型的空動作恆展開,避免無法選型)
      const actionOpenMap = reactive({});
      function actionOpenKey(rid, ai) { return `${rid}::${ai}`; }
      function isActionOpen(rid, ai, act) {
        if (act && !act.atype) return true;
        return !!actionOpenMap[actionOpenKey(rid, ai)];
      }
      function toggleActionOpen(rid, ai) {
        const k = actionOpenKey(rid, ai);
        actionOpenMap[k] = !actionOpenMap[k];
      }
      function addActionUI(atype = '') {
        const i = selectedRuleIdx.value;
        const r = rules[i];
        if (!r) return;
        addAction(i, atype);
        actionOpenMap[actionOpenKey(r.rule_id, (r.actions || []).length - 1)] = true;
      }

      // ── #3:新增規則彈窗 ──
      //   拼圖 = 兩步(基本設定 → 動作事件);棄牌 = 單步。
      //   欄位對映(v8.15 定調,errata 詳述):
      //     條件名稱 → rule_id / discard_id(唯一鍵;撞名防呆,不分大小寫)
      //     事件名稱 → description(防呆:不得與條件名稱相同、不得與其他規則描述完全一樣)
      //   套用模式(v8.16 落地複選):單選折疊為「mode == X AND (…)」;複選折疊為
      //     「mode in [A, B] AND (…)」— condition_parser 既有 IN + 清單文法,引擎零改動。
      const ruleDlg = reactive({
        open: false, step: 1, kind: 'puzzle',
        name: '', mode: 'ALL', trigger: 'ON_GRID_GENERATED', rows: [],
        hardness: 'HARD',
        eventName: '', action: { atype: '', params: {} }, _origin: '',
      });
      function openRuleDlg(kind, hardness) {
        ruleDlg.open = true;
        ruleDlg.step = 1;
        ruleDlg.kind = kind || 'puzzle';
        ruleDlg.name = '';
        ruleDlg.mode = 'ALL';
        ruleDlg.trigger = 'ON_GRID_GENERATED';
        ruleDlg.rows = [];
        ruleDlg.hardness = hardness || 'HARD';
        ruleDlg.eventName = '';
        ruleDlg.action = { atype: '', params: {} };
        ruleDlg._origin = '';
        Vue.nextTick(() => {
          try { document.querySelector('.cfg-ruledlg-name')?.focus(); } catch (e) { /* no-op */ }
        });
      }
      const ruleDlgNameTaken = computed(() => {
        const n = ruleDlg.name.trim().toUpperCase();
        if (!n) return false;
        if (ruleDlg.kind === 'discard') {
          return discards.some(d => (d.discard_id || '').trim().toUpperCase() === n);
        }
        return rules.some(r => (r.rule_id || '').trim().toUpperCase() === n);
      });
      const ruleDlgEventClash = computed(() => {
        const n = ruleDlg.eventName.trim();
        if (!n) return '';
        if (n.toUpperCase() === ruleDlg.name.trim().toUpperCase()) return '事件名稱不能與條件名稱完全一樣';
        if (rules.some(r => (r.description || '').trim() === n)) return '已有其他規則使用一模一樣的事件名稱';
        return '';
      });
      // 彈窗內條件列操作(直接對 ruleDlg.rows;確認時才 buildCondition 落字串)
      function dlgAddRow(combinator = 'AND') {
        ruleDlg.rows.push({ category: 'symbol_count', subkey: '', op: '>=', value: '0', combinator });
      }
      function dlgRemoveRow(i) { ruleDlg.rows.splice(i, 1); }
      function dlgChangeCat(i, cat) {
        const row = ruleDlg.rows[i];
        if (!row) return;
        row.category = cat;
        const meta = VAR_CATEGORY_MAP[cat];
        if (!meta || !meta.needsSubkey) row.subkey = '';
      }
      // 第二步唯讀口語化:「(符號)數量 ≥ 3 觸發」
      const ruleDlgCondHuman = computed(() => {
        if (!ruleDlg.rows.length) return '(無條件,觸發點發生即執行)';
        let out = '';
        ruleDlg.rows.forEach((r, i) => {
          const seg = humanizeCondRow(r);
          if (i === 0) out = seg;
          else out += ((r.combinator || 'AND').toUpperCase() === 'OR' ? ',或 ' : ',且 ') + seg;
        });
        return out + ' 觸發';
      });
      function dlgChangeActionType(v) {
        ruleDlg.action = (typeof makeAction === 'function' && v) ? makeAction(v) : { atype: v || '', params: {} };
      }
      function dlgStepNext() {
        if (!ruleDlg.name.trim() || ruleDlgNameTaken.value) return;
        ruleDlg.step = 2;
      }
      function confirmRuleDlg() {
        const name = ruleDlg.name.trim();
        if (!name || ruleDlgNameTaken.value) return;
        if (ruleDlg.kind === 'discard') {
          const d = makeDiscard(name);
          d.discard_kind = ruleDlg.hardness;
          d.mode_scope = ruleDlg.mode || 'ALL';
          d.condition = buildCondition(ruleDlg.rows);
          discards.push(d);
          const dk = discardCond.key(d);
          condBuilderState.rows[dk] = ruleDlg.rows.map(x => ({ ...x }));
          condBuilderState.mode[dk] = 'builder';
          condBuilderState.error[dk] = null;
          selectedKind.value = 'discard';
          selectedDiscardIdx.value = discards.length - 1;
          rulesSection.value = 'discard';
          ruleDlg.open = false;
          emit('status', { type: 'ok', msg: `已建立棄牌規則 ${name}` });
          return;
        }
        if (ruleDlgEventClash.value) return;
        const r = makeRule(name);
        if (ruleDlg._origin) r.origin = ruleDlg._origin;   // ③d-2/甲:來源徽章(icon/size)
        r.mode_scope = ruleDlg.mode || 'ALL';
        r.trigger = ruleDlg.trigger;
        r.condition = buildCondition(ruleDlg.rows);
        r.description = ruleDlg.eventName.trim();
        r.actions = ruleDlg.action.atype
          ? [{ atype: ruleDlg.action.atype, params: { ...(ruleDlg.action.params || {}) } }]
          : [];
        rules.push(r);
        builderRowsMap[name] = ruleDlg.rows.map(x => ({ ...x }));
        ruleEditMode[name] = 'builder';
        ruleParseError[name] = null;
        selectedKind.value = 'puzzle';
        selectedRuleIdx.value = rules.length - 1;
        // 依 action 自動分流(守則 #119),跳到所屬子分頁確保可見
        rulesSection.value = isBoardRule(r) ? 'board' : 'general';
        ruleDlg.open = false;
        emit('status', { type: 'ok', msg: `已建立規則「${name}」(歸入「${isBoardRule(r) ? '盤面/圖示' : '通用'}規則」)` });
      }

      // ══ v8.15 批2 ══
      // #B:AND/OR 語義規範(定調)— 單一真相 = condition_parser 優先序:且(AND)綁得比 或(OR)緊。
      //   扁平混用即 DNF:「a AND b OR c AND d」≡「(a 且 b)或(c 且 d)」。
      //   UI 以 OR 為斷點把條件列切成「觸發組」:組內全部必要(且),任一組整組成立即觸發(或)。
      //   注意:數量遞增給不同獎勵(3/4/5 SCAT 給不同局數)不是條件 OR — 條件只需「≥ 3」,
      //   局數差異走模式的觸發給付(trigger_pays)或多條規則。此提示同步放在 UI hint。
      function condRowGroups(rows) {
        const groups = [];
        let cur = [];
        (rows || []).forEach((row, ri) => {
          if (ri > 0 && String(row.combinator || 'AND').toUpperCase() === 'OR' && cur.length) {
            groups.push(cur);
            cur = [];
          }
          cur.push({ row, ri });
        });
        if (cur.length) groups.push(cur);
        return groups;
      }
      // 組間「或」分隔點擊 → 把該組首列改回 AND(併回前一組);組內「且」點擊 → 改 OR(拆出新組)
      //   兩者都只是改 row.combinator + rebuild,底層資料/DSL 生成零變更。

      // #C:選單中文化(純顯示層;儲存值 / DSL 不變)
      const OP_ZH = {
        '==': '等於', '!=': '不等於', '>': '大於', '>=': '大於等於',
        '<': '小於', '<=': '小於等於', in: '屬於清單', not_in: '不屬於清單', contains: '包含',
      };
      function opLabel(o) { return OP_ZH[o] ? `${OP_ZH[o]}(${o})` : o; }
      function varCatLabel(id) {
        const m = VAR_HUMAN[id];
        return m ? `${m.label}(${id})` : id;
      }
      const ENUM_OPT_ZH = { add: '加上', sub: '減去', mul: '乘以', set: '設為' };
      function enumOptLabel(v) { return ENUM_OPT_ZH[v] ? `${ENUM_OPT_ZH[v]} ${v}` : v; }

      // ──────────────────────────────────────────────────────
      //  v8.22 / G3:獎項角色 Item_Role(Hold&Win 設定面;setup-local 顯示詞彙)
      //  英文 key 為唯一真相(寫進 11c_Mode_Items Item_Role 欄);純描述,引擎不消費。
      //  makeBonusItem 在 helpers 凍結,item_role 於 addModeItem/normalize 補預設。
      const MODE_ITEM_ROLES = [
        { key: '',           zh: '（未指定）' },
        { key: 'COIN',       zh: '金幣值' },
        { key: 'COLLECTOR',  zh: '收集器' },
        { key: 'MULTIPLIER', zh: '倍數' },
        { key: 'BOOST',      zh: '增益' },
        { key: 'JACKPOT',    zh: '彩池' },
        // v8.45 / 批次D GAP-C1:進場前玩家擇一(非隨機,Item_Weight 不適用;
        //   Item_Value=選項參數、Item_Link_Mode=選後進入的模式。與模式級 choice_group
        //   正交:選項是完整模式 → choice_group;選項是參數組/揀選面 → 本角色)
        { key: 'PLAYER_CHOICE', zh: '玩家選項' },
      ];
      const _ITEM_ROLE_ZH = Object.fromEntries(MODE_ITEM_ROLES.map(r => [r.key, r.zh]));
      function itemRoleLabel(v) {
        const s = String(v == null ? '' : v).trim().toUpperCase();
        return _ITEM_ROLE_ZH[s] != null ? _ITEM_ROLE_ZH[s] : s;   // 未知 → 原樣(寬鬆,安全降級)
      }

      // ──────────────────────────────────────────────────────
      //  v8.20 / G5 界-1:範圍謂詞 scope(動作/事件的空間範圍修飾子)
      //  ★設計決策(選項 3,機主 2026 拍板)★:scope 是「動作層修飾子」,
      //   本質不是條件變數,故不進 helpers.js 的 VAR_CATEGORIES(鐵律 #1:
      //   helpers byte-perfect 不動)。以 setup-local 常數持有,純供:
      //     (a) 前端動作 params 的 scope 下拉顯示中文
      //     (b) humanize 白話膠囊
      //     (c) docgen 描述(docgen 為獨立 IIFE,持有各自唯讀 label map)
      //   英文 key(enum 值)為唯一真相,寫進動作 params 的 scope key(KEY=VAL DSL
      //   既有格式,零 schema 變更);引擎不消費,值/命中率交下游模擬工具。
      //   range(n..m) / random_cells(n) 為帶參數謂詞:value 直接存字串,label 動態組。
      const SCOPE_CATALOG = [
        { key: 'all_visible',  zh: '全部可見格',   desc: '盤面上所有可見活格(不含洞格/遮罩外)' },
        { key: 'adjacent_8',   zh: '八方相鄰',     desc: '目標格的上下左右 + 四斜角(8 鄰)' },
        { key: 'adjacent_4',   zh: '四方相鄰',     desc: '目標格的上下左右正交 4 鄰(不含斜角)' },
        { key: 'same_column',  zh: '同一直行',     desc: '與目標格同一 reel(直行)的所有格' },
        { key: 'same_row',     zh: '同一橫列',     desc: '與目標格同一 row(橫列)的所有格' },
        { key: 'column_above', zh: '同行上方',     desc: '同一直行中位於目標格上方的所有格(落下型機制常用)' },
        { key: 'edge',         zh: '邊緣格',       desc: '盤面最外圈(首末 reel / 首末 row)的所有格' },
        { key: 'range',        zh: '範圍區間',     desc: '指定線性索引區間 range(n..m);n/m 由參數填', hasParam: true, paramHint: 'n..m(如 3..8)' },
        { key: 'random_cells', zh: '隨機取格',     desc: '隨機挑選 N 格 random_cells(n);N 由參數填', hasParam: true, paramHint: 'N(格數,如 5)' },
      ];
      const SCOPE_BY_KEY = Object.fromEntries(SCOPE_CATALOG.map(s => [s.key, s]));
      // scope 顯示中文:支援帶參數 range(3..8) / random_cells(5) → 拆 base 與參數
      function scopeLabel(raw) {
        const s = String(raw == null ? '' : raw).trim();
        if (!s) return '';
        const m = s.match(/^(\w+)\s*\((.*)\)\s*$/);
        const base = m ? m[1] : s;
        const arg = m ? m[2].trim() : '';
        const meta = SCOPE_BY_KEY[base];
        if (!meta) return s;   // 未知 → 原樣(安全降級)
        if (meta.hasParam && arg) return `${meta.zh}（${arg}）`;
        return meta.zh;
      }
      // v8.20 / G5:symbol_count.<SID> 當「動態值」餵給乘數(A-11 另一半)。
      //   純描述:值欄若填 symbol_count.<SID> 形式,humanize 譯成「<SID> 的盤面數量」。
      //   非此形式一律原樣回傳;引擎不消費,值語意交下游。
      function dynValueLabel(v) {
        const s = String(v == null ? '' : v).trim();
        let m = s.match(/^symbol_count\.([A-Za-z0-9_]+)$/);
        if (m) return `「${m[1]}」的盤面數量`;
        // v8.21 / G1:值變數當動態值
        m = s.match(/^symbol_value\.([A-Za-z0-9_]+)$/);
        if (m) return `「${m[1]}」的攜帶值`;
        m = s.match(/^cell_value\.([0-9]+,[0-9]+)$/);
        if (m) return `格(${m[1]})的值`;
        if (s === 'feature_value_total') return '本 feature 累計值';
        if (s === 'respins_left') return '剩餘回合數';
        return s;
      }
      // v8.20 / G5:動作 scope 存取器(scope 存在 act.params.scope,值為 base 或 base(arg))。
      //   template 用 scopeBaseOf/scopeArgOf 拆顯示,setScope 合成寫回;無參數謂詞省略括號。
      function scopeBaseOf(act) {
        const s = String((act && act.params && act.params.scope) || '').trim();
        if (!s) return '';
        const m = s.match(/^(\w+)\s*\(.*\)\s*$/);
        return m ? m[1] : s;
      }
      function scopeArgOf(act) {
        const s = String((act && act.params && act.params.scope) || '').trim();
        const m = s.match(/^\w+\s*\((.*)\)\s*$/);
        return m ? m[1].trim() : '';
      }
      function setScope(act, base, arg) {
        if (!act) return;
        if (!act.params || typeof act.params !== 'object') act.params = {};
        const b = String(base || '').trim();
        if (!b) { delete act.params.scope; return; }   // 清空 → 移除 scope(等同全盤,不落痕)
        const meta = SCOPE_BY_KEY[b];
        const a = String(arg == null ? '' : arg).trim();
        act.params.scope = (meta && meta.hasParam && a) ? `${b}(${a})` : b;
      }

      // #F:產牌限制併入合併清單 — 搜尋比對 + 點擊跳頁選中
      const glSelectedIdx = ref(-1);
      function genLimitMatchesSearch(gl) {
        const q = (rulesListSearch.value || '').toLowerCase();
        if (!q) return true;
        if (!gl) return false;
        return (gl.limit_id || '').toLowerCase().includes(q)
            || (gl.symbol_id || '').toLowerCase().includes(q)
            || String(gl.zone || '').toLowerCase().includes(q)
            || (gl.notes || '').toLowerCase().includes(q);
      }
      function genListSub(gl) { return humanizeGenLimit(gl); }
      function selectGenLimitFromList(idx) {
        glSelectedIdx.value = idx;
        gotoRulesSub('genlimits');
        Vue.nextTick(() => {
          try {
            const rows = document.querySelectorAll('.cfg-genlimits-table tbody tr');
            const tr = rows[idx];
            if (tr) tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } catch (e) { /* no-op */ }
        });
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
        // v8.15 批2 #C:補齊 v8.4 / v8.9 變數的中文(pill 白話與下拉中文化共用)
        win:                    { label: '本局贏分' },
        prev_win:               { label: '前局贏分' },
        rand:                   { label: '隨機值(0–1)' },
        reel_height:            { label: '輪高', needsSubkey: true, subkeyPrefix: '第' },
        adjacent_count:         { label: '相鄰計數', needsSubkey: true, subkeyPrefix: '' },
        cluster_max:            { label: '連通群大小', needsSubkey: true, subkeyPrefix: '' },
        board_symbol_total:     { label: '盤面符號總數' },
        board_var:              { label: '盤面狀態變數', needsSubkey: true, subkeyPrefix: '' },   // G-2 D4乙
        // v8.26 批7:補齊仍顯示英文的變數中文(只改顯示,英文 key/契約不動)
        //   rightmost_reel_in_win 為既有漏補;其餘四個為批次 2 / G1 價值引擎新增變數。
        rightmost_reel_in_win:  { label: '中獎最右輪' },
        symbol_value:           { label: '符號攜帶值', needsSubkey: true, subkeyPrefix: '' },
        cell_value:             { label: '格子值', needsSubkey: true, subkeyPrefix: '' },
        respins_left:           { label: '剩餘 respin 局數' },
        feature_value_total:    { label: '特色累計值' },
        // v8.37 / GAP-F2 + 🟢-4/🟢-5
        object_pos:             { label: '物件座標', needsSubkey: true, subkeyPrefix: '' },
        reel_count:             { label: '當前輪數' },
        symbol_ways:            { label: '符號 ways 數', needsSubkey: true, subkeyPrefix: '' },
        cluster_shape:          { label: '形狀群數', needsSubkey: true, subkeyPrefix: '' },   // v8.40 🟢-3
        // v8.41 / 批次A:WinEvent 屬性族(GAP-V1/V3/V4)
        win_symbols:            { label: '本筆中獎顆數' },
        win_contains:           { label: '本筆中獎含符', needsSubkey: true, subkeyPrefix: '' },
        destroyed_count:        { label: '本筆銷毀顆數' },
        // v8.45 / 批次D 組一
        track_covered:          { label: '軌道全覆蓋', needsSubkey: true, subkeyPrefix: '' },
        reel_stack_count:       { label: '單輪疊數', needsSubkey: true, subkeyPrefix: '' },
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

      // v8.15 #6:單列條件 → 白話片段(膠囊 pill 顯示用;humanizeCondition 共用單一真相)
      function humanizeCondRow(r) {
        if (!r) return '';
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
        return `${varDesc} ${op} ${val}`;
      }

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
          const seg = humanizeCondRow(r);   // v8.15 #6:與膠囊 pill 共用同一片段真相
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
        // v8.20 / G5:通用 scope 後綴 —— 任何動作若帶 scope param,一律附「範圍:…」白話。
        //   scope 是動作層修飾子(不進 VAR_CATEGORIES);此處統一在 base 描述後綴。
        const scopeSuffix = () => {
          const sl = scopeLabel(p.scope);
          return sl ? `（範圍：${sl}）` : '';
        };
        // v8.20 / G5:value param 若為 symbol_count.<SID> 動態值 → 譯白話;否則原樣。
        const vLabel = (raw) => dynValueLabel(raw ?? '?');
        let base;
        switch (action.atype) {
          case 'ADJUST_MULTIPLIER': {
            const op = { add: '加上', sub: '減去', mul: '乘以', set: '設為' }[p.op] || p.op || '?';
            base = `將當前倍數 ${op} ${vLabel(p.value)}`;
            break;
          }
          case 'UPDATE_GLOBAL': {
            const op = { add: '加上', sub: '減去', mul: '乘以', set: '設為' }[p.op] || p.op || '?';
            base = `全域變數 ${p.var || '?'} ${op} ${vLabel(p.value)}`;
            break;
          }
          case 'UPDATE_LOCAL': {
            const op = { add: '加上', sub: '減去', mul: '乘以', set: '設為' }[p.op] || p.op || '?';
            base = `本局變數 ${p.var || '?'} ${op} ${vLabel(p.value)}`;
            break;
          }
          case 'EMIT_EVENT':
            base = `廣播事件「${p.name || '?'}」` + (p.payload ? `(附資料)` : '');
            break;
          case 'SWITCH_MODE':
            base = `切換到「${p.target || '?'}」模式` + (p.inherit_globals ? '(繼承 globals)' : '');
            break;
          case 'AWARD_FREE_SPIN':
            base = `給 ${p.count ?? '?'} 局免費 spin` + (p.mode ? `(${p.mode} 模式)` : '');
            break;
          case 'HALT_RESOLUTION':
            base = '立即中斷本 trigger 後續所有規則';
            break;
          case 'BOARD_FILL':
            base = `在盤面填補「${p.symbol_id || '?'}」` + (p.positions ? `到 ${p.positions}` : '到所有空格');
            break;
          case 'BOARD_TRANSFORM':
            base = `把盤面上的「${p.from_symbol || '?'}」全部轉成「${p.to_symbol || '?'}」`;
            break;
          case 'BOARD_DESTROY':
            base = p.symbol_id ? `銷毀盤面上所有「${p.symbol_id}」` : `銷毀位置 ${p.positions || '?'}`;
            break;
          case 'MOVE':
            base = `把 ${p.from || '?'} 的符號移到 ${p.to || '?'}`;
            break;
          case 'SWAP':
            base = `交換 ${p.a || '?'} 與 ${p.b || '?'} 的符號`;
            break;
          case 'STICKY':
            base = `黏著 ${p.positions || '所有中獎符號'} ${p.duration ?? '?'} 局`;
            break;
          case 'LOCK_REEL':
            base = `鎖定 reel ${p.reel ?? '?'} 不重抽,持續 ${p.duration ?? '?'} 局`;
            break;
          // ── v8.21 / G1 價值引擎:值動作(六枚) ──
          case 'COLLECT':
            base = `把${p.source ? `「${p.source}」的值` : '盤面上的值'}收集到「${p.target || '?'}」`;
            break;
          case 'PAY':
            base = `直接派彩 ${vLabel(p.value)}` + (p.source ? `(依 ${p.source})` : '');
            break;
          case 'MULTIPLY_VALUE':
            base = `把${p.target ? `「${p.target}」` : '範圍內的值'}乘以 ${vLabel(p.factor)}`;
            break;
          case 'REVIVE':
            base = `回補 ${p.respins ?? '?'} 次回合` + (p.trigger ? `(觸發:${p.trigger})` : '');
            break;
          case 'COMPACT': {
            const dir = { DOWN: '向下', UP: '向上', LEFT: '向左', RIGHT: '向右' }[p.direction] || p.direction || '?';
            base = `盤面${dir}壓實(消除空隙、值格聚攏)`;
            break;
          }
          case 'CONVERT':
            base = `把「${p.from || '?'}」轉換成「${p.to || '?'}」` + (p.by_value === 'Y' ? '(依攜帶值決定結果)' : '');
            break;
          case 'END_FEATURE':
            base = (p.when || '').trim() ? `當「${p.when}」時結束當前 feature` : '結束當前 feature';
            break;
          // ── v8.29 / W-3:v8.28 缺口A 兩枚白話補齊(先前落 default 只顯示 label) ──
          case 'SPAWN':
            base = `新一局於格(${p.cell || '?'})放置「${p.target || '?'}」(初始位置)`;
            break;
          case 'WALK': {
            const dir = { UP: '向上', DOWN: '向下', LEFT: '向左', RIGHT: '向右', PATH: '依自訂路徑' }[String(p.dir || '').toUpperCase()] || '';
            const per = { SPIN: '僅本局', CHAIN: '跨連鎖存續', FEATURE: '存續至 feature 結束' }[String(p.persist || '').toUpperCase()] || '';
            base = `「${p.symbol || '?'}」每次${dir ? dir : ''}走 ${p.steps ?? 1} 步` + (per ? `(${per})` : '');
            break;
          }
          default:
            base = fb;
        }
        return base + scopeSuffix();
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
        // v8.21 / G1:persistent 規則層修飾子 → 前綴標記(每回合重跑)
        const persist = rule.persistent ? '〔每回合重跑〕' : '';
        if (condStr === null) {
          return `${persist}當 ${trigLabel} 時${scope},則 ${actDesc}`;
        }
        if (condStr === '(無條件,直接觸發)') {
          return `${persist}當 ${trigLabel} 時${scope},則 ${actDesc}`;
        }
        return `${persist}當 ${trigLabel} 時${scope},若 ${condStr},則 ${actDesc}`;
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
        // v8.15 #2:同步子分頁到副本的分類歸屬(合併清單置頂群 = 所在群)
        if (rulesSection.value === 'board' || rulesSection.value === 'general') {
          rulesSection.value = isBoardRule(copy) ? 'board' : 'general';
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
        rulesSection.value = 'discard';   // v8.15 #2:合併清單下確保置頂群一致
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
          // v4.8:副盤權重一併入快照,undo/redo 不會丟副輪/panel 編輯
          sub_weights: e.sub_weights ? JSON.parse(JSON.stringify(e.sub_weights)) : {},
          panel_weights: e.panel_weights ? JSON.parse(JSON.stringify(e.panel_weights)) : {},
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
          // v4.8:副盤權重一併還原(舊快照無此欄位時保持現狀)
          if (snap.sub_weights)   e.sub_weights   = JSON.parse(JSON.stringify(snap.sub_weights));
          if (snap.panel_weights) e.panel_weights = JSON.parse(JSON.stringify(snap.panel_weights));
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
          // v4.8:副盤權重一併還原(舊快照無此欄位時保持現狀)
          if (snap.sub_weights)   e.sub_weights   = JSON.parse(JSON.stringify(snap.sub_weights));
          if (snap.panel_weights) e.panel_weights = JSON.parse(JSON.stringify(snap.panel_weights));
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
      // v7.10:additive 欄位正規化(makeMode/loadModes 在 helpers,不在 scope;此處補預設,
      //   舊資料載入即為預設,向後相容)。reset_scope:'' = 繼承全域;trigger_pays:[] = 無。
      function _ensureModeGameplayFields(m) {
        if (m.reset_scope == null) m.reset_scope = '';     // '' | 'CASCADE' | 'SPIN' | 'FEATURE' | 'NEVER'
        if (!Array.isArray(m.trigger_pays)) m.trigger_pays = [];
        // v7.11:additive 封頂 + mode 層 stack_mode(makeMode/loadModes 在 helpers,不在 scope;
        //   此處補預設,舊資料載入即預設,向後相容)。
        if (m.cap_enabled == null) m.cap_enabled = '';     // '' = 不封頂 | 'Y' = 有封頂
        if (m.cap_value == null) m.cap_value = '';         // 封頂值(字串,可含區間)
        if (m.stack_mode == null) m.stack_mode = '';       // '' = 繼承全域 | 'MUL' | 'ADD'
        // v7.14:additive 玩法種類 + bonus 小遊戲欄位(makeMode 在 helpers,不在 scope;此處補預設)。
        //   空值才預設 SPIN；已是 OTHER／WHEEL 等不覆寫。
        if (m.mode_kind == null || m.mode_kind === '') m.mode_kind = 'SPIN';  // SPIN/WHEEL/PICK/COLLECTION/OTHER
        if (m.wheel_upgrade_to == null) m.wheel_upgrade_to = '';
        if (m.pick_count == null) m.pick_count = 0;
        if (m.collect_target == null) m.collect_target = 0;
        if (!Array.isArray(m.items)) m.items = [];         // 獎項表(mode_kind != SPIN)
        // v8.5 / R3:玩家擇一組 + Hold&Win respin 描述(additive;引擎不消費)
        if (m.choice_group == null) m.choice_group = '';
        if (m.respin_base == null) m.respin_base = 0;
        if (m.respin_reset_on == null) m.respin_reset_on = '';   // '' | NEW_SYMBOL | ANY_WIN | NEVER
        if (m.respin_stop_cond == null) m.respin_stop_cond = '';
        // v8.7 / R6 A-2:per-mode 賠付模型覆寫('' = 繼承全域)
        if (m.pay_type_override == null) m.pay_type_override = '';
        // v8.22 / G3 Hold&Win 設定面(additive;makeMode 在 helpers 凍結,此處補預設)
        if (m.collect_enabled == null) m.collect_enabled = false;          // 是否收集型
        if (m.respin_reset_symbol == null) m.respin_reset_symbol = '';     // 落哪種符號重置 respin
        if (m.grid_expand_in_collect == null) m.grid_expand_in_collect = false;  // 收集中盤面擴張
        if (m.allow_persistent == null) m.allow_persistent = false;        // 允許 persistent 規則
        // v8.24 / G5 生存結束:結構化結束謂詞(additive;與 respin_stop_cond 並存)
        if (m.end_condition == null) m.end_condition = '';
        // v8.28 / 缺口B:解鎖前提(模式名清單;[] = 無前提)。additive;makeMode 在 helpers 凍結。
        if (!Array.isArray(m.unlock_requires)) m.unlock_requires = [];
        // v8.28 / 缺口C:此模式的倍數複合覆寫('' = 沿用全域 mult_compose)。
        if (m.mult_compose_override == null) m.mult_compose_override = '';
        // v8.39 / GAP-F1:此模式的補盤軌道覆寫('' = 沿用全域 refill_track)。makeMode 在 helpers 凍結。
        if (m.refill_track_override == null) m.refill_track_override = '';
        // §5.2 Stage A / Megaways 逐模式(additive;makeMode 在 helpers 凍結,此處補預設)。
        //   D3 遷移:舊檔無此欄 → 繼承全域 g.megaways(全模式)。row_min/row_max 於 layout 就緒後由
        //   _fillModeGridDefaults 補顯示預設(0=未定)。grid_explicit=false → 匯出不寫 05b(Python 推導,零行為差);
        //   使用者於盤面幾何卡(Stage B)顯式設定才置 true。reel_ranges=[] → 廣播;非空 → 逐輪覆寫。
        if (m.rows_variable == null) m.rows_variable = !!g.megaways;
        if (m.row_min == null) m.row_min = 0;
        if (m.row_max == null) m.row_max = 0;
        if (!Array.isArray(m.reel_ranges)) m.reel_ranges = [];
        if (m.grid_explicit == null) m.grid_explicit = false;
        // 架構檢閱 #6:消除連鎖(Cascade)結構化宣告(additive;makeMode 在 helpers 凍結,此處補預設)。
        //   cascade_enabled=此模式是否走消除補位迴圈;cascade_max_depth=0 沿用全域 max_chain_depth。
        if (m.cascade_enabled == null) m.cascade_enabled = false;
        if (m.cascade_max_depth == null) m.cascade_max_depth = 0;
        // ── G-7/8:動態盤面幾何(additive;makeMode 在 helpers 凍結,此處補預設)。
        //   row_feature_max=特色期列上限(0=無特色成長,05b Feature_Max 空);
        //   geometry_transitions[]=幾何轉變宣告(掛此模式,同 trigger_pays 範式;空=幾何靜態)。──
        if (m.row_feature_max == null) m.row_feature_max = 0;
        if (!Array.isArray(m.geometry_transitions)) m.geometry_transitions = [];
        // ── G-9:符號池動態變更(additive;makeMode 在 helpers 凍結,此處補預設)。
        //   symbol_ops[]=deck-thinning / 符號值升級宣告(掛此模式;空=符號集固定)。──
        if (!Array.isArray(m.symbol_ops)) m.symbol_ops = [];
        // ── G-4:hold-and-win / cash-on-reels 新欄(additive;makeMode 在 helpers 凍結,此處補預設)。
        //   respin 收集回合本體沿用既有 respin_*/collect_enabled;此處只補真正缺的描述欄。──
        if (m.hw_trigger_symbol == null) m.hw_trigger_symbol = '';
        if (m.hw_persist_value == null) m.hw_persist_value = false;
        if (m.hw_collect_rule == null) m.hw_collect_rule = '';
        if (m.hw_link_jackpot == null) m.hw_link_jackpot = '';
      }
      modes.forEach(_ensureModeGameplayFields);
      // v7.10:trigger_pays(scatter-pay 觸發給付)逐列增刪。資料 additive,引擎尚未消費(Stage 3 才執行)。
      function addTriggerPay(m) {
        _ensureModeGameplayFields(m);
        m.trigger_pays.push({ scatter_count: 0, pay: 0, grants_spins: 0 });
      }
      function removeTriggerPay(m, idx) {
        if (Array.isArray(m.trigger_pays)) m.trigger_pays.splice(idx, 1);
      }
      // ── G-7/8:幾何轉變(02e)逐列增刪(掛此模式,同 trigger_pays 範式)。additive,引擎不消費。──
      function addGeometryTransition(m) {
        _ensureModeGameplayFields(m);
        m.geometry_transitions.push({ dimension: 'ROW_HEIGHT', trigger_source: '', step: '',
                                      cap: '', ways_recompute: 'PRODUCT_OF_ROWS', notes: '' });
      }
      function removeGeometryTransition(m, idx) {
        if (Array.isArray(m.geometry_transitions)) m.geometry_transitions.splice(idx, 1);
      }
      // G-7/8 前端下拉選項(D4沿用)
      const GEOMETRY_DIMENSIONS = [
        { v: 'ROW_HEIGHT', label: 'ROW_HEIGHT — 每欄列高(xWays/延展轉軸)' },
        { v: 'REEL_COUNT', label: 'REEL_COUNT — 增輪(Punk 第6輪)' },
        { v: 'GRID_ROWS',  label: 'GRID_ROWS — 整體列數(Cygnus/Pirots)' },
      ];
      const WAYS_RECOMPUTE_OPTIONS = [
        { v: 'PRODUCT_OF_ROWS', label: 'PRODUCT_OF_ROWS — 各輪列數乘積(Megaways 式)' },
        { v: 'FIXED',           label: 'FIXED — ways/線數不變' },
        { v: 'NONE',            label: 'NONE — 非 ways 制' },
      ];
      // ── G-9:符號池操作(11d)逐列增刪(掛此模式,同 trigger_pays 範式)。additive,引擎不消費。──
      function addSymbolOp(m) {
        _ensureModeGameplayFields(m);
        m.symbol_ops.push({ op: 'REMOVE', target: 'lowest', count: '1', immune: '', trigger: '', notes: '' });
      }
      function removeSymbolOp(m, idx) {
        if (Array.isArray(m.symbol_ops)) m.symbol_ops.splice(idx, 1);
      }
      // G-9 前端下拉 / datalist 選項(D4沿用;Target 為自由字串,datalist 僅提示)
      const SYMBOL_OP_OPTIONS = [
        { v: 'REMOVE',  label: 'REMOVE — 移出符號池(deck-thinning)' },
        { v: 'UPGRADE', label: 'UPGRADE — 符號值升級(對接 CONVERT)' },
      ];
      const SYMBOL_TARGET_HINTS = ['lowest', 'highest', 'by_id:', 'by_color:'];
      // G-4:Link_Jackpot datalist 提示(常見級距名;自由字串,下游解析)
      const HOLD_WIN_JACKPOT_HINTS = ['GRAND', 'MAJOR', 'MINOR', 'MINI'];
      // reset_scope 下拉選項(空=繼承全域)
      const RESET_SCOPE_OPTIONS = [
        { v: '',         label: '(繼承全域)' },
        { v: 'CASCADE',  label: 'CASCADE — 每次連線中斷即重置' },
        { v: 'SPIN',     label: 'SPIN — 每一局重置' },
        { v: 'FEATURE',  label: 'FEATURE — 整個 feature 全程不重置' },
      ];
      // v7.11:mode 層 stack_mode 下拉(空=繼承全域 Multipliers.stack_mode)
      const STACK_MODE_OPTIONS = [
        { v: '',     label: '(繼承全域)' },
        { v: 'MUL',  label: 'MUL — 相乘' },
        { v: 'ADD',  label: 'ADD — 相加' },
      ];
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
        // v5.4:progress/coin 的 per-mode 同步移到後面專屬 watch（避免 TDZ）
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
      // v5.0-d:模式清單 accordion — 預設全收合,點摘要列展開;同時間最多一張
      const modeExpandedKey = ref(null);
      function isModeExpanded(m) { return modeExpandedKey.value === modeCardKey(m); }
      function toggleModeExpanded(m) {
        const k = modeCardKey(m);
        modeExpandedKey.value = (modeExpandedKey.value === k) ? null : k;
      }

      // ── v7.12:模式卡內「玩法設定 / 關聯 Bonus」子卡收合(runtime-only,不存 LS)──
      // 預設展開(true);以 modeCardKey 為索引,避免不同模式共用狀態。
      const modeGpOpen = reactive({});     // 玩法設定
      function isModeGpOpen(m) { const k = modeCardKey(m); return modeGpOpen[k] !== false; }
      function toggleModeGp(m) { const k = modeCardKey(m); modeGpOpen[k] = (modeGpOpen[k] === false); }
      // 玩法設定:有無任何實質設定(reset_scope / stack_mode / cap / trigger_pays)
      function modeGpHasContent(m) {
        if (!m) return false;
        // v7.14:非 SPIN 玩法(bonus 小遊戲)本身即有內容
        if (m.mode_kind && m.mode_kind !== 'SPIN') return true;
        if ((m.reset_scope || '') || (m.stack_mode || '')) return true;
        if (m.cap_enabled === 'Y' && (m.cap_value || '')) return true;
        if ((m.trigger_pays || []).length > 0) return true;
        if ((m.choice_group || '') || Number(m.respin_base) > 0) return true;   // v8.5 R3
        if ((m.pay_type_override || '')) return true;                            // v8.7 R6 A-2
        if (m.collect_enabled || (m.respin_reset_symbol || '')
            || m.grid_expand_in_collect || m.allow_persistent) return true;      // v8.22 G3
        return false;
      }
      // 玩法設定收合摘要:精要描述
      function modeGpSummary(m) {
        if (!m) return '';
        // v7.14:非 SPIN 玩法優先顯示玩法種類摘要
        if (m.mode_kind && m.mode_kind !== 'SPIN') return modeKindSummary(m);
        const parts = [];
        if (m.reset_scope) parts.push('重置 ' + m.reset_scope);
        if (m.stack_mode) parts.push('疊加 ' + m.stack_mode);
        if (m.cap_enabled === 'Y' && (m.cap_value || '')) parts.push('封頂');
        const tp = (m.trigger_pays || []).length;
        if (tp) parts.push(tp + ' 條觸發給付');
        // v8.5 / R3
        if (m.choice_group) parts.push('擇一組 ' + m.choice_group);
        if (Number(m.respin_base) > 0) parts.push('Respin ' + m.respin_base);
        if (m.pay_type_override) parts.push('賠付 ' + m.pay_type_override);   // v8.7 R6 A-2
        // v8.22 / G3 Hold&Win 設定面
        if (m.collect_enabled) parts.push('收集型');
        if (m.respin_reset_symbol) parts.push('重置符 ' + m.respin_reset_symbol);
        if (m.grid_expand_in_collect) parts.push('收集擴張');
        if (m.allow_persistent) parts.push('允許 persistent');
        return parts.join(' · ');
      }
      // v8.0:關聯 Bonus 子卡已移除(bonus 併入 mode 玩法種類);modeBn* helpers 一併移除。

      // ── v8.14 批3 #3:新增模式改「彈窗流程」──
      //   名稱必填 + 撞名防呆(不分大小寫);玩法大方向五選一(含 OTHER);
      //   非 NG 且 SPIN 時可先開啟觸發給付並逐列填寫(也可留到卡片內補填)。
      //   確認後仍走既有 makeMode + _ensureModeGameplayFields,資料形狀零改動。
      // ModeKind 純函式（mode-kind.js）；fallback 僅防呆，正式路徑靠 app.html 載入順序。
      const MK = (window.SlotPlanner && window.SlotPlanner.ConfigEditor &&
                  window.SlotPlanner.ConfigEditor.ModeKind) || {};
      // ModeSections 純函式（mode-sections.js）；卡片區段啟停 helpers。
      const MS = (window.SlotPlanner && window.SlotPlanner.ConfigEditor &&
                  window.SlotPlanner.ConfigEditor.ModeSections) || {};

      function modeSectionOn(m, id) {
        const list = MS.resolveEnabledSections ? MS.resolveEnabledSections(m) : [];
        return list.indexOf(id) >= 0;
      }
      function modeSectionList(m) {
        return MS.sectionsForKind ? MS.sectionsForKind(m && m.mode_kind) : [];
      }
      function modeSectionsAvailableToAdd(m) {
        const all = modeSectionList(m);
        const on = new Set(MS.resolveEnabledSections ? MS.resolveEnabledSections(m) : []);
        return all.filter(s => !on.has(s.id));
      }
      function modeSectionAdd(m, id) {
        if (!m || !id) return;
        const arr = MS.materializeEnabledSections
          ? MS.materializeEnabledSections(m)
          : (m.enabled_sections || (m.enabled_sections = []));
        if (arr.indexOf(id) < 0) arr.push(id);
      }
      function modeSectionRemove(m, id) {
        if (!m || !id) return;
        const arr = MS.materializeEnabledSections
          ? MS.materializeEnabledSections(m)
          : (m.enabled_sections || (m.enabled_sections = []));
        const i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1);
        // 不清欄位值（spec）
      }

      // 「新增設定」子選單開合（runtime-only；以 modeCardKey 索引，不污染 mode 物件）
      const modeAddSecMenu = reactive({});
      function isModeAddSecOpen(m) { return !!modeAddSecMenu[modeCardKey(m)]; }
      function toggleModeAddSec(m) {
        const k = modeCardKey(m);
        modeAddSecMenu[k] = !modeAddSecMenu[k];
      }
      function closeModeAddSec(m) { modeAddSecMenu[modeCardKey(m)] = false; }

      // 三步精靈：step 1 共通／step 2 區段／step 3 預覽確認；僅 step===3 可建立
      const modeAddDlg = reactive({
        open: false,
        step: 1,
        name: '',
        kind: 'SPIN',
        otherText: '',
        triggerOn: false,
        tpEnabled: false,
        tpRows: [],
        end_condition: '',
        unlock_requires: [],
        enabled_sections: [],
        focusSection: '',
        // 步驟 2 欄位暫存（建立時抄到 mode）
        pay_type_override: '',
        reset_scope: '',
        stack_mode: '',
        cap_enabled: '',
        cap_value: '',
        choice_group: '',
        respin_base: 0,
        respin_reset_on: '',
        respin_stop_cond: '',
        collect_enabled: false,
        respin_reset_symbol: '',
        grid_expand_in_collect: false,
        allow_persistent: false,
        cascade_enabled: false,
        cascade_max_depth: 0,
        mult_compose_override: '',
        refill_track_override: '',
        wheel_upgrade_to: '',
        pick_count: 0,
        collect_target: 0,
        items: [],
        seededKind: '', // 已套用 default sections 的 kind；避免 step1→2 重複覆寫
        draftMode: null, // { mode:'__MODE_ADD__', trigger_condition:'', … } 供 modeCond
      });
      function modeAddDlgResetDraftMode() {
        modeAddDlg.draftMode = {
          mode: '__MODE_ADD__',
          trigger_condition: '',
        };
        // modeCond 定義較後；開啟／重設時才呼叫，runtime 必已就緒
        if (modeCond && modeCond.ensure) modeCond.ensure(modeAddDlg.draftMode);
      }
      function openAddModeDlg() {
        modeAddDlg.open = true;
        modeAddDlg.step = 1;
        modeAddDlg.name = '';
        modeAddDlg.kind = 'SPIN';
        modeAddDlg.otherText = '';
        modeAddDlg.triggerOn = false;
        modeAddDlg.tpEnabled = false;
        modeAddDlg.tpRows = [];
        modeAddDlg.end_condition = '';
        modeAddDlg.unlock_requires = [];
        modeAddDlg.enabled_sections = MS.defaultEnabledSections
          ? MS.defaultEnabledSections('SPIN') : ['pay_type'];
        modeAddDlg.focusSection = modeAddDlg.enabled_sections[0] || '';
        modeAddDlg.pay_type_override = '';
        modeAddDlg.reset_scope = '';
        modeAddDlg.stack_mode = '';
        modeAddDlg.cap_enabled = '';
        modeAddDlg.cap_value = '';
        modeAddDlg.choice_group = '';
        modeAddDlg.respin_base = 0;
        modeAddDlg.respin_reset_on = '';
        modeAddDlg.respin_stop_cond = '';
        modeAddDlg.collect_enabled = false;
        modeAddDlg.respin_reset_symbol = '';
        modeAddDlg.grid_expand_in_collect = false;
        modeAddDlg.allow_persistent = false;
        modeAddDlg.cascade_enabled = false;
        modeAddDlg.cascade_max_depth = 0;
        modeAddDlg.mult_compose_override = '';
        modeAddDlg.refill_track_override = '';
        modeAddDlg.wheel_upgrade_to = '';
        modeAddDlg.pick_count = 0;
        modeAddDlg.collect_target = 0;
        modeAddDlg.items = [];
        modeAddDlg.seededKind = '';
        modeAddDlgResetDraftMode();
        Vue.nextTick(() => {
          try { document.querySelector('.cfg-modedlg-name')?.focus(); } catch (e) { /* no-op */ }
        });
      }
      function modeAddDlgPick(n) { modeAddDlg.name = n; }
      const modeAddDlgNameTaken = computed(() => {
        const n = modeAddDlg.name.trim().toUpperCase();
        return !!n && modes.some(m => (m.mode || '').trim().toUpperCase() === n);
      });
      const modeAddCanConfirm = computed(() => {
        const fn = MK.modeAddCanConfirm;
        if (!fn) {
          const n = modeAddDlg.name.trim();
          if (!n || modeAddDlgNameTaken.value) return false;
          if (modeAddDlg.kind === 'OTHER' && !modeAddDlg.otherText.trim()) return false;
          return true;
        }
        return fn({
          name: modeAddDlg.name,
          nameTaken: modeAddDlgNameTaken.value,
          kind: modeAddDlg.kind,
          otherText: modeAddDlg.otherText,
        });
      });
      // 觸發給付區顯示條件:名稱非空、非 NG、玩法為 SPIN(bonus 小遊戲不適用,與卡片 cfg-kind-na 一致)
      const modeAddDlgTpVisible = computed(() => {
        const n = modeAddDlg.name.trim().toUpperCase();
        return !!n && n !== 'NG' && modeAddDlg.kind === 'SPIN';
      });
      function modeAddDlgTpAdd()      { modeAddDlg.tpRows.push({ scatter_count: 0, pay: 0, grants_spins: 0 }); }
      function modeAddDlgTpRemove(i)  { modeAddDlg.tpRows.splice(i, 1); }

      // 步驟 1 解鎖前提 chip（暫存於 dlg，不碰既有 modeUnlockToggle）
      function modeAddDlgUnlockHas(name) {
        return modeAddDlg.unlock_requires.indexOf(name) >= 0;
      }
      function modeAddDlgUnlockToggle(name) {
        const arr = modeAddDlg.unlock_requires;
        const i = arr.indexOf(name);
        if (i >= 0) arr.splice(i, 1);
        else arr.push(name);
      }

      const modeAddCanNext = computed(() => {
        if (modeAddDlg.step === 1) return modeAddCanConfirm.value;
        return true; // 步驟 2 不強制勾選
      });

      function modeAddDlgApplyKindDefaults() {
        const kind = modeAddDlg.kind;
        modeAddDlg.enabled_sections = MS.defaultEnabledSections
          ? MS.defaultEnabledSections(kind) : [];
        modeAddDlg.focusSection = modeAddDlg.enabled_sections[0] || '';
      }

      function modeAddDlgNext() {
        if (!modeAddCanNext.value) return;
        if (modeAddDlg.step === 1) {
          if (modeAddDlg.seededKind !== modeAddDlg.kind) {
            modeAddDlgApplyKindDefaults();
            modeAddDlg.seededKind = modeAddDlg.kind;
          }
          modeAddDlg.step = 2;
          return;
        }
        if (modeAddDlg.step === 2) modeAddDlg.step = 3;
      }

      function modeAddDlgBack() {
        if (modeAddDlg.step > 1) modeAddDlg.step -= 1;
      }

      function modeAddDlgToggleSection(id) {
        const arr = modeAddDlg.enabled_sections;
        const i = arr.indexOf(id);
        if (i >= 0) {
          arr.splice(i, 1);
          if (modeAddDlg.focusSection === id) {
            modeAddDlg.focusSection = arr[0] || '';
          }
        } else {
          arr.push(id);
          modeAddDlg.focusSection = id;
        }
      }

      function modeAddDlgFocusSection(id) {
        if (modeAddDlg.enabled_sections.indexOf(id) >= 0) {
          modeAddDlg.focusSection = id;
        }
      }

      const modeAddDlgSections = computed(() =>
        MS.sectionsForKind ? MS.sectionsForKind(modeAddDlg.kind) : []
      );

      const modeAddDlgPreview = computed(() => {
        const lines = [];
        lines.push(`名稱: ${modeAddDlg.name.trim() || '—'}`);
        lines.push(`玩法: ${modeAddDlg.kind}${modeAddDlg.kind === 'OTHER' ? ' / ' + modeAddDlg.otherText.trim() : ''}`);
        if (modeAddDlg.triggerOn) {
          const dsl = (modeAddDlg.draftMode && modeAddDlg.draftMode.trigger_condition) || '（空）';
          lines.push(`觸發條件: ${dsl}`);
          if (modeAddDlgTpVisible.value && modeAddDlg.tpEnabled) {
            lines.push(`觸發給付: ${modeAddDlg.tpRows.length} 列`);
          }
          if (modeAddDlg.end_condition) lines.push(`結束條件: ${modeAddDlg.end_condition}`);
          if (modeAddDlg.unlock_requires.length) {
            lines.push(`解鎖前提: ${modeAddDlg.unlock_requires.join(', ')}`);
          }
        } else {
          lines.push('觸發條件: 關');
        }
        lines.push('已啟用設定: ' + (modeAddDlg.enabled_sections.join(', ') || '（無）'));
        return lines;
      });

      function confirmAddModeDlg() {
        if (modeAddDlg.step !== 3) return;
        if (!modeAddCanConfirm.value) return;
        const name = modeAddDlg.name.trim();
        // v8.43 / C-1:# 為輪帶變體保留字元,模式名拒收
        if (name.includes('#')) {
          emit('status', { type: 'err', msg: `模式名稱不可含「#」(輪帶變體保留字元)` });
          return;
        }
        const m = makeMode(name);
        modes.push(m);
        // 不在此強制 enabled_sections（由下方從 dlg 寫入）
        _ensureModeGameplayFields(m);
        if (MK.applyModeAddKind) {
          MK.applyModeAddKind(m, modeAddDlg.kind, modeAddDlg.otherText);
        } else {
          m.mode_kind = modeAddDlg.kind;
          if (modeAddDlg.kind === 'OTHER') m.notes = modeAddDlg.otherText.trim();
        }

        if (modeAddDlg.triggerOn && modeAddDlg.draftMode) {
          m.trigger_condition = modeAddDlg.draftMode.trigger_condition || '';
          m.end_condition = modeAddDlg.end_condition || '';
          m.unlock_requires = modeAddDlg.unlock_requires.slice();
        }
        if (modeAddDlgTpVisible.value && modeAddDlg.tpEnabled) {
          m.trigger_pays = modeAddDlg.tpRows.map(r => ({
            scatter_count: Number(r.scatter_count) || 0,
            pay: Number(r.pay) || 0,
            grants_spins: Number(r.grants_spins) || 0,
          }));
          if (m.trigger_pays.length === 0) {
            m.trigger_pays.push({ scatter_count: 0, pay: 0, grants_spins: 0 });
          }
        }

        // 步驟 2 欄位：簡化全部抄到 m（未啟用區段值亦保留）
        const copyKeys = [
          'pay_type_override', 'reset_scope', 'stack_mode', 'cap_enabled', 'cap_value',
          'choice_group', 'respin_base', 'respin_reset_on', 'respin_stop_cond',
          'collect_enabled', 'respin_reset_symbol', 'grid_expand_in_collect', 'allow_persistent',
          'cascade_enabled', 'cascade_max_depth', 'mult_compose_override', 'refill_track_override',
          'wheel_upgrade_to', 'pick_count', 'collect_target',
        ];
        for (const k of copyKeys) m[k] = modeAddDlg[k];
        m.items = (modeAddDlg.items || []).map(it => Object.assign({}, it));
        m.enabled_sections = modeAddDlg.enabled_sections.slice();

        modeExpandedKey.value = modeCardKey(m);
        modeAddDlg.open = false;
        emit('status', { type: 'ok', msg: `已新增模式 ${name}` });
        Vue.nextTick(() => {
          try {
            const cards = document.querySelectorAll('.cfg-mode-card');
            const last = cards[cards.length - 1];
            if (last) last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } catch (e) { /* no-op */ }
        });
      }
      // 舊自動命名版保留為後備(彈窗流程上線後 UI 不再呼叫)
      function addMode() {
        // 自動產生不衝突的新名稱
        const taken = new Set(modes.map(m => m.mode));
        let base = 'MODE';
        let i = 1;
        while (taken.has(`${base}${i}`)) i++;
        modes.push(makeMode(`${base}${i}`));
        _ensureModeGameplayFields(modes[modes.length - 1]);   // v7.10:補 reset_scope/trigger_pays
        modeExpandedKey.value = modeCardKey(modes[modes.length - 1]);   // v5.0-d:新卡自動展開
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
        const name = (m.mode || '').trim();
        // v8.16:刪除前盤點懸空參照(mode_scope 逗號名單 comma-aware + 條件 DSL 字面值)。
        //   哲學:告知並兜底,不自動清理孤兒 — 之後以原名重建模式即可復原對應。
        let refs = 0;
        const _hasTok = (v) => !!(v && v !== 'ALL' &&
          String(v).split(',').map(x => x.trim()).includes(name));
        try {
          [rules, discards, constraints, genLimits, cellAttrs, jackpots, symbolGroups, reelLinks, meters].forEach(arr => {   // v8.38:+reelLinks;G-1:+meters(R-H1 盤點)
            if (Array.isArray(arr)) arr.forEach(o => { if (_hasTok(o && o.mode_scope)) refs++; });
          });
          // v8.44 / C-2:面板作動模式 csv(欄名 active_modes)一併盤點
          panels.forEach(pp => { if (_hasTok(pp && pp.active_modes)) refs++; });
          // R-H1 修補:符號(registry)mode_scope 一併盤點,警告文字才會反映真實孤兒數
          if (registry && typeof registry.symbols === 'function') {
            registry.symbols().forEach(s => { if (_hasTok(s && s.mode_scope)) refs++; });
          }
          const _escN = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const _dslRe = new RegExp(
            '\\bmode\\s*==\\s*' + _escN + '\\b|\\bmode\\s+in\\s+\\[[^\\]]*\\b' + _escN + '\\b[^\\]]*\\]');
          for (const r of rules)    { if (r.condition && _dslRe.test(r.condition)) refs++; }
          for (const d of discards) { if (d.condition && _dslRe.test(d.condition)) refs++; }
          for (const x of modes)    { if (x !== m && x.trigger_condition && _dslRe.test(x.trigger_condition)) refs++; }
        } catch (e) { /* 盤點失敗不擋刪除 */ }
        const extra = (name && refs)
          ? `\n\n注意:仍有 ${refs} 筆設定(規則/棄牌/約束/產牌限制/格子屬性/JP/家族/條件/符號)參照「${name}」。\n刪除後不會自動清理這些參照;之後以原名重建模式即可復原對應。`
          : '';
        if (!confirm(`確定要刪除模式「${name || '(未命名)'}」嗎?${extra}`)) return;
        modes.splice(idx, 1);
        emit('status', { type: 'ok', msg: `已刪除模式「${m.mode}」` });
      }
      // ── 模式改名:把所有以「模式名稱」為 key 的 per-mode 資料一起搬移,避免改名即丟設定 ──
      //   與 renamePanel 同精神。由模式名稱輸入框 @change(失焦/Enter)觸發,oldName 在 @focus 記住。
      //   執行期才存取後方宣告的容器(bins/reelWeights/.../jackpots),靠 closure + 失焦才呼叫,
      //   故在此宣告位置(容器尚未初始化處)安全;不動 A.xlsx 契約 / LS key / 型別。
      function renameMode(idx, oldName, rawNew) {
        if (idx < 0 || idx >= modes.length) return;
        const m = modes[idx];
        const newName = String(rawNew == null ? m.mode : rawNew).trim();
        const old = String(oldName || '').trim();
        // 寫回(input 已 v-model 或在此統一寫;確保 m.mode 為清乾淨的 newName)
        m.mode = newName;
        if (!newName || newName === old) return;            // 空名或沒變:交給既有空名警告處理,不遷移
        // v8.43 / C-1:# 為輪帶變體保留字元(04b Mode_Scope 變體鍵 "模式#變體名"),模式名拒收
        if (newName.includes('#')) {
          emit('status', { type: 'err', msg: `模式名稱不可含「#」(輪帶變體保留字元),改名取消` });
          m.mode = old;
          return;
        }
        if (modes.some((x, i) => i !== idx && (x.mode || '').trim() === newName)) {
          // 撞名:還原,讓既有 duplicateNames 警告生效而非靜默蓋掉別人的資料
          emit('status', { type: 'err', msg: `模式名稱「${newName}」重複,改名取消` });
          m.mode = old;
          return;
        }
        // 1) 直接以名稱為 key 的 plain object 容器:搬 key
        const _moveKey = (obj) => {
          if (obj && Object.prototype.hasOwnProperty.call(obj, old)) {
            if (!Object.prototype.hasOwnProperty.call(obj, newName)) obj[newName] = obj[old];
            delete obj[old];
          }
        };
        _moveKey(bins);
        _moveKey(reelWeights);
        _moveKey(gridWeights);
        _moveKey(comboWeights);
        _moveKey(reelStrips.strips);
        _moveKey(stripStr);
        // v8.43 / C-1 R-H1:輪帶變體鍵 "<old>#X" 隨模式改名重映為 "<newName>#X"
        //   (_moveKey 只搬精確鍵;變體鍵屬同一容器,改名必連動。動作參數內的
        //    variant="OLD#X" 不重寫 — 與 SWITCH_MODE target 既知邊界同級)
        const _movePrefixed = (obj) => {
          if (!obj) return;
          for (const k of Object.keys(obj)) {
            if (k.startsWith(old + '#')) {
              const nk = newName + k.slice(old.length);
              if (!(nk in obj)) obj[nk] = obj[k];
              delete obj[k];
            }
          }
        };
        _movePrefixed(reelStrips.strips);
        _movePrefixed(stripStr);
        _moveKey(multipliers.progress_ladders);
        _moveKey(progressLadderStr);
        // 2) 巢狀於每筆面額的 weight_by_mode
        for (const dn of coinValues.denominations) {
          if (dn.weight_by_mode && Object.prototype.hasOwnProperty.call(dn.weight_by_mode, old)) {
            if (!(newName in dn.weight_by_mode)) dn.weight_by_mode[newName] = dn.weight_by_mode[old];
            delete dn.weight_by_mode[old];
          }
        }
        // 3) JP 的 mode_scope 逗號名單字串
        for (const j of jackpots) {
          if (j.mode_scope && j.mode_scope !== 'ALL') {
            const parts = j.mode_scope.split(',').map(s => s.trim()).filter(Boolean);
            let changed = false;
            const next = parts.map(p => (p === old ? (changed = true, newName) : p));
            if (changed) j.mode_scope = Array.from(new Set(next)).join(',');
          }
        }
        // 3b) v8.16:其餘 mode_scope 逗號名單(規則/棄牌/約束/產牌限制/格子屬性)
        //     comma-aware:多選名單裡的單一 token 改名,其餘 token 不動。
        const _renScope = (o) => {
          if (!o || !o.mode_scope || o.mode_scope === 'ALL') return;
          const parts = String(o.mode_scope).split(',').map(s => s.trim()).filter(Boolean);
          let changed = false;
          const next = parts.map(p => (p === old ? (changed = true, newName) : p));
          if (changed) o.mode_scope = Array.from(new Set(next)).join(',');
        };
        [rules, discards, constraints, genLimits, cellAttrs, symbolGroups, reelLinks, meters].forEach(arr => {   // v8.38:+reelLinks;G-1:+meters(R-H1 補)
          if (Array.isArray(arr)) arr.forEach(_renScope);
        });
        // 3b-1b) R-H1 修補:符號(registry)mode_scope 逗號名單一併重寫。
        //   symbols 不在上面的陣列清單內(存於 SymbolRegistry,非本元件的 reactive 容器),
        //   改名前若有符號 mode_scope 指到 old,改名後會變成幽靈模式參照,故獨立處理。
        if (registry && typeof registry.symbols === 'function') {
          try {
            const allSyms = registry.symbols();
            let symChanged = false;
            for (const s of allSyms) {
              if (!s.mode_scope || s.mode_scope === 'ALL') continue;
              const parts = String(s.mode_scope).split(',').map(x => x.trim()).filter(Boolean);
              let changed = false;
              const next = parts.map(p => (p === old ? (changed = true, newName) : p));
              if (changed) { s.mode_scope = Array.from(new Set(next)).join(','); symChanged = true; }
            }
            if (symChanged) registry.applyAll(allSyms, registry.swatchMap());
          } catch (e) { /* 不擋改名流程 */ }
        }
        // 3b-2) v8.44 / C-2 R-H1:面板作動模式 csv(欄名 active_modes,與 _renScope 同式重寫)
        for (const pp of panels) {
          if (!pp || !pp.active_modes) continue;
          const parts = String(pp.active_modes).split(',').map(s => s.trim()).filter(Boolean);
          let changed = false;
          const next = parts.map(x => (x === old ? (changed = true, newName) : x));
          if (changed) pp.active_modes = Array.from(new Set(next)).join(',');
        }
        // 3c) v8.16:條件 DSL 內的 mode 字面值 — 「mode == OLD」與「mode in [.., OLD, ..]」
        //     只動 mode 比對的字面值,不碰其他變數/符號名。
        const _escOld = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const _renDsl = (txt) => {
          if (!txt) return txt;
          let s2 = String(txt).replace(
            new RegExp('\\bmode\\s*==\\s*' + _escOld + '\\b', 'g'), 'mode == ' + newName);
          s2 = s2.replace(/\bmode\s+in\s+\[([^\]]*)\]/gi, (whole, list) => {
            const ps = list.split(',').map(x => x.trim()).filter(Boolean);
            if (!ps.includes(old)) return whole;
            return 'mode in [' + ps.map(p => (p === old ? newName : p)).join(', ') + ']';
          });
          return s2;
        };
        for (const r of rules)    { if (r.condition) r.condition = _renDsl(r.condition); }
        for (const d of discards) { if (d.condition) d.condition = _renDsl(d.condition); }
        for (const x of modes)    { if (x.trigger_condition) x.trigger_condition = _renDsl(x.trigger_condition); }
        // 4) 起始模式字串
        if (g.starting_mode === old) g.starting_mode = newName;
        // 5) 各分頁 sticky active mode ref
        for (const r of [reelActiveMode, gridActiveMode, comboActiveModeBar, stripActiveMode]) {
          if (r && r.value === old) r.value = newName;
        }
        emit('status', { type: 'ok', msg: `模式「${old}」已改名為「${newName}」,相關設定一併搬移` });
      }

      // ── 02_Layout 狀態 ──
      const layout = reactive(loadLayout());
      const layoutDebugJson = computed(() => JSON.stringify(layout, null, 2));
      // §5.2 Stage A:layout 就緒後補 per-mode row_min/row_max 顯示預設(僅補未定 0;不影響匯出——
      //   非 grid_explicit 模式匯出仍由 Python 推導,零行為差)。固定模式 min=max=盤面最高輪;可變 min=2。
      function _fillModeGridDefaults() {
        const cap = Math.max(1, ...layout.map(r => Number(r.max_rows) || 1));
        for (const m of modes) {
          if (!m.row_max || m.row_max < 1) m.row_max = cap;
          if (!m.row_min || m.row_min < 1) m.row_min = m.rows_variable ? Math.min(2, cap) : m.row_max;
        }
      }
      _fillModeGridDefaults();

      // §5.2 Stage B:盤面幾何卡(逐模式列數;綁 Stage A 欄位 rows_variable/row_min/row_max/reel_ranges/grid_explicit)
      const gridGeomOpen = ref(false);   // 卡折疊(預設收合,不佔 canvas 空間)
      function toggleGridGeom() { gridGeomOpen.value = !gridGeomOpen.value; }
      function reelCapById(rid) {
        const r = layout.find(x => x.reel_id === rid);
        return Math.max(1, Number(r && r.max_rows) || 1);
      }
      function _gridGeomCap() { return Math.max(1, ...layout.map(r => Number(r.max_rows) || 1)); }
      function setModeGridVariable(m) {
        m.rows_variable = true;
        m.grid_explicit = true;                       // 可變 → 顯式,匯出寫 05b
        const cap = _gridGeomCap();
        if (!m.row_max || m.row_max < 1) m.row_max = cap;
        if (!m.row_min || m.row_min < 1) m.row_min = Math.min(2, cap);
        if (m.row_min > m.row_max) m.row_min = m.row_max;
      }
      function setModeGridFixed(m) {
        m.rows_variable = false;
        m.grid_explicit = false;                      // 固定 = 推導預設,免寫 05b(零行為差)
        m.reel_ranges = [];
      }
      function clampModeGridBroadcast(m) {
        const cap = _gridGeomCap();
        m.row_max = Math.max(1, Math.min(cap, Number(m.row_max) || cap));
        m.row_min = Math.max(1, Math.min(m.row_max, Number(m.row_min) || 1));
        m.grid_explicit = true;
      }
      function modePerReelOn(m) { return Array.isArray(m.reel_ranges) && m.reel_ranges.length > 0; }
      function toggleModePerReel(m, on) {
        if (on) {                                     // 廣播 → 逐輪(各輪初始=廣播值,上限夾各輪 cap)
          m.reel_ranges = layout.map(r => {
            const cap = Math.max(1, Number(r.max_rows) || 1);
            const hi = Math.max(1, Math.min(cap, Number(m.row_max) || cap));
            const lo = Math.max(1, Math.min(hi, Number(m.row_min) || 1));
            return { reel_id: r.reel_id, min_rows: lo, max_rows: hi };
          });
          m.grid_explicit = true;
        } else {                                      // 逐輪 → 廣播(取 envelope 當預設,清空逐輪)
          if (m.reel_ranges.length) {
            m.row_min = Math.min(...m.reel_ranges.map(x => x.min_rows));
            m.row_max = Math.max(...m.reel_ranges.map(x => x.max_rows));
          }
          m.reel_ranges = [];
        }
      }
      function clampReelRange(m, entry) {
        const cap = reelCapById(entry.reel_id);
        entry.max_rows = Math.max(1, Math.min(cap, Number(entry.max_rows) || cap));
        entry.min_rows = Math.max(1, Math.min(entry.max_rows, Number(entry.min_rows) || 1));
        m.grid_explicit = true;
      }
      // 目前選中的 Reel 索引（0-based）
      const activeReelIdx = ref(0);
      const activeReel = computed(() => layout[activeReelIdx.value] || null);

      // ── v4.7:自由副盤 (Panel) + 符號集狀態 ──
      const panels = reactive(loadPanels());
      // v8.39 / 軌道:面板跨局位移宣告(makePanel/loadPanels 在 helpers 凍結 → 此處補預設)。
      //   scroll_track '' = 沿用現行隱含「往下滾」語意;scroll_step 每局位移格數(可負)。
      panels.forEach(p => {
        if (p.scroll_track == null) p.scroll_track = '';
        if (p.scroll_step == null) p.scroll_step = 1;
        // v8.44 / C-2 GAP-P3+P5(makePanel 凍結 → 此處補預設;'' = 現行為)
        if (p.active_modes == null) p.active_modes = '';
        if (p.eval_domain == null) p.eval_domain = '';
        if (p.payline_set == null) p.payline_set = '';
      });
      const symbolSets = reactive(loadSymbolSets());
      const activePanelIdx = ref(-1);   // -1 = 未選 panel（在編主輪）
      const activePanel = computed(() =>
        (activePanelIdx.value >= 0 && activePanelIdx.value < panels.length)
          ? panels[activePanelIdx.value] : null);
      const panelsDebugJson = computed(() => JSON.stringify(panels, null, 2));

      // ── 連動層:把盤面 / 副盤 / 全域 的「即時記憶體值」同步進 gameSpec(單一真相)──
      //    syncGameSpec() 直接把記憶體資料傳給 refresh,不讀 LS——layout 是經
      //    scheduleSave(400ms 防抖)才寫 LS,讀 LS 會拿到舊值(這正是「切頁讀到舊輪數、
      //    要硬刷新才對」的根因)。
      //    為求 100% 可靠:除了下方 watcher,也在 addReel / removeReel / applyLayoutPreset
      //    末端「直接呼叫」此函式——純函式呼叫必定執行,不依賴 Vue reactivity 追蹤是否觸發。
      function syncGameSpec(reason) {
        if (!SP.gameSpec) return;
        try {
          SP.gameSpec.refresh({
            layout: layout.map(r => ({ ...r })),
            panels: panels.map(p => ({ ...p })),
            g: { ...g },
          });
          console.log('[gameSpec] syncGameSpec(' + (reason || '') + ') reelCount=' + layout.length);
        } catch (e) { /* noop */ }
      }
      if (SP.gameSpec) {
        // 備援 watcher(若 reactivity 有觸發就更即時;沒觸發也有上面的直接呼叫兜底)
        watch(() => layout.length, () => syncGameSpec('watch:len'));
        watch(
          () => JSON.stringify([
            layout.map(r => [r.has_subreel, r.subreel_position, r.subreel_kind, r.subreel_rows, r.subreel_symbol_set, r.max_rows]),
            panels.map(p => [p.panel_id, p.scroll, p.join_payline, p.symbol_set, p.col, p.row, p.width, p.height]),
            g.pay_type, g.megaways, g.payline_direction,
          ]),
          () => syncGameSpec('watch:sig')
        );
        // 進入編輯器即同步一次
        syncGameSpec('config-mount');
      }

      function _nextPanelId() {
        let n = panels.length + 1;
        const ids = new Set(panels.map(p => p.panel_id));
        while (ids.has('P' + n)) n++;
        return 'P' + n;
      }
      function addPanel() {
        const p = makePanel(_nextPanelId());
        // v4.8 / v6.2 #7:擺在「所有主輪欄 + 既有副盤」的最右側再 +1 欄,避免與任何已存在的盤重疊
        let rightEdge = layoutTotalCols.value;
        panels.forEach(ep => { rightEdge = Math.max(rightEdge, (Number(ep.col) || 0) + (Number(ep.width) || 1)); });
        p.col = rightEdge + 1; p.row = 0;
        panels.push(p);
        activePanelIdx.value = panels.length - 1;
        emit('status', { type: 'ok', msg: `已新增自由副盤 ${p.panel_id}（已自動避開既有盤面）` });
      }
      function removePanel(idx) {
        if (idx < 0 || idx >= panels.length) return;
        const pid = panels[idx].panel_id;
        panels.splice(idx, 1);
        if (activePanelIdx.value >= panels.length) activePanelIdx.value = panels.length - 1;
        // v4.8:清掉所有模式中此 panel 的孤兒權重鍵
        for (const mode in reelWeights) {
          const pw = reelWeights[mode] && reelWeights[mode].panel_weights;
          if (!pw) continue;
          for (const k of Object.keys(pw)) {
            if (k.startsWith(pid + '-')) delete pw[k];
          }
        }
        emit('status', { type: 'ok', msg: `已移除自由副盤 ${pid}` });
      }
      function selectPanel(idx) { activePanelIdx.value = idx; selectedReelIdxs.value = []; }

      // ── v7.x:畫格分類 — 把框選的格子集合轉成副盤(任意遮罩)或主輪(逐欄分解) ──
      function _cellsBBox(keys) {
        let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
        for (const k of keys) {
          const m = /^(-?\d+),(-?\d+)$/.exec(String(k).trim()); if (!m) continue;
          const c = +m[1], r = +m[2];
          if (c < minC) minC = c; if (r < minR) minR = r; if (c > maxC) maxC = c; if (r > maxR) maxR = r;
        }
        if (minC === Infinity) return null;
        return { col: minC, row: minR, width: maxC - minC + 1, height: maxR - minR + 1 };
      }
      function cellsToPanelGeom(keys) {
        const bbox = _cellsBBox(keys); if (!bbox) return null;
        const rel = [];
        for (const k of keys) {
          const m = /^(-?\d+),(-?\d+)$/.exec(String(k).trim()); if (!m) continue;
          rel.push((+m[1] - bbox.col) + ',' + (+m[2] - bbox.row));
        }
        return { ...bbox, cells: normalizeMask(rel, bbox.width, bbox.height) };  // 矩形→null、非矩形→保留遮罩
      }
      function classifySelectionAsSub(opts) {
        opts = opts || {};
        const geom = cellsToPanelGeom(selectedCells.value);
        if (!geom) { emit('status', { type: 'err', msg: '沒有選取任何格子' }); return; }
        const p = { ...makePanel(_nextPanelId()), ...geom };
        if (opts.stage) p.panel_type = 'STAGE';            // 演出/負空間(不抽樣/不連線)
        p.scroll = (p.panel_type === 'SCROLL');
        panels.push(p);
        activePanelIdx.value = panels.length - 1;
        selectedReelIdxs.value = [];
        clearCellSelection();
        syncGameSpec('classifySub');
        emit('status', { type: 'ok', msg: `已新增副盤 ${p.panel_id}（${geom.cells ? '自訂形狀 ' + panelCellSet(p).size + ' 格' : geom.width + '×' + geom.height}）` });
      }
      function cellsToReels(keys) {
        const byCol = new Map(); let gMin = Infinity;
        for (const k of keys) {
          const m = /^(-?\d+),(-?\d+)$/.exec(String(k).trim()); if (!m) continue;
          const c = +m[1], r = +m[2];
          if (!byCol.has(c)) byCol.set(c, []);
          byCol.get(c).push(r); if (r < gMin) gMin = r;
        }
        const cols = [...byCol.keys()].sort((a, b) => a - b);
        if (cols.length === 0) return { ok: false, error: '沒有選取任何格子' };
        // 斷欄(欄與欄之間有空欄)仍視為非法 —— 主輪各欄必須相連
        for (let i = 1; i < cols.length; i++)
          if (cols[i] !== cols[i - 1] + 1)
            return { ok: false, error: `主輪欄位之間有空欄(欄 ${cols[i - 1]} 與 ${cols[i]} 不相鄰);主輪各欄必須相連` };
        // v7.5-Layer C:欄內挖洞改為合法 —— 不再擋洞,改用 cells mask 表達。
        //   y_offset = 該欄最小 row - gMin;max_rows = 該欄 row 跨距(含洞);
        //   cells = 該欄活格相對 y_offset 的 ["0,dy",…];實心欄(無洞)→ cells:null(向後相容)。
        const reels = [];
        for (let i = 0; i < cols.length; i++) {
          const rows = byCol.get(cols[i]).slice().sort((a, b) => a - b);
          const span = rows[rows.length - 1] - rows[0] + 1;   // 含洞的跨距
          const y_offset = rows[0] - gMin;
          let cells = null;
          if (rows.length < span) {
            // 有洞 → 產生 mask(相對該欄 row0)
            const top = rows[0];
            cells = rows.map(r => '0,' + (r - top));
          }
          reels.push({ reel_id: i + 1, y_offset, max_rows: span, cells });
        }
        return { ok: true, reels };
      }
      function classifySelectionAsMain() {
        const res = cellsToReels(selectedCells.value);
        if (!res.ok) { emit('status', { type: 'warn', msg: res.error }); return; }
        const next = res.reels.length;
        if (layout.length > 0 && !confirm(
          `把框選的格子設為主輪會「重建」整個主盤:\n\n  目前:${layout.length} 個 Reel\n  重建後:${next} 個 Reel\n\n` +
          `04/05/08 權重以 Reel 編號保留;缺的補 0、多的空著(同套用範本)。\n\n確定嗎?`)) return;
        const rows = res.reels.map(r => ({ ...makeReel(r.reel_id), reel_id: r.reel_id, y_offset: r.y_offset, max_rows: r.max_rows, cells: Array.isArray(r.cells) ? r.cells.slice() : null }));
        layout.splice(0, layout.length, ...rows);   // 同 applyLayoutPreset:splice 保 reactivity
        activeReelIdx.value = 0;
        selectedReelIdxs.value = [];
        clearCellSelection();
        syncGameSpec('classifyMain');               // 連動層:輪數 → registry → 符號頁 reel_limit
        emit('status', { type: 'ok', msg: `已重建主盤:${next} 個 Reel（R1…R${next}）` });
      }

      // ── v7.x:畫格編輯畫布(自成座標;「套用到盤面」時才轉成 layout[]+panels[]) ──
      const cvMode = ref('pan');                 // v7.x:預設「移動」工具(不會手滑作畫;選筆刷才開始編輯)。'main'|'sub'|'stage' 分類筆刷 | 'erase' 橡皮擦 | 'pan' 平移
      const boardHints = ref(true);              // Board v2 §6.5:說明示意開關(非直覺工具 hover 小卡總開關)
      const cvMain = ref([]);                    // 主輪格 "col,row"
      const cvSub = ref([]);                     // 副輪格 "col,row"(套用時依連通區塊分群成多塊 SCROLL 面板)
      const cvStage = ref([]);                   // 演出格 "col,row"(同上 → STAGE 面板)
      const cvRubber = ref(null);                // 拖拉預覽框 {c0,r0,c1,r1}
      let _cvDown = false, _cvStart = null, _cvCur = null;
      let _cvPD = { on: false, panelIdx: -1, startC: 0, startR: 0 };  // Board v2 P3d:canvas 副盤拖曳(僅非 dirty)
      const cvPDrag = ref(null);   // 拖曳預覽 { panelIdx, dc, dr }(null = 未拖曳)
      function _cvHas(a, k) { return a.indexOf(k) >= 0; }
      function _cvAdd(a, k) { if (a.indexOf(k) < 0) a.push(k); }
      function _cvDel(a, k) { const i = a.indexOf(k); if (i >= 0) a.splice(i, 1); }
      function _cvClearCell(k) { _cvDel(cvMain.value, k); _cvDel(cvSub.value, k); _cvDel(cvStage.value, k); }
      // v7.x:盤面外接範圍(欄寬/列高)= 主輪 ∪ 副輪 ∪ 演出 的最大 col/row + 1
      function _cvExtent() {
        let w = 0, h = 0;
        const bump = (k) => { const c = +k.split(',')[0] + 1, r = +k.split(',')[1] + 1; if (c > w) w = c; if (r > h) h = r; };
        cvMain.value.forEach(bump); cvSub.value.forEach(bump); cvStage.value.forEach(bump);
        return { w, h };
      }
      // v7.x:固定畫布(預覽=編輯同尺寸);格數 = max(預設基準, 盤面外接範圍+1 邊),載入大盤自動長大
      // v7.x:固定 20×20 邏輯畫布(不隨繪製長大;盤面置中其中、四周為可平移的空格)。
      // 格子大小(px)在載入/置中時依「盤面 + 四周各 1.5 格」自動 fit 出來 → 小盤面格子大、聚焦;大盤面自動縮以容納。
      const CV_MAP = 20, CV_MIN_W = 5, CV_MIN_H = 4;   // CV_MIN_*:空盤時的框景基準
      const CV_VIEW_MARGIN = 3;                        // 框景時盤面四周各留 1.5 格(共 3)
      const CV_GAP = 4, CELL_MIN = 28, CELL_MAX = 84;  // CV_GAP 須與 .cfg-cv-grid 的 gap 一致
      const cvCols = ref(CV_MAP);
      const cvRows = ref(CV_MAP);
      const cvCell = ref(52);                          // 每格 px(由 cvFitView 算出)
      const cvStageRef = ref(null);              // 畫布視窗 DOM(平移/置中用)
      const _cvPan = { on: false, el: null, x: 0, y: 0 };
      // v7.x:基準快照(= 目前盤面鏡像)。載入/套用後刷新;用來判定「髒」(未套用)與逐格「剛編輯」標記
      const cvMainBase = ref([]), cvSubBase = ref([]), cvStageBase = ref([]);
      function _cvSetEq(a, b) { if (a.length !== b.length) return false; const s = new Set(a); for (const k of b) if (!s.has(k)) return false; return true; }
      // 畫布相對基準是否有未套用變更(對稱差集非空)。乾淨→自動鏡像盤面;髒→停止回灌、保留草稿
      const cvDirty = computed(() =>
        !_cvSetEq(cvMain.value, cvMainBase.value) ||
        !_cvSetEq(cvSub.value, cvSubBase.value) ||
        !_cvSetEq(cvStage.value, cvStageBase.value)
      );
      // 相對基準「分類有變」的格 → 變更類型:'add'(現在有東西:新畫或改類) / 'del'(被清掉、現在是空格)
      const cvEditedSet = computed(() => {
        const curMain = new Set(cvMain.value), curSub = new Set(cvSub.value), curStage = new Set(cvStage.value);
        const baMain = new Set(cvMainBase.value), baSub = new Set(cvSubBase.value), baStage = new Set(cvStageBase.value);
        const clsCur = (k) => curMain.has(k) ? 'm' : curSub.has(k) ? 's' : curStage.has(k) ? 'g' : '';
        const clsBa = (k) => baMain.has(k) ? 'm' : baSub.has(k) ? 's' : baStage.has(k) ? 'g' : '';
        const out = new Map();
        const all = new Set([...cvMain.value, ...cvSub.value, ...cvStage.value, ...cvMainBase.value, ...cvSubBase.value, ...cvStageBase.value]);
        for (const k of all) { const c = clsCur(k); if (c !== clsBa(k)) out.set(k, c ? 'add' : 'del'); }
        return out;
      });
      // v7.x N3/U4:未套用變更的 add/del 計數(供畫布角落圖例總覽;由 cvEditedSet 派生,輕量)
      const cvEditCount = computed(() => {
        let add = 0, del = 0;
        cvEditedSet.value.forEach(v => { if (v === 'del') del++; else add++; });
        return { add, del };
      });
      // v7.x E1:拖拉橡皮筋獨立成 Set，與 cvGrid 解耦 —— 拖拉(cvCellEnter 高頻)時只重算這個小 Set，
      // 不再讓 400 格的 cvGrid 陣列整個重建。模板對每格的 rubber class 直接查此 Set(O(1))。
      const cvRubberSet = computed(() => {
        const rb = cvRubber.value;
        if (!rb) return null;
        const s = new Set();
        for (let r = rb.r0; r <= rb.r1; r++) for (let c = rb.c0; c <= rb.c1; c++) s.add(c + ',' + r);
        return s;
      });
      // v7.x（C / 路線圖）:R 欄標籤 —— 標在統一網格上方,跟著盤面欄浮動。
      //   主輪各欄(由左到右)= R1、R2…,與 cellsToReels 的 reel_id 指派完全一致
      //   (reel_id = 已佔用主輪欄由小到大的排名)。空欄 / 非主輪欄 → 無標籤。
      //   隨畫布水平平移(置於可捲動 stage 內、與 grid 同欄寬),符合「跟盤面欄浮動」方案。
      const cvColLabels = computed(() => {
        const cols = cvCols.value;
        const labels = new Array(cols).fill('');
        // 取主輪佔用的欄,由小到大排名 → R{rank}
        const occupied = [...new Set(cvMain.value.map(k => +k.split(',')[0]))]
          .filter(c => c >= 0 && c < cols)
          .sort((a, b) => a - b);
        occupied.forEach((c, i) => { labels[c] = 'R' + (i + 1); });
        return labels;
      });
      const cvSelCell = ref(null);   // Board v2 §7.3:雙擊選中的單格 { key, col, row, reel }
      // 架構檢閱 #3:畫布鍵盤導覽的焦點格({col,row});方向鍵移動、Enter/Space 套用當前工具。
      // 獨立成輕量 ref + cvFocusKey computed(仿 cvRubberSet 的作法),不進 cvGrid(400 格陣列)本體,
      // 避免每次移動焦點都重算整個 cvGrid。
      const cvFocusCell = ref({ col: 0, row: 0 });
      const cvFocusKey = computed(() => cvFocusCell.value.col + ',' + cvFocusCell.value.row);
      const cvSubOwner = ref(new Map());   // Board v2 P3a:canvas sub 格 key → 所屬 panel index(cvLoadFromBoard 建)
      const cvSelCols = computed(() => {
        const usedCols = [...new Set(cvMain.value.map(k => Number(String(k).split(',')[0])))].sort((a, b) => a - b);
        const idxs = selectedReelIdxs.value.length ? selectedReelIdxs.value : [activeReelIdx.value];
        const cols = new Set();
        idxs.forEach(i => { if (i >= 0 && i < usedCols.length) cols.add(usedCols[i]); });
        return cols;
      });
      const cvSelCellInMain = computed(() => cvSelCell.value ? cvMain.value.includes(cvSelCell.value.key) : false);
      const cvPDragCells = computed(() => {
        const d = cvPDrag.value; if (!d) return null;
        const keys = new Set(); let collide = false;
        cvSubOwner.value.forEach((owner, key) => {
          if (owner !== d.panelIdx) return;
          const tk = (+key.split(',')[0] + d.dc) + ',' + (+key.split(',')[1] + d.dr);
          keys.add(tk);
          if (cvMain.value.includes(tk)) collide = true;
          const o = cvSubOwner.value.get(tk); if (o != null && o !== d.panelIdx) collide = true;
        });
        return { keys, collide };
      });
      const cvGrid = computed(() => {
        const mainSet = new Set(cvMain.value);
        const subSet = new Set(cvSub.value);
        const stageSet = new Set(cvStage.value);
        const editMap = cvEditedSet.value;
        const badSet = cvMainInvalid.value;
        const pdrag = cvPDragCells.value;
        const fltSet = cvFltSet.value;   // #2 機制篩選高亮集（forward-ref;computed 於 render 才求值）
        const stateSet = cvStateSet.value;   // G-2:有 State_Type 的錨點格集合(常駐徽章;forward-ref)
        const out = [];
        const COLS = cvCols.value, ROWS = cvRows.value;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const k = c + ',' + r;
          let cls = '';
          if (mainSet.has(k)) cls = 'main';
          else if (subSet.has(k)) cls = 'sub';
          else if (stageSet.has(k)) cls = 'stage';
          out.push({ key: k, col: c, row: r, cls, editKind: editMap.get(k) || '', invalid: badSet.has(k), sel: (cls === 'main' && cvSelCols.value.has(c)), cellSel: (cvSelCell.value && cvSelCell.value.key === k), pcellSel: (cls === 'sub' && activePanelIdx.value >= 0 && cvSubOwner.value.get(k) === activePanelIdx.value), dragT: (pdrag && pdrag.keys.has(k)) ? (pdrag.collide ? 'bad' : 'ok') : '', flt: fltSet.has(k), state: stateSet.has(k) });
        }
        return out;
      });
      // v7.5-Layer C:主輪「斷欄」的問題格集合(套用前即時標記)。
      //   欄內挖洞已合法(改用 cells mask),不再標記;只剩「欄與欄之間有空欄」視為非法。
      const cvMainInvalid = computed(() => {
        const bad = new Set();
        if (!cvMain.value.length) return bad;
        const byCol = new Map();
        for (const k of cvMain.value) { const c = +k.split(',')[0], r = +k.split(',')[1]; if (!byCol.has(c)) byCol.set(c, []); byCol.get(c).push(r); }
        const cols = [...byCol.keys()].sort((a, b) => a - b);
        // 斷欄:缺號欄的「兩側相鄰欄」標記(提示這裡斷開了)
        for (let i = 1; i < cols.length; i++) {
          if (cols[i] !== cols[i - 1] + 1) {
            byCol.get(cols[i - 1]).forEach(r => bad.add(cols[i - 1] + ',' + r));
            byCol.get(cols[i]).forEach(r => bad.add(cols[i] + ',' + r));
          }
        }
        return bad;
      });
      // v7.x:把一組格依「上下左右相連」分成多個連通區塊(每塊 → 一塊面板)
      function _cvComponents(cells) {
        const set = new Set(cells), seen = new Set(), comps = [];
        for (const start of cells) {
          if (seen.has(start)) continue;
          const stack = [start], comp = []; seen.add(start);
          while (stack.length) {
            const cur = stack.pop(); comp.push(cur);
            const c = +cur.split(',')[0], r = +cur.split(',')[1];
            [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].forEach((nbr) => {
              const nk = nbr[0] + ',' + nbr[1];
              if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
            });
          }
          comps.push(comp);
        }
        return comps;
      }
      // 預覽:把目前 cvSub/cvStage 即時解析成面板清單(套用前鏡像)
      function _cvRect(a, b) { return { c0: Math.min(a.col, b.col), r0: Math.min(a.row, b.row), c1: Math.max(a.col, b.col), r1: Math.max(a.row, b.row) }; }
      function _cvCellsInRect(rc) { const out = []; for (let r = rc.r0; r <= rc.r1; r++) for (let c = rc.c0; c <= rc.c1; c++) out.push(c + ',' + r); return out; }
      function cvCellDown(cell, ev) {
        if (ev && ev.button !== 0) return;       // 只左鍵作畫/選取
        if (cvMode.value === 'pan') return;      // 移動工具:左鍵交給 stage 平移,不作畫
        // Board v2 P3d:箭頭 + 副盤格 + 非 dirty → 起手副盤拖曳(零位移放開＝選取);其餘走既有 rubber
        if (cvMode.value === 'select' && cell.cls === 'sub' && !cvDirty.value) {
          const o = cvSubOwner.value.get(cell.key);
          if (o != null && o >= 0 && o < panels.length) {
            _cvPD = { on: true, panelIdx: o, startC: cell.col, startR: cell.row };
            cvPDrag.value = { panelIdx: o, dc: 0, dr: 0 };
            return;
          }
        }
        _cvDown = true; _cvStart = { col: cell.col, row: cell.row }; _cvCur = _cvStart;
        cvRubber.value = _cvRect(_cvStart, _cvCur);
      }
      function cvCellEnter(cell) {
        if (!_cvDown) return;
        _cvCur = { col: cell.col, row: cell.row };
        cvRubber.value = _cvRect(_cvStart, _cvCur);
      }
      // v7.x E2:事件委派 —— grid 容器單一 pointermove，用格距(cvCell+gap)數學換算 col/row，
      // 取代 400 個 per-cell @pointerenter。只在「跨到新的一格」時才更新 rubber，避免每像素重算。
      let _cvGridEl = null;
      function cvGridMove(ev) {
        if (_cvPD.on) {
          const el = ev.currentTarget || _cvGridEl; if (!el) return;
          const rect = el.getBoundingClientRect();
          const step = cvCell.value + CV_GAP;
          const c = Math.max(0, Math.min(cvCols.value - 1, Math.floor((ev.clientX - rect.left) / step)));
          const r = Math.max(0, Math.min(cvRows.value - 1, Math.floor((ev.clientY - rect.top) / step)));
          const dc = c - _cvPD.startC, dr = r - _cvPD.startR;
          const cur = cvPDrag.value;
          if (!cur || cur.dc !== dc || cur.dr !== dr) cvPDrag.value = { panelIdx: _cvPD.panelIdx, dc, dr };
          return;
        }
        if (!_cvDown) return;
        const el = ev.currentTarget || _cvGridEl;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const step = cvCell.value + CV_GAP;
        let c = Math.floor((ev.clientX - rect.left) / step);
        let r = Math.floor((ev.clientY - rect.top) / step);
        c = Math.max(0, Math.min(cvCols.value - 1, c));
        r = Math.max(0, Math.min(cvRows.value - 1, r));
        if (_cvCur && _cvCur.col === c && _cvCur.row === r) return;  // 同格不重算
        _cvCur = { col: c, row: r };
        cvRubber.value = _cvRect(_cvStart, _cvCur);
      }
      function cvUp() {
        if (_cvPD.on) { _cvFinishPanelDrag(); return; }
        if (!_cvDown) return;
        _cvDown = false;
        const rc = cvRubber.value; cvRubber.value = null;
        if (!rc || !_cvStart) { _cvStart = _cvCur = null; return; }
        const single = (rc.c0 === rc.c1 && rc.r0 === rc.r1);
        const keys = _cvCellsInRect(rc);
        const m = cvMode.value;
        if (m === 'select') {
          // Board v2 §6.1:單擊格 → 選該格所屬整輪(canvas 欄 → layout reel);拖曳(框選)留 P2
          if (single) {
            cvSelCell.value = null;
            const key = rc.c0 + ',' + rc.r0;
            const pOwner = cvSubOwner.value.get(key);
            if (pOwner != null && pOwner >= 0 && pOwner < panels.length) {
              activePanelIdx.value = pOwner;
              selectedReelIdxs.value = [];
              emit('status', { type: 'ok', msg: `已選副盤 ${panels[pOwner].panel_id} — 於副盤設定調整型別 / 位置 / 遮罩` });
            } else {
              const col = rc.c0;
              const usedCols = [...new Set(cvMain.value.map(k => Number(String(k).split(',')[0])))].sort((a, b) => a - b);
              const idx = usedCols.indexOf(col);
              if (idx >= 0 && idx < layout.length) {
                activeReelIdx.value = idx;
                activePanelIdx.value = -1;
                selectedReelIdxs.value = [];
                emit('status', { type: 'ok', msg: `已選第 ${idx + 1} 輪(R${idx + 1})— 於整輪設定調整進場 / 列數 / 副輪類型` });
              } else {
                activePanelIdx.value = -1;
                emit('status', { type: 'info', msg: '此格非主輪 / 副盤格或尚未套用;單擊格可選整輪 / 副盤' });
              }
            }
          }
        } else if (m === 'marquee') {
          // Board v2 §6.2:框選 → 多選涵蓋的整輪(canvas 欄 → layout reel)→ 復用群組編輯
          cvSelCell.value = null;
          const usedCols = [...new Set(cvMain.value.map(k => Number(String(k).split(',')[0])))].sort((a, b) => a - b);
          const picked = [];
          for (let c = rc.c0; c <= rc.c1; c++) {
            const idx = usedCols.indexOf(c);
            if (idx >= 0 && idx < layout.length && !picked.includes(idx)) picked.push(idx);
          }
          picked.sort((a, b) => a - b);
          if (!picked.length) {
            emit('status', { type: 'info', msg: '框選範圍內無主輪格' });
          } else if (picked.length === 1) {
            activeReelIdx.value = picked[0]; activePanelIdx.value = -1; selectedReelIdxs.value = [];
            emit('status', { type: 'ok', msg: `已選第 ${picked[0] + 1} 輪(R${picked[0] + 1})` });
          } else {
            activeReelIdx.value = picked[0]; activePanelIdx.value = -1; selectedReelIdxs.value = picked;
            emit('status', { type: 'ok', msg: `框選 ${picked.length} 輪 — 於群組編輯批次調整列數 / 偏移 / 副輪` });
          }
        } else if (activePanelIdx.value >= 0 && activePanelIdx.value < panels.length && (m === 'add' || m === 'cancel')) {
          // Board v2 P3b（甲）:選中副盤時,＋/取消 就地雕該副盤的 sub 遮罩(套用後 cellsToPanelGeom → Cells）
          const pid = panels[activePanelIdx.value].panel_id;
          if (m === 'add') {
            let n = 0;
            keys.forEach(k => { if (!cvMain.value.includes(k) && !cvStage.value.includes(k) && !cvSub.value.includes(k)) { _cvClearCell(k); _cvAdd(cvSub.value, k); n++; } });
            emit('status', n ? { type: 'ok', msg: `已加 ${n} 格到副盤 ${pid}（套用後相鄰者併入此盤;不相鄰會另成一塊）` } : { type: 'info', msg: '＋只在空白處加副盤格' });
          } else {
            let n = 0;
            keys.forEach(k => { if (cvSub.value.includes(k)) { _cvDel(cvSub.value, k); n++; } });
            emit('status', n ? { type: 'ok', msg: `已挖空 ${n} 格（副盤 ${pid};套用後成遮罩）` } : { type: 'info', msg: '取消挖空只作用在副盤格' });
          }
        } else if (m === 'cancel') {
          // Board v2 取消 / 還原:主輪格 toggle(移除＝Layer C 洞遮罩;再點＝還原)
          keys.forEach(k => {
            if (_cvHas(cvMain.value, k)) _cvDel(cvMain.value, k);
            else { _cvClearCell(k); _cvAdd(cvMain.value, k); }
          });
        } else {
          // 'add'（＋新增）:點一格或拖拉皆塗成主輪格(舊 main/sub/stage 筆已於 P3e 撤除)
          const target = cvMain.value;
          keys.forEach(k => { if (!_cvHas(target, k)) { _cvClearCell(k); _cvAdd(target, k); } });
        }
        _cvStart = _cvCur = null;
      }
      // Board v2 P3d:收尾副盤拖曳 —— 碰撞(疊主輪 / 疊別的副盤)取消彈回;否則位移已套用 panel(watcher 重同步);零位移＝選取
      function _cvFinishPanelDrag() {
        const pd = _cvPD; const drag = cvPDrag.value;
        _cvPD = { on: false, panelIdx: -1, startC: 0, startR: 0 }; cvPDrag.value = null;
        if (pd.panelIdx < 0 || pd.panelIdx >= panels.length) return;
        if (!drag || (drag.dc === 0 && drag.dr === 0)) {
          activePanelIdx.value = pd.panelIdx; selectedReelIdxs.value = [];
          emit('status', { type: 'ok', msg: `已選副盤 ${panels[pd.panelIdx].panel_id}` });
          return;
        }
        let collide = false;
        cvSubOwner.value.forEach((owner, key) => {
          if (owner !== pd.panelIdx) return;
          const tk = (+key.split(',')[0] + drag.dc) + ',' + (+key.split(',')[1] + drag.dr);
          if (cvMain.value.includes(tk)) collide = true;
          const o = cvSubOwner.value.get(tk); if (o != null && o !== pd.panelIdx) collide = true;
        });
        if (collide) { emit('status', { type: 'warn', msg: `移動取消:副盤 ${panels[pd.panelIdx].panel_id} 會與主輪或其他副盤重疊` }); return; }
        const p = panels[pd.panelIdx];
        p.col = (Number(p.col) || 0) + drag.dc;
        p.row = (Number(p.row) || 0) + drag.dr;
        emit('status', { type: 'ok', msg: `已移動副盤 ${p.panel_id} 到 (${p.col}, ${p.row})` });
      }
      // v7.x:中鍵拖曳平移畫布(原生捲動為底、此為加分快捷);左鍵交給格子作畫
      function cvPanStart(ev) { if (!ev) return; const ok = ev.button === 1 || (ev.button === 0 && cvMode.value === 'pan'); if (!ok) return; _cvPan.on = true; _cvPan.el = ev.currentTarget; _cvPan.x = ev.clientX; _cvPan.y = ev.clientY; ev.preventDefault(); }
      function cvPanMove(ev) { if (!_cvPan.on || !_cvPan.el) return; _cvPan.el.scrollLeft -= (ev.clientX - _cvPan.x); _cvPan.el.scrollTop -= (ev.clientY - _cvPan.y); _cvPan.x = ev.clientX; _cvPan.y = ev.clientY; }
      function cvPanEnd() { _cvPan.on = false; _cvPan.el = null; }
      function cvStageUp() { cvUp(); cvPanEnd(); }   // 同時收尾作畫與平移
      // 目前畫布上所有已分類格的外接框(畫布座標);無格時回 null
      function _cvBoardBBox() {
        let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
        const all = [...cvMain.value, ...cvSub.value, ...cvStage.value];
        if (!all.length) return null;
        all.forEach(k => { const c = +k.split(',')[0], r = +k.split(',')[1]; if (c < minC) minC = c; if (c > maxC) maxC = c; if (r < minR) minR = r; if (r > maxR) maxR = r; });
        return { minC, maxC, minR, maxR, bw: maxC - minC + 1, bh: maxR - minR + 1 };
      }
      // 置中視圖 = 依「盤面 + 四周各 1.5 格」算出格子大小,再把盤面捲到視窗中央。
      // 因為邏輯網格固定 20×20 大於框景範圍,視窗邊緣會切到外圈格 → 自然透露「畫布還有空間,可平移」。
      function cvResetView(tries) {
        tries = tries || 0;
        const el = cvStageRef.value;
        if (!el || el.clientWidth <= 0 || el.clientHeight <= 0) {
          if (tries < 30 && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => cvResetView(tries + 1));
          return;
        }
        const bb = _cvBoardBBox();
        const bw = bb ? bb.bw : CV_MIN_W, bh = bb ? bb.bh : CV_MIN_H;
        const pad = 12;                                   // .cfg-cv-stage 左右/上下 padding 合計約略值
        const fitW = bw + CV_VIEW_MARGIN, fitH = bh + CV_VIEW_MARGIN;
        const cellW = (el.clientWidth - pad - (fitW - 1) * CV_GAP) / fitW;
        const cellH = (el.clientHeight - pad - (fitH - 1) * CV_GAP) / fitH;
        cvCell.value = Math.round(Math.max(CELL_MIN, Math.min(CELL_MAX, Math.min(cellW, cellH))));
        // 捲動到盤面外接框中心(無盤面則回網格中心)
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => {
          const pitch = cvCell.value + CV_GAP;
          const cx = bb ? (bb.minC + bb.bw / 2) : (CV_MAP / 2);
          const cy = bb ? (bb.minR + bb.bh / 2) : (CV_MAP / 2);
          el.scrollTo({ left: cx * pitch - el.clientWidth / 2, top: cy * pitch - el.clientHeight / 2, behavior: tries > 0 ? 'auto' : 'smooth' });
        });
      }
      function cvSetMode(m) { cvMode.value = m; cvSelCell.value = null; }
      // ════════════════════════════════════════════════════════
      //  架構檢閱 #3:畫布鍵盤導覽
      //  方向鍵移動焦點格 → Enter/Space 對焦點格套用當前工具(等同左鍵單擊該格,
      //  重用 cvUp() 既有的 select/marquee/add/cancel 分支,零邏輯分裂)。
      //  數字鍵 1–5 對應工具列由左到右順序(箭頭/框選/新增/取消/移動)。
      // ════════════════════════════════════════════════════════
      const CV_TOOL_KEYS = { '1': 'select', '2': 'marquee', '3': 'add', '4': 'cancel', '5': 'pan' };
      function _cvClampFocus(col, row) {
        return {
          col: Math.max(0, Math.min(cvCols.value - 1, col)),
          row: Math.max(0, Math.min(cvRows.value - 1, row)),
        };
      }
      // 焦點格捲出可視範圍時,把畫布捲動到剛好露出該格(不像 cvResetView 整體置中,只做最小捲動)
      function _cvScrollFocusIntoView() {
        try {
          const el = cvStageRef.value;
          if (!el) return;
          const { col, row } = cvFocusCell.value;
          const step = cvCell.value + CV_GAP;
          const x = col * step, y = row * step;
          if (x < el.scrollLeft) el.scrollLeft = x - CV_GAP;
          else if (x + cvCell.value > el.scrollLeft + el.clientWidth) el.scrollLeft = x + cvCell.value - el.clientWidth + CV_GAP;
          if (y < el.scrollTop) el.scrollTop = y - CV_GAP;
          else if (y + cvCell.value > el.scrollTop + el.clientHeight) el.scrollTop = y + cvCell.value - el.clientHeight + CV_GAP;
        } catch (e) { /* no-op */ }
      }
      // Enter/Space:對焦點格模擬一次「單擊放開」(_cvDown 為本函式作用域內的既有拖曳旗標,
      // 與滑鼠路徑共用同一段 cvUp() 判斷邏輯,鍵盤 / 滑鼠行為保證一致、不會分岔維護)。
      function cvActivateFocusCell() {
        if (cvMode.value === 'pan') {
          emit('status', { type: 'info', msg: '移動工具沒有編輯動作;按 1–4 切換箭頭/框選/新增/取消' });
          return;
        }
        const cell = cvFocusCell.value;
        _cvDown = true;
        _cvStart = { col: cell.col, row: cell.row };
        _cvCur = _cvStart;
        cvRubber.value = _cvRect(_cvStart, _cvCur);
        cvUp();
      }
      // 畫布取得鍵盤焦點時(如 Tab 進來或點擊空白處),把焦點格重置到目前盤面外接框中心,
      // 避免使用者一開始就要從畫布左上角(0,0)一路按方向鍵才能走到盤面上。
      function cvFocusInit() {
        const bb = _cvBoardBBox();
        const col = bb ? Math.round(bb.minC + bb.bw / 2) : Math.floor(cvCols.value / 2);
        const row = bb ? Math.round(bb.minR + bb.bh / 2) : Math.floor(cvRows.value / 2);
        cvFocusCell.value = _cvClampFocus(col, row);
      }
      function cvKeydown(ev) {
        if (ev.altKey || ev.ctrlKey || ev.metaKey) return;   // 讓瀏覽器/其他快捷鍵正常運作
        const tool = CV_TOOL_KEYS[ev.key];
        if (tool) { ev.preventDefault(); cvSetMode(tool); return; }
        const delta = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[ev.key];
        if (delta) {
          ev.preventDefault();
          const cur = cvFocusCell.value;
          cvFocusCell.value = _cvClampFocus(cur.col + delta[0], cur.row + delta[1]);
          _cvScrollFocusIntoView();
          return;
        }
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); cvActivateFocusCell(); return; }
        if (ev.key === 'Escape') { ev.preventDefault(); cvSelCell.value = null; cvSetMode('select'); return; }
      }
      // Board v2 §7.3:雙擊主輪格 → 開單格卡(僅箭頭工具下;顯示所屬輪 / 座標 + 前往規則 + 取消格開關)
      function cvCellDbl(cell) {
        if (cvMode.value !== 'select') return;
        if (cell.cls !== 'main') { emit('status', { type: 'info', msg: '雙擊主輪格可檢視 / 設定單格' }); return; }
        const usedCols = [...new Set(cvMain.value.map(k => Number(String(k).split(',')[0])))].sort((a, b) => a - b);
        const ridx = usedCols.indexOf(cell.col);
        const reelId = (ridx >= 0 && ridx < layout.length) ? layout[ridx].reel_id : (cell.col + 1);
        if (ridx >= 0 && ridx < layout.length) { activeReelIdx.value = ridx; activePanelIdx.value = -1; selectedReelIdxs.value = []; }
        cvSelCell.value = { key: cell.key, col: cell.col, row: cell.row, reel: reelId };
        emit('status', { type: 'ok', msg: `單格 R${reelId} · 第 ${cell.row + 1} 列` });
      }
      function cvSelCellToggleHole() {
        const sc = cvSelCell.value; if (!sc) return;
        if (cvMain.value.includes(sc.key)) { _cvDel(cvMain.value, sc.key); emit('status', { type: 'ok', msg: `已取消此格(R${sc.reel} 第 ${sc.row + 1} 列)— 套用後成洞` }); }
        else { _cvClearCell(sc.key); _cvAdd(cvMain.value, sc.key); emit('status', { type: 'ok', msg: `已還原此格(R${sc.reel} 第 ${sc.row + 1} 列)` }); }
      }
      function cvCloseCellCard() { cvSelCell.value = null; }
      // ── Board v2 P3c:canvas 右鍵選單(依命中對象:主輪格 / 副盤格 / 空白）──
      const cvCtx = reactive({ open: false, x: 0, y: 0, kind: 'empty', reelIdx: -1, panelIdx: -1, reelId: 0, panelId: '', key: '', row: 0, col: 0 });
      function _cvCtxOutside(ev) { const el = document.querySelector('.cfg-cv-ctx'); if (el && el.contains(ev.target)) return; cvCtxClose(); }
      function _cvCtxKey(ev) { if (ev.key === 'Escape') cvCtxClose(); }
      function cvCtxClose() { cvCtx.open = false; document.removeEventListener('pointerdown', _cvCtxOutside, true); document.removeEventListener('keydown', _cvCtxKey, true); }
      function cvContextMenu(ev) {
        const gridEl = document.querySelector('.cfg-cv-grid');
        if (!gridEl) return;
        const rect = gridEl.getBoundingClientRect();
        const step = cvCell.value + CV_GAP;
        const c = Math.floor((ev.clientX - rect.left) / step);
        const r = Math.floor((ev.clientY - rect.top) / step);
        let kind = 'empty', reelIdx = -1, panelIdx = -1, key = '';
        if (c >= 0 && c < cvCols.value && r >= 0 && r < cvRows.value) {
          key = c + ',' + r;
          if (cvMain.value.includes(key)) {
            kind = 'main';
            const usedCols = [...new Set(cvMain.value.map(k => Number(String(k).split(',')[0])))].sort((a, b) => a - b);
            reelIdx = usedCols.indexOf(c);
          } else if (cvSub.value.includes(key)) {
            kind = 'sub';
            const o = cvSubOwner.value.get(key);
            if (o != null) panelIdx = o;
          }
        }
        cvCtx.kind = kind; cvCtx.reelIdx = reelIdx; cvCtx.panelIdx = panelIdx; cvCtx.key = key; cvCtx.col = c; cvCtx.row = r;
        cvCtx.reelId = (reelIdx >= 0 && reelIdx < layout.length) ? layout[reelIdx].reel_id : 0;
        cvCtx.panelId = (panelIdx >= 0 && panelIdx < panels.length) ? panels[panelIdx].panel_id : '';
        cvCtx.x = ev.clientX; cvCtx.y = ev.clientY; cvCtx.open = true;
        Vue.nextTick(() => {
          const el = document.querySelector('.cfg-cv-ctx'); if (!el) return;
          const p = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, PAD = 8;
          if (cvCtx.x + p.width > vw - PAD) cvCtx.x = Math.max(PAD, vw - p.width - PAD);
          if (cvCtx.y + p.height > vh - PAD) cvCtx.y = Math.max(PAD, vh - p.height - PAD);
        });
        document.addEventListener('pointerdown', _cvCtxOutside, true);
        document.addEventListener('keydown', _cvCtxKey, true);
      }
      function cvCtxSelReel() { if (cvCtx.reelIdx >= 0 && cvCtx.reelIdx < layout.length) { activeReelIdx.value = cvCtx.reelIdx; activePanelIdx.value = -1; selectedReelIdxs.value = []; } cvCtxClose(); }
      function cvCtxCancelCell() { const k = cvCtx.key; if (k) { if (_cvHas(cvMain.value, k)) _cvDel(cvMain.value, k); else { _cvClearCell(k); _cvAdd(cvMain.value, k); } } cvCtxClose(); }
      function cvCtxSelPanel() { if (cvCtx.panelIdx >= 0) { activePanelIdx.value = cvCtx.panelIdx; selectedReelIdxs.value = []; } cvCtxClose(); }
      function cvCtxPanelType(t) {
        const i = cvCtx.panelIdx;
        if (cvDirty.value) { cvCtxClose(); emit('status', { type: 'info', msg: '畫布有未套用編輯;先套用或捨棄再改副盤型別' }); return; }
        if (i >= 0 && i < panels.length) { panels[i].panel_type = t; panels[i].scroll = (t === 'SCROLL'); emit('status', { type: 'ok', msg: `副盤 ${panels[i].panel_id} 型別 → ${t}` }); }
        cvCtxClose();
      }
      function cvCtxDelPanel() { const i = cvCtx.panelIdx; if (cvDirty.value) { cvCtxClose(); emit('status', { type: 'info', msg: '畫布有未套用編輯;先套用或捨棄再刪除副盤' }); return; } cvCtxClose(); if (i >= 0) removePanel(i); }
      function cvCtxAddPanel() { cvCtxClose(); if (!cvDirty.value) addPanel(); else emit('status', { type: 'info', msg: '畫布有未套用編輯;先套用或捨棄再新增副盤' }); }
      function cvCtxAddTrack() { cvCtxClose(); addTrack(); emit('status', { type: 'ok', msg: `已新增軌道 ${tracks[tracks.length - 1].track_id} — 於下方「軌道 02c_Tracks」區編輯座標序列與預覽` }); }
      function cvCtxGoRules() { cvCtxClose(); navTo('rules'); }
      function cvClear() { cvMain.value = []; cvSub.value = []; cvStage.value = []; emit('status', { type: 'ok', msg: '已清空畫布(尚未套用;按「套用到盤面」生效、或「捨棄」還原)' }); }
      function cvLoadFromBoard(silent) {
        let minTop = 0;
        layout.forEach(r => { if ((r.y_offset || 0) < minTop) minTop = r.y_offset || 0; });
        panels.forEach(p => { if ((p.row || 0) < minTop) minTop = p.row || 0; });
        const main0 = [];
        layout.forEach((r, idx) => {
          // v7.5-Layer C:主輪有 cells mask → 只展開遮罩內的 row(洞格不鏡像進畫布);無 → 實心展開。
          const yo = (r.y_offset || 0), mr = (r.max_rows || 1);
          let dys = null;
          if (Array.isArray(r.cells) && r.cells.length) {
            dys = [];
            for (const s of r.cells) {
              const m = /^(-?\d+),(-?\d+)$/.exec(String(s).trim());
              if (m && +m[1] === 0) { const dy = +m[2]; if (dy >= 0 && dy < mr) dys.push(dy); }
            }
          }
          if (dys) { dys.forEach(dy => main0.push(idx + ',' + (yo + dy - minTop))); }
          else { for (let i = 0; i < mr; i++) main0.push(idx + ',' + (yo + i - minTop)); }
        });
        const sub0 = [], stage0 = [], subOwn0 = [];
        panels.forEach((p, pi) => {
          const isStage = (p.panel_type === 'STAGE');
          panelCellSet(p).forEach(k => {
            const c = +k.split(',')[0], r = +k.split(',')[1] - minTop;
            if (isStage) { stage0.push(c + ',' + r); }
            else { sub0.push(c + ',' + r); subOwn0.push(pi); }
          });
        });
        // v7.x:固定 20×20 邏輯畫布;盤面置中其中(純視覺位移,cvCommit 重錨定回 col0/row0 而完全抵消)。
        // 僅當外部載入的盤面本身就 >20 才放大以免裁切;使用者繪製受限於已渲染的網格,不會把畫布撐大。
        let bw = 0, bh = 0;
        [...main0, ...sub0, ...stage0].forEach(k => { const c = +k.split(',')[0] + 1, r = +k.split(',')[1] + 1; if (c > bw) bw = c; if (r > bh) bh = r; });
        const cols = Math.max(CV_MAP, bw);
        const rows = Math.max(CV_MAP, bh);
        cvCols.value = cols; cvRows.value = rows;
        const offX = Math.max(0, Math.floor((cols - bw) / 2));
        const offY = Math.max(0, Math.floor((rows - bh) / 2));
        const shift = (arr) => arr.map(k => (+k.split(',')[0] + offX) + ',' + (+k.split(',')[1] + offY));
        cvMain.value = shift(main0);
        const _subShifted = shift(sub0);
        cvSub.value = _subShifted; cvStage.value = shift(stage0);
        const _own = new Map();
        _subShifted.forEach((k, i) => _own.set(k, subOwn0[i]));
        cvSubOwner.value = _own;
        // 刷新基準快照 → 此刻畫布「乾淨」(= 盤面鏡像);琥珀標記與套用鈕都歸位
        cvMainBase.value = cvMain.value.slice(); cvSubBase.value = cvSub.value.slice(); cvStageBase.value = cvStage.value.slice();
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => cvResetView());
        if (!silent) emit('status', { type: 'ok', msg: '已從目前盤面載入畫布' });
      }
      function cvDiscard() {
        if (!cvDirty.value) { emit('status', { type: 'ok', msg: '畫布已與盤面同步,沒有要捨棄的變更' }); return; }
        if (!confirm('捨棄畫布上尚未套用的編輯,並還原成目前盤面?')) return;
        cvLoadFromBoard(true);
        emit('status', { type: 'ok', msg: '已捨棄未套用的編輯' });
      }
      function cvCommit() {
        if (!cvDirty.value) { emit('status', { type: 'ok', msg: '畫布已與盤面同步,沒有要套用的變更' }); return; }
        if (!cvMain.value.length) { emit('status', { type: 'warn', msg: '畫布尚未設定主輪,無法套用' }); return; }
        const res = cellsToReels(cvMain.value);
        if (!res.ok) { emit('status', { type: 'warn', msg: res.error }); return; }
        // v7.x P5:套用前偵測「相鄰不同副盤被併成一塊」→ 先讓使用者確認(合併後參數以重疊最多者為準)
        const _prevByType = { SCROLL: [], STAGE: [] };
        panels.forEach(p => { const t = p.panel_type === 'STAGE' ? 'STAGE' : 'SCROLL'; _prevByType[t].push(panelCellSet(p)); });
        const _aCol0 = Math.min(...cvMain.value.map(k => +k.split(',')[0]));
        const _aRow0 = Math.min(...cvMain.value.map(k => +k.split(',')[1]));
        let _mergeHit = false;
        [['SCROLL', cvSub.value], ['STAGE', cvStage.value]].forEach((pair) => {
          _cvComponents(pair[1]).forEach((comp) => {
            const nset = new Set(comp.map(k => (+k.split(',')[0] - _aCol0) + ',' + (+k.split(',')[1] - _aRow0)));
            let overlapN = 0;
            _prevByType[pair[0]].forEach((set) => { let hit = false; set.forEach(k => { if (nset.has(k)) hit = true; }); if (hit) overlapN++; });
            if (overlapN >= 2) _mergeHit = true;
          });
        });
        if (_mergeHit && !confirm('偵測到相鄰的不同副盤會被合併為同一塊;合併後部分參數(如「參與連線」join_payline)將以重疊最多者為準。\n\n確定套用嗎?')) return;
        const aCol = Math.min(...cvMain.value.map(k => +k.split(',')[0]));
        const aRow = Math.min(...cvMain.value.map(k => +k.split(',')[1]));
        // v7.x:合併,不砍掉重建 — 以 reel_id 保留既有 Reel 的權重/副盤參數,只覆蓋幾何(y_offset/max_rows/cells)
        const rows = res.reels.map(r => {
          const prev = layout.find(x => x.reel_id === r.reel_id);
          return { ...makeReel(r.reel_id), ...(prev || {}), reel_id: r.reel_id, y_offset: r.y_offset, max_rows: r.max_rows, cells: Array.isArray(r.cells) ? r.cells.slice() : null };
        });
        // 既有面板的絕對格集(盤面座標),供幾何重疊比對保留設定
        const prevPanels = panels.map(p => ({ p, set: panelCellSet(p) }));
        layout.splice(0, layout.length, ...rows);
        const newPanels = []; let pid = 1;
        [['SCROLL', cvSub.value], ['STAGE', cvStage.value]].forEach((pair) => {
          const type = pair[0];
          _cvComponents(pair[1]).forEach((comp) => {
            const g = cellsToPanelGeom(comp);
            if (!g) return;
            // 新面板的絕對格集(重錨定回 col0/row0)
            const newSet = new Set(comp.map(k => (+k.split(',')[0] - aCol) + ',' + (+k.split(',')[1] - aRow)));
            // 找重疊最多、且同型的舊面板 → 沿用其參數(join_payline/symbol_set/trigger/note…)
            let best = null, bestN = 0;
            prevPanels.forEach(({ p, set }) => {
              if (p.panel_type !== type) return;
              let n = 0; set.forEach(k => { if (newSet.has(k)) n++; });
              if (n > bestN) { bestN = n; best = p; }
            });
            const inherited = best ? { symbol_set: best.symbol_set, inherit_weight: best.inherit_weight, join_payline: best.join_payline, trigger_symbol: best.trigger_symbol, trigger_reel: best.trigger_reel, collect_target_jp: best.collect_target_jp, note: best.note } : {};
            newPanels.push({ ...makePanel('P' + pid), ...inherited, col: g.col - aCol, row: g.row - aRow, width: g.width, height: g.height, cells: Array.isArray(g.cells) ? g.cells.slice() : null, panel_type: type, scroll: type === 'SCROLL' });
            pid++;
          });
        });
        panels.splice(0, panels.length, ...newPanels);
        activeReelIdx.value = 0; activePanelIdx.value = -1;
        syncGameSpec('cvCommit');
        cvLoadFromBoard(true);   // 以新盤面重載 → 刷新基準、重新置中、dirty 歸零
        emit('status', { type: 'ok', msg: `已套用畫布到盤面:${res.reels.length} 個 Reel · ${newPanels.length} 塊副盤` });
      }
      // v7.x:乾淨(= 盤面鏡像)時自動同步;進分頁/盤面變動皆重載。髒(有未套用編輯)時停止回灌、保留草稿
      watch([layout, panels], () => { if (!cvDirty.value) cvLoadFromBoard(true); }, { deep: true });
      cvLoadFromBoard(true);   // 初次載入
      watch(cvStageRef, (el) => { if (el && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => cvResetView(1)); });
      // v7.x:視窗縮放 → 重新 fit(僅在盤面結構分頁、且畫布已掛載時);150ms debounce
      let _cvResizeT = null;
      function _onWindowResizeForCanvas() {
        if (active.value !== 'layout' || !cvStageRef.value) return;
        if (_cvResizeT) clearTimeout(_cvResizeT);
        _cvResizeT = setTimeout(() => { _cvResizeT = null; cvResetView(1); }, 150);
      }
      function renamePanel(idx, newId) {
        if (idx < 0 || idx >= panels.length) return;
        const clean = String(newId || '').trim();
        if (!clean) return;
        if (panels.some((p, i) => i !== idx && p.panel_id === clean)) {
          emit('status', { type: 'err', msg: `Panel ID「${clean}」重複` });
          return;
        }
        // v4.8:避免與主輪數字 Reel_ID 撞名(04 以「純數字=主輪」定址)
        if (/^\d+$/.test(clean)) {
          emit('status', { type: 'err', msg: 'Panel ID 不可為純數字(會與主輪 Reel_ID 混淆),請加字母,如 P' + clean });
          return;
        }
        const oldId = panels[idx].panel_id;
        panels[idx].panel_id = clean;
        // v4.8:各模式 panel_weights key 跟著改名,權重不遺失
        if (oldId && oldId !== clean) {
          for (const mode in reelWeights) {
            const pw = reelWeights[mode] && reelWeights[mode].panel_weights;
            if (!pw) continue;
            for (const k of Object.keys(pw)) {
              if (k.startsWith(oldId + '-')) {
                pw[clean + k.slice(oldId.length)] = pw[k];
                delete pw[k];
              }
            }
          }
        }
      }
      // panel 預覽幾何（自身 col/row/width/height → SVG 矩形格）
      // v4.8:與主盤同座標空間 — X 以「視覺欄 0 = 最左欄」對齊,
      //   Y 減去 layoutMetrics.minTop 與主格同基準(修 panel 與主盤錯位)。
      const LAYOUT_STEP = (typeof LAYOUT_CELL_SIZE !== 'undefined' ? LAYOUT_CELL_SIZE : 30)
                        + (typeof LAYOUT_CELL_GAP !== 'undefined' ? LAYOUT_CELL_GAP : 4);
      const panelCells = computed(() => {
        const minTop = layoutMetrics.value.minTop;   // lazy 取值,宣告順序無虞
        const out = [];
        panels.forEach((p, pi) => {
          const w = p.width || 0, h = p.height || 0;
          const mask = Array.isArray(p.cells) && p.cells.length ? new Set(p.cells) : null;
          const isStage = (p.panel_type === 'STAGE');
          for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
              if (mask && !mask.has(c + ',' + r)) continue;   // v7.x:遮罩外的格不畫 → 環形/挖空正確
              out.push({
                x: (p.col + c) * LAYOUT_STEP,
                y: (p.row + r - minTop) * LAYOUT_STEP,
                panel_idx: pi,
                panel_id: p.panel_id,
                join: !!p.join_payline,
                stage: isStage,
              });
            }
          }
        });
        return out;
      });

      // 符號集 CRUD
      function addSymbolSet(name) {
        const clean = String(name || '').trim();
        if (!clean) return;
        if (!symbolSets[clean]) symbolSets[clean] = [];
      }
      function removeSymbolSet(name) { delete symbolSets[name]; }
      function toggleSymbolInSet(name, symbolId) {
        if (!symbolSets[name]) symbolSets[name] = [];
        const i = symbolSets[name].indexOf(symbolId);
        if (i >= 0) symbolSets[name].splice(i, 1);
        else symbolSets[name].push(symbolId);
      }
      const symbolSetNames = computed(() => Object.keys(symbolSets));

      // v4.0 / #9:格數權重(每 reel 的列數分佈權重)只有「列高不一致」的盤面
      //   (Megaways 類)才有意義。等高盤(所有 reel max_rows 相同)隱藏該分頁。
      //   註:Batch 5 盤面結構重構後,會改由明確的機制選擇來驅動,此處先以資料判斷。
      const isVariableHeightBoard = computed(() => {
        const rows = layout.map(r => r.max_rows);
        return new Set(rows).size > 1;
      });
      // v6.2 格數#1:格數權重分頁「常駐顯示」,非 Megaways 時改由 tabNotApplicable 反灰+提示(不再隱藏)
      const visibleTabGroups = computed(() =>
        TABS_BY_GROUP.map(grp => ({ ...grp, tabs: grp.tabs.slice() }))
          .filter(grp => grp.tabs.length > 0)
      );
      // 若目前停在格數權重頁、但離開 Megaways → 自動切回 Reel 權重,避免停在不適用頁
      // §5.2 Stage D:g.megaways 相容鏡像 —— UI 不再直接編輯,改由逐模式 rows_variable 自動導出。
      //   語意同舊 MEGAWAYS(pay_type=WAYS 且有可變模式才算 Megaways);供凍結 docgen 的 Megaways 標籤正確。
      //   不匯出至 A.xlsx(UI-only;a_loader 忽略,權威為 05b)。
      watch(() => [String(g.pay_type || '').toUpperCase(), modes.some(m => m.rows_variable)],
        ([pt, anyVar]) => {
          g.megaways = (pt === 'WAYS') && anyVar;
          if (!anyVar && active.value === 'grid_size_weights') active.value = 'reel_weights';
        });

      function addReel() {
        const new_id = layout.length + 1;
        layout.push(makeReel(new_id));
        activeReelIdx.value = layout.length - 1;  // 自動跳到新 reel
        emit('status', { type: 'ok', msg: `已新增 Reel #${new_id}` });
        syncGameSpec('addReel');   // 連動層:盤面輪數 → registry → 符號頁 reel_limit
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
        syncGameSpec('removeReel');   // 連動層:盤面輪數 → registry → 符號頁 reel_limit
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
            // v4.8:副輪權重(僅 reelWeights 有)同步重映射,避免刪輪後副輪權重黏到錯的輪
            const sw = table[mode] && table[mode].sub_weights;
            if (sw) {
              const nsw = {};
              for (const key in sw) {
                const dash = key.indexOf('-');
                if (dash < 0) continue;
                const reel = parseInt(key.slice(0, dash), 10);
                const rest = key.slice(dash + 1);
                const nid = newForOld[reel];
                if (nid !== undefined) nsw[`${nid}-${rest}`] = sw[key];
              }
              table[mode].sub_weights = nsw;
            }
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
        const _swapMap = (w) => {
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
          return nw;
        };
        for (const table of [reelWeights, gridWeights]) {
          for (const mode in table) {
            const e = table[mode];
            if (!e) continue;
            if (e.weights) e.weights = _swapMap(e.weights);
            // v4.8:副輪權重跟著互換(「連列高/副輪/權重一起換」名實相符)
            if (e.sub_weights) e.sub_weights = _swapMap(e.sub_weights);
          }
        }
      }
      function _swapReelsCore(fromIdx, toIdx) {
        if (fromIdx === toIdx) return false;
        if (fromIdx < 0 || toIdx < 0 || fromIdx >= layout.length || toIdx >= layout.length) return false;
        const a = layout[fromIdx], b = layout[toIdx];
        const ridA = a.reel_id, ridB = b.reel_id;
        const attrs = ['y_offset', 'max_rows', 'has_subreel', 'subreel_position', 'subreel_rows', 'subreel_inherit_weight', 'subreel_kind', 'subreel_symbol_set'];
        for (const k of attrs) { const t = a[k]; a[k] = b[k]; b[k] = t; }
        _swapReelWeightKeys(ridA, ridB);   // 權重 key 跟著換(三段定址)
        return true;
      }
      function swapReels(fromIdx, toIdx) {
        const a = layout[fromIdx], b = layout[toIdx];
        if (!a || !b) return;
        const ridA = a.reel_id, ridB = b.reel_id;
        if (_swapReelsCore(fromIdx, toIdx)) {
          activeReelIdx.value = toIdx;
          emit('status', { type: 'ok', msg: `已互換 R${ridA} ↔ R${ridB}(含列高/副輪/權重)` });
        }
      }
      // v6.2 #6:移動插入(其餘讓位)— 以連續相鄰交換把該輪從 from 冒泡到 to,
      //   重用 _swapReelsCore 的權重 key 重映,自然產生「讓位」效果
      function moveReelInsert(fromIdx, toIdx) {
        if (fromIdx === toIdx) return;
        if (fromIdx < 0 || toIdx < 0 || fromIdx >= layout.length || toIdx >= layout.length) return;
        const step = fromIdx < toIdx ? 1 : -1;
        for (let i = fromIdx; i !== toIdx; i += step) _swapReelsCore(i, i + step);
        activeReelIdx.value = toIdx;
        emit('status', { type: 'ok', msg: `已調整盤面順序(R${fromIdx + 1} → 第 ${toIdx + 1} 位,其餘讓位)` });
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
        if (from >= 0 && from !== idx) moveReelInsert(from, idx);   // #6:與預覽一致改移動讓位
        _dragReelIdx.value = -1;
        _dragOverIdx.value = -1;
      }
      function onReelDragEnd() { _dragReelIdx.value = -1; _dragOverIdx.value = -1; }

      // ──────────────────────────────────────────────────────────
      //  #3（Board v2 §7.2/§8）:逐輪進場 / 滾動方式 + 方向。
      //   純描述 metadata（供 docgen / 下游）;本工具不執行、引擎不消費。
      //   default-on-read（entry_mode||'SCROLL'）、persist-on-write 進既有 layout LS;
      //   不動 helpers.makeReel（byte-frozen）、不新增 LS 鍵。
      //   「盤面預設」= 用「複製到所有主輪」把此輪選擇散佈到全部主輪（§7.2 step 3）。
      // ──────────────────────────────────────────────────────────
      const ENTRY_MODES = [
        { key: 'SCROLL', label: '輪滾動', hint: '像一般 slot 由整條輪帶滾動進場' },
        { key: 'DROP', label: '掉落', hint: '符號一顆顆掉入（消除後補位常見）' },
        { key: 'SPAWN', label: '原地生成', hint: '不移動，原格直接生成 / 抽出（無方向）' },
      ];
      function reelDirOpts(mode) {
        if (mode === 'DROP') return [{ key: 'DOWN', label: '自上落下' }, { key: 'UP', label: '自下升起' }];
        if (mode === 'SPAWN') return [];
        return [{ key: 'DOWN', label: '由上往下' }, { key: 'UP', label: '由下往上' }];   // SCROLL（預設）
      }
      function setReelEntryMode(m) {
        const r = activeReel.value; if (!r) return;
        r.entry_mode = m;
        if (m === 'SPAWN') r.scroll_dir = 'NONE';
        else if (!r.scroll_dir || r.scroll_dir === 'NONE') r.scroll_dir = 'DOWN';
      }
      function setReelScrollDir(d) { const r = activeReel.value; if (r) r.scroll_dir = d; }
      function copyReelEntryToAll() {
        const r = activeReel.value; if (!r) return;
        const em = r.entry_mode || 'SCROLL';
        const sd = em === 'SPAWN' ? 'NONE' : (r.scroll_dir || 'DOWN');
        for (const rr of layout) { rr.entry_mode = em; rr.scroll_dir = sd; }
      }

      // ──────────────────────────────────────────────────────────
      //  v4.6:副輪「種類」切換
      //  切 kind 時自動把 position / rows 帶到該 kind 合理的預設值，
      //  避免出現「SIDE_VERTICAL 卻 position=BOTTOM」這種不一致狀態。
      // ──────────────────────────────────────────────────────────
      function setSubreelKind(kind) {
        const r = activeReel.value;
        if (!r) return;
        const def = SUBREEL_KIND_MAP[kind];
        if (!def) return;
        r.subreel_kind = kind;
        // position:若目前 position 不在該 kind 允許清單,改回該 kind 預設
        if (!def.positions.includes(r.subreel_position)) {
          r.subreel_position = def.default_position;
        }
        // 雙盤面:列數鎖定＝主輪列數(無滾動同尺寸盤)
        if (def.dual) {
          r.subreel_rows = r.max_rows;
        } else if (!r.subreel_rows || r.subreel_rows < 1) {
          r.subreel_rows = 1;
        }
      }
      // 雙盤面列數須跟著主輪列數走(鎖定)
      watch(() => activeReel.value && activeReel.value.max_rows, (mr) => {
        const r = activeReel.value;
        if (r && r.has_subreel && (r.subreel_kind || 'STACK') === 'DUAL_PANEL') {
          r.subreel_rows = mr;
        }
      });
      const activeSubreelKindDef = computed(() => {
        const r = activeReel.value;
        if (!r) return null;
        return SUBREEL_KIND_MAP[r.subreel_kind || 'STACK'] || SUBREEL_KIND_MAP.STACK;
      });

      // ──────────────────────────────────────────────────────────
      //  v3.3 / A4:盤面範本(LAYOUT_PRESETS)
      //  一鍵替換整個 layout — 90% 玩家點進去都是要這幾個常見盤
      // ──────────────────────────────────────────────────────────
      const LAYOUT_PRESETS = [
        { key: '3x1',  icon: '▬', label: '3×1',
          note: '3 reel 單列,經典三轉盤',
          gen: () => Array.from({length: 3}, (_, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: 1,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: '3x3',  icon: '◼', label: '3×3',
          note: '3 reel 3 row,復古老虎機風格',
          gen: () => Array.from({length: 3}, (_, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: 3,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: '4x4',  icon: '▦', label: '4×4',
          note: '4 reel 4 row',
          gen: () => Array.from({length: 4}, (_, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: 4,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: '5x3',  icon: '⬛', label: '5×3',
          note: '經典 5 reel 3 row,最常見起手式',
          gen: () => Array.from({length: 5}, (_, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: 3,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: '5x4',  icon: '⬜', label: '5×4',
          note: '5 reel 4 row,空間更大',
          gen: () => Array.from({length: 5}, (_, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: 4,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: '6x4',  icon: '▩', label: '6×4',
          note: '6 reel 4 row,Cluster / 多 Ways 常用',
          gen: () => Array.from({length: 6}, (_, i) => ({
            reel_id: i+1, y_offset: 0, max_rows: 4,
            has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false,
          })) },
        { key: 'megaways6', icon: '⥯', label: '6輪 Megaways + 副輪',
          note: '6 reel 變動列高(2/4/4/4/4/2)+ 上方橫向副輪;會一併切到 Megaways 模式',
          megaways: true,
          gen: () => [
            { reel_id: 1, y_offset: 0, max_rows: 2, has_subreel: false, subreel_position: '',    subreel_rows: 0, subreel_inherit_weight: false },
            { reel_id: 2, y_offset: 0, max_rows: 4, has_subreel: true,  subreel_position: 'TOP', subreel_rows: 1, subreel_inherit_weight: true, subreel_kind: 'STACK' },
            { reel_id: 3, y_offset: 0, max_rows: 4, has_subreel: true,  subreel_position: 'TOP', subreel_rows: 1, subreel_inherit_weight: true, subreel_kind: 'STACK' },
            { reel_id: 4, y_offset: 0, max_rows: 4, has_subreel: true,  subreel_position: 'TOP', subreel_rows: 1, subreel_inherit_weight: true, subreel_kind: 'STACK' },
            { reel_id: 5, y_offset: 0, max_rows: 4, has_subreel: true,  subreel_position: 'TOP', subreel_rows: 1, subreel_inherit_weight: true, subreel_kind: 'STACK' },
            { reel_id: 6, y_offset: 0, max_rows: 2, has_subreel: false, subreel_position: '',    subreel_rows: 0, subreel_inherit_weight: false },
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
        // 替換 layout(用 splice 保 reactivity);用 makeReel 補齊新欄位(subreel_kind 等)
        const rows = preset.gen().map(r => ({ ...makeReel(r.reel_id), ...r }));
        layout.splice(0, layout.length, ...rows);
        activeReelIdx.value = 0;
        layoutPresetMenuOpen.value = false;
        // §5.2 Stage D:範本 Megaways-ness → 設逐模式 rows_variable(UI 真相);g.megaways 僅保留相容
        if (preset.megaways) {
          g.pay_type = 'WAYS'; g.megaways = true;
          modes.forEach(m => setModeGridVariable(m));
        } else {
          g.megaways = false;
          modes.forEach(m => setModeGridFixed(m));
        }
        emit('status', { type: 'ok', msg: `已套用盤面範本「${preset.label}」` });
        syncGameSpec('preset');   // 連動層:盤面輪數 → registry → 符號頁 reel_limit
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
        if (mode === reelActiveMode.value) return _reelActiveTotals.value.cols[sid] || 0;
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
          if (mode === reelActiveMode.value) {
            // v5.0-c:活躍模式走快取,O(1)
            const t = _reelActiveTotals.value;
            denom = (dm === 'pct_row') ? (t.rows[r] || 0) : (t.cols[col] || 0);
          } else if (dm === 'pct_row') {
            for (const sid of e.symbol_ids) denom += Number(e.weights[`${r}-${sid}`]) || 0;
          } else {
            for (const rr of layout) denom += Number(e.weights[`${rr.reel_id}-${col}`]) || 0;
          }
        } else if (kind === 'grid') {
          const e = gridW(mode);
          cur = Number(e.weights[`${r}-${col}`]) || 0;
          if (mode === gridActiveMode.value) {
            const t = _gridActiveTotals.value;
            denom = (dm === 'pct_row') ? (t.rows[r] || 0) : (t.cols[String(col)] || 0);
          } else if (dm === 'pct_row') {
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
        if (mode === gridActiveMode.value) return _gridActiveTotals.value.cols[String(sz)] || 0;
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
      // ────────────────────────────────────────────────────────
      //  v5.0-c:矩陣 cell 互動重做(spreadsheet 模型)
      //  - 點 cell(含 input 本體)= 選取該格 + 進入編輯;不再依賴 td 邊緣窄縫
      //  - Shift+點 = 視覺序矩形範圍;Ctrl/⌘+點 = 多選 toggle(兩者皆不進入編輯)
      //  - 按住拖曳跨格 = 矩形框選(自動離開編輯狀態)
      //  - 範圍一律以「畫面上的列序」計算(修正列排序後 Shift 框選選錯格)
      // ────────────────────────────────────────────────────────
      const matrixDrag = reactive({
        pending: false,   // pointerdown 後待命(尚未跨格)
        active:  false,   // 已跨格,進入拖曳框選
        kind: null, mode: null, step: '',
        startR: null, startCol: null,
      });
      function _visualRowIds(kind, mode) {
        try { return sortedReels(kind, mode).map(r => r.reel_id); }
        catch (e) { return layout.map(r => r.reel_id); }
      }
      function _selectRange(kind, mode, a, b, step) {
        // 以視覺順序(欄 = symbol_ids 現序;列 = sortedReels 現序)框出矩形
        const cols = _colsForKind(kind, mode);
        const rows = _visualRowIds(kind, mode);
        if (cols.length === 0 || rows.length === 0) return;
        const cidxA = cols.indexOf(String(a.col));
        const cidxB = cols.indexOf(String(b.col));
        const ridxA = rows.indexOf(a.r);
        const ridxB = rows.indexOf(b.r);
        if (cidxA < 0 || cidxB < 0 || ridxA < 0 || ridxB < 0) return;
        const rMin = Math.min(ridxA, ridxB), rMax = Math.max(ridxA, ridxB);
        const cMin = Math.min(cidxA, cidxB), cMax = Math.max(cidxA, cidxB);
        for (let ri = rMin; ri <= rMax; ri++) {
          for (let ci = cMin; ci <= cMax; ci++) {
            matrixSelection.keys.add(_selKey(kind, mode, rows[ri], cols[ci], step));
          }
        }
      }
      function onMatrixCellPointerDown(kind, mode, r, col, ev, step) {
        const stStr = (step === undefined || step === null) ? '' : String(step);
        const scope = _selectionScope();
        if (scope && (scope.kind !== kind || scope.mode !== mode || scope.step !== stStr)) {
          matrixSelection.keys = new Set();
          matrixSelection.anchor = null;
        }
        col = String(col);
        const key = _selKey(kind, mode, r, col, step);
        if (ev && ev.shiftKey && matrixSelection.anchor) {
          ev.preventDefault();   // 不搬移 focus / caret
          _selectRange(kind, mode, matrixSelection.anchor, { r, col }, step);
          return;
        }
        if (ev && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          if (matrixSelection.keys.has(key)) matrixSelection.keys.delete(key);
          else matrixSelection.keys.add(key);
          matrixSelection.anchor = { r, col };
          return;
        }
        // 一般按下:單選該格 + 設 anchor + 拖曳待命;允許 focus 直接編輯
        matrixSelection.keys = new Set([key]);
        matrixSelection.anchor = { r, col };
        matrixDrag.pending = true;
        matrixDrag.active = false;
        matrixDrag.kind = kind; matrixDrag.mode = mode; matrixDrag.step = stStr;
        matrixDrag.startR = r; matrixDrag.startCol = col;
        // 點在 td gutter(非 input 本體)也把焦點交給該格 input → 死區消失
        const host = ev && ev.currentTarget;
        if (host && host.querySelector && ev.target && ev.target.tagName !== 'INPUT') {
          const inp = host.querySelector('input.cfg-matrix-cell');
          if (inp) { ev.preventDefault(); inp.focus(); if (inp.select) inp.select(); }
        }
      }
      function onMatrixCellPointerEnter(kind, mode, r, col, ev, step) {
        if (!matrixDrag.pending) return;
        if (ev && ev.buttons === 0) { matrixDrag.pending = false; matrixDrag.active = false; return; }
        const stStr = (step === undefined || step === null) ? '' : String(step);
        if (matrixDrag.kind !== kind || matrixDrag.mode !== mode || matrixDrag.step !== stStr) return;
        col = String(col);
        if (!matrixDrag.active) {
          if (r === matrixDrag.startR && col === matrixDrag.startCol) return;
          matrixDrag.active = true;
          // 拖曳成立:離開編輯狀態,避免拖曳途中誤改值
          try { document.activeElement && document.activeElement.blur(); } catch (e) {}
        }
        matrixSelection.keys = new Set();
        _selectRange(kind, mode,
                     { r: matrixDrag.startR, col: matrixDrag.startCol },
                     { r, col }, step);
        matrixSelection.anchor = { r: matrixDrag.startR, col: matrixDrag.startCol };
      }
      function _onMatrixPointerUp() {
        matrixDrag.pending = false;
        matrixDrag.active = false;
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
        if (matrixSelection.keys.size === 0) return;
        _pushUndoForSelection();
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
      // ──────────────────────────────────────────────────────────
      //  v4.6:盤面預覽幾何
      //  四種 subreel_kind 的視覺擺法:
      //    STACK          → 同欄,主輪上/下方(TOP/BOTTOM),小 gap
      //    TOP_HORIZONTAL → 同欄,主輪上方,小 gap(視覺同 STACK-TOP,但著色不同)
      //    SIDE_VERTICAL  → 自成一欄,擺在主輪左/右側(LEFT/RIGHT),欄距加大
      //    DUAL_PANEL     → 第二張同尺寸盤;BOTTOM=主輪正下方一個大 gap、RIGHT=主輪右側一欄
      //  為了讓「自成一欄」的副盤(SIDE_VERTICAL / DUAL_PANEL-RIGHT)有水平空間,
      //  先算每個 reel 佔幾個「視覺欄」,再累加成 colStart。
      // ──────────────────────────────────────────────────────────
      function _reelExtraCols(r) {
        // 回傳該 reel 在主欄之外、額外向右borrow 的視覺欄數
        if (!r.has_subreel) return 0;
        const kind = r.subreel_kind || 'STACK';
        if (kind === 'SIDE_VERTICAL' && r.subreel_position === 'RIGHT') return 1;
        if (kind === 'DUAL_PANEL' && r.subreel_position === 'RIGHT') return 1;
        return 0;
      }
      function _reelLeadCols(r) {
        // 回傳該 reel 在主欄之前、向左borrow 的視覺欄數(LEFT 副盤)
        if (!r.has_subreel) return 0;
        const kind = r.subreel_kind || 'STACK';
        if (kind === 'SIDE_VERTICAL' && r.subreel_position === 'LEFT') return 1;
        if (kind === 'DUAL_PANEL' && r.subreel_position === 'LEFT') return 1;
        return 0;
      }
      // 每個 reel 的主欄 col 起點(累加 lead/extra)
      const layoutColStarts = computed(() => {
        const starts = [];
        let col = 0;
        for (const r of layout) {
          col += _reelLeadCols(r);   // 先讓出左側副盤欄
          starts.push(col);          // 主欄位置
          col += 1 + _reelExtraCols(r);
        }
        return starts;
      });
      const layoutTotalCols = computed(() => {
        let col = 0;
        for (const r of layout) col += _reelLeadCols(r) + 1 + _reelExtraCols(r);
        return Math.max(1, col);
      });

      const layoutMetrics = computed(() => {
        let minTop = 0, maxBot = 0;
        for (const r of layout) {
          let top = r.y_offset;
          let bot = r.y_offset + Math.max(1, r.max_rows) - 1;
          if (r.has_subreel && r.subreel_rows > 0) {
            const kind = r.subreel_kind || 'STACK';
            const pos = r.subreel_position;
            // 只有「同欄、上下堆疊」的型(STACK / TOP_HORIZONTAL，以及 DUAL_PANEL-BOTTOM)
            // 才會把垂直範圍往外撐;LEFT/RIGHT 的自成一欄副盤垂直範圍 ≤ 主輪。
            if (pos === 'TOP') top = top - r.subreel_rows;
            else if (pos === 'BOTTOM') bot = bot + r.subreel_rows;
          }
          minTop = Math.min(minTop, top);
          maxBot = Math.max(maxBot, bot);
        }
        return { minTop, maxBot };
      });

      const layoutCells = computed(() => {
        const { minTop } = layoutMetrics.value;
        const starts = layoutColStarts.value;
        const STEP = LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP;
        const cells = [];
        layout.forEach((r, idx) => {
          const mainCol = starts[idx];
          const x = mainCol * STEP;
          // 主 Reel 格子
          for (let i = 0; i < r.max_rows; i++) {
            const row = r.y_offset + i;
            cells.push({
              x,
              y: (row - minTop) * STEP,
              kind: 'main',
              reel_id: r.reel_id,
              reel: idx + 1,
              row: i + 1,
            });
          }
          // 副 Reel 格子
          if (r.has_subreel && r.subreel_rows > 0) {
            const skind = r.subreel_kind || 'STACK';
            const pos = r.subreel_position;
            const subClass = skind === 'DUAL_PANEL' ? 'dual'
                            : skind === 'SIDE_VERTICAL' ? 'side'
                            : skind === 'TOP_HORIZONTAL' ? 'horiz' : 'stack';
            if (pos === 'TOP') {
              for (let i = 0; i < r.subreel_rows; i++) {
                const row = r.y_offset - r.subreel_rows + i;
                cells.push({ x, y: (row - minTop) * STEP - LAYOUT_SUBREEL_GAP,
                  kind: 'sub', sub_kind: subClass, reel_id: r.reel_id, reel: idx + 1, row: null });
              }
            } else if (pos === 'BOTTOM') {
              for (let i = 0; i < r.subreel_rows; i++) {
                const row = r.y_offset + r.max_rows + i;
                cells.push({ x, y: (row - minTop) * STEP + LAYOUT_SUBREEL_GAP,
                  kind: 'sub', sub_kind: subClass, reel_id: r.reel_id, reel: idx + 1, row: null });
              }
            } else if (pos === 'LEFT' || pos === 'RIGHT') {
              // 自成一欄:LEFT 在 mainCol-1、RIGHT 在 mainCol+1
              const subCol = pos === 'LEFT' ? mainCol - 1 : mainCol + 1;
              const sx = subCol * STEP + (pos === 'LEFT' ? -LAYOUT_SUBREEL_GAP : LAYOUT_SUBREEL_GAP);
              for (let i = 0; i < r.subreel_rows; i++) {
                const row = r.y_offset + i;   // 與主輪頂端對齊
                cells.push({ x: sx, y: (row - minTop) * STEP,
                  kind: 'sub', sub_kind: subClass, reel_id: r.reel_id, reel: idx + 1, row: null });
              }
            }
          }
        });
        return cells;
      });

      const layoutLabels = computed(() => {
        const starts = layoutColStarts.value;
        const STEP = LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP;
        return layout.map((r, idx) => ({
          x: starts[idx] * STEP + LAYOUT_CELL_SIZE / 2,
          reel_id: r.reel_id,
        }));
      });

      const layoutViewBox = computed(() => {
        if (layout.length === 0 && panels.length === 0) return '0 0 100 100';
        const STEP = LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP;
        const { minTop, maxBot } = layoutMetrics.value;
        // v4.8:viewBox 同時涵蓋主盤(含副盤借欄)與所有自由副盤,
        //   panel 擺到負座標或盤面右側更遠處也不會被裁掉。
        let minCol = 0, maxCol = layoutTotalCols.value - 1;
        let minRowS = 0, maxRowS = maxBot - minTop;      // shifted row 空間(主盤已含 minTop 平移)
        for (const p of panels) {
          const w = Math.max(1, Math.floor(p.width || 1));
          const h = Math.max(1, Math.floor(p.height || 1));
          const c0 = Math.floor(p.col || 0);
          const r0 = Math.floor(p.row || 0) - minTop;
          if (c0 < minCol) minCol = c0;
          if (c0 + w - 1 > maxCol) maxCol = c0 + w - 1;
          if (r0 < minRowS) minRowS = r0;
          if (r0 + h - 1 > maxRowS) maxRowS = r0 + h - 1;
        }
        const x0 = minCol * STEP - LAYOUT_SUBREEL_GAP;
        const y0 = minRowS * STEP - LAYOUT_LABEL_HEIGHT - LAYOUT_SUBREEL_GAP;
        const w = (maxCol - minCol + 1) * STEP + 2 * LAYOUT_SUBREEL_GAP;
        const h = (maxRowS - minRowS + 1) * STEP
                  + 2 * LAYOUT_SUBREEL_GAP + LAYOUT_LABEL_HEIGHT;
        return `${x0} ${y0} ${w} ${h}`;
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
      // v5.2:選到空 path 的中獎線 → 自動開點選模式(直接在棋盤畫線)
      //   (watch 於 selectedPaylineIdx 宣告後註冊,見下方)

      // ── v5.3:投注結構(14_Bet_Config)──
      // v8.6 / R5:betConfig additive 欄位正規化(檔位/互斥/Feature Drop/RTP 版本;
      //   defaultBetConfig 在 helpers,不在 scope;此處補預設,舊資料載入即預設,向後相容)。
      function _ensureBetConfigFields(bc) {
        if (!bc || typeof bc !== 'object') return bc;
        if (bc.ante_buy_exclusive == null) bc.ante_buy_exclusive = false;
        if (bc.feature_drop_enabled == null) bc.feature_drop_enabled = false;
        if (bc.feature_drop_desc == null) bc.feature_drop_desc = '';
        if (!Array.isArray(bc.rtp_variants)) bc.rtp_variants = [];
        for (const bf of (Array.isArray(bc.buy_features) ? bc.buy_features : [])) {
          if (bf && bf.kind == null) bf.kind = 'DIRECT';   // DIRECT / BOOST_RATE / SUPER
        }
        return bc;
      }
      const betConfig = reactive(_ensureBetConfigFields(loadBetConfig()));
      const BF_KIND_OPTIONS = [
        { value: 'DIRECT',     label: '直接購買(直接進 feature)' },
        { value: 'BOOST_RATE', label: '提升觸發率(非直買,X-iter 式)' },
        { value: 'SUPER',      label: '進階強化版(Super Buy)' },
      ];
      function addRtpVariant() {
        _ensureBetConfigFields(betConfig);
        betConfig.rtp_variants.push({ variant: '', target_rtp: 96, max_bet: 0, notes: '' });
      }
      function removeRtpVariant(idx) {
        if (Array.isArray(betConfig.rtp_variants)) betConfig.rtp_variants.splice(idx, 1);
      }

      // ── v8.6 / R5 E-16:比倍(18_Gamble)──
      //   新 LS key slotplanner.aconfig.gamble.v1(已納 aconfig-xlsx 快照/還原兩處);
      //   規格描述,引擎不消費。load/save 內聯(不動 helpers 純函式區)。
      const GAMBLE_LS_KEY = 'slotplanner.aconfig.gamble.v1';
      function _defaultGamble() {
        return { enabled: false, gamble_type: 'CARD_COLOR', type_desc: '',
                 win_mult_options: '2', max_rounds: 5, cap_mult: 0,
                 applies_to: 'ALL_WINS', applies_limit: 0, collect_anytime: true,
                 stake_type: 'WIN', reward_type: 'MULTIPLY_WIN', gamble_trigger: '',
                 notes: '' };
      }
      function _loadGamble() {
        try {
          const raw = localStorage.getItem(GAMBLE_LS_KEY);
          if (!raw) return _defaultGamble();
          return { ..._defaultGamble(), ...JSON.parse(raw) };
        } catch (e) { return _defaultGamble(); }
      }
      const gamble = reactive(_loadGamble());
      const GAMBLE_TYPE_OPTIONS = [
        { value: 'CARD_COLOR', label: '猜牌色(紅/黑,×2)' },
        { value: 'CARD_SUIT',  label: '猜花色(×4)' },
        { value: 'LADDER',     label: '階梯比倍(Ladder)' },
        { value: 'WHEEL',      label: '轉輪比倍' },
        { value: 'CUSTOM',     label: '自訂(於補充描述)' },
      ];

      // ── v8.25 / G4:獎池級距(★機主授權新 LS key slotplanner.aconfig.jackpot.v1)──
      //   與 13_Jackpots(jackpots.v1,個別彩池定義)正交:此為 Grand/Major/Minor/Mini 級距 + 觸發方式。
      //   只描述級距與觸發方式,不模擬命中率。
      const JACKPOT_LS_KEY = 'slotplanner.aconfig.jackpot.v1';
      function _defaultJackpot() {
        return { tiers: [], trigger: '' };   // trigger: '' | PROBABILITY | COLLECT_METER | TOKEN_COUNT
      }
      function _loadJackpot() {
        try {
          const raw = localStorage.getItem(JACKPOT_LS_KEY);
          if (!raw) return _defaultJackpot();
          const o = { ..._defaultJackpot(), ...JSON.parse(raw) };
          if (!Array.isArray(o.tiers)) o.tiers = [];
          return o;
        } catch (e) { return _defaultJackpot(); }
      }
      const jackpotCfg = reactive(_loadJackpot());
      const JACKPOT_TRIGGER_OPTIONS = [
        { value: '',              label: '（未指定）' },
        { value: 'PROBABILITY',   label: '機率觸發(PROBABILITY)' },
        { value: 'COLLECT_METER', label: '集滿進度(COLLECT_METER)' },
        { value: 'TOKEN_COUNT',   label: '收滿 N 枚(TOKEN_COUNT)' },
      ];
      function addJackpotTier() {
        jackpotCfg.tiers.push({ tier: String(jackpotCfg.tiers.length + 1), label: '', value: 0, notes: '' });
      }
      function removeJackpotTier(idx) { jackpotCfg.tiers.splice(idx, 1); }

      function addBuyFeature() {
        const usedModes = new Set(betConfig.buy_features.map(bf => bf.target_mode));
        const unusedMode = modes.find(m => m.mode && !usedModes.has(m.mode));
        betConfig.buy_features.push(makeBuyFeature(unusedMode ? unusedMode.mode : ''));
      }
      function removeBuyFeature(idx) { betConfig.buy_features.splice(idx, 1); }

      // ── UI 卡片收合(runtime-only,不存 LS)──
      // 收合摘要 + 標題反灰:沿用 03_Symbols 卡片語彙,推廣到 bet_config 兩卡。
      const betCardOpen = reactive({ ante: true, buy: true });
      function toggleBetCard(id) {
        if (id !== 'ante' && id !== 'buy') return;
        // 未啟用時鎖定收合:標題列只顯示灰字說明,不可折疊
        if (id === 'ante' && !betConfig.ante_bet_enabled) return;
        if (id === 'buy' && !betConfig.buy_feature_enabled) return;
        betCardOpen[id] = !betCardOpen[id];
      }
      // 收合摘要:啟用時顯示精要,未啟用則回 ''(改由標題反灰 + off-hint 表達)
      const anteBetSummary = computed(() => {
        if (!betConfig.ante_bet_enabled) return '';
        const parts = [];
        const cm = Number(betConfig.ante_bet_mult);
        if (cm > 0) parts.push('成本 ×' + cm);
        const tm = Number(betConfig.ante_bet_trigger_mult);
        if (tm > 0) parts.push('觸發 ×' + tm);
        return parts.join(' · ');
      });
      const buyFeatureSummary = computed(() => {
        if (!betConfig.buy_feature_enabled) return '';
        const n = (betConfig.buy_features || []).length;
        return n ? (n + ' 個購買項目') : '尚未設定項目';
      });

      // ── v5.4:倍數系統(15_Multipliers)資料層 ──
      // v6.4 死碼移除:multipliers 分頁的編輯器函式(addWildMultValue/removeWildMultValue/
      //   addRandomMultValue/removeRandomMultValue/wildMultPct/randomMultPct/
      //   wildMultExpected/randomMultExpected)服務已不可達的分頁,已移除。
      //   multipliers reactive 物件「不可移除」:仍由一次性遷移(migrateQ3)、自動存檔 watch、
      //   validate 驗證、docgen 反推使用。progressLadderStr/_syncProgressStrFromData/
      //   commitProgressLadder 亦保留 —— 由 modeNames 的活躍 watch 調用(非死碼)。
      const multipliers = reactive(loadMultipliers());
      const progressLadderStr = reactive({});
      function _syncProgressStrFromData() {
        for (const m of modeNames.value) {
          const arr = multipliers.progress_ladders[m];
          progressLadderStr[m] = Array.isArray(arr) ? arr.join(', ') : '';
        }
      }
      function commitProgressLadder(mode) {
        const arr = parseLadder(progressLadderStr[mode] || '');
        if (arr.length) multipliers.progress_ladders[mode] = arr;
        else delete multipliers.progress_ladders[mode];
      }

      // ── v5.4:金幣面額(16_Coin_Values;Hold&Win 核心)──
      // v6.4 死碼移除:addCoinDenom/removeCoinDenom/coinDenomPct/coinExpectedValue 編輯器函式
      //   只服務已不可達的 coin_values 分頁,已移除。coinValues 物件本身仍供遷移/存檔/驗證使用。
      const coinValues = reactive(loadCoinValues());


      // ════════════════════════════════════════════════════════════
      // v7.14:mode-owned bonus 小遊戲(mode_kind != SPIN 時,mode 攜帶獎項表)
      //   沿用 makeBonusItem / jackpots;handler 皆函式(render 時求值,前向引用安全)。
      // ════════════════════════════════════════════════════════════
      const MODE_KIND_OPTIONS = MK.MODE_KIND_OPTIONS || [
        { v: 'SPIN', label: 'SPIN' },
        { v: 'WHEEL', label: '輪盤' },
        { v: 'PICK', label: '點點樂' },
        { v: 'COLLECTION', label: '收集' },
        { v: 'HOLD_AND_WIN', label: 'Hold & Win' },
        { v: 'OTHER', label: '其他' },
      ];
      const MODE_KIND_LABEL = MK.MODE_KIND_LABEL || {
        SPIN: 'SPIN', WHEEL: '輪盤', PICK: '點點樂', COLLECTION: '收集', HOLD_AND_WIN: 'Hold & Win', OTHER: '其他',
      };
      function isBonusKind(m) {
        return MK.isBonusKind ? MK.isBonusKind(m)
          : !!(m && (m.mode_kind === 'WHEEL' || m.mode_kind === 'PICK' || m.mode_kind === 'COLLECTION'));
      }
      function addModeItem(m) {
        _ensureModeGameplayFields(m);
        const it = makeBonusItem('', m.mode_kind === 'COLLECTION' ? 0 : 10, 100);
        it.item_role = '';   // v8.22 / G3:角色標記(makeBonusItem 在 helpers 凍結,此處補;'' = 未指定)
        it.link_mode = '';   // v8.27 / 批8:item→模式連結('' = 無連結)
        m.items.push(it);
      }
      function removeModeItem(m, idx) { if (Array.isArray(m.items)) m.items.splice(idx, 1); }
      function modeItemJpOptions(m, it) {
        const usedByOthers = new Set(
          (m.items || []).filter(x => x !== it && x.link_jackpot).map(x => x.link_jackpot)
        );
        return jackpots.filter(j => !usedByOthers.has(j.jp_id) || j.jp_id === it.link_jackpot);
      }
      // v8.27 / 批8:item→模式連結的可選模式(排除自身;寬鬆,可任填)
      function modeItemModeOptions(m) {
        return modes.filter(x => x && x.mode && x.mode !== (m && m.mode)).map(x => x.mode);
      }
      function modeItemPct(m, idx) {
        if (m.mode_kind === 'COLLECTION') return null;
        const tot = (m.items || []).reduce((a, it) => a + (Number(it.weight) || 0), 0);
        if (!tot) return 0;
        return (Number(m.items[idx].weight) || 0) / tot * 100;
      }
      function modeExpected(m) {
        if (m.mode_kind === 'COLLECTION') return null;
        const tot = (m.items || []).reduce((a, it) => a + (Number(it.weight) || 0), 0);
        if (!tot) return 0;
        return (m.items || []).reduce((a, it) => {
          let v = Number(it.value) || 0;
          if (it.link_jackpot) { const jp = jackpots.find(j => j.jp_id === it.link_jackpot); if (jp) v = Number(jp.mult) || v; }
          return a + v * (Number(it.weight) || 0);
        }, 0) / tot;
      }
      // WHEEL 升級目標:其他 WHEEL mode(排除自己)
      function modeWheelTargets(m) {
        return modes.filter(x => x !== m && x.mode_kind === 'WHEEL' && (x.mode || '').trim());
      }
      // mode 卡玩法子區摘要(收合時顯示)
      function modeKindSummary(m) {
        if (!isBonusKind(m)) return '';
        const n = (m.items || []).length;
        const k = MODE_KIND_LABEL[m.mode_kind] || m.mode_kind;
        if (m.mode_kind === 'PICK')       return `${k} · 抽 ${Number(m.pick_count) || 0} 次 · ${n} 個獎項`;
        if (m.mode_kind === 'COLLECTION') return `${k} · 目標 ${Number(m.collect_target) || 0} · ${n} 個獎項`;
        const up = (m.wheel_upgrade_to || '').trim();
        return `${k}${up ? ' · 升級→' + up : ''} · ${n} 個獎項`;
      }
      // v8.0:舊 LS bonusgames.v1 一次性遷移進 modes(取代 v7.14 的一鍵按鈕)。
      //   讀舊 LS → 轉成 mode 玩法種類(同名略過)→ 清掉舊 key。啟動時呼叫一次。
      //   lossy:title/trigger_desc/mode_scope 併 notes,trigger_condition 留空待人工重接。
      function _migrateLegacyBonusLS() {
        let games = [];
        try {
          const raw = localStorage.getItem('slotplanner.aconfig.bonusgames.v1');
          if (!raw) return;
          const obj = JSON.parse(raw);
          games = (obj && Array.isArray(obj.games)) ? obj.games : [];
        } catch (e) { return; }
        if (!games.length) { localStorage.removeItem('slotplanner.aconfig.bonusgames.v1'); return; }
        const taken = new Set(modes.map(x => x.mode));
        let added = 0;
        for (const g of games) {
          if (!g || !g.bonus_id || taken.has(g.bonus_id)) continue;
          const nm = makeMode(g.bonus_id);
          _ensureModeGameplayFields(nm);
          nm.mode_kind = (g.type || 'WHEEL').toUpperCase();
          nm.wheel_upgrade_to = g.wheel_upgrade_to || '';
          nm.pick_count = Number(g.pick_count) || 0;
          nm.collect_target = Number(g.collect_target) || 0;
          nm.items = Array.isArray(g.items) ? g.items.map(it => ({
            label: it.label || '', value: Number(it.value) || 0, weight: Number(it.weight) || 0,
            is_end: !!it.is_end, link_jackpot: it.link_jackpot || '',
          })) : [];
          const nts = [];
          if (g.title && g.title !== g.bonus_id) nts.push(g.title);
          if (g.trigger_desc) nts.push('觸發(舊):' + g.trigger_desc);
          if (g.mode_scope && g.mode_scope !== 'ALL') nts.push('原適用模式:' + g.mode_scope);
          if (g.notes) nts.push(g.notes);
          nm.notes = nts.join(' / ');
          modes.push(nm);
          taken.add(g.bonus_id);
          added++;
        }
        // v8.9.1 bug 修復:此函式在 watch(modes) 掛載「之前」執行 → 遷移的 modes 變更
        //   不會被自動存檔;而舊 key 已刪 → 使用者重整一次即永久遺失 bonus 資料。
        //   修法:遷移成功即「先主動落盤、再刪舊 key」(原子順序,中途中斷也不丟資料)。
        if (added) {
          try { saveModes(modes.map(x => ({ ...x }))); } catch (e) { return; }   // 落盤失敗則保留舊 key,下次再遷
        }
        localStorage.removeItem('slotplanner.aconfig.bonusgames.v1');
        if (added) emit('status', {
          type: 'ok',
          msg: `已將 ${added} 個舊版 Bonus 遷移為模式玩法種類。⚠️ 觸發條件(trigger_condition)需手動重接。`,
        });
      }
      _migrateLegacyBonusLS();   // v8.0:啟動即遷移舊 LS bonus

      // ════════════════════════════════════════════════════════════
      //  v5.5:即時 RTP 計算器(LINE 玩法閉式計算)
      //  原理:對每條中獎線、每個賠付符號 S、每個連線長度 N:
      //    P(恰好左起 N 連) = Π[i=1..N] p_i(S或Wild) × (1 − p_{N+1}(S或Wild))
      //    line_RTP += Σ P × pay_table[S][N]
      //  base_RTP = Σ over lines（每線吃單注,故除以線數得每注 RTP）
      //  限制:純 LINE;不含 cascade/倍數/scatter/ways/bonus(會明確標示)。
      // ════════════════════════════════════════════════════════════
      function _symPayMap() {
        // symbol_id → { is_wild, is_scatter, pay: {N: payout} }
        const m = {};
        for (const s of symbolList.value) {
          if (s.enabled === false) continue;
          const sid = (s.symbol_id && s.symbol_id.trim()) || s.name;
          if (!sid) continue;
          const rows = migratePayRows(s);
          const pay = {};
          for (const r of rows) {
            const n = Number(r.count), p = Number(r.pay);
            if (n > 0 && p > 0) pay[n] = p;
          }
          m[sid] = { is_wild: !!s.is_wild, is_scatter: !!s.is_scatter, pay };
        }
        return m;
      }
      // 某 reel 上「符號 sid 命中(含 wild)」的機率;mode 走快取總計
      function _reelHitProb(mode, reelId, sid, payMap, includeWild) {
        const e = reelW(mode);
        let total = 0, hit = 0;
        for (const k of e.symbol_ids) {
          const w = Number(e.weights[`${reelId}-${k}`]) || 0;
          total += w;
          if (k === sid) hit += w;
          else if (includeWild && payMap[k] && payMap[k].is_wild) hit += w;
        }
        return total > 0 ? hit / total : 0;
      }
      const rtpResult = computed(() => {
        const out = { ok: false, isLine: false, total: 0, perLine: [], note: '', target: Number(g.return_pct) || 0 };
        const payType = (g.pay_type || '').toUpperCase();
        out.isLine = payType === 'LINE';
        if (!out.isLine) { out.note = `目前賠付類型為 ${payType || '未設定'};即時 RTP 僅支援 LINE`; return out; }
        const mode = reelActiveMode.value || (modeNames.value[0] || '');
        if (!mode) { out.note = '無可用模式'; return out; }
        const payMap = _symPayMap();
        const validLines = paylines.filter(pl => {
          const pr = parsePathString(pl.path || '');
          return pr.valid && pr.points.length >= 2;
        });
        if (validLines.length === 0) { out.note = '尚無有效中獎線'; return out; }

        let grand = 0;
        for (const pl of validLines) {
          const pts = parsePathString(pl.path).points;   // [{reel,row}]
          const reelsOnLine = pts.map(p => p.reel);
          // 預算每個 reel 上「各賠付符號(含 wild)」命中機率
          let lineRtp = 0;
          for (const [sid, info] of Object.entries(payMap)) {
            if (info.is_scatter) continue;          // scatter 不走 LINE
            if (Object.keys(info.pay).length === 0) continue;
            // 各 reel 對此 sid 的命中機率(含 wild 替代)
            const hp = reelsOnLine.map(rid => _reelHitProb(mode, rid, sid, payMap, !info.is_wild));
            // 逐長度 N 計算「恰好 N 連(左起)」
            let runProb = 1;
            for (let n = 1; n <= reelsOnLine.length; n++) {
              runProb *= hp[n - 1];
              if (runProb <= 0) break;
              const pay = info.pay[n];
              if (!pay) continue;
              let exact = runProb;
              if (n < reelsOnLine.length) exact *= (1 - hp[n]);   // 第 N+1 reel 不命中
              lineRtp += exact * pay;
            }
          }
          out.perLine.push({ line_id: pl.line_id, rtp: lineRtp });
          grand += lineRtp;
        }
        // 每線吃 1 注 → 平均每注 RTP = Σ line_rtp / 線數
        out.total = validLines.length > 0 ? (grand / validLines.length) : 0;
        out.lineCount = validLines.length;
        out.mode = mode;
        out.ok = true;
        // 提醒:有未納入計算的機制
        const extras = [];
        if (multipliers.wild_mult_enabled || multipliers.progress_enabled || multipliers.random_enabled) extras.push('倍數');
        if (coinValues.enabled) extras.push('金幣');
        if (jackpots.length) extras.push('JP');
        if (symbolList.value.some(s => s.is_scatter)) extras.push('Scatter 觸發');
        if (extras.length) out.note = `未計入:${extras.join('、')}(僅 LINE base 賠付)`;
        return out;
      });
      const rtpPct = computed(() => (rtpResult.value.total * 100));
      const rtpVsTarget = computed(() => {
        const r = rtpResult.value;
        if (!r.ok || !r.target) return null;
        return (r.total * 100) - r.target;
      });
      // v5.4:模式增減時同步 progress 字串與每筆面額的 weight_by_mode
      watch(modeNames, (names) => {
        _syncProgressStrFromData();
        for (const dn of coinValues.denominations) {
          for (const m of names) if (!(m in dn.weight_by_mode)) dn.weight_by_mode[m] = 0;
        }
        // v6.0-b:輪帶 per-mode 同步移到後面專屬 watch（避免 TDZ）
      }, { immediate: true });
      // v6.4 死碼移除:coinDenomPct/coinExpectedValue 編輯器函式(服務不可達的 coin_values 分頁)已移除。

      // ── v5.1:JP 定義(13_Jackpots;文件生成自動帶入)──
      const jackpots = reactive(loadJackpots());

      // v6.2 #1:JP 快選命名(由小到大 5 階)+ 各階預設倍數
      const JP_PRESETS = ['MINI', 'MINOR', 'MAJOR', 'MAXI', 'GRAND'];
      const JP_PRESET_MULT = { MINI: 10, MINOR: 50, MAJOR: 500, MAXI: 2000, GRAND: 10000 };

      // v6.2 #2:全域類型 — 'FIXED' / 'PROGRESSIVE' 套用到全部;'CUSTOM' 各自設定
      //   初值由現有 JP 推導:全同類 → 該類;混合或空 → CUSTOM
      function deriveJpType() {
        if (!jackpots.length) return 'CUSTOM';
        const kinds = new Set(jackpots.map(j => (j.kind === 'PROGRESSIVE' ? 'PROGRESSIVE' : 'FIXED')));
        return kinds.size === 1 ? [...kinds][0] : 'CUSTOM';
      }
      const jpGlobalType = ref(deriveJpType());
      function setJpGlobalType(t) {
        jpGlobalType.value = t;
        if (t === 'FIXED' || t === 'PROGRESSIVE') {
          jackpots.forEach(j => { j.kind = t; });   // 一次套用到全部
        }
      }

      function addJackpot() {
        const taken = new Set(jackpots.map(j => j.jp_id));
        let i = 1;
        while (taken.has(`JP${i}`)) i++;
        const j = makeJackpot(`JP${i}`);
        if (jpGlobalType.value !== 'CUSTOM') j.kind = jpGlobalType.value;
        jackpots.push(j);
      }
      // v6.2 #1:快選新增命名 JP
      function addJackpotPreset(name) {
        const taken = new Set(jackpots.map(j => j.jp_id));
        let id = name, k = 2;
        while (taken.has(id)) id = name + (k++);
        const j = makeJackpot(id);
        j.name = name;
        j.mult = JP_PRESET_MULT[name] || 0;
        j.kind = (jpGlobalType.value !== 'CUSTOM') ? jpGlobalType.value : 'FIXED';
        jackpots.push(j);
      }
      function removeJackpot(idx) { jackpots.splice(idx, 1); }
      function toggleJackpotMode(j, modeName) {
        // mode_scope:'ALL' 或逗號分隔模式名;點 chip 切換
        if (modeName === 'ALL') { j.mode_scope = 'ALL'; return; }
        let cur = (j.mode_scope === 'ALL' || !j.mode_scope)
          ? [] : j.mode_scope.split(',').map(x => x.trim()).filter(Boolean);
        if (cur.includes(modeName)) cur = cur.filter(x => x !== modeName);
        else cur.push(modeName);
        j.mode_scope = cur.length ? cur.join(',') : 'ALL';
      }
      function jackpotHasMode(j, modeName) {
        if (modeName === 'ALL') return j.mode_scope === 'ALL' || !j.mode_scope;
        if (j.mode_scope === 'ALL' || !j.mode_scope) return false;
        return j.mode_scope.split(',').map(x => x.trim()).includes(modeName);
      }
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
      // §3.5:中獎線列右鍵 / ⋯ 快捷選單(編輯 / 刪除;無「複製」)
      const paylineCtx = ref({ open: false, x: 0, y: 0, idx: -1 });
      function openPaylineCtx(idx, ev) {
        selectedPaylineIdx.value = idx;
        paylineCtx.value = { open: true, x: ev.clientX, y: ev.clientY, idx };
        Vue.nextTick(() => {
          const el = document.querySelector('.payline-ctx'); if (!el) return;
          const p = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, PAD = 8;
          if (paylineCtx.value.x + p.width > vw - PAD) paylineCtx.value.x = Math.max(PAD, vw - p.width - PAD);
          if (paylineCtx.value.y + p.height > vh - PAD) paylineCtx.value.y = Math.max(PAD, vh - p.height - PAD);
        });
        document.addEventListener('pointerdown', _paylineCtxOutside, true);
        document.addEventListener('keydown', _paylineCtxKey, true);
      }
      function closePaylineCtx() {
        paylineCtx.value = { ...paylineCtx.value, open: false };
        document.removeEventListener('pointerdown', _paylineCtxOutside, true);
        document.removeEventListener('keydown', _paylineCtxKey, true);
      }
      function _paylineCtxOutside(ev) { const el = document.querySelector('.payline-ctx'); if (el && el.contains(ev.target)) return; closePaylineCtx(); }
      function _paylineCtxKey(ev) { if (ev.key === 'Escape') closePaylineCtx(); }
      function paylineCtxEdit() { const i = paylineCtx.value.idx; closePaylineCtx(); if (i >= 0) selectedPaylineIdx.value = i; }
      function paylineCtxDelete() { const i = paylineCtx.value.idx; closePaylineCtx(); if (i >= 0) removePayline(i); }
      // 對單一 payline 做驗證(close over layout)
      function paylineValid(pl) { return validatePayline(pl, layout); }
      // 把 payline 的座標轉成 SVG 用的中心點(close over layoutMetrics/LAYOUT_CELL_SIZE)
      function paylineCells(pl) {
        const v = paylineValid(pl);
        if (!v.valid || v.points.length === 0) return [];
        const { minTop } = layoutMetrics.value;
        const starts = layoutColStarts.value;
        const STEP = LAYOUT_CELL_SIZE + LAYOUT_CELL_GAP;
        const out = [];
        for (const pt of v.points) {
          const idx = pt.reel - 1;
          if (idx < 0 || idx >= layout.length) continue;
          const r = layout[idx];
          const abs_row = r.y_offset + (pt.row - 1);
          out.push({
            x: starts[idx] * STEP + LAYOUT_CELL_SIZE / 2,
            y: (abs_row - minTop) * STEP + LAYOUT_CELL_SIZE / 2,
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
      // v5.2:切到空 path 的線自動進入點選模式,省一次手動開關
      watch(selectedPaylineIdx, (idx) => {
        const pl = paylines[idx];
        if (pl && !(pl.path || '').trim()) paylineClickMode.value = true;
      });

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
          return { kind: 'warn', msg: '前 3 格與其他中獎線重疊(官方線表常見;僅提醒,不阻擋匯出/載入)' };   // v8.7 A-3 降級
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
      //  v6.2 / Q4:中獎線自動產生(批次)
      //   方式:general(一般線,maxStep=2)/ adjacent(相鄰≤1)
      //   寫入:replace 取代全部 / append 去重追加
      //   決策:不規則盤面先擋(僅等高盤面);線數 10–50
      // ──────────────────────────────────────────────────────────
      const paylineGenOpen   = ref(false);
      const paylineGenMethod = ref('general');   // 'general' | 'adjacent'
      const paylineGenCount  = ref(20);
      const paylineGenMode   = ref('replace');   // 'replace' | 'append'

      function togglePaylineGen(ev) {
        if (ev) ev.stopPropagation();
        paylineGenOpen.value = !paylineGenOpen.value;
        if (paylineGenOpen.value) paylineAddMenuOpen.value = false;
      }

      // 等高盤面?(各輪 max_rows 相同)— 不規則盤面先擋
      const paylineBoardUniform = computed(() => {
        if (layout.length === 0) return false;
        const h0 = layout[0].max_rows;
        return layout.every(r => r.max_rows === h0);
      });

      // 此盤面 + 當前方式 的可用上限(LINE 前 3 格唯一規則下)
      //   v6.3:① 只在面板開啟時才計算(避免關閉時每次 reactive 變動都跑全量 DFS)
      //         ② 支援不等高盤面(演算法逐輪夾擠各輪上限)
      const paylineGenAvailable = computed(() => {
        if (!paylineGenOpen.value || layout.length === 0) return 0;
        const rows = layout.map(r => r.max_rows);
        const res = generatePaylinePoints({
          reelCount: layout.length, rows,
          method: paylineGenMethod.value, count: 9999,
          lineMode: paylineLineMode.value,
        });
        return res.available;
      });

      function _clampGenCount() {
        let n = Math.round(Number(paylineGenCount.value) || 0);
        if (n < 10) n = 10;
        if (n > 50) n = 50;
        paylineGenCount.value = n;
        return n;
      }

      function runPaylineGen() {
        if (layout.length === 0) {
          emit('status', { type: 'wait', msg: '請先在 02_Layout 設定盤面結構' });
          return;
        }
        // v6.3:不再硬擋不等高盤面 — generatePaylinePoints 會逐輪夾擠各輪列數上限。
        const count = _clampGenCount();
        const rows = layout.map(r => r.max_rows);
        const res = generatePaylinePoints({
          reelCount: layout.length, rows,
          method: paylineGenMethod.value, count,
          lineMode: paylineLineMode.value,
        });
        if (!res.points || res.points.length === 0) {
          emit('status', { type: 'err', msg: '無法產生任何中獎線' });
          return;
        }
        const dir = curScanDir.value || 'LTR';
        const methodLabel = paylineGenMethod.value === 'adjacent' ? '相鄰≤1' : '一般';
        const built = res.points.map((l, i) => ({
          line_id: 0,
          path: _pointsToPathString(_sortPointsByReel(l.points)),
          direction: dir,
          notes: l.name || `${methodLabel} #${i + 1}`,
        }));

        if (paylineGenMode.value === 'replace') {
          if (paylines.length > 0 &&
              !confirm(`將以 ${built.length} 條自動產生的中獎線「取代」現有 ${paylines.length} 條,確定?`)) return;
          built.forEach((b, i) => { b.line_id = i + 1; });
          paylines.splice(0, paylines.length, ...built);
          selectedPaylineIdx.value = 0;
          paylineGenOpen.value = false;
          const note = res.capped ? `(已達此盤面上限 ${res.available} 條)` : '';
          emit('status', { type: 'ok', msg: `已產生 ${built.length} 條中獎線;方式:${methodLabel}${note}` });
        } else {
          // append:以 path 去重、續號
          const existing = new Set(paylines.map(p => p.path));
          let nextId = _newPaylineNextId();
          let added = 0;
          for (const b of built) {
            if (existing.has(b.path)) continue;
            b.line_id = nextId++;
            paylines.push(b);
            existing.add(b.path);
            added++;
          }
          selectedPaylineIdx.value = paylines.length - 1;
          paylineGenOpen.value = false;
          emit('status', { type: 'ok', msg: `已追加 ${added} 條(去重後);方式:${methodLabel}` });
        }
      }

      // v6.2 / Q4:清空全部中獎線(與「取代/追加」湊成完整批次操作)
      function clearAllPaylines() {
        if (paylines.length === 0) {
          emit('status', { type: 'wait', msg: '目前沒有中獎線' });
          return;
        }
        if (!confirm(`確定清空全部 ${paylines.length} 條中獎線?此動作無法復原。`)) return;
        paylines.splice(0, paylines.length);
        selectedPaylineIdx.value = 0;
        emit('status', { type: 'ok', msg: '已清空全部中獎線' });
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

      // ── 07b_Gen_Limits 產牌限制 / 生成期約束(v7.11)──
      //   單一真相:genLimits reactive 陣列 + LS slotplanner.aconfig.genLimits.v1。
      //   兩入口共用(規則頁「產牌限制」子分頁 + 符號卡);掛 window.SlotPlanner.genLimits 供 symbol.js 讀寫同一份。
      const genLimits = reactive(loadGenLimits());
      // 掛上共享參考(symbol.js 透過 SP.genLimits 讀寫同一陣列;reactivity 跨元件同步)
      SP.genLimits = genLimits;

      // ── 07c_Gen_Constraints 關聯型產牌條件(§4.8/§4.9;甲已授權新 LS 鍵)──
      //   多符號合計 / 符號位置關係 / 整體盤面狀態 + 巢狀「除了」例外。
      //   單一真相:genConstraints reactive + LS slotplanner.aconfig.genConstraints.v1。
      //   本工具僅描述 + 帶給下游模擬工具,絕不執行。
      const LS_GENCONSTRAINTS_KEY = 'slotplanner.aconfig.genConstraints.v1';
      function makeGenConstraint(id) {
        return {
          constraint_id: id || '',
          enabled: true,
          ctype: 'sum',            // 'sum' 多符號合計 | 'pos' 位置關係 | 'board' 盤面狀態
          symbols: [],             // sum/pos:符號 id 陣列
          op: 'le',                // sum/board:'le'|'lt'|'eq'|'ge'
          value: 1,                // sum/board:數值
          value_type: 'fixed',     // 'fixed' 固定值 | 'dynamic' 動態值
          relation: '相鄰',        // pos:相鄰/同列/同行/不可同盤
          board_state: '已填滿',   // board:已填滿/含指定符號/有空位/全同色
          except: null,            // 巢狀例外 {connector:'any'|'all', items:[leaf|group]} 或 null
          notes: '',
        };
      }
      function loadGenConstraints() {
        try {
          const raw = localStorage.getItem(LS_GENCONSTRAINTS_KEY);
          if (!raw) return [];
          const arr = JSON.parse(raw);
          if (!Array.isArray(arr)) return [];
          return arr.map(c => ({ ...makeGenConstraint(''), ...c }));
        } catch (e) { console.warn('[config-editor] loadGenConstraints failed:', e); return []; }
      }
      function saveGenConstraints(arr) {
        try { localStorage.setItem(LS_GENCONSTRAINTS_KEY, JSON.stringify(arr)); return true; }
        catch (e) { console.warn('[config-editor] saveGenConstraints failed:', e); return false; }
      }
      const genConstraints = reactive(loadGenConstraints());
      SP.genConstraints = genConstraints;

      // §4.8 產牌條件 modal(關聯型 07c;3 型:sum 多符號合計 / pos 位置關係 / board 盤面狀態)
      //   「除了」巢狀 builder 於 Stage 3 併入(此版先不含例外)。
      const GC_OPS = [{ v: 'le', t: '≤' }, { v: 'lt', t: '＜' }, { v: 'eq', t: '＝' }, { v: 'ge', t: '≥' }];
      const GC_RELATIONS = ['相鄰', '同列', '同行', '不可同盤'];
      const GC_BOARD_STATES = ['已填滿', '含指定符號', '有空位', '全同色'];
      const gcDlg = reactive({
        open: false, editIdx: -1, ctype: 'sum', symbols: [], op: 'le',
        value: 1, value_type: 'fixed', relation: '相鄰', board_state: '已填滿', symPick: '',
        except: { connector: 'any', items: [] },
      });
      function gcOpLabel(op) { const o = GC_OPS.find(x => x.v === op); return o ? o.t : op; }
      function gcHasValue(ctype) { return ctype === 'sum' || ctype === 'board'; }
      function gcUsesSymbols(ctype) { return ctype === 'sum' || ctype === 'pos'; }
      function openGcDlg(idx) {
        if (idx != null && idx >= 0 && idx < genConstraints.length) {
          const c = genConstraints[idx];
          Object.assign(gcDlg, {
            open: true, editIdx: idx, ctype: c.ctype || 'sum', symbols: [...(c.symbols || [])],
            op: c.op || 'le', value: (c.value != null ? c.value : 1), value_type: c.value_type || 'fixed',
            relation: c.relation || '相鄰', board_state: c.board_state || '已填滿', symPick: '',
            except: (c.except && Array.isArray(c.except.items)) ? JSON.parse(JSON.stringify(c.except)) : { connector: 'any', items: [] },
          });
        } else {
          Object.assign(gcDlg, {
            open: true, editIdx: -1, ctype: 'sum', symbols: [], op: 'le',
            value: 1, value_type: 'fixed', relation: '相鄰', board_state: '已填滿', symPick: '',
            except: { connector: 'any', items: [] },
          });
        }
      }
      function closeGcDlg() { gcDlg.open = false; }
      function gcAddSym() { const s = gcDlg.symPick; if (s && !gcDlg.symbols.includes(s)) gcDlg.symbols.push(s); gcDlg.symPick = ''; }
      function gcRemoveSym(i) { gcDlg.symbols.splice(i, 1); }
      function gcDlgValid() {
        if (gcUsesSymbols(gcDlg.ctype)) {
          if (gcDlg.ctype === 'sum' && gcDlg.symbols.length < 1) return false;
          if (gcDlg.ctype === 'pos' && gcDlg.symbols.length < 2) return false;
        }
        if (gcHasValue(gcDlg.ctype) && (gcDlg.value === '' || gcDlg.value == null)) return false;
        return true;
      }
      function confirmGcDlg() {
        if (!gcDlgValid()) return;
        const base = gcDlg.editIdx >= 0 ? genConstraints[gcDlg.editIdx] : makeGenConstraint('');
        const rec = {
          ...base,
          ctype: gcDlg.ctype,
          symbols: gcUsesSymbols(gcDlg.ctype) ? [...gcDlg.symbols] : [],
          op: gcHasValue(gcDlg.ctype) ? gcDlg.op : 'le',
          value: gcHasValue(gcDlg.ctype) ? Number(gcDlg.value) : null,
          value_type: gcHasValue(gcDlg.ctype) ? gcDlg.value_type : 'fixed',
          relation: gcDlg.ctype === 'pos' ? gcDlg.relation : '',
          board_state: gcDlg.ctype === 'board' ? gcDlg.board_state : '',
          except: (gcDlg.except && Array.isArray(gcDlg.except.items) && gcDlg.except.items.length)
            ? { connector: gcDlg.except.connector, items: JSON.parse(JSON.stringify(gcDlg.except.items)) }
            : null,
        };
        if (gcDlg.editIdx >= 0) {
          genConstraints.splice(gcDlg.editIdx, 1, rec);
        } else {
          const taken = new Set(genConstraints.map(c => c.constraint_id).filter(Boolean));
          let i = genConstraints.length + 1, id = 'GC' + i;
          while (taken.has(id)) { i++; id = 'GC' + i; }
          rec.constraint_id = id;
          genConstraints.push(rec);
        }
        closeGcDlg();
      }
      function dupGenConstraint(idx) {
        if (idx < 0 || idx >= genConstraints.length) return;
        const taken = new Set(genConstraints.map(c => c.constraint_id).filter(Boolean));
        let i = genConstraints.length + 1, id = 'GC' + i;
        while (taken.has(id)) { i++; id = 'GC' + i; }
        const copy = { ...JSON.parse(JSON.stringify(genConstraints[idx])), constraint_id: id };
        genConstraints.splice(idx + 1, 0, copy);   // §4.4:複製插在原列後
      }
      function removeGenConstraint(idx) {
        if (idx < 0 || idx >= genConstraints.length) return;
        const c = genConstraints[idx];
        if (!confirm(`確定刪除關聯條件 ${c.constraint_id}?`)) return;
        genConstraints.splice(idx, 1);
      }
      function toggleGenConstraint(idx) {
        if (idx < 0 || idx >= genConstraints.length) return;
        genConstraints[idx].enabled = !genConstraints[idx].enabled;
      }
      // §4.4 顯示模板(不含例外後綴;例外於 Stage 3/4 併入)
      function humanizeGenConstraint(c) {
        if (!c) return '';
        const syms = (c.symbols || []).join(' ＋ ');
        let base;
        if (c.ctype === 'sum') base = `${syms || '(未選符號)'} 合計 ${gcOpLabel(c.op)} ${c.value}`;
        else if (c.ctype === 'pos') { const t = (c.symbols || []); base = `${t[0] || 'A'} 與 ${t[1] || 'B'} ${c.relation || ''}`; }
        else if (c.ctype === 'board') base = `${c.board_state || ''} ${gcOpLabel(c.op)} ${c.value}`;
        else base = c.constraint_id || '';
        const ex = gcExSentence(c.except);
        return ex ? `${base} · 除了 ${ex}` : base;
      }
      // §4.9「除了」巢狀 builder（任一/全部 + leaf/group 一層巢狀）
      function gcExTargetOptions(type) {
        if (type === 'symbol') return (symbolList.value || []).map(s => s.symbol_id);
        if (type === 'board') return GC_BOARD_STATES;
        return (modeNames.value || []);   // mode:實際模式清單
      }
      function gcExDefaultTarget(type) { const o = gcExTargetOptions(type); return o.length ? o[0] : ''; }
      function gcExAddLeaf(group) {
        const leaf = { kind: 'leaf', type: 'mode', target: gcExDefaultTarget('mode') };
        if (group && Array.isArray(group.items)) group.items.push(leaf);
        else gcDlg.except.items.push(leaf);
      }
      function gcExAddGroup() { gcDlg.except.items.push({ kind: 'group', connector: 'any', items: [] }); }
      function gcExRemoveItem(items, idx) { if (Array.isArray(items)) items.splice(idx, 1); }
      function gcExOnLeafTypeChange(leaf) { leaf.target = gcExDefaultTarget(leaf.type); }
      function gcExLeafText(leaf) {
        if (!leaf) return '';
        if (leaf.type === 'symbol') return '出現 ' + (leaf.target || '');
        if (leaf.type === 'board') return '盤面 ' + (leaf.target || '');
        return leaf.target || '';   // mode:直接文字
      }
      function gcExSentence(ex) {
        if (!ex || !Array.isArray(ex.items) || !ex.items.length) return '';
        const join = ex.connector === 'all' ? ' 且 ' : ' 或 ';
        return ex.items.map(it => {
          if (it && it.kind === 'group') {
            const inner = (it.items || []).map(gcExLeafText).join(it.connector === 'all' ? ' 且 ' : ' 或 ');
            return '(' + inner + ')';
          }
          return gcExLeafText(it);
        }).join(join);
      }
      function _gcInterval(gc) {
        const v = Number(gc.value);
        if (!isFinite(v)) return null;
        if (gc.op === 'le') return [-Infinity, v];
        if (gc.op === 'lt') return [-Infinity, v - 1];
        if (gc.op === 'ge') return [v, Infinity];
        if (gc.op === 'eq') return [v, v];
        return null;
      }
      // §4.11 衝突偵測(純靜態、非阻擋):同符號集的 sum 條件數值區間交集為空 → 確定矛盾。
      //   保守設計(零誤判):僅 sum + 固定值 + 完全相同符號集;交集真空才標 amber dot。
      function gcHasConflict(gc) {
        if (!gc || !gc.enabled || gc.ctype !== 'sum' || gc.value_type !== 'fixed') return false;
        const key = [...(gc.symbols || [])].sort().join('|');
        if (!key) return false;
        const iv = _gcInterval(gc);
        if (!iv) return false;
        for (const other of genConstraints) {
          if (!other || other.constraint_id === gc.constraint_id) continue;
          if (!other.enabled || other.ctype !== 'sum' || other.value_type !== 'fixed') continue;
          if ([...(other.symbols || [])].sort().join('|') !== key) continue;
          const oiv = _gcInterval(other);
          if (!oiv) continue;
          if (Math.max(iv[0], oiv[0]) > Math.min(iv[1], oiv[1])) return true;   // 交集空
        }
        return false;
      }
      const GC_CTYPE_LABEL = { sum: '多符號合計', pos: '符號位置關係', board: '整體盤面狀態' };

      // §4.10 棄牌條件 modal(簡單:條件 + 原因=notes;新建為 SOFT。HARD 僅 round-trip,不呈現於清單)
      const softDiscardItems = computed(() =>
        discards.map((d, idx) => ({ d, idx })).filter(x => x.d.discard_kind !== 'HARD'));
      const discardDlg = reactive({ open: false, editIdx: -1, condition: '', reason: '' });
      function openDiscardDlg(idx) {
        if (idx != null && idx >= 0 && idx < discards.length) {
          const d = discards[idx];
          Object.assign(discardDlg, { open: true, editIdx: idx, condition: d.condition || '', reason: d.notes || '' });
        } else {
          Object.assign(discardDlg, { open: true, editIdx: -1, condition: '', reason: '' });
        }
      }
      function closeDiscardDlg() { discardDlg.open = false; }
      function _newDiscardId() {
        const taken = new Set(discards.map(d => d.discard_id));
        let i = discards.length + 1;
        while (taken.has(`D${String(i).padStart(3, '0')}`)) i++;
        return `D${String(i).padStart(3, '0')}`;
      }
      function confirmDiscardDlg() {
        const cond = (discardDlg.condition || '').trim();
        if (!cond) return;   // §4.10:條件為空不提交
        const reason = (discardDlg.reason || '').trim();
        if (discardDlg.editIdx >= 0 && discards[discardDlg.editIdx]) {
          discards[discardDlg.editIdx].condition = cond;
          discards[discardDlg.editIdx].notes = reason;
        } else {
          const rec = makeDiscard(_newDiscardId());
          rec.discard_kind = 'SOFT'; rec.condition = cond; rec.notes = reason;
          rec.enabled = true;   // §4.10b
          discards.push(rec);
        }
        closeDiscardDlg();
      }
      function dupDiscardRow(idx) {
        if (idx < 0 || idx >= discards.length) return;
        const copy = { ...JSON.parse(JSON.stringify(discards[idx])), discard_id: _newDiscardId() };
        discards.splice(idx + 1, 0, copy);   // §4.7:複製插原列後
      }
      function removeDiscardRow(idx) {
        if (idx < 0 || idx >= discards.length) return;
        const d = discards[idx];
        if (!confirm(`確定刪除棄牌條件「${d.discard_id}」?`)) return;
        discards.splice(idx, 1);
      }

      // ── v8.8 / R4 B-6:位置型格子屬性(02d_Cell_Attributes)──
      //   新 LS key slotplanner.aconfig.cellattrs.v1(已納 aconfig-xlsx 快照/還原兩處);
      //   規格描述,引擎不消費。load/save 內聯(不動 helpers 純函式區,比照 gamble)。
      const CELLATTRS_LS_KEY = 'slotplanner.aconfig.cellattrs.v1';
      // G-2:cellAttr 正規化(defaults 打底 → 既有欄覆蓋;僅補齊缺欄:cap_value + 5 個動態狀態欄,
      //   不動任何既有值 → 舊資料零行為變更;新欄成 own property 供 Vue 反應)。
      function _normCellAttr(c) {
        c = (c && typeof c === 'object') ? c : {};
        return Object.assign({
          attr_id: '', reel: 1, row: 1, attr: 'MULT', value: '', mode_scope: 'ALL', notes: '',
          cap_value: '',
          state_type: '', state_init: '', state_trigger: '', on_state_action: '', state_region: '',
        }, c);
      }
      function _loadCellAttrs() {
        try {
          const raw = localStorage.getItem(CELLATTRS_LS_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr.map(_normCellAttr) : [];
        } catch (e) { return []; }
      }
      const cellAttrs = reactive(_loadCellAttrs());
      // ── v8.38 / GAP-T1:輪帶連動(Twin Spin 每局隨機抽連動組;純描述,抽取語意交下游)──
      //   新 LS key slotplanner.aconfig.reellinks.v1(30 授權);A.xlsx 對應新表 04c_Reel_Links
      //   (additive;舊檔無此 sheet → loader 降級 [] = 無連動)。
      //   一列 = 一個連動配置選項;每局在同 mode_scope 內依 Weight 抽一列。
      //   reels 空字串 = 「本局無連動」選項(供權重分佈含無連動結果)。
      const REELLINKS_LS_KEY = 'slotplanner.aconfig.reellinks.v1';
      function _normReelLink(l) {
        l = (l && typeof l === 'object') ? l : {};
        return {
          link_id:   (l.link_id != null ? String(l.link_id).trim() : ''),
          mode_scope:(l.mode_scope != null && String(l.mode_scope).trim()) ? String(l.mode_scope).trim() : 'ALL',
          reels:     (l.reels != null ? String(l.reels).trim() : ''),          // "2,3"(1-based,逗號分隔;'' = 無連動選項)
          weight:    Number(l.weight) || 0,
          link_kind: (l.link_kind != null && String(l.link_kind).trim()) ? String(l.link_kind).trim().toUpperCase() : 'CLONE',  // CLONE=內容相同 / MIRROR=左右鏡射
          notes:     (l.notes != null ? String(l.notes) : ''),
        };
      }
      function _loadReelLinks() {
        try {
          const raw = localStorage.getItem(REELLINKS_LS_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr.map(_normReelLink) : [];
        } catch (e) { return []; }
      }
      const reelLinks = reactive(_loadReelLinks());
      function addReelLink() {
        const taken = new Set(reelLinks.map(l => l.link_id).filter(Boolean));
        let i = reelLinks.length + 1;
        let id = `RL${String(i).padStart(3, '0')}`;
        while (taken.has(id)) { i++; id = `RL${String(i).padStart(3, '0')}`; }
        reelLinks.push(_normReelLink({ link_id: id, mode_scope: 'ALL', reels: '', weight: 100, link_kind: 'CLONE', notes: '' }));
      }
      function removeReelLink(idx) { if (idx >= 0 && idx < reelLinks.length) reelLinks.splice(idx, 1); }
      // 軟性 lint:reels 應為 1-based 逗號清單且至少 2 輪('' = 無連動選項合法)
      // ── v8.39 / GAP-F1+軌道系統 Phase 1:Track = 純幾何有序格子序列(30 授權新 LS key)──
      //   消費端:全域/模式 refill_track(_override)、WALK track 參數、02b/01 scroll_track。
      //   新表 02c_Tracks;缺表 → [] = 無軌道(安全降級)。純描述,推進/位移語意交下游。
      const TRACKS_LS_KEY = 'slotplanner.aconfig.tracks.v1';
      function _normTrack(t) {
        t = (t && typeof t === 'object') ? t : {};
        return {
          track_id: (t.track_id != null ? String(t.track_id).trim() : ''),
          scope:    (t.scope != null && String(t.scope).trim()) ? String(t.scope).trim() : 'MAIN',   // MAIN / PANEL:<pid>
          cells:    (t.cells != null ? String(t.cells).trim() : ''),   // "r,c;r,c;…"(1-based 有序)
          entry:    (t.entry != null && String(t.entry).trim()) ? String(t.entry).trim().toUpperCase() : 'START',
          notes:    (t.notes != null ? String(t.notes) : ''),
        };
      }
      function _loadTracks() {
        try {
          const raw = localStorage.getItem(TRACKS_LS_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr.map(_normTrack) : [];
        } catch (e) { return []; }
      }
      const tracks = reactive(_loadTracks());
      function addTrack() {
        const taken = new Set(tracks.map(t => t.track_id).filter(Boolean));
        let i = tracks.length + 1;
        let id = `T${String(i).padStart(3, '0')}`;
        while (taken.has(id)) { i++; id = `T${String(i).padStart(3, '0')}`; }
        tracks.push(_normTrack({ track_id: id, scope: 'MAIN', cells: '', entry: 'START', notes: '' }));
      }
      function removeTrack(idx) { if (idx >= 0 && idx < tracks.length) tracks.splice(idx, 1); }
      // ── 架構檢閱 #21:收集條 / 進度條(Collection Meters)──
      //   新 LS key slotplanner.aconfig.meters.v1(比照 tracks/reelLinks 慣例,已納入
      //   aconfig-xlsx 快照/還原);A.xlsx 對應新表 21_Collection_Meters(additive;
      //   舊檔無此 sheet → loader 降級 [] = 無收集條)。
      //   拼圖式機制原生只能描述「單次事件觸發單次動作」,收集條類玩法(Sweet Bonanza
      //   Scatter 收集、Money Train 計量、任何「累積到 N 才觸發」的橫向進度條)需要
      //   跨局/跨消除持續累積的狀態,硬塞進單一 PuzzleRule 得另開隱藏全域變數 + 多條規則
      //   湊「累積」與「歸零」語意。MeterDef 把它變成第一級描述:填充來源 + 容量 +
      //   歸零範圍 + 集滿動作,四個欄位講完。純描述,本工具引擎不消費。
      const METERS_LS_KEY = 'slotplanner.aconfig.meters.v1';
      const METER_RESET_SCOPES = ['CASCADE', 'SPIN', 'FEATURE'];
      // ── G-1:收集條分段門檻(tier)正規化。一段 = {threshold, action, params}。
      //   純描述;action 沿用 on_full_action 同慣例(ActionType 字面值或自由文字)。
      function _normMeterTier(t) {
        t = (t && typeof t === 'object') ? t : {};
        const th = Number(t.threshold);
        return {
          threshold: Number.isFinite(th) ? th : 0,
          action:    (t.action != null ? String(t.action).trim() : ''),
          params:    (t.params != null ? String(t.params).trim() : ''),
        };
      }
      function _normMeter(m) {
        m = (m && typeof m === 'object') ? m : {};
        return {
          meter_id:       (m.meter_id != null ? String(m.meter_id).trim() : ''),
          label:          (m.label != null ? String(m.label) : ''),
          mode_scope:     (m.mode_scope != null && String(m.mode_scope).trim()) ? String(m.mode_scope).trim() : 'ALL',
          fill_source:    (m.fill_source != null ? String(m.fill_source).trim() : ''),
          fill_amount:    Number(m.fill_amount) || 1,
          capacity:       Number(m.capacity) || 0,
          reset_scope:    (METER_RESET_SCOPES.includes(String(m.reset_scope).toUpperCase()) ? String(m.reset_scope).toUpperCase() : 'FEATURE'),
          on_full_action: (m.on_full_action != null ? String(m.on_full_action).trim() : ''),
          link_jackpot:   (m.link_jackpot != null ? String(m.link_jackpot).trim() : ''),
          carry_over:     !!m.carry_over,
          notes:          (m.notes != null ? String(m.notes) : ''),
          // ── G-1:分段門檻(additive;缺 → 空/0/False = 退回現行單一 capacity + on_full_action)──
          tiers:          Array.isArray(m.tiers) ? m.tiers.map(_normMeterTier) : [],
          tier_step:      Number(m.tier_step) > 0 ? Number(m.tier_step) : 0,
          tier_repeat:    !!m.tier_repeat,
        };
      }
      function _loadMeters() {
        try {
          const raw = localStorage.getItem(METERS_LS_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr.map(_normMeter) : [];
        } catch (e) { return []; }
      }
      const meters = reactive(_loadMeters());
      function addMeter() {
        const taken = new Set(meters.map(m => m.meter_id).filter(Boolean));
        let i = meters.length + 1;
        let id = `MT${String(i).padStart(3, '0')}`;
        while (taken.has(id)) { i++; id = `MT${String(i).padStart(3, '0')}`; }
        meters.push(_normMeter({ meter_id: id, label: '', mode_scope: 'ALL', fill_amount: 1, capacity: 10, reset_scope: 'FEATURE' }));
        emit('status', { type: 'ok', msg: `已新增收集條 ${id}` });
      }
      function removeMeter(idx) {
        if (idx < 0 || idx >= meters.length) return;
        const id = meters[idx].meter_id;
        meters.splice(idx, 1);
        emit('status', { type: 'ok', msg: `已刪除收集條「${id}」` });
      }
      // ── G-1:分段門檻編輯 ──
      function addMeterTier(mi) {
        const m = meters[mi];
        if (!m) return;
        if (!Array.isArray(m.tiers)) m.tiers = [];
        // 預填門檻:比現有最大門檻大一些(方便遞增輸入),否則預設 10
        const maxTh = m.tiers.reduce((mx, t) => Math.max(mx, Number(t.threshold) || 0), 0);
        m.tiers.push(_normMeterTier({ threshold: maxTh ? maxTh + 10 : 10, action: '', params: '' }));
      }
      function removeMeterTier(mi, ti) {
        const m = meters[mi];
        if (!m || !Array.isArray(m.tiers)) return;
        if (ti < 0 || ti >= m.tiers.length) return;
        m.tiers.splice(ti, 1);
      }
      // 絕對 / 比率型切換:比率型即 tier_step>0(每 N 個觸發 on_full_action)。
      //   切到比率型 → tier_step 給預設 3;切回絕對 → tier_step 歸 0。
      function setMeterTierMode(mi, mode) {
        const m = meters[mi];
        if (!m) return;
        if (mode === 'ratio') { if (!(Number(m.tier_step) > 0)) m.tier_step = 3; }
        else { m.tier_step = 0; m.tier_repeat = false; }
      }
      // 軟性 lint(警示不阻擋):容量非正數(0 合法 = 無上限純計數,不算警示)+ 填充來源空白
      function meterWarn(m) {
        if (!m) return '';
        if (!String(m.fill_source || '').trim()) return '⚠ 尚未設定填充來源(符號 ID 或條件式)';
        if (Number(m.capacity) < 0) return '⚠ 容量不可為負數';
        // G-1 tier lint:比率型步進須 > 0(setMeterTierMode 已保證,防手改);
        //   絕對門檻:門檻應遞增且各段須有動作(純提示,不阻擋)。
        if (Number(m.tier_step) > 0) {
          if (!(Number(m.tier_step) > 0)) return '⚠ 比率型每 N 個的 N 需為正數';
        } else if (Array.isArray(m.tiers) && m.tiers.length) {
          let prev = -Infinity;
          for (const t of m.tiers) {
            const th = Number(t.threshold);
            if (!Number.isFinite(th)) return '⚠ 有分段門檻非數字';
            if (th <= prev) return '⚠ 分段門檻建議由小到大遞增';
            prev = th;
            if (!String(t.action || '').trim()) return '⚠ 有分段門檻尚未設定動作';
          }
          if (Number(m.capacity) > 0 && prev > Number(m.capacity))
            return '⚠ 最高分段門檻超過容量(該段可能永不觸發)';
        }
        return '';
      }
      // Board v2 §6 同款複製:插在原列後,ID 另編避免撞號
      function duplicateMeter(idx) {
        if (idx < 0 || idx >= meters.length) return;
        const taken = new Set(meters.map(m => m.meter_id).filter(Boolean));
        let i = meters.length + 1;
        let id = `MT${String(i).padStart(3, '0')}`;
        while (taken.has(id)) { i++; id = `MT${String(i).padStart(3, '0')}`; }
        meters.splice(idx + 1, 0, _normMeter({ ...meters[idx], meter_id: id }));
      }
      // Board v2:反轉軌道方向(反轉座標序列;首 / 尾入口語意隨之翻面)
      function reverseTrack(idx) {
        if (idx < 0 || idx >= tracks.length) return;
        const parts = String(tracks[idx].cells || '').split(';').map(s => s.trim()).filter(Boolean);
        tracks[idx].cells = parts.reverse().join(';');
        emit('status', { type: 'ok', msg: `已反轉軌道 ${tracks[idx].track_id} 的方向` });
      }
      // 軟性 lint(警示不阻擋):格式 r,c 分號串、無重複;不相鄰連續格 → 警示(容許跳點軌道,決策點 5)
      function trackCellsWarn(t) {
        const s = String(t && t.cells || '').trim();
        if (!s) return '⚠ 路徑序列不可為空';
        const parts = s.split(';').map(p => p.trim()).filter(Boolean);
        const seen = new Set();
        let prev = null, jump = false;
        for (const p of parts) {
          const m = p.match(/^(\d+)\s*,\s*(\d+)$/);
          if (!m) return `⚠ 片段「${p}」格式應為 r,c(1-based)`;
          const r = Number(m[1]), c = Number(m[2]);
          if (r < 1 || c < 1) return `⚠ 片段「${p}」座標需 1-based`;
          const k = r + ',' + c;
          if (seen.has(k)) return `⚠ 座標 (${k}) 重複`;
          seen.add(k);
          if (prev && (Math.abs(prev[0] - r) + Math.abs(prev[1] - c)) !== 1) jump = true;
          prev = [r, c];
        }
        if (parts.length < 2) return '⚠ 軌道至少需 2 格';
        if (jump) return '⚠ 含不相鄰的連續格(跳點軌道;若非刻意請檢查序列)';
        return '';
      }
      // 供各消費端下拉(全域/模式/面板/WALK)
      const trackOptions = computed(() => tracks
        .filter(t => String(t.track_id || '').trim())
        .map(t => ({ value: t.track_id, label: t.track_id + (String(t.notes || '').trim() ? `（${String(t.notes).trim().slice(0, 12)}）` : '') })));
      // 孤兒軌道參照(v8.36 isOrphanGroupRef 同款哲學)
      function isOrphanTrackRef(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return false;
        return !tracks.some(t => String(t.track_id || '').trim() === s);
      }
      // canvas 唯讀疊加預覽:選中軌道 → 依 scope 取盤面尺寸,產 SVG 格線 + 序號 + 連線
      const trackPreviewIdx = ref(0);
      const trackPreview = computed(() => {
        const t = tracks[trackPreviewIdx.value];
        if (!t) return null;
        const scope = String(t.scope || 'MAIN');
        let cols, rows;
        if (scope.startsWith('PANEL:')) {
          const pid = scope.slice(6);
          const p = panels.find(x => x.panel_id === pid);
          cols = p ? (Number(p.width) || 1) : 5;
          rows = p ? (Number(p.height) || 1) : 3;
        } else {
          cols = layout.length || 5;
          rows = Math.max(1, ...layout.map(r => Number(r.max_rows) || 0), 3);
        }
        const CS = 34;   // cell size
        const pts = [];
        const s = String(t.cells || '').trim();
        for (const p of s.split(';').map(x => x.trim()).filter(Boolean)) {
          const m = p.match(/^(\d+)\s*,\s*(\d+)$/);
          if (!m) continue;
          const r = Number(m[1]), c = Number(m[2]);
          pts.push({ r, c, x: (c - 0.5) * CS, y: (r - 0.5) * CS, oob: (r > rows || c > cols) });
        }
        const grid = [];
        for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++)
          grid.push({ k: r + '-' + c, x: (c - 1) * CS, y: (r - 1) * CS });
        const line = pts.map(p => `${p.x},${p.y}`).join(' ');
        return { cols, rows, CS, w: cols * CS, h: rows * CS, grid, pts, line,
                 hasOob: pts.some(p => p.oob), entry: t.entry || 'START' };
      });

      function reelLinkWarn(l) {
        const s = String(l && l.reels || '').trim();
        if (!s) return '';
        const parts = s.split(',').map(p => p.trim()).filter(Boolean);
        if (!parts.every(p => /^\d+$/.test(p) && Number(p) >= 1)) return '⚠ 應為 1-based 輪號逗號清單(如 2,3)';
        if (parts.length < 2) return '⚠ 連動至少需 2 輪(留空 = 無連動選項)';
        if (new Set(parts).size !== parts.length) return '⚠ 輪號重複';
        return '';
      }
      const CELL_ATTR_OPTIONS = [
        { value: 'MULT',     label: '固定格乘數(MULT)' },
        { value: 'ENHANCER', label: '強化格(ENHANCER)' },
        { value: 'FRAME',    label: '火框 / 特殊框(FRAME)' },
        { value: 'GOLD',     label: '金框格(GOLD)' },
        { value: 'CUSTOM',   label: '自訂(於備註描述)' },
      ];
      // ── G-2 / D3甲:動態狀態型別(空=純靜態屬性=現行行為)。命中 Gems 標記/Temple Tumble 遮蓋/
      //   Hellcatraz 倒數/Tome Eye。純描述,狀態機執行歸下游。 ──
      const CELL_STATE_OPTIONS = [
        { value: '',          label: '（無狀態）' },
        { value: 'MARKER',    label: '標記(MARKER)' },
        { value: 'COVER',     label: '遮蓋·需擊破(COVER)' },
        { value: 'COUNTDOWN', label: '倒數·每 spin −1(COUNTDOWN)' },
        { value: 'COUNTER',   label: '累加(COUNTER)' },
      ];
      // D2甲:複用現有觸發 + 新增 ON_WIN_OVERLAP(格級中獎覆蓋);允許自由字串(datalist)。
      const STATE_TRIGGER_OPTIONS = [
        { value: 'ON_WIN_OVERLAP',   label: 'ON_WIN_OVERLAP(中獎覆蓋此格)' },
        { value: 'ON_SYMBOL_LANDED', label: 'ON_SYMBOL_LANDED(符號落此格)' },
        { value: 'ON_COMBO_STEP',    label: 'ON_COMBO_STEP(連爆步進)' },
      ];
      const CELL_STATE_LABEL = Object.fromEntries(CELL_STATE_OPTIONS.filter(o => o.value).map(o => [o.value, o.label]));
      function addCellAttr() {
        const taken = new Set(cellAttrs.map(c => c.attr_id).filter(Boolean));
        let i = cellAttrs.length + 1;
        while (taken.has('CA' + i)) i++;
        cellAttrs.push(_normCellAttr({ attr_id: 'CA' + i, reel: 1, row: 1, attr: 'MULT',
                         value: '', mode_scope: 'ALL', notes: '', cap_value: '' }));
      }
      function removeCellAttr(idx) { cellAttrs.splice(idx, 1); }

      // ── #2（Board v2 §11）:機制篩選（檢視;純靜態;view-only）──
      //   高亮「精確錨定到格」的來源 = 02d 格子屬性。每型一選項,選取 → 該型 (reel,row) 格加 .flt。
      //   規則類機制（倍數/Scatter/黏著 Wild → 哪些格）暫緩:規則多瞄符號/條件而非固定格,
      //   且規格 §11 本身把「圈格」移到規則編輯器。不呼叫 logic_parser、不物化盤面、無契約變更。
      const cvMechFilter = ref('');   // '' = 全部（不高亮）;否則 = CELL_ATTR value（MULT/GOLD/…）或 'state:XXX'
      const CELL_ATTR_LABEL = Object.fromEntries(CELL_ATTR_OPTIONS.map(o => [o.value, o.label]));
      const cvMechOptions = computed(() => {
        const cnt = {};
        for (const a of cellAttrs) { const t = a.attr || 'MULT'; cnt[t] = (cnt[t] || 0) + 1; }
        const opts = Object.keys(cnt).map(t => ({ value: t, label: (CELL_ATTR_LABEL[t] || t), count: cnt[t] }));
        // G-2:動態狀態型別亦可篩選(value 前綴 state: 以與靜態屬性區隔)
        const scnt = {};
        for (const a of cellAttrs) { const s = String(a.state_type || '').trim().toUpperCase(); if (s) scnt[s] = (scnt[s] || 0) + 1; }
        for (const s of Object.keys(scnt)) opts.push({ value: 'state:' + s, label: '狀態·' + (CELL_STATE_LABEL[s] || s), count: scnt[s] });
        return opts;
      });
      const cvFltSet = computed(() => {
        const s = new Set();
        const f = cvMechFilter.value;
        if (!f) return s;
        const isState = f.startsWith('state:');
        const want = isState ? f.slice(6) : f;
        for (const a of cellAttrs) {
          if (isState) { if (String(a.state_type || '').trim().toUpperCase() !== want) continue; }
          else if ((a.attr || 'MULT') !== want) continue;
          const reel = Number(a.reel) || 1, row = Number(a.row) || 1;
          s.add((reel - 1) + ',' + (row - 1));   // cvGrid key = "col,row"(0-based;col=reel-1、row=絕對列-1)
        }
        return s;
      });
      const cvFltInfo = computed(() => {
        const f = cvMechFilter.value;
        if (!f) return null;
        const lbl = f.startsWith('state:') ? ('狀態·' + (CELL_STATE_LABEL[f.slice(6)] || f.slice(6)))
                                           : (CELL_ATTR_LABEL[f] || f);
        return { label: lbl, count: cvFltSet.value.size };
      });
      // G-2 / D3甲:有 State_Type 的錨點格集合(canvas 常駐狀態徽章;與洞格紅標視覺區分)。
      const cvStateSet = computed(() => {
        const s = new Set();
        for (const a of cellAttrs) {
          if (!String(a.state_type || '').trim()) continue;
          const reel = Number(a.reel) || 1, row = Number(a.row) || 1;
          s.add((reel - 1) + ',' + (row - 1));
        }
        return s;
      });

      // ── P0-3:符號家族(03d_Symbol_Groups)──
      //   新 LS key slotplanner.aconfig.symbolgroups.v1(D7 授權;已納 aconfig-xlsx 快照/還原、本檔 R-H1)。
      //   單一真相:symbolGroups reactive 陣列;掛 SP.symbolGroups 供 symbol.js 兩入口共用
      //   (符號卡「所屬家族」下拉 + 03_Symbols 頁「符號家族」子區塊);deep watch 於 symbol.js 變更時亦持久化。
      //   純描述,引擎不消費。load/save 內聯(不動凍結 helpers)。成員由 registry symbol.group_id 反查(不存此陣列)。
      const SYMGROUPS_LS_KEY = 'slotplanner.aconfig.symbolgroups.v1';
      function _normSymGroup(g) {
        g = (g && typeof g === 'object') ? g : {};
        const num = (v) => Number(v) || 0;
        return {
          group_id: (g.group_id != null ? String(g.group_id).trim() : ''),
          display_name: (g.display_name != null ? String(g.display_name) : ''),
          match_mode: (g.match_mode != null && String(g.match_mode).trim())
            ? String(g.match_mode).trim().toUpperCase() : 'ANY_MIXED',
          members_keep_individual: g.members_keep_individual !== false,   // 缺/非 false → true
          mode_scope: (g.mode_scope != null ? String(g.mode_scope).trim() : ''),
          pay_3x: num(g.pay_3x), pay_4x: num(g.pay_4x), pay_5x: num(g.pay_5x), pay_6x: num(g.pay_6x),
          pay_by_mode: (function (pbm) {   // P0-3 進階:per-mode 費率覆寫 { mode: {pay_3x..6x} }
            const o = {};
            if (pbm && typeof pbm === 'object') {
              for (const mk of Object.keys(pbm)) {
                const k = String(mk).trim(); if (!k) continue;
                const s = pbm[mk] || {};
                o[k] = { pay_3x: num(s.pay_3x), pay_4x: num(s.pay_4x), pay_5x: num(s.pay_5x), pay_6x: num(s.pay_6x) };
              }
            }
            return o;
          })(g.pay_by_mode),
          notes: (g.notes != null ? String(g.notes) : ''),
        };
      }
      function _loadSymbolGroups() {
        try {
          const raw = localStorage.getItem(SYMGROUPS_LS_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr.map(_normSymGroup) : [];
        } catch (e) { return []; }
      }
      const symbolGroups = reactive(_loadSymbolGroups());
      // v8.36 / 🟢-2:規則頁「可家族化」符號參數的下拉選項(group:<gid> 全員 / group_any:<gid> 隨機一種)。
      //   讀單一真相 symbolGroups;無家族時回空陣列(下拉不出現家族段)。
      const symGroupOptions = computed(() => {
        const out = [];
        for (const g of symbolGroups) {
          const gid = String(g && g.group_id || '').trim();
          if (!gid) continue;
          const nm = String(g.display_name || '').trim();
          const suffix = nm ? `（${nm}）` : '';
          out.push({ value: `group:${gid}`,     label: `group:${gid}${suffix} — 家族全員` });
          out.push({ value: `group_any:${gid}`, label: `group_any:${gid}${suffix} — 隨機一種` });
        }
        return out;
      });
      // v8.36 / 🟢-2:孤兒家族參照(值為 group:/group_any: 但家族已不存在)→ 下拉補顯示 + ⚠ 提示;
      //   沿用「提示回退、不自動清孤兒」哲學(renamePanel / symbol.group_id 前例)。
      function isOrphanGroupRef(v) {
        const s = String(v == null ? '' : v).trim();
        const m = s.match(/^group(?:_any)?:(.+)$/);
        if (!m) return false;
        const gid = m[1].trim();
        return !symbolGroups.some(g => String(g && g.group_id || '').trim() === gid);
      }
      // 註:symbol-page 與 config-page 互斥掛載(page 1 / 3),不同時存在 →
      //   兩元件各自讀寫同一 LS key(slotplanner.aconfig.symbolgroups.v1),以 LS 為交換媒介
      //   (符合本工具「LS 權威 + buildAxlsxBufferFromLS 唯一匯出」哲學),不走跨元件共用參照。
      const SYMGROUP_MATCH_MODES = [
        { value: 'ANY_MIXED', label: '任意混合成員即成家族(ANY_MIXED)' },
      ];
      function _nextGenLimitId() {
        const taken = new Set(genLimits.map(g => g.limit_id).filter(Boolean));
        let i = genLimits.length + 1;
        let id = `GL${String(i).padStart(3, '0')}`;
        while (taken.has(id)) { i++; id = `GL${String(i).padStart(3, '0')}`; }
        return id;
      }
      const genLimitDuplicateIds = computed(() => {
        const seen = new Set(); const dup = new Set();
        for (const g of genLimits) {
          const id = (g.limit_id || '').trim();
          if (!id) continue;
          if (seen.has(id)) dup.add(id);
          seen.add(id);
        }
        return dup;
      });
      // 動態 zone 選項:由目前 layout(含副輪)+ panels 產生
      const genLimitZoneOptions = computed(() => genLimitZones(layout, panels));
      SP.genLimitZoneOptions = genLimitZoneOptions;  // 供 symbol.js 共用
      // 符號下拉選項(啟用符號的 symbol_id / name)
      const genLimitSymbolOptions = computed(() =>
        (symbolList.value || [])
          .filter(x => x && x.enabled !== false)
          .map(x => (x.symbol_id && String(x.symbol_id).trim()) || x.name)
          .filter(Boolean)
      );
      function genLimitStatusOf(gl) { return genLimitStatus(gl, genLimitDuplicateIds.value); }
      function addGenLimit(symbolId) {
        const gl = makeGenLimit(_nextGenLimitId());
        if (symbolId) gl.symbol_id = symbolId;
        genLimits.push(gl);
        return gl;
      }
      function removeGenLimit(idx) {
        if (idx >= 0 && idx < genLimits.length) genLimits.splice(idx, 1);
      }
      // 供 symbol.js 入口 A 用:從某符號卡新增/移除(預帶該符號)
      SP.addGenLimit = addGenLimit;
      SP.removeGenLimitByRef = (gl) => {
        const i = genLimits.indexOf(gl);
        if (i >= 0) genLimits.splice(i, 1);
      };

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

      // ── v8.16:mode_scope 多選共用 helpers ──
      //   語義:'ALL'/空 = 全模式;逗號名單 = 多選(與 v6.2 constraints、
      //   schemas.mode_in_scope 同語義)。點 ALL = 清空回 ALL;全取消 = 回 ALL。
      //   字串版供裸字串狀態(ruleDlg.mode);物件版供 .mode_scope 欄位。
      function scopeStrHas(v, s) {
        if (s === 'ALL') return v === 'ALL' || !v;
        if (v === 'ALL' || !v) return false;
        return String(v).split(',').map(x => x.trim()).includes(s);
      }
      function toggleScopeStr(v, s) {
        if (s === 'ALL') return 'ALL';
        let cur = (v === 'ALL' || !v)
          ? [] : String(v).split(',').map(x => x.trim()).filter(Boolean);
        cur = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
        return cur.length ? cur.join(',') : 'ALL';
      }
      function scopeHasMode(o, s) { return scopeStrHas(o && o.mode_scope, s); }
      function toggleScopeMode(o, s) { if (o) o.mode_scope = toggleScopeStr(o.mode_scope, s); }
      // v8.28 / 缺口B:模式解鎖前提多選(unlock_requires 為陣列;沿用 scope 多選晶片手感)。
      function modeUnlockHas(m, name) {
        return !!(m && Array.isArray(m.unlock_requires) && m.unlock_requires.includes(name));
      }
      function modeUnlockToggle(m, name) {
        if (!m) return;
        if (!Array.isArray(m.unlock_requires)) m.unlock_requires = [];
        const i = m.unlock_requires.indexOf(name);
        if (i >= 0) m.unlock_requires.splice(i, 1);
        else m.unlock_requires.push(name);
      }

      // v6.2 硬約束#2:套用模式多選(mode_scope='ALL' 或逗號分隔;py 端 mode_in_scope 已支援)
      function toggleConstraintMode(c, s) {
        if (s === 'ALL') { c.mode_scope = 'ALL'; return; }
        let cur = (c.mode_scope === 'ALL' || !c.mode_scope)
          ? [] : c.mode_scope.split(',').map(x => x.trim()).filter(Boolean);
        if (cur.includes(s)) cur = cur.filter(x => x !== s);
        else cur.push(s);
        c.mode_scope = cur.length ? cur.join(',') : 'ALL';
      }
      function constraintHasMode(c, s) {
        if (s === 'ALL') return c.mode_scope === 'ALL' || !c.mode_scope;
        if (c.mode_scope === 'ALL' || !c.mode_scope) return false;
        return c.mode_scope.split(',').map(x => x.trim()).includes(s);
      }
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

      // ──────────────────────────────────────────────────────────
      //  v6.0-b:真實輪帶（04b_Reel_Strips）
      //  - reelStrips.strips[mode][reelId] = [symId,...]（編輯時以逗號字串呈現）
      //  - 與 04 權重雙向轉換;啟用時引擎改視窗抽樣（自然 stacking）
      // ──────────────────────────────────────────────────────────
      const reelStrips = reactive(loadReelStrips());
      const stripActiveMode = ref('');
      const stripGenLen = ref(30);       // v6.0-b:生成輪帶目標長度
      const stripGenStacked = ref(false); // v6.0-b:生成時是否聚成 stacked
      // 編輯用字串快取:stripStr[mode][reelId] = "H1, H1, L1, ..."
      const stripStr = reactive({});
      function _ensureStripMode(mode) {
        if (!reelStrips.strips[mode]) reelStrips.strips[mode] = {};
        if (!stripStr[mode]) stripStr[mode] = {};
        for (const r of layout) {
          const rid = r.reel_id;
          if (stripStr[mode][rid] === undefined) {
            stripStr[mode][rid] = stripToStr(reelStrips.strips[mode][rid] || []);
          }
        }
      }
      function stripLen(mode, rid) {
        return parseStripStr(stripStr[mode] && stripStr[mode][rid]).length;
      }
      // 編輯字串 → 寫回 reelStrips.strips（即時）
      function commitStrip(mode, rid) {
        const arr = parseStripStr(stripStr[mode] && stripStr[mode][rid]);
        if (!reelStrips.strips[mode]) reelStrips.strips[mode] = {};
        if (arr.length) reelStrips.strips[mode][rid] = arr;
        else delete reelStrips.strips[mode][rid];
      }
      // ─── v8.43 / C-1 GAP-T2:輪帶變體(Mode_Scope 慣用式 "模式#變體名") ───
      //   變體存於 reelStrips.strips 既有形(任意字串鍵),LS 形零變、契約零改;
      //   下游查無此模式名自然惰性;SWITCH_STRIP(variant=) 引用。
      //   _ensureStripMode / commitStrip / 長度工具對任意鍵原樣可用。
      function stripBaseOf(key) {
        const s = String(key || '');
        const i = s.indexOf('#');
        return i >= 0 ? s.slice(0, i) : s;
      }
      function stripVariantsOf(mode) {
        const base = stripBaseOf(mode);
        return Object.keys(reelStrips.strips).filter(k => k.startsWith(base + '#')).sort();
      }
      function addStripVariant() {
        const base = stripBaseOf(stripActiveMode.value);   // 變體上開變體 → 落回其 base(不巢狀)
        if (!base) return;
        const name = String(prompt(`為模式「${base}」新增輪帶變體\n變體名(不可含 #):`) || '').trim();
        if (!name) return;
        if (name.includes('#')) {
          emit('status', { type: 'err', msg: '變體名不可含「#」(單層變體,不巢狀)' });
          return;
        }
        const key = `${base}#${name}`;
        if (reelStrips.strips[key] || stripStr[key]) {
          emit('status', { type: 'err', msg: `變體「${key}」已存在` });
          return;
        }
        _ensureStripMode(key);
        stripActiveMode.value = key;
        emit('status', { type: 'ok', msg: `已新增輪帶變體「${key}」;規則以 SWITCH_STRIP(variant="${key}") 引用` });
      }
      function removeStripVariant(key) {
        if (!String(key || '').includes('#')) return;   // 只刪變體鍵,主模式帶不經此路
        if (!confirm(`確定刪除輪帶變體「${key}」?\n(引用它的 SWITCH_STRIP 規則需自行調整)`)) return;
        delete reelStrips.strips[key];
        delete stripStr[key];
        if (stripActiveMode.value === key) stripActiveMode.value = stripBaseOf(key);
        emit('status', { type: 'ok', msg: `已刪除輪帶變體「${key}」` });
      }
      function selectStripKey(key) {
        _ensureStripMode(key);   // 變體鍵自 LS 載回後 stripStr 未必已建,選取時 lazy 確保
        stripActiveMode.value = key;
      }
      // strip 隱含的符號分佈 %（驗證 / 預覽用）
      // ─── v8.13/批C:輪帶輔助 —— 建議長度 / 權重對照 / 07b 約束提示 ───
      // 核心定位不變:純編輯輔助與描述層提示,不做 RTP 反推配平(那是下游模擬工具的事)。
      function suggestedStripLen() {
        // 依盤面自動建議:最大視窗列數 × 8,下限 24、上限 120(業界常見帶長區間的保守建議)
        const maxRows = Math.max(3, ...layout.map(r => Number(r.max_rows) || 0));
        return Math.min(120, Math.max(24, maxRows * 8));
      }
      // 對照表:每符號「輪帶出現% vs 04 權重目標% vs Δ」;含輪帶中未定義符號偵測
      function stripCompare(mode, rid) {
        const arr = parseStripStr(stripStr[mode] && stripStr[mode][rid]);
        if (!arr.length) return [];
        const counts = stripToWeights(arr);
        const tot = arr.length;
        const e = reelW(mode);
        let wTot = 0;
        for (const sid of e.symbol_ids) wTot += Number(e.weights[`${rid}-${sid}`]) || 0;
        const known = new Set(e.symbol_ids);
        const out = [];
        for (const sid of e.symbol_ids) {
          const c = counts[sid] || 0;
          const w = Number(e.weights[`${rid}-${sid}`]) || 0;
          if (c === 0 && w === 0) continue;
          const sp = c / tot * 100;
          const wp = wTot > 0 ? w / wTot * 100 : 0;
          out.push({ sid, count: c, stripPct: sp, weightPct: wp, delta: sp - wp, unknown: false });
        }
        for (const [sid, c] of Object.entries(counts)) {
          if (!known.has(sid)) out.push({ sid, count: c, stripPct: c / tot * 100, weightPct: 0, delta: null, unknown: true });
        }
        return out.sort((a, b) => b.count - a.count);
      }
      // 07b 產牌限制 × 輪帶的「可靠推論」提示(只提示邏輯上必然的衝突,不越界猜測視窗抽樣結果):
      //   MAIN zone、mode 命中、min_count > 0 的符號,若在「全部輪帶」計次總和 = 0 → 該局盤面
      //   永遠湊不出下限 → 必違反。max_count 與輪帶計次無必然關係,不提示。
      function stripLimitConflicts(mode) {
        const out = [];
        const totalBySym = {};
        for (const r of layout) {
          const arr = parseStripStr(stripStr[mode] && stripStr[mode][r.reel_id]);
          for (const [sid, c] of Object.entries(stripToWeights(arr))) {
            totalBySym[sid] = (totalBySym[sid] || 0) + c;
          }
        }
        const anyStrip = Object.keys(totalBySym).length > 0;
        if (!anyStrip) return out;
        for (const gl of genLimits) {
          if (!gl || !gl.symbol_id) continue;
          if (String(gl.zone || 'MAIN') !== 'MAIN') continue;
          const ms = gl.mode_scope || 'ALL';
          if (ms !== 'ALL' && ms !== mode) continue;
          const min = Number(gl.min_count) || 0;
          if (min <= 0) continue;
          if ((totalBySym[gl.symbol_id] || 0) === 0) {
            out.push({ limit_id: gl.limit_id, symbol_id: gl.symbol_id, min });
          }
        }
        return out;
      }

      function stripDist(mode, rid) {
        const arr = parseStripStr(stripStr[mode] && stripStr[mode][rid]);
        const w = stripToWeights(arr);
        const tot = arr.length || 1;
        return Object.entries(w).map(([sid, c]) => ({ sid, count: c, pct: c / tot * 100 }))
          .sort((a, b) => b.count - a.count);
      }
      // ── 權重頁 W3:唯讀色帶預覽輔助(§3.2)──
      //   stripBand:回傳該輪帶的 sid 序列(讀編輯字串,與 textarea 即時一致)。
      //   stripSegColor:符號的 swatch 底色(registry;缺色降級為灰)。純顯示、不動資料。
      function stripBand(mode, rid) {
        return parseStripStr(stripStr[mode] && stripStr[mode][rid]);
      }
      function stripSegColor(sid) {
        try { const m = registry.swatchMap(); const c = m && m[sid]; return (c && c[0]) || 'rgb(var(--tint-muted) / 0.30)'; }
        catch (e) { return 'rgb(var(--tint-muted) / 0.30)'; }
      }
      // 從 04 權重生成 strip（單一 reel）
      function genStripFromWeights(mode, rid, targetLen, stacked) {
        const e = reelW(mode);
        const wmap = {};
        for (const sid of e.symbol_ids) {
          const w = Number(e.weights[`${rid}-${sid}`]) || 0;
          if (w > 0) wmap[sid] = w;
        }
        const arr = weightsToStrip(wmap, Number(targetLen) || 30, !!stacked);
        if (!stripStr[mode]) stripStr[mode] = {};
        stripStr[mode][rid] = stripToStr(arr);
        commitStrip(mode, rid);
        emit('status', { type: 'ok', msg: `R${rid} 已由權重生成 ${arr.length} 格輪帶${stacked ? '（stacked）' : ''}` });
      }
      function genAllStripsFromWeights(mode, targetLen, stacked) {
        for (const r of layout) genStripFromWeights(mode, r.reel_id, targetLen, stacked);
        emit('status', { type: 'ok', msg: `已由權重生成全部輪帶（${mode}）` });
      }
      // strip → 04 權重（計次寫回該 reel 列）
      function applyStripToWeights(mode, rid) {
        const arr = parseStripStr(stripStr[mode] && stripStr[mode][rid]);
        if (!arr.length) { emit('status', { type: 'warn', msg: `R${rid} 輪帶為空,無法轉權重` }); return; }
        const w = stripToWeights(arr);
        _pushUndo('reel', mode);
        const e = reelW(mode);
        for (const sid of e.symbol_ids) e.weights[`${rid}-${sid}`] = Number(w[sid]) || 0;
        emit('status', { type: 'ok', msg: `R${rid} 輪帶計次已寫回 04 權重` });
      }
      function applyAllStripsToWeights(mode) {
        for (const r of layout) {
          const arr = parseStripStr(stripStr[mode] && stripStr[mode][r.reel_id]);
          if (arr.length) {
            const w = stripToWeights(arr);
            const e = reelW(mode);
            for (const sid of e.symbol_ids) e.weights[`${r.reel_id}-${sid}`] = Number(w[sid]) || 0;
          }
        }
        emit('status', { type: 'ok', msg: `全部輪帶已寫回 04 權重（${mode}）` });
      }
      // v6.0-b:模式增減時同步輪帶 active mode 與字串快取
      //   v8.43 / C-1:以 base 判定 — 變體鍵 "FG1#QUEEN" 在 FG1 仍存在時不被踢回 names[0]
      watch(modeNames, (names) => {
        if (names.length && !names.includes(stripBaseOf(stripActiveMode.value))) stripActiveMode.value = names[0];
        for (const m of names) _ensureStripMode(m);
      }, { immediate: true });

      // ──────────────────────────────────────────────────────────
      //  v4.8:04 副盤權重(副輪 .sub + 自由副盤 Panel)資料層
      //  - 副輪:layout 上 has_subreel 且「獨立權重」的 reel,在 04 顯示
      //    一列「R<n>·副」;LS 存於 reelWeights[mode].sub_weights['<rid>-<sid>']。
      //    匯出時寫成 Reel_ID = "<rid>.sub"(a_loader 既有支援)。
      //  - Panel:每個自由副盤一列;LS 存於 panel_weights['<pid>-<sid>']
      //    (aconfig-xlsx 既有讀取此結構匯出)。全 0 = 不寫專屬池,
      //    引擎 fallback 到符號集等權 / 沿用保底。
      // ──────────────────────────────────────────────────────────
      function _ensureAuxWeights(mode) {
        const e = reelW(mode);
        if (!e.sub_weights)   e.sub_weights = {};
        if (!e.panel_weights) e.panel_weights = {};
        // 獨立權重副輪:lazy 初始化 100 均勻(與主輪一致),避免匯出後副輪整片空白
        for (const r of layout) {
          if (!r.has_subreel || r.subreel_inherit_weight) continue;
          for (const sid of e.symbol_ids) {
            const k = `${r.reel_id}-${sid}`;
            if (!(k in e.sub_weights)) e.sub_weights[k] = 100;
          }
        }
        // panel:lazy 初始化 0(全 0 = 不建專屬池,走符號集/保底 fallback)
        for (const p of panels) {
          for (const sid of e.symbol_ids) {
            const k = `${p.panel_id}-${sid}`;
            if (!(k in e.panel_weights)) e.panel_weights[k] = 0;
          }
        }
        return e;
      }
      function auxW(mode) { return _ensureAuxWeights(mode); }
      // 需要在 04 顯示副輪權重列的 reel(獨立權重者)
      const independentSubReels = computed(() =>
        layout.filter(r => r.has_subreel && !r.subreel_inherit_weight));
      // v6.3 / Q2(a):只有「會滾動圖示」的副盤(SCROLL/TRIGGER)需要權重;COLLECT 蒐集型不滾動,排除。
      const scrollingPanels = computed(() =>
        panels.filter(p => (p.panel_type || 'SCROLL') !== 'COLLECT'));
      const hasAuxWeightRows = computed(() =>
        independentSubReels.value.length > 0 || scrollingPanels.value.length > 0);

      // ── v6.3 / Q2(b):蒐集副盤 ↔ COLLECT 型 JP 雙向連動 ──
      //   panel.collect_target_jp 指向某 COLLECT 型 JP;下拉只列 COLLECT 型 JP。
      const collectJpOptions = computed(() =>
        jackpots.filter(j => (j.trigger_type || 'COLLECT') === 'COLLECT'));
      // 反查:此 JP 被哪些 COLLECT 副盤餵入(JP 端顯示)
      function panelsFeedingJp(jpId) {
        if (!jpId) return [];
        return panels.filter(p => (p.panel_type || 'SCROLL') === 'COLLECT' && p.collect_target_jp === jpId);
      }
      // 驗證(不擋):panel 選的 JP 不存在 / 非 COLLECT 型
      function panelCollectJpWarn(p) {
        if (!p || (p.panel_type || 'SCROLL') !== 'COLLECT' || !p.collect_target_jp) return '';
        const jp = jackpots.find(j => j.jp_id === p.collect_target_jp);
        if (!jp) return `⚠ 連結的 JP「${p.collect_target_jp}」已不存在`;
        if ((jp.trigger_type || 'COLLECT') !== 'COLLECT') return `⚠ 「${jp.jp_id}」非 COLLECT(收集)型 JP`;
        return '';
      }

      // §5:反查 — 哪些符號(攜帶值 · 彩金倍數 → JP 連結)餵入此 JP(唯讀;真相單向在圖示頁)
      function symbolsFeedingJp(jpId) {
        if (!jpId) return [];
        let sw = {}; try { sw = registry.swatchMap() || {}; } catch (e) {}
        const out = [];
        for (const s of (symbolList.value || [])) {
          if ((s.prize_values || []).some(pv => (pv.link_jackpot || '') === jpId)) {
            const c = sw[s.id];
            out.push({ id: s.id, name: s.name || s.symbol_id || ('#' + s.number), color: (c && c[0]) || '' });
          }
        }
        return out;
      }
      // §5:前往圖示頁(編輯攜帶值 · 彩金倍數 → JP 連結)
      function goSymbolsPage() {
        try { if (window.SlotPlanner && window.SlotPlanner.goSymbols) window.SlotPlanner.goSymbols(); } catch (e) { /* no-op */ }
      }

      // ── v6.3 / Q2(c):TRIGGER 副盤 → 自動產生規則(直接寫入 rules)──
      //   trigger=ON_SYMBOL_LANDED;condition=symbol_count.<符號> >= 1(引擎合法,全盤出現);
      //   action=EMIT_EVENT 廣播 activate_<panel_id>,指定輪資訊記於 payload + 描述。
      //   (引擎無逐輪符號 condition 變數、亦無「啟用 panel」動作型,故以事件承載,契約不破。)
      function genTriggerRule(p) {
        if (!p || (p.panel_type || 'SCROLL') !== 'TRIGGER') {
          emit('status', { type: 'err', msg: '此副盤非「觸發」型' });
          return;
        }
        const trg = (p.trigger_symbol || '').trim();
        if (!trg) { emit('status', { type: 'err', msg: '請先填觸發符號' }); return; }
        const reelN = Number(p.trigger_reel) || 0;
        const reelLabel = reelN >= 1 ? ('R' + reelN) : '任意輪';
        const ev = 'activate_' + p.panel_id;
        // 同一副盤已產生過就提示(以事件名判定),不重複
        const dup = rules.find(r => Array.isArray(r.actions) &&
          r.actions.some(a => a.atype === 'EMIT_EVENT' && a.params && a.params.name === ev));
        if (dup) {
          emit('status', { type: 'wait', msg: `已存在觸發 ${p.panel_id} 的規則(${dup.rule_id});未重複產生` });
          return;
        }
        const rid = _nextRuleId();
        const rule = {
          ...makeRule(rid),
          trigger: 'ON_SYMBOL_LANDED',
          condition: `symbol_count.${trg} >= 1`,
          actions: [{ atype: 'EMIT_EVENT', params: {
            name: ev,
            payload: `{panel:${p.panel_id}, symbol:${trg}, reel:${reelN >= 1 ? reelN : 'any'}}`,
          } }],
          emits: [ev],
          mode_scope: 'ALL',
          priority: 100,
          description: `觸發副盤 ${p.panel_id}:當「${trg}」落於${reelLabel}時啟用` +
                       `(引擎以全盤出現判定,指定輪資訊記於事件 payload)`,
        };
        rules.push(rule);
        emit('status', { type: 'ok', msg: `已產生規則 ${rid}(觸發 ${p.panel_id});可到「腳本規則」分頁微調` });
      }
      function auxRowTotal(kind, mode, id) {
        const e = auxW(mode);
        const table = kind === 'sub' ? e.sub_weights : e.panel_weights;
        let s = 0;
        for (const sid of e.symbol_ids) {
          const v = table[`${id}-${sid}`];
          if (typeof v === 'number') s += v;
        }
        return s;
      }
      function auxFillRow(kind, mode, id, v) {
        _pushUndo('reel', mode);
        const e = auxW(mode);
        const table = kind === 'sub' ? e.sub_weights : e.panel_weights;
        for (const sid of e.symbol_ids) table[`${id}-${sid}`] = v;
      }
      function auxNormalizeRow(kind, mode, id, target = 100) {
        _pushUndo('reel', mode);
        const e = auxW(mode);
        const table = kind === 'sub' ? e.sub_weights : e.panel_weights;
        let s = 0;
        for (const sid of e.symbol_ids) {
          const v = table[`${id}-${sid}`];
          if (typeof v === 'number') s += v;
        }
        if (s <= 0) return;
        for (const sid of e.symbol_ids) {
          const v = Number(table[`${id}-${sid}`]) || 0;
          table[`${id}-${sid}`] = Math.round((v / s) * target);
        }
      }
      // v5.2:依 02 指定的符號集帶入等權(成員 100、非成員 0)
      function auxFillFromSet(kind, mode, id) {
        let setName = '';
        if (kind === 'sub') {
          const r = layout.find(x => x.reel_id === id);
          setName = (r && r.subreel_symbol_set) || '';
        } else {
          const p = panels.find(x => x.panel_id === id);
          setName = (p && p.symbol_set) || '';
        }
        if (!setName) {
          emit('status', { type: 'warn', msg: `此${kind === 'sub' ? '副盤' : 'Panel'}未在 02_Layout 指定符號集,無法帶入` });
          return;
        }
        const members = new Set(symbolSets[setName] || []);
        if (!members.size) {
          emit('status', { type: 'warn', msg: `符號集「${setName}」為空,請先到 02 補成員` });
          return;
        }
        _pushUndo('reel', mode);
        const e = auxW(mode);
        const table = kind === 'sub' ? e.sub_weights : e.panel_weights;
        for (const sid of e.symbol_ids) table[`${id}-${sid}`] = members.has(sid) ? 100 : 0;
        emit('status', { type: 'ok', msg: `已依符號集「${setName}」帶入:成員 100 / 其餘 0` });
      }
      // panel 的權重來源描述(熱力/提示用)
      function panelWeightSourceLabel(p, mode) {
        if (auxRowTotal('panel', mode, p.panel_id) > 0) return '專屬權重';
        if (p.symbol_set) return `符號集「${p.symbol_set}」等權`;
        if (p.inherit_weight) return '沿用主輪 R1 保底';
        return '⚠ 無權重來源(模擬時會空白)';
      }
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
      // v5.0-c:活躍模式的列/欄合計快取(cellPercent / 合計欄 O(1) 查表)
      const _reelActiveTotals = computed(() => {
        const rows = {}, cols = {};
        if (!reelActiveMode.value) return { rows, cols };
        const e = reelW(reelActiveMode.value);
        for (const rr of layout) {
          let sum = 0;
          for (const sid of e.symbol_ids) {
            const v = Number(e.weights[`${rr.reel_id}-${sid}`]) || 0;
            sum += v; cols[sid] = (cols[sid] || 0) + v;
          }
          rows[rr.reel_id] = sum;
        }
        return { rows, cols };
      });
      const _gridActiveTotals = computed(() => {
        const rows = {}, cols = {};
        if (!gridActiveMode.value) return { rows, cols };
        const e = gridW(gridActiveMode.value);
        for (const rr of layout) {
          let sum = 0;
          for (const sz of e.grid_sizes) {
            const v = Number(e.weights[`${rr.reel_id}-${sz}`]) || 0;
            sum += v; cols[String(sz)] = (cols[String(sz)] || 0) + v;
          }
          rows[rr.reel_id] = sum;
        }
        return { rows, cols };
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
          return 'rgb(var(--tint-muted) / 0.10)';  // 灰底
        }
        const mx = reelMaxWeight(mode);
        if (!mx) return 'transparent';
        // sqrt 讓低權重區也有顏色差,而不是大半都接近透明
        const ratio = Math.sqrt(Math.min(1, w / mx));
        return `rgb(var(--tint-accent) / ${(0.08 + 0.50 * ratio).toFixed(3)})`;
      }
      // v5.0-c:熱力底色改 class bucket(取代每格 inline style;
      //   亦讓暗色模式可直接覆寫,移除對 style 字串的 selector hack 依賴)
      function _heatBucket(w, mx) {
        if (w === 0 || w === undefined || w === null) return 'cfg-heat-zero';
        if (!mx) return '';
        const ratio = Math.sqrt(Math.min(1, w / mx));
        return 'cfg-heat-' + Math.max(1, Math.min(9, Math.round(ratio * 9)));
      }
      function reelHeatClass(mode, w)        { return _heatBucket(w, reelMaxWeight(mode)); }
      function gridHeatClass(mode, w)        { return _heatBucket(w, gridMaxWeight(mode)); }
      function comboHeatClass(mode, step, w) { return _heatBucket(w, comboMaxWeight(mode, step)); }
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
      // ── 權重頁 W2:主權重矩陣鍵盤游走(DOM 結構導覽,對排序 / v-memo 重繪免疫)──
      //   Enter / ↓ = 下一列(下一輪)、↑ = 上一列、Tab = 右一格(下一符號)、Shift+Tab = 左;
      //   Tab 於列尾自動繞到下一列起。number input 原生上下增減以 preventDefault 讓位給游走。
      //   只掛在主矩陣 cell(v-model 為 reelW().weights),aux / 多模式表不受影響(不觸發此 handler)。
      function onMatrixKeydown(e) {
        const k = e.key;
        const isTab = k === 'Tab';
        const down = (k === 'Enter' || k === 'ArrowDown');
        const up = (k === 'ArrowUp');
        if (!isTab && !down && !up) return;
        const inp = e.target;
        if (!inp || !inp.closest) return;
        const td = inp.closest('td');
        const tr = inp.closest('tr');
        if (!td || !tr) return;
        if (down || up) e.preventDefault();   // 阻止 number input 原生上下增減
        const SEL = 'input.cfg-matrix-cell';
        const rowCells = (row) => Array.from(row.children).filter(c => c.querySelector && c.querySelector(SEL));
        const cellTds = rowCells(tr);
        const ci = cellTds.indexOf(td);
        if (ci < 0) return;
        let target = null;
        if (down || up) {
          const tbody = tr.parentElement;
          const rows = Array.from(tbody.children).filter(rr => rr.querySelector && rr.querySelector(SEL));
          const ri = rows.indexOf(tr);
          const nri = down ? ri + 1 : ri - 1;
          if (nri < 0 || nri >= rows.length) return;
          const nc = rowCells(rows[nri]);
          if (ci < nc.length) target = nc[ci].querySelector(SEL);
        } else {   // Tab
          const nci = e.shiftKey ? ci - 1 : ci + 1;
          if (nci >= 0 && nci < cellTds.length) {
            target = cellTds[nci].querySelector(SEL);
          } else {
            const tbody = tr.parentElement;
            const rows = Array.from(tbody.children).filter(rr => rr.querySelector && rr.querySelector(SEL));
            const ri = rows.indexOf(tr);
            if (!e.shiftKey && ri + 1 < rows.length) {
              const nc = rowCells(rows[ri + 1]); target = nc.length ? nc[0].querySelector(SEL) : null;
            } else if (e.shiftKey && ri - 1 >= 0) {
              const nc = rowCells(rows[ri - 1]); target = nc.length ? nc[nc.length - 1].querySelector(SEL) : null;
            }
          }
        }
        if (target) { e.preventDefault(); target.focus(); if (target.select) target.select(); }
      }
      function reelTotalForRow(mode, reel_id) {
        if (mode === reelActiveMode.value) return _reelActiveTotals.value.rows[reel_id] || 0;
        const e = reelW(mode);
        let s = 0;
        for (const sid of e.symbol_ids) {
          const v = e.weights[`${reel_id}-${sid}`];
          if (typeof v === 'number') s += v;
        }
        return s;
      }
      // v9.0 / 硬核工作站:行內 Micro-viz — 每列(Reel)一條迷你分佈柱狀圖,
      // 高度依「此列自身最大值」正規化(看形狀,不是看跨列絕對量),
      // 讓使用者掃一眼就知道這條 Reel 的權重是集中還是分散,不必逐格心算。
      function reelRowSparkBars(mode, reel_id) {
        const e = reelW(mode);
        const syms = visibleReelSyms(mode);
        const vals = syms.map(sid => Number(e.weights[`${reel_id}-${sid}`]) || 0);
        const mx = Math.max(0, ...vals);
        return syms.map((sid, i) => ({
          sid,
          v: vals[i],
          pct: mx > 0 ? Math.max(6, Math.round((vals[i] / mx) * 100)) : 0,
        }));
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
      // ─── v8.12/批B:符號欄篩選 + 例外摘要 ───
      // 主情境:「特殊圖示 × 特定輪」的例外調整(如 WILD 在 R1 壓低);
      // 一般符號也會調 → 篩選只做「視野聚焦」,不隱藏資料、不動結構。
      const reelSymFilterType = ref('all');            // 'all' | 'special' | 'normal'
      const reelSymFilterPicked = reactive(new Set()); // 符號 chips 多選(空 = 不限)
      function _symIsSpecial(sid) {
        const sym = symbolList.value.find(x => (x.name && x.name.trim()) === sid);
        if (!sym) return false;
        const t = String(sym.type || '').toUpperCase();
        return !!(sym.is_wild || sym.is_scatter || t === 'WILD' || t === 'SCATTER' || t === 'SPECIAL');
      }
      function visibleReelSyms(mode) {
        let ids = reelW(mode).symbol_ids;
        if (reelSymFilterType.value === 'special') ids = ids.filter(_symIsSpecial);
        else if (reelSymFilterType.value === 'normal') ids = ids.filter(sid => !_symIsSpecial(sid));
        if (reelSymFilterPicked.size > 0) ids = ids.filter(sid => reelSymFilterPicked.has(sid));
        return ids;
      }
      function toggleReelSymPick(sid) {
        if (reelSymFilterPicked.has(sid)) reelSymFilterPicked.delete(sid);
        else reelSymFilterPicked.add(sid);
      }
      function clearReelSymFilter() { reelSymFilterType.value = 'all'; reelSymFilterPicked.clear(); }
      // 欄「基準」= 眾數(該欄出現頻率最高的權重值;並列取較大者)
      function reelColBase(mode, sid) {
        const e = reelW(mode); const freq = new Map();
        for (const r of layout) {
          const v = Number(e.weights[`${r.reel_id}-${sid}`]) || 0;
          freq.set(v, (freq.get(v) || 0) + 1);
        }
        let best = 0, bestN = -1;
        for (const [v, n] of freq) if (n > bestN || (n === bestN && v > best)) { best = v; bestN = n; }
        return best;
      }
      function reelIsDeviant(mode, rid, sid) {
        return (Number(reelW(mode).weights[`${rid}-${sid}`]) || 0) !== reelColBase(mode, sid);
      }
      // 例外摘要:全部「偏離該欄基準」的格子(= 人工調整過的點)
      function reelExceptions(mode) {
        const out = []; const e = reelW(mode);
        for (const sid of e.symbol_ids) {
          const base = reelColBase(mode, sid);
          for (const r of layout) {
            const v = Number(e.weights[`${r.reel_id}-${sid}`]) || 0;
            if (v !== base) out.push({ sid, rid: r.reel_id, v, base });
          }
        }
        return out;
      }
      function gotoReelException(mode, rid, sid) {
        clearMatrixSelection();
        matrixSelection.keys.add(_selKey('reel', mode, rid, String(sid)));
        Vue.nextTick(() => {
          const el = document.querySelector('.cfg-matrix .is-selected');
          if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      }

      // ══════════════════════════════════════════════════════════════
      //  UI 批 E-2a:04 單格微調氣泡(Popover · 失焦即存)
      //  契約:微調既有值 → Popover;建立新實體 → 維持彈窗。
      //  提交 = 關閉的唯一寫回點;Esc = 放棄草稿。零新增 LS key。
      // ══════════════════════════════════════════════════════════════
      // v-E2b:kind 分派表 — reel(04主)/ grid(05)/ sub(04副輪)/ panel(04自由副盤)
      //   base=null 的 kind 無欄基準概念(氣泡隱藏基準列與「=基準」鈕)
      const _CELLPOP_KINDS = {
        reel: {
          get:   (m, rid, sid) => Number(reelW(m).weights[`${rid}-${sid}`]) || 0,
          set:   (m, rid, sid, v) => { reelW(m).weights[`${rid}-${sid}`] = v; },
          base:  (m, rid, sid) => reelColBase(m, sid),
          label: (rid, sid) => `${sid} · R${rid}`,
        },
        grid: {
          get:   (m, rid, sz) => Number(gridW(m).weights[`${rid}-${sz}`]) || 0,
          set:   (m, rid, sz, v) => { gridW(m).weights[`${rid}-${sz}`] = v; },
          base:  null,
          label: (rid, sz) => `R${rid} · ${sz} 格`,
        },
        sub: {
          get:   (m, rid, sid) => Number(auxW(m).sub_weights[`${rid}-${sid}`]) || 0,
          set:   (m, rid, sid, v) => { auxW(m).sub_weights[`${rid}-${sid}`] = v; },
          base:  null,
          label: (rid, sid) => `${sid} · R${rid}.sub`,
        },
        panel: {
          get:   (m, pid, sid) => Number(auxW(m).panel_weights[`${pid}-${sid}`]) || 0,
          set:   (m, pid, sid, v) => { auxW(m).panel_weights[`${pid}-${sid}`] = v; },
          base:  null,
          label: (pid, sid) => `${sid} · ${pid}`,
        },
      };
      const cellPop = reactive({
        open: false, shown: false, flipUp: false,
        x: 0, y: 0,
        kind: 'reel', mode: '', rid: 0, sid: '',
        label: '',
        draft: 0,            // 本地草稿:開啟時複製,提交時回寫(single source 不被半成品污染)
        base: null,          // 該欄基準(眾數);null = 此 kind 無基準概念
      });
      let _cellPopAnchor = null;

      function _cellPopPlace() {
        const popEl = document.querySelector('.cfg-cellpop');
        if (!_cellPopAnchor || !popEl) return;
        const a = _cellPopAnchor.getBoundingClientRect();
        const p = popEl.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight, GAP = 8, PAD = 12;
        let x = Math.max(PAD, Math.min(a.left, vw - p.width - PAD));
        let y = a.bottom + GAP;
        cellPop.flipUp = false;
        if (y + p.height > vh - PAD && a.top - GAP - p.height >= PAD) {
          y = a.top - GAP - p.height;
          cellPop.flipUp = true;
        }
        cellPop.x = Math.round(x); cellPop.y = Math.round(y);
      }
      function openCellPop(anchorEl, kind, mode, rid, sid) {
        const K = _CELLPOP_KINDS[kind];
        if (!K) return;                             // 未知 kind:告知並降級(不開不炸)
        if (cellPop.open) commitCellPop();          // 換錨點 = 先提交前一個
        _cellPopAnchor = anchorEl;
        cellPop.kind = kind;
        cellPop.mode = mode; cellPop.rid = rid; cellPop.sid = sid;
        cellPop.label = K.label(rid, sid);
        cellPop.draft = K.get(mode, rid, sid);
        cellPop.base = K.base ? K.base(mode, rid, sid) : null;
        cellPop.open = true; cellPop.shown = false;
        Vue.nextTick(() => {
          _cellPopPlace();
          requestAnimationFrame(() => { cellPop.shown = true; });
        });
        document.addEventListener('pointerdown', _cellPopOutside, true);
        document.addEventListener('keydown', _cellPopKey, true);
        window.addEventListener('resize', _cellPopPlace);
      }
      // 提交 = 關閉(失焦即存的唯一寫回點);寫入後既有 reactive 管線
      // (LS 排程、RTP 估算、偏差標記 v-memo 依賴)自動接手,無需另掛重算。
      function commitCellPop() {
        if (!cellPop.open) return;
        const v = Math.max(0, Number(cellPop.draft) || 0);
        const K = _CELLPOP_KINDS[cellPop.kind];
        if (K) K.set(cellPop.mode, cellPop.rid, cellPop.sid, v);
        if (_cellPopAnchor && _cellPopAnchor.classList) {
          _cellPopAnchor.classList.remove('cfg-flash-saved');
          void _cellPopAnchor.offsetWidth;
          _cellPopAnchor.classList.add('cfg-flash-saved');
        }
        _cellPopTeardown();
      }
      function cancelCellPop() { if (cellPop.open) _cellPopTeardown(); }   // Esc:放棄草稿
      function _cellPopTeardown() {
        cellPop.open = false; cellPop.shown = false;
        _cellPopAnchor = null;
        document.removeEventListener('pointerdown', _cellPopOutside, true);
        document.removeEventListener('keydown', _cellPopKey, true);
        window.removeEventListener('resize', _cellPopPlace);
      }
      function _cellPopOutside(e) {
        const popEl = document.querySelector('.cfg-cellpop');
        if (popEl && popEl.contains(e.target)) return;
        if (_cellPopAnchor && _cellPopAnchor.contains && _cellPopAnchor.contains(e.target)) return;
        commitCellPop();
      }
      function _cellPopKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); cancelCellPop(); }
        else if (e.key === 'Enter') { e.stopPropagation(); commitCellPop(); }
      }
      // 例外 chip → 原地開氣泡(不再強迫捲動);「跳至該格」保留為氣泡內連結
      function openCellPopFromException(ev, mode, rid, sid) {
        openCellPop(ev.currentTarget, 'reel', mode, rid, sid);
      }
      // 滑桿上限:取 100 / 基準×2 / 目前值 的最大者,避免大權重被夾住
      const cellPopSliderMax = computed(() =>
        Math.max(100, (cellPop.base || 0) * 2, Number(cellPop.draft) || 0));

      // ── 批 F-4:行動版 Bottom Sheet 向下滑關閉 ──
      //   ≤767px 時氣泡由 CSS 轉為底部抽屜;向下滑 >60px = 提交關閉
      //   (與點遮罩同語義:關閉即儲存)。桌面與滑桿/輸入框互動不受影響:
      //   僅在觸控起點不落在 input/slider/button 上時才追蹤位移。
      let _sheetY0 = null;
      function _sheetIsMobile() { return window.matchMedia('(max-width: 767px)').matches; }
      function sheetTouchStart(e) {
        _sheetY0 = null;
        if (!_sheetIsMobile()) return;
        const t = e.target;
        if (t && t.closest && t.closest('input, button, select, textarea')) return;
        _sheetY0 = (e.touches && e.touches[0]) ? e.touches[0].clientY : null;
      }
      function sheetTouchMove() { /* passive 佔位:不阻擋抽屜內原生捲動 */ }
      function sheetTouchEnd(e) {
        if (_sheetY0 === null) return;
        const y = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : null;
        const dy = (y !== null) ? (y - _sheetY0) : 0;
        _sheetY0 = null;
        if (dy > 60) commitCellPop();
      }

      // ══════════════════════════════════════════════════════════════
      //  UI 批 E-3a:導引晶片(Linear 式「動態下一步」)
      //  契約:單顆常駐分頁工具列右端;start(靛紫)/ warn(黃)/ ok(綠,
      //  拍板:無 action 純徽章)/ probe 回 null = idle 整顆隱藏。
      //  判定只復用既有函式與資料讀取,不新增引擎判斷、不落地 LS。
      // ══════════════════════════════════════════════════════════════
      function _guideScrollFirst(selector) {
        return () => {
          const el = document.querySelector(selector);
          if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        };
      }
      // 統一 warn 底層:validationIssues 幾乎覆蓋所有 tab(以 add(severity, tab, msg) 寫入)
      function _guideIssueWarn(tab) {
        const iss = validationIssues.value.filter(i => i.tab === tab);
        if (!iss.length) return null;
        return { level: 'warn', label: `⚠ ${iss.length} 項待處理,點此檢視`,
                 action: () => { validationPanelOpen.value = true; } };
      }
      const GUIDE_PROBES = {
        // ── 02 盤面結構(常駐頁,無空態;斷欄/破洞等 16 處檢查已在 issues)──
        layout() {
          return _guideIssueWarn('layout')
              || { level: 'ok', label: '✨ 盤面結構就緒', action: null };
        },
        // ── 03 符號(元件內新增流程不可達,start 態留待 E-3c 元件內接;先接通用層)──
        symbols() {
          return _guideIssueWarn('symbols')
              || { level: 'ok', label: '✨ 符號清單就緒', action: null };
        },
        // ── 04 Reel 權重 ──
        reel_weights() {
          const m = reelActiveMode.value;
          if (!m) return null;
          const e = reelW(m);
          if (!e.symbol_ids || e.symbol_ids.length === 0) {
            return { level: 'start', label: '1. 先到 03 建立符號',
                     action: () => { active.value = 'symbols'; } };
          }
          // UI/UX 改版 P3:比照 NotebookLM「動態引導按鈕」— 依序抓「全 0」與「合計偏離 100」
          // 兩種可一鍵修正的狀態,呼叫既有的「整列填 100」/「正規化至 100」動作,不用手動微調每格。
          let offRow = null;
          for (const r of layout) {
            let tot = 0;
            for (const sid of e.symbol_ids) tot += Number(e.weights[`${r.reel_id}-${sid}`]) || 0;
            if (tot === 0) {
              const rid = r.reel_id;
              return { level: 'warn', label: `⚠ R${rid} 權重全 0(無法生成),一鍵均勻填 100`,
                       action: () => reelFillRowUniform(m, rid, 100) };
            }
            if (offRow === null && Math.abs(tot - 100) > 5) offRow = { rid: r.reel_id, tot };
          }
          if (offRow) {
            return { level: 'warn', label: `⚠ R${offRow.rid} 合計 ${offRow.tot},一鍵等比補足至 100`,
                     action: () => reelNormalizeRow(m, offRow.rid, 100) };
          }
          return _guideIssueWarn('reel_weights')
              || { level: 'ok', label: '✨ 權重表就緒', action: null };
        },
        // ── 04b 真實輪帶(v8.13 三件套復用)──
        reel_strips() {
          if (!reelStrips.enabled) return null;              // 功能關閉 = idle
          const m = stripActiveMode.value;
          if (!m) return null;
          const lens = layout.map(r => stripLen(m, r.reel_id));
          if (lens.every(L => L === 0)) {
            const n = suggestedStripLen();
            return { level: 'start', label: `1. 依 04 權重一鍵生成輪帶(建議 ${n} 格)`,
                     action: () => {
                       stripGenLen.value = n;
                       genAllStripsFromWeights(m, n, stripGenStacked.value);
                     } };
          }
          const conf = stripLimitConflicts(m);
          if (conf.length) {
            return { level: 'warn', label: `⚠ 產牌限制必然衝突 ${conf.length} 筆,點此查看`,
                     action: _guideScrollFirst('.cfg-strips-conflicts') };
          }
          let off = 0;
          for (const r of layout) {
            for (const d of stripCompare(m, r.reel_id)) {
              if (d.unknown) off++;
              else if (d.delta !== null && Math.abs(d.delta) > 3) off++;
            }
          }
          if (off) {
            return { level: 'warn', label: `⚠ ${off} 項與權重偏差 >3%,點此定位`,
                     action: _guideScrollFirst('.cfg-strip-cmp-row.is-off, .cfg-strip-cmp-row.is-unknown') };
          }
          return _guideIssueWarn('reel_strips')
              || { level: 'ok', label: '✨ 輪帶與權重對齊', action: null };
        },
        // ── 05 格數(有模式設為可變時適用;鎖卡 = idle)──
        grid_size_weights() {
          if (!modes.some(m => m.rows_variable)) return null;   // §5.2 Stage C:改逐模式
          const m = gridActiveMode.value;
          if (m) {
            const e = gridW(m);
            // UI/UX 改版 P3:同 04 權重,合計偏離 100 時主動提供一鍵等比補足
            for (const r of layout) {
              let tot = 0;
              for (const sz of (e.grid_sizes || [])) tot += Number(e.weights[`${r.reel_id}-${sz}`]) || 0;
              if (tot !== 0 && Math.abs(tot - 100) > 5) {
                const rid = r.reel_id;
                return { level: 'warn', label: `⚠ R${rid} 合計 ${tot},一鍵等比補足至 100`,
                         action: () => gridNormalizeRow(m, rid, 100) };
              }
            }
          }
          return _guideIssueWarn('grid_size_weights')
              || { level: 'ok', label: '✨ 格數權重就緒', action: null };
        },
        // ── 06 中獎線(僅 LINE 適用)──
        paylines() {
          if ((g.pay_type || '').toUpperCase() !== 'LINE') return null;
          const allEmpty = paylines.every(p => !p.path || !p.path.length);
          if (allEmpty) {
            return { level: 'start', label: '1. 用範本快速鋪第一條線',
                     action: () => addPaylineFromPreset('middle') };
          }
          const ov = paylineOverlapIdxs.value.size;
          if (ov) {
            return { level: 'warn', label: `⚠ ${ov} 條線路徑重疊,點此定位`,
                     action: _guideScrollFirst('.cfg-split-item.is-overlap') };
          }
          return _guideIssueWarn('paylines')
              || { level: 'ok', label: '✨ 中獎線就緒', action: null };
        },
        // ── 07 硬約束(非必填 = idle)──
        constraints() {
          if (!constraints.length) return null;
          const bad = constraints.filter(c => constraintStatus(c).kind === 'err').length;
          if (bad) {
            return { level: 'warn', label: `⚠ ${bad} 筆約束不完整,點此定位`,
                     action: _guideScrollFirst('.cfg-constraint-v2-badge.err') };
          }
          return _guideIssueWarn('constraints')
              || { level: 'ok', label: '✨ 硬約束就緒', action: null };
        },
        // ── 13 JP(非必填 = idle)──
        jackpots() {
          if (!jackpots.length) return null;
          return _guideIssueWarn('jackpots')
              || { level: 'ok', label: '✨ JP 彩金就緒', action: null };
        },
        // ── 12 分佈區間(非必填 = idle;bins 為 mode → rows 結構,任一模式有列即視為使用)──
        distribution_bins() {
          const used = Object.values(bins || {}).some(v => Array.isArray(v) ? v.length : (v && typeof v === 'object' && Object.keys(v).length));
          if (!used) return null;
          return _guideIssueWarn('distribution_bins')
              || { level: 'ok', label: '✨ 分佈區間就緒', action: null };
        },
        // ── 18 比倍(開關關 = idle)──
        gamble() {
          if (!gamble.enabled) return null;
          return _guideIssueWarn('gamble')
              || { level: 'ok', label: '✨ 比倍設定就緒', action: null };
        },
        // ── 14 加押/購買(雙開關皆關 = idle)──
        bet_config() {
          const buyOn  = !!betConfig.buy_feature_enabled;
          const anteOn = !!betConfig.ante_bet_enabled;
          if (!buyOn && !anteOn) return null;
          if (buyOn && (!betConfig.buy_features || betConfig.buy_features.length === 0)) {
            return { level: 'start', label: '1. 新增第一個購買檔位',
                     action: () => addBuyFeature() };
          }
          return _guideIssueWarn('bet_config')
              || { level: 'ok', label: '✨ 加押/購買就緒', action: null };
        },
        // ── 文件生成:全案總驗收(導引流程的終點站)──
        docgen() {
          const n = validationIssues.value.length;
          if (n) {
            return { level: 'warn', label: `⚠ 全案尚有 ${n} 項待處理,點此檢視`,
                     action: () => { validationPanelOpen.value = true; } };
          }
          return { level: 'ok', label: '✨ 全案驗證通過,可產出文件', action: null };
        },
        // ── 規則頁:依 rulesSection 換 probe(一頁五態)──
        rules() {
          const sec = rulesSection.value;
          if (sec === 'modes') {
            if (modes.length <= 1) {
              return { level: 'start', label: '1. 新增第一個特色模式',
                       action: () => openAddModeDlg() };
            }
            if (duplicateNames.value.size || modes.some(m => !String(m.mode || '').trim())) {
              return { level: 'warn', label: '⚠ 模式名稱重複或為空,點此定位',
                       action: _guideScrollFirst('.cfg-mode-summary-name.err') };
            }
          } else if (sec === 'board' || sec === 'general') {
            const cnt = rules.filter(r => (sec === 'board') === isBoardRule(r)).length;
            if (cnt === 0) {
              return { level: 'start', label: '1. 從規則庫套用常用機制',
                       action: () => { presetDrawerOpen.value = true; } };
            }
          } else if (sec === 'discard') {
            if (!discards.length) return null;               // 無棄牌 = 合法,idle
          } else if (sec === 'genlimits') {
            if (!genLimits.length) return null;              // 非必填 = idle
            const bad = genLimits.filter(gl => {
              const k = genLimitStatusOf(gl).kind;
              return k === 'err' || k === 'warn';
            }).length;
            if (bad) {
              return { level: 'warn', label: `⚠ ${bad} 筆限制有問題,點此定位`,
                       action: _guideScrollFirst('.cfg-form tr.is-err, .cfg-form tr.is-warn') };
            }
            return { level: 'ok', label: '✨ 產牌限制就緒', action: null };
          }
          return _guideIssueWarn('rules')
              || { level: 'ok', label: '✨ 規則設定就緒', action: null };
        },
      };
      const guideChip = computed(() => {
        const probe = GUIDE_PROBES[active.value];
        if (!probe) return null;                             // 未接入分頁 = 不渲染
        // 批 F-0 修正:watch 註冊時的 eager 求值早於 validationIssues 等
        // const 宣告(TDZ)→ probe 例外一律降級為 idle,不炸 errorHandler。
        let snap = null;
        try { snap = probe(); } catch (_) { return null; }
        if (!snap) return null;                              // idle
        return snap;
      });
      // 三態切換瞬間輕呼吸(把視線引過去);同態重算不動畫
      const guidePulse = ref(false);
      let _guideLastLevel = null;
      watch(() => guideChip.value && guideChip.value.level, (nv) => {
        if (_guideLastLevel !== null && nv && nv !== _guideLastLevel) {
          guidePulse.value = true;
          setTimeout(() => { guidePulse.value = false; }, 550);
        }
        _guideLastLevel = nv || null;
      });
      const guideChipCls = computed(() => {
        const g = guideChip.value;
        if (!g) return {};
        return {
          'is-start': g.level === 'start',
          'is-warn':  g.level === 'warn',
          'is-ok':    g.level === 'ok',
          'no-action': !g.action,
          'is-pulse': guidePulse.value,
        };
      });
      function guideRun() {
        const g = guideChip.value;
        if (g && g.action) g.action();
      }

      function sortReelSymbols(mode, by) {
        const e = reelW(mode);
        if (by === 'special-first') {
          // v8.12:特殊符號(WILD/SCATTER/SPECIAL)置前,其餘保持原相對序(穩定排序)
          e.symbol_ids.sort((a, b) => (_symIsSpecial(b) ? 1 : 0) - (_symIsSpecial(a) ? 1 : 0));
        } else if (by === 'alpha-asc') {
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
      // ── 權重頁 W5:格數欄 ↔ 盤面頁 Megaways 逐模式列數範圍(§4.1「連動」;明確觸發、非破壞、可復原)──
      //   套用 = 把此模式 grid_sizes 設為其 row_min..row_max(複用 setGridSizesStr:重疊尺寸權重保留、新尺寸填 100)。
      function applyModeRangeToGridSizes(mode) {
        const m = modes.find(mm => (mm.mode || '').trim() === mode);
        if (!m) return;
        const lo = Number(m.row_min), hi = Number(m.row_max);
        if (!(lo >= 1) || !(hi >= lo)) return;
        _pushUndo('grid', mode);
        const sizes = [];
        for (let n = lo; n <= hi; n++) sizes.push(n);
        setGridSizesStr(mode, sizes.join(', '));
      }
      function modeRowRangeLabel(mode) {
        const m = modes.find(mm => (mm.mode || '').trim() === mode);
        if (!m) return '';
        const lo = Number(m.row_min), hi = Number(m.row_max);
        if (!(lo >= 1) || !(hi >= lo)) return '';
        return lo === hi ? String(lo) : (lo + '–' + hi);
      }
      function gridTotalForRow(mode, reel_id) {
        if (mode === gridActiveMode.value) return _gridActiveTotals.value.rows[reel_id] || 0;
        const e = gridW(mode);        let s = 0;
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
      // §4.10b:additive enabled(makeDiscard 在 helpers 凍結;此處補預設 true,舊檔向後相容)
      discards.forEach(d => { if (d.enabled == null) d.enabled = true; });
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
      // v8.4 / R2 P5:規則 additive 欄位正規化(random_group/random_weight;舊資料補預設,不碰 helpers makeRule)
      function _ensureRuleR2Fields(r) {
        if (r && typeof r === 'object') {
          if (r.random_group == null) r.random_group = '';
          if (r.random_weight == null || isNaN(Number(r.random_weight))) r.random_weight = 100;
          // v8.28 / 缺口A:補充判斷說明(自由文字;與 description 分離)。makeRule 在 helpers 凍結,此處補預設。
          if (r.notes == null) r.notes = '';
          // v8.49 / 缺口1:額外機率閘門(舊資料補預設 1.0=100%,行為不變)。makeRule 在 helpers 凍結,此處補預設。
          if (r.fire_chance == null || isNaN(Number(r.fire_chance))) r.fire_chance = 1;
        }
        return r;
      }
      const rules = reactive(loadRules().map(_ensureRuleR2Fields));
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
        const r = makeRule(newId);
        // v7.10:在「盤面/圖示規則」子分頁新增時,預帶一個盤面 action(BOARD_TRANSFORM),
        //   讓新規則留在目前清單(否則 actions=[] 會被歸到通用、當場從畫面消失)。
        //   使用者仍可自由改 action 類型;改成非盤面類後它會自然移到通用清單。
        if (rulesSection.value === 'board' && typeof makeAction === 'function') {
          r.actions = [makeAction('BOARD_TRANSFORM')];
        }
        rules.push(r);
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

      // v7.1:設定檔編輯器內層分頁列收合狀態。
      //   行動版（≤767）= 逐層下鑽旗標:false=分頁清單,true=分頁詳細表單。
      //   桌面/平板無對應 CSS,設值無副作用。僅記憶體狀態、不寫入 localStorage。
      const cfgTabRailCollapsed = ref(true);  // v7.6.1:預設收起(桌面 rail 仍顯示;手機起始關閉抽屜,不擋捲動)
      // v7.9:桌面分頁列「常駐展開」狀態(與行動版 cfgTabRailCollapsed 分離)。
      //   false = 收合窄條(hover 暫時浮層展開);true = 常駐展開(跳板、推開內容)。
      //   持久化於 LS,讓使用者偏好跨 session 保留。
      const cfgRailPinned = ref(false);
      try {
        const _rp = localStorage.getItem('slotplanner.cfg.railPinned.v1');
        if (_rp === '1') cfgRailPinned.value = true;
      } catch (e) {}
      watch(cfgRailPinned, (v) => {
        try { localStorage.setItem('slotplanner.cfg.railPinned.v1', v ? '1' : '0'); } catch (e) {}
      });
      function toggleCfgRailPinned() { cfgRailPinned.value = !cfgRailPinned.value; }
      let _detachCfgSwipe = null;  // v7.6:行動版邊緣滑動 detach handle

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
        // v8.15 #2:切到插入規則的分類子分頁,右欄與清單置頂群一致
        rulesSection.value = isBoardRule(newRule) ? 'board' : 'general';
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

      // ── UI/UX 改版 P2:規則列右鍵選單(複用 H.makeContextMenu 共用 helper;複製/停用/刪除呼叫既有函式) ──
      const _ruleCtxMenu = H.makeContextMenu('.rule-ctx');
      const ruleCtx = _ruleCtxMenu.state;   // template 用 ruleCtx.open / .x / .y / .data(存 rule idx)
      function openRuleCtx(idx, ev) { _ruleCtxMenu.open(ev, idx); }
      function closeRuleCtx() { _ruleCtxMenu.close(); }
      function ruleCtxDuplicate() { const i = ruleCtx.data; closeRuleCtx(); if (i >= 0) duplicateRule(i); }
      function ruleCtxToggleEnabled() {
        const i = ruleCtx.data; closeRuleCtx();
        const r = rules[i]; if (!r) return;
        r.enabled = (r.enabled === false);
        emit('status', { type: 'ok', msg: r.enabled ? `已啟用規則「${r.rule_id}」` : `已停用規則「${r.rule_id}」(資料保留)` });
      }
      function ruleCtxDelete() { const i = ruleCtx.data; closeRuleCtx(); if (i >= 0) removeRule(i); }
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
      // v6.1 版面修正:預設收合,空狀態只剩角落小標頭,不再蓋住 01_Global/09 規則內容。
      // 釘住條件時 pinTest 會自動展開;取消釘住時自動收回。
      const inspectorOpen = ref(false);  // 預設收合(避免空面板遮擋內容)
      const inspectorCtxExpanded = ref(false);  // ctx 編輯區是否展開

      // 取 builder rows(統一介面,內部分支處理 rule 和 condBuilderState)
      function _getBuilderRows(kind, id) {
        if (!id) return [];
        if (kind === 'rule') {
          return builderRowsMap[id] || [];
        }
        return condBuilderState.rows[condKey(kind, id)] || [];
      }
      function pinTest(kind, id, label, autoOpen = true) {
        if (!id) return;
        pinnedTest.value = { kind, id, label: label || id };
        // v6.1:僅「手動點釘住」時展開;自動 pin(切換分頁)保持收合,
        // 避免空降的展開面板蓋住 觸發點/觸發條件 等控制項。
        if (autoOpen) inspectorOpen.value = true;
      }
      function unpinTest() {
        pinnedTest.value = null;
        inspectorOpen.value = false;   // v6.1:取消釘住後自動收回,釋放畫面空間
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
          // v7.10:規則頁子分頁。模式 → pin 模式條件;棄牌 → pin 棄牌;盤面/通用 → pin 拼圖規則。
          if (rulesSection.value === 'modes') {
            if (modes.length > 0) {
              const m = modes.find(x => x.trigger_condition) || modes[0];
              if (m && m.mode) pinTest('mode', m.mode, m.mode, false);
            }
          } else if (rulesSection.value === 'discard') {
            if (discards.length > 0) {
              const d = discards[selectedDiscardIdx.value] || discards[0];
              if (d.discard_id) pinTest('discard', d.discard_id, d.discard_id, false);
            }
          } else if (rules.length > 0) {
            // 盤面/通用:pin 目前子分頁可見的第一條規則
            const visible = rules.filter(ruleInSection);
            const r = visible[0] || rules[selectedRuleIdx.value] || rules[0];
            if (r && r.rule_id) pinTest('rule', r.rule_id, r.rule_id, false);
          }
        }
      }
      // 監看 active / 子分頁切換,自動 pin
      watch(active, () => {
        // v7.10:規則頁(含模式子分頁)時自動 pin
        if (active.value === 'rules') {
          _autoPinIfNeeded();
        }
      });
      watch(rulesSection, () => {
        if (active.value === 'rules') _autoPinIfNeeded();
      });
      // 判斷目前 active 是否為 puzzle tab(v7.10:global 已併入 rules)
      const isInPuzzleTab = computed(() =>
        active.value === 'rules'
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
        // v8.21 / G1:值動作(COLLECT/PAY/MULTIPLY_VALUE/REVIVE/COMPACT/CONVERT)歸「數值/價值」組。
        const numericTypes = new Set(['ADJUST_MULTIPLIER', 'UPDATE_GLOBAL', 'UPDATE_LOCAL',
          'COLLECT', 'PAY', 'MULTIPLY_VALUE', 'REVIVE', 'COMPACT', 'CONVERT']);
        const flowTypes    = new Set(['EMIT_EVENT', 'SWITCH_MODE', 'AWARD_FREE_SPIN', 'HALT_RESOLUTION', 'END_FEATURE']);
        // v8.9.1 bug 修復:此處原為硬編碼 boardTypes 白名單,v8.4 七枚新 action
        //   (EXPAND_REEL/NUDGE/WALK/REVEAL_AS/SPLIT/DESTROY_ADJACENT/GROW_BOARD)不在名單
        //   → 動作下拉完全選不到、UI 無法新增。改為「非 numeric/flow 一律歸盤面/圖示組」,
        //   之後 ACTION_CATALOG 新增 action 自動出現在下拉(防再犯)。
        return {
          numeric: ACTION_CATALOG.filter(a => numericTypes.has(a.type)),
          flow:    ACTION_CATALOG.filter(a => flowTypes.has(a.type)),
          board:   ACTION_CATALOG.filter(a => !numericTypes.has(a.type) && !flowTypes.has(a.type)),
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
      // ── v8.34 / GAP-S1:dyn 參數(數字或動態公式)──
      //   純數字字串存 Number(維持舊資料型別);其餘原樣字串存放不求值(求值交下游)。
      function setActParamDyn(act, key, value) {
        const s = String(value == null ? '' : value).trim();
        if (s === '') { setActParam(act, key, ''); return; }
        setActParam(act, key, /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s);
      }
      // 軟性 lint(R-P0-5 於 UI 層落地:警示可見、不阻擋、不吞值)。
      //   合法:空 / 數字 / 範圍 N-M / 動態式(變數鏈與數字之四則組合;變數鏈容許
      //   cell_value.<r,c> 座標段)。回傳警示文字,'' = 無警示。
      function dynParamWarn(v) {
        if (v == null || v === '') return '';
        if (typeof v === 'number') return '';
        const s = String(v).trim();
        if (s === '') return '';
        if (/^-?\d+(\.\d+)?$/.test(s)) return '';
        if (/^\d+\s*-\s*\d+$/.test(s)) return '';                       // 範圍 2-5
        const TERM = '(?:-?\\d+(?:\\.\\d+)?|[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z0-9_]+)*(?:\\.\\d+,\\d+)?)';
        const EXPR = new RegExp('^' + TERM + '(?:\\s*[-+*/]\\s*' + TERM + ')*$');
        if (EXPR.test(s)) return '';
        return '⚠ 非數字/範圍/公式;將以原樣字串輸出(下游可能無法解讀)';
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

          // ── v8.32 / R-1:by-name 讀欄器(共用)──
          //   目的:additive 尾端加欄時,匯入端自動跟上(加欄只需改 export + schemas,
          //   不再重演 C-3 硬編號漏讀)。回傳 accessor:(row, 欄名) => 原始 cell 值;
          //   缺欄 → null(與 asStr/asNum/asBool 的空值語意組合 = 安全降級為預設)。
          //   同名欄以首見為準;header 名以匯出端 addRow 為單一真相,金測試集守恆。
          function _rowReader(ws) {
            const idx = {};
            ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
              const k = asStr(cell.value).trim();
              if (k && idx[k] == null) idx[k] = col;
            });
            const rd = (row, name) => {
              const i = idx[name];
              return i ? row.getCell(i).value : null;
            };
            rd.has = (name) => idx[name] != null;   // schema 偵測用(09 新舊版判斷等)
            return rd;
          }

          // ── 01_Global ── key-value 列(v8.46 Tier B:Key/Value 欄 by-name,免疫欄序)
          const ws1 = wb.getWorksheet('01_Global');
          if (ws1) {
            const C1 = _rowReader(ws1);
            ws1.eachRow((row, idx) => {
              if (idx === 1) return;
              const key = asStr(C1(row, 'Key')).trim();
              if (!key || !(key in g)) return;
              const raw = C1(row, 'Value');
              const def = g[key];
              if (typeof def === 'number')      g[key] = asNum(raw, def);
              else if (typeof def === 'boolean') g[key] = asBool(raw);
              else                              g[key] = asStr(raw);
            });
          } else warnings.push('找不到 01_Global');

          // ── 02_Layout ── 每列一個 Reel
          const ws2 = wb.getWorksheet('02_Layout');
          if (ws2) {
            const C2 = _rowReader(ws2);   // v8.32 / R-1:by-name
            const nl = [];
            ws2.eachRow((row, idx) => {
              if (idx === 1) return;
              const reel_id = asNum(C2(row, 'Reel_ID'), 0);
              if (!reel_id) return;
              nl.push({
                reel_id,
                y_offset: asNum(C2(row, 'Y_Offset'), 0),
                max_rows: asNum(C2(row, 'Max_Rows'), 1),
                has_subreel: asBool(C2(row, 'Has_SubReel')),
                subreel_position: asStr(C2(row, 'SubReel_Position')).trim(),
                subreel_rows: asNum(C2(row, 'SubReel_Rows'), 0),
                subreel_inherit_weight: asBool(C2(row, 'SubReel_Inherit_Weight')),
                // v8.1 bugfix:匯入對稱補讀 SubReel_Kind / SubReel_Symbol_Set / Cells(
                //   v5.1 / v7.5-Layer C 契約加法欄,原匯入漏讀 → round-trip 缺口)。舊檔缺欄 → 預設。
                subreel_kind: asStr(C2(row, 'SubReel_Kind')).trim() || 'STACK',
                subreel_symbol_set: asStr(C2(row, 'SubReel_Symbol_Set')).trim(),
                cells: (() => {
                  const s = asStr(C2(row, 'Cells')).trim();
                  if (!s) return null;   // 空 = 實心欄(與匯出對稱)
                  const arr = s.split(';').map(x => x.trim()).filter(Boolean);
                  return arr.length ? arr : null;
                })(),
              });
            });
            if (nl.length > 0) layout.splice(0, layout.length, ...nl);
          } else warnings.push('找不到 02_Layout');

          // ── 02b_Panels ── 副盤(panels)。15 欄,順序對齊 aconfig-xlsx.js 寫出;
          //   第 15 欄 Cells 為 "dx,dy" 以 ';' 串接的活格遮罩(空 = 整塊矩形)。
          //   無此分頁(舊檔)→ 不動 panels,僅提示;有分頁(含 0 列)→ 以檔案為準覆蓋。
          const ws2b = wb.getWorksheet('02b_Panels');
          if (ws2b) {
            const C2b = _rowReader(ws2b);   // v8.32 / R-1:by-name
            const np = [];
            ws2b.eachRow((row, idx) => {
              if (idx === 1) return;
              const panel_id = asStr(C2b(row, 'Panel_ID')).trim();
              if (!panel_id) return;
              const p = makePanel(panel_id);
              p.col    = asNum(C2b(row, 'Col'), 0);
              p.row    = asNum(C2b(row, 'Row'), 0);
              p.width  = asNum(C2b(row, 'Width'), 3);
              p.height = asNum(C2b(row, 'Height'), 3);
              const scrollFlag = asBool(C2b(row, 'Scroll'));
              p.symbol_set     = asStr(C2b(row, 'Symbol_Set')).trim();
              p.inherit_weight = asBool(C2b(row, 'Inherit_Weight'));
              p.join_payline   = asBool(C2b(row, 'Join_Payline'));
              p.note           = asStr(C2b(row, 'Note'));
              // Panel_Type(優先);舊檔無此欄 → 由 Scroll 推導(與 loadPanels 遷移一致)
              const ptypeRaw = asStr(C2b(row, 'Panel_Type')).trim().toUpperCase();
              p.panel_type = ptypeRaw || (scrollFlag === false ? 'COLLECT' : 'SCROLL');
              p.scroll = (p.panel_type === 'SCROLL');
              p.trigger_symbol    = asStr(C2b(row, 'Trigger_Symbol')).trim();
              p.collect_target_jp = asStr(C2b(row, 'Collect_Target_JP')).trim();
              p.trigger_reel      = asNum(C2b(row, 'Trigger_Reel'), 0);
              p.scroll_track      = asStr(C2b(row, 'Scroll_Track')).trim();       // v8.39 軌道(缺欄→'')
              p.scroll_step       = asNum(C2b(row, 'Scroll_Step'), 1);            // v8.39 軌道(缺欄→1)
              p.active_modes      = asStr(C2b(row, 'Active_Modes')).trim();       // v8.44 C-2(缺欄→'')
              p.eval_domain       = asStr(C2b(row, 'Eval_Domain')).trim().toUpperCase();  // v8.44 C-2
              p.payline_set       = asStr(C2b(row, 'Payline_Set')).trim();        // v8.44 C-2
              // Cells:";"/空白分隔 → 陣列;空 → null;再走 normalizeMask 正規化(向後相容)
              const cellsRaw = asStr(C2b(row, 'Cells')).trim();
              const cellsArr = cellsRaw ? cellsRaw.split(/[;\s]+/).filter(Boolean) : null;
              p.cells = Array.isArray(cellsArr) ? normalizeMask(cellsArr, p.width, p.height) : null;
              np.push(p);
            });
            // 有分頁就以檔案為準覆蓋(即使 0 列 → 清空 panels);舊檔無分頁才保留現狀
            panels.splice(0, panels.length, ...np);
          } else warnings.push('找不到 02b_Panels(舊檔?副盤未更新)');

          // ── 03b_Symbol_Sets ── 符號集 D:{ Set_Name: [Symbol_ID,...] }。有分頁 → 以檔案為準覆蓋。
          const ws3b = wb.getWorksheet('03b_Symbol_Sets');
          if (ws3b) {
            const C3b = _rowReader(ws3b);   // v8.46 Tier B:by-name
            const ns = {};
            ws3b.eachRow((row, idx) => {
              if (idx === 1) return;
              const setName = asStr(C3b(row, 'Set_Name')).trim();
              const sid     = asStr(C3b(row, 'Symbol_ID')).trim();
              if (!setName || !sid) return;
              (ns[setName] || (ns[setName] = [])).push(sid);
            });
            for (const k of Object.keys(symbolSets)) delete symbolSets[k];
            Object.assign(symbolSets, ns);
          } else warnings.push('找不到 03b_Symbol_Sets(舊檔?符號集未更新)');

          // ── 04b_Reel_Strips ── { enabled, strips: { mode: { reelId: [..] } } }。Strip_Sequence 逗號分隔。
          const ws4b = wb.getWorksheet('04b_Reel_Strips');
          if (ws4b) {
            const C4b = _rowReader(ws4b);   // v8.46 Tier B:by-name
            const strips = {};
            let en = false;
            ws4b.eachRow((row, idx) => {
              if (idx === 1) return;
              const mode = asStr(C4b(row, 'Mode_Scope')).trim();
              const rid  = asNum(C4b(row, 'Reel_ID'), 0);
              if (!mode || !rid) return;
              if (asBool(C4b(row, 'Enabled'))) en = true;
              const seq = asStr(C4b(row, 'Strip_Sequence')).split(',').map(s => s.trim()).filter(Boolean);
              if (!seq.length) return;
              (strips[mode] || (strips[mode] = {}))[rid] = seq;
            });
            reelStrips.enabled = en;
            for (const k of Object.keys(reelStrips.strips)) delete reelStrips.strips[k];
            Object.assign(reelStrips.strips, strips);
          } else warnings.push('找不到 04b_Reel_Strips(舊檔?輪帶未更新)');

          // ── 02c_Tracks ── v8.39 / GAP-F1+軌道:sheet 存在→以檔案為準整批替換,不存在→維持。
          const ws2c = wb.getWorksheet('02c_Tracks');
          if (ws2c) {
            const C2c = _rowReader(ws2c);   // by-name(R-P0-4)
            const nt = [];
            ws2c.eachRow((row, idx) => {
              if (idx === 1) return;
              const tid = asStr(C2c(row, 'Track_ID')).trim();
              if (!tid) return;
              nt.push(_normTrack({
                track_id: tid,
                scope: asStr(C2c(row, 'Scope')).trim() || 'MAIN',
                cells: asStr(C2c(row, 'Cells')).trim(),
                entry: asStr(C2c(row, 'Entry')).trim() || 'START',
                notes: asStr(C2c(row, 'Notes')),
              }));
            });
            tracks.splice(0, tracks.length, ...nt);
          }

          // ── 04c_Reel_Links ── v8.38 / GAP-T1:輪帶連動(additive)。
          //   sheet 存在 → 以檔案為準整批替換;不存在(舊檔)→ reelLinks 維持(03d 前例)。
          const ws4c = wb.getWorksheet('04c_Reel_Links');
          if (ws4c) {
            const C4c = _rowReader(ws4c);   // by-name(R-P0-4)
            const nl = [];
            ws4c.eachRow((row, idx) => {
              if (idx === 1) return;
              const lid = asStr(C4c(row, 'Link_ID')).trim();
              if (!lid) return;
              nl.push(_normReelLink({
                link_id: lid,
                mode_scope: asStr(C4c(row, 'Mode_Scope')).trim() || 'ALL',
                reels: asStr(C4c(row, 'Reels')).trim(),
                weight: asNum(C4c(row, 'Weight'), 0),
                link_kind: asStr(C4c(row, 'Link_Kind')).trim() || 'CLONE',
                notes: asStr(C4c(row, 'Notes')),
              }));
            });
            reelLinks.splice(0, reelLinks.length, ...nl);
          }

          // ── 21_Collection_Meters ── G-1(決策 B 補匯入):additive by-name;
          //   缺 sheet → 保留現有 meters(安全降級,同 04c/tracks)。Tiers 欄雙格式解析
          //   (JSON / 分號串)與 a_loader._parse_meter_tiers、aconfig-xlsx 序列化逐鍵一致。
          const ws21 = wb.getWorksheet('21_Collection_Meters');
          if (ws21) {
            const C21 = _rowReader(ws21);
            // 分號串:以 ':' 切最多 3 份(門檻/動作/參數),參數保留其內冒號;段以 ';' 切。
            //   JSON 形(cell 以 '[' 開頭):[{"threshold":..,"action":"..","params":".."}]。
            //   門檻非數字 → 略過該段(安全降級;前端 lint 已警示)。空 → []。
            const _importMeterTiers = (raw) => {
              const s = asStr(raw).trim();
              if (!s) return [];
              const out = [];
              if (s.startsWith('[')) {
                let arr;
                try { arr = JSON.parse(s); } catch (e) { return []; }
                if (!Array.isArray(arr)) return [];
                for (const it of arr) {
                  if (!it || typeof it !== 'object') continue;
                  const th = Number(it.threshold);
                  if (!Number.isFinite(th)) continue;
                  out.push({ threshold: th,
                             action: (it.action != null ? String(it.action).trim() : ''),
                             params: (it.params != null ? String(it.params).trim() : '') });
                }
                return out;
              }
              for (const seg of s.split(';')) {
                const t = seg.trim();
                if (!t) continue;
                const parts = [];
                let rest = t, ci = rest.indexOf(':');
                if (ci < 0) { parts.push(rest); }
                else {
                  parts.push(rest.slice(0, ci)); rest = rest.slice(ci + 1);
                  ci = rest.indexOf(':');
                  if (ci < 0) { parts.push(rest); }
                  else { parts.push(rest.slice(0, ci)); parts.push(rest.slice(ci + 1)); }
                }
                const th = Number(String(parts[0]).trim());
                if (!Number.isFinite(th)) continue;
                out.push({ threshold: th,
                           action: parts.length > 1 ? String(parts[1]).trim() : '',
                           params: parts.length > 2 ? String(parts[2]).trim() : '' });
              }
              return out;
            };
            const nm = [];
            ws21.eachRow((row, idx) => {
              if (idx === 1) return;
              const mid = asStr(C21(row, 'Meter_ID')).trim();
              if (!mid) return;
              nm.push(_normMeter({
                meter_id: mid,
                label: asStr(C21(row, 'Label')),
                mode_scope: asStr(C21(row, 'Mode_Scope')).trim() || 'ALL',
                fill_source: asStr(C21(row, 'Fill_Source')).trim(),
                fill_amount: asNum(C21(row, 'Fill_Amount'), 1),
                capacity: asNum(C21(row, 'Capacity'), 0),
                reset_scope: asStr(C21(row, 'Reset_Scope')).trim() || 'FEATURE',
                on_full_action: asStr(C21(row, 'On_Full_Action')).trim(),
                link_jackpot: asStr(C21(row, 'Link_Jackpot')).trim(),
                carry_over: asBool(C21(row, 'Carry_Over')),
                notes: asStr(C21(row, 'Notes')),
                tiers: _importMeterTiers(C21(row, 'Tiers')),
                tier_step: asNum(C21(row, 'Tier_Step'), 0),
                tier_repeat: asBool(C21(row, 'Tier_Repeat')),
              }));
            });
            meters.splice(0, meters.length, ...nm);
          }

          // ── 13_Jackpots ── 14 欄,以 makeJackpot 為基底覆蓋。有分頁 → 以檔案為準覆蓋。
          const ws13 = wb.getWorksheet('13_Jackpots');
          if (ws13) {
            const C13 = _rowReader(ws13);   // v8.32 / R-1:by-name
            const nj = [];
            ws13.eachRow((row, idx) => {
              if (idx === 1) return;
              const jp_id = asStr(C13(row, 'JP_ID')).trim();
              const name  = asStr(C13(row, 'Name')).trim();
              if (!jp_id && !name) return;
              const j = makeJackpot(jp_id || name);
              j.jp_id          = jp_id;
              j.name           = name;
              j.kind           = asStr(C13(row, 'Kind')).trim() || 'FIXED';
              j.mult           = asNum(C13(row, 'Multiplier'), 0);
              j.increment_pct  = asNum(C13(row, 'Increment_Pct'), 0);
              j.must_hit_by    = asNum(C13(row, 'Must_Hit_By'), 0);
              j.trigger_desc   = asStr(C13(row, 'Trigger_Desc'));
              j.trigger_type   = asStr(C13(row, 'Trigger_Type')).trim() || 'COLLECT';
              j.accum_pct      = asNum(C13(row, 'Accum_Pct'), 0);
              j.accum_mech     = asStr(C13(row, 'Accum_Mech'));
              j.collect_prob   = asNum(C13(row, 'Collect_Prob'), 0);
              j.collect_enter  = asStr(C13(row, 'Collect_Enter'));
              j.mode_scope     = asStr(C13(row, 'Mode_Scope')).trim() || 'ALL';
              j.notes          = asStr(C13(row, 'Notes'));
              nj.push(j);
            });
            jackpots.splice(0, jackpots.length, ...nj);
          } else warnings.push('找不到 13_Jackpots(舊檔?彩金未更新)');

          // ── 14_Bet_Config ── 上半 Key/Value 的 Ante Bet 區 + 下半 Buy Feature 清單(以空白 BF_ID 表頭分段)。
          const ws14 = wb.getWorksheet('14_Bet_Config');
          if (ws14) {
            const C14 = _rowReader(ws14);   // v8.46 Tier B:KV 段 Key/Value by-name
            const base = defaultBetConfig();
            const bf = [];
            let bfIdx = null;   // v8.46 Tier B:BF 子表內嵌表頭局部索引(by-name;null = 尚未進入 BF 區)
            ws14.eachRow((row, idx) => {
              if (idx === 1) return;
              // BF 區表頭:整列掃描 'BF_ID'(免疫欄序),就地建局部欄名索引
              if (bfIdx == null) {
                let isBfHdr = false;
                row.eachCell({ includeEmpty: false }, (cell) => {
                  if (asStr(cell.value).trim() === 'BF_ID') isBfHdr = true;
                });
                if (isBfHdr) {
                  bfIdx = {};
                  row.eachCell({ includeEmpty: false }, (cell, col) => {
                    const k = asStr(cell.value).trim();
                    if (k && bfIdx[k] == null) bfIdx[k] = col;
                  });
                  return;
                }
              }
              const bfRd = (name) => { const i = bfIdx && bfIdx[name]; return i ? row.getCell(i).value : null; };
              const kvKey = asStr(C14(row, 'Key')).trim();
              // v8.6:互斥/Feature Drop KV 附加在 sheet 尾端(BF 列之後)——以 key 名攔截,
              //   不論位於 BF 區前後皆正確歸位(與 Python loader 掃描式對齊)。
              const _tailKV = ['Ante_Buy_Exclusive', 'Feature_Drop_Enabled', 'Feature_Drop_Desc'];
              if (_tailKV.includes(kvKey)) {
                const v = C14(row, 'Value');
                if (kvKey === 'Ante_Buy_Exclusive')        base.ante_buy_exclusive   = asBool(v);
                else if (kvKey === 'Feature_Drop_Enabled') base.feature_drop_enabled = asBool(v);
                else if (kvKey === 'Feature_Drop_Desc')    base.feature_drop_desc    = asStr(v);
                return;
              }
              if (bfIdx == null) {
                // Ante Bet 區:Key / Value(by-name)
                if (!kvKey) return;                     // 空行分隔
                const v = C14(row, 'Value');
                if (kvKey === 'Ante_Bet_Enabled')      base.ante_bet_enabled      = asBool(v);
                else if (kvKey === 'Ante_Bet_Mult')         base.ante_bet_mult         = asNum(v, 1.25);
                else if (kvKey === 'Ante_Bet_Trigger_Mult') base.ante_bet_trigger_mult = asNum(v, 2.0);
                else if (kvKey === 'Ante_Bet_Desc')         base.ante_bet_desc         = asStr(v);
              } else {
                // Buy Feature 列(局部索引 by-name;含 BF_ID 本身;缺欄 → null 走預設)
                const bid = asStr(bfRd('BF_ID')).trim();
                if (!bid) return;                       // 空行分隔
                const f = makeBuyFeature(asStr(bfRd('Target_Mode')).trim());
                f.bf_id       = bid;
                f.target_mode = asStr(bfRd('Target_Mode')).trim();
                f.cost_mult   = asNum(bfRd('Cost_Mult'), 0);
                f.rtp_target  = asNum(bfRd('RTP_Target'), 0);
                f.enabled     = asBool(bfRd('Enabled'));
                f.notes       = asStr(bfRd('Notes'));
                f.kind        = asStr(bfRd('Kind')).trim().toUpperCase() || 'DIRECT';   // v8.6 E-15(舊檔缺 → DIRECT)
                bf.push(f);
              }
            });
            base.buy_features = bf;
            for (const k of Object.keys(betConfig)) delete betConfig[k];
            Object.assign(betConfig, _ensureBetConfigFields(base));
          } else warnings.push('找不到 14_Bet_Config(舊檔?押注設定未更新)');

          // ── v8.8 / R4 B-6:02d_Cell_Attributes(舊檔無 → 保持;有 sheet 即覆蓋)──
          const ws02d = wb.getWorksheet('02d_Cell_Attributes');
          if (ws02d) {
            const C02d = _rowReader(ws02d);   // v8.46 Tier B:by-name
            const cas = [];
            ws02d.eachRow((row, idx) => {
              if (idx === 1) return;
              const aid = asStr(C02d(row, 'Attr_ID')).trim();
              if (!aid) return;
              cas.push(_normCellAttr({ attr_id: aid, reel: asNum(C02d(row, 'Reel'), 1),
                         row: asNum(C02d(row, 'Row'), 1),
                         attr: asStr(C02d(row, 'Attr')).trim().toUpperCase() || 'MULT',
                         value: asStr(C02d(row, 'Value')).trim(),
                         mode_scope: asStr(C02d(row, 'Mode_Scope')).trim() || 'ALL',
                         notes: asStr(C02d(row, 'Notes')),
                         cap_value: asStr(C02d(row, 'Cap_Value')).trim(),   // v8.49 缺口4
                         // G-2:動態狀態(舊檔無此 5 欄 → asStr 得 "" = 純靜態屬性,安全降級)
                         state_type: asStr(C02d(row, 'State_Type')).trim().toUpperCase(),
                         state_init: asStr(C02d(row, 'State_Init')).trim(),
                         state_trigger: asStr(C02d(row, 'State_Trigger')).trim(),
                         on_state_action: asStr(C02d(row, 'On_State_Action')).trim(),
                         state_region: asStr(C02d(row, 'State_Region')).trim() }));
            });
            cellAttrs.splice(0, cellAttrs.length, ...cas);
          }

          // ── v8.6 / R5 E-18:14b_RTP_Variants(舊檔無 → 清空;有 sheet 即覆蓋)──
          const ws14b = wb.getWorksheet('14b_RTP_Variants');
          if (ws14b) {
            const C14b = _rowReader(ws14b);   // v8.46 Tier B:by-name
            const rvs = [];
            ws14b.eachRow((row, idx) => {
              if (idx === 1) return;
              const v = asStr(C14b(row, 'Variant')).trim();
              if (!v) return;
              rvs.push({ variant: v, target_rtp: asNum(C14b(row, 'Target_RTP'), 0),
                         max_bet: asNum(C14b(row, 'Max_Bet'), 0), notes: asStr(C14b(row, 'Notes')) });
            });
            betConfig.rtp_variants = rvs;
          }

          // ── v8.6 / R5 E-16:18_Gamble(KV;舊檔無 → 維持現值)──
          const ws18 = wb.getWorksheet('18_Gamble');
          if (ws18) {
            const C18 = _rowReader(ws18);   // v8.46 Tier B:Key/Value by-name
            const g = _defaultGamble();
            ws18.eachRow((row, idx) => {
              if (idx === 1) return;
              const k = asStr(C18(row, 'Key')).trim();
              const v = C18(row, 'Value');
              if (!k) return;
              if (k === 'Gamble_Enabled')        g.enabled = asBool(v);
              else if (k === 'Gamble_Type')      g.gamble_type = asStr(v).trim().toUpperCase() || 'CARD_COLOR';
              else if (k === 'Type_Desc')        g.type_desc = asStr(v);
              else if (k === 'Win_Mult_Options') g.win_mult_options = asStr(v) || '2';
              else if (k === 'Max_Rounds')       g.max_rounds = asNum(v, 5);
              else if (k === 'Cap_Mult')         g.cap_mult = asNum(v, 0);
              else if (k === 'Applies_To')       g.applies_to = asStr(v).trim().toUpperCase() || 'ALL_WINS';
              else if (k === 'Applies_Limit')    g.applies_limit = asNum(v, 0);
              else if (k === 'Collect_Anytime')  g.collect_anytime = asBool(v);
              // v8.23 / G2:非現金賭注/獎勵(缺 → 預設,向後相容)
              else if (k === 'Stake_Type')       g.stake_type = asStr(v).trim().toUpperCase() || 'WIN';
              else if (k === 'Reward_Type')      g.reward_type = asStr(v).trim().toUpperCase() || 'MULTIPLY_WIN';
              else if (k === 'Trigger')          g.gamble_trigger = asStr(v).trim();
              else if (k === 'Notes')            g.notes = asStr(v);
            });
            Object.assign(gamble, g);
          }

          // ── v8.25 / G4:19_Jackpot_Tiers(獎池級距 + 觸發方式)匯入 ──
          //   v8.31 / W-6 契約文件化:Jackpot_Trigger 以「首個非空值為準」。
          //   匯出契約只寫首列;手改 xlsx 於後續列填入不同 trigger 時,後續非空值一律忽略
          //   (不報錯、不覆寫)。級距列與觸發承載列正交:純觸發列(Tier/Label 皆空)不計級距。
          const ws19 = wb.getWorksheet('19_Jackpot_Tiers');
          if (ws19) {
            const C19 = _rowReader(ws19);   // v8.32 / R-1:by-name
            const jc = _defaultJackpot();
            ws19.eachRow((row, idx) => {
              if (idx === 1) return;
              const tier  = asStr(C19(row, 'Tier')).trim();
              const label = asStr(C19(row, 'Label')).trim();
              const trig  = asStr(C19(row, 'Jackpot_Trigger')).trim().toUpperCase();
              if (trig && !jc.trigger) jc.trigger = trig;   // 第一個非空觸發為準
              if (!tier && !label) return;                  // 純觸發承載列 → 不計級距
              jc.tiers.push({ tier, label, value: asNum(C19(row, 'Value'), 0),
                              notes: asStr(C19(row, 'Notes')).trim() });
            });
            jackpotCfg.tiers = jc.tiers;
            jackpotCfg.trigger = jc.trigger;
          }

          // ── v8.0:舊 A.xlsx 的 17_Bonus_Games 先解析成暫存,待 11/11c 匯入 modes 後再遷移進 modes。
          //   (11_Mode_Config 匯入會 replace modes 陣列,故不能在此直接塞。)
          const _legacy17 = [];
          const ws17 = wb.getWorksheet('17_Bonus_Games');
          if (ws17) {
            let cur = null;
            ws17.eachRow((row, idx) => {
              if (idx === 1) return;
              const bonus_id = asStr(row.getCell(1).value).trim();
              if (bonus_id) {
                cur = {
                  bonus_id,
                  type: asStr(row.getCell(2).value).trim() || 'WHEEL',
                  title: asStr(row.getCell(3).value),
                  trigger_desc: asStr(row.getCell(4).value),
                  mode_scope: asStr(row.getCell(5).value).trim() || 'ALL',
                  wheel_upgrade_to: asStr(row.getCell(6).value).trim(),
                  pick_count: asNum(row.getCell(7).value, 0),
                  collect_target: asNum(row.getCell(8).value, 0),
                  items: [],
                };
                _legacy17.push(cur);
              }
              if (!cur) return;
              const label = asStr(row.getCell(9).value);
              if (!label && !(row.getCell(10).value) && !(row.getCell(11).value)) return;
              cur.items.push({
                label,
                value: asNum(row.getCell(10).value, 0),
                weight: asNum(row.getCell(11).value, 0),
                is_end: asBool(row.getCell(12).value),
                link_jackpot: asStr(row.getCell(13).value).trim(),
              });
            });
          }

          // ── 11_Mode_Config ── 先匯入,後面 04/05/08/12 才有正確 modeNames
          const ws11 = wb.getWorksheet('11_Mode_Config');
          if (ws11) {
            const C11 = _rowReader(ws11);   // v8.32 / R-1:by-name(26 欄全數;加欄自動跟上)
            const nm = [];
            ws11.eachRow((row, idx) => {
              if (idx === 1) return;
              const mode = asStr(C11(row, 'Mode')).trim();
              if (!mode) return;
              nm.push({
                mode,
                trigger_condition: asStr(C11(row, 'Trigger_Condition')),
                spin_count: asNum(C11(row, 'Spin_Count'), 0),
                inherit_globals: asBool(C11(row, 'Inherit_Globals')),
                on_enter_reset_vars: asStr(C11(row, 'On_Enter_Reset_Vars')),
                notes: asStr(C11(row, 'Notes')),
                // v7.10 additive:舊檔無此欄 → 空字串(繼承全域)
                reset_scope: asStr(C11(row, 'Reset_Scope')).trim(),
                // v7.11 additive:舊檔無 → 空(不封頂/繼承)
                cap_enabled: asStr(C11(row, 'Cap_Enabled')).trim(),
                cap_value:   asStr(C11(row, 'Cap_Value')).trim(),
                stack_mode:  asStr(C11(row, 'Stack_Mode')).trim(),
                // v7.14 additive:舊檔無 → 空/0;mode_kind 空 → _ensureModeGameplayFields 補 'SPIN'。
                mode_kind:        asStr(C11(row, 'Mode_Kind')).trim().toUpperCase(),
                wheel_upgrade_to: asStr(C11(row, 'Wheel_Upgrade_To')).trim(),
                pick_count:       asNum(C11(row, 'Pick_Count'), 0),
                collect_target:   asNum(C11(row, 'Collect_Target'), 0),
                // v8.5 / R3 additive:舊檔無 → 空/0(_ensureModeGameplayFields 補預設)。
                choice_group:     asStr(C11(row, 'Choice_Group')).trim(),
                respin_base:      asNum(C11(row, 'Respin_Base'), 0),
                respin_reset_on:  asStr(C11(row, 'Respin_Reset_On')).trim().toUpperCase(),
                respin_stop_cond: asStr(C11(row, 'Respin_Stop_Cond')).trim(),
                // v8.7 / R6 A-2:舊檔無 → ''(繼承全域)
                pay_type_override: asStr(C11(row, 'Pay_Type_Override')).trim().toUpperCase(),
                // v8.22 / G3:Hold&Win 設定面(舊檔缺欄 → asStr/asBool 得空/false 安全降級)
                collect_enabled:        asBool(C11(row, 'Collect_Enabled')),
                respin_reset_symbol:    asStr(C11(row, 'Respin_Reset_Symbol')).trim(),
                grid_expand_in_collect: asBool(C11(row, 'Grid_Expand_In_Collect')),
                allow_persistent:       asBool(C11(row, 'Allow_Persistent')),
                // v8.24 / G5:結構化結束謂詞
                end_condition:          asStr(C11(row, 'End_Condition')).trim(),
                // v8.28 / 缺口B+C:解鎖前提清單/倍數複合覆寫
                unlock_requires:        asStr(C11(row, 'Unlock_Requires')).split(',').map(s => s.trim()).filter(Boolean),
                mult_compose_override:  asStr(C11(row, 'Mult_Compose_Override')).trim().toUpperCase(),
                refill_track_override:   asStr(C11(row, 'Refill_Track_Override')).trim(),   // v8.39 GAP-F1(缺欄→'')
                // 架構檢閱 #6:消除連鎖(Cascade)結構化宣告(舊檔缺欄 → false/0 安全降級)
                cascade_enabled:   asBool(C11(row, 'Cascade_Enabled')),
                cascade_max_depth: asNum(C11(row, 'Cascade_Max_Depth'), 0),
                items: [],          // 由 11c sheet 補(見下)
                trigger_pays: [],   // 由 11b sheet 補(見下)
              });
            });
            if (nm.length > 0) modes.splice(0, modes.length, ...nm);
          } else warnings.push('找不到 11_Mode_Config');

          // ── 11b_Mode_TriggerPays(v7.10 additive;舊檔無此 sheet → 跳過,trigger_pays 維持空)──
          const ws11b = wb.getWorksheet('11b_Mode_TriggerPays');
          if (ws11b) {
            const C11b = _rowReader(ws11b);   // v8.46 Tier B:by-name
            const byMode = {};
            ws11b.eachRow((row, idx) => {
              if (idx === 1) return;
              const mode = asStr(C11b(row, 'Mode')).trim();
              if (!mode) return;
              (byMode[mode] = byMode[mode] || []).push({
                scatter_count: asNum(C11b(row, 'Scatter_Count'), 0),
                pay:           asNum(C11b(row, 'Pay'), 0),
                grants_spins:  asNum(C11b(row, 'Grants_Spins'), 0),
              });
            });
            for (const m of modes) {
              if (byMode[m.mode]) m.trigger_pays = byMode[m.mode];
            }
          }

          // ── 11c_Mode_Items(v7.14 additive;舊檔無此 sheet → 跳過,items 維持空)──
          const ws11c = wb.getWorksheet('11c_Mode_Items');
          if (ws11c) {
            const C11c = _rowReader(ws11c);   // v8.32 / R-1:by-name
            const itByMode = {};
            ws11c.eachRow((row, idx) => {
              if (idx === 1) return;
              const mode = asStr(C11c(row, 'Mode')).trim();
              if (!mode) return;
              (itByMode[mode] = itByMode[mode] || []).push({
                label:        asStr(C11c(row, 'Item_Label')),
                value:        asNum(C11c(row, 'Item_Value'), 0),
                weight:       asNum(C11c(row, 'Item_Weight'), 0),
                is_end:       asBool(C11c(row, 'Item_Is_End')),
                link_jackpot: asStr(C11c(row, 'Item_Link_JP')).trim(),
                item_role:    asStr(C11c(row, 'Item_Role')).trim().toUpperCase(),   // v8.22 G3
                link_mode:    asStr(C11c(row, 'Item_Link_Mode')).trim(),            // v8.27 批8
              });
            });
            for (const m of modes) {
              if (itByMode[m.mode]) m.items = itByMode[m.mode];
            }
          }
          // 確保匯入後每個 mode 都有 additive 欄位(舊檔安全)
          modes.forEach(_ensureModeGameplayFields);

          // ── 05b_Mode_Grid_Range(§5.2 additive;逐模式逐輪可變列 min–max。舊檔無此 sheet → 跳過,
          //    模式維持繼承/推導)。有列的模式 → grid_explicit=true;各輪 min/max 全一致 → 收斂為廣播
          //    (reel_ranges=[]),否則填逐輪。by-name(欄序免疫)。──
          const ws5b = wb.getWorksheet('05b_Mode_Grid_Range');
          if (ws5b) {
            const C5b = _rowReader(ws5b);
            const byMode5b = {};
            ws5b.eachRow((row, idx) => {
              if (idx === 1) return;
              const mode = asStr(C5b(row, 'Mode') || C5b(row, 'Mode_Scope')).trim();
              if (!mode || mode.startsWith('#')) return;
              const rid = asNum(C5b(row, 'Reel_ID'), 0);
              if (!rid) return;
              (byMode5b[mode] = byMode5b[mode] || []).push({
                reel_id: rid,
                min_rows: asNum(C5b(row, 'Min_Rows'), 0),
                max_rows: asNum(C5b(row, 'Max_Rows'), 0),
                feature_max: asNum(C5b(row, 'Feature_Max'), 0),   // G-7/8:特色期列上限(缺欄→0)
              });
            });
            for (const m of modes) {
              const rr = byMode5b[m.mode];
              if (!rr || !rr.length) continue;
              m.grid_explicit = true;
              const allMin = rr.every(x => x.min_rows === rr[0].min_rows);
              const allMax = rr.every(x => x.max_rows === rr[0].max_rows);
              if (allMin && allMax) {
                m.row_min = rr[0].min_rows;
                m.row_max = rr[0].max_rows;
                m.reel_ranges = [];
              } else {
                m.reel_ranges = rr.map(x => ({ reel_id: x.reel_id, min_rows: x.min_rows, max_rows: x.max_rows }));
                m.row_min = Math.min(...rr.map(x => x.min_rows));
                m.row_max = Math.max(...rr.map(x => x.max_rows));
              }
              m.rows_variable = m.row_max > m.row_min || m.reel_ranges.some(x => x.max_rows > x.min_rows);
              // G-7/8 / D2甲:每模式特色 max(取各列最大;缺欄/0 → 無特色成長)
              m.row_feature_max = Math.max(0, ...rr.map(x => Number(x.feature_max) || 0));
            }
          }

          // ── G-7/8:02e_Geometry_Transitions(additive;舊檔無此 sheet → 跳過,幾何維持靜態)。
          //    by-name;掛回對應模式的 geometry_transitions(同 11b/11c 匯入範式)。──
          const ws02e = wb.getWorksheet('02e_Geometry_Transitions');
          if (ws02e) {
            const C02e = _rowReader(ws02e);
            const gtByMode = {};
            ws02e.eachRow((row, idx) => {
              if (idx === 1) return;
              const mode = asStr(C02e(row, 'Mode_Scope') || C02e(row, 'Mode')).trim();
              if (!mode || mode.startsWith('#')) return;
              const dim = asStr(C02e(row, 'Dimension')).trim().toUpperCase();
              if (!dim) return;   // 無維度 → 略過
              (gtByMode[mode] = gtByMode[mode] || []).push({
                dimension:      dim,
                trigger_source: asStr(C02e(row, 'Trigger_Source')).trim(),
                step:           asStr(C02e(row, 'Step')).trim(),
                cap:            asStr(C02e(row, 'Cap')).trim(),
                ways_recompute: asStr(C02e(row, 'Ways_Recompute')).trim().toUpperCase(),
                notes:          asStr(C02e(row, 'Notes')),
              });
            });
            for (const m of modes) {
              if (gtByMode[m.mode]) m.geometry_transitions = gtByMode[m.mode];
            }
          }

          // ── G-9:11d_Mode_Symbol_Ops(additive;舊檔無此 sheet → 跳過,符號集固定)。
          //    by-name;掛回對應模式的 symbol_ops(同 11b/11c/02e 匯入範式)。──
          const ws11d = wb.getWorksheet('11d_Mode_Symbol_Ops');
          if (ws11d) {
            const C11d = _rowReader(ws11d);
            const soByMode = {};
            ws11d.eachRow((row, idx) => {
              if (idx === 1) return;
              const mode = asStr(C11d(row, 'Mode_Scope') || C11d(row, 'Mode')).trim();
              if (!mode || mode.startsWith('#')) return;
              const op = asStr(C11d(row, 'Op')).trim().toUpperCase();
              if (!op) return;   // 無操作 → 略過
              (soByMode[mode] = soByMode[mode] || []).push({
                op:      op,
                target:  asStr(C11d(row, 'Target')).trim(),
                count:   asStr(C11d(row, 'Count')).trim(),
                immune:  asStr(C11d(row, 'Immune')).trim(),
                trigger: asStr(C11d(row, 'Trigger')).trim(),
                notes:   asStr(C11d(row, 'Notes')),
              });
            });
            for (const m of modes) {
              if (soByMode[m.mode]) m.symbol_ops = soByMode[m.mode];
            }
          }

          // ── G-4:22_HoldWin(additive;舊檔無此 sheet → 跳過,hw_ 欄維持預設)。
          //    by-name;一行一模式,設 mode 的 hw_ 欄(respin 本體沿用 11_Mode_Config)。──
          const ws22 = wb.getWorksheet('22_HoldWin');
          if (ws22) {
            const C22 = _rowReader(ws22);
            const hwByMode = {};
            ws22.eachRow((row, idx) => {
              if (idx === 1) return;
              const mode = asStr(C22(row, 'Mode_Scope') || C22(row, 'Mode')).trim();
              if (!mode || mode.startsWith('#')) return;
              hwByMode[mode] = {
                hw_trigger_symbol: asStr(C22(row, 'Trigger_Symbol')).trim(),
                hw_persist_value:  asBool(C22(row, 'Persist_Value')),
                hw_collect_rule:   asStr(C22(row, 'Collect_Rule')).trim(),
                hw_link_jackpot:   asStr(C22(row, 'Link_Jackpot')).trim(),
              };
            });
            for (const m of modes) {
              if (hwByMode[m.mode]) Object.assign(m, hwByMode[m.mode]);
            }
          }

          // ── v8.0:把暫存的舊 17_Bonus_Games 遷移進 modes(同名略過;lossy:trigger 需人工重接)──
          if (_legacy17.length) {
            const takenM = new Set(modes.map(x => x.mode));
            let mig = 0;
            for (const g of _legacy17) {
              if (!g.bonus_id || takenM.has(g.bonus_id)) continue;
              const nm = makeMode(g.bonus_id);
              _ensureModeGameplayFields(nm);
              nm.mode_kind = (g.type || 'WHEEL').toUpperCase();
              nm.wheel_upgrade_to = g.wheel_upgrade_to || '';
              nm.pick_count = Number(g.pick_count) || 0;
              nm.collect_target = Number(g.collect_target) || 0;
              nm.items = g.items.map(it => ({
                label: it.label || '', value: Number(it.value) || 0, weight: Number(it.weight) || 0,
                is_end: !!it.is_end, link_jackpot: it.link_jackpot || '',
              }));
              const nts = [];
              if (g.title && g.title !== g.bonus_id) nts.push(g.title);
              if (g.trigger_desc) nts.push('觸發(舊):' + g.trigger_desc);
              if (g.mode_scope && g.mode_scope !== 'ALL') nts.push('原適用模式:' + g.mode_scope);
              nm.notes = nts.join(' / ');
              modes.push(nm);
              takenM.add(g.bonus_id);
              mig++;
            }
            if (mig) warnings.push(`已將 ${mig} 個舊版 Bonus(17_Bonus_Games)遷移為模式玩法種類;觸發條件需手動重接`);
          }

          // ── 12_Distribution_Bins ──
          const ws12 = wb.getWorksheet('12_Distribution_Bins');
          if (ws12) {
            const C12 = _rowReader(ws12);   // v8.46 Tier B:by-name
            Object.keys(bins).forEach(k => delete bins[k]);
            ws12.eachRow((row, idx) => {
              if (idx === 1) return;
              const m = asStr(C12(row, 'Mode_Scope')).trim();
              if (!m) return;
              bins[m] = {
                bin_edges: asStr(C12(row, 'Bin_Edges')),
                notes: asStr(C12(row, 'Notes')),
              };
            });
          }

          // ── 06_Paylines ──
          const ws6 = wb.getWorksheet('06_Paylines');
          if (ws6) {
            const C6 = _rowReader(ws6);   // v8.32 / R-1:by-name
            const np = [];
            ws6.eachRow((row, idx) => {
              if (idx === 1) return;
              const line_id = asNum(C6(row, 'Line_ID'), 0);
              if (!line_id) return;
              np.push({
                line_id,
                path: asStr(C6(row, 'Path')),
                direction: asStr(C6(row, 'Direction')) || 'LTR',
                notes: asStr(C6(row, 'Notes')),
              });
            });
            if (np.length > 0) paylines.splice(0, paylines.length, ...np);
          }

          // ── 07_Constraints ──
          const ws7 = wb.getWorksheet('07_Constraints');
          if (ws7) {
            const C7 = _rowReader(ws7);   // v8.32 / R-1:by-name
            const nc = [];
            ws7.eachRow((row, idx) => {
              if (idx === 1) return;
              const cid = asStr(C7(row, 'Constraint_ID')).trim();
              if (!cid) return;
              nc.push({
                constraint_id: cid,
                ctype: asStr(C7(row, 'Type')) || 'REEL_RESTRICT',
                symbol_id: asStr(C7(row, 'Symbol_ID')),
                reels_allowed: asStr(C7(row, 'Reels_Allowed')),
                threshold: asNum(C7(row, 'Max_Count_Global'), 0),
                mode_scope: asStr(C7(row, 'Mode_Scope')) || 'ALL',
                notes: asStr(C7(row, 'Notes')),
              });
            });
            if (nc.length > 0) constraints.splice(0, constraints.length, ...nc);
          }

          // ── 07b_Gen_Limits ── 產牌限制(v7.11 additive;舊檔無此 sheet → 跳過,genLimits 維持)
          const ws7b = wb.getWorksheet('07b_Gen_Limits');
          if (ws7b) {
            const C7b = _rowReader(ws7b);   // v8.46 Tier B:by-name
            const ngl = [];
            ws7b.eachRow((row, idx) => {
              if (idx === 1) return;
              const lid = asStr(C7b(row, 'Limit_ID')).trim();
              if (!lid) return;
              const maxRaw = C7b(row, 'Max_Count');
              const maxStr = asStr(maxRaw).trim();
              ngl.push({
                limit_id: lid,
                symbol_id: asStr(C7b(row, 'Symbol_ID')),
                zone: asStr(C7b(row, 'Zone')) || 'MAIN',
                min_count: asNum(C7b(row, 'Min_Count'), 0),
                max_count: (maxStr === '' ? null : asNum(maxRaw, null)),
                mode_scope: asStr(C7b(row, 'Mode_Scope')) || 'ALL',
                notes: asStr(C7b(row, 'Notes')),
              });
            });
            // additive:有 sheet 就以匯入內容覆蓋(空 sheet → 清空,語義正確)
            genLimits.splice(0, genLimits.length, ...ngl);
          }

          // ── 07c_Gen_Constraints ── 關聯型產牌條件(§4.8/§4.9 additive;舊檔無 sheet → 跳過,genConstraints 維持)
          const ws7c = wb.getWorksheet('07c_Gen_Constraints');
          if (ws7c) {
            const C7c = _rowReader(ws7c);   // Tier B:by-name
            const ngc = [];
            ws7c.eachRow((row, idx) => {
              if (idx === 1) return;
              const cid = asStr(C7c(row, 'Constraint_ID')).trim();
              if (!cid) return;
              let exceptObj = null;
              const exRaw = asStr(C7c(row, 'Except')).trim();
              if (exRaw) { try { exceptObj = JSON.parse(exRaw); } catch (e) { exceptObj = null; } }
              const symRaw = asStr(C7c(row, 'Symbols')).trim();
              ngc.push({
                constraint_id: cid,
                enabled: String(asStr(C7c(row, 'Enabled'))).toUpperCase() !== 'FALSE',
                ctype: asStr(C7c(row, 'Ctype')) || 'sum',
                symbols: symRaw ? symRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
                op: asStr(C7c(row, 'Op')) || 'le',
                value: asNum(C7c(row, 'Value'), 1),
                value_type: asStr(C7c(row, 'Value_Type')) || 'fixed',
                relation: asStr(C7c(row, 'Relation')) || '相鄰',
                board_state: asStr(C7c(row, 'Board_State')) || '已填滿',
                except: exceptObj,
                notes: asStr(C7c(row, 'Notes')),
              });
            });
            genConstraints.splice(0, genConstraints.length, ...ngc);
          }

          // ── 10_Discard_Rules ──
          const ws10 = wb.getWorksheet('10_Discard_Rules');
          if (ws10) {
            const C10 = _rowReader(ws10);   // v8.46 Tier B:by-name
            const _dcEn = (v) => (v == null || v === '') ? true : ['TRUE','1','YES','Y'].includes(String(v).trim().toUpperCase());   // §4.10b
            const nd = [];
            ws10.eachRow((row, idx) => {
              if (idx === 1) return;
              const did = asStr(C10(row, 'Discard_ID')).trim();
              if (!did) return;
              nd.push({
                discard_id: did,
                discard_kind: asStr(C10(row, 'Discard_Kind')) || 'HARD',
                mode_scope: asStr(C10(row, 'Mode_Scope')) || 'ALL',
                condition: asStr(C10(row, 'Condition')),
                notes: asStr(C10(row, 'Notes')),
                enabled: _dcEn(C10(row, 'Enabled')),   // §4.10b
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
            // v8.32 / R-1:統一走 by-name 讀欄器(取代 v8.29 的手動 hdr 掃描;
            //   新/舊 schema 欄名互斥處各自 by-name,同名 Notes 欄因分支互斥不衝突)。
            const C9 = _rowReader(ws9);
            const isNewSchema = C9.has('Actions') && C9.has('Enabled');

            const nr = [];
            ws9.eachRow((row, idx) => {
              if (idx === 1) return;
              const rid = asStr(C9(row, 'Rule_ID')).trim();
              if (!rid) return;
              if (isNewSchema) {
                // 新 schema: Rule_ID | Priority | Trigger | Condition | Actions | Emits | Enabled
                //           | Description | Random_Group | Random_Weight | Persistent | Notes
                const fullCondition = asStr(C9(row, 'Condition'));
                const { mode_scope, rest_condition } = extractModeScope(fullCondition);
                const emitsStr = asStr(C9(row, 'Emits'));
                const enabledStr = asStr(C9(row, 'Enabled')).trim().toUpperCase();
                let actions = [];
                try {
                  actions = parseActionsDSL(asStr(C9(row, 'Actions')));
                } catch (e) {
                  console.warn(`[09_Puzzle_Rules] rule ${rid} actions parse failed:`, e);
                }
                nr.push({
                  ...makeRule(rid),
                  rule_id: rid,
                  priority: asNum(C9(row, 'Priority'), 100),
                  trigger: asStr(C9(row, 'Trigger')) || 'ON_GRID_GENERATED',
                  condition: rest_condition,
                  mode_scope: mode_scope || 'ALL',
                  actions,
                  emits: emitsStr ? emitsStr.split(',').map(s => s.trim()).filter(Boolean) : [],
                  enabled: enabledStr !== 'FALSE' && enabledStr !== 'NO' && enabledStr !== '0',
                  description: asStr(C9(row, 'Description')),
                  random_group: asStr(C9(row, 'Random_Group')).trim(),                 // v8.4 P5
                  random_weight: C9.has('Random_Weight') ? asNum(C9(row, 'Random_Weight'), 100) : 100,  // v8.4 P5
                  persistent: asBool(C9(row, 'Persistent')),                           // v8.21 G1
                  notes:      asStr(C9(row, 'Notes')).trim(),                          // v8.28 缺口A
                  fire_chance: C9.has('Fire_Chance') ? asNum(C9(row, 'Fire_Chance'), 1) : 1,  // v8.49 缺口1
                });
              } else {
                // 舊 schema:轉換到新 schema 結構
                const oldRow = {
                  rule_id: rid,
                  mode_scope: asStr(C9(row, 'Mode_Scope')) || 'ALL',
                  trigger: asStr(C9(row, 'Trigger')) || 'ON_GRID_GENERATED',
                  condition: asStr(C9(row, 'Condition')),
                  action_type: asStr(C9(row, 'Action_Type')),
                  action_params: asStr(C9(row, 'Action_Params')),
                  priority: asNum(C9(row, 'Priority'), 100),
                  notes: asStr(C9(row, 'Notes')),
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
            const C4 = _rowReader(ws4);   // v8.46 Tier B:by-name
            const nrw = {};
            ws4.eachRow((row, idx) => {
              if (idx === 1) return;
              const m   = asStr(C4(row, 'Mode_Scope')).trim();
              const rid = asNum(C4(row, 'Reel_ID'), 0);
              const sid = asStr(C4(row, 'Symbol_ID')).trim();
              const w   = asNum(C4(row, 'Weight'), 0);
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
            const C5 = _rowReader(ws5);   // v8.46 Tier B:by-name
            const ngw = {};
            ws5.eachRow((row, idx) => {
              if (idx === 1) return;
              const m   = asStr(C5(row, 'Mode_Scope')).trim();
              const rid = asNum(C5(row, 'Reel_ID'), 0);
              const sz  = asNum(C5(row, 'Grid_Size'), 0);
              const w   = asNum(C5(row, 'Weight'), 0);
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
            const C8 = _rowReader(ws8);   // v8.46 Tier B:by-name
            const ncw = {};
            ws8.eachRow((row, idx) => {
              if (idx === 1) return;
              const m    = asStr(C8(row, 'Mode_Scope')).trim();
              const step = asNum(C8(row, 'Combo_Step'), 0);
              const rid  = asNum(C8(row, 'Reel_ID'), 0);
              const sid  = asStr(C8(row, 'Symbol_ID')).trim();
              const w    = asNum(C8(row, 'Weight'), 0);
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
            const colModeScope = headers['Mode_Scope']      || null;   // v8.3 / R1 D-12(缺欄→null,舊檔安全)
            const colInstMult  = headers['Instance_Mult']   || null;   // v8.7 / R6 D-14(缺欄→null,舊檔安全)
            const colMinMatch  = headers['Min_Match']       || null;   // P0-2(缺欄→null,舊檔安全)
            const colGroupId   = headers['Group_ID']        || null;   // P0-3(缺欄→null,舊檔安全)
            const colMegaSizes = headers['Mega_Sizes']      || null;   // v8.35 GAP-H1(缺欄→null,舊檔安全)

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
              if (colModeScope) matched.mode_scope = asStr(row.getCell(colModeScope).value).trim();   // v8.3 D-12
              if (colInstMult)  matched.instance_mult = asBool(row.getCell(colInstMult).value);        // v8.7 D-14
              if (colMinMatch)  matched.min_match = asNum(row.getCell(colMinMatch).value, 3); // P0-2(applyAll→cloneSymbol 正規化 0/≤0→3)
              if (colGroupId)   matched.group_id = asStr(row.getCell(colGroupId).value).trim(); // P0-3
              if (colMegaSizes) matched.mega_sizes = asStr(row.getCell(colMegaSizes).value).trim(); // v8.35 GAP-H1(原樣字串)
              updated++;
            });
            // 把更新後的 symbols 套回 registry(觸發 changed)
            try { registry.applyAll(allSyms, registry.swatchMap()); } catch (e) {}
            if (updated > 0 || skipped > 0) {
              warnings.push(`03_Symbols:更新 ${updated} 個符號,跳過 ${skipped} 個(無對應的 Symbol_ID/Display_Name)`);
            }
          }

          // ── 03c_Paytable ── v8.3 / R1 A-1:匯入對稱(修 pre-existing round-trip 缺口:
          //   匯出寫 pay_rows 到 03c,但匯入原本只讀 03 的 Pay_3x–6x → 2/7/8+ 連與區間丟失)。
          //   欄位:Symbol_ID | Count | Pay | Count_From | Count_To(v8.3 區間;缺欄→單點)。
          //   比照 15b「以檔案為準」:sheet 存在 → 先清空 pay_rows 再依檔案填;
          //   sheet 不存在(舊檔)→ 跳過,沿用 03 的 Pay_Nx(既有行為,pay_rows 由遷移函式回推)。
          const ws3c = wb.getWorksheet('03c_Paytable');
          if (ws3c && registry) {
            const allSyms = registry.symbols();
            const h3c = {};
            ws3c.getRow(1).eachCell((cell, col) => { h3c[asStr(cell.value).trim()] = col; });
            const cSid3c  = h3c['Symbol_ID']  || 1;
            const cCnt3c  = h3c['Count']      || 2;
            const cPay3c  = h3c['Pay']        || 3;
            const cFrom3c = h3c['Count_From'] || null;
            const cTo3c   = h3c['Count_To']   || null;
            const paysBySid = new Map();
            ws3c.eachRow((row, idx) => {
              if (idx === 1) return;
              const sid = asStr(row.getCell(cSid3c).value).trim();
              if (!sid) return;
              const pay = asNum(row.getCell(cPay3c).value, 0);
              const cnt = asNum(row.getCell(cCnt3c).value, 0);
              let from = cFrom3c ? asNum(row.getCell(cFrom3c).value, 0) : 0;
              if (!(from > 0)) from = cnt;
              let to = cTo3c ? asNum(row.getCell(cTo3c).value, 0) : 0;
              if (!(to > from)) to = 0;
              if (!(from >= 2) || !(pay > 0)) return;
              if (!paysBySid.has(sid)) paysBySid.set(sid, []);
              paysBySid.get(sid).push({ count: Math.round(from), count_to: to ? Math.round(to) : 0, pay });
            });
            const matchSym3c = (sid) => allSyms.find(s =>
              (s.symbol_id && s.symbol_id === sid) || (s.name && s.name === sid));
            let pUpdated = 0, pSkipped = 0;
            for (const s of allSyms) { s.pay_rows = []; }   // 以檔案為準(無列者由 Pay_Nx 回推,見上)
            for (const [sid, rows] of paysBySid) {
              const m = matchSym3c(sid);
              if (!m) { pSkipped++; continue; }
              rows.sort((a, b) => a.count - b.count);
              m.pay_rows = rows;
              // 回填 pay_3x–6x 相容欄(僅單點列;pay_rows 為主)
              const by3c = {};
              rows.forEach(r => { if (!r.count_to) by3c[r.count] = r.pay; });
              m.pay_3x = Number(by3c[3]) || 0; m.pay_4x = Number(by3c[4]) || 0;
              m.pay_5x = Number(by3c[5]) || 0; m.pay_6x = Number(by3c[6]) || 0;
              pUpdated++;
            }
            try { registry.applyAll(allSyms, registry.swatchMap()); } catch (e) {}
            if (pUpdated > 0 || pSkipped > 0) {
              warnings.push(`03c_Paytable:更新 ${pUpdated} 個符號賠付表`
                + (pSkipped ? `,跳過 ${pSkipped} 個(無對應符號)` : ''));
            }
          }

          // ── 03d_Symbol_Groups ── P0-3:符號家族(additive;舊檔無此 sheet → symbolGroups 維持)。
          //   by-name 讀;有 sheet 即整批覆蓋 symbolGroups(比照 02d/07b 匯入)。
          const ws03d = wb.getWorksheet('03d_Symbol_Groups');
          if (ws03d) {
            const hRow = ws03d.getRow(1);
            const H = {};
            hRow.eachCell((cell, col) => { H[asStr(cell.value).trim()] = col; });
            const cGid = H['Group_ID'] || null;
            const gcell = (row, name) => (H[name] ? row.getCell(H[name]).value : null);
            const ng = [];
            if (cGid) {
              ws03d.eachRow((row, idx) => {
                if (idx === 1) return;
                const gid = asStr(row.getCell(cGid).value).trim();
                if (!gid) return;
                ng.push(_normSymGroup({
                  group_id: gid,
                  display_name: asStr(gcell(row, 'Display_Name')),
                  match_mode: asStr(gcell(row, 'Match_Mode')),
                  members_keep_individual: (H['Members_Keep_Individual'] ? asBool(gcell(row, 'Members_Keep_Individual')) : true),
                  mode_scope: asStr(gcell(row, 'Mode_Scope')).trim(),
                  pay_3x: asNum(gcell(row, 'Pay_3x'), 0),
                  pay_4x: asNum(gcell(row, 'Pay_4x'), 0),
                  pay_5x: asNum(gcell(row, 'Pay_5x'), 0),
                  pay_6x: asNum(gcell(row, 'Pay_6x'), 0),
                  notes: asStr(gcell(row, 'Notes')),
                }));
              });
              symbolGroups.splice(0, symbolGroups.length, ...ng);
              warnings.push(`03d_Symbol_Groups:載入 ${ng.length} 個符號家族`);
            }
          }

          // ── 03e_Symbol_Group_Pays ── P0-3 進階:家族 per-mode 費率覆寫(additive)。
          //   併入已載入家族的 pay_by_mode(以 Group_ID 對應;缺 sheet → 略過)。
          const ws03e = wb.getWorksheet('03e_Symbol_Group_Pays');
          if (ws03e && symbolGroups.length) {
            const hr = ws03e.getRow(1); const HE = {};
            hr.eachCell((cell, col) => { HE[asStr(cell.value).trim()] = col; });
            const byId = {};
            symbolGroups.forEach(g0 => { if (g0.group_id) { byId[g0.group_id] = g0; g0.pay_by_mode = {}; } });
            let gpN = 0;
            if (HE['Group_ID'] && HE['Mode']) {
              ws03e.eachRow((row, idx) => {
                if (idx === 1) return;
                const gid = asStr(row.getCell(HE['Group_ID']).value).trim();
                const mode = asStr(row.getCell(HE['Mode']).value).trim();
                if (!gid || !mode || !byId[gid]) return;
                const p3 = asNum(HE['Pay_3x'] ? row.getCell(HE['Pay_3x']).value : 0, 0);
                const p4 = asNum(HE['Pay_4x'] ? row.getCell(HE['Pay_4x']).value : 0, 0);
                const p5 = asNum(HE['Pay_5x'] ? row.getCell(HE['Pay_5x']).value : 0, 0);
                const p6 = asNum(HE['Pay_6x'] ? row.getCell(HE['Pay_6x']).value : 0, 0);
                if (!(p3 || p4 || p5 || p6)) return;
                byId[gid].pay_by_mode[mode] = { pay_3x: p3, pay_4x: p4, pay_5x: p5, pay_6x: p6 };
                gpN++;
              });
              if (gpN) warnings.push(`03e_Symbol_Group_Pays:載入 ${gpN} 筆家族模式覆寫`);
            }
          }

          // ── 15b_Symbol_Mults ── 符號倍數/彩金「權威表」,寫回符號物件的 mult_values / prize_values。
          //   單一真相:15/16_* 為此表反推的衍生分頁,匯入端不回讀(下次匯出由 _deriveSymbolMults 重生)。
          //   欄位:Symbol_ID | Kind(MULT/PRIZE) | Value | Weight | Link_JP | W_<mode>...(僅 PRIZE 用)。
          //   同一符號多列:MULT 聚成 mult_values[]、PRIZE 聚成 prize_values[];以 03_Symbols 後的符號為對象。
          const ws15b = wb.getWorksheet('15b_Symbol_Mults');
          if (ws15b && registry) {
            const allSyms = registry.symbols();
            // 動態欄位偵測(W_<mode> 在尾端,數量隨模式變)
            const hRow = ws15b.getRow(1);
            const hIdx = {};
            const modeCols = {};   // mode → col(W_<mode>)
            hRow.eachCell((cell, col) => {
              const h = asStr(cell.value).trim();
              if (h.startsWith('W_')) modeCols[h.slice(2)] = col;
              else hIdx[h] = col;
            });
            const cId   = hIdx['Symbol_ID'] || 1;
            const cKind = hIdx['Kind']      || 2;
            const cVal  = hIdx['Value']     || 3;
            const cWt   = hIdx['Weight']    || 4;
            const cLink = hIdx['Link_JP']   || 5;
            // 聚合:sid → { mults:[], prizes:[] }
            const bySid = new Map();
            ws15b.eachRow((row, idx) => {
              if (idx === 1) return;
              const sid = asStr(row.getCell(cId).value).trim();
              if (!sid) return;
              const kind = asStr(row.getCell(cKind).value).trim().toUpperCase();
              if (!bySid.has(sid)) bySid.set(sid, { mults: [], prizes: [] });
              const bucket = bySid.get(sid);
              if (kind === 'MULT') {
                // v8.3 / R1 D-13:MULT 比照 PRIZE 讀 per-mode 權重(舊檔恆空欄 → {})
                const mwbm = {};
                for (const [mode, col] of Object.entries(modeCols)) {
                  const raw = row.getCell(col).value;
                  if (raw != null && asStr(raw).trim() !== '') mwbm[mode] = asNum(raw, 0);
                }
                bucket.mults.push({ mult: asNum(row.getCell(cVal).value, 0), weight: asNum(row.getCell(cWt).value, 0), weight_by_mode: mwbm });
              } else if (kind === 'PRIZE') {
                const wbm = {};
                for (const [mode, col] of Object.entries(modeCols)) {
                  const raw = row.getCell(col).value;
                  if (raw != null && asStr(raw).trim() !== '') wbm[mode] = asNum(raw, 0);
                }
                bucket.prizes.push({
                  value: asNum(row.getCell(cVal).value, 0),
                  weight: asNum(row.getCell(cWt).value, 0),
                  link_jackpot: asStr(row.getCell(cLink).value).trim(),
                  weight_by_mode: wbm,
                });
              }
            });
            // 寫回符號:有出現在 15b 的符號覆蓋,沒出現的清空(以檔案為準,與其他分頁一致)
            let smUpdated = 0, smSkipped = 0;
            const matchSym = (sid) => allSyms.find(s =>
              (s.symbol_id && s.symbol_id === sid) || (s.name && s.name === sid));
            // 先全部清空(只清有對到 registry 的),再依檔案填,避免殘留舊值造成雙真相
            for (const s of allSyms) { s.mult_values = []; s.prize_values = []; }
            for (const [sid, b] of bySid) {
              const m = matchSym(sid);
              if (!m) { smSkipped++; continue; }
              m.mult_values  = b.mults;
              m.prize_values = b.prizes;
              smUpdated++;
            }
            try { registry.applyAll(allSyms, registry.swatchMap()); } catch (e) {}
            if (smUpdated > 0 || smSkipped > 0) {
              warnings.push(`15b_Symbol_Mults:更新 ${smUpdated} 個符號,跳過 ${smSkipped} 個(無對應符號)`);
            }
          } else if (!ws15b) {
            warnings.push('找不到 15b_Symbol_Mults(舊檔?符號倍數/彩金未更新)');
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
        // v4.9:內建範本恆置頂(不受搜尋外的排序影響;搜尋仍可過濾掉它)
        const builtins = sorted.filter(t => t.builtin);
        const users    = sorted.filter(t => !t.builtin);
        return [...builtins, ...users];
      });
      // v4.9:標頭計數只算使用者範本(內建恆在,計入會誤導「已存了 1 份」)
      const userTemplateCount = computed(() =>
        templateList.value.filter(t => !t.builtin).length);
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
        // v4.9:優先走 Templates API(內建範本不在 LS,需由 API 的 builder 取得)
        const api = tplApi();
        if (api && typeof api.getData === 'function') {
          try {
            const d = api.getData(slug);
            if (d) return d;
          } catch (e) { /* fallthrough → 走 LS 直讀 */ }
        }
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
        // v4.9:內建範本不可刪除(UI 已隱藏按鈕,此為雙保險)
        if (t && t.builtin) {
          emit('status', { type: 'err', msg: '內建範本無法刪除' });
          return;
        }
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
          // 單一真相:走 aconfig-xlsx.js 的完整匯出器(含 02b_Panels + Cells 等 23 sheet)
          if (typeof window.SlotPlanner?.buildAxlsxBufferFromLS !== 'function') {
            emit('status', { type: 'err', msg: 'aconfig-xlsx.js 未載入,無法匯出' });
            return;
          }
          // ── 寫出 + 下載 ──
          const buf = await window.SlotPlanner.buildAxlsxBufferFromLS();
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

      const activeTab = computed(() => TABS.find(t => t.id === active.value) || TABS.find(t => t.id === 'rules') || TABS[0]);
      // ── v8.14 批1:fit 頁集合(捲動白名單反集)──
      //   白名單(允許長內容捲動):layout / symbols / reel_strips。
      //   其餘分頁套 cfg-content--fit:清除底部人工撐高(64px Inspector 保留區、末段 margin、
      //   sticky-form height:100%),內容少即無滾動條;內容真超過視窗仍可捲(D1 安全降級)。
      const FIT_TABS = new Set([
        'rules', 'bet_config', 'paylines', 'constraints', 'jackpots',
        'distribution_bins', 'gamble', 'reel_weights', 'grid_size_weights',
        'global',   // 隱藏路由,一併涵蓋
      ]);
      const isFitTab = computed(() => FIT_TABS.has(active.value));

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
      // v4.9-b:模擬執行參數(simulation_count / random_seed / output_prefix /
      //        big_win_thresholds / dead_spin_buckets)已自 UI 移除,
      //        搜尋目錄同步下架(避免跳轉到不存在的欄位)
      const GLOBAL_FIELDS = [
        { key: 'pay_type',         label: '賠付類型' },
        { key: 'ways_direction',   label: 'Ways 方向' },
        { key: 'cluster_min_size', label: 'Cluster 最小群組' },
        { key: 'return_pct',       label: '目標 RTP' },
        { key: 'starting_mode',    label: '起始模式' },
        { key: 'jackpots',         label: 'JP 定義' },   // v5.2
        { key: 'bet_config',       label: '投注結構' },  // v5.3
        // v6.4 死碼移除:multipliers/coin_values 為不可達分頁,移除其搜尋索引項。
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

        // ─ 2b. JP 定義(v5.2)─
        for (const j of jackpots) {
          const nm = j.name || j.jp_id;
          if (!nm) continue;
          items.push({
            id: `jackpot:${j.jp_id}`,
            tab: 'global',
            category: 'field',
            categoryLabel: 'JP',
            icon: '💰',
            title: `JP ${nm}`,
            subtitle: `13_Jackpots · ${j.kind === 'PROGRESSIVE' ? '累積' : '固定'} ×${j.mult}`,
            haystack: `jp jackpot 彩池 ${nm} ${j.jp_id} ${j.trigger_desc || ''}`.toLowerCase(),
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

        // ─ 10. 全域動作(Raycast 式 Command Palette:不只跳轉,也能直接執行)─
        const actionItems = [
          { id: 'action:reset-tab', title: '重設此分頁為預設值', subtitle: '清空目前分頁的所有輸入',
            run: () => resetCurrent() },
          { id: 'action:export-xlsx', title: '匯出 A.xlsx', subtitle: '產生設定檔並下載',
            run: () => exportXlsx() },
          { id: 'action:open-preset', title: '開啟規則庫（Preset）', subtitle: '快速插入常用 slot 機制條件',
            run: () => { navTo('rules'); presetDrawerOpen.value = true; } },
          { id: 'action:validation-panel', title: '開啟健檢面板', subtitle: '檢視全案驗證問題（錯誤/警告）',
            run: () => toggleValidationPanel() },
        ];
        for (const a of actionItems) {
          items.push({
            id: a.id,
            category: 'action',
            categoryLabel: '動作',
            icon: '⚡',
            title: a.title,
            subtitle: a.subtitle,
            haystack: `${a.title} ${a.subtitle} action 動作`.toLowerCase(),
            run: a.run,
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
          // 空 query → 列出 tab / modes / 常用動作 作為「快速跳轉」
          return searchIndex.value
            .filter(i => i.category === 'tab' || i.category === 'mode' || i.category === 'action')
            .slice(0, 14);
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
      // ── UI/UX 改版 P2:快捷鍵一覽浮層(降低學習成本,不用死記右鍵/快捷鍵)──
      const shortcutsHelpOpen = ref(false);
      function openShortcutsHelp() { shortcutsHelpOpen.value = true; }
      function closeShortcutsHelp() { shortcutsHelpOpen.value = false; }
      // ── UI/UX 改版 P3:首次進入編輯器的一次性提示條,帶出「按 ? 看所有快捷鍵」(比照 04 跨模式提示的 dismiss 記憶模式)──
      const LS_SHORTCUTS_HINT_KEY = 'slotplanner.ui.shortcutsHintDismissed.v1';
      const shortcutsHintDismissed = ref(localStorage.getItem(LS_SHORTCUTS_HINT_KEY) === '1');
      function dismissShortcutsHint() {
        shortcutsHintDismissed.value = true;
        try { localStorage.setItem(LS_SHORTCUTS_HINT_KEY, '1'); } catch(_){}
      }
      function openShortcutsHelpFromHint() {
        dismissShortcutsHint();
        openShortcutsHelp();
      }
      function executeSearchResult(item) {
        if (!item) return;
        closeSearch();
        // v9.0:動作類項目直接執行(Raycast 式),不只是跳轉
        if (item.run) {
          item.run();
          emit('status', { type: 'ok', msg: `⚡ 已執行:${item.title}` });
          return;
        }
        // 切到對應 tab
        if (item.tab) navTo(item.tab);
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
        // UI/UX 改版 P2:Shift+? 開關「快捷鍵一覽」浮層(不在輸入框內才攔)
        if (ev.key === '?' && !ev.ctrlKey && !ev.metaKey) {
          const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName);
          if (!inField && !searchOpen.value) {
            ev.preventDefault();
            shortcutsHelpOpen.value = !shortcutsHelpOpen.value;
          }
        }
        // 範本面板 Esc：巢狀先關，再關範本彈窗；閉合順序由 TemplateUi.resolveTemplateEsc 決定
        if (ev.key === 'Escape' && showTemplatePanel.value) {
          const TU = (window.SlotPlanner && window.SlotPlanner.ConfigEditor
            && window.SlotPlanner.ConfigEditor.TemplateUi) || null;
          const cur = {
            showTemplatePanel: showTemplatePanel.value,
            diffOpen: diffOpen.value,
            tplLoadPreviewOpen: tplLoadPreviewOpen.value,
          };
          const next = TU
            ? TU.resolveTemplateEsc(cur)
            : { ...cur, showTemplatePanel: false };
          if (next.tplLoadPreviewOpen !== cur.tplLoadPreviewOpen && !next.tplLoadPreviewOpen) {
            closeTemplateDiff();
          } else if (next.diffOpen !== cur.diffOpen && !next.diffOpen) {
            closeDiffModal();
          } else if (next.showTemplatePanel !== cur.showTemplatePanel) {
            showTemplatePanel.value = next.showTemplatePanel;
          }
          ev.preventDefault();
          return;
        }
        // Esc:統一關閉快捷鍵一覽浮層(其餘各自的 popover/選單已各自綁定 Escape)
        if (ev.key === 'Escape' && shortcutsHelpOpen.value) {
          shortcutsHelpOpen.value = false;
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
        // ── UI/UX 改版 P2:規則頁 Delete/Backspace 刪除選取列、Ctrl+D 複製選取列 ──
        // (不在 input/textarea/select 內才攔,且僅在選取拼圖規則、非搜尋/選單開啟時生效)
        if (active.value === 'rules' && selectedKind.value === 'puzzle' && !searchOpen.value) {
          const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName);
          if (!inField && rules[selectedRuleIdx.value]) {
            if (ev.key === 'Delete' || ev.key === 'Backspace') {
              ev.preventDefault();
              removeRule(selectedRuleIdx.value);
            } else if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'd' || ev.key === 'D')) {
              ev.preventDefault();
              duplicateRule(selectedRuleIdx.value);
            }
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
        '全域設定':   'rules',            // v7.10:01_Global 併入規則頁,dirty 旗標掛規則 tab
        '模式設定':   'rules',            // v7.10:模式定義在規則頁「模式」子分頁
        '盤面結構':   'layout',
        '自由副盤':   'layout',           // v4.7:panel 歸 layout tab
        '符號集':     'layout',           // v4.7:符號集歸 layout tab
        '分佈區間':   'distribution_bins',
        '中獎線':     'paylines',
        '硬約束':     'constraints',
        '產牌限制':   'rules',            // v7.11:產牌限制為規則頁子分頁,dirty 掛規則 tab
        '格子屬性':   'layout',           // v8.8 R4:02d 格子屬性住盤面結構分頁
        'Reel 權重':  'reel_weights',
        '格數權重':   'grid_size_weights',
        '連爆權重':   'combo_weights',
        '棄牌規則':   'rules',            // v3.1:09+10 已合併為 'rules' tab
        '腳本規則':   'rules',            // v3.1:09+10 已合併為 'rules' tab
        '投注結構':   'bet_config',         // v5.3:14_Bet_Config 獨立分頁
        '比倍':       'gamble',             // v8.6 R5:18_Gamble
        '真實輪帶':   'reel_strips',        // v6.0-b:04b_Reel_Strips
        '倍數系統':   'multipliers',        // v5.4:15_Multipliers
        '金幣面額':   'coin_values',        // v5.4:16_Coin_Values
        'JP 定義':    'jackpots',         // v6.2 #0:JP 已獨立分頁
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
          case '自由副盤': return () => savePanels(panels.map(p => ({ ...p })));
          case '符號集':   return () => saveSymbolSets(JSON.parse(JSON.stringify(symbolSets)));
          case '分佈區間': return () => saveBins(JSON.parse(JSON.stringify(bins)));
          case '中獎線':   return () => savePaylines(paylines.map(p => ({ ...p })));
          case '硬約束':   return () => saveConstraints(constraints.map(c => ({ ...c })));
          case '產牌限制': return () => { saveGenLimits(genLimits.map(g => ({ ...g }))); saveGenConstraints(genConstraints.map(c => ({ ...c }))); };
          // 架構檢閱 #4 補充:以下 4 個 saver 原本 try 成功時沒有 return true,
          // 讓 _flushLabels 的 !saver() 恆為 true → ok 恆 false,使用者存這些分頁
          // 時永遠看到「localStorage 寫入失敗」(其實有寫成功)、dirty 也卡著不清。
          // 補 return true(失敗才 return false,交由 safeSetItem 的全域 quota 事件補提示)。
          case '格子屬性': return () => { try { localStorage.setItem(CELLATTRS_LS_KEY, JSON.stringify(cellAttrs.map(c => ({ ...c })))); return true; } catch (e) { return false; } };
          case '符號家族': return () => { try { localStorage.setItem(SYMGROUPS_LS_KEY, JSON.stringify(symbolGroups.map(g => ({ ...g })))); return true; } catch (e) { return false; } };   // P0-3
          case '輪帶連動': return () => { try { localStorage.setItem(REELLINKS_LS_KEY, JSON.stringify(reelLinks.map(l => ({ ...l })))); return true; } catch (e) { return false; } };   // v8.38 GAP-T1
          case '軌道':     return () => { try { localStorage.setItem(TRACKS_LS_KEY, JSON.stringify(tracks.map(t => ({ ...t })))); return true; } catch (e) { return false; } };   // v8.39 GAP-F1
          case '收集條':   return () => { try { localStorage.setItem(METERS_LS_KEY, JSON.stringify(meters.map(m => ({ ...m })))); return true; } catch (e) { return false; } };   // 架構檢閱 #21
          case 'Reel 權重': return () => saveReelWeights(JSON.parse(JSON.stringify(reelWeights)));
          case '格數權重': return () => saveGridWeights(JSON.parse(JSON.stringify(gridWeights)));
          case '連爆權重': return () => saveComboWeights(JSON.parse(JSON.stringify(comboWeights)));
          case '棄牌規則': return () => saveDiscards(discards.map(d => ({ ...d })));
          case '腳本規則': return () => saveRules(rules.map(r => ({ ...r })));
          case '投注結構': return () => saveBetConfig({ ...betConfig, buy_features: betConfig.buy_features.map(bf => ({ ...bf })), rtp_variants: (betConfig.rtp_variants || []).map(v => ({ ...v })) });
          case '比倍':     return () => { try { localStorage.setItem(GAMBLE_LS_KEY, JSON.stringify({ ...gamble })); } catch (e) {} };
          case '真實輪帶': return () => saveReelStrips({ enabled: reelStrips.enabled, strips: JSON.parse(JSON.stringify(reelStrips.strips)) });
          case '倍數系統': return () => saveMultipliers(JSON.parse(JSON.stringify(multipliers)));
          case '金幣面額': return () => saveCoinValues(JSON.parse(JSON.stringify(coinValues)));
          case 'JP 定義':  return () => saveJackpots(jackpots.map(j => ({ ...j })));
          case '獎池級距': return () => { try { localStorage.setItem(JACKPOT_LS_KEY, JSON.stringify({ tiers: jackpotCfg.tiers.map(t => ({ ...t })), trigger: jackpotCfg.trigger || '' })); } catch (e) {} };
          default: return null;
        }
      }
      // 400ms debounce 到點時真正執行的寫入邏輯,拆成獨立函式讓 flushPendingSaves()
      // 可以在「立刻」的情境(匯出/跨頁讀取前)重用同一套寫入 + 狀態更新程式碼,
      // 而不是各自另寫一份 LS 寫入邏輯(否則兩處邏輯會漂移)。
      function _flushLabels(labels, label) {
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
          if (label) emit('status', { type: 'ok', msg: `${label} 已自動儲存` });
        } else {
          emit('status', { type: 'err', msg: 'localStorage 寫入失敗' });
        }
        return ok;
      }
      function scheduleSave(label) {
        dirty.value = true;
        markTabDirty(label);
        if (label) _pendingSaves.add(label);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const labels = [..._pendingSaves];
          _pendingSaves.clear();
          saveTimer = null;
          _flushLabels(labels, label);
        }, 400);
      }
      // ── 記憶體優先讀取修補(架構檢閱 #2):匯出 A.xlsx / 跨頁讀取 LS 前呼叫此函式,
      //   強制立即寫完所有還在 400ms 防抖佇列裡的變更,避免「切頁/匯出讀到舊值」
      //   (根因見 syncGameSpec 旁註解)。無 pending 變更時是 no-op,不影響效能。
      //   於 onMounted 曝露到 window.SlotPlanner,讓 aconfig-xlsx.js / config-compare.js
      //   等非本元件模組在讀 LS 前可呼叫。
      function flushPendingSaves() {
        if (!saveTimer && _pendingSaves.size === 0) return true;
        clearTimeout(saveTimer);
        saveTimer = null;
        const labels = [..._pendingSaves];
        _pendingSaves.clear();
        return _flushLabels(labels, null);
      }
      watch(g,            () => scheduleSave('全域設定'), { deep: true });
      watch(modes,        () => scheduleSave('模式設定'), { deep: true });
      watch(layout,       () => scheduleSave('盤面結構'), { deep: true });
      watch(panels,       () => scheduleSave('自由副盤'), { deep: true });
      watch(symbolSets,   () => scheduleSave('符號集'),   { deep: true });
      watch(bins,         () => scheduleSave('分佈區間'), { deep: true });
      watch(paylines,     () => scheduleSave('中獎線'),   { deep: true });
      watch(constraints,  () => scheduleSave('硬約束'),   { deep: true });
      watch(genLimits,    () => scheduleSave('產牌限制'), { deep: true });
      watch(genConstraints, () => scheduleSave('產牌限制'), { deep: true });
      watch(cellAttrs,    () => scheduleSave('格子屬性'), { deep: true });   // v8.8 R4
      watch(symbolGroups, () => scheduleSave('符號家族'), { deep: true });   // P0-3
      watch(reelLinks, () => scheduleSave('輪帶連動'), { deep: true });        // v8.38 GAP-T1
      watch(tracks, () => scheduleSave('軌道'), { deep: true });               // v8.39 GAP-F1
      watch(meters, () => scheduleSave('收集條'), { deep: true });             // 架構檢閱 #21
      watch(reelWeights,  () => scheduleSave('Reel 權重'), { deep: true });
      watch(gridWeights,  () => scheduleSave('格數權重'), { deep: true });
      watch(comboWeights, () => scheduleSave('連爆權重'), { deep: true });
      watch(discards,     () => scheduleSave('棄牌規則'), { deep: true });
      watch(rules,        () => scheduleSave('腳本規則'), { deep: true });
      watch(betConfig,    () => scheduleSave('投注結構'), { deep: true });
      watch(gamble,       () => scheduleSave('比倍'),     { deep: true });   // v8.6 R5
      watch(jackpotCfg,   () => scheduleSave('獎池級距'), { deep: true });   // v8.25 G4
      watch(reelStrips,   () => scheduleSave('真實輪帶'), { deep: true });
      watch(multipliers,  () => scheduleSave('倍數系統'), { deep: true });
      watch(coinValues,   () => scheduleSave('金幣面額'), { deep: true });
      watch(jackpots,     () => scheduleSave('JP 定義'), { deep: true });

      // ──────────────────────────────────────────────────────────
      //  #2 跨 tab 健康度檢查(validateConfig)
      //  [效能] 原為 computed:被 header 徽章(validationSummary)與左側
      //  分頁徽章(issuesByTab)常駐讀取,故任一 store/symbolNames 結構變動
      //  都會同步重跑這 ~225 行。改為「純函式 _computeValidationIssues()
      //  + 結果 ref」:只在自動儲存 flush 那一拍(同 changesVersion)與
      //  symbolNames 變動時重算,不再卡在每次編輯的熱路徑(徽章 ~400ms lag)。
      //  純函式在 setTimeout/手動呼叫情境下執行,無 reactive 追蹤 → 真正解耦。
      // ──────────────────────────────────────────────────────────
      function _enabledSymbolIds() {
        try {
          const reg = registry && registry.symbols ? registry.symbols() : [];
          return reg.filter(x => x.enabled !== false).map(x => (x.symbol_id && x.symbol_id.trim()) || x.name).filter(Boolean);
        } catch (e) { return []; }
      }
      // ── #3 規則座標靜態 lint(純描述檢查;不執行、不接引擎)──
      //   盤面 action 的 pos/positions 座標為 0-based [reel,row](catalog placeholder [0,1]);
      //   layout 的 reel_id 為 1-based → pos reel 0 = reel_id 1。
      //   洞格語義複刻 schemas.ReelLayout.active_local_rows(前端版,cells=null→全實心)。
      function _reelActiveRows(reel) {
        const n = Math.max(0, Number(reel.max_rows) || 0);
        if (!Array.isArray(reel.cells) || reel.cells.length === 0) {
          const all = []; for (let i = 0; i < n; i++) all.push(i); return all;
        }
        const seen = new Set(), out = [];
        for (const s of reel.cells) {
          const m = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(String(s));
          if (!m) continue;
          const dx = +m[1], dy = +m[2];
          if (dx !== 0) continue;               // 主輪 mask dx 恆 0
          if (dy >= 0 && dy < n && !seen.has(dy)) { seen.add(dy); out.push(dy); }
        }
        out.sort((a, b) => a - b); return out;
      }
      // 回傳 null(合法) / '格式' / '越界' / '落洞';coord = [reel0, row0](0-based)
      function _coordIssue(coord) {
        // v8.9.1 bug 修復:UI 的 pos 欄(text input)存的是「字串」(如 '[0,1]'),
        //   v7.15 此函式只認陣列 → 實際透過 UI 填的座標一律被誤報「格式非法」。
        //   修法:字串先 JSON.parse(並容忍 '0,1' 無括號寫法);已是陣列直通。
        if (typeof coord === 'string') {
          const s = coord.trim();
          try { coord = JSON.parse(s.startsWith('[') ? s : '[' + s + ']'); } catch (e) { return '格式'; }
        }
        if (!Array.isArray(coord) || coord.length < 2) return '格式';
        const reel0 = Number(coord[0]), row0 = Number(coord[1]);
        if (!Number.isInteger(reel0) || !Number.isInteger(row0)) return '格式';
        const reel = layout.find(r => r.reel_id === reel0 + 1);   // 0-based → reel_id
        if (!reel) return '越界';
        const active = _reelActiveRows(reel);                     // 局部 row(0-based, 相對 y_offset)
        // pos 的 row 為「盤面 row」;主輪起點 = y_offset,活格 = y_offset + active[i]
        const yoff = Number(reel.y_offset) || 0;
        const localRow = row0 - yoff;
        if (localRow < 0 || localRow >= (Number(reel.max_rows) || 0)) return '越界';
        return active.includes(localRow) ? null : '落洞';
      }
      // 解析 positions 自由字串 '[[reel,row],...]' → coord 陣列(失敗回 null)
      function _parsePositions(raw) {
        if (raw == null || raw === '') return null;
        try {
          const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (Array.isArray(v) && v.every(c => Array.isArray(c) && c.length >= 2)) return v;
          return null;
        } catch (e) { return null; }
      }
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

        // ─── v8.3 / R1 D-12:符號出現模式宣告引用不存在的模式 → warn ───
        try {
          const regSyms = (registry && registry.symbols) ? registry.symbols() : [];
          for (const s of regSyms) {
            if (s.enabled === false) continue;
            const msc = String(s.mode_scope || '').trim();
            if (!msc) continue;
            msc.split(',').map(x => x.trim()).filter(Boolean).forEach(mn => {
              if (!validModeSet.has(mn)) {
                add('warn', 'symbols', `符號「${s.symbol_id || s.name}」的出現模式「${mn}」不存在於模式清單`);
              }
            });
          }
        } catch (e) { /* registry 未就緒時靜默略過 */ }

        // ─── P0-2 / D3:最少連線(min_match)與賠付下限一致性(僅連線型 LINE/WAYS)───
        //   達 min_match 才成立;若賠付表最低 count < min_match,該賠付列在判定下不成立 → warn。
        try {
          const _pt = String((g && g.pay_type) || '').trim().toUpperCase();
          const _lineLike = _pt === 'LINE' || _pt === 'WAYS';   // §5.2 Stage D:WAYS 已涵蓋 Megaways
          if (_lineLike) {
            const regSyms2 = (registry && registry.symbols) ? registry.symbols() : [];
            for (const s of regSyms2) {
              if (s.enabled === false) continue;
              const mm = Math.max(1, Number(s.min_match) || 3);
              let lowest = Infinity;
              const rows = Array.isArray(s.pay_rows) ? s.pay_rows : [];
              for (const r of rows) {
                if (Number(r.pay) > 0) lowest = Math.min(lowest, Number(r.count) || Infinity);
              }
              if (!isFinite(lowest)) {
                [3, 4, 5, 6].forEach(n => { if (Number(s['pay_' + n + 'x']) > 0) lowest = Math.min(lowest, n); });
              }
              if (isFinite(lowest) && lowest < mm) {
                add('warn', 'symbols',
                  `符號「${s.symbol_id || s.name}」最低賠付為 ${lowest} 連,但最少連線設為 ${mm};${mm} 連以下的賠付列在判定下不成立`);
              }
            }
          }
        } catch (e) { /* registry 未就緒時靜默略過 */ }

        // ─── P0-3:符號家族(symbolGroups)一致性 ───
        //   ① Group_ID 重複 ② 家族 mode_scope 引用不存在模式 ③ 家族無成員(無符號 group_id 指向它)
        //   ④ 符號的 group_id 指向不存在的家族。皆 warn(告知不擋;tab=symbols)。
        try {
          const groups = Array.isArray(symbolGroups) ? symbolGroups : [];
          const regSyms3 = (registry && registry.symbols) ? registry.symbols() : [];
          const memberCount = {};
          const groupIdSet = new Set();
          for (const s of regSyms3) {
            const gid = String(s.group_id || '').trim();
            if (gid) memberCount[gid] = (memberCount[gid] || 0) + 1;
          }
          const seen = new Set();
          for (const g0 of groups) {
            const gid = String(g0.group_id || '').trim();
            if (!gid) { add('warn', 'symbols', '有符號家族未填 Group_ID'); continue; }
            groupIdSet.add(gid);
            if (seen.has(gid)) add('warn', 'symbols', `符號家族 ID「${gid}」重複`);
            seen.add(gid);
            const msc = String(g0.mode_scope || '').trim();
            if (msc && msc !== 'ALL') {
              msc.split(',').map(x => x.trim()).filter(Boolean).forEach(mn => {
                if (!validModeSet.has(mn)) add('warn', 'symbols', `符號家族「${g0.display_name || gid}」的出現模式「${mn}」不存在於模式清單`);
              });
            }
            if (!memberCount[gid]) add('warn', 'symbols', `符號家族「${g0.display_name || gid}」目前沒有任何成員符號(於符號卡「所屬家族」指定成員)`);
          }
          for (const s of regSyms3) {
            const gid = String(s.group_id || '').trim();
            if (gid && !groupIdSet.has(gid)) add('warn', 'symbols', `符號「${s.symbol_id || s.name}」的所屬家族「${gid}」未定義於符號家族清單`);
          }
        } catch (e) { /* 靜默 */ }

        // ─── v8.5 / R3:玩家擇一組 + Hold&Win respin 描述檢查 ───
        try {
          const _cgCount = {};
          for (const m of modes) {
            const cg = String(m.choice_group || '').trim();
            if (cg) _cgCount[cg] = (_cgCount[cg] || 0) + 1;
            const rr = String(m.respin_reset_on || '').trim().toUpperCase();
            if (rr && !['NEW_SYMBOL', 'ANY_WIN', 'NEVER'].includes(rr)) {
              add('warn', 'rules', `模式「${m.mode}」的 Respin 重置條件「${rr}」非合法值(NEW_SYMBOL/ANY_WIN/NEVER 或留空)`);
            }
            if (Number(m.respin_base) > 0 && !(m.respin_stop_cond || '').trim()) {
              add('warn', 'rules', `模式「${m.mode}」啟用 Hold&Win Respin 但未填停止條件(建議描述,如「盤面填滿」)`);
            }
          }
          Object.entries(_cgCount).forEach(([cg, n]) => {
            if (n < 2) add('warn', 'rules', `擇一組「${cg}」只有 1 個模式(玩家擇一需至少 2 個同組模式)`);
          });
          const _startM = modes.find(mm => (mm.mode || '').trim() === ((g && g.starting_mode) || '').trim());
          if (_startM && String(_startM.choice_group || '').trim()) {
            add('error', 'rules', `起始模式「${_startM.mode}」不可屬擇一組(開局模式不是被選出來的)`);
          }
        } catch (e) { /* 靜默 */ }

        // ─── v8.9 / R2b:空間關係條件檢查(adjacent_count / cluster_max)───
        try {
          const _symSet = new Set((registry ? registry.symbols() : []).map(s => (s.symbol_id && s.symbol_id.trim()) || s.name).filter(Boolean));
          for (const r of rules) {
            const rows = builderRowsMap[r.rule_id] || [];
            for (const row of rows) {
              if (row.category === 'adjacent_count') {
                const parts = String(row.subkey || '').split('.').map(s => s.trim()).filter(Boolean);
                if (parts.length !== 2) {
                  add('warn', 'rules', `規則「${r.rule_id}」的 adjacent_count 需要「符號A.符號B」兩段(目前:「${row.subkey || ''}」)`);
                } else {
                  parts.forEach(p => { if (_symSet.size && !_symSet.has(p)) add('warn', 'rules', `規則「${r.rule_id}」的 adjacent_count 引用不存在的符號「${p}」`); });
                }
              } else if (row.category === 'cluster_max') {
                const p = String(row.subkey || '').trim();
                if (!p) add('warn', 'rules', `規則「${r.rule_id}」的 cluster_max 未填符號`);
                else if (_symSet.size && !_symSet.has(p)) add('warn', 'rules', `規則「${r.rule_id}」的 cluster_max 引用不存在的符號「${p}」`);
              }
            }
          }
        } catch (e) { /* 靜默 */ }

        // ═══ v8.49 / 項目二 Batch B:規則衝突/防呆 lint(純靜態;全 warn/info 不阻擋)═══
        //   合併「活性/可消失性(項目一 v3 §五交接)」+「產量 vs 容量 C1」。
        //   純描述層:只讀 r.condition 字串與 r.actions[].params 做 regex/數值比對,
        //   絕不呼叫 logic_parser、絕不物化盤面(守越界)。C2~C4 走投影骨架日後接。
        try {
          const _bbSyms = new Set((registry ? registry.symbols() : [])
            .map(s => (s.symbol_id && s.symbol_id.trim()) || s.name).filter(Boolean));
          // mode_scope csv → Set(空/ALL = null 代表全模式)
          const _bbModes = (ms) => {
            const s = String(ms == null ? '' : ms).trim();
            if (!s || s.toUpperCase() === 'ALL') return null;
            return new Set(s.split(',').map(x => x.trim()).filter(Boolean));
          };
          // 兩 mode_scope 是否相交(任一為 null=全模式 → 視為相交)
          const _bbModesOverlap = (a, b) => {
            if (a === null || b === null) return true;
            for (const x of a) if (b.has(x)) return true;
            return false;
          };
          // 動作值 → 數字下界(字面數 / 範圍 "a-b" 取 a;動態/公式/空 → null 代表無界)
          const _bbLowerBound = (v) => {
            if (v == null || v === '') return null;
            if (typeof v === 'number') return Number.isFinite(v) ? v : null;
            const s = String(v).trim();
            let m = s.match(/^(\d+)$/);           if (m) return parseInt(m[1], 10);
            m = s.match(/^"?(\d+)\s*-\s*(\d+)"?$/); if (m) return parseInt(m[1], 10);   // 範圍取下界
            return null;   // 公式/其他 → 無法取界
          };
          // 字面位置字串 → coord 陣列(SELF 家族 / 非字面 → null,不誤判)
          const _bbLiteralPositions = (raw) => {
            const s = String(raw == null ? '' : raw).trim();
            if (!s || /^SELF/i.test(s)) return null;   // SELF 動態參照不檢
            return _parsePositions(s);   // 既有:失敗回 null
          };
          // 座標(0-based reel,row 依 pos 慣例)是否落洞/越界 → true=不合法
          const _bbPosBad = (coord) => {
            if (!Array.isArray(coord) || coord.length < 2) return false;   // 格式怪 → 不誤判
            const reel0 = Number(coord[0]), row0 = Number(coord[1]);
            if (!Number.isInteger(reel0) || !Number.isInteger(row0)) return false;
            const reel = layout.find(r => r.reel_id === reel0 + 1);
            if (!reel) return true;   // 該輪不存在 = 越界
            const yoff = Number(reel.y_offset) || 0;
            const localRow = row0 - yoff;
            if (localRow < 0 || localRow >= (Number(reel.max_rows) || 0)) return true;
            return !_reelActiveRows(reel).includes(localRow);   // 遮罩外 = 洞
          };
          // SPAWN cell "r,c"(1-based) → {col,row} 字面;非字面 → null
          const _bbSpawnCell = (v) => {
            const m = String(v == null ? '' : v).trim().match(/^(\d+)\s*,\s*(\d+)$/);
            return m ? { row: parseInt(m[1], 10), col: parseInt(m[2], 10) } : null;
          };

          // ── 建規則投影(C2~C4 共用骨架)──
          const _proj = [];
          for (const r of rules) {
            if (r && r.enabled === false) continue;
            const acts = Array.isArray(r.actions) ? r.actions.filter(a => a && a.atype) : [];
            const cond = String(r.condition || '');
            const modes = _bbModes(r.mode_scope);
            const produces = [], removes = [], moves = [], spawns = [], limits = [], stickies = [];
            // 條件字串擷取:每盤上限 symbol_count.S <= N / < N(結構化,決策 2)
            let cm; const _limRe = /symbol_count\.([A-Za-z0-9_]+)\s*(<=|<)\s*(\d+)/g;
            while ((cm = _limRe.exec(cond)) !== null) {
              const cap = cm[2] === '<' ? (parseInt(cm[3], 10) - 1) : parseInt(cm[3], 10);
              limits.push({ sym: cm[1], cap });
            }
            for (const a of acts) {
              const p = a.params || {};
              if (a.atype === 'SPAWN' && p.target) {
                spawns.push({ sym: String(p.target).trim(), cell: _bbSpawnCell(p.cell) });
                produces.push({ sym: String(p.target).trim(), lb: 1, src: 'SPAWN', rid: r.rule_id });
              } else if (a.atype === 'BOARD_FILL' && p.symbol_id && !/^(RANDOM)$/i.test(String(p.symbol_id))) {
                const lb = _bbLowerBound(p.count);
                if (lb != null) produces.push({ sym: String(p.symbol_id).trim(), lb, src: 'BOARD_FILL', rid: r.rule_id });
              } else if (a.atype === 'SPLIT' && p.symbol) {
                const lb = _bbLowerBound(p.into);
                if (lb != null && lb > 1) produces.push({ sym: String(p.symbol).trim(), lb: lb - 1, src: 'SPLIT', rid: r.rule_id });
              } else if (a.atype === 'WALK' && p.trail) {
                produces.push({ sym: String(p.trail).trim(), lb: 1, src: 'WALK.trail', rid: r.rule_id });
              }
              if (a.atype === 'BOARD_DESTROY') {
                const sid = p.symbol_id ? String(p.symbol_id).trim() : '';
                removes.push({ sym: sid, positions: p.positions ? String(p.positions).trim() : '', cond, rid: r.rule_id });
              }
              if (a.atype === 'MOVE' && p.subject) {
                moves.push({ sym: String(p.subject).trim(), manner: String(p.manner || 'TO'),
                             dir: String(p.dir || '').toUpperCase(), amount: _bbLowerBound(p.amount) });
              }
              // 有界黏著(CV-1 認離場):STICKY until=FEATURE 或 SPINS 具有限 duration
              if (a.atype === 'STICKY') {
                const until = String(p.until || 'SPINS').toUpperCase();
                const dur = _bbLowerBound(p.duration);
                const bounded = (until === 'FEATURE') || (until === 'SPINS' && dur != null && dur > 0);
                if (p.symbol) removes.push({ sym: String(p.symbol).trim(), sticky: true, bounded, rid: r.rule_id });
                if (p.symbol) stickies.push({ sym: String(p.symbol).trim(), until, rid: r.rule_id });   // v8.50 C3
              }
              // CD-2:字面目標位置落洞/越界(MOVE/SPAWN/BOARD_FILL/BOARD_DESTROY)
              if (a.atype === 'SPAWN' && p.cell) {
                const c = _bbSpawnCell(p.cell);
                if (c) { const coord = [c.col - 1, c.row - 1]; if (_bbPosBad(coord)) add('warn', 'rules', `規則「${r.rule_id}」SPAWN 的初始格 (${c.row},${c.col}) 落在洞格或越界`); }
              }
              for (const k of ['positions', 'to', 'from']) {
                const lit = _bbLiteralPositions(p[k]);
                if (Array.isArray(lit)) for (const coord of lit) {
                  if (_bbPosBad(coord)) { add('warn', 'rules', `規則「${r.rule_id}」${a.atype} 的位置 [${coord.join(',')}] 落在洞格或越界`); break; }
                }
              }
            }
            _proj.push({ rid: r.rule_id, modes, trigger: r.trigger, cond, produces, removes, moves, spawns, limits, stickies, desc: String(r.description || '') });
          }

          // ── CV-1 / CV-2 / CV-3:每個 SPAWN 物件的活性 ──
          for (const pr of _proj) {
            for (const sp of pr.spawns) {
              const X = sp.sym; if (!X) continue;
              // 收集全規則對 X 的離場/移動/使用
              let hasBoundedExit = false, hasPositionalExitOnly = false, usedAnywhere = false;
              const posExitTargets = [];   // {axis:'col'|'row', val:N}
              const xMoves = [];
              for (const q of _proj) {
                // 離場:BOARD_DESTROY 命中 X(symbol_id==X 或 positions=SELF*)
                for (const rm of q.removes) {
                  if (rm.sticky) { if (rm.sym === X && rm.bounded) hasBoundedExit = true; continue; }
                  const hitBySym = rm.sym === X;
                  const hitBySelf = /^SELF/i.test(rm.positions || '');
                  if (hitBySym || hitBySelf) {
                    // 位置謂詞閘門?條件含 object_pos.X.(col|row) == N
                    const pe = (rm.cond || '').match(new RegExp('object_pos\\.' + X + '\\.(col|row)\\s*==\\s*(\\d+)'));
                    if (pe) { posExitTargets.push({ axis: pe[1], val: parseInt(pe[2], 10) }); hasPositionalExitOnly = true; }
                    else hasBoundedExit = true;   // 非位置閘(如 ON_DEAD_SPIN/無條件)→ 視為可達離場
                  }
                }
                // 使用:MOVE subject=X / 條件含 object_pos.X / BOARD_* 針對 X
                if (q.moves.some(m => m.sym === X)) { usedAnywhere = true; xMoves.push(...q.moves.filter(m => m.sym === X)); }
                if (new RegExp('object_pos\\.' + X + '\\b').test(q.cond)) usedAnywhere = true;
                if (q.produces.some(p => p.sym === X) && q.rid !== pr.rid) usedAnywhere = true;
                if (q.removes.some(rm => rm.sym === X)) usedAnywhere = true;
              }
              // CV-1:完全無可達離場
              if (!hasBoundedExit && !hasPositionalExitOnly) {
                add('warn', 'rules', `規則「${pr.rid}」SPAWN 的物件「${X}」無任何可達離場(無銷毀規則、無有界黏著)——可能永遠停留盤面;請加銷毀規則或有界 STICKY`);
              } else if (!hasBoundedExit && hasPositionalExitOnly) {
                // CV-2:僅靠位置閘離場 → 查移動方向可達性(保守:任何不確定即跳過)
                const start = sp.cell;
                const singleMove = xMoves.length === 1 && xMoves[0].manner === 'DIR' ? xMoves[0] : null;
                if (start && singleMove && singleMove.amount != null && singleMove.amount > 0 && singleMove.dir) {
                  for (const t of posExitTargets) {
                    const cur = t.axis === 'col' ? start.col : start.row;
                    let unreachable = false;
                    if (t.axis === 'col' && singleMove.dir === 'RIGHT' && t.val < cur) unreachable = true;
                    if (t.axis === 'col' && singleMove.dir === 'LEFT'  && t.val > cur) unreachable = true;
                    if (t.axis === 'row' && singleMove.dir === 'DOWN'  && t.val < cur) unreachable = true;
                    if (t.axis === 'row' && singleMove.dir === 'UP'    && t.val > cur) unreachable = true;
                    if (unreachable) {
                      add('warn', 'rules', `規則「${pr.rid}」物件「${X}」的消失條件 object_pos.${X}.${t.axis}==${t.val} 在移動方向 ${singleMove.dir}(起始 ${t.axis}=${cur})下永遠不可達——物件可能永遠不消失`);
                      break;
                    }
                  }
                }
              }
              // CV-3:生成後無作用(info)
              if (!usedAnywhere) {
                add('info', 'rules', `規則「${pr.rid}」SPAWN 的物件「${X}」生成後未被任何規則使用(無移動、無位置條件、無針對它的動作)`);
              }
            }
          }

          // ── CD-1:產量 vs 容量(mode_scope 過濾;僅結構化上限)──
          for (let i = 0; i < _proj.length; i++) {
            for (const prod of _proj[i].produces) {
              for (let j = 0; j < _proj.length; j++) {
                for (const lim of _proj[j].limits) {
                  if (prod.sym !== lim.sym) continue;
                  if (!_bbModesOverlap(_proj[i].modes, _proj[j].modes)) continue;   // 決策 4
                  if (prod.lb > lim.cap) {
                    add('warn', 'rules', `規則「${prod.rid}」的「${prod.sym}」產量下界 ${prod.lb}(${prod.src})超過規則「${lim.rid}」設定的每盤上限 ${lim.cap}(symbol_count.${lim.sym} <= ${lim.cap});請調整上限或產量,或於備註說明取捨`);
                  }
                }
              }
            }
          }

          // ── CD-3:有產量但上限似乎僅在備註(info)──
          try {
            const _prodSyms = new Set(); _proj.forEach(p => p.produces.forEach(x => _prodSyms.add(x.sym)));
            const _limSyms = new Set(); _proj.forEach(p => p.limits.forEach(x => _limSyms.add(x.sym)));
            const _hintRe = /(上限|最多|最大|只(能|會)出現|唯一|max\b|only\b|at most)/i;
            for (const pr of _proj) {
              const noteHit = _hintRe.test(pr.desc);
              if (!noteHit) continue;
              for (const prod of pr.produces) {
                if (!_limSyms.has(prod.sym)) {
                  add('info', 'rules', `規則「${pr.rid}」備註提到上限但找不到結構化限制;「${prod.sym}」若需自動防呆,請改用條件 symbol_count.${prod.sym} <= N`);
                  break;
                }
              }
            }
          } catch (e) { /* 靜默 */ }

          // ═══ v8.50 / 項目二 Batch B2:C2~C4(接同一投影骨架,純靜態、全 warn/info 不擋)═══
          // 符號參照哨兵/家族豁免(非未定義符):RANDOM/BEST/NON_WIN/SELF*/group:*
          const _bbSentinel = (v) => {
            const s = String(v == null ? '' : v).trim();
            return !s || /^(RANDOM|BEST|NON_WIN)$/i.test(s) || /^SELF/i.test(s)
                 || /^group(_any)?:/i.test(s) || /^-?\d/.test(s);
          };

          // ── C2:生成 vs 銷毀同符(同 trigger、mode_scope 相交)──
          //   僅認「整符銷毀」(symbol_id==S 且無 positions);有位置=定向移除,視為刻意,不報。
          try {
            for (let i = 0; i < _proj.length; i++) {
              for (const prod of _proj[i].produces) {
                for (let j = 0; j < _proj.length; j++) {
                  if (i === j) continue;
                  if (_proj[i].trigger !== _proj[j].trigger) continue;            // 同時機才算抵消
                  if (!_bbModesOverlap(_proj[i].modes, _proj[j].modes)) continue; // 決策 4
                  for (const rm of _proj[j].removes) {
                    if (rm.sticky) continue;
                    if (rm.sym === prod.sym && !(rm.positions && rm.positions.length)) {
                      add('warn', 'rules', `規則「${prod.rid}」在 ${_proj[i].trigger} 生成「${prod.sym}」(${prod.src}),而規則「${rm.rid}」在同一時機整符銷毀「${prod.sym}」——兩者可能互相抵消;若刻意請於備註說明或改用定向位置`);
                    }
                  }
                }
              }
            }
          } catch (e) { /* 靜默 */ }

          // ── C3:同符黏著存續範圍矛盾(SPINS vs FEATURE;mode_scope 相交)──
          try {
            const _byStickySym = {};
            for (const pr of _proj) for (const st of pr.stickies) {
              (_byStickySym[st.sym] = _byStickySym[st.sym] || []).push({ ...st, modes: pr.modes });
            }
            for (const sym of Object.keys(_byStickySym)) {
              const arr = _byStickySym[sym];
              for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
                if (arr[i].until === arr[j].until) continue;
                if (!_bbModesOverlap(arr[i].modes, arr[j].modes)) continue;   // 決策 4
                add('warn', 'rules', `規則「${arr[i].rid}」與「${arr[j].rid}」對「${sym}」宣告的黏著存續範圍不一致(${arr[i].until} vs ${arr[j].until})——同一符號在相交模式下續存語意衝突;請統一`);
              }
            }
          } catch (e) { /* 靜默 */ }

          // ── C4:目標域空集 — 動作引用未定義的符號(逐 atype 的符號欄)──
          try {
            const _symKeys = {
              BOARD_TRANSFORM: ['from_symbol', 'to_symbol'], SYMBOL_SWAP: ['from_symbol', 'to_symbol'],
              BOARD_FILL: ['symbol_id'], BOARD_DESTROY: ['symbol_id'],
              SPAWN: ['target'], MOVE: ['subject'],
              STICKY: ['symbol'], WALK: ['symbol', 'trail'], NUDGE: ['symbol'],
              EXPAND_REEL: ['symbol'], SPLIT: ['symbol'], DESTROY_ADJACENT: ['symbol'], REVEAL_AS: ['symbol'],
            };
            for (const r of rules) {
              if (r && r.enabled === false) continue;
              const acts = Array.isArray(r.actions) ? r.actions.filter(a => a && a.atype) : [];
              const seen = new Set();
              for (const a of acts) {
                const keys = _symKeys[a.atype]; if (!keys) continue;
                const p = a.params || {};
                for (const k of keys) {
                  const v = p[k]; if (_bbSentinel(v)) continue;
                  const sid = String(v).trim();
                  if (_bbSyms.size && !_bbSyms.has(sid) && !seen.has(a.atype + ':' + sid)) {
                    seen.add(a.atype + ':' + sid);
                    add('warn', 'rules', `規則「${r.rule_id}」的 ${a.atype}.${k} 引用未定義的符號「${sid}」(不在符號清單)——目標恆為空集`);
                  }
                }
              }
            }
          } catch (e) { /* 靜默 */ }
        } catch (e) { /* 靜默 */ }

        // ─── v8.8 / R4 B-6:格子屬性檢查 ───
        try {
          const _caIds = {};
          for (const ca of cellAttrs) {
            const aid = String(ca.attr_id || '').trim();
            if (!aid) { add('warn', 'layout', '有格子屬性未填 Attr_ID'); continue; }
            if (_caIds[aid]) add('warn', 'layout', `格子屬性 ID「${aid}」重複`);
            _caIds[aid] = true;
            const rlById = layout.find(r => r.reel_id === Number(ca.reel));
            if (!rlById) { add('error', 'layout', `格子屬性「${aid}」的 R${ca.reel} 不存在`); continue; }
            const rowN = Number(ca.row) || 0;
            if (rowN < 1 || rowN > rlById.max_rows) {
              add('error', 'layout', `格子屬性「${aid}」的列 ${ca.row} 超出 R${ca.reel} 範圍(1–${rlById.max_rows})`);
            } else if (!_reelActiveRows(rlById).includes(rowN - 1)) {
              add('error', 'layout', `格子屬性「${aid}」的 (${ca.reel},${ca.row}) 落在洞格(遮罩外)`);
            }
            if (!['MULT', 'ENHANCER', 'FRAME', 'GOLD', 'CUSTOM'].includes(String(ca.attr || '').toUpperCase())) {
              add('warn', 'layout', `格子屬性「${aid}」的型式「${ca.attr}」非合法值`);
            }
            if (String(ca.attr).toUpperCase() === 'MULT' && !(ca.value || '').trim()) {
              add('warn', 'layout', `格子屬性「${aid}」為固定格乘數但未填倍數值`);
            }
          }
        } catch (e) { /* 靜默 */ }

        // ─── v8.7 / R6 A-2:per-mode 賠付覆寫檢查 ───
        try {
          for (const m of modes) {
            const pto = String(m.pay_type_override || '').trim().toUpperCase();
            if (pto && !['LINE', 'WAYS', 'SCATTER', 'CLUSTER'].includes(pto)) {
              add('warn', 'rules', `模式「${m.mode}」的賠付覆寫「${pto}」非合法值(LINE/WAYS/SCATTER/CLUSTER 或留空=繼承)`);
            }
            if (pto === 'LINE' && String(g.pay_type).toUpperCase() !== 'LINE' && !(paylines || []).length) {
              add('warn', 'rules', `模式「${m.mode}」覆寫為 LINE 賠付,但 06_Paylines 尚無任何中獎線`);
            }
          }
        } catch (e) { /* 靜默 */ }

        // ─── v8.6 / R5:商業層檢查(比倍 / RTP 版本 / 購買檔位)───
        try {
          if (gamble.enabled) {
            if (!['CARD_COLOR', 'CARD_SUIT', 'LADDER', 'WHEEL', 'CUSTOM'].includes(gamble.gamble_type)) {
              add('warn', 'gamble', `比倍型式「${gamble.gamble_type}」非合法值`);
            }
            if ((gamble.gamble_type === 'LADDER' || gamble.gamble_type === 'CUSTOM') && !(gamble.type_desc || '').trim()) {
              add('warn', 'gamble', '比倍型式為階梯/自訂,建議在「型式補充」描述規則');
            }
            if (gamble.applies_to === 'BELOW_LIMIT' && !(Number(gamble.applies_limit) > 0)) {
              add('warn', 'gamble', '比倍適用範圍為「低於門檻」但未填門檻值');
            }
            if (Number(gamble.cap_mult) < 0 || Number(gamble.max_rounds) < 0) {
              add('error', 'gamble', '比倍封頂 / 最大次數不可為負值');
            }
          }
          const _rvNames = {};
          (betConfig.rtp_variants || []).forEach(rv => {
            const nm = (rv.variant || '').trim();
            if (!nm) return;
            if (_rvNames[nm]) add('warn', 'bet_config', `RTP 版本「${nm}」重複`);
            _rvNames[nm] = true;
            const rtp = Number(rv.target_rtp) || 0;
            if (rtp && (rtp < 50 || rtp > 120)) add('warn', 'bet_config', `RTP 版本「${nm}」目標 ${rtp}% 超出常理範圍(50–120)`);
          });
          if (betConfig.ante_buy_exclusive && betConfig.ante_bet_enabled && betConfig.buy_feature_enabled) {
            add('warn', 'bet_config', '已宣告加押/購買互斥:兩者同時啟用時,實際遊戲須擇一(規格描述,請於說明欄補充切換行為)');
          }
        } catch (e) { /* 靜默 */ }

        // ─── 01_Global · 投注結構(v5.3)───
        for (const bf of betConfig.buy_features) {
          if (!bf.target_mode) {
            add('warn', 'bet_config', `Buy Feature「${bf.bf_id}」未指定目標模式`);
            continue;
          }
          if (!validModeSet.has(bf.target_mode)) {
            add('error', 'bet_config', `Buy Feature「${bf.bf_id}」目標模式「${bf.target_mode}」不在模式清單`);
          }
          if (!(Number(bf.cost_mult) > 0)) add('warn', 'bet_config', `Buy Feature「${bf.bf_id}」成本倍數為 0`);
          const rt = Number(bf.rtp_target);
          if (rt > 0 && (rt < 50 || rt > 102)) add('warn', 'bet_config', `Buy Feature「${bf.bf_id}」RTP 目標 ${rt}% 異常（通常 50–102）`);
        }
        if (betConfig.ante_bet_enabled) {
          const m = Number(betConfig.ante_bet_mult);
          if (m <= 1 || m > 3) add('warn', 'bet_config', `Ante Bet 成本倍數 ${m}× 異常（通常 1.1–2.0×）`);
          const tm = Number(betConfig.ante_bet_trigger_mult);
          if (tm <= 1 || tm > 10) add('warn', 'bet_config', `Ante Bet 觸發倍率 ${tm}× 異常（通常 1.5–3×）`);
        }

        // ─── v8.0:mode 玩法種類(bonus 小遊戲)驗證(取代舊 17_Bonus_Games 驗證)───
        for (const g of modes) {
          const kind = (g.mode_kind || 'SPIN').toUpperCase();
          if (kind === 'SPIN') continue;
          const id = (g.mode || '').trim() || '(未命名模式)';
          const items = Array.isArray(g.items) ? g.items : [];
          if (items.length === 0) add('warn', 'rules', `模式 ${id}（${kind}）尚無獎項`);
          if (kind === 'WHEEL' || kind === 'PICK') {
            const tot = items.reduce((a, it) => a + (Number(it.weight) || 0), 0);
            if (items.length && tot <= 0) add('error', 'rules', `模式 ${id} 獎項權重總和為 0`);
            if (kind === 'PICK' && items.length && !items.some(it => it.is_end) && !(Number(g.pick_count) > 0))
              add('warn', 'rules', `模式 ${id}（PICK）未設結束項也未設抽選次數,可能無法結束`);
          }
          if (kind === 'COLLECTION' && !(Number(g.collect_target) > 0))
            add('warn', 'rules', `模式 ${id}（COLLECTION）未設收集目標`);
          if (kind === 'WHEEL' && g.wheel_upgrade_to) {
            const tgt = modes.find(x => x.mode === g.wheel_upgrade_to);
            if (!tgt) add('error', 'rules', `模式 ${id} 升級目標「${g.wheel_upgrade_to}」不存在`);
            else if ((tgt.mode_kind || 'SPIN').toUpperCase() !== 'WHEEL')
              add('error', 'rules', `模式 ${id} 升級目標「${g.wheel_upgrade_to}」不是 WHEEL 玩法`);
          }
          const seenJp = new Set();
          for (const it of items) {
            if (it.link_jackpot && !jackpots.find(j => j.jp_id === it.link_jackpot))
              add('error', 'rules', `模式 ${id} 獎項連結的 JP「${it.link_jackpot}」不存在`);
            if (it.link_jackpot) {
              if (seenJp.has(it.link_jackpot))
                add('warn', 'rules', `模式 ${id} 重複連結同一個 JP「${it.link_jackpot}」`);
              seenJp.add(it.link_jackpot);
            }
          }
        }

        // ─── 04b_Reel_Strips（v6.0-b）───
        if (reelStrips.enabled) {
          const symIdSet = new Set(_enabledSymbolIds());
          let anyStrip = false;
          for (const m of modeNames.value) {
            const ms = reelStrips.strips[m] || {};
            for (const r of layout) {
              const arr = ms[r.reel_id];
              if (!arr || !arr.length) continue;
              anyStrip = true;
              if (arr.length < r.max_rows)
                add('error', 'reel_strips', `模式 ${m} R${r.reel_id} 輪帶長度 ${arr.length} < 顯示列數 ${r.max_rows}`);
              for (const sid of arr) {
                if (!symIdSet.has(sid)) { add('error', 'reel_strips', `模式 ${m} R${r.reel_id} 輪帶含未知符號「${sid}」`); break; }
              }
            }
          }
          if (!anyStrip) add('warn', 'reel_strips', '真實輪帶已啟用,但尚未定義任何輪帶（引擎將回退權重抽樣）');
        }

        // ─── 15_Multipliers(v5.4)───
        if (multipliers.wild_mult_enabled && multipliers.wild_mult_values.length) {
          const tot = multipliers.wild_mult_values.reduce((a, v) => a + (Number(v.weight) || 0), 0);
          if (tot <= 0) add('warn', 'multipliers', 'Wild 倍數權重表總和為 0,將不會抽到任何倍數');
          for (const v of multipliers.wild_mult_values)
            if (!(Number(v.mult) > 0)) add('warn', 'multipliers', 'Wild 倍數表存在倍數 ≤ 0 的列');
        }
        if (multipliers.random_enabled) {
          const tot = multipliers.random_values.reduce((a, v) => a + (Number(v.weight) || 0), 0);
          if (tot <= 0) add('error', 'multipliers', '隨機倍數已啟用,但權重表總和為 0');
          if (multipliers.random_symbol_id) {
            const ids = new Set(_enabledSymbolIds());
            if (!ids.has(multipliers.random_symbol_id))
              add('error', 'multipliers', `隨機倍數符號「${multipliers.random_symbol_id}」不存在於符號清單`);
          }
        }
        if (multipliers.progress_enabled) {
          for (const m of modeNames.value) {
            const arr = multipliers.progress_ladders[m];
            if (arr && arr.length) {
              for (let i = 1; i < arr.length; i++)
                if (arr[i] < arr[i - 1]) { add('warn', 'multipliers', `模式 ${m} 的進度倍數階梯非遞增`); break; }
            }
          }
        }

        // ─── 16_Coin_Values(v5.4)───
        if (coinValues.enabled) {
          const ids = new Set(_enabledSymbolIds());
          if (!coinValues.coin_symbol_id)
            add('error', 'coin_values', '金幣面額已啟用,但未指定金幣符號');
          else if (!ids.has(coinValues.coin_symbol_id))
            add('error', 'coin_values', `金幣符號「${coinValues.coin_symbol_id}」不存在於符號清單`);
          if (coinValues.denominations.length === 0)
            add('warn', 'coin_values', '金幣面額已啟用,但尚未定義任何面額');
          for (const d of coinValues.denominations) {
            if (!(Number(d.value) > 0) && !d.link_jackpot)
              add('warn', 'coin_values', `面額「${d.label || '(未命名)'}」value ≤ 0 且未連結 JP`);
            if (d.link_jackpot && !jackpots.find(j => j.jp_id === d.link_jackpot))
              add('error', 'coin_values', `面額「${d.label || '(未命名)'}」連結的 JP「${d.link_jackpot}」不存在`);
          }
          // 每模式權重總和檢查
          for (const m of modeNames.value) {
            const tot = coinValues.denominations.reduce((a, d) => a + (Number(d.weight_by_mode[m]) || 0), 0);
            if (tot <= 0 && coinValues.denominations.length)
              add('warn', 'coin_values', `模式 ${m} 的金幣面額權重總和為 0`);
          }
        }

        // ─── 13_Jackpots · JP 定義(v6.2:獨立分頁)───
        const jpIdSeen = new Set();
        for (const j of jackpots) {
          const jid = (j.jp_id || '').trim();
          if (!jid && !(j.name || '').trim()) continue;   // 全空列不檢查
          if (jid) {
            if (jpIdSeen.has(jid)) add('error', 'jackpots', `JP_ID 重複:${jid}`);
            jpIdSeen.add(jid);
          } else {
            add('warn', 'jackpots', `JP「${j.name}」缺 JP_ID,匯出後外部程式難以引用`);
          }
          if (!(Number(j.mult) > 0)) add('warn', 'jackpots', `JP ${j.name || jid} 的${j.kind === 'PROGRESSIVE' ? '起始彩池' : '倍數'}為 0`);
          if (j.kind === 'PROGRESSIVE') {
            const inc = Number(j.increment_pct) || 0;
            if (inc <= 0) add('warn', 'jackpots', `累積 JP ${j.name || jid} 抽成 % 為 0,彩池不會成長`);
            if (inc > 100) add('error', 'jackpots', `累積 JP ${j.name || jid} 抽成 % 超過 100`);
            const mhb = Number(j.must_hit_by) || 0;
            if (mhb > 0 && mhb < Number(j.mult)) add('error', 'jackpots', `累積 JP ${j.name || jid} 必開上限(${mhb}x)小於起始彩池(${j.mult}x)`);
          }
          if (j.mode_scope && j.mode_scope !== 'ALL') {
            for (const mn of j.mode_scope.split(',').map(x => x.trim()).filter(Boolean)) {
              if (!validModeSet.has(mn)) add('error', 'jackpots', `JP ${j.name || jid} 的適用模式「${mn}」不在模式清單`);
            }
          }
        }

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
          // v5.2:副盤符號集引用檢查(對齊 py a_loader 的 ConfigValidationError)
          if (r.has_subreel && r.subreel_symbol_set) {
            const mem = symbolSets[r.subreel_symbol_set];
            if (!Array.isArray(mem) || mem.length === 0) {
              add('error', 'layout', `R${r.reel_id} 副盤引用的符號集「${r.subreel_symbol_set}」未定義或為空(外部模擬器會拒讀)`);
            }
          }
        }

        // ─── 02b 自由副盤 (Panel) v4.8 ───
        const panelIdSeen = new Set();
        for (const p of panels) {
          const pid = (p.panel_id || '').trim();
          if (!pid) {
            add('error', 'layout', '有自由副盤的 Panel ID 為空');
            continue;
          }
          if (panelIdSeen.has(pid)) add('error', 'layout', `Panel ID 重複:${pid}`);
          panelIdSeen.add(pid);
          if (/^\d+$/.test(pid)) {
            add('error', 'layout', `Panel ID「${pid}」為純數字`,
              '04 權重以「純數字=主輪」定址,純數字 Panel ID 會與主輪 Reel_ID 混淆。請加字母前綴。');
          }
          if (!(p.width >= 1) || !(p.height >= 1)) {
            add('error', 'layout', `副盤 ${pid} 的寬/高必須 >= 1`);
          }
          // 符號集引用存在且非空
          if (p.symbol_set && (!symbolSets[p.symbol_set] || symbolSets[p.symbol_set].length === 0)) {
            add('warn', 'layout', `副盤 ${pid} 引用的符號集「${p.symbol_set}」不存在或為空`,
              '引擎找不到可用符號時會跳過此副盤(整片空白)。');
          }
          // 權重來源三段皆無 → 模擬空白
          let hasPanelW = false;
          for (const mode of Object.keys(reelWeights)) {
            if (!validModeSet.has(mode)) continue;
            const pw = reelWeights[mode] && reelWeights[mode].panel_weights;
            if (!pw) continue;
            for (const k of Object.keys(pw)) {
              if (k.startsWith(pid + '-') && Number(pw[k]) > 0) { hasPanelW = true; break; }
            }
            if (hasPanelW) break;
          }
          if (!hasPanelW && !p.symbol_set && !p.inherit_weight) {
            add('warn', 'reel_weights', `副盤 ${pid} 沒有任何權重來源`,
              '04 無專屬權重、未指定符號集、未沿用保底 → 模擬時此副盤會整片空白。請在 04 的「副盤權重」列填權重,或回盤面結構改權重來源。');
          }
          if (p.join_payline) {
            add('warn', 'layout', `副盤 ${pid} 已開「參與主盤連線」`,
              '目前版本僅將其符號併入主盤統計;實際 payline 算線(P5)尚未實作。');
          }
        }
        // 獨立權重副輪:檢查 04 是否已有正權重
        for (const r of layout) {
          if (!r.has_subreel || r.subreel_inherit_weight) continue;
          let hasSubW = false;
          for (const mode of Object.keys(reelWeights)) {
            if (!validModeSet.has(mode)) continue;
            const sw = reelWeights[mode] && reelWeights[mode].sub_weights;
            if (!sw) continue;
            for (const k of Object.keys(sw)) {
              if (k.startsWith(r.reel_id + '-') && Number(sw[k]) > 0) { hasSubW = true; break; }
            }
            if (hasSubW) break;
          }
          if (!hasSubW) {
            add('warn', 'reel_weights', `R${r.reel_id} 的副輪設「獨立權重」但 04 尚無權重`,
              '請到 04_Reel_Weights 下方「副盤權重」區為「R' + r.reel_id + '·副」填權重,否則模擬時副輪格會空白。');
          }
        }

        // ─── 11_Mode_Config(現已合進 01_Global) ───
        if (validModeSet.size === 0) {
          add('error', 'rules', '尚未定義任何模式,04/05/08 權重表都無法使用');
        }
        for (const [nm, c] of Object.entries(modeCount)) {
          if (c > 1) add('error', 'rules', `模式名稱重複:${nm}(出現 ${c} 次)`);
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
          // v8.45 / 批次D 決策2:track_covered.<tid> 軌道存在性(CURRENT 哨兵豁免;
          //   與 panel lint 同級 warn。tracks 容器執行期存取,closure 安全同 renameMode 前例)
          if (r.condition) {
            const _tcRe = /\btrack_covered\.([A-Za-z0-9_]+)\b/g;
            let _tcm;
            while ((_tcm = _tcRe.exec(String(r.condition))) !== null) {
              const tid = _tcm[1];
              if (tid === 'CURRENT') continue;
              if (!(Array.isArray(tracks) ? tracks : []).some(t => t && String(t.track_id).trim() === tid)) {
                add('warn', 'rules', `${rid}:條件引用的軌道「${tid}」未在 02c_Tracks 定義`);
              }
            }
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
                const _sv = act.params[p.key];
                // v8.4 / R2 P3:哨兵值(RANDOM/BEST)——僅在該參數宣告 sentinels 時放行
                const _isSentinel = Array.isArray(p.sentinels) && p.sentinels.includes(_sv);
                if (!_isSentinel && !symbolNameSet.has(_sv)) {
                  add('warn', 'rules',
                    `${tag}:符號「${_sv}」未在 03_Symbols 定義`);
                }
              }
              // mode 引用檢查
              if (p.type === 'mode' && act.params && act.params[p.key]) {
                if (!validModeSet.has(act.params[p.key])) {
                  add('warn', 'rules',
                    `${tag}:模式「${act.params[p.key]}」不存在於 11_Mode_Config`);
                }
              }
              // v8.44 / C-2:panel 引用檢查(PANEL_SET panel= 等;與 symbol/mode lint 同級)
              if (p.type === 'panel' && act.params && act.params[p.key]) {
                const _pv = String(act.params[p.key]).trim();
                if (_pv && !panels.some(pp => pp && pp.panel_id === _pv)) {
                  add('warn', 'rules',
                    `${tag}:面板「${_pv}」未在 02b_Panels 定義`);
                }
              }
              // #3 pos 座標檢查(MOVE from/to、SWAP a/b)—— 純描述 lint,不執行
              if (p.type === 'pos' && act.params && act.params[p.key] != null && act.params[p.key] !== '') {
                if (layout.length === 0) {
                  add('warn', 'rules', `${tag}:座標「${p.label || p.key}」無法檢查(尚未定義盤面)`);
                } else {
                  const issue = _coordIssue(act.params[p.key]);
                  if (issue === '格式') add('error', 'rules', `${tag}:座標「${p.label || p.key}」格式非法(需 [reel,row],0-based)`);
                  else if (issue === '越界') add('error', 'rules', `${tag}:座標「${p.label || p.key}」${JSON.stringify(act.params[p.key])} 超出盤面範圍`);
                  else if (issue === '落洞') add('error', 'rules', `${tag}:座標「${p.label || p.key}」${JSON.stringify(act.params[p.key])} 落在洞格(結構性永遠空,搬移/填補會被略過)`);
                }
              }
            }
            // #3 positions 自由字串座標檢查(BOARD_FILL/DESTROY/STICKY 選填)
            const posRaw = (act.params || {}).positions;
            if (posRaw != null && posRaw !== '' && layout.length > 0) {
              const coords = _parsePositions(posRaw);
              if (coords === null) {
                add('warn', 'rules', `${tag}:位置清單格式無法解析(需 [[reel,row],...],0-based)`);
              } else {
                for (const c of coords) {
                  const issue = _coordIssue(c);
                  if (issue === '越界') add('error', 'rules', `${tag}:位置 ${JSON.stringify(c)} 超出盤面範圍`);
                  else if (issue === '落洞') add('error', 'rules', `${tag}:位置 ${JSON.stringify(c)} 落在洞格(填補/銷毀會被略過)`);
                  else if (issue === '格式') add('warn', 'rules', `${tag}:位置 ${JSON.stringify(c)} 座標格式非法`);
                }
              }
            }
            // G-PotA / D5:CROSS_BOARD 跨盤目標 lint(from_board/to_board 非空且非 MAIN
            //   → 須為 02b_Panels 已知 panel_id;非阻擋 warn,與 panel/mode lint 同級)。
            if (act.atype === 'CROSS_BOARD' && act.params) {
              for (const bk of ['from_board', 'to_board']) {
                const bv = String(act.params[bk] || '').trim();
                if (bv && bv.toUpperCase() !== 'MAIN' && !panels.some(pp => pp && pp.panel_id === bv)) {
                  add('warn', 'rules',
                    `${tag}:${bk === 'to_board' ? '目標盤' : '來源盤'}「${bv}」非 MAIN 且未在 02b_Panels 定義`);
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
        navTo(tabId);
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

      // ── #4 全案預檢:segmented 篩選(全部/錯誤/警告/提示)──
      //   另建 filtered 版本,不動上方 issuesByTab(它還餵 tab 上的問題徽章)。
      const pfFilter = ref('all');   // all | error | warn | info
      const pfCounts = computed(() => {
        const c = { all: 0, error: 0, warn: 0, info: 0 };
        for (const i of validationIssues.value) { c.all++; if (c[i.severity] != null) c[i.severity]++; }
        return c;
      });
      const pfIssuesByTab = computed(() => {
        const f = pfFilter.value;
        const groups = {};
        for (const i of validationIssues.value) {
          if (f !== 'all' && i.severity !== f) continue;
          (groups[i.tab] || (groups[i.tab] = [])).push(i);
        }
        const ordered = [];
        for (const t of TABS) if (groups[t.id]) ordered.push({ tab: t, issues: groups[t.id] });
        return ordered;
      });
      function setPfFilter(f) { pfFilter.value = f; }
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
        navTo(tabId);
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
          // v6.2:JP 已獨立成 jackpots 分頁,不再隨 global 重設
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· 賠付模型(pay_type、ways_direction、cluster_min_size)\n· 模式定義(目前 ${modes.length} 個模式:${modes.map(m => m.mode).filter(Boolean).join(', ') || '無'})\n· 各模式的 trigger_condition 拼圖暫存\n· 外部模擬器參數(已不在 UI,將一併回到預設值寫入匯出)\n\n所有欄位將回到預設值,此動作不可復原。`)) return;
          Object.assign(g, DEFAULT_GLOBAL);
          modes.splice(0, modes.length, ...DEFAULT_MODES.map(m => ({ ...m })));
          emit('status', { type: 'ok', msg: '已重設全域設定 + 模式定義為預設值' });
        } else if (id === 'jackpots') {
          // v6.2 #0:JP 分頁重設 — 清空所有 JP(預設 0 個)
          if (!confirm(`重設 ${tabLabel}?\n\n即將清除:\n· 目前 ${jackpots.length} 個 JP 定義\n\n回到 0 個 JP,此動作不可復原。`)) return;
          jackpots.splice(0, jackpots.length);
          jpGlobalType.value = 'CUSTOM';
          emit('status', { type: 'ok', msg: '已清空 JP 定義' });
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
          // v7.10:規則頁子分頁。模式子分頁 → 重設賠付模型 + 模式定義(原 global);
          //   盤面/通用子分頁 → 重設拼圖 + 棄牌規則。
          if (rulesSection.value === 'modes') {
            if (!confirm(`重設「模式」子分頁?\n\n即將清除:\n· 賠付模型(pay_type、ways_direction、cluster_min_size)\n· 模式定義(目前 ${modes.length} 個模式:${modes.map(m => m.mode).filter(Boolean).join(', ') || '無'})\n· 各模式的 trigger_condition 拼圖暫存\n· 外部模擬器參數(已不在 UI,將一併回到預設值寫入匯出)\n\n所有欄位將回到預設值,此動作不可復原。`)) return;
            Object.assign(g, DEFAULT_GLOBAL);
            modes.splice(0, modes.length, ...DEFAULT_MODES.map(m => ({ ...m })));
            emit('status', { type: 'ok', msg: '已重設賠付模型 + 模式定義為預設值' });
          } else if (rulesSection.value === 'discard') {
            if (!confirm(`重設「棄牌規則」子分頁?\n\n即將清除目前 ${discards.length} 條棄牌規則(含拼圖暫存),回到預設範本。此動作不可復原。`)) return;
            discards.splice(0, discards.length, ...DEFAULT_DISCARDS.map(d => ({ ...d })));
            emit('status', { type: 'ok', msg: '已重設棄牌規則為預設值' });
          } else {
            // 盤面/通用:只重設拼圖規則(棄牌已獨立子分頁)
            if (!confirm(`重設拼圖規則(${rulesSection.value === 'board' ? '盤面/圖示' : '通用'}子分頁所屬)?\n\n即將清除目前 ${rules.length} 條拼圖規則(含拼圖建構器暫存與 raw/builder 切換狀態),回到預設範本。\n注意:此動作會重設「全部」拼圖規則(不分盤面/通用)。此動作不可復原。`)) return;
            Object.keys(builderRowsMap).forEach(k => delete builderRowsMap[k]);
            Object.keys(ruleEditMode).forEach(k => delete ruleEditMode[k]);
            Object.keys(ruleParseError).forEach(k => delete ruleParseError[k]);
            rules.splice(0, rules.length, ...DEFAULT_RULES.map(r => ({ ...r })));
            emit('status', { type: 'ok', msg: '已重設拼圖規則為預設值' });
          }
        } else if (id === 'symbols') {
          emit('status', { type: 'wait', msg: '請使用上方「↺ 重設」按鈕(在符號清單卡片內)' });
        } else {
          emit('status', { type: 'wait', msg: '本分頁尚未實作,沒有可重設的內容' });
        }
      }

      onMounted(() => {
        emit('status', { type: 'wait', msg: 'A 設定檔編輯器' });
        // v5.0-b:主題由 app 層套用,此處不再處理
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
        // v5.0-c:矩陣拖曳框選收尾
        window.addEventListener('pointerup', _onMatrixPointerUp);
        // v7.x:視窗縮放時,若在盤面結構分頁則重新 fit 畫布(輕量 debounce)
        window.addEventListener('resize', _onWindowResizeForCanvas);
        // ③d-2 潤飾:曝露規則白話描述函式給圖示頁,rule 列顯示與規則頁完全一致(閉包完整、零漂移)
        try { if (window.SlotPlanner) window.SlotPlanner.humanizeRule = humanizeRule; } catch (e) { /* no-op */ }
        // 架構檢閱 #2:曝露 flushPendingSaves,讓匯出/比對等跨模組讀 LS 前可強制 flush
        try { if (window.SlotPlanner) window.SlotPlanner.flushPendingSaves = flushPendingSaves; } catch (e) { /* no-op */ }
        // v6.2 規則#11:消費符號頁帶來的「新增相關約束」意圖
        try {
          const intent = window.SlotPlanner && window.SlotPlanner.pendingConfigIntent;
          if (intent && intent.tab === 'constraints' && intent.addConstraintFor) {
            window.SlotPlanner.pendingConfigIntent = null;   // 用掉,避免重複
            active.value = 'constraints';
            const taken = new Set(constraints.map(c => c.constraint_id));
            let i = constraints.length + 1;
            while (taken.has(`C${String(i).padStart(3, '0')}`)) i++;
            const newId = `C${String(i).padStart(3, '0')}`;
            const c = makeConstraint(newId);
            c.symbol_id = String(intent.addConstraintFor);
            constraints.push(c);
            emit('status', { type: 'ok', msg: `已新增約束 ${newId}(符號 ${c.symbol_id}),請設定限制內容` });
          } else if (intent && intent.tab === 'rules' && (intent.addRuleFor || intent.addSizeRuleFor)) {
            // ③d-2 甲案:圖示頁「＋新增規則 / ＋新增尺寸規則」→ 開規則頁「同一套」ruleDlg 編輯器並預填此符號
            window.SlotPlanner.pendingConfigIntent = null;   // 用掉,避免重複
            active.value = 'rules';
            rulesSection.value = 'board';   // 盤面/圖示相關規則子分頁
            const sid = String(intent.addRuleFor || intent.addSizeRuleFor);
            openRuleDlg('puzzle');
            ruleDlg._origin = intent.addSizeRuleFor ? 'size' : 'icon';   // 甲:來源徽章
            // 種一條「此符號數量 ≥ 1」條件,確保新規則參照到此符號(圖示頁 scanSymbolRefs 即可撈到)
            ruleDlg.rows = [{ category: 'symbol_count', subkey: sid, op: '>=', value: '1', combinator: 'AND' }];
            if (intent.addSizeRuleFor) {
              // §2.7 尺寸相關事件:預填「落地 → 擴展整輪」骨架(方向/細節由使用者調整)
              ruleDlg.trigger = 'ON_SYMBOL_LANDED';
              ruleDlg.action = (typeof makeAction === 'function') ? makeAction('EXPAND_REEL') : { atype: 'EXPAND_REEL', params: {} };
              if (ruleDlg.action && ruleDlg.action.params) ruleDlg.action.params.symbol = sid;
              emit('status', { type: 'ok', msg: `新增尺寸規則:已預填「落地 → 擴展整輪」骨架(符號 ${sid}),請命名並調整方向 / 細節` });
            } else {
              emit('status', { type: 'ok', msg: `新增規則:已預填「符號 ${sid} 數量 ≥ 1」條件,請命名並設定觸發與動作` });
            }
          }
        } catch (e) { /* 意圖消費失敗不影響正常載入 */ }
        // v7.6.1:分頁列預設收起(見 cfgTabRailCollapsed = ref(true)),手機起始不擋捲動
        // v7.6.1:行動版抽屜 — 開用漢堡鈕(點按);關用 drag-follow(拖分頁列關閉,跟手)
        try {
          const _el = document.querySelector('.cfg-tabs');
          const _drag = window.SlotPlanner && window.SlotPlanner.attachDrawerDrag;
          if (_el && _drag) {
            _detachCfgSwipe = _drag(_el, {
              side: 'left',
              isOpen:  () => !cfgTabRailCollapsed.value,
              onClose: () => { cfgTabRailCollapsed.value = true; },
            });
          }
        } catch (e) { /* 手勢掛載失敗不影響功能 */ }
      });
      onUnmounted(() => {
        if (_detachCfgSwipe) { try { _detachCfgSwipe(); } catch (e) {} _detachCfgSwipe = null; }
        window.removeEventListener('pointerup', _onMatrixPointerUp);
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

      // ── 賠付模型(01_Global,4 按鈕:LINE/WAYS/SCATTER/CLUSTER)──
      //    引擎 pay_type enum = LINE/WAYS/SCATTER/CLUSTER。
      //    §5.2 Stage C:MEGAWAYS 不再是賠付類型 → 移除 chip;可變列高改由「盤面幾何卡」逐模式
      //    (rows_variable)決定。g.megaways 保留於 g(相容/降級,D4),UI 不再直接編輯。
      const PAY_MODELS = [
        { id: 'LINE',     label: 'Line',     desc: '固定中獎線計分' },
        { id: 'WAYS',     label: 'WAYS',     desc: '相鄰輪相同符號即計分(243 ways 等)' },
        { id: 'SCATTER',  label: 'Grid',     desc: '任意位置散佈計分(Scatter / Grid)' },
        { id: 'CLUSTER',  label: 'Cluster',  desc: '同符相鄰成群計分' },
      ];
      const activePayModel = computed(() => g.pay_type);   // §5.2 Stage C:不再合成 MEGAWAYS
      function selectPayModel(id) {
        g.pay_type = id;                                   // §5.2 Stage C:不動 g.megaways(改逐模式)
        emit('status', { type: 'ok', msg: `賠付模型已設為 ${id}` });
      }

      // ── v7.12:賠付模型卡收合(runtime-only,不存 LS)──
      const payModelOpen = ref(true);
      function togglePayModel() { payModelOpen.value = !payModelOpen.value; }
      const payModelSummary = computed(() => {
        const parts = [activePayModel.value];
        if (scanDirApplicable.value) parts.push(scanDirLabel(curScanDir.value));
        if (g.pay_type === 'CLUSTER') parts.push('min ' + g.cluster_min_size);
        return parts.join(' · ');
      });

      // ── 計分方向(全域單一控制,同時套用 ways_direction 與 payline_direction)──
      const scanDirApplicable = computed(() => {
        const m = activePayModel.value;
        return m === 'LINE' || m === 'WAYS';   // §5.2 Stage C:MEGAWAYS 併入 WAYS
      });
      const curScanDir = computed(() => g.ways_direction || g.payline_direction || 'LTR');
      function setScanDir(d) {
        if (!WAYS_DIRS.includes(d)) return;
        g.ways_direction = d;
        g.payline_direction = d;
      }
      // #3:計分方向按鈕白話標籤(L→R / L←R / 雙向)
      function scanDirLabel(d) {
        return d === 'LTR' ? 'L→R' : (d === 'RTL' ? 'L←R' : (d === 'BOTH' ? '雙向' : d));
      }

      // ── 分頁適用性(條件式反灰;grid_size_weights / paylines)──
      function tabNotApplicable(id) {
        if (id === 'grid_size_weights') return !modes.some(m => m.rows_variable);   // §5.2 Stage C:改逐模式(任一可變即適用)
        if (id === 'paylines')          return g.pay_type !== 'LINE';
        return false;
      }
      function tabNAReason(id) {
        if (id === 'grid_size_weights')
          return '格數權重僅在有模式設為「可變(Megaways)」時使用。請至盤面頁的「盤面幾何」卡把該模式設為可變後再設定。';
        if (id === 'paylines')
          return `目前賠付模型為 ${activePayModel.value},不使用固定中獎線。改回 LINE 才需要設定中獎線。`;
        return '';
      }

      // ── 04/05 矩陣熱力圖:grid 版(沿用 reel 的色階,改用 gridMaxWeight)──
      function gridHeatColor(mode, w) {
        if (w === 0 || w === undefined || w === null) {
          return 'rgb(var(--tint-muted) / 0.10)';
        }
        const mx = gridMaxWeight(mode);
        if (!mx) return 'transparent';
        const ratio = Math.sqrt(Math.min(1, w / mx));
        return `rgb(var(--tint-accent) / ${(0.08 + 0.50 * ratio).toFixed(3)})`;
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
      const selectedCells = ref([]);                          // v7.x:畫格框選的絕對格座標 "col,row"
      function toggleCellSelection(col, row) {
        const k = col + ',' + row;
        const i = selectedCells.value.indexOf(k);
        if (i >= 0) selectedCells.value.splice(i, 1); else selectedCells.value.push(k);
      }
      function clearCellSelection() { selectedCells.value = []; }
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
        activePanelIdx.value = -1;   // #9/#10:選主輪即離開副盤編輯(取代「編主輪」按鈕),主輪/副盤互斥
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
            moveReelInsert(previewDragFrom.value, previewDragOver.value);   // #6:移動讓位(非交換)
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
        payModelOpen, togglePayModel, payModelSummary,
        scanDirApplicable, curScanDir, setScanDir, scanDirLabel,
        tabNotApplicable, tabNAReason,
        gridHeatColor,
        // ── v4.1 補回(矩陣 quickbar)──
        matrixFillValue, quickFillTable, quickApplySelection,
        selectWholeColumn, selectWholeRow,
        // ── v4.1 補回(layout 群組多選 + 預覽互動)──
        selectedReelIdxs, groupActive, groupRowsValue, groupOffsetValue,
        clearReelSelection, selectReelById, onReelChipClick,
        navTo,
        groupSetRows, groupAdjustRows, groupSetOffset, groupAdjustOffset, groupToggleSubreel,
        previewDragFrom, previewDragOver, onPreviewPointerDown, onPreviewPointerEnter,
        selectedCells, toggleCellSelection, clearCellSelection,
        cellsToPanelGeom, classifySelectionAsSub, cellsToReels, classifySelectionAsMain,
        cvMode, boardHints, cvCols, cvRows, cvCell, cvDirty, cvMainInvalid, cvRubberSet, cvEditCount,
        cvGrid, cvColLabels,
        cvCellDown, cvCellEnter, cvGridMove, cvUp, cvSetMode, cvClear, cvLoadFromBoard, cvCommit, cvDiscard,
        // 架構檢閱 #3:畫布鍵盤導覽
        cvFocusCell, cvFocusKey, cvKeydown, cvActivateFocusCell, cvFocusInit,
        cvSelCell, cvSelCellInMain, cvCellDbl, cvSelCellToggleHole, cvCloseCellCard,
        cvCtx, cvContextMenu, cvCtxClose, cvCtxSelReel, cvCtxCancelCell, cvCtxSelPanel, cvCtxPanelType, cvCtxDelPanel, cvCtxAddPanel, cvCtxAddTrack, cvCtxGoRules,
        cvStageRef, cvPanStart, cvPanMove, cvPanEnd, cvStageUp, cvResetView,
        // ── template 用非底線名稱的別名(對應既有底線實作)──
        handleSaveAsTemplate: _handleSaveAsTemplate,
        dragReelIdx: _dragReelIdx,
        dragOverIdx: _dragOverIdx,
        tplNameInputRef,
        TABS, TABS_BY_GROUP, visibleTabGroups, isVariableHeightBoard, active, activeTab, groupDirtyCount,
        isFitTab,   // v8.14 批1:fit 頁 class 綁定
        g, PAY_TYPES, WAYS_DIRS,
        registry, symbolList, symbolNames, allModeScopes,
        modes, modeNames, duplicateNames, modesDebugJson,
        gridGeomOpen, toggleGridGeom, reelCapById, setModeGridVariable, setModeGridFixed,
        clampModeGridBroadcast, modePerReelOn, toggleModePerReel, clampReelRange,
        addMode, removeMode, renameMode, modeCardKey, passStatus,
        scopeStrHas, toggleScopeStr, scopeHasMode, toggleScopeMode,
        modeUnlockHas, modeUnlockToggle,
        // v8.14 批3 #3:新增模式彈窗（三步精靈）
        modeAddDlg, openAddModeDlg, modeAddDlgPick, modeAddDlgNameTaken, modeAddCanConfirm,
        modeAddDlgTpVisible, modeAddDlgTpAdd, modeAddDlgTpRemove, confirmAddModeDlg,
        modeAddDlgNext, modeAddDlgBack, modeAddCanNext,
        modeAddDlgToggleSection, modeAddDlgFocusSection,
        modeAddDlgSections, modeAddDlgPreview,
        modeAddDlgUnlockHas, modeAddDlgUnlockToggle,
        layout, layoutCells, layoutLabels, layoutViewBox, totalCells, layoutDebugJson,
        activeReelIdx, activeReel,
        addReel, removeReel, swapReels,
        // v4.6 副輪種類
        SUBREEL_KINDS, setSubreelKind, activeSubreelKindDef,
        ENTRY_MODES, reelDirOpts, setReelEntryMode, setReelScrollDir, copyReelEntryToAll,
        // v4.7 自由副盤 + 符號集
        panels, panelsDebugJson, activePanelIdx, activePanel, panelCells,
        addPanel, removePanel, selectPanel, renamePanel,
        symbolSets, symbolSetNames, addSymbolSet, removeSymbolSet, toggleSymbolInSet,
        // v4.8 04 副盤權重(副輪 .sub + Panel)
        auxW, independentSubReels, hasAuxWeightRows, scrollingPanels,
        collectJpOptions, panelsFeedingJp, panelCollectJpWarn, genTriggerRule,
        symbolsFeedingJp, goSymbolsPage,
        auxRowTotal, auxFillRow, auxNormalizeRow, auxFillFromSet, panelWeightSourceLabel,
        // v4.8:移除冗餘底線匯出(_dragReelIdx/_dragOverIdx 已以別名匯出,底線名觸發 Vue 保留前綴警告)
        onReelDragStart, onReelDragOver, onReelDragLeave, onReelDrop, onReelDragEnd,
        LAYOUT_CELL_SIZE: LAYOUT_CELL_SIZE_OUT,
        bins, binsFor, binsValid, binTickPercent, binsDebugJson,
        paylines, paylinesDebugJson, PAYLINE_DIRECTIONS,
        addPayline, removePayline, paylineValid, paylineCells,
        paylineCtx, openPaylineCtx, closePaylineCtx, paylineCtxEdit, paylineCtxDelete,
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
        paylineGenOpen, togglePaylineGen, paylineGenMethod, paylineGenCount,
        paylineGenMode, paylineBoardUniform, paylineGenAvailable, runPaylineGen,
        clearAllPaylines,
        paylineOverviewMode, paylineColor, paylineOverviewLines,
        paylineMiniSvg,
        constraints, constraintsDebugJson, constraintDuplicateIds, CONSTRAINT_TYPES,
        addConstraint, removeConstraint, toggleConstraintMode, constraintHasMode,
        // v7.11:產牌限制 / 生成期約束
        genLimits, genLimitDuplicateIds, genLimitZoneOptions, genLimitStatusOf,
        genLimitSymbolOptions,
        addGenLimit, removeGenLimit, genLimitZoneLabel, humanizeGenLimit,
        genConstraints, gcDlg, openGcDlg, closeGcDlg, gcAddSym, gcRemoveSym,
        confirmGcDlg, dupGenConstraint, removeGenConstraint, toggleGenConstraint,
        humanizeGenConstraint, gcOpLabel, gcHasValue, gcUsesSymbols, gcDlgValid,
        GC_OPS, GC_RELATIONS, GC_BOARD_STATES, GC_CTYPE_LABEL,
        gcExTargetOptions, gcExAddLeaf, gcExAddGroup, gcExRemoveItem, gcExOnLeafTypeChange, gcExSentence,
        gcHasConflict,
        softDiscardItems, discardDlg, openDiscardDlg, closeDiscardDlg, confirmDiscardDlg, dupDiscardRow, removeDiscardRow,
        reelWeights, reelWeightsDebugJson,
        reelW, reelSymbolIdsStr, setReelSymbolIdsStr,
        reelMaxWeight, reelHeatColor, reelTotalForRow, reelRowSparkBars, onMatrixKeydown,
        reelFillRowUniform, reelCopyToAll, sortReelSymbols,
        matrixRowSort, getRowSort, setRowSort, sortedReels,
        // ── #4 矩陣模式級操作(04/05/08 共用)──
        matrixMenu, openMatrixMenu, closeMatrixMenu,
        matrixScale, matrixFillAll, matrixNormalizeRows, matrixClearAll,
        matrixCopyFromMode, matrixOtherModes,
        // ── #2 健康度檢查 ──
        validationIssues, validationSummary, validationPanelOpen,
        toggleValidationPanel, goToTabFromValidation, issuesByTab,
        pfFilter, pfCounts, pfIssuesByTab, setPfFilter,   // #4 全案預檢篩選
        // ── #10 變更回顧 ──
        changesPanelOpen, changesByTab, changesSummary, baselineInfo,
        toggleChangesPanel, goToTabFromChanges, resetBaseline, formatBaselineTime,
        // ── #5 Test Inspector(09/10/11 共用)──
        pinnedTest, inspectorOpen, inspectorCtxExpanded,
        pinTest, unpinTest, evalPinned, pinnedKindLabel, isInPuzzleTab,
        // ── #15 Ctrl+K 搜尋 ──
        searchOpen, searchQuery, searchSelectedIdx, searchResults,
        openSearch, closeSearch, executeSearchResult, onSearchKeydown,
        // UI/UX 改版 P2:快捷鍵一覽浮層(Shift+?)
        shortcutsHelpOpen, openShortcutsHelp, closeShortcutsHelp,
        shortcutsHintDismissed, dismissShortcutsHint, openShortcutsHelpFromHint,
        gridWeights, gridWeightsDebugJson,
        gridW, gridSizesStr, setGridSizesStr, applyModeRangeToGridSizes, modeRowRangeLabel,
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
        // UI/UX 改版 P2:規則列右鍵選單
        ruleCtx, openRuleCtx, closeRuleCtx, ruleCtxDuplicate, ruleCtxToggleEnabled, ruleCtxDelete,
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
        matrixSelection, clearMatrixSelection,
        onMatrixCellPointerDown, onMatrixCellPointerEnter, matrixDrag,
        isMatrixCellSelected, applyMatrixSelOp,
        reelHeatClass, gridHeatClass, comboHeatClass,
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
        // v3.4 / B6:範本載入 diff preview
        modeExpandedKey, isModeExpanded, toggleModeExpanded,
        isModeGpOpen, toggleModeGp,
        modeGpHasContent, modeGpSummary,
        // v8.6 / R5:商業層
        gamble, GAMBLE_TYPE_OPTIONS, BF_KIND_OPTIONS, addRtpVariant, removeRtpVariant,
        // v8.25 / G4:獎池級距
        jackpotCfg, JACKPOT_TRIGGER_OPTIONS, addJackpotTier, removeJackpotTier,
        cellAttrs, CELL_ATTR_OPTIONS, addCellAttr, removeCellAttr,   // v8.8 R4 B-6
        CELL_STATE_OPTIONS, STATE_TRIGGER_OPTIONS,   // G-2 動態格位狀態層(D2甲/D3甲)
        cvMechFilter, cvMechOptions, cvFltInfo,   // #2 機制篩選（§11;檢視）
        jackpots, addJackpot, addJackpotPreset, removeJackpot, toggleJackpotMode, jackpotHasMode,
        JP_PRESETS, jpGlobalType, setJpGlobalType,
        betConfig, addBuyFeature, removeBuyFeature,
        betCardOpen, toggleBetCard, anteBetSummary, buyFeatureSummary,
        // v6.4 死碼移除:multipliers/coin_values 編輯器函式不再導出(對應 template 區塊已移除)。
        //   multipliers/coinValues 物件本身內部仍由存檔 watch / 驗證 / 遷移使用,無需導出至模板。
        rtpResult, rtpPct, rtpVsTarget,
        reelStrips, stripActiveMode, stripStr, stripLen, commitStrip, stripDist,
        stripBand, stripSegColor,
        stripBaseOf, stripVariantsOf, addStripVariant, removeStripVariant, selectStripKey,   // v8.43 C-1:輪帶變體
        stripGenLen, stripGenStacked, suggestedStripLen, stripCompare, stripLimitConflicts,
        genStripFromWeights, genAllStripsFromWeights, applyStripToWeights, applyAllStripsToWeights,
        addTriggerPay, removeTriggerPay, RESET_SCOPE_OPTIONS, STACK_MODE_OPTIONS,
        addGeometryTransition, removeGeometryTransition, GEOMETRY_DIMENSIONS, WAYS_RECOMPUTE_OPTIONS,   // G-7/8
        addSymbolOp, removeSymbolOp, SYMBOL_OP_OPTIONS, SYMBOL_TARGET_HINTS,   // G-9
        HOLD_WIN_JACKPOT_HINTS,   // G-4
        // v8.0:legacy bonus 匯出(bonusGames/addBonusGame/bonusesForMode/bonusJpOptions/…/
        //   legacyBonusCount/migrateBonusesToModes)已移除——bonus 併入 mode 玩法種類。
        // v7.14:mode 玩法種類 + mode-owned bonus 獎項
        MODE_KIND_OPTIONS, MODE_KIND_LABEL, isBonusKind,
        // 模式卡片區段啟停（ModeSections）
        modeSectionOn, modeSectionList, modeSectionsAvailableToAdd, modeSectionAdd, modeSectionRemove,
        isModeAddSecOpen, toggleModeAddSec, closeModeAddSec,
        addModeItem, removeModeItem, modeItemJpOptions, modeItemPct, modeExpected,
        modeItemModeOptions,   // v8.27 批8:item→模式連結下拉
        // v8.22 / G3:獎項角色 + Hold&Win 設定面
        MODE_ITEM_ROLES, itemRoleLabel,
        modeWheelTargets, modeKindSummary,
        tplLoadPreviewOpen, tplLoadPreviewData, showTemplateDiff, closeTemplateDiff,
        confirmTemplateDiffLoad,
        // v3.4 / B5:active tab issues
        activeTabIssues,
        presetDrawerOpen, presetSearch, filteredPresetGroups, insertPreset,
        cfgTabRailCollapsed,
        cfgRailPinned, toggleCfgRailPinned,
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
        reelSymFilterType, reelSymFilterPicked, symIsSpecial: _symIsSpecial, visibleReelSyms,
        toggleReelSymPick, clearReelSymFilter, reelColBase, reelIsDeviant, reelExceptions, gotoReelException,
        cellPop, openCellPop, openCellPopFromException, commitCellPop, cancelCellPop, cellPopSliderMax,
        sheetTouchStart, sheetTouchMove, sheetTouchEnd,
        guideChip, guideChipCls, guideRun,
        ACTION_CATALOG, ACTION_BY_TYPE, actionsByGroup,
        actionEditMode, actionsParseError,
        actionMeta, actParamValue, setActParam,
        setActParamDyn, dynParamWarn,   // v8.34 GAP-S1
        symGroupOptions, isOrphanGroupRef,   // v8.36 🟢-2
        reelLinks, addReelLink, removeReelLink, reelLinkWarn,   // v8.38 GAP-T1
        tracks, addTrack, removeTrack, reverseTrack, trackCellsWarn, trackOptions, isOrphanTrackRef,
        trackPreviewIdx, trackPreview,   // v8.39 GAP-F1+軌道
        meters, addMeter, removeMeter, duplicateMeter, meterWarn, METER_RESET_SCOPES,   // 架構檢閱 #21
        addMeterTier, removeMeterTier, setMeterTierMode,   // G-1 收集條分段門檻
        addAction, removeAction, moveAction, duplicateAction,
        changeActionAtType, setActionsFromDSL, setActionEditMode,
        buildActionsDSL,
        // legacy(向下相容,不再使用,但留著避免 undefined 錯誤)
        actionParamsObj, paramValue, setActionParam, changeActionType,
        parseActionParams,
        exportXlsx, onImportFile,
        dirtyTabs,
        showTemplatePanel, templateList, newTemplateName, newTemplateDesc,
        userTemplateCount,   // v4.9:標頭計數(僅使用者範本)
        tplSaveOpen,   // v4.8:_handleSaveAsTemplate 改僅以別名 handleSaveAsTemplate 匯出
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
        selectedKind, rulesListSearch, ruleMatchesSearch, discardMatchesSearch, rulesAddMenuOpen,
        // ── v8.15:規則頁大改版(動態標題/合併清單/膠囊條件/動作收合/兩步彈窗)──
        rulesSectionMeta, rulesListGroups, selectRuleFromList, ruleListSub, discardListSub,
        isCondRowOpen, toggleCondRow, humanizeCondRow, addBuilderRowUI, discardAddRowUI,
        isActionOpen, toggleActionOpen, addActionUI,
        ruleDlg, ruleDlgNameTaken, ruleDlgEventClash, ruleDlgCondHuman,
        dlgAddRow, dlgRemoveRow, dlgChangeCat, dlgChangeActionType, dlgStepNext, confirmRuleDlg,
        // ── v8.15 批2:或分組 / 中文化 / 產牌限制入列 ──
        condRowGroups, opLabel, varCatLabel, enumOptLabel,
        // ── v8.20 / G5:範圍謂詞 scope(動作層修飾子)+ symbol_count 動態值 ──
        SCOPE_CATALOG, scopeLabel, dynValueLabel,
        scopeBaseOf, scopeArgOf, setScope,
        glSelectedIdx, genListSub, selectGenLimitFromList,
        rulesSection, setRulesSection,
        rulePeer, rulePeerLineVisible, gotoPeer,
        weightPeer, gotoWeightPeer,
        rulesNavExpanded, onRulesParentClick, gotoRulesSub, onRailReopen,
        addRuleFromMenu,
        // ── #17 規則拖曳排序 ──
        rulesDragState, rulesAutoPriority,
        onRuleDragStart, onRuleDragOver, onRuleDragLeave, onRuleDrop, onRuleDragEnd,
        reelActiveMode, gridActiveMode, comboActiveModeBar,
      };
  };

  console.log('[config-editor/setup] loaded');

})();
