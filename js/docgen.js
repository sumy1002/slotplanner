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
    const bonusGames  = _readLS('slotplanner.aconfig.bonusgames.v1', {});   // v6.0-c
    const genLimits   = _readLS('slotplanner.aconfig.genLimits.v1', []);    // v7.11

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
      multipliers: (multipliers && typeof multipliers === 'object') ? multipliers : {},
      coinValues: (coinValues && typeof coinValues === 'object') ? coinValues : {},
      bonusGames: (bonusGames && Array.isArray(bonusGames.games)) ? bonusGames.games : [],   // v6.0-c
      genLimits: Array.isArray(genLimits) ? genLimits : [],   // v7.11
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
        .map(r => ({ count: Number(r.count), pay: Number(r.pay) }))
        .sort((a, b) => b.count - a.count);
    }
    const rows = [];
    for (const n of [9, 8, 7, 6, 5, 4, 3, 2]) {
      const v = Number(s['pay_' + n + 'x']) || 0;
      if (v > 0) rows.push({ count: n, pay: v });
    }
    return rows;
  }

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
    } else {
      waysLine = cfg.derived.waysCount
        ? `連線型態：${cfg.derived.payTypeLabel}，共 ${cfg.derived.waysCount} 種連線方式。`
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
    kv('連線方式', cfg.derived.isScatterLike
      ? (cfg.derived.payMethodDesc || '')
      : (cfg.derived.waysCount ? `共 ${cfg.derived.waysCount} 種連線方式` : ''));
    kv('局數設定', (Number(m.freegame.min_spins) || 0) > 0 ? `最少 ${m.freegame.min_spins} 局 FREE SPINS` : '');
    kv('加局', m.freegame.add_spins);
    kv('上限', m.freegame.cap === '有' ? `有（${m.freegame.cap_value || TODO}）` : m.freegame.cap);

    // ── Sheet 2：圖示賠付明細（v5.6:動態連線數欄，依實際 pay_rows 決定）──
    const wsS = wb.addWorksheet('圖示賠付明細');
    // 收集所有符號出現過的連線數（由大到小排序），動態建欄
    const countSet = new Set();
    cfg.symbols.forEach(s => _symPayRows(s).forEach(r => countSet.add(r.count)));
    const payCounts = [...countSet].sort((a, b) => b - a);
    if (payCounts.length === 0) payCounts.push(5, 4, 3);   // 全空時給預設三欄
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
    function symRow(s, role) {
      _cell(wsS, SR, 1, s.number !== '' && s.number != null ? s.number : '', { h: 'center' });
      _cell(wsS, SR, 2, s.name || _symId(s));
      _cell(wsS, SR, 3, role || (s.type || ''), { h: 'center' });
      const payByN = {};
      _symPayRows(s).forEach(r => { payByN[r.count] = r.pay; });
      payCounts.forEach((n, i) => _cell(wsS, SR, 4 + i, payByN[n] != null ? payByN[n] : '—', { h: 'center' }));
      _cell(wsS, SR, NCOL_S, '');
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

    // ── Sheet 3：模式明細 ──
    const wsM = wb.addWorksheet('模式明細');
    wsM.columns = [{ width: 10 }, { width: 32 }, { width: 10 }, { width: 12 }, { width: 30 }];
    ['模式', '觸發條件', '局數', '繼承全域', '說明'].forEach((h, i) =>
      _cell(wsM, 1, i + 1, h, { bold: true, bg: C.band, fg: C.bandFg, h: 'center' }));
    cfg.modes.forEach((md, idx) => {
      const r = idx + 2;
      _cell(wsM, r, 1, md.mode, { bold: true, h: 'center' });
      _cell(wsM, r, 2, md.trigger_condition || (md.mode === cfg.derived.startingMode ? '（起始模式）' : ''));
      _cell(wsM, r, 3, md.spin_count || 0, { h: 'center' });
      _cell(wsM, r, 4, md.inherit_globals ? '是' : '否', { h: 'center' });
      _cell(wsM, r, 5, m.mode_desc[md.mode] || md.notes || '');
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
    const hasBet  = bc.ante_bet_enabled || (bc.buy_feature_enabled && Array.isArray(bc.buy_features) && bc.buy_features.length);
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
          vHead(['Buy Feature', '目標模式', '成本×注額', 'RTP目標', '備註']);
          bc.buy_features.forEach(f => {
            _cell(wsV, VR, 1, f.bf_id || '', { h: 'center' });
            _cell(wsV, VR, 2, f.target_mode || '', { h: 'center' });
            _cell(wsV, VR, 3, Number(f.cost_mult) || 0, { h: 'center' });
            _cell(wsV, VR, 4, (Number(f.rtp_target) || 0) + '%', { h: 'center' });
            _cell(wsV, VR, 5, f.notes || '');
            VR++;
          });
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
    } else if (cfg.derived.waysCount) {
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

    // 圖示定義
    L.push('## 圖示定義');
    L.push('');
    L.push(`- 一般圖示 ${cfg.normalSyms.length} 個、特殊圖示 ${cfg.specialSyms.length} 個。`);
    if (cfg.specialSyms.length) {
      cfg.specialSyms.forEach(s => {
        L.push(`- **${s.name || _symId(s)}**（${_symRole(s) || '特殊'}）`);
      });
    }
    L.push('');

    // 賠付表
    L.push('## 賠付表');
    L.push('');
    // v5.6:動態連線數欄
    const mdCountSet = new Set();
    cfg.symbols.forEach(s => _symPayRows(s).forEach(r => mdCountSet.add(r.count)));
    const mdCounts = [...mdCountSet].sort((a, b) => b - a);
    if (mdCounts.length === 0) mdCounts.push(5, 4, 3);
    L.push('| 編號 | 名稱 | 類型 | ' + mdCounts.map(n => n + '連線').join(' | ') + ' |');
    L.push('| --- | --- | --- | ' + mdCounts.map(() => '---').join(' | ') + ' |');
    const mdPayCell = (s, n) => {
      const by = {}; _symPayRows(s).forEach(r => { by[r.count] = r.pay; });
      return by[n] != null ? by[n] : '—';
    };
    cfg.normalSyms.forEach(s => {
      L.push(`| ${s.number ?? ''} | ${s.name || _symId(s)} | ${s.type || ''} | ` + mdCounts.map(n => mdPayCell(s, n)).join(' | ') + ' |');
    });
    cfg.specialSyms.forEach(s => {
      L.push(`| ${s.number ?? ''} | ${s.name || _symId(s)} | ${_symRole(s) || '特殊'} | ` + mdCounts.map(n => mdPayCell(s, n)).join(' | ') + ' |');
    });
    L.push('');

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
          L.push(`- ${s.name || _symId(s)} 倍數：${parts.join('、')}`);
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
    L.push('## FREE GAME');
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

    // v6.0-c:Bonus 小遊戲
    const _bg = cfg.bonusGames || [];
    if (_bg.length) {
      const TLAB = { WHEEL: '輪盤', PICK: '選獎', COLLECTION: '收集' };
      L.push('## Bonus 小遊戲');
      L.push('');
      _bg.forEach(g => {
        L.push(`### ${g.title || g.bonus_id}（${TLAB[g.type] || g.type}）`);
        if (g.trigger_desc) L.push(`- 觸發：${g.trigger_desc}`);
        if (g.mode_scope && g.mode_scope !== 'ALL') L.push(`- 適用模式：${g.mode_scope}`);
        if (g.type === 'WHEEL' && g.wheel_upgrade_to) L.push(`- 升級至：${g.wheel_upgrade_to}`);
        if (g.type === 'PICK') L.push(`- 抽選次數：${Number(g.pick_count) > 0 ? g.pick_count : '抽到結束項為止'}`);
        if (g.type === 'COLLECTION') L.push(`- 目標收集數：${g.collect_target}`);
        if (Array.isArray(g.items) && g.items.length) {
          L.push('');
          if (g.type === 'COLLECTION') {
            L.push('| 獎勵 | 門檻 | 連結JP |');
            L.push('| --- | --- | --- |');
            g.items.forEach(it => L.push(`| ${it.label || ''} | ${Number(it.value) || 0} | ${it.link_jackpot || '—'} |`));
          } else {
            const tot = g.items.reduce((a, it) => a + (Number(it.weight) || 0), 0) || 1;
            L.push('| 項目 | 值×注額 | 權重 | 機率 |' + (g.type === 'PICK' ? ' 結束 |' : '') + ' 連結JP |');
            L.push('| --- | --- | --- | --- |' + (g.type === 'PICK' ? ' --- |' : '') + ' --- |');
            g.items.forEach(it => {
              const pct = ((Number(it.weight) || 0) / tot * 100).toFixed(1) + '%';
              L.push(`| ${it.label || ''} | ${it.link_jackpot ? '（依JP）' : (Number(it.value) || 0)} | ${Number(it.weight) || 0} | ${pct} |`
                + (g.type === 'PICK' ? ` ${it.is_end ? '✓' : ''} |` : '') + ` ${it.link_jackpot || '—'} |`);
            });
          }
        }
        L.push('');
      });
    }

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

      return { cfg, meta, busy, hint, symId, role, save, addJp, removeJp, syncJpFromConfig, fillBehavior, exportXlsx, exportMd, refreshConfig,
        addTriggerPay, removeTriggerPay,
        PAYLINE_METHODS, REFILL_METHODS, SCROLL_METHODS, SCORE_FORMULAS };
    },
  };

  console.log('[docgen] loaded');
})();
