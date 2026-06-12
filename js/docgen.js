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
  const SPECIAL_TYPES = new Set(['WILD', 'SCATTER', 'BONUS', 'SPECIAL']);
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
      default:
        return `${name} 為特殊圖示，具備專屬的觸發或替代行為，請補充其出現輪、數量門檻與效果。`;
    }
  }

  function _payTypeLabel(g) {
    const pt = (g.pay_type || 'LINE').toUpperCase();
    const map = { LINE: '連線（Payline）', WAYS: '全路徑（Ways）', SCATTER: '散佈（Scatter）', CLUSTER: '群聚（Cluster）' };
    let label = map[pt] || pt;
    if (g.megaways) label += '／Megaways';
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

    const allSyms = Array.isArray(registryRaw.symbols) ? registryRaw.symbols : [];
    const syms = allSyms.filter(s => s.enabled !== false);
    const normalSyms  = syms.filter(s => !_isSpecial(s));
    const specialSyms = syms.filter(s => _isSpecial(s));

    const heights = layoutRows.map(r => Number(r.max_rows) || 0).filter(n => n > 0);
    const gridStr = heights.join('-');
    const waysCount = heights.length ? heights.reduce((a, n) => a * n, 1) : 0;

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
      derived: {
        gridStr,
        waysCount,
        reelCount: heights.length,
        payTypeLabel: _payTypeLabel(g),
        startingMode: g.starting_mode || (modes[0] && modes[0].mode) || 'NG',
      },
    };
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
      .map(j => ({
        name: j.name || j.jp_id,
        mult: Number(j.mult) || 0,
        kind: j.kind || 'FIXED',                       // v5.2
        increment_pct: Number(j.increment_pct) || 0,   // v5.2
        must_hit_by: Number(j.must_hit_by) || 0,       // v5.2
        trigger_desc: j.trigger_desc || '',            // v5.2
      }));
    return rows.length ? rows : null;
  }

  function defaultMeta(config) {
    const cfg = config || collectConfig();
    // 各模式一句話描述（預帶 modes.notes）
    const modeDesc = {};
    cfg.modes.forEach(m => { if (m.mode) modeDesc[m.mode] = m.notes || ''; });
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
      flags: { wild: cfg.specialSyms.some(s => s.is_wild), payline: false, symbol_count: false, special: cfg.specialSyms.length > 0 },
      payline_desc: '',
      score_formula: '押注額 × 連線圖示組合數 × 圖示賠率 ＝ 獲得彩金',
      game_overview: '',
      mode_desc: modeDesc,
      special_behavior: specialBehavior,
      jackpot: {
        // v5.1:優先自動帶入設定檔的 JP 定義(slotplanner.aconfig.jackpots.v1,
        //   即 A.xlsx 13_Jackpots);設定檔沒有 JP 才退回通用四級樣板。
        rows: _jackpotRowsFromConfig() || [
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
    const base = defaultMeta(cfg);
    const out = Object.assign({}, base, meta);
    out.flags = Object.assign({}, base.flags, meta.flags || {});
    out.jackpot = Object.assign({}, base.jackpot, meta.jackpot || {});
    if (!Array.isArray(out.jackpot.rows) || !out.jackpot.rows.length) out.jackpot.rows = base.jackpot.rows;
    out.freegame = Object.assign({}, base.freegame, meta.freegame || {});
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
    const waysLine = cfg.derived.waysCount
      ? `連線型態：${cfg.derived.payTypeLabel}，共 ${cfg.derived.waysCount} 種連線方式。`
      : `連線型態：${cfg.derived.payTypeLabel}。`;
    kv('連線方式', m.payline_desc ? `${waysLine}\n${m.payline_desc}` : waysLine, { height: 36 });
    kv('得分規則', m.score_formula);

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

    // JACKPOT
    band('JACKPOT');
    {
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
    kv('進入盤面顯示', m.freegame.enter_board);
    kv('結束盤面顯示', m.freegame.exit_board);
    kv('盤面(H×W)', cfg.derived.gridStr);
    kv('連線方式', cfg.derived.waysCount ? `共 ${cfg.derived.waysCount} 種連線方式` : '');
    kv('局數設定', (Number(m.freegame.min_spins) || 0) > 0 ? `最少 ${m.freegame.min_spins} 局 FREE SPINS` : '');
    kv('加局', m.freegame.add_spins);
    kv('上限', m.freegame.cap === '有' ? `有（${m.freegame.cap_value || TODO}）` : m.freegame.cap);

    // ── Sheet 2：圖示賠付明細 ──
    const wsS = wb.addWorksheet('圖示賠付明細');
    wsS.columns = [{ width: 8 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];
    let SR = 1;
    function symHeader(title, bg) {
      wsS.mergeCells(SR, 1, SR, 7);
      _cell(wsS, SR, 1, title, { bold: true, bg: C.band, fg: C.bandFg, size: 11 });
      SR++;
      ['編號', '名稱', '類型', '5連線', '4連線', '3連線'].forEach((h, i) =>
        _cell(wsS, SR, i + 1, h, { bold: true, bg: bg, fg: C.thFg, h: 'center' }));
      _cell(wsS, SR, 7, '備註', { bold: true, bg: bg, fg: C.thFg, h: 'center' });
      SR++;
    }
    function symRow(s, role) {
      _cell(wsS, SR, 1, s.number !== '' && s.number != null ? s.number : '', { h: 'center' });
      _cell(wsS, SR, 2, s.name || _symId(s));
      _cell(wsS, SR, 3, role || (s.type || ''), { h: 'center' });
      _cell(wsS, SR, 4, s.pay_5x || 0, { h: 'center' });
      _cell(wsS, SR, 5, s.pay_4x || 0, { h: 'center' });
      _cell(wsS, SR, 6, s.pay_3x || 0, { h: 'center' });
      _cell(wsS, SR, 7, '');
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
        wsS.mergeCells(SR, 1, SR, 7);
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
    xBand('中獎線 / 路徑');
    ['Line_ID', 'Path', 'Direction', '備註'].forEach((h, i) => _cell(wsX, XR, i + 1, h, { bold: true, bg: C.th, fg: C.thFg, h: 'center' }));
    XR++;
    const plDir = (cfg.global && cfg.global.payline_direction) || (cfg.global && cfg.global.ways_direction) || 'LTR';
    if (cfg.paylines.length) {
      cfg.paylines.forEach(pl => {
        _cell(wsX, XR, 1, pl.line_id, { h: 'center' });
        _cell(wsX, XR, 2, pl.path || '');
        _cell(wsX, XR, 3, plDir, { h: 'center' });
        _cell(wsX, XR, 4, pl.notes || '');
        XR++;
      });
    } else {
      wsX.mergeCells(XR, 1, XR, 4);
      _cell(wsX, XR, 1, cfg.derived.payTypeLabel.indexOf('Ways') >= 0 ? '（全路徑模式，無逐線定義）' : '（無中獎線資料）', { fg: C.todoFg });
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
    if (cfg.derived.waysCount) L.push(`- 連線種數：${cfg.derived.waysCount}`);
    L.push(`- 起始模式：${cfg.derived.startingMode}`);
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
    L.push('| 編號 | 名稱 | 類型 | 5連線 | 4連線 | 3連線 |');
    L.push('| --- | --- | --- | --- | --- | --- |');
    cfg.normalSyms.forEach(s => {
      L.push(`| ${s.number ?? ''} | ${s.name || _symId(s)} | ${s.type || ''} | ${s.pay_5x || 0} | ${s.pay_4x || 0} | ${s.pay_3x || 0} |`);
    });
    cfg.specialSyms.forEach(s => {
      L.push(`| ${s.number ?? ''} | ${s.name || _symId(s)} | ${_symRole(s) || '特殊'} | ${s.pay_5x || 0} | ${s.pay_4x || 0} | ${s.pay_3x || 0} |`);
    });
    L.push('');

    // 連線 / 計分規則
    L.push('## 連線 / 計分規則');
    L.push('');
    if (m.payline_desc) { L.push(m.payline_desc); L.push(''); }
    L.push(`- 計分方式：${m.score_formula}`);
    L.push('');

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

    // JACKPOT
    if (m.jackpot.rows && m.jackpot.rows.length) {
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
    if ((Number(m.freegame.min_spins) || 0) > 0) L.push(`- 局數：最少 ${m.freegame.min_spins} 局`);
    L.push(`- 加局：${m.freegame.add_spins}`);
    L.push(`- 上限：${m.freegame.cap === '有' ? ('有（' + (m.freegame.cap_value || '待填') + '）') : m.freegame.cap}`);
    if (m.freegame.enter_board) L.push(`- 進入盤面：${m.freegame.enter_board}`);
    if (m.freegame.exit_board) L.push(`- 結束盤面：${m.freegame.exit_board}`);
    L.push('');

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

    <!-- 設定檔自動帶入摘要 -->
    <div class="docgen-summary glass-panel-flat">
      <div class="docgen-sum-title">設定檔將自動帶入</div>
      <div class="docgen-sum-grid">
        <div><span class="docgen-sum-k">盤面</span><span class="docgen-sum-v">{{ cfg.derived.gridStr || '—' }}</span></div>
        <div><span class="docgen-sum-k">連線</span><span class="docgen-sum-v">{{ cfg.derived.payTypeLabel }}<template v-if="cfg.derived.waysCount">／{{ cfg.derived.waysCount }} 種</template></span></div>
        <div><span class="docgen-sum-k">模式</span><span class="docgen-sum-v">{{ cfg.modes.map(m => m.mode).filter(Boolean).join(' / ') || '—' }}</span></div>
        <div><span class="docgen-sum-k">圖示</span><span class="docgen-sum-v">一般 {{ cfg.normalSyms.length }}・特殊 {{ cfg.specialSyms.length }}</span></div>
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

    <!-- 連線 / 計分 -->
    <div class="docgen-sec">
      <div class="docgen-sec-h">連線 / 計分</div>
      <div class="field-label">連線方式（白話敘述）</div>
      <textarea class="input docgen-ta" v-model="meta.payline_desc"
        placeholder="例：滾輪停止後，從【第一輪】或【第五輪】算起有連續 3 個以上相同圖示即可得分。"></textarea>
      <div class="field-label">得分公式</div>
      <input class="input" v-model="meta.score_formula">
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

    <!-- JACKPOT -->
    <div class="docgen-sec">
      <div class="docgen-sec-h">JACKPOT
        <button class="btn btn-sm docgen-jp-sync" @click="syncJpFromConfig"
                title="以設定檔(01_Global · JP 定義 → 13_Jackpots)覆蓋下方列表">
          ⇆ 從設定檔帶入
        </button>
      </div>
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
    </div>

    <!-- FREE GAME -->
    <div class="docgen-sec">
      <div class="docgen-sec-h">FREE GAME</div>
      <div class="field-label">觸發方式</div>
      <textarea class="input docgen-ta" v-model="meta.freegame.trigger"
        placeholder="例：一般遊戲中於第 2、3、4 輪出現至少 1 個 FREE 圖示即進入 FG。"></textarea>
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
        Object.assign(meta, SP.DocGen.mergeMeta(JSON.parse(JSON.stringify(meta)), cfg));
      }

      function save() {
        SP.DocGen.saveMeta(JSON.parse(JSON.stringify(meta)));
        setHint('✔ 已儲存敘述（下次進站自動帶回）', 'ok');
      }
      function addJp() { meta.jackpot.rows.push({ name: '', mult: 0 }); }
      function removeJp(i) { meta.jackpot.rows.splice(i, 1); }
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

      return { cfg, meta, busy, hint, symId, role, save, addJp, removeJp, syncJpFromConfig, fillBehavior, exportXlsx, exportMd, refreshConfig };
    },
  };

  console.log('[docgen] loaded');
})();
