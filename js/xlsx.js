// ============================================================
//  xlsx.js — XLSX 生成（ExcelJS）
//  對應 txt_to_xlsx.py 的 write_sheet / build_xlsx
//  v2：支援欄位篩選（cols）與項目群組篩選（filter）
// ============================================================

(function () {
  'use strict';

  const HEADER = ['名稱', '區間', '數值', 'Min', 'Max', '中位數', '分子', '分母'];
  const HEADER_KEYS = ['name', 'interval', 'val', 'mn', 'mx', 'median', 'num', 'den'];
  const SHEET_ORDER = ['整體', 'NG', 'FG', 'MG', 'BG', 'SFG'];

  const SHEET_THEMES = {
    '整體': { data: ['F5E8D5', 'EDD9C0'], header_bg: 'C8A882', header_fg: '5D3A1A', meta_bg: 'EDD9C0', meta_fg: '7a5a3a' },
    'NG':   { data: ['A8DDD7', '81C8BD'], header_bg: '4A9E95', header_fg: 'FFFFFF', meta_bg: '81C8BD', meta_fg: '2d6b63' },
    'FG':   { data: ['B8DDF5', '87CEEB'], header_bg: '4A8AAA', header_fg: 'FFFFFF', meta_bg: '87CEEB', meta_fg: '2a6a8a' },
    'MG':   { data: ['DDD0F0', 'C9B8E8'], header_bg: '8A6EBB', header_fg: 'FFFFFF', meta_bg: 'C9B8E8', meta_fg: '5a3d8a' },
    'BG':   { data: ['FAF0C0', 'F5E6A3'], header_bg: 'B8A040', header_fg: 'FFFFFF', meta_bg: 'F5E6A3', meta_fg: '7a6020' },
    'SFG':  { data: ['FAD0DC', 'F4B8C8'], header_bg: 'C06080', header_fg: 'FFFFFF', meta_bg: 'F4B8C8', meta_fg: '8a3050' },
  };
  const COLOR_EMPTY = 'FFFFFF';
  const FONT_XLSX = '微軟正黑體';
  const ROW_HEIGHT = 23;
  const BORDER_COLOR = 'B0D0D0';

  function argb(hex6) { return 'FF' + hex6; }

  function makeBorder() {
    const s = { style: 'thin', color: { argb: argb(BORDER_COLOR) } };
    return { top: s, left: s, bottom: s, right: s };
  }

  function applyCell(cell, value, opts) {
    opts = opts || {};
    const bold = opts.bold || false;
    const bg = opts.bg || null;
    const fg = opts.fg || '1A4A4A';
    const hAlign = opts.hAlign || 'left';
    const vAlign = opts.vAlign || 'middle';
    const border = opts.border !== false;
    const size = opts.size || 10;
    cell.value = (value === undefined || value === null) ? '' : value;
    cell.font = { name: FONT_XLSX, bold, color: { argb: argb(fg) }, size };
    cell.alignment = { horizontal: hAlign, vertical: vAlign, wrapText: false };
    if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(bg) } };
    if (border) cell.border = makeBorder();
  }

  function cjkLength(s) {
    let n = 0;
    for (const c of String(s)) n += (c.codePointAt(0) > 127 ? 2 : 1);
    return n;
  }

  function getGroupPrefix(name) {
    if (!name) return name;
    if (name.includes('_')) {
      const idx = name.indexOf('_');
      const prefix = name.slice(0, idx);
      const suffix = name.slice(idx + 1);
      const m = suffix.match(/^[0-9+]+(.+)$/);
      if (m) return m[1].trim();
      return prefix || name.replace(/[0-9]+$/, '').trim();
    }
    const stripped = name.replace(/[0-9]+$/, '').trim();
    return stripped || name;
  }

  // ── 從 rows 抽出群組結構，回傳 [{name, rows}] ──
  function extractGroups(rows) {
    const groups = [];
    let cur = null;
    for (const r of rows) {
      if (r.name && r.name.trim()) {
        cur = { name: r.name.trim(), rows: [r] };
        groups.push(cur);
      } else if (cur) {
        cur.rows.push(r);
      } else {
        // 無名開頭（罕見）掛在虛擬群組
        cur = { name: '', rows: [r] };
        groups.push(cur);
      }
    }
    return groups;
  }

  function writeHeaderBlockRows(ws, block, startRow, theme, colCount) {
    let row = startRow;
    for (let line of block) {
      line = line.trim();
      if (!line) continue;
      const parts = line.split('\t').map(p => p.trim());
      if (parts.length === 1) {
        ws.mergeCells(row, 1, row, colCount);
        const cell = ws.getCell(row, 1);
        cell.value = parts[0];
        cell.font = { name: FONT_XLSX, bold: true, color: { argb: argb(theme.header_fg) }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(theme.header_bg) } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = makeBorder();
      } else {
        for (let ci = 1; ci <= Math.min(parts.length, colCount); ci++) {
          const cell = ws.getCell(row, ci);
          cell.value = parts[ci - 1];
          cell.font = { name: FONT_XLSX, color: { argb: argb(theme.meta_fg) }, size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(theme.meta_bg) } };
          cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
          cell.border = makeBorder();
        }
      }
      ws.getRow(row).height = ROW_HEIGHT;
      row++;
    }
    return row;
  }

  // ── cols: Set of HEADER names to include（null = 全部）
  // ── filterCfg: { sheetName: { groupName: { groupOn, subOn } } }（null = 全部）
  // ── orderCfg:  { groupOrder, subOrder }
  //      groupOrder[sh] = [smartGroupName, ...]
  //      subOrder[sh][smartGroupName] = ["origName|origRowIdx", ...]
  function writeSheet(ws, headerBlocks, rows, sheetName, cols, filterCfg, orderCfg) {
    const theme = SHEET_THEMES[sheetName] || SHEET_THEMES['整體'];

    const activeColIdxs = HEADER.map((h, i) => ({ h, i, key: HEADER_KEYS[i] }))
      .filter(({ h }) => !cols || cols.has(h));
    const colCount = activeColIdxs.length;
    if (colCount === 0) return;

    // ── 1. 套用排序 + 篩選 ──
    // 整體 sheet 跳過排序、保持原始順序
    let filteredRows;
    if (sheetName === '整體' || !orderCfg || !orderCfg.groupOrder?.[sheetName]) {
      // 老邏輯：依原始順序篩選
      filteredRows = rows || [];
      if (filterCfg && filterCfg[sheetName]) {
        const sheetFilter = filterCfg[sheetName];
        const groups = extractGroups(filteredRows);
        const outRows = [];
        for (const g of groups) {
          const gFilter = sheetFilter[g.name];
          if (!gFilter || !gFilter.groupOn) continue;
          g.rows.forEach((r, ri) => {
            if (gFilter.subOn[ri] !== false) outRows.push(r);
          });
        }
        filteredRows = outRows;
      }
    } else {
      // 套用排序 ──
      // 1. 先用 SmartGroups 拿到當前所有合併群組
      // 2. 依 groupOrder 重排
      // 3. 各合併群組底下用 subOrder 重排 displayRow
      // 4. 把 displayRow 對應回原始 row 並套用 filterCfg
      filteredRows = applyOrderedFilter(rows || [], sheetName, filterCfg, orderCfg);
    }

    let current = 1;

    // 「整體」表才印 header blocks
    if (sheetName === '整體' && headerBlocks && headerBlocks.length) {
      const block0Text = headerBlocks[0].filter(l => l.trim()).join('\n');
      if (block0Text.trim()) {
        ws.mergeCells(current, 1, current, colCount);
        const cell = ws.getCell(current, 1);
        cell.value = block0Text;
        cell.font = { name: FONT_XLSX, bold: true, color: { argb: argb(theme.meta_fg) }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(theme.meta_bg) } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = makeBorder();
        const lineCount = Math.max(1, (block0Text.match(/\n/g) || []).length + 1);
        ws.getRow(current).height = Math.max(ROW_HEIGHT, lineCount * 15);
        current++;
      }
      for (let i = 1; i < headerBlocks.length; i++) {
        current = writeHeaderBlockRows(ws, headerBlocks[i], current, theme, colCount);
      }
    }

    // 標題列
    if (filteredRows.length) {
      const headerRow = current;
      activeColIdxs.forEach(({ h }, ci) => {
        applyCell(ws.getCell(headerRow, ci + 1), h, {
          bold: true, bg: theme.header_bg, fg: theme.header_fg,
          hAlign: 'center', vAlign: 'middle',
        });
      });
      ws.getRow(headerRow).height = ROW_HEIGHT;
      current++;
      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRow }];
    }

    // 資料列（同組交替底色）
    let colorIdx = 0;
    let prevPrefix = null;
    let prevName = null;  // 用於「相鄰同名留空」邏輯
    const dataColors = theme.data;
    for (const r of filteredRows) {
      const displayName = r.name;
      const curPrefix = displayName ? getGroupPrefix(displayName) : prevPrefix;
      const isNewGroup = (displayName !== '' && curPrefix !== prevPrefix);
      if (isNewGroup && prevPrefix !== null) {
        for (let ci = 1; ci <= colCount; ci++) {
          applyCell(ws.getCell(current, ci), '', { bg: COLOR_EMPTY, border: false });
        }
        ws.getRow(current).height = ROW_HEIGHT;
        current++;
        colorIdx++;
        prevName = null;  // 跨群組重置
      }
      if (isNewGroup) prevPrefix = curPrefix;
      const bg = dataColors[colorIdx % 2];

      // 「相鄰同名」邏輯：若這筆 name 跟前一筆完全相同，輸出時留空（視覺像合併欄）
      const outputName = (displayName && displayName === prevName) ? '' : displayName;
      const outRow = { ...r, name: outputName };
      prevName = displayName;  // 用原始 displayName 追蹤，不是 outputName

      activeColIdxs.forEach(({ key }, ci) => {
        applyCell(ws.getCell(current, ci + 1), outRow[key], {
          bg, hAlign: ci > 0 ? 'center' : 'left', vAlign: 'middle',
        });
      });
      ws.getRow(current).height = ROW_HEIGHT;
      current++;
    }

    // 自動欄寬
    activeColIdxs.forEach(({ h }, ci) => {
      let maxLen = cjkLength(h);
      ws.getColumn(ci + 1).eachCell((cell) => {
        if (cell.value) {
          const v = String(cell.value).split('\n')[0];
          maxLen = Math.max(maxLen, cjkLength(v));
        }
      });
      ws.getColumn(ci + 1).width = maxLen + 3;
    });
  }

  // cols: Set<string> | null
  // filterCfg: { [sheet]: { [groupName]: { groupOn, subOn: bool[] } } } | null
  // ════════════════════════════════════════════════════════
  //  applyOrderedFilter
  //  依 orderCfg 排序 + filterCfg 篩選，回傳最終 rows 陣列
  // ════════════════════════════════════════════════════════
  function applyOrderedFilter(rows, sheetName, filterCfg, orderCfg) {
    if (!window.SlotPlanner?.parser?.extractSmartGroups) {
      // fallback：直接篩選
      return rows;
    }
    const sp = window.SlotPlanner.parser;
    const smart = sp.extractSmartGroups(rows);

    // 依 groupOrder 排序
    const groupOrder = orderCfg.groupOrder[sheetName] || [];
    const smartMap = new Map(smart.map(g => [g.name, g]));
    const orderedSmart = [];
    groupOrder.forEach(name => {
      if (smartMap.has(name)) { orderedSmart.push(smartMap.get(name)); smartMap.delete(name); }
    });
    smartMap.forEach(g => orderedSmart.push(g));

    const subOrderMap = orderCfg.subOrder?.[sheetName] || {};
    const sheetFilter = filterCfg?.[sheetName] || {};

    const outRows = [];

    orderedSmart.forEach(sg => {
      // 建出 displayRows（同 modal 的邏輯）
      let displayRows;
      if (sg._merged) {
        displayRows = [];
        const siblings = {};
        sg.rows.forEach(r => {
          const key = r._origName;
          if (!siblings[key]) siblings[key] = { rows: [] };
          siblings[key].rows.push(r);
        });
        const sibOrder = [];
        sg.rows.forEach(r => { if (!sibOrder.includes(r._origName)) sibOrder.push(r._origName); });
        sibOrder.forEach(name => {
          const s = siblings[name];
          s.rows.forEach((r, idx) => {
            displayRows.push({ row: r, origName: name, origRowIdx: idx });
          });
        });
      } else {
        displayRows = sg.rows.map((r, idx) => ({
          row: r, origName: sg.name, origRowIdx: idx,
        }));
      }

      // 套用 subOrder
      const so = subOrderMap[sg.name];
      if (so && so.length) {
        const keyOf = d => `${d.origName}|${d.origRowIdx}`;
        const map = new Map(displayRows.map(d => [keyOf(d), d]));
        const ordered = [];
        so.forEach(k => { if (map.has(k)) { ordered.push(map.get(k)); map.delete(k); } });
        map.forEach(d => ordered.push(d));
        displayRows = ordered;
      }

      // 套用 filter
      displayRows.forEach(d => {
        const gFilter = sheetFilter[d.origName];
        if (!gFilter || !gFilter.groupOn) return;
        if (gFilter.subOn[d.origRowIdx] === false) return;
        outRows.push(d.row);
      });
    });

    return outRows;
  }

  async function buildXlsx(headerBlocks, sheets, cols, filterCfg, orderCfg) {
    const wb = new ExcelJS.Workbook();
    const ws整體 = wb.addWorksheet('整體');
    writeSheet(ws整體, headerBlocks, sheets['整體'] || [], '整體', cols, filterCfg, orderCfg);
    for (const name of SHEET_ORDER) {
      if (name === '整體' || !sheets[name]) continue;
      const ws = wb.addWorksheet(name);
      writeSheet(ws, [], sheets[name], name, cols, filterCfg, orderCfg);
    }
    return wb;
  }

  // ── Export ──
  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.xlsx = {
    buildXlsx,
    SHEET_ORDER,
    HEADER,
    HEADER_KEYS,
    extractGroups,
  };
})();
