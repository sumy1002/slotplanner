// ============================================================
//  aconfig-xlsx.js — A.xlsx I/O 層(從 config-editor.js 拆出)
//
//  公開接口(掛在 window.SlotPlanner):
//    buildAxlsxBufferFromLS() → Promise<ArrayBuffer>
//      從 localStorage 讀取所有 aconfig 資料,生成完整 A.xlsx ArrayBuffer
//      讓 SimPage 等其他 component 可以拿來餵 Pyodide,不必經過實體檔案
//
//    getAxlsxSummaryFromLS() → { hasAnyData, counts }
//      回傳目前 LS 中的狀態摘要,給 UI 顯示「會使用什麼設定」
//
//  依賴:window.ExcelJS(由 app.html 載入 CDN)
//  完全獨立於 config-editor 的 Vue setup,任何 component 都可呼叫
// ============================================================
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════
  //  Helpers — 與 config-editor.js 中同名函式保持邏輯一致
  //  (此檔為獨立 IIFE,不能依賴 config-editor 的內部變數,故需內嵌一份)
  // ════════════════════════════════════════════════════════════════════

  // 符號顯示類別 → A.xlsx Type enum（圖示頁 type=NORMAL 契約 · 前端閉環）。
  //   已是合法 A.xlsx enum → 原樣通過（保「匯入未編輯」的 HIGH/LOW 零 diff + r1 回歸）；
  //   顯示類別（一般得分 / FREE / COIN / Other…）→ 映射為規範 enum，避免把非 enum 字串寫進 A.xlsx。
  //   WILD/SCATTER 的行為另由 Is_Wild / Is_Scatter 欄驅動，此欄僅型別標記；
  //   下游把 HIGH / LOW / NORMAL 皆視為一般得分（語意等價），故編輯後塌成一般得分 → NORMAL 為正解。
  const _SYM_TYPE_ENUM = ['HIGH', 'LOW', 'NORMAL', 'WILD', 'SCATTER', 'BONUS', 'SPECIAL'];
  const _SYM_CAT_TO_ENUM = {
    '一般得分': 'NORMAL', 'WILD': 'WILD', 'SCATTER': 'SCATTER', 'BONUS': 'BONUS',
    'FREE': 'SPECIAL', 'COIN': 'SPECIAL', 'OTHER': 'SPECIAL', '其他': 'SPECIAL',
  };
  function _symTypeToEnum(t) {
    const s = (t == null ? '' : String(t)).trim();
    if (!s) return 'NORMAL';                              // 空 → 中性值
    const up = s.toUpperCase();
    if (_SYM_TYPE_ENUM.indexOf(up) >= 0) return up;      // 已是合法 enum → 原樣（零 diff）
    return _SYM_CAT_TO_ENUM[s] || _SYM_CAT_TO_ENUM[up] || 'NORMAL';
  }

  // mode_scope ↔ condition 合併:後端 PuzzleRule 沒有 mode_scope 欄位
  //   v8.16:多模式(逗號分隔)→「mode in [A, B]」前綴;單模式路徑不變。
  function _composeConditionWithModeScope(modeScope, condition) {
    const ms = (modeScope || 'ALL').toString().trim();
    let cond = (condition || '').toString().trim();
    if (!ms || ms === 'ALL') return cond;
    // v8.16:scope 非 ALL 時先剝除既有 mode 前綴(與 helpers.extractModeScope 同規則),
    //   以 mode_scope 為唯一真相重組,避免雙重編碼。
    let m = cond.match(/^\s*mode\s+in\s+\[[^\]]*\]\s+AND\s+\((.+)\)\s*$/i)
         || cond.match(/^\s*mode\s*==\s*[A-Za-z_][A-Za-z0-9_]*\s+AND\s+\((.+)\)\s*$/i);
    if (m) cond = m[1].trim();
    else if (/^\s*mode\s+in\s+\[[^\]]*\]\s*$/i.test(cond) || /^\s*mode\s*==\s*[A-Za-z_][A-Za-z0-9_]*\s*$/.test(cond)) cond = '';
    else {
      m = cond.match(/^\s*mode\s+in\s+\[[^\]]*\]\s+AND\s+(.+)$/i)
       || cond.match(/^\s*mode\s*==\s*[A-Za-z_][A-Za-z0-9_]*\s+AND\s+(.+)$/i);
      if (m) cond = m[1].trim();
    }
    const parts = ms.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const prefix = `mode in [${parts.join(', ')}]`;
      return cond ? `${prefix} AND (${cond})` : prefix;
    }
    if (!cond) return `mode == ${ms}`;
    return `mode == ${ms} AND (${cond})`;
  }

  // value 編碼 — 對齊後端 condition_parser._parse_value 反推
  function _encodeActionValue(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) return '[' + v.map(_encodeActionValue).join(',') + ']';
    if (typeof v === 'object') {
      const pairs = Object.entries(v).map(([k, vv]) => `${k}:${_encodeActionValue(vv)}`);
      return '{' + pairs.join(',') + '}';
    }
    const s = String(v);
    if (/^[A-Za-z_][A-Za-z0-9_\.]*$/.test(s)) return s;
    if (/^-?\d+(\.\d+)?$/.test(s)) return s;
    return '"' + s.replace(/"/g, '\\"') + '"';
  }

  // 把單一 action 物件編成後端認得的 DSL 片段
  function _encodeAction(act) {
    if (!act || !act.atype) return '';
    const params = act.params || {};
    const keys = Object.keys(params).filter(k => params[k] !== '' && params[k] != null);
    const pairs = keys.map(k => `${k}=${_encodeActionValue(params[k])}`);
    return `${act.atype}(${pairs.join(', ')})`;
  }

  // actions list → DSL 字串(分號分隔多個 action)
  function _buildActionsDSL(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return '';
    return actions.filter(a => a && a.atype).map(_encodeAction).join('; ');
  }

  // v6.3 / Q3:由「符號 mult_values/prize_values + 模式 progress_ladder」反推。
  //   回傳 { perSymbol, legacy }。legacy 為 best-effort 對應舊 15/16 格式(只能表達單一
  //   WILD / RANDOM / COIN 來源;完整資料以 15b_Symbol_Mults 為權威)。
  function _deriveSymbolMults(syms, modes) {
    const list = Array.isArray(syms) ? syms.filter(s => s && s.enabled !== false) : [];
    const sidOf = (s) => (s.symbol_id && String(s.symbol_id).trim()) || s.name || ('#' + s.number);
    const normMults = (a) => (Array.isArray(a) ? a : [])
      .map(v => ({
        mult: Number(v.mult) || 0, weight: Number(v.weight) || 0,
        // v8.3 / R1 D-13:MULT 比照 PRIZE 帶 per-mode 權重(「NG 無乘數、FG 才有」宣告式)
        weight_by_mode: (v.weight_by_mode && typeof v.weight_by_mode === 'object') ? v.weight_by_mode : {},
      }))
      .filter(v => v.mult > 0);
    const normPrizes = (a) => (Array.isArray(a) ? a : [])
      .map(v => ({
        value: Number(v.value) || 0,
        weight: Number(v.weight) || 0,
        link_jackpot: (v.link_jackpot != null ? String(v.link_jackpot) : ''),
        weight_by_mode: (v.weight_by_mode && typeof v.weight_by_mode === 'object') ? v.weight_by_mode : {},
      }))
      .filter(v => v.value > 0 || v.link_jackpot);

    const perSymbol = [];
    for (const s of list) {
      const mults = normMults(s.mult_values);
      const prizes = normPrizes(s.prize_values);
      if (mults.length || prizes.length) {
        perSymbol.push({ sid: sidOf(s), name: s.name || '', is_wild: !!s.is_wild || s.type === 'WILD', mults, prizes });
      }
    }

    // legacy best-effort:取首個 wild / 首個非 wild / 首個帶 prize 的符號
    const wildSym = perSymbol.find(p => p.is_wild && p.mults.length);
    const randSym = perSymbol.find(p => !p.is_wild && p.mults.length);
    const coinSym = perSymbol.find(p => p.prizes.length);

    const ladders = {};
    let progressReset = true, progressEnabled = false, resetSet = false;
    for (const m of (Array.isArray(modes) ? modes : [])) {
      const arr = Array.isArray(m.progress_ladder)
        ? m.progress_ladder.map(Number).filter(n => !isNaN(n) && n > 0) : [];
      if (arr.length) {
        ladders[m.mode] = arr;
        progressEnabled = true;
        if (!resetSet) { progressReset = m.progress_reset !== false; resetSet = true; }
      }
    }

    return {
      perSymbol,
      legacy: {
        wild_enabled: !!wildSym,
        wild_values: wildSym ? wildSym.mults : [],
        random_enabled: !!randSym,
        random_symbol_id: randSym ? randSym.sid : '',
        random_values: randSym ? randSym.mults : [],
        progress_enabled: progressEnabled,
        progress_reset: progressReset,
        progress_ladders: ladders,
        coin_enabled: !!coinSym,
        coin_symbol_id: coinSym ? coinSym.sid : 'COIN',
        denoms: coinSym ? coinSym.prizes : [],
      },
    };
  }

  // ════════════════════════════════════════════════════════════════════
  //  公開:從 localStorage 直接生 A.xlsx ArrayBuffer
  //  讓 SimPage 等其他 component 可以拿來餵 Pyodide,不必經過實體檔案
  // ════════════════════════════════════════════════════════════════════
  async function buildAxlsxBufferFromLS() {
    if (typeof window.ExcelJS === 'undefined') {
      throw new Error('ExcelJS 未載入');
    }

    // 架構檢閱 #2(記憶體優先讀取):config-editor 的欄位變更是先寫 reactive state、
    // 再走 400ms debounce 才落地到 LS(效能考量,見 setup.js scheduleSave)。
    // 這裡是全站「唯一」讀 LS 生 A.xlsx 的入口(setup.js 匯出按鈕 / config-compare.js
    // 皆呼叫此函式),故在讀 LS 前呼叫 flushPendingSaves() 強制把佇列中的變更立即落地,
    // 修掉「剛編輯完馬上匯出/比對,讀到舊值」的競態。config-editor 元件未掛載時
    // (例如從其他頁面呼叫)flushPendingSaves 不存在,直接略過即可(LS 本來就是最新)。
    try { window.SlotPlanner && window.SlotPlanner.flushPendingSaves && window.SlotPlanner.flushPendingSaves(); }
    catch (e) { console.warn('[buildAxlsxBufferFromLS] flushPendingSaves failed:', e); }

    // ── 從 LS 讀取所有資料(用 JSON parse 並提供 fallback)──
    function readLS(key, def) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return def;
        const parsed = JSON.parse(raw);
        return parsed != null ? parsed : def;
      } catch (e) {
        console.warn(`[buildAxlsxBufferFromLS] read ${key} failed:`, e);
        return def;
      }
    }

    const g           = readLS('slotplanner.aconfig.global.v1',       {});
    const modes       = readLS('slotplanner.aconfig.modes.v1',        []);
    const layoutRows  = readLS('slotplanner.aconfig.layout.v1',       []);
    const panelRows   = readLS('slotplanner.aconfig.panels.v1',       []);   // v4.7
    const symbolSets  = readLS('slotplanner.aconfig.symbolsets.v1',   {});   // v4.7
    const bins        = readLS('slotplanner.aconfig.bins.v1',         {});
    const paylines    = readLS('slotplanner.aconfig.paylines.v1',     []);
    const constraints = readLS('slotplanner.aconfig.constraints.v1',  []);
    const reelWeights = readLS('slotplanner.aconfig.reelweights.v1',  {});
    const gridWeights = readLS('slotplanner.aconfig.gridweights.v1',  {});
    const comboWeights= readLS('slotplanner.aconfig.comboweights.v1', {});
    const discards    = readLS('slotplanner.aconfig.discards.v1',     []);
    const rules       = readLS('slotplanner.aconfig.rules.v1',        []);
    const jackpots    = readLS('slotplanner.aconfig.jackpots.v1',     []);   // v5.1
    const betConfig   = readLS('slotplanner.aconfig.betconfig.v1',   {});  // v5.3
    const reelStrips  = readLS('slotplanner.aconfig.reelstrips.v1',   {});  // v6.0-b
    const reelLinks   = readLS('slotplanner.aconfig.reellinks.v1',    []);   // v8.38 GAP-T1(30 授權新 key)
    const multipliers = readLS('slotplanner.aconfig.multipliers.v1', {});  // v5.4
    const coinValues  = readLS('slotplanner.aconfig.coinvalues.v1',  {});  // v5.4
    const genLimits   = readLS('slotplanner.aconfig.genLimits.v1',   []);  // v7.11
    const genConstraints = readLS('slotplanner.aconfig.genConstraints.v1', []);  // §4.8/§4.9
    const registryRaw = readLS('slotplanner.registry.v1',             { symbols: [] });
    const symbolGroups = readLS('slotplanner.aconfig.symbolgroups.v1', []);   // P0-3
    const jackpotCfg   = readLS('slotplanner.aconfig.jackpot.v1',     {});  // v8.25 G4:獎池級距

    const modeNames = modes.map(m => m.mode).filter(Boolean);
    const layoutLength = layoutRows.length;

    // ── 建 workbook ──
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'SlotPlanner Pro';
    wb.created = new Date();

    const stamp = new Date().toLocaleString('zh-TW');
    const boldHdr = (ws) => { ws.getRow(1).font = { bold: true, color: { argb: 'FF5A3DB0' } }; };
    const setCols = (ws, widths) => { ws.columns = widths.map(w => ({ width: w })); };

    // 00_README
    const wsR = wb.addWorksheet('00_README');
    wsR.addRows([
      ['SlotPlanner Pro · A 設定檔'],
      [`匯出時間:${stamp}`],
      [`匯出來源:模擬引擎(in-memory 直接餵 Pyodide,不下載檔案)`],
      [],
      ['分頁列表'],
      ['01_Global', '全域設定'],
      ['02_Layout', '盤面結構'],
      ['03_Symbols', '符號清單'],
      ['03c_Paytable', '動態賠付表(v5.3;優先於 03_Symbols Pay_Nx;v8.3 支援 Count_From/To 區間同賠)'],
      ['03d_Symbol_Groups', '符號家族(P0-3;ANY BAR 型混合賠付;成員由 03_Symbols.Group_ID 反查;規格描述)'],
      ['03e_Symbol_Group_Pays', '家族 per-mode 費率覆寫(P0-3;每列一筆 家族×模式;無列則沿用 03d base)'],
      ['03f_Symbol_Appearance', '符號逐模式出現覆寫(§2.5;選用;每列 符號×模式×出現輪×上限;僅有覆寫者;供下游模擬工具,本工具不執行)'],
      ['04_Reel_Weights', 'Reel 權重'],
      ['04b_Reel_Strips', '真實輪帶(v6.0-b:實體序列;啟用時引擎用視窗抽樣;選用)'],
      ['02c_Tracks', '軌道(v8.39 GAP-F1:純幾何有序格子序列;補盤/走位/捲軸共用;選用)'],
      ['04c_Reel_Links', '輪帶連動(v8.38 GAP-T1:每局隨機抽連動組;CLONE/MIRROR;選用)'],
      ['05_Grid_Size_Weights', '格數權重'],
      ['05b_Mode_Grid_Range', '逐模式逐輪可變列(Megaways;僅顯式設定的模式)'],
      ['06_Paylines', '中獎線'],
      ['07_Constraints', '硬約束'],
      ['07b_Gen_Limits', '產牌限制 / 生成期約束(v7.11;選用;長格式 符號×zone×min/max;供下游模擬工具,本工具不執行)'],
      ['07c_Gen_Constraints', '關聯型產牌條件(§4.8/§4.9;選用;多符號合計 / 位置關係 / 盤面狀態 + 巢狀例外;供下游模擬工具,本工具不執行)'],
      ['08_Combo_Weights', '連爆權重'],
      ['09_Puzzle_Rules', '腳本規則(v8.4:含描述型 action 七種與 Random_Group 隨機擇一,執行語意由下游模擬工具實作)'],
      ['10_Discard_Rules', '棄牌規則'],
      ['11_Mode_Config', '模式設定'],
      ['11b_Mode_TriggerPays', '各模式 scatter-pay 觸發給付(v7.10;選用;引擎尚未消費,Stage 3 接)'],
      ['11c_Mode_Items', '各模式 bonus 小遊戲獎項表(v7.14;WHEEL/PICK/COLLECT;選用;引擎不消費)'],
      ['12_Distribution_Bins', '分佈區間'],
      ['13_Jackpots', 'JP 定義(選用;引擎忽略,供文件/前端使用)'],
      ['14_Bet_Config', '投注結構(v5.3:Ante Bet + Buy Feature;選用;引擎讀取)'],
      ['02d_Cell_Attributes', '位置型格子屬性(v8.8;固定格乘數/enhancer/金框;規格描述)'],
      ['14b_RTP_Variants', '多市場 RTP 出證版本 + 市場別注限(v8.6;規格描述)'],
      ['18_Gamble', '比倍設定(v8.6;規格描述,執行歸下游)'],
      ['19_Jackpot_Tiers', '獎池級距 + 觸發方式(v8.25;Grand/Major/Minor/Mini;只描述級距與觸發,不模擬命中率)'],
      ['21_Collection_Meters', '收集條 / 進度條(架構檢閱#21;填充來源+容量+歸零範圍+集滿動作;只描述,不模擬)'],
      ['15_Multipliers', '倍數系統(v5.4:Wild/Progress/Random;選用;引擎讀取)'],
      ['15b_Symbol_Mults', '符號倍數/彩金 權威表(v6.3:Kind=MULT/PRIZE;選用;前端權威)'],
      ['16_Coin_Values', '金幣面額(v5.4:Hold&Win;選用;引擎讀取)'],
    ]);
    wsR.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF5A3DB0' } };
    setCols(wsR, [28, 50]);

    // 01_Global
    const wsG = wb.addWorksheet('01_Global');
    wsG.addRow(['Key', 'Value', 'Notes']);
    for (const [k, v] of Object.entries(g)) wsG.addRow([k, v, '']);
    boldHdr(wsG); setCols(wsG, [22, 28, 36]);

    // 02_Layout
    // v7.5-Layer C:尾端新增第 10 欄 Cells(主輪活格遮罩 "0,dy" 以 ';' 串接;空 = 實心欄)。
    //   前 9 欄順序/內容不動;a_loader.py 以欄名 .get 讀取,缺欄 → None(additive 契約,守則 #81)。
    const wsL = wb.addWorksheet('02_Layout');
    wsL.addRow(['Reel_ID', 'Y_Offset', 'Max_Rows', 'Has_SubReel',
                'SubReel_Position', 'SubReel_Rows', 'SubReel_Inherit_Weight', 'SubReel_Kind',
                'SubReel_Symbol_Set', 'Cells', 'Entry_Mode', 'Scroll_Dir']);
    for (const r of layoutRows) {
      // v7.5-Layer C:cells 為 ["0,dy",…] 或 null(實心欄)。null/空 → 空字串。
      const reelCellsStr = (Array.isArray(r.cells) && r.cells.length) ? r.cells.join(';') : '';
      const _em = r.entry_mode || 'SCROLL';                                  // #3 逐輪進場/滾動(additive)
      const _sd = _em === 'SPAWN' ? 'NONE' : (r.scroll_dir || 'DOWN');       // SPAWN 無方向
      wsL.addRow([r.reel_id, r.y_offset, r.max_rows, r.has_subreel,
                  r.subreel_position, r.subreel_rows, r.subreel_inherit_weight,
                  r.subreel_kind || 'STACK',
                  r.subreel_symbol_set || '',   // v5.1:契約加法欄
                  reelCellsStr,                 // v7.5-Layer C:契約加法欄
                  _em, _sd]);                   // #3:契約加法欄(進場方式 / 滾動方向;純描述,供 docgen / 下游)
    }
    boldHdr(wsL); setCols(wsL, [10, 10, 10, 13, 18, 14, 22, 14, 20, 22, 12, 12]);

    // 02b_Panels(v4.7:自由副盤;無 panel → 仍寫表頭，引擎讀到空 → panels=[])
    // v7.x Layer B:尾端新增第 15 欄 Cells(活格遮罩 "dx,dy" 以 ';' 串接;空 = 整塊矩形)。
    //   前 14 欄順序/內容不動;a_loader.py 以欄名 .get 讀取,缺欄 → None(additive 契約)。
    const wsPnl = wb.addWorksheet("02b_Panels");
    wsPnl.addRow(['Panel_ID', 'Col', 'Row', 'Width', 'Height',
                'Scroll', 'Symbol_Set', 'Inherit_Weight', 'Join_Payline', 'Note',
                'Panel_Type', 'Trigger_Symbol', 'Collect_Target_JP', 'Trigger_Reel', 'Cells',
                'Scroll_Track', 'Scroll_Step',   // v8.39 軌道:尾端 additive('' / 1 = 現行隱含語意)
                'Active_Modes', 'Eval_Domain', 'Payline_Set']);   // v8.44 C-2:尾端 additive('' = 現行為)
    for (const p of (Array.isArray(panelRows) ? panelRows : [])) {
      if (!p || !p.panel_id) continue;
      // v6.2:Scroll 由 panel_type 推導(向後相容:無 panel_type 時用舊 scroll)
      const ptype = p.panel_type || (p.scroll === false ? 'COLLECT' : 'SCROLL');
      // v7.x:cells 為 ["dx,dy",…] 或 null(整塊矩形)。null/空 → 空字串(與 maskToStr 一致)。
      const cellsStr = (Array.isArray(p.cells) && p.cells.length) ? p.cells.join(';') : '';
      wsPnl.addRow([
        p.panel_id, p.col || 0, p.row || 0, p.width || 3, p.height || 3,
        (ptype === 'SCROLL'), p.symbol_set || '', !!p.inherit_weight, !!p.join_payline, p.note || '',
        ptype, p.trigger_symbol || '', p.collect_target_jp || '', Number(p.trigger_reel) || 0, cellsStr,
        (p.scroll_track != null ? String(p.scroll_track).trim() : ''),          // v8.39 軌道
        (p.scroll_step != null ? Number(p.scroll_step) || 0 : 1),               // v8.39 軌道
        (p.active_modes != null ? String(p.active_modes).trim() : ''),          // v8.44 C-2
        (p.eval_domain  != null ? String(p.eval_domain).trim()  : ''),          // v8.44 C-2
        (p.payline_set  != null ? String(p.payline_set).trim()  : ''),          // v8.44 C-2
      ]);
    }
    boldHdr(wsPnl); setCols(wsPnl, [14, 8, 8, 9, 9, 10, 16, 15, 14, 20, 12, 16, 16, 12, 22]);

    // 02c_Tracks(v8.39 / GAP-F1+軌道 Phase 1:Track = 純幾何有序格子序列;additive 新表,
    //   舊下游不讀此表 = 無軌道。消費端引用 track_id:01.Refill_Track / 11.Refill_Track_Override /
    //   02b.Scroll_Track / 01.Scroll_Track / WALK(track=)。by-name 讀。)
    {
      const wsTk = wb.addWorksheet('02c_Tracks');
      wsTk.addRow(['Track_ID', 'Scope', 'Cells', 'Entry', 'Notes']);
      const tks = readLS('slotplanner.aconfig.tracks.v1', []);
      for (const t of (Array.isArray(tks) ? tks : [])) {
        const tid = (t && t.track_id != null ? String(t.track_id).trim() : '');
        if (!tid) continue;
        wsTk.addRow([
          tid,
          (t.scope != null && String(t.scope).trim()) ? String(t.scope).trim() : 'MAIN',
          (t.cells != null ? String(t.cells).trim() : ''),
          (t.entry != null && String(t.entry).trim()) ? String(t.entry).trim().toUpperCase() : 'START',
          (t.notes != null ? String(t.notes) : ''),
        ]);
      }
      boldHdr(wsTk); setCols(wsTk, [10, 14, 60, 9, 26]);
    }

    // 03b_Symbol_Sets(v4.7:符號集 D;{set: [sym,...]} 攤平成多列)
    const wsSS = wb.addWorksheet('03b_Symbol_Sets');
    wsSS.addRow(['Set_Name', 'Symbol_ID']);
    if (symbolSets && typeof symbolSets === 'object') {
      for (const [setName, members] of Object.entries(symbolSets)) {
        if (!Array.isArray(members)) continue;
        for (const sid of members) {
          if (sid) wsSS.addRow([setName, sid]);
        }
      }
    }
    boldHdr(wsSS); setCols(wsSS, [18, 16]);

    // 03_Symbols(含擴充欄位)
    // v8.8 / R4 B-6:02d_Cell_Attributes(位置型格子屬性;additive 新 sheet)
    //   一列 = 一格 × 一屬性;座標 1-based 對齊 06_Paylines。舊檔無此 sheet → loader 安全降級 []。
    //   LS key:slotplanner.aconfig.cellattrs.v1(v8.8 新增,已納快照)。
    {
      const cas = readLS('slotplanner.aconfig.cellattrs.v1', []) || [];
      const wsCA = wb.addWorksheet('02d_Cell_Attributes');
      // v8.49 / 缺口4:尾端 additive 加 Cap_Value(格位數值上限;前 7 欄不動;
      //          "" = 無上限,安全降級;Sugar Rush 式「格位倍數逐次翻倍,封頂128x」用此欄)。
      wsCA.addRow(['Attr_ID', 'Reel', 'Row', 'Attr', 'Value', 'Mode_Scope', 'Notes', 'Cap_Value']);
      for (const ca of (Array.isArray(cas) ? cas : [])) {
        if (!ca || !String(ca.attr_id || '').trim()) continue;
        wsCA.addRow([ca.attr_id, Number(ca.reel) || 1, Number(ca.row) || 1,
                     ca.attr || 'MULT', ca.value || '', ca.mode_scope || 'ALL', ca.notes || '',
                     ca.cap_value || '']);
      }
      boldHdr(wsCA); setCols(wsCA, [10, 8, 8, 12, 14, 14, 30, 12]);
    }

    const wsS = wb.addWorksheet('03_Symbols');
    wsS.addRow([
      'Symbol_ID', 'Display_Name', 'Number', 'Type',
      'Pay_3x', 'Pay_4x', 'Pay_5x', 'Pay_6x',
      'Mega_W', 'Mega_H', 'Is_Wild', 'Is_Scatter',
      'Weight', 'Max_Count', 'Use_Max', 'Reel_Limit',
      'Mode_Scope',   // v8.3 / R1 D-12:出現模式宣告(逗號分隔;空=所有模式);尾端 additive
      'Instance_Mult',// v8.7 / R6 D-14:per-instance 乘數宣告;尾端 additive
      'Min_Match',    // P0-2:最少連線(達此數才成立;預設 3,可覆寫 1/2);尾端 additive
      'Group_ID',     // P0-3:所屬符號家族 ID(空=不屬任何家族);尾端 additive
      'Mega_Sizes',   // v8.35 / GAP-H1:per-landing 尺寸分佈 "1:80;2:15;3:4";尾端 additive('' = 固定 mega_w/h)
      'Wild_Behavior', // 架構檢閱 #6:Wild 行為分類('' = 標準/EXPANDING/WALKING/STICKY/MULTIPLIER);尾端 additive
    ]);
    const syms = Array.isArray(registryRaw.symbols) ? registryRaw.symbols : [];
    // v4.0 / #13:停用(enabled === false)的符號不匯出;同時建立啟用 id 集合供 04/08 過濾,
    //   id 解析方式對齊前端權重 key(symbol_id 優先,否則 name)
    const enabledIds = new Set();
    for (const s of syms) {
      if (s.enabled === false) continue;
      const id = (s.symbol_id && s.symbol_id.trim()) || s.name;
      if (id) enabledIds.add(id);
    }
    for (const s of syms) {
      if (s.enabled === false) continue;   // 停用符號不寫入 03_Symbols
      const sid = s.symbol_id || s.name || `#${s.number}`;
      wsS.addRow([
        sid, s.name || '', s.number || '', _symTypeToEnum(s.type),
        s.pay_3x || 0, s.pay_4x || 0, s.pay_5x || 0, s.pay_6x || 0,
        s.mega_w || 1, s.mega_h || 1, !!s.is_wild, !!s.is_scatter,
        s.weight || 0, s.max_count || 0, !!s.use_max,
        Array.isArray(s.reel_limit) ? s.reel_limit.join(',') : '',
        (s.mode_scope != null ? String(s.mode_scope) : ''),   // v8.3 D-12
        s.instance_mult === true,                              // v8.7 D-14
        Math.max(1, Number(s.min_match) || 3),                 // P0-2(空/舊資料→3)
        (s.group_id != null ? String(s.group_id).trim() : ''), // P0-3
        (s.mega_sizes != null ? String(s.mega_sizes).trim() : ''), // v8.35 GAP-H1(原樣字串)
        (s.wild_behavior != null ? String(s.wild_behavior).trim().toUpperCase() : ''), // 架構檢閱 #6
      ]);
    }
    boldHdr(wsS); setCols(wsS, [14, 16, 10, 12, 10, 10, 10, 10, 9, 9, 10, 11, 10, 12, 10, 18, 14, 12, 10, 14, 18, 14]);

    // 03f_Symbol_Appearance(§2.5:依模式分別設定;逐模式出現輪 / 上限;僅有 per-mode 覆寫的符號寫入;
    //   Reel_Limit 對齊 03_Symbols 編碼(bool 陣列 join);供下游模擬工具,本工具不執行、不回填、a_loader 不讀。additive:舊檔無此表 → 無逐模式覆寫)
    const wsAM = wb.addWorksheet('03f_Symbol_Appearance');
    wsAM.addRow(['Symbol_ID', 'Mode', 'Reel_Limit', 'Max_Count', 'Notes']);
    for (const s of syms) {
      if (s.enabled === false) continue;
      if (!s.appear_per_mode || !s.appear_by_mode || typeof s.appear_by_mode !== 'object') continue;
      const sid = s.symbol_id || s.name || `#${s.number}`;
      for (const mn of Object.keys(s.appear_by_mode)) {
        const e = s.appear_by_mode[mn] || {};
        wsAM.addRow([
          sid, mn,
          Array.isArray(e.reel_limit) ? e.reel_limit.join(',') : '',
          (e.max_count != null ? e.max_count : 0),
          '',
        ]);
      }
    }
    boldHdr(wsAM); setCols(wsAM, [14, 12, 26, 10, 20]);

    // 03c_Paytable(v5.3:動態賠付表)
    // v8.3 / R1 A-1:尾端 additive 加 Count_From / Count_To(count 區間同賠)。
    //   Count 保留 = 區間起點(舊 loader 至少讀到 from 單點,安全降級);
    //   單點列 From=To=Count。前 3 欄順序/內容不動。
    const wsPaytable = wb.addWorksheet('03c_Paytable');
    wsPaytable.addRow(['Symbol_ID', 'Count', 'Pay', 'Count_From', 'Count_To']);
    for (const s of syms) {
      if (s.enabled === false) continue;
      const sid = s.symbol_id || s.name || String(s.number || '');
      const rows = (Array.isArray(s.pay_rows) && s.pay_rows.length > 0)
        ? s.pay_rows
        : [2,3,4,5,6,7,8,9].filter(n => Number(s['pay_'+n+'x']) > 0)
                             .map(n => ({ count: n, pay: s['pay_'+n+'x'] }));
      for (const r of rows) {
        if (Number(r.pay) > 0) {
          const cFrom = Number(r.count);
          const cTo = (Number(r.count_to) > cFrom) ? Number(r.count_to) : cFrom;
          wsPaytable.addRow([sid, cFrom, Number(r.pay), cFrom, cTo]);
        }
      }
    }
    boldHdr(wsPaytable); setCols(wsPaytable, [16, 10, 12, 11, 11]);

    // 03d_Symbol_Groups(P0-3:符號家族 / ANY BAR 混合賠付;additive,舊檔無此 sheet → loader 降級 [])
    //   成員由 03_Symbols.Group_ID 反查(不在此表);inline 賠率 Pay_3x..6x。by-name 讀。
    {
      const wsSG = wb.addWorksheet('03d_Symbol_Groups');
      wsSG.addRow(['Group_ID', 'Display_Name', 'Match_Mode', 'Members_Keep_Individual',
                   'Mode_Scope', 'Pay_3x', 'Pay_4x', 'Pay_5x', 'Pay_6x', 'Notes']);
      const groups = Array.isArray(symbolGroups) ? symbolGroups : [];
      for (const g0 of groups) {
        const gid = (g0 && g0.group_id != null ? String(g0.group_id).trim() : '');
        if (!gid) continue;   // 空 Group_ID 不寫入
        const pt = (g0 && g0.pay_table && typeof g0.pay_table === 'object') ? g0.pay_table : {};
        const payN = (n) => {
          const v = (g0 && g0['pay_' + n + 'x'] != null) ? g0['pay_' + n + 'x'] : pt[n];
          return Number(v) || 0;
        };
        wsSG.addRow([
          gid,
          (g0.display_name != null && String(g0.display_name).trim()) ? String(g0.display_name).trim() : gid,
          (g0.match_mode != null ? String(g0.match_mode).trim() : '') || 'ANY_MIXED',
          g0.members_keep_individual !== false,   // 缺/非 false → true
          (g0.mode_scope != null ? String(g0.mode_scope).trim() : ''),
          payN(3), payN(4), payN(5), payN(6),
          (g0.notes != null ? String(g0.notes) : ''),
        ]);
      }
      boldHdr(wsSG); setCols(wsSG, [14, 16, 14, 22, 14, 10, 10, 10, 10, 22]);
    }

    // 03e_Symbol_Group_Pays(P0-3 進階:家族 per-mode 費率覆寫;additive,舊檔無 → loader 沿用 base)
    //   每列一筆 (家族, 模式) 覆寫;某模式無列 → 沿用 03d base。全 0 覆寫不寫入。
    {
      const wsGP = wb.addWorksheet('03e_Symbol_Group_Pays');
      wsGP.addRow(['Group_ID', 'Mode', 'Pay_3x', 'Pay_4x', 'Pay_5x', 'Pay_6x']);
      const groups = Array.isArray(symbolGroups) ? symbolGroups : [];
      for (const g0 of groups) {
        const gid = (g0 && g0.group_id != null ? String(g0.group_id).trim() : '');
        if (!gid) continue;
        const pbm = (g0 && g0.pay_by_mode && typeof g0.pay_by_mode === 'object') ? g0.pay_by_mode : {};
        for (const mk of Object.keys(pbm)) {
          const mode = String(mk).trim();
          if (!mode) continue;
          const row = pbm[mk] || {};
          const p3 = Number(row.pay_3x) || 0, p4 = Number(row.pay_4x) || 0,
                p5 = Number(row.pay_5x) || 0, p6 = Number(row.pay_6x) || 0;
          if (!(p3 || p4 || p5 || p6)) continue;   // 全 0 覆寫略過
          wsGP.addRow([gid, mode, p3, p4, p5, p6]);
        }
      }
      boldHdr(wsGP); setCols(wsGP, [14, 14, 10, 10, 10, 10]);
    }

    // 04_Reel_Weights(扁平化)
    const wsRW = wb.addWorksheet('04_Reel_Weights');
    wsRW.addRow(['Mode_Scope', 'Reel_ID', 'Symbol_ID', 'Weight', 'Notes']);
    for (const m of modeNames) {
      const e = reelWeights[m];
      if (!e || !Array.isArray(e.symbol_ids)) continue;
      for (let r = 1; r <= layoutLength; r++) {
        for (const sid of e.symbol_ids) {
          if (!enabledIds.has(sid)) continue;   // #13:停用符號的權重不匯出
          const w = e.weights ? e.weights[`${r}-${sid}`] : null;
          if (typeof w === 'number' && w > 0) {
            wsRW.addRow([m, r, sid, w, '']);
          }
        }
      }
    }
    // v4.8:副輪獨立權重(Reel_ID = "<n>.sub")。LS 結構:reelWeights[mode].sub_weights[`${rid}-${sid}`]
    //   只寫「has_subreel 且非沿用主輪」的 reel;a_loader 既有支援 .sub 後綴。
    for (const m of modeNames) {
      const e = reelWeights[m];
      if (!e || !e.sub_weights) continue;
      for (const r of layoutRows) {
        if (!r || !r.has_subreel || r.subreel_inherit_weight) continue;
        for (const sid of (e.symbol_ids || [])) {
          if (!enabledIds.has(sid)) continue;
          const w = e.sub_weights[`${r.reel_id}-${sid}`];
          if (typeof w === 'number' && w > 0) {
            wsRW.addRow([m, `${r.reel_id}.sub`, sid, w, 'subreel']);
          }
        }
      }
    }
    // v4.7:panel 權重(Reel_ID = panel_id)。LS 結構:reelWeights[mode].panel_weights[`${pid}-${sid}`]
    for (const m of modeNames) {
      const e = reelWeights[m];
      if (!e || !e.panel_weights) continue;
      for (const p of (Array.isArray(panelRows) ? panelRows : [])) {
        if (!p || !p.panel_id) continue;
        for (const sid of (e.symbol_ids || [])) {
          if (!enabledIds.has(sid)) continue;
          const w = e.panel_weights[`${p.panel_id}-${sid}`];
          if (typeof w === 'number' && w > 0) {
            wsRW.addRow([m, p.panel_id, sid, w, 'panel']);
          }
        }
      }
    }
    boldHdr(wsRW); setCols(wsRW, [12, 10, 14, 10, 24]);

    // 04b_Reel_Strips(v6.0-b:Mode_Scope / Reel_ID / Enabled / Strip_Sequence)
    //   逗號分隔的符號序列;空輪帶不寫列。Enabled 旗標寫在每列(讀取端取首列即可)。
    const wsStrip = wb.addWorksheet('04b_Reel_Strips');
    wsStrip.addRow(['Mode_Scope', 'Reel_ID', 'Enabled', 'Strip_Sequence']);
    {
      const rs = (typeof reelStrips === 'object' && reelStrips) ? reelStrips : {};
      const en = !!rs.enabled;
      const strips = (rs.strips && typeof rs.strips === 'object') ? rs.strips : {};
      for (const [mode, byReel] of Object.entries(strips)) {
        if (!byReel || typeof byReel !== 'object') continue;
        for (const [rid, arr] of Object.entries(byReel)) {
          if (!Array.isArray(arr) || !arr.length) continue;
          wsStrip.addRow([mode, Number(rid), en, arr.join(',')]);
        }
      }
    }
    boldHdr(wsStrip); setCols(wsStrip, [13, 9, 9, 80]);

    // 04c_Reel_Links(v8.38 / GAP-T1:輪帶連動;additive 新表,舊下游無此 sheet 讀取 → 無連動。
    //   一列 = 一個連動配置選項;每局在同 Mode_Scope 內依 Weight 抽一列;
    //   Reels 空 = 無連動選項;Link_Kind:CLONE 內容相同 / MIRROR 左右鏡射。by-name 讀。)
    {
      const wsRL = wb.addWorksheet('04c_Reel_Links');
      wsRL.addRow(['Link_ID', 'Mode_Scope', 'Reels', 'Weight', 'Link_Kind', 'Notes']);
      const links = Array.isArray(reelLinks) ? reelLinks : [];
      for (const l of links) {
        const lid = (l && l.link_id != null ? String(l.link_id).trim() : '');
        if (!lid) continue;
        wsRL.addRow([
          lid,
          (l.mode_scope != null && String(l.mode_scope).trim()) ? String(l.mode_scope).trim() : 'ALL',
          (l.reels != null ? String(l.reels).trim() : ''),
          Number(l.weight) || 0,
          (l.link_kind != null && String(l.link_kind).trim()) ? String(l.link_kind).trim().toUpperCase() : 'CLONE',
          (l.notes != null ? String(l.notes) : ''),
        ]);
      }
      boldHdr(wsRL); setCols(wsRL, [10, 13, 14, 9, 11, 26]);
    }

    // 05_Grid_Size_Weights(扁平化)
    const wsGW = wb.addWorksheet('05_Grid_Size_Weights');
    wsGW.addRow(['Mode_Scope', 'Reel_ID', 'Grid_Size', 'Weight', 'Notes']);
    for (const m of modeNames) {
      const e = gridWeights[m];
      if (!e || !Array.isArray(e.grid_sizes)) continue;
      for (let r = 1; r <= layoutLength; r++) {
        for (const sz of e.grid_sizes) {
          const w = e.weights ? e.weights[`${r}-${sz}`] : null;
          if (typeof w === 'number' && w > 0) {
            wsGW.addRow([m, r, sz, w, '']);
          }
        }
      }
    }
    boldHdr(wsGW); setCols(wsGW, [12, 10, 11, 10, 24]);

    // 05b_Mode_Grid_Range(§5.2:逐模式逐輪可變列 min–max)——
    //   只為 grid_explicit(或 reel_ranges 非空)的模式寫列;其餘不寫 → Python 由 05 + 02.Max_Rows 推導
    //   (舊檔零行為差,且免 JS/Python 推導不一致風險)。reel_ranges 有值 → 逐輪;否則 rows_variable 廣播
    //   [row_min,row_max];顯式固定 → [cap,cap]。全無顯式模式 → 略過此 sheet。
    {
      const capOf = {};
      const reelIds = [];
      for (const lr of layoutRows) {
        const rid = lr.reel_id;
        if (rid == null) continue;
        capOf[rid] = Math.max(1, Number(lr.max_rows) || 1);
        reelIds.push(rid);
      }
      const explicitModes = modes.filter(m =>
        m && (m.grid_explicit === true || (Array.isArray(m.reel_ranges) && m.reel_ranges.length > 0)));
      if (explicitModes.length && reelIds.length) {
        const wsGR = wb.addWorksheet('05b_Mode_Grid_Range');
        wsGR.addRow(['Mode', 'Reel_ID', 'Min_Rows', 'Max_Rows', 'Notes']);
        for (const m of explicitModes) {
          const rrMap = {};
          for (const x of (Array.isArray(m.reel_ranges) ? m.reel_ranges : [])) rrMap[x.reel_id] = x;
          for (const rid of reelIds) {
            const cap = capOf[rid] || 1;
            let lo, hi;
            if (rrMap[rid]) {                       // 逐輪覆寫
              hi = Math.max(1, Math.min(cap, Number(rrMap[rid].max_rows) || cap));
              lo = Math.max(1, Math.min(hi, Number(rrMap[rid].min_rows) || 1));
            } else if (m.rows_variable) {           // 廣播範圍
              hi = Math.max(1, Math.min(cap, Number(m.row_max) || cap));
              lo = Math.max(1, Math.min(hi, Number(m.row_min) || 1));
            } else {                                // 顯式固定 → 沿用該輪列數
              hi = cap; lo = cap;
            }
            wsGR.addRow([m.mode, rid, lo, hi, '']);
          }
        }
        boldHdr(wsGR); setCols(wsGR, [12, 10, 11, 11, 24]);
      }
    }

    // 06_Paylines
    const wsP = wb.addWorksheet('06_Paylines');
    // v8.1 bugfix:原誤寫 wsPaytable(中獎線被寫進 03c_Paytable、06_Paylines 恆空 → LINE 遊戲 round-trip 丟線)。
    wsP.addRow(['Line_ID', 'Path', 'Direction', 'Notes']);
    // v4.0 / #16:Direction 改全域設定(g.payline_direction);每行寫入相同值以維持後端逐行讀取相容
    const _plDir = (g && g.payline_direction) || 'LTR';
    for (const pl of paylines) wsP.addRow([pl.line_id, pl.path, _plDir, pl.notes]);
    boldHdr(wsP); setCols(wsP, [10, 44, 12, 28]);

    // 07_Constraints
    const wsC = wb.addWorksheet('07_Constraints');
    wsC.addRow(['Constraint_ID', 'Type', 'Symbol_ID', 'Reels_Allowed',
                'Max_Count_Global', 'Mode_Scope', 'Notes']);
    for (const c of constraints) {
      wsC.addRow([c.constraint_id, c.ctype, c.symbol_id, c.reels_allowed,
                  c.threshold, c.mode_scope, c.notes]);
    }
    boldHdr(wsC); setCols(wsC, [14, 16, 13, 16, 18, 13, 28]);

    // 07b_Gen_Limits(v7.11:產牌限制 / 生成期約束;長格式;additive)
    //   一列 = 一個符號 × 一個 zone × (min, max) × mode_scope。
    //   Zone:MAIN / SUB:<reel_id> / PANEL:<panel_id>。空 Max → 無上限;0 Min → 無下限。
    const wsGL = wb.addWorksheet('07b_Gen_Limits');
    wsGL.addRow(['Limit_ID', 'Symbol_ID', 'Zone', 'Min_Count', 'Max_Count', 'Mode_Scope', 'Notes']);
    for (const gl of (Array.isArray(genLimits) ? genLimits : [])) {
      if (!gl || !gl.limit_id) continue;
      wsGL.addRow([
        gl.limit_id,
        gl.symbol_id || '',
        gl.zone || 'MAIN',
        (gl.min_count != null && gl.min_count !== '') ? gl.min_count : 0,
        (gl.max_count != null && gl.max_count !== '') ? gl.max_count : '',
        gl.mode_scope || 'ALL',
        gl.notes || '',
      ]);
    }
    boldHdr(wsGL); setCols(wsGL, [14, 14, 16, 11, 11, 13, 28]);

    // 07c_Gen_Constraints(§4.8/§4.9:關聯型產牌條件;additive)
    //   一列 = 一條關聯條件。Ctype:sum 多符號合計 / pos 位置關係 / board 盤面狀態。
    //   Symbols:csv;Op:le/lt/eq/ge;Except:巢狀例外 JSON(連接子 + leaf/group,一層巢狀)或空。
    const wsGC = wb.addWorksheet('07c_Gen_Constraints');
    wsGC.addRow(['Constraint_ID', 'Enabled', 'Ctype', 'Symbols', 'Op', 'Value', 'Value_Type', 'Relation', 'Board_State', 'Except', 'Notes']);
    for (const gc of (Array.isArray(genConstraints) ? genConstraints : [])) {
      if (!gc || !gc.constraint_id) continue;
      wsGC.addRow([
        gc.constraint_id,
        (gc.enabled === false) ? 'FALSE' : 'TRUE',
        gc.ctype || 'sum',
        Array.isArray(gc.symbols) ? gc.symbols.join(',') : '',
        gc.op || 'le',
        (gc.value != null && gc.value !== '') ? gc.value : '',
        gc.value_type || 'fixed',
        gc.relation || '',
        gc.board_state || '',
        gc.except ? JSON.stringify(gc.except) : '',
        gc.notes || '',
      ]);
    }
    boldHdr(wsGC); setCols(wsGC, [16, 9, 8, 18, 6, 8, 11, 14, 14, 30, 24]);

    // 08_Combo_Weights(扁平化)
    const wsCW = wb.addWorksheet('08_Combo_Weights');
    wsCW.addRow(['Mode_Scope', 'Combo_Step', 'Reel_ID', 'Symbol_ID', 'Weight', 'Notes']);
    for (const m of modeNames) {
      const e = comboWeights[m];
      if (!e || !Array.isArray(e.steps)) continue;
      for (const step of e.steps) {
        for (let r = 1; r <= layoutLength; r++) {
          for (const sid of (e.symbol_ids || [])) {
            if (!enabledIds.has(sid)) continue;   // #13:停用符號的權重不匯出
            const w = e.weights ? e.weights[`${step}-${r}-${sid}`] : null;
            if (typeof w === 'number' && w > 0) {
              wsCW.addRow([m, step, r, sid, w, '']);
            }
          }
        }
      }
    }
    boldHdr(wsCW); setCols(wsCW, [12, 12, 10, 14, 10, 24]);

    // 09_Puzzle_Rules — 對齊後端 a_loader._parse_puzzle_rules 期望欄位
    //   schema: Rule_ID | Priority | Trigger | Condition | Actions | Emits | Enabled | Description
    //   Actions 欄用後端 condition_parser.parse_actions 認得的 DSL 格式
    //   若 rule.mode_scope !== 'ALL',會把 mode == X 自動合併到 Condition 前面
    const wsPR = wb.addWorksheet('09_Puzzle_Rules');
    // v8.4 / R2 P5:尾端 additive 加 Random_Group / Random_Weight(前 8 欄不動)
    // v8.21 / G1:尾端再 additive 加 Persistent(前 10 欄不動;規則層修飾子,每回合重跑)
    // v8.28 / 缺口A:尾端再 additive 加 Notes(補充判斷說明,自由文字;前 11 欄不動)。
    //          與 Description 分離:Description=人看的規則摘要;Notes=給前端/下游的判斷規則。
    // v8.49 / 缺口1:尾端再 additive 加 Fire_Chance(額外機率閘門;前 12 欄不動;
    //          1.0=100%=現行行為,安全預設;純機率直觸發如 Fortune Rabbit 用此欄)。
    wsPR.addRow(['Rule_ID', 'Priority', 'Trigger', 'Condition',
                 'Actions', 'Emits', 'Enabled', 'Description',
                 'Random_Group', 'Random_Weight', 'Persistent', 'Notes', 'Fire_Chance']);
    const sortedRules = [...rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    for (const r of sortedRules) {
      const condition = _composeConditionWithModeScope(r.mode_scope, r.condition);
      const actionsDSL = _buildActionsDSL(r.actions);
      const emitsStr = Array.isArray(r.emits) ? r.emits.join(',') : '';
      wsPR.addRow([
        r.rule_id || '',
        r.priority != null ? r.priority : 100,
        r.trigger || 'ON_GRID_GENERATED',
        condition,
        actionsDSL,
        emitsStr,
        r.enabled !== false ? 'TRUE' : 'FALSE',
        r.description || '',  // v8.29 / C-4:移除舊 notes fallback — v8.28 起 notes 已獨立
                              //   第 12 欄,回填會使 notes 汙染 Description 且 round-trip
                              //   後永久搬家,毀壞「Description=人看/Notes=下游」分離契約。
        r.random_group || '',                                            // v8.4 P5
        (r.random_group ? (Number(r.random_weight) || 100) : ''),        // v8.4 P5(無組不寫權重)
        r.persistent ? 'TRUE' : 'FALSE',                                 // v8.21 G1(規則層修飾子)
        r.notes || '',                                                   // v8.28 缺口A(補充判斷說明)
        (r.fire_chance != null ? Number(r.fire_chance) : 1),             // v8.49 缺口1(額外機率閘門)
      ]);
    }
    boldHdr(wsPR); setCols(wsPR, [12, 10, 22, 40, 50, 18, 10, 28, 14, 14, 12, 40, 12]);

    // 10_Discard_Rules
    const wsDR = wb.addWorksheet('10_Discard_Rules');
    wsDR.addRow(['Discard_ID', 'Discard_Kind', 'Mode_Scope', 'Condition', 'Notes', 'Enabled']);   // §4.10b:尾端 additive Enabled
    for (const d of discards) {
      wsDR.addRow([d.discard_id, d.discard_kind, d.mode_scope, d.condition, d.notes, d.enabled === false ? 'FALSE' : 'TRUE']);
    }
    boldHdr(wsDR); setCols(wsDR, [12, 14, 13, 36, 24, 10]);

    // 11_Mode_Config
    const wsM = wb.addWorksheet('11_Mode_Config');
    // v7.10:尾端 additive 新增 Reset_Scope(既有 6 欄順序/內容不動)
    // v7.14:D6 補匯出 Cap_Enabled/Cap_Value/Stack_Mode(loader 早已讀,匯出漏寫→round-trip 缺口修復);
    //        再尾端 additive 加 Mode_Kind/Wheel_Upgrade_To/Pick_Count/Collect_Target。
    //        前 7 欄順序/內容不動;loader 一律 by-name(.get),欄序不影響讀取。
    // v8.5 / R3:尾端 additive 加 Choice_Group / Respin_Base / Respin_Reset_On / Respin_Stop_Cond
    //          (玩家擇一 + Hold&Win respin 描述;前 14 欄順序/內容不動)。
    // v8.7 / R6 A-2:再尾端 additive 加 Pay_Type_Override(per-mode 賠付模型覆寫;前 18 欄不動)。
    // v8.22 / G3:再尾端 additive 加 Collect_Enabled/Respin_Reset_Symbol/Grid_Expand_In_Collect/
    //          Allow_Persistent(Hold&Win 設定面;前 19 欄順序/內容不動)。
    // v8.24 / G5:再尾端 additive 加 End_Condition(結構化結束謂詞;前 23 欄不動)。
    // v8.28 / 缺口B+C:再尾端 additive 加 Unlock_Requires(解鎖前提模式名清單)/
    //          Mult_Compose_Override(模式倍數複合覆寫;前 24 欄順序/內容不動)。
    wsM.addRow(['Mode', 'Trigger_Condition', 'Spin_Count', 'Inherit_Globals',
                'On_Enter_Reset_Vars', 'Notes', 'Reset_Scope',
                'Cap_Enabled', 'Cap_Value', 'Stack_Mode',
                'Mode_Kind', 'Wheel_Upgrade_To', 'Pick_Count', 'Collect_Target',
                'Choice_Group', 'Respin_Base', 'Respin_Reset_On', 'Respin_Stop_Cond',
                'Pay_Type_Override',
                'Collect_Enabled', 'Respin_Reset_Symbol', 'Grid_Expand_In_Collect', 'Allow_Persistent',
                'End_Condition',
                'Unlock_Requires', 'Mult_Compose_Override',
                'Refill_Track_Override',    // v8.39 GAP-F1:尾端 additive('' = 沿用全域)
                'Cascade_Enabled', 'Cascade_Max_Depth']);  // 架構檢閱 #6:尾端 additive(前 27 欄不動)
    for (const m of modes) {
      wsM.addRow([m.mode, m.trigger_condition, m.spin_count, m.inherit_globals,
                  m.on_enter_reset_vars, m.notes, m.reset_scope || '',
                  m.cap_enabled || '', m.cap_value || '', m.stack_mode || '',
                  m.mode_kind || 'SPIN', m.wheel_upgrade_to || '',
                  Number(m.pick_count) || 0, Number(m.collect_target) || 0,
                  m.choice_group || '', Number(m.respin_base) || 0,
                  m.respin_reset_on || '', m.respin_stop_cond || '',
                  m.pay_type_override || '',
                  m.collect_enabled ? 'TRUE' : 'FALSE',              // v8.22 G3
                  m.respin_reset_symbol || '',                       // v8.22 G3
                  m.grid_expand_in_collect ? 'TRUE' : 'FALSE',       // v8.22 G3
                  m.allow_persistent ? 'TRUE' : 'FALSE',             // v8.22 G3
                  m.end_condition || '',                             // v8.24 G5
                  (Array.isArray(m.unlock_requires) ? m.unlock_requires.join(',') : (m.unlock_requires || '')), // v8.28 缺口B
                  m.mult_compose_override || '',                     // v8.28 缺口C
                  m.refill_track_override || '',                     // v8.39 GAP-F1
                  m.cascade_enabled ? 'TRUE' : 'FALSE',               // 架構檢閱 #6
                  Number(m.cascade_max_depth) || 0]);                 // 架構檢閱 #6
    }
    boldHdr(wsM); setCols(wsM, [12, 32, 12, 16, 22, 28, 14, 12, 14, 12, 12, 16, 12, 14, 14, 12, 16, 22, 16, 14, 18, 20, 14, 28, 22, 20, 20, 16, 18]);

    // v7.10:11b_Mode_TriggerPays(scatter-pay 觸發給付;additive 新子表,additive 契約)
    //   舊檔無此 sheet → loader 安全降級為空清單。一個 mode 多列。
    const wsTP = wb.addWorksheet('11b_Mode_TriggerPays');
    wsTP.addRow(['Mode', 'Scatter_Count', 'Pay', 'Grants_Spins']);
    for (const m of modes) {
      for (const tp of (m.trigger_pays || [])) {
        wsTP.addRow([m.mode, tp.scatter_count || 0, tp.pay || 0, tp.grants_spins || 0]);
      }
    }
    boldHdr(wsTP); setCols(wsTP, [14, 14, 12, 14]);

    // v7.14:11c_Mode_Items(bonus 小遊戲獎項表;additive 新子表,long-format tidy)
    //   舊檔無此 sheet → loader 安全降級(各 mode.items 空)。一個 mode 多列(mode_kind != SPIN 才有)。
    const wsMI = wb.addWorksheet('11c_Mode_Items');
    // v8.22 / G3:尾端 additive 加 Item_Role(前 6 欄不動;COIN/COLLECTOR/MULTIPLIER/BOOST/JACKPOT)
    // v8.27 / 批8:再尾端 additive 加 Item_Link_Mode(item→模式連結;前 7 欄不動)
    wsMI.addRow(['Mode', 'Item_Label', 'Item_Value', 'Item_Weight', 'Item_Is_End', 'Item_Link_JP', 'Item_Role', 'Item_Link_Mode']);
    for (const m of modes) {
      for (const it of (m.items || [])) {
        wsMI.addRow([m.mode, it.label || '', Number(it.value) || 0,
                     Number(it.weight) || 0, !!it.is_end, it.link_jackpot || '',
                     it.item_role || '', it.link_mode || '']);
      }
    }
    boldHdr(wsMI); setCols(wsMI, [12, 16, 11, 11, 10, 12, 14, 16]);

    // 12_Distribution_Bins
    const wsB = wb.addWorksheet('12_Distribution_Bins');
    wsB.addRow(['Mode_Scope', 'Bin_Edges', 'Notes']);
    for (const [m, entry] of Object.entries(bins)) {
      wsB.addRow([m, entry.bin_edges, entry.notes]);
    }
    boldHdr(wsB); setCols(wsB, [13, 40, 28]);

    // 13_Jackpots(v5.1:選用分頁;契約加法。引擎不讀,供文件生成/前端使用。
    //   無 JP → 仍寫表頭,讀取端讀到空 → jackpots=[])
    const wsJ = wb.addWorksheet('13_Jackpots');
    // v5.2:Kind=FIXED/PROGRESSIVE;Multiplier 在 PROGRESSIVE 語義為起始彩池 seed(×注額)
    wsJ.addRow(['JP_ID', 'Name', 'Kind', 'Multiplier', 'Increment_Pct', 'Must_Hit_By',
                'Trigger_Desc', 'Trigger_Type', 'Accum_Pct', 'Accum_Mech', 'Collect_Prob', 'Collect_Enter',
                'Mode_Scope', 'Notes']);
    for (const j of (Array.isArray(jackpots) ? jackpots : [])) {
      if (!j || (!j.name && !j.jp_id)) continue;
      wsJ.addRow([j.jp_id || '', j.name || '', j.kind || 'FIXED', Number(j.mult) || 0,
                  Number(j.increment_pct) || 0, Number(j.must_hit_by) || 0,
                  j.trigger_desc || '', j.trigger_type || 'COLLECT',
                  Number(j.accum_pct) || 0, j.accum_mech || '',
                  Number(j.collect_prob) || 0, j.collect_enter || '',
                  j.mode_scope || 'ALL', j.notes || '']);
    }
    boldHdr(wsJ); setCols(wsJ, [10, 16, 13, 12, 13, 12, 26, 12, 11, 22, 12, 22, 14, 22]);

    // v8.25 / G4:19_Jackpot_Tiers(獎池級距 + 觸發方式;與 13_Jackpots 正交)
    //   舊檔無此 sheet → loader 安全降級([] + "")。LS key:slotplanner.aconfig.jackpot.v1(機主授權)。
    //   tidy:Tier|Label|Value|Jackpot_Trigger|Notes。Trigger 只寫在首列(其餘留空;loader 讀第一個非空)。
    {
      const jc = (typeof jackpotCfg === 'object' && jackpotCfg) ? jackpotCfg : {};
      const jtiers = Array.isArray(jc.tiers) ? jc.tiers : [];
      const jtrig = jc.trigger || '';
      const wsJT = wb.addWorksheet('19_Jackpot_Tiers');
      wsJT.addRow(['Tier', 'Label', 'Value', 'Jackpot_Trigger', 'Notes']);
      if (jtiers.length) {
        jtiers.forEach((t, i) => {
          if (!t) return;
          wsJT.addRow([t.tier || '', t.label || '', Number(t.value) || 0,
                       i === 0 ? jtrig : '',   // Trigger 只寫首列
                       t.notes || '']);
        });
      } else if (jtrig) {
        // 無級距但有觸發設定 → 仍寫一列承載 Trigger(Tier/Label 空,loader 略過級距但讀 trigger)
        wsJT.addRow(['', '', 0, jtrig, '']);
      }
      boldHdr(wsJT); setCols(wsJT, [10, 14, 12, 18, 24]);
    }

    // 架構檢閱 #21:21_Collection_Meters(收集條 / 進度條;additive 新表,舊下游不讀此表
    //   = 無收集條)。LS key:slotplanner.aconfig.meters.v1。by-name 讀。
    {
      const wsMt = wb.addWorksheet('21_Collection_Meters');
      wsMt.addRow(['Meter_ID', 'Label', 'Mode_Scope', 'Fill_Source', 'Fill_Amount', 'Capacity',
                   'Reset_Scope', 'On_Full_Action', 'Link_Jackpot', 'Carry_Over', 'Notes']);
      const mts = readLS('slotplanner.aconfig.meters.v1', []);
      for (const m of (Array.isArray(mts) ? mts : [])) {
        const mid = (m && m.meter_id != null ? String(m.meter_id).trim() : '');
        if (!mid) continue;
        wsMt.addRow([
          mid,
          (m.label != null ? String(m.label) : ''),
          (m.mode_scope != null && String(m.mode_scope).trim()) ? String(m.mode_scope).trim() : 'ALL',
          (m.fill_source != null ? String(m.fill_source).trim() : ''),
          Number(m.fill_amount) || 1,
          Number(m.capacity) || 0,
          (m.reset_scope != null && String(m.reset_scope).trim()) ? String(m.reset_scope).trim().toUpperCase() : 'FEATURE',
          (m.on_full_action != null ? String(m.on_full_action).trim() : ''),
          (m.link_jackpot != null ? String(m.link_jackpot).trim() : ''),
          !!m.carry_over,
          (m.notes != null ? String(m.notes) : ''),
        ]);
      }
      boldHdr(wsMt); setCols(wsMt, [10, 18, 14, 24, 12, 10, 12, 20, 14, 11, 24]);
    }

    // 14_Bet_Config(v5.3:選用分頁;引擎讀取。無 Buy Feature → 仍寫 Ante Bet 區塊 + 空清單)
    const wsBet = wb.addWorksheet('14_Bet_Config');
    const bc = typeof betConfig === 'object' && betConfig ? betConfig : {};
    // ── Ante Bet 區段 ──
    wsBet.addRow(['Key', 'Value', 'Notes']);
    wsBet.addRow(['Ante_Bet_Enabled',      !!bc.ante_bet_enabled,           'true/false']);
    wsBet.addRow(['Ante_Bet_Mult',         Number(bc.ante_bet_mult) || 1.25, '成本倍數(×注額)']);
    wsBet.addRow(['Ante_Bet_Trigger_Mult', Number(bc.ante_bet_trigger_mult) || 2.0, 'SCAT 觸發倍率']);
    wsBet.addRow(['Ante_Bet_Desc',         bc.ante_bet_desc || '',           '企劃說明']);
    wsBet.addRow([]);   // 空行分隔
    // ── Buy Feature 清單 ──
    //   v8.6 / R5 E-15:表頭尾端 +Kind(DIRECT/BOOST_RATE/SUPER;前 6 欄不動)。
    wsBet.addRow(['BF_ID', 'Target_Mode', 'Cost_Mult', 'RTP_Target', 'Enabled', 'Notes', 'Kind']);
    for (const bf of (Array.isArray(bc.buy_features) ? bc.buy_features : [])) {
      if (!bf || !bf.bf_id) continue;
      wsBet.addRow([bf.bf_id, bf.target_mode || '', Number(bf.cost_mult) || 0,
                   Number(bf.rtp_target) || 0, bf.enabled !== false, bf.notes || '',
                   bf.kind || 'DIRECT']);
    }
    // v8.6 / R5 E-15:互斥 + Feature Drop——為維持 BF 區位置(Row6 表頭/Row7+ 列)不移動,
    //   新 KV 列一律附加在 sheet 尾端(空行分隔);loader 兩端(JS 匯入/Python)皆以 key 名攔截。
    wsBet.addRow([]);
    wsBet.addRow(['Ante_Buy_Exclusive',   !!bc.ante_buy_exclusive,   '加押與購買互斥(啟用加押時停用購買)']);
    wsBet.addRow(['Feature_Drop_Enabled', !!bc.feature_drop_enabled, 'Feature Drop 折抵購買成本']);
    wsBet.addRow(['Feature_Drop_Desc',    bc.feature_drop_desc || '', '折抵細節(自由文字)']);
    boldHdr(wsBet); setCols(wsBet, [22, 16, 12, 12, 10, 28, 12]);

    // v8.6 / R5 E-18:14b_RTP_Variants(多市場 RTP 出證版本 + 市場別注限;additive 新子表)
    //   舊檔無此 sheet → loader 安全降級為空清單。資料存於 betconfig.v1 內(無新 LS key)。
    const wsRV = wb.addWorksheet('14b_RTP_Variants');
    wsRV.addRow(['Variant', 'Target_RTP', 'Max_Bet', 'Notes']);
    for (const rv of (Array.isArray(bc.rtp_variants) ? bc.rtp_variants : [])) {
      if (!rv || !String(rv.variant || '').trim()) continue;
      wsRV.addRow([rv.variant, Number(rv.target_rtp) || 0, Number(rv.max_bet) || 0, rv.notes || '']);
    }
    boldHdr(wsRV); setCols(wsRV, [18, 12, 12, 32]);

    // v8.6 / R5 E-16:18_Gamble(比倍;KV 式 Key/Value/Notes;additive 新 sheet)
    //   舊檔無此 sheet → loader 安全降級(預設停用)。LS key:slotplanner.aconfig.gamble.v1(v8.6 新增,已納快照)。
    {
      const gm = readLS('slotplanner.aconfig.gamble.v1', {}) || {};
      const wsG = wb.addWorksheet('18_Gamble');
      wsG.addRow(['Key', 'Value', 'Notes']);
      wsG.addRow(['Gamble_Enabled',   !!gm.enabled,                       'true/false']);
      wsG.addRow(['Gamble_Type',      gm.gamble_type || 'CARD_COLOR',     'CARD_COLOR/CARD_SUIT/LADDER/WHEEL/CUSTOM']);
      wsG.addRow(['Type_Desc',        gm.type_desc || '',                 '型式補充(LADDER 階梯 / CUSTOM 描述)']);
      wsG.addRow(['Win_Mult_Options', gm.win_mult_options || '2',         '可選倍數(逗號分隔,如 2,4)']);
      wsG.addRow(['Max_Rounds',       Number(gm.max_rounds) || 0,         '最大連續比倍次數(0=無限)']);
      wsG.addRow(['Cap_Mult',         Number(gm.cap_mult) || 0,           '封頂 ×注額(0=無)']);
      wsG.addRow(['Applies_To',       gm.applies_to || 'ALL_WINS',        'ALL_WINS/BELOW_LIMIT']);
      wsG.addRow(['Applies_Limit',    Number(gm.applies_limit) || 0,      'BELOW_LIMIT 門檻 ×注額']);
      wsG.addRow(['Collect_Anytime',  gm.collect_anytime !== false,       '可隨時收下']);
      // v8.23 / G2 比倍補強:非現金賭注/獎勵(additive KV;缺 → 預設,向後相容)
      wsG.addRow(['Stake_Type',       gm.stake_type || 'WIN',             'WIN/FREE_SPINS/BONUS_ENTRY/BONUS_LEVEL']);
      wsG.addRow(['Reward_Type',      gm.reward_type || 'MULTIPLY_WIN',   'MULTIPLY_WIN/ADD_SPINS/ENTER_BONUS/UPGRADE_LEVEL']);
      wsG.addRow(['Trigger',          gm.gamble_trigger || '',            '何時可比倍(自由描述,如 ON_ANY_WIN/BONUS_END)']);
      wsG.addRow(['Notes',            gm.notes || '',                     '']);
      boldHdr(wsG); setCols(wsG, [20, 22, 40]);
    }

    // 15_Multipliers(v5.4:三段 — WILD / PROGRESS / RANDOM。引擎讀取;選用分頁)
    //   v6.3 / Q3:來源改由符號/模式反推;符號無資料時 fallback 舊 multipliers 物件(遷移前相容)。
    const derivedMults = _deriveSymbolMults(syms, modes);
    const mpRaw = (typeof multipliers === 'object' && multipliers) ? multipliers : {};
    const dl = derivedMults.legacy;
    const useDerived = dl.wild_enabled || dl.random_enabled || dl.progress_enabled || dl.coin_enabled;
    const mp = useDerived ? {
      wild_mult_enabled:      dl.wild_enabled,
      wild_mult_fixed:        Number(mpRaw.wild_mult_fixed) || 0,
      wild_mult_values:       dl.wild_values,
      progress_enabled:       dl.progress_enabled,
      progress_reset_on_mode: dl.progress_reset,
      progress_ladders:       dl.progress_ladders,
      random_enabled:         dl.random_enabled,
      random_symbol_id:       dl.random_symbol_id,
      random_values:          dl.random_values,
    } : mpRaw;
    const wsMul = wb.addWorksheet('15_Multipliers');
    wsMul.addRow(['Section', 'Key', 'Value', 'Weight', 'Notes']);
    // WILD
    wsMul.addRow(['WILD', 'Enabled',     !!mp.wild_mult_enabled, '', '']);
    wsMul.addRow(['WILD', 'Fixed_Mult',  Number(mp.wild_mult_fixed) || 0, '', '權重表為空時使用']);
    for (const v of (Array.isArray(mp.wild_mult_values) ? mp.wild_mult_values : [])) {
      wsMul.addRow(['WILD', 'Mult', Number(v.mult) || 0, Number(v.weight) || 0, '']);
    }
    // PROGRESS
    wsMul.addRow(['PROGRESS', 'Enabled',        !!mp.progress_enabled, '', '']);
    wsMul.addRow(['PROGRESS', 'Reset_On_Mode',  mp.progress_reset_on_mode !== false, '', '']);
    const ladders = (mp.progress_ladders && typeof mp.progress_ladders === 'object') ? mp.progress_ladders : {};
    for (const [mode, arr] of Object.entries(ladders)) {
      wsMul.addRow(['PROGRESS', 'Ladder', mode, Array.isArray(arr) ? arr.join(',') : '', '逗號分隔倍數階梯']);
    }
    // RANDOM
    wsMul.addRow(['RANDOM', 'Enabled',   !!mp.random_enabled, '', '']);
    wsMul.addRow(['RANDOM', 'Symbol_ID', mp.random_symbol_id || '', '', '承載隨機倍數的符號']);
    for (const v of (Array.isArray(mp.random_values) ? mp.random_values : [])) {
      wsMul.addRow(['RANDOM', 'Mult', Number(v.mult) || 0, Number(v.weight) || 0, '']);
    }
    boldHdr(wsMul); setCols(wsMul, [12, 14, 14, 10, 24]);

    // 16_Coin_Values(v5.4:Hold&Win 金幣面額。各模式權重展開成欄。引擎讀取;選用分頁)
    //   v6.3 / Q3:來源改由符號 prize_values 反推;無資料時 fallback 舊 coinValues 物件。
    const wsCoin = wb.addWorksheet('16_Coin_Values');
    const cvRaw = (typeof coinValues === 'object' && coinValues) ? coinValues : {};
    const cv = dl.coin_enabled
      ? { enabled: true, coin_symbol_id: dl.coin_symbol_id,
          denominations: dl.denoms.map(d => ({ label: '', value: d.value, link_jackpot: d.link_jackpot, weight_by_mode: d.weight_by_mode })) }
      : cvRaw;
    // 頭兩列 KV
    wsCoin.addRow(['Enabled', !!cv.enabled]);
    wsCoin.addRow(['Coin_Symbol_ID', cv.coin_symbol_id || 'COIN']);
    wsCoin.addRow([]);
    // 面額表:Label / Value / Link_Jackpot + 每模式一欄權重
    const coinModeNames = modeNames.slice();   // 與 01_Global 模式順序一致
    wsCoin.addRow(['Label', 'Value', 'Link_Jackpot', ...coinModeNames.map(m => 'W_' + m)]);
    for (const d of (Array.isArray(cv.denominations) ? cv.denominations : [])) {
      const wb_ = d.weight_by_mode || {};
      wsCoin.addRow([
        d.label || '', Number(d.value) || 0, d.link_jackpot || '',
        ...coinModeNames.map(m => Number(wb_[m]) || 0),
      ]);
    }
    boldHdr(wsCoin); setCols(wsCoin, [16, 12, 14, ...coinModeNames.map(() => 10)]);

    // 15b_Symbol_Mults(v6.3 / Q3:每符號倍數/彩金的「權威」分頁;py 忽略未知分頁,加表安全)
    //   Kind=MULT → Value=倍數(×N)、Weight=權重;Kind=PRIZE → Value=面額(N×)、Weight=基礎權重、
    //   Link_JP=連結 JP、W_<mode>=各模式權重。
    const wsSm = wb.addWorksheet('15b_Symbol_Mults');
    const smModeNames = modeNames.slice();
    wsSm.addRow(['Symbol_ID', 'Kind', 'Value', 'Weight', 'Link_JP', ...smModeNames.map(m => 'W_' + m)]);
    for (const p of derivedMults.perSymbol) {
      for (const mv of p.mults) {
        // v8.3 / R1 D-13:MULT 列寫入 per-mode 權重(缺 → 空字串 = 未宣告,向後相容)
        const mwbm = mv.weight_by_mode || {};
        wsSm.addRow([p.sid, 'MULT', Number(mv.mult) || 0, Number(mv.weight) || 0, '',
                     ...smModeNames.map(m => (mwbm[m] != null ? Number(mwbm[m]) || 0 : ''))]);
      }
      for (const pz of p.prizes) {
        const wbm = pz.weight_by_mode || {};
        wsSm.addRow([p.sid, 'PRIZE', Number(pz.value) || 0, Number(pz.weight) || 0, pz.link_jackpot || '',
                     ...smModeNames.map(m => (wbm[m] != null ? Number(wbm[m]) || 0 : ''))]);
      }
    }
    boldHdr(wsSm); setCols(wsSm, [16, 8, 12, 10, 16, ...smModeNames.map(() => 10)]);


    // v8.0:17_Bonus_Games 匯出已移除——bonus 併入模式玩法種類(mode_kind),
    //   由 11_Mode_Config(Mode_Kind..Collect_Target)+ 11c_Mode_Items 承載。

    return await wb.xlsx.writeBuffer();
  }

  // 摘要:回傳目前 LS 中的狀態,給 UI 顯示「會使用什麼設定」
  function getAxlsxSummaryFromLS() {
    function safeReadCount(key, kind) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return 0;
        const v = JSON.parse(raw);
        if (kind === 'array') return Array.isArray(v) ? v.length : 0;
        if (kind === 'obj-keys') return v && typeof v === 'object' ? Object.keys(v).length : 0;
        return 0;
      } catch (e) { return 0; }
    }
    let regSymbols = 0;
    try {
      const r = JSON.parse(localStorage.getItem('slotplanner.registry.v1') || '{}');
      regSymbols = Array.isArray(r.symbols) ? r.symbols.length : 0;
    } catch (e) {}
    return {
      hasAnyData: !!(
        localStorage.getItem('slotplanner.aconfig.global.v1') ||
        localStorage.getItem('slotplanner.aconfig.modes.v1')
      ),
      counts: {
        modes:       safeReadCount('slotplanner.aconfig.modes.v1', 'array'),
        layout:      safeReadCount('slotplanner.aconfig.layout.v1', 'array'),
        symbols:     regSymbols,
        paylines:    safeReadCount('slotplanner.aconfig.paylines.v1', 'array'),
        constraints: safeReadCount('slotplanner.aconfig.constraints.v1', 'array'),
        rules:       safeReadCount('slotplanner.aconfig.rules.v1', 'array'),
        discards:    safeReadCount('slotplanner.aconfig.discards.v1', 'array'),
        bins:        safeReadCount('slotplanner.aconfig.bins.v1', 'obj-keys'),
        reelWeights: safeReadCount('slotplanner.aconfig.reelweights.v1', 'obj-keys'),
        gridWeights: safeReadCount('slotplanner.aconfig.gridweights.v1', 'obj-keys'),
        comboWeights:safeReadCount('slotplanner.aconfig.comboweights.v1', 'obj-keys'),
      },
    };
  }

  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.buildAxlsxBufferFromLS = buildAxlsxBufferFromLS;
  window.SlotPlanner.getAxlsxSummaryFromLS = getAxlsxSummaryFromLS;

  // ════════════════════════════════════════════════════════════════════
  //  設定範本管理(localStorage 多份快照)
  //    每個範本 = 完整 12 個 aconfig keys + registry 的 JSON 快照
  //    存放在 slotplanner.template.<slug>.v1
  //    索引在 slotplanner.templates.list.v1
  // ════════════════════════════════════════════════════════════════════
  const LS_TPL_LIST_KEY = 'slotplanner.templates.list.v1';
  function _tplKey(slug) { return `slotplanner.template.${slug}.v1`; }
  // 把使用者輸入的名稱轉為 LS 安全的 slug(允許中英數 + 底線 + 連字號)
  function _slugify(name) {
    if (!name) return '';
    // 保留中英數字,其他換成 _,連續多個 _ 合併
    return String(name).trim().replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf-]+/g, '_').replace(/_+/g, '_').slice(0, 60);
  }

  // 取目前所有 aconfig LS keys 對應的資料(全份快照)
  function _snapshotAllLS() {
    const keys = {
      global:       'slotplanner.aconfig.global.v1',
      modes:        'slotplanner.aconfig.modes.v1',
      layout:       'slotplanner.aconfig.layout.v1',
      // v4.9:補納 panels / symbolsets(v4.7 新增的 LS keys,先前範本快照漏列,
      //       導致存範本會丟失自由副盤與符號集設定)
      panels:       'slotplanner.aconfig.panels.v1',
      symbolsets:   'slotplanner.aconfig.symbolsets.v1',
      bins:         'slotplanner.aconfig.bins.v1',
      paylines:     'slotplanner.aconfig.paylines.v1',
      constraints:  'slotplanner.aconfig.constraints.v1',
      reelweights:  'slotplanner.aconfig.reelweights.v1',
      gridweights:  'slotplanner.aconfig.gridweights.v1',
      comboweights: 'slotplanner.aconfig.comboweights.v1',
      discards:     'slotplanner.aconfig.discards.v1',
      rules:        'slotplanner.aconfig.rules.v1',
      jackpots:     'slotplanner.aconfig.jackpots.v1',   // v5.1
      betconfig:    'slotplanner.aconfig.betconfig.v1',   // v5.3
      reelstrips:   'slotplanner.aconfig.reelstrips.v1',   // v6.0-b
      multipliers:  'slotplanner.aconfig.multipliers.v1',  // v5.4
      coinvalues:   'slotplanner.aconfig.coinvalues.v1',   // v5.4
      genlimits:    'slotplanner.aconfig.genLimits.v1',     // v7.11:產牌限制
      gamble:       'slotplanner.aconfig.gamble.v1',        // v8.6:比倍(R5 E-16)
      cellattrs:    'slotplanner.aconfig.cellattrs.v1',     // v8.8:格子屬性(R4 B-6)
      symbolgroups: 'slotplanner.aconfig.symbolgroups.v1',  // P0-3:符號家族(D7:納快照)
      jackpottiers: 'slotplanner.aconfig.jackpot.v1',        // v8.25 G4:獎池級距(機主授權新 key)
      reellinks:    'slotplanner.aconfig.reellinks.v1',       // v8.38 GAP-T1:輪帶連動(30 授權新 key)
      tracks:       'slotplanner.aconfig.tracks.v1',          // v8.39 GAP-F1:軌道(30 授權新 key)
      meters:       'slotplanner.aconfig.meters.v1',          // 架構檢閱 #21:收集條(30 授權新 key)
      registry:     'slotplanner.registry.v1',
    };
    const out = {};
    for (const [k, lsKey] of Object.entries(keys)) {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        try { out[k] = JSON.parse(raw); } catch (e) { out[k] = null; }
      }
    }
    return { keys, data: out };
  }
  // 反向:把快照寫回 LS
  function _restoreAllLS(snapshot) {
    const keys = {
      global:       'slotplanner.aconfig.global.v1',
      modes:        'slotplanner.aconfig.modes.v1',
      layout:       'slotplanner.aconfig.layout.v1',
      // v4.9:與 _snapshotAllLS 同步補 panels / symbolsets。
      //       舊範本快照無這兩個 key → 還原時會 removeItem 清空,
      //       語義正確(範本代表完整狀態,沒存 = 沒有副盤)。
      panels:       'slotplanner.aconfig.panels.v1',
      symbolsets:   'slotplanner.aconfig.symbolsets.v1',
      bins:         'slotplanner.aconfig.bins.v1',
      paylines:     'slotplanner.aconfig.paylines.v1',
      constraints:  'slotplanner.aconfig.constraints.v1',
      reelweights:  'slotplanner.aconfig.reelweights.v1',
      gridweights:  'slotplanner.aconfig.gridweights.v1',
      comboweights: 'slotplanner.aconfig.comboweights.v1',
      discards:     'slotplanner.aconfig.discards.v1',
      rules:        'slotplanner.aconfig.rules.v1',
      jackpots:     'slotplanner.aconfig.jackpots.v1',   // v5.1
      betconfig:    'slotplanner.aconfig.betconfig.v1',   // v5.3
      reelstrips:   'slotplanner.aconfig.reelstrips.v1',   // v6.0-b
      multipliers:  'slotplanner.aconfig.multipliers.v1',  // v5.4
      coinvalues:   'slotplanner.aconfig.coinvalues.v1',   // v5.4
      genlimits:    'slotplanner.aconfig.genLimits.v1',     // v7.11:產牌限制
      gamble:       'slotplanner.aconfig.gamble.v1',        // v8.6:比倍(R5 E-16)
      cellattrs:    'slotplanner.aconfig.cellattrs.v1',     // v8.8:格子屬性(R4 B-6)
      symbolgroups: 'slotplanner.aconfig.symbolgroups.v1',  // P0-3:符號家族(D7:納快照)
      jackpottiers: 'slotplanner.aconfig.jackpot.v1',        // v8.25 G4:獎池級距(機主授權新 key)
      reellinks:    'slotplanner.aconfig.reellinks.v1',       // v8.38 GAP-T1:輪帶連動(30 授權新 key)
      tracks:       'slotplanner.aconfig.tracks.v1',          // v8.39 GAP-F1:軌道(30 授權新 key)
      meters:       'slotplanner.aconfig.meters.v1',          // 架構檢閱 #21:收集條(30 授權新 key)
      registry:     'slotplanner.registry.v1',
    };
    for (const [k, lsKey] of Object.entries(keys)) {
      if (snapshot[k] != null) {
        localStorage.setItem(lsKey, JSON.stringify(snapshot[k]));
      } else {
        localStorage.removeItem(lsKey);
      }
    }
  }

  function listTemplates() {
    try {
      const raw = localStorage.getItem(LS_TPL_LIST_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function _saveTemplateList(list) {
    // 架構檢閱 #4:原本無 try/catch,容量超限(QuotaExceededError)會讓呼叫端(saveTemplate/
    // deleteTemplate)的例外訊息變成瀏覽器原生「QuotaExceededError: ...」,使用者看不懂。
    // 改丟一個清楚的中文訊息;呼叫端已有 try/catch → UI alert/status 顯示(如 setup.js 範本存檔流程)。
    try {
      localStorage.setItem(LS_TPL_LIST_KEY, JSON.stringify(list));
    } catch (e) {
      const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
      throw new Error(isQuota
        ? '瀏覽器儲存空間已滿,無法儲存範本(可刪除舊範本或符號圖片後再試)'
        : ('範本清單寫入失敗:' + (e && e.message || e)));
    }
  }

  // 公開:儲存範本(自動 slugify 名稱;同 slug 會覆蓋)
  function saveTemplate(name, description) {
    if (!name || !name.trim()) throw new Error('範本名稱不可空白');
    const slug = _slugify(name);
    if (!slug) throw new Error('範本名稱含過多特殊字元,無法產生有效 slug');
    // v4.9:'builtin-' 為內建範本保留字,擋下撞名(避免清單出現重複 slug key)
    if (slug.startsWith(BUILTIN_SLUG_PREFIX)) {
      throw new Error('「builtin-」開頭為內建範本保留字,請換個名稱');
    }
    const snap = _snapshotAllLS();
    const payload = { version: 1, savedAt: new Date().toISOString(), data: snap.data };
    localStorage.setItem(_tplKey(slug), JSON.stringify(payload));
    const list = listTemplates();
    const idx = list.findIndex(t => t.slug === slug);
    const now = new Date().toISOString();
    const meta = {
      slug,
      name: name.trim(),
      description: (description || '').trim(),
      created: idx >= 0 ? list[idx].created : now,
      modified: now,
      counts: {
        modes:    Array.isArray(snap.data.modes) ? snap.data.modes.length : 0,
        rules:    Array.isArray(snap.data.rules) ? snap.data.rules.length : 0,
        discards: Array.isArray(snap.data.discards) ? snap.data.discards.length : 0,
        symbols:  (snap.data.registry && Array.isArray(snap.data.registry.symbols))
                  ? snap.data.registry.symbols.length : 0,
      },
    };
    if (idx >= 0) list[idx] = meta; else list.push(meta);
    _saveTemplateList(list);
    return meta;
  }

  // 公開:載入範本(覆寫所有 LS keys),回傳被載入的 metadata
  function loadTemplate(slug) {
    // v4.9:內建範本不在 LS,直接還原 builder 資料
    if (_isBuiltinSlug(slug)) {
      const p = _builtinPayload(slug);
      if (!p) throw new Error(`內建範本不存在:${slug}`);
      _restoreAllLS(p.data);
      return _builtinMeta(slug);
    }
    const raw = localStorage.getItem(_tplKey(slug));
    if (!raw) throw new Error(`範本不存在:${slug}`);
    let payload;
    try { payload = JSON.parse(raw); } catch (e) { throw new Error('範本 JSON 解析失敗'); }
    if (!payload || !payload.data) throw new Error('範本資料結構錯誤');
    _restoreAllLS(payload.data);
    const list = listTemplates();
    return list.find(t => t.slug === slug);
  }

  // 公開:刪除範本
  function deleteTemplate(slug) {
    // v4.9:內建範本不可刪除
    if (_isBuiltinSlug(slug)) throw new Error('內建範本無法刪除');
    localStorage.removeItem(_tplKey(slug));
    const list = listTemplates().filter(t => t.slug !== slug);
    _saveTemplateList(list);
  }

  // 公開:把範本匯出成 JSON(讓使用者下載,給別人使用)
  function exportTemplateJSON(slug) {
    // v4.9:內建範本即時組 payload(允許匯出分享)
    if (_isBuiltinSlug(slug)) {
      const meta = _builtinMeta(slug);
      const payload = _builtinPayload(slug);
      if (!meta || !payload) throw new Error(`內建範本不存在:${slug}`);
      return JSON.stringify({ meta, payload }, null, 2);
    }
    const raw = localStorage.getItem(_tplKey(slug));
    if (!raw) throw new Error(`範本不存在:${slug}`);
    const meta = listTemplates().find(t => t.slug === slug);
    let payload;
    try { payload = JSON.parse(raw); } catch (e) { throw new Error('範本 JSON 解析失敗'); }
    return JSON.stringify({ meta, payload }, null, 2);
  }

  // 公開:從 JSON 字串匯入範本(不覆寫當前設定,只新增到範本列表)
  function importTemplateJSON(jsonStr, overrideName) {
    let obj;
    try { obj = JSON.parse(jsonStr); } catch (e) { throw new Error('JSON 格式錯誤'); }
    if (!obj || !obj.payload || !obj.payload.data) {
      throw new Error('JSON 不是有效的範本檔(缺少 payload.data)');
    }
    const name = overrideName || (obj.meta && obj.meta.name) || `匯入_${new Date().toISOString().slice(0,10)}`;
    const description = (obj.meta && obj.meta.description) || '從 JSON 匯入';
    let slug = _slugify(name);
    if (!slug) throw new Error('範本名稱含過多特殊字元');
    // v4.9:匯入檔若撞到內建保留字 slug(例如匯入別人分享的內建範本 JSON),
    //       自動改名為使用者副本,而非直接報錯
    if (slug.startsWith(BUILTIN_SLUG_PREFIX)) {
      slug = 'copy-' + slug.slice(BUILTIN_SLUG_PREFIX.length);
    }
    localStorage.setItem(_tplKey(slug), JSON.stringify(obj.payload));
    const list = listTemplates();
    const idx = list.findIndex(t => t.slug === slug);
    const data = obj.payload.data;
    const now = new Date().toISOString();
    const meta = {
      slug, name, description,
      created: idx >= 0 ? list[idx].created : now,
      modified: now,
      counts: {
        modes:    Array.isArray(data.modes) ? data.modes.length : 0,
        rules:    Array.isArray(data.rules) ? data.rules.length : 0,
        discards: Array.isArray(data.discards) ? data.discards.length : 0,
        symbols:  (data.registry && Array.isArray(data.registry.symbols))
                  ? data.registry.symbols.length : 0,
      },
    };
    if (idx >= 0) list[idx] = meta; else list.push(meta);
    _saveTemplateList(list);
    return meta;
  }

  // ──────────────────────────────────────────────────────────
  //  v4.9-a:內建示範範本(builtin)
  //  - 不存 LS、不可刪除;按「▶ 載入」即套用一套完整、零驗證錯誤、
  //    用到所有分頁的遊戲設定,供新使用者/新案子一鍵起步。
  //  - slug 一律以 'builtin-' 開頭(保留字;saveTemplate / importTemplateJSON
  //    會擋下撞名,避免 LS 範本與內建範本 slug 衝突造成清單重複 key)。
  //  - 資料以 builder 程式化生成(而非巨大字面值),保證 04/05 權重 key
  //    對「每輪 × 每符號」完整覆蓋,不會漏格。
  // ──────────────────────────────────────────────────────────
  const BUILTIN_SLUG_PREFIX = 'builtin-';
  const BUILTIN_DEMO_SLUG = 'builtin-demo-jade';
  const BUILTIN_DEMO_STAMP = '2026-06-12T00:00:00.000Z';

  function _buildBuiltinDemoData() {
    const REELS = 5;

    // ── 03_Symbols(SymbolRegistry toJSON 格式;name = symbol_id,
    //    確保 04/07/09 以名稱引用符號時與 03 完全對齊、零孤兒警告)──
    const SYM_DEFS = [
      { sid: 'WILD', type: 'WILD',    p: [20, 60, 200],  wild: true,
        reels: [false, true, true, true, false], sw: ['#7a3c20', '#ffffff'] },
      { sid: 'SCAT', type: 'SCATTER', p: [2, 10, 50],    scatter: true, sw: ['#b87c10', '#ffffff'] },
      { sid: 'MEGA', type: 'SPECIAL', p: [30, 100, 300], mw: 2, mh: 2,  sw: ['#27ae60', '#ffffff'] },
      { sid: 'H1',   type: 'HIGH',    p: [10, 30, 100],  sw: ['#c0392b', '#ffffff'] },
      { sid: 'H2',   type: 'HIGH',    p: [8, 24, 80],    sw: ['#c95810', '#ffffff'] },
      { sid: 'H3',   type: 'HIGH',    p: [6, 18, 60],    sw: ['#4a93ee', '#ffffff'] },
      { sid: 'H4',   type: 'HIGH',    p: [5, 14, 45],    sw: ['#7a5a3a', '#ffffff'] },
      { sid: 'L1',   type: 'LOW',     p: [3, 8, 20],     sw: ['#EDD9C0', '#7a5a3a'] },
      { sid: 'L2',   type: 'LOW',     p: [2.5, 7, 18],   sw: ['#e7e3da', '#5a5650'] },
      { sid: 'L3',   type: 'LOW',     p: [2, 6, 15],     sw: ['#d9e8df', '#2f6e4f'] },
      { sid: 'L4',   type: 'LOW',     p: [1.5, 5, 12],   sw: ['#dfe6ee', '#3a5a7a'] },
    ];
    const registry = {
      version: 2,
      reel_count: REELS,
      symbols: SYM_DEFS.map((d, i) => ({
        id: i + 1,
        name: d.sid,
        number: String(i + 1),
        weight: 100,
        max_count: 0,
        use_max: false,
        reel_limit: d.reels ? [...d.reels] : new Array(REELS).fill(true),
        enabled: true,
        symbol_id: d.sid,
        type: d.type,
        pay_3x: d.p[0], pay_4x: d.p[1], pay_5x: d.p[2], pay_6x: 0,
        mega_w: d.mw || 1, mega_h: d.mh || 1,
        is_wild: !!d.wild, is_scatter: !!d.scatter,
        swatch: [...d.sw],
      })),
    };

    // ── 01_Global + 11_Mode_Config ──
    const global = {
      simulation_count: 1000000, random_seed: 42, output_prefix: 'B_結果',
      pay_type: 'LINE', ways_direction: 'LTR', payline_direction: 'LTR',
      megaways: false, cluster_min_size: 5, starting_mode: 'NG',
      max_chain_depth: 100, max_chain_per_rule: 50,
      big_win_thresholds: '100,500', dead_spin_buckets: '2,3,4,5',
    };
    const modes = [
      { mode: 'NG',  trigger_condition: '', spin_count: 0,
        inherit_globals: false, on_enter_reset_vars: '', notes: '基本遊戲(起始模式)' },
      { mode: 'FG1', trigger_condition: 'symbol_count.SCAT >= 3', spin_count: 10,
        inherit_globals: false, on_enter_reset_vars: 'fg_combo_count', notes: '10 局免費遊戲' },
    ];

    // ── 02_Layout:5×3;R3 帶一個 STACK 副輪(沿用母輪權重 → 零警告)──
    const layout = [];
    for (let r = 1; r <= REELS; r++) {
      layout.push({
        reel_id: r, y_offset: 0, max_rows: 3,
        has_subreel: r === 3,
        subreel_position: r === 3 ? 'BOTTOM' : '',
        subreel_rows: r === 3 ? 1 : 0,
        subreel_inherit_weight: r === 3,
        subreel_kind: 'STACK',
      });
    }
    // ── 02b_Panels + 03b_Symbol_Sets:頂部 3×1 收集盤,獨立符號集
    //    (symbol_set 非空 → 有權重來源,零警告;join_payline=false → 零警告)──
    const panels = [{
      panel_id: 'HW1', col: 1, row: -2, width: 3, height: 1,
      scroll: false, symbol_set: 'HWSET',
      inherit_weight: false, join_payline: false,
      note: '頂部收集盤(獨立符號集示範)',
    }];
    const symbolsets = { HWSET: ['SCAT', 'H1', 'L1'] };

    // ── 04_Reel_Weights:NG / FG1 兩套完整權重
    //    WILD 在 R1/R5 權重 0,與 C001(REEL_RESTRICT WILD 2,3,4)語義一致 ──
    const BASE_W = { WILD: 16, SCAT: 10, MEGA: 4, H1: 22, H2: 26, H3: 30, H4: 34, L1: 58, L2: 62, L3: 66, L4: 70 };
    const FG_W   = { WILD: 30, SCAT: 8,  MEGA: 6, H1: 26, H2: 30, H3: 34, H4: 38, L1: 50, L2: 54, L3: 58, L4: 62 };
    const sidList = SYM_DEFS.map(d => d.sid);
    function _mkWeights(map) {
      const w = {};
      for (let r = 1; r <= REELS; r++) {
        for (const sid of sidList) {
          let v = (map[sid] != null) ? map[sid] : 100;
          if (sid === 'WILD' && (r === 1 || r === REELS)) v = 0;
          w[`${r}-${sid}`] = v;
        }
      }
      return w;
    }
    const reelweights = {
      NG:  { symbol_ids: [...sidList], weights: _mkWeights(BASE_W),
             notes: 'NG 基礎權重(WILD 僅 2–4 輪)', sub_weights: {}, panel_weights: {} },
      FG1: { symbol_ids: [...sidList], weights: _mkWeights(FG_W),
             notes: 'FG 提高 WILD / MEGA 出現率', sub_weights: {}, panel_weights: {} },
    };

    // ── 05_Grid_Size_Weights:固定 3 列(非 Megaways,示範表結構)──
    function _mkGrid() {
      const w = {};
      for (let r = 1; r <= REELS; r++) w[`${r}-3`] = 100;
      return { grid_sizes: [3], weights: w, notes: '固定 3 列(非 Megaways)' };
    }
    const gridweights = { NG: _mkGrid(), FG1: _mkGrid() };

    // ── 06_Paylines:10 線(全部落在 1..3 列、1..5 輪 → 驗證全過)──
    const paylines = [
      { line_id: 1,  path: '(1,1)-(2,1)-(3,1)-(4,1)-(5,1)', direction: 'LTR', notes: '頂列' },
      { line_id: 2,  path: '(1,2)-(2,2)-(3,2)-(4,2)-(5,2)', direction: 'LTR', notes: '中列' },
      { line_id: 3,  path: '(1,3)-(2,3)-(3,3)-(4,3)-(5,3)', direction: 'LTR', notes: '底列' },
      { line_id: 4,  path: '(1,1)-(2,2)-(3,3)-(4,2)-(5,1)', direction: 'LTR', notes: 'V 型' },
      { line_id: 5,  path: '(1,3)-(2,2)-(3,1)-(4,2)-(5,3)', direction: 'LTR', notes: '倒 V 型' },
      { line_id: 6,  path: '(1,1)-(2,2)-(3,1)-(4,2)-(5,1)', direction: 'LTR', notes: '上鋸齒' },
      { line_id: 7,  path: '(1,3)-(2,2)-(3,3)-(4,2)-(5,3)', direction: 'LTR', notes: '下鋸齒' },
      { line_id: 8,  path: '(1,2)-(2,1)-(3,2)-(4,1)-(5,2)', direction: 'LTR', notes: '中上鋸齒' },
      { line_id: 9,  path: '(1,2)-(2,3)-(3,2)-(4,3)-(5,2)', direction: 'LTR', notes: '中下鋸齒' },
      { line_id: 10, path: '(1,1)-(2,1)-(3,2)-(4,3)-(5,3)', direction: 'LTR', notes: '左上→右下階梯' },
    ];

    // ── 07_Constraints ──
    const constraints = [
      { constraint_id: 'C001', ctype: 'REEL_RESTRICT', symbol_id: 'WILD',
        reels_allowed: '2,3,4', threshold: 0, mode_scope: 'ALL', notes: 'Wild 只出現在中間 3 輪' },
      { constraint_id: 'C002', ctype: 'GLOBAL_MAX', symbol_id: 'SCAT',
        reels_allowed: '', threshold: 3, mode_scope: 'NG', notes: 'NG 全盤最多 3 個 Scatter' },
      { constraint_id: 'C003', ctype: 'GLOBAL_MAX', symbol_id: 'MEGA',
        reels_allowed: '', threshold: 1, mode_scope: 'ALL', notes: 'MEGA(2×2)全盤最多 1 個' },
    ];

    // ── 09_Puzzle_Rules(trigger / atype / 必填參數均對齊 catalog → 零錯誤)──
    const rules = [
      { rule_id: 'P001', mode_scope: 'ALL', trigger: 'ON_GRID_GENERATED',
        condition: 'symbol_count.SCAT >= 3',
        actions: [
          { atype: 'EMIT_EVENT',  params: { name: 'fg_trigger' } },
          { atype: 'SWITCH_MODE', params: { target: 'FG1', inherit_globals: false } },
        ],
        emits: ['fg_trigger'], enabled: true, priority: 100,
        description: 'Scatter ≥ 3 觸發免費遊戲並切到 FG1' },
      { rule_id: 'P002', mode_scope: 'FG1', trigger: 'ON_COMBO_END',
        condition: 'mode == FG1 AND combo_step >= 2',
        actions: [{ atype: 'AWARD_FREE_SPIN', params: { count: 5, mode: 'FG1' } }],
        emits: [], enabled: true, priority: 80,
        description: 'FG 內連 2 爆以上追加 5 局' },
      { rule_id: 'P003', mode_scope: 'NG', trigger: 'ON_DEAD_SPIN',
        condition: 'mode == NG',
        actions: [{ atype: 'UPDATE_GLOBAL', params: { var: 'dead_count', op: 'add', value: 1 } }],
        emits: [], enabled: true, priority: 50,
        description: '死局累計到 global.dead_count(救濟用)' },
      { rule_id: 'P004', mode_scope: 'ALL', trigger: 'ON_COMBO_END',
        condition: 'total_multiplier >= 100',
        actions: [{ atype: 'EMIT_EVENT', params: { name: 'big_win' } }],
        emits: ['big_win'], enabled: true, priority: 90,
        description: '累計 100 倍以上廣播 big_win 事件' },
    ];

    // ── 10_Discard_Rules ──
    const discards = [
      { discard_id: 'D001', discard_kind: 'HARD', mode_scope: 'ALL',
        condition: 'symbol_count.SCAT >= 5', notes: '全盤 Scatter 過多,視為異常局(風控)' },
      { discard_id: 'D002', discard_kind: 'SOFT', mode_scope: 'NG',
        condition: 'total_multiplier > 0 AND total_multiplier < 0.5', notes: '極小中獎,體感差' },
      { discard_id: 'D003', discard_kind: 'SOFT', mode_scope: 'FG1',
        condition: 'spin_locals.fg_combo_count == 0', notes: 'FG 完全沒中,體感極差' },
    ];

    // ── 12_Distribution_Bins ──
    const bins = {
      NG:  { bin_edges: '0, 0.001, 2, 10, 50',        notes: 'NG 倍數分佈區間' },
      FG1: { bin_edges: '0, 0.001, 20, 60, 120, 600', notes: 'FG 倍數分佈區間' },
    };

    // 鍵名對齊 _snapshotAllLS / _restoreAllLS 的 snapshot key
    // (comboweights 刻意不含 → 還原時清空,與 v4.0 #14 移除一致)
    return { global, modes, layout, panels, symbolsets, bins, paylines,
             constraints, reelweights, gridweights, discards, rules, registry };
  }

  const BUILTIN_TEMPLATES = [{
    slug: BUILTIN_DEMO_SLUG,
    builtin: true,
    name: '📦 示範:翡翠之路 5×3',
    description: '內建完整示範:5×3 LINE、NG+FG1 雙模式、11 符號(含 MEGA 2×2)、'
      + 'R3 副輪 + 自由副盤 HW1、10 線、3 約束、4 規則、3 棄牌、雙模式分佈區間。'
      + '零驗證錯誤,可直接匯出 A.xlsx。',
    created: BUILTIN_DEMO_STAMP,
    modified: BUILTIN_DEMO_STAMP,
    counts: { modes: 2, rules: 4, discards: 3, symbols: 11,
              layout: 5, paylines: 10, constraints: 3 },
  }];

  function _isBuiltinSlug(slug) {
    return typeof slug === 'string' && slug.startsWith(BUILTIN_SLUG_PREFIX);
  }
  function _builtinMeta(slug) {
    return BUILTIN_TEMPLATES.find(t => t.slug === slug) || null;
  }
  function _builtinPayload(slug) {
    if (slug !== BUILTIN_DEMO_SLUG) return null;
    return { version: 1, savedAt: BUILTIN_DEMO_STAMP, data: _buildBuiltinDemoData() };
  }
  // 公開:完整清單 = 內建(置頂)+ LS 使用者範本
  function listAllTemplates() {
    return [
      ...BUILTIN_TEMPLATES.map(t => ({ ...t, counts: { ...t.counts } })),
      ...listTemplates(),
    ];
  }
  // 公開:取範本 data(內建走 builder,LS 範本走原路;diff / 預覽共用)
  function getTemplateData(slug) {
    if (_isBuiltinSlug(slug)) {
      const p = _builtinPayload(slug);
      return p ? p.data : null;
    }
    try {
      const raw = localStorage.getItem(_tplKey(slug));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj.data || null;
    } catch (e) { return null; }
  }

  // 暴露
  window.SlotPlanner.Templates = {
    list:   listAllTemplates,   // v4.9:內建範本置頂 + LS 使用者範本
    save:   saveTemplate,
    load:   loadTemplate,
    remove: deleteTemplate,
    exportJSON: exportTemplateJSON,
    importJSON: importTemplateJSON,
    getData:   getTemplateData,   // v4.9:diff / 載入預覽共用(支援內建)
    isBuiltin: _isBuiltinSlug,    // v4.9
  };

  console.log('[aconfig-xlsx] loaded');
})();
