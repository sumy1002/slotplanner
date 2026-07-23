// ============================================================================
// docgen-v2.js — 機制文件（格式規範 v1.0）匯出器 M1 骨架
// ----------------------------------------------------------------------------
//  ◆ 完全獨立 IIFE 新檔：docgen.js 一 byte 不動（凍結閘門恆綠）。
//  ◆ 唯讀取用既有 LS；新增授權讀取鍵 slotplanner.docv2.v1（授權欄位，M4 出 UI）。
//  ◆ 鐵律：純白話、零內部設定值外洩 —— 尚未白話化(M3)之 DSL 一律以占位句
//    呈現，絕不印原始條件/動作字串。本工具不執行玩法、不計算 RTP。
//  ◆ 章節骨架 = 機制文件格式規範 v1.0（模式優先 / 同一般遊戲繼承 / ※例外 /
//    未確認事項集中文末）。
// ============================================================================
(function () {
  'use strict';

  // ── LS 唯讀 ────────────────────────────────────────────────────────────
  function _readLS(key, fb) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fb; }
    catch (e) { return fb; }
  }

  // ── 收集（唯讀鏡像 collectConfig 之必要子集；獨立實作不依賴 docgen.js） ──
  function _collect() {
    const g        = _readLS('slotplanner.aconfig.global.v1', {});
    const modes    = _readLS('slotplanner.aconfig.modes.v1', []);
    const layout   = _readLS('slotplanner.aconfig.layout.v1', []);
    const paylines = _readLS('slotplanner.aconfig.paylines.v1', []);
    const rules    = _readLS('slotplanner.aconfig.rules.v1', []);
    const reg      = _readLS('slotplanner.registry.v1', { symbols: [] });
    const mults    = _readLS('slotplanner.aconfig.multipliers.v1', {});
    const panels   = _readLS('slotplanner.aconfig.panels.v1', []);
    const docv2    = _readLS('slotplanner.docv2.v1', {});      // 授權欄位（M4 UI）
    const syms = (Array.isArray(reg.symbols) ? reg.symbols : []).filter(s => s && s.enabled !== false);
    const SPECIAL = new Set(['WILD', 'SCATTER', 'FREE', 'BONUS', 'COIN', 'SPECIAL']);
    const isSp = s => SPECIAL.has(String(s.type || '').toUpperCase());
    return {
      g, modes: Array.isArray(modes) ? modes : [],
      layout: Array.isArray(layout) ? layout : [],
      paylines: Array.isArray(paylines) ? paylines : [],
      rules: Array.isArray(rules) ? rules : [],
      syms, normal: syms.filter(s => !isSp(s)), special: syms.filter(isSp),
      mults: (mults && typeof mults === 'object') ? mults : {},
      panels: Array.isArray(panels) ? panels : [],
      docv2: (docv2 && typeof docv2 === 'object') ? docv2 : {},
    };
  }

  // ── 小工具 ────────────────────────────────────────────────────────────
  const _symName = s => (s && (s.name || s.id || s.sid)) || '';
  function _payRows(s) {
    return (Array.isArray(s.pay_rows) ? s.pay_rows : [])
      .filter(r => r && (Number(r.count) || 0) > 0);
  }
  const _bandKey = r => (Number(r.count_to) > 0 ? `${r.count}–${r.count_to}` : String(r.count));
  function _gridStr(layout) {
    return layout.map(r => Number(r.max_rows) || 0).filter(n => n > 0).join('-');
  }
  function _minMatch(c) {
    const ms = c.syms.map(s => Number(s.min_match) || 0).filter(n => n > 0);
    return ms.length ? Math.min.apply(null, ms) : 3;
  }
  const PAY_LABEL = { LINE: '連線', WAYS: 'ways 連線', SCATTER: '圖示數量', CLUSTER: '相鄰群' };

  // ── M2 幾何層：連線幾何自動命名（純函式；v=各輪列號 1-based, H=最大列數） ──
  function _lineGeomLabel(v, H) {
    const N = v.length;
    if (!N || v.some(x => !(x >= 1))) return '';
    if (v.every(x => x === v[0])) {
      const r = v[0];
      if (r === 1) return '頂列';
      if (r === H) return '底列';
      if (H % 2 === 1 && r === (H + 1) / 2) return '中列';
      return `第 ${r} 列`;
    }
    const inc = v.every((x, i) => i === 0 || x === v[i - 1] + 1);
    const dec = v.every((x, i) => i === 0 || x === v[i - 1] - 1);
    if (inc && v[0] === 1 && v[N - 1] === H) return '主對角 ↘';
    if (dec && v[0] === H && v[N - 1] === 1) return '反對角 ↗';
    if (inc) return `下斜（第 ${v[0]} 列→第 ${v[N - 1]} 列）`;
    if (dec) return `上斜（第 ${v[0]} 列→第 ${v[N - 1]} 列）`;
    // 對稱單折點（V／倒V）
    if (N % 2 === 1 && v.every((x, i) => x === v[N - 1 - i])) {
      const mid = (N - 1) / 2;
      let up = true, down = true;
      for (let i = 1; i <= mid; i++) {
        if (v[i] <= v[i - 1]) up = false;
        if (v[i] >= v[i - 1]) down = false;
      }
      if (up)   return 'V 形'   + (v[mid] === H ? '（觸底）' : (v[0] === 1 ? '（頂起）' : ''));
      if (down) return '倒 V 形' + (v[mid] === 1 ? '（觸頂）' : (v[0] === H ? '（底起）' : ''));
    }
    // 鋸齒（兩值交錯）
    if (v[0] !== v[1] && v.every((x, i) => x === (i % 2 === 0 ? v[0] : v[1]))) {
      return `鋸齒（第 ${v[0]}／${v[1]} 列交錯）`;
    }
    // 單點偏移（其餘同列）
    {
      const cnt = {};
      v.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
      const maj = Object.keys(cnt).map(Number).find(x => cnt[x] === N - 1);
      if (maj != null) {
        const k = v.findIndex(x => x !== maj), d = v[k];
        if (k === 0)     return `第 ${maj} 列（首輪落第 ${d} 列）`;
        if (k === N - 1) return `第 ${maj} 列（尾輪落第 ${d} 列）`;
        return `第 ${maj} 列（第 ${k + 1} 輪${d > maj ? '下探' : '上凸'}第 ${d} 列）`;
      }
    }
    // 非嚴格單調（階梯）
    if (v.every((x, i) => i === 0 || x >= v[i - 1])) return `緩降階梯（第 ${v[0]} 列→第 ${v[N - 1]} 列）`;
    if (v.every((x, i) => i === 0 || x <= v[i - 1])) return `緩升階梯（第 ${v[0]} 列→第 ${v[N - 1]} 列）`;
    return '折線';
  }
  function _pathRows(p) {
    // path 支援 [[reel,row0],…] 或 [{reel,row},…]；輸出 1-based 列號陣列
    if (!Array.isArray(p && p.path)) return null;
    const rows = p.path.map(pt => Array.isArray(pt) ? pt[1] : (pt && pt.row));
    if (rows.some(r => r == null || isNaN(Number(r)))) return null;
    return rows.map(r => Number(r) + 1);
  }

  // ── M2 幾何敘述模板：Megaways／水平副輪／滾補方向 ────────────────────
  const _DIR_ZH = { DOWN: '由上往下', UP: '由下往上', LEFT: '由右向左', RIGHT: '由左向右' };
  function _megawaysSentence(c, md) {
    const m = md || {};
    if (m.rows_variable) {
      if (Array.isArray(m.reel_ranges) && m.reel_ranges.length) {
        const rr = m.reel_ranges.map((r, i) => `第 ${i + 1} 輪 ${r.min ?? r[0]}～${r.max ?? r[1]} 格`).join('、');
        return `每輪每局格數變動（Megaways）：${rr}；格數組合決定當局連線組合數。`;
      }
      const lo = Number(m.row_min) || 2, hi = Number(m.row_max) || 8;
      return `每輪每局隨機 ${lo}～${hi} 格（Megaways），格數組合決定當局連線組合數。`;
    }
    return c.g.megaways ? '每輪每局格數變動（Megaways），格數組合決定當局連線組合數。' : '';
  }
  function _subreelSentences(c) {
    const out = [];
    const grp = {};   // kind → reels[]
    c.layout.forEach((r, i) => {
      if (r && r.has_subreel && r.subreel_kind) {
        const k = String(r.subreel_kind).toUpperCase();
        (grp[k] = grp[k] || []).push({ reel: i + 1, rows: Number(r.subreel_rows) || 1 });
      }
    });
    Object.keys(grp).forEach(k => {
      const g = grp[k], a = g[0].reel, b = g[g.length - 1].reel, n = g.length;
      const pos = k.startsWith('TOP') ? '頂端上方' : (k.startsWith('BOTTOM') ? '底端下方' : '側邊');
      out.push(`主盤第 ${a}～${b} 輪的${pos}另有一條 1×${n} 水平副輪；副輪的每一格計入其所在輪的圖示數，與主盤合併計算連線。`);
    });
    return out;
  }
  function _scrollSentence(c) {
    const dirs = new Set(c.layout.map(r => String((r && r.scroll_dir) || '').toUpperCase()).filter(Boolean));
    if (dirs.size === 1) {
      const zh = _DIR_ZH[[...dirs][0]];
      if (zh) return `滾動方式：主盤${zh}滾動。`;
    } else if (dirs.size > 1) {
      const per = c.layout.map((r, i) => {
        const zh = _DIR_ZH[String((r && r.scroll_dir) || '').toUpperCase()];
        return zh ? `第 ${i + 1} 輪${zh}` : null;
      }).filter(Boolean).join('、');
      if (per) return `滾動方式（逐輪）：${per}。`;
    }
    return '';
  }
  function _panelSentence(p) {
    const nm = p.pid || p.id || '副盤';
    const bits = [`另有副盤「${nm}」（${p.width || '?'}×${p.height || '?'}）`];
    const colN = Number(p.col);
    if (!isNaN(colN) && colN >= 0) bits.push(colN + 1 > (Number(p.width) || 0) ? `位於主盤右側` : `起於第 ${colN + 1} 輪位置`);
    const sd = _DIR_ZH[String(p.scroll_dir || p.scroll || '').toUpperCase()];
    if (sd) bits.push(`${sd}補滿`);
    return bits.join('，') + '；詳細作動見機制章節。';
  }


  // ── M1 極簡觸發白話器：僅處理最常見 symbol_count 型；其餘回占位（M3 全面接管） ──
  function _trigZh(cond, c) {
    const m = /^\s*symbol_count\.([A-Za-z0-9_]+)\s*(>=|>|==)\s*(\d+)\s*$/.exec(String(cond || ''));
    if (m) {
      const sym = c.syms.find(s => (s.id || s.sid) === m[1]);
      const nm = sym ? _symName(sym) : m[1];
      const n  = m[3];
      if (m[2] === '==') return `同局恰出現 ${n} 個「${nm}」`;
      if (m[2] === '>')  return `同局出現超過 ${n} 個「${nm}」`;
      return `同局出現 ${n} 個以上「${nm}」`;
    }
    return null;  // 交由呼叫端決定占位句
  }
  const PLACEHOLDER_COND = '（觸發條件之白話描述待補：請於規則／模式頁補充描述欄，或待白話化模組上線）';

  // ════════ M3 白話化層（批次 1）：條件／觸發／動作 ═══════════════════════
  //  紀律：任何解析不了的構件一律回 null → 呼叫端印占位句，絕不外洩原始 DSL。
  const _TRIG_ZH = {
    ON_SPIN_START: '每局開始時', ON_GRID_GENERATED: '盤面生成後', ON_WIN_RESOLVED: '中獎結算時',
    ON_SYMBOL_LANDED: '符號落盤時', ON_COMBO_STEP: '連鎖每段結算時', ON_COMBO_END: '連鎖結束時',
    ON_DEAD_SPIN: '無中獎的局結束時', ON_MODE_ENTER: '進入模式時', ON_MODE_EXIT: '離開模式時',
    ON_CUSTOM_EMIT: '指定事件發生時',
  };
  function _symZh(c, id) {
    const s = c.syms.find(x => (x.id || x.sid) === id);
    return `「${s ? _symName(s) : id}」`;
  }
  function _numZh(v) { const n = Number(v); return isNaN(n) ? null : String(n); }

  // 條件葉節點 → 白話（回 null = 不可白話化）
  const _CMP_ZH = { '>': '大於', '>=': '不小於', '<': '小於', '<=': '不大於', '==': '等於', '!=': '不等於' };
  function _cmpZh(sub, op, raw) {
    if (op === 'in')     return `${sub}為 ${String(raw).split(/[\s,]+/).filter(Boolean).join('、')} 之一`;
    if (op === 'not_in') return `${sub}不為 ${String(raw).split(/[\s,]+/).filter(Boolean).join('、')} 之一`;
    if (op === 'contains') return `${sub}包含 ${raw}`;
    const n = _numZh(raw);
    return n != null ? `${sub}${_CMP_ZH[op]} ${n}` : `${sub}${_CMP_ZH[op]} ${String(raw).trim()}`;
  }
  function _leafZh(leaf, c) {
    const m = /^\s*(\S+?)\s+(contains|in|not_in)\s+(.+?)\s*$/.exec(leaf)
           || /^\s*(\S+?)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/.exec(leaf);
    if (!m) return null;
    const [, v, op, raw] = m;
    let mm;
    if ((mm = /^symbol_count\.([A-Za-z0-9_]+)$/.exec(v))) {
      const nm = _symZh(c, mm[1]); const n = _numZh(raw); if (n == null) return null;
      if (op === '>=') return `同局出現 ${n} 個以上${nm}`;
      if (op === '>')  return `同局出現超過 ${n} 個${nm}`;
      if (op === '==') return `同局恰出現 ${n} 個${nm}`;
      if (op === '<')  return `同局${nm}少於 ${n} 個`;
      if (op === '<=') return `同局${nm}至多 ${n} 個`;
      if (op === '!=') return `同局${nm}不為 ${n} 個`;
    }
    if ((mm = /^cell_value\.([A-Za-z0-9_]+)\.line_sum$/.exec(v))) {
      const sub = `中獎線上副盤 ${mm[1]} 各格累積值之總和`;
      const n = _numZh(raw); if (n == null) return null;
      return `${sub}${{'>':'大於','>=':'不小於','<':'小於','<=':'不大於','==':'等於','!=':'不等於'}[op]} ${n}`;
    }
    if ((mm = /^cell_value\.([A-Za-z0-9_]+)\.(\d+)\s*,\s*(\d+)$/.exec(v))) {
      const sub = `副盤 ${mm[1]} 格 (${mm[2]},${mm[3]}) 的累積值`;
      if (op === '>' && raw.trim() === '0') return `${sub.replace('的累積值', '')}有累積值`;
      const n = _numZh(raw); if (n == null) return null;
      return `${sub}${{'>':'大於','>=':'不小於','<':'小於','<=':'不大於','==':'等於','!=':'不等於'}[op]} ${n}`;
    }
    if (v === 'mode') {
      const name = raw.trim();
      if (op === '==') return `目前為 ${name} 模式`;
      if (op === '!=') return `目前不在 ${name} 模式`;
      if (op === 'in')     return `目前為 ${name.split(/[\s,]+/).filter(Boolean).join('／')} 模式之一`;
      if (op === 'not_in') return `目前不在 ${name.split(/[\s,]+/).filter(Boolean).join('／')} 模式`;
      return null;
    }
    if (v === 'event') {
      if (op === '==') return `事件「${raw.trim()}」被發出`;
      return null;
    }
    if (v === 'rand') {
      const p = Number(raw); if (isNaN(p)) return null;
      if (op === '<' || op === '<=') return `${+(p * 100).toFixed(4)}% 機率成立`;
      return null;
    }
    // ── 批次 2：長尾變數 ──
    const SIMPLE = {
      combo_step: '連鎖段數', multiplier: '當前額外倍數', total_multiplier: '累計總倍數',
      consecutive_dead_spins: '連續未中獎局數', win: '本局贏分', prev_win: '前一局贏分',
      respins_left: '剩餘重轉次數', feature_value_total: '本特色累積值',
      reel_count: '輪數', board_symbol_total: '盤面圖示總數',
      rightmost_reel_in_win: '中獎連線觸及的最右輪', destroyed_count: '本局消除的圖示數量',
      reel_height: '輪高',
    };
    if (SIMPLE[v]) return _cmpZh(SIMPLE[v], op, raw);
    const SUFFIXED = [
      [/^global\.(\w+)$/,            x => `全域變數「${x}」`],
      [/^spin\.(\w+)$/,              x => `本局變數「${x}」`],
      [/^payload\.(\w+)$/,           x => `事件夾帶值「${x}」`],
      [/^board_var\.(\w+)$/,         x => `盤面變數「${x}」`],
      [/^reel_height\.(\d+)$/,       x => `第 ${x} 輪的高度`],
      [/^adjacent_count\.(\w+)$/,    x => `相鄰的${_symZh(c, x)}數量`],
      [/^adjacent_count_dir\.(\w+)\.(\w+)$/, (x, d) => `${{LEFT:'左',RIGHT:'右',UP:'上',DOWN:'下'}[d.toUpperCase()] || d}方相鄰的${_symZh(c, x)}數量`],
      [/^cluster_max\.(\w+)$/,       x => `${_symZh(c, x)}的最大相鄰群格數`],
      [/^cluster_shape\.(\w+)$/,     x => `${_symZh(c, x)}相鄰群的形狀`],
      [/^symbol_value\.(\w+)$/,      x => `${_symZh(c, x)}的攜帶值`],
      [/^symbol_ways\.(\w+)$/,       x => `${_symZh(c, x)}的連線組合數`],
      [/^board_symbol_total\.(\w+)$/, x => `盤面${_symZh(c, x)}總數`],
      [/^destroyed_count\.(\w+)$/,   x => `本局消除的${_symZh(c, x)}數量`],
      [/^reel_stack_count\.(\w+)$/,  x => `單輪內${_symZh(c, x)}的最大連疊數`],
      [/^reel_spread_count\.(\w+)$/, x => `出現${_symZh(c, x)}的輪數`],
      [/^win_symbols$/,               () => `本次中獎圖示`],
      [/^win_contains\.(\w+)$/,      x => `本次中獎包含${_symZh(c, x)}與否`],
      [/^meter_value\.(\w+)$/,       x => `計量條「${x}」的目前值`],
      [/^track_covered\.(\w+)$/,     x => `軌道「${x}」的已覆蓋格數`],
      [/^object_pos\.(\w+)$/,        x => `物件「${x}」的位置`],
    ];
    for (const [re, fn] of SUFFIXED) {
      const hit = re.exec(v);
      if (hit) {
        const sub = fn(hit[1], hit[2]);
        if (v === 'win_symbols' && op === 'contains') {
          const nm = c.syms.some(x2 => (x2.id || x2.sid) === raw.trim()) ? _symZh(c, raw.trim()) : raw.trim();
          return `本次中獎圖示包含${nm}`;
        }
        return _cmpZh(sub, op, raw);
      }
    }
    return null;   // 真未知變數 → 占位
  }
  // 條件字串 → 白話（僅支援無括號的單層 and／or；混用或含括號 → null）
  function _condZh(cond, c) {
    const s = String(cond || '').trim();
    if (!s) return '';
    if (s.includes('(') || s.includes(')')) return null;
    const hasAnd = / and /i.test(s), hasOr = / or /i.test(s);
    if (hasAnd && hasOr) return null;
    const parts = s.split(hasOr ? / or /i : / and /i);
    const zh = parts.map(p => _leafZh(p, c));
    if (zh.some(x => x == null)) return null;
    return zh.join(hasOr ? '，或' : '，且');
  }

  // 動作值渲染（數字／範圍 a-b／符號 ID／動態變數 → 白話；未知 → null）
  function _valZh(v, c) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return String(v);
    const s = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return s;
    let m;
    if ((m = /^(\d+(?:\.\d+)?)\s*[-–~]\s*(\d+(?:\.\d+)?)$/.exec(s))) return `隨機 ${m[1]}～${m[2]}`;
    if (/^\d+(\s*,\s*\d+)+$/.test(s)) return s.split(/\s*,\s*/).join('、');
    if ((m = /^symbol_count\.([A-Za-z0-9_]+)$/.exec(s))) return `盤面${_symZh(c, m[1])}的數量`;
    if ((m = /^cell_value\.([A-Za-z0-9_]+)\.line_sum$/.exec(s))) return `中獎線上副盤 ${m[1]} 各格累積值之總和`;
    if ((m = /^cell_value\.([A-Za-z0-9_]+)$/.exec(s))) return `副盤 ${m[1]} 的格值`;
    if (c.syms.some(x => (x.id || x.sid) === s)) return _symZh(c, s);
    if (/^[A-Za-z0-9_]+$/.test(s)) return s;   // 模式名／事件名等安全識別字原樣
    return null;
  }
  function _cellZh(cell) {
    const s = String(cell || '').trim(); if (!s) return null;
    let m;
    if ((m = /^([A-Za-z0-9_]+)\.RANDOM(?:\((\d+)\))?$/i.exec(s))) return `副盤 ${m[1]} 的隨機${m[2] ? ' ' + m[2] + ' ' : '數'}格`;
    if ((m = /^([A-Za-z0-9_]+)\.(\d+)\s*,\s*(\d+)$/.exec(s))) return `副盤 ${m[1]} 格 (${m[2]},${m[3]})`;
    if ((m = /^(\d+)\s*,\s*(\d+)$/.exec(s))) return `格 (${m[1]},${m[2]})`;
    return null;
  }
  const _SCOPE_ZH = { all_visible: '全部可見格', adjacent_4: '上下左右相鄰格', adjacent_8: '八方向相鄰格',
                      same_row: '同一列', same_column: '同一輪', win_cells: '本次中獎格' };
  // 位置/範圍白話（scope 語彙 / 格座標 / SELF 參照 / RANDOM(n)）
  function _posZh(v, c) {
    const t = String(v == null ? '' : v).trim(); if (!t) return null;
    const low = t.toLowerCase();
    if (_SCOPE_ZH[low]) return _SCOPE_ZH[low];
    let m;
    if (t === 'SELF') return '觸發物件自身格';
    if (t === 'SELF_LANDED') return '物件降落格';
    if ((m = /^SELF:(LEFT|RIGHT|UP|DOWN)$/.exec(t))) return `自身${{LEFT:'左',RIGHT:'右',UP:'上',DOWN:'下'}[m[1]]}側鄰格`;
    if ((m = /^RANDOM\((\d+)\)$/i.exec(t))) return `隨機 ${m[1]} 格`;
    if (low === 'random') return '隨機格';
    const cz = _cellZh(t); if (cz) return cz;
    return null;
  }
  const _UPD_OP_ZH = { set: '設為', add: '加上', sub: '減去', mul: '乘以', div: '除以', inc: '加上', dec: '減去' };
  const _LIFE_ZH = { SPIN: '本局', CHAIN: '連鎖期間', FEATURE: '本特色期間', SESSION: '整節遊戲' };
  const _DIR4_ZH = { LEFT: '向左', RIGHT: '向右', UP: '向上', DOWN: '向下' };

  // 全 34 動作 → 白話（參數消耗追蹤：殘留未消耗參數 → 句尾誠實標註；回 null = 整動作占位）
  function _actZh(a, c) {
    if (!a || typeof a !== 'object') return null;
    const t = String(a.atype || a.type || '').toUpperCase();
    const P = Object.assign({}, (a.params && typeof a.params === 'object') ? a.params : {});
    const take = k => { const v = P[k]; delete P[k]; return (v === '' || v == null) ? null : v; };
    const V = v => _valZh(v, c);
    const done = txt => {
      if (txt == null) return null;
      // except_if / order 共用修飾（有值才消耗）
      const ex = take('except_if');
      if (ex != null) {
        const ez = _condZh(ex, c);
        txt += ez != null ? `（排除：${ez}）` : '（含排除條件，白話待補）';
      }
      const od = take('order');
      if (od != null) {
        const oz = { RANDOM: '隨機', LTR: '由左至右', RTL: '由右至左', TOP_DOWN: '由上而下', BOTTOM_UP: '由下而上' }[String(od).toUpperCase()];
        txt += oz ? `（取用順序：${oz}）` : '（含取用順序設定，白話待補）';
      }
      const sc = take('scope');
      if (sc != null) {
        const sz = _posZh(sc, c);
        txt += sz ? `〔範圍：${sz}〕` : '〔範圍設定，白話待補〕';
      }
      const leftover = Object.keys(P).filter(k => P[k] !== '' && P[k] != null);
      if (leftover.length) txt += '（部分參數之白話待補）';
      return txt;
    };
    const sym = k => {
      const v = P[k];
      if (v === '' || v == null) { delete P[k]; return null; }
      const r = V(v);
      if (r == null) return null;      // 留在 P → 句尾「部分參數之白話待補」
      delete P[k]; return r;
    };
    switch (t) {
      // ── 批次 1（改吃 catalog 正式參數）──
      case 'SPAWN': {
        const at = _posZh(take('cell'), c), tg = sym('target'); if (!tg) return null;
        return done(`於${at || '指定格'} 放置${tg}`);
      }
      case 'COLLECT': {
        const src = sym('source'); if (!src) return null;
        const rawT = String(take('target') || '').trim();
        const mm = /^cell_value\.([A-Za-z0-9_]+)$/.exec(rawT);
        if (mm) return done(`收集${src}攜帶的值，累加至副盤 ${mm[1]} 的同座標格`);
        const tgt = V(rawT); if (!tgt) return null;
        return done(`收集${src}攜帶的值，累加至${tgt}`);
      }
      case 'PAY': {
        const v = sym('value'); if (!v) return null;
        const src = sym('source');
        return done(`直接派彩，金額＝${v}（× 注）${src ? `，來源＝${src}` : ''}`);
      }
      case 'MULTIPLY_VALUE': {
        const tgt = sym('target'), f = sym('factor'); if (!tgt || !f) return null;
        const opZh = _UPD_OP_ZH[String(take('op') || 'mul').toLowerCase()]; if (!opZh) return null;
        return done(`把${tgt}${opZh} ${f}`);
      }
      case 'SWITCH_MODE': {
        const tg = sym('target'); if (!tg) return null;
        const inh = take('inherit_globals');
        return done(`進入 ${tg.replace(/[「」]/g, '')} 模式${inh === false || inh === 'false' ? '（不沿用全域變數）' : ''}${inh === true || inh === 'true' ? '（沿用全域變數）' : ''}`);
      }
      case 'EMIT_EVENT': {
        const nm = String(take('name') || '').trim(); if (!nm) return null;
        const pl = take('payload');
        return done(`發出事件「${nm}」${pl != null ? '（附夾帶值）' : ''}`);
      }
      case 'RETRIGGER': {
        const n = sym('count'); const tg = sym('target');
        return done(`重觸發${tg ? ` ${tg.replace(/[「」]/g, '')} 模式` : '本特色'}${n ? `（${n} 次）` : ''}`);
      }
      case 'AWARD_FREE_SPIN': {
        const n = sym('count'); if (!n) return null;
        const md2 = sym('mode'); const cap = sym('max_total');
        return done(`加 ${n} 局免費遊戲${md2 ? `（${md2.replace(/[「」]/g, '')} 模式）` : ''}${cap ? `，總局數上限 ${cap}` : ''}`);
      }
      case 'BOARD_DESTROY': {
        const pos = _posZh(take('positions'), c); const sid = sym('symbol_id');
        return done(`消除${pos || '指定範圍'}${sid ? `的${sid}` : '的圖示'}`);
      }
      case 'STICKY': {
        const tg = sym('symbol'); const pos = _posZh(take('positions'), c);
        const du = sym('duration'); const un = take('until'); const mg = sym('mult_growth');
        let txt = `使${tg || pos || '目標圖示'}黏定於盤面`;
        if (du) txt += `（${du} 局）`;
        if (un != null) { const uz = _condZh(un, c); txt += uz != null ? `，直到${uz}` : '（含解除條件，白話待補）'; }
        if (mg) txt += `，黏定期間倍數每局 +${mg}`;
        return done(txt);
      }
      case 'MOVE': {
        const rawSubj = String(P.subject || '').trim();
        let subj;
        if (/^SELF(_LANDED|:(LEFT|RIGHT|UP|DOWN))?$/.test(rawSubj)) { delete P.subject; subj = '觸發物件'; }
        else subj = sym('subject') || sym('from') || '目標物件';
        const dir = _DIR4_ZH[String(take('dir') || '').toUpperCase()];
        const amt = sym('amount'); const trk = sym('track'); const to = _posZh(take('to'), c);
        const manner = take('manner');
        let txt = `將${subj}`;
        if (trk) txt += `沿軌道「${trk.replace(/[「」]/g, '')}」`;
        if (dir) txt += `${dir}移動${amt ? ` ${amt} 格` : ''}`;
        else if (to) txt += `移動至${to}`;
        else return null;
        if (manner != null) txt += '（含移動方式設定，白話待補）';
        return done(txt);
      }
      case 'ADJUST_MULTIPLIER': {
        const opZh = _UPD_OP_ZH[String(take('op') || 'add').toLowerCase()];
        const n = sym('value'); if (!n || !opZh) return null;
        return done(opZh === '加上' ? `額外倍數 +${n}` : `額外倍數${opZh} ${n}`);
      }
      // ── 批次 2 ──
      case 'UPDATE_GLOBAL': case 'UPDATE_LOCAL': {
        const vr = String(take('var') || '').trim(); if (!vr) return null;
        const opZh = _UPD_OP_ZH[String(take('op') || 'set').toLowerCase()]; const val = sym('value');
        if (!opZh || !val) return null;
        const kind = t === 'UPDATE_GLOBAL' ? '全域變數' : '本局變數';
        const life = _LIFE_ZH[String(take('lifecycle') || '').toUpperCase()];
        const cap = sym('cap');
        return done(`把${kind}「${vr}」${opZh} ${val}${life ? `（生命週期：${life}）` : ''}${cap ? `（上限 ${cap}）` : ''}`);
      }
      case 'HALT_RESOLUTION': return done('中止本次結算流程');
      case 'END_FEATURE': {
        const w = take('when');
        const wz = { IMMEDIATE: '立即', AFTER_RESOLVE: '本次結算後' }[String(w || '').toUpperCase()];
        return done(`結束本特色${wz ? `（${wz}）` : (w != null ? '（含結束時機設定，白話待補）' : '')}`);
      }
      case 'BOARD_FILL': {
        const sid = sym('symbol_id'); if (!sid) return null;
        const pos = _posZh(take('positions'), c); const n = sym('count');
        return done(`於${pos || '指定位置'}填入${n ? ` ${n} 個` : ''}${sid}`);
      }
      case 'BOARD_TRANSFORM': {
        const f = sym('from_symbol'), to = sym('to_symbol'); if (!f || !to) return null;
        const pos = _posZh(take('positions'), c);
        return done(`把${pos ? pos + '的' : ''}${f}轉換為${to}`);
      }
      case 'SWAP': {
        const A = sym('a'), B = sym('b'); if (!A || !B) return null;
        return done(`交換${A}與${B}的位置`);
      }
      case 'LOCK_REEL': {
        const r = sym('reel'); if (!r) return null;
        const du = sym('duration');
        return done(`鎖定第 ${r} 輪${du ? `（${du} 局）` : ''}`);
      }
      case 'EXPAND_REEL': {
        const sy = sym('symbol'); if (!sy) return null;
        const lk = take('lock'); const rs = sym('respins');
        return done(`${sy}擴展為整輪${lk ? '並鎖定' : ''}${rs ? `，重轉 ${rs} 次` : ''}`);
      }
      case 'NUDGE': {
        const sy = sym('symbol'); if (!sy) return null;
        const d = _DIR4_ZH[String(take('direction') || '').toUpperCase()];
        const fr = take('full_reel'); const mp = sym('mult_per_step');
        return done(`${sy}${d || ''}推移${fr ? '至補滿整輪' : ''}${mp ? `，每步額外倍數 +${mp}` : ''}`);
      }
      case 'WALK': {
        const sy = sym('symbol'); if (!sy) return null;
        const d = _DIR4_ZH[String(take('dir') || '').toUpperCase()];
        const st = sym('steps'); const trk = sym('track');
        const pe = _LIFE_ZH[String(take('persist') || '').toUpperCase()];
        const tr = take('trail'); const tv = sym('trail_value');
        let txt = `${sy}${trk ? `沿軌道「${trk.replace(/[「」]/g, '')}」` : ''}${d || ''}走位${st ? `（每次 ${st} 步）` : ''}`;
        if (pe) txt += `，持續至${pe}結束`;
        if (tr) txt += `，沿途留下軌跡${tv ? `（值 ${tv}）` : ''}`;
        return done(txt);
      }
      case 'REVEAL_AS': {
        const sy = sym('symbol'); if (!sy) return null;
        const pool = take('pool');
        let txt = `${sy}揭示為${pool != null ? `指定符號池中隨機一種` : '指定圖示'}`;
        const sp = take('spread');
        if (sp) {
          const rg = sym('spread_range'); const ch = take('spread_chance');
          txt += `，並向外擴散${rg ? `（範圍 ${rg}）` : ''}${ch != null ? `（機率 ${+(Number(ch) * 100).toFixed(2)}%）` : ''}`;
        }
        return done(txt);
      }
      case 'SPLIT': {
        const sy = sym('symbol'), n = sym('into'); if (!sy || !n) return null;
        return done(`${sy}分裂為 ${n} 個`);
      }
      case 'DESTROY_ADJACENT': {
        const sy = sym('symbol'); if (!sy) return null;
        const r = sym('radius'); const sh = take('shape'); const orr = take('open_rows'); take('anchor');
        let txt = `觸發${sy}的相鄰消除${r ? `（半徑 ${r} 格）` : ''}`;
        if (sh != null) txt += '（含形狀設定，白話待補）';
        if (orr) txt += '，並開通被消除的列';
        return done(txt);
      }
      case 'GROW_BOARD': {
        const ef = take('effect');
        const ez = { ADD_ROW: '增加列', ADD_REEL: '增加輪', OPEN_CELL: '開通格' }[String(ef || '').toUpperCase()];
        if (!ez) return null;
        const n = sym('amount'); const cap = sym('cap');
        const pe = _LIFE_ZH[String(take('persist') || '').toUpperCase()];
        take('target');
        return done(`盤面成長：${ez}${n ? ` ${n}` : ''}${cap ? `（上限 ${cap}）` : ''}${pe ? `，持續至${pe}結束` : ''}`);
      }
      case 'REVIVE': {
        const n = sym('respins'); if (!n) return null;
        const tg = take('trigger');
        return done(`回補 ${n} 次重轉${tg != null ? '（含回補條件，白話待補）' : ''}`);
      }
      case 'COMPACT': {
        const d = _DIR4_ZH[String(take('direction') || '').toUpperCase()]; if (!d) return null;
        return done(`盤面圖示${d}壓實靠攏`);
      }
      case 'CONVERT': {
        const f = sym('from'), to = sym('to'); if (!f || !to) return null;
        const bv = take('by_value');
        return done(`把${f}轉換為${to}${bv ? '（依攜帶值對應）' : ''}`);
      }
      case 'SYMBOL_SWAP': {
        const f = sym('from_symbol'), to = sym('to_symbol'); if (!f || !to) return null;
        const rl = sym('reels'); const pe = _LIFE_ZH[String(take('persist') || '').toUpperCase()];
        return done(`輪帶符號替換：${f} → ${to}${rl ? `（第 ${rl} 輪）` : ''}${pe ? `，持續至${pe}結束` : ''}`);
      }
      case 'SWITCH_STRIP': {
        const r = sym('reel'), va = take('variant'); if (!r || va == null) return null;
        const pe = _LIFE_ZH[String(take('persist') || '').toUpperCase()];
        return done(`第 ${r} 輪切換至輪帶變體「${String(va)}」${pe ? `，持續至${pe}結束` : ''}`);
      }
      case 'PANEL_SET': {
        const pn = take('panel'); if (pn == null) return null;
        const ac = take('active');
        const on = (ac === true || ac === 'true' || ac === 1 || ac === '1');
        return done(`${on ? '啟用' : '停用'}副盤「${String(pn)}」`);
      }
      case 'METER_ADJUST': {
        const mid = take('meter_id'); if (mid == null) return null;
        const opZh = _UPD_OP_ZH[String(take('op') || 'add').toLowerCase()]; const val = sym('value');
        if (!opZh || !val) return null;
        return done(`把計量條「${String(mid)}」${opZh} ${val}`);
      }
      default: return null;   // 真未知動作 → 占位
    }
  }
  // ── 章節渲染 ──────────────────────────────────────────────────────────
  function _secHeader(L, c) {
    const title = (c.docv2.title || c.g.game_title || c.g.title || '未命名遊戲');
    L.push(`# ${title} — 機制文件`);
    L.push('');
    L.push('> 本文件完整描述本遊戲機制，可獨立閱讀。座標以「(第 N 輪, 第 M 列)」表示，輪由左至右、列由上至下，皆從 1 起算。賠率一律為押注額倍數。實際機率、權重、RTP 由數值端決定，正文不指定。');
    L.push('');
  }

  function _secBasics(L, c) {
    const pt = String(c.g.pay_type || 'LINE').toUpperCase();
    L.push('## 一、基本資料'); L.push('');
    if (c.docv2.vendor)   L.push(`- **廠商**：${c.docv2.vendor}`);
    if (c.docv2.tagline)  L.push(`- **玩法類型**：${c.docv2.tagline}`);
    const gs = _gridStr(c.layout);
    if (gs) L.push(`- **盤面**：${c.layout.length} 輪，由左至右每輪格數 **${gs}**${c.g.megaways ? '（每輪每局變動，Megaways）' : ''}`);
    if (pt === 'LINE' && c.paylines.length) L.push(`- **賠付方式**：固定 **${c.paylines.length} 條中獎線**`);
    else L.push(`- **賠付方式**：${PAY_LABEL[pt] || pt}${c.g.megaways ? '（Megaways）' : ''}`);
    const names = c.modes.map(m => m.mode).filter(Boolean);
    if (names.length) L.push(`- **模式**：${names.join('、')}`);
    if (c.docv2.reference) L.push(`- **公開參考值**：${c.docv2.reference}（僅供參考，不作規格）`);
    L.push('');
  }

  function _secOverview(L, c) {
    L.push('## 二、遊戲總覽'); L.push('');
    if (c.docv2.overview) { L.push(String(c.docv2.overview).trim()); }
    else {
      const pt = String(c.g.pay_type || 'LINE').toUpperCase();
      const bits = [];
      const gs = _gridStr(c.layout);
      if (gs) bits.push(`盤面 ${gs}`);
      bits.push(pt === 'LINE' ? `${c.paylines.length} 條中獎線` : (PAY_LABEL[pt] || pt));
      const names = c.modes.map(m => m.mode).filter(Boolean);
      if (names.length) bits.push(`模式：${names.join('、')}`);
      L.push(bits.join('；') + '。');
      L.push('');
      L.push('（遊戲總覽敘述尚未撰寫：可於文件設定填寫「遊戲總覽」一段話。）');
    }
    L.push('');
  }

  function _mechanicsBlock(L, c, modeName) {
    const inScope = r => {
      const sc = String(r.mode_scope || 'ALL').toUpperCase();
      return sc === 'ALL' || sc.split(/[,\s]+/).includes(String(modeName).toUpperCase());
    };
    const rules = c.rules.filter(r => r && r.enabled !== false && inScope(r));
    if (!rules.length) return false;
    const groups = Array.isArray(c.docv2.mechanics) ? c.docv2.mechanics : [];
    const grouped = new Set();
    let idx = 0;
    groups.forEach(gp => {
      const ids = Array.isArray(gp.rule_ids) ? gp.rule_ids : [];
      const rs = rules.filter(r => ids.includes(r.rule_id || r.id));
      if (!rs.length) return;
      idx += 1;
      L.push(`**機制${_cn(idx)}：${gp.name || '（未命名機制）'}**`); L.push('');
      rs.forEach((r, i) => { grouped.add(r); L.push(`${i + 1}. ${_ruleZh(r, c)}`); });
      if (gp.flow) { L.push(''); L.push(`流程：${gp.flow}`); }
      L.push('');
    });
    const rest = rules.filter(r => !grouped.has(r));
    if (rest.length) {
      if (idx > 0) { L.push('**其他規則**'); L.push(''); }
      rest.forEach((r, i) => L.push(`${i + 1}. ${_ruleZh(r, c)}`));
      L.push('');
    }
    return true;
  }
  function _cn(n) { return '一二三四五六七八九十'[n - 1] || String(n); }
  function _ruleZh(r, c) {
    // 授權 description 優先；否則 M3 自動組句（觸發＋條件＋動作＋修飾），零 DSL 外洩。
    const mods = [];
    if (r.persistent) mods.push('每局／每次觸發皆重複執行');
    const fc = Number(r.fire_chance);
    if (fc > 0 && fc < 1) mods.push(`${+(fc * 100).toFixed(4)}% 機率`);
    if (r.random_group) mods.push(`隨機組 ${r.random_group}：同組規則同時成立時依權重擇一執行`);
    const modStr = mods.length ? `（${mods.join('；')}）` : '';
    const d = String(r.description || '').trim();
    if (d) return d + modStr;
    const trig = _TRIG_ZH[String(r.trigger || '').toUpperCase()] || null;
    const condZh = _condZh(r.condition, c);
    const acts = (Array.isArray(r.actions) ? r.actions : []).map(a => _actZh(a, c));
    const actStr = acts.length
      ? acts.map(x => x || '（此動作之白話待補）').join('；')
      : '（無動作）';
    const trigStr = trig || '（觸發時機待補）';
    const condStr = (r.condition && String(r.condition).trim())
      ? (condZh != null ? `，若${condZh}` : '，若（條件之白話待補）')
      : '';
    return `${trigStr}${condStr}：${actStr}。${modStr}`;
  }

  function _secBaseMode(L, c, ng) {
    L.push(`## 三、一般遊戲（${ng}）`); L.push('');
    // 3.1
    L.push('### 3.1　盤面與連線'); L.push('');
    const gs = _gridStr(c.layout);
    const ngMode = c.modes.find(m => m.mode === ng) || {};
    const mega = _megawaysSentence(c, ngMode);
    if (gs) L.push(`- 盤面 ${gs}（${c.layout.length} 輪）。${mega ? ' ' + mega : ''}`);
    _subreelSentences(c).forEach(s => L.push(`- ${s}`));
    c.panels.forEach(p => L.push(`- ${_panelSentence(p)}`));
    const scr = _scrollSentence(c);
    if (scr) L.push(`- ${scr}`);
    const pt = String(c.g.pay_type || 'LINE').toUpperCase();
    const mm = _minMatch(c);
    if (pt === 'LINE') L.push(`- **${c.paylines.length} 條固定中獎線**（逐線幾何見〈六〉）；從最左輪算起、沿線連續 ${mm} 個以上相同圖示得分。每條線只取最高獎；不同線的獎相加。`);
    else if (pt === 'WAYS') L.push(`- ways 連線：從最左輪算起、相鄰輪連續 ${mm} 個以上相同圖示得分；組合數＝各輪符合圖示數之乘積。`);
    else if (pt === 'SCATTER') L.push(`- 圖示數量賠付：盤面任意位置達標數量即得分（見〈六〉）。`);
    else if (pt === 'CLUSTER') L.push(`- 相鄰群賠付：相鄰${Number(c.g.cluster_min_size) > 0 ? ' ' + c.g.cluster_min_size + ' 個' : ''}以上同圖示成群即得分。`);
    L.push('');
    // 3.2
    L.push('### 3.2　圖示規劃'); L.push('');
    if (c.normal.length) L.push(`**一般圖示（${c.normal.length} 種）**：${c.normal.map(_symName).join('、')}。`);
    L.push('');
    if (c.special.length) {
      L.push(`**特殊圖示（${c.special.length} 種）**：`); L.push('');
      const notes = (c.docv2.symbol_notes && typeof c.docv2.symbol_notes === 'object') ? c.docv2.symbol_notes : {};
      c.special.forEach(s => {
        const nm = _symName(s); const t = String(s.type || '').toUpperCase();
        L.push(`- **${nm}**`);
        const authored = notes[s.id || s.sid];
        if (authored) { L.push(`  - ${String(authored).trim()}`); }
        else if (t === 'WILD')    L.push('  - 可替代除散佈類圖示外的所有圖示以形成連線。');
        else if (t === 'SCATTER' || t === 'FREE') L.push('  - 不需落在連線上；達指定數量觸發對應功能（見模式章節）。');
        else if (t === 'COIN')    L.push('  - 出現時帶有面額／彩金值；收集規則見機制章節。');
        else L.push('  - （行為說明待補：可於文件設定為此圖示填寫行為說明。）');
        const paid = _payRows(s).length > 0;
        L.push(`  - ${paid ? '有自身賠率（見〈六〉）。' : '無連線賠率。'}`);
      });
      L.push('');
    }
    // 3.3
    L.push('### 3.3　機制'); L.push('');
    if (!_mechanicsBlock(L, c, ng)) { L.push('（本模式無特色規則。）'); L.push(''); }
    // 3.4
    L.push('### 3.4　得分公式'); L.push('');
    L.push(_formula(c, ng)); L.push('');
  }

  function _formula(c, modeName) {
    const pt = String(c.g.pay_type || 'LINE').toUpperCase();
    const parts = ['押注額', '圖示賠率'];
    if (pt === 'WAYS') parts.push('連線組合數（ways）');
    const hasMult = !!(c.mults && (c.mults.enabled || (Array.isArray(c.mults.wild_weights) && c.mults.wild_weights.length)));
    const md = c.modes.find(m => m.mode === modeName) || {};
    if (hasMult || md.stack_mode || md.mult_compose_override) parts.push('額外倍數');
    return parts.join(' × ') + ' ＝ 獲得彩金。';
  }

  function _secOtherModes(L, c, ng) {
    const others = c.modes.filter(m => m.mode && m.mode !== ng);
    let no = 4;
    others.forEach(md => {
      L.push(`## ${_cn(no)}、${md.mode}`); L.push(''); no += 1;
      L.push(`### 觸發方式`); L.push('');
      const zh = _trigZh(md.trigger_condition, c) || _condZh(md.trigger_condition, c);
      if (zh) L.push(`- 一般遊戲中${zh}即進入；先結算當前盤面，結算完畢後進入。`);
      else if (md.trigger_condition) L.push(`- ${PLACEHOLDER_COND}`);
      else L.push('- （無自動觸發條件；由規則指定進入，見〈三〉機制章節。）');
      const sc = Number(md.spin_count) || 0;
      if (sc > 0) L.push(`- 局數：${sc} 局。`);
      L.push('');
      L.push('### 與一般遊戲相同處'); L.push('');
      L.push('盤面、連線、圖示與賠率——**同一般遊戲**（下列差異除外）。'); L.push('');
      L.push('### 特色與差異'); L.push('');
      const diffs = [];
      if (md.pay_type_override) diffs.push(`賠付方式改為 ${PAY_LABEL[String(md.pay_type_override).toUpperCase()] || md.pay_type_override}。`);
      if (Number(md.cascade_max_depth) > 0) diffs.push(`連鎖消除上限 ${md.cascade_max_depth} 段。`);
      if (md.notes) diffs.push(String(md.notes).trim());
      const hadRules = _mechanicsBlock(L, { ...c, rules: c.rules.filter(r => String(r.mode_scope || '').toUpperCase().split(/[,\s]+/).includes(String(md.mode).toUpperCase())) }, md.mode);
      diffs.forEach(d => L.push(`- ${d}`));
      if (!diffs.length && !hadRules) L.push('（無額外差異記錄。）');
      L.push('');
      L.push('### 得分公式'); L.push('');
      L.push(_formula(c, md.mode)); L.push('');
    });
    return no;
  }

  function _secPaytable(L, c, no) {
    L.push(`## ${_cn(no)}、圖示・賠率・連線`); L.push('');
    // 動態連數欄（band）
    const bandMap = new Map();
    c.syms.forEach(s => _payRows(s).forEach(r => {
      const k = _bandKey(r); if (!bandMap.has(k)) bandMap.set(k, Number(r.count) || 0);
    }));
    let bands = [...bandMap.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (!bands.length) bands = ['5', '4', '3'];
    L.push('賠率為押注額倍數：'); L.push('');
    L.push('| 圖示 | ' + bands.map(b => b + ' 連') .join(' | ') + ' |');
    L.push('| --- | ' + bands.map(() => '---').join(' | ') + ' |');
    const cell = (s, k) => { const by = {}; _payRows(s).forEach(r => { by[_bandKey(r)] = r.pay; }); return by[k] != null ? by[k] : '—'; };
    c.normal.forEach(s => L.push(`| ${_symName(s)} | ` + bands.map(b => cell(s, b)).join(' | ') + ' |'));
    const paidSpecial = c.special.filter(s => _payRows(s).length);
    paidSpecial.forEach(s => L.push(`| ${_symName(s)} | ` + bands.map(b => cell(s, b)).join(' | ') + ' |'));
    const unpaid = c.special.filter(s => !_payRows(s).length);
    if (unpaid.length) { L.push(''); L.push(`- **${unpaid.map(_symName).join('／')}**：無連線賠率（行為見〈三〉）。`); }
    L.push('');
    if (String(c.g.pay_type || 'LINE').toUpperCase() === 'LINE' && c.paylines.length) {
      const H = Math.max.apply(null, c.layout.map(r => Number(r.max_rows) || 0).concat([0]));
      L.push(`**${c.paylines.length} 條中獎線**（標記法：各輪落在第幾列，列由上至下 1–${H}）：`); L.push('');
      L.push('| 線 | 路徑 | 幾何 |'); L.push('| --- | --- | --- |');
      c.paylines.forEach((p, i) => {
        const rows = _pathRows(p);
        const path = rows ? rows.join('-') : '（路徑未設定）';
        const geom = rows ? _lineGeomLabel(rows, H) : '';
        L.push(`| ${p.line_id || i + 1} | ${path} | ${geom || '—'} |`);
      });
      L.push('');
    }
    return no + 1;
  }

  function _secUnknowns(L, c, no) {
    const u = Array.isArray(c.docv2.unknowns) ? c.docv2.unknowns.filter(Boolean) : [];
    if (!u.length) return;   // 空 → 整節省略（規範：沒有的不列）
    L.push(`## ${_cn(no)}、未確認事項`); L.push('');
    u.forEach((t, i) => L.push(`${i + 1}. ${String(t).trim()}`));
    L.push('');
  }

  // ── 入口 ──────────────────────────────────────────────────────────────
  function buildMechMarkdownV2() {
    const c = _collect();
    const ng = c.g.starting_mode || (c.modes[0] && c.modes[0].mode) || 'NG';
    const L = [];
    _secHeader(L, c);
    _secBasics(L, c);
    _secOverview(L, c);
    _secBaseMode(L, c, ng);
    let no = _secOtherModes(L, c, ng);
    no = _secPaytable(L, c, no);
    _secUnknowns(L, c, no);
    return L.join('\n');
  }

  const SP = (typeof window !== 'undefined' ? (window.SlotPlanner = window.SlotPlanner || {}) : (globalThis.SlotPlanner = globalThis.SlotPlanner || {}));
  SP.DocGenV2 = { buildMechMarkdownV2, _lineGeomLabel };
})();
