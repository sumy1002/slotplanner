// ============================================================
//  parser.js — TXT 解析 v3
//  智能群組規則收斂：只合併「結尾純數字」或「_數字非數字」
// ============================================================

(function () {
  'use strict';

  const SHEET_ORDER = ['整體', 'NG', 'FG', 'MG', 'BG', 'SFG'];
  const HEADER = ['名稱', '區間', '數值', 'Min', 'Max', '中位數', '分子', '分母'];

  const FULL_PAT = /^(.+?)\t([\d.]+)\t=\s*([\d.]+)\s*\/\s*([\d.]+)\s*Min:([\d.]+)\s*Max:([\d.]+)(?:[^\n]*?中位數:([\d.]+))?/;
  const DATA_PAT = /^\s*([\d.]+)\s*=\s*([\d.]+)\s*\/\s*([\d.]+)\s*Min:([\d.]+)\s*Max:([\d.]+)(?:[^\n]*?中位數:([\d.]+))?/;
  const SEP_PAT  = /^[=\-*]{3,}\s*$/;

  function cleanMd(s) { return s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); }

  function extractIntervals(name) {
    name = name.trim();
    let m = name.match(/\(([^)]+)\)\s*$/);
    if (m) {
      const labels = m[1].split(',').map(x => x.trim());
      if (labels.length > 1) return [name.slice(0, m.index).trim(), labels];
    }
    m = name.match(/\s+([^\s].+)$/);
    if (m) {
      const tail = m[1];
      if (tail.includes('/')) {
        const labels = tail.split('/').map(x => x.trim());
        if (labels.length > 1) return [name.slice(0, m.index).trim(), labels];
      }
    }
    return [name, []];
  }

  function splitCodeName(raw) {
    raw = raw.trim();
    let m = raw.match(/^(\.[0-9]+\.[0-9]+)(.*)/);
    if (m) return [m[1].trim(), m[2].trim()];
    m = raw.match(/^(-[\w.]+)\s*(.*)/);
    if (m) return [m[1].trim(), m[2].trim()];
    return ['', raw];
  }

  function classifySheet(code, name) {
    const combined = (code + ' ' + name).toUpperCase();
    if (code.startsWith('.')) return '整體';
    for (const tag of ['SFG', 'BG', 'MG', 'NG', 'FG']) {
      if (combined.includes(tag)) return tag;
    }
    return '整體';
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

  // ════════════════════════════════════════════════════════
  //  智能群組合併 v3（保守版）
  //  只在兩種情境合併：
  //    A. 結尾純數字（含 +）：_遞延16, _遞延NG倍數0001, ICON占比13
  //    B. `_數字...剩餘文字`：_0空盤, _9+空盤
  //  其他一律不拆。
  // ════════════════════════════════════════════════════════

  function smartSplit(name) {
    if (!name) return { prefix: name, suffix: '' };

    // 類型 B：_[數字含+][非數字...]
    {
      const m = name.match(/^(_)([0-9][0-9+]*)([^\d].*)$/);
      if (m) return { prefix: '_' + m[3], suffix: m[2] };
    }

    // 類型 A：結尾純數字（含 +），前面必須有非數字內容
    {
      const m = name.match(/^(.*?[^\d+])([0-9][0-9+]*)$/);
      if (m && m[1].trim().length > 0) {
        return { prefix: m[1].replace(/\s+$/, ''), suffix: m[2] };
      }
    }

    // 其他一律保持原狀
    return { prefix: name, suffix: '' };
  }

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
        cur = { name: '', rows: [r] };
        groups.push(cur);
      }
    }
    return groups;
  }

  function mergeGroups(groups) {
    if (!groups.length) return groups;

    const withSplit = groups.map(g => ({ ...g, ...smartSplit(g.name) }));

    // 統計每個前綴出現幾次
    const prefixCount = {};
    withSplit.forEach(g => {
      if (g.prefix && g.prefix !== g.name) {
        prefixCount[g.prefix] = (prefixCount[g.prefix] || 0) + 1;
      }
    });

    const merged = [];
    const seenPrefix = new Set();
    const seenName   = new Set();

    withSplit.forEach(g => {
      if (seenName.has(g.name)) return;

      const usePrefix = g.prefix !== g.name && (prefixCount[g.prefix] || 0) >= 2;

      if (!usePrefix) {
        seenName.add(g.name);
        merged.push({ name: g.name, rows: g.rows });
        return;
      }

      if (seenPrefix.has(g.prefix)) return;
      seenPrefix.add(g.prefix);

      const siblings = withSplit.filter(x => x.prefix === g.prefix && !seenName.has(x.name));
      siblings.forEach(s => seenName.add(s.name));

      const mergedRows = [];
      siblings.forEach(s => {
        s.rows.forEach((r, ri) => {
          mergedRows.push({
            ...r,
            _mergeLabel: ri === 0 ? s.suffix : '',
            _origName:   s.name,
            _origRowIdx: ri,
            _groupName:  g.prefix,
          });
        });
      });

      merged.push({ name: g.prefix, rows: mergedRows, _merged: true, _siblings: siblings.map(s => s.name) });
    });

    return merged;
  }

  function extractSmartGroups(rows) {
    return mergeGroups(extractGroups(rows));
  }

  function isSeparator(line) { return SEP_PAT.test(line.trim().replace(/\r$/, '')); }

  function splitAllSections(txt) {
    const lines = txt.split('\n');
    let firstDataIdx = null;
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].replace(/\r$/, '').trim();
      if (FULL_PAT.test(s) || DATA_PAT.test(s)) { firstDataIdx = i; break; }
    }
    if (firstDataIdx === null) return [[], txt];
    const preLines = lines.slice(1, firstDataIdx);
    const headerBlocks = [];
    let current = [];
    for (const line of preLines) {
      const stripped = line.replace(/\r$/, '').trim();
      if (isSeparator(stripped)) {
        if (current.length) { headerBlocks.push(current); current = []; }
      } else if (stripped) { current.push(stripped); }
    }
    if (current.length) headerBlocks.push(current);
    return [headerBlocks, lines.slice(firstDataIdx).join('\n')];
  }

  function parse(txt) {
    if (!txt.includes('\t') && txt.includes('\\t')) txt = txt.replace(/\\t/g, '\t');
    const [headerBlocks, dataTxt] = splitAllSections(txt);
    const sheets = {};
    const addRow = (sheet, row) => { if (!sheets[sheet]) sheets[sheet] = []; sheets[sheet].push(row); };

    let currentName = '', currentSheet = '整體', currentIntervals = [], intervalIndex = 0;

    for (let line of dataTxt.split('\n')) {
      line = cleanMd(line).replace(/\s+$/, '');
      if (!line.trim()) continue;

      let m = line.match(FULL_PAT);
      if (m) {
        const prefix = m[1].trim();
        const [val, num, den, mn, mx] = [m[2], m[3], m[4], m[5], m[6]];
        const median = m[7] || '0';
        const [code, rawName] = splitCodeName(prefix);
        const [cleanName, intervals] = extractIntervals(rawName);
        currentName = cleanName;
        currentIntervals = intervals;
        intervalIndex = 0;
        currentSheet = classifySheet(code, cleanName);
        addRow(currentSheet, { name: cleanName, interval: '', val, mn, mx, median, num, den });
        continue;
      }

      m = line.match(DATA_PAT);
      if (m) {
        const [val, num, den, mn, mx] = [m[1], m[2], m[3], m[4], m[5]];
        const median = m[6] || '0';
        let interval, nameCol;
        if (currentIntervals.length && intervalIndex < currentIntervals.length) {
          interval = currentIntervals[intervalIndex];
          nameCol = intervalIndex === 0 ? currentName : '';
          intervalIndex++;
        } else { interval = ''; nameCol = currentName; }
        addRow(currentSheet, { name: nameCol, interval, val, mn, mx, median, num, den });
        continue;
      }

      const label = line.replace(/\t+$/, '').trim();
      if (label) {
        const [code, rawName] = splitCodeName(label);
        const [cleanName, intervals] = extractIntervals(rawName);
        currentName = cleanName;
        currentIntervals = intervals;
        intervalIndex = 0;
        currentSheet = classifySheet(code, cleanName);
      }
    }

    return { headerBlocks, sheets };
  }

  function tryDecode(buf, encoding) {
    try { return new TextDecoder(encoding, { fatal: true }).decode(buf); }
    catch (e) { return null; }
  }

  function decodeText(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    let working = buf;
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      working = buf.slice(3);
    }
    for (const enc of ['utf-8', 'big5', 'gbk']) {
      const result = tryDecode(working, enc);
      if (result !== null) return result;
    }
    return new TextDecoder('utf-8').decode(working);
  }

  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.parser = {
    SHEET_ORDER, HEADER,
    parse, decodeText,
    getGroupPrefix,
    extractGroups,
    extractSmartGroups,
    smartSplit,
    mergeGroups,
  };
})();
