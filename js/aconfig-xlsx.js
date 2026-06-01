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
    const bins        = readLS('slotplanner.aconfig.bins.v1',         {});
    const paylines    = readLS('slotplanner.aconfig.paylines.v1',     []);
    const constraints = readLS('slotplanner.aconfig.constraints.v1',  []);
    const reelWeights = readLS('slotplanner.aconfig.reelweights.v1',  {});
    const gridWeights = readLS('slotplanner.aconfig.gridweights.v1',  {});
    const comboWeights= readLS('slotplanner.aconfig.comboweights.v1', {});
    const discards    = readLS('slotplanner.aconfig.discards.v1',     []);
    const rules       = readLS('slotplanner.aconfig.rules.v1',        []);
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
      ['04_Reel_Weights', 'Reel 權重'],
      ['05_Grid_Size_Weights', '格數權重'],
      ['06_Paylines', '中獎線'],
      ['07_Constraints', '硬約束'],
      ['08_Combo_Weights', '連爆權重'],
      ['09_Puzzle_Rules', '腳本規則'],
      ['10_Discard_Rules', '棄牌規則'],
      ['11_Mode_Config', '模式設定'],
      ['12_Distribution_Bins', '分佈區間'],
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
                'SubReel_Position', 'SubReel_Rows', 'SubReel_Inherit_Weight']);
    for (const r of layoutRows) {
      wsL.addRow([r.reel_id, r.y_offset, r.max_rows, r.has_subreel,
                  r.subreel_position, r.subreel_rows, r.subreel_inherit_weight]);
    }
    boldHdr(wsL); setCols(wsL, [10, 10, 10, 13, 18, 14, 22]);

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
    boldHdr(wsRW); setCols(wsRW, [12, 10, 14, 10, 24]);

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
    wsP.addRow(['Line_ID', 'Path', 'Direction', 'Notes']);
    for (const pl of paylines) wsP.addRow([pl.line_id, pl.path, pl.direction, pl.notes]);
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
      bins:         'slotplanner.aconfig.bins.v1',
      paylines:     'slotplanner.aconfig.paylines.v1',
      constraints:  'slotplanner.aconfig.constraints.v1',
      reelweights:  'slotplanner.aconfig.reelweights.v1',
      gridweights:  'slotplanner.aconfig.gridweights.v1',
      comboweights: 'slotplanner.aconfig.comboweights.v1',
      discards:     'slotplanner.aconfig.discards.v1',
      rules:        'slotplanner.aconfig.rules.v1',
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
      bins:         'slotplanner.aconfig.bins.v1',
      paylines:     'slotplanner.aconfig.paylines.v1',
      constraints:  'slotplanner.aconfig.constraints.v1',
      reelweights:  'slotplanner.aconfig.reelweights.v1',
      gridweights:  'slotplanner.aconfig.gridweights.v1',
      comboweights: 'slotplanner.aconfig.comboweights.v1',
      discards:     'slotplanner.aconfig.discards.v1',
      rules:        'slotplanner.aconfig.rules.v1',
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
    localStorage.removeItem(_tplKey(slug));
    const list = listTemplates().filter(t => t.slug !== slug);
    _saveTemplateList(list);
  }

  // 公開:把範本匯出成 JSON(讓使用者下載,給別人使用)
  function exportTemplateJSON(slug) {
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
    const slug = _slugify(name);
    if (!slug) throw new Error('範本名稱含過多特殊字元');
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

  // 暴露
  window.SlotPlanner.Templates = {
    list:   listTemplates,
    save:   saveTemplate,
    load:   loadTemplate,
    remove: deleteTemplate,
    exportJSON: exportTemplateJSON,
    importJSON: importTemplateJSON,
  };

  console.log('[aconfig-xlsx] loaded');
})();
