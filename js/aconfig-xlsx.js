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

  // mode_scope ↔ condition 合併:後端 PuzzleRule 沒有 mode_scope 欄位
  function _composeConditionWithModeScope(modeScope, condition) {
    const ms = (modeScope || 'ALL').toString().trim();
    const cond = (condition || '').toString().trim();
    if (!ms || ms === 'ALL') return cond;
    if (!cond) return `mode == ${ms}`;
    const re = new RegExp(`^\\s*mode\\s*==\\s*${ms}\\b`);
    if (re.test(cond)) return cond;
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

  // ════════════════════════════════════════════════════════════════════
  //  公開:從 localStorage 直接生 A.xlsx ArrayBuffer
  //  讓 SimPage 等其他 component 可以拿來餵 Pyodide,不必經過實體檔案
  // ════════════════════════════════════════════════════════════════════
  async function buildAxlsxBufferFromLS() {
    if (typeof window.ExcelJS === 'undefined') {
      throw new Error('ExcelJS 未載入');
    }

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
    const multipliers = readLS('slotplanner.aconfig.multipliers.v1', {});  // v5.4
    const coinValues  = readLS('slotplanner.aconfig.coinvalues.v1',  {});  // v5.4
    const bonusGames  = readLS('slotplanner.aconfig.bonusgames.v1',  {});  // v6.0-c
    const registryRaw = readLS('slotplanner.registry.v1',             { symbols: [] });

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
      ['03c_Paytable', '動態賠付表(v5.3;優先於 03_Symbols Pay_Nx)'],
      ['04_Reel_Weights', 'Reel 權重'],
      ['04b_Reel_Strips', '真實輪帶(v6.0-b:實體序列;啟用時引擎用視窗抽樣;選用)'],
      ['05_Grid_Size_Weights', '格數權重'],
      ['06_Paylines', '中獎線'],
      ['07_Constraints', '硬約束'],
      ['08_Combo_Weights', '連爆權重'],
      ['09_Puzzle_Rules', '腳本規則'],
      ['10_Discard_Rules', '棄牌規則'],
      ['11_Mode_Config', '模式設定'],
      ['12_Distribution_Bins', '分佈區間'],
      ['13_Jackpots', 'JP 定義(選用;引擎忽略,供文件/前端使用)'],
      ['14_Bet_Config', '投注結構(v5.3:Ante Bet + Buy Feature;選用;引擎讀取)'],
      ['15_Multipliers', '倍數系統(v5.4:Wild/Progress/Random;選用;引擎讀取)'],
      ['16_Coin_Values', '金幣面額(v5.4:Hold&Win;選用;引擎讀取)'],
      ['17_Bonus_Games', 'Bonus 小遊戲(v6.0-c:輪盤/選獎/收集;選用;引擎讀取)'],
    ]);
    wsR.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF5A3DB0' } };
    setCols(wsR, [28, 50]);

    // 01_Global
    const wsG = wb.addWorksheet('01_Global');
    wsG.addRow(['Key', 'Value', 'Notes']);
    for (const [k, v] of Object.entries(g)) wsG.addRow([k, v, '']);
    boldHdr(wsG); setCols(wsG, [22, 28, 36]);

    // 02_Layout
    const wsL = wb.addWorksheet('02_Layout');
    wsL.addRow(['Reel_ID', 'Y_Offset', 'Max_Rows', 'Has_SubReel',
                'SubReel_Position', 'SubReel_Rows', 'SubReel_Inherit_Weight', 'SubReel_Kind',
                'SubReel_Symbol_Set']);
    for (const r of layoutRows) {
      wsL.addRow([r.reel_id, r.y_offset, r.max_rows, r.has_subreel,
                  r.subreel_position, r.subreel_rows, r.subreel_inherit_weight,
                  r.subreel_kind || 'STACK',
                  r.subreel_symbol_set || '']);   // v5.1:契約加法欄
    }
    boldHdr(wsL); setCols(wsL, [10, 10, 10, 13, 18, 14, 22, 14, 20]);

    // 02b_Panels(v4.7:自由副盤;無 panel → 仍寫表頭，引擎讀到空 → panels=[])
    const wsPnl = wb.addWorksheet("02b_Panels");
    wsPnl.addRow(['Panel_ID', 'Col', 'Row', 'Width', 'Height',
                'Scroll', 'Symbol_Set', 'Inherit_Weight', 'Join_Payline', 'Note']);
    for (const p of (Array.isArray(panelRows) ? panelRows : [])) {
      if (!p || !p.panel_id) continue;
      wsPnl.addRow([
        p.panel_id, p.col || 0, p.row || 0, p.width || 3, p.height || 3,
        !!p.scroll, p.symbol_set || '', !!p.inherit_weight, !!p.join_payline, p.note || '',
      ]);
    }
    boldHdr(wsPnl); setCols(wsPnl, [14, 8, 8, 9, 9, 10, 16, 15, 14, 20]);

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
    const wsS = wb.addWorksheet('03_Symbols');
    wsS.addRow([
      'Symbol_ID', 'Display_Name', 'Number', 'Type',
      'Pay_3x', 'Pay_4x', 'Pay_5x', 'Pay_6x',
      'Mega_W', 'Mega_H', 'Is_Wild', 'Is_Scatter',
      'Weight', 'Max_Count', 'Use_Max', 'Reel_Limit',
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
        sid, s.name || '', s.number || '', s.type || 'HIGH',
        s.pay_3x || 0, s.pay_4x || 0, s.pay_5x || 0, s.pay_6x || 0,
        s.mega_w || 1, s.mega_h || 1, !!s.is_wild, !!s.is_scatter,
        s.weight || 0, s.max_count || 0, !!s.use_max,
        Array.isArray(s.reel_limit) ? s.reel_limit.join(',') : '',
      ]);
    }
    boldHdr(wsS); setCols(wsS, [14, 16, 10, 12, 10, 10, 10, 10, 9, 9, 10, 11, 10, 12, 10, 18]);

    // 03c_Paytable(v5.3:動態賠付表)
    const wsPaytable = wb.addWorksheet('03c_Paytable');
    wsPaytable.addRow(['Symbol_ID', 'Count', 'Pay']);
    for (const s of syms) {
      if (s.enabled === false) continue;
      const sid = s.symbol_id || s.name || String(s.number || '');
      const rows = (Array.isArray(s.pay_rows) && s.pay_rows.length > 0)
        ? s.pay_rows
        : [2,3,4,5,6,7,8,9].filter(n => Number(s['pay_'+n+'x']) > 0)
                             .map(n => ({ count: n, pay: s['pay_'+n+'x'] }));
      for (const r of rows) {
        if (Number(r.pay) > 0) wsPaytable.addRow([sid, Number(r.count), Number(r.pay)]);
      }
    }
    boldHdr(wsPaytable); setCols(wsPaytable, [16, 10, 12]);

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

    // 06_Paylines
    const wsP = wb.addWorksheet('06_Paylines');
    wsPaytable.addRow(['Line_ID', 'Path', 'Direction', 'Notes']);
    // v4.0 / #16:Direction 改全域設定(g.payline_direction);每行寫入相同值以維持後端逐行讀取相容
    const _plDir = (g && g.payline_direction) || 'LTR';
    for (const pl of paylines) wsPaytable.addRow([pl.line_id, pl.path, _plDir, pl.notes]);
    boldHdr(wsPaytable); setCols(wsPaytable, [10, 44, 12, 28]);

    // 07_Constraints
    const wsC = wb.addWorksheet('07_Constraints');
    wsC.addRow(['Constraint_ID', 'Type', 'Symbol_ID', 'Reels_Allowed',
                'Max_Count_Global', 'Mode_Scope', 'Notes']);
    for (const c of constraints) {
      wsC.addRow([c.constraint_id, c.ctype, c.symbol_id, c.reels_allowed,
                  c.threshold, c.mode_scope, c.notes]);
    }
    boldHdr(wsC); setCols(wsC, [14, 16, 13, 16, 18, 13, 28]);

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
    wsPR.addRow(['Rule_ID', 'Priority', 'Trigger', 'Condition',
                 'Actions', 'Emits', 'Enabled', 'Description']);
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
        r.description || r.notes || '',  // 兼容舊資料的 notes
      ]);
    }
    boldHdr(wsPR); setCols(wsPR, [12, 10, 22, 40, 50, 18, 10, 28]);

    // 10_Discard_Rules
    const wsDR = wb.addWorksheet('10_Discard_Rules');
    wsDR.addRow(['Discard_ID', 'Discard_Kind', 'Mode_Scope', 'Condition', 'Notes']);
    for (const d of discards) {
      wsDR.addRow([d.discard_id, d.discard_kind, d.mode_scope, d.condition, d.notes]);
    }
    boldHdr(wsDR); setCols(wsDR, [12, 14, 13, 36, 24]);

    // 11_Mode_Config
    const wsM = wb.addWorksheet('11_Mode_Config');
    wsM.addRow(['Mode', 'Trigger_Condition', 'Spin_Count', 'Inherit_Globals',
                'On_Enter_Reset_Vars', 'Notes']);
    for (const m of modes) {
      wsM.addRow([m.mode, m.trigger_condition, m.spin_count, m.inherit_globals,
                  m.on_enter_reset_vars, m.notes]);
    }
    boldHdr(wsM); setCols(wsM, [12, 32, 12, 16, 22, 28]);

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
                'Trigger_Desc', 'Mode_Scope', 'Notes']);
    for (const j of (Array.isArray(jackpots) ? jackpots : [])) {
      if (!j || (!j.name && !j.jp_id)) continue;
      wsJ.addRow([j.jp_id || '', j.name || '', j.kind || 'FIXED', Number(j.mult) || 0,
                  Number(j.increment_pct) || 0, Number(j.must_hit_by) || 0,
                  j.trigger_desc || '', j.mode_scope || 'ALL', j.notes || '']);
    }
    boldHdr(wsJ); setCols(wsJ, [10, 16, 13, 12, 13, 12, 30, 14, 24]);

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
    wsBet.addRow(['BF_ID', 'Target_Mode', 'Cost_Mult', 'RTP_Target', 'Enabled', 'Notes']);
    for (const bf of (Array.isArray(bc.buy_features) ? bc.buy_features : [])) {
      if (!bf || !bf.bf_id) continue;
      wsBet.addRow([bf.bf_id, bf.target_mode || '', Number(bf.cost_mult) || 0,
                   Number(bf.rtp_target) || 0, bf.enabled !== false, bf.notes || '']);
    }
    boldHdr(wsBet); setCols(wsBet, [22, 16, 12, 12, 10, 28]);

    // 15_Multipliers(v5.4:三段 — WILD / PROGRESS / RANDOM。引擎讀取;選用分頁)
    const wsMul = wb.addWorksheet('15_Multipliers');
    const mp = (typeof multipliers === 'object' && multipliers) ? multipliers : {};
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
    const wsCoin = wb.addWorksheet('16_Coin_Values');
    const cv = (typeof coinValues === 'object' && coinValues) ? coinValues : {};
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

    // 17_Bonus_Games(v6.0-c:每個 game 一段 KV header + 其 items 列。引擎讀取;選用)
    const wsBonus = wb.addWorksheet('17_Bonus_Games');
    wsBonus.addRow(['Bonus_ID', 'Type', 'Title', 'Trigger_Desc', 'Mode_Scope',
                    'Upgrade_To', 'Pick_Count', 'Collect_Target',
                    'Item_Label', 'Item_Value', 'Item_Weight', 'Item_Is_End', 'Item_Link_JP']);
    {
      const bg = (typeof bonusGames === 'object' && bonusGames) ? bonusGames : {};
      const games = Array.isArray(bg.games) ? bg.games : [];
      for (const g of games) {
        if (!g || !g.bonus_id) continue;
        const items = Array.isArray(g.items) ? g.items : [];
        if (items.length === 0) {
          // 無項目仍寫一列保留 game 定義
          wsBonus.addRow([g.bonus_id, g.type || 'WHEEL', g.title || '', g.trigger_desc || '',
                          g.mode_scope || 'ALL', g.wheel_upgrade_to || '',
                          Number(g.pick_count) || 0, Number(g.collect_target) || 0,
                          '', '', '', '', '']);
          continue;
        }
        items.forEach((it, idx) => {
          wsBonus.addRow([
            idx === 0 ? g.bonus_id : '',
            idx === 0 ? (g.type || 'WHEEL') : '',
            idx === 0 ? (g.title || '') : '',
            idx === 0 ? (g.trigger_desc || '') : '',
            idx === 0 ? (g.mode_scope || 'ALL') : '',
            idx === 0 ? (g.wheel_upgrade_to || '') : '',
            idx === 0 ? (Number(g.pick_count) || 0) : '',
            idx === 0 ? (Number(g.collect_target) || 0) : '',
            it.label || '', Number(it.value) || 0, Number(it.weight) || 0,
            !!it.is_end, it.link_jackpot || '',
          ]);
        });
      }
    }
    boldHdr(wsBonus); setCols(wsBonus, [10, 12, 16, 24, 12, 11, 10, 12, 14, 11, 11, 10, 12]);

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
      bonusgames:   'slotplanner.aconfig.bonusgames.v1',   // v6.0-c
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
      bonusgames:   'slotplanner.aconfig.bonusgames.v1',   // v6.0-c
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
    localStorage.setItem(LS_TPL_LIST_KEY, JSON.stringify(list));
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
