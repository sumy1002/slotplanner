// ============================================================
//  docgen.js — 文件生成（企劃文件 Excel + 機制文件 Markdown）
//
//  落點：「🗂️ 數據文件相關」第三個子分頁「📋 文件生成」
//
//  公開接口（掛在 window.SlotPlanner）：
//    DocGen.collectConfig()                  → 讀 LS 設定檔，回傳正規化物件
//    DocGen.defaultMeta(config?)             → 由 config 推導手填欄位預設
//    DocGen.loadMeta() / saveMeta(meta)      → 手填敘述 LS 讀寫
//    DocGen.mergeMeta(meta, config)          → 補齊缺漏的模式/特殊圖示鍵
//    DocGen.buildPlanXlsxBuffer(meta)        → Promise<ArrayBuffer>（企劃文件）
//    DocGen.buildMechMarkdown(meta)          → string（機制文件 簡版）
//    DocGenPage                              → Vue component（子分頁 UI）
//
//  依賴：window.ExcelJS（企劃文件用）。Markdown 與 collectConfig 不需要。
//  完全獨立 IIFE，不碰 A.xlsx 契約，新增 LS key：slotplanner.docmeta.v1
// ============================================================
(function () {
  'use strict';

  window.SlotPlanner = window.SlotPlanner || {};
  const SP = window.SlotPlanner;

  const LS_DOCMETA_KEY = 'slotplanner.docmeta.v1';

  // v6.2 文件生成 #1:四組常用下拉預設(企劃可改可補,僅作為快速選項)
  const PAYLINE_METHODS = [
    '滾輪停止後，從最左輪算起有連續3個以上相同圖示即可得分',
    '滾輪停止後，從最左輪算起有連續3個(部分2個)以上相同圖示即可得分',
    '滾輪停止後，從最左輪算起有連續3個(部分2個)以上相同圖示即可得分(含主盤及副盤)',
    '滾輪停止後，從最左輪算起在得分線上有連續3個以上相同圖示即可得分',
    '滾輪停止後，從最左輪算起在得分線上有連續3個(部分2個)以上相同圖示即可得分',
    '滾輪停止後，盤面上任意位置有8個以上相同圖示即可得分',
    '滾輪停止後，相同圖示相鄰5個以上即可得分(斜線不算)',
  ];
  const REFILL_METHODS = [
    '連線時會消除得分圖示，並由上方圖示向下補滿，直到無法發生連線時，即計算遊戲一回合',
    '連線時會消除得分圖示，並由上方圖示向下補滿，直到無法發生達成得分條件時，即計算遊戲一回合',
    '連線時會消除得分線上所有圖示，並由上方圖示向下補滿，直到無法發生連線時，即計算遊戲一回合',
  ];
  const SCROLL_METHODS = ['整輪滾動↓', '單格滾動', '由左至右→', '由右至左←'];
  const SCORE_FORMULAS = [
    '押注額 × 圖示賠率 × 額外倍數 = 獲得彩金',
    '押注額 × 圖示數量賠率 × 圖示倍數加總 = 獲得彩金',
    '押注額 × 圖示賠率 = 獲得彩金',
    '押注額 × 連線圖示組合數 × 圖示賠率 = 獲得彩金',
    '押注額 × 連線圖示組合數 × 圖示賠率 × 額外倍數 = 獲得彩金',
  ];

  // ════════════════════════════════════════════════════════════════════
  //  讀 LS 設定檔 → 正規化
  // ════════════════════════════════════════════════════════════════════
  function _readLS(key, def) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      return parsed != null ? parsed : def;
    } catch (e) { return def; }
  }

  // 特殊圖示判定：wild / scatter / 類型屬特殊
  //   v6.2:符號型別改制後,FREE / COIN 也屬功能型特殊圖示(SPECIAL 保留相容舊存檔)
  const SPECIAL_TYPES = new Set(['WILD', 'SCATTER', 'BONUS', 'FREE', 'COIN', 'SPECIAL']);
  function _isSpecial(s) {
    return !!(s.is_wild || s.is_scatter || SPECIAL_TYPES.has((s.type || '').toUpperCase()));
  }
  function _symId(s) { return (s.symbol_id && String(s.symbol_id).trim()) || s.name || `#${s.number}`; }
  function _symRole(s) {
    if (s.is_wild) return 'WILD';
    if (s.is_scatter) return 'SCATTER';
    const t = (s.type || '').toUpperCase();
    if (SPECIAL_TYPES.has(t)) return t;
    return '';
  }

  // 依角色給一段可編輯的預設行為說明樣板
  function behaviorTemplate(s) {
    const role = _symRole(s) || 'SPECIAL';
    const name = (s && (s.name || _symId(s))) || '此圖示';
    switch (role) {
      case 'WILD':
        return `${name}（WILD）可替代盤面上除散佈（SCATTER／FREE）外的所有圖示以形成連線；本身不主動形成連線（如有自身賠率請於賠付表填寫）。`;
      case 'SCATTER':
        return `${name}（SCATTER）為散佈圖示，不需落在連線上；盤面任意位置出現達指定數量即觸發對應功能（例如進入 FREE GAME）。`;
      case 'BONUS':
        return `${name}（BONUS）達成指定出現條件後觸發 BONUS GAME / 獎勵關卡。`;
      case 'FREE':
        return `${name}（FREE）為免費遊戲觸發圖示，盤面出現達指定數量即觸發 FREE GAME。`;
      case 'COIN':
        return `${name}（COIN）為金幣圖示，出現時帶有面額／彩金值（常用於 Hold & Win 玩法），請補充其面額與收集規則。`;
      default:
        return `${name} 為特殊圖示，具備專屬的觸發或替代行為，請補充其出現輪、數量門檻與效果。`;
    }
  }

  function _payTypeLabel(g) {
    const pt = (g.pay_type || 'LINE').toUpperCase();
    // v6.2 文件生成#2:依企劃用語 — LINE=連線、WAYS=百搭、SCATTER=圖示數量、CLUSTER=相鄰群
    const map = { LINE: '連線', WAYS: '百搭', SCATTER: '圖示數量', CLUSTER: '相鄰群' };
    let label = map[pt] || pt;
    if (g.megaways) label = label ? `${label}／Megaways` : 'Megaways';
    return label;
  }

  // ── v8.2 / 缺失清單 F-19:特色規則(09/10)人話化 helper ─────────────
  //   標籤對齊 helpers.js TRIGGER_CATALOG / ACTION_CATALOG(docgen 為獨立
  //   IIFE、直讀 LS,故此處持有唯讀 label map;未知值一律回印原 raw,安全降級)。
  const _RULE_TRIGGER_LABEL = {
    ON_SPIN_START: 'Spin 開始', ON_GRID_GENERATED: '盤面生成', ON_WIN_RESOLVED: '中獎結算',
    ON_SYMBOL_LANDED: '符號落盤', ON_COMBO_STEP: '連爆步進', ON_COMBO_END: '連爆結束',
    ON_DEAD_SPIN: '無中獎', ON_MODE_ENTER: '進入模式', ON_MODE_EXIT: '離開模式',
    ON_CUSTOM_EMIT: '自訂事件',
  };
  const _RULE_ACTION_LABEL = {
    ADJUST_MULTIPLIER: '調整倍數', UPDATE_GLOBAL: '更新全域變數', UPDATE_LOCAL: '更新本局變數',
    EMIT_EVENT: '發出事件', SWITCH_MODE: '切換模式', AWARD_FREE_SPIN: '給免費局',
    HALT_RESOLUTION: '中止結算', BOARD_FILL: '盤面填充', BOARD_TRANSFORM: '符號轉換',
    BOARD_DESTROY: '盤面消除', MOVE: '搬移', SWAP: '交換', STICKY: '黏著',
    LOCK_REEL: '鎖輪', REEL_RESTRICT: '輪位限制', GLOBAL_MAX: '全盤上限', SCROLL: '捲動',
    // v8.4 / R2 P2:描述型 action(執行語意由下游模擬工具實作)
    EXPAND_REEL: '擴展整輪', NUDGE: '推移', WALK: '走位', REVEAL_AS: '揭示',
    SPLIT: '分裂', DESTROY_ADJACENT: '相鄰消除', GROW_BOARD: '盤面成長',
    // v8.21 / G1 價值引擎:值動作(六枚;純描述,執行歸下游)
    COLLECT: '收集值', PAY: '直接派彩', MULTIPLY_VALUE: '值乘算',
    REVIVE: '回補回合', COMPACT: '盤面壓實', CONVERT: '值/型態轉換',
    // v8.24 / G5 生存結束:流程控制動作
    END_FEATURE: '結束 feature',
    // v8.29 / W-1:v8.28 缺口A 物件初始放置(漏補;參數經通用 kv 呈現)
    SPAWN: '放置物件',
  };
  // markdown 表格儲存格跳脫(condition DSL 可能含 || / 換行)
  function _mdCell(v) {
    return String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
  }
  // v8.20 / G5:範圍謂詞 scope 中文對照(docgen 獨立 IIFE,持有唯讀 map;未知 → 原樣)。
  const _SCOPE_ZH = {
    all_visible: '全部可見格', adjacent_8: '八方相鄰', adjacent_4: '四方相鄰',
    same_column: '同一直行', same_row: '同一橫列', column_above: '同行上方', edge: '邊緣格',
    range: '範圍區間', random_cells: '隨機取格',
  };
  function _scopeDesc(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    const m = s.match(/^(\w+)\s*\((.*)\)\s*$/);
    const base = m ? m[1] : s;
    const arg = m ? m[2].trim() : '';
    const zh = _SCOPE_ZH[base];
    if (!zh) return s;
    return (arg && (base === 'range' || base === 'random_cells')) ? `${zh}（${arg}）` : zh;
  }
  // v8.20 / G5:symbol_count.<SID> 動態值 → 白話(餵乘數用);非此形式原樣。
  //   v8.21 / G1:擴充值變數(symbol_value/cell_value/feature_value_total/respins_left)。
  function _dynVal(v) {
    const s = String(v == null ? '' : v).trim();
    let m = s.match(/^symbol_count\.([A-Za-z0-9_]+)$/);
    if (m) return `「${m[1]}」的盤面數量`;
    m = s.match(/^symbol_value\.([A-Za-z0-9_]+)$/);
    if (m) return `「${m[1]}」的攜帶值`;
    m = s.match(/^cell_value\.([0-9]+,[0-9]+)$/);
    if (m) return `格(${m[1]})的值`;
    if (s === 'feature_value_total') return '本 feature 累計值';
    if (s === 'respins_left') return '剩餘回合數';
    return s;
  }
  // 單一 action → 「標籤(k=v, k=v)」;params 物件淺列印,未知型別安全
  // v8.4 勘誤:前端規則的 action 型別欄位為 atype(helpers.makeAction);
  //   v8.2 誤讀 a.type 導致實際資料一律印 '?' 回退。atype 優先、type 兼容。
  function _ruleActionDesc(a) {
    if (!a || typeof a !== 'object') return '';
    const atype = a.atype || a.type || '';
    const label = _RULE_ACTION_LABEL[atype] || atype || '?';
    const p = (a.params && typeof a.params === 'object') ? a.params : {};
    // v8.20 / G5:scope 抽離單獨後綴;value 若為 symbol_count.<SID> 動態值則譯白話。
    const scopeStr = _scopeDesc(p.scope);
    const kv = Object.entries(p)
      .filter(([k, v]) => v !== '' && v != null && k !== 'scope')
      .map(([k, v]) => {
        // v8.21 / G1:value / factor 皆可能為動態值(symbol_count / symbol_value / feature_value_total …)
        const vv = (k === 'value' || k === 'factor') ? _dynVal(v) : (Array.isArray(v) ? JSON.stringify(v) : v);
        return `${k}=${vv}`;
      });
    let out = kv.length ? `${label}（${kv.join(', ')}）` : label;
    if (scopeStr) out += `〔範圍：${scopeStr}〕`;
    return out;
  }
  // v8.2 / F-20:輪帶符號分佈摘要 —「SYM×n」依出現數降冪,超過 10 種截斷
  function _stripDistSummary(arr) {
    const cnt = {};
    for (const s of (Array.isArray(arr) ? arr : [])) {
      const k = String(s).trim(); if (!k) continue;
      cnt[k] = (cnt[k] || 0) + 1;
    }
    const ent = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    const head = ent.slice(0, 10).map(([k, n]) => `${k}×${n}`).join('、');
    return ent.length > 10 ? `${head}、…（共 ${ent.length} 種）` : head;
  }

  function collectConfig() {
    const g           = _readLS('slotplanner.aconfig.global.v1', {});
    const modes       = _readLS('slotplanner.aconfig.modes.v1', []);
    const layoutRows  = _readLS('slotplanner.aconfig.layout.v1', []);
    const paylines    = _readLS('slotplanner.aconfig.paylines.v1', []);
    const constraints = _readLS('slotplanner.aconfig.constraints.v1', []);
    const rules       = _readLS('slotplanner.aconfig.rules.v1', []);
    const registryRaw = _readLS('slotplanner.registry.v1', { symbols: [] });
    // v5.6:帶入 v5.x 新增結構供文件自動呈現
    const jackpots    = _readLS('slotplanner.aconfig.jackpots.v1', []);
    const betConfig   = _readLS('slotplanner.aconfig.betconfig.v1', {});
    const multipliers = _readLS('slotplanner.aconfig.multipliers.v1', {});
    const coinValues  = _readLS('slotplanner.aconfig.coinvalues.v1', {});
    const genLimits   = _readLS('slotplanner.aconfig.genLimits.v1', []);    // v7.11
    const gamble      = _readLS('slotplanner.aconfig.gamble.v1', {});       // v8.6 R5:比倍(唯讀)
    const jackpotTiers= _readLS('slotplanner.aconfig.jackpot.v1', {});      // v8.25 G4:獎池級距(唯讀)
    const cellAttrs   = _readLS('slotplanner.aconfig.cellattrs.v1', []);    // v8.8 R4:格子屬性(唯讀)
    const symbolGroups = _readLS('slotplanner.aconfig.symbolgroups.v1', []); // P0-3:符號家族(唯讀)
    // v8.2 / 缺失清單 F-19/F-20:機制文件補印 特色規則 / 棄牌 / 輪帶 / 格數分佈
    //   (皆為既有 LS 的唯讀取出;純描述輸出,本工具不執行、不計算 RTP)
    const discards    = _readLS('slotplanner.aconfig.discards.v1', []);
    const reelStrips  = _readLS('slotplanner.aconfig.reelstrips.v1', {});
    const gridWeights = _readLS('slotplanner.aconfig.gridweights.v1', {});

    const allSyms = Array.isArray(registryRaw.symbols) ? registryRaw.symbols : [];
    const syms = allSyms.filter(s => s.enabled !== false);
    const normalSyms  = syms.filter(s => !_isSpecial(s));
    const specialSyms = syms.filter(s => _isSpecial(s));

    const heights = layoutRows.map(r => Number(r.max_rows) || 0).filter(n => n > 0);
    const gridStr = heights.join('-');
    // v6.4 / 缺漏#6:連線種數納入頂部橫向副盤(TOP_HORIZONTAL)貢獻。
    //   優先用 game-spec.js 的單一真相 computeWaysCount;未載入時 inline 等價回退。
    const waysCount = (window.SlotPlanner && window.SlotPlanner.gameSpecHelpers
                        && window.SlotPlanner.gameSpecHelpers.computeWaysCount)
      ? window.SlotPlanner.gameSpecHelpers.computeWaysCount(layoutRows)
      : (function () {
          const eff = (Array.isArray(layoutRows) ? layoutRows : []).map(r => {
            let h = Number(r && r.max_rows) || 0;
            if (r && r.has_subreel && String(r.subreel_kind || '').toUpperCase() === 'TOP_HORIZONTAL') {
              h += Number(r.subreel_rows) || 0;
            }
            return h;
          }).filter(n => n > 0);
          return eff.length ? eff.reduce((a, n) => a * n, 1) : 0;
        })();

    const payType = (g.pay_type || 'LINE').toUpperCase();
    const isWaysLike = (payType === 'WAYS') || !!g.megaways;       // v6.2:全路徑/megaways
    const isScatterLike = (payType === 'SCATTER' || payType === 'CLUSTER');  // v6.4 / 缺漏#3
    const clusterMin = Number(g.cluster_min_size) || 0;            // v6.4 / 缺漏#7

    return {
      global: g,
      modes: Array.isArray(modes) ? modes : [],
      layout: Array.isArray(layoutRows) ? layoutRows : [],
      paylines: Array.isArray(paylines) ? paylines : [],
      constraints: Array.isArray(constraints) ? constraints : [],
      rules: Array.isArray(rules) ? rules : [],
      symbols: syms,
      normalSyms,
      specialSyms,
      // v5.6:
      jackpots: Array.isArray(jackpots) ? jackpots : [],
      betConfig: (betConfig && typeof betConfig === 'object') ? betConfig : {},
      gamble: (gamble && typeof gamble === 'object') ? gamble : {},          // v8.6 R5
      jackpotTiers: (jackpotTiers && typeof jackpotTiers === 'object') ? jackpotTiers : {},  // v8.25 G4
      cellAttrs: Array.isArray(cellAttrs) ? cellAttrs : [],                   // v8.8 R4
      symbolGroups: Array.isArray(symbolGroups) ? symbolGroups : [],         // P0-3
      multipliers: (multipliers && typeof multipliers === 'object') ? multipliers : {},
      coinValues: (coinValues && typeof coinValues === 'object') ? coinValues : {},
      genLimits: Array.isArray(genLimits) ? genLimits : [],   // v7.11
      // v8.2:
      discards: Array.isArray(discards) ? discards : [],
      reelStrips: (reelStrips && typeof reelStrips === 'object') ? reelStrips : {},
      gridWeights: (gridWeights && typeof gridWeights === 'object') ? gridWeights : {},
      derived: {
        gridStr,
        waysCount,
        reelCount: heights.length,
        payTypeLabel: _payTypeLabel(g),
        payType,                                                                        // v6.2
        isWaysLike,                                                                     // v6.2:全路徑/megaways
        isScatterLike,                                                                  // v6.4 / 缺漏#3
        clusterMin,                                                                     // v6.4 / 缺漏#7
        // v6.4 / 缺漏#3:SCATTER/CLUSTER 的 waysCount 只是盤面位置組合、非賠付方式數,
        //   故改輸出「賠付方式」敘述、並隱藏連線種數(見 buildMechMarkdown / xlsx)。
        payMethodDesc: isScatterLike
          ? (payType === 'CLUSTER'
              ? `相鄰${clusterMin ? clusterMin + '個' : ''}以上同符即得分（見賠付表）`
              : `任意位置達標數量同符即得分（見賠付表）`)
          : '',
        startingMode: g.starting_mode || (modes[0] && modes[0].mode) || 'NG',
      },
    };
  }

  // v5.6:符號 → 動態賠付列（{count, pay} 由高到低 count 排序;優先 pay_rows）
  function _symPayRows(s) {
    if (Array.isArray(s.pay_rows) && s.pay_rows.length) {
      return s.pay_rows
        .filter(r => Number(r.pay) > 0)
        .map(r => ({ count: Number(r.count), pay: Number(r.pay),
                     count_to: (Number(r.count_to) > Number(r.count)) ? Number(r.count_to) : 0 }))   // v8.3 A-1
        .sort((a, b) => b.count - a.count);
    }
    const rows = [];
    for (const n of [9, 8, 7, 6, 5, 4, 3, 2]) {
      const v = Number(s['pay_' + n + 'x']) || 0;
      if (v > 0) rows.push({ count: n, pay: v });
    }
    return rows;
  }

  // v8.3 A-1:賠付區間 band key（單點 "8"、區間 "8–9"）;buildMechMarkdown / buildPlanXlsxBuffer 共用。
  function _bandKey(r) { return (r.count_to > 0 ? `${r.count}–${r.count_to}` : String(r.count)); }

  // ── v6.3:倍數 / 彩金「單一真相」彙整 ──
  //   已遷移(migrated_to_symbols)時,倍數/彩金一律以「符號」為準(避免 docgen 同時
  //   輸出符號版與 legacy 版兩套、且 legacy 物件會與使用者後續編輯不同步)。
  //   未遷移(遷移前的過渡狀態)才回退 legacy multipliers / coin_values 物件。
  //   回傳:{ migrated, multSyms, prizeSyms }(symbol 版)— 供 md / xlsx 共用。
  function _symbolMultView(cfg) {
    const mpc = cfg.multipliers || {};
    const migrated = !!mpc.migrated_to_symbols;
    const syms = Array.isArray(cfg.symbols) ? cfg.symbols : [];
    const multSyms  = syms.filter(s => Array.isArray(s.mult_values)  && s.mult_values.length);
    const prizeSyms = syms.filter(s => Array.isArray(s.prize_values) && s.prize_values.length);
    return { migrated, multSyms, prizeSyms };
  }

  // ── v6.4 / 缺漏#1+#2:倍數疊加方式 / 重置範圍 → 中文標籤 ──
  const _STACK_LABEL = { MUL: '相乘', ADD: '相加' };
  const _SCOPE_LABEL = { CASCADE: '每次連線中斷重置（per-cascade）', SPIN: '每局重置（per-spin）', FEATURE: '整個 feature 全程不重置（per-feature）' };
  function _stackModeLabel(v) { return _STACK_LABEL[String(v || '').toUpperCase()] || ''; }
  function _resetScopeLabel(v) { return _SCOPE_LABEL[String(v || '').toUpperCase()] || ''; }
  // v7.12:mode 玩法欄位(reset_scope / stack_mode / 封頂)→ 人話字串。
  //   規格書描述用;本工具不執行、不算 RTP(由數值模擬工具落盤)。空欄一律回 '' / '繼承全域'。
  function _modeResetDesc(md) {
    const s = String((md && md.reset_scope) || '').toUpperCase();
    return s ? (_resetScopeLabel(s) || s) : '繼承全域';
  }
  function _modeStackDesc(md) {
    const s = String((md && md.stack_mode) || '').toUpperCase();
    return s ? (_stackModeLabel(s) + '（' + s + '）') : '繼承全域';
  }
  function _modeCapDesc(md) {
    if (!md || md.cap_enabled !== 'Y') return '不封頂';
    const v = String(md.cap_value || '').trim();
    return v ? ('有（' + v + '）') : '有（未填上限值）';
  }
  // v8.5 / R3:玩家擇一 / Hold&Win respin 人話化(空 → —)
  function _modeChoiceDesc(md) {
    const g = (md && md.choice_group != null ? String(md.choice_group) : '').trim();
    return g ? `組「${g}」` : '—';
  }
  function _modeRespinDesc(md) {
    const base = Number(md && md.respin_base) || 0;
    if (base <= 0) return '—';
    const rrMap = { NEW_SYMBOL: '落新符號重置', ANY_WIN: '任何中獎重置', NEVER: '不重置' };
    const parts = [`初始 ${base} 局`];
    const rr = (md.respin_reset_on || '').trim().toUpperCase();
    if (rr) parts.push(rrMap[rr] || rr);
    const sc = (md.respin_stop_cond || '').trim();
    if (sc) parts.push(`停止：${sc}`);
    return parts.join(' · ');
  }

  // v7.14:mode 玩法種類。SPIN=旋轉;WHEEL/PICK/COLLECTION=bonus 小遊戲。
  const _MODE_KIND_LABEL = { SPIN: '旋轉', WHEEL: '輪盤', PICK: '選獎', COLLECTION: '收集' };
  function _isModeBonus(md) { return !!(md && md.mode_kind && String(md.mode_kind).toUpperCase() !== 'SPIN'); }
  function _modeKindDesc(md) {
    const k = String((md && md.mode_kind) || 'SPIN').toUpperCase();
    return _MODE_KIND_LABEL[k] ? (_MODE_KIND_LABEL[k] + '（' + k + '）') : k;
  }
  // v8.22 / G3:獎項角色 Item_Role 白話(docgen 獨立 IIFE 唯讀 map;未知/空 → '—')
  const _ITEM_ROLE_LABEL = { COIN: '金幣值', COLLECTOR: '收集器', MULTIPLIER: '倍數', BOOST: '增益', JACKPOT: '彩池' };
  function _itemRoleDesc(v) {
    const s = String(v == null ? '' : v).trim().toUpperCase();
    if (!s) return '—';
    return _ITEM_ROLE_LABEL[s] || s;
  }
  // v8.22 / G3:Hold&Win 收集設定摘要(有設定才回字串;皆無 → '')
  function _modeCollectDesc(md) {
    if (!md) return '';
    const parts = [];
    if (md.collect_enabled) parts.push('收集型');
    const rs = (md.respin_reset_symbol || '').trim();
    if (rs) parts.push(`落「${rs}」重置回合`);
    if (md.grid_expand_in_collect) parts.push('收集中盤面擴張');
    if (md.allow_persistent) parts.push('允許 persistent 規則');
    return parts.join(' · ');
  }
  // 某符號的「有效」倍數疊加方式:符號自帶 mult_stack_mode 優先,否則用文件層 meta.mult_stack_mode。
  function _symStackMode(s, meta) {
    const sm = (s && s.mult_stack_mode) || (meta && meta.mult_stack_mode) || '';
    return String(sm || '').toUpperCase();
  }

  // ════════════════════════════════════════════════════════════════════
  //  v7.5-B:中獎線 ASCII 示意（純函式，可單測；docgen 獨立,不依賴 setup.js computed）
  //
  //  路徑格式同 helpers.parsePathString:"(col,row)-(col,row)-…"(1-based,col=reel)。
  //  這裡自包一份解析(避免跨檔耦合),只取座標,不做盤面範圍校驗(校驗在 06_Paylines)。
  // ════════════════════════════════════════════════════════════════════
  function _parsePathPoints(str) {
    if (!str) return [];
    const matches = String(str).match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g);
    if (!matches) return [];
    return matches.map(mm => {
      const [c, r] = mm.replace(/[()]/g, '').split(',').map(x => parseInt(x.trim(), 10));
      return { col: c, row: r };
    }).filter(p => Number.isFinite(p.col) && Number.isFinite(p.row));
  }

  // 主盤幾何(吃不等高):由 cfg.layout 的 y_offset/max_rows 算出每欄的「有效列範圍」。
  //   回傳 { reelCount, rowMin, rowMax, colRange: {col -> {top,bot}} }(1-based row,經 y_offset 平移)。
  function _mainBoardGeom(layout) {
    const rows = (Array.isArray(layout) ? layout : []).map(r => ({
      yo: Number(r.y_offset) || 0,
      mr: Math.max(1, Number(r.max_rows) || 1),
    }));
    if (!rows.length) return null;
    let lo = Infinity, hi = -Infinity;
    rows.forEach(r => { lo = Math.min(lo, r.yo); hi = Math.max(hi, r.yo + r.mr - 1); });
    // 平移成 1-based 顯示列(top 對齊整體最高點)
    const colRange = {};
    rows.forEach((r, i) => {
      colRange[i + 1] = { top: (r.yo - lo) + 1, bot: (r.yo + r.mr - 1 - lo) + 1 };
    });
    return { reelCount: rows.length, rowMin: 1, rowMax: (hi - lo) + 1, colRange };
  }

  // 把一條線(points,座標 1-based)畫成 ASCII 網格。
  //   geom:來自 _mainBoardGeom;若某格在該欄有效列內＝可放格,命中點標 ●,其餘 ·,欄外空白。
  //   回傳多行字串陣列(含 reel 表頭 + 每列)。
  function _renderPaylineAscii(points, geom) {
    if (!geom) return ['（無盤面資料）'];
    const hit = new Set(points.map(p => p.col + ',' + p.row));
    const lines = [];
    // 表頭:R1 R2 …
    const head = ['   '];
    for (let c = 1; c <= geom.reelCount; c++) head.push('R' + c);
    lines.push(head.join(' '));
    for (let r = geom.rowMin; r <= geom.rowMax; r++) {
      const cells = ['r' + r + ' '];
      for (let c = 1; c <= geom.reelCount; c++) {
        const rng = geom.colRange[c];
        const inCol = rng && r >= rng.top && r <= rng.bot;
        if (!inCol) { cells.push('  '); continue; }      // 該欄無此列(不等高留白)
        cells.push(hit.has(c + ',' + r) ? '● ' : '· ');
      }
      lines.push(cells.join(''));
    }
    return lines;
  }

  // 一條線的純文字路徑:R1r2 → R2r2 → …
  function _pathArrowStr(points) {
    return points.map(p => `R${p.col}r${p.row}`).join(' → ');
  }

  // ════════════════════════════════════════════════════════════════════
  //  手填敘述（meta）— 預設 / 讀寫 / 補齊
  // ════════════════════════════════════════════════════════════════════
  // v5.1:從設定檔 LS 讀 JP 定義 → docgen rows;無資料回 null
  function _jackpotRowsFromConfig() {
    const arr = _readLS('slotplanner.aconfig.jackpots.v1', null);
    if (!Array.isArray(arr) || !arr.length) return null;
    const rows = arr
      .filter(j => j && (j.name || j.jp_id))
      .map(j => {
        // v6.2 #4:觸發說明手填優先;留空則用結構化欄位組合
        let td = j.trigger_desc || '';
        if (!td) {
          const tt = j.trigger_type || 'COLLECT';
          const parts = [];
          if (tt === 'ACCUMULATE') {
            if (Number(j.accum_pct) > 0) parts.push(`押注提撥 ${j.accum_pct}%`);
            if (j.accum_mech) parts.push(j.accum_mech);
            td = parts.length ? `累積（${parts.join('；')}）` : '累積';
          } else {
            if (Number(j.collect_prob) > 0) parts.push(`出現機率 ${j.collect_prob}%`);
            if (j.collect_enter) parts.push(j.collect_enter);
            td = parts.length ? `收集（${parts.join('；')}）` : '收集';
          }
        }
        return {
          name: j.name || j.jp_id,
          mult: Number(j.mult) || 0,
          kind: j.kind || 'FIXED',                       // v5.2
          increment_pct: Number(j.increment_pct) || 0,   // v5.2
          must_hit_by: Number(j.must_hit_by) || 0,       // v5.2
          trigger_desc: td,                              // v6.2 #4:含自動組合
        };
      });
    return rows.length ? rows : null;
  }

  function defaultMeta(config, inherit = true) {
    const cfg = config || collectConfig();
    // 各模式一句話描述（連動開啟時預帶 modes.notes;關閉則留白由企劃手填）
    const modeDesc = {};
    cfg.modes.forEach(m => { if (m.mode) modeDesc[m.mode] = inherit ? (m.notes || '') : ''; });
    // 每模式演出 / 文案描述欄(純文件敘述,不進 A.xlsx、不接引擎)
    const modeMarquee = {};   // 跑馬燈文字
    const modeEvent = {};     // 事件規劃(預報 / 聽牌演出)
    const modeQuickstop = {}; // 快停 / 跳過機制
    cfg.modes.forEach(m => { if (m.mode) { modeMarquee[m.mode] = ''; modeEvent[m.mode] = ''; modeQuickstop[m.mode] = ''; } });
    // 各特殊圖示行為（預設空白）
    const specialBehavior = {};
    cfg.specialSyms.forEach(s => { specialBehavior[_symId(s)] = ''; });
    // FG 局數預帶第一個非起始模式的 spin_count
    const fgMode = cfg.modes.find(m => m.mode && m.mode !== cfg.derived.startingMode && (Number(m.spin_count) || 0) > 0);
    return {
      game_name: '',
      competitor_url: '',
      theme_pick: '',
      style_pick: '',
      flags: { wild: cfg.specialSyms.some(s => s.is_wild), payline: false, symbol_count: false, special: cfg.specialSyms.length > 0,
               has_jackpot: true },   // v6.4 / 缺漏#5:預設有彩池段(向後相容);關閉則跳過 JACKPOT 段
      inherit_config: true,   // v6.2 文件生成#0:是否自動帶入各分頁設定(連動);關閉則只用手填,基本資訊仍跟全域
      numbers_are_placeholder: false,   // v8.3 / R1 F-21:數值為佔位旗標(公版化流程;文件自動標註「佔位」)
      payline_desc: '',
      payline_method: PAYLINE_METHODS[0],   // v6.2 文件生成#1:連線方式(下拉)
      refill_method: REFILL_METHODS[0],      // v6.2:補盤方式(下拉)
      scroll_main: SCROLL_METHODS[0],        // v6.2:滾動方式-主盤
      scroll_sub: '',                        // v6.2:滾動方式-副盤(無副盤可留空)
      score_formula: SCORE_FORMULAS[3],
      game_overview: '',
      // v6.4 / 缺漏#9+#10:合規數值披露(全空 = 不輸出披露表)。max_win 為字串(可含區間)。
      disclosure: { rtp: '', rtp_ante: '', volatility: '', hit_rate: '', max_win: '', max_win_note: '' },
      // v6.4 / 缺漏#1:倍數疊加方式(文件層預設;符號可帶 s.mult_stack_mode 覆寫)。''=不標示。
      mult_stack_mode: '',                   // '' | 'MUL'(相乘) | 'ADD'(相加)
      // v6.4 / 缺漏#2:各模式進度倍數重置範圍。{ [mode]: 'CASCADE'|'SPIN'|'FEATURE' }。空=沿用舊布林敘述。
      mode_reset_scope: {},
      mode_desc: modeDesc,
      mode_marquee: modeMarquee,
      mode_event: modeEvent,
      mode_quickstop: modeQuickstop,
      special_behavior: specialBehavior,
      jackpot: {
        // v5.1:連動開啟時優先帶入設定檔 JP(13_Jackpots);關閉或無 JP 則退回通用四級樣板。
        rows: (inherit ? _jackpotRowsFromConfig() : null) || [
          { name: 'GRAND', mult: 1800 },
          { name: 'MAJOR', mult: 300 },
          { name: 'MINOR', mult: 30 },
          { name: 'MINI',  mult: 10 },
        ],
        note: '',
      },
      freegame: {
        trigger: '',
        enter_board: '',
        exit_board: '',
        min_spins: fgMode ? (Number(fgMode.spin_count) || 0) : 0,
        add_spins: '有',
        cap: '無',
        cap_value: '',
        // v6.4 / 缺漏#4:scatter-pay 觸發給付(觸發即付,非連線賠付)。[{count, pay}] 空=不輸出。
        trigger_pays: [],
      },
    };
  }

  function loadMeta() {
    const stored = _readLS(LS_DOCMETA_KEY, null);
    if (stored) return mergeMeta(stored, collectConfig());
    return defaultMeta();
  }
  function saveMeta(meta) {
    try { localStorage.setItem(LS_DOCMETA_KEY, JSON.stringify(meta)); return true; }
    catch (e) { console.warn('[docgen] saveMeta failed:', e); return false; }
  }

  // 補齊：config 變動後，meta 可能缺少新模式 / 新特殊圖示的鍵
  function mergeMeta(meta, config) {
    const cfg = config || collectConfig();
    const inherit = meta && meta.inherit_config === false ? false : true;   // v6.2 #0
    const base = defaultMeta(cfg, inherit);
    const out = Object.assign({}, base, meta);
    out.flags = Object.assign({}, base.flags, meta.flags || {});
    out.jackpot = Object.assign({}, base.jackpot, meta.jackpot || {});
    // v6.4 / 缺漏#5:has_jackpot===false 時容許空 rows(無彩池),不再強塞四級樣板;
    //   仍為 true(預設/未設)時維持舊行為:空 rows 回退樣板。
    if (out.flags.has_jackpot !== false) {
      if (!Array.isArray(out.jackpot.rows) || !out.jackpot.rows.length) out.jackpot.rows = base.jackpot.rows;
    } else if (!Array.isArray(out.jackpot.rows)) {
      out.jackpot.rows = [];
    }
    out.freegame = Object.assign({}, base.freegame, meta.freegame || {});
    if (!Array.isArray(out.freegame.trigger_pays)) out.freegame.trigger_pays = [];   // v6.4 #4
    // v6.4 / 缺漏#9+#10:披露物件補欄(保留既有手填)
    out.disclosure = Object.assign({}, base.disclosure, meta.disclosure || {});
    // v6.4 / 缺漏#2:per-mode 重置範圍(保留既有)
    out.mode_reset_scope = Object.assign({}, base.mode_reset_scope, meta.mode_reset_scope || {});
    // 模式描述：保留既有、補新模式
    out.mode_desc = Object.assign({}, base.mode_desc, meta.mode_desc || {});
    out.mode_marquee = Object.assign({}, base.mode_marquee, meta.mode_marquee || {});
    out.mode_event = Object.assign({}, base.mode_event, meta.mode_event || {});
    out.mode_quickstop = Object.assign({}, base.mode_quickstop, meta.mode_quickstop || {});
    // 特殊圖示行為：保留既有、補新圖示（移除已不存在的留著也無妨，匯出時只取現存）
    out.special_behavior = Object.assign({}, base.special_behavior, meta.special_behavior || {});
    return out;
  }

  // ════════════════════════════════════════════════════════════════════
  //  企劃文件（Excel）— 混合版：總覽還原 + 明細分頁
  // ════════════════════════════════════════════════════════════════════
  const FONT = '微軟正黑體';
  const C = {
    band:   '1F3864',  // 深藍標題帶（仿現有企劃書）
    bandFg: 'FFFFFF',
    label:  '2E4D7B',  // 次級標籤帶
    labelFg:'FFFFFF',
    value:  'FFFFFF',
    valueFg:'2B2A27',
    todo:   'FFF3D6',  // 待填底色
    todoFg: 'B87C10',
    th:     'D9E1F2',  // 表頭淺藍
    thFg:   '1F3864',
    special:'FCE4D6',  // 特殊圖示段表頭淺橘
    border: 'BFBFBF',
  };
  function _argb(h) { return 'FF' + h; }
  function _bd() {
    const s = { style: 'thin', color: { argb: _argb(C.border) } };
    return { top: s, left: s, bottom: s, right: s };
  }
  function _cell(ws, r, c, val, o) {
    o = o || {};
    const cell = ws.getCell(r, c);
    cell.value = (val == null) ? '' : val;
    cell.font = { name: FONT, bold: !!o.bold, size: o.size || 10, color: { argb: _argb(o.fg || C.valueFg) } };
    cell.alignment = { horizontal: o.h || 'left', vertical: 'middle', wrapText: o.wrap !== false };
    if (o.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _argb(o.bg) } };
    if (o.border !== false) cell.border = _bd();
    return cell;
  }

  async function buildPlanXlsxBuffer(metaIn) {
    if (typeof window.ExcelJS === 'undefined') throw new Error('ExcelJS 未載入');
    const cfg = collectConfig();
    const meta = mergeMeta(metaIn || loadMeta(), cfg);
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'SlotPlanner Pro';
    wb.created = new Date();

    const NCOL = 6;          // A..F
    const TODO = '【待填】';

    // ── Sheet 1：企劃總覽 ──
    const ws = wb.addWorksheet('企劃總覽');
    ws.columns = [{ width: 14 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
    let R = 1;

    function band(text) {
      ws.mergeCells(R, 1, R, NCOL);
      _cell(ws, R, 1, text, { bold: true, bg: C.band, fg: C.bandFg, size: 12, h: 'left' });
      ws.getRow(R).height = 24;
      R++;
    }
    // 標籤 (col1) + 值 (col2..NCOL 合併)
    function kv(label, value, opt) {
      opt = opt || {};
      _cell(ws, R, 1, label, { bold: true, bg: C.label, fg: C.labelFg, h: 'left' });
      ws.mergeCells(R, 2, R, NCOL);
      const empty = (value == null || value === '');
      _cell(ws, R, 2, empty ? TODO : value, {
        bg: empty ? C.todo : C.value,
        fg: empty ? C.todoFg : C.valueFg,
        h: 'left',
      });
      if (opt.height) ws.getRow(R).height = opt.height;
      R++;
    }

    const m = meta;
    band(`${m.game_name || '（未命名遊戲）'}　企劃總覽`);

    // 基本資訊
    band('基本資訊');
    kv('競品網址', m.competitor_url);
    kv('主題選用', m.theme_pick);
    kv('風格選用', m.style_pick);
    kv('盤面(H×W)', cfg.derived.gridStr
      ? `本遊戲為 ${cfg.derived.gridStr} ${m.style_pick ? m.style_pick + ' ' : ''}特殊盤面`
      : '');
    const flagStr = [
      `百搭 ${m.flags.wild ? '✓' : '✗'}`,
      `連線 ${m.flags.payline ? '✓' : '✗'}`,
      `圖示數量 ${m.flags.symbol_count ? '✓' : '✗'}`,
      `特殊 ${m.flags.special ? '✓' : '✗'}`,
    ].join('　');
    kv('屬性勾選', flagStr);

    // 連線 / 計分
    band('連線 / 計分');
    // v6.4 / 缺漏#3:SCATTER/CLUSTER 輸出賠付方式而非誤導的連線種數;CLUSTER 補最小群組。
    let waysLine;
    if (cfg.derived.isScatterLike) {
      const cm = (cfg.derived.payType === 'CLUSTER' && cfg.derived.clusterMin)
        ? `；最小群組 ${cfg.derived.clusterMin}` : '';
      waysLine = `連線型態：${cfg.derived.payTypeLabel}。賠付方式：${cfg.derived.payMethodDesc}${cm}`;
    } else if (cfg.derived.isWaysLike) {
      waysLine = cfg.derived.waysCount
        ? `連線型態：${cfg.derived.payTypeLabel}，共 ${cfg.derived.waysCount} 種連線方式。`
        : `連線型態：${cfg.derived.payTypeLabel}。`;
    } else {
      // 修正:LINE 款不印 ways 數(原本無 isWaysLike gate,LINE 也印「共 N 種連線方式」);改印得分線數(有設定才印)。
      waysLine = cfg.paylines.length
        ? `連線型態：${cfg.derived.payTypeLabel}，共 ${cfg.paylines.length} 條得分線。`
        : `連線型態：${cfg.derived.payTypeLabel}。`;
    }
    const plMethod = [m.payline_method, m.payline_desc].filter(Boolean).join('\n');
    kv('連線方式', plMethod ? `${waysLine}\n${plMethod}` : waysLine, { height: 36 });
    if (m.refill_method) kv('補盤方式', m.refill_method, { height: 30 });
    const scrollLine = [m.scroll_main && `主盤：${m.scroll_main}`, m.scroll_sub && `副盤：${m.scroll_sub}`].filter(Boolean).join('　');
    if (scrollLine) kv('滾動方式', scrollLine);
    kv('得分規則', m.score_formula);

    // 合規數值披露（v6.4 / 缺漏#9+#10）— 任一欄有值才建段
    {
      const d = m.disclosure || {};
      const hasAny = ['rtp', 'rtp_ante', 'volatility', 'hit_rate', 'max_win', 'max_win_note'].some(k => String(d[k] ?? '').trim() !== '' && d[k] !== 0);
      if (hasAny) {
        band('合規數值披露');
        if (Number(d.rtp)) kv('理論 RTP', d.rtp + '%');
        if (Number(d.rtp_ante)) kv('加押(Ante) RTP', d.rtp_ante + '%');
        if (String(d.volatility ?? '').trim() !== '') kv('波動度', d.volatility);
        if (Number(d.hit_rate)) kv('命中率', d.hit_rate + '%');
        if (String(d.max_win ?? '').trim() !== '') {
          const note = String(d.max_win_note ?? '').trim() ? `（${d.max_win_note}）` : '';
          kv('最大贏分', d.max_win + note);
        }
        // v8.20 / G 界-3:結構化封頂(-1=無上限、>0=硬上限;與 max_win 字串並存)
        {
          const cap = Number((m.global || {}).max_win_cap);
          if (Number.isFinite(cap) && cap !== 0) {
            kv('最大贏分封頂', cap < 0 ? '明示無上限' : cap.toLocaleString('en-US') + '× 注額（硬上限）');
          }
        }
      }
    }

    // 遊戲概述 / 模式
    band('遊戲概述 / 模式');
    kv('遊戲概述', m.game_overview, { height: 30 });
    cfg.modes.forEach(md => {
      if (!md.mode) return;
      const spins = (Number(md.spin_count) || 0) > 0 ? `（${md.spin_count} 局）` : '';
      kv(`模式 ${md.mode}`, (m.mode_desc[md.mode] || '') + (spins ? ' ' + spins : ''));
    });

    // 圖示概況
    band('圖示概況');
    kv('一般圖示', cfg.normalSyms.length
      ? `${cfg.normalSyms.length} 個：${cfg.normalSyms.map(s => s.name || _symId(s)).join('、')}`
      : '', { height: 30 });
    kv('特殊圖示', cfg.specialSyms.length
      ? `${cfg.specialSyms.length} 個：${cfg.specialSyms.map(s => `${s.name || _symId(s)}(${_symRole(s) || '特殊'})`).join('、')}`
      : '');

    // JACKPOT（v6.4 / 缺漏#5:has_jackpot===false 視為無彩池,整段跳過）
    if (m.flags.has_jackpot !== false) {
      band('JACKPOT');
      const jr = m.jackpot.rows || [];
      // 名稱列
      _cell(ws, R, 1, '名稱', { bold: true, bg: C.th, fg: C.thFg, h: 'center' });
      jr.forEach((j, i) => { if (i + 2 <= NCOL) _cell(ws, R, i + 2, j.name, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }); });
      R++;
      // 倍數列(累積 JP 此列語義為起始彩池)
      _cell(ws, R, 1, '倍數', { bold: true, bg: C.label, fg: C.labelFg, h: 'center' });
      jr.forEach((j, i) => { if (i + 2 <= NCOL) _cell(ws, R, i + 2, j.mult, { h: 'center' }); });
      R++;
      // v5.2:有 kind 資訊時補類型列;有累積 JP 時補抽成/必開列
      const hasKind = jr.some(j => j.kind);
      const hasProg = jr.some(j => j.kind === 'PROGRESSIVE');
      if (hasKind) {
        _cell(ws, R, 1, '類型', { bold: true, bg: C.label, fg: C.labelFg, h: 'center' });
        jr.forEach((j, i) => { if (i + 2 <= NCOL) _cell(ws, R, i + 2, j.kind === 'PROGRESSIVE' ? '累積' : '固定', { h: 'center' }); });
        R++;
      }
      if (hasProg) {
        _cell(ws, R, 1, '抽成 %/注', { bold: true, bg: C.label, fg: C.labelFg, h: 'center' });
        jr.forEach((j, i) => { if (i + 2 <= NCOL) _cell(ws, R, i + 2, j.kind === 'PROGRESSIVE' ? (j.increment_pct || 0) : '—', { h: 'center' }); });
        R++;
        _cell(ws, R, 1, '必開上限', { bold: true, bg: C.label, fg: C.labelFg, h: 'center' });
        jr.forEach((j, i) => { if (i + 2 <= NCOL) _cell(ws, R, i + 2, j.kind === 'PROGRESSIVE' ? (j.must_hit_by ? j.must_hit_by + 'x' : '無') : '—', { h: 'center' }); });
        R++;
      }
      kv('JACKPOT 備註', m.jackpot.note);
    }

    // FREE GAME
    band('FREE GAME');
    kv('觸發方式', m.freegame.trigger, { height: 30 });
    // v6.4 / 缺漏#4:觸發給付(觸發即付)
    {
      const tp = (m.freegame.trigger_pays || []).filter(t => t && (Number(t.count) || Number(t.pay)));
      if (tp.length) kv('觸發給付', tp.map(t => `${t.count}個→${t.pay}x`).join('、'));
    }
    kv('進入盤面顯示', m.freegame.enter_board);
    kv('結束盤面顯示', m.freegame.exit_board);
    kv('盤面(H×W)', cfg.derived.gridStr);
    // v6.4 / 缺漏#3:SCATTER/CLUSTER 不輸出連線種數,改賠付方式
    // 修正:FG 段「連線方式」亦需 gate isWaysLike(原本 LINE 款也印 ways 數);LINE 改印得分線數。
    kv('連線方式', cfg.derived.isScatterLike
      ? (cfg.derived.payMethodDesc || '')
      : (cfg.derived.isWaysLike
          ? (cfg.derived.waysCount ? `共 ${cfg.derived.waysCount} 種連線方式` : '')
          : (cfg.paylines.length ? `共 ${cfg.paylines.length} 條得分線` : '')));
    kv('局數設定', (Number(m.freegame.min_spins) || 0) > 0 ? `最少 ${m.freegame.min_spins} 局 FREE SPINS` : '');
    kv('加局', m.freegame.add_spins);
    kv('上限', m.freegame.cap === '有' ? `有（${m.freegame.cap_value || TODO}）` : m.freegame.cap);

    // ── Sheet 2：圖示賠付明細（v5.6:動態連線數欄，依實際 pay_rows 決定）──
    const wsS = wb.addWorksheet('圖示賠付明細');
    // 收集所有符號出現過的連線數（由大到小排序），動態建欄
    // 修正:改用「賠付區間 band」為欄鍵(同 buildMechMarkdown 的 _bandKey),使區間同賠
    //   (如 8–9 / 10–11 / 12–30)在 Excel 與 MD 一致;原本只取 r.count、忽略 count_to,
    //   導致分段賠付在 Excel 只顯示單點欄(12 / 10 / 8…)。
    const bandFrom = new Map();   // band key -> from(count,排序用)
    cfg.symbols.forEach(s => _symPayRows(s).forEach(r => {
      const k = _bandKey(r);
      if (!bandFrom.has(k)) bandFrom.set(k, Number(r.count) || 0);
    }));
    const payCounts = [...bandFrom.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (payCounts.length === 0) payCounts.push('5', '4', '3');   // 全空時給預設三欄
    // 欄位:編號 / 名稱 / 類型 / <各連線數> / 備註
    const NCOL_S = 3 + payCounts.length + 1;
    wsS.columns = [{ width: 8 }, { width: 18 }, { width: 12 },
                   ...payCounts.map(() => ({ width: 11 })), { width: 26 }];
    let SR = 1;
    function symHeader(title, bg) {
      wsS.mergeCells(SR, 1, SR, NCOL_S);
      _cell(wsS, SR, 1, title, { bold: true, bg: C.band, fg: C.bandFg, size: 11 });
      SR++;
      _cell(wsS, SR, 1, '編號', { bold: true, bg, fg: C.thFg, h: 'center' });
      _cell(wsS, SR, 2, '名稱', { bold: true, bg, fg: C.thFg, h: 'center' });
      _cell(wsS, SR, 3, '類型', { bold: true, bg, fg: C.thFg, h: 'center' });
      payCounts.forEach((n, i) => _cell(wsS, SR, 4 + i, n + '連線', { bold: true, bg, fg: C.thFg, h: 'center' }));
      _cell(wsS, SR, NCOL_S, '備註', { bold: true, bg, fg: C.thFg, h: 'center' });
      SR++;
    }
    // P0-2:最少連線(min_match)註記 —— 僅連線型(LINE/WAYS),非 3 才標,寫入「備註」欄。
    //   缺欄 / NaN → 視為預設 3,不標。
    const _mmLineLike = !cfg.derived.isScatterLike;
    const _mmNote = (s) => {
      const raw = Number(s.min_match);
      const mm = (Number.isFinite(raw) && raw > 0) ? raw : 3;
      return (_mmLineLike && mm !== 3) ? `最少 ${mm} 連起賠` : '';
    };
    function symRow(s, role) {
      _cell(wsS, SR, 1, s.number !== '' && s.number != null ? s.number : '', { h: 'center' });
      _cell(wsS, SR, 2, s.name || _symId(s));
      _cell(wsS, SR, 3, role || (s.type || ''), { h: 'center' });
      const payByN = {};
      _symPayRows(s).forEach(r => { payByN[_bandKey(r)] = r.pay; });   // 修正:以 band key 為鍵
      payCounts.forEach((n, i) => _cell(wsS, SR, 4 + i, payByN[n] != null ? payByN[n] : '—', { h: 'center' }));
      _cell(wsS, SR, NCOL_S, _mmNote(s));
      SR++;
    }
    symHeader('一般圖示', C.th);
    cfg.normalSyms.forEach(s => symRow(s, ''));
    SR++;
    symHeader('特殊圖示', C.special);
    cfg.specialSyms.forEach(s => {
      const role = _symRole(s) || '特殊';
      symRow(s, role);
      const beh = m.special_behavior[_symId(s)];
      if (beh) {
        wsS.mergeCells(SR, 1, SR, NCOL_S);
        _cell(wsS, SR, 1, `↳ ${s.name || _symId(s)} 行為：${beh}`, { wrap: true, fg: C.todoFg });
        wsS.getRow(SR).height = 30;
        SR++;
      }
    });

    // ── Sheet 2b：符號家族(P0-3;ANY BAR 型混合賠付)。僅在有家族時建 sheet。 ──
    {
      const groups = Array.isArray(cfg.symbolGroups)
        ? cfg.symbolGroups.filter(gp => String(gp.group_id || '').trim()) : [];
      if (groups.length) {
        const wsG = wb.addWorksheet('符號家族');
        wsG.columns = [{ width: 14 }, { width: 18 }, { width: 30 },
                       { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 },
                       { width: 12 }, { width: 14 }, { width: 26 }, { width: 34 }];
        let GR = 1;
        wsG.mergeCells(GR, 1, GR, 11);
        _cell(wsG, GR, 1, '符號家族 / 混合賠付（ANY BAR 型；成員亦保留自身賠率時，混合走家族賠、同款走個別賠，取較高者）',
          { bold: true, bg: C.band, fg: C.bandFg, size: 11 });
        GR++;
        ['家族 ID', '顯示名', '成員符號', '3 連', '4 連', '5 連', '6 連', '保留個別賠', '生效模式', '備註', '各模式覆寫']
          .forEach((h, i) => _cell(wsG, GR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
        GR++;
        groups.forEach(gp => {
          const gid = String(gp.group_id).trim();
          const members = (cfg.symbols || [])
            .filter(s => String(s.group_id || '').trim() === gid)
            .map(s => s.name || _symId(s));
          const pt = (gp.pay_table && typeof gp.pay_table === 'object') ? gp.pay_table : {};
          const payN = (n) => { const v = (gp['pay_' + n + 'x'] != null) ? gp['pay_' + n + 'x'] : pt[n]; return Number(v) || 0; };
          const msc = String(gp.mode_scope || '').trim();
          const pbm = (gp.pay_by_mode && typeof gp.pay_by_mode === 'object') ? gp.pay_by_mode : {};
          const pbmTxt = Object.keys(pbm).map(mk => {
            const row = pbm[mk] || {};
            const parts = [3, 4, 5, 6].filter(n => Number(row['pay_' + n + 'x']) > 0).map(n => `${n}連×${Number(row['pay_' + n + 'x'])}`);
            return parts.length ? `${mk}：${parts.join('、')}` : '';
          }).filter(Boolean).join('；');
          _cell(wsG, GR, 1, gid, { h: 'center' });
          _cell(wsG, GR, 2, (gp.display_name && String(gp.display_name).trim()) || gid);
          _cell(wsG, GR, 3, members.length ? members.join('、') : '（尚未指定成員）', { wrap: true });
          [3, 4, 5, 6].forEach((n, i) => { const p = payN(n); _cell(wsG, GR, 4 + i, p > 0 ? p : '—', { h: 'center' }); });
          _cell(wsG, GR, 8, gp.members_keep_individual !== false ? '是' : '否', { h: 'center' });
          _cell(wsG, GR, 9, (msc && msc !== 'ALL') ? msc : '全部', { h: 'center' });
          _cell(wsG, GR, 10, gp.notes ? String(gp.notes) : '', { wrap: true });
          _cell(wsG, GR, 11, pbmTxt || '（無）', { wrap: true });
          GR++;
        });
      }
    }

    // ── Sheet 3：模式明細 ──
    const wsM = wb.addWorksheet('模式明細');
    // v8.5 / R3:尾端 additive 加「玩家擇一 / Hold&Win Respin」兩欄(前 9 欄不動)
    // v8.7 / R6 A-2:再尾端加「賠付覆寫」欄(前 11 欄不動)
    wsM.columns = [{ width: 10 }, { width: 32 }, { width: 10 }, { width: 12 }, { width: 30 },
                   { width: 22 }, { width: 16 }, { width: 18 }, { width: 14 },
                   { width: 14 }, { width: 30 }, { width: 12 }];
    ['模式', '觸發條件', '局數', '繼承全域', '說明', '倍數重置範圍', '倍數疊加', '封頂 / 上限', '玩法',
     '玩家擇一', 'Hold&Win Respin', '賠付覆寫'].forEach((h, i) =>
      _cell(wsM, 1, i + 1, h, { bold: true, bg: C.band, fg: C.bandFg, h: 'center' }));
    cfg.modes.forEach((md, idx) => {
      const r = idx + 2;
      _cell(wsM, r, 1, md.mode, { bold: true, h: 'center' });
      _cell(wsM, r, 2, md.trigger_condition || (md.mode === cfg.derived.startingMode ? '（起始模式）' : ''));
      _cell(wsM, r, 3, md.spin_count || 0, { h: 'center' });
      _cell(wsM, r, 4, md.inherit_globals ? '是' : '否', { h: 'center' });
      _cell(wsM, r, 5, m.mode_desc[md.mode] || md.notes || '');
      // v7.12:玩法設定(規格描述;本工具不執行、不算 RTP)
      _cell(wsM, r, 6, _modeResetDesc(md), { h: 'center' });
      _cell(wsM, r, 7, _modeStackDesc(md), { h: 'center' });
      _cell(wsM, r, 8, _modeCapDesc(md), { h: 'center' });
      // v7.14:玩法種類(SPIN / bonus 小遊戲)
      _cell(wsM, r, 9, _modeKindDesc(md), { h: 'center' });
      _cell(wsM, r, 10, _modeChoiceDesc(md), { h: 'center' });   // v8.5 R3
      _cell(wsM, r, 11, _modeRespinDesc(md));                       // v8.5 R3
      _cell(wsM, r, 12, (md.pay_type_override || '').toUpperCase() || '—', { h: 'center' });   // v8.7 R6 A-2
    });

    // ── Sheet 4：機制備註 ──
    const wsX = wb.addWorksheet('機制備註');
    wsX.columns = [{ width: 14 }, { width: 44 }, { width: 16 }, { width: 28 }];
    let XR = 1;
    function xBand(t) { wsX.mergeCells(XR, 1, XR, 4); _cell(wsX, XR, 1, t, { bold: true, bg: C.band, fg: C.bandFg, size: 11 }); XR++; }
    xBand(cfg.paylines.length ? `中獎線 / 路徑（共 ${cfg.paylines.length} 條）` : '中獎線 / 路徑');
    ['Line_ID', 'Path', 'Direction', '備註'].forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
    XR++;
    const plDir = (cfg.global && cfg.global.payline_direction) || (cfg.global && cfg.global.ways_direction) || 'LTR';
    if (cfg.paylines.length) {
      // v7.5-B:中獎線 ASCII 示意(僅逐線盤面;WAYS 不繪)。與 MD 共用 renderer。
      const plGeom = cfg.derived.isWaysLike ? null : _mainBoardGeom(cfg.layout);
      cfg.paylines.forEach(pl => {
        _cell(wsX, XR, 1, pl.line_id, { h: 'center' });
        _cell(wsX, XR, 2, pl.path || '');
        _cell(wsX, XR, 3, plDir, { h: 'center' });
        _cell(wsX, XR, 4, pl.notes || '');
        XR++;
        if (plGeom) {
          const pts = _parsePathPoints(pl.path);
          const art = pts.length ? _renderPaylineAscii(pts, plGeom).join('\n') : '（無有效路徑座標）';
          wsX.mergeCells(XR, 1, XR, 4);
          const cell = _cell(wsX, XR, 1, art, { wrap: true, fg: C.thFg });
          cell.font = { name: 'Consolas', size: 10, color: { argb: _argb(C.thFg) } };  // 等寬字對齊網格
          cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
          wsX.getRow(XR).height = Math.max(16, (plGeom.rowMax + 1) * 15);
          XR++;
        }
      });
    } else {
      wsX.mergeCells(XR, 1, XR, 4);
      _cell(wsX, XR, 1, cfg.derived.isWaysLike ? '（全路徑模式，無逐線定義）' : '（無中獎線資料）', { fg: C.todoFg });
      XR++;
    }
    XR++;
    xBand('硬約束');
    ['ID', '類型', '對象 / 設定', '備註'].forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
    XR++;
    if (cfg.constraints.length) {
      cfg.constraints.forEach(ct => {
        _cell(wsX, XR, 1, ct.constraint_id, { h: 'center' });
        _cell(wsX, XR, 2, ct.ctype || '', { h: 'center' });
        _cell(wsX, XR, 3, [ct.symbol_id, ct.reels_allowed, ct.threshold].filter(x => x !== '' && x != null).join(' / '));
        _cell(wsX, XR, 4, ct.notes || '');
        XR++;
      });
    } else {
      wsX.mergeCells(XR, 1, XR, 4);
      _cell(wsX, XR, 1, '（無硬約束）', { fg: C.todoFg });
      XR++;
    }

    // v8.8 / R4 B-6:格子屬性(有資料才建表)
    if (Array.isArray(cfg.cellAttrs) && cfg.cellAttrs.length) {
      const _al = { MULT: '固定格乘數', ENHANCER: '強化格', FRAME: '火框', GOLD: '金框格', CUSTOM: '自訂' };
      XR++;
      xBand('格子屬性（位置型）');
      ['ID', '位置', '型式', '值', '模式', '備註'].forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
      XR++;
      cfg.cellAttrs.forEach(ca => {
        if (!ca || !String(ca.attr_id || '').trim()) return;
        _cell(wsX, XR, 1, ca.attr_id, { h: 'center' });
        _cell(wsX, XR, 2, `(R${Number(ca.reel) || '?'}, ${Number(ca.row) || '?'})`, { h: 'center' });
        _cell(wsX, XR, 3, _al[String(ca.attr || 'MULT').toUpperCase()] || ca.attr, { h: 'center' });
        _cell(wsX, XR, 4, (ca.value || '').trim() || '—', { h: 'center' });
        _cell(wsX, XR, 5, (ca.mode_scope && ca.mode_scope !== 'ALL') ? ca.mode_scope : '全部', { h: 'center' });
        _cell(wsX, XR, 6, ca.notes || '');
        XR++;
      });
    }

    // v7.11:產牌限制 / 生成期約束(有資料才建表)
    if (Array.isArray(cfg.genLimits) && cfg.genLimits.length) {
      const _zl = (z) => {
        const zs = String(z || 'MAIN');
        if (zs === 'MAIN') return '主盤整體';
        if (zs.startsWith('SUB:'))   return 'R' + zs.slice(4) + ' 副輪';
        if (zs.startsWith('PANEL:')) return '副盤 ' + zs.slice(6);
        return zs;
      };
      XR++;
      xBand('產牌限制 / 生成期約束');
      ['ID', '符號', '區域', '下限', '上限', '模式', '備註'].forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
      XR++;
      cfg.genLimits.forEach(gl => {
        if (!gl || !gl.limit_id) return;
        const minV = (gl.min_count != null && gl.min_count !== '' && Number(gl.min_count) > 0) ? gl.min_count : '—';
        const maxV = (gl.max_count != null && gl.max_count !== '') ? gl.max_count : '—';
        _cell(wsX, XR, 1, gl.limit_id, { h: 'center' });
        _cell(wsX, XR, 2, gl.symbol_id || '', { h: 'center' });
        _cell(wsX, XR, 3, _zl(gl.zone), { h: 'center' });
        _cell(wsX, XR, 4, minV, { h: 'center' });
        _cell(wsX, XR, 5, maxV, { h: 'center' });
        _cell(wsX, XR, 6, (gl.mode_scope && gl.mode_scope !== 'ALL') ? gl.mode_scope : '全部', { h: 'center' });
        _cell(wsX, XR, 7, gl.notes || '');
        XR++;
      });
    }

    // ── Sheet 5：數值機制（v5.6:投注結構 / 倍數系統 / 金幣面額）──
    //   僅在有對應設定時才建表，避免空白頁
    const bc = cfg.betConfig || {};
    const mpc = cfg.multipliers || {};
    const cvc = cfg.coinValues || {};
    // v6.3:已遷移時倍數/彩金以「符號」為單一真相;未遷移才回退 legacy 物件。
    const smv = _symbolMultView(cfg);
    // v8.6 / R5:RTP 版本 / 比倍有資料時也要輸出商業 band(不被加押/購買開關擋住)
    const _hasRV  = Array.isArray(bc.rtp_variants) && bc.rtp_variants.some(v => v && String(v.variant || '').trim());
    const _hasGm  = !!(cfg.gamble && cfg.gamble.enabled);
    const hasBet  = bc.ante_bet_enabled || (bc.buy_feature_enabled && Array.isArray(bc.buy_features) && bc.buy_features.length) || _hasRV || _hasGm;
    const hasMul  = smv.migrated ? (smv.multSyms.length > 0)
                                 : (mpc.wild_mult_enabled || mpc.progress_enabled || mpc.random_enabled);
    const hasCoin = smv.migrated ? (smv.prizeSyms.length > 0)
                                 : (cvc.enabled && Array.isArray(cvc.denominations) && cvc.denominations.length);
    if (hasBet || hasMul || hasCoin) {
      const wsV = wb.addWorksheet('數值機制');
      wsV.columns = [{ width: 18 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 30 }];
      let VR = 1;
      const vBand = (t) => { wsV.mergeCells(VR, 1, VR, 5); _cell(wsV, VR, 1, t, { bold: true, bg: C.band, fg: C.bandFg, size: 11 }); VR++; };
      const vHead = (arr) => { arr.forEach((h, i) => _cell(wsV, VR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' })); VR++; };

      // 加押 / 購買
      if (hasBet) {
        vBand('加押 / 購買（Bet Config）');
        if (bc.ante_bet_enabled) {
          vHead(['Extra Bet', '成本倍數', '觸發倍率', '', '說明']);
          _cell(wsV, VR, 1, '啟用', { h: 'center' });
          _cell(wsV, VR, 2, '×' + (Number(bc.ante_bet_mult) || 0), { h: 'center' });
          _cell(wsV, VR, 3, '×' + (Number(bc.ante_bet_trigger_mult) || 0), { h: 'center' });
          _cell(wsV, VR, 5, bc.ante_bet_desc || '');
          VR++;
        }
        if (bc.buy_feature_enabled && Array.isArray(bc.buy_features) && bc.buy_features.length) {
          // v8.6 / R5:備註欄前插「檔位」語意 → 維持 5 欄版面,檔位併進備註欄前綴
          vHead(['Buy Feature', '目標模式', '成本×注額', 'RTP目標', '檔位 / 備註']);
          const _kindLabel = { DIRECT: '直接購買', BOOST_RATE: '提升觸發率', SUPER: '進階版' };
          bc.buy_features.forEach(f => {
            _cell(wsV, VR, 1, f.bf_id || '', { h: 'center' });
            _cell(wsV, VR, 2, f.target_mode || '', { h: 'center' });
            _cell(wsV, VR, 3, Number(f.cost_mult) || 0, { h: 'center' });
            _cell(wsV, VR, 4, (Number(f.rtp_target) || 0) + '%', { h: 'center' });
            _cell(wsV, VR, 5, `〔${_kindLabel[f.kind] || f.kind || '直接購買'}〕${f.notes || ''}`);
            VR++;
          });
          if (bc.ante_buy_exclusive) { _cell(wsV, VR, 1, '互斥', { h: 'center', bold: true }); _cell(wsV, VR, 5, '啟用加押時停用購買'); VR++; }
          if (bc.feature_drop_enabled) { _cell(wsV, VR, 1, 'Feature Drop', { h: 'center', bold: true }); _cell(wsV, VR, 5, bc.feature_drop_desc || '累積贏分折抵購買成本'); VR++; }
        }
        // v8.6 / R5 E-18:多市場 RTP 版本
        const _rvs = Array.isArray(bc.rtp_variants) ? bc.rtp_variants.filter(v => v && String(v.variant || '').trim()) : [];
        if (_rvs.length) {
          vHead(['RTP 版本', '目標 RTP', '注限', '', '備註']);
          _rvs.forEach(v => {
            _cell(wsV, VR, 1, v.variant, { h: 'center' });
            _cell(wsV, VR, 2, (Number(v.target_rtp) || 0) + '%', { h: 'center' });
            _cell(wsV, VR, 3, Number(v.max_bet) || '—', { h: 'center' });
            _cell(wsV, VR, 5, v.notes || '');
            VR++;
          });
        }
        // v8.6 / R5 E-16:比倍
        const gm = cfg.gamble || {};
        if (gm.enabled) {
          vHead(['比倍', '型式', '倍數', '次數/封頂', '說明']);
          const gtL = { CARD_COLOR: '猜牌色', CARD_SUIT: '猜花色', LADDER: '階梯', WHEEL: '轉輪', CUSTOM: '自訂' };
          _cell(wsV, VR, 1, '啟用', { h: 'center' });
          _cell(wsV, VR, 2, gtL[gm.gamble_type] || gm.gamble_type || '', { h: 'center' });
          _cell(wsV, VR, 3, '×' + (gm.win_mult_options || '2'), { h: 'center' });
          _cell(wsV, VR, 4, (Number(gm.max_rounds) > 0 ? `${gm.max_rounds} 次` : '無限') + (Number(gm.cap_mult) > 0 ? ` / 封頂 ×${gm.cap_mult}` : ''), { h: 'center' });
          {
            const stL = { WIN: '贏分', FREE_SPINS: '免費局', BONUS_ENTRY: 'bonus 資格', BONUS_LEVEL: 'bonus 等級' };
            const rwL = { MULTIPLY_WIN: '倍增贏分', ADD_SPINS: '加免費局', ENTER_BONUS: '進入 bonus', UPGRADE_LEVEL: '升級等級' };
            const st = String(gm.stake_type || 'WIN').toUpperCase();
            const rw = String(gm.reward_type || 'MULTIPLY_WIN').toUpperCase();
            const nc = (st !== 'WIN' || rw !== 'MULTIPLY_WIN') ? `賭 ${stL[st] || st}→${rwL[rw] || rw}` : '';
            const trg = String(gm.gamble_trigger || '').trim();
            _cell(wsV, VR, 5, [gm.type_desc, nc, trg ? `時機 ${trg}` : '', gm.applies_to === 'BELOW_LIMIT' ? `僅 <×${Number(gm.applies_limit) || 0} 可比` : '', gm.collect_anytime !== false ? '可隨時收下' : '', gm.notes].filter(Boolean).join('；'));
          }
          VR++;
        }
        VR++;
      }

      // 倍數系統
      if (hasMul) {
        if (smv.migrated) {
          // v6.3:符號版 — 列出每個帶倍數的符號的 ×N 與權重
          vBand('倍數系統（符號 ×N）');
          vHead(['符號', '倍數', '權重', '機率', '疊加方式']);
          smv.multSyms.forEach(s => {
            const vals = s.mult_values || [];
            const tot = vals.reduce((a, v) => a + (Number(v.weight) || 0), 0) || 1;
            const smLabel = _stackModeLabel(_symStackMode(s, m));   // v6.4 / 缺漏#1
            vals.forEach((v, i) => {
              _cell(wsV, VR, 1, i === 0 ? (s.name || _symId(s)) : '', {});
              _cell(wsV, VR, 2, '×' + (Number(v.mult) || 0), { h: 'center' });
              _cell(wsV, VR, 3, Number(v.weight) || 0, { h: 'center' });
              _cell(wsV, VR, 4, ((Number(v.weight) || 0) / tot * 100).toFixed(1) + '%', { h: 'center' });
              _cell(wsV, VR, 5, i === 0 ? smLabel : '', { h: 'center' });
              VR++;
            });
          });
          // 進度倍數仍可能存於各模式 progress_ladder(Q3 已移入模式)
          const ladModes = (cfg.modes || []).filter(md => Array.isArray(md.progress_ladder) && md.progress_ladder.length);
          if (ladModes.length) {
            vHead(['進度倍數', '模式', '階梯', '重置範圍', '']);   // v6.4 / 缺漏#2
            ladModes.forEach(md => {
              const scope = _resetScopeLabel((m.mode_reset_scope || {})[md.mode])
                || (md.progress_reset === false ? '不重置' : '重置');
              _cell(wsV, VR, 1, '', {});
              _cell(wsV, VR, 2, md.mode, { h: 'center' });
              _cell(wsV, VR, 3, md.progress_ladder.join(' → '), { h: 'center' });
              _cell(wsV, VR, 4, scope, { h: 'center' });
              VR++;
            });
          }
          VR++;
        } else {
          vBand('倍數系統（Multipliers）');
        if (mpc.wild_mult_enabled) {
          const vals = Array.isArray(mpc.wild_mult_values) ? mpc.wild_mult_values : [];
          if (vals.length) {
            vHead(['Wild 倍數', '倍數', '權重', '機率', '']);
            const tot = vals.reduce((a, v) => a + (Number(v.weight) || 0), 0) || 1;
            vals.forEach(v => {
              _cell(wsV, VR, 1, '', {});
              _cell(wsV, VR, 2, '×' + (Number(v.mult) || 0), { h: 'center' });
              _cell(wsV, VR, 3, Number(v.weight) || 0, { h: 'center' });
              _cell(wsV, VR, 4, ((Number(v.weight) || 0) / tot * 100).toFixed(1) + '%', { h: 'center' });
              VR++;
            });
          } else {
            vHead(['Wild 倍數', '固定值', '', '', '']);
            _cell(wsV, VR, 1, '啟用', { h: 'center' });
            _cell(wsV, VR, 2, '×' + (Number(mpc.wild_mult_fixed) || 0), { h: 'center' });
            VR++;
          }
        }
        if (mpc.progress_enabled) {
          vHead(['進度倍數', '模式', '階梯', '重置', '']);
          const lad = mpc.progress_ladders || {};
          Object.keys(lad).forEach(mode => {
            _cell(wsV, VR, 1, '', {});
            _cell(wsV, VR, 2, mode, { h: 'center' });
            _cell(wsV, VR, 3, Array.isArray(lad[mode]) ? lad[mode].join(' → ') : '', { h: 'center' });
            _cell(wsV, VR, 4, mpc.progress_reset_on_mode === false ? '不重置' : '重置', { h: 'center' });
            VR++;
          });
        }
        if (mpc.random_enabled) {
          const vals = Array.isArray(mpc.random_values) ? mpc.random_values : [];
          vHead(['隨機倍數', '倍數', '權重', '機率', '承載符號:' + (mpc.random_symbol_id || '—')]);
          const tot = vals.reduce((a, v) => a + (Number(v.weight) || 0), 0) || 1;
          vals.forEach(v => {
            _cell(wsV, VR, 1, '', {});
            _cell(wsV, VR, 2, '×' + (Number(v.mult) || 0), { h: 'center' });
            _cell(wsV, VR, 3, Number(v.weight) || 0, { h: 'center' });
            _cell(wsV, VR, 4, ((Number(v.weight) || 0) / tot * 100).toFixed(1) + '%', { h: 'center' });
            VR++;
          });
        }
        VR++;
        }
      }

      // 金幣面額
      if (hasCoin) {
        if (smv.migrated) {
          // v6.3:符號版 — 各帶 prize_values 的符號(面額 / 連結 JP / 各模式權重)
          vBand('彩金倍數 / 面額（符號 N×）');
          const modeNames = cfg.modes.map(md => md.mode).filter(Boolean);
          vHead(['符號', '面額×注額', '連結JP', ...modeNames.slice(0, 2).map(mn => 'W_' + mn)]);
          smv.prizeSyms.forEach(s => {
            (s.prize_values || []).forEach((pv, i) => {
              _cell(wsV, VR, 1, i === 0 ? (s.name || _symId(s)) : '', {});
              _cell(wsV, VR, 2, pv.link_jackpot ? '（依JP）' : (Number(pv.value) || 0), { h: 'center' });
              _cell(wsV, VR, 3, pv.link_jackpot || '—', { h: 'center' });
              modeNames.slice(0, 2).forEach((mn, j) => {
                const w = pv.weight_by_mode ? (Number(pv.weight_by_mode[mn]) || 0) : 0;
                _cell(wsV, VR, 4 + j, w, { h: 'center' });
              });
              VR++;
            });
          });
        } else {
        vBand('金幣面額（Hold&Win · 符號:' + (cvc.coin_symbol_id || 'COIN') + '）');
        const modeNames = cfg.modes.map(md => md.mode).filter(Boolean);
        vHead(['標籤 / 面額', '面額×注額', '連結JP', ...modeNames.slice(0, 2).map(mn => 'W_' + mn)]);
        cvc.denominations.forEach(d => {
          _cell(wsV, VR, 1, d.label || ('×' + (Number(d.value) || 0)), {});
          _cell(wsV, VR, 2, d.link_jackpot ? '（依JP）' : (Number(d.value) || 0), { h: 'center' });
          _cell(wsV, VR, 3, d.link_jackpot || '—', { h: 'center' });
          modeNames.slice(0, 2).forEach((mn, i) => {
            const w = d.weight_by_mode ? (Number(d.weight_by_mode[mn]) || 0) : 0;
            _cell(wsV, VR, 4 + i, w, { h: 'center' });
          });
          VR++;
        });
        }
      }
    }

    return await wb.xlsx.writeBuffer();
  }


  // ════════════════════════════════════════════════════════════════════
  //  公司格式企劃書（Excel，多分頁）— buildCompanyXlsxBuffer
  //  分頁/版式/色階/欄寬列高對齊公司企劃書慣例(自 8 份範例逐格抽取):
  //   · 每頁標籤色階:一般遊戲 2F5597(accent1-25%) / FREE GAME 1F3864(accent1-50%)
  //     / BONUS 1F4E79(accent5-50%) / 輪盤 2E75B6(accent5-25%)
  //   · 賠率表:區段帶 333F50(dk2-25%)+表頭 D6DCE4(dk2+80%)
  //   · 標籤=微軟正黑體14粗白置中;內容=12左靠;數量「N個」藍色粗體(圖示代替慣例)
  //   · 一般遊戲/FG/BONUS 內容自第17列起(1-16留白=logo圖區);賠率表自第9列起
  //  純描述,不執行不算 RTP。舊 buildPlanXlsxBuffer 不動。
  // ════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────
  //  v8.10:xlsx → xlsm 後處理(公司格式企劃書)
  //  xlsm 與 xlsx 的實質差異只有 zip 內 [Content_Types].xml 的 workbook
  //  content-type 宣告(+ 有巨集時的 vbaProject.bin)。此處產「無巨集 xlsm」:
  //  Excel 可正常開啟;之後拿到公司巨集時,於 TODO 處嵌入 vbaProject.bin 即可。
  // ─────────────────────────────────────────────────────────────
  function _xlsxToXlsmBuffer(xlsxArrayBuffer) {
    const ff = (typeof window !== 'undefined' && window.fflate) || (typeof fflate !== 'undefined' ? fflate : null);
    if (!ff) return null;   // fflate 未載入 → 呼叫端 fallback 純 xlsx
    const files = ff.unzipSync(new Uint8Array(xlsxArrayBuffer));
    const ctPath = '[Content_Types].xml';
    if (!files[ctPath]) return null;
    let ct = ff.strFromU8(files[ctPath]);
    ct = ct.replace(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
      'application/vnd.ms-excel.sheet.macroEnabled.main+xml'
    );
    files[ctPath] = ff.strToU8(ct);
    // TODO(巨集版):待取得公司 vbaProject.bin 後 —
    //   1. files['xl/vbaProject.bin'] = <該 bin 的 Uint8Array>
    //   2. [Content_Types].xml 加 <Override PartName="/xl/vbaProject.bin"
    //        ContentType="application/vnd.ms-office.vbaProject"/>
    //   3. xl/_rels/workbook.xml.rels 加 vbaProject relationship
    return ff.zipSync(files, { level: 6 }).buffer;
  }

  async function buildCompanyXlsxBuffer(metaIn) {
    if (typeof window.ExcelJS === 'undefined') throw new Error('ExcelJS 未載入');
    const cfg  = collectConfig();
    const meta = mergeMeta(metaIn || loadMeta(), cfg);
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'SlotPlanner Pro';
    wb.created = new Date();

    // ── 公司色票(Excel 標準色盤) ──
    const NG_C = '2F5597';    // 一般遊戲標籤(accent1 深25%)
    const FG_C = '1F3864';    // FREE GAME 標籤(accent1 深50%)
    const BN_C = '1F4E79';    // BONUS 標籤(accent5 深50%)
    const WH_C = '2E75B6';    // 輪盤標籤(accent5 深25%)
    const TB_C = '333F50';    // 賠率表區段帶(dk2 深25%)
    const TH_C = 'D6DCE4';    // 表頭列(dk2 淺80%)
    const TH_FG = '44546A';   // 表頭字色(dk2)
    const LB_C = 'BDD7EE';    // 淺藍表頭(accent5 淺60%)
    const ACC  = '4472C4';    // 特殊圖示名(accent1)
    const BLU  = '0000FF';    // 「N個」藍字(圖示代替慣例)
    const WIDE = 13;          // 內容尾欄(M)
    const START_R = 17;       // 敘述頁內容起始列(1-16 留白給 logo 圖)

    // ── 版式小工具 ──
    // 敘述頁欄寬(對齊公司:A=1.2 B=6.8 C=8.9 D=12.2 E=8.9 其餘預設)
    function descCols(ws) {
      const cols = [{ width: 1.2 }, { width: 6.8 }, { width: 8.9 }, { width: 12.2 }, { width: 8.9 }];
      for (let c = 6; c <= WIDE; c++) cols.push({ width: 8.43 });
      ws.columns = cols;
    }
    function label(ws, R, c0, c1, text, color, rows) {
      rows = rows || 1;
      if (rows > 1 || c1 > c0) ws.mergeCells(R, c0, R + rows - 1, c1);
      _cell(ws, R, c0, text, { bold: true, bg: color, fg: 'FFFFFF', h: 'center', size: 14 });
    }
    function value(ws, R, c0, c1, v, o) {
      o = o || {};
      if (c1 > c0) ws.mergeCells(R, c0, R, c1);
      _cell(ws, R, c0, v == null ? '' : v, { h: o.h || 'left', size: o.size || 12, bold: !!o.bold, fg: o.fg, bg: o.bg });
    }
    // 標籤(B:C 跨列) + 內容(D:M 每行一列)。回傳下一列。
    function descRow(ws, R, lab, val, color, o) {
      o = o || {};
      const vals = Array.isArray(val) ? val : [val];
      const rows = Math.max(1, vals.length);
      label(ws, R, 2, 3, lab, color, rows);
      for (let i = 0; i < rows; i++) {
        value(ws, R + i, 4, WIDE, vals[i]);
        ws.getRow(R + i).height = o.h || 28.5;
      }
      return R + rows;
    }
    // 同列雙標籤:主題選用(B:C|D:F) + 風格選用(G:H|I:M)
    function pairRow(ws, R, lab1, val1, lab2, val2, color) {
      label(ws, R, 2, 3, lab1, color);
      value(ws, R, 4, 6, val1);
      label(ws, R, 7, 8, lab2, color);
      value(ws, R, 9, WIDE, val2);
      ws.getRow(R).height = 28.5;
      return R + 1;
    }
    // 同列三標籤:局數設定(B:C|D:F) 加局(G:H|I) 上限(J|K:M)
    function tripleRow(ws, R, lab1, v1, lab2, v2, lab3, v3, color) {
      label(ws, R, 2, 3, lab1, color);
      value(ws, R, 4, 6, v1);
      label(ws, R, 7, 8, lab2, color);
      value(ws, R, 9, 9, v2, { h: 'center' });
      label(ws, R, 10, 10, lab3, color);
      value(ws, R, 11, WIDE, v3);
      ws.getRow(R).height = 28.5;
      return R + 1;
    }
    // 標籤 + 子標(D 藍粗) + 內容(E:M);用於特殊圖示說明/購買
    function descRow3(ws, R, lab, subs, color) {
      // subs: [{sub, val, subFg}] 多列;標籤跨列
      const rows = Math.max(1, subs.length);
      label(ws, R, 2, 3, lab, color, rows);
      subs.forEach((s, i) => {
        _cell(ws, R + i, 4, s.sub, { bold: true, fg: s.subFg || ACC, h: 'center', size: 12 });
        value(ws, R + i, 5, WIDE, s.val);
        ws.getRow(R + i).height = s.h || 28.5;
      });
      return R + rows;
    }
    // 每模式演出三欄(跑馬燈/事件規劃/快停跳過機制)。快停一律輸出。
    function modeExtras(ws, R, modeName, color) {
      const mq = (meta.mode_marquee && meta.mode_marquee[modeName]) || '';
      const ev = (meta.mode_event && meta.mode_event[modeName]) || '';
      const qs = (meta.mode_quickstop && meta.mode_quickstop[modeName]) || '';
      if (mq) R = descRow(ws, R, '跑馬燈文字', mq.split('\n'), color);
      if (ev) R = descRow(ws, R, '事件規劃', ev.split('\n'), color);
      R = descRow(ws, R, '快停/跳過機制', qs, color);
      return R;
    }
    // 產牌限制 mini 表(併入 NG / FG 頁)。limits 已依 scope 過濾。
    function genLimitBlock(ws, R, limits, color) {
      if (!limits.length) return R;
      const symName = {};
      cfg.symbols.forEach(s => { symName[_symId(s)] = s.name || _symId(s); });
      label(ws, R, 2, 3, '產牌限制', color, limits.length + 1);
      // 表頭
      ['符號', '區域', '下限', '上限'].forEach((h, i) => _cell(ws, R, 4 + i, h, { bold: true, bg: TH_C, fg: TH_FG, h: 'center', size: 12 }));
      ws.mergeCells(R, 8, R, WIDE);
      _cell(ws, R, 8, '備註', { bold: true, bg: TH_C, fg: TH_FG, h: 'center', size: 12 });
      ws.getRow(R).height = 24;
      R++;
      limits.forEach(gl => {
        _cell(ws, R, 4, symName[gl.symbol_id] || gl.symbol_id || '', { h: 'center', size: 12 });
        _cell(ws, R, 5, gl.zone || 'MAIN', { h: 'center', size: 12 });
        _cell(ws, R, 6, gl.min_count != null ? gl.min_count : '', { h: 'center', size: 12 });
        _cell(ws, R, 7, gl.max_count != null ? gl.max_count : '', { h: 'center', size: 12 });
        ws.mergeCells(R, 8, R, WIDE);
        _cell(ws, R, 8, gl.notes || '', { size: 12 });
        ws.getRow(R).height = 24;
        R++;
      });
      return R;
    }
    // 依 mode_scope 過濾產牌限制:scope='ALL' 或含指定模式名 → 收入
    function limitsForModes(modeNames) {
      const gls = Array.isArray(cfg.genLimits) ? cfg.genLimits : [];
      return gls.filter(gl => {
        const sc = String(gl.mode_scope || 'ALL').trim();
        if (!sc || sc.toUpperCase() === 'ALL') return true;
        const parts = sc.split(',').map(x => x.trim());
        return modeNames.some(mn => parts.includes(mn));
      });
    }

    const startMode = cfg.derived.startingMode;
    const spinModes  = cfg.modes.filter(m => !_isModeBonus(m));
    const bonusModes = cfg.modes.filter(m => _isModeBonus(m));
    const fgModes    = spinModes.filter(m => m.mode && m.mode !== startMode);
    const wheelModes = bonusModes.filter(m => String(m.mode_kind).toUpperCase() === 'WHEEL');
    const normNames = cfg.normalSyms.map(s => s.name || _symId(s));
    const specNames = cfg.specialSyms.map(s => s.name || _symId(s));
    const gridDesc = cfg.derived.gridStr ? `本遊戲為${cfg.derived.gridStr}的連線SLOT遊戲。` : '';
    const _plCount = Array.isArray(cfg.paylines) ? cfg.paylines.length : 0;
    const _isLine = String(cfg.global.pay_type || '').toUpperCase() === 'LINE';
    const lineDesc = cfg.derived.isScatterLike
      ? (cfg.derived.payMethodDesc || cfg.derived.payTypeLabel || '')
      : _isLine
        ? `${cfg.derived.payTypeLabel || ''}${_plCount ? `。共有${_plCount}種連線方式。` : ''}`
        : `${cfg.derived.payTypeLabel || ''}${cfg.derived.waysCount ? `。共有${cfg.derived.waysCount}種連線方式。` : ''}`;

    // ══════════ 1. 修訂紀錄(公司樣式:無填色無框線、置中) ══════════
    {
      const ws = wb.addWorksheet('修訂紀錄');
      ws.columns = [{ width: 2.1 }, { width: 12.6 }, { width: 8.43 }, { width: 18.7 }, { width: 42.1 }, { width: 49.4 }, { width: 35 }];
      ws.getRow(1).height = 6;
      ['時間', '修訂人', '修訂類型', '分頁', '說明', '備註'].forEach((h, i) =>
        _cell(ws, 2, i + 2, h, { h: 'center', size: 12, border: false }));
      const today = new Date().toISOString().slice(0, 10);
      ['' , today, 'SlotPlanner', '產生', 'ALL', '由 SlotPlanner Pro 匯出企劃書', ''].forEach((v, i) => {
        if (i === 0) return;
        _cell(ws, 3, i + 1, v, { h: i === 5 ? 'left' : 'center', size: 12, border: false });
      });
    }

    // ══════════ 2. 一般遊戲(標籤 2F5597,自第17列起) ══════════
    {
      const ws = wb.addWorksheet('一般遊戲');
      descCols(ws);
      let R = START_R;
      R = pairRow(ws, R, '主題選用', meta.theme_pick || meta.game_name || cfg.global.game_name || '',
                          '風格選用', meta.style_pick || '', NG_C);
      R = descRow(ws, R, '盤面(H×W)', gridDesc, NG_C);
      R = descRow(ws, R, '連線方式', lineDesc, NG_C);
      R = descRow(ws, R, '遊戲概述', meta.game_overview || `本遊戲模式共有${cfg.modes.map(m => m.mode).filter(Boolean).join('、') || '一般遊戲'}。`, NG_C);
      // 模式說明:各模式一行
      const modeLines = cfg.modes.filter(m => m.mode).map(m => {
        const d = (meta.mode_desc && meta.mode_desc[m.mode]) || m.notes || '';
        return d ? `${m.mode}：${d}` : m.mode;
      });
      if (modeLines.length) R = descRow(ws, R, '模式說明', modeLines, NG_C);
      // 玩法說明(留給企劃填)
      R = descRow(ws, R, '玩法說明', '', NG_C);
      // 一般 / 特殊圖示規劃(N個 藍粗)
      label(ws, R, 2, 3, '一般圖示規劃', NG_C);
      _cell(ws, R, 4, `${normNames.length}個`, { bold: true, fg: BLU, h: 'center', size: 12 });
      value(ws, R, 5, WIDE, normNames.join('、'));
      ws.getRow(R).height = 28.5; R++;
      label(ws, R, 2, 3, '特殊圖示規劃', NG_C);
      _cell(ws, R, 4, `${specNames.length}個`, { bold: true, fg: BLU, h: 'center', size: 12 });
      value(ws, R, 5, WIDE, specNames.join('、'));
      ws.getRow(R).height = 28.5; R++;
      // 特殊圖示說明:D=名稱(accent 藍粗) E:M=行為
      if (cfg.specialSyms.length) {
        R = descRow3(ws, R, '特殊圖示說明', cfg.specialSyms.map(s => ({
          sub: s.name || _symId(s),
          val: (meta.special_behavior && meta.special_behavior[_symId(s)]) || behaviorTemplate(s),
        })), NG_C);
      }
      // 得分規則
      const scoreDesc = meta.score_formula || (cfg.derived.isScatterLike
        ? '彩金計算方式：達標數量圖示 × 圖示賠率（見賠率表）。'
        : `彩金計算方式：押注額 × 圖示賠率${(_symbolMultView(cfg).multSyms.length ? ' × 倍數' : '')}＝獲得彩金。`);
      R = descRow(ws, R, '得分規則', scoreDesc, NG_C);
      // 加押規劃 / 特殊模式購買
      const bc = cfg.betConfig || {};
      if (bc.ante_bet_enabled) {
        R = descRow3(ws, R, '加押規劃', [{
          sub: '加押',
          val: `成本為原押注 ×${Number(bc.ante_bet_mult) || 0}，觸發倍率 ×${Number(bc.ante_bet_trigger_mult) || 0}。${bc.ante_bet_desc || ''}`,
          subFg: TH_FG,
        }], NG_C);
      }
      if (bc.buy_feature_enabled && Array.isArray(bc.buy_features) && bc.buy_features.length) {
        R = descRow3(ws, R, '特殊模式購買', bc.buy_features.map((f, i) => ({
          sub: f.bf_id || `購買${i + 1}`,
          val: `目標模式 ${f.target_mode || '—'}，成本 ×${Number(f.cost_mult) || 0} 注額。${f.notes || ''}`,
          subFg: TH_FG,
        })), NG_C);
      }
      // 跑馬燈 / 事件規劃 / 快停跳過(NG)
      R = modeExtras(ws, R, startMode, NG_C);
      // 產牌限制(NG / ALL)
      R = genLimitBlock(ws, R, limitsForModes([startMode]), NG_C);
    }

    // ══════════ 3. FREE GAME(標籤 1F3864,自第17列起) ══════════
    if (fgModes.length) {
      const ws = wb.addWorksheet('FREE GAME');
      descCols(ws);
      let R = START_R;
      fgModes.forEach((md, mi) => {
        if (fgModes.length > 1) {
          ws.mergeCells(R, 2, R, WIDE);
          _cell(ws, R, 2, `模式 ${md.mode}`, { bold: true, bg: FG_C, fg: 'FFFFFF', size: 14, h: 'left' });
          ws.getRow(R).height = 28.5; R++;
        }
        // 觸發方式
        const trig = (mi === 0 && meta.freegame.trigger) ? meta.freegame.trigger : (md.trigger_condition || '');
        R = descRow(ws, R, '觸發方式', trig, FG_C);
        // 觸發給付(有才出)
        const tp = mi === 0 ? (meta.freegame.trigger_pays || []).filter(t => t && (Number(t.count) || Number(t.pay))) : [];
        if (tp.length) R = descRow(ws, R, '觸發給付', tp.map(t => `${t.count} 個 → ${t.pay}x`).join('、'), FG_C);
        // 盤面顯示 進入/結束(留給企劃填)
        R = descRow3(ws, R, '盤面顯示', [
          { sub: '進入', val: '', subFg: TH_FG },
          { sub: '結束', val: '', subFg: TH_FG },
        ], FG_C);
        // 盤面 / 連線方式(同主盤)
        R = descRow(ws, R, '盤面(H×W)', gridDesc, FG_C);
        R = descRow(ws, R, '連線方式', lineDesc, FG_C);
        // 局數設定 | 加局 | 上限(同一列)
        const spins = (Number(md.spin_count) || 0) > 0 ? `${md.spin_count}局`
                    : (mi === 0 && Number(meta.freegame.min_spins) > 0 ? `${meta.freegame.min_spins}局` : '');
        const addSp = mi === 0 ? (meta.freegame.add_spins ? '有' : '無') : '';
        const capV  = mi === 0 ? (meta.freegame.cap === '有' ? (meta.freegame.cap_value || '有') : (meta.freegame.cap || '無')) : '';
        R = tripleRow(ws, R, '局數設定', spins, '加局', addSp, '上限', capV, FG_C);
        if (mi === 0 && meta.freegame.add_spins) R = descRow(ws, R, '加局說明', meta.freegame.add_spins, FG_C);
        // 遊戲說明(模式描述)
        const d = (meta.mode_desc && meta.mode_desc[md.mode]) || md.notes || '';
        R = descRow(ws, R, '遊戲說明', d, FG_C);
        // 一般 / 特殊圖示(公司 FG 頁會重複列)
        label(ws, R, 2, 3, '一般圖示', FG_C);
        _cell(ws, R, 4, `${normNames.length}個`, { bold: true, fg: BLU, h: 'center', size: 12 });
        value(ws, R, 5, WIDE, normNames.join('、'));
        ws.getRow(R).height = 28.5; R++;
        label(ws, R, 2, 3, '特殊圖示', FG_C);
        _cell(ws, R, 4, `${specNames.length}個`, { bold: true, fg: BLU, h: 'center', size: 12 });
        value(ws, R, 5, WIDE, specNames.join('、'));
        ws.getRow(R).height = 28.5; R++;
        // 跑馬燈 / 事件規劃 / 快停跳過(per FG mode)
        R = modeExtras(ws, R, md.mode, FG_C);
        R++; // 模式間空一列
      });
      // 產牌限制(FG / ALL)
      R = genLimitBlock(ws, R, limitsForModes(fgModes.map(m => m.mode)), FG_C);
    }

    // ══════════ 4. BONUS GAME(標籤 1F4E79,自第17列起) ══════════
    if (bonusModes.length) {
      const ws = wb.addWorksheet('BONUS GAME');
      descCols(ws);
      let R = START_R;
      bonusModes.forEach(md => {
        R = descRow(ws, R, '玩法種類', `${md.mode}：${_modeKindDesc(md)}`, BN_C);
        R = descRow(ws, R, '觸發方式', md.trigger_condition || '', BN_C);
        const k = String(md.mode_kind).toUpperCase();
        if (k === 'WHEEL' && md.wheel_upgrade_to) R = descRow(ws, R, '升級至', md.wheel_upgrade_to, BN_C);
        if (k === 'PICK') R = descRow(ws, R, '抽選次數', Number(md.pick_count) > 0 ? String(md.pick_count) : '抽到結束項為止', BN_C);
        if (k === 'COLLECTION') R = descRow(ws, R, '目標收集數', String(Number(md.collect_target) || 0), BN_C);
        // 獎項表(淺藍表頭)
        const items = Array.isArray(md.items) ? md.items : [];
        if (items.length) {
          label(ws, R, 2, 3, '各項獎值', BN_C, items.length + 1);
          ['項目', '數值 / JP', '權重', '是否結束'].forEach((h, i) => _cell(ws, R, 4 + i, h, { bold: true, bg: LB_C, fg: TH_FG, h: 'center', size: 12 }));
          ws.getRow(R).height = 24; R++;
          items.forEach(it => {
            _cell(ws, R, 4, it.label || '', { h: 'center', size: 12 });
            _cell(ws, R, 5, it.link_jp ? `JP：${it.link_jp}` : (it.value != null ? it.value : ''), { h: 'center', size: 12 });
            _cell(ws, R, 6, Number(it.weight) || 0, { h: 'center', size: 12 });
            _cell(ws, R, 7, it.is_end ? '是' : '', { h: 'center', size: 12 });
            ws.getRow(R).height = 24; R++;
          });
        }
        R = modeExtras(ws, R, md.mode, BN_C);
        R++;
      });
    }

    // ══════════ 5. 連線方式(標籤 2F5597,自第17列起) ══════════
    {
      const ws = wb.addWorksheet('連線方式');
      descCols(ws);
      let R = START_R;
      R = descRow(ws, R, '賠付方式', cfg.derived.payTypeLabel || '', NG_C);
      // P0-1a / D9:計分方向 + 雙向計分去重(僅連線型 LINE/WAYS)
      if (!cfg.derived.isScatterLike) {
        const _gg = cfg.global || {};
        const _dir = String(_gg.payline_direction || _gg.ways_direction || 'LTR').toUpperCase();
        const _dl = _dir === 'RTL' ? '右→左（RTL）'
                  : _dir === 'BOTH' ? '雙向計分（BOTH；左右任一端起算皆成立）'
                  : '左→右（LTR）';
        R = descRow(ws, R, '計分方向', _dl, NG_C);
        if (_dir === 'BOTH') {
          R = descRow(ws, R, '雙向去重',
            _gg.ways_both_dedup !== false ? '同一符號組合左右兩向皆成立時僅計分一次' : '左右兩向各自計分（不去重）', NG_C);
        }
      }
      if (cfg.derived.isScatterLike) {
        R = descRow(ws, R, '計分方式', cfg.derived.payMethodDesc || '', NG_C);
      } else if (_isLine && _plCount) {
        R = descRow(ws, R, '連線種數', `共有${_plCount}種連線方式。`, NG_C);
      } else if (cfg.derived.waysCount) {
        R = descRow(ws, R, '連線種數', `共有${cfg.derived.waysCount}種連線方式。`, NG_C);
      }
      const geom = _mainBoardGeom(cfg.layout);
      const pls = Array.isArray(cfg.paylines) ? cfg.paylines : [];
      if (pls.length && geom) {
        pls.forEach(pl => {
          const pts = _parsePathPoints(pl.path || pl.path_str || '');
          if (!pts.length) return;
          const asc = _renderPaylineAscii(pts, geom);
          const titleBits = [`Line ${pl.line_id != null ? pl.line_id : ''}`];
          if (pl.notes) titleBits.push(pl.notes);
          label(ws, R, 2, 3, titleBits.join(' '), NG_C, asc.length + 1);
          value(ws, R, 4, WIDE, _pathArrowStr(pts));
          ws.getRow(R).height = 24; R++;
          asc.forEach(line => {
            ws.mergeCells(R, 4, R, WIDE);
            const cell = _cell(ws, R, 4, line, { h: 'left', size: 11 });
            cell.font = { name: 'Consolas', size: 11, color: { argb: _argb(TH_FG) } };
            R++;
          });
          R++;
        });
      }
    }

    // ══════════ 6. 賠率表(自第9列起;帶 333F50 / 表頭 D6DCE4) ══════════
    {
      const ws = wb.addWorksheet('賠率表');
      let maxCount = 0;
      cfg.symbols.forEach(s => _symPayRows(s).forEach(r => { if (r.count > maxCount) maxCount = r.count; }));
      if (!maxCount) maxCount = cfg.derived.reelCount || 5;
      const minCount = Math.max(3, maxCount - 3);
      const counts = [];
      for (let n = maxCount; n >= minCount; n--) counts.push(n);
      const cols = [{ width: 2.3 }, { width: 8.9 }, { width: 17.6 }];
      counts.forEach(() => cols.push({ width: 8.9 }));
      cols.push({ width: 17.6 });
      ws.columns = cols;
      let R = 9;
      const nCols = 3 + counts.length;   // B..最後連線欄+備註
      // 一般圖示帶
      ws.mergeCells(R, 2, R, nCols);
      _cell(ws, R, 2, '一般圖示', { bold: true, bg: TB_C, fg: 'FFFFFF', h: 'center', size: 12 });
      ws.getRow(R).height = 16.5; R++;
      ['編號', '名稱', ...counts.map(n => `${n}連線`), '參考競品賠率'].forEach((h, i) =>
        _cell(ws, R, i + 2, h, { bold: false, bg: TH_C, fg: TH_FG, h: 'center', size: 12 }));
      ws.getRow(R).height = 16.5; R++;
      cfg.normalSyms.forEach(s => {
        const rowMap = {}; _symPayRows(s).forEach(r => rowMap[r.count] = r.pay);
        _cell(ws, R, 2, s.number != null ? s.number : '', { h: 'center', size: 12 });
        _cell(ws, R, 3, s.name || _symId(s), { h: 'center', size: 12 });
        counts.forEach((n, i) => _cell(ws, R, 4 + i, rowMap[n] != null ? rowMap[n] : '', { h: 'center', size: 12 }));
        _cell(ws, R, 4 + counts.length, '', { size: 12 });
        ws.getRow(R).height = 16.5; R++;
      });
      // 特殊圖示帶
      ws.mergeCells(R, 2, R, nCols);
      _cell(ws, R, 2, '特殊圖示', { bold: true, bg: TB_C, fg: 'FFFFFF', h: 'center', size: 12 });
      ws.getRow(R).height = 16.5; R++;
      cfg.specialSyms.forEach(s => {
        const rowMap = {}; _symPayRows(s).forEach(r => rowMap[r.count] = r.pay);
        _cell(ws, R, 2, s.number != null ? s.number : '', { h: 'center', size: 12 });
        _cell(ws, R, 3, s.name || _symId(s), { h: 'center', size: 12 });
        counts.forEach((n, i) => _cell(ws, R, 4 + i, rowMap[n] != null ? rowMap[n] : '-', { h: 'center', size: 12 }));
        _cell(ws, R, 4 + counts.length, _symRole(s) || '', { h: 'center', size: 12 });
        ws.getRow(R).height = 16.5; R++;
      });
    }

    // ══════════ 7. 輪盤遊戲(標籤 2E75B6,自第17列起) ══════════
    if (wheelModes.length) {
      const ws = wb.addWorksheet('輪盤遊戲');
      descCols(ws);
      let R = START_R;
      R = descRow(ws, R, '彩金計算方式', '押注額 × 輪盤倍數＝獲得彩金。', WH_C);
      wheelModes.forEach(md => {
        R = descRow(ws, R, '觸發方式', md.trigger_condition || '', WH_C);
        const items = Array.isArray(md.items) ? md.items : [];
        if (items.length) {
          label(ws, R, 2, 3, `${md.mode} 各項獎值`, WH_C, items.length + 1);
          ['項目', '數值 / JP', '權重', '升級'].forEach((h, i) => _cell(ws, R, 4 + i, h, { bold: true, bg: LB_C, fg: TH_FG, h: 'center', size: 12 }));
          ws.getRow(R).height = 24; R++;
          items.forEach(it => {
            _cell(ws, R, 4, it.label || '', { h: 'center', size: 12 });
            _cell(ws, R, 5, it.link_jp ? `JP：${it.link_jp}` : (it.value != null ? it.value : ''), { h: 'center', size: 12 });
            _cell(ws, R, 6, Number(it.weight) || 0, { h: 'center', size: 12 });
            _cell(ws, R, 7, it.is_end ? '' : (md.wheel_upgrade_to || ''), { h: 'center', size: 12 });
            ws.getRow(R).height = 24; R++;
          });
        }
        R++;
      });
    }

    // ══════════ 8. 說明文件(標題/圖片預留/編號+中文字) ══════════
    {
      const ws = wb.addWorksheet('說明文件');
      ws.columns = [{ width: 2.1 }, { width: 8 }, { width: 5.1 }, { width: 65.4 }, { width: 13.3 }];
      let R = 1;
      _cell(ws, R, 2, '內文：大小寫正常，開頭字母用大寫。', { size: 12, border: false }); R++;
      _cell(ws, R, 2, '文字內容以翻譯為主。', { size: 12, border: false }); R += 2;
      function section(title, items) {
        if (!items.length) return;
        // 標題列
        _cell(ws, R, 2, '標題', { bold: true, bg: TH_C, fg: TH_FG, h: 'center', size: 12 });
        ws.mergeCells(R, 3, R, 5);
        _cell(ws, R, 3, title, { bold: true, size: 12 });
        ws.getRow(R).height = 20; R++;
        // 圖片預留(6 列合併)
        ws.mergeCells(R, 2, R + 5, 2);
        _cell(ws, R, 2, '圖片', { bold: true, bg: TH_C, fg: TH_FG, h: 'center', size: 12 });
        ws.mergeCells(R, 3, R + 5, 5);
        _cell(ws, R, 3, '', {});
        R += 6;
        // 編號 / 中文字
        _cell(ws, R, 3, '編號', { h: 'center', size: 12 });
        _cell(ws, R, 4, '中文字', { h: 'center', size: 12 });
        _cell(ws, R, 5, '翻譯', { h: 'center', size: 12 });
        R++;
        items.forEach((t, i) => {
          _cell(ws, R, 3, i + 1, { h: 'center', size: 12 });
          _cell(ws, R, 4, t, { size: 12 });
          _cell(ws, R, 5, '', { size: 12 });
          R++;
        });
        R += 2;
      }
      // NG
      const ngItems = [];
      const startmd = cfg.modes.find(m => m.mode === startMode);
      if (startmd && ((meta.mode_desc && meta.mode_desc[startMode]) || startmd.notes)) ngItems.push((meta.mode_desc && meta.mode_desc[startMode]) || startmd.notes);
      ngItems.push(cfg.derived.isScatterLike
        ? '彩金計算方式：達標數量圖示 × 圖示賠率。'
        : '彩金計算方式：押注額 × 圖示賠率 × 倍數＝獲得彩金。');
      section('一般遊戲說明', ngItems);
      // FG
      if (fgModes.length) {
        const fgItems = [];
        if (meta.freegame.trigger) fgItems.push(meta.freegame.trigger);
        if (Number(meta.freegame.min_spins) > 0) fgItems.push(`可獲得${meta.freegame.min_spins}局免費遊戲。`);
        fgModes.forEach(md => { const d = (meta.mode_desc && meta.mode_desc[md.mode]) || md.notes; if (d) fgItems.push(d); });
        section('免費遊戲說明', fgItems);
      }
      // BONUS
      if (bonusModes.length) {
        const bnItems = [];
        bonusModes.forEach(md => {
          bnItems.push(`${md.mode}：${_modeKindDesc(md)}${md.trigger_condition ? `；${md.trigger_condition}` : ''}`);
        });
        section('BONUS 遊戲說明', bnItems);
      }
      // 加押 / 購買
      const bc = cfg.betConfig || {};
      const buyItems = [];
      if (bc.ante_bet_enabled) buyItems.push(`加押：成本 ×${Number(bc.ante_bet_mult) || 0} 注額，觸發倍率 ×${Number(bc.ante_bet_trigger_mult) || 0}。${bc.ante_bet_desc || ''}`);
      if (bc.buy_feature_enabled && Array.isArray(bc.buy_features)) bc.buy_features.forEach(f => buyItems.push(`購買 ${f.bf_id || ''}：進入 ${f.target_mode || '—'}，成本 ×${Number(f.cost_mult) || 0} 注額。`));
      section('加押 / 購買說明', buyItems);
    }

    // ══════════ 9. 演繹流程(公司=純分鏡圖頁 → 留白) ══════════
    {
      const ws = wb.addWorksheet('演繹流程');
      ws.columns = [{ width: 4.8 }];
    }

    // ══════════ 10. 節奏表(公司標準項目列) ══════════
    {
      const ws = wb.addWorksheet('節奏表');
      const rcols = [{ width: 1.9 }, { width: 8.43 }, { width: 30 }];
      for (let c = 4; c <= 14; c++) rcols.push({ width: 4.5 });
      ws.columns = rcols;
      let R = 2;
      _cell(ws, R, 2, '每小格單位：0.1 秒。', { size: 12, border: false }); R += 1;
      const ITEMS = ['AUTO', '轉輪時間(啟動至第1輪停止)', '整體滾輪時間', '未得分局間停頓',
                     '停輪後中獎停頓', '中獎後出現分數', '分數停留時間', '圖示演繹'];
      ITEMS.forEach(it => {
        _cell(ws, R, 3, it, { size: 12 });
        for (let c = 4; c <= 14; c++) _cell(ws, R, c, '', {});
        ws.getRow(R).height = 17.2;
        R++;
      });
    }

    // ══════════ 11. 體感(單一頁;表頭=編號/是否得分/是否超過1倍/各圖示) ══════════
    {
      const ws = wb.addWorksheet('體感');
      const symCols = cfg.symbols.map(s => s.name || _symId(s));
      const cols = [{ width: 6 }, { width: 9 }, { width: 11 }];
      symCols.forEach(() => cols.push({ width: 10 }));
      ws.columns = cols;
      let R = 1;
      ['編號', '是否得分', '是否超過1倍', ...symCols].forEach((h, i) =>
        _cell(ws, R, i + 1, h, { bold: false, bg: TH_C, fg: TH_FG, h: 'center', size: 12 }));
      ws.getRow(R).height = 16.5; R++;
      for (let n = 1; n <= 30; n++) {
        _cell(ws, R, 1, n, { h: 'center', size: 12 });
        for (let c = 2; c <= 3 + symCols.length; c++) _cell(ws, R, c, '', { h: 'center', size: 12 });
        R++;
      }
    }

    return await wb.xlsx.writeBuffer();
  }
  // ════════════════════════════════════════════════════════════════════
  //  機制文件（Markdown 簡版）
  // ════════════════════════════════════════════════════════════════════
  function buildMechMarkdown(metaIn) {
    const cfg = collectConfig();
    const m = mergeMeta(metaIn || loadMeta(), cfg);
    const L = [];
    const title = m.game_name || '（未命名遊戲）';
    L.push(`# ${title} — 機制文件`);
    L.push('');
    L.push(`> 由 SlotPlanner Pro 設定檔自動產生　·　${new Date().toLocaleString('zh-TW')}`);
    L.push('');
    // v8.3 / R1 F-21:佔位數值旗標(公版化流程常態:先出架構、數值後補)
    if (m.numbers_are_placeholder) {
      L.push('> ⚠️ **本文件之賠付 / 權重 / 局數等數值皆為佔位**，僅供架構溝通；正式數值以數值組 / 模擬工具產出為準。');
      L.push('');
    }

    // 基本規格
    L.push('## 基本規格');
    L.push('');
    L.push(`- 盤面 (H×W)：${cfg.derived.gridStr || '—'}（共 ${cfg.derived.reelCount} 輪）`);
    L.push(`- 連線型態：${cfg.derived.payTypeLabel}`);
    // v6.4 / 缺漏#3:連線種數(ways)只對 WAYS/MEGAWAYS 有意義;SCATTER/CLUSTER 改輸出賠付方式。
    if (cfg.derived.isScatterLike) {
      if (cfg.derived.payMethodDesc) L.push(`- 賠付方式：${cfg.derived.payMethodDesc}`);
      if (cfg.derived.payType === 'CLUSTER' && cfg.derived.clusterMin) {  // v6.4 / 缺漏#7
        L.push(`- 最小群組大小：${cfg.derived.clusterMin}`);
      }
    } else if (cfg.derived.isWaysLike && cfg.derived.waysCount) {
      // 修正:連線種數(ways)僅對 WAYS/Megaways 有意義;LINE 款不印(原 elif 未 gate isWaysLike,
      //   會讓 LINE 也印 reel^rows 的 ways 數、與「連線」型態矛盾;中獎線數改由「連線/計分規則」段呈現)。
      L.push(`- 連線種數：${cfg.derived.waysCount}`);   // v6.4 / 缺漏#6:已含 TOP_HORIZONTAL 副盤
    }
    L.push(`- 起始模式：${cfg.derived.startingMode}`);
    if (m.payline_method) L.push(`- 連線方式：${m.payline_method}`);
    if (m.refill_method) L.push(`- 補盤方式：${m.refill_method}`);
    if (m.scroll_main || m.scroll_sub) {
      const parts = [m.scroll_main && `主盤 ${m.scroll_main}`, m.scroll_sub && `副盤 ${m.scroll_sub}`].filter(Boolean);
      L.push(`- 滾動方式：${parts.join('；')}`);
    }
    L.push(`- 得分公式：${m.score_formula}`);
    if (m.competitor_url) L.push(`- 競品參考：${m.competitor_url}`);
    L.push('');

    // 模式與觸發
    L.push('## 模式與觸發');
    L.push('');
    if (cfg.modes.length) {
      L.push('| 模式 | 觸發條件 | 局數 | 說明 |');
      L.push('| --- | --- | --- | --- |');
      cfg.modes.forEach(md => {
        const trig = md.trigger_condition || (md.mode === cfg.derived.startingMode ? '起始模式' : '—');
        const desc = (m.mode_desc[md.mode] || md.notes || '').replace(/\|/g, '\\|');
        L.push(`| ${md.mode} | ${trig.replace(/\|/g, '\\|')} | ${md.spin_count || 0} | ${desc} |`);
      });
    } else { L.push('（無模式資料）'); }
    L.push('');

    // v7.12:各模式玩法設定（倍數重置範圍 / 疊加方式 / 封頂）
    //   規格書描述用;本工具不執行、不算 RTP，數值由另一數值模擬工具落盤遵循。
    if (cfg.modes.length) {
      L.push('## 各模式玩法設定');
      L.push('');
      L.push('> 以下為規格描述，供數值 / 模擬工具落盤遵循；本工具不執行、不計算 RTP。');
      L.push('');
      L.push('| 模式 | 倍數重置範圍 | 倍數疊加方式 | 封頂 / 上限 | 玩家擇一 | Hold&Win Respin |');
      L.push('| --- | --- | --- | --- | --- | --- |');
      cfg.modes.forEach(md => {
        L.push(`| ${md.mode} | ${_modeResetDesc(md).replace(/\|/g, '\\|')} | ${_modeStackDesc(md).replace(/\|/g, '\\|')} | ${_modeCapDesc(md).replace(/\|/g, '\\|')} | ${_modeChoiceDesc(md).replace(/\|/g, '\\|')} | ${_modeRespinDesc(md).replace(/\|/g, '\\|')} |`);
      });
      L.push('');
      L.push('- 倍數疊加優先序：符號層 `mult_stack_mode` > 模式層 `stack_mode` > 全域 `Multipliers.stack_mode`；「繼承全域」表示未於本層覆寫。');
      // v8.5 / R3:玩家擇一組說明(有組才輸出)
      {
        const _grp = {};
        cfg.modes.forEach(md => { const g = (md.choice_group || '').trim(); if (g) (_grp[g] = _grp[g] || []).push(md.mode); });
        const gs = Object.entries(_grp);
        if (gs.length) {
          L.push('- 玩家擇一：' + gs.map(([g, ms]) => `組「${g}」＝ ${ms.join(' / ')}（${ms.length} 選 1）`).join('；') + '。觸發時由玩家選擇進入其中一個模式。');
        }
      }
      // v8.7 / R6 A-2:per-mode 賠付模型覆寫說明(有覆寫才輸出)
      {
        const ovr = cfg.modes.filter(md => (md.pay_type_override || '').trim());
        if (ovr.length) {
          L.push('- 賠付模型覆寫：' + ovr.map(md => `${md.mode} 改用 **${String(md.pay_type_override).toUpperCase()}**`).join('；') + '。其餘模式沿用全域賠付模型。');
        }
      }
      // v8.22 / G3:Hold&Win 收集設定說明(有設定才輸出)
      {
        const col = cfg.modes.filter(md => _modeCollectDesc(md));
        if (col.length) {
          L.push('- Hold&Win 收集設定：' + col.map(md => `${md.mode}（${_modeCollectDesc(md)}）`).join('；') + '。常見收集玩法以此描述,罕見特有互動改由特色規則(拼圖)表達。');
        }
      }
      // v8.24 / G5:生存 / 條件式結束說明(有結構化 end_condition 才輸出)
      {
        const ec = cfg.modes.filter(md => (md.end_condition || '').trim());
        if (ec.length) {
          L.push('- 結束條件（結構化）：' + ec.map(md => `${md.mode} 當 \`${String(md.end_condition).trim()}\` 時結束`).join('；') + '。生存局 / 條件式結束;拼圖層以 END_FEATURE{when} 連動。供數值端遵循。');
        }
      }
      // v8.29 / W-1(v8.28 缺口B):模式解鎖前提說明(有設定才輸出)
      {
        const ur = cfg.modes.filter(md => Array.isArray(md.unlock_requires) && md.unlock_requires.length);
        if (ur.length) {
          L.push('- 解鎖前提：' + ur.map(md => `${md.mode} 需先達成 / 經歷 ${md.unlock_requires.join('、')}`).join('；') + '。與玩家擇一（choice_group）正交；進入門檻宣告，供數值端遵循。');
        }
      }
      // v8.29 / W-1(v8.28 缺口C):模式倍數複合覆寫說明(有覆寫才輸出;全域值見「計分與封頂」段)
      {
        const MC_ZH = { MUL: '相乘', ADD: '相加', MAX: '取最高' };
        const mo = cfg.modes.filter(md => (md.mult_compose_override || '').trim());
        if (mo.length) {
          L.push('- 倍數複合覆寫：' + mo.map(md => `${md.mode} 改用 **${MC_ZH[String(md.mult_compose_override).toUpperCase()] || md.mult_compose_override}**`).join('；') + '。其餘模式沿用全域複合方式。');
        }
      }
      L.push('');
    }

    // v7.14:各模式 bonus 小遊戲（mode_kind = WHEEL / PICK / COLLECTION 的模式獎項表）
    //   規格書描述用;本工具不執行、不算 RTP，數值由另一數值 / 模擬工具落盤遵循。
    {
      const _bmodes = (cfg.modes || []).filter(_isModeBonus);
      if (_bmodes.length) {
        const KLAB = { WHEEL: '輪盤', PICK: '選獎', COLLECTION: '收集' };
        L.push('## 各模式 bonus 小遊戲');
        L.push('');
        L.push('> 以下模式的玩法種類為 bonus 小遊戲；何時觸發進入由各模式的觸發條件決定。供數值 / 模擬工具落盤遵循；本工具不執行、不計算 RTP。');
        L.push('');
        _bmodes.forEach(md => {
          const k = String(md.mode_kind || '').toUpperCase();
          L.push(`### ${md.mode}（${KLAB[k] || k}）`);
          if (md.trigger_condition) L.push(`- 觸發條件：\`${md.trigger_condition}\``);
          if (k === 'WHEEL' && md.wheel_upgrade_to) L.push(`- 升級至：${md.wheel_upgrade_to}`);
          if (k === 'PICK') L.push(`- 抽選次數：${Number(md.pick_count) > 0 ? md.pick_count : '抽到結束項為止'}`);
          if (k === 'COLLECTION') L.push(`- 目標收集數：${Number(md.collect_target) || 0}`);
          if (md.notes) L.push(`- 說明：${md.notes}`);
          const items = Array.isArray(md.items) ? md.items : [];
          if (items.length) {
            L.push('');
            if (k === 'COLLECTION') {
              L.push('| 獎勵 | 門檻 | 角色 | 連結JP |');
              L.push('| --- | --- | --- | --- |');
              items.forEach(it => L.push(`| ${it.label || ''} | ${Number(it.value) || 0} | ${_itemRoleDesc(it.item_role)} | ${it.link_jackpot || '—'} |`));
            } else {
              const tot = items.reduce((a, it) => a + (Number(it.weight) || 0), 0) || 1;
              const _anyLM = items.some(it => (it.link_mode || '').trim());   // 有連結才加欄,避免冗欄
              L.push('| 項目 | 值×注額 | 權重 | 機率 | 角色 |' + (k === 'PICK' ? ' 結束 |' : '') + ' 連結JP |' + (_anyLM ? ' 連結模式 |' : ''));
              L.push('| --- | --- | --- | --- | --- |' + (k === 'PICK' ? ' --- |' : '') + ' --- |' + (_anyLM ? ' --- |' : ''));
              items.forEach(it => {
                const pct = ((Number(it.weight) || 0) / tot * 100).toFixed(1) + '%';
                L.push(`| ${it.label || ''} | ${it.link_jackpot ? '（依JP）' : (Number(it.value) || 0)} | ${Number(it.weight) || 0} | ${pct} | ${_itemRoleDesc(it.item_role)} |`
                  + (k === 'PICK' ? ` ${it.is_end ? '✓' : ''} |` : '') + ` ${it.link_jackpot || '—'} |`
                  + (_anyLM ? ` ${(it.link_mode || '').trim() || '—'} |` : ''));
              });
            }
          }
          // v8.27 / 批8:item→模式連結彙整(Pick 多層 / Wheel 分段跳轉;有連結才輸出)
          {
            const links = items.filter(it => (it.link_mode || '').trim());
            if (links.length) {
              L.push('- 連結模式：' + links.map(it => `「${it.label || '?'}」→ ${String(it.link_mode).trim()}`).join('；')
                + (k === 'PICK' ? '（多層抽選:抽到該項後進入連結模式）' : k === 'WHEEL' ? '（分段跳轉:轉到該段後進入連結模式）' : ''));
            }
          }
          L.push('');
        });
      }
    }

    // v8.6 / R5:商業設定(加押 / 購買 / 比倍 / 多市場 RTP;有資料才輸出;規格描述)
    {
      const bc = cfg.betConfig || {};
      const gm = cfg.gamble || {};
      const biz = [];
      if (bc.ante_bet_enabled) {
        let s = `- **加押（Extra Bet）**：成本 ×${Number(bc.ante_bet_mult) || 0} 注額，特色觸發率 ×${Number(bc.ante_bet_trigger_mult) || 0}`;
        if (bc.ante_bet_desc) s += `。${bc.ante_bet_desc}`;
        if (bc.ante_buy_exclusive) s += '。**啟用加押時停用購買（互斥）**';
        biz.push(s + '。');
      }
      if (bc.buy_feature_enabled && Array.isArray(bc.buy_features) && bc.buy_features.length) {
        const kindLabel = { DIRECT: '直接購買', BOOST_RATE: '提升觸發率（非直買）', SUPER: '進階強化版' };
        bc.buy_features.forEach(f => {
          biz.push(`- **購買 ${f.bf_id || ''}**〔${kindLabel[f.kind] || f.kind || '直接購買'}〕：進入 ${f.target_mode || '—'}，成本 ×${Number(f.cost_mult) || 0} 注額${Number(f.rtp_target) ? `，RTP 目標 ${f.rtp_target}%` : ''}${f.notes ? `。${f.notes}` : ''}`);
        });
        if (bc.feature_drop_enabled) biz.push(`- **Feature Drop 折抵**：${bc.feature_drop_desc || '累積贏分折抵購買成本（細節待補）'}`);
      }
      if (gm.enabled) {
        const gtLabel = { CARD_COLOR: '猜牌色（×2）', CARD_SUIT: '猜花色（×4）', LADDER: '階梯比倍', WHEEL: '轉輪比倍', CUSTOM: '自訂' };
        const gp = [`型式 ${gtLabel[gm.gamble_type] || gm.gamble_type}`];
        if (gm.type_desc) gp.push(gm.type_desc);
        if (gm.win_mult_options) gp.push(`可選倍數 ${gm.win_mult_options}`);
        gp.push(Number(gm.max_rounds) > 0 ? `最多連續 ${gm.max_rounds} 次` : '次數無限');
        if (Number(gm.cap_mult) > 0) gp.push(`封頂 ×${gm.cap_mult} 注額`);
        gp.push(gm.applies_to === 'BELOW_LIMIT' ? `僅低於 ×${Number(gm.applies_limit) || 0} 注額的贏分可比` : '所有贏分可比');
        if (gm.collect_anytime !== false) gp.push('可隨時收下');
        // v8.23 / G2:非現金賭注/獎勵(非預設才顯示,避免現金比倍冗字)
        {
          const stL = { WIN: '贏分', FREE_SPINS: '免費局', BONUS_ENTRY: 'bonus 資格', BONUS_LEVEL: 'bonus 等級' };
          const rwL = { MULTIPLY_WIN: '倍增贏分', ADD_SPINS: '加免費局', ENTER_BONUS: '進入 bonus', UPGRADE_LEVEL: '升級等級' };
          const st = String(gm.stake_type || 'WIN').toUpperCase();
          const rw = String(gm.reward_type || 'MULTIPLY_WIN').toUpperCase();
          if (st !== 'WIN' || rw !== 'MULTIPLY_WIN') gp.push(`賭注 ${stL[st] || st} → 獎勵 ${rwL[rw] || rw}`);
          const trg = String(gm.gamble_trigger || '').trim();
          if (trg) gp.push(`觸發時機 ${trg}`);
        }
        biz.push(`- **比倍（Gamble）**：${gp.join('；')}${gm.notes ? `。${gm.notes}` : ''}`);
      }
      const rvs = Array.isArray(bc.rtp_variants) ? bc.rtp_variants.filter(v => v && String(v.variant || '').trim()) : [];
      if (biz.length || rvs.length) {
        L.push('## 商業設定（加押 / 購買 / 比倍 / RTP 版本）');
        L.push('');
        L.push('> 規格描述，供數值 / 認證流程遵循；本工具不執行、不計算 RTP。');
        L.push('');
        biz.forEach(b => L.push(b));
        if (rvs.length) {
          L.push('');
          L.push('**多市場 RTP 出證版本**：');
          L.push('');
          L.push('| 版本 / 市場 | 目標 RTP | 注限 | 備註 |');
          L.push('| --- | --- | --- | --- |');
          rvs.forEach(v => L.push(`| ${_mdCell(v.variant)} | ${Number(v.target_rtp) || 0}% | ${Number(v.max_bet) ? _mdCell(String(v.max_bet)) : '—'} | ${_mdCell(v.notes || '')} |`));
        }
        L.push('');
      }
    }

    // v8.25 / G4:獎池級距(有級距或觸發設定才輸出;與 13_Jackpots 正交)
    {
      const jc = cfg.jackpotTiers || {};
      const jtiers = Array.isArray(jc.tiers) ? jc.tiers.filter(t => t && (String(t.tier || '').trim() || String(t.label || '').trim())) : [];
      const jtrig = String(jc.trigger || '').trim();
      if (jtiers.length || jtrig) {
        const trigL = { PROBABILITY: '機率觸發', COLLECT_METER: '集滿進度', TOKEN_COUNT: '收滿 N 枚' };
        L.push('## 獎池級距');
        L.push('');
        if (jtrig) L.push(`- 觸發方式：${trigL[jtrig.toUpperCase()] || jtrig}`);
        if (jtiers.length) {
          L.push('');
          L.push('| 層級 | 名稱 | 值×注額 | 備註 |');
          L.push('| --- | --- | --- | --- |');
          jtiers.forEach(t => L.push(`| ${_mdCell(String(t.tier || ''))} | ${_mdCell(String(t.label || ''))} | ${Number(t.value) || 0} | ${_mdCell(String(t.notes || ''))} |`));
        }
        L.push('');
        L.push('> 獎池級距與觸發方式為規格描述;只描述級距與觸發,不模擬命中率。供數值 / 模擬工具遵循。');
        L.push('');
      }
    }

    L.push('');
    L.push(`- 一般圖示 ${cfg.normalSyms.length} 個、特殊圖示 ${cfg.specialSyms.length} 個。`);
    if (cfg.specialSyms.length) {
      cfg.specialSyms.forEach(s => {
        L.push(`- **${s.name || _symId(s)}**（${_symRole(s) || '特殊'}）`);
      });
    }
    // v8.3 / R1 D-12:出現模式宣告(有宣告才輸出;取代「權重 0 繞路」的人話說明)
    {
      const scoped = (cfg.symbols || []).filter(s => String(s.mode_scope || '').trim() !== '');
      if (scoped.length) {
        L.push('');
        L.push('僅在特定模式出現的圖示：');
        scoped.forEach(s => {
          L.push(`- **${s.name || _symId(s)}**：僅出現於 ${String(s.mode_scope).trim()}（其餘模式不產出此圖示）`);
        });
      }
    }
    // v8.7 / R6 D-14:per-instance 乘數宣告(有宣告才輸出)
    {
      const inst = (cfg.symbols || []).filter(s => s.instance_mult === true);
      if (inst.length) {
        L.push('');
        L.push('每顆實例攜帶自身乘數的圖示（xWays / 落地各帶倍數式）：');
        inst.forEach(s => {
          L.push(`- **${s.name || _symId(s)}**：每顆實例各自攜帶乘數；取值與疊加行為見規則 / 備註。`);
        });
      }
    }
    L.push('');

    // 賠付表
    L.push('## 賠付表' + (m.numbers_are_placeholder ? '（佔位數值）' : ''));
    L.push('');
    // v5.6:動態連線數欄
    // v8.3 / R1 A-1:count 區間同賠 → 欄位鍵改 band(單點 "8"、區間 "8–9";依起點降冪)
    const _bandKey = (r) => (r.count_to > 0 ? `${r.count}–${r.count_to}` : String(r.count));
    const mdBandMap = new Map();   // key → from(排序用)
    cfg.symbols.forEach(s => _symPayRows(s).forEach(r => {
      const k = _bandKey(r);
      if (!mdBandMap.has(k)) mdBandMap.set(k, Number(r.count) || 0);
    }));
    let mdCounts = [...mdBandMap.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (mdCounts.length === 0) mdCounts = ['5', '4', '3'];
    L.push('| 編號 | 名稱 | 類型 | ' + mdCounts.map(n => n + '連線').join(' | ') + ' |');
    L.push('| --- | --- | --- | ' + mdCounts.map(() => '---').join(' | ') + ' |');
    const mdPayCell = (s, k) => {
      const by = {}; _symPayRows(s).forEach(r => { by[_bandKey(r)] = r.pay; });
      return by[k] != null ? by[k] : '—';
    };
    cfg.normalSyms.forEach(s => {
      L.push(`| ${s.number ?? ''} | ${s.name || _symId(s)} | ${s.type || ''} | ` + mdCounts.map(n => mdPayCell(s, n)).join(' | ') + ' |');
    });
    cfg.specialSyms.forEach(s => {
      L.push(`| ${s.number ?? ''} | ${s.name || _symId(s)} | ${_symRole(s) || '特殊'} | ` + mdCounts.map(n => mdPayCell(s, n)).join(' | ') + ' |');
    });
    L.push('');
    // P0-2:最少連線(min_match)例外註記 —— 僅連線型(LINE/WAYS),只在有非 3 例外時列出。
    if (!cfg.derived.isScatterLike) {
      const _mmEx = (cfg.symbols || [])
        .filter(s => Number(s.min_match) && Number(s.min_match) !== 3)
        .map(s => `${s.name || _symId(s)}（最少 ${Math.max(1, Number(s.min_match))} 連起賠）`);
      if (_mmEx.length) {
        L.push(`＊最少連線：除下列外均為 **3** 連起賠 —— ${_mmEx.join('、')}。`);
        L.push('');
      }
    }

    // P0-3:符號家族 / 混合賠付(ANY BAR 型)。僅在有家族時輸出;成員由 symbol.group_id 反查。
    {
      const groups = Array.isArray(cfg.symbolGroups)
        ? cfg.symbolGroups.filter(gp => String(gp.group_id || '').trim()) : [];
      if (groups.length) {
        L.push('## 符號家族 / 混合賠付');
        L.push('');
        groups.forEach(gp => {
          const gid = String(gp.group_id).trim();
          const dn = (gp.display_name && String(gp.display_name).trim()) || gid;
          const members = (cfg.symbols || [])
            .filter(s => String(s.group_id || '').trim() === gid)
            .map(s => s.name || _symId(s));
          const pt = (gp.pay_table && typeof gp.pay_table === 'object') ? gp.pay_table : {};
          const payN = (n) => { const v = (gp['pay_' + n + 'x'] != null) ? gp['pay_' + n + 'x'] : pt[n]; return Number(v) || 0; };
          const payBits = [3, 4, 5, 6].filter(n => payN(n) > 0).map(n => `${n} 連 ×${payN(n)}`);
          const bits = [`**${dn}（${gid}）**：`];
          bits.push(members.length ? `成員 ${members.join('、')}。` : '（尚未指定成員符號）');
          const mmLabel = (String(gp.match_mode || 'ANY_MIXED').toUpperCase() === 'ANY_MIXED')
            ? '任意混合成員即成家族' : String(gp.match_mode);
          bits.push(`${mmLabel}，${payBits.length ? '以家族費率計 —— ' + payBits.join('、') + '。' : '（尚未設定家族賠率）'}`);
          if (gp.members_keep_individual !== false) bits.push('成員亦保留自身賠率，混合走家族賠、同款走個別賠，取較高者。');
          // P0-3 進階:per-mode 費率覆寫
          const pbm = (gp.pay_by_mode && typeof gp.pay_by_mode === 'object') ? gp.pay_by_mode : {};
          const pbmBits = Object.keys(pbm).map(mk => {
            const row = pbm[mk] || {};
            const parts = [3, 4, 5, 6]
              .filter(n => Number(row['pay_' + n + 'x']) > 0)
              .map(n => `${n}連×${Number(row['pay_' + n + 'x'])}`);
            return parts.length ? `${mk}（${parts.join('、')}）` : '';
          }).filter(Boolean);
          if (pbmBits.length) bits.push(`各模式覆寫：${pbmBits.join('；')}。`);
          const msc = String(gp.mode_scope || '').trim();
          if (msc && msc !== 'ALL') bits.push(`生效模式：${msc}。`);
          if (gp.notes && String(gp.notes).trim()) bits.push(`備註：${String(gp.notes).trim()}`);
          L.push('- ' + bits.join(''));
        });
        L.push('');
      }
    }

    // 連線 / 計分規則
    L.push('## 連線 / 計分規則');
    L.push('');
    if (m.payline_method) { L.push(m.payline_method); L.push(''); }
    if (m.payline_desc) { L.push(m.payline_desc); L.push(''); }
    if (m.refill_method) L.push(`- 補盤方式：${m.refill_method}`);
    if (m.scroll_main || m.scroll_sub) {
      const parts = [m.scroll_main && `主盤 ${m.scroll_main}`, m.scroll_sub && `副盤 ${m.scroll_sub}`].filter(Boolean);
      L.push(`- 滾動方式：${parts.join('；')}`);
    }
    L.push(`- 計分方式：${m.score_formula}`);
    // P0-1a / D9:計分方向補述 + 雙向計分去重(泛化 LINE+WAYS;讀 payline_direction||ways_direction、ways_both_dedup)
    {
      const gg = cfg.global || {};
      if (!cfg.derived.isScatterLike) {
        const dir = String(gg.payline_direction || gg.ways_direction || 'LTR').toUpperCase();
        const dirLabel = dir === 'RTL' ? '右→左（RTL）'
                       : dir === 'BOTH' ? '雙向計分（BOTH；左右任一端起算皆成立）'
                       : '左→右（LTR）';
        L.push(`- 計分方向：${dirLabel}`);
        if (dir === 'BOTH') {
          L.push(`- 雙向計分去重：${gg.ways_both_dedup !== false ? '同一符號組合左右兩向皆成立時僅計分一次' : '左右兩向各自計分（不去重）'}（規格宣告，供數值端遵循）`);
        }
      }
    }
    // v8.20 / G 界-3:結構化最大贏分封頂(0=沿用披露字串、-1=明示無上限、>0=硬封頂值)。
    //   純規格描述,供下游遵循;與合規披露的 max_win 字串並存(職責不同)。
    {
      const cap = Number((cfg.global || {}).max_win_cap);
      if (Number.isFinite(cap) && cap !== 0) {
        if (cap < 0) {
          L.push(`- 最大贏分封頂：明示無上限（規格宣告，供數值端遵循）`);
        } else {
          L.push(`- 最大贏分封頂：${cap.toLocaleString('en-US')}× 注額（硬上限；規格宣告，超過即截頂，供數值端遵循）`);
        }
      }
    }
    // v8.29 / W-1(v8.28 缺口C):跨來源倍數複合方式(非預設 MUL 才輸出;固定順序 單顆 → 全域 → 特色)。
    //   純規格描述,供下游遵循;per-mode 覆寫見「模式」段。
    {
      const MC_ZH = { ADD: '相加', MAX: '取最高' };
      const mc = String((cfg.global || {}).mult_compose || 'MUL').trim().toUpperCase();
      if (mc && mc !== 'MUL' && MC_ZH[mc]) {
        L.push(`- 跨來源倍數複合：**${MC_ZH[mc]}**（單顆 → 全域 → 特色 固定順序；規格宣告，供數值端遵循）`);
      }
    }
    if (!cfg.derived.isWaysLike && Array.isArray(cfg.paylines) && cfg.paylines.length) {
      L.push(`- 中獎線數：${cfg.paylines.length} 條`);
    }
    L.push('');

    // v7.5-B:中獎線示意(ASCII 網格;吃主盤不等高幾何)
    if (!cfg.derived.isWaysLike && Array.isArray(cfg.paylines) && cfg.paylines.length) {
      const geom = _mainBoardGeom(cfg.layout);
      L.push('## 中獎線示意');
      L.push('');
      L.push('> `●`＝命中格、`·`＝盤面空格、空白＝該欄無此列（不等高盤面）。');
      L.push('');
      cfg.paylines.forEach(pl => {
        const pts = _parsePathPoints(pl.path);
        const titleBits = [`Line ${pl.line_id}`];
        if (pl.direction) titleBits.push(pl.direction);
        if (pl.notes) titleBits.push(pl.notes);
        L.push(`### ${titleBits.join('　·　')}`);
        L.push('');
        if (!pts.length) { L.push('_（無有效路徑座標）_'); L.push(''); return; }
        L.push('路徑：' + _pathArrowStr(pts));
        L.push('');
        L.push('```');
        _renderPaylineAscii(pts, geom).forEach(ln => L.push(ln));
        L.push('```');
        L.push('');
      });
    } else if (cfg.derived.isWaysLike && Array.isArray(cfg.paylines)) {
      L.push('## 中獎線示意');
      L.push('');
      L.push('全路徑（WAYS／Megaways）模式，無逐線定義，故不繪製中獎線示意。');
      L.push('');
    }

    // v6.3 / Q3:倍數 / 彩金摘要(由符號 mult_values / prize_values 帶入)
    {
      const multSyms = (cfg.symbols || []).filter(s => Array.isArray(s.mult_values) && s.mult_values.length);
      const prizeSyms = (cfg.symbols || []).filter(s => Array.isArray(s.prize_values) && s.prize_values.length);
      // v6.4 / 缺漏#2:帶進度倍數梯的模式(用於輸出重置範圍)
      const ladderModes = (cfg.modes || []).filter(md => Array.isArray(md.progress_ladder) && md.progress_ladder.length);
      if (multSyms.length || prizeSyms.length || ladderModes.length) {
        L.push('## 倍數 / 彩金');
        L.push('');
        multSyms.forEach(s => {
          const parts = s.mult_values.map(v => `×${v.mult}` + (v.weight ? `（權重 ${v.weight}）` : ''));
          // v8.7 / R6 D-14:per-instance 乘數宣告(每顆實例攜帶自身乘數;xWays 式)
          const instTag = s.instance_mult === true ? '【每顆實例各帶乘數】' : '';
          L.push(`- ${s.name || _symId(s)} 倍數${instTag}：${parts.join('、')}`);
          // v8.3 / R1 D-13:per-mode 權重(各模式值不同時才輸出;如「NG 0 / FG 100」)
          s.mult_values.forEach(v => {
            const wbm = (v.weight_by_mode && typeof v.weight_by_mode === 'object') ? v.weight_by_mode : {};
            const ks = Object.keys(wbm);
            if (!ks.length) return;
            const vals = ks.map(k => Number(wbm[k]) || 0);
            if (new Set(vals).size <= 1) return;   // 全模式同值 → 不贅述
            L.push(`  - ×${v.mult} 各模式權重：${ks.map(k => `${k} ${Number(wbm[k]) || 0}`).join('、')}`);
          });
          // v6.4 / 缺漏#1:多倍數疊加方式(相乘 / 相加)
          const sm = _stackModeLabel(_symStackMode(s, m));
          if (sm) L.push(`  - 多倍數疊加方式：${sm}`);
        });
        prizeSyms.forEach(s => {
          const parts = s.prize_values.map(v => {
            const jp = v.link_jackpot ? `→${v.link_jackpot}` : '';
            return `${v.value}×${jp}`;
          });
          L.push(`- ${s.name || _symId(s)} 彩金 / 面額：${parts.join('、')}`);
        });
        // v6.4 / 缺漏#2:進度倍數梯 + 重置範圍(per-cascade / per-spin / per-feature)
        ladderModes.forEach(md => {
          const scope = _resetScopeLabel((m.mode_reset_scope || {})[md.mode])
            || (md.progress_reset === false ? '全程不重置' : '中斷重置');
          L.push(`- ${md.mode} 進度倍數梯：${md.progress_ladder.join(' → ')}（重置範圍：${scope}）`);
        });
        L.push('');
      }
    }

    // 特殊圖示行為
    if (cfg.specialSyms.length) {
      L.push('## 特殊圖示行為');
      L.push('');
      cfg.specialSyms.forEach(s => {
        const beh = m.special_behavior[_symId(s)];
        L.push(`### ${s.name || _symId(s)}（${_symRole(s) || '特殊'}）`);
        L.push('');
        L.push(beh || '_（待填）_');
        L.push('');
      });
    }

    // v8.8 / R4 B-6:格子屬性(有資料才輸出;規格描述)
    if (Array.isArray(cfg.cellAttrs) && cfg.cellAttrs.length) {
      const _attrLabel = { MULT: '固定格乘數', ENHANCER: '強化格', FRAME: '火框 / 特殊框', GOLD: '金框格', CUSTOM: '自訂' };
      L.push('## 格子屬性');
      L.push('');
      L.push('| 位置 | 型式 | 值 | 適用模式 | 備註 |');
      L.push('| --- | --- | --- | --- | --- |');
      cfg.cellAttrs.forEach(ca => {
        if (!ca || !String(ca.attr_id || '').trim()) return;
        const at = String(ca.attr || 'MULT').toUpperCase();
        const scope = (ca.mode_scope && ca.mode_scope !== 'ALL') ? ca.mode_scope : '全部';
        const notes = String(ca.notes || '').replace(/\|/g, '\\|');
        L.push(`| (R${Number(ca.reel) || '?'}, 列 ${Number(ca.row) || '?'}) | ${_attrLabel[at] || at} | ${(ca.value || '').trim() ? _mdCell(String(ca.value)) : '—'} | ${scope} | ${notes} |`);
      });
      L.push('');
      L.push('> 位置型格子屬性：固定盤面座標上的乘數 / 強化 / 框格宣告，供實作端遵循；本工具不執行。');
      L.push('');
    }

    // v7.11:產牌限制 / 生成期約束(有資料才輸出)
    if (Array.isArray(cfg.genLimits) && cfg.genLimits.length) {
      const _zoneLabel = (z) => {
        const zs = String(z || 'MAIN');
        if (zs === 'MAIN') return '主盤整體';
        if (zs.startsWith('SUB:'))   return `R${zs.slice(4)} 副輪`;
        if (zs.startsWith('PANEL:')) return `副盤 ${zs.slice(6)}`;
        return zs;
      };
      L.push('## 產牌限制 / 生成期約束');
      L.push('');
      L.push('| 符號 | 區域 | 下限 | 上限 | 適用模式 | 備註 |');
      L.push('| --- | --- | --- | --- | --- | --- |');
      cfg.genLimits.forEach(gl => {
        if (!gl || !gl.limit_id) return;
        const minV = (gl.min_count != null && gl.min_count !== '' && Number(gl.min_count) > 0) ? gl.min_count : '—';
        const maxV = (gl.max_count != null && gl.max_count !== '') ? gl.max_count : '—';
        const scope = (gl.mode_scope && gl.mode_scope !== 'ALL') ? gl.mode_scope : '全部';
        const notes = String(gl.notes || '').replace(/\|/g, '\\|');
        L.push(`| ${gl.symbol_id || '?'} | ${_zoneLabel(gl.zone)} | ${minV} | ${maxV} | ${scope} | ${notes} |`);
      });
      L.push('');
      L.push('> 生成期約束（產牌條件）：描述各區域內符號出現數量的上下限，供數值組 / 模擬工具落盤時遵循。');
      L.push('');
    }

    // v8.2 / 缺失清單 F-19:特色規則(09_Puzzle_Rules)——結構化規則進 A.xlsx
    //   卻沒進企劃文件,企劃還得手寫一次 → 補印。純描述,本工具不執行。
    if (Array.isArray(cfg.rules) && cfg.rules.length) {
      L.push('## 特色規則');
      L.push('');
      L.push('| 規則 | 優先序 | 適用模式 | 觸發 | 條件 | 動作 | 說明 |');
      L.push('| --- | --- | --- | --- | --- | --- | --- |');
      const sorted = [...cfg.rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
      sorted.forEach(r => {
        let rid   = _mdCell(r.rule_id || '?') + (r.enabled === false ? '（停用）' : '');
        // v8.4 / R2 P5:隨機擇一組標示
        if (r.random_group) rid += `〔隨機組 ${_mdCell(r.random_group)}｜權重 ${Number(r.random_weight) || 100}〕`;
        // v8.21 / G1:persistent 規則層修飾子標示(每回合重跑)
        if (r.persistent) rid += '〔每回合重跑〕';
        const scope = _mdCell(r.mode_scope || 'ALL');
        const trg   = _RULE_TRIGGER_LABEL[r.trigger] || _mdCell(r.trigger || '');
        const cond  = _mdCell(r.condition || '') || '—';
        const acts  = (Array.isArray(r.actions) ? r.actions : []).map(_ruleActionDesc).filter(Boolean);
        const desc  = _mdCell(r.description || r.notes || '');
        L.push(`| ${rid} | ${r.priority != null ? r.priority : 100} | ${scope} | ${trg} | ${cond} | ${_mdCell(acts.join('；')) || '—'} | ${desc} |`);
      });
      L.push('');
      L.push('> 特色規則為結構化描述（觸發 / 條件 / 動作），供數值組 / 模擬工具實作時遵循；本工具不執行、不計算 RTP。');
      L.push('> 同「隨機組」的規則同時觸發時，依權重隨機擇一執行；描述型動作（擴展整輪／推移／走位／揭示／分裂／相鄰消除／盤面成長；收集值／直接派彩／值乘算／回補回合／盤面壓實／值/型態轉換）之執行語意由下游模擬工具實作。標記「每回合重跑」（persistent）的規則，其動作於每個 spin／respin 重複套用。');
      L.push('');
    }
    // 棄牌規則(10_Discard_Rules;有資料才輸出)
    if (Array.isArray(cfg.discards) && cfg.discards.length) {
      L.push('### 棄牌規則');
      L.push('');
      L.push('| 規則 | 類型 | 適用模式 | 條件 | 說明 |');
      L.push('| --- | --- | --- | --- | --- |');
      cfg.discards.forEach(d => {
        L.push(`| ${_mdCell(d.discard_id || '?')} | ${_mdCell(d.discard_kind || '')} | ${_mdCell(d.mode_scope || 'ALL')} | ${_mdCell(d.condition || '') || '—'} | ${_mdCell(d.notes || '')} |`);
      });
      L.push('');
    }

    // v8.2 / 缺失清單 F-20:輪帶總覽(04b;有實體輪帶才輸出)
    {
      const rs = cfg.reelStrips || {};
      const strips = (rs.strips && typeof rs.strips === 'object') ? rs.strips : {};
      const rows = [];
      for (const [mode, byReel] of Object.entries(strips)) {
        if (!byReel || typeof byReel !== 'object') continue;
        for (const [rid, arr] of Object.entries(byReel)) {
          if (!Array.isArray(arr) || !arr.length) continue;
          rows.push({ mode, rid: Number(rid), len: arr.length, dist: _stripDistSummary(arr) });
        }
      }
      if (rows.length) {
        rows.sort((a, b) => (a.mode === b.mode ? a.rid - b.rid : String(a.mode).localeCompare(String(b.mode))));
        L.push('## 輪帶總覽');
        L.push('');
        L.push(rs.enabled
          ? '- 實體輪帶：**已啟用**（落盤以輪帶視窗抽樣；權重表僅供對照）。'
          : '- 實體輪帶：未啟用（以下為存檔中的輪帶描述，落盤採權重表）。');
        L.push('');
        L.push('| 模式 | 輪 | 長度 | 符號分佈 |');
        L.push('| --- | --- | --- | --- |');
        rows.forEach(r => L.push(`| ${_mdCell(r.mode)} | ${r.rid} | ${r.len} | ${_mdCell(r.dist)} |`));
        L.push('');
      }
    }

    // v8.2 / 缺失清單 F-20:盤面格數分佈(05_Grid_Size_Weights;有資料才輸出)
    {
      const gw = cfg.gridWeights || {};
      const reelCount = Array.isArray(cfg.layout) ? cfg.layout.length : 0;
      const lines = [];
      for (const md of cfg.modes) {
        const mn = md && md.mode; if (!mn) continue;
        const e = gw[mn];
        if (!e || !Array.isArray(e.grid_sizes) || !e.grid_sizes.length) continue;
        for (let r = 1; r <= reelCount; r++) {
          const parts = [];
          let total = 0;
          for (const sz of e.grid_sizes) {
            const w = e.weights ? Number(e.weights[`${r}-${sz}`]) : 0;
            if (w > 0) total += w;
          }
          for (const sz of e.grid_sizes) {
            const w = e.weights ? Number(e.weights[`${r}-${sz}`]) : 0;
            if (w > 0) parts.push(`${sz} 列：${w}${total ? `（${Math.round(w / total * 1000) / 10}%）` : ''}`);
          }
          if (parts.length) lines.push(`| ${_mdCell(mn)} | ${r} | ${parts.join(' · ')} |`);
        }
      }
      if (lines.length) {
        L.push('## 盤面格數分佈');
        L.push('');
        L.push('| 模式 | 輪 | 高度：權重（%） |');
        L.push('| --- | --- | --- |');
        lines.forEach(x => L.push(x));
        L.push('');
        L.push('> 各輪每局有效高度的抽樣分佈（Megaways 類）；百分比為同輪權重正規化。');
        L.push('');
      }
    }

    // v6.4 / 缺漏#9+#10:合規數值披露(任一欄有值才輸出)
    {
      const d = m.disclosure || {};
      const hasAny = ['rtp', 'rtp_ante', 'volatility', 'hit_rate', 'max_win', 'max_win_note'].some(k => String(d[k] ?? '').trim() !== '' && d[k] !== 0);
      if (hasAny) {
        L.push('## 合規數值披露');
        L.push('');
        L.push('| 指標 | 數值 |');
        L.push('| --- | --- |');
        if (String(d.rtp ?? '').trim() !== '' && Number(d.rtp)) L.push(`| 理論 RTP | ${d.rtp}% |`);
        if (String(d.rtp_ante ?? '').trim() !== '' && Number(d.rtp_ante)) L.push(`| 加押(Ante) RTP | ${d.rtp_ante}% |`);
        if (String(d.volatility ?? '').trim() !== '') L.push(`| 波動度 | ${d.volatility} |`);
        if (String(d.hit_rate ?? '').trim() !== '' && Number(d.hit_rate)) L.push(`| 命中率 | ${d.hit_rate}% |`);
        if (String(d.max_win ?? '').trim() !== '') {
          const note = String(d.max_win_note ?? '').trim() ? `（${d.max_win_note}）` : '';
          L.push(`| 最大贏分 | ${d.max_win}${note} |`);
        }
        // v8.20 / G 界-3:結構化封頂(與上方 max_win 字串並存;-1=無上限、>0=硬上限)
        {
          const cap = Number((m.global || {}).max_win_cap);
          if (Number.isFinite(cap) && cap !== 0) {
            L.push(`| 最大贏分封頂 | ${cap < 0 ? '明示無上限' : cap.toLocaleString('en-US') + '× 注額（硬上限）'} |`);
          }
        }
        L.push('');
        L.push('> 數值為規劃/披露起點，正式機率與 RTP 須由數值組重算後回填。');
        L.push('');
      }
    }

    // JACKPOT（v6.4 / 缺漏#5:has_jackpot===false 視為無彩池,整段跳過）
    if (m.flags.has_jackpot !== false && m.jackpot.rows && m.jackpot.rows.length) {
      L.push('## JACKPOT');
      L.push('');
      L.push('| ' + m.jackpot.rows.map(j => j.name).join(' | ') + ' |');
      L.push('| ' + m.jackpot.rows.map(() => '---').join(' | ') + ' |');
      L.push('| ' + m.jackpot.rows.map(j => j.mult).join(' | ') + ' |');
      if (m.jackpot.rows.some(j => j.kind)) {
        L.push('| ' + m.jackpot.rows.map(j => j.kind === 'PROGRESSIVE' ? '累積' : '固定').join(' | ') + ' |');
      }
      if (m.jackpot.rows.some(j => j.kind === 'PROGRESSIVE')) {
        L.push('| ' + m.jackpot.rows.map(j => j.kind === 'PROGRESSIVE' ? `抽成 ${j.increment_pct || 0}%` : '—').join(' | ') + ' |');
        L.push('| ' + m.jackpot.rows.map(j => j.kind === 'PROGRESSIVE' ? (j.must_hit_by ? `必開 ${j.must_hit_by}x` : '必開:無') : '—').join(' | ') + ' |');
      }
      if (m.jackpot.note) { L.push(''); L.push(m.jackpot.note); }
      L.push('');
    }

    // FREE GAME
    L.push('## FREE GAME' + (m.numbers_are_placeholder ? '（局數 / 數值為佔位）' : ''));
    L.push('');
    L.push(`- 觸發方式：${m.freegame.trigger || '_（待填）_'}`);
    // v6.4 / 缺漏#4:scatter-pay 觸發給付(觸發即付,非連線賠付)
    {
      const tp = (m.freegame.trigger_pays || []).filter(t => t && (Number(t.count) || Number(t.pay)));
      if (tp.length) {
        const parts = tp.map(t => `${t.count} 個 → ${t.pay}x`);
        L.push(`- 觸發給付（依 scatter 數，觸發即付）：${parts.join('、')}`);
      }
    }
    if ((Number(m.freegame.min_spins) || 0) > 0) L.push(`- 局數：最少 ${m.freegame.min_spins} 局`);
    L.push(`- 加局：${m.freegame.add_spins}`);
    L.push(`- 上限：${m.freegame.cap === '有' ? ('有（' + (m.freegame.cap_value || '待填') + '）') : m.freegame.cap}`);
    if (m.freegame.enter_board) L.push(`- 進入盤面：${m.freegame.enter_board}`);
    if (m.freegame.exit_board) L.push(`- 結束盤面：${m.freegame.exit_board}`);
    L.push('');

    // v5.6:數值機制（投注 / 倍數 / 金幣）— 僅有設定時輸出
    const _bc = cfg.betConfig || {};
    if (_bc.ante_bet_enabled || (_bc.buy_feature_enabled && Array.isArray(_bc.buy_features) && _bc.buy_features.length)) {
      L.push('## 加押 / 購買');
      L.push('');
      if (_bc.ante_bet_enabled) {
        L.push(`- **Extra Bet（加押）**：成本 ×${Number(_bc.ante_bet_mult) || 0} 注額，觸發倍率 ×${Number(_bc.ante_bet_trigger_mult) || 0}${_bc.ante_bet_desc ? '　—　' + _bc.ante_bet_desc : ''}`);
      }
      if (_bc.buy_feature_enabled && Array.isArray(_bc.buy_features) && _bc.buy_features.length) {
        L.push('');
        L.push('| Buy Feature | 目標模式 | 成本×注額 | RTP目標 | 備註 |');
        L.push('| --- | --- | --- | --- | --- |');
        _bc.buy_features.forEach(f => {
          L.push(`| ${f.bf_id || ''} | ${f.target_mode || ''} | ${Number(f.cost_mult) || 0} | ${(Number(f.rtp_target) || 0)}% | ${(f.notes || '').replace(/\|/g, '\\|')} |`);
        });
      }
      L.push('');
    }

    // v6.3:已遷移時,倍數/彩金一律由上方「## 倍數 / 彩金」(符號版)承載;
    //   這裡的 legacy 區塊只在「遷移前過渡狀態」才輸出,避免同份文件出現兩套且不同步。
    const _mp = cfg.multipliers || {};
    const _migrated = !!_mp.migrated_to_symbols;
    if (!_migrated && (_mp.wild_mult_enabled || _mp.progress_enabled || _mp.random_enabled)) {
      L.push('## 倍數系統');
      L.push('');
      if (_mp.wild_mult_enabled) {
        const vals = Array.isArray(_mp.wild_mult_values) ? _mp.wild_mult_values : [];
        if (vals.length) {
          const tot = vals.reduce((a, v) => a + (Number(v.weight) || 0), 0) || 1;
          L.push('- **Wild 倍數**（權重表）：' + vals.map(v => `×${Number(v.mult) || 0}（${((Number(v.weight) || 0) / tot * 100).toFixed(1)}%）`).join('、'));
        } else {
          L.push(`- **Wild 倍數**：固定 ×${Number(_mp.wild_mult_fixed) || 0}`);
        }
      }
      if (_mp.progress_enabled) {
        const lad = _mp.progress_ladders || {};
        const resetTxt = _mp.progress_reset_on_mode === false ? '切模式不重置' : '切模式重置';
        L.push(`- **進度倍數**（${resetTxt}）：` + Object.keys(lad).map(mo => `${mo} = ${Array.isArray(lad[mo]) ? lad[mo].join('→') : ''}`).join('；'));
      }
      if (_mp.random_enabled) {
        const vals = Array.isArray(_mp.random_values) ? _mp.random_values : [];
        const tot = vals.reduce((a, v) => a + (Number(v.weight) || 0), 0) || 1;
        L.push(`- **隨機倍數**（承載符號 ${_mp.random_symbol_id || '—'}）：` + vals.map(v => `×${Number(v.mult) || 0}（${((Number(v.weight) || 0) / tot * 100).toFixed(1)}%）`).join('、'));
      }
      L.push('');
    }

    const _cv = cfg.coinValues || {};
    if (!_migrated && _cv.enabled && Array.isArray(_cv.denominations) && _cv.denominations.length) {
      L.push('## 金幣面額（Hold&Win）');
      L.push('');
      L.push(`- 金幣符號：**${_cv.coin_symbol_id || 'COIN'}**`);
      L.push('');
      const _modeNames = cfg.modes.map(md => md.mode).filter(Boolean);
      L.push('| 標籤 / 面額 | 面額×注額 | 連結JP | ' + _modeNames.map(mn => 'W_' + mn).join(' | ') + ' |');
      L.push('| --- | --- | --- | ' + _modeNames.map(() => '---').join(' | ') + ' |');
      _cv.denominations.forEach(d => {
        const wm = _modeNames.map(mn => (d.weight_by_mode ? (Number(d.weight_by_mode[mn]) || 0) : 0));
        L.push(`| ${d.label || ('×' + (Number(d.value) || 0))} | ${d.link_jackpot ? '（依JP）' : (Number(d.value) || 0)} | ${d.link_jackpot || '—'} | ${wm.join(' | ')} |`);
      });
      L.push('');
    }

    // v8.0:舊「## Bonus 小遊戲（舊版獨立清單）」段已移除——bonus 全面併入模式玩法種類
    //   (見上方「## 各模式 bonus 小遊戲」)。17_Bonus_Games 資料層於 v8.0 移除。


    return L.join('\n');
  }

  // ════════════════════════════════════════════════════════════════════
  //  暴露 I/O 層
  // ════════════════════════════════════════════════════════════════════
  SP.DocGen = {
    LS_DOCMETA_KEY,
    collectConfig,
    defaultMeta,
    loadMeta,
    saveMeta,
    mergeMeta,
    buildPlanXlsxBuffer,
    buildCompanyXlsxBuffer,
    _xlsxToXlsmBuffer,
    buildMechMarkdown,
    behaviorTemplate,
    _jackpotRowsFromConfig,   // v5.1
    _isSpecial, _symId, _symRole,
    // v7.5-B:中獎線 ASCII renderer(純函式,可單測)
    _parsePathPoints, _mainBoardGeom, _renderPaylineAscii, _pathArrowStr,
  };

  // ════════════════════════════════════════════════════════════════════
  //  Vue component：DocGenPage（子分頁 UI）
  // ════════════════════════════════════════════════════════════════════
  const TEMPLATE = `
  <div class="docgen">
    <!-- 頂部 sticky 動作列：機制 MD 為主要動作 -->
    <div class="docgen-actionbar">
      <div class="docgen-actions">
        <button class="btn btn-primary" @click="exportMd" :disabled="busy">📝 機制文件 (MD)</button>
        <button class="btn" @click="exportXlsx" :disabled="busy">📊 企劃文件 (Excel)</button>
        <button class="btn" @click="exportCompanyXlsx" :disabled="busy">📗 企劃書（公司格式）</button>
        <button class="btn" @click="save" :disabled="busy">💾 儲存敘述</button>
      </div>
      <div class="docgen-hint" v-if="hint">{{ hint }}</div>
    </div>

    <!-- 設定檔自動帶入摘要 + #0 連動開關 -->
    <div class="docgen-summary glass-panel-flat">
      <div class="docgen-sum-title" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span>設定檔自動帶入{{ meta.inherit_config === false ? '（連動已關閉）' : '' }}</span>
        <label style="font-size:12px; font-weight:400; display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" v-model="meta.inherit_config"> 連動各分頁設定
        </label>
        <label style="margin-left:10px;" title="勾選後文件頂部與賠付表/局數段自動標註「佔位」（公版化流程：先出架構、數值後補）">
          <input type="checkbox" v-model="meta.numbers_are_placeholder"> 數值為佔位
        </label>
      </div>
      <div class="docgen-sum-grid">
        <div><span class="docgen-sum-k">盤面</span><span class="docgen-sum-v">{{ cfg.derived.gridStr || '—' }}</span></div>
        <div><span class="docgen-sum-k">連線</span><span class="docgen-sum-v">{{ cfg.derived.payTypeLabel }}<template v-if="!cfg.derived.isScatterLike && cfg.derived.waysCount">／{{ cfg.derived.waysCount }} 種</template><template v-else-if="cfg.derived.isScatterLike">／賠付方式</template></span></div>
        <div><span class="docgen-sum-k">模式</span><span class="docgen-sum-v">{{ cfg.modes.map(m => m.mode).filter(Boolean).join(' / ') || '—' }}</span></div>
        <div><span class="docgen-sum-k">圖示</span><span class="docgen-sum-v">一般 {{ cfg.normalSyms.length }}・特殊 {{ cfg.specialSyms.length }}</span></div>
      </div>
      <div v-if="meta.inherit_config === false" style="font-size:11px; color:var(--text-light); margin-top:6px;">
        連動已關閉:模式描述／JP 等不再自動帶入,只用你手填的內容;上方基本資訊仍跟隨全域設定。
      </div>
    </div>

    <!-- 基本資訊 -->
    <div class="docgen-sec">
      <div class="docgen-sec-h">基本資訊</div>
      <div class="docgen-row2">
        <div><div class="field-label">遊戲名稱</div><input class="input" v-model="meta.game_name" placeholder="例：Fortune Harmony"></div>
        <div><div class="field-label">競品網址</div><input class="input" v-model="meta.competitor_url" placeholder="參考連結"></div>
      </div>
      <div class="docgen-row2">
        <div><div class="field-label">主題選用</div><input class="input" v-model="meta.theme_pick"></div>
        <div><div class="field-label">風格選用</div><input class="input" v-model="meta.style_pick" placeholder="例：百搭SLOT"></div>
      </div>
      <div class="field-label">屬性勾選</div>
      <div class="docgen-flags">
        <label><input type="checkbox" v-model="meta.flags.wild"> 百搭</label>
        <label><input type="checkbox" v-model="meta.flags.payline"> 連線</label>
        <label><input type="checkbox" v-model="meta.flags.symbol_count"> 圖示數量</label>
        <label><input type="checkbox" v-model="meta.flags.special"> 特殊</label>
      </div>
    </div>

    <!-- 連線 / 計分 / 滾動 -->
    <div class="docgen-sec">
      <div class="docgen-sec-h">連線 / 計分 / 滾動</div>
      <div class="field-label">連線方式</div>
      <select class="input" v-model="meta.payline_method">
        <option v-for="o in PAYLINE_METHODS" :key="o" :value="o">{{ o }}</option>
      </select>
      <div class="field-label">補盤方式</div>
      <select class="input" v-model="meta.refill_method">
        <option value="">（無 / 不適用）</option>
        <option v-for="o in REFILL_METHODS" :key="o" :value="o">{{ o }}</option>
      </select>
      <div class="field-label">滾動方式 · 主盤</div>
      <select class="input" v-model="meta.scroll_main">
        <option v-for="o in SCROLL_METHODS" :key="'sm'+o" :value="o">{{ o }}</option>
      </select>
      <div class="field-label">滾動方式 · 副盤</div>
      <select class="input" v-model="meta.scroll_sub">
        <option value="">（無副盤 / 同主盤）</option>
        <option v-for="o in SCROLL_METHODS" :key="'ss'+o" :value="o">{{ o }}</option>
      </select>
      <div class="field-label">得分公式</div>
      <select class="input" v-model="meta.score_formula">
        <option v-for="o in SCORE_FORMULAS" :key="o" :value="o">{{ o }}</option>
      </select>
      <div class="field-label">連線方式補充（選填，自由文字）</div>
      <textarea class="input docgen-ta" v-model="meta.payline_desc"
        placeholder="補充說明（會附在連線方式之後）"></textarea>
    </div>

    <!-- 遊戲概述 / 模式描述 -->
    <div class="docgen-sec">
      <div class="docgen-sec-h">遊戲概述 / 模式描述</div>
      <div class="field-label">遊戲概述</div>
      <textarea class="input docgen-ta" v-model="meta.game_overview"
        placeholder="例：本遊戲模式共有一般遊戲、FREE GAME、BONUS GAME。"></textarea>
      <template v-for="md in cfg.modes" :key="md.mode">
        <div v-if="md.mode" class="field-label">模式 {{ md.mode }} 描述</div>
        <input v-if="md.mode" class="input" v-model="meta.mode_desc[md.mode]"
          :placeholder="md.notes || '一句話描述此模式'">
        <div v-if="md.mode" class="field-label" style="margin-top:6px">模式 {{ md.mode }}　跑馬燈文字</div>
        <textarea v-if="md.mode" class="input docgen-ta" v-model="meta.mode_marquee[md.mode]"
          placeholder="此模式跑馬燈輪播文案(每行一句)"></textarea>
        <div v-if="md.mode" class="field-label">模式 {{ md.mode }}　事件規劃</div>
        <textarea v-if="md.mode" class="input docgen-ta" v-model="meta.mode_event[md.mode]"
          placeholder="預報 / 聽牌 / 特殊事件演出規劃"></textarea>
        <div v-if="md.mode" class="field-label">模式 {{ md.mode }}　快停 / 跳過</div>
        <textarea v-if="md.mode" class="input docgen-ta" v-model="meta.mode_quickstop[md.mode]"
          placeholder="快停 / 跳過機制(可留空)"></textarea>
      </template>
    </div>

    <!-- 特殊圖示行為 -->
    <div class="docgen-sec" v-if="cfg.specialSyms.length">
      <div class="docgen-sec-h">特殊圖示行為</div>
      <template v-for="s in cfg.specialSyms" :key="symId(s)">
        <div class="docgen-beh-head">
          <div class="field-label" style="margin:0">{{ s.name || symId(s) }}（{{ role(s) || '特殊' }}）</div>
          <button class="docgen-tpl-btn" @click="fillBehavior(s)"
            title="帶入此類型的預設說明樣板（之後可手動修改）">✨ 帶入樣板</button>
        </div>
        <textarea class="input docgen-ta" v-model="meta.special_behavior[symId(s)]"
          placeholder="描述此圖示的出現輪、替代規則、收集 / 觸發行為等"></textarea>
      </template>
    </div>

    <!-- 數值正確性 / 合規（v6.4） -->
    <div class="docgen-sec">
      <div class="docgen-sec-h">數值正確性 / 合規（v6.4）</div>

      <div class="field-label">合規數值披露（留空則文件不輸出此段；正式值由數值組重算）</div>
      <div class="docgen-row3">
        <div><div class="field-label">理論 RTP %</div><input class="input input-center" type="number" step="0.01" v-model.number="meta.disclosure.rtp"></div>
        <div><div class="field-label">加押 RTP %</div><input class="input input-center" type="number" step="0.01" v-model.number="meta.disclosure.rtp_ante"></div>
        <div><div class="field-label">命中率 %</div><input class="input input-center" type="number" step="0.01" v-model.number="meta.disclosure.hit_rate"></div>
      </div>
      <div class="docgen-row2">
        <div><div class="field-label">波動度</div>
          <select class="input" v-model="meta.disclosure.volatility">
            <option value="">（未填）</option>
            <option value="低">低</option><option value="中">中</option>
            <option value="中高">中高</option><option value="高">高</option><option value="極高">極高</option>
          </select></div>
        <div><div class="field-label">最大贏分（可含區間，例 5,000x）</div><input class="input" v-model="meta.disclosure.max_win" placeholder="例：5,000x"></div>
      </div>
      <div class="field-label">最大贏分備註（多來源說法不一時標註）</div>
      <input class="input" v-model="meta.disclosure.max_win_note" placeholder="例：各來源說法不一（1,708x / 25,000x / 100,000x）">

      <div class="field-label" style="margin-top:10px">多倍數疊加方式（缺漏#1：相乘 vs 相加，對 RTP 影響大）</div>
      <select class="input" v-model="meta.mult_stack_mode">
        <option value="">（不標示 / 視符號而定）</option>
        <option value="MUL">相乘（×3×5＝×15，如 MW2 WILD）</option>
        <option value="ADD">相加（×3＋×5＝×8，如 Buffalo / Gates）</option>
      </select>
      <div class="docgen-hint-line">此為文件層預設；個別符號若帶 mult_stack_mode 則以符號為準。</div>

      <template v-if="cfg.modes.filter(md => md.mode).length">
        <div class="field-label" style="margin-top:10px">進度倍數重置範圍（缺漏#2：per-cascade / per-spin / per-feature）</div>
        <template v-for="md in cfg.modes" :key="'rs'+md.mode">
          <div v-if="md.mode" class="docgen-row2" style="align-items:center;">
            <div class="docgen-sum-k" style="padding-left:2px;">模式 {{ md.mode }}</div>
            <select class="input" v-model="meta.mode_reset_scope[md.mode]">
              <option value="">（沿用既有：{{ md.progress_reset === false ? '不重置' : '中斷重置' }}）</option>
              <option value="CASCADE">每次連線中斷重置（per-cascade）</option>
              <option value="SPIN">每局重置（per-spin）</option>
              <option value="FEATURE">整個 feature 全程不重置（per-feature）</option>
            </select>
          </div>
        </template>
      </template>
    </div>

    <!-- JACKPOT -->
    <div class="docgen-sec">
      <div class="docgen-sec-h">JACKPOT
        <button class="btn btn-sm docgen-jp-sync" @click="syncJpFromConfig" v-if="meta.flags.has_jackpot !== false"
                title="以設定檔(01_Global · JP 定義 → 13_Jackpots)覆蓋下方列表">
          ⇆ 從設定檔帶入
        </button>
      </div>
      <label style="font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer; margin-bottom:8px;">
        <input type="checkbox" v-model="meta.flags.has_jackpot"> 本遊戲有傳統 / 累積彩池（取消勾選 → 文件與匯出皆跳過整個 JACKPOT 段）
      </label>
      <template v-if="meta.flags.has_jackpot !== false">
      <div class="docgen-hint-line">
        JP 來源:設定檔編輯器 01_Global「JP 定義」;下方為可覆寫的文件副本,按「從設定檔帶入」重新同步。
      </div>
      <div class="docgen-jp">
        <div class="docgen-jp-row" v-for="(j, i) in meta.jackpot.rows" :key="i">
          <input class="input" v-model="j.name" placeholder="名稱">
          <input class="input" type="number" v-model.number="j.mult" placeholder="倍數">
          <button class="btn-ghost-x" @click="removeJp(i)" title="移除">✕</button>
        </div>
        <button class="btn" @click="addJp">＋ 新增 JP</button>
      </div>
      <div class="field-label" style="margin-top:10px">JACKPOT 備註</div>
      <input class="input" v-model="meta.jackpot.note">
      </template>
      <div v-else class="docgen-hint-line">已標記為「無彩池」：機制文件 / 企劃 Excel 都不會輸出 JACKPOT 段。</div>
    </div>

    <!-- FREE GAME -->
    <div class="docgen-sec">
      <div class="docgen-sec-h">FREE GAME</div>
      <div class="field-label">觸發方式</div>
      <textarea class="input docgen-ta" v-model="meta.freegame.trigger"
        placeholder="例：一般遊戲中於第 2、3、4 輪出現至少 1 個 FREE 圖示即進入 FG。"></textarea>
      <div class="field-label" style="margin-top:8px">觸發給付（scatter-pay，觸發即付，非連線賠付）</div>
      <div class="docgen-hint-line">例：4 個 → 5x、5 個 → 20x、6 個 → 100x（Buffalo / Gates 的 scatter 觸發給付）。</div>
      <div class="docgen-jp">
        <div class="docgen-jp-row" v-for="(t, i) in meta.freegame.trigger_pays" :key="'tp'+i">
          <input class="input input-center" type="number" v-model.number="t.count" placeholder="scatter 數">
          <input class="input input-center" type="number" v-model.number="t.pay" placeholder="給付 x">
          <button class="btn-ghost-x" @click="removeTriggerPay(i)" title="移除">✕</button>
        </div>
        <button class="btn" @click="addTriggerPay">＋ 新增觸發給付</button>
      </div>
      <div class="docgen-row2">
        <div><div class="field-label">進入盤面顯示</div><input class="input" v-model="meta.freegame.enter_board"></div>
        <div><div class="field-label">結束盤面顯示</div><input class="input" v-model="meta.freegame.exit_board"></div>
      </div>
      <div class="docgen-row3">
        <div><div class="field-label">最少局數</div><input class="input input-center" type="number" v-model.number="meta.freegame.min_spins"></div>
        <div><div class="field-label">加局</div>
          <select class="input" v-model="meta.freegame.add_spins"><option>有</option><option>無</option></select></div>
        <div><div class="field-label">上限</div>
          <select class="input" v-model="meta.freegame.cap"><option>無</option><option>有</option></select></div>
      </div>
      <div v-if="meta.freegame.cap === '有'">
        <div class="field-label">上限值</div>
        <input class="input" v-model="meta.freegame.cap_value">
      </div>
    </div>
  </div>`;

  SP.DocGenPage = {
    template: TEMPLATE,
    emits: ['status'],
    setup(props, { emit }) {
      const { ref, reactive, computed } = Vue;
      const cfg = reactive(SP.DocGen.collectConfig());
      const meta = reactive(SP.DocGen.loadMeta());
      const busy = ref(false);
      const hint = ref('');

      function setHint(t, type) { hint.value = t; emit('status', { type: type || 'wait', msg: t }); }
      function symId(s) { return SP.DocGen._symId(s); }
      function role(s) { return SP.DocGen._symRole(s); }

      function refreshConfig() {
        Object.assign(cfg, SP.DocGen.collectConfig());
        // #0:連動關閉時,只更新基本資訊(cfg),不把各分頁設定回灌覆蓋手填內容
        if (meta.inherit_config === false) { setHint('已重讀基本資訊（連動關閉,描述欄維持手填）', 'ok'); return; }
        Object.assign(meta, SP.DocGen.mergeMeta(JSON.parse(JSON.stringify(meta)), cfg));
      }

      function save() {
        SP.DocGen.saveMeta(JSON.parse(JSON.stringify(meta)));
        setHint('✔ 已儲存敘述（下次進站自動帶回）', 'ok');
      }
      function addJp() { meta.jackpot.rows.push({ name: '', mult: 0 }); }
      function removeJp(i) { meta.jackpot.rows.splice(i, 1); }
      // v6.4 / 缺漏#4:觸發給付列編輯
      function addTriggerPay() {
        if (!Array.isArray(meta.freegame.trigger_pays)) meta.freegame.trigger_pays = [];
        meta.freegame.trigger_pays.push({ count: 0, pay: 0 });
      }
      function removeTriggerPay(i) { meta.freegame.trigger_pays.splice(i, 1); }
      // v5.1:以設定檔 JP 定義覆蓋文件副本
      function syncJpFromConfig() {
        const rows = SP.DocGen._jackpotRowsFromConfig ? SP.DocGen._jackpotRowsFromConfig() : null;
        if (!rows) { setHint('設定檔尚未定義 JP(01_Global → JP 定義)', 'warn'); return; }
        meta.jackpot.rows.splice(0, meta.jackpot.rows.length, ...rows);
        setHint(`已自設定檔帶入 ${rows.length} 個 JP`, 'ok');
      }

      function fillBehavior(s) {
        const id = symId(s);
        const tpl = SP.DocGen.behaviorTemplate(s);
        const cur = (meta.special_behavior[id] || '').trim();
        if (cur && !confirm(`「${s.name || id}」已有內容，要覆蓋為預設樣板嗎？`)) return;
        meta.special_behavior[id] = tpl;
        setHint(`已帶入「${s.name || id}」的樣板，可再手動修改`, 'ok');
      }

      function _download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      function _baseName() {
        const n = (meta.game_name || '企劃').trim().replace(/[\\/:*?"<>|]+/g, '_');
        return n || '企劃';
      }

      async function exportXlsx() {
        if (busy.value) return;
        busy.value = true;
        try {
          save();
          setHint('產生企劃文件中…');
          const buf = await SP.DocGen.buildPlanXlsxBuffer(JSON.parse(JSON.stringify(meta)));
          const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          _download(blob, `${_baseName()}_企劃文件.xlsx`);
          setHint('✔ 企劃文件已匯出', 'ok');
        } catch (e) {
          console.error(e); setHint(`匯出失敗：${e.message || e}`, 'err');
        } finally { busy.value = false; }
      }
      function exportMd() {
        if (busy.value) return;
        busy.value = true;
        try {
          save();
          const md = SP.DocGen.buildMechMarkdown(JSON.parse(JSON.stringify(meta)));
          const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
          _download(blob, `${_baseName()}_機制文件.md`);
          setHint('✔ 機制文件已匯出', 'ok');
        } catch (e) {
          console.error(e); setHint(`匯出失敗：${e.message || e}`, 'err');
        } finally { busy.value = false; }
      }

      async function exportCompanyXlsx() {
        if (busy.value) return;
        busy.value = true;
        try {
          save();
          setHint('產生企劃書（公司格式）中…');
          const buf = await SP.DocGen.buildCompanyXlsxBuffer(JSON.parse(JSON.stringify(meta)));
          // v8.10:公司格式改出 .xlsm(macro-enabled;目前無巨集,巨集之後由公司範本嵌入)
          const xlsmBuf = SP.DocGen._xlsxToXlsmBuffer ? SP.DocGen._xlsxToXlsmBuffer(buf) : null;
          if (xlsmBuf) {
            const blob = new Blob([xlsmBuf], { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });
            _download(blob, `${_baseName()}_企劃書.xlsm`);
            setHint('✔ 企劃書（公司格式 .xlsm）已匯出', 'ok');
          } else {
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            _download(blob, `${_baseName()}_企劃書.xlsx`);
            setHint('✔ 企劃書已匯出（fflate 未載入,退回 .xlsx）', 'ok');
          }
        } catch (e) {
          console.error(e); setHint(`匯出失敗：${e.message || e}`, 'err');
        } finally { busy.value = false; }
      }

      return { cfg, meta, busy, hint, symId, role, save, addJp, removeJp, syncJpFromConfig, fillBehavior, exportXlsx, exportMd, exportCompanyXlsx, refreshConfig,
        addTriggerPay, removeTriggerPay,
        PAYLINE_METHODS, REFILL_METHODS, SCROLL_METHODS, SCORE_FORMULAS };
    },
  };

  console.log('[docgen] loaded');
})();
