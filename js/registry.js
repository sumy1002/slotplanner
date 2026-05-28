// ============================================================
//  registry.js — Symbol 全局資料層
//  對應 symbol_registry.py
//
//  使用方式：
//    const registry = new SymbolRegistry();
//    registry.initDefaults(5);
//    registry.on('changed', () => { ... });
//    registry.applyAll(symbols, swatchMap);   // 自動存 localStorage
//
//  生命週期：住在 app.js 的 setup() 中，整個應用程式共用一份
// ============================================================

(function () {
  'use strict';

  // ── 預設 swatch 顏色（15 組 bg/fg 配對，與桌面版同步） ──
  const SWATCH_COLORS = [
    ['#EDD9C0', '#7a5a3a'], ['#D8C8F0', '#5a3d8a'], ['#F8C0CE', '#8a3050'],
    ['#87CEEB', '#2a6a8a'], ['#C8E8C0', '#3a6a30'], ['#F5E6A3', '#7a6020'],
    ['#F0C8A8', '#8a4820'], ['#B8D8F0', '#2a508a'], ['#E8D0F0', '#6a3a8a'],
    ['#D0F0E8', '#2a7a5a'], ['#F0E8D0', '#7a6030'], ['#C0E8F8', '#2a608a'],
    ['#F8C8D0', '#8a2050'], ['#D8F0C8', '#3a7030'], ['#F0D8B0', '#8a5020'],
  ];

  const DEFAULT_SYMBOL_NAMES = [
    'icon00', 'icon01', 'icon02', 'icon03', 'icon04',
    'icon05', 'icon06', 'icon07', 'icon08', 'icon09', 'icon10',
    'WILD', 'FREE', 'BONUS', 'SCATTER',
  ];

  const LS_KEY = 'slotplanner.registry.v1';

  // ── 全局 id 計數器 ──
  let _idCounter = 0;
  function nextId() { _idCounter += 1; return _idCounter; }

  // ════════════════════════════════════════════════════════════
  //  SymbolData — 純 object 表示，配 helper 函式
  //  對應 SymbolData class
  // ════════════════════════════════════════════════════════════
  function createSymbol(name = '', number = '', weight = 100, reelCount = 5) {
    return {
      id: nextId(),
      name,
      number,
      weight,
      max_count: 0,
      use_max: false,
      reel_limit: new Array(reelCount).fill(true),
      // ── A.xlsx 03_Symbols 擴充欄位 ──
      symbol_id: '',      // A.xlsx 用的 Symbol_ID(像 H1 / WILD,可與 name 不同)
      type: 'HIGH',       // HIGH / LOW / WILD / SCATTER / BONUS / SPECIAL
      pay_3x: 0,
      pay_4x: 0,
      pay_5x: 0,
      pay_6x: 0,
      mega_w: 1,          // Mega 寬度(覆蓋幾個 Reel)
      mega_h: 1,          // Mega 高度(覆蓋幾列)
      is_wild: false,
      is_scatter: false,
    };
  }

  function cloneSymbol(s) {
    return {
      id: s.id,
      name: s.name,
      number: s.number,
      weight: s.weight,
      max_count: s.max_count,
      use_max: s.use_max,
      reel_limit: [...s.reel_limit],
      // 新欄位(向下相容:舊資料缺欄位給預設值)
      symbol_id:  s.symbol_id  != null ? s.symbol_id  : '',
      type:       s.type       != null ? s.type       : 'HIGH',
      pay_3x:     s.pay_3x     != null ? s.pay_3x     : 0,
      pay_4x:     s.pay_4x     != null ? s.pay_4x     : 0,
      pay_5x:     s.pay_5x     != null ? s.pay_5x     : 0,
      pay_6x:     s.pay_6x     != null ? s.pay_6x     : 0,
      mega_w:     s.mega_w     != null ? s.mega_w     : 1,
      mega_h:     s.mega_h     != null ? s.mega_h     : 1,
      is_wild:    s.is_wild    != null ? s.is_wild    : false,
      is_scatter: s.is_scatter != null ? s.is_scatter : false,
    };
  }

  function setSymbolReelCount(s, n) {
    const cur = s.reel_limit.length;
    if (cur < n) {
      s.reel_limit = s.reel_limit.concat(new Array(n - cur).fill(true));
    } else if (cur > n) {
      s.reel_limit = s.reel_limit.slice(0, n);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  RegistrySnapshot — undo/redo 快照
  // ════════════════════════════════════════════════════════════
  function makeSnapshot(symbols, swatchMap) {
    return {
      symbols: symbols.map(cloneSymbol),
      swatchMap: { ...swatchMap },
      maxId: symbols.length ? Math.max(...symbols.map(s => s.id)) : 0,
    };
  }

  // ════════════════════════════════════════════════════════════
  //  簡易 EventEmitter
  // ════════════════════════════════════════════════════════════
  class Emitter {
    constructor() { this._lis = {}; }
    on(event, cb) {
      (this._lis[event] || (this._lis[event] = [])).push(cb);
      return () => this.off(event, cb);
    }
    off(event, cb) {
      this._lis[event] = (this._lis[event] || []).filter(c => c !== cb);
    }
    emit(event, ...args) {
      (this._lis[event] || []).forEach(c => c(...args));
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SymbolRegistry
  // ════════════════════════════════════════════════════════════
  class SymbolRegistry extends Emitter {
    constructor() {
      super();
      this._symbols = [];
      this._swatchMap = {};   // id -> [bg, fg]
      this._reelCount = 5;
    }

    // ── 初始化（嘗試從 localStorage 還原，失敗則用 defaults） ──
    initOrLoad(reelCount = 5) {
      const loaded = this._loadFromLocalStorage();
      if (loaded) {
        this._reelCount = loaded.reelCount;
        this._symbols = loaded.symbols;
        this._swatchMap = loaded.swatchMap;
        _idCounter = loaded.maxId;
        return 'loaded';
      }
      this.initDefaults(reelCount);
      return 'defaults';
    }

    initDefaults(reelCount = 5) {
      _idCounter = 0;
      this._symbols = [];
      this._swatchMap = {};
      this._reelCount = reelCount;
      DEFAULT_SYMBOL_NAMES.forEach((name, idx) => {
        const s = createSymbol(name, String(idx), 100, reelCount);
        this._symbols.push(s);
        this._swatchMap[s.id] = [...SWATCH_COLORS[idx % SWATCH_COLORS.length]];
      });
    }

    // ── 讀取 API（回傳淺複製，外部不可直接改） ──
    symbols() { return this._symbols.map(cloneSymbol); }
    swatchMap() { return { ...this._swatchMap }; }
    reelCount() { return this._reelCount; }
    totalWeight() { return this._symbols.reduce((a, s) => a + (s.weight || 0), 0); }
    allNumbers() { return new Set(this._symbols.filter(s => s.number).map(s => s.number)); }
    allNames() { return new Set(this._symbols.filter(s => s.name).map(s => s.name)); }

    // ── 寫入 API ──
    applyAll(symbols, swatchMap) {
      // 整批替換並通知；外部需先做 clone
      this._symbols = symbols.map(cloneSymbol);
      this._swatchMap = { ...swatchMap };
      // 同步 reel_limit 長度
      this._symbols.forEach(s => setSymbolReelCount(s, this._reelCount));
      // 更新全局 id 計數器
      if (this._symbols.length) {
        _idCounter = Math.max(_idCounter, ...this._symbols.map(s => s.id));
      }
      this._saveLocalStorage();
      this.emit('changed');
    }

    removeSymbol(sid) {
      this._symbols = this._symbols.filter(s => s.id !== sid);
      delete this._swatchMap[sid];
      this._saveLocalStorage();
      this.emit('removed', sid);
      this.emit('changed');
    }

    setReelCount(n) {
      if (n === this._reelCount) {
        this._symbols.forEach(s => setSymbolReelCount(s, n));
        return;
      }
      this._reelCount = n;
      this._symbols.forEach(s => setSymbolReelCount(s, n));
      this._saveLocalStorage();
      this.emit('changed');
    }

    // ── 驗證 ──
    validate(symbols) {
      const errors = [];

      // 1. 編號重複
      const nums = symbols.filter(s => s.number).map(s => s.number);
      const dupNums = nums.filter((n, i) => nums.indexOf(n) !== i);
      if (dupNums.length) {
        errors.push(`編號重複：${[...new Set(dupNums)].sort().join(', ')}`);
      }

      // 2. 名稱重複
      const names = symbols.filter(s => s.name).map(s => s.name);
      const dupNames = names.filter((n, i) => names.indexOf(n) !== i);
      if (dupNames.length) {
        errors.push(`名稱重複：${[...new Set(dupNames)].sort().join(', ')}`);
      }

      // 3. 名稱與編號都空白
      const unnamed = symbols.filter(s => !s.name.trim() && !s.number.trim());
      if (unnamed.length) {
        errors.push(`有 ${unnamed.length} 個 symbol 名稱與編號皆為空白`);
      }

      // 4. 總權重為 0
      if (symbols.length && symbols.reduce((a, s) => a + s.weight, 0) === 0) {
        errors.push('所有 symbol 的權重都是 0');
      }

      // 5. 某 symbol 所有輪皆被取消
      const noReel = symbols
        .filter(s => s.reel_limit.length && !s.reel_limit.some(x => x))
        .map(s => s.name || s.number || `id=${s.id}`);
      if (noReel.length) {
        errors.push('以下 symbol 所有輪限制皆取消，將永遠不出現：\n  ' + noReel.join('\n  '));
      }

      // 6. use_max=true 但 max_count<=0
      const badMax = symbols
        .filter(s => s.use_max && s.max_count <= 0)
        .map(s => s.name || s.number || `id=${s.id}`);
      if (badMax.length) {
        errors.push('以下 symbol 啟用出現上限但數量設為 0：\n  ' + badMax.join('\n  '));
      }

      return errors;
    }

    // ── 序列化 ──
    toJSON() {
      return {
        version: 2,
        reel_count: this._reelCount,
        symbols: this._symbols.map(s => ({
          id: s.id,
          name: s.name,
          number: s.number,
          weight: s.weight,
          max_count: s.max_count,
          use_max: s.use_max,
          reel_limit: [...s.reel_limit],
          // ── 擴充欄位 ──
          symbol_id:  s.symbol_id  || '',
          type:       s.type       || 'HIGH',
          pay_3x:     s.pay_3x     || 0,
          pay_4x:     s.pay_4x     || 0,
          pay_5x:     s.pay_5x     || 0,
          pay_6x:     s.pay_6x     || 0,
          mega_w:     s.mega_w     || 1,
          mega_h:     s.mega_h     || 1,
          is_wild:    !!s.is_wild,
          is_scatter: !!s.is_scatter,
          swatch: this._swatchMap[s.id] || ['#EDD9C0', '#7a5a3a'],
        })),
      };
    }

    fromJSON(data) {
      const reelCount = data.reel_count || 5;
      const symbols = [];
      const swatchMap = {};
      let maxId = 0;
      for (const d of (data.symbols || [])) {
        const s = {
          id: d.id,
          name: d.name || '',
          number: d.number || '',
          weight: d.weight || 0,
          max_count: d.max_count || 0,
          use_max: !!d.use_max,
          reel_limit: Array.isArray(d.reel_limit) ? [...d.reel_limit] : new Array(reelCount).fill(true),
          // ── 擴充欄位(舊版資料沒有就給預設)──
          symbol_id:  d.symbol_id  != null ? d.symbol_id  : '',
          type:       d.type       || 'HIGH',
          pay_3x:     d.pay_3x     || 0,
          pay_4x:     d.pay_4x     || 0,
          pay_5x:     d.pay_5x     || 0,
          pay_6x:     d.pay_6x     || 0,
          mega_w:     d.mega_w     || 1,
          mega_h:     d.mega_h     || 1,
          is_wild:    !!d.is_wild,
          is_scatter: !!d.is_scatter,
        };
        // 對齊 reel_limit 長度
        setSymbolReelCount(s, reelCount);
        symbols.push(s);
        swatchMap[s.id] = Array.isArray(d.swatch) ? [...d.swatch] : ['#EDD9C0', '#7a5a3a'];
        maxId = Math.max(maxId, s.id);
      }
      _idCounter = maxId;
      this._reelCount = reelCount;
      this._symbols = symbols;
      this._swatchMap = swatchMap;
      this._saveLocalStorage();
      this.emit('changed');
    }

    // ── localStorage 持久化 ──
    _saveLocalStorage() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.toJSON()));
      } catch (e) {
        console.warn('localStorage save failed:', e);
      }
    }

    _loadFromLocalStorage() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.symbols)) return null;
        const reelCount = data.reel_count || 5;
        const symbols = [];
        const swatchMap = {};
        let maxId = 0;
        for (const d of data.symbols) {
          const s = {
            id: d.id,
            name: d.name || '',
            number: d.number || '',
            weight: d.weight || 0,
            max_count: d.max_count || 0,
            use_max: !!d.use_max,
            reel_limit: Array.isArray(d.reel_limit) ? [...d.reel_limit] : new Array(reelCount).fill(true),
          };
          setSymbolReelCount(s, reelCount);
          symbols.push(s);
          swatchMap[s.id] = Array.isArray(d.swatch) ? [...d.swatch] : ['#EDD9C0', '#7a5a3a'];
          maxId = Math.max(maxId, s.id);
        }
        return { reelCount, symbols, swatchMap, maxId };
      } catch (e) {
        console.warn('localStorage load failed:', e);
        return null;
      }
    }

    clearLocalStorage() {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
    }
  }

  // ── Export 到 window ──
  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.SWATCH_COLORS = SWATCH_COLORS;
  window.SlotPlanner.DEFAULT_SYMBOL_NAMES = DEFAULT_SYMBOL_NAMES;
  window.SlotPlanner.createSymbol = createSymbol;
  window.SlotPlanner.cloneSymbol = cloneSymbol;
  window.SlotPlanner.setSymbolReelCount = setSymbolReelCount;
  window.SlotPlanner.makeSnapshot = makeSnapshot;
  window.SlotPlanner.SymbolRegistry = SymbolRegistry;
})();
