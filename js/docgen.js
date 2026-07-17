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
  // v8.33:公司格式企劃書下拉選項(一般遊戲/FREE GAME 滾動方向與補盤方式)
  const CP_SCROLL_OPTS = ['↑', '↓', '←', '→', '單格↑', '單格↓', '單格←', '單格→', '特殊滾動方式'];
  const CP_REFILL_OPTS = ['無', '滾動方向遞補', '原地補', '特殊補盤'];
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
    // v8.43 / C-1 GAP-T2:條件式輪帶切換二枚(描述型,參數經通用 kv 呈現)
    SYMBOL_SWAP: '輪帶符號置換', SWITCH_STRIP: '輪帶切換',
    // v8.44 / C-2 GAP-P5:面板動態啟停
    PANEL_SET: '面板啟停',
    // v8.49 / 缺口3:計量條容量/當前值動態調整
    METER_ADJUST: '計量調整',
    // v8.51 / 缺口提案12:重新觸發已消耗符號效果
    RETRIGGER: '重新觸發',
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
    // v8.37 / GAP-F2 + 🟢-4/🟢-5(亦可作 GAP-S1 動態動作參數值)
    m = s.match(/^object_pos\.([A-Za-z0-9_]+)\.(row|col)$/);
    if (m) return `「${m[1]}」所在${m[2] === 'row' ? '列' : '欄'}`;
    if (s === 'reel_count') return '當前輪數';
    m = s.match(/^symbol_ways\.([A-Za-z0-9_]+)$/);
    if (m) return `「${m[1]}」構成的 ways 數`;
    // v8.40 / 🟢-3
    m = s.match(/^cluster_shape\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/);
    if (m) return `「${m[1]}」的「${m[2]}」形群數`;
    // v8.41 / 批次A:WinEvent 屬性族(win_contains 為 1/0 謂詞非數值來源,不入)
    if (s === 'win_symbols') return '本筆中獎符號顆數';
    if (s === 'destroyed_count') return '本筆銷毀顆數';
    // v8.45 / 批次D(track_covered 為 1/0 謂詞不入;雙形:SID 全輪最大 / SID.r 指定輪)
    m = s.match(/^reel_stack_count\.([A-Za-z0-9_]+)(?:\.([0-9]+))?$/);
    if (m) return m[2] ? `「${m[1]}」第 ${m[2]} 輪疊數` : `「${m[1]}」的單輪最大疊數`;
    // v8.50 / 缺口提案9-11
    m = s.match(/^meter_value\.([A-Za-z0-9_]+)$/);
    if (m) return `計量條「${m[1]}」的目前累積值`;
    m = s.match(/^reel_spread_count\.([A-Za-z0-9_]+)$/);
    if (m) return `「${m[1]}」出現的輪軸數`;
    m = s.match(/^adjacent_count_dir\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\.(UP|DOWN|LEFT|RIGHT)$/);
    if (m) return `「${m[2]}」${m[3]}方向為「${m[1]}」的顆數`;
    return s;
  }
  // v8.34 / GAP-S1:動態式白話化 — _dynVal 的泛化。
  //   範圍 "2-5" → 「2~5(隨機)」;含四則運算子的公式 → 逐段過 _dynVal 後以
  //   「動態(…)」呈現;單一已知變數 → 沿用 _dynVal 輸出(既有文件零 diff);
  //   其餘(純數字 / 一般字串 / 符號 id)原樣返回 — 對非動態值零侵入。
  function _dynExpr(v) {
    if (typeof v !== 'string') return v;
    const s = v.trim();
    if (!s || /^-?\d+(\.\d+)?$/.test(s)) return v;
    // v8.36 / 🟢-2:符號家族參照白話(group:<gid> / group_any:<gid>)
    let gm = s.match(/^group:(\S+)$/);
    if (gm) return `家族「${gm[1]}」全員`;
    gm = s.match(/^group_any:(\S+)$/);
    if (gm) return `家族「${gm[1]}」隨機一種`;
    let m = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) return `${m[1]}~${m[2]}(隨機)`;
    // 頂層四則切段(本文法無括號/引號巢狀,直接以運算子切;負數字面已被上方數字分支攔下)
    const parts = s.split(/\s*([+\-*/])\s*/);
    if (parts.length > 1 && parts.every(p => p.trim() !== '')) {
      const operands = parts.filter((p, i) => i % 2 === 0);
      const looksExpr = operands.every(p => /^-?\d+(\.\d+)?$/.test(p) || /^[A-Za-z_][A-Za-z0-9_.]*(\.\d+,\d+)?$/.test(p));
      // 動態性證據門檻:至少一個運算元是數字、或至少一段被 _dynVal 譯出,
      //   才視為公式 — 防止含連字號的一般字串(如事件名 fg-trigger)被誤譯。
      const evidence = operands.some(p => /^-?\d+(\.\d+)?$/.test(p) || _dynVal(p) !== p);
      if (looksExpr && evidence) {
        const zh = parts.map((p, i) => (i % 2 === 1) ? p : (/^-?\d+(\.\d+)?$/.test(p) ? p : _dynVal(p)));
        return `動態(${zh.join(' ')})`;
      }
      return v;
    }
    return _dynVal(s);   // 單段 → 既有 _dynVal(未知變數原樣返回)
  }
  // v8.35 / GAP-H1:尺寸分佈編碼 → 白話。"1:80;2:15;3:4" → 「1×1（權重80）、2×2（15）、3×3（4）」;
  //   size 支援 WxH("2x3" → 2×3);任一片段不合格式 → 整串原樣返回(不吞值)。
  function _megaSizesDesc(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return s;
    const parts = s.split(';').map(p => p.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const m = parts[i].match(/^(\d+)(?:[x×](\d+))?\s*:\s*(\d+(?:\.\d+)?)$/);
      if (!m) return s;   // 不合格式 → 原樣
      const w = m[1], h = m[2] || m[1];
      out.push(i === 0 ? `${w}×${h}（權重${m[3]}）` : `${w}×${h}（${m[3]}）`);
    }
    return out.join('、');
  }
  // 單一 action → 「標籤(k=v, k=v)」;params 物件淺列印,未知型別安全
  // v8.4 勘誤:前端規則的 action 型別欄位為 atype(helpers.makeAction);
  //   v8.2 誤讀 a.type 導致實際資料一律印 '?' 回退。atype 優先、type 兼容。
  // ── v8.48 / 項目一 Batch A:新參數白話化(目標參照 SELF、order、manner、dir、參數鍵中文;
  //    皆「命中才譯、否則原樣」)。★關鍵:只對本批「實際改動的四動作」套用,其餘動作
  //    (WALK/GROW_BOARD/NUDGE… 亦持有 dir/track/amount 鍵)輸出逐字不變 → 舊資料零 diff。 ──
  const _V848_ACTS = new Set(['MOVE', 'BOARD_FILL', 'BOARD_TRANSFORM', 'BOARD_DESTROY']);
  const _ACT_PARAM_ZH = {
    subject: '物件', manner: '方式', dir: '方向', amount: '格數', track: '軌道',
    except_if: '排除', order: '順序',
    // 註:positions/from/to 等既有鍵故意不收錄 —— 保持既有 docgen 輸出零 diff(守則:舊資料零 diff)
  };
  const _MANNER_ZH = { TO: '絕對座標', DIR: '依方向', PATH: '沿軌道' };
  const _DIR_ZH = { LEFT: '左', RIGHT: '右', UP: '上', DOWN: '下' };
  const _ORDER_ZH = {
    PAYOUT_DESC: '賠率高→低', PAYOUT_ASC: '賠率低→高', NEAREST: '最近優先',
    FARTHEST: '最遠優先', FIXED_LIST: '固定清單序', RANDOM: '隨機(下游)',
  };
  // 目標參照 token 白話:SELF / SELF_LANDED / SELF:方向(相鄰偏移);非此形式原樣
  function _selfRefZh(v) {
    const s = String(v == null ? '' : v).trim();
    if (s === 'SELF') return '物件當前格';
    if (s === 'SELF_LANDED') return '物件降落格';
    const m = s.match(/^SELF:(LEFT|RIGHT|UP|DOWN)$/);
    if (m) return `物件${_DIR_ZH[m[1]]}鄰格`;
    return s;
  }
  function _ruleActionDesc(a) {
    if (!a || typeof a !== 'object') return '';
    const atype = a.atype || a.type || '';
    const label = _RULE_ACTION_LABEL[atype] || atype || '?';
    const p = (a.params && typeof a.params === 'object') ? a.params : {};
    const isV848 = _V848_ACTS.has(atype);   // v8.48:白話化僅作用於本批四動作,其餘零 diff
    // v8.20 / G5:scope 抽離單獨後綴;value 若為 symbol_count.<SID> 動態值則譯白話。
    const scopeStr = _scopeDesc(p.scope);
    const kv = Object.entries(p)
      .filter(([k, v]) => v !== '' && v != null && k !== 'scope')
      .map(([k, v]) => {
        // v8.48 / 項目一 Batch A:僅本批四動作走專屬白話;命中則用,否則落回泛用 _dynExpr。
        let vv;
        if (isV848 && typeof v === 'string' && k === 'manner')      vv = _MANNER_ZH[v] || v;
        else if (isV848 && typeof v === 'string' && k === 'dir')    vv = _DIR_ZH[v] || v;
        else if (isV848 && typeof v === 'string' && k === 'order')  vv = _ORDER_ZH[v] || v;
        else if (isV848 && typeof v === 'string' && (k === 'positions' || k === 'to') && /^SELF/.test(v.trim()))
                                                                    vv = _selfRefZh(v);
        // v8.21 / G1:value / factor 皆可能為動態值(symbol_count / symbol_value / feature_value_total …)
        // v8.34 / GAP-S1:泛化 — 任何字串值皆過 _dynExpr(範圍/公式白話化;非動態字串原樣)。
        else vv = (typeof v === 'string') ? _dynExpr(v)
                : (Array.isArray(v) ? JSON.stringify(v) : v);
        const kZh = isV848 ? (_ACT_PARAM_ZH[k] || k) : k;   // v8.48:鍵中文僅本批四動作(其餘原樣)
        return `${kZh}=${vv}`;
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
    const reelLinks    = _readLS('slotplanner.aconfig.reellinks.v1', []);    // v8.38 GAP-T1:輪帶連動(唯讀)
    const tracks       = _readLS('slotplanner.aconfig.tracks.v1', []);       // v8.39 GAP-F1:軌道(唯讀)
    const panelsRaw    = _readLS('slotplanner.aconfig.panels.v1', []);       // v8.39:面板捲軸宣告用(唯讀)
    // v8.2 / 缺失清單 F-19/F-20:機制文件補印 特色規則 / 棄牌 / 輪帶 / 格數分佈
    //   (皆為既有 LS 的唯讀取出;純描述輸出,本工具不執行、不計算 RTP)
    const discards    = _readLS('slotplanner.aconfig.discards.v1', []);
    const reelStrips  = _readLS('slotplanner.aconfig.reelstrips.v1', {});
    const gridWeights = _readLS('slotplanner.aconfig.gridweights.v1', {});
    const meters      = _readLS('slotplanner.aconfig.meters.v1', []);       // G-1:收集條(唯讀;含分段門檻)

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
      reelLinks: Array.isArray(reelLinks) ? reelLinks : [],                   // v8.38 GAP-T1
      tracks: Array.isArray(tracks) ? tracks : [],                            // v8.39 GAP-F1
      panels: Array.isArray(panelsRaw) ? panelsRaw : [],                      // v8.39
      multipliers: (multipliers && typeof multipliers === 'object') ? multipliers : {},
      coinValues: (coinValues && typeof coinValues === 'object') ? coinValues : {},
      genLimits: Array.isArray(genLimits) ? genLimits : [],   // v7.11
      // v8.2:
      discards: Array.isArray(discards) ? discards : [],
      reelStrips: (reelStrips && typeof reelStrips === 'object') ? reelStrips : {},
      gridWeights: (gridWeights && typeof gridWeights === 'object') ? gridWeights : {},
      meters: Array.isArray(meters) ? meters : [],   // G-1:收集條(含分段門檻)
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
  const _MODE_KIND_LABEL = { SPIN: '旋轉', WHEEL: '輪盤', PICK: '選獎', COLLECTION: '收集', HOLD_AND_WIN: 'Hold & Win' };
  function _isModeBonus(md) { return !!(md && md.mode_kind && String(md.mode_kind).toUpperCase() !== 'SPIN'); }
  function _modeKindDesc(md) {
    const k = String((md && md.mode_kind) || 'SPIN').toUpperCase();
    return _MODE_KIND_LABEL[k] ? (_MODE_KIND_LABEL[k] + '（' + k + '）') : k;
  }
  // v8.22 / G3:獎項角色 Item_Role 白話(docgen 獨立 IIFE 唯讀 map;未知/空 → '—')
  const _ITEM_ROLE_LABEL = { COIN: '金幣值', COLLECTOR: '收集器', MULTIPLIER: '倍數', BOOST: '增益', JACKPOT: '彩池',
    PLAYER_CHOICE: '玩家選項' };   // v8.45 / 批次D GAP-C1
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
      cp_scroll_ng: '',                      // v8.33:公司格式滾動下拉·一般遊戲(空=自動判別)
      cp_refill_ng: '',                      // v8.33:公司格式補盤下拉·一般遊戲(空=自動判別)
      cp_scroll_fg: '',                      // v8.33:公司格式滾動下拉·FREE GAME(空=同一般遊戲)
      cp_refill_fg: '',                      // v8.33:公司格式補盤下拉·FREE GAME(空=同一般遊戲)
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
        // v8.49 / 缺口4:上限(cap_value)有值才附註,舊資料(cap_value 缺欄/空)輸出零 diff
        _cell(wsX, XR, 4, ((ca.value || '').trim() || '—') + ((ca.cap_value || '').trim() ? `(上限${String(ca.cap_value).trim()})` : ''), { h: 'center' });
        _cell(wsX, XR, 5, (ca.mode_scope && ca.mode_scope !== 'ALL') ? ca.mode_scope : '全部', { h: 'center' });
        _cell(wsX, XR, 6, ca.notes || '');
        XR++;
      });
    }

    // ── G-2:格位狀態(動態)——僅列有 State_Type 的格;set 守衛保既有格子屬性表零 diff。 ──
    if (Array.isArray(cfg.cellAttrs) && cfg.cellAttrs.some(ca => ca && String(ca.state_type || '').trim())) {
      const _stl = { MARKER: '標記', COVER: '遮蓋(需擊破)', COUNTDOWN: '倒數(每spin−1)', COUNTER: '累加' };
      XR++;
      xBand('格位狀態（動態）');
      ['格', '狀態', '初值', '觸發', '觸發後動作', '範圍', '備註'].forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
      XR++;
      cfg.cellAttrs.forEach(ca => {
        if (!ca || !String(ca.state_type || '').trim()) return;
        const st = String(ca.state_type).toUpperCase();
        const anchor = `(R${Number(ca.reel) || '?'}, ${Number(ca.row) || '?'})`;
        _cell(wsX, XR, 1, anchor, { h: 'center' });
        _cell(wsX, XR, 2, _stl[st] || st, { h: 'center' });
        _cell(wsX, XR, 3, (ca.state_init || '').trim() || '—', { h: 'center' });
        _cell(wsX, XR, 4, (ca.state_trigger || '').trim() || '—', { h: 'center' });
        _cell(wsX, XR, 5, (ca.on_state_action || '').trim() || '—', { h: 'center' });
        _cell(wsX, XR, 6, (ca.state_region || '').trim() || anchor, { h: 'center' });
        _cell(wsX, XR, 7, ca.notes || '');
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

    // ── G-1:收集條 / 進度條(有 meters 才建表;無 → 零 diff)。純描述,交下游模擬工具。──
    if (Array.isArray(cfg.meters) && cfg.meters.filter(mt => mt && mt.meter_id).length) {
      const _mts = cfg.meters.filter(mt => mt && mt.meter_id);
      const _tiersOf = (mt) => (Array.isArray(mt.tiers) ? mt.tiers : [])
        .filter(t => t && Number.isFinite(Number(t.threshold)));
      XR++;
      xBand('收集條 / 進度條');
      ['收集條', '名稱', '適用模式', '填充來源', '每次+', '容量', '歸零', '集滿/每步動作', '連動彩池', '跨模式', '分段', '備註']
        .forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
      XR++;
      _mts.forEach(mt => {
        const isRatio = Number(mt.tier_step) > 0;
        const tierArr = _tiersOf(mt);
        const cap = (Number(mt.capacity) > 0) ? mt.capacity : '無上限';
        let seg = '—';
        if (isRatio)             seg = `比率·每 ${mt.tier_step}${mt.tier_repeat ? '（可重複）' : '（僅首次）'}`;
        else if (tierArr.length) seg = `絕對 ${tierArr.length} 段`;
        _cell(wsX, XR, 1, mt.meter_id, { h: 'center' });
        _cell(wsX, XR, 2, mt.label || '—');
        _cell(wsX, XR, 3, (mt.mode_scope && mt.mode_scope !== 'ALL') ? mt.mode_scope : '全部', { h: 'center' });
        _cell(wsX, XR, 4, mt.fill_source || '—');
        _cell(wsX, XR, 5, mt.fill_amount, { h: 'center' });
        _cell(wsX, XR, 6, cap, { h: 'center' });
        _cell(wsX, XR, 7, mt.reset_scope || 'FEATURE', { h: 'center' });
        _cell(wsX, XR, 8, mt.on_full_action || '—');
        _cell(wsX, XR, 9, mt.link_jackpot || '—', { h: 'center' });
        _cell(wsX, XR, 10, mt.carry_over ? '是' : '否', { h: 'center' });
        _cell(wsX, XR, 11, seg, { h: 'center' });
        _cell(wsX, XR, 12, mt.notes || '');
        XR++;
      });
      // 絕對門檻明細(逐收集條;比率型已於上表「分段」欄描述)
      _mts.forEach(mt => {
        if (Number(mt.tier_step) > 0) return;
        const tierArr = _tiersOf(mt);
        if (!tierArr.length) return;
        const sorted = [...tierArr].sort((a, b) => Number(a.threshold) - Number(b.threshold));
        XR++;
        xBand(`${mt.meter_id}${mt.label ? '（' + mt.label + '）' : ''} 分段門檻`);
        ['門檻', '動作', '參數'].forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
        XR++;
        sorted.forEach(t => {
          _cell(wsX, XR, 1, t.threshold, { h: 'center' });
          _cell(wsX, XR, 2, t.action || '—', { h: 'center' });
          _cell(wsX, XR, 3, t.params || '');
          XR++;
        });
      });
    }

    // ── G-7/8:動態盤面幾何(有 row_feature_max 或 geometry_transitions 才建表;set 守衛保零 diff)。──
    {
      const _featModes = (cfg.modes || []).filter(md => md && Number(md.row_feature_max) > 0);
      const _geoModes = (cfg.modes || []).filter(md => md && Array.isArray(md.geometry_transitions)
        && md.geometry_transitions.some(t => t && String(t.dimension || '').trim()));
      if (_featModes.length || _geoModes.length) {
        const _dz = { ROW_HEIGHT: '每欄列高', REEL_COUNT: '輪數', GRID_ROWS: '整體列數' };
        XR++;
        xBand('動態盤面幾何');
        if (_featModes.length) {
          _cell(wsX, XR, 1, '特色期列上限', { bold: true, bg: C.th, fg: C.thFg, h: 'center' });
          _cell(wsX, XR, 2, _featModes.map(md => `${md.mode}→${Number(md.row_feature_max)}`).join('、'));
          XR++;
        }
        if (_geoModes.length) {
          ['模式', '維度', '觸發', '每次', '上限', 'ways重算', '備註'].forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
          XR++;
          _geoModes.forEach(md => {
            md.geometry_transitions.forEach(t => {
              if (!t || !String(t.dimension || '').trim()) return;
              const dim = String(t.dimension).toUpperCase();
              _cell(wsX, XR, 1, md.mode, { h: 'center' });
              _cell(wsX, XR, 2, _dz[dim] || dim, { h: 'center' });
              _cell(wsX, XR, 3, (t.trigger_source || '').trim() || '—', { h: 'center' });
              _cell(wsX, XR, 4, (t.step || '').trim() || '—', { h: 'center' });
              _cell(wsX, XR, 5, (t.cap || '').trim() || '—', { h: 'center' });
              _cell(wsX, XR, 6, (t.ways_recompute || '').trim() || '—', { h: 'center' });
              _cell(wsX, XR, 7, t.notes || '');
              XR++;
            });
          });
        }
      }
    }

    // ── G-9:符號池動態變更(有 symbol_ops 才建表;set 守衛保零 diff)。──
    {
      const _soModes = (cfg.modes || []).filter(md => md && Array.isArray(md.symbol_ops)
        && md.symbol_ops.some(o => o && String(o.op || '').trim()));
      if (_soModes.length) {
        const _oz = { REMOVE: '移除', UPGRADE: '升級' };
        XR++;
        xBand('符號池動態變更');
        ['模式', '操作', '目標', '數量', '豁免', '觸發', '備註'].forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
        XR++;
        _soModes.forEach(md => {
          md.symbol_ops.forEach(o => {
            if (!o || !String(o.op || '').trim()) return;
            const op = String(o.op).toUpperCase();
            _cell(wsX, XR, 1, md.mode, { h: 'center' });
            _cell(wsX, XR, 2, _oz[op] || op, { h: 'center' });
            _cell(wsX, XR, 3, (o.target || '').trim() || '—', { h: 'center' });
            _cell(wsX, XR, 4, (o.count || '').trim() || '—', { h: 'center' });
            _cell(wsX, XR, 5, (o.immune || '').trim() || '—', { h: 'center' });
            _cell(wsX, XR, 6, (o.trigger || '').trim() || '—', { h: 'center' });
            _cell(wsX, XR, 7, o.notes || '');
            XR++;
          });
        });
      }
    }

    // ── G-4:Hold & Win / 金幣收集(有 hold-win 新欄 或 kind=HOLD_AND_WIN 才建表;set 守衛保零 diff)。──
    {
      const _hwModes = (cfg.modes || []).filter(md => md && (
        String(md.mode_kind || '').toUpperCase() === 'HOLD_AND_WIN' ||
        String(md.hw_trigger_symbol || '').trim() || md.hw_persist_value === true ||
        String(md.hw_collect_rule || '').trim() || String(md.hw_link_jackpot || '').trim()));
      if (_hwModes.length) {
        XR++;
        xBand('Hold & Win / 金幣收集');
        ['模式', '觸發/收集符', '持久格值', '收集規則', '連結彩池'].forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
        XR++;
        _hwModes.forEach(md => {
          _cell(wsX, XR, 1, md.mode, { h: 'center' });
          _cell(wsX, XR, 2, (md.hw_trigger_symbol || '').trim() || '—', { h: 'center' });
          _cell(wsX, XR, 3, md.hw_persist_value ? '是' : '否', { h: 'center' });
          _cell(wsX, XR, 4, (md.hw_collect_rule || '').trim() || '—');
          _cell(wsX, XR, 5, (md.hw_link_jackpot || '').trim() || '—', { h: 'center' });
          XR++;
        });
      }
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
  //  公司格式企劃書（Excel 多分頁，xlsm）— buildCompanyXlsxBuffer + _xlsxToXlsmBuffer
  //  v8.33:依 30 提供之「企劃書_MahjongWays2_公司格式_更正版.xlsm」逐格重建版面。
  //   · 分頁序:公式(不可刪) → 修訂紀錄(Excel 表格+下拉驗證) → 一般遊戲 → FREE GAME
  //     → [BONUS GAME] → 賠率表、連線方式(合併頁) → [輪盤遊戲] → 說明文件 → 演繹流程
  //     → 節奏表 → 體感
  //   · xlsm 手術(_xlsxToXlsmBuffer):內嵌公司 vbaProject.bin(base64)、
  //     M365 原生核取方塊(featurePropertyBag + xf ext)、跨表 x14 時間下拉、
  //     workbook/sheet codeName(VBA 綁定)、[Content_Types] macroEnabled。
  //   · 用語消毒:×乘號 / 收集 / 金色圖示 / 特殊圖示括號式 名稱(Wild)。
  //   · 語句路由:FG 範疇語句(「FG中…」「免費遊戲中…」)不落一般遊戲頁,改併入
  //     FREE GAME 遊戲說明。
  //  純描述,不執行不算 RTP。舊 buildPlanXlsxBuffer 不動。A.xlsx / 規格書 md 不動。
  // ════════════════════════════════════════════════════════════════════

  // ── 公司格式共用件 ──────────────────────────────────────────────
  const _CP_VBA_B64 = "0M8R4KGxGuEAAAAAAAAAAAAAAAAAAAAAPgADAP7/CQAGAAAAAAAAAAAAAAACAAAAAQAAAAAAAAAAEAAAAgAAAAMAAAD+////AAAAAAAAAAB9AAAA///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9////BwAAACIAAAAEAAAABQAAAAYAAAAXAAAAHwAAAAkAAAATAAAACwAAAAwAAAANAAAADgAAAA8AAAAQAAAAEQAAABIAAAAIAAAAFAAAABUAAAAWAAAA/v///xgAAAAZAAAAGgAAABsAAAAcAAAAHQAAAB4AAABKAAAASwAAACEAAAAjAAAAaAAAACQAAAAlAAAAJgAAACcAAAAxAAAAKQAAACoAAAArAAAALAAAAC0AAAAuAAAALwAAADAAAAAgAAAAMgAAADMAAAA0AAAA/v///zYAAAA3AAAAOAAAADkAAAA6AAAAOwAAADwAAABHAAAAPgAAAD8AAABAAAAAQQAAAEIAAABDAAAARAAAAEUAAABGAAAANQAAAEgAAABJAAAA/v///0wAAABeAAAATQAAAE4AAABPAAAAUAAAAFoAAABSAAAAUwAAAFQAAABVAAAAVgAAAFcAAABYAAAAWQAAAP7///9bAAAAXAAAAF0AAABfAAAAdAAAAGAAAABhAAAAYgAAAGUAAABkAAAA/v///2YAAABnAAAAaQAAAP7///9qAAAAdQAAAGwAAABtAAAAbgAAAG8AAABwAAAAcQAAAHIAAABzAAAAYwAAAIoAAAB5AAAAdwAAAHgAAAD+////egAAAHsAAAB8AAAAiAAAAP3///9/AAAAgAAAAFIAbwBvAHQAIABFAG4AdAByAHkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWAAUA//////////8cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGCPOp7mDd0BAwAAAABfAAAAAAAAVgBCAEEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAQD//////////w0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAACDzOZ7mDd0BUGg6nuYN3QEAAAAAAAAAAAAAAABUAGgAaQBzAFcAbwByAGsAYgBvAG8AawAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGgACAf////8YAAAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACkBAAAAAAAAF8AXwBTAFIAUABfADYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAIB////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEwAAAKgCAAAAAAAAAQAAAAIAAAADAAAABAAAAAUAAAAGAAAABwAAAAgAAAAJAAAACgAAAAsAAAAMAAAADQAAAA4AAAAPAAAAEAAAABEAAAASAAAA/v///xQAAAAVAAAAFgAAABcAAAAYAAAAGQAAABoAAAAbAAAAHAAAAB0AAAD+////HwAAAP7///8hAAAAIgAAACMAAAAkAAAAJQAAACYAAAAnAAAAKAAAACkAAAAqAAAAKwAAACwAAAAtAAAALgAAAC8AAAAwAAAAMQAAADIAAAAzAAAANAAAADUAAAA2AAAANwAAADgAAAA5AAAAOgAAADsAAAA8AAAAPQAAAD4AAAA/AAAAQAAAAEEAAABCAAAAQwAAAEQAAABFAAAARgAAAEcAAABIAAAASQAAAEoAAABLAAAATAAAAE0AAABOAAAATwAAAFAAAABRAAAAUgAAAFMAAABUAAAAVQAAAFYAAABXAAAAWAAAAFkAAAD+////WwAAAFwAAABdAAAAXgAAAF8AAAD+////YQAAAGIAAABjAAAAZAAAAGUAAAD+////ZwAAAGgAAABpAAAAagAAAGsAAABsAAAAbQAAAG4AAABvAAAAcAAAAHEAAAByAAAAcwAAAHQAAAB1AAAAdgAAAP7///94AAAAeQAAAHoAAAB7AAAAfAAAAH0AAAB+AAAAfwAAAIAAAAABFgMABgABAABaAwAA5AAAABACAACIAwAAlgMAAOoDAAAAAAAAAQAAALjk/+YAAP//IwEAAIgAAAC2AP//AQEAAAAA/////wAAAAD//3AA//8AALsyoBjmWlNJo0jPy1CNIwcZCAIAAAAAAMAAAAAAAABGAAAAAAAAAAAAAAAAAAAAAAEAAADOOCvcc/e4TKNCHSh5dKNcEAAAAAMAAAAFAAAABwAAAP//////////AQEIAAAA/////3gAAAAIzjgr3HP3uEyjQh0oeXSjXLsyoBjmWlNJo0jPy1CNIwf//wAAAABNRQAA////////AAAAAP//AAAAAP//AQEAAAAA3wD//wAAAAD/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////KAAAAAIAU0z/////AAABAFMQ/////wAAAQBTlP////8AAAAANiL/////AAD//wEBAAAAAAEATgAwAHsAMAAwADAAMgAwADgAMQA5AC0AMAAwADAAMAAtADAAMAAwADAALQBDADAAMAAwAC0AMAAwADAAMAAwADAAMAAwADAAMAA0ADYAfQAHAAAAAAD/////AQG4AAAAAoD+//////8gAAAA/////zAAAAACAf//AAAAAAAAAAD//////////wAAAAAAAAAAHQAAACUAAAD/////AAAAAAKD/v//////AAAAAP////9wAAAAAAD///////8AAAAA//////////8AAAAAAAAAAB0AGAAlAAAAgqAmAv/////+/////////6gAAAACAP///v///wAAAAD//////////wAAAAAAAAAAHQAYACUAAAD/////SAAAAAAAAAAAAAEAAAAAAAAAAAD///////////////8AAAAA//////////////////////////8AAAAA////////////////eAAAAEAAAAAAAAAAAQAAAHgAAAAIAAAAAAD4CPgI/////////////////////////////xAAAAABADgAAACVPnBsJgABJAAqAFwAUgBmAGYAZgBmACoAMQB3ADYAYwA3ADAAMwBlADQANQDfAQAAAAAA/////2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+ygEAAAD/////AQEIAAAA/////3gAAAD/////AAABsLAAQXR0cmlidXQAZSBWQl9OYW0AZSA9ICJUaGkAc1dvcmtib28QayINCgqMQmFzAQKMMHswMDAyMFA4MTktABAwAwhDBwAUAhIBJDAwNDZ9gQ18R2xvYmFsAdAQU3BhYwGSRmFsBHNlDGRDcmVhdAhhYmwVH1ByZWSQZWNsYQAGSWQAsQhUcnUNQkV4cG8Ec2UUHFRlbXBsAGF0ZURlcml2AwISkkJ1c3RvbWkGegREAzIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAclVAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAARAAAAAAAAAAAAAAARAAAAAAAAAAAABwBQAgAAAAAAAAAAAAAAAAAAAAAAAAEAAQAAAAEAESQAAAAAAAAAAAAAQSQAAAAAAAAAAAAAcSQAAAAAAAAAAAAA///////////hIwAAAAAAAAAAAAAIADcAYAAAAKEkAAAAAAAAAAAAAMECAAAAAAAAAAABANEkAAAAAAAAAAAAAP///////////////wAA////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////AAAYAUQAAAAAAAB/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAByVUAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAaAAAAAAAAABEAAAAAAAAAAAAGAP///////////////wAAAAB4AAAACAAAAAAAAABiAAAAAAAAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAF8AXwBTAFIAUABfADcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAIBFAAAAAsAAAD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAAAGoAAAAAAAAA5V1cT2iIMQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAgEZAAAA//////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAIB0AAAAAAABfAF8AUwBSAFAAXwA5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAACAAcAAAAKAAAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAABODgAAAAAAAF8AXwBTAFIAUABfADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAIB////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWgAAAGoBAAAAAAAA/////wAAAAD///////////ABAAD//////////wAAAAD////////////////IAgAAkAIAAAAAAAAAAAAAeAAAAAgAAAAAAAgF8AT/////////////////////////////EAAAAAUAcAIAAJU+cGwmAAESACoAXABSADEAKgAjADIAYQAzAAEkACoAXABSAGYAZgBmAGYAKgAyADgANgBjADcAMAAzAGUAOQBhAAESACoAXABSADEAKgAjADIAOQBmAAEkACoAXABSAGYAZgBmAGYAKgAyADsANgBjADcAMAAzAGUAOQBiAAEQACoAXABSADAAKgAjADIANgABEAAqAFwAUgAwACoAIwAyADcAASQAKgBcAFIAZgBmAGYAZgAqADEAdgA2AGMANwAwADMAZQA0ADUAARIAKgBcAFIAMQAqACMAMQA0ADEAARIAKgBcAFIAMQAqACMANAAwADkAAN8BAAAAAAD/////YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7KAQA0ACKBDAAGABIACAAAAACBCAQaAFoAEAAAAACACQQAAAAA/////wCACQAcAAAAMAAAAACBCAQsAF4BUAAAAACBCAgGABAAgAAAAACBCAgSACIAiAAAAACACQgAAAAA/////wCACQAcAAAAoAAAAACBCAQsAGQBwAAAAACBCAgGABAA8AAAAACBCAgUACIA+AAAAACBCAQCAAYAEAEAAASBCAACAAgAGAEAAACACQAAAAAA/////yKBDAAGAB4AIAEAAACACAQIAAAAKAEAAACACAQOAAAAMAEAAACACQQAAAAA/////wCBCAQSAEwAQAEAAACBCARAAM4AWAEAAACBCAQoAIQAmAEAAACACQ0AAAAA/////wCBCAQQABgAwAEAAACBCAgIABQA0AEAAACBCAwIABwA2AEAAACBCAwIACAA4AEAAACBCAwIACAA6AEAAACBCAwKACQA8AEAAACBCAgCAA4AAAIAAACBCAQSAB4ACAIAAACBCAgIABQAIAIAAACBCAwIABwAKAIAAACBCAwIACAAMAIAAACBCAwIACAAOAIAAACBCAwKACQAQAIAAACBCAgCAA4AUAIAAACBCAQCAAYAWAIAAASBCAACAAgAYAIAAACACQAAAAAA/////wCACQAiAAAAaAIAACKBDAAGABIAkAIAAACBCAQ4AF4BmAIAAACACQAcAAAA0AIAAACBCAQCAAwA8AIAAACBCAgEAAwA+AIAAACBCAgKACgAAAMAAACBCAgKACgAEAMAAACBCAgEAAwAIAMAAACBCAEWAwAGAAEAAGoSAADkAAAAiAIAAGETAABvEwAAaxkAAAAAAAABAAAAuOThygAA//8jAQAAiAAAALYA//8BAQAAAAD/////AAAAAP//cAD//wAAJl9JTWFHuUK/04CF+krG6iAIAgAAAAAAwAAAAAAAAEYAAAAAAAAAAAAAAAAAAAAAAQAAAH+GE0fekSVBvW6ZrHEXaDgQAAAAAwAAAAUAAAAHAAAA//////////8BAQgAAAD/////eAAAAAh/hhNH3pElQb1umaxxF2g4Jl9JTWFHuUK/04CF+krG6v//AAAAAE1FAAD///////8AAAAA//8AAAAA//8BAQAAAADfAP//AAAAAGgA/////////////////////xgA//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+gAAAAAgBbTP////8AAAEAUxD/////AAABAFOU/////wAAAwA4EP//QgIAAAAAPiL/////AAAAABoQ/////wAAAQCqIv////8AAAAAGgz/////AAAAABqU/////wAAAQCqIv////8AAAAAGkz/////AAAAABqU/////wAAAAAaEP////8AAAAAAjxwAP//AAAAAAI8eAD//wAAAAACPP////8AAP//AQEAAAAAAQBOADAAewAwADAAMAAyADAAOAAyADAALQAwADAAMAAwAC0AMAAwADAAMAAtAEMAMAAwADAALQAwADAAMAAwADAAMAAwADAAMAAwADQANgB9AAcAAAAAAOALAAABAVAPAAACgP7//////yAAAAD/////MAAAAAIB//8AAAAAAAAAAP//////////AAAAAAAAAAAdAAAAJQAAAP////9AAAAA/////wAAAAD/////AAAAAP////9IAAAA/////1AAAAAdABgAJQAAAP////9QAAAADBF2AhABAAAAAANgAAAAAP//////////AAAAAAAAAAAAAAAAAAAAAAgIAADY/P//awAAAAAAAADIAAAA//////AEAAAPAA8AAAAAAAAAAACUAgABAAAAACmDQAL/////CAAAAP/////oAAAAAAAAAPAAAACEAAAAHQAYACUAAABpg3gC/////xAAAAD/////CwH//wAAAAD/////gAEAAAwRegLwAQAAAQADYAAAAAD//////////wAAAAAAAAAAAAAAAAAAAACgDAAAiP7//2sAAAAAAAAAaAEAAP/////4BAEAGgAaAA8AAAAAAAAAlAIAAQAAAAApg3wC/////wgAAAD/////YAAAAAAAAACIAQAAhAAAAGmDfgL/////EAAAAP////8IAP//AAAAAP////+EAAAAYISAAv/////o/////////wUA//8AAAAAYISCAv/////g/////////wUA//8AAAAAYISEAv/////Y/////////wUA//8AAAAADBGYAv////8CAANgAAAAAP//////////AAAAAAAAAAAAAAAAAAAAAAADAAAI/f//bwAAAAAAAABIAgAA/////wAFAgALAAsAKQAAAAAAAACUAQABAAAAACmDQAL/////CAAAAP////9oAgAAAAAAAP////+EAAAAHQAYACUAAAD/////EAEAAPABAABwAAAA/////wAAAAD/////8AAAAAKD/v//////AAAAAP/////AAgAAAAD///////8AAAAA//////////8AAAAA/////x0AIAAlAAAAgqAqAv/////+//////////gCAAACAP///v///wAAAAD//////////wAAAAD/////HQAgACUAAAD///////////////////////////////////////////////////////////////8ABAAA//////////////////////////94BAAA//////////9IBAAA/////////////////////////////////////////////////////////////////////////////////////zAEAAAgBAAAIIRAAv/////4/////////7gDAACAAAAAHQAYACUAAAAghEAC//////j/////////2AMAAIAAAAAdABgAJQAAACCEQAL/////+P/////////4AwAAgAAAAB0AGAAlAAAAIIRAAv/////4/////////xgEAACAAAAAHQAYACUAAAD/////AAQAAAAAAAAgAwAA/////0ICRgKQAnIBlgIAAEAE/v8FAAAAQAT+/2AEAADg/////////wwA//8gAAAAQAT+/8AEAADI/////////wwA//8gAAAAQAT+/5AEAADA/////////wkA//8gAAAAQAT+/6gEAAC4/////////wkA//8gAAAAQAT+/4gHAACw/////////wkA//8gAAAAQAT+/9gEAACY/////////wwA//8gAAAAQAT+//AEAACA/////////wwA//8gAAAAQAT+/wgFAABo/////////wwA//8gAAAAQAT+/yAFAABQ/////////wwA//8gAAAAQAT+/zgFAAA4/////////wwA//8gAAAAQAT+/1AFAAAg/////////wwA//8gAAAAQAT+/2gFAAAI/////////wwA//8gAAAAQAT+/4AFAADw/v///////wwA//8gAAAAQAT+/5gFAADY/v///////wwA//8gAAAAQAT+/7AFAADA/v///////wwA//8gAAAAQAT+/8gFAACo/v///////wwA//8gAAAAQAT+/+AFAACQ/v///////wwA//8gAAAAQAT+//gFAAB4/v///////wwA//8gAAAAQAT+/xAGAABg/v///////wwA//8gAAAAQAT+/ygGAABI/v///////wwA//8gAAAAQAT+/0AGAAAw/v///////wwA//8gAAAAQAT+/1gGAAAY/v///////wwA//8gAAAAQAT+/3AGAAAA/v///////wwA//8gAAAAQAT+/4gGAADo/f///////wwA//8gAAAAQAT+/6AGAADQ/f///////wwA//8gAAAAQAT+/7gGAAC4/f///////wwA//8gAAAAQAT+/9AGAACg/f///////wwA//8gAAAAQAT+/+gGAACI/f///////wwA//8gAAAAQAT+/wAHAABw/f///////wwA//8gAAAAQAT+/xgHAABY/f///////wwA//8gAAAAQAT+/zAHAABA/f///////wwA//8gAAAAQAT+/3AHAAAo/f///////wwA//8gAAAAHQAYACUAAAAghEAC//////j/////////aAcAAIAAAAAdABgAJQAAAEAE/v//////EP3///////8MAP//IAAAAEAE/v//////CP3///////8JAP//IAAAACCEQAL/////+P////////9IBwAAgAAAAP////+gBwAAAAD//yAAAABABP7/wAgAAOD/////////DAD//yAAAAAdABgAJQAAACCEQAL/////+P////////8ACAAAgAAAAB0AGAAlAAAA//////AAAAD/////////////////////////////////////////////////////oAcAAP//////////////////////////qAgAAMgHAAD/////8AgAAP/////////////////////////////////////////////////////////////////////////////////////YCAAAuAcAAEAE/v8gCQAA2P////////8JAP//IAAAAEAE/v//////wP////////8MAP//IAAAAP////9CAkYCegL///////8JAP//AwAAAEAE/v8ICQAAqP////////8MAP//IAAAAEAE/v9QCQAAkP////////8MAP//IAAAAEAE/v84CQAAiP////////8JAP//IAAAAEAE/v+IDAAAgP////////8JAP//IAAAAEAE/v9oCQAAaP////////8MAP//IAAAAEAE/v+ACQAAUP////////8MAP//IAAAAEAE/v+YCQAAOP////////8MAP//IAAAAEAE/v+wCQAAIP////////8MAP//IAAAAEAE/v/ICQAACP////////8MAP//IAAAAEAE/v/gCQAA8P7///////8MAP//IAAAAEAE/v/4CQAA2P7///////8MAP//IAAAAEAE/v8QCgAAwP7///////8MAP//IAAAAEAE/v8oCgAAqP7///////8MAP//IAAAAEAE/v9ACgAAkP7///////8MAP//IAAAAEAE/v9YCgAAeP7///////8MAP//IAAAAEAE/v9wCgAAYP7///////8MAP//IAAAAEAE/v+ICgAASP7///////8MAP//IAAAAEAE/v+gCgAAMP7///////8MAP//IAAAAEAE/v+4CgAAGP7///////8MAP//IAAAAEAE/v/QCgAAAP7///////8MAP//IAAAAEAE/v/oCgAA6P3///////8MAP//IAAAAEAE/v8ACwAA0P3///////8MAP//IAAAAEAE/v8YCwAAuP3///////8MAP//IAAAAEAE/v8wCwAAoP3///////8MAP//IAAAAEAE/v9ICwAAiP3///////8MAP//IAAAAEAE/v9gCwAAcP3///////8MAP//IAAAAEAE/v94CwAAWP3///////8MAP//IAAAAEAE/v+QCwAAQP3///////8MAP//IAAAAEAE/v+oCwAAKP3///////8MAP//IAAAAEAE/v8ADAAAEP3///////8MAP//IAAAACCEfAL/////+P/////////gBwAAgAAAAB0AGAAlAAAA/////wAAAABghH4CwAsAAPD/////////CAD//4AAAABABP7/GAwAAPj8////////DAD//yAAAABABP7//////+D8////////DAD//yAAAAAghHwC//////j/////////SAwAAIAAAAAdABgAJQAAAHANAABADQAAAAAAAAAAAABghH4CMAwAAPD/////////CAD//4AAAAD/////AAgAAP////94DAAAQAT+///////Y/P///////wkA//8gAAAA2AEAAP///////////////6gBAABYDQAA/////////////////////8ABAAD/////////////////////////////////////mA0AAMgNAAD/////sA0AAP///////////////////////////////+gOAAD///////////////////////////////////////////////+ADQAAUAwAACCEfAL/////+P/////////YCwAAgAAAAGCEfgJADQAA8P////////8IAP//gAAAAAgPAABYDQAAAAAAAAAAAAD/////hgKQApYCAAAAAAAAAAAAAAMAAABABP7//////9D/////////CQD//yAAAABABP7/+A0AALj/////////DAD//yAAAABABP7/4A0AAKD/////////DAD//yAAAABABP7/KA4AAIj/////////DAD//yAAAABABP7/EA4AAHD/////////DAD//yAAAABABP7/QA4AAFj/////////DAD//yAAAABABP7/WA4AAED/////////DAD//yAAAABABP7/iA4AACj/////////DAD//yAAAABABP7/cA4AABD/////////DAD//yAAAABABP7/oA4AAPj+////////DAD//yAAAABABP7/uA4AAOD+////////DAD//yAAAABABP7/0A4AAMj+////////DAD//yAAAABABP7//////7D+////////DAD//yAAAABABP7//////5j+////////DAD//yAAAAAABP7/GA8AAJD+////////AA8AAGAAAAAdAEgAJQAAADgPAADoDgAACQAAAAAAAAAABP7//////4j+////////MA8AAGAAAAAdADAAJQAAAP////8YDwAAEAAAAAAAAAD/////wAkAAAMAAwAAAAEAAAAAAAAAAABwAAAA/////wQCAAYAKAMAAASBCAACAAgAMAMAAACACQAAAAAA//////////8BAUADAAD/////eAAAAJYEcAAAAAAAIABAAiEAVAIhAGwCrAABAAoAmwBHAHwAagAAAAAAAADjAAQAFQAgQiDE5qFdwvnAu6TptMGz5r/voV4AAAAAACAAQAK5AAsAQjM6QjEwNDg1NzYAIAD//yUAQgIBACQARgICALIAFAAVAJwAAAAAALoEJwB4AgAAIABAArkABABEYXRlQQB6AgIAAAAAAAAA4wAEABUAIEUgxOahXcL5wLukwK22vca/76FeAAAAAAAgAEACuQALAEUzOkUxMDQ4NTc2ACAA//8lAEICAQAkAEYCAgCyABQAFQBlAAAAAAC6BCcAeAIAACAAQAK5AAUAU2hlZXQAQQB6AgIAAAAAAGsA//9oAAAAbwD//2AAAACWBBABAAAAAF0A9QSoAQAAXQD1BMABAAD1BNgBAAAAACAAhgIhAIgCrABkABAAJwCAAgAAAAAAACAAfAIhANwAIACAAg8AIACGAiUAigIBAKwASAAPAKwAYAAQACAAfAIhAIABIACAAg8AHQALAKwACgALACcAggIgAHwCIQCOAiAAgAIPACAAhgIlAIwCAQCsAEgADwCsAGAAEAAnAIQCIAB+ArkABABEYXRlBQCcAAQBIACQAvgArAAAADkAkgIgAIICOQDcACAAhAI5AI4CIAB8AkNAlAIBAAAAAAAAAHEA///4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AAAAAAAAAAAAACEpAAAAAAAAAAAAACE9AAAAAAAAAAAAAAEAAQAAAAEAsToAAAAAAAAAAAAAkQsAAAAAAAAAAAAA4ToAAAAAAAAAAAAA//////////8xCwAAAAAAAAAAAAAIABwAYAAAABEMAAAAAAAAAAAAALEAAAAAAAAAAAABAEEMAAAAAAAAAAAAAP///////////////wIAAQYAAAAAA2AHBgAAAgADYGkEAAAAAAAAAAAJAIkJAAAAAAAAAAAJAP//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////AwCXAOkCAAAAAAAAAAAJAEkGAAAAAAAAAAAJAGkIAAAAAAAAAAAJABgEAAAAAAAAoAMAAAAAAABnAhIAAACYAggAAAC4Avj///9nAlIAAACeAvj////ZBeD////uAAAAVgQNAMIC2P///54C2P///9kFwP///3YAAACWAfAFAQAAAJQAvgPY////6gUEAOD////A////xwJsAAAAZwIIAAAA+AFnAl4BAACfAtj////xAZD///8bAv4FqP///w4AGwKeAgAAAAD0ASADAACfAtj8///wBQkEAADxAeD8//8bAvEB+Pz//xsC8QEQ/f//GwLxASj9//8bAvEBQP3//xsC8QFY/f//GwLxAXD9//8bAvEBiP3//xsC8QGg/f//GwLxAbj9//8bAvEB0P3//xsC8QHo/f//GwLxAQD+//8bAvEBGP7//xsC8QEw/v//GwLxAUj+//8bAvEBYP7//xsC8QF4/v//GwLxAZD+//8bAvEBqP7//xsC8QHA/v//GwLxAdj+//8bAvEB8P7//xsC8QEI////GwLxASD///8bAvEBOP///xsC8QFQ////GwLxAWj///8bAmUD2P///8ADgP///5gC+P///78DiP///98DBABaBAUA9AEgAQEAmALY/P//7AEmAQsB7AUGAIj///+A////2Pz//8cCAgIAAGcCEAAAAO0F//8BAxAAAABnAiIAAAD3BQ8AmAL4////vwPY////8wH4BAAAvgPY////xgKSAwAAZwJeAQAAnwLY////8QGQ////GwL+Baj///8QABsCngIAAAAA9AEgAwAAnwLY/P//8AUJBAAA8QHg/P//GwLxAfj8//8bAvEBEP3//xsC8QEo/f//GwLxAUD9//8bAvEBWP3//xsC8QFw/f//GwLxAYj9//8bAvEBoP3//xsC8QG4/f//GwLxAdD9//8bAvEB6P3//xsC8QEA/v//GwLxARj+//8bAvEBMP7//xsC8QFI/v//GwLxAWD+//8bAvEBeP7//xsC8QGQ/v//GwLxAaj+//8bAvEBwP7//xsC8QHY/v//GwLxAfD+//8bAvEBCP///xsC8QEg////GwLxATj///8bAvEBUP///xsC8QFo////GwJlA9j////AA4D///+YAvj///+/A4j////fAwQAWgQFAPQBIAEBAJgC2Pz//+wBJgELAewFBgCI////gP///9j8///HApIDAABnAhAAAADtBf//AQMQAAAAZwIiAAAA9wURAJgC+P///78D2P////MB+AQAAL4D2P///2cCBgAAAGcCAAAAAPgBAAAAAAAAAAAYACgDoAMAAEAAAAAIAAAAAAAAAAAAAAAAAAAAGgAAAAAAAAAAAAEAAAAAAAAAAAD4////AwBvADgAAAAAAAAAAAAGAAAAAAAAAAAA2P///wMAiP///wMAgP///wMA2Pz//wMA4P///wIAwP///wIA2AMAAAAAAABEAwAAAAAAAGcCHgAAAJgCCAAAALgC+P///5cCEAAAAMQC8P///2cCTAAAAJ8C0P///98DBABaBAUA9AGIABIAngLQ////2QWg////lwIAAPgFuP///2QABAGI////rgG9Auj///++A9D///+8A6D///9nAs4AAACeAvj////ZBaD///9/AAAAnQLo////bgO4////+ACI////lgFsA3D///8bAp8C0P///98DBABaBAUA9AGIABIAngLQ////2gVA////8AYAAAEAlgHwBUgAAAD0AKoB7QVgAKkBAgFuA+D+//+eAvj////ZBRD///96AAAAnQLo////bgMo////+AD4/v//yADI/v//+AWw/v//CgDIAJj+//+uAb0C4P///74D0P///+oFCgCg////QP///xD////I/v//mP7//2cChAAAAJ4C+P///9kFoP///34AAACdAuj///9uA7j////4AIj///+WAWwDcP///xsCnwLQ////3wMEAFoEBQD0AYgAEgCeAtD////aBUD////xBgAAAQCWAfAFSAAAAPQAqgHtBWAAqQECAb0C2P///74D0P///+oFBACg////QP///2cCGAAAAJcC8P////cFDwBEAMcCfAIAAGcCFAAAAN8DBgBZBAcAuAKQ/v//ZwIcAAAA+AW4////AAAbAp4CkP7//9sFRgABgGcCIAAAAJ0C4P///20DuP///xsCngKQ/v//2wUFAAGAZwIgAAAAnQLY////bQO4////GwKeApD+///bBQYAAYBnAiQAAACYAvj///+/A9D///+eApD+///yATADAAC+A9D///9nAg4AAADsAbgCkP7//8YCNgMAAGcCGAAAAJcC8P////cFEQBEAMcCNgMAAGcCFAAAAN8DCgBZBAsAuAKI/v//ZwIcAAAA+AW4////AAAbAp4CiP7//9sFRgABgGcCIAAAAJ0C4P///20DuP///xsCngKI/v//2wUFAAGAZwIgAAAAnQLY////bQO4////GwKeAoj+///bBQYAAYBnAiQAAACYAvj///+/A9D///+eAoj+///yATADAAC+A9D///9nAg4AAADsAbgCiP7//2cCBgAAAGcCAAAAAPgBAAAAAAAAAAAYAHgBRAMAAFAAAAAIAAAAAAAAAAAAAAAAAAAALAAAAAAAAAAAAAQAAAAAAAAAAACQ/v//AwCI/v//AwDw////AQD4////AwBEAAAAAAAAAAAACAAAAAAAAAAAAND///8DAKD///8CAIj///8CAED///8CABD///8CAPj+//8CAMj+//8CAJj+//8CAGACAAAAAAAA9AEAAAAAAABnAhIAAACYAggAAAC4Avj///9nAl4BAACfAsD////xAcj///8bAv4F4P///wMAGwKeAgAAAAD0ASADAACfAgj9///wBQkEAADxARD9//8bAvEBKP3//xsC8QFA/f//GwLxAVj9//8bAvEBcP3//xsC8QGI/f//GwLxAaD9//8bAvEBuP3//xsC8QHQ/f//GwLxAej9//8bAvEBAP7//xsC8QEY/v//GwLxATD+//8bAvEBSP7//xsC8QFg/v//GwLxAXj+//8bAvEBkP7//xsC8QGo/v//GwLxAcD+//8bAvEB2P7//xsC8QHw/v//GwLxAQj///8bAvEBIP///xsC8QE4////GwLxAVD///8bAvEBaP///xsC8QGA////GwLxAZj///8bAmUDwP///8ADsP///5gC+P///78DuP///98DBABaBAUA9AEgAQEAmAII/f//7AEmAQsB7AUGALj///+w////CP3//8cCdgEAAMYC5AEAAGcCBgAAAGcCDAAAAM4C/////2cCKAAAAN8DBgBZBAcAvwPA////3wMIAFoECQD0ASAAAgC+A8D///9nAigAAADfAwoAWQQLAL8DwP///98DCABaBAkA9AEgAAIAvgPA////ZwIMAAAAzgL+////ZwIGAAAAZwIAAAAA+AEAAAAAAAAAAAAAEAD4AvQBAABAAAAACAAAAAAAAAAAAAAAAAAAABoAAAAAAAAAAAABAAAAAAAAAAAA+P///wMAAAAsAAAAAAAAAAAABAAAAAAAAAAAAMD///8DALj///8DALD///8DAAj9//8DABQAAAAAAAATAABgAJECAAAAAAAAAAAJABEEAAAAAAAAAAAJACQAAAAAAAAOAANoAAIIAggIAAAAAAAAfyQAAAAAAAAOAANoAAIIAggUAAAAAAAAEwEAAADxBQAAAAAAAAAACQD//////////yQAAAAAAAAOAANoAAIIAgcUAAAAAAAAEwIAYAARCAAAAAAAAAAACQAxCQAAAAAAAAAACQAGAAAAAAAAfyIAAAAAAAAOAAJhAAIIAiIAAAAAAAAOAAJhAAIIAjYAAAAAAAB/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHJVQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAABoAAAAAAAAAEQAAAAAAAAAAAAkA////////////////AAAAAHgAAAAIAFgA4QEAAAAAAAAAAAkAAAADYAgA8AQ4AP////////////////////8AAAAAMQEAAAAAAAAAAAEAUQEAAAAAAAAAAAEAAAAAAB8AHgDxAAAAAAAAAAAAAQBDAFgAQQUAAAAAAAAAAAkAAQADYAgA+AT///////////////////////8AAAAAcQEAAAAAAAAAAAEAkQEAAAAAAAAAAAEAAAAAAB8AHgDxAAAAAAAAAAAAAQAQAEgAIQcAAAAAAAAAAAkAAgADYAQAAAVAAP////////////////////8AAAAAMQEAAAAAAAAAAAEAAAAAAB8AHgDxAAAAAAAAAAAAAQAAAAAAAABiAAAAAAAAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOVdXE9oiDIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAIBBQAAAAkAAAD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAABEmAAAAAAAA5V1cT2iIMwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAgH///////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9AAAAnygAAAAAAABfAF8AUwBSAFAAXwBhAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAACAf///////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFEAAACREQAAAAAAAF8AXwBTAFIAUABfAGIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAIBBgAAABIAAAD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAFgBAAAAAAAAAEwCPT09PbkAAgCh9UsAVABGAAAAuQAKAKRXqbmkVbp1sMogAFgCKABMAqTopqG5AAIAofZLAFQARgAAALkACgCla6m5paq6dbDKIABYAigATAIAALkAuQACAKH3SwBUAEYAAAC5AAoApaqpuaVrunWwyiAAWAIoAEwCAAC5ALkABgCz5q7mofRLAFQARgAAALkAFACz5q7munWwyqFBpFWpuaRXunWwyiAAWAIoAEwCsMogAFgCuQAGALPmruah9UsAVABGAAAAuQAUALPmrua6dbDKoUGkV6m5pFW6dbDKIABYAigATAIGADAAAAC5AAwAr1Ou7bp1sMqk6KahSwBUALDKoUG5AAAAIABYAigATAJYAigAUwAAAAAAAAD/////eAAAALkABgCz5q7mofZLAFQARgAAALkAFACz5q7munWwyqFBpWupuaWqunWwyiAAWAIoAEwCt3OhdbjJuQAGALPmruah90sAVABGAAAAuQAUALPmrua6dbDKoUGlqqm5pWu6dbDKIABYAigATAI9PT09PT0gAFgCQkBIAQAASwBUAEYAuQAAACAAWAIoAEwCsMqhQW4AAAA4AAAAIAD//0FAXgIBAHqhabjJveMABAAZACCnUMJfpEehR7NCsnqhabjJvUyk6KahoWoAUwAAAAAAAAD/////sAIAAOMACAAzACC37aF1unWwyqTopqGhdqfvxdyuyaFBptuwyqVop/O3c6F1uMm9TKTopqGhdqq6pXmkbAB1unWwyqTjAAQAKwAgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09AP//CAAAAOMABAArACA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0APT09PT09IABcArkACAC4yb1MpOimoQUAZQBHoUezIAByAiEATALtAOimoaFqALkAAgC1TEsAVAA9PT09PT25AAIAtUwgAFgCKABMAj09uQAGAK3spmG4yUsAVAA9PbkATgCzc711rsm3fK74sKOxb6TAuc+l3KFBqMOp863spmGlzaaot3O5z6XcoUGqvajstUyqa7Vvpc2zc711rsmnWa1wuuK5Q8C4pECmXqZYoUMgAFgCKABMAksAVACl3LkACACvU67tuMm9TEsAVAC5AAAAIABYAigATAKp863sIABYAkJASAEAAKXcoUGqvbkADAC6dbDKpOimVru8uMlLAFQAuuK5Q7kAGgCzc711rsm3fK74sKOxb6TAuc+l3KFBqMOl0SAA//8kAGACAQARALkAKgC4ybqhoUGqvajstUyqa7Vvpc2zc711rsmnWa1wuuK5Q8C4pIEAAACCAAAAgwAAAIQAAACFAAAAhgAAAIcAAAD+////iQAAAIoAAACLAAAAjAAAAI0AAACOAAAAjwAAAJAAAACRAAAAkgAAAJMAAACUAAAAlQAAAJYAAACXAAAAmAAAAP7///+aAAAAmwAAAJwAAACdAAAAngAAAJ8AAACgAAAAoQAAAKIAAACjAAAApAAAAKUAAACmAAAApwAAAKgAAACpAAAA/v///6sAAACsAAAArQAAAK4AAACvAAAAsAAAALEAAACyAAAAswAAALQAAAC1AAAAtgAAALcAAAC4AAAAuQAAALoAAAD+////vAAAAL0AAAC+AAAAvwAAAMAAAADBAAAAwgAAAMMAAADEAAAAxQAAAMYAAADHAAAAyAAAAMkAAADKAAAA/v///8wAAADNAAAAzgAAAM8AAADQAAAA0QAAANIAAADTAAAA1AAAANUAAADWAAAA1wAAANgAAADZAAAA2gAAANsAAADcAAAA3QAAAN4AAADfAAAA4AAAAOEAAADiAAAA4wAAAOQAAADlAAAA5gAAAOcAAADoAAAA6QAAAOoAAADrAAAA7AAAAO0AAADuAAAA7wAAAPAAAADxAAAA8gAAAPMAAAD0AAAA/v////YAAAD3AAAA+AAAAPkAAAD6AAAA/v////wAAAD9AAAA/gAAAP8AAAAAAQAAQKZeplihQxEAIABYAigATAIaAGAAAAC5AAAAIABYAigATAK5z6XcbgAAAPAEAADjAAQAKwAgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09AKZeplihQ+MABAAZACCnUMJfpFShR7NCsnqhabNzvXWk6KahoWoA4wAEACsAID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQD1BAAAAAAgAFwCuQAIALNzvXWk6KahBQBlAD09PT0gAHICIQBMAu0APT09PT09uQAJALNzvXUgTGluZQBLAFQAbgIoAAAAuQA/ALp1vfywsaTuq+GhQbFxs8ylqr38uuKwX6ZisW+kwL11pFems7NzxPIzrdOlSKRXrNumULnPpdynWaVpsW+kwAAgAFgCKABMAj09PT25AAkApsq3ZiBXYXlzAEsAVAA9PT09PT25ADcAunW9/LCxpO6r4aFBsXGzzKWqvfy64rBfprOzc8TyM63TpUikV6zbplC5z6Xcp1mlabFvpMChQwAgAFgCKABMAuWmcgC5AAgATWVnYXdheXNLAFQAuQA3ALp1vfywsaTuq+GhQbFxs8ylqr38uuKwX6azs3PE8jOt06VIpFes26ZQuc+l3KdZpWmxb6TAoUMAIABYAigATAJiAiUAuQANALnPpdy8xrZxIEdyaWQASwBUAJwAuQAzALp1vfywsaTuq+GhQb1MrbGkV6X0t06m7LhtprM4rdOlSKRXrNumULnPpdynWaVpsW+kwAAgAFgCKABMArkAEAC5z6XcrNu+RiBDbHVzdGVySwBUALkAMQC6db38sLGk7qvhoUGs26ZQuc+l3KzbvkY1rdOlSKRXp1mlabFvpMAosde9daSjuuIpACAAWAIoAEwCuc9TAAAAYAIAALkAAAAgAFgCKABMAigAAABuAAAASAIAAGsAAABAAgAAugQgAEgCKABKAuMAJAAJACCr7LRfusrFpQBoAigAAABvAAAAGAIAAOMAAAArACA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0AIAAIAAAA4wAAADIAILuyp1Wo57zGoUetdLNkpWggQiDE5rRNp+Shdbp1sMqk6KahoXahQajDwr3EtqToplbjAAAAKwAgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09AO/F3K7JoZYI+AEAAAAAXQD1BHACAABdAPUEiAIAAF0A9QSgAgAAuQAIAKv8qXek6KZWJwBgAuMAIgAJACC5d7NdpOWmcgAgAG4CIABiAiEAagIhAGwCuQABAEIAIABiAiUAVAICACUAkAABACEAVgInAGYCAAACASAAZAIBAawAAQAgAGYCkgAlAFQCAgAgAGQCuQABAEIAIABiAiUAVAICACEATAK5AAgAunWwyqTopqEFAJwAIABkArkAAQBEACAAYgIlAFQCAgAhAEwCJwBoArjJvUwgAGgCuQACAKH1hACsAAAACgCbAEcAuQAMAKRXpOi5z6XcplakVScAYAJqALu8uMkgAGgCuQACAKH0hACsAAAACgCbAEcAuQAMAKRVpOi5z6XcplakVycAYAJqAKXYvNAgAGgCuQACAKH2hACsAAAACgCbAEcAuQAMAKVrpOi5z6XcplalqicAYAJqAAgAAAB5AAAACAAAAGsAAAAAAAAA/////+gFAAAgAGgCuQACAKH3hACsAAAACgCbAEcAuQAMAKWqpOi5z6XcplalaycAYAJqACoAuMkCASAAZAIBAcsAqmu1b6XNaQD//zAAAACWBLgCAAAAAF0A9QQwAwAAXQD1BEgDAAACASAAZAIBAawAAQAgAGYCkgAAAAAAAAD/////KAsAAOMAAAArACA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0AAAAAAAAA4wAAADcAILuyp1W1e6ahoUe37aF1unWwyqTopqGhdrNRp+/F3K7JoUGmUKhCqOq3c6F1uMm9TKTopqGhdgAAAOMAAAArACA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0AAAAAAAAAIABuAiAAYgIhAGoCIQBsArkAAQBCACAAYgIlAFQCAgAlAJAAAQAhAFYCJwBmAgAAIABkArkAAQBCACAAYgIlAFQCAgAhAEwCuQAIALjJvUyk6KahBQCcACAAZAK5AAEARAAgAGICJQBUAgIAIQBMArkADAC6dbDKpOimVru8uMkFAJwAAAAAALkAGgCzc711rsm3fK74sKOxb6TAuc+l3KFBqMOl0SAAYgIkAGACAQARALkAKgC4ybqhoUGqvajstUyqa7Vvpc2zc711rsmnWa1wuuK5Q8C4pECmXqZYoUMRACAAZAK5AAEARwAgAGICJQBUAgIAKABMAgAAAAAAAGsA//9QCgAAeQD//0gKAABrAP//QAoAAAIBIABkAgEBywAAAAAAAABvAP//KAoAAP////8gCgAA/////wAAAV+2AEF0dHJpYnV0AGUgVkJfTmFtAGUgPSAipHWngECq7TIiDQoK8AhCYXMCeDB7MDCAMDIwODIwLQAgHQQIQwAUAhwBJDAwNAQ2fQ18R2xvYmFCbAHGU3BhYwGSRhBhbHNlDGRDcmUgYXRhYmwVH1ByQGVkZWNsYQAGSSJkAKxUcnUNQkV4EHBvc2UUHFRlbQBwbGF0ZURlcgxpdgIkkkJ1c3Rv2G1pegREAzJQgBiAHAAgU3ViIFdvcgBrc2hlZXRfQwBoYW5nZShCeQBWYWwgVGFyZ4BldCBBcyBSgQoQKQ0KIAAAJyAxAC4gs0KyeqFpAKZYqNbAeKZzAK7moWqquqi+AKdivveo7qFHCQMUSWaEIC5Db3UIbnRMgSYgPiAx4CBUaGVuAxGBJwATSE5vdAUVTWWAOUMQZWxscwITIEV4DGl0gVGDF0VuZCAMSWaDBYMCJyCo+gEHQ6q6oXWlqqSAV6ikssSkQIAlAHanQKywp1DCIF+w8rfHQwxEacBtIGVkaXQBGcY2bYMGU0A7hgY9Ri9BIygwMSwgMURAAwsnIAAyLiCldbrKxQClIEQgxOYgKOHJIbBfwkmECwA4BRUBQEJsdW1uIDw+HCA00TdDFkEodGl0LGxlgrCAX1OAtW5ngwMHBwY9IE1lLoJKAijGF1JvdywgIvBCIikuAHDBkkFYRxUEb3WRPScgv+mlAFiquqXYvNDEAOam7LNdqXes+LAgRwA1gw7BRYUOVx0ERyLKR0FwcGxpAGNhdGlvbi5FAm7BnkV2ZW50cwOAuQKpICcgvMiwjrHBT0MZQwEnID0mAENFDAEWAwABAAEAAEoJAADkAAAAiAIAAMwJAABTCQAAjx0AAAIAAAABAAAAuOR8FQAA//8jAQAAiAAAALYA//8BAQAAAAD/////AAAAAP///////wAA3BsxHRjQgkCuBHB4sDYWdyAIAgAAAAAAwAAAAAAAAEYAAAAAAAAAAAAAAAAAAAAAAQAAAHr+e36YgdlNp4VIqloYuwIQAAAAAwAAAAUAAAAHAAAA//////////8BAQgAAAD/////eAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//AAAAAE1FAAD///////8AAAAA//8AAAAA//8BAQAAAADfAP//AAAAADgA/////////////////////yAA//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+gAAAAAgBbTP////8AAAEAUxD/////AAABAFOU/////wAAAwAAPP//QgIAAAIAADwYAEQCAAAAAAI8SAD//wAAAAACPCgA//8AAAAAAjxAAP//AAAAAAI8MAD//wAAAAACPFAA//8AAAAAAjxYAP//AAAAAAI8YAD//wAAAAACPGgA//8AAAAAAjxwAP//AAAAAAI8eAD//wAAAAACPP////8AAP//AQEAAAAAAQBOADAAewAwADAAMAAyADAAOAAyADAALQAwADAAMAAwAC0AMAAwADAAMAAtAEMAMAAwADAALQAwADAAMAAwADAAMAAwADAAMAAwADQANgB9AAYAAAAAALgDAAABATAGAAACgP7//////yAAAAD/////MAAAAAIB//8AAAAAAAAAAP//////////AAAAAAAAAAAdAAAAJQAAAAwRPgL4AQAAAAADYAAAAAD//////////wAAAAAAAAAAAAAAAAAAAAD/////2P7//0AAAAAAAAAAkAAAAP/////wBAAAWQBZAAAAAAAAAAAAlAEAAQAAAAApg0AC/////wgAAAD/////sAAAAAAAAAD/////hAAAAB0AGAAlAAAAHQAYACUAAAD/////OAAAAAKD/v//////AAAAAP/////4AAAAAAD///////8AAAAA//////////8AAAAA/////x0AOAAlAAAAgqAsAv/////+/////////zABAAACAP///v///wAAAAD//////////wAAAAD/////HQA4ACUAAAAghHIC/////6j/////////uAAAAAAAAAAdABgAJQAAACCEQAL/////+P////////9wAQAAgAAAAB0AGAAlAAAAYIRcAv////9Q/////////wgA//8AAAAAIIRYAv////8w/////////1ABAAAAAAAAKYNjAv///////////////8gBAAAAAAAAUAIAAIABAAAdASAAJQAAAB0BIAAlAAAAIIRAAv/////4//////////ABAACAAAAAHQAYACUAAAAsEWACuAIAAAEAA2AAAAAA//////////8AAAAAAAAAAAAAAAAAAAAA/////wAAAAAAAAAAAAAAAKgBAAAIAP//+AQBABkAGQBZAAAAAAAAALwCAAEAAAAAaYP+/////////////////wgB//8AAAAA/////yAAAABghGQC////////////////AwD//wAAAABghGYC////////////////AwD//wAAAABghGgC////////////////CAD//wAAAAAMEV4C/////wIAA2AAAAAA//////////8AAAAAAAAAAAAAAAAAAAAA/////wAAAAAAAAAAAAAAABADAAD/////AAUCAA4ADgByAAAAAAAAAJQBAAEAAAAAKYNjAv///////////////9ABAAAAAAAA/////4ABAABghGQC////////////////AwD//wAAAABghGYC////////////////AwD//wAAAAD//////////zgAAAD4AQAAuAIAAP////8ghEAC//////j/////////kAMAAIAAAAAdACAAJQAAACCEQAL/////+P////////+wAwAAgAAAAB0AGAAlAAAAGAQAADgAAAAAAAAAMAAAALgEAAAoAAAA4P////////8MAP//IAAAALgEAAAQAAAAyP////////8MAP//IAAAACCEQAL/////+P////////8QBAAAgAAAAB0AGAAlAAAAqAUAAHABAAD//////////////////////////zgBAACQAQAA//////////94AQAAmAMAAP////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8wBQAAuAMAAKgFAADQAAAAsP////////8MAP//IAAAAEAE/v8QAAAAkP////////8MAP//IAAAAEAE/v8QAAAAeP////////8MAP//IAAAAEAE/v8QAAAAYP////////8MAP//IAAAAEgFAAAQAAAAWP////////8JAP//IAAAAP////8QAAAAXgJgAv////8MAP//BAAAAIgFAAAoAAAAOP////////8MAP//IAAAAEAE/v8QAAAAGP////////8MAP//IAAAAMAFAAAIAAAAGgD//yAAAACoBQAAAAAAAP////+oAAAA/////5AFAAD/////mAUAAP////94AAAAAP////////8MAP//IAAAABgGAAAIAAAAMQAAAAAAAAD/////QAAAAPj+////////CAD//yAAAABABP7/EAAAAPD+////////CAD//yAAAABABP7/EAAAANj+////////DAD//yAAAAD/////CAAAAEMAAAAAAAAA/////yAFAAADAAMAAAABAAAAAAAAAAAAOAAAAP//////////AAAAAP//////////uAIAAP//////////AAAAAP///////////////wABAADIAAAAAAAAAAAAAAB4AAAACAAAAAAACAXwBP////////////////////////////8QAAAABQBgAwAAlT5wbCYAAADfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/soBAIAAIoEMAAYAEgAAAAAAAIAJACgAAAAIAAAAAIEIBBAALgAwAAAAAIEICBIAMgBAAAAAAIEIBAIABgBYAAAAAIAJBAAAAAD/////AIAJADIAAABgAAAAAIAIBAgAAACYAAAAAIEIBBgAYgCgAAAAAIAJBAAAAAD/////AIAJACgAAAC4AAAAAIEIBBYANADgAAAAAIAJBAAAAAD/////AIAIBAgAAAD4AAAAAIEIBCAAdAAAAQAAAIAJBAAAAAD/////AIAIBAgAAAAgAQAAAIAJACAAAAAoAQAAAIEIBB4AagBIAQAAAIAJBAAAAAD/////AIEIBBoAKABoAQAAAIAJBAAAAAD/////AIAJADIAAACIAQAAAIAJACAAAADAAQAAAIAJADIAAADgAQAAAIEIBBQAGAAYAgAAAIEICAoAHAAwAgAAAIEIDCQAOgBAAgAAAIEIDCQAQABoAgAAAIEIDCQAQACQAgAAAIEIDCQAQAC4AgAAAIEIDDIAQADgAgAAAIEIDDIAQAAYAwAAAIEIDDIAQACIAwAAAIEIDDIAQADAAwAAAIEIDBQAJABQAwAAAIEIEAwAHABoAwAAAIEIEAoAFAD4AwAAAIEIDAIADAB4AwAAAIEIEAwAHAAIBAAAAIEICAIABgAYBAAAAIAJCAAAAAD/////AIAJADoAAABgBAAAAIEICAoAKAAgBAAAAIAJCAAAAAD/////AIAJADIAAACgBAAAAIAJACAAAAAwBAAAAIAJADIAAADYBAAAAIEIBBQAHgAQBQAAAIEICAoAHAAoBQAAAIEIDAoAHgA4BQAAAIEIEA4AHABIBQAAAIEIDA4AJABYBQAAAIEIEFoAHABoBQAAAIEIDBAAJADIBQAAAIEIEAwAHADYBQAAAIEIEAoAFADoBQAAAIEIDBQAJAD4BQAAAIEIEGIAbAAQBgAAAIEIDAIADABQBAAAAIEIEAwAHAB4BgAAAIEICAIABgCIBgAAAIAJCAAAAAD/////AIAJADIAAACQBgAAAIAJACAAAADIBgAAAIAJADIAAADoBgAAAIEIBBQAHgAgBwAAAIEICAoAHAA4BwAAAIEIDBIAHgBIBwAAAIEIEEwAHABgBwAAAIEIDBIAJACwBwAAAIEIEEQAHADIBwAAAIEIDBAAJAAQCAAAAIEIEEQAHAAgCAAAAIEIDBYAJABoCAAAAIEIEEAAHACACAAAAIEIDBgAJADACAAAAIEIED4AHADYCAAAAIEIDAIADAAYCQAAAIEIEAwAHAAgCQAAAIEICAIABgAwCQAAAIEIBAIABgA4CQAAAIAJBAAAAAD/////AIEIBBoAKgBACQAABIEIAAIACABgCQAAAIAJAAAAAAD/////AIAJADIAAABoCQAAAIAJADgAAACgCQAAAIAJADIAAADYCQAAQoEMAAYAEAAQCgAAAIAIBAgAAAAYCgAAAIAIBAgAAAAgCgAAAIAIBAgAAAAoCgAAAIAJBAAAAAD/////AIEIBCAAAAAwCgAAAIEIBC4AAABQCgAAAIAJBAAAAAD/////AIEIBBIAAACACgAAAIEICCgAAACYCgAAAIEIDBwAAADACgAAAIAJDAAAAAD/////AIEIDCwAAADgCgAAAIEIDCwAAAAQCwAAAIEIDCwAAABACwAAAIEIDCwAAACICwAAAIAJDAAAAAD/////AIEIDAIAAABwCwAAAIEICAIAAAB4CwAAAIEIBAoAAAC4CwAABIEIAAIAAADICwAAAIAJAAAAAAD/////AIAJADIAAAAIDAAAAIAJAD4AAABADAAAAIAJADIAAACADAAAIoEMAAYAEADQCwAAAIAIBAgAAADYCwAAAIAIBAgAAADgCwAAAIEIBC4AAAC4DAAAAIAJBAAAAAD/////AIEIBBIAAADoCwAAAIEICCgAAADoDAAAAIEIDCwAAAAQDQAAAIEIEHIAAABADQAAAIEIDAIAAAC4DQAAAIEIDAIAAADADQAAAIEICAIAAADIDQAAAIEIBAoAAADQDQAABIEIAAIAAADgDQAA/////wEB8A0AAJYEOAAAAAAA4wAEACIAIDEuILNCsnqhaaZYqNbAeKZzruahaqq6qL6nYr73qO6hRyAAQAIhAFACrAABAAoAnAAgAEACIQBwAhUAmwBHAHwAagBPplio1sBrAAAAIAMAAOMABAArACCo+qZYqNbAeKZzruaquqF1paqkV6ikssSkQK7moXanQKywp1DCX7Dyt8cAJQBUAgIAXQD1BDgBAADwAKwAAQCsAAEAIABAAiUAVAICAC4AcgLjAAQAIgAgMi4gpXW6ysWlIEQgxOYgKKZY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AigATAIAAAAAuQACAKH3SwBUAEYAAAC5AAoApaqpuaVrunWwyiAAWAIoAEwCAAAAALkABgCz5q7mofRLAFQARgAAALkAFACz5q7munWwyqFBpFWpuaRXunWwyiAAWAIoAEwCAAAAAAAAuQAGALPmruah9UsAVABGAAAAuQAUALPmrua6dbDKoUGkV6m5pFW6dbDKIABYAigATAIAAAAAAAC5AAYAs+au5qH2SwBUAEYAAAC5ABQAs+au5rp1sMqhQaVrqbmlqrp1sMogAFgCKABMAgAAAAAAALkABgCz5q7mofdLAFQARgAAALkAFACz5q7munWwyqFBpaqpuaVrunWwyiAAWAIoAEwCAAAAAAAAuQAMAK9Tru26dbDKpOimoUsAVAAAAAAAuQAAACAAWAIoAEwCAAAAACAAWAJCQEgBAAAAAAAAAABTAP//+AIAALkAAAAgAFgCKABMAgAAAABuAP//4AIAAOMACAAzACC37aF1unWwyqTopqGhdqfvxdyuyaFBptuwyqVop/O3c6F1uMm9TKTopqGhdqq6pXmkbAAAAAAAAAAgAP//QUBeAgEAAAAAAAAA4wAEACsAID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQAAAAAAAADjAAQAGQAgp1DCX6RHoUezQrJ6oWm4yb1MpOimoaFqAOMABAArACA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0AAAAAAAAAIABcArkACAC4yb1MpOimoQUAZQAAAAAAIAByAiEATALtAAAAAAAAALkAAgC1TEsAVAAAAAAAAAC5AAIAtUwgAFgCKABMAgAAuQAGAK3spmG4yUsAVAAAALkATgCzc711rsm3fK74sKOxb6TAuc+l3KFBqMOp863spmGlzaaot3O5z6XcoUGqvajstUyqa7Vvpc2zc711rsmnWa1wuuK5Q8C4pECmXqZYoUMgAFgCKABMAgAAAAAAALkACACvU67tuMm9TEsAVAC5AAAAIABYAigATAIAAAAAIABYAkJASAEAAAAAAAAAALkADAC6dbDKpOimVru8uMlLAFQAAAAAALkAGgCzc711rsm3fK74sKOxb6TAuc+l3KFBqMOl0SAA//8kAGACAQARALkAKgC4ybqhoUGqvajstUyqa7Vvpc2zc711rsmnWa1wuuK5Q8C4pECmXqZYoUMRACAAWAIoAEwCAAAAAAAAUwD//5AAAAC5AAAAIABYAigATAIAAAAAbgD//3gAAADjAAQAKwAgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09AAAAAAAAAOMABAAZACCnUMJfpFShR7NCsnqhabNzvXWk6KahoWoA4wAEACsAID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQAAAAAAAAAgAFwCuQAIALNzvXWk6KahBQBlAAAAAAAgAHICIQBMAu0AAAAAAAAAuQAJALNzvXUgTGluZQBLAFQAAAAAAAAAuQA/ALp1vfywsaTuq+GhQbFxs8ylqr38uuKwX6ZisW+kwL11pFems7NzxPIzrdOlSKRXrNumULnPpdynWaVpsW+kwAAgAFgCKABMAgAAAAC5AAkApsq3ZiBXYXlzAEsAVAAAAAAAAAC5ADcAunW9/LCxpO6r4aFBsXGzzKWqvfy64rBfprOzc8TyM63TpUikV6zbplC5z6Xcp1mlabFvpMChQwAgAFgCKABMAgAAAAC5AAgATWVnYXdheXNLAFQAuQA3ALp1vfywsaTuq+GhQbFxs8ylqr38uuKwX6azs3PE8jOt06VIpFes26ZQuc+l3KdZpWmxb6TAoUMAIABYAigATAIAAAAAuQANALnPpdy8xrZxIEdyaWQASwBUAAAAuQAzALp1vfywsaTuq+GhQb1MrbGkV6X0t06m7LhtprM4rdOlSKRXrNumULnPpdynWaVpsW+kwAAgAFgCKABMArkAEAC5z6XcrNu+RiBDbHVzdGVySwBUALkAMQC6db38sLGk7qvhoUGs26ZQuc+l3KzbvkY1rdOlSKRXp1mlabFvpMAosde9daSjuuIpACAAWAIoAEwCAABTAP//6AQAALkAAAAgAFgCKABMAgAAAABuAP//0AQAAGsA///IBAAAugQgAEgCKABKAuMAJAAJACCr7LRfusrFpQAAAAAAAABvAP//oAQAAOMAAAArACA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0AAAAAAAAA4wAAADIAILuyp1Wo57zGoUetdLNkpWggQiDE5rRNp+Shdbp1sMqk6KahoXahQajDwr3EtqToplbjAAAAKwAgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09AAAAAAAAAJYISAEAAAAAXQD1BOgBAABdAPUEAAIAAF0A9QQYAgAAuQAIAKv8qXek6KZWJwBgAuMAIgAJACC5d7NdpOWmcgAgAG4CIABiAiEAagIhAGwCuQABAEIAIABiAiUAVAICACUAkAABACEAVgInAGYCAAACASAAZAIBAawAAQAgAGYCkgAAAAAAAAAgAGQCuQABAEIAIABiAiUAVAICACEATAK5AAgAunWwyqTopqEFAJwAIABkArkAAQBEACAAYgIlAFQCAgAhAEwCJwBoAgAAAAAgAGgCuQACAKH1hACsAAAACgCbAEcAuQAMAKRXpOi5z6XcplakVScAYAJqAAAAAAAgAGgCuQACAKH0hACsAAAACgCbAEcAuQAMAKRVpOi5z6XcplakVycAYAJqAAAAAAAgAGgCuQACAKH2hACsAAAACgCbAEcAuQAMAKVrpOi5z6XcplalqicAYAJqAAAAAAAgAGgCuQACAKH3hACsAAAACgCbAEcAuQAMAKWqpOi5z6XcplalaycAYAJqAAAAAAB5AP//YAIAAGsA//9YAgAAAgEgAGQCAQHLAAAAAAAAAGkA//9AAgAA4wAAACsAID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQAAAAAAAADjAAAANwAgu7KnVbV7pqGhR7ftoXW6dbDKpOimoaF2s1Gn78XcrsmhQaZQqEKo6rdzoXW4yb1MpOimoaF2AAAA4wAAACsAID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQAAAAAAAACWBDACAAAAAF0A9QSwAgAAXQD1BMgCAAAgAG4CIABiAiEAagIhAGwCuQABAEIAIABiAiUAVAICACUAkAABACEAVgInAGYCAAACASAAZAIBAawAAQAgAGYCkgAAAAAAAAAgAGQCuQABAEIAIABiAiUAVAICACEATAK5AAgAuMm9TKTopqEFAJwAIABkArkAAQBEACAAYgIlAFQCAgAhAEwCuQAMALp1sMqk6KZWu7y4yQUAnAAAAAAAuQAaALNzvXWuybd8rviwo7FvpMC5z6XcoUGow6XRIABiAiQAYAIBABEAuQAqALjJuqGhQaq9qOy1TKprtW+lzbNzvXWuyadZrXC64rlDwLikQKZeplihQxEAIABkArkAAQBHACAAYgIlAFQCAgAoAEwCAAAAAAAAawD//1gAAAB5AP//UAAAAGsA//9IAAAAAgEgAGQCAQHLAAAAAAAAAG8A//8wAAAA/////ygAAAD/////AAABX7YAQXR0cmlidXQAZSBWQl9OYW0AZSA9ICKkdaeAQKrtMyINCgrwCEJhcwJ4MHswMIAwMjA4MjAtACAdBAhDABQCHAEkMDA0BDZ9DXxHbG9iYUJsAcZTcGFjAZJGEGFsc2UMZENyZSBhdGFibBUfUHJAZWRlY2xhAAZJImQArFRydQ1CRXgQcG9zZRQcVGVtAHBsYXRlRGVyDGl2AiSSQnVzdG/YbWl6BEQDMlCAGIAcACBTdWIgV29yAGtzaGVldF9DAGhhbmdlKEJ5AFZhbCBUYXJngGV0IEFzIFKBChApDQogAAAnIDEALiCzQrJ6oWkAplio1sB4pnMAruahaqq6qL4Ap2K+96juoUcJAxRJZoQgLkNvdQhudEyBJiA+IDHgIFRoZW4DEYEnABNITm90BRVNZYA5QxBlbGxzAhMgRXgMaXSBUYMXRW5kIAxJZoMFgwInIKj6AQdDqrqhdaWqpIBXqKSyxKRAgCUAdqdArLCnUMIgX7Dyt8dDDERpwG0gZWRpdAEZxjZtgwZTQDuGBj1GL0EjKDAxLCAxREADCycgADIuIKV1usrFAKUgRCDE5iAo4ckhsF/CSYQLADgFFQFAQmx1bW4gPD4cIDTRN0MWQSh0aXQsbGWCsIBfU4C1bmeDAwcHBj0gTWUugkoCKMYXUm93LCAi8EIiKS4AcMGSQVhHFQRvdZE9JyC/6aUAWKq6pdi80MQA5qbss12pd6z4sCBHADWDDsFFhQ5XHQRHIspHQXBwbGkAY2F0aW9uLkUCbsGeRXZlbnRzA4C5AqkgJyC8yLCOscFPQxlDAScgPSYAQ0UMAXikQKFHQ6W6AHWwyqTopqGhvmo/Ck0NIwYgNsksIiUKDiJiNmMEAStTZWxl8GN0IENBiUYwCC9hBANhAAIEIqH0IjogB8QowzNAISKkVam5vKRXIQxAjAUGiAb1kgYqV4AGVZcG9pEGpWtQqbmlqpcG95IGquWABmuWBrPmgGzyGiED+cEGoUE8HEIIshxICPsd/0IIch5HCLwfQggyIEgIeyHwr1Ou7SEeYU9sOeE53y4/eAQDSwdN5kFFYszBAR9pAFkLQabNCQcLJyC3CO2hdaUWoXan7wDF3K7JoUGm2wCwyqVop/O3c0ChdbjJvUziaXYRQIR5pGynB1VwZANAyKBbY2FkZU1v/GRlIJKnAyMB/3lncCUGeeJ5R6HkeeYP/3ntPD3/EwVREz09VQU/PT89yVR1F3kzPbVMXxw/Pl4CwwOtYOymYbjJDwQPBLMAc711rsm3fK4A+LCjsW+kwLkAz6XcoUGow6kC8zEEpQEWAwAGAAEAAEoLAADkAAAAiAIAAN8LAADtCwAAHSAAAAEAAAABAAAAuOQt7gAA//8jAQAAiAAAALYA//8BAQAAAAD/////AAAAAP//cAD//wAAux+pzD4PhkemNy153I/RKyAIAgAAAAAAwAAAAAAAAEYAAAAAAAAAAAAAAAAAAAAAAQAAAJbRSjuuIHVBip1uocDMf5AQAAAAAwAAAAUAAAAHAAAA//////////8BAQgAAAD/////eAAAAAiW0Uo7riB1QYqdbqHAzH+Qux+pzD4PhkemNy153I/RK///AAAAAE1FAAD///////8AAAAA//8AAAAA//8BAQAAAADfAP//AAAAAEgA/////////////////////yAA//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+gAAAAAgBbTP////8AAAEAUxD/////AAABAFOU/////wAAAwA4EP//QgIAAAIAMJQYAEQCAAAAAD4i/////wAAAAAaTP////8AAAAAGlD/////AAAAABoA/////wAAAAACPFAA//8AAAAAAjxYAP//AAAAAAI8YAD//wAAAAACPGgA//8AAAAAAjxwAP//AAAAAAI8eAD//wAAAAACPP////8AAP//AQEAAAAAAQBOADAAewAwADAAMAAyADAAOAAyADAALQAwADAAMAAwAC0AMAAwADAAMAAtAEMAMAAwADAALQAwADAAMAAwADAAMAAwADAAMAAwADQANgB9AAcAAAAAAP////8BATAIAAACgP7//////yAAAAD/////MAAAAAIB//8AAAAAAAAAAP//////////AAAAAAAAAAAdAAAAJQAAAP////9AAAAA/////wAAAAD/////AAAAAP////9IAAAA/////1AAAAD/////AAAAAB0AGAAlAAAA/////1gAAAAMET4CSAEAAAAAA2AAAAAA//////////8AAAAAAAAAAAAAAAAAAAAAcAMAANj+//9rAAAAAAAAANAAAAD/////8AQAAFkAWQAAAAAAAAAAAJQBAAEAAAAAKYNAAv////8IAAAA//////AAAAAAAAAA/////4QAAAAdABgAJQAAACCEcgL/////qP////////9oAAAAAAAAAGCEXAL/////UP////////8IAP//AAAAACCEWAL/////MP////////9AAQAAAAAAAB0AGAAlAAAALBFgAjACAAABAANgAAAAAP//////////AAAAAAAAAAAAAAAAAAAAAP////8AAAAACgAAAAAAAACgAQAACAD///gEAQAZABkAWQAAAAAAAAC8AgABAAAAACmDYwL////////////////AAQAAAAAAAMgBAACAAQAAHQEgACUAAABpg/7/////////////////CAH//wAAAAD/////IAAAAGCEZAL///////////////8DAP//AAAAAGCEZgL///////////////8DAP//AAAAAGCEaAL///////////////8IAP//AAAAAAwRXgL/////AgADYAAAAAD//////////wAAAAAAAAAAAAAAAAAAAADABQAA0P7//2sAAAAAAAAAiAIAAP////8ABQIADwAPAHIAAAAAAAAAlAEAAQAAAAApg2MC/////wgAAAD/////qAIAAAAAAAD/////gAEAAB0BIAAlAAAAYIRkAv/////4/////////wMA//8AAAAAYIRmAv/////w/////////wMA//8AAAAA//////////94AAAASAEAADACAAAAAAAA/////8AAAAACg/7//////wAAAAD/////MAMAAAAA////////AAAAAP//////////AAAAAP////8dACgAJQAAAIKgLgL//////v////////9oAwAAAgD///7///8AAAAA//////////8AAAAA/////x0AKAAlAAAA//////////////////////////////////////gAAAAoAQAA//////////8QAQAAEAQAAP////////////////////9oBQAA0AQAAFgEAAD/////QAQAAP////////////////////////////////////8YBQAA///////////////////////////////////////////oBAAAMAQAACCEQAL/////+P////////8oBAAAgAAAAB0AGAAlAAAAMAUAABAEAAAAAAAAAAAAAEAE/v+IBAAA4P////////8MAP//IAAAAEAE/v9wBAAAyP////////8MAP//IAAAAEAE/v8ABQAAsP////////8MAP//IAAAAEAE/v+gBAAAkP////////8MAP//IAAAAEAE/v+4BAAAeP////////8MAP//IAAAAEAE/v//////YP////////8MAP//IAAAAEAE/v//////WP////////8JAP//IAAAAP////9UAkgCXgJgAgAAAAAAAAAABAAAAEAE/v//////OP////////8MAP//IAAAAEAE/v9ABQAAGP////////8MAP//IAAAAFgFAAAYBQAAGgAAAAAAAABABP7/mAUAAAD/////////DAD//yAAAACwBQAAQAUAADEAAAAAAAAAQAT+/4AFAAD4/v///////wgA//8gAAAAQAT+///////w/v///////wgA//8gAAAAQAT+///////Y/v///////wwA//8gAAAA/////5gFAABDAAAAAAAAALACAAD//////////////////////////4gCAADIAgAA////////////////////////////////////////////////6AcAAHgGAACQBgAA/////8AGAAD//////////////////////////////////////////////////////////5gHAAD/////////////////////YAYAALAHAAD/////bgJgAgAAAAAAAAAAAAAAAAIAAABABP7/qAYAAOj/////////CQD//yAAAABABP7/UAcAAND/////////DAD//yAAAABABP7//////8j/////////CQD//yAAAABABP7/2AYAALD/////////DAD//yAAAABABP7/8AYAAJj/////////DAD//yAAAABABP7/CAcAAID/////////DAD//yAAAABABP7/IAcAAGj/////////DAD//yAAAABABP7/OAcAAFD/////////DAD//yAAAABABP7//////zj/////////DAD//yAAAABABP7/aAcAACD/////////DAD//yAAAABABP7/gAcAAAj/////////DAD//yAAAABABP7///////D+////////DAD//yAAAABABP7/wAcAAOj+////////AwD//yAAAADYBwAAmAcAAAUAAAAAAAAAQAT+///////g/v///x///wMA//8gAAAAGAgAAMAHAAAFAAAAAAAAAEAE/v8ACAAA2P7///////8IAP//IAAAAEAE/v//////0P7///////8IAP//IAAAAP/////ABwAADAAAAAAAAAD/////0AMAAAMAAwAAAAEAAAAAAAAAAAB4AAAA//////////8AAAAA//////////8wAgAA//////////8AAAAA////////////////OAMAAAADAAAAAAAAAQAAAHgAAAAIAAAAAAAIBfAE/////////////////////////////xAAAAAFAOACAACVPnBsJgABEgAqAFwAUgAxACoAIwAyAGEAMwABEgAqAFwAUgAxACoAIwA0ADAAOAABJAAqAFwAUgBmAGYAZgBmACoAMgBQADYAYwA3ADAANAAwAGQAOQABEgAqAFwAUgAxACoAIwAxADMAMAABEgAqAFwAUgAxACoAIwAxADMAZAABEAAqAFwAUgAxACoAIwA0ADMA3wEAAAAAAP////9gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/soBAIEAIoEMAAYAEgAIAAAAAIAJACgAAAAQAAAAAIEIBBAALgA4AAAAAIEICBIAMgBIAAAAAIEIBAIABgBgAAAAAIAJBAAAAAD/////AIAJADIAAABoAAAAAIAIBAgAAACgAAAAAIEIBBgAYgCoAAAAAIAJBAAAAAD/////AIAJACgAAADAAAAAAIEIBBYANADoAAAAAIAJBAAAAAD/////AIAIBAgAAAAAAQAAAIEIBCAAdAAIAQAAAIAJBAAAAAD/////AIAIBAgAAAAoAQAAAIAJACAAAAAwAQAAAIEIBB4AagBQAQAAAIAJBAAAAAD/////AIEIBBoAKABwAQAAAIAJBAAAAAD/////AIAJADIAAACQAQAAAIAJACAAAADIAQAAAIAJADIAAADoAQAAAIEIBBQAGAAgAgAAAIEICAoAHAA4AgAAAIEIDCQAOgBIAgAAAIEIDCQAQABwAgAAAIEIDCQAQACYAgAAAIEIDCQAQADAAgAAAIEIDDIAQADoAgAAAIEIDDIAQAAgAwAAAIEIDDIAQABYAwAAAIEIDDIAQACQAwAAAIEIDBQAJADIAwAAAIEIEAwAHADgAwAAAIEIEAoAFADwAwAAAIEIDAIADAAABAAAAIEIEAwAHAAIBAAAAIEICAIABgAYBAAAAIAJCAAAAAD/////AIAJADoAAAAgBAAAAIEICAoAKABgBAAAAIAJCAAAAAD/////AIAJADIAAABwBAAAAIAJACAAAACoBAAAAIAJADIAAADIBAAAAIEIBBQAHgAABQAAAIEICAoAHAAYBQAAAIEIDAoAHgAoBQAAAIEIEA4AHAA4BQAAAIEIDA4AJABIBQAAAIEIEFoAHABYBQAAAIEIDBAAJAC4BQAAAIEIEAwAHADIBQAAAIEIEAoAFADYBQAAAIEIDBQAJADoBQAAAIEIEGIAbAAABgAAAIEIDAIADABoBgAAAIEIEAwAHABwBgAAAIEICAIABgCABgAAAIAJCAAAAAD/////AIAJADIAAACIBgAAAIAJACAAAADABgAAAIAJADIAAADgBgAAAIEIBBQAHgAYBwAAAIEICAoAHAAwBwAAAIEIDBIAHgBABwAAAIEIEEwAHABYBwAAAIEIDBIAJACoBwAAAIEIEEQAHADABwAAAIEIDBAAJAAICAAAAIEIEEQAHAAYCAAAAIEIDBYAJABgCAAAAIEIEEAAHAB4CAAAAIEIDBgAJAC4CAAAAIEIED4AHADQCAAAAIEIDAIADAAQCQAAAIEIEAwAHAAYCQAAAIEICAIABgAoCQAAAIEIBAIABgAwCQAAAIAJBAAAAAD/////AIEIBBoAKgA4CQAABIEIAAIACABYCQAAAIAJAAAAAAD/////AIAJADIAAABgCQAAAIAJADgAAACYCQAAAIAJADIAAADQCQAAQoEMAAYAEAAICgAAAIAIBAgAAAAQCgAAAIAIBAgAAAAYCgAAAIAIBAgAAAAgCgAAAIAJBAAAAAD/////AIEIBCAAAAAoCgAAAIEIBC4AAABICgAAAIAJBAAAAAD/////AIEIBBIAAAB4CgAAAIEICCgAAACQCgAAAIEIDBwAAAC4CgAAAIAJDAAAAAD/////AIEIDCwAAADYCgAAAIEIDCwAAAAICwAAAIEIDCwAAAA4CwAAAIEIDCwAAABoCwAAAIAJDAAAAAD/////AIEIDAIAAACYCwAAAIEICAIAAACgCwAAAIEIBAoAAACoCwAABIEIAAIAAAC4CwAAAIAJAAAAAAD/////AIAJADIAAADACwAAAIAJAD4AAAD4CwAAAIAJADIAAAA4DAAAIoEMAAYABgBwDAAAAIAIBAgAAAB4DAAAAIAIBAgAAACADAAAAIEIBC4ApgCIDAAAAIAJBAAAAAD/////AIEIBBIAIgC4DAAAAIEICCgAbgDQDAAAAIEIDCwAbgD4DAAAAIEIEHIAlgAoDQAAAIEIDAIABgCgDQAAAIEIDAIADACoDQAAAIEICAIABgCwDQAAAIEIBAoAFgC4DQAABIEIAAIACADIDQAAAIAJAAAAAAD//////////wEB2A0AAP////94AAAAlgR4AAAAAADjAAQAIgAgMS4gs0KyeqFpplio1sB4pnOu5qFqqrqovqdivveo7qFHIABAAiEAUAKsAAEACgCcACAAQAIhAHACFQCbAEcAfABqAAAAAAAAAGsA//8IAAAA4wAEACsAIKj6plio1sB4pnOu5qq6oXWlqqRXqKSyxKRAruahdqdArLCnUMJfsPK3xwAAAAAAAABdAPUE+AAAAPAArAABAKwAAQAgAEACJQBUAgIALgByAuMABAAiACAyLiCldbrKxaUgRCDE5iAoplio1sB4pnOu5qq6sF/CSSkgAHICIQBSAqwABAAGAJsARwB8AGoAAABdAPUEEAEAACAAcgIhAFYCuQABAEIAIAD//yUAVAICACEATAInAFwCXQD1BCgBAADjAAQAGgAgv+mlWKq6pdi80MTmpuyzXal3rLAgRyDE5vAAIAByAiEAVgK5AAEARwAgAP//JQBUAgIALgBYAgAAugAgAEgCKABKAuMAJQAJACC8yLCxusrFpQAAAAAAAADjAAQAKwAgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09zaaot3MBMwGqvajstUyqIGu1b6XNUwOnWQCtcLriuUPAuACk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AQAAAAAAHwBeAIEDAAAAAAAAAAABAAAAAAAAAGIAAAAAAAB/AAAAAAAAAAAAAHFLAAAAAAAAAAAAAJEzAAAAAAAAAAAAAKFLAAAAAAAAAAAAAIEvARYDAAHwAAAACgMAANQAAAAAAgAA/////xEDAABlAwAAAAAAAAEAAAC45N7rAAD//yMBAACIAAAAtgD//wEBAAAAAP////8AAAAA////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADlXVxPaIg0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgACAQgAAAAPAAAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGYAAAAYBAAAAAAAAOVdXE9oiDkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAIBDAAAAAQAAAD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAdwAAABgEAAAAAAAA5V1cT2iINgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAgERAAAA//////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIAAAAGAQAAAAAAADlXVxPaIg3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgACAQ4AAAAQAAAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJkAAAAYBAAAAAAAAAAAAAAAAAAQAAAAAwAAAAUAAAAHAAAA//////////8BAQgAAAD/////eAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//AAAAAE1FAAD///////8AAAAA//8AAAAA//8BAQAAAADfAP//AAAAABgA//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8oAAAAAgBTTP////8AAAEAUxD/////AAABAFOU/////wAAAAACPP////8AAP//AQEAAAAAAQBOADAAewAwADAAMAAyADAAOAAyADAALQAwADAAMAAwAC0AMAAwADAAMAAtAEMAMAAwADAALQAwADAAMAAwADAAMAAwADAAMAAwADQANgB9AAYAAAAAAP////8BAXgAAAACgP7//////yAAAAD/////MAAAAAIB//8AAAAAAAAAAP//////////AAAAAAAAAAAdAAAAJQAAAP////9AAAAA/////wAAAAD/////AAAAAP////9IAAAA/////1AAAAD/////AAAAAP////9gAAAA/////1gAAAAAAAAAAAABAAAAAAAAAAAA////////////////AAAAAP//////////////////////////AAAAAP//////////////////////////AAAAAAAAAAD//wAA////////AAAAAP///////////////////////////////wAAAQBoAAAAlT5wbCYA3wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7KAQAAAP////8BAQgAAAD/////eAAAAP////8AAAGpsABBdHRyaWJ1dABlIFZCX05hbQBlID0gIqR1p4BAqu00Ig0KCvAIQmFzAngwezAwgDAyMDgyMC0AIB0ECEMAFAIcASQwMDQENn0NfEdsb2JhQmwBxlNwYWMBkkYQYWxzZQxkQ3JlIGF0YWJsFR9QckBlZGVjbGEABkkiZACsVHJ1DUJFeBBwb3NlFBxUZW0AcGxhdGVEZXIMaXYCJJJCdXN0bxhtaXoERAMyAACWAhj////+BeD///8RAMUCSwDHAogDAABnAhwAAAD+BeD///8SAAEWAwAB8AAAAAoDAADUAAAAAAIAAP////8RAwAAZQMAAAAAAAABAAAAuORoTgAA//8jAQAAiAAAALYA//8BAQAAAAD/////AAAAAP///////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAADAAAABQAAAAcAAAD//////////wEBCAAAAP////94AAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//8AAAAATUUAAP///////wAAAAD//wAAAAD//wEBAAAAAN8A//8AAAAAGAD//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////ygAAAACAFNM/////wAAAQBTEP////8AAAEAU5T/////AAAAAAI8/////wAA//8BAQAAAAABAE4AMAB7ADAAMAAwADIAMAA4ADIAMAAtADAAMAAwADAALQAwADAAMAAwAC0AQwAwADAAMAAtADAAMAAwADAAMAAwADAAMAAwADAANAA2AH0ABgAAAAAA/////wEBeAAAAAKA/v//////IAAAAP////8wAAAAAgH//wAAAAAAAAAA//////////8AAAAAAAAAAB0AAAAlAAAA/////0AAAAD/////AAAAAP////8AAAAA/////0gAAAD/////UAAAAP////8AAAAA/////2AAAAD/////WAAAAAAAAAAAAAEAAAAAAAAAAAD///////////////8AAAAA//////////////////////////8AAAAA//////////////////////////8AAAAAAAAAAP//AAD///////8AAAAA////////////////////////////////AAABAGgAAACVPnBsJgDfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/soBAAAA/////wEBCAAAAP////94AAAA/////wAAAamwAEF0dHJpYnV0AGUgVkJfTmFtAGUgPSAipHWngECq7TkiDQoK8AhCYXMCeDB7MDCAMDIwODIwLQAgHQQIQwAUAhwBJDAwNAQ2fQ18R2xvYmFCbAHGU3BhYwGSRhBhbHNlDGRDcmUgYXRhYmwVH1ByQGVkZWNsYQAGSSJkAKxUcnUNQkV4EHBvc2UUHFRlbQBwbGF0ZURlcgxpdgIkkkJ1c3RvGG1pegREAzIcAAAA/gXg////KAAbAp4CMP///9sFBgAAAMYCTggAAGcCHgAAAJYCARYDAAHwAAAACgMAANQAAAAAAgAA/////xEDAABlAwAAAAAAAAEAAAC45B9lAAD//yMBAACIAAAAtgD//wEBAAAAAP////8AAAAA////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAMAAAAFAAAABwAAAP//////////AQEIAAAA/////3gAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAAAABNRQAA////////AAAAAP//AAAAAP//AQEAAAAA3wD//wAAAAAYAP//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////KAAAAAIAU0z/////AAABAFMQ/////wAAAQBTlP////8AAAAAAjz/////AAD//wEBAAAAAAEATgAwAHsAMAAwADAAMgAwADgAMgAwAC0AMAAwADAAMAAtADAAMAAwADAALQBDADAAMAAwAC0AMAAwADAAMAAwADAAMAAwADAAMAA0ADYAfQByVcAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAABEAAAAAAAAAAAAAABEAAAAAAAAAAAALALAEAAAAAAAAAAAAAAMAAwAxAAAAYUYAAAAAAAAAAAAA4UcAAAAAAAAAAAAA4UsAAAAAAAAAAAAA4U8AAAAAAAAAAAAAwQwAAAAAAAAAAAAAQUYAAAAAAAAAAAAAITUAAAAAAAAAAAAAoUcAAAAAAAAAAAAAIUkAAAAAAAAAAAAAwUcAAAAAAAAAAAAAUUkAAAAAAAAAAAAAgUkAAAAAAAAAAAAAoUkAAAAAAAAAAAAA0UkAAAAAAAAAAAAA8UkAAAAAAAAAAAAAIUoAAAAAAAAAAAAAQUoAAAAAAAAAAAAAcUoAAAAAAAAAAAAAoUoAAAAAAAAAAAAA8UoAAAAAAAAAAAAAIUsAAAAAAAAAAAAAcUsAAAAAAAAAAAAAkTMAAAAAAAAAAAAAoUsAAAAAAAAAAAAAgS8AAAAAAAAAAAAAESsAAAAAAAAAAAAAUTUAAAAAAAAAAAAAMQsAAAAAAAAAAAAAIU0AAAAAAAAAAAAAUU0AAAAAAAAAAAAAcU0AAAAAAAAAAAAAoU0AAAAAAAAAAAAAYU4AAAAAAAAAAAAAkU4AAAAAAAAAAAAA0U4AAAAAAAAAAAAAIVEAAAAAAAAAAAAAkVEAAAAAAAAAAAAAwVEAAAAAAAAAAAAAAVIAAAAAAAAAAAAAoVIAAAAAAAAAAAAA4VIAAAAAAAAAAAAAcVMAAAAAAAAAAAAAIU8AAAAAAAAAAAAAUSsAAAAAAAAAAAAAYU8AAAAAAAAAAAAAQScAAAAAAAAAAAAAsU8AAAAAAAAAAAAAsVMAAAAAAAAAAAAAsUMAAAAAAAAAAAAAAQABAAAAAQAhRQAAAAAAAAAAAACRCwAAAAAAAAAAAABRRQAAAAAAAAAAAAD//////////zELAAAAAAAAAAAAAAgAHABgAAAAEQwAAAAAAAAAAAAAsQAAAAAAAAAAAAEAQQwAAAAAAAAAAAAA////////////////AQAJBgAAAAADYGkEAAAAAAAAAAAKAP////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8DAJcA6QIAAAAAAAAAAAoAOQYAAAAAAAAAAAoAaQgAAAAAAAAAAAoAKAkAAAAAAACMCAAAAAAAAGcCEgAAAJgCCAAAALgC+P///2cCLgAAAJ4C+P///9kFyP///8MJAAD4BeD///8BAMUCoAC8A8j////HAnIAAABnAioAAACeAvj////ZBcj////QAAAAEAGw////bAa8A8j////HAnIAAABnAggAAAD4AWcCBgAAAGcCYgAAAPgF4P///wEAGwL4BXj///8BABsCngL4////2QXI////7gAAAFYEBADCAlj///+eAlj////aBbD///8AAAAAAgBWBAQAwgKo////vgNY////6gUEAMj///+w////ZwIsAAAAngKo////2QXI////8AAAAJYB8AUEAAAAUAC8A8j////HAg4BAABnAggAAAD4AWcCdAAAAJ4CqP///9kFyP///wEBAACWAWwD4P///xsC/gV4////BQAbAp8CWP///54CAAAAAPQBoAEAAJ4CWP///9oFsP///wAAAAACAJEGOP///wYAYAS3AlD///++A1j////qBQYAyP///7D///84////ZwJqAAAAngKo////2QXI////AQEAAJYBbAPg////GwL+BXj///8HABsCnwJY////ngIAAAAA9AGgAQAAngJY////2gWw////AAAAAAIAVgQEAMICMP///74DWP///+oFBADI////sP///2cCKAAAAHAGnwJY////wQP0ATgAAACeAlj////0AWgJAQC+A1j///9nAhgAAACXAlD////3BQgARADHAvIEAABnApICAACeAqj////ZBcj///8GAAAAtgIY////ZwIeAAAAlgIY/////gXg////CQDFAksAxwKIAgAAZwIcAAAA/gXg////CgAbAp4CMP///9sFBgAAAMYCvgQAAGcCHgAAAJYCGP////4F4P///wsAxQJLAMcCyAIAAGcCHAAAAP4F4P///wwAGwKeAjD////bBQYAAADGAr4EAABnAh4AAACWAhj////+BeD///8NAMUCSwDHAggDAABnAhwAAAD+BeD///8OABsCngIw////2wUGAAAAxgK+BAAAZwIeAAAAlgIY/////gXg////DwDFAksAxwJIAwAAZwIcAAAA/gXg////EAAbAp4CMP///9sFBgAAAMYCvgQAAGcCHgAAAJYCGP////4F4P///xEAxQJLAMcCiAMAAGcCHAAAAP4F4P///xIAGwKeAjD////bBQYAAADGAr4EAABnAh4AAACWAhj////+BeD///8TAMUCSwDHAsgDAABnAhwAAAD+BeD///8UABsCngIw////2wUGAAAAxgK+BAAAZwIeAAAAlgIY/////gXg////FQDFAksAxwIIBAAAZwIcAAAA/gXg////FgAbAp4CMP///9sFBgAAAMYCvgQAAGcCHgAAAJYCGP////4F4P///xcAxQJLAMcCSAQAAGcCHAAAAP4F4P///xgAGwKeAjD////bBQYAAADGAr4EAABnAh4AAACWAhj////+BeD///8ZAMUCSwDHApwEAABnAhwAAAD+BeD///8aABsCngIw////2wUGAAAAZwIUAAAAngIw////2AXrAAAAAADGAr4EAABnAgYAAABnAhwAAAD+BeD///8aABsCngIw////2wUGAAAAZwIGAAAAZwIoAAAAmAIAAAAAVQQbAMICWP///58CWP////MBAAUAAL4DWP///8YCVAgAAGcCGAAAAJcCUP////cFHABEAMcCuAYAAGcCogEAAJ4CqP///9kFyP///wYAAAC2AgD///9nAh4AAACWAgD////+BeD///8dAMUCSwDHAmYFAABnAhwAAAD+BeD///8dABsCngIw////2wUGAAAAxgKsBgAAZwIeAAAAlgIA/////gXg////HgDFAksAxwKmBQAAZwIcAAAA/gXg////HwAbAp4CMP///9sFBgAAAMYCrAYAAGcCHgAAAJYCAP////4F4P///yAAxQJLAMcC+gUAAGcCHAAAAP4F4P///xoAGwKeAjD////bBQYAAABnAhQAAACeAjD////YBesAAAAAAMYCrAYAAGcCHgAAAJYCAP////4F4P///yEAxQJLAMcCigYAAGcCbAAAAPcFIgCfAvj+//+YAgAAAABVBBsAwgJY////nwJY////8wH4BAAAlwL4/v//UAFnA/D+///3BSMAUAFxA8j///8bAp4CMP///9sFBgAAAOsFBAD4/v//8P7//74DWP///7wDyP///8YCrAYAAGcCBgAAAGcCHAAAAP4F4P///xoAGwKeAjD////bBQYAAABnAgYAAADGAlQIAABnAhgAAACXAlD////3BSQARADHAlQIAABnAn4BAACeAqj////ZBcj///8GAAAAtgLY/v//ZwIeAAAAlgLY/v///gXg////JQDFAksAxwIsBwAAZwIcAAAA/gXg////JgAbAp4CMP///9sFBgAAAMYCTggAAGcCHgAAAJYC2P7///4F4P///ycAxQJLAMcCbAcAAGcCHAAAAP4F4P///ygAGwKeAjD////bBQYAAADGAk4IAABnAh4AAACWAtj+///+BeD///8pAMUCSwDHAqwHAABnAhwAAAD+BeD///8oABsCngIw////2wUGAAAAxgJOCAAAZwIeAAAAlgLY/v///gXg////KgDFAksAxwLsBwAAZwIcAAAA/gXg////KwAbAp4CMP///9sFBgAAAMYCTggAAGcCHgAAAJYC2P7///4F4P///ywAxQJLAMcCLAgAAGcCHAAAAP4F4P///y0AGwKeAjD////bBQYAAADGAk4IAABnAgYAAABnAhwAAAD+BeD///8aABsCngIw////2wUGAAAAZwIGAAAAZwIGAAAAZwIqAAAA7QX//58CWP///8ED9AE4AAAAngJY////9AFoCQEAvgNY////ZwIAAAAA+AEAAAAAAAAAABAAKAGMCAAAZAAAAAgAAAAAAAAAAAAAAAAAAAA+AAAAAAAAAAAABwAAAAAAAAAAABj///8CAAD///8CANj+//8CAKj///8DADD///8DAFD///8BAPj///8DAAAAOAAAAAAAAAAAAAYAAAAAAAAAAAD4/v//AQDw/v//AQBY////AwDI////AgCw////AgA4////AgBIAAAAAAAAABAAAAAAAAAAaQIAAAAAAABIAQAAAAAAAAAAAAAAAAAAGAAAABAAAAAAAAAACAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAA9AIAAAAAAAB4AgAAAAAAAGcCBgAAAGcCpgAAAPkFUP///77v//8bAp8C6P///+4CCAAAAPQBMAMAAJ4C6P///9kF0P///3YAAACWAWwDsP///xsC/gWA////BQAbAp8CyP///+4CCAAAAPQBoAEAAJ4CyP///9oFIP///wAAAAACAI8GCP///y4AAQCRBvD+//8vAJYBsgLw////7AUEAOj////I////6gUIAND///8g////CP////D+//9nAiIAAADwBQEAAACfAvj///+SAvD///+HBeD+//9uAgAAZwJuAAAAkgL4////bAOw////GwL+BYD///8FABsCnwLo////7gIIAAAA9AGgAQAAngLo////2gXQ////AAAAAAIAkQYg////BgD+BVD///8cAMUCSwC+A+j////qBQQA0P///yD////HAlICAABnAm4AAACSAvj///9sA7D///8bAv4FgP///zAAGwKfAuj////uAggAAAD0AaABAACeAuj////aBdD///8AAAAAAgCRBiD///8GAP4FUP///yEAxQJLAL4D6P///+oFBADQ////IP///8cCQAIAAGcClgAAAPcFIgCfAtj+///vAggAAADzAfgEAACXAtj+//9QAWcD0P7///cFIwBQAXED0P///xsCkgL4////bAOw////GwL+BYD///8HABsCnwLo////7gIIAAAA9AGgAQAAngLo////2gUg////AAAAAAIAkwYGAOsFBADY/v//0P7//74D6P///+oFBADQ////IP///2cCBgAAAGcCDAAAAMYCbgIAAGcCBgAAAGcCFgAAAJ8C+P///6UF4P7//84AAABnAgAAAAD4AQAAAAAAAAAAAAAQADABeAIAADgAAAAIAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAABEAAAAAAAAAAAACAAAAAAAAAAAANj+//8BAND+//8BAOj///8DAMj///8DAND///8CACD///8CAAj///8CAPD+//8CABQAAAAAAAATAABgAJECAAAAAAAAAAAKABEEAAAAAAAAAAAKACIAAAAAAAAOAAJhAAIIAgoAAAAAAAB/IgAAAAAAAA4AAmEAAggCFAAAAAAAABMBAAAA4QUAAAAAAAAAAAoA//////////8kAAAAAAAADgADaAACCAgIFAAAAAAAABMCAAAAEQgAAAAAAAAAAAoA//////////8IAAAAAAAAfyIAAAAAAAAOAAJhAAIICFoAAAAAAAB/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAD/////AQF4AAAAAoD+//////8gAAAA/////zAAAAACAf//AAAAAAAAAAD//////////wAAAAAAAAAAHQAAACUAAAD/////QAAAAP////8AAAAA/////wAAAAD/////SAAAAP////9QAAAA/////wAAAAD/////YAAAAP////9YAAAAAAAAAAAAAQAAAAAAAAAAAP///////////////wAAAAD//////////////////////////wAAAAD//////////////////////////wAAAAABAAAA//8AAP///////wAAAAD///////////////////////////////8AAAEAaAAAAJU+cGwmAN8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+ygEAAAD/////AQEIAAAA/////3gAAAD/////AAABqbAAQXR0cmlidXQAZSBWQl9OYW0AZSA9ICKkdaeAQKrtNiINCgrwCEJhcwJ4MHswMIAwMjA4MjAtACAdBAhDABQCHAEkMDA0BDZ9DXxHbG9iYUJsAcZTcGFjAZJGEGFsc2UMZENyZSBhdGFibBUfUHJAZWRlY2xhAAZJImQArFRydQ1CRXgQcG9zZRQcVGVtAHBsYXRlRGVyDGl2AiSSQnVzdG8YbWl6BEQDMgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABFgMAAfAAAAAKAwAA1AAAAAACAAD/////EQMAAGUDAAAAAAAAAQAAALjkCdUAAP//IwEAAIgAAAC2AP//AQEAAAAA/////wAAAAD///////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAwAAAAUAAAAHAAAA//////////8BAQgAAAD/////eAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//AAAAAE1FAAD///////8AAAAA//8AAAAA//8BAQAAAADfAP//AAAAABgA//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8oAAAAAgBTTP////8AAAEAUxD/////AAABAFOU/////wAAAAACPP////8AAP//AQEAAAAAAQBOADAAewAwADAAMAAyADAAOAAyADAALQAwADAAMAAwAC0AMAAwADAAMAAtAEMAMAAwADAALQAwADAAMAAwADAAMAAwADAAMAAwADQANgB9AAYAAAAAAP////8BAXgAAAACgP7//////yAAAAD/////MAAAAAIB//8AAAAAAAAAAP//////////AAAAACAAdAAdAAAAJQAAAP////9AAAAA/////wAAAAD/////AAAAAP////9IAAAA/////1AAAAD/////AAAAAP////9gAAAA/////1gAAAAAAAAAAAABAAAAAAAAAAAA////////////////AAAAAP//////////////////////////AAAAAP//////////////////////////AAAAAAEAAAD//wAA////////AAAAAP///////////////////////////////wAAAQBoAAAAlT5wbCYA3wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7KAQAAAP////8BAQgAAAD/////eAAAAP////8AAAGpsABBdHRyaWJ1dABlIFZCX05hbQBlID0gIqR1p4BAqu03Ig0KCvAIQmFzAngwezAwgDAyMDgyMC0AIB0ECEMAFAIcASQwMDQENn0NfEdsb2JhQmwBxlNwYWMBkkYQYWxzZQxkQ3JlIGF0YWJsFR9QckBlZGVjbGEABkkiZACsVHJ1DUJFeBBwb3NlFBxUZW0AcGxhdGVEZXIMaXYCJJJCdXN0bxhtaXoERAMyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEWAwAB8AAAAAoDAADUAAAAAAIAAP////8RAwAAZQMAAAAAAAABAAAAuOSvtAAA//8jAQAAiAAAALYA//8BAQAAAAD/////AAAAAP///////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAADAAAABQAAAAcAAAD//////////wEBCAAAAP////94AAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//8AAAAATUUAAP///////wAAAAD//wAAAAD//wEBAAAAAN8A//8AAAAAGAD//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////ygAAAACAOVdXE9oiDgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAIB////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqgAAABgEAAAAAAAA5V1cT2iINQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAgD///////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC7AAAA+AMAAAAAAABVAHMAZQByAEYAbwByAG0AXwBEAGEAdABlAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAACAAIAAAAVAAAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGsAAADSFAAAAAAAAF8AXwBTAFIAUABfADQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAIB////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAywAAAGEKAAAAAAAAU0z/////AAABAFMQ/////wAAAQBTlP////8AAAAAAjz/////AAD//wEBAAAAAAEATgAwAHsAMAAwADAAMgAwADgAMgAwAC0AMAAwADAAMAAtADAAMAAwADAALQBDADAAMAAwAC0AMAAwADAAMAAwADAAMAAwADAAMAA0ADYAfQAGAAAAAAD/////AQF4AAAAAoD+//////8gAAAA/////zAAAAACAf//AAAAAAAAAAD//////////wAAAAByAGUAHQAAACUAAAD/////QAAAAP////8AAAAA/////wAAAAD/////SAAAAP////9QAAAA/////wAAAAD/////YAAAAP////9YAAAAAAAAAAAAAQAAAAAAAAAAAP///////////////wAAAAD//////////////////////////wAAAAD//////////////////////////wAAAAAAAAAA//8AAP///////wAAAAD///////////////////////////////8AAAEAaAAAAJU+cGwmAN8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+ygEAAAD/////AQEIAAAA/////3gAAAD/////AAABqbAAQXR0cmlidXQAZSBWQl9OYW0AZSA9ICKkdaeAQKrtOCINCgrwCEJhcwJ4MHswMIAwMjA4MjAtACAdBAhDABQCHAEkMDA0BDZ9DXxHbG9iYUJsAcZTcGFjAZJGEGFsc2UMZENyZSBhdGFibBUfUHJAZWRlY2xhAAZJImQArFRydQ1CRXgQcG9zZRQcVGVtAHBsYXRlRGVyDGl2AiSSQnVzdG8YbWl6BEQDMgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABFgMAAfAAAADqAgAA1AAAAAACAAD/////8QIAAEUDAAAAAAAAAQAAALjkWkUAAP//IwEAAIgAAAC2AP//AQEAAAAA/////wAAAAD///////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAwAAAAUAAAAHAAAA//////////8BAQgAAAD/////eAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//AAAAAE1FAAD///////8AAAAA//8AAAAA//8BAQAAAADfAP//AAAAABgA//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8oAAAAAgBTTP////8AAAEAUxD/////AAABAFOU/////wAAAAACPP////8AAP//AQEAAAAAAQBOADAAewAwADAAMAAyADAAOAAyADAALQAwADAAMAAwAC0AMAAwADAAMAAtAEMAMAAwADAALQAwADAAMAAwADAAMAAwADAAMAAwADQANgB9AAYAAAAAAP////8BAVgAAAACgP7//////yAAAAD/////MAAAAAIB//8AAAAAAAAAAP//////////AAAAAK4CAAAdAAAAJQAAAP////9AAAAA/////zgAAAD/////QAAAAP////84AAAAAAAAAAAAAQAAAAAAAAAAAP///////////////wAAAAD//////////////////////////wAAAAD//////////////////////////wAAAAAAAAAA//8AAP///////wAAAAD///////////////////////////////8AAAEASAAAAJU+cGwmAN8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+ygEAAAD/////AQEIAAAA/////3gAAAD/////AAABqbAAQXR0cmlidXQAZSBWQl9OYW0AZSA9ICKkdaeAQKrtNSINCgrwCEJhcwJ4MHswMIAwMjA4MjAtACAdBAhDABQCHAEkMDA0BDZ9DXxHbG9iYUJsAcZTcGFjAZJGEGFsc2UMZENyZSBhdGFibBUfUHJAZWRlY2xhAAZJImQArFRydQ1CRXgQcG9zZRQcVGVtAHBsYXRlRGVyDGl2AiSSQnVzdG8YbWl6BEQDMgAAAAAAAAAAclUAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAARAAAAAAAAAAAAAAARAAAAAAAAAAAABQBwAQAAAAAAAAAAAAAEAAQAEgAAAOErAAAAAAAAAAAAAFEtAAAAAAAAAAAAAOEvAAAAAAAAAAAAAFExAAAAAAAAAAAAAOEzAAAAAAAAAAAAAHE1AAAAAAAAAAAAAIEuAAAAAAAAAAAAALEuAAAAAAAAAAAAAHACAAAAAAAAAAAAABEAAAAAAAAAAAAGADELAAAAAAAAAAAAACE1AAAAAAAAAAAAAFE1AAAAAAAAAAAAAOE3AAAAAAAAAAAAACE5AAAAAAAAAAAAAEEiAAAAAAAAAAAAALEjAAAAAAAAAAAAAPEhAAAAAAAAAAAAAAIAAQAAAAMA0RIwezNDNEQAMDdGOC0xNzcAQS00MEYyLUIAOEM3LTI3QTQAN0VCOTI1QjEAfXszMzE5NjkAQ0YtQjA3Qi0ANDFFOC04OEQANC1GNDY4QjGAREIxNzM4fQ1kQEdsb2JhbAGPUwhwYWMBb0ZhbHMCZQyKQ3JlYXRhBGJsFR9QcmVkZUhjbGEABklkANhUBHJ1DUJFeHBvcwZlAQ4RMFRlbXBsQYCBRGVyaXaWEkOAdXN0b21peotEAERpbSBUYXJnAGV0Q2VsbCBBQHMgUmFuZ4A/DQAKUHVibGljIABTdWIgTGF1bgBjaChCeVZhbBAgUm5nhhMpDQqiIAAAU2V0iSI9gRETgwyBL3dzgRdXb3JAa3NoZWV0BwxpYYELTG9uZwMJgwJNAGUuTGlzdEJvAHgxLkNsZWFyAQYLQ2FwdGlvbgHBfr/vvtyk6bQOwUBkwR+DCE9uIEUAcnJvciBSZXPidcCITmV4BBvBJ0AhQD0gVGhpcwEiYiBvb2suU0EjcygAIqS9pqEopKPApWmnUikiRDTGEsBHb1RvIDADGEMBgElmIE5vdCDAEyRJc0ECaGkARFRonGVugwfBI4ClIGnAKeQyIAAPMTEHBgEHwA8Id3MugVtzKGksECAyKS5AVXVlIOA8PiAiIkAoCRLBCwPBAAlFQWRkSXRlDm0AIA8RSxpFbmQgzElmxwQBRCBpwwPJBoNDBMAYU2hvdyCEmAMBCMB+DQoNCicgAKTktKnC+cC7AKq9sbW/6aRKH0CHwJrAnIOHxGtfRGIUbEPAjGtEikNhbiRjZQKVTVNB6nMuAFJldHVybkJvem8Adm6EWsBDiTcBf0mQbmRleAFELTEMRNNnVaQmPSCNByiyCYQNgYEpVW5sb2Fk4AYDKyEKHsJJv++9VEC7e6v2tnMPHmJgdG5PS19DHb8YILu/GL8YdGIivxioGFBINBOGpYYWDQpIBQAAHQAwACUAAAApg3wC/////wgAAAD/////sAAAAAAAAAD/////hAAAAB0AMAAlAAAAHQAoACUAAAAdACAAJQAAAGmD/v//////////////////////AAAAAP////8gAAAAHQAwACUAAAACg/7//////wAAAAD/////IAEAAAAA////////AAAAAP//////////AAAAAAAAAAAdADgAJQAAAIKgkAL//////v////////9YAQAAAAD///7///8AAAAA//////////8AAAAAAAAAAB0AOAAlAAAADBGUAugBAAAAAANgAAAAAP//////////AAAAAAAAAAAAAAAAAAAAAGgDAAAI////bwAAAAAAAACQAAAA/////zADAAAYABgAAgAAAAAAAACUAQADAAAAAAAAAAAAAAETAAAAAAAAAAAAADETAAAAAAAAAAAAAGETAAAAAAAAAAAAAP//////////oRIAAAAAAAAAAAAACAAQAGgAAACREwAAAAAAAAAAAADBAQAAAAAAAAAAAQDBEwAAAAAAAAAAAADTBwAA0wcAANMHAAABAKf9//8BAANgOQYAAAAAAAAAAAQA////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////CAANAHAAAAABDwAAAAAAAAAAAAABAgAAAAAAAAAAAQDxEwAAAAAAAAAAAADUBwAA1AcAANQHAAABAKj9//8CAANgeQkAAAAAAAAAAAQA////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////CAAWAHgAAAAxDwAAAAAAAAAAAABBAgAAAAAAAAAAAQBhDwAAAAAAAAAAAAD///////////////8BAKj9//8DAANgaQwAAAAAAAAAAAQA////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////AAAAAAQAXwDpAgAAAAAAAAAABAAZBQAAAAAAAAAABABpCAAAAAAAAAAABAA5CwAAAAAAAAAABADSAgAAAAAAAFwCAAAAAAAAZwISAAAAmAIIAAAAuAL4////ZwIYAAAAmAL4////ngIAAAAAqANgAAAAZwIqAAAAnwLg////ngIAAAAA9AEgAwAAngLg////9AGYBAEAvgPg////ZwIcAAAA/gXI////BgAbAp4CAAAAANsFAQABgGcCDAAAAM4C/////2cCUgAAAJ8CqP////4FyP///wcAGwKfAuD////fAwgAWgQJAPQBgAMCAJ4C4P////QByAADAJgCqP///1UECgDCAvD////sBQQA4P///6j///9nAgwAAADOAv7///9nAhgAAACYAvD////sASYBCwHHAjACAABnAiIAAADwBQIAAACfAuj////wBQsAAACHBZj///8wAgAAZwJuAAAAkgLo////bAPI////GwL4BYD///8CABsCnwLg////ngLw////9AGgAQQAngLg////2gVQ////AAAAAAIAkQYg////CwD+BTj///8MAMUCXAC+A+D////qBQQAUP///yD////HAhQCAABnApIAAACSAuj///9sA8j///8bAvgFgP///wIAGwKfAuD///+eAvD////0AaABBACeAuD////aBVD///8AAAAAAgCOBiD///8LABoC8QEI////nwIg////nwKo////ngIAAAAA9AEgAwAAngKo////9AGQBAUA7AUEAOD///+o////6gUGAFD///8g////CP///2cCBgAAAGcCFgAAAJ8C6P///6UFmP///xQBAABnAgYAAABnAhwAAADvAcj///8bAp4CAAAAANgFAxABgAEAZwIAAAAA+AEAAAAAAAAAAAAAEAD4AFwCAABEAAAACAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAACAAAAAAAAAAAA+P///wMA8P///wMAMgAAAAAAAAAAAAUAAAAAAAAAAADg////AwCo////AwBQ////AgAg////AgAI////AgBIAAAAAAAAABAAAAAAAAAAaQIAAAAAAADoAQAAAAAAAAAAAAAAAAAAEAAAABAAAAAAAAAACAAAAAAAAQEAAAIBAAADAQAABAEAAAUBAAAGAQAABwEAAAgBAAAJAQAACgEAAAsBAAAMAQAADQEAAA4BAAAPAQAAEAEAABEBAAASAQAAEwEAABQBAAAVAQAAFgEAABcBAAAYAQAAGQEAABoBAAAbAQAAHAEAAB0BAAAeAQAAHwEAACABAAAhAQAAIgEAACMBAAAkAQAAJQEAACYBAAAnAQAAKAEAACkBAAAqAQAA/v///ywBAAAtAQAALgEAAP7///8wAQAAMQEAADIBAAAzAQAANAEAADUBAAA2AQAANwEAADgBAAA5AQAAOgEAADsBAAA8AQAAPQEAAD4BAAA/AQAA/v///0EBAABCAQAAQwEAAEQBAABFAQAARgEAAEcBAABIAQAASQEAAEoBAABLAQAATAEAAE0BAAD+////TwEAAFIBAABRAQAA/v////7///9UAQAA/v///1YBAABXAQAAWAEAAFkBAAD+////WwEAAF4BAABdAQAA/v////7///9gAQAA/v///2IBAABjAQAAZAEAAGUBAAD+////ZwEAAGgBAABpAQAAagEAAP7///9sAQAAbQEAAG4BAABvAQAAcAEAAHEBAAByAQAAcwEAAHQBAAB1AQAAdgEAAHcBAAB4AQAAeQEAAHoBAAB7AQAA/v////////////////////////8AAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAACCAQAAAAAAABgBAAAAAAAAZwIGAAAAZwJOAAAAnwLg////nwL4////ngIAAAAA9AEgAwAAngL4////9AGIAw0AlgLg////+AXI///////FAlwAvgP4////vAPg////xwIIAQAAZwKOAAAAnwKQ////8QGw////nwLg////nwL4////ngIAAAAA9AEgAwAAngL4////9AGIAw0AnwLg////nwKo////ngIAAAAA9AEgAwAAngKo////9AFwBA4AoAKQ////ngIAAAAAjgNgAAAA2wUGAAAA7AUEAPj///+o////6gUGAOD///+w////kP///2cCJgAAAJgCAAAAAL8D+P///98DEABaBBEA9AEgAA8AvgP4////ZwIGAAAAZwIAAAAA+AEAAAAAAAAAAAAACACIABgBAAA4AAAACAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAMgAAAAAAAAAAAAUAAAAAAAAAAAD4////AwCo////AwDg////AgCw////AgCQ////AgBIAAAAAAAAABAAAAAAAAAAaQIAAAAAAAC4AgAAAAAAAAAAAAAAAAAACAAAABAAAAAAAAAACAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAABMAAAAAkQIAAAAAAAAAAAQA//////////8iAAAAAAAADgACYQACCAIKAAAAAAAAfxQAAAAAAAATAQBoAMEEAAAAAAAAAAAEAOEFAAAAAAAAAAAEACIAAAAAAAAOAAJhAAIIAiIAAAAAAAAOAAJhAAIIAhQAAAAAAAATAgBwABEIAAAAAAAAAAAEACEJAAAAAAAAAAAEAAoAAAAAAAB/IAAAAAAAAA4AAVoAAgggAAAAAAAADgABWgACCBQAAAAAAAATAwB4AOEKAAAAAAAAAAAEABEMAAAAAAAAAAAEACAAAAAAAAAOAAFaAAIIAgAAAAAAAH8gAAAAAAAADgABWgACCFwAAAAAAAB/AAAAAAAAAAAIBAwAHAAYAQAABIEIAAIACAAoAAAAAAAAAAAAAAAAclVAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAGgAAAAAAAAARAAAAAAAAAAAABAD///////////////8AAAAAkAAAAAgASADhAQAAAAAAAAAABAAAAANgBAAxA////////////////////////wAAAABxAQAAAAAAAAAAAQAAAAAAHwAeAPEAAAAAAAAAAAABAEgAEQQAAAAAAAAAAAQAAQADYAQAOAM4AP//////////ARYDAAYAAQAA9goAAOQAAAB8AwAA7wwAABUNAADFEQAAAgAAAAEAAAC45DheAAD//wEAAACIAAAAtgD//wEBAAAAAP////8AAAAA//+IAP//AABmBSUAhT1pQYFLiQ6GHkrVFrqXG2Hgf0G2cF8jwLf8RWHGC0PEI8ZGtq1FYtBjaAoBAAAApDBx4KVLVkyuCH2CL28z5BAAAAADAAAABQAAAAcAAAD//////////wEBCAAAAP////94AAAACKQwceClS1ZMrgh9gi9vM+RmBSUAhT1pQYFLiQ6GHkrV//8AAAAATUUAAP///////wAAAAD//wAAAAD//wEBAAAAAN8A//8AAAAAkAD/////////////////////KAD/////////////////////////////////////IAD//////////////////////////////////////////////////////////////////////////////////////////////////////////0ABAAACAFNQ/////wAAAQBTEP////8AAAEAUxT/////AAACAFMU/////wAAAQAxlP//AAAAAAEAIJQwAEQCAAACADgQ//9CAgAAAAA+Iv////8AAAAAGkz/////AAAAABpM/////wAAAAAaEP////8AAAAAmiL/////AAAAABpM/////wAAAAAaTP////8AAAAAGlD/////AAAAABpM/////wAAAAAalP////8AAAAAGgz/////AAAAAAI8mAD//wAAAAACPKAA//8AAAAAAjyoAP//AAAAAAI8sAD//wAAAAACPLgA//8AAAAAAjzAAP//AAAAAAI8yAD//wAAAAACPNAA//8AAAAAAjzYAP//AAAAAAI84AD//wAAAAACPOgA//8AAAAAAjzwAP//AAAAAAI8+AD//wAAAAACPP////8AAP//AQEIAAAAAgCkArwCAAACAJoAMAB7ADMAQwA0AEQAMAA3AEYAOAAtADEANwA3AEEALQA0ADAARgAyAC0AQgA4AEMANwAtADIANwBBADQANwBFAEIAOQAyADUAQgAxAH0AewAzADMAMQA5ADYAOQBDAEYALQBCADAANwBCAC0ANAAxAEUAOAAtADgAOABEADQALQBGADQANgA4AEIAMQBEAEIAMQA3ADMAOAB9AAcAAAAAAP////8BAegGAAACgP7/OAAAACAAAAD/////MAAAAAIB//8AAAAAAAAAAP//////////AAAAAAAAAAAdAAAAJQAAAAKB/v////////////////9oAAAAAgH//zgAAAAAAAAA//////////8AAAAAAAAAAB0AGAAlAAAAIIR8Av/////4/////////+gAAACAAAAAHQAwACUAAAApg3wC/////wgAAAD/////sAAAAAAAAAD/////hAAAAB0AMAAlAAAAHQAoACUAAAAdACAAJQAAAGmD/v//////////////////////AAAAAP////8gAAAAHQAwACUAAAACg/7//////wAAAAD/////IAEAAAAA////////AAAAAP//////////AAAAAAAAAAAdADgAJQAAAIKgkAL//////v////////9YAQAAAAD///7///8AAAAA//////////8AAAAAAAAAAB0AOAAlAAAADBGUAugBAAAAAANgAAAAAP//////////AAAAAAAAAAAAAAAAAAAAAGgDAAAI////bwAAAAAAAACQAAAA/////zADAAAYABgAAgAAAAAAAACUAQADAAAAACCEYwL/////8P////////+4AAAAAAAAAGCEZAL/////6P////////8DAP//AAAAAAwRugJgAgAAAQADYAAAAAD//////////wAAAAAAAAAAAAAAAAAAAAD/////AAAAAAoAAAAAAAAAQAIAAP////84AwEACAAIABoAAAAAAAAAlAEAAQAAAAApg3kC////////////////wAAAAAAAAAD/////hAAAAAwRwgK4AgAAAgADYAAAAAD//////////wAAAAAAAAAAAAAAAAAAAACABQAAeP///2sAAAAAAAAA//////////9AAwIABwAHACIAAAAAAAAAlAAAAQAAAAAMEawC/////wMAA2AAAAAA//////////8AAAAAAAAAAAAAAAAAAAAA/////wAAAAAKAAAAAAAAAP//////////SAMDAAQABAApAAAAAAAAAJQAAAEAAAAAIoCuAv////9gAAAA/////4gAAAAAAAAAAAADQAAAAAD//////////wAAAAAAAAAA6AEAAGACAAAQAwAAuAIAAP//////////YAEAAP//////////mAAAANABAAD/////////////////////cAAAALgBAAD//////////////////////////////////////////////////////////zAEAAAQBQAA/////0gEAAD//////////////////////////////////////////////////////////5AEAAD/////////////////////GAQAAAgEAACoBAAAcAAAAAAAAAAAAAAA/////64CqAKyAiYCuAIAAAAAAAAFAAAAQAT+/3gEAADg/////////wkA//8gAAAAQAT+/2AEAADI/////////wwA//8gAAAAQAT+/+AEAACw/////////wwA//8gAAAAQAT+//////+o/////////wkA//8gAAAAQAT+/7gEAACg/////////wMA//8gAAAA0AQAAJAEAAANAAAAAAAAAEAE/v//////mP////8f//8DAP//IAAAAHAFAAC4BAAADQAAAAAAAABABP7/+AQAAID/////////DAD//yAAAABABP7/KAUAAGj/////////DAD//yAAAABABP7/QAUAAFD/////////DAD//yAAAABABP7//////zj/////////DAD//yAAAABABP7/WAUAACD/////////DAD//yAAAABABP7//////wj/////////DAD//yAAAAD/////uAQAABEAAAAAAAAA////////////////////////////////////////////////////////////////////////////////////////////////OAYAAFAGAAD/////aAYAAP////////////////////////////////////////////////////////////////////////////////////8gBgAA//////////+oAq4CcgEAAAAAAAAAAAAAAwAAAEAE/v+YBgAA+P////////8JAP//IAAAAEAE/v+ABgAA4P////////8MAP//IAAAAEAE/v/IBgAAyP////////8MAP//IAAAAEAE/v+wBgAAsP////////8MAP//IAAAAEAE/v//////qP////////8JAP//IAAAAEAE/v//////kP////////8MAP//IAAAAEAE/v//////eP////////8MAP//IAAAAP////+4BgAABAAEAAEAAgAAAAAAAAAAAGABAAD/////EAMAAAAAAAD//////////7gCAAD/////EAMAADgAAAD///////////////8oAQAA8AAAAAAAAAAAAAAAkAAAAAgAAAAAAFADMAP/////////////////////////////GAAAAAgAQAMAAJU+cGwmAAEOACoAXABSADQAKgAjAGUAARIAKgBcAFIAMQAqACMAMgBhADMAASQAKgBcAFIAZgBmAGYAZgAqADEAdgA2AGMANwAwADMAZQA0ADUAARIAKgBcAFIAMQAqACMANAAwADgAAAHqACoAXABHAHsAQQBDADIARABFADgAMgAxAC0AMwA2AEEAMgAtADEAMQBDAEYALQA4ADAANQAzAC0AMAAwAEEAQQAwADAANgAwADAAOQBGAEEAfQAjADIALgAwACMAMAAjAEMAOgBcAFcASQBOAEQATwBXAFMAXABzAHkAcwB0AGUAbQAzADIAXABGAE0AMgAwAC4ARABMAEwAXAAyACMATQBpAGMAcgBvAHMAbwBmAHQAIABGAG8AcgBtAHMAIAAyAC4AMAAgAE8AYgBqAGUAYwB0ACAATABpAGIAcgBhAHIAeQAqACMANAA1AAABJAAqAFwAUgBmAGYAZgBmACoAMQB3ADYAYwA3ADAAMwBlADQANQABEgAqAFwAUgAxACoAIwAxADQAYQABEgAqAFwAUgAxACoAIwAxADMANQABEgAqAFwAUgAxACoAIwAxADMAZAABEgAqAFwAUgAxACoAIwAxADMAZAABEAAqAFwAUgAwACoAIwAyADcAARAAKgBcAFIAMAAqACMAMgA2AN8DAAAAAADTBwAAaAAAAAAAAADUBwAAcAAAAAAAAAD/////eAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7KAQAtAACACAAIAAAAAAAAAACACQAAAAAA/////yKBDAAGABIACAAAAACBCAQKABgAEAAAAACACAQIAAAAIAAAAACACAQIAAAAKAAAAACACQQAAAAA/////wCBCAQOACoAMAAAAACBCAQUABwAQAAAAACACQQAAAAA/////wCBCAQEAAwAWAAAAACBCAQgAFIAYAAAAACBCAQEAAwAgAAAAACACQQAAAAA/////wCBCAQMABgAiAAAAACBCAgSACIAmAAAAACBCAweAG4AsAAAAACBCBAkAJIA0AAAAACBCAwCAAYA+AAAAACBCAgKABYAAAEAAACBCAQCAAYAEAEAAACACQQAAAAA/////wCBCAQMABwAGAEAAASBCAACAAgAKAEAAACACQAAAAAA/////wCACQAYAAAAMAEAACKBDAAGABAASAEAAACBCAQWAAAAUAEAAACBCAgiAAAAaAEAAACBCAgKAAAAkAEAAACBCAQCAAAAoAEAAASBCAACAAAAqAEAAACACQAAAAAA/////wCACQAYAAAAsAEAACKBCAAGAAYAyAEAAACBCAQWAE4A0AEAAACBCAgiAI4A6AEAAACBCAgKACYAEAIAAACBCAQCAAYAIAIAAASBCAACAAgAKAIAAACACQAAAAAA/////yKBCAAGABAAMAIAAACACQAAAAAA/////wSBCAACAAAAOAIAAACACQAAAAAA//////////8BAUgCAABdAPUEEAMAAJYUYAEAAAAA8AAgAHwCLgCuAoABAAAAAF0A9QS4AQAAXQD1BNABAAAgAP//IQCoAkJAsAIAAAAAuQAIAL/vvtyk6bTBIAD//ygAsgIQAAAAzAQAAKADAADwALkADACkvaahKKSjpWmnUikgACYCJQC0AgEALgBiAswIAAB4AwAAIABi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x4FspoBypuq28aRKw28fIxUtaIBkoxLDA1VubEhvYWTgKA0KCEr///j/////////AwD//wAAAABghNgC//////D/////////CAD//wAAAAAigK4C/////2AAAAD/////iAAAAAAAAAAAAANAAAAAAP//////////AAAAAAAAAAD/////KAEAANABAAD////////////////oAQAAeAMAALgBAAD/////AAIAAP//////////////////////////////////////////UAQAALgDAABoBAAA/////9ADAAD/////sAQAAP////////////////////8ABAAA//////////////////////AEAAD/////////////////////oAMAAJADAAAghHwC//////j/////////wAAAAIAAAAAYBAAAeAMAAAAAAAAAAAAA/////64CqAKyAiYC0ALSArgCAAAHAAAAQAT+/wAAsSMAAAAAAAAAAAAA8SEAAAAAAAAAAAAAAgABAAAAAwDRMgAAAAAAAAAAAAABMwAAAAAAAAAAAAChOwAAAAAAAAAAAAAxMwAAAAAAAAAAAAD//////////6E3AAAAAAAAAAAAAAgAEABoAAAAkRMAAAAAAAAAAAAAwQEAAAAAAAAAAAEAwRMAAAAAAAAAAAAA0QcAANEHAADRBwAAAAD//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wgADQBwAAAAAQ8AAAAAAAAAAAAAAQIAAAAAAAAAAAEA8RMAAAAAAAAAAAAA0gcAANIHAADSBwAAAQCo/f//AQADYCkGAAAAAAAAAAACAP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wgAFgB4AAAAMQ8AAAAAAAAAAAAAQQMAAAAAAAAAAAEAYQ8AAAAAAAAAAAAA////////////////AAD//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wAAAAACAF8A6QIAAAAAAAAAAAIAGQUAAAAAAAAAAAIAkAQAAAAAAADwAwAAAAAAAGcCEgAAAJgCCAAAALgC+P///2cCGAAAAJgC+P///54CAAAAAKgDYAAAAGcCKgAAAJ8C0P///54CAAAAAPQBIAMAAJ4C0P////QBmAQBAL4D0P///2cCHAAAAP4FuP///woAGwKeAgAAAADbBQEAAYBnAjgAAACfAtD////fAwsAWgQMAPQBGAQCAGUD0P///8ADmP///58C8P///7sFkP///w0A8gEAAGcCmgAAAJ8CiP///54C8P////QBkAADAJcCiP///58CaP///54CAAAAAI4DYAAAANkFcP///1wBAABWBA0AwgLQ////ngLQ////9AGQAAMAlwJo////VQCfAmD///+eAvD////0AZAAAwCXAmD////3BQ4AVQAyAOsFBgCI////aP///2D///++A9D///+8A3D////HAtQBAABnAjIAAACfAlj////wBQkEAACeAvD////0ATgBBACSAlj////wBf////8/AMcCzgEAAGcCWgAAAPEBQP///58CiP///54C8P////QBkAADACIDiP///3EDcP///58C0P///54CAAAAAPQBIAMAAJ4C0P////QBkAQFAL4D0P///+oFBABw////QP///2cCBgAAAGcCBgAAAGcCGAAAAJ8C8P///74FkP///w0AqAAAAGcCfgAAAJ4CAAAAAI4DYAAAANkFcP///wYAAAAaAvcFDwDwBQAAAADwBf/////wBQEAAAD3BQ8A9wUQAJYCcP///2EEiP////cEBgAwAGcDaP///1ABZwNg////9wUPAFABtwLg////6wUGAIj///9o////YP///7wDcP///2cCVAAAAPAFAAAAAJ8C6P///58CWP///58C0P///54CAAAAAPQBIAMAAJ4C0P////QBaAMHAJICWP////AFAQAAANAAvgPQ////hwUw////zAMAAGcCggAAAP4FGP///w8AnwJA////8QFw////nwLo////twO4////A0CfAtD///+eAgAAAAD0ASADAACeAtD////0AXAECACWAkD///9PAQD////+Bej+//8PAE8B0P7//2AEtwLY////vgPQ////6gUIAHD///9A////AP///9D+//9nAi4AAADwBQEAAACXAuD///+XAtj////wBQAAAABOBvAFAAAAAJQAxwKwAwAAZwI8AAAA7QX//58C6P///7cDuP///wNAnwLQ////ngIAAAAA9AEgAwAAngLQ////9AGIBAkAvgPQ////ZwIGAAAAZwIWAAAAnwLo////pQUw////xAIAAGcCHAAAAO8BuP///xsCngIAAAAA2AUDEAGAAQBnAgAAAAD4AQAAAAAAAAAAEAAwAfADAABcAAAACAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAGAAAAAAAAAAAAmP///wMAkP///wMA4P///wEA+P///wMA8P///wMA2P///wEARAAAAAAAAAAAAAgAAAAAAAAAAACI////AQBo////AQBg////AQDQ////AwBw////AgBA////AgAA////AgDQ/v//AgCiAgAAAAAAADACAAAAAAAAZwIGAAAAZwIQAAAA9wUSAMQC8P///2cCVAAAAPAFAAAAAJ8C+P///58C4P///58C6P///54CAAAAAPQBIAMAAJ4C6P////QBaAMHAJIC4P////AFAQAAANAAvgPo////hwXQ////3AEAAGcCUAAAAJ8CsP///58CgQAAAIIAAACDAAAAhAAAAIUAAACGAAAAhwAAAHYAAACJAAAAjwAAAKoAAACMAAAAjQAAAI4AAAD+////kAAAAKgAAACSAAAAkwAAAJQAAACVAAAAlgAAAJcAAACYAAAAiwAAAJoAAACbAAAAnAAAAJ0AAACeAAAApwAAAKAAAAChAAAAogAAAKMAAACkAAAApQAAAKYAAACZAAAA/v///6kAAACrAAAArAAAAK0AAACuAAAArwAAAP7///+wAAAAsQAAALIAAAD+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8BFgMABgABAACuCwAA5AAAAHQDAACQDQAAtg0AAH4UAAAAAAAAAQAAALjkMwYAAP//AQAAAIgAAAC2AP//AQEAAAAA/////wAAAAD//4gA//8AACsUxfi7ckBNoNQZ3Zv8wLbb+F3u7L37RZcFQv9ZwrCJxH4hg53YVUGyfnKQeXxoHwEAAADjJw8dFySiR4s1BbfUFnZlEAAAAAMAAAAFAAAABwAAAP//////////AQEIAAAA/////3gAAAAI4ycPHRckokeLNQW31BZ2ZSsUxfi7ckBNoNQZ3Zv8wLb//wAAAABNRQAA////////AAAAAP//AAAAAP//AQEAAAAA3wD//wAAAACIAP////////////////////8oAP//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////QAEAAAIAU1D/////AAABAFMQ/////wAAAQBTFP////8AAAIAUxT/////AAACADgQ//9CAgAAAQAglCAARAIAAAAAPiL/////AAAAABpM/////wAAAAAaTP////8AAAAAGhD/////AAAAAJoi/////wAAAAAaTP////8AAAAAGkz/////AAAAABoA/////wAAAAAaCP////8AAAAAGpT/////AAAAABoM/////wAAAAACPJAA//8AAAAAAjyYAP//AAAAAAI8oAD//wAAAAACPKgA//8AAAAAAjywAP//AAAAAAI8uAD//wAAAAACPMAA//8AAAAAAjzIAP//AAAAAAI80AD//wAAAAACPNgA//8AAAAAAjzgAP//AAAAAAI86AD//wAAAAACPPAA//8AAAAAAjz4AP//AAAAAAI8/////wAA//8BAQAAAAACAJoAMAB7AEIAOAAzAEYAMgA1AEEAOQAtAEEARQBFAEYALQA0ADkAOAAyAC0AQgA0AEEANwAtADEARgA1AEIANABEAEIARAA2ADEAMQAxAH0AewAzADQAMABGADAANAAxADcALQBEAEEAOABBAC0ANABEADUAQQAtAEEANwBEADUALQA2AEYAMQAzAEIAQQAzAEEAQQA4AEIANQB9AAcAAAAAAOgAAAABAagHAAACgP7/OAAAACAAAAD/////MAAAAAIB//8AAAAAAAAAAP//////////AAAAAHIAZQAdAAAAJQAAAAKB/v////////////////9oAAAAAgH//zgAAAAAAAAA//////////8AAAAAdQBuAB0AGAAlAAAAoAIAAP////8YAgAAYAEAAP////8AAAAAHQAgACUAAAApg3wC/////wgAAAD/////sAAAAAAAAAD/////hAAAAB0AIAAlAAAAHQAoACUAAAAdACAAJQAAAGmD/v//////////////////////AAAAAP////8gAAAA/////wAAAAACg/7//////wAAAAD/////IAEAAAAA////////AAAAAP//////////AAAAAAAAAAAdADAAJQAAAIKglgL//////v////////9YAQAAAAD///7///8AAAAA//////////8AAAAAAAAAAB0AMAAlAAAADBGUAhgCAAAAAANgAAAAAP//////////AAAAAAAAAAAAAAAAAAAAANgCAADQ/v//awAAAAAAAACQAAAA/////zADAAAgACAAAgAAAAAAAACUAQADAAAAACCEYwL/////8P////////+4AAAAAAAAAGCEZAL/////6P////////8DAP//AAAAAGCEyAL/////4P////////8IAP//AAAAAGCEygL/////2P////////8IAP//AAAAAAwRwgL/////AQADYAAAAAD//////////wAAAAAAAAAAAAAAAAAAAACwBQAAOP///2sAAAAAAAAA//////////84AwEAFQAVACIAAAAAAAAAlAAAAQAAAABghGQC//////j/////////AwD//wAAAABghNgC//////D/////////CAD//wAAAAAigK4C/////2AAAAD/////iAAAAAAAAAAAAANAAAAAAP//////////AAAAAAAAAAD/////KAEAANABAAD////////////////oAQAAeAMAALgBAAD/////AAIAAP//////////////////////////////////////////UAQAALgDAABoBAAA/////9ADAAD/////sAQAAP////////////////////8ABAAA//////////////////////AEAAD/////////////////////oAMAAJADAAAghHwC//////j/////////wAAAAIAAAAAYBAAAeAMAAAAAAAAAAAAA/////64CqAKyAiYC0ALSArgCAAAHAAAAQAT+///////Q/////////wkA//8gAAAAQAT+/+gDAAC4/////////wwA//8gAAAAQAT+/0AFAACg/////////wwA//8gAAAAQAT+/ygEAACY/////////wkA//8gAAAAQAQAAAAEAAALAAAAAAAAAEAE/v//////kP////9P//8JAP//IAAAAOAEAAAoBAAACwAAAAAAAABABP7/gAQAAIj/////////CAD//yAAAABABP7/yAQAAHD/////////DAD//yAAAABABP7/mAQAAGj/////////CAD//yAAAABABP7//////2D/////////CAD//yAAAABABP7//////1j/////////AwD//yAAAABABP7/WAUAAED/////////DAD//yAAAAAIBQAAKAQAABEAAAAAAAAAQAT+/xgFAAA4/////////wMA//8gAAAAMAUAAPAEAAAVAAAAAAAAAEAE/v//////MP////8f//8DAP//IAAAAKAFAAAYBQAAFQAAAAAAAABABP7/cAUAABj/////////DAD//yAAAABABP7/iAUAAAD/////////DAD//yAAAABABP7//////+j+////////DAD//yAAAABABP7//////9D+////////DAD//yAAAAD/////GAUAABoAAAAAAAAAcAIAAP////////////////////+IAgAA////////////////////////////////////////////////////////////////aAYAADAHAAD/////6AYAAAAHAACABgAA////////////////////////////////////////////////mAYAAP////////////////////9QBgAAsAYAAP////+oAq4CcgEAAAAAAAAAAAAAAwAAAEAE/v//////6P////////8JAP//IAAAAEAE/v//////4P////////8DAP//IAAAAEAE/v/ABgAA2P////////8DAP//IAAAANgGAACYBgAABgAAAAAAAABABP7//////9D/////H///AwD//yAAAACQBwAAwAYAAAYAAAAAAAAAQAT+/xgHAAC4/////////wwA//8gAAAAQAT+//////+w/////////wsA//8gAAAAQAT+//////+Y/////////wwA//8gAAAAQAT+/0gHAACA/////////wwA//8gAAAAQAT+/2AHAABo/////////wwA//8gAAAAQAT+/3gHAABQ/////////wwA//8gAAAAQAT+//////84/////////wwA//8gAAAA/////8AGAAAOAAAAAAAAAP////+4AwAAAgACAAEAAgAAAAAAAAAAAGABAAD/////oAIAAAAAAAD//////////xgCAAD/////oAIAADgAAAD///////////////8oAQAA8AAAAAAAAAAAAAAAkAAAAAgAAAAAAEADMAP/////////////////////////////GAAAAAUAcAAAAJU+cGwmAAESACoAXABSADEAKgAjADIAYQAzAAEkACoAXABSAGYAZgBmAGYAKgAyADsANgBjADcAMAAzAGUAOQBiAAESACoAXABSADEAKgAjADQAMAA4AAAB6gAqAFwARwB7AEEAQwAyAEQARQA4ADIAMQAtADMANgBBADIALQAxADEAQwBGAC0AOAAwADUAMwAtADAAMABBAEEAMAAwADYAMAAwADkARgBBAH0AIwAyAC4AMAAjADAAIwBDADoAXABXAEkATgBEAE8AVwBTAFwAcwB5AHMAdABlAG0AMwAyAFwARgBNADIAMAAuAEQATABMAFwAMgAjAE0AaQBjAHIAbwBzAG8AZgB0ACAARgBvAHIAbQBzACAAMgAuADAAIABPAGIAagBlAGMAdAAgAEwAaQBiAHIAYQByAHkAKgAjADQANQAAASQAKgBcAFIAZgBmAGYAZgAqADEAdwA2AGMANwAwADMAZQA0ADUAARIAKgBcAFIAMQAqACMAMQA0AGEAARIAKgBcAFIAMQAqACMAMQAzAGQAARAAKgBcAFIAMQAqACMAOQAzAAEOACoAXABSADAAKgAjAGYAARAAKgBcAFIAMAAqACMAMgA3AAEQACoAXABSADAAKgAjADIANgDfAwAAAAAA0QcAAGgAAAAAAAAA0gcAAHAAAAAAAAAA/////3gAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+ygEANwAAgAgACAAAAAAAAAAAgAkAAAAAAP////8igQwABgASAAgAAAAAgQgECgAYABAAAAAAgAgECAAAACAAAAAAgAgECAAAACgAAAAAgAgECAAAADAAAAAAgAgECAAAADgAAAAAgAkEAAAAAP////8AgQgEDgAqAEAAAAAAgQgEHgAcAFAAAAAAgAkEAAAAAP////8AgAkAOgAAAHAAAAAAgQgEEgA4ALAAAAAAgQgINACaAMgAAAAAgQgMEAAyAAABAAAAgQgQFgBaABABAAAAgQgMAgAGACgBAAAAgQgIAgAGADABAAAAgQgECgAYADgBAAAAgAkEAAAAAP////8AgAkAOAAAAEgBAAAAgQgELgB+AIABAAAAgQgEIABUALABAAAAgQgIJgCCANABAAAAgQgIFgAuAPgBAAAAgQgMFAA8ABACAAAAgQgIAgAGACgCAAAAgQgECgAWADACAAAAgAkEAAAAAP////8AgQgEDAAcAEACAAAEgQgAAgAIAFACAAAAgAkAAAAAAP////8AgAkAMAAAAFgCAAAigQgABgAGAIgCAAAAgAgECAAAAJACAAAAgAgECAAAAJgCAAAAgQgECAAQAKACAAAAgAkEAAAAAP////8AgAkAOAAAAKgCAAAAgQgEIABUAOACAAAAgQgIGABQAAADAAAAgQgMDAAYABgDAAAAgQgQFgBeACgDAAAAgQgMAgAMAEADAAAAgQgQJAB+AEgDAAAAgQgMAgAGAHADAAAAgQgIAgAGAHgDAAAAgQgECgAWAIADAAAAgAkEAAAAAP////8AgAkAJAAAAJADAAAAgQgEDAAmALgDAAAAgQgECgAmAMgDAAAEgQgAAgAIANgDAAAAgAkAAAAAAP//////////AQHoAwAAXQD1BKACAACWFGABAAAAAPAAIAB8Ai4ArgJvAGMAdQBdAPUEuAEAAF0A9QTQAQAAXQD1BOgBAABdAPUEAAIAACAA//8hAKgCQkCwAgAAZQC5ABIAv+++3KTArbahXaVpvca/76FeIAD//ygAsgJ5AOMABAAzACAxLiDEWa7mqMy30yBFeGNlbCCkdadAqu2l0aWqptyla6q6reylzba2p8e4/KRKsk2z5gAAAAAAAAACASAAYgIBASAAJgIhAMwCkwAAAAAAAAAgAGICIQAGASAArgIhAEQCIQAGAQYAIABiAiEABgG5AAwApL2moSiko6Vpp1IpBgAEAJwAAAAAACAAYgIhAM4CIADQAgUAnAAgAGICIQAGASAA//8hAKgCQkC2AgEAAABrAP//0AAAAGsA///IAAAAAgEgAGICAQHLAAAAAAAAAOMABAAyACAyLiDFqqj6pdirZcB4pnOu5qS6pHe4Z7/vpm6qusLCuOquxqFBptuwyrl3pf2kxL/vuQABACwAIACuAiEATAK5AAIAoUK5AAEALAAkANICAwARALkAAQAsABEAJwDIAgAAAgEgAGQCAQGsAAAAIAD//yEAqAIhANQCrAABAAwAkgC5AAEALAAgAGQCIAD//yEAqAIlAMACAQARALkAAQAsABEAJwDKAgAArAABACAAyAIgAMoChQCsAAAACgCcAAAAugQgAGQCIAD//yEAqAIsANYCAQAAAAAAawD//9ABAAACASAAZAIBAcsAAAAAAAAAugAgAP//QkC4AgEAAAAAAG8A//+oAQAA4wAAACkAIK3Xpb+qqaFHvca/77zSpqGkVaFBuuu3x6jMt9OkwK22tranx7/ppVgAlgQYAgAAAABdAPUEcAIAAF0A9QSIAgAAuQAAACcA2ALjAAQAMQAguuu3x6i1xP2yTbPmpKSquqnSprO2taXYoUHAy6xkrf6ox7NRqM+lzqrMv++o+qRGAAIBIABkAgEBrAAAACAA//8hAKgCIQDUAqwAAQAMAJIAIABkAiAA//8hAKgCJQDWAgEAugQFAJwAIADYArkAAAAFAJwAAAAAACAAZAIgAP//IQCoAiUAwAIBACcA2AIAAGQA//+4AAAAIADYArkAAgChQhEAIABkAiAA//8hAKgCJQDAAgEAEQAnAPj///+3A7j///8DQJ8C6P///54CAAAAAPQBIAMAAJ4C6P////QBgAQFAJECsP///+0F//8+AL4D6P///8cCwAEAAGcCGAAAAJcC8P////cFEgBEAMcCNgEAAGcCXgAAAJ8CaP////EBgP///58C+P///7cDuP///wNAnwLo////ngIAAAAA9AEgAwAAngLo////9AFwBAgAlgJo////YAS3AvD///++A+j////qBQQAgP///2j////GAroBAABnAgYAAABnAn4AAACXAvD////3BRAAUAFxA1D///+fAmj////xAYD///+fAvj///+3A7j///8DQJ8C6P///54CAAAAAPQBIAMAAJ4C6P////QBcAQIAJYCaP///08BOP///2AEtwLw////vgPo////6gUIAID///9Q////aP///zj///9nAgYAAABnAgYAAABnAhYAAACfAvj///+lBdD///9qAAAAZwImAAAAlwLw////cQO4////GwKeAgAAAACOA2AAAADbBQYAAABnAiYAAACYAgAAAAC/A+j////fAxMAWgQUAPQBIAARAL4D6P///2cCAAAAAPgBAAAAAAAAAAAIAMgAMAIAAEAAAAAIAAAAAAAAAAAAAAAAAAAAGgAAAAAAAAAAAAEAAAAAAAAAAADw////AQAbAjIAAAAAAAAAAAAFAAAAAAAAAAAA6P///wMAgP///wIAaP///wIAUP///wIAOP///wIAFAAAAAAAABMAAAAAkQIAAAAAAAAAAAIA//////////8iAAAAAAAADgACYQACCAIKAAAAAAAAfxQAAAAAAAATAQBwAMEEAAAAAAAAAAACANEFAAAAAAAAAAACACAAAAAAAAAOAAFaAAIIIAAAAAAAAA4AAVoAAggkAAAAAAAAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAclVAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAGgAAAAAAAAARAAAAAAAAAAAAAgD///////////////8AAAAAkAAAAAgASADhAQAAAAAAAAAAAgAAAANgBAAxA////////////////////////wAAAABxAQAAAAAAAAAAAQAAAAAAHwAeAPEAAAAAAAAAAAABADgAEQQAAAAAAAAAAAIAAQADYAAAOAM4AP////////////////////8AAAAAAAAAAB8AAQAAAAAAAABiAAAAAAAAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEotIABAAQAAAADADCqSgKQBgBIAgJICQDAIhQGSAMAAgBktgMIBAAKABxWQkFQgHJvamVjdAUAGhgAAEACCgFfAFYAQgBBAF8AUABSAE8ASgBFAEMAVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGgACAP///////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJEAAADRFgAAAAAAAGQAaQByAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAIA////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALwEAACwEAAAAAAAAXwBfAFMAUgBQAF8AMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAgD///////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACfAAAALBwAAAAAAABfAF8AUwBSAFAAXwAxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAACARoAAAAWAAAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEABAABTAwAAAAAAAAAGgAAA/wMBAENoYW5nZaPHcAAKgAAA/wMBAENvdW50TGFyZ2WRxnAABoAAAP8DAQBDb2x1bW6gaXAABYAAAP8DAQBDZWxscxqNcAADgAAA/wMBAFJvd4nPcAAHBG91dENlbGw4LXAACIAAAP8DAQBfRGVmYXVsdGrCcAAJBHRpdGxlTmFtZUtvcAARBFVwZGF0ZUNhc2NhZGVNb2RleE9wABAER2V0RGlyZWN0aW9uVGV4dDSHcAACBHdzll9wAAEEaWAQcAAHBGxhc3RSb3d3hHAABwRyb2xsRGlywrpwAASAAAD/AwEAUm93c6FVcAAFAENvdW50MHZwAASAAAD/AwEAeGxVcKDncAAKgAAA/wMBAE1lcmdlQ2VsbHPaqXAACARlZGl0Q2VsbBdrcAAIBKR1p0Cq7TExsYhwABsEV29ya3NoZWV0X0JlZm9yZURvdWJsZUNsaWNrZnRwAAYEQ2FuY2Vs8ZhwABMEUG9zaXRpb25BbmRTaG93Rm9ybQ3BcAADhAgA/wMBAFJuZ1XPcAAIBEZvcm1UeXBlFVdwAAkEWm9vbVJhdGlvtDRwAAcETGVmdFBvc6prcAAGBFRvcFBvc8DncAAMgAAA/wMBAEFjdGl2ZVdpbmRvd8MrcAAEgAAA/wMBAFpvb20GgnAAFYAAAP8DAQBQb2ludHNUb1NjcmVlblBpeGVsc1ik33AAFYAAAP8DAQBQb2ludHNUb1NjcmVlblBpeGVsc1mh33AAA4AAAP8DAQBUb3A12nAADQxVc2VyRm9ybV9EYXRlCsBwAA8AU3RhcnRVcFBvc2l0aW9uZ/twAAYETGF1bmNoLgdwAA4MVXNlckZvcm1fU2hlZXSs63AAGQRXb3Jrc2hlZXRfU2VsZWN0aW9uQ2hhbmdl0TRwABGAAAD/AwEAQmVmb3JlRG91YmxlQ2xpY2tC+nAAD4AAAP8DAQBTZWxlY3Rpb25DaGFuZ2XjbnAAFIAAAP8DBABfQl92YXJfVXNlckZvcm1fRGF0ZaiTcAAVgAAA/wMEAF9CX3Zhcl9Vc2VyRm9ybV9TaGVldH2ScAAJBFVzZXJGb3JtMSnWcAAHCE1TRm9ybXNDD3AACARVc2VyRm9ybU4EcAAIBExpc3RCb3gxm+twAAUEYnRuT0tkm3AADgRVc2VyRm9ybV9DbGlja9v4cAAKBFRhcmdldENlbGzZA3AABQBDbGVhcuPNcAAHgAAA/wMBAENhcHRpb24QeHAABoAAAP8DAQBTaGVldHMKG3AAB4AAAP8DAQBBZGRJdGVthyBwAASAAAD/AwEAU2hvdw/1cAARBExpc3RCb3gxX0RibENsaWNryIRwAA2AAAD/AwQAUmV0dXJuQm9vbGVhbullcAAJgAAA/wMBAExpc3RJbmRlePdRcAAEgAAA/wMBAExpc3Qqk3AACwRidG5PS19DbGlja9AicAAIgAAA/wMEAERibENsaWNrq4VwAAWAAAD/AwMAQ2xpY2uK43AADARFeGlzdGluZ1RleHQE0nAACARJdGVtVGV4dMgUcAAKgAAA/wMBAFdvcmtzaGVldHO8+HAAB4AAAP8DAQBWaXNpYmxlttNwAA6AAAD/AwEAeGxTaGVldFZpc2libGWr3nAABwBSZXBsYWNlZg5wAAmAAAD/AwEATGlzdENvdW50NghwAAiAAAD/AwEAU2VsZWN0ZWRZo3AABgRSZXN1bHR1cnAAAv//AQHYAAAA////////////////////////////////kQIKACEA////////////////lwILAAQA////////////////////////DgIBAP//EAIAAP//////////pAIEAP//////////////////////////////////////////IAICAP//IgL/////JAIDAP//JwIAABcA////////KwIBABcALQICABkALwIDABoAMQIEABsAMwIJABwANQIGAB0ANwIHAB4AOQIIAB8AOwIFACAA////////////////BwAkAAAAAQDYAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEA//////8BAAMA/////wsA/////wEAAAAAAAAAAAAAAAAAAAAAAAAAuOQMABgAVABoAGkAcwBXAG8AcgBrAGIAbwBvAGsAFAAxAHcANgBjADcAMAAzAGUANAA1AP//JwIYAFQAaABpAHMAVwBvAHIAawBiAG8AbwBrAP///+YAAAAAAAAAAgAAAPADAAD//wgA5V1cT2iIMQAUADIAOAA2AGMANwAwADMAZQA5AGEA//8rAggA5V1cT2iIMQD//+HKAAAAAAIA+AIAAP////8YAwAA/////xgCAAAAcRkAAP//CADlXVxPaIgyABQAMQBkADYAYwA3ADAAMwBkAGIAOAD//y0CCADlXVxPaIgyAP//fBUAAAAAAAAwAgAAAJUdAAD//wgA5V1cT2iIMwAUdgAAPa0CFgcCcgEUCAYSCQISgJU+cGwmAAwCShI8AgoWAAE5c3RkEG9sZT4CGXMAdAAAZABvAGwAZVAADQBoACVeAAMqAFxHezAwMDIwsDQzMC0ACAQEQwAKAwIOARIwMDQ2fSMAMi4wIzAjQzoAXFdpbmRvd3MAXFN5c3RlbTMEMlwDZTIudGxiACNPTEUgQXV0gG9tYXRpb24AMIMAAYNFT2ZmaWOERYhPAGaAAGkAY4JFGp6AEZSAAYFFMkRGADhEMDRDLTVCAEZBLTEwMUItkEJERTWARUFBgEMaNIAFMohFgJhncmEAbSBGaWxlc1xAQ29tbW9uBAZNAGljcm9zb2Z0ACBTaGFyZWRcAE9GRklDRTE2AFxNU08uRExMBiOHEINNIDE2LjAIIE9igcEgTGliMHJhcnkASwABFgACB4ACTVNGb3JtEHM+AA4BBgBTAAJGAKdyAG0AcwASM4AEAAACpkQ0NQAyRUUxLUUwOCJGATBBLTgABC0wADI2MDhDNEQwCEJCNAlTSU5ETxBXU1xzBVNGTTI2MEwnQh0gwF/MJi8A+jsAIjHAAAIeg2pJcUEEQUhxMDB9IzBCcSNHwAyAAJ41MACogAmKA8AAQRhDOUQxN0EgQUYtQjMAATQyQDEzLTkxNABoNgBFQkJGNDFBMIQxNYg2VXNlckCJAEFOTkl+MS5IAFVOXEFwcERhAHRhXExvY2FsAFxUZW1wXFZChkXAY0I4LmV4ZMhkB1U9ACOAAOEuRQ2PAOAaEIUuAmCMUE0LtAHABA/C0wxEABPCAbjkGcK9VABoaXNXb3JrYkBvb2tHABjACVQVQL9pAG1Xgm9rAGJBwAFvAGsAGs4LMkXaCxzAEgAASEIBMbXC4fAA/R5CAoECLOIQqP/mIiIEK6IAGSJJAKR1p0Cq7TFHBAAIgALlXVxPaNyIMcAPgUxEAzJKAy8NkHEZAAAtDeHKNQ0qMikNMioNMikNMgBJLw2VHS8NfBU1DTNVKQ0zKg0zKQ0zMA0jUiAvDS3uNQ00KQ00VSoNNCkNNDANa/A03qrrNQ05KQ05Kg05KQ2mOT8NIkJoTjUNNikNajYqDTYpDTY/DSINH6plNQ03KQ03Kg03KQ2mNz8NIg0J1TUNOCkNajgqDTgpDTg/DSINr6q0NQ01KQ01Kg01KQ1KNTANSzBCWkUrDQ2XgHWBmiGTXwCZZUdgDIgAAFVAiWUAcqbBoF8ARABhwHZl0AGfLgPBNy8DJwP/N8sRXzGUOF6TCSgQCQAAlUUDYWn2CVNoZWV0R6uSDg8KUxBQZbB3dCAKn18DU0BfA1cDXwqEFF8KFDMGXwoQEgsAAAAAAAAAAAAAAAAAAAAAAAAAAMxhtQAAAwD/BAQAAAkEAAC2AwMAAAAAAAAAAAABAAUAAgAgASoAXABHAHsAMAAwADAAMgAwADQARQBGAC0AMAAwADAAMAAtADAAMAAwADAALQBDADAAMAAwAC0AMAAwADAAMAAwADAAMAAwADAAMAA0ADYAfQAjADQALgAyACMAOQAjAEMAOgBcAFAAcgBvAGcAcgBhAG0AIABGAGkAbABlAHMAXABDAG8AbQBtAG8AbgAgAEYAaQBsAGUAcwBcAE0AaQBjAHIAbwBzAG8AZgB0ACAAUwBoAGEAcgBlAGQAXABWAEIAQQBcAFYAQgBBADcALgAxAFwAVgBCAEUANwAuAEQATABMACMAVgBpAHMAdQBhAGwAIABCAGEAcwBpAGMAIABGAG8AcgAgAEEAcABwAGwAaQBjAGEAdABpAG8AbgBzAAAAAAAAAAAAAAAAABoBKgBcAEcAewAwADAAMAAyADAAOAAxADMALQAwADAAMAAwAC0AMAAwADAAMAAtAEMAMAAwADAALQAwADAAMAAwADAAMAAwADAAMAAwADQANgB9ACMAMQAuADkAIwAwACMAQwA6AFwAUAByAG8AZwByAGEAbQAgAEYAaQBsAGUAcwBcAE0AaQBjAHIAbwBzAG8AZgB0ACAATwBmAGYAaQBjAGUAXAByAG8AbwB0AFwATwBmAGYAaQBjAGUAMQA2AFwARQBYAEMARQBMAC4ARQBYAEUAIwBNAGkAYwByAG8AcwBvAGYAdAAgAEUAeABjAGUAbAAgADEANgAuADAAIABPAGIAagBlAGMAdAAgAEwAaQBiAHIAYQByAHkAAAAAAAAAAAAAAAAAvAAqAFwARwB7ADAAMAAwADIAMAA0ADMAMAAtADAAMAAwADAALQAwADAAMAAwAC0AQwAwADAAMAAtADAAMAAwADAAMAAwADAAMAAwADAANAA2AH0AIwAyAC4AMAAjADAAIwBDADoAXABXAGkAbgBkAG8AdwBzAFwAUwB5AHMAdABlAG0AMwAyAFwAcwB0AGQAbwBsAGUAMgAuAHQAbABiACMATwBMAEUAIABBAHUAdABvAG0AYQB0AGkAbwBuAAAAAAAAAAAAAAAAACgBKgBcAEcAewAyAEQARgA4AEQAMAA0AEMALQA1AEIARgBBAC0AMQAwADEAQgAtAEIARABFADUALQAwADAAQQBBADAAMAA0ADQARABFADUAMgB9ACMAMgAuADgAIwAwACMAQwA6AFwAUAByAG8AZwByAGEAbQAgAEYAaQBsAGUAcwBcAEMAbwBtAG0AbwBuACAARgBpAGwAZQBzAFwATQBpAGMAcgBvAHMAbwBmAHQAIABTAGgAYQByAGUAZABcAE8ARgBGAEkAQwBFADEANgBcAE0AUwBPAC4ARABMAEwAIwBNAGkAYwByAG8AcwBvAGYAdAAgAE8AZgBmAGkAYwBlACAAMQA2AC4AMAAgAE8AYgBqAGUAYwB0ACAATABpAGIAcgBhAHIAeQAAAAAAAAAAAAAAAADeACoAXABHAHsAMABEADQANQAyAEUARQAxAC0ARQAwADgARgAtADEAMAAxAEEALQA4ADUAMgBFAC0AMAAyADYAMAA4AEMANABEADAAQgBCADQAfQAjADIALgAwACMAMAAjAEMAOgBcAFcASQBOAEQATwBXAFMAXABzAHkAcwB0AGUAbQAzADIAXABGAE0AMgAwAC4ARABMAEwAIwBNAGkAYwByAG8AcwBvAGYAdAAgAEYAbwByAG0AcwAgADIALgAwACAATwBiAGoAZQBjAHQAIABMAGkAYgByAGEAcgB5AAAAAAAAAAAAAAABABQBKgBcAEcAewBDADkARAAxADcAQQBBAEYALQBCADMAQQBGAC0ANAAyADEAMwAtADkAMQA0AEIALQBCADYARQBCAEIARgA0ADEAQQAwADEANQB9ACMAMgAuADAAIwAwACMAQwA6AFwAVQBzAGUAcgBzAFwAUwBBAE4ATgBJAH4AMQAuAEgAVQBOAFwAQQBwAHAARABhAHQAYQBcAEwAbwBjAGEAbABcAFQAZQBtAHAAXABWAEIARQBcAE0AUwBGAG8AcgBtAHMALgBlAHgAZAAjAE0AaQBjAHIAbwBzAG8AZgB0ACAARgBvAHIAbQBzACAAMgAuADAAIABPAGIAagBlAGMAdAAgAEwAaQBiAHIAYQByAHkAAAAAAAAAAAAAAAEAAADhLkUNj+AaEIUuAmCMTQu0AAAMAAIAAgACAAIAAgACAAIAAgACAAIAAgQCBAYAEgIAABQCAQAWAgEAGAIAABoCAQAcAgEAIgL///////8AAAAAAAAAAJU+cGwmAAAACgD/////BQAEAP//AgAJAAgABwAGAP//////////////////////////////////AQADAP////8LAP////8BAAAAAAAAAAAAAAAAAAAAAAAAALjkDAAYAFQAaABpAHMAVwBvAHIAawBiAG8AbwBrABQAMQB3ADYAYwA3ADAAMwBlADQANQD//ycCGABUAGgAaQBzAFcAbwByAGsAYgBvAG8AawD////mAAAAAAAAAAIAAADwAwAA//8IAOVdXE9oiDEAFAAyADgANgBjADcAMAAzAGUAOQBhAP//KwIIAOVdXE9oiDEA///hygAAAAACAPgCAAD/////GAMAAP////8YAgAAAHEZAAD//wgA5V1cT2iIMgAUADEAZAA2AGMANwAwADMAZABiADgA//8tAggA5V1cT2iIMgD//3wVAAAAAAAAMAIAAACVHQAA//8IAOVdXE9oiDMAFAAyAFAANgBjADcAMAA0ADAAZAA5AP//LwIIAOVdXE9oiDMA//8t7gAAAAAAAEgCAAAAIyAAAP//CADlXVxPaIg0ABQAMQBmADYAYwA3ADAAMwBkAGIAOAD//zECCADlXVxPaIg0AP//3usAAAAAAABgAgAAAGsDAAD//wgA5V1cT2iIOQAUADEAZwA2AGMANwAwADMAZABiADgA//87AggA5V1cT2iIOQD//2hOAAAAAAAA2AIAAABrAwAA//8IAOVdXE9oiDYAFAAxAGgANgBjADcAMAAzAGQAYgA4AP//NQIIAOVdXE9oiDYA//8fZQAAAAAAAJACAAAAawMAAP//CADlXVxPaIg3ABQAMQBpADYAYwA3ADAAMwBkAGIAOAD//zcCCADlXVxPaIg3AP//CdUAAAAAAACoAgAAAGsDAAD//wgA5V1cT2iIOAAUADEAagA2AGMANwAwADMAZABiADgA//85AggA5V1cT2iIOAD//6+0AAAAAAAAwAIAAABrAwAA//8IAOVdXE9oiDUAFAAxAGsANgBjADcAMAAzAGQAYgA4AP//MwIIAOVdXE9oiDUA//9aRQAAAAAAAHgCAAAASwMAAP//GgBVAHMAZQByAEYAbwByAG0AXwBEAGEAdABlABQAMQB2ADYAYwA3ADAAMwBlADQANQD//5ECGgBVAHMAZQByAEYAbwByAG0AXwBEAGEAdABlAP//OF4AAAAAAQAAAgAA//////gCAAAAyxEAAP//HABVAHMAZQByAEYAbwByAG0AXwBTAGgAZQBlAHQAFAAyADsANgBjADcAMAAzAGUAOQBiAP//lwIcAFUAcwBlAHIARgBvAHIAbQBfAFMAaABlAGUAdAD//zMGAAAAAAEAAAIAAP////8YAwAAAIQUAAD///////8BATgDAAD//////////zACAAD/////////////////////AAIAAP//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////SAIAAP///////////////////////////////////////////////////////////////xgDAAD/////////////////////////////////////////////////////////////////////kAIAAP//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+AIAAP////////////////////////////////////////////////////8YAgAA/////////////////////////////////////9gCAADAAgAAqAIAAP////94AgAA/////////////////////////////////////2ACAAD//////////2ZDerApqAtMqjPNMIarWHv/////AQAAANQZ+VRRt1dNklx8JLjrlOr/////AQAAAJ4Ee98bd+9AhSNAJbeXYX//////AQAAAFQo42t/JQZDoQuqKHW0mE3/////AQAAACUVs1IeDHRDkoMDa7zdLM//////AQAAAAWC4ppEjEREhgkKnsbq2O//////AQAAAMQfTdnRIMlNunQljX1ssAD/////AQAAAHEzox5AGsZFtWFXzh/o2kP/////AQAAAEwAIN62gDBIiWiQF8dPxo7/////AQAAAD918HH6zd1ApX/wWPEz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l18GUgIwBgAAAAAAAAsQAAAATQCTSyq1AwAQAAAA//8AAAAAAQACAP//AAAAAAEAAAALAAAAAAABAAIACwAAAAAAAQAAAAoAAAAAAAEAAgAKAAAAAAABAAAAAAAAAAAAAQACAAAAAAAAAAEAAgABAAAAAAABAAAAAQAAAAAAAQAAAAMAAAAAAAEAAgADAAAAAAABAAUABQAFAAUAAAByVT0FAAAAAAAAgAAAAAAAAABAAAAAAAAAAEAAAAAAAAAABgAAAAAAAH4KAAAAAAAAfgIAAAAAAAB+AgAAAAAAAH4CAAAAAAAAfgIAAAAAAAB+AgAAAAAAAH4CAAAAAAAAfgoAAAAAAAB+AgAAAAAAAH4CAAAAAAAAfgIAAAAAAAB+AgAAAAAAAH4KAAAAAAAAfgoAAAAAAAB+CgAAAAAAAH4CAAAAAAAAfgoAAAAAAAB+AgAAAAAAAH4KAAAAAAAAfgYAAAAAAAB+CgAAAAAAAH5eAAAAAAAAfwAAAAAAAAAAIgAAAAAAAAARAAAAAAAAAAAAAQAQAAAAAAAAAAAAAACxAgAAAAAAAAAAAACKkG9hqIORQ4LkT6oG9duTAQAJBAAABAQAALYDAAAAAAAABQD//////////wwAg4plABEAAAAAAAAAAAAGAIENAAAAAAAAAAAAAP//////////AAD//wAAMQEAAAAAAAAAAAAAg4plABEAAAAAAAAAAAAJAIENAAAAAAAAAAAAAP//////////AwBxDAAAAAAAAAAAAADxDAAAAAAAAAAAAAAxDQAAAAAAAAAAAAD//wAAYQEAAAAAAAAAAAAAAgoAAP///////////////////////////////wAAAACBAQAAAAAAAAAAAACDimUAEQAAAAAAAAAAAAoAgQ0AAAAAAAAAAAAA//////////8DAIFFAAAAAAAAAAAAAMFFAAAAAAAAAAAAAAFGAAAAAAAAAAAAAP//AAChAQAAAAAAAAAAAAACCgAA////////////////////////////////AAAAAMEBAAAAAAAAAAAAAAIKAAD///////////////////////////////8AAAAA4QEAAAAAAAAAAAAAAgoAAP///////////////////////////////wAAAAABAgAAAAAAAAAAAAACCgAA////////////////////////////////AAAAACECAAAAAAAAAAAAAAIKAAD///////////////////////////////8AAAAAQQIAAAAAAAAAAAAAAgoAAP///////////////////////////////wAAAABhAgAAAAAAAAAAAACDgGEAEQAAAAAAAAAAAAQAQSEAAAAAAAAAAAAA//////////8EAPEPAAAAAAAAAAAAAHEgAAAAAAAAAAAAAOEgAAAAAAAAAAAAABEhAAAAAAAAAAAAAP//AADhAgAAAAAAAAAAAACDgGEAEQAAAAAAAAAAAAIAQSEAAAAAAAAAAAAA//////////8CAPEPAAAAAAAAAAAAAOEgAAAAAAAAAAAAAP//AACBOgAAAAAAAAAAAAAFABEEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACBBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABhCQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAIMAAAAAAAAAFRoaXNXb3JrYm9vawIAAAAAAAACBwAAAAAAAACkdadAqu0xAgAAAAAAAAIHAAAAAAAAAKR1p0Cq7TICAAAAAAAAAgcAAAAAAAAApHWnQKrtMwIAAAAAAAACBwAAAAAAAACkdadAqu00AgAAAAAAAAIHAAAAAAAAAKR1p0Cq7TkCAAAAAAAAAgcAAAAAAAAApHWnQKrtNgIAAAAAAAACBwAAAAAAAACkdadAqu03AgAAAAAAAAIHAAAAAAAAAKR1p0Cq7TgCAAAAAAAAAgcAAAAAAAAApHWnQKrtNQQAAAAAAAACCQAAAAAAAABVc2VyRm9ybTEEAAAAAAAAAgoAAAAAAAAAVkJBUHJvamVjdAQAAAAAAAACDQAAAAAAAABVc2VyRm9ybV9EYXRlBAAAAAAAAAPvBAIAAAAAAMAAAAAAAABGEgAAAAAAAAJCAAAAAAAAAEM6XFByb2dyYW0gRmlsZXNcQ29tbW9uIEZpbGVzXE1pY3Jvc29mdCBTaGFyZWRcVkJBXFZCQTcuMVxWQkU3LkRMTAQAAAAAAAACAwAAAAAAAABWQkEQAAAAAAAAChEDAAAAAAAAAAAAAP//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ZW50PaR1p0Cq7TEvJkgwMDAwMDAwMA0KRG9jdW1lbnQ9pHWnQKrtMi8mSDAwMDAwMDAwDQpEb2N1bWVudD2kdadAqu0zLyZIMDAwMDAwMDANCkRvY3VtZW50PaR1p0Cq7TQvJkgwMDAwMDAwMA0KRG9jdW1lbnQ9pHWnQKrtNi8mSDAwMDAwMDAwDQpEb2N1bWVudD2kdadAqu03LyZIMDAwMDAwMDANCkRvY3VtZW50PaR1p0Cq7TgvJkgwMDAwMDAwMA0KRG9jdW1lbnQ9pHWnQKrtOS8mSDAwMDAwMDAwDQpEb2N1bWVudD2kdadAqu01LyZIMDAwMDAwMDANClBhY2thZ2U9e0FDOUYyRjkwLUU4NzctMTFDRS05RjY4LTAwQUEwMDU3NEE0Rn0NCkJhc2VDbGFzcz1Vc2VyRm9ybV9EYXRlDQpCYXNlQ2xhc3M9VXNlckZvcm1fU2hlZXQNCk5hbWU9IlZCQVByb2plY3QiDQpIZWxwQ29udGV4dElEPSIwIg0KVmVyc2lvbkNvbXBhdGlibGUzMj0iMzkzMjIyMDAwIg0KQ01HPSI2NTY3ODMzOTgzQTk4N0E5ODdBOTg3QTk4NyINCkRQQj0iRDlEQjNGQzA0MEMwNDBDMCINCkdDPSI0RDRGQUI0MTZCQjQ2Q0I0NkM0QiINCg0KW0hvc3QgRXh0ZW5kZXIgSW5mb10NCiZIMDAwMDAwMDE9ezM4MzJENjQwLUNGOTAtMTFDRi04RTQzLTAwQTBDOTExMDA1QX07VkJFOyZIMDAwMDAwMDANCg0KW1dvcmtzcGFjZV0NClRoaXNXb3JrYm9vaz0wLCAwLCAwLCAwLCBDDQqkdadAqu0xPTEzNSwgOCwgMTM4OCwgODA2LCBDDQqkdadAqu0yPTQyLCAxNjIsIDEyOTUsIDgwNCwgDQqkdadAqu0zPTkwLCA3NiwgMTM0MywgNzE4LCANCqR1p0Cq7TQ9MCwgMCwgMCwgMCwgQw0KpHWnQKrtNj0wLCAwLCAwLCAwLCBDDQqkdadAqu03PTAsIDAsIDAsIDAsIEMNCqR1p0Cq7Tg9MCwgMCwgMCwgMCwgQw0KpHWnQKrtOT0wLCAwLCAwLCAwLCBDDQqkdadAqu01PTAsIDAsIDAsIDAsIEMNClVzZXJGb3JtX0RhdGU9LTEsIDU1LCAxMjUyLCA2OTcsIEMsIDIxNCwgODgsIDE0NjcsIDczMCwgQw0KVXNlckZvcm1fU2hlZXQ9MTUsIDc2LCAxMjY4LCA3MTgsIEMsIDY2LCAyMiwgMTMxOSwgNjY0LCBDDQoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";   // 公司 vbaProject.bin(92,160 bytes;來源=更正版範本)
  const _CP_FPB_XML = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<FeaturePropertyBags xmlns=\"http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag\"><bag type=\"Checkbox\"/><bag type=\"XFControls\"><bagId k=\"CellControl\">0</bagId></bag><bag type=\"XFComplement\"><bagId k=\"XFControls\">1</bagId></bag><bag type=\"XFComplements\" extRef=\"XFComplementsMapperExtRef\"><a k=\"MappedFeaturePropertyBags\"><bagId>2</bagId></a></bag></FeaturePropertyBags>";     // featurePropertyBag.xml(M365 核取方塊特性包)
  // 分頁 codeName 對應(VBA 以 codeName 綁定分頁;缺頁不注入,新頁由 Excel 開檔時自配)
  const _CP_CODENAME = {
    '修訂紀錄': '工作表1', '一般遊戲': '工作表2', 'FREE GAME': '工作表3',
    '賠率表、連線方式': '工作表4', '公式(不可刪)': '工作表5', '說明文件': '工作表6',
    '演繹流程': '工作表7', '節奏表': '工作表8', '體感': '工作表9',
  };
  // 建置期登記的核取方塊格(builder 填、xlsm 手術消費)
  let _cpPendingCheckbox = [];

  // 用語消毒:數字相鄰的 x → ×;蒐集/搜集 → 收集;金化牌 → 金色圖示
  function _cpTerm(s) {
    if (s == null) return '';
    let t = String(s);
    t = t.replace(/([0-9)）】])\s*[xX](?=\d)/g, '$1×');
    t = t.replace(/(^|[\s（(：:、→＝=+])[xX](?=\d)/g, '$1×');
    t = t.replace(/蒐集|搜集/g, '收集');
    t = t.replace(/金化牌/g, '金色圖示');
    return t;
  }
  // 特殊圖示括號式:名稱尾端的角色詞(Wild/Scatter/…)剝除後補 (Role)
  const _CP_ROLE_CAP = { WILD: 'Wild', SCATTER: 'Scatter', BONUS: 'Bonus', FREE: 'Free', COIN: 'Coin', SPECIAL: 'Special' };
  function _cpSpecBase(s) {
    const raw = (s && (s.name || _symId(s))) || '';
    return raw.replace(/[\s　]*[（(]?\s*(wild|scatter|bonus|free|coin|special|jackpot)\s*[)）]?\s*$/i, '').trim() || raw;
  }
  function _cpSpecName(s) {
    const role = _CP_ROLE_CAP[_symRole(s) || 'SPECIAL'] || 'Special';
    return `${_cpSpecBase(s)}(${role})`;
  }
  function _cpSpecNameBr(s) {
    const role = _CP_ROLE_CAP[_symRole(s) || 'SPECIAL'] || 'Special';
    return `${_cpSpecBase(s)}\n(${role})`;
  }
  // FG 範疇語句偵測(屬 FREE GAME 模式的敘述,不落一般遊戲頁)
  function _cpFgScope(t) {
    return /(FG|FREE\s*GAME|免費遊戲|FREE\s*SPINS?)\s*[內中]/i.test(t) || /^FG\s*[:：]/.test(String(t).trim());
  }
  // 拆句:依 。／；／換行 切成一句一列(保留句號)
  function _cpSentences(text) {
    const out = [];
    String(text == null ? '' : text).split(/\n+/).forEach(seg => {
      const parts = seg.split(/(?<=[。；;])/);
      parts.forEach(p => { const t = p.trim(); if (t) out.push(t); });
    });
    return out;
  }
  // 賠付方式下拉對應(30 確認:LINE=連線 Line / WAYS=百搭 Ways / megaways=Megaways /
  //   SCATTER=圖示數量 Grid / CLUSTER=圖示相鄰 Cluster)
  function _cpPayDD(payType, megaways) {
    if (megaways) return 'Megaways';
    const t = String(payType || '').toUpperCase();
    return t === 'LINE' ? '連線 Line' : t === 'WAYS' ? '百搭 Ways'
         : t === 'CLUSTER' ? '圖示相鄰 Cluster' : t === 'SCATTER' ? '圖示數量 Grid' : '百搭 Ways';
  }
  const _CP_SCROLL_DESC = {
    '↓': '上往下滾動', '↑': '下往上滾動', '←': '右往左滾動', '→': '左往右滾動',
    '單格↓': '單格上往下滾動', '單格↑': '單格下往上滾動', '單格←': '單格右往左滾動', '單格→': '單格左往右滾動',
  };
  // 滾動下拉推導:cp_* 未填時自 scroll 自由文字判別;無匹配 → 特殊滾動方式
  function _cpScrollPick(pick, freeText) {
    if (pick) return pick;
    const t = String(freeText || '');
    const single = /單格/.test(t);
    let dir = '';
    if (/↓|上往下|直落/.test(t)) dir = '↓';
    else if (/↑|下往上/.test(t)) dir = '↑';
    else if (/←|右往左|由右至左/.test(t)) dir = '←';
    else if (/→|左往右|由左至右/.test(t)) dir = '→';
    if (!dir) return '特殊滾動方式';
    return single ? `單格${dir}` : dir;
  }
  // 補盤下拉推導:無消除/單次滾停 → 無;向下補滿/遞補 → 滾動方向遞補;原地 → 原地補
  function _cpRefillPick(pick, freeText) {
    if (pick) return pick;
    const t = String(freeText || '').trim();
    if (!t || t === '無' || /無消除|單次滾停|不補盤/.test(t)) return '無';
    if (/原地/.test(t)) return '原地補';
    if (/向下補滿|上方圖示|遞補|補滿/.test(t)) return '滾動方向遞補';
    return '特殊補盤';
  }
  function _cpB64ToU8(b64) {
    if (typeof atob === 'function') {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));   // headless(Node)
  }

  // ─────────────────────────────────────────────────────────────
  //  v8.33:xlsx → xlsm 手術(公司格式企劃書)
  //  1. [Content_Types]:workbook → macroEnabled;加 bin Default 與
  //     featurePropertyBag Override
  //  2. 注入 xl/vbaProject.bin(內嵌 base64)與 featurePropertyBag.xml
  //  3. workbook.xml:workbookPr codeName="ThisWorkbook";rels 加兩筆 Relationship
  //  4. 各分頁 sheetPr codeName 注入(VBA 綁定;_CP_CODENAME)
  //  5. 核取方塊:_cpPendingCheckbox 登記格 → 複製該格 xf、附掛 xfpb ext、改指新 xf
  //  6. 修訂紀錄 x14 跨表驗證(時間下拉 ← '公式(不可刪)'!$B$2:$B$11,sqref B3:B33)
  // ─────────────────────────────────────────────────────────────
  function _xlsxToXlsmBuffer(xlsxArrayBuffer) {
    const ff = (typeof window !== 'undefined' && window.fflate) || (typeof fflate !== 'undefined' ? fflate : null);
    if (!ff) throw new Error('fflate 未載入,無法產生 .xlsm(請重新整理頁面/檢查網路後再匯出)');
    const files = ff.unzipSync(new Uint8Array(xlsxArrayBuffer));
    const ctPath = '[Content_Types].xml';
    if (!files[ctPath]) throw new Error('xlsx 內容異常([Content_Types] 缺失),無法轉 .xlsm');

    // 1) Content Types
    let ct = ff.strFromU8(files[ctPath]);
    ct = ct.replace(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
      'application/vnd.ms-excel.sheet.macroEnabled.main+xml'
    );
    if (!/Extension="bin"/.test(ct)) {
      ct = ct.replace('<Default Extension="rels"',
        '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/><Default Extension="rels"');
    }
    if (!/featurePropertyBag/.test(ct)) {
      ct = ct.replace('</Types>',
        '<Override PartName="/xl/featurePropertyBag/featurePropertyBag.xml" ContentType="application/vnd.ms-excel.featurepropertybag+xml"/></Types>');
    }
    files[ctPath] = ff.strToU8(ct);

    // 2) VBA + featurePropertyBag
    files['xl/vbaProject.bin'] = _cpB64ToU8(_CP_VBA_B64);
    files['xl/featurePropertyBag/featurePropertyBag.xml'] = ff.strToU8(_CP_FPB_XML);

    // 3) workbook.xml + rels
    let wbXml = ff.strFromU8(files['xl/workbook.xml']);
    if (/<workbookPr\b/.test(wbXml)) {
      if (!/codeName=/.test(wbXml)) wbXml = wbXml.replace(/<workbookPr\b/, '<workbookPr codeName="ThisWorkbook"');
    } else if (/<bookViews>/.test(wbXml)) {
      wbXml = wbXml.replace('<bookViews>', '<workbookPr codeName="ThisWorkbook"/><bookViews>');
    } else {
      wbXml = wbXml.replace(/(<workbook[^>]*>)/, '$1<workbookPr codeName="ThisWorkbook"/>');
    }
    files['xl/workbook.xml'] = ff.strToU8(wbXml);

    const relPath = 'xl/_rels/workbook.xml.rels';
    let rels = ff.strFromU8(files[relPath]);
    let maxRid = 0;
    rels.replace(/Id="rId(\d+)"/g, (m, n) => { maxRid = Math.max(maxRid, Number(n)); return m; });
    const addRels = [];
    if (!/vbaProject/.test(rels)) addRels.push(`<Relationship Id="rId${++maxRid}" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/>`);
    if (!/FeaturePropertyBag/.test(rels)) addRels.push(`<Relationship Id="rId${++maxRid}" Type="http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag" Target="featurePropertyBag/featurePropertyBag.xml"/>`);
    if (addRels.length) rels = rels.replace('</Relationships>', addRels.join('') + '</Relationships>');
    files[relPath] = ff.strToU8(rels);

    // 分頁名 → sheetN.xml 檔案對應
    const nameToFile = {};
    const sheetRe = /<sheet\b[^>]*?name="([^"]+)"[^>]*?r:id="(rId\d+)"/g;
    const relMap = {};
    rels.replace(/<Relationship Id="(rId\d+)"[^>]*Target="([^"]+)"/g, (m, id, tg) => { relMap[id] = tg; return m; });
    let sm;
    while ((sm = sheetRe.exec(wbXml))) {
      const tgt = relMap[sm[2]];
      if (tgt && /worksheets\//.test(tgt)) nameToFile[sm[1]] = 'xl/' + tgt.replace(/^\//, '');
    }

    // 4) codeName 注入
    Object.keys(_CP_CODENAME).forEach(nm => {
      const f = nameToFile[nm];
      if (!f || !files[f]) return;
      let x = ff.strFromU8(files[f]);
      const cn = _CP_CODENAME[nm];
      if (/<sheetPr\b[^>]*codeName=/.test(x)) {
        x = x.replace(/(<sheetPr\b[^>]*codeName=")[^"]*(")/, `$1${cn}$2`);
      } else if (/<sheetPr\b/.test(x)) {
        x = x.replace(/<sheetPr\b/, `<sheetPr codeName="${cn}"`);
      } else {
        x = x.replace(/(<worksheet[^>]*>)/, `$1<sheetPr codeName="${cn}"/>`);
      }
      files[f] = ff.strToU8(x);
    });

    // 5) 核取方塊(xf 複製 + xfpb ext)
    if (_cpPendingCheckbox.length && files['xl/styles.xml']) {
      let styles = ff.strFromU8(files['xl/styles.xml']);
      const cxStart = styles.indexOf('<cellXfs');
      const cxEnd = styles.indexOf('</cellXfs>');
      if (cxStart >= 0 && cxEnd > cxStart) {
        let head = styles.slice(0, cxStart);
        let block = styles.slice(cxStart, cxEnd);
        let tail = styles.slice(cxEnd);
        const xfRe = /<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g;
        const xfs = block.match(xfRe) || [];
        const EXT = '<extLst><ext uri="{C7286773-470A-42A8-94C5-96B5CB345126}" xmlns:xfpb="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag"><xfpb:xfComplement i="0"/></ext></extLst>';
        const cloneCache = {};   // 原 xf index → 新 xf index
        const appended = [];
        const bySheet = {};
        _cpPendingCheckbox.forEach(cb => { (bySheet[cb.sheet] = bySheet[cb.sheet] || []).push(cb.addr); });
        Object.keys(bySheet).forEach(nm => {
          const f = nameToFile[nm];
          if (!f || !files[f]) return;
          let x = ff.strFromU8(files[f]);
          bySheet[nm].forEach(addr => {
            const cRe = new RegExp(`(<c r="${addr}"[^>]*\\bs=")(\\d+)(")`);
            const cm = x.match(cRe);
            if (!cm) return;
            const oldIdx = Number(cm[2]);
            if (cloneCache[oldIdx] == null) {
              let src = xfs[oldIdx] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
              let clone;
              if (/\/>$/.test(src)) clone = src.replace(/\/>$/, `>${EXT}</xf>`);
              else clone = src.replace(/<\/xf>$/, `${EXT}</xf>`);
              appended.push(clone);
              cloneCache[oldIdx] = xfs.length + appended.length - 1;
            }
            x = x.replace(cRe, `$1${cloneCache[oldIdx]}$3`);
          });
          files[f] = ff.strToU8(x);
        });
        if (appended.length) {
          block = block + appended.join('');
          block = block.replace(/(<cellXfs[^>]*count=")(\d+)(")/, (m, a, n, b) => a + (Number(n) + appended.length) + b);
          styles = head + block + tail;
          files['xl/styles.xml'] = ff.strToU8(styles);
        }
      }
    }

    // 6) 修訂紀錄 x14 時間下拉(跨表引用 → extLst)
    const revFile = nameToFile['修訂紀錄'];
    if (revFile && files[revFile]) {
      let x = ff.strFromU8(files[revFile]);
      if (!/x14:dataValidations/.test(x)) {
        const X14 = '<ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:dataValidations count="1" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"><x14:formula1><xm:f>\'公式(不可刪)\'!$B$2:$B$11</xm:f></x14:formula1><xm:sqref>B3:B33</xm:sqref></x14:dataValidation></x14:dataValidations></ext>';
        if (/<extLst>[\s\S]*<\/extLst>\s*<\/worksheet>/.test(x)) {
          x = x.replace(/<\/extLst>(\s*<\/worksheet>)/, X14 + '</extLst>$1');
        } else {
          x = x.replace('</worksheet>', `<extLst>${X14}</extLst></worksheet>`);
        }
        files[revFile] = ff.strToU8(x);
      }
    }

    return ff.zipSync(files, { level: 6 }).buffer;
  }

  async function buildCompanyXlsxBuffer(metaIn) {
    if (typeof window.ExcelJS === 'undefined') throw new Error('ExcelJS 未載入');
    const cfg  = collectConfig();
    const meta = mergeMeta(metaIn || loadMeta(), cfg);
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'SlotPlanner Pro';
    wb.created = new Date();
    wb.calcProperties = wb.calcProperties || {};
    wb.calcProperties.fullCalcOnLoad = true;   // 公式(不可刪) 開檔重算
    _cpPendingCheckbox = [];                   // 本次建置的核取方塊登記

    // ── 色票(對齊更正版) ──
    const NG_C = '2F5597';    // 一般遊戲標籤
    const FG_C = '1F3864';    // FREE GAME 標籤
    const BN_C = '1F4E79';    // BONUS 標籤
    const WH_C = '2E75B6';    // 輪盤標籤
    const TB_C = '333F50';    // 賠率表區段帶
    const TH_C = 'D6DCE4';    // 表頭列
    const TH_FG = '44546A';   // 表頭字色
    const LB_C = 'BDD7EE';    // 淺藍表頭(BONUS/輪盤獎項表)
    const ACC  = '4472C4';    // 特殊圖示名(直向標籤)
    const BLU  = '0000FF';    // 「N個」藍字
    const DD_BG = 'DCE6F2';   // 下拉/輸入格(淡藍;theme4 tint 0.8)
    const PK_BG = 'F2DCDB';   // 配對描述格(粉紅;theme5 tint 0.8)
    const VAL_FG = '2B2A27';  // 內文字色
    const CFONT = '微軟正黑體';
    const WIDE = 15;          // 內容尾欄(O)

    // ── 版式小工具(全部落 微軟正黑體) ──
    function cc(ws, r, c, val, o) {
      const cell = _cell(ws, r, c, val, Object.assign({ fg: VAL_FG, size: 12 }, o || {}));
      cell.font = Object.assign({}, cell.font, { name: CFONT });
      return cell;
    }
    function label(ws, R0, c0, c1, text, color, R1) {
      R1 = R1 || R0;
      if (R1 > R0 || c1 > c0) ws.mergeCells(R0, c0, R1, c1);
      cc(ws, R0, c0, text, { bold: true, bg: color, fg: 'FFFFFF', h: 'center', size: 14 });
    }
    function value(ws, R, c0, c1, v, o) {
      o = o || {};
      if (c1 > c0) ws.mergeCells(R, c0, R, c1);
      return cc(ws, R, c0, v == null ? '' : v, { h: o.h || 'left', size: o.size || 12, bold: !!o.bold, fg: o.fg, bg: o.bg });
    }
    // 標籤(B:C) + 內容(D:O 每句一列;標籤直向合併)
    function descRows(ws, R, lab, vals, color, o) {
      o = o || {};
      const arr = (Array.isArray(vals) ? vals : [vals]).map(v => _cpTerm(v));
      const rows = Math.max(1, arr.length);
      label(ws, R, 2, 3, lab, color, R + rows - 1);
      for (let i = 0; i < rows; i++) {
        value(ws, R + i, 4, WIDE, arr[i] == null ? '' : arr[i]);
        ws.getRow(R + i).height = o.h || 28.5;
      }
      return R + rows;
    }
    // 下拉列:標籤(B:C) + 下拉(D:F 淡藍) + 描述(G:O 粉紅)
    function ddRow(ws, R, lab, pick, desc, color, o) {
      o = o || {};
      label(ws, R, 2, 3, lab, color);
      value(ws, R, 4, 6, pick, { h: 'center', bg: DD_BG });
      value(ws, R, 7, WIDE, _cpTerm(desc), { bg: PK_BG });
      ws.getRow(R).height = o.h || 25.5;
      return R + 1;
    }
    function addDV(ws, ref, listStr) {
      try { ws.dataValidations.add(ref, { type: 'list', allowBlank: true, formulae: [`"${listStr}"`] }); } catch (e) { /* DV 失敗不阻斷匯出 */ }
    }
    const CP_SCROLL_LIST = '↑,↓,←,→,單格↑,單格↓,單格←,單格→,特殊滾動方式';
    const CP_REFILL_LIST = '無,滾動方向遞補,原地補,特殊補盤';
    const CP_PAY_LIST = '連線 Line,百搭 Ways,Megaways,圖示數量 Grid,圖示相鄰 Cluster';

    // 敘述頁欄寬(對齊更正版一般遊戲/FREE GAME)
    function descColsNG(ws) {
      ws.columns = [{ width: 3.4 }, { width: 10.7 }, { width: 8.43 }, { width: 6.9 }, { width: 3.6 },
                    { width: 6.9 }, { width: 11 }, { width: 8.43 }, { width: 8.43 }, { width: 8.43 },
                    { width: 8.43 }, { width: 8.43 }, { width: 8.43 }, { width: 8.43 }, { width: 8.43 }];
    }
    function descColsFG(ws) {
      ws.columns = [{ width: 1.1 }, { width: 6.9 }, { width: 8.9 }, { width: 7 }, { width: 8.43 },
                    { width: 8.43 }, { width: 8.9 }, { width: 8.4 }, { width: 8.43 }, { width: 8.43 },
                    { width: 8.43 }, { width: 8.43 }, { width: 8.43 }, { width: 8.43 }, { width: 8.43 }];
    }
    // 盤面(H×W)列:D=高 E=× F=寬 G:O=各輪高度說明(不均勻時 D/F 填 -)
    function boardRow(ws, R, color) {
      const hs = (Array.isArray(cfg.layout) ? cfg.layout : [])
        .slice().sort((a, b) => (a.reel_id || 0) - (b.reel_id || 0))
        .map(l => Number(l.max_rows) || 0).filter(n => n > 0);
      const uniform = hs.length && hs.every(h => h === hs[0]);
      label(ws, R, 2, 3, '盤面(H×W)', color);
      cc(ws, R, 4, uniform ? hs[0] : '-', { h: 'center' });
      cc(ws, R, 5, '×', { h: 'center' });
      cc(ws, R, 6, uniform ? hs.length : '-', { h: 'center' });
      value(ws, R, 7, WIDE, uniform ? '' : (cfg.derived.gridStr || hs.join('-')));
      ws.getRow(R).height = 28.5;
      return R + 1;
    }
    // 連線方式(兩列):下拉+描述 / 線數+共有N種
    function payRows(ws, R, payType, megaways, color) {
      label(ws, R, 2, 3, '連線方式', color, R + 1);
      const pick = _cpPayDD(payType, megaways);
      value(ws, R, 4, 6, pick, { h: 'center', bg: DD_BG });
      addDV(ws, `D${R}:D${R}`, CP_PAY_LIST);
      const mdesc = meta.payline_method || cfg.derived.payMethodDesc || cfg.derived.payTypeLabel || '';
      value(ws, R, 7, WIDE, _cpTerm(mdesc), { bg: PK_BG });
      ws.getRow(R).height = 34.5;
      // 線數
      cc(ws, R + 1, 4, '線數', { h: 'center' });
      ws.mergeCells(R + 1, 4, R + 1, 6);
      const _plCount = Array.isArray(cfg.paylines) ? cfg.paylines.length : 0;
      const _isLine = String(payType || '').toUpperCase() === 'LINE';
      const nWays = cfg.derived.isScatterLike ? '' :
        _isLine ? (_plCount ? `共有${_plCount}種連線方式。` : '')
                : (cfg.derived.waysCount ? `共有${cfg.derived.waysCount}種連線方式。` : '');
      value(ws, R + 1, 7, WIDE, nWays);
      ws.getRow(R + 1).height = 25.5;
      return R + 2;
    }
    // 滾動 / 補盤 下拉列
    function scrollRow(ws, R, cpPick, freeText, color) {
      const pick = _cpScrollPick(cpPick, freeText);
      const desc = pick === '特殊滾動方式' ? (String(freeText || '').trim() || pick)
                                          : (_CP_SCROLL_DESC[pick] || pick);
      R = ddRow(ws, R, '滾動方式', pick, desc, color);
      addDV(ws, `D${R - 1}:D${R - 1}`, CP_SCROLL_LIST);
      return R;
    }
    function refillRow(ws, R, cpPick, freeText, color) {
      const pick = _cpRefillPick(cpPick, freeText);
      const desc = (freeText && String(freeText).trim()) ? freeText : pick;
      R = ddRow(ws, R, '補盤方式', pick, pick === '無' && !String(freeText || '').trim() ? '無' : desc, color, { h: 28.5 });
      addDV(ws, `D${R - 1}:D${R - 1}`, CP_REFILL_LIST);
      return R;
    }
    // 圖示規劃列:標籤 + N個(D:F 藍粗) + 清單(G:O)
    function symPlanRow(ws, R, lab, names, color, hh) {
      label(ws, R, 2, 3, lab, color);
      ws.mergeCells(R, 4, R, 6);
      cc(ws, R, 4, `${names.length}個`, { bold: true, fg: BLU, h: 'center' });
      value(ws, R, 7, WIDE, _cpTerm(names.join('、')));
      ws.getRow(R).height = hh || 28.5;
      return R + 1;
    }
    // 每模式演出(跑馬燈/事件/快停;快停一律輸出,格式=標籤+D:O)
    function modeExtras(ws, R, modeName, color) {
      const mq = (meta.mode_marquee && meta.mode_marquee[modeName]) || '';
      const ev = (meta.mode_event && meta.mode_event[modeName]) || '';
      const qs = (meta.mode_quickstop && meta.mode_quickstop[modeName]) || '';
      if (mq) R = descRows(ws, R, '跑馬燈文字', mq.split('\n'), color);
      if (ev) R = descRows(ws, R, '事件規劃', ev.split('\n'), color);
      R = descRows(ws, R, '快停/跳過機制', qs, color, { h: 38.25 });
      return R;
    }
    // 產牌限制 mini 表(標籤+表頭 D..G+備註 H:O)
    function genLimitBlock(ws, R, limits, color) {
      if (!limits.length) return R;
      const symName = {};
      cfg.symbols.forEach(s => { symName[_symId(s)] = _isSpecial(s) ? _cpSpecName(s) : (s.name || _symId(s)); });
      label(ws, R, 2, 3, '產牌限制', color, R + limits.length);
      ['符號', '區域', '下限', '上限'].forEach((h, i) => cc(ws, R, 4 + i, h, { bold: true, bg: TH_C, fg: TH_FG, h: 'center' }));
      ws.mergeCells(R, 8, R, WIDE);
      cc(ws, R, 8, '備註', { bold: true, bg: TH_C, fg: TH_FG, h: 'center' });
      ws.getRow(R).height = 24; R++;
      limits.forEach(gl => {
        cc(ws, R, 4, symName[gl.symbol_id] || gl.symbol_id || '', { h: 'center' });
        cc(ws, R, 5, gl.zone || 'MAIN', { h: 'center' });
        cc(ws, R, 6, gl.min_count != null ? gl.min_count : '', { h: 'center' });
        cc(ws, R, 7, gl.max_count != null ? gl.max_count : '', { h: 'center' });
        ws.mergeCells(R, 8, R, WIDE);
        cc(ws, R, 8, _cpTerm(gl.notes || ''));
        ws.getRow(R).height = 24; R++;
      });
      return R;
    }
    function limitsForModes(modeNames) {
      const gls = Array.isArray(cfg.genLimits) ? cfg.genLimits : [];
      return gls.filter(gl => {
        const sc = String(gl.mode_scope || 'ALL').trim();
        if (!sc || sc.toUpperCase() === 'ALL') return true;
        const parts = sc.split(',').map(x => x.trim());
        return modeNames.some(mn => parts.includes(mn));
      });
    }

    // ── 共用推導 ──
    const startMode  = cfg.derived.startingMode;
    const spinModes  = cfg.modes.filter(m => !_isModeBonus(m));
    const bonusModes = cfg.modes.filter(m => _isModeBonus(m));
    const fgModes    = spinModes.filter(m => m.mode && m.mode !== startMode);
    const wheelModes = bonusModes.filter(m => String(m.mode_kind).toUpperCase() === 'WHEEL');
    const normNames  = cfg.normalSyms.map(s => s.name || _symId(s));
    const specNamesP = cfg.specialSyms.map(s => _cpSpecName(s));   // 括號式(全檔統一)
    const megaways   = !!(cfg.global && cfg.global.megaways);

    // 玩法說明(NG)= NG 模式描述拆句;FG 範疇語句改道 FREE GAME 遊戲說明
    const fgExtraLines = [];
    function routeSentences(text) {
      const keep = [];
      _cpSentences(text).forEach(t => { (_cpFgScope(t) ? fgExtraLines : keep).push(t); });
      return keep;
    }
    const startMd = cfg.modes.find(m => m.mode === startMode);
    const ngPlayLines = routeSentences((meta.mode_desc && meta.mode_desc[startMode]) || (startMd && startMd.notes) || '');

    // 內容分頁清單(修訂紀錄戳記用;不含公式/修訂紀錄)
    const contentSheets = ['一般遊戲'];
    if (fgModes.length) contentSheets.push('FREE GAME');
    if (bonusModes.length) contentSheets.push('BONUS GAME');
    contentSheets.push('賠率表、連線方式');
    if (wheelModes.length) contentSheets.push('輪盤遊戲');
    contentSheets.push('說明文件', '演繹流程', '節奏表', '體感');

    // ══════════ 1. 公式(不可刪):時間下拉來源 ══════════
    {
      const ws = wb.addWorksheet('公式(不可刪)');
      ws.getCell('B1').value = '時間';
      const b2 = ws.getCell('B2'); b2.value = { formula: 'TODAY()' }; b2.numFmt = 'mm-dd-yy';
      for (let r = 3; r <= 11; r++) {
        const c = ws.getCell(`B${r}`); c.value = { formula: `B${r - 1}+1` }; c.numFmt = 'mm-dd-yy';
      }
    }

    // ══════════ 2. 修訂紀錄(Excel 表格 + 下拉驗證) ══════════
    {
      const ws = wb.addWorksheet('修訂紀錄');
      ws.columns = [{ width: 2.7 }, { width: 40.7 }, { width: 25 }, { width: 20.1 }, { width: 53.9 }, { width: 46.1 }, { width: 55.4 }];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const blank = ['', '', '', '', '', ''];
      const rows = [[today, 'SlotPlanner', '新增', contentSheets.join('、'), '由 SlotPlanner Pro 匯出企劃書', '']];
      for (let i = 0; i < 30; i++) rows.push(blank.slice());
      ws.addTable({
        name: '表格1', ref: 'B2', headerRow: true,
        style: { theme: 'TableStyleMedium7', showRowStripes: true },
        columns: [
          { name: '時間_x000A_(下拉式選單)', filterButton: true },
          { name: '修訂人', filterButton: true },
          { name: '修訂類型_x000A_(下拉式選單)', filterButton: true },
          { name: '分頁_x000A_(下拉式選單)', filterButton: true },
          { name: '說明', filterButton: true },
          { name: '備註', filterButton: true },
        ],
        rows,
      });
      // 表頭 / 資料格外觀
      for (let c = 2; c <= 7; c++) {
        const hc = ws.getCell(2, c);
        hc.font = { name: CFONT, size: 12, bold: true, color: { argb: 'FF1F3864' } };
        hc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
      for (let r = 3; r <= 33; r++) for (let c = 2; c <= 7; c++) {
        const dc = ws.getCell(r, c);
        dc.font = { name: CFONT, size: 12, color: { argb: 'FF2B2A27' } };
        dc.alignment = { horizontal: (c >= 6 || c === 5) ? 'left' : 'center', vertical: 'middle', wrapText: true };
      }
      ws.getCell('B3').numFmt = '[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy';
      ws.getRow(2).height = 33; ws.getRow(3).height = 31.5;
      addDV(ws, 'D3:D33', '新增,調整');
      addDV(ws, 'E3:E33', '公式(不可刪),一般遊戲,FREE GAME,BONUS GAME,連線方式,賠率表,輪盤遊戲,說明文件,演繹流程,節奏表,體感');
      // 時間欄 B3:B33 之跨表下拉由 _xlsxToXlsmBuffer 以 x14 注入
    }

    // ══════════ 3. 一般遊戲(標籤 2F5597,自第17列起) ══════════
    {
      const ws = wb.addWorksheet('一般遊戲');
      descColsNG(ws);
      let R = 17;
      // 主題選用 | 風格選用
      label(ws, R, 2, 3, '主題選用', NG_C);
      value(ws, R, 4, 8, meta.theme_pick || meta.game_name || cfg.global.game_name || '');
      label(ws, R, 9, 10, '風格選用', NG_C);
      value(ws, R, 11, WIDE, meta.style_pick || '');
      ws.getRow(R).height = 28.5; R++;
      R = boardRow(ws, R, NG_C);
      R = payRows(ws, R, cfg.global.pay_type, megaways, NG_C);
      R = scrollRow(ws, R, meta.cp_scroll_ng, meta.scroll_main, NG_C);
      R = refillRow(ws, R, meta.cp_refill_ng, meta.refill_method, NG_C);
      ws.getRow(R).height = 28.5; R++;   // 空行
      R = symPlanRow(ws, R, '一般圖示規劃', normNames, NG_C, 36);
      R = symPlanRow(ws, R, '特殊圖示規劃', specNamesP, NG_C);
      // 特殊圖示說明:標籤直向合併;每符號=名稱(直向)+一句一列(FG 範疇語句改道)
      if (cfg.specialSyms.length) {
        const blocks = cfg.specialSyms.map(s => {
          const raw = (meta.special_behavior && meta.special_behavior[_symId(s)]) || behaviorTemplate(s);
          let lines = routeSentences(raw);
          if (!lines.length) lines = [''];
          return { s, lines };
        });
        const total = blocks.reduce((a, b) => a + b.lines.length, 0);
        label(ws, R, 2, 3, '特殊圖示說明', NG_C, R + total - 1);
        let r = R;
        blocks.forEach(b => {
          const r1 = r + b.lines.length - 1;
          if (r1 > r) ws.mergeCells(r, 4, r1, 6); else ws.mergeCells(r, 4, r, 6);
          cc(ws, r, 4, _cpSpecNameBr(b.s), { bold: true, fg: ACC, h: 'center' });
          b.lines.forEach((t, i) => {
            value(ws, r + i, 7, WIDE, _cpTerm(t));
            ws.getRow(r + i).height = 28.5;
          });
          r = r1 + 1;
        });
        R = r;
      }
      // 玩法說明(NG 模式描述拆句)
      if (ngPlayLines.length) R = descRows(ws, R, '玩法說明', ngPlayLines, NG_C, { h: 30 });
      // 得分規則
      const scoreDesc = meta.score_formula || (cfg.derived.isScatterLike
        ? '彩金計算方式：達標數量圖示 × 圖示賠率（見賠率表）。'
        : `彩金計算方式：押注額 × 圖示賠率${(_symbolMultView(cfg).multSyms.length ? ' × 倍數' : '')}＝獲得彩金。`);
      R = descRows(ws, R, '得分規則', scoreDesc, NG_C);
      // 加押 / 購買(有才出)
      const bc = cfg.betConfig || {};
      if (bc.ante_bet_enabled) {
        R = descRows(ws, R, '加押規劃',
          `加押:成本為原押注 ×${Number(bc.ante_bet_mult) || 0}，觸發倍率 ×${Number(bc.ante_bet_trigger_mult) || 0}。${bc.ante_bet_desc || ''}`, NG_C);
      }
      if (bc.buy_feature_enabled && Array.isArray(bc.buy_features) && bc.buy_features.length) {
        R = descRows(ws, R, '特殊模式購買', bc.buy_features.map((f, i) =>
          `${f.bf_id || `購買${i + 1}`}:目標模式 ${f.target_mode || '—'}，成本 ×${Number(f.cost_mult) || 0} 注額。${f.notes || ''}`), NG_C);
      }
      ws.getRow(R).height = 28.5; R++;   // 空行
      R = modeExtras(ws, R, startMode, NG_C);
      R = genLimitBlock(ws, R, limitsForModes([startMode]), NG_C);
    }

    // ══════════ 4. FREE GAME(標籤 1F3864,自第17列起) ══════════
    if (fgModes.length) {
      const ws = wb.addWorksheet('FREE GAME');
      descColsFG(ws);
      let R = 17;
      fgModes.forEach((md, mi) => {
        if (fgModes.length > 1) {
          ws.mergeCells(R, 2, R, WIDE);
          cc(ws, R, 2, `模式 ${md.mode}`, { bold: true, bg: FG_C, fg: 'FFFFFF', size: 14, h: 'left' });
          ws.getRow(R).height = 28.5; R++;
        }
        // 觸發方式
        const trig = (mi === 0 && meta.freegame.trigger) ? meta.freegame.trigger : (md.trigger_condition || '');
        R = descRows(ws, R, '觸發方式', trig, FG_C);
        // 觸發給付(有才出)
        const tp = mi === 0 ? (meta.freegame.trigger_pays || []).filter(t => t && (Number(t.count) || Number(t.pay))) : [];
        if (tp.length) R = descRows(ws, R, '觸發給付', tp.map(t => `${t.count} 個 → ${t.pay}×`).join('、'), FG_C);
        // 盤面顯示 進入/結束
        label(ws, R, 2, 3, '盤面顯示', FG_C, R + 1);
        ws.mergeCells(R, 4, R, 6); cc(ws, R, 4, '進入', { h: 'center' });
        value(ws, R, 7, WIDE, ''); ws.getRow(R).height = 28.5;
        ws.mergeCells(R + 1, 4, R + 1, 6); cc(ws, R + 1, 4, '結束', { h: 'center' });
        value(ws, R + 1, 7, WIDE, ''); ws.getRow(R + 1).height = 28.5;
        R += 2;
        // 盤面 / 連線方式 / 滾動 / 補盤
        R = boardRow(ws, R, FG_C);
        R = payRows(ws, R, md.pay_type_override || cfg.global.pay_type, megaways, FG_C);
        R = scrollRow(ws, R, meta.cp_scroll_fg || meta.cp_scroll_ng, meta.scroll_sub || meta.scroll_main, FG_C);
        R = refillRow(ws, R, meta.cp_refill_fg || meta.cp_refill_ng, meta.refill_method, FG_C);
        // 局數設定(三列:起始局數 / 加局☑ / 上限☑)
        const spins = (Number(md.spin_count) || 0) > 0 ? `${md.spin_count}局`
                    : (mi === 0 && Number(meta.freegame.min_spins) > 0 ? `${meta.freegame.min_spins}局` : '');
        const addTxt = mi === 0 ? String(meta.freegame.add_spins || '').trim() : '';
        const hasAdd = !!addTxt && addTxt !== '無';
        const capRaw = mi === 0 ? String(meta.freegame.cap || '').trim() : '';
        const hasCap = !!capRaw && capRaw !== '無';
        const capTxt = hasCap ? (String(meta.freegame.cap_value || '').trim() || capRaw) : '無';
        label(ws, R, 2, 3, '局數設定', FG_C, R + 2);
        ws.mergeCells(R, 4, R, 6); cc(ws, R, 4, '起始局數', { h: 'center' });
        value(ws, R, 7, WIDE, spins); ws.getRow(R).height = 28.5;
        ws.mergeCells(R + 1, 4, R + 1, 5); cc(ws, R + 1, 4, '加局', { h: 'center', bg: DD_BG });
        cc(ws, R + 1, 6, hasAdd, { h: 'center' });
        _cpPendingCheckbox.push({ sheet: 'FREE GAME', addr: `F${R + 1}` });
        value(ws, R + 1, 7, WIDE, _cpTerm(hasAdd ? addTxt : '無'), { bg: PK_BG });
        ws.getRow(R + 1).height = 28.5;
        ws.mergeCells(R + 2, 4, R + 2, 5); cc(ws, R + 2, 4, '上限', { h: 'center', bg: DD_BG });
        cc(ws, R + 2, 6, hasCap, { h: 'center' });
        _cpPendingCheckbox.push({ sheet: 'FREE GAME', addr: `F${R + 2}` });
        value(ws, R + 2, 7, WIDE, _cpTerm(capTxt), { bg: PK_BG });
        ws.getRow(R + 2).height = 28.5;
        R += 3;
        ws.getRow(R).height = 28.5; R++;   // 空行
        // 一般 / 特殊圖示
        R = symPlanRow(ws, R, '一般圖示', normNames, FG_C);
        R = symPlanRow(ws, R, '特殊圖示', specNamesP, FG_C);
        // 遊戲說明(FG 模式描述拆句 + 自 NG 改道的 FG 範疇語句)
        const fgOwn = _cpSentences((meta.mode_desc && meta.mode_desc[md.mode]) || md.notes || '');
        const fgLines = mi === 0 ? fgOwn.concat(fgExtraLines) : fgOwn;
        R = descRows(ws, R, '遊戲說明', fgLines.length ? fgLines : [''], FG_C);
        ws.getRow(R).height = 28.5; R++;   // 空行
        R = modeExtras(ws, R, md.mode, FG_C);
        if (mi < fgModes.length - 1) { ws.getRow(R).height = 28.5; R++; }
      });
      let R2 = ws.lastRow ? ws.lastRow.number + 1 : 17;
      genLimitBlock(ws, R2, limitsForModes(fgModes.map(m => m.mode)), FG_C);
    }

    // ══════════ 5. BONUS GAME(標籤 1F4E79) ══════════
    if (bonusModes.length) {
      const ws = wb.addWorksheet('BONUS GAME');
      descColsFG(ws);
      let R = 17;
      bonusModes.forEach(md => {
        R = descRows(ws, R, '玩法種類', `${md.mode}:${_modeKindDesc(md)}`, BN_C);
        R = descRows(ws, R, '觸發方式', md.trigger_condition || '', BN_C);
        const k = String(md.mode_kind).toUpperCase();
        if (k === 'WHEEL' && md.wheel_upgrade_to) R = descRows(ws, R, '升級至', md.wheel_upgrade_to, BN_C);
        if (k === 'PICK') R = descRows(ws, R, '抽選次數', Number(md.pick_count) > 0 ? String(md.pick_count) : '抽到結束項為止', BN_C);
        if (k === 'COLLECTION') R = descRows(ws, R, '目標收集數', String(Number(md.collect_target) || 0), BN_C);
        const items = Array.isArray(md.items) ? md.items : [];
        if (items.length) {
          label(ws, R, 2, 3, '各項獎值', BN_C, R + items.length);
          ['項目', '數值 / JP', '權重', '是否結束'].forEach((h, i) => cc(ws, R, 4 + i, h, { bold: true, bg: LB_C, fg: TH_FG, h: 'center' }));
          ws.getRow(R).height = 24; R++;
          items.forEach(it => {
            cc(ws, R, 4, _cpTerm(it.label || ''), { h: 'center' });
            cc(ws, R, 5, it.link_jp ? `JP:${it.link_jp}` : (it.value != null ? it.value : ''), { h: 'center' });
            cc(ws, R, 6, Number(it.weight) || 0, { h: 'center' });
            cc(ws, R, 7, it.is_end ? '是' : '', { h: 'center' });
            ws.getRow(R).height = 24; R++;
          });
        }
        R = modeExtras(ws, R, md.mode, BN_C);
        R++;
      });
    }

    // ══════════ 6. 賠率表、連線方式(合併頁) ══════════
    {
      const ws = wb.addWorksheet('賠率表、連線方式');
      // 欄寬:A=1.1 B=10.7 C=15.6 D=10.7 其餘 8.43
      const pcols = [{ width: 1.1 }, { width: 10.7 }, { width: 15.6 }, { width: 10.7 }];
      for (let c = 5; c <= 10; c++) pcols.push({ width: 8.43 });
      ws.columns = pcols;
      let R = 2;
      const LASTC = 10;   // J
      // 賠付方式 / 計分方向 / 連線種數 / 是否參考競品賠率
      label(ws, R, 2, 3, '賠付方式', NG_C);
      value(ws, R, 4, LASTC, cfg.derived.payTypeLabel || '');
      ws.getRow(R).height = 28.5; R++;
      if (!cfg.derived.isScatterLike) {
        const _gg = cfg.global || {};
        const _dir = String(_gg.payline_direction || _gg.ways_direction || 'LTR').toUpperCase();
        const _dl = _dir === 'RTL' ? '右→左（RTL）'
                  : _dir === 'BOTH' ? '雙向計分（BOTH;左右任一端起算皆成立）'
                  : '左→右（LTR）';
        label(ws, R, 2, 3, '計分方向', NG_C);
        value(ws, R, 4, LASTC, _dl);
        ws.getRow(R).height = 28.5; R++;
        if (_dir === 'BOTH') {
          label(ws, R, 2, 3, '雙向去重', NG_C);
          value(ws, R, 4, LASTC, _gg.ways_both_dedup !== false ? '同一符號組合左右兩向皆成立時僅計分一次' : '左右兩向各自計分（不去重）');
          ws.getRow(R).height = 28.5; R++;
        }
      }
      const _plCount = Array.isArray(cfg.paylines) ? cfg.paylines.length : 0;
      const _isLine = String(cfg.global.pay_type || '').toUpperCase() === 'LINE';
      const kindTxt = cfg.derived.isScatterLike ? (cfg.derived.payMethodDesc || '')
        : _isLine ? (_plCount ? `共有${_plCount}種連線方式。` : '')
        : (cfg.derived.waysCount ? `共有${cfg.derived.waysCount}種連線方式。` : '');
      label(ws, R, 2, 3, cfg.derived.isScatterLike ? '計分方式' : '連線種數', NG_C);
      value(ws, R, 4, LASTC, _cpTerm(kindTxt));
      ws.getRow(R).height = 28.5; R++;
      // 是否參考競品賠率(核取方塊 D + 描述 E:J 粉紅)
      const compUrl = String(meta.competitor_url || '').trim();
      label(ws, R, 2, 3, '是否參考競品賠率', NG_C);
      cc(ws, R, 4, !!compUrl, { h: 'center', bg: DD_BG });
      _cpPendingCheckbox.push({ sheet: '賠率表、連線方式', addr: `D${R}` });
      value(ws, R, 5, LASTC, compUrl, { bg: PK_BG });
      ws.getRow(R).height = 28.5; R++;
      R++;   // 空行(第6列)
      // 連線欄組
      let maxCount = 0;
      cfg.symbols.forEach(s => _symPayRows(s).forEach(pr => { if (pr.count > maxCount) maxCount = pr.count; }));
      if (!maxCount) maxCount = cfg.derived.reelCount || 5;
      const minCount = Math.max(cfg.derived.isScatterLike ? maxCount - 5 : 3, maxCount - 3, 1);
      const counts = [];
      for (let n = maxCount; n >= minCount; n--) counts.push(n);
      const nLast = 3 + counts.length - 1;   // B,C + counts → 尾欄
      // 一般圖示帶
      ws.mergeCells(R, 2, R, nLast);
      cc(ws, R, 2, '一般圖示', { bold: true, bg: TB_C, fg: 'FFFFFF', h: 'center' });
      ws.getRow(R).height = 16.5; R++;
      const hdr = ['編號', '名稱', ...counts.map(n => `${n}連線`)];
      hdr.forEach((h, i) => cc(ws, R, i + 2, h, { bg: TH_C, fg: TH_FG, h: 'center' }));
      ws.getRow(R).height = 21; R++;
      let seq = 0;   // 編號 0 起連號(一般先、特殊接續)
      cfg.normalSyms.forEach(s => {
        const rowMap = {}; _symPayRows(s).forEach(pr => rowMap[pr.count] = pr.pay);
        cc(ws, R, 2, seq++, { h: 'center' });
        cc(ws, R, 3, s.name || _symId(s), { h: 'center' });
        counts.forEach((n, i) => cc(ws, R, 4 + i, rowMap[n] != null ? rowMap[n] : '', { h: 'center' }));
        ws.getRow(R).height = 21; R++;
      });
      // 特殊圖示帶
      ws.mergeCells(R, 2, R, nLast);
      cc(ws, R, 2, '特殊圖示', { bold: true, bg: TB_C, fg: 'FFFFFF', h: 'center' });
      ws.getRow(R).height = 16.5; R++;
      cfg.specialSyms.forEach(s => {
        const rowMap = {}; _symPayRows(s).forEach(pr => rowMap[pr.count] = pr.pay);
        cc(ws, R, 2, seq++, { h: 'center' });
        cc(ws, R, 3, _cpSpecName(s), { h: 'center' });
        counts.forEach((n, i) => cc(ws, R, 4 + i, rowMap[n] != null ? rowMap[n] : '-', { h: 'center' }));
        ws.getRow(R).height = 21; R++;
      });
      // LINE 型:線圖(ASCII)附於賠率表之後
      const geom = _mainBoardGeom(cfg.layout);
      const pls = Array.isArray(cfg.paylines) ? cfg.paylines : [];
      if (_isLine && pls.length && geom) {
        R++;
        pls.forEach(pl => {
          const pts = _parsePathPoints(pl.path || pl.path_str || '');
          if (!pts.length) return;
          const asc = _renderPaylineAscii(pts, geom);
          const titleBits = [`Line ${pl.line_id != null ? pl.line_id : ''}`];
          if (pl.notes) titleBits.push(pl.notes);
          label(ws, R, 2, 3, titleBits.join(' '), NG_C, R + asc.length);
          value(ws, R, 4, LASTC, _pathArrowStr(pts));
          ws.getRow(R).height = 24; R++;
          asc.forEach(line => {
            ws.mergeCells(R, 4, R, LASTC);
            const cell = cc(ws, R, 4, line, { h: 'left', size: 11 });
            cell.font = { name: 'Consolas', size: 11, color: { argb: _argb(TH_FG) } };
            R++;
          });
          R++;
        });
      }
    }

    // ══════════ 7. 輪盤遊戲(標籤 2E75B6) ══════════
    if (wheelModes.length) {
      const ws = wb.addWorksheet('輪盤遊戲');
      descColsFG(ws);
      let R = 17;
      R = descRows(ws, R, '彩金計算方式', '押注額 × 輪盤倍數＝獲得彩金。', WH_C);
      wheelModes.forEach(md => {
        R = descRows(ws, R, '觸發方式', md.trigger_condition || '', WH_C);
        const items = Array.isArray(md.items) ? md.items : [];
        if (items.length) {
          label(ws, R, 2, 3, `${md.mode} 各項獎值`, WH_C, R + items.length);
          ['項目', '數值 / JP', '權重', '升級'].forEach((h, i) => cc(ws, R, 4 + i, h, { bold: true, bg: LB_C, fg: TH_FG, h: 'center' }));
          ws.getRow(R).height = 24; R++;
          items.forEach(it => {
            cc(ws, R, 4, _cpTerm(it.label || ''), { h: 'center' });
            cc(ws, R, 5, it.link_jp ? `JP:${it.link_jp}` : (it.value != null ? it.value : ''), { h: 'center' });
            cc(ws, R, 6, Number(it.weight) || 0, { h: 'center' });
            cc(ws, R, 7, it.is_end ? '' : (md.wheel_upgrade_to || ''), { h: 'center' });
            ws.getRow(R).height = 24; R++;
          });
        }
        R++;
      });
    }

    // ══════════ 8. 說明文件 ══════════
    {
      const ws = wb.addWorksheet('說明文件');
      ws.columns = [{ width: 2.1 }, { width: 8 }, { width: 5.1 }, { width: 65.4 }, { width: 13.3 }];
      let R = 1;
      cc(ws, R, 2, '內文：大小寫正常，開頭字母用大寫。', { border: false }); R++;
      cc(ws, R, 2, '文字內容以翻譯為主。', { border: false }); R += 2;
      function section(title, items) {
        if (!items.length) return;
        cc(ws, R, 2, '標題', { bold: true, bg: TH_C, fg: TH_FG, h: 'center' });
        ws.mergeCells(R, 3, R, 5);
        cc(ws, R, 3, title, { bold: true });
        ws.getRow(R).height = 20; R++;
        ws.mergeCells(R, 2, R + 5, 2);
        cc(ws, R, 2, '圖片', { bold: true, bg: TH_C, fg: TH_FG, h: 'center' });
        ws.mergeCells(R, 3, R + 5, 5);
        cc(ws, R, 3, '', {});
        R += 6;
        cc(ws, R, 3, '編號', { h: 'center' });
        cc(ws, R, 4, '中文字', { h: 'center' });
        cc(ws, R, 5, '翻譯', { h: 'center' });
        R++;
        items.forEach((t, i) => {
          cc(ws, R, 3, i + 1, { h: 'center' });
          cc(ws, R, 4, _cpTerm(t));
          cc(ws, R, 5, '', {});
          R++;
        });
        R += 2;
      }
      // 一般遊戲說明(FG 範疇語句已改道)
      const ngItems = [];
      if (ngPlayLines.length) ngItems.push(ngPlayLines.join(''));
      ngItems.push(cfg.derived.isScatterLike
        ? '彩金計算方式：達標數量圖示 × 圖示賠率。'
        : '彩金計算方式：押注額 × 圖示賠率 × 倍數＝獲得彩金。');
      section('一般遊戲說明', ngItems);
      if (fgModes.length) {
        const fgItems = [];
        if (meta.freegame.trigger) fgItems.push(meta.freegame.trigger);
        if (Number(meta.freegame.min_spins) > 0) fgItems.push(`可獲得${meta.freegame.min_spins}局免費遊戲。`);
        fgModes.forEach(md => { const d = (meta.mode_desc && meta.mode_desc[md.mode]) || md.notes; if (d) fgItems.push(d); });
        if (fgExtraLines.length) fgItems.push(fgExtraLines.join(''));
        section('免費遊戲說明', fgItems);
      }
      if (bonusModes.length) {
        const bnItems = [];
        bonusModes.forEach(md => {
          bnItems.push(`${md.mode}:${_modeKindDesc(md)}${md.trigger_condition ? `;${md.trigger_condition}` : ''}`);
        });
        section('BONUS 遊戲說明', bnItems);
      }
      const bc = cfg.betConfig || {};
      const buyItems = [];
      if (bc.ante_bet_enabled) buyItems.push(`加押:成本 ×${Number(bc.ante_bet_mult) || 0} 注額，觸發倍率 ×${Number(bc.ante_bet_trigger_mult) || 0}。${bc.ante_bet_desc || ''}`);
      if (bc.buy_feature_enabled && Array.isArray(bc.buy_features)) bc.buy_features.forEach(f => buyItems.push(`購買 ${f.bf_id || ''}:進入 ${f.target_mode || '—'}，成本 ×${Number(f.cost_mult) || 0} 注額。`));
      section('加押 / 購買說明', buyItems);
      // ── G-1:收集條說明(有 meters 才出;section() 對空 items 自動略過 → 零 diff)。
      //   翻譯導向句子,結構化明細見 SlotPlanner 企劃書「機制備註」與規格書 markdown。
      const meterItems = [];
      (Array.isArray(cfg.meters) ? cfg.meters : []).forEach(mt => {
        if (!mt || !String(mt.meter_id || '').trim()) return;
        const nm = String(mt.label || mt.meter_id).trim();
        const tierArr = (Array.isArray(mt.tiers) ? mt.tiers : [])
          .filter(t => t && Number.isFinite(Number(t.threshold)));
        if (Number(mt.tier_step) > 0) {
          meterItems.push(`收集條「${nm}」：每累積 ${mt.tier_step} 個觸發一次${mt.on_full_action || '對應反應'}${mt.tier_repeat ? '（每個倍數皆觸發）' : '（僅首次觸發）'}。`);
        } else if (tierArr.length) {
          const sorted = [...tierArr].sort((a, b) => Number(a.threshold) - Number(b.threshold));
          const parts = sorted.map(t => `${t.threshold}→${t.action || '?'}${t.params ? '（' + t.params + '）' : ''}`).join('、');
          meterItems.push(`收集條「${nm}」：累積達 ${parts}。`);
        } else {
          const capTxt = Number(mt.capacity) > 0 ? `容量 ${mt.capacity}` : '無上限累積';
          meterItems.push(`收集條「${nm}」：${capTxt}${mt.on_full_action ? `，集滿觸發 ${mt.on_full_action}` : ''}。`);
        }
      });
      section('收集條說明', meterItems);
      // ── G-2:格位狀態說明(有 State_Type 才出;section() 空 items 自動略過 → 零 diff)。
      //   翻譯導向句子;結構化明細見 SlotPlanner 企劃書「格位狀態(動態)」與規格書 markdown。
      const stateItems = [];
      const _stZh = { MARKER: '標記', COVER: '遮蓋（需擊破）', COUNTDOWN: '倒數（每次轉動 −1）', COUNTER: '累加' };
      (Array.isArray(cfg.cellAttrs) ? cfg.cellAttrs : []).forEach(ca => {
        const st = String((ca && ca.state_type) || '').trim().toUpperCase();
        if (!st) return;
        const where = (ca.state_region || '').trim() || `第 ${Number(ca.reel) || '?'} 輪第 ${Number(ca.row) || '?'} 列`;
        const initTxt = (ca.state_init || '').trim() ? `，初值 ${String(ca.state_init).trim()}` : '';
        const actTxt = (ca.on_state_action || '').trim() ? `，觸發後 ${String(ca.on_state_action).trim()}` : '';
        stateItems.push(`格位狀態（${where}）：${_stZh[st] || st}${initTxt}${actTxt}。`);
      });
      section('格位狀態說明', stateItems);
      // ── G-7/8:動態幾何說明(有 row_feature_max 或 geometry_transitions 才出;section() 空 items 自動略過 → 零 diff)。
      //   翻譯導向句子;結構化明細見 SlotPlanner 企劃書「動態盤面幾何」與規格書 markdown。
      const geoItems = [];
      const _dzc = { ROW_HEIGHT: '每欄列高', REEL_COUNT: '輪數', GRID_ROWS: '整體列數' };
      (Array.isArray(cfg.modes) ? cfg.modes : []).forEach(md => {
        if (md && Number(md.row_feature_max) > 0) {
          geoItems.push(`${md.mode} 特色期盤面可成長至 ${Number(md.row_feature_max)} 列。`);
        }
        (Array.isArray(md && md.geometry_transitions) ? md.geometry_transitions : []).forEach(t => {
          const dim = String((t && t.dimension) || '').trim().toUpperCase();
          if (!dim) return;
          const trig = (t.trigger_source || '').trim() ? `由 ${String(t.trigger_source).trim()} 觸發` : '觸發時';
          const step = (t.step || '').trim() ? `每次 ${String(t.step).trim()}` : '';
          const cap = (t.cap || '').trim() ? `上限 ${String(t.cap).trim()}` : '';
          const tail = [step, cap].filter(Boolean).join('、');
          geoItems.push(`${md.mode}：${trig}，${_dzc[dim] || dim}動態變化${tail ? '（' + tail + '）' : ''}。`);
        });
      });
      section('動態幾何說明', geoItems);
      // ── G-9:符號池動態說明(有 symbol_ops 才出;section() 空 items 自動略過 → 零 diff)。──
      const soItems = [];
      const _ozc = { REMOVE: '移出符號池', UPGRADE: '進行符號值升級' };
      (Array.isArray(cfg.modes) ? cfg.modes : []).forEach(md => {
        (Array.isArray(md && md.symbol_ops) ? md.symbol_ops : []).forEach(o => {
          const op = String((o && o.op) || '').trim().toUpperCase();
          if (!op) return;
          const tgt = (o.target || '').trim() ? `目標 ${String(o.target).trim()}` : '';
          const cnt = (o.count || '').trim() ? `每次 ${String(o.count).trim()} 個` : '';
          const imm = (o.immune || '').trim() ? `豁免 ${String(o.immune).trim()}` : '';
          const tail = [tgt, cnt, imm].filter(Boolean).join('、');
          soItems.push(`${md.mode}：${_ozc[op] || op}${tail ? '（' + tail + '）' : ''}。`);
        });
      });
      section('符號池動態說明', soItems);
      // ── G-4:Hold & Win 說明(有 hold-win 新欄 或 kind=HOLD_AND_WIN 才出;section() 空 items 自動略過)。──
      const hwItems = [];
      (Array.isArray(cfg.modes) ? cfg.modes : []).forEach(md => {
        if (!md) return;
        const isHW = String(md.mode_kind || '').toUpperCase() === 'HOLD_AND_WIN';
        const trig = (md.hw_trigger_symbol || '').trim();
        const rule = (md.hw_collect_rule || '').trim();
        const jp = (md.hw_link_jackpot || '').trim();
        if (!isHW && !trig && !md.hw_persist_value && !rule && !jp) return;
        const parts = [];
        if (trig) parts.push(`收集符 ${trig}`);
        if (md.hw_persist_value) parts.push('格值常駐');
        if (rule) parts.push(`收集規則「${rule}」`);
        if (jp) parts.push(`連結彩池 ${jp}`);
        hwItems.push(`${md.mode}：Hold & Win / 金幣收集玩法${parts.length ? '（' + parts.join('、') + '）' : ''}。`);
      });
      section('Hold & Win 說明', hwItems);
    }

    // ══════════ 9. 演繹流程(留白分鏡頁) ══════════
    {
      const ws = wb.addWorksheet('演繹流程');
      ws.columns = [{ width: 4.9 }];
    }

    // ══════════ 10. 節奏表 ══════════
    {
      const ws = wb.addWorksheet('節奏表');
      const rcols = [{ width: 1.9 }, { width: 8.4 }, { width: 30 }];
      for (let c = 4; c <= 14; c++) rcols.push({ width: 4.4 });
      ws.columns = rcols;
      let R = 2;
      cc(ws, R, 2, '每小格單位：0.1 秒。', { border: false }); R++;
      const ITEMS = ['AUTO', '轉輪時間(啟動至第1輪停止)', '整體滾輪時間', '未得分局間停頓',
                     '停輪後中獎停頓', '中獎後出現分數', '分數停留時間', '圖示演繹'];
      ITEMS.forEach(it => {
        cc(ws, R, 3, it);
        for (let c = 4; c <= 14; c++) cc(ws, R, c, '', {});
        ws.getRow(R).height = 17.2;
        R++;
      });
    }

    // ══════════ 11. 體感(特殊圖示括號式表頭) ══════════
    {
      const ws = wb.addWorksheet('體感');
      const symCols = cfg.symbols.map(s => _isSpecial(s) ? _cpSpecName(s) : (s.name || _symId(s)));
      const cols = [{ width: 6 }, { width: 9 }, { width: 11 }];
      symCols.forEach(() => cols.push({ width: 10 }));
      ws.columns = cols;
      let R = 1;
      ['編號', '是否得分', '是否超過1倍', ...symCols].forEach((h, i) =>
        cc(ws, R, i + 1, h, { bg: TH_C, fg: TH_FG, h: 'center' }));
      ws.getRow(R).height = 16.5; R++;
      for (let n = 1; n <= 30; n++) {
        cc(ws, R, 1, n, { h: 'center' });
        for (let c = 2; c <= 3 + symCols.length; c++) cc(ws, R, c, '', { h: 'center' });
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

    // #3（Board v2 §7.2/§8）:逐輪進場 / 滾動方式 — 有非預設才輸出（守衛;基準全預設 SCROLL/DOWN → 零輸出 → 零 diff）。
    {
      const _reels = Array.isArray(cfg.layout) ? cfg.layout : [];
      const _emLab = { SCROLL: '輪滾動', DROP: '掉落', SPAWN: '原地生成' };
      const _dirLab = {
        SCROLL: { DOWN: '由上往下', UP: '由下往上' },
        DROP: { DOWN: '自上落下', UP: '自下升起' },
        SPAWN: { NONE: '無方向' },
      };
      const _nonDefault = _reels.some(r => (r.entry_mode && r.entry_mode !== 'SCROLL') || (r.scroll_dir && r.scroll_dir !== 'DOWN'));
      if (_nonDefault && _reels.length) {
        L.push('## 進場 / 滾動方式（逐輪）');
        L.push('');
        L.push('> 各主輪的進場 / 滾動方式與方向;純描述性設定，供實作端遵循，本工具不執行滾動。');
        L.push('');
        L.push('| 輪 | 進場方式 | 方向 |');
        L.push('| --- | --- | --- |');
        for (const r of _reels) {
          const em = r.entry_mode || 'SCROLL';
          const sd = em === 'SPAWN' ? 'NONE' : (r.scroll_dir || 'DOWN');
          const emZh = _emLab[em] || em;
          const sdZh = (_dirLab[em] && _dirLab[em][sd]) || (em === 'SPAWN' ? '無方向' : sd);
          L.push(`| R${r.reel_id} | ${emZh} | ${sdZh} |`);
        }
        L.push('');
      }
    }

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

    // ── G-7/8:動態盤面幾何(有 row_feature_max 或 geometry_transitions 才輸出;set 守衛保零 diff)。
    //   純描述,幾何轉變執行(長盤 / ways 重算)歸下游;不改 computeWaysCount。──
    {
      const _featModes = (cfg.modes || []).filter(md => md && Number(md.row_feature_max) > 0);
      const _geoModes = (cfg.modes || []).filter(md => md && Array.isArray(md.geometry_transitions)
        && md.geometry_transitions.some(t => t && String(t.dimension || '').trim()));
      if (_featModes.length || _geoModes.length) {
        L.push('## 動態盤面幾何');
        L.push('');
        if (_featModes.length) {
          L.push('- 特色期列上限：' + _featModes.map(md => `${md.mode} → ${Number(md.row_feature_max)} 列`).join('；') + '。基本期沿用 05b／盤面列數；特色期可成長至此上限（White Rabbit 延展轉軸、Cygnus 擴列）。');
          L.push('');
        }
        if (_geoModes.length) {
          const _dimZh = { ROW_HEIGHT: '每欄列高', REEL_COUNT: '輪數', GRID_ROWS: '整體列數' };
          L.push('| 模式 | 維度 | 觸發 | 每次 | 上限 | ways 重算 | 備註 |');
          L.push('| --- | --- | --- | --- | --- | --- | --- |');
          _geoModes.forEach(md => {
            md.geometry_transitions.forEach(t => {
              if (!t || !String(t.dimension || '').trim()) return;
              const dim = String(t.dimension).toUpperCase();
              L.push(`| ${_mdCell(md.mode)} | ${_mdCell(_dimZh[dim] || dim)} | ${_mdCell((t.trigger_source || '').trim() || '—')} | ` +
                     `${_mdCell((t.step || '').trim() || '—')} | ${_mdCell((t.cap || '').trim() || '—')} | ` +
                     `${_mdCell((t.ways_recompute || '').trim() || '—')} | ${_mdCell(t.notes || '')} |`);
            });
          });
          L.push('');
        }
        L.push('> 動態盤面幾何為遊玩中的尺寸轉變宣告（維度／觸發／step／上限／ways 重算）；轉變執行與 ways 重算由下游模擬工具實作，本工具不執行、不計算 RTP。');
        L.push('');
      }
    }

    // ── G-9:符號池動態變更(有 symbol_ops 才輸出;set 守衛保零 diff)。──
    {
      const _soModes = (cfg.modes || []).filter(md => md && Array.isArray(md.symbol_ops)
        && md.symbol_ops.some(o => o && String(o.op || '').trim()));
      if (_soModes.length) {
        const _opZh = { REMOVE: '移除（deck-thinning）', UPGRADE: '升級' };
        L.push('## 符號池動態變更');
        L.push('');
        L.push('| 模式 | 操作 | 目標 | 數量 | 豁免 | 觸發 | 備註 |');
        L.push('| --- | --- | --- | --- | --- | --- | --- |');
        _soModes.forEach(md => {
          md.symbol_ops.forEach(o => {
            if (!o || !String(o.op || '').trim()) return;
            const op = String(o.op).toUpperCase();
            L.push(`| ${_mdCell(md.mode)} | ${_mdCell(_opZh[op] || op)} | ${_mdCell((o.target || '').trim() || '—')} | ` +
                   `${_mdCell((o.count || '').trim() || '—')} | ${_mdCell((o.immune || '').trim() || '—')} | ` +
                   `${_mdCell((o.trigger || '').trim() || '—')} | ${_mdCell(o.notes || '')} |`);
          });
        });
        L.push('');
        L.push('> 符號池動態變更為 feature 中的符號集縮減 / 符號值升級宣告；實際移除 / 升級對接 `CONVERT`，由下游模擬工具實作，本工具不執行、不計算 RTP。');
        L.push('');
      }
    }

    // ── G-4:Hold & Win / 金幣收集(有 hold-win 新欄 或 kind=HOLD_AND_WIN 才輸出;set 守衛保零 diff)。
    //   respin 本體見「各模式玩法設定」的 Hold&Win Respin 欄;此處為金幣收集描述。──
    {
      const _hwModes = (cfg.modes || []).filter(md => md && (
        String(md.mode_kind || '').toUpperCase() === 'HOLD_AND_WIN' ||
        String(md.hw_trigger_symbol || '').trim() || md.hw_persist_value === true ||
        String(md.hw_collect_rule || '').trim() || String(md.hw_link_jackpot || '').trim()));
      if (_hwModes.length) {
        L.push('## Hold & Win / 金幣收集');
        L.push('');
        L.push('| 模式 | 觸發/收集符 | 持久格值 | 收集規則 | 連結彩池 |');
        L.push('| --- | --- | --- | --- | --- |');
        _hwModes.forEach(md => {
          L.push(`| ${_mdCell(md.mode)} | ${_mdCell((md.hw_trigger_symbol || '').trim() || '—')} | ` +
                 `${_mdCell(md.hw_persist_value ? '是' : '否')} | ${_mdCell((md.hw_collect_rule || '').trim() || '—')} | ` +
                 `${_mdCell((md.hw_link_jackpot || '').trim() || '—')} |`);
        });
        L.push('');
        L.push('> Hold & Win / cash-on-reels 描述：符號落地即鎖、respin 收集（respin 數見各模式玩法設定），持久格值為金額常駐；對接 `STICKY` / `PAY` / `COLLECT`，實際收集與 jackpot 命中由下游模擬工具實作，本工具不執行、不計算 RTP。');
        L.push('');
      }
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
          // v8.45 / 批次D GAP-C1:含玩家選項才輸出(零 diff 天然)
          if (items.some(it => String(it.item_role || '').trim().toUpperCase() === 'PLAYER_CHOICE')) {
            L.push('- 玩家選項：角色為「玩家選項」的項目 = 進場前由玩家擇一(非隨機抽取,權重欄不適用);值欄為選項參數、連結模式為選後進入的模式。與模式級擇一組(choice_group)正交。');
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

    // v8.35 / GAP-H1:巨型符號尺寸(有資料才輸出;Gigablox 類尺寸分佈 or 固定 mega 尺寸)
    {
      const megaSyms = (Array.isArray(cfg.symbols) ? cfg.symbols : []).filter(s =>
        (Number(s.mega_w) || 1) > 1 || (Number(s.mega_h) || 1) > 1 || String(s.mega_sizes || '').trim());
      // 零 diff 閘門:僅在至少一個符號帶「尺寸分佈」時輸出(舊檔固定 mega 維持 v8.33 輸出不變;
      //   有分佈時連固定尺寸者一併列出供對照)。
      const hasDist = megaSyms.some(s => String(s.mega_sizes || '').trim());
      if (megaSyms.length && hasDist) {
        L.push('## 巨型符號尺寸');
        L.push('');
        L.push('| 符號 | 尺寸 | 說明 |');
        L.push('| --- | --- | --- |');
        megaSyms.forEach(s => {
          const dist = String(s.mega_sizes || '').trim();
          if (dist) {
            L.push(`| ${s.name || _symId(s)} | ${_megaSizesDesc(dist)} | 每次落地依權重抽尺寸（分佈抽取由下游實作） |`);
          } else {
            L.push(`| ${s.name || _symId(s)} | 固定 ${Number(s.mega_w) || 1}×${Number(s.mega_h) || 1} | 佔多格符號 |`);
          }
        });
        L.push('');
      }
    }

    // v8.39 / GAP-F1+軌道:軌道(有資料才輸出;規格描述,零 diff 天然)
    {
      const tks = (Array.isArray(cfg.tracks) ? cfg.tracks : []).filter(t => t && String(t.track_id || '').trim());
      if (tks.length) {
        const gRT = String((cfg.global || {}).refill_track || '').trim();
        const gST = String((cfg.global || {}).scroll_track || '').trim();
        L.push('## 軌道');
        L.push('');
        L.push('| 編號 | 所屬盤面 | 路徑序列 | 入口 | 用途 | 備註 |');
        L.push('| --- | --- | --- | --- | --- | --- |');
        tks.forEach(t => {
          const cells = String(t.cells || '').trim();
          const pathZh = cells ? cells.split(';').map(s => `(${s.trim()})`).join('→') : '—';
          const uses = [];
          if (t.track_id === gRT) uses.push('全域補盤路徑');
          if (t.track_id === gST) uses.push(`主盤捲軸(每局 ${Number((cfg.global || {}).scroll_step) || 0} 格)`);
          (Array.isArray(cfg.modes) ? cfg.modes : []).forEach(m => {
            if (m && String(m.refill_track_override || '').trim() === t.track_id) uses.push(`「${m.mode}」補盤路徑`);
          });
          (Array.isArray(cfg.panels) ? cfg.panels : []).forEach(p => {
            if (p && String(p.scroll_track || '').trim() === t.track_id) uses.push(`面板 ${p.panel_id} 捲軸(每局 ${Number(p.scroll_step) || 0} 格)`);
          });
          const scope = String(t.scope || 'MAIN');
          const scopeZh = scope === 'MAIN' ? '主盤' : scope;
          const notes = String(t.notes || '').replace(/\|/g, '\\|');
          L.push(`| ${t.track_id} | ${scopeZh} | ${pathZh} | ${String(t.entry || 'START') === 'END' ? '序列尾' : '序列首'} | ${uses.length ? uses.join('、') : 'WALK / 備用'} | ${notes} |`);
        });
        L.push('');
        L.push('> 軌道 = 純幾何的有序格子序列;補盤沿軌道推進(取代重力方向)、走位沿軌道行進、捲軸沿軌道位移(位移狀態跨局累計由下游追蹤)。本工具不執行。');
        L.push('');
      }
    }

    // v8.44 / C-2 GAP-P3+P5:副盤評價與作動(有資料才輸出;規格描述,零 diff 天然 — reelLinks 前例)
    {
      const pnls = (Array.isArray(cfg.panels) ? cfg.panels : [])
        .filter(p => p && p.panel_id && (String(p.active_modes || '').trim() || String(p.eval_domain || '').trim()));
      if (pnls.length) {
        const _EVAL_ZH = { MAIN: '併入主盤', SELF_LINE: '盤內連線集', SELF_WAYS: '盤內 ways' };
        L.push('## 副盤評價與作動');
        L.push('');
        L.push('| 面板 | 作動模式 | 評價域 | 連線集 |');
        L.push('| --- | --- | --- | --- |');
        pnls.forEach(p => {
          const am = String(p.active_modes || '').trim() || '全模式';
          const ed = String(p.eval_domain || '').trim().toUpperCase();
          const edZh = ed ? (_EVAL_ZH[ed] || ed) : '併入主盤（沿用 Join_Payline）';
          const ps = (ed === 'SELF_LINE') ? (_mdCell(p.payline_set) || 'ALL') : '—';
          L.push(`| ${_mdCell(p.panel_id)} | ${_mdCell(am)} | ${edZh} | ${ps} |`);
        });
        L.push('');
        L.push('> SELF_* = 該盤自帶評價域,scatter 計數亦盤內計;非空評價域優先於「參與主盤連線」旗標。事件驅動啟停見特色規則 PANEL_SET;與作動模式(靜態域)疊加:兩者皆過才作動。本工具不執行、不計算 RTP。');
        L.push('');
      }
    }

    // v8.38 / GAP-T1:輪帶連動(有資料才輸出;規格描述,零 diff 天然)
    {
      const links = (Array.isArray(cfg.reelLinks) ? cfg.reelLinks : []).filter(l => l && String(l.link_id || '').trim());
      if (links.length) {
        const _kindZh = { CLONE: '內容相同', MIRROR: '左右鏡射' };
        L.push('## 輪帶連動');
        L.push('');
        L.push('| 編號 | 適用模式 | 連動輪 | 權重 | 同步方式 | 備註 |');
        L.push('| --- | --- | --- | --- | --- | --- |');
        links.forEach(l => {
          const reels = String(l.reels || '').trim();
          const reelsZh = reels ? `R${reels.split(',').map(s => s.trim()).filter(Boolean).join('、R')}` : '（無連動選項）';
          const scope = (l.mode_scope && l.mode_scope !== 'ALL') ? l.mode_scope : '全部';
          const kind = _kindZh[String(l.link_kind || 'CLONE').toUpperCase()] || l.link_kind;
          const notes = String(l.notes || '').replace(/\|/g, '\\|');
          L.push(`| ${l.link_id} | ${scope} | ${reelsZh} | ${Number(l.weight) || 0} | ${kind} | ${notes} |`);
        });
        L.push('');
        L.push('> 每局於同適用模式內依權重抽一列決定本局連動配置;連動輪內容相同或鏡射由「同步方式」宣告。本工具不執行,抽取與同步由下游實作。');
        L.push('');
      }
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
        // v8.49 / 缺口4:上限(cap_value)有值才附註,舊資料(cap_value 缺欄/空)輸出零 diff
        const valCell = (ca.value || '').trim() ? _mdCell(String(ca.value)) : '—';
        const capSuffix = (ca.cap_value || '').trim() ? `（上限${_mdCell(String(ca.cap_value))}）` : '';
        L.push(`| (R${Number(ca.reel) || '?'}, 列 ${Number(ca.row) || '?'}) | ${_attrLabel[at] || at} | ${valCell}${capSuffix} | ${scope} | ${notes} |`);
      });
      L.push('');
      L.push('> 位置型格子屬性：固定盤面座標上的乘數 / 強化 / 框格宣告，供實作端遵循；本工具不執行。');
      L.push('');
    }

    // ── G-2:格位狀態(動態)——僅列有 State_Type 的格;set 守衛保既有「格子屬性」表零 diff。
    //   純描述狀態語意,狀態機執行(倒數/擊破/累加/觸發時機)歸下游模擬工具,不算 RTP。──
    if (Array.isArray(cfg.cellAttrs) && cfg.cellAttrs.some(ca => ca && String(ca.state_type || '').trim())) {
      const _stLabel = { MARKER: '標記', COVER: '遮蓋(需擊破)', COUNTDOWN: '倒數(每 spin −1)', COUNTER: '累加' };
      L.push('## 格位狀態（動態）');
      L.push('');
      L.push('| 格 | 狀態 | 初值 | 觸發 | 觸發後動作 | 範圍 | 備註 |');
      L.push('| --- | --- | --- | --- | --- | --- | --- |');
      cfg.cellAttrs.forEach(ca => {
        if (!ca || !String(ca.state_type || '').trim()) return;
        const st = String(ca.state_type).toUpperCase();
        const anchor = `(R${Number(ca.reel) || '?'}, 列 ${Number(ca.row) || '?'})`;
        const region = (ca.state_region || '').trim() ? _mdCell(String(ca.state_region)) : anchor;
        L.push(`| ${anchor} | ${_stLabel[st] || st} | ${_mdCell((ca.state_init || '').trim() || '—')} | ` +
               `${_mdCell((ca.state_trigger || '').trim() || '—')} | ${_mdCell((ca.on_state_action || '').trim() || '—')} | ` +
               `${region} | ${_mdCell(ca.notes || '')} |`);
      });
      L.push('');
      L.push('> 格位狀態為動態宣告（標記／遮蓋／倒數／計數 + 觸發 + 觸發後動作）；狀態機執行（倒數、擊破、累加、觸發時機）由下游模擬工具實作，本工具不執行、不計算 RTP。');
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

    // ── G-1:收集條 / 進度條(21_Collection_Meters;含分段門檻)。set 守衛:僅有 meters 時輸出。
    //   docgen 此前完全未渲染收集條 → 無 meters 的既有文件不受影響(零 diff);純描述,
    //   累積 / 歸零 / 觸發時機交下游模擬工具實作,本工具不執行、不計算 RTP。
    if (Array.isArray(cfg.meters) && cfg.meters.filter(mt => mt && mt.meter_id).length) {
      const _mts = cfg.meters.filter(mt => mt && mt.meter_id);
      const _tiersOf = (mt) => (Array.isArray(mt.tiers) ? mt.tiers : [])
        .filter(t => t && Number.isFinite(Number(t.threshold)));
      L.push('## 收集條 / 進度條');
      L.push('');
      L.push('| 收集條 | 名稱 | 適用模式 | 填充來源 | 每次+ | 容量 | 歸零 | 集滿/每步動作 | 連動彩池 | 跨模式 | 分段 | 備註 |');
      L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
      _mts.forEach(mt => {
        const isRatio  = Number(mt.tier_step) > 0;
        const tierArr  = _tiersOf(mt);
        const scope    = (mt.mode_scope && mt.mode_scope !== 'ALL') ? mt.mode_scope : '全部';
        const cap      = (Number(mt.capacity) > 0) ? mt.capacity : '無上限';
        const jp       = mt.link_jackpot ? mt.link_jackpot : '—';
        const carry    = mt.carry_over ? '是' : '否';
        const act      = mt.on_full_action ? mt.on_full_action : '—';
        let seg = '—';
        if (isRatio)          seg = `比率·每 ${mt.tier_step}${mt.tier_repeat ? '（可重複）' : '（僅首次）'}`;
        else if (tierArr.length) seg = `絕對 ${tierArr.length} 段`;
        L.push(`| ${_mdCell(mt.meter_id)} | ${_mdCell(mt.label || '—')} | ${_mdCell(scope)} | ` +
               `${_mdCell(mt.fill_source || '—')} | ${_mdCell(mt.fill_amount)} | ${_mdCell(cap)} | ` +
               `${_mdCell(mt.reset_scope || 'FEATURE')} | ${_mdCell(act)} | ${_mdCell(jp)} | ${carry} | ` +
               `${_mdCell(seg)} | ${_mdCell(mt.notes || '')} |`);
      });
      L.push('');
      L.push('> 收集條：跨局／跨消除持續累積的進度條（如 Scatter 收集、金幣計量、Tome Portal 分段、xWays Hoarder 每 N 升級）。純描述，累積／歸零／觸發時機由下游模擬工具實作。');
      L.push('');
      // 絕對門檻明細(逐收集條;比率型已於上表「分段」欄描述,無需明細)
      _mts.forEach(mt => {
        if (Number(mt.tier_step) > 0) return;         // 比率型 → 上表已述
        const tierArr = _tiersOf(mt);
        if (!tierArr.length) return;
        const sorted = [...tierArr].sort((a, b) => Number(a.threshold) - Number(b.threshold));
        L.push(`### ${mt.meter_id}${mt.label ? '（' + mt.label + '）' : ''}　分段門檻`);
        L.push('');
        L.push('| 門檻 | 動作 | 參數 |');
        L.push('| --- | --- | --- |');
        sorted.forEach(t => {
          L.push(`| ${_mdCell(t.threshold)} | ${_mdCell(t.action || '—')} | ${_mdCell(t.params || '')} |`);
        });
        L.push('');
      });
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
        // v8.49 / 缺口1:額外機率閘門標示(僅非預設 1.0 才印,舊資料零 diff)
        if (r.fire_chance != null && Number(r.fire_chance) !== 1 && !isNaN(Number(r.fire_chance))) {
          rid += `〔機率 ${Number(r.fire_chance) * 100}%〕`;
        }
        const scope = _mdCell(r.mode_scope || 'ALL');
        const trg   = _RULE_TRIGGER_LABEL[r.trigger] || _mdCell(r.trigger || '');
        const cond  = _mdCell(r.condition || '') || '—';
        const acts  = (Array.isArray(r.actions) ? r.actions : []).map(_ruleActionDesc).filter(Boolean);
        const desc  = _mdCell(r.description || r.notes || '');
        L.push(`| ${rid} | ${r.priority != null ? r.priority : 100} | ${scope} | ${trg} | ${cond} | ${_mdCell(acts.join('；')) || '—'} | ${desc} |`);
      });
      L.push('');
      L.push('> 特色規則為結構化描述（觸發 / 條件 / 動作），供數值組 / 模擬工具實作時遵循；本工具不執行、不計算 RTP。');
      L.push('> 同「隨機組」的規則同時觸發時，依權重隨機擇一執行；描述型動作（擴展整輪／推移／走位／揭示／分裂／相鄰消除／盤面成長／計量調整；收集值／直接派彩／值乘算／回補回合／盤面壓實／值/型態轉換）之執行語意由下游模擬工具實作。標記「每回合重跑」（persistent）的規則，其動作於每個 spin／respin 重複套用；標記「機率 N%」（fire_chance）的規則，於條件成立後再抽一次此機率，骰過才真正觸發（用於無可數圖示條件的純機率直觸發）。');
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

  // #6 企劃書預覽:安全 markdown → HTML(先 escape 使用者內容,再套白名單標籤;
  //   純顯示用,不影響 buildMechMarkdown 輸出。用於 DocGenPage 的就地預覽紙張)。
  function _mdEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function renderMd(md) {
    const lines = String(md == null ? '' : md).replace(/\r/g, '').split('\n');
    const out = [];
    let i = 0;
    const inline = (t) => _mdEscape(t)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    const isSpecial = (s) => /^\s*(#{1,6}\s|>|[-*]\s|\|)/.test(s) || /^\s*---+\s*$/.test(s);
    while (i < lines.length) {
      const ln = lines[i];
      // 表格區塊
      if (/^\s*\|.*\|\s*$/.test(ln)) {
        const tbl = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { tbl.push(lines[i]); i++; }
        const parseRow = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = parseRow(tbl[0]);
        const bodyStart = (tbl[1] && /^[\s|:\-]+$/.test(tbl[1])) ? 2 : 1;
        let h = '<table class="docgen-md-tbl"><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
        for (let r = bodyStart; r < tbl.length; r++) {
          h += '<tr>' + parseRow(tbl[r]).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
        }
        out.push(h + '</tbody></table>');
        continue;
      }
      let m;
      if ((m = ln.match(/^(#{1,6})\s+(.*)$/))) { const lv = Math.min(m[1].length, 4); out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); i++; continue; }
      if (/^\s*---+\s*$/.test(ln)) { out.push('<hr>'); i++; continue; }
      if ((m = ln.match(/^\s*>\s?(.*)$/))) { out.push(`<blockquote>${inline(m[1])}</blockquote>`); i++; continue; }
      if (/^\s*[-*]\s+/.test(ln)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
        out.push('<ul>' + items.map(it => `<li>${inline(it)}</li>`).join('') + '</ul>');
        continue;
      }
      if (ln.trim() === '') { i++; continue; }
      const para = [];
      while (i < lines.length && lines[i].trim() !== '' && !isSpecial(lines[i])) { para.push(lines[i]); i++; }
      out.push('<p>' + para.map(inline).join('<br>') + '</p>');
    }
    return out.join('\n');
  }

  const TEMPLATE = `
  <div class="docgen">
    <!-- 頂部 sticky 動作列：機制 MD 為主要動作 -->
    <div class="docgen-actionbar">
      <div class="docgen-actions">
        <button class="btn btn-primary" @click="exportMd" :disabled="busy">📝 機制文件 (MD)</button>
        <button class="btn" @click="exportXlsx" :disabled="busy">📊 企劃文件 (Excel)</button>
        <button class="btn" @click="exportCompanyXlsx" :disabled="busy">📗 企劃書（公司格式）</button>
        <button class="btn" @click="save" :disabled="busy">💾 儲存敘述</button>
        <button class="btn" :class="{ active: previewOpen }" @click="togglePreview" :disabled="busy">👁 {{ previewOpen ? '收起預覽' : '預覽企劃書' }}</button>
      </div>
      <div class="docgen-hint" v-if="hint">{{ hint }}</div>
    </div>

    <!-- #6 企劃書預覽紙張:就地渲染機制文件(非差異比對;段落隨資料顯隱)-->
    <div v-if="previewOpen" class="docgen-preview">
      <div class="docgen-preview-head">
        <span class="docgen-preview-title">企劃書預覽</span>
        <span class="docgen-preview-sub">就地渲染機制文件（非差異比對）· 段落隨資料顯隱</span>
      </div>
      <div class="docgen-preview-paper" v-html="previewHtml"></div>
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
      <div v-if="meta.inherit_config === false" style="font-size:var(--fs-xs); color:var(--text-light); margin-top:6px;">
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
      <div class="field-label">公司格式下拉 · 一般遊戲滾動方向</div>
      <select class="input" v-model="meta.cp_scroll_ng">
        <option value="">（自動判別）</option>
        <option v-for="o in CP_SCROLL_OPTS" :key="'cn'+o" :value="o">{{ o }}</option>
      </select>
      <div class="field-label">公司格式下拉 · 一般遊戲補盤方式</div>
      <select class="input" v-model="meta.cp_refill_ng">
        <option value="">（自動判別）</option>
        <option v-for="o in CP_REFILL_OPTS" :key="'rn'+o" :value="o">{{ o }}</option>
      </select>
      <div class="field-label">公司格式下拉 · FREE GAME 滾動方向</div>
      <select class="input" v-model="meta.cp_scroll_fg">
        <option value="">（同一般遊戲）</option>
        <option v-for="o in CP_SCROLL_OPTS" :key="'cf'+o" :value="o">{{ o }}</option>
      </select>
      <div class="field-label">公司格式下拉 · FREE GAME 補盤方式</div>
      <select class="input" v-model="meta.cp_refill_fg">
        <option value="">（同一般遊戲）</option>
        <option v-for="o in CP_REFILL_OPTS" :key="'rf'+o" :value="o">{{ o }}</option>
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
          // v8.33:公司格式一律 .xlsm(內嵌公司 VBA);轉換失敗即顯示錯誤,絕不退回 .xlsx
          const xlsmBuf = SP.DocGen._xlsxToXlsmBuffer(buf);
          const blob = new Blob([xlsmBuf], { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });
          _download(blob, `${_baseName()}_企劃書.xlsm`);
          setHint('✔ 企劃書（公司格式 .xlsm,含巨集）已匯出', 'ok');
        } catch (e) {
          console.error(e); setHint(`匯出失敗：${e.message || e}`, 'err');
        } finally { busy.value = false; }
      }

      // #6 企劃書預覽:就地渲染機制文件(computed 僅在開啟時計算 → live 隨 meta 更新;完全不影響 builder 輸出)
      const previewOpen = ref(false);
      const previewHtml = computed(() => {
        if (!previewOpen.value) return '';
        try { return renderMd(SP.DocGen.buildMechMarkdown(JSON.parse(JSON.stringify(meta)))); }
        catch (e) { return '<p style="color:var(--text-danger,#c00)">預覽產生失敗：' + _mdEscape(e.message || String(e)) + '</p>'; }
      });
      function togglePreview() { if (!previewOpen.value) { try { save(); } catch (e) {} } previewOpen.value = !previewOpen.value; }

      return { cfg, meta, busy, hint, symId, role, save, addJp, removeJp, syncJpFromConfig, fillBehavior, exportXlsx, exportMd, exportCompanyXlsx, refreshConfig,
        addTriggerPay, removeTriggerPay,
        previewOpen, previewHtml, togglePreview,
        PAYLINE_METHODS, REFILL_METHODS, SCROLL_METHODS, SCORE_FORMULAS, CP_SCROLL_OPTS, CP_REFILL_OPTS };
    },
  };

  console.log('[docgen] loaded');
})();
