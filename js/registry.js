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

  // ════════════════════════════════════════════════════════════
  //  架構檢閱 #4:全站 localStorage 容量超限(QuotaExceededError)防呆
  //
  //  問題:全站 20+ 個 localStorage.setItem 呼叫點(helpers.js/registry.js/
  //  aconfig-xlsx.js/setup.js)各自 try/catch + console.warn,使用者存檔失敗時
  //  只看到 statusbar 一句「localStorage 寫入失敗」,不知道是容量滿了、該怎麼辦
  //  (symbol.image dataURL 累積最容易撞到上限)。
  //
  //  解法:在 registry.js(全站最先載入的資料層模組)包一層 Storage.prototype.setItem,
  //  攔截到 QuotaExceededError 時廣播全域 DOM 事件 'sp:ls-quota-exceeded',
  //  再原樣把例外往外丟(不改變任何既有 try/catch 呼叫端的行為/回傳值)。
  //  app.js 監聽此事件,用既有 statusbar 顯示明確中文提示 + 處理建議,
  //  不需要逐一修改 20+ 個呼叫點。
  // ════════════════════════════════════════════════════════════
  (function _installLsQuotaGuard() {
    if (window.__SP_LS_QUOTA_GUARD__) return;   // 避免 script 重載時重複掛
    window.__SP_LS_QUOTA_GUARD__ = true;
    if (typeof Storage === 'undefined' || !Storage.prototype || !Storage.prototype.setItem) return;
    const _origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      try {
        return _origSetItem.call(this, key, value);
      } catch (e) {
        const isQuota = !!(e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014));
        if (isQuota) {
          try { window.dispatchEvent(new CustomEvent('sp:ls-quota-exceeded', { detail: { key } })); }
          catch (e2) { /* no-op:事件建構失敗不應蓋掉原例外 */ }
        }
        throw e;   // 原樣往外丟,既有 catch(e){...} 呼叫端行為不變
      }
    };
  })();

  // ── 快選盤顏色（§2.3 固定序:綠 → 藍 → 紫 → 紅 → 粉 → 橘 → 金黃;[bg, fg 對比文字色]） ──
  const SWATCH_COLORS = [
    ['#8FD581', '#2c5e26'],  // 綠
    ['#71B7D0', '#1c4a5a'],  // 藍
    ['#8257C7', '#ffffff'],  // 紫
    ['#B4463C', '#ffffff'],  // 紅
    ['#D071B8', '#ffffff'],  // 粉
    ['#E0965A', '#7a3f18'],  // 橘
    ['#D9B85C', '#5a4410'],  // 金黃
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

  // ── v6.3 / Q3:符號自帶倍數陣列正規化 ──
  //   mult_values  「倍數」×N(× 在數字前):空=無、1筆=固定、多筆=加權隨機
  //   prize_values 「彩金倍數」N×(× 在數字後)/ 金幣面額:含 per-mode 權重與 link_jackpot
  function _normMultValues(arr) {
    // v8.3 / R1 D-13:MULT 比照 PRIZE 保留 per-mode 權重(weight_by_mode;舊資料缺 → {})
    return Array.isArray(arr)
      ? arr.map(v => ({
          mult: Number(v && v.mult) || 0, weight: Number(v && v.weight) || 0,
          weight_by_mode: (v && v.weight_by_mode && typeof v.weight_by_mode === 'object')
            ? { ...v.weight_by_mode } : {},
        }))
      : [];
  }
  function _normPrizeValues(arr) {
    return Array.isArray(arr)
      ? arr.map(v => ({
          value:        Number(v && v.value) || 0,
          weight:       Number(v && v.weight) || 0,
          link_jackpot: (v && v.link_jackpot != null) ? String(v.link_jackpot) : '',
          weight_by_mode: (v && v.weight_by_mode && typeof v.weight_by_mode === 'object')
            ? { ...v.weight_by_mode } : {},
        }))
      : [];
  }

  // ── P0-2:最少連線正規化 —— finite 且 ≥1 → 取整,否則預設 3(缺欄 / 空 / ≤0 / NaN)。
  //   與 a_loader._parse_symbols 同規則;cloneSymbol/toJSON/fromJSON/_loadFromLocalStorage 共用。
  function _normMinMatch(v) {
    const n = Number(v);
    return (Number.isFinite(n) && n >= 1) ? Math.round(n) : 3;
  }

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
      subreel_limit: {},  // v6.2 #8:副輪出現限制(key=副輪 key, 預設不勾→不在此物件即 false)
      enabled: true,     // v4.0 / #13:符號開關(false = 暫停,不匯出、不進權重同步,但保留資料)
      // ── A.xlsx 03_Symbols 擴充欄位 ──
      symbol_id: '',      // A.xlsx 用的 Symbol_ID(像 H1 / WILD,可與 name 不同)
      type: '一般得分',    // 一般得分 / WILD / SCATTER / FREE / BONUS / COIN / Other
      pay_3x: 0,
      pay_4x: 0,
      pay_5x: 0,
      pay_6x: 0,
      pay_rows: [],       // v6.1:動態賠付表(2–20 連);pay_3x–6x 為其同步出的相容欄
      mega_w: 1,          // Mega 寬度(覆蓋幾個 Reel)
      mega_h: 1,          // Mega 高度(覆蓋幾列)
      mega_sizes: '',     // v8.35 / GAP-H1:per-landing 尺寸分佈 "1:80;2:15;3:4"(size 可為 N=N×N 或 WxH;
                          //   原樣字串不求值;'' = 沿用 mega_w/h 單一固定尺寸現行語意)
      can_expand: false,  // v6.2 #10:此符號可擴張(實際擴張規則於規則頁設定,此處僅標籤)
      mult_values: [],    // v6.3 / Q3:「倍數」×N(× 數字前);加權隨機陣列
      prize_values: [],   // v6.3 / Q3:「彩金倍數」N× / 金幣面額;含 per-mode 權重與 link_jackpot
      is_wild: false,
      is_scatter: false,
      image: null,        // v7.9 #4:符號圖片(dataURL);僅存前端 LS,不進 A.xlsx
      mode_scope: '',     // v8.3 / R1 D-12:出現模式宣告(逗號分隔模式名;'' = 所有模式)
      instance_mult: false, // v8.7 / R6 D-14:per-instance 乘數宣告(每顆實例攜帶自身乘數;規格描述)
      min_match: 3,       // P0-2:最少連線(達此數才成立;預設 3,可覆寫 1/2;僅 LINE/WAYS 有意義)
      group_id: '',       // P0-3:所屬符號家族 ID(空=不屬任何家族;ANY_BAR 等混合賠付)
      wild_behavior: '',  // 架構檢閱 #6:Wild 行為分類('' 標準/EXPANDING/WALKING/STICKY/MULTIPLIER)
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
      subreel_limit: (s.subreel_limit && typeof s.subreel_limit === 'object') ? { ...s.subreel_limit } : {},
      enabled:    s.enabled    != null ? s.enabled    : true,
      // 新欄位(向下相容:舊資料缺欄位給預設值)
      symbol_id:  s.symbol_id  != null ? s.symbol_id  : '',
      type:       s.type       != null ? s.type       : '一般得分',
      pay_3x:     s.pay_3x     != null ? s.pay_3x     : 0,
      pay_4x:     s.pay_4x     != null ? s.pay_4x     : 0,
      pay_5x:     s.pay_5x     != null ? s.pay_5x     : 0,
      pay_6x:     s.pay_6x     != null ? s.pay_6x     : 0,
      pay_rows:   Array.isArray(s.pay_rows) ? s.pay_rows.map(r => ({ count: Number(r.count) || 0, pay: Number(r.pay) || 0, count_to: Number(r.count_to) || 0 })) : [],
      mega_w:     s.mega_w     != null ? s.mega_w     : 1,
      mega_h:     s.mega_h     != null ? s.mega_h     : 1,
      mega_sizes: s.mega_sizes != null ? String(s.mega_sizes) : '',   // v8.35 GAP-H1
      can_expand: s.can_expand != null ? !!s.can_expand : false,
      mult_values:  _normMultValues(s.mult_values),
      prize_values: _normPrizeValues(s.prize_values),
      is_wild:    s.is_wild    != null ? s.is_wild    : false,
      is_scatter: s.is_scatter != null ? s.is_scatter : false,
      image:      (s.image != null && typeof s.image === 'string') ? s.image : null,  // v7.9 #4
      mode_scope: (s.mode_scope != null ? String(s.mode_scope) : ''),               // v8.3 D-12
      instance_mult: s.instance_mult === true,                                      // v8.7 D-14
      min_match: _normMinMatch(s.min_match), // P0-2(缺欄/空/≤0→3)
      group_id: (s.group_id != null ? String(s.group_id).trim() : ''), // P0-3
      wild_behavior: (s.wild_behavior != null ? String(s.wild_behavior).trim().toUpperCase() : ''), // 架構檢閱 #6
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
  //  v9.5:盤面輪數變動 → 賠付連線數列(pay_rows)自動增減
  //    只在「連線型」玩法(LINE/WAYS/MEGAWAYS)且符號本身不是 SCATTER/BONUS(這兩類一律用圖示數量計,
  //    不受輪數限制)時套用。自動管理下限固定 3 連(不開放 UI 顯示/調整);使用者若要 2 連,
  //    自行用「+新增連線數」加,加了之後不受輪數變動影響(2 連本就低於自動下限)。
  // ════════════════════════════════════════════════════════════
  const AUTO_PAY_LO = 3;
  function _isAutoPaySymbol(s) {
    const t = s.type;
    return t !== 'SCATTER' && t !== 'BONUS';
  }
  function syncSymbolPayRowsToReelCount(s, n) {
    if (!_isAutoPaySymbol(s)) return;
    const rows = Array.isArray(s.pay_rows) ? s.pay_rows : [];
    // 移除已不可能出現的連線數(count ≥ 自動下限 且 超過新輪數);2 連等使用者自行新增的低位列不受影響
    const kept = rows.filter(r => !(Number(r.count) >= AUTO_PAY_LO && Number(r.count) > n));
    // 補齊 3..n 尚未存在的列(pay=0,交給使用者填數值)
    const used = new Set(kept.map(r => Number(r.count)));
    for (let c = AUTO_PAY_LO; c <= n; c++) {
      if (!used.has(c)) kept.push({ count: c, count_to: 0, pay: 0 });
    }
    kept.sort((a, b) => (Number(a.count) || 0) - (Number(b.count) || 0));
    s.pay_rows = kept;
  }
  function syncPayRowsToReelCount(symbols, n, isLineLike) {
    if (!isLineLike) return;   // 非連線型玩法(CLUSTER/SCATTER)不受輪數自動管理
    symbols.forEach(s => syncSymbolPayRowsToReelCount(s, n));
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
      this._isLineLike = true;   // v9.5:賠付連線型(LINE/WAYS/MEGAWAYS)旗標,由 gameSpec 推入,決定 pay_rows 是否隨輪數自動增減
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

    setReelCount(n, isLineLike) {
      if (typeof isLineLike === 'boolean') this._isLineLike = isLineLike;
      if (n === this._reelCount) {
        this._symbols.forEach(s => setSymbolReelCount(s, n));
        syncPayRowsToReelCount(this._symbols, n, this._isLineLike);
        return;
      }
      this._reelCount = n;
      this._symbols.forEach(s => setSymbolReelCount(s, n));
      syncPayRowsToReelCount(this._symbols, n, this._isLineLike);
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
          subreel_limit: (s.subreel_limit && typeof s.subreel_limit === 'object') ? { ...s.subreel_limit } : {},
          enabled:    s.enabled !== false,
          // ── 擴充欄位 ──
          symbol_id:  s.symbol_id  || '',
          type:       s.type       || '一般得分',
          pay_3x:     s.pay_3x     || 0,
          pay_4x:     s.pay_4x     || 0,
          pay_5x:     s.pay_5x     || 0,
          pay_6x:     s.pay_6x     || 0,
          pay_rows:   Array.isArray(s.pay_rows) ? s.pay_rows.map(r => ({ count: Number(r.count) || 0, pay: Number(r.pay) || 0, count_to: Number(r.count_to) || 0 })) : [],
          mega_w:     s.mega_w     || 1,
          mega_h:     s.mega_h     || 1,
          mega_sizes: (s.mega_sizes != null ? String(s.mega_sizes) : ''),   // v8.35 GAP-H1
          can_expand: !!s.can_expand,
          mult_values:  _normMultValues(s.mult_values),
          prize_values: _normPrizeValues(s.prize_values),
          is_wild:    !!s.is_wild,
          is_scatter: !!s.is_scatter,
          image:      (s.image != null && typeof s.image === 'string') ? s.image : null,  // v7.9 #4
      mode_scope: (s.mode_scope != null ? String(s.mode_scope) : ''),               // v8.3 D-12
      instance_mult: s.instance_mult === true,                                      // v8.7 D-14
          min_match: _normMinMatch(s.min_match), // P0-2
          group_id: (s.group_id != null ? String(s.group_id).trim() : ''), // P0-3
          wild_behavior: (s.wild_behavior != null ? String(s.wild_behavior).trim().toUpperCase() : ''), // 架構檢閱 #6
          swatch: this._swatchMap[s.id] || ['#DABA90', '#6a5230'],
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
          subreel_limit: (d.subreel_limit && typeof d.subreel_limit === 'object') ? { ...d.subreel_limit } : {},
          enabled:    d.enabled != null ? d.enabled : true,
          // ── 擴充欄位(舊版資料沒有就給預設)──
          symbol_id:  d.symbol_id  != null ? d.symbol_id  : '',
          type:       d.type       || '一般得分',
          pay_3x:     d.pay_3x     || 0,
          pay_4x:     d.pay_4x     || 0,
          pay_5x:     d.pay_5x     || 0,
          pay_6x:     d.pay_6x     || 0,
          pay_rows:   Array.isArray(d.pay_rows) ? d.pay_rows.map(r => ({ count: Number(r.count) || 0, pay: Number(r.pay) || 0, count_to: Number(r.count_to) || 0 })) : [],
          mega_w:     d.mega_w     || 1,
          mega_h:     d.mega_h     || 1,
          mega_sizes: (d.mega_sizes != null ? String(d.mega_sizes) : ''),   // v8.35 GAP-H1
          can_expand: !!d.can_expand,
          mult_values:  _normMultValues(d.mult_values),
          prize_values: _normPrizeValues(d.prize_values),
          is_wild:    !!d.is_wild,
          is_scatter: !!d.is_scatter,
          image:      (d.image != null && typeof d.image === 'string') ? d.image : null,  // v7.9 #4
          mode_scope: (d.mode_scope != null ? String(d.mode_scope) : ''),           // v8.3 D-12
          instance_mult: d.instance_mult === true,                                  // v8.7 D-14
          min_match: _normMinMatch(d.min_match), // P0-2
          group_id: (d.group_id != null ? String(d.group_id).trim() : ''), // P0-3
          wild_behavior: (d.wild_behavior != null ? String(d.wild_behavior).trim().toUpperCase() : ''), // 架構檢閱 #6
        };
        // 對齊 reel_limit 長度
        setSymbolReelCount(s, reelCount);
        symbols.push(s);
        swatchMap[s.id] = Array.isArray(d.swatch) ? [...d.swatch] : ['#DABA90', '#6a5230'];
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
            subreel_limit: (d.subreel_limit && typeof d.subreel_limit === 'object') ? { ...d.subreel_limit } : {},
            // v4.0:補齊擴充欄位(原本這條載入路徑會把這些欄位丟掉,進階屬性無法持久化)
            enabled:    d.enabled != null ? d.enabled : true,
            symbol_id:  d.symbol_id  != null ? d.symbol_id  : '',
            type:       d.type       || '一般得分',
            pay_3x:     d.pay_3x     || 0,
            pay_4x:     d.pay_4x     || 0,
            pay_5x:     d.pay_5x     || 0,
            pay_6x:     d.pay_6x     || 0,
            pay_rows:   Array.isArray(d.pay_rows) ? d.pay_rows.map(r => ({ count: Number(r.count) || 0, pay: Number(r.pay) || 0, count_to: Number(r.count_to) || 0 })) : [],
            mega_w:     d.mega_w     || 1,
            mega_h:     d.mega_h     || 1,
          mega_sizes: (d.mega_sizes != null ? String(d.mega_sizes) : ''),   // v8.35 GAP-H1
            can_expand: !!d.can_expand,
            mult_values:  _normMultValues(d.mult_values),
            prize_values: _normPrizeValues(d.prize_values),
            is_wild:    !!d.is_wild,
            is_scatter: !!d.is_scatter,
            image:      (d.image != null && typeof d.image === 'string') ? d.image : null,  // v7.9 #4
          mode_scope: (d.mode_scope != null ? String(d.mode_scope) : ''),           // v8.3 D-12
          instance_mult: d.instance_mult === true,                                  // v8.7 D-14
          min_match: _normMinMatch(d.min_match), // P0-2
          group_id: (d.group_id != null ? String(d.group_id).trim() : ''), // P0-3
          wild_behavior: (d.wild_behavior != null ? String(d.wild_behavior).trim().toUpperCase() : ''), // 架構檢閱 #6
          };
          setSymbolReelCount(s, reelCount);
          symbols.push(s);
          swatchMap[s.id] = Array.isArray(d.swatch) ? [...d.swatch] : ['#DABA90', '#6a5230'];
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
